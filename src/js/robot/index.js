// ---------- The robot, for the rest of the app ----------
// One robot character, shared by voice mode, the chat dock and the settings
// preview. Voice mode and the chat tell `robot.director` what happens; places
// that show the robot register as hosts. The 3D engine (three.js) loads the
// first time a host is shown; without WebGL the robot is just unavailable
// and the rest of the app carries on.
import { Animator } from "./animator.mjs";
import { Director } from "./director.mjs";
import { FaceTracker } from "./facetrack.js";
import { robotSound } from "./sound.js";
import { getSettings, onSettings, updateSettings } from "../store.js";
import { onHello, onServerEvent } from "../events.js";
import { personalTexture } from "../room/personal.js";
import { loadCustomModels } from "../room/custom.js";
import { canDo } from "../room/rules.mjs";
import { standPoint } from "../room/nav.mjs";

export const animator = new Animator();
animator.onSound = (kind, sub) => {
  // In a quiet zone of its room it makes no sounds
  if (engine?.quiet) return;
  // (the sound module plays by kind: blip, hum, servo, giggle, sigh, chime…)
  void sub;
  robotSound.play(kind || "blip");
};
animator.onUseProp = (info) => {
  if (!info?.prop) return;
  engine?.triggerProp(info.prop, info.action);
};

async function smartMood(text, heard) {
  if (!getSettings()?.robot?.smartMoods) return null;
  try {
    const res = await fetch("/api/robot/mood", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: String(text).slice(0, 2000), heard: String(heard || "").slice(0, 600) }) });
    return res.ok ? (await res.json()).mood || null : null;
  } catch {
    return null;
  }
}

export const director = new Director(animator, {
  smartMood,
  onToolEvent: (ev) => {
    if (typeof document === "undefined" || !ev) return;
    if (ev.emotion || ev.mood) tintFor(ev.emotion || ev.mood);
    if (ev.room) roomCommand(ev.room);
    if (ev.roomChanged) roomChangedByAI(ev.roomChanged);
    // A rearrangement waiting for your yes: shown (not saved) until you decide
    if (ev.roomPreview?.room) engine?.setLook({ roomDoc: ev.roomPreview.room });
    else if (ev.roomPreview?.end && roomDoc) engine?.setLook({ roomDoc });
    // Writing on the real whiteboard: with a whiteboard in its room that it may write on, it goes there
    if (ev.gesture === "board_write" || ev.gesture === "board_erase" || ev.lookAt?.target === "board") goToBoard();
  },
});

// The robot's feeling tints the room's bounce light a little, when the room's "Tint with the robot's feelings"
// is on (the room's mood owns every other light)
const TINTS = { happy: "#ffd57a", curious: "#67e8f9", thinking: "#a78bfa", excited: "#fb7185", calm: "#86efac", playful: "#f472b6", proud: "#fbbf24", surprised: "#38bdf8" };
function tintFor(mood) {
  const on = roomDoc?.atmosphere?.emotionTint !== false;
  engine?.stage?.setEmotionTint?.(on && TINTS[mood] ? TINTS[mood] : null);
}

// The AI's robot tools (checked by the helper against the room): its behaviour engine carries them out
function roomCommand(cmd) {
  // Words for a sign: on the sign at once (saved), while the robot goes to it
  if (cmd.kind === "asset" && cmd.text && roomDoc) {
    const a = roomDoc.assets.find((x) => x.id === cmd.id);
    if (a && a.state && "text" in a.state) setRoom({ ...roomDoc, assets: roomDoc.assets.map((x) => (x.id === a.id ? { ...x, state: { ...x.state, text: cmd.text } } : x)) });
  }
  const res = engine?.behaviour.command(cmd);
  if (res && !res.ok && res.text) director.a.lookAt({ target: "user", duration: 2 });
}

let boardTrip = 0;
function goToBoard() {
  const b = engine?.behaviour;
  if (!b?.room || !roomDoc || performance.now() - boardTrip < 4000) return;
  const board = roomDoc.assets.find((a) => !a.hidden && (a.type === "whiteboard" || a.type === "chalkboard"));
  if (!board || b.task?.asset === board.id) return;
  if (!canDo(roomDoc, "ai", board.id, "write", { ai: getSettings()?.robot?.ai }).ok) return;
  boardTrip = performance.now();
  // (at the board already: it stays and keeps writing)
  const at = standPoint(roomDoc, board);
  if (Math.hypot(b.pos[0] - at[0], b.pos[1] - at[1]) < 0.3) return;
  b.command({ kind: "asset", id: board.id, action: "look", actor: "ai" });
}

