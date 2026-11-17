// Art and sculptures, books and study things, sports gear.
import * as THREE from "three";
import { at, turn } from "../kit/build.js";
import { merge as mergeAll } from "../kit/geometry.js";

const WOOD = { family: "wood" };
const WOOD_LAQ = { family: "wood", finish: "lacquered" };
const METAL_BLACK = { family: "metal", finish: "black", rough: 0.38 };
const STEEL = { family: "metal", finish: "brushed" };
const CHROME = { family: "metal", finish: "polished", rough: 0.18 };
const BRASS = { family: "metal", finish: "polished", rough: 0.22 };
const GLOSS = { family: "plastic", finish: "gloss" };
const CERAMIC = { family: "ceramic" };
const PAPER = { family: "paper" };
const RUBBER = { family: "rubber" };
const still = (fx) => Boolean(fx?.reduced);

// ---------- Art and sculptures ----------
export function easel(b) {
  // Three legs, a ledge, and a canvas with a bold painting on it
  for (const sx of [-1, 1]) b.part("c1", b.tube([[sx * 0.3, 0, 0.12], [sx * 0.04, 1.68, -0.02]], 0.018), WOOD);
  b.part("c1", b.tube([[0, 0, -0.28], [0, 1.5, -0.04]], 0.018), WOOD);
  b.part("c1", at(b.box(0.6, 0.04, 0.07, 0.014), 0, 0.72, 0.1), WOOD);
  b.part("c1", at(b.box(0.5, 0.03, 0.04, 0.012), 0, 1.3, 0.035), WOOD);
  b.part("#f6f2ea", at(turn(b.box(0.56, 0.56, 0.03, 0.008), -0.09, 0, 0), 0, 1.03, 0.085), { family: "fabric", scale: 4 });
  const blobs = [[-0.1, 1.1, 0.13, "#ffffff"], [0.09, 0.98, 0.1, "#ffe9b0"], [0.02, 1.16, 0.07, "#cfe0ff"], [-0.12, 0.9, 0.08, "#ffd0d8"]];
  for (const [x, y, r, tint] of blobs) b.part("c2", at(turn(b.cyl(r, r, 0.004, 0.0015), Math.PI / 2 - 0.09, 0, 0), x, y, 0.101 - (y - 1.03) * 0.09), { family: "clay", rough: 0.7, map: false }, { tint });
}

export function sculpture_loop(b) {
  b.part("c2", at(b.box(0.2, 0.05, 0.14, 0.014), 0, 0.025, 0), { family: "clay", rough: 0.6 });
  // A ribbon that loops through itself
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    pts.push([Math.sin(t) * 0.085, 0.22 + Math.sin(t * 2) * 0.12 * 0.9 + Math.cos(t) * 0.04, Math.cos(t * 2) * 0.03]);
  }
  b.part("c1", b.tube(pts, 0.016, { segments: 96, roundEnds: false }), BRASS);
  b.part("c1", b.tube([[0, 0.05, 0], [0, 0.1, 0]], 0.012), BRASS);
}

export function amphora(b) {
  b.part("c1", b.lathe([[0, 0], [0.09, 0], [0.11, 0.03], [0.2, 0.28], [0.17, 0.5], [0.07, 0.62], [0.08, 0.72], [0.1, 0.75], [0.085, 0.75], [0.06, 0.68], [0.05, 0.62]], [0, 0.015, 0.03, 0.1, 0.08, 0.04, 0.03, 0.008, 0.008, 0.02, 0]), CERAMIC);
  b.part("c2", b.lathe([[0.196, 0.34], [0.2, 0.3], [0.194, 0.26], [0.2, 0.26], [0.207, 0.3], [0.202, 0.34]], 0.004), CERAMIC);
  for (const sx of [-1, 1]) b.part("c1", b.tube([[sx * 0.075, 0.7, 0], [sx * 0.17, 0.66, 0], [sx * 0.17, 0.5, 0]], 0.014), CERAMIC);
}

