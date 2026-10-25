// The page's copy of the shared board, kept in step with the helper.
//
// Your edits go to the helper as operations; the helper puts yours and the robot's in one order and sends every
// change to every page. This store applies them in that order, so you and the robot can draw at the same time and
// see the same board. It also keeps your own undo and redo (the robot's drawing can be undone as a whole too),
// what the robot is doing (its pointer, its pen), and the "someone is writing it" animation.
// No DOM in here: the transport (fetch, server events) and the clock are handed in, so it runs in tests too.
import { applyOps, pageOf } from "./ops.mjs";
import { sanitizeDocument, getBoundingBox } from "./model.mjs";

const uid = () => Math.random().toString(36).slice(2, 10);

// How long the robot takes to write something, in ms, by kind of thing and the "writing speed" setting
const SPEED = { slow: 2.1, normal: 1, fast: 0.45 };
export function revealDuration(item, speed = "normal") {
  const k = SPEED[speed] || 1;
  switch (item.type) {
    case "stroke":
      return Math.min(2500, 250 + (item.points?.length || 2) * 14) * k;
    case "text": {
      const n = Array.from(item.text || "").length;
      return Math.min(5000, 300 + n * (item.format === "plain" || !item.format ? 38 : 22)) * k;
    }
    case "sticky":
      return (420 + Math.min(1500, Array.from(item.text || "").length * 14)) * k;
    case "shape":
      return (item.shapeType === "connector" ? 380 : 620) * k;
    case "checklist":
      return (450 + (item.items?.length || 0) * 90) * k;
    case "table":
      return (500 + (item.rows?.length || 0) * 80) * k;
    default:
      return 560 * k;
  }
}

// Where the robot's pen is while it writes something (p: how much is written, 0..1), in board units
export function tipFor(item, p) {
  const k = Math.max(0, Math.min(1, p));
  const b = getBoundingBox(item);
  if (item.type === "stroke" && item.points?.length) {
    const pt = item.points[Math.min(item.points.length - 1, Math.floor(k * (item.points.length - 1)))];
    return { x: pt.x, y: pt.y };
  }
  if (item.type === "text" || item.type === "sticky") {
    // Line by line, left to right
    const lines = Math.max(1, Math.round(b.height / Math.max(14, (item.fontSize || 18) * 1.32)));
    const at = k * lines;
    const line = Math.min(lines - 1, Math.floor(at));
    return { x: b.minX + 8 + (b.width - 16) * (at - line), y: b.minY + 10 + ((line + 0.6) * b.height) / lines };
  }
  if (item.type === "shape" && Array.isArray(item.points) && item.points.length >= 2) {
    const a = item.points[0], z = item.points[item.points.length - 1];
    return { x: a.x + (z.x - a.x) * k, y: a.y + (z.y - a.y) * k };
  }
  if (item.type === "shape" || item.type === "frame") {
    // Around the outline, clockwise from the top left
    const per = 2 * (b.width + b.height);
    let d = k * per;
    if (d < b.width) return { x: b.minX + d, y: b.minY };
    d -= b.width;
    if (d < b.height) return { x: b.maxX, y: b.minY + d };
    d -= b.height;
    if (d < b.width) return { x: b.maxX - d, y: b.maxY };
    return { x: b.minX, y: b.maxY - (d - b.width) };
  }
  return { x: b.cx, y: b.cy };
}

export class BoardStore {
  // io: { get(url) → json, send(method, url, body) → json, upload(url, blob) → json, subscribe(fn) → stop, now() , raf(fn) → id, caf(id) }
  constructor(io, getSettings = () => ({})) {
    this.io = io;
    this.getSettings = getSettings;
    this.doc = null;
    this.rev = 0;
    this.pageIndex = 0;
    this.status = "connecting";
    this.listeners = new Map();
    this.undoStack = [];
    this.redoStack = [];
    this.queue = new Map(); // rev → event, waiting for the ones before it
    this.chain = Promise.resolve();
    this.outbox = [];
    this.mine = new Set(); // ids of the changes this page sent (their echoes aren't news)
    this.ai = null; // the robot's pointer: { x, y, label, action, since }
    this.reveal = new Map(); // item id → 0..1 while the robot writes it
    this.revealQueue = [];
    this.revealing = null;
    this.tip = null; // where the robot's pen is right now
    this.presence = {};
    this.presenceTimer = null;
    this.lastPresence = 0;
    this.gapTimer = null;
    this.loadSeq = 0;
    this.revealDelay = null; // () → ms to wait before the robot starts writing (voice mode: until its speech has caught up)
  }

