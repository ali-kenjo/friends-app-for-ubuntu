// The rest of the hero set: lamps, the whiteboard, books, the mug, the pen cup, screens and the console,
// windows, the wall clock, picture frames, the pinboard and toys.
import * as THREE from "three";
import { at, turn } from "../kit/build.js";

const SATIN = { family: "plastic" };
const GLOSS = { family: "plastic", finish: "gloss" };
const METAL_BLACK = { family: "metal", finish: "black", rough: 0.38 };
const BRASS = { family: "metal", finish: "polished", rough: 0.22 };
const CERAMIC = { family: "ceramic" };
const WOOD = { family: "wood" };
const PAINTED = { family: "wood", finish: "painted" };
const PAPER = { family: "paper" };

const on = (b) => b.state.on !== false;

// ---------- Lights ----------
export function lamp_floor(b) {
  // A weighted base, a slim pole, a fabric drum shade lit from inside
  b.part("c2", b.lathe([[0, 0], [0.16, 0], [0.17, 0.015], [0.15, 0.035], [0.02, 0.045], [0, 0.045]], [0, 0.006, 0.01, 0.012, 0.006, 0]), METAL_BLACK);
  b.part("c2", at(b.cyl(0.011, 0.013, 1.32, 0.004), 0, 0.04, 0), METAL_BLACK);
  b.part("#d9b25a", at(b.cyl(0.02, 0.02, 0.03, 0.006), 0, 1.33, 0), BRASS);
  const shade = b.lathe([[0.19, 1.36], [0.2, 1.37], [0.16, 1.66], [0.15, 1.665], [0.145, 1.655], [0.185, 1.375]], [0, 0.004, 0.004, 0.003, 0.003, 0]);
  b.part("c1", shade, { family: "fabric", rough: 0.9, sheen: 0.3, side: "double" });
  b.glow(on(b) ? "#ffd9a0" : "#5a4a38", at(b.ball(0.05), 0, 1.5, 0), { intensity: on(b) ? 2.2 : 0.1 });
  if (on(b)) b.glow("#ffcf8a", b.lathe([[0.18, 1.375], [0.14, 1.65], [0.135, 1.65], [0.175, 1.375]], 0), { intensity: 0.9 });
}

export function lamp_desk(b) {
  // A round base, two arm segments with soft joints, a cone shade with a warm bulb
  b.part("c2", b.lathe([[0, 0], [0.085, 0], [0.09, 0.012], [0.07, 0.026], [0, 0.03]], [0, 0.004, 0.008, 0.006, 0]), SATIN);
  const p0 = [0, 0.03, 0];
  const p1 = [0.02, 0.24, -0.04];
  const p2 = [0.03, 0.38, 0.1];
  b.part("c2", b.tube([p0, [0.01, 0.13, -0.025], p1], 0.009), SATIN);
  b.part("c2", b.tube([p1, [0.026, 0.33, 0.02], p2], 0.008), SATIN);
  for (const p of [p0, p1, p2]) b.part("c1", at(b.ball(0.018), ...p), GLOSS);
  const shade = b.lathe([[0.012, 0], [0.03, 0.005], [0.085, 0.09], [0.09, 0.1], [0.082, 0.1], [0.025, 0.012]], [0, 0.005, 0.005, 0.003, 0.003, 0]);
  turn(shade, Math.PI * 0.62, 0, 0);
  b.part("c1", at(shade, p2[0], p2[1], p2[2]), { family: "plastic", finish: "gloss", side: "double" });
  b.glow(on(b) ? "#fff0cc" : "#5a5040", at(b.ball(0.026), p2[0], p2[1] - 0.03, p2[2] + 0.045), { intensity: on(b) ? 2.4 : 0.1 });
}

