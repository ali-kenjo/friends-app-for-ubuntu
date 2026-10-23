// ---------- What the robot reacts to ----------
// Turns what happens in the app (voice mode's states and captions, the text
// chat's typing, replies, likes...) into states, moods and gestures for the
// animator. Pure logic with its own clock (advanced by frame()), so node:test
// checks it; the page feeds it events and audio levels.
//
// Where moods come from, strongest first: the AI's own robot_mood / robot_gesture
// ("tool"), then Smarter moods ("smart"), then the words (captions), then
// the state's own look.
import { CaptionMood, classify } from "./classifier.mjs";
import { PRIORITY } from "./presets.mjs";
import { updateVoiceLevels, decayLevels } from "./bands.mjs";

const TAU = Math.PI * 2;

export class Director {
  // animator: the Animator; smartMood(text, heard) → Promise<mood|null> (or null when off)
  constructor(animator, { smartMood = null } = {}) {
    this.a = animator;
    this.smartMood = smartMood;
    this.context = "chat"; // "voice" while voice mode is open
    this.t = 0;
    this.aiWords = new CaptionMood({ role: "ai" });
    this.userWords = new CaptionMood({ role: "user" });
    this.turn = { ai: "", user: "" };
    this.greeted = false;
    this.last = { gesture: -10, wave: -20, nod: -10, event: -5 };
    this.chat = { state: "idle", until: 0, pending: 0, phase: 0, text: "", reading: null };
    this.mission = false; // a mission is running (working())
    this.reactions = {
      missions: true,
      reminders: true,
      notifications: true,
      tasks: true,
      streaks: true,
      hourly: true,
      welcomeBack: true,
    };
    this.levels = [0, 0, 0, 0];
    this.floor = [0, 0, 0, 0];
  }

  setReactions(cfg) {
    if (!cfg || typeof cfg !== "object") return;
    Object.assign(this.reactions, cfg);
  }

  // ---------- Voice mode ----------
  openVoice() {
    this.context = "voice";
    this.greeted = false;
    this.resetTurn();
    this.a.moods.clear();
  }

  closeVoice() {
    this.context = "chat";
    this.setChat("idle");
  }

  // Voice mode's state; muted listening looks sleepy
  voiceState(state, { muted = false } = {}) {
    if (this.context !== "voice") return;
    const shown = muted && (state === "listening" || state === "hearing") ? "standby" : state;
    // A new turn begins: the last one's mood can fade
    if ((state === "hearing" || state === "thinking") && this.a.state === "speaking") this.a.moods.release(this.a.now, 1500);
    this.a.setState(shown);
    // Its first words get a wave (the boot-up eases out for it)
    if (state === "speaking" && !this.greeted) {
      this.greeted = true;
      this.a.cancelGestures();
      this.gesture("wave", PRIORITY.tool);
    }
  }

  // Captions as they stream: role "ai" (what it says) or "user" (what you say)
  caption(role, piece) {
    if (role === "user") {
      this.turn.user += piece;
      const r = this.userWords.push(piece);
      if (r) this.fromUser(r);
    } else {
      this.turn.ai += piece;
      const r = this.aiWords.push(piece);
      if (r) this.fromAi(r);
    }
  }

  // What you said, all at once (Studio and Instant voice transcribe a whole turn)
  userSaid(text) {
    this.turn.user = text;
    this.fromUser(classify(text, { role: "user" }));
  }

  // Studio and Instant voice speak a reply in pieces: each piece is read when
  // it's queued, and its mood shows the moment it starts playing
  readPiece(text, { turnStart = false } = {}) {
    return classify(text, { role: "ai", turnStart });
  }

  pieceStarts(result, text = "") {
    this.turn.ai += text;
    if (result) this.fromAi(result);
  }

  // A turn is over (both sides): read what's left, and ask Gemini if that's on
  turnDone() {
    const ai = this.aiWords.flush();
    if (ai) this.fromAi(ai);
    const user = this.userWords.flush();
    if (user) this.fromUser(user);
    this.askSmart(this.turn.ai, this.turn.user);
    this.resetTurn();
  }

  resetTurn() {
    this.aiWords.reset();
    this.userWords.reset();
    this.turn = { ai: "", user: "" };
  }

  // Levels of the AI's voice (four bands, bands.mjs) and of yours (only when it can't be its echo)
  aiAudio(bands) {
    this.a.setAudio(bands);
  }

  userAudio(level) {
    this.a.setUser(level);
  }

  // Pressing End: a quick wave goodbye. Returns how long it needs (ms).
  goodbye() {
    this.a.cancelGestures();
    this.a.gesture("wave", { priority: PRIORITY.boot });
    this.last.wave = this.t;
    return 1000;
  }

