// ---------- Turning 0.7 Room Builder props and 1.0 v1 assets into room assets ----------
// Pure; used by the templates (the three v1 presets) and by the settings migration.
import { CATALOG_BY_ID, FROM_BUILDER, FROM_V1 } from "./catalog.mjs";
import { newId, deg, num, cleanId, HEX } from "./model.mjs";

const RAD = 180 / Math.PI;

// The inverse of a parent's turn: a world point in the parent's frame (x/z only)
function toLocal(parent, x, z) {
  const dx = x - parent.pos[0];
  const dz = z - parent.pos[2];
  const r = (parent.rot * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [dx * c - dz * s, dx * s + dz * c];
}

function insideFootprint(parent, x, z, margin = 0.05) {
  const def = CATALOG_BY_ID[parent.type];
  const [lx, lz] = toLocal(parent, x, z);
  const k = parent.scale || 1;
  return Math.abs(lx) <= (def.footprint.w * k) / 2 + margin && Math.abs(lz) <= (def.footprint.d * k) / 2 + margin;
}

// 1.0 v1 assets: { id, kind, x, y, z, rotY (radians), scale, attachedTo, customGlbId, visible }
// Things lifted onto a desk (attachedTo, or simply standing at desk height over it) become its children.
export function fromV1Assets(list, { taken = new Set(), notes = [] } = {}) {
  const out = [];
  const idOf = new Map();
  const raw = (Array.isArray(list) ? list : []).filter((a) => a && typeof a === "object");
  // Things on the floor first, so their children can find them
  const order = [...raw].sort((a, b) => (Number(a.y) || 0) - (Number(b.y) || 0));
  for (const a of order) {
    const type = FROM_V1[a.kind];
    if (!type) {
      notes.push(`A 1.0 thing of an unknown kind was left out: ${String(a.kind || "").slice(0, 30)}`);
      continue;
    }
    const want = cleanId(a.id) || type;
    const id = newId(want, taken);
    taken.add(id);
    idOf.set(a.id, id);
    const x = num(a.x, -20, 20, 0);
    const y = num(a.y, 0, 5, 0);
    const z = num(a.z, -20, 20, 0);
    const asset = { id, type, pos: [x, 0, z], rot: deg((Number(a.rotY) || 0) * RAD), scale: num(a.scale, 0.25, 3, 1, 0.01), hidden: a.visible === false, glb: cleanId(a.customGlbId) };
    const def = CATALOG_BY_ID[type];
    if (y > 0.2) {
      const parentOld = a.attachedTo ? order.find((b) => b.id === a.attachedTo) : null;
      let parent = parentOld ? out.find((o) => o.id === idOf.get(parentOld.id)) : null;
      if (!parent) parent = out.find((o) => CATALOG_BY_ID[o.type].surfaces.length && insideFootprint(o, x, z, 0.08));
      if (parent && def.slots.includes("surface")) {
        const [lx, lz] = toLocal(parent, x, z);
        const k = parent.scale || 1;
        asset.parent = parent.id;
        asset.surface = CATALOG_BY_ID[parent.type].surfaces[0].id;
        asset.slot = "surface";
        asset.pos = [Math.round((lx / k) * 1000) / 1000, 0, Math.round((lz / k) * 1000) / 1000];
        asset.rot = deg(asset.rot - parent.rot);
      } else asset.pos[1] = 0;
    }
    out.push(asset);
  }
  return out;
}

// 0.7 Room Builder items: { id, propId, slot, x, y, z, rotY (degrees), scale, c1, c2, animated, interactive }
const BUILDER_WALL_Z = -1.36;
export function fromBuilderItems(items, { taken = new Set(), notes = [], room = { w: 6, d: 5.2 } } = {}) {
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== "object") continue;
    const type = FROM_BUILDER[it.propId];
    if (!type) {
      notes.push(`A Room Builder prop was left out: ${String(it.propId || "").slice(0, 30)}`);
      continue;
    }
    const def = CATALOG_BY_ID[type];
    const id = newId(cleanId(it.id) || type, taken);
    taken.add(id);
    const x = num(it.x, -20, 20, 0);
    const y = num(it.y, 0, 5, 0);
    let z = num(it.z, -20, 20, 0);
    const slotMap = { floor: "floor", wall: "wall", shelf: "surface", ceiling: "ceiling" };
    let slot = slotMap[it.slot] || def.slots[0];
    if (!def.slots.includes(slot)) slot = def.slots[0];
    // The Builder's back wall stood at z = -1.36 in front of the place; in a room, wall things go on the back wall
    if (slot === "wall") z = -room.d / 2;
    else if (z < BUILDER_WALL_Z) z = BUILDER_WALL_Z + 0.05;
    const colors = {};
    if (HEX.test(it.c1 || "")) colors.c1 = it.c1.toLowerCase();
    if (HEX.test(it.c2 || "") && def.colors.length > 1) colors.c2 = it.c2.toLowerCase();
    const asset = {
      id,
      type,
      slot,
      // Shelf things in the Builder floated at a height; with no furniture under them they stand on the floor
      pos: [x, slot === "wall" || slot === "ceiling" ? y : 0, z],
      rot: deg(Number(it.rotY) || 0),
      scale: num(it.scale, 0.4, 2.2, 1, 0.01),
      colors,
      state: {},
    };
    if (it.animated === false && def.states && "steam" in def.states) asset.state.steam = false;
    // "Interactive" off in the Builder meant: not to be clicked or used
    if (it.interactive === false) asset.rules = { permission: "look" };
    // A "shelf" prop floated at shelf height in 0.7; now it stands on a side table (shared by props close together)
    if (it.slot === "shelf" && y > 0.3 && def.slots.includes("surface")) {
      let table = out.find((o) => o.type === "table_side" && o.fromShelf && Math.hypot(o.pos[0] - x, o.pos[2] - z) < 0.3);
      if (!table) {
        const tid = newId("side_table", taken);
        taken.add(tid);
        table = { id: tid, type: "table_side", slot: "floor", pos: [x, 0, z], rot: 0, scale: 1, colors: {}, state: {}, fromShelf: true };
        out.push(table);
        notes.push("A side table was added under a shelf prop so it doesn't float");
      }
      asset.parent = table.id;
      asset.surface = "top";
      asset.slot = "surface";
      asset.pos = [Math.round((x - table.pos[0]) * 1000) / 1000, 0, Math.round((z - table.pos[2]) * 1000) / 1000];
    }
    out.push(asset);
  }
  for (const o of out) delete o.fromShelf;
  return out;
}
