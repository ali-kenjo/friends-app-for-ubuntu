// ---------- Text / Silent Sandbox Adapter (server/core/ai/adapters/text-sandbox-adapter.js) ----------
// Zero API keys and zero microphone required. Provides a complete interactive chat +
// real-time 3D room choreography experience out of the box using live RoomContext state.
const crypto = require("crypto");
const { VoiceProviderAdapter } = require("../voice-adapter");
const roomContext = require("../room-context");

class TextSandboxAdapter extends VoiceProviderAdapter {
  constructor(options = {}) {
    super("text-sandbox", options);
    this.latestContext = roomContext.get();
  }

  async start() {
    await super.start();
    this.emit("ready", { provider: this.id, model: "sandbox-v1", silent: true });
  }

  sendRoomContext(contextSummary) {
    this.latestContext = contextSummary || roomContext.get();
  }

  async sendText(text) {
    const raw = String(text || "").trim();
    if (!raw || this.closed) return;
    this.setInteractionStatus("IN_PROGRESS");

    const lower = raw.toLowerCase();
    const ctx = this.latestContext || roomContext.get();
    const calls = [];
    let reply = "";

    const pushCall = (name, args) => {
      calls.push({ id: `sbx-${crypto.randomBytes(4).toString("hex")}`, name, args });
    };

    if (/\b(clear|erase|wipe)\b.*\b(board|whiteboard)\b/.test(lower)) {
      pushCall("clear_whiteboard", {});
      pushCall("set_emotion", { emotion: "happy" });
      reply = "I'll walk over and wipe the whiteboard clean for us!";
    } else if (/\b(explain|write|draw|diagram|flowchart)\b.*\b(board|whiteboard)\b/.test(lower)) {
      const topic = raw.replace(/.*?\b(?:on|to)\s+(?:the\s+)?whiteboard\b[:,-]?\s*/i, "").trim() || raw;
      const isFlow = /\bflowchart|diagram\b/.test(lower);
      pushCall("explain_on_whiteboard", {
        title: topic.slice(0, 64),
        bullets: [
          `Core Idea: ${topic.slice(0, 48)}`,
          "Step 1: Observe live room context",
          "Step 2: Connect components & state",
          "Step 3: Iterate together!",
        ],
        diagramType: isFlow ? "flowchart" : "notes",
      });
      pushCall("set_emotion", { emotion: "thinking" });
      reply = `Grabbing a marker and mapping out "${topic.slice(0, 48)}" step-by-step on the 3D whiteboard!`;
    } else if (/\bnotebook\b|\btake note|jot down\b/.test(lower)) {
      const note = raw.replace(/.*?\bnotebook[:,-]?\s*/i, "").trim() || raw;
      pushCall("write_in_notebook", { heading: "Session Note", note: note.slice(0, 140) });
      pushCall("set_emotion", { emotion: "curious" });
      reply = `Writing that down in the open desk notebook: "${note.slice(0, 80)}".`;
    } else if (/\bwater\b.*\bflower|\bflowers\b/.test(lower)) {
      pushCall("water_flowers", {});
      pushCall("set_emotion", { emotion: "happy" });
      reply = `Heading over to water the flowers (currently ${ctx.flowerHydration || "healthy"}). Fresh and vibrant!`;
    } else if (/\b(home|come back|return home|stay)\b/.test(lower)) {
      pushCall("return_home", {});
      pushCall("set_emotion", { emotion: "calm" });
      reply = "Returning to my Home Standing Spot right away.";
    } else if (/\b(route|patrol|roam|tour)\b/.test(lower)) {
      pushCall("follow_route", { mode: /ping/.test(lower) ? "ping_pong" : /random/.test(lower) ? "random" : "loop" });
      pushCall("set_emotion", { emotion: "playful" });
      reply = "Starting my waypoint tour around the studio!";
    } else if (/\b(play|ball|rubik|cube|drone|glider|handheld|retro|holo|laser|cradle|blocks|stack|synth|kalimba|toy)\b/.test(lower)) {
      const toyMap = [
        [/ball/, "bouncy_ball"],
        [/rubik|cube/, "rubiks_cube"],
        [/drone|glider/, "rc_drone"],
        [/handheld|retro/, "retro_handheld"],
        [/holo|laser/, "holo_projector"],
        [/cradle|newton/, "newtons_cradle"],
        [/block|stack/, "stacking_blocks"],
        [/synth|kalimba/, "mini_synth"],
      ];
      const match = toyMap.find(([re]) => re.test(lower));
      const available = (ctx.availableToys || []).map((t) => t.id);
      const chosen = match ? match[1] : available[0] || "rubiks_cube";
      pushCall("play_with_toy", { toyId: chosen, action: /topple/.test(lower) ? "topple" : /laser/.test(lower) ? "laser" : "play" });
      pushCall("set_emotion", { emotion: "excited" });
      reply = `Walking over to play with ${chosen.replace(/_/g, " ")}!`;
    } else if (/\b(room|what do you see|what's around|props|inventory)\b/.test(lower)) {
      const names = (ctx.activeProps || []).map((p) => p.name || p.id);
      const toys = (ctx.availableToys || []).map((t) => t.id);
      pushCall("set_emotion", { emotion: "curious" });
      reply = `Right now in ${ctx.presetId || "our room"}, I see ${names.length} active items (${names.slice(0, 8).join(", ") || "open floor"}). Flowers are ${ctx.flowerHydration || "healthy"}, and toys ready are: ${toys.join(", ") || "none"}.`;
    } else {
      // Match move_to_asset if an active asset name/id is mentioned
      const matchedProp = (ctx.activeProps || []).find(
        (p) => lower.includes(p.id.toLowerCase()) || (p.name && lower.includes(p.name.toLowerCase()))
      );
      if (matchedProp) {
        pushCall("move_to_asset", { assetId: matchedProp.id });
        pushCall("set_emotion", { emotion: "curious" });
        reply = `Heading over to check out ${matchedProp.name || matchedProp.id}!`;
      } else {
        pushCall("set_emotion", { emotion: /\bthank|great|awesome|cool|yay\b/.test(lower) ? "happy" : "curious" });
        reply = `[Text Sandbox Mode] Heard you: "${raw}". Ask me to explain something on the whiteboard, write in the notebook, water the flowers, play with any toy (ball, rubik's cube, drone, holo projector, kalimba), or describe the room!`;
      }
    }

    if (calls.length) this.emit("tool_calls", calls);
    this.emit("transcript", { role: "model", text: reply });
    this.setInteractionStatus("IDLE");
    this.emit("turn_complete");
  }
}

module.exports = TextSandboxAdapter;
