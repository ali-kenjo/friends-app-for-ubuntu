// ---------- A room document: schema, cleaning, ids and a summary in words ----------
// Pure (no DOM, no three.js); the page and the helper both use it. Rooms come from files, imports and
// bundles, so everything here treats its input as untrusted: types, ranges, ids, colors and limits are
// checked, and unknown asset types are dropped with a note.
//
// Units: meters, Y up, the floor at y = 0, angles in degrees. The room is centred on the origin:
// x from -w/2 (left) to w/2 (right), z from -d/2 (back wall) to d/2 (front). The robot's usual home is
// (0, 0, 0.15) facing +z, towards the camera.
//
// An asset with a parent stores its position in the parent's frame (x/z across the parent, y above the
// surface it stands on), so it moves and turns with the parent.

import * as C from "./choices.mjs";
import { CATALOG_BY_ID, CATEGORIES, entryFor, customEntries } from "./catalog.mjs";
import { cleanCare } from "./care.mjs";

export const SCHEMA = 1;
export const LIMITS = { rooms: 64, assets: 300, zones: 64, routes: 16, routePoints: 64, cameras: 32, scenes: 16, spots: 32, zonePoints: 32, name: 60, text: 120 };
export const ID_RE = /^[\w-]{1,40}$/;
export const HEX = /^#[0-9a-f]{6}$/i;
export const CUSTOM_PREFIX = "custom:";
export const ROOM_SIZE = { w: [2, 14], d: [2, 12], h: [2.2, 5] };

// ---------- Small cleaners ----------
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
export const oneOf = (list, value, fallback) => (list.some((e) => e.id === value) ? value : fallback);
export const num = (value, min, max, def, step = 0.001) => {
  if (typeof value !== "number" && typeof value !== "string") return def;
  const n = Number(value);
  if (value === "" || !Number.isFinite(n)) return def;
  const c = Math.min(max, Math.max(min, n));
  return Math.round(Math.round(c / step) * step * 10000) / 10000 || 0;
};
const bool = (v, def) => (typeof v === "boolean" ? v : def);
export const color = (v, def) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : def);
export const text = (v, max = LIMITS.name, def = "") => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : def);
export const cleanId = (v) => (typeof v === "string" && ID_RE.test(v) ? v : null);
const vec3 = (v, def = [0, 0, 0], lim = 50) => {
  const a = arr(v);
  return [0, 1, 2].map((i) => num(a[i], -lim, lim, def[i]));
};
const vec2 = (v, def = [0, 0], lim = 50) => {
  const a = arr(v);
  return [0, 1].map((i) => num(a[i], -lim, lim, def[i]));
};
// Degrees, kept in (-180, 180]
export const deg = (v, def = 0) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  let d = ((n % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return Math.round(d * 100) / 100;
};
const hhmm = (v, def) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : def);

// ---------- Ids ----------
// A fresh id that isn't taken (prefix + a counter, never a reused random number: 1.0's spawnAsset ids collided)
export function newId(prefix, taken) {
  const set = taken instanceof Set ? taken : new Set(taken || []);
  const base = String(prefix || "item").toLowerCase().replace(/[^\w-]+/g, "_").slice(0, 30) || "item";
  if (!set.has(base)) return base;
  for (let n = 2; n < 100000; n++) {
    const id = `${base}_${n}`;
    if (!set.has(id)) return id;
  }
  return `${base}_${Date.now().toString(36)}`.slice(0, 40);
}

// ---------- Defaults ----------
export function defaultRobot() {
  const gaze = (mode) => ({ mode, asset: null, point: [0, 1.2, 1.5], headWeight: 0.85, eyeWeight: 1, lookAway: 0.3, dontStare: true, headLimit: 55 });
  return {
    home: { pos: [0, 0, 0.15], facing: 0 },
    spots: [],
    posture: {
      hover: "normal",
      stance: "upright",
      size: 100,
      idle: { kind: "stand", asset: null },
      talking: { kind: "stand", asset: null },
      listening: { kind: "stand", asset: null },
      away: { kind: "rest", asset: null },
    },
    gaze: { talking: gaze("you"), listening: gaze("you"), thinking: gaze("natural"), idle: gaze("task") },
    movement: {
      freedom: "near_home",
      leash: 1.2,
      clearance: 15,
      speed: 0.9,
      accel: 1.6,
      turn: 220,
      gait: "hover",
      path: "smooth",
      banking: 0.4,
    },
    zones: [],
    routes: [],
    states: {
      talking: "stay",
      listening: "turn",
      thinking: "stay",
      idle: "wander",
      away: { afterMin: 5, sleepAfterMin: 20 },
      night: { on: false, from: "23:00", to: "07:00" },
      filming: { stay: true, roam: false, steadyGaze: true },
    },
    autonomy: {
      preset: "calm",
      quotas: { maxPerSession: 40, maxPerHour: 6, perAssetPerHour: 6, globalCooldownSec: 12, perAssetCooldownSec: 45 },
      interrupt: "finish_briefly",
      foley: 65,
      tidy: false,
      plantCare: false,
      homeReturnSec: 8,
    },
  };
}

