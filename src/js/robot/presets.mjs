// ---------- What the robot's moods, states and gestures look like ----------
// Pure data and small curves (no DOM, no three.js). A pose is a flat object of
// numbers ("channels"); the animator eases toward it with springs, then the
// 3D model and the face screen turn it into shapes.
//
// Directions: +x is the viewer's right, +y is up, +z is toward the camera.
// The robot faces the camera, so its right arm (Arm_R) is on the viewer's left.
import { bump, hold, smoothstep } from "./spring.mjs";

export const MOODS = [
  "neutral", "happy", "excited", "laughing", "curious", "thinking", "focused",
  "surprised", "confused", "skeptical", "sad", "affectionate", "proud", "sleepy",
  "love", "embarrassed", "mischievous", "bored", "determined", "dreamy", "grumpy",
  "startled", "relieved", "smug", "worried", "laughing_hard", "winking", "inspired",
  "playful", "shy_smile",
];

export const GESTURES = [
  "nod", "head_shake", "tilt", "wave", "shrug", "bounce", "celebrate", "look_around",
  "lean_in", "point_left", "point_right", "double_take", "shy",
  "wink", "blow_kiss", "facepalm", "clap", "thumbs_up", "fist_pump",
  "dance_groove", "dance_spin", "dance_robot", "shiver", "stretch", "yawn",
  "sneeze", "hiccup", "hug", "high_five", "bow", "salute", "big_shrug",
  "chin_on_hand", "scratch_head", "big_wave", "royal_wave", "peek", "hide",
  "dizzy", "whistle", "drum_roll", "flex",
];

// Every channel: [neutral value, spring stiffness]. Face channels are in the
// face screen's own units (see face.js), angles in radians, distances in
// meters (the robot is about 1.2 m tall in its own world).
export const CHANNELS = {
  // Eyes
  eyeW: [1, 14], // size (1 = the eye style's size)
  eyeH: [1, 14],
  eyeRound: [0, 10], // 0 = the style's shape, 1 = fully round
  eyeScaleL: [1, 12], // one eye bigger than the other
  eyeScaleR: [1, 12],
  eyeY: [0, 10], // both eyes up (+) or down (-)
  lookX: [0, 30], // where the eyes look, -1..1
  lookY: [0, 30],
  pupilSize: [1, 14], // pupil scale (1 = normal, >1 dilated, <1 pinpoint)
  pupilX: [0, 32], // fine pupil offset inside the eye
  pupilY: [0, 32],
  lidTopL: [0.06, 16], // upper lids, 0 open .. 1 closed
  lidTopR: [0.06, 16],
  lidAngleL: [0, 12], // + inner corner lower (focused), - inner corner higher (sad)
  lidAngleR: [0, 12],
  lidBotL: [0.04, 14], // lower lids rising
  lidBotR: [0.04, 14],
  smile: [0, 12], // eyes turning into smiling crescents
  blush: [0, 6],
  glow: [1, 8], // screen brightness
  // Eye effects (0..1, cleanly blended in face.js)
  eyeHearts: [0, 12],
  eyeStars: [0, 12],
  eyeSpirals: [0, 12],
  eyeTears: [0, 8],
  eyeSparkles: [0, 14],
  // Mouth
  mouthOpen: [0, 26],
  mouthWide: [0.5, 16],
  mouthRound: [0, 16],
  mouthCurve: [0.22, 10], // -1 frown .. 1 smile
  mouthSkew: [0, 10], // lopsided, -1..1
  mouthTeeth: [0, 18], // upper teeth highlight
  mouthTongue: [0, 18], // inner tongue warmth
  // Body
  hoverY: [0, 8],
  hoverZ: [0, 6],
  posX: [0, 2.2], // travels through the room: sideways (+ the viewer's right)...
  posZ: [0, 2], // ...and toward (+) or away from the camera; slow, so it glides
  bodyPitch: [0, 7], // + leans toward the camera
  bodyRoll: [0, 7],
  bodyYaw: [0, 5],
  squash: [0, 14], // + stretches tall, - squashes
  headPitch: [0, 10], // + looks down (a nod)
  headYaw: [0, 8], // + turns to the viewer's right
  headRoll: [0, 8], // a head tilt
  armLRaise: [0.3, 9], // sideways and up, away from the body
  armLFwd: [0, 9], // forward and up
  armLIn: [0, 9], // swings in toward the middle (out when negative)
  armRRaise: [0.3, 9],
  armRFwd: [0, 9],
  armRIn: [0, 9],
  finL: [0, 12], // fins perk up (+) or droop (-)
  finR: [0, 12],
  finGlowL: [0.35, 18],
  finGlowR: [0.35, 18],
  finUser: [0, 8], // 1 = the fins glow in "your" color (you're talking)
  ringGlow: [0.6, 6],
  cheekLight: [0.25, 12], // physical cheek indicator LEDs
  foreheadLight: [0.3, 12], // physical forehead indicator LED
  chase: [0, 6], // a light running through the fins (thinking, busy)
  emphasis: [0, 3], // camera push-in
};

export const NEUTRAL = Object.fromEntries(Object.entries(CHANNELS).map(([k, [v]]) => [k, v]));

const both = (l, r = l) => ({ l, r });
const eyes = ({ top, bot, angle } = {}) => {
  const out = {};
  if (top) Object.assign(out, { lidTopL: top.l, lidTopR: top.r });
  if (bot) Object.assign(out, { lidBotL: bot.l, lidBotR: bot.r });
  if (angle) Object.assign(out, { lidAngleL: angle.l, lidAngleR: angle.r });
  return out;
};

