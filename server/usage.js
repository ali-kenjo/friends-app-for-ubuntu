// How much each AI has been used today: calls, failures, how fast it answers. Kept in <data folder>/usage.json by day (the
// last 14 days), so Settings can show it and a daily limit can be kept. Nothing here has the messages, only counts.
const fs = require("fs");
const path = require("path");
const { dataDir, writeJson } = require("./config");

const file = () => path.join(dataDir, "usage.json");
const KEEP_DAYS = 14;

let data = null;
let saveTimer = null;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function load() {
  if (data) return data;
  try {
    data = JSON.parse(fs.readFileSync(file(), "utf8"));
  } catch {
    data = {};
  }
  if (!data.days || typeof data.days !== "object") data = { days: {} };
  return data;
}

function persistSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 1500);
  saveTimer.unref?.();
}

function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!data) return;
  const keep = Object.keys(data.days).sort().slice(-KEEP_DAYS);
  for (const day of Object.keys(data.days)) if (!keep.includes(day)) delete data.days[day];
  try {
    writeJson(file(), data);
  } catch {}
}

// One call finished: ok, how long it took (ms), the error message when it failed
function record(brainId, { ok = true, ms = 0, error = "" } = {}) {
  const day = (load().days[today()] ||= {});
  const entry = (day[brainId] ||= { calls: 0, errors: 0, ms: 0, lastError: "", lastAt: 0 });
  entry.calls++;
  if (ok) entry.ms += ms;
  else {
    entry.errors++;
    entry.lastError = String(error).slice(0, 200);
  }
  entry.lastAt = Date.now();
  persistSoon();
}

// { calls, errors, avgMs, lastError, lastAt } for today; zeros when it wasn't used
function forBrain(brainId) {
  const e = load().days[today()]?.[brainId] || { calls: 0, errors: 0, ms: 0, lastError: "", lastAt: 0 };
  const okCalls = Math.max(0, e.calls - e.errors);
  return { calls: e.calls, errors: e.errors, avgMs: okCalls ? Math.round(e.ms / okCalls) : 0, lastError: e.lastError, lastAt: e.lastAt };
}

// Has it used up its day? (limit 0 = no limit)
const overLimit = (brainId, limit) => Number(limit) > 0 && forBrain(brainId).calls >= Number(limit);

// Everything for the page: today for each AI, and the last days' totals
function summary(brainIds = []) {
  const byBrain = {};
  for (const id of brainIds) byBrain[id] = forBrain(id);
  const days = Object.entries(load().days)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, entries]) => ({ day, calls: Object.values(entries).reduce((s, e) => s + e.calls, 0), errors: Object.values(entries).reduce((s, e) => s + e.errors, 0) }));
  return { today: today(), byBrain, days };
}

function forget(brainId) {
  for (const day of Object.values(load().days)) delete day[brainId];
  persistSoon();
}

const reset = () => {
  data = { days: {} };
  flush();
};

// Tests start fresh without writing
const clearCache = () => {
  clearTimeout(saveTimer);
  saveTimer = null;
  data = null;
};

module.exports = { record, forBrain, overLimit, summary, forget, reset, flush, clearCache };
