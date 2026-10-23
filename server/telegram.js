// Telegram Bot Companion (server/telegram.js)
// Complete, hardened, and rich Telegram bot connection for Friends.
// Long-polling only (zero open ports, no webhooks), pairing codes, roles,
// message splitting, Markdown/HTML escaping, media handling, and audit-proven resilience.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const settingsModule = require("./settings");
const keys = require("./keys");
const logger = require("./logger");
const life = require("./life");
const localNotes = require("./local-notes");
const { looksLikeMission } = require("../src/js/missions/detect.mjs");
const { say, sayN } = require("./say");

const TOKEN_KEY = "telegram-bot-token";
const DEFAULT_API = "https://api.telegram.org";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cfg = () => settingsModule.get().telegram || {};
const getToken = () => keys.getSecret(TOKEN_KEY) || process.env.FRIENDS_TELEGRAM_BOT_TOKEN || "";

// Custom or standard Bot API URL
function API() {
  const custom = cfg().botApiUrl?.trim();
  if (custom) return custom.replace(/\/+$/, "");
  return process.env.FRIENDS_TELEGRAM_API || DEFAULT_API;
}

const POLL_SECONDS = () => {
  if (process.env.FRIENDS_TELEGRAM_POLL_SECONDS !== undefined) {
    return Number(process.env.FRIENDS_TELEGRAM_POLL_SECONDS);
  }
  return 25;
};

// Rate limiting map for unauthorized spam / flood protection (userId -> [timestamps])
const unauthorizedAttempts = new Map();
const seenUpdateIds = new Set(); // LRU/rolling deduplication
const MAX_SEEN_UPDATES = 1000;

let generation = 0;
let polling = false;
let persistentOffset = 0;
let botUsername = "";
let botId = 0;
let lastError = "";
let isConflict = false;
let isInvalidToken = false;
let lastSuccessfulPoll = 0;
let handlers = { chat: null, googleToken: async () => null, vision: null, transcribe: null, tts: null };
const awaitingAnswers = new Map(); // chat id → mission id
const suggestions = new Map(); // short key → { text, chatId }

// One-time pairing code state
let activePairing = null; // { code: "123456", expiresAt: number }

const setHandlers = (h) => (handlers = { ...handlers, ...h });

// ---------- Authorization & Roles ----------
// Allowed users come from:
// 1. pairedUsers [{ id, role }]
// 2. legacy allowedUserIds
function getPairedUsers() {
  return cfg().pairedUsers || [];
}

function getAllowedChatIds() {
  return (cfg().allowedChatIds || []).map((c) => String(c.id || c));
}

function allowedIds() {
  const c = cfg();
  const paired = (c.pairedUsers || []).map((u) => String(u.id));
  const legacy = (c.allowedUserIds || []).map(String);
  return [...new Set([...paired, ...legacy])];
}

function getUserRole(fromId) {
  const idStr = String(fromId);
  const paired = (cfg().pairedUsers || []).find((u) => String(u.id) === idStr);
  if (paired && paired.role) return paired.role;
  // Legacy allowed user IDs have full admin role
  if ((cfg().allowedUserIds || []).map(String).includes(idStr)) return "admin";
  return null;
}

function canUserChat(fromId) {
  const role = getUserRole(fromId);
  return role === "admin" || role === "chat";
}

function canUserAdmin(fromId) {
  const role = getUserRole(fromId);
  return role === "admin";
}

// Pairing code workflow
function createPairingCode() {
  const code = crypto.randomInt(100000, 1000000).toString();
  activePairing = {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    wrongAttempts: 0,
  };
  return activePairing;
}

function getPairingStatus() {
  if (!activePairing || Date.now() > activePairing.expiresAt) {
    activePairing = null;
    return { active: false };
  }
  return {
    active: true,
    code: activePairing.code,
    remainingSeconds: Math.max(0, Math.round((activePairing.expiresAt - Date.now()) / 1000)),
  };
}

function revokePairedUser(userId) {
  const s = settingsModule.get();
  const currentPaired = s.telegram.pairedUsers || [];
  const currentAllowed = s.telegram.allowedUserIds || [];
  const newPaired = currentPaired.filter((u) => String(u.id) !== String(userId));
  const newAllowed = currentAllowed.filter((id) => String(id) !== String(userId));
  settingsModule.set({
    ...s,
    telegram: {
      ...s.telegram,
      pairedUsers: newPaired,
      allowedUserIds: newAllowed,
    },
  });
  return true;
}

function setPairedUserRole(userId, newRole) {
  if (!["admin", "chat", "notify_only"].includes(newRole)) return false;
  const s = settingsModule.get();
  const currentPaired = s.telegram.pairedUsers || [];
  const updated = currentPaired.map((u) => {
    if (String(u.id) === String(userId)) {
      return { ...u, role: newRole };
    }
    return u;
  });
  settingsModule.set({
    ...s,
    telegram: {
      ...s.telegram,
      pairedUsers: updated,
    },
  });
  return true;
}

