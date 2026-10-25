// ---------- A window that floats over a page ----------
// The board beside your chat, the board in voice mode and the robot's own window are all one of these. You grab it
// by its title bar and put it where you like; you pull any edge or corner to change its size; you drag it to an edge
// of the space to dock it there (a shadow shows where it will land); you can fill the space, or fold it up to its
// title bar. Everything also works without a pointer: the arrow keys on the title bar move it (Alt with them resizes
// it), and the layout menu in the title bar has every position and size by name.
// Where it sits is remembered (the owner saves what onGeometry gives it).
import { h } from "../h.js";
import { t } from "../i18n.js";
import { announce } from "../a11y.js";
import { wbIcon } from "./wb-icons.js";
import { cleanGeometry } from "./geometry.mjs";

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const MAGNET = 12; // px: near an edge of the space it snaps to it
const ZONE = 28; // px: the pointer this near an edge docks the window there
const STEP = 16;
const BIG_STEP = 64;
const HANDLES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const zTop = new WeakMap();

export class FloatingWindow {
  // container: the element it floats in (position: relative). defaults: where it starts (geometry.mjs)
  // geometry: where it was left. onGeometry(g): called (after a moment) when you changed it. onLayout(win): after every
  // layout. inset: px kept free around a docked or filling window.
  constructor({ container, label, className = "", defaults, geometry = null, minW = 300, minH = 200, inset = 0, narrow = 0, onGeometry = null, onLayout = null, onClose = null, closeLabel = "", menuExtra = null, shadeable = true }) {
    this.container = container;
    this.label = label;
    this.defaults = defaults;
    this.g = cleanGeometry(geometry, defaults);
    this.minW = minW;
    this.minH = minH;
    this.inset = inset;
    this.narrow = narrow; // a space narrower than this (px) holds the window as a sheet along the bottom
    this.onGeometry = onGeometry;
    this.onLayout = onLayout;
    this.onClose = onClose;
    this.menuExtra = menuExtra;
    this.visible = false;
    this.lastFloat = { x: this.g.x, y: this.g.y, w: this.g.w, h: this.g.h };
    this.build({ className, closeLabel, shadeable });
    container.append(this.el, this.zone);
    this.resizer = new ResizeObserver(() => this.layout());
    this.resizer.observe(container);
  }

  // ---------- Building ----------
  build({ className, closeLabel, shadeable }) {
    const id = `fw-${Math.random().toString(36).slice(2, 7)}`;
    this.title = h("div", { class: "fw-title" });
    this.actions = h("div", { class: "fw-actions" });
    this.menuButton = this.control("layout", t("Move and resize"), () => this.toggleMenu(), { haspopup: "menu" });
    this.shadeable = shadeable;
    this.closeButton = this.onClose ? this.control("close", closeLabel || t("Close"), () => this.onClose()) : null;
    this.head = h("header", { class: "fw-head", tabindex: "0", role: "group", "aria-label": `${this.label}. ${t("Title bar: arrow keys move the window, Alt and arrow keys change its size.")}`, "aria-describedby": `${id}-hint` },
      h("span", { class: "fw-grip", "aria-hidden": "true" }),
      this.title,
      h("span", { class: "fw-spacer" }),
      this.actions,
      this.menuButton, this.closeButton
    );
    this.hint = h("span", { id: `${id}-hint`, class: "sr-only" }, t("Drag the title bar to move it, or use the Move and resize menu."));
    this.body = h("div", { class: "fw-body" });
    this.handles = HANDLES.map((dir) => h("div", { class: "fw-h", "data-h": dir, "aria-hidden": "true" }));
    this.el = h("section", { class: `fw ${className}`.trim(), "aria-label": this.label, hidden: true }, this.head, this.hint, this.body, this.handles);
    this.zone = h("div", { class: "fw-zone", "aria-hidden": "true", hidden: true });
    this.bind();
  }

  control(icon, label, onClick, { haspopup } = {}) {
    const b = h("button", { type: "button", class: "fw-btn", title: label, "aria-label": label, onclick: onClick }, h("span", { html: wbIcon(icon, 16) }));
    if (haspopup) b.setAttribute("aria-haspopup", haspopup);
    b.dataset.icon = icon;
    return b;
  }

