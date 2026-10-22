// ---------- Room Builder catalog and procedural room architecture ----------
// Pure data and sanitizers (no DOM, no three.js) for the Room Builder Studio tab.
// Defines 104 procedural props across 13 categories, snap slots (floor, wall,
// shelf, ceiling), procedural surface styles (walls, floor, ceiling, window),
// and lighting rigs.

export const HEX = /^#[0-9a-f]{6}$/i;

export const BUILDER_CATEGORIES = [
  { id: "furniture", label: "Furniture", icon: "🛋" },
  { id: "plants", label: "Plants", icon: "🌿" },
  { id: "tech", label: "Tech", icon: "🖥" },
  { id: "art", label: "Art & sculptures", icon: "🎨" },
  { id: "lights", label: "Lights", icon: "💡" },
  { id: "toys", label: "Toys & games", icon: "🧸" },
  { id: "windows", label: "Windows & views", icon: "🪟" },
  { id: "rugs", label: "Rugs & mats", icon: "🧶" },
  { id: "wall_decor", label: "Wall decor", icon: "🖼" },
  { id: "food_drinks", label: "Food & drinks", icon: "☕" },
  { id: "instruments", label: "Instruments", icon: "🎸" },
  { id: "sports", label: "Sports & gear", icon: "🏀" },
  { id: "books", label: "Books & study", icon: "📚" },
];

export const WALL_STYLES = [
  { id: "plaster", label: "Smooth plaster" },
  { id: "wainscot", label: "Wood wainscoting" },
  { id: "brick", label: "Warm brick" },
  { id: "slats", label: "Acoustic wood slats" },
  { id: "tiles", label: "Ceramic tiles" },
  { id: "shoji", label: "Shoji screens" },
  { id: "stone", label: "Cabin stone" },
  { id: "starwall", label: "Starlit mural" },
];

export const FLOOR_STYLES = [
  { id: "oak", label: "Warm oak planks" },
  { id: "herringbone", label: "Herringbone parquet" },
  { id: "tatami_mat", label: "Woven tatami" },
  { id: "terrazzo", label: "Speckled terrazzo" },
  { id: "checker", label: "Café checkerboard" },
  { id: "concrete", label: "Polished concrete" },
  { id: "carpet", label: "Plush carpet" },
  { id: "deck", label: "Terrace decking" },
];

export const CEILING_STYLES = [
  { id: "open", label: "Open loft" },
  { id: "beams", label: "Timber beams" },
  { id: "coffered", label: "Coffered panels" },
  { id: "skylight", label: "Glass skylight" },
  { id: "starry_dome", label: "Planetarium dome" },
  { id: "industrial", label: "Studio truss" },
];

export const WINDOW_STYLES = [
  { id: "arched", label: "Arched window" },
  { id: "picture", label: "Wide picture window" },
  { id: "porthole", label: "Round porthole" },
  { id: "french", label: "French panes" },
  { id: "shoji_win", label: "Sliding shoji window" },
  { id: "greenhouse_arch", label: "Conservatory glass" },
  { id: "none", label: "No built-in window" },
];

export const LIGHTING_RIGS = [
  { id: "cozy_warm", label: "Cozy evening", key: "#ffd4a6", fill: "#7088b8", rim: "#ffb074", ambient: 0.95 },
  { id: "daylight", label: "Bright daylight", key: "#fff8ee", fill: "#a8c8f0", rim: "#ffffff", ambient: 1.15 },
  { id: "golden_hour", label: "Golden sunset", key: "#ff9e5e", fill: "#8c6bb1", rim: "#ffd34d", ambient: 0.9 },
  { id: "moonlit", label: "Midnight moon", key: "#8bb4f8", fill: "#314168", rim: "#5eead4", ambient: 0.72 },
  { id: "cyber_neon", label: "Neon studio", key: "#5eead4", fill: "#c084fc", rim: "#f472b6", ambient: 0.85 },
  { id: "fireside", label: "Fireside glow", key: "#ff8542", fill: "#4a3525", rim: "#ffd34d", ambient: 0.8 },
  { id: "stage_spot", label: "Stage spotlight", key: "#ffffff", fill: "#3a465e", rim: "#6f9cf5", ambient: 0.75 },
];

