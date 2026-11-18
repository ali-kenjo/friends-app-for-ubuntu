// Tech, toys and instruments. Screens and lights glow (and bloom); things that move do so gently and
// hold still with reduced motion.
import * as THREE from "three";
import { at, turn } from "../kit/build.js";
import { merge as mergeAll } from "../kit/geometry.js";

const WOOD = { family: "wood" };
const WOOD_LAQ = { family: "wood", finish: "lacquered" };
const METAL_BLACK = { family: "metal", finish: "black", rough: 0.38 };
const STEEL = { family: "metal", finish: "brushed" };
const CHROME = { family: "metal", finish: "polished", rough: 0.18 };
const BRASS = { family: "metal", finish: "polished", rough: 0.22 };
const SATIN = { family: "plastic" };
const GLOSS = { family: "plastic", finish: "gloss" };
const RUBBER = { family: "rubber" };
const GLASS = { family: "glass", opacity: 0.22 };
const on = (b) => b.state.on !== false;
const lit = (b, slot, geo, k = 1.4) => b.glow(on(b) ? slot : "#1c2026", geo, { intensity: on(b) ? k : 0.03 });
const still = (fx) => Boolean(fx?.reduced);

// A row of piano keys: white keys as one piece, black keys as another
function keys(b, x0, width, y, z, n, depth = 0.1, slot = "#f8f5ee") {
  const kw = width / n;
  const white = [];
  const black = [];
  for (let i = 0; i < n; i++) {
    white.push(at(b.box(kw * 0.9, 0.012, depth, 0.003), x0 + (i + 0.5) * kw, y, z));
    if (![2, 6].includes(i % 7) && i < n - 1) black.push(at(b.box(kw * 0.55, 0.014, depth * 0.6, 0.003), x0 + (i + 1) * kw, y + 0.01, z - depth * 0.2));
  }
  b.part(slot, mergeAll(white), GLOSS);
  b.part("#1c1d22", mergeAll(black), GLOSS);
}

// ---------- Tech ----------
export function vending(b) {
  const W = 0.9, D = 0.75, H = 1.85;
  b.part("c1", at(b.box(W, H, D, 0.05, { along: "y" }), 0, H / 2, 0), SATIN);
  lit(b, "c2", at(b.box(0.56, 1.2, 0.01, 0.004), -0.12, 1.12, D / 2 + 0.002), 0.9);
  // Rows of drinks behind the glass
  const cans = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) cans.push([at(b.cyl(0.035, 0.035, 0.14, 0.01), -0.33 + c * 0.105, 0.6 + r * 0.22, D / 2 - 0.05), ["#e5484d", "#3e7bfa", "#30a46c", "#f5a524", "#ffffff"][(r + c) % 5]]);
  for (const [g, c] of cans) b.part("#ffffff", g, GLOSS, { tint: c });
  b.part("#2a2c33", at(b.box(0.2, 1.2, 0.02, 0.008), 0.3, 1.12, D / 2 + 0.004), SATIN);
  for (let i = 0; i < 4; i++) lit(b, "c2", at(b.box(0.12, 0.05, 0.012, 0.005), 0.3, 1.5 - i * 0.1, D / 2 + 0.014), 1.2);
  b.part("#15161a", at(b.box(0.56, 0.16, 0.03, 0.012), -0.12, 0.3, D / 2), SATIN);
}

export function tv_retro(b) {
  // A chunky set on four legs, a bulging screen, two dials and an aerial
  b.part("c1", at(b.cushion(0.7, 0.5, 0.5, { puff: 0.08, round: 0.35 }), 0, 0.62, 0), SATIN);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.part("#3a2a20", at(turn(b.cyl(0.02, 0.014, 0.38, 0.005), sz * 0.08, 0, -sx * 0.08), sx * 0.26, 0, sz * 0.17), WOOD);
  const screen = b.cushion(0.44, 0.36, 0.06, { puff: 0.5, round: 0.5 });
  lit(b, "c2", at(screen, -0.08, 0.63, 0.24), 0.9);
  b.part("#2a2c33", at(b.box(0.16, 0.38, 0.02, 0.008), 0.24, 0.63, 0.245), SATIN);
  for (const y of [0.72, 0.6]) b.part("#d9d2c6", at(turn(b.cyl(0.03, 0.03, 0.03, 0.008), Math.PI / 2, 0, 0), 0.24, y, 0.255), GLOSS);
  for (const sx of [-1, 1]) b.part("#c4c9d2", b.tube([[0, 0.87, -0.05], [sx * 0.12, 1.02, -0.08]], 0.004), CHROME);
}

export function radio(b) {
  b.part("c1", at(b.cushion(0.42, 0.26, 0.19, { puff: 0.1, round: 0.6 }), 0, 0.14, 0), WOOD_LAQ);
  b.part("#c9b48a", at(b.box(0.2, 0.16, 0.01, 0.004), -0.08, 0.14, 0.092), { family: "fabric", scale: 4 });
  lit(b, "c2", at(b.box(0.11, 0.06, 0.008, 0.003), 0.12, 0.18, 0.094), 1.1);
  for (const x of [0.09, 0.15]) b.part("#f1ead8", at(turn(b.cyl(0.018, 0.018, 0.02, 0.005), Math.PI / 2, 0, 0), x, 0.09, 0.1), GLOSS);
  for (const sx of [-1, 1]) b.part("#3a2a20", at(b.cyl(0.02, 0.016, 0.012, 0.004), sx * 0.15, 0, 0), RUBBER);
}

