// ---------- What the Room Editor does to a room ----------
// Pure. Every function takes a room document and returns a new one (the old one is left alone, so undo
// can keep it). Positions are meters, angles degrees; a thing on another thing is stored in its parent's
// frame (model.mjs), so moving the parent moves it too.
import { entryFor } from "../catalog.mjs";
import { newId, worldTransform, footprintOf, deg, displayName, CUSTOM_PREFIX } from "../model.mjs";
import { obb, obbOverlap, buildGrid, findPath, standPoint, ROBOT_RADIUS } from "../nav.mjs";
import { WALL_FACING, wallOfPoint } from "./walls.mjs";

const RAD = Math.PI / 180;
const clone = (v) => JSON.parse(JSON.stringify(v));
const round = (v, k = 1000) => Math.round(v * k) / k;

export function defOf(asset, custom = {}) {
  return entryFor(asset.type) || (asset.type?.startsWith(CUSTOM_PREFIX) ? custom[asset.type.slice(CUSTOM_PREFIX.length)] : null);
}

const withAssets = (room, assets) => ({ ...room, assets });
const byIdOf = (room) => new Map(room.assets.map((a) => [a.id, a]));

// All the things on a thing, and on those (its descendants)
export function descendants(room, id) {
  const out = [];
  const stack = [id];
  while (stack.length) {
    const p = stack.pop();
    for (const a of room.assets) if (a.parent === p) (out.push(a.id), stack.push(a.id));
  }
  return out;
}

// ---------- Frames ----------
// A world point → a parent's frame (x/z across its surface, y above it), the inverse of worldTransform
export function toParentFrame(room, parent, world, surfaceId) {
  const byId = byIdOf(room);
  const pt = worldTransform(room, parent, byId);
  const def = defOf(parent);
  const k = parent.scale * (def?.variants?.[parent.variant] ?? 1);
  const surf = def?.surfaces?.find((s) => s.id === surfaceId) || def?.surfaces?.[0];
  const dx = world[0] - pt.x;
  const dz = world[2] - pt.z;
  const c = Math.cos(pt.rot * RAD);
  const s = Math.sin(pt.rot * RAD);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return [round((lx - (surf?.x ?? 0) * k) / k), round(Math.max(0, world[1] - pt.y - (surf?.y ?? def?.height ?? 0) * k)), round((lz - (surf?.z ?? 0) * k) / k)];
}

// ---------- Adding, changing, removing ----------
// type: catalog id; o: { pos (world), rot, slot, parent, surface, colors, name, state, matchColors }
export function addAsset(room, type, o = {}) {
  const def = entryFor(type) || (type.startsWith(CUSTOM_PREFIX) ? o.def : null);
  if (!def) return { room, id: null };
  const taken = new Set(room.assets.map((a) => a.id));
  const id = newId(o.id || type.replace(CUSTOM_PREFIX, ""), taken);
  const slot = o.slot && def.slots.includes(o.slot) ? o.slot : def.slots[0];
  let pos = o.pos ? [...o.pos] : [0, slot === "wall" ? def.mount ?? 1.2 : 0, -room.size.d / 4];
  let parent = null;
  let surface = null;
  if (o.parent && room.assets.some((a) => a.id === o.parent)) {
    parent = o.parent;
    const p = room.assets.find((a) => a.id === parent);
    surface = o.surface || defOf(p)?.surfaces?.[0]?.id || null;
    pos = o.local ? [...o.pos] : toParentFrame(room, p, pos, surface);
  }
  const colors = { ...(o.matchColors ? matchedColors(room, def) : {}), ...(o.colors || {}) };
  const asset = { id, type, name: o.name || "", parent, surface, slot: parent ? "surface" : slot, pos, rot: deg(o.rot ?? (slot === "wall" ? WALL_FACING[wallOfPoint(room, pos[0], pos[2])] : 0)), scale: o.scale ?? 1, variant: o.variant || "M", colors, state: o.state || {}, locked: false, hidden: false, glb: null, drop: 0.4, rules: o.rules || {}, schedule: null };
  return { room: withAssets(room, [...room.assets, asset]), id };
}

