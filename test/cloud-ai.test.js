// Cloud AIs of the OpenAI kind (ChatGPT, Claude, Groq, OpenRouter, any other service): adding one, several at once, what a
// service refuses being learned, each AI's own settings, the order they are tried in, and the AI for small jobs.
const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const fakeOpenai = require("./helpers/fake-openai");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-cloud-ai-"));
Object.assign(process.env, { FRIENDS_DATA_DIR: tempDir, KEYRING_BACKEND: "file", LOG_LEVEL: "error", FRIENDS_RETRY_MS: "1" });
delete process.env.GEMINI_API_KEY;

const brains = require("../server/brains");
const settings = require("../server/settings");
const router = require("../server/router");
const usage = require("../server/usage");

describe("Cloud AIs", () => {
  const ai = fakeOpenai.create({ keys: ["good-key"], models: ["small-model", "big-model", "claude-sonnet-5-5"] });
  const names = () => brains.publicState().brains.map((b) => b.name);

  before(() => ai.start());
  after(async () => {
    await ai.stop();
    usage.clearCache();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  beforeEach(() => {
    ai.reset();
    Object.assign(ai.behave, { status: 0, delay: 0, rejectTemperature: false, tokensParam: "max_tokens", noTools: false, noList: false, failFirst: 0, text: "Hello from the service" });
    for (const b of brains.publicState().brains) brains.deleteBrain(b.id);
    settings.set({ ...settings.get(), privacy: { ...settings.get().privacy, localOnly: false }, routing: { ...settings.get().routing, taskBrain: 0 } });
  });

  test("a service is added with a key: its name, its models without the ones that can't chat, and the key kept apart", async () => {
    const models = await brains.listModels({ provider: "openai", service: "groq", baseUrl: ai.url(), key: "good-key" });
    assert.deepStrictEqual(models, ["big-model", "claude-sonnet-5-5", "small-model"], "embeddings, pictures and speech left out, sorted");
    const state = await brains.saveBrain({ provider: "openai", service: "groq", baseUrl: ai.url(), key: "good-key", model: "small-model" });
    const [b] = state.brains;
    assert.strictEqual(b.name, "Groq");
    assert.strictEqual(b.service, "groq");
    assert.strictEqual(b.kind, "cloud");
    assert.strictEqual(b.keyHint, "-key");
    assert.ok(!JSON.stringify(state).includes("good-key"), "the key never goes to the page");
    assert.strictEqual(brains.getForChat(b.id).key, "good-key");
  });

  test("the key the service refuses, a missing key and an unknown service are said plainly", async () => {
    await assert.rejects(() => brains.saveBrain({ provider: "openai", service: "groq", baseUrl: ai.url(), key: "wrong" }), /Groq didn't accept the API key/);
    await assert.rejects(() => brains.saveBrain({ provider: "openai", service: "groq", baseUrl: ai.url() }), /Paste an API key first/);
    await assert.rejects(() => brains.saveBrain({ provider: "openai", service: "nobody", key: "x" }), /isn't known/);
    await assert.rejects(() => brains.saveBrain({ provider: "openai", service: "custom", key: "x", baseUrl: "" }), /address of the service/);
    await assert.rejects(() => brains.saveBrain({ provider: "openai", service: "groq", baseUrl: ai.url(), key: "good-key", model: "no-such-model" }), /isn't available with this key/);
  });

  test("a service of your own address needs no key when it has none", async () => {
    const open = fakeOpenai.create({ keys: [], models: ["house-model"] });
    await open.start();
    try {
      const state = await brains.saveBrain({ provider: "openai", service: "custom", baseUrl: open.url(), name: "House gateway" });
      assert.strictEqual(state.brains[0].model, "house-model");
      assert.strictEqual(state.brains[0].name, "House gateway");
      assert.strictEqual(brains.getForChat(state.brains[0].id).key, "");
    } finally {
      await open.stop();
    }
  });

  test("a service with no model list (Claude's endpoint) offers its known models and takes any name you type", async () => {
    ai.behave.noList = true;
    const models = await brains.listModels({ provider: "openai", service: "anthropic", baseUrl: ai.url(), key: "good-key" });
    assert.ok(models.includes("claude-sonnet-5-5") && models.includes("claude-opus-5-5"));
    const state = await brains.saveBrain({ provider: "openai", service: "anthropic", baseUrl: ai.url(), key: "good-key", model: "claude-sonnet-5-5" });
    assert.strictEqual(state.brains[0].name, "Claude");
    // Claude's endpoint refuses a temperature: none is sent
    ai.reset();
    const brain = brains.getForChat(state.brains[0].id);
    await brain.api.generateText({ key: brain.key, model: brain.model, prompt: "hi", temperature: 0.3 });
    assert.strictEqual(ai.chats()[0].body.temperature, undefined);
  });

  test("what a service refuses is learned once: no temperature, another name for the token limit", async () => {
    Object.assign(ai.behave, { rejectTemperature: true, tokensParam: "max_completion_tokens" });
    const state = await brains.saveBrain({ provider: "openai", service: "openai", baseUrl: ai.url(), key: "good-key", model: "small-model" });
    const brain = brains.getForChat(state.brains[0].id);
    ai.reset();
    const text = await brain.api.generateText({ key: brain.key, model: brain.model, prompt: "hi", temperature: 0.3, maxTokens: 50 });
    assert.strictEqual(text, "Hello from the service");
    const sent = ai.chats();
    assert.ok(sent.length <= 3, "a few tries at most");
    const last = sent.at(-1).body;
    assert.strictEqual(last.temperature, undefined);
    assert.strictEqual(last.max_tokens, undefined);
    assert.strictEqual(last.max_completion_tokens, 50, "the cap goes under the name this service wants");
    // the second time nothing is refused any more: one request
    ai.reset();
    await brain.api.generateText({ key: brain.key, model: brain.model, prompt: "again", temperature: 0.3 });
    assert.strictEqual(ai.chats().length, 1);
    assert.strictEqual(ai.chats()[0].body.temperature, undefined);
  });

  test("a chat streams, and the AI's own settings and Settings' reply length reach the service", async () => {
    const state = await brains.saveBrain({ provider: "openai", service: "groq", baseUrl: ai.url(), key: "good-key", model: "small-model", params: { temperature: 0.4, topP: 0.8 } });
    settings.set({ ...settings.get(), aiControl: { ...settings.get().aiControl, maxTokens: 640 } });
    const brain = brains.getForChat(state.brains[0].id);
    ai.reset();
    let out = "";
    await brain.api.streamChat({ key: brain.key, model: brain.model, contents: [{ role: "user", parts: [{ text: "Hi there" }] }], system: "Be brief.", temperature: 1, onText: (p) => (out += p) });
    assert.strictEqual(out, "Hello from the service");
    const body = ai.chats()[0].body;
    assert.strictEqual(body.stream, true);
    assert.strictEqual(body.temperature, 0.4);
    assert.strictEqual(body.top_p, 0.8);
    assert.strictEqual(body.max_tokens, 640);
    assert.strictEqual(body.messages[0].content, "Be brief.");
    assert.strictEqual(ai.chats()[0].auth, "Bearer good-key");
  });

  test("a busy service is tried again, and its calls are counted for the page", async () => {
    const state = await brains.saveBrain({ provider: "openai", service: "groq", baseUrl: ai.url(), key: "good-key", model: "small-model" });
    const brain = brains.getForChat(state.brains[0].id);
    ai.reset();
    ai.behave.failFirst = 1;
    assert.strictEqual(await brain.api.generateText({ key: brain.key, model: brain.model, prompt: "hi" }), "Hello from the service");
    assert.strictEqual(ai.chats().length, 2, "one 503, then the answer");
    assert.strictEqual(usage.forBrain(brain.id).calls >= 1, true);
  });

  test("several models of one service are added at once; ones already there and ones that fail are reported", async () => {
    await brains.saveBrain({ provider: "openai", service: "groq", baseUrl: ai.url(), key: "good-key", model: "small-model" });
    const result = await brains.saveMany({ provider: "openai", service: "groq", baseUrl: ai.url(), key: "good-key", models: ["small-model", "big-model", "claude-sonnet-5-5", "no-such-model"] });
    assert.deepStrictEqual(result.added, ["big-model", "claude-sonnet-5-5"]);
    assert.deepStrictEqual(result.skipped, ["small-model"]);
    assert.strictEqual(result.failed.length, 1);
    assert.strictEqual(result.failed[0].model, "no-such-model");
    assert.strictEqual(result.state.brains.length, 3);
    // a wrong key stops after the first failure instead of asking for every model
    ai.reset();
    const bad = await brains.saveMany({ provider: "openai", service: "mistral", baseUrl: ai.url(), key: "wrong", models: ["a", "b", "c"] });
    assert.strictEqual(bad.added.length, 0);
    assert.strictEqual(bad.failed.length, 1);
    await assert.rejects(() => brains.saveMany({ provider: "openai", service: "groq", key: "k", models: [] }), /at least one model/);
  });

  test("a name, switching it off and its own settings can change without asking the service again; the default stays on", async () => {
    await brains.saveMany({ provider: "openai", service: "groq", baseUrl: ai.url(), key: "good-key", models: ["small-model", "big-model"] });
    const [first, second] = brains.publicState().brains;
    ai.reset();
    const state = brains.updateBrain(second.id, { name: "  My big one ", enabled: false, params: { temperature: 5, maxTokens: "2000", topP: 2, dailyLimit: 30, systemPrefix: "  Be formal.  ", tools: "off", vision: "yes", bogus: 1 }, note: "for hard questions" });
    assert.strictEqual(ai.hits.length, 0, "nothing was asked of the service");
    const b = state.brains.find((x) => x.id === second.id);
    assert.strictEqual(b.name, "My big one");
    assert.strictEqual(b.enabled, false);
    assert.deepStrictEqual(b.params, { temperature: 2, maxTokens: 2000, topP: 1, dailyLimit: 30, systemPrefix: "Be formal.", tools: "off", vision: "yes" }, "clamped, trimmed, unknown dropped");
    assert.strictEqual(b.note, "for hard questions");
    assert.strictEqual(brains.updateBrain(first.id, { enabled: false }).brains[0].enabled, true, "the default stays on");
    assert.strictEqual(brains.updateBrain(second.id, { params: {} }).brains[1].params, undefined, "empty settings are no settings");
  });

  test("the order is the order they are tried in, and moving past the ends does nothing", async () => {
    await brains.saveMany({ provider: "openai", service: "groq", baseUrl: ai.url(), key: "good-key", models: ["small-model", "big-model", "claude-sonnet-5-5"] });
    const ids = () => brains.publicState().brains.map((b) => b.model);
    brains.moveBrain(brains.publicState().brains[2].id, "up");
    assert.deepStrictEqual(ids(), ["small-model", "claude-sonnet-5-5", "big-model"]);
    brains.moveBrain(brains.publicState().brains[0].id, "up");
    brains.moveBrain(brains.publicState().brains[2].id, "down");
    assert.deepStrictEqual(ids(), ["small-model", "claude-sonnet-5-5", "big-model"]);
    assert.deepStrictEqual(brains.ofKind("cloud").map((b) => b.model), ["small-model", "claude-sonnet-5-5", "big-model"], "the default first, then the list's order");
  });

  test("Private mode keeps every cloud AI out, and the AI for small jobs is the one you chose", async () => {
    await brains.saveMany({ provider: "openai", service: "groq", baseUrl: ai.url(), key: "good-key", models: ["small-model", "big-model"] });
    const [first, second] = brains.publicState().brains;
    assert.strictEqual(brains.forTask().id, first.id, "the default, by the routing mode");
    settings.patch({ routing: { taskBrain: second.id } });
    assert.strictEqual(brains.forTask().id, second.id);
    brains.deleteBrain(second.id);
    assert.strictEqual(settings.get().routing.taskBrain, 0, "an AI that is gone can't be the one for small jobs");
    settings.patch({ privacy: { localOnly: true } });
    await assert.rejects(() => brains.saveBrain({ provider: "openai", service: "groq", baseUrl: ai.url(), key: "good-key", model: "small-model" }), /Private mode is on/);
    await assert.rejects(() => brains.listModels({ provider: "openai", service: "groq", baseUrl: ai.url(), key: "good-key" }), /Private mode is on/);
  });

  test("if one fails, the next of the same kind is tried (when Settings says so), never one of the other kind", async () => {
    await brains.saveMany({ provider: "openai", service: "groq", baseUrl: ai.url(), key: "good-key", models: ["small-model", "big-model"] });
    const deps = { has: brains.has, byKind: brains.getByKind, chosen: (id) => brains.getForChat(id), others: brains.othersOfKind, privateMode: false };
    const plan = (fallback) => router.plan({ settings: { ...settings.get(), routing: { ...settings.get().routing, mode: "fixed", fallback } }, text: "hi", deps });
    assert.strictEqual(plan("off").steps.length, 1);
    const chain = plan("same-kind").steps;
    assert.deepStrictEqual(chain.map((s) => s.brain.model), ["small-model", "big-model"]);
    assert.ok(chain.every((s) => s.kind === "cloud"));
    // and the chain really runs: the first fails, the second answers
    const tried = [];
    const { step } = await router.execute(plan("same-kind"), { run: async (s, { started }) => { tried.push(s.brain.model); if (s.brain.model === "small-model") throw new Error("down"); started(); }, emit() {}, cloudAllowed: () => true, allowCloud() {}, confirmCloud: async () => true, track: false });
    assert.deepStrictEqual(tried, ["small-model", "big-model"]);
    assert.strictEqual(step.brain.model, "big-model");
  });

  test("an AI told it sees pictures is believed, one told it doesn't too", () => {
    const settingsNow = { ...settings.get(), routing: { ...settings.get().routing, auto: { ...settings.get().routing.auto, attachments: true } } };
    const reason = (local) => router.cloudReason({ text: "look", attachments: [{ mime: "image/png", name: "a.png" }], messages: [], settings: settingsNow, local });
    assert.strictEqual(reason({ model: "tiny:latest", params: { vision: "yes" } }), null);
    assert.match(reason({ model: "llava:7b", params: { vision: "no" } }), /can't see pictures/);
    assert.strictEqual(reason({ model: "llava:7b" }), null, "by its name, as before");
    assert.match(reason({ model: "tiny:latest" }), /can't see pictures/);
  });
});
