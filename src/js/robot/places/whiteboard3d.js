// ---------- 3D Room Whiteboard Prop & Canvas Reflection ----------
// Procedural Three.js 3D board in 7 styles with live 2D canvas texture reflection,
// arm kinematics attachment points, laser pointer spotlight, and erasing sweeps.
import * as THREE from "three";
import { matte, glossy } from "./kit.js";

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
  // Node test mock
  return {
    width: w,
    height: h,
    getContext: () => ({
      save: () => {},
      restore: () => {},
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      ellipse: () => {},
      rect: () => {},
      fillText: () => {},
      measureText: () => ({ width: 60 }),
      setLineDash: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      fillStyle: "#ffffff",
      strokeStyle: "#000000",
      lineWidth: 1,
      font: "16px sans-serif",
      textAlign: "left",
      textBaseline: "top",
    }),
  };
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

  // 4. Render Vector Document items to 2D Canvas
  function renderDocument(doc) {
    if (!ctx) return;
    const page = doc?.pages?.[doc?.activePageIndex || 0] || doc?.pages?.[0];

    // Background fill & pattern
    ctx.save();
    ctx.clearRect(0, 0, canvasW, canvasH);

    if (normStyle === "chalkboard") {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, canvasW, canvasH);
      // Subtle chalk grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      const step = 32;
      for (let x = 0; x < canvasW; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasH);
        ctx.stroke();
      }
      for (let y = 0; y < canvasH; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasW, y);
        ctx.stroke();
      }
    } else if (normStyle === "cork") {
      ctx.fillStyle = "#d97706";
      ctx.fillRect(0, 0, canvasW, canvasH);
    } else if (normStyle === "screen") {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.08)";
      ctx.lineWidth = 1;
      for (let x = 0; x < canvasW; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasH);
        ctx.stroke();
      }
      for (let y = 0; y < canvasH; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasW, y);
        ctx.stroke();
      }
    } else {
      // Whiteboard / Glass / Easel / Flipchart default
      ctx.fillStyle = normStyle === "glass" ? "rgba(241, 245, 249, 0.6)" : "#ffffff";
      ctx.fillRect(0, 0, canvasW, canvasH);
      // Faint dot grid
      ctx.fillStyle = "#e2e8f0";
      for (let x = 24; x < canvasW; x += 28) {
        for (let y = 24; y < canvasH; y += 28) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (!page || !Array.isArray(page.items)) {
      ctx.restore();
      if (texture) texture.needsUpdate = true;
      return;
    }

    // Scale canvas coords from model virtual resolution (1600x1000) to 1024x640
    const sx = canvasW / 1600;
    const sy = canvasH / 1000;

    for (const item of page.items) {
      if (!item) continue;
      const type = item.type || item.kind;

      if (type === "stroke" && Array.isArray(item.points) && item.points.length > 0) {
        ctx.save();
        ctx.strokeStyle = normStyle === "chalkboard" ? "#f8fafc" : item.color || "#1e293b";
        ctx.lineWidth = Math.max(1.5, (item.size || 3) * sx);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        const p0 = item.points[0];
        ctx.moveTo(p0.x * sx, p0.y * sy);
        for (let i = 1; i < item.points.length; i++) {
          const pt = item.points[i];
          ctx.lineTo(pt.x * sx, pt.y * sy);
        }
        ctx.stroke();
        ctx.restore();
      } else if (type === "shape") {
        ctx.save();
        const x = (item.x || 0) * sx;
        const y = (item.y || 0) * sy;
        const w = (item.width || 120) * sx;
        const h = (item.height || 80) * sy;
        const stroke = normStyle === "chalkboard" ? "#e2e8f0" : item.strokeColor || item.stroke || "#3b82f6";
        const fill = item.fillColor || item.fill;

        ctx.strokeStyle = stroke;
        ctx.lineWidth = Math.max(1, (item.strokeWidth ?? 2) * sx);

        if (item.shapeType === "circle" || item.shapeType === "ellipse") {
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
          if (fill && fill !== "none" && fill !== "transparent") {
            ctx.fillStyle = fill;
            ctx.fill();
          }
          if (item.strokeWidth !== 0 && stroke !== "none") ctx.stroke();
        } else if (item.shapeType === "triangle") {
          ctx.beginPath();
          ctx.moveTo(x + w / 2, y);
          ctx.lineTo(x + w, y + h);
          ctx.lineTo(x, y + h);
          ctx.closePath();
          if (fill && fill !== "none") {
            ctx.fillStyle = fill;
            ctx.fill();
          }
          ctx.stroke();
        } else {
          // Default rect
          if (fill && fill !== "none" && fill !== "transparent") {
            ctx.fillStyle = fill;
            ctx.fillRect(x, y, w, h);
          }
          if (item.strokeWidth !== 0 && stroke !== "none") {
            ctx.strokeRect(x, y, w, h);
          }
        }

        if (item.label) {
          ctx.fillStyle = normStyle === "chalkboard" ? "#ffffff" : "#1e293b";
          ctx.font = `bold ${Math.max(11, 14 * sx)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(item.label, x + w / 2, y + h / 2);
        }
        ctx.restore();
      } else if (type === "text") {
        ctx.save();
        const x = (item.x || 0) * sx;
        const y = (item.y || 0) * sy;
        const fSize = Math.max(12, (item.fontSize || 22) * sx);
        ctx.fillStyle = normStyle === "chalkboard" ? "#fef08a" : item.color || "#1e293b";
        ctx.font = `${item.handwriting ? "italic " : ""}${fSize}px sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(item.text || "", x, y);
        ctx.restore();
      } else if (type === "sticky") {
        ctx.save();
        const x = (item.x || 0) * sx;
        const y = (item.y || 0) * sy;
        const w = (item.width || 160) * sx;
        const h = (item.height || 160) * sy;
        ctx.fillStyle = item.color || "#fef3c7";
        ctx.shadowColor = "rgba(0,0,0,0.15)";
        ctx.shadowBlur = 6;
        ctx.fillRect(x, y, w, h);
        ctx.shadowColor = "transparent";

        ctx.fillStyle = "#1e293b";
        ctx.font = `${13 * sx}px sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(item.text || "", x + 8, y + 10);
        ctx.restore();
      } else if (type === "checklist") {
        ctx.save();
        const x = (item.x || 0) * sx;
        const y = (item.y || 0) * sy;
        const w = (item.width || 220) * sx;
        const h = (item.height || 140) * sy;
        ctx.fillStyle = normStyle === "chalkboard" ? "rgba(255,255,255,0.08)" : "#f8fafc";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = normStyle === "chalkboard" ? "#64748b" : "#cbd5e1";
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = normStyle === "chalkboard" ? "#ffffff" : "#0f172a";
        ctx.font = `bold ${13 * sx}px sans-serif`;
        ctx.fillText(item.title || "Checklist", x + 10, y + 8);

        ctx.font = `${12 * sx}px sans-serif`;
        let curY = y + 28;
        for (const chk of item.items || []) {
          ctx.fillText(`[${chk.checked ? "✓" : " "}] ${chk.text || ""}`, x + 12, curY);
          curY += 20 * sy;
        }
        ctx.restore();
      } else if (type === "diagram") {
        ctx.save();
        const x = (item.x || 0) * sx;
        const y = (item.y || 0) * sy;
        const w = (item.width || 340) * sx;
        const h = (item.height || 220) * sy;
        ctx.fillStyle = normStyle === "screen" ? "#1e1b4b" : "rgba(224, 231, 255, 0.4)";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "#6366f1";
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = normStyle === "chalkboard" ? "#a5b4fc" : "#4338ca";
        ctx.font = `bold ${12 * sx}px sans-serif`;
        ctx.fillText(`📊 Diagram (${item.syntax || "mermaid"})`, x + 8, y + 8);
        ctx.font = `${11 * sx}px monospace`;
        ctx.fillText((item.code || "").slice(0, 48), x + 8, y + 28);
        ctx.restore();
      }
    }

    ctx.restore();
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