export function mobile_kinetic(b) {
  // Hanging from y = 0: a cord, two balanced arms, shapes that turn slowly
  b.part("#3a3a3a", b.tube([[0, 0, 0], [0, -0.2, 0]], 0.003, { segments: 2 }), RUBBER);
  const top = new THREE.Group();
  top.position.y = -0.2;
  b.extra.add(top);
  top.add(b.moving("#8a8f98", turn(b.capsule(0.004, 0.7), 0, 0, Math.PI / 2), CHROME, ""));
  const arms = [-1, 1].map((sx) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.35, 0, 0);
    top.add(g);
    const parts = [b.tube([[0, 0, 0], [0, -0.16, 0]], 0.002, { segments: 2, roundEnds: false }), at(turn(b.capsule(0.003, 0.34), 0, 0, Math.PI / 2), 0, -0.16, 0)];
    g.add(b.moving("#8a8f98", mergeAll(parts), CHROME, ""));
    const shapes = [];
    for (const s2 of [-1, 1]) {
      shapes.push(b.tube([[s2 * 0.17, -0.16, 0], [s2 * 0.17, -0.34 - (s2 > 0 ? 0.08 : 0), 0]], 0.002, { segments: 2, roundEnds: false }));
      shapes.push(at(s2 * sx > 0 ? b.ball(0.05) : turn(b.cyl(0.065, 0.065, 0.008, 0.003), Math.PI / 2, 0, 0), s2 * 0.17, -0.4 - (s2 > 0 ? 0.08 : 0), 0));
    }
    g.add(b.moving(sx > 0 ? "c1" : "c2", mergeAll(shapes), { family: "plastic", rough: 0.5 }, ""));
    return g;
  });
  b.onUpdate((dt, t, fx) => {
    if (still(fx)) return;
    top.rotation.y = t * 0.15;
    arms.forEach((g, i) => (g.rotation.y = Math.sin(t * 0.3 + i * 2) * 1.2));
  });
}

export function bust(b) {
  b.part("c2", at(b.box(0.2, 0.1, 0.18, 0.02), 0, 0.05, 0), { family: "clay", rough: 0.5 });
  // A calm, simplified head and shoulders
  const MARBLE = { family: "clay", rough: 0.35, map: "plaster", scale: 2 };
  b.part("c1", at(b.cushion(0.26, 0.14, 0.16, { puff: 0.4, round: 1 }), 0, 0.17, 0), MARBLE);
  b.part("c1", at(b.cyl(0.04, 0.05, 0.08, 0.015), 0, 0.22, 0), MARBLE);
  const head = b.ball(0.085, { squash: 1.2 });
  b.part("c1", at(head, 0, 0.385, 0.005), MARBLE);
  b.part("c1", at(b.ball(0.016, { squash: 1.3 }), 0, 0.375, 0.088), MARBLE);
  b.part("c1", at(b.cushion(0.17, 0.07, 0.15, { puff: 0.6, round: 1 }), 0, 0.455, -0.01), MARBLE);
}

export function paper_crane(b) {
  // Folded planes: a body, a neck and head, a tail, two wings
  const tri = (pts) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts.flat(), 3));
    g.computeVertexNormals();
    return g;
  };
  const body = [[-0.07, 0.07, 0], [0.07, 0.07, 0], [0, 0.04, 0.045], [-0.07, 0.07, 0], [0, 0.04, -0.045], [0.07, 0.07, 0], [-0.07, 0.07, 0], [0, 0.04, 0.045], [0, 0.04, -0.045], [0.07, 0.07, 0], [0, 0.04, -0.045], [0, 0.04, 0.045]];
  const neck = [[0.05, 0.07, 0.008], [0.12, 0.21, 0], [0.05, 0.07, -0.008], [0.12, 0.21, 0], [0.165, 0.175, 0], [0.11, 0.185, 0]];
  const tail = [[-0.05, 0.07, 0.008], [-0.15, 0.2, 0], [-0.05, 0.07, -0.008]];
  b.part("c1", mergeAll([tri(body), tri(neck), tri(tail)]), { family: "paper", side: "double", flat: true });
  for (const sz of [-1, 1]) {
    b.part("c1", tri([[-0.045, 0.07, 0], [0.045, 0.07, 0], [0.01, 0.2, sz * 0.13]]), { family: "paper", side: "double", flat: true });
    b.part("c2", tri([[-0.012, 0.165, sz * 0.095], [0.022, 0.165, sz * 0.095], [0.01, 0.2, sz * 0.13]]), { family: "paper", side: "double", flat: true, map: false });
  }
  b.part("#d9b25a", at(b.cyl(0.05, 0.055, 0.04, 0.01), 0, 0, 0), WOOD_LAQ);
}

