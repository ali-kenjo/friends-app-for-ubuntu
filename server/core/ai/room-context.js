// ---------- Live Room-State Context Manager (server/core/ai/room-context.js) ----------
// Maintains the latest structured snapshot of the 3D room (desk props, whiteboard text,
// open notebook notes, flower hydration, available toys, robot state) and formats
// concise context blocks for VoiceProviderAdapters so the AI never hallucinates missing objects.

const EventEmitter = require("events");

class RoomContextRegistry extends EventEmitter {
  constructor() {
    super();
    this.latest = {
      presetId: "creator_studio_desk",
      robotState: "IDLE_HOME",
      robotEmotion: "calm",
      heldProp: null,
      homeSpot: { x: 0, z: 0.15, rotY: 0 },
      flowerHydration: "healthy",
      whiteboardText: "",
      notebookNotes: [],
      activeProps: [],
      availableToys: [],
      updatedAt: null,
    };
  }

  /**
   * Update the active room snapshot and emit a change event for live sessions.
   * @param {Record<string, any>} snapshot
   */
  update(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return this.latest;
    this.latest = {
      presetId: String(snapshot.presetId || this.latest.presetId),
      robotState: String(snapshot.robotState || "IDLE_HOME"),
      robotEmotion: String(snapshot.robotEmotion || "calm"),
      heldProp: snapshot.heldProp ? String(snapshot.heldProp) : null,
      homeSpot: snapshot.homeSpot && typeof snapshot.homeSpot === "object" ? snapshot.homeSpot : this.latest.homeSpot,
      flowerHydration: String(snapshot.flowerHydration || "healthy"),
      whiteboardText: String(snapshot.whiteboardText || "").slice(0, 800),
      notebookNotes: Array.isArray(snapshot.notebookNotes) ? snapshot.notebookNotes.slice(-8).map((n) => String(n).slice(0, 200)) : [],
      activeProps: Array.isArray(snapshot.activeProps) ? snapshot.activeProps.slice(0, 40) : [],
      availableToys: Array.isArray(snapshot.availableToys) ? snapshot.availableToys.slice(0, 16) : [],
      updatedAt: new Date().toISOString(),
    };
    this.emit("change", this.latest);
    return this.latest;
  }

  get() {
    return this.latest;
  }

  /**
   * Format a compact, deterministic prompt block describing what is physically in the room right now.
   * @param {Record<string, any>} [ctx]
   */
  formatPromptBlock(ctx = this.latest) {
    const props = (ctx.activeProps || []).map((p) => {
      const loc = p.attachedTo ? `on ${p.attachedTo}` : `at (${p.x ?? 0}, ${p.z ?? 0})`;
      const st = p.state ? ` [${typeof p.state === "string" ? p.state : JSON.stringify(p.state)}]` : "";
      return `- ${p.id} (${p.name || p.kind}, ${p.category}) ${loc}${st}`;
    });
    const toys = (ctx.availableToys || []).map((t) => t.id);
    const notes = (ctx.notebookNotes || []).length ? ctx.notebookNotes.join(" | ") : "(empty)";
    const wb = ctx.whiteboardText ? ctx.whiteboardText.replace(/\s+/g, " ").trim().slice(0, 400) : "(blank)";

    return [
      "## Live 3D Room Context (authoritative — only interact with items listed here)",
      `Layout Preset: ${ctx.presetId} | Robot State: ${ctx.robotState} (${ctx.robotEmotion})${ctx.heldProp ? ` | Holding: ${ctx.heldProp}` : ""}`,
      `Flowers Hydration: ${ctx.flowerHydration}`,
      `Whiteboard Content: ${wb}`,
      `Open Notebook Notes: ${notes}`,
      `Available Toys: ${toys.length ? toys.join(", ") : "none"}`,
      `Active Room Props (${props.length}):`,
      props.length ? props.join("\n") : "- (default open stage)",
    ].join("\n");
  }
}

module.exports = new RoomContextRegistry();
module.exports.RoomContextRegistry = RoomContextRegistry;
