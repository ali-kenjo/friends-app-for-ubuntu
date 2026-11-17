// Every asset builder, by its catalog `build` path ("category/id"). A builder gets a Build (kit/build.js)
// and describes the asset's pieces; buildAsset() turns a catalog entry and an instance into meshes.
import { Build } from "../kit/build.js";
import * as furniture from "./furniture.js";
import * as soft from "./soft.js";
import * as things from "./things.js";
import * as cozy from "./cozy.js";

const byCategory = {
  tables: furniture,
  seating: furniture,
  storage: furniture,
  furniture,
  rugs: soft,
  plants: soft,
  lights: things,
  study: things,
  kitchen: things,
  tech: things,
  windows: things,
  wall: things,
  toys: things,
};
// Pieces whose catalog category differs from their file
const EXTRA = { "lights/string_lights": cozy.string_lights, "lights/fireplace": cozy.fireplace, "companions/cat": cozy.cat, "tech/turntable": cozy.turntable, "kitchen/kettle": cozy.kettle, "lights/candles": cozy.candles };

export const BUILDERS = {};
for (const [category, mod] of Object.entries(byCategory)) {
  for (const [id, fn] of Object.entries(mod)) if (typeof fn === "function") BUILDERS[`${category}/${id}`] = fn;
}
Object.assign(BUILDERS, EXTRA);

export const hasBuilder = (def) => Boolean(def && BUILDERS[def.build]);

// def: catalog entry; asset: { colors, state, id }; level: quality tier
export function buildAsset(def, asset = {}, level = "high") {
  const fn = BUILDERS[def.build];
  if (!fn) return null;
  const seed = [...String(asset.id || def.id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const b = new Build({ def, colors: asset.colors || {}, level, seed, state: { ...(def.states || {}), ...(asset.state || {}) } });
  fn(b, asset);
  const built = b.finish();
  built.group.userData.assetType = def.id;
  return built;
}
