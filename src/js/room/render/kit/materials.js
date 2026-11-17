// ---------- The material library: every asset uses only these families ----------
// (docs/design/room.md, "Materials"). material(spec, color, level) returns a shared material from a cache
// keyed by family, options, color and tier: two oak tables share one material, and recoloring an asset
// just picks another material from the cache, never a new geometry.
//
// spec: { family, finish?, map?, scale?, rough?, metal?, emissive?, intensity?, opacity?, side?, two?, flat? }
//   family: plastic | clay | ceramic | wood | fabric | leather | metal | glass | leaf | paper | rubber | emissive
//   map:    a procedural texture kind (texture-gen.mjs), or the family's own
import * as THREE from "three";
import { surfaceMaps, TEXTURE_SIZE } from "./textures.js";

const cache = new Map();

// Each family's look (Physical where it needs sheen or clearcoat; plain Standard on Low)
const FAMILIES = {
  plastic: { rough: 0.45, map: null },
  clay: { rough: 0.8, map: "plaster", relief: 0.35 },
  ceramic: { rough: 0.25, clearcoat: 0.5, map: null },
  wood: { rough: 0.55, map: "wood", relief: 0.35 },
  fabric: { rough: 0.85, sheen: 0.7, map: "weave", relief: 0.45 },
  leather: { rough: 0.45, sheen: 0.2, map: "leather", relief: 0.5 },
  metal: { rough: 0.3, metal: 1, map: null },
  glass: { rough: 0.05, opacity: 0.32, map: null },
  leaf: { rough: 0.55, map: null },
  paper: { rough: 0.9, map: "paper", relief: 0.2 },
  rubber: { rough: 0.9, map: null },
  emissive: { rough: 0.6, map: null },
};

// Finishes within a family
const FINISHES = {
  "wood:lacquered": { clearcoat: 0.12, rough: 0.5 },
  "wood:painted": { map: "plaster", rough: 0.55, relief: 0.15 },
  "metal:polished": { rough: 0.15 },
  "metal:brushed": { rough: 0.3, map: "brushed", relief: 0.3 },
  "metal:black": { rough: 0.35 },
  "fabric:velvet": { sheen: 1.0, map: "velvet", rough: 0.9 },
  "fabric:boucle": { sheen: 0.6, map: "boucle", rough: 0.95, relief: 0.6 },
  "fabric:knit": { sheen: 0.6, map: "knit", rough: 0.95, relief: 0.7 },
  "fabric:wool": { sheen: 0.7, map: "weave", rough: 0.95 },
  "plastic:gloss": { rough: 0.25 },
  "clay:matte": { rough: 0.85 },
};

let anisotropy = 8;
export const setAnisotropy = (n) => (anisotropy = n);

// Leaves and petals: lit softly from behind too (wrap lighting), lighter towards the tip
function leafShader(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <uv_pars_vertex>", "#include <uv_pars_vertex>\nvarying float vTip;").replace("#include <uv_vertex>", "#include <uv_vertex>\nvTip = uv.y;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <uv_pars_fragment>", "#include <uv_pars_fragment>\nvarying float vTip;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= mix(0.72, 1.12, smoothstep(0.0, 1.0, vTip));")
      // Wrap: the dark side never goes black (light comes through a leaf)
      .replace("#include <lights_fragment_begin>", "#include <lights_fragment_begin>")
      .replace("#include <aomap_fragment>", "#include <aomap_fragment>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * 0.18;");
  };
  mat.customProgramCacheKey = () => "room-leaf";
}

// Big surfaces (floors, walls, rugs) must not show their tiling: a slow, world-space variation on top
export function macroVariation(mat, { strength = 0.12, scale = 0.35 } = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev?.(shader, r);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vMacroWorld;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvMacroWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vMacroWorld;
float macroHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float macroNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(macroHash(i), macroHash(i + vec2(1.0, 0.0)), f.x), mix(macroHash(i + vec2(0.0, 1.0)), macroHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`,
      )
      .replace("#include <color_fragment>", `#include <color_fragment>\n{ vec2 mp = vMacroWorld.xz * ${scale.toFixed(3)} + vMacroWorld.y * 0.21; float m = macroNoise(mp) * 0.65 + macroNoise(mp * 2.7) * 0.35; diffuseColor.rgb *= 1.0 + ${strength.toFixed(3)} * (m - 0.5) * 2.0; }`);
  };
  mat.customProgramCacheKey = () => `room-macro-${strength}-${scale}-${mat.userData.leaf ? 1 : 0}`;
  return mat;
}

