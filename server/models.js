// The model manager: which local model is loaded, and who gets it next.
//
// On a small graphics card only one heavy model fits, so local models are used one at a time: use() waits its
// turn, gets the model ready (unloading the one before it, checking it fits: see vram.js), and runs your
// function with it. Calls that use the same model one after another don't reload it. Cloud brains don't wait.
// Chat requests have priority over background missions: when a chat comes in, it jumps ahead of waiting missions,
// and missions report "waiting for the model because you are chatting".
const logger = require("./logger");

let waiters = []; // [{ priority, resolve, reject, info, isChat }]
let current = null; // what is loaded now: { model, role, why, kind, placement, at, mission, step }
let preparer = (...args) => require("./vram").prepare(...args); // how a model is made ready (vram.js); tests can replace it
let busy = false; // someone holds the model right now
let currentChat = false;
let lastSwapAt = 0;
const listeners = new Set();

const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => { try { fn(status()); } catch {} });

function setPreparer(fn) {
  preparer = fn;
}

const isChatTask = (info = {}) => Boolean(info.priority === "chat" || info.role === "chat" || info.source === "chat" || info.interactive === true);

const status = () => {
  const hasChatWaiting = waiters.some((w) => w.isChat);
  const isMissionWaiting = waiters.some((w) => !w.isChat);
  const waitingReason = isMissionWaiting && (currentChat || hasChatWaiting) ? "waiting for the model because you are chatting" : "";
  return {
    loaded: current ? { ...current } : null,
    waiting: waiters.length,
    busy,
    chatActive: currentChat,
    waitingReason,
  };
};

function dispatchNext() {
  if (waiters.length === 0) {
    busy = false;
    currentChat = false;
    return;
  }
  busy = true;
  const next = waiters.shift();
  currentChat = next.isChat;
  next.resolve();
}

// Where the next call of this model happens: the manager's own cloud brains don't queue
// info: { role, why, mission, step, signal, priority }
async function use(brain, info = {}, fn) {
  if (!brain || brain.kind === "cloud") return fn(brain, { pause: (p) => p });

  const isChat = isChatTask(info);
  const prio = isChat ? 10 : (info.priority === "high" ? 5 : (info.preload ? -1 : 0));

  const acquireTurn = () => {
    if (!busy) {
      busy = true;
      currentChat = isChat;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const item = { priority: prio, resolve, reject, info, isChat };
      // Insert in priority order: higher priority first; for equal priority, FIFO
      const idx = waiters.findIndex((w) => w.priority < prio);
      if (idx === -1) waiters.push(item);
      else waiters.splice(idx, 0, item);
    });
  };

  // Gets the model ready (when another one was loaded, or this role takes over) and says so
  const ready = async () => {
    let prepared = {};
    const sameModel = current && current.model === brain.model && current.baseUrl === brain.baseUrl;
    if (!sameModel || current.role !== info.role) {
      // Anti-thrashing: enforce brief cooldown between rapid model swaps
      const elapsedSinceSwap = Date.now() - lastSwapAt;
      if (lastSwapAt > 0 && elapsedSinceSwap < 200 && !sameModel) {
        await new Promise((r) => setTimeout(r, 200 - elapsedSinceSwap));
      }
      try {
        prepared = (await preparer(brain, info)) || {};
        lastSwapAt = Date.now();
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
      dispatchNext();
      try {
        return await promise;
      } finally {
        await acquireTurn();
        prepared = await ready();
      }
    },
  };

  try {
    await acquireTurn();
    if (info.signal?.aborted) throw Object.assign(new Error("Stopped."), { name: "AbortError" });
    prepared = await ready();
    return await fn(prepared.brain || brain, control);
  } finally {
    dispatchNext();
  }
}

// Gets the next specialist ready while nothing else is using the model (the cloud manager is thinking). Never waits
// for anyone and never unloads a model that is in use.
async function preload(brain, info = {}) {
  if (!brain || brain.kind === "cloud" || busy || waiters.length > 0) return false;
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
  currentChat = false;
  emit();
}

module.exports = { use, preload, status, onChange, setPreparer, forget, isChatTask };
