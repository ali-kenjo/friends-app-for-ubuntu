// ---------- From 0.6–1.0 settings to 1.1 rooms ----------
// Pure. The helper runs migrateSettings() once on start (server/rooms.js) and writes the rooms it gives
// back; the settings then keep only references ({ layoutId }). Every step is in docs/release-1.1/PLAN.md
// (§4.5) and covered by fixtures in test/fixtures/settings-*.json.
//
//   a place (robot.room)             → a room from that place's template, its colors, prop switches,
//                                      companions, sign words, photo blur/dim, light, floor, air, season,
//                                      time and weather settings kept
//   room.builder (0.7)               → assets; its wall/floor/ceiling/window styles and lighting rig →
//                                      architecture and mood (when the Builder was switched on)
//   roomEditor.assets (1.0)          → assets, only in the room in use (or the default preset's when empty)
//   behaviorEngine (1.0)             → the robot's movement, autonomy, routes, home, gaze; weights/dwells →
//                                      per-asset rules
//   robot.aiAllowed + toolPermissions → robot.ai (one permission model)
//   robot.customRooms                → rooms
//   saved looks, each character's look.room → rooms (identical rooms are shared)
import { templateRoom, REBUILT, v1PresetList } from "./templates.mjs";
import { sanitizeRoom, newId, deg, num, color, text, cleanId, defaultRules } from "./model.mjs";
import { fromBuilderItems, fromV1Assets } from "./legacy.mjs";
import { CATALOG_BY_ID } from "./catalog.mjs";
import { DEFAULT_AI } from "./rules.mjs";
import { PLACE_BY_ID } from "../robot/room.mjs";

const WALL_STYLE = { plaster: "plaster", wainscot: "wainscot", brick: "brick", slats: "slats", tiles: "tiles", shoji: "shoji", stone: "stone", starwall: "starwall" };
const FLOOR_STYLE = { oak: "oak_planks", herringbone: "herringbone", tatami_mat: "tatami", terrazzo: "terrazzo", checker: "checker", concrete: "concrete", carpet: "carpet", deck: "deck" };
const CEILING_STYLE = { open: "none", beams: "beams", coffered: "coffered", skylight: "skylight", starry_dome: "dome", industrial: "truss" };
const WINDOW_STYLE = { arched: "window_arched", picture: "window_picture", porthole: "window_round", french: "window_french", shoji_win: "window_shoji", greenhouse_arch: "window_arched" };
const RIG_MOOD = { cozy_warm: "cozy", daylight: "day", golden_hour: "golden", moonlit: "moonlight", cyber_neon: "neon", fireside: "fireside", stage_spot: "stage" };
const TIME_MODE = { manual: "manual", clock: "clock" };
const V1_DEFAULT = "creator_studio_desk";

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