function texturesFor(kind, level, scale, seed) {
  const maps = surfaceMaps(kind, { size: TEXTURE_SIZE[level] || 512, seed });
  // Each material has its own texture objects (they share the image), so repeat can differ
  const out = {};
  for (const k of ["albedo", "normal", "rough"]) {
    const src = maps[k];
    const t = src.clone();
    t.source = src.source;
    t.repeat.set(scale, scale);
    t.anisotropy = anisotropy;
    t.userData.shared = true;
    out[k] = t;
    // When the worker fills the source in, this clone must upload too
    Object.defineProperty(t, "version", { get: () => src.version, set() {}, configurable: true });
  }
  return out;
}

// spec + color (hex) + level → a material (shared)
export function material(spec, color = "#cccccc", level = "high") {
  const fam = FAMILIES[spec.family] || FAMILIES.plastic;
  const fin = spec.finish ? FINISHES[`${spec.family}:${spec.finish}`] || {} : {};
  const lowTier = level === "low";
  const key = JSON.stringify([spec, color, lowTier ? "low" : level === "medium" ? "medium" : "high"]);
  let mat = cache.get(key);
  if (mat) return mat;
  const rough = spec.rough ?? fin.rough ?? fam.rough;
  const metal = spec.metal ?? fin.metal ?? fam.metal ?? 0;
  const clearcoat = spec.clearcoat ?? fin.clearcoat ?? fam.clearcoat ?? 0;
  const sheen = spec.sheen ?? fin.sheen ?? fam.sheen ?? 0;
  const physical = !lowTier && (clearcoat > 0 || sheen > 0 || spec.family === "glass");
  const base = { color: new THREE.Color(color), roughness: rough, metalness: metal };
  if (spec.family === "glass") {
    mat = new THREE.MeshPhysicalMaterial({ ...base, transparent: true, opacity: spec.opacity ?? fin.opacity ?? fam.opacity, depthWrite: false, envMapIntensity: 1.6, ior: 1.45, specularIntensity: 1, side: THREE.DoubleSide });
    mat.userData.transparent = true;
  } else if (physical) {
    mat = new THREE.MeshPhysicalMaterial({ ...base, clearcoat, clearcoatRoughness: 0.25, sheen, sheenRoughness: 0.55, sheenColor: new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.35) });
  } else {
    mat = new THREE.MeshStandardMaterial(base);
  }
  if (spec.family === "emissive" || spec.emissive) {
    mat.emissive = new THREE.Color(spec.emissive || color);
    mat.emissiveIntensity = spec.intensity ?? 1.6;
    mat.userData.glow = true;
  }
  // Kit geometry always carries a color attribute: per-piece tints, and on Low the baked ambient occlusion
  mat.vertexColors = Boolean(spec.vertexColors) || (lowTier && !spec.noAO);
  const mapKind = spec.map === false ? null : spec.map || fin.map || fam.map;
  if (mapKind) {
    const t = texturesFor(mapKind, level, spec.scale ?? 1, spec.seed ?? 1);
    mat.map = t.albedo;
    if (!lowTier) {
      mat.normalMap = t.normal;
      const relief = spec.relief ?? fin.relief ?? fam.relief ?? 0.5;
      mat.normalScale = new THREE.Vector2(relief, relief);
      mat.roughnessMap = t.rough;
    }
  }
  if (spec.family === "leaf") {
    mat.side = THREE.DoubleSide;
    mat.userData.leaf = true;
    leafShader(mat);
  }
  if (spec.side === "double") mat.side = THREE.DoubleSide;
  if (spec.macro) macroVariation(mat, spec.macro === true ? {} : spec.macro);
  if (spec.flat) mat.flatShading = true;
  // Big matte surfaces (floors, walls) take only a little of the room's reflection: at grazing angles it would wash them out
  if (spec.env !== undefined) mat.envMapIntensity = spec.env;
  mat.userData.shared = true;
  mat.userData.spec = spec;
  mat.name = `${spec.family}${spec.finish ? `:${spec.finish}` : ""}`;
  cache.set(key, mat);
  return mat;
}

// How many materials are cached (for the performance overlay and tests)
export const materialCount = () => cache.size;

// Frees everything (the engine's dispose)
export function disposeMaterials() {
  for (const m of cache.values()) {
    for (const k of ["map", "normalMap", "roughnessMap"]) m[k]?.dispose?.();
    m.dispose();
  }
  cache.clear();
}
