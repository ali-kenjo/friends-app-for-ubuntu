// ---------- The Room Editor ----------
// A full-screen mode over the app (or a compact overlay over voice mode, which keeps talking): the
// catalog and the outline on the left, the room in the middle, the inspector on the right, tools below.
// Every change is a step that can be undone, is shown at once and is saved a moment later.
import { robot } from "../../robot/index.js";
import { getSettings, updateSettings } from "../../store.js";
import { t, tp } from "../../i18n.js";
import { announce, trapModal, releaseModal } from "../../a11y.js";
import { confirmDialog } from "../../dialogs.js";
import { h, button } from "../../robot/studio/ui.js";
import { History } from "./history.mjs";
import * as ops from "./ops.mjs";
import { Viewport } from "./viewport.js";
import { catalogPanel, outlinePanel, inspectorPanel, newRoomDialog, roomPickerDialog, describeDialog } from "./panels.js";
import { cancelThumbs } from "./thumbs.js";
import { RobotTools } from "./robot-tools.js";
import { explain } from "../rules.mjs";
import { ACTIONS } from "../choices.mjs";
import { sanitizeRoom, roomSummary } from "../model.mjs";

// A log entry's words in the interface language: names and actions, and a refusal's reason
function translateVars(vars = {}) {
  const out = {};
  for (const [k, v] of Object.entries(vars)) {
    if (v && typeof v === "object" && v.reason) out[k] = explain({ ok: false, reason: v.reason }, { name: t(v.name || ""), action: v.action, say: (s, x) => t(s, x) });
    else if (k === "action") out[k] = t(ACTIONS.find((a) => a.id === v)?.label || String(v)).toLowerCase();
    else out[k] = typeof v === "string" ? t(v) : v;
  }
  return out;
}

export const DEFAULT_PREFS = {
  grid: 0.1,
  snapGrid: true,
  snapAngle: true,
  angle: 15,
  snapGuides: true,
  snapWalls: true,
  snapSurfaces: true,
  showMeasurements: true,
  handleSize: 1,
  orbitSpeed: 1,
  invertOrbit: false,
  units: "cm",
  matchColors: false,
  confirmDelete: true,
  autosave: true,
};

let editor = null;

export function isRoomEditorOpen() {
  return Boolean(editor);
}

// mode: "full" (from the Studio, Settings, the robot page, the palette) or "overlay" (over voice mode)
export async function openRoomEditor({ mode = "full" } = {}) {
  if (editor) return editor;
  const room = robot.room;
  if (!room) {
    announce(t("The room is still loading. Try again in a moment."));
    return null;
  }
  editor = new RoomEditor(room, mode);
  await editor.open();
  return editor;
}

export function closeRoomEditor() {
  editor?.close();
}

class RoomEditor {
  constructor(room, mode) {
    this.mode = mode;
    this.room = sanitizeRoom(JSON.parse(JSON.stringify(room)));
    this.opened = JSON.parse(JSON.stringify(this.room));
    this.selected = [];
    this.history = new History();
    this.clipboard = null;
    this.saveState = "saved";
    this.leftTab = "catalog";
    // The robot: selected (its own inspector), which of its tabs, a tool in the room, simulating
    this.robotSelected = false;
    this.robotTab = "where";
    this.routeTool = null;
    this.simulating = false;
    this.sim = { command: (cmd) => this.simCommand(cmd) };
  }

  prefs() {
    return { ...DEFAULT_PREFS, ...(getSettings()?.robot?.editor || {}) };
  }

  setPref(key, value) {
    updateSettings((s) => (s.robot.editor = { ...(s.robot.editor || {}), [key]: value }));
    this.refreshTop();
  }

