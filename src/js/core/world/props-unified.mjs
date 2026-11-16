// ---------- Unified Room Furniture & Interactive Desk Props ----------
// Builds procedural 3D meshes + articulated sub-parts + CanvasTextures + foley triggers
// for all core studio furniture & props:
//   1. Interactive Whiteboard (movable/rotatable/scalable, step-by-step animated writing + wipe erase)
//   2. Desk Table & Study Chair (with surface-snap zones & sit anchor)
//   3. Vase & Flowers (Vibrant Bloom / Healthy / Drooping + watering-can pour animation)
//   4. Books & Open Notebook (detachable hand book + live session notes DynamicCanvas)
//   5. Pens & Markers Cup (detachable marker & pen meshes)
//   6. Gaming Console (animated status LEDs + detachable wireless controller)
import * as THREE from "three";
import { playFoley } from "./asset-framework.mjs";

function makeCanvas(w, h) {
  if (typeof document === "undefined") return { canvas: null, ctx: null };
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext("2d") };
}

export function buildWhiteboardProp(asset, foleyVol = 0.6) {
  const g = new THREE.Group();
  g.name = `Asset_${asset.id}`;
  const boardW = 1.28;
  const boardH = 0.8;
  const centerY = 1.25;

  const frameMat = new THREE.MeshStandardMaterial({ color: "#363c48", roughness: 0.38, metalness: 0.55 });
  const legGeo = new THREE.CylinderGeometry(0.022, 0.024, 1.65, 10);
  const legL = new THREE.Mesh(legGeo, frameMat);
  legL.position.set(-boardW * 0.46, 0.825, 0);
  legL.castShadow = true;
  const legR = new THREE.Mesh(legGeo, frameMat);
  legR.position.set(boardW * 0.46, 0.825, 0);
  legR.castShadow = true;
  const tray = new THREE.Mesh(new THREE.BoxGeometry(boardW * 0.92, 0.032, 0.075), frameMat);
  tray.position.set(0, centerY - boardH * 0.5 - 0.025, 0.035);
  const backing = new THREE.Mesh(new THREE.BoxGeometry(boardW + 0.05, boardH + 0.05, 0.032), frameMat);
  backing.position.set(0, centerY, 0);
  backing.castShadow = true;
  backing.receiveShadow = true;

  const { canvas, ctx } = makeCanvas(1024, 640);
  const tex = canvas ? new THREE.CanvasTexture(canvas) : null;
  if (tex) tex.colorSpace = THREE.SRGBColorSpace;
  const faceMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: tex,
    roughness: 0.25,
    metalness: 0.02,
  });
  faceMat.name = "DynamicCanvas";
  const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(boardW, boardH), faceMat);
  faceMesh.name = "DynamicCanvas";
  faceMesh.userData.isDynamicCanvas = true;
  faceMesh.position.set(0, centerY, 0.018);

  // Animated eraser bar for wipe animation
  const eraser = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.048, 0.036),
    new THREE.MeshStandardMaterial({ color: "#e06d53", roughness: 0.6 })
  );
  eraser.position.set(-boardW * 0.36, centerY - boardH * 0.5, 0.04);

  const standAnchor = new THREE.Object3D();
  standAnchor.name = "anchor_robot_stand";
  standAnchor.position.set(0, 0, 0.82);
  standAnchor.rotation.y = Math.PI;

  g.add(legL, legR, tray, backing, faceMesh, eraser, standAnchor);

  const boardState = {
    title: "Studio Notes",
    bullets: ["Ask me anything!", "I can sketch flowcharts & plans live."],
    diagramType: "notes",
    visibleLines: 99,
    writingTimer: 0,
    wipingTimer: 0,
  };

  function redraw() {
    if (!ctx || !canvas) return;
    ctx.fillStyle = "#fbfaf6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle grid dots
    ctx.fillStyle = "#e2e6ef";
    for (let x = 32; x < canvas.width; x += 36) {
      for (let y = 32; y < canvas.height; y += 36) {
        ctx.fillRect(x, y, 2, 2);
      }
    }

    // Header bar
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 46px sans-serif";
    ctx.fillText(boardState.title || "Whiteboard", 54, 92, 916);
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(54, 114);
    ctx.lineTo(960, 114);
    ctx.stroke();

    const items = boardState.bullets.slice(0, boardState.visibleLines);
    if (boardState.diagramType === "flowchart" && items.length) {
      const boxW = 380;
      const boxH = 74;
      items.slice(0, 4).forEach((line, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const bx = 76 + col * 480;
        const by = 175 + row * 185;
        ctx.fillStyle = "#eff6ff";
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, 16);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#0f172a";
        ctx.font = "600 26px sans-serif";
        ctx.fillText(String(line).slice(0, 28), bx + 22, by + 46);
        if (idx < items.length - 1 && col === 0) {
          ctx.strokeStyle = "#64748b";
          ctx.beginPath();
          ctx.moveTo(bx + boxW + 10, by + boxH / 2);
          ctx.lineTo(bx + boxW + 86, by + boxH / 2);
          ctx.stroke();
        }
      });
    } else {
      ctx.font = "500 31px sans-serif";
      ctx.fillStyle = "#1e293b";
      items.forEach((line, i) => {
        const y = 186 + i * 74;
        ctx.fillStyle = "#2563eb";
        ctx.beginPath();
        ctx.arc(72, y - 10, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1e293b";
        ctx.fillText(String(line).slice(0, 56), 98, y, 870);
      });
    }

    if (boardState.wipingTimer > 0) {
      const sweepX = (1 - boardState.wipingTimer / 1.1) * canvas.width;
      ctx.fillStyle = "rgba(251, 250, 246, 0.85)";
      ctx.fillRect(0, 0, Math.max(0, sweepX), canvas.height);
    }

    if (tex) tex.needsUpdate = true;
  }

  redraw();

  function writeStructured({ title, bullets = [], diagramType = "notes" }) {
    boardState.title = title || "Notes";
    boardState.bullets = Array.isArray(bullets) ? bullets : [];
    boardState.diagramType = diagramType === "flowchart" ? "flowchart" : "notes";
    boardState.visibleLines = 0;
    boardState.writingTimer = 0.01;
    redraw();
  }

  function clearBoard() {
    boardState.wipingTimer = 1.1;
    playFoley("wipe", foleyVol);
  }

  function getTextSummary() {
    return `${boardState.title}: ${boardState.bullets.join("; ")}`.trim();
  }

  function update(dt) {
    if (boardState.writingTimer > 0 && boardState.visibleLines < boardState.bullets.length) {
      boardState.writingTimer += dt;
      if (boardState.writingTimer >= 0.62) {
        boardState.writingTimer = 0.01;
        boardState.visibleLines++;
        playFoley("marker", foleyVol);
        redraw();
      }
    } else if (boardState.visibleLines >= boardState.bullets.length) {
      boardState.writingTimer = 0;
    }

    if (boardState.wipingTimer > 0) {
      boardState.wipingTimer = Math.max(0, boardState.wipingTimer - dt);
      const t = 1 - boardState.wipingTimer / 1.1;
      eraser.position.set((-0.45 + t * 0.9) * boardW, centerY + Math.sin(t * 14) * 0.14, 0.04);
      redraw();
      if (boardState.wipingTimer === 0) {
        eraser.position.set(-boardW * 0.36, centerY - boardH * 0.5, 0.04);
        boardState.title = "";
        boardState.bullets = [];
        redraw();
      }
    }
  }

  return { group: g, writeStructured, clearBoard, getTextSummary, update, canvasTex: tex };
}

