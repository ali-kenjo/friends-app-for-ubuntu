// The board next to your conversation: a window beside your text chat, and one in voice mode beside the robot.
// Both show the same board as the robot page (each with its own zoom and tool), so you can draw while you talk, and
// watch the robot draw while it talks. You put them where you like and size them as you like (drag the title bar,
// pull an edge, or use the layout menu), and they remember. They open by themselves when the robot starts drawing,
// if you like.
import { h } from "../h.js";
import { t } from "../i18n.js";
import { announce } from "../a11y.js";
import { getSettings, onSettings } from "../store.js";
import { board, boardReady } from "./store.js";
import { BoardView } from "./view.js";
import { WINDOWS } from "./geometry.mjs";
import { FloatingWindow } from "./float.js";
import { ToolPill } from "./toolpill.js";
import { followSettings, saveWindow, windowGeometry } from "./windows.js";
import { wbIcon } from "./wb-icons.js";
import { robotX } from "../voice/robot-place.js";

const wbSettings = () => getSettings()?.whiteboard || {};

class Panel {
  // kind: "chat" | "voice"
  constructor(layer, kind, options = {}) {
    this.layer = layer;
    this.kind = kind;
    this.view = null;
    this.open = false;
    this.lastActivity = 0;
    this.board = board;
    this.win = new FloatingWindow({
      container: layer,
      label: t("Whiteboard"),
      className: `wb-win wb-win-${kind}`,
      defaults: WINDOWS[kind],
      geometry: windowGeometry(kind),
      minW: 280,
      minH: 220,
      inset: options.inset ?? 8,
      narrow: 700,
      onGeometry: (g) => saveWindow(kind, g),
      onLayout: () => this.laidOut(),
      onClose: () => this.setOpen(false),
      closeLabel: t("Close the board"),
      menuExtra: () => [h("button", { type: "button", role: "menuitem", class: "fw-menu-item", onclick: () => (this.win.closeMenu(), this.fullPage()) }, h("span", { html: wbIcon("expand", 16) }), h("span", {}, t("Open it on the robot page")))],
    });
    followSettings(this.win, kind);
  }

  async ensureView() {
    if (this.view) return;
    await boardReady;
    this.build();
    this.view = new BoardView({
      container: this.viewport,
      store: board,
      getSettings,
      mode: this.kind === "voice" ? "voice" : "panel",
      label: t("Whiteboard"),
      callbacks: {
        onTool: () => this.pill.sync(),
        onStyle: () => this.pill.sync(),
        onHistory: () => this.pill.syncHistory(),
        onDiagram: () => this.view.say(t("Open the robot page to add diagrams.")),
      },
    });
    for (const ev of ["doc", "page", "change"]) board.on(ev, () => this.syncPages());
    board.on("status", () => this.syncStatus());
    board.on("reveal", () => this.syncStatus());
    board.on("change", (c) => c && !c.local && this.touch());
    this.syncPages();
    this.pill.sync();
    this.pill.syncHistory();
  }

  build() {
    this.title = h("span", { class: "wb-panel-title" }, t("Whiteboard"));
    this.chip = h("span", { class: "wb-panel-chip", hidden: true, role: "status", "aria-live": "polite" });
    this.win.title.append(h("span", { class: "wb-icon", html: wbIcon("robot", 16) }), this.title, this.chip);
    this.pill = new ToolPill(this, { compact: true });
    this.viewport = h("div", { class: "wb-viewport wb-panel-viewport" });
    this.pageLabel = h("span", { class: "wb-panel-page", "aria-live": "polite" });
    this.prev = h("button", { type: "button", class: "wb-btn small", title: t("Previous page"), "aria-label": t("Previous page"), onclick: () => board.setPage(board.pageIndex - 1) }, h("span", { html: wbIcon("chevronLeft", 14) }));
    this.next = h("button", { type: "button", class: "wb-btn small", title: t("Next page"), "aria-label": t("Next page"), onclick: () => board.setPage(board.pageIndex + 1) }, h("span", { html: wbIcon("chevronRight", 14) }));
    const foot = h("footer", { class: "wb-panel-foot" },
      this.prev, this.pageLabel, this.next,
      h("button", { type: "button", class: "wb-btn small", title: t("Fit everything"), "aria-label": t("Fit everything"), onclick: () => this.view.fitContent() }, h("span", { html: wbIcon("fit", 16) })),
      h("button", { type: "button", class: "wb-btn small", title: t("Take back the robot's last drawing"), "aria-label": t("Take back the robot's last drawing"), onclick: () => board.undoRobot().then((r) => announce(r.ok ? t("Took back the robot's last drawing") : t(r.error || "Nothing to undo"))) }, h("span", { html: wbIcon("robot", 16) }), h("span", { html: wbIcon("undo", 14) }))
    );
    this.win.body.append(this.pill.el, this.viewport, foot);
  }

