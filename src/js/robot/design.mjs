// ---------- The robot's design: what it looks like ----------
// Pure data and small functions (no DOM, no three.js), used by the page (the
// Robot Studio, the 3D robot) and by the helper (which cleans what is saved).
// A design is one plain object:
//
//   colors    head, body, arms, joint (neck and shoulders), light (fins, ring, eyes;
//             "" = the app's accent color), face (eyes and mouth; "" = the light), user (the
//             light while you talk; "" = picked to differ from the light), patternColor (secondary
//             color for body patterns and decals)
//   finish    how the shell feels: matte … glow_in_dark
//   glow      how bright its lights are
//   build     size, head, roundness, width, height, arms, hands, top (sizes, 0.5 … 1.6) and the
//             shapes: bodyShape, headShape, handStyle, topStyle, hover, bodyPattern, decal, badgeText
//   face      eyes (a style), eyeSize, eyeGap, mouth (a style), blush, blushLevel,
//             blinkRate, blinkStyle, pupilStyle, cheekLights, foreheadLight
//   outfit    eight slots (hat, glasses, headgear, neck, torso, back, chest, held), each
//             { item, c1, c2, pattern }
//   behaviors personality sliders, preset, and per-idle-behavior switches & frequencies
//
// The catalogs below hold the English names the Studio shows (the helper's
// translation check reads them from here: see labels()). The 3D shapes are made in
// model.js and outfit/*.js; every id here has one.

export const HEX = /^#[0-9a-f]{6}$/i;

const entries = (list) => Object.fromEntries(list.map((e) => [e.id, e]));

// ---------- Choices ----------
export const FINISHES = [
  { id: "matte", label: "Matte", icon: "◌" },
  { id: "satin", label: "Satin", icon: "◍" },
  { id: "glossy", label: "Glossy", icon: "●" },
  { id: "metal", label: "Metallic", icon: "◆" },
  { id: "pearl", label: "Pearl", icon: "✦" },
  { id: "felt", label: "Felt", icon: "🧶" },
  { id: "clay", label: "Clay", icon: "🏺" },
  { id: "glass", label: "Glass", icon: "🫧" },
  { id: "wood", label: "Wood", icon: "🪵" },
  { id: "brushed_metal", label: "Brushed metal", icon: "⚙" },
  { id: "holographic", label: "Holographic", icon: "🌈" },
  { id: "glow_in_dark", label: "Glow in the dark", icon: "✨" },
];

export const TOPS = [
  { id: "fins", label: "Glowing fins", icon: "" },
  { id: "antenna", label: "Antenna", icon: "" },
  { id: "twin", label: "Two antennae", icon: "" },
  { id: "cat", label: "Cat ears", icon: "" },
  { id: "bear", label: "Bear ears", icon: "" },
  { id: "bunny", label: "Bunny ears", icon: "" },
  { id: "fox", label: "Fox ears", icon: "" },
  { id: "dog", label: "Floppy ears", icon: "" },
  { id: "sprout", label: "Sprout", icon: "" },
  { id: "leaf", label: "Double leaf", icon: "" },
  { id: "horns", label: "Little horns", icon: "" },
  { id: "crown_fins", label: "Royal crest", icon: "" },
  { id: "halo_ears", label: "Head wings", icon: "" },
  { id: "radar", label: "Radar dish", icon: "" },
  { id: "crystal", label: "Crystal spire", icon: "" },
  { id: "star_top", label: "Star topper", icon: "" },
  { id: "none", label: "Nothing", icon: "∅" },
];

export const BODIES = [
  { id: "bean", label: "Bean", icon: "" },
  { id: "egg", label: "Egg", icon: "" },
  { id: "capsule", label: "Capsule", icon: "" },
  { id: "ball", label: "Ball", icon: "" },
  { id: "pear", label: "Pear", icon: "" },
  { id: "boxy", label: "Boxy", icon: "" },
  { id: "cylinder", label: "Cylinder", icon: "" },
  { id: "octa", label: "Octagon", icon: "" },
  { id: "cushion", label: "Cushion", icon: "" },
  { id: "hourglass", label: "Hourglass", icon: "" },
  { id: "cone", label: "Bell", icon: "" },
];

export const HEADS = [
  { id: "pill", label: "Pill", icon: "" },
  { id: "tv", label: "TV monitor", icon: "" },
  { id: "round", label: "Sphere", icon: "" },
  { id: "tall", label: "Tall dome", icon: "" },
  { id: "bean", label: "Soft bean", icon: "" },
  { id: "hood", label: "Hooded", icon: "" },
  { id: "cube", label: "Rounded cube", icon: "" },
  { id: "visor_head", label: "Sleek visor", icon: "" },
  { id: "dome", label: "Observatory", icon: "" },
  { id: "wide_head", label: "Widescreen", icon: "" },
];

export const HANDS = [
  { id: "paddle", label: "Paddles", icon: "" },
  { id: "ball", label: "Balls", icon: "" },
  { id: "mitten", label: "Mittens", icon: "" },
  { id: "pincer", label: "Pincers", icon: "" },
  { id: "paws", label: "Cat paws", icon: "" },
  { id: "cuffs", label: "Floating cuffs", icon: "" },
  { id: "three_finger", label: "Three fingers", icon: "" },
  { id: "star_hand", label: "Star hands", icon: "" },
  { id: "magnet", label: "Magnets", icon: "" },
];

export const HOVERS = [
  { id: "ring", label: "Ring", icon: "⭕" },
  { id: "double", label: "Two rings", icon: "" },
  { id: "jets", label: "Jets", icon: "" },
  { id: "disc", label: "Hover disc", icon: "" },
  { id: "feet", label: "Little feet", icon: "" },
  { id: "thruster", label: "Rocket cone", icon: "" },
  { id: "cloud_base", label: "Fluffy cloud", icon: "" },
  { id: "saucer", label: "UFO saucer", icon: "" },
  { id: "pedestal", label: "Lotus base", icon: "" },
  { id: "wheels", label: "Roller wheels", icon: "" },
  { id: "none", label: "Nothing", icon: "∅" },
];

