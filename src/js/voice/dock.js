// ---------- Voice mode's toolbar (the "voice dock") ----------
// A row (or a rail on either side, or floating) of shortcuts in voice mode, laid out in Settings → Characters →
// Voice mode toolbar: which actions, their order, labels and keys (settings.voiceDock, kept from 1.0). Every
// action goes through the 1.1 room system (dock-model.mjs): the behaviour engine walks the robot home, to a
// spot or to a thing (allowed by the thing's own rules); the camera, scene and roaming are the room's and the
// robot's own settings; clean stage hides everything but the picture.
//
// Keyboard: Tab reaches the toolbar, arrow keys move along it, Alt + arrow moves a button, Enter or Space
// presses it; menus open with Enter or Arrow down and close with Escape.
import { t } from "../i18n.js";
import { iconEl } from "../icons.js";
import { announce } from "../a11y.js";
import { getSettings, onSettings, updateSettings } from "../store.js";
import { robot } from "../robot/index.js";
import { newId } from "../room/model.mjs";
import * as M from "./dock-model.mjs";
import "./dock-settings.js";

const voiceMode = document.getElementById("voice-mode");
let el = null;
let menu = null;
let menuFor = null;
let pill = null;
let shown = false;
let layout = M.sanitizeDock(null);

const label = (m) => t(m.label);
const keyName = (code) => (code ? code.replace(/^Key|^Digit/, "") : "");
const room = () => robot.room;
const behaviour = () => robot.engine?.behaviour;

// ---------- Building it ----------
function build() {
  el = document.createElement("div");
  el.className = "voice-dock";
  el.id = "voice-dock";
  el.setAttribute("role", "toolbar");
  el.setAttribute("aria-label", t("Voice mode toolbar"));
  el.addEventListener("keydown", onToolbarKey);
  voiceMode.append(el);
  enableFloatingDrag();
  // Clean stage: everything but the picture is hidden; this pill (and H, or Escape) brings it back
  pill = document.createElement("div");
  pill.className = "voice-clean-pill";
  pill.hidden = true;
  const exit = document.createElement("button");
  exit.type = "button";
  exit.className = "btn small";
  exit.addEventListener("click", () => setCleanStage(false));
  pill.append(exit);
  voiceMode.append(pill);
}

function render() {
  if (!el) return;
  const focusedId = document.activeElement?.closest?.(".voice-dock-btn")?.dataset.module;
  el.className = `voice-dock pos-${layout.position}${layout.showLabels ? " with-labels" : ""}`;
  el.setAttribute("aria-orientation", layout.position === "left" || layout.position === "right" ? "vertical" : "horizontal");
  el.setAttribute("aria-label", t("Voice mode toolbar"));
  if (layout.position === "floating") {
    el.style.left = `${Math.min(window.innerWidth - 80, layout.floatingX)}px`;
    el.style.top = `${Math.min(window.innerHeight - 80, layout.floatingY)}px`;
  } else {
    el.style.left = "";
    el.style.top = "";
  }
  const byId = new Map(M.DOCK_MODULES.map((m) => [m.id, m]));
  const buttons = [];
  for (const id of layout.order) {
    const m = byId.get(id);
    if (!m || layout.visible[id] === false) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.className = `voice-dock-btn${m.robot ? " robot-only" : ""}`;
    b.dataset.module = id;
    b.draggable = layout.position !== "floating";
    b.tabIndex = -1;
    const text = document.createElement("span");
    text.className = "voice-dock-label";
    text.textContent = label(m);
    b.append(iconEl(m.icon), text);
    b.setAttribute("aria-label", label(m));
    const key = id === "mic_mute" ? "M" : keyName(layout.shortcuts[id]);
    b.title = key ? `${label(m)} (${key})` : label(m);
    if (key) b.setAttribute("aria-keyshortcuts", key);
    if (m.menu) {
      b.setAttribute("aria-haspopup", "menu");
      b.setAttribute("aria-expanded", "false");
    }
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      run(id, b);
    });
    b.addEventListener("dragstart", (e) => e.dataTransfer?.setData("text/plain", id));
    b.addEventListener("dragover", (e) => e.preventDefault());
    b.addEventListener("drop", (e) => {
      e.preventDefault();
      const from = e.dataTransfer?.getData("text/plain");
      if (!from || from === id) return;
      const order = layout.order.filter((x) => x !== from);
      order.splice(order.indexOf(id), 0, from);
      save({ ...layout, order, preset: "custom" });
    });
    buttons.push(b);
  }
  el.replaceChildren(...buttons);
  syncStates();
  const first = buttons.find((b) => b.dataset.module === focusedId) || buttons[0];
  if (first) first.tabIndex = 0;
  if (focusedId) first?.focus();
  pill.firstChild.textContent = layout.shortcuts.clean_stage ? t("Show the controls ({key})", { key: keyName(layout.shortcuts.clean_stage) }) : t("Show the controls");
}

