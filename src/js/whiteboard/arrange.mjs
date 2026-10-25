// Where things go: an empty spot for something new, and tidying what is there (align, spread out, grid, stack).
// Pure; it makes `translate` operations, so a tidy-up is one undoable step like any other edit.
import { getBoundingBox, getSelectionBoundingBox } from "./model.mjs";

export const CANVAS = { width: 1600, height: 1000 };

const overlaps = (a, b, margin = 0) => !(a.maxX + margin <= b.minX || a.minX - margin >= b.maxX || a.maxY + margin <= b.minY || a.minY - margin >= b.maxY);

// Items that are drawn on top of everything and shouldn't count as "in the way" (a highlighter, a big frame)
const background = (it) => it.type === "frame" || (it.type === "shape" && (it.opacity ?? 1) < 0.6 && it.strokeWidth === 0);

// A place for a w×h thing: as near as possible to `near`, not touching anything. If the page is full, below the lowest item.
export function findFreeSpot(page, w, h, { near = { x: 100, y: 100 }, margin = 24, step = 20, bounds = CANVAS } = {}) {
  const boxes = (page?.items || []).filter((it) => !background(it)).map(getBoundingBox);
  const fits = (x, y) => {
    const r = { minX: x, minY: y, maxX: x + w, maxY: y + h };
    return !boxes.some((b) => overlaps(r, b, margin));
  };
  const wantX = Math.max(0, near.x);
  const wantY = Math.max(0, near.y);
  if (fits(wantX, wantY)) return { x: Math.round(wantX), y: Math.round(wantY) };
  let best = null;
  const maxX = Math.max(bounds.width - w, 0);
  const maxY = Math.max(bounds.height - h, 0);
  for (let y = 0; y <= maxY; y += step) {
    for (let x = 0; x <= maxX; x += step) {
      if (!fits(x, y)) continue;
      const d = (x - wantX) ** 2 + (y - wantY) ** 2;
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  if (best) return { x: best.x, y: best.y };
  // No room on the canvas: below everything
  const lowest = boxes.reduce((m, b) => Math.max(m, b.maxY), 0);
  return { x: Math.round(wantX), y: Math.round(lowest + margin) };
}

// The big empty areas, for telling the AI where there is room: rectangles on a coarse grid, merged into the largest runs
export function freeRegions(page, { bounds = CANVAS, cell = 100, min = 200, limit = 4 } = {}) {
  const boxes = (page?.items || []).filter((it) => !background(it)).map(getBoundingBox);
  const cols = Math.ceil(bounds.width / cell);
  const rows = Math.ceil(bounds.height / cell);
  const used = Array.from({ length: rows }, () => new Array(cols).fill(false));
  for (const b of boxes) {
    const c0 = Math.max(0, Math.floor(b.minX / cell));
    const c1 = Math.min(cols - 1, Math.floor(b.maxX / cell));
    const r0 = Math.max(0, Math.floor(b.minY / cell));
    const r1 = Math.min(rows - 1, Math.floor(b.maxY / cell));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) used[r][c] = true;
  }
  // Largest empty rectangles, found greedily: take the biggest, mark it used, repeat
  const found = [];
  for (let n = 0; n < limit; n++) {
    let best = null;
    for (let r0 = 0; r0 < rows; r0++) {
      for (let c0 = 0; c0 < cols; c0++) {
        if (used[r0][c0]) continue;
        let maxC = cols;
        for (let r = r0; r < rows && !used[r][c0]; r++) {
          let c = c0;
          while (c < maxC && !used[r][c]) c++;
          maxC = c;
          const area = (maxC - c0) * (r - r0 + 1);
          if (!best || area > best.area) best = { r0, c0, r1: r, c1: maxC - 1, area };
        }
      }
    }
    if (!best || (best.c1 - best.c0 + 1) * cell < min || (best.r1 - best.r0 + 1) * cell < min * 0.6) break;
    for (let r = best.r0; r <= best.r1; r++) for (let c = best.c0; c <= best.c1; c++) used[r][c] = true;
    found.push({ x: best.c0 * cell, y: best.r0 * cell, width: (best.c1 - best.c0 + 1) * cell, height: (best.r1 - best.r0 + 1) * cell });
  }
  return found;
}

// ---------- Tidying: each returns translate operations ----------
const moveOp = (page, it, dx, dy) => (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 ? null : { op: "translate", page: page.id, ids: [it.id], dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10 });

export const ARRANGE_MODES = ["align_left", "align_center", "align_right", "align_top", "align_middle", "align_bottom", "distribute_h", "distribute_v", "grid", "stack_v", "stack_h", "tidy"];

export function arrangeOps(page, items, mode, { gap = 24, columns = 0 } = {}) {
  const list = items.filter(Boolean);
  if (list.length < 2 && mode !== "tidy") return [];
  const boxes = new Map(list.map((it) => [it.id, getBoundingBox(it)]));
  const all = getSelectionBoundingBox(list);
  const ops = [];
  const push = (o) => o && ops.push(o);
  switch (mode) {
    case "align_left": for (const it of list) push(moveOp(page, it, all.minX - boxes.get(it.id).minX, 0)); break;
    case "align_right": for (const it of list) push(moveOp(page, it, all.maxX - boxes.get(it.id).maxX, 0)); break;
    case "align_center": for (const it of list) push(moveOp(page, it, all.cx - boxes.get(it.id).cx, 0)); break;
    case "align_top": for (const it of list) push(moveOp(page, it, 0, all.minY - boxes.get(it.id).minY)); break;
    case "align_bottom": for (const it of list) push(moveOp(page, it, 0, all.maxY - boxes.get(it.id).maxY)); break;
    case "align_middle": for (const it of list) push(moveOp(page, it, 0, all.cy - boxes.get(it.id).cy)); break;
    case "distribute_h": {
      if (list.length < 3) break;
      const sorted = [...list].sort((a, b) => boxes.get(a.id).cx - boxes.get(b.id).cx);
      const total = sorted.reduce((s, it) => s + boxes.get(it.id).width, 0);
      const space = (all.width - total) / (sorted.length - 1);
      let x = all.minX;
      for (const it of sorted) {
        push(moveOp(page, it, x - boxes.get(it.id).minX, 0));
        x += boxes.get(it.id).width + space;
      }
      break;
    }
    case "distribute_v": {
      if (list.length < 3) break;
      const sorted = [...list].sort((a, b) => boxes.get(a.id).cy - boxes.get(b.id).cy);
      const total = sorted.reduce((s, it) => s + boxes.get(it.id).height, 0);
      const space = (all.height - total) / (sorted.length - 1);
      let y = all.minY;
      for (const it of sorted) {
        push(moveOp(page, it, 0, y - boxes.get(it.id).minY));
        y += boxes.get(it.id).height + space;
      }
      break;
    }
    case "stack_v": {
      const sorted = [...list].sort((a, b) => boxes.get(a.id).minY - boxes.get(b.id).minY);
      let y = all.minY;
      for (const it of sorted) {
        push(moveOp(page, it, all.minX - boxes.get(it.id).minX, y - boxes.get(it.id).minY));
        y += boxes.get(it.id).height + gap;
      }
      break;
    }
    case "stack_h": {
      const sorted = [...list].sort((a, b) => boxes.get(a.id).minX - boxes.get(b.id).minX);
      let x = all.minX;
      for (const it of sorted) {
        push(moveOp(page, it, x - boxes.get(it.id).minX, all.minY - boxes.get(it.id).minY));
        x += boxes.get(it.id).width + gap;
      }
      break;
    }
    case "grid": {
      const sorted = [...list].sort((a, b) => boxes.get(a.id).minY - boxes.get(b.id).minY || boxes.get(a.id).minX - boxes.get(b.id).minX);
      const cols = columns > 0 ? columns : Math.max(1, Math.round(Math.sqrt(sorted.length)));
      const cellW = Math.max(...sorted.map((it) => boxes.get(it.id).width)) + gap;
      const cellH = Math.max(...sorted.map((it) => boxes.get(it.id).height)) + gap;
      sorted.forEach((it, i) => {
        const b = boxes.get(it.id);
        push(moveOp(page, it, all.minX + (i % cols) * cellW - b.minX, all.minY + Math.floor(i / cols) * cellH - b.minY));
      });
      break;
    }
    case "tidy": {
      // Items nearly in a row or column line up with each other, and everything snaps to 10 px
      const target = list.length ? list : page.items.filter((it) => !background(it) && it.type !== "stroke");
      for (const it of target) {
        const b = getBoundingBox(it);
        push(moveOp(page, it, Math.round(b.minX / 10) * 10 - b.minX, Math.round(b.minY / 10) * 10 - b.minY));
      }
      break;
    }
    default:
      return [];
  }
  return ops;
}

// Moves a batch of "add" operations so their group starts at (x, y)
export function offsetAdds(ops, dx, dy) {
  for (const op of ops) {
    const it = op?.item;
    if (!it) continue;
    if (typeof it.x === "number") it.x += dx;
    if (typeof it.y === "number") it.y += dy;
    if (Array.isArray(it.points)) for (const p of it.points) { p.x += dx; p.y += dy; }
  }
  return ops;
}

export { getBoundingBox };
