// ---------- The robot's animation, layer by layer ----------
// Each frame, from the bottom up:
//   1. idle life     hover bob, sway, breathing, blinks, glances, fin shimmer
//   2. state         listening, thinking, speaking... (presets.mjs STATES)
//   3. mood          happy, curious, sleepy... (MOOD_POSES), smoothed by MoodSmoother
//   4. gestures      one-shot moves from a queue (GESTURE_DEFS)
//   5. audio         the AI's voice: mouth, syllables, fins
//   6. attention     where it looks: you, the audience, the composer
// Layers make target values; springs ease every value toward its target, so
// nothing snaps. Pure module (no DOM, no three.js); give it a seeded random()
// and it is fully repeatable, which the tests rely on.
import { Springs, Mixer, MoodSmoother, GestureQueue, noise1, clamp, lerp } from "./spring.mjs";
import { CHANNELS, NEUTRAL, MOOD_POSES, MOODS, STATES, GESTURE_DEFS, gestureDuration, PRIORITY } from "./presets.mjs";
import { voiceShape, SyllableDetector } from "./bands.mjs";

const TAU = Math.PI * 2;
const SILENT = [0, 0, 0, 0];

// Where each gaze mode looks, -1..1 (+x the viewer's right, +y up)
const GAZE = {
  audience: [0, 0],
  up: [0.35, 0.55],
  down: [0, -0.5],
  composer: [-0.6, -0.45],
  left: [-0.75, 0.05],
  right: [0.75, 0.05],
  window: [0.65, 0.35],
  clock: [-0.55, 0.65],
  cat: [0.5, -0.55],
  fish: [-0.65, 0.1],
  plant: [-0.6, -0.25],
  tv: [0.6, 0.1],
  fireplace: [0.45, -0.35],
  book: [0, -0.55],
  tablet: [0.15, -0.5],
};
// Named spots in the room (-0.48..0.48 sideways, -0.38..0.38 depth)
export const ROOM_SPOTS = {
  center: [0, 0],
  left: [-0.38, -0.05],
  right: [0.38, -0.05],
  front: [0, 0.28],
  back: [0, -0.32],
  window: [0.36, -0.28],
  desk: [-0.34, -0.22],
  couch: [0.32, -0.18],
  plant: [-0.38, -0.15],
  lamp: [0.35, -0.25],
  fireplace: [0.3, -0.26],
  bookshelf: [-0.4, -0.28],
  bed: [-0.35, -0.24],
  kitchen: [-0.32, -0.2],
  arcade: [0.36, -0.22],
  telescope: [0.28, -0.3],
  tea_table: [0, -0.16],
  helm: [0, 0.18],
};
// Where you sit, as you look at the screen
export const SEATS = { front: [0, -0.05], left: [-0.85, -0.05], right: [0.85, -0.05] };

export class Animator {
  constructor({ random = Math.random, onUseProp = null, onSound = null } = {}) {
    this.random = random;
    this.onUseProp = onUseProp;
    this.onSound = onSound;
    this.springs = new Springs(CHANNELS);
    this.mixer = new Mixer(NEUTRAL);
    this.moods = new MoodSmoother();
    this.gestures = new GestureQueue(gestureDuration);
    this.syllables = new SyllableDetector();
    this.t = 0; // seconds of animation so far
    this.state = "idle";
    this.stateSince = 0;
    this.options = { reducedMotion: false, cameraFriendly: false, mouth: true, roam: 0, eyesFollowCursor: true };
    this.faceConfig = { blinkRate: 1, blinkStyle: "normal", pupilStyle: "dot" };
    this.behaviors = {
      preset: "balanced",
      energy: 0.5,
      curiosity: 0.5,
      playfulness: 0.5,
      clumsiness: 0.15,
      shyness: 0.2,
      expressiveness: 0.6,
      talkMotion: 0.5,
      roamRange: 0.5,
      personalSpace: 0.5,
      reactionStrength: 0.6,
      idle: null,
    };
    this.wander = { x: 0, z: 0, next: 0, state: "", side: 1 }; // where it is heading in the room
    this.moveTarget = null; // { target, x, z, until } from robot_go_to or idle prop inspection
    this.lookTarget = null; // { target, x, y, until } from robot_look_at or prop use
    this.dragState = { active: false, x: 0, z: 0 };
    this.lastPropUse = null;
    this.pointer = null; // { x, y, at } the mouse or finger, relative to the robot
    this.pokes = { count: 0, last: -100, hover: -100, zoneCounts: {} };
    this.seat = "front";
    this.face = null; // { x, y } from "Follow my face", or null
    this.audio = { bands: [0, 0, 0, 0], at: -Infinity };
    this.user = { level: 0, at: -Infinity };
    this.talk = { since: -1, quietSince: -1, lastNod: -10 };
    this.userTalking = 0;
    this.blinkState = { next: 1.2 + random() * 2, start: -1, double: false, length: 0.15 };
    this.saccade = { next: 0.8, x: 0, y: 0 };
    this.nextIdleGesture = 10 + random() * 8;
    this.bobPhase = random() * TAU;
    this.breathPhase = random() * TAU;
    this.idleSeed = this.bobPhase * 13.37 + 1;
    this.idleActivity = { kind: "breathe", until: 0, next: 14, isNapping: false, heldOverride: "" };
    this.contextHour = null; // optional 0..23 hour for time-of-day reactions
    this.chasePhase = 0;
    this.emphasisAvg = 0;
    this.lastEmphasis = -10;
    this.lastActivity = 0;
    this.offsets = { ...NEUTRAL }; // reused every frame: additive changes (zeroed each frame)
    this.gestureOffsets = {};
    this.pose = {
      ...NEUTRAL,
      blink: 0,
      spin: 0,
      chasePhase: 0,
      mouthVisible: 1,
      speaking: 0,
      userTalking: 0,
      mood: "neutral",
      gesture: "",
      viseme: "rest",
      idleKind: "breathe",
      heldOverride: "",
      t: 0,
    };
  }