export function defaultArchitecture() {
  return {
    walls: { back: true, left: true, right: false, front: false },
    cutaway: "auto",
    thickness: 0.12,
    wall: { material: "plaster", color: "#e9e1d4", trim: true, trimColor: "#d9cdb9" },
    accentWall: null,
    floor: { material: "oak_planks", color: "#b88457" },
    ceiling: { kind: "none", color: "#f1ece3" },
    outside: "none",
    openAir: false,
    backdrop: { mode: "vignette", bg: "#26272c", edge: "#0b0b0d", glow: 0, glowColor: "", mid: "", horizon: 0.4 },
    palette: { wall: "#e9e1d4", floor: "#b88457", glow: "", detail: "#c9744f" },
    photo: { blur: 0.25, dim: 0.15 },
  };
}

export function defaultAtmosphere() {
  return { mood: "studio", brightness: 1, timeMode: "template", timeHour: 14, air: "dust", airAmount: 1, season: "none", weatherSync: true, wind: 0.3, emotionTint: true, effects: { bokeh: false, shaft: false, rings: false, spot: false } };
}

export function emptyRoom({ id = "room", name = "My room", size = { w: 5, d: 4, h: 2.7 }, now = Date.now() } = {}) {
  return {
    schema: SCHEMA,
    id,
    name,
    createdAt: now,
    updatedAt: now,
    template: null,
    size: { ...size },
    architecture: defaultArchitecture(),
    atmosphere: defaultAtmosphere(),
    assets: [],
    robot: defaultRobot(),
    cameras: [],
    defaultCamera: "auto",
    scenes: [],
    activeScene: "auto",
    backdrop: { layer: "full", keep: [], color: "#14161f" },
    legacy: null,
    notes: [],
  };
}

// ---------- Cleaning ----------
function cleanColors(raw, def) {
  const c = obj(raw);
  const out = {};
  for (const slot of def?.colors || []) out[slot.key] = color(c[slot.key], slot.def);
  return out;
}

function cleanRules(raw, def) {
  const r = obj(raw);
  const allowed = new Set(def?.actions || C.ACTION_IDS);
  const out = {
    permission: oneOf(C.PERMISSIONS, r.permission, "free"),
    actions: Array.isArray(r.actions) ? [...new Set(r.actions.filter((a) => allowed.has(a)))] : null,
    weight: num(r.weight, 0, 100, 50, 1),
    cooldown: num(r.cooldown, 0, 3600, 45, 1),
    maxPerHour: num(r.maxPerHour, 0, 60, 6, 1),
    dwell: [num(arr(r.dwell)[0], 0, 600, 3, 0.5), num(arr(r.dwell)[1], 0, 600, 8, 0.5)],
    times: arr(r.times).filter((t) => C.TIMES_OF_DAY.some((e) => e.id === t)).slice(0, 4),
    moods: {},
    keepDistance: num(r.keepDistance, 0, 300, 0, 1),
    fragile: bool(r.fragile, Boolean(def?.fragile)),
  };
  if (out.dwell[1] < out.dwell[0]) out.dwell[1] = out.dwell[0];
  const moods = obj(r.moods);
  for (const m of C.MOOD_AFFINITIES) if (moods[m.id] !== undefined) out.moods[m.id] = num(moods[m.id], 0, 3, 1, 0.05);
  return out;
}

export function defaultRules(def) {
  return cleanRules({}, def);
}

// A lamp's own settings: brightness (× its usual), its own color, and "on by itself at dusk"
function cleanLight(raw) {
  const l = obj(raw);
  return { intensity: num(l.intensity, 0, 2, 1, 0.01), color: typeof l.color === "string" && HEX.test(l.color) ? l.color.toLowerCase() : null, auto: l.auto === "dusk" ? "dusk" : "manual" };
}

function cleanSchedule(raw) {
  if (!raw || typeof raw !== "object") return null;
  const s = obj(raw);
  const out = {
    seasons: arr(s.seasons).filter((x) => C.SEASONS.some((e) => e.id === x && x !== "none" && x !== "auto")).slice(0, 8),
    months: [...new Set(arr(s.months).map(Number).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))],
    from: hhmm(s.from, ""),
    to: hhmm(s.to, ""),
    weekdays: [...new Set(arr(s.weekdays).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))],
    scenes: arr(s.scenes).map(cleanId).filter(Boolean).slice(0, LIMITS.scenes),
  };
  const empty = !out.seasons.length && !out.months.length && !out.from && !out.to && !out.weekdays.length && !out.scenes.length;
  return empty ? null : out;
}

function cleanState(raw, def) {
  const s = obj(raw);
  const out = {};
  for (const [k, v] of Object.entries(def?.states || {})) {
    if (typeof v === "boolean") out[k] = bool(s[k], v);
    else if (typeof v === "number") out[k] = num(s[k], 0, 1, v, 0.01);
    else if (typeof v === "string") {
      if (k === "style" && def.styles) out[k] = def.styles.includes(s[k]) ? s[k] : v;
      // A photo frame's picture: the id of a photo in the rooms' photo store (or none)
      else if (k === "photo") out[k] = typeof s[k] === "string" && /^[\w-]{1,40}$/.test(s[k]) ? s[k] : "";
      else out[k] = text(s[k], 24, v) || v;
    }
  }
  return out;
}