  // ---------- Opening and closing ----------
  async open() {
    this.build();
    document.body.append(this.el);
    this.el.hidden = false;
    this.vp = new Viewport({
      engine: null,
      host: this.stage,
      getRoom: () => this.room,
      commit: (room, label, opts) => this.commit(room, label, opts),
      selection: () => this.selected,
      select: (ids) => this.select(ids),
      prefs: () => this.prefs(),
      announce: (text) => this.say(text),
      onWarn: (text, accept, reject) => this.warn(text, accept, reject),
      onHint: (text, e) => this.hint(text, e),
      say: (s, v) => t(s, v),
    });
    // The robot's engine draws here now (above voice mode), with the editor's own camera
    robot.host("editor", this.stage, { priority: 50, editorView: this.vp.editorView, roam: false, interactive: false, world: true, shot: "wide" });
    robot.show("editor", true);
    // Straight after the page loads the engine may still be on its way
    await robot.ready().catch(() => {});
    if (!robot.engine) {
      announce(t("The room editor needs 3D drawing (WebGL), which isn't available here."));
      this.vp = null;
      return this.close();
    }
    this.vp.engine = robot.engine;
    this.vp.attach();
    this.tools = new RobotTools(this.vp, this);
    this.vp.ctx.tools = this.tools;
    this.tools.attach();
    this.onKey = (e) => this.key(e);
    this.el.addEventListener("keydown", this.onKey);
    this.onSaved = () => this.setSaveState("saved");
    document.addEventListener("friends:robot-room-saved", this.onSaved);
    if (this.mode === "full") trapModal(this.el, { initial: ".re-name" });
    this.refresh();
    this.say(t("Room editor open. {name}. Tab moves between the catalog, the room and the inspector.", { name: this.room.name }));
  }

  close() {
    if (!this.el) return;
    this.flush();
    this.saveThumb();
    cancelThumbs();
    this.stopSim();
    this.tools?.detach();
    this.vp?.detach();
    robot.show("editor", false);
    robot.unhost("editor");
    this.el.removeEventListener("keydown", this.onKey);
    document.removeEventListener("friends:robot-room-saved", this.onSaved);
    if (this.mode === "full") releaseModal(this.el);
    this.el.remove();
    editor = null;
    document.dispatchEvent(new CustomEvent("friends:room-editor-closed"));
  }

  // ---------- Changes ----------
  // Every change goes through here: it becomes a step (or joins the drag it belongs to), is shown and saved
  commit(room, label = t("Change"), { coalesce = null, replace = false } = {}) {
    const clean = room;
    if (!replace || coalesce) this.history.push(label, this.room, clean, { coalesce });
    this.room = clean;
    this.selected = this.selected.filter((id) => clean.assets.some((a) => a.id === id));
    this.setSaveState("saving");
    robot.setRoom(clean, { save: this.prefs().autosave });
    if (!this.prefs().autosave) this.setSaveState("unsaved");
    this.refresh({ light: Boolean(coalesce) });
  }

