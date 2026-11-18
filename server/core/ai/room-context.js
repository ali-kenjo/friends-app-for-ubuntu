// ---------- What the AI is told about the robot's room (server/core/ai/room-context.js) ----------
// One block for every provider (Gemini Live, OpenAI Realtime, the local pipeline, the text sandbox, and the
// normal chat when the robot is on screen), made from the room document in the rooms store
// (src/js/room/ai.mjs roomBlock): the things by their names with where they are, what the robot may and may not
// do with each, its spots and routes, and how it is now. Names you gave things are quoted as data. Things that
// show your own things say nothing of them unless switched on and allowed. Settings → Robot → "What the AI
// knows of the room": all, names only, or nothing.
//
// The page reports how the robot is (update()); the rooms store says when the room changed. Either way
// "change" is emitted, and live sessions send the AI a silent update.
const EventEmitter = require("events");
const rooms = require("../../rooms");
const roomAI = require("../../../src/js/room/ai.mjs");

const text = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");

class RoomContextRegistry extends EventEmitter {
  constructor() {
    super();
    this.latest = { state: {}, filming: false, updatedAt: null };
    rooms.events?.on("change", () => this.emit("change", this.latest));
  }

  // How the robot is now, from the page: { where, doing, posture, mood, filming }
  update(snapshot) {
    const s = snapshot && typeof snapshot === "object" ? snapshot : {};
    const posture = ["stand", "sit", "lean", "rest"].includes(s.posture) ? s.posture : "stand";
    const next = { state: { where: text(s.where, 80), doing: text(s.doing, 80), posture, mood: text(s.mood, 24) }, filming: s.filming === true, updatedAt: new Date().toISOString() };
    if (JSON.stringify(next.state) === JSON.stringify(this.latest.state) && next.filming === this.latest.filming) return this.latest;
    this.latest = next;
    this.emit("change", this.latest);
    return this.latest;
  }

  get() {
    return this.latest;
  }

  // The room the robot is in now
  room(settings) {
    try {
      const id = settings?.robot?.room?.layoutId;
      return id ? rooms.get(id) : null;
    } catch {
      return null;
    }
  }

  hasRoom(settings = require("../../settings").get()) {
    return Boolean(this.room(settings));
  }

  // The block for the AI ("" when there's no room or the user keeps the room from it)
  formatPromptBlock(ctx = this.latest, { settings = require("../../settings").get(), maxChars = 3500 } = {}) {
    const mode = settings.robot?.ai?.context || "all";
    if (mode === "none") return "";
    const room = this.room(settings);
    if (!room) return "";
    const block = roomAI.roomBlock(room, {
      state: ctx?.state || {},
      ai: settings.robot?.ai,
      privateMode: settings.privacy?.localOnly === true,
      filming: ctx?.filming === true,
      personalInFilming: settings.robot?.privacy?.personalInFilming === true,
      maxChars,
    });
    // "Names only": the things and where they are, without the rules and the robot's state
    if (mode === "names") return block.split("\n").filter((l) => !/^(Right now|The user has switched off|You may)/.test(l)).map((l) => l.replace(/: (you may|never|look only)[^.]*\.$/, ".")).join("\n");
    return block;
  }
}

module.exports = new RoomContextRegistry();
module.exports.RoomContextRegistry = RoomContextRegistry;
