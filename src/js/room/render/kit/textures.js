// ---------- Procedural textures, made once and shared ----------
// surfaceMaps(kind, { size, seed }) gives three textures at once (albedo detail, normal, roughness) that
// start as a flat neutral pixel and fill in when the worker has made them, so nothing waits and a room
// never stutters. They are cached by kind, size and seed for as long as the page lives.
import * as THREE from "three";
import { generate, contactShadow } from "./texture-gen.mjs";

const cache = new Map();
const pending = new Map();
let worker = null;
let workerFailed = false;
let nextId = 1;
const idleQueue = [];

function getWorker() {
  if (worker || workerFailed) return worker;
  try {
    worker = new Worker(new URL("./texture-worker.js", import.meta.url), { type: "module", name: "room-textures" });
    worker.onmessage = (e) => {
      const job = pending.get(e.data.id);
      pending.delete(e.data.id);
      if (!job) return;
      if (e.data.error) idleQueue.push(job);
      else fill(job, e.data);
      if (e.data.error) schedule();
    };
    worker.onerror = () => {
      workerFailed = true;
      worker = null;
      for (const job of pending.values()) idleQueue.push(job);
      pending.clear();
      schedule();
    };
  } catch {
    workerFailed = true;
    worker = null;
  }
  return worker;
}

// Without a worker: one map per idle moment on the main thread
let scheduled = false;
function schedule() {
  if (scheduled || !idleQueue.length) return;
  scheduled = true;
  const run = (deadline) => {
    scheduled = false;
    while (idleQueue.length) {
      const job = idleQueue.shift();
      fill(job, generate(job.kind, job.size, job.seed));
      if (!deadline || deadline.timeRemaining() < 8) break;
    }
    schedule();
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 500 });
  else setTimeout(run, 16);
}

const listeners = new Set();
// fn() whenever a texture has filled in (the renderer redraws a still frame, thumbnails re-render)
export const onTextureReady = (fn) => (listeners.add(fn), () => listeners.delete(fn));

function fill(job, data) {
  const { maps, size } = job;
  for (const k of ["albedo", "normal", "rough"]) {
    const t = maps[k];
    // A renderer keeps the GPU storage it made for the 1×1 placeholder; a bigger picture needs new storage
    // (dispose() tells every renderer to let go, the next draw uploads the full size)
    if (t.image?.width !== size || t.image?.height !== size) {
      t.dispose();
      for (const c of t.userData.clones || []) c.dispose();
    }
    delete t.userData.clones;
    t.image = { data: new Uint8Array(data[k].buffer), width: size, height: size };
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.needsUpdate = true;
  }
  maps.ready = true;
  for (const fn of listeners) fn(job.kind);
}

function placeholder(rgba, srgb) {
  const t = new THREE.DataTexture(new Uint8Array(rgba), 1, 1, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.userData.shared = true;
  t.needsUpdate = true;
  return t;
}

// The texture size for a detail level (Settings → Graphics → Texture detail)
export const TEXTURE_SIZE = { low: 256, medium: 512, high: 512, ultra: 1024 };

export function surfaceMaps(kind, { size = 512, seed = 1 } = {}) {
  const key = `${kind}|${size}|${seed}`;
  let maps = cache.get(key);
  if (maps) return maps;
  maps = { albedo: placeholder([212, 212, 212, 255], true), normal: placeholder([128, 128, 255, 255], false), rough: placeholder([255, 200, 0, 255], false), ready: false, kind };
  cache.set(key, maps);
  const job = { kind, size, seed, maps };
  const w = getWorker();
  if (w) {
    const id = nextId++;
    pending.set(id, job);
    w.postMessage({ id, kind, size, seed });
  } else {
    idleQueue.push(job);
    schedule();
  }
  return maps;
}

// For tests and the contact sheet: wait until every map asked for so far is there
export function texturesSettled() {
  if (![...cache.values()].some((m) => !m.ready)) return Promise.resolve();
  return new Promise((resolve) => {
    const off = onTextureReady(() => {
      if (![...cache.values()].some((m) => !m.ready)) {
        off();
        resolve();
      }
    });
  });
}

let shadowTex = null;
// The soft footprint every contact decal uses (one texture, one draw call for all of a room's decals)
export function contactShadowTexture() {
  if (shadowTex) return shadowTex;
  const size = 128;
  shadowTex = new THREE.DataTexture(new Uint8Array(contactShadow(size).buffer), size, size, THREE.RGBAFormat);
  shadowTex.magFilter = THREE.LinearFilter;
  shadowTex.minFilter = THREE.LinearMipmapLinearFilter;
  shadowTex.generateMipmaps = true;
  shadowTex.userData.shared = true;
  shadowTex.needsUpdate = true;
  return shadowTex;
}
