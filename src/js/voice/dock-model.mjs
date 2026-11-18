// ---------- Voice mode's toolbar (the "voice dock"): what's on it and what each action lists ----------
// Pure: the helper cleans the saved layout with it (settings.voiceDock, kept from 1.0), the page builds the
// toolbar and its menus from it (voice/dock.js). Every action goes through the 1.1 room system: the robot's
// behaviour engine (home, spots, things, routes), the room's camera shots, scenes and backdrop, and the
// permission model (rules.mjs canDo).
import { entryFor } from "../room/catalog.mjs";
import { canDo } from "../room/rules.mjs";
import { displayName } from "../room/model.mjs";
import { usableShots, shotPresets } from "../room/cameras.mjs";
import { effectiveRoom } from "../room/schedule.mjs";
import { unreachable } from "../room/nav.mjs";

// id (as saved since 1.0), icon (icons.js), the label, and whether it is about the robot (shown with the Robot
// look only). 1.0's "VAD / PTT" and "Vision" switches changed nothing and are gone (DECISIONS R48).
export const DOCK_MODULES = [
  { id: "mic_mute", icon: "mic", label: "Microphone" },
  { id: "interrupt", icon: "hand", label: "Stop talking" },
  { id: "summon_home", icon: "home", label: "Go home", robot: true },
  { id: "go_spot", icon: "target", label: "Go to…", robot: true, menu: true },
  { id: "emotion_picker", icon: "smile", label: "Mood", robot: true, menu: true },
  { id: "quick_prop", icon: "cube", label: "Use a thing", robot: true, menu: true },
  { id: "toggle_whiteboard", icon: "whiteboard", label: "Whiteboard" },
  { id: "camera_preset", icon: "video", label: "Camera", robot: true, menu: true },
  { id: "scene", icon: "sparkles", label: "Scene", robot: true, menu: true },
  { id: "roam_toggle", icon: "repeat", label: "Roam the room", robot: true },
  { id: "clean_stage", icon: "tv", label: "Clean stage" },
  { id: "edit_room", icon: "couch", label: "Edit the room", robot: true },
  { id: "open_studio", icon: "robot", label: "Robot Studio", robot: true },
];
export const MODULE_IDS = DOCK_MODULES.map((m) => m.id);
const GONE = new Set(["mic_mode", "vision_toggle"]);

const all = (on) => Object.fromEntries(MODULE_IDS.map((id) => [id, on]));
export const DOCK_PRESETS = {
  minimal: { label: "Minimal", showLabels: false, visible: { ...all(false), mic_mute: true, interrupt: true, clean_stage: true, open_studio: true } },
  creator_stage: { label: "Creator stage", showLabels: false, visible: { ...all(true), go_spot: false, scene: false } },
  full_control: { label: "Everything", showLabels: true, visible: all(true) },
};
export const POSITIONS = ["bottom", "left", "right", "floating"];

// Keys voice mode already uses (M mutes, F films, Escape ends) can't be a toolbar shortcut
export const RESERVED_KEYS = new Set(["KeyM", "KeyF", "Escape", "Space"]);
export const validKey = (code) => typeof code === "string" && /^(Key[A-Z]|Digit[0-9])$/.test(code) && !RESERVED_KEYS.has(code);
export const DEFAULT_SHORTCUTS = { summon_home: "KeyR", clean_stage: "KeyH", toggle_whiteboard: "KeyB", roam_toggle: "KeyP" };

export const DOCK_DEFAULTS = {
  preset: "creator_stage",
  position: "left", // a rail beside the robot (at the bottom it covers the robot)
  floatingX: 24,
  floatingY: 24,
  showLabels: false,
  order: [...MODULE_IDS],
  visible: { ...DOCK_PRESETS.creator_stage.visible },
  shortcuts: { ...DEFAULT_SHORTCUTS },
};

