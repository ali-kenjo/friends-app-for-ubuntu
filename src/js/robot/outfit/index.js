// ---------- Dressing the robot ----------
// Eight slots (design.mjs SLOTS: hat, glasses, headgear, neck, torso, back, chest, held),
// each with a builder per item. Also builds the optional body decal and temporary idle held item.
import * as THREE from "three";
import hats from "./hats.js";
import glasses from "./glasses.js";
import headgear from "./headgear.js";
import neck from "./neck.js";
import torso from "./torso.js";
import back from "./back.js";
import chest from "./chest.js";
import held from "./held.js";
import { bodySurface, starGeometry, heartGeometry, boltGeometry, plate, roundedRect } from "./kit.js";

const BUILDERS = { hat: hats, glasses, headgear, neck, torso, back, chest, held };

// Which part each slot hangs on
const PARENTS = {
  hat: "Head",
  glasses: "Head",
  headgear: "Head",
  neck: "Neck",
  torso: "Body",
  back: "Body",
  chest: "Body",
  held: "Arm_R",
};

function buildDecal(c, decalId) {
  if (!decalId || decalId === "none") return null;
  const y = c.dims.body.h * 0.42;
  const s = bodySurface(c, y);
  const g = new THREE.Group();
  g.name = "BodyDecal";
  g.position.set(0, y - c.dims.body.h / 2, s.z + 0.004);
  g.rotation.x = s.tilt;
  g.scale.setScalar(1.15 * c.dims.body.W ** 0.5);
  const mat = c.keep(new THREE.MeshStandardMaterial({ color: c.design.colors.pattern || "#ffffff", roughness: 0.45 }));
  const glowMat = c.keep(new THREE.MeshStandardMaterial({ color: "#101216", emissive: c.light, emissiveIntensity: 1.2, roughness: 0.3 }));
  switch (decalId) {
    case "star_emblem":
      g.add(c.make(starGeometry(0.052, 0.024, 5, 0.006), mat, { shadow: false }));
      break;
    case "heart_patch":
      g.add(c.make(heartGeometry(0.04, 0.006), mat, { shadow: false }));
      break;
    case "lightning":
      g.add(c.make(boltGeometry(0.05, 0.006), glowMat, { shadow: false }));
      break;
    case "smiley":
      g.add(c.make(new THREE.CircleGeometry(0.045, 24), mat, { shadow: false }));
      break;
    case "planet_ring":
      g.add(c.make(new THREE.SphereGeometry(0.026, 16, 12), mat, { shadow: false }));
      g.add(c.make(new THREE.TorusGeometry(0.046, 0.005, 8, 24), glowMat, { shadow: false }).rotateX(1.1));
      break;
    case "music_note":
      g.add(c.make(new THREE.CircleGeometry(0.022, 16), glowMat, { shadow: false }).translateX(-0.015).translateY(-0.018));
      g.add(c.make(new THREE.BoxGeometry(0.008, 0.055, 0.004), glowMat, { shadow: false }).translateX(0.002).translateY(0.01));
      break;
    case "paw_print":
      g.add(c.make(new THREE.CircleGeometry(0.024, 16), mat, { shadow: false }).translateY(-0.01));
      for (const [dx, dy] of [[-0.022, 0.02], [0, 0.028], [0.022, 0.02]]) {
        g.add(c.make(new THREE.CircleGeometry(0.01, 12), mat, { shadow: false }).translateX(dx).translateY(dy));
      }
      break;
    case "leaf_crest": {
      const leaf = new THREE.SphereGeometry(0.038, 16, 12);
      leaf.scale(0.65, 1.1, 0.2);
      g.add(c.make(leaf, mat, { shadow: false }));
      break;
    }
    case "flame": {
      const cone = new THREE.ConeGeometry(0.032, 0.075, 14);
      cone.scale(1, 1, 0.25);
      g.add(c.make(cone, glowMat, { shadow: false }));
      break;
    }
    case "number_07":
      g.add(c.make(plate(roundedRect(0.095, 0.052, 0.012), 0.005, 0.001), mat, { shadow: false }));
      break;
    default:
      return null;
  }
  return { object: g, mat, glowMat };
}

