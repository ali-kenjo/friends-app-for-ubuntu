// ---------- Where the robot can go: a navigation grid, paths and reachability ----------
// Pure. The floor plan becomes a grid of cells. A cell is blocked by walls, by the oriented footprints of
// things that block the way (grown by the robot's radius plus the clearance you set), by no-go zones,
// and, when any "allowed area" exists, by everything outside those areas. Slow zones cost more.
// The grid is rebuilt incrementally: each thing remembers the cells it covers, so moving one thing
// updates only its cells.
import { CATALOG_BY_ID } from "./catalog.mjs";
import { worldTransform } from "./model.mjs";

export const ROBOT_RADIUS = 0.3;
const SLOW_COST = 3;

// ---------- Zones ----------
export function pointInZone(zone, x, z) {
  const p = zone.points;
  if (zone.shape === "rect") return x >= p[0][0] && x <= p[1][0] && z >= p[0][1] && z <= p[1][1];
  if (zone.shape === "circle") return Math.hypot(x - p[0][0], z - p[0][1]) <= zone.radius;
  // Polygon: even-odd ray casting
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i];
    const [xj, zj] = p[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

export const zonesAt = (room, x, z) => (room.robot?.zones || []).filter((zone) => pointInZone(zone, x, z));

// ---------- Footprints ----------
const rad = (d) => (d * Math.PI) / 180;

// The oriented rectangle of a floor thing: centre, half sizes, angle (for the grid and for overlap tests)
export function obb(room, asset, byId) {
  const def = CATALOG_BY_ID[asset.type];
  const t = worldTransform(room, asset, byId);
  const k = (asset.scale || 1) * (def?.variants?.[asset.variant] ?? 1);
  return { x: t.x, z: t.z, hw: ((def?.footprint?.w ?? 0.5) * k) / 2, hd: ((def?.footprint?.d ?? 0.5) * k) / 2, rot: t.rot };
}

// Is the point inside the rectangle grown by `pad` (rounded corners)?
export function inObb(b, x, z, pad = 0) {
  const c = Math.cos(rad(b.rot));
  const s = Math.sin(rad(b.rot));
  const dx = x - b.x;
  const dz = z - b.z;
  // World → local: the inverse of the asset's turn
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const ox = Math.max(0, Math.abs(lx) - b.hw);
  const oz = Math.max(0, Math.abs(lz) - b.hd);
  return ox * ox + oz * oz <= pad * pad;
}

// Do two oriented rectangles overlap (separating axis test)?
export function obbOverlap(a, b, gap = 0) {
  const axes = [a.rot, a.rot + 90, b.rot, b.rot + 90].map((d) => [Math.cos(rad(d)), -Math.sin(rad(d))]);
  const corners = (o) => {
    const c = Math.cos(rad(o.rot));
    const s = Math.sin(rad(o.rot));
    return [[-o.hw, -o.hd], [o.hw, -o.hd], [o.hw, o.hd], [-o.hw, o.hd]].map(([px, pz]) => [o.x + px * c + pz * s, o.z - px * s + pz * c]);
  };
  const ca = corners(a);
  const cb = corners(b);
  for (const [ax, az] of axes) {
    const pa = ca.map(([x, z]) => x * ax + z * az);
    const pb = cb.map(([x, z]) => x * ax + z * az);
    if (Math.max(...pa) + gap <= Math.min(...pb) || Math.max(...pb) + gap <= Math.min(...pa)) return false;
  }
  return true;
}

// Things that stand in the way on the floor (rugs and charging pads don't; things on furniture don't)
export function blockers(room, hidden = new Set()) {
  return room.assets.filter((a) => {
    if (a.hidden || hidden.has(a.id) || a.parent) return false;
    const def = CATALOG_BY_ID[a.type];
    if (!def || !def.blocksPath) return false;
    return a.slot === "floor";
  });
}

// Where the robot stands to use a thing (world [x, z]): its stand anchor, its parent's, or in front of it
export function standPoint(room, asset, byId = new Map(room.assets.map((a) => [a.id, a]))) {
  let a = asset;
  let guard = 0;
  while (a && guard++ < 16) {
    const def = CATALOG_BY_ID[a.type];
    const anchor = def?.anchors?.stand;
    if (anchor) {
      const t = worldTransform(room, a, byId);
      const k = (a.scale || 1) * (def.variants?.[a.variant] ?? 1);
      const c = Math.cos(rad(t.rot));
      const s = Math.sin(rad(t.rot));
      const lx = anchor[0] * k;
      const lz = anchor[2] * k;
      return [t.x + lx * c + lz * s, t.z - lx * s + lz * c];
    }
    if (!a.parent) break;
    a = byId.get(a.parent);
  }
  // A wall or ceiling thing (or one with no anchor): half a meter in front of it, on the floor
  const t = worldTransform(room, asset, byId);
  const c = Math.cos(rad(t.rot));
  const s = Math.sin(rad(t.rot));
  const front = asset.slot === "wall" ? 0.65 : 0.55;
  return [t.x + front * s, t.z + front * c];
}

// ---------- The grid ----------
export function buildGrid(room, { cell = 0.1, clearance = (room.robot?.movement?.clearance ?? 15) / 100, radius = ROBOT_RADIUS, hidden = new Set() } = {}) {
  const { w, d } = room.size;
  const cols = Math.max(4, Math.ceil(w / cell));
  const rows = Math.max(4, Math.ceil(d / cell));
  const grid = {
    cell,
    cols,
    rows,
    x0: -w / 2,
    z0: -d / 2,
    pad: radius + clearance,
    occ: new Uint16Array(cols * rows), // how many things cover the cell
    base: new Uint8Array(cols * rows), // walls, no-go zones, outside allowed areas
    cost: new Float32Array(cols * rows).fill(1),
    owners: new Map(), // asset id → { key, cells }
  };
  rasterBase(grid, room);
  for (const a of blockers(room, hidden)) addAsset(grid, room, a);
  return grid;
}

export const cellOf = (g, x, z) => [Math.floor((x - g.x0) / g.cell), Math.floor((z - g.z0) / g.cell)];
export const centreOf = (g, i, j) => [g.x0 + (i + 0.5) * g.cell, g.z0 + (j + 0.5) * g.cell];
const inside = (g, i, j) => i >= 0 && j >= 0 && i < g.cols && j < g.rows;
export const isFree = (g, i, j) => inside(g, i, j) && !g.base[j * g.cols + i] && !g.occ[j * g.cols + i];

function rasterBase(g, room) {
  const walls = room.architecture?.walls || {};
  const t = room.architecture?.openAir ? 0 : (room.architecture?.thickness ?? 0.12) / 2;
  const zones = room.robot?.zones || [];
  const allowed = zones.filter((z) => z.kind === "allowed");
  g.base.fill(0);
  g.cost.fill(1);
  for (let j = 0; j < g.rows; j++) {
    for (let i = 0; i < g.cols; i++) {
      const [x, z] = centreOf(g, i, j);
      const k = j * g.cols + i;
      const m = g.pad + t;
      // The room's edges always bound the robot; walls add their thickness
      if (x < g.x0 + (walls.left ? m : g.pad * 0.5) || x > -g.x0 - (walls.right ? m : g.pad * 0.5) || z < g.z0 + (walls.back ? m : g.pad * 0.5) || z > -g.z0 - (walls.front ? m : g.pad * 0.5)) g.base[k] = 1;
      for (const zone of zones) {
        if (!pointInZone(zone, x, z)) continue;
        if (zone.kind === "nogo") g.base[k] = 1;
        else if (zone.kind === "slow") g.cost[k] = SLOW_COST;
      }
      // No-go zones also keep the robot's body out, not just its centre
      if (!g.base[k]) for (const zone of zones) if (zone.kind === "nogo" && nearZone(zone, x, z, g.pad * 0.6)) g.base[k] = 1;
      if (allowed.length && !allowed.some((zone) => pointInZone(zone, x, z))) g.base[k] = 1;
    }
  }
}

function nearZone(zone, x, z, r) {
  for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (pointInZone(zone, x + dx, z + dz)) return true;
  return false;
}

const keyOf = (b) => `${b.x.toFixed(3)},${b.z.toFixed(3)},${b.hw.toFixed(3)},${b.hd.toFixed(3)},${b.rot}`;

function addAsset(g, room, asset, byId) {
  const b = obb(room, asset, byId);
  const cells = [];
  const reach = Math.hypot(b.hw, b.hd) + g.pad;
  const [i0, j0] = cellOf(g, b.x - reach, b.z - reach);
  const [i1, j1] = cellOf(g, b.x + reach, b.z + reach);
  for (let j = Math.max(0, j0); j <= Math.min(g.rows - 1, j1); j++) {
    for (let i = Math.max(0, i0); i <= Math.min(g.cols - 1, i1); i++) {
      const [x, z] = centreOf(g, i, j);
      if (inObb(b, x, z, g.pad)) {
        const k = j * g.cols + i;
        g.occ[k]++;
        cells.push(k);
      }
    }
  }
  g.owners.set(asset.id, { key: keyOf(b), cells });
}

function removeAsset(g, id) {
  const o = g.owners.get(id);
  if (!o) return;
  for (const k of o.cells) g.occ[k]--;
  g.owners.delete(id);
}

// After an edit: only things that moved, appeared or went away are redrawn; zones/walls/size → full rebuild
export function updateGrid(g, room, { hidden = new Set(), zonesChanged = false } = {}) {
  const { w, d } = room.size;
  if (Math.ceil(w / g.cell) !== g.cols || Math.ceil(d / g.cell) !== g.rows) return buildGrid(room, { cell: g.cell, hidden });
  if (zonesChanged) rasterBase(g, room);
  const byId = new Map(room.assets.map((a) => [a.id, a]));
  const wanted = new Map(blockers(room, hidden).map((a) => [a.id, a]));
  for (const id of [...g.owners.keys()]) if (!wanted.has(id)) removeAsset(g, id);
  for (const [id, a] of wanted) {
    const key = keyOf(obb(room, a, byId));
    if (g.owners.get(id)?.key === key) continue;
    removeAsset(g, id);
    addAsset(g, room, a, byId);
  }
  return g;
}

// The nearest free cell to a point (a goal inside a desk becomes the free spot beside it)
export function nearestFree(g, x, z, maxRadius = 12) {
  const [ci, cj] = cellOf(g, x, z);
  if (isFree(g, ci, cj)) return [ci, cj];
  for (let r = 1; r <= maxRadius; r++) {
    let best = null;
    let bestD = Infinity;
    for (let j = cj - r; j <= cj + r; j++) {
      for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || !isFree(g, i, j)) continue;
        const [px, pz] = centreOf(g, i, j);
        const dd = (px - x) ** 2 + (pz - z) ** 2;
        if (dd < bestD) {
          bestD = dd;
          best = [i, j];
        }
      }
    }
    if (best) return best;
  }
  return null;
}