// One 1.0 (or older) room object → a room document. `extra`: { v1Assets, behavior, id, name, now }
export function roomFromLegacy(legacy, { id = "room", name = "", v1Assets = null, behavior = null, now = Date.now(), notes = [] } = {}) {
  const r = obj(legacy);
  const place = PLACE_BY_ID[r.place] ? r.place : "studio";
  const doc = templateRoom(place, { id, name: name || PLACE_BY_ID[place].label, now });
  const arch = doc.architecture;
  const c = obj(r.colors);
  arch.palette = {
    wall: color(c.wall, arch.palette.wall),
    floor: color(c.floor, arch.palette.floor),
    glow: c.glow === "" ? "" : color(c.glow, arch.palette.glow),
    detail: color(c.detail, arch.palette.detail),
  };
  arch.wall.color = arch.palette.wall;
  arch.floor.color = arch.palette.floor;
  arch.backdrop.bg = arch.palette.wall;
  const photo = obj(r.photo);
  arch.photo = { blur: num(photo.blur, 0, 1, 0.25), dim: num(photo.dim, 0, 0.8, 0.15) };
  const atm = doc.atmosphere;
  if (r.light && r.light !== "auto") atm.mood = r.light;
  atm.brightness = num(r.brightness, 0.5, 1.5, 1);
  if (typeof r.air === "string") atm.air = r.air;
  atm.airAmount = num(r.airAmount, 0.3, 2, 1);
  if (typeof r.season === "string") atm.season = r.season;
  atm.weatherSync = typeof r.weatherSync === "boolean" ? r.weatherSync : true;
  atm.timeMode = TIME_MODE[r.timeMode] || "template";
  atm.timeHour = num(r.timeHour, 0, 24, 14);
  const props = obj(r.props);
  const companions = obj(r.companions);
  const sign = text(r.sign, 16, "ON AIR") || "ON AIR";
  if (doc.legacy) {
    doc.legacy.props = { ...doc.legacy.props, ...Object.fromEntries(Object.entries(props).filter(([, v]) => typeof v === "boolean")) };
    doc.legacy.companions = Object.fromEntries(Object.entries(companions).filter(([, v]) => typeof v === "boolean"));
    doc.legacy.sign = sign;
    doc.legacy.floor = typeof r.floor === "string" ? r.floor : "auto";
    doc.legacy.light = typeof r.light === "string" ? r.light : "auto";
  } else applyToRebuilt(doc, { props, companions, sign, notes });
  // The 0.7 Room Builder
  const b = obj(r.builder);
  const taken = new Set(doc.assets.map((a) => a.id));
  if (b.enabled) {
    arch.walls = { back: true, left: true, right: true, front: false };
    arch.openAir = false;
    arch.wall.material = WALL_STYLE[b.wallStyle] || "plaster";
    arch.floor.material = FLOOR_STYLE[b.floorStyle] || "oak_planks";
    arch.ceiling.kind = CEILING_STYLE[b.ceilingStyle] || "none";
    if (RIG_MOOD[b.lightingRig]) atm.mood = RIG_MOOD[b.lightingRig];
    const win = WINDOW_STYLE[b.windowStyle];
    if (win) {
      const wid = newId("window", taken);
      taken.add(wid);
      doc.assets.push({ id: wid, type: win, slot: "wall", pos: [0, CATALOG_BY_ID[win].mount ?? 0.85, -doc.size.d / 2], rot: 0, scale: 1 });
    }
    doc.legacy = null; // "Use custom room build" replaced the place's own set
  }
  if (Array.isArray(b.items) && b.items.length) doc.assets.push(...fromBuilderItems(b.items, { taken, notes, room: doc.size }));
  // 1.0 v1 assets (only for the room in use)
  if (v1Assets) {
    const v1 = fromV1Assets(v1Assets.list, { taken, notes });
    doc.assets.push(...v1);
    if (behavior) applyBehavior(doc, behavior, v1Assets.idMap || mapIds(v1Assets.list, v1));
  }
  return sanitizeRoom(doc, { now, notes });
}

// The old ids of v1 assets → their new ids (same order, same kinds)
function mapIds(oldList, newList) {
  const map = {};
  const pool = [...newList];
  for (const old of oldList || []) {
    const i = pool.findIndex((n) => n.id === old.id || n.id.startsWith(`${old.id}_`) || n.id === old.kind);
    if (i >= 0) map[old.id] = pool.splice(i, 1)[0].id;
  }
  return map;
}

