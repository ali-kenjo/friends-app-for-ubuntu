// Settings → Data & backups → Updates in the real page: Check now finds a newer release in a fake GitHub, says how to
// update and shows what's new; a failed check says so; Private mode switches the button off.
//   npm run test:e2e
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const CHROME = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => p && fs.existsSync(p));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-e2e-updates-"));
Object.assign(process.env, { FRIENDS_DATA_DIR: path.join(tempDir, "data"), KEYRING_BACKEND: "file", LOG_LEVEL: "error" });
delete process.env.APPIMAGE;

describe("Updates in Settings", { skip: !CHROME && "no Chrome found" }, () => {
  let browser, page, server, github;
  const problems = [];
  const behave = { status: 200, release: null };
  const text = (sel) => page.$eval(sel, (el) => el.innerText);

  before(async () => {
    github = http.createServer((req, res) => {
      res.writeHead(behave.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(behave.release || {}));
    });
    await new Promise((r) => github.listen(0, "127.0.0.1", r));
    process.env.FRIENDS_UPDATES_API = `http://127.0.0.1:${github.address().port}`;
    const settings = require("../../server/settings");
    const s = settings.get();
    settings.set({ ...s, onboarding: { done: true, missions: true }, robot: { ...s.robot, chatDock: false } });
    server = require("../../server/server").start(0, "127.0.0.1");
    await new Promise((r) => (server.listening ? r() : server.on("listening", r)));
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
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "networkidle2" });
  });

  after(async () => {
    await browser?.close();
    await new Promise((r) => server?.close(r));
    await new Promise((r) => github?.close(r));
    fs.rmSync(tempDir, { recursive: true, force: true });
    assert.deepStrictEqual(problems, [], "no errors in the page");
  });

  test("Check now finds a newer release, says how to update and shows what's new", async () => {
    behave.release = { tag_name: "v99.0.0", html_url: "https://github.com/ali-kenjo/chatting-app-with-ai-for-linux/releases/tag/v99.0.0", body: "## What's new\n- Missions", assets: [] };
    await page.click("#settings-btn");
    await page.click("#tab-data");
    await page.waitForFunction(() => /Not checked for a newer one yet/.test(document.getElementById("update-line")?.innerText || ""), { timeout: 8000 });
    await page.click("#update-check");
    await page.waitForFunction(() => /99\.0\.0 is available/.test(document.getElementById("update-line")?.innerText || ""), { timeout: 8000 });
    assert.match(await text("#update-how"), /npm run update/, "a copy run from source updates with npm run update");
    assert.strictEqual(await page.$eval("#update-notes", (el) => el.hidden), false);
    assert.match(await page.$eval("#update-notes-body", (el) => el.textContent), /Missions/);
    assert.strictEqual(await page.$eval("#update-page", (el) => el.hidden), false);
    assert.match(await page.$eval("#update-page", (el) => el.href), /releases\/tag\/v99\.0\.0$/);
    assert.strictEqual(await page.$eval("#update-download", (el) => el.hidden), true, "a source copy has no file to download");
  });

  test("a failed check says what went wrong", async () => {
    behave.status = 403;
    await page.click("#update-check");
    await page.waitForFunction(() => /limiting requests/.test(document.getElementById("update-problem")?.innerText || ""), { timeout: 8000 });
    behave.status = 200;
  });

  test("Private mode switches Check now off and says why", async () => {
    const settings = require("../../server/settings");
    settings.set({ ...settings.get(), privacy: { localOnly: true } });
    await page.click("#settings-close");
    await page.click("#settings-btn");
    await page.click("#tab-data");
    await page.waitForFunction(() => /Private mode is on/.test(document.getElementById("update-line")?.innerText || ""), { timeout: 8000 });
    assert.strictEqual(await page.$eval("#update-check", (el) => el.disabled), true);
    settings.set({ ...settings.get(), privacy: { localOnly: false } });
  });
});