// Each mood as the channels it changes; everything else stays neutral
export const MOOD_POSES = {
  neutral: {},
  happy: {
    smile: 0.55, ...eyes({ bot: both(0.2) }), mouthCurve: 0.85, mouthWide: 0.66, mouthOpen: 0.12,
    finL: 0.25, finR: 0.25, blush: 0.15, glow: 1.05, hoverY: 0.01, headRoll: 0.05,
    eyeSparkles: 0.25, cheekLight: 0.55,
  },
  excited: {
    eyeW: 1.12, eyeH: 1.16, ...eyes({ top: both(0), bot: both(0) }), mouthOpen: 0.36, mouthRound: 0.2,
    mouthCurve: 0.95, mouthWide: 0.7, finL: 0.6, finR: 0.6, finGlowL: 0.75, finGlowR: 0.75,
    squash: 0.035, glow: 1.15, hoverY: 0.02, ringGlow: 0.9, pupilSize: 1.25, eyeStars: 0.55,
    mouthTeeth: 0.5, cheekLight: 0.85, foreheadLight: 0.8,
  },
  laughing: {
    smile: 1, eyeH: 0.78, mouthOpen: 0.58, mouthCurve: 1, mouthWide: 0.82, mouthRound: 0,
    headPitch: -0.08, finL: 0.4, finR: 0.4, blush: 0.25, glow: 1.1, mouthTeeth: 0.65,
    mouthTongue: 0.4, cheekLight: 0.7,
  },
  curious: {
    eyeScaleL: 1.12, eyeScaleR: 0.94, ...eyes({ top: both(0, 0.08), bot: both(0) }), headRoll: 0.17,
    headPitch: -0.03, mouthOpen: 0.08, mouthRound: 0.65, mouthWide: 0.34, mouthCurve: 0.1,
    finL: 0.45, finR: 0.1, hoverZ: 0.03, bodyPitch: 0.04, pupilSize: 1.15, foreheadLight: 0.65,
  },
  thinking: {
    lookX: 0.45, lookY: 0.5, ...eyes({ top: both(0.22), bot: both(0.16) }), mouthSkew: 0.35,
    mouthWide: 0.34, mouthCurve: -0.02, headRoll: -0.07, headYaw: 0.1, headPitch: -0.07, chase: 1,
    foreheadLight: 0.9,
  },
  focused: {
    eyeH: 0.86, ...eyes({ top: both(0.3), bot: both(0.2), angle: both(0.12) }), mouthCurve: 0,
    mouthWide: 0.4, bodyPitch: 0.07, hoverZ: 0.03, headPitch: 0.04, finL: 0.15, finR: 0.15,
    pupilSize: 0.85, foreheadLight: 0.75,
  },
  surprised: {
    eyeW: 1.2, eyeH: 1.3, eyeRound: 1, ...eyes({ top: both(0), bot: both(0) }), mouthOpen: 0.46,
    mouthRound: 1, mouthWide: 0.3, mouthCurve: 0, finL: 0.75, finR: 0.75, squash: 0.06,
    headPitch: -0.06, bodyPitch: -0.06, glow: 1.12, pupilSize: 0.78, foreheadLight: 0.85,
  },
  confused: {
    eyeScaleL: 1.16, eyeScaleR: 0.84, ...eyes({ angle: both(-0.16, 0.2), top: both(0, 0.18) }),
    mouthCurve: -0.2, mouthSkew: -0.6, mouthWide: 0.4, headRoll: 0.22, finL: 0.35, finR: -0.25, glow: 0.92,
  },
  skeptical: {
    ...eyes({ top: both(0.46, 0.04), angle: both(0.12, 0), bot: both(0.12, 0.04) }), eyeScaleR: 1.05,
    mouthSkew: 0.8, mouthCurve: 0.3, mouthWide: 0.5, headRoll: -0.06, headYaw: 0.08, finL: -0.1, finR: 0.2,
  },
  sad: {
    ...eyes({ angle: both(-0.3), top: both(0.3) }), eyeH: 0.9, lookY: -0.25, mouthCurve: -0.75,
    mouthWide: 0.44, finL: -0.45, finR: -0.45, headPitch: 0.12, squash: -0.03, glow: 0.85,
    hoverY: -0.02, ringGlow: 0.4, finGlowL: 0.2, finGlowR: 0.2, eyeTears: 0.65, cheekLight: 0.1,
  },
  affectionate: {
    smile: 0.72, ...eyes({ top: both(0.18) }), blush: 0.8, mouthCurve: 0.72, mouthWide: 0.5,
    mouthOpen: 0.05, headRoll: 0.15, finL: 0.2, finR: 0.2, glow: 1.05, eyeSparkles: 0.45, cheekLight: 0.75,
  },
  proud: {
    ...eyes({ top: both(0.26) }), smile: 0.35, mouthCurve: 0.78, mouthWide: 0.6, headPitch: -0.1,
    bodyPitch: -0.05, finL: 0.5, finR: 0.5, squash: 0.03, glow: 1.08, eyeSparkles: 0.35, foreheadLight: 0.65,
  },
  sleepy: {
    ...eyes({ top: both(0.62), bot: both(0.2) }), eyeH: 0.86, lookY: -0.15, mouthCurve: 0.05,
    mouthWide: 0.36, headPitch: 0.1, headRoll: 0.08, finL: -0.35, finR: -0.35, glow: 0.72,
    hoverY: -0.015, ringGlow: 0.35, finGlowL: 0.18, finGlowR: 0.18, cheekLight: 0.1, foreheadLight: 0.12,
  },
  love: {
    eyeW: 1.14, eyeH: 1.14, smile: 0.45, blush: 0.95, eyeHearts: 0.95, eyeSparkles: 0.5,
    mouthCurve: 0.88, mouthWide: 0.56, mouthOpen: 0.14, headRoll: 0.18, finL: 0.45, finR: 0.45,
    finGlowL: 0.7, finGlowR: 0.7, cheekLight: 0.95, hoverY: 0.018, glow: 1.12,
  },
  embarrassed: {
    ...eyes({ top: both(0.32), bot: both(0.28), angle: both(-0.22) }), lookX: -0.35, lookY: -0.25,
    blush: 1, mouthCurve: -0.15, mouthSkew: 0.55, mouthWide: 0.34, headPitch: 0.16, headYaw: -0.18,
    headRoll: 0.12, finL: -0.35, finR: -0.35, armLFwd: 0.55, armRFwd: 0.55, armLIn: 0.35, armRIn: 0.35,
    cheekLight: 0.9, hoverY: -0.012,
  },
  mischievous: {
    ...eyes({ top: both(0.38, 0.22), bot: both(0.24, 0.16), angle: both(0.22, 0.18) }),
    mouthCurve: 0.75, mouthSkew: 0.65, mouthWide: 0.68, mouthTeeth: 0.45, headPitch: 0.06,
    headRoll: -0.12, finL: 0.45, finR: 0.2, cheekLight: 0.6, glow: 1.06,
  },
  bored: {
    ...eyes({ top: both(0.54), bot: both(0.05) }), eyeW: 1.04, lookX: 0.22, lookY: 0.12,
    mouthCurve: -0.12, mouthWide: 0.38, mouthSkew: -0.25, headRoll: -0.1, headPitch: 0.05,
    finL: -0.28, finR: -0.32, hoverY: -0.015, glow: 0.84, ringGlow: 0.42,
  },
  determined: {
    ...eyes({ top: both(0.32), bot: both(0.22), angle: both(0.26) }), eyeH: 0.88, pupilSize: 0.9,
    mouthCurve: 0.18, mouthWide: 0.46, bodyPitch: 0.09, hoverZ: 0.04, headPitch: 0.05,
    armLRaise: 0.52, armRRaise: 0.52, finL: 0.55, finR: 0.55, finGlowL: 0.68, finGlowR: 0.68,
    foreheadLight: 0.88, glow: 1.1,
  },
  dreamy: {
    ...eyes({ top: both(0.28), bot: both(0.22) }), smile: 0.42, lookX: 0.25, lookY: 0.35,
    blush: 0.55, eyeSparkles: 0.8, pupilSize: 1.2, mouthCurve: 0.58, mouthWide: 0.44, mouthOpen: 0.06,
    headRoll: 0.2, headPitch: -0.06, hoverY: 0.02, finL: 0.15, finR: 0.25, cheekLight: 0.65,
  },
  grumpy: {
    ...eyes({ top: both(0.42), bot: both(0.18), angle: both(0.32) }), eyeH: 0.82,
    mouthCurve: -0.68, mouthWide: 0.42, mouthSkew: 0.2, headPitch: 0.08, bodyPitch: 0.04,
    armLRaise: 0.45, armRRaise: 0.45, armLIn: 0.3, armRIn: 0.3, finL: -0.2, finR: -0.2, glow: 0.9,
  },
  startled: {
    eyeW: 1.28, eyeH: 1.34, eyeRound: 1, pupilSize: 0.62, ...eyes({ top: both(0), bot: both(0) }),
    mouthOpen: 0.52, mouthRound: 0.85, mouthWide: 0.38, mouthCurve: -0.35, squash: 0.08,
    hoverY: 0.035, bodyPitch: -0.09, armLRaise: 0.95, armRRaise: 0.95, finL: 0.85, finR: 0.85,
    foreheadLight: 0.95, glow: 1.18,
  },
  relieved: {
    ...eyes({ top: both(0.45), bot: both(0.25), angle: both(-0.14) }), smile: 0.62,
    mouthCurve: 0.52, mouthOpen: 0.18, mouthRound: 0.45, blush: 0.3, headPitch: 0.06,
    headRoll: 0.08, squash: -0.025, finL: 0.05, finR: 0.05, cheekLight: 0.5,
  },
  smug: {
    ...eyes({ top: both(0.44, 0.22), bot: both(0.24, 0.15), angle: both(0.08, -0.08) }),
    lookX: 0.2, mouthCurve: 0.62, mouthSkew: 0.78, mouthWide: 0.58, headPitch: -0.08,
    headYaw: -0.1, headRoll: -0.08, bodyPitch: -0.04, finL: 0.35, finR: 0.15,
  },
  worried: {
    ...eyes({ top: both(0.14), bot: both(0.12), angle: both(-0.34) }), eyeW: 1.06, eyeH: 1.08,
    lookY: -0.12, mouthCurve: -0.48, mouthWide: 0.38, mouthOpen: 0.1, headPitch: 0.07,
    headRoll: 0.09, finL: -0.38, finR: -0.38, armLFwd: 0.4, armRFwd: 0.4, armLIn: 0.25, armRIn: 0.25,
    eyeTears: 0.3,
  },
  laughing_hard: {
    smile: 1, eyeH: 0.68, ...eyes({ top: both(0.25), bot: both(0.35) }), eyeTears: 0.55,
    mouthOpen: 0.78, mouthCurve: 1, mouthWide: 0.92, mouthTeeth: 0.8, mouthTongue: 0.6,
    headPitch: -0.16, bodyPitch: -0.06, squash: 0.04, finL: 0.55, finR: 0.55, blush: 0.45,
    cheekLight: 0.85, glow: 1.15,
  },
  winking: {
    ...eyes({ top: both(0.04, 0.95), bot: both(0.16, 0.25) }), smile: 0.45, eyeSparkles: 0.4,
    mouthCurve: 0.78, mouthSkew: 0.35, mouthWide: 0.62, mouthOpen: 0.14, headRoll: 0.16,
    finL: 0.45, finR: 0.15, blush: 0.35, cheekLight: 0.65,
  },
  inspired: {
    eyeW: 1.16, eyeH: 1.2, ...eyes({ top: both(0), bot: both(0.1) }), eyeStars: 0.9,
    eyeSparkles: 0.65, pupilSize: 1.22, lookY: 0.2, mouthCurve: 0.72, mouthOpen: 0.24,
    mouthRound: 0.35, headPitch: -0.08, squash: 0.04, hoverY: 0.022, finL: 0.65, finR: 0.65,
    finGlowL: 0.85, finGlowR: 0.85, foreheadLight: 0.95, glow: 1.18,
  },
  playful: {
    smile: 0.52, eyeScaleL: 1.08, eyeScaleR: 0.96, ...eyes({ top: both(0.06, 0.18), bot: both(0.18) }),
    mouthCurve: 0.82, mouthSkew: 0.32, mouthWide: 0.66, mouthOpen: 0.26, mouthTongue: 0.65,
    headRoll: 0.16, bodyRoll: 0.04, finL: 0.48, finR: 0.32, blush: 0.3, eyeSparkles: 0.35,
  },
  shy_smile: {
    smile: 0.68, ...eyes({ top: both(0.26), bot: both(0.24), angle: both(-0.12) }),
    lookX: -0.22, lookY: -0.15, blush: 0.72, mouthCurve: 0.58, mouthWide: 0.42,
    headPitch: 0.1, headRoll: 0.14, finL: -0.08, finR: 0.12, cheekLight: 0.7,
  },
};

