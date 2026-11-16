// ---------- Unified InteractiveAsset Framework & Custom .GLB Loader ----------
// Shared entity schema, metric bottom-center GLB normalization, named socket
// extraction (socket_hand_grip, anchor_robot_stand, DynamicCanvas), procedural foley
// WebAudio SFX, and 3 built-in Room Layout Presets.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const gltfLoader = new GLTFLoader();

/**
 * Normalize an imported GLTF/GLB scene to metric scale (max dimension = targetSize meters)
 * with bottom-center floor/surface pivot alignment (minY = 0, centerX = 0, centerZ = 0)
 * and detect optional named sockets: socket_hand_grip, anchor_robot_stand, DynamicCanvas.
 * @param {THREE.Object3D} rootScene
 * @param {{ targetHeight?: number }} [opts]
 */
export function normalizeGlbHierarchy(rootScene, opts = {}) {
  const wrapper = new THREE.Group();
  wrapper.name = "CustomGLBWrapper";
  wrapper.add(rootScene);

  rootScene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rootScene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const targetHeight = Math.max(0.08, Math.min(3.5, Number(opts.targetHeight) || 1.0));
  const scale = targetHeight / maxDim;

  rootScene.scale.multiplyScalar(scale);
  rootScene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  wrapper.updateMatrixWorld(true);

  const sockets = {
    handGrip: null,
    robotStand: null,
    dynamicCanvasMeshes: [],
  };

  wrapper.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
    const name = String(obj.name || "");
    if (name === "socket_hand_grip") sockets.handGrip = obj;
    else if (name === "anchor_robot_stand") sockets.robotStand = obj;
    if (
      name === "DynamicCanvas" ||
      obj.material?.name === "DynamicCanvas" ||
      obj.userData?.DynamicCanvas === true
    ) {
      obj.userData.isDynamicCanvas = true;
      sockets.dynamicCanvasMeshes.push(obj);
    }
  });

  return { group: wrapper, sockets };
}

/**
 * Load a .glb/.gltf model from URL or ArrayBuffer and normalize it with socket detection.
 * @param {string|ArrayBuffer} source
 * @param {{ targetHeight?: number }} [opts]
 */
export async function loadNormalizedGlb(source, opts = {}) {
  if (typeof source === "string") {
    const gltf = await gltfLoader.loadAsync(source);
    return normalizeGlbHierarchy(gltf.scene || gltf.scenes?.[0], opts);
  }
  const gltf = await new Promise((resolve, reject) => gltfLoader.parse(source, "", resolve, reject));
  return normalizeGlbHierarchy(gltf.scene || gltf.scenes?.[0], opts);
}

/** Compute snap target Y when an asset sits above a supporting surface (e.g. desk_table). */
export function resolveSurfaceSnap(asset, allAssets = []) {
  if (!asset || asset.surfaceSnap === false) return { y: asset.y || 0, attachedTo: null };
  const ax = Number(asset.x || 0);
  const az = Number(asset.z || 0);
  for (const parent of allAssets) {
    if (!parent || parent.id === asset.id || parent.visible === false || !parent.surfaceZone) continue;
    const zone = parent.surfaceZone;
    const halfW = (zone.width || 1.2) * (parent.scale || 1) * 0.5;
    const halfD = (zone.depth || 0.7) * (parent.scale || 1) * 0.5;
    const topY = (parent.y || 0) + (zone.height || 0.74) * (parent.scale || 1);
    const dx = Math.abs(ax - (parent.x || 0));
    const dz = Math.abs(az - (parent.z || 0));
    if (dx <= halfW && dz <= halfD) {
      return { y: Number(topY.toFixed(3)), attachedTo: parent.id };
    }
  }
  return { y: Number((asset.groundY || 0).toFixed(3)), attachedTo: null };
}

// ---------- Procedural WebAudio Foley Engine (Zero external audio files) ----------
let foleyCtx = null;

function ensureFoleyCtx() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!foleyCtx) {
    try {
      foleyCtx = new Ctx();
    } catch {
      return null;
    }
  }
  if (foleyCtx.state === "suspended") foleyCtx.resume().catch(() => {});
  return foleyCtx;
}

/**
 * Play a procedural WebAudio sound effect for any interactive asset/toy event.
 * @param {"marker"|"wipe"|"page"|"water"|"console"|"bounce"|"rubik"|"drone"|"holo"|"cradle"|"block"|"kalimba"|"footstep"} kind
 * @param {number} [volume] 0..1
 * @param {number} [pitchHz] optional note override
 */