export function geode(b) {
  // A split rock with a hollow of crystals that catch the light
  const rock = b.ball(0.1, { squash: 0.95 });
  const pos = rock.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = 1 + 0.1 * Math.sin(x * 60) * Math.cos(y * 50) + 0.06 * Math.sin(z * 70);
    pos.setXYZ(i, x * n, Math.max(-0.07, y * n), z > 0.02 ? 0.02 + (z - 0.02) * 0.25 : z * n);
  }
  rock.computeVertexNormals();
  b.part("c2", at(rock, 0, 0.075, -0.01), { family: "clay", rough: 0.9, map: "stone", scale: 5 });
  for (let i = 0; i < 22; i++) {
    const a = b.rand() * Math.PI * 2;
    const r = Math.sqrt(b.rand()) * 0.065;
    const h = 0.02 + b.rand() * 0.035;
    const c = b.lathe([[0, 0], [0.008, 0], [0.008, h * 0.6], [0, h]], 0);
    c.rotateX(Math.PI / 2 + (b.rand() - 0.5) * 0.5);
    b.part("c1", at(c, Math.cos(a) * r, 0.08 + Math.sin(a) * r * 0.9, 0.012), { family: "glass", opacity: 0.85, flat: true }, { tint: i % 3 ? "#ffffff" : "#e6d0ff" });
  }
}

export function sand_timer(b) {
  for (const y of [0, 0.245]) b.part("c1", at(b.cyl(0.055, 0.055, 0.015, 0.005), 0, y, 0), BRASS);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.part("c1", at(b.cyl(0.004, 0.004, 0.23, 0.001), Math.cos(a) * 0.045, 0.015, Math.sin(a) * 0.045), BRASS);
  }
  b.part("#ffffff", b.lathe([[0.036, 0.018], [0.04, 0.06], [0.006, 0.13], [0.04, 0.2], [0.036, 0.243]], [0, 0.02, 0.012, 0.02, 0]), { family: "glass", opacity: 0.2 });
  b.part("c2", b.lathe([[0, 0.02], [0.032, 0.02], [0.03, 0.045], [0, 0.075]], [0, 0.004, 0.01, 0]), { family: "clay", map: "sand", scale: 10, rough: 0.9 });
  b.part("c2", b.lathe([[0, 0.14], [0.012, 0.15], [0.03, 0.185], [0, 0.185]], [0, 0.004, 0.004, 0]), { family: "clay", map: "sand", scale: 10, rough: 0.9 });
}

export function wind_chimes(b) {
  // Hanging from y = 0: a wooden top, tubes of different lengths, a clapper; they sway with the wind
  b.part("#3a3a3a", b.tube([[0, 0, 0], [0, -0.08, 0]], 0.003, { segments: 2 }), RUBBER);
  b.part("c2", at(b.cyl(0.09, 0.09, 0.02, 0.008), 0, -0.1, 0), WOOD_LAQ);
  const tubes = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const len = 0.22 + (i % 3) * 0.06;
    const g = mergeAll([at(b.cyl(0.009, 0.009, len, 0.003), 0, -len, 0), b.tube([[0, 0, 0], [0, -0.04, 0]], 0.0012, { segments: 1, roundEnds: false })]);
    const m = b.moving("c1", g, CHROME, "");
    m.position.set(Math.cos(a) * 0.07, -0.1, Math.sin(a) * 0.07);
    tubes.push([m, a]);
  }
  const clapper = b.moving("c2", mergeAll([at(b.cyl(0.03, 0.03, 0.012, 0.004), 0, -0.26, 0), b.tube([[0, 0, 0], [0, -0.5, 0]], 0.0012, { segments: 1, roundEnds: false }), at(b.box(0.05, 0.07, 0.004, 0.002), 0, -0.47, 0)]), WOOD, "");
  clapper.position.y = -0.1;
  b.onUpdate((dt, t, fx) => {
    const k = still(fx) || fx?.friendly ? 0 : (fx?.wind ?? 0.3) / 0.3;
    for (const [m, a] of tubes) m.rotation.set(Math.sin(t * 1.3 + a) * 0.06 * k, 0, Math.cos(t * 1.1 + a * 2) * 0.06 * k);
    clapper.rotation.set(Math.sin(t * 0.9) * 0.1 * k, 0, Math.cos(t * 0.7) * 0.1 * k);
  });
}