// "Match room colors": the room's palette onto a new thing's slots (first slot: detail, second: floor tone)
export function matchedColors(room, def) {
  const pal = room.architecture.palette;
  const order = [pal.detail, pal.glow || pal.detail, pal.wall];
  const out = {};
  def.colors.forEach((c, i) => {
    if (order[i] && /^#[0-9a-f]{6}$/i.test(order[i])) out[c.key] = order[i];
  });
  return out;
}

export function updateAsset(room, id, patch) {
  return withAssets(room, room.assets.map((a) => (a.id === id ? { ...a, ...clone(patch) } : a)));
}

export function updateMany(room, ids, fn) {
  const set = new Set(ids);
  return withAssets(room, room.assets.map((a) => (set.has(a.id) ? { ...a, ...fn(a) } : a)));
}

// Removing a thing removes what stands on it too
export function removeAssets(room, ids) {
  const gone = new Set(ids.flatMap((id) => [id, ...descendants(room, id)]));
  return withAssets(room, room.assets.filter((a) => !gone.has(a.id)));
}

// ---------- Moving ----------
// Move to a world position, as a floor/wall thing (no parent) or onto another thing's surface
export function placeAt(room, id, world, { parent = null, surface = null, slot = null, rot = null } = {}) {
  const a = room.assets.find((x) => x.id === id);
  if (!a) return room;
  const def = defOf(a);
  const nextSlot = parent ? "surface" : slot && def?.slots.includes(slot) ? slot : a.slot === "surface" ? def?.slots.find((s) => s !== "surface") || "floor" : a.slot;
  const p = parent ? room.assets.find((x) => x.id === parent) : null;
  const pos = p ? toParentFrame(room, p, world, surface) : [round(world[0]), round(world[1]), round(world[2])];
  // A thing keeps its world turn when it changes parent
  const worldRot = worldTransform(room, a).rot;
  const rotLocal = rot !== null ? rot : p ? deg(worldRot - worldTransform(room, p).rot) : worldRot;
  return updateAsset(room, id, { parent: p ? p.id : null, surface: p ? surface || defOf(p)?.surfaces?.[0]?.id || null : null, slot: nextSlot, pos, rot: deg(rotLocal) });
}

// Nudge by dx/dz meters in the room (or along its surface); dy lifts
export function nudge(room, ids, dx, dz, dy = 0) {
  return updateMany(room, ids, (a) => {
    if (a.locked) return {};
    if (a.parent) {
      const p = room.assets.find((x) => x.id === a.parent);
      const r = worldTransform(room, p).rot * RAD;
      const k = p.scale * (defOf(p)?.variants?.[p.variant] ?? 1);
      // World offset → the parent's frame
      return { pos: [round(a.pos[0] + (dx * Math.cos(r) - dz * Math.sin(r)) / k), round(Math.max(0, a.pos[1] + dy)), round(a.pos[2] + (dx * Math.sin(r) + dz * Math.cos(r)) / k)] };
    }
    return { pos: [round(a.pos[0] + dx), round(Math.max(0, a.pos[1] + dy)), round(a.pos[2] + dz)] };
  });
}

export const rotateBy = (room, ids, by) => updateMany(room, ids, (a) => (a.locked ? {} : { rot: deg(a.rot + by) }));

export function scaleTo(room, id, scale) {
  const a = room.assets.find((x) => x.id === id);
  const [min, max] = defOf(a)?.scale || [0.5, 2];
  return updateAsset(room, id, { scale: Math.round(Math.min(max, Math.max(min, scale)) * 100) / 100 });
}

// A group moves and turns around its centre
export function rotateGroup(room, ids, by) {
  const byId = byIdOf(room);
  const tops = ids.map((id) => byId.get(id)).filter((a) => a && !a.parent && !a.locked);
  if (!tops.length) return room;
  const cx = tops.reduce((s, a) => s + a.pos[0], 0) / tops.length;
  const cz = tops.reduce((s, a) => s + a.pos[2], 0) / tops.length;
  const c = Math.cos(by * RAD);
  const s = Math.sin(by * RAD);
  const set = new Set(tops.map((a) => a.id));
  return withAssets(room, room.assets.map((a) => {
    if (!set.has(a.id)) return a;
    const dx = a.pos[0] - cx;
    const dz = a.pos[2] - cz;
    return { ...a, pos: [round(cx + dx * c + dz * s), a.pos[1], round(cz - dx * s + dz * c)], rot: deg(a.rot + by) };
  }));
}

// ---------- Checks ----------
// Where a thing may stand and what's wrong with a spot: { level: "ok" | "warn" | "error", reason }
// reasons: outside (beyond the room), wall (inside a wall), overlap (on another thing's footprint),
// blocks_home (it would cut the robot off from somewhere it can reach now)
export function placementCheck(room, id, { checkPath = true } = {}) {
  const a = room.assets.find((x) => x.id === id);
  if (!a) return { level: "error", reason: "missing" };
  const def = defOf(a);
  if (!def || a.parent || a.slot === "wall" || a.slot === "ceiling") return { level: "ok", reason: "" };
  const byId = byIdOf(room);
  const corners = footprintOf(room, a, byId);
  const { w, d } = room.size;
  const t = room.architecture.openAir ? 0 : room.architecture.thickness / 2;
  const walls = room.architecture.walls;
  const margin = 0.02;
  for (const [x, z] of corners) {
    if (Math.abs(x) > w / 2 + 0.6 || Math.abs(z) > d / 2 + 0.6) return { level: "error", reason: "outside" };
    if ((walls.left && x < -w / 2 - margin) || (walls.right && x > w / 2 + margin) || (walls.back && z < -d / 2 - margin) || (walls.front && z > d / 2 + margin)) return { level: "error", reason: "wall" };
  }
  void t;
  if (!def.overlap) {
    const box = obb(room, a, byId);
    for (const o of room.assets) {
      if (o.id === a.id || o.parent || o.hidden || o.slot !== "floor") continue;
      const od = defOf(o);
      if (!od || od.overlap) continue;
      if (obbOverlap(box, obb(room, o, byId), 0.005)) return { level: "error", reason: "overlap", with: o.id };
    }
  }
  const home = [room.robot.home.pos[0], room.robot.home.pos[2]];
  // Standing on the robot's home (cheap, so always checked)
  if (def.blocksPath && corners.length && pointInPoly(home, corners, ROBOT_RADIUS)) return { level: "warn", reason: "blocks_home" };
  if (checkPath && def.blocksPath) {
    // Would it cut the robot off from a thing it can reach without it?
    const without = withAssets(room, room.assets.filter((x) => x.id !== a.id));
    const gWith = buildGrid(room);
    const gWithout = buildGrid(without);
    for (const o of room.assets) {
      if (o.id === a.id || o.hidden) continue;
      const od = defOf(o);
      if (!od || od.actions.every((x) => x === "look")) continue;
      const at = standPoint(room, o, byId);
      if (findPath(gWithout, home, at, { smooth: "direct" }).ok && !findPath(gWith, home, at, { smooth: "direct" }).ok) return { level: "warn", reason: "blocks_home", cuts: o.id };
    }
  }
  return { level: "ok", reason: "" };
}

function pointInPoly([x, z], poly, pad = 0) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  if (inside || !pad) return inside;
  return poly.some(([px, pz]) => Math.hypot(px - x, pz - z) < pad);
}