// The AI rearranged the room (room_edit): it's loaded again, and you can take it back
async function roomChangedByAI({ id, done = [] } = {}) {
  const before = roomDoc && roomDoc.id === id ? JSON.parse(JSON.stringify(roomDoc)) : null;
  await loadRoom(id);
  document.dispatchEvent(new CustomEvent("friends:robot-room-edited", { detail: { id, done, undo: before ? () => setRoom(before) : null } }));
}

let engine = null;
let loading = null;
let unavailable = ""; // why the 3D robot can't be shown, once that's known
const hosts = new Map(); // name → { el, options, visible }
const filming = { on: false, cameraFriendly: true, largerFace: false };
let modelInfo = { custom: false };

// ---------- The room (a document in the rooms store, src/js/room/model.mjs) ----------
// settings.robot.room is { layoutId }; the document itself is loaded from the helper, kept here, and
// handed to the engine. The Room Editor and the AI's room tools change it through setRoom().
let roomDoc = null;
let roomWanted = "";
async function loadRoom(id) {
  roomWanted = id;
  try {
    // Your own models first, so a room with them draws them at once
    await loadCustomModels();
    const res = await fetch(`/api/rooms/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`room ${res.status}`);
    const doc = await res.json();
    if (roomWanted !== id) return;
    roomDoc = doc;
    engine?.setLook({ roomDoc });
    notify("room", { room: roomDoc });
  } catch (err) {
    console.warn("The room couldn't be loaded:", err.message);
  }
}

// A model added, changed or removed: the room is drawn again with the new list
document.addEventListener("friends:room-custom", () => roomDoc && engine?.setLook({ roomDoc }));

// A changed room: shown at once, saved a moment later (one write for a burst of changes)
let roomSaveTimer = 0;
export function setRoom(doc, { save = true } = {}) {
  roomDoc = doc;
  engine?.setLook({ roomDoc });
  notify("room", { room: roomDoc });
  if (!save || !doc?.id) return;
  clearTimeout(roomSaveTimer);
  roomSaveTimer = setTimeout(() => {
    fetch(`/api/rooms/${encodeURIComponent(doc.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(doc) })
      .then((r) => (r.ok ? r.json() : null))
      .then((saved) => saved && notify("room-saved", { room: saved }))
      .catch(() => {});
  }, 600);
}

export function webglSupported() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function notify(name, detail) {
  document.dispatchEvent(new CustomEvent(`friends:robot-${name}`, { detail }));
}

// The engine, loaded once. Rejects (and stays unavailable) without WebGL.
export function loadEngine() {
  if (engine) return Promise.resolve(engine);
  if (!unavailable && !loading && !webglSupported()) {
    // Decided at once, so everyone asking gets the same answer
    unavailable = "WebGL isn't available in this browser.";
    notify("unavailable", { reason: unavailable });
  }
  if (unavailable) return Promise.reject(new Error(unavailable));
  loading ||= (async () => {
    const { RobotEngine } = await import("./engine.js");
    const e = new RobotEngine({
      animator,
      hooks: {
        beforeUpdate: (dt) => director.frame(dt),
        onTouch: (zone) => {
          if (engine?.quiet) return;
          robotSound.play(zone === "head" || zone === "cheek" ? "giggle" : "blip");
        },
        onPropUsed: (res) => {
          // A thing that was switched (a lamp on or off) is saved with the room
          if (res?.changed && roomDoc) setRoom(roomDoc);
          const id = res?.changed?.type || res?.propId || "";
          if (id === "radio" || id === "record_player") robotSound.toggleAmbience("music");
          else if (id === "fireplace" || id === "fire_pit" || id === "wood_stove") robotSound.toggleAmbience("fireplace");
          else if (engine?.quiet) return;
          else if (id === "plant" || id.includes("plant") || id.includes("fern")) robotSound.play("water");
          else robotSound.play("blip");
        },
      },
    });
    engine = e;
    e.setPower(power);
    e.personalSource = personalTexture;
    e.setLook({ recording });
    applySettings(getSettings());
    for (const [name, h] of hosts) {
      e.attach(name, h.el, h.options);
      e.setVisible(name, h.visible);
    }
    if (modelInfo.custom) useModel(modelInfo).catch(() => {});
    if (backgroundInfo.custom) e.useBackground(backgroundInfo).catch(() => {});
    notify("ready", {});
    return e;
  })().catch((err) => {
    unavailable = err.message || "The 3D robot couldn't start.";
    loading = null;
    console.warn("Robot unavailable:", err);
    notify("unavailable", { reason: unavailable });
    throw err;
  });
  return loading;
}

// ---------- Settings → the robot's looks ----------
function themeBackground() {
  const css = getComputedStyle(document.documentElement);
  return css.getPropertyValue("--bg-main").trim() || "#131314";
}