// One asset; `custom` is the catalog of the user's own models ({ id → entry })
export function sanitizeAsset(raw, { custom = null, notes } = {}) {
  const a = obj(raw);
  const type = typeof a.type === "string" ? a.type : "";
  const def = CATALOG_BY_ID[type] || (type.startsWith(CUSTOM_PREFIX) ? (custom || customEntries())[type.slice(CUSTOM_PREFIX.length)] : null);
  if (!def) {
    notes?.push(`Dropped an unknown thing: ${text(type, 40) || "(no type)"}`);
    return null;
  }
  const id = cleanId(a.id);
  if (!id) {
    notes?.push(`Dropped a ${def.label} with a bad id`);
    return null;
  }
  const slots = def.slots || ["floor"];
  const [smin, smax] = def.scale || [0.5, 2];
  return {
    id,
    type,
    name: text(a.name, LIMITS.name, ""),
    parent: cleanId(a.parent),
    surface: typeof a.surface === "string" && /^[\w-]{1,24}$/.test(a.surface) ? a.surface : null,
    slot: slots.includes(a.slot) ? a.slot : slots[0],
    pos: vec3(a.pos, [0, 0, 0], 20),
    rot: deg(a.rot),
    scale: num(a.scale, smin, smax, 1, 0.01),
    variant: C.VARIANTS.some((v) => v.id === a.variant) ? a.variant : "M",
    colors: cleanColors(a.colors, def),
    state: cleanState(a.state, def),
    locked: bool(a.locked, false),
    hidden: bool(a.hidden, false),
    glb: cleanId(a.glb),
    group: cleanId(a.group),
    drop: num(a.drop, 0, 2, 0.4, 0.01),
    rules: cleanRules(a.rules, def),
    schedule: cleanSchedule(a.schedule),
    light: def.light ? cleanLight(a.light) : null,
    care: def.actions?.includes("water") ? cleanCare(a.care) : null, // a plant: when it was last watered (care.mjs)
  };
}

function cleanGaze(raw, def) {
  const g = obj(raw);
  return {
    mode: oneOf(C.GAZE_MODES, g.mode, def.mode),
    asset: cleanId(g.asset),
    point: vec3(g.point, def.point, 20),
    headWeight: num(g.headWeight, 0, 1, def.headWeight, 0.01),
    eyeWeight: num(g.eyeWeight, 0, 1, def.eyeWeight, 0.01),
    lookAway: num(g.lookAway, 0, 1, def.lookAway, 0.01),
    dontStare: bool(g.dontStare, def.dontStare),
    headLimit: num(g.headLimit, 10, 90, def.headLimit, 1),
  };
}

function cleanPostureFor(raw, def) {
  const p = obj(raw);
  return { kind: oneOf(C.POSTURES, p.kind, def.kind), asset: cleanId(p.asset) };
}

function cleanZone(raw) {
  const z = obj(raw);
  const id = cleanId(z.id);
  if (!id) return null;
  const shape = oneOf(C.ZONE_SHAPES, z.shape, "rect");
  let points = arr(z.points).slice(0, LIMITS.zonePoints).map((p) => vec2(p, [0, 0], 20));
  if (shape === "rect" && points.length !== 2) return null;
  if (shape === "circle" && points.length !== 1) return null;
  if (shape === "poly" && points.length < 3) return null;
  if (shape === "rect") points = [[Math.min(points[0][0], points[1][0]), Math.min(points[0][1], points[1][1])], [Math.max(points[0][0], points[1][0]), Math.max(points[0][1], points[1][1])]];
  return { id, name: text(z.name), kind: oneOf(C.ZONE_KINDS, z.kind, "nogo"), shape, points, radius: shape === "circle" ? num(z.radius, 0.1, 10, 0.6, 0.01) : 0 };
}

function cleanRoute(raw) {
  const r = obj(raw);
  const id = cleanId(r.id);
  if (!id) return null;
  const w = obj(r.when);
  return {
    id,
    name: text(r.name),
    mode: oneOf(C.ROUTE_MODES, r.mode, "loop"),
    when: { kind: oneOf(C.ROUTE_WHEN, w.kind, "idle"), everyMin: num(w.everyMin, 1, 240, 10, 1), from: hhmm(w.from, "09:00"), to: hhmm(w.to, "17:00"), scene: cleanId(w.scene) },
    points: arr(r.points)
      .slice(0, LIMITS.routePoints)
      .map((p) => {
        const q = obj(p);
        const act = obj(q.action);
        return {
          pos: vec2(q.pos, [0, 0], 20),
          dwell: num(q.dwell, 0, 600, 2, 0.5),
          look: cleanId(q.look),
          action: act.asset || act.gesture ? { asset: cleanId(act.asset), action: C.ACTION_IDS.includes(act.action) ? act.action : null, gesture: typeof act.gesture === "string" && /^[a-z_]{1,24}$/.test(act.gesture) ? act.gesture : null } : null,
        };
      }),
  };
}

