// ---------- The geometry kit: soft, rounded shapes for every room asset ----------
// Nothing has a hard edge (docs/design/room.md, "Art direction"): boxes are rounded (8–15 % of the
// smallest side, at least 4 mm), discs and cylinders have filleted rims, curves have enough segments and
// creased normals keep intended edges crisp. Every helper takes the tier for its segment counts.
//
// UVs are in meters (one unit = one meter, so texel density is the same across a room); `along` turns
// them so a texture's u runs along the piece's long side (wood grain follows each board).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, mergeVertices, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

// Segments by quality tier: curved profiles, bevels
export const TIERS = {
  ultra: { curve: 56, bevel: 5, detail: 1.25 },
  high: { curve: 48, bevel: 4, detail: 1 },
  medium: { curve: 32, bevel: 3, detail: 0.75 },
  low: { curve: 16, bevel: 2, detail: 0.5 },
};
// Settings → Robot → Graphics → Geometry detail: how round curved things are (null: the quality's own)
let geometryLevel = null;
export function setGeometryDetail(level) {
  geometryLevel = TIERS[level] ? level : null;
}
export const tierOf = (level) => TIERS[geometryLevel || level] || TIERS.high;

const CREASE = (35 * Math.PI) / 180;
export const MIN_RADIUS = 0.004;

// A bevel radius that follows the art rules: 8–15 % of the smallest side, never under 4 mm
export function bevelFor(w, h, d, k = 0.12) {
  const s = Math.min(w, h, d);
  return Math.max(MIN_RADIUS, Math.min(s * k, s / 2 - 0.0005));
}

// ---------- Finishing ----------
// UVs in meters by the dominant normal axis; `along` ("x" | "y" | "z") is where u runs
export function boxUV(geo, { along = "x", scale = 1, offset = [0, 0] } = {}) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    let u;
    let v;
    if (ay >= ax && ay >= az) {
      // top/bottom: u along the long axis, v across
      [u, v] = along === "z" ? [z, x] : [x, z];
    } else if (ax >= az) {
      [u, v] = along === "y" ? [y, z] : [z, y];
    } else {
      [u, v] = along === "y" ? [y, x] : [x, y];
    }
    uv[i * 2] = u * scale + offset[0];
    uv[i * 2 + 1] = v * scale + offset[1];
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Smooth curves, crisp intended edges; always non-indexed afterwards (ready to merge)
export function crease(geo, angle = CREASE) {
  const out = toCreasedNormals(geo, angle);
  if (out !== geo) geo.dispose();
  return out;
}

// Ambient occlusion baked into vertex colors for the Low tier: darker near the floor and underneath
export function bakeAO(geo, { ground = 0, strength = 0.38, under = 0.16 } = {}) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const h = Math.max(0, pos.getY(i) - ground);
    let ao = 1 - strength * Math.exp(-h / 0.07);
    if (nor && nor.getY(i) < -0.4) ao -= under;
    ao = Math.max(0.45, Math.min(1, ao));
    col.set([ao, ao, ao], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}

// Merges pieces into one geometry (same attributes needed: position, normal, uv, color?)
export function merge(list) {
  const flat = list.filter(Boolean).map((g) => (g.index ? g.toNonIndexed() : g));
  const names = new Set(Object.keys(flat[0].attributes));
  for (const g of flat) {
    for (const n of names) if (!g.attributes[n]) names.delete(n);
  }
  for (const g of flat) for (const n of Object.keys(g.attributes)) if (!names.has(n)) g.deleteAttribute(n);
  const out = mergeGeometries(flat, false);
  for (const g of list) if (g && g !== out) g.dispose();
  return out;
}

