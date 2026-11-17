// ---------- Catalog thumbnails: drawn from the real 3D builders ----------
// One small offscreen renderer draws each asset at three-quarters on a soft neutral stage, one per idle
// moment, and keeps the picture in IndexedDB keyed by the catalog's version (a new catalog draws them
// again). Without IndexedDB they are kept for the session; without WebGL the tiles keep their icon.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { entryFor, CATALOG_VERSION } from "../catalog.mjs";
import { buildAsset } from "../render/assets/index.js";
import { buildModel } from "../render/custom-model.js";
import { texturesSettled } from "../render/kit/textures.js";

const SIZE = 112;
const DB = "friends-room-thumbs";
const memory = new Map();
const queue = [];
const waiting = new Map(); // id → [callbacks]
let stage = null;
let running = false;
let dbPromise = null;

function db() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("thumbs");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function readCached(key) {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const req = d.transaction("thumbs").objectStore("thumbs").get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeCached(key, url) {
  const d = await db();
  if (!d) return;
  try {
    d.transaction("thumbs", "readwrite").objectStore("thumbs").put(url, key);
  } catch {}
}

function makeStage() {
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  const key = new THREE.DirectionalLight("#fff1e0", 2.2);
  key.position.set(-2, 4, 3);
  const fill = new THREE.DirectionalLight("#dfe8ff", 0.8);
  fill.position.set(3, 2, 2);
  scene.add(key, fill, new THREE.HemisphereLight("#e8eeff", "#a89a86", 0.6));
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 60);
  return { renderer, scene, camera };
}

async function drawOne(id) {
  const def = entryFor(id);
  if (!def) return "";
  stage ||= makeStage();
  // Your own models load their file first
  const built = def.custom ? buildModel(def, { id }, "medium") : buildAsset(def, { id }, "medium");
  await built.ready;
  stage.scene.add(built.group);
  await texturesSettled();
  const box = new THREE.Box3().setFromObject(built.group);
  const centre = box.getCenter(new THREE.Vector3());
  const radius = Math.max(0.08, box.getSize(new THREE.Vector3()).length() / 2);
  const dist = (radius / Math.tan(THREE.MathUtils.degToRad(14))) * 1.05;
  stage.camera.position.set(centre.x + Math.sin(-0.6) * dist * 0.9, centre.y + dist * 0.38, centre.z + Math.cos(-0.6) * dist * 0.9);
  stage.camera.lookAt(centre);
  built.update?.(0.016, 1.3, {});
  stage.renderer.render(stage.scene, stage.camera);
  const url = stage.renderer.domElement.toDataURL("image/webp", 0.85);
  stage.scene.remove(built.group);
  built.group.traverse((o) => o.geometry?.dispose());
  return url;
}

// A built-in's picture is kept per catalog version; one of your models per its own entry (a new file draws it again)
const keyOf = (id) => {
  const def = entryFor(id);
  return def?.custom ? `custom:${def.id}:${def.info?.bytes || 0}:${def.unit}:${def.stylize}` : `${CATALOG_VERSION}:${id}`;
};

function pump() {
  if (running || !queue.length) return;
  running = true;
  const next = (deadline) => {
    const id = queue.shift();
    if (!id) {
      running = false;
      return;
    }
    drawOne(id)
      .then((url) => {
        memory.set(id, url);
        writeCached(keyOf(id), url);
        for (const cb of waiting.get(id) || []) cb(url);
        waiting.delete(id);
      })
      .catch(() => {})
      .finally(() => {
        running = false;
        if (queue.length) schedule();
      });
    void deadline;
  };
  const schedule = () => {
    running = true;
    if (typeof requestIdleCallback === "function") requestIdleCallback(next, { timeout: 400 });
    else setTimeout(next, 30);
  };
  schedule();
}

// cb(url) when the picture is there (at once when it is cached)
export async function thumbFor(id, cb) {
  if (memory.has(id)) return cb(memory.get(id));
  const cached = await readCached(keyOf(id));
  if (cached) {
    memory.set(id, cached);
    return cb(cached);
  }
  if (!waiting.has(id)) {
    waiting.set(id, []);
    queue.push(id);
  }
  waiting.get(id).push(cb);
  pump();
}

// Drop what's queued (the editor closed)
export function cancelThumbs() {
  queue.length = 0;
  waiting.clear();
}

export function disposeThumbs() {
  cancelThumbs();
  stage?.renderer.dispose();
  stage?.renderer.forceContextLoss?.();
  stage = null;
}