// ---------- Books and study ----------
export function globe(b) {
  b.part("c2", b.lathe([[0, 0], [0.1, 0], [0.11, 0.015], [0.03, 0.04], [0.015, 0.1], [0, 0.1]], [0, 0.006, 0.01, 0.015, 0.006, 0]), BRASS);
  // The sphere turns on a tilted axis inside a half meridian ring
  const tilt = new THREE.Group();
  tilt.position.y = 0.25;
  tilt.rotation.z = 0.41;
  b.extra.add(tilt);
  const earth = b.moving("c1", b.ball(0.125), { family: "plastic", rough: 0.5 }, "earth");
  // Continents as soft raised patches
  const lands = [];
  for (const [la, lo, r] of [[0.6, 0.2, 0.05], [0.2, 0.5, 0.06], [-0.3, 0.9, 0.045], [0.5, 2.4, 0.07], [0.0, 2.9, 0.05], [-0.4, 4.2, 0.05], [0.7, 4.8, 0.04], [-0.9, 1.6, 0.05]]) {
    const p = b.ball(r, { squash: 0.5 });
    const dir = new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo));
    p.lookAt(dir);
    p.rotateX(Math.PI / 2);
    p.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    p.translate(dir.x * 0.112, dir.y * 0.112, dir.z * 0.112);
    lands.push(p);
  }
  const land = b.moving("#7fb07a", mergeAll(lands), { family: "plastic", rough: 0.6 }, "");
  const spin = new THREE.Group();
  spin.add(earth, land);
  tilt.add(spin);
  tilt.add(b.moving("c2", mergeAll([turn(b.ring(0.14, 0.006, Math.PI), 0, 0, -Math.PI / 2), at(b.ball(0.01), 0, 0.14, 0), at(b.ball(0.01), 0, -0.14, 0)]), BRASS, ""));
  b.onUpdate((dt, t, fx) => (spin.rotation.y = still(fx) ? 0.6 : t * 0.25));
}

export function orrery(b) {
  b.part("c1", b.lathe([[0, 0], [0.2, 0], [0.21, 0.02], [0.06, 0.06], [0.025, 0.2], [0.02, 0.62], [0, 0.62]], [0, 0.008, 0.012, 0.03, 0.02, 0.006, 0]), BRASS);
  b.glow("#ffd98a", at(b.ball(0.07), 0, 0.68, 0), { intensity: 1.6 });
  // Planets on arms of different lengths, each turning at its own pace
  const planets = [[0.14, 0.022, 1.6, 0], [0.22, 0.03, 1.0, 0.03], [0.3, 0.026, 0.6, -0.02]].map(([r, size, speed, dy], i) => {
    const arm = new THREE.Group();
    arm.position.y = 0.6 - i * 0.03;
    b.extra.add(arm);
    arm.add(b.moving("c1", mergeAll([turn(b.capsule(0.003, r), 0, 0, Math.PI / 2).translate(r / 2, 0, 0), b.tube([[r, 0, 0], [r, 0.08 + dy + i * 0.03, 0]], 0.003, { segments: 2 })]), BRASS, ""));
    arm.add(b.moving("c2", at(b.ball(size), r, 0.08 + dy + i * 0.03, 0), { family: "plastic", rough: 0.5 }, ""));
    return [arm, speed, i * 2.1];
  });
  b.onUpdate((dt, t, fx) => planets.forEach(([arm, speed, ph]) => (arm.rotation.y = (still(fx) || !b.state.on ? 0 : t * speed * 0.4) + ph)));
}

export function meteorite(b) {
  b.part("#3a2a20", at(b.box(0.3, 0.03, 0.24, 0.012), 0, 0.015, 0), WOOD_LAQ);
  const rock = b.ball(0.07, { squash: 0.8 });
  const pos = rock.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = 1 + 0.16 * Math.sin(x * 45 + 1) * Math.cos(z * 40) + 0.1 * Math.sin(y * 60);
    pos.setXYZ(i, x * n * 1.2, y * n, z * n);
  }
  rock.computeVertexNormals();
  b.part("c1", at(rock, 0, 0.1, 0), { family: "metal", finish: "brushed", rough: 0.6, map: "stone", scale: 6 });
  b.part("#d9b25a", at(b.cyl(0.012, 0.02, 0.04, 0.004), 0, 0.03, 0), BRASS);
  b.part("c2", at(b.box(0.27, 0.2, 0.21, 0.02), 0, 0.13, 0), { family: "glass", opacity: 0.16 });
}