// Indexed again (fewer vertices for the GPU), with tangents for normal-mapped materials
export function compact(geo, { tangents = false } = {}) {
  const out = mergeVertices(geo, 1e-5);
  if (out !== geo) geo.dispose();
  if (tangents && out.index && out.attributes.uv && out.attributes.normal) out.computeTangents();
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

// ---------- Shapes ----------
// A rounded box centred at its middle (move it with .translate)
export function roundedBox(w, h, d, r = bevelFor(w, h, d), tier = TIERS.high, { along } = {}) {
  const radius = Math.max(MIN_RADIUS * 0.5, Math.min(r, Math.min(w, h, d) / 2 - 0.0005));
  // A tiny bevel needs few segments (stickers, keys, page edges)
  const segs = radius < 0.004 ? 1 : radius < 0.008 ? Math.min(2, tier.bevel) : tier.bevel;
  const geo = new RoundedBoxGeometry(w, h, d, segs, radius);
  boxUV(geo, { along: along || (w >= d && w >= h ? "x" : d >= h ? "z" : "y") });
  return crease(geo);
}

// A profile [[r, y], …] turned around the y axis; each corner can be rounded (fillets: radius per point or one number)
export function roundProfile(points, fillets = 0, steps = 4) {
  const out = [];
  const f = (i) => (Array.isArray(fillets) ? fillets[i] || 0 : fillets);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const r = f(i);
    if (!r || i === 0 || i === points.length - 1) {
      out.push(new THREE.Vector2(p[0], p[1]));
      continue;
    }
    const a = new THREE.Vector2(...points[i - 1]);
    const b = new THREE.Vector2(...p);
    const c = new THREE.Vector2(...points[i + 1]);
    const ba = a.clone().sub(b);
    const bc = c.clone().sub(b);
    const la = ba.length();
    const lc = bc.length();
    const t = Math.min(r, la * 0.49, lc * 0.49);
    const p0 = b.clone().add(ba.normalize().multiplyScalar(t));
    const p2 = b.clone().add(bc.normalize().multiplyScalar(t));
    // A quadratic curve through the corner: smooth, and never past the neighbouring points
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const x = (1 - u) * (1 - u) * p0.x + 2 * (1 - u) * u * b.x + u * u * p2.x;
      const y = (1 - u) * (1 - u) * p0.y + 2 * (1 - u) * u * b.y + u * u * p2.y;
      out.push(new THREE.Vector2(Math.max(0, x), y));
    }
  }
  return out;
}

export function latheProfile(points, fillets = 0, tier = TIERS.high, { phiLength = Math.PI * 2 } = {}) {
  const profile = roundProfile(points, fillets, Math.max(2, tier.bevel + 1));
  // Segments around by size: about one per centimetre of circumference, within the tier's budget
  const maxR0 = Math.max(...profile.map((p) => p.x), 0.001);
  // Big discs (rugs, tables) keep a round silhouette even on Low
  const cap = maxR0 > 0.35 ? Math.max(tier.curve, 40) : tier.curve;
  const around = Math.max(10, Math.min(cap, Math.round((maxR0 * phiLength) / 0.01)));
  const geo = new THREE.LatheGeometry(profile, around, 0, phiLength);
  // u around, v along the profile, in meters
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  let len = 0;
  const lengths = [0];
  for (let i = 1; i < profile.length; i++) lengths.push((len += profile[i].distanceTo(profile[i - 1])));
  const maxR = Math.max(...profile.map((p) => p.x), 0.01);
  for (let i = 0; i < pos.count; i++) {
    const row = i % profile.length;
    uv.setXY(i, uv.getX(i) * Math.PI * 2 * maxR, lengths[row]);
  }
  return crease(geo);
}

// A cylinder (or cone) with filleted rims, standing on y = 0
export function roundedCylinder(rTop, rBottom, h, fillet = Math.max(MIN_RADIUS, Math.min(rTop, rBottom, h) * 0.18), tier = TIERS.high) {
  const f = Math.min(fillet, h / 2.2, rTop * 0.9 || fillet, rBottom * 0.9 || fillet);
  return latheProfile([[0, 0], [rBottom, 0], [rTop, h], [0, h]], [0, f, f, 0], tier);
}

export function capsule(radius, length, tier = TIERS.high) {
  const radial = Math.max(6, Math.min(Math.round(tier.curve / 2), Math.round((radius * Math.PI * 2) / 0.006)));
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.0001, length), Math.max(2, Math.min(tier.bevel + 2, Math.round(radial / 3))), radial);
  boxUV(geo, { along: "y" });
  return crease(geo);
}

