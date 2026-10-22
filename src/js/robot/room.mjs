// ---------- The robot's surroundings ----------
// Pure data and small functions (no DOM, no three.js), used by the page (the
// Robot Studio, the 3D room) and by the helper (which cleans what is saved).
// A room is one plain object:
//
//   place       which place it is in (PLACES)
//   colors      wall (the backdrop), floor, glow (the soft light behind the robot; "" =
//               its own light color), detail (the set's accent color)
//   light       the lighting mood (LIGHTS)
//   brightness  0.5 … 1.5
//   floor       glossy mirror, matte, glowing grid or no floor
//   air         what drifts through the air (AIRS), and airAmount
//   props       which pieces of the set are there (each place lists >=15 of its own)
//   companions  switchable room companions (cat, drone, goldfish, plant_sprite, vacuum)
//   timeMode    "manual" or "clock" (real-time day/night lighting & window sky)
//   timeHour    0 … 24 (manual hour when timeMode === "manual")
//   weatherSync whether the window reflects live weather when connected and not Private
//   season      seasonal or festival decoration set ("none", "auto", "spring", ...)
//   sign        the words on a neon sign
//   photo       how your own picture is shown: blur and dim (0 … 1)
//   builder     custom Room Builder configuration and placed props (room-catalog.mjs)
//
// The 3D pieces are made in room3d.js and places/*.js; every id here has one.

import { HEX } from "./design.mjs";
import { sanitizeBuilder, labels as builderLabels } from "./room-catalog.mjs";

// ---------- Choices ----------
export const LIGHTS = [
  { id: "auto", label: "Like the place", icon: "sparkles" },
  { id: "studio", label: "Studio", icon: "video" },
  { id: "day", label: "Daylight", icon: "sun" },
  { id: "golden", label: "Golden hour", icon: "sunrise" },
  { id: "evening", label: "Evening", icon: "moon" },
  { id: "night", label: "Night", icon: "moon" },
  { id: "neon", label: "Neon", icon: "bolt" },
  { id: "fireside", label: "Fireside", icon: "flame" },
];

// The three lights and the room's reflections for each mood: [color, strength]
export const LIGHT_MOODS = {
  studio: { key: ["#fff1e0", 1.75], fill: ["#dfe8ff", 0.55], rim: ["#ffffff", 1.5], env: 0.38 },
  day: { key: ["#fff6e8", 1.55], fill: ["#cfe3ff", 0.7], rim: ["#ffffff", 1.0], env: 0.45 },
  golden: { key: ["#ffc27a", 2.0], fill: ["#ffd9b8", 0.45], rim: ["#ffb067", 1.7], env: 0.4 },
  evening: { key: ["#ffb27a", 1.25], fill: ["#8c9eff", 0.65], rim: ["#b48cff", 1.4], env: 0.3 },
  night: { key: ["#9db4ff", 0.95], fill: ["#5a6bd1", 0.55], rim: ["#6ed3ff", 1.6], env: 0.22 },
  neon: { key: ["#ffd0ee", 1.3], fill: ["#5fd8ff", 0.8], rim: ["#a07cff", 1.9], env: 0.28 },
  fireside: { key: ["#ff9955", 1.85], fill: ["#7a5540", 0.5], rim: ["#ffd37a", 1.45], env: 0.34 },
};

export const FLOORS = [
  { id: "auto", label: "Like the place", icon: "sparkles" },
  { id: "glossy", label: "Glossy mirror", icon: "sparkles" },
  { id: "matte", label: "Matte", icon: "▭" },
  { id: "grid", label: "Glowing grid", icon: "▦" },
  { id: "none", label: "No floor", icon: "∅" },
];

export const AIRS = [
  { id: "none", label: "Nothing", icon: "∅" },
  { id: "dust", label: "Dust in the light", icon: "sparkles" },
  { id: "fireflies", label: "Fireflies", icon: "" },
  { id: "snow", label: "Snow", icon: "" },
  { id: "stars", label: "Twinkling stars", icon: "stars" },
  { id: "bubbles", label: "Bubbles", icon: "" },
  { id: "petals", label: "Petals", icon: "" },
  { id: "sparkles", label: "Sparkles", icon: "sparkles" },
  { id: "embers", label: "Embers", icon: "flame" },
  { id: "rain", label: "Rain", icon: "drop" },
  { id: "leaves", label: "Autumn leaves", icon: "" },
];

export const COMPANIONS = [
  { id: "cat", label: "Sleeping cat", icon: "🐱" },
  { id: "drone", label: "Mini drone", icon: "🛸" },
  { id: "goldfish", label: "Goldfish bowl", icon: "🐠" },
  { id: "plant_sprite", label: "Plant sprite", icon: "🌱" },
  { id: "vacuum", label: "Robot vacuum", icon: "🧹" },
];

export const TIME_MODES = [
  { id: "manual", label: "Fixed mood" },
  { id: "clock", label: "Follow real clock" },
];