// Helper to define catalog entries concisely
const p = (id, label, category, slot, shape, c1, c2, animated = false, interactive = false) => ({
  id, label, category, slot, shape, c1, c2, animated, interactive,
});

// 104 procedural props (8 per category across 13 categories)
export const BUILDER_CATALOG = [
  // 1. Furniture (8)
  p("sofa_cozy", "Plush sofa", "furniture", "floor", "sofa", "#c47a5a", "#ede4d6", false, true),
  p("armchair_round", "Bouclé armchair", "furniture", "floor", "armchair", "#ede4d6", "#a3743f", false, true),
  p("oak_desk", "Writing desk", "furniture", "floor", "desk", "#a3743f", "#2b2e35", false, false),
  p("coffee_table", "Pebble coffee table", "furniture", "floor", "table_low", "#c89b6e", "#4a3326", false, false),
  p("bookshelf_tall", "Tall bookcase", "furniture", "floor", "bookcase", "#8a5a33", "#d9534f", false, false),
  p("bed_cozy", "Cozy bed with pillows", "furniture", "floor", "bed", "#6f9cf5", "#f8f5ee", false, true),
  p("pouf_ottoman", "Knit floor pouf", "furniture", "floor", "pouf", "#f08a73", "#ede4d6", false, false),
  p("sideboard", "Mid-century cabinet", "furniture", "floor", "cabinet", "#8a5a33", "#f2c14e", false, true),

  // 2. Plants (8)
  p("monstera_pot", "Monstera deliciosa", "plants", "floor", "plant_tall", "#4d8a62", "#c47a5a", true, true),
  p("ficus_tree", "Indoor fig tree", "plants", "floor", "tree_pot", "#3d7552", "#ede4d6", true, true),
  p("hanging_ivy", "Hanging ivy basket", "plants", "ceiling", "plant_hang", "#4d8a62", "#a3743f", true, true),
  p("bonsai_dish", "Pine bonsai", "plants", "shelf", "bonsai", "#3b6e4c", "#50555f", true, true),
  p("succulent_trio", "Succulent trio", "plants", "shelf", "succulents", "#66bb6a", "#f0ccb6", false, true),
  p("cactus_tall", "Saguaro cactus", "plants", "floor", "cactus", "#4d8a62", "#d9b25a", false, true),
  p("flower_vase", "Tulip bouquet", "plants", "shelf", "vase_flowers", "#f472b6", "#a9d0f5", true, true),
  p("terrarium_orb", "Glass moss terrarium", "plants", "shelf", "terrarium", "#5eead4", "#4d8a62", true, true),

  // 3. Tech (8)
  p("retro_tv", "Retro CRT television", "tech", "floor", "tv", "#c47a5a", "#5eead4", true, true),
  p("widescreen_mon", "Curved monitor setup", "tech", "shelf", "monitor", "#25272d", "#6f9cf5", true, true),
  p("record_player", "Vinyl turntable", "tech", "shelf", "turntable", "#a3743f", "#25272d", true, true),
  p("vintage_radio", "Warm tube radio", "tech", "shelf", "radio", "#8a5a33", "#ffd34d", true, true),
  p("arcade_cab", "Arcade cabinet", "tech", "floor", "arcade", "#5b4bb7", "#5eead4", true, true),
  p("hologram_proj", "Holo projector", "tech", "shelf", "holo", "#2b2e35", "#5eead4", true, true),
  p("studio_speaker", "Studio monitor speaker", "tech", "floor", "speaker", "#25272d", "#ffb074", true, true),
  p("server_rack", "Blinking mini server", "tech", "floor", "server", "#2b2e35", "#a3e635", true, true),

  // 4. Art & sculptures (8)
  p("easel_canvas", "Painter's easel", "art", "floor", "easel", "#c89b6e", "#f08a73", false, true),
  p("abstract_sculpture", "Brass loop sculpture", "art", "shelf", "sculpture", "#d9b25a", "#2b2e35", true, false),
  p("ceramic_amphora", "Hand-thrown vase", "art", "floor", "amphora", "#c47a5a", "#f4efe6", false, false),
  p("kinetic_mobile", "Kinetic mobile", "art", "ceiling", "mobile", "#f2c14e", "#e05a47", true, true),
  p("bust_statue", "Classical bust", "art", "shelf", "bust", "#ede4d6", "#c4c9d2", false, false),
  p("origami_crane", "Giant paper crane", "art", "shelf", "crane", "#f4b6c8", "#ffd34d", true, false),
  p("crystal_cluster", "Amethyst geode", "art", "shelf", "crystal", "#c084fc", "#5b4bb7", true, true),
  p(" hourglass_art", "Brass sand timer", "art", "shelf", "hourglass", "#d9b25a", "#f6e08a", true, true).id ? p("sand_timer", "Brass sand timer", "art", "shelf", "hourglass", "#d9b25a", "#f6e08a", true, true) : null,

  // 5. Lights (8)
  p("floor_lamp", "Warm arc floor lamp", "lights", "floor", "lamp_floor", "#d9b25a", "#fff3b0", true, true),
  p("lava_lamp", "Groovy lava lamp", "lights", "shelf", "lava_lamp", "#f472b6", "#ffd34d", true, true),
  p("desk_lamp", "Architect desk lamp", "lights", "shelf", "lamp_desk", "#e05a47", "#fff8ee", true, true),
  p("paper_lantern", "Akari paper lantern", "lights", "ceiling", "lantern_ceil", "#fff8ee", "#2b2e35", true, true),
  p("fairy_lights", "Warm string lights", "lights", "wall", "string_lights", "#ffd34d", "#ffb074", true, true),
  p("neon_tube", "Neon light bar", "lights", "wall", "neon_bar", "#5eead4", "#c084fc", true, true),
  p("fireplace_hearth", "Crackling fireplace", "lights", "floor", "fireplace", "#50555f", "#ff8542", true, true),
  p("candle_cluster", "Pillar candles", "lights", "shelf", "candles", "#f8f5ee", "#ffb074", true, true),

  // 6. Toys & games (8)
  p("plush_bear", "Teddy bear", "toys", "floor", "plush", "#a3743f", "#f0ccb6", false, true),
  p("toy_train", "Wooden train set", "toys", "floor", "train_toy", "#e05a47", "#ffd34d", true, true),
  p("chess_board", "Chess set", "toys", "shelf", "chess", "#4a3326", "#f4efe6", false, true),
  p("mini_robot", "Tin wind-up robot", "toys", "shelf", "mini_bot", "#6f9cf5", "#e05a47", true, true),
  p("gacha_machine", "Capsule toy machine", "toys", "floor", "gacha", "#e84a7f", "#fff8ee", true, true),
  p("stacking_blocks", "Wooden blocks", "toys", "floor", "blocks", "#ffd34d", "#3b6fd6", false, false),
  p("snow_globe", "Winter snow globe", "toys", "shelf", "snowglobe", "#a9d0f5", "#f8f5ee", true, true),
  p("model_rocket", "Retro model rocket", "toys", "shelf", "rocket", "#e8453c", "#f8f5ee", true, true),

  // 7. Windows & views (8)
  p("win_city", "Night city window", "windows", "wall", "window_rect", "#2b3a67", "#ffd34d", true, true),
  p("win_garden", "Sunny garden window", "windows", "wall", "window_arch", "#a9d0f5", "#4d8a62", true, true),
  p("win_rain", "Rainy pane window", "windows", "wall", "window_rect", "#3a4a63", "#8bb4f8", true, true),
  p("win_space", "Orbital viewport", "windows", "wall", "window_round", "#16181d", "#5eead4", true, true),
  p("win_blinds", "Venetian blinds window", "windows", "wall", "window_blinds", "#ede4d6", "#ffb074", true, true),
  p("win_curtains", "Draped curtains window", "windows", "wall", "window_curtains", "#f08a73", "#fff8ee", true, true),
  p("win_stained", "Stained glass rose", "windows", "wall", "window_round", "#c084fc", "#ffd34d", true, false),
  p("win_shoji", "Glowing shoji lattice", "windows", "wall", "window_shoji", "#f8f5ee", "#8a5a33", true, true),

  // 8. Rugs & mats (8)
  p("rug_round", "Braided round rug", "rugs", "floor", "rug_circle", "#f0ccb6", "#c47a5a", false, false),
  p("rug_persian", "Patterned woven rug", "rugs", "floor", "rug_rect", "#c0392b", "#f2c14e", false, false),
  p("rug_cloud", "Fluffy cloud rug", "rugs", "floor", "rug_cloud", "#f8f5ee", "#e2e7ee", false, false),
  p("rug_check", "Checkerboard rug", "rugs", "floor", "rug_rect", "#4d8a62", "#f4efe6", false, false),
  p("rug_runner", "Striped hall runner", "rugs", "floor", "rug_runner", "#3b6fd6", "#ffd34d", false, false),
  p("mat_yoga", "Rolled exercise mat", "rugs", "floor", "rug_runner", "#c9b8f0", "#7a5cf0", false, false),
  p("rug_sun", "Sunburst rug", "rugs", "floor", "rug_circle", "#ffd34d", "#f08a73", false, false),
  p("mat_pebble", "Moss pebble mat", "rugs", "floor", "rug_cloud", "#4d8a62", "#a3e635", false, false),

  // 9. Wall decor (8)
  p("wall_clock", "Real-time wall clock", "wall_decor", "wall", "clock", "#f8f5ee", "#2b2e35", true, true),
  p("neon_sign", "Custom neon sign", "wall_decor", "wall", "sign", "#f472b6", "#5eead4", true, true),
  p("framed_trio", "Gallery print trio", "wall_decor", "wall", "frames", "#f4efe6", "#e05a47", false, false),
  p("cork_board", "Pinned memo board", "wall_decor", "wall", "board", "#c89b6e", "#ffd34d", false, true),
  p("wall_mirror", "Arched brass mirror", "wall_decor", "wall", "mirror", "#d9b25a", "#bfe3ff", false, false),
  p("macrame_hang", "Woven wall hanging", "wall_decor", "wall", "tapestry", "#f4efe6", "#c47a5a", true, false),
  p("floating_shelf", "Wall display shelf", "wall_decor", "wall", "wall_shelf", "#a3743f", "#4d8a62", false, false),
  p("calendar_wall", "Flip wall calendar", "wall_decor", "wall", "calendar", "#f8f5ee", "#e05a47", false, true),

  // 10. Food & drinks (8)
  p("kettle_steam", "Steaming tea kettle", "food_drinks", "shelf", "kettle", "#c9e5d6", "#2b2e35", true, true),
  p("espresso_maker", "Espresso machine", "food_drinks", "shelf", "espresso", "#c4c9d2", "#25272d", true, true),
  p("fruit_bowl", "Ceramic fruit bowl", "food_drinks", "shelf", "bowl_fruit", "#f8f5ee", "#f08a73", false, true),
  p("cake_stand", "Berry layer cake", "food_drinks", "shelf", "cake", "#f4b6c8", "#f8f5ee", false, true),
  p("ramen_bowl", "Steaming ramen bowl", "food_drinks", "shelf", "bowl_steam", "#e05a47", "#f6e08a", true, true),
  p("tea_set", "Cast-iron tea set", "food_drinks", "shelf", "teaset", "#2b2e35", "#4d8a62", true, true),
  p("cookie_jar", "Glass cookie jar", "food_drinks", "shelf", "jar", "#bfe3ff", "#a3743f", false, true),
  p("mug_coaster", "Hot cocoa mug", "food_drinks", "shelf", "mug", "#d9534f", "#f8f5ee", true, true),

  // 11. Instruments (8)
  p("acoustic_stand", "Guitar on stand", "instruments", "floor", "guitar", "#a3743f", "#2b2e35", false, true),
  p("upright_piano", "Cozy upright piano", "instruments", "floor", "piano", "#4a3326", "#f8f5ee", false, true),
  p("synth_keys", "Analog synthesizer", "instruments", "floor", "synth", "#25272d", "#5eead4", true, true),
  p("cello_stand", "Warm wooden cello", "instruments", "floor", "cello", "#8a5a33", "#2b2e35", false, true),
  p("bongo_drums", "Bongo drums", "instruments", "floor", "drums", "#c89b6e", "#f4efe6", false, true),
  p("metronome", "Swinging metronome", "instruments", "shelf", "metronome", "#8a5a33", "#d9b25a", true, true),
  p("kalimba", "Thumb piano", "instruments", "shelf", "kalimba", "#a3743f", "#c4c9d2", false, true),
  p("gramophone", "Brass horn gramophone", "instruments", "floor", "gramophone", "#d9b25a", "#5b3a1e", true, true),

  // 12. Sports & gear (8)
  p("basketball_hoop", "Mini wall hoop", "sports", "wall", "hoop", "#f8f5ee", "#e8453c", false, true),
  p("skateboard_prop", "Cruiser skateboard", "sports", "floor", "skateboard", "#3b6fd6", "#ffd34d", false, true),
  p("dumbbell_pair", "Neoprene dumbbells", "sports", "floor", "dumbbells", "#5eead4", "#2b2e35", false, false),
  p("soccer_ball", "Classic football", "sports", "floor", "ball_sport", "#f8f5ee", "#25272d", false, true),
  p("surfboard_lean", "Striped surfboard", "sports", "wall", "surfboard", "#f6e08a", "#3b9be0", false, false),
  p("kettlebell", "Cast kettlebell", "sports", "floor", "kettlebell", "#25272d", "#f08a73", false, false),
  p("trophy_cup", "Championship cup", "sports", "shelf", "trophy", "#f2c14e", "#4a3326", true, true),
  p("bicycle_wall", "Road bike mount", "sports", "wall", "bike", "#e05a47", "#2b2e35", false, false),

  // 13. Books & study (8)
  p("book_stack", "Stack of hardcovers", "books", "shelf", "books_stack", "#3b6fd6", "#e05a47", false, true),
  p("world_globe", "Spinning desk globe", "books", "shelf", "globe", "#a9d0f5", "#d9b25a", true, true),
  p("brass_telescope", "Stargazer telescope", "books", "floor", "telescope", "#d9b25a", "#2b2e35", true, true),
  p("typewriter", "Vintage typewriter", "books", "shelf", "typewriter", "#4d8a62", "#f8f5ee", false, true),
  p("open_grimoire", "Open illustrated tome", "books", "shelf", "open_book", "#5b4bb7", "#f6e08a", true, true),
  p("microscope", "Lab microscope", "books", "shelf", "microscope", "#e2e7ee", "#2b2e35", false, true),
  p("quill_ink", "Calligraphy set", "books", "shelf", "quill", "#f8f5ee", "#25272d", false, false),
  p("scroll_rack", "Rolled blueprints", "books", "shelf", "scrolls", "#f6e08a", "#3b6fd6", false, false),
];

