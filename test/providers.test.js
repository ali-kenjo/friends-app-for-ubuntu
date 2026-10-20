// The provider layer: one interface for every AI, so another provider is one registration and nothing else changes.
const { test, describe } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.FRIENDS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "friends-providers-"));
process.env.KEYRING_BACKEND = "file";
process.env.LOG_LEVEL = "error";

const providers = require("../server/providers");
const brains = require("../server/brains");

const complete = (extra = {}) => ({
  listModels: async () => ["one"],
  checkModel: async () => {},
  generateText: async ({ prompt }) => `echo: ${prompt}`,
  streamChat: async () => ({ text: "hi" }),
  ...extra,
});

describe("Providers", () => {
  test("Gemini (cloud) and the local servers (local) are built in, and have everything the helper calls", () => {
    assert.deepStrictEqual(providers.names().slice(0, 2), ["gemini", "local"]);
    assert.strictEqual(providers.kindOf("gemini"), "cloud");
    assert.strictEqual(providers.kindOf("local"), "local");
    for (const options of [{ provider: "gemini" }, { provider: "local", protocol: "ollama", baseUrl: "http://127.0.0.1:11434" }, { provider: "local", protocol: "openai", baseUrl: "http://127.0.0.1:1234/v1" }]) {
      assert.deepStrictEqual(providers.missing(providers.create(options)), [], `${options.provider}/${options.protocol || ""} has ${providers.REQUIRED}`);
    }
  });

  test("a new provider is one registration, and the rest of the helper can use it", async () => {
    providers.register("acme", { kind: "cloud", label: "Acme AI", company: "Acme", create: () => complete() });
    assert.ok(providers.has("acme"));
    assert.strictEqual(providers.info("acme").company, "Acme");
    const api = providers.create({ provider: "acme" });
    assert.strictEqual(await api.generateText({ prompt: "ping" }), "echo: ping");
    // The brains module hands out the same api for a brain that uses it
    assert.strictEqual(await brains.apiFor({ provider: "acme", model: "m" }).generateText({ prompt: "pong" }), "echo: pong");
  });

  test("a provider decides whether Private mode lets it be used: cloud ones are off, local ones stay", () => {
    providers.register("acme-local", { kind: "local", create: () => complete() });
    assert.strictEqual(providers.kindOf("acme"), "cloud");
    assert.strictEqual(providers.kindOf("acme-local"), "local");
    assert.strictEqual(providers.kindOf("nobody"), "cloud", "what isn't known is treated as cloud, the safe side");
  });

  test("a provider that lacks a function, an unknown one and a bad registration are refused plainly", () => {
    providers.register("half", { kind: "cloud", create: () => ({ listModels: async () => [] }) });
    assert.throws(() => providers.create({ provider: "half" }), /missing checkModel, generateText, streamChat/);
    assert.throws(() => providers.create({ provider: "nobody" }), /That kind of AI isn't supported/);
    assert.throws(() => providers.register("bad", { kind: "elsewhere", create: () => ({}) }), /kind is "cloud" or "local"/);
    assert.throws(() => providers.register("bad", { kind: "cloud" }), /needs create/);
  });
});