// ---------- Study ----------
const BOARD_STYLES = {
  classic: { surface: "#f7f7f4", spec: GLOSS },
  glass: { surface: "#eef4f6", spec: { family: "glass", opacity: 0.6 } },
  chalk: { surface: "#2f3b33", spec: { family: "clay", rough: 0.9 } },
  cork: { surface: "#c49a6c", spec: { family: "clay", map: "sand", scale: 3, rough: 0.9 } },
  dark: { surface: "#25282f", spec: { family: "plastic", rough: 0.35 } },
  paper: { surface: "#f4efe2", spec: PAPER },
  neon: { surface: "#16151c", spec: { family: "plastic", rough: 0.3 } },
};

export function whiteboard(b) {
  const style = BOARD_STYLES[b.state.style] || BOARD_STYLES.classic;
  const W = 1.3, H = 0.86, cy = 1.3;
  // The writing surface (its own mesh, so the live board can be drawn onto it) and a rounded frame
  const surface = b.moving(style.surface, b.box(W - 0.06, H - 0.06, 0.012, 0.005), style.spec, "canvas");
  surface.position.set(0, cy, 0.008);
  const frame = b.rrect(W, H, 0.04);
  frame.holes.push(new THREE.Path(b.rrect(W - 0.06, H - 0.06, 0.02).getPoints(32).reverse()));
  b.part("c1", at(b.extrude(frame, 0.03, 0.01), 0, cy, -0.012), SATIN);
  if (b.state.style === "neon") b.glow("#ff3ea5", at(b.box(W - 0.02, 0.012, 0.012, 0.005), 0, cy - H / 2 + 0.02, 0.024), { intensity: 1.8 });
  if (b.state.style === "paper") b.part("#d9cdb4", at(turn(b.capsule(0.03, W - 0.1), 0, 0, Math.PI / 2), 0, cy + H / 2 + 0.02, 0.02), PAPER);
  // A pen tray with two markers
  b.part("c1", at(b.box(W * 0.6, 0.025, 0.06, 0.01), 0, cy - H / 2 - 0.012, 0.035), SATIN);
  b.part("#e5484d", at(turn(b.capsule(0.009, 0.1), 0, 0, Math.PI / 2), -0.12, cy - H / 2 + 0.01, 0.04), GLOSS);
  b.part("#3e7bfa", at(turn(b.capsule(0.009, 0.1), 0, 0, Math.PI / 2), 0.02, cy - H / 2 + 0.01, 0.045), GLOSS);
  // An A-frame stand on soft casters
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 0.015);
    b.part("c2", b.tube([[x, 0.07, 0.24], [x, cy + H / 2 - 0.05, 0]], 0.016), METAL_BLACK);
    b.part("c2", b.tube([[x, 0.07, -0.24], [x, cy - 0.2, 0]], 0.014), METAL_BLACK);
    b.part("c2", at(turn(b.capsule(0.02, 0.48), Math.PI / 2, 0, 0), x, 0.07, 0), METAL_BLACK);
    for (const z of [-0.24, 0.24]) b.part("#1c1d22", at(b.ball(0.03), x, 0.03, z), { family: "rubber" });
  }
}

const COVERS = ["#ffffff", "#f2c9a8", "#b9d4c6", "#c9c3e6"];
export function books_stack(b) {
  let y = 0;
  const list = [[0.26, 0.04, 0.2], [0.24, 0.035, 0.18], [0.22, 0.045, 0.17], [0.2, 0.032, 0.15]];
  list.forEach(([w, t, d], i) => {
    const { cover, pages } = b.book(t, d, w);
    for (const g of [cover, pages]) {
      g.rotateZ(Math.PI / 2);
      g.rotateY(Math.PI / 2 + (b.rand() - 0.5) * 0.25);
      g.translate(0, y + t / 2, 0);
    }
    b.part("c1", cover, { family: "paper", rough: 0.7, map: false }, { tint: COVERS[i % COVERS.length] });
    b.part("#f1ead8", pages, PAPER);
    y += t;
  });
}