function cleanRobot(raw) {
  const def = defaultRobot();
  const r = obj(raw);
  const home = obj(r.home);
  const posture = obj(r.posture);
  const gaze = obj(r.gaze);
  const mv = obj(r.movement);
  const st = obj(r.states);
  const au = obj(r.autonomy);
  const q = obj(au.quotas);
  const seen = new Set();
  const unique = (e) => e && !seen.has(e.id) && seen.add(e.id);
  const out = {
    home: { pos: [num(arr(home.pos)[0], -20, 20, 0), 0, num(arr(home.pos)[2], -20, 20, 0.15)], facing: deg(home.facing) },
    spots: arr(r.spots)
      .map((s) => {
        const o = obj(s);
        const id = cleanId(o.id);
        return id ? { id, name: text(o.name), pos: [num(arr(o.pos)[0], -20, 20, 0), 0, num(arr(o.pos)[2], -20, 20, 0)], facing: deg(o.facing) } : null;
      })
      .filter(unique)
      .slice(0, LIMITS.spots),
    posture: {
      hover: oneOf(C.HOVER_HEIGHTS, posture.hover, def.posture.hover),
      stance: oneOf(C.STANCES, posture.stance, def.posture.stance),
      size: num(posture.size, 90, 110, 100, 1),
      idle: cleanPostureFor(posture.idle, def.posture.idle),
      talking: cleanPostureFor(posture.talking, def.posture.talking),
      listening: cleanPostureFor(posture.listening, def.posture.listening),
      away: cleanPostureFor(posture.away, def.posture.away),
    },
    gaze: Object.fromEntries(["talking", "listening", "thinking", "idle"].map((k) => [k, cleanGaze(gaze[k], def.gaze[k])])),
    movement: {
      freedom: oneOf(C.FREEDOMS, mv.freedom, def.movement.freedom),
      leash: num(mv.leash, 0.2, 3, def.movement.leash, 0.05),
      clearance: num(mv.clearance, 0, 60, def.movement.clearance, 1),
      speed: num(mv.speed, 0.2, 2.5, def.movement.speed, 0.05),
      accel: num(mv.accel, 0.3, 5, def.movement.accel, 0.05),
      turn: num(mv.turn, 30, 720, def.movement.turn, 1),
      gait: oneOf(C.GAITS, mv.gait, def.movement.gait),
      path: oneOf(C.PATH_STYLES, mv.path, def.movement.path),
      banking: num(mv.banking, 0, 1, def.movement.banking, 0.01),
    },
    zones: [],
    routes: [],
    states: {
      talking: oneOf(C.STATE_CHOICES.talking, st.talking, def.states.talking),
      listening: oneOf(C.STATE_CHOICES.listening, st.listening, def.states.listening),
      thinking: oneOf(C.STATE_CHOICES.thinking, st.thinking, def.states.thinking),
      idle: oneOf(C.STATE_CHOICES.idle, st.idle, def.states.idle),
      away: { afterMin: num(obj(st.away).afterMin, 1, 240, 5, 1), sleepAfterMin: num(obj(st.away).sleepAfterMin, 1, 480, 20, 1) },
      night: { on: bool(obj(st.night).on, false), from: hhmm(obj(st.night).from, "23:00"), to: hhmm(obj(st.night).to, "07:00") },
      filming: { stay: bool(obj(st.filming).stay, true), roam: bool(obj(st.filming).roam, false), steadyGaze: bool(obj(st.filming).steadyGaze, true) },
    },
    autonomy: {
      preset: oneOf(C.AUTONOMY_PRESETS, au.preset, def.autonomy.preset),
      quotas: {
        maxPerSession: num(q.maxPerSession, 0, 500, def.autonomy.quotas.maxPerSession, 1),
        maxPerHour: num(q.maxPerHour, 0, 120, def.autonomy.quotas.maxPerHour, 1),
        perAssetPerHour: num(q.perAssetPerHour, 0, 60, def.autonomy.quotas.perAssetPerHour, 1),
        globalCooldownSec: num(q.globalCooldownSec, 0, 600, def.autonomy.quotas.globalCooldownSec, 1),
        perAssetCooldownSec: num(q.perAssetCooldownSec, 0, 3600, def.autonomy.quotas.perAssetCooldownSec, 1),
      },
      interrupt: oneOf(C.INTERRUPT_POLICIES, au.interrupt, def.autonomy.interrupt),
      foley: num(au.foley, 0, 100, def.autonomy.foley, 1),
      tidy: bool(au.tidy, false),
      plantCare: bool(au.plantCare, false),
      homeReturnSec: num(au.homeReturnSec, 1, 120, def.autonomy.homeReturnSec, 1),
    },
  };
  seen.clear();
  out.zones = arr(r.zones).map(cleanZone).filter(unique).slice(0, LIMITS.zones);
  seen.clear();
  out.routes = arr(r.routes).map(cleanRoute).filter(unique).slice(0, LIMITS.routes);
  return out;
}

