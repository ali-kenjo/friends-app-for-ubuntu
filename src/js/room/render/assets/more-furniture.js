// The rest of the furniture: more seats, tables, storage, and the bigger pieces (divider, platform, pad…).
import * as THREE from "three";
import { at, turn } from "../kit/build.js";
import { _leg, _books } from "./furniture.js";
import { merge as mergeAll } from "../kit/geometry.js";

const WOOD = { family: "wood" };
const WOOD_LAQ = { family: "wood", finish: "lacquered" };
const METAL_BLACK = { family: "metal", finish: "black", rough: 0.38 };
const SATIN = { family: "plastic" };
const FABRIC = { family: "fabric" };

// ---------- Seating ----------
export function bean_bag(b) {
  // A slumped teardrop with a dent where you sit
  const g = b.lathe([[0, 0], [0.38, 0], [0.425, 0.14], [0.36, 0.42], [0.2, 0.62], [0.06, 0.7], [0, 0.7]], [0, 0.1, 0.12, 0.12, 0.08, 0.04, 0]);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y > 0.3 && z > -0.1) pos.setY(i, y - Math.max(0, 1 - Math.hypot(x, z - 0.12) / 0.34) * 0.2);
  }
  g.computeVertexNormals();
  b.part("c1", g, { family: "fabric", finish: "velvet", scale: 1.5 });
}

export function chair_gaming(b) {
  const seatY = 0.5;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    b.part("c1", at(turn(turn(b.capsule(0.024, 0.27), 0, 0, Math.PI / 2), 0, -a, 0), Math.cos(a) * 0.16, 0.075, Math.sin(a) * 0.16), SATIN);
    b.part("#1c1d22", at(b.ball(0.03), Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.3), { family: "rubber" });
  }
  b.part("#9aa0aa", at(b.cyl(0.024, 0.024, seatY - 0.14, 0.006), 0, 0.09, 0), { family: "metal", finish: "polished" });
  b.part("c1", at(b.cushion(0.54, 0.12, 0.52, { puff: 0.25, round: 0.7 }), 0, seatY - 0.01, 0.02), { family: "leather" });
  // A tall winged back with a headrest, racing stripes in the accent color
  b.part("c1", at(turn(b.cushion(0.52, 0.78, 0.1, { puff: 0.25, round: 0.8 }), -0.12, 0, 0), 0, seatY + 0.46, -0.24), { family: "leather" });
  for (const sx of [-1, 1]) {
    b.part("c2", at(turn(b.cushion(0.07, 0.66, 0.112, { puff: 0.2, round: 0.9 }), -0.12, 0, 0), sx * 0.18, seatY + 0.44, -0.235), { family: "leather" });
    b.part("c1", b.tube([[sx * 0.22, seatY - 0.04, -0.04], [sx * 0.3, seatY + 0.1, 0], [sx * 0.3, seatY + 0.2, 0.02]], 0.016), SATIN);
    b.part("c1", at(b.box(0.08, 0.035, 0.26, 0.015), sx * 0.3, seatY + 0.22, 0.03), { family: "plastic", rough: 0.6 });
  }
  b.part("c2", at(turn(b.cushion(0.26, 0.12, 0.06, { puff: 0.5, round: 1 }), -0.12, 0, 0), 0, seatY + 0.74, -0.2), { family: "leather" });
}

export function bench_wood(b) {
  b.part("c1", at(b.box(1.4, 0.055, 0.42, 0.02), 0, 0.43, 0), WOOD_LAQ);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) _leg(b, sx * 0.58, sz * 0.14, 0, 0.405, 0.028, 0.02, { splay: 0.06, spec: WOOD, slot: "c2" });
    b.part("c2", at(turn(b.capsule(0.012, 0.26), Math.PI / 2, 0, 0), sx * 0.58, 0.16, 0), WOOD);
  }
  b.part("c2", at(turn(b.capsule(0.014, 1.1), 0, 0, Math.PI / 2), 0, 0.16, 0), WOOD);
}

