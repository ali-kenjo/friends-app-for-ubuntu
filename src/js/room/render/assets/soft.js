// Rugs and plants of the hero set. Rugs are soft slabs with raised bands in the second color (a pattern
// that recolors without a new texture); plants are leaves on stems in rounded pots, and they sway.
import * as THREE from "three";
import { at, turn } from "../kit/build.js";

const RUG = { family: "fabric", finish: "wool", scale: 2, macro: { strength: 0.06, scale: 1.2 } };
const POT = { family: "ceramic", rough: 0.55 };
const SOIL = { family: "clay", rough: 0.95, map: "concrete", scale: 4 };
const LEAF = { family: "leaf" };

// A flat ring band (a rug's pattern), lying on y, slightly raised
function band(b, r0, r1, y, h = 0.004) {
  const g = b.lathe([[r0, y], [r1, y], [r1, y + h], [r0, y + h]], [0, h * 0.4, h * 0.4, 0]);
  return g;
}

export function rug_round(b) {
  const R = 1.0;
  b.part("c1", b.lathe([[0, 0], [R - 0.01, 0], [R, 0.006], [R - 0.012, 0.012], [0, 0.012]], [0, 0.004, 0.006, 0.004, 0]), RUG);
  // A small medallion, a ring of soft dots, and a double border near the edge
  b.part("c2", b.lathe([[0, 0.011], [0.15, 0.011], [0.15, 0.015], [0, 0.015]], [0, 0.002, 0.002, 0]), RUG);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.part("c2", at(b.lathe([[0, 0], [0.045, 0], [0.045, 0.004], [0, 0.004]], [0, 0.0015, 0.0015, 0]), Math.cos(a) * 0.45, 0.011, Math.sin(a) * 0.45), RUG);
  }
  for (const [r0, r1] of [[0.74, 0.79], [0.85, 0.92]]) b.part("c2", band(b, r0, r1, 0.011), RUG);
}

function rectBand(b, w, d, inset, width, y) {
  const outer = b.rrect(w - inset * 2, d - inset * 2, 0.05);
  outer.holes.push(new THREE.Path(b.rrect(w - (inset + width) * 2, d - (inset + width) * 2, 0.04).getPoints(24).reverse()));
  return at(turn(b.extrude(outer, 0.004, 0.0015), -Math.PI / 2, 0, 0), 0, y, 0);
}

export function rug_rect(b) {
  const W = 2.4, D = 1.7;
  b.part("c1", at(turn(b.extrude(b.rrect(W, D, 0.06), 0.012, 0.005), -Math.PI / 2, 0, 0), 0, 0, 0), RUG);
  b.part("c2", rectBand(b, W, D, 0.1, 0.07, 0.011), RUG);
  b.part("c2", rectBand(b, W, D, 0.24, 0.025, 0.011), RUG);
  // A soft diamond medallion
  const dia = new THREE.Shape();
  dia.moveTo(0, 0.38);
  dia.quadraticCurveTo(0.02, 0.02, 0.5, 0);
  dia.quadraticCurveTo(0.02, -0.02, 0, -0.38);
  dia.quadraticCurveTo(-0.02, -0.02, -0.5, 0);
  dia.quadraticCurveTo(-0.02, 0.02, 0, 0.38);
  b.part("c2", at(turn(b.extrude(dia, 0.004, 0.0015), -Math.PI / 2, 0, 0), 0, 0.011, 0), RUG);
}

export function rug_runner(b) {
  const W = 2.6, D = 0.8;
  b.part("c1", at(turn(b.extrude(b.rrect(W, D, 0.05), 0.012, 0.005), -Math.PI / 2, 0, 0), 0, 0, 0), RUG);
  for (const x of [-0.95, -0.85, 0, 0.85, 0.95]) {
    const wide = Math.abs(x) < 0.1 ? 0.18 : 0.045;
    b.part("c2", at(turn(b.extrude(b.rrect(wide, D - 0.12, 0.012), 0.004, 0.0015), -Math.PI / 2, 0, 0), x, 0.011, 0), RUG);
  }
  // Fringes at the ends
  for (const sx of [-1, 1]) for (let i = 0; i < 14; i++) b.part("c1", at(turn(b.capsule(0.005, 0.05), 0, 0, Math.PI / 2), sx * (W / 2 + 0.025), 0.005, -D / 2 + 0.06 + i * ((D - 0.12) / 13)), RUG);
}

