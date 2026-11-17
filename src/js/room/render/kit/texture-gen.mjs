// ---------- Procedural surface maps: pure pixel functions ----------
// No DOM and no three.js: the texture worker (texture-worker.js) runs these off the main thread, and the
// page runs them in idle time where workers or OffscreenCanvas are missing. Every map is seeded, tiles
// seamlessly, and is neutral in color (light gray detail): the material's own color tints it, so
// recoloring never needs a new texture.
//
// generate(kind, size, seed) → { albedo: Uint8ClampedArray RGBA, normal: RGBA, rough: RGBA }

// ---------- Noise (tileable value noise and fbm) ----------
function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Value noise that repeats every `period` cells
function vnoise(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const p = (v) => ((v % period) + period) % period;
  const a = hash(p(xi), p(yi), seed);
  const b = hash(p(xi + 1), p(yi), seed);
  const c = hash(p(xi), p(yi + 1), seed);
  const d = hash(p(xi + 1), p(yi + 1), seed);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Fractal noise over a tile: u, v in 0..1, base frequency (whole number so it tiles)
function fbm(u, v, freq, octaves, seed, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = freq;
  for (let o = 0; o < octaves; o++) {
    sum += vnoise(u * f, v * f, f, seed + o * 31) * amp;
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// ---------- Height → normal map ----------
export function normalFromHeight(height, size, strength = 2) {
  const out = new Uint8ClampedArray(size * size * 4);
  const h = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out[i] = (-dx / len) * 127.5 + 127.5;
      out[i + 1] = (dy / len) * 127.5 + 127.5;
      out[i + 2] = (1 / len) * 127.5 + 127.5;
      out[i + 3] = 255;
    }
  }
  return out;
}

// ---------- The generators: each fills tone (0..1 albedo detail), height (0..1) and rough (0..1) ----------
// Wood: long grain (u is along the board), rings that drift, fine pores
function wood(u, v, s) {
  // Straight grain along u: fine lines across v, gently drifting, with soft streaks and few pores
  const drift = fbm(u, v, 2, 2, s) * 0.9 + fbm(u * 0.5, v, 4, 2, s + 5) * 0.35;
  // Uneven spacing: the line frequency itself wanders a little along the board
  const line = Math.sin((v * 38 + drift * 2.6 + fbm(u * 0.3, v, 3, 2, s + 9) * 4) * Math.PI);
  const grain = Math.pow(0.5 + 0.5 * line, 3);
  const streak = fbm(u * 0.15, v * 3, 8, 3, s + 3);
  const pores = vnoise(u * 300, v * 90, 300, s + 11) > 0.93 ? 1 : 0;
  const tone = 0.9 - grain * 0.05 + (streak - 0.5) * 0.08 - pores * 0.02;
  return { tone, height: 0.6 - grain * 0.4 + streak * 0.15 - pores * 0.2, rough: 0.5 + grain * 0.05 + pores * 0.05 };
}

// Planks: boards with seams, each its own tone, grain inside
function planks(u, v, s, { rows = 6, herring = false } = {}) {
  let bu = u;
  let bv = v;
  let row = Math.floor(v * rows);
  let localV = v * rows - row;
  let board;
  let localU;
  if (herring) {
    // Herringbone: boards at right angles, in a zig-zag
    const n = rows * 2;
    const cx = Math.floor(u * n);
    const cy = Math.floor(v * n);
    const flip = (cx + cy) % 2 === 0;
    localU = flip ? u * n - cx : v * n - cy;
    localV = flip ? v * n - cy : u * n - cx;
    board = cx * 131 + cy * 17;
    bu = localU;
    bv = localV + board * 0.01;
    row = board;
  } else {
    const shift = hash(row, 3, s) * 0.8;
    const len = 0.5;
    const pos = (u + shift) / len;
    const col = Math.floor(pos);
    localU = pos - col;
    board = row * 97 + col;
  }
  const tone0 = 0.84 + (hash(board, 1, s) - 0.5) * 0.3;
  const w = wood(bu * 0.5 + hash(board, 2, s), bv * 0.2 + localV * 0.15 + hash(board, 5, s), s + (board % 7));
  const seam = Math.min(smooth(0, 0.035, localV), smooth(1, 0.965, localV), herring ? 1 : Math.min(smooth(0, 0.01, localU), smooth(1, 0.99, localU)));
  return { tone: tone0 * (0.8 + 0.2 * w.tone) * (0.4 + 0.6 * seam), height: w.height * 0.4 + seam * 0.6, rough: w.rough + (1 - seam) * 0.2 };
}

// Fabric: a plain weave
function weave(u, v, s, density = 220) {
  const x = u * density;
  const y = v * density;
  const over = (Math.floor(x) + Math.floor(y)) % 2;
  const fx = Math.sin((x % 1) * Math.PI);
  const fy = Math.sin((y % 1) * Math.PI);
  const thread = over ? fx * (0.6 + 0.4 * fy) : fy * (0.6 + 0.4 * fx);
  const slub = fbm(u, v, 16, 2, s);
  return { tone: 0.95 + thread * 0.03 + (slub - 0.5) * 0.05, height: thread * 0.7 + slub * 0.3, rough: 0.85 };
}

// Bouclé: little loops all over
function boucle(u, v, s) {
  const n = fbm(u, v, 96, 3, s, 0.6);
  const loops = Math.abs(Math.sin(n * 14));
  const cloud = fbm(u, v, 6, 3, s + 2);
  return { tone: 0.94 + loops * 0.04 + (cloud - 0.5) * 0.04, height: loops * 0.8 + cloud * 0.2, rough: 0.92 };
}

// Knit: chunky stitches in rows (poufs, blankets)
function knit(u, v, s) {
  // Chunky ribbed knit: soft vertical ribs (u runs around a pouf), faint stitch rows inside them
  const rib = Math.pow(Math.abs(Math.sin(u * 36 * Math.PI)), 0.6);
  const row = 0.5 + 0.5 * Math.sin(v * 70 * Math.PI + (Math.floor(u * 36) % 2) * Math.PI);
  const n = fbm(u, v, 8, 2, s);
  return { tone: 0.9 + rib * 0.06 + row * 0.015 + (n - 0.5) * 0.03, height: rib * 0.85 + row * 0.15, rough: 0.92 };
}

// Leather: a soft pebbled grain
function leather(u, v, s) {
  const n = fbm(u, v, 24, 4, s, 0.55);
  const cells = Math.abs(fbm(u, v, 48, 2, s + 5) - 0.5) * 2;
  return { tone: 0.93 + (n - 0.5) * 0.06, height: n * 0.6 + (1 - cells) * 0.4, rough: 0.55 + n * 0.1 };
}

// Plaster and clay: soft trowel marks
function plaster(u, v, s) {
  const n = fbm(u, v, 6, 5, s, 0.55);
  const fine = fbm(u, v, 64, 2, s + 9);
  return { tone: 0.93 + (n - 0.5) * 0.08 + (fine - 0.5) * 0.03, height: n * 0.7 + fine * 0.3, rough: 0.82 };
}

// Terrazzo: chips of stone in a pale ground
function terrazzo(u, v, s) {
  const base = plaster(u, v, s);
  let chip = 0;
  let shade = 0;
  for (let k = 0; k < 3; k++) {
    const f = [18, 30, 52][k];
    const cx = Math.floor(u * f);
    const cy = Math.floor(v * f);
    const r = hash(cx, cy, s + k * 13);
    if (r > 0.55) {
      const px = (u * f - cx - 0.5) * 2;
      const py = (v * f - cy - 0.5) * 2;
      const d = Math.hypot(px * (1 + r), py * (2 - r));
      if (d < 0.55 + r * 0.25) {
        chip = 1;
        shade = hash(cx, cy, s + 99 + k) * 0.7 + 0.15;
      }
    }
  }
  return { tone: chip ? 0.45 + shade * 0.5 : base.tone, height: chip ? 0.6 : base.height * 0.3, rough: chip ? 0.35 : 0.55 };
}

// Brick: running bond with mortar
function brick(u, v, s) {
  const rows = 8;
  const row = Math.floor(v * rows);
  const off = row % 2 ? 0.5 : 0;
  const cols = 4;
  const bx = u * cols + off;
  const col = Math.floor(bx);
  const lu = bx - col;
  const lv = v * rows - row;
  const mortar = Math.min(smooth(0, 0.07, lu), smooth(1, 0.93, lu), smooth(0, 0.12, lv), smooth(1, 0.88, lv));
  const n = fbm(u, v, 16, 3, s);
  const tone = mortar > 0.5 ? 0.78 + (hash(col, row, s) - 0.5) * 0.2 + (n - 0.5) * 0.1 : 1.05;
  return { tone, height: mortar * (0.8 + n * 0.2), rough: mortar > 0.5 ? 0.85 : 0.95 };
}

// Tiles: square tiles with grout, a little glaze variation
function tile(u, v, s, n = 4) {
  const x = u * n;
  const y = v * n;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const lu = x - tx;
  const lv = y - ty;
  const grout = Math.min(smooth(0, 0.04, lu), smooth(1, 0.96, lu), smooth(0, 0.04, lv), smooth(1, 0.96, lv));
  const t = 0.9 + (hash(tx, ty, s) - 0.5) * 0.1;
  return { tone: grout > 0.5 ? t : 0.7, height: grout * 0.9 + Math.sin(lu * Math.PI) * Math.sin(lv * Math.PI) * 0.1, rough: grout > 0.5 ? 0.25 : 0.9 };
}

function checker(u, v, s) {
  const t = tile(u, v, s, 6);
  const dark = (Math.floor(u * 6) + Math.floor(v * 6)) % 2;
  return { ...t, tone: t.tone * (dark ? 0.32 : 1) };
}

function concrete(u, v, s) {
  const n = fbm(u, v, 4, 5, s, 0.6);
  const pits = vnoise(u * 180, v * 180, 180, s + 3) > 0.92 ? 1 : 0;
  return { tone: 0.88 + (n - 0.5) * 0.16 - pits * 0.1, height: n - pits * 0.4, rough: 0.7 + n * 0.1 };
}

function stone(u, v, s) {
  // Flagstones: irregular cells
  const f = 5;
  let best = 9;
  let second = 9;
  let id = 0;
  const cx = Math.floor(u * f);
  const cy = Math.floor(v * f);
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i;
      const gy = cy + j;
      const px = (gx + hash(((gx % f) + f) % f, ((gy % f) + f) % f, s)) / f;
      const py = (gy + hash(((gx % f) + f) % f, ((gy % f) + f) % f, s + 1)) / f;
      const d = Math.hypot(u - px, v - py);
      if (d < best) {
        second = best;
        best = d;
        id = ((gx % f) + f) % f + (((gy % f) + f) % f) * 7;
      } else if (d < second) second = d;
    }
  }
  const edge = smooth(0, 0.02, second - best);
  const n = fbm(u, v, 12, 3, s + 4);
  return { tone: (0.78 + hash(id, 9, s) * 0.18 + (n - 0.5) * 0.1) * (0.6 + 0.4 * edge), height: edge * 0.7 + n * 0.3, rough: 0.8 };
}