function cleanArchitecture(raw) {
  const def = defaultArchitecture();
  const a = obj(raw);
  const walls = obj(a.walls);
  const wall = obj(a.wall);
  const fl = obj(a.floor);
  const ce = obj(a.ceiling);
  const bd = obj(a.backdrop);
  const pal = obj(a.palette);
  const ph = obj(a.photo);
  const wallMat = oneOf(C.WALL_MATERIALS, wall.material, def.wall.material);
  const floorMat = oneOf(C.FLOOR_MATERIALS, fl.material, def.floor.material);
  const acc = a.accentWall && typeof a.accentWall === "object" ? obj(a.accentWall) : null;
  return {
    walls: { back: bool(walls.back, def.walls.back), left: bool(walls.left, def.walls.left), right: bool(walls.right, def.walls.right), front: bool(walls.front, def.walls.front) },
    cutaway: oneOf(C.CUTAWAYS, a.cutaway, "auto"),
    thickness: num(a.thickness, 0.05, 0.4, def.thickness, 0.01),
    wall: { material: wallMat, color: color(wall.color, C.WALL_MATERIALS.find((m) => m.id === wallMat).def), trim: bool(wall.trim, true), trimColor: color(wall.trimColor, def.wall.trimColor) },
    accentWall: acc && ["back", "left", "right", "front"].includes(acc.side) ? { side: acc.side, material: oneOf(C.WALL_MATERIALS, acc.material, "painted"), color: color(acc.color, "#c9744f") } : null,
    floor: { material: floorMat, color: color(fl.color, C.FLOOR_MATERIALS.find((m) => m.id === floorMat).def) },
    ceiling: { kind: oneOf(C.CEILINGS, ce.kind, "none"), color: color(ce.color, def.ceiling.color) },
    outside: oneOf(C.OUTSIDES, a.outside, "none"),
    openAir: bool(a.openAir, false),
    backdrop: {
      mode: ["flat", "vignette", "gradient", "image"].includes(bd.mode) ? bd.mode : "vignette",
      bg: color(bd.bg, def.backdrop.bg),
      edge: color(bd.edge, def.backdrop.edge),
      glow: num(bd.glow, 0, 2, 0, 0.01),
      glowColor: bd.glowColor === "" ? "" : color(bd.glowColor, ""),
      mid: bd.mid === "" ? "" : color(bd.mid, ""),
      horizon: num(bd.horizon, 0, 1, 0.4, 0.01),
    },
    palette: { wall: color(pal.wall, def.palette.wall), floor: color(pal.floor, def.palette.floor), glow: pal.glow === "" ? "" : color(pal.glow, ""), detail: color(pal.detail, def.palette.detail) },
    photo: { blur: num(ph.blur, 0, 1, 0.25, 0.01), dim: num(ph.dim, 0, 0.8, 0.15, 0.01) },
  };
}

function cleanAtmosphere(raw) {
  const def = defaultAtmosphere();
  const a = obj(raw);
  return {
    mood: oneOf(C.MOODS, a.mood, def.mood),
    brightness: num(a.brightness, 0.5, 1.5, 1, 0.01),
    timeMode: oneOf(C.TIME_MODES, a.timeMode, def.timeMode),
    timeHour: num(a.timeHour, 0, 24, 14, 0.25),
    air: oneOf(C.AIRS, a.air, def.air),
    airAmount: num(a.airAmount, 0.3, 2, 1, 0.01),
    season: oneOf(C.SEASONS, a.season, "none"),
    weatherSync: bool(a.weatherSync, true),
    wind: num(a.wind, 0, 1, def.wind, 0.01),
    emotionTint: bool(a.emotionTint, true),
    // Light effects of the 1.0 studio places: soft out-of-focus lights, a beam of light, rings when it talks, a spotlight
    effects: Object.fromEntries(["bokeh", "shaft", "rings", "spot"].map((k) => [k, bool(obj(a.effects)[k], def.effects[k])])),
  };
}

function cleanCamera(raw) {
  const c = obj(raw);
  const id = cleanId(c.id);
  if (!id) return null;
  const follow = c.follow === true ? "follow" : c.follow === false ? "fixed" : oneOf(C.CAMERA_FOLLOW, c.follow, "fixed");
  return { id, name: text(c.name), pos: vec3(c.pos, [0, 1.4, 4], 30), target: vec3(c.target, [0, 0.8, 0], 30), fov: num(c.fov, 15, 75, 30, 0.5), follow, relative: typeof c.relative === "string" && /^[\w-]{1,40}$/.test(c.relative) ? c.relative : null };
}

function cleanScene(raw) {
  const s = obj(raw);
  const id = cleanId(s.id);
  if (!id) return null;
  const o = obj(s.overrides);
  const w = obj(s.when);
  const map = (m, fn) => Object.fromEntries(Object.entries(obj(m)).filter(([k]) => ID_RE.test(k)).slice(0, LIMITS.assets).map(([k, v]) => [k, fn(v)]));
  const home = o.home && typeof o.home === "object" ? { pos: [num(arr(o.home.pos)[0], -20, 20, 0), 0, num(arr(o.home.pos)[2], -20, 20, 0.15)], facing: deg(o.home.facing) } : null;
  return {
    id,
    name: text(s.name),
    overrides: {
      hidden: map(o.hidden, (v) => Boolean(v)),
      colors: map(o.colors, (v) => Object.fromEntries(["c1", "c2", "c3"].filter((k) => HEX.test(obj(v)[k] || "")).map((k) => [k, obj(v)[k].toLowerCase()]))),
      lights: map(o.lights, (v) => ({ on: bool(obj(v).on, true), intensity: num(obj(v).intensity, 0, 3, 1, 0.01) })),
      mood: o.mood ? oneOf(C.MOODS, o.mood, null) : null,
      home,
      rules: map(o.rules, (v) => ({ permission: oneOf(C.PERMISSIONS, obj(v).permission, "free") })),
      posture: o.posture && typeof o.posture === "object" ? { idle: cleanPostureFor(o.posture.idle, { kind: "stand" }) } : null,
    },
    when: { kind: oneOf(C.SCENE_WHEN, w.kind, "manual"), from: hhmm(w.from, ""), to: hhmm(w.to, ""), weekdays: [...new Set(arr(w.weekdays).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))] },
  };
}