export function buildDeskTableProp(asset) {
  const g = new THREE.Group();
  g.name = `Asset_${asset.id}`;
  const topMat = new THREE.MeshStandardMaterial({ color: "#b68557", roughness: 0.45, metalness: 0.06 });
  topMat.name = "DeskWood";
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.05, 0.78), topMat);
  top.name = "DeskWoodTop";
  top.position.set(0, 0.715, 0);
  top.castShadow = true;
  top.receiveShadow = true;

  const legMat = new THREE.MeshStandardMaterial({ color: "#2d323e", roughness: 0.35, metalness: 0.7 });
  for (const [lx, lz] of [
    [-0.68, -0.32],
    [0.68, -0.32],
    [-0.68, 0.32],
    [0.68, 0.32],
  ]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.69, 10), legMat);
    leg.name = "DeskMetalLeg";
    leg.position.set(lx, 0.345, lz);
    leg.castShadow = true;
    g.add(leg);
  }

  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.03, 14), legMat);
  lampBase.position.set(-0.6, 0.755, -0.24);
  const lampNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.34, 8), legMat);
  lampNeck.position.set(-0.6, 0.92, -0.24);
  const bulbMat = new THREE.MeshStandardMaterial({
    color: "#fff2cc",
    emissive: "#ffb347",
    emissiveIntensity: 1.2,
    roughness: 0.25,
  });
  const bulb = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.12, 16, 1, true), bulbMat);
  bulb.name = "DeskLampBulb";
  bulb.userData.isLampBulb = true;
  bulb.position.set(-0.54, 1.08, -0.18);
  bulb.rotation.z = -0.35;

  g.add(top, lampBase, lampNeck, bulb);
  return { group: g, update() {} };
}