// Flood protection for unauthorized incoming attempts
function isFlooding(fromId) {
  const now = Date.now();
  let attempts = unauthorizedAttempts.get(fromId) || [];
  attempts = attempts.filter((t) => now - t < 60000); // 1 min window
  if (attempts.length >= 10) return true;
  attempts.push(now);
  unauthorizedAttempts.set(fromId, attempts);
  return false;
}

// ---------- Formatting & Boundary Splitting ----------
function escapeMarkdownV2(text) {
  if (!text) return "";
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Safely split text into chunks <= maxLen at paragraph, line, or sentence boundaries
function splitMessage(text, maxLen = 4000) {
  const str = String(text || "");
  if (str.length <= maxLen) return [str];

  const chunks = [];
  let remaining = str;

  while (remaining.length > maxLen) {
    let splitIdx = -1;

    // 1. Try splitting at paragraph break within bounds
    const paraIdx = remaining.lastIndexOf("\n\n", maxLen);
    if (paraIdx > maxLen * 0.4) {
      splitIdx = paraIdx + 2;
    } else {
      // 2. Try splitting at line break
      const lineIdx = remaining.lastIndexOf("\n", maxLen);
      if (lineIdx > maxLen * 0.4) {
        splitIdx = lineIdx + 1;
      } else {
        // 3. Try splitting at sentence break
        const match = remaining.slice(0, maxLen).match(/.*[.!?]\s+/);
        if (match && match[0].length > maxLen * 0.4) {
          splitIdx = match[0].length;
        } else {
          // 4. Try splitting at space
          const spaceIdx = remaining.lastIndexOf(" ", maxLen);
          if (spaceIdx > maxLen * 0.3) {
            splitIdx = spaceIdx + 1;
          } else {
            // Hard cut
            splitIdx = maxLen;
          }
        }
      }
    }

    chunks.push(remaining.slice(0, splitIdx).trimEnd());
    remaining = remaining.slice(splitIdx).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

// ---------- Telegram HTTP API Call ----------
async function apiCall(method, params = {}, token = getToken(), timeoutMs = 35000) {
  if (!token) throw new Error(say("No Telegram bot token configured."));

  const url = `${API()}/bot${token}/${method}`;
  let res;

  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new Error(err.name === "TimeoutError" ? say("Telegram API timeout") : say("Couldn't reach Telegram: {reason}", { reason: err.message }));
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(say("Telegram answered {status}, which isn't readable.", { status: res.status }));
  }

  if (!data.ok) {
    const error = new Error(data.description || `Telegram error ${res.status}`);
    error.status = res.status;
    error.description = data.description;
    error.retryAfter = data.parameters?.retry_after;
    error.isRateLimit = res.status === 429;
    error.isConflict = res.status === 409;
    error.isInvalidToken = res.status === 401;
    throw error;
  }

  return data.result;
}

// Send message with automatic multi-chunk splitting and formatting
async function sendMessage(chatId, text, options = {}) {
  const chunks = splitMessage(text, 4000);
  let lastResult = null;

  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const body = {
      chat_id: chatId,
      text: chunks[i],
      disable_web_page_preview: options.disableLinkPreviews !== false,
      disable_notification: Boolean(options.silent),
    };

    if (options.parseMode) {
      body.parse_mode = options.parseMode;
    }

    if (isLast && options.buttons) {
      body.reply_markup = {
        inline_keyboard: options.buttons.map((row) =>
          row.map((b) => ({ text: b.text, callback_data: b.data }))
        ),
      };
    }

    try {
      lastResult = await apiCall("sendMessage", body);
    } catch (err) {
      logger.warn(`Telegram sendMessage to ${chatId} chunk ${i + 1}/${chunks.length} failed:`, err.message);
      return null;
    }
  }

  return lastResult;
}

// Outbound media helpers: photo & document
async function sendPhoto(chatId, photo, caption = "", options = {}) {
  const body = {
    chat_id: chatId,
    photo,
  };
  if (caption) body.caption = String(caption).slice(0, 1024);
  if (options.buttons) {
    body.reply_markup = {
      inline_keyboard: options.buttons.map((row) =>
        row.map((b) => ({ text: b.text, callback_data: b.data }))
      ),
    };
  }
  return apiCall("sendPhoto", body);
}

async function sendDocument(chatId, document, caption = "", options = {}) {
  const body = {
    chat_id: chatId,
    document,
  };
  if (caption) body.caption = String(caption).slice(0, 1024);
  if (options.buttons) {
    body.reply_markup = {
      inline_keyboard: options.buttons.map((row) =>
        row.map((b) => ({ text: b.text, callback_data: b.data }))
      ),
    };
  }
  return apiCall("sendDocument", body);
}

// Stream reply helper: edits existing message throttled to >= 1200ms
function createStreamReply(chatId) {
  let messageId = null;
  let lastEditMs = 0;
  let pendingText = "";
  let isDone = false;

  const flush = async () => {
    if (!messageId || !pendingText || isDone) return;
    try {
      lastEditMs = Date.now();
      await apiCall("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: pendingText.slice(0, 4000),
      });
    } catch (err) {
      logger.debug("Streaming edit notice:", err.message);
    }
  };

  return {
    update: async (text) => {
      pendingText = String(text || "");
      if (!messageId) {
        // Send initial message
        const res = await sendMessage(chatId, pendingText.slice(0, 4000) || "…");
        if (res && res.message_id) {
          messageId = res.message_id;
          lastEditMs = Date.now();
        }
        return;
      }
      if (Date.now() - lastEditMs >= 1200) {
        await flush();
      }
    },
    finish: async (finalText) => {
      isDone = true;
      if (!messageId) {
        return sendMessage(chatId, finalText);
      }
      try {
        await apiCall("editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text: String(finalText || pendingText).slice(0, 4000),
        });
      } catch {
        return sendMessage(chatId, finalText);
      }
    },
  };
}