// ---------- A* ----------
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

class Heap {
  constructor() {
    this.items = [];
  }
  push(k, f) {
    const a = this.items;
    a.push([k, f]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][1] <= a[i][1]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][1] < a[m][1]) m = l;
        if (r < a.length && a[r][1] < a[m][1]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
}

// A path from one floor point to another: { ok, points [[x, z]…], reason, cost }
// reason: "start_blocked" | "goal_blocked" | "no_path"
export function findPath(g, from, to, { smooth = "smooth" } = {}) {
  const s = nearestFree(g, from[0], from[1], 6);
  if (!s) return { ok: false, points: [], reason: "start_blocked" };
  const e = nearestFree(g, to[0], to[1], 8);
  if (!e) return { ok: false, points: [], reason: "goal_blocked" };
  const start = s[1] * g.cols + s[0];
  const goal = e[1] * g.cols + e[0];
  const n = g.cols * g.rows;
  const gScore = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const h = (k) => Math.hypot((k % g.cols) - e[0], Math.floor(k / g.cols) - e[1]);
  const open = new Heap();
  gScore[start] = 0;
  open.push(start, h(start));
  while (open.size) {
    const [k] = open.pop();
    if (closed[k]) continue;
    if (k === goal) break;
    closed[k] = 1;
    const i = k % g.cols;
    const j = Math.floor(k / g.cols);
    for (const [di, dj, step] of DIRS) {
      const ni = i + di;
      const nj = j + dj;
      if (!isFree(g, ni, nj)) continue;
      // No cutting corners past a blocked cell
      if (di && dj && (!isFree(g, i + di, j) || !isFree(g, i, j + dj))) continue;
      const nk = nj * g.cols + ni;
      const t = gScore[k] + step * g.cost[nk];
      if (t < gScore[nk]) {
        gScore[nk] = t;
        came[nk] = k;
        open.push(nk, t + h(nk));
      }
    }
  }
  if (start !== goal && came[goal] < 0) return { ok: false, points: [], reason: "no_path" };
  const cells = [];
  for (let k = goal; k >= 0; k = k === start ? -1 : came[k]) cells.push(k);
  cells.reverse();
  let points = cells.map((k) => centreOf(g, k % g.cols, Math.floor(k / g.cols)));
  points[0] = [from[0], from[1]];
  if (isFree(g, ...cellOf(g, to[0], to[1]))) points[points.length - 1] = [to[0], to[1]];
  points = pull(g, points);
  if (smooth !== "direct") points = catmull(points, smooth === "meander" ? 0.2 : 0);
  return { ok: true, points, reason: "", cost: gScore[goal] * g.cell };
}