// States (voice mode and text chat). `mood` shows through at `moodWeight`
// (a thinking face is mostly about thinking); `gaze`: where it looks.
export const STATES = {
  idle: { pose: {}, moodWeight: 1, gaze: "audience" },
  connecting: { pose: { foreheadLight: 0.7, chase: 0.6 }, moodWeight: 0, gaze: "audience" },
  listening: { pose: { finL: 0.2, finR: 0.2, ...eyes({ top: both(0.02) }), hoverZ: 0.02, cheekLight: 0.45 }, moodWeight: 1, gaze: "user" },
  hearing: {
    pose: { finL: 0.3, finR: 0.3, ...eyes({ top: both(0) }), bodyPitch: 0.06, hoverZ: 0.05, eyeW: 1.04, eyeH: 1.06, pupilSize: 1.08, cheekLight: 0.65 },
    moodWeight: 0.8,
    gaze: "user",
  },
  thinking: { pose: MOOD_POSES.thinking, moodWeight: 0.25, gaze: "up" },
  speaking: { pose: { cheekLight: 0.55 }, moodWeight: 1, gaze: "audience" },
  standby: { pose: MOOD_POSES.sleepy, moodWeight: 0.15, gaze: "down" },
  error: {
    pose: { ...MOOD_POSES.confused, glow: 0.6, ringGlow: 0.3, finGlowL: 0.15, finGlowR: 0.15, foreheadLight: 0.15 },
    moodWeight: 0.1,
    gaze: "audience",
  },
  // Text chat
  typing: {
    pose: { lookX: -0.2, lookY: -0.6, headPitch: 0.14, headYaw: -0.1, eyeW: 1.05, finL: 0.25, finR: 0.3, ...MOOD_POSES.curious },
    moodWeight: 0.4,
    gaze: "composer",
  },
  waiting: { pose: MOOD_POSES.thinking, moodWeight: 0.25, gaze: "up" },
  streaming: { pose: { cheekLight: 0.5 }, moodWeight: 1, gaze: "audience" },
  busy: {
    pose: { ...eyes({ top: both(0.28), bot: both(0.16), angle: both(0.1) }), mouthWide: 0.35, chase: 1, lookX: 0.3, lookY: -0.1, foreheadLight: 0.85 },
    moodWeight: 0.3,
    gaze: "audience",
  },
};

// ---------- Gestures ----------
// offsets(t, o, rm): t runs 0..1 over the gesture; add the change to `o`;
// rm is true with reduced motion (big body moves shrink, faces stay).
// Every curve starts and ends at 0, so gestures blend in and out smoothly.
const add = (o, k, v) => (o[k] = (o[k] || 0) + v);

