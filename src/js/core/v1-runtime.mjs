// ---------- Unified v1.0 Studio Runtime Coordinator (core/v1-runtime.mjs) ----------
// Connects the 3D Engine (shader pipeline, lighting presets, unifiedRoom, gizmos),
// Behavior Engine (A* pathfinding, IK sockets, quotas, choreography),
// Voice Dock / Clean Stage / Studio Drawer UI, and Room-Context Bridge.
import * as THREE from "three";
import { bus, EVENTS } from "./event-bus.mjs";
import { appState } from "./state-store.mjs";
import { attachLiveContextSocket, detachLiveContextSocket, initRoomContextBridge } from "./ai/room-context-bridge.mjs";
import { shaderPipeline } from "./world/shader-pipeline.mjs";
import { EMOTION_AMBIENT_TINTS } from "./world/lighting-presets.mjs";
import { unifiedRoom } from "./world/unified-room-manager.mjs";
import { roomGizmos } from "./world/gizmos.mjs";
import { navMesh } from "./robot/pathfinding.mjs";
import { ikSockets } from "./robot/ik-sockets.mjs";
import { behaviorEngine } from "./robot/behavior-engine.mjs";
import { voiceDock } from "../ui/voice-dock.js";
import { CAMERA_PRESET_VIEWS, cleanStage } from "../ui/clean-stage.js";
import { studioDrawer } from "../ui/studio-drawer.js";
import { getSettings, onSettings, updateSettings } from "../store.js";

let initialized = false;
let attachedEngine = null;
let currentCameraPreset = "wide_room";
const camPosTarget = new THREE.Vector3(0, 1.48, 3.25);
const camLookTarget = new THREE.Vector3(0, 0.85, -0.35);
let smoothCamActive = false;

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
  const vs = s.visualStyle || {};
  const accent = s.theme?.accent || "#f5a94a";
  // Shader themes style the robot only; room things keep their art-directed materials (1.1, DECISIONS R6)
  shaderPipeline.applyStyle(attachedEngine.robot?.root, vs.shaderTheme || "cozy_stylized", { accent });
  setEmotionTint(appState.get("behavior")?.emotion || "calm", vs.emotionLightingTint !== false);
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

  // Reflect behavior navigation coordinates seamlessly onto the robot root
  const bp = behaviorEngine.position;
  if (engine.robot?.nodes?.Root && behaviorEngine.state !== "IDLE_HOME") {
    engine.robot.nodes.Root.position.x = bp.x;
    engine.robot.nodes.Root.position.z = bp.z;
    engine.robot.nodes.Root.rotation.y = bp.rotY;
  }

  // Smoothly apply active IK arm reach + weighted head gaze
  ikSockets.applyPostPose(engine.robot, dt);
  unifiedRoom.update(dt, time);

  // Critically damped camera preset override when active in Clean Stage / Studio mode
  if (smoothCamActive && currentCameraPreset !== "follow_robot") {
    const view = CAMERA_PRESET_VIEWS[currentCameraPreset];
    if (view) {
      const alpha = 1 - Math.exp(-5.5 * dt);
      camPosTarget.set(view.pos[0], view.pos[1], view.pos[2]);
      camLookTarget.set(view.target[0], view.target[1], view.target[2]);
      engine.camera.position.lerp(camPosTarget, alpha);
      engine.camera.lookAt(camLookTarget);
    }
  } else if (currentCameraPreset === "follow_robot" && engine.robot?.nodes?.Root) {
    const rp = engine.robot.nodes.Root.position;
    const alpha = 1 - Math.exp(-4.5 * dt);
    camPosTarget.set(rp.x, 1.38, rp.z + 2.25);
    camLookTarget.set(rp.x, 0.84, rp.z);
    engine.camera.position.lerp(camPosTarget, alpha);
    engine.camera.lookAt(camLookTarget);
  }
}

export function dispatchChoreography(choreography) {
  const assets = appState.get("roomAssets") || [];
  return behaviorEngine.handleChoreographyTool(choreography, assets);
}

export function initV1Runtime() {
  if (initialized) return;
  initialized = true;

  initRoomContextBridge();
  voiceDock.mount(document.body);
  cleanStage.mount(document.body);
  studioDrawer.mount(document.body);

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
    if (attachedEngine) setEmotionTint(emotion, getSettings()?.visualStyle?.emotionLightingTint !== false);
  });
  bus.on(EVENTS.CAMERA_PRESET_CHANGED, ({ preset }) => {
    currentCameraPreset = preset;
    smoothCamActive = preset !== "wide_room";
  });

  // Wire voice dock actions to runtime
  bus.on(EVENTS.DOCK_ACTION, (ev) => {
    const assets = appState.get("roomAssets") || [];
    if (ev.action === "summon_home") behaviorEngine.handleChoreographyTool({ tool: "return_home" }, assets);
    else if (ev.action === "roam_toggle") {
      const next = !(appState.get("behavior")?.autonomousRoaming !== false);
      updateSettings({ behaviorEngine: { autonomousRoaming: next } }).catch(() => {});
    } else if (ev.action === "set_emotion" && ev.emotion) {
      behaviorEngine.handleChoreographyTool({ tool: "set_emotion", args: { emotion: ev.emotion } }, assets);
    } else if (ev.action === "toggle_whiteboard") {
      cleanStage.setCameraPreset(currentCameraPreset === "whiteboard_focus" ? "wide_room" : "whiteboard_focus");
    } else if (ev.action === "vision_toggle") {
      const next = !appState.get("voice")?.visionContext;
      appState.set("voice", { visionContext: next });
      voiceDock.render();
    } else if (ev.action === "mic_mode") {
      const next = appState.get("voice")?.micMode === "ptt" ? "vad" : "ptt";
      appState.set("voice", { micMode: next });
      voiceDock.render();
    }
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

  document.addEventListener("friends:tray-action", (e) => {
    const act = e.detail?.action;
    if (act === "toggle-clean-stage") cleanStage.toggleCleanStage();
    else if (act === "mute-mic") bus.emit(EVENTS.DOCK_ACTION, { action: "mic_mute" });
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
    if (s.voiceDock) voiceDock.configure(s.voiceDock);
    if (s.behaviorEngine) {
      behaviorEngine.configure(s.behaviorEngine);
      unifiedRoom.setFoleyVolume(s.behaviorEngine.foley?.volume ?? 65);
      unifiedRoom.rebuildDebugOverlays(navMesh, s.behaviorEngine.waypointRoute);
    }
    if (s.stageMode) cleanStage.configure(s.stageMode);
    applyVisualSettings(s);
  });
}