export function buildStudyChairProp(asset) {
  const g = new THREE.Group();
  g.name = `Asset_${asset.id}`;
  const cushionMat = new THREE.MeshStandardMaterial({ color: "#4e5d78", roughness: 0.85 });
  const baseMat = new THREE.MeshStandardMaterial({ color: "#2b303a", roughness: 0.35, metalness: 0.65 });

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.44), cushionMat);
  seat.name = "ChairFabricSeat";
  seat.position.set(0, 0.46, 0);
  seat.castShadow = true;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.42, 0.05), cushionMat);
  back.name = "ChairFabricBack";
  back.position.set(0, 0.72, 0.2);
  back.castShadow = true;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 10), baseMat);
  post.position.set(0, 0.24, 0);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.04, 12), baseMat);
  base.position.set(0, 0.02, 0);

  const standAnchor = new THREE.Object3D();
  standAnchor.name = "anchor_robot_stand";
  standAnchor.position.set(0.44, 0, 0.35);

  g.add(seat, back, post, base, standAnchor);
  return { group: g, update() {} };
}

export function buildVaseFlowersProp(asset, foleyVol = 0.6) {
  const g = new THREE.Group();
  g.name = `Asset_${asset.id}`;
  const vaseMat = new THREE.MeshStandardMaterial({ color: "#d6eef8", roughness: 0.2, metalness: 0.05 });
  const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.18, 16), vaseMat);
  vase.position.set(0, 0.09, 0);
  vase.castShadow = true;

  const stemPivot = new THREE.Group();
  stemPivot.position.set(0, 0.16, 0);
  const stemMat = new THREE.MeshStandardMaterial({ color: "#3b8c4e", roughness: 0.65 });
  const petalsMat = new THREE.MeshStandardMaterial({ color: "#f472b6", roughness: 0.55 });
  const flowers = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.17, 6), stemMat);
    stem.position.y = 0.085;
    const bud = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), petalsMat);
    bud.name = "FlowerPetal";
    bud.position.y = 0.175;
    f.add(stem, bud);
    f.position.set((i - 1) * 0.022, 0, (i % 2 ? 1 : -1) * 0.015);
    f.rotation.z = (i - 1) * 0.18;
    stemPivot.add(f);
    flowers.push(f);
  }

  // Watering can prop (visible during watering action)
  const canGroup = new THREE.Group();
  canGroup.visible = false;
  const canBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.052, 0.095, 12),
    new THREE.MeshStandardMaterial({ color: "#38bdf8", roughness: 0.35, metalness: 0.35 })
  );
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.015, 0.09, 8), canBody.material);
  spout.position.set(0.055, 0.02, 0);
  spout.rotation.z = -0.9;
  canGroup.add(canBody, spout);
  canGroup.position.set(-0.18, 0.36, 0.05);

  g.add(vase, stemPivot, canGroup);

  let hydration = "healthy"; // vibrant_bloom | healthy | drooping
  let waterAnim = 0;

  function setHydration(next) {
    hydration = ["vibrant_bloom", "healthy", "drooping"].includes(next) ? next : "healthy";
    if (hydration === "drooping") {
      petalsMat.color.set("#b0899a");
      stemPivot.rotation.x = 0.38;
    } else if (hydration === "vibrant_bloom") {
      petalsMat.color.set("#ff4da6");
      stemPivot.rotation.x = 0;
    } else {
      petalsMat.color.set("#f472b6");
      stemPivot.rotation.x = 0.08;
    }
  }

  function triggerWater() {
    waterAnim = 2.0;
    canGroup.visible = true;
    playFoley("water", foleyVol);
    setHydration("vibrant_bloom");
  }

  setHydration(asset.state === "drooping" ? "drooping" : "healthy");

  function update(dt, time) {
    stemPivot.rotation.z = Math.sin(time * 1.4) * 0.04;
    if (waterAnim > 0) {
      waterAnim -= dt;
      canGroup.rotation.z = -0.45 - Math.sin(time * 8) * 0.08;
      if (waterAnim <= 0) {
        canGroup.visible = false;
      }
    }
  }

  return { group: g, setHydration, triggerWater, getHydration: () => hydration, update };
}

