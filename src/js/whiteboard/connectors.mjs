// Arrows that stay glued to the things they join: where they leave a box, and the path between two points.
// Pure geometry (no page, no canvas), shared by the board, the AI's tools and the tests.
import { getBoundingBox } from "./model.mjs";

const r1 = (n) => Math.round(n * 10) / 10;
const STUB = 24; // how far a path leaves a box before it turns

// The point on `item`'s edge where a connector attaches. port "auto" faces `toward`.
export function anchorPoint(item, port = "auto", toward = null) {
  const b = getBoundingBox(item);
  let side = port;
  if (!["top", "right", "bottom", "left"].includes(side)) {
    const dx = toward ? toward.x - b.cx : 1;
    const dy = toward ? toward.y - b.cy : 0;
    side = Math.abs(dx) * b.height > Math.abs(dy) * b.width ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "bottom" : "top";
  }
  const at = { top: { x: b.cx, y: b.minY }, right: { x: b.maxX, y: b.cy }, bottom: { x: b.cx, y: b.maxY }, left: { x: b.minX, y: b.cy } }[side];
  return { x: r1(at.x), y: r1(at.y), side };
}

const horizontal = (side) => side === "left" || side === "right";
const away = (side) => ({ top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } })[side] || { x: 0, y: 0 };

// The corners of a path from a to b ({x, y, side}); `route` is straight, elbow (right angles) or curve
export function routePoints(a, b, route = "straight") {
  const A = { x: a.x, y: a.y };
  const B = { x: b.x, y: b.y };
  if (route !== "elbow" || !a.side || !b.side) return [A, B];
  const da = away(a.side);
  const db = away(b.side);
  const a1 = { x: r1(a.x + da.x * STUB), y: r1(a.y + da.y * STUB) };
  const b1 = { x: r1(b.x + db.x * STUB), y: r1(b.y + db.y * STUB) };
  let mid;
  if (horizontal(a.side) && horizontal(b.side)) {
    const mx = r1((a1.x + b1.x) / 2);
    mid = [{ x: mx, y: a1.y }, { x: mx, y: b1.y }];
  } else if (!horizontal(a.side) && !horizontal(b.side)) {
    const my = r1((a1.y + b1.y) / 2);
    mid = [{ x: a1.x, y: my }, { x: b1.x, y: my }];
  } else if (horizontal(a.side)) {
    mid = [{ x: b1.x, y: a1.y }];
  } else {
    mid = [{ x: a1.x, y: b1.y }];
  }
  return dedupe([A, a1, ...mid, b1, B]);
}

function dedupe(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.05 || Math.abs(last.y - p.y) > 0.05) out.push(p);
  }
  return out.length > 1 ? out : [points[0], points[points.length - 1]];
}

// Control points for a curve between a and b leaving by their sides
export function curveControls(a, b, sides = []) {
  const dist = Math.max(40, Math.hypot(b.x - a.x, b.y - a.y) * 0.4);
  const da = away(sides[0] || (Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? (b.x > a.x ? "right" : "left") : b.y > a.y ? "bottom" : "top"));
  const db = away(sides[1] || (Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? (b.x > a.x ? "left" : "right") : b.y > a.y ? "top" : "bottom"));
  return [{ x: a.x + da.x * dist, y: a.y + da.y * dist }, { x: b.x + db.x * dist, y: b.y + db.y * dist }];
}

// Where a path's middle is (for its label)
export function pathMiddle(points) {
  if (!points?.length) return { x: 0, y: 0 };
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  let left = total / 2;
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (left <= seg && seg > 0) {
      const t = left / seg;
      return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * t, y: points[i - 1].y + (points[i].y - points[i - 1].y) * t };
    }
    left -= seg;
  }
  return { ...points[points.length - 1] };
}

// Recomputes every connector of a page from the items it is glued to. A glue to something that is gone is let go
// (the arrow stays where it was). Returns the ids of the connectors that moved.
export function refreshConnectors(page) {
  const changed = [];
  const byId = new Map(page.items.map((it) => [it.id, it]));
  for (const c of page.items) {
    if (c.type !== "shape" || c.shapeType !== "connector") continue;
    const pts = Array.isArray(c.points) && c.points.length >= 2 ? c.points : [{ x: c.x, y: c.y }, { x: c.x + c.width, y: c.y + c.height }];
    const from = c.from && byId.get(c.from.id);
    const to = c.to && byId.get(c.to.id);
    if (c.from && !from) delete c.from;
    if (c.to && !to) delete c.to;
    if (!from && !to) continue;
    const startFree = pts[0];
    const endFree = pts[pts.length - 1];
    const fromBox = from ? getBoundingBox(from) : null;
    const toBox = to ? getBoundingBox(to) : null;
    const a = from ? anchorPoint(from, c.from.port, toBox ? { x: toBox.cx, y: toBox.cy } : endFree) : { ...startFree, side: undefined };
    const b = to ? anchorPoint(to, c.to.port, fromBox ? { x: fromBox.cx, y: fromBox.cy } : startFree) : { ...endFree, side: undefined };
    const next = routePoints(a, b, c.route);
    const same = next.length === pts.length && next.every((p, i) => Math.abs(p.x - pts[i].x) < 0.05 && Math.abs(p.y - pts[i].y) < 0.05);
    c.sides = [a.side, b.side].filter(Boolean).length === 2 ? [a.side, b.side] : undefined;
    if (!c.sides) delete c.sides;
    if (same) continue;
    c.points = next;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of next) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    c.x = r1(minX);
    c.y = r1(minY);
    c.width = Math.max(1, r1(maxX - minX));
    c.height = Math.max(1, r1(maxY - minY));
    changed.push(c.id);
  }
  return changed;
}