export const CATALOG_BY_ID = Object.fromEntries(BUILDER_CATALOG.map((item) => [item.id, item]));

// Predefined snap slot positions in each zone so placed items arrange cleanly
export const SNAP_SLOTS = {
  floor: [
    [-1.25, 0, -0.8], [-0.65, 0, -0.95], [0.65, 0, -0.95], [1.25, 0, -0.8],
    [-1.35, 0, -0.15], [1.35, 0, -0.15], [-0.95, 0, 0.3], [0.95, 0, 0.3],
    [0, 0, -1.05], [-0.4, 0, 0.15], [0.4, 0, 0.15], [0, 0, 0.05],
  ],
  wall: [
    [-1.1, 1.55, -1.36], [-0.4, 1.65, -1.36], [0.4, 1.65, -1.36], [1.1, 1.55, -1.36],
    [0, 1.7, -1.36], [-1.5, 1.45, -0.6], [1.5, 1.45, -0.6],
  ],
  shelf: [
    [-1.05, 0.78, -0.85], [-0.55, 0.78, -0.95], [0.55, 0.78, -0.95], [1.05, 0.78, -0.85],
    [-1.1, 1.25, -1.25], [1.1, 1.25, -1.25], [0, 0.76, -0.98],
  ],
  ceiling: [
    [0, 2.38, -0.45], [-0.75, 2.38, -0.55], [0.75, 2.38, -0.55],
    [-0.5, 2.38, 0.05], [0.5, 2.38, 0.05],
  ],
};

