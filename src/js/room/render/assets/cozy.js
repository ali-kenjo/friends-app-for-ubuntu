// Cozy pieces the Living room needs beyond the hero set: string lights, a fireplace, a sleeping cat,
// a record player and a kettle.
import * as THREE from "three";
import { at, turn } from "../kit/build.js";

const SATIN = { family: "plastic" };
const WOOD = { family: "wood" };
const STONE = { family: "clay", map: "stone", scale: 2.2, relief: 0.8 };

// String lights: a soft catenary of wire with glowing bulbs (one wire mesh, one bulb mesh)
export function string_lights(b) {
  const W = 3.0;
  const sag = 0.32;
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    pts.push([-W / 2 + t * W, 0.4 - sag * Math.sin(t * Math.PI), 0.04 + 0.02 * Math.sin(t * Math.PI)]);
  }
  b.part("c2", b.tube(pts, 0.004, { roundEnds: false }), { family: "rubber" });
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const on = b.state.on !== false;
  for (let i = 1; i < 20; i++) {
    const p = curve.getPointAt(i / 20);
    b.part("#3a3a3a", at(b.cyl(0.008, 0.008, 0.016, 0.003), p.x, p.y - 0.02, p.z), SATIN);
    b.glow(on ? "c1" : "#6a5a40", at(b.ball(0.022, { squash: 1.25 }), p.x, p.y - 0.045, p.z), { intensity: on ? 2.4 : 0.05 });
  }
}

// A stone fireplace with a wooden mantel, logs and a flickering fire
export function fireplace(b) {
  const W = 1.4, H = 1.15, D = 0.5;
  // The surround: two stone piers and a lintel, rounded like river stones set in mortar
  for (const sx of [-1, 1]) b.part("c1", at(b.box(0.3, H - 0.1, D, 0.04, { along: "y" }), sx * (W / 2 - 0.15), (H - 0.1) / 2, 0), STONE);
  b.part("c1", at(b.box(W, 0.3, D, 0.04), 0, H - 0.1 - 0.15 - 0.0, 0), STONE);
  b.part("c1", at(b.box(W + 0.06, 0.08, D + 0.06, 0.03), 0, 0.04, 0.03), STONE);
  // The dark firebox and a soft hearth glow
  b.part("#1e1714", at(b.box(W - 0.6, H - 0.48, D - 0.12, 0.03), 0, (H - 0.48) / 2 + 0.08, -0.06), { family: "clay", rough: 0.95, map: false });
  // The mantel shelf
  b.part("c2", at(b.box(W + 0.14, 0.07, D * 0.66, 0.025), 0, H - 0.035, 0.0), { family: "wood", finish: "lacquered" });
  // Logs, crossed
  for (const [x, r] of [[-0.12, 0.35], [0.1, -0.3], [0, 0]]) {
    const log = turn(b.capsule(0.045, 0.32), Math.PI / 2, r, 0);
    b.part("#6b4a34", at(log, x, 0.14 + (r === 0 ? 0.07 : 0), 0.0), { family: "wood", rough: 0.85 });
  }
  if (b.state.on !== false) {
    // Flames: three soft tongues that flicker (they glow and bloom; the room light comes from the practical light)
    const flame = (h, x, z, color) => {
      const g = b.lathe([[0, 0], [0.06, 0.03], [0.05, h * 0.5], [0.0, h]], [0, 0.02, 0.03, 0]);
      const m = b.moving(color, g, { family: "emissive", intensity: 2.6 }, "");
      m.position.set(x, 0.16, z);
      return m;
    };
    const flames = [flame(0.3, 0, 0.02, "#ffb347"), flame(0.22, -0.09, 0.0, "#ff8542"), flame(0.24, 0.1, -0.01, "#ff9a4a")];
    const core = flame(0.16, 0, 0.04, "#fff0b0");
    b.onUpdate((dt, t, fx) => {
      const k = fx?.reduced ? 0 : 1;
      flames.forEach((f, i) => {
        f.scale.set(1 + 0.08 * Math.sin(t * 9 + i) * k, 1 + 0.18 * Math.sin(t * 7.3 + i * 2) * k, 1);
        f.rotation.z = 0.06 * Math.sin(t * 5 + i * 3) * k;
      });
      core.scale.y = 1 + 0.12 * Math.sin(t * 11) * k;
    });
  }
}

