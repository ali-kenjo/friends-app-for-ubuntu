// Every call a mission makes to the cloud manager (Gemini) goes through here, because a mission can make many
// of them and the free tier is small:
//   - one call at a time, a moment apart (no bursts),
//   - counted per mission (its limit, shown on the plan) and per day (shown in Missions),
//   - a rate limit ("quota") is waited out when it's short, with a message; when it's long the mission pauses
//     until the models are back, and says so (QuotaPause), instead of failing.
const fs = require("fs");
const path = require("path");
const { dataDir, writeJson } = require("../config");
const logger = require("../logger");
const brains = require("../brains");
const gemini = require("../gemini");
const settingsModule = require("../settings");

const GAP_MS = Number(process.env.FRIENDS_CLOUD_GAP_MS ?? 1200);
const SHORT_WAIT_MS = Number(process.env.FRIENDS_CLOUD_SHORT_WAIT_MS ?? 90 * 1000);
const MAX_RETRIES = 3;

class QuotaPause extends Error {
  constructor(message, until) {
    super(message);
    this.name = "QuotaPause";
    this.quota = true;
    this.until = until;
  }
}
class LimitReached extends Error {
  constructor(message, which) {
    super(message);
    this.name = "LimitReached";
    this.which = which;
  }
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error("Stopped."), { name: "AbortError" }));
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener("abort", stop);
      resolve();
    }
    function stop() {
      clearTimeout(timer);
      reject(Object.assign(new Error("Stopped."), { name: "AbortError" }));
    }
    signal?.addEventListener("abort", stop, { once: true });
  });

// ---------- Usage ----------
const usageFile = () => path.join(dataDir, "missions", "usage.json");
const today = () => new Date().toISOString().slice(0, 10);
let usage = null;

function loadUsage() {
  if (usage) return usage;
  try {
    usage = JSON.parse(fs.readFileSync(usageFile(), "utf8"));
  } catch {
    usage = {};
  }
  if (usage.day !== today()) usage = { day: today(), calls: 0, byModel: {}, waits: 0 };
  return usage;
}

function count(model) {
  const u = loadUsage();
  u.calls++;
  u.byModel[model] = (u.byModel[model] || 0) + 1;
  try {
    writeJson(usageFile(), u);
  } catch {}
}

const usageToday = () => ({ ...loadUsage() });

// ---------- Who the manager is ----------
let resolved = null; // { at, key, plan, fast }
const versionOf = (m) => parseFloat(String(m).match(/^gemini-([\d.]+)/)?.[1] || 0);

// The manager's two models: a stronger one for planning and checking, a faster one for routine steps.
// Both can be set in Settings → AI → Missions; empty means choose by itself from what the key can use.
async function manager(settings = settingsModule.get()) {
  const brain = brains.getByKind("cloud");
  if (!brain || settings.privacy?.localOnly) return null;
  const cfg = settings.missions?.manager || {};
  if (resolved && resolved.key === brain.key && Date.now() - resolved.at < 10 * 60 * 1000 && !cfg.planModel && !cfg.fastModel) return resolved.value;
  let available = [];
  if (brain.provider === "gemini") available = (await gemini.cachedModels(brain.key).catch(() => null)) || [];
  const pro = available.filter((m) => /^gemini-[\d.]+-pro/.test(m)).sort((a, b) => versionOf(b) - versionOf(a))[0];
  const withModel = (model) => ({ ...brain, model: model || brain.model });
  const value = { plan: withModel(cfg.planModel || pro || brain.model), fast: withModel(cfg.fastModel || brain.model), brain };
  if (!cfg.planModel && !cfg.fastModel) resolved = { at: Date.now(), key: brain.key, value };
  return value;
}

const forget = () => (resolved = null);

// ---------- The gate ----------
let queue = Promise.resolve();
let lastCall = 0;

// Runs fn() (one cloud call). ctx: { mission, signal, onWait({ ms, reason }), model }
async function call(fn, ctx = {}) {
  const { mission, signal } = ctx;
  if (mission?.limits && mission.limits.maxCloudCalls >= 0 && mission.usage.cloudCalls >= mission.limits.maxCloudCalls) {
    throw new LimitReached(`This mission has used its ${mission.limits.maxCloudCalls} cloud calls.`, "cloudCalls");
  }
  const turn = queue;
  let release;
  queue = new Promise((r) => (release = r));
  try {
    await turn;
    for (let attempt = 0; ; attempt++) {
      const wait = lastCall + GAP_MS - Date.now();
      if (wait > 0) await sleep(wait, signal);
      lastCall = Date.now();
      try {
        const out = await fn();
        if (mission) mission.usage.cloudCalls++;
        count(ctx.model || "cloud");
        return out;
      } catch (err) {
        if (err.name === "AbortError" || signal?.aborted) throw err;
        const limited = err.quota === true || err.status === 429 || err.overloaded === true;
        if (!limited) throw err;
        const ms = Math.max(2000, err.retryAfterMs || 15000);
        loadUsage().waits = (loadUsage().waits || 0) + 1;
        if (ms > SHORT_WAIT_MS || attempt >= MAX_RETRIES) {
          throw new QuotaPause(`Gemini's free limit is reached for now. The mission waits and carries on by itself around ${new Date(Date.now() + ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`, Date.now() + ms);
        }
        logger.info(`Gemini is rate limited; a mission waits ${Math.round(ms / 1000)} s`);
        ctx.onWait?.({ ms, reason: "Gemini's rate limit" });
        await sleep(ms + 500, signal);
      }
    }
  } finally {
    release();
  }
}

module.exports = { call, manager, forget, usageToday, QuotaPause, LimitReached, sleep, count };
