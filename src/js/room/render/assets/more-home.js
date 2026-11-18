// More of the home: kitchen things, the remaining lights, rugs, windows and doors, and wall decor.
// Wall things have their back at z = 0 and start at y = 0; ceiling things hang down from y = 0.
import * as THREE from "three";
import { at, turn } from "../kit/build.js";
import { merge as mergeAll } from "../kit/geometry.js";
import { neonTexture } from "../../../robot/places/kit.js";

const WOOD = { family: "wood" };
const WOOD_LAQ = { family: "wood", finish: "lacquered" };
const PAINTED = { family: "wood", finish: "painted" };
const METAL_BLACK = { family: "metal", finish: "black", rough: 0.38 };
const BRASS = { family: "metal", finish: "polished", rough: 0.22 };
const SATIN = { family: "plastic" };
const GLOSS = { family: "plastic", finish: "gloss" };
const CERAMIC = { family: "ceramic" };
const PAPER = { family: "paper" };
const on = (b) => b.state.on !== false;
const flat = (b, shape, t, bevel) => turn(b.extrude(shape, t, bevel), -Math.PI / 2, 0, 0);

// Rising puffs of steam over a point (shared by the kettle-like things)
function steam(b, x, y, z, n = 3) {
  const puffs = Array.from({ length: n }, () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false }));
    b.extra.add(m);
    return m;
  });
  b.onUpdate((dt, t, fx) => {
    puffs.forEach((p, i) => {
      const k = (t * 0.35 + i / n) % 1;
      p.position.set(x + Math.sin(t * 1.3 + i * 2) * 0.01, y + k * 0.12, z);
      p.scale.setScalar(0.6 + k * 1.4);
      p.material.opacity = fx?.friendly ? 0 : 0.2 * Math.sin(k * Math.PI);
    });
  });
}

// ---------- Kitchen ----------
export function counter_kitchen(b) {
  const W = 2.2, D = 0.62, H = 0.92;
  b.part("c1", at(b.box(W - 0.04, H - 0.14, D - 0.06, 0.02), 0, 0.1 + (H - 0.14) / 2, -0.01), PAINTED);
  b.part("#2d2a28", at(b.box(W - 0.1, 0.1, D - 0.14, 0.01), 0, 0.05, -0.03), SATIN);
  b.part("c2", at(b.box(W, 0.045, D, 0.016), 0, H - 0.0225, 0), { family: "clay", map: "terrazzo", scale: 2, rough: 0.4 });
  // Four doors and a row of drawers, each with a soft pull
  for (let i = 0; i < 4; i++) {
    const x = -W / 2 + 0.29 + i * 0.54;
    b.part("c1", at(b.box(0.5, 0.5, 0.02, 0.012), x, 0.39, D / 2 - 0.03), PAINTED);
    b.part("c1", at(b.box(0.5, 0.16, 0.02, 0.012), x, 0.75, D / 2 - 0.03), PAINTED);
    b.part("c3", at(turn(b.capsule(0.007, 0.1), 0, 0, Math.PI / 2), x, 0.75, D / 2 - 0.012), BRASS);
    b.part("c3", at(b.capsule(0.007, 0.08), x + (i % 2 ? -0.2 : 0.2), 0.52, D / 2 - 0.012), BRASS);
  }
  // A sink with a curved tap
  b.part("#c4c9d2", at(b.box(0.5, 0.012, 0.36, 0.006), 0.6, H + 0.002, 0), { family: "metal", finish: "brushed" });
  b.part("#c4c9d2", b.tube([[0.6, H, -0.2], [0.6, H + 0.12, -0.2], [0.6, H + 0.14, -0.1], [0.6, H + 0.09, -0.08]], 0.012), BRASS);
}

export function pastry_case(b) {
  const W = 1.1, D = 0.55;
  b.part("c1", at(b.box(W, 0.6, D, 0.03), 0, 0.3, 0), PAINTED);
  b.part("#f1ead8", at(b.box(W - 0.04, 0.02, D - 0.04, 0.008), 0, 0.61, 0), { family: "ceramic", rough: 0.4 });
  b.part("#f1ead8", at(b.box(W - 0.1, 0.012, D - 0.14, 0.005), 0, 0.82, -0.02), { family: "ceramic", rough: 0.4 });
  // A curved glass front
  const glass = new THREE.Shape();
  glass.moveTo(-D / 2 + 0.02, 0);
  glass.lineTo(D / 2 - 0.04, 0);
  glass.quadraticCurveTo(D / 2 - 0.02, 0.32, D / 2 - 0.18, 0.42);
  glass.lineTo(-D / 2 + 0.02, 0.42);
  const g = b.extrude(glass, W - 0.04, 0.004);
  g.rotateY(-Math.PI / 2);
  b.part("#cfe4f2", at(g, W / 2 - 0.02, 0.62, 0), { family: "glass", opacity: 0.22 });
  b.part("c1", at(b.box(W, 0.03, D - 0.1, 0.012), 0, 1.045, -0.05), PAINTED);
  // Pastries: little buns, a cake slice, croissants
  const tints = ["#ffffff", "#e6c08a", "#f2b6c4", "#c98a5a"];
  for (let i = 0; i < 9; i++) {
    const shelf = i < 5 ? 0.62 : 0.83;
    const x = -0.4 + (i % 5) * 0.2 + (i >= 5 ? 0.1 : 0);
    b.part("c2", at(b.ball(0.045, { squash: 0.65 }), x, shelf + 0.03, 0.02), { family: "clay", rough: 0.7, map: false }, { tint: tints[i % 4] });
  }
}