// Eye styles: the numbers are in presets.mjs (EYE_STYLES); these are the names
export const EYES = [
  { id: "classic", label: "Classic", icon: "▮▮" },
  { id: "round", label: "Round", icon: "●●" },
  { id: "wide", label: "Wide", icon: "▬▬" },
  { id: "big", label: "Big", icon: "◉◉" },
  { id: "dots", label: "Dots", icon: "••" },
  { id: "tall", label: "Tall", icon: "" },
  { id: "square", label: "Pixel", icon: "■■" },
  { id: "visor", label: "Visor", icon: "▬" },
  { id: "anime", label: "Sparkle anime", icon: "✪✪" },
  { id: "crescent", label: "Happy arcs", icon: "◠◠" },
  { id: "sleepy_eyes", label: "Cosy lids", icon: "म्मच" },
  { id: "star_eyes", label: "Starry", icon: "★★" },
  { id: "heart_eyes", label: "Heart eyes", icon: "♥♥" },
  { id: "cyber", label: "Cyber slit", icon: "▰▱" },
  { id: "wink_eyes", label: "Playful wink", icon: "●◠" },
];

export const MOUTHS = [
  { id: "line", label: "Smile", icon: "‿" },
  { id: "small", label: "Small", icon: "·" },
  { id: "wide", label: "Wide", icon: "⌣" },
  { id: "bold", label: "Bold", icon: "◡" },
  { id: "cat_mouth", label: "Cat :3", icon: "ω" },
  { id: "zigzag", label: "Zigzag", icon: "﹏" },
  { id: "tooth", label: "Little fang", icon: "▾" },
  { id: "o_mouth", label: "Round O", icon: "○" },
  { id: "smirk", label: "Smirk", icon: "◞" },
  { id: "beak", label: "Beak", icon: "◇" },
  { id: "none", label: "None", icon: "∅" },
];

export const BLINK_STYLES = [
  { id: "normal", label: "Natural" },
  { id: "slow", label: "Slow & calm" },
  { id: "double", label: "Double blink" },
  { id: "flutter", label: "Flutter" },
  { id: "wink", label: "Occasional wink" },
];

export const PUPIL_STYLES = [
  { id: "none", label: "Solid glow" },
  { id: "dot", label: "Soft pupil" },
  { id: "ring", label: "Iris ring" },
  { id: "star", label: "Star pupil" },
  { id: "heart", label: "Heart pupil" },
  { id: "slit", label: "Cat slit" },
];

export const PATTERNS = [
  { id: "solid", label: "Plain", icon: "■" },
  { id: "stripes", label: "Stripes", icon: "" },
  { id: "bands", label: "Bands", icon: "≡" },
  { id: "dots", label: "Dots", icon: "⁘" },
  { id: "checks", label: "Checks", icon: "▦" },
  { id: "gradient", label: "Fade", icon: "◐" },
  { id: "stars", label: "Stars", icon: "" },
  { id: "hearts", label: "Hearts", icon: "♥" },
  { id: "waves", label: "Waves", icon: "≈" },
  { id: "diamonds", label: "Diamonds", icon: "❖" },
  { id: "circuits", label: "Circuits", icon: "⌗" },
  { id: "flames", label: "Flames", icon: "🔥" },
  { id: "clouds", label: "Clouds", icon: "☁" },
  { id: "galaxy", label: "Galaxy", icon: "✦" },
];

export const DECALS = [
  { id: "none", label: "None", icon: "∅" },
  { id: "star_decal", label: "Star emblem", icon: "★" },
  { id: "heart_decal", label: "Heart emblem", icon: "♥" },
  { id: "bolt_decal", label: "Lightning", icon: "⚡" },
  { id: "planet_decal", label: "Ringed planet", icon: "🪐" },
  { id: "music_decal", label: "Music note", icon: "♪" },
  { id: "leaf_decal", label: "Leaf", icon: "🍃" },
  { id: "gamepad_decal", label: "Gamepad", icon: "🎮" },
  { id: "paw_decal", label: "Paw print", icon: "🐾" },
  { id: "smile_decal", label: "Smiley", icon: "☺" },
  { id: "shield_decal", label: "Crest", icon: "🛡" },
];

// ---------- Outfit ----------
// items[id].colors: the colors it starts with; names: what each color is called
export const SLOTS = [
  { id: "hat", label: "Hat", pattern: false },
  { id: "glasses", label: "Face", pattern: false },
  { id: "headgear", label: "Ears", pattern: false },
  { id: "neck", label: "Neck", pattern: false },
  { id: "torso", label: "Clothes", pattern: true },
  { id: "back", label: "Back", pattern: false },
  { id: "chest", label: "Chest", pattern: false },
  { id: "held", label: "In hand", pattern: false },
];

const none = { id: "none", label: "Nothing", icon: "∅", colors: [], names: [] };
const item = (id, label, icon, colors, names) => ({ id, label, icon, colors, names });

