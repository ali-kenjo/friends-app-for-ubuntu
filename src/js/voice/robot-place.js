// Where the robot stands in voice mode, and how big it is. By default it is in the middle (and steps aside when a board
// is docked next to it); you can put it anywhere: "Move the robot" lets you drag it, make it bigger or smaller with the
// wheel, a pinch or the + and − keys, and put it back. It is remembered (Settings → Robot → Scene and camera).
import { h } from "../h.js";
import { t } from "../i18n.js";
import { announce } from "../a11y.js";
import { robot } from "../robot/index.js";
import { getSettings, onSettings, updateSettings } from "../store.js";
import { cleanPlace, DEFAULT_PLACE } from "../whiteboard/geometry.mjs";
import { voiceMode } from "./dom.js";

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const PRESET = { left: -1 / 6, right: 1 / 6 }; // Settings → "Place" in the scene popover
let live = null; // the place while you drag (saved when you let go)
let boardShift = 0; // how far a docked board pushes the robot over, when you haven't put it anywhere yourself
let layer = null;

const saved = () => cleanPlace(getSettings()?.robot?.voicePlace);
const isDefault = (p) => p.x === DEFAULT_PLACE.x && p.y === DEFAULT_PLACE.y && p.scale === DEFAULT_PLACE.scale;

// Where the robot is in the picture: sideways from the middle (-0.5 to 0.5), up and down, and its size
export function effectivePlace() {
  const p = live || saved();
  let x = p.x + (PRESET[getSettings()?.robot?.position] || 0);
  if (!live && isDefault(saved())) x += boardShift;
  return { x: clamp(x, -0.5, 0.5), y: p.y, scale: p.scale };
}

export function applyPlace() {
  const e = effectivePlace();
  robot.options("voice", { placeX: e.x, placeY: e.y, placeScale: e.scale });
}

// How far from the middle the robot is, as a fraction of the screen (the board's arm reaches to the right side)
export const robotX = () => effectivePlace().x;

function save(place) {
  updateSettings((s) => {
    s.robot.voicePlace = cleanPlace(place);
  });
}

function reset() {
  live = null;
  save(DEFAULT_PLACE);
  applyPlace();
  announce(t("The robot is back in the middle."));
}

// ---------- Making room for a board beside it ----------
let lastLayout = { open: false, width: 0, mode: "" };
function syncBoard() {
  const W = voiceMode.clientWidth || 0;
  const docked = lastLayout.open && lastLayout.width > 0 && W > 0 && (lastLayout.mode === "left" || lastLayout.mode === "right");
  boardShift = docked ? (lastLayout.mode === "right" ? -1 : 1) * Math.min(0.3, lastLayout.width / W / 2) : 0;
  applyPlace();
}

document.addEventListener("friends:wb-voice-layout", (e) => {
  lastLayout = e.detail || lastLayout;
  syncBoard();
});
new ResizeObserver(syncBoard).observe(voiceMode);
onSettings(applyPlace);

