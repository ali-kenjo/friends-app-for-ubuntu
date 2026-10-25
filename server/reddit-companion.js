// Reddit Companion Daemon (server/reddit-companion.js)
// Enables bidirectional communication via Reddit PMs, Mentions and Alerts,
// mirroring the Telegram bot architecture while strictly complying with Reddit API terms.

const settingsModule = require("./settings");
const keys = require("./keys");
const logger = require("./logger");
const redditConnector = require("./connectors/reddit");
const life = require("./life");

const CLIENT_SECRET_KEY = "connector-reddit-clientSecret";
const REFRESH_TOKEN_KEY = "connector-reddit-refreshToken";

const cfg = () => settingsModule.get().reddit || {};

// Dedup seen message/mention thing IDs (LRU Set)
const seenMessageIds = new Set();
const MAX_SEEN_MESSAGES = 2000;

let polling = false;
let pollTimer = null;
let lastSuccessfulPoll = 0;
let lastError = "";
let isInvalidCredentials = false;
let rateLimitInfo = { remaining: 100, reset: 60 };

let handlers = {
  chat: null,
  missions: null,
};

const setHandlers = (h) => {
  handlers = { ...handlers, ...h };
};

// ---------- Configuration & Credentials ----------

function getCredentials() {
  const c = cfg();
  const clientId = c.clientId || c.client_id || keys.getSecret("reddit-client-id");
  const clientSecret = keys.getSecret(CLIENT_SECRET_KEY) || keys.getSecret("reddit-client-secret");
  const refreshToken = keys.getSecret(REFRESH_TOKEN_KEY) || keys.getSecret("reddit-refresh-token");
  const username = c.username || "";

  return {
    clientId,
    clientSecret,
    refreshToken,
    username,
    hasCredentials: Boolean(clientId && clientSecret && refreshToken),
  };
}

function saveCredentials({ clientId, clientSecret, refreshToken, username }) {
  if (clientSecret) keys.setSecret(CLIENT_SECRET_KEY, clientSecret);
  if (refreshToken) keys.setSecret(REFRESH_TOKEN_KEY, refreshToken);

  const updates = {};
  if (clientId !== undefined) updates.clientId = clientId;
  if (username !== undefined) updates.username = username;

  if (Object.keys(updates).length > 0) {
    const current = cfg();
    settingsModule.patch({
      reddit: {
        ...current,
        ...updates,
      },
    });
  }

  return { ok: true };
}

// ---------- Allowed Users & Roles ----------

