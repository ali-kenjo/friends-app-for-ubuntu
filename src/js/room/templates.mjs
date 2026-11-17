// ---------- Room templates: the 27 places, the three v1 presets and "Empty", as room documents ----------
// Pure. templateRoom(id) gives a fresh, clean room document to start from.
//
// A place whose set hasn't been rebuilt from catalog things yet keeps a `legacy` block (its 1.0 set, its
// prop switches, its sign words); the renderer draws that set until the template is rebuilt
// (docs/release-1.1/PLAN.md, step 4). A rebuilt template lists its things as assets; its `props` map
// tells the migration which asset ids each 1.0 prop switch turns on or off.
import { PLACES, PLACE_BY_ID } from "../robot/room.mjs";
import { sanitizeRoom, emptyRoom, defaultArchitecture, defaultAtmosphere } from "./model.mjs";
import { WALL_LAYOUTS, SIZE_PRESETS } from "./choices.mjs";
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

// Rebuilt templates: their architecture and things, from catalog assets. `props` maps a 1.0 prop switch to
// the asset ids it shows or hides; `stateProps` maps a switch to an asset's state; `companionSpots` is where
// a switched-on 1.0 companion goes.
const W = (x, y, z) => [x, y, z];
export const REBUILT = {
  lounge: {
    size: { w: 6, d: 5.2, h: 2.8 },
    architecture: {
      walls: { back: true, left: true, right: false, front: false },
      wall: { material: "painted", color: "#4a3a45", trim: true, trimColor: "#2f252c" },
      floor: { material: "oak_planks", color: "#8a5e44" },
      ceiling: { kind: "none", color: "#f1ece3" },
      outside: "city_night",
      backdrop: { mode: "vignette", bg: "#2a2128", edge: "#120d11", glow: 0, glowColor: "", mid: "", horizon: 0.4 },
      palette: { wall: "#3c3039", floor: "#6b4a3a", glow: "#ffbf80", detail: "#c9744f" },
    },
    atmosphere: { mood: "cozy", brightness: 1.1, timeMode: "template", timeHour: 19.5, air: "dust" },
    assets: [
      { id: "bookcase", type: "bookcase", pos: W(-1.9, 0, -2.42), colors: { c1: "#7a4f30", c2: "#c9744f" } },
      { id: "fireplace", type: "fireplace", pos: W(-0.35, 0, -2.35), colors: { c1: "#a39a8c", c2: "#5a3d2b" } },
      { id: "kettle", type: "kettle", parent: "fireplace", surface: "top", slot: "surface", pos: W(0.48, 0, -0.02), rot: -20, colors: { c1: "#c9744f" } },
      { id: "candles", type: "candles", parent: "fireplace", surface: "top", slot: "surface", pos: W(-0.5, 0, 0) },
      { id: "clock", type: "clock_wall", slot: "wall", pos: W(-0.35, 1.62, -2.6), colors: { c1: "#f4efe6", c2: "#7a4f30" } },
      { id: "frame_a", type: "frame_picture", slot: "wall", pos: W(-1.08, 1.42, -2.6), scale: 0.72, colors: { c1: "#d8c9a6", c2: "#c9744f" } },
      { id: "frame_b", type: "frame_picture", slot: "wall", pos: W(0.3, 1.42, -2.6), scale: 0.6, colors: { c1: "#d8c9a6", c2: "#5b8fa8" } },
      { id: "window", type: "window_french", slot: "wall", pos: W(1.4, 0.85, -2.6), colors: { c1: "#e8e2d6", c2: "#b5654a" } },
      { id: "low_shelf", type: "shelf_low", pos: W(1.4, 0, -2.41), colors: { c1: "#8a5e44", c2: "#e9dcc6" } },
      { id: "turntable", type: "turntable", parent: "low_shelf", surface: "top", slot: "surface", pos: W(-0.24, 0, 0.0), state: { on: true } },
      { id: "succulents", type: "succulents", parent: "low_shelf", surface: "top", slot: "surface", pos: W(0.33, 0, 0.02) },
      { id: "floor_lamp", type: "lamp_floor", pos: W(2.3, 0, -1.5), colors: { c1: "#efe2c8", c2: "#2d3038" } },
      { id: "plant", type: "monstera", pos: W(2.62, 0, -2.2), scale: 1.12, colors: { c1: "#4d8a62", c2: "#c47a5a" } },
      { id: "rug", type: "rug_round", pos: W(0, 0, -0.15), scale: 1.12, colors: { c1: "#c9744f", c2: "#f3e6d2" } },
      { id: "armchair", type: "armchair", pos: W(-1.95, 0, -1.0), rot: 55, colors: { c1: "#ede4d6", c2: "#8a5e44" } },
      { id: "side_table", type: "table_side", pos: W(-1.15, 0, -1.75), colors: { c1: "#8a5e44", c2: "#2d3038" } },
      { id: "mug", type: "mug", parent: "side_table", surface: "top", slot: "surface", pos: W(0.05, 0, 0.04), colors: { c1: "#f4efe6" } },
      { id: "cat", type: "cat", pos: W(-1.0, 0, 0.4), rot: -25 },
      { id: "string_lights", type: "string_lights", slot: "wall", pos: W(0, 2.05, -2.6), scale: 1.75, colors: { c1: "#ffcf8a" } },
    ],
    props: { window: ["window"], shelf: ["bookcase"], plant: ["plant"], lamp: ["floor_lamp"], rug: ["rug"], lights: ["string_lights"], frames: ["frame_a", "frame_b"], clock: ["clock"], fireplace: ["fireplace", "candles"], cat: ["cat"], record_player: ["turntable"], kettle: ["kettle"] },
    stateProps: { curtains: { asset: "window", key: "curtains" } },
    companionSpots: { cat: [-1.0, 0, 0.4], drone: [1.0, 0, 0.3], goldfish: [1.6, 0, -2.4], plant_sprite: [0.9, 0, 0.5], vacuum: [0.8, 0, 0.9] },
  },
};

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

function emptyTemplate({ size = "medium", walls = "corner" } = {}) {
  const preset = SIZE_PRESETS.find((s) => s.id === size && s.w) || SIZE_PRESETS[1];
  const layout = WALL_LAYOUTS.find((l) => l.id === walls) || WALL_LAYOUTS[2];
  const room = emptyRoom({ id: "empty", name: "Empty room", size: { w: preset.w, d: preset.d, h: preset.h } });
  room.template = "empty";
  room.architecture.walls = { ...layout.walls };
  room.atmosphere.mood = "day";
  return room;
}

export const TEMPLATES = [
  { id: "empty", label: "Empty room", about: "Start from nothing and place things yourself", icon: "plus", kind: "empty" },
  ...PLACES.map((p) => ({ id: p.id, label: p.label, about: p.about, icon: p.icon, kind: "place", chroma: Boolean(p.chroma) })),
  ...V1_PRESET_IDS.map((id) => ({ id, label: V1[id].label, about: V1[id].about, icon: "desk", kind: "preset" })),
];
export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

// A fresh room from a template (cleaned); options: { id, name, size, walls } (size/walls for "empty")
export function templateRoom(templateId, { id, name, size, walls, now = Date.now() } = {}) {
  const t = TEMPLATE_BY_ID[templateId] || TEMPLATE_BY_ID.studio;
  const doc = t.kind === "empty" ? emptyTemplate({ size, walls }) : t.kind === "preset" ? presetTemplate(t.id) : placeTemplate(t.id);
  doc.id = id || doc.id;
  doc.name = name || doc.name;
  doc.createdAt = doc.updatedAt = now;
  return sanitizeRoom(doc, { now });
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
