// The specialists: local models, each with a job. A role has a name, the Ollama model it uses, its own
// instructions, the tools it may use, its context size, and when the manager should choose it. Several roles
// can share one model with different instructions (nothing is loaded twice); weights are only swapped when a
// role's model really differs (see models.js).
//
// No model name is built in. A role with no model of its own uses the "general" role's, and that uses the
// local AI you already set up in Settings → AI & privacy, so everything works before you choose anything.
// Settings → AI → Specialists lists the roles, lets you pick from the models Ollama has, and pull new ones;
// suggestions for models that fit a small graphics card are in specialist-suggestions.js.
const brains = require("./brains");
const settingsModule = require("./settings");
const { TOOL_GROUPS, DEFAULT_ROLES, BUILTIN, sanitize } = require("./specialist-roles");

// Every role as it is now: the built-in ones with what you changed, then your own
function list(settings = settingsModule.get()) {
  const mine = new Map((settings.specialists?.roles || []).map((r) => [r.id, r]));
  const roles = DEFAULT_ROLES.map((base) => ({ ...base, ...overrides(mine.get(base.id)), builtin: true }));
  for (const r of mine.values()) if (!BUILTIN.has(r.id)) roles.push({ tools: ["*"], contextSize: 8192, kind: "chat", system: "", ...r, builtin: false });
  return roles;
}

function overrides(mine = {}) {
  const o = {};
  if (typeof mine.model === "string") o.model = mine.model;
  if (mine.fallback) o.fallback = mine.fallback;
  if (mine.system) o.system = mine.system;
  if (Array.isArray(mine.tools)) o.tools = mine.tools;
  if (mine.contextSize) o.contextSize = mine.contextSize;
  if (mine.enabled === false) o.enabled = false;
  return o;
}

const get = (id, settings) => list(settings).find((r) => r.id === id) || null;

// The tools of a role as a set (null: no restriction)
function toolSet(role) {
  return role.tools?.includes("*") ? null : new Set(role.tools || []);
}

// The Ollama server the specialists use: the one in Settings → Specialists, else the first local Ollama AI you added
function ollamaUrl(settings = settingsModule.get()) {
  const own = String(settings.specialists?.baseUrl || "").trim();
  if (own) return own;
  const local = brains.ofKind("local").find((b) => b.protocol === "ollama");
  return local?.baseUrl || "http://127.0.0.1:11434";
}

// The model of a role: its own, else the general role's, else the model of the local AI you already use
function modelOf(roleId, settings = settingsModule.get()) {
  const role = get(roleId, settings);
  if (role?.model) return role.model;
  const general = get("general", settings);
  if (general?.model) return general.model;
  return brains.ofKind("local").find((b) => b.protocol === "ollama")?.model || "";
}

// A brain (the same shape brains.js gives chat) for a role, or null when there's no local model for it
function brainFor(roleId, settings = settingsModule.get()) {
  const role = get(roleId, settings);
  if (!role || role.enabled === false) return null;
  const model = modelOf(roleId, settings);
  if (!model) return null;
  const base = brains.ofKind("local").find((b) => b.protocol === "ollama");
  const brain = {
    id: base?.id ?? 0,
    name: role.label,
    provider: "local",
    protocol: "ollama",
    baseUrl: ollamaUrl(settings),
    model,
    contextSize: role.contextSize || base?.contextSize || 8192,
    keepAlive: base?.keepAlive || 0,
    kind: "local",
    key: "",
    role: role.id,
    fallbackModel: role.fallback || "", // a smaller model for when this one doesn't fit the graphics card (vram.js)
  };
  brain.api = brains.apiFor(brain);
  return brain;
}

module.exports = { TOOL_GROUPS, DEFAULT_ROLES, BUILTIN, sanitize, list, get, toolSet, ollamaUrl, modelOf, brainFor };