export const OUTFIT = {
  hat: [
    none,
    item("beanie", "Beanie", "hat", ["#e05a47", "#f4efe6"], ["Hat", "Bobble"]),
    item("cap", "Cap", "hat", ["#3b6fd6", "#f4efe6"], ["Cap", "Button"]),
    item("tophat", "Top hat", "hat", ["#26282e", "#c0392b"], ["Hat", "Band"]),
    item("beret", "Beret", "hat", ["#c0392b", "#26282e"], ["Beret", "Stalk"]),
    item("party", "Party hat", "hat", ["#f06bb0", "#ffd34d"], ["Hat", "Pompom"]),
    item("crown", "Crown", "hat", ["#f2c14e", "#d9435b"], ["Crown", "Jewels"]),
    item("wizard", "Wizard hat", "hat", ["#5b4bb7", "#ffd34d"], ["Hat", "Stars"]),
    item("chef", "Chef's hat", "hat", ["#f6f4ef", "#d8d3c8"], ["Hat", "Folds"]),
    item("propeller", "Propeller cap", "hat", ["#4aa3df", "#e8453c"], ["Cap", "Blades"]),
    item("cowboy", "Cowboy hat", "hat", ["#a3743f", "#5b3a1e"], ["Hat", "Band"]),
    item("santa", "Santa hat", "hat", ["#d32f2f", "#f8f5ee"], ["Hat", "Fur"]),
    item("bow", "Big bow", "hat", ["#f06bb0", "#c2417f"], ["Bow", "Knot"]),
    item("flower", "Flower", "hat", ["#f48fb1", "#ffd54f"], ["Petals", "Middle"]),
    item("halo", "Halo", "hat", ["#ffe27a", "#ffffff"], ["Halo", "Glow"]),
    item("pirate", "Pirate hat", "hat", ["#22252b", "#f2c14e"], ["Hat", "Trim"]),
    item("graduation", "Mortarboard", "hat", ["#242834", "#f2c14e"], ["Cap", "Tassel"]),
    item("detective_hat", "Deerhunter hat", "hat", ["#8a6642", "#4a3520"], ["Cloth", "Ribbon"]),
    item("flower_crown", "Flower crown", "hat", ["#f48fb1", "#66bb6a"], ["Blossoms", "Vines"]),
    item("bucket_hat", "Bucket hat", "hat", ["#f6e08a", "#3b6fd6"], ["Hat", "Band"]),
    item("astronaut_dome", "Space dome", "hat", ["#e2e7ee", "#6ee7f9"], ["Rim", "Glass"]),
    item("nightcap", "Sleepy nightcap", "hat", ["#7a5cf0", "#f4efe6"], ["Cap", "Pompom"]),
    item("viking", "Horned helmet", "hat", ["#8f96a3", "#f4efe6"], ["Helmet", "Horns"]),
    item("straw_hat", "Sun hat", "hat", ["#e6c27a", "#d9534f"], ["Straw", "Ribbon"]),
  ],
  glasses: [
    none,
    item("round", "Round glasses", "glasses", ["#2b2e35", "#bfe3ff"], ["Frame", "Lens"]),
    item("square", "Square glasses", "glasses", ["#d9534f", "#bfe3ff"], ["Frame", "Lens"]),
    item("sunglasses", "Sunglasses", "glasses", ["#16181d", "#2b3345"], ["Frame", "Lens"]),
    item("heart", "Heart glasses", "glasses", ["#e84a7f", "#ffb3cd"], ["Frame", "Lens"]),
    item("star", "Star glasses", "glasses", ["#f2c14e", "#fff3b0"], ["Frame", "Lens"]),
    item("visor", "Visor", "glasses", ["#2b2e35", "#6ee7f9"], ["Frame", "Lens"]),
    item("monocle", "Monocle", "glasses", ["#c9a227", "#e8f6ff"], ["Frame", "Lens"]),
    item("eyepatch", "Eye patch", "glasses", ["#1d1f24", "#1d1f24"], ["Patch", "Strap"]),
    item("mustache", "Mustache", "glasses", ["#7b4a2a", "#936036"], ["Mustache", "Tips"]),
    item("cyber_visor", "Neon visor", "glasses", ["#1a1d24", "#5eead4"], ["Frame", "Glow"]),
    item("pixel_shades", "Pixel shades", "glasses", ["#111318", "#f4efe6"], ["Frame", "Pixels"]),
    item("safety_goggles", "Lab goggles", "glasses", ["#f2c14e", "#bfe3ff"], ["Frame", "Lens"]),
    item("reading_glasses", "Half-rim glasses", "glasses", ["#8a5a33", "#e8f6ff"], ["Frame", "Lens"]),
    item("sleep_mask", "Sleep mask", "glasses", ["#7a5cf0", "#f4efe6"], ["Mask", "Piping"]),
    item("cat_eye", "Cat-eye frames", "glasses", ["#d9435b", "#ffe4ec"], ["Frame", "Lens"]),
    item("aviator", "Aviators", "glasses", ["#d9b25a", "#263547"], ["Frame", "Lens"]),
    item("clown_nose", "Red nose", "glasses", ["#e8453c", "#ff9e99"], ["Nose", "Highlight"]),
  ],
  headgear: [
    none,
    item("headphones", "Headphones", "headphones", ["#2b2e35", "#6f9cf5"], ["Band", "Cushions"]),
    item("headset", "Headset with mic", "headphones", ["#2b2e35", "#f06bb0"], ["Band", "Cushions"]),
    item("earmuffs", "Earmuffs", "headphones", ["#e05a47", "#f4efe6"], ["Band", "Fluff"]),
    item("cat_headband", "Kitty headset", "headphones", ["#f48fb1", "#f8f5ee"], ["Band", "Ears"]),
    item("vr_headset", "VR headset", "headphones", ["#e2e7ee", "#3b6fd6"], ["Visor", "Strap"]),
    item("laurel_wreath", "Golden wreath", "headphones", ["#f2c14e", "#d9b25a"], ["Leaves", "Ribbon"]),
    item("tiara", "Crystal tiara", "headphones", ["#e2e7ee", "#6ee7f9"], ["Crown", "Gems"]),
    item("antlers", "Reindeer antlers", "headphones", ["#8a5a33", "#d9534f"], ["Antlers", "Bells"]),
    item("sweatband", "Sport headband", "headphones", ["#e8453c", "#f4efe6"], ["Band", "Stripe"]),
    item("earbuds", "Wireless buds", "headphones", ["#f8f5ee", "#6ee7f9"], ["Buds", "Accent"]),
  ],
  neck: [
    none,
    item("scarf", "Scarf", "link", ["#d9534f", "#f4efe6"], ["Scarf", "Stripes"]),
    item("bowtie", "Bow tie", "link", ["#c0392b", "#8e2a20"], ["Bow", "Knot"]),
    item("tie", "Necktie", "link", ["#2a6fdb", "#f4efe6"], ["Tie", "Stripes"]),
    item("bandana", "Bandana", "link", ["#c0392b", "#f4efe6"], ["Cloth", "Dots"]),
    item("ruff", "Frilly collar", "link", ["#f6f4ef", "#d8d3c8"], ["Frill", "Shade"]),
    item("medal", "Medal", "link", ["#f2c14e", "#d9435b"], ["Medal", "Ribbon"]),
    item("bell", "Collar with bell", "link", ["#d9534f", "#f2c14e"], ["Collar", "Bell"]),
    item("collar", "Shirt collar", "link", ["#f6f4ef", "#2a6fdb"], ["Collar", "Tie"]),
    item("camera", "Camera on strap", "link", ["#2b2e35", "#c4c9d2"], ["Body", "Lens"]),
    item("stethoscope", "Stethoscope", "link", ["#3b6fd6", "#c4c9d2"], ["Tubing", "Chestpiece"]),
    item("lei", "Flower lei", "link", ["#f48fb1", "#ffd54f"], ["Flowers", "Leaves"]),
    item("lanyard", "VIP pass", "link", ["#3b6fd6", "#f4efe6"], ["Strap", "Card"]),
    item("pearls", "Pearl necklace", "link", ["#f8f5ee", "#f2c14e"], ["Pearls", "Clasp"]),
    item("chain", "Gold chain", "link", ["#f2c14e", "#d9b25a"], ["Links", "Shine"]),
    item("cape_clasp", "Cloak clasp", "link", ["#5b4bb7", "#f2c14e"], ["Cloak", "Brooch"]),
  ],
  torso: [
    none,
    item("tee", "T-shirt", "shirt", ["#3b9be0", "#f4efe6"], ["Shirt", "Pattern"]),
    item("sweater", "Sweater", "shirt", ["#d9534f", "#f4efe6"], ["Sweater", "Pattern"]),
    item("hoodie", "Hoodie", "shirt", ["#6f5bd6", "#f4efe6"], ["Hoodie", "Strings"]),
    item("vest", "Vest", "shirt", ["#3a4a63", "#c9a227"], ["Vest", "Buttons"]),
    item("overalls", "Overalls", "shirt", ["#3b6fd6", "#f2c14e"], ["Overalls", "Buttons"]),
    item("apron", "Apron", "shirt", ["#f4efe6", "#d9534f"], ["Apron", "Trim"]),
    item("jacket", "Jacket", "shirt", ["#2b2e35", "#f2c14e"], ["Jacket", "Trim"]),
    item("cardigan", "Cozy cardigan", "shirt", ["#c47a5a", "#f4efe6"], ["Knit", "Buttons"]),
    item("tuxedo", "Tuxedo", "shirt", ["#1d1f24", "#f8f5ee"], ["Suit", "Shirt"]),
    item("raincoat", "Raincoat", "shirt", ["#ffd34d", "#2b2e35"], ["Coat", "Toggles"]),
    item("lab_coat", "Lab coat", "shirt", ["#f8f5ee", "#6ee7f9"], ["Coat", "Lapel"]),
    item("kimono", "Haori coat", "shirt", ["#4d8a62", "#f6e08a"], ["Coat", "Sash"]),
    item("armor", "Space armor", "shirt", ["#8f96a3", "#5eead4"], ["Plates", "Core"]),
    item("puffer", "Puffer vest", "shirt", ["#e05a47", "#f4efe6"], ["Quilt", "Zip"]),
    item("tracksuit", "Track jacket", "shirt", ["#2a6fdb", "#f8f5ee"], ["Jacket", "Stripes"]),
  ],
  back: [
    none,
    item("cape", "Cape", "cape", ["#c0392b", "#f2c14e"], ["Cape", "Lining"]),
    item("backpack", "Backpack", "cape", ["#e08a2b", "#2b2e35"], ["Pack", "Straps"]),
    item("wings", "Angel wings", "cape", ["#ffffff", "#e6eefc"], ["Wings", "Shade"]),
    item("butterfly", "Butterfly wings", "cape", ["#7a5cf0", "#f06bb0"], ["Top", "Bottom"]),
    item("jetpack", "Jetpack", "cape", ["#9aa3b2", "#e8453c"], ["Tanks", "Flames"]),
    item("tail", "Fluffy tail", "cape", ["#e08a2b", "#f8f5ee"], ["Tail", "Tip"]),
    item("guitar_back", "Acoustic guitar", "cape", ["#a3743f", "#2b2e35"], ["Wood", "Neck"]),
    item("quiver", "Bow & quiver", "cape", ["#8a5a33", "#4d8a62"], ["Leather", "Feathers"]),
    item("balloon_pack", "Balloon bunch", "cape", ["#e84a7f", "#ffd34d"], ["Balloons", "Strings"]),
    item("fairy_wings", "Crystal wings", "cape", ["#5eead4", "#c9b8f0"], ["Top", "Bottom"]),
    item("mech_wings", "Mecha wings", "cape", ["#3a4a63", "#6ee7f9"], ["Blades", "Glow"]),
    item("skateboard_back", "Skateboard", "cape", ["#2b2e35", "#e8453c"], ["Deck", "Wheels"]),
    item("shell_pack", "Cozy shell", "cape", ["#4d8a62", "#f6e08a"], ["Shell", "Rim"]),
    item("wind_key", "Wind-up key", "cape", ["#f2c14e", "#c9a227"], ["Key", "Stem"]),
  ],
  chest: [
    none,
    item("core", "Glowing core", "badge", ["", "#2b2e35"], ["Light", "Rim"]),
    item("heart", "Heart", "badge", ["#e84a7f", "#ffb3cd"], ["Heart", "Shine"]),
    item("star", "Star", "badge", ["#f2c14e", "#fff3b0"], ["Star", "Shine"]),
    item("bolt", "Lightning bolt", "badge", ["#ffd34d", "#e08a2b"], ["Bolt", "Edge"]),
    item("badge", "Name badge", "badge", ["#f4efe6", "#3b6fd6"], ["Badge", "Stripe"]),
    item("buttons", "Buttons", "badge", ["#26282e", "#f2c14e"], ["Buttons", "Rims"]),
    item("planet_badge", "Ringed planet", "badge", ["#6f9cf5", "#ffd34d"], ["Planet", "Ring"]),
    item("music_badge", "Music note", "badge", ["#c084fc", "#f8f5ee"], ["Note", "Glow"]),
    item("sheriff_star", "Sheriff star", "badge", ["#f2c14e", "#8a5a33"], ["Star", "Points"]),
    item("compass_badge", "Compass rose", "badge", ["#c9a227", "#e8453c"], ["Rim", "Needle"]),
    item("clover", "Four-leaf clover", "badge", ["#4d8a62", "#a3e635"], ["Leaves", "Stem"]),
    item("rose_pin", "Rose pin", "badge", ["#d9435b", "#4d8a62"], ["Petals", "Leaf"]),
    item("pocket_watch", "Pocket watch", "badge", ["#f2c14e", "#f8f5ee"], ["Case", "Face"]),
    item("equalizer", "Audio bars", "badge", ["#5eead4", "#3b6fd6"], ["Bars", "Frame"]),
  ],
  held: [
    none,
    item("mug", "Warm mug", "hand", ["#e05a47", "#f4efe6"], ["Mug", "Drink"]),
    item("book", "Open book", "hand", ["#3b6fd6", "#f6f4ef"], ["Cover", "Pages"]),
    item("tablet", "Glowing tablet", "hand", ["#2b2e35", "#6ee7f9"], ["Case", "Screen"]),
    item("pen", "Stylus pen", "hand", ["#2b2e35", "#f2c14e"], ["Barrel", "Tip"]),
    item("wrench", "Wrench", "hand", ["#8f96a3", "#e05a47"], ["Metal", "Grip"]),
    item("wand", "Star wand", "hand", ["#f2c14e", "#f06bb0"], ["Star", "Handle"]),
    item("microphone", "Stage mic", "hand", ["#2b2e35", "#c4c9d2"], ["Body", "Grille"]),
    item("flower_held", "Fresh flower", "hand", ["#f48fb1", "#4d8a62"], ["Blossom", "Stem"]),
    item("balloon", "Floating balloon", "hand", ["#e84a7f", "#f8f5ee"], ["Balloon", "String"]),
    item("lantern", "Cozy lantern", "hand", ["#2b2e35", "#ffb074"], ["Frame", "Flame"]),
    item("paintbrush", "Paintbrush", "hand", ["#a3743f", "#3b9be0"], ["Handle", "Paint"]),
    item("gamepad", "Game controller", "hand", ["#2b2e35", "#6f5bd6"], ["Body", "Buttons"]),
    item("magnifying_glass", "Magnifier", "hand", ["#c9a227", "#bfe3ff"], ["Frame", "Lens"]),
    item("umbrella", "Little umbrella", "hand", ["#3b6fd6", "#f2c14e"], ["Canopy", "Handle"]),
    item("shield", "Round shield", "hand", ["#3a4a63", "#f2c14e"], ["Shield", "Rim"]),
  ],
};

