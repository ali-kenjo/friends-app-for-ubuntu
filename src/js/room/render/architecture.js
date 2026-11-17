// ---------- The room itself: floor, walls with real openings, trim, ceiling, the view outside ----------
// Built from a room document's size and architecture. Windows and doors are wall things: each cuts an
// opening into its wall, and a painted view (outside.js) sits behind it. Walls between the camera and
// the room fade out (the cutaway), so the robot is never hidden behind one.
import * as THREE from "three";
import * as G from "./kit/geometry.js";
import { material } from "./kit/materials.js";
import { CATALOG_BY_ID } from "../catalog.mjs";
import { worldTransform } from "../model.mjs";
import { outsideTexture, phaseFor } from "./outside.js";

// Wall and floor materials (choices.mjs ids) → a kit material spec
const WALL_SPEC = {
  plaster: { family: "clay", map: "plaster", scale: 0.6, macro: { strength: 0.05, scale: 0.6 } },
  painted: { family: "clay", finish: "matte", map: "plaster", scale: 0.4, relief: 0.15, macro: { strength: 0.04, scale: 0.5 } },
  wainscot: { family: "clay", map: "plaster", scale: 0.6, macro: { strength: 0.05, scale: 0.6 } },
  panelling: { family: "wood", map: "slats", scale: 0.5, relief: 0.5 },
  brick: { family: "clay", map: "brick", scale: 0.7, relief: 0.8, macro: { strength: 0.1, scale: 0.8 } },
  slats: { family: "wood", map: "slats", scale: 0.8, relief: 0.8 },
  tiles: { family: "ceramic", map: "tile", scale: 1, rough: 0.35, relief: 0.6 },
  shoji: { family: "paper", map: "shoji", scale: 0.5 },
  stone: { family: "clay", map: "stone", scale: 0.5, relief: 0.9, macro: { strength: 0.08, scale: 0.5 } },
  logs: { family: "wood", map: "logs", scale: 0.55, relief: 0.9 },
  concrete: { family: "clay", map: "concrete", scale: 0.4, macro: { strength: 0.08, scale: 0.4 } },
  acoustic: { family: "fabric", map: "weave", scale: 1.5, relief: 0.4 },
  starwall: { family: "clay", map: "stars", scale: 0.4, rough: 0.9 },
};

const FLOOR_SPEC = {
  oak_planks: { family: "wood", map: "planks", scale: 0.42, relief: 0.6, rough: 0.82, macro: { strength: 0.08, scale: 0.45 } },
  walnut_planks: { family: "wood", map: "planks", scale: 0.42, relief: 0.6, rough: 0.82, macro: { strength: 0.08, scale: 0.45 } },
  pine_planks: { family: "wood", map: "planks", scale: 0.38, relief: 0.6, rough: 0.82, macro: { strength: 0.1, scale: 0.45 } },
  herringbone: { family: "wood", map: "herringbone", scale: 0.5, relief: 0.6, rough: 0.82, macro: { strength: 0.07, scale: 0.45 } },
  deck: { family: "wood", map: "planks", scale: 0.3, relief: 0.8, rough: 0.7, macro: { strength: 0.1, scale: 0.4 } },
  tatami: { family: "fabric", map: "tatami", scale: 0.5, sheen: 0, relief: 0.5 },
  terrazzo: { family: "clay", map: "terrazzo", scale: 0.6, rough: 0.7, relief: 0.2, macro: { strength: 0.05, scale: 0.4 } },
  checker: { family: "ceramic", map: "checker", scale: 0.5, rough: 0.6, clearcoat: 0, relief: 0.4 },
  tile: { family: "ceramic", map: "tile", scale: 0.5, rough: 0.65, clearcoat: 0, relief: 0.5 },
  concrete: { family: "clay", map: "concrete", scale: 0.35, rough: 0.75, macro: { strength: 0.1, scale: 0.35 } },
  carpet: { family: "fabric", map: "carpet", scale: 1, sheen: 0.4, relief: 0.5, macro: { strength: 0.06, scale: 0.5 } },
  stone: { family: "clay", map: "stone", scale: 0.4, relief: 0.8, macro: { strength: 0.1, scale: 0.4 } },
  grass: { family: "leaf", map: "grass", scale: 0.8, rough: 0.9, macro: { strength: 0.15, scale: 0.3 } },
  sand: { family: "clay", map: "sand", scale: 0.6, rough: 0.95, macro: { strength: 0.1, scale: 0.3 } },
  cloud: { family: "clay", map: "plaster", scale: 0.3, rough: 0.95 },
  forest: { family: "leaf", map: "grass", scale: 0.6, rough: 0.95, macro: { strength: 0.18, scale: 0.3 } },
  deck_plates: { family: "metal", finish: "brushed", map: "tile", scale: 0.6, rough: 0.45, metal: 0.6 },
  glossy: { family: "plastic", rough: 0.12, map: false },
};