export const GESTURE_DEFS = {
  nod: {
    duration: 0.8,
    offsets(t, o) {
      add(o, "headPitch", 0.24 * bump(t, 0, 0.45) + 0.13 * bump(t, 0.4, 0.85));
      add(o, "bodyPitch", 0.03 * bump(t, 0, 0.6));
      add(o, "eyeH", -0.08 * bump(t, 0, 0.45));
      add(o, "smile", 0.15 * hold(t, 0, 1, 0.2));
    },
  },
  head_shake: {
    duration: 1,
    offsets(t, o) {
      const env = hold(t, 0, 1, 0.18);
      add(o, "headYaw", 0.26 * Math.sin(t * Math.PI * 5) * env);
      add(o, "lookX", -0.25 * Math.sin(t * Math.PI * 5 - 0.6) * env);
      add(o, "bodyYaw", 0.05 * Math.sin(t * Math.PI * 5) * env);
    },
  },
  tilt: {
    duration: 1.3,
    offsets(t, o) {
      const k = hold(t, 0.02, 0.9, 0.25);
      add(o, "headRoll", 0.32 * k);
      add(o, "eyeScaleL", 0.08 * k);
      add(o, "lookY", 0.1 * k);
      add(o, "finL", 0.25 * k);
      add(o, "finR", -0.1 * k);
    },
  },
  wave: {
    duration: 1.8,
    offsets(t, o, rm) {
      const up = hold(t, 0, 0.95, 0.2);
      add(o, "armRRaise", 2.2 * up + 0.38 * Math.sin((t - 0.15) * Math.PI * 5.2) * hold(t, 0.18, 0.82, 0.12));
      add(o, "armRFwd", 0.35 * up);
      add(o, "headRoll", 0.1 * up);
      add(o, "bodyRoll", (rm ? 0.02 : 0.05) * up);
      add(o, "smile", 0.5 * up);
      add(o, "mouthCurve", 0.35 * up);
      add(o, "finL", 0.2 * up);
      add(o, "finR", 0.3 * up);
      add(o, "hoverY", (rm ? 0.004 : 0.012) * bump(t, 0, 0.4));
    },
  },
  shrug: {
    duration: 1.2,
    offsets(t, o) {
      const s = hold(t, 0.05, 0.85, 0.22);
      for (const side of ["L", "R"]) {
        add(o, `arm${side}Raise`, 0.55 * s);
        add(o, `arm${side}Fwd`, 0.35 * s);
        add(o, `arm${side}In`, -0.5 * s);
      }
      add(o, "hoverY", 0.01 * s);
      add(o, "headPitch", -0.04 * s);
      add(o, "headRoll", 0.12 * s);
      add(o, "lidAngleL", -0.18 * s);
      add(o, "lidAngleR", -0.18 * s);
      add(o, "mouthCurve", -0.35 * s);
      add(o, "mouthSkew", 0.5 * s);
      add(o, "lookY", 0.15 * s);
    },
  },
  bounce: {
    duration: 0.9,
    offsets(t, o, rm) {
      add(o, "hoverY", (rm ? 0.035 : 0.1) * bump(t, 0.12, 0.72));
      add(o, "squash", -0.07 * bump(t, 0, 0.16) + 0.06 * bump(t, 0.14, 0.45) - 0.06 * bump(t, 0.66, 0.86));
      add(o, "armLRaise", 0.5 * bump(t, 0.1, 0.7));
      add(o, "armRRaise", 0.5 * bump(t, 0.1, 0.7));
      add(o, "finL", 0.35 * bump(t, 0.1, 0.75));
      add(o, "finR", 0.35 * bump(t, 0.1, 0.75));
      add(o, "smile", 0.35 * hold(t, 0, 1, 0.2));
    },
  },
  celebrate: {
    duration: 2.2,
    offsets(t, o, rm) {
      const k = hold(t, 0.05, 0.95, 0.18);
      add(o, "hoverY", (rm ? 0.03 : 0.09) * bump(t, 0.05, 0.9));
      add(o, "armLRaise", 2.4 * k);
      add(o, "armRRaise", 2.4 * k);
      add(o, "armLIn", 0.25 * Math.sin(t * Math.PI * 6) * k);
      add(o, "armRIn", -0.25 * Math.sin(t * Math.PI * 6) * k);
      add(o, "finL", 0.6 * k);
      add(o, "finR", 0.6 * k);
      add(o, "finGlowL", 0.6 * k);
      add(o, "finGlowR", 0.6 * k);
      add(o, "smile", 0.8 * k);
      add(o, "mouthOpen", 0.35 * k);
      add(o, "mouthCurve", 0.6 * k);
      add(o, "glow", 0.2 * k);
      add(o, "eyeSparkles", 0.7 * k);
    },
    spin: (t, rm) => (rm ? 0 : Math.PI * 2 * smoothstep(0.12, 0.78, t)),
  },
  look_around: {
    duration: 2.6,
    offsets(t, o, rm) {
      const left = hold(t, 0.05, 0.45, 0.12);
      const right = hold(t, 0.4, 0.85, 0.12);
      add(o, "headYaw", (rm ? 0.3 : 0.5) * (right - left));
      add(o, "lookX", 0.6 * (hold(t, 0.38, 0.82, 0.08) - hold(t, 0.02, 0.42, 0.08)));
      add(o, "bodyYaw", (rm ? 0.03 : 0.12) * (right - left));
      add(o, "finL", 0.2 * hold(t, 0, 1, 0.2));
      add(o, "finR", 0.2 * hold(t, 0, 1, 0.2));
      add(o, "eyeW", 0.05 * hold(t, 0, 1, 0.2));
    },
  },
  lean_in: {
    duration: 1.6,
    offsets(t, o, rm) {
      const l = hold(t, 0.02, 0.88, 0.25);
      add(o, "bodyPitch", (rm ? 0.08 : 0.2) * l);
      add(o, "hoverZ", (rm ? 0.03 : 0.1) * l);
      add(o, "headPitch", -0.12 * l);
      add(o, "eyeW", 0.08 * l);
      add(o, "eyeH", 0.1 * l);
      add(o, "lidTopL", -0.05 * l);
      add(o, "lidTopR", -0.05 * l);
      add(o, "finL", 0.3 * l);
      add(o, "finR", 0.3 * l);
    },
  },
  point_left: {
    duration: 1.8,
    offsets(t, o, rm) {
      const p = hold(t, 0.02, 0.9, 0.2);
      add(o, "armRRaise", 1.35 * p);
      add(o, "armRFwd", 0.45 * p);
      add(o, "headYaw", -0.35 * p);
      add(o, "lookX", -0.7 * p);
      add(o, "bodyYaw", (rm ? -0.04 : -0.12) * p);
      add(o, "mouthCurve", 0.25 * p);
      add(o, "finR", 0.2 * p);
    },
  },
  point_right: {
    duration: 1.8,
    offsets(t, o, rm) {
      const p = hold(t, 0.02, 0.9, 0.2);
      add(o, "armLRaise", 1.35 * p);
      add(o, "armLFwd", 0.45 * p);
      add(o, "headYaw", 0.35 * p);
      add(o, "lookX", 0.7 * p);
      add(o, "bodyYaw", (rm ? 0.04 : 0.12) * p);
      add(o, "mouthCurve", 0.25 * p);
      add(o, "finL", 0.2 * p);
    },
  },
  double_take: {
    duration: 1.5,
    offsets(t, o, rm) {
      add(o, "headYaw", 0.3 * bump(t, 0, 0.3));
      add(o, "lookX", 0.4 * bump(t, 0, 0.28));
      const snap = hold(t, 0.42, 0.95, 0.06);
      add(o, "eyeW", 0.25 * snap);
      add(o, "eyeH", 0.35 * snap);
      add(o, "lidTopL", -0.06 * snap);
      add(o, "lidTopR", -0.06 * snap);
      add(o, "finL", 0.6 * snap);
      add(o, "finR", 0.6 * snap);
      add(o, "bodyPitch", (rm ? -0.03 : -0.08) * snap);
      add(o, "hoverY", (rm ? 0.01 : 0.03) * bump(t, 0.42, 0.7));
      add(o, "squash", 0.05 * bump(t, 0.42, 0.6));
      add(o, "mouthOpen", 0.3 * snap);
      add(o, "mouthRound", 0.8 * snap);
    },
  },
  shy: {
    duration: 2.4,
    offsets(t, o) {
      const c = hold(t, 0.05, 0.9, 0.22);
      const peek = bump(t, 0.42, 0.7);
      add(o, "armLFwd", 2.2 * c);
      add(o, "armRFwd", 2.2 * c);
      add(o, "armLIn", 0.75 * c);
      add(o, "armRIn", 0.75 * c);
      add(o, "headPitch", 0.3 * c);
      add(o, "headYaw", 0.3 * c - 0.15 * peek);
      add(o, "headRoll", 0.12 * c);
      add(o, "smile", c - 0.7 * peek);
      add(o, "eyeH", -0.3 * c);
      add(o, "lidBotL", 0.25 * c);
      add(o, "lidBotR", 0.25 * c);
      add(o, "lookX", -0.5 * peek);
      add(o, "blush", c);
      add(o, "finL", -0.25 * c);
      add(o, "finR", -0.25 * c);
      add(o, "bodyRoll", 0.04 * Math.sin(t * Math.PI * 3) * c);
      add(o, "hoverY", -0.01 * c);
    },
  },
  wink: {
    duration: 1.0,
    offsets(t, o) {
      const w = hold(t, 0.08, 0.86, 0.18);
      add(o, "lidTopR", 0.92 * w);
      add(o, "lidBotR", 0.25 * w);
      add(o, "smile", 0.45 * w);
      add(o, "mouthCurve", 0.45 * w);
      add(o, "mouthSkew", 0.35 * w);
      add(o, "headRoll", 0.22 * w);
      add(o, "finL", 0.35 * w);
      add(o, "eyeSparkles", 0.55 * w);
      add(o, "cheekLight", 0.4 * w);
    },
  },
  blow_kiss: {
    duration: 1.9,
    offsets(t, o, rm) {
      const prep = hold(t, 0.05, 0.52, 0.14);
      const send = hold(t, 0.46, 0.94, 0.14);
      const env = hold(t, 0.05, 0.94, 0.14);
      add(o, "armRFwd", 1.95 * prep + 1.2 * send);
      add(o, "armRIn", 0.72 * prep - 0.35 * send);
      add(o, "armRRaise", 0.75 * prep + 1.45 * send);
      add(o, "mouthRound", 0.88 * prep);
      add(o, "mouthOpen", 0.18 * prep + 0.12 * send);
      add(o, "mouthCurve", 0.65 * send);
      add(o, "lidTopR", 0.85 * prep);
      add(o, "smile", 0.6 * send);
      add(o, "blush", 0.75 * env);
      add(o, "eyeHearts", 0.85 * send);
      add(o, "headPitch", -0.08 * prep + 0.06 * send);
      add(o, "bodyPitch", (rm ? 0.03 : 0.08) * send);
      add(o, "finL", 0.35 * env);
      add(o, "finR", 0.35 * env);
    },
  },
  facepalm: {
    duration: 2.1,
    offsets(t, o) {
      const k = hold(t, 0.06, 0.92, 0.2);
      add(o, "armRFwd", 2.35 * k);
      add(o, "armRIn", 0.82 * k);
      add(o, "armRRaise", 0.45 * k);
      add(o, "headPitch", 0.32 * k);
      add(o, "headYaw", -0.08 * Math.sin(t * Math.PI * 3) * k);
      add(o, "lidTopL", 0.82 * k);
      add(o, "lidTopR", 0.82 * k);
      add(o, "mouthCurve", -0.45 * k);
      add(o, "finL", -0.4 * k);
      add(o, "finR", -0.4 * k);
      add(o, "squash", -0.04 * k);
    },
  },
  clap: {
    duration: 1.7,
    offsets(t, o, rm) {
      const env = hold(t, 0.05, 0.94, 0.15);
      const pulse = Math.abs(Math.sin(t * Math.PI * 5));
      for (const side of ["L", "R"]) {
        add(o, `arm${side}Fwd`, 1.65 * env);
        add(o, `arm${side}Raise`, 0.4 * env);
        add(o, `arm${side}In`, (0.35 + 0.55 * pulse) * env);
      }
      add(o, "hoverY", (rm ? 0.01 : 0.025) * pulse * env);
      add(o, "smile", 0.72 * env);
      add(o, "mouthCurve", 0.65 * env);
      add(o, "finL", 0.35 * env);
      add(o, "finR", 0.35 * env);
      add(o, "eyeSparkles", 0.45 * env);
    },
  },
  thumbs_up: {
    duration: 1.5,
    offsets(t, o) {
      const k = hold(t, 0.05, 0.92, 0.18);
      add(o, "armRFwd", 1.55 * k);
      add(o, "armRRaise", 0.85 * k + 0.18 * bump(t, 0.18, 0.52));
      add(o, "armRIn", 0.2 * k);
      add(o, "headPitch", 0.14 * bump(t, 0.18, 0.55));
      add(o, "headRoll", 0.12 * k);
      add(o, "smile", 0.68 * k);
      add(o, "mouthCurve", 0.72 * k);
      add(o, "finL", 0.38 * k);
      add(o, "finR", 0.48 * k);
      add(o, "eyeSparkles", 0.45 * k);
    },
  },
  fist_pump: {
    duration: 1.4,
    offsets(t, o, rm) {
      const env = hold(t, 0.04, 0.92, 0.16);
      const pump = bump(t, 0.12, 0.48) + 0.85 * bump(t, 0.46, 0.84);
      add(o, "armRRaise", 1.75 * env + 0.65 * pump);
      add(o, "armRFwd", 0.65 * env);
      add(o, "hoverY", (rm ? 0.015 : 0.045) * pump);
      add(o, "squash", 0.045 * pump);
      add(o, "mouthOpen", 0.35 * env);
      add(o, "mouthCurve", 0.8 * env);
      add(o, "mouthTeeth", 0.6 * env);
      add(o, "finL", 0.55 * env);
      add(o, "finR", 0.65 * env);
      add(o, "eyeStars", 0.55 * env);
    },
  },
  dance_groove: {
    duration: 2.8,
    offsets(t, o, rm) {
      const env = hold(t, 0.04, 0.96, 0.14);
      const beat = Math.sin(t * Math.PI * 6);
      const half = Math.cos(t * Math.PI * 3);
      add(o, "hoverY", (rm ? 0.015 : 0.045) * Math.abs(beat) * env);
      add(o, "bodyRoll", (rm ? 0.04 : 0.12) * half * env);
      add(o, "bodyYaw", (rm ? 0.06 : 0.18) * half * env);
      add(o, "headRoll", -0.16 * half * env);
      add(o, "armLRaise", (0.95 + 0.55 * beat) * env);
      add(o, "armRRaise", (0.95 - 0.55 * beat) * env);
      add(o, "armLFwd", 0.45 * Math.cos(t * Math.PI * 6) * env);
      add(o, "armRFwd", -0.45 * Math.cos(t * Math.PI * 6) * env);
      add(o, "smile", 0.75 * env);
      add(o, "mouthCurve", 0.72 * env);
      add(o, "finL", (0.3 + 0.25 * beat) * env);
      add(o, "finR", (0.3 - 0.25 * beat) * env);
      add(o, "cheekLight", 0.6 * env);
    },
  },
  dance_spin: {
    duration: 2.5,
    offsets(t, o, rm) {
      const env = hold(t, 0.04, 0.96, 0.15);
      const wave = Math.sin(t * Math.PI * 4);
      add(o, "hoverY", (rm ? 0.025 : 0.075) * env);
      add(o, "armLRaise", (1.8 + 0.35 * wave) * env);
      add(o, "armRRaise", (1.8 - 0.35 * wave) * env);
      add(o, "headRoll", 0.16 * wave * env);
      add(o, "smile", 0.85 * env);
      add(o, "mouthOpen", 0.28 * env);
      add(o, "mouthCurve", 0.8 * env);
      add(o, "eyeStars", 0.7 * env);
      add(o, "finGlowL", 0.55 * env);
      add(o, "finGlowR", 0.55 * env);
    },
    spin: (t, rm) => (rm ? 0 : Math.PI * 2 * smoothstep(0.08, 0.88, t)),
  },
  dance_robot: {
    duration: 2.6,
    offsets(t, o, rm) {
      const s1 = hold(t, 0.04, 0.34, 0.04);
      const s2 = hold(t, 0.34, 0.64, 0.04);
      const s3 = hold(t, 0.64, 0.94, 0.04);
      const env = hold(t, 0.04, 0.94, 0.08);
      add(o, "armLRaise", 1.45 * s1 + 0.6 * s2 + 1.45 * s3);
      add(o, "armRRaise", 0.6 * s1 + 1.45 * s2 + 1.45 * s3);
      add(o, "armLFwd", 1.1 * s2);
      add(o, "armRFwd", 1.1 * s1);
      add(o, "headYaw", (rm ? 0.12 : 0.28) * (s1 - s2));
      add(o, "bodyYaw", (rm ? 0.06 : 0.14) * (s2 - s1));
      add(o, "eyeRound", -0.4 * env);
      add(o, "mouthWide", 0.25 * env);
      add(o, "chase", 0.9 * env);
      add(o, "foreheadLight", 0.65 * env);
    },
  },
  shiver: {
    duration: 1.5,
    offsets(t, o, rm) {
      const env = hold(t, 0.04, 0.94, 0.14);
      const buzz = Math.sin(t * Math.PI * 18);
      add(o, "bodyYaw", (rm ? 0.02 : 0.055) * buzz * env);
      add(o, "headRoll", 0.07 * buzz * env);
      add(o, "armLIn", 0.65 * env);
      add(o, "armRIn", 0.65 * env);
      add(o, "armLFwd", 0.85 * env);
      add(o, "armRFwd", 0.85 * env);
      add(o, "squash", -0.045 * env);
      add(o, "mouthCurve", -0.35 * env);
      add(o, "mouthTeeth", 0.55 * env);
      add(o, "finL", -0.35 * env);
      add(o, "finR", -0.35 * env);
    },
  },
  stretch: {
    duration: 2.3,
    offsets(t, o, rm) {
      const reach = hold(t, 0.06, 0.76, 0.2);
      const settle = bump(t, 0.72, 0.96);
      add(o, "armLRaise", 2.35 * reach);
      add(o, "armRRaise", 2.35 * reach);
      add(o, "squash", 0.075 * reach - 0.03 * settle);
      add(o, "hoverY", (rm ? 0.015 : 0.045) * reach);
      add(o, "headPitch", -0.16 * reach + 0.06 * settle);
      add(o, "lidTopL", 0.65 * reach);
      add(o, "lidTopR", 0.65 * reach);
      add(o, "smile", 0.5 * settle);
      add(o, "finL", 0.45 * reach);
      add(o, "finR", 0.45 * reach);
    },
  },
  yawn: {
    duration: 2.4,
    offsets(t, o) {
      const y = hold(t, 0.1, 0.75, 0.2);
      add(o, "mouthOpen", 0.75 * y);
      add(o, "mouthRound", 0.7 * y);
      add(o, "lidTopL", 0.4 * y);
      add(o, "lidTopR", 0.4 * y);
      add(o, "headPitch", -0.12 * hold(t, 0.1, 0.7, 0.2));
      add(o, "armLRaise", 0.4 * bump(t, 0.15, 0.7));
      add(o, "armRRaise", 0.4 * bump(t, 0.15, 0.7));
      add(o, "squash", 0.04 * bump(t, 0.15, 0.7));
      add(o, "eyeTears", 0.35 * y);
    },
  },
  sneeze: {
    duration: 1.6,
    offsets(t, o, rm) {
      const windup = hold(t, 0.05, 0.55, 0.12);
      const achoo = bump(t, 0.52, 0.78);
      add(o, "headPitch", -0.26 * windup + 0.42 * achoo);
      add(o, "bodyPitch", (rm ? -0.03 : -0.09) * windup + (rm ? 0.06 : 0.18) * achoo);
      add(o, "squash", 0.05 * windup - 0.08 * achoo);
      add(o, "lidTopL", 0.55 * windup + 0.9 * achoo);
      add(o, "lidTopR", 0.55 * windup + 0.9 * achoo);
      add(o, "mouthOpen", 0.45 * windup + 0.65 * achoo);
      add(o, "armLRaise", 0.6 * windup + 0.95 * achoo);
      add(o, "armRRaise", 0.6 * windup + 0.95 * achoo);
      add(o, "finL", -0.25 * windup + 0.65 * achoo);
      add(o, "finR", -0.25 * windup + 0.65 * achoo);
    },
  },
  hiccup: {
    duration: 0.95,
    offsets(t, o, rm) {
      const jolt = bump(t, 0.12, 0.48);
      const after = hold(t, 0.35, 0.9, 0.16);
      add(o, "hoverY", (rm ? 0.025 : 0.075) * jolt);
      add(o, "squash", 0.065 * jolt);
      add(o, "headPitch", -0.16 * jolt);
      add(o, "eyeW", 0.2 * after);
      add(o, "eyeH", 0.22 * after);
      add(o, "mouthRound", 0.65 * jolt);
      add(o, "mouthOpen", 0.25 * jolt);
      add(o, "finL", 0.55 * jolt);
      add(o, "finR", 0.55 * jolt);
      add(o, "blush", 0.35 * after);
    },
  },
  hug: {
    duration: 2.2,
    offsets(t, o, rm) {
      const open = hold(t, 0.05, 0.48, 0.14);
      const wrap = hold(t, 0.42, 0.94, 0.16);
      const env = hold(t, 0.05, 0.94, 0.14);
      for (const side of ["L", "R"]) {
        add(o, `arm${side}Raise`, 1.35 * open + 0.75 * wrap);
        add(o, `arm${side}Fwd`, 0.95 * open + 1.85 * wrap);
        add(o, `arm${side}In`, -0.45 * open + 0.72 * wrap);
      }
      add(o, "hoverZ", (rm ? 0.03 : 0.09) * env);
      add(o, "bodyPitch", (rm ? 0.04 : 0.1) * env);
      add(o, "headRoll", 0.15 * wrap);
      add(o, "smile", 0.85 * env);
      add(o, "blush", 0.65 * env);
      add(o, "eyeHearts", 0.65 * wrap);
      add(o, "mouthCurve", 0.7 * env);
    },
  },
  high_five: {
    duration: 1.5,
    offsets(t, o, rm) {
      const k = hold(t, 0.05, 0.92, 0.16);
      const slap = bump(t, 0.35, 0.68);
      add(o, "armRRaise", 2.05 * k);
      add(o, "armRFwd", 1.15 * k + 0.55 * slap);
      add(o, "bodyPitch", (rm ? 0.03 : 0.09) * slap);
      add(o, "hoverZ", (rm ? 0.02 : 0.06) * slap);
      add(o, "smile", 0.78 * k);
      add(o, "mouthOpen", 0.32 * k);
      add(o, "mouthCurve", 0.75 * k);
      add(o, "finL", 0.45 * k);
      add(o, "finR", 0.55 * k);
      add(o, "eyeSparkles", 0.65 * slap);
    },
  },
  bow: {
    duration: 2.0,
    offsets(t, o, rm) {
      const b = hold(t, 0.08, 0.88, 0.22);
      add(o, "bodyPitch", (rm ? 0.16 : 0.36) * b);
      add(o, "headPitch", 0.26 * b);
      add(o, "armRFwd", 1.25 * b);
      add(o, "armRIn", 0.65 * b);
      add(o, "armLRaise", 0.65 * b);
      add(o, "armLIn", -0.25 * b);
      add(o, "lidTopL", 0.72 * b);
      add(o, "lidTopR", 0.72 * b);
      add(o, "smile", 0.55 * b);
      add(o, "mouthCurve", 0.45 * b);
    },
  },
  salute: {
    duration: 1.7,
    offsets(t, o) {
      const s = hold(t, 0.06, 0.9, 0.16);
      add(o, "armRRaise", 2.15 * s);
      add(o, "armRFwd", 0.95 * s);
      add(o, "armRIn", 0.68 * s);
      add(o, "squash", 0.035 * s);
      add(o, "headPitch", -0.05 * s);
      add(o, "lidAngleL", 0.16 * s);
      add(o, "lidAngleR", 0.16 * s);
      add(o, "mouthCurve", 0.35 * s);
      add(o, "finL", 0.5 * s);
      add(o, "finR", 0.5 * s);
      add(o, "foreheadLight", 0.6 * s);
    },
  },
  big_shrug: {
    duration: 1.6,
    offsets(t, o, rm) {
      const s = hold(t, 0.05, 0.9, 0.2);
      for (const side of ["L", "R"]) {
        add(o, `arm${side}Raise`, 1.45 * s);
        add(o, `arm${side}Fwd`, 0.45 * s);
        add(o, `arm${side}In`, -0.55 * s);
      }
      add(o, "hoverY", (rm ? 0.015 : 0.04) * s);
      add(o, "squash", 0.035 * s);
      add(o, "headRoll", 0.24 * s);
      add(o, "eyeW", 0.12 * s);
      add(o, "lidAngleL", -0.24 * s);
      add(o, "lidAngleR", -0.24 * s);
      add(o, "mouthCurve", -0.45 * s);
      add(o, "mouthSkew", 0.6 * s);
    },
  },
  chin_on_hand: {
    duration: 2.3,
    offsets(t, o) {
      const c = hold(t, 0.06, 0.92, 0.2);
      add(o, "armRFwd", 1.95 * c);
      add(o, "armRIn", 0.72 * c);
      add(o, "armRRaise", 0.38 * c);
      add(o, "headPitch", 0.1 * c);
      add(o, "headRoll", 0.18 * c);
      add(o, "lookX", 0.38 * c);
      add(o, "lookY", 0.42 * c);
      add(o, "lidTopL", 0.22 * c);
      add(o, "lidBotL", 0.18 * c);
      add(o, "mouthSkew", 0.45 * c);
      add(o, "chase", 0.85 * c);
      add(o, "foreheadLight", 0.65 * c);
    },
  },
  scratch_head: {
    duration: 1.9,
    offsets(t, o) {
      const env = hold(t, 0.06, 0.92, 0.18);
      const rub = Math.sin(t * Math.PI * 6);
      add(o, "armRRaise", (2.25 + 0.18 * rub) * env);
      add(o, "armRFwd", 0.55 * env);
      add(o, "armRIn", (0.55 + 0.15 * rub) * env);
      add(o, "headRoll", -0.18 * env);
      add(o, "eyeScaleL", 0.14 * env);
      add(o, "lidAngleL", -0.2 * env);
      add(o, "lidAngleR", 0.18 * env);
      add(o, "mouthSkew", -0.55 * env);
      add(o, "mouthCurve", -0.2 * env);
      add(o, "finL", 0.25 * env);
      add(o, "finR", -0.25 * env);
    },
  },
  big_wave: {
    duration: 2.1,
    offsets(t, o, rm) {
      const env = hold(t, 0.04, 0.95, 0.18);
      const swing = Math.sin(t * Math.PI * 5);
      add(o, "armLRaise", (2.15 + 0.32 * swing) * env);
      add(o, "armRRaise", (2.15 - 0.32 * swing) * env);
      add(o, "armLFwd", 0.35 * env);
      add(o, "armRFwd", 0.35 * env);
      add(o, "bodyRoll", (rm ? 0.03 : 0.08) * swing * env);
      add(o, "hoverY", (rm ? 0.015 : 0.04) * Math.abs(swing) * env);
      add(o, "smile", 0.78 * env);
      add(o, "mouthOpen", 0.3 * env);
      add(o, "mouthCurve", 0.75 * env);
      add(o, "finL", 0.45 * env);
      add(o, "finR", 0.45 * env);
    },
  },
  royal_wave: {
    duration: 2.2,
    offsets(t, o) {
      const env = hold(t, 0.05, 0.94, 0.2);
      const twist = Math.sin(t * Math.PI * 4);
      add(o, "armRRaise", 1.55 * env);
      add(o, "armRFwd", 0.75 * env);
      add(o, "armRIn", 0.22 * twist * env);
      add(o, "headPitch", -0.09 * env);
      add(o, "bodyPitch", -0.04 * env);
      add(o, "lidTopL", 0.22 * env);
      add(o, "lidTopR", 0.22 * env);
      add(o, "smile", 0.45 * env);
      add(o, "mouthCurve", 0.55 * env);
      add(o, "eyeSparkles", 0.45 * env);
    },
  },
  peek: {
    duration: 2.1,
    offsets(t, o, rm) {
      const env = hold(t, 0.05, 0.94, 0.18);
      const open = bump(t, 0.35, 0.8);
      add(o, "armLFwd", 2.15 * env);
      add(o, "armRFwd", 2.15 * env);
      add(o, "armLIn", (0.72 - 0.42 * open) * env);
      add(o, "armRIn", 0.72 * env);
      add(o, "headRoll", 0.18 * env);
      add(o, "bodyPitch", (rm ? 0.04 : 0.1) * open);
      add(o, "eyeW", 0.15 * open);
      add(o, "lookX", 0.28 * open);
      add(o, "finL", 0.45 * open);
      add(o, "blush", 0.45 * env);
    },
  },
  hide: {
    duration: 2.2,
    offsets(t, o, rm) {
      const h = hold(t, 0.05, 0.92, 0.2);
      add(o, "hoverY", (rm ? -0.03 : -0.09) * h);
      add(o, "hoverZ", (rm ? -0.03 : -0.1) * h);
      add(o, "squash", -0.075 * h);
      add(o, "headPitch", 0.32 * h);
      add(o, "armLFwd", 2.25 * h);
      add(o, "armRFwd", 2.25 * h);
      add(o, "armLIn", 0.8 * h);
      add(o, "armRIn", 0.8 * h);
      add(o, "lidTopL", 0.85 * h);
      add(o, "lidTopR", 0.85 * h);
      add(o, "finL", -0.55 * h);
      add(o, "finR", -0.55 * h);
    },
  },
  dizzy: {
    duration: 2.4,
    offsets(t, o, rm) {
      const env = hold(t, 0.05, 0.94, 0.18);
      const sway = Math.sin(t * Math.PI * 4);
      const cos = Math.cos(t * Math.PI * 4);
      add(o, "headRoll", 0.24 * sway * env);
      add(o, "headPitch", 0.14 * cos * env);
      add(o, "bodyRoll", (rm ? 0.04 : 0.12) * sway * env);
      add(o, "lookX", 0.55 * sway * env);
      add(o, "lookY", 0.55 * cos * env);
      add(o, "eyeSpirals", 0.95 * env);
      add(o, "mouthSkew", 0.55 * sway * env);
      add(o, "mouthCurve", -0.25 * env);
      add(o, "finL", 0.35 * sway * env);
      add(o, "finR", -0.35 * sway * env);
    },
  },
  whistle: {
    duration: 2.0,
    offsets(t, o, rm) {
      const env = hold(t, 0.06, 0.92, 0.18);
      const bob = Math.sin(t * Math.PI * 5);
      add(o, "mouthRound", 0.92 * env);
      add(o, "mouthWide", -0.28 * env);
      add(o, "mouthOpen", (0.18 + 0.08 * Math.abs(bob)) * env);
      add(o, "headRoll", 0.16 * bob * env);
      add(o, "bodyRoll", (rm ? 0.02 : 0.06) * bob * env);
      add(o, "lookX", 0.35 * env);
      add(o, "lookY", 0.35 * env);
      add(o, "finL", 0.35 * env);
      add(o, "finR", 0.35 * env);
      add(o, "cheekLight", 0.55 * env);
    },
  },
  drum_roll: {
    duration: 1.9,
    offsets(t, o) {
      const env = hold(t, 0.04, 0.94, 0.14);
      const roll = Math.sin(t * Math.PI * 14);
      add(o, "armLFwd", (1.45 + 0.35 * roll) * env);
      add(o, "armRFwd", (1.45 - 0.35 * roll) * env);
      add(o, "armLRaise", (0.55 + 0.25 * roll) * env);
      add(o, "armRRaise", (0.55 - 0.25 * roll) * env);
      add(o, "bodyPitch", 0.08 * env);
      add(o, "eyeW", 0.12 * env);
      add(o, "mouthCurve", 0.45 * env);
      add(o, "finL", 0.45 * env);
      add(o, "finR", 0.45 * env);
      add(o, "chase", 0.9 * env);
    },
  },
  flex: {
    duration: 1.9,
    offsets(t, o) {
      const f = hold(t, 0.06, 0.92, 0.18);
      for (const side of ["L", "R"]) {
        add(o, `arm${side}Raise`, 1.75 * f);
        add(o, `arm${side}Fwd`, 0.55 * f);
        add(o, `arm${side}In`, 0.42 * f);
      }
      add(o, "squash", 0.055 * f);
      add(o, "bodyPitch", -0.06 * f);
      add(o, "headPitch", -0.08 * f);
      add(o, "smile", 0.55 * f);
      add(o, "mouthCurve", 0.72 * f);
      add(o, "mouthTeeth", 0.65 * f);
      add(o, "finL", 0.6 * f);
      add(o, "finR", 0.6 * f);
      add(o, "eyeSparkles", 0.55 * f);
    },
  },

  // Played by the app itself, not offered to the AI
  boot: {
    duration: 1.8,
    offsets(t, o) {
      const off = 1 - smoothstep(0.1, 0.55, t);
      add(o, "glow", -1 * off);
      add(o, "ringGlow", -0.6 * (1 - smoothstep(0, 0.4, t)));
      const closed = 1 - smoothstep(0.35, 0.62, t);
      add(o, "lidTopL", 0.94 * closed);
      add(o, "lidTopR", 0.94 * closed);
      add(o, "squash", -0.05 * bump(t, 0.45, 0.62) + 0.09 * bump(t, 0.58, 0.88));
      add(o, "armLRaise", 0.7 * bump(t, 0.55, 0.95));
      add(o, "armRRaise", 0.7 * bump(t, 0.55, 0.95));
      add(o, "finL", -0.5 * (1 - smoothstep(0.2, 0.7, t)) + 0.3 * bump(t, 0.6, 0.95));
      add(o, "finR", -0.5 * (1 - smoothstep(0.2, 0.7, t)) + 0.3 * bump(t, 0.6, 0.95));
      add(o, "hoverY", -0.03 * (1 - smoothstep(0.1, 0.6, t)));
    },
  },
  mmhm: {
    duration: 0.55,
    offsets(t, o) {
      add(o, "headPitch", 0.12 * bump(t, 0, 1));
      add(o, "smile", 0.1 * bump(t, 0, 1));
    },
  },
  wake_up: {
    duration: 2.2,
    offsets(t, o) {
      const groggy = hold(t, 0.02, 0.55, 0.15);
      const stretch = bump(t, 0.35, 0.92);
      add(o, "lidTopL", 0.68 * groggy);
      add(o, "lidTopR", 0.68 * groggy);
      add(o, "mouthOpen", 0.45 * bump(t, 0.18, 0.62));
      add(o, "mouthRound", 0.55 * bump(t, 0.18, 0.62));
      add(o, "armLRaise", 1.35 * stretch);
      add(o, "armRRaise", 1.35 * stretch);
      add(o, "squash", 0.055 * stretch);
      add(o, "smile", 0.55 * hold(t, 0.55, 0.96, 0.15));
      add(o, "finL", 0.4 * stretch);
      add(o, "finR", 0.4 * stretch);
    },
  },
};

