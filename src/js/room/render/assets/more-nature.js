// Outdoor things, the remaining plants, and the companions (small animated friends with rules of their own).
import * as THREE from "three";
import { at, turn } from "../kit/build.js";
import { merge as mergeAll } from "../kit/geometry.js";
import { _pot, _foliage, _sway } from "./soft.js";

const WOOD = { family: "wood" };
const WOOD_ROUGH = { family: "wood", rough: 0.8 };
const METAL_BLACK = { family: "metal", finish: "black", rough: 0.38 };
const SATIN = { family: "plastic" };
const GLOSS = { family: "plastic", finish: "gloss" };
const LEAF = { family: "leaf" };
const STONE = { family: "clay", map: "stone", scale: 2.5, relief: 0.7 };
const CERAMIC = { family: "ceramic", rough: 0.5 };
const on = (b) => b.state.on !== false;
const still = (fx) => Boolean(fx?.reduced);

// Flickering tongues of flame at a point (they glow; the light itself is the asset's practical light)
function flames(b, x, y, z, scale = 1, slot = "c2") {
  const mk = (h, dx, dz, color) => {
    const m = b.moving(color, b.lathe([[0, 0], [0.06 * scale, 0.03 * scale], [0.05 * scale, h * 0.5], [0, h]], [0, 0.02 * scale, 0.03 * scale, 0]), { family: "emissive", intensity: 2.6 }, "");
    m.position.set(x + dx, y, z + dz);
    return m;
  };
  const list = [mk(0.3 * scale, 0, 0, slot), mk(0.22 * scale, -0.08 * scale, 0.03 * scale, "#ff8542"), mk(0.2 * scale, 0.08 * scale, -0.03 * scale, "#fff0b0")];
  b.onUpdate((dt, t, fx) => {
    const k = still(fx) ? 0 : 1;
    list.forEach((f, i) => {
      f.scale.set(1 + 0.08 * Math.sin(t * 9 + i) * k, 1 + 0.18 * Math.sin(t * 7.3 + i * 2) * k, 1);
      f.rotation.z = 0.06 * Math.sin(t * 5 + i * 3) * k;
    });
  });
}

// ---------- Outdoor ----------
export function tent(b) {
  // An A-frame tent: two sloping canvas sides, an open front with flaps, poles and pegs
  const L = 1.9, W = 1.7, H = 1.45;
  const CANVAS = { family: "fabric", scale: 2, side: "double" };
  for (const sx of [-1, 1]) {
    // Each side runs from the ridge down to the ground
    const side = b.box(Math.hypot(W / 2, H), 0.02, L, 0.008);
    side.rotateZ(-sx * Math.atan2(H, W / 2));
    b.part("c1", at(side, (sx * W) / 4, H / 2, 0), CANVAS);
  }
  // A closed back, and the front open with its two flaps tied back
  const back = new THREE.Shape();
  back.moveTo(-W / 2 + 0.03, 0);
  back.lineTo(W / 2 - 0.03, 0);
  back.lineTo(0, H - 0.04);
  b.part("c1", at(b.extrude(back, 0.015, 0.005), 0, 0, -L / 2 + 0.02), CANVAS, { tint: "#efe4d0" });
  for (const sx of [-1, 1]) {
    const flap = new THREE.Shape();
    flap.moveTo(sx * (W / 2 - 0.03), 0);
    flap.lineTo(sx * W * 0.2, 0);
    flap.lineTo(sx * 0.02, H - 0.06);
    b.part("c1", at(b.extrude(flap, 0.015, 0.005), 0, 0, L / 2 - 0.03), CANVAS, { tint: "#efe4d0" });
  }
  for (const z of [-L / 2, L / 2]) b.part("c2", b.tube([[0, 0, z], [0, H + 0.05, z]], 0.014), WOOD);
  b.part("c2", at(turn(b.capsule(0.012, L), Math.PI / 2, 0, 0), 0, H + 0.03, 0), WOOD);
  b.part("#8a6a4a", at(b.box(W * 0.8, 0.02, L * 0.9, 0.008), 0, 0.01, 0), { family: "fabric", finish: "wool" });
}

export function pine_tree(b) {
  b.part("c2", b.lathe([[0, 0], [0.1, 0], [0.08, 0.3], [0.04, 2.2], [0, 2.2]], [0, 0.03, 0.02, 0.01, 0]), WOOD_ROUGH);
  // Five tiers of soft, drooping boughs
  const tiers = [];
  for (let i = 0; i < 5; i++) {
    const r = 0.68 - i * 0.12;
    const y = 0.55 + i * 0.47;
    tiers.push(at(b.lathe([[0, 0.62], [0.06, 0.6], [r * 0.6, 0.22], [r, 0.02], [r * 0.9, 0], [r * 0.4, 0.1], [0, 0.14]], [0, 0.04, 0.08, 0.04, 0.03, 0.06, 0]), 0, y, 0));
  }
  _sway(b, tiers, "c1", { family: "leaf", rough: 0.75 }, 0.5, 0.012);
}

