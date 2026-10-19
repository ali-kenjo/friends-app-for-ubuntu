// The AI providers, one interface each. Everything that talks to an AI (chat, voice's Studio engine, the
// routing, the mission engine) gets an "api" from here and only calls these functions, so a new provider
// (another cloud AI, another kind of local server) is added by registering it here, and nothing else changes.
//
//   listModels(key)                          → [model names]
//   checkModel({ key, model })               → resolves when that model answers
//   generateText({ key, model, system, prompt, temperature, signal, json }) → text (json: ask for a JSON reply)
//   streamChat({ key, model, contents, system, temperature, tools, runTool, isFreeTool, signal, onText, fast })
//                                            streams a reply, running tool calls (Gemini-style contents and tool declarations)
//   transcribe / speak                       optional (speech)
//
// A provider is "cloud" (needs the internet; off in Private mode) or "local" (this computer or your network).
const gemini = require("./gemini");
const openai = require("./openai");
const ollama = require("./ollama");

const REQUIRED = ["listModels", "checkModel", "generateText", "streamChat"];
const registry = new Map(); // name → { kind, label, company, create(options) → api }

function register(name, { kind, label = name, company = label, create }) {
  if (!["cloud", "local"].includes(kind)) throw new Error(`Provider ${name}: kind is "cloud" or "local".`);
  if (typeof create !== "function") throw new Error(`Provider ${name}: it needs create(options).`);
  registry.set(name, { kind, label, company, create });
}

// Does an api have what the rest of the helper calls? ([] when it does)
const missing = (api) => REQUIRED.filter((fn) => typeof api?.[fn] !== "function");

// "gemini" is Google's cloud API; "local" is any OpenAI-compatible server (Ollama, LM Studio, llama.cpp, vLLM…)
register("gemini", { kind: "cloud", label: "Gemini", company: "Google", create: () => gemini });
register("local", {
  kind: "local",
  label: "Local AI",
  company: "On this computer",
  create: ({ protocol, baseUrl, contextSize, keepAlive, numGpu, speechUrl, speechModel } = {}) =>
    protocol === "ollama" ? ollama.create({ baseUrl, contextSize, keepAlive, numGpu, speechUrl, speechModel }) : openai.create({ baseUrl, speechUrl, speechModel }),
});

function create(options = {}) {
  const entry = registry.get(options.provider);
  if (!entry) throw new Error("That kind of AI isn't supported.");
  const api = entry.create(options);
  const gaps = missing(api);
  if (gaps.length) throw new Error(`The ${entry.label} provider is missing ${gaps.join(", ")}.`);
  return api;
}

const has = (name) => registry.has(name);
const kindOf = (name) => registry.get(name)?.kind || "cloud";
const names = () => [...registry.keys()];
const info = (name) => registry.get(name) || null;

module.exports = { register, create, has, kindOf, names, info, missing, REQUIRED };
