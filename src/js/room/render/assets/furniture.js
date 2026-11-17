// Furniture of the hero set: desks, tables, chairs, the sofa, the armchair, the pouf, shelves and the bed.
// Chunky proportions, rounded everywhere, joints capped; meters, origin at the bottom centre, +z is the front.
import * as THREE from "three";
import { at, turn } from "../kit/build.js";

const WOOD = { family: "wood" };
const WOOD_LAQ = { family: "wood", finish: "lacquered" };
const METAL_BLACK = { family: "metal", finish: "black", rough: 0.38 };
const SATIN = { family: "plastic" };
const FABRIC = { family: "fabric" };

// A tapered leg standing on the floor with a soft foot, from y0 to y1
export function _leg(b, x, z, y0, y1, rTop, rBot, { splay = 0, spec = WOOD, slot = "c2" } = {}) {
  const g = b.cyl(rTop, rBot, y1 - y0, Math.min(rBot, rTop) * 0.45);
  if (splay) turn(g, splay * Math.sign(z || 1), 0, -splay * Math.sign(x || 1));
  at(g, x, y0, z);
  b.part(slot, g, spec);
}

// ---------- Desks and tables ----------
export function desk_writing(b) {
  const W = 1.4, D = 0.7, H = 0.76, T = 0.055;
  // A thick top with a soft edge
  b.part("c1", at(b.box(W, T, D, 0.02), 0, H - T / 2, 0), WOOD_LAQ);
  // An apron under the top, and a drawer with a big round knob
  b.part("c1", at(b.box(W - 0.14, 0.09, D - 0.12, 0.012), 0, H - T - 0.045, -0.01), WOOD);
  b.part("c1", at(b.box(0.46, 0.075, 0.03, 0.01), 0.22, H - T - 0.048, D / 2 - 0.055), WOOD_LAQ);
  b.part("#d9b25a", at(b.ball(0.016, { squash: 0.8 }), 0.22, H - T - 0.048, D / 2 - 0.035), { family: "metal", finish: "polished" });
  // Tapered legs, splayed a little; a cap where each meets the apron
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (W / 2 - 0.1);
      const z = sz * (D / 2 - 0.09);
      _leg(b, x, z, 0, H - T - 0.03, 0.026, 0.017, { splay: 0.04, spec: METAL_BLACK });
      b.part("c2", at(b.cyl(0.034, 0.034, 0.03, 0.01), x, H - T - 0.04, z), METAL_BLACK);
    }
  }
}

export function desk_standing(b) {
  const W = 1.2, D = 0.65, H = 1.05, T = 0.045;
  b.part("c1", at(b.box(W, T, D, 0.018), 0, H - T / 2, 0), WOOD_LAQ);
  // Two telescopic columns on long round feet, joined by a crossbar under the top
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.16);
    b.part("c2", at(b.box(0.075, H - T - 0.06, 0.055, 0.014), x, (H - T - 0.06) / 2 + 0.05, 0), METAL_BLACK);
    b.part("c2", at(b.box(0.062, 0.32, 0.045, 0.012), x, H - T - 0.2, 0), { family: "metal", finish: "brushed" });
    b.part("c2", at(turn(b.capsule(0.03, D - 0.1), Math.PI / 2, 0, 0), x, 0.03, 0), METAL_BLACK);
    b.part("#1c1d22", at(b.box(0.05, 0.012, 0.05, 0.005), x, 0.006, D / 2 - 0.08), { family: "rubber" });
    b.part("#1c1d22", at(b.box(0.05, 0.012, 0.05, 0.005), x, 0.006, -D / 2 + 0.08), { family: "rubber" });
  }
  b.part("c2", at(b.box(W - 0.36, 0.05, 0.06, 0.014), 0, H - T - 0.05, 0), METAL_BLACK);
  // A little control pad at the front edge
  b.part("#2a2c33", at(b.box(0.12, 0.022, 0.05, 0.008), W / 2 - 0.2, H - T - 0.012, D / 2 - 0.01), SATIN);
  b.glow("#7fd3ff", at(b.box(0.016, 0.006, 0.012, 0.003), W / 2 - 0.17, H - T - 0.0, D / 2 + 0.003), { intensity: 1.2 });
}