export function arcade_cabinet(b) {
  const W = 0.7;
  // The side profile of a classic cabinet, pushed out to its width
  const s = new THREE.Shape();
  s.moveTo(-0.36, 0);
  s.lineTo(0.3, 0);
  s.lineTo(0.3, 0.85);
  s.lineTo(0.36, 0.95);
  s.lineTo(0.14, 1.04);
  s.lineTo(0.06, 1.5);
  s.lineTo(0.2, 1.55);
  s.lineTo(0.2, 1.75);
  s.lineTo(-0.36, 1.75);
  const g = b.extrude(s, W, 0.02);
  g.rotateY(-Math.PI / 2);
  b.part("c1", at(g, W / 2, 0, 0), SATIN);
  // Screen (tilted back), marquee, control deck with a stick and buttons
  lit(b, "c2", at(turn(b.box(W - 0.14, 0.42, 0.01, 0.004), -0.17, 0, 0), 0, 1.27, 0.115), 1);
  lit(b, "c2", at(b.box(W - 0.1, 0.16, 0.01, 0.004), 0, 1.65, 0.205), 1.6);
  b.part("#15161a", at(turn(b.box(W - 0.06, 0.02, 0.22, 0.008), 0.4, 0, 0), 0, 1.0, 0.26), SATIN);
  b.part("#c4c9d2", at(b.cyl(0.006, 0.006, 0.07, 0.002), -0.16, 1.01, 0.25), CHROME);
  b.part("#e5484d", at(b.ball(0.022), -0.16, 1.09, 0.25), GLOSS);
  for (const [x, c] of [[0.02, "#f5a524"], [0.1, "#30a46c"], [0.18, "#3e7bfa"]]) b.part("#ffffff", at(b.cyl(0.02, 0.02, 0.012, 0.005), x, 1.0 + (0.26 - 0.25) * 0, 0.27), GLOSS, { tint: c });
  b.part("#15161a", at(b.box(0.12, 0.08, 0.01, 0.004), 0, 0.55, 0.305), SATIN);
}

export function holo_projector(b) {
  b.part("c1", b.lathe([[0, 0], [0.1, 0], [0.12, 0.03], [0.08, 0.06], [0, 0.06]], [0, 0.012, 0.02, 0.012, 0]), SATIN);
  lit(b, "c2", at(b.cyl(0.06, 0.06, 0.006, 0.002), 0, 0.058, 0), 1.6);
  if (on(b)) {
    // A small turning figure of light: a ring and a diamond
    const fig = new THREE.Group();
    fig.position.y = 0.11;
    b.extra.add(fig);
    const d = b.lathe([[0, 0], [0.03, 0.035], [0, 0.07]], 0);
    fig.add(b.moving("c2", mergeAll([d, at(turn(b.ring(0.045, 0.003), Math.PI / 2, 0, 0), 0, 0.035, 0)]), { family: "emissive", intensity: 1.5 }, ""));
    b.onUpdate((dt, t, fx) => {
      fig.rotation.y = still(fx) ? 0 : t * 0.8;
      fig.position.y = 0.075 + (still(fx) ? 0 : Math.sin(t * 1.3) * 0.006);
    });
  }
}

export function speaker(b) {
  b.part("c1", at(b.box(0.32, 0.72, 0.3, 0.035, { along: "y" }), 0, 0.59, 0), { family: "wood", finish: "painted" });
  b.part("#3a3d46", b.lathe([[0, 0], [0.14, 0], [0.15, 0.02], [0.03, 0.05], [0.025, 0.24], [0, 0.24]], [0, 0.008, 0.012, 0.02, 0.008, 0]), METAL_BLACK);
  // A woofer and a tweeter, cones in the second color
  for (const [y, r] of [[0.5, 0.11], [0.8, 0.045]]) {
    b.part("#15161a", at(turn(b.ring(r, r * 0.16), 0, 0, 0), 0, y, 0.152), RUBBER);
    b.part("c2", at(turn(b.lathe([[0, 0], [r * 0.3, 0.004], [r * 0.9, r * 0.28]], [0, r * 0.1, 0]), -Math.PI / 2, 0, 0), 0, y, 0.15 + r * 0.02), { family: "paper", map: false, side: "double" });
  }
}

export function server_rack(b) {
  b.part("c1", at(b.box(0.6, 1.2, 0.6, 0.03, { along: "y" }), 0, 0.6, 0), METAL_BLACK);
  const lights = [];
  for (let i = 0; i < 9; i++) {
    b.part("#3a3d46", at(b.box(0.5, 0.09, 0.02, 0.008), 0, 0.16 + i * 0.115, 0.3), STEEL);
    for (let k = 0; k < 4; k++) lights.push(at(b.box(0.016, 0.016, 0.008, 0.004), -0.2 + k * 0.035, 0.16 + i * 0.115, 0.312));
  }
  const leds = b.moving("c2", mergeAll(lights), { family: "emissive", intensity: 2 }, "leds");
  leds.material = leds.material.clone();
  leds.material.userData = { ...leds.material.userData, shared: false, glow: true };
  b.onUpdate((dt, t, fx) => (leds.material.emissiveIntensity = still(fx) || fx?.friendly ? 1.6 : 1.3 + 0.7 * (Math.sin(t * 5.1) * Math.sin(t * 2.3) > 0 ? 1 : 0.4)));
}

export function tablet_stand(b) {
  b.part("c2", at(b.box(0.16, 0.012, 0.14, 0.005), 0, 0.006, 0), STEEL);
  b.part("c2", at(turn(b.box(0.05, 0.16, 0.012, 0.005), -0.3, 0, 0), 0, 0.08, -0.03), STEEL);
  b.part("c1", at(turn(b.box(0.24, 0.17, 0.012, 0.005), -0.3, 0, 0), 0, 0.14, 0.0), SATIN);
  // Its screen shows a calm home screen (your inbox only when you switch it on)
  lit(b, "#8fb4e8", at(turn(b.box(0.22, 0.15, 0.003, 0.0012), -0.3, 0, 0), 0, 0.142, 0.007), 0.8);
  if (b.state.showInbox && on(b)) {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.14), new THREE.MeshBasicMaterial({ color: "#8fb4e8", toneMapped: false }));
    screen.rotation.x = -0.3;
    screen.position.set(0, 0.142, 0.0095);
    b.extra.add(screen);
    b.named.display = screen;
  }
}

export function microphone(b) {
  b.part("c2", b.lathe([[0, 0], [0.1, 0], [0.11, 0.012], [0.03, 0.03], [0, 0.03]], [0, 0.005, 0.01, 0.01, 0]), METAL_BLACK);
  b.part("c2", b.tube([[0, 0.03, 0], [0, 0.26, -0.02], [0.02, 0.36, 0.04]], 0.008), METAL_BLACK);
  b.part("c1", at(turn(b.capsule(0.03, 0.09), 0.5, 0, 0), 0.02, 0.39, 0.07), STEEL);
  b.part("#3a3d46", at(b.ball(0.036, { squash: 1.05 }), 0.02, 0.425, 0.095), { family: "metal", finish: "brushed", map: "weave", scale: 30, rough: 0.5 });
  b.part("c2", at(turn(b.ring(0.055, 0.004), Math.PI / 2 - 0.5, 0, 0), 0.02, 0.385, 0.068), METAL_BLACK);
}

