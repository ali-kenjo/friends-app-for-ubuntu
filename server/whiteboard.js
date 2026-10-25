// The whiteboards: stored as JSON in <data folder>/whiteboards/, and shared between you (the page) and the AI.
//
// Both of you change a board by sending operations (see src/js/whiteboard/ops.mjs). The helper puts them in order,
// keeps a numbered log of what changed and who did it, and tells every page at once (events.on("ops")), so a drawing
// by the robot shows up on your screen while you are drawing too, and neither overwrites the other.
// Boards are kept in memory and written to disk a moment after they change.
const EventEmitter = require("events");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { dataDir } = require("./config");
const model = require("../src/js/whiteboard/model.mjs");
const ops = require("../src/js/whiteboard/ops.mjs");
const describe = require("../src/js/whiteboard/describe.mjs");
const logger = require("./logger");

const events = new EventEmitter();
events.setMaxListeners(50);

const MAX_STORAGE_BYTES = 200 * 1024 * 1024;
const MAX_HISTORY_PER_BOARD = 30;
const SNAPSHOT_EVERY = { user: 120_000, ai: 20_000, mission: 20_000 }; // at most one safety copy this often
const WRITE_DELAY = 400;
const LOG_KEEP = 300;
const AI_BATCHES_KEEP = 30;
const ID = /^[\w-]{1,64}$/;
const ASSET_NAME = /^[\w.-]{1,80}$/;
const MAX_ASSET = 6 * 1024 * 1024;
const MAX_ASSETS_PER_BOARD = 60;

const live = new Map(); // id → { doc, dirty, timer, log: [], batches: [], seen: { ai: rev }, lastSnapshot, snapSeq }
let presence = new Map(); // id → { user, ai }

function getStorageDir() {
  const dir = path.join(dataDir, "whiteboards");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function safeId(id) {
  const s = String(id ?? "");
  if (!ID.test(s)) throw new Error("Invalid whiteboard ID");
  return s;
}

const boardPath = (id) => path.join(getStorageDir(), `${safeId(id)}.json`);
const historyDir = (id) => path.join(getStorageDir(), `${safeId(id)}.history`);
const assetsDir = (id) => path.join(getStorageDir(), `${safeId(id)}.assets`);
const indexPath = () => path.join(getStorageDir(), "index.json");
const statePath = () => path.join(getStorageDir(), "state.json");

function atomicWrite(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// ---------- The list of boards ----------
const metaOf = (doc) => ({
  id: doc.id,
  title: doc.title,
  scope: doc.scope || "general",
  scopeId: doc.scopeId || "",
  pageCount: doc.pages.length,
  itemCount: doc.pages.reduce((n, p) => n + (p.items?.length || 0), 0),
  updatedAt: doc.updatedAt,
  createdAt: doc.createdAt || doc.updatedAt,
  author: doc.author || "user",
  rev: doc.rev || 0,
});

function readIndex() {
  try {
    const data = JSON.parse(fs.readFileSync(indexPath(), "utf8"));
    if (Array.isArray(data)) return data;
  } catch {}
  return rebuildIndex();
}

function writeIndex(index) {
  try {
    atomicWrite(indexPath(), JSON.stringify(index));
  } catch (err) {
    logger.warn("Couldn't write the whiteboard list:", err.message);
  }
}

function rebuildIndex() {
  const dir = getStorageDir();
  const entries = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json") || f === "index.json" || f === "state.json") continue;
      try {
        const doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        if (doc && typeof doc.id === "string" && ID.test(doc.id)) entries.push({ ...metaOf(clean(doc)), updatedAt: doc.updatedAt || doc.createdAt || Date.now() });
      } catch {}
    }
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    writeIndex(entries);
  } catch {}
  return entries;
}

function upsertIndex(doc) {
  const index = readIndex();
  const meta = metaOf(doc);
  const at = index.findIndex((b) => b.id === doc.id);
  if (at >= 0) index[at] = meta;
  else index.unshift(meta);
  index.sort((a, b) => b.updatedAt - a.updatedAt);
  writeIndex(index);
}

// ---------- Loading and saving ----------
function clean(raw) {
  const doc = model.createDocument(raw);
  if (raw && Number.isFinite(raw.updatedAt)) doc.updatedAt = raw.updatedAt;
  return doc;
}

function entryOf(id) {
  const key = safeId(id);
  let e = live.get(key);
  if (e) return e;
  const file = boardPath(key);
  if (!fs.existsSync(file)) return null;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`Corrupted whiteboard file: ${err.message}`);
  }
  const doc = clean({ ...raw, id: key });
  e = { doc, dirty: false, timer: null, log: [], batches: [], seen: { ai: doc.rev || 0 }, lastSnapshot: {}, snapSeq: 0 };
  live.set(key, e);
  return e;
}