export function dress(robot, design, { make, group }) {
  const worn = [];
  const paints = []; // { material, n, light }: colors that follow c1 / c2
  const glowing = new Set();
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);

  const makeSlotItem = (slot, o) => {
    const build = o && BUILDERS[slot]?.[o.item];
    if (!build) return null;
    const mine = { paints: [], glow: [] };
    const paint = (n, options = {}) => {
      const { roughness = 0.6, metalness = 0, physical = false, ...rest } = options;
      const material = physical
        ? new THREE.MeshPhysicalMaterial({ roughness, metalness, clearcoat: 0.25, ...rest })
        : new THREE.MeshStandardMaterial({ roughness, metalness, ...rest });
      mine.paints.push({ material, n });
      paints.push({ material, n });
      return keep(material);
    };
    const glow = (n, strength = 1, options = {}) => {
      const material = new THREE.MeshStandardMaterial({ color: "#101216", roughness: 0.3, emissive: "#ffffff", emissiveIntensity: strength, ...options });
      mine.glow.push({ material, n, strength });
      glowing.add(material);
      return keep(material);
    };
    const ctx = {
      THREE, make, group, dims: robot.dims, design, nodes: robot.nodes, m: robot.materials, item: o, slot,
      paint, glow, keep, light: robot.light,
    };
    const made = build(ctx);
    if (!made) return null;
    const object = made.object || made;
    object.name = `Outfit_${slot}`;
    const parent = robot.nodes[made.parent || PARENTS[slot]];
    if (!parent) return null;
    parent.add(object);
    for (const [name, extra] of made.extra || []) robot.nodes[name]?.add(extra);
    return { slot, object, made, mine };
  };

  for (const slot of Object.keys(BUILDERS)) {
    const entry = makeSlotItem(slot, design.outfit?.[slot]);
    if (entry) worn.push(entry);
  }

  // Body decal when no chest item covers the middle
  const decalEntry = design.outfit?.chest?.item === "none" ? buildDecal({ dims: robot.dims, design, make, keep, light: robot.light }, design.decal) : null;
  if (decalEntry && robot.nodes.Body) robot.nodes.Body.add(decalEntry.object);

  const colorOf = (o, n, light) => {
    const hex = n === 1 ? o?.c1 : o?.c2;
    return hex ? new THREE.Color(hex) : light;
  };
  const tint = (item, design2, light) => {
    const o = design2.outfit?.[item.slot] || {};
    for (const p of item.mine.paints) p.material.color.copy(colorOf(o, p.n, light));
    for (const g of item.mine.glow) g.material.emissive.copy(colorOf(o, g.n, light));
    item.made.recolor?.(o, light);
  };
  for (const item of worn) tint(item, design, robot.light);

  // Pre-build idle temporary held items if the user didn't equip a permanent held item
  const idleHeldMap = {};
  if (!design.outfit?.held || design.outfit.held.item === "none") {
    for (const [id, c1, c2] of [["book", "#8b3a3a", "#f5eedc"], ["mug", "#f4efe6", "#d97736"], ["tablet", "#242936", "#5eead4"], ["wrench", "#9aa5b4", "#d9435b"]]) {
      const entry = makeSlotItem("held", { item: id, c1, c2, pattern: "solid" });
      if (entry) {
        tint(entry, { outfit: { held: { item: id, c1, c2 } } }, robot.light);
        entry.object.visible = false;
        idleHeldMap[id] = entry.object;
      }
    }
  }

  robot.outfit = {
    worn,
    glowing,
    recolor(design2, light) {
      robot.design = design2;
      for (const item of worn) tint(item, design2, light);
      if (decalEntry) {
        decalEntry.mat.color.set(design2.colors?.pattern || "#ffffff");
        decalEntry.glowMat.emissive.copy(light);
      }
    },
    update(pose, time, fx) {
      for (const item of worn) item.made.update?.(pose, time, fx);
      for (const [id, obj] of Object.entries(idleHeldMap)) {
        obj.visible = pose.heldOverride === id;
      }
    },
    setDetail(rich) {
      for (const item of worn) item.made.setDetail?.(rich);
    },
    dispose() {
      for (const d of disposables) d.dispose?.();
      for (const item of worn) item.made.dispose?.();
    },
  };
}