export const ITEMS = Object.fromEntries(Object.entries(OUTFIT).map(([slot, list]) => [slot, entries(list)]));

// ---------- Colors to pick from ----------
export const SHELL_COLORS = [
  { id: "warm", label: "Warm white", color: "#ede4d6" },
  { id: "cloud", label: "Cloud", color: "#e2e7ee" },
  { id: "graphite", label: "Graphite", color: "#50555f" },
  { id: "peach", label: "Peach", color: "#f0ccb6" },
  { id: "mint", label: "Mint", color: "#c9e5d6" },
  { id: "rose", label: "Rose", color: "#f4b6c8" },
  { id: "butter", label: "Butter", color: "#f6e08a" },
  { id: "sky", label: "Sky", color: "#a9d0f5" },
  { id: "lavender", label: "Lavender", color: "#c9b8f0" },
  { id: "coral", label: "Coral", color: "#f08a73" },
  { id: "forest", label: "Forest", color: "#4d8a62" },
  { id: "navy", label: "Midnight", color: "#2b3a67" },
  { id: "ink", label: "Ink", color: "#25272d" },
  { id: "silver", label: "Silver", color: "#c4c9d2" },
  { id: "gold", label: "Gold", color: "#d9b25a" },
  { id: "copper", label: "Copper", color: "#c47a5a" },
];

