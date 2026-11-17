// ---------- Every place, rebuilt from catalog assets ----------
// Pure data. Each entry is what templates.mjs needs to make the place's room: its size, architecture,
// atmosphere and things, plus how a 1.0 room of that place moves over:
//   props        1.0 prop switch → the asset ids it shows or hides
//   stateProps   1.0 prop switch → an asset's state (curtains drawn…)
//   effectProps  1.0 prop switch → an atmosphere effect (bokeh, shaft, rings, spot)
//   scenery      1.0 prop switches that are part of the painted view outside (sun, moon, skyline…)
// Indoor places are 6 × 5.2 m with the back wall at z = −2.6 (the 1.0 framing); open-air places 6 × 5 m.
// The robot stands at (0, 0, 0.15): nothing is placed within about 0.7 m of it.

const A = (id, type, x, z, o = {}) => ({
  id,
  type,
  pos: [x, o.y ?? 0, z],
  rot: o.rot ?? 0,
  scale: o.s ?? 1,
  ...(o.slot ? { slot: o.slot } : {}),
  ...(o.c ? { colors: o.c } : {}),
  ...(o.st ? { state: o.st } : {}),
  ...(o.hidden ? { hidden: true } : {}),
});
// On the back wall (x along it, y = the height of its bottom), on the left wall (z along it)
const W = (id, type, x, y, o = {}) => A(id, type, x, -2.6, { ...o, y, slot: "wall" });
const L = (id, type, z, y, o = {}) => A(id, type, -3, z, { ...o, y, slot: "wall", rot: 90 });
// On another thing's surface
const On = (id, type, parent, x, z, o = {}) => ({ ...A(id, type, x, z, o), parent, surface: o.surf || "top", slot: "surface", pos: [x, 0, z] });
// Hanging from the ceiling (or the sky): y is where it hangs from
const C = (id, type, x, z, y = 2.8, o = {}) => A(id, type, x, z, { ...o, y, slot: "ceiling" });

const INDOOR = { w: 6, d: 5.2, h: 2.8 };
const OPEN = { w: 6, d: 5, h: 2.8 };
const SPOTS = { cat: [-1.0, 0, 0.5], drone: [1.0, 0, 0.3], goldfish: [1.6, 0, -2.2], plant_sprite: [0.9, 0, 0.6], vacuum: [0.8, 0, 0.9] };
const walls = (back = true, left = true, right = false) => ({ back, left, right, front: false });
const open = { back: false, left: false, right: false, front: false };

// The twelve extras every 1.0 studio-like place offered (all off), as things on a row of side tables
function studioExtras() {
  const assets = [];
  const props = {};
  const small = [["clock", "clock_wall", { s: 0.8 }], ["record_player", "turntable"], ["lava_lamp", "lava_lamp"], ["kettle", "kettle"], ["radio", "radio"], ["books", "books_stack"], ["mug", "mug"]];
  small.forEach(([prop, type, o = {}], i) => {
    const x = -2.1 + (i % 4) * 1.4 + (i >= 4 ? 0.7 : 0);
    const z = i >= 4 ? -0.9 : -1.9;
    assets.push(A(`${prop}_table`, "table_side", x, z, { hidden: true }), On(prop, type, `${prop}_table`, 0, 0, { ...o, hidden: true }));
    props[prop] = [`${prop}_table`, prop];
  });
  assets.push(A("lamp", "lamp_floor", 2.3, -1.4, { hidden: true }), A("plant", "monstera", -2.4, -1.2, { hidden: true }), A("tv", "tv_retro", 1.9, -2.0, { rot: -20, hidden: true }), A("cat", "cat", -1.0, 0.5, { rot: -25, hidden: true }), A("fish_tank", "fish_tank", -1.6, -2.1, { hidden: true }));
  Object.assign(props, { lamp: ["lamp"], plant: ["plant"], tv: ["tv"], cat: ["cat"], fish_tank: ["fish_tank"] });
  return { assets, props };
}

function studioLike(bg, mood = "studio", glow = 0) {
  const ex = studioExtras();
  return {
    size: OPEN,
    architecture: { walls: open, openAir: true, floor: { material: "glossy", color: "#14151a" }, ceiling: { kind: "none", color: "#f1ece3" }, outside: "none", backdrop: { mode: "vignette", bg, edge: "#0b0b0d", glow, glowColor: "", mid: "", horizon: 0.4 } },
    atmosphere: { mood, air: "dust", effects: { bokeh: true, shaft: true, rings: true, spot: false } },
    assets: ex.assets,
    props: ex.props,
    effectProps: { bokeh: "bokeh", shaft: "shaft", rings: "rings" },
  };
}