  // Deterministic secondary RNG for idle scheduler so primary random() sequence stays repeatable
  idleRng() {
    this.idleSeed = (this.idleSeed * 1664525 + 1013904223) % 4294967296;
    return this.idleSeed / 4294967296;
  }

  // ---------- Inputs ----------
  get now() {
    return this.t * 1000;
  }

  setState(state) {
    if (!STATES[state] || state === this.state) return;
    if (this.idleActivity.isNapping && state !== "standby" && state !== "idle") this.wakeFromNap();
    this.state = state;
    this.stateSince = this.t;
    this.lastActivity = this.t;
    if (state === "connecting") this.gesture("boot", { priority: PRIORITY.boot });
  }

  setOptions(options) {
    Object.assign(this.options, options);
  }

  setBehaviors(behaviors) {
    if (!behaviors || typeof behaviors !== "object") return;
    Object.assign(this.behaviors, behaviors);
  }

  setFaceConfig(face) {
    if (!face || typeof face !== "object") return;
    if (face.blinkRate != null) this.faceConfig.blinkRate = clamp(Number(face.blinkRate) || 1, 0.2, 2.5);
    if (face.blinkStyle) this.faceConfig.blinkStyle = String(face.blinkStyle);
    if (face.pupilStyle) this.faceConfig.pupilStyle = String(face.pupilStyle);
  }

  setContextHour(hour) {
    this.contextHour = hour == null ? null : ((Number(hour) % 24) + 24) % 24;
  }

  wakeFromNap() {
    if (!this.idleActivity.isNapping) return false;
    this.idleActivity.isNapping = false;
    this.idleActivity.kind = "breathe";
    this.idleActivity.heldOverride = "";
    this.idleActivity.until = this.t + 3;
    this.lastActivity = this.t;
    this.setMood("relieved", { source: "smart", strength: 0.75 });
    this.gestures.push("wake_up", { priority: PRIORITY.reaction, now: this.now });
    this.onSound?.("sigh");
    return true;
  }

  setSeat(seat) {
    if (SEATS[seat]) this.seat = seat;
  }

  // x, y in -1..1 (the viewer's right and up), or null when no face is seen
  setFace(face) {
    this.face = face ? { x: clamp(face.x, -1, 1), y: clamp(face.y, -1, 1) } : null;
  }

  // The mouse or a finger, relative to the robot (-1..1, +x the viewer's right,
  // +y up), or null when it has left. Its eyes and head follow it for a while.
  setPointer(pointer) {
    this.pointer = pointer ? { x: clamp(pointer.x, -1, 1), y: clamp(pointer.y, -1, 1), at: this.t } : null;
  }

  // Drag the robot around the room within stage bounds; when released it floats back
  drag(x = 0, z = 0, active = true) {
    if (!active) {
      if (this.dragState.active) {
        this.dragState.active = false;
        this.onSound?.("servo");
      }
      return;
    }
    this.wakeFromNap();
    this.lastActivity = this.t;
    this.dragState.active = true;
    this.dragState.x = clamp(Number(x) || 0, -0.5, 0.5);
    this.dragState.z = clamp(Number(z) || 0, -0.38, 0.38);
  }

  // Move to a named spot or explicit room coordinate (-0.48..0.48, -0.38..0.38)
  goTo({ target = "center", x = null, z = null, duration = 6 } = {}) {
    this.wakeFromNap();
    this.lastActivity = this.t;
    const spot = ROOM_SPOTS[target] || ROOM_SPOTS.center;
    const tx = x != null && Number.isFinite(Number(x)) ? clamp(Number(x), -0.48, 0.48) : spot[0];
    const tz = z != null && Number.isFinite(Number(z)) ? clamp(Number(z), -0.38, 0.38) : spot[1];
    this.moveTarget = { target, x: tx, z: tz, until: this.t + clamp(Number(duration) || 6, 1, 30) };
    this.onSound?.("servo");
    return this.moveTarget;
  }

  // Look toward a named target or explicit gaze coordinate (-1..1)
  lookAt({ target = "user", x = null, y = null, duration = 5 } = {}) {
    this.wakeFromNap();
    this.lastActivity = this.t;
    const base = target === "user" ? SEATS[this.seat] : GAZE[target] || GAZE.audience;
    const lx = x != null && Number.isFinite(Number(x)) ? clamp(Number(x), -1, 1) : base[0];
    const ly = y != null && Number.isFinite(Number(y)) ? clamp(Number(y), -1, 1) : base[1];
    this.lookTarget = { target, x: lx, y: ly, until: this.t + clamp(Number(duration) || 5, 1, 25) };
    return this.lookTarget;
  }