export const SEASONS = [
  { id: "none", label: "None" },
  { id: "auto", label: "Automatic by date" },
  { id: "spring", label: "Spring blossoms" },
  { id: "summer", label: "Summer fireflies" },
  { id: "autumn", label: "Autumn leaves" },
  { id: "winter", label: "Winter lights" },
  { id: "christmas", label: "Christmas tree & garland" },
  { id: "halloween", label: "Halloween pumpkins" },
  { id: "new_year", label: "New Year lanterns & gold" },
  { id: "ramadan_eid", label: "Ramadan & Eid lanterns" },
];

const prop = (id, label, on = true) => ({ id, label, on });

// Shared supplementary room props so every 3D place has at least 15 distinct, individually switchable props
const extraStudioProps = [
  prop("clock", "Real-time clock", false),
  prop("plant", "Swaying plant", false),
  prop("lamp", "Floor lamp", false),
  prop("record_player", "Record player", false),
  prop("lava_lamp", "Lava lamp", false),
  prop("tv", "Studio monitor", false),
  prop("cat", "Sleeping cat", false),
  prop("fish_tank", "Fish tank", false),
  prop("kettle", "Steaming kettle", false),
  prop("radio", "Vintage radio", false),
  prop("books", "Book stack", false),
  prop("mug", "Warm mug", false),
];