export function headphones_stand(b) {
  b.part("c2", b.lathe([[0, 0], [0.08, 0], [0.085, 0.012], [0.02, 0.03], [0.012, 0.27], [0.03, 0.29], [0.03, 0.3], [0, 0.3]], [0, 0.004, 0.008, 0.012, 0.01, 0.006, 0.004, 0]), BRASS);
  b.part("c1", b.tube([[-0.085, 0.14, 0], [-0.08, 0.26, 0], [0, 0.315, 0], [0.08, 0.26, 0], [0.085, 0.14, 0]], 0.009), SATIN);
  for (const sx of [-1, 1]) {
    b.part("c1", at(turn(b.cyl(0.042, 0.042, 0.03, 0.01), 0, 0, Math.PI / 2), sx * 0.085, 0.12, 0), SATIN);
    b.part("#3a3d46", at(turn(b.cyl(0.04, 0.036, 0.016, 0.007), 0, 0, sx * -Math.PI / 2), sx * 0.062, 0.12, 0), { family: "leather" });
  }
}

export function printer_3d(b) {
  const S = 0.45;
  b.part("c1", at(b.box(S, 0.06, S, 0.02), 0, 0.03, 0), SATIN);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.part("c1", at(b.box(0.03, 0.4, 0.03, 0.01, { along: "y" }), sx * 0.2, 0.26, sz * 0.2), STEEL);
  b.part("c1", at(b.box(S, 0.035, S, 0.014), 0, 0.48, 0), SATIN);
  b.part("#3a3d46", at(b.box(0.3, 0.012, 0.3, 0.005), 0, 0.075, 0), STEEL);
  // A half-printed vase, the print head above it, and the spool on the side
  b.part("c2", b.lathe([[0, 0.081], [0.045, 0.081], [0.06, 0.12], [0.04, 0.17], [0.03, 0.17], [0.05, 0.12], [0.036, 0.09]], [0, 0.006, 0.02, 0.006, 0.004, 0.02, 0]), { family: "plastic", rough: 0.6 });
  const head = b.moving("#2a2c33", mergeAll([at(b.box(0.07, 0.05, 0.06, 0.012), 0, 0.22, 0), at(b.lathe([[0, 0], [0.004, 0], [0.012, 0.02]], 0), 0, 0.176, 0)]), SATIN, "head");
  b.part("#8a8f98", at(turn(b.capsule(0.006, 0.38), 0, 0, Math.PI / 2), 0, 0.23, 0), CHROME);
  b.part("c2", at(turn(b.ring(0.06, 0.022), 0, Math.PI / 2, 0), 0.245, 0.3, 0), { family: "plastic", rough: 0.6 });
  if (on(b)) b.onUpdate((dt, t, fx) => (head.position.x = still(fx) ? 0 : Math.sin(t * 1.4) * 0.04));
}

export function robot_arm(b) {
  b.part("c2", b.lathe([[0, 0], [0.11, 0], [0.12, 0.02], [0.07, 0.05], [0, 0.05]], [0, 0.008, 0.014, 0.012, 0]), METAL_BLACK);
  const sh = new THREE.Group();
  sh.position.y = 0.06;
  b.extra.add(sh);
  const upper = b.moving("c1", mergeAll([at(b.capsule(0.03, 0.18), 0, 0.11, 0), at(b.ball(0.04), 0, 0, 0)]), SATIN, "");
  sh.add(upper);
  const elbow = new THREE.Group();
  elbow.position.y = 0.22;
  sh.add(elbow);
  elbow.add(b.moving("c2", b.ball(0.036), METAL_BLACK, ""));
  const fore = b.moving("c1", mergeAll([at(b.capsule(0.024, 0.15), 0, 0.09, 0), at(b.box(0.012, 0.05, 0.03, 0.005), -0.018, 0.2, 0), at(b.box(0.012, 0.05, 0.03, 0.005), 0.018, 0.2, 0)]), SATIN, "");
  elbow.add(fore);
  sh.rotation.z = 0.35;
  elbow.rotation.z = -0.9;
  if (on(b)) {
    b.onUpdate((dt, t, fx) => {
      if (still(fx)) return;
      sh.rotation.y = Math.sin(t * 0.5) * 0.8;
      sh.rotation.z = 0.35 + Math.sin(t * 0.7) * 0.15;
      elbow.rotation.z = -0.9 + Math.sin(t * 0.9 + 1) * 0.3;
    });
  }
}

export function console_bridge(b) {
  // A wedge of a console with a sloped panel of screens and keys
  const s = new THREE.Shape();
  s.moveTo(-0.3, 0);
  s.lineTo(0.3, 0);
  s.lineTo(0.3, 0.7);
  s.lineTo(-0.02, 0.86);
  s.lineTo(-0.3, 1.0);
  const g = b.extrude(s, 1.2, 0.03);
  g.rotateY(-Math.PI / 2);
  b.part("c1", at(g, 0.6, 0, 0), { family: "metal", finish: "brushed", rough: 0.45 });
  const tilt = Math.atan2(0.16, 0.32);
  for (const [x, w] of [[-0.36, 0.34], [0.02, 0.34], [0.4, 0.3]]) lit(b, "c2", at(turn(b.box(w, 0.012, 0.22, 0.005), tilt, 0, 0), x, 0.795, 0.14), 1.1);
  const btns = [];
  for (let i = 0; i < 10; i++) btns.push(at(b.box(0.05, 0.014, 0.03, 0.006), -0.5 + i * 0.11, 0.705, 0.285));
  b.part("#ffd9a0", mergeAll(btns), { family: "emissive", intensity: on(b) ? 1 : 0.05 });
}

export function projector_screen(b) {
  const W = 2.0, H = 1.3;
  b.part("c2", at(turn(b.capsule(0.04, W - 0.02), 0, 0, Math.PI / 2), 0, H - 0.04, 0.04), SATIN);
  if (b.state.down !== false) {
    b.part("c1", at(b.box(W - 0.1, H - 0.12, 0.006, 0.002), 0, (H - 0.08) / 2 + 0.02, 0.03), { family: "paper", rough: 0.95, map: false });
    b.part("c2", at(turn(b.capsule(0.014, W - 0.08), 0, 0, Math.PI / 2), 0, 0.016, 0.03), SATIN);
  }
}