  // ---------- The AI moving its body (robot_mood, robot_gesture, robot_use_prop, robot_go_to, robot_look_at) ----------
  toolEvent({ mood, gesture, useProp, goTo, lookAt } = {}) {
    if (mood) this.a.setMood(mood, { source: "tool", strength: 1 });
    if (gesture) this.gesture(gesture, PRIORITY.tool);
    if (goTo && typeof goTo === "object") this.a.goTo(goTo);
    if (lookAt && typeof lookAt === "object") this.a.lookAt(lookAt);
    if (useProp && typeof useProp === "object") this.a.useProp({ ...useProp, source: "tool" });
  }

  // ---------- Event reactions (configurable per category) ----------
  reactEvent(type, detail = {}) {
    const r = this.reactions;
    switch (type) {
      case "mission_started":
        if (r.missions === false) return false;
        this.working(true);
        this.a.setMood("determined", { source: "smart", strength: 0.85 });
        this.gesture("salute", PRIORITY.reaction, false);
        this.a.onSound?.("blip");
        return true;
      case "mission_progress":
        if (r.missions === false) return false;
        this.a.setMood("focused", { source: "smart", strength: 0.75 });
        this.gesture("nod", PRIORITY.reaction, true);
        return true;
      case "mission_finished":
        this.working(false);
        if (r.missions === false) return false;
        this.a.setMood("proud", { source: "smart", strength: 0.95 });
        this.gesture("fist_pump", PRIORITY.reaction, false);
        this.a.onSound?.("chime");
        return true;
      case "mission_failed":
        this.working(false);
        if (r.missions === false) return false;
        this.a.setMood("worried", { source: "smart", strength: 0.9 });
        this.gesture("facepalm", PRIORITY.reaction, false);
        this.a.onSound?.("sigh");
        return true;
      case "reminder":
        if (r.reminders === false) return false;
        this.a.setMood("surprised", { source: "smart", strength: 0.85 });
        this.gesture("lean_in", PRIORITY.reaction, false);
        this.a.springs.impulse("foreheadLight", 2.5);
        this.a.onSound?.("chime");
        return true;
      case "notification":
      case "telegram":
      case "telegram_message":
      case "reddit":
      case "reddit_match": {
        if (r.notifications === false) return false;
        this.a.setMood("curious", { source: "smart", strength: 0.8 });
        this.a.lookAt({ target: "tablet", duration: 4.5 });
        this.a.idleActivity.kind = "checkTablet";
        this.a.idleActivity.heldOverride = "tablet";
        this.a.idleActivity.until = this.a.t + 4.5;
        this.a.springs.impulse("foreheadLight", 2.2);
        this.a.onSound?.("blip");
        return true;
      }
      case "task_done":
        if (r.tasks === false) return false;
        this.a.setMood("happy", { source: "smart", strength: 0.85 });
        this.gesture("thumbs_up", PRIORITY.reaction, false);
        this.a.onSound?.("chime");
        return true;
      case "habit_streak":
        if (r.streaks === false) return false;
        this.a.setMood("excited", { source: "smart", strength: 0.95 });
        this.gesture("celebrate", PRIORITY.reaction, false);
        this.a.onSound?.("chime");
        return true;
      case "time_of_day": {
        if (r.hourly === false) return false;
        const hour = detail.hour ?? new Date().getHours();
        this.a.setContextHour(hour);
        if (hour >= 6 && hour <= 9) {
          this.a.setMood("happy", { source: "smart", strength: 0.7 });
          this.gesture("stretch", PRIORITY.reaction, true);
        } else if (hour >= 22 || hour < 5) {
          this.a.setMood("sleepy", { source: "smart", strength: 0.75 });
          this.gesture("yawn", PRIORITY.reaction, true);
        } else {
          this.a.lookAt({ target: "clock", duration: 3 });
        }
        return true;
      }
      case "user_return":
        if (r.welcomeBack === false) return false;
        if (!this.a.wakeFromNap()) {
          this.a.setMood("happy", { source: "smart", strength: 0.85 });
          this.gesture("big_wave", PRIORITY.reaction, false);
          this.a.onSound?.("chime");
        }
        return true;
      default:
        return false;
    }
  }

  // ---------- Text chat ----------
  setChat(state, seconds = 0) {
    this.chat.state = state;
    this.chat.until = seconds ? this.t + seconds : 0;
    if (this.context !== "chat") return;
    this.a.setState(state === "error" ? "error" : state === "speaking" ? "speaking" : state);
  }

  typing() {
    if (this.context !== "chat" || ["waiting", "streaming", "busy", "speaking"].includes(this.chat.state)) return;
    this.setChat("typing", 2.5);
  }

  waiting() {
    if (this.context !== "chat") return;
    this.a.moods.release(this.a.now, 800);
    this.chat.text = "";
    this.chat.pending = 0;
    this.aiWords.reset();
    this.setChat("waiting");
  }

  // A piece of the reply arrived: it "talks" at the rate the text comes in
  text(piece) {
    if (this.context !== "chat") return;
    if (this.chat.state !== "streaming") this.setChat("streaming");
    this.chat.pending += piece.length;
    this.chat.text += piece;
    const r = this.aiWords.push(piece);
    if (r) this.fromAi(r);
  }