  // Interact with a room prop (by AI tool, idle behavior, or user request)
  useProp({ prop = "", action = "toggle", source = "tool" } = {}) {
    if (!prop) return false;
    this.wakeFromNap();
    this.lastActivity = this.t;
    this.lastPropUse = { prop: String(prop), action: String(action || "toggle"), source, at: this.t };
    const key = String(prop).toLowerCase();
    if (GAZE[key]) this.lookAt({ target: key, duration: 4 });
    else if (ROOM_SPOTS[key]) {
      const [sx] = ROOM_SPOTS[key];
      this.lookAt({ x: clamp(sx * 1.6, -0.85, 0.85), y: -0.15, duration: 4 });
    }
    if (!this.gestures.busy) {
      const g = key.includes("left") || key.includes("plant") || key.includes("book") ? "point_left" : "point_right";
      this.gestures.push(g, { priority: source === "idle" ? PRIORITY.idle : PRIORITY.tool, now: this.now });
    }
    this.onSound?.("blip");
    this.onUseProp?.(this.lastPropUse);
    return true;
  }

  // Someone touches the robot. kind: "hover" | "tap" | "hold" | "pat"; x: where on it
  // (-1 left .. 1 right), zone: "" | "head" | "cheek" | "arm" | "belly".
  // Taps escalate: a start, a laugh, then a victory spin (or zone-specific reactions).
  poke(kind = "tap", { x = 0, y = 0, zone = "" } = {}) {
    const k = this.pokes;
    if (this.idleActivity.isNapping && kind !== "hover") {
      this.wakeFromNap();
      return true;
    }
    if (kind === "hover") {
      if (this.t - k.hover < 6 || this.gestures.busy || this.state === "thinking") return false;
      k.hover = this.t;
      this.setMood("curious", { source: "tool", strength: 0.6 });
      this.springs.impulse("finL", 2);
      this.springs.impulse("finR", 2);
      return true;
    }
    this.lastActivity = this.t;
    this.moods.clear(); // a poke is answered at once, whatever mood it was in
    if (kind === "hold") {
      this.setMood("affectionate", { source: "tool", strength: 0.9 });
      this.gestures.push("lean_in", { priority: PRIORITY.tool, now: this.now });
      this.onSound?.("sigh");
      return true;
    }
    k.count = this.t - k.last < 5 ? k.count + 1 : 1;
    k.last = this.t;
    const rm = this.options.reducedMotion;
    const reactMul = clamp((this.behaviors.reactionStrength ?? 0.6) / 0.6, 0.4, 1.6);
    const push = (this.options.roam > 0 && !rm ? 1 : 0.25) * reactMul;

    if (zone === "head" || kind === "pat") {
      const zc = (k.zoneCounts.head = this.t - (k.zoneCounts.headAt || -100) < 6 ? (k.zoneCounts.head || 0) + 1 : 1);
      k.zoneCounts.headAt = this.t;
      this.springs.impulse("squash", 0.55 * reactMul);
      this.springs.impulse("blush", 1.2);
      this.springs.impulse("eyeHearts", zc >= 3 ? 2.2 : 0.8);
      const headSteps = [
        ["happy", "nod"],
        ["affectionate", "shy"],
        ["love", "hug"],
      ];
      const [mood, gesture] = headSteps[Math.min(zc, 3) - 1];
      this.setMood(mood, { source: "tool", strength: 0.95 });
      this.gestures.push(gesture, { priority: PRIORITY.tool, now: this.now });
      this.onSound?.("chime");
      return true;
    }

    if (zone === "cheek") {
      const zc = (k.zoneCounts.cheek = this.t - (k.zoneCounts.cheekAt || -100) < 6 ? (k.zoneCounts.cheek || 0) + 1 : 1);
      k.zoneCounts.cheekAt = this.t;
      this.springs.impulse("headYaw", -clamp(x || 0.5, -1, 1) * 0.9 * reactMul);
      this.springs.impulse("blush", 1.8);
      this.springs.impulse("cheekLight", 2.4);
      const cheekSteps = [
        ["surprised", "wink"],
        ["embarrassed", "shy"],
        ["mischievous", "blow_kiss"],
        ["laughing", "dizzy"],
      ];
      const [mood, gesture] = cheekSteps[Math.min(zc, 4) - 1];
      this.setMood(mood, { source: "tool", strength: 0.9 });
      this.gestures.push(gesture, { priority: PRIORITY.tool, now: this.now });
      this.onSound?.("blip");
      return true;
    }

    if (zone === "arm") {
      const zc = (k.zoneCounts.arm = this.t - (k.zoneCounts.armAt || -100) < 6 ? (k.zoneCounts.arm || 0) + 1 : 1);
      k.zoneCounts.armAt = this.t;
      this.springs.impulse(x < 0 ? "armLRaise" : "armRRaise", 1.8 * reactMul);
      const armSteps = [
        ["happy", "high_five"],
        ["excited", "fist_pump"],
        ["proud", "flex"],
        ["excited", "clap"],
      ];
      const [mood, gesture] = armSteps[Math.min(zc, 4) - 1];
      this.setMood(mood, { source: "tool", strength: 0.9 });
      this.gestures.push(gesture, { priority: PRIORITY.tool, now: this.now });
      this.onSound?.("chime");
      return true;
    }

    if (zone === "belly") {
      const zc = (k.zoneCounts.belly = this.t - (k.zoneCounts.bellyAt || -100) < 6 ? (k.zoneCounts.belly || 0) + 1 : 1);
      k.zoneCounts.bellyAt = this.t;
      this.springs.impulse("squash", 0.9 * reactMul);
      this.springs.impulse("posZ", -0.5 * push);
      const bellySteps = [
        ["surprised", "hiccup"],
        ["playful", "bounce"],
        ["laughing", "shiver"],
        ["laughing_hard", "dance_groove"],
      ];
      const [mood, gesture] = bellySteps[Math.min(zc, 4) - 1];
      this.setMood(mood, { source: "tool", strength: 0.95 });
      this.gestures.push(gesture, { priority: PRIORITY.tool, now: this.now });
      this.onSound?.("giggle");
      return true;
    }

    this.springs.impulse("posX", -clamp(x, -1, 1) * 1.1 * push);
    this.springs.impulse("posZ", -0.8 * push);
    this.springs.impulse("squash", 0.7);
    this.springs.impulse("eyeH", -2);
    this.springs.impulse("finL", 3);
    this.springs.impulse("finR", 3);
    const steps = [
      ["surprised", "double_take"],
      ["happy", "bounce"],
      ["laughing", "bounce"],
    ];
    const [mood, gesture] = steps[Math.min(k.count, 4) - 1] || ["excited", "celebrate"];
    this.setMood(mood, { source: "tool", strength: 0.9 });
    this.gestures.push(gesture, { priority: PRIORITY.tool, now: this.now });
    this.onSound?.(k.count >= 3 ? "giggle" : "blip");
    return true;
  }