// Little fish that swim back and forth inside a box of water
function fish(b, w, h, d, cy, n = 4) {
  const tints = ["#f2992e", "#ffd34d", "#e8553c", "#f6f1e0"];
  const list = [];
  for (let i = 0; i < n; i++) {
    const body = b.ball(0.028, { squash: 0.6 });
    body.scale(1.5, 1, 0.5);
    const tail = b.lathe([[0, 0], [0.018, 0.02], [0, 0.03]], 0);
    tail.rotateZ(Math.PI / 2);
    tail.scale(1, 1.4, 0.3);
    tail.translate(-0.035, 0, 0);
    const m = b.moving(tints[i % 4], mergeAll([body, tail]), { family: "plastic", finish: "gloss" }, "");
    list.push({ m, phase: b.rand() * 6, y: cy + (b.rand() - 0.5) * h * 0.6, z: (b.rand() - 0.5) * d * 0.5, speed: 0.25 + b.rand() * 0.25 });
  }
  b.onUpdate((dt, t, fx) => {
    for (const f of list) {
      const a = still(fx) ? f.phase : t * f.speed + f.phase;
      f.m.position.set(Math.sin(a) * (w / 2 - 0.06), f.y + Math.sin(a * 2.3) * 0.015, f.z);
      f.m.rotation.y = Math.cos(a) >= 0 ? 0 : Math.PI;
    }
  });
}

function tank(b, w, h, d, y0, waterSlot) {
  b.part(waterSlot, at(b.box(w - 0.02, h - 0.03, d - 0.02, 0.01), 0, y0 + (h - 0.03) / 2, 0), { family: "glass", opacity: 0.3 });
  b.part("#ffffff", at(b.box(w, h, d, 0.012), 0, y0 + h / 2, 0), GLASS);
  b.part("#c9b48a", at(b.box(w - 0.03, 0.03, d - 0.03, 0.01), 0, y0 + 0.02, 0), { family: "clay", map: "sand", scale: 5 });
  for (let i = 0; i < 4; i++) {
    const lf = b.leaf(0.14 + b.rand() * 0.1, 0.03, { droop: 0.2, fold: 0.5 });
    lf.rotateY(b.rand() * 6);
    b.part("#3f8a5a", at(lf, (b.rand() - 0.5) * (w - 0.2), y0 + 0.03, (b.rand() - 0.5) * (d - 0.14)), { family: "leaf" });
  }
  fish(b, w, h, d, y0 + h * 0.55, 5);
}

export function aquarium(b) {
  b.part("c1", at(b.box(1.0, 0.72, 0.4, 0.025), 0, 0.36, 0), { family: "wood", finish: "painted" });
  for (const sx of [-1, 1]) b.part("#d9b25a", at(b.capsule(0.006, 0.1), sx * 0.08, 0.4, 0.205), BRASS);
  tank(b, 0.98, 0.48, 0.38, 0.72, "c2");
  b.part("c1", at(b.box(1.0, 0.05, 0.4, 0.016), 0, 1.225, 0), { family: "wood", finish: "painted" });
  lit(b, "#dff4ff", at(b.box(0.8, 0.008, 0.2, 0.003), 0, 1.196, 0), 1.2);
}

export function fish_tank(b) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.part("c1", at(b.cyl(0.02, 0.016, 0.5, 0.005), sx * 0.3, 0, sz * 0.13), WOOD);
  b.part("c1", at(b.box(0.7, 0.04, 0.35, 0.014), 0, 0.5, 0), WOOD_LAQ);
  b.part("c1", at(b.box(0.62, 0.025, 0.28, 0.01), 0, 0.16, 0), WOOD);
  tank(b, 0.66, 0.36, 0.32, 0.52, "c2");
}

// ---------- Toys ----------
export function retro_handheld(b) {
  b.part("c1", at(b.box(0.1, 0.026, 0.16, 0.012), 0, 0.013, 0), SATIN);
  lit(b, "#9bbc5a", at(b.box(0.07, 0.004, 0.06, 0.002), 0, 0.0265, -0.035), 0.5);
  b.part("#2a2c33", mergeAll([at(b.box(0.03, 0.005, 0.01, 0.002), -0.022, 0.027, 0.035), at(b.box(0.01, 0.005, 0.03, 0.002), -0.022, 0.027, 0.035)]), SATIN);
  for (const [x, z] of [[0.02, 0.04], [0.035, 0.028]]) b.part("c2", at(b.cyl(0.007, 0.007, 0.005, 0.002), x, 0.026, z), GLOSS);
}

export function toy_train(b) {
  // An oval of wooden track and a little engine with two wagons that goes round when switched on
  const pts = [];
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.42, 0.008, Math.sin(a) * 0.24));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  const track = new THREE.TubeGeometry(curve, 96, 0.035, 6, true);
  track.scale(1, 0.25, 1);
  b.part("c2", track, WOOD);
  const cars = [0, 1, 2].map((i) => {
    const parts = [at(b.box(0.08, 0.035, 0.045, 0.012), 0, 0.045, 0)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(at(turn(b.cyl(0.014, 0.014, 0.01, 0.003), Math.PI / 2, 0, 0), sx * 0.025, 0.028, sz * 0.026));
    if (i === 0) parts.push(at(b.cyl(0.012, 0.014, 0.04, 0.004), 0.02, 0.06, 0), at(b.box(0.035, 0.045, 0.04, 0.01), -0.02, 0.075, 0));
    const m = b.moving(i === 0 ? "c1" : ["#3e7bfa", "#30a46c"][i - 1], mergeAll(parts), GLOSS, "");
    return m;
  });
  const place = (t) => cars.forEach((m, i) => {
    const u = (((t - i * 0.045) % 1) + 1) % 1;
    const p = curve.getPointAt(u);
    const d = curve.getTangentAt(u);
    m.position.set(p.x, 0, p.z);
    m.rotation.y = Math.atan2(-d.z, d.x);
  });
  place(0.1);
  if (b.state.on) b.onUpdate((dt, t, fx) => !still(fx) && place(t * 0.12));
}