// A rebuilt template: prop switches hide/show its things, companions and sign words go onto assets
function applyToRebuilt(doc, { props, companions, sign, notes }) {
  const t = REBUILT[doc.template];
  if (!t) return;
  for (const [prop, assetIds] of Object.entries(t.props || {})) {
    if (typeof props[prop] !== "boolean") continue;
    for (const a of doc.assets) if (assetIds.includes(a.id)) a.hidden = !props[prop];
  }
  for (const [prop, { asset, key }] of Object.entries(t.stateProps || {})) {
    if (typeof props[prop] !== "boolean") continue;
    const a = doc.assets.find((x) => x.id === asset);
    if (a) a.state = { ...(a.state || {}), [key]: props[prop] };
  }
  // A 1.0 switch that was on but has no thing in the rebuilt room (the TV, the fish tank): say so
  const known = new Set([...Object.keys(t.props || {}), ...Object.keys(t.stateProps || {})]);
  for (const [prop, on] of Object.entries(props)) if (on === true && !known.has(prop)) notes?.push(`The ${prop.replace(/_/g, " ")} of the old room isn't in the new one; add it from the catalog`);
  for (const a of doc.assets) if (a.type === "neon_sign") a.state = { ...a.state, text: sign };
  const taken = new Set(doc.assets.map((a) => a.id));
  const spots = t.companionSpots || {};
  for (const [kind, on] of Object.entries(companions)) {
    const type = kind === "drone" ? "drone_mini" : kind;
    if (!on || !CATALOG_BY_ID[type] || doc.assets.some((a) => a.type === type)) continue;
    const at = spots[kind] || [0.9, 0, 0.6];
    const id = newId(type, taken);
    taken.add(id);
    doc.assets.push({ id, type, slot: "floor", pos: at, rot: 0, scale: 1 });
  }
}

