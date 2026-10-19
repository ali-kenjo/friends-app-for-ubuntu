// The model manager: which local model is loaded, and who gets it next.
//
// On a small graphics card only one heavy model fits, so local models are used one at a time: use() waits its
// turn, gets the model ready (unloading the one before it, checking it fits: see vram.js), and runs your
// function with it. Calls that use the same model one after another don't reload it. Cloud brains don't wait.
// Every change of what is loaded is announced (the page shows "Coding specialist loaded for step 3").
const logger = require("./logger");

let tail = Promise.resolve(); // the queue: each use() waits for the one before it
let waiting = 0;
let current = null; // what is loaded now: { model, role, why, kind, placement, at, mission, step }
let preparer = (...args) => require("./vram").prepare(...args); // how a model is made ready (vram.js); tests can replace it
let busy = false; // someone holds the model right now
const listeners = new Set();

const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => { try { fn(status()); } catch {} });

function setPreparer(fn) {
  preparer = fn;
}

const status = () => ({ loaded: current ? { ...current } : null, waiting, busy });

// Where the next call of this model happens: the manager's own cloud brains don't queue
// info: { role, why, mission, step, signal }
async function use(brain, info = {}, fn) {
  if (!brain || brain.kind === "cloud") return fn(brain, { pause: (p) => p });
  waiting++;
  let release;
  const queueUp = () => {
    const turn = tail;
    tail = new Promise((r) => (release = r));
    return turn;
  };
  // Gets the model ready (when another one was loaded, or this role takes over) and says so
  const ready = async () => {
    let prepared = {};
    const sameModel = current && current.model === brain.model && current.baseUrl === brain.baseUrl;
    if (!sameModel || current.role !== info.role) {
      try {
        prepared = (await preparer(brain, info)) || {};
      } catch (err) {
        logger.warn("Getting the model ready failed:", err.message);
        prepared = { error: err.message };
      }
      current = { model: brain.model, baseUrl: brain.baseUrl, role: info.role || null, why: info.why || "", kind: "local", placement: prepared.placement || "", sizeVram: prepared.sizeVram || 0, swapped: !sameModel, at: Date.now(), mission: info.mission || null, step: info.step || null };
      emit();
    }
    return prepared;
  };
  // While a mission waits for you (an approval can take hours), others can have the model: pause(promise) lets go of it
  // and takes its turn again when the promise is settled
  let prepared = {};
  const control = {
    async pause(promise) {
      busy = false;
      release();
      try {
        return await promise;
      } finally {
        waiting++;
        await queueUp();
        waiting--;
        busy = true;
        prepared = await ready();
      }
    },
  };
  try {
    await queueUp();
    waiting--;
    busy = true;
    if (info.signal?.aborted) throw Object.assign(new Error("Stopped."), { name: "AbortError" });
    prepared = await ready();
    return await fn(prepared.brain || brain, control);
  } finally {
    busy = false;
    release();
  }
}

// Gets the next specialist ready while nothing else is using the model (the cloud manager is thinking). Never waits
// for anyone and never unloads a model that is in use.
async function preload(brain, info = {}) {
  if (!brain || brain.kind === "cloud" || busy || waiting > 0) return false;
  try {
    await use(brain, { ...info, preload: true }, async () => {});
    return true;
  } catch {
    return false;
  }
}

// Something else unloaded it (Ollama's own timeout, a restart): the next call prepares it again
function forget() {
  current = null;
  emit();
}

module.exports = { use, preload, status, onChange, setPreparer, forget };
