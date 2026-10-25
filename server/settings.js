// Everything from the Settings panel, stored as settings.json.
const fs = require("fs");
const path = require("path");
const { dataDir, writeJson } = require("./config");
const characters = require("./characters");
const look = require("./robot-look");
const roleData = require("../src/js/robot/roles.mjs");
const geometry = require("../src/js/whiteboard/geometry.mjs");
const specialistRoles = require("./specialist-roles");
const keys = require("./keys");
const TELEGRAM_TOKEN_KEY = "telegram-bot-token";
const REDDIT_SECRET_KEY = "reddit-client-secret";
const REDDIT_REFRESH_TOKEN_KEY = "reddit-refresh-token";

const file = path.join(dataDir, "settings.json");

const LANGUAGES = ["auto", "en", "de", "ar"];

const DEFAULTS = {
  // The interface language: "auto" follows the browser (see src/js/i18n.js)
  ui: { language: "auto", design: 2 }, // design: 1 before the redesign (only used to carry the old default accent over)
  // The first-run guide (src/js/onboarding.js): done once the person has finished or skipped it;
  // missions once they have seen the card that says Missions exist; sounds once offered
  onboarding: { done: false, missions: false, sounds: true },
  font: { family: "default", size: 16 },
  // How conversations look: "minimal", "bubbles", "cards", "notebook" or "postcards",
  // "comfortable", "cozy" or "compact" spacing, and follow-up chips under the last reply
  chat: { style: "minimal", density: "comfortable", suggestions: true },
  // Theme pack, light/dark mode, accent, warmth, roundness, motion, procedural grain, background, sidebar, and tints
  theme: {
    pack: "cozy",
    appearance: "dark",
    accent: "#f5a94a",
    warmth: 6,
    roundness: "soft",
    animation: "lively",
    grain: false,
    background: "gradient",
    sidebarStyle: "classic",
    timeTint: false,
    characterTint: true,
    particles: false,
  },
  // Synthesized WebAudio UI sounds (off by default, no audio files)
  sound: {
    enabled: false,
    volume: 60,
    ui: true,
    notifications: true,
    celebrations: true,
  },
  // What the AI may do with files on this computer (see files.js)
  permissions: {
    folders: [],
    files: { create: false, read: true, edit: false, delete: false },
    dirs: { create: false, read: true, edit: false, delete: false },
    askBeforeActing: true,
    useTrash: true,
  },
  // Copies of your data folder in <data folder>/backups (see backup.js)
  backup: { auto: true, keep: 10 },
  // Asking GitHub Releases once a day whether a newer Friends exists (see updates.js); it never installs anything
  updates: { check: true },
  // Private mode: only a local AI answers, and nothing is sent to Google, GitHub
  // or news sites (no Gemini, Live, Google sign-in, GitHub search or news)
  privacy: {
    localOnly: false,
    // Words that are swapped for a placeholder in what goes to a cloud AI (see redact.js); a local AI sees everything
    redact: { keys: true, cards: true, emails: false, phones: false },
    shareMemoryWithCloud: true, // your memories, notes and what it remembers of past chats go to a cloud AI too
    keepChatsDays: 0, // chats not touched for this many days are deleted (0 = keep them)
  },
  // Which AI answers (see router.js): "fixed" is the one brain you pick in the model menu
  routing: {
    mode: "fixed", // fixed | auto | dynamic | fastest | local | cloud
    askBeforeCloud: "chat", // in auto, dynamic and fastest: "always" | "chat" (once per chat) | "never"
    fallback: "off", // when the AI you chose fails: "off" (say so) | "same-kind" (try your next local one, or next cloud one)
    taskBrain: 0, // the AI for small jobs (follow-ups, summaries, moods): 0 = chosen by the mode, or an AI's id
    // Auto and Dynamic: what sends a message to the cloud AI (everything else stays local)
    auto: { longChats: true, hardQuestions: true, attachments: true, voiceLocal: true },
    // Dynamic: also reacts to how the local AI is doing
    dynamic: { escalate: true, slowSeconds: 45 },
  },
  // "Your memories": written by you, always given to the AI when enabled
  memory: { enabled: true, items: [] },
  // The AI's own notes (stored separately, see notes.js)
  aiNotes: { enabled: true },
  // Who the AI is (see characters.js): Atlas, Mira, or your own; one is active.
  // switchLook: switching also changes the robot's look and the accent color.
  characters: { active: "atlas", switchLook: true, list: [] },
  // What the robot is to you right now: a teacher, a coach, a co-host… (src/js/robot/roles.mjs)
  roles: JSON.parse(JSON.stringify(roleData.DEFAULT_ROLES)),
  // Being a companion you can talk to for hours
  companion: {
    recall: true, // remembers past conversations (episodes.js) and can look them up
    followUps: true, // asks about things you mentioned before
    activities: true, // suggests games, debates and stories when a conversation runs dry
    greeting: true, // starts voice conversations with something from last time
    interests: "", // what you love talking about, for fresh topics
  },
  // How voice conversations take turns (server/voice-style.js, src/js/voice/)
  voice: {
    style: "balanced", // VOICE.styles: how much it talks and how long it waits for you
    interruptKey: "Space", // a KeyboardEvent.code that cuts the AI off; "" = no key
    interruptSensitivity: "normal", // VOICE.sensitivities: how easily your voice cuts it off
  },
  // Tasks, reminders, habits and the journal (life.js), and the daily briefing
  life: {
    enabled: true, // the AI gets the tools and the Today panel shows
    notify: true, // reminders as notifications on this computer
    speak: true, // in voice mode, the character says a reminder out loud
    briefing: { auto: false, time: "08:00" }, // a briefing waiting as a chat every morning
    briefingNews: true, // headlines in the briefing (not in Private mode)
  },
  // Local Markdown Notes Vault (local-notes.js)
  localNotes: {
    enabled: true,
    folder: "",
  },
  // Telegram Bot companion (telegram.js)
  telegram: {
    enabled: false,
    botToken: "", // only ever typed in: it goes to the system keyring and is never kept here (see storeTelegramToken)
    hasToken: false, // (made up when the settings are read: whether a token is in the keyring)
    allowedUserIds: [],
    pairedUsers: [], // [{ id, username, firstName, role: "admin"|"chat"|"notify_only", pairedAt }]
    allowedChatIds: [], // [{ id, title, type, mode: "mention_only"|"command_only"|"all" }]
    proxy: "",
    botApiUrl: "",
    format: "markdown", // "markdown" | "html" | "plain"
    verbosity: "normal", // "compact" | "normal" | "detailed"
    streaming: true,
    typingIndicator: true,
    reactions: true,
    disableLinkPreviews: true,
    notifyReminders: true,
    notifyFocus: true,
    groupMode: "mention_only", // "mention_only" | "command_only" | "all"
    voiceTranscription: true,
    voiceReply: false,
    pairedNotice071Seen: false,
  },
  // Missions: goals carried out in the background (server/missions/)
  missions: {
    enabled: false,
    workspace: "~/friends-workspace", // where each mission gets a folder of its own to work in
    // The manager is Gemini: a stronger model plans and checks, a faster one does routine steps. "" = choose by itself.
    manager: { planModel: "", fastModel: "" },
    limits: { maxMinutes: 60, maxSteps: 25, maxCloudCalls: 60 }, // what a plan starts with; shown on the plan
    caps: { maxMinutes: 480, maxSteps: 100, maxCloudCalls: 400 }, // what no plan may go beyond
    notify: { desktop: true, telegram: true },
    maxConcurrent: 0, // 0 = by what this computer can take (hardware.js)
    commandTimeoutSeconds: 120,
  },
  // This computer (server/hardware.js works out what it is; these are for overriding what follows from it)
  device: {
    profile: "auto", // "auto" | "light" | "balanced" | "performance": how much a local AI may ask of this computer
    gpu: "auto", // "auto" | "off": "off" keeps local models off the graphics card (they run on the processor)
    saveBattery: true, // on battery, repeating missions wait and models are kept loaded briefly
  },
  // The specialist models (server/specialists.js): what you changed from the built-in roles
  specialists: {
    baseUrl: "", // the Ollama server ("" = the one of your local AI)
    roles: [],
    suggestedSeen: false, // the "pick models for your graphics card" card was dealt with
  },
  // The desktop app (Electron)
  desktop: {
    tray: true, // keeps running in the tray when the window is closed, so reminders still come
    autostart: false, // starts (in the tray) when you log in
  },
  // On camera: acting and co-host mode for videos, streams and content creation
  onAir: {
    auto: true, // on by itself in filming mode and while recording
    format: "podcast", // ON_AIR.formats
    actingDynamic: "friends", // ON_AIR.dynamics: friends | cohost | comedy | critic | interviewer | custom
    actingBrief: "", // Scene or dynamic context: e.g. "We are high school buddies discussing sci-fi"
    show: "", // the show's name
    audience: "", // who's watching
    hidePrivate: true, // nothing private (memories, emails, calendar, files) on camera
    familyFriendly: true,
  },
  personality: {
    name: "",
    userName: "", // what the AI calls you; empty = your login name
    voice: 1,
    speed: 5,
    style: "Friendly",
    length: 2,
    creativity: 5,
    everydayLanguage: true,
    naturalPauses: true,
    emotions: true,
    curious: true,
    typingPace: false,
    customInstructions: "",
  },
  aiControl: {
    reasoningEffort: "balanced", // "fast" | "balanced" | "deep"
    searchGrounding: true,
    confirmTools: true,
    contextWindow: 20,
    localTools: "essential", // "essential" | "all": how many tools a local AI gets (see tools.forLocal)
    replyLanguage: "auto", // "auto" (the language you write in) or a language code (REPLY_LANGUAGES): the AI answers in it
    maxTokens: 0, // the longest a reply may be, for every AI that has no limit of its own (0 = the AI's own)
    timeoutSeconds: 0, // how long to wait for an AI to start answering, or to go quiet while answering (0 = as long as it takes)
    retries: 1, // how often a request that failed for a passing reason (busy, no connection) is tried again
  },
  // The AI's 3D robot body (Settings → Robot): the "Robot" style in voice mode
  // and the little one next to text chats. See src/js/robot/.
  robot: {
    chatDock: true, // the robot next to text chats
    design: look.design.defaultDesign(), // what it looks like: colors, shape, face, clothes (src/js/robot/design.mjs)
    room: look.room.defaultRoom(), // what's around it: place, colors, light, air (src/js/robot/room.mjs)
    looks: [], // looks you saved: { id, name, design, room }
    customRooms: [], // custom rooms you saved in the Room Builder: { id, name, room }
    cameraMoves: [], // saved custom camera moves: { id, name, shot, view, yaw, pitch, zoom }
    shot: "medium", // ROBOT.shots
    position: "center", // ROBOT.positions: where the robot stands in the picture
    voicePlace: { x: 0, y: 0, scale: 1 }, // where you put it in voice mode (sideways, up and down, size): geometry.mjs
    seat: "front", // ROBOT.seats: where you sit, so it can turn to you
    followFace: false, // eyes follow you through the webcam (all on this computer)
    eyesFollowCursor: true, // eyes subtly track the pointer when hovering near the stage
    cinematic: false, // gentle camera drift and a push-in on emphasis
    roam: true, // in voice mode it moves about the room, and you can poke it and drag the view
    world: true, // the room around it: glossy floor and reflection, drifting light, rings on the floor
    aiGestures: { voice: true, chat: false }, // the AI moves the robot itself (robot_mood / robot_gesture)
    aiAllowed: { mood: true, gesture: true, prop: true, move: true, look: true }, // which of its body's moves the AI may use
    interactive: true, // tap, hold and drag the robot, and tap things in its room
    nameTag: false, // the character's name under the robot
    smartMoods: false, // one small extra Gemini request per turn to read the mood
    quality: "auto", // ROBOT.qualities
    sound: {
      enabled: false, // synthesized WebAudio blips, hums, servo whirs, giggles, sighs, chimes (off by default)
      volume: 50, // 0..100
      pitch: 1, // 0.6..1.5 per-character pitch multiplier
      blips: true,
      servos: true,
      emotes: true,
      ambience: true,
      recordMix: false, // mix robot sounds into video recordings only when chosen
    },
    reactions: {
      mission: true,
      reminder: true,
      notifications: true, // incoming Telegram or Reddit notifications (looks at tablet/phone prop)
      taskDone: true,
      habitStreak: true,
      timeOfDay: true,
      userReturn: true,
    },
    filming: {
      delay: 3, // seconds before the conversation starts (ROBOT.delays)
      cameraFriendly: true, // no flicker, fine lines or pure white; steadier frames
      largeCaptions: false,
      largerFace: false,
    },
  },
  whiteboard: {
    enabled: true,
    aiDrawing: true, // the AI may draw and write on it (off: it can only look at it, and not even that without "enabled")
    awareness: "always", // always (it is told about the board and your changes) | onRequest (only when it looks) | off
    reactToEdits: "ask", // ask (it comments when you ask) | never | comment (a short remark now and then)
    initiative: "helpful", // reactive (only when asked) | helpful | proactive (sketches while it explains)
    followRobot: true, // your view follows when the robot changes page or points
    showRobotCursor: true, // the robot's pointer and what it is doing show on the board
    robotPointer: "laser", // laser | ring | arrow
    showAuthors: "hover", // off | hover | always: who made each thing
    animate: true, // watch it being written
    robotArm: true, // the 3D robot reaches to the board and looks at it
    smartInk: true, // dark ink turns light on a dark board and the other way round
    snapToGrid: false,
    smartGuides: true,
    voiceOpen: "auto", // auto (opens when the robot draws) | manual
    voiceAutoHide: 0, // seconds without anyone touching it before it folds away in voice mode (0 = never)
    writingStyle: "marker", // marker | chalk | print | cursive | plain
    writingSpeed: "normal", // slow | normal | fast
    markerColor: "#2563eb",
    markerSize: 3,
    askBeforeDrawOverUser: true,
    showInFilming: true,
    showInRecordings: true,
    missionAllowed: true,
    voiceAllowed: true,
    chatAllowed: true,
    sound: true,
    dockTheme: "auto", // auto (paper in a light app, midnight in a dark one) | paper | midnight | classic | chalkboard | blueprint | cork | glass | neon
    windows: geometry.cleanWindows(), // where the board (beside the chat, in voice mode) and the robot's window sit and how big they are: geometry.mjs
    robotWindow: true, // the robot's window on the robot page
    inspector: true, // the panel with the options of what you draw or select
    collaborationMode: "both", // both | robot_only | user_only
    autoOpenOnDraw: true,
    dockDefaultOpen: false,
    bgPattern: "grid", // grid | dots | lines | isometric | none
    gridSize: 28,
  },
  subtitles: {
    enabled: true,
    showInVoice: true,
    showInDock: true,
    showInRecordings: true,
    speakerVisibility: "both", // both | robot_only | user_only
    showSpeakerBadge: true,
    placement: "bottom_center", // bottom_center | bottom_left | bottom_right | top_center | over_robot | floating_center
    alignment: "center", // left | center | right
    fontFamily: "default", // default | bricolage | figtree | sans | serif | mono | dyslexic
    fontSize: 20,
    fontWeight: "600", // 400 | 500 | 600 | 700 | 800
    lineHeight: "1.4", // 1.2 | 1.4 | 1.6
    textColorRobot: "#ffffff",
    textColorUser: "#ffecd6",
    bgStyle: "dark_pill", // dark_pill | glass | solid_black | accent_tint | none
    bgOpacity: 65,
    textOutline: "subtle", // none | subtle | strong | glow
    durationSeconds: 4,
    wordAnimation: "fade", // fade | pop | typewriter | none
    maxLines: 2,
  },
  notifications: {
    enabled: true,
    matrix: {
      reminder: { desktop: true, inapp: true, telegram: true, reddit: true },
      focus_complete: { desktop: true, inapp: true, telegram: true, reddit: true },
      mission_plan: { desktop: true, inapp: true, telegram: true, reddit: true },
      mission_question: { desktop: true, inapp: true, telegram: true, reddit: true },
      mission_approval: { desktop: true, inapp: true, telegram: true, reddit: true },
      mission_progress: { desktop: false, inapp: true, telegram: true, reddit: false },
      mission_done: { desktop: true, inapp: true, telegram: true, reddit: true },
      mission_trouble: { desktop: true, inapp: true, telegram: true, reddit: true },
      watch_alert: { desktop: true, inapp: true, telegram: true, reddit: true },
      briefing: { desktop: true, inapp: true, telegram: true, reddit: false },
      habit_nudge: { desktop: true, inapp: true, telegram: false, reddit: false },
      follow_up: { desktop: false, inapp: true, telegram: false, reddit: false },
      reddit_match: { desktop: true, inapp: true, telegram: true, reddit: true },
    },
    quietHours: {
      enabled: false,
      start: "22:00",
      end: "08:00",
      allowUrgent: true,
    },
    dnd: {
      enabled: false,
      until: 0,
    },
    digest: {
      enabled: false,
      mode: "daily",
      time: "09:00",
    },
    rateLimits: {
      maxPerMinute: 15,
      maxPerHour: 100,
    },
  },
  reddit: {
    enabled: false,
    companionEnabled: false,
    clientId: "",
    clientSecret: "",
    hasSecret: false,
    hasRefreshToken: false,
    username: "",
    userAgent: "",
    safeMode: true,
    cooldownMinutes: 10,
    maxPostsPerDay: 5,
    aiDisclosure: true,
    pollIntervalSeconds: 30,
    allowedUsers: [],
    respondPM: true,
    respondMentions: true,
    respondComments: false,
    notifyReminders: true,
    notifyMissions: true,
    notifyBriefing: false,
    watchers: [],
  },
};