export function espresso(b) {
  b.part("c1", at(b.box(0.34, 0.3, 0.3, 0.03), 0, 0.2, -0.01), { family: "metal", finish: "brushed" });
  b.part("c2", at(b.box(0.36, 0.05, 0.34, 0.016), 0, 0.025, 0), SATIN);
  b.part("c2", at(b.box(0.3, 0.05, 0.26, 0.016), 0, 0.375, -0.01), SATIN);
  b.part("c2", at(b.cyl(0.035, 0.03, 0.05, 0.008), 0, 0.14, 0.13), SATIN);
  b.part("c2", at(turn(b.capsule(0.012, 0.1), Math.PI / 2, 0, 0), 0, 0.165, 0.2), SATIN);
  b.part("#f4efe6", at(b.cyl(0.03, 0.026, 0.045, 0.006), 0, 0.05, 0.13), CERAMIC);
  for (const sx of [-1, 1]) b.part("c2", at(b.ball(0.02), sx * 0.1, 0.3, 0.145), GLOSS);
  b.glow(on(b) && b.state.on ? "#ff7a45" : "#3a2a24", at(b.ball(0.008), 0, 0.31, 0.146), { intensity: b.state.on ? 2 : 0.1 });
}

export function fruit_bowl(b) {
  b.part("c1", b.lathe([[0, 0], [0.06, 0], [0.07, 0.012], [0.155, 0.1], [0.16, 0.115], [0.15, 0.115], [0.065, 0.03], [0, 0.03]], [0, 0.006, 0.01, 0.01, 0.004, 0.004, 0.01, 0]), CERAMIC);
  const fruits = [["#ffffff", 0, 0.07, 0, 0.045], ["#f2c14e", 0.06, 0.08, 0.03, 0.04], ["#8fc46a", -0.06, 0.08, 0.02, 0.042], ["#f29a4a", 0.0, 0.085, -0.06, 0.04], ["#ffffff", -0.03, 0.125, -0.01, 0.04]];
  for (const [c, x, y, z, r] of fruits) b.part("c2", at(b.ball(r, { squash: 0.92 }), x, y, z), { family: "plastic", rough: 0.4 }, { tint: c });
}

export function cake_stand(b) {
  b.part("c2", b.lathe([[0, 0], [0.07, 0], [0.075, 0.01], [0.02, 0.03], [0.018, 0.1], [0.14, 0.12], [0.145, 0.13], [0, 0.13]], [0, 0.004, 0.006, 0.01, 0.01, 0.006, 0.004, 0]), CERAMIC);
  // Two layers with cream between and berries on top
  b.part("c1", at(b.cyl(0.11, 0.11, 0.06, 0.012), 0, 0.13, 0), { family: "clay", rough: 0.7, map: false });
  b.part("#fff6e6", at(b.cyl(0.113, 0.113, 0.016, 0.006), 0, 0.186, 0), { family: "clay", rough: 0.5, map: false });
  b.part("c1", at(b.cyl(0.11, 0.11, 0.06, 0.012), 0, 0.2, 0), { family: "clay", rough: 0.7, map: false });
  b.part("#fff6e6", at(b.cyl(0.112, 0.105, 0.02, 0.008), 0, 0.258, 0), { family: "clay", rough: 0.5, map: false });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.part("#d6304a", at(b.ball(0.014), Math.cos(a) * 0.075, 0.287, Math.sin(a) * 0.075), GLOSS);
  }
}

export function ramen_bowl(b) {
  b.part("c1", b.lathe([[0, 0], [0.04, 0], [0.045, 0.012], [0.105, 0.11], [0.11, 0.125], [0.1, 0.125], [0.04, 0.03], [0, 0.03]], [0, 0.005, 0.008, 0.01, 0.004, 0.004, 0.01, 0]), CERAMIC);
  b.part("c2", at(b.cyl(0.092, 0.092, 0.006, 0.002), 0, 0.108, 0), { family: "ceramic", rough: 0.12 });
  b.part("#fff6e0", at(b.ball(0.024, { squash: 0.5 }), 0.03, 0.118, 0.02), { family: "clay", map: false });
  b.part("#f2b84a", at(b.ball(0.012, { squash: 0.5 }), 0.03, 0.126, 0.02), GLOSS);
  b.part("#4d8a62", at(b.box(0.05, 0.004, 0.03, 0.002), -0.035, 0.116, 0.01), { family: "leaf" });
  for (const dz of [-0.008, 0.008]) b.part("#3a2a20", at(turn(b.capsule(0.003, 0.2), Math.PI / 2 - 0.25, 0.5, 0), -0.03, 0.14, -0.03 + dz), WOOD);
  if (b.state.steam !== false) steam(b, 0, 0.13, 0);
}

export function tea_set(b) {
  // A squat iron pot with a hoop handle and two cups on a tray
  b.part("#3a2a20", at(b.box(0.36, 0.014, 0.24, 0.006), 0, 0.007, 0), WOOD_LAQ);
  b.part("c1", at(b.lathe([[0, 0], [0.06, 0], [0.085, 0.045], [0.07, 0.095], [0.03, 0.105], [0, 0.105]], [0, 0.012, 0.03, 0.02, 0.01, 0]), -0.07, 0.014, 0), { family: "metal", finish: "black", rough: 0.6 });
  b.part("c1", at(b.ball(0.012), -0.07, 0.125, 0), { family: "metal", finish: "black", rough: 0.6 });
  b.part("c1", b.tube([[-0.005, 0.07, 0], [0.03, 0.09, 0], [0.045, 0.11, 0]], 0.009), { family: "metal", finish: "black", rough: 0.6 });
  b.part("c1", b.tube([[-0.13, 0.1, 0], [-0.115, 0.17, 0], [-0.07, 0.195, 0], [-0.025, 0.17, 0], [-0.01, 0.1, 0]], 0.006), { family: "metal", finish: "black", rough: 0.6 });
  for (const z of [-0.06, 0.06]) b.part("c2", at(b.lathe([[0, 0], [0.022, 0], [0.03, 0.04], [0.026, 0.04], [0.018, 0.008], [0, 0.008]], [0, 0.004, 0.003, 0.003, 0.004, 0]), 0.1, 0.014, z), CERAMIC);
  if (b.state.steam !== false) steam(b, 0.05, 0.13, 0, 2);
}