export function notebook(b) {
  // Two hardcovers, a notebook with an elastic band on top, and a pencil
  const { cover, pages } = b.book(0.035, 0.24, 0.32);
  for (const g of [cover, pages]) g.rotateZ(Math.PI / 2), g.translate(0, 0.0175, 0);
  b.part("c2", cover, { family: "paper", rough: 0.65, map: false });
  b.part("#f1ead8", pages, PAPER);
  const nb = b.book(0.022, 0.2, 0.26);
  for (const g of [nb.cover, nb.pages]) g.rotateZ(Math.PI / 2), g.rotateY(0.12), g.translate(0.01, 0.046, 0.005);
  b.part("c1", nb.cover, { family: "leather", rough: 0.5 });
  b.part("#f4efe2", nb.pages, PAPER);
  b.part("#2d3038", at(turn(b.box(0.008, 0.024, 0.205, 0.003), 0, 0.12, 0), 0.08, 0.046, 0.005), { family: "rubber" });
  b.part("#f2c14e", at(turn(b.capsule(0.005, 0.16), 0, 0.4, Math.PI / 2), -0.02, 0.064, 0.06), PAINTED);
}

export function pen_cup(b) {
  b.part("c1", b.lathe([[0, 0], [0.042, 0], [0.045, 0.11], [0.04, 0.115], [0.036, 0.108], [0, 0.1]], [0, 0.008, 0.004, 0.003, 0.003, 0]), { family: "ceramic", rough: 0.6 });
  const tints = ["#ffffff", "#e5484d", "#3e7bfa", "#30a46c"];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    const g = turn(b.capsule(0.0055, 0.13), Math.sin(a) * 0.18, 0, Math.cos(a) * 0.18);
    b.part("c2", at(g, Math.cos(a) * 0.014, 0.11, Math.sin(a) * 0.014), GLOSS, { tint: tints[i] });
  }
}

// ---------- Kitchen ----------
export function mug(b) {
  // One profile: up the outside, over the rim, down the inside
  b.part("c1", b.lathe([[0, 0], [0.04, 0], [0.044, 0.01], [0.046, 0.095], [0.043, 0.1], [0.04, 0.095], [0.038, 0.012], [0, 0.012]], [0, 0.006, 0.006, 0.004, 0.003, 0.003, 0.004, 0]), CERAMIC);
  b.part("c1", at(turn(b.ring(0.028, 0.0075, Math.PI * 1.15), 0, 0, -Math.PI * 0.575), 0.052, 0.054, 0), CERAMIC);
  b.part("c2", at(b.cyl(0.038, 0.038, 0.004, 0.0015), 0, 0.078, 0), { family: "ceramic", rough: 0.15 });
  if (b.state.steam !== false) {
    // Three soft puffs that rise and fade, one after the other
    const mat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false });
    mat.userData.shared = false;
    const puffs = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), mat.clone());
      b.extra.add(m);
      return m;
    });
    b.onUpdate((dt, t, fx) => {
      puffs.forEach((p, i) => {
        const k = ((t * 0.35 + i / 3) % 1);
        p.position.set(Math.sin(t * 1.3 + i * 2) * 0.01, 0.11 + k * 0.12, Math.cos(t + i) * 0.006);
        p.scale.setScalar(0.6 + k * 1.4);
        p.material.opacity = fx?.friendly ? 0 : 0.22 * Math.sin(k * Math.PI);
      });
    });
  }
}

// ---------- Tech ----------
function screenFace(b, w, h, y, z, onColor = "#4a6fa5") {
  return b.glow(on(b) ? onColor : "#0d0f14", at(b.box(w, h, 0.004, 0.003), 0, y, z), { intensity: on(b) ? 0.9 : 0, rough: 0.2 });
}