// Send alert to all authorized/paired users
async function sendAlert(text, options = {}) {
  const users = getPairedUsers();
  const legacyIds = (cfg().allowedUserIds || []).map(String);
  
  // Recipients with role admin or notify_only or legacy allowed
  const recipientIds = new Set();
  for (const u of users) {
    if (u.role === "admin" || u.role === "notify_only" || u.role === "chat") {
      recipientIds.add(String(u.id));
    }
  }
  for (const id of legacyIds) {
    recipientIds.add(id);
  }

  const ids = [...recipientIds];
  await Promise.all(ids.map((id) => sendMessage(id, text, options)));
  return ids.length;
}

const ready = () => polling && allowedIds().length > 0;

// ---------- Status & Health ----------
function status() {
  const c = cfg();
  const res = {
    enabled: c.enabled === true,
    hasToken: Boolean(getToken()),
    running: polling,
    botUsername,
    lastError,
    allowed: allowedIds().length,
  };
  Object.defineProperties(res, {
    botId: { value: botId, enumerable: false, writable: true },
    pairedCount: { value: (c.pairedUsers || []).length, enumerable: false, writable: true },
    allowedCount: { value: allowedIds().length, enumerable: false, writable: true },
    groupMode: { value: c.groupMode || "mention_only", enumerable: false, writable: true },
    proxy: { value: c.proxy || "", enumerable: false, writable: true },
    botApiUrl: { value: API(), enumerable: false, writable: true },
    isConflict: { value: isConflict, enumerable: false, writable: true },
    isInvalidToken: { value: isInvalidToken, enumerable: false, writable: true },
    lastSuccessfulPoll: { value: lastSuccessfulPoll, enumerable: false, writable: true },
  });
  return res;
}

function health() {
  const c = cfg();
  return {
    enabled: c.enabled === true,
    hasToken: Boolean(getToken()),
    running: polling,
    botUsername,
    botId,
    lastError,
    isConflict,
    isInvalidToken,
    lastSuccessfulPoll,
    pairedCount: (c.pairedUsers || []).length,
    allowedCount: allowedIds().length,
    groupMode: c.groupMode || "mention_only",
    proxy: c.proxy || "",
    botApiUrl: API(),
  };
}

function saveToken(token) {
  if (typeof token === "string" && token.trim()) {
    keys.setSecret(TOKEN_KEY, token.trim());
  } else {
    keys.deleteSecret(TOKEN_KEY);
  }
  botUsername = "";
  botId = 0;
  lastError = "";
  isConflict = false;
  isInvalidToken = false;
  sync(true);
  return status();
}

async function testConnection(token = getToken()) {
  if (!token) throw new Error(say("No token yet. Paste the token from @BotFather and press Save."));
  isConflict = false;
  isInvalidToken = false;
  const me = await apiCall("getMe", {}, token, 15000);
  botUsername = me.username || botUsername;
  botId = me.id || botId;
  return { ok: true, bot: me };
}

// Auto-register commands with setMyCommands
async function registerCommands(token = getToken()) {
  const commands = [
    { command: "start", description: "Get started with your Friends companion" },
    { command: "help", description: "Show available commands and usage" },
    { command: "status", description: "Check current system and mission status" },
    { command: "ask", description: "Ask a question to your companion" },
    { command: "mission", description: "Start an autonomous background mission" },
    { command: "missions", description: "List active and recent missions" },
    { command: "stop", description: "Stop all running missions immediately" },
    { command: "today", description: "View today's agenda, tasks, and habits" },
    { command: "tasks", description: "List open tasks and to-dos" },
    { command: "remind", description: "Set a reminder (e.g. /remind Call Mom in 30)" },
    { command: "note", description: "Add a quick thought to your daily note" },
    { command: "briefing", description: "Generate or view today's daily briefing" },
    { command: "whiteboard", description: "Get a summary of the active whiteboard" },
    { command: "character", description: "Switch or view active companion character" },
    { command: "mode", description: "Check or switch AI mode (private, local, cloud)" },
    { command: "mute", description: "Toggle quiet hours or notifications" },
    { command: "settings", description: "View connected status and settings" },
  ];
  try {
    await apiCall("setMyCommands", { commands }, token);
    logger.info("Telegram commands registered successfully.");
    return true;
  } catch (err) {
    logger.warn("Telegram setMyCommands notice:", err.message);
    return false;
  }
}

const help = () =>
  [
    say("Hello! I'm your Friends companion."),
    "",
    say("Just write to me, or use:"),
    say("/mission <goal>: I make a plan, you approve it once, and I do it in the background"),
    say("/missions: what's going on"),
    say("/stop: stop every mission right now"),
    say("/today, /tasks, /remind <text> in <minutes>, /note <text>"),
  ].join("\n");

