// ---------- The robot's window on the robot page ----------
// The robot where you work: its live 3D body, what it is saying, quick actions that fit its role, a box to ask in,
// and the things it can make for you. It floats over the board; you put it where you like and size it as you like.
import { h } from "../h.js";
import { t } from "../i18n.js";
import { announce } from "../a11y.js";
import { getSettings, updateSettings } from "../store.js";
import { robot } from "../robot/index.js";
import { askFromBoard, stopReply } from "../chat.js";
import { characterName } from "../characters.js";
import { activeRole, allRoles, roleChips, AUDIENCES, PACES, CHALLENGES } from "../robot/roles.mjs";
import { WINDOWS } from "./geometry.mjs";
import { FloatingWindow } from "./float.js";
import { STUDIO } from "./studio.mjs";
import { itemLabel } from "./model.mjs";
import { wbIcon } from "./wb-icons.js";
import { popover, menu, selectField, field } from "./controls.js";
import { saveWindow } from "./windows.js";
import { setWb } from "./inspector.js";

const wbSettings = () => getSettings()?.whiteboard || {};

export const FACE = '<svg class="face-mini" viewBox="0 0 24 24" aria-hidden="true"><rect class="face-shell" x="1" y="3" width="22" height="18" rx="7"/><rect class="face-screen" x="3.6" y="5.6" width="16.8" height="12.8" rx="5"/><rect class="face-eye" x="7.6" y="8.6" width="2.8" height="5.4" rx="1.4"/><rect class="face-eye" x="13.6" y="8.6" width="2.8" height="5.4" rx="1.4"/><path class="face-mouth" d="M10.2 15.4q1.8 1.2 3.6 0"/></svg>';

export const roleName = (role) => (role.custom ? role.name : t(role.name));

// Changes what the robot is to you; the voice conversation is told (and the next reply follows it)
export function chooseRole(id) {
  updateSettings((s) => {
    s.roles = { ...(s.roles || {}), active: id };
  });
  document.dispatchEvent(new CustomEvent("friends:role", { detail: { id } }));
  const role = activeRole(getSettings().roles);
  announce(t("{name} is now in the role “{role}”", { name: characterName(), role: roleName(role) }));
}

// The picker: every role, and what to focus on
export function openRolePicker(anchor, { onChange = null } = {}) {
  return popover(anchor, (close) => {
    const roles = getSettings().roles || {};
    const current = activeRole(roles).id;
    const grid = h("div", { class: "rw-roles", role: "radiogroup", "aria-label": t("What the robot is to you") });
    for (const role of allRoles(roles)) {
      grid.append(h("button", { type: "button", role: "radio", "aria-checked": String(role.id === current), class: `rw-role${role.id === current ? " current" : ""}`, onclick: () => (chooseRole(role.id), onChange?.(), close()) },
        h("span", { class: "rw-role-icon", html: wbIcon(role.icon || "star", 18) }),
        h("span", { class: "rw-role-text" }, h("strong", {}, roleName(role)), h("small", {}, role.custom ? role.tagline : t(role.tagline)))));
    }
    const topic = h("input", { type: "text", class: "field", value: roles.topic || "", maxlength: "160", placeholder: t("What are we working on? (optional)"), "aria-label": t("What are we working on?") });
    topic.addEventListener("change", () => updateSettings((s) => { s.roles = { ...(s.roles || {}), topic: topic.value.trim() }; }));
    const pick = (key, list, labels, label) => selectField(list.map((v) => [v, t(labels[v])]), roles[key], (v) => updateSettings((s) => { s.roles = { ...(s.roles || {}), [key]: v }; }), label);
    return h("div", { class: "rw-role-pop" },
      h("h3", {}, t("What should {name} be right now?", { name: characterName() })),
      grid,
      field(t("Focus"), topic, { stack: true }),
      h("div", { class: "rw-role-opts" },
        field(t("Explain for"), pick("audience", AUDIENCES, { child: "A child", teen: "A teenager", adult: "An adult", expert: "An expert" }, t("Explain for")), { stack: true }),
        field(t("Pace"), pick("pace", PACES, { slow: "Slow", normal: "Normal", fast: "Fast" }, t("Pace")), { stack: true }),
        field(t("How hard to push"), pick("challenge", CHALLENGES, { gentle: "Gentle", balanced: "Balanced", tough: "Tough" }, t("How hard to push")), { stack: true })),
      h("button", { type: "button", class: "wb-link", onclick: () => (close(false), document.dispatchEvent(new CustomEvent("friends:open-settings", { detail: { tab: "robot", sub: "roles" } }))) }, t("Make your own role…")));
  }, { label: t("What the robot is to you"), cls: "rw-role-popover", align: "start", placement: "below" });
}

