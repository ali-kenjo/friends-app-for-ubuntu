// ---------- Drawing your own models (.glb) in the room ----------
// A model is loaded once per file and cloned for each thing that uses it. Its textures are capped at
// 2048 px, normals are made when the file has none, and every part casts and takes shadows. "Stylize"
// moves its materials onto the kit's families (wood, fabric, metal…), so it sits with the rest of the room;
// materials named c1, c2 and c3 take the thing's colors. A model with more triangles than the graphics
// level allows is drawn as a soft box of its size instead (the Inspector says why).
// The same loader re-skins a built-in thing that wears one of your models (asset.glb).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { material } from "./kit/materials.js";

export const MAX_TEXTURE = 2048;
// Triangles one model may have at each graphics level
export const TRIANGLE_CAP = { low: 40000, medium: 120000, high: 250000, ultra: 500000 };

const files = new Map(); // glb id → Promise<THREE.Group>
const loader = new GLTFLoader();

export function tooDetailed(entry, level) {
  return (entry?.info?.triangles || 0) > (TRIANGLE_CAP[level] || TRIANGLE_CAP.high);
}

// A texture bigger than the cap is drawn again at the cap
function capTexture(tex) {
  const img = tex?.image;
  if (!img || !(img.width > MAX_TEXTURE || img.height > MAX_TEXTURE)) return;
  const k = MAX_TEXTURE / Math.max(img.width, img.height);
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  tex.image = c;
  tex.needsUpdate = true;
}

// The file's scene, parsed once (from the helper, or from bytes the wizard already has)
export function loadModel(glbId, bytes = null) {
  if (!bytes && files.has(glbId)) return files.get(glbId);
  const p = (bytes ? loader.parseAsync(bytes, "") : loader.loadAsync(`/api/room-assets/${encodeURIComponent(glbId)}`)).then((gltf) => {
    const scene = gltf.scene || gltf.scenes?.[0];
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      for (const m of [].concat(o.material)) for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap"]) capTexture(m?.[k]);
    });
    return scene;
  });
  if (!bytes) files.set(glbId, p);
  p.catch(() => files.delete(glbId));
  return p;
}

export function forgetModel(glbId) {
  files.delete(glbId);
}

// What kit family a model's material looks like (by its name and its own settings)
function familyOf(m) {
  const n = String(m.name || "").toLowerCase();
  if (m.transparent && m.opacity < 0.8) return "glass";
  if (/glass|window|lens/.test(n)) return "glass";
  if (/wood|oak|walnut|pine|plank/.test(n)) return "wood";
  if (/fabric|cloth|cushion|velvet|linen|wool|textile/.test(n)) return "fabric";
  if (/leather/.test(n)) return "leather";
  if (/leaf|plant|grass|foliage/.test(n)) return "leaf";
  if (/ceramic|porcelain|tile/.test(n)) return "ceramic";
  if (/paper|book|card/.test(n)) return "paper";
  if (/rubber|tyre|tire/.test(n)) return "rubber";
  if (/emiss|light|glow|lamp/.test(n) || (m.emissive && m.emissive.getHex() > 0 && (m.emissiveIntensity ?? 1) > 0.5)) return "emissive";
  if (/metal|steel|iron|chrome|brass|gold|alumin/.test(n) || (m.metalness ?? 0) > 0.5) return "metal";
  return "plastic";
}

// One material of the model, as the room draws it
function styled(m, { stylize, colors, level }) {
  const slot = /^c[123]$/.test(m.name) ? m.name : null;
  const own = slot && colors[slot];
  if (!stylize) {
    if (!own) return m;
    const c = m.clone();
    c.color?.set(own);
    return c;
  }
  // A material with its own picture keeps it (softened); a plain one becomes a kit material
  if (m.map) {
    const c = m.clone();
    c.roughness = Math.max(0.45, c.roughness ?? 0.6);
    c.metalness = Math.min(c.metalness ?? 0, 0.6);
    if (own) c.color?.set(own);
    return c;
  }
  const color = own || `#${(m.color || new THREE.Color("#cccccc")).getHexString()}`;
  // (noAO: a model's geometry has no baked-shading colors, which the kit's Low materials read)
  return material({ family: familyOf(m), noAO: true }, color, level);
}

// A soft box of the model's size, for a model too detailed for this graphics level
function stand_in(entry, colors, level) {
  const { w, d } = entry.footprint;
  const geo = new THREE.BoxGeometry(w, entry.height, d);
  geo.translate(0, entry.height / 2, 0);
  const mesh = new THREE.Mesh(geo, material({ family: "clay", noAO: true }, colors.c1 || "#c9b8a0", level));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// entry: the model's catalog entry ({ glb, unit, slots, stylize, footprint, height, info });
// def: the thing's own entry (the built-in one when re-skinning). Returns a built asset whose group fills
// in when the file has loaded ({ group, meshes, glowing, ready }).
export function buildModel(entry, asset, level, { def = entry } = {}) {
  const group = new THREE.Group();
  group.name = `model:${entry.id}`;
  const built = { group, meshes: [], glowing: [], named: {}, update: null, ready: null };
  const colors = { ...Object.fromEntries((def.colors || []).map((c) => [c.key, c.def])), ...(asset.colors || {}) };
  if (tooDetailed(entry, level)) {
    group.add(stand_in(entry, colors, level));
    built.ready = Promise.resolve(built);
    return built;
  }
  built.ready = loadModel(entry.glb || entry.id)
    .then((scene) => {
      const copy = scene.clone(true);
      copy.scale.setScalar(entry.unit || 1);
      copy.updateMatrixWorld(true);
      // Sitting where its slot says: on the floor, flat against the wall, or hanging from the ceiling
      const box = new THREE.Box3().setFromObject(copy);
      const slot = asset.slot || def.slots?.[0] || "floor";
      const cx = (box.min.x + box.max.x) / 2;
      const cz = (box.min.z + box.max.z) / 2;
      if (slot === "wall") copy.position.set(-cx, -box.min.y, -box.min.z);
      else if (slot === "ceiling") copy.position.set(-cx, -box.max.y, -cz);
      else copy.position.set(-cx, -box.min.y, -cz);
      copy.traverse((o) => {
        if (!o.isMesh) return;
        o.material = Array.isArray(o.material) ? o.material.map((m) => styled(m, { stylize: entry.stylize !== false, colors, level })) : styled(o.material, { stylize: entry.stylize !== false, colors, level });
        o.castShadow = true;
        o.receiveShadow = true;
        built.meshes.push(o);
        for (const m of [].concat(o.material)) if (m.userData?.glow) built.glowing.push(m);
        if (o.name) built.named[o.name] = o;
      });
      group.add(copy);
      return built;
    })
    .catch(() => {
      // The file is gone or damaged: a box of its size keeps its place in the room
      group.add(stand_in(entry, colors, level));
      return built;
    });
  return built;
}
