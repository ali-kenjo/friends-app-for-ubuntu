// ---------- Settings → Robot → Room and → Privacy: the room the robot is in ----------
// These are the room document's own settings (saved with the room through robot.setRoom, as the Room
// Editor saves them), not the app's: another room keeps its own. Filled whenever the room changes.
import { robot } from "../robot/index.js";
import { t, nf } from "../i18n.js";
import { announce } from "../a11y.js";
import * as C from "./choices.mjs";
import { defaultAtmosphere } from "./model.mjs";
import { entryFor } from "./catalog.mjs";
import { personalOn } from "./rules.mjs";
import { templateRoom } from "./templates.mjs";

const $ = (id) => document.getElementById(id);
const els = {
  name: $("rb-room-name"),
  mood: $("rb-room-mood"),
  brightness: $("rb-room-brightness"),
  brightnessValue: $("rb-room-brightness-value"),
  time: $("rb-room-time"),
  hourRow: $("rb-room-hour-row"),
  hour: $("rb-room-hour"),
  hourValue: $("rb-room-hour-value"),
  tint: $("rb-room-tint"),
  air: $("rb-room-air"),
  amount: $("rb-room-amount"),
  amountValue: $("rb-room-amount-value"),
  season: $("rb-room-season"),
  weather: $("rb-room-weather"),
  wind: $("rb-room-wind"),
  camera: $("rb-room-camera"),
  backdrop: $("rb-room-backdrop"),
  reset: $("rb-room-reset"),
  things: $("rb-privacy-things"),
  none: $("rb-privacy-none"),
};

const percent = (v) => `${nf(Math.round(v))} %`;
const clock = (v) => `${String(Math.floor(v)).padStart(2, "0")}:${String(Math.round((v % 1) * 60)).padStart(2, "0")}`;
// The keys that switch a thing's own things on (rules.mjs personalOn), with what each switch says
const PERSONAL = () => ({
  mirror: t("Show my whiteboard on it (your own things)"),
  showNotes: t("Show my notes (your own things)"),
  showPhotos: t("Show my photos (your own things)"),
  showEvents: t("Show my calendar (your own things)"),
  showInbox: t("Show my inbox (your own things)"),
});

function fillOptions(select, items) {
  const value = select.value;
  select.replaceChildren(...items.map((x) => new Option(t(x.label), x.id)));
  if (value) select.value = value;
}

function change(fn, words) {
  const d = robot.room;
  if (!d) return;
  robot.setRoom(fn(JSON.parse(JSON.stringify(d))));
  if (words) announce(words);
}
const setAtm = (patch) => change((d) => ({ ...d, atmosphere: { ...d.atmosphere, ...patch } }));

function fill() {
  const d = robot.room;
  const ready = Boolean(d);
  for (const el of Object.values(els)) if (el && "disabled" in el && el !== els.reset) el.disabled = !ready;
  if (els.reset) els.reset.disabled = !ready;
  if (!d) return;
  const a = d.atmosphere;
  if (document.activeElement !== els.name) els.name.value = d.name;
  fillOptions(els.mood, C.MOODS);
  els.mood.value = a.mood;
  els.brightness.value = String(Math.round(a.brightness * 100));
  els.brightnessValue.textContent = percent(a.brightness * 100);
  fillOptions(els.time, C.TIME_MODES);
  els.time.value = a.timeMode;
  els.hourRow.hidden = a.timeMode !== "manual";
  els.hour.value = String(a.timeHour);
  els.hourValue.textContent = clock(a.timeHour);
  els.tint.checked = a.emotionTint !== false;
  fillOptions(els.air, C.AIRS);
  els.air.value = a.air;
  els.amount.value = String(Math.round(a.airAmount * 100));
  els.amountValue.textContent = percent(a.airAmount * 100);
  fillOptions(els.season, C.SEASONS);
  els.season.value = a.season;
  els.weather.checked = a.weatherSync !== false;
  els.wind.value = String(Math.round((a.wind ?? 0.3) * 100));
  // The room's own shots, or the usual framing
  els.camera.replaceChildren(new Option(t("Frames the robot (close, medium, wide)"), "auto"), ...(d.cameras || []).map((c) => new Option(c.name || t("Shot"), c.id)));
  els.camera.value = d.defaultCamera || "auto";
  fillOptions(els.backdrop, C.BACKDROP_LAYERS);
  els.backdrop.value = d.backdrop?.layer || "full";
  fillPrivacy(d);
}

// Settings → Robot → Privacy: each thing in this room that can show your own things, with its switch
function fillPrivacy(d) {
  const words = PERSONAL();
  const rows = [];
  for (const a of d.assets) {
    const def = entryFor(a.type);
    if (!def?.personalData) continue;
    const key = Object.keys(def.states || {}).find((k) => k in words);
    if (!key) continue;
    const id = `rb-privacy-${a.id}`;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "toggle";
    input.id = id;
    input.checked = personalOn(a);
    input.addEventListener("change", () => {
      change((doc) => ({ ...doc, assets: doc.assets.map((x) => (x.id === a.id ? { ...x, state: { ...x.state, [key]: input.checked } } : x)) }));
    });
    const label = document.createElement("label");
    label.className = "row";
    label.htmlFor = id;
    const text = document.createElement("div");
    const name = document.createElement("div");
    name.className = "row-label";
    name.textContent = a.name || t(def.label);
    const desc = document.createElement("div");
    desc.className = "row-desc";
    desc.textContent = words[key];
    text.append(name, desc);
    label.append(text, input);
    rows.push(label);
  }
  els.things.replaceChildren(...rows);
  els.none.textContent = rows.length ? t("Each of these is off until you switch it on.") : t("Nothing in this room can show your own things.");
}

if (els.name) {
  els.name.addEventListener("change", () => {
    const name = els.name.value.trim().slice(0, 60);
    if (name) change((d) => ({ ...d, name }));
    else fill();
  });
  els.mood.addEventListener("change", () => setAtm({ mood: els.mood.value }));
  els.brightness.addEventListener("input", () => setAtm({ brightness: Number(els.brightness.value) / 100 }));
  els.time.addEventListener("change", () => setAtm({ timeMode: els.time.value }));
  els.hour.addEventListener("input", () => setAtm({ timeHour: Number(els.hour.value) }));
  els.tint.addEventListener("change", () => setAtm({ emotionTint: els.tint.checked }));
  els.air.addEventListener("change", () => setAtm({ air: els.air.value }));
  els.amount.addEventListener("input", () => setAtm({ airAmount: Number(els.amount.value) / 100 }));
  els.season.addEventListener("change", () => setAtm({ season: els.season.value }));
  els.weather.addEventListener("change", () => setAtm({ weatherSync: els.weather.checked }));
  els.wind.addEventListener("input", () => setAtm({ wind: Number(els.wind.value) / 100 }));
  els.camera.addEventListener("change", () => change((d) => ({ ...d, defaultCamera: els.camera.value })));
  els.backdrop.addEventListener("change", () => change((d) => ({ ...d, backdrop: { ...d.backdrop, layer: els.backdrop.value } })));
  // Light and air as the room's template made them (or as a new room has them)
  els.reset.addEventListener("click", () => {
    const d = robot.room;
    if (!d) return;
    let atmosphere = defaultAtmosphere();
    try {
      if (d.template) atmosphere = templateRoom(d.template).atmosphere;
    } catch {}
    change((doc) => ({ ...doc, atmosphere: { ...atmosphere } }), t("{name}: light and air as they were", { name: d.name }));
  });
  document.addEventListener("friends:robot-room", fill);
  document.addEventListener("friends:language-ready", fill);
  fill();
}