const runner = () => require("./missions/runner");
const store = () => require("./missions/store");
const short = (text, n = 160) => String(text || "").replace(/\s+/g, " ").trim().slice(0, n);

function planMessage(m) {
  const p = m.plan;
  const lines = [say("A plan to approve: {title}", { title: m.title }), "", p.summary || "", "", say("Steps:")];
  p.steps.forEach((s, i) => lines.push(`${i + 1}. ${s.title}`));
  const actions = p.actions || [];
  lines.push("", actions.length ? say("Approving covers exactly this, and nothing else:") : say("It changes nothing outside its own folder."));
  for (const a of actions.slice(0, 14)) lines.push(`• [${a.risk}] ${a.summary}`);
  if (actions.length > 14) lines.push(say("… and {count} more (see the app)", { count: actions.length - 14 }));
  lines.push("", say("Limits: {minutes} min, {steps} steps, {calls} cloud calls.", { minutes: p.limits.maxMinutes, steps: p.limits.maxSteps, calls: p.limits.maxCloudCalls }) + (m.private ? ` ${say("Private: only models on this computer.")}` : ""));
  return lines.join("\n");
}

function statusText(m) {
  const p = m.progress;
  switch (m.status) {
    case "running":
      return `${say("running")}${p.total ? say(", {done} of {total} steps", { done: p.done, total: p.total }) : ""}${p.current ? ` (${p.current.title})` : ""}`;
    case "paused":
      return say("paused: {reason}", { reason: short(m.pause?.message || m.pause?.kind, 90) });
    case "awaiting_approval":
      return say("waiting for your approval");
    case "clarifying":
      return say("waiting for your answers");
    case "done":
      return say("done");
    case "planning":
      return say("making a plan");
    case "failed":
      return say("didn't work out");
    case "stopped":
      return say("stopped");
    default:
      return m.status;
  }
}

function startMission(chatId, goal) {
  try {
    const m = runner().create(goal, { source: "telegram" });
    const mission = store().get(m.id);
    mission.telegramChat = String(chatId);
    store().save(mission);
    return sendMessage(chatId, say("On it: {goal}\nI'll make a plan (and ask if I need to). Stop me any time with /stop.", { goal: short(goal, 120) }));
  } catch (err) {
    return sendMessage(chatId, say("Couldn't start it: {reason}", { reason: err.message }));
  }
}