export function cookie_jar(b) {
  for (let i = 0; i < 9; i++) b.part("c2", at(turn(b.cyl(0.035, 0.035, 0.012, 0.005), (b.rand() - 0.5) * 0.6, 0, (b.rand() - 0.5) * 0.6), (b.rand() - 0.5) * 0.06, 0.03 + i * 0.016, (b.rand() - 0.5) * 0.06), { family: "clay", rough: 0.8, map: false });
  b.part("c1", b.lathe([[0, 0], [0.075, 0], [0.085, 0.02], [0.085, 0.17], [0.06, 0.2], [0.06, 0.21]], [0, 0.01, 0.02, 0.02, 0.008, 0]), { family: "glass", opacity: 0.25 });
  b.part("#c89b6e", at(b.cyl(0.066, 0.066, 0.03, 0.01), 0, 0.205, 0), WOOD_LAQ);
  b.part("#c89b6e", at(b.ball(0.018), 0, 0.245, 0), WOOD_LAQ);
}

// ---------- Lights ----------
export function lava_lamp(b) {
  b.part("c2", b.lathe([[0, 0], [0.07, 0], [0.075, 0.02], [0.045, 0.13], [0, 0.13]], [0, 0.008, 0.012, 0.008, 0]), BRASS);
  b.part("c2", b.lathe([[0.03, 0.38], [0.036, 0.385], [0.02, 0.45], [0, 0.46]], [0, 0.004, 0.01, 0]), BRASS);
  b.part("#ffffff", b.lathe([[0.044, 0.13], [0.06, 0.2], [0.032, 0.385]], [0, 0.04, 0]), { family: "glass", opacity: 0.2 });
  // Blobs of lava rising and falling inside
  const blobs = [0, 1, 2, 3].map((i) => {
    const m = b.moving(on(b) ? "c1" : "#5a3a48", b.ball(0.016 + i * 0.004), { family: "emissive", intensity: on(b) ? 1.8 : 0.1 }, "");
    return m;
  });
  b.onUpdate((dt, t, fx) => {
    blobs.forEach((m, i) => {
      const k = fx?.reduced ? 0.3 + i * 0.15 : 0.5 + 0.5 * Math.sin(t * (0.25 + i * 0.07) + i * 1.7);
      m.position.set(Math.sin(t * 0.3 + i) * 0.008, 0.16 + k * 0.19, Math.cos(t * 0.2 + i) * 0.008);
      m.scale.set(1, 1.2 + 0.3 * Math.sin(t * 0.6 + i), 1);
    });
  });
}

export function lantern_paper(b) {
  b.part("c2", b.tube([[0, 0, 0], [0, -0.22, 0]], 0.004), { family: "rubber" });
  const lit = on(b);
  // A ribbed paper globe that glows softly from inside
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI;
    pts.push([Math.max(0.03, Math.sin(a) * 0.24 * (1 + 0.03 * Math.cos(i * Math.PI))), -0.22 - 0.24 + Math.cos(a) * -0.24 + 0.24 * 0]);
  }
  const g = b.lathe(pts.map(([r, y]) => [r, y - 0.0]), 0.006);
  b.part(lit ? "c1" : "#b8b0a0", g, { family: "emissive", intensity: lit ? 0.9 : 0.05, rough: 0.9 });
  b.part("#2b2e35", at(b.cyl(0.035, 0.035, 0.012, 0.004), 0, -0.232, 0), SATIN);
}

export function pendant(b) {
  b.part("c2", b.tube([[0, 0, 0], [0, -0.62, 0]], 0.004), { family: "rubber" });
  b.part("c2", at(b.cyl(0.04, 0.04, 0.02, 0.006), 0, -0.02, 0), SATIN);
  b.part("c1", b.lathe([[0.03, -0.62], [0.045, -0.64], [0.19, -0.86], [0.195, -0.88], [0.185, -0.88], [0.04, -0.655]], [0, 0.01, 0.02, 0.004, 0.004, 0]), { family: "metal", finish: "brushed", rough: 0.35, side: "double" });
  b.glow(on(b) ? "#ffe2b0" : "#5a5040", at(b.ball(0.04), 0, -0.8, 0), { intensity: on(b) ? 2.4 : 0.1 });
}

export function neon_bar(b) {
  b.part("c2", at(b.box(1.2, 0.03, 0.02, 0.008), 0, 0.04, 0.01), SATIN);
  b.glow(on(b) ? "c1" : "#3a4a48", at(turn(b.capsule(0.016, 1.12), 0, 0, Math.PI / 2), 0, 0.04, 0.04), { intensity: on(b) ? 2.6 : 0.05 });
  for (const sx of [-1, 1]) b.part("c2", at(b.box(0.03, 0.05, 0.05, 0.01), sx * 0.5, 0.04, 0.025), SATIN);
}

