// Missions that start by themselves: on a schedule (every morning, every Friday, every few hours) or when
// something happens (a file appears in a folder, the disk fills up past a threshold, the graphics card runs hot).
// You approve the plan once, when you set it up; the approval covers every run of exactly that plan. They are
// listed in Missions, and run from the tray: nothing needs the window open.
//
// An automation is { id, name, goal, plan, private, enabled, schedule | trigger, lastRun, nextRun, runs, alerts }.
// A "watch" has no plan: it only looks at the computer and tells you (no model involved).
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { dataDir, writeJson } = require("../config");
const logger = require("../logger");
const settingsModule = require("../settings");
const risk = require("./risk");
const system = require("./system");
const store = require("./store");

const file = () => path.join(dataDir, "missions", "automations.json");
const TICK_MS = Number(process.env.FRIENDS_AUTOMATION_TICK_MS) || 30 * 1000;
const MIN_INTERVAL = 5;
let list = null;
let timer = null;
let fire = () => {}; // runner.createFromPlan, set by init()
let alert = () => {}; // the notification (desktop + Telegram), set by init()
const seen = new Map(); // automation id → what its trigger saw last (files seen, whether the threshold was crossed)
let snapshotCache = { at: 0, value: null };
let killSwitch = false;

const setKillSwitch = (v) => (killSwitch = Boolean(v));
const getKillSwitch = () => killSwitch;

function load() {
  if (list) return list;
  try {
    list = JSON.parse(fs.readFileSync(file(), "utf8"));
    if (!Array.isArray(list)) list = [];
  } catch {
    list = [];
  }
  return list;
}
const save = () => {
  fs.mkdirSync(path.dirname(file()), { recursive: true, mode: 0o700 });
  writeJson(file(), load());
};

const clip = (v, n) => String(v ?? "").trim().slice(0, n);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------- When ----------
// The next time a schedule fires after `from` (ms)
function nextAfter(schedule, from = Date.now()) {
  if (!schedule) return null;
  const at = new Date(from);
  if (schedule.kind === "interval") return from + Math.max(MIN_INTERVAL, schedule.minutes) * 60000;
  const [h, m] = (schedule.time || "08:00").split(":").map(Number);
  for (let add = 0; add <= 8; add++) {
    const d = new Date(at.getFullYear(), at.getMonth(), at.getDate() + add, h, m, 0, 0);
    if (d.getTime() <= from) continue;
    const day = d.getDay() === 0 ? 7 : d.getDay(); // 1 = Monday … 7 = Sunday
    if (schedule.kind === "daily" || (schedule.kind === "weekly" && schedule.days.includes(day))) return d.getTime();
  }
  return null;
}

function cleanSchedule(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.kind === "interval") return { kind: "interval", minutes: Math.min(7 * 24 * 60, Math.max(MIN_INTERVAL, Math.round(Number(raw.minutes) || 60))) };
  const time = TIME.test(raw.time) ? raw.time : "08:00";
  if (raw.kind === "daily") return { kind: "daily", time };
  if (raw.kind === "weekdays") return { kind: "weekly", days: [1, 2, 3, 4, 5], time };
  if (raw.kind === "weekly") {
    const days = [...new Set((Array.isArray(raw.days) ? raw.days : [raw.day]).map(Number).filter((d) => d >= 1 && d <= 7))];
    return days.length ? { kind: "weekly", days, time } : null;
  }
  return null;
}

function cleanTrigger(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.kind === "file") {
    const folder = clip(raw.folder, 300);
    return folder ? { kind: "file", folder, pattern: clip(raw.pattern, 60) } : null;
  }
  if (raw.kind === "disk") return { kind: "disk", mount: clip(raw.mount, 200) || "/", percent: Math.min(99, Math.max(50, Math.round(Number(raw.percent) || 90))) };
  if (raw.kind === "system") {
    const metric = ["cpu", "memory", "gpuTemp"].includes(raw.metric) ? raw.metric : null;
    return metric ? { kind: "system", metric, threshold: Math.min(100, Math.max(20, Math.round(Number(raw.threshold) || 90))) } : null;
  }
  return null;
}

// ---------- The list ----------
// from: { goal, plan, private, name, schedule?, trigger? } (the plan is the one you approved)
function create({ name, goal, plan, private: isPrivate = false, schedule = null, trigger = null, watch = null, enabled = true }) {
  const s = cleanSchedule(schedule);
  const t = cleanTrigger(trigger);
  const w = watch && typeof watch === "object" ? cleanWatch(watch) : null;
  if (!s && !t && !w) throw new Error("Say when it should run: a time, or what should set it off.");
  if (!w && !plan?.steps?.length) throw new Error("There's no approved plan to repeat.");
  const a = {
    id: `a-${crypto.randomBytes(4).toString("hex")}`,
    name: clip(name, 90) || clip(goal, 60) || "Watch my computer",
    goal: clip(goal, 6000),
    plan: plan ? JSON.parse(JSON.stringify(plan)) : null,
    private: isPrivate === true,
    enabled: enabled !== false,
    schedule: s,
    trigger: t,
    watch: w,
    createdAt: Date.now(),
    lastRun: null,
    nextRun: s ? nextAfter(s) : null,
    runs: [],
    alerts: [],
  };
  load().push(a);
  save();
  return view(a);
}