export const JOINT_COLORS = ["#2b2e35", "#f4efe6", "#8f96a3", "#d9534f", "#3b6fd6", "#f2c14e", "#4d8a62", "#f06bb0"];

export const LIGHT_COLORS = ["#6f9cf5", "#5eead4", "#a3e635", "#ffd34d", "#ffb074", "#f472b6", "#c084fc", "#ff6b6b", "#ffffff"];

// Ready-made harmonious color palettes for one-click recoloring in the Studio
export const COLOR_PALETTES = [
  { id: "warm_oat", label: "Warm oat", colors: { head: "#ede4d6", body: "#ede4d6", arms: "#ede4d6", joint: "#2b2e35", light: "#ffb074", face: "", patternColor: "#d9b25a" }, finish: "glossy" },
  { id: "peach_tea", label: "Peach tea", colors: { head: "#f0ccb6", body: "#ede4d6", arms: "#f0ccb6", joint: "#8a5a33", light: "#f472b6", face: "", patternColor: "#f08a73" }, finish: "satin" },
  { id: "mint_matcha", label: "Matcha mint", colors: { head: "#c9e5d6", body: "#4d8a62", arms: "#c9e5d6", joint: "#2b2e35", light: "#a3e635", face: "", patternColor: "#f6e08a" }, finish: "matte" },
  { id: "midnight_cyan", label: "Midnight neon", colors: { head: "#25272d", body: "#25272d", arms: "#50555f", joint: "#5eead4", light: "#5eead4", face: "#5eead4", patternColor: "#6f9cf5" }, finish: "brushed_metal" },
  { id: "lavender_dream", label: "Lavender cloud", colors: { head: "#c9b8f0", body: "#e2e7ee", arms: "#c9b8f0", joint: "#5b4bb7", light: "#c084fc", face: "", patternColor: "#f4b6c8" }, finish: "pearl" },
  { id: "solar_brass", label: "Solar brass", colors: { head: "#d9b25a", body: "#ede4d6", arms: "#d9b25a", joint: "#5b3a1e", light: "#ffd34d", face: "", patternColor: "#c47a5a" }, finish: "metal" },
  { id: "cotton_candy", label: "Cotton candy", colors: { head: "#f4b6c8", body: "#a9d0f5", arms: "#f4b6c8", joint: "#f4efe6", light: "#f472b6", face: "", patternColor: "#ffd34d" }, finish: "felt" },
  { id: "terracotta_clay", label: "Terracotta", colors: { head: "#c47a5a", body: "#f0ccb6", arms: "#c47a5a", joint: "#4a3326", light: "#ffb074", face: "", patternColor: "#ede4d6" }, finish: "clay" },
  { id: "nordic_wood", label: "Nordic wood", colors: { head: "#ede4d6", body: "#c47a5a", arms: "#ede4d6", joint: "#5b3a1e", light: "#ffd34d", face: "", patternColor: "#4d8a62" }, finish: "wood" },
  { id: "holo_prism", label: "Holo prism", colors: { head: "#e2e7ee", body: "#c9b8f0", arms: "#a9d0f5", joint: "#8f96a3", light: "#5eead4", face: "", patternColor: "#f472b6" }, finish: "holographic" },
];