export function table_side(b) {
  const H = 0.55;
  b.part("c1", b.lathe([[0, H - 0.04], [0.235, H - 0.04], [0.24, H - 0.02], [0.232, H], [0, H]], [0, 0.012, 0.012, 0]), WOOD_LAQ);
  // A tapered pedestal on a soft round foot
  b.part("c2", b.lathe([[0, 0], [0.16, 0], [0.165, 0.018], [0.13, 0.035], [0.04, 0.06], [0.03, H - 0.06], [0.06, H - 0.04], [0, H - 0.04]], [0, 0.006, 0.01, 0.02, 0.02, 0.01, 0.008, 0]), METAL_BLACK);
}

// A pebble shape (a superellipse), for the coffee table top
function pebble(w, d, n = 2.6, steps = 64) {
  const s = new THREE.Shape();
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const x = (w / 2) * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const y = (d / 2) * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n) * (1 + 0.04 * Math.sin(a * 2 + 0.6));
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  return s;
}

export function table_coffee(b) {
  const W = 1.1, D = 0.6, H = 0.42, T = 0.05;
  const top = turn(b.extrude(pebble(W, D), T, 0.018), -Math.PI / 2, 0, 0);
  b.part("c1", at(top, 0, H - T, 0), WOOD_LAQ);
  // A lower shelf, and four chunky round legs
  const shelf = turn(b.extrude(pebble(W * 0.78, D * 0.7), 0.028, 0.01), -Math.PI / 2, 0, 0);
  b.part("c1", at(shelf, 0, 0.11, 0), WOOD);
  for (const [x, z] of [[-0.36, -0.15], [0.36, -0.15], [-0.36, 0.15], [0.36, 0.15]]) _leg(b, x, z, 0, H - T, 0.03, 0.026, { spec: WOOD, slot: "c2" });
}

// ---------- Chairs ----------
export function chair_office(b) {
  const seatY = 0.47;
  // Five-star base with soft round casters
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    const arm = turn(b.capsule(0.022, 0.25), 0, 0, Math.PI / 2);
    turn(arm, 0, -a, 0);
    b.part("c2", at(arm, Math.cos(a) * 0.15, 0.07, Math.sin(a) * 0.15), SATIN);
    b.part("#1c1d22", at(b.ball(0.028), Math.cos(a) * 0.28, 0.028, Math.sin(a) * 0.28), { family: "rubber" });
  }
  b.part("c2", at(b.cyl(0.05, 0.06, 0.06, 0.015), 0, 0.05, 0), SATIN);
  // Gas lift and the seat's tilt plate
  b.part("#9aa0aa", at(b.cyl(0.022, 0.022, seatY - 0.16, 0.006), 0, 0.1, 0), { family: "metal", finish: "polished" });
  b.part("c2", at(b.box(0.24, 0.04, 0.22, 0.012), 0, seatY - 0.07, 0), SATIN);
  // A thick, rounded seat cushion and a curved back cushion
  b.part("c1", at(b.cushion(0.5, 0.1, 0.48, { puff: 0.25, round: 0.7 }), 0, seatY - 0.02, 0.01), { family: "fabric", finish: "wool" });
  const back = b.cushion(0.46, 0.5, 0.085, { puff: 0.3, round: 0.75 });
  turn(back, -0.14, 0, 0);
  b.part("c1", at(back, 0, seatY + 0.33, -0.22), { family: "fabric", finish: "wool" });
  // The back's spine, and armrests with soft pads
  b.part("c2", at(turn(b.box(0.06, 0.4, 0.03, 0.012), -0.12, 0, 0), 0, seatY + 0.12, -0.26), SATIN);
  for (const sx of [-1, 1]) {
    b.part("c2", b.tube([[sx * 0.2, seatY - 0.05, -0.02], [sx * 0.27, seatY + 0.08, 0.0], [sx * 0.27, seatY + 0.18, 0.02]], 0.014), SATIN);
    b.part("c2", at(b.box(0.07, 0.03, 0.24, 0.013), sx * 0.27, seatY + 0.2, 0.03), { family: "plastic", rough: 0.6 });
  }
}