export function fire_pit(b) {
  // A ring of round stones around logs and a fire
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const s = b.cushion(0.2, 0.16, 0.16, { puff: 0.3, round: 1, seed: i + 2 });
    s.rotateY(-a);
    b.part("c1", at(s, Math.cos(a) * 0.36, 0.105, Math.sin(a) * 0.36), STONE, { tint: i % 2 ? "#ffffff" : "#d9d2c8" });
  }
  b.part("#2a211c", at(b.cyl(0.3, 0.3, 0.03, 0.01), 0, 0, 0), { family: "clay", rough: 0.95, map: false });
  for (const [r, y] of [[0.4, 0.07], [-0.5, 0.07], [1.6, 0.12]]) b.part("#6b4a34", at(turn(b.capsule(0.04, 0.36), Math.PI / 2, r, 0), 0, y, 0), WOOD_ROUGH);
  if (on(b)) flames(b, 0, 0.14, 0, 1.0);
}

export function street_lamp(b) {
  b.part("c1", b.lathe([[0, 0], [0.14, 0], [0.15, 0.04], [0.06, 0.16], [0.04, 0.5], [0.035, 2.6], [0, 2.6]], [0, 0.01, 0.03, 0.04, 0.02, 0.01, 0]), METAL_BLACK);
  b.part("c1", b.tube([[0, 2.55, 0], [0, 2.8, 0], [0.12, 2.92, 0], [0.26, 2.86, 0]], 0.022), METAL_BLACK);
  b.part("c1", b.lathe([[0.02, 0.2], [0.16, 0.06], [0.17, 0.03], [0.15, 0.03], [0.03, 0.14]], [0, 0.03, 0.006, 0.006, 0]).translate(0.26, 2.62, 0), { family: "metal", finish: "black", rough: 0.38, side: "double" });
  b.glow(on(b) ? "c2" : "#4a4638", at(b.ball(0.085, { squash: 0.8 }), 0.26, 2.68, 0), { intensity: on(b) ? 2.6 : 0.05 });
}

export function pergola(b) {
  const W = 3.0, D = 2.4, H = 2.4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.part("c1", at(b.box(0.12, H, 0.12, 0.025, { along: "y" }), sx * (W / 2 - 0.1), H / 2, sz * (D / 2 - 0.1)), WOOD_ROUGH);
  for (const sz of [-1, 1]) b.part("c1", at(b.box(W + 0.3, 0.14, 0.08, 0.02), 0, H + 0.02, sz * (D / 2 - 0.1)), WOOD_ROUGH);
  const slats = [];
  for (let i = 0; i < 9; i++) slats.push(at(b.box(0.06, 0.1, D + 0.3, 0.015, { along: "z" }), -W / 2 + 0.15 + i * ((W - 0.3) / 8), H + 0.13, 0));
  b.part("c1", mergeAll(slats), WOOD_ROUGH);
}

export function umbrella_beach(b) {
  b.part("c2", b.tube([[0, 0, 0], [0.08, 2.0, 0]], 0.022), SATIN);
  // A wide canopy of eight panels, alternating the color and white, tipped towards the sun
  const R = 0.9;
  const panels = [[], []];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.SphereGeometry(R, 8, 8, (i / 8) * Math.PI * 2, Math.PI / 4, 0, Math.PI * 0.36);
    g.scale(1, 0.5, 1);
    panels[i % 2].push(g);
  }
  panels.forEach((list, k) => {
    const g = mergeAll(list);
    g.rotateZ(-0.08);
    b.part(k ? "#fbf6ea" : "c1", at(g, 0.08, 2.18 - R * 0.5, 0), { family: "fabric", scale: 2, side: "double" });
  });
  b.part("c2", at(b.ball(0.035), 0.085, 2.19, 0), SATIN);
}

