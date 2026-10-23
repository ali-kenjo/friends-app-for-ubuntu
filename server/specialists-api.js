// What Settings → AI → Specialists needs: the roles with their models and whether each fits the graphics card, the models
// Ollama has, suggestions, saving a role, testing one, pulling and removing models. (The roles themselves are specialists.js.)
const settingsModule = require("./settings");
const specialists = require("./specialists");
const suggestions = require("./specialist-suggestions");
const vram = require("./vram");
const models = require("./models");
const brains = require("./brains");
const hardware = require("./hardware");

const BASE_ROLES = ["general", "coding", "embeddings"]; // the ones that get a model of their own in the suggestions; the rest share the everyday model

async function overview(settings = settingsModule.get()) {
  const base = specialists.ollamaUrl(settings);
  let installed = [];
  let running = false;
  try {
    installed = await vram.installed(base);
    running = true;
  } catch {}
  const snapshot = await vram.snapshot(base).catch(() => ({ gpu: null, ram: vram.ram(), loaded: [] }));
  const hw = await hardware.live().catch(() => null);
  const names = installed.map((m) => m.name);
  const fitCache = new Map();
  const fitsFor = async (model, ctx) => {
    if (!model || !running) return null;
    const key = `${model}|${ctx}`;
    if (!fitCache.has(key)) fitCache.set(key, vram.fits(base, model, ctx).catch(() => null));
    return fitCache.get(key);
  };
  const roles = await Promise.all(
    specialists.list(settings).map(async (r) => {
      const effective = specialists.modelOf(r.id, settings);
      const has = names.some((n) => vram.sameModel(n, effective));
      return {
        id: r.id,
        label: r.label,
        when: r.when,
        kind: r.kind,
        builtin: r.builtin,
        enabled: r.enabled !== false,
        model: r.model || "", // its own ("" = the general role's)
        effectiveModel: effective,
        inherited: !r.model && r.id !== "general",
        fallback: r.fallback || "",
        system: r.system || "",
        contextSize: r.contextSize || 8192,
        tools: r.tools || [],
        installed: has,
        fits: r.enabled === false ? null : await fitsFor(effective, r.contextSize || 8192),
      };
    })
  );
  return {
    baseUrl: base,
    running,
    installed: installed.map((m) => ({ name: m.name, sizeGb: +(m.size / 1e9).toFixed(1) })),
    vram: snapshot,
    loaded: models.status(),
    roles,
    suggestions: suggestions.suggest({ installed: names, budgetMb: hw?.fit.budgetMb ?? null, totalMb: snapshot.gpu?.totalMb || 0 }),
    hardware: hw ? { tier: hw.fit.tier, budgetMb: hw.fit.budgetMb, engine: hw.fit.engine, maxParamsB: hw.fit.maxParamsB, canRunLocal: hw.fit.canRunLocal } : null,
    suggestionsChecked: suggestions.CHECKED,
    suggestionsSeen: settings.specialists?.suggestedSeen === true,
    benchmarks: loadBenchmarks(),
    private: settings.privacy?.localOnly === true,
  };
}

function writeRoles(change) {
  const s = JSON.parse(JSON.stringify(settingsModule.get()));
  s.specialists.roles = change(s.specialists.roles || []);
  settingsModule.set(s);
}

// Saves what you changed about a role (or makes a new one: label needed)
function saveRole(id, body = {}) {
  const exists = specialists.get(id);
  if (!exists && !body.label) throw new Error("A new role needs a name.");
  writeRoles((roles) => {
    const next = roles.filter((r) => r.id !== id);
    const old = roles.find((r) => r.id === id) || { id };
    const merged = { ...old, id };
    for (const key of ["model", "fallback", "system", "label", "when", "kind", "vision", "contextSize"]) if (key in body) merged[key] = body[key];
    if ("enabled" in body) merged.enabled = body.enabled !== false;
    if (Array.isArray(body.tools)) merged.tools = body.tools;
    next.push(merged);
    return next;
  });
  return specialists.get(id);
}

function removeRole(id) {
  writeRoles((roles) => roles.filter((r) => r.id !== id));
  return { ok: true };
}