function persist(id) {
  const e = live.get(id);
  if (!e) return;
  clearTimeout(e.timer);
  e.timer = null;
  if (!e.dirty) return;
  e.dirty = false;
  try {
    atomicWrite(boardPath(id), JSON.stringify(e.doc));
    upsertIndex(e.doc);
  } catch (err) {
    e.dirty = true;
    logger.warn("Couldn't save a whiteboard:", err.message);
  }
}

function touch(e) {
  e.dirty = true;
  if (!e.timer) {
    e.timer = setTimeout(() => persist(e.doc.id), WRITE_DELAY);
    e.timer.unref?.();
  }
}

// Writes everything that's waiting (the helper is closing, or a test wants the file)
function flush() {
  for (const id of [...live.keys()]) persist(id);
}
process.once("exit", flush);

// A safety copy of a board as it is (or as `text` says): the last so many are kept, to go back to
function snapshot(e, actor, why = "", text = null) {
  try {
    const dir = historyDir(e.doc.id);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const name = `${Date.now()}_${String(++e.snapSeq % 1000).padStart(3, "0")}_${actor || "user"}${why ? `_${why.replace(/\W/g, "").slice(0, 12)}` : ""}`;
    atomicWrite(path.join(dir, `${name}.json`), text ?? JSON.stringify(e.doc));
    e.lastSnapshot[actor || "user"] = Date.now();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    while (files.length > MAX_HISTORY_PER_BOARD) fs.rmSync(path.join(dir, files.shift()), { force: true });
  } catch (err) {
    logger.debug("Whiteboard snapshot skipped:", err.message);
  }
}

// ---------- The current board ----------
// Which board you and the AI are working on right now. Opening another one in the page changes it for the AI too.
function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), "utf8")) || {};
  } catch {
    return {};
  }
}

function current() {
  const st = readState();
  if (st.current && ID.test(st.current)) {
    try {
      const e = entryOf(st.current);
      if (e) return e.doc;
    } catch {}
  }
  // The newest board of the main scope, else a new one
  const first = readIndex().find((b) => b.scope === "general" && !b.scopeId);
  if (first) {
    const e = entryOf(first.id);
    if (e) return setCurrent(e.doc.id);
  }
  const doc = create({ title: "Main Whiteboard" });
  return setCurrent(doc.id);
}

function setCurrent(id) {
  const e = entryOf(id);
  if (!e) throw new Error("Whiteboard not found");
  const st = readState();
  if (st.current !== e.doc.id) {
    atomicWrite(statePath(), JSON.stringify({ ...st, current: e.doc.id }));
    events.emit("board", { type: "current", id: e.doc.id });
  }
  return e.doc;
}

// ---------- The classic API (list, get, create…) ----------
function list({ scope = "", scopeId = "", search = "" } = {}) {
  let index = readIndex();
  if (scope) index = index.filter((b) => b.scope === scope && (!scopeId || b.scopeId === scopeId));
  if (search) {
    const q = String(search).toLowerCase();
    index = index.filter((b) => b.title?.toLowerCase().includes(q));
  }
  return index;
}

function get(id) {
  const e = entryOf(id);
  return e ? e.doc : null;
}

function getActive(scope = "general", scopeId = "") {
  if (scope === "general" && !scopeId) return current();
  const existing = list({ scope, scopeId });
  if (existing.length > 0) {
    const top = get(existing[0].id);
    if (top) return top;
  }
  return create({ title: scope === "general" ? "Main Whiteboard" : `Whiteboard (${scope})`, scope, scopeId });
}

function create(data = {}) {
  const doc = model.createDocument({ ...data, id: undefined, rev: 0 });
  const e = { doc, dirty: true, timer: null, log: [], batches: [], seen: { ai: 0 }, lastSnapshot: {}, snapSeq: 0 };
  live.set(doc.id, e);
  persist(doc.id);
  events.emit("board", { type: "created", id: doc.id });
  enforceLimits();
  return doc;
}