export function fountain(b) {
  b.part("c1", b.lathe([[0, 0], [0.48, 0], [0.5, 0.06], [0.46, 0.26], [0.5, 0.3], [0.42, 0.3], [0.38, 0.12], [0, 0.12]], [0, 0.02, 0.04, 0.03, 0.02, 0.02, 0.04, 0]), STONE);
  b.part("c1", b.lathe([[0, 0.12], [0.07, 0.12], [0.05, 0.56], [0.2, 0.66], [0.22, 0.72], [0.17, 0.72], [0.03, 0.64], [0, 0.64]], [0, 0.02, 0.03, 0.03, 0.015, 0.015, 0.02, 0]), STONE);
  b.part("c2", at(b.cyl(0.4, 0.4, 0.012, 0.004), 0, 0.24, 0), { family: "glass", opacity: 0.55 });
  b.part("c2", at(b.cyl(0.16, 0.16, 0.008, 0.003), 0, 0.705, 0), { family: "glass", opacity: 0.55 });
  if (on(b)) {
    // A soft jet that rises and falls, and drops that fall into the basin
    const jet = b.moving("c2", b.lathe([[0, 0], [0.016, 0.02], [0.01, 0.16], [0, 0.2]], [0, 0.008, 0.008, 0]), { family: "glass", opacity: 0.6 }, "");
    jet.position.y = 0.7;
    const drops = [0, 1, 2, 3, 4, 5].map((i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: "#dff4ff", transparent: true, opacity: 0.8 }));
      b.extra.add(m);
      return [m, (i / 6) * Math.PI * 2];
    });
    b.onUpdate((dt, t, fx) => {
      jet.scale.y = still(fx) ? 1 : 1 + 0.15 * Math.sin(t * 3);
      for (const [m, a] of drops) {
        const k = still(fx) ? 0.4 : (t * 0.9 + a) % 1;
        m.position.set(Math.cos(a) * (0.06 + k * 0.14), 0.88 - k * k * 0.6, Math.sin(a) * (0.06 + k * 0.14));
      }
    });
  }
}

export function fence(b) {
  const pickets = [];
  for (let i = 0; i < 11; i++) {
    const s = new THREE.Shape();
    s.moveTo(-0.055, 0);
    s.lineTo(0.055, 0);
    s.lineTo(0.055, 0.78);
    s.quadraticCurveTo(0, 0.92, -0.055, 0.78);
    pickets.push(at(b.extrude(s, 0.022, 0.008), -0.9 + i * 0.18, 0, 0.012));
  }
  b.part("c1", mergeAll(pickets), { family: "wood", finish: "painted" });
  b.part("c1", mergeAll([at(b.box(2.0, 0.07, 0.03, 0.01), 0, 0.24, -0.008), at(b.box(2.0, 0.07, 0.03, 0.01), 0, 0.62, -0.008)]), { family: "wood", finish: "painted" });
}

export function pond(b) {
  // A kidney-shaped pool with a stone rim and lily pads with flowers
  const s = new THREE.Shape();
  const pts = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const r = 1 + 0.16 * Math.cos(a * 2 + 0.6) + 0.07 * Math.sin(a * 3);
    pts.push(new THREE.Vector2(Math.cos(a) * 0.72 * r, Math.sin(a) * 0.48 * r));
  }
  s.setFromPoints(pts);
  const rim = turn(b.extrude(s, 0.09, 0.03), -Math.PI / 2, 0, 0);
  b.part("#b8b0a4", rim, STONE);
  const inner = s.clone();
  const water = turn(b.extrude(new THREE.Shape(inner.getPoints(64).map((p) => p.clone().multiplyScalar(0.86))), 0.02, 0.006), -Math.PI / 2, 0, 0);
  b.part("c1", at(water, 0, 0.08, 0), { family: "glass", opacity: 0.75 });
  for (const [x, z, r, flower] of [[-0.3, 0.1, 0.1, true], [0.15, -0.12, 0.08, false], [0.32, 0.14, 0.09, true], [-0.05, 0.22, 0.07, false]]) {
    b.part("#4f8a4a", at(b.cyl(r, r, 0.006, 0.002), x, 0.1, z), LEAF);
    if (flower) for (let p = 0; p < 7; p++) {
      const g = b.petal(0.045, 0.03, { cup: 0.8 });
      g.rotateX(-0.6);
      g.rotateY((p / 7) * Math.PI * 2);
      b.part("c2", at(g, x, 0.107, z), { family: "leaf", rough: 0.5 });
    }
  }
}

export function shells(b) {
  // A handful of shells and a starfish on a little drift of sand
  b.part("#e6d3ad", b.lathe([[0, 0], [0.28, 0], [0.24, 0.012], [0, 0.02]], [0, 0.01, 0.01, 0]).scale(1, 1, 0.66), { family: "clay", map: "sand", scale: 5 });
  for (const [x, z, s, r] of [[-0.12, 0.02, 1, 0.4], [0.02, -0.06, 0.8, 2], [0.14, 0.06, 0.7, 4]]) {
    const shell = b.lathe([[0, 0], [0.045 * s, 0.006], [0.03 * s, 0.025 * s], [0, 0.03 * s]], [0, 0.008, 0.01, 0]);
    shell.scale(1, 1, 0.8);
    shell.rotateY(r);
    b.part("c1", at(shell, x, 0.015, z), { family: "ceramic", rough: 0.4 });
  }
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? 0.022 : 0.055;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  b.part("c2", at(turn(b.extrude(star, 0.016, 0.007), -Math.PI / 2, 0, 0.4), -0.02, 0.014, 0.09), { family: "clay", rough: 0.7, map: "sand", scale: 8 });
}