export function tv(b) {
  const W = 1.1, H = 0.64;
  b.part("c1", at(b.box(W, H, 0.045, 0.014), 0, 0.075 + H / 2, 0), GLOSS);
  screenFace(b, W - 0.05, H - 0.05, 0.075 + H / 2, 0.024, "#3c5d8f");
  b.part("c2", at(b.box(0.08, 0.07, 0.035, 0.012), 0, 0.04, -0.005), SATIN);
  b.part("c2", at(turn(b.extrude(b.rrect(0.5, 0.2, 0.08), 0.018, 0.006), -Math.PI / 2, 0, 0), 0, 0, 0), SATIN);
}

export function monitor(b) {
  const W = 0.62, H = 0.36;
  b.part("c1", at(b.box(W, H, 0.03, 0.012), 0, 0.12 + H / 2, 0), SATIN);
  b.glow(on(b) ? "#5d86c9" : "#0d0f14", at(b.box(W - 0.03, H - 0.035, 0.004, 0.003), 0, 0.12 + H / 2 + 0.004, 0.016), { intensity: on(b) ? 0.85 : 0 });
  b.part("c2", at(b.box(0.05, 0.16, 0.025, 0.01), 0, 0.08, -0.03), SATIN);
  b.part("c2", at(turn(b.extrude(b.rrect(0.24, 0.17, 0.06), 0.014, 0.005), -Math.PI / 2, 0, 0), 0, 0, -0.01), SATIN);
}

export function game_console(b) {
  // A soft slab with a groove and a light, and a controller beside it
  b.part("c1", at(b.box(0.26, 0.06, 0.2, 0.02), -0.06, 0.03, 0), SATIN);
  b.part("#2a2c33", at(b.box(0.262, 0.004, 0.202, 0.002), -0.06, 0.04, 0), SATIN);
  b.glow("c2", at(b.box(0.05, 0.006, 0.006, 0.003), -0.06, 0.03, 0.1), { intensity: 1.6 });
  const pad = b.cushion(0.12, 0.03, 0.065, { puff: 0.3, round: 0.9 });
  turn(pad, 0, 0.5, 0);
  b.part("c1", at(pad, 0.13, 0.017, 0.03), SATIN);
  for (const sx of [-1, 1]) b.part("c1", at(turn(b.capsule(0.017, 0.03), Math.PI / 2 - 0.2, 0.5, 0), 0.13 + sx * 0.045, 0.015, 0.03 + 0.025 - sx * 0.02), SATIN);
  for (const [x, z, c] of [[0.16, 0.02, "#e5484d"], [0.175, 0.03, "#30a46c"], [0.15, 0.035, "#3e7bfa"]]) b.part("c2", at(b.ball(0.006), x, 0.033, z), GLOSS, { tint: c });
}

// ---------- Windows (wall things: their back at z = 0, facing +z, from y = 0 up) ----------
// The glass pane is its own mesh named "view": the room puts what's outside behind it
function windowFrame(b, w, h, { arch = false, bars = [], depth = 0.12 } = {}) {
  const outer = arch ? archShape(w, h) : b.rrect(w, h, 0.03);
  const inner = arch ? archShape(w - 0.12, h - 0.12, 0.06) : b.rrect(w - 0.12, h - 0.12, 0.02);
  outer.holes.push(new THREE.Path(inner.getPoints(48).reverse()));
  b.part("c1", at(b.extrude(outer, depth * 0.5, 0.012), 0, h / 2, 0.01), PAINTED);
  // Mullions
  for (const [x, y, bw, bh] of bars) b.part("c1", at(b.box(bw, bh, 0.035, 0.01), x, y, depth * 0.25 + 0.01), PAINTED);
  // A deep sill
  b.part("c1", at(b.box(w + 0.1, 0.04, 0.16, 0.014), 0, 0.0, 0.08), PAINTED);
  const pane = arch ? b.extrude(archShape(w - 0.12, h - 0.12, 0.06), 0.006, 0.002) : b.box(w - 0.12, h - 0.12, 0.006, 0.003);
  const view = b.moving("#cfe4f2", pane, { family: "glass", opacity: 0.28 }, "view");
  view.position.set(0, arch ? h / 2 : h / 2, 0.03);
}

