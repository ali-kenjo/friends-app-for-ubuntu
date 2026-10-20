// The Telegram bot against a fake Telegram: who may talk to it, the companion's answers, and the mission flow
// (its questions, its plan with an Approve button, a question mid-way with Allow / No, /stop). Nothing leaves this computer.
const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const fakeAi = require("./helpers/fake-ai");
const { waitFor } = fakeAi;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-telegram-"));
Object.assign(process.env, { FRIENDS_DATA_DIR: path.join(tempDir, "data"), KEYRING_BACKEND: "file", LOG_LEVEL: "error", FRIENDS_CLOUD_GAP_MS: "0",
  FRIENDS_FAKE_GPU: JSON.stringify({ totalMb: 6144, usedMb: 400 }), FRIENDS_CLOUD_SHORT_WAIT_MS: "0", FRIENDS_TELEGRAM_POLL_SECONDS: "0", FRIENDS_GEMINI_RETRY_MS: "0" });
delete process.env.GEMINI_API_KEY;

describe("Telegram", () => {
  const ai = fakeAi.create();
  const sent = []; // what the bot said: { chat, text, buttons }
  const answered = [];
  const queue = [];
  let nextUpdate = 1;
  let tg, settings, keys, brains, runner, store, life, server;
  const ME = 111;

  const fakeTelegram = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
    const method = req.url.split("/").pop();
    const ok = (result) => res.end(JSON.stringify({ ok: true, result }));
    if (method === "getMe") return ok({ id: 1, username: "friends_test_bot" });
    if (method === "getUpdates") {
      if (!queue.length) await new Promise((r) => setTimeout(r, 15));
      return ok(queue.splice(0, queue.length));
    }
    if (method === "sendMessage") {
      sent.push({ chat: body.chat_id, text: body.text, buttons: body.reply_markup?.inline_keyboard?.flat() || [] });
      return ok({ message_id: sent.length });
    }
    if (method === "answerCallbackQuery") return answered.push(body.text), ok(true);
    return ok(true);
  });

  const say = (text, from = ME) => queue.push({ update_id: nextUpdate++, message: { message_id: nextUpdate, from: { id: from }, chat: { id: from }, text } });
  const press = (data, from = ME) => queue.push({ update_id: nextUpdate++, callback_query: { id: `cb${nextUpdate}`, from: { id: from }, data, message: { message_id: 1, chat: { id: from } } } });
  const said = (re) => sent.find((m) => re.test(m.text));
  const lastSaid = () => sent.at(-1);
  const mission = () => store.all().sort((a, b) => b.createdAt - a.createdAt)[0];
  const button = (m, re) => m.buttons.find((b) => re.test(b.text));
  const log = () => `${JSON.stringify(sent.map((m) => m.text.slice(0, 70)))} answered=${JSON.stringify(answered)}`;

  before(async () => {
    await ai.start();
    await new Promise((r) => fakeTelegram.listen(0, "127.0.0.1", r));
    process.env.FRIENDS_TELEGRAM_API = `http://127.0.0.1:${fakeTelegram.address().port}`;
    process.env.FRIENDS_GEMINI_API = ai.cloudUrl();
    settings = require("../server/settings");
    keys = require("../server/keys");
    brains = require("../server/brains");
    runner = require("../server/missions/runner");
    store = require("../server/missions/store");
    life = require("../server/life");
    tg = require("../server/telegram");
    const companion = require("../server/companion");
    await brains.saveBrain({ provider: "gemini", name: "Gemini", model: "gemini-3.8-flash", key: "test-key" });
    await brains.saveBrain({ provider: "local", protocol: "ollama", name: "tiny", baseUrl: ai.localUrl(), model: "tiny:latest", contextSize: 8192 });
    const s = settings.get();
    settings.set({ ...s, localNotes: { ...s.localNotes, folder: path.join(tempDir, "vault") }, missions: { ...s.missions, workspace: path.join(tempDir, "ws") }, routing: { ...s.routing, mode: "local" } });
    tg.setHandlers({ chat: (text) => companion.reply(text, {}) });
    // The same wiring as server.js: missions tell the bot
    runner.onEvent((e) => e.notify && tg.onMissionEvent(e));
  });

  after(async () => {
    tg.stop();
    for (const m of store.all()) if (["running", "paused", "planning"].includes(m.status)) runner.stop(m.id);
    await ai.stop();
    await new Promise((r) => fakeTelegram.close(r));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    sent.length = 0;
    answered.length = 0;
    ai.reset();
    ai.behave.questions = [];
    ai.behave.localStream = null;
    ai.behave.cloudStream = null;
    ai.behave.review = { ok: true, reason: "fine", fix: "" };
  });

  describe("Setting it up", () => {
    test("with no token it says what to do, and the token goes to the keyring, never into the settings file", async () => {
      assert.deepStrictEqual({ ...tg.status(), botUsername: undefined, lastError: undefined }, { enabled: false, hasToken: false, running: false, botUsername: undefined, lastError: undefined, allowed: 0 });
      await assert.rejects(() => tg.testConnection(""), /No token yet/);
      tg.saveToken("123456:ABC-secret");
      assert.strictEqual(tg.status().hasToken, true);
      assert.strictEqual(keys.getSecret("telegram-bot-token"), "123456:ABC-secret");
      const onDisk = fs.readFileSync(path.join(process.env.FRIENDS_DATA_DIR, "settings.json"), "utf8");
      assert.ok(!onDisk.includes("123456:ABC-secret"), "the token isn't in settings.json");
      const test = await tg.testConnection();
      assert.strictEqual(test.bot.username, "friends_test_bot");
    });

    test("a token typed into the settings page moves to the keyring too", () => {
      const s = settings.get();
      const saved = settings.set({ ...s, telegram: { ...s.telegram, botToken: "999:typed-in" } });
      assert.strictEqual(saved.telegram.botToken, "", "never handed back");
      assert.strictEqual(saved.telegram.hasToken, true);
      assert.strictEqual(keys.getSecret("telegram-bot-token"), "999:typed-in");
      assert.ok(!fs.readFileSync(path.join(process.env.FRIENDS_DATA_DIR, "settings.json"), "utf8").includes("typed-in"));
      tg.saveToken("123456:ABC-secret");
    });

    test("switching it on starts the listener; the first person to write becomes the owner", async () => {
      const s = settings.get();
      settings.set({ ...s, telegram: { ...s.telegram, enabled: true, allowedUserIds: [] } });
      await waitFor(() => tg.status().running, 5000, "the listener");
      assert.strictEqual(tg.status().botUsername, "friends_test_bot");
      say("hello there", 555);
      await waitFor(() => said(/Telegram id is 555/), 5000, "the welcome");
      assert.deepStrictEqual(settings.get().telegram.allowedUserIds, ["555"]);
      say("let me in too", 777);
      await new Promise((r) => setTimeout(r, 200));
      assert.ok(!sent.some((m) => m.chat === 777), "a second person gets no answer");
      settings.set({ ...settings.get(), telegram: { ...settings.get().telegram, allowedUserIds: [String(ME)] } });
    });
  });

  describe("Talking to it", () => {
    test("someone who isn't allowed gets nothing", async () => {
      say("what is on my list?", 424242);
      await new Promise((r) => setTimeout(r, 250));
      assert.strictEqual(sent.length, 0);
    });

    test("commands: the day, tasks, a reminder, a note", async () => {
      life.addTask({ title: "Call the bank" });
      say("/tasks");
      await waitFor(() => said(/Call the bank/), 5000, "the task list");
      say("/remind stretch in 30");
      await waitFor(() => said(/Reminder set for “stretch” in 30/), 5000, "the reminder");
      assert.ok(life.listReminders().some((r) => r.text === "stretch"));
      say("/note a thought from the bus");
      await waitFor(() => said(/Added to today's note/), 5000, "the note");
      const notes = require("../server/local-notes");
      assert.match((await notes.readNote("today")).content, /a thought from the bus/);
      say("/today");
      await waitFor(() => said(/^Today \(/), 5000, "the day");
    });

    test("a plain message gets the companion's answer, kept in a chat called Telegram", async () => {
      ai.behave.localStream = () => ({ content: "Hello from Atlas on your phone" });
      say("hey, how are you?");
      await waitFor(() => said(/Hello from Atlas/), 8000, "the answer");
      const chats = require("../server/chats");
      const chat = chats.list().find((c) => c.title === "Telegram");
      assert.ok(chat);
      assert.deepStrictEqual(chats.get(chat.id).messages.map((m) => m.role), ["user", "model"]);
      assert.match(ai.hits.local.find((h) => h.kind === "step").system, /Telegram, on their phone/);
    });
  });

  describe("Missions on Telegram", () => {
    const flow = { title: "Laptops", summary: "Find laptops and write a short report.", steps: [{ title: "Find laptops", role: "research", tools: [], inputs: "Find three", output: "A list" }, { title: "Write the report", role: "writing", tools: [], inputs: "Write", output: "A report", dependsOn: ["s1"] }] };

    test("/mission: its questions come here, the answer goes back, the plan has an Approve button, and when it's done you hear", async () => {
      ai.behave.plan = flow;
      ai.behave.questions = [{ id: "q1", text: "What is the budget?" }, { id: "q2", text: "Laptop or desktop?" }];
      ai.behave.localStream = (ctx) => ({ content: `Result of ${/YOUR STEP: (.+)/.exec(ctx.prompt)[1].trim()}` });
      say("/mission research the three best budget laptops and write me a report");
      await waitFor(() => said(/On it:/), 5000, "the acknowledgement");
      await waitFor(() => said(/A few questions before I plan/), 8000, "the questions");
      assert.match(said(/A few questions/).text, /1\. What is the budget\?\n2\. Laptop or desktop\?/);
      ai.behave.questions = [];
      say("800 euros\nlaptop");
      await waitFor(() => said(/A plan to approve: Laptops/), 8000, "the plan");
      const planMsg = said(/A plan to approve/);
      assert.match(planMsg.text, /1\. Find laptops/);
      assert.match(planMsg.text, /Limits: 60 min/);
      assert.deepStrictEqual(planMsg.buttons.map((b) => b.text), ["Approve", "Stop"]);
      assert.match(ai.hits.cloud.find((h) => h.kind === "plan").prompt, /800 euros/);
      assert.strictEqual(mission().status, "awaiting_approval");

      press(button(planMsg, /Approve/).callback_data);
      await waitFor(() => said(/Approved\. It's running/), 5000, `the confirmation ${log()}`);
      await waitFor(() => mission().status === "done", 15000, "the mission");
      await waitFor(() => said(/A mission is done/), 5000, "the done message");
      assert.match(lastSaid().text, /saved in your notes/);
    });

    test("a message that sounds like a goal offers a mission (and Just talk answers it as a chat)", async () => {
      say("Research the three best budget laptops for video editing, compare their prices and battery life, and write me a short report with sources.");
      await waitFor(() => said(/Make it a mission\?/), 5000, "the offer");
      const offer = said(/Make it a mission/);
      assert.deepStrictEqual(offer.buttons.map((b) => b.text), ["Start a mission", "Just talk"]);
      ai.behave.localStream = () => ({ content: "Sure, here are some thoughts." });
      press(button(offer, /Just talk/).callback_data);
      await waitFor(() => said(/here are some thoughts/), 8000, "the chat answer");
    });

    test("a question in the middle comes with Allow and No, and the answer goes to the mission", async () => {
      ai.behave.plan = { title: "Asky", summary: "x", steps: [{ title: "Run", role: "general", tools: ["run_command"], inputs: "Run it", output: "done", actions: [{ type: "command", command: "echo listed" }] }] };
      ai.behave.localStream = (ctx) => (ctx.round === 0 ? { tools: [{ name: "run_command", args: { command: "echo not-listed" } }] } : { content: "Finished" });
      say("/mission run the thing and tell me");
      await waitFor(() => said(/A plan to approve: Asky/), 8000, "the plan");
      press(button(said(/A plan to approve: Asky/), /Approve/).callback_data);
      await waitFor(() => said(/needs your OK/), 8000, "the question");
      const ask = said(/needs your OK/);
      assert.match(ask.text, /echo not-listed/);
      assert.deepStrictEqual(ask.buttons.map((b) => b.text), ["Allow", "No"]);
      press(button(ask, /^No$/).callback_data);
      await waitFor(() => mission().status === "done", 15000, "the mission to carry on without it");
      assert.ok(answered.includes("Declined"));
    });

    test("/stop stops everything at once", async () => {
      ai.behave.plan = { title: "Long", summary: "x", steps: [{ title: "Sleep", role: "general", tools: ["run_command"], inputs: "wait", output: "x", actions: [{ type: "command", command: "sleep *" }] }] };
      ai.behave.localStream = (ctx) => (ctx.round === 0 ? { tools: [{ name: "run_command", args: { command: "sleep 30" } }] } : { content: "x" });
      say("/mission wait around for a while");
      await waitFor(() => said(/A plan to approve: Long/), 8000, "the plan");
      press(button(said(/A plan to approve: Long/), /Approve/).callback_data);
      await waitFor(() => mission().status === "running" && mission().plan.steps[0].status === "running", 8000, "it to run");
      await new Promise((r) => setTimeout(r, 300));
      say("/stop");
      await waitFor(() => said(/Stopped 1 mission/), 5000, "the confirmation");
      assert.strictEqual(mission().status, "stopped");
    });

    test("/missions says what is going on", async () => {
      say("/missions");
      await waitFor(() => said(/Laptops: done|Long: stopped|Asky/), 5000, "the list");
    });
  });

  describe("In the person's language", () => {
    const pick = (language) => settings.set({ ...settings.get(), ui: { ...settings.get().ui, language } });
    after(() => pick("auto"));

    test("German picked in Settings: the bot answers in German", async () => {
      pick("de");
      say("/stop");
      await waitFor(() => said(/Es lief nichts/), 5000, "the German answer");
      say("/help");
      await waitFor(() => said(/Hallo! Ich bin dein Friends-Begleiter/), 5000, "the German help");
      say("/remind call the bank in 1");
      await waitFor(() => said(/Erinnerung an „call the bank“ in 1 Minute gesetzt/), 5000, "the singular");
    });

    test("Arabic picked: Arabic, with a plural that fits the number", async () => {
      pick("ar");
      say("/remind x in 2");
      await waitFor(() => said(/بعد دقيقتين/), 5000, "the dual");
      say("/remind y in 30");
      await waitFor(() => said(/بعد 30 دقيقة/), 5000, "the many");
    });

    test("auto follows the browser the page reported, and English is the way out", async () => {
      const { noteBrowser, language } = require("../server/say");
      pick("auto");
      noteBrowser("de-DE,de;q=0.9,en;q=0.8");
      assert.strictEqual(language(), "de");
      noteBrowser("fr-FR,fr;q=0.9");
      assert.strictEqual(language(), "en", "nothing it knows: English, like the page");
      noteBrowser("ar-EG,en;q=0.5");
      assert.strictEqual(language(), "ar");
      noteBrowser("*");
      assert.strictEqual(language(), "ar", "a header that says nothing changes nothing");
      pick("en");
      say("/stop");
      await waitFor(() => said(/Nothing was running/), 5000, "English again");
      pick("auto");
      noteBrowser("en");
    });
  });
});
