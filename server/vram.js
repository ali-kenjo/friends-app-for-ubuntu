// Getting a local model ready on a small graphics card (6 GB). Before a specialist's model is used:
//   1. the model that is loaded and isn't this one is unloaded (Ollama's keep_alive 0), and we wait until it's gone,
//   2. we estimate whether this one fits: its weights, the memory for its context (the "KV cache"), a margin, against
//      what is free on the card after other programs (the desktop uses some),
//   3. if it fits, it's loaded on the card; if only part of it fits, Ollama splits it between the card and the
//      processor; if it doesn't fit at all it runs on the processor (num_gpu 0), or on the role's smaller fallback model,
//   4. it's loaded now (so the first step isn't slow), and what really happened is read back from Ollama (/api/ps).
// Estimates are only estimates: Ollama has the last word, and what it did is what's reported.
const os = require("os");
const { execFile } = require("child_process");
const logger = require("./logger");

const MARGIN_MB = 256; // left free on the card
const OVERHEAD_MB = 160; // the runtime's own buffers
const DEFAULT_KV_BYTES_PER_TOKEN = 0.12 * 1024 * 1024; // a typical small model with grouped-query attention

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sameModel = (a, b) => a === b || a === `${b}:latest` || b === `${a}:latest`;
const mb = (bytes) => Math.round(bytes / 1024 / 1024);

// ---------- The card ----------
// { name, totalMb, usedMb, freeMb, vendor } or null (nothing that runs models faster than the processor). An NVIDIA card
// is asked live (nvidia-smi); an AMD card, or a Mac's shared memory, comes from hardware.js. Tests can say what it is:
// FRIENDS_FAKE_GPU='{"totalMb":6144,"usedMb":300}' (or "none")
function nvidia() {
  return new Promise((resolve) =>
    execFile("nvidia-smi", ["--query-gpu=name,memory.total,memory.used,memory.free", "--format=csv,noheader,nounits"], { timeout: 4000 }, (err, out) => {
      if (err) return resolve(null);
      const line = String(out).split("\n").find(Boolean);
      if (!line) return resolve(null);
      const [name, total, used, free] = line.split(",").map((s) => s.trim());
      resolve({ name, totalMb: Number(total), usedMb: Number(used), freeMb: Number(free), vendor: "nvidia" });
    })
  );
}

async function gpu() {
  if (process.env.FRIENDS_FAKE_GPU) {
    if (process.env.FRIENDS_FAKE_GPU === "none") return null;
    const f = JSON.parse(process.env.FRIENDS_FAKE_GPU);
    return { name: f.name || "Fake GPU", totalMb: f.totalMb, usedMb: f.usedMb ?? 0, freeMb: f.totalMb - (f.usedMb ?? 0), vendor: f.vendor || "nvidia" };
  }
  const card = await nvidia();
  if (card) return card;
  const hardware = require("./hardware");
  const hw = await hardware.live().catch(() => null);
  if (!hw) return null;
  const other = hw.gpus.find((g) => g.usable && !g.shared && g.vramMb > 0 && g.vendor !== "nvidia");
  if (other) return { name: other.name, totalMb: other.vramMb, usedMb: other.usedMb, freeMb: other.freeMb, vendor: other.vendor };
  if (hw.fit.engine === "metal") {
    // Apple silicon: one pool of memory; what the GPU may take of it is the budget
    const totalMb = hw.fit.budgetMb + MARGIN_MB;
    const freeMb = Math.max(0, Math.min(hw.fit.budgetMb, Math.round(hw.memory.availableMb * 0.9)));
    return { name: hw.gpus.find((g) => g.unified)?.name || "Apple silicon", totalMb, usedMb: totalMb - freeMb, freeMb, vendor: "apple", unified: true };
  }
  return null;
}

function ram() {
  let available = os.freemem();
  try {
    const m = require("fs").readFileSync("/proc/meminfo", "utf8").match(/MemAvailable:\s+(\d+) kB/);
    if (m) available = Number(m[1]) * 1024;
  } catch {}
  return { totalMb: mb(os.totalmem()), availableMb: mb(available) };
}

// ---------- Ollama ----------
async function ollama(base, path, { body, method = body ? "POST" : "GET", timeout = 8000 } = {}) {
  const res = await fetch(`${String(base).replace(/\/+$/, "")}${path}`, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`Ollama answered ${res.status} (${path})`);
  return res.json();
}

// What Ollama has loaded now: [{ name, size, sizeVram, contextLength, expiresAt }]
async function loaded(base) {
  const data = await ollama(base, "/api/ps");
  return (data.models || []).map((m) => ({ name: m.name || m.model, size: m.size || 0, sizeVram: m.size_vram || 0, contextLength: m.context_length || 0, expiresAt: m.expires_at || null }));
}

async function installed(base) {
  const data = await ollama(base, "/api/tags", { timeout: 6000 });
  return (data.models || []).map((m) => ({ name: m.name || m.model, size: m.size || 0, modifiedAt: m.modified_at || null }));
}

