// A place that shows the shared board and lets you work on it: the full page, the side panel next to your chat,
// and the panel in voice mode are all one of these (each with its own zoom and tool, all showing the same board).
// It draws through render.mjs, sends your changes to the store as operations, and shows what the robot is doing:
// its pointer, its pen while it writes, and a flash on what it just changed.
import { getBoundingBox, hitTest, hitTestBox, genId, LINE_SHAPES, translateItem } from "./model.mjs";
import { drawBackground, drawPage, drawItem, renderPageTo, itemBox, ImageCache, themeOf, checklistLayout, tableLayout, roundRect, bumpFonts, fontCss, inkOn } from "./render.mjs";
import { refreshConnectors, anchorPoint } from "./connectors.mjs";
import { arrangeOps, findFreeSpot } from "./arrange.mjs";
import { parseFlow, parseOutline, flowToOps, outlineToOps } from "./graph.mjs";
import { diagramImage } from "./diagrams.js";
import { InlineEditor } from "./editor.js";
import { DEFAULT_STYLE, BOARD_AREA, TOOL_BY_KEY } from "./tools.mjs";
import { itemLabel } from "./model.mjs";
import { makeEntry } from "./library.mjs";
import { t } from "../i18n.js";

const HANDLE = 9; // screen px
const clipboard = { items: [], at: 0 }; // shared by every view in the page

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const isLineLike = (it) => it.type === "shape" && LINE_SHAPES.includes(it.shapeType);
const TEXTY = new Set(["text", "table", "checklist"]);
// What makes up the "look" of each kind of thing (Copy the look, Paste the look), and which field holds its color
const STYLE_KEYS = { shape: ["strokeColor", "fillColor", "strokeWidth", "strokeStyle", "opacity", "fontSize", "labelColor"], text: ["color", "fontFamily", "fontSize", "align", "bold"], sticky: ["color"], stroke: ["color", "size", "opacity"], frame: ["color", "fillColor"] };
const COLOR_KEYS = { shape: "strokeColor", text: "color", sticky: "color", stroke: "color", frame: "color" };
let styleClipboard = null;

export class BoardView {
  // callbacks: onTool(tool), onSelection(info), onZoom(z), onMenu(ctx), onDiagram(at), onAsk(items), onEditing(bool)
  constructor({ container, store, getSettings, mode = "full", callbacks = {}, label = "Whiteboard" }) {
    this.container = container;
    this.store = store;
    this.getSettings = getSettings;
    this.mode = mode;
    this.cb = callbacks;
    this.tool = "select";
    this.style = { ...DEFAULT_STYLE };
    this.selection = new Set();
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.width = 0;
    this.height = 0;
    this.drag = null;
    this.preview = null; // a page-like object drawn instead of the real one while something is being moved or resized
    this.ghost = null; // { item } a thing being drawn, shown translucent
    this.pointers = new Map();
    this.hover = null;
    this.cursorAt = null;
    this.spacePan = false;
    this.flashes = new Map(); // item id → time it was changed by the robot
    this.laser = []; // your own pointer trail
    this.guides = [];
    this.erasing = new Set();
    this.marquee = null;
    this.images = new ImageCache(() => this.schedule());
    this.dirty = true;
    this.fitted = false;
    this.label = label;
    this.build();
    this.bind();
    this.resize();
    this.unsubs = [
      store.on("doc", () => this.onDoc()),
      store.on("page", () => this.onPage()),
      store.on("change", (c) => this.onChange(c)),
      store.on("frame", () => this.schedule()),
      store.on("ai", () => this.schedule()),
      store.on("history", () => this.cb.onHistory?.(store.historyState())),
    ];
    if (store.doc) this.onDoc();
  }

  // ---------- Building ----------
  build() {
    const c = this.container;
    c.classList.add("wb-view", `wb-view-${this.mode}`);
    if (!c.hasAttribute("tabindex")) c.tabIndex = 0;
    c.setAttribute("role", "application");
    c.setAttribute("aria-label", this.label);
    c.setAttribute("aria-roledescription", "whiteboard");
    this.stage = document.createElement("div");
    this.stage.className = "wb-stage";
    this.bg = document.createElement("canvas");
    this.main = document.createElement("canvas");
    this.over = document.createElement("canvas");
    this.bg.className = "wb-layer wb-bg";
    this.main.className = "wb-layer wb-main";
    this.over.className = "wb-layer wb-over";
    for (const cv of [this.bg, this.main, this.over]) cv.setAttribute("aria-hidden", "true");
    this.bgCtx = this.bg.getContext("2d");
    this.ctx = this.main.getContext("2d");
    this.overCtx = this.over.getContext("2d");
    this.editorLayer = document.createElement("div");
    this.editorLayer.className = "wb-editor-layer";
    this.editor = new InlineEditor(this.editorLayer);
    this.list = document.createElement("ul");
    this.list.className = "wb-a11y-list";
    this.list.setAttribute("aria-label", t("Items on this page"));
    this.hint = document.createElement("div");
    this.hint.className = "wb-hint";
    this.hint.hidden = true;
    this.stage.append(this.bg, this.main, this.over, this.editorLayer, this.hint);
    c.append(this.stage, this.list);
  }