// ---------- Personality & Behavior settings (A.2 & A.3) ----------
export const IDLE_BEHAVIORS = [
  { id: "breathe", label: "Breathing and hover drift", defaultFreq: 1 },
  { id: "lookAround", label: "Looking around the room", defaultFreq: 1 },
  { id: "inspectProp", label: "Inspecting room props", defaultFreq: 1 },
  { id: "stretch", label: "Stretching", defaultFreq: 1 },
  { id: "yawn", label: "Yawning when quiet", defaultFreq: 1 },
  { id: "hum", label: "Humming and whistling", defaultFreq: 1 },
  { id: "fidget", label: "Fidgeting and bouncing", defaultFreq: 1 },
  { id: "tinker", label: "Tinkering with tools", defaultFreq: 1 },
  { id: "readBook", label: "Reading a book", defaultFreq: 1 },
  { id: "waterPlant", label: "Watering the plant", defaultFreq: 1 },
  { id: "sipDrink", label: "Sipping a warm drink", defaultFreq: 1 },
  { id: "checkTablet", label: "Checking its tablet", defaultFreq: 1 },
  { id: "nap", label: "Napping when away for long", defaultFreq: 1 },
];

export const BEHAVIOR_SLIDERS = [
  { id: "energy", label: "Energy", defaultVal: 1 },
  { id: "curiosity", label: "Curiosity", defaultVal: 1 },
  { id: "playfulness", label: "Playfulness", defaultVal: 1 },
  { id: "clumsiness", label: "Clumsiness", defaultVal: 0.2 },
  { id: "shyness", label: "Shyness", defaultVal: 0.3 },
  { id: "expressiveness", label: "Expressiveness", defaultVal: 1 },
  { id: "talkMotion", label: "Motion while talking", defaultVal: 1 },
  { id: "roamRange", label: "Roaming range", defaultVal: 1 },
  { id: "personalSpace", label: "Personal space", defaultVal: 1 },
  { id: "reactionStrength", label: "Reaction strength", defaultVal: 1 },
];

export const BEHAVIOR_PRESETS = [
  {
    id: "balanced", label: "Balanced", icon: "⚖",
    sliders: { energy: 1, curiosity: 1, playfulness: 1, clumsiness: 0.2, shyness: 0.3, expressiveness: 1, talkMotion: 1, roamRange: 1, personalSpace: 1, reactionStrength: 1 },
  },
  {
    id: "calm", label: "Calm", icon: "🍵",
    sliders: { energy: 0.55, curiosity: 0.8, playfulness: 0.5, clumsiness: 0.05, shyness: 0.35, expressiveness: 0.75, talkMotion: 0.65, roamRange: 0.6, personalSpace: 1.2, reactionStrength: 0.7 },
  },
  {
    id: "bubbly", label: "Bubbly", icon: "🫧",
    sliders: { energy: 1.55, curiosity: 1.4, playfulness: 1.65, clumsiness: 0.35, shyness: 0.1, expressiveness: 1.5, talkMotion: 1.45, roamRange: 1.4, personalSpace: 0.7, reactionStrength: 1.45 },
  },
  {
    id: "dramatic", label: "Dramatic", icon: "🎭",
    sliders: { energy: 1.35, curiosity: 1.2, playfulness: 1.3, clumsiness: 0.45, shyness: 0.2, expressiveness: 1.8, talkMotion: 1.7, roamRange: 1.35, personalSpace: 0.85, reactionStrength: 1.75 },
  },
  {
    id: "sleepy", label: "Sleepy", icon: "🌙",
    sliders: { energy: 0.35, curiosity: 0.45, playfulness: 0.4, clumsiness: 0.5, shyness: 0.6, expressiveness: 0.65, talkMotion: 0.45, roamRange: 0.4, personalSpace: 1.3, reactionStrength: 0.6 },
  },
  {
    id: "mischievous", label: "Mischievous", icon: "😈",
    sliders: { energy: 1.4, curiosity: 1.7, playfulness: 1.8, clumsiness: 0.6, shyness: 0.05, expressiveness: 1.45, talkMotion: 1.3, roamRange: 1.65, personalSpace: 0.65, reactionStrength: 1.4 },
  },
];

// ---------- Numbers ----------
// [min, max, default, step]
export const RANGES = {
  glow: [0.4, 1.6, 1, 0.05],
  build: {
    size: [0.85, 1.2, 1, 0.01],
    head: [0.8, 1.3, 1, 0.01],
    roundness: [0, 1, 0.5, 0.01],
    width: [0.8, 1.3, 1, 0.01],
    height: [0.8, 1.35, 1, 0.01],
    arms: [0.6, 1.5, 1, 0.01],
    hands: [0.7, 1.4, 1, 0.01],
    top: [0.5, 1.6, 1, 0.01],
  },
  face: {
    eyeSize: [0.7, 1.4, 1, 0.01],
    eyeGap: [0.7, 1.3, 1, 0.01],
    blinkRate: [0, 2, 1, 0.05],
    blushLevel: [0, 1.5, 1, 0.05],
  },
  behaviors: Object.fromEntries(BEHAVIOR_SLIDERS.map((s) => [s.id, [0, 2, s.defaultVal, 0.05]])),
  idleFreq: [0.2, 2.5, 1, 0.1],
};

export const DEFAULT_BEHAVIORS = Object.freeze({
  preset: "balanced",
  ...Object.fromEntries(BEHAVIOR_SLIDERS.map((s) => [s.id, s.defaultVal])),
  idle: Object.fromEntries(IDLE_BEHAVIORS.map((b) => [b.id, { on: true, freq: b.defaultFreq }])),
});

// ---------- The default robot ----------
export const DEFAULT_DESIGN = Object.freeze({
  colors: { head: "#ede4d6", body: "#ede4d6", arms: "#ede4d6", joint: "#2b2e35", light: "", face: "", user: "", patternColor: "#d9b25a" },
  finish: "glossy",
  glow: 1,
  build: {
    size: 1, head: 1, roundness: 0.5, width: 1, height: 1, arms: 1, hands: 1, top: 1,
    bodyShape: "bean", headShape: "pill", handStyle: "paddle", topStyle: "fins", hover: "ring",
    bodyPattern: "solid", decal: "none", badgeText: "",
  },
  face: {
    eyes: "classic", eyeSize: 1, eyeGap: 1, mouth: "line", blush: "#ff6f91",
    blushLevel: 1, blinkRate: 1, blinkStyle: "normal", pupilStyle: "none",
    cheekLights: true, foreheadLight: true,
  },
  outfit: Object.fromEntries(SLOTS.map((s) => [s.id, { item: "none", c1: "", c2: "", pattern: "solid" }])),
  behaviors: DEFAULT_BEHAVIORS,
});

export const defaultDesign = () => JSON.parse(JSON.stringify(DEFAULT_DESIGN));