export function telescope(b) {
  // A brass tube on a wooden tripod, pointed at the sky
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    b.part("c2", b.tube([[Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32], [Math.cos(a) * 0.03, 0.95, Math.sin(a) * 0.03]], 0.016), WOOD);
  }
  b.part("c2", at(b.cyl(0.05, 0.05, 0.06, 0.012), 0, 0.93, 0), METAL_BLACK);
  const tube = [b.cyl(0.05, 0.062, 0.6, 0.01), at(b.cyl(0.068, 0.068, 0.06, 0.012), 0, 0.57, 0), at(b.cyl(0.03, 0.036, 0.12, 0.008), 0, -0.1, 0), at(b.cyl(0.02, 0.02, 0.05, 0.006), 0, -0.14, 0)];
  const g = mergeAll(tube);
  g.translate(0, -0.25, 0);
  g.rotateZ(-0.95);
  b.part("c1", at(g, 0, 1.02, 0), BRASS);
  b.part("#9fd6ff", at(turn(b.cyl(0.055, 0.055, 0.004, 0.001), 0, 0, -0.95), 0.305, 1.222, 0), { family: "glass", opacity: 0.5 });
}

export function typewriter(b) {
  b.part("c1", at(b.cushion(0.38, 0.1, 0.3, { puff: 0.1, round: 0.5 }), 0, 0.055, 0), GLOSS);
  b.part("c1", at(b.box(0.34, 0.06, 0.12, 0.02), 0, 0.12, -0.08), GLOSS);
  b.part("#2d3038", at(turn(b.capsule(0.022, 0.36), 0, 0, Math.PI / 2), 0, 0.15, -0.1), RUBBER);
  b.part("#fbf8f1", at(turn(b.box(0.2, 0.16, 0.002, 0.001), -0.25, 0, 0), 0, 0.22, -0.12), PAPER);
  // Round keys in four rows
  const keysGeo = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 10 - (r % 2); c++) keysGeo.push(at(b.cyl(0.011, 0.011, 0.008, 0.003), -0.135 + c * 0.03 + (r % 2) * 0.015, 0.105 - r * 0.012, 0.01 + r * 0.03));
  b.part("c2", mergeAll(keysGeo), { family: "plastic", rough: 0.4 });
  b.part("#c4c9d2", b.tube([[-0.2, 0.15, -0.1], [-0.23, 0.2, -0.06]], 0.005), CHROME);
}

export function tome_open(b) {
  // A big book lying open: a cover, two curved blocks of pages, a ribbon
  b.part("c1", at(b.box(0.44, 0.012, 0.3, 0.005), 0, 0.006, 0), { family: "leather" });
  for (const sx of [-1, 1]) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(sx * 0.21, 0);
    s.lineTo(sx * 0.21, 0.016);
    s.quadraticCurveTo(sx * 0.1, 0.045, 0, 0.03);
    const g = b.extrude(s, 0.28, 0.003);
    b.part("c2", at(g, 0, 0.012, -0.14), PAPER);
    // Lines of writing as faint raised strips
    const lines = [];
    for (let i = 0; i < 7; i++) lines.push(at(turn(b.box(0.15, 0.001, 0.008, 0.0005), 0, 0, sx * -0.1), sx * 0.11, 0.046, -0.1 + i * 0.033));
    b.part("#8a7a6a", mergeAll(lines), { family: "paper", map: false });
  }
  b.part("#c0392b", at(b.box(0.012, 0.002, 0.2, 0.0008), 0.01, 0.044, 0.06), { family: "fabric" });
}

