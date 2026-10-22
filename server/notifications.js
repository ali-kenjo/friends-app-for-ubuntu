// Central Notification Router (server/notifications.js)
// Unified event dispatcher across Desktop, In-App Center, and Telegram.
// Controls event-destination routing matrix, quiet hours, DND, digest mode,
// rate limits, retry queues with exponential backoff, and outbound audit logs.

const settingsModule = require("./settings");
const logger = require("./logger");
const { say } = require("./say");

const LOG_CAP = 200;
const outboundLog = []; // [{ id, event, title, body, timestamp, destinations: {}, suppressed: null }]
const channels = new Map(); // name → { send: async (item) => {}, status: () => {} }
const digestQueue = []; // items waiting for digest delivery
const rateWindowMinutes = new Map(); // timestamp ms array for rate-limiting
const rateWindowHours = new Map();

let digestTimer = null;

// Standard event types supported by the router
const EVENT_TYPES = [
  "reminder",
  "focus_complete",
  "mission_plan",
  "mission_question",
  "mission_approval",
  "mission_progress",
  "mission_done",
  "mission_trouble",
  "watch_alert",
  "briefing",
  "habit_nudge",
  "follow_up",
  "reddit_match",
];

// Helper to check if current time is within HH:MM - HH:MM window
function isWithinTimeWindow(startTimeStr, endTimeStr, date = new Date()) {
  if (!startTimeStr || !endTimeStr) return false;
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  
  const [sH, sM] = startTimeStr.split(":").map(Number);
  const [eH, eM] = endTimeStr.split(":").map(Number);
  const startMinutes = (sH || 0) * 60 + (sM || 0);
  const endMinutes = (eH || 0) * 60 + (eM || 0);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  // Crosses midnight, e.g. 22:00 to 08:00
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function getSettings() {
  const s = settingsModule.get();
  return s?.notifications || {};
}

function isDndActive(notifSettings = getSettings()) {
  const dnd = notifSettings.dnd;
  if (!dnd || !dnd.enabled) return false;
  if (!dnd.until || dnd.until === 0) return true;
  return Date.now() < dnd.until;
}

function isQuietHoursActive(isUrgent = false, notifSettings = getSettings()) {
  const qh = notifSettings.quietHours;
  if (!qh || !qh.enabled) return false;
  if (isUrgent && qh.allowUrgent !== false) return false;
  return isWithinTimeWindow(qh.start, qh.end);
}

function checkRateLimit(destination, notifSettings = getSettings()) {
  const now = Date.now();
  const maxPerMin = notifSettings.rateLimits?.maxPerMinute || 15;
  const maxPerHour = notifSettings.rateLimits?.maxPerHour || 100;

  // 1-minute window
  let minList = rateWindowMinutes.get(destination) || [];
  minList = minList.filter((t) => now - t < 60000);
  if (minList.length >= maxPerMin) return false;

  // 1-hour window
  let hourList = rateWindowHours.get(destination) || [];
  hourList = hourList.filter((t) => now - t < 3600000);
  if (hourList.length >= maxPerHour) return false;

  minList.push(now);
  hourList.push(now);
  rateWindowMinutes.set(destination, minList);
  rateWindowHours.set(destination, hourList);
  return true;
}

function registerChannel(name, handler) {
  if (!name || typeof handler?.send !== "function") {
    throw new Error(`Invalid notification channel: ${name}`);
  }
  channels.set(name, handler);
}

function unregisterChannel(name) {
  channels.delete(name);
}

function logDelivery(entry) {
  outboundLog.unshift(entry);
  if (outboundLog.length > LOG_CAP) {
    outboundLog.pop();
  }
}

function getLog(limit = 100) {
  return outboundLog.slice(0, Math.max(1, Math.min(limit, LOG_CAP)));
}

function clearLog() {
  outboundLog.length = 0;
  rateWindowMinutes.clear();
  rateWindowHours.clear();
}

async function retryDelivery(channelName, item, maxRetries = 3, initialDelayMs = 1000) {
  const handler = channels.get(channelName);
  if (!handler) return { status: "no_channel" };

  let delay = initialDelayMs;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await handler.send(item);
      return { status: "sent", attempts: attempt };
    } catch (err) {
      if (attempt === maxRetries) {
        return { status: "failed", error: err.message, attempts: attempt };
      }
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  return { status: "failed" };
}

// Main event dispatcher
async function dispatch(event, payload = {}, options = {}) {
  const notifSettings = getSettings();
  if (notifSettings.enabled === false) {
    return { dispatched: false, reason: "notifications_disabled" };
  }

  const id = `notif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const title = String(payload.title || event);
  const body = String(payload.body || "");
  const action = payload.action || null;
  const urgent = Boolean(options.urgent || event === "mission_approval");
  const matrix = notifSettings.matrix || {};
  const eventMatrix = matrix[event] || { desktop: true, inapp: true, telegram: true };

  // DND Check
  if (isDndActive(notifSettings) && !urgent) {
    const entry = {
      id,
      event,
      title,
      body,
      action,
      timestamp: Date.now(),
      suppressed: "dnd",
      destinations: {},
    };
    logDelivery(entry);
    return { dispatched: false, reason: "suppressed_dnd", id };
  }

  // Quiet Hours Check
  if (isQuietHoursActive(urgent, notifSettings)) {
    // If digest mode is enabled, queue for next digest
    if (notifSettings.digest?.enabled) {
      digestQueue.push({ id, event, title, body, action, timestamp: Date.now(), urgent });
    }
    const entry = {
      id,
      event,
      title,
      body,
      action,
      timestamp: Date.now(),
      suppressed: "quiet_hours",
      destinations: {},
    };
    logDelivery(entry);
    return { dispatched: false, reason: "suppressed_quiet_hours", id };
  }

  // Digest mode check: if non-urgent and digest mode is on, accumulate
  if (notifSettings.digest?.enabled && !urgent && options.skipDigest !== true) {
    digestQueue.push({ id, event, title, body, action, timestamp: Date.now(), urgent });
    const entry = {
      id,
      event,
      title,
      body,
      action,
      timestamp: Date.now(),
      suppressed: "digest_queued",
      destinations: {},
    };
    logDelivery(entry);
    return { dispatched: true, queuedForDigest: true, id };
  }

  const notificationItem = {
    id,
    event,
    title,
    body,
    action,
    data: payload.data || null,
    urgent,
    silent: Boolean(options.silent),
    buttons: payload.buttons || null,
    timestamp: Date.now(),
  };

  const deliveryResults = {};

  // Evaluate each channel
  for (const [channelName, handler] of channels.entries()) {
    const isChannelEnabledInMatrix = options.channelOverrides?.[channelName] !== undefined
      ? Boolean(options.channelOverrides[channelName])
      : Boolean(eventMatrix[channelName]);

    if (!isChannelEnabledInMatrix) {
      deliveryResults[channelName] = { status: "disabled_in_matrix" };
      continue;
    }

    if (!checkRateLimit(channelName, notifSettings)) {
      deliveryResults[channelName] = { status: "rate_limited" };
      continue;
    }

    try {
      const res = await handler.send(notificationItem);
      deliveryResults[channelName] = res && typeof res === "object" ? res : { status: "sent" };
    } catch (err) {
      logger.warn(`Notification delivery failed on ${channelName}:`, err.message);
      // Attempt background retry with backoff
      retryDelivery(channelName, notificationItem).then((retryRes) => {
        deliveryResults[channelName] = retryRes;
      });
      deliveryResults[channelName] = { status: "retry_scheduled", error: err.message };
    }
  }

  const logEntry = {
    id,
    event,
    title,
    body,
    action,
    timestamp: Date.now(),
    suppressed: null,
    destinations: deliveryResults,
  };
  logDelivery(logEntry);

  return {
    dispatched: true,
    id,
    destinations: deliveryResults,
  };
}

// Deliver accumulated digest items
async function flushDigest() {
  if (!digestQueue.length) return 0;
  const items = digestQueue.splice(0, digestQueue.length);
  const summaryBody = items.map((it) => `• [${it.event}] ${it.title}${it.body ? `: ${it.body}` : ""}`).join("\n");
  
  await dispatch(
    "briefing",
    {
      title: say("Notification Digest ({n} items)", { n: items.length }),
      body: summaryBody,
      data: { digestItems: items },
    },
    { skipDigest: true }
  );
  return items.length;
}

function startDigestScheduler() {
  if (digestTimer) clearInterval(digestTimer);
  digestTimer = setInterval(() => {
    const notifSettings = getSettings();
    if (!notifSettings.digest?.enabled || !digestQueue.length) return;
    
    const now = new Date();
    const digestTime = notifSettings.digest.time || "09:00";
    const [h, m] = digestTime.split(":").map(Number);
    
    if (notifSettings.digest.mode === "hourly") {
      if (now.getMinutes() === 0) flushDigest();
    } else {
      // Daily
      if (now.getHours() === (h || 9) && now.getMinutes() === (m || 0)) {
        flushDigest();
      }
    }
  }, 60000);
  digestTimer.unref?.();
}

function stopDigestScheduler() {
  if (digestTimer) {
    clearInterval(digestTimer);
    digestTimer = null;
  }
}

// Initializer
function init() {
  startDigestScheduler();
}

module.exports = {
  dispatch,
  registerChannel,
  unregisterChannel,
  getLog,
  clearLog,
  isDndActive,
  isQuietHoursActive,
  flushDigest,
  startDigestScheduler,
  stopDigestScheduler,
  init,
  EVENT_TYPES,
};