export function neon_sign(b) {
  const W = 1.1, H = 0.42;
  b.part("c2", at(b.box(W, H, 0.02, 0.01), 0, H / 2, 0.01), { family: "plastic", rough: 0.5 });
  // The words in glowing tube letters (drawn on a canvas, lit from within)
  if (typeof document === "undefined") return;
  const tex = neonTexture(String(b.state.text || "ON AIR").slice(0, 16), b.colorOf("c1"));
  tex.userData.owned = true;
  const mat = new THREE.MeshStandardMaterial({ color: "#000000", emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: on(b) ? 1.8 : 0.15, transparent: true, alphaMap: null, map: tex, roughness: 0.6 });
  mat.userData.glow = true;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.06, H - 0.04), mat);
  face.position.set(0, H / 2, 0.026);
  b.extra.add(face);
}

export function lantern_floor(b) {
  b.part("c1", at(b.box(0.26, 0.03, 0.26, 0.012), 0, 0.015, 0), METAL_BLACK);
  b.part("c1", at(b.box(0.26, 0.03, 0.26, 0.012), 0, 0.455, 0), METAL_BLACK);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.part("c1", at(b.cyl(0.01, 0.01, 0.42, 0.003), sx * 0.115, 0.03, sz * 0.115), METAL_BLACK);
  b.part("#ffffff", at(b.box(0.22, 0.4, 0.22, 0.01), 0, 0.235, 0), { family: "glass", opacity: 0.16 });
  b.part("c1", b.tube([[-0.08, 0.47, 0], [0, 0.6, 0], [0.08, 0.47, 0]], 0.008), METAL_BLACK);
  b.part("#f4efe6", at(b.cyl(0.035, 0.035, 0.14, 0.008), 0, 0.03, 0), { family: "clay", rough: 0.6, map: false });
  b.glow(on(b) ? "c2" : "#5a5040", at(b.lathe([[0, 0], [0.012, 0.014], [0.009, 0.03], [0, 0.05]], [0, 0.004, 0.005, 0]), 0, 0.175, 0), { intensity: on(b) ? 3 : 0.05 });
}

export function lamp_banker(b) {
  b.part("c2", b.lathe([[0, 0], [0.09, 0], [0.095, 0.012], [0.03, 0.03], [0.012, 0.06], [0.012, 0.3], [0, 0.3]], [0, 0.005, 0.008, 0.012, 0.01, 0.004, 0]), BRASS);
  // The long green glass shade, open below
  const shade = turn(b.lathe([[0.058, 0], [0.075, 0.01], [0.075, 0.3], [0.058, 0.31], [0.05, 0.3], [0.066, 0.02]], [0, 0.01, 0.01, 0.008, 0.006, 0], ), 0, 0, Math.PI / 2);
  b.part("c1", at(shade, 0.155, 0.34, 0.03), { family: "ceramic", rough: 0.2, side: "double" });
  b.glow(on(b) ? "#fff0cc" : "#4a4a40", at(turn(b.capsule(0.02, 0.2), 0, 0, Math.PI / 2), 0, 0.325, 0.03), { intensity: on(b) ? 2 : 0.05 });
  b.part("c2", b.tube([[0.03, 0.2, 0.01], [0.05, 0.14, 0.02], [0.05, 0.1, 0.02]], 0.0025), BRASS);
  b.part("c2", at(b.ball(0.007), 0.05, 0.095, 0.02), BRASS);
}

// ---------- Rugs ----------
export function rug_cloud(b) {
  // A cloud outline: overlapping round puffs
  const s = new THREE.Shape();
  const puffs = [[-0.5, 0, 0.32], [-0.2, 0.18, 0.36], [0.2, 0.2, 0.38], [0.52, 0.02, 0.3], [0.25, -0.18, 0.34], [-0.18, -0.2, 0.34]];
  const pts = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    let best = 0;
    for (const [cx, cz, r] of puffs) {
      // the farthest point of any puff in this direction
      const d = cx * Math.cos(a) + cz * Math.sin(a) + Math.sqrt(Math.max(0, r * r - (cx * Math.sin(a) - cz * Math.cos(a)) ** 2));
      best = Math.max(best, d);
    }
    pts.push(new THREE.Vector2(Math.cos(a) * best, Math.sin(a) * best));
  }
  s.setFromPoints(pts);
  b.part("c1", flat(b, s, 0.02, 0.008), { family: "fabric", finish: "boucle", scale: 2.5 });
}

export function mat_yoga(b) {
  b.part("c1", flat(b, b.rrect(1.8, 0.6, 0.03), 0.01, 0.004), { family: "rubber", map: "weave", scale: 3 });
}

export function mat_pebble(b) {
  b.part("c1", flat(b, b.rrect(1.2, 0.8, 0.2), 0.02, 0.008), { family: "fabric", finish: "boucle", scale: 2 });
  for (let i = 0; i < 16; i++) {
    const r = 0.04 + b.rand() * 0.035;
    b.part("c2", at(b.ball(r, { squash: 0.35 }), (b.rand() - 0.5) * 0.9, 0.022, (b.rand() - 0.5) * 0.5), { family: "clay", rough: 0.6, map: false }, { tint: ["#ffffff", "#d9d2c6", "#b8b0a4"][i % 3] });
  }
}

export function rug_braided(b) {
  // An oval of braided rings, alternating the two colors
  for (let i = 0; i < 7; i++) {
    const rx = 0.9 - i * 0.12;
    const rz = 0.6 - i * 0.08;
    const pts = [];
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * rx, 0.008, Math.sin(a) * rz));
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 80, 0.058, 6, true);
    tube.scale(1, 0.14, 1);
    b.part(i % 2 ? "c2" : "c1", tube, { family: "fabric", finish: "knit", scale: 4 });
  }
  b.part("c1", flat(b, new THREE.Shape(new THREE.EllipseCurve(0, 0, 0.1, 0.07).getPoints(24)), 0.012, 0.004), { family: "fabric", finish: "knit", scale: 4 });
}