// ---------- Plants ----------
// A rounded pot with a rim and soil; returns the soil height
export function _pot(b, rTop, h, { slot = "c2", rim = 0.018, foot = 0.86 } = {}) {
  b.part(slot, b.lathe([[0, 0], [rTop * foot, 0], [rTop * 0.97, h * 0.85], [rTop + rim * 0.4, h - rim], [rTop + rim * 0.5, h], [rTop - rim * 0.9, h], [rTop - rim * 1.1, h - rim * 1.5], [0, h - rim * 1.5]], [0, 0.012, 0.02, 0.008, 0.006, 0.006, 0.006, 0]), POT);
  b.part("#4a3628", at(b.cyl(rTop - rim * 1.15, rTop - rim * 1.15, 0.012, 0.004), 0, h - rim * 2.2, 0), SOIL);
  return h - rim * 1.6;
}

// Leaves on stems from a point: each { len, width, angle (around), lean (from up), height }
export function _foliage(b, base, leaves, { slot = "c1", split = 0, stem = "#3f6b45", stemR = 0.008, droop = 0.3, fold = 0.35 } = {}) {
  const foliageGeos = [];
  const stems = [];
  for (const l of leaves) {
    const dir = new THREE.Vector3(Math.sin(l.lean) * Math.cos(l.angle), Math.cos(l.lean), Math.sin(l.lean) * Math.sin(l.angle));
    const tip = base.clone().add(dir.clone().multiplyScalar(l.height));
    const mid = base.clone().add(dir.clone().multiplyScalar(l.height * 0.5)).add(new THREE.Vector3(0, l.height * 0.08, 0));
    stems.push(b.tube([base.toArray(), mid.toArray(), tip.toArray()], stemR, { roundEnds: true }));
    const g = b.leaf(l.len, l.width, { split, droop, fold, twist: (b.rand() - 0.5) * 0.4 });
    // Lay the leaf out from the stem's tip, facing up and out
    g.rotateX(-Math.PI / 2 + (l.tilt ?? 0.55));
    g.rotateY(-l.angle + Math.PI / 2);
    g.translate(tip.x, tip.y, tip.z);
    foliageGeos.push(g);
  }
  for (const g of stems) b.part(stem, g, { family: "leaf", rough: 0.6 });
  return foliageGeos;
}

// Leaves sway as one piece around their base (gentle; still while filming or with reduced motion)
export function _sway(b, geos, slot, spec, pivotY, amount = 0.035) {
  if (!geos.length) return;
  const merged = geos.length === 1 ? geos[0] : mergeAll(geos);
  merged.translate(0, -pivotY, 0);
  const mesh = b.moving(slot, merged, spec, "foliage");
  mesh.position.y = pivotY;
  const phase = b.rand() * 6;
  b.onUpdate((dt, t, fx) => {
    const k = fx?.reduced || fx?.friendly ? 0 : (fx?.wind ?? 0.3) / 0.3;
    // A thirsty plant (plant care) leans over and sags a little
    const dry = fx?.thirst || 0;
    mesh.rotation.z = Math.sin(t * 0.9 + phase) * amount * k + dry * 0.22;
    mesh.rotation.x = Math.sin(t * 0.7 + phase * 1.3) * amount * 0.6 * k + dry * 0.12;
    mesh.scale.y = 1 - dry * 0.14;
  });
}

import { merge as mergeAll } from "../kit/geometry.js";

export function monstera(b) {
  const top = _pot(b, 0.2, 0.36);
  const base = new THREE.Vector3(0, top, 0);
  const leaves = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + b.rand() * 0.5;
    const outer = i % 3 !== 0;
    leaves.push({ angle: a, lean: outer ? 0.55 + b.rand() * 0.25 : 0.2 + b.rand() * 0.15, height: outer ? 0.45 + b.rand() * 0.25 : 0.7 + b.rand() * 0.15, len: 0.32 + b.rand() * 0.1, width: 0.3 + b.rand() * 0.08, tilt: 0.7 });
  }
  const geos = _foliage(b, base, leaves, { split: 1, droop: 0.22, fold: 0.18, stemR: 0.007 });
  _sway(b, geos, "c1", LEAF, top, 0.03);
}