  // The AI's voice this frame: four band levels 0..1 (see bands.mjs)
  setAudio(bands) {
    this.audio.bands = bands;
    this.audio.at = this.t;
  }

  // Your voice this frame, 0..1. Only call it when it can't be the AI's echo.
  setUser(level) {
    this.user.level = level;
    this.user.at = this.t;
  }

  // source: "caption" | "smart" | "tool"
  setMood(mood, { source = "caption", strength = 0.6 } = {}) {
    if (!MOODS.includes(mood)) return false;
    this.lastActivity = this.t;
    const expr = clamp((this.behaviors.expressiveness ?? 0.6) / 0.6, 0.35, 1.5);
    const scaled = source === "tool" ? strength : clamp(strength * expr, 0.1, 1);
    return this.moods.request(mood, { source, strength: scaled, now: this.now });
  }

  gesture(name, { priority = PRIORITY.caption } = {}) {
    if (!GESTURE_DEFS[name]) return false;
    this.lastActivity = this.t;
    return this.gestures.push(name, { priority, now: this.now });
  }

  // Drops waiting gestures; the one playing eases out (a spin finishes its turn)
  cancelGestures() {
    const current = this.gestures.current;
    if (current && GESTURE_DEFS[current.name]?.spin) this.gestures.queue = [];
    else this.gestures.clear(this.now);
  }

  // ---------- One frame ----------
  update(dt) {
    dt = Math.min(Math.max(Number(dt) || 0, 0), 0.1);
    this.t += dt;
    const now = this.now;
    const rm = this.options.reducedMotion;
    const state = STATES[this.state] || STATES.idle;
    const mood = this.moods.current(now);

    const o = this.offsets;
    for (const k in o) o[k] = 0;

    // 1-3: state and mood as targets, idle life on top
    const m = this.mixer.begin();
    m.blend(state.pose, 1);
    m.blend(MOOD_POSES[mood], state.moodWeight);
    this.idle(o, dt, mood);
    this.stepIdleActivity(o, dt, mood);
    this.roam(o);
    this.maybeIdleGesture(mood);

    // 4: the gesture playing now
    const g = this.gestures.update(now);
    let spin = 0;
    if (g) {
      const go = this.gestureOffsets;
      for (const k in go) go[k] = 0;
      const def = GESTURE_DEFS[g.name];
      def.offsets(g.t, go, rm);
      m.add(go, g.weight);
      if (def.spin) spin = def.spin(g.t, rm);
    }

    // 6: attention; and reacting to you while you talk
    this.gaze(o, state.gaze);
    this.listen(o, dt);
    m.add(o, 1);

    // 5: the AI's voice shapes the mouth over whatever the mood wants
    const speaking = this.voice(m.out, dt);

    const v = this.springs.step(m.out, dt);
    const p = this.pose;
    for (const k in v) p[k] = v[k];
    // Travelling shows in the body: it banks into a sideways move, leans into
    // a forward one, and its glow brightens with speed
    const vx = this.springs.state.posX.v;
    const vz = this.springs.state.posZ.v;
    const rm2 = rm ? 0.3 : 1;
    p.bodyRoll -= clamp(vx * 0.9, -0.2, 0.2) * rm2;
    p.headRoll += clamp(vx * 0.5, -0.12, 0.12) * rm2;
    p.bodyYaw += clamp(vx * 0.55, -0.15, 0.15) * rm2;
    p.bodyPitch += clamp(vz * 0.6, -0.15, 0.15) * rm2;
    p.speed = Math.hypot(vx, vz);
    p.ringGlow += Math.min(0.5, p.speed * 1.2);
    p.blink = this.blink(dt, mood);
    p.spin = spin;
    this.chasePhase += dt * (this.options.cameraFriendly ? 2.4 : 3.6);
    p.chasePhase = this.chasePhase;
    p.mouthVisible = this.options.mouth ? 1 : 0;
    p.speaking = speaking;
    p.userTalking = this.userTalking;
    p.mood = mood;
    p.gesture = g ? g.name : "";
    p.viseme = this.shape?.viseme || "rest";
    p.idleKind = this.idleActivity.isNapping ? "nap" : this.idleActivity.kind;
    p.heldOverride = this.idleActivity.heldOverride || "";
    p.t = this.t;
    return p;
  }

