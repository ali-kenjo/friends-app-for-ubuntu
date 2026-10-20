// Saved AI brains, stored as brains.json in Friends' data folder.
// The API keys themselves are kept in the system keyring (see keys.js).
//
// A brain is one AI Friends can use: a provider (providers.js: "gemini", "local" for a server on this computer, "openai" for
// any cloud service with the OpenAI-style API), a model, and what that needs (a key, an address). It can have its own
// settings (params: temperature, the longest reply, a daily limit…). Add as many as you like.
const fs = require("fs");
const path = require("path");
const { dataDir, writeJson } = require("./config");
const gemini = require("./gemini");
const openai = require("./openai");
const providers = require("./providers");
const services = require("./services");
const keys = require("./keys");
const settings = require("./settings");
const usage = require("./usage");
const wrapper = require("./ai-wrapper");

// The providers are in providers.js ("gemini" is Google's cloud API; "local" is any OpenAI-compatible
// server: Ollama, LM Studio, llama.cpp, vLLM…, see openai.js; "openai" is any cloud service with that API)
const isLocalProvider = (provider) => providers.kindOf(provider) === "local";
const PROVIDERS = new Proxy({}, { get: (_, name) => providers.has(name), has: (_, name) => providers.has(name) });

// The functions that talk to a brain's provider (the same ones for every provider, see providers.js).
// "Don't use the graphics card" (Settings → AI & privacy → This computer) keeps local models on the processor.
function apiFor(brain) {
  const cpuOnly = settings.get().device?.gpu === "off" && isLocalProvider(brain.provider);
  return providers.create(cpuOnly ? { ...brain, numGpu: 0 } : brain);
}

// Private mode (Settings → AI & privacy): only local AI, nothing goes to the internet
const privateMode = () => settings.get().privacy?.localOnly === true;
const PRIVATE_MESSAGE = "Private mode is on, so only a local AI can answer. Add a local AI, or turn Private mode off in Settings → AI & privacy.";

// Local servers rarely have a key; a service of your own address may have none; the others always do
const needsKey = (brain) => !isLocalProvider(brain.provider) && brain.service !== "custom";
const keyFor = (brain) => (needsKey(brain) ? keys.getKey(brain.id) : keys.getOptionalKey(brain.id));
const file = path.join(dataDir, "brains.json");

let state = null;

function load() {
  if (state) return state;
  try {
    state = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    state = { brains: [], defaultBrainId: null, nextId: 1 };
  }
  if ((!state.brains || state.brains.length === 0) && process.env.GEMINI_API_KEY) {
    state.brains = [
      {
        id: 1,
        enabled: true,
        provider: "gemini",
        name: "Gemini",
        model: "gemini-3.8-flash",
        keyHint: "env",
      },
    ];
    state.defaultBrainId = 1;
    state.nextId = 2;
    persist();
  }
  return state;
}

function persist() {
  writeJson(file, state);
}

// "local" runs on this computer, "cloud" is anything online
const kindOf = (b) => providers.kindOf(b.provider);

function publicState() {
  const { brains, defaultBrainId } = load();
  return { brains: brains.map((b) => ({ ...b, kind: kindOf(b) })), defaultBrainId };
}

function find(id) {
  const brain = load().brains.find((b) => b.id === id);
  if (!brain) throw new Error("That AI brain no longer exists.");
  return brain;
}

// Prefer the newest stable Flash model for Gemini (e.g. gemini-2.5-flash); for the others the first the service lists
function pickDefaultModel(models, provider = "gemini") {
  if (provider !== "gemini") return models[0];
  const version = (m) => parseFloat(m.match(/^gemini-([\d.]+)/)?.[1] || 0);
  const flash = models.filter((m) => /^gemini-[\d.]+-flash$/.test(m)).sort((a, b) => version(b) - version(a));
  return flash[0] || models[0];
}

// ---------- What a brain needs, checked ----------
const clampInt = (value, lo, hi) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, n)) : 0;
};

