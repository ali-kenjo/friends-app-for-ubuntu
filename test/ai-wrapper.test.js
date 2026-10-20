// What happens around every AI call: the AI's own settings, a daily limit, counting, hiding private things from a cloud AI,
// a time limit, and trying again for a passing failure. With fake providers, so each rule is seen alone.
const { test, describe, beforeEach, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.FRIENDS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "friends-wrapper-"));
process.env.KEYRING_BACKEND = "file";
process.env.LOG_LEVEL = "error";
process.env.FRIENDS_RETRY_MS = "1";

const wrapper = require("../server/ai-wrapper");
const usage = require("../server/usage");

const baseSettings = (extra = {}) => ({ aiControl: { maxTokens: 0, timeoutSeconds: 0, retries: 1 }, privacy: { redact: { keys: true, cards: true, emails: false, phones: false } }, ...extra });

// A fake provider that records what it was asked and behaves as told
function fakeApi(behave = {}) {
  const calls = [];
  return {
    calls,
    async streamChat(args) {
      calls.push({ type: "stream", args });
      if (behave.fail && calls.length <= behave.fail) throw Object.assign(new Error("The service is busy"), { retryable: true });
      if (behave.hang) await new Promise((resolve, reject) => args.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
      if (behave.text) args.onText(behave.text);
      if (behave.tool) await args.runTool(behave.tool.name, behave.tool.args);
      if (behave.failAfterText) throw Object.assign(new Error("dropped"), { retryable: true });
    },
    async generateText(args) {
      calls.push({ type: "text", args });
      if (behave.fail && calls.length <= behave.fail) throw Object.assign(new Error("The service is busy"), { retryable: true });
      return "text";
    },
    listModels: async () => ["m"],
  };
}

const brain = (extra = {}) => ({ id: 7, name: "Test AI", provider: "openai", kind: "cloud", params: {}, ...extra });

describe("The AI's own settings", () => {
  beforeEach(() => usage.clearCache());
  after(() => usage.clearCache());

  test("its temperature, longest reply, top-p and extra instructions go to chat, and tools can be switched off", async () => {
    const api = fakeApi();
    const ai = wrapper.wrap(api, brain({ params: { temperature: 0.2, maxTokens: 300, topP: 0.9, systemPrefix: "Answer in French.", tools: "off" } }), () => baseSettings());
    await ai.streamChat({ key: "k", model: "m", contents: [], system: "Be nice.", temperature: 1.1, tools: [{ name: "x" }], onText() {} });
    const sent = api.calls[0].args;
    assert.strictEqual(sent.temperature, 0.2, "its own temperature wins over the character's");
    assert.strictEqual(sent.maxTokens, 300);
    assert.strictEqual(sent.topP, 0.9);
    assert.strictEqual(sent.system, "Answer in French.\n\nBe nice.");
    assert.deepStrictEqual(sent.tools, []);
  });

  test("the reply length for every AI comes from Settings, and the AI's own beats it; small jobs aren't cut short", async () => {
    const api = fakeApi();
    const global = wrapper.wrap(api, brain(), () => baseSettings({ aiControl: { maxTokens: 800, timeoutSeconds: 0, retries: 0 } }));
    await global.streamChat({ contents: [], onText() {} });
    assert.strictEqual(api.calls[0].args.maxTokens, 800);
    const own = wrapper.wrap(api, brain({ params: { maxTokens: 100 } }), () => baseSettings({ aiControl: { maxTokens: 800, timeoutSeconds: 0, retries: 0 } }));
    await own.streamChat({ contents: [], onText() {} });
    assert.strictEqual(api.calls[1].args.maxTokens, 100);
    await global.generateText({ prompt: "plan this" });
    assert.strictEqual(api.calls[2].args.maxTokens, undefined, "a plan or a summary must not be cut");
  });

  test("a daily limit stops further calls with a clear message, and counts again tomorrow", async () => {
    const ai = wrapper.wrap(fakeApi(), brain({ params: { dailyLimit: 2 } }), () => baseSettings());
    await ai.generateText({ prompt: "a" });
    await ai.generateText({ prompt: "b" });
    await assert.rejects(() => ai.generateText({ prompt: "c" }), (err) => err.limit === true && /daily limit of 2/.test(err.message));
    assert.strictEqual(usage.forBrain(7).calls, 2, "the refused call isn't counted");
  });

  test("calls and failures are counted, and a stop pressed by the person is not a failure", async () => {
    const ai = wrapper.wrap(fakeApi({ hang: true }), brain(), () => baseSettings());
    const stop = new AbortController();
    const pending = ai.streamChat({ contents: [], signal: stop.signal, onText() {} });
    stop.abort();
    await assert.rejects(pending, { name: "AbortError" });
    assert.strictEqual(usage.forBrain(7).errors, 0);
    const failing = wrapper.wrap({ ...fakeApi(), generateText: async () => { throw new Error("nope"); } }, brain(), () => baseSettings());
    await assert.rejects(() => failing.generateText({ prompt: "x" }), /nope/);
    const u = usage.forBrain(7);
    assert.strictEqual(u.errors, 1);
    assert.strictEqual(u.lastError, "nope");
  });
});

describe("Hiding private things from a cloud AI", () => {
  const settings = () => baseSettings({ privacy: { redact: { keys: true, cards: true, emails: true, phones: false } } });

  test("the messages, the instructions and the prompt are cleaned for a cloud AI", async () => {
    const api = fakeApi();
    const ai = wrapper.wrap(api, brain(), settings);
    await ai.streamChat({ contents: [{ role: "user", parts: [{ text: "my email is ann@example.com" }] }], system: "User: bob@example.com", onText() {} });
    assert.strictEqual(api.calls[0].args.contents[0].parts[0].text, "my email is [email]");
    assert.strictEqual(api.calls[0].args.system, "User: [email]");
    await ai.generateText({ prompt: "ann@example.com", system: "sk-proj-abcdefghijklmnopqrstuvwx" });
    assert.strictEqual(api.calls[1].args.prompt, "[email]");
    assert.strictEqual(api.calls[1].args.system, "[key]");
  });

  test("what a tool brings back is cleaned before the AI reads it", async () => {
    let seen;
    const api = fakeApi({ tool: { name: "read", args: {} } });
    const ai = wrapper.wrap(api, brain(), settings);
    await ai.streamChat({ contents: [], onText() {}, runTool: async () => ({ from: "ann@example.com" }) });
    // the provider got a runTool that cleans: call it the way the provider did
    const result = await api.calls[0].args.runTool("read", {});
    assert.deepStrictEqual(result, { from: "[email]" });
    seen = result;
    assert.ok(seen);
  });

  test("a local AI sees everything", async () => {
    const api = fakeApi();
    const ai = wrapper.wrap(api, brain({ kind: "local", provider: "local" }), settings);
    await ai.generateText({ prompt: "ann@example.com" });
    assert.strictEqual(api.calls[0].args.prompt, "ann@example.com");
  });
});

describe("Time limits and trying again", () => {
  beforeEach(() => usage.clearCache());

  test("an AI that stays silent is given up on, with a message that says what to do", async () => {
    const ai = wrapper.wrap(fakeApi({ hang: true }), brain({ params: { timeoutSeconds: 0.15 } }), () => baseSettings());
    await assert.rejects(() => ai.streamChat({ contents: [], onText() {} }), (err) => err.timeout === true && /didn't answer within 0.15 seconds/.test(err.message));
    assert.strictEqual(usage.forBrain(7).errors, 1);
  });

  test("a passing failure is tried again before anything shows; the second try works", async () => {
    const api = fakeApi({ fail: 1, text: "hi" });
    const ai = wrapper.wrap(api, brain(), () => baseSettings());
    const pieces = [];
    await ai.streamChat({ contents: [], onText: (p) => pieces.push(p) });
    assert.strictEqual(api.calls.length, 2);
    assert.deepStrictEqual(pieces, ["hi"]);
    assert.strictEqual(usage.forBrain(7).calls, 1, "one call, however many tries");
  });

  test("there are no tries left when Settings says none", async () => {
    const api = fakeApi({ fail: 1 });
    const ai = wrapper.wrap(api, brain(), () => baseSettings({ aiControl: { maxTokens: 0, timeoutSeconds: 0, retries: 0 } }));
    await assert.rejects(() => ai.streamChat({ contents: [], onText() {} }), /busy/);
    assert.strictEqual(api.calls.length, 1);
  });

  test("after text was shown, a failure is not repeated (that would say it twice)", async () => {
    const api = fakeApi({ text: "half an answer", failAfterText: true });
    const ai = wrapper.wrap(api, brain(), () => baseSettings());
    await assert.rejects(() => ai.streamChat({ contents: [], onText() {} }), /dropped/);
    assert.strictEqual(api.calls.length, 1);
  });

  test("Gemini does its own retrying, so it isn't tried twice over", async () => {
    const api = fakeApi({ fail: 1 });
    const ai = wrapper.wrap(api, brain({ provider: "gemini" }), () => baseSettings());
    await assert.rejects(() => ai.generateText({ prompt: "x" }), /busy/);
    assert.strictEqual(api.calls.length, 1);
  });

  test("what counts as passing: busy, no connection; not a wrong key or a stop", () => {
    assert.ok(wrapper.isTransient(Object.assign(new Error("x"), { retryable: true })));
    assert.ok(wrapper.isTransient(new Error("fetch failed")));
    assert.ok(!wrapper.isTransient(new Error("Incorrect API key")));
    assert.ok(!wrapper.isTransient(Object.assign(new Error("stopped"), { name: "AbortError", retryable: true })));
  });
});
