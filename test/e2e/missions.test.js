// Missions in the real page: start one, answer its questions, read and edit its plan, approve it, watch it
// work, answer a question it asks mid-way, stop one, read the report; the offer under a message that sounds
// like a goal; the sidebar badge and the line on Home. A fake Gemini and a fake Ollama play the models.
//   npm run test:e2e
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const fakeAi = require("../helpers/fake-ai");
const { waitFor } = fakeAi;

const CHROME = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => p && fs.existsSync(p));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-e2e-missions-"));
Object.assign(process.env, { FRIENDS_DATA_DIR: path.join(tempDir, "data"), KEYRING_BACKEND: "file", LOG_LEVEL: "error", FRIENDS_FAKE_GPU: JSON.stringify({ totalMb: 6144, usedMb: 400 }), FRIENDS_CLOUD_GAP_MS: "0", FRIENDS_CLOUD_SHORT_WAIT_MS: "0", FRIENDS_GEMINI_RETRY_MS: "0" });
delete process.env.GEMINI_API_KEY;

describe("Missions in the page", { skip: !CHROME && "no Chrome found" }, () => {
  const ai = fakeAi.create();
  let browser, page, server, base;
  const problems = [];
  const api = (method, url, body) => fetch(base + url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
  const text = (sel) => page.$eval(sel, (el) => el.innerText);
  const visible = (sel) => page.$eval(sel, (el) => !el.hidden && getComputedStyle(el).display !== "none").catch(() => false);
  const click = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);
  const missions = async () => (await api("GET", "/api/missions")).missions;
  const step = (title, extra = {}) => ({ title, role: "general", tools: [], inputs: title, output: "A result", ...extra });
  const stepOf = (ctx) => /YOUR STEP: (.+)/.exec(ctx.prompt)?.[1]?.trim() || "";

  before(async () => {
    await ai.start();
    process.env.FRIENDS_GEMINI_API = ai.cloudUrl();
    const settings = require("../../server/settings");
    const brains = require("../../server/brains");
    const s = settings.get();
    // No robot in the page (a software renderer would only slow it down)
    settings.set({ ...s, onboarding: { done: true, missions: true }, robot: { ...s.robot, chatDock: false }, missions: { ...s.missions, workspace: path.join(tempDir, "ws") }, localNotes: { ...s.localNotes, folder: path.join(tempDir, "vault") }, routing: { ...s.routing, mode: "fixed" } });
    await brains.saveBrain({ provider: "gemini", name: "Gemini", model: "gemini-3.8-flash", key: "test-key" });
    await brains.saveBrain({ provider: "local", protocol: "ollama", name: "tiny", baseUrl: ai.localUrl(), model: "tiny:latest", contextSize: 8192 });
    server = require("../../server/server").start(0, "127.0.0.1");
    await new Promise((r) => (server.listening ? r() : server.on("listening", r)));
    base = `http://127.0.0.1:${server.address().port}`;
    browser = await require("puppeteer-core").launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--accept-lang=en-US,en", "--disable-gpu", "--lang=en-US"] });
    page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      try {
        localStorage.setItem("friends.language", "en");
      } catch {}
    });
    await page.setViewport({ width: 1280, height: 900 });
    page.on("pageerror", (err) => problems.push(`page error: ${err.message}`));
    page.on("console", (msg) => msg.type() === "error" && !/Failed to load resource/.test(msg.text()) && problems.push(`console: ${msg.text()}`));
    await page.goto(`${base}/`, { waitUntil: "networkidle2" });
  });

  after(async () => {
    for (const m of await missions().catch(() => [])) if (!["done", "failed", "stopped"].includes(m.status)) await api("POST", `/api/missions/${m.id}/stop`).catch(() => {});
    await browser?.close();
    await new Promise((r) => server?.close(r));
    await ai.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
    assert.deepStrictEqual(problems, [], "no errors in the page");
  });

  test("an empty Missions page invites you to give it a goal, and an example fills the form", async () => {
    await click("#nav-missions");
    await page.waitForSelector("#missions-root .empty-title", { visible: true });
    assert.match(await text("#missions-root"), /Give me a goal/);
    await page.click("#missions-root .empty-examples .prompt-chip");
    await page.waitForSelector(".new-mission .goal-input", { visible: true });
    assert.match(await page.$eval(".goal-input", (el) => el.value), /Research the three best budget laptops/);
  });

  test("start one: questions, then a plan with what approving covers, then approve and watch it finish", async () => {
    ai.behave.questions = [{ id: "q1", text: "What is the budget?" }];
    ai.behave.plan = { title: "Laptop research", summary: "Look at three laptops and write a short report.", steps: [step("Find the laptops", { role: "research", output: "A list of three" }), step("Write the report", { role: "writing", dependsOn: ["s1"], output: "A report" })] };
    ai.behave.localStream = (ctx) => ({ content: `Result of ${stepOf(ctx)}` });
    await page.$eval(".goal-input", (el) => (el.value = ""));
    await page.type(".goal-input", "Research the three best budget laptops and write me a report");
    await page.click(".new-mission button[type=submit]");
    await page.waitForFunction(() => /^#missions\/m-/.test(location.hash), { timeout: 8000 });
    assert.strictEqual(await page.evaluate(() => document.activeElement?.id), "mission-title", "the keyboard moves to the mission");

    // Its question
    await page.waitForSelector(".questions input", { visible: true, timeout: 10000 });
    assert.match(await text(".questions"), /What is the budget\?/);
    ai.behave.questions = []; // it won't need to ask again
    await page.type(".questions input", "800 euros");
    await click(".questions button[type=submit]");

    // Its plan: steps, the actions it needs approved, its limits
    await page.waitForSelector(".approve-bar", { visible: true, timeout: 10000 });
    assert.match(await text(".plan"), /Find the laptops/);
    assert.match(await text(".plan"), /Nothing outside its own folder/);
    assert.match(await text(".plan"), /Limits/);
    assert.deepStrictEqual(await page.$$eval(".steps .step-title", (els) => els.map((e) => e.textContent.replace(/^\d+\.\s*/, ""))), ["Find the laptops", "Write the report"]);
    assert.strictEqual(await visible(".stop-btn"), true, "Discard is there");
    assert.match(await text(".stop-btn"), /Discard/);

    // The sidebar and Home say it needs you
    await page.waitForFunction(() => { const b = document.getElementById("missions-badge"); return b && !b.hidden && b.textContent === "1"; }, { timeout: 8000 });

    // Edit: take a step out, put another back by editing, then approve
    await click('[data-step="s2"] .icon-btn[title^="Take this step"]');
    await page.waitForFunction(() => document.querySelectorAll(".steps .step-row").length === 1, { timeout: 5000 });
    await click(".approve-bar .btn-primary");
    await page.waitForFunction(() => /Saved in your notes vault/.test(document.querySelector(".mission-detail")?.innerText || ""), { timeout: 20000 });
    assert.match(await text(".report"), /The report/);
    assert.match(await text(".mission-detail"), /Done/);
    assert.strictEqual(await visible("#missions-badge"), false, "nothing needs you now");
    const m = (await missions())[0];
    assert.strictEqual(m.status, "done");
    assert.strictEqual(m.progress.total, 1);

    // The audit log can be opened
    await click(".audit > summary");
    await page.waitForFunction(() => document.querySelector(".audit-table"), { timeout: 5000 });
    assert.match(await text(".audit-table"), /approved/);
    // It can be repeated
    assert.strictEqual(await visible(".repeat"), true);
  });

  test("the list shows it under History, and a click opens it again", async () => {
    await click(".back-link");
    await page.waitForSelector(".mission-list", { visible: true });
    assert.match(await text("#missions-root"), /History/);
    assert.match(await text(".mission-list"), /Laptop research/);
    assert.match(await text(".mission-list"), /Done/);
    await click(".mission-link");
    await page.waitForSelector(".mission-detail", { visible: true });
  });

  test("a question in the middle: the card says what and why, and No lets it carry on", async () => {
    ai.behave.questions = [];
    ai.behave.plan = { title: "Asks mid-way", summary: "x", steps: [step("Run it", { tools: ["run_command"], actions: [{ type: "command", command: "echo listed" }] })] };
    ai.behave.localStream = (ctx) => (ctx.round === 0 ? { tools: [{ name: "run_command", args: { command: "echo not listed" } }] } : { content: "Carried on" });
    const made = await api("POST", "/api/missions", { goal: "Run something for me please" });
    await waitFor(async () => (await api("GET", `/api/missions/${made.id}`)).status === "awaiting_approval", 8000, "the plan");
    await page.evaluate((id) => (location.hash = `#missions/${id}`), made.id);
    await page.waitForSelector(".approve-bar", { visible: true });
    await click(".approve-bar .btn-primary");
    await page.waitForSelector(".card.approval", { visible: true, timeout: 10000 });
    assert.match(await text(".card.approval"), /echo not listed/);
    assert.match(await text(".card.approval"), /isn't in the plan/);
    assert.match(await text(".card.approval .risk"), /Runs commands/);
    // The sidebar badge and Home say it needs you
    assert.strictEqual(await visible("#missions-badge"), true);
    await click("#nav-home");
    await page.waitForFunction(() => !document.getElementById("home-mission-note").hidden, { timeout: 8000 });
    assert.match(await text("#home-mission-note"), /Asks mid-way/);
    await click("#home-mission-note");
    await page.waitForSelector(".card.approval", { visible: true });
    await page.evaluate(() => [...document.querySelectorAll(".card.approval button")].find((b) => /No, carry on/.test(b.textContent)).click());
    await page.waitForFunction(() => /Done/.test(document.querySelector(".mission-detail .status")?.innerText || ""), { timeout: 15000 });
  });

  test("Stop is a big button and stops it at once", async () => {
    ai.behave.plan = { title: "Long one", summary: "x", steps: [step("Sleep", { tools: ["run_command"], actions: [{ type: "command", command: "sleep *" }] })] };
    ai.behave.localStream = (ctx) => (ctx.round === 0 ? { tools: [{ name: "run_command", args: { command: "sleep 30" } }] } : { content: "x" });
    const made = await api("POST", "/api/missions", { goal: "Wait around for a long time" });
    await waitFor(async () => (await api("GET", `/api/missions/${made.id}`)).status === "awaiting_approval", 8000, "the plan");
    await page.evaluate((id) => (location.hash = `#missions/${id}`), made.id);
    await page.waitForSelector(".approve-bar", { visible: true });
    await click(".approve-bar .btn-primary");
    await page.waitForFunction(() => /Stop$/.test(document.querySelector(".stop-btn")?.innerText.trim() || ""), { timeout: 10000 });
    assert.ok((await page.$eval(".stop-btn", (el) => el.getBoundingClientRect().height)) >= 44, "a big target");
    await new Promise((r) => setTimeout(r, 400));
    const t0 = Date.now();
    await click(".stop-btn");
    await page.waitForFunction(() => /Stopped/.test(document.querySelector(".mission-detail .status")?.innerText || ""), { timeout: 4000 });
    assert.ok(Date.now() - t0 < 4000);
    assert.strictEqual((await api("GET", `/api/missions/${made.id}`)).status, "stopped");
  });

  test("a message that sounds like a goal gets an offer under it, and the offer starts a mission", async () => {
    ai.behave.plan = { title: "From the offer", summary: "x", steps: [step("Only")] };
    ai.behave.localStream = () => ({ content: "Sure, I can help with that." });
    await click("#nav-home");
    await page.evaluate(() => document.getElementById("new-chat").click());
    await page.type("#composer-input", "Research the three best budget laptops for video editing, compare their prices and battery life, and write me a short report with sources.");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".mission-offer", { visible: true, timeout: 10000 });
    assert.match(await text(".mission-offer"), /sounds like a mission/);
    await click('.mission-offer [data-offer="go"]');
    await page.waitForFunction(() => /^#missions\/m-/.test(location.hash), { timeout: 8000 });
    await page.waitForSelector(".approve-bar", { visible: true, timeout: 10000 });
    assert.match(await text(".mission-detail"), /From the offer/);
    // Small talk gets no offer
    await click("#nav-home");
    await page.evaluate(() => document.getElementById("new-chat").click());
    await page.type("#composer-input", "How are you today, my friend?");
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 1500));
    assert.strictEqual(await page.$(".mission-offer"), null);
  });

  test("Settings has a Missions section with the limits and the manager", async () => {
    await click("#settings-btn");
    await click("#tab-missions");
    await page.waitForSelector("#pane-missions", { visible: true });
    assert.match(await text("#pane-missions"), /Workspace folder/);
    assert.strictEqual(await page.$eval('[data-setting="missions.limits.maxMinutes"]', (el) => el.value), "60");
    await page.$eval('[data-setting="missions.limits.maxMinutes"]', (el) => {
      el.value = "30";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await waitFor(async () => (await api("GET", "/api/settings")).missions.limits.maxMinutes === 30, 8000, "the saved limit");
    await click("#settings-close");
  });
});