function cleanWatch(raw) {
  const n = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Math.round(Number(v)) || d));
  return {
    everyMinutes: n(raw.everyMinutes, 1, 24 * 60, 5),
    cpu: n(raw.cpu, 20, 100, 90),
    memory: n(raw.memory, 20, 100, 90),
    disk: n(raw.disk, 50, 99, 90),
    gpuTemp: n(raw.gpuTemp, 40, 110, 85),
    services: raw.services !== false,
  };
}

const view = (a) => ({ id: a.id, name: a.name, goal: a.goal, private: a.private, enabled: a.enabled, schedule: a.schedule, trigger: a.trigger, watch: a.watch, lastRun: a.lastRun, nextRun: a.nextRun, runs: a.runs.slice(-5), alerts: a.alerts.slice(-5), steps: a.plan?.steps?.length || 0, actions: (a.plan?.actions || []).map((x) => x.summary) });
const all = () => load().map(view);
const find = (id) => load().find((a) => a.id === id) || null;

function update(id, changes = {}) {
  const a = find(id);
  if (!a) throw new Error("That automation doesn't exist.");
  if (typeof changes.enabled === "boolean") a.enabled = changes.enabled;
  if (changes.name) a.name = clip(changes.name, 90) || a.name;
  if (changes.schedule) {
    a.schedule = cleanSchedule(changes.schedule) || a.schedule;
    a.nextRun = a.enabled ? nextAfter(a.schedule) : a.nextRun;
  }
  if (a.enabled && a.schedule && !a.nextRun) a.nextRun = nextAfter(a.schedule);
  save();
  return view(a);
}

function remove(id) {
  const i = load().findIndex((a) => a.id === id);
  if (i < 0) throw new Error("That automation doesn't exist.");
  load().splice(i, 1);
  seen.delete(id);
  save();
  return { ok: true };
}

// ---------- Running ----------
function runNow(id, note = "") {
  const a = find(id);
  if (!a) throw new Error("That automation doesn't exist.");
  return start(a, note || "You started it by hand.");
}

function active(a) {
  return a.runs.some((id) => {
    const m = store.find(id);
    return m && ["planning", "running", "paused", "clarifying"].includes(m.status);
  });
}

function start(a, why, now = Date.now()) {
  if (a.watch) return check(a, true);
  if (active(a)) {
    logger.info(`Automation "${a.name}" is still running; skipped (${why})`);
    return null;
  }
  const result = fire(a.goal + (why ? `\n\n(Started because: ${why})` : ""), a.plan, { source: "schedule", private: a.private, automationId: a.id, title: a.name });
  a.lastRun = now;
  a.runs.push(result.id);
  if (a.runs.length > 30) a.runs.splice(0, a.runs.length - 30);
  if (a.schedule) a.nextRun = nextAfter(a.schedule, now);
  save();
  return result;
}

// What a "watch" sees now, and tells you about when it's new
async function check(a, force = false) {
  const w = a.watch;
  const snap = await system.snapshot();
  const found = system.problems(snap, { cpu: w.cpu, memory: w.memory, disk: w.disk, gpuTemp: w.gpuTemp }).filter((p) => w.services || !/^Failing services/.test(p));
  const key = found.join("|");
  const last = seen.get(a.id) || { key: "", at: 0 };
  a.lastRun = Date.now();
  if (found.length && (key !== last.key || force || Date.now() - last.at > 6 * 3600 * 1000)) {
    seen.set(a.id, { key, at: Date.now() });
    a.alerts.push({ at: Date.now(), text: found.join("; ") });
    if (a.alerts.length > 20) a.alerts.shift();
    alert({ title: a.name, body: found.join("\n"), automation: a.id });
  } else if (!found.length) seen.set(a.id, { key: "", at: Date.now() });
  save();
  return { checked: true, problems: found };
}

// One look at the computer, shared by the triggers that ask in the same moment
async function snapshot(now = Date.now()) {
  if (snapshotCache.value && Math.abs(now - snapshotCache.at) < 10000) return snapshotCache.value;
  snapshotCache = { at: now, value: await system.snapshot() };
  return snapshotCache.value;
}

function folderFiles(a) {
  const dir = path.resolve(risk.expand(a.trigger.folder));
  try {
    return fs.readdirSync(dir).filter((n) => !n.startsWith(".") && (!a.trigger.pattern || matchesPattern(n, a.trigger.pattern)));
  } catch {
    return null;
  }
}