export function chess(b) {
  b.part("c1", at(b.box(0.4, 0.03, 0.4, 0.012), 0, 0.015, 0), WOOD_LAQ);
  const light = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2) light.push(at(b.box(0.043, 0.003, 0.043, 0.001), -0.154 + c * 0.044, 0.031, -0.154 + r * 0.044));
  b.part("#ead9b8", mergeAll(light), { family: "wood", map: false });
  // A game in progress: pawns and a few taller pieces on each side
  const piece = (h, r) => b.lathe([[0, 0], [r, 0], [r * 0.9, 0.006], [r * 0.4, h * 0.45], [r * 0.6, h * 0.8], [0, h]], [0, 0.003, 0.004, 0.006, 0.006, 0]);
  const set = (tint, rows, flip) => {
    for (let c = 0; c < 8; c++) {
      if ((c * 7 + flip) % 5 === 0) continue;
      b.part("c2", at(piece(0.035, 0.012), -0.154 + c * 0.044, 0.031, rows[1]), GLOSS, { tint });
      if (c % 2 === flip) b.part("c2", at(piece(0.055 + (c % 3) * 0.008, 0.014), -0.154 + c * 0.044, 0.031, rows[0]), GLOSS, { tint });
    }
  };
  set("#ffffff", [-0.154, -0.11], 0);
  set("#3a2a24", [0.154, 0.11], 1);
}

export function tin_robot(b) {
  b.part("c1", at(b.box(0.08, 0.08, 0.06, 0.012), 0, 0.085, 0), { family: "metal", finish: "brushed", rough: 0.4 });
  b.part("c1", at(b.box(0.06, 0.045, 0.05, 0.012), 0, 0.155, 0), { family: "metal", finish: "brushed", rough: 0.4 });
  for (const sx of [-1, 1]) {
    b.part("c2", at(b.box(0.028, 0.045, 0.035, 0.01), sx * 0.022, 0.0225, 0), GLOSS);
    b.part("c2", at(b.capsule(0.01, 0.045), sx * 0.052, 0.085, 0), GLOSS);
    b.glow("#fff0a0", at(b.ball(0.007), sx * 0.014, 0.16, 0.026), { intensity: 1.4 });
  }
  b.part("c2", at(b.cyl(0.004, 0.004, 0.02, 0.001), 0, 0.177, 0), GLOSS);
  b.part("c2", at(b.ball(0.008), 0, 0.2, 0), GLOSS);
  // The wind-up key on its back
  b.part("#d9b25a", mergeAll([at(turn(b.cyl(0.003, 0.003, 0.025, 0.001), Math.PI / 2, 0, 0), 0, 0.09, -0.04), at(turn(b.ring(0.012, 0.003), 0, 0, 0), 0, 0.09, -0.055)]), BRASS);
}

export function gacha(b) {
  b.part("c1", at(b.box(0.5, 0.62, 0.45, 0.04, { along: "y" }), 0, 0.31, 0), GLOSS);
  // A globe full of capsules, a crank and a chute
  for (let i = 0; i < 22; i++) {
    const a = b.rand() * Math.PI * 2;
    const r = b.rand() * 0.15;
    b.part("#ffffff", at(b.ball(0.035), Math.cos(a) * r, 0.68 + b.rand() * 0.18, Math.sin(a) * r), GLOSS, { tint: ["#e5484d", "#3e7bfa", "#f5a524", "#30a46c", "#f472b6"][i % 5] });
  }
  b.part("c2", at(b.ball(0.24, { squash: 0.95 }), 0, 0.84, 0), { family: "glass", opacity: 0.2 });
  b.part("c1", at(b.cyl(0.1, 0.12, 0.05, 0.015), 0, 1.07, 0), GLOSS);
  b.part("#c4c9d2", mergeAll([at(turn(b.cyl(0.05, 0.05, 0.02, 0.006), Math.PI / 2, 0, 0), 0.08, 0.36, 0.23), at(b.box(0.08, 0.016, 0.02, 0.006), 0.08, 0.36, 0.245)]), CHROME);
  b.part("#15161a", at(b.box(0.16, 0.1, 0.02, 0.01), -0.1, 0.14, 0.225), SATIN);
}

export function blocks(b) {
  // A small tower and a few loose blocks, in the two colors and natural wood
  const list = [[0, 0.04, 0, 0.08, "c1", 0], [0.085, 0.04, 0.01, 0.08, "c2", 0.2], [0.04, 0.12, 0.0, 0.08, "c2", 0.1], [0.04, 0.2, 0.0, 0.075, "c1", 0.5], [-0.13, 0.035, 0.07, 0.07, "#e6c89a", 0.7], [-0.1, 0.035, -0.09, 0.07, "c1", 0.3]];
  for (const [x, y, z, s, slot, r] of list) b.part(slot, at(turn(b.box(s, s, s, 0.012), 0, r, 0), x, y, z), { family: "wood", finish: "painted" });
  b.part("c2", at(turn(b.cyl(0.035, 0.035, 0.08, 0.01), 0, 0, Math.PI / 2), 0.14, 0.035, -0.08), { family: "wood", finish: "painted" });
  const tri = new THREE.Shape();
  tri.moveTo(-0.045, 0);
  tri.lineTo(0.045, 0);
  tri.lineTo(0, 0.07);
  b.part("#e6c89a", at(b.extrude(tri, 0.07, 0.01), 0.04, 0.2375, -0.035), { family: "wood", finish: "painted" });
}

export function snow_globe(b) {
  b.part("c2", b.lathe([[0, 0], [0.065, 0], [0.07, 0.015], [0.055, 0.05], [0, 0.05]], [0, 0.006, 0.01, 0.008, 0]), CERAMIC_);
  // A tiny snowy tree inside
  b.part("#3f7a54", at(b.lathe([[0, 0], [0.028, 0], [0.014, 0.03], [0.02, 0.03], [0, 0.07]], [0, 0.004, 0.003, 0.003, 0]), 0, 0.055, 0), { family: "leaf" });
  b.part("#ffffff", at(b.ball(0.045, { squash: 0.25 }), 0, 0.058, 0), { family: "clay", map: false });
  b.part("c1", at(b.ball(0.065), 0, 0.105, 0), GLASS);
  const flakes = [0, 1, 2, 3, 4, 5].map(() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.003, 6, 4), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    b.extra.add(m);
    return [m, b.rand() * 6, b.rand() * 0.035];
  });
  b.onUpdate((dt, t, fx) => {
    for (const [m, ph, r] of flakes) {
      const k = still(fx) ? ph / 6 : (t * 0.12 + ph) % 1;
      m.position.set(Math.cos(ph * 3) * r, 0.15 - k * 0.085, Math.sin(ph * 3) * r);
    }
  });
}
const CERAMIC_ = { family: "ceramic" };