function applySettings(s) {
  if (!s) return;
  const r = s.robot;
  const d = r.design;
  animator.setOptions({ mouth: d.face.mouth !== "none" });
  animator.setSeat(r.seat);
  animator.setBehaviors(d.behaviors);
  animator.setFaceConfig(d.face);
  director.setReactions(r.reactions);
  // The settings' sound switches, as the sound engine names them (and its volume is 0 to 1, the settings' 0 to 100)
  robotSound.configure({
    enabled: r.sound.enabled,
    volume: r.sound.volume / 100,
    pitch: r.sound.pitch,
    recordMix: r.sound.recordMix,
    categories: { blips: r.sound.blips, servos: r.sound.servos, hums: r.sound.ambience, ambience: r.sound.ambience, giggles: r.sound.emotes, sighs: r.sound.emotes, chimes: r.sound.emotes, whiteboard: s.whiteboard?.sound !== false },
  });
  // The 2D faces (chat avatars) match the robot: its shell, its light and its eyes
  const root = document.documentElement;
  const light = d.colors.light || s.theme.accent;
  root.style.setProperty("--robot-shell", d.colors.head);
  root.style.setProperty("--robot-light", light);
  root.style.setProperty("--robot-face", d.colors.face || light);
  root.dataset.robotEyes = d.face.eyes;
  root.dataset.robotMouth = d.face.mouth === "none" ? "off" : "on";
  const layoutId = r.room?.layoutId || "";
  if (layoutId && layoutId !== roomDoc?.id && layoutId !== roomWanted) loadRoom(layoutId);
  if (!engine) return;
  if (engine.rooms) {
    engine.rooms.weatherState = !s.privateMode && (roomDoc?.atmosphere?.weatherSync ?? r.room?.weatherSync) ? (window.__friendsWeatherState || "") : "";
  }
  engine.setLook({
    design: d,
    accent: s.theme.accent,
    ...(layoutId ? { roomDoc: roomDoc?.id === layoutId ? roomDoc : null } : { room: r.room, roomDoc: null }),
    shot: r.shot,
    position: r.position,
    // Settings → Robot → Graphics → The robot's shading (1.0's shader theme)
    robotStyle: s.visualStyle?.shaderTheme === "anime_cel" ? "cel" : "soft",
    cinematic: r.cinematic,
    roam: r.roam !== false,
    world: r.world !== false,
    eyesFollowCursor: r.eyesFollowCursor !== false,
    interactive: r.interactive !== false,
    cameraFriendly: filming.on && filming.cameraFriendly,
    largerFace: filming.on && filming.largerFace,
    filming: filming.on,
    // Things that show your own things: blank while filming or recording unless Settings → Robot → Privacy allows
    personalInFilming: s.robot.privacy?.personalInFilming === true,
    theme: { bg: themeBackground(), glow: document.documentElement.dataset.theme === "light" ? 0.06 : 0.08 },
  });
  const gk = JSON.stringify(r.graphics || {});
  if (gk !== graphicsKey) {
    graphicsKey = gk;
    engine.setGraphics(r.graphics);
  }
  if (engine.look.quality !== r.quality) engine.setQuality(r.quality);
}
let graphicsKey = "";
let recording = false;
document.addEventListener("friends:recording", (e) => {
  recording = e.detail?.on === true;
  engine?.setLook({ recording });
});

// ---------- The battery saver, and a window that isn't in front (Settings → Robot → Graphics) ----------
// On battery: the desktop app says (Electron powerMonitor, through the helper); in a browser, the Battery API.
const power = { onBattery: false, focused: document.hasFocus() };
let desktopPower = false;
function setPower(change) {
  Object.assign(power, change);
  engine?.setPower(power);
}
onHello((hello) => {
  if (!hello?.power) return;
  desktopPower = true;
  setPower({ onBattery: hello.power.onBattery === true });
});
onServerEvent("power", (p) => {
  desktopPower = true;
  setPower({ onBattery: p?.onBattery === true });
});
navigator.getBattery?.()
  .then((battery) => {
    const read = () => !desktopPower && setPower({ onBattery: !battery.charging });
    read();
    battery.addEventListener("chargingchange", read);
  })
  .catch(() => {});
window.addEventListener("focus", () => setPower({ focused: true }));
window.addEventListener("blur", () => setPower({ focused: false }));

onSettings(applySettings);

// ---------- "Follow my face" ----------
// The camera is on only while the setting is on, a robot is showing and the
// tab is visible; otherwise it's let go (and its light goes off).
const tracker = new FaceTracker({
  onFace: (face) => animator.setFace(face),
  onStatus: (status) => {
    faceStatus = status;
    notify("face", status);
  },
});
let faceStatus = { state: "off", message: "" };
let faceBlocked = false; // a failure waits for the setting to be switched again

