// ---------- Room templates: the 27 places, the three v1 presets and "Empty", as room documents ----------
// Pure. templateRoom(id) gives a fresh, clean room document to start from.
//
// A place whose set hasn't been rebuilt from catalog things yet keeps a `legacy` block (its 1.0 set, its
// prop switches, its sign words); the renderer draws that set until the template is rebuilt
// (docs/release-1.1/PLAN.md, step 4). A rebuilt template lists its things as assets; its `props` map
// tells the migration which asset ids each 1.0 prop switch turns on or off.
import { unreachable } from "./nav.mjs";
import { PLACES, PLACE_BY_ID } from "../robot/room.mjs";
import { sanitizeRoom, emptyRoom, defaultArchitecture, defaultAtmosphere } from "./model.mjs";
import { WALL_LAYOUTS, SIZE_PRESETS, FLOOR_MATERIALS, WALL_MATERIALS } from "./choices.mjs";
import { fromV1Assets } from "./legacy.mjs";

// Open-air places: painted backdrops, no walls
const OPEN_AIR = new Set(["studio", "glow", "space", "garden", "city", "sky", "gradient", "photo", "green", "blue"]);
const OUTSIDE = { space: "space", garden: "hills", city: "city_night", sky: "clouds", seaside: "sea", campfire: "forest", photo: "photo" };
// The floor a place's own set draws, as a floor material (the rebuilt templates use these)
const FLOOR_OF = {
  desk: "walnut_planks", podcast: "carpet", lounge: "oak_planks", bedroom: "walnut_planks", kitchen: "checker", library: "herringbone",
  greenhouse: "stone", rooftop: "deck", workshop: "concrete", cabin: "pine_planks", seaside: "sand", campfire: "forest", cafe: "checker",
  arcade: "carpet", observatory: "deck", tatami: "tatami", spaceship: "deck_plates", garden: "grass", sky: "cloud",
};
const WALL_OF = {
  desk: "painted", podcast: "acoustic", lounge: "painted", bedroom: "painted", kitchen: "tiles", library: "panelling", workshop: "concrete",
  cabin: "logs", cafe: "brick", arcade: "painted", observatory: "starwall", tatami: "shoji", spaceship: "concrete", greenhouse: "plaster", rooftop: "brick",
};

import { REBUILT } from "./rebuilt.mjs";

export { REBUILT };

function placeTemplate(place) {
  const p = PLACE_BY_ID[place];
  const open = OPEN_AIR.has(place);
  const room = emptyRoom({ id: place, name: p.label });
  room.template = place;
  room.size = open ? { w: 6, d: 5, h: 2.8 } : { w: 6, d: 5.2, h: 2.8 };
  const arch = defaultArchitecture();
  arch.walls = open ? { back: false, left: false, right: false, front: false } : { back: true, left: false, right: false, front: false };
  arch.openAir = open;
  arch.palette = { ...p.colors };
  arch.wall = { ...arch.wall, material: WALL_OF[place] || "plaster", color: p.colors.wall };
  arch.floor = { material: p.floor === "glossy" ? "glossy" : p.floor === "grid" ? "grid" : p.floor === "none" ? "none" : FLOOR_OF[place] || "oak_planks", color: p.colors.floor };
  arch.outside = OUTSIDE[place] || "none";
  arch.backdrop = { ...arch.backdrop, bg: p.colors.wall, edge: p.colors.wall };
  room.architecture = arch;
  const atm = defaultAtmosphere();
  atm.mood = p.light;
  atm.air = p.air;
  room.atmosphere = atm;
  if (p.chroma) room.backdrop = { layer: place === "blue" ? "chroma_blue" : "chroma_green", keep: [], color: p.colors.wall };
  const rebuilt = REBUILT[place];
  if (rebuilt) {
    room.size = { ...rebuilt.size };
    room.architecture = { ...room.architecture, ...rebuilt.architecture };
    room.atmosphere = { ...room.atmosphere, ...(rebuilt.atmosphere || {}) };
    room.assets = rebuilt.assets.map((a) => ({ ...a }));
    if (rebuilt.robot) room.robot = { ...room.robot, ...rebuilt.robot };
  } else {
    room.legacy = { place, props: Object.fromEntries(p.props.map((q) => [q.id, q.on])), companions: {}, sign: "ON AIR", floor: "auto", light: "auto", builder: null };
  }
  return room;
}