// The memory a model needs at a context size: { weightsMb, kvMb, totalMb }
async function estimate(base, model, contextSize = 8192) {
  let weights = 0;
  try {
    const tag = (await installed(base)).find((m) => sameModel(m.name, model));
    weights = tag?.size || 0;
  } catch {}
  let kvPerToken = DEFAULT_KV_BYTES_PER_TOKEN;
  try {
    const info = (await ollama(base, "/api/show", { body: { model }, timeout: 6000 })).model_info || {};
    const find = (suffix) => Object.entries(info).find(([k]) => k.endsWith(suffix))?.[1];
    const layers = find(".block_count");
    const heads = find(".attention.head_count");
    const headsKv = find(".attention.head_count_kv") || heads;
    const embedding = find(".embedding_length");
    const keyLength = find(".attention.key_length") || (embedding && heads ? embedding / heads : 0);
    if (layers && headsKv && keyLength) kvPerToken = 2 * layers * headsKv * keyLength * 2; // K and V, 2 bytes each
  } catch {}
  const weightsMb = mb(weights);
  const kvMb = mb(kvPerToken * contextSize);
  return { weightsMb, kvMb, totalMb: weightsMb + kvMb + OVERHEAD_MB, known: weights > 0 };
}

// ---------- Where it would run ----------
// Decides from the estimate and the card: "gpu" (all of it), "split" (part, Ollama decides how much), "cpu" (num_gpu 0),
// or "auto" when there's no card to count (Ollama decides).
function place(est, card, usedByTarget = 0) {
  if (!card) return { placement: "auto", availableMb: 0 };
  const availableMb = Math.max(0, card.totalMb - Math.max(0, card.usedMb - usedByTarget) - MARGIN_MB);
  if (est.totalMb <= availableMb) return { placement: "gpu", availableMb };
  if (availableMb >= est.totalMb * 0.55) return { placement: "split", availableMb };
  return { placement: "cpu", availableMb };
}

// For the badge in Settings: would this model fit on the card (empty of Ollama's models)?
async function fits(base, model, contextSize) {
  const [card, est] = await Promise.all([gpu(), estimate(base, model, contextSize)]);
  if (!est.known) return { placement: "unknown", ...est };
  let usedByOllama = 0;
  try {
    usedByOllama = (await loaded(base)).reduce((s, m) => s + m.sizeVram, 0) / 1024 / 1024;
  } catch {}
  const r = place(est, card, usedByOllama);
  return { ...est, ...r, totalGpuMb: card?.totalMb || 0 };
}

// ---------- Unloading ----------
async function unload(base, name) {
  try {
    await ollama(base, "/api/generate", { body: { model: name, prompt: "", keep_alive: 0, stream: false }, timeout: 15000 });
  } catch (err) {
    logger.debug(`Couldn't unload ${name}:`, err.message);
  }
}

async function waitGone(base, names, ms = 8000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    let now = [];
    try {
      now = await loaded(base);
    } catch {
      return;
    }
    if (!now.some((m) => names.some((n) => sameModel(m.name, n)))) return;
    await sleep(150);
  }
}

// ---------- The one the models queue calls ----------
// Makes brain's model ready. info: { role, why, fallbackModel }. Returns { placement, sizeVram, brain, unloaded, estimate, swapped }
async function prepare(brain, info = {}) {
  const base = brain.baseUrl;
  const brains = require("./brains");
  let present = [];
  try {
    present = await loaded(base);
  } catch (err) {
    // Ollama isn't answering: nothing to prepare; the call itself will say so
    return { placement: "auto", error: err.message };
  }
  const others = present.filter((m) => !sameModel(m.name, brain.model));
  for (const m of others) await unload(base, m.name);
  if (others.length) await waitGone(base, others.map((m) => m.name));

  let target = brain;
  let est = await estimate(base, target.model, target.contextSize || 8192);
  const card = await gpu();
  const there = present.find((m) => sameModel(m.name, target.model));
  let decision = place(est, card, there ? there.sizeVram / 1024 / 1024 : 0);
  // "Don't use the graphics card" (Settings → AI & privacy → This computer): everything runs on the processor
  if (require("./settings").get().device?.gpu === "off") decision = { placement: "cpu", availableMb: 0 };
  // It doesn't fit and the role has a smaller one that does
  if (decision.placement === "cpu" && info.fallbackModel && !sameModel(info.fallbackModel, target.model)) {
    const smaller = { ...target, model: info.fallbackModel };
    const e2 = await estimate(base, smaller.model, smaller.contextSize || 8192);
    const d2 = place(e2, card, 0);
    if (e2.known && d2.placement !== "cpu") {
      logger.info(`${target.model} doesn't fit (${est.totalMb} MB for ${decision.availableMb} MB free); using ${smaller.model}`);
      target = smaller;
      est = e2;
      decision = d2;
    }
  }
  if (decision.placement === "cpu") target = { ...target, numGpu: 0, api: brains.apiFor({ ...target, numGpu: 0 }) };
  else if (target !== brain && target.model !== brain.model) target = { ...target, api: brains.apiFor(target) };
  // Loaded now, with its context size and the placement chosen
  await target.api.warm?.({ model: target.model }).catch(() => {});
  let sizeVram = 0;
  let placement = decision.placement;
  try {
    const now = (await loaded(base)).find((m) => sameModel(m.name, target.model));
    if (now) {
      sizeVram = now.sizeVram;
      // What Ollama really did
      placement = now.size && now.sizeVram >= now.size * 0.95 ? "gpu" : now.sizeVram === 0 && card ? "cpu" : now.sizeVram > 0 ? "split" : placement;
    }
  } catch {}
  return { placement, sizeVram, brain: target, unloaded: others.map((m) => m.name), estimate: est, fallbackUsed: target.model !== brain.model };
}

// What the card and Ollama are doing now, for Settings
async function snapshot(base) {
  const [card, mem] = [await gpu(), ram()];
  let models = [];
  try {
    models = await loaded(base);
  } catch {}
  return { gpu: card, ram: mem, loaded: models };
}

module.exports = { gpu, ram, loaded, installed, estimate, place, fits, prepare, snapshot, unload, sameModel, MARGIN_MB };