function syncFace() {
  const s = getSettings();
  const wanted = Boolean(s?.robot?.followFace) && [...hosts.values()].some((h) => h.visible) && !document.hidden;
  if (wanted && !tracker.running && !faceBlocked) {
    tracker.start().then(() => {
      if (["blocked", "busy", "none", "error"].includes(faceStatus.state)) faceBlocked = true;
    });
  } else if (!wanted && tracker.running) {
    tracker.stop();
  }
}

let followFace = false;
onSettings((s) => {
  if (s.robot.followFace !== followFace) {
    followFace = s.robot.followFace;
    faceBlocked = false;
    if (!followFace) {
      tracker.stop();
      faceStatus = { state: "off", message: "" };
      notify("face", faceStatus);
    }
  }
  syncFace();
});
document.addEventListener("visibilitychange", syncFace);
// The theme can change without the settings changing ("System" follows the desktop)
new MutationObserver(() => applySettings(getSettings())).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

async function useModel(info) {
  modelInfo = info || { custom: false };
  if (!engine) return null;
  try {
    const model = await engine.useModel(modelInfo);
    notify("model", { info: modelInfo, missing: model.missing || [], faceWithoutUv: Boolean(model.faceWithoutUv) });
    return model;
  } catch (err) {
    notify("model", { info: modelInfo, error: err.message });
    if (modelInfo.custom) await engine.useModel({ custom: false });
    throw err;
  }
}

// Your own picture behind the robot, if you uploaded one
fetch("/api/robot/background/info")
  .then((res) => (res.ok ? res.json() : { custom: false }))
  .then((info) => useBackground(info))
  .catch(() => {});

// Your own model, if you uploaded one
fetch("/api/robot/model/info")
  .then((res) => (res.ok ? res.json() : { custom: false }))
  .then((info) => {
    modelInfo = info;
    if (info.custom && engine) useModel(info).catch(() => {});
  })
  .catch(() => {});

// Your own picture behind the robot (room.place "photo"): information from /api/robot/background/info
let backgroundInfo = { custom: false };
async function useBackground(info) {
  backgroundInfo = info || { custom: false };
  if (engine) await engine.useBackground(backgroundInfo).catch(() => {});
  notify("background", { info: backgroundInfo });
}

// Event listeners for app-wide reactions (missions, reminders, notifications, tasks, streaks, hourly, return)
document.addEventListener("friends:robot-event", (e) => {
  const d = e.detail || {};
  if (d.type) director.reactEvent(d.type, d);
});

let hiddenSince = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    hiddenSince = Date.now();
  } else if (hiddenSince && Date.now() - hiddenSince > 180000) {
    hiddenSince = 0;
    director.reactEvent("user_return");
  }
});

export const robot = {
  director,
  animator,
  sound: robotSound,
  reactEvent: (type, detail = {}) => director.reactEvent(type, detail),
  get room() {
    return roomDoc;
  },
  setRoom,
  ready: () => loadEngine(),
  get engine() {
    return engine;
  },
  get unavailable() {
    return unavailable;
  },
  capturePhoto(options) {
    return engine?.capturePhoto(options) || "";
  },
  captureThumbnail(size) {
    return engine?.captureThumbnail(size) || "";
  },

  // A place that shows the robot. options: see RobotEngine.attach
  host(name, el, options = {}) {
    hosts.set(name, { el, options, visible: false });
    engine?.attach(name, el, options);
  },

  // A place that doesn't show the robot any more (the Room Editor closing)
  unhost(name) {
    hosts.delete(name);
    engine?.detach(name);
  },

  // Shown or not; the first host shown loads the engine
  show(name, visible = true) {
    const h = hosts.get(name);
    if (!h) return;
    h.visible = visible;
    if (visible && !engine && !unavailable) loadEngine().catch(() => {});
    engine?.setVisible(name, visible);
    syncFace();
  },

  get faceStatus() {
    return faceStatus;
  },

  options(name, options) {
    const h = hosts.get(name);
    if (!h) return;
    Object.assign(h.options, options);
    engine?.setHostOptions(name, options);
  },

  // Filming mode: the camera-friendly look, and bigger features if wanted
  setFilming(on, { cameraFriendly = true, largerFace = false } = {}) {
    Object.assign(filming, { on, cameraFriendly, largerFace });
    if (engine) engine.qualityLocked = on;
    applySettings(getSettings());
  },

  useModel,
  get modelInfo() {
    return modelInfo;
  },
  useBackground,
  get backgroundInfo() {
    return backgroundInfo;
  },
};

// For checking the robot by hand or in a test browser: open the app with ?robot-debug
if (new URLSearchParams(location.search).has("robot-debug")) Object.assign(window, { friendsRobot: robot, friendsSettings: { getSettings, updateSettings } });
// The asset lab for contact sheets (scripts/asset-sheet.js): loaded only with ?room-lab
if (new URLSearchParams(location.search).has("room-lab")) import("../room/render/lab.js").catch((e) => console.error(e));