  // ---------- Showing ----------
  show() {
    this.visible = true;
    this.el.hidden = false;
    this.layout();
    this.front();
  }

  hide() {
    this.visible = false;
    this.el.hidden = true;
    this.closeMenu();
    this.onLayout?.(this);
  }

  front() {
    const z = (zTop.get(this.container) || 40) + 1;
    zTop.set(this.container, z);
    this.el.style.zIndex = String(z);
  }

  destroy() {
    this.resizer.disconnect();
    this.el.remove();
    this.zone.remove();
  }

  // ---------- Where it is ----------
  get mode() {
    return this.g.mode;
  }

  get geometry() {
    return { ...this.g };
  }

  // The size of the space it floats in
  space() {
    return { w: this.container.clientWidth, h: this.container.clientHeight };
  }

  // What is shown: the same as asked for, except in a narrow space where it is a sheet along the bottom
  effective() {
    const w = this.container.clientWidth;
    if (this.narrow && w && w < this.narrow && this.g.mode !== "max" && this.g.mode !== "bottom") return { ...this.g, mode: "bottom", size: 0.55 };
    return this.g;
  }

  // Its place in px, inside the space
  rect(g = this.effective()) {
    const { w: cw, h: ch } = this.space();
    const m = this.inset;
    const minW = Math.min(this.minW, cw);
    const head = this.head.offsetHeight || 40;
    let r;
    if (g.mode === "max") r = { left: m, top: m, width: cw - 2 * m, height: ch - 2 * m };
    else if (g.mode === "left" || g.mode === "right") {
      const width = clamp(g.size * cw, minW, Math.max(minW, cw * 0.8));
      r = { left: g.mode === "left" ? m : cw - width - m, top: m, width, height: ch - 2 * m };
    } else if (g.mode === "bottom") {
      const height = clamp(g.size * ch, Math.min(this.minH, ch), Math.max(this.minH, ch * 0.8));
      r = { left: m, top: ch - height - m, width: cw - 2 * m, height };
    } else {
      const width = clamp(g.w * cw, minW, Math.max(minW, cw - 8));
      const height = clamp(g.h * ch, Math.min(this.minH, ch), Math.max(this.minH, ch - 8));
      r = { left: clamp(g.x * cw, 0, Math.max(0, cw - width)), top: clamp(g.y * ch, 0, Math.max(0, ch - height)), width, height };
    }
    if (g.shaded && g.mode !== "max") r.height = head;
    return r;
  }

  layout() {
    if (!this.visible) return;
    const { w: cw, h: ch } = this.space();
    if (!cw || !ch) return;
    const eff = this.effective();
    const r = this.rect(eff);
    Object.assign(this.el.style, { left: `${Math.round(r.left)}px`, top: `${Math.round(r.top)}px`, width: `${Math.round(r.width)}px`, height: `${Math.round(r.height)}px` });
    this.el.dataset.mode = eff.mode;
    const shaded = eff.shaded && eff.mode !== "max";
    this.el.classList.toggle("shaded", shaded);
    this.onLayout?.(this);
  }

  // Sets where it is (everything optional) and tells the owner
  set(patch, { save = true } = {}) {
    const before = this.g.mode;
    this.g = cleanGeometry({ ...this.g, ...patch }, this.defaults);
    if (this.g.mode === "float") this.lastFloat = { x: this.g.x, y: this.g.y, w: this.g.w, h: this.g.h };
    this.layout();
    if (save) this.changed();
    return before !== this.g.mode;
  }