async function handleCommand(chatId, text, msg = {}) {
  const [cmd, ...rest] = text.split(/\s+/);
  const arg = rest.join(" ").trim();
  const name = cmd.toLowerCase().replace(/@.*$/, "");
  const fromId = String(msg.from?.id || chatId);

  // Pairing command can be issued by anyone with a valid code
  if (name === "/pair") {
    if (!arg) {
      return sendMessage(chatId, say("To pair, open Settings → Telegram in the app, click 'Generate pairing code', and send: /pair <code>."));
    }
    const cleanArg = arg.trim();
    if (!activePairing || Date.now() > activePairing.expiresAt) {
      activePairing = null;
      return sendMessage(chatId, say("That pairing code is invalid or has expired. Generate a new code in the app."));
    }
    if (activePairing.code !== cleanArg) {
      activePairing.wrongAttempts = (activePairing.wrongAttempts || 0) + 1;
      if (activePairing.wrongAttempts >= 5) {
        activePairing = null;
        logger.warn("Telegram pairing code invalidated after 5 wrong attempts");
        handlers.onPairingBurned?.();
        try {
          const notifications = require("./notifications");
          notifications.dispatch("watch_alert", {
            title: say("Telegram pairing code invalidated"),
            body: say("A pairing code was burned after 5 wrong attempts."),
            urgent: true,
          });
        } catch {}
      }
      return sendMessage(chatId, say("That pairing code is invalid or has expired. Generate a new code in the app."));
    }

    // Valid pairing!
    activePairing = null;
    const s = settingsModule.get();
    const currentPaired = s.telegram.pairedUsers || [];
    const isFirstUser = currentPaired.length === 0 && (s.telegram.allowedUserIds || []).length === 0;
    const role = isFirstUser ? "admin" : "chat";

    const newUser = {
      id: fromId,
      username: msg.from?.username || "",
      firstName: msg.from?.first_name || "",
      role,
      pairedAt: Date.now(),
    };

    const updatedPaired = [...currentPaired.filter((u) => String(u.id) !== fromId), newUser];
    const updatedAllowed = [...new Set([...(s.telegram.allowedUserIds || []).map(String), fromId])];
    settingsModule.set({
      ...s,
      telegram: {
        ...s.telegram,
        pairedUsers: updatedPaired,
        allowedUserIds: updatedAllowed,
      },
    });

    return sendMessage(chatId, say("Pairing successful! You are connected to Friends as {role}. Type /help to see commands.", { role }));
  }

  // All other commands require at least chat permission
  if (!canUserChat(fromId)) {
    const isGroup = msg.chat?.type === "group" || msg.chat?.type === "supergroup";
    if (!isGroup) {
      return sendMessage(chatId, say("To use this bot, pair it in the app: send /pair <code>."));
    }
    return;
  }

  switch (name) {
    case "/start":
    case "/help":
      return sendMessage(chatId, help());

    case "/today":
    case "/briefing": {
      const t = life.today();
      return sendMessage(chatId, [say("Today ({date}):", { date: t.date }), ...life.agenda()].join("\n"));
    }

    case "/tasks": {
      const tasks = life.listTasks().filter((t) => !t.done);
      if (!tasks.length) return sendMessage(chatId, say("No open tasks."));
      return sendMessage(chatId, `${say("Open tasks:")}\n${tasks.slice(0, 15).map((t) => `• ${t.title}${t.due ? ` (${say("due {date}", { date: t.due })})` : ""}`).join("\n")}`);
    }

    case "/remind": {
      const match = arg.match(/^(.*?)\s+in\s+(\d+)\s*(?:m|min|mins|minutes)?$/i);
      if (!match) return sendMessage(chatId, say("Say it like this: /remind call the bank in 30"));
      life.addReminder({ text: match[1].trim(), inMinutes: Number(match[2]) });
      return sendMessage(chatId, sayN("Reminder set for “{text}” in {n} minute.", "Reminder set for “{text}” in {n} minutes.", Number(match[2]), { text: match[1].trim() }));
    }

    case "/note": {
      if (!arg) return sendMessage(chatId, say("Say it like this: /note a thought"));
      await localNotes.appendToNote("today", arg);
      return sendMessage(chatId, say("Added to today's note."));
    }

    case "/mission": {
      if (!canUserAdmin(fromId)) {
        return sendMessage(chatId, say("Only admin users may start autonomous missions."));
      }
      if (!arg) return sendMessage(chatId, say("Tell me the goal: /mission research the best budget laptops and write a short report"));
      return startMission(chatId, arg);
    }

    case "/missions":
    case "/status": {
      const list = runner().list().filter((m) => !["done", "failed", "stopped"].includes(m.status) || Date.now() - m.updatedAt < 24 * 3600 * 1000);
      const lines = [];
      if (list.length) {
        lines.push(say("Missions:"));
        list.slice(0, 8).forEach((m) => lines.push(`• ${m.title}: ${statusText(m)}`));
      } else {
        lines.push(say("No active missions right now."));
      }
      const models = require("./models").status();
      if (models.loaded) {
        lines.push("", say("Model loaded: {model}", { model: models.loaded.model }) + (models.loaded.role ? ` (${models.loaded.role})` : ""));
      }
      return sendMessage(chatId, lines.join("\n"));
    }

    case "/stop": {
      if (!canUserAdmin(fromId)) {
        return sendMessage(chatId, say("Only admin users may stop missions."));
      }
      const live = runner().list().filter((m) => ["planning", "clarifying", "awaiting_approval", "running", "paused"].includes(m.status));
      for (const m of live) runner().stop(m.id);
      return sendMessage(chatId, live.length ? sayN("Stopped {n} mission.", "Stopped {n} missions.", live.length) : say("Nothing was running."));
    }

    case "/whiteboard": {
      try {
        const wb = require("./whiteboard");
        const active = wb.getActive("main");
        if (!active || !active.pages || !active.pages[0]) {
          return sendMessage(chatId, say("No active whiteboard found."));
        }
        const textSummary = wb.exportBoard(active.id, "markdown");
        const wantsSnapshot = text.includes("snapshot") || text.includes("photo") || text.includes("image");
        const photoUrl = active.snapshot || active.pages[0]?.items?.find((i) => i.type === "image")?.url;
        if (wantsSnapshot && photoUrl) {
          return sendPhoto(chatId, photoUrl, `${say("Active Whiteboard: {title}", { title: active.title })}\n\n${textSummary.slice(0, 1000)}`);
        }
        return sendMessage(chatId, `${say("Active Whiteboard: {title}", { title: active.title })}\n\n${textSummary.slice(0, 3000)}`);
      } catch (err) {
        return sendMessage(chatId, say("Couldn't read whiteboard: {reason}", { reason: err.message }));
      }
    }

    case "/character": {
      const s = settingsModule.get();
      const activeChar = s.characters?.list?.find((c) => c.id === s.characters?.active) || s.characters?.list?.[0];
      return sendMessage(chatId, say("Current character: {name}", { name: activeChar?.name || "Atlas" }));
    }

    case "/mode": {
      const s = settingsModule.get();
      const isPrivate = s.privacy?.localOnly === true;
      return sendMessage(chatId, isPrivate ? say("Private Mode: ON (strictly local models only)") : say("Cloud Mode: ON (cloud models permitted)"));
    }

    case "/settings": {
      const uRole = getUserRole(fromId);
      return sendMessage(chatId, `${say("Connected to Friends Bot")}\n${say("Your Role: {role}", { role: uRole })}\n${say("Server Version: {v}", { v: require("./config").version })}`);
    }

    default:
      return sendMessage(chatId, `${say("I don't know {name}.", { name })} ${help()}`);
  }
}

