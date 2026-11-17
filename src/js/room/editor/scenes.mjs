// ---------- Scenes in the Room Editor ----------
// Pure. A scene ("Work", "Chill", "Filming") overrides what shows, which lamps are on and the mood; it is
// switched by hand, on a schedule or while filming (model.mjs cleans it, schedule.mjs applies it).
// An override equal to the room's own value is dropped, so a scene only holds what it changes.
import { newId } from "../model.mjs";

const emptyOverrides = () => ({ hidden: {}, colors: {}, lights: {}, mood: null, home: null, rules: {}, posture: null });
const withScene = (room, id, fn) => ({ ...room, scenes: room.scenes.map((s) => (s.id === id ? fn(s) : s)) });

export function addScene(room, name) {
  const id = newId("scene", new Set(room.scenes.map((s) => s.id)));
  return { room: { ...room, scenes: [...room.scenes, { id, name, overrides: emptyOverrides(), when: { kind: "manual", from: "", to: "", weekdays: [] } }] }, id };
}

export function updateScene(room, id, patch) {
  return withScene(room, id, (s) => ({ ...s, ...patch, when: patch.when ? { ...s.when, ...patch.when } : s.when }));
}

// A removed scene also stops being the one that's on
export function removeScene(room, id) {
  return { ...room, scenes: room.scenes.filter((s) => s.id !== id), activeScene: room.activeScene === id ? "auto" : room.activeScene };
}

// Shown or hidden in this scene
export function setShown(room, sceneId, assetId, shown) {
  const base = room.assets.find((a) => a.id === assetId);
  if (!base) return room;
  return withScene(room, sceneId, (s) => {
    const hidden = { ...s.overrides.hidden };
    if (!shown === Boolean(base.hidden)) delete hidden[assetId];
    else hidden[assetId] = !shown;
    return { ...s, overrides: { ...s.overrides, hidden } };
  });
}

// A lamp on or off in this scene
export function setLamp(room, sceneId, assetId, on) {
  const base = room.assets.find((a) => a.id === assetId);
  if (!base) return room;
  return withScene(room, sceneId, (s) => {
    const lights = { ...s.overrides.lights };
    if (on === (base.state?.on !== false) && base.light?.auto !== "dusk") delete lights[assetId];
    else lights[assetId] = { on, intensity: lights[assetId]?.intensity ?? 1 };
    return { ...s, overrides: { ...s.overrides, lights } };
  });
}

export function setMood(room, sceneId, mood) {
  return withScene(room, sceneId, (s) => ({ ...s, overrides: { ...s.overrides, mood: mood && mood !== room.atmosphere.mood ? mood : null } }));
}

// What a scene shows for a thing: { shown, on } (on is null for things that aren't lamps)
export function sceneView(room, scene, asset) {
  const o = scene.overrides;
  const shown = asset.id in o.hidden ? !o.hidden[asset.id] : !asset.hidden;
  const lamp = asset.state && "on" in asset.state;
  const on = lamp ? (o.lights[asset.id] ? o.lights[asset.id].on : asset.state.on !== false) : null;
  return { shown, on };
}

// How many things a scene changes (for its summary)
export function changeCount(scene) {
  const o = scene.overrides;
  return Object.keys(o.hidden).length + Object.keys(o.lights).length + Object.keys(o.colors).length + (o.mood ? 1 : 0);
}