// The languages the AI can be told to answer in (Settings → AI & privacy → Answers)
const REPLY_LANGUAGES = { en: "English", de: "German", ar: "Arabic", fr: "French", es: "Spanish", it: "Italian", pt: "Portuguese", nl: "Dutch", pl: "Polish", tr: "Turkish", ru: "Russian", uk: "Ukrainian", fa: "Persian", hi: "Hindi", zh: "Chinese", ja: "Japanese", ko: "Korean" };

const THEME_ACCENTS = ["#f5a94a", "#eb7a53", "#fb7185", "#34d399", "#a78bfa", "#38bdf8"];
const THEME_PACKS = [
  "cozy",
  "sunrise",
  "forest",
  "lavender",
  "ocean",
  "classic",
  "midnight",
  "nordic",
  "matcha",
  "espresso",
  "cyberpunk",
  "sunset",
];
const ROUNDNESS = ["sharp", "soft", "pill"];
const ANIMATIONS = ["off", "subtle", "lively"];
const BACKGROUNDS = ["plain", "gradient", "aurora", "pattern"];
const SIDEBAR_STYLES = ["classic", "floating", "minimal"];
const CHAT_STYLES = ["minimal", "bubbles", "cards", "notebook", "postcards"];
const DENSITIES = ["comfortable", "cozy", "compact"];
// The interface was blue before the redesign (0.6.0): those who never changed the accent get the new one
const OLD_ACCENT = "#6f9cf5";