export function backpack(b) {
  b.part("c1", at(b.cushion(0.36, 0.5, 0.24, { puff: 0.2, round: 0.7 }), 0, 0.27, 0), { family: "fabric", scale: 3 });
  b.part("c1", at(b.cushion(0.3, 0.18, 0.1, { puff: 0.3, round: 0.8 }), 0, 0.18, 0.15), { family: "fabric", scale: 3 }, { tint: "#e8d8d8" });
  b.part("c1", at(b.cushion(0.34, 0.1, 0.26, { puff: 0.3, round: 0.9 }), 0, 0.54, 0), { family: "fabric", scale: 3 });
  for (const sx of [-1, 1]) {
    b.part("c2", b.tube([[sx * 0.1, 0.5, -0.12], [sx * 0.13, 0.3, -0.16], [sx * 0.11, 0.08, -0.12]], 0.018), { family: "fabric", finish: "wool" });
    b.part("c2", at(b.box(0.05, 0.012, 0.03, 0.005), sx * 0.08, 0.2, 0.202), SATIN);
  }
  // A rolled mat on top
  b.part("#7a8f6a", at(turn(b.capsule(0.05, 0.3), 0, 0, Math.PI / 2), 0, 0.63, 0), { family: "fabric", finish: "wool" });
  // The soft body bulges below its own origin: lift the whole pack so it rests on the floor
  for (const e of b.pieces.values()) for (const g of e.geos) g.translate(0, 0.035, 0);
}

export function lighthouse_model(b) {
  // Stripes as stacked bands: the color, then white, tapering up to the lamp room
  const bands = 5;
  for (let i = 0; i < bands; i++) {
    const r0 = 0.2 - i * 0.022;
    const r1 = r0 - 0.022;
    b.part(i % 2 ? "c2" : "c1", at(b.lathe([[0, 0], [r0, 0], [r1, 0.2], [0, 0.2]], [0, 0.004, 0.004, 0]), 0, 0.06 + i * 0.2, 0), { family: "clay", rough: 0.6, map: false });
  }
  b.part("#8d877d", b.lathe([[0, 0], [0.24, 0], [0.25, 0.03], [0.21, 0.06], [0, 0.06]], [0, 0.01, 0.015, 0.01, 0]), STONE);
  b.part("#2d3038", at(b.cyl(0.13, 0.13, 0.025, 0.008), 0, 1.06, 0), METAL_BLACK);
  b.glow(on(b) ? "#fff0b0" : "#5a5440", at(b.cyl(0.07, 0.07, 0.14, 0.02), 0, 1.085, 0), { intensity: on(b) ? 2.6 : 0.05 });
  b.part("c1", at(b.lathe([[0, 0], [0.11, 0], [0.02, 0.13], [0, 0.15]], [0, 0.01, 0.01, 0]), 0, 1.225, 0), { family: "clay", rough: 0.6, map: false });
}

// ---------- Plants ----------
export function cactus(b) {
  const top = _pot(b, 0.17, 0.28);
  const SKIN = { family: "leaf", rough: 0.6 };
  // A saguaro: a ribbed trunk and two raised arms
  b.part("c1", at(b.capsule(0.085, 0.72), 0, top + 0.44, 0), SKIN);
  b.part("c1", b.tube([[0.06, top + 0.42, 0], [0.2, top + 0.44, 0], [0.22, top + 0.72, 0]], 0.05), SKIN);
  b.part("c1", b.tube([[-0.06, top + 0.3, 0], [-0.19, top + 0.33, 0], [-0.2, top + 0.52, 0]], 0.045), SKIN);
  b.part("#f2a6c0", at(b.ball(0.03, { squash: 0.7 }), 0, top + 0.895, 0), { family: "leaf", rough: 0.5 });
}

export function bonsai(b) {
  b.part("c2", at(b.box(0.4, 0.07, 0.26, 0.025), 0, 0.045, 0), CERAMIC);
  for (const sx of [-1, 1]) b.part("c2", at(b.box(0.06, 0.02, 0.2, 0.008), sx * 0.13, 0.01, 0), CERAMIC);
  b.part("#5f7a4a", at(b.box(0.36, 0.01, 0.22, 0.004), 0, 0.082, 0), { family: "leaf", map: "grass", scale: 6 });
  // A windswept trunk and flat cloud-like pads of needles
  b.part("#6b4a34", b.tube([[-0.06, 0.08, 0], [-0.02, 0.18, 0.01], [0.06, 0.24, 0], [0.04, 0.32, -0.01]], 0.018), WOOD_ROUGH);
  b.part("#6b4a34", b.tube([[-0.02, 0.18, 0.01], [-0.12, 0.24, 0.02]], 0.01), WOOD_ROUGH);
  const pads = [[0.05, 0.35, 0, 0.1], [-0.13, 0.26, 0.02, 0.07], [0.14, 0.27, 0.01, 0.065]].map(([x, y, z, r]) => at(b.ball(r, { squash: 0.45 }), x, y, z));
  _sway(b, pads, "c1", { family: "leaf", rough: 0.75 }, 0.08, 0.01);
}