function grass(u, v, s) {
  const n = fbm(u, v, 20, 4, s, 0.6);
  const blades = Math.abs(Math.sin((u * 140 + fbm(u, v, 10, 2, s) * 8) * Math.PI)) * vnoise(u * 90, v * 30, 90, s + 4);
  return { tone: 0.72 + n * 0.3 + blades * 0.1, height: blades * 0.6 + n * 0.4, rough: 0.9 };
}

function sand(u, v, s) {
  const ripple = Math.sin((v * 22 + fbm(u, v, 3, 3, s) * 4) * Math.PI) * 0.5 + 0.5;
  const grain = hash(Math.floor(u * 512), Math.floor(v * 512), s);
  return { tone: 0.9 + (grain - 0.5) * 0.08 + ripple * 0.04, height: ripple * 0.6 + grain * 0.2, rough: 0.92 };
}

function paper(u, v, s) {
  const fibre = fbm(u * 4, v, 32, 3, s);
  return { tone: 0.95 + (fibre - 0.5) * 0.05, height: fibre, rough: 0.9 };
}

function brushed(u, v, s) {
  const streak = fbm(u * 0.05, v * 6, 64, 3, s);
  return { tone: 0.92 + (streak - 0.5) * 0.08, height: streak, rough: 0.28 + streak * 0.08 };
}

