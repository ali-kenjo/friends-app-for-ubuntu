// What Settings → AI & privacy → Privacy needs from the helper:
//   - what could leave this computer right now (the cloud AIs, apps that go online, Telegram, the update check)
//   - how much of what you made is kept (chats, memories, notes), and clearing it
//   - chats that haven't been touched for a number of days are deleted (Settings: "Delete old chats")
const settingsModule = require("./settings");
const brains = require("./brains");
const chats = require("./chats");
const notes = require("./notes");
const episodes = require("./episodes");
const usage = require("./usage");
const connectors = require("./connectors");
const logger = require("./logger");
const { say } = require("./say");

const DAY = 24 * 60 * 60 * 1000;

// [{ id, kind, name, detail }]: what could send something out, as things stand (nothing is listed in Private mode that Private mode stops)
function leaving(settings = settingsModule.get()) {
  const out = [];
  const priv = settings.privacy?.localOnly === true;
  if (!priv) {
    for (const b of brains.publicState().brains.filter((b) => b.enabled && b.kind === "cloud")) out.push({ id: `ai-${b.id}`, kind: "ai", name: b.name, detail: b.model });
    for (const { def } of connectors.active(settings)) if (def.online) out.push({ id: `app-${def.id}`, kind: "app", name: def.name, detail: "" });
    if (settings.life?.briefingNews) out.push({ id: "news", kind: "feature", name: "news", detail: "" });
    if (settings.reddit?.enabled !== false && (settings.reddit?.watchers || []).some((w) => w.enabled !== false)) {
      out.push({ id: "reddit-watchers", kind: "feature", name: "reddit_watchers", detail: "" });
    }
  }
  if (settings.telegram?.enabled) out.push({ id: "telegram", kind: "feature", name: "telegram", detail: "" });
  if (!priv && settings.updates?.check !== false) out.push({ id: "updates", kind: "feature", name: "updates", detail: "" });
  return out;
}

function summary(settings = settingsModule.get()) {
  return {
    chats: chats.list().length,
    memories: settings.memory?.items?.length || 0,
    notes: notes.list().length,
    episodes: episodes.all().length,
    leaving: leaving(settings),
    redacting: Object.entries(settings.privacy?.redact || {}).filter(([, on]) => on).map(([k]) => k),
  };
}

// what: "chats" | "memories" | "notes" | "episodes" | "usage" | "all"
function clear(what) {
  const done = {};
  const want = (x) => what === x || what === "all";
  if (!["chats", "memories", "notes", "episodes", "usage", "all"].includes(what)) throw new Error(say("That isn't something Friends keeps."));
  if (want("chats")) {
    const list = chats.list();
    for (const c of list) chats.remove(c.id);
    done.chats = list.length;
  }
  if (want("episodes")) {
    done.episodes = episodes.all().length;
    episodes.clear();
  }
  if (want("notes")) {
    done.notes = notes.list().length;
    notes.clear();
  }
  if (want("memories")) {
    done.memories = settingsModule.get().memory.items.length;
    settingsModule.patch({ memory: { items: [] } });
  }
  if (want("usage")) usage.reset();
  return { cleared: done, ...summary() };
}

// Deletes chats not touched for `days` days (0 = never). Returns how many.
function pruneChats(days, now = Date.now()) {
  if (!(days > 0)) return 0;
  let n = 0;
  for (const c of chats.list()) {
    if (now - c.updatedAt > days * DAY) {
      chats.remove(c.id);
      episodes.removeForChat(c.id);
      n++;
    }
  }
  if (n) logger.info(`Deleted ${n} chat${n === 1 ? "" : "s"} older than ${days} days.`);
  return n;
}

let timer = null;
let firstTimer = null;
function schedule(getSettings, { firstDelay = 2 * 60 * 1000, every = 60 * 60 * 1000 } = {}) {
  clearInterval(timer);
  clearTimeout(firstTimer);
  const tick = () => {
    try {
      pruneChats(getSettings().privacy?.keepChatsDays || 0);
    } catch (err) {
      logger.warn("Deleting old chats failed:", err.message);
    }
  };
  firstTimer = setTimeout(tick, firstDelay);
  firstTimer.unref?.();
  timer = setInterval(tick, every);
  timer.unref?.();
}

module.exports = { leaving, summary, clear, pruneChats, schedule };