const VOICE = {
  styles: ["listener", "balanced", "chatty"],
  sensitivities: ["easy", "normal", "hard"],
  // Keys with a job in voice mode already (Esc ends, M mutes, F films, Enter sends typing, Tab moves focus)
  reservedKeys: ["Escape", "KeyM", "KeyF", "Enter", "NumpadEnter", "Tab"],
};

const ON_AIR = {
  formats: ["podcast", "reaction", "qa", "debate", "explainer", "storytime", "free"],
  dynamics: ["friends", "cohost", "comedy", "critic", "interviewer", "custom"],
};

// Allowed values of the robot's choices
const ROUTING = { modes: ["fixed", "auto", "dynamic", "fastest", "local", "cloud"], ask: ["always", "chat", "never"] };

const ROBOT = {
  shots: ["close", "medium", "wide", "orbit", "dolly", "rack_focus", "handheld", "security_cam", "cinematic"],
  positions: ["center", "left", "right"],
  seats: ["front", "left", "right"],
  qualities: ["auto", "low", "medium", "high"],
  delays: [0, 3, 5, 10],
};

const WHITEBOARD = {
  awarenesses: ["always", "onRequest", "off"],
  reactions: ["ask", "never", "comment"],
  initiatives: ["reactive", "helpful", "proactive"],
  pointers: ["laser", "ring", "arrow"],
  authorsShown: ["off", "hover", "always"],
  voiceOpens: ["auto", "manual"],
  voiceAutoHides: [0, 30, 60, 120, 300],
  writingStyles: ["marker", "chalk", "print", "cursive", "plain"],
  writingSpeeds: ["slow", "normal", "fast"],
  dockThemes: ["auto", "paper", "midnight", "classic", "chalkboard", "blueprint", "cork", "glass", "neon"],
  collaborationModes: ["both", "robot_only", "user_only"],
  bgPatterns: ["grid", "dots", "lines", "isometric", "none"],
};