// ---------- Media Inbound Handling ----------
async function handleMedia(msg) {
  const chatId = msg.chat?.id;
  const fromId = String(msg.from?.id || "");
  const isGroup = msg.chat?.type === "group" || msg.chat?.type === "supergroup";

  if (!canUserChat(fromId)) {
    if (!isGroup) {
      sendMessage(chatId, say("To use this bot, pair it in the app: send /pair <code>."));
    }
    return;
  }

  // 1. Voice Note / Audio
  if (msg.voice || msg.audio) {
    const fileId = msg.voice?.file_id || msg.audio?.file_id;
    apiCall("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
    
    if (typeof handlers.transcribe === "function") {
      try {
        const text = await handlers.transcribe(fileId, { platform: "telegram" });
        if (text) {
          await sendMessage(chatId, `🎤 "${text}"`);
          return chatReply(chatId, text, { fromId });
        }
      } catch (err) {
        return sendMessage(chatId, say("Couldn't transcribe voice note: {reason}", { reason: err.message }));
      }
    }
    return sendMessage(chatId, say("Voice note received. To enable transcription, configure speech settings in the app."));
  }

  // 2. Photo
  if (msg.photo && Array.isArray(msg.photo) && msg.photo.length > 0) {
    const highestRes = msg.photo[msg.photo.length - 1];
    const caption = (msg.caption || "").trim();
    apiCall("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});

    if (typeof handlers.vision === "function") {
      try {
        const reply = await handlers.vision(highestRes.file_id, caption, { platform: "telegram" });
        if (reply) return sendMessage(chatId, reply);
      } catch (err) {
        return sendMessage(chatId, say("Couldn't process photo: {reason}", { reason: err.message }));
      }
    }
    return sendMessage(chatId, say("Photo received. Add a vision model in Settings → AI to talk about images."));
  }

  // 3. Document
  if (msg.document) {
    const fileName = msg.document.file_name || "document";
    return sendMessage(chatId, say("Received document “{name}”. You can attach files in the app or use them in missions.", { name: fileName }));
  }
}

// ---------- Message Dispatcher ----------
async function handleMessage(msg) {
  if (!msg || !msg.chat) return;

  const fromId = String(msg.from?.id || "");
  const chatId = msg.chat.id;
  const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
  const text = (msg.text || "").trim();

  // Handle pairing command before authorization check
  if (text.startsWith("/pair")) {
    return handleCommand(chatId, text, msg);
  }

  // Check pairing and role on every message, in all chats.
  // Anyone who is not paired gets nothing. In a group, drop silently (no reply, no AI call).
  // In private chats, give a short hint.
  if (!canUserChat(fromId)) {
    if (isGroup) {
      return; // Silent drop in groups
    }
    logger.warn(`Rejected unauthorized Telegram message from ${fromId}`);
    return sendMessage(chatId, say("To use this bot, pair it in the app: send /pair <code>."));
  }

  // Group chat filtering by groupMode
  if (isGroup) {
    const gMode = cfg().groupMode || "mention_only";
    const allowedChats = getAllowedChatIds();
    // If specific group chats are configured, check membership
    if (allowedChats.length > 0 && !allowedChats.includes(String(chatId))) {
      return;
    }

    if (gMode === "mention_only") {
      const botMention = `@${botUsername}`.toLowerCase();
      const hasMention = text.toLowerCase().includes(botMention);
      const isReplyToBot = msg.reply_to_message?.from?.id === botId;
      if (!hasMention && !isReplyToBot) {
        return; // Ignore general chatter
      }
    } else if (gMode === "command_only") {
      if (!text.startsWith("/")) return;
    }
  }

  // Handle media messages (photos, voice, audio, documents)
  if (!text && (msg.photo || msg.voice || msg.audio || msg.document)) {
    return handleMedia(msg);
  }

  if (!text) {
    return sendMessage(chatId, say("I can read text and voice notes. Type a message or send /help."));
  }

  // Strip bot username mention if in group: e.g. /mission@my_bot -> /mission
  const cleanText = text.replace(new RegExp(`@${botUsername}\\b`, "i"), "").trim();

  if (cleanText.startsWith("/")) {
    return handleCommand(chatId, cleanText, msg);
  }

  // Mission clarifying answers
  const waiting = awaitingAnswers.get(String(chatId));
  const mission = waiting && store().find(waiting);
  if (mission && mission.status === "clarifying") {
    awaitingAnswers.delete(String(chatId));
    const lines = cleanText.split("\n").map((l) => l.replace(/^\s*(\d+[.)]|[-•])\s*/, "").trim()).filter(Boolean);
    const qs = mission.clarify.questions;
    const answers = qs.map((q, i) => ({ id: q.id, text: lines.length === qs.length ? lines[i] : cleanText }));
    try {
      runner().answer(mission.id, answers);
      return sendMessage(chatId, say("Thanks, making the plan."));
    } catch (err) {
      return sendMessage(chatId, err.message);
    }
  }

  // Mission goal suggestion
  if (looksLikeMission(cleanText) && settingsModule.get().missions?.enabled !== false && canUserAdmin(fromId)) {
    const key = Math.random().toString(36).slice(2, 8);
    suggestions.set(key, { text: cleanText, chatId });
    if (suggestions.size > 50) suggestions.delete(suggestions.keys().next().value);
    return sendMessage(chatId, say("That sounds like something to carry out in the background. Make it a mission? (I'll make a plan first, and you approve it.)"), {
      buttons: [[{ text: say("Start a mission"), data: `s:${key}:go` }, { text: say("Just talk"), data: `s:${key}:chat` }]],
    });
  }

  return chatReply(chatId, cleanText, { fromId, isGroup });
}

async function chatReply(chatId, text, { fromId, isGroup = false } = {}) {
  if (!handlers.chat) {
    return sendMessage(chatId, say("No AI is set up yet. Add one in Settings → AI & privacy."));
  }

  // Withhold private data in groups by default
  let onAir = false;
  let withhold = false;
  if (isGroup) {
    const groupConfig = (cfg().allowedChatIds || []).find((c) => String(c.id || c) === String(chatId));
    const allowPrivate = Boolean(groupConfig && groupConfig.allowPrivate === true);
    if (!allowPrivate) {
      onAir = true;
      withhold = true;
    }
  }

  apiCall("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  
  // Streaming reply if enabled
  const streamEnabled = cfg().streaming !== false;
  if (streamEnabled && typeof handlers.chatStream === "function") {
    const streamer = createStreamReply(chatId);
    try {
      await handlers.chatStream(text, {
        platform: "telegram",
        fromId,
        chatId,
        isGroup,
        onAir,
        withhold,
        onToken: (tok, full) => streamer.update(full),
      });
      return;
    } catch (err) {
      logger.debug("Chat stream error, falling back to batch:", err.message);
    }
  }

  try {
    const reply = await handlers.chat(text, { platform: "telegram", fromId, chatId, isGroup, onAir, withhold });
    if (reply) await sendMessage(chatId, reply);
  } catch (err) {
    await sendMessage(chatId, say("Couldn't answer: {reason}", { reason: err.message }));
  }
}

// ---------- Callback Queries (Inline Buttons) ----------
async function handleCallback(cb) {
  const fromId = String(cb.from?.id || "");
  const chatId = cb.message?.chat?.id;
  const answer = (text) => apiCall("answerCallbackQuery", { callback_query_id: cb.id, text: String(text || "").slice(0, 150) }).catch(() => {});
  const clear = () => cb.message && apiCall("editMessageReplyMarkup", { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});

  if (!canUserAdmin(fromId)) {
    return answer(say("Only admins can perform approval actions."));
  }

  const [kind, id, extra, verdict] = String(cb.data || "").split(":");
  try {
    if (kind === "m") {
      const m = store().find(id);
      if (!m || (m.status !== "awaiting_approval" && m.status !== "running" && m.status !== "planning")) {
        await clear();
        return answer(say("This mission request is no longer active."));
      }
      if (extra === "approve") {
        runner().approve(id);
        await clear();
        await answer(say("Approved"));
        return sendMessage(chatId, say("Approved. It's running in the background. I'll tell you when it's done, and /stop stops it."));
      }
      if (extra === "stop") {
        runner().stop(id);
        await clear();
        await answer(say("Stopped"));
        return sendMessage(chatId, say("Stopped."));
      }
    } else if (kind === "d") {
      const m = store().find(id);
      const request = m?.pause?.request;
      if (!request || !request.id.startsWith(extra)) {
        await clear();
        return answer(say("That request was already answered or expired."));
      }
      runner().decide(id, request.id, verdict === "y");
      await clear();
      return answer(verdict === "y" ? say("Allowed") : say("Declined"));
    } else if (kind === "s") {
      const pending = suggestions.get(id);
      suggestions.delete(id);
      await clear();
      if (!pending) return answer(say("That suggestion expired."));
      await answer(extra === "go" ? say("Starting") : say("OK"));
      return extra === "go" ? startMission(chatId, pending.text) : chatReply(chatId, pending.text, { fromId });
    }
  } catch (err) {
    await answer(err.message);
    return sendMessage(chatId, err.message);
  }
  return answer("");
}

// ---------- Missions Event Listener ----------
function chatsFor(missionId) {
  const m = missionId && store().find(missionId);
  return m?.telegramChat ? [m.telegramChat] : allowedIds();
}

async function onMissionEvent(e) {
  if (!ready() || settingsModule.get().missions?.notify?.telegram === false) return;
  const id = e.mission?.id;
  const chats = chatsFor(id);

  if (e.type === "questions") {
    const text = `${say("A few questions before I plan:")}\n${e.questions.map((q, i) => `${i + 1}. ${q.text}`).join("\n")}\n\n${say("Answer in one message (one line per question).")}`;
    for (const c of chats) {
      awaitingAnswers.set(String(c), id);
      await sendMessage(c, text);
    }
  } else if (e.type === "plan-ready") {
    const m = runner().get(id);
    for (const c of chats) {
      await sendMessage(c, planMessage(m), {
        buttons: [[{ text: say("Approve"), data: `m:${id}:approve` }, { text: say("Stop"), data: `m:${id}:stop` }]],
      });
    }
  } else if (e.type === "approval" && e.request) {
    const r = e.request;
    const text = say("{title} needs your OK:\n{summary}\n\nWhy it asks: {why}.", {
      title: e.mission.title,
      summary: r.summary,
      why: r.why || say("it isn't in the approved plan"),
    });
    for (const c of chats) {
      await sendMessage(c, text, {
        buttons: [[{ text: say("Allow"), data: `d:${id}:${r.id.slice(0, 8)}:y` }, { text: say("No"), data: `d:${id}:${r.id.slice(0, 8)}:n` }]],
      });
    }
  } else if (e.notify) {
    for (const c of chats) {
      await sendMessage(c, `${e.notify.title}\n${e.notify.body}`);
    }
  }
}

// ---------- Dispatch & Deduplication ----------
async function dispatch(update) {
  if (!update || typeof update !== "object") return;
  const uid = update.update_id;
  if (uid) {
    if (seenUpdateIds.has(uid)) return; // Prevent duplicate execution
    seenUpdateIds.add(uid);
    if (seenUpdateIds.size > MAX_SEEN_UPDATES) {
      const oldest = seenUpdateIds.values().next().value;
      seenUpdateIds.delete(oldest);
    }
  }

  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message) {
      await handleMessage(update.message);
    }
    // Ignore unsupported types gracefully: edited_message, channel_post, my_chat_member
  } catch (err) {
    logger.warn("Telegram update dispatch error:", err.message);
  }
}