// behaviorEngine (1.0) → the robot's direction in this room; ids: old v1 asset id → new id
export function applyBehavior(doc, be, ids = {}) {
  const b = obj(be);
  const robot = doc.robot;
  const home = obj(b.homeSpot);
  if (Number.isFinite(Number(home.x)) || Number.isFinite(Number(home.z))) {
    robot.home = { pos: [num(home.x, -20, 20, 0), 0, num(home.z, -20, 20, 0.15)], facing: deg((Number(home.rotY) || 0) * (180 / Math.PI)) };
  }
  const k = obj(b.kinematics);
  robot.movement.speed = num(k.walkSpeed, 0.2, 2.5, robot.movement.speed);
  if (Number.isFinite(Number(k.turnRate))) robot.movement.turn = num(Number(k.turnRate) * (180 / Math.PI), 30, 720, robot.movement.turn, 1);
  const gaitMap = { walk: "walk", hover: "hover", brisk: "zip", playful: "hop" };
  const route = obj(b.waypointRoute);
  if (gaitMap[route.gait]) robot.movement.gait = gaitMap[route.gait];
  for (const g of Object.values(robot.gaze)) {
    g.headWeight = num(k.headGazeWeight, 0, 1, g.headWeight, 0.01);
    g.eyeWeight = num(k.eyeGazeWeight, 0, 1, g.eyeWeight, 0.01);
  }
  if (b.autonomousRoaming === false) robot.states.idle = "stay";
  else if (b.autonomousRoaming === true) robot.states.idle = "visit";
  if (b.focusLock === true) robot.movement.freedom = "stay";
  const q = obj(b.quotas);
  robot.autonomy.quotas = {
    maxPerSession: num(q.maxPerSession, 0, 500, robot.autonomy.quotas.maxPerSession, 1),
    maxPerHour: num(q.maxPerHour, 0, 120, robot.autonomy.quotas.maxPerHour, 1),
    perAssetPerHour: num(q.perAssetPerHour, 0, 60, robot.autonomy.quotas.perAssetPerHour, 1),
    globalCooldownSec: num(q.globalCooldownSec, 0, 600, robot.autonomy.quotas.globalCooldownSec, 1),
    perAssetCooldownSec: num(q.perAssetCooldownSec, 0, 3600, robot.autonomy.quotas.perAssetCooldownSec, 1),
  };
  if (b.autonomousRoaming !== false) robot.autonomy.preset = "custom";
  if (typeof b.interruptPolicy === "string") robot.autonomy.interrupt = b.interruptPolicy;
  robot.autonomy.foley = num(obj(b.foley).volume, 0, 100, robot.autonomy.foley, 1);
  if (obj(b.foley).enabled === false) robot.autonomy.foley = 0;
  robot.autonomy.homeReturnSec = num(b.homeReturnDelaySec, 1, 120, robot.autonomy.homeReturnSec, 1);
  // The waypoint route
  const nodes = Array.isArray(route.nodes) ? route.nodes.slice(0, 64) : [];
  if (nodes.length) {
    const modeMap = { loop: "loop", ping_pong: "ping_pong", random: "random" };
    robot.routes = [{ id: "route", name: "Patrol", mode: modeMap[route.mode] || "loop", when: { kind: b.autonomousRoaming === false ? "manual" : "idle" }, points: nodes.map((n) => ({ pos: [num(n?.x, -20, 20, 0), num(n?.z, -20, 20, 0)], dwell: num(n?.dwellSec, 0, 600, 2, 0.5) })) }];
  }
  // Weights (0–100 %) and dwell times per asset, and the category multipliers, → each asset's rules
  const weights = obj(b.assetWeights);
  const dwells = obj(b.assetDwells);
  const cat = obj(b.categoryMultipliers);
  for (const [oldId, w] of Object.entries(weights)) {
    const a = doc.assets.find((x) => x.id === (ids[oldId] || oldId));
    if (!a) continue;
    a.rules = { ...defaultRules(CATALOG_BY_ID[a.type]), ...(a.rules || {}), weight: num(w, 0, 100, 50, 1) };
  }
  for (const [oldId, d] of Object.entries(dwells)) {
    const a = doc.assets.find((x) => x.id === (ids[oldId] || oldId));
    const dd = obj(d);
    if (!a) continue;
    a.rules = { ...defaultRules(CATALOG_BY_ID[a.type]), ...(a.rules || {}), dwell: [num(dd.min, 0, 600, 3, 0.5), num(dd.max, 0, 600, 8, 0.5)] };
  }
  const catOf = (type) => (["desk_writing", "chair_office", "whiteboard"].includes(type) ? "furniture" : type === "vase_flowers" ? "flower" : ["pen_cup", "notebook", "game_console", "holo_projector"].includes(type) ? "desk_prop" : "toy");
  for (const a of doc.assets) {
    const m = Number(cat[catOf(a.type)]);
    if (!Number.isFinite(m) || m === 1 || !a.rules) continue;
    a.rules.weight = num(a.rules.weight * m, 0, 100, a.rules.weight, 1);
  }
  // Tools the AI wasn't allowed to use on a kind of thing → that thing's rules
  const perms = obj(b.toolPermissions);
  const denyAction = (types, action) => {
    for (const a of doc.assets) {
      if (!types.includes(a.type)) continue;
      const def = CATALOG_BY_ID[a.type];
      const rules = { ...defaultRules(def), ...(a.rules || {}) };
      rules.actions = (rules.actions || def.actions).filter((x) => x !== action);
      a.rules = rules;
    }
  };
  if (perms.water_flowers === false) denyAction(["vase_flowers", "monstera", "fig_tree", "succulents"], "water");
  if (perms.write_in_notebook === false) denyAction(["notebook"], "write");
  if (perms.explain_on_whiteboard === false) denyAction(["whiteboard"], "write");
  if (perms.clear_whiteboard === false) denyAction(["whiteboard"], "tidy");
  if (perms.play_with_toy === false) for (const a of doc.assets) if (CATALOG_BY_ID[a.type]?.actions.includes("play")) denyAction([a.type], "play");
  if (perms.follow_route === false) for (const r of robot.routes) r.when = { ...r.when, kind: "manual" };
  return doc;
}

// The single AI permission model, from 1.0's two
export function aiFromLegacy(robot, be) {
  const a = obj(obj(robot).aiAllowed);
  const p = obj(obj(be).toolPermissions);
  return {
    mood: a.mood !== false && p.set_emotion !== false,
    gestures: a.gesture !== false,
    move: a.move !== false && p.move_to_asset !== false && p.return_home !== false,
    look: a.look !== false,
    use: a.prop !== false && p.play_with_toy !== false,
    rearrange: DEFAULT_AI.rearrange,
    describe: true,
    context: "all",
  };
}