export function chair_dining(b) {
  const seatY = 0.45;
  for (const sx of [-1, 1]) {
    // Back legs rise into the back posts, front legs taper
    b.part("c1", b.tube([[sx * 0.19, 0.0, -0.2], [sx * 0.19, seatY, -0.205], [sx * 0.185, 0.84, -0.26]], 0.017), WOOD);
    _leg(b, sx * 0.19, 0.19, 0, seatY - 0.02, 0.019, 0.015, { spec: WOOD, slot: "c1" });
  }
  // Stretchers between the legs
  b.part("c1", at(turn(b.capsule(0.01, 0.34), 0, 0, Math.PI / 2), 0, 0.16, 0.19), WOOD);
  b.part("c1", at(turn(b.capsule(0.01, 0.34), 0, 0, Math.PI / 2), 0, 0.16, -0.2), WOOD);
  // A curved top rail and a slat
  const rail = b.tube([[-0.2, 0.8, -0.24], [0, 0.82, -0.28], [0.2, 0.8, -0.24]], 0.03, { roundEnds: true });
  b.part("c1", rail, WOOD_LAQ);
  b.part("c1", b.tube([[-0.19, 0.62, -0.22], [0, 0.63, -0.25], [0.19, 0.62, -0.22]], 0.012), WOOD);
  // The seat frame and its cushion
  b.part("c1", at(b.box(0.44, 0.04, 0.44, 0.012), 0, seatY - 0.04, 0), WOOD);
  b.part("c2", at(b.cushion(0.42, 0.06, 0.42, { puff: 0.35, round: 0.8 }), 0, seatY + 0.005, 0.005), FABRIC);
}

export function sofa(b) {
  const W = 2.0, D = 0.9, seatY = 0.45;
  // The upholstered base: a long soft block on short legs
  b.part("c1", at(b.cushion(W - 0.04, 0.24, D - 0.04, { puff: 0.08, round: 0.4 }), 0, 0.22, 0), FABRIC);
  // Rolled arms
  for (const sx of [-1, 1]) {
    b.part("c1", at(b.cushion(0.2, 0.42, D - 0.02, { puff: 0.15, round: 0.9 }), sx * (W / 2 - 0.1), 0.42, 0.0), FABRIC);
  }
  // The back
  b.part("c1", at(turn(b.cushion(W - 0.36, 0.4, 0.2, { puff: 0.1, round: 0.7 }), -0.08, 0, 0), 0, 0.56, -D / 2 + 0.12), FABRIC);
  // Two seat cushions and two back cushions (plump, a little irregular)
  for (const sx of [-1, 1]) {
    b.part("c2", at(b.cushion(0.8, 0.14, 0.62, { puff: 0.35, round: 0.65, seed: 3 + sx, sag: 0.08 }), sx * 0.405, seatY - 0.03, 0.08), { family: "fabric", finish: "boucle", scale: 1.4 });
    b.part("c2", at(turn(b.cushion(0.78, 0.36, 0.17, { puff: 0.4, round: 0.8, seed: 7 + sx }), -0.22, 0, 0), sx * 0.4, 0.64, -D / 2 + 0.26), { family: "fabric", finish: "boucle", scale: 1.4 });
  }
  // Tapered wooden legs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) _leg(b, sx * (W / 2 - 0.12), sz * (D / 2 - 0.12), 0, 0.11, 0.025, 0.018, { spec: WOOD, slot: "c3" });
}