export function microscope(b) {
  b.part("c2", at(b.cushion(0.18, 0.035, 0.2, { puff: 0.1, round: 0.6 }), 0, 0.018, 0), METAL_BLACK);
  b.part("c1", b.tube([[0, 0.03, -0.07], [0, 0.2, -0.085], [0, 0.29, -0.03]], 0.02), { family: "plastic", rough: 0.4 });
  b.part("c1", at(turn(b.cyl(0.02, 0.024, 0.16, 0.006), 0.5, 0, 0), 0, 0.2, 0.0), { family: "plastic", rough: 0.4 });
  b.part("#2d3038", at(turn(b.cyl(0.016, 0.016, 0.04, 0.005), 0.5, 0, 0), 0, 0.34, 0.066), METAL_BLACK);
  b.part("c2", at(b.box(0.11, 0.008, 0.1, 0.003), 0, 0.12, 0.03), METAL_BLACK);
  b.part("#c4c9d2", at(turn(b.cyl(0.014, 0.01, 0.03, 0.004), 0.5, 0, 0), 0, 0.15, 0.022), CHROME);
  for (const sx of [-1, 1]) b.part("#2d3038", at(turn(b.cyl(0.018, 0.018, 0.016, 0.005), 0, 0, Math.PI / 2), sx * 0.03, 0.17, -0.08), METAL_BLACK);
}

export function quill_ink(b) {
  b.part("c2", b.lathe([[0, 0], [0.035, 0], [0.042, 0.03], [0.02, 0.055], [0.022, 0.07], [0.014, 0.07], [0.012, 0.055], [0, 0.05]], [0, 0.008, 0.012, 0.006, 0.003, 0.003, 0.004, 0]), { family: "glass", opacity: 0.9 });
  // The quill stands in the pot, leaning
  const feather = b.leaf(0.15, 0.04, { droop: 0.1, fold: 0.15 });
  feather.rotateZ(-0.35);
  b.part("c1", at(feather, 0.012, 0.05, 0), { family: "paper", side: "double" });
  b.part("c1", b.tube([[0, 0.02, 0], [0.012, 0.06, 0]], 0.0025, { segments: 2 }), { family: "paper" });
  b.part("#f1ead8", at(turn(b.capsule(0.012, 0.09), 0.2, 0.5, Math.PI / 2), 0.08, 0.012, 0.03), PAPER);
}

export function blueprints(b) {
  // A few rolled plans, tied, lying across each other
  for (const [x, y, z, r, len, rot] of [[0, 0.04, 0.02, 0.04, 0.34, 0.1], [0.02, 0.04, -0.06, 0.035, 0.3, -0.25], [-0.01, 0.105, -0.02, 0.035, 0.32, 0.4]]) {
    const roll = turn(b.cyl(r, r, len, 0.004), 0, 0, Math.PI / 2);
    roll.translate(len / 2, 0, 0);
    roll.translate(-len / 2, 0, 0);
    b.part("c1", at(turn(roll, 0, rot, 0), x + len * 0.0, y, z), PAPER);
    b.part("c2", at(turn(turn(b.ring(r + 0.002, 0.004), 0, Math.PI / 2, 0), 0, rot, 0), x, y, z), { family: "fabric" });
  }
}

export function ladder_library(b) {
  // A leaning ladder with rounded rungs, wheels at the bottom and hooks for the rail at the top
  const lean = 0.2;
  for (const sx of [-1, 1]) {
    b.part("c1", b.tube([[sx * 0.27, 0.03, 0.2], [sx * 0.24, 2.15, 0.2 - lean * 2.15 + 0.03]], 0.022), WOOD);
    b.part("#2d3038", at(turn(b.cyl(0.03, 0.03, 0.02, 0.006), 0, 0, Math.PI / 2), sx * 0.27, 0.03, 0.2), RUBBER);
    b.part("c2", b.tube([[sx * 0.24, 2.15, -0.2], [sx * 0.24, 2.2, -0.24], [sx * 0.24, 2.16, -0.25]], 0.008), BRASS);
  }
  const rungs = [];
  for (let i = 0; i < 7; i++) {
    const y = 0.3 + i * 0.28;
    rungs.push(at(turn(b.capsule(0.014, 0.5), 0, 0, Math.PI / 2), 0, y, 0.2 - lean * y + 0.004));
  }
  b.part("c1", mergeAll(rungs), WOOD);
}