function matchesPattern(name, pattern) {
  const re = new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");
  return re.test(name);
}

// One look at everything that can start by itself
// On battery (and "save battery" in Settings → AI & privacy → This computer is on) the missions that would start a model
// wait for the charger; a schedule that is due then fires once it's back. Watching the computer needs no model, so it goes on.
async function onBattery() {
  if (settingsModule.get().device?.saveBattery === false) return false;
  const hw = await require("../hardware").live().catch(() => null);
  return hw?.battery?.onBattery === true;
}

async function tick(now = Date.now()) {
  if (killSwitch) return;
  const saving = await onBattery();
  for (const a of load()) {
    if (!a.enabled) continue;
    try {
      if (a.watch) {
        if (!a.lastRun || now - a.lastRun >= a.watch.everyMinutes * 60000) await check(a);
      } else if (saving && (a.schedule || a.trigger?.kind === "file")) {
        continue;
      } else if (a.schedule) {
        if (a.nextRun && now >= a.nextRun) start(a, `its schedule (${describe(a)})`, now);
      } else if (a.trigger?.kind === "file") {
        const names = folderFiles(a);
        if (!names) continue;
        const known = seen.get(a.id)?.files;
        if (!known) seen.set(a.id, { files: new Set(names) }); // the first look only learns what's there
        else {
          const fresh = names.filter((n) => !known.has(n));
          fresh.forEach((n) => known.add(n));
          if (fresh.length) start(a, `a new file appeared in ${a.trigger.folder}: ${fresh.slice(0, 5).join(", ")}`, now);
        }
      } else if (a.trigger?.kind === "disk" || a.trigger?.kind === "system") {
        const snap = await snapshot(now);
        const value = triggerValue(a.trigger, snap);
        if (value === null) continue;
        const was = seen.get(a.id)?.over === true;
        const over = value >= a.trigger.percent || value >= (a.trigger.threshold ?? Infinity);
        // fires when it crosses the threshold, and again only after it has dropped well below it
        const limit = a.trigger.percent ?? a.trigger.threshold;
        const rearm = value < limit - 5;
        if (over && !was) {
          seen.set(a.id, { over: true });
          start(a, a.trigger.kind === "disk" ? `${a.trigger.mount} is ${value}% full (limit ${a.trigger.percent}%)` : `${a.trigger.metric} reached ${value} (limit ${a.trigger.threshold})`, now);
        } else if (!over && rearm) seen.set(a.id, { over: false });
      }
    } catch (err) {
      logger.warn(`Automation ${a.name}:`, err.message);
    }
  }
}

function triggerValue(trigger, snap) {
  if (trigger.kind === "disk") {
    const d = (snap.disks || []).find((x) => x.mount === trigger.mount) || (trigger.mount === "/" ? snap.disks?.[0] : null);
    return d ? d.usedPercent : null;
  }
  if (trigger.metric === "cpu") return snap.cpuPercent ?? null;
  if (trigger.metric === "memory") return snap.memory?.usedPercent ?? null;
  if (trigger.metric === "gpuTemp") return snap.gpu?.temperatureC ?? null;
  return null;
}

function describe(a) {
  if (a.watch) return `Checks every ${a.watch.everyMinutes} min`;
  if (a.schedule?.kind === "interval") return `Every ${a.schedule.minutes} minutes`;
  if (a.schedule?.kind === "daily") return `Every day at ${a.schedule.time}`;
  if (a.schedule?.kind === "weekly") {
    const names = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    return a.schedule.days.length === 5 && a.schedule.days.every((d) => d <= 5) ? `Weekdays at ${a.schedule.time}` : `${a.schedule.days.map((d) => names[d]).join(", ")} at ${a.schedule.time}`;
  }
  if (a.trigger?.kind === "file") return `When a file appears in ${a.trigger.folder}`;
  if (a.trigger?.kind === "disk") return `When ${a.trigger.mount} is ${a.trigger.percent}% full`;
  if (a.trigger?.kind === "system") return `When ${a.trigger.metric} reaches ${a.trigger.threshold}`;
  return "";
}

// fns: { fire(goal, plan, options), alert({ title, body }) }
function init(fns) {
  fire = fns.fire;
  alert = fns.alert;
  clearInterval(timer);
  timer = setInterval(() => tick().catch(() => {}), TICK_MS);
  timer.unref?.();
  setTimeout(() => tick().catch(() => {}), 3000).unref?.(); // one look right after starting: a schedule missed while the computer was off runs now
}

const stop = () => clearInterval(timer);
const reload = () => (list = null);

module.exports = { create, update, remove, all, find, runNow, tick, init, stop, reload, nextAfter, cleanSchedule, cleanTrigger, describe, view, setKillSwitch, getKillSwitch };