const roomKey = (r) => JSON.stringify(r ?? null);

// The whole migration. `stored` is the settings file as it was read (before cleaning).
// Returns { rooms: [docs], settings: the settings with references, notes } — or null when already done.
export function migrateSettings(stored, { now = Date.now() } = {}) {
  const s = obj(stored);
  const robot = obj(s.robot);
  if (robot.room && typeof robot.room === "object" && cleanId(robot.room.layoutId)) return null;
  const notes = [];
  const rooms = [];
  const byKey = new Map();
  const taken = new Set();
  const add = (doc, key) => {
    rooms.push(doc);
    taken.add(doc.id);
    if (key) byKey.set(key, doc.id);
    return doc.id;
  };
  // The room in use: the place, its Builder props, and (1.0 only) the v1 assets and the behaviour engine
  const had10 = Object.prototype.hasOwnProperty.call(s, "roomEditor");
  const v1List = Array.isArray(s.roomEditor?.assets) && s.roomEditor.assets.length ? s.roomEditor.assets : had10 ? presetAssets(s.roomEditor?.presetId) : null;
  const current = roomFromLegacy(robot.room || { place: "studio" }, {
    id: newId("my_room", taken),
    name: PLACE_BY_ID[obj(robot.room).place]?.label || "My room",
    v1Assets: v1List ? { list: v1List } : null,
    behavior: had10 ? s.behaviorEngine : null,
    now,
    notes,
  });
  const currentId = add(current, null);
  // Saved custom rooms
  for (const cr of Array.isArray(robot.customRooms) ? robot.customRooms.slice(0, 24) : []) {
    const key = roomKey(cr?.room);
    if (byKey.has(key)) continue;
    const doc = roomFromLegacy(cr?.room, { id: newId(cleanId(cr?.id) || "custom_room", taken), name: text(cr?.name, 60, "") || "My room", now, notes });
    add(doc, key);
  }
  const refFor = (legacyRoom, name) => {
    if (!legacyRoom || typeof legacyRoom !== "object") return currentId;
    if (legacyRoom.layoutId && cleanId(legacyRoom.layoutId)) return legacyRoom.layoutId;
    const key = roomKey(legacyRoom);
    if (key === roomKey(robot.room)) return currentId;
    if (byKey.has(key)) return byKey.get(key);
    if (rooms.length >= 64) return currentId;
    const doc = roomFromLegacy(legacyRoom, { id: newId("room", taken), name, now, notes });
    return add(doc, key);
  };
  const out = JSON.parse(JSON.stringify(s));
  out.robot = { ...robot, room: { layoutId: currentId } };
  out.robot.customRooms = (Array.isArray(robot.customRooms) ? robot.customRooms : []).map((cr) => ({ id: cr?.id, name: cr?.name, room: { layoutId: refFor(cr?.room, cr?.name) }, ...(cr?.thumb ? { thumb: cr.thumb } : {}) }));
  out.robot.looks = (Array.isArray(robot.looks) ? robot.looks : []).map((l) => ({ ...l, room: { layoutId: refFor(l?.room, text(l?.name, 60, "") || "Look") } }));
  out.robot.ai = aiFromLegacy(robot, s.behaviorEngine);
  const chars = obj(s.characters);
  if (Array.isArray(chars.list)) {
    out.characters = { ...chars, list: chars.list.map((c) => (c && typeof c === "object" ? { ...c, look: { ...obj(c.look), room: { layoutId: refFor(obj(c.look).room, text(c.name, 60, "") || "Character") } } } : c)) };
  }
  out.roomsMigratedFrom = had10 ? "1.0" : s.roomEditor === undefined && robot.room?.builder ? "0.7" : "0.6";
  return { rooms, settings: out, notes };
}

function presetAssets(presetId) {
  return v1PresetList(presetId && /^[\w-]+$/.test(presetId) ? presetId : V1_DEFAULT);
}
