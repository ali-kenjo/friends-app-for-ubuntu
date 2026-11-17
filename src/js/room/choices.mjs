// ---------- The choices a room is made of ----------
// Pure data (no DOM, no three.js), used by the page (the Room Editor, the renderer) and by the helper
// (which cleans what is saved). Every list is [{ id, label, ... }]; labels() gives the words to translate.

// ----- Architecture -----
export const SIZE_PRESETS = [
  { id: "small", label: "Small", w: 3.5, d: 3, h: 2.6 },
  { id: "medium", label: "Medium", w: 5, d: 4, h: 2.7 },
  { id: "large", label: "Large", w: 7, d: 5, h: 2.9 },
  { id: "custom", label: "Custom" },
];

export const WALL_LAYOUTS = [
  { id: "none", label: "No walls", walls: { back: false, left: false, right: false, front: false } },
  { id: "back", label: "Back wall", walls: { back: true, left: false, right: false, front: false } },
  { id: "corner", label: "Corner", walls: { back: true, left: true, right: false, front: false } },
  { id: "three", label: "Three walls", walls: { back: true, left: true, right: true, front: false } },
  { id: "box", label: "Box with cutaway", walls: { back: true, left: true, right: true, front: true } },
];

export const CUTAWAYS = [
  { id: "auto", label: "Fade walls in front of the robot" },
  { id: "off", label: "Always show walls" },
];

// family: which kit material makes it (render/kit/materials.js); def: its usual color
export const WALL_MATERIALS = [
  { id: "plaster", label: "Smooth plaster", family: "clay", def: "#e9e1d4" },
  { id: "painted", label: "Painted wall", family: "clay", def: "#c9d3cf" },
  { id: "wainscot", label: "Wood wainscoting", family: "wood", def: "#b98a5e" },
  { id: "panelling", label: "Dark wood panelling", family: "wood", def: "#5a3d2b" },
  { id: "brick", label: "Warm brick", family: "clay", def: "#a65c44" },
  { id: "slats", label: "Acoustic wood slats", family: "wood", def: "#8a6446" },
  { id: "tiles", label: "Ceramic tiles", family: "ceramic", def: "#e7e2d6" },
  { id: "shoji", label: "Shoji screens", family: "paper", def: "#f1e7cf" },
  { id: "stone", label: "Cabin stone", family: "clay", def: "#8d877d" },
  { id: "logs", label: "Timber logs", family: "wood", def: "#8a5a36" },
  { id: "concrete", label: "Soft concrete", family: "clay", def: "#9a9a96" },
  { id: "acoustic", label: "Sound panels", family: "fabric", def: "#3b2f5c" },
  { id: "starwall", label: "Starlit mural", family: "clay", def: "#1c2140" },
];

export const FLOOR_MATERIALS = [
  { id: "oak_planks", label: "Oak planks", family: "wood", def: "#b88457" },
  { id: "walnut_planks", label: "Walnut planks", family: "wood", def: "#6b4a34" },
  { id: "pine_planks", label: "Pine planks", family: "wood", def: "#c89a63" },
  { id: "herringbone", label: "Herringbone parquet", family: "wood", def: "#a87547" },
  { id: "tatami", label: "Woven tatami", family: "fabric", def: "#b9ad7a" },
  { id: "terrazzo", label: "Speckled terrazzo", family: "clay", def: "#d9d3c7" },
  { id: "checker", label: "Café checkerboard", family: "ceramic", def: "#e8e2d4" },
  { id: "tile", label: "Stone tiles", family: "ceramic", def: "#b8b0a2" },
  { id: "concrete", label: "Polished concrete", family: "clay", def: "#8f8f8c" },
  { id: "carpet", label: "Plush carpet", family: "fabric", def: "#6f5f7a" },
  { id: "deck", label: "Terrace decking", family: "wood", def: "#8a6a50" },
  { id: "stone", label: "Stone path", family: "clay", def: "#8a8178" },
  { id: "grass", label: "Grass", family: "leaf", def: "#5f8f4e" },
  { id: "sand", label: "Sand", family: "clay", def: "#dcc49a" },
  { id: "cloud", label: "Cloud", family: "clay", def: "#eef4fb" },
  { id: "forest", label: "Forest floor", family: "leaf", def: "#3a4a2e" },
  { id: "deck_plates", label: "Deck plates", family: "metal", def: "#3a4356" },
  { id: "glossy", label: "Glossy mirror", family: "plastic", def: "#14151a" },
  { id: "grid", label: "Glowing grid", family: "emissive", def: "#0d1030" },
  { id: "none", label: "No floor", family: "none", def: "#000000" },
];