// ---------- Windows and doors ----------
function pane(b, geo, y, z = 0.03) {
  const view = b.moving("#cfe4f2", geo, { family: "glass", opacity: 0.28 }, "view");
  view.position.set(0, y, z);
}

export function window_round(b) {
  const R = 0.45;
  const ringShape = new THREE.Shape();
  ringShape.absarc(0, 0, R, 0, Math.PI * 2);
  const hole = new THREE.Path();
  hole.absarc(0, 0, R - 0.06, 0, Math.PI * 2, true);
  ringShape.holes.push(hole);
  b.part("c1", at(b.extrude(ringShape, 0.07, 0.016), 0, R, 0.005), { family: "metal", finish: "brushed" });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.part("c1", at(b.ball(0.014), Math.cos(a) * (R - 0.03), R + Math.sin(a) * (R - 0.03), 0.075), BRASS);
  }
  const disc = new THREE.Shape();
  disc.absarc(0, 0, R - 0.06, 0, Math.PI * 2);
  pane(b, b.extrude(disc, 0.006, 0.002), R);
}

export function window_shoji(b) {
  const W = 1.4, H = 1.4;
  const frame = b.rrect(W, H, 0.02);
  frame.holes.push(new THREE.Path(b.rrect(W - 0.1, H - 0.1, 0.01).getPoints(16).reverse()));
  b.part("c2", at(b.extrude(frame, 0.06, 0.012), 0, H / 2, 0.005), WOOD);
  const open = b.state.open ? 0.3 : 0;
  for (const sx of [-1, 1]) {
    // Two sliding paper screens with a thin lattice
    const x = sx * (W / 4 - 0.025) + (sx > 0 ? -open : 0);
    b.part("c1", at(b.box(W / 2 - 0.06, H - 0.12, 0.008, 0.003), x, H / 2, 0.03 + (sx > 0 ? 0.012 : 0)), { family: "paper", rough: 0.9 });
    const bars = [];
    for (let i = 1; i < 3; i++) bars.push(at(b.box(0.012, H - 0.12, 0.012, 0.004), x - (W / 4 - 0.03) + (i * (W / 2 - 0.06)) / 3, H / 2, 0.036 + (sx > 0 ? 0.012 : 0)));
    for (let j = 1; j < 5; j++) bars.push(at(b.box(W / 2 - 0.06, 0.012, 0.012, 0.004), x, 0.06 + (j * (H - 0.12)) / 5, 0.036 + (sx > 0 ? 0.012 : 0)));
    b.part("c2", mergeAll(bars), WOOD);
  }
  pane(b, b.box(W - 0.1, H - 0.1, 0.004, 0.002), H / 2, 0.012);
}

export function window_viewport(b) {
  const W = 3.2, H = 1.6;
  const frame = b.rrect(W, H, 0.3);
  frame.holes.push(new THREE.Path(b.rrect(W - 0.2, H - 0.2, 0.22).getPoints(32).reverse()));
  b.part("c1", at(b.extrude(frame, 0.14, 0.03), 0, H / 2, 0.005), { family: "metal", finish: "brushed", rough: 0.4 });
  const trim = b.rrect(W - 0.16, H - 0.16, 0.24);
  trim.holes.push(new THREE.Path(b.rrect(W - 0.2, H - 0.2, 0.22).getPoints(32).reverse()));
  b.glow("c2", at(b.extrude(trim, 0.012, 0.004), 0, H / 2, 0.146), { intensity: 1.6 });
  for (const x of [-W / 6, W / 6]) b.part("c1", at(b.box(0.05, H - 0.2, 0.06, 0.016, { along: "y" }), x, H / 2, 0.08), { family: "metal", finish: "brushed", rough: 0.4 });
  pane(b, b.extrude(b.rrect(W - 0.2, H - 0.2, 0.22), 0.006, 0.002), H / 2, 0.04);
}

export function door(b) {
  const W = 0.9, H = 2.05;
  // The frame, and a panelled door that stands ajar when open
  const frame = new THREE.Shape();
  frame.moveTo(-W / 2, 0);
  frame.lineTo(-W / 2, H);
  frame.lineTo(W / 2, H);
  frame.lineTo(W / 2, 0);
  frame.lineTo(W / 2 - 0.05, 0);
  frame.lineTo(W / 2 - 0.05, H - 0.05);
  frame.lineTo(-W / 2 + 0.05, H - 0.05);
  frame.lineTo(-W / 2 + 0.05, 0);
  b.part("c1", at(b.extrude(frame, 0.1, 0.012), 0, 0, 0.005), PAINTED);
  const leaf = new THREE.Group();
  leaf.position.set(-W / 2 + 0.055, 0, 0.05);
  leaf.rotation.y = b.state.open ? 1.1 : 0;
  b.extra.add(leaf);
  const lw = W - 0.11;
  const slab = b.moving("c1", at(b.box(lw, H - 0.07, 0.04, 0.012, { along: "y" }), lw / 2, (H - 0.07) / 2 + 0.01, 0), PAINTED, "");
  leaf.add(slab);
  const panels = mergeAll([at(b.box(lw - 0.2, 0.75, 0.012, 0.006), lw / 2, 1.45, 0.022), at(b.box(lw - 0.2, 0.75, 0.012, 0.006), lw / 2, 0.55, 0.022)]);
  leaf.add(b.moving("c1", panels, { family: "wood", finish: "painted", seed: 2 }, ""));
  leaf.add(b.moving("c2", mergeAll([at(b.ball(0.028), lw - 0.07, 1.0, 0.05), at(turn(b.cyl(0.012, 0.012, 0.04, 0.004), Math.PI / 2, 0, 0), lw - 0.07, 1.0, 0.02)]), BRASS, ""));
}