// Which toggles are on (they follow the real state, wherever it was changed)
function syncStates() {
  if (!el) return;
  const s = getSettings();
  const pressed = {
    mic_mute: voiceMode.classList.contains("muted"),
    toggle_whiteboard: document.getElementById("voice-board-btn")?.getAttribute("aria-pressed") === "true",
    roam_toggle: s?.robot?.roam !== false,
    clean_stage: document.body.classList.contains("voice-clean-stage"),
  };
  for (const b of el.querySelectorAll(".voice-dock-btn")) {
    const id = b.dataset.module;
    if (id in pressed) {
      b.setAttribute("aria-pressed", String(pressed[id]));
      b.classList.toggle("is-on", pressed[id]);
    }
    if (id === "mic_mute") b.replaceChild(iconEl(pressed.mic_mute ? "speaker" : "mic"), b.firstChild);
  }
}

function visibleButtons() {
  return el ? [...el.querySelectorAll(".voice-dock-btn")].filter((b) => b.offsetParent !== null) : [];
}

// ---------- The actions ----------
function needRoom() {
  if (room() && behaviour()?.room) return true;
  announce(t("The robot isn't in a room yet."));
  return false;
}

function command(cmd, words) {
  if (!needRoom()) return;
  const res = behaviour().command(cmd);
  if (res?.ok) announce(words);
  else announce(res?.text || (res?.reason === "no_path" ? t("It can't get there from where it is.") : t("It can't do that now.")));
}

function run(id, anchor = null) {
  const m = M.DOCK_MODULES.find((x) => x.id === id);
  if (m?.menu) return openMenu(id, anchor || el?.querySelector(`[data-module="${id}"]`));
  closeMenu();
  if (id === "mic_mute" || id === "interrupt") document.dispatchEvent(new CustomEvent("friends:voice-action", { detail: { action: id } }));
  else if (id === "summon_home") command({ kind: "home" }, t("Going home"));
  else if (id === "toggle_whiteboard") document.getElementById("voice-board-btn")?.click();
  else if (id === "roam_toggle") {
    const on = getSettings()?.robot?.roam === false;
    updateSettings((s) => (s.robot.roam = on));
    announce(on ? t("It roams the room again") : t("It stays where it is"));
  } else if (id === "clean_stage") setCleanStage(!document.body.classList.contains("voice-clean-stage"));
  else if (id === "edit_room") import("../room/editor/open.js").then((mod) => mod.editRoom());
  else if (id === "open_studio") import("../robot/studio/studio.js").then((mod) => mod.openStudio());
  setTimeout(syncStates, 50);
}

function setCleanStage(on, { save: keep = true } = {}) {
  if (on === document.body.classList.contains("voice-clean-stage")) return;
  document.body.classList.toggle("voice-clean-stage", on);
  pill.hidden = !on;
  syncStates();
  if (keep) updateSettings((s) => (s.stageMode = { ...(s.stageMode || {}), cleanStage: on }));
  announce(on ? t("Clean stage: only the picture shows") : t("The controls are back"));
  if (on) pill.firstChild.focus();
  else el?.querySelector('[data-module="clean_stage"]')?.focus();
}

// ---------- Menus ----------
function menuItems(id) {
  const r = room();
  const s = getSettings();
  const say = (k, v) => t(k, v);
  if (id === "emotion_picker") return M.DOCK_MOODS.map(([mood, words]) => ({ text: t(words), pick: () => (robot.director.toolEvent({ mood }), announce(t(words))) }));
  if (!r) return [];
  if (id === "go_spot") {
    return M.spotItems(r).map((x) => ({ text: x.custom ? x.name : t(x.name), pick: () => command(x.kind === "home" ? { kind: "home" } : { kind: "spot", id: x.id }, t("Going to {name}", { name: x.custom ? x.name : t(x.name) })) }));
  }
  if (id === "quick_prop") {
    return M.propItems(r, { filming: Boolean(robot.engine?.look?.filming), privateMode: s?.privacy?.localOnly === true }).map((x) => {
      const name = x.custom ? x.name : t(x.name);
      return { text: name, pick: () => command({ kind: "asset", id: x.id, action: x.action, actor: "ai" }, t("Going to the {name}", { name })) };
    });
  }
  if (id === "camera_preset") {
    const active = M.activeOf(r, "camera");
    return M.cameraItems(r, say).map((x) => ({
      text: x.custom ? x.name || t("Shot") : t(x.name),
      checked: x.id === active,
      pick: () => {
        const doc = room();
        robot.setRoom(x.preset ? M.withPresetShot(doc, x.preset, newId) : { ...doc, defaultCamera: x.id });
        announce(t("Camera: {name}", { name: x.custom ? x.name || t("Shot") : t(x.name) }));
      },
    }));
  }
  if (id === "scene") {
    const active = M.activeOf(r, "scene");
    return M.sceneItems(r).map((x) => ({
      text: x.custom ? x.name : t(x.name),
      checked: x.id === active,
      pick: () => {
        robot.setRoom({ ...room(), activeScene: x.id });
        announce(t("Scene: {name}", { name: x.custom ? x.name : t(x.name) }));
      },
    }));
  }
  return [];
}