// A tube along a curve, with round ends
export function tubeAlong(curve, radius, tier = TIERS.high, { roundEnds = true, segments } = {}) {
  const len = curve.getLength();
  const tube = new THREE.TubeGeometry(curve, segments || Math.max(8, Math.round(len * 40 * tier.detail)), radius, Math.max(8, Math.round(tier.curve / 3)), false);
  const parts = [tube];
  if (roundEnds) {
    for (const t of [0, 1]) {
      const cap = new THREE.SphereGeometry(radius, Math.max(8, Math.round(tier.curve / 3)), Math.max(6, Math.round(tier.curve / 5)));
      const p = curve.getPointAt(t);
      cap.translate(p.x, p.y, p.z);
      parts.push(cap);
    }
  }
  for (const g of parts) boxUV(g, { along: "y" });
  return crease(merge(parts));
}

// A flat shape pushed out to a depth with a rounded bevel all round (panels, frames, signs, shelves)
export function extrudeRounded(shape, depth, bevel = Math.max(MIN_RADIUS, depth * 0.3), tier = TIERS.high) {
  const b = Math.min(bevel, depth / 2.2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.0005, depth - b * 2), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: tier.bevel, curveSegments: Math.max(6, Math.round(tier.curve / 2)) });
  geo.translate(0, 0, b);
  geo.computeVertexNormals();
  boxUV(geo, { along: "x" });
  return crease(geo);
}

// A rounded-rectangle outline, for extrudeRounded
export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  s.quadraticCurveTo(x + w, y, x + w, y + rr);
  s.lineTo(x + w, y + h - rr);
  s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  s.lineTo(x + rr, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - rr);
  s.lineTo(x, y + rr);
  s.quadraticCurveTo(x, y, x + rr, y);
  return s;
}

// Seeded random numbers (the same asset always looks the same)
export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// A soft cushion: a subdivided box pulled into a rounded shape, puffed in the middle, a little irregular
export function cushion(w, h, d, { puff = 0.35, round = 0.45, seed = 1, sag = 0 } = {}, tier = TIERS.high) {
  const n = Math.max(6, Math.round(14 * tier.detail));
  const geo = new THREE.BoxGeometry(w, h, d, n, Math.max(3, Math.round(n / 2)), n);
  const pos = geo.attributes.position;
  const r = Math.min(w, h, d) * round * 0.5;
  const ix = w / 2 - r;
  const iy = h / 2 - r;
  const iz = d / 2 - r;
  const rand = rng(seed);
  const wob = Array.from({ length: 8 }, () => rand() * Math.PI * 2);
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.set(Math.max(-ix, Math.min(ix, v.x)), Math.max(-iy, Math.min(iy, v.y)), Math.max(-iz, Math.min(iz, v.z)));
    const dir = v.clone().sub(c);
    if (dir.lengthSq() > 1e-12) v.copy(c).add(dir.normalize().multiplyScalar(r));
    // Puff: the top and bottom swell towards the middle; sag: the top dips in the middle (sat on)
    const fx = 1 - (v.x / (w / 2)) ** 2;
    const fz = 1 - (v.z / (d / 2)) ** 2;
    const bulge = Math.max(0, fx) * Math.max(0, fz);
    v.y += Math.sign(v.y) * bulge * h * puff * 0.5;
    if (v.y > 0) v.y -= bulge * h * sag;
    // A gentle, seeded unevenness (no two cushions alike)
    const k = 0.012 * h;
    v.x += Math.sin(v.z * 9 + wob[0]) * k;
    v.z += Math.sin(v.x * 8 + wob[1]) * k;
    v.y += Math.sin(v.x * 7 + wob[2]) * Math.sin(v.z * 6 + wob[3]) * k;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  const merged = mergeVertices(geo, 1e-4);
  geo.dispose();
  merged.computeVertexNormals();
  boxUV(merged, { along: w >= d ? "x" : "z" });
  return merged.toNonIndexed();
}