// Replaces a whole board (the page importing a file, a restore, a mission drawing its plan). Everyone reloads it.
function save(id, raw, { actor = "user" } = {}) {
  if (!raw || typeof raw !== "object") throw new Error("Invalid document data");
  const key = safeId(id);
  const old = entryOf(key);
  const doc = clean({ ...raw, id: key, createdAt: old?.doc.createdAt || raw.createdAt });
  doc.title = String(raw.title || old?.doc.title || "Untitled Board").trim().slice(0, model.LIMITS.title) || "Untitled Board";
  doc.rev = (old?.doc.rev || 0) + 1;
  doc.updatedAt = Date.now();
  if (old) snapshot(old, actor, "replaced");
  const e = old || { log: [], batches: [], seen: { ai: 0 }, lastSnapshot: {}, snapSeq: 0, timer: null };
  e.doc = doc;
  e.batches = [];
  e.log.push({ rev: doc.rev, at: doc.updatedAt, actor, briefs: [{ verb: "replaced", type: "board", id: doc.id, label: doc.title }] });
  live.set(key, e);
  touch(e);
  persist(key);
  events.emit("board", { type: "replaced", id: key, rev: doc.rev });
  enforceLimits();
  return doc;
}

// Title and settings (the old way); items go through apply()
function patch(id, partial = {}) {
  const e = entryOf(id);
  if (!e) throw new Error("Whiteboard not found");
  const set = {};
  if (typeof partial.title === "string") set.title = partial.title;
  if (partial.settings && typeof partial.settings === "object") set.settings = partial.settings;
  if (Object.keys(set).length) apply(id, { op: "doc_update", set }, { actor: "user" });
  return e.doc;
}

function remove(id) {
  const key = safeId(id);
  const file = boardPath(key);
  let removed = false;
  clearTimeout(live.get(key)?.timer);
  live.delete(key);
  presence.delete(key);
  if (fs.existsSync(file)) {
    fs.rmSync(file, { force: true });
    removed = true;
  }
  fs.rmSync(historyDir(key), { recursive: true, force: true });
  fs.rmSync(assetsDir(key), { recursive: true, force: true });
  writeIndex(readIndex().filter((b) => b.id !== key));
  if (readState().current === key) atomicWrite(statePath(), JSON.stringify({ ...readState(), current: undefined }));
  events.emit("board", { type: "deleted", id: key });
  return removed;
}

function duplicate(id) {
  const orig = get(id);
  if (!orig) throw new Error("Whiteboard not found");
  const copy = clean({ ...JSON.parse(JSON.stringify(orig)), id: undefined, title: `${orig.title} (Copy)`.slice(0, model.LIMITS.title), rev: 0, createdAt: Date.now(), updatedAt: Date.now() });
  const e = { doc: copy, dirty: true, timer: null, log: [], batches: [], seen: { ai: 0 }, lastSnapshot: {}, snapSeq: 0 };
  live.set(copy.id, e);
  // The pictures come along
  try {
    if (fs.existsSync(assetsDir(orig.id))) {
      fs.cpSync(assetsDir(orig.id), assetsDir(copy.id), { recursive: true });
      const text = JSON.stringify(copy).split(`/api/whiteboards/assets/${orig.id}/`).join(`/api/whiteboards/assets/${copy.id}/`);
      e.doc = clean(JSON.parse(text));
    }
  } catch (err) {
    logger.debug("Couldn't copy pictures:", err.message);
  }
  persist(copy.id);
  events.emit("board", { type: "created", id: copy.id });
  return e.doc;
}

// ---------- Changing a board together ----------
// ops: one operation or a list. actor: user | ai | mission. cid: the page's own id for this change (so it knows its echo).
// batch: groups what the AI did in one reply, so "undo the robot's last action" undoes all of it.
function apply(id, opList, { actor = "user", cid = "", batch = "" } = {}) {
  const e = entryOf(id);
  if (!e) throw new Error("Whiteboard not found");
  const list = Array.isArray(opList) ? opList : [opList];
  if (list.length > ops.MAX_OPS) throw new Error(`At most ${ops.MAX_OPS} changes at a time.`);
  const who = model.ACTORS.includes(actor) ? actor : "user";
  const due = Date.now() - (e.lastSnapshot[who] || 0) > SNAPSHOT_EVERY[who];
  const before = due ? JSON.stringify(e.doc) : null;
  const result = ops.applyOps(e.doc, list, { actor: who });
  if (!result.changed) return { rev: e.doc.rev, applied: [], inverse: [], errors: result.errors, touched: [], changed: false };
  if (before) snapshot(e, who, "", before); // one safety copy every so often per kind of editor
  e.doc.rev = (e.doc.rev || 0) + 1;
  const entry = { rev: e.doc.rev, at: e.doc.updatedAt, actor: who, batch: batch || "", briefs: result.briefs };
  e.log.push(entry);
  if (e.log.length > LOG_KEEP) e.log.splice(0, e.log.length - LOG_KEEP);
  if (who !== "user" && batch) {
    const last = e.batches[e.batches.length - 1];
    if (last && last.batch === batch) last.inverse = [...result.inverse, ...last.inverse];
    else e.batches.push({ batch, actor: who, inverse: result.inverse, rev: e.doc.rev });
    if (e.batches.length > AI_BATCHES_KEEP) e.batches.shift();
  }
  touch(e);
  const payload = { boardId: e.doc.id, rev: e.doc.rev, actor: who, cid, batch, ops: result.applied, touched: result.touched, pages: result.pages, briefs: result.briefs, at: entry.at };
  events.emit("ops", payload);
  return { rev: e.doc.rev, applied: result.applied, inverse: result.inverse, errors: result.errors, touched: result.touched, changed: true };
}

