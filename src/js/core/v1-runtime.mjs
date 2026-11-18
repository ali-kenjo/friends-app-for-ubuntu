// ---------- Unified v1.0 Studio Runtime Coordinator (core/v1-runtime.mjs) ----------
// Connects the 3D Engine (shader pipeline, lighting presets, unifiedRoom, gizmos),
// Behavior Engine (A* pathfinding, IK sockets, quotas, choreography),
// Voice Dock / Clean Stage / Studio Drawer UI, and Room-Context Bridge.
import { bus, EVENTS } from "./event-bus.mjs";
import { appState } from "./state-store.mjs";
import { attachLiveContextSocket, detachLiveContextSocket, initRoomContextBridge } from "./ai/room-context-bridge.mjs";
import { EMOTION_AMBIENT_TINTS } from "./world/lighting-presets.mjs";
import { unifiedRoom } from "./world/unified-room-manager.mjs";
import { roomGizmos } from "./world/gizmos.mjs";
import { navMesh } from "./robot/pathfinding.mjs";
import { ikSockets } from "./robot/ik-sockets.mjs";
import { behaviorEngine } from "./robot/behavior-engine.mjs";
import { getSettings, onSettings } from "../store.js";

let initialized = false;
let attachedEngine = null;

export function attachV1Engine(engine) {
  if (!engine || attachedEngine === engine) return;
  attachedEngine = engine;
  // 1.1: the room's things are drawn by RoomRenderer from the room document; the v1 manager keeps only its
  // state for the behaviour engine (it is no longer added to the scene, so no place shows v1 props twice)
  roomGizmos.init(engine.camera, engine.canvas, engine.stage.scene);

  const s = getSettings();
  const savedAssets = s?.roomEditor?.assets;
  if (Array.isArray(savedAssets) && savedAssets.length > 0) {
    appState.set("roomAssets", savedAssets);
    appState.set("roomMeta", { presetId: s.roomEditor.presetId || "creator_studio_desk" });
    unifiedRoom.syncFromState();
  } else {
    unifiedRoom.loadPreset(s?.roomEditor?.presetId || "creator_studio_desk");
  }

  applyVisualSettings(s);
}

function applyVisualSettings(s) {
  if (!attachedEngine || !s) return;
  // (the robot's shading is the engine's own now: robot/robot-style.js)
  setEmotionTint(appState.get("behavior")?.emotion || "calm", attachedEngine.look?.roomDoc?.atmosphere?.emotionTint !== false);
}

// The robot's feeling tints the room's bounce light a little (the moods own every other light now)
function setEmotionTint(emotion, on = true) {
  const tint = EMOTION_AMBIENT_TINTS[emotion];
  attachedEngine?.stage?.setEmotionTint?.(on && tint ? tint : null);
}

export function stepV1Frame(engine, pose, dt, time) {
  if (!engine) return;
  const assets = appState.get("roomAssets") || [];
  behaviorEngine.tick(dt, assets);

  // 1.1: where the robot is belongs to the room's behaviour engine (room/behaviour.mjs, engine.stepBehaviour);
  // the v1 engine's own position is no longer applied to the robot (it goes in step 8)

  // Smoothly apply active IK arm reach + weighted head gaze
  ikSockets.applyPostPose(engine.robot, dt);
  unifiedRoom.update(dt, time);
}

export function dispatchChoreography(choreography) {
  const assets = appState.get("roomAssets") || [];
  return behaviorEngine.handleChoreographyTool(choreography, assets);
}

export function initV1Runtime() {
  if (initialized) return;
  initialized = true;

  initRoomContextBridge();

  // Bind step actions from BehaviorEngine to 3D unified assets + hand sockets
  behaviorEngine.onStepAction = ({ assetId, action, payload }) => {
    unifiedRoom.triggerAssetAction(assetId, action, payload);
    const nodes = attachedEngine?.robot?.nodes;
    if (!nodes) return;
    ikSockets.dropAll(nodes);
    if (action === "explain") ikSockets.attachToHand(nodes, "right", "marker");
    else if (action === "note") ikSockets.attachToHand(nodes, "right", "pen");
    else if (action === "water") ikSockets.attachToHand(nodes, "right", "watering_can");
    else if (assetId.includes("gaming_console")) ikSockets.attachToHand(nodes, "right", "controller");
    else if (assetId.includes("rubiks_cube")) ikSockets.attachToHand(nodes, "right", "cube");
  };

  bus.on(EVENTS.BEHAVIOR_STATE, ({ state }) => {
    if (state === "IDLE_HOME" || state === "MOVING_TO_ASSET") {
      if (attachedEngine?.robot?.nodes) ikSockets.dropAll(attachedEngine.robot.nodes);
    }
  });

  bus.on(EVENTS.SHADER_CHANGED, () => applyVisualSettings(getSettings()));
  bus.on(EVENTS.LIGHTING_CHANGED, () => applyVisualSettings(getSettings()));
  bus.on(EVENTS.ROBOT_EMOTION, ({ emotion }) => {
    // The room's own "Tint with the robot's feelings" (Settings → Robot → Room; the Room Editor's Light and mood)
    if (attachedEngine) setEmotionTint(emotion, attachedEngine.look?.roomDoc?.atmosphere?.emotionTint !== false);
  });

  // Global Room Undo/Redo + Voice speech interrupts
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey && appState.get("studioOpen")) {
      e.preventDefault();
      appState.undo.undo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) && appState.get("studioOpen")) {
      e.preventDefault();
      appState.undo.redo();
    }
  });

  document.addEventListener("friends:choreography", (e) => {
    if (e.detail?.choreography) dispatchChoreography(e.detail.choreography);
  });

  document.addEventListener("friends:robot-emotion", (e) => {
    const emotion = e.detail?.emotion;
    if (!emotion) return;
    appState.set("behavior", { emotion });
    bus.emit(EVENTS.ROBOT_EMOTION, { emotion });
  });

  document.addEventListener("friends:live-ws-open", (e) => {
    attachLiveContextSocket(e.detail?.send);
  });

  document.addEventListener("friends:live-ws-close", () => {
    detachLiveContextSocket();
  });

  document.addEventListener("friends:user-speech", (e) => {
    if (e.detail?.active) behaviorEngine.onUserSpeechStart?.();
    else behaviorEngine.onUserSpeechEnd?.();
  });

  // Keep reactive settings synchronized
  onSettings((s) => {
    if (!s) return;
    if (s.behaviorEngine) {
      behaviorEngine.configure(s.behaviorEngine);
      unifiedRoom.setFoleyVolume(s.behaviorEngine.foley?.volume ?? 65);
      unifiedRoom.rebuildDebugOverlays(navMesh, s.behaviorEngine.waypointRoute);
    }
    applyVisualSettings(s);
  });
}
