// ---------- 3D Room Whiteboard Prop & Canvas Reflection ----------
// Procedural Three.js 3D board in 7 styles with live 2D canvas texture reflection,
// arm kinematics attachment points, laser pointer spotlight, and erasing sweeps.
import * as THREE from "three";
import { matte, glossy } from "./kit.js";
import { renderPageTo } from "../../whiteboard/render.mjs";

// The look of the writing surface for each kind of board
const STYLE_THEME = { whiteboard: "classic", chalkboard: "chalkboard", glass: "glass", cork: "cork", easel: "classic", flipchart: "classic", screen: "neon" };

export const WHITEBOARD_STYLES = [
  "whiteboard",
  "chalkboard",
  "glass",
  "cork",
  "easel",
  "flipchart",
  "screen",
];

// Fallback offscreen canvas creator for both browser and test environments
function createOffscreenCanvas(w = 1024, h = 640) {
  if (typeof document !== "undefined" && document.createElement) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  // Node test mock: a context that takes any drawing call
  const noop = () => {};
  const ctx = new Proxy({ measureText: (text) => ({ width: String(text).length * 8 }), createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }) }, {
    get: (t, k) => (k in t ? t[k] : noop),
    set: (t, k, v) => ((t[k] = v), true),
  });
  return { width: w, height: h, getContext: () => ctx };
}

