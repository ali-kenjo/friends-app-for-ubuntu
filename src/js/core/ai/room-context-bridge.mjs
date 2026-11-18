// ---------- How the robot is now, for the AI (core/ai/room-context-bridge.mjs) ----------
// The helper makes the AI's room block from the room document itself (server/core/ai/room-context.js); the page
// adds what only it knows: where the robot is in words, what it's doing, its posture and mood, and whether
// filming is on. Sent to the live voice session (when one is open) and to the helper, when it changes.
import { robot } from "../../robot/index.js";
import { displayName } from "../../room/model.mjs";
import { standPoint } from "../../room/nav.mjs";

let last = "";
let timer = null;
let socketSender = null;

export function attachLiveContextSocket(sendFn) {
  socketSender = typeof sendFn === "function" ? sendFn : null;
  last = "";
  if (socketSender) pushRoomContextNow();
}

export function detachLiveContextSocket() {
  socketSender = null;
}

// Where it is, in words: at home, at a spot, by a thing, or which part of the room
function whereWords(room, [x, z]) {
  const h = room.robot.home.pos;
  if (Math.hypot(x - h[0], z - h[2]) < 0.4) return "at home";
  const spot = room.robot.spots.find((s) => Math.hypot(x - s.pos[0], z - s.pos[2]) < 0.6);
  if (spot) return `at the spot ${JSON.stringify(spot.name)}`;
  let best = null;
  for (const a of room.assets) {
    if (a.hidden || a.parent) continue;
    const p = standPoint(room, a);
    const d = Math.hypot(x - p[0], z - p[1]);
    if (d < 0.8 && (!best || d < best.d)) best = { a, d };
  }
  if (best) return `by the ${JSON.stringify(displayName(best.a))}`;
  const side = x < -room.size.w / 6 ? "left" : x > room.size.w / 6 ? "right" : "middle";
  const depth = z < -room.size.d / 6 ? "back" : z > room.size.d / 6 ? "front" : "middle";
  return depth === side ? "in the middle of the room" : `${depth} ${side} of the room`;
}

function doingWords(room, b) {
  const t = b.task;
  const name = (id) => JSON.stringify(displayName(room.assets.find((a) => a.id === id) || { type: "" }));
  if (b.sleeping) return "asleep";
  if (t?.kind === "dwell" && t.asset) return `${t.action === "look" ? "looking at" : "with"} the ${name(t.asset)}`;
  if (t?.kind === "go" && t.asset) return `going to the ${name(t.asset)}`;
  if (t?.kind === "route") return "following a route";
  if (b.why === "rest") return "resting";
  if (b.why === "wander" && t?.kind === "go") return "wandering about";
  if (t?.kind === "go") return "moving";
  return "";
}

export function snapshot() {
  const e = robot.engine;
  const room = robot.room;
  const b = e?.behaviour;
  if (!room || !b?.room) return null;
  return {
    where: whereWords(room, b.pos),
    doing: doingWords(room, b),
    posture: b.out?.posture?.kind || "stand",
    mood: e.animator?.pose?.mood || "",
    filming: Boolean(e.look?.filming),
  };
}

export async function pushRoomContextNow() {
  const ctx = snapshot();
  if (!ctx) return null;
  const key = JSON.stringify(ctx);
  if (key === last) return ctx;
  last = key;
  if (socketSender) {
    try {
      socketSender({ type: "room_context", context: ctx });
    } catch {}
  }
  try {
    await fetch("/api/studio/room-context", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ctx) });
  } catch {
    // (offline, or a page without the helper)
  }
  return ctx;
}

// Every two seconds: sent only when it changed
export function initRoomContextBridge() {
  if (timer) return;
  timer = setInterval(() => {
    if (document.visibilityState !== "hidden") pushRoomContextNow();
  }, 2000);
}
