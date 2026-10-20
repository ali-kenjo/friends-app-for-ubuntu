// Telegram: talk to Friends from your phone, get reminders and mission news there, and approve a mission's plan
// with a button. It's your own private bot (made with @BotFather) reached by long polling: no open port, no
// webhook. Only the Telegram user ids you list may talk to it; the bot token is kept in the system keyring.
//
//   plain message      the companion answers (as in the app, kept in a chat called "Telegram")
//   /mission <goal>    starts a mission; its questions and its plan come here, with Approve / Stop buttons
//   /missions, /status what is going on
//   /stop              stops every mission now
//   /today /tasks /remind <text> in <minutes> /note <text>
//
// Settings → Telegram has the switch, the token and the allowed ids (settings.telegram).
const settingsModule = require("./settings");
const keys = require("./keys");
const logger = require("./logger");
const life = require("./life");
const localNotes = require("./local-notes");
const { looksLikeMission } = require("../src/js/missions/detect.mjs");
const { say, sayN } = require("./say");

const TOKEN_KEY = "telegram-bot-token";
const API = () => process.env.FRIENDS_TELEGRAM_API || "https://api.telegram.org";
const POLL_SECONDS = () => (process.env.FRIENDS_TELEGRAM_POLL_SECONDS !== undefined ? Number(process.env.FRIENDS_TELEGRAM_POLL_SECONDS) : 25);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cfg = () => settingsModule.get().telegram;
const getToken = () => keys.getSecret(TOKEN_KEY) || process.env.FRIENDS_TELEGRAM_BOT_TOKEN || "";
const allowedIds = () => (cfg().allowedUserIds || []).map(String);

let generation = 0; // a new start (or a stop) ends the loop of the one before
let polling = false;
let offset = 0;
let botUsername = "";
let lastError = "";
let handlers = { chat: null, googleToken: async () => null };
const awaitingAnswers = new Map(); // chat id → mission id (its questions were sent there)
const suggestions = new Map(); // short key → { text, chatId } for "Start a mission from this?"

const setHandlers = (h) => (handlers = { ...handlers, ...h });

