// Settings shared by every part of the page. Loaded from the helper once;
// changes are applied right away and saved a moment later. Only what changed is sent (a patch), so a copy of the rest
// that has gone stale (the helper changed it meanwhile: the specialists, the missions) never overwrites it.
import { api } from "./api.js";
import { followSetting } from "./i18n.js";

let settings = null;
const listeners = new Set();
let saveTimer = null;
let pending = {}; // what changed since the last save, as a patch

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

// The parts of b that differ from a ({} when nothing does); objects are compared by key, anything else as a whole
function diff(a, b) {
  const out = {};
  for (const key of Object.keys(b || {})) {
    if (isObject(b[key]) && isObject(a?.[key])) {
      const inner = diff(a[key], b[key]);
      if (Object.keys(inner).length) out[key] = inner;
    } else if (JSON.stringify(a?.[key]) !== JSON.stringify(b[key])) out[key] = clone(b[key]);
  }
  return out;
}

function mergePatch(into, extra) {
  for (const [key, value] of Object.entries(extra)) into[key] = isObject(value) && isObject(into[key]) ? mergePatch(into[key], value) : value;
  return into;
}

// Takes the helper's version in place (what it cleaned or changed), so what other modules hold stays valid
function adopt(target, source) {
  for (const key of Object.keys(target)) if (!(key in source)) delete target[key];
  for (const [key, value] of Object.entries(source)) {
    if (isObject(value) && isObject(target[key])) adopt(target[key], value);
    else target[key] = value;
  }
}

const idle = () => !saveTimer && !Object.keys(pending).length;

export function getSettings() {
  return settings;
}

// fn(settings) runs now (if loaded) and after every change
export function onSettings(fn) {
  listeners.add(fn);
  if (settings) fn(settings);
}

// change(settings) edits the settings in place
export function updateSettings(change) {
  if (!settings) return;
  const before = clone(settings);
  change(settings);
  mergePatch(pending, diff(before, settings));
  listeners.forEach((fn) => fn(settings));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
  say("saving");
}

const say = (what) => document.dispatchEvent(new CustomEvent(`friends:${what}`));

async function save() {
  saveTimer = null;
  const sending = pending;
  pending = {};
  if (!Object.keys(sending).length) {
    say("saved");
    return true;
  }
  try {
    const stored = await api.settings.patch(sending);
    // Nothing newer is waiting: take over what the helper made of it (a number it clamped, something it changed itself)
    if (idle()) {
      adopt(settings, stored);
      listeners.forEach((fn) => fn(settings));
    }
    say("saved");
    return true;
  } catch (err) {
    console.error("Couldn't save settings:", err.message);
    pending = mergePatch(sending, pending); // kept for "Try again"
    say("save-failed");
    return false;
  }
}

// Asks the helper for the settings again (after it changed some by itself), unless something is waiting to be saved
export async function reloadSettings() {
  if (!settings || !idle()) return false;
  try {
    adopt(settings, await api.settings.get());
    listeners.forEach((fn) => fn(settings));
    return true;
  } catch {
    return false;
  }
}

// Saves now instead of in a moment (before the page reloads, for instance)
export function flushSettings() {
  clearTimeout(saveTimer);
  saveTimer = null;
  return settings ? save() : Promise.resolve(false);
}

export const retrySave = () => save();

// Read or write a value by path, e.g. "personality.name"
const read = (path) => path.split(".").reduce((o, k) => o?.[k], settings);
function write(path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((o, k) => o[k], settings)[last] = value;
}

// Simple controls bind themselves: <input data-setting="personality.name">
function syncControls() {
  document.querySelectorAll("[data-setting]").forEach((el) => {
    if (el === document.activeElement && el.type !== "checkbox" && el.type !== "range") return; // don't disturb typing
    const value = read(el.dataset.setting);
    if (el.type === "checkbox") el.checked = !!value;
    else if (value !== undefined) {
      // A saved value that isn't one of a select's choices (set by hand, or by an older version) is shown, not blanked
      if (el.tagName === "SELECT") {
        el.querySelectorAll("option[data-extra]").forEach((o) => o.remove());
        if (![...el.options].some((o) => o.value === String(value))) {
          const extra = new Option(String(value), String(value));
          extra.dataset.extra = "1";
          el.append(extra);
        }
      }
      el.value = String(value);
    }
  });
}

document.addEventListener("input", (e) => {
  const el = e.target.closest?.("[data-setting]");
  if (!el || !settings) return;
  // data-type="number" on a <select> saves a number (the helper drops a string where a number belongs)
  const value = el.type === "checkbox" ? el.checked : el.type === "range" || el.dataset.type === "number" ? Number(el.value) : el.value;
  updateSettings(() => write(el.dataset.setting, value));
});

onSettings(syncControls);

api.settings.get().then(
  (loaded) => {
    settings = loaded;
    followSetting(settings.ui?.language);
    listeners.forEach((fn) => fn(settings));
  },
  (err) => console.error("Couldn't load settings:", err.message)
);