export const PLACES = [
  {
    id: "studio", label: "Studio", icon: "video", about: "Dark and calm, with a glossy floor",
    colors: { wall: "#26272c", floor: "#14151a", glow: "", detail: "#ffd9b0" },
    names: { wall: "Backdrop", floor: "Floor", glow: "Glow behind it", detail: "Soft lights" },
    light: "studio", floor: "glossy", air: "dust",
    props: [prop("bokeh", "Soft lights"), prop("shaft", "Beam of light"), prop("rings", "Rings when it talks"), ...extraStudioProps],
  },
  {
    id: "glow", label: "Glow", icon: "sparkles", about: "Its light color fills the room",
    colors: { wall: "#1b1c22", floor: "#14151a", glow: "", detail: "#ffd9b0" },
    names: { wall: "Backdrop", floor: "Floor", glow: "Glow", detail: "Soft lights" },
    light: "studio", floor: "glossy", air: "dust",
    props: [prop("bokeh", "Soft lights"), prop("shaft", "Beam of light"), prop("rings", "Rings when it talks"), ...extraStudioProps],
  },
  {
    id: "desk", label: "Cozy desk", icon: "desk", about: "A desk corner with a lamp and a plant",
    colors: { wall: "#2f3136", floor: "#553d2d", glow: "#ffd6aa", detail: "#8b9d86" },
    names: { wall: "Wall", floor: "Desk", glow: "Window light", detail: "Plant pot" },
    light: "studio", floor: "matte", air: "dust", ownFloor: true,
    props: [
      prop("plant", "Plant"), prop("mug", "Mug"), prop("books", "Books"), prop("lamp", "Lamp"),
      prop("clock", "Real-time clock"), prop("tablet", "Tablet stand"), prop("lava_lamp", "Lava lamp"),
      prop("record_player", "Record player", false), prop("radio", "Tube radio"), prop("cat", "Sleeping cat", false),
      prop("window", "Rainy window", false), prop("blinds", "Window blinds", false), prop("frames", "Framed prints"),
      prop("globe", "Desk globe"), prop("kettle", "Steaming kettle", false),
    ],
  },
  {
    id: "podcast", label: "Podcast studio", icon: "mic", about: "Sound panels, a mic and a neon sign",
    colors: { wall: "#1d1a26", floor: "#15131b", glow: "", detail: "#3b2f5c" },
    names: { wall: "Wall", floor: "Floor", glow: "Neon", detail: "Sound panels" },
    light: "neon", floor: "glossy", air: "dust",
    props: [
      prop("sign", "Neon sign"), prop("panels", "Sound panels"), prop("mic", "Microphone"), prop("pendants", "Hanging lamps"), prop("plant", "Plant", false),
      prop("clock", "Studio clock"), prop("tv", "On-air monitor"), prop("lava_lamp", "Lava lamp"),
      prop("record_player", "Turntable"), prop("radio", "Audio mixer"), prop("mug", "Coffee mug"),
      prop("books", "Show notes"), prop("rug", "Studio rug"), prop("lamp", "Corner tube light"),
      prop("headphones_stand", "Headphone stand"),
    ],
    sign: true,
  },
  {
    id: "lounge", label: "Living room", icon: "couch", about: "Evening at home: window, shelf, rug and lights",
    colors: { wall: "#3c3039", floor: "#6b4a3a", glow: "#ffbf80", detail: "#c9744f" },
    names: { wall: "Wall", floor: "Floor", glow: "Lamp light", detail: "Rug" },
    light: "evening", floor: "matte", air: "dust", ownFloor: true,
    props: [
      prop("window", "Window"), prop("shelf", "Bookshelf"), prop("plant", "Plant"), prop("lamp", "Floor lamp"), prop("rug", "Rug"), prop("lights", "String lights"), prop("frames", "Pictures"),
      prop("clock", "Real-time clock"), prop("fireplace", "Crackling fireplace"), prop("cat", "Sleeping cat"),
      prop("record_player", "Record player"), prop("tv", "Television", false), prop("curtains", "Swaying curtains"),
      prop("kettle", "Tea kettle"), prop("fish_tank", "Fish tank", false),
    ],
  },
  {
    id: "bedroom", label: "Cozy bedroom", icon: "moon", about: "Warm bed, fairy lights, a lava lamp and a rain window",
    colors: { wall: "#2e283a", floor: "#523a2e", glow: "#ffb884", detail: "#c98bb8" },
    names: { wall: "Wall", floor: "Wood floor", glow: "Bedside glow", detail: "Bedding" },
    light: "evening", floor: "matte", air: "dust", ownFloor: true,
    props: [
      prop("bed", "Cozy bed"), prop("window", "Moonlit window"), prop("curtains", "Swaying curtains"),
      prop("lights", "Fairy lights"), prop("lava_lamp", "Lava lamp"), prop("clock", "Alarm clock"),
      prop("plant", "Hanging ivy"), prop("rug", "Plush rug"), prop("books", "Bedside books"),
      prop("cat", "Sleeping cat"), prop("record_player", "Record player"), prop("lamp", "Bedside lamp"),
      prop("mirror", "Floor mirror"), prop("plush", "Teddy bear"), prop("rain_window", "Rain on glass", false),
    ],
  },
  {
    id: "kitchen", label: "Warm kitchen", icon: "flame", about: "Steaming kettle, fresh herbs, tiled backsplash and morning sun",
    colors: { wall: "#3d352e", floor: "#6e503b", glow: "#ffd699", detail: "#6d9c7a" },
    names: { wall: "Tiles", floor: "Floor", glow: "Sunlight", detail: "Cabinets" },
    light: "day", floor: "matte", air: "dust", ownFloor: true,
    props: [
      prop("counter", "Kitchen counter"), prop("kettle", "Steaming kettle"), prop("espresso", "Espresso maker"),
      prop("window", "Sunny window"), prop("plant", "Herb pots"), prop("clock", "Kitchen clock"),
      prop("shelf", "Spice shelf"), prop("mug", "Warm mugs"), prop("fruit_bowl", "Fruit bowl"),
      prop("pendants", "Pendant lights"), prop("radio", "Kitchen radio"), prop("cat", "Sleeping cat", false),
      prop("curtains", "Gingham curtains"), prop("birds", "Birds outside"), prop("rug", "Woven runner"),
    ],
  },
  {
    id: "library", label: "Library & study", icon: "desk", about: "Tall bookcases, rolling ladder, brass globe and banker's lamp",
    colors: { wall: "#25201e", floor: "#473022", glow: "#ffc880", detail: "#4d8a62" },
    names: { wall: "Panelling", floor: "Parquet", glow: "Lamp glow", detail: "Leather & brass" },
    light: "evening", floor: "matte", air: "dust", ownFloor: true,
    props: [
      prop("bookcases", "Tall bookcases"), prop("ladder", "Library ladder"), prop("desk_oak", "Study desk"),
      prop("lamp", "Green banker's lamp"), prop("globe", "Spinning globe"), prop("clock", "Grandfather clock"),
      prop("fireplace", "Hearth fire"), prop("armchair", "Reading chair"), prop("books", "Open tomes"),
      prop("window", "Arched window"), prop("curtains", "Velvet drapes"), prop("plant", "Boston fern"),
      prop("telescope", "Brass telescope"), prop("mug", "Tea cup"), prop("cat", "Sleeping cat"),
    ],
  },
  {
    id: "greenhouse", label: "Greenhouse", icon: "sparkles", about: "Glass conservatory filled with plants, mist, lanterns and birds",
    colors: { wall: "#1e3329", floor: "#4a3b30", glow: "#d8ffb8", detail: "#c47a5a" },
    names: { wall: "Glass & sky", floor: "Stone path", glow: "Sunbeams", detail: "Terracotta pots" },
    light: "day", floor: "matte", air: "petals", ownFloor: true,
    props: [
      prop("glass_roof", "Conservatory arches"), prop("plant", "Monstera & palms"), prop("hanging_plants", "Hanging baskets"),
      prop("flowers", "Blooming beds"), prop("watering_can", "Watering can"), prop("bench", "Potting bench"),
      prop("lanterns", "Warm lanterns"), prop("fountain", "Water fountain"), prop("birds", "Fluttering birds"),
      prop("fish_tank", "Koi pond"), prop("clock", "Garden clock"), prop("sun", "Sunbeams"),
      prop("butterflies", "Butterflies"), prop("kettle", "Herbal teapot"), prop("cat", "Napping cat"),
    ],
  },
  {
    id: "rooftop", label: "Rooftop terrace", icon: "sunrise", about: "String lights, pergola, city horizon and evening breeze",
    colors: { wall: "#1f1d38", floor: "#453831", glow: "#ff9e6e", detail: "#ffd34d" },
    names: { wall: "Evening sky", floor: "Decking", glow: "Sunset", detail: "Lights" },
    light: "golden", floor: "matte", air: "fireflies", ownFloor: true,
    props: [
      prop("pergola", "Wooden pergola"), prop("lights", "Bistro string lights"), prop("skyline", "Distant skyline"),
      prop("plant", "Planter boxes"), prop("lounge_chair", "Terrace sofa"), prop("fireplace", "Fire pit"),
      prop("lanterns", "Floor lanterns"), prop("telescope", "Stargazer scope"), prop("radio", "Portable speaker"),
      prop("mug", "Warm drinks"), prop("moon", "Rising moon"), prop("birds", "Evening birds"),
      prop("rug", "Outdoor rug"), prop("clock", "Tower clock"), prop("wind_chimes", "Wind chimes"),
    ],
  },
  {
    id: "workshop", label: "Workshop & lab", icon: "bolt", about: "Workbench, pegboard tools, 3D printer, oscilloscopes and warm lamps",
    colors: { wall: "#242933", floor: "#3b3530", glow: "#6ee7f9", detail: "#f2c14e" },
    names: { wall: "Workshop wall", floor: "Shop floor", glow: "Bench light", detail: "Tool accents" },
    light: "studio", floor: "matte", air: "sparkles", ownFloor: true,
    props: [
      prop("workbench", "Heavy workbench"), prop("pegboard", "Tool pegboard"), prop("printer3d", "3D printer"),
      prop("tv", "Diagnostic screens"), prop("lamp", "Swing-arm lamp"), prop("clock", "Shop clock"),
      prop("robot_arm", "Mini helper arm"), prop("lava_lamp", "Plasma tube"), prop("radio", "Shop radio"),
      prop("plant", "Desk succulent"), prop("mug", "Oil-can mug"), prop("books", "Blueprints & manuals"),
      prop("window", "Industrial window"), prop("blinds", "Metal blinds"), prop("kettle", "Coffee flask"),
    ],
  },
  {
    id: "cabin", label: "Fireside cabin", icon: "flame", about: "Timber logs, crackling stone hearth, snowy window and braided rug",
    colors: { wall: "#3b281d", floor: "#4d3324", glow: "#ff9147", detail: "#c0392b" },
    names: { wall: "Log walls", floor: "Pine planks", glow: "Firelight", detail: "Blankets" },
    light: "fireside", floor: "matte", air: "embers", ownFloor: true,
    props: [
      prop("fireplace", "Stone fireplace"), prop("log_rack", "Firewood stack"), prop("window", "Snowy window"),
      prop("rug", "Braided hearth rug"), prop("armchair", "Plaid armchair"), prop("kettle", "Cast-iron kettle"),
      prop("clock", "Cuckoo clock"), prop("lanterns", "Oil lantern"), prop("cat", "Sleeping cat"),
      prop("books", "Cabin journal"), prop("mug", "Hot cocoa"), prop("plant", "Pine boughs"),
      prop("curtains", "Wool curtains"), prop("radio", "Shortwave radio"), prop("guitar", "Acoustic guitar"),
    ],
  },
  {
    id: "seaside", label: "Seaside cove", icon: "sun", about: "Gentle ocean waves, lighthouse, boardwalk, palm trees and gulls",
    colors: { wall: "#5698d4", floor: "#d9c29c", glow: "#ffe6a8", detail: "#e05a47" },
    names: { wall: "Ocean sky", floor: "Sandy boardwalk", glow: "Horizon", detail: "Lighthouse" },
    light: "day", floor: "matte", air: "bubbles", ownFloor: true,
    props: [
      prop("ocean", "Rolling waves"), prop("lighthouse", "Distant lighthouse"), prop("sun", "Warm sun"),
      prop("clouds", "Sea clouds"), prop("birds", "Wheeling seagulls"), prop("palm", "Swaying palms"),
      prop("deck_chair", "Striped lounger"), prop("umbrella", "Beach umbrella"), prop("lanterns", "Pier lanterns"),
      prop("radio", "Beach radio"), prop("surfboard", "Surfboard"), prop("shells", "Seashells & starfish"),
      prop("sailboat", "Drifting sailboat"), prop("clock", "Harbor clock"), prop("mug", "Iced drink"),
    ],
  },
  {
    id: "campfire", label: "Forest campfire", icon: "flame", about: "Pine clearing under the stars, crackling campfire, tent and fireflies",
    colors: { wall: "#111829", floor: "#263324", glow: "#ff8c42", detail: "#4d8a62" },
    names: { wall: "Night sky", floor: "Forest floor", glow: "Campfire", detail: "Pines" },
    light: "fireside", floor: "matte", air: "fireflies", ownFloor: true,
    props: [
      prop("fireplace", "Crackling campfire"), prop("tent", "Cozy A-frame tent"), prop("trees", "Tall pine trees"),
      prop("log_seat", "Log benches"), prop("kettle", "Camp kettle"), prop("lanterns", "Hanging camp lantern"),
      prop("moon", "Crescent moon"), prop("stars_sky", "Constellations"), prop("guitar", "Campfire guitar"),
      prop("mug", "Enamel mug"), prop("backpack_prop", "Hiking pack"), prop("cat", "Forest fox friend"),
      prop("birds", "Night owl"), prop("telescope", "Field telescope"), prop("lights", "Tent string lights"),
    ],
  },
  {
    id: "cafe", label: "Corner café", icon: "desk", about: "Espresso steam, pastry case, vinyl records, chalkboard and rain outside",
    colors: { wall: "#362a26", floor: "#4f3a30", glow: "#ffc988", detail: "#4d8a62" },
    names: { wall: "Brick wall", floor: "Café floor", glow: "Pendant light", detail: "Awning & trim" },
    light: "evening", floor: "matte", air: "dust", ownFloor: true,
    props: [
      prop("counter", "Espresso bar"), prop("espresso", "Steaming espresso"), prop("kettle", "Pour-over kettle"),
      prop("pastry_case", "Pastry display"), prop("window", "Café window"), prop("rain_window", "Rain on glass"),
      prop("sign", "Open neon sign"), prop("pendants", "Warm pendants"), prop("plant", "Hanging pothos"),
      prop("record_player", "Spinning vinyl"), prop("clock", "Station clock"), prop("chalkboard", "Menu board"),
      prop("bistro_table", "Bistro table"), prop("mug", "Latte cup"), prop("cat", "Café cat"),
    ],
    sign: true,
  },
  {
    id: "arcade", label: "Retro arcade", icon: "bolt", about: "Glowing cabinets, CRT screens, lava lamp, neon signs and synth vibes",
    colors: { wall: "#18122b", floor: "#141024", glow: "#5eead4", detail: "#f472b6" },
    names: { wall: "Arcade wall", floor: "Carpet", glow: "Neon glow", detail: "Cabinets" },
    light: "neon", floor: "glossy", air: "sparkles", ownFloor: true,
    props: [
      prop("arcade_left", "Starfighter cabinet"), prop("arcade_right", "Rhythm cabinet"), prop("sign", "Neon sign"),
      prop("tv", "CRT high-score screen"), prop("lava_lamp", "Giant lava lamp"), prop("gacha", "Capsule machine"),
      prop("clock", "Pixel clock"), prop("record_player", "Synth boombox"), prop("rug", "Cosmic arcade rug"),
      prop("lights", "Neon ceiling tubes"), prop("plant", "Neon palm"), prop("mug", "Soda cup"),
      prop("plush", "Claw-machine plush"), prop("posters", "Retro posters"), prop("basketball", "Arcade hoop"),
    ],
    sign: true,
  },
  {
    id: "observatory", label: "Observatory", icon: "stars", about: "Grand dome, brass telescope, star maps, orrery and night sky",
    colors: { wall: "#141a2e", floor: "#302620", glow: "#7aa2f7", detail: "#d9b25a" },
    names: { wall: "Dome & sky", floor: "Wood deck", glow: "Starlight", detail: "Brass instruments" },
    light: "night", floor: "matte", air: "stars", ownFloor: true,
    props: [
      prop("dome_slit", "Observatory dome"), prop("telescope", "Great brass telescope"), prop("orrery", "Spinning solar orrery"),
      prop("planet", "Visible planet"), prop("moon", "Bright moon"), prop("star_chart", "Glowing star chart"),
      prop("clock", "Astronomical clock"), prop("books", "Star atlases"), prop("lamp", "Amber desk lamp"),
      prop("globe", "Celestial globe"), prop("ladder", "Curved steps"), prop("kettle", "Midnight tea"),
      prop("plant", "Night-blooming fern"), prop("cat", "Stargazing cat"), prop("crystals", "Meteorite display"),
    ],
  },
  {
    id: "tatami", label: "Tatami tea room", icon: "sunrise", about: "Shoji screens, woven tatami, bonsai, cast-iron teapot and bamboo garden",
    colors: { wall: "#3b342b", floor: "#8c7f56", glow: "#ffd89e", detail: "#4d8a62" },
    names: { wall: "Shoji & wood", floor: "Tatami mats", glow: "Lantern light", detail: "Garden view" },
    light: "golden", floor: "matte", air: "petals", ownFloor: true,
    props: [
      prop("shoji", "Sliding shoji screens"), prop("chabudai", "Low tea table"), prop("kettle", "Steaming tetsubin"),
      prop("bonsai", "Ancient pine bonsai"), prop("scroll", "Hanging calligraphy"), prop("lanterns", "Andon floor lamp"),
      prop("zabuton", "Floor cushions"), prop("bamboo", "Swaying bamboo outside"), prop("fish_tank", "Koi water basin"),
      prop("clock", "Wooden clock"), prop("flowers", "Ikebana arrangement"), prop("mug", "Matcha bowl"),
      prop("cat", "Calico cat"), prop("birds", "Garden sparrows"), prop("wind_chimes", "Glass furin chime"),
    ],
  },
  {
    id: "spaceship", label: "Spaceship bridge", icon: "stars", about: "Panoramic starfield, holo-table, command consoles and orbital view",
    colors: { wall: "#111622", floor: "#192030", glow: "#5eead4", detail: "#6f9cf5" },
    names: { wall: "Hull & viewport", floor: "Deck plates", glow: "Warp core", detail: "Consoles" },
    light: "neon", floor: "grid", air: "stars", ownFloor: true,
    props: [
      prop("viewport", "Bridge viewport"), prop("planet", "Ringed planet"), prop("moon", "Orbital moon"),
      prop("holo_table", "Spinning holo-map"), prop("tv", "Telemetry screens"), prop("console_l", "Helm console"),
      prop("console_r", "Science console"), prop("captain_chair", "Command chair"), prop("clock", "Stardate clock"),
      prop("plant", "Hydroponic pod"), prop("lava_lamp", "Warp core column"), prop("radio", "Subspace comms"),
      prop("mug", "Zero-G mug"), prop("cat", "Space cat"), prop("lights", "Deck status strips"),
    ],
  },
  {
    id: "space", label: "Space", icon: "stars", about: "A view of a planet and the stars",
    colors: { wall: "#070816", floor: "#0d1030", glow: "#6a5cff", detail: "#d98a5f" },
    names: { wall: "Space", floor: "Floor", glow: "Nebula", detail: "Planet" },
    light: "night", floor: "grid", air: "stars",
    props: [
      prop("planet", "Planet"), prop("moon", "Moon"), prop("frame", "Window frame"),
      prop("satellites", "Orbiting satellite", false), prop("asteroids", "Asteroid belt", false),
      prop("comets", "Shooting stars", false), prop("holo", "Star projector", false),
      prop("clock", "Orbital clock", false), prop("telescope", "Telescope", false),
      prop("console", "Control console", false), prop("plant", "Bio-dome plant", false),
      prop("lava_lamp", "Energy core", false), prop("radio", "Deep-space beacon", false),
      prop("cat", "Astro-cat", false), prop("lights", "Bay lights", false),
    ],
  },
  {
    id: "garden", label: "Sunset hills", icon: "mountain", about: "Rolling hills under a warm sky",
    colors: { wall: "#f3a469", floor: "#4a7a4a", glow: "#ffd9a0", detail: "#f06b8f" },
    names: { wall: "Sky", floor: "Grass", glow: "Sun glow", detail: "Flowers" },
    light: "golden", floor: "matte", air: "petals",
    props: [
      prop("sun", "Sun"), prop("hills", "Hills"), prop("trees", "Trees"), prop("flowers", "Flowers"), prop("clouds", "Clouds"),
      prop("birds", "Flock of birds"), prop("windmill", "Distant windmill", false), prop("bench", "Wooden bench", false),
      prop("lanterns", "Pathway lanterns", false), prop("pond", "Lily pond", false), prop("cat", "Napping cat", false),
      prop("butterflies", "Butterflies", false), prop("fence", "Garden fence", false), prop("kettle", "Picnic tea", false),
      prop("clock", "Sundial", false),
    ],
  },
  {
    id: "city", label: "Neon city", icon: "building", about: "A night skyline with glowing windows",
    colors: { wall: "#160d33", floor: "#0e0b1c", glow: "#ff3ea5", detail: "#2a1a52" },
    names: { wall: "Night sky", floor: "Street", glow: "Neon", detail: "Buildings" },
    light: "neon", floor: "glossy", air: "none",
    props: [
      prop("skyline", "Skyline"), prop("moon", "Moon"), prop("neon", "Neon signs"),
      prop("rain_window", "Rain streaks", false), prop("traffic", "Light trails", false),
      prop("billboard", "Holo billboard", false), prop("street_lamp", "Street lamp", false),
      prop("clock", "Tower clock", false), prop("vending", "Vending machine", false),
      prop("plant", "Balcony plant", false), prop("radio", "Boombox", false),
      prop("cat", "Alley cat", false), prop("tv", "Storefront TV", false),
      prop("lanterns", "Paper lanterns", false), prop("birds", "Night flyers", false),
    ],
    sign: true,
  },
  {
    id: "sky", label: "Clouds", icon: "cloudy", about: "Floating among the clouds",
    colors: { wall: "#5aa6f2", floor: "#eaf4ff", glow: "#fff3d6", detail: "#ffffff" },
    names: { wall: "Sky", floor: "Cloud floor", glow: "Sun glow", detail: "Clouds" },
    light: "day", floor: "matte", air: "none",
    props: [
      prop("sun", "Sun"), prop("clouds", "Clouds"), prop("rainbow", "Rainbow", false),
      prop("birds", "Soaring birds", false), prop("balloon_air", "Hot air balloon", false),
      prop("kite", "Dancing kite", false), prop("arch", "Cloud arch", false),
      prop("stars_day", "Daytime moon", false), prop("lanterns", "Sky lanterns", false),
      prop("wind_chimes", "Breeze chimes", false), prop("plant", "Sky sprout", false),
      prop("clock", "Cloud clock", false), prop("cat", "Cloud kitty", false),
      prop("kettle", "Tea on a cloud", false), prop("lights", "Starlight garland", false),
    ],
  },
  {
    id: "gradient", label: "Gradient", icon: "palette", about: "Two colors of your choice",
    colors: { wall: "#3a4ea8", floor: "#c0507f", glow: "", detail: "#ffffff" },
    names: { wall: "Top", floor: "Bottom", glow: "Glow", detail: "Lines" },
    light: "studio", floor: "none", air: "none",
    props: [prop("spot", "Spotlight")],
  },
  {
    id: "photo", label: "Your picture", icon: "image", about: "Your own image as the backdrop",
    colors: { wall: "#26272c", floor: "#14151a", glow: "", detail: "#ffffff" },
    names: { wall: "Behind the picture", floor: "Floor", glow: "Glow", detail: "Lines" },
    light: "studio", floor: "none", air: "none",
    props: [],
    photo: true,
  },
  {
    id: "green", label: "Green screen", icon: "tv", about: "Flat #00B140 for keying out",
    colors: { wall: "#00b140", floor: "#00b140", glow: "", detail: "#ffffff" }, names: {},
    light: "studio", floor: "none", air: "none", props: [], chroma: true,
  },
  {
    id: "blue", label: "Blue screen", icon: "tv", about: "Flat #0047BB for keying out",
    colors: { wall: "#0047bb", floor: "#0047bb", glow: "", detail: "#ffffff" }, names: {},
    light: "studio", floor: "none", air: "none", props: [], chroma: true,
  },
];