function getAllowedUsers() {
  const users = cfg().allowedUsers || [];
  return users.map((u) => {
    if (typeof u === "string") {
      return { username: u.toLowerCase().replace(/^u\//, ""), role: "admin" };
    }
    return {
      username: String(u.username || "").toLowerCase().replace(/^u\//, ""),
      role: u.role || "chat",
    };
  });
}

function getUserRole(username) {
  const clean = String(username || "").toLowerCase().replace(/^u\//, "");
  const found = getAllowedUsers().find((u) => u.username === clean);
  return found ? found.role : null;
}

function isUserAllowed(username) {
  return getUserRole(username) !== null;
}

function addAllowedUser(username, role = "chat") {
  const clean = String(username || "").trim().toLowerCase().replace(/^u\//, "");
  if (!clean) throw new Error("Invalid username");

  const current = getAllowedUsers().filter((u) => u.username !== clean);
  current.push({ username: clean, role });

  const c = cfg();
  settingsModule.patch({
    reddit: {
      ...c,
      allowedUsers: current,
    },
  });
  return { ok: true, users: current };
}

function removeAllowedUser(username) {
  const clean = String(username || "").trim().toLowerCase().replace(/^u\//, "");
  const current = getAllowedUsers().filter((u) => u.username !== clean);

  const c = cfg();
  settingsModule.patch({
    reddit: {
      ...c,
      allowedUsers: current,
    },
  });
  return { ok: true, users: current };
}

// ---------- Status & Health ----------

function ready() {
  const creds = getCredentials();
  return Boolean(
    cfg().companionEnabled &&
    creds.hasCredentials &&
    settingsModule.get()?.privacy?.localOnly !== true &&
    !isInvalidCredentials
  );
}

function status() {
  const creds = getCredentials();
  return {
    enabled: Boolean(cfg().companionEnabled),
    ready: ready(),
    polling: polling,
    hasCredentials: creds.hasCredentials,
    username: creds.username || null,
    allowedUsersCount: getAllowedUsers().length,
    lastSuccessfulPoll: lastSuccessfulPoll ? new Date(lastSuccessfulPoll).toISOString() : null,
    lastError: lastError || null,
    rateLimit: rateLimitInfo,
  };
}

function health() {
  const s = status();
  return {
    ok: s.ready && !s.lastError,
    status: s,
    timestamp: Date.now(),
  };
}

// ---------- Polling Loop & Message Processing ----------

async function composePM(toUser, subject, body) {
  const creds = getCredentials();
  const form = new URLSearchParams({
    api_type: "json",
    to: toUser.replace(/^u\//, ""),
    subject: String(subject || "Friends Response").slice(0, 100),
    text: String(body || "").slice(0, 9500),
  });

  return redditConnector.redditRequest(creds, "/api/compose", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

async function replyComment(thingId, body) {
  const creds = getCredentials();
  const form = new URLSearchParams({
    api_type: "json",
    thing_id: thingId,
    text: String(body || "").slice(0, 9500),
  });

  return redditConnector.redditRequest(creds, "/api/comment", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

async function markMessagesRead(ids) {
  if (!ids || !ids.length) return;
  const creds = getCredentials();
  const form = new URLSearchParams({
    id: ids.join(","),
  });

  try {
    await redditConnector.redditRequest(creds, "/api/read_message", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  } catch (err) {
    logger.warn("Failed to mark Reddit messages as read:", err.message);
  }
}

async function processIncomingMessage(item) {
  const author = item.author;
  if (!author || author === "[deleted]" || author.toLowerCase() === (getCredentials().username || "").toLowerCase()) {
    return;
  }

  const role = getUserRole(author);
  if (!role) {
    logger.warn(`Reddit message from unauthorized user /u/${author} ignored.`);
    return;
  }

  if (role === "notify_only") {
    logger.debug(`User /u/${author} is notify_only; ignoring incoming message.`);
    return;
  }

  const rawText = (item.body || "").trim();
  if (!rawText) return;

  // Security check for prompt injection
  const injectionSignals = redditConnector.detectPromptInjectionSignals(rawText);
  if (injectionSignals && role !== "admin") {
    logger.warn(`Prompt injection pattern detected from Reddit user /u/${author}`);
    await sendReply(item, "⚠️ Message contained unrecognized instruction formats and was refused.");
    return;
  }

  const isCommand = rawText.startsWith("/");
  const [cmd, ...argsList] = isCommand ? rawText.split(/\s+/) : ["", ""];
  const args = argsList.join(" ").trim();
  const command = cmd.toLowerCase();

  try {
    if (command === "/start" || command === "/help" || rawText.toLowerCase() === "help") {
      const reply = [
        `🤖 **Friends Reddit Companion** (Online)`,
        ``,
        `Commands:`,
        `• \`/status\` - View bot status, model & active missions`,
        `• \`/today\` or \`/tasks\` - View your daily tasks and schedule`,
        `• \`/remind <text>\` - Set a quick reminder`,
        `• \`/mission <goal>\` - Launch an autonomous background task`,
        `• \`/stop\` - Stop active missions`,
        `• \`/ask <question>\` or reply directly - Chat with your companion`,
      ].join("\n");
      await sendReply(item, reply);
      return;
    }

    if (command === "/status") {
      const s = status();
      const reply = [
        `📊 **Friends Status**`,
        `• Companion: Active`,
        `• User: /u/${author} (Role: ${role})`,
        `• Authorized Users: ${s.allowedUsersCount}`,
        `• Poll Interval: ${cfg().pollIntervalSeconds || 30}s`,
      ].join("\n");
      await sendReply(item, reply);
      return;
    }

    if (command === "/today" || command === "/tasks") {
      let tasksText = "No schedule found.";
      try {
        const todayData = await life.today?.();
        if (todayData && todayData.tasks) {
          const list = todayData.tasks.map((t) => `• [${t.done ? "x" : " "}] ${t.text}`).join("\n");
          tasksText = list || "No pending tasks for today.";
        }
      } catch (err) {
        tasksText = `Schedule lookup: ${err.message}`;
      }
      await sendReply(item, `📅 **Today's Agenda**\n\n${tasksText}`);
      return;
    }

    if (command === "/remind") {
      if (!args) {
        await sendReply(item, "Usage: `/remind <text>`");
        return;
      }
      try {
        await life.addReminder?.(args);
        await sendReply(item, `✅ Reminder set: "${args}"`);
      } catch (err) {
        await sendReply(item, `Failed to set reminder: ${err.message}`);
      }
      return;
    }

    if (command === "/mission") {
      if (role !== "admin") {
        await sendReply(item, "⛔ Only admin users can trigger background missions.");
        return;
      }
      if (!args) {
        await sendReply(item, "Usage: `/mission <your goal>`");
        return;
      }
      if (handlers.missions?.start) {
        const result = await handlers.missions.start(args, { source: `reddit:/u/${author}` });
        await sendReply(item, `🚀 Mission started: ${result?.id || args}`);
      } else {
        await sendReply(item, "Mission runner is currently not attached.");
      }
      return;
    }

    if (command === "/stop") {
      if (role !== "admin") {
        await sendReply(item, "⛔ Only admin users can stop missions.");
        return;
      }
      if (handlers.missions?.stopAll) {
        await handlers.missions.stopAll();
        await sendReply(item, "🛑 Stopped active missions.");
      } else {
        await sendReply(item, "No active missions to stop.");
      }
      return;
    }

    // Direct chat
    const chatPrompt = command === "/ask" ? args : rawText;
    if (handlers.chat) {
      const response = await handlers.chat(chatPrompt, {
        from: author,
        channel: "reddit",
        role,
      });
      const replyText = typeof response === "string" ? response : (response?.text || "Received.");
      await sendReply(item, replyText);
    } else {
      await sendReply(item, "AI chat handler is offline.");
    }
  } catch (err) {
    logger.error(`Error processing Reddit message from /u/${author}:`, err);
    await sendReply(item, `⚠️ Error: ${err.message}`);
  }
}

async function sendReply(originalItem, text) {
  // If the item is explicitly a comment/mention in a subreddit thread
  if (originalItem.was_comment === true || originalItem.name?.startsWith("t1_") || originalItem.name?.startsWith("t3_")) {
    await replyComment(originalItem.name || originalItem.id, text);
  } else {
    // Private Message (PM)
    const subject = originalItem.subject?.startsWith("Re:") ? originalItem.subject : `Re: ${originalItem.subject || "Friends"}`;
    await composePM(originalItem.author, subject, text);
  }
}

// Single poll execution
async function pollOnce() {
  if (!ready()) return;
  const creds = getCredentials();
  const c = cfg();

  try {
    const toMarkRead = [];

    // 1. Fetch unread PMs
    if (c.respondPM !== false) {
      try {
        const pms = await redditConnector.redditRequest(creds, "/message/unread?limit=25");
        const items = pms.data?.children?.map((c) => c.data) || [];
        for (const item of items) {
          if (!item || !item.id || seenMessageIds.has(item.id)) continue;
          seenMessageIds.add(item.id);
          if (seenMessageIds.size > MAX_SEEN_MESSAGES) {
            const oldest = seenMessageIds.values().next().value;
            seenMessageIds.delete(oldest);
          }
          toMarkRead.push(item.name || `t4_${item.id}`);
          await processIncomingMessage(item);
        }
      } catch (err) {
        logger.debug("Reddit unread PM poll note:", err.message);
      }
    }

    // 2. Fetch Mentions if enabled
    if (c.respondMentions !== false) {
      try {
        const mentions = await redditConnector.redditRequest(creds, "/message/mentions?limit=15");
        const items = mentions.data?.children?.map((c) => c.data) || [];
        for (const item of items) {
          if (!item || !item.id || seenMessageIds.has(item.id)) continue;
          seenMessageIds.add(item.id);
          if (seenMessageIds.size > MAX_SEEN_MESSAGES) {
            const oldest = seenMessageIds.values().next().value;
            seenMessageIds.delete(oldest);
          }
          toMarkRead.push(item.name || `t1_${item.id}`);
          await processIncomingMessage(item);
        }
      } catch (err) {
        logger.debug("Reddit mentions poll note:", err.message);
      }
    }

    // Mark processed items as read on Reddit
    if (toMarkRead.length > 0) {
      await markMessagesRead(toMarkRead);
    }

    lastSuccessfulPoll = Date.now();
    lastError = "";
    isInvalidCredentials = false;
  } catch (err) {
    lastError = err.message;
    if (err.message?.includes("401") || err.message?.includes("invalid_grant")) {
      isInvalidCredentials = true;
    }
    logger.warn("Reddit companion poll warning:", err.message);
  }
}

function start() {
  if (polling) return;
  polling = true;
  logger.info("Reddit Companion daemon starting.");

  const intervalMs = Math.max((cfg().pollIntervalSeconds || 30) * 1000, 10000);

  const loop = async () => {
    if (!polling) return;
    try {
      await pollOnce();
    } catch (err) {
      logger.warn("Reddit poll loop error:", err.message);
    }
    if (polling) {
      pollTimer = setTimeout(loop, intervalMs);
      pollTimer.unref?.(); // never keeps the process alive (tests, a closing helper)
    }
  };

  pollTimer = setTimeout(loop, 1500);
  pollTimer.unref?.();
}

function stop() {
  polling = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  logger.info("Reddit Companion daemon stopped.");
}

function restart() {
  stop();
  start();
}

// Outbound alert dispatcher
async function sendAlert(text, { subject = "Friends Alert", targetUser = null } = {}) {
  if (!ready()) {
    logger.debug("Reddit alert skipped: companion not ready.");
    return false;
  }

  const allowed = getAllowedUsers();
  const targets = targetUser
    ? [targetUser]
    : allowed.filter((u) => u.role === "admin" || u.role === "notify_only").map((u) => u.username);

  let sent = 0;
  for (const user of targets) {
    try {
      await composePM(user, subject, text);
      sent++;
    } catch (err) {
      logger.warn(`Failed to send Reddit alert to /u/${user}:`, err.message);
    }
  }
  return sent > 0;
}

async function testConnection() {
  const creds = getCredentials();
  if (!creds.hasCredentials) {
    throw new Error("Missing Reddit credentials. Provide client ID, secret, and refresh token.");
  }

  // Test OAuth token generation and get authenticated user identity
  await redditConnector.getAccessToken(creds);
  const me = await redditConnector.redditRequest(creds, "/api/v1/me");
  
  return {
    ok: true,
    name: me.name,
    id: me.id,
    created: me.created_utc,
    message: `Connected successfully to Reddit as /u/${me.name}.`,
  };
}

module.exports = {
  start,
  stop,
  restart,
  ready,
  status,
  health,
  setHandlers,
  getCredentials,
  saveCredentials,
  getAllowedUsers,
  getUserRole,
  isUserAllowed,
  addAllowedUser,
  removeAllowedUser,
  pollOnce,
  sendAlert,
  testConnection,
  composePM,
  replyComment,
  resetSeenForTesting: () => seenMessageIds.clear(),
};