export function lounge_chair(b) {
  // A low wooden frame with a long cushion that rises into a back
  for (const sx of [-1, 1]) {
    b.part("c1", b.tube([[sx * 0.36, 0.06, 0.74], [sx * 0.36, 0.22, 0.2], [sx * 0.36, 0.3, -0.35], [sx * 0.36, 0.72, -0.72]], 0.024), WOOD);
    for (const z of [0.6, -0.4]) _leg(b, sx * 0.36, z, 0, 0.2, 0.026, 0.02, { spec: WOOD, slot: "c1" });
  }
  for (const z of [0.5, 0.1, -0.3]) b.part("c1", at(turn(b.capsule(0.014, 0.7), 0, 0, Math.PI / 2), 0, 0.2 + (z < 0 ? 0.06 : 0), z), WOOD);
  b.part("c2", at(turn(b.cushion(0.68, 0.11, 1.0, { puff: 0.3, round: 0.8 }), 0.1, 0, 0), 0, 0.32, 0.22), FABRIC);
  b.part("c2", at(turn(b.cushion(0.68, 0.11, 0.6, { puff: 0.3, round: 0.8, seed: 3 }), -0.82, 0, 0), 0, 0.56, -0.5), FABRIC);
}

export function deck_chair(b) {
  // A folding frame and a striped sling
  for (const sx of [-1, 1]) {
    b.part("c2", b.tube([[sx * 0.27, 0.02, 0.5], [sx * 0.27, 0.88, -0.42]], 0.018), WOOD);
    b.part("c2", b.tube([[sx * 0.27, 0.02, -0.5], [sx * 0.27, 0.5, 0.25]], 0.018), WOOD);
  }
  for (const [y, z] of [[0.87, -0.41], [0.03, 0.5], [0.03, -0.5], [0.5, 0.25]]) b.part("c2", at(turn(b.capsule(0.016, 0.54), 0, 0, Math.PI / 2), 0, y, z), WOOD);
  // The sling sags between the top bar and the front bar; stripes are tinted bands of one mesh
  const n = 7;
  for (let i = 0; i < n; i++) {
    const x = -0.24 + (i + 0.5) * (0.48 / n);
    const pts = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      pts.push(new THREE.Vector3(x, 0.86 - t * 0.38 - Math.sin(t * Math.PI) * 0.16, -0.4 + t * 0.64));
    }
    const strip = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.035, 6, false);
    strip.scale(1, 1, 1);
    b.part("c1", strip, { family: "fabric", side: "double" }, { tint: i % 2 ? "#ffffff" : "#f6ead4" });
  }
}

export function zabuton(b) {
  b.part("c1", at(b.cushion(0.58, 0.11, 0.58, { puff: 0.5, round: 0.9 }), 0, 0.058, 0), { family: "fabric", finish: "wool" });
  b.part("c2", at(b.ball(0.016), 0, 0.116, 0), { family: "fabric" });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.part("c2", at(turn(b.capsule(0.008, 0.03), sz * 0.6, 0, -sx * 0.6), sx * 0.27, 0.035, sz * 0.27), FABRIC);
}

export function log_seat(b) {
  // A split log on two stubby log feet: bark outside, pale cut wood on top and at the ends
  const log = turn(b.capsule(0.19, 0.8), 0, 0, Math.PI / 2);
  log.scale(1, 0.72, 1);
  b.part("c1", at(log, 0, 0.26, 0), { family: "wood", map: "logs", scale: 1.5, rough: 0.9, relief: 0.8 });
  b.part("c2", at(b.box(1.02, 0.03, 0.3, 0.012), 0, 0.405, 0), WOOD);
  for (const sx of [-1, 1]) b.part("c1", at(turn(b.capsule(0.09, 0.2), Math.PI / 2, 0, 0), sx * 0.38, 0.09, 0), { family: "wood", map: "logs", scale: 1.5, rough: 0.9 });
}

export function captain_chair(b) {
  // A pedestal chair with a high wrapped back and a glowing trim line
  b.part("c1", b.lathe([[0, 0], [0.3, 0], [0.31, 0.03], [0.12, 0.08], [0.07, 0.3], [0, 0.3]], [0, 0.01, 0.02, 0.04, 0.02, 0]), { family: "metal", finish: "brushed" });
  b.part("c1", at(b.cushion(0.62, 0.16, 0.6, { puff: 0.3, round: 0.8 }), 0, 0.42, 0.03), { family: "leather" });
  b.part("c1", b.tube([[-0.33, 0.5, 0.26], [-0.36, 0.72, -0.05], [-0.26, 1.05, -0.28], [0, 1.14, -0.33], [0.26, 1.05, -0.28], [0.36, 0.72, -0.05], [0.33, 0.5, 0.26]], 0.085, { segments: 80 }), { family: "leather" });
  b.part("c1", at(turn(b.cushion(0.5, 0.62, 0.1, { puff: 0.3, round: 0.8 }), -0.1, 0, 0), 0, 0.78, -0.26), { family: "leather" });
  b.glow("c2", b.tube([[-0.37, 0.56, 0.2], [-0.41, 0.74, -0.06], [-0.3, 1.06, -0.32], [0, 1.16, -0.38], [0.3, 1.06, -0.32], [0.41, 0.74, -0.06], [0.37, 0.56, 0.2]], 0.008, { segments: 60 }), { intensity: 1.8 });
}