// The whole room. Returns a clean copy; `notes` (an array) collects what was dropped and why.
export function sanitizeRoom(input, { custom = null, notes = [], now = Date.now() } = {}) {
  const r = obj(input);
  const base = emptyRoom({ now });
  const size = obj(r.size);
  const out = {
    schema: SCHEMA,
    id: cleanId(r.id) || "room",
    name: text(r.name, LIMITS.name, "") || "My room",
    createdAt: num(r.createdAt, 0, 1e14, now, 1),
    updatedAt: num(r.updatedAt, 0, 1e14, now, 1),
    template: typeof r.template === "string" && ID_RE.test(r.template) ? r.template : null,
    size: { w: num(size.w, ...ROOM_SIZE.w, 5, 0.05), d: num(size.d, ...ROOM_SIZE.d, 4, 0.05), h: num(size.h, ...ROOM_SIZE.h, 2.7, 0.05) },
    architecture: cleanArchitecture(r.architecture),
    atmosphere: cleanAtmosphere(r.atmosphere),
    assets: [],
    robot: cleanRobot(r.robot),
    cameras: [],
    defaultCamera: "auto",
    scenes: [],
    activeScene: "auto",
    backdrop: { ...base.backdrop },
    legacy: null,
    notes: [],
  };
  const seen = new Set();
  for (const raw of arr(r.assets)) {
    if (out.assets.length >= LIMITS.assets) {
      notes.push(`Only the first ${LIMITS.assets} things were kept`);
      break;
    }
    const a = sanitizeAsset(raw, { custom, notes });
    if (!a) continue;
    if (seen.has(a.id)) {
      notes.push(`Dropped a second thing with the id ${a.id}`);
      continue;
    }
    seen.add(a.id);
    out.assets.push(a);
  }
  // Parents must exist, not be the thing itself, and not loop
  const byId = new Map(out.assets.map((a) => [a.id, a]));
  for (const a of out.assets) {
    if (!a.parent) continue;
    let p = byId.get(a.parent);
    const chain = new Set([a.id]);
    while (p && !chain.has(p.id)) {
      chain.add(p.id);
      p = p.parent ? byId.get(p.parent) : null;
    }
    if (!byId.has(a.parent) || p) {
      a.parent = null;
      a.surface = null;
    }
  }
  const camSeen = new Set();
  out.cameras = arr(r.cameras).map(cleanCamera).filter((c) => c && !camSeen.has(c.id) && camSeen.add(c.id)).slice(0, LIMITS.cameras);
  // The shot voice mode looks through ("auto": the robot's own framing, close/medium/wide)
  out.defaultCamera = r.defaultCamera === "auto" || camSeen.has(r.defaultCamera) ? r.defaultCamera || "auto" : "auto";
  const sceneSeen = new Set();
  out.scenes = arr(r.scenes).map(cleanScene).filter((s) => s && !sceneSeen.has(s.id) && sceneSeen.add(s.id)).slice(0, LIMITS.scenes);
  out.activeScene = r.activeScene === "auto" || r.activeScene === "none" || sceneSeen.has(r.activeScene) ? r.activeScene || "auto" : "auto";
  const bd = obj(r.backdrop);
  out.backdrop = { layer: oneOf(C.BACKDROP_LAYERS, bd.layer, "full"), keep: arr(bd.keep).map(cleanId).filter((x) => x && byId.has(x)).slice(0, LIMITS.assets), color: color(bd.color, base.backdrop.color) };
  // Things a spot, zone, route, gaze or posture names must exist
  const has = (x) => x && byId.has(x);
  for (const g of Object.values(out.robot.gaze)) if (g.asset && !has(g.asset)) g.asset = null;
  for (const k of ["idle", "talking", "listening", "away"]) if (out.robot.posture[k].asset && !has(out.robot.posture[k].asset)) out.robot.posture[k].asset = null;
  for (const route of out.robot.routes) for (const p of route.points) {
    if (p.look && !has(p.look)) p.look = null;
    if (p.action?.asset && !has(p.action.asset)) p.action = null;
  }
  if (r.legacy && typeof r.legacy === "object") out.legacy = cleanLegacy(r.legacy);
  out.notes = arr(r.notes).map((n) => text(n, LIMITS.text)).filter(Boolean).slice(-20);
  for (const n of notes) out.notes.push(text(n, LIMITS.text));
  out.notes = out.notes.slice(-20);
  return out;
}