// A saved layout (any version) → one with every module once, in order, and only valid keys (each key once)
export function sanitizeDock(input) {
  const d = input && typeof input === "object" ? input : {};
  const preset = ["minimal", "creator_stage", "full_control", "custom"].includes(d.preset) ? d.preset : DOCK_DEFAULTS.preset;
  const base = DOCK_PRESETS[preset]?.visible || DOCK_DEFAULTS.visible;
  const order = [...new Set((Array.isArray(d.order) ? d.order : []).map(String).filter((id) => MODULE_IDS.includes(id)))];
  // Modules new since the layout was saved go where they belong among the others
  // (right after the one before it in the usual order)
  MODULE_IDS.forEach((id, k) => {
    if (order.includes(id)) return;
    const before = MODULE_IDS.slice(0, k).reverse().find((x) => order.includes(x));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  });
  const visible = {};
  for (const id of MODULE_IDS) visible[id] = typeof d.visible?.[id] === "boolean" ? d.visible[id] : base[id];
  const shortcuts = {};
  const used = new Set();
  const given = d.shortcuts && typeof d.shortcuts === "object" ? d.shortcuts : DEFAULT_SHORTCUTS;
  for (const id of MODULE_IDS) {
    const code = id in given ? given[id] : DEFAULT_SHORTCUTS[id];
    if (validKey(code) && !used.has(code)) {
      shortcuts[id] = code;
      used.add(code);
    } else shortcuts[id] = "";
  }
  const num = (v, fb) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(4000, Math.round(Number(v)))) : fb);
  return {
    preset,
    position: POSITIONS.includes(d.position) ? d.position : DOCK_DEFAULTS.position,
    floatingX: num(d.floatingX, 24),
    floatingY: num(d.floatingY, 24),
    showLabels: typeof d.showLabels === "boolean" ? d.showLabels : DOCK_PRESETS[preset]?.showLabels ?? false,
    order,
    visible,
    shortcuts,
  };
}

// A preset chosen: its modules and labels (the order and keys stay yours)
export function applyPreset(dock, presetId) {
  const p = DOCK_PRESETS[presetId];
  if (!p) return sanitizeDock(dock);
  return sanitizeDock({ ...dock, preset: presetId, showLabels: p.showLabels, visible: { ...p.visible } });
}

// One module moved one place earlier (-1) or later (+1); the layout becomes "custom"
export function moveModule(dock, id, step) {
  const order = [...dock.order];
  const i = order.indexOf(id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= order.length) return dock;
  [order[i], order[j]] = [order[j], order[i]];
  return { ...dock, order, preset: "custom" };
}

// Which module a key press runs (null: none)
export function moduleForKey(dock, code) {
  if (!validKey(code)) return null;
  return MODULE_IDS.find((id) => dock.shortcuts[id] === code && dock.visible[id] !== false) || null;
}

export const wasRemoved = (id) => GONE.has(id);

// ---------- What each menu lists ----------
// Moods to show (all are robot moods: presets.mjs MOODS); labels are the robot's own mood names
export const DOCK_MOODS = [
  ["happy", "Happy"], ["excited", "Excited"], ["curious", "Curious"], ["thinking", "Thinking"], ["playful", "Playful"],
  ["proud", "Proud"], ["surprised", "Surprised"], ["sleepy", "Sleepy"], ["sad", "Sad"], ["love", "In love"],
];

// What it does with a thing when you pick it from the toolbar: the first of these the thing has
const USE_ORDER = ["play", "use", "touch", "water", "read", "write", "sit", "lean", "rest", "look"];

// The things it can use now: shown (not hidden by a scene or a schedule), with an action the thing has, and
// allowed when you ask (a thing set to Never, or look-only, isn't offered), and one it can get to from home
export function propItems(room, { ai, filming = false, privateMode = false, now } = {}) {
  if (!room) return [];
  const eff = effectiveRoom(room, { now, filming });
  const blocked = new Set(unreachable(eff.room).filter((x) => x.kind === "asset").map((x) => x.id));
  const out = [];
  for (const a of eff.room.assets) {
    if (eff.hidden.has(a.id) || a.hidden || blocked.has(a.id)) continue;
    const def = entryFor(a.type);
    if (!def) continue;
    const action = USE_ORDER.find((x) => def.actions?.includes(x) && canDo(room, "ai", a.id, x, { ai, filming, privateMode, now }).ok);
    if (!action || action === "look") continue;
    out.push({ id: a.id, action, name: a.name || def.label, custom: Boolean(a.name), kind: def.category });
  }
  return out.slice(0, 40);
}