export function buildBooksNotebookProp(asset, foleyVol = 0.6) {
  const g = new THREE.Group();
  g.name = `Asset_${asset.id}`;

  const coverColors = ["#c2410c", "#1d4ed8", "#15803d"];
  for (let i = 0; i < 3; i++) {
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.032, 0.24),
      new THREE.MeshStandardMaterial({ color: coverColors[i], roughness: 0.72 })
    );
    book.position.set(-0.16, 0.016 + i * 0.034, -0.02);
    book.rotation.y = (i - 1) * 0.08;
    book.castShadow = true;
    g.add(book);
  }

  // Open 3D notebook with live CanvasTexture
  const { canvas, ctx } = makeCanvas(512, 320);
  const tex = canvas ? new THREE.CanvasTexture(canvas) : null;
  if (tex) tex.colorSpace = THREE.SRGBColorSpace;
  const pageMat = new THREE.MeshStandardMaterial({ color: "#fffdf7", map: tex, roughness: 0.8 });
  pageMat.name = "DynamicCanvas";
  const notebookBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.018, 0.2),
    new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.6 })
  );
  notebookBase.position.set(0.09, 0.009, 0.02);
  const pagesMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.18), pageMat);
  pagesMesh.name = "DynamicCanvas";
  pagesMesh.userData.isDynamicCanvas = true;
  pagesMesh.rotation.x = -Math.PI / 2;
  pagesMesh.position.set(0.09, 0.019, 0.02);

  // Detachable hand book + grip socket
  const handGrip = new THREE.Object3D();
  handGrip.name = "socket_hand_grip";
  handGrip.position.set(-0.16, 0.12, 0);

  g.add(notebookBase, pagesMesh, handGrip);

  const notes = ["Studio Ready", "Tap or ask AI to add notes!"];
  let flipTimer = 0;

  function renderNotes() {
    if (!ctx || !canvas) return;
    ctx.fillStyle = "#fbf7ec";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Center spine + ruled lines
    ctx.fillStyle = "#d6cbb5";
    ctx.fillRect(255, 0, 2, canvas.height);
    ctx.strokeStyle = "#e2dccb";
    ctx.lineWidth = 1;
    for (let y = 44; y < canvas.height; y += 26) {
      ctx.beginPath();
      ctx.moveTo(16, y);
      ctx.lineTo(496, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("Session Notes", 24, 34);
    ctx.font = "500 15px sans-serif";
    notes.slice(-7).forEach((n, idx) => {
      ctx.fillText(`• ${String(n).slice(0, 28)}`, idx < 4 ? 22 : 272, 66 + (idx % 4) * 52);
    });
    if (tex) tex.needsUpdate = true;
  }

  renderNotes();

  function addNote(text) {
    if (!text) return;
    notes.push(String(text).slice(0, 100));
    if (notes.length > 12) notes.shift();
    flipTimer = 1.0;
    playFoley("page", foleyVol);
    renderNotes();
  }

  function update(dt) {
    if (flipTimer > 0) {
      flipTimer = Math.max(0, flipTimer - dt);
      pagesMesh.position.y = 0.019 + Math.sin(flipTimer * Math.PI * 2) * 0.004;
    }
  }

  return { group: g, addNote, getNotes: () => [...notes], update };
}

export function buildPensCupProp(asset) {
  const g = new THREE.Group();
  g.name = `Asset_${asset.id}`;
  const cup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.036, 0.11, 14),
    new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.4, metalness: 0.5 })
  );
  cup.name = "MetalCup";
  cup.position.set(0, 0.055, 0);
  cup.castShadow = true;

  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.14, 8),
    new THREE.MeshStandardMaterial({ color: "#2563eb", roughness: 0.35 })
  );
  marker.name = "Marker";
  marker.position.set(-0.012, 0.11, 0.008);
  marker.rotation.z = 0.18;

  const pen = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.14, 8),
    new THREE.MeshStandardMaterial({ color: "#f59e0b", roughness: 0.3, metalness: 0.4 })
  );
  pen.name = "Pen";
  pen.position.set(0.014, 0.115, -0.006);
  pen.rotation.z = -0.22;

  const grip = new THREE.Object3D();
  grip.name = "socket_hand_grip";
  grip.position.set(0, 0.14, 0);

  g.add(cup, marker, pen, grip);
  return {
    group: g,
    equipMarker(on) {
      marker.visible = !on;
    },
    equipPen(on) {
      pen.visible = !on;
    },
    update() {},
  };
}