// ---------- Cleaning ----------
const oneOf = (list, value, fallback) => (list.some((e) => e.id === value) ? value : fallback);
const color = (value, fallback, allowEmpty = false) => (typeof value === "string" && HEX.test(value) ? value.toLowerCase() : allowEmpty && value === "" ? "" : fallback);
const num = (value, [min, max, def]) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 1000) / 1000)) : def;
};
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function sanitizeBehaviors(input, base = DEFAULT_BEHAVIORS) {
  const raw = obj(input);
  const b = { ...DEFAULT_BEHAVIORS, ...obj(base) };
  const out = JSON.parse(JSON.stringify(DEFAULT_BEHAVIORS));
  out.preset = oneOf(BEHAVIOR_PRESETS, raw.preset, oneOf(BEHAVIOR_PRESETS, b.preset, "balanced"));
  for (const s of BEHAVIOR_SLIDERS) {
    out[s.id] = num(raw[s.id] ?? b[s.id], RANGES.behaviors[s.id]);
  }
  const rawIdle = obj(raw.idle);
  const baseIdle = obj(b.idle);
  for (const item of IDLE_BEHAVIORS) {
    const ri = obj(rawIdle[item.id]);
    const bi = obj(baseIdle[item.id]);
    out.idle[item.id] = {
      on: typeof ri.on === "boolean" ? ri.on : typeof bi.on === "boolean" ? bi.on : true,
      freq: num(ri.freq ?? bi.freq, RANGES.idleFreq),
    };
  }
  return out;
}

// Any input becomes a complete, valid design; anything unknown falls back to `base`
export function sanitizeDesign(input, base = DEFAULT_DESIGN) {
  const d = obj(input);
  const out = defaultDesign();
  const b = { ...DEFAULT_DESIGN, ...obj(base) };
  const c = obj(d.colors);
  const bc = { ...DEFAULT_DESIGN.colors, ...obj(b.colors) };
  for (const key of ["head", "body", "arms", "joint", "patternColor"]) out.colors[key] = color(c[key], color(bc[key], DEFAULT_DESIGN.colors[key]));
  for (const key of ["light", "face", "user"]) out.colors[key] = color(c[key], color(bc[key], "", true), true);
  out.finish = oneOf(FINISHES, d.finish, oneOf(FINISHES, b.finish, "glossy"));
  out.glow = num(d.glow ?? b.glow, RANGES.glow);

  const bd = obj(d.build);
  const bb = { ...DEFAULT_DESIGN.build, ...obj(b.build) };
  for (const [key, range] of Object.entries(RANGES.build)) out.build[key] = num(bd[key] ?? bb[key], range);
  out.build.bodyShape = oneOf(BODIES, bd.bodyShape, oneOf(BODIES, bb.bodyShape, "bean"));
  out.build.headShape = oneOf(HEADS, bd.headShape, oneOf(HEADS, bb.headShape, "pill"));
  out.build.handStyle = oneOf(HANDS, bd.handStyle, oneOf(HANDS, bb.handStyle, "paddle"));
  out.build.topStyle = oneOf(TOPS, bd.topStyle, oneOf(TOPS, bb.topStyle, "fins"));
  out.build.hover = oneOf(HOVERS, bd.hover, oneOf(HOVERS, bb.hover, "ring"));
  out.build.bodyPattern = oneOf(PATTERNS, bd.bodyPattern, oneOf(PATTERNS, bb.bodyPattern, "solid"));
  out.build.decal = oneOf(DECALS, bd.decal, oneOf(DECALS, bb.decal, "none"));
  const badgeRaw = typeof bd.badgeText === "string" ? bd.badgeText : typeof bb.badgeText === "string" ? bb.badgeText : "";
  out.build.badgeText = badgeRaw.replace(/\s+/g, " ").trim().slice(0, 16);

  const fd = obj(d.face);
  const fb = { ...DEFAULT_DESIGN.face, ...obj(b.face) };
  out.face.eyes = oneOf(EYES, fd.eyes, oneOf(EYES, fb.eyes, "classic"));
  out.face.mouth = oneOf(MOUTHS, fd.mouth, oneOf(MOUTHS, fb.mouth, "line"));
  out.face.eyeSize = num(fd.eyeSize ?? fb.eyeSize, RANGES.face.eyeSize);
  out.face.eyeGap = num(fd.eyeGap ?? fb.eyeGap, RANGES.face.eyeGap);
  out.face.blush = color(fd.blush, color(fb.blush, "#ff6f91"));
  out.face.blushLevel = num(fd.blushLevel ?? fb.blushLevel, RANGES.face.blushLevel);
  out.face.blinkRate = num(fd.blinkRate ?? fb.blinkRate, RANGES.face.blinkRate);
  out.face.blinkStyle = oneOf(BLINK_STYLES, fd.blinkStyle, oneOf(BLINK_STYLES, fb.blinkStyle, "normal"));
  out.face.pupilStyle = oneOf(PUPIL_STYLES, fd.pupilStyle, oneOf(PUPIL_STYLES, fb.pupilStyle, "none"));
  out.face.cheekLights = typeof fd.cheekLights === "boolean" ? fd.cheekLights : typeof fb.cheekLights === "boolean" ? fb.cheekLights : true;
  out.face.foreheadLight = typeof fd.foreheadLight === "boolean" ? fd.foreheadLight : typeof fb.foreheadLight === "boolean" ? fb.foreheadLight : true;

  const od = obj(d.outfit);
  const ob = obj(b.outfit);
  for (const slot of SLOTS) {
    const s = obj(od[slot.id]);
    const base_ = obj(ob[slot.id]);
    const list = OUTFIT[slot.id];
    const id = oneOf(list, s.item, oneOf(list, base_.item, "none"));
    const def = ITEMS[slot.id][id];
    // Colors the same item had in `base` are kept; a different item starts with its own
    const sameBase = base_.item === id;
    const pick = (key, i) => color(s[key], sameBase ? color(base_[key], def.colors[i] ?? "", true) : def.colors[i] ?? "", true);
    out.outfit[slot.id] = {
      item: id,
      c1: id === "none" ? "" : pick("c1", 0),
      c2: id === "none" ? "" : pick("c2", 1),
      pattern: slot.pattern ? oneOf(PATTERNS, s.pattern, oneOf(PATTERNS, base_.pattern, "solid")) : "solid",
    };
  }
  out.behaviors = sanitizeBehaviors(d.behaviors, b.behaviors);
  return out;
}