// A cat asleep, curled up, tail around its paws; its side rises and falls
export function cat(b) {
  const FUR = { family: "fabric", finish: "velvet", scale: 4 };
  const body = b.cushion(0.36, 0.15, 0.26, { puff: 0.35, round: 1, seed: 4 });
  const bodyMesh = b.moving("c1", at(body, 0, 0.1, 0), FUR, "body");
  b.part("c1", at(b.ball(0.075, { squash: 0.85 }), 0.15, 0.09, 0.07), FUR);
  for (const sx of [-1, 1]) {
    const ear = b.lathe([[0, 0], [0.025, 0], [0, 0.04]], [0, 0.006, 0]);
    turn(ear, 0, 0, sx * 0.3 - 0.4);
    b.part("c1", at(ear, 0.17, 0.145, 0.07 + sx * 0.035), FUR);
  }
  // Stripes in the second color across the back
  for (let i = 0; i < 4; i++) b.part("c2", at(turn(b.capsule(0.012, 0.16), Math.PI / 2, 0, 0), -0.1 + i * 0.06, 0.18, 0), FUR);
  b.part("c1", b.tube([[-0.16, 0.04, -0.02], [-0.12, 0.03, 0.12], [0.02, 0.025, 0.15], [0.12, 0.03, 0.12]], 0.022), FUR);
  b.onUpdate((dt, t, fx) => {
    const k = fx?.reduced ? 0 : 1;
    bodyMesh.scale.set(1, 1 + 0.035 * Math.sin(t * 1.4) * k, 1 + 0.02 * Math.sin(t * 1.4) * k);
  });
}

// A record player: a wooden plinth, a platter with a record and a tonearm; the record turns when on
export function turntable(b) {
  b.part("c1", at(b.box(0.45, 0.08, 0.35, 0.02), 0, 0.04, 0), { family: "wood", finish: "lacquered" });
  b.part("c2", at(b.cyl(0.15, 0.15, 0.02, 0.006), -0.05, 0.08, 0), { family: "metal", finish: "brushed" });
  const record = b.moving("#1a1a1e", b.lathe([[0.006, 0], [0.145, 0], [0.145, 0.004], [0.006, 0.004]], [0, 0.002, 0.002, 0]), { family: "plastic", finish: "gloss" }, "record");
  record.position.set(-0.05, 0.1, 0);
  b.part("#e05a47", at(b.cyl(0.04, 0.04, 0.0045, 0.0015), -0.05, 0.1, 0), { family: "paper", map: false });
  b.part("#c4c9d2", b.tube([[0.16, 0.12, -0.12], [0.15, 0.125, 0.02], [0.05, 0.11, 0.06]], 0.005), { family: "metal", finish: "polished" });
  b.part("#2d3038", at(b.cyl(0.022, 0.022, 0.04, 0.006), 0.16, 0.08, -0.12), SATIN);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.part("#2d3038", at(b.cyl(0.018, 0.016, 0.012, 0.004), sx * 0.19, -0.0, sz * 0.14), { family: "rubber" });
  if (b.state.on) b.onUpdate((dt, t, fx) => (record.rotation.y = fx?.reduced ? 0 : -t * 3.5));
}

// A round enamel kettle with a wooden handle; a thread of steam
export function kettle(b) {
  b.part("c1", b.lathe([[0, 0], [0.085, 0], [0.1, 0.05], [0.095, 0.12], [0.06, 0.16], [0.03, 0.17], [0, 0.17]], [0, 0.015, 0.03, 0.03, 0.015, 0.01, 0]), { family: "ceramic", rough: 0.3 });
  b.part("c1", b.tube([[0.08, 0.06, 0], [0.13, 0.11, 0], [0.16, 0.15, 0]], 0.014), { family: "ceramic", rough: 0.3 });
  b.part("c2", at(b.ball(0.016), 0, 0.18, 0), WOOD);
  b.part("c2", b.tube([[-0.06, 0.15, 0], [-0.03, 0.24, 0], [0.04, 0.24, 0], [0.06, 0.15, 0]], 0.011), WOOD);
}

// Three pillar candles of different heights with soft, flickering flames
export function candles(b) {
  const on = b.state.on !== false;
  const flames = [];
  for (const [x, z, h, r] of [[-0.06, 0.01, 0.16, 0.034], [0.04, -0.02, 0.21, 0.038], [0.08, 0.045, 0.12, 0.03]]) {
    b.part("c1", at(b.lathe([[0, 0], [r, 0], [r, h - 0.006], [r - 0.008, h], [0.004, h - 0.004], [0, h - 0.006]], [0, 0.004, 0.006, 0.004, 0.002, 0]), x, 0, z), { family: "clay", rough: 0.6, map: false });
    b.part("#2d2420", at(b.cyl(0.0015, 0.0015, 0.012, 0.0005), x, h - 0.006, z), { family: "rubber" });
    if (on) {
      const f = b.moving("c2", b.lathe([[0, 0], [0.008, 0.01], [0.006, 0.02], [0, 0.034]], [0, 0.003, 0.004, 0]), { family: "emissive", intensity: 3 }, "");
      f.position.set(x, h + 0.003, z);
      flames.push(f);
    }
  }
  b.onUpdate((dt, t, fx) => {
    const k = fx?.reduced ? 0 : 1;
    flames.forEach((f, i) => {
      f.scale.y = 1 + 0.15 * Math.sin(t * 13 + i * 2.1) * k;
      f.rotation.z = 0.08 * Math.sin(t * 7 + i) * k;
    });
  });
}