  // Hover, sway, breathing and shimmer; faster when excited, slower asleep
  idle(o, dt, mood) {
    const t = this.t;
    const body = this.options.reducedMotion ? 0.3 : 1;
    const energyMul = clamp(0.6 + (this.behaviors.energy ?? 0.5) * 0.8, 0.4, 1.5);
    const sleepy = mood === "sleepy" || this.state === "standby" || this.idleActivity.isNapping;
    this.bobPhase += dt * TAU * (sleepy ? 0.2 : mood === "excited" ? 0.5 : 0.33 * energyMul);
    this.breathPhase += dt * TAU * (sleepy ? 0.15 : 0.25 * energyMul);
    o.hoverY += Math.sin(this.bobPhase) * 0.016 * body;
    o.ringGlow += Math.sin(this.bobPhase + 1.2) * 0.08; // the ring brightens as it dips
    o.bodyRoll += noise1(t * 0.35, 1) * 0.025 * body;
    o.bodyYaw += noise1(t * 0.22, 2) * 0.035 * body;
    o.headRoll += noise1(t * 0.3, 3) * 0.025 * body;
    o.headYaw += noise1(t * 0.27, 4) * 0.03 * body;
    o.headPitch += noise1(t * 0.25, 5) * 0.02 * body;
    o.squash += Math.sin(this.breathPhase) * (sleepy ? 0.014 : 0.008);
    const shimmer = this.options.cameraFriendly ? 0.03 : 0.06;
    o.finGlowL += noise1(t * 1.3, 6) * shimmer;
    o.finGlowR += noise1(t * 1.3, 7) * shimmer;
    o.finL += noise1(t * 0.5, 8) * 0.05 * body;
    o.finR += noise1(t * 0.5, 9) * 0.05 * body;

    if (mood === "laughing" || mood === "laughing_hard") {
      const k = 0.5 + 0.5 * Math.sin(t * TAU * (mood === "laughing_hard" ? 5.2 : 4.2));
      const amp = mood === "laughing_hard" ? 1.4 : 1;
      o.hoverY += 0.012 * k * body * amp;
      o.headPitch -= 0.035 * k * amp;
      o.squash += 0.012 * k * amp;
      o.bodyRoll += 0.02 * Math.sin(t * TAU * 2.1) * body * amp;
    } else if (mood === "excited" || mood === "playful") {
      o.hoverY += 0.006 * Math.sin(t * TAU * 1.6) * body;
    } else if (mood === "happy" || mood === "affectionate" || mood === "love") {
      o.bodyRoll += 0.02 * Math.sin(t * TAU * 0.45) * body;
    } else if (mood === "dreamy") {
      o.bodyRoll += 0.03 * Math.sin(t * TAU * 0.28) * body;
      o.hoverY += 0.008 * Math.sin(t * TAU * 0.3) * body;
    }

    // Context-aware micro-reactions (gated off in filming / cameraFriendly mode)
    if (!this.options.cameraFriendly) {
      const inState = t - this.stateSince;
      // 1. Sleepy at night when idle
      const isNight = this.contextHour != null && (this.contextHour >= 23 || this.contextHour < 6);
      if (isNight && this.state === "idle" && t - this.lastActivity > 25) {
        o.eyeH -= 0.16;
        o.headPitch -= 0.04;
      }
      // 2. Tapping fingers while a reply is slow
      if (this.state === "waiting" && inState > 3.5) {
        const tap = Math.max(0, Math.sin(t * TAU * 3.2));
        o.armRRaise += 0.14 * tap * body;
        o.armLRaise += 0.08 * Math.max(0, Math.sin(t * TAU * 3.2 + Math.PI)) * body;
        o.foreheadLight += 0.35 * tap;
      }
      // 3. Pacing while thinking long
      if ((this.state === "thinking" || this.state === "busy") && inState > 5.0) {
        o.bodyYaw += Math.sin(t * 1.8) * 0.08 * body;
        o.foreheadLight += 0.45 + 0.35 * Math.sin(t * 5);
        if (this.options.roam > 0 && !this.options.reducedMotion) {
          o.posX += Math.sin(t * 1.1) * 0.08 * clamp(this.options.roam, 0, 1);
        }
      }
      // 4. Peeking while you type
      if (this.state === "typing" && inState > 1.2) {
        o.headPitch += 0.05 * Math.sin(t * 2.2) * body;
        o.pupilSize += 0.08;
      }
    }
  }