  syncPages() {
    if (!this.pageLabel || !board.doc) return;
    const n = board.doc.pages.length;
    this.pageLabel.textContent = n > 1 ? t("Page {a} of {b}", { a: board.pageIndex + 1, b: n }) : board.doc.pages[0]?.name || "";
    this.prev.disabled = board.pageIndex <= 0;
    this.next.disabled = board.pageIndex >= n - 1;
    this.prev.hidden = this.next.hidden = n < 2;
    this.title.textContent = board.doc.title === "Main Whiteboard" ? t("Whiteboard") : board.doc.title;
  }

  syncStatus() {
    if (!this.chip) return;
    const writing = board.writing;
    const offline = board.status === "offline";
    this.chip.hidden = !(writing || offline);
    this.chip.textContent = offline ? t("Offline") : writing ? t("Writing…") : "";
    this.chip.classList.toggle("live", writing && !offline);
    this.chip.classList.toggle("warn", offline);
  }

  fullPage() {
    this.setOpen(false);
    location.hash = "#whiteboard";
  }

  async setOpen(open) {
    if (open === this.open) return;
    if (open) await this.ensureView();
    this.open = open;
    if (open) {
      this.win.show();
      this.apply();
      requestAnimationFrame(() => {
        this.view.resize();
        if (!this.view.fitted) this.view.fitBoard();
        this.view.schedule();
      });
      this.touch();
    } else this.win.hide();
    this.onOpenChange?.(open);
    document.dispatchEvent(new CustomEvent("friends:whiteboard-panel", { detail: { kind: this.kind, open } }));
  }

  toggle() {
    return this.setOpen(!this.open);
  }

  touch() {
    this.lastActivity = Date.now();
    clearTimeout(this.hideTimer);
    const secs = this.kind === "voice" ? Number(wbSettings().voiceAutoHide) || 0 : 0;
    if (this.open && secs > 0) this.hideTimer = setTimeout(() => (Date.now() - this.lastActivity >= secs * 1000 - 100 ? this.setOpen(false) : this.touch()), secs * 1000);
  }

  laidOut() {
    this.view?.schedule();
    requestAnimationFrame(() => this.view?.resize());
    this.onLayout?.();
  }

  apply() {
    this.win.el.classList.toggle("wb-theme-dark", ["chalkboard", "blueprint", "glass", "neon", "midnight"].includes(wbSettings().dockTheme));
    this.view?.schedule();
  }
}

// ---------- Beside your text chat ----------
class DockPanel extends Panel {
  constructor(layer) {
    super(layer, "chat", { inset: 10 });
    this.buttons = ["home-wb-toggle-btn", "robot-dock-wb-btn"].map((id) => document.getElementById(id)).filter(Boolean);
    this.main = document.getElementById("main");
  }

  apply() {
    super.apply();
    for (const b of this.buttons) {
      b.classList.toggle("active", this.open);
      b.setAttribute("aria-expanded", String(this.open));
    }
  }