// What a 1.0 place still needs while its template isn't rebuilt from catalog things yet (see templates.mjs)
function cleanLegacy(raw) {
  const l = obj(raw);
  const props = Object.fromEntries(Object.entries(obj(l.props)).filter(([k, v]) => /^[a-z0-9_]{1,24}$/.test(k) && typeof v === "boolean").slice(0, 64));
  const companions = Object.fromEntries(Object.entries(obj(l.companions)).filter(([k, v]) => /^[a-z_]{1,16}$/.test(k) && typeof v === "boolean").slice(0, 8));
  return {
    place: typeof l.place === "string" && /^[a-z_]{1,24}$/.test(l.place) ? l.place : "studio",
    props,
    companions,
    sign: text(l.sign, 16, "ON AIR") || "ON AIR",
    floor: ["auto", "glossy", "matte", "grid", "none"].includes(l.floor) ? l.floor : "auto",
    light: typeof l.light === "string" && /^[a-z_]{1,16}$/.test(l.light) ? l.light : "auto",
    builder: l.builder && typeof l.builder === "object" ? l.builder : null,
  };
}


// ---------- Upgrading older room documents ----------
// Schema 1 is the first; a later schema upgrades here, step by step, before sanitizeRoom() cleans it.
export function migrateRoom(raw) {
  const r = obj(raw);
  const schema = Number(r.schema) || 1;
  if (schema > SCHEMA) return { ...r, notes: [...arr(r.notes), "This room was made by a newer Friends; some parts may be missing"] };
  return { ...r, schema: SCHEMA };
}

// ---------- Your own models: their catalog entry ----------
// What the "Add my model" wizard says about a .glb (name, category, slots, footprint, surfaces, anchors,
// actions, recolorable materials), cleaned. The model itself is validated by the helper (server/rooms.js).
export function sanitizeCustomEntry(raw, id) {
  const e = obj(raw);
  const cid = cleanId(id) || cleanId(e.id);
  if (!cid) return null;
  const slots = arr(e.slots).filter((x) => C.SLOTS.some((s) => s.id === x));
  const fp = obj(e.footprint);
  const w = num(fp.w, 0.05, 6, 0.6, 0.01);
  const d = num(fp.d, 0.05, 6, 0.6, 0.01);
  const height = num(e.height, 0.02, 4, 0.8, 0.01);
  const anchors = obj(e.anchors);
  const a3 = (v) => (Array.isArray(v) && v.length === 3 ? vec3(v, [0, 0, 0], 10) : null);
  const info = obj(e.info);
  // The colorable materials: from the file's check, or (an entry read back) from its own color slots
  const saved = arr(e.colors).map((c) => obj(c));
  const recolor = (arr(info.recolor).length ? arr(info.recolor) : saved.map((c) => c.key)).filter((k) => ["c1", "c2", "c3"].includes(k));
  const colorsIn = { ...Object.fromEntries(saved.map((c) => [c.key, c.def])), ...obj(e.colorDefaults) };
  const actions = arr(e.actions).filter((x) => C.ACTION_IDS.includes(x));
  return {
    id: cid,
    label: text(e.label ?? e.name, LIMITS.name, "") || "My model",
    category: oneOf(CATEGORIES, e.category, "decor"),
    tags: [],
    slots: slots.length ? slots : ["floor"],
    footprint: { w, d },
    height,
    variants: { S: 0.85, M: 1, L: 1.15 },
    scale: [0.3, 3],
    surfaces: arr(e.surfaces).slice(0, 8).map((s, i) => {
      const o = obj(s);
      return { id: typeof o.id === "string" && /^[\w-]{1,24}$/.test(o.id) ? o.id : `surface${i + 1}`, y: num(o.y, 0, 4, height, 0.005), w: num(o.w, 0.05, 6, w, 0.01), d: num(o.d, 0.05, 6, d, 0.01), x: num(o.x, -3, 3, 0, 0.005), z: num(o.z, -3, 3, 0, 0.005) };
    }),
    anchors: {
      stand: a3(anchors.stand) || (slots[0] === "floor" || !slots.length ? [0, 0, Math.round((d / 2 + 0.45) * 100) / 100] : null),
      look: a3(anchors.look) || [0, Math.round(height * 0.65 * 100) / 100, 0],
      grip: a3(anchors.grip),
      sit: a3(anchors.sit),
      lean: a3(anchors.lean),
      canvas: a3(anchors.canvas),
      rest: a3(anchors.rest),
    },
    actions: actions.length ? [...new Set(["look", ...actions])] : ["look", "go", "touch"],
    colors: recolor.map((k, i) => ({ key: k, label: ["Color 1", "Color 2", "Color 3"][i], def: color(colorsIn[k], "#c9b8a0") })),
    overlap: bool(e.overlap, false),
    blocksPath: bool(e.blocksPath, (slots[0] || "floor") === "floor"),
    fragile: bool(e.fragile, false),
    movable: bool(e.movable, false),
    personalData: false,
    light: null,
    states: {},
    build: "custom",
    custom: true,
    stylize: bool(e.stylize, true),
    // How big one of the model's units is in meters (1: made in meters; 0.01: made in centimeters)
    unit: num(e.unit, 0.001, 100, 1, 0.0001),
    glb: cid,
    since: "1.1",
    from: { builder: [], v1: [] },
    pending: false,
    info: {
      triangles: num(info.triangles, 0, 1e8, 0, 1),
      maxTexture: num(info.maxTexture, 0, 65536, 0, 1),
      bytes: num(info.bytes, 0, 1e9, 0, 1),
      stripped: arr(info.stripped).map((x) => text(x, 60)).filter(Boolean).slice(0, 20),
      recolor,
      sockets: obj(info.sockets),
    },
  };
}