export const PLACE_BY_ID = Object.fromEntries(PLACES.map((p) => [p.id, p]));

export const COLOR_KEYS = ["wall", "floor", "glow", "detail"];

export const RANGES = {
  brightness: [0.5, 1.5, 1],
  airAmount: [0.3, 2, 1],
  blur: [0, 1, 0.25],
  dim: [0, 0.8, 0.15],
  timeHour: [0, 24, 14, 0.5],
};

export const DEFAULT_COMPANIONS = Object.freeze(
  Object.fromEntries(COMPANIONS.map((c) => [c.id, false]))
);

// ---------- A room for a place ----------
export function roomFor(place = "studio") {
  const p = PLACE_BY_ID[place] || PLACE_BY_ID.studio;
  return {
    place: p.id,
    colors: { ...p.colors },
    light: p.light,
    brightness: 1,
    floor: p.floor,
    air: p.air,
    airAmount: 1,
    props: Object.fromEntries(p.props.map((q) => [q.id, q.on])),
    companions: { ...DEFAULT_COMPANIONS },
    timeMode: "manual",
    timeHour: 14,
    weatherSync: true,
    season: "none",
    sign: "ON AIR",
    photo: { blur: RANGES.blur[2], dim: RANGES.dim[2] },
    builder: sanitizeBuilder(null),
  };
}