// ---------- Tables ----------
export function table_dining(b) {
  b.part("c1", at(b.box(1.6, 0.05, 0.9, 0.022), 0, 0.725, 0), WOOD_LAQ);
  b.part("c2", at(b.box(1.36, 0.07, 0.66, 0.012), 0, 0.665, 0), WOOD);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) _leg(b, sx * 0.68, sz * 0.34, 0, 0.67, 0.036, 0.026, { splay: 0.03, spec: WOOD, slot: "c2" });
}

export function bistro_table(b) {
  b.part("c1", b.lathe([[0, 0.7], [0.315, 0.7], [0.325, 0.72], [0.31, 0.74], [0, 0.74]], [0, 0.01, 0.012, 0.008, 0]), { family: "ceramic", rough: 0.35 });
  b.part("c2", b.lathe([[0, 0], [0.22, 0], [0.23, 0.02], [0.2, 0.04], [0.05, 0.07], [0.03, 0.66], [0.07, 0.7], [0, 0.7]], [0, 0.008, 0.01, 0.02, 0.02, 0.012, 0.01, 0]), METAL_BLACK);
}

export function chabudai(b) {
  b.part("c1", b.lathe([[0, 0.29], [0.44, 0.29], [0.45, 0.315], [0.435, 0.34], [0, 0.34]], [0, 0.012, 0.014, 0.01, 0]), WOOD_LAQ);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.part("c1", at(turn(b.box(0.1, 0.29, 0.045, 0.016, { along: "y" }), 0, -a, 0), Math.cos(a) * 0.3, 0.145, Math.sin(a) * 0.3), WOOD);
  }
}