const SIDES = {
  back: { axis: "x", dir: [0, 0, 1] },
  front: { axis: "x", dir: [0, 0, -1] },
  left: { axis: "z", dir: [1, 0, 0] },
  right: { axis: "z", dir: [-1, 0, 0] },
};

// Which wall a wall thing is on (the nearest one), and where along it
export function wallOf(room, x, z) {
  const { w, d } = room.size;
  const dist = { back: Math.abs(z + d / 2), front: Math.abs(z - d / 2), left: Math.abs(x + w / 2), right: Math.abs(x - w / 2) };
  return Object.entries(dist).sort((a, b) => a[1] - b[1])[0][0];
}

// A wall thing's facing for each side (its back on the wall, its front into the room)
export const WALL_FACING = { back: 0, front: 180, left: 90, right: -90 };

export function buildArchitecture(room, { level = "high", hidden = new Set() } = {}) {
  const group = new THREE.Group();
  group.name = "Architecture";
  const arch = room.architecture;
  const { w, d, h } = room.size;
  const t = arch.thickness;
  const tier = G.tierOf(level);
  const walls = [];
  const views = [];
  const glowing = [];
  const hour = room.atmosphere?.timeHour ?? 14;

  // ----- The floor: a soft slab whose top is at y = 0 -----
  if (arch.floor.material !== "none" && arch.floor.material !== "grid") {
    const spec = FLOOR_SPEC[arch.floor.material] || FLOOR_SPEC.oak_planks;
    const slab = G.roundedBox(w + (arch.walls.left ? t : 0.6) + (arch.walls.right ? t : 0.6), 0.06, d + (arch.walls.back ? t : 0.6) + (arch.walls.front ? t : 0.6), 0.02, tier, { along: "x" });
    slab.translate((arch.walls.left ? -t / 2 : -0.3) + (arch.walls.right ? t / 2 : 0.3), -0.03, (arch.walls.back ? -t / 2 : -0.3) + (arch.walls.front ? t / 2 : 0.3));
    const floor = new THREE.Mesh(G.compact(withColor(slab), { tangents: level !== "low" }), material({ ...spec, seed: 5, env: spec.family === "plastic" ? 1 : 0.3 }, arch.floor.color, level));
    floor.receiveShadow = true;
    floor.name = "floor";
    group.add(floor);
  }

  // ----- Openings: windows and doors cut holes in their wall -----
  const openings = { back: [], front: [], left: [], right: [] };
  const byId = new Map(room.assets.map((a) => [a.id, a]));
  for (const a of room.assets) {
    if (hidden.has(a.id) || a.slot !== "wall") continue;
    const def = CATALOG_BY_ID[a.type];
    const op = def?.opening;
    if (!op) continue;
    const p = worldTransform(room, a, byId);
    const side = wallOf(room, p.x, p.z);
    const k = a.scale * (def.variants?.[a.variant] ?? 1);
    const along = SIDES[side].axis === "x" ? (side === "back" ? p.x : -p.x) : side === "left" ? -p.z : p.z;
    openings[side].push({ u: along, y: p.y + op.y * k, w: op.w * k, h: op.h * k, arch: op.arch, round: op.round, asset: a });
  }

  // ----- Walls -----
  const wallSpec = WALL_SPEC[arch.wall.material] || WALL_SPEC.plaster;
  for (const side of ["back", "left", "right", "front"]) {
    if (!arch.walls[side]) continue;
    const len = SIDES[side].axis === "x" ? w + t * 2 : d;
    const shape = new THREE.Shape();
    shape.moveTo(-len / 2, 0);
    shape.lineTo(len / 2, 0);
    shape.lineTo(len / 2, h);
    shape.lineTo(-len / 2, h);
    shape.lineTo(-len / 2, 0);
    for (const o of openings[side]) {
      const hole = new THREE.Path();
      const x0 = o.u - o.w / 2;
      const x1 = o.u + o.w / 2;
      const y0 = Math.max(0.001, o.y);
      const y1 = Math.min(h - 0.05, o.y + o.h);
      if (o.round) hole.absarc(o.u, (y0 + y1) / 2, o.w / 2, 0, Math.PI * 2, true);
      else if (o.arch) {
        hole.moveTo(x0, y0);
        hole.lineTo(x0, y1 - o.w / 2);
        hole.absarc(o.u, y1 - o.w / 2, o.w / 2, Math.PI, 0, true);
        hole.lineTo(x1, y0);
        hole.lineTo(x0, y0);
      } else {
        hole.moveTo(x0, y0);
        hole.lineTo(x1, y0);
        hole.lineTo(x1, y1);
        hole.lineTo(x0, y1);
        hole.lineTo(x0, y0);
      }
      shape.holes.push(hole);
    }
    const geo = G.extrudeRounded(shape, t, Math.min(0.02, t * 0.25), { ...tier, curve: Math.max(16, tier.curve) });
    G.boxUV(geo, { along: "x" });
    const accent = arch.accentWall?.side === side ? arch.accentWall : null;
    const spec = accent ? WALL_SPEC[accent.material] || wallSpec : wallSpec;
    const mesh = new THREE.Mesh(G.compact(withColor(geo), { tangents: level !== "low" }), material({ ...spec, seed: 3, env: 0.35 }, accent ? accent.color : arch.wall.color, level));
    placeWall(mesh, side, w, d, t);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.name = `wall-${side}`;
    group.add(mesh);
    const extras = [];
    // A soft baseboard (and a wainscot below a rail, for that wall finish)
    if (arch.wall.trim) {
      const trim = G.roundedBox(len - 0.02, 0.1, 0.025, 0.008, tier, { along: "x" });
      trim.translate(0, 0.05, t + 0.0125);
      extras.push(trimMesh(trim, arch.wall.trimColor, level, side, w, d, t));
    }
    if (arch.wall.material === "wainscot") {
      const panel = G.roundedBox(len - 0.02, 0.86, 0.02, 0.006, tier, { along: "x" });
      panel.translate(0, 0.43, t + 0.01);
      const pm = new THREE.Mesh(G.compact(withColor(panel)), material({ family: "wood", finish: "painted", map: "slats", scale: 1.2, relief: 0.4 }, arch.wall.trimColor, level));
      placeWall(pm, side, w, d, t);
      pm.receiveShadow = true;
      extras.push(pm);
      const rail = G.roundedBox(len - 0.02, 0.04, 0.035, 0.012, tier, { along: "x" });
      rail.translate(0, 0.88, t + 0.017);
      extras.push(trimMesh(rail, arch.wall.trimColor, level, side, w, d, t));
    }
    for (const e of extras) group.add(e);
    walls.push({ side, mesh, extras, normal: new THREE.Vector3(...SIDES[side].dir), fade: 1 });
    // The view behind each opening
    for (const o of openings[side]) {
      const kind = arch.outside === "none" ? "garden_day" : arch.outside;
      const tex = outsideTexture(kind, hour, 7 + side.length);
      const vw = o.w + 1.4;
      const vh = o.h + 1.0;
      const view = new THREE.Mesh(new THREE.PlaneGeometry(vw, vh), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      view.userData.owned = true;
      view.position.set(o.u, o.y + o.h / 2, -0.9);
      const holder = new THREE.Group();
      holder.add(view);
      placeWall(holder, side, w, d, t);
      group.add(holder);
      views.push(holder);
      walls[walls.length - 1].extras.push(holder);
    }
  }

  // ----- Sun patches: the window's light on the floor, moving with the time of day -----
  const phase = phaseFor(hour);
  if (phase !== "night") {
    const color = { day: "#fff2d6", golden: "#ffbf7a", evening: "#ff9a6a" }[phase];
    const strength = { day: 0.22, golden: 0.28, evening: 0.12 }[phase];
    const sweep = ((hour - 12) / 7) * 0.8; // morning light falls one way, afternoon the other
    for (const side of Object.keys(openings)) {
      if (!arch.walls[side]) continue;
      for (const o of openings[side]) {
        const len = o.h * 1.1;
        const patch = new THREE.Mesh(new THREE.PlaneGeometry(o.w * 0.95, len), sunPatchMaterial(color, strength));
        patch.userData.owned = true;
        patch.rotation.x = -Math.PI / 2;
        patch.rotation.z = sweep * 0.5;
        patch.position.set(o.u + sweep * len * 0.6, 0.004, len / 2 + 0.05);
        patch.renderOrder = 1;
        const holder = new THREE.Group();
        holder.add(patch);
        placeWall(holder, side, w, d, 0);
        group.add(holder);
      }
    }
  }

  // ----- Ceiling -----
  const ceil = arch.ceiling.kind;
  if (ceil !== "none" && (arch.walls.back || arch.walls.left || arch.walls.right)) {
    const cspec = { family: "clay", map: "plaster", scale: 0.5 };
    const add = (geo, spec = cspec, color = arch.ceiling.color) => {
      const m = new THREE.Mesh(G.compact(withColor(geo)), material(spec, color, level));
      m.receiveShadow = true;
      m.castShadow = false;
      m.name = "ceiling";
      group.add(m);
      return m;
    };
    if (ceil === "dome") {
      const dome = new THREE.SphereGeometry(Math.max(w, d) * 0.7, tier.curve, Math.round(tier.curve / 2), 0, Math.PI * 2, 0, Math.PI / 2);
      dome.scale(1, 0.45, 1);
      dome.translate(0, h - 0.02, 0);
      const m = new THREE.Mesh(dome, material({ family: "clay", map: "stars", scale: 2, side: "double" }, "#1c2140", level));
      m.name = "ceiling";
      group.add(m);
    } else if (ceil === "truss") {
      for (const z of [-d * 0.25, d * 0.15]) {
        const tube = G.capsule(0.03, w - 0.1, tier);
        tube.rotateZ(Math.PI / 2);
        tube.translate(0, h - 0.15, z);
        add(tube, { family: "metal", finish: "black" }, "#2d3038");
      }
    } else {
      const slab = G.roundedBox(w + t * 2, 0.08, d + t, 0.02, tier);
      slab.translate(0, h + 0.04, -t / 2);
      add(slab);
      if (ceil === "beams" || ceil === "coffered") {
        const n = Math.max(3, Math.round(w / 0.9));
        for (let i = 0; i < n; i++) {
          const beam = G.roundedBox(0.12, 0.16, d, 0.025, tier, { along: "z" });
          beam.translate(-w / 2 + (i + 0.5) * (w / n), h - 0.08, 0);
          add(beam, { family: "wood", scale: 1 }, "#7a5a3e");
        }
        if (ceil === "coffered") {
          for (let j = 1; j < 4; j++) {
            const cross = G.roundedBox(w, 0.12, 0.1, 0.02, tier);
            cross.translate(0, h - 0.06, -d / 2 + (j * d) / 4);
            add(cross, cspec);
          }
        }
      }
      if (ceil === "skylight") {
        const frame = G.roundedBox(1.2, 0.06, 0.9, 0.02, tier);
        frame.translate(0, h - 0.03, -d * 0.1);
        add(frame, { family: "wood", finish: "painted" }, "#efe9dd");
        const glass = G.roundedBox(1.1, 0.01, 0.8, 0.004, tier);
        glass.translate(0, h - 0.06, -d * 0.1);
        const gm = new THREE.Mesh(withColor(glass), material({ family: "emissive", intensity: 0.8 }, "#dff0ff", level));
        group.add(gm);
        glowing.push(gm.material);
      }
    }
  }

  const bounds = new THREE.Box3(new THREE.Vector3(-w / 2 - t, 0, -d / 2 - t), new THREE.Vector3(w / 2 + t, h, d / 2 + t));
  return { group, walls, views, glowing, bounds };
}

function withColor(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.color) g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return g;
}