  // ---------- Tiny event emitter ----------
  on(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
    return () => this.listeners.get(name)?.delete(fn);
  }

  emit(name, detail) {
    for (const fn of [...(this.listeners.get(name) || [])]) {
      try {
        fn(detail);
      } catch (err) {
        console.error(`Whiteboard listener for ${name} failed:`, err);
      }
    }
  }

  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.emit("status", status);
  }

  // ---------- Loading ----------
  async init() {
    this.stop = this.io.subscribe((e) => this.fromServer(e));
    await this.load();
    return this;
  }

  async load(id = "") {
    const seq = ++this.loadSeq;
    try {
      const raw = await this.io.get(id ? `/api/whiteboards/${encodeURIComponent(id)}` : "/api/whiteboards/current");
      if (seq !== this.loadSeq) return this.doc;
      this.setDoc(raw);
      this.setStatus("online");
    } catch (err) {
      if (seq !== this.loadSeq) return this.doc;
      this.setStatus("offline");
      if (!this.doc) this.setDoc(sanitizeDocument({ title: "Main Whiteboard" }), { local: true });
      this.emit("error", err);
    }
    return this.doc;
  }

  setDoc(raw, { local = false } = {}) {
    this.doc = sanitizeDocument(raw);
    this.rev = local ? 0 : raw.rev || 0;
    this.queue.clear();
    clearTimeout(this.gapTimer);
    this.undoStack = [];
    this.redoStack = [];
    this.reveal.clear();
    this.revealQueue = [];
    this.revealing = null;
    this.pageIndex = Math.max(0, Math.min(this.doc.pages.length - 1, this.doc.activePageIndex || 0));
    this.emit("doc", this.doc);
    this.emit("page", this.pageIndex);
    this.emit("history", this.historyState());
  }

  async resync() {
    await this.load(this.doc?.id || "");
  }

  get page() {
    return this.doc?.pages[this.pageIndex] || this.doc?.pages[0] || null;
  }

  setPage(index, { announce = true } = {}) {
    if (!this.doc) return;
    const i = Math.max(0, Math.min(this.doc.pages.length - 1, index));
    if (i === this.pageIndex) return;
    this.pageIndex = i;
    this.emit("page", i);
    if (announce) this.sendPresence({ page: i }, { now: true });
  }

  // ---------- Your changes ----------
  // ops: one operation or a list. Returns what the helper did (or, when it can't be reached, what was done here).
  apply(ops, { undoable = true } = {}) {
    const list = Array.isArray(ops) ? ops : [ops];
    if (!list.length) return Promise.resolve({ applied: [], inverse: [], errors: [], changed: false });
    const cid = uid();
    this.mine.add(cid);
    const run = this.chain.then(() => this.send(list, cid, undoable));
    this.chain = run.catch(() => {});
    return run;
  }

  async send(list, cid, undoable) {
    if (!this.doc) return { applied: [], inverse: [], errors: [{ error: "No board yet." }], changed: false };
    try {
      const res = await this.io.send("POST", `/api/whiteboards/${encodeURIComponent(this.doc.id)}/ops`, { ops: list, cid });
      this.setStatus("online");
      if (res.changed !== false && res.applied?.length) {
        this.receive({ boardId: this.doc.id, rev: res.rev, actor: "user", cid, ops: res.applied, touched: res.touched || [] });
        if (undoable && res.inverse?.length) {
          this.undoStack.push({ do: res.applied, undo: res.inverse });
          if (this.undoStack.length > 100) this.undoStack.shift();
          this.redoStack = [];
          this.emit("history", this.historyState());
        }
      }
      return { ...res, changed: res.changed !== false && Boolean(res.applied?.length) };
    } catch (err) {
      // The helper can't be reached: the change is shown here and sent when it is back
      this.setStatus("offline");
      const local = applyOps(this.doc, list, { actor: "user" });
      this.outbox.push({ list, cid });
      this.emit("change", { ops: local.applied, actor: "user", touched: local.touched, local: true, offline: true });
      return { ...local, offline: true };
    }
  }

  async flushOutbox() {
    if (!this.outbox.length) return;
    const waiting = this.outbox.splice(0);
    for (const { list, cid } of waiting) {
      try {
        await this.io.send("POST", `/api/whiteboards/${encodeURIComponent(this.doc.id)}/ops`, { ops: list, cid });
      } catch {
        this.outbox.unshift(...waiting.slice(waiting.findIndex((w) => w.cid === cid)));
        return;
      }
    }
    await this.resync();
  }

  // ---------- What the helper says happened ----------
  fromServer(e) {
    if (!e || typeof e !== "object") return;
    if (e.kind === "ops") {
      if (!this.doc || e.boardId !== this.doc.id) return;
      this.receive(e);
    } else if (e.kind === "presence") {
      if (this.doc && e.boardId === this.doc.id && e.who === "ai") this.setAi(e.presence);
    } else if (e.kind === "board") {
      if (e.type === "current" && e.id && e.id !== this.doc?.id) this.load(e.id);
      else if ((e.type === "replaced" || e.type === "deleted") && e.id === this.doc?.id) this.load(e.type === "deleted" ? "" : e.id);
      this.emit("boards", e);
    } else if (e.kind === "sources") {
      this.emit("sources", e);
    } else if (e.kind === "open") {
      this.flushOutbox();
    }
  }

  // Changes are applied in the helper's order; one that arrives early waits for those before it
  receive(e) {
    if (e.rev <= this.rev) return; // already applied (the echo of what this page sent, or a repeat)
    this.queue.set(e.rev, e);
    this.drain();
  }

  drain() {
    let next = this.queue.get(this.rev + 1);
    while (next) {
      this.queue.delete(next.rev);
      this.applyEvent(next);
      next = this.queue.get(this.rev + 1);
    }
    clearTimeout(this.gapTimer);
    for (const r of [...this.queue.keys()]) if (r <= this.rev) this.queue.delete(r);
    if (this.queue.size) {
      // Something is missing: wait a moment for it, then fetch the whole board
      this.gapTimer = setTimeout(() => {
        if (this.queue.size) this.resync();
      }, 1500);
    }
  }

  applyEvent(e) {
    const actor = e.actor || "user";
    const before = this.page?.id;
    const result = applyOps(this.doc, e.ops || [], { actor });
    this.doc.rev = e.rev;
    this.rev = e.rev;
    const own = Boolean(e.cid && this.mine.has(e.cid));
    if (own) this.mine.delete(e.cid);
    // The page being shown may have gone
    if (this.pageIndex >= this.doc.pages.length) this.pageIndex = this.doc.pages.length - 1;
    if (before && this.page?.id !== before && !this.doc.pages.some((p) => p.id === before)) this.emit("page", this.pageIndex);
    // Something added by the robot or a mission is written out, not just there
    const writers = actor === "ai" || actor === "mission";
    if (writers && this.getSettings().whiteboard?.animate !== false) this.startReveal(e.ops || [], e.batch);
    // A page the robot switched to is followed, unless you are in the middle of something
    if (writers && this.getSettings().whiteboard?.followRobot !== false) {
      const wanted = this.doc.activePageIndex;
      if (wanted !== this.pageIndex && (e.ops || []).some((o) => o.op === "focus" || (o.op === "page_add" && o.focus !== false))) this.setPage(wanted, { announce: false });
    }
    this.emit("change", { ops: result.applied.length ? result.applied : e.ops, actor, touched: e.touched || result.touched, local: own, rev: e.rev, batch: e.batch, briefs: e.briefs });
    if (!own) this.emit("remote", { actor, ops: e.ops, rev: e.rev, briefs: e.briefs, batch: e.batch });
    this.emit("history", this.historyState());
  }

  // ---------- Undo and redo (yours; the robot's drawing is taken back as a whole) ----------
  historyState() {
    return { canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0 };
  }

  async undo() {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    const res = await this.apply(entry.undo, { undoable: false });
    this.redoStack.push({ do: entry.do, undo: entry.undo });
    this.emit("history", this.historyState());
    return res;
  }

  async redo() {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    const res = await this.apply(entry.do, { undoable: false });
    this.undoStack.push({ do: entry.do, undo: res.inverse?.length ? res.inverse : entry.undo });
    this.emit("history", this.historyState());
    return res;
  }

  async undoRobot() {
    const res = await this.io.send("POST", `/api/whiteboards/${encodeURIComponent(this.doc.id)}/undo-ai`, {});
    return res;
  }

  // ---------- The robot ----------
  setAi(p) {
    if (!p) return;
    this.ai = { ...p, since: p.since || this.io.now() };
    this.emit("ai", this.ai);
  }

  // The items just added are written one after the other, each on its own clock
  startReveal(ops, batch) {
    const speed = this.getSettings().whiteboard?.writingSpeed || "normal";
    const items = [];
    for (const op of ops) {
      if (op.op === "add" && op.item) items.push(op.item);
      else if (op.op === "restore") for (const entry of op.items || []) items.push(entry.item || entry);
    }
    if (!items.length) return;
    let total = 0;
    const planned = items.map((item) => {
      const ms = revealDuration(item, speed);
      total += ms;
      return { id: item.id, ms, type: item.type, item };
    });
    // A long batch (a whole template) is shown in no more than a few seconds
    const squeeze = total > 6000 ? 6000 / total : 1;
    const lead = Math.min(6000, Math.max(0, Number(this.revealDelay?.()) || 0));
    const notBefore = this.io.now() + lead;
    for (const p of planned) {
      p.ms = Math.max(120, p.ms * squeeze);
      p.notBefore = notBefore;
      this.reveal.set(p.id, 0);
      this.revealQueue.push(p);
    }
    this.emit("reveal", { start: true, count: planned.length, batch });
    this.pump();
  }

  pump() {
    if (this.pumping) return;
    this.pumping = true;
    const step = () => {
      const now = this.io.now();
      if (!this.revealing && this.revealQueue.length && this.revealQueue[0].notBefore > now) {
        // Waiting for the speech to reach this point
        this.rafId = this.io.raf(step);
        return;
      }
      if (!this.revealing) {
        this.revealing = this.revealQueue.shift() || null;
        if (this.revealing) this.revealing.t0 = now;
      }
      if (!this.revealing) {
        this.pumping = false;
        this.tip = null;
        this.emit("reveal", { done: true });
        this.emit("frame", { tip: null });
        return;
      }
      const r = this.revealing;
      const p = Math.min(1, (now - r.t0) / r.ms);
      // Gone meanwhile (the user erased it)? Skip.
      const live = this.page?.items.some((it) => it.id === r.id) || this.doc.pages.some((pg) => pg.items.some((it) => it.id === r.id));
      if (!live) {
        this.reveal.delete(r.id);
        this.revealing = null;
      } else if (p >= 1) {
        this.reveal.delete(r.id);
        this.revealing = null;
      } else {
        this.reveal.set(r.id, p);
        const item = this.itemById(r.id);
        this.tip = item ? { ...tipFor(item, p), id: r.id, kind: item.type } : null;
      }
      this.emit("frame", { id: r.id, progress: p, tip: this.tip });
      this.rafId = this.io.raf(step);
    };
    this.rafId = this.io.raf(step);
  }

  // Everything written at once (the animation is skipped: a tap on the board, a page change)
  finishReveal() {
    this.reveal.clear();
    this.revealQueue = [];
    this.revealing = null;
    this.emit("frame", { tip: null });
  }

  get writing() {
    return Boolean(this.revealing || this.revealQueue.length);
  }

  // ---------- Where you are (the robot is told) ----------
  sendPresence(partial = {}, { now = false } = {}) {
    Object.assign(this.presence, partial);
    if (!this.doc) return;
    const run = () => {
      this.presenceTimer = null;
      this.lastPresence = this.io.now();
      const body = { ...this.presence, page: this.pageIndex };
      this.presence = { ...this.presence, drawing: false };
      this.io.send("POST", `/api/whiteboards/${encodeURIComponent(this.doc.id)}/presence`, body).catch(() => {});
    };
    if (now) {
      clearTimeout(this.presenceTimer);
      run();
    } else if (!this.presenceTimer) {
      const wait = Math.max(0, 300 - (this.io.now() - this.lastPresence));
      this.presenceTimer = setTimeout(run, wait);
    }
  }

  // ---------- Boards ----------
  async openBoard(id) {
    await this.io.send("PUT", "/api/whiteboards/current", { id });
    await this.load(id);
    return this.doc;
  }

  async createBoard(title) {
    const doc = await this.io.send("POST", "/api/whiteboards", { title });
    await this.openBoard(doc.id);
    return doc;
  }

  boards() {
    return this.io.get("/api/whiteboards");
  }

  async uploadImage(blob) {
    return this.io.upload(`/api/whiteboards/${encodeURIComponent(this.doc.id)}/assets`, blob);
  }

  describe() {
    return this.io.get(`/api/whiteboards/${encodeURIComponent(this.doc.id)}/describe`);
  }

  // ---------- Small helpers views use ----------
  itemById(id) {
    for (const p of this.doc?.pages || []) {
      const it = p.items.find((x) => x.id === id);
      if (it) return it;
    }
    return null;
  }

  pageIdAt(index = this.pageIndex) {
    return pageOf(this.doc, index)?.id;
  }

  boxOf(id) {
    const it = this.itemById(id);
    return it ? getBoundingBox(it) : null;
  }

  destroy() {
    this.stop?.();
    clearTimeout(this.presenceTimer);
    clearTimeout(this.gapTimer);
    if (this.rafId) this.io.caf?.(this.rafId);
  }
}