  // The conversation makes room for a docked board, and the little robot steps beside it
  onLayout() {
    const main = this.main;
    if (!main) return;
    const eff = this.win.effective();
    const docked = this.open && ["left", "right", "bottom"].includes(eff.mode);
    for (const key of ["wbDock", "wbDockW", "wbDockH"]) delete main.dataset[key];
    main.style.removeProperty("--wb-dock-w");
    main.style.removeProperty("--wb-dock-h");
    if (!docked) return;
    const r = this.win.rect(eff);
    if (eff.mode === "bottom") {
      main.dataset.wbDock = "bottom";
      main.style.setProperty("--wb-dock-h", `${Math.round(r.height + this.win.inset * 2)}px`);
    } else {
      main.dataset.wbDock = eff.mode === "left" ? "start" : "end";
      main.style.setProperty("--wb-dock-w", `${Math.round(r.width + this.win.inset * 2)}px`);
    }
    document.dispatchEvent(new CustomEvent("friends:wb-dock-layout"));
  }

  onOpenChange() {
    this.apply();
    this.onLayout();
  }
}

// ---------- In voice mode ----------
class VoicePanel extends Panel {
  constructor(layer, voiceMode) {
    super(layer, "voice", { inset: 10 });
    this.voiceMode = voiceMode;
    this.button = document.getElementById("voice-board-btn");
    // The window floats between the top bar and the controls, wherever they are (the top bar wraps on a narrow screen)
    const watch = new ResizeObserver(() => this.fitLayer());
    watch.observe(voiceMode);
    for (const sel of [".voice-top", ".voice-controls"]) {
      const el = voiceMode.querySelector(sel);
      if (el) watch.observe(el);
    }
  }

  fitLayer() {
    const vm = this.voiceMode;
    const box = vm.getBoundingClientRect();
    if (!box.height) return;
    const top = vm.querySelector(".voice-top")?.getBoundingClientRect();
    const controls = vm.querySelector(".voice-controls")?.getBoundingClientRect();
    const above = top ? Math.max(0, top.bottom - box.top) + 8 : 76;
    const below = controls ? Math.max(0, box.bottom - controls.top) + 8 : 112;
    this.layer.style.insetBlock = `${Math.round(above)}px ${Math.round(below)}px`;
  }

  apply() {
    super.apply();
    this.fitLayer();
    if (this.button) {
      this.button.classList.toggle("active", this.open);
      this.button.setAttribute("aria-pressed", String(this.open));
    }
    // Filming the screen: the board is part of the picture unless it is switched off for filming
    this.win.el.classList.toggle("wb-film-hidden", this.hiddenForFilming);
    this.win.el.classList.toggle("wb-in-video", wbSettings().showInRecordings !== false);
    this.onLayout();
  }

  // The captions and the robot make room for a docked board
  onLayout() {
    const vm = this.voiceMode;
    if (!vm) return;
    const eff = this.win.effective();
    const docked = this.open && !this.hiddenForFilming && ["left", "right"].includes(eff.mode);
    const wide = this.open && !this.hiddenForFilming && eff.mode === "max";
    if (docked) {
      const w = this.win.rect(eff).width + this.win.inset * 2;
      vm.dataset.board = eff.mode === "left" ? "start" : "end";
      vm.style.setProperty("--wb-w", `${Math.round(w)}px`);
    } else {
      vm.dataset.board = this.open ? (wide ? "full" : "float") : "";
      vm.style.removeProperty("--wb-w");
    }
    document.dispatchEvent(new CustomEvent("friends:wb-voice-layout", { detail: { mode: eff.mode, open: this.open, width: docked ? this.win.rect(eff).width + this.win.inset * 2 : 0 } }));
  }

  onOpenChange() {
    this.apply();
  }

  get hiddenForFilming() {
    return this.voiceMode.classList.contains("filming") && wbSettings().showInFilming === false;
  }

  // Which side of the robot the board is on: 1 is its right, -1 its left, 0 when the board is not there
  sideOfRobot() {
    if (!this.open || !this.view || this.hiddenForFilming || this.win.effective().mode === "max") return 0;
    const space = this.win.space();
    if (!space.w) return 0;
    const r = this.win.rect();
    return (r.left + r.width / 2) / space.w >= 0.5 + robotX() ? 1 : -1;
  }