  // The room's picture for the room picker and the Studio (16:9, from the editor's view, without handles)
  saveThumb() {
    const e = robot.engine;
    if (!e?.canvas?.width || !this.vp || this.vp.view === "eyes") return;
    try {
      this.vp.overlay.visible = false;
      e.renderNow();
      const src = e.canvas;
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = 180;
      const w = Math.min(src.width, (src.height * 16) / 9);
      const hgt = (w * 9) / 16;
      c.getContext("2d").drawImage(src, (src.width - w) / 2, (src.height - hgt) / 2, w, hgt, 0, 0, 320, 180);
      const thumb = c.toDataURL("image/jpeg", 0.8);
      fetch(`/api/rooms/${encodeURIComponent(this.room.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room: this.room, thumb }) }).catch(() => {});
    } catch {
      // A lost context or a tainted canvas: the room keeps its old picture
    } finally {
      this.vp.overlay.visible = true;
    }
  }

  flush() {
    if (this.saveState !== "saved") robot.setRoom(this.room, { save: true });
  }

  undo() {
    const r = this.history.undo(this.room);
    if (!r) return;
    this.room = r.room;
    robot.setRoom(this.room);
    this.selected = this.selected.filter((id) => this.room.assets.some((a) => a.id === id));
    this.say(t("Undone: {what}", { what: r.label }));
    this.refresh();
  }

  redo() {
    const r = this.history.redo(this.room);
    if (!r) return;
    this.room = r.room;
    robot.setRoom(this.room);
    this.say(t("Redone: {what}", { what: r.label }));
    this.refresh();
  }

  select(ids) {
    if (ids.length) this.robotSelected = false;
    this.selected = [...new Set(ids)].filter((id) => this.room.assets.some((a) => a.id === id));
    this.refresh({ light: true });
    if (this.selected.length === 1) {
      const a = this.room.assets.find((x) => x.id === this.selected[0]);
      this.say(t("{name} selected", { name: a.name || t(ops.defOf(a)?.label || a.type) }));
    }
  }

  // ---------- The robot ----------
  selectRobot() {
    this.selected = [];
    this.robotSelected = true;
    this.refresh();
    this.say(t("The robot selected. Drag it to move its home; its ring turns it."));
  }

  // tool: "spot" | "zone-rect" | "zone-circle" | "zone-poly" | "route:<id>" | null
  robotTool(tool) {
    if (!this.tools) return;
    this.robotSelected = true;
    this.routeTool = tool?.startsWith("route:") ? tool.slice(6) : null;
    if (tool?.startsWith("zone") && this.vp.view !== "top") this.setView("top");
    this.tools.setTool(tool);
    this.refresh();
    const words = { spot: t("Click in the room where the spot goes."), "zone-rect": t("Drag in the plan to draw the zone."), "zone-circle": t("Drag from the middle of the zone outwards."), "zone-poly": t("Click its corners; Enter or a click on the first corner closes it.") };
    if (tool) this.say(tool.startsWith("route:") ? t("Click in the room to add points to the route; Escape when done.") : words[tool]);
  }

  // The room made from your words: keep it, or undo it (it's one step of the history either way)
  showDescribed(out) {
    this.describedBar?.remove();
    const close = () => {
      this.describedBar?.remove();
      this.describedBar = null;
    };
    const keep = button(t("Keep it"), close, { primary: true, icon: "check" });
    const undo = button(t("Undo"), () => {
      this.undo();
      close();
    }, { icon: "undo" });
    const skipped = out.errors?.length ? tp("{n} suggestion didn't fit and was left out.", "{n} suggestions didn't fit and were left out.", out.errors.length) : "";
    this.describedBar = h("div", { class: "re-described", role: "status" }, h("span", { text: [t("Made from your words: {n} things.", { n: out.assets.length }), skipped].filter(Boolean).join(" ") }), keep, undo);
    this.stage.append(this.describedBar);
    keep.focus();
  }

  // ---------- Simulate: the behaviour runs in the editor, with its path, the nav grid and why ----------
  toggleSim(on = !this.simulating) {
    if (on) this.startSim();
    else this.stopSim();
  }

  startSim() {
    const e = robot.engine;
    if (!e || this.simulating) return;
    this.simulating = true;
    this.robotSelected = true;
    this.simLog.replaceChildren();
    this.simPanel.hidden = false;
    e.behaviour.onLog = (entry) => {
      const line = h("div", { text: `${entry.t.toFixed(1)} s · ${t(entry.key, translateVars(entry.vars))}` });
      this.simLog.append(line);
      while (this.simLog.children.length > 40) this.simLog.firstElementChild.remove();
      this.simLog.scrollTop = this.simLog.scrollHeight;
    };
    robot.options("editor", { behave: true, behaveSpeed: Number(this.simSpeed.value) || 1 });
    const loop = () => {
      if (!this.simulating) return;
      this.tools.showSim(e.behaviour.out.path, e.behaviour.grid);
      this.simRaf = requestAnimationFrame(loop);
    };
    loop();
    this.simBtn.setAttribute("aria-pressed", "true");
    this.say(t("Simulating: the robot does what it would in voice mode."));
    this.refresh();
  }

  stopSim() {
    if (!this.simulating) return;
    this.simulating = false;
    cancelAnimationFrame(this.simRaf);
    const e = robot.engine;
    if (e) e.behaviour.onLog = null;
    robot.options("editor", { behave: false });
    this.tools?.hideSim();
    this.simPanel.hidden = true;
    this.simBtn.setAttribute("aria-pressed", "false");
    this.say(t("Simulation stopped"));
    this.refresh();
  }

  simCommand(cmd) {
    const e = robot.engine;
    if (!e || !this.simulating) return;
    const res = e.behaviour.command(cmd);
    if (!res.ok && res.text) this.say(res.text);
  }

  setSaveState(state) {
    this.saveState = state;
    if (!this.saveEl) return;
    this.saveEl.textContent = { saved: t("Saved"), saving: t("Saving…"), unsaved: t("Not saved") }[state];
    this.saveEl.dataset.state = state;
  }

  say(text) {
    if (!text) return;
    this.live.textContent = "";
    requestAnimationFrame(() => (this.live.textContent = text));
  }

  hint(text, e) {
    this.tip.hidden = !text;
    this.tip.textContent = text || "";
    if (text && e) {
      const r = this.stage.getBoundingClientRect();
      this.tip.style.insetInlineStart = "auto";
      this.tip.style.left = `${Math.min(r.width - 220, e.clientX - r.left + 16)}px`;
      this.tip.style.top = `${Math.max(8, e.clientY - r.top - 34)}px`;
    }
  }

  async warn(text, accept, reject) {
    const ok = await confirmDialog({ title: t("Place it anyway?"), message: text, confirm: t("Place anyway"), cancel: t("Cancel") });
    if (ok) accept();
    else reject?.();
  }

  // ---------- Keys (docs/release-1.1: §5.5) ----------
  key(e) {
    // A control that used the key itself (arrows in tabs, tiles and the outline) keeps it
    if (e.defaultPrevented) return;
    const tag = e.target.tagName;
    const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    if (this.tools?.key(e)) {
      this.routeTool = null;
      this.refresh();
      return e.preventDefault();
    }
    if (e.key === "Escape") {
      if (this.robotSelected && !this.vp.measure && !this.vp.ghost) {
        this.robotSelected = false;
        this.refresh();
        e.preventDefault();
        return;
      }
      if (this.vp.measure) {
        this.toggleMeasure(false);
      } else if (this.vp.ghost) {
        this.vp.cancelPlacing();
        this.say(t("Placing cancelled"));
      } else if (this.selected.length) this.select([]);
      else this.close();
      e.preventDefault();
      return;
    }
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      return e.shiftKey ? this.redo() : this.undo();
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      return this.redo();
    }
    if (typing) return;
    const sel = this.selected;
    const step = e.shiftKey ? 0.1 : 0.01;
    // Arrow keys move on screen: left/right across the view, up/down away from and towards you
    const yaw = this.vp.view === "top" ? 0 : this.vp.orbit.yaw;
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (dirs[e.key] && sel.length && !mod) {
      e.preventDefault();
      const [sx, sz] = dirs[e.key];
      const dx = (sx * Math.cos(yaw) + sz * Math.sin(yaw)) * step;
      const dz = (-sx * Math.sin(yaw) + sz * Math.cos(yaw)) * step;
      const next = ops.nudge(this.room, sel, Math.round(dx * 1000) / 1000, Math.round(dz * 1000) / 1000);
      this.commit(next, t("Move"), { coalesce: `key-${e.key}` });
      this.say(ops.moveWords(next, sel[0], dx, dz, (s, v) => t(s, v)));
      return;
    }
    if (!sel.length && !mod && !["a"].includes(e.key.toLowerCase())) return;
    const k = e.key.toLowerCase();
    if (mod && k === "a") {
      e.preventDefault();
      return this.select(this.room.assets.filter((a) => !a.hidden).map((a) => a.id));
    }
    if (mod && k === "d") {
      e.preventDefault();
      const r = ops.duplicate(this.room, sel);
      this.commit(r.room, t("Duplicate"));
      return this.select(r.ids);
    }
    if (mod && k === "c") {
      this.clipboard = ops.copy(this.room, sel);
      try {
        localStorage.setItem("friends.roomClipboard", JSON.stringify(this.clipboard));
      } catch {}
      return this.say(t("Copied"));
    }
    if (mod && k === "v") {
      let clip = this.clipboard;
      try {
        clip ||= JSON.parse(localStorage.getItem("friends.roomClipboard") || "null");
      } catch {}
      if (!clip) return;
      const r = ops.paste(this.room, clip, [0.3, 0, 0.3]);
      this.commit(r.room, t("Paste"));
      return this.select(r.ids);
    }
    if (mod && k === "g") {
      e.preventDefault();
      const r = ops.group(this.room, sel);
      this.commit(r.room, t("Group"));
      return this.say(t("Grouped"));
    }
    if (mod) return;
    if (k === "q" || k === "e") {
      const by = (k === "q" ? 1 : -1) * (e.shiftKey ? 1 : 15);
      this.commit(sel.length > 1 ? ops.rotateGroup(this.room, sel, by) : ops.rotateBy(this.room, sel, by), t("Turn"), { coalesce: `key-${k}` });
      return this.say(t("Turned {deg}°", { deg: by }));
    }
    if (k === "r") return this.commit(sel.length > 1 ? ops.rotateGroup(this.room, sel, 90) : ops.rotateBy(this.room, sel, 90), t("Turn"));
    if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      return this.commit(ops.nudge(this.room, sel, 0, 0, (e.key === "PageUp" ? 1 : -1) * (e.shiftKey ? 0.1 : 0.02)), t("Lift"), { coalesce: "key-lift" });
    }
    if (e.key === "Delete" || e.key === "Backspace") return this.removeSelected();
    if (k === "h") return this.commit(ops.updateMany(this.room, sel, (a) => ({ hidden: !a.hidden })), t("Hide"));
    if (k === "l") return this.commit(ops.updateMany(this.room, sel, (a) => ({ locked: !a.locked })), t("Lock"));
    if (k === "f") return this.vp.focus(sel);
  }

  async removeSelected() {
    const sel = this.selected;
    if (!sel.length) return;
    if (this.prefs().confirmDelete && sel.length > 1) {
      const ok = await confirmDialog({ title: tp("Remove {n} thing?", "Remove {n} things?", sel.length), message: t("You can undo this."), confirm: t("Remove"), danger: true });
      if (!ok) return;
    }
    const names = sel.map((id) => this.room.assets.find((a) => a.id === id)).map((a) => a?.name || t(ops.defOf(a)?.label || "")).join(", ");
    this.commit(ops.removeAssets(this.room, sel), t("Remove"));
    this.say(t("Removed: {names}", { names }));
  }

  // ---------- Rooms (the room menu) ----------
  async switchTo(id) {
    this.flush();
    this.saveThumb();
    await updateSettings((s) => (s.robot.room = { layoutId: id }));
    const res = await fetch(`/api/rooms/${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const doc = await res.json();
    this.room = doc;
    this.opened = JSON.parse(JSON.stringify(doc));
    this.history.clear();
    this.selected = [];
    robot.setRoom(doc, { save: false });
    this.vp.frameRoom();
    this.refresh();
    this.say(t("Now editing {name}", { name: doc.name }));
  }

  async roomAction(action) {
    if (action === "describe") {
      const out = await describeDialog({ roomId: this.room.id });
      if (!out) return;
      this.selected = [];
      this.robotSelected = false;
      this.commit({ ...this.room, assets: out.assets }, t("Describe a room"));
      this.showDescribed(out);
      return;
    }
    if (action === "rooms") {
      const id = await roomPickerDialog({ current: this.room.id });
      if (id) await this.switchTo(id);
      return;
    }
    if (action === "new" || action === "templates") {
      const choice = await newRoomDialog({ current: this.room, tab: action === "templates" ? "template" : "empty" });
      if (!choice) return;
      const res = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(choice) });
      const doc = await res.json();
      if (!res.ok) return this.say(doc.error || t("The room couldn't be made"));
      return this.switchTo(doc.id);
    }
    if (action === "duplicate" || action === "save_as") {
      this.flush();
      // "Save as…" keeps this room as it is now under a new name, and goes on in the copy
      const name = action === "save_as" ? t("{name} (snapshot)", { name: this.room.name }) : "";
      const res = await fetch(`/api/rooms/${encodeURIComponent(this.room.id)}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name || "" }) });
      const doc = await res.json();
      if (res.ok) return this.switchTo(doc.id);
      return this.say(doc.error);
    }
    if (action === "export") {
      this.flush();
      const a = h("a", { href: `/api/rooms/${encodeURIComponent(this.room.id)}/export`, download: "" });
      document.body.append(a);
      a.click();
      a.remove();
      return;
    }
    if (action === "import") {
      const input = h("input", { type: "file", accept: ".friends-room,.json,.robot-room.json,application/zip,application/json" });
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        const res = await fetch("/api/rooms/import", { method: "POST", body: await file.arrayBuffer() });
        const doc = await res.json();
        if (!res.ok) return this.say(doc.error || t("That file isn't a Friends room."));
        this.switchTo(doc.id);
      });
      input.click();
      return;
    }
    if (action === "revert") {
      const ok = await confirmDialog({ title: t("Go back to how the room was?"), message: t("Every change since you opened the editor is undone."), confirm: t("Revert") });
      if (ok) this.commit(JSON.parse(JSON.stringify(this.opened)), t("Revert"));
      return;
    }
    if (action === "delete") {
      const ok = await confirmDialog({ title: t("Delete {name}?", { name: this.room.name }), message: t("The room and its settings go. Things you made in other rooms stay."), confirm: t("Delete"), danger: true });
      if (!ok) return;
      const id = this.room.id;
      const list = (await (await fetch("/api/rooms")).json()).rooms.filter((r) => r.id !== id);
      let next = list[0]?.id;
      if (!next) next = (await (await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: "studio" }) })).json()).id;
      await this.switchTo(next);
      await fetch(`/api/rooms/${encodeURIComponent(id)}`, { method: "DELETE" });
    }
  }

  // ---------- Building the page ----------
  build() {
    this.el = h("div", { id: "room-editor", class: `room-editor ${this.mode}`, role: "dialog", "aria-modal": this.mode === "full" ? "true" : "false", "aria-label": t("Room editor"), hidden: true });
    // Top bar
    const name = h("input", { class: "field re-name", type: "text", maxlength: 60, "aria-label": t("Room name"), value: this.room.name });
    name.addEventListener("change", () => this.commit({ ...this.room, name: name.value.trim().slice(0, 60) || this.room.name }, t("Rename")));
    this.nameEl = name;
    const menu = h("select", { class: "field re-menu", "aria-label": t("Room menu") }, ...[["", t("Room…")], ["rooms", t("Your rooms…")], ["new", t("New room…")], ["duplicate", t("Duplicate")], ["templates", t("Templates…")], ...(getSettings()?.robot?.ai?.describe === false ? [] : [["describe", t("Describe a room…")]]), ["save_as", t("Save as…")], ["import", t("Import…")], ["export", t("Export…")], ["revert", t("Revert to when I opened it")], ["delete", t("Delete room")]].map(([v, l]) => h("option", { value: v, text: l })));
    menu.addEventListener("change", () => {
      const v = menu.value;
      menu.value = "";
      if (v) this.roomAction(v);
    });
    this.undoBtn = button(t("Undo"), () => this.undo(), { icon: "undo", title: t("Undo (Ctrl+Z)") });
    this.redoBtn = button(t("Redo"), () => this.redo(), { icon: "repeat", title: t("Redo (Ctrl+Shift+Z)") });
    const views = h("div", { class: "re-views", role: "radiogroup", "aria-label": t("View") });
    this.viewButtons = {};
    for (const [id, label] of [["perspective", t("Perspective")], ["top", t("Plan from above")], ["eyes", t("Robot's eyes")], ["shot", t("Camera shot")]]) {
      const b = h("button", { type: "button", class: "re-chip", role: "radio", "aria-checked": "false", "data-view": id, text: label });
      b.addEventListener("click", () => this.setView(id));
      views.append(b);
      this.viewButtons[id] = b;
    }
    this.shotAspect = h("select", { class: "field re-aspect", "aria-label": t("Picture shape") }, h("option", { value: "16x9", text: "16:9" }), h("option", { value: "9x16", text: "9:16" }));
    this.shotAspect.addEventListener("change", () => this.setView("shot"));
    this.shotAspect.hidden = true;
    this.undoBtn.classList.add("re-icon-narrow");
    this.redoBtn.classList.add("re-icon-narrow");
    this.snapMenu = this.buildSnapMenu();
    this.saveEl = h("span", { class: "re-saved", role: "status", text: t("Saved") });
    const done = button(t("Done"), () => this.close(), { primary: true, icon: "check" });
    const top = h("header", { class: "re-top" }, h("div", { class: "re-top-start" }, name, menu, this.undoBtn, this.redoBtn), h("div", { class: "re-top-mid" }, views, this.shotAspect), h("div", { class: "re-top-end" }, this.snapMenu, this.saveEl, done));
    // Left: catalog and outline
    this.catalog = catalogPanel(this);
    this.outline = outlinePanel(this);
    const tabs = h("div", { class: "re-tabs", role: "tablist", "aria-label": t("Things") });
    const tabCatalog = h("button", { type: "button", role: "tab", id: "re-tab-catalog", "aria-controls": "re-panel-catalog", class: "re-tab", text: t("Catalog") });
    const tabOutline = h("button", { type: "button", role: "tab", id: "re-tab-outline", "aria-controls": "re-panel-outline", class: "re-tab", text: t("In the room") });
    const setTab = (which) => {
      this.leftTab = which;
      tabCatalog.setAttribute("aria-selected", String(which === "catalog"));
      tabOutline.setAttribute("aria-selected", String(which === "outline"));
      tabCatalog.tabIndex = which === "catalog" ? 0 : -1;
      tabOutline.tabIndex = which === "outline" ? 0 : -1;
      this.catalog.el.hidden = which !== "catalog";
      this.outline.el.hidden = which !== "outline";
    };
    tabCatalog.addEventListener("click", () => setTab("catalog"));
    tabOutline.addEventListener("click", () => setTab("outline"));
    tabs.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        setTab(this.leftTab === "catalog" ? "outline" : "catalog");
        (this.leftTab === "catalog" ? tabCatalog : tabOutline).focus();
      }
    });
    tabs.append(tabCatalog, tabOutline);
    this.catalog.el.id = "re-panel-catalog";
    this.catalog.el.setAttribute("role", "tabpanel");
    this.catalog.el.setAttribute("aria-labelledby", "re-tab-catalog");
    this.outline.el.id = "re-panel-outline";
    this.outline.el.setAttribute("role", "tabpanel");
    this.outline.el.setAttribute("aria-labelledby", "re-tab-outline");
    const left = h("aside", { class: "re-left", "aria-label": t("Catalog and outline") }, tabs, this.catalog.el, this.outline.el);
    setTab("catalog");
    // Middle: the room
    this.stage = h("div", { class: "re-stage", tabindex: "0", role: "application", "aria-label": t("The room. Arrow keys move the selected thing, Q and E turn it, Delete removes it.") });
    this.tip = h("div", { class: "re-tip", role: "status", hidden: true });
    this.frame = h("div", { class: "re-frame", hidden: true, "aria-hidden": "true" });
    this.stage.append(this.tip, this.frame);
    // Right: the inspector
    this.inspector = inspectorPanel(this);
    const right = h("aside", { class: "re-right", "aria-label": t("Inspector") }, this.inspector.el);
    // Bottom: tools and hints
    this.hintsEl = h("p", { class: "re-hints" });
    this.measureBtn = button(t("Measure"), () => this.toggleMeasure(!this.vp.measure), { icon: "ruler" });
    this.measureBtn.setAttribute("aria-pressed", "false");
    this.simBtn = button(t("Simulate"), () => this.toggleSim(), { icon: "play", title: t("Run what the robot would do, with its path and why") });
    this.simBtn.setAttribute("aria-pressed", "false");
    this.simSpeed = h("select", { class: "field re-sim-speed", "aria-label": t("Simulation speed") }, h("option", { value: "1", text: "1×" }), h("option", { value: "5", text: "5×" }));
    this.simSpeed.addEventListener("change", () => this.simulating && robot.options("editor", { behaveSpeed: Number(this.simSpeed.value) }));
    this.simLog = h("div", { class: "re-simlog", role: "log", "aria-label": t("What the robot decided") });
    this.simPanel = h("div", { class: "re-simpanel", hidden: true }, h("div", { class: "re-simpanel-head" }, h("span", { text: t("What it decided, and why") }), this.simSpeed, button(t("Stop"), () => this.stopSim(), { icon: "stop" })), this.simLog);
    this.stage.append(this.simPanel);
    const bottom = h("footer", { class: "re-bottom" }, h("div", { class: "re-tools", role: "toolbar", "aria-label": t("Tools") }, button(t("Select"), () => this.say(t("Select: click a thing, Shift-click to add more")), { icon: "target" }), button(t("Frame the room"), () => this.vp.frameRoom(), { icon: "eye" }), this.measureBtn, this.simBtn, button(t("Describe the room"), () => this.describe(), { icon: "chat" }), button(t("Plan as a picture"), () => this.exportPlan(), { icon: "image" })), this.hintsEl);
    this.live = h("div", { class: "sr-only", "aria-live": "polite" });
    this.el.append(top, h("div", { class: "re-body" }, left, this.stage, right), bottom, this.live);
  }

  buildSnapMenu() {
    const box = h("details", { class: "re-snap" });
    const p = this.prefs();
    const toggleRow = (key, label) => {
      const input = h("input", { type: "checkbox", class: "toggle" });
      input.checked = Boolean(p[key]);
      input.addEventListener("change", () => this.setPref(key, input.checked));
      return h("label", { class: "rs-toggle" }, h("span", { class: "rs-label", text: label }), input);
    };
    const select = (key, label, list, fmt) => {
      const s = h("select", { class: "field", "aria-label": label }, ...list.map((v) => h("option", { value: String(v), text: fmt(v) })));
      s.value = String(p[key]);
      s.addEventListener("change", () => this.setPref(key, Number(s.value)));
      return h("label", { class: "re-snap-row" }, h("span", { text: label }), s);
    };
    box.append(
      h("summary", { class: "btn small", text: t("Snapping") }),
      h("div", { class: "re-snap-body" },
        toggleRow("snapGrid", t("Snap to the grid")),
        select("grid", t("Grid size"), [0.05, 0.1, 0.25, 0.5], (v) => t("{n} cm", { n: Math.round(v * 100) })),
        toggleRow("snapAngle", t("Snap angles")),
        select("angle", t("Angle step"), [15, 45, 90], (v) => `${v}°`),
        toggleRow("snapGuides", t("Guides to other things")),
        toggleRow("snapWalls", t("Against walls")),
        toggleRow("snapSurfaces", t("Middle of surfaces")),
        toggleRow("showMeasurements", t("Show distances")),
        toggleRow("matchColors", t("New things match the room's colors")),
        h("p", { class: "rs-hint", text: t("Hold Ctrl while dragging to place freely.") }),
      ),
    );
    return box;
  }

  setView(view) {
    this.vp.setView(view);
    for (const [id, b] of Object.entries(this.viewButtons)) b.setAttribute("aria-checked", String(id === view));
    this.shotAspect.hidden = view !== "shot";
    // The shot preview: the engine frames the robot as voice mode does, inside the picture's shape
    robot.options("editor", { editorView: view === "shot" ? null : this.vp.editorView, shot: view === "shot" ? "medium" : "wide", shotAspect: view === "shot" ? (this.shotAspect.value === "9x16" ? 9 / 16 : 16 / 9) : null });
    this.frame.hidden = view !== "shot";
    this.frame.dataset.aspect = this.shotAspect.value;
    this.say({ perspective: t("Perspective view"), top: t("Plan from above"), eyes: t("Through the robot's eyes"), shot: t("How the camera sees it") }[view]);
  }

  toggleMeasure(on) {
    if (on) this.vp.startMeasuring();
    else if (this.vp.stopMeasuring()) this.say(t("Measuring stopped"));
    this.measureBtn.setAttribute("aria-pressed", String(Boolean(on)));
  }

  // The room in words: for screen readers, and for anyone who wants a list
  describe() {
    const say = (k, v) => t(k, v);
    const sum = roomSummary(this.room, { detail: "names", say, nameOf: (a) => a.name || t(ops.defOf(a)?.label || a.type) });
    const head = t("{name}: {w} × {d} m, {n}.", { name: this.room.name, w: this.room.size.w.toFixed(1), d: this.room.size.d.toFixed(1), n: tp("{n} thing", "{n} things", sum.items.length) });
    const back = h("div", { class: "modal-backdrop re-new" });
    const box = h("div", { class: "modal re-new-box", role: "dialog", "aria-modal": "true", "aria-labelledby": "re-describe-title" });
    const close = () => {
      back.remove();
      this.stage.focus();
    };
    const list = h("ul", { class: "re-describe" }, ...sum.text.split("; ").filter(Boolean).map((line) => h("li", { text: line })));
    box.append(h("h2", { id: "re-describe-title", text: t("The room in words") }), h("p", { text: head }), list, h("div", { class: "rs-actions" }, button(t("Close"), close, { primary: true })));
    box.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    });
    back.append(box);
    document.body.append(back);
    box.querySelector("button")?.focus();
  }

  // A picture of the plan from above, with the room's size written on it
  async exportPlan() {
    const prev = this.vp.view;
    this.setView("top");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    robot.engine.renderNow();
    const src = robot.engine.canvas;
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height + 60;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0);
    ctx.fillStyle = "#222222";
    ctx.font = "600 22px system-ui, sans-serif";
    ctx.fillText(`${this.room.name} · ${this.room.size.w.toFixed(2)} × ${this.room.size.d.toFixed(2)} m`, 20, src.height + 38);
    const a = h("a", { href: c.toDataURL("image/png"), download: `${this.room.name.replace(/[^\w-]+/g, "_") || "room"}-plan.png` });
    document.body.append(a);
    a.click();
    a.remove();
    this.setView(prev);
  }

  // ---------- Keeping the panels in step ----------
  refreshTop() {
    this.undoBtn.disabled = !this.history.canUndo;
    this.redoBtn.disabled = !this.history.canRedo;
    this.undoBtn.title = this.history.canUndo ? t("Undo: {what}", { what: this.history.undoLabel }) : t("Undo (Ctrl+Z)");
    this.redoBtn.title = this.history.canRedo ? t("Redo: {what}", { what: this.history.redoLabel }) : t("Redo (Ctrl+Shift+Z)");
    if (document.activeElement !== this.nameEl) this.nameEl.value = this.room.name;
    for (const [id, b] of Object.entries(this.viewButtons)) b.setAttribute("aria-checked", String(id === this.vp?.view));
  }

  refresh({ light = false } = {}) {
    this.refreshTop();
    this.tools?.sync();
    this.el.classList.toggle("has-selection", this.selected.length > 0);
    this.vp?.syncSelection({ focused: document.activeElement === this.stage });
    this.outline.refresh();
    if (!light || this.selected.length <= 1) this.inspector.refresh();
    this.hintsEl.textContent = this.selected.length ? t("Q/E turn (Shift: 1°) · R +90° · arrows move 1 cm (Shift: 10 cm) · PgUp/PgDn lift · Ctrl+D duplicate · Del remove · H hide · L lock · F focus · hold Ctrl while dragging: no snapping") : t("Drag a thing from the catalog into the room, or click it to place it in view · right-drag pans · wheel zooms");
  }
}
