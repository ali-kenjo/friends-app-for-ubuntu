// Where a window sits, as the page remembers it and the helper checks it. Positions and sizes are fractions of the
// space the window floats in (so they hold when the window of the app is resized), docked windows keep only their size.
//   mode:  float (free) | left | right | bottom (docked to that edge) | max (fills the space)
//   x, y:  the top-left corner, w, h: the size (floating)
//   size:  the width (left, right) or height (bottom) when docked
//   shaded: only the title bar shows

export const MODES = ["float", "left", "right", "bottom", "max"];

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const round = (n) => Math.round(n * 10000) / 10000;
const num = (v, lo, hi, fallback) => (typeof v === "number" && Number.isFinite(v) ? round(clamp(v, lo, hi)) : fallback);

export function cleanGeometry(input, fallback) {
  const g = input && typeof input === "object" ? input : {};
  const f = fallback;
  const w = num(g.w, 0.12, 1, f.w);
  const h = num(g.h, 0.1, 1, f.h);
  return {
    mode: MODES.includes(g.mode) ? g.mode : f.mode,
    // The corner may not leave the space: at least a little of the window stays in it
    x: num(g.x, 0, 1 - Math.min(w, 0.2), f.x),
    y: num(g.y, 0, 1 - Math.min(h, 0.2), f.y),
    w,
    h,
    size: num(g.size, 0.15, 0.8, f.size),
    shaded: typeof g.shaded === "boolean" ? g.shaded : f.shaded,
  };
}

// The windows that remember where they were, and where they start
export const WINDOWS = {
  // The board next to the text chat
  chat: { mode: "right", x: 0.56, y: 0.1, w: 0.4, h: 0.7, size: 0.4, shaded: false },
  // The board in voice mode
  voice: { mode: "right", x: 0.55, y: 0.14, w: 0.42, h: 0.62, size: 0.42, shaded: false },
  // The robot's window on the robot page
  robot: { mode: "float", x: 0.7, y: 0.07, w: 0.27, h: 0.62, size: 0.3, shaded: false },
};

export const cleanWindows = (input) => {
  const src = input && typeof input === "object" ? input : {};
  return Object.fromEntries(Object.entries(WINDOWS).map(([id, fallback]) => [id, cleanGeometry(src[id], fallback)]));
};

// Where the robot stands in voice mode: a picture's fractions from the middle (-0.5 to 0.5 sideways, -0.4 to 0.4 up
// and down) and how large it is (0.5 to 2)
export const DEFAULT_PLACE = { x: 0, y: 0, scale: 1 };
export const cleanPlace = (input) => {
  const p = input && typeof input === "object" ? input : {};
  return { x: num(p.x, -0.5, 0.5, 0), y: num(p.y, -0.4, 0.4, 0), scale: num(p.scale, 0.5, 2, 1) };
};