export const defaultRoom = () => roomFor("studio");

// Moving to another place starts from that place's own look (what you set for the
// last place doesn't fit this one); the words on a sign, companions, time/season and builder stay
export function changePlace(room, place) {
  const next = roomFor(place);
  return sanitizeRoom({
    ...next,
    sign: room?.sign ?? next.sign,
    airAmount: room?.airAmount ?? 1,
    brightness: room?.brightness ?? 1,
    photo: room?.photo ?? next.photo,
    companions: room?.companions ?? next.companions,
    timeMode: room?.timeMode ?? next.timeMode,
    timeHour: room?.timeHour ?? next.timeHour,
    weatherSync: room?.weatherSync ?? next.weatherSync,
    season: room?.season ?? next.season,
    builder: room?.builder ?? next.builder,
  });
}

// Resolve seasonal mode ("auto" picks by date)
export function activeSeason(season, now = new Date()) {
  if (season && season !== "auto") return season;
  if (season !== "auto") return "none";
  const m = now.getMonth() + 1; // 1..12
  const d = now.getDate();
  if (m === 12 && d >= 15) return "christmas";
  if ((m === 12 && d >= 29) || (m === 1 && d <= 4)) return "new_year";
  if (m === 10 && d >= 20) return "halloween";
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
}

// What the room really uses (the place's own light and floor when you left them on "Like the place",
// or real-clock light mood when timeMode === "clock")
export function resolved(room, now = new Date()) {
  const p = PLACE_BY_ID[room.place] || PLACE_BY_ID.studio;
  let light = room.light === "auto" ? p.light : room.light;
  if (room.timeMode === "clock" && !p.chroma) {
    const h = now.getHours() + now.getMinutes() / 60;
    if (h >= 6 && h < 9) light = "golden";
    else if (h >= 9 && h < 17) light = "day";
    else if (h >= 17 && h < 20) light = "golden";
    else if (h >= 20 && h < 22.5) light = "evening";
    else light = "night";
  }
  return {
    light: LIGHT_MOODS[light] ? light : p.light,
    floor: room.floor === "auto" ? p.floor : room.floor,
    place: p,
    season: activeSeason(room.season, now),
  };
}