// What the older settings had (a shell color name, an eye style, the mouth on or off)
export function designFromLegacy({ shell, eyes, mouth } = {}) {
  const shellColor = SHELL_COLORS.find((s) => s.id === shell)?.color;
  const d = defaultDesign();
  if (shellColor) d.colors.head = d.colors.body = d.colors.arms = shellColor;
  if (EYES.some((e) => e.id === eyes)) d.face.eyes = eyes;
  if (mouth === false) d.face.mouth = "none";
  return sanitizeDesign(d);
}

// A key that changes only when the robot's shapes change, not its colors (the 3D robot is rebuilt then)
export function shapeKey(design) {
  const { build, outfit, face } = design;
  const worn = Object.entries(outfit).map(([slot, o]) => `${slot}:${o.item}${o.pattern !== "solid" ? "/" + o.pattern : ""}`);
  return JSON.stringify([build, worn, Boolean(face?.cheekLights), Boolean(face?.foreheadLight)]);
}

// ---------- Surprise me ----------
const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

// A tiny seeded random generator (so a seed always makes the same robot)
export function seededRandom(seed = Date.now()) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// Randomize one specific Studio tab (`colors`, `shape`, `face`, `outfit`, `behaviors`)
export function randomizeDesignTab(current, tab, seed = Date.now()) {
  const rand = seededRandom(seed);
  const d = sanitizeDesign(current);
  if (tab === "colors") {
    const shell = pick(rand, SHELL_COLORS).color;
    const twoTone = rand() < 0.35;
    const second = pick(rand, SHELL_COLORS).color;
    d.colors.head = shell;
    d.colors.body = twoTone ? second : shell;
    d.colors.arms = twoTone ? second : shell;
    d.colors.joint = pick(rand, JOINT_COLORS);
    d.colors.light = pick(rand, LIGHT_COLORS);
    d.colors.patternColor = pick(rand, SHELL_COLORS).color;
    d.finish = pick(rand, FINISHES).id;
  } else if (tab === "shape") {
    const r = (key) => {
      const [min, max] = RANGES.build[key];
      return Math.round((min + (max - min) * (0.25 + rand() * 0.5)) * 100) / 100;
    };
    for (const key of ["head", "roundness", "width", "height", "arms", "hands", "top"]) d.build[key] = r(key);
    d.build.bodyShape = pick(rand, BODIES).id;
    d.build.headShape = pick(rand, HEADS).id;
    d.build.handStyle = pick(rand, HANDS).id;
    d.build.topStyle = pick(rand, TOPS.filter((t) => t.id !== "none")).id;
    d.build.hover = pick(rand, HOVERS.filter((h) => h.id !== "none")).id;
    d.build.bodyPattern = rand() < 0.35 ? pick(rand, PATTERNS).id : "solid";
    d.build.decal = rand() < 0.3 ? pick(rand, DECALS.filter((x) => x.id !== "none")).id : "none";
  } else if (tab === "face") {
    d.face.eyes = pick(rand, EYES).id;
    d.face.mouth = pick(rand, MOUTHS.filter((m) => m.id !== "none")).id;
    d.face.eyeSize = Math.round((0.85 + rand() * 0.35) * 100) / 100;
    d.face.eyeGap = Math.round((0.88 + rand() * 0.24) * 100) / 100;
    d.face.blinkStyle = pick(rand, BLINK_STYLES).id;
    d.face.pupilStyle = pick(rand, PUPIL_STYLES).id;
    d.face.blinkRate = Math.round((0.6 + rand() * 0.9) * 20) / 20;
    d.face.blushLevel = Math.round((0.5 + rand() * 0.8) * 20) / 20;
  } else if (tab === "outfit") {
    const accent = pick(rand, ["#e05a47", "#3b6fd6", "#f2c14e", "#4d8a62", "#f06bb0", "#7a5cf0", "#2b2e35"]);
    for (const s of SLOTS) d.outfit[s.id] = { item: "none", c1: "", c2: "", pattern: "solid" };
    const wear = (slot, chance) => {
      if (rand() > chance) return;
      const choices = OUTFIT[slot].filter((i) => i.id !== "none");
      const it = pick(rand, choices);
      d.outfit[slot] = { item: it.id, c1: rand() < 0.5 ? accent : it.colors[0], c2: it.colors[1] ?? "", pattern: "solid" };
      if (slot === "torso") d.outfit.torso.pattern = pick(rand, PATTERNS).id;
    };
    wear("hat", 0.65);
    wear("glasses", 0.45);
    wear("headgear", 0.2);
    wear("neck", 0.5);
    wear("torso", 0.55);
    wear("back", 0.3);
    wear("chest", 0.35);
    wear("held", 0.4);
  } else if (tab === "behaviors") {
    const preset = pick(rand, BEHAVIOR_PRESETS);
    d.behaviors.preset = preset.id;
    for (const s of BEHAVIOR_SLIDERS) {
      const baseVal = preset.sliders[s.id] ?? 1;
      d.behaviors[s.id] = Math.min(2, Math.max(0, Math.round((baseVal + (rand() - 0.5) * 0.3) * 20) / 20));
    }
  }
  return sanitizeDesign(d);
}

// A harmonious random robot: one shell family, matching clothes, a light that fits
export function randomDesign(seed = Date.now()) {
  const rand = seededRandom(seed);
  let d = defaultDesign();
  d = randomizeDesignTab(d, "colors", Math.floor(rand() * 1e9) + 1);
  d = randomizeDesignTab(d, "shape", Math.floor(rand() * 1e9) + 2);
  d = randomizeDesignTab(d, "face", Math.floor(rand() * 1e9) + 3);
  d = randomizeDesignTab(d, "outfit", Math.floor(rand() * 1e9) + 4);
  return sanitizeDesign(d);
}

// All the English names the Studio shows (the helper's translation check reads these)
export function labels() {
  const out = new Set();
  for (const list of [
    FINISHES, TOPS, BODIES, HEADS, HANDS, HOVERS, EYES, MOUTHS,
    BLINK_STYLES, PUPIL_STYLES, PATTERNS, DECALS, COLOR_PALETTES,
    IDLE_BEHAVIORS, BEHAVIOR_SLIDERS, BEHAVIOR_PRESETS,
    SLOTS, ...Object.values(OUTFIT),
  ]) {
    for (const e of list) {
      out.add(e.label);
      for (const n of e.names || []) out.add(n);
    }
  }
  for (const s of SHELL_COLORS) out.add(s.label);
  return [...out];
}
