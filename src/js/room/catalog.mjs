// ---------- The room catalog: every thing that can be placed in a room ----------
// Pure data (no DOM, no three.js), shared by the page (Room Editor, renderer, behaviour engine) and the
// helper (sanitizing, the AI's room block). One entry per asset type:
//
//   id, label, category, tags            what it is and how it's found (tags come from TAGS, translated)
//   slots                                where it may go: floor | wall | surface | ceiling | stack
//   footprint {w, d}, height             meters at 1× (M); the robot is ~1.3 m tall
//   variants {S, M, L}, scale [min,max]  quick sizes and the size range
//   surfaces [{id, y, w, d, x?, z?}]     where other things can stand (local, y up from its bottom)
//   anchors {stand, look, grip, sit, lean, canvas, rest}   local [x, y, z]; +z is its front; stand on the floor
//   actions                              what the robot can do with it (choices.mjs ACTIONS)
//   colors [{key, label, def}]           up to three recolorable slots
//   overlap, blocksPath, fragile, movable, personalData
//   light {kind, color, intensity, distance, at}   a practical light (or null)
//   states {...}                         toggles it supports, with their defaults
//   build "category/id"                  its builder in src/js/room/render/assets/
//   from {builder, v1}                   the 0.7 Room Builder prop ids and 1.0 v1 kinds it replaces
//   pending                              true while its 3D builder isn't written yet (hidden in the editor)
//
// Origins: the bottom centre of the footprint; a wall thing's origin is the bottom centre of its back;
// a ceiling thing's origin is the point it hangs from (it extends down to -height).

export const CATEGORIES = [
  { id: "seating", label: "Seating", icon: "couch" },
  { id: "tables", label: "Tables & desks", icon: "desk" },
  { id: "storage", label: "Shelves & storage", icon: "books" },
  { id: "furniture", label: "Beds & more", icon: "moon" },
  { id: "plants", label: "Plants", icon: "leaf" },
  { id: "lights", label: "Lights", icon: "lamp" },
  { id: "tech", label: "Tech", icon: "tv" },
  { id: "decor", label: "Art & sculptures", icon: "palette" },
  { id: "wall", label: "Wall decor", icon: "image" },
  { id: "windows", label: "Windows & doors", icon: "window" },
  { id: "rugs", label: "Rugs & mats", icon: "rug" },
  { id: "kitchen", label: "Food & kitchen", icon: "mug" },
  { id: "toys", label: "Toys & games", icon: "puzzle" },
  { id: "music", label: "Instruments", icon: "music" },
  { id: "sports", label: "Sports & gear", icon: "ball" },
  { id: "study", label: "Books & study", icon: "book" },
  { id: "outdoor", label: "Outdoor", icon: "mountain" },
  { id: "companions", label: "Companions", icon: "paw" },
];

// Search words, translated with the rest (an English tag finds the German and Arabic labels too)
export const TAGS = [
  "table", "desk", "work", "chair", "seat", "sofa", "soft", "bed", "sleep", "shelf", "books", "storage", "plant", "green",
  "flower", "lamp", "light", "glow", "screen", "music", "game", "toy", "kid", "art", "picture", "wall", "window", "door",
  "rug", "floor", "kitchen", "drink", "food", "sport", "outdoor", "garden", "study", "science", "space", "cozy", "retro",
  "animal", "water", "fire", "winter", "summer", "neon", "wood", "metal", "glass", "paper", "personal", "tv", "tech",
];

// Entries whose 3D builder isn't written yet (hidden in the editor); the list shrinks to nothing by release
const PENDING = new Set([

]);

const DEFAULT_VARIANTS = { S: 0.85, M: 1, L: 1.15 };
const col = (pairs) => pairs.map(([label, def], i) => ({ key: `c${i + 1}`, label, def }));

// One entry, with the defaults filled in by slot
function entry(slot, id, label, category, w, d, height, colors, o = {}) {
  const slots = o.slots || [slot];
  const floorish = slots[0] === "floor";
  const anchors = {
    stand: floorish ? [0, 0, Math.round((d / 2 + 0.45) * 100) / 100] : null,
    look: [0, Math.round(height * (slot === "ceiling" ? -0.5 : 0.65) * 100) / 100, slot === "wall" ? 0.05 : 0],
    grip: null,
    sit: null,
    lean: null,
    canvas: null,
    rest: null,
    ...(o.anchors || {}),
  };
  const actions = o.actions || (slot === "ceiling" ? ["look"] : slot === "wall" ? ["look", "go", "point"] : ["look", "go", "touch"]);
  return {
    id,
    label,
    category,
    tags: o.tags || [],
    slots,
    footprint: { w, d },
    height,
    variants: o.variants || DEFAULT_VARIANTS,
    scale: o.scale || [0.6, 1.6],
    surfaces: o.surfaces || [],
    anchors,
    actions,
    colors: col(colors),
    overlap: Boolean(o.overlap),
    blocksPath: o.blocksPath ?? (floorish && slot !== "wall"),
    fragile: Boolean(o.fragile),
    movable: Boolean(o.movable),
    personalData: Boolean(o.personalData),
    light: o.light || null,
    states: o.states || {},
    build: `${category}/${id}`,
    since: o.since || "1.1",
    from: { builder: o.builder || [], v1: o.v1 || [] },
    hero: Boolean(o.hero),
    pending: PENDING.has(id),
    ...(o.extra || {}),
  };
}
const floor = (...a) => entry("floor", ...a);
const surface = (...a) => entry("surface", ...a);
const wall = (...a) => entry("wall", ...a);
const ceiling = (...a) => entry("ceiling", ...a);

const top = (y, w, d, extra = {}) => ({ id: "top", y, w, d, ...extra });
const warm = (intensity = 1.2, distance = 3.2, at = [0, 1, 0]) => ({ kind: "point", color: "#ffc98a", intensity, distance, at });
const lit = (hex, intensity, distance, at) => ({ kind: "point", color: hex, intensity, distance, at });

const WOOD = "#b07a4a";
const DARK = "#2d3038";
const CREAM = "#ede4d6";
const BRASS = "#d9b25a";
const LEAF = "#4d8a62";
const TERRACOTTA = "#c47a5a";

