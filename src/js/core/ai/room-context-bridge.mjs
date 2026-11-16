// ---------- Frontend Live Room-Context Bridge (core/ai/room-context-bridge.mjs) ----------
// Listens to room changes and syncs a compact structured snapshot to the server
// (both REST /api/studio/room-context and active live voice WebSockets) so the AI
// always knows exact active props, whiteboard text, notebook notes, flowers, and toys.
import { bus, EVENTS } from "../event-bus.mjs";
import { appState } from "../state-store.mjs";

let lastHash = "";
let syncTimer = null;
let socketSender = null;

export function attachLiveContextSocket(sendFn) {
  socketSender = typeof sendFn === "function" ? sendFn : null;
  if (socketSender) pushRoomContextNow();
}

export function detachLiveContextSocket() {
  socketSender = null;
}

export async function pushRoomContextNow() {
  const ctx = appState.buildRoomContextSummary();
  const hash = JSON.stringify(ctx);
  if (hash === lastHash) return ctx;
  lastHash = hash;

  if (socketSender) {
    try {
      socketSender({ type: "room_context", context: ctx });
    } catch {}
  }

  try {
    await fetch("/api/studio/room-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ctx),
    });
  } catch {
    // Offline/headless unit test context
  }
  return ctx;
}

export function initRoomContextBridge() {
  const scheduleSync = () => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      pushRoomContextNow();
    }, 180);
  };
  bus.on(EVENTS.ROOM_CHANGED, scheduleSync);
  bus.on(EVENTS.PROP_STATE_CHANGED, scheduleSync);
  bus.on(EVENTS.BEHAVIOR_STATE, scheduleSync);
  bus.on(EVENTS.ROOM_PRESET_LOADED, () => {
    lastHash = "";
    scheduleSync();
  });
}