function archShape(w, h, y0 = 0) {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, -h / 2 + y0 * 0);
  s.lineTo(r, -h / 2);
  s.lineTo(r, h / 2 - r);
  s.absarc(0, h / 2 - r, r, 0, Math.PI, false);
  s.lineTo(-r, -h / 2);
  return s;
}

// Curtains: soft folds (a waved panel) hanging from a rod, gathered to the side
function curtains(b, w, h, top) {
  if (b.state.curtains === false) return;
  b.part("#2d3038", at(turn(b.capsule(0.012, w + 0.5), 0, 0, Math.PI / 2), 0, top + 0.08, 0.14), METAL_BLACK);
  for (const sx of [-1, 1]) {
    const s = new THREE.Shape();
    const pw = 0.34;
    const folds = 5;
    s.moveTo(-pw / 2, 0);
    for (let i = 0; i <= 24; i++) {
      const x = -pw / 2 + (i / 24) * pw;
      s.lineTo(x, Math.sin((i / 24) * folds * Math.PI * 2) * 0.03);
    }
    for (let i = 24; i >= 0; i--) {
      const x = -pw / 2 + (i / 24) * pw;
      s.lineTo(x, Math.sin((i / 24) * folds * Math.PI * 2) * 0.03 - 0.014);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: top + 0.06, bevelEnabled: false, curveSegments: 4 });
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    b.part("c2", at(g, sx * (w / 2 + 0.12), -0.02, 0.15), { family: "fabric", finish: "velvet", side: "double" });
  }
}

export function window_french(b) {
  const w = 1.2, h = 1.5;
  windowFrame(b, w, h, { bars: [[0, h / 2, 0.04, h - 0.1], [0, h * 0.36, w - 0.1, 0.035], [0, h * 0.68, w - 0.1, 0.035]] });
  curtains(b, w, h, h);
}

export function window_picture(b) {
  const w = 2.0, h = 1.35;
  windowFrame(b, w, h, { bars: [[-w / 6, h / 2, 0.045, h - 0.1], [w / 6, h / 2, 0.045, h - 0.1]] });
  curtains(b, w, h, h);
}

export function window_arched(b) {
  const w = 1.1, h = 1.8;
  windowFrame(b, w, h, { arch: true, bars: [[0, h * 0.42, 0.04, h * 0.8], [0, h * 0.42, w - 0.1, 0.035]] });
  curtains(b, w, h, h);
}