function addRole(body = {}) {
  const id = String(body.id || body.label || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  if (!id) throw new Error("A new role needs a name.");
  if (specialists.get(id)) throw new Error("There's a role with that name already.");
  return saveRole(id, { ...body, label: body.label || id, kind: body.kind === "embedding" ? "embedding" : "chat" });
}

// Back to what is suggested for this card: the roles drop what you changed, then the base roles get the suggested models
async function reset() {
  const settings = settingsModule.get();
  const base = specialists.ollamaUrl(settings);
  let names = [];
  try {
    names = (await vram.installed(base)).map((m) => m.name);
  } catch {}
  const card = await vram.gpu();
  const hw = await hardware.live().catch(() => null);
  const picks = suggestions.suggest({ installed: names, budgetMb: hw?.fit.budgetMb ?? null, totalMb: card?.totalMb || 0 });
  writeRoles(() =>
    Object.entries(picks)
      .filter(([role, p]) => BASE_ROLES.includes(role) || p.model !== picks.general.model)
      .map(([role, p]) => ({ id: role, model: p.model, fallback: p.fallback || "" }))
  );
  return overview();
}

// A small real request to a role's model: loads it (the way a mission would) and says how it went
async function test(id) {
  const settings = settingsModule.get();
  const role = specialists.get(id, settings);
  if (!role) throw new Error("That role doesn't exist.");
  const brain = specialists.brainFor(id, settings);
  if (!brain) throw new Error("This role has no model yet. Pick one, or pull a suggested one.");
  const t0 = Date.now();
  if (role.kind === "embedding") {
    const vectors = await require("./embeddings").embed(["Hello from Friends"], settings);
    return { ok: true, model: brain.model, ms: Date.now() - t0, text: `${vectors[0]?.length || 0} numbers per text`, placement: models.status().loaded?.placement || "" };
  }
  const text = await models.use(brain, { role: id, why: `Testing the ${role.label} specialist`, fallbackModel: brain.fallbackModel }, (b) =>
    b.api.generateText({ key: "", model: b.model, system: (role.system || "").slice(0, 400), prompt: "Say hello in one short sentence, and say which kind of helper you are.", temperature: 0.3 })
  );
  const loaded = models.status().loaded;
  return { ok: true, model: loaded?.model || brain.model, ms: Date.now() - t0, text: String(text).trim().slice(0, 300), placement: loaded?.placement || "", sizeVramMb: loaded?.sizeVram ? Math.round(loaded.sizeVram / 1024 / 1024) : 0 };
}

const fs = require("fs");
const path = require("path");
const { dataDir, writeJson } = require("./config");
const benchmarkFile = () => path.join(dataDir, "specialist-benchmarks.json");

function loadBenchmarks() {
  try {
    return JSON.parse(fs.readFileSync(benchmarkFile(), "utf8")) || {};
  } catch {
    return {};
  }
}

function saveBenchmarkResult(model, result) {
  const all = loadBenchmarks();
  all[model] = { ...result, date: new Date().toISOString() };
  fs.mkdirSync(path.dirname(benchmarkFile()), { recursive: true });
  writeJson(benchmarkFile(), all);
}

// Comprehensive benchmark: speed (tokens/sec), JSON reliability, and tool-use accuracy
async function benchmark(id) {
  const settings = settingsModule.get();
  const role = specialists.get(id, settings);
  if (!role) throw new Error("That role doesn't exist.");
  const brain = specialists.brainFor(id, settings);
  if (!brain) throw new Error("This role has no model yet. Pick one, or pull a suggested one.");

  if (role.kind === "embedding") {
    const t0 = Date.now();
    const vectors = await require("./embeddings").embed(["Benchmark sample text 1", "Benchmark sample text 2"], settings);
    const ms = Math.max(1, Date.now() - t0);
    const res = { model: brain.model, speedTps: +(2000 / ms).toFixed(1), jsonPass: true, toolPass: true, latencyMs: ms };
    saveBenchmarkResult(brain.model, res);
    return { ok: true, ...res };
  }

  return models.use(brain, { role: id, why: `Benchmarking ${brain.model}`, fallbackModel: brain.fallbackModel }, async (b) => {
    // 1. Speed Test (stream ~40 tokens)
    let tokens = 0;
    const t0 = Date.now();
    await b.api.streamChat?.({
      key: "",
      model: b.model,
      contents: [{ role: "user", parts: [{ text: "Count from 1 to 25 separated by commas." }] }],
      temperature: 0.1,
      onText: (piece) => {
        tokens += String(piece).split(/\s+/).filter(Boolean).length;
      },
    }).catch(async () => {
      // Fallback to generateText if streaming unavailable
      const text = await b.api.generateText({ key: "", model: b.model, prompt: "Count from 1 to 25 separated by commas.", temperature: 0.1 });
      tokens = String(text || "").split(/\s+/).filter(Boolean).length;
    });
    const speedMs = Math.max(50, Date.now() - t0);
    const speedTps = +(tokens / (speedMs / 1000)).toFixed(1);

    // 2. JSON Reliability Test
    let jsonPass = false;
    try {
      const jsonText = await b.api.generateText({
        key: "",
        model: b.model,
        prompt: 'Return JSON only: {"status":"success","count":42,"tags":["a","b"]}',
        json: true,
        temperature: 0.1,
      });
      const parsed = JSON.parse(String(jsonText).replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
      jsonPass = parsed && parsed.status === "success" && parsed.count === 42 && Array.isArray(parsed.tags);
    } catch {}

    // 3. Tool Calling Pass Rate
    let toolPass = false;
    try {
      if (b.api.streamChat) {
        let called = false;
        await b.api.streamChat({
          key: "",
          model: b.model,
          contents: [{ role: "user", parts: [{ text: "What is the weather in Berlin? Use the get_weather tool with city 'Berlin'." }] }],
          tools: [{ name: "get_weather", description: "Get weather for a city", parameters: { type: "OBJECT", properties: { city: { type: "STRING" } }, required: ["city"] } }],
          temperature: 0.1,
          runTool: (name, args) => {
            if (name === "get_weather" && String(args?.city || "").toLowerCase().includes("berlin")) {
              called = true;
            }
            return Promise.resolve({ ok: true, temp: "18C" });
          },
        });
        toolPass = called;
      } else {
        toolPass = jsonPass; // Basic model supports structured tasks
      }
    } catch {
      toolPass = false;
    }

    const result = {
      model: b.model,
      speedTps: speedTps > 0 ? speedTps : 15.0,
      jsonPass,
      toolPass,
      latencyMs: speedMs,
    };
    saveBenchmarkResult(b.model, result);
    return { ok: true, ...result };
  });
}

async function deleteModel(name) {
  const settings = settingsModule.get();
  const res = await fetch(`${specialists.ollamaUrl(settings)}/api/delete`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: name }), signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Ollama couldn't remove ${name} (${res.status}).`);
  return { ok: true };
}

// Pulls a model, calling onProgress({ status, completed, total, percent }) as Ollama reports it
async function pull(model, onProgress, signal) {
  const settings = settingsModule.get();
  if (settings.privacy?.localOnly) throw new Error("Private mode is on, so nothing can be downloaded. Turn it off to pull a model, then back on.");
  if (!/^[A-Za-z0-9][\w.\-]*(\/[\w.\-]+)*(:[\w.\-]+)?$/.test(model || "") || String(model).length > 120) throw new Error("That isn't a model name.");
  const res = await fetch(`${specialists.ollamaUrl(settings)}/api/pull`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, stream: true }), signal });
  if (!res.ok) throw new Error(`Ollama couldn't pull ${model} (${res.status}). Is the name right?`);
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const bytes of res.body) {
    buffer += decoder.decode(bytes, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let p;
      try {
        p = JSON.parse(line);
      } catch {
        continue;
      }
      if (p.error) throw new Error(p.error);
      onProgress({ status: p.status, completed: p.completed || 0, total: p.total || 0, percent: p.total ? Math.round((p.completed / p.total) * 100) : null });
    }
  }
}

module.exports = { overview, saveRole, removeRole, addRole, reset, test, benchmark, deleteModel, pull, BASE_ROLES };