// The first spot near `near` (world x, z) where a floor thing of this type fits
export function firstFreeSpot(room, type, near = [0, -room.size.d / 4], { rot = 0, scale = 1, exclude = [] } = {}) {
  const def = entryFor(type);
  if (!def) return near;
  const probe = (x, z) => {
    const test = addAsset({ ...room, assets: room.assets.filter((a) => !exclude.includes(a.id)) }, type, { pos: [x, 0, z], rot, scale });
    return placementCheck(test.room, test.id, { checkPath: false }).level === "ok";
  };
  if (probe(near[0], near[1])) return near;
  for (let r = 0.1; r < Math.max(room.size.w, room.size.d); r += 0.1) {
    const steps = Math.max(8, Math.round(r * 24));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = round(near[0] + Math.cos(a) * r, 100);
      const z = round(near[1] + Math.sin(a) * r, 100);
      if (probe(x, z)) return [x, z];
    }
  }
  return near;
}

// ---------- Duplicate, copy and paste ----------
// Copies (with what stands on them), offset to the first free spot
export function duplicate(room, ids) {
  const clip = copy(room, ids);
  if (!clip.assets.length) return { room, ids: [] };
  const top = clip.assets.find((a) => !a.parent);
  let offset = [0.35, 0, 0.35];
  if (top && top.slot === "floor") {
    const spot = firstFreeSpot(room, top.type, [top.pos[0] + 0.4, top.pos[2] + 0.4], { rot: top.rot, scale: top.scale });
    offset = [spot[0] - top.pos[0], 0, spot[1] - top.pos[2]];
  }
  return paste(room, clip, offset);
}