// ---------- Sports ----------
export function hoop_basketball(b) {
  b.part("c1", at(b.box(0.5, 0.36, 0.02, 0.012), 0, 0.27, 0.01), GLOSS);
  const sq = b.rrect(0.2, 0.14, 0.01);
  sq.holes.push(new THREE.Path(b.rrect(0.17, 0.11, 0.006).getPoints(8).reverse()));
  b.part("c2", at(b.extrude(sq, 0.004, 0.0015), 0, 0.24, 0.02), GLOSS);
  b.part("c2", at(turn(b.ring(0.115, 0.008), Math.PI / 2, 0, 0), 0, 0.17, 0.15), GLOSS);
  b.part("c2", at(b.box(0.05, 0.016, 0.04, 0.005), 0, 0.17, 0.035), GLOSS);
  // A net of soft cords narrowing below the rim
  const cords = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    cords.push(b.tube([[Math.cos(a) * 0.112, 0.17, 0.15 + Math.sin(a) * 0.112], [Math.cos(a + 0.3) * 0.085, 0.09, 0.15 + Math.sin(a + 0.3) * 0.085], [Math.cos(a) * 0.07, 0.01, 0.15 + Math.sin(a) * 0.07]], 0.003, { segments: 4, roundEnds: false }));
  }
  b.part("#f6f2ea", mergeAll(cords), { family: "fabric" });
}

export function surfboard(b) {
  // Standing on its tail, leaning on the wall behind it
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.26, 0.1, 0.3, 1.2, 0, 2.0);
  s.bezierCurveTo(-0.3, 1.2, -0.26, 0.1, 0, 0);
  b.part("c1", at(turn(b.extrude(s, 0.055, 0.024), -0.03, 0, 0), 0, 0, 0.01), GLOSS);
  const stripe = new THREE.Shape();
  stripe.moveTo(-0.03, 0.1);
  stripe.lineTo(0.03, 0.1);
  stripe.lineTo(0.03, 1.85);
  stripe.lineTo(-0.03, 1.85);
  b.part("c2", at(turn(b.extrude(stripe, 0.004, 0.0015), -0.03, 0, 0), 0, 0, 0.066), GLOSS);
}

export function bike_mount(b) {
  // A road bike hung sideways on a wall bracket: two wheels, a diamond frame, bars and a saddle
  const z = 0.12;
  for (const x of [-0.5, 0.5]) {
    b.part("c2", at(b.ring(0.33, 0.014), x, 0.36, z), RUBBER);
    b.part("#c4c9d2", at(b.ring(0.31, 0.005), x, 0.36, z), CHROME);
    b.part("#c4c9d2", at(turn(b.cyl(0.02, 0.02, 0.03, 0.006), Math.PI / 2, 0, 0), x, 0.36, z), CHROME);
  }
  const F = [[-0.5, 0.36], [-0.12, 0.36], [-0.22, 0.78], [0.3, 0.8], [0.5, 0.36], [0.36, 0.86]];
  const bar = (a, c, r = 0.014) => b.tube([[F[a][0], F[a][1], z], [F[c][0], F[c][1], z]], r, { segments: 2 });
  b.part("c1", mergeAll([bar(0, 1), bar(1, 2), bar(2, 3), bar(1, 3), bar(0, 2, 0.01), bar(3, 5), bar(4, 5, 0.012)]), GLOSS);
  b.part("#2d3038", at(b.cushion(0.2, 0.04, 0.08, { puff: 0.3, round: 0.9 }), -0.25, 0.86, z), { family: "leather" });
  b.part("c1", b.tube([[-0.22, 0.78, z], [-0.24, 0.85, z]], 0.01, { segments: 2 }), GLOSS);
  b.part("#2d3038", b.tube([[0.36, 0.86, z - 0.12], [0.4, 0.88, z - 0.1], [0.4, 0.88, z + 0.1], [0.36, 0.86, z + 0.12]], 0.01), RUBBER);
  b.part("#c4c9d2", at(turn(b.cyl(0.07, 0.07, 0.008, 0.003), Math.PI / 2, 0, 0), -0.12, 0.36, z + 0.02), CHROME);
  // The bracket
  b.part("#2d3038", mergeAll([at(b.box(0.2, 0.06, 0.02, 0.008), 0.05, 0.84, 0.01), b.tube([[0.0, 0.84, 0.02], [0.0, 0.82, z + 0.04]], 0.01, { segments: 2 }), b.tube([[0.1, 0.84, 0.02], [0.1, 0.83, z + 0.04]], 0.01, { segments: 2 })]), METAL_BLACK);
}