export function terrarium(b) {
  b.part("#3a2a20", at(b.cyl(0.07, 0.08, 0.025, 0.008), 0, 0, 0), WOOD);
  b.part("#5a4030", at(b.ball(0.1, { squash: 0.3 }), 0, 0.06, 0), { family: "clay", rough: 0.95, map: false });
  b.part("c2", at(b.ball(0.09, { squash: 0.3 }), 0, 0.075, 0), { family: "leaf", map: "grass", scale: 8 });
  for (let i = 0; i < 5; i++) {
    const lf = b.leaf(0.07, 0.025, { droop: 0.3, fold: 0.5 });
    lf.rotateX(-0.3);
    lf.rotateY((i / 5) * Math.PI * 2);
    b.part("c2", at(lf, 0, 0.09, 0), LEAF);
  }
  b.part("c1", at(b.ball(0.125, { squash: 1 }), 0, 0.15, 0), { family: "glass", opacity: 0.18 });
  b.part("#c9a77a", at(b.cyl(0.03, 0.03, 0.02, 0.006), 0, 0.27, 0), WOOD);
}

// Trailing vines from a point: leaves along drooping stems
function vines(b, x, y, z, n, len, slot = "c1") {
  const geos = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + b.rand();
    const l = len * (0.6 + b.rand() * 0.5);
    const pts = [[x, y, z], [x + Math.cos(a) * 0.12, y - l * 0.3, z + Math.sin(a) * 0.12], [x + Math.cos(a) * 0.16, y - l, z + Math.sin(a) * 0.16]];
    b.part("#3f6b45", b.tube(pts, 0.004, { segments: 8 }), { family: "leaf", rough: 0.6 });
    for (let k = 1; k <= 5; k++) {
      const t = k / 5;
      const lf = b.leaf(0.07, 0.05, { droop: 0.2, fold: 0.3 });
      lf.rotateX(Math.PI / 2 + 0.6);
      lf.rotateY(-a + (k % 2 ? 0.7 : -0.7));
      lf.translate(x + Math.cos(a) * (0.1 + t * 0.06), y - l * t, z + Math.sin(a) * (0.1 + t * 0.06));
      geos.push(lf);
    }
  }
  return geos;
}

export function plant_hanging(b) {
  // Hanging from y = 0: three cords, a woven basket, and ivy spilling over
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.part("#c9b48a", b.tube([[0, 0, 0], [Math.cos(a) * 0.15, -0.38, Math.sin(a) * 0.15]], 0.004, { segments: 2 }), { family: "fabric" });
  }
  b.part("c2", at(b.lathe([[0, 0], [0.11, 0], [0.165, 0.13], [0.16, 0.15], [0.14, 0.14], [0, 0.03]], [0, 0.03, 0.02, 0.006, 0.006, 0]), 0, -0.52, 0), { family: "fabric", finish: "knit", scale: 4 });
  const geos = vines(b, 0, -0.38, 0, 7, 0.4);
  _sway(b, geos, "c1", LEAF, -0.38, 0.04);
}

export function plants_hanging_trio(b) {
  const all = [];
  for (const [x, drop, s] of [[-0.34, 0.5, 1], [0, 0.3, 0.85], [0.34, 0.62, 0.9]]) {
    b.part("#3a3a3a", b.tube([[x, 0, 0], [x, -drop, 0]], 0.003, { segments: 2 }), { family: "rubber" });
    b.part("c2", at(b.lathe([[0, 0], [0.06 * s, 0], [0.085 * s, 0.1 * s], [0.07 * s, 0.11 * s], [0, 0.03]], [0, 0.015, 0.008, 0.006, 0]), x, -drop - 0.11 * s, 0), CERAMIC);
    all.push(...vines(b, x, -drop, 0, 5, 0.26 * s));
  }
  _sway(b, all, "c1", LEAF, -0.3, 0.03);
}