export function playFoley(kind, volume = 0.55, pitchHz = 0) {
  const v = Math.max(0, Math.min(1, Number(volume)));
  if (v <= 0.005) return;
  const ctx = ensureFoleyCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  const osc = ctx.createOscillator();
  osc.connect(gain);

  if (kind === "marker" || kind === "wipe") {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(kind === "wipe" ? 320 : 1180, now);
    osc.frequency.exponentialRampToValueAtTime(kind === "wipe" ? 180 : 1650, now + 0.08);
    gain.gain.setValueAtTime(0.06 * v, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.start(now);
    osc.stop(now + 0.095);
  } else if (kind === "page" || kind === "water") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(kind === "water" ? 520 : 410, now);
    osc.frequency.exponentialRampToValueAtTime(kind === "water" ? 860 : 240, now + 0.14);
    gain.gain.setValueAtTime(0.08 * v, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.start(now);
    osc.stop(now + 0.17);
  } else if (kind === "bounce" || kind === "block" || kind === "cradle") {
    osc.type = kind === "cradle" ? "sine" : "triangle";
    const startF = kind === "cradle" ? 1950 : kind === "block" ? 210 : 280;
    const endF = kind === "cradle" ? 1800 : 95;
    osc.frequency.setValueAtTime(startF, now);
    osc.frequency.exponentialRampToValueAtTime(endF, now + 0.11);
    gain.gain.setValueAtTime(0.14 * v, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.start(now);
    osc.stop(now + 0.14);
  } else if (kind === "rubik") {
    osc.type = "square";
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.045);
    gain.gain.setValueAtTime(0.05 * v, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.start(now);
    osc.stop(now + 0.055);
  } else if (kind === "kalimba") {
    const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    const freq = pitchHz || notes[Math.floor(Math.random() * notes.length)];
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.15 * v, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    osc.start(now);
    osc.stop(now + 0.44);
  } else if (kind === "console") {
    osc.type = "square";
    osc.frequency.setValueAtTime(740, now);
    osc.frequency.setValueAtTime(980, now + 0.06);
    gain.gain.setValueAtTime(0.06 * v, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.start(now);
    osc.stop(now + 0.14);
  } else {
    osc.type = "sine";
    osc.frequency.setValueAtTime(kind === "holo" ? 440 : 185, now);
    osc.frequency.exponentialRampToValueAtTime(kind === "holo" ? 660 : 150, now + 0.18);
    gain.gain.setValueAtTime(0.06 * v, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.21);
  }
}

// ---------- Unified Asset Catalog Metadata & 3 Built-In Room Presets ----------
export const ASSET_DEFINITIONS = Object.freeze({
  desk_table: {
    kind: "desk_table",
    name: "Studio Desk",
    category: "furniture",
    colliderRadius: 0.65,
    approachOffset: [0, 0.72],
    surfaceSnap: false,
    surfaceZone: { width: 1.5, depth: 0.76, height: 0.74 },
    targetHeight: 0.74,
    defaultWeight: 35,
    defaultDwell: [3, 6],
  },
  study_chair: {
    kind: "study_chair",
    name: "Swivel Chair",
    category: "furniture",
    colliderRadius: 0.36,
    approachOffset: [0.42, 0.36],
    surfaceSnap: false,
    targetHeight: 0.88,
    defaultWeight: 25,
    defaultDwell: [3, 6],
  },
  whiteboard: {
    kind: "whiteboard",
    name: "Interactive Whiteboard",
    category: "furniture",
    colliderRadius: 0.45,
    approachOffset: [0, 0.85],
    surfaceSnap: false,
    targetHeight: 1.72,
    defaultWeight: 45,
    defaultDwell: [4, 9],
  },
  vase_flowers: {
    kind: "vase_flowers",
    name: "Vase & Flowers",
    category: "flower",
    colliderRadius: 0.18,
    approachOffset: [0, 0.55],
    surfaceSnap: true,
    targetHeight: 0.38,
    defaultWeight: 55,
    defaultDwell: [3, 7],
  },
  books_notebook: {
    kind: "books_notebook",
    name: "Books & Open Notebook",
    category: "desk_prop",
    colliderRadius: 0.2,
    approachOffset: [0, 0.55],
    surfaceSnap: true,
    targetHeight: 0.22,
    defaultWeight: 50,
    defaultDwell: [4, 8],
  },
  pens_cup: {
    kind: "pens_cup",
    name: "Pens & Markers Cup",
    category: "desk_prop",
    colliderRadius: 0.12,
    approachOffset: [0, 0.52],
    surfaceSnap: true,
    targetHeight: 0.18,
    defaultWeight: 30,
    defaultDwell: [2, 4],
  },
  gaming_console: {
    kind: "gaming_console",
    name: "Gaming Console",
    category: "desk_prop",
    colliderRadius: 0.22,
    approachOffset: [0, 0.58],
    surfaceSnap: true,
    targetHeight: 0.16,
    defaultWeight: 60,
    defaultDwell: [5, 10],
  },
  bouncy_ball: {
    kind: "bouncy_ball",
    name: "Bouncy Physics Ball",
    category: "toy",
    colliderRadius: 0.16,
    approachOffset: [0, 0.45],
    surfaceSnap: false,
    targetHeight: 0.24,
    defaultWeight: 70,
    defaultDwell: [4, 9],
  },
  rubiks_cube: {
    kind: "rubiks_cube",
    name: "3D Rubik's Cube",
    category: "toy",
    colliderRadius: 0.14,
    approachOffset: [0, 0.52],
    surfaceSnap: true,
    targetHeight: 0.14,
    defaultWeight: 65,
    defaultDwell: [5, 10],
  },
  rc_drone: {
    kind: "rc_drone",
    name: "Mini RC Drone",
    category: "toy",
    colliderRadius: 0.2,
    approachOffset: [0, 0.62],
    surfaceSnap: false,
    targetHeight: 0.18,
    defaultWeight: 65,
    defaultDwell: [5, 11],
  },
  retro_handheld: {
    kind: "retro_handheld",
    name: "Retro Handheld",
    category: "toy",
    colliderRadius: 0.14,
    approachOffset: [0, 0.52],
    surfaceSnap: true,
    targetHeight: 0.15,
    defaultWeight: 55,
    defaultDwell: [5, 9],
  },
  holo_projector: {
    kind: "holo_projector",
    name: "Holo-Projector",
    category: "toy",
    colliderRadius: 0.18,
    approachOffset: [0, 0.55],
    surfaceSnap: true,
    targetHeight: 0.26,
    defaultWeight: 60,
    defaultDwell: [4, 9],
  },
  newtons_cradle: {
    kind: "newtons_cradle",
    name: "Newton's Cradle",
    category: "toy",
    colliderRadius: 0.18,
    approachOffset: [0, 0.54],
    surfaceSnap: true,
    targetHeight: 0.24,
    defaultWeight: 50,
    defaultDwell: [4, 8],
  },
  stacking_blocks: {
    kind: "stacking_blocks",
    name: "Stacking Blocks",
    category: "toy",
    colliderRadius: 0.18,
    approachOffset: [0, 0.52],
    surfaceSnap: true,
    targetHeight: 0.28,
    defaultWeight: 60,
    defaultDwell: [5, 9],
  },
  mini_synth: {
    kind: "mini_synth",
    name: "Mini Synth / Kalimba",
    category: "toy",
    colliderRadius: 0.18,
    approachOffset: [0, 0.54],
    surfaceSnap: true,
    targetHeight: 0.12,
    defaultWeight: 55,
    defaultDwell: [4, 8],
  },
});

export function makeAssetEntry(kind, overrides = {}) {
  const def = ASSET_DEFINITIONS[kind] || ASSET_DEFINITIONS.bouncy_ball;
  return {
    id: overrides.id || kind,
    kind: def.kind,
    name: overrides.name || def.name,
    category: def.category,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    z: overrides.z ?? -0.8,
    rotY: overrides.rotY ?? 0,
    scale: overrides.scale ?? 1,
    visible: overrides.visible !== false,
    colliderRadius: def.colliderRadius,
    approachOffset: [...def.approachOffset],
    surfaceSnap: overrides.surfaceSnap ?? def.surfaceSnap,
    surfaceZone: def.surfaceZone ? { ...def.surfaceZone } : null,
    attachedTo: overrides.attachedTo || null,
    customGlbId: overrides.customGlbId || "",
    state: overrides.state || "idle",
  };
}

export const ROOM_LAYOUT_PRESETS = Object.freeze({
  creator_studio_desk: {
    id: "creator_studio_desk",
    label: "Creator Studio Desk",
    description: "Balanced studio with desk props, interactive whiteboard, flowers, and showcase toys.",
    homeSpot: { x: 0.0, z: 0.18, rotY: 0 },
    assets: [
      makeAssetEntry("desk_table", { id: "desk_table", x: -0.95, y: 0, z: -1.15, rotY: 0.14 }),
      makeAssetEntry("study_chair", { id: "study_chair", x: -0.92, y: 0, z: -0.45, rotY: 0.14 }),
      makeAssetEntry("whiteboard", { id: "whiteboard", x: 1.25, y: 0, z: -1.25, rotY: -0.42 }),
      makeAssetEntry("vase_flowers", { id: "vase_flowers", x: -1.42, y: 0.74, z: -1.22, attachedTo: "desk_table" }),
      makeAssetEntry("books_notebook", { id: "books_notebook", x: -0.95, y: 0.74, z: -1.08, attachedTo: "desk_table" }),
      makeAssetEntry("pens_cup", { id: "pens_cup", x: -0.64, y: 0.74, z: -1.18, attachedTo: "desk_table" }),
      makeAssetEntry("gaming_console", { id: "gaming_console", x: -0.42, y: 0.74, z: -1.02, attachedTo: "desk_table" }),
      makeAssetEntry("rubiks_cube", { id: "rubiks_cube", x: -1.18, y: 0.74, z: -0.95, attachedTo: "desk_table" }),
      makeAssetEntry("holo_projector", { id: "holo_projector", x: -0.78, y: 0.74, z: -1.32, attachedTo: "desk_table" }),
      makeAssetEntry("bouncy_ball", { id: "bouncy_ball", x: 0.78, y: 0, z: -0.15 }),
      makeAssetEntry("rc_drone", { id: "rc_drone", x: 0.45, y: 0, z: -1.05 }),
      makeAssetEntry("newtons_cradle", { id: "newtons_cradle", x: -1.28, y: 0.74, z: -1.36, attachedTo: "desk_table" }),
    ],
  },
  cozy_study_corner: {
    id: "cozy_study_corner",
    label: "Cozy Study Corner",
    description: "Warm study corner featuring all desk study tools, kalimba, stacking blocks, and flowers.",
    homeSpot: { x: 0.15, z: 0.25, rotY: -0.1 },
    assets: [
      makeAssetEntry("desk_table", { id: "desk_table", x: -1.05, y: 0, z: -1.25, rotY: 0.26 }),
      makeAssetEntry("study_chair", { id: "study_chair", x: -0.88, y: 0, z: -0.58, rotY: 0.26 }),
      makeAssetEntry("whiteboard", { id: "whiteboard", x: 1.05, y: 0, z: -1.35, rotY: -0.25 }),
      makeAssetEntry("vase_flowers", { id: "vase_flowers", x: -1.48, y: 0.74, z: -1.3 }),
      makeAssetEntry("books_notebook", { id: "books_notebook", x: -0.96, y: 0.74, z: -1.16 }),
      makeAssetEntry("pens_cup", { id: "pens_cup", x: -0.68, y: 0.74, z: -1.24 }),
      makeAssetEntry("retro_handheld", { id: "retro_handheld", x: -0.55, y: 0.74, z: -1.06 }),
      makeAssetEntry("mini_synth", { id: "mini_synth", x: -1.24, y: 0.74, z: -1.05 }),
      makeAssetEntry("stacking_blocks", { id: "stacking_blocks", x: 0.55, y: 0, z: -0.45 }),
    ],
  },
  minimalist_open_stage: {
    id: "minimalist_open_stage",
    label: "Minimalist Open Stage",
    description: "Clean presentation stage with movable whiteboard and holo-projector.",
    homeSpot: { x: 0.0, z: 0.12, rotY: 0 },
    assets: [
      makeAssetEntry("whiteboard", { id: "whiteboard", x: 1.15, y: 0, z: -1.15, rotY: -0.35 }),
      makeAssetEntry("holo_projector", { id: "holo_projector", x: -0.95, y: 0, z: -0.85, surfaceSnap: false }),
      makeAssetEntry("bouncy_ball", { id: "bouncy_ball", x: -0.65, y: 0, z: -0.25 }),
    ],
  },
});