export const CEILINGS = [
  { id: "none", label: "Open (no ceiling)" },
  { id: "flat", label: "Flat ceiling" },
  { id: "beams", label: "Timber beams" },
  { id: "coffered", label: "Coffered panels" },
  { id: "skylight", label: "Glass skylight" },
  { id: "dome", label: "Planetarium dome" },
  { id: "truss", label: "Studio truss" },
];

// What open sides and windows show
export const OUTSIDES = [
  { id: "none", label: "Nothing (plain backdrop)" },
  { id: "city_night", label: "City at night" },
  { id: "garden_day", label: "Garden by day" },
  { id: "space", label: "Space" },
  { id: "clouds", label: "Clouds" },
  { id: "hills", label: "Rolling hills" },
  { id: "sea", label: "The sea" },
  { id: "forest", label: "Forest at night" },
  { id: "snow", label: "Snowy pines" },
  { id: "photo", label: "Your picture" },
];

// ----- Atmosphere -----
// key/fill/rim: [color, strength]; env: how strongly the room reflects; hemi: [sky, strength] of the
// bounce light (its ground color is the floor's); grade: lift, gamma, gain (multiplied per channel)
export const MOODS = [
  { id: "studio", label: "Studio", icon: "video", key: ["#fff1e0", 1.75], fill: ["#dfe8ff", 0.55], rim: ["#ffffff", 1.5], env: 0.38, hemi: ["#d9e2ff", 0.35], grade: { lift: [0, 0, 0.005], gamma: [1, 1, 1], gain: [1, 1, 1] } },
  { id: "day", label: "Daylight", icon: "sun", key: ["#fff6e8", 1.55], fill: ["#cfe3ff", 0.7], rim: ["#ffffff", 1.0], env: 0.45, hemi: ["#cfe3ff", 0.5], grade: { lift: [0, 0, 0], gamma: [1, 1, 0.98], gain: [1.02, 1.01, 1] } },
  { id: "morning", label: "Morning light", icon: "sunrise", key: ["#ffe9cf", 1.5], fill: ["#d6e6ff", 0.7], rim: ["#fff4dc", 1.1], env: 0.42, hemi: ["#e3ecff", 0.45], grade: { lift: [0.004, 0.003, 0.006], gamma: [0.99, 1, 1], gain: [1.02, 1.01, 0.99] } },
  { id: "golden", label: "Golden hour", icon: "sunrise", key: ["#ffc27a", 2.0], fill: ["#ffd9b8", 0.45], rim: ["#ffb067", 1.7], env: 0.4, hemi: ["#ffd2a8", 0.35], grade: { lift: [0.01, 0.004, 0], gamma: [0.98, 1, 1.03], gain: [1.04, 1, 0.94] } },
  { id: "evening", label: "Evening", icon: "moon", key: ["#ffb27a", 1.25], fill: ["#8c9eff", 0.65], rim: ["#b48cff", 1.4], env: 0.3, hemi: ["#8c9eff", 0.3], grade: { lift: [0.008, 0.004, 0.012], gamma: [1, 1, 0.99], gain: [1.02, 0.99, 0.98] } },
  { id: "cozy", label: "Cozy evening", icon: "lamp", key: ["#ffd4a6", 1.45], fill: ["#7088b8", 0.55], rim: ["#ffb074", 1.3], env: 0.32, hemi: ["#ffcf9a", 0.3], grade: { lift: [0.01, 0.005, 0.002], gamma: [0.98, 1, 1.02], gain: [1.03, 1, 0.95] } },
  { id: "warm_lamp", label: "Warm desk lamp", icon: "lamp", key: ["#ffcf99", 1.6], fill: ["#8296c4", 0.5], rim: ["#ffc58a", 1.2], env: 0.33, hemi: ["#ffd9ad", 0.3], grade: { lift: [0.008, 0.004, 0], gamma: [0.99, 1, 1.02], gain: [1.03, 1, 0.96] } },
  { id: "night", label: "Night", icon: "moon", key: ["#9db4ff", 0.95], fill: ["#5a6bd1", 0.55], rim: ["#6ed3ff", 1.6], env: 0.22, hemi: ["#4a5ab0", 0.25], grade: { lift: [0, 0.004, 0.014], gamma: [1.02, 1, 0.97], gain: [0.96, 0.99, 1.04] } },
  { id: "moonlight", label: "Midnight moon", icon: "moon", key: ["#8bb4f8", 1.0], fill: ["#314168", 0.5], rim: ["#5eead4", 1.4], env: 0.22, hemi: ["#3a4a78", 0.25], grade: { lift: [0, 0.006, 0.016], gamma: [1.02, 1, 0.97], gain: [0.95, 0.99, 1.04] } },
  { id: "neon", label: "Neon", icon: "bolt", key: ["#ffd0ee", 1.3], fill: ["#5fd8ff", 0.8], rim: ["#a07cff", 1.9], env: 0.28, hemi: ["#7a5cff", 0.3], grade: { lift: [0.01, 0, 0.016], gamma: [1, 1.01, 0.98], gain: [1.02, 0.97, 1.04] } },
  { id: "fireside", label: "Fireside", icon: "flame", key: ["#ff9955", 1.85], fill: ["#7a5540", 0.5], rim: ["#ffd37a", 1.45], env: 0.34, hemi: ["#ff9f66", 0.3], grade: { lift: [0.012, 0.004, 0], gamma: [0.97, 1, 1.04], gain: [1.05, 0.99, 0.92] } },
  { id: "broadcast", label: "Neutral broadcast", icon: "video", key: ["#ffffff", 1.6], fill: ["#eef2ff", 0.75], rim: ["#ffffff", 1.2], env: 0.4, hemi: ["#f0f3ff", 0.4], grade: { lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1] } },
  { id: "stage", label: "Stage spotlight", icon: "sparkles", key: ["#ffffff", 2.1], fill: ["#3a465e", 0.35], rim: ["#6f9cf5", 1.6], env: 0.26, hemi: ["#3a465e", 0.2], grade: { lift: [0, 0, 0.008], gamma: [1, 1, 1], gain: [1.01, 1, 1.01] } },
];
export const MOOD_BY_ID = Object.fromEntries(MOODS.map((m) => [m.id, m]));