// ---------- Long Polling Loop ----------
async function loop(gen) {
  polling = true;
  let wait = 2000;

  while (gen === generation) {
    try {
      const seconds = POLL_SECONDS();
      const updates = await apiCall(
        "getUpdates",
        {
          offset: persistentOffset,
          timeout: seconds,
          allowed_updates: ["message", "callback_query"],
        },
        getToken(),
        (seconds + 15) * 1000
      );

      lastError = "";
      isConflict = false;
      isInvalidToken = false;
      lastSuccessfulPoll = Date.now();
      wait = 2000;

      for (const update of updates) {
        if (update.update_id >= persistentOffset) {
          persistentOffset = update.update_id + 1;
        }
        dispatch(update);
      }
    } catch (err) {
      if (gen !== generation) break;

      lastError = err.message;

      // Handle 401 Invalid Token
      if (err.isInvalidToken) {
        isInvalidToken = true;
        polling = false;
        logger.warn("Telegram bot token is invalid or revoked. Stopped polling.");
        break;
      }

      // Handle 409 Conflict
      if (err.isConflict) {
        isConflict = true;
        logger.warn("Telegram 409 Conflict: another instance is running getUpdates.");
        await sleep(30000); // Back off 30s before retrying
        continue;
      }

      // Handle 429 Rate Limit
      if (err.retryAfter) {
        logger.warn(`Telegram 429 Too Many Requests: backing off for ${err.retryAfter}s`);
        await sleep((err.retryAfter + 1) * 1000);
        continue;
      }

      logger.debug("Telegram polling notice:", err.message);
      await sleep(wait);
      wait = Math.min(wait * 2, 60000);
    }
  }

  if (gen === generation) polling = false;
}