export function blinds(b) {
  const W = 1.2, H = 1.4;
  b.part("c1", at(b.box(W, 0.05, 0.06, 0.015), 0, H - 0.025, 0.03), SATIN);
  const open = b.state.open !== false;
  const n = 22;
  const slats = [];
  for (let i = 0; i < n; i++) slats.push(at(turn(b.box(W - 0.04, 0.004, 0.045, 0.002), open ? 0.25 : 1.2, 0, 0), 0, H - 0.08 - i * ((H - 0.12) / n), 0.03));
  b.part("c1", mergeAll(slats), { family: "plastic", rough: 0.6 });
  b.part("c1", at(b.box(W - 0.02, 0.03, 0.05, 0.01), 0, 0.015, 0.03), SATIN);
  for (const sx of [-1, 1]) b.part("#d9d2c6", b.tube([[sx * 0.4, H - 0.05, 0.03], [sx * 0.4, 0.03, 0.03]], 0.002), { family: "rubber" });
}

export function curtains(b) {
  const W = 1.6, H = 2.1;
  b.part("c2", at(turn(b.capsule(0.014, W + 0.1), 0, 0, Math.PI / 2), 0, H - 0.03, 0.06), METAL_BLACK);
  for (const sx of [-1, 1]) b.part("c2", at(b.ball(0.028), sx * (W / 2 + 0.07), H - 0.03, 0.06), BRASS);
  const open = b.state.open !== false;
  const pw = open ? 0.36 : W / 2 - 0.02;
  for (const sx of [-1, 1]) {
    const s = new THREE.Shape();
    const folds = open ? 5 : 9;
    for (let i = 0; i <= 36; i++) {
      const x = -pw / 2 + (i / 36) * pw;
      const y = Math.sin((i / 36) * folds * Math.PI * 2) * 0.028;
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    for (let i = 36; i >= 0; i--) s.lineTo(-pw / 2 + (i / 36) * pw, Math.sin((i / 36) * folds * Math.PI * 2) * 0.028 - 0.014);
    const g = new THREE.ExtrudeGeometry(s, { depth: H - 0.06, bevelEnabled: false, curveSegments: 4 });
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    b.part("c1", at(g, sx * (open ? W / 2 - pw / 2 : pw / 2 + 0.01), 0.005, 0.065), { family: "fabric", finish: "velvet", side: "double" });
  }
}

// ---------- Wall decor ----------
function archFrame(b, w, h, t = 0.04) {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, h - r);
  s.absarc(0, h - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  const inner = new THREE.Shape();
  const r2 = r - t;
  inner.moveTo(-r2, t);
  inner.lineTo(r2, t);
  inner.lineTo(r2, h - r);
  inner.absarc(0, h - r, r2, 0, Math.PI, false);
  inner.lineTo(-r2, t);
  s.holes.push(new THREE.Path(inner.getPoints(32).reverse()));
  return { frame: s, inner };
}

export function mirror_wall(b) {
  const { frame, inner } = archFrame(b, 0.6, 0.9);
  b.part("c1", at(b.extrude(frame, 0.035, 0.012), 0, 0, 0), BRASS);
  b.part("#cfd8de", at(b.extrude(inner, 0.006, 0.002), 0, 0, 0.008), { family: "metal", finish: "polished", rough: 0.04, metal: 1 });
}

export function macrame(b) {
  b.part("c2", at(turn(b.capsule(0.012, 0.56), 0, 0, Math.PI / 2), 0, 0.82, 0.02), WOOD);
  // Knotted cords in a pointed fall, with a fringe
  const cords = [];
  const n = 15;
  for (let i = 0; i < n; i++) {
    const x = -0.25 + (i / (n - 1)) * 0.5;
    const len = 0.45 + (1 - Math.abs(i - (n - 1) / 2) / ((n - 1) / 2)) * 0.34;
    cords.push(b.tube([[x, 0.81, 0.02], [x + (i % 2 ? 0.012 : -0.012), 0.81 - len * 0.5, 0.024], [x, 0.81 - len, 0.02]], 0.008, { segments: 10 }));
  }
  for (let r = 0; r < 4; r++) for (let i = r % 2; i < n - 1; i += 2) cords.push(at(b.ball(0.014), -0.25 + ((i + 0.5) / (n - 1)) * 0.5, 0.74 - r * 0.07, 0.024));
  b.part("c1", mergeAll(cords), { family: "fabric", finish: "knit", scale: 6 });
}

// A canvas drawn once for a flat face (calendar pages, posters, charts)
function drawn(key, w, h, draw) {
  if (drawn.cache.has(key)) return drawn.cache.get(key);
  // No page (the geometry tests run in Node): a plain pixel stands in for the picture
  if (typeof document === "undefined") return new THREE.DataTexture(new Uint8Array([240, 236, 226, 255]), 1, 1);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.shared = true;
  drawn.cache.set(key, t);
  return t;
}
drawn.cache = new Map();

// A flat face that shows a drawn picture: its own material (not shared), UVs 0..1
function face(b, w, h, tex, { glow = 0 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  if (glow) {
    mat.emissive = new THREE.Color("#ffffff");
    mat.emissiveMap = tex;
    mat.emissiveIntensity = glow;
    mat.userData.glow = true;
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  b.extra.add(m);
  return m;
}

export function calendar_wall(b) {
  const W = 0.36, H = 0.5;
  b.part("c1", at(b.box(W, H, 0.012, 0.005), 0, H / 2, 0.006), PAPER);
  b.part("c2", at(b.box(W, 0.08, 0.016, 0.006), 0, H - 0.04, 0.008), { family: "paper", map: false });
  for (const sx of [-1, 1]) b.part("#c4c9d2", at(turn(b.ring(0.012, 0.003), 0, Math.PI / 2, 0), sx * 0.1, H - 0.005, 0.012), BRASS);
  // This month as a grid with today marked (your events show only when you switch them on)
  const now = new Date();
  const tex = drawn(`cal-${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`, 288, 336, (ctx, w, h) => {
    ctx.fillStyle = "#fbf8f1";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#3a3a3a";
    ctx.font = "600 26px system-ui, sans-serif";
    ctx.textAlign = "center";
    const first = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const cell = first + d - 1;
      const x = 24 + (cell % 7) * 40;
      const y = 44 + Math.floor(cell / 7) * 52;
      if (d === now.getDate()) {
        ctx.fillStyle = "#e5484d";
        ctx.beginPath();
        ctx.arc(x, y - 9, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
      } else ctx.fillStyle = "#3a3a3a";
      ctx.fillText(String(d), x, y);
    }
  });
  const page = face(b, W - 0.04, H - 0.12, tex);
  page.position.set(0, (H - 0.08) / 2, 0.0125);
  b.named.display = page;
}

export function photo_frame(b) {
  const W = 0.4, H = 0.32;
  const outer = b.rrect(W, H, 0.015);
  outer.holes.push(new THREE.Path(b.rrect(W - 0.05, H - 0.05, 0.006).getPoints(16).reverse()));
  b.part("c1", at(b.extrude(outer, 0.03, 0.01), 0, H / 2, 0), SATIN);
  b.part("c2", at(b.box(W - 0.05, H - 0.05, 0.006, 0.002), 0, H / 2, 0.01), PAPER);
  // Until your photos are switched on: a quiet landscape
  const tex = drawn(`photo-${b.seed % 5}`, 256, 192, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#f6c98a");
    sky.addColorStop(0.6, "#f2e2c4");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff4d6";
    ctx.beginPath();
    ctx.arc(w * 0.68, h * 0.42, 20, 0, Math.PI * 2);
    ctx.fill();
    for (const [c, y0, amp] of [["#8fa98a", 0.62, 16], ["#5f8468", 0.74, 12], ["#3f6450", 0.88, 8]]) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * y0 - Math.sin(x / 38 + y0 * 9) * amp);
      ctx.lineTo(w, h);
      ctx.fill();
    }
  });
  const pic = face(b, W - 0.11, H - 0.11, tex);
  pic.position.set(0, H / 2, 0.0135);
  b.named.display = pic;
}