export function workbench(b) {
  const W = 1.8, D = 0.75, H = 0.9;
  b.part("c1", at(b.box(W, 0.08, D, 0.02), 0, H - 0.04, 0), { family: "wood", rough: 0.7 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.part("c2", at(b.box(0.08, H - 0.08, 0.08, 0.016, { along: "y" }), sx * (W / 2 - 0.1), (H - 0.08) / 2, sz * (D / 2 - 0.09)), METAL_BLACK);
    b.part("c2", at(b.box(0.06, 0.06, D - 0.2, 0.014, { along: "z" }), sx * (W / 2 - 0.1), 0.2, 0), METAL_BLACK);
  }
  b.part("c1", at(b.box(W - 0.24, 0.035, D - 0.16, 0.012), 0, 0.22, 0), { family: "wood", rough: 0.75 });
  // A vise at one end, and a drawer
  b.part("#7a8088", at(b.box(0.14, 0.1, 0.2, 0.02), -W / 2 + 0.18, H + 0.05, D / 2 - 0.12), { family: "metal", finish: "brushed" });
  b.part("#7a8088", at(turn(b.capsule(0.012, 0.2), 0, 0, Math.PI / 2), -W / 2 + 0.18, H + 0.06, D / 2 + 0.02), { family: "metal", finish: "polished" });
  b.part("c2", at(b.box(0.5, 0.12, 0.03, 0.012), 0.3, H - 0.15, D / 2 - 0.04), METAL_BLACK);
  b.part("#d9b25a", at(turn(b.capsule(0.01, 0.12), 0, 0, Math.PI / 2), 0.3, H - 0.15, D / 2 - 0.015), { family: "metal", finish: "polished" });
}

export function holo_table(b) {
  b.part("c1", b.lathe([[0, 0], [0.4, 0], [0.42, 0.04], [0.26, 0.12], [0.22, 0.7], [0.52, 0.86], [0.55, 0.92], [0.5, 0.95], [0, 0.93]], [0, 0.015, 0.03, 0.06, 0.08, 0.04, 0.02, 0.015, 0]), { family: "metal", finish: "brushed", rough: 0.4 });
  const on = b.state.on !== false;
  b.glow(on ? "c2" : "#16303a", at(b.cyl(0.44, 0.44, 0.006, 0.002), 0, 0.948, 0), { intensity: on ? 1.4 : 0.05 });
  if (on) {
    // A slowly turning map: rings and a little terrain of glowing bars
    const map = new THREE.Group();
    map.position.y = 1.02;
    b.extra.add(map);
    const parts = [turn(b.ring(0.3, 0.004), Math.PI / 2, 0, 0)];
    for (let i = 0; i < 14; i++) {
      const a = b.rand() * Math.PI * 2;
      const r = b.rand() * 0.24;
      const h = 0.03 + b.rand() * 0.12;
      parts.push(at(b.box(0.03, h, 0.03, 0.006), Math.cos(a) * r, h / 2, Math.sin(a) * r));
    }
    map.add(b.moving("c2", mergeAll(parts), { family: "emissive", intensity: 1.3 }, ""));
    b.onUpdate((dt, t, fx) => (map.rotation.y = fx?.reduced ? 0 : t * 0.3));
  }
}

// ---------- Bigger pieces ----------
export function platform(b) {
  b.part("c1", at(turn(b.extrude(b.rrect(2.0, 1.4, 0.12), 0.18, 0.03), -Math.PI / 2, 0, 0), 0, 0, 0), { family: "plastic", rough: 0.6 });
  const edge = b.rrect(2.02, 1.42, 0.13);
  edge.holes.push(new THREE.Path(b.rrect(1.98, 1.38, 0.11).getPoints(24).reverse()));
  b.glow("c2", at(turn(b.extrude(edge, 0.02, 0.006), -Math.PI / 2, 0, 0), 0, 0.03, 0), { intensity: 1.5 });
}

export function room_divider(b) {
  // Three hinged panels: a wooden frame around paper-like panels, zig-zagged so it stands
  for (let i = -1; i <= 1; i++) {
    const ang = i === 0 ? 0 : i * -0.42;
    const cx = i * 0.5;
    const cz = i === 0 ? 0.05 : -0.05;
    const frame = b.rrect(0.52, 1.75, 0.03);
    frame.holes.push(new THREE.Path(b.rrect(0.44, 1.63, 0.015).getPoints(16).reverse()));
    b.part("c2", at(turn(at(b.extrude(frame, 0.035, 0.012), 0, 0.875, -0.0175), 0, ang, 0), cx, 0, cz), WOOD);
    b.part("c1", at(turn(at(b.box(0.45, 1.64, 0.008, 0.003), 0, 0.875, 0), 0, ang, 0), cx, 0, cz), { family: "paper", map: "shoji", scale: 2.2 });
  }
}

export function mirror_floor(b) {
  // An arched standing mirror that leans a little
  const s = new THREE.Shape();
  const w = 0.6, h = 1.7, r = w / 2;
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, h - r);
  s.absarc(0, h - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  const inner = new THREE.Shape();
  const r2 = r - 0.04;
  inner.moveTo(-r2, 0.04);
  inner.lineTo(r2, 0.04);
  inner.lineTo(r2, h - r);
  inner.absarc(0, h - r, r2, 0, Math.PI, false);
  inner.lineTo(-r2, 0.04);
  const frame = s.clone();
  frame.holes.push(new THREE.Path(inner.getPoints(32).reverse()));
  const lean = -0.1;
  b.part("c1", at(turn(b.extrude(frame, 0.04, 0.014), lean, 0, 0), 0, 0.01, -0.02), { family: "metal", finish: "polished", rough: 0.25 });
  b.part("#cfd8de", at(turn(b.extrude(inner, 0.006, 0.002), lean, 0, 0), 0, 0.01, -0.012), { family: "metal", finish: "polished", rough: 0.04, metal: 1 });
  b.part("c1", b.tube([[0, 1.0, -0.12], [0, 0.02, -0.26]], 0.012), { family: "metal", finish: "polished", rough: 0.25 });
}

export function charging_pad(b) {
  b.part("c1", b.lathe([[0, 0], [0.43, 0], [0.45, 0.02], [0.4, 0.05], [0.3, 0.06], [0, 0.055]], [0, 0.01, 0.02, 0.02, 0.01, 0]), { family: "plastic", rough: 0.5 });
  const ring = b.moving("c2", at(b.lathe([[0.3, 0], [0.37, 0], [0.37, 0.006], [0.3, 0.006]], [0, 0.002, 0.002, 0]), 0, 0, 0), { family: "emissive", intensity: 1.6 }, "ring");
  ring.position.y = 0.052;
  ring.material = ring.material.clone();
  ring.material.userData = { ...ring.material.userData, shared: false, glow: true };
  // The light breathes slowly (steady while filming or with reduced motion)
  b.onUpdate((dt, t, fx) => (ring.material.emissiveIntensity = fx?.reduced || fx?.friendly ? 1.3 : 1.1 + 0.6 * Math.sin(t * 1.2)));
}

export function cat_tree(b) {
  const CARPET = { family: "fabric", finish: "boucle", scale: 2 };
  const ROPE = { family: "fabric", map: "knit", scale: 3, rough: 0.95 };
  b.part("c1", at(b.box(0.6, 0.06, 0.6, 0.025), 0, 0.03, 0), CARPET);
  b.part("c2", at(b.cyl(0.05, 0.05, 0.66, 0.012), -0.14, 0.05, -0.12), ROPE);
  b.part("c2", at(b.cyl(0.05, 0.05, 1.4, 0.012), 0.16, 0.05, 0.14), ROPE);
  b.part("c1", at(b.box(0.45, 0.05, 0.4, 0.022), -0.06, 0.72, -0.06), CARPET);
  b.part("c1", b.lathe([[0, 1.44], [0.2, 1.44], [0.225, 1.47], [0.215, 1.5], [0.17, 1.49], [0, 1.475]], [0, 0.012, 0.014, 0.01, 0.01, 0]).translate(0.16, 0, 0.14), CARPET);
  // A little hideaway box and a dangling toy
  b.part("c1", at(b.box(0.3, 0.26, 0.3, 0.04), -0.12, 0.2, 0.13), CARPET);
  b.part("#2a2420", at(turn(b.cyl(0.085, 0.085, 0.012, 0.004), Math.PI / 2, 0, 0), -0.12, 0.2, 0.282), { family: "fabric", rough: 1 });
  b.part("#f2c14e", at(b.ball(0.03), -0.25, 0.56, 0.1), { family: "fabric", finish: "wool" });
  b.part("#3a3a3a", b.tube([[-0.25, 0.7, 0.1], [-0.25, 0.58, 0.1]], 0.003), { family: "rubber" });
}

// ---------- Storage ----------
export function sideboard(b) {
  const W = 1.4, D = 0.45, H = 0.72;
  b.part("c1", at(b.box(W, H - 0.2, D, 0.03), 0, 0.2 + (H - 0.2) / 2, 0), WOOD_LAQ);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) _leg(b, sx * (W / 2 - 0.12), sz * (D / 2 - 0.1), 0, 0.2, 0.022, 0.014, { splay: 0.1, spec: WOOD, slot: "c1" });
  // Three doors with long brass pulls
  for (let i = -1; i <= 1; i++) {
    b.part("c1", at(b.box(W / 3 - 0.03, H - 0.26, 0.02, 0.01), i * (W / 3 - 0.01), 0.2 + (H - 0.2) / 2, D / 2 + 0.002), { family: "wood", seed: 4 + i });
    b.part("c2", at(b.capsule(0.007, 0.14), i * (W / 3 - 0.01) + (i === 0 ? 0.15 : -i * 0.15), 0.46, D / 2 + 0.024), { family: "metal", finish: "polished", rough: 0.2 });
  }
}

