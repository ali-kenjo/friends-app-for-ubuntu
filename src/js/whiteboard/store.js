// The page's one copy of the shared board (board-store.mjs), connected to the helper: requests, the server events
// that carry every change, and the cues the AI gives in a reply or in voice mode (point here, show this).
import { BoardStore } from "./board-store.mjs";
import { onServerEvent, onServerReconnect } from "../events.js";
import { getSettings } from "../store.js";
import { showAuthGate } from "../session.js";

async function request(method, url, body, headers = {}) {
  const res = await fetch(url, { method, headers: body === undefined || body instanceof Blob ? headers : { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body) });
  if (res.status === 401) {
    showAuthGate();
    throw new Error("Unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status}).`), { status: res.status });
  return data;
}

const io = {
  get: (url) => request("GET", url),
  send: (method, url, body) => request(method, url, body ?? {}),
  upload: (url, blob) => request("POST", url, blob, { "Content-Type": blob.type || "application/octet-stream" }),
  subscribe(fn) {
    const offEvents = onServerEvent("whiteboard", fn);
    const offBack = onServerReconnect(() => fn({ kind: "reconnected" }));
    return () => (offEvents(), offBack());
  },
  now: () => performance.now(),
  raf: (fn) => requestAnimationFrame(fn),
  caf: (id) => cancelAnimationFrame(id),
};

export const board = new BoardStore(io, getSettings);
// While voice mode is speaking, what the robot draws is written as its words reach that point
board.revealDelay = () => (typeof window.__friendsAudioLead === "function" ? window.__friendsAudioLead() : 0);
export const boardReady = board.init().catch((err) => console.warn("The whiteboard couldn't load:", err.message));

// Cues from the AI (pointing, zooming, opening the panel, switching boards): chat.js and Live pass them on
document.addEventListener("friends:whiteboard", (e) => {
  const cue = e.detail;
  if (!cue || typeof cue !== "object") return;
  if (cue.type === "board_opened" && cue.boardId && cue.boardId !== board.doc?.id) board.load(cue.boardId);
  board.emit("cue", cue);
});

// What the helper missed while the connection was down is fetched again
board.on("status", (s) => document.documentElement.toggleAttribute("data-wb-offline", s === "offline"));
const baseFrom = board.fromServer.bind(board);
board.fromServer = (e) => {
  if (e?.kind === "reconnected") {
    board.flushOutbox().finally(() => board.resync());
    return;
  }
  baseFrom(e);
};