// ---------- The Telegram API ----------
async function apiCall(method, params = {}, token = getToken(), timeoutMs = 35000) {
  if (!token) throw new Error(say("No Telegram bot token configured."));
  let res;
  try {
    res = await fetch(`${API()}/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params), signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new Error(err.name === "TimeoutError" ? say("Telegram API timeout") : say("Couldn't reach Telegram: {reason}", { reason: err.message }));
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(say("Telegram answered {status}, which isn't readable.", { status: res.status }));
  }
  if (!data.ok) throw new Error(data.description || `Telegram error ${res.status}`);
  return data.result;
}

// buttons: [[{ text, data }]]
function sendMessage(chatId, text, { buttons = null } = {}) {
  const body = { chat_id: chatId, text: String(text || "").slice(0, 4000), disable_web_page_preview: true };
  if (buttons) body.reply_markup = { inline_keyboard: buttons.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) };
  return apiCall("sendMessage", body).catch((err) => (logger.warn(`Telegram sendMessage to ${chatId} failed:`, err.message), null));
}

// To everyone who may talk to the bot
async function sendAlert(text, options = {}) {
  const ids = allowedIds();
  await Promise.all(ids.map((id) => sendMessage(id, text, options)));
  return ids.length;
}

const ready = () => polling && allowedIds().length > 0;

// ---------- Status, setup ----------
function status() {
  const c = cfg();
  return { enabled: c.enabled === true, hasToken: Boolean(getToken()), running: polling, botUsername, lastError, allowed: allowedIds().length };
}

function saveToken(token) {
  if (typeof token === "string" && token.trim()) keys.setSecret(TOKEN_KEY, token.trim());
  else keys.deleteSecret(TOKEN_KEY);
  botUsername = "";
  lastError = "";
  sync(true);
  return status();
}

async function testConnection(token = getToken()) {
  if (!token) throw new Error(say("No token yet. Paste the token from @BotFather and press Save."));
  const me = await apiCall("getMe", {}, token, 15000);
  botUsername = me.username || botUsername;
  return { ok: true, bot: me };
}

// ---------- Commands ----------
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

// What a plan looks like in a message (the actions are what you approve)
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

async function handleCommand(chatId, text) {
  const [cmd, ...rest] = text.split(/\s+/);
  const arg = rest.join(" ").trim();
  const name = cmd.toLowerCase().replace(/@.*$/, "");
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
      if (!arg) return sendMessage(chatId, say("Tell me the goal: /mission research the three best budget laptops and write me a short report"));
      return startMission(chatId, arg);
    }
    case "/missions":
    case "/status": {
      const list = runner().list().filter((m) => !["done", "failed", "stopped"].includes(m.status) || Date.now() - m.updatedAt < 24 * 3600 * 1000);
      if (!list.length) return sendMessage(chatId, say("No missions right now. Start one with /mission <goal>."));
      const lines = list.slice(0, 8).map((m) => `• ${m.title}: ${statusText(m)}`);
      const models = require("./models").status();
      if (models.loaded) lines.push("", say("Model loaded: {model}", { model: models.loaded.model }) + (models.loaded.role ? ` (${models.loaded.role})` : ""));
      return sendMessage(chatId, lines.join("\n"));
    }
    case "/stop": {
      const live = runner().list().filter((m) => ["planning", "clarifying", "awaiting_approval", "running", "paused"].includes(m.status));
      for (const m of live) runner().stop(m.id);
      return sendMessage(chatId, live.length ? sayN("Stopped {n} mission.", "Stopped {n} missions.", live.length) : say("Nothing was running."));
    }
    default:
      return sendMessage(chatId, `${say("I don't know {name}.", { name })} ${help()}`);
  }
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

// ---------- Messages ----------
async function handleMessage(msg) {
  const fromId = String(msg.from?.id || "");
  let allowed = allowedIds();
  // Nobody listed yet: the first person to write is the owner (that is what Settings → Telegram says)
  if (!allowed.length && fromId) {
    const s = settingsModule.get();
    settingsModule.set({ ...s, telegram: { ...s.telegram, allowedUserIds: [fromId] } });
    allowed = [fromId];
    await sendMessage(msg.chat.id, `${say("Nice to meet you. Your Telegram id is {id}: it's saved as the only one allowed to talk to me. Change it in Settings → Telegram.", { id: fromId })}\n\n${help()}`);
    return;
  }
  if (!allowed.includes(fromId)) {
    logger.warn(`Rejected a Telegram message from ${fromId}`);
    return;
  }
  const chatId = msg.chat?.id;
  const text = (msg.text || "").trim();
  if (!text) return sendMessage(chatId, say("I can read text for now. Write it, and I'll help."));

  if (text.startsWith("/")) return handleCommand(chatId, text);

  // A mission is waiting for answers in this chat
  const waiting = awaitingAnswers.get(String(chatId));
  const mission = waiting && store().find(waiting);
  if (mission && mission.status === "clarifying") {
    awaitingAnswers.delete(String(chatId));
    const lines = text.split("\n").map((l) => l.replace(/^\s*(\d+[.)]|[-•])\s*/, "").trim()).filter(Boolean);
    const qs = mission.clarify.questions;
    const answers = qs.map((q, i) => ({ id: q.id, text: lines.length === qs.length ? lines[i] : text }));
    try {
      runner().answer(mission.id, answers);
      return sendMessage(chatId, say("Thanks, making the plan."));
    } catch (err) {
      return sendMessage(chatId, err.message);
    }
  }

  // Something that sounds like a goal: offer a mission instead of an answer
  if (looksLikeMission(text) && settingsModule.get().missions?.enabled !== false) {
    const key = Math.random().toString(36).slice(2, 8);
    suggestions.set(key, { text, chatId });
    if (suggestions.size > 50) suggestions.delete(suggestions.keys().next().value);
    return sendMessage(chatId, say("That sounds like something to carry out in the background. Make it a mission? (I'll make a plan first, and you approve it.)"), {
      buttons: [[{ text: say("Start a mission"), data: `s:${key}:go` }, { text: say("Just talk"), data: `s:${key}:chat` }]],
    });
  }

  return chatReply(chatId, text);
}

async function chatReply(chatId, text) {
  if (!handlers.chat) return sendMessage(chatId, say("No AI is set up yet. Add one in Settings → AI & privacy."));
  apiCall("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  try {
    const reply = await handlers.chat(text, { platform: "telegram" });
    if (reply) await sendMessage(chatId, reply);
  } catch (err) {
    await sendMessage(chatId, say("Couldn't answer: {reason}", { reason: err.message }));
  }
}

// ---------- Buttons ----------
async function handleCallback(cb) {
  const fromId = String(cb.from?.id || "");
  const chatId = cb.message?.chat?.id;
  const answer = (text) => apiCall("answerCallbackQuery", { callback_query_id: cb.id, text: String(text || "").slice(0, 150) }).catch(() => {});
  const clear = () => cb.message && apiCall("editMessageReplyMarkup", { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
  if (!allowedIds().includes(fromId)) return answer(say("Not allowed."));
  const [kind, id, extra, verdict] = String(cb.data || "").split(":");
  try {
    if (kind === "m") {
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
        return answer(say("That was already answered."));
      }
      runner().decide(id, request.id, verdict === "y");
      await clear();
      return answer(verdict === "y" ? say("Allowed") : say("Declined"));
    } else if (kind === "s") {
      const pending = suggestions.get(id);
      suggestions.delete(id);
      await clear();
      if (!pending) return answer(say("That's gone, write it again."));
      await answer(extra === "go" ? say("Starting") : say("OK"));
      return extra === "go" ? startMission(chatId, pending.text) : chatReply(chatId, pending.text);
    }
  } catch (err) {
    await answer(err.message);
    return sendMessage(chatId, err.message);
  }
  return answer("");
}

// ---------- Missions telling you ----------
function chatsFor(missionId) {
  const m = missionId && store().find(missionId);
  return m?.telegramChat ? [m.telegramChat] : allowedIds();
}

// The events of the mission engine that are worth a message (runner.js marks them with notify)
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
    for (const c of chats) await sendMessage(c, planMessage(m), { buttons: [[{ text: say("Approve"), data: `m:${id}:approve` }, { text: say("Stop"), data: `m:${id}:stop` }]] });
  } else if (e.type === "approval" && e.request) {
    const r = e.request;
    const text = say("{title} needs your OK:\n{summary}\n\nWhy it asks: {why}.", { title: e.mission.title, summary: r.summary, why: r.why || say("it isn't in the approved plan") });
    for (const c of chats) await sendMessage(c, text, { buttons: [[{ text: say("Allow"), data: `d:${id}:${r.id.slice(0, 8)}:y` }, { text: say("No"), data: `d:${id}:${r.id.slice(0, 8)}:n` }]] });
  } else if (e.notify) {
    for (const c of chats) await sendMessage(c, `${e.notify.title}\n${e.notify.body}`);
  }
}

// ---------- Polling ----------
async function dispatch(update) {
  try {
    if (update.callback_query) await handleCallback(update.callback_query);
    else if (update.message) await handleMessage(update.message);
  } catch (err) {
    logger.warn("Telegram update error:", err.message);
  }
}

async function loop(gen) {
  polling = true;
  let wait = 2000;
  while (gen === generation) {
    try {
      const seconds = POLL_SECONDS();
      const updates = await apiCall("getUpdates", { offset, timeout: seconds, allowed_updates: ["message", "callback_query"] }, getToken(), (seconds + 15) * 1000);
      lastError = "";
      wait = 2000;
      for (const update of updates) {
        offset = update.update_id + 1;
        dispatch(update);
      }
    } catch (err) {
      if (gen !== generation) break;
      lastError = err.message;
      logger.debug("Telegram polling notice:", err.message);
      await sleep(wait);
      wait = Math.min(wait * 2, 60000);
    }
  }
  if (gen === generation) polling = false;
}

// Starts or stops itself to match the settings (called when they change, and at start-up)
function sync(force = false) {
  const wanted = cfg().enabled === true && Boolean(getToken());
  if (wanted && (force || !polling)) {
    generation++;
    offset = 0;
    logger.info("Starting the Telegram bot listener…");
    testConnection()
      .then(() => loop(generation))
      .catch((err) => {
        lastError = err.message;
        logger.warn("Telegram:", err.message);
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
  const next = JSON.stringify([s.telegram.enabled, Boolean(getToken())]);
  if (next !== signature) {
    signature = next;
    sync(true);
  }
});

// Called by server.js when it starts
function start() {
  signature = JSON.stringify([cfg().enabled, Boolean(getToken())]);
  sync(true);
}

module.exports = { status, saveToken, testConnection, start, stop, sync, sendMessage, sendAlert, ready, setHandlers, onMissionEvent, handleMessage, handleCallback, apiCall, planMessage, awaitingAnswers };