export function rocket_model(b) {
  b.part("c1", b.lathe([[0, 0.06], [0.04, 0.06], [0.055, 0.16], [0.045, 0.3], [0, 0.42]], [0, 0.008, 0.03, 0.04, 0]), GLOSS);
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Shape();
    fin.moveTo(0, 0);
    fin.lineTo(0.07, -0.04);
    fin.lineTo(0.07, 0.02);
    fin.lineTo(0, 0.12);
    const g = b.extrude(fin, 0.012, 0.004);
    g.translate(0.04, 0.04, -0.006);
    g.rotateY((i / 3) * Math.PI * 2);
    b.part("c2", g, GLOSS);
  }
  b.part("#9fd6ff", at(turn(b.cyl(0.018, 0.018, 0.008, 0.003), Math.PI / 2, 0, 0), 0, 0.26, 0.046), GLOSS);
  b.part("#3a3d46", at(b.cyl(0.03, 0.036, 0.03, 0.006), 0, 0.035, 0), METAL_BLACK);
}

export function newtons_cradle(b) {
  b.part("c2", at(b.box(0.24, 0.02, 0.14, 0.008), 0, 0.01, 0), WOOD_LAQ);
  for (const sz of [-1, 1]) b.part("c1", b.tube([[-0.1, 0.02, sz * 0.05], [-0.1, 0.19, sz * 0.05], [0.1, 0.19, sz * 0.05], [0.1, 0.02, sz * 0.05]], 0.004), CHROME);
  // Five balls on threads; the two outer ones swing in turn
  const balls = [-2, -1, 0, 1, 2].map((i) => {
    const pivot = new THREE.Group();
    pivot.position.set(i * 0.032, 0.19, 0);
    b.extra.add(pivot);
    const g = mergeAll([at(b.ball(0.016), 0, -0.12, 0), b.tube([[0, 0, -0.05], [0, -0.12, 0]], 0.0012, { segments: 2, roundEnds: false }), b.tube([[0, 0, 0.05], [0, -0.12, 0]], 0.0012, { segments: 2, roundEnds: false })]);
    pivot.add(b.moving("c1", g, CHROME, ""));
    return pivot;
  });
  b.onUpdate((dt, t, fx) => {
    const s = still(fx) ? 0 : Math.sin(t * 3.2);
    balls[0].rotation.z = Math.min(0, s) * 0.55;
    balls[4].rotation.z = Math.max(0, s) * 0.55;
  });
}

export function rc_drone(b) {
  b.part("c1", at(b.cushion(0.12, 0.04, 0.09, { puff: 0.4, round: 0.9 }), 0, 0.06, 0), SATIN);
  const props = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.part("c1", b.tube([[0, 0.06, 0], [sx * 0.11, 0.065, sz * 0.11]], 0.007), SATIN);
      b.part("c1", at(b.cyl(0.012, 0.012, 0.02, 0.004), sx * 0.11, 0.065, sz * 0.11), SATIN);
      const p = b.moving("#3a3d46", b.box(0.09, 0.003, 0.012, 0.0012), { family: "plastic", rough: 0.4 }, "");
      p.position.set(sx * 0.11, 0.09, sz * 0.11);
      props.push(p);
    }
  }
  for (const sx of [-1, 1]) b.part("c1", b.tube([[sx * 0.04, 0.045, -0.04], [sx * 0.05, 0.005, -0.05], [sx * 0.05, 0.005, 0.05], [sx * 0.04, 0.045, 0.04]], 0.004), SATIN);
  lit(b, "c2", at(b.ball(0.008), 0, 0.06, 0.048), 2);
  b.onUpdate((dt, t, fx) => props.forEach((p, i) => (p.rotation.y = still(fx) ? i : t * 6 + i)));
}

export function plush_claw(b) {
  // A round little creature with stubby ears and feet
  const FUR = { family: "fabric", finish: "velvet", scale: 4 };
  b.part("c1", at(b.ball(0.09, { squash: 0.95 }), 0, 0.105, 0), FUR);
  for (const sx of [-1, 1]) {
    b.part("c1", at(turn(b.capsule(0.022, 0.05), 0, 0, sx * -0.3), sx * 0.05, 0.195, 0), FUR);
    b.part("c1", at(b.ball(0.028, { squash: 0.6 }), sx * 0.045, 0.018, 0.04), FUR);
    b.part("#1c1d22", at(b.ball(0.009), sx * 0.03, 0.125, 0.082), GLOSS);
  }
  b.part("#fff2e6", at(b.ball(0.035, { squash: 0.7 }), 0, 0.09, 0.07), FUR);
  b.part("#2d2420", at(b.ball(0.007), 0, 0.1, 0.103), GLOSS);
}

// ---------- Instruments ----------
// A guitar's outline (an hourglass), for the body and the cello
function bodyShape(w, h, waist = 0.72) {
  const s = new THREE.Shape();
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const y = Math.cos(a);
    const width = (y < 0 ? 1 : 0.8) * (1 - (1 - waist) * Math.exp(-((y - 0.12) ** 2) / 0.05));
    pts.push(new THREE.Vector2(Math.sin(a) * (w / 2) * width, (-y * h) / 2));
  }
  s.setFromPoints(pts);
  return s;
}

