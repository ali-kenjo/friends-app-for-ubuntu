// The catalogue of AI services, and recognising a pasted key or address.
const { test, describe } = require("node:test");
const assert = require("node:assert");
const services = require("../server/services");

describe("The catalogue", () => {
  test("every cloud service has what the page needs, and the ids are unique", () => {
    const ids = new Set();
    for (const s of services.CLOUD) {
      assert.ok(!ids.has(s.id), `${s.id} twice`);
      ids.add(s.id);
      assert.ok(s.label && s.company && s.about && /^#[0-9a-f]{6}$/i.test(s.color), s.id);
      if (!s.custom && !s.native) assert.match(s.baseUrl, /^https:\/\/[^\s/]+(\/[^\s]*)?[^/]$/, `${s.id}: an https address without a trailing slash`);
      if (!s.custom) assert.match(s.keyUrl, /^https:\/\//, `${s.id} says where to get a key`);
      assert.ok(["list", "static"].includes(s.models), s.id);
      if (s.models === "static") assert.ok(s.staticModels?.length, `${s.id} has no list, so it needs one of its own`);
    }
    for (const must of ["gemini", "openai", "anthropic", "openrouter", "groq", "mistral", "deepseek", "xai", "custom"]) assert.ok(ids.has(must), `${must} is in the list`);
    assert.ok(services.CLOUD.length >= 20, "plenty of services");
  });

  test("every local server has an address on its own port, and Ollama uses its own API", () => {
    const ids = new Set();
    for (const s of services.LOCAL) {
      assert.ok(!ids.has(s.id));
      ids.add(s.id);
      assert.ok(s.about, s.id);
      if (s.custom) continue; // "another server": you give the address
      assert.match(s.url, new RegExp(`^http://127\\.0\\.0\\.1:${s.port}(/|$)`), s.id);
      assert.ok(s.start && s.download, s.id);
      assert.strictEqual(s.protocol, s.id === "ollama" ? "ollama" : "openai");
    }
    assert.ok(services.LOCAL.length >= 8);
  });

  test("the page's copy has no functions and can be sent as JSON", () => {
    const copy = JSON.parse(JSON.stringify(services.publicCatalog()));
    assert.strictEqual(copy.cloud.find((s) => s.id === "groq").keyPattern, "^gsk_");
    assert.strictEqual(copy.cloud.find((s) => s.id === "mistral").keyPattern, "");
    assert.ok(copy.local.length);
  });
});

describe("Recognising what was pasted", () => {
  const key = (text) => services.recognise(text);
  test("keys with their own prefix are certain", () => {
    for (const [text, id] of [["AIzaSyA1234567890123456789012345678901", "gemini"], ["sk-ant-api03-abcdefghijklmnop", "anthropic"], ["sk-or-v1-abc123abc123abc123abc1", "openrouter"], ["gsk_abcdefghijklmnop12345", "groq"], ["xai-abcdefghijklmnopqrstu", "xai"], ["pplx-abcdefghijklmnopqrstu", "perplexity"], ["sk-proj-abcdefghijklmnopqrstuvwx", "openai"], ["hf_abcdefghijklmnopqrstu", "huggingface"]]) {
      assert.deepStrictEqual(key(text), { kind: "key", matches: [id], certain: true }, id);
    }
  });

  test("an ambiguous key lists the candidates and says it isn't sure", () => {
    const r = key("sk-abcdefghijklmnopqrstuvwxyz");
    assert.strictEqual(r.certain, false);
    assert.ok(["openai", "deepseek", "moonshot", "qwen"].every((id) => r.matches.includes(id)));
    assert.deepStrictEqual(key("abcdefghijklmnopqrstuvwxyz012345").matches, ["mistral", "cohere"]);
  });

  test("an address is a local server when its port is known, a cloud service when its host is", () => {
    assert.deepStrictEqual(key("http://localhost:1234/v1").matches, ["lmstudio"]);
    assert.deepStrictEqual(key("127.0.0.1:11434").matches, ["ollama"]);
    assert.deepStrictEqual(key("https://api.groq.com/openai/v1").matches, ["groq"]);
    assert.strictEqual(key("https://api.groq.com/openai/v1").cloud, true);
    const unknown = key("http://192.168.1.50:9999");
    assert.deepStrictEqual(unknown.matches, []);
    assert.strictEqual(unknown.kind, "address");
  });

  test("nothing sensible is nothing", () => {
    assert.strictEqual(key("").kind, "unknown");
    assert.strictEqual(key("hello there").kind, "unknown");
  });
});