export function copy(room, ids) {
  const keep = new Set(ids.flatMap((id) => [id, ...descendants(room, id)]));
  const assets = room.assets.filter((a) => keep.has(a.id)).map((a) => {
    const out = clone(a);
    // A thing copied without its parent keeps its place in the room
    if (out.parent && !keep.has(out.parent)) {
      const t = worldTransform(room, a);
      out.parent = null;
      out.surface = null;
      out.slot = defOf(a)?.slots.find((s) => s !== "surface") || "floor";
      out.pos = [round(t.x), round(t.y), round(t.z)];
      out.rot = t.rot;
    }
    return out;
  });
  return { app: "friends-room-clip", assets };
}

// offset: added to the copied top-level things' positions (the same room, or another room)
export function paste(room, clip, offset = [0, 0, 0]) {
  if (!clip || clip.app !== "friends-room-clip" || !Array.isArray(clip.assets)) return { room, ids: [] };
  const taken = new Set(room.assets.map((a) => a.id));
  const rename = {};
  for (const a of clip.assets) {
    const id = newId(a.id, taken);
    taken.add(id);
    rename[a.id] = id;
  }
  const added = clip.assets.filter((a) => entryFor(a.type) || a.type?.startsWith(CUSTOM_PREFIX)).map((a) => ({
    ...clone(a),
    id: rename[a.id],
    parent: a.parent ? rename[a.parent] || null : null,
    pos: a.parent ? a.pos : [round(a.pos[0] + offset[0]), round(a.pos[1] + offset[1]), round(a.pos[2] + offset[2])],
    locked: false,
  }));
  return { room: withAssets(room, [...room.assets, ...added]), ids: added.filter((a) => !a.parent || !rename[clip.assets.find((c) => rename[c.id] === a.id)?.parent]).map((a) => a.id) };
}

// ---------- Align, distribute, replace, copy look ----------
export function align(room, ids, mode) {
  const tops = ids.map((id) => room.assets.find((a) => a.id === id)).filter((a) => a && !a.parent && !a.locked);
  if (tops.length < 2) return room;
  const boxes = tops.map((a) => ({ a, b: footprintOf(room, a) }));
  const minX = (b) => Math.min(...b.map((p) => p[0]));
  const maxX = (b) => Math.max(...b.map((p) => p[0]));
  const target = mode === "left" ? Math.min(...boxes.map((x) => minX(x.b))) : mode === "right" ? Math.max(...boxes.map((x) => maxX(x.b))) : boxes.reduce((s, x) => s + (minX(x.b) + maxX(x.b)) / 2, 0) / boxes.length;
  return updateMany(room, tops.map((a) => a.id), (a) => {
    const b = boxes.find((x) => x.a.id === a.id).b;
    const shift = mode === "left" ? target - minX(b) : mode === "right" ? target - maxX(b) : target - (minX(b) + maxX(b)) / 2;
    return { pos: [round(a.pos[0] + shift), a.pos[1], a.pos[2]] };
  });
}

