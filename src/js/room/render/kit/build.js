// ---------- Building an asset: pieces → a few merged meshes ----------
// An asset builder (render/assets/<category>.js) describes its pieces:
//
//   b.part("c1", geometry, { family: "wood" })          a piece in the asset's first color
//   b.part("#2d3038", geometry, { family: "metal" })    a fixed color
//   b.part("c2", geometry, spec, { tint: "#ffcc88" })   a tinted piece (books of many colors in one mesh)
//   b.glow("c2", geometry, { intensity: 2 })            a glowing piece (screens, bulbs; it blooms)
//
// finish() merges pieces that share a color slot and material into one mesh (a typical asset is 2–6 draw
// calls), bakes ambient occlusion into vertex colors on Low, and returns the group. recolor() changes an
// asset's colors by picking other cached materials: geometry is never rebuilt.
import * as THREE from "three";
import * as G from "./geometry.js";
import { material } from "./materials.js";

export class Build {
  // def: the catalog entry; colors: { c1, c2, c3 } (hex); level: the quality tier
  constructor({ def, colors = {}, level = "high", seed = 1, state = {} } = {}) {
    this.def = def;
    this.level = level;
    this.tier = G.tierOf(level);
    this.colors = colors;
    this.seed = seed;
    this.state = state;
    this.pieces = new Map(); // key → { slot, spec, geos: [] }
    this.updaters = [];
    this.lightsAt = [];
    this.extra = new THREE.Group(); // things that move on their own (a clock's hands, a pendulum)
    this.named = {};
    this.rand = G.rng(seed * 7919 + 13);
  }

  colorOf(slot) {
    if (typeof slot === "string" && slot.startsWith("#")) return slot;
    const def = this.def?.colors?.find((c) => c.key === slot);
    return this.colors[slot] || def?.def || "#cccccc";
  }

  part(slot, geo, spec = { family: "plastic" }, { tint = null, ao = true } = {}) {
    if (!geo) return this;
    if (tint && !spec.vertexColors) spec = { ...spec, vertexColors: true };
    const key = `${slot}|${JSON.stringify(spec)}`;
    let entry = this.pieces.get(key);
    if (!entry) this.pieces.set(key, (entry = { slot, spec, geos: [] }));
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    // Every piece carries vertex colors: its tint, and on Low the baked shadow in its hollows
    const count = g.attributes.position.count;
    const col = new Float32Array(count * 3);
    const c = new THREE.Color(tint || "#ffffff");
    for (let i = 0; i < count; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    if (ao && this.level === "low") {
      G.bakeAO(g, { ground: 0 });
      const baked = g.attributes.color.array;
      for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) baked[i * 3 + k] *= col[i * 3 + k];
    }
    if (!g.attributes.uv) G.boxUV(g);
    entry.geos.push(g);
    return this;
  }

  glow(slot, geo, { intensity = 1.6, rough = 0.5 } = {}) {
    return this.part(slot, geo, { family: "emissive", intensity, rough });
  }

  // fn(dt, time, fx) each frame (plants sway, steam rises, hands move)
  onUpdate(fn) {
    this.updaters.push(fn);
    return this;
  }

  finish() {
    const group = new THREE.Group();
    group.name = this.def?.id || "asset";
    const meshes = [];
    const glowing = [];
    for (const { slot, spec, geos } of this.pieces.values()) {
      if (!geos.length) continue;
      let geo = geos.length === 1 ? geos[0] : G.merge(geos);
      geo = G.compact(geo, { tangents: Boolean(spec.map !== false && spec.family !== "emissive" && spec.family !== "glass" && spec.family !== "metal" && this.level !== "low") });
      const mat = material(spec, this.colorOf(slot), this.level);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.slot = slot;
      mesh.userData.spec = spec;
      mesh.castShadow = spec.family !== "glass" && spec.family !== "emissive" && !spec.noShadow;
      mesh.receiveShadow = spec.family !== "emissive";
      if (mat.userData.transparent) mesh.renderOrder = 2;
      group.add(mesh);
      meshes.push(mesh);
      if (mat.userData.glow) glowing.push(mat);
    }
    if (this.extra.children.length) group.add(this.extra);
    this.extra.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material?.userData?.glow) glowing.push(o.material);
      }
    });
    const updaters = this.updaters;
    return {
      group,
      meshes,
      glowing,
      named: this.named,
      update: updaters.length ? (dt, t, fx) => updaters.forEach((fn) => fn(dt, t, fx)) : null,
    };
  }

  // A mesh that moves on its own (kept out of the merge): returns it so the builder can animate it
  moving(slot, geo, spec = { family: "plastic" }, name = "") {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const count = g.attributes.position.count;
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
    const mesh = new THREE.Mesh(G.compact(g), material(spec, this.colorOf(slot), this.level));
    mesh.userData.slot = slot;
    mesh.userData.spec = spec;
    this.extra.add(mesh);
    if (name) this.named[name] = mesh;
    return mesh;
  }

  // ---- shortcuts so builders read like a description ----
  box(w, h, d, r, opts) {
    return G.roundedBox(w, h, d, r ?? G.bevelFor(w, h, d), this.tier, opts);
  }
  cyl(rTop, rBottom, h, fillet) {
    return G.roundedCylinder(rTop, rBottom, h, fillet, this.tier);
  }
  lathe(points, fillets) {
    return G.latheProfile(points, fillets, this.tier);
  }
  tube(points, radius, opts = {}) {
    const curve = Array.isArray(points) ? new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, "catmullrom", 0.3) : points;
    return G.tubeAlong(curve, radius, this.tier, opts);
  }
  capsule(radius, length) {
    return G.capsule(radius, length, this.tier);
  }
  cushion(w, h, d, opts) {
    return G.cushion(w, h, d, { seed: this.seed, ...opts }, this.tier);
  }
  leaf(len, width, opts) {
    return G.leaf(len, width, { seed: Math.floor(this.rand() * 1e6), ...opts }, this.tier);
  }
  petal(len, width, opts) {
    return G.petal(len, width, opts, this.tier);
  }
  ball(r, opts) {
    return G.ball(r, this.tier, opts);
  }
  ring(r, tube, arc) {
    return G.ring(r, tube, this.tier, arc);
  }
  disc(r, t) {
    return G.disc(r, t, this.tier);
  }
  extrude(shape, depth, bevel) {
    return G.extrudeRounded(shape, depth, bevel, this.tier);
  }
  rrect(w, h, r) {
    return G.roundedRectShape(w, h, r);
  }
  book(w, h, d) {
    return G.book(w, h, d, { tier: this.tier });
  }
}

export const at = G.at;
export const turn = G.turn;

// Recolor an built asset in place: other cached materials, same geometry
export function recolor(built, def, colors, level) {
  const b = new Build({ def, colors, level });
  built.glowing = [];
  built.group.traverse((o) => {
    if (!o.isMesh || !o.userData.spec) return;
    o.material = material(o.userData.spec, b.colorOf(o.userData.slot), level);
    if (o.material.userData.glow) built.glowing.push(o.material);
  });
  return built;
}