function guitar(b, { neckSlot = "c2", wall = false } = {}) {
  const bodyH = 0.46;
  b.part("c1", at(b.extrude(bodyShape(0.36, bodyH), 0.09, 0.02), 0, bodyH / 2, 0), { family: "wood", finish: "lacquered" });
  b.part("#2a1c14", at(turn(b.cyl(0.045, 0.045, 0.004, 0.001), Math.PI / 2, 0, 0), 0, bodyH * 0.6, 0.09), { family: "plastic", rough: 0.9 });
  b.part(neckSlot, at(b.box(0.045, 0.46, 0.024, 0.008, { along: "y" }), 0, bodyH + 0.18, 0.082), WOOD);
  b.part(neckSlot, at(b.box(0.065, 0.13, 0.02, 0.01, { along: "y" }), 0, bodyH + 0.47, 0.075), WOOD);
  b.part("#3a2a20", at(b.box(0.1, 0.02, 0.012, 0.004), 0, bodyH * 0.3, 0.094), WOOD);
  const strings = [];
  for (let i = 0; i < 6; i++) strings.push(b.tube([[-0.016 + i * 0.0064, bodyH * 0.3, 0.1], [-0.014 + i * 0.0056, bodyH + 0.42, 0.097]], 0.0008, { segments: 1, roundEnds: false }));
  b.part("#d9d2c6", mergeAll(strings), CHROME);
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) b.part("#d9d2c6", at(turn(b.cyl(0.006, 0.006, 0.02, 0.002), 0, 0, Math.PI / 2), sx * 0.042, bodyH + 0.43 + i * 0.035, 0.075), CHROME);
  void wall;
}

export function guitar_wall(b) {
  guitar(b);
  // A small hook holds the neck
  b.part("#2d3038", at(b.box(0.08, 0.02, 0.07, 0.006), 0, 0.905, 0.035), METAL_BLACK);
}

export function guitar_stand(b) {
  guitar(b, { neckSlot: "#5a3d2b" });
  // Lean it back onto an A-frame stand
  for (const e of b.pieces.values()) for (const g of e.geos) (g.rotateX(-0.2), g.translate(0, 0.1, 0.02));
  for (const sx of [-1, 1]) {
    b.part("c2", b.tube([[sx * 0.2, 0.01, 0.16], [0, 0.4, -0.05], [sx * 0.2, 0.01, -0.18]], 0.009), METAL_BLACK);
    b.part("c2", b.tube([[sx * 0.1, 0.1, 0.07], [sx * 0.1, 0.09, 0.17], [sx * 0.1, 0.14, 0.18]], 0.008), METAL_BLACK);
  }
  b.part("c2", b.tube([[0, 0.4, -0.05], [0, 0.72, -0.11], [0, 0.75, -0.06]], 0.009), METAL_BLACK);
}

export function piano(b) {
  const W = 1.45, D = 0.6, H = 1.25;
  b.part("c1", at(b.box(W, H - 0.02, 0.34, 0.03), 0, (H - 0.02) / 2 + 0.02, -D / 2 + 0.17), WOOD_LAQ);
  b.part("c1", at(b.box(W + 0.04, 0.05, 0.4, 0.02), 0, H - 0.025, -D / 2 + 0.19), WOOD_LAQ);
  b.part("c1", at(b.box(W, 0.07, 0.3, 0.02), 0, 0.68, 0.14), WOOD_LAQ);
  for (const sx of [-1, 1]) {
    b.part("c1", at(b.box(0.07, 0.64, 0.26, 0.02, { along: "y" }), sx * (W / 2 - 0.035), 0.34, 0.14), WOOD_LAQ);
    b.part("c1", at(b.box(0.09, 0.04, 0.3, 0.015), sx * (W / 2 - 0.045), 0.02, 0.14), WOOD_LAQ);
  }
  keys(b, -W / 2 + 0.08, W - 0.16, 0.722, 0.19, 36, 0.13, "c2");
  b.part("c1", at(turn(b.box(W - 0.2, 0.2, 0.014, 0.006), -0.25, 0, 0), 0, 0.93, 0.065), WOOD);
  for (const x of [-0.08, 0, 0.08]) b.part("#d9b25a", at(turn(b.capsule(0.01, 0.07), Math.PI / 2 - 0.2, 0, 0), x, 0.06, 0.12), BRASS);
}

export function synth_keys(b) {
  // A keyboard on an X stand
  for (const sz of [-1, 1]) {
    b.part("#2d3038", b.tube([[-0.4, 0.02, sz * 0.14], [0.4, 0.8, sz * 0.14]], 0.014), METAL_BLACK);
    b.part("#2d3038", b.tube([[0.4, 0.02, sz * 0.14], [-0.4, 0.8, sz * 0.14]], 0.014), METAL_BLACK);
  }
  for (const [x, y] of [[-0.4, 0.02], [0.4, 0.02], [-0.4, 0.8], [0.4, 0.8]]) b.part("#2d3038", at(turn(b.capsule(0.014, 0.28), Math.PI / 2, 0, 0), x, y, 0), METAL_BLACK);
  b.part("c1", at(b.box(1.1, 0.07, 0.34, 0.022), 0, 0.85, 0), SATIN);
  keys(b, -0.5, 1.0, 0.888, 0.08, 29, 0.14);
  const knobs = [];
  for (let i = 0; i < 9; i++) knobs.push(at(b.cyl(0.014, 0.012, 0.018, 0.005), -0.44 + i * 0.065, 0.885, -0.1));
  b.part("c2", mergeAll(knobs), GLOSS);
  lit(b, "#7fd3ff", at(b.box(0.2, 0.004, 0.05, 0.002), 0.3, 0.886, -0.1), 1);
}

export function cello(b) {
  const bodyH = 0.74;
  const g = b.extrude(bodyShape(0.44, bodyH, 0.66), 0.12, 0.03);
  const parts = [[at(g, 0, bodyH / 2 + 0.1, 0), "c1", WOOD_LAQ], [at(b.box(0.04, 0.5, 0.03, 0.01, { along: "y" }), 0, bodyH + 0.3, 0.11), "#2a1c14", WOOD], [at(b.lathe([[0, 0], [0.03, 0.01], [0.012, 0.05], [0, 0.07]], [0, 0.008, 0.008, 0]), 0, bodyH + 0.55, 0.11), "c1", WOOD_LAQ], [at(b.cyl(0.006, 0.006, 0.1, 0.002), 0, 0, 0.06), "#c4c9d2", CHROME], [at(b.box(0.07, 0.03, 0.02, 0.006), 0, bodyH * 0.5, 0.135), "#e6c89a", WOOD]];
  for (const [geo, slot, spec] of parts) {
    geo.rotateX(-0.22);
    geo.translate(0, 0, 0.05);
    b.part(slot, geo, spec);
  }
  // A simple stand behind it
  for (const sx of [-1, 1]) b.part("c2", b.tube([[sx * 0.2, 0.01, -0.2], [0, 0.6, -0.1]], 0.009), METAL_BLACK);
  b.part("c2", b.tube([[0, 0.01, 0.2], [0, 0.6, -0.1]], 0.009), METAL_BLACK);
}