export function plant_shelf(b) {
  const W = 0.9, D = 0.35, H = 1.4;
  // A ladder shelf: two A-shaped sides, three boards, a few little pots
  for (const sx of [-1, 1]) {
    b.part("c1", b.tube([[sx * (W / 2 - 0.02), 0, D / 2 - 0.02], [sx * (W / 2 - 0.02), H, -D / 2 + 0.06]], 0.018), WOOD);
    b.part("c1", b.tube([[sx * (W / 2 - 0.02), 0, -D / 2 + 0.02], [sx * (W / 2 - 0.02), H, -D / 2 + 0.06]], 0.018), WOOD);
  }
  for (const [y, d] of [[0.5, 0.3], [0.95, 0.26], [1.385, 0.2]]) b.part("c1", at(b.box(W - 0.02, 0.03, d, 0.012), 0, y - 0.015, -D / 2 + 0.04 + d / 2), WOOD_LAQ);
  for (const [x, y, s] of [[-0.25, 0.5, 1], [0.2, 0.5, 0.8], [0.05, 0.95, 0.9]]) {
    const g = b.lathe([[0, 0], [0.045 * s, 0], [0.055 * s, 0.08 * s], [0.045 * s, 0.085 * s], [0, 0.07 * s]], [0, 0.008, 0.005, 0.004, 0]);
    b.part("c2", at(g, x, y, -0.02), { family: "ceramic", rough: 0.5 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const lf = b.leaf(0.1 * s, 0.035 * s, { droop: 0.5, fold: 0.4 });
      lf.rotateX(-0.5);
      lf.rotateY(a);
      b.part("#4d8a62", at(lf, x, y + 0.075 * s, -0.02), { family: "leaf" });
    }
  }
}

export function wall_shelves(b) {
  for (const y of [0.0, 0.4]) {
    b.part("c1", at(b.box(1.0, 0.035, 0.22, 0.014), 0, y + 0.0175, 0.11), WOOD_LAQ);
    for (const sx of [-1, 1]) b.part("c2", b.tube([[sx * 0.36, y + 0.0, 0.2], [sx * 0.36, y - 0.01, 0.012], [sx * 0.36, y + 0.18, 0.012]], 0.008), METAL_BLACK);
  }
  // The lower brackets hang below the bottom shelf: lift everything so the thing starts at y = 0
  for (const e of b.pieces.values()) for (const g of e.geos) g.translate(0, 0.02, 0);
}

export function log_rack(b) {
  for (const sx of [-1, 1]) {
    b.part("c2", b.tube([[sx * 0.37, 0.02, -0.16], [sx * 0.37, 0.88, -0.16]], 0.014), METAL_BLACK);
    b.part("c2", b.tube([[sx * 0.37, 0.02, 0.16], [sx * 0.37, 0.88, 0.16]], 0.014), METAL_BLACK);
    b.part("c2", at(turn(b.capsule(0.014, 0.32), Math.PI / 2, 0, 0), sx * 0.37, 0.02, 0), METAL_BLACK);
  }
  for (const z of [-0.16, 0.16]) b.part("c2", at(turn(b.capsule(0.012, 0.74), 0, 0, Math.PI / 2), 0, 0.06, z), METAL_BLACK);
  // A neat stack of split logs, their pale ends facing out
  let i = 0;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      const r = 0.05 + b.rand() * 0.012;
      const x = -0.3 + col * 0.12 + (row % 2) * 0.05;
      if (x > 0.32) continue;
      const log = turn(b.capsule(r, 0.22), Math.PI / 2, 0, 0);
      b.part("c1", at(log, x, 0.13 + row * 0.108, (b.rand() - 0.5) * 0.02), { family: "wood", map: "logs", scale: 3, rough: 0.9 }, { tint: i++ % 3 ? "#ffffff" : "#e6d2b8" });
    }
  }
}