  changed() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.onGeometry?.(this.geometry), 250);
  }

  // The fractions for a place in px
  fractions(r) {
    const { w: cw, h: ch } = this.space();
    return { x: r.left / cw, y: r.top / ch, w: r.width / cw, h: r.height / ch };
  }

  dock(mode) {
    const size = this.g.size;
    this.set({ mode, size, shaded: false });
    announce({ left: t("Docked to the left"), right: t("Docked to the right"), bottom: t("Docked to the bottom") }[mode] || "");
  }

  float() {
    this.set({ mode: "float", ...this.lastFloat, shaded: false });
    announce(t("Floating"));
  }

  toggleMax() {
    if (this.g.mode === "max") this.set({ mode: this.lastMode && this.lastMode !== "max" ? this.lastMode : "float" });
    else {
      this.lastMode = this.g.mode;
      this.set({ mode: "max", shaded: false });
    }
  }

  setShaded(on) {
    if (this.g.mode === "max") return;
    this.set({ shaded: on });
  }

  reset() {
    this.g = cleanGeometry(this.defaults, this.defaults);
    this.lastFloat = { x: this.g.x, y: this.g.y, w: this.g.w, h: this.g.h };
    this.layout();
    this.changed();
    announce(t("Back to where it started"));
  }

  // Smaller or larger by a step
  resizeBy(factor) {
    if (this.g.mode === "float") {
      const w = clamp(this.g.w * factor, 0.12, 1);
      const h = clamp(this.g.h * factor, 0.1, 1);
      this.set({ w, h, x: clamp(this.g.x, 0, 1 - Math.min(w, 0.2)), y: clamp(this.g.y, 0, 1 - Math.min(h, 0.2)) });
    } else if (this.g.mode !== "max") this.set({ size: clamp(this.g.size * factor, 0.15, 0.8) });
  }

  // ---------- The layout menu ----------
  toggleMenu() {
    if (this.menu) this.closeMenu();
    else this.openMenu();
  }

  openMenu() {
    this.closeMenu();
    const mode = this.g.mode;
    const entry = (icon, label, fn, current = false) => h("button", { type: "button", role: "menuitemradio", "aria-checked": String(current), class: `fw-menu-item${current ? " current" : ""}`, onclick: () => (this.closeMenu(), fn()) }, h("span", { html: wbIcon(icon, 16) }), h("span", {}, label));
    const items = [
      entry("dockLeft", t("Dock to the left"), () => this.dock("left"), mode === "left"),
      entry("dockRight", t("Dock to the right"), () => this.dock("right"), mode === "right"),
      entry("dockBottom", t("Dock to the bottom"), () => this.dock("bottom"), mode === "bottom"),
      entry("float", t("Float freely"), () => this.float(), mode === "float"),
      entry(mode === "max" ? "restore" : "expand", mode === "max" ? t("Back to its size") : t("Fill the space"), () => this.toggleMax(), mode === "max"),
      ...(this.shadeable && mode !== "max" ? [entry(this.g.shaded ? "chevronDown" : "shade", this.g.shaded ? t("Unfold") : t("Fold up to the title bar"), () => this.setShaded(!this.g.shaded), this.g.shaded)] : []),
      h("div", { class: "fw-menu-sep", role: "separator" }),
      entry("zoomOut", t("Smaller"), () => (this.resizeBy(0.85), announce(t("Smaller")))),
      entry("zoomIn", t("Larger"), () => (this.resizeBy(1.18), announce(t("Larger")))),
      entry("undo", t("Back to where it started"), () => this.reset()),
    ];
    for (const extra of this.menuExtra?.(this) || []) items.push(extra);
    this.menu = h("div", { class: "fw-menu", role: "menu", "aria-label": t("Move and resize") }, items);
    this.el.append(this.menu);
    this.menuButton.setAttribute("aria-expanded", "true");
    this.menu.querySelector("button")?.focus();
    this.menu.addEventListener("keydown", (e) => {
      const list = [...this.menu.querySelectorAll("button")];
      const i = list.indexOf(document.activeElement);
      if (e.key === "ArrowDown") (list[(i + 1) % list.length] || list[0]).focus();
      else if (e.key === "ArrowUp") (list[(i - 1 + list.length) % list.length] || list[0]).focus();
      else if (e.key === "Escape") {
        e.stopPropagation();
        this.closeMenu();
        this.menuButton.focus();
      } else return;
      e.preventDefault();
    });
    this.outside = (e) => {
      if (!this.menu?.contains(e.target) && !this.menuButton.contains(e.target)) this.closeMenu();
    };
    setTimeout(() => document.addEventListener("pointerdown", this.outside, true));
  }

  closeMenu() {
    if (!this.menu) return;
    this.menu.remove();
    this.menu = null;
    this.menuButton.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", this.outside, true);
  }

  // ---------- Pointer and keys ----------
  bind() {
    this.el.addEventListener("pointerdown", () => this.front(), true);
    this.head.addEventListener("pointerdown", (e) => this.startMove(e));
    this.head.addEventListener("dblclick", (e) => {
      if (!e.target.closest("button, input, select, textarea, a")) this.toggleMax();
    });
    this.head.addEventListener("keydown", (e) => this.onKey(e));
    for (const handle of this.handles) handle.addEventListener("pointerdown", (e) => this.startResize(e, handle.dataset.h));
  }

  onKey(e) {
    if (e.target !== this.head) return;
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (e.key === "Home") {
      e.preventDefault();
      this.reset();
      return;
    }
    if (!dir) return;
    e.preventDefault();
    const step = e.shiftKey ? BIG_STEP : STEP;
    const { w: cw, h: ch } = this.space();
    if (e.altKey) {
      if (this.g.mode === "float") this.set({ w: clamp(this.g.w + (dir[0] * step) / cw, 0.12, 1), h: clamp(this.g.h + (dir[1] * step) / ch, 0.1, 1) });
      else if (this.g.mode === "left" || this.g.mode === "right") this.set({ size: clamp(this.g.size + ((this.g.mode === "left" ? dir[0] : -dir[0]) * step) / cw, 0.15, 0.8) });
      else if (this.g.mode === "bottom") this.set({ size: clamp(this.g.size - (dir[1] * step) / ch, 0.15, 0.8) });
    } else if (this.g.mode === "float") this.set({ x: clamp(this.g.x + (dir[0] * step) / cw, 0, 1 - Math.min(this.g.w, 0.2)), y: clamp(this.g.y + (dir[1] * step) / ch, 0, 1 - Math.min(this.g.h, 0.2)) });
    else if (this.g.mode === "left" && dir[0] > 0) this.float();
    else if (this.g.mode === "right" && dir[0] < 0) this.float();
    else if (this.g.mode === "bottom" && dir[1] < 0) this.float();
  }

  // Which edge the window is being pushed against (null: none)
  zoneFor({ left, top, width, py, cw, ch }) {
    if (top < -ZONE) return "max";
    if (left < -ZONE) return "left";
    if (left + width > cw + ZONE) return "right";
    if (py > ch - 6) return "bottom";
    return null;
  }

  showZone(zone) {
    if (!zone) {
      this.zone.hidden = true;
      return;
    }
    const keep = this.g.mode === zone ? this.g : { ...this.g, mode: zone, size: this.g.size };
    const r = this.rect({ ...keep, shaded: false });
    Object.assign(this.zone.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, zIndex: String((zTop.get(this.container) || 40) - 1) });
    this.zone.hidden = false;
  }

  startMove(e) {
    if (e.button !== 0 || e.target.closest("button, input, select, textarea, a, [data-nodrag]")) return;
    if (this.g.mode === "max") return;
    e.preventDefault();
    this.closeMenu();
    const box = this.container.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, rect: this.rect(), mode: this.g.mode, moved: false };
    const grab = { dx: (e.clientX - box.left - start.rect.left) / start.rect.width, dy: e.clientY - box.top - start.rect.top };
    this.head.setPointerCapture(e.pointerId);
    this.el.classList.add("moving");
    let zone = null;
    const move = (ev) => {
      const px = ev.clientX - box.left;
      const py = ev.clientY - box.top;
      if (!start.moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
      start.moved = true;
      const { w: cw, h: ch } = this.space();
      // A docked window leaves its edge when it is pulled away: it becomes a floating one under the pointer
      if (this.g.mode !== "float") {
        const w = clamp(this.lastFloat.w * cw, Math.min(this.minW, cw), cw - 8);
        const hh = clamp(this.lastFloat.h * ch, Math.min(this.minH, ch), ch - 8);
        this.g = { ...this.g, mode: "float", w: w / cw, h: hh / ch, shaded: false };
        start.rect = { left: px - grab.dx * w, top: py - grab.dy, width: w, height: hh };
        start.x = ev.clientX;
        start.y = ev.clientY;
        grab.dx = (px - start.rect.left) / w;
      }
      const width = start.rect.width;
      const height = this.g.shaded ? this.head.offsetHeight : start.rect.height;
      let left = start.rect.left + (ev.clientX - start.x);
      let top = start.rect.top + (ev.clientY - start.y);
      // Pushed past an edge of the space (or the pointer at the bottom): it docks there when let go
      zone = this.zoneFor({ left, top, width, py, cw, ch });
      this.showZone(zone);
      left = clamp(left, -width + 96, cw - 96);
      top = clamp(top, 0, ch - 40);
      // The edges and the middle pull it in a little
      for (const target of [0, cw - width, (cw - width) / 2]) if (Math.abs(left - target) < MAGNET) left = target;
      for (const target of [0, ch - height, (ch - height) / 2]) if (Math.abs(top - target) < MAGNET) top = target;
      this.g = { ...this.g, mode: "float", x: clamp(left / cw, -1, 1), y: clamp(top / ch, 0, 1) };
      Object.assign(this.el.style, { left: `${Math.round(left)}px`, top: `${Math.round(top)}px`, width: `${Math.round(width)}px`, height: `${Math.round(height)}px` });
      this.el.dataset.mode = "float";
    };
    const done = () => {
      this.head.removeEventListener("pointermove", move);
      this.head.removeEventListener("pointerup", done);
      this.head.removeEventListener("pointercancel", done);
      this.el.classList.remove("moving");
      this.showZone(null);
      if (!start.moved) return;
      if (zone === "max") {
        this.lastMode = "float";
        this.lastFloat = { x: clamp(this.g.x, 0, 0.8), y: clamp(this.g.y, 0, 0.8), w: this.g.w, h: this.g.h };
        this.set({ mode: "max", shaded: false });
      } else if (zone) this.dock(zone);
      else {
        const r = this.rect({ ...this.g, mode: "float" });
        this.g = cleanGeometry({ ...this.g, mode: "float", ...this.fractions(r) }, this.defaults);
        this.lastFloat = { x: this.g.x, y: this.g.y, w: this.g.w, h: this.g.h };
        this.layout();
        this.changed();
      }
    };
    this.head.addEventListener("pointermove", move);
    this.head.addEventListener("pointerup", done);
    this.head.addEventListener("pointercancel", done);
  }

  startResize(e, dir) {
    if (e.button !== 0 || this.g.mode === "max" || this.g.shaded) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    this.el.classList.add("moving");
    const start = { x: e.clientX, y: e.clientY, rect: this.rect(), mode: this.g.mode };
    const { w: cw, h: ch } = this.space();
    const move = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (start.mode === "left" || start.mode === "right") {
        const width = clamp(start.mode === "left" ? start.rect.width + dx : start.rect.width - dx, Math.min(this.minW, cw), cw * 0.8);
        this.g = { ...this.g, size: width / cw };
      } else if (start.mode === "bottom") {
        const height = clamp(start.rect.height - dy, Math.min(this.minH, ch), ch * 0.8);
        this.g = { ...this.g, size: height / ch };
      } else {
        let { left, top, width, height } = start.rect;
        if (dir.includes("e")) width = clamp(start.rect.width + dx, Math.min(this.minW, cw), cw - left);
        if (dir.includes("s")) height = clamp(start.rect.height + dy, Math.min(this.minH, ch), ch - top);
        if (dir.includes("w")) {
          width = clamp(start.rect.width - dx, Math.min(this.minW, cw), start.rect.left + start.rect.width);
          left = start.rect.left + start.rect.width - width;
        }
        if (dir.includes("n")) {
          height = clamp(start.rect.height - dy, Math.min(this.minH, ch), start.rect.top + start.rect.height);
          top = start.rect.top + start.rect.height - height;
        }
        this.g = { ...this.g, x: left / cw, y: top / ch, w: width / cw, h: height / ch };
      }
      this.layout();
    };
    const done = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", done);
      handle.removeEventListener("pointercancel", done);
      this.el.classList.remove("moving");
      this.g = cleanGeometry(this.g, this.defaults);
      if (this.g.mode === "float") this.lastFloat = { x: this.g.x, y: this.g.y, w: this.g.w, h: this.g.h };
      this.layout();
      this.changed();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", done);
    handle.addEventListener("pointercancel", done);
  }
}