  // Into the video (voice mode is being recorded): the board where it sits on screen
  drawTo(ctx, w, hgt) {
    if (!this.open || !this.view || this.hiddenForFilming || wbSettings().showInRecordings === false) return;
    const stage = this.voiceMode.getBoundingClientRect();
    const box = this.viewport.getBoundingClientRect();
    if (!stage.width || !stage.height || box.width < 20 || box.height < 20) return;
    const k = w / stage.width;
    const x = (box.left - stage.left) * k;
    const y = (box.top - stage.top) * (hgt / stage.height);
    const bw = box.width * k;
    const bh = box.height * (hgt / stage.height);
    const snap = (this.snap ||= document.createElement("canvas"));
    snap.width = Math.max(2, Math.min(2400, Math.round(bw)));
    snap.height = Math.max(2, Math.min(2400, Math.round(bh)));
    if (!this.view.drawInto(snap)) return;
    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, 14 * k);
    else ctx.rect(x, y, bw, bh);
    ctx.clip();
    ctx.drawImage(snap, x, y, bw, bh);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.lineWidth = Math.max(1, k);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, 14 * k);
    else ctx.rect(x, y, bw, bh);
    ctx.stroke();
  }
}

// ---------- Wiring ----------
const dockLayer = document.getElementById("whiteboard-dock-panel");
const voiceMode = document.getElementById("voice-mode");
export const dock = dockLayer ? new DockPanel(dockLayer) : null;
export const voicePanel = voiceMode ? (() => {
  let layer = document.getElementById("voice-board-layer");
  if (!layer) {
    layer = h("div", { class: "wb-voice-layer", id: "voice-board-layer" });
    voiceMode.append(layer);
  }
  return new VoicePanel(layer, voiceMode);
})() : null;

for (const id of ["home-wb-toggle-btn", "robot-dock-wb-btn"]) document.getElementById(id)?.addEventListener("click", () => dock?.toggle());
document.getElementById("voice-board-btn")?.addEventListener("click", () => voicePanel?.toggle());
document.addEventListener("friends:whiteboard-dock", (e) => dock?.setOpen(e.detail?.open !== false));

onSettings(() => {
  dock?.apply();
  voicePanel?.apply();
  dock?.touch();
});

// The default: open when the app starts
let started = false;
onSettings((s) => {
  if (started) return;
  started = true;
  if (s.whiteboard?.dockDefaultOpen) dock?.setOpen(true);
});

// The robot starts drawing: the board opens where you are (the chat, or voice mode), if you let it
board.on("remote", (r) => {
  if (r.actor === "user") return;
  const wb = wbSettings();
  const inVoice = voiceMode && !voiceMode.hidden;
  if (inVoice) {
    if (wb.voiceOpen !== "manual" && wb.voiceAllowed !== false) voicePanel?.setOpen(true);
  } else if (document.body.dataset.view === "home" && wb.autoOpenOnDraw !== false && wb.chatAllowed !== false) dock?.setOpen(true);
});

// A cue to open or close it ("show me", "hide that")
board.on("cue", (cue) => {
  if (cue.type !== "show") return;
  const inVoice = voiceMode && !voiceMode.hidden;
  (inVoice ? voicePanel : dock)?.setOpen(cue.open !== false);
});

// Leaving voice mode folds the voice board away; opening it again starts fresh. Filming mode starting or ending
// changes what the board shows (no tools, or nothing at all).
if (voiceMode) {
  let wasFilming = false;
  new MutationObserver(() => {
    if (voiceMode.hidden && voicePanel?.open) voicePanel.setOpen(false);
    const filming = voiceMode.classList.contains("filming");
    if (filming !== wasFilming) {
      wasFilming = filming;
      voicePanel?.apply();
    }
  }).observe(voiceMode, { attributes: true, attributeFilter: ["hidden", "class"] });
}