// ---------- Moving it ----------
function build() {
  const done = h("button", { type: "button", class: "btn btn-primary small", onclick: () => stop() }, t("Done"));
  const nudge = (k) => () => {
    const p = live || saved();
    live = cleanPlace({ ...p, scale: p.scale * k });
    applyPlace();
  };
  layer = h("div", { class: "voice-place", role: "group", tabindex: "0", hidden: true, "aria-label": t("Move the robot"), "aria-describedby": "voice-place-hint" },
    h("div", { class: "voice-place-bar" },
      h("p", { id: "voice-place-hint" }, t("Drag the robot where you want it. Scroll or pinch to make it bigger or smaller. Arrow keys move it, + and − resize it.")),
      h("div", { class: "voice-place-actions" },
        h("button", { type: "button", class: "btn small", "aria-label": t("Smaller"), onclick: nudge(1 / 1.12) }, "−"),
        h("button", { type: "button", class: "btn small", "aria-label": t("Larger"), onclick: nudge(1.12) }, "+"),
        h("button", { type: "button", class: "btn small", onclick: () => reset() }, t("Put it back")),
        done)));
  voiceMode.append(layer);

  const pointers = new Map();
  let drag = null;
  let pinch = null;
  layer.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    layer.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = live || saved();
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, place: p };
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: p.scale };
      drag = null;
    }
    layer.classList.add("grabbing");
  });
  layer.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const W = voiceMode.clientWidth || 1;
    const H = voiceMode.clientHeight || 1;
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const p = live || saved();
      live = cleanPlace({ ...p, scale: pinch.scale * ((Math.hypot(a.x - b.x, a.y - b.y) || 1) / pinch.d) });
    } else if (drag) {
      live = cleanPlace({ ...drag.place, x: drag.place.x + (e.clientX - drag.x) / W, y: drag.place.y + (e.clientY - drag.y) / H });
    } else return;
    applyPlace();
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (!pointers.size) {
      layer.classList.remove("grabbing");
      drag = null;
      pinch = null;
      if (live) save(live);
      live = null;
    } else if (pointers.size === 1) {
      const [rest] = [...pointers.values()];
      pinch = null;
      drag = { x: rest.x, y: rest.y, place: live || saved() };
    }
  };
  layer.addEventListener("pointerup", up);
  layer.addEventListener("pointercancel", up);
  layer.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = live || saved();
    live = cleanPlace({ ...p, scale: p.scale * Math.exp(-e.deltaY * 0.0015) });
    applyPlace();
    clearTimeout(layer.wheelTimer);
    layer.wheelTimer = setTimeout(() => {
      if (live) save(live);
      live = null;
    }, 250);
  }, { passive: false });
  layer.addEventListener("keydown", (e) => {
    const p = live || saved();
    const step = e.shiftKey ? 0.08 : 0.02;
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (move) live = cleanPlace({ ...p, x: p.x + move[0], y: p.y + move[1] });
    else if (e.key === "+" || e.key === "=") live = cleanPlace({ ...p, scale: p.scale * 1.08 });
    else if (e.key === "-" || e.key === "_") live = cleanPlace({ ...p, scale: p.scale / 1.08 });
    else if (e.key === "0") return (e.preventDefault(), reset());
    else if (e.key === "Enter" || e.key === "Escape") return (e.preventDefault(), e.stopPropagation(), stop());
    else return;
    e.preventDefault();
    applyPlace();
    clearTimeout(layer.keyTimer);
    layer.keyTimer = setTimeout(() => {
      if (live) save(live);
      live = null;
    }, 300);
  });
}

export function startMoving() {
  if (!layer) build();
  layer.hidden = false;
  voiceMode.classList.add("placing");
  document.getElementById("voice-place")?.setAttribute("aria-pressed", "true");
  layer.focus({ preventScroll: true });
  announce(t("Move the robot: drag it, or use the arrow keys. Press Enter when you are done."));
}

export function stop() {
  if (!layer || layer.hidden) return;
  if (live) save(live);
  live = null;
  layer.hidden = true;
  voiceMode.classList.remove("placing");
  document.getElementById("voice-place")?.setAttribute("aria-pressed", "false");
  document.getElementById("voice-end")?.focus?.({ preventScroll: true });
}

export const isMoving = () => Boolean(layer && !layer.hidden);

// The buttons for it: in the top bar, and in the scene pop-up
const place = document.getElementById("voice-place");
place?.addEventListener("click", () => (isMoving() ? stop() : startMoving()));
document.getElementById("voice-scene-move")?.addEventListener("click", () => {
  document.getElementById("voice-scene")?.click();
  startMoving();
});
document.getElementById("voice-scene-reset")?.addEventListener("click", () => reset());

// Leaving voice mode ends it
new MutationObserver(() => voiceMode.hidden && stop()).observe(voiceMode, { attributes: true, attributeFilter: ["hidden"] });
applyPlace();