  // Weighted idle-behavior scheduler so the robot is never frozen when idle
  stepIdleActivity(o, dt, mood) {
    if (this.options.cameraFriendly) {
      this.idleActivity.kind = "breathe";
      this.idleActivity.heldOverride = "";
      return;
    }
    const act = this.idleActivity;
    const quiet = this.t - this.lastActivity;
    const isIdle = (this.state === "idle" || this.state === "listening" || this.state === "standby") &&
      this.t - this.audio.at > 2.5 &&
      this.userTalking <= 0 &&
      !this.gestures.busy;

    if (!isIdle) {
      if (act.isNapping && this.state !== "standby") this.wakeFromNap();
      act.kind = "breathe";
      act.heldOverride = "";
      return;
    }

    // Long idle -> nap (when enabled, default on after 95s quiet)
    const idleCfg = this.behaviors.idle;
    const napOn = !idleCfg?.nap || idleCfg.nap.on !== false;
    const napThreshold = 95 / clamp(idleCfg?.nap?.freq ?? 0.4, 0.15, 1);
    if (napOn && !act.isNapping && quiet > napThreshold) {
      act.isNapping = true;
      act.kind = "nap";
      act.heldOverride = "";
      this.moods.request("sleepy", { source: "smart", strength: 0.9, now: this.now });
    }

    if (act.isNapping) {
      const deep = Math.sin(this.t * 1.2);
      o.eyeH -= 0.42;
      o.headPitch -= 0.12 + 0.03 * deep;
      o.hoverY -= 0.04;
      o.squash += 0.015 * deep;
      return;
    }

    // Pick a new weighted idle activity when the timer expires
    if (this.t >= act.next && quiet > 12) {
      const b = this.behaviors;
      const wOf = (id, defWeight, trait = 0.5) => {
        const entry = idleCfg?.[id];
        if (entry && entry.on === false) return 0;
        const f = entry?.freq ?? defWeight;
        return Math.max(0, f * (0.5 + trait));
      };
      const candidates = [
        ["breathe", wOf("breathe", 0.8, 1 - (b.energy ?? 0.5))],
        ["lookAround", wOf("lookAround", 0.7, b.curiosity ?? 0.5)],
        ["inspectProp", wOf("inspectProp", 0.5, b.curiosity ?? 0.5)],
        ["stretch", wOf("stretch", 0.4, b.energy ?? 0.5)],
        ["yawn", wOf("yawn", 0.35, 1 - (b.energy ?? 0.5))],
        ["hum", wOf("hum", 0.45, b.playfulness ?? 0.5)],
        ["fidget", wOf("fidget", 0.5, b.clumsiness ?? 0.2)],
        ["tinker", wOf("tinker", 0.35, b.curiosity ?? 0.5)],
        ["readBook", wOf("readBook", 0.3, 1 - (b.energy ?? 0.5))],
        ["waterPlant", wOf("waterPlant", 0.25, b.curiosity ?? 0.5)],
        ["sipDrink", wOf("sipDrink", 0.3, 0.5)],
        ["checkTablet", wOf("checkTablet", 0.3, b.curiosity ?? 0.5)],
      ];
      let total = 0;
      for (const [, w] of candidates) total += w;
      let pick = "breathe";
      if (total > 0) {
        let r = this.idleRng() * total;
        for (const [id, w] of candidates) {
          r -= w;
          if (r <= 0) {
            pick = id;
            break;
          }
        }
      }
      act.kind = pick;
      const dur = pick === "readBook" || pick === "tinker" ? 6.5 : pick === "hum" ? 5 : 4;
      act.until = this.t + dur;
      const freqScale = clamp(1.3 - (b.energy ?? 0.5) * 0.6, 0.6, 1.5);
      act.next = this.t + dur + (6 + this.idleRng() * 8) * freqScale;
      act.heldOverride =
        pick === "readBook" ? "book" : pick === "sipDrink" ? "mug" : pick === "checkTablet" ? "tablet" : pick === "tinker" ? "wrench" : "";

      if (pick === "stretch") this.gestures.push("stretch", { priority: PRIORITY.idle, now: this.now });
      else if (pick === "yawn") this.gestures.push("yawn", { priority: PRIORITY.idle, now: this.now });
      else if (pick === "lookAround") this.gestures.push("look_around", { priority: PRIORITY.idle, now: this.now });
      else if (pick === "inspectProp") {
        const props = ["plant", "window", "clock", "bookshelf", "lamp"];
        const target = props[Math.floor(this.idleRng() * props.length)];
        this.lookAt({ target, duration: 3.8 });
      } else if (pick === "waterPlant") {
        this.useProp({ prop: "plant", action: "water", source: "idle" });
      } else if (pick === "hum") {
        this.onSound?.("hum");
      }
    }

    if (this.t > act.until) {
      act.kind = "breathe";
      act.heldOverride = "";
      return;
    }

    const body = this.options.reducedMotion ? 0.35 : 1;
    const phase = this.t * TAU;
    switch (act.kind) {
      case "hum":
        o.bodyRoll += Math.sin(phase * 0.8) * 0.05 * body;
        o.headPitch += Math.sin(phase * 1.6) * 0.03 * body;
        o.cheekLight += 0.35 + 0.25 * Math.sin(phase * 1.6);
        o.mouthCurve += 0.25;
        break;
      case "fidget":
        o.armLRaise += (0.12 + 0.1 * Math.sin(phase * 1.9)) * body;
        o.armRRaise += (0.12 + 0.1 * Math.cos(phase * 2.1)) * body;
        o.finL += 0.12 * Math.sin(phase * 2.5) * body;
        o.finR -= 0.12 * Math.sin(phase * 2.5) * body;
        break;
      case "tinker":
        o.armLRaise += 0.45 * body;
        o.armRRaise += 0.48 * body;
        o.armLSpread -= 0.22 * body;
        o.armRSpread -= 0.22 * body;
        o.headPitch -= 0.14 * body;
        o.foreheadLight += 0.4 + 0.3 * Math.sin(phase * 3);
        break;
      case "readBook":
        o.armLRaise += 0.42 * body;
        o.armRRaise += 0.42 * body;
        o.armLSpread -= 0.18 * body;
        o.armRSpread -= 0.18 * body;
        o.headPitch -= 0.16 * body;
        o.lookY -= 0.35;
        o.lookX += Math.sin(this.t * 1.4) * 0.18;
        break;
      case "sipDrink": {
        const sip = Math.max(0, Math.sin((this.t - (act.until - 4)) * Math.PI * 0.5));
        o.armRRaise += (0.35 + 0.45 * sip) * body;
        o.armRSpread -= 0.18 * sip * body;
        o.headPitch += 0.08 * sip * body;
        o.mouthRound += 0.35 * sip;
        break;
      }
      case "checkTablet":
        o.armLRaise += 0.46 * body;
        o.armLSpread -= 0.16 * body;
        o.headPitch -= 0.14 * body;
        o.headYaw -= 0.1 * body;
        o.lookY -= 0.3;
        o.foreheadLight += 0.35;
        break;
      case "inspectProp":
        o.headRoll += 0.08 * body;
        o.pupilSize += 0.12;
        break;
    }
  }