export function bookcase_tall(b) {
  const W = 1.6, D = 0.38, H = 2.5, t = 0.036;
  for (const x of [-W / 2 + t / 2, 0, W / 2 - t / 2]) b.part("c1", at(b.box(t, H, D, 0.012, { along: "y" }), x, H / 2, 0), WOOD);
  b.part("c1", at(b.box(W + 0.06, 0.06, D + 0.04, 0.02), 0, H - 0.03, 0.01), WOOD_LAQ);
  b.part("c1", at(b.box(W, 0.1, D, 0.015), 0, 0.05, 0), WOOD);
  b.part("c1", at(b.box(W - 0.04, H - 0.1, 0.012, 0.004, { along: "y" }), 0, H / 2, -D / 2 + 0.008), { family: "wood", seed: 6 });
  const levels = [0.1, 0.6, 1.2, 1.8];
  for (const y of levels.slice(1)) b.part("c1", at(b.box(W - 2 * t, 0.03, D - 0.02, 0.01), 0, y - 0.015, 0.005), WOOD);
  // Full shelves on the lower levels; room left on each `surfaces` level for things of yours
  for (const [x0, x1] of [[-W / 2 + t + 0.01, -t / 2 - 0.01], [t / 2 + 0.01, W / 2 - t - 0.01]]) {
    _books(b, x0, x1, 0.1, D - 0.06, 0.44);
    _books(b, x0, x0 + (x1 - x0) * 0.55, 0.6, D - 0.06, 0.5);
    _books(b, x0 + (x1 - x0) * 0.4, x1, 1.2, D - 0.06, 0.5);
    _books(b, x0, x0 + (x1 - x0) * 0.6, 1.8, D - 0.06, 0.55);
  }
}
