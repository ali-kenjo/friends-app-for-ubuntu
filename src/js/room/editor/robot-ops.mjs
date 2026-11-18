// ---------- Directing the robot in the Room Editor: home, spots, zones, routes ----------
// Pure. Every function takes a room and returns a new one (or a check), like ops.mjs; positions are meters
// on the floor ([x, z]), facings degrees (0 faces the front of the room, where you are).
import { newId } from "../model.mjs";
import { buildGrid, cellOf, isFree, pointInZone, ROBOT_RADIUS, obb, inObb, blockers } from "../nav.mjs";
import { effectiveRoom } from "../schedule.mjs";

const r3 = (v) => Math.round(v * 1000) / 1000;
const withRobot = (room, patch) => ({ ...room, robot: { ...room.robot, ...patch } });
const taken = (list) => new Set(list.map((x) => x.id));

// Can the robot stand here? { ok, reason: "" | "outside" | "furniture" | "nogo", with }
export function standCheck(room, x, z) {
  const { w, d } = room.size;
  if (Math.abs(x) > w / 2 - ROBOT_RADIUS * 0.5 || Math.abs(z) > d / 2 - ROBOT_RADIUS * 0.5) return { ok: false, reason: "outside" };
  if (room.robot.zones.some((zone) => zone.kind === "nogo" && pointInZone(zone, x, z))) return { ok: false, reason: "nogo" };
  const eff = effectiveRoom(room);
  const byId = new Map(eff.room.assets.map((a) => [a.id, a]));
  for (const a of blockers(eff.room, eff.hidden)) {
    if (inObb(obb(eff.room, a, byId), x, z, ROBOT_RADIUS * 0.6)) return { ok: false, reason: "furniture", with: a.id };
  }
  return { ok: true, reason: "" };
}

// ---------- Home ----------
export function setHome(room, x, z, facing = room.robot.home.facing) {
  return withRobot(room, { home: { pos: [r3(x), 0, r3(z)], facing: Math.round(facing) } });
}

// ---------- Spots ----------
export function addSpot(room, name, x, z, facing = 0) {
  const id = newId("spot", taken(room.robot.spots));
  return { room: withRobot(room, { spots: [...room.robot.spots, { id, name, pos: [r3(x), 0, r3(z)], facing: Math.round(facing) }] }), id };
}
export const updateSpot = (room, id, patch) => withRobot(room, { spots: room.robot.spots.map((s) => (s.id === id ? { ...s, ...patch, pos: patch.pos ? [r3(patch.pos[0]), 0, r3(patch.pos[2])] : s.pos } : s)) });
export const removeSpot = (room, id) => withRobot(room, { spots: room.robot.spots.filter((s) => s.id !== id) });

// ---------- Zones ----------
// shape "rect": points [[x0, z0], [x1, z1]]; "circle": [[cx, cz]] and radius; "poly": three points or more
export function addZone(room, { name = "", kind = "nogo", shape = "rect", points, radius = 0.6 }) {
  const id = newId("zone", taken(room.robot.zones));
  const pts = points.map(([x, z]) => [r3(x), r3(z)]);
  return { room: withRobot(room, { zones: [...room.robot.zones, { id, name, kind, shape, points: pts, radius: shape === "circle" ? r3(radius) : 0 }] }), id };
}
export const updateZone = (room, id, patch) => withRobot(room, { zones: room.robot.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) });
export const removeZone = (room, id) => withRobot(room, { zones: room.robot.zones.filter((z) => z.id !== id) });

// Moves one corner (a rectangle keeps its other corner; a circle's handle is its radius)
export function moveVertex(room, id, index, x, z) {
  return withRobot(room, {
    zones: room.robot.zones.map((zone) => {
      if (zone.id !== id) return zone;
      if (zone.shape === "circle") {
        const [cx, cz] = zone.points[0];
        if (index === 0) return { ...zone, points: [[r3(x), r3(z)]] };
        return { ...zone, radius: r3(Math.max(0.1, Math.hypot(x - cx, z - cz))) };
      }
      const points = zone.points.map((p, i) => (i === index ? [r3(x), r3(z)] : p));
      return { ...zone, points };
    }),
  });
}