  // Where it goes in the room. It keeps to a small stage (about +-0.4 m
  // sideways, a little nearer or further), choosing a new spot every few
  // seconds, and the state decides where: closer and turned to you while you
  // talk, back and to the side while it thinks, drifting about while it talks.
  roam(o) {
    if (this.dragState.active) {
      o.posX += this.dragState.x;
      o.posZ += this.dragState.z;
      return;
    }
    if (this.moveTarget) {
      if (this.t <= this.moveTarget.until && !this.options.reducedMotion) {
        o.posX += this.moveTarget.x;
        o.posZ += this.moveTarget.z;
        return;
      }
      this.moveTarget = null;
    }
    const amount = this.options.reducedMotion ? 0 : clamp(this.options.roam || 0, 0, 1);
    if (amount <= 0) return;
    const w = this.wander;
    const state = this.state;
    if (this.t >= w.next || w.state !== state) {
      w.state = state;
      w.side = -w.side;
      const r = this.random;
      const near = state === "listening" || state === "hearing";
      if (state === "connecting") {
        w.x = 0;
        w.z = -0.3;
        w.next = this.t + 2;
      } else if (near) {
        w.x = SEATS[this.seat][0] * 0.14 + (r() - 0.5) * 0.12;
        w.z = state === "hearing" ? 0.3 : 0.2;
        w.next = this.t + 3 + r() * 3;
      } else if (state === "thinking" || state === "waiting" || state === "busy") {
        w.x = w.side * (0.2 + r() * 0.2);
        w.z = -0.22;
        w.next = this.t + 2.2 + r() * 1.6;
      } else if (state === "speaking" || state === "streaming") {
        w.x = w.side * (0.12 + r() * 0.3);
        w.z = -0.04 + r() * 0.24;
        w.next = this.t + 3.5 + r() * 3;
      } else if (state === "standby") {
        w.x = 0;
        w.z = -0.18;
        w.next = this.t + 8;
      } else {
        w.x = w.side * (0.1 + r() * 0.3);
        w.z = -0.12 + r() * 0.22;
        w.next = this.t + 6 + r() * 4;
      }
    }
    // When you move in front of the camera, it keeps its eyes (and a little of itself) on you
    const follow = this.face && (state === "listening" || state === "hearing") ? this.face.x * 0.12 : 0;
    o.posX += clamp((w.x + follow) * amount, -0.46, 0.46);
    o.posZ += clamp(w.z * amount + 0.05 * clamp(this.springs.value.emphasis || 0, 0, 2) * amount, -0.36, 0.36);
  }

  // Now and then, when nothing else is going on: a yawn, a tilt, a look around
  maybeIdleGesture(mood) {
    if (this.t < this.nextIdleGesture) return;
    this.nextIdleGesture = this.t + 8 + this.random() * 8;
    if (this.gestures.busy || this.t - this.audio.at < 2 || this.userTalking > 0) return;
    const quiet = this.t - this.lastActivity;
    let name = null;
    if (mood === "sleepy" || this.state === "standby") name = "yawn";
    else if (mood === "curious") name = "tilt";
    else if (mood === "excited") name = "bounce";
    else if ((this.state === "listening" || this.state === "idle") && quiet > 20) name = this.random() < 0.5 ? "look_around" : "tilt";
    if (name) this.gestures.push(name, { priority: PRIORITY.idle, now: this.now });
  }

  // Looks where the state says, with small quick glances around that point
  gaze(o, mode) {
    let [x, y] = GAZE[mode] || GAZE.audience;
    if (mode === "user") [x, y] = this.face ? [this.face.x, this.face.y] : SEATS[this.seat];
    if (this.lookTarget) {
      if (this.t <= this.lookTarget.until) [x, y] = [this.lookTarget.x, this.lookTarget.y];
      else this.lookTarget = null;
    }
    // Your mouse (or finger) wins for a few seconds after it moves, unless the webcam sees you or eyesFollowCursor is off
    const ptr = this.options.eyesFollowCursor !== false ? this.pointer : null;
    if (ptr && !this.face && !this.lookTarget && this.t - ptr.at < 5 && (mode === "audience" || mode === "user")) [x, y] = [ptr.x, ptr.y];
    // Talking to the audience: straight out, but the eyes still find your face
    let eyesOnly = null;
    if (mode === "audience" && this.face && !this.lookTarget) eyesOnly = [this.face.x * 0.5, this.face.y * 0.5];

    const body = this.options.reducedMotion ? 0.5 : 1;
    o.headYaw += x * 0.42 * body;
    o.headPitch += -y * 0.22 * body;
    o.bodyYaw += x * 0.15 * body;

    const s = this.saccade;
    if (this.t >= s.next) {
      const scanning = this.state === "thinking" || this.state === "waiting" || this.state === "busy";
      if (scanning) {
        s.x = (this.random() - 0.5) * 0.9;
        s.y = this.random() * 0.25;
        s.next = this.t + 0.45 + this.random() * 0.6;
      } else {
        const r = this.state === "speaking" ? 0.08 : 0.14;
        s.x = (this.random() - 0.5) * 2 * r;
        s.y = (this.random() - 0.5) * r;
        s.next = this.t + 1.2 + this.random() * 2.8;
      }
    }
    const [ex, ey] = eyesOnly || [x, y];
    o.lookX += ex * 0.55 + s.x;
    o.lookY += ey * 0.5 + s.y;
    o.pupilX += clamp(ex * 0.7 + s.x * 1.2, -1, 1);
    o.pupilY += clamp(ey * 0.7 + s.y * 1.2, -1, 1);
  }

