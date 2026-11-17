// ---------- Camera shots of a room ----------
// Pure. A shot is { id, name, pos, target, fov, follow: "fixed" | "follow" | "auto", relative: assetId|null }.
// A relative shot is measured in its thing's own frame (it moves and turns with it) and is unavailable
// while the thing is missing or hidden. "follow" keeps the shot's offset to the robot as it moves;
// "auto" stays where it is and turns and zooms to keep the robot framed.
import { CATALOG_BY_ID } from "./catalog.mjs";
import { worldTransform } from "./model.mjs";

const RAD = Math.PI / 180;
const r3 = (v) => v.map((x) => Math.round(x * 1000) / 1000);

// A point in a thing's frame → the room's
function toWorld(t, p) {
  const c = Math.cos(t.rot * RAD);
  const s = Math.sin(t.rot * RAD);
  return [t.x + p[0] * c + p[2] * s, t.y + p[1], t.z - p[0] * s + p[2] * c];
}

// The shot in room coordinates, or null when it can't be used now (its thing is gone or hidden)
export function resolveShot(room, shot, { hidden = new Set() } = {}) {
  if (!shot) return null;
  if (!shot.relative) return { pos: [...shot.pos], target: [...shot.target], fov: shot.fov, follow: shot.follow };
  const a = room.assets.find((x) => x.id === shot.relative);
  if (!a || a.hidden || hidden.has(a.id)) return null;
  const t = worldTransform(room, a);
  return { pos: toWorld(t, shot.pos), target: toWorld(t, shot.target), fov: shot.fov, follow: shot.follow };
}

// The shots this room can use now (relative ones whose thing is there)
export function usableShots(room, opts) {
  return (room.cameras || []).filter((c) => resolveShot(room, c, opts));
}

// Where the camera is this frame. robot: the robot's position on the floor [x, z]; home: where it lives.
// height: the robot's height (for auto-frame). Returns { pos, target, fov }.
export function shotFrame(resolved, { robot = [0, 0], home = [0, 0], height = 1.1 } = {}) {
  const { pos, target, fov, follow } = resolved;
  if (follow === "follow") {
    const dx = robot[0] - home[0];
    const dz = robot[1] - home[1];
    return { pos: [pos[0] + dx, pos[1], pos[2] + dz], target: [target[0] + dx, target[1], target[2] + dz], fov };
  }
  if (follow === "auto") {
    const aim = [robot[0], height * 0.62, robot[1]];
    const dist = Math.hypot(pos[0] - aim[0], pos[1] - aim[1], pos[2] - aim[2]);
    // The robot fills about two thirds of the picture's height, within sensible lenses
    const want = (2 * Math.atan((height * 1.5) / 2 / Math.max(0.3, dist))) / RAD;
    return { pos: [...pos], target: aim, fov: Math.min(60, Math.max(14, want)) };
  }
  return { pos: [...pos], target: [...target], fov };
}

// Shots worth offering for this room: the whole room, at eye level, auto-framed, and one at each of the
// main things (a desk, the sofa, the bed, a board…), measured from that thing so they move with it.
const AT_KINDS = new Set(["tables", "seating", "furniture", "tech", "kitchen", "music", "toys"]);
export function shotPresets(room, say = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => v?.[k] ?? m)) {
  const { w, d, h } = room.size;
  const home = room.robot.home.pos;
  const list = [
    { key: "wide", name: say("The whole room"), pos: r3([w * 0.42, Math.min(h * 0.85, 2.3), d * 0.62]), target: [0, 0.7, -d * 0.1], fov: 42, follow: "fixed", relative: null },
    { key: "eye", name: say("Eye level"), pos: r3([home[0], 1.05, home[2] + 2.2]), target: r3([home[0], 0.75, home[2]]), fov: 30, follow: "follow", relative: null },
    { key: "auto", name: say("Keeps the robot in frame"), pos: r3([-w * 0.35, 1.6, d * 0.45]), target: r3([home[0], 0.7, home[2]]), fov: 30, follow: "auto", relative: null },
  ];
  const seen = new Set();
  for (const a of room.assets) {
    if (a.parent || a.hidden || a.slot !== "floor") continue;
    const def = CATALOG_BY_ID[a.type];
    if (!def || !AT_KINDS.has(def.category) || seen.has(def.category) || def.height < 0.3) continue;
    seen.add(def.category);
    const name = a.name || say(def.label);
    list.push({ key: `at-${a.id}`, name: say("At the {name}", { name }), pos: r3([0.35, Math.max(1.1, def.height + 0.7), def.footprint.d / 2 + 1.5]), target: r3([0, def.height * 0.8, 0]), fov: 34, follow: "fixed", relative: a.id });
    if (list.length >= 8) break;
  }
  return list;
}

export function labels() {
  return ["The whole room", "Eye level", "Keeps the robot in frame", "At the {name}"];
}