// ---------- Wall decor ----------
export function clock_wall(b) {
  const R = 0.17;
  // A wooden rim, a pale face with chunky hour marks, and hands that keep the real time
  b.part("c2", at(turn(b.lathe([[0, 0], [R, 0], [R + 0.004, 0.03], [R - 0.012, 0.05], [R - 0.02, 0.046], [0, 0.046]], [0, 0.008, 0.01, 0.006, 0.004, 0]), Math.PI / 2, 0, 0), 0, R, 0), WOOD);
  b.part("c1", at(turn(b.cyl(R - 0.018, R - 0.018, 0.004, 0.0015), Math.PI / 2, 0, 0), 0, R, 0.044), { family: "ceramic", rough: 0.5 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const big = i % 3 === 0;
    b.part("#2d3038", at(turn(b.box(big ? 0.012 : 0.008, big ? 0.03 : 0.018, 0.006, 0.003), 0, 0, -a), Math.sin(a) * (R - 0.04), R + Math.cos(a) * (R - 0.04), 0.05), SATIN);
  }
  const hour = b.moving("#2d3038", at(b.box(0.012, 0.075, 0.006, 0.004), 0, 0.03, 0), SATIN, "hour");
  const minute = b.moving("#2d3038", at(b.box(0.008, 0.115, 0.006, 0.003), 0, 0.048, 0), SATIN, "minute");
  b.part("#e5484d", at(turn(b.cyl(0.012, 0.012, 0.008, 0.003), Math.PI / 2, 0, 0), 0, R, 0.06), GLOSS);
  for (const [m, z] of [[hour, 0.052], [minute, 0.058]]) m.position.set(0, R, z);
  b.onUpdate(() => {
    const d = new Date();
    const mins = d.getMinutes() + d.getSeconds() / 60;
    minute.rotation.z = -(mins / 60) * Math.PI * 2;
    hour.rotation.z = -(((d.getHours() % 12) + mins / 60) / 12) * Math.PI * 2;
  });
}

// A small abstract painting, seeded, in tones of the picture color (drawn once per seed and color)
const artCache = new Map();
function artTexture(seed, hex) {
  const key = `${seed}|${hex}`;
  if (artCache.has(key)) return artCache.get(key);
  const c = document.createElement("canvas");
  c.width = 192;
  c.height = 240;
  const ctx = c.getContext("2d");
  const base = new THREE.Color(hex);
  const rnd = (() => {
    let s = seed || 1;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  ctx.fillStyle = `#${base.clone().lerp(new THREE.Color("#f6f0e4"), 0.82).getHexString()}`;
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 6; i++) {
    const col = base.clone().offsetHSL((rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.35);
    ctx.fillStyle = `#${col.getHexString()}`;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    if (i % 2) ctx.ellipse(rnd() * 192, rnd() * 240, 20 + rnd() * 50, 20 + rnd() * 50, rnd() * 3, 0, Math.PI * 2);
    else ctx.roundRect(rnd() * 140, rnd() * 180, 40 + rnd() * 70, 40 + rnd() * 80, 18);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.shared = true;
  artCache.set(key, t);
  return t;
}

export function frame_picture(b) {
  const W = 0.44, H = 0.56;
  const outer = b.rrect(W, H, 0.02);
  outer.holes.push(new THREE.Path(b.rrect(W - 0.07, H - 0.07, 0.008).getPoints(24).reverse()));
  b.part("c1", at(b.extrude(outer, 0.035, 0.01), 0, H / 2, 0), WOOD);
  b.part("#f6f2ea", at(b.box(W - 0.07, H - 0.07, 0.006, 0.002), 0, H / 2, 0.012), PAPER);
  const artGeo = b.box(W - 0.15, H - 0.15, 0.004, 0.0015);
  // The painting fills the face: UVs 0..1 instead of meters
  const uv = artGeo.attributes.uv;
  const pos = artGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / (W - 0.15) + 0.5, pos.getY(i) / (H - 0.15) + 0.5);
  const art = b.moving("#ffffff", artGeo, { family: "paper", map: false }, "art");
  art.position.set(0, H / 2, 0.017);
  art.material = art.material.clone();
  art.material.map = artTexture(b.seed, b.colorOf("c2"));
  art.material.userData.shared = false;
}

export function pinboard(b) {
  const W = 0.9, H = 0.62;
  const outer = b.rrect(W, H, 0.025);
  outer.holes.push(new THREE.Path(b.rrect(W - 0.05, H - 0.05, 0.012).getPoints(24).reverse()));
  b.part("c2", at(b.extrude(outer, 0.03, 0.01), 0, H / 2, 0), WOOD);
  b.part("c1", at(b.box(W - 0.05, H - 0.05, 0.016, 0.004), 0, H / 2, 0.006), { family: "clay", map: "sand", scale: 3, rough: 0.9 });
  const notes = [[-0.25, 0.42, 0.18, 0.14, "#fff3b0", 0.08], [0.0, 0.38, 0.2, 0.22, "#ffffff", -0.04], [0.26, 0.4, 0.16, 0.16, "#c9e7ff", 0.1], [-0.18, 0.18, 0.22, 0.12, "#ffd6e0", -0.06], [0.2, 0.17, 0.16, 0.12, "#d6f5d6", 0.05]];
  const pins = ["#e5484d", "#3e7bfa", "#f5a524", "#30a46c", "#7c66dc"];
  notes.forEach(([x, y, w, h, c, r], i) => {
    b.part("#ffffff", at(turn(b.box(w, h, 0.003, 0.0012), 0, 0, r), x, y, 0.016), PAPER, { tint: c });
    b.part("#ffffff", at(b.ball(0.009), x + Math.sin(r) * h * 0.4, y + h * 0.4, 0.022), GLOSS, { tint: pins[i] });
  });
}

// ---------- Toys ----------
export function plush_bear(b) {
  const FUR = { family: "fabric", finish: "velvet", scale: 3 };
  b.part("c1", at(b.ball(0.11, { squash: 1.15 }), 0, 0.13, 0), FUR);
  b.part("c1", at(b.ball(0.085), 0, 0.29, 0.01), FUR);
  for (const sx of [-1, 1]) {
    b.part("c1", at(b.ball(0.032), sx * 0.062, 0.36, -0.005), FUR);
    b.part("c2", at(turn(b.ball(0.019, { squash: 0.5 }), Math.PI / 2, 0, 0), sx * 0.062, 0.36, 0.018), FUR);
    b.part("c1", at(turn(b.capsule(0.032, 0.07), 0.2, 0, sx * 0.5), sx * 0.1, 0.15, 0.03), FUR);
    b.part("c1", at(turn(b.capsule(0.037, 0.06), Math.PI / 2 - 0.15, sx * 0.25, 0), sx * 0.06, 0.04, 0.07), FUR);
    b.part("c2", at(turn(b.ball(0.028, { squash: 0.45 }), Math.PI / 2 - 0.15, 0, 0), sx * 0.06, 0.035, 0.12), FUR);
    b.part("#1c1d22", at(b.ball(0.011), sx * 0.032, 0.31, 0.083), GLOSS);
  }
  b.part("c2", at(b.ball(0.036, { squash: 0.75 }), 0, 0.27, 0.075), FUR);
  b.part("#2d2420", at(b.ball(0.013, { squash: 0.7 }), 0, 0.285, 0.108), GLOSS);
}

export function ball_bouncy(b) {
  b.part("c1", at(b.ball(0.11), 0, 0.11, 0), { family: "plastic", finish: "gloss" });
  b.part("c2", at(turn(b.ring(0.108, 0.012), Math.PI / 2, 0, 0.35), 0, 0.11, 0), { family: "plastic", finish: "gloss" });
}

export function puzzle_cube(b) {
  const s = 0.07;
  const cell = s / 3;
  b.part("c1", at(b.box(s, s, s, 0.008), 0, s / 2, 0), SATIN);
  const faces = [
    ["#e5484d", [0, 0, 1]], ["#f5a524", [0, 0, -1]], ["#30a46c", [1, 0, 0]],
    ["#3e7bfa", [-1, 0, 0]], ["#ffffff", [0, 1, 0]], ["#f2d33c", [0, -1, 0]],
  ];
  for (const [c, n] of faces) {
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const g = b.box(cell * 0.82, cell * 0.82, 0.002, 0.003);
        const p = new THREE.Vector3(i * cell, j * cell, s / 2 + 0.0008);
        if (n[0]) (g.rotateY((n[0] * Math.PI) / 2), p.set(n[0] * (s / 2 + 0.0008), j * cell, -i * cell * n[0]));
        if (n[1]) (g.rotateX((-n[1] * Math.PI) / 2), p.set(i * cell, n[1] * (s / 2 + 0.0008), -j * cell * n[1]));
        if (n[2] < 0) (g.rotateY(Math.PI), p.set(-i * cell, j * cell, -(s / 2 + 0.0008)));
        b.part("#ffffff", at(g, p.x, p.y + s / 2, p.z), GLOSS, { tint: c });
      }
    }
  }
}