// ---------- Cleaning ----------
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const oneOf = (list, value, fallback) => (list.some((e) => e.id === value) ? value : fallback);
const color = (value, fallback, allowEmpty = false) => (typeof value === "string" && HEX.test(value) ? value.toLowerCase() : allowEmpty && value === "" ? "" : fallback);
const num = (value, [min, max, def]) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 1000) / 1000)) : def;
};

export function sanitizeRoom(input) {
  const r = obj(input);
  const place = PLACE_BY_ID[r.place] ? r.place : "studio";
  const base = roomFor(place);
  const c = obj(r.colors);
  const out = { ...base };
  out.colors = {
    wall: color(c.wall, base.colors.wall),
    floor: color(c.floor, base.colors.floor),
    glow: color(c.glow, base.colors.glow, true),
    detail: color(c.detail, base.colors.detail),
  };
  out.light = oneOf(LIGHTS, r.light, base.light);
  out.brightness = num(r.brightness, RANGES.brightness);
  out.floor = oneOf(FLOORS, r.floor, base.floor);
  out.air = oneOf(AIRS, r.air, base.air);
  out.airAmount = num(r.airAmount, RANGES.airAmount);
  const props = obj(r.props);
  out.props = Object.fromEntries(PLACE_BY_ID[place].props.map((q) => [q.id, typeof props[q.id] === "boolean" ? props[q.id] : q.on]));
  const comp = obj(r.companions);
  out.companions = Object.fromEntries(COMPANIONS.map((k) => [k.id, typeof comp[k.id] === "boolean" ? comp[k.id] : false]));
  out.timeMode = oneOf(TIME_MODES, r.timeMode, "manual");
  out.timeHour = num(r.timeHour, RANGES.timeHour);
  out.weatherSync = typeof r.weatherSync === "boolean" ? r.weatherSync : true;
  out.season = oneOf(SEASONS, r.season, "none");
  out.sign = typeof r.sign === "string" ? r.sign.replace(/\s+/g, " ").trim().slice(0, 16) || base.sign : base.sign;
  const photo = obj(r.photo);
  out.photo = { blur: num(photo.blur, RANGES.blur), dim: num(photo.dim, RANGES.dim) };
  out.builder = sanitizeBuilder(r.builder, base.builder);
  return out;
}