export function buildWhiteboard3D({
  style = "whiteboard",
  width = 2.1,
  height = 1.32,
  keep = (x) => x,
  colors = {},
  glow = null,
  level = "high",
} = {}) {
  const g = new THREE.Group();
  g.name = `Prop_whiteboard_${style}`;
  const low = level === "low";
  const normStyle = WHITEBOARD_STYLES.includes(style) ? style : "whiteboard";

  const add = (geo, mat, x = 0, y = 0, z = 0, cast = !low) => {
    const m = new THREE.Mesh(keep(geo), keep(mat));
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = !low;
    g.add(m);
    return m;
  };

  // 1. Offscreen 2D Canvas & Dynamic Texture
  const canvasW = 1024;
  const canvasH = 640;
  const canvas = createOffscreenCanvas(canvasW, canvasH);
  const ctx = canvas.getContext ? canvas.getContext("2d") : null;

  let texture = null;
  if (typeof THREE.CanvasTexture !== "undefined" && canvas.width) {
    try {
      texture = keep(new THREE.CanvasTexture(canvas));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
    } catch {
      texture = null;
    }
  }

  // 2. Board Face Geometry & Material
  const faceMat = texture
    ? keep(
        new THREE.MeshStandardMaterial({
          map: texture,
          roughness: normStyle === "glass" ? 0.1 : normStyle === "chalkboard" ? 0.9 : 0.4,
          metalness: normStyle === "screen" ? 0.2 : 0.05,
          transparent: normStyle === "glass",
          opacity: normStyle === "glass" ? 0.88 : 1.0,
        })
      )
    : matte(normStyle === "chalkboard" ? "#1b2e25" : "#ffffff");

  // Center plane for board writing face
  const face = add(new THREE.PlaneGeometry(width, height), faceMat, 0, 0, 0.012, false);

  // 3. Style-specific physical props, stand, and frames
  const frameColor =
    normStyle === "chalkboard"
      ? "#854d0e" // warm wood
      : normStyle === "cork"
      ? "#b45309" // oak
      : normStyle === "screen"
      ? "#09090b" // obsidian bezel
      : normStyle === "glass"
      ? "#cbd5e1" // metal standoffs
      : "#94a3b8"; // brushed aluminum

  const borderThick = 0.035;
  const boardDepth = 0.024;

  if (normStyle === "whiteboard") {
    // Top, bottom, left, right aluminum frame
    add(new THREE.BoxGeometry(width + borderThick * 2, borderThick, boardDepth * 1.5), glossy(frameColor, 0.3), 0, height / 2 + borderThick / 2, 0);
    add(new THREE.BoxGeometry(width + borderThick * 2, borderThick, boardDepth * 1.5), glossy(frameColor, 0.3), 0, -height / 2 - borderThick / 2, 0);
    add(new THREE.BoxGeometry(borderThick, height, boardDepth * 1.5), glossy(frameColor, 0.3), -width / 2 - borderThick / 2, 0, 0);
    add(new THREE.BoxGeometry(borderThick, height, boardDepth * 1.5), glossy(frameColor, 0.3), width / 2 + borderThick / 2, 0, 0);

    // Marker & eraser bottom tray
    const trayWidth = width * 0.7;
    add(new THREE.BoxGeometry(trayWidth, 0.015, 0.08), glossy("#64748b", 0.4), 0, -height / 2 - borderThick, 0.04);
    // Markers on tray
    add(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8), matte("#2563eb"), -0.12, -height / 2 - borderThick + 0.012, 0.04).rotation.z = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8), matte("#dc2626"), 0.02, -height / 2 - borderThick + 0.012, 0.04).rotation.z = Math.PI / 2;
    // Eraser block
    add(new THREE.BoxGeometry(0.09, 0.03, 0.04), matte("#334155"), 0.22, -height / 2 - borderThick + 0.018, 0.04);
  } else if (normStyle === "chalkboard") {
    // Rich wooden frame
    add(new THREE.BoxGeometry(width + borderThick * 2, borderThick * 1.2, boardDepth * 1.6), matte(frameColor), 0, height / 2 + borderThick * 0.6, 0);
    add(new THREE.BoxGeometry(width + borderThick * 2, borderThick * 1.2, boardDepth * 1.6), matte(frameColor), 0, -height / 2 - borderThick * 0.6, 0);
    add(new THREE.BoxGeometry(borderThick * 1.2, height, boardDepth * 1.6), matte(frameColor), -width / 2 - borderThick * 0.6, 0, 0);
    add(new THREE.BoxGeometry(borderThick * 1.2, height, boardDepth * 1.6), matte(frameColor), width / 2 + borderThick * 0.6, 0, 0);

    // Wood chalk shelf
    add(new THREE.BoxGeometry(width * 0.65, 0.018, 0.07), matte("#a16207"), 0, -height / 2 - borderThick * 1.2, 0.035);
    // White chalk sticks & felt eraser
    add(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 6), matte("#fef08a"), -0.08, -height / 2 - borderThick * 1.2 + 0.01, 0.035).rotation.z = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 6), matte("#ffffff"), 0.03, -height / 2 - borderThick * 1.2 + 0.01, 0.035).rotation.z = Math.PI / 2;
    add(new THREE.BoxGeometry(0.08, 0.025, 0.04), matte("#78350f"), 0.18, -height / 2 - borderThick * 1.2 + 0.015, 0.035);
  } else if (normStyle === "glass") {
    // Floating frameless glass with 4 metallic wall standoffs
    const r = 0.022;
    const insetX = width / 2 - 0.06;
    const insetY = height / 2 - 0.06;
    const standoffMat = glossy("#94a3b8", 0.2, { metalness: 0.8 });
    add(new THREE.CylinderGeometry(r, r, 0.035, 12), standoffMat, -insetX, insetY, 0.015).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(r, r, 0.035, 12), standoffMat, insetX, insetY, 0.015).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(r, r, 0.035, 12), standoffMat, -insetX, -insetY, 0.015).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(r, r, 0.035, 12), standoffMat, insetX, -insetY, 0.015).rotation.x = Math.PI / 2;
  } else if (normStyle === "cork") {
    // Pine frame & pinned sticky accessories
    add(new THREE.BoxGeometry(width + borderThick * 2, borderThick, boardDepth), matte(frameColor), 0, height / 2 + borderThick / 2, 0);
    add(new THREE.BoxGeometry(width + borderThick * 2, borderThick, boardDepth), matte(frameColor), 0, -height / 2 - borderThick / 2, 0);
    add(new THREE.BoxGeometry(borderThick, height, boardDepth), matte(frameColor), -width / 2 - borderThick / 2, 0, 0);
    add(new THREE.BoxGeometry(borderThick, height, boardDepth), matte(frameColor), width / 2 + borderThick / 2, 0, 0);
  } else if (normStyle === "easel") {
    // Three-legged wooden artist tripod
    const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 2.2, 8);
    const legMat = matte("#b45309");
    const legL = add(legGeo, legMat, -width * 0.35, -0.3, -0.15);
    legL.rotation.z = 0.12;
    legL.rotation.x = -0.1;
    const legR = add(legGeo, legMat, width * 0.35, -0.3, -0.15);
    legR.rotation.z = -0.12;
    legR.rotation.x = -0.1;
    const legBack = add(legGeo, legMat, 0, -0.3, -0.45);
    legBack.rotation.x = 0.32;
    // Shelf bar
    add(new THREE.BoxGeometry(width * 1.05, 0.04, 0.09), legMat, 0, -height / 2 - 0.02, 0.04);
  } else if (normStyle === "flipchart") {
    // Tall stand with top paper clamp
    const standMat = glossy("#334155", 0.3, { metalness: 0.6 });
    add(new THREE.BoxGeometry(width * 0.95, 0.06, 0.03), standMat, 0, height / 2 + 0.03, 0.02);
    // Legs
    const pole = add(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 8), standMat, 0, -height / 2 - 0.6, -0.05);
    void pole;
  } else if (normStyle === "screen") {
    // Slim bezel digital screen with subtle power LED
    add(new THREE.BoxGeometry(width + 0.04, height + 0.04, 0.03), glossy("#09090b", 0.2), 0, 0, 0);
    // Power LED
    add(new THREE.SphereGeometry(0.005, 8, 8), matte("#38bdf8"), width / 2 - 0.03, -height / 2 + 0.02, 0.016);
  }

  // Laser Pointer / Spotlight Glow Marker
  const spotlightGroup = new THREE.Group();
  spotlightGroup.visible = false;
  const spotGeo = new THREE.RingGeometry(0.015, 0.035, 24);
  const spotMat = keep(
    new THREE.MeshBasicMaterial({
      color: "#ef4444",
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    })
  );
  const spotMesh = new THREE.Mesh(spotGeo, spotMat);
  spotMesh.position.z = 0.018;
  spotlightGroup.add(spotMesh);
  g.add(spotlightGroup);

  let spotTimer = 0;

  // 4. The board as it is, drawn by the same code as the board on screen (src/js/whiteboard/render.mjs)
  // opts: { pageIndex, reveal (Map: things being written), images (ImageCache), pattern }
  function renderDocument(doc, opts = {}) {
    if (!ctx) return;
    const pages = doc?.pages || [];
    const page = pages[Number.isInteger(opts.pageIndex) ? opts.pageIndex : doc?.activePageIndex || 0] || pages[0] || { items: [] };
    try {
      renderPageTo(canvas, page, { region: { x: 0, y: 0, width: 1600, height: 1000 }, theme: STYLE_THEME[normStyle] || "classic", pattern: opts.pattern || "grid", gridSize: 28, reveal: opts.reveal, images: opts.images });
    } catch {
      /* a board that can't be drawn this frame stays as it was */
    }
    if (texture) texture.needsUpdate = true;
  }

  // 5. Pointing Spotlight Laser Cue
  function pointAt(modelX = 800, modelY = 500) {
    const normX = (modelX / 1600 - 0.5) * width;
    const normY = (0.5 - modelY / 1000) * height;
    spotMesh.position.set(normX, normY, 0.018);
    spotlightGroup.visible = true;
    spotTimer = 2.4; // display for 2.4s
  }

  function update(dt = 0.016, time = 0) {
    if (spotTimer > 0) {
      spotTimer -= dt;
      const pulse = 0.75 + 0.25 * Math.sin(time * 12);
      spotMesh.scale.set(pulse, pulse, pulse);
      if (spotTimer <= 0) {
        spotlightGroup.visible = false;
      }
    }
  }

  return {
    group: g,
    face,
    texture,
    canvas,
    ctx,
    style: normStyle,
    renderDocument,
    pointAt,
    update,
  };
}
