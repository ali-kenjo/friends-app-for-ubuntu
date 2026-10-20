// Settings → AI & privacy in a real browser: its four sections, adding AIs (a pasted address, a service with a key, several
// models at once), editing one's own settings, the list's actions, Privacy (what could leave, what is hidden, clearing),
// This computer, and saving only what changed. A fake cloud service and a fake keyless server play the AIs.
//   npm run test:e2e
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const fakeOpenai = require("../helpers/fake-openai");

const CHROME = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => p && fs.existsSync(p));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-e2e-ai-"));
Object.assign(process.env, { FRIENDS_DATA_DIR: path.join(tempDir, "data"), KEYRING_BACKEND: "file", LOG_LEVEL: "error", FRIENDS_FAKE_GPU: JSON.stringify({ totalMb: 6144, usedMb: 300, name: "Fake GTX" }), FRIENDS_LOCAL_SERVERS: "[]" });
delete process.env.GEMINI_API_KEY;

describe("AI & privacy in the page", { skip: !CHROME && "no Chrome found" }, () => {
  const cloud = fakeOpenai.create({ keys: ["good-key"], models: ["fast-model", "smart-model"] });
  const house = fakeOpenai.create({ keys: [], models: ["house-model"] });
  let browser, page, server, base, settings;
  const problems = [];
  const api = (method, url, body) => fetch(base + url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
  const brainsNow = async () => (await api("GET", "/api/brains")).brains;
  const click = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);
  const text = (sel) => page.$eval(sel, (el) => el.innerText);
  const section = async (name) => {
    await click(`.subtab[data-subtab="${name}"]`);
    await page.waitForSelector(`#subpane-${name}`, { visible: true });
  };
  const open = async (name = "ais") => {
    await page.evaluate(() => {
      document.getElementById("settings-btn").click();
      document.querySelector('.modal-nav .tab[data-tab="ai-control"]').click();
    });
    await section(name);
  };
  // Waits until the helper has saved what the page changed (the page saves a moment after showing it)
  const savedAs = async (predicate, ms = 8000) => {
    const until = Date.now() + ms;
    for (;;) {
      const s = await api("GET", "/api/settings");
      if (predicate(s)) return s;
      if (Date.now() > until) throw new Error(`Not saved in time: ${predicate}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  before(async () => {
    await cloud.start();
    await house.start();
    settings = require("../../server/settings");
    const s = settings.get();
    settings.set({ ...s, onboarding: { done: true, missions: true }, robot: { ...s.robot, chatDock: false } });
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
    await cloud.stop();
    await house.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
    assert.deepStrictEqual(problems, [], "no errors in the page");
  });

  test("four sections, one showing at a time, moved between with the arrow keys; the search opens the right one", async () => {
    await open("ais");
    assert.deepStrictEqual(await page.$$eval(".subtab", (els) => els.map((e) => e.textContent.trim())), ["Your AIs", "Answers", "Privacy", "This computer"]);
    assert.deepStrictEqual(await page.$$eval(".subpane", (els) => els.map((e) => e.offsetParent !== null)), [true, false, false, false]);
    await page.focus("#subtab-ais");
    await page.keyboard.press("ArrowRight");
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), "subtab-answers");
    assert.strictEqual(await page.$eval("#subtab-answers", (el) => el.getAttribute("aria-selected")), "true");
    assert.ok(await page.$eval("#routing-mode", (el) => el.offsetParent !== null));
    await page.keyboard.press("End");
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), "subtab-device");
    await page.keyboard.press("Home");
    // the search finds Private mode in a section that isn't showing, and opens it
    await page.focus("#settings-search");
    await page.keyboard.type("private mode");
    await page.waitForSelector(".settings-result");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.getElementById("subtab-privacy").getAttribute("aria-selected") === "true");
    assert.ok(await page.$eval("#private-mode-toggle", (el) => el.offsetParent !== null));
  });

  test("an address pasted in the box is recognised, a server with no key is connected at once, and its models are listed", async () => {
    await open("ais");
    await page.type("#smart-input", house.url());
    await click("#smart-go");
    await page.waitForSelector("#ai-form:not([hidden])");
    assert.match(await text("#ai-form-head"), /Connect Another server/);
    await page.waitForFunction(() => document.querySelectorAll("#ai-model-list input").length >= 1, { timeout: 8000 });
    assert.strictEqual(await page.$eval("#ai-model-list input", (el) => el.value), "house-model");
    assert.strictEqual(await page.$eval("#ai-model-list input", (el) => el.checked), true, "the first model is ticked");
    assert.strictEqual(await page.$eval("#ai-form [name=baseUrl]", (el) => el.value), house.url().replace(/\/v1$/, ""));
    await page.type("#ai-form [name=name]", "House server");
    await click("#ai-form-save");
    await page.waitForFunction(() => document.getElementById("ai-add").hidden, { timeout: 8000 });
    const [added] = await brainsNow();
    assert.strictEqual(added.name, "House server");
    assert.strictEqual(added.kind, "local");
    assert.strictEqual(added.model, "house-model");
    assert.match(await text("#brain-list"), /On this computer/);
    assert.match(await text("#brain-list"), /Not used today/);
  });

  test("a service with a key: several models ticked and added at once; the Default badge is a word, not code", async () => {
    await click("#brain-add");
    await page.waitForSelector("#ai-pick:not([hidden])");
    await page.type("#ai-search", "any other");
    await page.waitForFunction(() => document.querySelectorAll("#service-grid-cloud .service-tile").length === 1);
    await click('#service-grid-cloud .service-tile[data-id="custom"]');
    await page.waitForSelector("#ai-form:not([hidden])");
    await page.$eval("#ai-form [name=baseUrl]", (el, v) => (el.value = v), cloud.url());
    await page.type("#ai-form [name=key]", "good-key");
    await click("#ai-connect-go");
    await page.waitForFunction(() => document.querySelectorAll("#ai-model-list input").length === 2, { timeout: 8000 });
    assert.deepStrictEqual(await page.$$eval("#ai-model-list .model-name", (els) => els.map((e) => e.textContent)), ["fast-model", "smart-model"], "embeddings, pictures and speech are not offered");
    await page.evaluate(() => document.querySelectorAll("#ai-model-list input").forEach((i) => !i.checked && i.click()));
    assert.match(await text("#ai-form-save"), /Add 2 models/);
    assert.strictEqual(await page.$eval("#field-name", (el) => el.hidden), true, "with several models each is named after itself");
    await click("#ai-form-save");
    await page.waitForSelector("#ai-add-done", { visible: true, timeout: 8000 });
    assert.match(await text("#ai-add-result"), /2 AIs added/);
    await click("#ai-add-done");
    const names = (await brainsNow()).map((b) => b.name);
    assert.deepStrictEqual(names, ["House server", "Any other service", "Any other service"]);
    const badge = await page.$eval("#brain-list .brain.is-default .badge", (el) => el.textContent);
    assert.strictEqual(badge, "Default");
    assert.doesNotMatch(await text("#brain-list"), /\$\{/);
    assert.strictEqual(await page.$$eval("#brain-list .tag.kind-cloud", (els) => els.length), 2);
  });

  test("a wrong key is said in plain words and nothing is added", async () => {
    await click("#brain-add");
    await click('#service-grid-cloud .service-tile[data-id="custom"]');
    await page.waitForSelector("#ai-form:not([hidden])");
    await page.$eval("#ai-form [name=baseUrl]", (el, v) => (el.value = v), cloud.url());
    await page.type("#ai-form [name=key]", "wrong-key");
    await click("#ai-connect-go");
    await page.waitForFunction(() => !document.getElementById("ai-form-error").hidden, { timeout: 8000 });
    assert.match(await text("#ai-form-error"), /didn't accept the API key|wants an API key/);
    assert.strictEqual((await brainsNow()).length, 3);
    await click("#ai-add-back");
  });

  test("editing one AI: its own settings are saved and shown again", async () => {
    const target = (await brainsNow()).find((b) => b.model === "smart-model");
    await page.evaluate((id) => document.querySelector(`.brain[data-id="${id}"] [data-action="edit"]`).click(), target.id);
    await page.waitForSelector("#ai-form:not([hidden])");
    await page.waitForSelector("#ai-model-list input:checked");
    await click("#ai-own-settings > summary");
    await page.type("#ai-form [name=temperature]", "0.4");
    await page.type("#ai-form [name=dailyLimit]", "25");
    await page.select("#ai-form [name=tools]", "off");
    await page.type("#ai-form [name=note]", "for hard questions");
    await page.$eval("#ai-form [name=name]", (el) => (el.value = ""));
    await page.type("#ai-form [name=name]", "Smart one");
    await click("#ai-form-save");
    await page.waitForFunction(() => document.getElementById("ai-add").hidden, { timeout: 8000 }).catch(async (err) => {
      throw new Error(`${err.message}; error: ${await text("#ai-form-error")}; save: ${await text("#ai-form-save")} disabled=${await page.$eval("#ai-form-save", (e) => e.disabled)}`);
    });
    const saved = (await brainsNow()).find((b) => b.id === target.id);
    assert.strictEqual(saved.name, "Smart one");
    assert.deepStrictEqual(saved.params, { temperature: 0.4, dailyLimit: 25, tools: "off" });
    assert.strictEqual(saved.note, "for hard questions");
    assert.match(await text("#brain-list"), /Not used today · limit: 25 a day/);
    assert.match(await text("#brain-list"), /for hard questions/);
    // and shown again when opened
    await page.evaluate((id) => document.querySelector(`.brain[data-id="${id}"] [data-action="edit"]`).click(), target.id);
    await page.waitForSelector("#ai-form:not([hidden])");
    assert.strictEqual(await page.$eval("#ai-form [name=temperature]", (el) => el.value), "0.4");
    assert.strictEqual(await page.$eval("#ai-form [name=tools]", (el) => el.value), "off");
    await click("#ai-form-cancel");
  });

  test("the list: move, make default, switch off, test, delete after asking", async () => {
    const ids = async () => (await brainsNow()).map((b) => b.model);
    assert.deepStrictEqual(await ids(), ["house-model", "fast-model", "smart-model"]);
    await page.evaluate(() => document.querySelectorAll('.brain [data-action="down"]')[0].click());
    await page.waitForFunction(() => document.querySelector(".brain .brain-meta")?.textContent.includes("fast-model"));
    assert.deepStrictEqual(await ids(), ["fast-model", "house-model", "smart-model"]);
    assert.strictEqual(await page.evaluate(() => document.activeElement.dataset.action), "down", "the keyboard stays on the button it used");
    const fast = (await brainsNow())[0];
    await page.evaluate((id) => document.querySelector(`.brain[data-id="${id}"] [data-action="default"]`).click(), fast.id);
    await page.waitForFunction((id) => document.querySelector(`.brain[data-id="${id}"]`)?.classList.contains("is-default"), {}, fast.id);
    const smart = (await brainsNow()).find((b) => b.model === "smart-model");
    await page.evaluate((id) => document.querySelector(`.brain[data-id="${id}"] [data-action="toggle"]`).click(), smart.id);
    await page.waitForFunction((id) => document.querySelector(`.brain[data-id="${id}"]`)?.classList.contains("is-off"), {}, smart.id);
    assert.strictEqual((await brainsNow()).find((b) => b.id === smart.id).enabled, false);
    // a test counts as a call for the day, and the line says so
    await page.evaluate((id) => document.querySelector(`.brain[data-id="${id}"] [data-action="test"]`).click(), fast.id);
    await page.waitForFunction((id) => /verified/.test(document.querySelector(`.brain[data-id="${id}"] .brain-meta`)?.textContent || ""), { timeout: 8000 }, fast.id);
    // delete asks first
    await page.evaluate((id) => document.querySelector(`.brain[data-id="${id}"] [data-action="delete"]`).click(), smart.id);
    await page.waitForSelector(`.brain.confirm [data-action="confirm-delete"]`);
    await click('.brain.confirm [data-action="cancel-delete"]');
    assert.strictEqual((await brainsNow()).length, 3, "cancelled: still there");
    await page.evaluate((id) => document.querySelector(`.brain[data-id="${id}"] [data-action="delete"]`).click(), smart.id);
    await click('.brain.confirm [data-action="confirm-delete"]');
    await page.waitForFunction(() => document.querySelectorAll("#brain-list .brain").length === 2);
  });

  test("Answers: limits are saved as numbers, the AI for small jobs lists your AIs, and fallback is a choice", async () => {
    await section("answers");
    await page.select('[data-setting="aiControl.maxTokens"]', "1024");
    await page.select('[data-setting="aiControl.timeoutSeconds"]', "60");
    await page.select('[data-setting="routing.fallback"]', "same-kind");
    const options = await page.$$eval("#task-brain option", (els) => els.map((e) => e.textContent));
    assert.ok(options.includes("Chosen by the mode") && options.some((o) => /house-model/.test(o)) && options.some((o) => /fast-model/.test(o)), options.join());
    assert.ok(!options.some((o) => /smart-model/.test(o)), "an AI that is gone isn't offered");
    const house = (await brainsNow()).find((b) => b.model === "house-model");
    await page.select("#task-brain", String(house.id));
    await savedAs((s) => s.aiControl.maxTokens === 1024 && s.aiControl.timeoutSeconds === 60 && s.routing.fallback === "same-kind");
    await savedAs((s) => s.routing.taskBrain === house.id);
    const s = await api("GET", "/api/settings");
    assert.strictEqual(typeof s.aiControl.maxTokens, "number");
  });

  test("saving one switch doesn't undo what the helper changed meanwhile", async () => {
    // the helper changes the specialists (as Settings → Specialists does) while this page holds an older copy
    settings.set({ ...settings.get(), specialists: { ...settings.get().specialists, roles: [{ id: "coding", model: "coder:latest" }] } });
    await section("privacy");
    await click('[data-setting="privacy.redact.emails"]');
    await savedAs((s) => s.privacy.redact.emails === true);
    const s = await api("GET", "/api/settings");
    assert.strictEqual(s.specialists.roles[0]?.model, "coder:latest", "the specialists are as the helper has them");
  });

  test("Privacy: what could leave, hiding, Private mode, and clearing asks first", async () => {
    await section("privacy");
    await page.waitForFunction(() => /Any other service/.test(document.getElementById("leaving-list").innerText));
    const leaving = await text("#leaving-list");
    assert.match(leaving, /\(a cloud AI\)/);
    assert.match(leaving, /newer Friends/);
    assert.strictEqual(await page.$eval('[data-setting="privacy.redact.keys"]', (el) => el.checked), true);
    assert.strictEqual(await page.$eval('[data-setting="privacy.redact.emails"]', (el) => el.checked), true);
    // Private mode: nothing is listed, and the cloud AIs are greyed in the list
    await click("#private-mode-toggle");
    await page.waitForFunction(() => /nothing is sent to the internet/i.test(document.getElementById("leaving-note").textContent), { timeout: 8000 });
    assert.strictEqual(await page.$$eval("#leaving-list li:not(.none)", (els) => els.length), 0);
    await click("#private-mode-toggle");
    await savedAs((s) => s.privacy.localOnly === false);
    // clearing memories asks, and the count follows
    settings.patch({ memory: { items: [{ id: "1", text: "likes tea" }] } });
    await click('[data-clear="memories"]');
    await page.waitForSelector(".confirm-modal [data-answer=no]");
    await click(".confirm-modal [data-answer=no]");
    assert.strictEqual(settings.get().memory.items.length, 1, "No: nothing is deleted");
    await click('[data-clear="memories"]');
    await page.waitForSelector(".confirm-modal [data-answer=yes]");
    await click(".confirm-modal [data-answer=yes]");
    await page.waitForFunction(() => /Memories deleted/.test(document.getElementById("clear-feedback").textContent), { timeout: 8000 });
    assert.strictEqual(settings.get().memory.items.length, 0);
    await page.select('[data-setting="privacy.keepChatsDays"]', "30");
    await savedAs((s) => s.privacy.keepChatsDays === 30);
  });

  test("every control in the pane shows what is saved, and saves what you change (and puts it back)", async () => {
    await open("ais");
    const controls = await page.$$eval("#pane-ai-control [data-setting]", (els) => [...new Set(els.map((e) => e.dataset.setting))]);
    assert.ok(controls.length >= 30, `${controls.length} controls`);
    const at = (s, path) => path.split(".").reduce((o, k) => o?.[k], s);
    for (const path of controls) {
      const sel = `#pane-ai-control [data-setting="${path}"]`;
      // its section opens first
      await page.evaluate((q) => {
        const el = document.querySelector(q);
        const name = el.closest(".subpane")?.dataset.subpane;
        if (name) document.querySelector(`.subtab[data-subtab="${name}"]`).click();
      }, sel);
      const el = await page.$(sel);
      const info = await el.evaluate((e) => ({ type: e.type, tag: e.tagName, number: e.dataset.type === "number" || e.type === "range", options: e.tagName === "SELECT" ? [...e.options].map((o) => o.value) : [] }));
      const saved = at(await api("GET", "/api/settings"), path);
      // what the control shows is what is saved
      const shown = await el.evaluate((e) => (e.type === "checkbox" ? e.checked : e.value));
      assert.strictEqual(info.type === "checkbox" ? shown : String(shown), info.type === "checkbox" ? Boolean(saved) : String(saved), `${path} shows ${shown} but ${saved} is saved`);
      // change it
      if (info.type === "checkbox") {
        await el.evaluate((e) => e.click());
        await savedAs((x) => Boolean(at(x, path)) === !saved);
        await el.evaluate((e) => e.click());
        await savedAs((x) => Boolean(at(x, path)) === Boolean(saved));
      } else if (info.tag === "SELECT") {
        const other = info.options.find((o) => o !== String(saved));
        assert.ok(other !== undefined, `${path} has something else to choose`);
        await page.select(sel, other);
        await savedAs((x) => String(at(x, path)) === other);
        assert.strictEqual(typeof at(await api("GET", "/api/settings"), path), info.number ? "number" : "string", `${path} is saved as ${info.number ? "a number" : "text"}`);
        await page.select(sel, String(saved));
        await savedAs((x) => String(at(x, path)) === String(saved));
      } else if (info.type === "range") {
        const next = String(Number(saved) === 5 ? 10 : 5);
        await el.evaluate((e, v) => {
          e.value = v;
          e.dispatchEvent(new Event("input", { bubbles: true }));
        }, next);
        await savedAs((x) => String(at(x, path)) === next);
        await el.evaluate((e, v) => {
          e.value = v;
          e.dispatchEvent(new Event("input", { bubbles: true }));
        }, String(saved));
        await savedAs((x) => String(at(x, path)) === String(saved));
      } else assert.fail(`${path}: a control the test doesn't know (${info.type})`);
    }
  });

  test("This computer: what was found, a size that suits it, and the profile changes what a new local AI starts with", async () => {
    await section("device");
    await page.waitForFunction(() => document.querySelectorAll("#device-facts dt").length > 4, { timeout: 8000 });
    const facts = await text("#device-facts");
    assert.match(facts, /Fake GTX/);
    assert.match(facts, /Your NVIDIA graphics card \(CUDA\)/);
    assert.match(await text("#device-fit"), /Models up to about \d+ billion parameters run well here/);
    assert.match(await text("#device-picks"), /qwen3\.5:4b/);
    await page.select("#device-profile", "light");
    await savedAs((s) => s.device.profile === "light");
    await page.waitForFunction(() => /4,096 tokens, 5 minutes, 1 mission/.test(document.getElementById("device-profile-desc").textContent), { timeout: 8000 });
    await page.select("#device-profile", "auto");
    assert.match(await text("#browser-facts"), /Window/);
    await savedAs((s) => s.device.profile === "auto");
  });
});