// Takes back what the robot (or a mission) did in its latest reply
function undoLast(id, { actor = "ai", by = "user" } = {}) {
  const e = entryOf(id);
  if (!e) throw new Error("Whiteboard not found");
  const at = [...e.batches].reverse().findIndex((b) => b.actor === actor);
  if (at < 0) return { ok: false, error: "There's nothing of the robot's left to undo." };
  const idx = e.batches.length - 1 - at;
  const [batch] = e.batches.splice(idx, 1);
  const res = apply(id, batch.inverse, { actor: by === "ai" ? "ai" : "user", batch: "" });
  return { ok: true, rev: res.rev, errors: res.errors, undone: batch.batch };
}

// What changed since a number (for a page that lost its connection): the operations, or "reload the board"
function since(id, rev) {
  const e = entryOf(id);
  if (!e) throw new Error("Whiteboard not found");
  return { rev: e.doc.rev, reload: !(e.log.length && e.log[0].rev <= rev + 1) || rev > e.doc.rev, changes: e.log.filter((x) => x.rev > rev).map((x) => ({ rev: x.rev, actor: x.actor, briefs: x.briefs })) };
}

// ---------- Who is doing what right now ----------
// who: "user" (the page: which page, pointer, selection, tool) or "ai" (the robot's pen and pointer)
const PRESENCE_KEYS = ["page", "pointer", "pointerAt", "selection", "tool", "drawingAt", "viewing", "view", "x", "y", "label", "action", "since", "mode"];
function setPresence(id, who, data = {}) {
  const key = safeId(id);
  const cur = presence.get(key) || {};
  const next = { ...(cur[who] || {}) };
  for (const k of PRESENCE_KEYS) if (k in data) next[k] = data[k];
  if (Array.isArray(next.selection)) next.selection = next.selection.filter((s) => typeof s === "string" && ID.test(s)).slice(0, 20);
  if (next.pointer && !(Number.isFinite(next.pointer.x) && Number.isFinite(next.pointer.y))) delete next.pointer;
  if (next.pointer) next.pointerAt = Date.now();
  next.seenAt = Date.now();
  presence.set(key, { ...cur, [who]: next });
  events.emit("presence", { boardId: key, who, presence: next });
  return next;
}

function getPresence(id) {
  const p = presence.get(String(id));
  if (!p) return {};
  // A page that hasn't been heard from in a minute isn't looking any more
  const user = p.user && Date.now() - (p.user.seenAt || 0) < 60_000 ? p.user : null;
  return { user, ai: p.ai };
}

// ---------- What the AI sees ----------
// opts: { user (name), maxChars, pageIndex, markSeen }
function describeFor(id, opts = {}) {
  const e = entryOf(id);
  if (!e) throw new Error("Whiteboard not found");
  const pres = getPresence(id);
  const pageIndex = Number.isInteger(opts.pageIndex) ? opts.pageIndex : Number.isInteger(pres.user?.page) ? pres.user.page : e.doc.activePageIndex;
  const since = e.seen.ai || 0;
  const changes = e.log.filter((x) => x.rev > since && x.actor !== "ai");
  const text = describe.describeBoard(e.doc, { pageIndex, user: opts.user, maxChars: opts.maxChars, presence: pres, changes, now: Date.now() });
  if (opts.markSeen !== false) e.seen.ai = e.doc.rev;
  return { text, rev: e.doc.rev, changes: changes.length, pageIndex };
}

// ---------- History ----------
function getHistory(id) {
  const dir = historyDir(id);
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const key = f.replace(/\.json$/, "");
        const [ts, , actor = "user", why = ""] = key.split("_");
        return { versionId: key, timestamp: Number.isFinite(Number(ts)) ? Number(ts) : Date.now(), filename: f, actor, why };
      })
      .sort((a, b) => b.versionId.localeCompare(a.versionId));
  } catch {
    return [];
  }
}