  // You're talking: it leans in, its eyes follow your voice, its fins take
  // your color, and when you pause it gives a small "mm-hm" nod
  listen(o, dt) {
    const level = this.t - this.user.at < 0.3 ? this.user.level : 0;
    const talking = level > 0.12;
    const tk = this.talk;
    if (talking) {
      if (tk.since < 0) tk.since = this.t;
      tk.quietSince = -1;
      this.lastActivity = this.t;
      if (this.idleActivity.isNapping) this.wakeFromNap();
    } else if (tk.since >= 0) {
      if (tk.quietSince < 0) tk.quietSince = this.t;
      const talkedFor = tk.quietSince - tk.since;
      const quietFor = this.t - tk.quietSince;
      if (talkedFor > 0.8 && quietFor > 0.35 && this.t - tk.lastNod > 2.4) {
        this.gestures.push("mmhm", { priority: PRIORITY.idle, now: this.now });
        tk.lastNod = this.t;
        tk.since = -1;
      } else if (quietFor > 1.2) {
        tk.since = -1;
      }
    }
    this.userTalking = talking ? 1 : Math.max(0, this.userTalking - dt / 0.6);
    const k = this.userTalking;
    const body = this.options.reducedMotion ? 0.4 : 1;
    o.finUser += k;
    o.bodyPitch += 0.07 * k * body;
    o.hoverZ += 0.04 * k * body;
    o.eyeW += 0.05 * level;
    o.eyeH += 0.1 * level;
    o.pupilSize += 0.12 * level;
    o.finL += 0.2 * level;
    o.finR += 0.2 * level;
  }

  // The mouth follows the voice: open with loudness, shaped by the vowels;
  // each syllable squashes the eyes a touch and nods the head. Returns loudness.
  voice(target, dt) {
    const bands = this.t - this.audio.at < 0.3 ? this.audio.bands : SILENT;
    const shape = voiceShape(bands, (this.shape ||= {}));
    const e = shape.energy;
    const w = clamp(e * 4);
    const talkScale = clamp((this.behaviors.talkMotion ?? 0.5) / 0.5, 0.3, 1.6);
    if (w > 0) {
      // Speech opens the mouth wider than tall ("a", "e"); only clear "o" sounds round it
      target.mouthOpen = Math.max(target.mouthOpen * (1 - w * 0.6), shape.open * 0.8);
      target.mouthWide = lerp(target.mouthWide, 0.45 + 0.45 * shape.wide, w);
      target.mouthRound = lerp(target.mouthRound, shape.round, w * 0.6);
      target.mouthTeeth = lerp(target.mouthTeeth || 0, shape.teeth || 0, w * 0.8);
      target.mouthTongue = lerp(target.mouthTongue || 0, shape.tongue || 0, w * 0.8);
      target.finGlowL += 0.45 * bands[0] + 0.3 * bands[1];
      target.finGlowR += 0.45 * bands[2] + 0.35 * bands[3];
      target.cheekLight = (target.cheekLight || 0) + 0.35 * e;
      target.glow += 0.06 * e;
      target.finUser *= 1 - w; // its own voice: its own color
      this.lastActivity = this.t;
    }
    if (this.syllables.update(e, dt)) {
      this.springs.impulse("eyeH", -(1.6 + 1.6 * e));
      this.springs.impulse("headPitch", ((this.options.reducedMotion ? 0.15 : 0.45) + 0.5 * e) * talkScale);
      this.springs.impulse("squash", (0.3 + 0.3 * e) * talkScale);
    }
    // Clearly louder than lately: emphasis (the camera may push in)
    this.emphasisAvg += (e - this.emphasisAvg) * (1 - Math.exp(-dt / 2.5));
    if (e > 0.5 && e > this.emphasisAvg * 1.7 && this.t - this.lastEmphasis > 4) {
      this.springs.impulse("emphasis", 2.8 * talkScale);
      this.lastEmphasis = this.t;
    }
    return e;
  }

  // Random blinks, sometimes two in a row; adjustable rate and style
  blink(dt, mood) {
    const b = this.blinkState;
    const style = this.faceConfig.blinkStyle || "normal";
    const rate = clamp(this.faceConfig.blinkRate || 1, 0.2, 2.5);
    const sleepy = mood === "sleepy" || this.state === "standby" || style === "slow";
    if (b.start < 0 && this.t >= b.next) {
      b.start = this.t;
      b.length = sleepy ? 0.38 : style === "crisp" ? 0.1 : style === "flutter" ? 0.12 : 0.15;
    }
    if (b.start < 0) return 0;
    const p = (this.t - b.start) / b.length;
    if (p >= 1) {
      b.start = -1;
      const doubleChance = style === "flutter" ? 0.42 : 0.14;
      if (!b.double && this.random() < doubleChance) {
        b.double = true;
        b.next = this.t + 0.09;
      } else {
        b.double = false;
        const interval = sleepy ? 1.6 + this.random() * 2 : 2.2 + this.random() * 4.2;
        b.next = this.t + interval / rate;
      }
      return 0;
    }
    return clamp(p < 0.4 ? p / 0.4 : p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45);
  }
}