const SUBTITLES = {
  speakerVisibilities: ["both", "robot_only", "user_only"],
  placements: ["bottom_center", "bottom_left", "bottom_right", "top_center", "over_robot", "floating_center"],
  alignments: ["left", "center", "right"],
  fontFamilies: ["default", "bricolage", "figtree", "sans", "serif", "mono", "dyslexic"],
  fontWeights: ["400", "500", "600", "700", "800"],
  bgStyles: ["dark_pill", "glass", "solid_black", "accent_tint", "none"],
  textOutlines: ["none", "subtle", "strong", "glow"],
  wordAnimations: ["fade", "pop", "typewriter", "none"],
};

const clone = (v) => JSON.parse(JSON.stringify(v));

// Keep only known keys with the right type; anything else falls back to the default
function clean(value, fallback) {
  if (Array.isArray(fallback)) return Array.isArray(value) ? value : clone(fallback);
  if (fallback && typeof fallback === "object") {
    const out = {};
    for (const key of Object.keys(fallback)) {
      out[key] = clean(value && typeof value === "object" ? value[key] : undefined, fallback[key]);
    }
    return out;
  }
  return typeof value === typeof fallback ? value : fallback;
}

function sanitize(input) {
  // Settings from before the robot had a design and a room: its shell, eyes, mouth and background become them
  const raw = input && typeof input === "object" && input.robot && typeof input.robot === "object" ? look.upgradeRobot(input.robot) : {};
  const s = clean(input, DEFAULTS);
  s.permissions.folders = [...new Set(s.permissions.folders.filter((f) => typeof f === "string" && f.trim()).map((f) => f.trim()))];
  s.memory.items = s.memory.items
    .filter((m) => m && typeof m.text === "string" && m.text.trim())
    .map((m) => ({ id: String(m.id || Date.now() + Math.random()), text: m.text.trim().slice(0, 2000) }));
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(n) || lo));
  s.font.size = clamp(s.font.size, 12, 22);
  if (!LANGUAGES.includes(s.ui.language)) s.ui.language = "auto";
  if (!CHAT_STYLES.includes(s.chat.style)) s.chat.style = "minimal";
  if (!DENSITIES.includes(s.chat.density)) s.chat.density = "comfortable";
  s.personality.voice = s.personality.voice === 2 ? 2 : 1;
  s.personality.speed = clamp(s.personality.speed, 0, 10);
  s.personality.length = clamp(s.personality.length, 1, 3);
  s.personality.creativity = clamp(s.personality.creativity, 0, 10);
  s.personality.customInstructions = s.personality.customInstructions.slice(0, 5000);
  s.personality.name = s.personality.name.trim().slice(0, 40);
  s.personality.userName = s.personality.userName.trim().slice(0, 40);
  if (!s.aiControl || typeof s.aiControl !== "object") s.aiControl = clone(DEFAULTS.aiControl);
  if (!["fast", "balanced", "deep"].includes(s.aiControl.reasoningEffort)) s.aiControl.reasoningEffort = "balanced";
  s.aiControl.searchGrounding = Boolean(s.aiControl.searchGrounding);
  s.aiControl.confirmTools = Boolean(s.aiControl.confirmTools);
  s.aiControl.contextWindow = clamp(s.aiControl.contextWindow || 20, 5, 50);
  if (!["essential", "all"].includes(s.aiControl.localTools)) s.aiControl.localTools = "essential";
  s.backup.keep = clamp(s.backup.keep, 3, 60);
  const whole = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(n)) || 0)); // like clamp, but 0 stays 0
  s.aiControl.maxTokens = whole(s.aiControl.maxTokens, 0, 200000); // 0 = the AI's own limit
  s.aiControl.replyLanguage = s.aiControl.replyLanguage === "auto" || Object.hasOwn(REPLY_LANGUAGES, s.aiControl.replyLanguage) ? s.aiControl.replyLanguage : "auto";
  s.aiControl.timeoutSeconds = whole(s.aiControl.timeoutSeconds, 0, 3600); // 0 = wait as long as it takes
  s.aiControl.retries = whole(s.aiControl.retries, 0, 5);
  s.privacy.keepChatsDays = whole(s.privacy.keepChatsDays, 0, 3650);
  for (const key of Object.keys(DEFAULTS.privacy.redact)) s.privacy.redact[key] = s.privacy.redact[key] === true;
  s.routing.fallback = ["off", "same-kind"].includes(s.routing.fallback) ? s.routing.fallback : "off";
  s.routing.taskBrain = whole(s.routing.taskBrain, 0, 1e9);
  s.device.profile = ["auto", "light", "balanced", "performance"].includes(s.device.profile) ? s.device.profile : "auto";
  s.device.gpu = ["auto", "off"].includes(s.device.gpu) ? s.device.gpu : "auto";
  s.characters = characters.sanitize(s.characters);
  s.roles = roleData.cleanRoles(s.roles);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.life.briefing.time)) s.life.briefing.time = "08:00";
  s.localNotes.enabled = Boolean(s.localNotes.enabled);
  s.localNotes.folder = typeof s.localNotes.folder === "string" ? s.localNotes.folder.trim().slice(0, 300) : "";
  s.telegram.enabled = Boolean(s.telegram.enabled);
  s.telegram.botToken = typeof s.telegram.botToken === "string" ? s.telegram.botToken.trim().slice(0, 200) : "";
  s.telegram.hasToken = false;
  s.telegram.allowedUserIds = Array.isArray(s.telegram.allowedUserIds) ? s.telegram.allowedUserIds.map(String).filter(Boolean).slice(0, 100) : [];
  s.telegram.pairedUsers = Array.isArray(s.telegram.pairedUsers) ? s.telegram.pairedUsers.map((u) => ({
    id: String(u.id || ""),
    username: String(u.username || "").slice(0, 50),
    firstName: String(u.firstName || "").slice(0, 100),
    role: ["admin", "chat", "notify_only"].includes(u.role) ? u.role : "admin",
    pairedAt: Number(u.pairedAt) || Date.now(),
  })).filter((u) => u.id).slice(0, 50) : [];
  s.telegram.pairedNotice071Seen = Boolean(s.telegram.pairedNotice071Seen);
  s.telegram.allowedChatIds = Array.isArray(s.telegram.allowedChatIds) ? s.telegram.allowedChatIds.map((c) => ({
    id: String(c.id || ""),
    title: String(c.title || "").slice(0, 100),
    type: String(c.type || "group"),
    mode: ["mention_only", "command_only", "all"].includes(c.mode) ? c.mode : "mention_only",
    allowPrivate: Boolean(c.allowPrivate),
  })).filter((c) => c.id).slice(0, 50) : [];
  s.telegram.proxy = typeof s.telegram.proxy === "string" ? s.telegram.proxy.trim().slice(0, 300) : "";
  s.telegram.botApiUrl = typeof s.telegram.botApiUrl === "string" ? s.telegram.botApiUrl.trim().slice(0, 300) : "";
  s.telegram.format = ["markdown", "html", "plain"].includes(s.telegram.format) ? s.telegram.format : "markdown";
  s.telegram.verbosity = ["compact", "normal", "detailed"].includes(s.telegram.verbosity) ? s.telegram.verbosity : "normal";
  s.telegram.streaming = s.telegram.streaming !== false;
  s.telegram.typingIndicator = s.telegram.typingIndicator !== false;
  s.telegram.reactions = s.telegram.reactions !== false;
  s.telegram.disableLinkPreviews = s.telegram.disableLinkPreviews !== false;
  s.telegram.notifyReminders = s.telegram.notifyReminders !== false;
  s.telegram.notifyFocus = s.telegram.notifyFocus !== false;
  s.telegram.groupMode = ["mention_only", "command_only", "all"].includes(s.telegram.groupMode) ? s.telegram.groupMode : "mention_only";
  s.telegram.voiceTranscription = s.telegram.voiceTranscription !== false;
  s.telegram.voiceReply = Boolean(s.telegram.voiceReply);
  s.companion.interests = s.companion.interests.trim().slice(0, 1000);
  const m = s.missions;
  m.workspace = m.workspace.trim().slice(0, 300) || DEFAULTS.missions.workspace;
  m.manager.planModel = m.manager.planModel.trim().slice(0, 120);
  m.manager.fastModel = m.manager.fastModel.trim().slice(0, 120);
  m.caps.maxMinutes = clamp(m.caps.maxMinutes, 1, 24 * 60);
  m.caps.maxSteps = clamp(m.caps.maxSteps, 1, 200);
  m.caps.maxCloudCalls = clamp(m.caps.maxCloudCalls, 0, 2000);
  m.limits.maxMinutes = Math.min(m.caps.maxMinutes, clamp(m.limits.maxMinutes, 1, 24 * 60));
  m.limits.maxSteps = Math.min(m.caps.maxSteps, clamp(m.limits.maxSteps, 1, 200));
  m.limits.maxCloudCalls = Math.min(m.caps.maxCloudCalls, clamp(m.limits.maxCloudCalls, 0, 2000));
  m.maxConcurrent = Math.min(4, Math.max(0, Math.round(Number(m.maxConcurrent)) || 0));
  m.commandTimeoutSeconds = clamp(m.commandTimeoutSeconds, 5, 3600);
  s.specialists.baseUrl = s.specialists.baseUrl.trim().replace(/\/+$/, "").slice(0, 200);
  s.specialists.roles = specialistRoles.sanitize(s.specialists.roles);
  s.voice.style = VOICE.styles.includes(s.voice.style) ? s.voice.style : DEFAULTS.voice.style;
  s.voice.interruptSensitivity = VOICE.sensitivities.includes(s.voice.interruptSensitivity) ? s.voice.interruptSensitivity : DEFAULTS.voice.interruptSensitivity;
  // A key code like "Space" or "KeyX"; anything else (or a key voice mode uses already) is the default
  if (s.voice.interruptKey !== "") s.voice.interruptKey = /^[A-Za-z0-9]{1,20}$/.test(s.voice.interruptKey) && !VOICE.reservedKeys.includes(s.voice.interruptKey) ? s.voice.interruptKey : DEFAULTS.voice.interruptKey;
  if (!ON_AIR.formats.includes(s.onAir.format)) s.onAir.format = "podcast";
  if (!ON_AIR.dynamics.includes(s.onAir.actingDynamic)) s.onAir.actingDynamic = "friends";
  s.onAir.actingBrief = String(s.onAir.actingBrief || "").trim().slice(0, 2000);
  s.onAir.show = s.onAir.show.trim().slice(0, 80);
  s.onAir.audience = s.onAir.audience.trim().slice(0, 300);
  if (!/^#[0-9a-f]{6}$/i.test(s.theme.accent)) s.theme.accent = DEFAULTS.theme.accent;
  if (!THEME_PACKS.includes(s.theme.pack)) s.theme.pack = DEFAULTS.theme.pack;
  if (!["dark", "light", "system"].includes(s.theme.appearance)) s.theme.appearance = DEFAULTS.theme.appearance;
  s.theme.warmth = whole(s.theme.warmth ?? DEFAULTS.theme.warmth, 0, 10);
  if (!ROUNDNESS.includes(s.theme.roundness)) s.theme.roundness = DEFAULTS.theme.roundness;
  if (!ANIMATIONS.includes(s.theme.animation)) s.theme.animation = DEFAULTS.theme.animation;
  s.theme.grain = Boolean(s.theme.grain);
  if (!BACKGROUNDS.includes(s.theme.background)) s.theme.background = DEFAULTS.theme.background;
  if (!SIDEBAR_STYLES.includes(s.theme.sidebarStyle)) s.theme.sidebarStyle = DEFAULTS.theme.sidebarStyle;
  s.theme.timeTint = Boolean(s.theme.timeTint);
  s.theme.characterTint = s.theme.characterTint !== false;
  s.theme.particles = Boolean(s.theme.particles);
  s.sound.enabled = Boolean(s.sound.enabled);
  s.sound.volume = whole(s.sound.volume ?? DEFAULTS.sound.volume, 0, 100);
  s.sound.ui = s.sound.ui !== false;
  s.sound.notifications = s.sound.notifications !== false;
  s.sound.celebrations = s.sound.celebrations !== false;

  s.routing.mode = ROUTING.modes.includes(s.routing.mode) ? s.routing.mode : "fixed";
  s.routing.askBeforeCloud = ROUTING.ask.includes(s.routing.askBeforeCloud) ? s.routing.askBeforeCloud : "chat";
  s.routing.dynamic.slowSeconds = clamp(s.routing.dynamic.slowSeconds, 5, 300);

  const r = s.robot;
  const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
  // (their parts differ by place and slot, so they're cleaned by their own modules, not by clean() above)
  r.design = look.design.sanitizeDesign(raw.design);
  r.room = look.room.sanitizeRoom(raw.room);
  r.looks = look.cleanLooks(raw.looks);
  r.customRooms = look.cleanCustomRooms(raw.customRooms);
  r.cameraMoves = look.cleanCameraMoves(raw.cameraMoves);
  r.shot = oneOf(r.shot, ROBOT.shots, DEFAULTS.robot.shot);
  r.position = oneOf(r.position, ROBOT.positions, DEFAULTS.robot.position);
  r.voicePlace = geometry.cleanPlace(r.voicePlace);
  r.seat = oneOf(r.seat, ROBOT.seats, DEFAULTS.robot.seat);
  r.aiAllowed = Object.fromEntries(Object.keys(DEFAULTS.robot.aiAllowed).map((k) => [k, r.aiAllowed?.[k] !== false]));
  r.interactive = r.interactive !== false;
  r.nameTag = Boolean(r.nameTag);
  r.quality = oneOf(r.quality, ROBOT.qualities, DEFAULTS.robot.quality);
  r.sound.volume = whole(r.sound.volume ?? DEFAULTS.robot.sound.volume, 0, 100);
  const pitch = Number(r.sound.pitch);
  r.sound.pitch = Number.isFinite(pitch) ? Math.min(1.5, Math.max(0.6, Math.round(pitch * 100) / 100)) : 1;
  // Any number of seconds becomes the nearest allowed delay
  const delay = Number.isFinite(r.filming.delay) ? Math.min(10, Math.max(0, r.filming.delay)) : DEFAULTS.robot.filming.delay;
  r.filming.delay = ROBOT.delays.reduce((best, d) => (Math.abs(d - delay) < Math.abs(best - delay) ? d : best));

  if (!s.whiteboard) s.whiteboard = clone(DEFAULTS.whiteboard);
  const wb = s.whiteboard;
  wb.enabled = Boolean(wb.enabled);
  wb.aiDrawing = wb.aiDrawing !== false;
  wb.awareness = oneOf(wb.awareness, WHITEBOARD.awarenesses, DEFAULTS.whiteboard.awareness);
  wb.reactToEdits = oneOf(wb.reactToEdits, WHITEBOARD.reactions, DEFAULTS.whiteboard.reactToEdits);
  wb.initiative = oneOf(wb.initiative, WHITEBOARD.initiatives, DEFAULTS.whiteboard.initiative);
  wb.followRobot = wb.followRobot !== false;
  wb.showRobotCursor = wb.showRobotCursor !== false;
  wb.robotPointer = oneOf(wb.robotPointer, WHITEBOARD.pointers, DEFAULTS.whiteboard.robotPointer);
  wb.showAuthors = oneOf(wb.showAuthors, WHITEBOARD.authorsShown, DEFAULTS.whiteboard.showAuthors);
  wb.animate = wb.animate !== false;
  wb.robotArm = wb.robotArm !== false;
  wb.smartInk = wb.smartInk !== false;
  wb.snapToGrid = Boolean(wb.snapToGrid);
  wb.smartGuides = wb.smartGuides !== false;
  wb.voiceOpen = oneOf(wb.voiceOpen, WHITEBOARD.voiceOpens, DEFAULTS.whiteboard.voiceOpen);
  wb.voiceAutoHide = WHITEBOARD.voiceAutoHides.reduce((best, d) => (Math.abs(d - Number(wb.voiceAutoHide || 0)) < Math.abs(best - Number(wb.voiceAutoHide || 0)) ? d : best), 0);
  wb.writingStyle = WHITEBOARD.writingStyles.includes(wb.writingStyle) ? wb.writingStyle : DEFAULTS.whiteboard.writingStyle;
  wb.writingSpeed = WHITEBOARD.writingSpeeds.includes(wb.writingSpeed) ? wb.writingSpeed : DEFAULTS.whiteboard.writingSpeed;
  if (!/^#[0-9a-f]{6}$/i.test(wb.markerColor)) wb.markerColor = DEFAULTS.whiteboard.markerColor;
  wb.markerSize = whole(wb.markerSize ?? DEFAULTS.whiteboard.markerSize, 1, 32);
  wb.askBeforeDrawOverUser = wb.askBeforeDrawOverUser !== false;
  wb.showInFilming = wb.showInFilming !== false;
  wb.showInRecordings = wb.showInRecordings !== false;
  wb.missionAllowed = wb.missionAllowed !== false;
  wb.voiceAllowed = wb.voiceAllowed !== false;
  wb.chatAllowed = wb.chatAllowed !== false;
  wb.sound = wb.sound !== false;
  wb.dockTheme = WHITEBOARD.dockThemes.includes(wb.dockTheme) ? wb.dockTheme : DEFAULTS.whiteboard.dockTheme;
  wb.windows = geometry.cleanWindows(wb.windows);
  wb.robotWindow = wb.robotWindow !== false;
  wb.inspector = wb.inspector !== false;
  wb.collaborationMode = WHITEBOARD.collaborationModes.includes(wb.collaborationMode) ? wb.collaborationMode : DEFAULTS.whiteboard.collaborationMode;
  wb.autoOpenOnDraw = wb.autoOpenOnDraw !== false;
  wb.dockDefaultOpen = Boolean(wb.dockDefaultOpen);
  wb.bgPattern = WHITEBOARD.bgPatterns.includes(wb.bgPattern) ? wb.bgPattern : DEFAULTS.whiteboard.bgPattern;
  wb.gridSize = whole(wb.gridSize ?? DEFAULTS.whiteboard.gridSize, 12, 64);

  if (!s.subtitles) s.subtitles = clone(DEFAULTS.subtitles);
  const sub = s.subtitles;
  sub.enabled = sub.enabled !== false;
  sub.showInVoice = sub.showInVoice !== false;
  sub.showInDock = sub.showInDock !== false;
  sub.showInRecordings = sub.showInRecordings !== false;
  sub.speakerVisibility = SUBTITLES.speakerVisibilities.includes(sub.speakerVisibility) ? sub.speakerVisibility : DEFAULTS.subtitles.speakerVisibility;
  sub.showSpeakerBadge = sub.showSpeakerBadge !== false;
  sub.placement = SUBTITLES.placements.includes(sub.placement) ? sub.placement : DEFAULTS.subtitles.placement;
  sub.alignment = SUBTITLES.alignments.includes(sub.alignment) ? sub.alignment : DEFAULTS.subtitles.alignment;
  sub.fontFamily = SUBTITLES.fontFamilies.includes(sub.fontFamily) ? sub.fontFamily : DEFAULTS.subtitles.fontFamily;
  sub.fontSize = whole(sub.fontSize ?? DEFAULTS.subtitles.fontSize, 12, 48);
  sub.fontWeight = SUBTITLES.fontWeights.includes(sub.fontWeight) ? sub.fontWeight : DEFAULTS.subtitles.fontWeight;
  sub.lineHeight = ["1.2", "1.4", "1.6"].includes(sub.lineHeight) ? sub.lineHeight : DEFAULTS.subtitles.lineHeight;
  if (!/^#[0-9a-f]{6}$/i.test(sub.textColorRobot)) sub.textColorRobot = DEFAULTS.subtitles.textColorRobot;
  if (!/^#[0-9a-f]{6}$/i.test(sub.textColorUser)) sub.textColorUser = DEFAULTS.subtitles.textColorUser;
  sub.bgStyle = SUBTITLES.bgStyles.includes(sub.bgStyle) ? sub.bgStyle : DEFAULTS.subtitles.bgStyle;
  sub.bgOpacity = whole(sub.bgOpacity ?? DEFAULTS.subtitles.bgOpacity, 0, 100);
  sub.textOutline = SUBTITLES.textOutlines.includes(sub.textOutline) ? sub.textOutline : DEFAULTS.subtitles.textOutline;
  sub.durationSeconds = whole(sub.durationSeconds ?? DEFAULTS.subtitles.durationSeconds, 1, 15);
  sub.wordAnimation = SUBTITLES.wordAnimations.includes(sub.wordAnimation) ? sub.wordAnimation : DEFAULTS.subtitles.wordAnimation;
  sub.maxLines = whole(sub.maxLines ?? DEFAULTS.subtitles.maxLines, 0, 5);

  if (!s.notifications) s.notifications = clone(DEFAULTS.notifications);
  const notif = s.notifications;
  notif.enabled = Boolean(notif.enabled);
  notif.matrix = notif.matrix && typeof notif.matrix === "object" ? notif.matrix : clone(DEFAULTS.notifications.matrix);
  notif.quietHours = notif.quietHours && typeof notif.quietHours === "object" ? notif.quietHours : clone(DEFAULTS.notifications.quietHours);
  notif.quietHours.enabled = Boolean(notif.quietHours.enabled);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(notif.quietHours.start)) notif.quietHours.start = "22:00";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(notif.quietHours.end)) notif.quietHours.end = "08:00";
  notif.quietHours.allowUrgent = notif.quietHours.allowUrgent !== false;
  notif.dnd = notif.dnd && typeof notif.dnd === "object" ? notif.dnd : clone(DEFAULTS.notifications.dnd);
  notif.dnd.enabled = Boolean(notif.dnd.enabled);
  notif.dnd.until = Math.max(0, Number(notif.dnd.until) || 0);
  notif.digest = notif.digest && typeof notif.digest === "object" ? notif.digest : clone(DEFAULTS.notifications.digest);
  notif.digest.enabled = Boolean(notif.digest.enabled);
  notif.digest.mode = ["hourly", "daily"].includes(notif.digest.mode) ? notif.digest.mode : "daily";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(notif.digest.time)) notif.digest.time = "09:00";
  notif.rateLimits = notif.rateLimits && typeof notif.rateLimits === "object" ? notif.rateLimits : clone(DEFAULTS.notifications.rateLimits);
  notif.rateLimits.maxPerMinute = clamp(notif.rateLimits.maxPerMinute, 1, 120);
  notif.rateLimits.maxPerHour = clamp(notif.rateLimits.maxPerHour, 1, 1000);

  if (!s.reddit) s.reddit = clone(DEFAULTS.reddit);
  const red = s.reddit;
  red.enabled = Boolean(red.enabled);
  red.companionEnabled = Boolean(red.companionEnabled);
  red.clientId = typeof red.clientId === "string" ? red.clientId.trim().slice(0, 100) : "";
  red.clientSecret = typeof red.clientSecret === "string" ? red.clientSecret.trim().slice(0, 100) : "";
  red.hasSecret = false;
  red.hasRefreshToken = false;
  red.username = typeof red.username === "string" ? red.username.trim().slice(0, 50) : "";
  red.userAgent = typeof red.userAgent === "string" ? red.userAgent.trim().slice(0, 200) : "";
  red.safeMode = red.safeMode !== false;
  red.cooldownMinutes = clamp(red.cooldownMinutes, 1, 120);
  red.maxPostsPerDay = clamp(red.maxPostsPerDay, 1, 50);
  red.aiDisclosure = red.aiDisclosure !== false;
  red.pollIntervalSeconds = clamp(red.pollIntervalSeconds || 30, 10, 120);
  red.allowedUsers = Array.isArray(red.allowedUsers) ? red.allowedUsers.map((u) => {
    if (typeof u === "string") return { username: u.replace(/^\/?u\//, "").trim().slice(0, 50), role: "chat" };
    return {
      username: String(u.username || "").replace(/^\/?u\//, "").trim().slice(0, 50),
      role: ["admin", "chat", "notify_only"].includes(u.role) ? u.role : "chat",
    };
  }).filter((u) => u.username).slice(0, 50) : [];
  red.respondPM = red.respondPM !== false;
  red.respondMentions = red.respondMentions !== false;
  red.respondComments = Boolean(red.respondComments);
  red.notifyReminders = red.notifyReminders !== false;
  red.notifyMissions = red.notifyMissions !== false;
  red.notifyBriefing = Boolean(red.notifyBriefing);
  red.watchers = Array.isArray(red.watchers) ? red.watchers.map((w) => ({
    id: String(w.id || Date.now().toString(36)),
    subreddit: String(w.subreddit || "").trim().replace(/^r\//, "").slice(0, 50),
    query: String(w.query || "").trim().slice(0, 150),
    scoreThreshold: Math.max(0, Number(w.scoreThreshold) || 0),
    flair: String(w.flair || "").trim().slice(0, 50),
    minAgeMinutes: Math.max(0, Number(w.minAgeMinutes) || 0),
    enabled: w.enabled !== false,
  })).filter((w) => w.subreddit).slice(0, 30) : [];

  return s;
}

let cache = null;

// A bot token that was typed into the settings goes to the system keyring, and out of the settings file
function storeTelegramToken(s) {
  const token = s.telegram.botToken;
  if (token) {
    try {
      keys.setSecret(TELEGRAM_TOKEN_KEY, token);
    } catch {}
    s.telegram.botToken = "";
  }
  s.telegram.hasToken = Boolean(keys.getSecret(TELEGRAM_TOKEN_KEY)) || Boolean(process.env.FRIENDS_TELEGRAM_BOT_TOKEN);
  return Boolean(token);
}

function storeRedditSecret(s) {
  if (!s.reddit) return false;
  const secret = s.reddit.clientSecret;
  if (secret) {
    try {
      keys.setSecret(REDDIT_SECRET_KEY, secret);
    } catch {}
    s.reddit.clientSecret = "";
  }
  s.reddit.hasSecret = Boolean(keys.getSecret(REDDIT_SECRET_KEY));
  s.reddit.hasRefreshToken = Boolean(keys.getSecret(REDDIT_REFRESH_TOKEN_KEY));
  return Boolean(secret);
}

function get() {
  if (cache) return cache;
  let stored = null;
  try {
    stored = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  // Settings from before there were characters: a name you'd given the AI becomes your own character
  const upgraded = stored && characters.migrate(stored, stored.personality);
  cache = sanitize(upgraded ? { ...stored, characters: upgraded } : stored || {});
  // Before the redesign the accent was blue: someone who never changed it (and their built-in Atlas) gets the new one
  if (stored && (stored.ui?.design ?? 1) < 2) {
    if (cache.theme.accent === OLD_ACCENT) cache.theme.accent = DEFAULTS.theme.accent;
    for (const c of cache.characters.list) if (c.look?.accent === OLD_ACCENT) c.look.accent = DEFAULTS.theme.accent;
  }
  cache.ui.design = 2;
  // 0.7.1 migration: keep Missions and Telegram enabled for existing setups that used them
  if (stored) {
    if (stored.missions && stored.missions.enabled !== false) {
      cache.missions.enabled = true;
    } else if (stored.missions?.enabled === undefined) {
      try {
        const missionsDir = path.join(dataDir, "missions");
        if (fs.existsSync(missionsDir) && fs.readdirSync(missionsDir).length > 0) {
          cache.missions.enabled = true;
        }
      } catch {}
    }
    if (stored.telegram && stored.telegram.enabled === true) {
      cache.telegram.enabled = true;
    }
  } else {
    cache.telegram.pairedNotice071Seen = true;
  }
  // Tokens an older version kept in this file move to the keyring
  const changedTg = storeTelegramToken(cache);
  const changedRd = storeRedditSecret(cache);
  if (changedTg || changedRd) writeJson(file, withoutDerived(cache));
  return cache;
}

// fn(settings) after every change (the desktop app follows Settings → Desktop)
const listeners = new Set();
const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));

// What's written to settings.json: without the made-up parts
function withoutDerived(s) {
  const copy = clone(s);
  delete copy.telegram.hasToken;
  copy.telegram.botToken = "";
  if (copy.reddit) {
    delete copy.reddit.hasSecret;
    delete copy.reddit.hasRefreshToken;
    copy.reddit.clientSecret = "";
  }
  return copy;
}

function set(input) {
  cache = sanitize(input);
  storeTelegramToken(cache);
  storeRedditSecret(cache);
  writeJson(file, withoutDerived(cache));
  for (const fn of listeners) {
    try {
      fn(cache);
    } catch {}
  }
  return cache;
}

// Changes some settings and leaves the rest as they are: patch is the parts that differ, { privacy: { localOnly: true } }.
// Objects are merged, anything else (a number, a list) is replaced. This is what the page sends, so it can't overwrite
// what the helper changed meanwhile (the specialists, the missions).
function patch(changes) {
  const merge = (base, extra) => {
    if (!extra || typeof extra !== "object" || Array.isArray(extra)) return extra;
    const out = { ...(base && typeof base === "object" && !Array.isArray(base) ? base : {}) };
    for (const [key, value] of Object.entries(extra)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      out[key] = merge(out[key], value);
    }
    return out;
  };
  return set(merge(clone(get()), changes));
}

// Read settings.json again (after a backup was restored)
function reload() {
  cache = null;
  return get();
}

module.exports = { get, set, patch, reload, onChange, sanitize, DEFAULTS, REPLY_LANGUAGES, ROBOT, ROUTING, ON_AIR, VOICE, THEME_ACCENTS };