// Moves a whole zone by dx, dz
export function moveZone(room, id, dx, dz) {
  return withRobot(room, { zones: room.robot.zones.map((z) => (z.id === id ? { ...z, points: z.points.map(([x, y]) => [r3(x + dx), r3(y + dz)]) } : z)) });
}

// The handles a zone shows: its corners (a rectangle's four, a circle's centre and rim)
export function zoneHandles(zone) {
  if (zone.shape === "circle") return [zone.points[0], [zone.points[0][0] + zone.radius, zone.points[0][1]]];
  if (zone.shape === "rect") {
    const [[x0, z0], [x1, z1]] = zone.points;
    return [[x0, z0], [x1, z1]];
  }
  return zone.points;
}

// ---------- Routes ----------
export function addRoute(room, name) {
  const id = newId("route", taken(room.robot.routes));
  return { room: withRobot(room, { routes: [...room.robot.routes, { id, name, mode: "loop", when: { kind: "manual", everyMin: 10, from: "09:00", to: "17:00", scene: null }, points: [] }] }), id };
}
export const updateRoute = (room, id, patch) => withRobot(room, { routes: room.robot.routes.map((r) => (r.id === id ? { ...r, ...patch, when: patch.when ? { ...r.when, ...patch.when } : r.when } : r)) });
export const removeRoute = (room, id) => withRobot(room, { routes: room.robot.routes.filter((r) => r.id !== id) });

const withPoints = (room, id, fn) => updateRoute(room, id, { points: fn(room.robot.routes.find((r) => r.id === id)?.points || []) });
// at: where in the list (the end by default)
export const addPoint = (room, id, x, z, at = null) =>
  withPoints(room, id, (pts) => {
    const p = { pos: [r3(x), r3(z)], dwell: 2, look: null, action: null };
    const i = at === null ? pts.length : Math.max(0, Math.min(pts.length, at));
    return [...pts.slice(0, i), p, ...pts.slice(i)];
  });
export const movePoint = (room, id, i, x, z) => withPoints(room, id, (pts) => pts.map((p, k) => (k === i ? { ...p, pos: [r3(x), r3(z)] } : p)));
export const updatePoint = (room, id, i, patch) => withPoints(room, id, (pts) => pts.map((p, k) => (k === i ? { ...p, ...patch } : p)));
export const removePoint = (room, id, i) => withPoints(room, id, (pts) => pts.filter((_, k) => k !== i));
export function reorderPoint(room, id, from, to) {
  return withPoints(room, id, (pts) => {
    const list = [...pts];
    const [p] = list.splice(from, 1);
    list.splice(Math.max(0, Math.min(list.length, to)), 0, p);
    return list;
  });
}
// A point between two others (after index i): the middle of the leg
export function insertPoint(room, id, i) {
  const pts = room.robot.routes.find((r) => r.id === id)?.points || [];
  const a = pts[i];
  const b = pts[i + 1] || pts[0];
  if (!a || !b) return room;
  return addPoint(room, id, (a.pos[0] + b.pos[0]) / 2, (a.pos[1] + b.pos[1]) / 2, i + 1);
}

// Is every point of a route reachable (on a free cell)? The indexes of those that aren't
export function blockedPoints(room, route) {
  const g = buildGrid(room);
  return route.points.map((p, i) => (isFree(g, ...cellOf(g, p.pos[0], p.pos[1])) ? -1 : i)).filter((i) => i >= 0);
}

export function labels() {
  return ["The robot can't stand there: outside the room", "The robot can't stand there: inside the {name}", "The robot can't stand there: a no-go zone"];
}