// Where it can go: home and the room's spots it can get to
export function spotItems(room) {
  if (!room) return [];
  const blocked = new Set(unreachable(room).filter((x) => x.kind === "spot").map((x) => x.id));
  return [{ kind: "home", id: "home", name: "Home" }, ...room.robot.spots.filter((s) => !blocked.has(s.id)).map((s) => ({ kind: "spot", id: s.id, name: s.name, custom: true }))];
}

// Camera: the robot's own framing, the room's saved shots, then ready-made ones (added to the room when picked)
export function cameraItems(room, say) {
  if (!room) return [];
  const saved = usableShots(room).map((c) => ({ id: c.id, name: c.name || "", custom: true, saved: true }));
  const names = new Set(saved.map((c) => c.name));
  const ready = shotPresets(room, say).filter((p) => !names.has(p.name)).map((p) => ({ id: `preset:${p.key}`, name: p.name, preset: p }));
  return [{ id: "auto", name: "Frames the robot" }, ...saved, ...ready];
}

// A ready-made shot picked: it joins the room's shots and becomes the one voice mode uses
export function withPresetShot(room, preset, newId) {
  const { key, ...shot } = preset;
  void key;
  const id = newId("shot", new Set(room.cameras.map((c) => c.id)));
  return { ...room, cameras: [...room.cameras, { id, ...shot }], defaultCamera: id };
}

// Scenes: automatic (by schedule and mode) or one chosen
export function sceneItems(room) {
  if (!room) return [];
  return [{ id: "auto", name: "Automatic" }, ...room.scenes.map((s) => ({ id: s.id, name: s.name, custom: true }))];
}

// 1.0's stage settings (settings.stageMode, the v1 drawer) → the room's backdrop layer and camera, once.
// Returns the changed room, or null when there's nothing to carry over.
const LAYER_OF = { solid_studio: "solid", chroma_green: "chroma_green", chroma_blue: "chroma_blue", transparent_window: "transparent" };
export function stageIntoRoom(room, stage, say, newId) {
  if (!room || !stage) return null;
  let next = room;
  const layer = LAYER_OF[stage.backdrop];
  if (layer && room.backdrop?.layer === "full") {
    next = { ...next, backdrop: { ...next.backdrop, layer, ...(layer === "solid" && /^#[0-9a-f]{6}$/i.test(stage.solidColor || "") ? { color: stage.solidColor.toLowerCase() } : {}) } };
  }
  // The fixed 1.0 views were made for its desk room; the room's own shots stand in for them
  if (stage.cameraPreset && stage.cameraPreset !== "wide_room" && (next.defaultCamera || "auto") === "auto") {
    const presets = shotPresets(next, say);
    const pick =
      stage.cameraPreset === "follow_robot" ? presets.find((p) => p.key === "eye")
      : stage.cameraPreset === "cinema_orbit" ? presets.find((p) => p.key === "auto")
      : presets.find((p) => p.key.startsWith("at-")) || null;
    if (pick) next = withPresetShot(next, pick, newId);
  }
  return next === room ? null : next;
}

export const activeOf = (room, kind) => (kind === "camera" ? room?.defaultCamera || "auto" : kind === "scene" ? room?.activeScene || "auto" : null);

export const thingName = (room, id) => {
  const a = room?.assets.find((x) => x.id === id);
  return a ? a.name || displayName(a) : "";
};

// Words used above that the page translates (for the i18n scanner)
export function labels() {
  return [
    ...DOCK_MODULES.map((m) => m.label), ...Object.values(DOCK_PRESETS).map((p) => p.label), ...DOCK_MOODS.map(([, l]) => l),
    "Home", "Frames the robot", "Automatic",
  ];
}