// The older settings had one "background": studio, accent, desk, green or blue
export function roomFromLegacy(background) {
  return roomFor({ accent: "glow", studio: "studio", desk: "desk", green: "green", blue: "blue" }[background] || "studio");
}

// Export and import a custom room as .robot-room.json (versioned)
export function roomFile({ name, room }) {
  return JSON.stringify({ app: "friends-robot-room", version: 2, name: String(name || "Room").slice(0, 40), room: sanitizeRoom(room) }, null, 2);
}

export function readRoomFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  if (data.app && data.app !== "friends-robot-room" && data.app !== "friends-robot-look") return null;
  const rawRoom = data.room || (data.place ? data : null);
  if (!rawRoom || typeof rawRoom !== "object") return null;
  return {
    name: typeof data.name === "string" ? data.name.replace(/\s+/g, " ").trim().slice(0, 40) : "",
    room: sanitizeRoom(rawRoom),
  };
}

export function labels() {
  const out = new Set();
  for (const list of [LIGHTS, FLOORS, AIRS, COMPANIONS, TIME_MODES, SEASONS]) {
    for (const e of list) out.add(e.label);
  }
  for (const p of PLACES) {
    out.add(p.label);
    out.add(p.about);
    for (const n of Object.values(p.names)) out.add(n);
    for (const q of p.props) out.add(q.label);
  }
  for (const l of builderLabels()) out.add(l);
  return [...out];
}