export const MAX_BUILDER_ITEMS = 48;

export const DEFAULT_BUILDER = Object.freeze({
  enabled: false,
  wallStyle: "plaster",
  floorStyle: "oak",
  ceilingStyle: "open",
  windowStyle: "arched",
  lightingRig: "cozy_warm",
  items: [],
});

const oneOf = (list, value, fallback) => (list.some((e) => e.id === value) ? value : fallback);
const num = (v, min, max, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 1000) / 1000)) : def;
};
const color = (v, fallback) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : fallback);

export function sanitizeBuilderItem(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const def = CATALOG_BY_ID[raw.propId];
  if (!def) return null;
  const slot = ["floor", "wall", "shelf", "ceiling"].includes(raw.slot) ? raw.slot : def.slot;
  const snaps = SNAP_SLOTS[slot] || SNAP_SLOTS.floor;
  const snap = snaps[index % snaps.length];
  return {
    id: typeof raw.id === "string" && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : `item-${index + 1}`,
    propId: def.id,
    slot,
    x: num(raw.x, -2.2, 2.2, snap[0]),
    y: num(raw.y, 0, 2.6, snap[1]),
    z: num(raw.z, -1.5, 1.2, snap[2]),
    rotY: num(raw.rotY, -360, 360, 0),
    scale: num(raw.scale, 0.4, 2.2, 1),
    c1: color(raw.c1, def.c1),
    c2: color(raw.c2, def.c2),
    animated: typeof raw.animated === "boolean" ? raw.animated : def.animated,
    interactive: typeof raw.interactive === "boolean" ? raw.interactive : def.interactive,
  };
}