export function palm(b) {
  const top = _pot(b, 0.2, 0.34);
  b.part("#8a6a4a", b.tube([[0, top - 0.02, 0], [0.04, top + 0.5, 0.02], [-0.02, top + 1.0, 0]], 0.035), { family: "wood", map: "logs", scale: 4, rough: 0.9 });
  const geos = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const g = b.leaf(0.55, 0.18, { droop: 0.6, fold: 0.5, split: 2 });
    g.rotateX(-Math.PI / 2 + 0.6 + (i % 2) * 0.3);
    g.rotateY(a);
    g.translate(-0.02, top + 1.0, 0);
    geos.push(g);
  }
  _sway(b, geos, "c1", LEAF, top + 1.0, 0.03);
}

export function fern(b) {
  const top = _pot(b, 0.16, 0.26);
  const geos = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + b.rand() * 0.3;
    const g = b.leaf(0.36 + b.rand() * 0.1, 0.1, { droop: 0.45, fold: 0.3, split: 3 });
    g.rotateX(-Math.PI / 2 + 0.35 + (i % 3) * 0.3);
    g.rotateY(a);
    g.translate(0, top, 0);
    geos.push(g);
  }
  _sway(b, geos, "c1", LEAF, top, 0.035);
}

export function herb_pots(b) {
  const geos = [];
  for (const [x, kind] of [[-0.16, 0], [0, 1], [0.16, 2]]) {
    b.part("c2", at(b.lathe([[0, 0], [0.045, 0], [0.06, 0.1], [0.05, 0.105], [0, 0.085]], [0, 0.008, 0.005, 0.004, 0]), x, 0, 0), CERAMIC);
    const n = kind === 1 ? 10 : 7;
    for (let i = 0; i < n; i++) {
      const g = b.leaf(kind === 2 ? 0.15 : 0.1, kind === 2 ? 0.014 : 0.04, { droop: 0.25, fold: 0.3 });
      g.rotateX(-0.2 - b.rand() * 0.5);
      g.rotateY((i / n) * Math.PI * 2);
      g.translate(x, 0.09, 0);
      geos.push(g);
    }
  }
  _sway(b, geos, "c1", LEAF, 0.09, 0.03);
}

export function flower_bed(b) {
  b.part("c3", at(b.box(1.4, 0.26, 0.56, 0.03), 0, 0.13, 0), WOOD_ROUGH);
  b.part("#4a3628", at(b.box(1.3, 0.03, 0.46, 0.01), 0, 0.255, 0), { family: "clay", rough: 0.95, map: "concrete", scale: 4 });
  const leaves = [];
  const heads = [];
  for (let i = 0; i < 16; i++) {
    const x = -0.58 + (i % 8) * 0.165 + (b.rand() - 0.5) * 0.04;
    const z = (i < 8 ? -0.1 : 0.1) + (b.rand() - 0.5) * 0.05;
    const h = 0.14 + b.rand() * 0.08;
    b.part("#4f8a4a", b.tube([[x, 0.26, z], [x + 0.01, 0.26 + h, z]], 0.004, { segments: 3 }), LEAF);
    for (let p = 0; p < 6; p++) {
      const g = b.petal(0.04, 0.03, { cup: 0.6 });
      g.rotateX(-1.0);
      g.rotateY((p / 6) * Math.PI * 2);
      heads.push([at(g, x + 0.01, 0.26 + h, z), ["#ffffff", "#ffe0f0", "#fff0c0"][i % 3]]);
    }
    const lf = b.leaf(0.11, 0.035, { droop: 0.4, fold: 0.4 });
    lf.rotateX(-0.5);
    lf.rotateY(b.rand() * 6);
    leaves.push(at(lf, x, 0.265, z));
  }
  for (const [g, tint] of heads) b.part("c1", g, { family: "leaf", rough: 0.5 }, { tint });
  b.part("c2", mergeAll(leaves), LEAF);
}

export function bamboo(b) {
  const stems = [];
  const geos = [];
  for (let i = 0; i < 9; i++) {
    const x = -0.4 + i * 0.1 + (b.rand() - 0.5) * 0.04;
    const z = (b.rand() - 0.5) * 0.3;
    const h = 1.7 + b.rand() * 0.65;
    const lean = (b.rand() - 0.5) * 0.12;
    stems.push(b.tube([[x, 0, z], [x + lean * 0.4, h * 0.5, z], [x + lean, h, z]], 0.018, { segments: 10 }));
    for (let k = 1; k < 6; k++) stems.push(at(b.cyl(0.021, 0.021, 0.012, 0.004), x + lean * (k / 6), (h * k) / 6, z));
    for (let k = 0; k < 7; k++) {
      const g = b.leaf(0.2, 0.035, { droop: 0.4, fold: 0.3 });
      g.rotateX(-Math.PI / 2 + 0.5 + b.rand() * 0.5);
      g.rotateY(b.rand() * Math.PI * 2);
      g.translate(x + lean * 0.8, h * (0.55 + b.rand() * 0.45), z);
      geos.push(g);
    }
  }
  b.part("c1", mergeAll(stems), { family: "leaf", rough: 0.5 });
  _sway(b, geos, "c2", LEAF, 1.0, 0.025);
}