function localFields({ protocol, baseUrl, speechUrl, speechModel, contextSize, keepAlive }) {
  protocol = protocol === "ollama" ? "ollama" : "openai";
  const fields = {
    protocol,
    baseUrl: openai.normalizeUrl(baseUrl, { protocol }),
    speechUrl: openai.normalizeUrl(speechUrl, { required: false }),
    speechModel: String(speechModel || "").trim().slice(0, 200),
  };
  // Only Ollama's own API can set these (0 = the server's own default)
  if (protocol === "ollama") {
    fields.contextSize = clampInt(contextSize, 1024, 1048576);
    fields.keepAlive = clampInt(keepAlive, 1, 1440);
  }
  return fields;
}

// A cloud service of the OpenAI kind: which one (services.js), and its address (the service's, unless it is your own)
function serviceFields({ service, baseUrl }) {
  const entry = services.cloud(service);
  if (!entry || entry.native) throw new Error("That cloud service isn't known. Pick one from the list, or \"Any other service\" and give its address.");
  const address = entry.custom ? baseUrl : baseUrl || entry.baseUrl;
  return { service: entry.id, baseUrl: openai.cloudUrl(address) };
}

// The fields of a brain that belong to its provider
function providerFields(provider, input, existing = {}) {
  if (isLocalProvider(provider)) {
    return localFields({
      protocol: input.protocol ?? existing.protocol,
      baseUrl: input.baseUrl ?? existing.baseUrl,
      speechUrl: input.speechUrl ?? existing.speechUrl,
      speechModel: input.speechModel ?? existing.speechModel,
      contextSize: input.contextSize ?? existing.contextSize,
      keepAlive: input.keepAlive ?? existing.keepAlive,
    });
  }
  if (provider === "openai") return serviceFields({ service: input.service ?? existing.service, baseUrl: input.baseUrl ?? existing.baseUrl });
  return {};
}

// The settings of one AI (Settings → Your AIs → edit): only what differs from the defaults is kept
function cleanParams(input = {}) {
  const out = {};
  const number = (value, lo, hi) => {
    const n = Number(value);
    return value !== "" && value !== null && value !== undefined && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined;
  };
  const temperature = number(input.temperature, 0, 2);
  if (temperature !== undefined) out.temperature = Math.round(temperature * 100) / 100;
  const maxTokens = number(input.maxTokens, 0, 200000);
  if (maxTokens) out.maxTokens = Math.round(maxTokens);
  const topP = number(input.topP, 0, 1);
  if (topP) out.topP = Math.round(topP * 100) / 100;
  const timeout = number(input.timeoutSeconds, 0, 3600);
  if (timeout) out.timeoutSeconds = Math.round(timeout);
  const limit = number(input.dailyLimit, 0, 1000000);
  if (limit) out.dailyLimit = Math.round(limit);
  const prefix = String(input.systemPrefix || "").trim().slice(0, 2000);
  if (prefix) out.systemPrefix = prefix;
  if (input.tools === "off") out.tools = "off";
  if (input.vision === "yes" || input.vision === "no") out.vision = input.vision;
  return out;
}

const cleanNote = (note) => String(note || "").trim().slice(0, 300);

// Ollama names models "name:latest"; "name" means the same
const hasModel = (models, model) => models.includes(model) || models.includes(`${model}:latest`);

// The names a brain may be called by default
function defaultName(provider, fields, model) {
  if (provider === "gemini") return "Gemini";
  if (provider === "openai") return services.cloud(fields.service)?.label || "Cloud AI";
  return model ? model.replace(/:latest$/, "") : "Local AI";
}

// ---------- Asking about models ----------
async function listModels({ id, key, provider = "gemini", protocol, baseUrl, service }) {
  key = typeof key === "string" ? key.trim() : "";
  if (privateMode() && !(id ? isLocalProvider(find(Number(id)).provider) : isLocalProvider(provider))) throw new Error(PRIVATE_MESSAGE);
  if (id) {
    const brain = find(Number(id));
    return apiFor(brain).listModels(key || keyFor(brain));
  }
  if (!PROVIDERS[provider]) throw new Error("That kind of AI isn't supported.");
  if (!isLocalProvider(provider) && provider === "gemini" && !key) return [];
  if (provider === "openai" && !key && services.cloud(service)?.models !== "static" && service !== "custom" && service !== "openrouter") return [];
  const fields = providerFields(provider, { protocol, baseUrl, service });
  return apiFor({ provider, ...fields }).listModels(key);
}

