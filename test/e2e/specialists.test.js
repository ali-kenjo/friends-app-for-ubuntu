// Settings → AI → Specialists in the real page: the roles with their models and the "fits the card" badge, picking a
// model, testing a role, pulling a model with a progress bar, removing one, adding a role. A fake Ollama plays the
// models and a fake 6 GB graphics card the hardware.
//   npm run test:e2e
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const fakeAi = require("../helpers/fake-ai");

const CHROME = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => p && fs.existsSync(p));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-e2e-specialists-"));
Object.assign(process.env, { FRIENDS_DATA_DIR: path.join(tempDir, "data"), KEYRING_BACKEND: "file", LOG_LEVEL: "error", FRIENDS_FAKE_GPU: JSON.stringify({ totalMb: 6144, usedMb: 400 }) });
delete process.env.GEMINI_API_KEY;

describe("Specialists in Settings", { skip: !CHROME && "no Chrome found" }, () => {
  const ai = fakeAi.create();
  let browser, page, server, base;
  const problems = [];
  const api = (method, url, body) => fetch(base + url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
  const text = (sel) => page.$eval(sel, (el) => el.innerText);
  const roleCard = (label) => `xpath/.//li[contains(@class,"spec-role")][.//h4[normalize-space()="${label}"]]`;

  before(async () => {
    await ai.start();
    const settings = require("../../server/settings");
    const brains = require("../../server/brains");
    const s = settings.get();
    settings.set({ ...s, onboarding: { done: true, missions: true }, robot: { ...s.robot, chatDock: false } });
    await brains.saveBrain({ provider: "local", protocol: "ollama", name: "tiny", baseUrl: ai.localUrl(), model: "tiny:latest", contextSize: 8192 });
    server = require("../../server/server").start(0, "127.0.0.1");
    await new Promise((r) => (server.listening ? r() : server.on("listening", r)));
    base = `http://127.0.0.1:${server.address().port}`;
    browser = await require("puppeteer-core").launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-gpu", "--lang=en-US"] });
    page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      try {
        localStorage.setItem("friends.language", "en");
      } catch {}
    });
    await page.setViewport({ width: 1280, height: 1000 });
    page.on("pageerror", (err) => problems.push(`page error: ${err.message}`));
    page.on("console", (msg) => msg.type() === "error" && !/Failed to load resource/.test(msg.text()) && problems.push(`console: ${msg.text()}`));
    await page.goto(`${base}/`, { waitUntil: "networkidle2" });
  });

  after(async () => {
    await browser?.close();
    await new Promise((r) => server?.close(r));
    await ai.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
    assert.deepStrictEqual(problems, [], "no errors in the page");
  });

  test("the pane lists the roles, what is installed and whether each model fits the card", async () => {
    await page.click("#settings-btn");
    await page.click("#tab-specialists");
    await page.waitForSelector(".spec-role", { visible: true });
    const status = await text("#spec-status");
    assert.match(status, /Ollama is running/);
    assert.match(status, /of 6(\.0)? GB used/);
    const roles = await page.$$eval(".spec-role .spec-name", (els) => els.map((e) => e.textContent));
    for (const r of ["General", "Coding", "Embeddings"]) assert.ok(roles.some((x) => x.startsWith(r)), `${r} is listed: ${roles}`);
    const models = await text("#spec-models");
    for (const m of ["tiny", "coder", "huge"]) assert.match(models, new RegExp(m));
  });

  test("picking a model for a role saves it and the badge follows: the 9 GB one only half fits on 6 GB", async () => {
    const card = await page.waitForSelector(roleCard("Coding"));
    await card.$eval("select", (el) => {
      el.value = "huge:latest";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForFunction(() => /Part runs on the processor/.test(document.querySelector(".spec-role:nth-child(2)")?.innerText || ""), { timeout: 8000 });
    const saved = (await api("GET", "/api/settings")).specialists?.roles?.find((r) => r.id === "coding");
    assert.strictEqual(saved?.model, "huge:latest");
    await (await page.waitForSelector(roleCard("Coding"))).$eval("select", (el) => {
      el.value = "coder:latest";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForFunction(() => /Fits the card/.test(document.querySelector(".spec-role:nth-child(2)")?.innerText || ""), { timeout: 8000 });
  });

  test("Test loads the model and shows how long it took and where it ran", async () => {
    await page.$eval(".spec-role:first-child .spec-controls .btn:not(.btn-primary)", (el) => el.click());
    await page.waitForFunction(() => /“ok”/.test(document.querySelector(".spec-role")?.innerText || ""), { timeout: 8000 });
    const shown = await page.$eval(".spec-role:first-child", (el) => el.innerText);
    assert.match(shown, /answered in/);
    assert.match(shown, /on the graphics card/);
  });

  test("pulling a model shows a progress bar and ends with the model on the list", async () => {
    ai.behave.models.push({ name: "pulled:latest", size: 1e9 });
    await page.type("#spec-pull-name", "pulled");
    await page.click("#spec-pull-go");
    await page.waitForFunction(() => /is ready/.test(document.getElementById("spec-progress-text")?.textContent || ""), { timeout: 8000 });
    assert.strictEqual(await page.$eval("#spec-progress-bar", (el) => el.style.width), "100%");
    assert.match(await text("#spec-models"), /pulled/);
  });

  test("removing a model asks first and takes it off the list", async () => {
    await page.click('#spec-models button[aria-label*="pulled"]');
    await page.waitForSelector(".confirm-modal [data-answer=yes]", { visible: true });
    ai.behave.models = ai.behave.models.filter((m) => m.name !== "pulled:latest");
    await page.click(".confirm-modal [data-answer=yes]");
    await page.waitForFunction(() => !/pulled/.test(document.getElementById("spec-models").innerText), { timeout: 8000 });
  });

  test("a new role can be added and removed again", async () => {
    await page.click("#spec-add");
    await page.type("#spec-new [name=label]", "Poetry");
    await page.type("#spec-new [name=when]", "Verses and rhymes");
    await page.click('#spec-new button[type="submit"]');
    await page.waitForSelector(roleCard("Poetry"), { visible: true });
    const roles = (await api("GET", "/api/specialists")).roles;
    assert.ok(roles.some((r) => r.label === "Poetry" && !r.builtin));
  });
});