export const TIME_MODES = [
  { id: "template", label: "Like the template" },
  { id: "manual", label: "A fixed hour" },
  { id: "clock", label: "Follow the real clock" },
];

export const AIRS = [
  { id: "none", label: "Nothing" },
  { id: "dust", label: "Dust in the light" },
  { id: "fireflies", label: "Fireflies" },
  { id: "snow", label: "Snow" },
  { id: "stars", label: "Twinkling stars" },
  { id: "bubbles", label: "Bubbles" },
  { id: "petals", label: "Petals" },
  { id: "sparkles", label: "Sparkles" },
  { id: "embers", label: "Embers" },
  { id: "rain", label: "Rain" },
  { id: "leaves", label: "Autumn leaves" },
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

// §5.9 what is drawn behind and around the robot
export const BACKDROP_LAYERS = [
  { id: "full", label: "Full room" },
  { id: "selected", label: "Robot and chosen things" },
  { id: "solid", label: "Solid color" },
  { id: "chroma_green", label: "Green screen", color: "#00b140" },
  { id: "chroma_blue", label: "Blue screen", color: "#0047bb" },
  { id: "transparent", label: "Transparent (robot only)" },
];
export const CHROMA = { green: "#00b140", blue: "#0047bb" };

// ----- Assets -----
export const SLOTS = [
  { id: "floor", label: "Floor" },
  { id: "wall", label: "Wall" },
  { id: "surface", label: "On furniture" },
  { id: "ceiling", label: "Ceiling" },
  { id: "stack", label: "Stacked" },
];

export const VARIANTS = [
  { id: "S", label: "Small" },
  { id: "M", label: "Medium" },
  { id: "L", label: "Large" },
];

// §6.6 what the robot can do with a thing
export const ACTIONS = [
  { id: "look", label: "Look at" },
  { id: "go", label: "Go to" },
  { id: "point", label: "Point at" },
  { id: "touch", label: "Touch" },
  { id: "use", label: "Use or switch" },
  { id: "carry", label: "Pick up and carry" },
  { id: "put_back", label: "Put back" },
  { id: "sit", label: "Sit on" },
  { id: "lean", label: "Lean on" },
  { id: "play", label: "Play with" },
  { id: "water", label: "Water" },
  { id: "write", label: "Write on" },
  { id: "read", label: "Read" },
  { id: "tidy", label: "Tidy" },
  { id: "rest", label: "Rest on" },
];
export const ACTION_IDS = ACTIONS.map((a) => a.id);
// Actions that only look or come near (allowed under "Look, don't touch")
export const LOOK_ACTIONS = new Set(["look", "go", "point"]);

export const PERMISSIONS = [
  { id: "free", label: "Free", about: "It may do these on its own and when asked" },
  { id: "ask", label: "Only when I ask", about: "The AI may when you ask; never on its own" },
  { id: "look", label: "Look, don't touch", about: "It may look and come near, never touch or use it" },
  { id: "never", label: "Never", about: "Ignored: no visits, no looks, never used" },
];

export const TIMES_OF_DAY = [
  { id: "morning", label: "Morning", from: 5, to: 11 },
  { id: "afternoon", label: "Afternoon", from: 11, to: 17 },
  { id: "evening", label: "Evening", from: 17, to: 22 },
  { id: "night", label: "Night", from: 22, to: 29 },
];

export const MOOD_AFFINITIES = [
  { id: "curious", label: "Curious" },
  { id: "playful", label: "Playful" },
  { id: "calm", label: "Calm" },
  { id: "happy", label: "Happy" },
  { id: "sleepy", label: "Sleepy" },
  { id: "focused", label: "Focused" },
];

// ----- The robot -----
export const HOVER_HEIGHTS = [
  { id: "low", label: "Low", lift: -0.05 },
  { id: "normal", label: "Normal", lift: 0 },
  { id: "high", label: "High", lift: 0.07 },
];
export const STANCES = [
  { id: "upright", label: "Upright" },
  { id: "relaxed", label: "Relaxed" },
  { id: "playful", label: "Playful" },
];
export const POSTURES = [
  { id: "stand", label: "Stand (hover)" },
  { id: "sit", label: "Sit" },
  { id: "lean", label: "Lean" },
  { id: "rest", label: "Rest on its pad" },
];
export const ROBOT_STATES = [
  { id: "idle", label: "Idle" },
  { id: "talking", label: "Talking" },
  { id: "listening", label: "Listening" },
  { id: "thinking", label: "Thinking" },
  { id: "away", label: "When you're away" },
];

export const GAZE_MODES = [
  { id: "you", label: "At you" },
  { id: "camera", label: "At the camera" },
  { id: "task", label: "At what it's doing" },
  { id: "point", label: "At a point you place" },
  { id: "asset", label: "At a chosen thing" },
  { id: "pointer", label: "Follow the pointer" },
  { id: "natural", label: "Natural (glances around)" },
];

export const FREEDOMS = [
  { id: "stay", label: "Stay put (only turns)" },
  { id: "near_home", label: "Near home" },
  { id: "free", label: "Free inside allowed areas" },
  { id: "routes", label: "Routes only" },
];

export const ZONE_KINDS = [
  { id: "nogo", label: "No-go", color: "#e5484d", about: "It never enters; paths go around" },
  { id: "allowed", label: "Allowed area", color: "#30a46c", about: "When any exist, it stays inside them" },
  { id: "slow", label: "Slow", color: "#f5a524", about: "It moves slowly here" },
  { id: "quiet", label: "Quiet", color: "#7c66dc", about: "No robot sounds here" },
  { id: "stage", label: "Stage", color: "#3e9bff", about: "Where it stands when it talks to you" },
  { id: "rest", label: "Rest", color: "#8e8c99", about: "Where it goes when you're away" },
];
export const ZONE_SHAPES = [
  { id: "rect", label: "Rectangle" },
  { id: "circle", label: "Circle" },
  { id: "poly", label: "Polygon" },
];

export const GAITS = [
  { id: "hover", label: "Hover" },
  { id: "walk", label: "Walk" },
  { id: "glide", label: "Glide" },
  { id: "hop", label: "Hop" },
  { id: "zip", label: "Zip" },
];
export const PATH_STYLES = [
  { id: "direct", label: "Direct" },
  { id: "smooth", label: "Smooth curves" },
  { id: "meander", label: "Meandering" },
];

export const STATE_CHOICES = {
  talking: [
    { id: "stage", label: "Go to the stage zone" },
    { id: "stay", label: "Stay where it is" },
    { id: "closer", label: "Come closer" },
  ],
  listening: [
    { id: "turn", label: "Turn to you" },
    { id: "closer", label: "Come closer" },
  ],
  thinking: [
    { id: "stay", label: "Stay" },
    { id: "pace", label: "Pace a little" },
    { id: "look_up", label: "Look up" },
  ],
  idle: [
    { id: "stay", label: "Stay" },
    { id: "wander", label: "Wander" },
    { id: "route", label: "Follow a route" },
    { id: "visit", label: "Visit things" },
  ],
};

export const ROUTE_MODES = [
  { id: "loop", label: "Loop" },
  { id: "ping_pong", label: "Back and forth" },
  { id: "random", label: "Random" },
  { id: "once", label: "Once" },
];
export const ROUTE_WHEN = [
  { id: "idle", label: "When idle" },
  { id: "every", label: "Every few minutes" },
  { id: "window", label: "In a time window" },
  { id: "scene", label: "In a scene" },
  { id: "manual", label: "Only when started" },
];

export const AUTONOMY_PRESETS = [
  { id: "statue", label: "Statue", freedom: "stay", idle: "stay", quotas: { maxPerHour: 0 } },
  { id: "calm", label: "Calm", freedom: "near_home", idle: "stay", quotas: { maxPerHour: 6 } },
  { id: "curious", label: "Curious", freedom: "free", idle: "visit", quotas: { maxPerHour: 18 } },
  { id: "playful", label: "Playful", freedom: "free", idle: "visit", quotas: { maxPerHour: 30 } },
  { id: "busy", label: "Busy", freedom: "free", idle: "route", quotas: { maxPerHour: 40 } },
  { id: "custom", label: "Custom" },
];

export const INTERRUPT_POLICIES = [
  { id: "immediate_return", label: "Stop at once and come back" },
  { id: "finish_briefly", label: "Finish the step briefly, then listen" },
  { id: "pause_and_resume", label: "Pause, and carry on after you speak" },
  { id: "finish_before_listening", label: "Finish what it's doing first" },
];

export const CAMERA_FOLLOW = [
  { id: "fixed", label: "Fixed shot" },
  { id: "follow", label: "Follow the robot" },
  { id: "auto", label: "Auto-frame" },
];

export const SCENE_WHEN = [
  { id: "manual", label: "Only when I switch" },
  { id: "schedule", label: "On a schedule" },
  { id: "filming", label: "While filming" },
];

export const WEEKDAYS = [
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
  { id: 0, label: "Sun" },
];

// Words the screen-reader summary and the AI's room block use for where things are
export const WHERE_WORDS = ["back", "middle", "front", "left", "centre", "right", "on the", "on the wall", "from the ceiling"];

export function labels() {
  const out = new Set();
  const lists = [SIZE_PRESETS, WALL_LAYOUTS, CUTAWAYS, WALL_MATERIALS, FLOOR_MATERIALS, CEILINGS, OUTSIDES, MOODS, TIME_MODES, AIRS, SEASONS, BACKDROP_LAYERS, SLOTS, VARIANTS, ACTIONS, PERMISSIONS, TIMES_OF_DAY, MOOD_AFFINITIES, HOVER_HEIGHTS, STANCES, POSTURES, ROBOT_STATES, GAZE_MODES, FREEDOMS, ZONE_KINDS, ZONE_SHAPES, GAITS, PATH_STYLES, ROUTE_MODES, ROUTE_WHEN, AUTONOMY_PRESETS, INTERRUPT_POLICIES, CAMERA_FOLLOW, SCENE_WHEN, WEEKDAYS, ...Object.values(STATE_CHOICES)];
  for (const list of lists) {
    for (const e of list) {
      out.add(e.label);
      if (e.about) out.add(e.about);
    }
  }
  return [...out];
}