// ---------- Geometry in plain numbers ----------
const rad = (d) => (d * Math.PI) / 180;

// Where an asset is in the room (world x, y, z and its total turn), following its parents
export function worldTransform(room, asset, byId = new Map(room.assets.map((a) => [a.id, a]))) {
  let x = asset.pos[0];
  let y = asset.pos[1];
  let z = asset.pos[2];
  let rot = asset.rot;
  let p = asset.parent ? byId.get(asset.parent) : null;
  let guard = 0;
  while (p && guard++ < 16) {
    const def = entryFor(p.type);
    const surf = def?.surfaces?.find((s) => s.id === asset.surface) || def?.surfaces?.[0];
    const k = p.scale || 1;
    const sy = (surf?.y ?? def?.height ?? 0) * k;
    const sx = (surf?.x ?? 0) * k;
    const sz = (surf?.z ?? 0) * k;
    const lx = (x * k) + sx;
    const lz = (z * k) + sz;
    const c = Math.cos(rad(p.rot));
    const s = Math.sin(rad(p.rot));
    x = p.pos[0] + lx * c + lz * s;
    z = p.pos[2] - lx * s + lz * c;
    y = p.pos[1] + sy + y;
    rot += p.rot;
    asset = p;
    p = p.parent ? byId.get(p.parent) : null;
  }
  return { x, y, z, rot: deg(rot) };
}

// The four corners of an asset's footprint on the floor plan [[x, z]…] (oriented, scaled)
export function footprintOf(room, asset, byId) {
  const def = entryFor(asset.type);
  const t = worldTransform(room, asset, byId);
  const k = (asset.scale || 1) * (def?.variants?.[asset.variant] ?? 1);
  const hw = ((def?.footprint?.w ?? 0.5) * k) / 2;
  const hd = ((def?.footprint?.d ?? 0.5) * k) / 2;
  const c = Math.cos(rad(t.rot));
  const s = Math.sin(rad(t.rot));
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([px, pz]) => [t.x + px * c + pz * s, t.z - px * s + pz * c]);
}

// ---------- In words: for screen readers and the AI ----------
function whereWords(room, t, asset, byId) {
  if (asset.parent) {
    const p = byId.get(asset.parent);
    return { on: p ? displayName(p) : null };
  }
  const { w, d } = room.size;
  const fx = t.x / (w / 2);
  const fz = t.z / (d / 2);
  const side = fx < -0.33 ? "left" : fx > 0.33 ? "right" : "centre";
  const depth = fz < -0.33 ? "back" : fz > 0.33 ? "front" : "middle";
  return { side, depth, wall: asset.slot === "wall", ceiling: asset.slot === "ceiling" };
}

export function displayName(asset) {
  return asset.name || entryFor(asset.type)?.label || asset.type;
}

// roomSummary: what's in the room, in plain words and as data.
//   detail: "all" | "names" | "none"; personal: whether personal-data things may show their data
//   say: (english, vars) → the words (the page passes t(), the helper passes its say())
export function roomSummary(room, { detail = "all", personal = false, say = (s, v) => fill(s, v), canDo = null, nameOf = displayName } = {}) {
  if (detail === "none") return { text: "", items: [] };
  const byId = new Map(room.assets.map((a) => [a.id, a]));
  const items = [];
  for (const a of room.assets) {
    if (a.hidden) continue;
    const def = entryFor(a.type);
    const t = worldTransform(room, a, byId);
    const where = whereWords(room, t, a, byId);
    const item = { id: a.id, name: nameOf(a), type: a.type, where, personal: Boolean(def?.personalData) };
    if (detail === "all") {
      item.pos = [Math.round(t.x * 100) / 100, Math.round(t.y * 100) / 100, Math.round(t.z * 100) / 100];
      item.permission = a.rules.permission;
      if (canDo) item.allowed = (def?.actions || []).filter((act) => canDo(a.id, act).ok);
      if (item.personal && !personal) item.redacted = true;
    }
    items.push(item);
  }
  const phrase = (i) => {
    const w = i.where;
    if (w.on) return say("{name} on the {parent}", { name: i.name, parent: w.on });
    if (w.ceiling) return say("{name} hanging from the ceiling, {depth} {side}", { name: i.name, depth: say(w.depth), side: say(w.side) });
    if (w.wall) return say("{name} on the wall, {depth} {side}", { name: i.name, depth: say(w.depth), side: say(w.side) });
    return say("{name}, {depth} {side}", { name: i.name, depth: say(w.depth), side: say(w.side) });
  };
  const sentence = items.length ? items.map(phrase).join("; ") : say("The room is empty.");
  return { text: sentence, items };
}

const fill = (s, vars = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));

// The words roomSummary uses (for the i18n scanner)
export function labels() {
  return ["{name} on the {parent}", "{name} hanging from the ceiling, {depth} {side}", "{name} on the wall, {depth} {side}", "{name}, {depth} {side}", "The room is empty.", "Color 1", "Color 2", "Color 3", "My model", "This room was made by a newer Friends; some parts may be missing", "back", "middle", "front", "left", "centre", "right", "My room"];
}
