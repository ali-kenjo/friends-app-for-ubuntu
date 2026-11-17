// Every asset builder, by its catalog id. A builder gets a Build (kit/build.js) and describes the asset's
// pieces; buildAsset() turns a catalog entry and an instance into meshes.
import { Build } from "../kit/build.js";
import * as furniture from "./furniture.js";
import * as soft from "./soft.js";
import * as things from "./things.js";
import * as cozy from "./cozy.js";
import * as more_study from "./more-study.js";
import * as more_nature from "./more-nature.js";
import * as more_play from "./more-play.js";
import * as more_home from "./more-home.js";
import * as more_furniture from "./more-furniture.js";

export const BUILDERS = {};
for (const mod of [furniture, soft, things, cozy, more_furniture, more_home, more_play, more_nature, more_study]) {
  for (const [id, fn] of Object.entries(mod)) if (typeof fn === "function" && !id.startsWith("_")) BUILDERS[id] = fn;
}

export const hasBuilder = (def) => Boolean(def && BUILDERS[def.id]);

// def: catalog entry; asset: { colors, state, id }; level: quality tier
export function buildAsset(def, asset = {}, level = "high") {
  const fn = BUILDERS[def.id];
  if (!fn) return null;
  const seed = [...String(asset.id || def.id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const b = new Build({ def, colors: asset.colors || {}, level, seed, state: { ...(def.states || {}), ...(asset.state || {}) } });
  fn(b, asset);
  const built = b.finish();
  built.group.userData.assetType = def.id;
  return built;
}