// Even gaps along x between the first and the last
export function distribute(room, ids) {
  const tops = ids.map((id) => room.assets.find((a) => a.id === id)).filter((a) => a && !a.parent && !a.locked).sort((p, q) => p.pos[0] - q.pos[0]);
  if (tops.length < 3) return room;
  const x0 = tops[0].pos[0];
  const x1 = tops[tops.length - 1].pos[0];
  return updateMany(room, tops.map((a) => a.id), (a) => ({ pos: [round(x0 + ((x1 - x0) * tops.indexOf(a)) / (tops.length - 1)), a.pos[1], a.pos[2]] }));
}

// Another thing in the same place (its things on top stay when the new one has a surface)
export function replaceWith(room, id, type) {
  const a = room.assets.find((x) => x.id === id);
  const def = entryFor(type);
  if (!a || !def) return room;
  const slot = def.slots.includes(a.slot) ? a.slot : def.slots[0];
  let next = updateAsset(room, id, { type, slot, colors: {}, state: {}, variant: "M", scale: Math.min(def.scale[1], Math.max(def.scale[0], a.scale)) });
  if (!def.surfaces.length) {
    for (const cid of descendants(next, id)) next = placeAt(next, cid, (() => {
      const t = worldTransform(next, next.assets.find((x) => x.id === cid));
      return [t.x, 0, t.z];
    })(), { slot: "floor" });
  }
  return next;
}

// Paint one thing's colors onto others (slot by slot, where they have that slot)
export function copyLook(room, fromId, toIds) {
  const from = room.assets.find((a) => a.id === fromId);
  if (!from) return room;
  const fromDef = defOf(from);
  const cols = fromDef.colors.map((c) => from.colors?.[c.key] || c.def);
  return updateMany(room, toIds, (a) => {
    const d = defOf(a);
    return { colors: Object.fromEntries((d?.colors || []).map((c, i) => [c.key, cols[i] ?? cols[0]])) };
  });
}

// ---------- Groups ----------
export function group(room, ids) {
  const taken = new Set(room.assets.map((a) => a.group).filter(Boolean));
  const gid = newId("group", taken);
  return { room: updateMany(room, ids, () => ({ group: gid })), group: gid };
}
export const ungroup = (room, ids) => updateMany(room, ids, () => ({ group: null }));
export const groupMembers = (room, id) => {
  const g = room.assets.find((a) => a.id === id)?.group;
  return g ? room.assets.filter((a) => a.group === g).map((a) => a.id) : [id];
};

// ---------- Snapping ----------
export const snap = (v, step) => (step > 0 ? Math.round(Math.round(v / step) * step * 1e6) / 1e6 : v);
export const snapAngle = (d, step) => deg(step > 0 ? Math.round(d / step) * step : d);

// Against the walls: a floor thing within `reach` of a wall slides back against it
export function snapToWalls(room, asset, world, reach = 0.12) {
  const def = defOf(asset);
  if (!def || asset.parent) return world;
  const { w, d } = room.size;
  const k = asset.scale * (def.variants?.[asset.variant] ?? 1);
  const turned = Math.abs(Math.sin(asset.rot * RAD)) > 0.7;
  const hw = ((turned ? def.footprint.d : def.footprint.w) * k) / 2;
  const hd = ((turned ? def.footprint.w : def.footprint.d) * k) / 2;
  const out = [...world];
  const walls = room.architecture.walls;
  if (walls.back && Math.abs(out[2] - hd - -d / 2) < reach) out[2] = -d / 2 + hd + 0.005;
  if (walls.front && Math.abs(out[2] + hd - d / 2) < reach) out[2] = d / 2 - hd - 0.005;
  if (walls.left && Math.abs(out[0] - hw - -w / 2) < reach) out[0] = -w / 2 + hw + 0.005;
  if (walls.right && Math.abs(out[0] + hw - w / 2) < reach) out[0] = w / 2 - hw - 0.005;
  return out;
}