// The three 1.0 presets: a studio stage with their things (1.0 drew them in the Studio place)
const V1 = {
  creator_studio_desk: {
    label: "Creator studio desk",
    about: "A desk with your things, a whiteboard, flowers and toys",
    home: { pos: [0, 0, 0.18], facing: 0 },
    assets: [
      { id: "desk_table", kind: "desk_table", x: -0.95, y: 0, z: -1.15, rotY: 0.14 },
      { id: "study_chair", kind: "study_chair", x: -0.92, y: 0, z: -0.45, rotY: 0.14 },
      { id: "whiteboard", kind: "whiteboard", x: 1.25, y: 0, z: -1.25, rotY: -0.42 },
      { id: "vase_flowers", kind: "vase_flowers", x: -1.42, y: 0.74, z: -1.22, attachedTo: "desk_table" },
      { id: "books_notebook", kind: "books_notebook", x: -0.95, y: 0.74, z: -1.08, attachedTo: "desk_table" },
      { id: "pens_cup", kind: "pens_cup", x: -0.64, y: 0.74, z: -1.18, attachedTo: "desk_table" },
      { id: "gaming_console", kind: "gaming_console", x: -0.42, y: 0.74, z: -1.02, attachedTo: "desk_table" },
      { id: "rubiks_cube", kind: "rubiks_cube", x: -1.18, y: 0.74, z: -0.95, attachedTo: "desk_table" },
      { id: "holo_projector", kind: "holo_projector", x: -0.78, y: 0.74, z: -1.32, attachedTo: "desk_table" },
      { id: "bouncy_ball", kind: "bouncy_ball", x: 0.78, y: 0, z: -0.15 },
      { id: "rc_drone", kind: "rc_drone", x: 0.45, y: 0, z: -1.05 },
      { id: "newtons_cradle", kind: "newtons_cradle", x: -1.28, y: 0.74, z: -1.36, attachedTo: "desk_table" },
    ],
  },
  cozy_study_corner: {
    label: "Cozy study corner",
    about: "A warm corner with study things, a kalimba, blocks and flowers",
    home: { pos: [0.15, 0, 0.25], facing: -5.73 },
    assets: [
      { id: "desk_table", kind: "desk_table", x: -1.05, y: 0, z: -1.25, rotY: 0.26 },
      { id: "study_chair", kind: "study_chair", x: -0.88, y: 0, z: -0.58, rotY: 0.26 },
      { id: "whiteboard", kind: "whiteboard", x: 1.05, y: 0, z: -1.35, rotY: -0.25 },
      { id: "vase_flowers", kind: "vase_flowers", x: -1.48, y: 0.74, z: -1.3 },
      { id: "books_notebook", kind: "books_notebook", x: -0.96, y: 0.74, z: -1.16 },
      { id: "pens_cup", kind: "pens_cup", x: -0.68, y: 0.74, z: -1.24 },
      { id: "retro_handheld", kind: "retro_handheld", x: -0.55, y: 0.74, z: -1.06 },
      { id: "mini_synth", kind: "mini_synth", x: -1.24, y: 0.74, z: -1.05 },
      { id: "stacking_blocks", kind: "stacking_blocks", x: 0.55, y: 0, z: -0.45 },
    ],
  },
  minimalist_open_stage: {
    label: "Minimalist open stage",
    about: "A clean stage with a whiteboard and a holo projector",
    home: { pos: [0, 0, 0.12], facing: 0 },
    assets: [
      { id: "whiteboard", kind: "whiteboard", x: 1.15, y: 0, z: -1.15, rotY: -0.35 },
      { id: "holo_projector", kind: "holo_projector", x: -0.95, y: 0, z: -0.85 },
      { id: "bouncy_ball", kind: "bouncy_ball", x: -0.65, y: 0, z: -0.25 },
    ],
  },
};
export const V1_PRESET_IDS = Object.keys(V1);
// A 1.0 preset's things as 1.0 listed them (for the settings migration)
export const v1PresetList = (id) => (V1[id] || V1.creator_studio_desk).assets.map((a) => ({ ...a }));