export function buildGamingConsoleProp(asset, foleyVol = 0.6) {
  const g = new THREE.Group();
  g.name = `Asset_${asset.id}`;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.052, 0.18),
    new THREE.MeshStandardMaterial({ color: "#1f2430", roughness: 0.35, metalness: 0.5 })
  );
  body.position.set(0, 0.026, 0);
  body.castShadow = true;

  const ledMat = new THREE.MeshStandardMaterial({ color: "#38bdf8", emissive: "#38bdf8", emissiveIntensity: 1.4 });
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.008, 0.01), ledMat);
  led.name = "ConsoleLED";
  led.position.set(0, 0.048, 0.088);

  const controller = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.028, 0.068),
    new THREE.MeshStandardMaterial({ color: "#f1f5f9", roughness: 0.4 })
  );
  controller.name = "WirelessController";
  controller.position.set(0, 0.016, 0.15);

  const grip = new THREE.Object3D();
  grip.name = "socket_hand_grip";
  grip.position.copy(controller.position);

  g.add(body, led, controller, grip);
  let activeTimer = 0;

  function playSession() {
    activeTimer = 4.0;
    playFoley("console", foleyVol);
  }

  function update(dt, time) {
    if (activeTimer > 0) {
      activeTimer -= dt;
      ledMat.emissive.setHex(Math.sin(time * 12) > 0 ? 0x22d3ee : 0xa855f7);
      ledMat.emissiveIntensity = 1.9;
      controller.position.y = 0.022 + Math.sin(time * 10) * 0.004;
    } else {
      ledMat.emissive.setHex(0x38bdf8);
      ledMat.emissiveIntensity = 0.7 + 0.3 * Math.sin(time * 2.5);
    }
  }

  return { group: g, playSession, update };
}
