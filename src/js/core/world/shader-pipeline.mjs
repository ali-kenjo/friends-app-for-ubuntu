// ---------- Hot-Swappable 4-Style Shader Pipeline (core/world/shader-pipeline.mjs) ----------
// Applies any of 4 visual themes across robot, room, furniture, props, and toys
// WITHOUT altering geometry, colliders, or A* navigation:
//   1. realistic_pbr
//   2. anime_cel (3-band stepped toon gradient + inverted-hull ink outlines + rim light)
//   3. cozy_stylized (default warm tactile satin/matte PBR)
//   4. minimalist_studio (matte architectural surfaces with accent highlights)
import * as THREE from "three";

export const SHADER_THEMES = ["realistic_pbr", "anime_cel", "cozy_stylized", "minimalist_studio"];

let gradient3Texture = null;
const proceduralTexCache = new Map();

function getToonGradient3() {
  if (gradient3Texture) return gradient3Texture;
  const data = new Uint8Array([
    82, 82, 92, 255,
    172, 172, 180, 255,
    255, 255, 255, 255,
  ]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  gradient3Texture = tex;
  return tex;
}

/** Generate cached procedural PBR maps on offscreen canvas (zero external assets). */
export function getProceduralTexture(kind = "wood") {
  if (proceduralTexCache.has(kind)) return proceduralTexCache.get(kind);
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (kind === "wood") {
    ctx.fillStyle = "#8a5c3a";
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 2) {
      const wave = Math.sin(y * 0.14) * 10 + Math.cos(y * 0.05) * 8;
      ctx.fillStyle = y % 6 === 0 ? "rgba(48, 28, 14, 0.18)" : "rgba(210, 165, 115, 0.08)";
      ctx.fillRect(0, y + (wave % 2), 256, 2);
    }
  } else if (kind === "metal") {
    ctx.fillStyle = "#8b93a2";
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y++) {
      const v = 132 + ((y * 17) % 24);
      ctx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
      ctx.fillRect(0, y, 256, 1);
    }
  } else if (kind === "fabric") {
    ctx.fillStyle = "#7a7d8a";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    for (let i = 0; i < 256; i += 4) {
      ctx.fillRect(i, 0, 1, 256);
      ctx.fillRect(0, i, 256, 1);
    }
  } else if (kind === "paper") {
    ctx.fillStyle = "#f4efe4";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = i % 2 ? "rgba(180,165,140,0.07)" : "rgba(255,255,255,0.12)";
      ctx.fillRect((i * 73) % 256, (i * 41) % 256, 2, 1);
    }
  } else {
    // petal / organic subsurface tint
    const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    grad.addColorStop(0, "#ffd8e4");
    grad.addColorStop(1, "#e26a8d");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  proceduralTexCache.set(kind, tex);
  return tex;
}

const OUTLINE_MAT = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    uInkColor: { value: new THREE.Color("#111319") },
    uThickness: { value: 0.012 },
  },
  vertexShader: /* glsl */ `
    uniform float uThickness;
    void main() {
      vec3 displaced = position + normal * uThickness;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uInkColor;
    void main() {
      gl_FragColor = vec4(uInkColor, 1.0);
    }
  `,
});

function inferSurfaceTag(mesh) {
  const hint = `${mesh.name || ""} ${mesh.parent?.name || ""} ${mesh.userData?.surfaceTag || ""}`.toLowerCase();
  if (/wood|desk|table|chair|bookshelf|frame|kalimba|block/.test(hint)) return "wood";
  if (/metal|chrome|leg|cradle|sphere|drone|console|cup|pen|marker/.test(hint)) return "metal";
  if (/fabric|rug|curtain|pillow|cushion/.test(hint)) return "fabric";
  if (/paper|page|notebook|book/.test(hint)) return "paper";
  if (/petal|flower|leaf|plant|rose/.test(hint)) return "petal";
  return "generic";
}

function captureBaseMaterial(mesh) {
  if (!mesh.userData.__baseMaterial) {
    mesh.userData.__baseMaterial = mesh.material;
  }
  return mesh.userData.__baseMaterial;
}

function makeCelMaterial(baseMat) {
  const color = baseMat.color ? baseMat.color.clone() : new THREE.Color("#ffffff");
  // Boost saturation subtly for crisp anime cel look
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(hsl.h, Math.min(1, hsl.s * 1.18), Math.min(0.92, Math.max(0.14, hsl.l * 1.04)));

  const mat = new THREE.MeshToonMaterial({
    color,
    map: baseMat.map || null,
    gradientMap: getToonGradient3(),
    emissive: baseMat.emissive ? baseMat.emissive.clone() : new THREE.Color(0x000000),
    emissiveIntensity: baseMat.emissiveIntensity ?? 1,
    transparent: Boolean(baseMat.transparent),
    opacity: baseMat.opacity ?? 1,
    side: baseMat.side ?? THREE.FrontSide,
  });

  // Rim lighting enhancement in toon shader
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `
      float rim = 1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewPosition)));
      gl_FragColor.rgb += smoothstep(0.62, 0.95, rim) * 0.16 * diffuseColor.rgb;
      #include <dithering_fragment>
      `
    );
  };
  return mat;
}