export function sanitizeBuilder(raw, base = DEFAULT_BUILDER) {
  const r = raw && typeof raw === "object" ? raw : {};
  const b = base && typeof base === "object" ? base : DEFAULT_BUILDER;
  const items = [];
  const seen = new Set();
  for (const entry of Array.isArray(r.items) ? r.items : Array.isArray(b.items) ? b.items : []) {
    const clean = sanitizeBuilderItem(entry, items.length);
    if (!clean || seen.has(clean.id)) continue;
    seen.add(clean.id);
    items.push(clean);
    if (items.length >= MAX_BUILDER_ITEMS) break;
  }
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : Boolean(b.enabled),
    wallStyle: oneOf(WALL_STYLES, r.wallStyle, oneOf(WALL_STYLES, b.wallStyle, "plaster")),
    floorStyle: oneOf(FLOOR_STYLES, r.floorStyle, oneOf(FLOOR_STYLES, b.floorStyle, "oak")),
    ceilingStyle: oneOf(CEILING_STYLES, r.ceilingStyle, oneOf(CEILING_STYLES, b.ceilingStyle, "open")),
    windowStyle: oneOf(WINDOW_STYLES, r.windowStyle, oneOf(WINDOW_STYLES, b.windowStyle, "arched")),
    lightingRig: oneOf(LIGHTING_RIGS, r.lightingRig, oneOf(LIGHTING_RIGS, b.lightingRig, "cozy_warm")),
    items,
  };
}

export function labels() {
  const out = new Set();
  for (const list of [
    BUILDER_CATEGORIES, WALL_STYLES, FLOOR_STYLES,
    CEILING_STYLES, WINDOW_STYLES, LIGHTING_RIGS, BUILDER_CATALOG,
  ]) {
    for (const item of list) if (item?.label) out.add(item.label);
  }
  return [...out];
}
