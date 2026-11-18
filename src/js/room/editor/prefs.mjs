// ---------- The Room Editor's preferences (room/editor/prefs.mjs) ----------
// Settings → Robot → Editor, and the editor's own Snapping menu: the same settings (robot.editor).
// Pure: the helper cleans saved settings with it; the editor reads lengths through lengthText().

export const DEFAULT_PREFS = {
  grid: 0.1, // meters
  snapGrid: true,
  snapAngle: true,
  angle: 15, // degrees
  snapGuides: true,
  snapWalls: true,
  snapSurfaces: true,
  showMeasurements: true,
  showNav: false, // the robot's walkable grid, whenever the robot's tools show
  handleSize: 1, // 0.75 | 1 | 1.5 | 2
  orbitSpeed: 1, // 0.5 | 1 | 1.5 | 2
  invertOrbit: false,
  units: "cm", // cm | in
  matchColors: false,
  confirmDelete: true,
  autosave: true,
};

export const PREF_OPTIONS = {
  grid: [0.05, 0.1, 0.25, 0.5],
  angle: [5, 15, 45, 90],
  handleSize: [0.75, 1, 1.5, 2],
  orbitSpeed: [0.5, 1, 1.5, 2],
  units: ["cm", "in"],
};

export function sanitizePrefs(input) {
  const p = input && typeof input === "object" ? input : {};
  const out = {};
  for (const [key, fallback] of Object.entries(DEFAULT_PREFS)) {
    const v = p[key];
    if (PREF_OPTIONS[key]) {
      const list = PREF_OPTIONS[key];
      out[key] = list.includes(v) ? v : typeof fallback === "number" && list.includes(Number(v)) ? Number(v) : fallback;
    } else out[key] = typeof v === typeof fallback ? v : fallback;
  }
  return out;
}

// A length in meters, in the units chosen: { n, unit } (whole cm, or inches to a half)
export function lengthOf(m, units = "cm") {
  if (units === "in") return { n: Math.round((m / 0.0254) * 2) / 2, unit: "in" };
  return { n: Math.round(m * 100), unit: "cm" };
}

// The number an input shows for a length, and back to meters
export const toUnits = (m, units = "cm") => lengthOf(m, units).n;
export const fromUnits = (n, units = "cm") => (units === "in" ? Number(n) * 0.0254 : Number(n) / 100);

// "120 cm" / "47 in", through the translator: say(key, vars)
export function lengthText(m, units, say = (k, v) => k.replace(/\{(\w+)\}/g, (_, x) => v[x])) {
  const { n, unit } = lengthOf(m, units);
  return unit === "in" ? say("{n} in", { n }) : say("{n} cm", { n });
}

// The translator keys above, for the i18n scanner
export const PREF_STRINGS = ["{n} in", "{n} cm"];