// A leaf: a curved blade with a fold along the midrib and a gentle droop; `split` adds monstera-like cuts
export function leaf(length, width, { fold = 0.35, droop = 0.25, twist = 0, split = 0, seed = 1 } = {}, tier = TIERS.high) {
  const segL = Math.max(6, Math.round(12 * tier.detail));
  const segW = Math.max(4, Math.round(8 * tier.detail));
  const rand = rng(seed);
  const positions = [];
  const uvs = [];
  const index = [];
  for (let i = 0; i <= segL; i++) {
    const t = i / segL;
    // A leaf's outline: wide below the middle, a pointed tip, a rounded base
    const half = (width / 2) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 0.75) * (1 - 0.15 * t);
    const bend = droop * t * t * length;
    for (let j = 0; j <= segW; j++) {
      const s = j / segW - 0.5;
      let x = s * 2 * half;
      if (split && Math.abs(s) > 0.18 && t > 0.15 && t < 0.92) {
        // Monstera cuts: narrow slits from the edge towards the midrib
        const slot = Math.abs(Math.sin(t * Math.PI * (4 + split * 2) + (s > 0 ? 0.8 : 0)));
        if (slot < 0.22) x *= 0.55 + slot * 2;
      }
      const y = t * length - bend * 0.3;
      const z = -Math.abs(s) * width * fold * (1 - t * 0.5) - bend + (rand() - 0.5) * 0.002;
      const tw = twist * t;
      positions.push(x * Math.cos(tw) - z * Math.sin(tw), y, x * Math.sin(tw) + z * Math.cos(tw));
      uvs.push(j / segW, t);
    }
  }
  for (let i = 0; i < segL; i++) {
    for (let j = 0; j < segW; j++) {
      const a = i * (segW + 1) + j;
      const b = a + segW + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo.toNonIndexed();
}

// A petal: a short, cupped leaf
export function petal(length, width, { cup = 0.5, seed = 1 } = {}, tier = TIERS.high) {
  return leaf(length, width, { fold: cup, droop: -0.15, seed }, { ...tier, detail: tier.detail * 0.6 });
}

// A book standing on its bottom edge: a cover (with a rounded spine) and the paper block, as two pieces
// for two materials. Returns { cover, pages }.
export function book(w, h, d, { spine = 0.35, tier = TIERS.high } = {}) {
  // Books come by the dozen: one bevel segment is plenty at their size
  const t = { ...tier, bevel: 1 };
  const cover = roundedBox(w, h, d, Math.min(w * spine, 0.008, Math.min(w, h, d) * 0.3), t, { along: "y" });
  const pages = roundedBox(w * 0.82, h * 0.94, d * 0.96, 0.004, t, { along: "y" });
  pages.translate(0, 0, d * 0.025);
  return { cover, pages };
}

// A sphere with a little squash, for balls, fruit, bulbs
export function ball(radius, tier = TIERS.high, { squash = 1 } = {}) {
  // Small balls need fewer segments: about one every 8 mm around, within the tier's budget
  const seg = Math.max(8, Math.min(tier.curve, Math.round((radius * Math.PI * 2) / 0.008)));
  const geo = new THREE.SphereGeometry(radius, seg, Math.max(6, Math.round(seg * 0.6)));
  if (squash !== 1) geo.scale(1, squash, 1);
  boxUV(geo, { along: "y" });
  return geo.toNonIndexed();
}

// A torus (rings, handles, rims)
export function ring(radius, tube, tier = TIERS.high, arc = Math.PI * 2) {
  const geo = new THREE.TorusGeometry(radius, tube, Math.max(8, Math.round(tier.curve / 3)), tier.curve, arc);
  boxUV(geo, { along: "x" });
  return geo.toNonIndexed();
}

// A flat rounded disc (rugs, coasters, clock faces), lying on y = 0, thickness t
export function disc(radius, t, tier = TIERS.high) {
  return roundedCylinder(radius, radius, t, Math.min(t * 0.45, radius * 0.2), tier);
}

// Moves a geometry and returns it (chainable in builders)
export const at = (geo, x, y, z) => (geo.translate(x, y, z), geo);
export const turn = (geo, rx = 0, ry = 0, rz = 0) => {
  if (rx) geo.rotateX(rx);
  if (ry) geo.rotateY(ry);
  if (rz) geo.rotateZ(rz);
  return geo;
};