export const gestureDuration = (name) => GESTURE_DEFS[name]?.duration || 0;

// How much a gesture matters when several want to play
export const PRIORITY = { boot: 5, tool: 3, reaction: 2, caption: 1, idle: 0 };

// ---------- Looks you can choose (Settings → Robot) ----------
// Eye styles, in face units: half-width, half-height, corner roundness,
// distance from the middle, height. The face is 2 units wide.
export const EYE_STYLES = {
  classic: { w: 0.13, h: 0.22, round: 1, gap: 0.37, y: 0.07 }, // tall capsules
  round: { w: 0.18, h: 0.18, round: 1, gap: 0.39, y: 0.06 }, // big round eyes
  wide: { w: 0.22, h: 0.13, round: 0.5, gap: 0.39, y: 0.07 }, // wide, soft ovals
  big: { w: 0.21, h: 0.24, round: 1, gap: 0.42, y: 0.04 }, // large, close to a cartoon's
  dots: { w: 0.085, h: 0.085, round: 1, gap: 0.3, y: 0.05 }, // small and beady
  tall: { w: 0.1, h: 0.27, round: 1, gap: 0.34, y: 0.06 }, // thin and tall
  square: { w: 0.14, h: 0.16, round: 0.22, gap: 0.38, y: 0.06 }, // pixels
  visor: { w: 0.27, h: 0.075, round: 0.6, gap: 0.285, y: 0.06 }, // two bars that almost meet
  anime: { w: 0.2, h: 0.25, round: 0.92, gap: 0.4, y: 0.05, sparkleBias: 0.65, pupilBias: 1.15 },
  crescent: { w: 0.19, h: 0.15, round: 1, gap: 0.38, y: 0.07, smileBias: 0.68 },
  sleepy_eyes: { w: 0.18, h: 0.16, round: 0.85, gap: 0.38, y: 0.05, lidBias: 0.36 },
  star_eyes: { w: 0.19, h: 0.19, round: 1, gap: 0.39, y: 0.06, starBias: 0.88 },
  heart_eyes: { w: 0.19, h: 0.19, round: 1, gap: 0.39, y: 0.06, heartBias: 0.88 },
  cyber: { w: 0.23, h: 0.09, round: 0.18, gap: 0.34, y: 0.07 },
  wink_eyes: { w: 0.16, h: 0.21, round: 1, gap: 0.38, y: 0.06, winkRight: 0.82 },
};