export function ikebana(b) {
  b.part("c2", b.lathe([[0, 0], [0.1, 0], [0.14, 0.03], [0.135, 0.045], [0.12, 0.04], [0, 0.02]], [0, 0.012, 0.01, 0.005, 0.005, 0]).scale(1, 1, 0.66), { family: "ceramic", rough: 0.4 });
  // Three lines: a tall branch, a middle one, a low flower
  b.part("#5a4030", b.tube([[0, 0.03, 0], [0.03, 0.25, 0], [-0.04, 0.46, 0.01]], 0.006), WOOD_ROUGH);
  b.part("#5a4030", b.tube([[0, 0.03, 0], [-0.07, 0.18, 0.02], [-0.11, 0.28, 0.02]], 0.005), WOOD_ROUGH);
  for (const [x, y, z, s] of [[-0.04, 0.46, 0.01, 1], [-0.11, 0.28, 0.02, 0.8], [0.06, 0.1, 0.03, 1.2]]) {
    for (let p = 0; p < 6; p++) {
      const g = b.petal(0.04 * s, 0.03 * s, { cup: 0.6 });
      g.rotateX(-0.9);
      g.rotateY((p / 6) * Math.PI * 2);
      b.part("c1", at(g, x, y, z), { family: "leaf", rough: 0.5 });
    }
    b.part("#f2d34a", at(b.ball(0.008 * s), x, y + 0.004, z), GLOSS);
  }
  for (const a of [0.4, 2.6]) {
    const lf = b.leaf(0.2, 0.03, { droop: 0.3, fold: 0.4 });
    lf.rotateX(-0.5);
    lf.rotateY(a);
    b.part("#4f8a4a", at(lf, 0, 0.03, 0), LEAF);
  }
}

export function watering_can(b) {
  b.part("c1", b.lathe([[0, 0], [0.08, 0], [0.09, 0.02], [0.085, 0.2], [0.075, 0.21], [0.07, 0.2], [0.075, 0.03], [0, 0.03]], [0, 0.008, 0.01, 0.008, 0.004, 0.004, 0.01, 0]), { family: "plastic", rough: 0.4 });
  b.part("c1", b.tube([[0.07, 0.06, 0], [0.16, 0.14, 0], [0.24, 0.24, 0]], 0.012), { family: "plastic", rough: 0.4 });
  b.part("c1", at(turn(b.lathe([[0, 0], [0.012, 0], [0.03, 0.03], [0, 0.034]], [0, 0.003, 0.004, 0]), 0, 0, -0.7), 0.235, 0.235, 0), { family: "plastic", rough: 0.4 });
  b.part("c1", b.tube([[-0.07, 0.19, 0], [-0.13, 0.22, 0], [-0.14, 0.1, 0], [-0.085, 0.05, 0]], 0.009), { family: "plastic", rough: 0.4 });
  b.part("c1", b.tube([[-0.05, 0.2, 0], [0, 0.275, 0], [0.05, 0.2, 0]], 0.008), { family: "plastic", rough: 0.4 });
}

// ---------- Companions ----------
export function drone_mini(b) {
  // It hovers at about chest height and bobs; its origin stays on the floor so it can be placed like anything else
  const body = new THREE.Group();
  b.extra.add(body);
  const shell = b.cushion(0.16, 0.06, 0.16, { puff: 0.5, round: 1 });
  body.add(b.moving("c1", shell, SATIN, ""));
  const ring = turn(b.ring(0.12, 0.012), Math.PI / 2, 0, 0);
  body.add(b.moving("c1", ring, SATIN, ""));
  const eye = b.moving(on(b) ? "c2" : "#2a3238", at(b.ball(0.022), 0, 0, 0.075), { family: "emissive", intensity: on(b) ? 2.2 : 0.05 }, "");
  body.add(eye);
  const rotor = b.moving("#3a3d46", mergeAll([b.box(0.2, 0.003, 0.016, 0.0012), turn(b.box(0.2, 0.003, 0.016, 0.0012), 0, Math.PI / 2, 0)]), { family: "plastic", rough: 0.4 }, "");
  rotor.position.y = 0.045;
  body.add(rotor);
  body.position.y = 0.06;
  const floatAt = b.def?.floats ?? 1.2;
  b.onUpdate((dt, t, fx) => {
    const k = still(fx) ? 0 : 1;
    body.position.y = (on(b) ? floatAt * 0.08 : 0) + 0.06 + Math.sin(t * 1.6) * 0.004 * k;
    rotor.rotation.y = on(b) ? t * 30 * k : 0;
    body.rotation.y = Math.sin(t * 0.4) * 0.5 * k;
  });
}