// Turns [S1] in a reply into a small button that opens that source
export function renderReply(el, text, openSource) {
  el.replaceChildren();
  const parts = String(text).split(/(\[S\d{1,2}\])/g);
  for (const part of parts) {
    const m = /^\[S(\d{1,2})\]$/.exec(part);
    if (m && openSource) el.append(h("button", { type: "button", class: "rw-cite", title: t("Open source {n}", { n: m[1] }), "aria-label": t("Open source {n}", { n: m[1] }), onclick: () => openSource(Number(m[1])) }, m[1]));
    else if (part) el.append(document.createTextNode(part));
  }
}

export class RobotWindow {
  constructor(ui) {
    this.ui = ui;
    this.useSelection = true;
    this.win = new FloatingWindow({
      container: ui.stage,
      label: t("The robot"),
      className: "rw-robot-win",
      defaults: WINDOWS.robot,
      geometry: wbSettings().windows?.robot,
      minW: 290,
      minH: 320,
      inset: 12,
      onGeometry: (g) => saveWindow("robot", g),
      onLayout: () => this.sync(),
      onClose: () => ui.setRobotWindow(false),
      closeLabel: t("Hide the robot's window"),
    });
    this.build();
  }

  build() {
    const win = this.win;
    this.avatar = h("span", { class: "rw-avatar", html: FACE });
    this.roleButton = h("button", { type: "button", class: "rw-role-btn", "aria-haspopup": "dialog", "aria-expanded": "false", onclick: () => openRolePicker(this.roleButton, { onChange: () => this.syncRole() }) });
    this.who = h("span", { class: "rw-robot-name" });
    this.status = h("span", { class: "rw-robot-status", role: "status", "aria-live": "polite" }, t("Ready"));
    win.title.append(this.avatar, h("span", { class: "rw-robot-who" }, this.roleButton, h("span", { class: "rw-robot-sub" }, this.who, " · ", this.status)));
    this.voiceButton = h("button", { type: "button", class: "fw-btn", title: t("Talk with it (voice mode)"), "aria-label": t("Talk with it (voice mode)"), onclick: () => document.getElementById("voice-open")?.click() }, h("span", { html: wbIcon("mic", 16) }));
    win.actions.append(this.voiceButton);

    this.stageBox = h("div", { class: "rw-robot-stage", role: "img", "aria-label": t("The robot, next to the board") });
    this.fallback = h("div", { class: "rw-robot-fallback", hidden: true, html: FACE });
    this.stageBox.append(this.fallback);
    robot.host("board", this.stageBox, { priority: 2, shot: "dock", background: "dock", position: "center", cinematic: false });

    this.reply = h("div", { class: "rw-robot-reply", "aria-live": "off", hidden: true, dir: "auto" });
    this.chips = h("div", { class: "rw-robot-chips", role: "group", "aria-label": t("Things to ask") });
    this.about = h("button", { type: "button", class: "rw-about", hidden: true, "aria-pressed": "true", onclick: () => this.toggleAbout() });
    this.input = h("textarea", { class: "field rw-robot-input", rows: "2", placeholder: t("Ask the robot to draw, explain or check something…"), "aria-label": t("Ask the robot"), spellcheck: "true" });
    this.send = h("button", { type: "button", class: "btn btn-primary small rw-send", "aria-label": t("Send"), title: t("Send") }, h("span", { html: wbIcon("send", 16) }));
    this.stop = h("button", { type: "button", class: "btn small rw-send", hidden: true, "aria-label": t("Stop"), title: t("Stop") }, h("span", { html: wbIcon("stop", 16) }));
    this.studio = h("button", { type: "button", class: "btn small rw-studio", "aria-haspopup": "menu", "aria-expanded": "false", title: t("Things it can make from the board and your sources"), onclick: () => this.openStudio() }, h("span", { html: wbIcon("wand", 16) }), t("Create"));
    this.foot = h("div", { class: "rw-robot-foot" });
    win.body.append(this.stageBox, this.reply, this.chips, this.about, h("div", { class: "rw-robot-ask" }, this.input, h("div", { class: "rw-robot-send" }, this.stop, this.send)), this.foot);
    this.buildFoot();

    this.send.addEventListener("click", () => {
      const text = this.input.value;
      this.input.value = "";
      this.ask(text);
    });
    this.stop.addEventListener("click", () => stopReply());
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.send.click();
      }
      e.stopPropagation();
    });
    this.syncRole();
  }

  buildFoot() {
    const wb = wbSettings();
    const pill = (icon, label, on, onToggle) => {
      const b = h("button", { type: "button", class: "rw-pillbtn", "aria-pressed": String(on), title: label, onclick: () => onToggle(b) }, h("span", { html: wbIcon(icon, 15) }), h("span", {}, label));
      return b;
    };
    const flip = (b) => b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    this.drawBtn = pill("pen", t("It can draw"), wb.aiDrawing !== false, (b) => (flip(b), setWb({ aiDrawing: b.getAttribute("aria-pressed") === "true" })));
    this.seesBtn = pill("eye", t("It sees my board"), (wb.awareness || "always") === "always", (b) => (flip(b), setWb({ awareness: b.getAttribute("aria-pressed") === "true" ? "always" : "onRequest" })));
    this.undoBtn = h("button", { type: "button", class: "rw-pillbtn", title: t("Take back the robot's last drawing"), onclick: () => this.ui.undoRobot() }, h("span", { html: wbIcon("undo", 15) }), h("span", {}, t("Undo its drawing")));
    this.foot.replaceChildren(this.drawBtn, this.seesBtn, this.undoBtn);
  }

  // The switches follow the settings (they can change from Settings or from the robot's own tools)
  syncSettings() {
    const wb = wbSettings();
    this.drawBtn?.setAttribute("aria-pressed", String(wb.aiDrawing !== false));
    this.seesBtn?.setAttribute("aria-pressed", String((wb.awareness || "always") === "always"));
    this.syncRole();
  }

  syncRole() {
    const role = activeRole(getSettings()?.roles);
    this.roleButton.replaceChildren(h("span", { class: "rw-role-name" }, roleName(role)), h("span", { class: "rw-caret", html: wbIcon("chevronDown", 12) }));
    this.who.textContent = characterName();
    this.roleButton.title = t("What the robot is to you right now");
    this.roleButton.setAttribute("aria-label", `${characterName()}, ${roleName(role)}. ${t("Change what the robot is to you")}`);
    this.chips.replaceChildren(
      ...roleChips(getSettings()?.roles).map(([label, prompt]) => h("button", { type: "button", class: "wb-chip-btn", onclick: () => this.askAbout(this.ui.view?.selectedItems() || [], role.custom ? prompt : t(prompt)) }, role.custom ? label : t(label))),
      this.studio
    );
    this.input.placeholder = role.id === "assistant" ? t("Ask the robot to draw, explain or check something…") : t("Ask {name} ({role})…", { name: characterName(), role: roleName(role) });
  }

  // ---------- Showing it ----------
  show() {
    this.win.show();
    this.sync();
  }

  hide() {
    this.win.hide();
    this.sync();
  }

  // The 3D robot draws only while its window shows it
  sync() {
    const showing = this.win.visible && !this.win.g.shaded && this.ui.shown;
    this.fallback.hidden = !robot.unavailable;
    robot.show("board", Boolean(showing) && !robot.unavailable);
  }

  setStatus(text, ms = 4500) {
    this.status.textContent = text;
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => (this.status.textContent = t("Ready")), ms);
  }

  // ---------- Asking ----------
  syncAbout() {
    const items = this.ui.view?.selectedItems() || [];
    this.about.hidden = !items.length;
    this.about.setAttribute("aria-pressed", String(this.useSelection));
    this.about.replaceChildren(h("span", { html: wbIcon(this.useSelection ? "check" : "plus", 13) }), t("About what I selected ({n})", { n: items.length }));
  }

  toggleAbout() {
    this.useSelection = !this.useSelection;
    this.syncAbout();
  }

  describeItems(items) {
    return items.length ? ` ${t("(I selected: {things})", { things: items.slice(0, 6).map((i) => `[${i.id}] ${itemLabel(i, 24) || i.type}`).join("; ") })}` : "";
  }

  // text: what to say. items: what it is about (the selection, if you want it to be)
  askAbout(items, text = "") {
    this.ask((text || t("What do you think of this?")) + this.describeItems(items));
  }

  async ask(text) {
    const msg = String(text || "").trim();
    if (!msg) return;
    if (!this.win.visible) this.ui.setRobotWindow(true);
    if (this.win.g.shaded) this.win.setShaded(false);
    let said = msg;
    if (this.useSelection && !/\(I selected|\(Ich habe/.test(msg)) {
      const items = this.ui.view?.selectedItems() || [];
      said += this.describeItems(items);
    }
    this.reply.hidden = false;
    this.reply.textContent = "";
    this.reply.classList.add("busy");
    this.send.disabled = true;
    this.stop.hidden = false;
    this.setStatus(t("Thinking…"), 60000);
    let acc = "";
    const res = await askFromBoard(said, { onChunk: (c) => ((acc += c), renderReply(this.reply, acc, (n) => this.ui.openSource?.(n)), (this.reply.scrollTop = this.reply.scrollHeight)) });
    this.reply.classList.remove("busy");
    this.send.disabled = false;
    this.stop.hidden = true;
    this.setStatus(t("Ready"));
    if (res?.error) this.reply.textContent = res.error;
    else if (acc) announce(acc.slice(0, 400));
    else this.reply.hidden = true;
  }

  openStudio() {
    menu(this.studio, STUDIO.map((s) => ({ icon: s.icon, label: t(s.label), hint: t(s.hint), fn: () => this.ask(t(s.prompt)) })), { align: "start" });
  }
}