function trimMesh(geo, color, level, side, w, d, t) {
  const m = new THREE.Mesh(G.compact(withColor(geo)), material({ family: "wood", finish: "painted", rough: 0.5 }, color, level));
  placeWall(m, side, w, d, t);
  m.receiveShadow = true;
  m.castShadow = true;
  return m;
}

// Wall-local (u along the wall, v up, z out of the wall into the room from its outer face) → the room
function placeWall(obj, side, w, d, t) {
  if (side === "back") obj.position.set(0, 0, -d / 2 - t);
  else if (side === "front") {
    obj.rotation.y = Math.PI;
    obj.position.set(0, 0, d / 2 + t);
  } else if (side === "left") {
    obj.rotation.y = Math.PI / 2;
    obj.position.set(-w / 2 - t, 0, 0);
  } else {
    obj.rotation.y = -Math.PI / 2;
    obj.position.set(w / 2 + t, 0, 0);
  }
}

let patchTex = null;
function sunPatchMaterial(color, strength) {
  if (!patchTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.6, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    patchTex = new THREE.CanvasTexture(c);
    patchTex.userData.shared = true;
  }
  const m = new THREE.MeshBasicMaterial({ map: patchTex, color, transparent: true, opacity: strength, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  m.userData.owned = true;
  return m;
}

// The cutaway: a wall fades out when the camera is on its outside (it would hide the room)
export function updateCutaway(walls, camera, mode = "auto", dt = 0.016) {
  for (const wall of walls) {
    let want = 1;
    if (mode === "auto") {
      const wp = new THREE.Vector3();
      wall.mesh.getWorldPosition(wp);
      // The wall's inner face: its outer position moved in by its thickness, along its normal
      const toCam = camera.position.clone().sub(wp);
      if (toCam.dot(wall.normal) < 0) want = 0;
    }
    wall.fade += (want - wall.fade) * Math.min(1, dt * 8);
    if (Math.abs(want - wall.fade) < 0.01) wall.fade = want;
    const visible = wall.fade > 0.02;
    for (const o of [wall.mesh, ...wall.extras]) o.visible = visible;
    const m = wall.mesh.material;
    if (wall.fade < 1 && visible) {
      if (!wall.faded) {
        wall.faded = m.clone();
        wall.faded.transparent = true;
        wall.faded.depthWrite = false;
        wall.solid = m;
      }
      wall.faded.opacity = wall.fade;
      wall.mesh.material = wall.faded;
    } else if (wall.solid && wall.mesh.material !== wall.solid) wall.mesh.material = wall.solid;
  }
}
