// ---------- How the robot is shaded: soft (the usual) or cel-shaded with ink outlines ----------
// Settings → Robot → Graphics → "The robot's shading" (settings.visualStyle.shaderTheme, kept from 1.0:
// "anime_cel" is cel-shaded, anything else soft; 1.0's "realistic" and "minimalist" looked like soft on the
// 1.1 robot and are gone, DECISIONS R50).
//
// Cel: each solid part gets a toon material that shares the part's own color object, so the robot's colors
// (Studio → Colors, the accent) keep applying; glowing parts, the face screen and see-through parts keep their
// material (their colors and the glow pass stay as they are). An ink outline is added under each solid part.
import * as THREE from "three";

let gradient = null;
function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 170, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const INK = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { uInk: { value: new THREE.Color("#15171d") }, uThickness: { value: 0.011 } },
  vertexShader: "uniform float uThickness; void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uThickness, 1.0); }",
  fragmentShader: "uniform vec3 uInk; void main() { gl_FragColor = vec4(uInk, 1.0); }",
});

const glowing = (m) => m.userData?.glow || (m.emissiveIntensity > 0.25 && m.emissive && m.emissive.getHex() !== 0) || m.isMeshBasicMaterial;
const skip = (o) => o.name === "FaceScreen" || o.userData?.isDynamicCanvas || o.userData?.styleOutline;

// robot: { root, materials }; style: "soft" | "cel"
export function styleRobot(robot, style) {
  if (!robot?.root) return;
  const want = style === "cel" ? "cel" : "soft";
  if (robot.root.userData.style === want) return;
  robot.root.userData.style = want;
  const old = [];
  robot.root.traverse((o) => o.userData?.styleOutline && old.push(o));
  for (const ink of old) ink.removeFromParent();
  robot.root.traverse((o) => {
    if (!o.isMesh || skip(o)) return;
    const own = o.userData.ownMaterial;
    if (want === "soft") {
      if (own) {
        o.material.dispose?.();
        o.material = own;
        o.userData.ownMaterial = null;
      }
      return;
    }
    const m = own || o.material;
    if (!m || Array.isArray(m) || m.isShaderMaterial || m.transparent || glowing(m) || !m.color) return;
    const toon = new THREE.MeshToonMaterial({ map: m.map || null, gradientMap: toonGradient(), side: m.side, vertexColors: m.vertexColors });
    toon.color = m.color; // shared: the robot's colors keep applying
    toon.userData.styled = true;
    o.userData.ownMaterial = m;
    o.material = toon;
    if (o.geometry?.attributes?.normal) {
      const ink = new THREE.Mesh(o.geometry, INK);
      ink.userData.styleOutline = true;
      ink.raycast = () => {};
      ink.castShadow = false;
      ink.renderOrder = -1;
      o.add(ink);
    }
  });
}

// Its parts' own materials, wherever it is styled (for code that changes materials, like the quality's detail)
export const ownMaterial = (mesh) => mesh.userData.ownMaterial || mesh.material;