function makeMinimalMaterial(baseMat, accentHex = "#4f7df3") {
  const isAccent = (baseMat.emissiveIntensity || 0) > 0.25 || baseMat.emissive?.getHex() > 0;
  const color = isAccent
    ? new THREE.Color(accentHex)
    : baseMat.color
      ? baseMat.color.clone().lerp(new THREE.Color("#e8ecf2"), 0.52)
      : new THREE.Color("#e8ecf2");
  return new THREE.MeshStandardMaterial({
    color,
    map: baseMat.map || null,
    roughness: isAccent ? 0.35 : 0.86,
    metalness: 0.04,
    emissive: baseMat.emissive ? baseMat.emissive.clone() : new THREE.Color(0),
    emissiveIntensity: isAccent ? 0.65 : 0,
    transparent: Boolean(baseMat.transparent),
    opacity: baseMat.opacity ?? 1,
    side: baseMat.side ?? THREE.FrontSide,
  });
}

function makeRealisticMaterial(baseMat, tag) {
  const tex = tag !== "generic" && !baseMat.map ? getProceduralTexture(tag) : null;
  const color = baseMat.color ? baseMat.color.clone() : new THREE.Color("#ffffff");
  const roughness = tag === "metal" ? 0.22 : tag === "wood" ? 0.44 : tag === "paper" ? 0.78 : tag === "fabric" ? 0.9 : 0.36;
  const metalness = tag === "metal" ? 0.85 : 0.04;
  return new THREE.MeshPhysicalMaterial({
    color,
    map: baseMat.map || null,
    bumpMap: tex,
    bumpScale: tag === "wood" ? 0.012 : tag === "fabric" ? 0.016 : 0.004,
    roughnessMap: tex,
    roughness,
    metalness,
    clearcoat: tag === "generic" || tag === "wood" ? 0.22 : 0,
    clearcoatRoughness: 0.28,
    sheen: tag === "fabric" || tag === "petal" ? 0.55 : 0,
    sheenColor: tag === "petal" ? new THREE.Color("#ffd6e0") : new THREE.Color("#ffffff"),
    emissive: baseMat.emissive ? baseMat.emissive.clone() : new THREE.Color(0),
    emissiveIntensity: baseMat.emissiveIntensity ?? 1,
    transparent: Boolean(baseMat.transparent),
    opacity: baseMat.opacity ?? 1,
    side: baseMat.side ?? THREE.FrontSide,
  });
}

export class ShaderPipeline {
  constructor() {
    this.activeTheme = "cozy_stylized";
    this.accentHex = "#f5a94a";
  }

  /** Remove generated cel outline children without disturbing physics/colliders. */
  clearOutlines(root) {
    if (!root) return;
    const toRemove = [];
    root.traverse((obj) => {
      if (obj.userData?.__celOutline) toRemove.push(obj);
    });
    for (const child of toRemove) child.parent?.remove(child);
  }

  /**
   * Apply a visual shader theme across any Three.js object hierarchy cleanly.
   * @param {THREE.Object3D} root
   * @param {"realistic_pbr"|"anime_cel"|"cozy_stylized"|"minimalist_studio"} theme
   * @param {{ accent?: string, outlineEnabled?: boolean }} [opts]
   */
  applyStyle(root, theme = "cozy_stylized", opts = {}) {
    if (!root) return;
    this.activeTheme = SHADER_THEMES.includes(theme) ? theme : "cozy_stylized";
    if (opts.accent) this.accentHex = opts.accent;
    this.clearOutlines(root);

    const outlineAllowed = opts.outlineEnabled !== false && this.activeTheme === "anime_cel";

    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      if (obj.userData?.__celOutline || obj.userData?.skipShaderPipeline) return;
      // Preserve dynamic face screen shader / canvas overlays cleanly
      if (obj.name === "FaceScreen" || obj.name === "DynamicCanvas" || obj.userData?.isDynamicCanvas) return;
      if (obj.material.isShaderMaterial || Array.isArray(obj.material)) return;

      const base = captureBaseMaterial(obj);
      if (this.activeTheme === "cozy_stylized") {
        if (obj.userData.__derivedMaterial) {
          obj.userData.__derivedMaterial.dispose?.();
          obj.userData.__derivedMaterial = null;
        }
        obj.material = base;
        return;
      }

      if (obj.userData.__derivedMaterial) {
        obj.userData.__derivedMaterial.dispose?.();
        obj.userData.__derivedMaterial = null;
      }

      let nextMat = base;
      const tag = inferSurfaceTag(obj);
      if (this.activeTheme === "anime_cel") {
        nextMat = makeCelMaterial(base);
        if (outlineAllowed && !base.transparent && obj.geometry?.attributes?.normal) {
          const outline = new THREE.Mesh(obj.geometry, OUTLINE_MAT);
          outline.name = `${obj.name || "Mesh"}_CelOutline`;
          outline.userData.__celOutline = true;
          outline.raycast = () => {};
          outline.castShadow = false;
          outline.receiveShadow = false;
          obj.add(outline);
        }
      } else if (this.activeTheme === "realistic_pbr") {
        nextMat = makeRealisticMaterial(base, tag);
      } else if (this.activeTheme === "minimalist_studio") {
        nextMat = makeMinimalMaterial(base, this.accentHex);
      }

      obj.userData.__derivedMaterial = nextMat;
      obj.material = nextMat;
    });
  }
}

export const shaderPipeline = new ShaderPipeline();