// ---------- Saving ----------
// Add (no id) or update a brain. The key is checked against the provider
// before anything is saved.
async function saveBrain({ id, provider, name, model, key, protocol, baseUrl, service, speechUrl, speechModel, contextSize, keepAlive, params, note }) {
  key = typeof key === "string" ? key.trim() : key;
  id = id ? Number(id) : id;
  if (!PROVIDERS[provider]) throw new Error("That kind of AI isn't supported.");
  const existing = id ? find(id) : null;
  if (existing && existing.provider !== provider) throw new Error("A brain can't change its provider. Add a new one instead.");
  const local = isLocalProvider(provider);
  if (privateMode() && !local) throw new Error(PRIVATE_MESSAGE);
  const extra = providerFields(provider, { protocol, baseUrl, service, speechUrl, speechModel, contextSize, keepAlive }, existing || {});
  const target = { provider, ...extra };
  const plainKey = key || (existing && keyFor(existing)) || "";
  const keyless = local || extra.service === "custom";
  if (!keyless && !plainKey) throw new Error("Paste an API key first.");

  const api = apiFor(target);
  let models = [];
  try {
    models = await api.listModels(plainKey);
  } catch (err) {
    // A server without a models list can still work when you name the model
    if (!keyless || !model) throw err;
  }
  if (!model) {
    model = local ? models[0] : pickDefaultModel(models, provider);
    if (!model) throw new Error("This AI server has no models yet. Pull or load one first (for Ollama: ollama pull llama3.2).");
  }
  // A service with a fixed list of models still takes a name you type (it may have newer ones)
  const typed = !local && services.cloud(extra.service)?.models === "static";
  if (models.length && !typed && !(local ? hasModel(models, model) : models.includes(model))) {
    throw new Error(`The model "${model}" isn't available${local ? " on this AI server" : " with this key"}.`);
  }
  await api.checkModel({ key: plainKey, model });

  const s = load();
  const brainId = existing ? existing.id : s.nextId;
  const fields = { provider, name: name || existing?.name || defaultName(provider, extra, model), model, ...extra };
  if (params !== undefined) fields.params = cleanParams(params);
  if (note !== undefined) fields.note = cleanNote(note);
  if (key) {
    keys.setKey(brainId, key);
    fields.keyHint = key.slice(-4);
  }

  if (existing) {
    if (local && extra.protocol !== "ollama") {
      delete existing.contextSize;
      delete existing.keepAlive;
    }
    Object.assign(existing, fields);
    if (fields.params && !Object.keys(fields.params).length) delete existing.params;
  } else {
    s.nextId++;
    const brain = { id: brainId, enabled: true, ...fields };
    if (brain.params && !Object.keys(brain.params).length) delete brain.params;
    s.brains.push(brain);
    if (!s.defaultBrainId) s.defaultBrainId = brainId;
  }
  persist();
  return publicState();
}

