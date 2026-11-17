// ---------- Undo and redo for the Room Editor ----------
// Pure. Each step stores only what changed between two room documents (the assets that differ, their
// order, and the top-level parts that differ), so a long history stays small. A drag is one step:
// pushes with the same `coalesce` key a moment apart merge into the step before.

const TOP = ["name", "size", "architecture", "atmosphere", "robot", "cameras", "defaultCamera", "scenes", "activeScene", "backdrop"];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// What turns `from` into `to`
export function diffRooms(from, to) {
  const patch = { assets: {}, order: null, top: {} };
  const a = new Map(from.assets.map((x) => [x.id, x]));
  const b = new Map(to.assets.map((x) => [x.id, x]));
  for (const [id, x] of b) if (!a.has(id) || !same(a.get(id), x)) patch.assets[id] = clone(x);
  for (const id of a.keys()) if (!b.has(id)) patch.assets[id] = null;
  const orderA = from.assets.map((x) => x.id);
  const orderB = to.assets.map((x) => x.id);
  if (!same(orderA, orderB)) patch.order = orderB;
  for (const k of TOP) if (!same(from[k], to[k])) patch.top[k] = clone(to[k]);
  return patch;
}

export const isEmpty = (p) => !Object.keys(p.assets).length && !p.order && !Object.keys(p.top).length;

export function applyPatch(room, patch) {
  const byId = new Map(room.assets.map((x) => [x.id, x]));
  for (const [id, x] of Object.entries(patch.assets)) {
    if (x === null) byId.delete(id);
    else byId.set(id, clone(x));
  }
  const order = patch.order || [...room.assets.map((x) => x.id), ...Object.keys(patch.assets).filter((id) => !room.assets.some((x) => x.id === id))];
  const assets = order.filter((id) => byId.has(id)).map((id) => byId.get(id));
  for (const [id, x] of byId) if (!order.includes(id)) assets.push(x);
  const out = { ...room, assets };
  for (const [k, v] of Object.entries(patch.top)) out[k] = clone(v);
  return out;
}

export class History {
  constructor({ limit = 150, mergeMs = 900 } = {}) {
    this.limit = limit;
    this.mergeMs = mergeMs;
    this.undoStack = [];
    this.redoStack = [];
  }

  // Record a change from `before` to `after` (two room documents); label: what it was, for the button's title
  push(label, before, after, { coalesce = null, now = Date.now() } = {}) {
    const redo = diffRooms(before, after);
    if (isEmpty(redo)) return false;
    const last = this.undoStack[this.undoStack.length - 1];
    if (coalesce && last && last.coalesce === coalesce && now - last.at < this.mergeMs) {
      // The same drag: keep the first undo, take the newest redo
      last.redo = diffRooms(last.base, after);
      last.at = now;
      this.redoStack.length = 0;
      return true;
    }
    this.undoStack.push({ label, undo: diffRooms(after, before), redo, coalesce, at: now, base: clone(before) });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    return true;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  get undoLabel() {
    return this.undoStack[this.undoStack.length - 1]?.label || "";
  }
  get redoLabel() {
    return this.redoStack[this.redoStack.length - 1]?.label || "";
  }

  undo(room) {
    const step = this.undoStack.pop();
    if (!step) return null;
    // A merged drag's undo goes back to where it started
    const back = step.coalesce ? applyPatch(room, diffRooms(room, step.base)) : applyPatch(room, step.undo);
    this.redoStack.push({ ...step, redo: diffRooms(back, room) });
    return { room: back, label: step.label };
  }

  redo(room) {
    const step = this.redoStack.pop();
    if (!step) return null;
    const next = applyPatch(room, step.redo);
    this.undoStack.push({ ...step, undo: diffRooms(next, room), base: clone(room), coalesce: null });
    return { room: next, label: step.label };
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