export function skateboard(b) {
  const s = new THREE.Shape();
  s.moveTo(-0.3, -0.1);
  s.lineTo(0.3, -0.1);
  s.absarc(0.3, 0, 0.1, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-0.3, 0.1);
  s.absarc(-0.3, 0, 0.1, Math.PI / 2, -Math.PI / 2, false);
  b.part("c1", at(turn(b.extrude(s, 0.016, 0.006), -Math.PI / 2, 0, 0), 0, 0.085, 0), { family: "wood", finish: "painted" });
  for (const sx of [-1, 1]) {
    b.part("#c4c9d2", at(b.box(0.05, 0.03, 0.14, 0.008), sx * 0.24, 0.07, 0), STEEL);
    for (const sz of [-1, 1]) b.part("c2", at(turn(b.cyl(0.028, 0.028, 0.03, 0.01), Math.PI / 2, 0, 0), sx * 0.24, 0.028, sz * 0.09 - 0.015), { family: "plastic", rough: 0.5 });
  }
}

export function dumbbells(b) {
  for (const [z, r] of [[-0.07, 0], [0.07, 0.25]]) {
    const parts = [turn(b.capsule(0.014, 0.18), 0, 0, Math.PI / 2)];
    b.part("c2", at(turn(mergeAll(parts), 0, r, 0), 0, 0.055, z), STEEL);
    for (const sx of [-1, 1]) {
      const head = turn(b.cyl(0.055, 0.055, 0.07, 0.016), 0, 0, Math.PI / 2);
      head.translate(sx * 0.115 + 0.035 * 0, 0, 0);
      b.part("c1", at(turn(head, 0, r, 0), 0, 0.055, z), { family: "rubber", rough: 0.7 });
    }
  }
}

export function kettlebell(b) {
  b.part("c1", at(b.ball(0.1, { squash: 0.95 }), 0, 0.095, 0), { family: "metal", finish: "black", rough: 0.7 });
  b.part("c1", at(b.cyl(0.05, 0.06, 0.02, 0.006), 0, 0, 0), { family: "metal", finish: "black", rough: 0.7 });
  b.part("c2", b.tube([[-0.06, 0.16, 0], [-0.075, 0.25, 0], [0, 0.28, 0], [0.075, 0.25, 0], [0.06, 0.16, 0]], 0.016), { family: "rubber", rough: 0.6 });
}

export function trophy(b) {
  b.part("c2", at(b.box(0.12, 0.06, 0.12, 0.014), 0, 0.03, 0), WOOD_LAQ);
  b.part("c1", b.lathe([[0, 0.06], [0.04, 0.06], [0.045, 0.075], [0.012, 0.1], [0.012, 0.17], [0.03, 0.2], [0.075, 0.33], [0.08, 0.36], [0.07, 0.36], [0.02, 0.22], [0, 0.21]], [0, 0.004, 0.008, 0.012, 0.01, 0.02, 0.03, 0.006, 0.006, 0.03, 0]), BRASS);
  for (const sx of [-1, 1]) b.part("c1", b.tube([[sx * 0.066, 0.33, 0], [sx * 0.11, 0.31, 0], [sx * 0.1, 0.24, 0], [sx * 0.05, 0.225, 0]], 0.007), BRASS);
  b.part("#f1ead8", at(b.box(0.07, 0.025, 0.003, 0.001), 0, 0.03, 0.061), BRASS);
}

export function football(b) {
  b.part("c1", at(b.ball(0.11), 0, 0.11, 0), { family: "leather", rough: 0.5 });
  // Dark patches spread evenly over the ball
  const patches = [];
  const dirs = [[0, 1, 0], [0, -1, 0]];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    dirs.push([Math.cos(a) * 0.894, 0.447, Math.sin(a) * 0.894], [Math.cos(a + 0.63) * 0.894, -0.447, Math.sin(a + 0.63) * 0.894]);
  }
  for (const d of dirs) {
    const p = b.cyl(0.036, 0.036, 0.003, 0.0012);
    p.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d).normalize()));
    p.translate(d[0] * 0.1085, 0.11 + d[1] * 0.1085, d[2] * 0.1085);
    patches.push(p);
  }
  b.part("c2", mergeAll(patches), { family: "leather", rough: 0.5 });
}