export function panels_acoustic(b) {
  // A grid of soft fabric tiles, some pushed forward
  b.part("c2", at(b.box(1.2, 1.0, 0.012, 0.005), 0, 0.5, 0.006), SATIN);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const d = 0.03 + ((r + c) % 2) * 0.02;
      b.part("c1", at(b.box(0.27, 0.3, d, 0.014), -0.45 + c * 0.3, 0.17 + r * 0.33, 0.012 + d / 2), { family: "fabric", finish: "wool", scale: 3 }, { tint: (r * 3 + c) % 3 ? "#ffffff" : "#dcd4ee" });
    }
  }
}

export function scroll_hanging(b) {
  const W = 0.45, H = 1.2;
  for (const y of [H - 0.02, 0.02]) b.part("c2", at(turn(b.capsule(0.016, W + 0.04), 0, 0, Math.PI / 2), 0, y, 0.02), WOOD_LAQ);
  b.part("c1", at(b.box(W, H - 0.06, 0.006, 0.002), 0, H / 2, 0.012), PAPER);
  // A few bold brush strokes
  const tex = drawn(`scroll-${b.seed % 4}`, 192, 512, (ctx, w, h) => {
    ctx.fillStyle = "#f4ead2";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#221c18";
    ctx.lineCap = "round";
    const strokes = [[60, 90, 130, 80, 16], [96, 70, 96, 190, 18], [56, 150, 140, 160, 12], [70, 250, 120, 330, 20], [130, 250, 70, 340, 14], [96, 380, 96, 450, 16]];
    for (const [x0, y0, x1, y1, lw] of strokes) {
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2 + 12, (y0 + y1) / 2 - 10, x1, y1);
      ctx.stroke();
    }
    ctx.fillStyle = "#c0392b";
    ctx.fillRect(132, 440, 28, 28);
  });
  face(b, W - 0.08, H - 0.2, tex).position.set(0, H / 2, 0.0155);
}