function presetTemplate(id) {
  const v = V1[id];
  const room = placeTemplate("studio");
  room.id = id;
  room.template = id;
  room.name = v.label;
  room.size = { w: 5, d: 4, h: 2.7 };
  room.assets = fromV1Assets(v.assets);
  room.robot.home = { ...v.home };
  return room;
}

function emptyTemplate({ size = "medium", walls = "corner", floor = "", wall = "" } = {}) {
  const preset = SIZE_PRESETS.find((s) => s.id === size && s.w) || SIZE_PRESETS[1];
  const layout = WALL_LAYOUTS.find((l) => l.id === walls) || WALL_LAYOUTS[2];
  const room = emptyRoom({ id: "empty", name: "Empty room", size: { w: preset.w, d: preset.d, h: preset.h } });
  room.template = "empty";
  room.architecture.walls = { ...layout.walls };
  room.atmosphere.mood = "day";
  const f = FLOOR_MATERIALS.find((m) => m.id === floor);
  if (f) room.architecture.floor = { material: f.id, color: f.def };
  const w = WALL_MATERIALS.find((m) => m.id === wall);
  if (w) room.architecture.wall = { ...room.architecture.wall, material: w.id, color: w.def };
  return room;
}

export const TEMPLATES = [
  { id: "empty", label: "Empty room", about: "Start from nothing and place things yourself", icon: "plus", kind: "empty" },
  ...PLACES.map((p) => ({ id: p.id, label: p.label, about: p.about, icon: p.icon, kind: "place", chroma: Boolean(p.chroma) })),
  ...V1_PRESET_IDS.map((id) => ({ id, label: V1[id].label, about: V1[id].about, icon: "desk", kind: "preset" })),
];
export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

// A fresh room from a template (cleaned); options: { id, name, size, walls, floor, wall } (the last four for "empty")
export function templateRoom(templateId, { id, name, size, walls, floor, wall, now = Date.now() } = {}) {
  const t = TEMPLATE_BY_ID[templateId] || TEMPLATE_BY_ID.studio;
  const doc = t.kind === "empty" ? emptyTemplate({ size, walls, floor, wall }) : t.kind === "preset" ? presetTemplate(t.id) : placeTemplate(t.id);
  doc.id = id || doc.id;
  doc.name = name || doc.name;
  doc.createdAt = doc.updatedAt = now;
  const clean = sanitizeRoom(doc, { now });
  // A template's things the robot can't get to from its home (a chair tucked under a desk, a plant deep in a
  // corner) are look-only there, so it doesn't try and fail (the editor flags it if you change that)
  const away = new Set(unreachable(clean).filter((x) => x.kind === "asset").map((x) => x.id));
  if (!away.size) return clean;
  return sanitizeRoom({ ...clean, assets: clean.assets.map((a) => (away.has(a.id) ? { ...a, rules: { ...a.rules, permission: "look" } } : a)) }, { now });
}

export const isRebuilt = (templateId) => Boolean(REBUILT[templateId]) || TEMPLATE_BY_ID[templateId]?.kind !== "place";

export function labels() {
  const out = new Set(["Empty room", "Start from nothing and place things yourself"]);
  for (const v of Object.values(V1)) {
    out.add(v.label);
    out.add(v.about);
  }
  return [...out];
}