// Several models of one server or key at once: the key (or the server) is checked once, each model once.
// → { state, added: [model], skipped: [model], failed: [{ model, error }] }
async function saveMany({ provider, key, protocol, baseUrl, service, models, params, speechUrl, speechModel, contextSize, keepAlive } = {}) {
  if (!Array.isArray(models) || !models.length) throw new Error("Pick at least one model.");
  if (models.length > 60) throw new Error("That's a lot at once: pick up to 60 models.");
  const out = { added: [], skipped: [], failed: [] };
  const same = (b, extra, model) => b.provider === provider && b.model === model && (b.baseUrl || "") === (extra.baseUrl || "") && (b.service || "") === (extra.service || "");
  const fields = providerFields(provider, { protocol, baseUrl, service });
  for (const model of [...new Set(models.map(String))]) {
    if (load().brains.some((b) => same(b, fields, model))) {
      out.skipped.push(model);
      continue;
    }
    try {
      await saveBrain({ provider, key, protocol, baseUrl, service, model, params, speechUrl, speechModel, contextSize, keepAlive });
      out.added.push(model);
    } catch (err) {
      out.failed.push({ model, error: err.message });
      // A wrong key or an unreachable server won't get better for the next model
      if (!out.added.length && /key|reach|answer in time|isn't supported|Private mode/i.test(err.message)) break;
    }
  }
  return { state: publicState(), ...out };
}

// A new name, on or off, its own settings, a note: nothing that needs asking the provider again
function updateBrain(id, { name, enabled, params, note } = {}) {
  const brain = find(id);
  if (name !== undefined) brain.name = String(name).trim().slice(0, 60) || brain.name;
  if (enabled !== undefined && id !== load().defaultBrainId) brain.enabled = !!enabled;
  if (params !== undefined) {
    brain.params = cleanParams(params);
    if (!Object.keys(brain.params).length) delete brain.params;
  }
  if (note !== undefined) brain.note = cleanNote(note);
  persist();
  return publicState();
}

// Up or down in the list: the order is the order they are tried in (after the default)
function moveBrain(id, direction) {
  const s = load();
  const at = s.brains.findIndex((b) => b.id === id);
  if (at < 0) throw new Error("That AI brain no longer exists.");
  const to = at + (direction === "up" ? -1 : 1);
  if (to >= 0 && to < s.brains.length) [s.brains[at], s.brains[to]] = [s.brains[to], s.brains[at]];
  persist();
  return publicState();
}

function deleteBrain(id) {
  const s = load();
  s.brains = s.brains.filter((b) => b.id !== id);
  keys.deleteKey(id);
  usage.forget(id);
  if (s.defaultBrainId === id) {
    s.defaultBrainId = s.brains[0]?.id ?? null;
    if (s.brains[0]) s.brains[0].enabled = true;
  }
  persist();
  // The AI for small jobs can't be one that's gone
  if (settings.get().routing?.taskBrain === id) settings.patch({ routing: { taskBrain: 0 } });
  return publicState();
}

function setDefault(id) {
  find(id).enabled = true;
  load().defaultBrainId = id;
  persist();
  return publicState();
}

function setEnabled(id, enabled) {
  if (id === load().defaultBrainId) enabled = true;
  find(id).enabled = !!enabled;
  persist();
  return publicState();
}

// A saved brain with its key and its functions (server only, never sent to the page)
const materialize = (b) => {
  const brain = { ...b, key: keyFor(b), kind: kindOf(b) };
  brain.api = wrapper.wrap(apiFor(b), brain, settings.get);
  return brain;
};

// The enabled brains of one kind, best first: the preferred one, the default, then the rest.
// Private mode has no cloud brains.
function ofKind(kind, preferId) {
  if (kind === "cloud" && privateMode()) return [];
  const s = load();
  const rank = (b) => (b.id === preferId ? 0 : b.id === s.defaultBrainId ? 1 : 2);
  // After the one asked for and the default, the order of the list (Settings → Your AIs: up and down)
  return s.brains.filter((b) => b.enabled && kindOf(b) === kind).sort((a, b) => rank(a) - rank(b) || s.brains.indexOf(a) - s.brains.indexOf(b));
}

const has = (kind) => ofKind(kind).length > 0;
// Every enabled brain of a kind except one, ready to use (for "if it fails, try the next one")
const othersOfKind = (kind, exceptId) => ofKind(kind).filter((b) => b.id !== exceptId).map(materialize);
const getByKind = (kind, preferId) => {
  const b = ofKind(kind, preferId)[0];
  return b ? materialize(b) : null;
};

// The brain for small jobs (follow-up chips, moods, summaries): the one chosen in Settings (Answers → Small jobs),
// else by the routing mode: a local AI when there is one (private and free), else the cloud
function forTask() {
  const s = settings.get();
  const chosen = s.routing.taskBrain ? load().brains.find((b) => b.id === s.routing.taskBrain && b.enabled && (!privateMode() || isLocalProvider(b.provider))) : null;
  const mode = privateMode() ? "local" : s.routing.mode;
  let brain;
  if (chosen) brain = materialize(chosen);
  else if (mode === "fixed") brain = getForChat(null);
  else if (mode === "local") brain = getByKind("local");
  else if (mode === "cloud") brain = getByKind("cloud");
  else brain = getByKind("local") || getByKind("cloud");
  // Gemini does these on a light model, which has its own free quota (and falls back to the others)
  return brain?.provider === "gemini" ? { ...brain, model: gemini.TASK_MODEL } : brain;
}

// The brain for listening and speaking: a local AI only when its voice is ready
function forVoice() {
  const mode = privateMode() ? "local" : settings.get().routing.mode;
  if (mode === "fixed") return getForChat(null);
  const localReady = require("./voice").installed();
  const local = getByKind("local");
  const cloud = getByKind("cloud");
  if (mode === "local") return local;
  if (mode === "cloud") return cloud;
  return (localReady && local) || cloud || local;
}

// The brain to chat with, including its key (server only, never sent to the page)
// A brain that was deleted or switched off falls back to the default one.
function getForChat(id) {
  const s = load();
  const usable = (b) => !privateMode() || isLocalProvider(b.provider);
  const brain =
    s.brains.find((b) => b.id === id && b.enabled && usable(b)) ||
    s.brains.find((b) => b.id === s.defaultBrainId && usable(b)) ||
    (privateMode() ? s.brains.find((b) => b.enabled && usable(b)) : null);
  if (!brain) {
    if (privateMode() && s.brains.length) throw new Error(PRIVATE_MESSAGE);
    return null;
  }
  return materialize(brain);
}

// Gets a local model ready before the first message (Ollama only; others load on demand).
// voice: also the speech models, for a spoken conversation.
async function warm({ brainId, voice } = {}) {
  const brain = getForChat(Number(brainId) || null);
  const out = { warm: false };
  if (brain && isLocalProvider(brain.provider) && brain.api.warm) Object.assign(out, await brain.api.warm({ model: brain.model }));
  if (voice && brain && isLocalProvider(brain.provider)) out.voice = (await require("./voice").warm()).warm;
  return out;
}

async function testBrain(id) {
  const brain = id ? find(id) : getForChat(null);
  if (!brain) throw new Error("No active AI brain configured.");
  if (privateMode() && !isLocalProvider(brain.provider)) throw new Error(PRIVATE_MESSAGE);
  const plainKey = keyFor(brain);
  if (!plainKey && needsKey(brain)) throw new Error("No API key found for this brain.");

  const api = apiFor(brain);
  const start = Date.now();
  const keyless = !needsKey(brain);
  const models = await api.listModels(plainKey).catch((err) => {
    if (keyless) return []; // not every server lists its models
    throw err;
  });
  // A real request to this model: the list still names models that were retired
  await api.checkModel({ key: plainKey, model: brain.model });
  const latencyMs = Date.now() - start;
  const typed = services.cloud(brain.service)?.models === "static";
  const isAvailable = !models.length || typed || (isLocalProvider(brain.provider) ? hasModel(models, brain.model) : models.includes(brain.model));
  return {
    ok: true,
    latencyMs,
    model: brain.model,
    name: brain.name,
    provider: brain.provider,
    isAvailable,
    modelsCount: models.length,
  };
}

async function testConfig({ key, provider = "gemini", model, protocol, baseUrl, service }) {
  key = typeof key === "string" ? key.trim() : key;
  if (!PROVIDERS[provider]) throw new Error("That kind of AI isn't supported.");
  const local = isLocalProvider(provider);
  if (privateMode() && !local) throw new Error(PRIVATE_MESSAGE);
  const fields = providerFields(provider, { protocol, baseUrl, service });
  const keyless = local || fields.service === "custom";
  if (!keyless && !key) throw new Error("Paste an API key first.");
  const api = apiFor({ provider, ...fields });
  const start = Date.now();
  const models = await api.listModels(key || "");
  const chosen = model || (local ? models[0] : pickDefaultModel(models, provider));
  // A list that needs no key (or a fixed list) doesn't prove the key works: a real request does
  if (!local && chosen) await api.checkModel({ key, model: chosen });
  const latencyMs = Date.now() - start;
  return { ok: true, latencyMs, model: chosen, modelsCount: models.length };
}

// Read brains.json again (after a backup was restored)
function reload() {
  state = null;
}

module.exports = {
  apiFor,
  reload,
  publicState,
  listModels,
  saveBrain,
  saveMany,
  updateBrain,
  moveBrain,
  deleteBrain,
  setDefault,
  setEnabled,
  getForChat,
  getByKind,
  ofKind,
  othersOfKind,
  has,
  kindOf,
  forTask,
  forVoice,
  warm,
  testBrain,
  testConfig,
};