export function posters(b) {
  const list = [[-0.32, 0.4, 0.5, 0.74, "c1", -0.03], [0.3, 0.42, 0.5, 0.68, "c2", 0.04]];
  list.forEach(([x, y, w, h, slot, tilt], i) => {
    b.part("#f6f2ea", at(turn(b.box(w, h, 0.006, 0.002), 0, 0, tilt), x, y, 0.004), PAPER);
    const col = b.colorOf(slot);
    const tex = drawn(`poster-${i}-${col}`, 200, 280, (ctx, cw, ch) => {
      ctx.fillStyle = col;
      ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      if (i === 0) {
        ctx.beginPath();
        ctx.arc(100, 110, 56, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(20,16,36,0.85)";
        for (let k = 0; k < 6; k++) ctx.fillRect(20, 180 + k * 14, 160, 6);
      } else {
        for (let k = 0; k < 5; k++) {
          ctx.beginPath();
          ctx.moveTo(100, 30 + k * 30);
          ctx.lineTo(180 - k * 12, 250);
          ctx.lineTo(20 + k * 12, 250);
          ctx.globalAlpha = 0.25 + k * 0.15;
          ctx.fill();
        }
      }
    });
    const f = face(b, w - 0.03, h - 0.03, tex);
    f.position.set(x, y, 0.0075);
    f.rotation.z = tilt;
  });
}

export function star_chart(b) {
  const W = 1.0, H = 0.7;
  const outer = b.rrect(W, H, 0.02);
  outer.holes.push(new THREE.Path(b.rrect(W - 0.05, H - 0.05, 0.01).getPoints(16).reverse()));
  b.part("#d9b25a", at(b.extrude(outer, 0.03, 0.01), 0, H / 2, 0), BRASS);
  b.part("c1", at(b.box(W - 0.05, H - 0.05, 0.008, 0.003), 0, H / 2, 0.006), { family: "paper", map: false });
  const stars = b.colorOf("c2");
  const tex = drawn(`stars-${stars}-${b.colorOf("c1")}`, 400, 280, (ctx, w, h) => {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = stars;
    ctx.fillStyle = stars;
    ctx.lineWidth = 1.5;
    for (const r of [60, 100, 130]) {
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const pts = [];
    for (let i = 0; i < 46; i++) {
      const p = [rnd() * w, rnd() * h, 1 + rnd() * 2.6];
      pts.push(p);
      ctx.beginPath();
      ctx.arc(p[0], p[1], p[2], 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 18; i += 3) {
      ctx.beginPath();
      ctx.moveTo(pts[i][0], pts[i][1]);
      ctx.lineTo(pts[i + 1][0], pts[i + 1][1]);
      ctx.lineTo(pts[i + 2][0], pts[i + 2][1]);
      ctx.stroke();
    }
  });
  const f = face(b, W - 0.07, H - 0.07, tex, { glow: on(b) ? 1.4 : 0.2 });
  f.material.color.set("#000000");
  f.position.set(0, H / 2, 0.0105);
}

export function chalkboard(b) {
  const W = 0.8, H = 1.0;
  const outer = b.rrect(W, H, 0.025);
  outer.holes.push(new THREE.Path(b.rrect(W - 0.07, H - 0.07, 0.012).getPoints(16).reverse()));
  b.part("c2", at(b.extrude(outer, 0.04, 0.012), 0, H / 2, 0), WOOD);
  b.part("c1", at(b.box(W - 0.07, H - 0.07, 0.01, 0.004), 0, H / 2, 0.008), { family: "clay", rough: 0.95, map: "plaster", scale: 1.5 });
  // Chalk marks: a heading and a few lines, like a menu
  const tex = drawn("chalk-menu", 256, 320, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineCap = "round";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(60, 50);
    ctx.bezierCurveTo(90, 20, 150, 80, 196, 44);
    ctx.stroke();
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(40, 110 + i * 32);
      ctx.lineTo(150 + ((i * 37) % 50), 110 + i * 32);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(214, 110 + i * 32, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  const f = face(b, W - 0.12, H - 0.14, tex);
  f.material.transparent = true;
  f.material.depthWrite = false;
  f.position.set(0, H / 2, 0.0135);
  b.part("#f4f4f4", at(turn(b.capsule(0.007, 0.05), 0, 0, Math.PI / 2), 0.2, 0.05, 0.035), { family: "clay", map: false });
}

export function pegboard(b) {
  const W = 1.4, H = 0.9;
  b.part("c1", at(b.box(W, H, 0.02, 0.01), 0, H / 2, 0.01), { family: "wood", rough: 0.75 });
  // Rows of pegs, and tools hung on some of them
  const pegs = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 9; c++) pegs.push(at(turn(b.cyl(0.006, 0.006, 0.03, 0.002), Math.PI / 2, 0, 0), -0.6 + c * 0.15, 0.12 + r * 0.165, 0.02));
  b.part("#8a8f98", mergeAll(pegs), { family: "metal", finish: "brushed" });
  // A hammer, a wrench, a saw, two screwdrivers, a tape
  b.part("c2", at(b.capsule(0.014, 0.2), -0.45, 0.5, 0.045), GLOSS);
  b.part("#8a8f98", at(b.box(0.1, 0.04, 0.035, 0.01), -0.45, 0.63, 0.045), { family: "metal", finish: "brushed" });
  b.part("#8a8f98", at(turn(b.box(0.03, 0.26, 0.012, 0.005), 0, 0, 0.3), -0.15, 0.5, 0.04), { family: "metal", finish: "brushed" });
  b.part("#8a8f98", at(b.box(0.36, 0.1, 0.006, 0.003), 0.3, 0.32, 0.04), { family: "metal", finish: "brushed" });
  b.part("c2", at(b.box(0.1, 0.12, 0.026, 0.012), 0.08, 0.33, 0.045), GLOSS);
  for (const [x, c] of [[0.15, "#ffffff"], [0.27, "#ffd9a0"]]) {
    b.part("c2", at(b.capsule(0.014, 0.07), x, 0.7, 0.045), GLOSS, { tint: c });
    b.part("#8a8f98", at(b.capsule(0.004, 0.1), x, 0.59, 0.045), { family: "metal", finish: "polished" });
  }
  b.part("c2", at(turn(b.cyl(0.045, 0.045, 0.03, 0.01), Math.PI / 2, 0, 0), 0.5, 0.62, 0.03), GLOSS);
}