// Is the straight line between two points free (sampled at quarter cells, including the cost of slow zones)?
export function lineFree(g, a, b) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(len / (g.cell * 0.25)));
  let cost = null;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const [i, j] = cellOf(g, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
    if (!isFree(g, i, j)) return false;
    const c = g.cost[j * g.cols + i];
    if (cost === null) cost = c;
    else if (c !== cost) return false; // keep slow-zone borders as corners
  }
  return true;
}

// String pulling: drop every point the robot can skip by going straight
export function pull(g, points) {
  if (points.length <= 2) return points;
  const out = [points[0]];
  let anchor = 0;
  for (let i = 2; i < points.length; i++) {
    if (!lineFree(g, points[anchor], points[i])) {
      out.push(points[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// Smooth corners (centripetal-ish Catmull-Rom through the corners, a few samples per segment)
export function catmull(points, wobble = 0) {
  if (points.length < 3) return points;
  const p = [points[0], ...points, points[points.length - 1]];
  const out = [];
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const samples = Math.max(2, Math.min(10, Math.ceil(len / 0.15)));
    for (let s = 0; s < samples; s++) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      let x = f(p0[0], p1[0], p2[0], p3[0]);
      let z = f(p0[1], p1[1], p2[1], p3[1]);
      if (wobble && s && i < p.length - 3) {
        const nx = -(p2[1] - p1[1]) / (len || 1);
        const nz = (p2[0] - p1[0]) / (len || 1);
        const k = Math.sin(t * Math.PI) * wobble * Math.min(1, len);
        x += nx * k * Math.sin(i * 1.7);
        z += nz * k * Math.sin(i * 1.7);
      }
      out.push([x, z]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

export function reachable(g, from, to) {
  return findPath(g, from, to, { smooth: "direct" }).ok;
}

// Every thing's stand point and every spot: which ones the robot can't reach from home
export function unreachable(room, g = buildGrid(room)) {
  const home = [room.robot.home.pos[0], room.robot.home.pos[2]];
  const out = [];
  const byId = new Map(room.assets.map((a) => [a.id, a]));
  for (const a of room.assets) {
    if (a.hidden) continue;
    const def = CATALOG_BY_ID[a.type];
    if (!def || def.actions.every((x) => x === "look")) continue;
    const at = standPoint(room, a, byId);
    if (!reachable(g, home, at)) out.push({ kind: "asset", id: a.id });
  }
  for (const s of room.robot.spots) if (!reachable(g, home, [s.pos[0], s.pos[2]])) out.push({ kind: "spot", id: s.id });
  return out;
}

// What stands in the way between two points (for "no path to the bookcase: blocked by the sofa")
export function whatBlocks(room, from, to, { hidden = new Set(), pad = ROBOT_RADIUS } = {}) {
  const byId = new Map(room.assets.map((a) => [a.id, a]));
  const hits = [];
  for (const a of blockers(room, hidden)) {
    const b = obb(room, a, byId);
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const steps = Math.max(2, Math.ceil(len / 0.05));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      if (inObb(b, from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, pad)) {
        hits.push({ id: a.id, at: t });
        break;
      }
    }
  }
  return hits.sort((p, q) => p.at - q.at).map((h) => h.id);
}

// The length of a path in meters
export const pathLength = (points) => points.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) : 0), 0);
