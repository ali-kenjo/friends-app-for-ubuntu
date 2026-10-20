// `npm run doctor` for the assistant: it reads the graphics card, Ollama, the specialists and the Gemini key and says what
// is missing and how to fix it. Run as a real child process against a fake Ollama and a fake 6 GB card.
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const fakeAi = require("./helpers/fake-ai");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-doctor-"));
const dataDir = path.join(tempDir, "data");
Object.assign(process.env, { FRIENDS_DATA_DIR: dataDir, KEYRING_BACKEND: "file", LOG_LEVEL: "error" });
delete process.env.GEMINI_API_KEY;

const doctor = (env = {}) =>
  new Promise((resolve) =>
    execFile(process.execPath, [path.join(__dirname, "..", "scripts", "doctor.js")], { env: { ...process.env, FRIENDS_FAKE_GPU: JSON.stringify({ totalMb: 6144, usedMb: 400, name: "Fake GTX 1660 Ti" }), ...env }, timeout: 30000 }, (err, stdout) => resolve({ code: err?.code || 0, out: String(stdout) }))
  );

describe("npm run doctor, for the assistant", () => {
  const ai = fakeAi.create();
  let settings, brains;

  before(async () => {
    await ai.start();
    process.env.FRIENDS_GEMINI_API = ai.cloudUrl();
    settings = require("../server/settings");
    brains = require("../server/brains");
    const s = settings.get();
    settings.set({ ...s, specialists: { ...s.specialists, baseUrl: ai.localUrl(), roles: [{ id: "general", model: "tiny:latest" }, { id: "coding", model: "huge:latest" }, { id: "embeddings", model: "nomic-embed-text:latest" }] }, missions: { ...s.missions, workspace: path.join(tempDir, "ws") } });
  });

  after(async () => {
    await ai.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("it reads the card, which models fit, which are missing, and that there is no Gemini key", async () => {
    const { out } = await doctor();
    assert.match(out, /Fake GTX 1660 Ti: 6\.0 GB, 5\.6 GB free now/);
    assert.match(out, /tiny fits the card/);
    assert.match(out, /Coding: huge only partly fits the card/, "9 GB on a 6 GB card is split with the processor");
    assert.match(out, /Run: ollama pull nomic-embed-text/, "the missing embeddings model is named with the command to get it");
    assert.match(out, /No Gemini key/);
    assert.match(out, /Missions work in /);
  });

  test("a Gemini key, and a card that isn't there, change what it says", async () => {
    await brains.saveBrain({ provider: "gemini", name: "Gemini", model: "gemini-3.8-flash", key: "test-key" });
    const { out } = await doctor({ FRIENDS_FAKE_GPU: "none" });
    assert.match(out, /A Gemini key is set/);
    assert.match(out, /No graphics card that local models can use/);
  });

  test("with Ollama not answering it says how to start it", async () => {
    const s = settings.get();
    settings.set({ ...s, specialists: { ...s.specialists, baseUrl: "http://127.0.0.1:1" } });
    const { out } = await doctor();
    assert.match(out, /Ollama isn't answering at http:\/\/127\.0\.0\.1:1/);
    assert.match(out, /ollama serve/);
  });

  test("a mission folder that can't be written is a problem, not a tip", async () => {
    const s = settings.get();
    settings.set({ ...s, specialists: { ...s.specialists, baseUrl: ai.localUrl() }, missions: { ...s.missions, workspace: "/proc/friends-no-way" } });
    const { out, code } = await doctor();
    assert.match(out, /Missions can't write to their workspace folder/);
    assert.strictEqual(code, 1);
  });
});