// Mouth styles: how wide, and how heavy the line is, compared with the default
export const MOUTH_STYLES = {
  line: { width: 1, weight: 1, show: 1 },
  small: { width: 0.6, weight: 1, show: 1 },
  wide: { width: 1.35, weight: 1, show: 1 },
  bold: { width: 1, weight: 1.9, show: 1 },
  none: { width: 1, weight: 1, show: 0 },
  cat_mouth: { width: 0.95, weight: 1.15, show: 1, cat: 1 },
  zigzag: { width: 1.08, weight: 1.1, show: 1, zigzag: 1 },
  tooth: { width: 1.0, weight: 1.1, show: 1, tooth: 1 },
  o_mouth: { width: 0.58, weight: 1.25, show: 1, roundBias: 0.72 },
  smirk: { width: 0.95, weight: 1.1, show: 1, skewBias: 0.55 },
  beak: { width: 0.85, weight: 1.4, show: 1, beak: 1 },
};

// Shell colors: all a little off pure white, which glares on camera
export const SHELLS = {
  warm: "#ede4d6",
  cloud: "#e2e7ee",
  graphite: "#50555f",
  peach: "#f0ccb6",
  mint: "#c9e5d6",
};

// The second glow color, shown while you talk. The robot glows in your accent
// color, so yours is whichever of these differs most from it in hue.
const USER_GLOWS = ["#ffb074", "#5eead4", "#f472b6", "#a3e635"];

function hue(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export function userGlowFor(accent) {
  if (!/^#[0-9a-f]{6}$/i.test(accent || "")) return USER_GLOWS[0];
  const a = hue(accent);
  const distance = (c) => {
    const d = Math.abs(hue(c) - a) % 360;
    return Math.min(d, 360 - d);
  };
  return USER_GLOWS.reduce((best, c) => (distance(c) > distance(best) ? c : best));
}