function carpet(u, v, s) {
  const n = fbm(u, v, 48, 3, s, 0.7);
  const tuft = hash(Math.floor(u * 256), Math.floor(v * 256), s);
  return { tone: 0.85 + n * 0.1 + tuft * 0.05, height: n * 0.5 + tuft * 0.5, rough: 0.95 };
}

function tatami(u, v, s) {
  const rows = 64;
  const r = v * rows;
  const rush = Math.sin((r % 1) * Math.PI);
  const n = fbm(u, v, 8, 3, s);
  const seam = smooth(0, 0.01, Math.min(u % 0.5, 0.5 - (u % 0.5)));
  return { tone: (0.84 + rush * 0.1 + (n - 0.5) * 0.06) * (0.7 + 0.3 * seam), height: rush * 0.7 + seam * 0.3, rough: 0.8 };
}

function logs(u, v, s) {
  const rows = 5;
  const lv = v * rows - Math.floor(v * rows);
  const round = Math.sin(lv * Math.PI);
  const w = wood(u * 0.4, v * 3, s);
  return { tone: (0.7 + round * 0.25) * (0.85 + w.tone * 0.15), height: round * 0.8 + w.height * 0.2, rough: 0.7 };
}

function slats(u, v, s) {
  const n = 12;
  const lu = u * n - Math.floor(u * n);
  const gap = Math.min(smooth(0, 0.12, lu), smooth(1, 0.88, lu));
  const w = wood(v * 0.5, u * 2, s);
  return { tone: (0.5 + 0.5 * gap) * (0.85 + 0.15 * w.tone), height: gap, rough: 0.6 };
}