const EMPTY = () => ({ go_spot: t("No spots yet: add them in the Room Editor."), quick_prop: t("Nothing here it may use: set what it may do with each thing in the Room Editor."), camera_preset: t("The robot isn't in a room yet."), scene: t("The robot isn't in a room yet.") });

function openMenu(id, anchor) {
  if (menuFor === id) return closeMenu(true);
  closeMenu();
  const items = menuItems(id);
  menu = document.createElement("div");
  menu.className = "voice-dock-menu";
  menu.setAttribute("role", "menu");
  menu.id = "voice-dock-menu";
  menu.setAttribute("aria-label", anchor?.getAttribute("aria-label") || "");
  if (!items.length) {
    const none = document.createElement("p");
    none.className = "voice-dock-empty";
    none.textContent = EMPTY()[id] || "";
    menu.append(none);
  }
  for (const item of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "voice-dock-item";
    b.tabIndex = -1;
    b.setAttribute("role", "checked" in item ? "menuitemradio" : "menuitem");
    if ("checked" in item) b.setAttribute("aria-checked", String(Boolean(item.checked)));
    b.textContent = item.text;
    b.addEventListener("click", () => {
      closeMenu(true);
      item.pick();
    });
    menu.append(b);
  }
  menu.addEventListener("keydown", onMenuKey);
  voiceMode.append(menu);
  menuFor = id;
  anchor?.setAttribute("aria-expanded", "true");
  anchor?.setAttribute("aria-controls", menu.id);
  place(menu, anchor);
  (menu.querySelector('[aria-checked="true"]') || menu.querySelector(".voice-dock-item"))?.focus();
}

function place(box, anchor) {
  const r = anchor.getBoundingClientRect();
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  let x = r.left;
  let y = r.top - h - 8;
  // A rail opens its menus away from the edge it's on (left and right are mirrored in right-to-left languages)
  if (layout.position === "left" || layout.position === "right") [x, y] = [r.left > window.innerWidth / 2 ? r.left - w - 8 : r.right + 8, r.top];
  if (y < 8) y = r.bottom + 8;
  box.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, x))}px`;
  box.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, y))}px`;
}

function closeMenu(refocus = false) {
  if (!menu) return;
  const anchor = el?.querySelector(`[data-module="${menuFor}"]`);
  anchor?.setAttribute("aria-expanded", "false");
  anchor?.removeAttribute("aria-controls");
  menu.remove();
  menu = null;
  menuFor = null;
  if (refocus) anchor?.focus();
}

function onMenuKey(e) {
  const items = [...menu.querySelectorAll(".voice-dock-item")];
  const i = items.indexOf(document.activeElement);
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation(); // (Escape would end the conversation)
    closeMenu(true);
  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  } else if (e.key === "Home" || e.key === "End") {
    e.preventDefault();
    items[e.key === "Home" ? 0 : items.length - 1]?.focus();
  } else if (e.key === "Tab") closeMenu();
}

document.addEventListener("pointerdown", (e) => {
  if (menu && !menu.contains(e.target) && !e.target.closest?.(".voice-dock-btn")) closeMenu();
});

// ---------- Keyboard ----------
function onToolbarKey(e) {
  const btn = e.target.closest(".voice-dock-btn");
  if (!btn) return;
  const list = visibleButtons();
  const i = list.indexOf(btn);
  const vertical = el.getAttribute("aria-orientation") === "vertical";
  const rtl = document.documentElement.dir === "rtl" && !vertical;
  const back = vertical ? "ArrowUp" : rtl ? "ArrowRight" : "ArrowLeft";
  const fwd = vertical ? "ArrowDown" : rtl ? "ArrowLeft" : "ArrowRight";
  if (e.key !== back && e.key !== fwd && e.key !== "Home" && e.key !== "End" && !(e.key === "ArrowDown" && btn.hasAttribute("aria-haspopup"))) return;
  e.preventDefault();
  if (e.key === "ArrowDown" && btn.hasAttribute("aria-haspopup") && !vertical) return openMenu(btn.dataset.module, btn);
  if (e.altKey && (e.key === back || e.key === fwd)) {
    // Moves the button itself
    const id = btn.dataset.module;
    const next = M.moveModule(layout, id, e.key === fwd ? 1 : -1);
    if (next !== layout) {
      save(next);
      announce(t("{name} moved", { name: btn.getAttribute("aria-label") }));
    }
    return;
  }
  const j = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : (i + (e.key === fwd ? 1 : -1) + list.length) % list.length;
  for (const b of list) b.tabIndex = -1;
  list[j].tabIndex = 0;
  list[j].focus();
}

