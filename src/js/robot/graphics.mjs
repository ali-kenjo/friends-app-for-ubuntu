// ---------- Graphics settings (robot/graphics.mjs) ----------
// Settings → Robot → Graphics: global, for every room and every place the robot is shown. Quality
// (robot.quality) picks a tier; each setting here either follows the tier ("auto") or overrides one part
// of it. Pure: the helper cleans saved settings with it, the engine turns it into what it draws.

export const GRAPHICS_DEFAULTS = {
  renderScale: 100, // % of the screen's resolution (50–100)
  fps: "display", // 30 | 60 | display
  aa: "msaa", // msaa | smaa | off
  geometry: "auto", // auto | low | medium | high | ultra: how round curved things are
  textures: "auto", // auto | low | medium | high | ultra: the size of surface textures
  shadows: "auto", // auto | off | hard | soft | very_soft
  shadowRes: "auto", // auto | 1024 | 2048 | 4096
  ao: "auto", // auto | off | low | high: ambient occlusion
  contactShadows: true, // the soft shadows under things and under the robot
  lights: "auto", // auto | 0…6: how many lamps really light the room
  reflections: true, // reflections from the room itself (off: a neutral studio)
  bloom: 100, // % glow around bright things (0–150)
  grading: true, // color grading from the room's mood
  dof: "off", // off | diorama | portrait
  dofStrength: 50, // 0–100
  particles: 100, // % of the air's particles (0–150)
  sway: true, // plants and curtains move in the wind
  batterySaver: true, // on battery: one level lower and at most 30 frames a second
  throttleHidden: true, // at most 30 frames a second while the window isn't in front (never while filming)
  overlay: false, // the performance overlay over the picture
};

export const GRAPHICS_OPTIONS = {
  fps: ["30", "60", "display"],
  aa: ["msaa", "smaa", "off"],
  geometry: ["auto", "low", "medium", "high", "ultra"],
  textures: ["auto", "low", "medium", "high", "ultra"],
  shadows: ["auto", "off", "hard", "soft", "very_soft"],
  shadowRes: ["auto", "1024", "2048", "4096"],
  ao: ["auto", "off", "low", "high"],
  lights: ["auto", "0", "1", "2", "3", "4", "5", "6"],
  dof: ["off", "diorama", "portrait"],
};

const RANGES = { renderScale: [50, 100], bloom: [0, 150], dofStrength: [0, 100], particles: [0, 150] };
const LEVELS = ["low", "medium", "high", "ultra"];
const DOWN = { ultra: "high", high: "medium", medium: "low", low: "low" };

// Saved settings → known keys with allowed values (anything else is the default)
export function sanitizeGraphics(input) {
  const g = input && typeof input === "object" ? input : {};
  const out = {};
  for (const [key, fallback] of Object.entries(GRAPHICS_DEFAULTS)) {
    const v = g[key];
    if (GRAPHICS_OPTIONS[key]) out[key] = GRAPHICS_OPTIONS[key].includes(String(v)) ? String(v) : fallback;
    else if (RANGES[key]) {
      const n = Number(v);
      out[key] = Number.isFinite(n) ? Math.round(Math.min(RANGES[key][1], Math.max(RANGES[key][0], n))) : fallback;
    } else out[key] = typeof v === "boolean" ? v : fallback;
  }
  return out;
}

// 1.0's v1 drawer kept a few of these in visualStyle; read once, when there are no graphics settings yet
export function graphicsFromV1(visualStyle) {
  const v = visualStyle && typeof visualStyle === "object" ? visualStyle : {};
  const g = {};
  if (["off", "fxaa", "msaa"].includes(v.antiAliasing)) g.aa = v.antiAliasing === "fxaa" ? "smaa" : v.antiAliasing;
  if (v.shadowQuality === "off") g.shadows = "off";
  if (typeof v.throttleWhenHidden === "boolean") g.throttleHidden = v.throttleWhenHidden;
  return g;
}

// What the engine draws: the tier (after the battery saver) with each override applied.
// level: the quality chosen; env: { onBattery }. fps: the cap (0: the display's rate); idleFps: the cap while
// the window isn't in front (the engine uses it unless filming)
export function resolveGraphics(level, input, env = {}) {
  const g = sanitizeGraphics(input);
  const saving = g.batterySaver && env.onBattery === true;
  const tier = LEVELS.includes(level) ? (saving ? DOWN[level] : level) : "high";
  let fps = g.fps === "display" ? 0 : Number(g.fps);
  if (saving) fps = fps ? Math.min(fps, 30) : 30;
  return {
    level: tier,
    saving,
    scale: g.renderScale / 100,
    fps,
    idleFps: g.throttleHidden ? (fps ? Math.min(fps, 30) : 30) : fps,
    aa: g.aa,
    geometry: g.geometry === "auto" ? tier : g.geometry,
    textures: g.textures === "auto" ? tier : g.textures,
    shadows: g.shadows, // "auto" follows the tier
    shadowSize: g.shadowRes === "auto" ? null : Number(g.shadowRes),
    ao: g.ao,
    contact: g.contactShadows,
    lights: g.lights === "auto" ? null : Number(g.lights),
    reflections: g.reflections,
    bloom: g.bloom / 100,
    grading: g.grading,
    dof: g.dof,
    dofStrength: g.dofStrength / 100,
    particles: g.particles / 100,
    sway: g.sway,
    overlay: g.overlay,
  };
}

// How soft the key light's shadow is (its blur radius) for a choice and the tier's own softness
export function shadowRadius(choice, tierSoft) {
  if (choice === "hard") return 1;
  if (choice === "very_soft") return Math.round(tierSoft * 1.8);
  return tierSoft;
}

// A key that changes whenever the room must be built again (geometry, textures, lights, contact shadows)
export function buildKey(r) {
  return [r.geometry, r.textures, r.lights ?? "a", r.contact ? 1 : 0, r.shadows, r.shadowSize ?? "a", r.reflections ? 1 : 0].join(",");
}
