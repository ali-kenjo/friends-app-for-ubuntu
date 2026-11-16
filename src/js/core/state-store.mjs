// ---------- Centralized Reactive State Store (core/state-store.mjs) ----------
// Single reactive source of truth for runtime 3D Room, Robot Behavior,
// Visual Style, Voice Dock, Stage Mode, AI Provider status, and Undo/Redo.
import { bus, EVENTS } from "./event-bus.mjs";

/**
 * Bounded Undo/Redo command stack for live Room Layout Editing & Studio tweaks.
 */
export class UndoStack {
  constructor(limit = 60) {
    this.limit = limit;
    /** @type {Array<{label: string, undo: () => void, redo: () => void}>} */
    this.undoStack = [];
    /** @type {Array<{label: string, undo: () => void, redo: () => void}>} */
    this.redoStack = [];
  }

  push(cmd) {
    if (!cmd || typeof cmd.undo !== "function" || typeof cmd.redo !== "function") return;
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo();
    this.redoStack.push(cmd);
    return true;
  }

  redo() {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.redo();
    this.undoStack.push(cmd);
    return true;
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}

const DEFAULT_RUNTIME = () => ({
  studioOpen: false,
  studioTab: "room_editor", // room_editor | behavior_engine | voice_dock | visual_lighting | ai_provider
  cleanStage: false,
  stageBackdrop: "full_room", // full_room | solid_studio | chroma_green | chroma_blue | transparent_window
  cameraPreset: "wide_room", // wide_room | desk_closeup | whiteboard_focus | follow_robot | cinema_orbit
  shaderStyle: "cozy_stylized", // realistic_pbr | anime_cel | cozy_stylized | minimalist_studio
  lightingPreset: "warm_desk_lamp", // morning_daylight | warm_desk_lamp | sunset_glow | night_cyber_studio | neutral_broadcast
  selectedAssetId: null,
  gizmoMode: "translate", // translate | rotate | scale
  gridSnap: false,
  surfaceSnap: true,
  debugOverlays: {
    navMesh: false,
    anchors: false,
    homeSpot: true,
    routes: true,
  },
  waypointEditMode: false,
  behavior: {
    state: "IDLE_HOME",
    activeAssetId: null,
    autonomousRoaming: true,
    focusLock: false,
    heldPropId: null,
    heldHand: null,
    sessionInteractions: 0,
    hourlyInteractions: 0,
    emotion: "calm",
  },
  voice: {
    provider: "gemini-live",
    connected: false,
    muted: false,
    micMode: "vad", // vad | ptt
    interactionStatus: "IDLE", // IN_PROGRESS | IDLE
    visionContext: false,
  },
  roomAssets: [],
  roomMeta: {
    presetId: "creator_studio_desk",
    homeSpot: { x: 0, z: 0.15, rotY: 0 },
    flowerState: "healthy", // vibrant_bloom | healthy | drooping
    whiteboardText: "",
    notebookNotes: [],
  },
});

export class ReactiveStateStore {
  constructor() {
    this.state = DEFAULT_RUNTIME();
    this.undo = new UndoStack(80);
    /** @type {Set<(state: any, slice: string) => void>} */
    this.subs = new Set();
  }

  get(slice) {
    return slice ? this.state[slice] : this.state;
  }

  /**
   * Merge updates into a named slice (or root) and notify listeners.
   * @param {string|null} slice
   * @param {Record<string, any>} patch
   */
  set(slice, patch) {
    if (!slice) {
      this.state = { ...this.state, ...patch };
    } else if (typeof this.state[slice] === "object" && this.state[slice] !== null && !Array.isArray(this.state[slice])) {
      this.state = {
        ...this.state,
        [slice]: { ...this.state[slice], ...patch },
      };
    } else {
      this.state = { ...this.state, [slice]: patch };
    }
    this.notify(slice || "root");
  }

  subscribe(fn) {
    if (typeof fn !== "function") return () => {};
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  notify(slice) {
    for (const fn of [...this.subs]) {
      try {
        fn(this.state, slice);
      } catch {}
    }
  }

  /** Build compact structured summary of current room for AI context injection. */
  buildRoomContextSummary() {
    const assets = Array.isArray(this.state.roomAssets) ? this.state.roomAssets : [];
    const activeProps = assets
      .filter((a) => a.visible !== false)
      .map((a) => ({
        id: a.id,
        name: a.name || a.id,
        kind: a.kind,
        category: a.category,
        x: Number((a.x || 0).toFixed(2)),
        y: Number((a.y || 0).toFixed(2)),
        z: Number((a.z || 0).toFixed(2)),
        attachedTo: a.attachedTo || null,
        state: a.state || null,
      }));
    const toys = activeProps.filter((a) => a.category === "toy").map((t) => ({ id: t.id, name: t.name, state: t.state }));
    return {
      presetId: this.state.roomMeta.presetId,
      robotState: this.state.behavior.state,
      robotEmotion: this.state.behavior.emotion,
      heldProp: this.state.behavior.heldPropId,
      homeSpot: this.state.roomMeta.homeSpot,
      flowerHydration: this.state.roomMeta.flowerState,
      whiteboardText: (this.state.roomMeta.whiteboardText || "").slice(0, 600),
      notebookNotes: (this.state.roomMeta.notebookNotes || []).slice(-6),
      activeProps,
      availableToys: toys,
    };
  }

  reset() {
    this.state = DEFAULT_RUNTIME();
    this.undo.clear();
    this.notify("root");
    bus.emit(EVENTS.ROOM_CHANGED, this.buildRoomContextSummary());
  }
}

export const appState = new ReactiveStateStore();
export const createStateStore = () => new ReactiveStateStore();
