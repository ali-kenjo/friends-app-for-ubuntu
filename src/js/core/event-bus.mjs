// ---------- Typed Event Bus (core/event-bus.mjs) ----------
// Central decoupled pub/sub channel bridging AI adapters, 3D World,
// Robot Behavior Engine, Room Editor, Voice Dock, and Storage.

export const EVENTS = Object.freeze({
  ROOM_CHANGED: "room:changed",
  ROOM_PRESET_LOADED: "room:preset_loaded",
  PROP_SELECTED: "editor:prop_selected",
  PROP_TRANSFORMED: "editor:prop_transformed",
  PROP_INTERACT: "world:prop_interact",
  PROP_STATE_CHANGED: "world:prop_state_changed",
  SHADER_CHANGED: "visual:shader_changed",
  LIGHTING_CHANGED: "visual:lighting_changed",
  STAGE_MODE_CHANGED: "stage:mode_changed",
  CAMERA_PRESET_CHANGED: "stage:camera_preset",
  BEHAVIOR_STATE: "robot:behavior_state",
  ROBOT_EMOTION: "robot:emotion",
  ROBOT_PATH_UPDATED: "robot:path_updated",
  AI_TOOL_CALL: "ai:tool_call",
  AI_INTERACTION_STATUS: "ai:interaction_status",
  VOICE_PROVIDER_EVENT: "ai:voice_provider_event",
  VOICE_SPEECH_START: "ai:user_speech_start",
  VOICE_SPEECH_END: "ai:user_speech_end",
  DOCK_ACTION: "ui:dock_action",
  DOCK_LAYOUT_CHANGED: "ui:dock_layout_changed",
  STUDIO_TAB_CHANGED: "ui:studio_tab",
  WIZARD_COMPLETE: "ui:wizard_complete",
  BUNDLE_IMPORTED: "storage:bundle_imported",
  TRAY_ACTION: "desktop:tray_action",
});

/**
 * Typed reactive EventBus with listener cleanup and debug ring buffer.
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
    /** @type {Array<{event: string, payload: unknown, ts: number}>} */
    this.history = [];
    this.maxHistory = 80;
  }

  /**
   * Subscribe to a typed event. Returns an unsubscribe function.
   * @param {string} event
   * @param {(payload: any) => void} handler
   * @returns {() => void}
   */
  on(event, handler) {
    if (typeof handler !== "function") return () => {};
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Subscribe once to an event.
   * @param {string} event
   * @param {(payload: any) => void} handler
   * @returns {() => void}
   */
  once(event, handler) {
    const stop = this.on(event, (payload) => {
      stop();
      handler(payload);
    });
    return stop;
  }

  /**
   * Unsubscribe a handler from an event.
   * @param {string} event
   * @param {(payload: any) => void} handler
   */
  off(event, handler) {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) this.listeners.delete(event);
    }
  }

  /**
   * Emit a typed event to all subscribers safely.
   * @param {string} event
   * @param {any} [payload]
   */
  emit(event, payload) {
    this.history.push({ event, payload, ts: Date.now() });
    if (this.history.length > this.maxHistory) this.history.shift();
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch {
        // Keep bus resilient against individual subscriber exceptions
      }
    }
  }

  /** Clear all listeners (useful in tests). */
  clear() {
    this.listeners.clear();
    this.history.length = 0;
  }
}

export const bus = new EventBus();
export const createEventBus = () => new EventBus();