// Smart guides: snap to other things' edges and centres (x and z separately), within `reach`
export function guides(room, asset, world, reach = 0.04) {
  const lines = { x: [], z: [] };
  for (const o of room.assets) {
    if (o.id === asset.id || o.parent || o.hidden || o.slot !== "floor") continue;
    const b = footprintOf(room, o);
    const xs = b.map((p) => p[0]);
    const zs = b.map((p) => p[1]);
    lines.x.push(Math.min(...xs), Math.max(...xs), (Math.min(...xs) + Math.max(...xs)) / 2);
    lines.z.push(Math.min(...zs), Math.max(...zs), (Math.min(...zs) + Math.max(...zs)) / 2);
  }
  const out = [...world];
  const hits = [];
  for (const [axis, i] of [["x", 0], ["z", 2]]) {
    let best = null;
    for (const v of lines[axis]) if (Math.abs(v - world[i]) < reach && (best === null || Math.abs(v - world[i]) < Math.abs(best - world[i]))) best = v;
    if (best !== null) {
      out[i] = best;
      hits.push({ axis, at: best });
    }
  }
  return { pos: out, hits };
}

// Distances from a floor thing to the walls (for the labels while dragging), in meters
export function wallDistances(room, asset) {
  const b = footprintOf(room, asset);
  const xs = b.map((p) => p[0]);
  const zs = b.map((p) => p[1]);
  const { w, d } = room.size;
  return { left: round(Math.min(...xs) + w / 2, 100), right: round(w / 2 - Math.max(...xs), 100), back: round(Math.min(...zs) + d / 2, 100), front: round(d / 2 - Math.max(...zs), 100) };
}

// ---------- Words ----------
// "Desk moved 10 cm left, on the floor": what a keyboard move says to a screen reader
export function moveWords(room, id, dx, dz, say = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? ""), units = "cm") {
  const a = room.assets.find((x) => x.id === id);
  if (!a) return "";
  const parts = [];
  const inch = units === "in";
  const n = (m) => (inch ? Math.round((Math.abs(m) / 0.0254) * 2) / 2 : Math.round(Math.abs(m) * 100));
  if (dx) parts.push(inch ? say(dx < 0 ? "{n} in left" : "{n} in right", { n: n(dx) }) : say(dx < 0 ? "{cm} cm left" : "{cm} cm right", { cm: n(dx) }));
  if (dz) parts.push(inch ? say(dz < 0 ? "{n} in back" : "{n} in forward", { n: n(dz) }) : say(dz < 0 ? "{cm} cm back" : "{cm} cm forward", { cm: n(dz) }));
  const p = a.parent ? room.assets.find((x) => x.id === a.parent) : null;
  const where = p ? say("on the {name}", { name: displayName(p) }) : a.slot === "wall" ? say("on the wall") : a.slot === "ceiling" ? say("on the ceiling") : say("on the floor");
  return say("{name} moved {how}, {where}", { name: displayName(a), how: parts.join(" ") || say("nowhere"), where });
}

// The words spoken here and by the viewport (viewport.js says them through ctx.say, which the scanner can't follow)
export function labels() {
  return [
    "{cm} cm left", "{cm} cm right", "{cm} cm back", "{cm} cm forward", "{n} in left", "{n} in right", "{n} in back", "{n} in forward", "on the {name}", "on the wall", "on the ceiling", "on the floor", "{name} moved {how}, {where}", "nowhere",
    "Outside the room", "Inside a wall", "On top of the {name}", "Blocks the robot's way to the {name}", "Stands where the robot lives",
    "Move {name}", "{name} placed", "Placing {name}. Move the pointer to where it goes; Escape cancels.", "{left} cm from the left wall, {back} cm from the back", "{left} in from the left wall, {back} in from the back",
    "Measuring: click where it starts, then where it ends. Escape stops.", "{n} cm between the two points", "{n} in between the two points", "{n} cm", "{n} in",
  ];
}