export const CATALOG = [
  // ===== The hero set (built first; §8.6.1) =====
  floor("desk_writing", "Writing desk", "tables", 1.4, 0.7, 0.76, [["Wood", WOOD], ["Legs", DARK]], {
    hero: true, tags: ["desk", "table", "work", "wood"], surfaces: [top(0.76, 1.36, 0.66)],
    anchors: { stand: [0, 0, 0.78], look: [0, 0.82, 0], lean: [0, 0, 0.42] }, actions: ["look", "go", "touch", "lean", "write"],
    builder: ["oak_desk"], v1: ["desk_table"], scale: [0.7, 1.4],
  }),
  floor("desk_standing", "Standing desk", "tables", 1.2, 0.65, 1.05, [["Top", "#d9c3a0"], ["Frame", DARK]], {
    hero: true, tags: ["desk", "table", "work"], surfaces: [top(1.05, 1.16, 0.61)],
    anchors: { stand: [0, 0, 0.72], look: [0, 1.1, 0], lean: [0, 0, 0.38] }, actions: ["look", "go", "touch", "lean", "write"], scale: [0.7, 1.3],
  }),
  floor("chair_office", "Office chair", "seating", 0.62, 0.62, 1.0, [["Cushion", "#3d4a5c"], ["Frame", DARK]], {
    hero: true, tags: ["chair", "seat", "work"], anchors: { stand: [0, 0, 0.75], look: [0, 0.6, 0], sit: [0, 0.47, 0.02] },
    actions: ["look", "go", "touch", "sit"], v1: ["study_chair"], scale: [0.8, 1.2],
  }),
  floor("chair_dining", "Dining chair", "seating", 0.46, 0.5, 0.86, [["Wood", WOOD], ["Seat", "#c9a27a"]], {
    hero: true, tags: ["chair", "seat", "wood", "kitchen"], anchors: { stand: [0, 0, 0.7], look: [0, 0.55, 0], sit: [0, 0.45, 0.03] },
    actions: ["look", "go", "touch", "sit"], scale: [0.8, 1.2],
  }),
  floor("sofa", "Plush sofa", "seating", 2.0, 0.9, 0.82, [["Fabric", TERRACOTTA], ["Cushions", CREAM], ["Legs", "#4a3326"]], {
    hero: true, tags: ["sofa", "seat", "soft", "cozy"], anchors: { stand: [0, 0, 0.95], look: [0, 0.6, 0], sit: [0, 0.45, 0.08] },
    actions: ["look", "go", "touch", "sit"], builder: ["sofa_cozy"], scale: [0.7, 1.3],
  }),
  floor("armchair", "Bouclé armchair", "seating", 0.9, 0.85, 0.85, [["Fabric", CREAM], ["Legs", "#a3743f"]], {
    hero: true, tags: ["chair", "seat", "soft", "cozy"], anchors: { stand: [0, 0, 0.9], look: [0, 0.6, 0], sit: [0, 0.44, 0.06] },
    actions: ["look", "go", "touch", "sit"], builder: ["armchair_round"], scale: [0.8, 1.25],
  }),
  floor("pouf", "Knit floor pouf", "seating", 0.55, 0.55, 0.4, [["Knit", "#f08a73"]], {
    hero: true, tags: ["seat", "soft", "cozy"], anchors: { stand: [0, 0, 0.72], look: [0, 0.3, 0], sit: [0, 0.4, 0] },
    actions: ["look", "go", "touch", "sit"], builder: ["pouf_ottoman"], surfaces: [top(0.4, 0.4, 0.4)], scale: [0.7, 1.4],
  }),
  floor("bookcase", "Tall bookcase", "storage", 1.1, 0.34, 2.0, [["Wood", "#8a5a33"], ["Books", "#d9534f"]], {
    hero: true, tags: ["shelf", "books", "storage", "wood"],
    surfaces: [{ id: "shelf1", y: 0.55, w: 1.0, d: 0.28 }, { id: "shelf2", y: 1.05, w: 1.0, d: 0.28 }, { id: "shelf3", y: 1.55, w: 1.0, d: 0.28 }, top(2.0, 1.06, 0.3)],
    anchors: { stand: [0, 0, 0.62], look: [0, 1.2, 0] }, actions: ["look", "go", "touch", "read", "tidy"], builder: ["bookshelf_tall"], scale: [0.75, 1.2],
  }),
  floor("shelf_low", "Low shelf", "storage", 1.2, 0.38, 0.8, [["Wood", WOOD], ["Inside", "#e9dcc6"]], {
    hero: true, tags: ["shelf", "storage", "wood"], surfaces: [{ id: "shelf1", y: 0.4, w: 1.1, d: 0.32 }, top(0.8, 1.16, 0.36)],
    anchors: { stand: [0, 0, 0.64], look: [0, 0.6, 0], lean: [0, 0, 0.24] }, actions: ["look", "go", "touch", "lean", "tidy"], scale: [0.7, 1.4],
  }),
  floor("bed", "Cozy bed", "furniture", 1.5, 2.1, 1.0, [["Bedding", "#6f9cf5"], ["Pillows", "#f8f5ee"], ["Frame", WOOD]], {
    hero: true, tags: ["bed", "sleep", "soft", "cozy"], surfaces: [{ id: "mattress", y: 0.55, w: 1.4, d: 1.8, z: 0.1 }],
    anchors: { stand: [0.95, 0, 0.6], look: [0, 0.6, 0.2], sit: [0.62, 0.55, 0.55], rest: [0, 0.6, 0.3] }, actions: ["look", "go", "touch", "sit", "tidy"],
    builder: ["bed_cozy"], scale: [0.8, 1.15],
  }),
  floor("table_side", "Side table", "tables", 0.5, 0.5, 0.55, [["Wood", WOOD], ["Legs", DARK]], {
    hero: true, tags: ["table", "wood"], surfaces: [top(0.55, 0.46, 0.46)], anchors: { stand: [0, 0, 0.7], look: [0, 0.6, 0] }, scale: [0.7, 1.4],
  }),
  floor("table_coffee", "Coffee table", "tables", 1.1, 0.6, 0.42, [["Top", "#c89b6e"], ["Legs", "#4a3326"]], {
    hero: true, tags: ["table", "wood", "cozy"], surfaces: [top(0.42, 1.04, 0.54)], anchors: { stand: [0, 0, 0.75], look: [0, 0.45, 0] },
    builder: ["coffee_table"], scale: [0.7, 1.4],
  }),
  floor("rug_round", "Round rug", "rugs", 2.0, 2.0, 0.012, [["Base", "#c9744f"], ["Pattern", "#f3e6d2"]], {
    hero: true, tags: ["rug", "floor", "soft", "cozy"], overlap: true, blocksPath: false, actions: ["look"], builder: ["rug_round", "rug_sun"], scale: [0.5, 1.8],
  }),
  floor("rug_rect", "Rectangular rug", "rugs", 2.4, 1.7, 0.012, [["Base", "#5b6b8c"], ["Border", "#e8dcc6"]], {
    hero: true, tags: ["rug", "floor", "soft"], overlap: true, blocksPath: false, actions: ["look"], builder: ["rug_persian", "rug_check"], scale: [0.5, 1.8],
  }),
  floor("rug_runner", "Runner rug", "rugs", 2.6, 0.8, 0.012, [["Base", "#d9c29c"], ["Stripes", "#8a5a33"]], {
    hero: true, tags: ["rug", "floor"], overlap: true, blocksPath: false, actions: ["look"], builder: ["rug_runner"], scale: [0.5, 1.6],
  }),
  floor("monstera", "Monstera", "plants", 0.75, 0.75, 1.3, [["Leaves", LEAF], ["Pot", TERRACOTTA]], {
    hero: true, tags: ["plant", "green"], anchors: { stand: [0, 0, 0.8], look: [0, 0.9, 0] }, actions: ["look", "go", "touch", "water"],
    builder: ["monstera_pot"], states: { thirst: 0 }, fragile: false, scale: [0.6, 1.5],
  }),
  floor("fig_tree", "Fig tree", "plants", 0.7, 0.7, 1.8, [["Leaves", "#3d7552"], ["Pot", CREAM]], {
    hero: true, tags: ["plant", "green"], anchors: { stand: [0, 0, 0.8], look: [0, 1.2, 0] }, actions: ["look", "go", "touch", "water"],
    builder: ["ficus_tree"], states: { thirst: 0 }, scale: [0.6, 1.4],
  }),
  surface("succulents", "Succulent trio", "plants", 0.32, 0.12, 0.15, [["Plants", "#66bb6a"], ["Pots", "#f0ccb6"]], {
    hero: true, slots: ["surface", "floor"], tags: ["plant", "green"], actions: ["look", "go", "touch", "water"], builder: ["succulent_trio"], states: { thirst: 0 }, scale: [0.7, 1.6],
  }),
  surface("vase_flowers", "Flower vase", "plants", 0.2, 0.2, 0.46, [["Flowers", "#f472b6"], ["Vase", "#a9d0f5"]], {
    hero: true, slots: ["surface", "floor"], tags: ["flower", "plant", "glass"], actions: ["look", "go", "touch", "water"], fragile: true,
    builder: ["flower_vase"], v1: ["vase_flowers"], states: { thirst: 0 }, anchors: { grip: [0, 0.2, 0] }, scale: [0.7, 1.6],
  }),
  floor("lamp_floor", "Floor lamp", "lights", 0.42, 0.42, 1.6, [["Shade", "#efe2c8"], ["Stand", DARK]], {
    hero: true, tags: ["lamp", "light", "glow"], light: warm(1.4, 3.6, [0, 1.48, 0]), states: { on: true },
    anchors: { stand: [0, 0, 0.62], look: [0, 1.4, 0] }, actions: ["look", "go", "touch", "use"], builder: ["floor_lamp"], scale: [0.8, 1.2],
  }),
  surface("lamp_desk", "Desk lamp", "lights", 0.26, 0.26, 0.46, [["Shade", "#e05a47"], ["Arm", "#f8f5ee"]], {
    hero: true, slots: ["surface"], tags: ["lamp", "light", "desk", "work"], light: lit("#ffd9a8", 0.9, 2.2, [0, 0.38, 0.12]), states: { on: true },
    actions: ["look", "go", "touch", "use"], builder: ["desk_lamp"], scale: [0.7, 1.4],
  }),
  floor("whiteboard", "Whiteboard", "study", 1.3, 0.55, 1.85, [["Frame", "#d7dbe2"], ["Stand", DARK]], {
    hero: true, slots: ["floor", "wall"], tags: ["work", "study", "screen", "personal"], personalData: true,
    anchors: { stand: [0.85, 0, 0.6], look: [0, 1.3, 0.04], canvas: [0, 1.3, 0.05], grip: [0.55, 1.0, 0.08] },
    actions: ["look", "go", "point", "write", "tidy"], v1: ["whiteboard"], states: { style: "classic", mirror: false },
    extra: { styles: ["classic", "glass", "chalk", "cork", "dark", "paper", "neon"] }, scale: [0.7, 1.3],
  }),
  surface("books_stack", "Book stack", "study", 0.28, 0.22, 0.18, [["Covers", "#3b6fd6"], ["Accents", "#e05a47"]], {
    hero: true, slots: ["surface", "stack", "floor"], tags: ["books", "study", "paper"], actions: ["look", "go", "touch", "read", "carry", "put_back", "tidy"],
    movable: true, builder: ["book_stack"], anchors: { grip: [0, 0.12, 0] }, scale: [0.7, 1.5],
  }),
  surface("notebook", "Books and notebook", "study", 0.34, 0.26, 0.08, [["Notebook", "#4d8a62"], ["Books", "#c47a5a"]], {
    hero: true, tags: ["books", "study", "paper", "personal"], personalData: true, actions: ["look", "go", "touch", "read", "write"],
    v1: ["books_notebook"], states: { open: true, showNotes: false }, scale: [0.7, 1.4],
  }),
  surface("mug", "Mug", "kitchen", 0.12, 0.09, 0.1, [["Glaze", "#f4efe6"], ["Inside", "#6b4a34"]], {
    hero: true, slots: ["surface"], tags: ["drink", "kitchen", "cozy"], actions: ["look", "go", "touch", "carry", "put_back"], movable: true, fragile: true,
    builder: ["mug_coaster"], states: { steam: true }, anchors: { grip: [0, 0.06, 0] }, scale: [0.8, 1.5],
  }),
  surface("pen_cup", "Pen cup", "study", 0.1, 0.1, 0.17, [["Cup", "#3b4252"], ["Pens", "#f2c14e"]], {
    hero: true, tags: ["desk", "work"], actions: ["look", "go", "touch"], v1: ["pens_cup"], scale: [0.8, 1.5],
  }),
  surface("game_console", "Game console with controller", "tech", 0.42, 0.26, 0.09, [["Body", "#f4f4f4"], ["Accents", "#3b82f6"]], {
    hero: true, tags: ["game", "toy", "screen"], actions: ["look", "go", "touch", "play"], v1: ["gaming_console"], states: { on: false }, scale: [0.8, 1.4],
  }),
  surface("tv", "Television", "tech", 1.1, 0.24, 0.7, [["Frame", DARK], ["Stand", "#3a3d46"]], {
    hero: true, slots: ["surface", "wall"], tags: ["screen", "tv", "game"], actions: ["look", "go", "point", "use"], states: { on: true },
    light: lit("#9fc6ff", 0.6, 2.2, [0, 0.4, 0.2]), scale: [0.7, 1.5],
  }),
  surface("monitor", "Monitor", "tech", 0.62, 0.22, 0.46, [["Frame", "#25272d"], ["Screen glow", "#6f9cf5"]], {
    hero: true, tags: ["screen", "desk", "work"], actions: ["look", "go", "point", "use"], states: { on: true }, builder: ["widescreen_mon"], scale: [0.7, 1.5],
  }),
  wall("window_french", "French window", "windows", 1.75, 0.2, 1.6, [["Frame", "#efe9dd"], ["Curtains", "#c9744f"]], {
    hero: true, tags: ["window", "glass"], states: { curtains: true, open: false }, anchors: { look: [0, 0.75, 0.1] },
    builder: ["win_curtains", "win_garden", "win_city", "win_rain"], extra: { opening: { w: 1.08, h: 1.38, y: 0.06 }, mount: 0.85 }, scale: [0.7, 1.6],
  }),
  wall("window_picture", "Wide picture window", "windows", 2.55, 0.2, 1.45, [["Frame", "#e8e2d6"], ["Curtains", "#d9c29c"]], {
    hero: true, tags: ["window", "glass"], states: { curtains: false, open: false }, anchors: { look: [0, 0.68, 0.1] },
    builder: ["win_blinds"], extra: { opening: { w: 1.88, h: 1.23, y: 0.06 }, mount: 0.8 }, scale: [0.6, 1.5],
  }),
  wall("window_arched", "Arched window", "windows", 1.65, 0.2, 1.9, [["Frame", "#d8cfbf"], ["Curtains", "#6b4a6a"]], {
    hero: true, tags: ["window", "glass"], states: { curtains: true, open: false }, anchors: { look: [0, 0.9, 0.1] },
    builder: ["win_stained"], extra: { opening: { w: 0.98, h: 1.68, y: 0.06, arch: true }, mount: 0.75 }, scale: [0.7, 1.4],
  }),
  wall("clock_wall", "Wall clock", "wall", 0.34, 0.06, 0.34, [["Face", "#f8f5ee"], ["Rim", WOOD]], {
    hero: true, slots: ["wall", "surface"], tags: ["wall"], builder: ["wall_clock"], extra: { mount: 1.75 }, scale: [0.6, 2],
  }),
  wall("frame_picture", "Picture frame", "wall", 0.44, 0.035, 0.56, [["Frame", "#d8c9a6"], ["Picture", "#e8b65a"]], {
    hero: true, tags: ["picture", "art", "wall"], builder: ["framed_trio"], extra: { mount: 1.4 }, scale: [0.5, 2.2],
  }),
  wall("pinboard", "Pinboard", "wall", 0.9, 0.035, 0.62, [["Cork", "#c49a6c"], ["Frame", WOOD]], {
    hero: true, tags: ["wall", "work", "paper"], builder: ["cork_board"], extra: { mount: 1.2 }, scale: [0.6, 1.6],
  }),
  floor("plush_bear", "Teddy bear", "toys", 0.32, 0.26, 0.36, [["Fur", "#a3743f"], ["Snout", "#f0ccb6"]], {
    hero: true, slots: ["floor", "surface"], tags: ["toy", "soft", "kid", "cozy"], blocksPath: false, movable: true,
    actions: ["look", "go", "touch", "play", "carry", "put_back", "tidy"], builder: ["plush_bear"], anchors: { grip: [0, 0.2, 0] }, scale: [0.6, 2],
  }),
  floor("ball_bouncy", "Bouncy ball", "toys", 0.22, 0.22, 0.22, [["Ball", "#ff6b6b"], ["Stripe", "#ffd34d"]], {
    hero: true, slots: ["floor", "surface"], tags: ["toy", "game", "sport"], blocksPath: false, movable: true,
    actions: ["look", "go", "touch", "play", "carry", "put_back", "tidy"], v1: ["bouncy_ball"], builder: ["soccer_ball"], anchors: { grip: [0, 0.11, 0] }, scale: [0.6, 2],
  }),
  surface("puzzle_cube", "Puzzle cube", "toys", 0.07, 0.07, 0.07, [["Body", "#1f2330"]], {
    hero: true, slots: ["surface", "floor"], tags: ["toy", "game"], movable: true, blocksPath: false,
    actions: ["look", "go", "touch", "play", "carry", "put_back", "tidy"], v1: ["rubiks_cube"], anchors: { grip: [0, 0.035, 0] }, scale: [0.8, 2],
  }),

  // ===== Seating =====
  floor("bean_bag", "Bean bag", "seating", 0.85, 0.85, 0.7, [["Fabric", "#7c66dc"]], { tags: ["seat", "soft", "cozy"], anchors: { sit: [0, 0.38, 0.05] }, actions: ["look", "go", "touch", "sit"] }),
  floor("chair_gaming", "Gaming chair", "seating", 0.66, 0.66, 1.3, [["Seat", "#2d3038"], ["Accents", "#e5484d"]], { tags: ["chair", "seat", "game"], anchors: { sit: [0, 0.5, 0.02] }, actions: ["look", "go", "touch", "sit"] }),
  floor("bench_wood", "Wooden bench", "seating", 1.4, 0.45, 0.46, [["Wood", WOOD], ["Legs", "#5a3d2b"]], { tags: ["seat", "wood", "garden"], anchors: { sit: [0, 0.46, 0] }, actions: ["look", "go", "touch", "sit"], surfaces: [top(0.46, 1.34, 0.4)] }),
  floor("lounge_chair", "Terrace lounge chair", "seating", 0.8, 1.6, 0.75, [["Frame", "#c89b6e"], ["Cushion", "#ede4d6"]], { tags: ["seat", "outdoor", "summer"], anchors: { sit: [0, 0.4, 0.2] }, actions: ["look", "go", "touch", "sit"] }),
  floor("deck_chair", "Striped deck chair", "seating", 0.6, 1.1, 0.9, [["Stripes", "#e05a47"], ["Frame", "#d9c29c"]], { tags: ["seat", "outdoor", "summer"], anchors: { sit: [0, 0.38, 0.1] }, actions: ["look", "go", "touch", "sit"] }),
  floor("zabuton", "Floor cushions", "seating", 0.6, 0.6, 0.12, [["Cushion", "#8a3f3f"], ["Tassels", BRASS]], { tags: ["seat", "soft"], blocksPath: false, anchors: { sit: [0, 0.12, 0] }, actions: ["look", "go", "touch", "sit"] }),
  floor("log_seat", "Log bench", "seating", 1.2, 0.4, 0.42, [["Bark", "#6b4a34"], ["Cut wood", "#d9b98a"]], { tags: ["seat", "wood", "outdoor"], anchors: { sit: [0, 0.42, 0] }, actions: ["look", "go", "touch", "sit"] }),
  floor("captain_chair", "Command chair", "seating", 0.8, 0.8, 1.2, [["Seat", "#2b3346"], ["Trim", "#5eead4"]], { tags: ["chair", "seat", "space"], anchors: { sit: [0, 0.5, 0.05] }, actions: ["look", "go", "touch", "sit"] }),

  // ===== Tables =====
  floor("table_dining", "Dining table", "tables", 1.6, 0.9, 0.75, [["Top", WOOD], ["Legs", "#5a3d2b"]], { tags: ["table", "kitchen", "wood"], surfaces: [top(0.75, 1.56, 0.86)] }),
  floor("bistro_table", "Bistro table", "tables", 0.65, 0.65, 0.74, [["Top", "#f4efe6"], ["Base", DARK]], { tags: ["table", "kitchen", "drink"], surfaces: [top(0.74, 0.6, 0.6)] }),
  floor("chabudai", "Low tea table", "tables", 0.9, 0.9, 0.34, [["Wood", "#6b4a34"]], { tags: ["table", "wood"], surfaces: [top(0.34, 0.86, 0.86)] }),
  floor("workbench", "Heavy workbench", "tables", 1.8, 0.75, 0.9, [["Top", "#b98a5e"], ["Frame", "#3a3d46"]], { tags: ["table", "work", "wood"], surfaces: [top(0.9, 1.76, 0.71)], actions: ["look", "go", "touch", "lean"], anchors: { lean: [0, 0, 0.42] } }),
  floor("holo_table", "Holo-map table", "tables", 1.1, 1.1, 1.15, [["Body", "#2b3346"], ["Hologram", "#5eead4"]], { tags: ["space", "screen", "glow"], states: { on: true }, actions: ["look", "go", "touch", "use"] }),
  floor("platform", "Low stage platform", "furniture", 2.0, 1.4, 0.18, [["Top", "#3a3d46"], ["Edge light", "#6f9cf5"]], { tags: ["floor", "glow"], blocksPath: false, overlap: true, surfaces: [top(0.18, 2.0, 1.4)], actions: ["look", "go"] }),

  // ===== Storage =====
  floor("sideboard", "Mid-century cabinet", "storage", 1.4, 0.45, 0.72, [["Wood", "#8a5a33"], ["Handles", "#f2c14e"]], { builder: ["sideboard"], tags: ["storage", "wood"], surfaces: [top(0.72, 1.36, 0.41)], actions: ["look", "go", "touch", "use"], states: { open: false } }),
  floor("plant_shelf", "Plant shelf", "storage", 0.9, 0.35, 1.4, [["Frame", "#c89b6e"], ["Pots", TERRACOTTA]], { tags: ["shelf", "plant", "green"], surfaces: [{ id: "shelf1", y: 0.5, w: 0.86, d: 0.3 }, { id: "shelf2", y: 0.95, w: 0.86, d: 0.3 }, top(1.4, 0.86, 0.3)], actions: ["look", "go", "touch", "water"] }),
  wall("wall_shelves", "Wall shelves", "storage", 1.0, 0.24, 0.8, [["Wood", WOOD], ["Brackets", DARK]], { tags: ["shelf", "wall", "storage"], surfaces: [{ id: "shelf1", y: 0.02, w: 0.96, d: 0.22 }, { id: "shelf2", y: 0.42, w: 0.96, d: 0.22 }], extra: { mount: 1.2 }, builder: ["floating_shelf"] }),
  floor("counter_kitchen", "Kitchen counter", "kitchen", 2.2, 0.62, 0.92, [["Cabinets", "#6d9c7a"], ["Worktop", "#e8e2d4"], ["Handles", BRASS]], { tags: ["kitchen", "table", "storage"], surfaces: [top(0.92, 2.18, 0.6)], actions: ["look", "go", "touch", "lean", "use"], anchors: { lean: [0, 0, 0.36] } }),
  floor("pastry_case", "Pastry display", "kitchen", 1.1, 0.55, 1.05, [["Body", "#4d8a62"], ["Pastries", "#e8b65a"]], { tags: ["kitchen", "food", "glass"], surfaces: [top(1.05, 1.06, 0.5)] }),
  floor("log_rack", "Firewood stack", "storage", 0.8, 0.4, 0.9, [["Logs", "#8a5a36"], ["Rack", DARK]], { tags: ["wood", "fire", "winter"] }),
  floor("vending", "Vending machine", "tech", 0.9, 0.75, 1.85, [["Body", "#e5484d"], ["Glow", "#9fd6ff"]], { tags: ["drink", "neon", "retro"], states: { on: true }, actions: ["look", "go", "touch", "use"], light: lit("#9fd6ff", 0.5, 2, [0, 1.2, 0.4]) }),

  // ===== Beds & more =====
  floor("room_divider", "Room divider", "furniture", 1.6, 0.25, 1.75, [["Panels", "#f1e7cf"], ["Frame", "#6b4a34"]], { tags: ["wood", "paper"] }),
  floor("mirror_floor", "Floor mirror", "furniture", 0.6, 0.3, 1.7, [["Frame", BRASS]], { tags: ["glass"], actions: ["look", "go"] }),
  floor("charging_pad", "Charging pad", "furniture", 0.9, 0.9, 0.06, [["Pad", "#2d3038"], ["Light", "#6f9cf5"]], { tags: ["floor", "glow"], blocksPath: false, overlap: true, anchors: { stand: [0, 0, 0], rest: [0, 0.06, 0] }, actions: ["look", "go", "rest"] }),
  floor("tent", "A-frame tent", "outdoor", 1.8, 2.0, 1.5, [["Canvas", "#d9a65a"], ["Poles", "#6b4a34"]], { tags: ["outdoor", "sleep"] }),
  floor("cat_tree", "Cat tree", "furniture", 0.6, 0.6, 1.5, [["Carpet", "#c9b8a0"], ["Posts", "#d9c29c"]], { tags: ["animal", "soft"], surfaces: [{ id: "perch1", y: 0.7, w: 0.45, d: 0.4 }, top(1.5, 0.45, 0.45)] }),

  // ===== Plants =====
  floor("cactus", "Saguaro cactus", "plants", 0.5, 0.5, 1.3, [["Cactus", LEAF], ["Pot", BRASS]], { builder: ["cactus_tall"], tags: ["plant", "green", "summer"], actions: ["look", "go", "touch", "water"], states: { thirst: 0 } }),
  surface("bonsai", "Pine bonsai", "plants", 0.42, 0.28, 0.4, [["Pine", "#3b6e4c"], ["Dish", "#50555f"]], { builder: ["bonsai_dish"], tags: ["plant", "green"], actions: ["look", "go", "touch", "water"], states: { thirst: 0 } }),
  surface("terrarium", "Glass moss terrarium", "plants", 0.26, 0.26, 0.3, [["Glass", "#5eead4"], ["Moss", LEAF]], { builder: ["terrarium_orb"], tags: ["plant", "glass"], fragile: true }),
  ceiling("plant_hanging", "Hanging ivy basket", "plants", 0.45, 0.45, 0.8, [["Leaves", LEAF], ["Basket", "#a3743f"]], { builder: ["hanging_ivy"], tags: ["plant", "green"], actions: ["look", "water"], states: { thirst: 0 } }),
  ceiling("plants_hanging_trio", "Hanging plant trio", "plants", 1.0, 0.4, 0.9, [["Leaves", "#5f8f4e"], ["Pots", CREAM]], { tags: ["plant", "green"], actions: ["look", "water"], states: { thirst: 0 } }),
  floor("palm", "Potted palm", "plants", 1.0, 1.0, 1.7, [["Leaves", "#4d8a62"], ["Pot", "#d9c29c"]], { tags: ["plant", "green", "summer"], actions: ["look", "go", "touch", "water"], states: { thirst: 0 } }),
  floor("fern", "Boston fern", "plants", 0.8, 0.8, 0.45, [["Fronds", "#5f8f4e"], ["Pot", TERRACOTTA]], { tags: ["plant", "green"], actions: ["look", "go", "touch", "water"], states: { thirst: 0 } }),
  floor("herb_pots", "Herb pots", "plants", 0.5, 0.18, 0.28, [["Herbs", "#66bb6a"], ["Pots", TERRACOTTA]], { slots: ["surface", "floor"], tags: ["plant", "kitchen", "green"], blocksPath: false, actions: ["look", "go", "touch", "water"], states: { thirst: 0 } }),
  floor("flower_bed", "Blooming flower bed", "plants", 1.4, 0.6, 0.5, [["Flowers", "#f472b6"], ["Leaves", "#4d8a62"], ["Box", "#8a5a33"]], { tags: ["flower", "garden", "outdoor"], actions: ["look", "go", "touch", "water"], states: { thirst: 0 } }),
  floor("bamboo", "Bamboo grove", "plants", 1.0, 0.5, 2.4, [["Stems", "#7fa65a"], ["Leaves", "#4d8a62"]], { tags: ["plant", "garden", "outdoor"] }),
  floor("pine_tree", "Pine tree", "outdoor", 1.4, 1.4, 3.0, [["Needles", "#2f5a3e"], ["Trunk", "#6b4a34"]], { tags: ["plant", "outdoor", "winter"] }),
  surface("ikebana", "Ikebana arrangement", "plants", 0.3, 0.2, 0.5, [["Flowers", "#e05a47"], ["Dish", "#2d3038"]], { tags: ["flower", "art"], actions: ["look", "go", "touch", "water"], states: { thirst: 0 } }),

  // ===== Lights =====
  surface("lava_lamp", "Lava lamp", "lights", 0.16, 0.16, 0.46, [["Lava", "#f472b6"], ["Base", BRASS]], { builder: ["lava_lamp"], tags: ["lamp", "glow", "retro"], states: { on: true }, light: lit("#ff8fc8", 0.5, 1.6, [0, 0.3, 0]), actions: ["look", "go", "touch", "use"] }),
  ceiling("lantern_paper", "Paper lantern", "lights", 0.5, 0.5, 0.7, [["Paper", "#fff8ee"], ["Cord", "#2b2e35"]], { builder: ["paper_lantern"], tags: ["lamp", "light", "paper"], states: { on: true }, light: warm(1.0, 3.4, [0, -0.55, 0]) }),
  ceiling("pendant", "Pendant lamp", "lights", 0.4, 0.4, 0.9, [["Shade", "#d9b25a"], ["Cord", DARK]], { tags: ["lamp", "light", "kitchen"], states: { on: true }, light: warm(1.0, 3.0, [0, -0.8, 0]) }),
  wall("string_lights", "String lights", "lights", 3.0, 0.06, 0.5, [["Bulbs", "#ffd34d"], ["Wire", "#2b2e35"]], { builder: ["fairy_lights"], tags: ["light", "glow", "cozy"], states: { on: true }, extra: { mount: 2.1 }, scale: [0.4, 2] }),
  wall("neon_bar", "Neon light bar", "lights", 1.2, 0.06, 0.08, [["Neon", "#5eead4"], ["Mount", "#c084fc"]], { builder: ["neon_tube"], tags: ["neon", "glow", "light"], states: { on: true }, extra: { mount: 1.9 } }),
  wall("neon_sign", "Neon sign", "lights", 1.1, 0.06, 0.42, [["Neon", "#ff3ea5"], ["Backing", "#1d1a26"]], { builder: ["neon_sign"], tags: ["neon", "glow", "light"], states: { on: true, text: "ON AIR" }, extra: { mount: 1.65 } }),
  floor("fireplace", "Fireplace", "lights", 1.4, 0.5, 1.15, [["Stone", "#8d877d"], ["Mantel", "#6b4a34"]], { slots: ["floor", "wall"], builder: ["fireplace_hearth"], tags: ["fire", "winter", "cozy"], states: { on: true }, light: lit("#ff8542", 1.6, 4, [0, 0.35, 0.3]), surfaces: [top(1.15, 1.4, 0.32)], actions: ["look", "go", "touch", "use"] }),
  floor("fire_pit", "Fire pit", "outdoor", 0.9, 0.9, 0.45, [["Stones", "#8d877d"], ["Fire", "#ff8542"]], { tags: ["fire", "outdoor"], states: { on: true }, light: lit("#ff8542", 1.8, 4.5, [0, 0.4, 0]), actions: ["look", "go", "use"] }),
  surface("candles", "Pillar candles", "lights", 0.24, 0.16, 0.22, [["Wax", "#f8f5ee"], ["Flame", "#ffb074"]], { builder: ["candle_cluster"], tags: ["fire", "glow", "cozy"], states: { on: true }, light: lit("#ffb074", 0.4, 1.4, [0, 0.22, 0]), actions: ["look", "go", "use"] }),
  floor("lantern_floor", "Floor lantern", "lights", 0.3, 0.3, 0.6, [["Metal", "#2d3038"], ["Glow", "#ffc98a"]], { tags: ["lamp", "light", "outdoor"], states: { on: true }, light: warm(0.6, 2.2, [0, 0.35, 0]), blocksPath: false, actions: ["look", "go", "touch", "use"] }),
  floor("street_lamp", "Street lamp", "outdoor", 0.4, 0.4, 3.0, [["Post", "#2b2e35"], ["Glow", "#ffd98a"]], { tags: ["lamp", "outdoor"], states: { on: true }, light: warm(1.4, 5, [0, 2.8, 0]) }),
  surface("lamp_banker", "Banker's lamp", "lights", 0.36, 0.2, 0.42, [["Shade", "#2f7a52"], ["Base", BRASS]], { tags: ["lamp", "desk", "study"], states: { on: true }, light: lit("#ffd9a8", 0.8, 2, [0, 0.34, 0.06]), actions: ["look", "go", "touch", "use"] }),

  // ===== Tech =====
  floor("tv_retro", "Retro CRT television", "tech", 0.7, 0.55, 0.9, [["Case", TERRACOTTA], ["Screen", "#5eead4"]], { builder: ["retro_tv"], tags: ["screen", "tv", "retro"], states: { on: true }, actions: ["look", "go", "point", "use"] }),
  surface("turntable", "Vinyl turntable", "tech", 0.45, 0.35, 0.14, [["Wood", "#a3743f"], ["Platter", "#25272d"]], { builder: ["record_player"], tags: ["music", "retro"], states: { on: false }, actions: ["look", "go", "touch", "use"] }),
  surface("radio", "Tube radio", "tech", 0.42, 0.2, 0.28, [["Wood", "#8a5a33"], ["Dial", "#ffd34d"]], { builder: ["vintage_radio"], tags: ["music", "retro"], states: { on: false }, actions: ["look", "go", "touch", "use"] }),
  floor("arcade_cabinet", "Arcade cabinet", "tech", 0.7, 0.75, 1.75, [["Cabinet", "#5b4bb7"], ["Glow", "#5eead4"]], { builder: ["arcade_cab"], tags: ["game", "retro", "neon"], states: { on: true }, actions: ["look", "go", "touch", "play"], light: lit("#5eead4", 0.5, 1.8, [0, 1.3, 0.45]) }),
  surface("holo_projector", "Holo projector", "tech", 0.24, 0.24, 0.14, [["Base", "#2b2e35"], ["Hologram", "#5eead4"]], { builder: ["hologram_proj"], v1: ["holo_projector"], tags: ["space", "glow", "science"], states: { on: true }, actions: ["look", "go", "touch", "use"] }),
  floor("speaker", "Studio speaker", "tech", 0.32, 0.32, 0.95, [["Cabinet", "#25272d"], ["Cone", "#ffb074"]], { builder: ["studio_speaker"], tags: ["music"], actions: ["look", "go", "touch", "use"], states: { on: false } }),
  floor("server_rack", "Blinking mini server", "tech", 0.6, 0.6, 1.2, [["Case", "#2b2e35"], ["Lights", "#a3e635"]], { builder: ["server_rack"], tags: ["work", "glow"] }),
  surface("tablet_stand", "Tablet stand", "tech", 0.24, 0.16, 0.24, [["Tablet", "#2d3038"], ["Stand", "#c4c9d2"]], { tags: ["screen", "personal"], personalData: true, states: { on: true, showInbox: false }, actions: ["look", "go", "touch", "use"] }),
  surface("retro_handheld", "Retro handheld", "toys", 0.1, 0.16, 0.03, [["Case", "#c4c9d2"], ["Buttons", "#e5484d"]], { v1: ["retro_handheld"], tags: ["game", "retro", "toy"], movable: true, actions: ["look", "go", "touch", "play", "carry", "put_back"] }),
  surface("mini_synth", "Mini synthesizer", "music", 0.45, 0.2, 0.08, [["Body", "#f2c14e"], ["Keys", "#f8f5ee"]], { v1: ["mini_synth"], tags: ["music"], actions: ["look", "go", "touch", "play"] }),
  surface("microphone", "Studio microphone", "tech", 0.3, 0.3, 0.45, [["Mic", "#c4c9d2"], ["Arm", DARK]], { tags: ["music", "work"], actions: ["look", "go", "touch"] }),
  surface("headphones_stand", "Headphone stand", "tech", 0.18, 0.18, 0.32, [["Headphones", "#2d3038"], ["Stand", BRASS]], { tags: ["music"] }),
  surface("printer_3d", "3D printer", "tech", 0.45, 0.45, 0.5, [["Frame", "#3a3d46"], ["Filament", "#f2c14e"]], { slots: ["surface", "floor"], tags: ["work", "science"], states: { on: true }, actions: ["look", "go", "touch", "use"] }),
  surface("robot_arm", "Mini helper arm", "tech", 0.3, 0.3, 0.5, [["Arm", "#f2c14e"], ["Joints", DARK]], { tags: ["work", "science"], states: { on: true }, actions: ["look", "go", "touch", "use"] }),
  floor("console_bridge", "Bridge console", "tech", 1.2, 0.6, 1.0, [["Body", "#2b3346"], ["Screens", "#6f9cf5"]], { tags: ["space", "screen", "glow"], states: { on: true }, actions: ["look", "go", "touch", "use"] }),
  wall("projector_screen", "Projector screen", "tech", 2.0, 0.08, 1.3, [["Screen", "#f4f4f4"], ["Case", DARK]], { tags: ["screen", "wall"], states: { down: true }, extra: { mount: 0.9 } }),
  floor("aquarium", "Aquarium", "tech", 1.0, 0.4, 1.25, [["Cabinet", "#2d3038"], ["Water", "#6fc3e6"]], { tags: ["animal", "water", "glass"], fragile: true, states: { on: true }, light: lit("#6fc3e6", 0.4, 1.8, [0, 1.0, 0.25]), actions: ["look", "go", "touch"] }),
  floor("fish_tank", "Fish tank", "tech", 0.7, 0.35, 0.9, [["Stand", WOOD], ["Water", "#6fc3e6"]], { tags: ["animal", "water", "glass"], fragile: true, actions: ["look", "go", "touch"] }),

  // ===== Art & sculptures =====
  floor("easel", "Painter's easel", "decor", 0.7, 0.6, 1.7, [["Wood", "#c89b6e"], ["Painting", "#f08a73"]], { builder: ["easel_canvas"], tags: ["art", "picture", "wood"], actions: ["look", "go", "touch", "write"], anchors: { canvas: [0, 1.15, 0.12] } }),
  surface("sculpture_loop", "Brass loop sculpture", "decor", 0.24, 0.16, 0.4, [["Brass", BRASS], ["Base", DARK]], { builder: ["abstract_sculpture"], tags: ["art", "metal"] }),
  floor("amphora", "Hand-thrown vase", "decor", 0.4, 0.4, 0.75, [["Glaze", TERRACOTTA], ["Band", "#f4efe6"]], { builder: ["ceramic_amphora"], tags: ["art"], fragile: true }),
  ceiling("mobile_kinetic", "Kinetic mobile", "decor", 0.9, 0.9, 0.8, [["Shapes", "#f2c14e"], ["Accents", "#e05a47"]], { builder: ["kinetic_mobile"], tags: ["art", "kid"] }),
  surface("bust", "Classical bust", "decor", 0.28, 0.24, 0.5, [["Marble", CREAM], ["Plinth", "#c4c9d2"]], { builder: ["bust_statue"], tags: ["art"] }),
  surface("paper_crane", "Giant paper crane", "decor", 0.34, 0.3, 0.26, [["Paper", "#f4b6c8"], ["Wing tips", "#ffd34d"]], { builder: ["origami_crane"], tags: ["art", "paper"] }),
  surface("geode", "Amethyst geode", "decor", 0.24, 0.2, 0.22, [["Crystals", "#c084fc"], ["Rock", "#5b4bb7"]], { builder: ["crystal_cluster"], tags: ["art", "science"], actions: ["look", "go", "touch"] }),
  surface("sand_timer", "Brass sand timer", "decor", 0.12, 0.12, 0.26, [["Brass", BRASS], ["Sand", "#f6e08a"]], { builder: ["sand_timer"], tags: ["art", "study"], actions: ["look", "go", "touch", "use"] }),
  surface("globe", "Desk globe", "study", 0.3, 0.3, 0.42, [["Map", "#a9d0f5"], ["Stand", BRASS]], { builder: ["world_globe"], tags: ["study", "science"], actions: ["look", "go", "touch", "use"] }),
  floor("orrery", "Solar orrery", "study", 0.6, 0.6, 1.0, [["Brass", BRASS], ["Planets", "#7aa2f7"]], { tags: ["space", "science", "metal"], states: { on: true }, actions: ["look", "go", "touch", "use"] }),
  surface("meteorite", "Meteorite display", "study", 0.3, 0.24, 0.24, [["Rock", "#50555f"], ["Glass", "#a9d0f5"]], { tags: ["space", "science"] }),

  // ===== Wall decor =====
  wall("mirror_wall", "Arched brass mirror", "wall", 0.6, 0.04, 0.9, [["Frame", BRASS]], { builder: ["wall_mirror"], tags: ["glass", "wall"], extra: { mount: 1.1 } }),
  wall("macrame", "Woven wall hanging", "wall", 0.6, 0.04, 0.85, [["Cord", CREAM], ["Rod", WOOD]], { builder: ["macrame_hang"], tags: ["art", "wall", "soft"], extra: { mount: 1.3 } }),
  wall("calendar_wall", "Wall calendar", "wall", 0.36, 0.02, 0.5, [["Paper", "#f8f5ee"], ["Accent", "#e5484d"]], { builder: ["calendar_wall"], tags: ["wall", "paper", "personal"], personalData: true, states: { showEvents: false }, extra: { mount: 1.4 } }),
  wall("photo_frame", "Photo frame (your photos)", "wall", 0.4, 0.035, 0.32, [["Frame", "#2d3038"], ["Mat", "#f8f5ee"]], { slots: ["wall", "surface"], tags: ["picture", "wall", "personal"], personalData: true, states: { showPhotos: false }, extra: { mount: 1.45 } }),
  wall("panels_acoustic", "Sound panels", "wall", 1.2, 0.06, 1.0, [["Fabric", "#3b2f5c"], ["Frame", "#1d1a26"]], { tags: ["music", "wall", "soft"], extra: { mount: 0.9 } }),
  wall("scroll_hanging", "Hanging calligraphy", "wall", 0.45, 0.03, 1.2, [["Paper", "#f1e7cf"], ["Rod", "#6b4a34"]], { tags: ["art", "paper", "wall"], extra: { mount: 0.8 } }),
  wall("posters", "Retro posters", "wall", 1.2, 0.02, 0.8, [["Poster A", "#f472b6"], ["Poster B", "#5eead4"]], { tags: ["art", "retro", "wall"], extra: { mount: 1.2 } }),
  wall("star_chart", "Glowing star chart", "wall", 1.0, 0.03, 0.7, [["Chart", "#1c2140"], ["Stars", "#d9b25a"]], { tags: ["space", "study", "glow"], states: { on: true }, extra: { mount: 1.3 } }),
  wall("chalkboard", "Menu chalkboard", "wall", 0.8, 0.04, 1.0, [["Board", "#2f3b33"], ["Frame", WOOD]], { slots: ["wall", "floor"], tags: ["kitchen", "paper", "wall"], actions: ["look", "go", "point", "write"], extra: { mount: 1.0 } }),
  wall("pegboard", "Tool pegboard", "wall", 1.4, 0.05, 0.9, [["Board", "#c49a6c"], ["Tools", "#e5484d"]], { tags: ["work", "wall"], extra: { mount: 1.0 } }),
  wall("hoop_basketball", "Mini wall hoop", "sports", 0.5, 0.4, 0.45, [["Board", "#f8f5ee"], ["Rim", "#e8453c"]], { builder: ["basketball_hoop"], tags: ["sport", "game", "wall"], actions: ["look", "go", "play"], extra: { mount: 1.9 } }),
  wall("surfboard", "Striped surfboard", "sports", 0.55, 0.08, 2.0, [["Board", "#f6e08a"], ["Stripe", "#3b9be0"]], { slots: ["wall", "floor"], builder: ["surfboard_lean"], tags: ["sport", "summer"], extra: { mount: 0.05 } }),
  wall("bike_mount", "Road bike mount", "sports", 1.6, 0.25, 0.9, [["Frame", "#e05a47"], ["Tyres", "#2b2e35"]], { builder: ["bicycle_wall"], tags: ["sport", "metal"], extra: { mount: 1.0 } }),
  wall("guitar_wall", "Wall guitar", "music", 0.4, 0.1, 1.0, [["Body", "#c47a3a"], ["Neck", "#3a2a20"]], { tags: ["music", "wood"], actions: ["look", "go", "touch", "play"], extra: { mount: 1.1 } }),
  wall("wind_chimes", "Wind chimes", "decor", 0.25, 0.25, 0.6, [["Tubes", "#c4c9d2"], ["Top", WOOD]], { slots: ["ceiling", "wall"], tags: ["metal", "outdoor"], extra: { mount: 1.7 } }),

  // ===== Windows & doors =====
  wall("window_round", "Round window", "windows", 0.9, 0.14, 0.9, [["Frame", "#c4c9d2"]], { builder: ["win_space"], tags: ["window", "glass", "space"], states: { curtains: false }, extra: { opening: { w: 0.78, h: 0.78, y: 0.06, round: true }, mount: 1.1 } }),
  wall("window_shoji", "Shoji window", "windows", 1.4, 0.1, 1.4, [["Paper", "#f1e7cf"], ["Lattice", "#6b4a34"]], { builder: ["win_shoji"], tags: ["window", "paper", "wood"], states: { open: false }, extra: { opening: { w: 1.3, h: 1.3, y: 0.05 }, mount: 0.7 } }),
  wall("window_viewport", "Bridge viewport", "windows", 3.2, 0.2, 1.6, [["Frame", "#2b3346"], ["Trim", "#5eead4"]], { tags: ["window", "space", "glass"], extra: { opening: { w: 3.0, h: 1.4, y: 0.1 }, mount: 0.6 } }),
  wall("door", "Door", "windows", 0.9, 0.12, 2.05, [["Door", "#efe9dd"], ["Handle", BRASS]], { tags: ["door", "wood"], states: { open: false }, actions: ["look", "go", "touch", "use"], extra: { opening: { w: 0.86, h: 2.02, y: 0 }, mount: 0 } }),
  wall("blinds", "Window blinds", "windows", 1.2, 0.06, 1.4, [["Slats", "#e8e2d6"]], { tags: ["window"], states: { open: true }, actions: ["look", "go", "use"], extra: { mount: 0.9 } }),
  wall("curtains", "Curtains", "windows", 1.6, 0.1, 2.1, [["Fabric", "#c9744f"], ["Rod", DARK]], { tags: ["window", "soft"], states: { open: true }, actions: ["look", "go", "touch", "use"], extra: { mount: 0.2 } }),

  // ===== Rugs =====
  floor("rug_cloud", "Fluffy cloud rug", "rugs", 1.6, 1.1, 0.02, [["Fluff", "#f8f5ee"]], { builder: ["rug_cloud"], tags: ["rug", "soft", "kid"], overlap: true, blocksPath: false, actions: ["look"] }),
  floor("mat_yoga", "Exercise mat", "rugs", 1.8, 0.6, 0.01, [["Mat", "#7c66dc"]], { builder: ["mat_yoga"], tags: ["sport", "floor"], overlap: true, blocksPath: false, actions: ["look"] }),
  floor("mat_pebble", "Moss pebble mat", "rugs", 1.2, 0.8, 0.03, [["Moss", "#5f8f4e"], ["Pebbles", "#c4c9d2"]], { builder: ["mat_pebble"], tags: ["rug", "green", "garden"], overlap: true, blocksPath: false, actions: ["look"] }),
  floor("rug_braided", "Braided hearth rug", "rugs", 1.8, 1.2, 0.015, [["Braid", "#c0392b"], ["Braid 2", "#d9b98a"]], { tags: ["rug", "cozy", "winter"], overlap: true, blocksPath: false, actions: ["look"] }),

  // ===== Food & kitchen =====
  surface("kettle", "Steaming kettle", "kitchen", 0.24, 0.2, 0.24, [["Body", "#e05a47"], ["Handle", DARK]], { builder: ["kettle_steam"], tags: ["kitchen", "drink", "cozy"], states: { steam: true }, actions: ["look", "go", "touch", "use"] }),
  surface("espresso", "Espresso machine", "kitchen", 0.36, 0.34, 0.4, [["Body", "#c4c9d2"], ["Accents", "#2d3038"]], { builder: ["espresso_maker"], tags: ["kitchen", "drink"], states: { on: false }, actions: ["look", "go", "touch", "use"] }),
  surface("fruit_bowl", "Fruit bowl", "kitchen", 0.32, 0.32, 0.16, [["Bowl", "#f4efe6"], ["Fruit", "#e8453c"]], { builder: ["fruit_bowl"], tags: ["kitchen", "food"] }),
  surface("cake_stand", "Berry layer cake", "kitchen", 0.3, 0.3, 0.3, [["Cake", "#f4b6c8"], ["Stand", "#f8f5ee"]], { builder: ["cake_stand"], tags: ["food", "kitchen"] }),
  surface("ramen_bowl", "Steaming ramen bowl", "kitchen", 0.22, 0.22, 0.14, [["Bowl", "#e05a47"], ["Broth", "#f2c14e"]], { builder: ["ramen_bowl"], tags: ["food", "kitchen"], states: { steam: true } }),
  surface("tea_set", "Cast-iron tea set", "kitchen", 0.36, 0.24, 0.2, [["Iron", "#2d3038"], ["Cups", "#c4c9d2"]], { builder: ["tea_set"], tags: ["drink", "kitchen"], states: { steam: true } }),
  surface("cookie_jar", "Glass cookie jar", "kitchen", 0.18, 0.18, 0.26, [["Glass", "#a9d0f5"], ["Cookies", "#c89b6e"]], { builder: ["cookie_jar"], tags: ["food", "glass"], fragile: true }),
  surface("watering_can", "Watering can", "plants", 0.36, 0.18, 0.28, [["Can", "#6d9c7a"]], { slots: ["surface", "floor"], tags: ["garden", "water"], movable: true, actions: ["look", "go", "touch", "carry", "put_back", "use"], anchors: { grip: [0, 0.26, 0] } }),

  // ===== Toys & games =====
  floor("toy_train", "Wooden train set", "toys", 0.95, 0.6, 0.12, [["Train", "#e05a47"], ["Track", "#ffd34d"]], { builder: ["toy_train"], tags: ["toy", "kid", "wood"], blocksPath: false, states: { on: false }, actions: ["look", "go", "touch", "play"] }),
  surface("chess", "Chess set", "toys", 0.4, 0.4, 0.1, [["Board", "#4a3326"], ["Pieces", "#f4efe6"]], { builder: ["chess_board"], tags: ["game", "study"], actions: ["look", "go", "touch", "play"] }),
  surface("tin_robot", "Tin wind-up robot", "toys", 0.12, 0.1, 0.2, [["Tin", "#6f9cf5"], ["Trim", "#e05a47"]], { builder: ["mini_robot"], tags: ["toy", "retro"], movable: true, actions: ["look", "go", "touch", "play", "carry", "put_back"] }),
  floor("gacha", "Capsule toy machine", "toys", 0.5, 0.45, 1.2, [["Body", "#e84a7f"], ["Globe", "#fff8ee"]], { builder: ["gacha_machine"], tags: ["toy", "game", "retro"], actions: ["look", "go", "touch", "play"] }),
  floor("blocks", "Wooden blocks", "toys", 0.4, 0.3, 0.3, [["Block A", "#ffd34d"], ["Block B", "#3b6fd6"]], { slots: ["floor", "surface"], builder: ["stacking_blocks"], v1: ["stacking_blocks"], tags: ["toy", "kid", "wood"], blocksPath: false, movable: true, actions: ["look", "go", "touch", "play", "tidy"] }),
  surface("snow_globe", "Snow globe", "toys", 0.14, 0.14, 0.18, [["Glass", "#a9d0f5"], ["Base", "#f8f5ee"]], { builder: ["snow_globe"], tags: ["toy", "winter", "glass"], fragile: true, actions: ["look", "go", "touch", "play"] }),
  surface("rocket_model", "Retro model rocket", "toys", 0.14, 0.14, 0.42, [["Body", "#e8453c"], ["Fins", "#f8f5ee"]], { builder: ["model_rocket"], tags: ["toy", "space", "retro"] }),
  surface("newtons_cradle", "Newton's cradle", "toys", 0.24, 0.14, 0.2, [["Frame", "#c4c9d2"], ["Base", DARK]], { v1: ["newtons_cradle"], tags: ["toy", "science", "metal"], actions: ["look", "go", "touch", "play"] }),
  floor("rc_drone", "RC drone", "toys", 0.3, 0.3, 0.1, [["Body", "#2d3038"], ["Lights", "#5eead4"]], { slots: ["floor", "surface"], v1: ["rc_drone"], tags: ["toy", "tech"], blocksPath: false, movable: true, actions: ["look", "go", "touch", "play", "carry", "put_back"] }),
  surface("plush_claw", "Claw-machine plush", "toys", 0.2, 0.16, 0.22, [["Plush", "#f472b6"]], { slots: ["surface", "floor"], tags: ["toy", "soft", "kid"], movable: true, actions: ["look", "go", "touch", "play", "carry", "put_back"] }),

  // ===== Instruments =====
  floor("guitar_stand", "Guitar on stand", "music", 0.45, 0.4, 1.05, [["Body", "#c47a3a"], ["Stand", DARK]], { builder: ["acoustic_stand"], tags: ["music", "wood"], actions: ["look", "go", "touch", "play"] }),
  floor("piano", "Upright piano", "music", 1.45, 0.6, 1.25, [["Wood", "#3a2a20"], ["Keys", "#f8f5ee"]], { builder: ["upright_piano"], tags: ["music", "wood"], surfaces: [top(1.25, 1.4, 0.5)], actions: ["look", "go", "touch", "play"] }),
  floor("synth_keys", "Analog synthesizer", "music", 1.1, 0.5, 0.9, [["Body", "#2d3038"], ["Knobs", "#f2c14e"]], { builder: ["synth_keys"], tags: ["music", "retro"], actions: ["look", "go", "touch", "play"] }),
  floor("cello", "Wooden cello", "music", 0.5, 0.45, 1.3, [["Wood", "#a35a2a"], ["Stand", DARK]], { builder: ["cello_stand"], tags: ["music", "wood"], actions: ["look", "go", "touch", "play"] }),
  floor("bongos", "Bongo drums", "music", 0.45, 0.35, 0.55, [["Shell", "#c89b6e"], ["Skin", "#f4efe6"]], { builder: ["bongo_drums"], tags: ["music"], actions: ["look", "go", "touch", "play"] }),
  surface("metronome", "Swinging metronome", "music", 0.12, 0.1, 0.24, [["Wood", "#6b4a34"], ["Arm", BRASS]], { builder: ["metronome"], tags: ["music"], states: { on: false }, actions: ["look", "go", "touch", "use"] }),
  surface("kalimba", "Thumb piano", "music", 0.18, 0.12, 0.05, [["Wood", "#c89b6e"], ["Tines", "#c4c9d2"]], { builder: ["kalimba"], tags: ["music", "wood"], movable: true, actions: ["look", "go", "touch", "play", "carry", "put_back"] }),
  floor("gramophone", "Brass horn gramophone", "music", 0.5, 0.5, 0.75, [["Horn", BRASS], ["Box", "#6b4a34"]], { slots: ["floor", "surface"], builder: ["gramophone"], tags: ["music", "retro"], states: { on: false }, actions: ["look", "go", "touch", "use"] }),

  // ===== Sports =====
  floor("skateboard", "Cruiser skateboard", "sports", 0.8, 0.22, 0.12, [["Deck", "#f2c14e"], ["Wheels", "#e05a47"]], { builder: ["skateboard_prop"], tags: ["sport", "toy"], blocksPath: false, movable: true, actions: ["look", "go", "touch", "play"] }),
  floor("dumbbells", "Dumbbells", "sports", 0.4, 0.25, 0.12, [["Weights", "#5eead4"], ["Handles", "#2b2e35"]], { builder: ["dumbbell_pair"], tags: ["sport"], blocksPath: false }),
  floor("kettlebell", "Kettlebell", "sports", 0.22, 0.22, 0.28, [["Iron", "#25272d"], ["Handle", "#f08a73"]], { builder: ["kettlebell"], tags: ["sport", "metal"], blocksPath: false }),
  surface("trophy", "Championship cup", "sports", 0.2, 0.16, 0.36, [["Cup", "#f2c14e"], ["Base", "#4a3326"]], { builder: ["trophy_cup"], tags: ["sport", "metal"] }),
  floor("football", "Classic football", "sports", 0.22, 0.22, 0.22, [["Panels", "#f8f5ee"], ["Patches", "#25272d"]], { slots: ["floor", "surface"], tags: ["sport", "toy", "game"], blocksPath: false, movable: true, actions: ["look", "go", "touch", "play", "carry", "put_back", "tidy"], anchors: { grip: [0, 0.11, 0] } }),

  // ===== Books & study =====
  floor("telescope", "Brass telescope", "study", 0.7, 0.7, 1.4, [["Brass", BRASS], ["Tripod", "#2b2e35"]], { builder: ["brass_telescope"], tags: ["space", "science", "metal"], actions: ["look", "go", "touch", "use"] }),
  surface("typewriter", "Vintage typewriter", "study", 0.44, 0.32, 0.3, [["Body", "#4d8a62"], ["Keys", "#f8f5ee"]], { builder: ["typewriter"], tags: ["study", "retro", "work"], actions: ["look", "go", "touch", "write"] }),
  surface("tome_open", "Open illustrated tome", "study", 0.44, 0.3, 0.06, [["Cover", "#5b4bb7"], ["Pages", "#f6e08a"]], { builder: ["open_grimoire"], tags: ["books", "study", "paper"], actions: ["look", "go", "touch", "read"] }),
  surface("microscope", "Lab microscope", "study", 0.2, 0.22, 0.34, [["Body", "#e2e7ee"], ["Base", "#2b2e35"]], { builder: ["microscope"], tags: ["science", "study"], actions: ["look", "go", "touch", "use"] }),
  surface("quill_ink", "Calligraphy set", "study", 0.2, 0.14, 0.18, [["Quill", "#f8f5ee"], ["Ink", "#25272d"]], { builder: ["quill_ink"], tags: ["study", "paper"] }),
  surface("blueprints", "Rolled blueprints", "study", 0.4, 0.24, 0.16, [["Paper", "#f6e08a"], ["Ties", "#3b6fd6"]], { builder: ["scroll_rack"], tags: ["study", "work", "paper"] }),
  floor("ladder_library", "Library ladder", "study", 0.6, 0.5, 2.2, [["Wood", "#8a5a33"], ["Rail", BRASS]], { tags: ["books", "wood"] }),
  floor("bookcase_tall", "Floor-to-ceiling bookcase", "storage", 1.6, 0.38, 2.5, [["Wood", "#5a3d2b"], ["Books", "#4d8a62"]], { tags: ["shelf", "books", "storage"], surfaces: [{ id: "shelf1", y: 0.6, w: 1.5, d: 0.32 }, { id: "shelf2", y: 1.2, w: 1.5, d: 0.32 }, { id: "shelf3", y: 1.8, w: 1.5, d: 0.32 }], actions: ["look", "go", "touch", "read", "tidy"] }),

  // ===== Outdoor =====
  floor("pergola", "Wooden pergola", "outdoor", 3.0, 2.4, 2.5, [["Wood", "#8a6a50"]], { tags: ["outdoor", "wood", "garden"], blocksPath: false, overlap: true, actions: ["look"] }),
  floor("umbrella_beach", "Beach umbrella", "outdoor", 1.8, 1.8, 2.2, [["Canopy", "#e05a47"], ["Pole", "#f8f5ee"]], { tags: ["outdoor", "summer"], blocksPath: false, overlap: true }),
  floor("fountain", "Water fountain", "outdoor", 1.0, 1.0, 0.9, [["Stone", "#c4bdb0"], ["Water", "#6fc3e6"]], { tags: ["water", "garden", "outdoor"], states: { on: true }, actions: ["look", "go", "touch"] }),
  floor("fence", "Garden fence", "outdoor", 2.0, 0.1, 0.9, [["Pickets", "#f4efe6"]], { tags: ["garden", "outdoor", "wood"] }),
  floor("pond", "Lily pond", "outdoor", 1.6, 1.1, 0.12, [["Water", "#4a8fb0"], ["Lilies", "#f4b6c8"]], { tags: ["water", "garden", "outdoor"], overlap: true, actions: ["look", "go"] }),
  floor("shells", "Seashells & starfish", "outdoor", 0.6, 0.4, 0.06, [["Shells", "#f4d9c6"], ["Starfish", "#e8845a"]], { slots: ["floor", "surface"], tags: ["summer", "outdoor"], blocksPath: false, overlap: true }),
  floor("backpack", "Hiking pack", "outdoor", 0.4, 0.4, 0.7, [["Pack", "#c0392b"], ["Straps", "#2d3038"]], { tags: ["outdoor"], movable: false }),
  floor("lighthouse_model", "Lighthouse model", "outdoor", 0.5, 0.5, 1.4, [["Stripes", "#e05a47"], ["White", "#f8f5ee"]], { tags: ["outdoor", "glow", "summer"], states: { on: true } }),

  // ===== Companions (animated, with rules) =====
  floor("cat", "Sleeping cat", "companions", 0.45, 0.3, 0.22, [["Fur", "#e8a25a"], ["Stripes", "#a35a2a"]], { slots: ["floor", "surface"], tags: ["animal", "soft", "cozy"], blocksPath: false, fragile: true, states: { asleep: true }, actions: ["look", "go", "touch"], extra: { companion: true } }),
  floor("drone_mini", "Mini drone", "companions", 0.3, 0.3, 0.12, [["Body", "#2d3038"], ["Lights", "#5eead4"]], { tags: ["animal", "toy"], blocksPath: false, states: { on: true }, actions: ["look", "go", "play"], extra: { companion: true, floats: 1.2 } }),
  surface("goldfish", "Goldfish bowl", "companions", 0.26, 0.26, 0.26, [["Glass", "#a9d0f5"], ["Fish", "#f2992e"]], { slots: ["surface", "floor"], tags: ["animal", "water", "glass"], fragile: true, actions: ["look", "go", "touch"], extra: { companion: true } }),
  floor("plant_sprite", "Plant sprite", "companions", 0.25, 0.25, 0.35, [["Leaves", "#66bb6a"], ["Glow", "#d8ffb8"]], { tags: ["animal", "plant", "glow"], blocksPath: false, actions: ["look", "go", "play"], extra: { companion: true } }),
  floor("vacuum", "Robot vacuum", "companions", 0.34, 0.34, 0.09, [["Shell", "#f4f4f4"], ["Light", "#6f9cf5"]], { tags: ["animal", "tech"], blocksPath: false, states: { on: true }, actions: ["look", "go", "play"], extra: { companion: true, roams: true } }),
];

export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map((a) => [a.id, a]));
export const CATALOG_VERSION = `1.1-${CATALOG.length}`;

// Old ids → new type: the 0.7 Room Builder prop ids and the 1.0 v1 kinds
export const FROM_BUILDER = Object.fromEntries(CATALOG.flatMap((a) => a.from.builder.map((b) => [b, a.id])));
export const FROM_V1 = Object.fromEntries(CATALOG.flatMap((a) => a.from.v1.map((k) => [k, a.id])));

// Which part of the catalog the editor shows (the 3D builder exists)
export const placeable = () => CATALOG.filter((a) => !a.pending);

// The anchor of an asset entry scaled to an instance
export function anchorOf(def, name, scale = 1) {
  const a = def?.anchors?.[name];
  return a ? a.map((v) => v * scale) : null;
}

export function labels() {
  const out = new Set();
  for (const c of CATEGORIES) out.add(c.label);
  for (const t of TAGS) out.add(t);
  for (const a of CATALOG) {
    out.add(a.label);
    for (const c of a.colors) out.add(c.label);
  }
  return [...out];
}