  bind() {
    const s = this.stage;
    this.on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      (this.offs ||= []).push(() => target.removeEventListener(type, fn, opts));
    };
    this.on(s, "pointerdown", (e) => this.onPointerDown(e));
    this.on(s, "pointermove", (e) => this.onPointerMove(e));
    this.on(s, "pointerup", (e) => this.onPointerUp(e));
    this.on(s, "pointercancel", (e) => this.onPointerUp(e, true));
    this.on(s, "pointerleave", () => this.onLeave());
    this.on(s, "wheel", (e) => this.onWheel(e), { passive: false });
    this.on(s, "dblclick", (e) => this.onDoubleClick(e));
    this.on(s, "contextmenu", (e) => this.onContextMenu(e));
    this.on(s, "dragover", (e) => {
      const types = [...(e.dataTransfer?.types || [])];
      if (types.includes("Files") || types.includes("application/x-friends-shape")) e.preventDefault();
    });
    this.on(s, "drop", (e) => this.onDrop(e));
    this.on(this.container, "keydown", (e) => this.onKey(e));
    this.on(this.container, "keyup", (e) => {
      if (e.code === "Space" && this.spacePan) {
        this.spacePan = false;
        this.updateCursor();
      }
    });
    this.on(this.container, "paste", (e) => this.onPaste(e));
    this.on(this.container, "copy", (e) => {
      if (this.editor.active || !this.selection.size) return;
      e.preventDefault();
      this.copy();
    });
    this.on(this.container, "cut", (e) => {
      if (this.editor.active || !this.selection.size) return;
      e.preventDefault();
      this.cut();
    });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.container);
    // The board follows the app between light and dark
    this.themeWatch = new MutationObserver(() => ((this._ink = null), this.schedule()));
    this.themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    this.on(document, "visibilitychange", () => {
      if (!document.hidden) this.schedule();
    });
    if (document.fonts?.ready) document.fonts.ready.then(() => (bumpFonts(), this.schedule()));
    this.on(document.fonts || s, "loadingdone", () => (bumpFonts(), this.schedule()));
  }

  destroy() {
    this.editor.close(false);
    for (const off of this.offs || []) off();
    for (const u of this.unsubs || []) u();
    this.ro?.disconnect();
    this.themeWatch?.disconnect();
    cancelAnimationFrame(this.raf);
    this.container.classList.remove("wb-view", `wb-view-${this.mode}`);
    this.stage.remove();
    this.list.remove();
  }

  // ---------- Settings and theme ----------
  get wb() {
    return this.getSettings()?.whiteboard || {};
  }

  get theme() {
    const th = themeOf(this.wb.dockTheme || "auto");
    return this.wb.smartInk === false ? { ...th, dark: false } : th;
  }

  get page() {
    return this.store.page;
  }

  // The app's own colours for what is drawn over the board: the selection, the robot's pointer
  get ink() {
    const now = performance.now();
    if (!this._ink || now - this._inkAt > 1500) {
      const css = getComputedStyle(document.documentElement);
      const pick = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
      const accent = pick("--accent", "#f5a94a");
      this._ink = { accent, robot: pick("--robot-light", accent) };
      this._inkAt = now;
    }
    return this._ink;
  }

  // ---------- Size and view ----------
  resize() {
    const w = this.stage.clientWidth || this.container.clientWidth || 600;
    const h = this.stage.clientHeight || this.container.clientHeight || 400;
    if (w === this.width && h === this.height && this.dpr === (window.devicePixelRatio || 1)) return;
    const firstSize = !this.width;
    this.width = w;
    this.height = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const cv of [this.bg, this.main, this.over]) {
      cv.width = Math.round(w * this.dpr);
      cv.height = Math.round(h * this.dpr);
    }
    if (firstSize && this.store.doc && !this.fitted) this.fitBoard();
    this.schedule();
  }

  // Shows the whole 1600×1000 board
  fitBoard() {
    if (!this.width) return;
    const pad = this.mode === "full" ? 40 : 12;
    const z = Math.min((this.width - pad * 2) / BOARD_AREA.width, (this.height - pad * 2) / BOARD_AREA.height);
    this.zoom = clamp(z, 0.1, 4);
    this.panX = (this.width - BOARD_AREA.width * this.zoom) / 2;
    this.panY = (this.height - BOARD_AREA.height * this.zoom) / 2;
    this.fitted = true;
    this.cb.onZoom?.(this.zoom);
    this.schedule();
  }

  // Shows everything on the page (or the board, if it is empty)
  fitContent(region = null) {
    const items = this.page?.items || [];
    let box = region;
    if (!box) {
      if (!items.length) return this.fitBoard();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const it of items) {
        const b = itemBox(this.ctx, it);
        minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
      }
      box = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    const pad = this.mode === "full" ? 60 : 24;
    const z = Math.min((this.width - pad * 2) / Math.max(40, box.width), (this.height - pad * 2) / Math.max(40, box.height), 2);
    this.zoom = clamp(z, 0.1, 4);
    this.panX = (this.width - box.width * this.zoom) / 2 - box.x * this.zoom;
    this.panY = (this.height - box.height * this.zoom) / 2 - box.y * this.zoom;
    this.fitted = true;
    this.cb.onZoom?.(this.zoom);
    this.schedule();
  }

  setZoom(z, cx = this.width / 2, cy = this.height / 2) {
    const next = clamp(z, 0.1, 5);
    const k = next / this.zoom;
    this.panX = cx - (cx - this.panX) * k;
    this.panY = cy - (cy - this.panY) * k;
    this.zoom = next;
    this.cb.onZoom?.(this.zoom);
    this.schedule();
  }

  centerOn(x, y) {
    this.panX = this.width / 2 - x * this.zoom;
    this.panY = this.height / 2 - y * this.zoom;
    this.schedule();
  }

  toModel(clientX, clientY) {
    const r = this.stage.getBoundingClientRect();
    return { x: (clientX - r.left - this.panX) / this.zoom, y: (clientY - r.top - this.panY) / this.zoom };
  }

  toScreen(x, y) {
    return { x: x * this.zoom + this.panX, y: y * this.zoom + this.panY };
  }

  // ---------- The board changed ----------
  onDoc() {
    this.editor.close(false);
    this.selection.clear();
    this.preview = null;
    this.flashes.clear();
    if (this.width) this.fitBoard();
    this.afterChange();
  }

  onPage() {
    this.editor.close(false);
    this.selection.clear();
    this.preview = null;
    this.afterChange();
    this.cb.onSelection?.(this.selectionInfo());
  }

  onChange(c) {
    // Things the robot touched flash for a moment
    if (c && !c.local && (c.actor === "ai" || c.actor === "mission") && this.wb.showRobotCursor !== false) {
      const now = performance.now();
      for (const id of c.touched || []) this.flashes.set(id, now);
    }
    // Selected things that are gone are not selected
    let changed = false;
    for (const id of [...this.selection]) {
      if (!this.page?.items.some((it) => it.id === id)) {
        this.selection.delete(id);
        changed = true;
      }
    }
    if (this.drag && this.drag.kind !== "pan" && c && !c.local) this.cancelDrag();
    this.afterChange();
    if (changed || this.selection.size) this.cb.onSelection?.(this.selectionInfo());
  }

  afterChange() {
    this.schedule();
    clearTimeout(this.listTimer);
    this.listTimer = setTimeout(() => this.buildList(), 250);
  }

  // ---------- Painting ----------
  schedule() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.paint();
    });
  }

  viewRect() {
    return { x: -this.panX / this.zoom, y: -this.panY / this.zoom, w: this.width / this.zoom, h: this.height / this.zoom };
  }

  paint() {
    if (!this.width || document.hidden) return;
    const th = this.theme;
    const d = this.dpr;
    const page = this.page;
    // Paper
    const bg = this.bgCtx;
    bg.setTransform(d, 0, 0, d, 0, 0);
    const docBg = this.store.doc?.settings || {};
    const pattern = page?.background?.type && page.background.type !== "grid" ? page.background.type : this.wb.bgPattern || page?.background?.type || docBg.background || "grid";
    drawBackground(bg, this.width, this.height, { zoom: this.zoom, panX: this.panX, panY: this.panY }, pattern, th, this.wb.gridSize || page?.background?.size || 28);
    // The area the robot knows (1600×1000), drawn faintly
    bg.save();
    bg.setTransform(d * this.zoom, 0, 0, d * this.zoom, d * this.panX, d * this.panY);
    bg.strokeStyle = th.dark ? "rgba(255,255,255,.18)" : "rgba(15,23,42,.14)";
    bg.lineWidth = 1.5 / this.zoom;
    bg.setLineDash([10 / this.zoom, 8 / this.zoom]);
    bg.strokeRect(BOARD_AREA.x, BOARD_AREA.y, BOARD_AREA.width, BOARD_AREA.height);
    bg.restore();
    // Things
    const ctx = this.ctx;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.setTransform(d * this.zoom, 0, 0, d * this.zoom, d * this.panX, d * this.panY);
    const shown = this.preview?.page || page;
    if (shown) {
      const hidden = this.editingId ? new Set([this.editingId]) : undefined;
      drawPage(ctx, shown, {
        theme: th,
        reveal: this.store.reveal,
        images: this.images,
        diagram: (item) => diagramImage(item, th.dark, () => this.schedule()),
        hidden,
        view: this.viewRect(),
      });
    }
    this.paintOverlay(th);
    this.schedule2();
    this.cb.onPaint?.();
  }

  // What is on screen right now, drawn into another canvas of the same shape (a video of voice mode)
  drawInto(canvas) {
    const page = this.page;
    if (!page || !this.width) return false;
    const v = this.viewRect();
    const docBg = this.store.doc?.settings || {};
    const pattern = page.background?.type && page.background.type !== "grid" ? page.background.type : this.wb.bgPattern || page.background?.type || docBg.background || "grid";
    const th = this.theme;
    renderPageTo(canvas, this.preview?.page || page, {
      region: { x: v.x, y: v.y, width: v.w, height: v.h },
      theme: th,
      pattern,
      gridSize: this.wb.gridSize || page.background?.size || 28,
      reveal: this.store.reveal,
      images: this.images,
      diagram: (item) => diagramImage(item, th.dark, () => this.schedule()),
    });
    return true;
  }

  // Animations (flashes, the robot's pointer, the pen) keep painting until they're over
  schedule2() {
    const busy = this.flashes.size || this.store.writing || this.laser.length || (this.store.ai && performance.now() - (this.aiShownAt || 0) < 5000 && this.wb.showRobotCursor !== false) || this.drag?.kind === "pen";
    if (busy) this.schedule();
  }

  paintOverlay(th) {
    const d = this.dpr;
    const o = this.overCtx;
    o.setTransform(d, 0, 0, d, 0, 0);
    o.clearRect(0, 0, this.width, this.height);
    o.setTransform(d * this.zoom, 0, 0, d * this.zoom, d * this.panX, d * this.panY);
    const page = this.preview?.page || this.page;
    const now = performance.now();
    const z = this.zoom;
    // A thing being drawn
    if (this.ghost) {
      o.save();
      o.globalAlpha = 0.75;
      drawItem(o, this.ghost, { theme: th, ctx2: this.ctx, images: this.images });
      o.restore();
    }
    // Your pen stroke so far
    if (this.drag?.kind === "pen") {
      const pts = this.drag.points;
      const hl = this.tool === "highlighter";
      drawItem(o, { id: "_live", type: "stroke", points: pts, color: hl ? this.style.hl : this.style.stroke, size: hl ? Math.max(14, this.style.width * 3) : this.style.width, opacity: hl ? 0.4 : this.style.opacity, style: hl ? "highlighter" : this.style.pen }, { theme: th, ctx2: this.ctx });
    }
    // Things the robot just touched
    for (const [id, t0] of this.flashes) {
      const age = now - t0;
      if (age > 1400) {
        this.flashes.delete(id);
        continue;
      }
      const it = page?.items.find((x) => x.id === id);
      if (!it) continue;
      const b = itemBox(this.ctx, it);
      o.save();
      o.strokeStyle = this.ink.robot;
      o.globalAlpha = Math.max(0, (1 - age / 1400) * 0.9);
      o.lineWidth = 3 / z;
      o.beginPath();
      roundRect(o, b.minX - 6, b.minY - 6, b.width + 12, b.height + 12, 8);
      o.stroke();
      o.restore();
    }
    // Who made what
    const authors = this.wb.showAuthors || "hover";
    if (authors !== "off" && page) {
      for (const it of page.items) {
        if (it.author === "user" || it.type === "frame") continue;
        if (authors === "hover" && it.id !== this.hover && !this.selection.has(it.id)) continue;
        const b = itemBox(this.ctx, it);
        this.badge(o, b.maxX, b.minY, it.author === "mission" ? "M" : "AI", z);
      }
    }
    // The marquee
    if (this.marquee) {
      const m = this.marquee;
      o.fillStyle = "rgba(99,102,241,.10)";
      o.strokeStyle = "rgba(99,102,241,.8)";
      o.lineWidth = 1 / z;
      o.fillRect(m.x, m.y, m.w, m.h);
      o.strokeRect(m.x, m.y, m.w, m.h);
    }
    // Things about to be erased
    for (const id of this.erasing) {
      const it = this.page?.items.find((x) => x.id === id);
      if (!it) continue;
      const b = itemBox(this.ctx, it);
      o.fillStyle = "rgba(239,68,68,.18)";
      o.fillRect(b.minX - 3, b.minY - 3, b.width + 6, b.height + 6);
    }
    // Selection
    this.paintSelection(o, page, z);
    // Guides while moving
    if (this.guides.length) {
      o.strokeStyle = "rgba(236,72,153,.9)";
      o.lineWidth = 1 / z;
      o.beginPath();
      for (const g of this.guides) {
        if (g.axis === "x") { o.moveTo(g.at, g.from); o.lineTo(g.at, g.to); }
        else { o.moveTo(g.from, g.at); o.lineTo(g.to, g.at); }
      }
      o.stroke();
    }
    // The glue target of a connector being drawn
    if (this.drag?.kind === "connect" && this.drag.target) {
      const b = itemBox(this.ctx, this.drag.target);
      o.strokeStyle = "rgba(34,197,94,.95)";
      o.lineWidth = 3 / z;
      o.beginPath();
      roundRect(o, b.minX - 5, b.minY - 5, b.width + 10, b.height + 10, 8);
      o.stroke();
    }
    // Your pointer trail
    if (this.laser.length) {
      const keep = this.laser.filter((p) => now - p.t < 900);
      this.laser = keep;
      for (const p of keep) {
        const a = 1 - (now - p.t) / 900;
        o.fillStyle = `rgba(239,68,68,${a * 0.85})`;
        o.beginPath();
        o.arc(p.x, p.y, 6 / z * (0.6 + a * 0.6), 0, Math.PI * 2);
        o.fill();
      }
    }
    // The robot: its pointer and its pen
    this.paintRobot(o, z, now);
  }

  badge(o, x, y, text, z) {
    const s = 1 / z;
    o.save();
    o.translate(x, y);
    o.scale(s, s);
    o.fillStyle = this.ink.robot;
    o.beginPath();
    roundRect(o, -22, -9, 28, 18, 9);
    o.fill();
    o.fillStyle = "#1a1208";
    o.font = "700 10px system-ui, sans-serif";
    o.textAlign = "center";
    o.textBaseline = "middle";
    o.fillText(text, -8, 0.5);
    o.restore();
  }

  paintRobot(o, z, now) {
    if (this.wb.showRobotCursor === false) return;
    const s = 1 / z;
    const style = this.wb.robotPointer || "laser";
    const rc = this.ink.robot;
    const dot = (x, y, label, strong) => {
      o.save();
      o.translate(x, y);
      o.scale(s, s);
      const pulse = 0.85 + Math.sin(now / 160) * 0.15;
      if (style === "arrow") {
        o.fillStyle = rc;
        o.beginPath();
        o.moveTo(0, 0); o.lineTo(0, 22); o.lineTo(6, 17); o.lineTo(11, 28); o.lineTo(15, 26); o.lineTo(10, 15); o.lineTo(17, 15); o.closePath();
        o.fill();
        o.strokeStyle = "#fff"; o.lineWidth = 1.5; o.stroke();
      } else {
        const g = o.createRadialGradient(0, 0, 0, 0, 0, 26 * pulse);
        g.addColorStop(0, strong ? "rgba(239,68,68,.85)" : rc);
        g.addColorStop(1, "rgba(0,0,0,0)");
        o.fillStyle = g;
        o.globalAlpha = 0.8;
        o.beginPath(); o.arc(0, 0, 26 * pulse, 0, Math.PI * 2); o.fill();
        o.globalAlpha = 1;
        o.fillStyle = strong ? "#ef4444" : rc;
        o.beginPath(); o.arc(0, 0, style === "ring" ? 5 : 7, 0, Math.PI * 2); o.fill();
        if (style === "ring") {
          o.strokeStyle = "#ef4444"; o.lineWidth = 3; o.beginPath(); o.arc(0, 0, 16 * pulse, 0, Math.PI * 2); o.stroke();
        }
      }
      if (label) {
        o.font = "600 12px system-ui, sans-serif";
        const w = o.measureText(label).width + 16;
        o.fillStyle = rc;
        o.beginPath(); roundRect(o, 18, 10, w, 22, 11); o.fill();
        o.fillStyle = "#1a1208"; o.textAlign = "left"; o.textBaseline = "middle"; o.fillText(label, 26, 21.5);
      }
      o.restore();
    };
    const tip = this.store.tip;
    const ai = this.store.ai;
    if (this.store.writing && tip) dot(tip.x, tip.y, "", false);
    if (ai && ai.action === "pointing" && now - (ai.since || 0) < 5000 && Number.isFinite(ai.x)) {
      this.aiShownAt = now;
      dot(ai.x, ai.y, ai.label || "", true);
    } else if (ai && ai.action === "looking" && now - (ai.since || 0) < 1800) {
      this.aiShownAt = now;
    }
  }

  paintSelection(o, page, z) {
    if (!this.selection.size || !page) return;
    const items = [...this.selection].map((id) => page.items.find((it) => it.id === id)).filter(Boolean);
    if (!items.length) return;
    const s = 1 / z;
    const single = items.length === 1 ? items[0] : null;
    o.save();
    o.strokeStyle = this.ink.accent;
    o.fillStyle = "#fff";
    if (single && isLineLike(single) && single.points?.length >= 2) {
      o.lineWidth = 1.5 * s;
      o.setLineDash([5 * s, 4 * s]);
      o.beginPath();
      single.points.forEach((p, i) => (i ? o.lineTo(p.x, p.y) : o.moveTo(p.x, p.y)));
      o.stroke();
      o.setLineDash([]);
      const ends = [0, single.points.length - 1];
      for (const i of ends) {
        const p = single.points[i];
        o.beginPath();
        o.arc(p.x, p.y, 6 * s, 0, Math.PI * 2);
        o.fill();
        o.lineWidth = 2 * s;
        o.stroke();
      }
      o.restore();
      return;
    }
    // Each selected thing gets a thin outline; the whole gets handles
    o.lineWidth = 1.2 * s;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const it of items) {
      const b = itemBox(this.ctx, it);
      minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
      if (items.length > 1) {
        o.setLineDash([4 * s, 3 * s]);
        o.strokeRect(b.minX - 2 * s, b.minY - 2 * s, b.width + 4 * s, b.height + 4 * s);
      }
    }
    const pad = 4 * s;
    o.setLineDash(items.some((it) => it.locked) ? [3 * s, 3 * s] : []);
    o.lineWidth = 1.6 * s;
    o.strokeRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2);
    o.setLineDash([]);
    if (!items.some((it) => it.locked) && this.mode !== "voice") {
      for (const h of this.handleSpots(minX - pad, minY - pad, maxX + pad, maxY + pad)) {
        o.beginPath();
        roundRect(o, h.x - HANDLE * s / 2, h.y - HANDLE * s / 2, HANDLE * s, HANDLE * s, 2 * s);
        o.fill();
        o.stroke();
      }
    }
    o.restore();
    this.paintConnectSpots(o);
  }

  handleSpots(x0, y0, x1, y1) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return [
      { id: "nw", x: x0, y: y0 }, { id: "n", x: cx, y: y0 }, { id: "ne", x: x1, y: y0 }, { id: "e", x: x1, y: cy },
      { id: "se", x: x1, y: y1 }, { id: "s", x: cx, y: y1 }, { id: "sw", x: x0, y: y1 }, { id: "w", x: x0, y: cy },
    ];
  }

  // ---------- Where the selection is ----------
  selectionBox() {
    const items = this.selectedItems();
    if (!items.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const it of items) {
      const b = itemBox(this.ctx, it);
      minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  // The selection in pixels inside the board (for a bar that floats next to it)
  selectionRect() {
    const b = this.selectionBox();
    if (!b) return null;
    const a = this.toScreen(b.minX, b.minY);
    const c = this.toScreen(b.maxX, b.maxY);
    return { left: a.x, top: a.y, right: c.x, bottom: c.y, width: c.x - a.x, height: c.y - a.y };
  }

  // Puts the selection at a place and size (any of x, y, width, height); the things in it are moved and scaled together
  setSelectionBox({ x, y, width, height }) {
    const items = this.selectedItems().filter((it) => !it.locked);
    const box = this.selectionBox();
    if (!items.length || !box) return;
    const to = { minX: Number.isFinite(x) ? x : box.minX, minY: Number.isFinite(y) ? y : box.minY, maxX: 0, maxY: 0 };
    to.maxX = to.minX + (Number.isFinite(width) ? Math.max(16, width) : box.width);
    to.maxY = to.minY + (Number.isFinite(height) ? Math.max(16, height) : box.height);
    const moved = to.maxX - to.minX === box.width && to.maxY - to.minY === box.height;
    if (moved) {
      const dx = Math.round((to.minX - box.minX) * 10) / 10;
      const dy = Math.round((to.minY - box.minY) * 10) / 10;
      if (dx || dy) this.store.apply({ op: "translate", page: this.page.id, ids: items.map((i) => i.id), dx, dy });
      return;
    }
    const patches = this.resizePatches(items, box, to, "e");
    this.store.apply([...patches].map(([id, set]) => {
      const clean = {};
      for (const [k, v] of Object.entries(set)) clean[k] = typeof v === "number" ? Math.round(v * 10) / 10 : v;
      return { op: "update", page: this.page.id, id, set: clean };
    }));
  }

  // ---------- The arrows around a selected box (draw.io's way of building a diagram) ----------
  // Click one to grow the next box from it, or drag it to another thing to join them with an arrow
  connectSpots() {
    if (this.mode === "voice" || this.tool !== "select" || this.drag) return [];
    const items = this.selectedItems();
    if (items.length !== 1) return [];
    const it = items[0];
    if (it.locked || isLineLike(it) || !["shape", "sticky", "text", "image", "table", "checklist"].includes(it.type)) return [];
    const b = itemBox(this.ctx, it);
    const gap = 30 / this.zoom;
    return [["top", b.cx, b.minY - gap, 0, -1], ["right", b.maxX + gap, b.cy, 1, 0], ["bottom", b.cx, b.maxY + gap, 0, 1], ["left", b.minX - gap, b.cy, -1, 0]].map(([side, x, y, dx, dy]) => ({ side, x, y, dx, dy, item: it }));
  }

  connectSpotAt(clientX, clientY) {
    const r = this.stage.getBoundingClientRect();
    for (const sp of this.connectSpots()) {
      const p = this.toScreen(sp.x, sp.y);
      if (Math.hypot(p.x - (clientX - r.left), p.y - (clientY - r.top)) <= 15) return sp;
    }
    return null;
  }

  paintConnectSpots(o) {
    const s = 1 / this.zoom;
    for (const sp of this.connectSpots()) {
      o.save();
      o.translate(sp.x, sp.y);
      o.scale(s, s);
      o.fillStyle = this.ink.accent;
      o.globalAlpha = this.hoverSpot === sp.side ? 1 : 0.88;
      o.beginPath();
      o.arc(0, 0, this.hoverSpot === sp.side ? 13 : 11, 0, Math.PI * 2);
      o.fill();
      o.globalAlpha = 1;
      o.rotate(Math.atan2(sp.dy, sp.dx));
      o.strokeStyle = "#1a1208";
      o.lineWidth = 2;
      o.lineCap = "round";
      o.lineJoin = "round";
      o.beginPath();
      o.moveTo(-4.5, 0); o.lineTo(4.5, 0); o.moveTo(1, -3.6); o.lineTo(4.6, 0); o.lineTo(1, 3.6);
      o.stroke();
      o.restore();
    }
  }

  // A copy of a thing next to it, joined to it by an arrow (a click on one of the arrows)
  growFrom(item, side) {
    const gap = 90;
    const b = itemBox(this.ctx, item);
    const dx = side === "right" ? b.width + gap : side === "left" ? -(b.width + gap) : 0;
    const dy = side === "bottom" ? b.height + gap : side === "top" ? -(b.height + gap) : 0;
    const copy = JSON.parse(JSON.stringify(item));
    for (const key of ["id", "author", "createdAt", "updatedAt", "locked", "label", "text"]) delete copy[key];
    if (item.type === "sticky") copy.text = "";
    const id = genId(item.type);
    const other = { top: "bottom", bottom: "top", left: "right", right: "left" }[side];
    const here = anchorPoint(item, side);
    const there = anchorPoint({ ...copy, id, x: item.x + dx, y: item.y + dy }, other);
    const arrow = { type: "shape", shapeType: "connector", route: "elbow", points: [{ x: here.x, y: here.y }, { x: there.x, y: there.y }], from: { id: item.id, port: side }, to: { id, port: other }, strokeColor: this.style.stroke, strokeWidth: Math.max(2, this.style.width / 1.5), arrowEnd: true };
    this.store.apply([{ op: "add", page: this.page.id, item: { ...copy, id, x: item.x + dx, y: item.y + dy } }, { op: "add", page: this.page.id, item: arrow }]).then((res) => {
      if (!res?.applied?.length) return;
      this.setSelection([id]);
      const made = this.page.items.find((it) => it.id === id);
      if (made && made.type === "shape") this.editText(made, "label");
      else if (made && made.type === "sticky") this.editText(made, "text");
      const at = this.toScreen(item.x + dx + (item.width || 0) / 2, item.y + dy + (item.height || 0) / 2);
      if (at.x < 60 || at.y < 60 || at.x > this.width - 60 || at.y > this.height - 60) this.centerOn(item.x + dx + (item.width || 0) / 2, item.y + dy + (item.height || 0) / 2);
    });
  }

  // Something from the shape library, with its middle at a point (or in the middle of what you see)
  addLibraryEntry(key, at = null) {
    const p = at || this.centerPoint();
    const items = makeEntry(key, Math.round(p.x), Math.round(p.y));
    if (!items.length) return Promise.resolve(null);
    const ids = items.map((it) => genId(it.type));
    return this.store.apply(items.map((item, i) => ({ op: "add", page: this.page.id, item: { ...item, id: ids[i] } }))).then((res) => {
      if (res?.applied?.length) {
        this.setTool("select");
        this.setSelection(ids);
        const first = this.page.items.find((it) => it.id === ids[0]);
        if (items.length === 1 && first) {
          if (first.type === "shape") this.editText(first, "label");
          else if (first.type === "text") this.editText(first, "text");
        }
      }
      return res;
    });
  }

  // ---------- Tools ----------
  setTool(tool, { keepSelection = false } = {}) {
    if (this.drag) this.cancelDrag();
    this.editor.close(true);
    this.tool = tool;
    if (!keepSelection && tool !== "select") this.setSelection([]);
    this.ghost = null;
    this.updateCursor();
    this.cb.onTool?.(tool);
    this.schedule();
  }

  setStyle(patch) {
    Object.assign(this.style, patch);
    this.cb.onStyle?.(this.style);
  }

  updateCursor() {
    const t = this.spacePan ? "hand" : this.tool;
    const map = { hand: this.drag?.kind === "pan" ? "grabbing" : "grab", select: "default", eraser: "cell", text: "text", laser: "none" };
    this.stage.style.cursor = map[t] || "crosshair";
    this.container.dataset.tool = t;
  }

  // ---------- Selection ----------
  setSelection(ids) {
    const next = new Set(ids);
    const same = next.size === this.selection.size && [...next].every((i) => this.selection.has(i));
    this.selection = next;
    if (!same) {
      this.cb.onSelection?.(this.selectionInfo());
      this.store.sendPresence({ selection: [...next] });
    }
    this.schedule();
  }

  selectedItems() {
    return [...this.selection].map((id) => this.page?.items.find((it) => it.id === id)).filter(Boolean);
  }

  selectionInfo() {
    const items = this.selectedItems();
    return { ids: items.map((i) => i.id), items, types: [...new Set(items.map((i) => i.type))], locked: items.some((i) => i.locked), count: items.length };
  }

  selectAll() {
    this.setSelection((this.page?.items || []).filter((it) => it.type !== "frame" || true).map((it) => it.id));
  }

  // ---------- Hit testing ----------
  itemAt(x, y, tol = 6) {
    const items = this.page?.items || [];
    const t = tol / this.zoom;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (TEXTY.has(it.type)) {
        const b = itemBox(this.ctx, it);
        if (x >= b.minX - t && x <= b.maxX + t && y >= b.minY - t && y <= b.maxY + t) return it;
      } else if (hitTest(it, x, y, t)) return it;
    }
    return null;
  }

  handleAt(clientX, clientY) {
    const items = this.selectedItems();
    if (!items.length || items.some((it) => it.locked) || this.mode === "voice") return null;
    const r = this.stage.getBoundingClientRect();
    const sx = clientX - r.left, sy = clientY - r.top;
    const near = (px, py) => Math.hypot(px - sx, py - sy) <= HANDLE + 3;
    if (items.length === 1 && isLineLike(items[0]) && items[0].points) {
      const pts = items[0].points;
      for (const i of [0, pts.length - 1]) {
        const p = this.toScreen(pts[i].x, pts[i].y);
        if (near(p.x, p.y)) return { kind: "end", index: i };
      }
      return null;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const it of items) {
      const b = itemBox(this.ctx, it);
      minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
    }
    const pad = 4 / this.zoom;
    for (const h of this.handleSpots(minX - pad, minY - pad, maxX + pad, maxY + pad)) {
      const p = this.toScreen(h.x, h.y);
      if (near(p.x, p.y)) return { kind: "resize", handle: h.id, box: { minX, minY, maxX, maxY } };
    }
    return null;
  }

  // ---------- Pointer ----------
  onPointerDown(e) {
    this.container.focus({ preventScroll: true });
    if (this.editor.active) this.editor.close(true);
    this.stage.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.store.finishReveal?.();
    if (this.pointers.size === 2) return this.startPinch();
    if (this.pointers.size > 2) return;
    const m = this.toModel(e.clientX, e.clientY);
    const tool = this.spacePan || e.button === 1 ? "hand" : this.tool;
    if (e.button === 2) return; // the menu
    if (this.wb.collaborationMode === "robot_only" && !["hand", "laser", "select"].includes(tool)) {
      this.say(t("The board is set so that only the robot draws on it."));
      return;
    }
    switch (tool) {
      case "hand":
        this.drag = { kind: "pan", sx: e.clientX, sy: e.clientY, px: this.panX, py: this.panY };
        this.updateCursor();
        break;
      case "select":
        this.downSelect(e, m);
        break;
      case "pen":
      case "highlighter": {
        const p = e.pointerType === "pen" || e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : 0.5;
        this.drag = { kind: "pen", points: [{ x: m.x, y: m.y, p, t: 0 }], t0: performance.now(), last: m, shift: false };
        this.store.sendPresence({ pointer: m, tool: this.tool, drawing: true });
        if (this.wb.sound !== false) this.sound("marker");
        break;
      }
      case "eraser":
        this.drag = { kind: "erase" };
        this.eraseAt(m);
        break;
      case "laser":
        this.drag = { kind: "laser" };
        this.laserTo(m);
        break;
      case "shape":
      case "frame":
      case "line":
      case "connector":
        this.downShape(tool, m, e);
        break;
      case "text":
        this.beginText(m, { format: "plain" });
        break;
      case "math":
        this.beginText(m, { format: "math" });
        break;
      case "code":
        this.beginText(m, { format: "code" });
        break;
      case "sticky":
        this.beginSticky(m);
        break;
      case "checklist":
        this.beginChecklist(m);
        break;
      case "table":
        this.addTable(m);
        break;
      case "diagram":
        this.cb.onDiagram?.(m);
        break;
      case "image":
        this.pickImage(m);
        break;
      default:
        break;
    }
  }

  downSelect(e, m) {
    const spot = this.connectSpotAt(e.clientX, e.clientY);
    if (spot) {
      this.drag = { kind: "connect", start: m, from: spot.item, fromPort: spot.side, target: null, cur: m, moved: false, grow: true };
      return;
    }
    const handle = this.handleAt(e.clientX, e.clientY);
    if (handle) {
      const items = this.selectedItems();
      if (handle.kind === "end") {
        this.drag = { kind: "end", item: items[0], index: handle.index, moved: false };
      } else {
        this.drag = { kind: "resize", handle: handle.handle, box: handle.box, items: items.map((it) => JSON.parse(JSON.stringify(it))), start: m, moved: false, shift: e.shiftKey };
      }
      return;
    }
    const hit = this.itemAt(m.x, m.y);
    if (hit) {
      if (e.shiftKey) {
        const next = new Set(this.selection);
        if (next.has(hit.id)) next.delete(hit.id);
        else next.add(hit.id);
        this.setSelection([...next]);
        if (!next.has(hit.id)) return;
      } else if (!this.selection.has(hit.id)) this.setSelection([hit.id]);
      // A checklist box is ticked by a click on it
      if (hit.type === "checklist" && !e.shiftKey) {
        const tick = this.checklistHit(hit, m);
        if (tick) {
          this.store.apply({ op: "check", page: this.page.id, id: hit.id, item: tick.id, checked: "toggle" });
          return;
        }
      }
      const moving = this.selectedItems().filter((it) => !it.locked);
      // A frame carries what is inside it
      const carried = new Set(moving.map((it) => it.id));
      for (const f of moving.filter((it) => it.type === "frame")) {
        const fb = getBoundingBox(f);
        for (const it of this.page.items) {
          if (it === f || carried.has(it.id) || it.locked) continue;
          const b = itemBox(this.ctx, it);
          if (b.cx >= fb.minX && b.cx <= fb.maxX && b.cy >= fb.minY && b.cy <= fb.maxY) carried.add(it.id);
        }
      }
      this.drag = { kind: "move", start: m, ids: [...carried], moved: false, copy: e.altKey, dx: 0, dy: 0 };
      this.store.sendPresence({ pointer: m, tool: "select" });
      return;
    }
    if (!e.shiftKey) this.setSelection([]);
    this.drag = { kind: "marquee", start: m, add: e.shiftKey, base: new Set(this.selection) };
  }

  checklistHit(item, m) {
    const lay = checklistLayout(this.ctx, item);
    for (const row of lay.rows) {
      const x0 = item.x + row.box.x - 4, y0 = item.y + row.box.y - 4;
      if (m.x >= x0 && m.x <= x0 + row.box.size + 8 && m.y >= y0 && m.y <= y0 + row.box.size + 8) return row;
    }
    return null;
  }

  downShape(tool, m, e) {
    if (tool === "connector") {
      const from = this.itemAt(m.x, m.y, 10);
      this.drag = { kind: "connect", start: m, from: from && !isLineLike(from) && from.type !== "stroke" ? from : null, target: null, cur: m };
      return;
    }
    this.drag = { kind: "shape", tool, start: m, cur: m, shift: e.shiftKey };
  }

  onPointerMove(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch) return this.movePinch();
    const m = this.toModel(e.clientX, e.clientY);
    this.cursorAt = m;
    const d = this.drag;
    if (!d) {
      this.hoverAt(m, e);
      if (this.tool === "laser" || this.spacePan === false && this.tool === "laser") this.laserTo(m);
      return;
    }
    switch (d.kind) {
      case "pan":
        this.panX = d.px + (e.clientX - d.sx);
        this.panY = d.py + (e.clientY - d.sy);
        this.schedule();
        break;
      case "pen": {
        const last = d.points[d.points.length - 1];
        const min = 1.4 / this.zoom;
        for (const ev of e.getCoalescedEvents?.() || [e]) {
          const pm = this.toModel(ev.clientX, ev.clientY);
          if (Math.hypot(pm.x - last.x, pm.y - last.y) < min && d.points.length > 1) continue;
          const p = ev.pointerType === "pen" ? ev.pressure : 0.5;
          d.points.push({ x: pm.x, y: pm.y, p, t: Math.round(performance.now() - d.t0) });
          if (d.points.length > 4000) break;
        }
        d.shift = e.shiftKey;
        this.store.sendPresence({ pointer: m, tool: this.tool, drawing: true });
        this.schedule();
        break;
      }
      case "erase":
        this.eraseAt(m);
        break;
      case "laser":
        this.laserTo(m);
        break;
      case "marquee": {
        const x = Math.min(d.start.x, m.x), y = Math.min(d.start.y, m.y), w = Math.abs(m.x - d.start.x), h = Math.abs(m.y - d.start.y);
        this.marquee = { x, y, w, h };
        const ids = new Set(d.base);
        for (const it of this.page.items) {
          const b = itemBox(this.ctx, it);
          const inside = it.type === "frame" ? b.minX >= x && b.maxX <= x + w && b.minY >= y && b.maxY <= y + h : hitTestBox(it, x, y, x + w, y + h);
          if (inside) ids.add(it.id);
        }
        this.selection = ids;
        this.schedule();
        break;
      }
      case "move":
        this.moveTo(d, m, e);
        break;
      case "resize":
        this.resizeTo(d, m, e);
        break;
      case "end":
        this.endTo(d, m, e);
        break;
      case "shape":
        d.cur = m;
        d.shift = e.shiftKey;
        this.ghost = this.shapeGhost(d);
        this.schedule();
        break;
      case "connect": {
        d.cur = m;
        const t = this.itemAt(m.x, m.y, 10);
        d.target = t && t !== d.from && !isLineLike(t) && t.type !== "stroke" ? t : null;
        this.ghost = this.connectorGhost(d);
        this.schedule();
        break;
      }
      default:
        break;
    }
  }

  hoverAt(m, e) {
    const hit = this.tool === "select" ? this.itemAt(m.x, m.y) : null;
    const id = hit?.id || null;
    if (id !== this.hover) {
      this.hover = id;
      if (this.wb.showAuthors === "hover") this.schedule();
    }
    if (this.tool === "select") {
      const spot = this.connectSpotAt(e.clientX, e.clientY);
      if ((spot?.side || null) !== (this.hoverSpot || null)) {
        this.hoverSpot = spot?.side || null;
        this.schedule();
      }
      if (spot) {
        this.stage.style.cursor = "copy";
        return;
      }
      const h = this.handleAt(e.clientX, e.clientY);
      this.stage.style.cursor = h ? (h.kind === "end" ? "crosshair" : { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" }[h.handle]) : hit ? (hit.locked ? "not-allowed" : "move") : "default";
    }
    if (this.mode !== "voice" || this.store.doc) this.store.sendPresence({ pointer: m, tool: this.tool });
  }

  onLeave() {
    this.hover = null;
    this.cursorAt = null;
  }

  onPointerUp(e, cancelled = false) {
    this.pointers.delete(e.pointerId);
    this.stage.releasePointerCapture?.(e.pointerId);
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null;
      return;
    }
    const d = this.drag;
    if (!d) return;
    const m = this.toModel(e.clientX, e.clientY);
    this.drag = null;
    this.guides = [];
    if (cancelled) {
      this.preview = null;
      this.ghost = null;
      this.marquee = null;
      this.erasing.clear();
      this.updateCursor();
      this.schedule();
      return;
    }
    switch (d.kind) {
      case "pan":
        this.updateCursor();
        break;
      case "pen":
        this.commitStroke(d);
        break;
      case "erase":
        this.commitErase();
        break;
      case "marquee":
        this.marquee = null;
        this.cb.onSelection?.(this.selectionInfo());
        this.store.sendPresence({ selection: [...this.selection] });
        break;
      case "move":
        this.commitMove(d);
        break;
      case "resize":
        this.commitResize(d);
        break;
      case "end":
        this.commitEnd(d, m);
        break;
      case "shape":
        this.commitShape(d, m);
        break;
      case "connect":
        this.commitConnector(d, m);
        break;
      default:
        break;
    }
    this.schedule();
  }

  cancelDrag() {
    this.drag = null;
    this.preview = null;
    this.ghost = null;
    this.marquee = null;
    this.guides = [];
    this.erasing.clear();
    this.updateCursor();
    this.schedule();
  }

  // ---------- Two fingers ----------
  startPinch() {
    this.cancelDrag();
    const [a, b] = [...this.pointers.values()];
    this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, zoom: this.zoom, panX: this.panX, panY: this.panY };
  }

  movePinch() {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return;
    const p = this.pinch;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const r = this.stage.getBoundingClientRect();
    const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
    const z = clamp(p.zoom * (dist / Math.max(1, p.dist)), 0.1, 5);
    const k = z / p.zoom;
    const ox = p.cx - r.left, oy = p.cy - r.top;
    this.zoom = z;
    this.panX = cx - (ox - p.panX) * k;
    this.panY = cy - (oy - p.panY) * k;
    this.cb.onZoom?.(z);
    this.schedule();
  }

  onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const r = this.stage.getBoundingClientRect();
      this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
    } else {
      this.panX -= e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      this.panY -= e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      this.schedule();
    }
  }

  // ---------- Pen, eraser, pointer ----------
  commitStroke(d) {
    const hl = this.tool === "highlighter";
    let pts = d.points;
    if (pts.length < 2) {
      // A tap makes a dot
      pts = [pts[0], { ...pts[0], t: 30 }];
    }
    if (d.shift && pts.length > 2) pts = [pts[0], pts[pts.length - 1]];
    const t0 = Date.now() - (pts.at(-1)?.t || 0);
    const size = hl ? Math.max(14, this.style.width * 3) : this.style.width * (this.style.pen === "pen" ? 0.8 : 1);
    const item = { type: "stroke", points: pts, color: hl ? this.style.hl : this.style.stroke, size, opacity: hl ? 0.4 : this.style.opacity, style: hl ? "highlighter" : this.style.pen, t0, duration: pts.at(-1)?.t || 0 };
    this.store.apply({ op: "add", page: this.page.id, item, ...(hl ? { at: "back" } : {}) });
    this.store.sendPresence({ drawing: true });
    this.schedule();
  }

  eraseAt(m) {
    const t = 10 / this.zoom;
    const items = this.page?.items || [];
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.locked || it.type === "frame" && !hitTest(it, m.x, m.y, t)) continue;
      const hit = TEXTY.has(it.type) ? (() => { const b = itemBox(this.ctx, it); return m.x >= b.minX && m.x <= b.maxX && m.y >= b.minY && m.y <= b.maxY; })() : hitTest(it, m.x, m.y, t);
      if (hit) {
        this.erasing.add(it.id);
        if (it.type === "stroke") continue; // strokes under the pointer all go; for others only the top one
        break;
      }
    }
    this.store.sendPresence({ pointer: m, tool: "eraser", drawing: true });
    this.schedule();
  }

  commitErase() {
    const ids = [...this.erasing];
    this.erasing.clear();
    if (ids.length) {
      this.store.apply({ op: "remove", page: this.page.id, ids });
      if (this.wb.sound !== false) this.sound("eraser");
      this.setSelection([...this.selection].filter((i) => !ids.includes(i)));
    }
  }

  laserTo(m) {
    this.laser.push({ x: m.x, y: m.y, t: performance.now() });
    if (this.laser.length > 40) this.laser.shift();
    this.store.sendPresence({ pointer: m, tool: "laser" });
    this.schedule();
  }

  sound(kind) {
    import("../robot/sound.js").then(({ robotSound }) => robotSound.play(kind)).catch(() => {});
  }

  say(text) {
    this.hint.textContent = text;
    this.hint.hidden = false;
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => (this.hint.hidden = true), 2600);
  }

  // ---------- Moving ----------
  snapValue(v) {
    const g = this.wb.gridSize || 28;
    return Math.round(v / g) * g;
  }

  moveTo(d, m, e) {
    let dx = m.x - d.start.x, dy = m.y - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) * this.zoom < 3) return;
    d.moved = true;
    if (e.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    const items = d.ids.map((id) => this.page.items.find((it) => it.id === id)).filter(Boolean);
    if (!items.length) return;
    // Snap the moving group to the grid or to the edges of other things
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const it of items) {
      const b = itemBox(this.ctx, it);
      minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
    }
    this.guides = [];
    if (this.wb.snapToGrid && !e.altKey) {
      dx = this.snapValue(minX + dx) - minX;
      dy = this.snapValue(minY + dy) - minY;
    } else if (this.wb.smartGuides !== false && !e.metaKey) {
      const tol = 6 / this.zoom;
      const others = this.page.items.filter((it) => !d.ids.includes(it.id) && it.type !== "stroke").map((it) => itemBox(this.ctx, it));
      const mine = { xs: [minX + dx, (minX + maxX) / 2 + dx, maxX + dx], ys: [minY + dy, (minY + maxY) / 2 + dy, maxY + dy] };
      let bestX = null, bestY = null;
      for (const o of others) {
        for (const ox of [o.minX, o.cx, o.maxX]) for (const mx of mine.xs) if (Math.abs(ox - mx) < tol && (!bestX || Math.abs(ox - mx) < Math.abs(bestX.d))) bestX = { d: ox - mx, at: ox, o };
        for (const oy of [o.minY, o.cy, o.maxY]) for (const my of mine.ys) if (Math.abs(oy - my) < tol && (!bestY || Math.abs(oy - my) < Math.abs(bestY.d))) bestY = { d: oy - my, at: oy, o };
      }
      if (bestX) { dx += bestX.d; this.guides.push({ axis: "x", at: bestX.at, from: Math.min(bestX.o.minY, minY + dy) - 12, to: Math.max(bestX.o.maxY, maxY + dy) + 12 }); }
      if (bestY) { dy += bestY.d; this.guides.push({ axis: "y", at: bestY.at, from: Math.min(bestY.o.minX, minX + dx) - 12, to: Math.max(bestY.o.maxX, maxX + dx) + 12 }); }
    }
    d.dx = dx;
    d.dy = dy;
    this.preview = this.previewPage((clone) => {
      for (const it of clone) if (d.ids.includes(it.id)) translateItem(it, dx, dy);
    }, d.copy);
    this.store.sendPresence({ pointer: m, tool: "select" });
    this.schedule();
  }

  // A copy of the page with changes applied for display only (connectors follow)
  previewPage(change, keepOriginals = false) {
    const clone = this.page.items.map((it) => JSON.parse(JSON.stringify(it)));
    change(clone);
    const page = { ...this.page, items: keepOriginals ? [...this.page.items, ...clone.filter((c) => this.drag?.ids?.includes(c.id))] : clone };
    refreshConnectors(page);
    return { page };
  }

  commitMove(d) {
    this.preview = null;
    if (!d.moved || (!d.dx && !d.dy)) return;
    if (d.copy) {
      const items = d.ids.map((id) => this.page.items.find((it) => it.id === id)).filter(Boolean);
      const adds = this.cloneOps(items, d.dx, d.dy);
      this.store.apply(adds.ops).then((res) => {
        if (res?.applied) this.setSelection(res.applied.filter((o) => o.op === "add").map((o) => o.item.id));
      });
      return;
    }
    this.store.apply({ op: "translate", page: this.page.id, ids: d.ids, dx: Math.round(d.dx * 10) / 10, dy: Math.round(d.dy * 10) / 10 });
  }

  // ---------- Resizing ----------
  resizeTo(d, m, e) {
    const { box, handle } = d;
    const dx = m.x - d.start.x, dy = m.y - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) * this.zoom < 3) return;
    d.moved = true;
    let { minX, minY, maxX, maxY } = box;
    if (handle.includes("e")) maxX += dx;
    if (handle.includes("w")) minX += dx;
    if (handle.includes("s")) maxY += dy;
    if (handle.includes("n")) minY += dy;
    const w0 = box.maxX - box.minX, h0 = box.maxY - box.minY;
    if (e.shiftKey && w0 > 0 && h0 > 0 && handle.length === 2) {
      const k = Math.max(Math.abs(maxX - minX) / w0, Math.abs(maxY - minY) / h0);
      if (handle.includes("e")) maxX = minX + w0 * k; else minX = maxX - w0 * k;
      if (handle.includes("s")) maxY = minY + h0 * k; else minY = maxY - h0 * k;
    }
    if (this.wb.snapToGrid) {
      if (handle.includes("e")) maxX = this.snapValue(maxX);
      if (handle.includes("w")) minX = this.snapValue(minX);
      if (handle.includes("s")) maxY = this.snapValue(maxY);
      if (handle.includes("n")) minY = this.snapValue(minY);
    }
    if (maxX - minX < 16) { if (handle.includes("w")) minX = maxX - 16; else maxX = minX + 16; }
    if (maxY - minY < 16) { if (handle.includes("n")) minY = maxY - 16; else maxY = minY + 16; }
    d.next = { minX, minY, maxX, maxY };
    d.patches = this.resizePatches(d.items, box, d.next, handle);
    this.preview = this.previewPage((clone) => {
      for (const it of clone) {
        const patch = d.patches.get(it.id);
        if (patch) Object.assign(it, patch);
      }
    });
    this.schedule();
  }

  resizePatches(items, from, to, handle) {
    const sx = (to.maxX - to.minX) / Math.max(1, from.maxX - from.minX);
    const sy = (to.maxY - to.minY) / Math.max(1, from.maxY - from.minY);
    const patches = new Map();
    for (const it of items) {
      if (it.type === "stroke") {
        patches.set(it.id, { points: it.points.map((p) => ({ ...p, x: to.minX + (p.x - from.minX) * sx, y: to.minY + (p.y - from.minY) * sy })) });
      } else if (isLineLike(it)) {
        patches.set(it.id, { points: it.points.map((p) => ({ x: to.minX + (p.x - from.minX) * sx, y: to.minY + (p.y - from.minY) * sy })) });
      } else {
        const b = getBoundingBox(it);
        const x = to.minX + (b.minX - from.minX) * sx, y = to.minY + (b.minY - from.minY) * sy;
        const patch = { x, y, width: Math.max(16, b.width * sx), height: Math.max(16, b.height * sy) };
        if (it.type === "text") {
          // The words flow into the new width; a corner also makes them bigger or smaller
          patch.height = it.height;
          if (handle.length === 2) patch.fontSize = clamp((it.fontSize || 20) * Math.max(0.3, (sx + sy) / 2), 8, 160);
        } else if (it.type === "table" || it.type === "checklist") patch.height = it.height;
        patches.set(it.id, patch);
      }
    }
    return patches;
  }

  commitResize(d) {
    this.preview = null;
    if (!d.moved || !d.patches) return;
    const ops = [...d.patches].map(([id, set]) => {
      const clean = {};
      for (const [k, v] of Object.entries(set)) clean[k] = typeof v === "number" ? Math.round(v * 10) / 10 : v;
      return { op: "update", page: this.page.id, id, set: clean };
    });
    this.store.apply(ops);
  }

  endTo(d, m, e) {
    d.moved = true;
    let p = { x: m.x, y: m.y };
    if (e.shiftKey) {
      const other = d.item.points[d.index === 0 ? d.item.points.length - 1 : 0];
      const dx = p.x - other.x, dy = p.y - other.y;
      const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const r = Math.hypot(dx, dy);
      p = { x: other.x + Math.cos(a) * r, y: other.y + Math.sin(a) * r };
    }
    d.point = p;
    d.target = d.item.shapeType === "connector" ? this.itemAt(m.x, m.y, 10) : null;
    if (d.target && (d.target.id === d.item.id || isLineLike(d.target) || d.target.type === "stroke")) d.target = null;
    this.preview = this.previewPage((clone) => {
      const it = clone.find((c) => c.id === d.item.id);
      if (!it) return;
      it.points[d.index === 0 ? 0 : it.points.length - 1] = p;
      if (it.shapeType === "connector") {
        if (d.index === 0) delete it.from; else delete it.to;
      }
    });
    this.schedule();
  }

  commitEnd(d) {
    this.preview = null;
    if (!d.moved || !d.point) return;
    const it = d.item;
    const pts = it.points.map((p) => ({ x: p.x, y: p.y }));
    const i = d.index === 0 ? 0 : pts.length - 1;
    pts[i] = { x: Math.round(d.point.x * 10) / 10, y: Math.round(d.point.y * 10) / 10 };
    const set = { points: pts };
    if (it.shapeType === "connector") {
      if (d.target) set[d.index === 0 ? "from" : "to"] = { id: d.target.id, port: "auto" };
      else set[d.index === 0 ? "from" : "to"] = null;
    }
    this.store.apply({ op: "update", page: this.page.id, id: it.id, set });
  }

  // ---------- Creating things by dragging ----------
  shapeGhost(d) {
    const a = d.start, b = d.cur;
    let w = b.x - a.x, h = b.y - a.y;
    if (d.shift && d.tool !== "line") {
      const k = Math.max(Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * k;
      h = Math.sign(h || 1) * k;
    }
    if (d.tool === "line") {
      if (d.shift) {
        const ang = Math.round(Math.atan2(h, w) / (Math.PI / 4)) * (Math.PI / 4);
        const r = Math.hypot(w, h);
        w = Math.cos(ang) * r;
        h = Math.sin(ang) * r;
      }
      return { id: "_ghost", type: "shape", shapeType: this.style.line === "arrow" ? "arrow" : this.style.line, x: a.x, y: a.y, width: w, height: h, points: [{ x: a.x, y: a.y }, { x: a.x + w, y: a.y + h }], strokeColor: this.style.stroke, strokeWidth: this.style.width, arrowEnd: this.style.line !== "line", strokeStyle: this.style.dash, opacity: 1 };
    }
    const x = Math.min(a.x, a.x + w), y = Math.min(a.y, a.y + h);
    if (d.tool === "frame") return { id: "_ghost", type: "frame", x, y, width: Math.abs(w), height: Math.abs(h), title: "", color: this.style.stroke, fillColor: "transparent" };
    return { id: "_ghost", type: "shape", shapeType: this.style.shape, x, y, width: Math.abs(w), height: Math.abs(h), strokeColor: this.style.stroke, fillColor: this.style.fill, strokeWidth: this.style.width, strokeStyle: this.style.dash, opacity: this.style.opacity };
  }

  commitShape(d, m) {
    this.ghost = null;
    const g = this.shapeGhost({ ...d, cur: m });
    const tooSmall = Math.hypot(g.width, g.height) < 8;
    if (tooSmall) {
      // A click makes one of a sensible size
      if (d.tool === "line") return;
      g.x = d.start.x - 70;
      g.y = d.start.y - 45;
      g.width = d.tool === "frame" ? 360 : 140;
      g.height = d.tool === "frame" ? 260 : 90;
    }
    const snap = this.wb.snapToGrid;
    const item = { ...g };
    delete item.id;
    if (snap && item.type !== "shape" || snap && !LINE_SHAPES.includes(item.shapeType)) {
      item.x = this.snapValue(item.x); item.y = this.snapValue(item.y);
      item.width = Math.max(this.snapValue(item.width), 20); item.height = Math.max(this.snapValue(item.height), 20);
    }
    this.store.apply({ op: "add", page: this.page.id, item }).then((res) => {
      const made = res?.applied?.find((o) => o.op === "add")?.item;
      if (made) {
        this.setTool("select");
        this.setSelection([made.id]);
        if (made.type === "frame") this.editText(made, "title");
        else if (made.type === "shape" && !LINE_SHAPES.includes(made.shapeType)) this.editText(made, "label");
      }
    });
  }

  connectorGhost(d) {
    const from = d.from ? anchorPoint(d.from, d.fromPort || "auto", d.cur) : d.start;
    const to = d.target ? anchorPoint(d.target, "auto", from) : d.cur;
    return { id: "_ghost", type: "shape", shapeType: "connector", route: "elbow", x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), width: Math.abs(to.x - from.x), height: Math.abs(to.y - from.y), points: [{ x: from.x, y: from.y }, { x: to.x, y: to.y }], strokeColor: this.style.stroke, strokeWidth: this.style.width / 1.5, arrowEnd: true, opacity: 1 };
  }

  commitConnector(d, m) {
    this.ghost = null;
    if (Math.hypot(m.x - d.start.x, m.y - d.start.y) * this.zoom < 6 && !d.target) {
      // Only a click on one of the arrows around a box: the next box grows from it
      if (d.grow) this.growFrom(d.from, d.fromPort);
      return;
    }
    const from = d.from ? anchorPoint(d.from, d.fromPort || "auto", m) : d.start;
    const to = d.target ? anchorPoint(d.target, "auto", from) : m;
    const item = { type: "shape", shapeType: "connector", route: "elbow", points: [{ x: from.x, y: from.y }, { x: to.x, y: to.y }], strokeColor: this.style.stroke, strokeWidth: Math.max(2, this.style.width / 1.5), strokeStyle: this.style.dash, arrowEnd: true };
    if (d.from) item.from = { id: d.from.id, port: d.fromPort || "auto" };
    if (d.target) item.to = { id: d.target.id, port: "auto" };
    this.store.apply({ op: "add", page: this.page.id, item }).then((res) => {
      const made = res?.applied?.find((o) => o.op === "add")?.item;
      if (made) this.setSelection([made.id]);
    });
    if (this.tool !== "select") this.setTool("select");
  }

  // ---------- Words ----------
  fontFor(item) {
    const family = item.fontFamily || "marker";
    return { css: family === "marker" ? "600" : item.bold ? "700" : "", size: (item.fontSize || 20) * this.zoom, family: fontCss(family, 10).split("px ")[1], color: inkOn(this.theme, item.color), align: item.align, lineHeight: 1.32, pad: 6 * this.zoom };
  }

  // A text box where you click; made when you've typed something
  beginText(m, { format }) {
    const size = this.style.fontSize;
    const width = format === "code" ? 520 : 360;
    const x = this.wb.snapToGrid ? this.snapValue(m.x) : m.x;
    const y = this.wb.snapToGrid ? this.snapValue(m.y) : m.y;
    const s = this.toScreen(x, y);
    const proto = { fontFamily: format === "code" ? "mono" : this.style.fontFamily, fontSize: format === "code" ? 18 : size, color: this.style.stroke, align: "left", bold: false };
    this.openEditor({
      rect: { left: s.x, top: s.y, width: width * this.zoom, height: 0 },
      font: this.fontFor(proto),
      value: "",
      mono: format === "code",
      placeholder: format === "math" ? "e.g. \\frac{a}{b} + \\sqrt{x}" : format === "code" ? t("Paste or type code") : t("Type here"),
      label: format === "math" ? "Formula" : format === "code" ? "Code" : "Text",
      onCommit: (text) => {
        const body = text.trim();
        this.setTool("select");
        if (!body) return;
        const item = { type: "text", x, y, width, text: body, format: format === "plain" && /^\s*(#{1,3}\s|[-*]\s|\d+\.\s|>)/m.test(body) ? "markdown" : format, fontSize: proto.fontSize, fontFamily: proto.fontFamily, color: this.style.stroke, language: "" };
        this.store.apply({ op: "add", page: this.page.id, item }).then((res) => {
          const made = res?.applied?.find((o) => o.op === "add")?.item;
          if (made) this.setSelection([made.id]);
        });
      },
      onCancel: () => this.setTool("select"),
    });
  }

  beginSticky(m) {
    const w = 180, h = 180;
    const x = m.x - w / 2, y = m.y - h / 2;
    const s = this.toScreen(x, y);
    const color = this.style.sticky;
    this.openEditor({
      rect: { left: s.x + 8 * this.zoom, top: s.y + 20 * this.zoom, width: (w - 16) * this.zoom, height: (h - 40) * this.zoom },
      font: { css: "600", size: 18 * this.zoom, family: fontCss("marker", 10).split("px ")[1], color: "#1f2937", align: "left", lineHeight: 1.25, pad: 2 },
      value: "",
      background: color,
      placeholder: "A note",
      label: t("Sticky note"),
      onCommit: (text) => {
        this.setTool("select");
        if (!text.trim()) return;
        this.store.apply({ op: "add", page: this.page.id, item: { type: "sticky", x, y, width: w, height: h, text: text.trim(), color, tilt: Math.round((Math.random() * 4 - 2) * 10) / 10 } }).then((res) => {
          const made = res?.applied?.find((o) => o.op === "add")?.item;
          if (made) this.setSelection([made.id]);
        });
      },
      onCancel: () => this.setTool("select"),
    });
  }

  beginChecklist(m) {
    const s = this.toScreen(m.x, m.y);
    this.openEditor({
      rect: { left: s.x, top: s.y, width: 260 * this.zoom, height: 100 * this.zoom },
      font: { css: "", size: 17 * this.zoom, family: fontCss("sans", 10).split("px ")[1], color: "#0f172a", align: "left", lineHeight: 1.6, pad: 10 },
      value: "",
      background: "#ffffff",
      placeholder: t("One task per line"),
      label: "Checklist: one task per line",
      onCommit: (text) => {
        this.setTool("select");
        const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
        if (!lines.length) return;
        this.store.apply({ op: "add", page: this.page.id, item: { type: "checklist", title: "Checklist", x: m.x, y: m.y, width: 280, items: lines.map((t) => ({ text: t })) } }).then((res) => {
          const made = res?.applied?.find((o) => o.op === "add")?.item;
          if (made) this.setSelection([made.id]);
        });
      },
      onCancel: () => this.setTool("select"),
    });
  }

  addTable(m) {
    this.setTool("select");
    this.store.apply({ op: "add", page: this.page.id, item: { type: "table", x: m.x, y: m.y, width: 420, headers: ["Column A", "Column B", "Column C"], rows: [["", "", ""], ["", "", ""]] } }).then((res) => {
      const made = res?.applied?.find((o) => o.op === "add")?.item;
      if (made) this.setSelection([made.id]);
    });
  }

  openEditor(opts) {
    this.cb.onEditing?.(true);
    const { onCommit, onCancel, onTab } = opts;
    return this.editor.open({
      ...opts,
      onCommit: (...a) => (this.cb.onEditing?.(false), this.editingId = null, onCommit?.(...a), this.schedule()),
      onCancel: () => (this.cb.onEditing?.(false), this.editingId = null, onCancel?.(), this.schedule()),
      onTab: onTab ? (...a) => (this.cb.onEditing?.(false), this.editingId = null, onTab(...a)) : undefined,
    });
  }

  // Edit what is already there: part is text | label | title | line | cell
  editText(item, part = "text", extra = {}) {
    if (!item || item.locked) return;
    const live = this.page.items.find((it) => it.id === item.id) || item;
    const b = itemBox(this.ctx, live);
    const s = this.toScreen(b.minX, b.minY);
    const z = this.zoom;
    const commit = (set) => this.store.apply({ op: "update", page: this.page.id, id: live.id, set });
    this.editingId = live.id;
    if (live.type === "text") {
      this.openEditor({
        rect: { left: s.x, top: s.y, width: live.width * z, height: b.height * z },
        font: this.fontFor(live),
        value: live.text,
        mono: live.format === "code",
        label: "Text",
        onCommit: (text, changed) => {
          if (!changed) return;
          if (!text.trim()) this.store.apply({ op: "remove", page: this.page.id, id: live.id });
          else commit({ text });
        },
      });
    } else if (live.type === "sticky") {
      this.openEditor({
        rect: { left: s.x + 8 * z, top: s.y + 20 * z, width: (live.width - 16) * z, height: (live.height - 40) * z },
        font: { css: "600", size: 18 * z, family: fontCss("marker", 10).split("px ")[1], color: "#1f2937", align: "left", lineHeight: 1.25, pad: 2 },
        value: live.text,
        background: live.color,
        label: t("Sticky note"),
        onCommit: (text, changed) => changed && commit({ text }),
      });
    } else if (live.type === "shape" && part === "label") {
      this.openEditor({
        rect: { left: s.x + 6 * z, top: s.y + b.height * z / 2 - 18 * z, width: Math.max(60, b.width * z - 12 * z), height: 36 * z },
        font: { css: "700", size: (live.fontSize || 16) * z, family: fontCss("sans", 10).split("px ")[1], color: "#1e293b", align: "center", lineHeight: 1.25, pad: 2 },
        value: live.label || "",
        background: "rgba(255,255,255,.85)",
        label: "Label",
        onCommit: (text, changed) => changed && commit({ label: text.trim() || null }),
      });
    } else if (live.type === "frame") {
      this.openEditor({
        rect: { left: s.x + 12 * z, top: s.y - 2 * z, width: Math.max(160, 220 * z), height: 30 * z },
        font: { css: "700", size: 17 * z, family: fontCss("sans", 10).split("px ")[1], color: "#1e293b", align: "left", lineHeight: 1.2, pad: 4 },
        value: live.title || "",
        multiline: false,
        background: "rgba(255,255,255,.9)",
        label: t("Frame title"),
        onCommit: (text, changed) => changed && commit({ title: text.trim() }),
      });
    } else if (live.type === "checklist") {
      if (part === "title") {
        this.openEditor({
          rect: { left: s.x + 10 * z, top: s.y + 6 * z, width: (live.width - 20) * z, height: 30 * z },
          font: { css: "700", size: 17 * z, family: fontCss("sans", 10).split("px ")[1], color: "#0f172a", align: "left", lineHeight: 1.2, pad: 3 },
          value: live.title,
          multiline: false,
          background: "#fff",
          label: t("Checklist title"),
          onCommit: (text, changed) => changed && commit({ title: text.trim() || "Checklist" }),
        });
      } else {
        this.openEditor({
          rect: { left: s.x + 4 * z, top: s.y + 40 * z, width: (live.width - 8) * z, height: Math.max(60, b.height - 48) * z },
          font: { css: "", size: 16 * z, family: fontCss("sans", 10).split("px ")[1], color: "#0f172a", align: "left", lineHeight: 1.7, pad: 8 },
          value: (live.items || []).map((i) => i.text).join("\n"),
          background: "#fff",
          label: "Checklist: one task per line",
          onCommit: (text, changed) => {
            if (!changed) return;
            const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
            // Lines that stay keep their tick
            const old = live.items || [];
            const items = lines.map((t, i) => ({ id: old.find((o) => o.text === t)?.id, text: t, checked: old.find((o) => o.text === t)?.checked || false })).map((it) => (it.id ? it : { text: it.text, checked: it.checked }));
            commit({ items });
          },
        });
      }
    } else if (live.type === "table") {
      this.editCell(live, extra.row ?? -1, extra.col ?? 0);
    } else if (live.type === "diagram") {
      this.cb.onDiagram?.({ edit: live });
    }
  }

  editCell(item, row, col) {
    const lay = tableLayout(this.ctx, item);
    const target = lay.rows.find((r) => r.index === row) || lay.rows[0];
    const z = this.zoom;
    const s = this.toScreen(item.x + col * lay.colW, item.y + target.y);
    const cells = target.header ? item.headers : item.rows[target.index];
    const cols = lay.cols;
    const rowsAll = [-1, ...item.rows.map((_, i) => i)];
    const go = (r, c, shift) => {
      let ri = rowsAll.indexOf(r), ci = c + (shift ? -1 : 1);
      if (ci >= cols) { ci = 0; ri++; }
      if (ci < 0) { ci = cols - 1; ri--; }
      if (ri < 0 || ri >= rowsAll.length) return;
      this.editingId = null;
      setTimeout(() => this.editCell(this.page.items.find((x) => x.id === item.id) || item, rowsAll[ri], ci), 30);
    };
    const save = (text, changed) => {
      if (!changed) return;
      if (target.header) {
        const headers = [...item.headers];
        while (headers.length < cols) headers.push("");
        headers[col] = text;
        this.store.apply({ op: "update", page: this.page.id, id: item.id, set: { headers } });
      } else {
        const rows = item.rows.map((r) => [...r]);
        while (rows[target.index].length < cols) rows[target.index].push("");
        rows[target.index][col] = text;
        this.store.apply({ op: "update", page: this.page.id, id: item.id, set: { rows } });
      }
    };
    this.editingId = null;
    this.openEditor({
      rect: { left: s.x + 2, top: s.y + 2, width: lay.colW * z - 4, height: target.h * z - 4 },
      font: { css: target.header ? "700" : "", size: 15 * z, family: fontCss("sans", 10).split("px ")[1], color: "#0f172a", align: "left", lineHeight: 1.3, pad: 6 },
      value: cells?.[col] ?? "",
      background: "#fff",
      label: `Cell ${col + 1}`,
      onCommit: save,
      onTab: (text, shift, changed) => {
        save(text, changed);
        go(target.index, col, shift);
      },
    });
  }

  onDoubleClick(e) {
    if (this.drag && this.drag.kind !== "pan") return;
    const m = this.toModel(e.clientX, e.clientY);
    const hit = this.itemAt(m.x, m.y);
    if (hit && this.tool === "select") {
      this.setSelection([hit.id]);
      if (hit.type === "table") {
        const lay = tableLayout(this.ctx, hit);
        const col = clamp(Math.floor((m.x - hit.x) / lay.colW), 0, lay.cols - 1);
        const row = lay.rows.find((r) => m.y - hit.y >= r.y && m.y - hit.y < r.y + r.h);
        this.editText(hit, "cell", { row: row ? row.index : -1, col });
      } else if (hit.type === "checklist") {
        this.editText(hit, m.y - hit.y < 36 ? "title" : "lines");
      } else if (hit.type === "shape" && !isLineLike(hit)) this.editText(hit, "label");
      else if (hit.type === "shape" && hit.shapeType === "connector") this.editConnectorLabel(hit);
      else if (hit.type === "frame") this.editText(hit, "title");
      else this.editText(hit, "text");
    } else if (!hit && this.tool === "select" && this.wb.collaborationMode !== "robot_only") {
      this.setTool("text");
      this.beginText(m, { format: "plain" });
    }
  }

  editConnectorLabel(item) {
    const mid = item.points ? item.points[Math.floor(item.points.length / 2)] : { x: item.x, y: item.y };
    const s = this.toScreen(mid.x, mid.y);
    this.openEditor({
      rect: { left: s.x - 60, top: s.y - 14, width: 120, height: 28 },
      font: { css: "700", size: 14 * this.zoom, family: fontCss("sans", 10).split("px ")[1], color: "#1e293b", align: "center", lineHeight: 1.2, pad: 3 },
      value: item.label || "",
      multiline: false,
      background: "#fff",
      label: t("Arrow label"),
      onCommit: (text, changed) => changed && this.store.apply({ op: "update", page: this.page.id, id: item.id, set: { label: text.trim() || null } }),
    });
  }

  // ---------- Commands ----------
  cloneOps(items, dx = 24, dy = 24) {
    const ids = new Map(items.map((it) => [it.id, genId(it.type)]));
    const ops = items.map((it) => {
      const copy = JSON.parse(JSON.stringify(it));
      copy.id = ids.get(it.id);
      delete copy.locked;
      translateItem(copy, dx, dy);
      if (copy.shapeType === "connector") {
        for (const end of ["from", "to"]) if (copy[end]) copy[end] = ids.has(copy[end].id) ? { ...copy[end], id: ids.get(copy[end].id) } : undefined;
        if (!copy.from) delete copy.from;
        if (!copy.to) delete copy.to;
      }
      return { op: "add", page: this.page.id, item: copy };
    });
    return { ops, ids };
  }

  duplicate() {
    const items = this.selectedItems();
    if (!items.length) return;
    const { ops } = this.cloneOps(items);
    this.store.apply(ops).then((res) => {
      if (res?.applied) this.setSelection(res.applied.filter((o) => o.op === "add").map((o) => o.item.id));
    });
  }

  copy() {
    const items = this.selectedItems();
    if (!items.length) return;
    clipboard.items = JSON.parse(JSON.stringify(items));
    clipboard.at = Date.now();
    this.say(t("{n} copied", { n: items.length }));
  }

  cut() {
    this.copy();
    this.deleteSelection();
  }

  async paste(at = null) {
    if (clipboard.items.length) {
      const b = clipboard.items.reduce((m, it) => {
        const bb = getBoundingBox(it);
        return { x: Math.min(m.x, bb.minX), y: Math.min(m.y, bb.minY) };
      }, { x: Infinity, y: Infinity });
      const target = at || this.cursorAt || this.centerPoint();
      const { ops } = this.cloneOps(clipboard.items, target.x - b.x + 12, target.y - b.y + 12);
      const res = await this.store.apply(ops);
      if (res?.applied) this.setSelection(res.applied.filter((o) => o.op === "add").map((o) => o.item.id));
    }
  }

  centerPoint() {
    return { x: (this.width / 2 - this.panX) / this.zoom, y: (this.height / 2 - this.panY) / this.zoom };
  }

  async onPaste(e) {
    if (this.editor.active) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (files.length) {
      e.preventDefault();
      for (const f of files) await this.addImageFile(f, this.cursorAt || this.centerPoint());
      return;
    }
    const text = e.clipboardData?.getData("text/plain");
    if (clipboard.items.length && (!text || Date.now() - clipboard.at < 60 * 60 * 1000)) {
      e.preventDefault();
      return this.paste();
    }
    if (text?.trim()) {
      e.preventDefault();
      const at = this.cursorAt || this.centerPoint();
      this.store.apply({ op: "add", page: this.page.id, item: { type: "text", x: at.x, y: at.y, width: 420, text: text.trim().slice(0, 20000), fontSize: this.style.fontSize, fontFamily: this.style.fontFamily, color: this.style.stroke, format: /^(#{1,3} |[-*] |\d+\. )/m.test(text) ? "markdown" : "plain" } });
    }
  }

  deleteSelection() {
    const items = this.selectedItems().filter((it) => !it.locked);
    if (!items.length) return;
    this.editor.close(false);
    this.store.apply({ op: "remove", page: this.page.id, ids: items.map((i) => i.id) });
    this.setSelection([]);
  }

  order(to) {
    const items = this.selectedItems();
    if (!items.length) return;
    const list = to === "front" || to === "forward" ? [...items].reverse() : items;
    this.store.apply(list.map((it) => ({ op: "reorder", page: this.page.id, id: it.id, to })));
  }

  setLocked(on) {
    const items = this.selectedItems();
    if (!items.length) return;
    this.store.apply(items.map((it) => ({ op: "update", page: this.page.id, id: it.id, set: { locked: on ? true : null } })));
  }

  // Changes to what is selected: colors, sizes, fonts…
  setProps(patch, filter = () => true) {
    const items = this.selectedItems().filter((it) => filter(it));
    if (!items.length) return;
    this.store.apply(items.map((it) => ({ op: "update", page: this.page.id, id: it.id, set: patch })));
  }

  // Wraps what is selected in a frame behind it
  wrapInFrame() {
    const b = this.selectionBox();
    if (!b || !this.page) return;
    const id = genId("frame");
    this.store
      .apply([
        { op: "add", page: this.page.id, item: { id, type: "frame", x: b.minX - 24, y: b.minY - 52, width: b.width + 48, height: b.height + 76, title: "", color: "#94a3b8", fillColor: "transparent" } },
        { op: "reorder", page: this.page.id, id, to: "back" },
      ])
      .then((res) => {
        if (!res?.applied?.length) return;
        this.setSelection([id]);
        const frame = this.page.items.find((it) => it.id === id);
        if (frame) this.editText(frame, "title");
      });
  }

  // The look of one thing, to give to others
  copyStyle() {
    const it = this.selectedItems()[0];
    if (!it) return;
    const keys = STYLE_KEYS[it.type] || [];
    styleClipboard = { type: it.type, props: Object.fromEntries(keys.filter((k) => it[k] !== undefined).map((k) => [k, it[k]])), color: it[COLOR_KEYS[it.type]] };
    this.say(t("Copied the look. Select something and paste it."));
  }

  pasteStyle() {
    const from = styleClipboard;
    if (!from) return this.say(t("Copy the look of something first."));
    const ops = [];
    for (const it of this.selectedItems()) {
      if (it.locked) continue;
      const set = {};
      if (it.type === from.type) Object.assign(set, from.props);
      else if (from.color && COLOR_KEYS[it.type]) set[COLOR_KEYS[it.type]] = from.color;
      if (Object.keys(set).length) ops.push({ op: "update", page: this.page.id, id: it.id, set });
    }
    if (ops.length) this.store.apply(ops);
  }

  arrange(mode) {
    const items = this.selectedItems();
    const list = arrangeOps(this.page, items.length >= 2 ? items : this.page.items.filter((i) => i.type !== "frame"), mode);
    if (list.length) this.store.apply(list);
  }

  nudge(dx, dy) {
    const ids = this.selectedItems().filter((i) => !i.locked).map((i) => i.id);
    if (ids.length) this.store.apply({ op: "translate", page: this.page.id, ids, dx, dy });
  }

  // A diagram written as text: a flowchart or an outline becomes boxes and arrows; anything else stays a block
  createDiagram(text, at, { kind = "flowchart" } = {}) {
    const code = String(text || "").trim();
    if (!code) return Promise.resolve(null);
    let built = null;
    const flow = kind !== "tree" && kind !== "mindmap" ? parseFlow(code) : null;
    if (flow) built = flowToOps(flow, { fontSize: 18 });
    else if (kind === "tree" || kind === "mindmap" || (!/^\s*[a-zA-Z]+(Diagram|Chart)?\b.*\n/.test(code) && parseOutline(code))) {
      try {
        built = outlineToOps(parseOutline(code), { style: kind === "mindmap" ? "mindmap" : "tree", fontSize: 18 });
      } catch (err) {
        this.say(t(err.message));
      }
    }
    if (!built) {
      return this.store.apply({ op: "add", page: this.page.id, item: { type: "diagram", syntax: "mermaid", code, x: at.x, y: at.y, width: 440, height: 280 } });
    }
    const b = built.bounds;
    const spot = findFreeSpot(this.page, b.width + 40, b.height + 40, { near: { x: at.x, y: at.y } });
    for (const op of built.ops) {
      const it = op.item;
      if (typeof it.x === "number") { it.x += spot.x - b.x; it.y += spot.y - b.y; }
      if (Array.isArray(it.points)) for (const p of it.points) { p.x += spot.x - b.x; p.y += spot.y - b.y; }
    }
    return this.store.apply(built.ops.map((op) => ({ ...op, page: this.page.id })));
  }

  // ---------- Pictures ----------
  pickImage(at) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.onchange = () => input.files[0] && this.addImageFile(input.files[0], at);
    input.click();
    this.setTool("select");
  }

  async addImageFile(file, at) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return this.say(t("Only PNG, JPEG, WebP and GIF pictures can go on the board."));
    if (file.size > 6 * 1024 * 1024) return this.say(t("A picture can be up to 6 MB."));
    try {
      const up = await this.store.uploadImage(file);
      const size = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 300, h: 200 });
        img.src = URL.createObjectURL(file);
      });
      const k = Math.min(1, 380 / Math.max(1, size.w), 300 / Math.max(1, size.h));
      const w = Math.max(40, Math.round(size.w * k)), h = Math.max(40, Math.round(size.h * k));
      const res = await this.store.apply({ op: "add", page: this.page.id, item: { type: "image", src: up.src, mime: file.type, x: at.x - w / 2, y: at.y - h / 2, width: w, height: h } });
      const made = res?.applied?.find((o) => o.op === "add")?.item;
      if (made) this.setSelection([made.id]);
    } catch (err) {
      this.say(t(err.message));
    }
  }

  onDrop(e) {
    const entry = e.dataTransfer?.getData?.("application/x-friends-shape");
    if (entry) {
      e.preventDefault();
      this.addLibraryEntry(entry, this.toModel(e.clientX, e.clientY));
      return;
    }
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    const at = this.toModel(e.clientX, e.clientY);
    files.forEach((f, i) => this.addImageFile(f, { x: at.x + i * 30, y: at.y + i * 30 }));
  }

  // ---------- Keys ----------
  onKey(e) {
    if (this.editor.active || e.target !== this.container && e.target.closest?.(".wb-editor, .wb-a11y-list")) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (e.code === "Space" && !mod) {
      e.preventDefault();
      if (!this.spacePan) {
        this.spacePan = true;
        this.updateCursor();
      }
      return;
    }
    if (mod) {
      const key = k.toLowerCase();
      if (key === "z") { e.preventDefault(); e.shiftKey ? this.store.redo() : this.store.undo(); }
      else if (key === "y") { e.preventDefault(); this.store.redo(); }
      else if (key === "a") { e.preventDefault(); this.selectAll(); }
      else if (key === "d") { e.preventDefault(); this.duplicate(); }
      else if (key === "c") { /* the copy event does it */ }
      else if (key === "0") { e.preventDefault(); this.fitBoard(); }
      else if (key === "]") { e.preventDefault(); this.order(e.shiftKey ? "front" : "forward"); }
      else if (key === "[") { e.preventDefault(); this.order(e.shiftKey ? "back" : "backward"); }
      else if (key === "l") { e.preventDefault(); this.setLocked(!this.selectedItems().every((i) => i.locked)); }
      else if (k === "=" || k === "+") { e.preventDefault(); this.setZoom(this.zoom * 1.2); }
      else if (k === "-") { e.preventDefault(); this.setZoom(this.zoom / 1.2); }
      return;
    }
    if (k === "Delete" || k === "Backspace") { e.preventDefault(); this.deleteSelection(); return; }
    if (k === "Escape") {
      if (this.drag) this.cancelDrag();
      else if (this.selection.size) this.setSelection([]);
      else if (this.tool !== "select") this.setTool("select");
      else this.cb.onEscape?.();
      return;
    }
    if (k === "Enter" && this.selection.size === 1) {
      e.preventDefault();
      const it = this.selectedItems()[0];
      if (it) it.type === "table" ? this.editText(it, "cell", { row: -1, col: 0 }) : this.editText(it, it.type === "shape" ? "label" : it.type === "frame" ? "title" : "text");
      return;
    }
    if (k.startsWith("Arrow") && this.selection.size) {
      e.preventDefault();
      const step = e.shiftKey ? 20 : 2;
      this.nudge(k === "ArrowLeft" ? -step : k === "ArrowRight" ? step : 0, k === "ArrowUp" ? -step : k === "ArrowDown" ? step : 0);
      return;
    }
    if (k === "Tab") {
      e.preventDefault();
      const items = this.page?.items || [];
      if (!items.length) return;
      const cur = items.findIndex((it) => this.selection.has(it.id));
      const next = items[(cur + (e.shiftKey ? -1 : 1) + items.length) % items.length];
      this.setSelection([next.id]);
      this.say(itemLabel(next) || t(next.type[0].toUpperCase() + next.type.slice(1)));
      return;
    }
    if (k === "+" || k === "=") { this.setZoom(this.zoom * 1.2); return; }
    if (k === "-") { this.setZoom(this.zoom / 1.2); return; }
    if (k === "0") { this.fitBoard(); return; }
    if (k === "1" && e.shiftKey || k === "!") { this.fitContent(); return; }
    const tool = TOOL_BY_KEY[k.toLowerCase()];
    if (tool && !e.altKey) {
      e.preventDefault();
      this.setTool(tool);
    }
  }

  // ---------- Menus ----------
  onContextMenu(e) {
    e.preventDefault();
    const m = this.toModel(e.clientX, e.clientY);
    const hit = this.itemAt(m.x, m.y);
    if (hit && !this.selection.has(hit.id)) this.setSelection([hit.id]);
    this.cb.onMenu?.({ x: e.clientX, y: e.clientY, at: m, items: hit ? this.selectedItems() : [], view: this });
  }

  // ---------- Reading the board aloud for screen readers ----------
  buildList() {
    const items = this.page?.items || [];
    this.list.replaceChildren();
    const frag = document.createDocumentFragment();
    for (const it of items.slice(-200)) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.tabIndex = -1;
      btn.className = "wb-a11y-item";
      const kind = t(it.type === "shape" && it.shapeType === "connector" ? "Arrow" : it.type[0].toUpperCase() + it.type.slice(1));
      btn.textContent = `${it.author === "user" ? "" : `${it.author === "mission" ? t("mission") : t("robot")}: `}${kind}${itemLabel(it) ? `: ${itemLabel(it)}` : ""}`;
      btn.addEventListener("focus", () => this.setSelection([it.id]));
      btn.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") this.editText(it, "text");
        else if (ev.key === "Delete") this.deleteSelection();
      });
      li.append(btn);
      frag.append(li);
    }
    this.list.append(frag);
  }

  // ---------- Pictures of the board ----------
  toBlob(type = "image/png", { scale = 2, theme = this.theme, region = null, background = true } = {}) {
    return import("./render.mjs").then(({ renderPageTo }) => {
      const items = this.page?.items || [];
      let box = region;
      if (!box) {
        if (items.length) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const it of items) {
            const b = itemBox(this.ctx, it);
            minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
          }
          box = { x: minX - 40, y: minY - 40, width: Math.max(200, maxX - minX + 80), height: Math.max(120, maxY - minY + 80) };
        } else box = { ...BOARD_AREA };
      }
      const cv = document.createElement("canvas");
      cv.width = Math.min(4096, Math.round(box.width * scale));
      cv.height = Math.min(4096, Math.round(box.height * scale));
      renderPageTo(cv, this.page, { region: box, theme, pattern: this.wb.bgPattern || "grid", gridSize: this.wb.gridSize || 28, images: this.images, diagram: (item) => diagramImage(item, theme.dark, () => {}), background });
      return new Promise((resolve) => cv.toBlob(resolve, type, 0.95));
    });
  }
}