const P = (x, y, z) => [x, y, z];

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
      { id: "bookcase", type: "bookcase", pos: P(-1.9, 0, -2.42), colors: { c1: "#7a4f30", c2: "#c9744f" } },
      { id: "fireplace", type: "fireplace", pos: P(-0.35, 0, -2.35), colors: { c1: "#a39a8c", c2: "#5a3d2b" } },
      { id: "kettle", type: "kettle", parent: "fireplace", surface: "top", slot: "surface", pos: P(0.48, 0, -0.02), rot: -20, colors: { c1: "#c9744f" } },
      { id: "candles", type: "candles", parent: "fireplace", surface: "top", slot: "surface", pos: P(-0.5, 0, 0) },
      { id: "clock", type: "clock_wall", slot: "wall", pos: P(-0.35, 1.62, -2.6), colors: { c1: "#f4efe6", c2: "#7a4f30" } },
      { id: "frame_a", type: "frame_picture", slot: "wall", pos: P(-1.08, 1.42, -2.6), scale: 0.72, colors: { c1: "#d8c9a6", c2: "#c9744f" } },
      { id: "frame_b", type: "frame_picture", slot: "wall", pos: P(0.3, 1.42, -2.6), scale: 0.6, colors: { c1: "#d8c9a6", c2: "#5b8fa8" } },
      { id: "window", type: "window_french", slot: "wall", pos: P(1.4, 0.85, -2.6), colors: { c1: "#e8e2d6", c2: "#b5654a" } },
      { id: "low_shelf", type: "shelf_low", pos: P(1.4, 0, -2.41), colors: { c1: "#8a5e44", c2: "#e9dcc6" } },
      { id: "turntable", type: "turntable", parent: "low_shelf", surface: "top", slot: "surface", pos: P(-0.24, 0, 0.0), state: { on: true } },
      { id: "succulents", type: "succulents", parent: "low_shelf", surface: "top", slot: "surface", pos: P(0.33, 0, 0.02) },
      { id: "floor_lamp", type: "lamp_floor", pos: P(2.3, 0, -1.5), colors: { c1: "#efe2c8", c2: "#2d3038" } },
      { id: "plant", type: "monstera", pos: P(2.62, 0, -2.2), scale: 1.12, colors: { c1: "#4d8a62", c2: "#c47a5a" } },
      { id: "rug", type: "rug_round", pos: P(0, 0, -0.15), scale: 1.12, colors: { c1: "#c9744f", c2: "#f3e6d2" } },
      { id: "armchair", type: "armchair", pos: P(-1.95, 0, -1.0), rot: 55, colors: { c1: "#ede4d6", c2: "#8a5e44" } },
      { id: "side_table", type: "table_side", pos: P(-1.15, 0, -1.75), colors: { c1: "#8a5e44", c2: "#2d3038" } },
      { id: "mug", type: "mug", parent: "side_table", surface: "top", slot: "surface", pos: P(0.05, 0, 0.04), colors: { c1: "#f4efe6" } },
      { id: "cat", type: "cat", pos: P(-1.0, 0, 0.4), rot: -25 },
      { id: "string_lights", type: "string_lights", slot: "wall", pos: P(0, 2.05, -2.6), scale: 1.75, colors: { c1: "#ffcf8a" } },
      { id: "tv", type: "tv", slot: "wall", pos: P(-3, 1.2, -1.4), rot: 90, hidden: true },
      { id: "fish_tank", type: "fish_tank", pos: P(-2.5, 0, 0.2), rot: 90, hidden: true },
    ],
    props: { window: ["window"], shelf: ["bookcase"], plant: ["plant"], lamp: ["floor_lamp"], rug: ["rug"], lights: ["string_lights"], frames: ["frame_a", "frame_b"], clock: ["clock"], fireplace: ["fireplace", "candles"], cat: ["cat"], record_player: ["turntable"], kettle: ["kettle"], tv: ["tv"], fish_tank: ["fish_tank"] },
    stateProps: { curtains: { asset: "window", key: "curtains" } },
    companionSpots: { cat: [-1.0, 0, 0.4], drone: [1.0, 0, 0.3], goldfish: [1.6, 0, -2.4], plant_sprite: [0.9, 0, 0.5], vacuum: [0.8, 0, 0.9] },
  },
  studio: studioLike("#26272c"),
  glow: studioLike("#1b1c22", "studio", 0.9),

  desk: {
    size: INDOOR,
    architecture: { walls: walls(), wall: { material: "painted", color: "#3a3c42", trim: true, trimColor: "#26282d" }, floor: { material: "walnut_planks", color: "#6b4c38" }, outside: "city_night" },
    atmosphere: { mood: "warm_lamp", air: "dust", timeHour: 20 },
    assets: [
      A("desk", "desk_writing", 0.3, -2.18, { c: { c1: "#8a5e44", c2: "#2d3038" } }),
      On("lamp", "lamp_desk", "desk", -0.52, -0.12, { rot: 25, c: { c1: "#e0a458", c2: "#f4efe6" } }),
      On("tablet", "tablet_stand", "desk", 0.1, -0.08),
      On("mug", "mug", "desk", 0.42, 0.12),
      On("books", "books_stack", "desk", 0.55, -0.12, { rot: -10 }),
      On("globe", "globe", "desk", -0.25, -0.15),
      On("lava_lamp", "lava_lamp", "desk", -0.62, 0.12),
      A("chair", "chair_office", 0.6, -1.45, { rot: 160 }),
      A("plant", "monstera", -1.6, -2.1, { c: { c1: "#4d8a62", c2: "#8b9d86" } }),
      A("side_shelf", "shelf_low", 2.1, -2.41),
      On("radio", "radio", "side_shelf", -0.3, 0),
      On("record_player", "turntable", "side_shelf", 0.3, 0, { hidden: true }),
      On("kettle", "kettle", "side_shelf", 0.32, 0.02, { hidden: true }),
      W("clock", "clock_wall", -0.6, 1.75),
      W("frame_a", "frame_picture", 1.0, 1.5, { s: 0.7, c: { c2: "#8b9d86" } }),
      W("frame_b", "frame_picture", 1.45, 1.6, { s: 0.55, c: { c2: "#e0a458" } }),
      L("window", "window_french", -1.0, 0.85, { hidden: true }),
      L("blinds", "blinds", -1.0, 0.95, { hidden: true }),
      A("cat", "cat", -1.0, 0.45, { rot: -25, hidden: true }),
      A("rug", "rug_rect", 0.2, -0.5, { s: 0.8, c: { c1: "#4a5a52", c2: "#d9c29c" } }),
    ],
    props: { plant: ["plant"], mug: ["mug"], books: ["books"], lamp: ["lamp"], clock: ["clock"], tablet: ["tablet"], lava_lamp: ["lava_lamp"], record_player: ["record_player"], radio: ["radio"], cat: ["cat"], window: ["window"], blinds: ["blinds"], frames: ["frame_a", "frame_b"], globe: ["globe"], kettle: ["kettle"] },
  },

  podcast: {
    size: INDOOR,
    architecture: { walls: walls(), wall: { material: "painted", color: "#231f2e", trim: false, trimColor: "#15131b" }, floor: { material: "carpet", color: "#2a2433" } },
    atmosphere: { mood: "neon", air: "dust" },
    assets: [
      W("panels_a", "panels_acoustic", -1.6, 0.9, { c: { c1: "#3b2f5c" } }),
      W("panels_b", "panels_acoustic", 1.6, 0.9, { c: { c1: "#3b2f5c" } }),
      W("sign", "neon_sign", 0, 1.75, { c: { c1: "#ff3ea5" }, st: { text: "ON AIR" } }),
      A("desk", "desk_writing", -0.2, -1.9, { c: { c1: "#2d2a33", c2: "#15131b" } }),
      On("mic", "microphone", "desk", -0.25, 0.08, { rot: 15 }),
      On("mixer", "mini_synth", "desk", 0.25, 0.05, { c: { c1: "#3a3d46", c2: "#f8f5ee" } }),
      On("headphones", "headphones_stand", "desk", -0.58, -0.1),
      On("notes", "notebook", "desk", 0.55, 0.05, { rot: -12 }),
      On("mug", "mug", "desk", 0.62, -0.18),
      On("lava_lamp", "lava_lamp", "desk", 0.05, -0.2),
      A("chair", "chair_gaming", -0.2, -1.2, { rot: 180, c: { c2: "#7c66dc" } }),
      L("tv", "tv", -1.2, 1.35, { st: { on: true } }),
      A("shelf", "shelf_low", 2.2, -2.41, { c: { c1: "#2d2a33", c2: "#3b2f5c" } }),
      On("record_player", "turntable", "shelf", -0.25, 0),
      W("clock", "clock_wall", 1.6, 2.0, { s: 0.8 }),
      C("pendant_a", "pendant", -0.8, -1.2),
      C("pendant_b", "pendant", 0.6, -1.2),
      A("rug", "rug_rect", -0.2, -0.9, { s: 0.85, c: { c1: "#3b2f5c", c2: "#7c66dc" } }),
      A("lamp", "lamp_floor", -2.4, -1.8),
      A("plant", "monstera", 2.5, -1.4, { hidden: true }),
    ],
    props: { sign: ["sign"], panels: ["panels_a", "panels_b"], mic: ["mic"], pendants: ["pendant_a", "pendant_b"], plant: ["plant"], clock: ["clock"], tv: ["tv"], lava_lamp: ["lava_lamp"], record_player: ["record_player"], radio: ["mixer"], mug: ["mug"], books: ["notes"], rug: ["rug"], lamp: ["lamp"], headphones_stand: ["headphones"] },
  },

  bedroom: {
    size: INDOOR,
    architecture: { walls: walls(), wall: { material: "painted", color: "#3a3248", trim: true, trimColor: "#2a2434" }, floor: { material: "walnut_planks", color: "#6b4c3a" }, outside: "city_night" },
    atmosphere: { mood: "cozy", air: "dust", timeHour: 21.5 },
    assets: [
      A("bed", "bed", -1.0, -1.5, { c: { c1: "#c98bb8", c2: "#f8f5ee", c3: "#7a5640" } }),
      On("plush", "plush_bear", "bed", 0.35, -0.6, { surf: "mattress", rot: 20, s: 0.9 }),
      A("nightstand", "table_side", 0.25, -2.25),
      On("lava_lamp", "lava_lamp", "nightstand", -0.12, 0.05),
      On("bed_lamp", "lamp_desk", "nightstand", 0.12, -0.05, { rot: -30, c: { c1: "#c98bb8" } }),
      On("clock", "clock_wall", "nightstand", 0.05, 0.14, { s: 0.45 }),
      On("books", "books_stack", "nightstand", -0.1, 0.16, { s: 0.7 }),
      W("window", "window_arched", 1.55, 0.75, { c: { c2: "#6b4a6a" }, st: { curtains: true } }),
      W("lights", "string_lights", -0.6, 2.1, { s: 1.3, c: { c1: "#ffcf8a" } }),
      C("plant", "plant_hanging", 2.6, -2.1, 2.8),
      A("rug", "rug_round", 0.3, -0.2, { s: 0.9, c: { c1: "#c98bb8", c2: "#f3e6d2" } }),
      A("shelf", "shelf_low", 2.35, -0.9, { rot: -90 }),
      On("record_player", "turntable", "shelf", 0, -0.2),
      A("mirror", "mirror_floor", -2.6, -0.2, { rot: 90 }),
      A("cat", "cat", 1.3, 0.4, { rot: 200 }),
    ],
    scenery: ["rain_window"],
    props: { bed: ["bed"], window: ["window"], lights: ["lights"], lava_lamp: ["lava_lamp"], clock: ["clock"], plant: ["plant"], rug: ["rug"], books: ["books"], cat: ["cat"], record_player: ["record_player"], lamp: ["bed_lamp"], mirror: ["mirror"], plush: ["plush"] },
    stateProps: { curtains: { asset: "window", key: "curtains" } },
  },

  kitchen: {
    size: INDOOR,
    architecture: { walls: walls(), wall: { material: "tiles", color: "#e6dccb", trim: false, trimColor: "#c9b8a0" }, floor: { material: "checker", color: "#e8e2d4" }, outside: "garden_day" },
    atmosphere: { mood: "morning", air: "dust", timeHour: 9 },
    assets: [
      A("counter", "counter_kitchen", -0.6, -2.29, { c: { c1: "#6d9c7a", c2: "#e8e2d4", c3: "#d9b25a" } }),
      On("kettle", "kettle", "counter", -0.85, 0.02, { c: { c1: "#e05a47" } }),
      On("espresso", "espresso", "counter", -0.3, -0.05),
      On("herbs", "herb_pots", "counter", 0.15, -0.15),
      On("radio", "radio", "counter", -0.85 + 0.0, -0.18, { hidden: false, s: 0.8 }),
      W("window", "window_french", 0.95, 1.2, { s: 0.85, c: { c2: "#d97b6a" } }),
      W("clock", "clock_wall", -1.8, 1.9, { c: { c2: "#6d9c7a" } }),
      L("shelf", "wall_shelves", -1.2, 1.25),
      On("mug_a", "mug", "shelf", -0.3, 0.0, { surf: "shelf1" }),
      On("mug_b", "mug", "shelf", -0.1, 0.0, { surf: "shelf1", c: { c1: "#6d9c7a" } }),
      A("table", "bistro_table", 1.7, -1.1),
      On("fruit_bowl", "fruit_bowl", "table", 0, 0),
      A("chair", "chair_dining", 1.7, -0.5, { rot: 180 }),
      C("pendant_a", "pendant", -1.0, -1.8),
      C("pendant_b", "pendant", 0.0, -1.8),
      A("rug", "rug_runner", -0.5, -1.4, { s: 0.8, c: { c1: "#d9c29c", c2: "#6d9c7a" } }),
      A("cat", "cat", -1.6, 0.4, { hidden: true }),
    ],
    scenery: ["birds"],
    props: { counter: ["counter"], kettle: ["kettle"], espresso: ["espresso"], window: ["window"], plant: ["herbs"], clock: ["clock"], shelf: ["shelf"], mug: ["mug_a", "mug_b"], fruit_bowl: ["fruit_bowl"], pendants: ["pendant_a", "pendant_b"], radio: ["radio"], cat: ["cat"], rug: ["rug"] },
    stateProps: { curtains: { asset: "window", key: "curtains" } },
  },

  library: {
    size: INDOOR,
    architecture: { walls: walls(), wall: { material: "panelling", color: "#4a3428", trim: true, trimColor: "#2a1e18" }, floor: { material: "herringbone", color: "#6b4a34" }, outside: "garden_day" },
    atmosphere: { mood: "warm_lamp", air: "dust", timeHour: 19 },
    assets: [
      A("bookcase_a", "bookcase_tall", -1.95, -2.4, { c: { c1: "#4a3428", c2: "#4d8a62" } }),
      A("bookcase_b", "bookcase_tall", 1.95, -2.4, { c: { c1: "#4a3428", c2: "#8a3f3f" } }),
      A("ladder", "ladder_library", -1.3, -2.05, { rot: 0 }),
      W("window", "window_arched", 0, 0.75, { s: 0.9, c: { c1: "#4a3428", c2: "#4d8a62" } }),
      A("desk", "desk_writing", 0.15, -1.75, { s: 0.95, c: { c1: "#5a3d2b", c2: "#2a1e18" } }),
      On("lamp", "lamp_banker", "desk", -0.45, -0.1, { rot: 20 }),
      On("globe", "globe", "desk", 0.5, -0.1),
      On("tome", "tome_open", "desk", 0, 0.05),
      On("mug", "mug", "desk", -0.15, 0.2, { c: { c1: "#f4efe6" } }),
      L("fireplace", "fireplace", -0.9, 0, { c: { c1: "#8d877d", c2: "#4a3428" } }),
      A("armchair", "armchair", -1.9, 0.1, { rot: 70, c: { c1: "#8a3f3f", c2: "#4a3428" } }),
      A("rug", "rug_rect", -1.0, -0.6, { s: 0.8, rot: 90, c: { c1: "#6b2f2f", c2: "#d9b25a" } }),
      A("plant", "fern", 2.5, -1.2),
      A("telescope", "telescope", 2.2, 0.1, { rot: -30 }),
      W("clock", "clock_wall", 1.0, 2.05, { s: 0.8, c: { c2: "#d9b25a" } }),
      A("cat", "cat", -1.3, 0.6, { rot: 20 }),
    ],
    props: { bookcases: ["bookcase_a", "bookcase_b"], ladder: ["ladder"], desk_oak: ["desk"], lamp: ["lamp"], globe: ["globe"], clock: ["clock"], fireplace: ["fireplace"], armchair: ["armchair"], books: ["tome"], window: ["window"], plant: ["plant"], telescope: ["telescope"], mug: ["mug"], cat: ["cat"] },
    stateProps: { curtains: { asset: "window", key: "curtains" } },
  },

  greenhouse: {
    size: OPEN,
    architecture: { walls: open, openAir: true, floor: { material: "stone", color: "#a39684" }, outside: "garden_day" },
    atmosphere: { mood: "day", air: "petals", timeHour: 11 },
    assets: [
      A("arches", "pergola", 0, -1.3, { s: 1.2, c: { c1: "#e8e2d6" } }),
      A("monstera", "monstera", -2.3, -1.9, { s: 1.2 }),
      A("palm", "palm", 2.2, -2.0),
      C("hanging", "plants_hanging_trio", 0, -1.6, 2.9),
      A("bed_a", "flower_bed", -1.1, -2.1, { c: { c1: "#f472b6", c3: "#c47a5a" } }),
      A("bed_b", "flower_bed", 1.0, -2.2, { c: { c1: "#ffd34d", c3: "#c47a5a" } }),
      A("bench", "bench_wood", 1.9, -0.6, { rot: -90 }),
      On("can", "watering_can", "bench", 0.3, 0),
      On("teapot", "tea_set", "bench", -0.3, 0, { hidden: true }),
      A("lantern_a", "lantern_floor", -1.6, -0.6),
      A("lantern_b", "lantern_floor", 1.4, 0.6),
      A("fountain", "fountain", -1.9, 0.2, { s: 0.8 }),
      A("pond", "pond", 0.2, -0.9, { s: 0.7, hidden: true }),
      A("cat", "cat", -0.9, 0.7, { rot: -40, hidden: true }),
    ],
    props: { glass_roof: ["arches"], plant: ["monstera", "palm"], hanging_plants: ["hanging"], flowers: ["bed_a", "bed_b"], watering_can: ["can"], bench: ["bench"], lanterns: ["lantern_a", "lantern_b"], fountain: ["fountain"], fish_tank: ["pond"], kettle: ["teapot"], cat: ["cat"] },
    scenery: ["sun", "birds", "butterflies", "clock"],
  },

  rooftop: {
    size: OPEN,
    architecture: { walls: open, openAir: true, floor: { material: "deck", color: "#7a5e48" }, outside: "city_night" },
    atmosphere: { mood: "golden", air: "fireflies", timeHour: 19 },
    assets: [
      A("pergola", "pergola", 0, -1.4, { c: { c1: "#8a6a50" } }),
      A("lights", "string_lights", 0, -1.4, { y: 2.15, slot: "wall", s: 1.0, c: { c1: "#ffd34d" } }),
      A("sofa", "sofa", -1.4, -1.8, { c: { c1: "#c9b8a0", c2: "#f4efe6", c3: "#6b4a34" } }),
      A("table", "table_coffee", -1.4, -0.95, { s: 0.85 }),
      On("mug", "mug", "table", 0.15, 0),
      On("radio", "radio", "table", -0.2, 0, { s: 0.8 }),
      A("fire_pit", "fire_pit", 1.4, -1.2),
      A("planter_a", "flower_bed", -2.2, -0.2, { rot: 90, c: { c1: "#f472b6" } }),
      A("lantern_a", "lantern_floor", 2.3, -0.2),
      A("lantern_b", "lantern_floor", -0.3, -2.2),
      A("telescope", "telescope", 2.2, -2.1, { rot: -40 }),
      A("rug", "rug_rect", -1.2, -1.1, { s: 0.75, c: { c1: "#c47a5a", c2: "#ffd34d" } }),
      A("parapet", "fence", 0, -2.45, { s: 1.5, c: { c1: "#c9b8a0" } }),
      C("chimes", "wind_chimes", 1.0, -1.4, 2.5),
    ],
    props: { pergola: ["pergola"], lights: ["lights"], plant: ["planter_a"], lounge_chair: ["sofa"], fireplace: ["fire_pit"], lanterns: ["lantern_a", "lantern_b"], telescope: ["telescope"], radio: ["radio"], mug: ["mug"], rug: ["rug"], wind_chimes: ["chimes"] },
    scenery: ["skyline", "moon", "birds", "clock"],
  },

  workshop: {
    size: INDOOR,
    architecture: { walls: walls(), wall: { material: "concrete", color: "#5a606b", trim: false, trimColor: "#3a3d46" }, floor: { material: "concrete", color: "#6b6560" }, outside: "city_night" },
    atmosphere: { mood: "studio", air: "sparkles" },
    assets: [
      A("bench", "workbench", 0.2, -2.18, { c: { c1: "#b98a5e", c2: "#3a3d46" } }),
      W("pegboard", "pegboard", 0.2, 1.15, { c: { c2: "#e5484d" } }),
      On("printer", "printer_3d", "bench", 0.55, -0.05, { st: { on: true } }),
      On("screen_a", "monitor", "bench", -0.2, -0.1, { rot: 10 }),
      On("arm", "robot_arm", "bench", -0.65, 0.05),
      On("lamp", "lamp_desk", "bench", 0.1, 0.15, { rot: -20, c: { c1: "#f2c14e" } }),
      On("mug", "mug", "bench", -0.4, 0.22),
      On("blueprints", "blueprints", "bench", 0.25, 0.2, { rot: 15 }),
      A("shelf", "shelf_low", 2.2, -2.41, { c: { c1: "#3a3d46", c2: "#5a606b" } }),
      On("radio", "radio", "shelf", -0.3, 0),
      On("plasma", "lava_lamp", "shelf", 0.1, 0, { c: { c1: "#6ee7f9" } }),
      On("succulent", "succulents", "shelf", 0.38, 0),
      L("window", "window_picture", -1.1, 0.95, { s: 0.75, c: { c1: "#3a3d46", c2: "#5a606b" } }),
      L("blinds", "blinds", -1.1, 1.0, { hidden: false, s: 1.1 }),
      W("clock", "clock_wall", -1.6, 1.85, { c: { c2: "#3a3d46" } }),
      A("rack", "server_rack", -2.4, -2.0, { rot: 30 }),
      A("flask", "kettle", 2.0, -0.4, { hidden: true }),
    ],
    props: { workbench: ["bench"], pegboard: ["pegboard"], printer3d: ["printer"], tv: ["screen_a"], lamp: ["lamp"], clock: ["clock"], robot_arm: ["arm"], lava_lamp: ["plasma"], radio: ["radio"], plant: ["succulent"], mug: ["mug"], books: ["blueprints"], window: ["window"], blinds: ["blinds"], kettle: ["flask"] },
  },

  cabin: {
    size: INDOOR,
    architecture: { walls: walls(), wall: { material: "logs", color: "#8a5a36", trim: false, trimColor: "#3b281d" }, floor: { material: "pine_planks", color: "#9a6a44" }, outside: "snow" },
    atmosphere: { mood: "fireside", air: "embers", timeHour: 20 },
    assets: [
      A("fireplace", "fireplace", -0.3, -2.35, { c: { c1: "#8d877d", c2: "#5a3d2b" } }),
      On("kettle", "kettle", "fireplace", 0.48, 0, { c: { c1: "#2d3038" } }),
      A("logs", "log_rack", 0.95, -2.38),
      L("window", "window_french", -1.0, 0.85, { c: { c1: "#6b4a34", c2: "#c0392b" } }),
      A("rug", "rug_braided", 0, -0.7, { c: { c1: "#c0392b", c2: "#d9b98a" } }),
      A("armchair", "armchair", -2.0, -0.2, { rot: 60, c: { c1: "#a3433a", c2: "#5a3d2b" } }),
      A("table", "table_side", -2.15, -1.25),
      On("lantern", "lantern_floor", "table", 0, -0.05, { s: 0.7 }),
      On("journal", "notebook", "table", 0, 0.12, { s: 0.6 }),
      A("side", "table_side", 1.7, -1.0),
      On("mug", "mug", "side", 0.08, 0.05, { c: { c1: "#c0392b" } }),
      On("radio", "radio", "side", -0.05, -0.08, { s: 0.6 }),
      W("clock", "clock_wall", 1.6, 1.7, { c: { c2: "#5a3d2b" } }),
      A("plant", "fern", 2.4, -2.1),
      A("guitar", "guitar_stand", 2.3, -0.3, { rot: -40 }),
      A("cat", "cat", 0.6, -1.3, { rot: 160 }),
    ],
    props: { fireplace: ["fireplace"], log_rack: ["logs"], window: ["window"], rug: ["rug"], armchair: ["armchair"], kettle: ["kettle"], clock: ["clock"], lanterns: ["lantern"], cat: ["cat"], books: ["journal"], mug: ["mug"], plant: ["plant"], radio: ["radio"], guitar: ["guitar"] },
    stateProps: { curtains: { asset: "window", key: "curtains" } },
  },

  seaside: {
    size: OPEN,
    architecture: { walls: open, openAir: true, floor: { material: "sand", color: "#e6d3ad" }, outside: "sea" },
    atmosphere: { mood: "day", air: "bubbles", timeHour: 13 },
    assets: [
      A("palm_a", "palm", -2.3, -1.8, { s: 1.2 }),
      A("palm_b", "palm", 2.4, -2.1, { s: 1.0 }),
      A("chair", "deck_chair", 1.5, -0.9, { rot: -25, c: { c1: "#e05a47" } }),
      A("umbrella", "umbrella_beach", 1.6, -1.3, { c: { c1: "#e05a47" } }),
      A("lantern_a", "lantern_floor", -1.4, -0.3),
      A("lantern_b", "lantern_floor", -0.6, -2.1),
      A("table", "table_side", 2.4, -0.4, { c: { c1: "#f4efe6", c2: "#d9c29c" } }),
      On("radio", "radio", "table", -0.08, -0.08, { s: 0.6 }),
      On("drink", "mug", "table", 0.1, 0.1, { c: { c1: "#9fd6ff" } }),
      A("surfboard", "surfboard", -1.6, -1.6, { slot: "floor", rot: 10 }),
      A("shells", "shells", -0.8, -0.6),
    ],
    props: { palm: ["palm_a", "palm_b"], deck_chair: ["chair"], umbrella: ["umbrella"], lanterns: ["lantern_a", "lantern_b"], radio: ["radio"], surfboard: ["surfboard"], shells: ["shells"], mug: ["drink"] },
    scenery: ["ocean", "sun", "clouds", "birds", "lighthouse", "sailboat", "clock"],
  },

  campfire: {
    size: OPEN,
    architecture: { walls: open, openAir: true, floor: { material: "forest", color: "#3a4a2e" }, outside: "forest" },
    atmosphere: { mood: "fireside", air: "fireflies", timeHour: 22 },
    assets: [
      A("fire", "fire_pit", 0.3, -1.5),
      A("tent", "tent", -1.8, -2.0, { rot: 25, c: { c1: "#d9a65a" } }),
      A("tree_a", "pine_tree", -2.5, -1.0, { s: 1.0 }),
      A("tree_b", "pine_tree", 2.4, -2.1, { s: 1.2 }),
      A("tree_c", "pine_tree", 1.0, -2.4, { s: 0.85 }),
      A("seat_a", "log_seat", 1.6, -1.1, { rot: -70 }),
      A("seat_b", "log_seat", -0.8, -1.0, { rot: 60 }),
      On("kettle", "kettle", "seat_a", 0.35, 0, { c: { c1: "#3a3d46" } }),
      On("mug", "mug", "seat_b", -0.3, 0, { c: { c1: "#f4efe6" } }),
      A("lantern", "lantern_floor", -1.3, -1.5),
      A("lights", "string_lights", -1.8, -1.6, { y: 1.1, slot: "wall", s: 0.5, rot: 25 }),
      A("guitar", "guitar_stand", 2.0, -0.4, { rot: -50 }),
      A("pack", "backpack", -2.3, -0.4, { rot: 40 }),
      A("fox", "cat", 1.1, 0.5, { rot: 200, c: { c1: "#d9733a", c2: "#f4efe6" } }),
      A("telescope", "telescope", 2.3, -0.9, { rot: -60, hidden: true }),
    ],
    props: { fireplace: ["fire"], tent: ["tent"], trees: ["tree_a", "tree_b", "tree_c"], log_seat: ["seat_a", "seat_b"], kettle: ["kettle"], lanterns: ["lantern"], guitar: ["guitar"], mug: ["mug"], backpack_prop: ["pack"], cat: ["fox"], telescope: ["telescope"], lights: ["lights"] },
    scenery: ["moon", "stars_sky", "birds"],
  },

  cafe: {
    size: INDOOR,
    architecture: { walls: walls(), wall: { material: "brick", color: "#9a5a46", trim: true, trimColor: "#3a2a24" }, floor: { material: "checker", color: "#e8e2d4" }, outside: "city_night" },
    atmosphere: { mood: "cozy", air: "dust", timeHour: 19.5 },
    assets: [
      A("counter", "counter_kitchen", 0.9, -2.29, { c: { c1: "#4d8a62", c2: "#3a2a24", c3: "#d9b25a" } }),
      On("espresso", "espresso", "counter", -0.6, -0.08, { st: { on: true } }),
      On("pour_over", "kettle", "counter", -0.15, 0.05, { c: { c1: "#c4c9d2" } }),
      A("pastry", "pastry_case", 2.45, -1.35, { rot: -90, c: { c1: "#4d8a62" } }),
      L("window", "window_picture", -1.2, 0.85, { s: 0.85, c: { c1: "#3a2a24", c2: "#4d8a62" } }),
      W("sign", "neon_sign", -1.2, 1.6, { s: 0.8, c: { c1: "#ff6b9a" }, st: { text: "OPEN" } }),
      C("pendant_a", "pendant", 0.4, -1.8),
      C("pendant_b", "pendant", 1.4, -1.8),
      C("pothos", "plant_hanging", -2.4, -2.1),
      A("shelf", "wall_shelves", -0.2, -2.6, { y: 1.4, slot: "wall" }),
      On("record_player", "turntable", "shelf", -0.15, 0, { surf: "shelf2", s: 0.8 }),
      W("clock", "clock_wall", 2.1, 2.0),
      W("menu", "chalkboard", 0.9, 1.25, { s: 0.75 }),
      A("table", "bistro_table", -1.5, -0.9),
      On("latte", "mug", "table", 0.08, 0.05),
      A("chair_a", "chair_dining", -2.1, -0.9, { rot: 90 }),
      A("chair_b", "chair_dining", -0.9, -0.9, { rot: -90 }),
      A("cat", "cat", -2.2, 0.3, { rot: -20 }),
    ],
    props: { counter: ["counter"], espresso: ["espresso"], kettle: ["pour_over"], pastry_case: ["pastry"], window: ["window"], sign: ["sign"], pendants: ["pendant_a", "pendant_b"], plant: ["pothos"], record_player: ["record_player"], clock: ["clock"], chalkboard: ["menu"], bistro_table: ["table", "chair_a", "chair_b"], mug: ["latte"], cat: ["cat"] },
    scenery: ["rain_window"],
  },

  arcade: {
    size: INDOOR,
    architecture: { walls: walls(), wall: { material: "painted", color: "#241a3d", trim: false, trimColor: "#18122b" }, floor: { material: "carpet", color: "#1f1838" } },
    atmosphere: { mood: "neon", air: "sparkles" },
    assets: [
      A("cab_left", "arcade_cabinet", -1.8, -2.15, { c: { c1: "#5b4bb7", c2: "#5eead4" } }),
      A("cab_right", "arcade_cabinet", 1.8, -2.15, { c: { c1: "#c0337a", c2: "#f472b6" } }),
      W("sign", "neon_sign", 0, 1.7, { c: { c1: "#5eead4" }, st: { text: "HIGH SCORE" } }),
      A("crt", "tv_retro", 0.2, -2.2, { c: { c1: "#2a2440", c2: "#f472b6" } }),
      A("gacha", "gacha", -2.5, -0.9, { rot: 70 }),
      A("lava_table", "table_side", 2.5, -0.9, { c: { c1: "#2a2440", c2: "#15131b" } }),
      On("lava_lamp", "lava_lamp", "lava_table", -0.05, 0, { s: 1.4 }),
      On("soda", "mug", "lava_table", 0.14, 0.1, { c: { c1: "#f472b6" } }),
      W("clock", "clock_wall", 1.0, 2.0, { s: 0.8, c: { c1: "#15131b", c2: "#5eead4" } }),
      A("boombox", "speaker", -1.0, -2.3, { s: 0.7 }),
      A("rug", "rug_round", 0, -0.3, { s: 1.0, c: { c1: "#3b2f5c", c2: "#5eead4" } }),
      W("neon_a", "neon_bar", -1.2, 2.45, { c: { c1: "#f472b6" } }),
      W("neon_b", "neon_bar", 1.2, 2.45, { c: { c1: "#5eead4" } }),
      A("palm", "palm", -2.5, 0.3, { s: 0.8, c: { c1: "#5eead4", c2: "#c0337a" } }),
      A("plush", "plush_claw", -2.4, -0.45, { rot: 50 }),
      L("posters", "posters", -1.0, 1.1),
      L("hoop", "hoop_basketball", 0.4, 1.8),
    ],
    props: { arcade_left: ["cab_left"], arcade_right: ["cab_right"], sign: ["sign"], tv: ["crt"], lava_lamp: ["lava_table", "lava_lamp"], gacha: ["gacha"], clock: ["clock"], record_player: ["boombox"], rug: ["rug"], lights: ["neon_a", "neon_b"], plant: ["palm"], mug: ["soda"], plush: ["plush"], posters: ["posters"], basketball: ["hoop"] },
  },

  observatory: {
    size: INDOOR,
    architecture: { walls: walls(), wall: { material: "starwall", color: "#1c2140", trim: true, trimColor: "#3a2a20" }, floor: { material: "deck", color: "#5a4636" }, ceiling: { kind: "dome", color: "#1c2140" }, outside: "space" },
    atmosphere: { mood: "night", air: "stars", timeHour: 23 },
    assets: [
      A("telescope", "telescope", 1.5, -1.8, { s: 1.4, rot: -30 }),
      A("orrery", "orrery", -1.7, -1.9, { st: { on: true } }),
      W("chart", "star_chart", 0, 1.2, { c: { c1: "#1c2140", c2: "#d9b25a" } }),
      W("clock", "clock_wall", -1.0, 1.9, { c: { c2: "#d9b25a" } }),
      A("desk", "desk_writing", -0.2, -2.2, { s: 0.9, c: { c1: "#5a3d2b", c2: "#2a1e18" } }),
      On("atlases", "books_stack", "desk", 0.45, -0.05),
      On("lamp", "lamp_banker", "desk", -0.5, -0.1, { c: { c1: "#d98a3a" } }),
      On("globe", "globe", "desk", 0.05, -0.1, { c: { c1: "#2d3a6a" } }),
      On("tea", "tea_set", "desk", -0.05, 0.2, { s: 0.8 }),
      A("steps", "ladder_library", 2.5, -1.0, { rot: -90 }),
      A("plant", "fern", -2.5, -0.6),
      A("meteor_table", "table_side", -2.2, 0.3),
      On("meteor", "meteorite", "meteor_table", 0, 0),
      A("cat", "cat", 0.9, 0.5, { rot: 200 }),
    ],
    props: { dome_slit: [], telescope: ["telescope"], orrery: ["orrery"], star_chart: ["chart"], clock: ["clock"], books: ["atlases"], lamp: ["lamp"], globe: ["globe"], ladder: ["steps"], kettle: ["tea"], plant: ["plant"], cat: ["cat"], crystals: ["meteor_table", "meteor"] },
    scenery: ["planet", "moon"],
  },

  tatami: {
    size: INDOOR,
    architecture: { walls: walls(), wall: { material: "shoji", color: "#f1e7cf", trim: true, trimColor: "#5a4636" }, floor: { material: "tatami", color: "#b9ad7a" }, outside: "garden_day" },
    atmosphere: { mood: "golden", air: "petals", timeHour: 17.5 },
    assets: [
      W("shoji_a", "window_shoji", -1.2, 0.5, { c: { c2: "#5a4636" } }),
      W("shoji_b", "window_shoji", 1.2, 0.5, { c: { c2: "#5a4636" }, st: { open: true } }),
      A("chabudai", "chabudai", 0.1, -1.55),
      On("tea", "tea_set", "chabudai", 0.05, 0.05),
      On("matcha", "ramen_bowl", "chabudai", -0.28, -0.12, { st: { steam: false }, c: { c1: "#4d6a3a", c2: "#8fb86a" } }),
      A("cushion_a", "zabuton", -0.75, -1.55, { c: { c1: "#8a3f3f" } }),
      A("cushion_b", "zabuton", 0.95, -1.55, { c: { c1: "#8a3f3f" } }),
      L("scroll", "scroll_hanging", -1.4, 0.95),
      A("andon", "lantern_floor", -2.4, -2.1, { s: 1.2 }),
      A("low_shelf", "shelf_low", -2.45, -0.4, { rot: 90, s: 0.85, c: { c1: "#5a4636" } }),
      On("bonsai", "bonsai", "low_shelf", -0.2, 0),
      On("ikebana", "ikebana", "low_shelf", 0.3, 0),
      A("bamboo", "bamboo", 2.5, -2.2),
      A("basin", "pond", 1.9, -0.4, { s: 0.6 }),
      W("clock", "clock_wall", 0, 2.05, { s: 0.7, c: { c2: "#5a4636" } }),
      C("furin", "wind_chimes", 1.2, -2.2, 2.8),
      A("cat", "cat", -1.2, 0.5, { rot: -20, c: { c1: "#f4efe6", c2: "#d9733a" } }),
    ],
    props: { shoji: ["shoji_a", "shoji_b"], chabudai: ["chabudai"], kettle: ["tea"], bonsai: ["bonsai"], scroll: ["scroll"], lanterns: ["andon"], zabuton: ["cushion_a", "cushion_b"], bamboo: ["bamboo"], fish_tank: ["basin"], clock: ["clock"], flowers: ["ikebana"], mug: ["matcha"], cat: ["cat"], wind_chimes: ["furin"] },
    scenery: ["birds"],
  },

  spaceship: {
    size: INDOOR,
    architecture: { walls: walls(true, true, true), wall: { material: "concrete", color: "#2b3346", trim: false, trimColor: "#111622" }, floor: { material: "deck_plates", color: "#3a4356" }, ceiling: { kind: "flat", color: "#2b3346" }, outside: "space" },
    atmosphere: { mood: "neon", air: "stars" },
    assets: [
      W("viewport", "window_viewport", 0, 0.65, { c: { c2: "#5eead4" } }),
      A("holo", "holo_table", 0, -1.3, { st: { on: true } }),
      A("console_l", "console_bridge", -1.9, -1.9, { rot: 35 }),
      A("console_r", "console_bridge", 1.9, -1.9, { rot: -35, c: { c2: "#f472b6" } }),
      A("captain", "captain_chair", 0, -0.55, { rot: 180, c: { c2: "#5eead4" } }),
      L("screens", "tv", -0.6, 1.3, { c: { c1: "#2b3346" } }),
      W("clock", "clock_wall", -2.2, 2.0, { s: 0.7, c: { c1: "#15131b", c2: "#5eead4" } }),
      A("pod", "plant_shelf", 2.55, -0.4, { rot: -90, c: { c1: "#c4c9d2", c2: "#5eead4" } }),
      A("core_table", "table_side", -2.5, -0.5, { c: { c1: "#2b3346", c2: "#111622" } }),
      On("core", "lava_lamp", "core_table", -0.06, 0, { s: 1.4, c: { c1: "#5eead4", c2: "#c4c9d2" } }),
      On("mug", "mug", "core_table", 0.14, 0.1, { c: { c1: "#c4c9d2" } }),
      A("comms", "server_rack", 2.5, -1.6, { s: 0.8, rot: -90 }),
      W("strip_a", "neon_bar", -1.5, 0.15, { c: { c1: "#5eead4" } }),
      W("strip_b", "neon_bar", 1.5, 0.15, { c: { c1: "#5eead4" } }),
      A("cat", "cat", 1.2, 0.4, { rot: 200, c: { c1: "#c4c9d2", c2: "#3a4356" } }),
    ],
    props: { viewport: ["viewport"], holo_table: ["holo"], tv: ["screens"], console_l: ["console_l"], console_r: ["console_r"], captain_chair: ["captain"], clock: ["clock"], plant: ["pod"], lava_lamp: ["core_table", "core"], radio: ["comms"], lights: ["strip_a", "strip_b"], cat: ["cat"], mug: ["mug"] },
    scenery: ["planet", "moon"],
  },

  space: (() => {
    const ex = studioExtras();
    return {
      size: OPEN,
      architecture: { walls: open, openAir: true, floor: { material: "grid", color: "#0d1030" }, outside: "space", palette: { wall: "#070816", floor: "#0d1030", glow: "#6a5cff", detail: "#d98a5f" } },
      atmosphere: { mood: "night", air: "stars" },
      assets: [...ex.assets, A("console", "console_bridge", -2.0, -1.8, { rot: 35, hidden: true }), A("projector_table", "table_side", 2.2, -0.6, { hidden: true }), On("projector", "holo_projector", "projector_table", 0, 0, { hidden: true }), A("scope", "telescope", 2.3, -1.9, { rot: -30, hidden: true }), A("bay_a", "lantern_floor", -0.9, -2.2, { c: { c1: "#2b3346", c2: "#6a5cff" }, hidden: true }), A("bay_b", "lantern_floor", 0.9, -2.2, { c: { c1: "#2b3346", c2: "#6a5cff" }, hidden: true })],
      props: { ...ex.props, console: ["console"], holo: ["projector_table", "projector"], telescope: ["scope"], lights: ["bay_a", "bay_b"] },
      scenery: ["planet", "moon", "frame", "satellites", "asteroids", "comets"],
    };
  })(),

  garden: {
    size: OPEN,
    architecture: { walls: open, openAir: true, floor: { material: "grass", color: "#5f8f4e" }, outside: "hills" },
    atmosphere: { mood: "golden", air: "petals", timeHour: 18.5 },
    assets: [
      A("tree_a", "pine_tree", -2.4, -2.1, { s: 0.9, c: { c1: "#4d7a4c" } }),
      A("tree_b", "fig_tree", 2.3, -2.0, { s: 1.1 }),
      A("flowers_a", "flower_bed", -1.2, -2.0, { c: { c1: "#f06b8f", c3: "#8a5a33" } }),
      A("flowers_b", "flower_bed", 1.0, -2.2, { c: { c1: "#ffd34d", c3: "#8a5a33" } }),
      A("bench", "bench_wood", -1.8, -0.6, { rot: 70, hidden: true }),
      On("picnic", "tea_set", "bench", 0.3, 0, { hidden: true }),
      A("lantern_a", "lantern_floor", 1.6, -0.6, { hidden: true }),
      A("lantern_b", "lantern_floor", -0.8, -1.4, { hidden: true }),
      A("pond", "pond", 1.6, -1.3, { s: 0.8, hidden: true }),
      A("fence", "fence", 0, -2.45, { s: 1.4, hidden: true }),
      A("cat", "cat", -1.0, 0.6, { rot: -30, hidden: true }),
    ],
    props: { trees: ["tree_a", "tree_b"], flowers: ["flowers_a", "flowers_b"], bench: ["bench"], kettle: ["picnic"], lanterns: ["lantern_a", "lantern_b"], pond: ["pond"], fence: ["fence"], cat: ["cat"] },
    scenery: ["sun", "hills", "clouds", "birds", "windmill", "butterflies", "clock"],
  },

  city: {
    size: OPEN,
    architecture: { walls: open, openAir: true, floor: { material: "glossy", color: "#1a1530" }, outside: "city_night" },
    atmosphere: { mood: "neon", air: "none", timeHour: 23 },
    assets: [
      A("street_lamp", "street_lamp", -2.2, -1.6, { hidden: true }),
      A("vending", "vending", 2.2, -1.9, { rot: -20, hidden: true }),
      A("plant", "palm", -2.4, -0.4, { s: 0.7, hidden: true }),
      A("boombox", "speaker", 1.8, -0.6, { s: 0.6, hidden: true }),
      A("tv", "tv_retro", -1.4, -2.1, { hidden: true }),
      C("lantern_a", "lantern_paper", -0.8, -1.6, 2.6, { c: { c1: "#ff6b6b" }, hidden: true }),
      C("lantern_b", "lantern_paper", 0.8, -1.8, 2.5, { c: { c1: "#ffd34d" }, hidden: true }),
      A("cat", "cat", -1.0, 0.5, { rot: -30, c: { c1: "#3a3a40", c2: "#1c1d22" }, hidden: true }),
    ],
    props: { street_lamp: ["street_lamp"], vending: ["vending"], plant: ["plant"], radio: ["boombox"], tv: ["tv"], lanterns: ["lantern_a", "lantern_b"], cat: ["cat"] },
    scenery: ["skyline", "moon", "neon", "rain_window", "traffic", "billboard", "clock", "birds"],
  },

  sky: {
    size: OPEN,
    architecture: { walls: open, openAir: true, floor: { material: "cloud", color: "#eef4fb" }, outside: "clouds" },
    atmosphere: { mood: "day", air: "none", timeHour: 12 },
    assets: [
      C("lantern_a", "lantern_paper", -1.2, -1.6, 2.6, { c: { c1: "#ffd9a0" }, hidden: true }),
      C("lantern_b", "lantern_paper", 1.3, -1.9, 2.4, { c: { c1: "#ffd9a0" }, hidden: true }),
      C("chimes", "wind_chimes", 0.6, -1.4, 2.3, { hidden: true }),
      A("sprout", "fern", -2.0, -1.4, { s: 0.8, hidden: true }),
      A("clock_table", "table_side", 2.0, -0.6, { c: { c1: "#f8f5ee", c2: "#c4d4ee" }, hidden: true }),
      On("clock", "clock_wall", "clock_table", 0, 0, { s: 0.8, hidden: true }),
      A("kitty", "cat", -1.0, 0.5, { c: { c1: "#f8f5ee", c2: "#c4d4ee" }, hidden: true }),
      A("tea_table", "table_side", -2.2, 0.0, { c: { c1: "#f8f5ee", c2: "#c4d4ee" }, hidden: true }),
      On("tea", "tea_set", "tea_table", 0, 0, { s: 0.8, hidden: true }),
      A("garland", "string_lights", 0, -2.2, { y: 1.8, slot: "wall", s: 1.4, hidden: true }),
    ],
    props: { lanterns: ["lantern_a", "lantern_b"], wind_chimes: ["chimes"], plant: ["sprout"], clock: ["clock_table", "clock"], cat: ["kitty"], kettle: ["tea_table", "tea"], lights: ["garland"] },
    scenery: ["sun", "clouds", "rainbow", "birds", "balloon_air", "kite", "arch", "stars_day"],
  },

  gradient: {
    size: OPEN,
    architecture: { walls: open, openAir: true, floor: { material: "none", color: "#000000" }, outside: "none", backdrop: { mode: "gradient", bg: "#3a4ea8", edge: "#c0507f", glow: 0, glowColor: "", mid: "", horizon: 0.4 } },
    atmosphere: { mood: "studio", air: "none", effects: { bokeh: false, shaft: false, rings: false, spot: true } },
    assets: [],
    props: {},
    effectProps: { spot: "spot" },
  },

  photo: {
    size: OPEN,
    architecture: { walls: open, openAir: true, floor: { material: "none", color: "#000000" }, outside: "photo" },
    atmosphere: { mood: "studio", air: "none" },
    assets: [],
    props: {},
  },

  green: { size: OPEN, architecture: { walls: open, openAir: true, floor: { material: "none", color: "#000000" }, outside: "none" }, atmosphere: { mood: "studio", air: "none" }, assets: [], props: {} },
  blue: { size: OPEN, architecture: { walls: open, openAir: true, floor: { material: "none", color: "#000000" }, outside: "none" }, atmosphere: { mood: "studio", air: "none" }, assets: [], props: {} },
};

for (const t of Object.values(REBUILT)) t.companionSpots ||= SPOTS;
