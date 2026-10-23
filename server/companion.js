// The companion answering outside the page: a message on Telegram gets the same character, memory and tools
// as a chat in the app, and is kept in a chat called "Telegram" so the app shows it too. Things that need your
// OK (sending an email, changing files) are declined here ("do it in the app, or make it a mission"), because
// there's nobody at a screen to ask.
const settingsModule = require("./settings");
const brains = require("./brains");
const chats = require("./chats");
const router = require("./router");
const tools = require("./tools");
const prompt = require("./prompt");
const characters = require("./characters");
const logger = require("./logger");
const redact = require("./redact");

const TITLE = "Telegram";
const WINDOW = 14; // messages the AI sees

function findChat(title = TITLE) {
  const existing = chats.list().find((c) => c.title === title);
  if (existing) return chats.get(existing.id);
  const chat = chats.create(title);
  chat.title = title;
  return chat;
}

const toContents = (messages) =>
  messages.slice(-WINDOW).map((m) => ({ role: m.role === "model" ? "model" : "user", parts: [{ text: m.text || "(empty)" }] }));

// googleToken: () → the token the helper keeps (or null). Returns the reply text.
async function reply(text, { platform = TITLE, googleToken = async () => null, onActivity = () => {}, onAir = false, withhold = false, isGroup = false, chatId: tgChatId = null } = {}) {
  const settings = settingsModule.get();
  const chatTitle = isGroup && tgChatId ? `Telegram (Group ${tgChatId})` : TITLE;
  const chat = findChat(chatTitle);
  const userMessage = { id: require("crypto").randomUUID(), role: "user", text: String(text).trim(), at: Date.now() };
  chat.messages.push(userMessage);
  chats.save(chat);

  const routePlan = router.plan({
    settings,
    text: userMessage.text,
    attachments: [],
    messages: chat.messages.slice(0, -1),
    voice: false,
    force: null,
    preferId: null,
    deps: { has: brains.has, byKind: brains.getByKind, chosen: (id) => brains.getForChat(id), privateMode: settings.privacy?.localOnly === true },
  });
  if (!routePlan.steps.length) throw new Error("No AI is set up yet. Add one in Settings → AI & privacy.");

  let out = "";
  const activity = [];
  const token = (onAir || withhold || settings.privacy?.localOnly) ? null : await googleToken().catch(() => null);
  const { step } = await router.execute(routePlan, {
    emit: () => {},
    signal: undefined,
    slowMs: settings.routing.dynamic.slowSeconds * 1000,
    // Nobody to ask the confirming question here
    cloudAllowed: () => true,
    allowCloud: () => {},
    confirmCloud: async () => true,
    run: async (rs, { signal, started }) => {
      out = "";
      const brain = rs.brain;
      const effectiveWithhold = withhold || (brain.kind === "cloud" && settings.privacy?.shareMemoryWithCloud === false);
      const all = tools.declarations(settings, { voice: false, robot: false, workspace: !onAir && !effectiveWithhold && (brain.kind !== "local" || Boolean(token)), onAir, withhold: effectiveWithhold });
      const offered = brain.kind === "local" ? tools.forLocal(all, settings) : all;
      const redactOpts = brain.kind === "cloud" ? settings.privacy?.redact : null;
      const rawSystem = prompt.build(settings, { voice: false, toolsOffered: offered, summary: (onAir || effectiveWithhold) ? "" : chat.summary?.text, chatId: chat.id, onAir, withhold: effectiveWithhold }) + "\n\n# Where you are\nThe user is writing to you on Telegram, on their phone: keep replies short and plain (no tables, no big code blocks). Things that need their OK (sending email, changing files) can't be confirmed here: tell them to do it in the app, or to start it as a mission.";
      const cleanSystem = redact.active(redactOpts) ? redact.redactText(rawSystem, redactOpts) : rawSystem;
      const rawContents = toContents(chat.messages);
      const cleanContents = redact.active(redactOpts) ? redact.redactContents(rawContents, redactOpts) : rawContents;
      await brain.api.streamChat({
        key: brain.key,
        model: brain.model,
        contents: cleanContents,
        system: cleanSystem,
        temperature: prompt.temperature(settings),
        fast: true,
        tools: offered,
        isFreeTool: tools.isRobotTool,
        signal,
        onText: (piece) => {
          if (!started()) throw Object.assign(new Error("Another AI answered first."), { name: "AbortError" });
          out += piece;
        },
        runTool: (name, args) => {
          if (!started()) throw Object.assign(new Error("Another AI answered first."), { name: "AbortError" });
          return tools.run(name, args, {
            settings,
            googleAccessToken: token,
            source: "telegram",
            confirm: async () => false,
            onActivity: (line) => (activity.push(line), onActivity(line)),
            onDraft: () => {},
            onRobot: () => {},
          }).then((res) => (redact.active(redactOpts) ? redact.redactDeep(res, redactOpts) : res));
        },
      });
    },
  });
  let answer = out.trim();
  if (prompt.isSilent?.(answer)) answer = "";
  const message = { id: require("crypto").randomUUID(), role: "model", text: answer, at: Date.now(), by: settings.characters?.active };
  if (activity.length) message.activity = activity;
  if (step) message.via = { kind: step.kind, name: step.brain.name, model: step.brain.model, reason: step.reason, mode: routePlan.mode };
  if (answer || activity.length) chat.messages.push(message);
  chats.save(chat);
  logger.debug(`Telegram chat answered via ${step?.brain?.name}`);
  return answer || (activity.length ? activity.join("\n") : "…");
}

module.exports = { reply, findChat, TITLE };