// The toolbar's own keys (Settings → Characters → Voice mode toolbar), only in voice mode and not while typing
document.addEventListener("keydown", (e) => {
  if (voiceMode.hidden || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
  if (e.key === "Escape" && document.body.classList.contains("voice-clean-stage")) {
    e.preventDefault();
    e.stopImmediatePropagation(); // the first Escape brings the controls back, it doesn't end the conversation
    setCleanStage(false);
    return;
  }
  const id = M.moduleForKey(layout, e.code);
  if (!id) return;
  const m = M.DOCK_MODULES.find((x) => x.id === id);
  if (m.robot && !voiceMode.classList.contains("robot-style")) return;
  e.preventDefault();
  run(id);
}, true);

// ---------- Floating: dragged by its edge (keyboard users pick a side in Settings) ----------
function enableFloatingDrag() {
  let start = null;
  el.addEventListener("pointerdown", (e) => {
    if (layout.position !== "floating" || e.target.closest("button")) return;
    start = { x: e.clientX - layout.floatingX, y: e.clientY - layout.floatingY };
    el.setPointerCapture?.(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (!start) return;
    layout.floatingX = Math.max(8, Math.min(window.innerWidth - 80, e.clientX - start.x));
    layout.floatingY = Math.max(8, Math.min(window.innerHeight - 60, e.clientY - start.y));
    el.style.left = `${layout.floatingX}px`;
    el.style.top = `${layout.floatingY}px`;
  });
  el.addEventListener("pointerup", () => {
    if (!start) return;
    start = null;
    save({ ...layout });
  });
}

// ---------- Saving and following the settings ----------
function save(next) {
  layout = M.sanitizeDock(next);
  updateSettings((s) => (s.voiceDock = JSON.parse(JSON.stringify(layout))));
  render();
}

onSettings((s) => {
  const next = M.sanitizeDock(s?.voiceDock);
  if (JSON.stringify(next) !== JSON.stringify(layout)) {
    layout = next;
    render();
  } else syncStates();
});

// Muting, the whiteboard button and roaming change elsewhere too
new MutationObserver(syncStates).observe(voiceMode, { attributes: true, attributeFilter: ["class"] });
const boardButton = document.getElementById("voice-board-btn");
if (boardButton) new MutationObserver(syncStates).observe(boardButton, { attributes: true, attributeFilter: ["aria-pressed"] });

// The tray's "clean stage" (desktop app)
document.addEventListener("friends:tray-action", (e) => {
  if (e.detail?.action === "toggle-clean-stage" && !voiceMode.hidden) run("clean_stage");
});

// The room's backdrop "Transparent": the page behind voice mode lets the desktop show through (a streaming
// app capturing the window keeps only the robot)
function syncTransparent() {
  document.body.classList.toggle("voice-transparent-stage", shown && room()?.backdrop?.layer === "transparent");
}

// 1.0's stage backdrop and camera preset (settings.stageMode) become the room's own, once
function adoptStage() {
  const s = getSettings();
  const r = room();
  if (!s?.stageMode || !r) return;
  const next = M.stageIntoRoom(r, s.stageMode, (k, v) => t(k, v), newId);
  if (!next) return;
  robot.setRoom(next);
  updateSettings((x) => (x.stageMode = { ...x.stageMode, backdrop: "full_room", cameraPreset: "wide_room" }));
}
document.addEventListener("friends:robot-room", () => {
  syncTransparent();
  adoptStage();
});
document.addEventListener("friends:language-ready", render);

export const voiceDock = {
  // Shown while voice mode is open (the robot's actions only with the Robot look)
  setVisible(on) {
    if (!el) build();
    shown = on;
    el.hidden = !on;
    syncTransparent();
    if (!on) {
      closeMenu();
      setCleanStage(false, { save: false });
    } else {
      render();
      if (getSettings()?.stageMode?.cleanStage) setCleanStage(true, { save: false });
    }
  },
  get shown() {
    return shown;
  },
  run,
};