export function goldfish(b) {
  b.part("#e6d3ad", at(b.ball(0.085, { squash: 0.25 }), 0, 0.03, 0), { family: "clay", map: "sand", scale: 8 });
  for (let i = 0; i < 3; i++) {
    const lf = b.leaf(0.09, 0.02, { droop: 0.2, fold: 0.5 });
    lf.rotateY(i * 2.1);
    b.part("#3f8a5a", at(lf, 0.03, 0.04, -0.02), LEAF);
  }
  // The fish circles its bowl
  const body = b.ball(0.026, { squash: 0.75 });
  body.scale(1.5, 1, 0.6);
  const tail = b.lathe([[0, 0], [0.02, 0.022], [0, 0.034]], 0);
  tail.rotateZ(Math.PI / 2);
  tail.scale(1, 1.5, 0.3);
  tail.translate(-0.034, 0, 0);
  const fish = b.moving("c2", mergeAll([body, tail]), GLOSS, "fish");
  b.onUpdate((dt, t, fx) => {
    const a = still(fx) ? 1 : t * 0.7;
    fish.position.set(Math.cos(a) * 0.05, 0.125 + Math.sin(a * 2) * 0.012, Math.sin(a) * 0.05);
    fish.rotation.y = -a - Math.PI / 2;
  });
  b.part("c1", b.lathe([[0, 0], [0.07, 0], [0.125, 0.09], [0.12, 0.2], [0.085, 0.245], [0.09, 0.26]], [0, 0.03, 0.06, 0.05, 0.01, 0]), { family: "glass", opacity: 0.2 });
  b.part("#bfe3f2", at(b.cyl(0.108, 0.108, 0.004, 0.0015), 0, 0.2, 0), { family: "glass", opacity: 0.35 });
}

export function plant_sprite(b) {
  // A little sprout creature: a round glowing body, two leaves for ears, tiny feet; it bobs and its leaves wiggle
  const body = new THREE.Group();
  b.extra.add(body);
  body.add(b.moving("c2", at(b.ball(0.085, { squash: 0.95 }), 0, 0.1, 0), { family: "emissive", intensity: 0.7, rough: 0.6 }, ""));
  body.add(b.moving("#2d2420", mergeAll([at(b.ball(0.011), -0.03, 0.115, 0.076), at(b.ball(0.011), 0.03, 0.115, 0.076)]), GLOSS, ""));
  const ears = [-1, 1].map((sx) => {
    const g = b.leaf(0.16, 0.07, { droop: 0.25, fold: 0.3 });
    const m = b.moving("c1", g, LEAF, "");
    m.position.set(sx * 0.02, 0.17, 0);
    m.rotation.z = -sx * 0.5;
    body.add(m);
    return [m, sx];
  });
  b.part("c1", mergeAll([at(b.ball(0.026, { squash: 0.6 }), -0.035, 0.015, 0.02), at(b.ball(0.026, { squash: 0.6 }), 0.035, 0.015, 0.02)]), LEAF);
  b.onUpdate((dt, t, fx) => {
    const k = still(fx) ? 0 : 1;
    body.position.y = Math.abs(Math.sin(t * 2.2)) * 0.02 * k;
    for (const [m, sx] of ears) m.rotation.z = -sx * (0.5 + 0.18 * Math.sin(t * 3 + sx) * k);
  });
}

export function vacuum(b) {
  // A round robot vacuum that trundles in a small circle around where you put it
  const g = new THREE.Group();
  b.extra.add(g);
  g.add(b.moving("c1", b.lathe([[0, 0.012], [0.16, 0.012], [0.17, 0.03], [0.165, 0.075], [0.14, 0.088], [0, 0.088]], [0, 0.008, 0.012, 0.012, 0.01, 0]), GLOSS, ""));
  g.add(b.moving("#2d3038", mergeAll([at(b.cyl(0.05, 0.05, 0.012, 0.005), 0, 0.085, 0), at(b.box(0.2, 0.02, 0.012, 0.006), 0, 0.045, 0.165)]), SATIN, ""));
  g.add(b.moving(on(b) ? "c2" : "#2a3038", at(b.ball(0.012), 0, 0.094, 0.1), { family: "emissive", intensity: on(b) ? 2.2 : 0.05 }, ""));
  const roams = Boolean(b.def?.roams) && on(b);
  b.onUpdate((dt, t, fx) => {
    if (!roams || still(fx) || fx?.friendly) return;
    const a = t * 0.25;
    g.position.set(Math.cos(a) * 0.22 - 0.22, 0, Math.sin(a) * 0.22);
    g.rotation.y = -a;
  });
}