function restoreVersion(id, version) {
  const dir = historyDir(id);
  const target = String(version ?? "").replace(/\.json$/, "");
  if (!/^[\w.-]{1,80}$/.test(target) || !fs.existsSync(dir)) throw new Error("Snapshot not found");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const match = files.find((f) => f.replace(/\.json$/, "") === target) || files.find((f) => f.startsWith(`${target}_`));
  if (!match) throw new Error("Snapshot not found");
  const raw = JSON.parse(fs.readFileSync(path.join(dir, match), "utf8"));
  return save(id, raw, { actor: "user" });
}

// ---------- Exports ----------
function exportData(id, { format = "json" } = {}) {
  const doc = get(id);
  if (!doc) throw new Error("Whiteboard not found");
  if (format === "text" || format === "markdown") return { format: "text", text: model.documentToText(doc), title: doc.title };
  return { format: "json", data: doc, title: doc.title };
}

function exportBoard(id, format = "markdown") {
  const doc = get(id);
  if (!doc) throw new Error("Whiteboard not found");
  return format === "markdown" || format === "text" ? model.documentToText(doc) : JSON.stringify(doc, null, 2);
}

// ---------- Pictures ----------
const MAGIC = [
  ["image/png", "png", (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47],
  ["image/jpeg", "jpg", (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/gif", "gif", (b) => b.length > 6 && b.toString("latin1", 0, 3) === "GIF"],
  ["image/webp", "webp", (b) => b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP"],
];

// A picture for a board: checked by what it starts with (not by what the sender says), kept under a name made from its content
function saveAsset(boardId, buffer) {
  const id = safeId(boardId);
  if (!entryOf(id)) throw new Error("Whiteboard not found");
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error("The picture is empty.");
  if (buffer.length > MAX_ASSET) throw new Error("A picture can be up to 6 MB.");
  const kind = MAGIC.find(([, , test]) => test(buffer));
  if (!kind) throw new Error("Only PNG, JPEG, GIF and WebP pictures can be put on a board.");
  const dir = assetsDir(id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const name = `${crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 24)}.${kind[1]}`;
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) {
    if (fs.readdirSync(dir).length >= MAX_ASSETS_PER_BOARD) throw new Error("This board has as many pictures as it can hold.");
    fs.writeFileSync(file, buffer, { mode: 0o600 });
  }
  return { src: `/api/whiteboards/assets/${id}/${name}`, mime: kind[0], size: buffer.length };
}

function readAsset(boardId, name) {
  const id = safeId(boardId);
  if (!ASSET_NAME.test(String(name)) || name.includes("..")) return null;
  const file = path.join(assetsDir(id), name);
  if (!fs.existsSync(file)) return null;
  const ext = path.extname(name).slice(1).toLowerCase();
  const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" }[ext];
  return mime ? { file, mime } : null;
}

// ---------- Keeping the folder in check ----------
function dirSize(dir) {
  let total = 0;
  try {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, f.name);
      total += f.isDirectory() ? dirSize(full) : fs.statSync(full).size;
    }
  } catch {}
  return total;
}

function enforceLimits() {
  try {
    const dir = getStorageDir();
    let total = dirSize(dir);
    if (total <= MAX_STORAGE_BYTES) return;
    // The oldest safety copies go first
    const snaps = [];
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!f.isDirectory() || !f.name.endsWith(".history")) continue;
      for (const s of fs.readdirSync(path.join(dir, f.name))) {
        const full = path.join(dir, f.name, s);
        const st = fs.statSync(full);
        snaps.push({ full, mtime: st.mtimeMs, size: st.size });
      }
    }
    snaps.sort((a, b) => a.mtime - b.mtime);
    for (const s of snaps) {
      fs.rmSync(s.full, { force: true });
      total -= s.size;
      if (total <= MAX_STORAGE_BYTES) break;
    }
  } catch {}
}

// Tests and restores start from what's on disk
function reset() {
  for (const e of live.values()) clearTimeout(e.timer);
  live.clear();
  presence = new Map();
}

module.exports = {
  events,
  getStorageDir,
  list,
  get,
  current,
  setCurrent,
  getActive,
  create,
  save,
  patch,
  remove,
  duplicate,
  apply,
  undoLast,
  since,
  setPresence,
  getPresence,
  describeFor,
  getHistory,
  restoreVersion,
  exportData,
  exportBoard,
  saveAsset,
  readAsset,
  enforceLimits,
  flush,
  reset,
};