// Starts or stops listener to match settings
function sync(force = false) {
  const wanted = cfg().enabled === true && Boolean(getToken());
  if (wanted && (force || !polling)) {
    generation++;
    logger.info("Starting Telegram bot listener…");
    testConnection()
      .then(() => registerCommands())
      .then(() => loop(generation))
      .catch((err) => {
        lastError = err.message;
        if (err.isInvalidToken) isInvalidToken = true;
        if (err.isConflict) isConflict = true;
        logger.warn("Telegram connection failed:", err.message);
        const gen = generation;
        setTimeout(() => gen === generation && sync(true), 30000).unref?.();
      });
  } else if (!wanted && polling) {
    stop();
  }
}

function stop() {
  generation++;
  polling = false;
}

let signature = "";
settingsModule.onChange((s) => {
  const next = JSON.stringify([s.telegram?.enabled, Boolean(getToken())]);
  if (next !== signature) {
    signature = next;
    sync(true);
  }
});

function start() {
  signature = JSON.stringify([cfg().enabled, Boolean(getToken())]);
  sync(true);
}

module.exports = {
  status,
  health,
  saveToken,
  testConnection,
  registerCommands,
  start,
  stop,
  sync,
  sendMessage,
  sendPhoto,
  sendDocument,
  sendAlert,
  createStreamReply,
  splitMessage,
  escapeMarkdownV2,
  escapeHtml,
  createPairingCode,
  getPairingStatus,
  revokePairedUser,
  setPairedUserRole,
  getUserRole,
  canUserChat,
  canUserAdmin,
  ready,
  setHandlers,
  onMissionEvent,
  handleMessage,
  handleCallback,
  handleCommand,
  handleMedia,
  apiCall,
  planMessage,
  awaitingAnswers,
  setPersistentOffset: (o) => (persistentOffset = o),
  getPersistentOffset: () => persistentOffset,
  resetStateForTesting: () => {
    seenUpdateIds.clear();
    unauthorizedAttempts.clear();
    persistentOffset = 0;
    lastError = "";
    isConflict = false;
    isInvalidToken = false;
  },
};