function shoji(u, v, s) {
  const lu = (u * 4) % 1;
  const lv = (v * 6) % 1;
  const bar = Math.max(1 - smooth(0, 0.05, Math.min(lu, 1 - lu)), 1 - smooth(0, 0.05, Math.min(lv, 1 - lv)));
  const p = paper(u, v, s);
  return { tone: bar > 0.5 ? 0.45 : p.tone, height: bar, rough: bar > 0.5 ? 0.6 : 0.9 };
}

function stars(u, v, s) {
  const n = hash(Math.floor(u * 512), Math.floor(v * 512), s);
  const neb = fbm(u, v, 3, 4, s + 3);
  return { tone: 0.6 + neb * 0.3 + (n > 0.997 ? 0.4 : 0), height: neb, rough: 0.9 };
}

const KINDS = {
  wood: (u, v, s) => wood(u, v, s),
  planks: (u, v, s) => planks(u, v, s),
  herringbone: (u, v, s) => planks(u, v, s, { rows: 4, herring: true }),
  weave: (u, v, s) => weave(u, v, s),
  velvet: (u, v, s) => weave(u, v, s, 160),
  boucle,
  knit,
  leather,
  plaster,
  terrazzo,
  brick,
  tile: (u, v, s) => tile(u, v, s),
  checker,
  concrete,
  stone,
  grass,
  sand,
  paper,
  brushed,
  carpet,
  tatami,
  logs,
  slats,
  shoji,
  stars,
};
export const TEXTURE_KINDS = Object.keys(KINDS);

// How strongly each kind's height shows as surface relief
const RELIEF = { wood: 0.8, planks: 3, herringbone: 3, weave: 1.2, velvet: 0.6, boucle: 1.6, knit: 2.4, leather: 1.6, plaster: 1.4, terrazzo: 1.2, brick: 5, tile: 4, checker: 4, concrete: 1.4, stone: 4, grass: 2, sand: 1.6, paper: 0.6, brushed: 0.8, carpet: 2, tatami: 2.5, logs: 5, slats: 4, shoji: 2, stars: 0.4 };

export function generate(kind, size, seed = 1) {
  const fn = KINDS[kind] || KINDS.plaster;
  const n = size * size;
  const albedo = new Uint8ClampedArray(n * 4);
  const rough = new Uint8ClampedArray(n * 4);
  const height = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = fn(x / size, y / size, seed);
      const i = y * size + x;
      const t = clamp(r.tone, 0, 1.2) * 212;
      albedo.set([t, t, t, 255], i * 4);
      const g = clamp(r.rough) * 255;
      // glTF layout: roughness in green (metalness in blue, unused)
      rough.set([255, g, 0, 255], i * 4);
      height[i] = r.height;
    }
  }
  const normal = normalFromHeight(height, size, (RELIEF[kind] ?? 1.5) * (size / 512));
  return { albedo, normal, rough };
}

// A soft footprint shadow: a rounded rectangle, dark in the middle, fading out (one for every contact decal)
export function contactShadow(size = 128) {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size - 0.5;
      const v = (y + 0.5) / size - 0.5;
      // distance to a rounded rect of half size 0.3, with a soft falloff to the edge
      const dx = Math.max(Math.abs(u) - 0.26, 0);
      const dy = Math.max(Math.abs(v) - 0.26, 0);
      const d = Math.hypot(dx, dy);
      const inner = Math.max(Math.abs(u), Math.abs(v)) < 0.26 ? 1 : 0;
      const a = inner ? 1 - Math.max(Math.abs(u), Math.abs(v)) * 0.6 : Math.max(0, 1 - d / 0.24) ** 2 * (1 - 0.26 * 0.6);
      out.set([255, 255, 255, clamp(a) * 255], (y * size + x) * 4);
    }
  }
  return out;
}