export function armchair(b) {
  const seatY = 0.44;
  // A rounded tub: the back and arms are one soft wrap around a deep seat
  const wrap = b.tube(
    [
      [-0.36, 0.36, 0.3],
      [-0.4, 0.5, 0.05],
      [-0.33, 0.6, -0.25],
      [0, 0.66, -0.36],
      [0.33, 0.6, -0.25],
      [0.4, 0.5, 0.05],
      [0.36, 0.36, 0.3],
    ],
    0.1,
    { roundEnds: true, segments: 96 },
  );
  b.part("c1", wrap, { family: "fabric", finish: "boucle", scale: 1.5 });
  b.part("c1", at(b.cushion(0.82, 0.3, 0.74, { puff: 0.12, round: 0.85 }), 0, 0.27, -0.02), { family: "fabric", finish: "boucle", scale: 1.5 });
  b.part("c1", at(b.cushion(0.6, 0.12, 0.56, { puff: 0.4, round: 0.85, sag: 0.06 }), 0, seatY, 0.05), { family: "fabric", finish: "boucle", scale: 1.5 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) _leg(b, sx * 0.3, sz * 0.27, 0, 0.12, 0.022, 0.016, { spec: WOOD, slot: "c2", splay: 0.08 });
}

export function pouf(b) {
  // A plump knitted drum
  b.part("c1", b.lathe([[0, 0], [0.22, 0], [0.265, 0.05], [0.278, 0.2], [0.265, 0.35], [0.22, 0.4], [0, 0.4]], [0, 0.05, 0.05, 0.08, 0.05, 0.05, 0]), { family: "fabric", finish: "knit", scale: 1 });
}

// ---------- Storage ----------
const BOOK_TINTS = ["#ffffff", "#f0d7a8", "#b9d4c6", "#c9c3e6", "#e8b8a8", "#a8c4e0", "#f2e6c8", "#d6a6a6", "#9fb8a0"];

// Books standing on a shelf from x0 to x1 at height y (tinted copies of the "Books" color, one mesh)
export function _books(b, x0, x1, y, depth, maxH, { slot = "c2", lean = true } = {}) {
  let x = x0;
  let i = 0;
  while (x < x1 - 0.03) {
    const w = 0.024 + b.rand() * 0.03;
    const h = Math.min(maxH, 0.18 + b.rand() * 0.11);
    const d = depth * (0.72 + b.rand() * 0.2);
    if (x + w > x1) break;
    const { cover, pages } = b.book(w, h, d);
    const tilt = lean && i > 3 && b.rand() < 0.08 ? 0.18 : 0;
    for (const g of [cover, pages]) {
      if (tilt) g.rotateZ(-tilt);
      at(g, x + w / 2 + (tilt ? 0.02 : 0), y + h / 2, 0);
    }
    b.part(slot, cover, { family: "paper", rough: 0.7, map: false }, { tint: BOOK_TINTS[Math.floor(b.rand() * BOOK_TINTS.length)] });
    b.part("#f1ead8", pages, { family: "paper" });
    x += w + 0.003 + (tilt ? 0.03 : 0);
    i++;
  }
}

export function bookcase(b) {
  const W = 1.1, D = 0.34, H = 2.0, t = 0.032;
  for (const sx of [-1, 1]) b.part("c1", at(b.box(t, H, D, 0.01, { along: "y" }), sx * (W / 2 - t / 2), H / 2, 0), WOOD);
  b.part("c1", at(b.box(W, t, D + 0.01, 0.01), 0, H - t / 2, 0), WOOD_LAQ);
  // A plinth set back a little, and the back panel
  b.part("c1", at(b.box(W - 0.04, 0.07, D - 0.04, 0.01), 0, 0.035, 0.0), WOOD);
  b.part("c1", at(b.box(W - 0.03, H - 0.06, 0.012, 0.004, { along: "y" }), 0, H / 2, -D / 2 + 0.008), { family: "wood", seed: 3 });
  const levels = [0.07, 0.55, 1.05, 1.55];
  for (const y of levels.slice(1)) b.part("c1", at(b.box(W - 2 * t, 0.026, D - 0.02, 0.008), 0, y - 0.013, 0.005), WOOD);
  b.part("c1", at(b.box(W - 2 * t, 0.026, D - 0.02, 0.008), 0, 0.07 + 0.013, 0.005), WOOD);
  // Books on every shelf, leaving room for a few things of yours
  _books(b, -W / 2 + t + 0.01, W / 2 - t - 0.05, 0.096, D - 0.06, 0.4);
  _books(b, -W / 2 + t + 0.01, 0.12, 0.55, D - 0.06, 0.42);
  _books(b, -0.05, W / 2 - t - 0.01, 1.05, D - 0.06, 0.42);
  _books(b, -W / 2 + t + 0.01, -0.1, 1.55, D - 0.06, 0.38);
  // A couple of lying books as bookends
  const stack = b.box(0.2, 0.035, 0.24, 0.006);
  b.part("c2", at(stack, 0.33, 0.57, 0), { family: "paper", rough: 0.7, map: false }, { tint: "#d6a6a6" });
}

export function shelf_low(b) {
  const W = 1.2, D = 0.38, H = 0.8, t = 0.03;
  b.part("c1", at(b.box(W, t, D, 0.012), 0, H - t / 2, 0), WOOD_LAQ);
  for (const sx of [-1, 1]) b.part("c1", at(b.box(t, H - t - 0.06, D - 0.01, 0.01, { along: "y" }), sx * (W / 2 - t / 2), (H - t) / 2 + 0.03, 0), WOOD);
  b.part("c1", at(b.box(W, t, D - 0.01, 0.01), 0, 0.06 + t / 2, 0), WOOD);
  b.part("c1", at(b.box(W - 2 * t, 0.026, D - 0.03, 0.008), 0, 0.4, 0.005), WOOD);
  b.part("c1", at(b.box(t * 0.9, H - 0.12, D - 0.03, 0.008, { along: "y" }), 0, H / 2 + 0.01, 0.004), WOOD);
  // Inside: a back in the second color
  b.part("c2", at(b.box(W - 0.05, H - 0.1, 0.012, 0.004), 0, H / 2 + 0.02, -D / 2 + 0.01), { family: "clay", rough: 0.7 });
  // Four soft feet
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.part("c1", at(b.cyl(0.022, 0.018, 0.06, 0.008), sx * (W / 2 - 0.06), 0, sz * (D / 2 - 0.06)), WOOD);
  // A woven basket in one cubby, books in the other
  b.part("#c9a77a", at(b.cushion(0.4, 0.22, 0.28, { puff: 0.05, round: 0.35 }), -0.29, 0.21, 0.02), { family: "fabric", finish: "knit", scale: 1.6 });
  _books(b, 0.04, 0.5, 0.413, D - 0.08, 0.3);
}

export function bed(b) {
  const W = 1.5, L = 2.1;
  // A wooden frame on stubby legs, a headboard with a soft top edge
  b.part("c3", at(b.box(W, 0.18, L, 0.03), 0, 0.2, 0.05), WOOD);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) _leg(b, sx * (W / 2 - 0.08), 0.05 + sz * (L / 2 - 0.08), 0, 0.12, 0.035, 0.03, { spec: WOOD, slot: "c3" });
  b.part("c3", at(b.box(W + 0.04, 0.9, 0.08, 0.035), 0, 0.55, -L / 2 + 0.05), WOOD_LAQ);
  // The mattress, the duvet folded back at the top, and two plump pillows
  b.part("#f2efe8", at(b.cushion(W - 0.08, 0.2, L - 0.12, { puff: 0.15, round: 0.5 }), 0, 0.39, 0.1), FABRIC);
  b.part("c1", at(b.cushion(W - 0.02, 0.1, L * 0.66, { puff: 0.3, round: 0.9, seed: 5 }), 0, 0.53, 0.4), { family: "fabric", finish: "wool", scale: 1.2 });
  b.part("c1", at(turn(b.cushion(W - 0.02, 0.06, 0.26, { puff: 0.4, round: 0.95, seed: 6 }), 0.1, 0, 0), 0, 0.56, -0.02), { family: "fabric", finish: "wool", scale: 1.2 });
  for (const sx of [-1, 1]) b.part("c2", at(turn(b.cushion(0.6, 0.16, 0.38, { puff: 0.6, round: 0.95, seed: 9 + sx }), -0.35, sx * 0.05, 0), sx * 0.34, 0.6, -L / 2 + 0.33), FABRIC);
}