  busy() {
    if (this.context === "chat") this.setChat("busy");
  }

  done(reply = "") {
    if (this.context !== "chat") return;
    const text = reply || this.chat.text;
    this.aiWords.flush();
    // The whole reply's mood: its start and its end matter most
    const r = classify(text.length > 900 ? `${text.slice(0, 600)} ${text.slice(-300)}` : text, { role: "ai" });
    if (r.mood !== "neutral") this.a.setMood(r.mood, { source: "caption", strength: Math.max(0.6, r.confidence) });
    if (r.gesture === "wave" || r.gesture === "celebrate") this.gesture(r.gesture, PRIORITY.caption);
    this.chat.state = "finishing"; // stays talking until the text caught up, then idle
    this.askSmart(text, "");
  }

  error() {
    if (this.context !== "chat") return;
    this.chat.pending = 0;
    this.a.setMood("confused", { source: "tool", strength: 0.9 });
    this.setChat("error", 3);
  }

  // A mission is running in the background: the robot looks busy and focused while nothing else is going on
  working(on) {
    this.mission = Boolean(on);
    if (!this.mission && this.chat.state === "busy") this.setChat("idle");
  }

  // Your likes and pins are direct, so they're never held back like word cues
  liked() {
    this.a.setMood("happy", { source: "smart", strength: 0.9 });
    this.gesture("bounce", PRIORITY.reaction, false);
  }

  pinned() {
    this.gesture("nod", PRIORITY.reaction, false);
  }

  // Read aloud: reader() returns { bins, hzPerBin } from an analyser, or null when it stops
  readAloud(reader) {
    this.chat.reading = reader;
    if (this.context !== "chat") return;
    this.setChat(reader ? "speaking" : "idle");
  }

  // ---------- Every frame ----------
  frame(dt) {
    this.t += dt;
    const c = this.chat;
    if (c.until && this.t > c.until) this.setChat("idle");
    if (this.context !== "chat") return;
    if (this.mission && c.state === "idle") this.setChat("busy");
    if (c.reading) {
      const data = c.reading();
      if (data) this.a.setAudio(updateVoiceLevels(data.bins, data.hzPerBin, this.floor, this.levels));
      else this.a.setAudio(decayLevels(this.levels, 0.85));
      return;
    }
    if (c.pending > 0) {
      // Syllables at about four a second, while the text that came in is "said"
      const rate = Math.min(60, Math.max(16, c.pending / 1.2));
      c.pending = Math.max(0, c.pending - rate * dt);
      c.phase += dt * TAU * 4.2;
      const s = Math.max(0, Math.sin(c.phase)) ** 1.2;
      const k = 0.3 + 0.7 * s;
      this.levels[0] = (0.3 + 0.35 * s) * k;
      this.levels[1] = (0.45 + 0.45 * s) * k;
      this.levels[2] = (0.25 + 0.35 * s) * k;
      this.levels[3] = (0.1 + 0.15 * s) * k;
      this.a.setAudio(this.levels);
    } else if (c.state === "finishing") {
      this.setChat("idle");
    }
  }

  // ---------- Reading moods ----------
  fromAi(r) {
    if (r.mood !== "neutral" && r.confidence >= 0.55) this.a.setMood(r.mood, { source: "caption", strength: r.confidence });
    if (r.gesture) this.gesture(r.gesture, PRIORITY.caption);
    else if (r.mood === "excited" && r.confidence > 0.85) this.gesture("bounce", PRIORITY.caption);
    else if (r.mood === "curious" && r.confidence > 0.75) this.gesture("tilt", PRIORITY.caption);
  }

  // Your words: it answers them (you laugh, it laughs; good news excites it)
  fromUser(r) {
    if (r.reaction !== "neutral" && r.confidence >= 0.55) this.a.setMood(r.reaction, { source: "caption", strength: r.confidence * 0.9 });
    if (r.gesture) this.gesture(r.gesture, PRIORITY.reaction);
    else if (r.reaction === "excited" && r.confidence > 0.85) this.gesture("bounce", PRIORITY.reaction);
  }

  // Gestures from words are rationed: not too often, and no wave twice in a row
  gesture(name, priority, ration = priority < PRIORITY.tool) {
    if (ration) {
      if (this.t - this.last.gesture < 2.5 || this.a.gestures.busy) return false;
      if (name === "wave" && this.t - this.last.wave < 12) return false;
      if ((name === "nod" || name === "head_shake") && this.t - this.last.nod < 6) return false;
    }
    if (!this.a.gesture(name, { priority })) return false;
    this.last.gesture = this.t;
    if (name === "wave") this.last.wave = this.t;
    if (name === "nod" || name === "head_shake") this.last.nod = this.t;
    return true;
  }

  async askSmart(text, heard) {
    if (!this.smartMood || !String(text || "").trim()) return;
    try {
      const mood = await this.smartMood(text, heard);
      if (mood) this.a.setMood(mood, { source: "smart", strength: 0.85 });
    } catch {}
  }
}