export function fig_tree(b) {
  const top = _pot(b, 0.19, 0.34);
  // A slender trunk that leans and curves, with three branches carrying clusters of small leaves
  b.part("#7a5a3e", b.tube([[0, top - 0.02, 0], [0.03, top + 0.4, 0.01], [-0.02, top + 0.8, 0.02], [0.01, top + 1.1, 0]], 0.022), { family: "wood", rough: 0.8 });
  const clusters = [[0.0, 1.32, 0.0, 0.3], [0.2, 1.08, 0.06, 0.24], [-0.18, 0.98, -0.05, 0.22], [0.05, 0.86, 0.18, 0.2]];
  const geos = [];
  for (const [cx, cy, cz, r] of clusters) {
    b.part("#7a5a3e", b.tube([[0, top + cy * 0.65, 0], [cx * 0.6, top + cy * 0.85, cz * 0.6], [cx, top + cy - 0.1, cz]], 0.01), { family: "wood", rough: 0.8 });
    const count = Math.round(r * 150);
    for (let i = 0; i < count; i++) {
      const u = b.rand() * Math.PI * 2;
      const v = Math.acos(2 * b.rand() - 1);
      const p = new THREE.Vector3(Math.sin(v) * Math.cos(u), Math.cos(v) * 0.75, Math.sin(v) * Math.sin(u)).multiplyScalar(r * (0.6 + 0.4 * b.rand()));
      const g = b.leaf(0.11, 0.075, { fold: 0.3, droop: 0.15 });
      g.rotateX(-Math.PI / 2 + 0.3 + b.rand() * 0.5);
      g.rotateY(-u + Math.PI / 2);
      g.translate(cx + p.x, top + cy + p.y, cz + p.z);
      geos.push(g);
    }
  }
  _sway(b, geos, "c1", LEAF, top + 0.6, 0.02);
}

export function succulents(b) {
  // Three little pots in a row, each with a fleshy rosette
  for (const [x, s] of [[-0.1, 0.9], [0, 1.1], [0.1, 0.85]]) {
    const r = 0.042 * s;
    const h = 0.07 * s;
    const g = b.lathe([[0, 0], [r * 0.85, 0], [r, h], [r * 0.8, h], [0, h - 0.01]], [0, 0.006, 0.004, 0.003, 0]);
    b.part("c2", at(g, x, 0, 0), POT);
    const n = 9;
    for (let ring = 0; ring < 2; ring++) {
      for (let i = 0; i < n - ring * 3; i++) {
        const a = (i / (n - ring * 3)) * Math.PI * 2 + ring * 0.4;
        const leaf = b.ball(0.016 * s * (1 - ring * 0.25), { squash: 1 });
        leaf.scale(0.8, 0.5, 1.9);
        leaf.rotateX(ring ? -0.9 : -0.35);
        leaf.rotateY(-a + Math.PI / 2);
        leaf.translate(x + Math.cos(a) * 0.017 * s * (1 - ring * 0.5), h + 0.008 + ring * 0.012, Math.sin(a) * 0.017 * s * (1 - ring * 0.5));
        b.part("c1", leaf, { family: "leaf", rough: 0.45 });
      }
    }
  }
}

export function vase_flowers(b) {
  // A glazed bottle vase
  b.part("c2", b.lathe([[0, 0], [0.06, 0], [0.078, 0.06], [0.07, 0.16], [0.035, 0.22], [0.032, 0.25], [0.04, 0.26], [0.026, 0.26], [0, 0.23]], [0, 0.01, 0.03, 0.03, 0.01, 0.004, 0.003, 0]), { family: "ceramic" });
  const stems = [];
  const heads = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + b.rand();
    const lean = 0.12 + b.rand() * 0.18;
    const h = 0.2 + b.rand() * 0.06;
    const tip = [Math.sin(lean) * Math.cos(a) * h, 0.24 + Math.cos(lean) * h, Math.sin(lean) * Math.sin(a) * h];
    stems.push(b.tube([[0, 0.2, 0], [tip[0] * 0.5, 0.24 + h * 0.5, tip[2] * 0.5], tip], 0.0045));
    // A tulip head: six cupped petals
    for (let p = 0; p < 6; p++) {
      const pa = (p / 6) * Math.PI * 2 + (p % 2) * 0.3;
      const g = b.petal(0.05, 0.034, { cup: 0.9 });
      g.rotateX(-0.25 - (p % 2) * 0.12);
      g.rotateY(pa);
      g.translate(tip[0], tip[1] - 0.006, tip[2]);
      heads.push(g);
    }
    const leaf = b.leaf(0.12, 0.03, { fold: 0.6, droop: 0.4 });
    leaf.rotateX(-0.4);
    leaf.rotateY(-a);
    leaf.translate(0, 0.22, 0);
    stems.push(leaf);
  }
  for (const g of stems) b.part("#4f8a4a", g, LEAF);
  for (const g of heads) b.part("c1", g, { family: "leaf", rough: 0.5 });
}
