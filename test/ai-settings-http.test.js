// The helper's side of Settings → AI & privacy, through HTTP: saving only what changed, the new settings and what they
// are cleaned to, what this computer is, the services, usage, and what Privacy keeps and clears.
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const fakeOpenai = require("./helpers/fake-openai");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-ai-settings-"));
Object.assign(process.env, { FRIENDS_DATA_DIR: tempDir, KEYRING_BACKEND: "file", LOG_LEVEL: "error", FRIENDS_FAKE_GPU: JSON.stringify({ totalMb: 8192, usedMb: 300, name: "Fake RTX" }) });
delete process.env.GEMINI_API_KEY;

describe("AI & privacy in the helper", () => {
  const service = fakeOpenai.create({ keys: ["good-key"], models: ["small-model", "big-model"] });
  let server, base, settings, brains, chats;
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };

  before(async () => {
    await service.start();
    settings = require("../server/settings");
    brains = require("../server/brains");
    chats = require("../server/chats");
    server = require("../server/server").start(0, "127.0.0.1");
    await new Promise((r) => (server.listening ? r() : server.on("listening", r)));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((r) => server.close(r));
    await service.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("a patch changes only what it names, so a stale copy of the rest can't undo what the helper changed meanwhile", async () => {
    settings.set({ ...settings.get(), specialists: { ...settings.get().specialists, roles: [{ id: "coding", model: "coder:latest" }] } });
    // the page loaded the settings before that change and now saves one switch
    const patched = await call("PATCH", "/api/settings", { privacy: { localOnly: true } });
    assert.strictEqual(patched.status, 200);
    assert.strictEqual(patched.body.privacy.localOnly, true);
    assert.strictEqual(patched.body.specialists.roles[0].model, "coder:latest", "the specialists are as the helper has them");
    assert.strictEqual(settings.get().privacy.localOnly, true);
    await call("PATCH", "/api/settings", { privacy: { localOnly: false } });
    assert.strictEqual(settings.get().privacy.redact.keys, true, "its neighbours in the same part are kept too");
  });

  test("what is sent is cleaned: numbers stay in their range, odd choices go back to the default, extra keys are dropped", async () => {
    const r = await call("PATCH", "/api/settings", {
      aiControl: { maxTokens: -5, timeoutSeconds: 99999, retries: 50 },
      routing: { fallback: "bogus", taskBrain: -3 },
      device: { profile: "turbo", gpu: "maybe", saveBattery: false },
      privacy: { keepChatsDays: 9999999, redact: { emails: "yes", phones: true, nonsense: true } },
      missions: { maxConcurrent: 0 },
      invented: { x: 1 },
    });
    const s = r.body;
    assert.deepStrictEqual([s.aiControl.maxTokens, s.aiControl.timeoutSeconds, s.aiControl.retries], [0, 3600, 5]);
    assert.deepStrictEqual([s.routing.fallback, s.routing.taskBrain], ["off", 0]);
    assert.deepStrictEqual([s.device.profile, s.device.gpu, s.device.saveBattery], ["auto", "auto", false]);
    assert.strictEqual(s.privacy.keepChatsDays, 3650);
    assert.deepStrictEqual(s.privacy.redact, { keys: true, cards: true, emails: false, phones: true });
    assert.strictEqual(s.missions.maxConcurrent, 0, "0 means: by what this computer can take");
    assert.strictEqual(s.invented, undefined);
    await call("PATCH", "/api/settings", { device: { saveBattery: true }, privacy: { redact: { phones: false } } });
  });

  test("a patch can't reach into the prototype", async () => {
    await fetch(base + "/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: '{"__proto__":{"polluted":true},"privacy":{"__proto__":{"polluted":true}}}' });
    assert.strictEqual({}.polluted, undefined);
  });

  test("the computer: what it is, what a local AI may ask of it, and suggestions that fit", async () => {
    const r = await call("GET", "/api/hardware");
    assert.strictEqual(r.status, 200);
    const h = r.body;
    assert.strictEqual(h.gpus[0].name, "Fake RTX");
    assert.strictEqual(h.fit.engine, "cuda");
    assert.strictEqual(h.fit.budgetMb, 8192 - 448);
    assert.strictEqual(h.fit.tier, "large", "7.5 GB of an 8 GB card");
    assert.strictEqual(h.effective.mode, "auto");
    assert.strictEqual(h.effective.contextSize, 8192);
    assert.ok(h.suggestions.general.model && h.suggestions.coding.model && h.suggestions.embeddings.model);
    assert.strictEqual(h.suggestions.general.fits, true);
    assert.strictEqual(h.os.platform, process.platform);
    // a profile changes what a local AI is told to ask
    await call("PATCH", "/api/settings", { device: { profile: "light" } });
    const light = (await call("GET", "/api/hardware")).body;
    assert.deepStrictEqual([light.effective.contextSize, light.effective.keepAliveMinutes, light.effective.missionsAtOnce], [4096, 5, 1]);
    await call("PATCH", "/api/settings", { device: { profile: "performance" } });
    assert.strictEqual((await call("GET", "/api/hardware")).body.effective.keepAliveMinutes, 60);
    await call("PATCH", "/api/settings", { device: { profile: "auto" } });
  });

  test("the services to pick from, and what a pasted key is", async () => {
    const list = (await call("GET", "/api/services")).body;
    assert.ok(list.cloud.length >= 20 && list.local.length >= 8);
    assert.ok(list.cloud.some((s) => s.id === "gemini" && s.native));
    const r = await call("POST", "/api/services/recognise", { input: "gsk_abcdefghijklmnopqrstuvwx" });
    assert.deepStrictEqual(r.body.matches, ["groq"]);
  });

  test("adding several models over HTTP, then each AI's use today and its own settings", async () => {
    const added = await call("POST", "/api/brains/bulk", { provider: "openai", service: "groq", baseUrl: service.url(), key: "good-key", models: ["small-model", "big-model"] });
    assert.strictEqual(added.status, 200);
    assert.deepStrictEqual(added.body.added, ["small-model", "big-model"]);
    const [a, b] = added.body.state.brains;
    const patched = await call("PATCH", `/api/brains/${b.id}`, { name: "Big one", params: { dailyLimit: 5 } });
    assert.strictEqual(patched.body.brains[1].name, "Big one");
    assert.deepStrictEqual(patched.body.brains[1].params, { dailyLimit: 5 });
    const moved = await call("POST", `/api/brains/${b.id}/move`, { direction: "up" });
    assert.deepStrictEqual(moved.body.brains.map((x) => x.id), [b.id, a.id]);
    const brain = brains.getForChat(a.id);
    await brain.api.generateText({ key: brain.key, model: brain.model, prompt: "hi" });
    const u = (await call("GET", "/api/usage")).body;
    assert.strictEqual(u.byBrain[a.id].calls >= 1, true);
    assert.strictEqual(u.byBrain[b.id].calls, 0);
    assert.ok(Array.isArray(u.days));
    assert.strictEqual((await call("PATCH", "/api/brains/999", { name: "x" })).status >= 400, true);
  });

  test("what could leave this computer, and how much is kept", async () => {
    const r = (await call("GET", "/api/privacy")).body;
    assert.ok(r.leaving.some((x) => x.kind === "ai" && x.name === "Groq" || x.name === "Big one"), "the cloud AIs that are on");
    assert.ok(r.leaving.some((x) => x.id === "updates"), "the update check");
    assert.deepStrictEqual(r.redacting.sort(), ["cards", "keys"]);
    await call("PATCH", "/api/settings", { privacy: { localOnly: true } });
    const priv = (await call("GET", "/api/privacy")).body;
    assert.deepStrictEqual(priv.leaving, [], "Private mode: nothing goes out");
    await call("PATCH", "/api/settings", { privacy: { localOnly: false } });
  });

  test("old chats are deleted after the number of days you chose, and only those", async () => {
    const privacy = require("../server/privacy");
    const make = (title, ageDays) => {
      const chat = chats.create(title);
      chat.messages.push({ id: title, role: "user", text: title, at: Date.now() });
      chat.updatedAt = Date.now() - ageDays * 86400000;
      chats.save(chat, { touch: false });
      return chat.id;
    };
    const old = make("old chat", 40);
    const recent = make("recent chat", 3);
    assert.strictEqual(privacy.pruneChats(0), 0, "0 days: keep everything");
    assert.strictEqual(privacy.pruneChats(30), 1);
    const left = chats.list().map((c) => c.id);
    assert.ok(!left.includes(old) && left.includes(recent));
  });

  test("clearing chats, memories and notes asks for a known kind and reports what went", async () => {
    settings.patch({ memory: { items: [{ id: "1", text: "likes tea" }, { id: "2", text: "has a dog" }] } });
    const r = (await call("POST", "/api/privacy/clear", { what: "memories" })).body;
    assert.strictEqual(r.cleared.memories, 2);
    assert.strictEqual(settings.get().memory.items.length, 0);
    const chatsGone = (await call("POST", "/api/privacy/clear", { what: "chats" })).body;
    assert.ok(chatsGone.cleared.chats >= 1);
    assert.strictEqual(chats.list().length, 0);
    assert.strictEqual((await call("POST", "/api/privacy/clear", { what: "everything-else" })).status >= 400, true);
  });
});