export function bongos(b) {
  for (const [x, r, h] of [[-0.11, 0.1, 0.24], [0.12, 0.085, 0.22]]) {
    b.part("c1", at(b.lathe([[0, 0], [r * 0.78, 0], [r, h * 0.7], [r * 0.96, h], [0, h]], [0, 0.01, 0.04, 0.01, 0]), x, 0.3, 0), WOOD_LAQ);
    b.part("c2", at(b.cyl(r * 0.95, r * 0.95, 0.012, 0.005), x, 0.3 + h - 0.004, 0), { family: "leather", rough: 0.7 });
    b.part("#c4c9d2", at(b.lathe([[r * 0.97, 0], [r * 1.03, 0], [r * 1.03, 0.014], [r * 0.97, 0.014]], 0.003), x, 0.3 + h - 0.03, 0), CHROME);
  }
  b.part("#2d3038", at(b.box(0.06, 0.05, 0.06, 0.012), 0.005, 0.42, 0), METAL_BLACK);
  // A tripod stand
  b.part("#2d3038", at(b.cyl(0.012, 0.012, 0.3, 0.003), 0.005, 0.12, 0), METAL_BLACK);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    b.part("#2d3038", b.tube([[0.005, 0.2, 0], [0.005 + Math.cos(a) * 0.17, 0.01, Math.sin(a) * 0.15]], 0.008), METAL_BLACK);
  }
}

export function metronome(b) {
  const s = new THREE.Shape();
  s.moveTo(-0.055, 0);
  s.lineTo(0.055, 0);
  s.lineTo(0.022, 0.23);
  s.lineTo(-0.022, 0.23);
  b.part("c1", at(b.extrude(s, 0.09, 0.012), 0, 0, -0.045), WOOD_LAQ);
  b.part("#f1ead8", at(b.box(0.03, 0.15, 0.004, 0.0015), 0, 0.115, 0.046), { family: "paper", map: false });
  const arm = new THREE.Group();
  arm.position.set(0, 0.04, 0.052);
  b.extra.add(arm);
  arm.add(b.moving("c2", mergeAll([at(b.box(0.005, 0.2, 0.003, 0.001), 0, 0.1, 0), at(b.box(0.022, 0.022, 0.008, 0.004), 0, 0.14, 0)]), BRASS, ""));
  b.onUpdate((dt, t, fx) => (arm.rotation.z = b.state.on && !still(fx) ? Math.sin(t * 4) * 0.45 : 0.18));
}

export function kalimba(b) {
  b.part("c1", at(b.cushion(0.12, 0.035, 0.18, { puff: 0.15, round: 0.5 }), 0, 0.02, 0), WOOD_LAQ);
  b.part("#2a1c14", at(b.cyl(0.018, 0.018, 0.002, 0.0008), 0, 0.038, 0.045), { family: "plastic", rough: 0.9 });
  b.part("#c4c9d2", at(turn(b.capsule(0.004, 0.1), 0, 0, Math.PI / 2), 0, 0.044, -0.04), CHROME);
  const tines = [];
  for (let i = 0; i < 9; i++) tines.push(at(b.box(0.007, 0.002, 0.07 + (4 - Math.abs(i - 4)) * 0.008, 0.0009), -0.044 + i * 0.011, 0.047, -0.005 + (4 - Math.abs(i - 4)) * 0.004));
  b.part("c2", mergeAll(tines), CHROME);
}

export function gramophone(b) {
  b.part("c2", at(b.box(0.36, 0.16, 0.36, 0.025), 0, 0.08, 0), WOOD_LAQ);
  b.part("#2d3038", at(b.cyl(0.14, 0.14, 0.012, 0.004), 0, 0.16, 0), METAL_BLACK);
  const record = b.moving("#1a1a1e", b.lathe([[0.005, 0], [0.135, 0], [0.135, 0.004], [0.005, 0.004]], 0.0015), { family: "plastic", finish: "gloss" }, "record");
  record.position.y = 0.173;
  b.part("#e05a47", at(b.cyl(0.035, 0.035, 0.005, 0.0015), 0, 0.173, 0), { family: "paper", map: false });
  // The great brass horn, curving up from the back corner
  b.part("c1", b.tube([[0.12, 0.17, -0.12], [0.16, 0.3, -0.15], [0.12, 0.42, -0.1]], 0.016), BRASS);
  const horn = b.lathe([[0.016, 0], [0.03, 0.06], [0.08, 0.18], [0.2, 0.3], [0.215, 0.31], [0.2, 0.305], [0.075, 0.18], [0.024, 0.06]], [0, 0.02, 0.05, 0.02, 0.004, 0.02, 0.05, 0]);
  turn(horn, 0.95, 0.5, 0);
  b.part("c1", at(horn, 0.12, 0.42, -0.1), { family: "metal", finish: "polished", rough: 0.22, side: "double" });
  b.part("c1", b.tube([[0.2, 0.1, 0.1], [0.24, 0.1, 0.1], [0.24, 0.13, 0.1]], 0.006), BRASS);
  if (b.state.on) b.onUpdate((dt, t, fx) => (record.rotation.y = still(fx) ? 0 : -t * 4));
}

export function mini_synth(b) {
  b.part("c1", at(b.box(0.45, 0.05, 0.2, 0.018), 0, 0.025, 0), SATIN);
  keys(b, -0.2, 0.4, 0.056, 0.04, 14, 0.09, "c2");
  const knobs = [];
  for (let i = 0; i < 6; i++) knobs.push(at(b.cyl(0.011, 0.009, 0.016, 0.004), -0.18 + i * 0.05, 0.05, -0.06));
  b.part("#2d3038", mergeAll(knobs), GLOSS);
  lit(b, "#ff7a45", at(b.box(0.06, 0.004, 0.025, 0.002), 0.16, 0.051, -0.06), 1.2);
}
