// End-to-end: the three places (Talk, Missions, Today), their addresses, the top bar, the "+" menu and
// the clean model name. The real page in a real Chrome, a fake local AI.
//   npm run test:e2e
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const { launch, sleep } = require("../../scripts/lib/harness");

const hasChrome = ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", process.env.CHROME_PATH].some((p) => p && fs.existsSync(p));

describe("Talk, Missions and Today", { skip: !hasChrome && "no Chrome found" }, () => {
  let h;
  let page;
  const visible = (sel) => page.$eval(sel, (el) => !el.hidden && getComputedStyle(el).display !== "none");
  const shown = () => page.evaluate(() => document.body.dataset.view);

  before(async () => {
    h = await launch();
    page = h.page;
    await h.addLocalBrain();
    await h.setLook({ width: 1280 });
  });
  after(async () => {
    await h?.close();
  });

  test("the sidebar has three places, and Talk is where you start", async () => {
    assert.deepStrictEqual(await page.$$eval(".nav .nav-item", (items) => items.map((i) => i.id)), ["nav-home", "nav-missions", "today-open"]);
    assert.strictEqual(await shown(), "home");
    assert.strictEqual(await page.$eval("#nav-home", (el) => el.getAttribute("aria-current")), "page");
    assert.strictEqual(await visible("#main"), true);
    assert.strictEqual(await visible("#view-missions"), false);
    assert.strictEqual(await visible("#view-today"), false);
  });

  test("Home: the robot, a greeting and one message box with a voice button, and nothing else competing", async () => {
    assert.strictEqual(await visible("#home-robot"), true, "the robot is on the home screen");
    assert.match(await page.$eval("#greeting", (el) => el.textContent), /Good|Hello/);
    assert.strictEqual(await visible("#voice-open"), true, "a voice button in the message box");
    const ideas = await page.$$eval("#hero-prompts .prompt-chip", (c) => c.length);
    assert.ok(ideas > 0 && ideas <= 3, `at most three ideas, not ${ideas}`);
    assert.strictEqual(await page.$("#workspace-bar"), null, "the connector shortcuts moved away");
    assert.strictEqual(await page.$("#voice-hero-card"), null, "the voice card is gone");
    // No emoji as icons on the start screen
    const emoji = await page.$$eval("#hero-prompts .prompt-chip", (chips) => chips.map((c) => c.textContent).filter((t) => /\p{Extended_Pictographic}/u.test(t)));
    assert.deepStrictEqual(emoji, []);
  });

  test("the sidebar's places switch what shows, and the highlight follows", async () => {
    await page.click("#nav-missions");
    assert.strictEqual(await shown(), "missions");
    assert.strictEqual(await visible("#view-missions"), true);
    assert.strictEqual(await visible("#main"), false);
    assert.strictEqual(await page.$eval("#nav-missions", (el) => el.getAttribute("aria-current")), "page");
    assert.strictEqual(await page.$eval("#nav-home", (el) => el.getAttribute("aria-current")), null);
    assert.strictEqual(await page.evaluate(() => location.hash), "#missions");
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), "missions-title", "the keyboard lands on the heading");

    await page.click("#today-open");
    assert.strictEqual(await shown(), "today");
    assert.strictEqual(await visible("#view-today"), true);
    assert.strictEqual(await page.evaluate(() => location.hash), "#today");

    await page.click("#nav-home");
    assert.strictEqual(await shown(), "home");
    assert.strictEqual(await page.evaluate(() => location.hash), "");
  });

  test("the addresses still work: #today (the tray), #missions, #missions/<id>, #chat/<id>", async () => {
    await page.evaluate(() => (location.hash = "#today"));
    await page.waitForFunction(() => document.body.dataset.view === "today");
    await page.evaluate(() => (location.hash = "#missions"));
    await page.waitForFunction(() => document.body.dataset.view === "missions");
    const seen = await page.evaluate(
      () =>
        new Promise((resolve) => {
          document.addEventListener("friends:view", (e) => e.detail.detail && resolve(e.detail), { once: true });
          location.hash = "#missions/abc-123";
        })
    );
    assert.deepStrictEqual(seen, { name: "missions", detail: "abc-123" });

    const chats = await h.api("GET", "/api/chats");
    const id = chats[0].id;
    await page.evaluate((chatId) => (location.hash = `#chat/${chatId}`), id);
    await page.waitForFunction(() => document.body.dataset.view === "home" && document.getElementById("main").classList.contains("has-chat"));
    assert.strictEqual(await page.$eval("#main", (el) => el.classList.contains("has-chat")), true);
    await page.evaluate(() => document.getElementById("new-chat").click());
  });

  test("Alt+1, Alt+2 and Alt+3 go to Talk, Missions and Today", async () => {
    await page.keyboard.down("Alt");
    await page.keyboard.press("Digit2");
    await page.keyboard.up("Alt");
    assert.strictEqual(await shown(), "missions");
    await page.keyboard.down("Alt");
    await page.keyboard.press("Digit3");
    await page.keyboard.up("Alt");
    assert.strictEqual(await shown(), "today");
    await page.keyboard.down("Alt");
    await page.keyboard.press("Digit1");
    await page.keyboard.up("Alt");
    assert.strictEqual(await shown(), "home");
  });

  test("Missions: an empty place invites you to give it a goal", async () => {
    await page.click("#nav-missions");
    assert.match(await page.$eval("#missions-root", (el) => el.textContent), /Give me a goal/);
    await page.click("#nav-home");
  });

  test("Today: one box adds a task, a reminder or an event, and the day shows them", async () => {
    await page.click("#today-open");
    await page.waitForSelector("#quick-text", { visible: true });
    await page.type("#quick-text", "Call the bank");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => /Call the bank/.test(document.getElementById("view-today").innerText), { timeout: 5000 });
    const tasks = await h.api("GET", "/api/life/tasks");
    assert.ok(tasks.some((t) => t.title === "Call the bank"));

    await page.click('.segmented-btn[data-kind="reminder"]');
    assert.strictEqual(await page.$eval("#quick-when", (el) => el.type), "datetime-local");
    await page.click('.segmented-btn[data-kind="event"]');
    assert.strictEqual(await page.$eval("#quick-when", (el) => el.type), "datetime-local");
    await page.click('.segmented-btn[data-kind="task"]');
    assert.strictEqual(await page.$eval("#quick-when", (el) => el.type), "date");
    // Everything else is there when you want it
    assert.strictEqual(await page.$eval("#today-more", (el) => el.open), false);
    await page.click("#today-more > summary");
    await page.click('[data-life-tab="calendar"]');
    assert.strictEqual(await visible("#calendar-add"), true);
    await page.click("#nav-home");
  });

  test("the top bar has its own background: messages never run under the character switch", async () => {
    await h.setLook({ width: 1280 });
    h.behave.text = Array.from({ length: 60 }, (_, i) => `Line ${i + 1}: something long enough to fill the screen with text.`).join("\n\n");
    await page.type("#composer-input", "Write a lot");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector(".msg.model .msg-body")?.innerText.length > 400, { timeout: 20000 });
    await sleep(1200);
    await page.evaluate(() => document.getElementById("messages").scrollTo(0, 400));
    await sleep(200);
    const boxes = await page.evaluate(() => {
      const bar = document.querySelector("#main > .topbar").getBoundingClientRect();
      const log = document.getElementById("messages").getBoundingClientRect();
      const switchBox = document.getElementById("character-switch").getBoundingClientRect();
      return { barBottom: bar.bottom, logTop: log.top, switchBottom: switchBox.bottom };
    });
    assert.ok(boxes.logTop >= boxes.barBottom - 1, `the conversation starts below the top bar (${boxes.logTop} vs ${boxes.barBottom})`);
    assert.ok(boxes.switchBottom <= boxes.barBottom, "the character switch is inside the bar");
    h.behave.text = h.REPLY;
  });

  test("the \"+\" menu has the file and the connector shortcuts, and the model shows one clean name", async () => {
    await h.setLook({ width: 1280 });
    assert.strictEqual(await visible("#plus-menu"), false);
    await page.click("#plus-btn");
    assert.strictEqual(await visible("#plus-menu"), true);
    const items = await page.$$eval("#plus-menu .plus-item", (els) => els.map((e) => e.textContent.trim()));
    assert.deepStrictEqual(items, ["Attach a file", "Calendar", "Gmail", "Drive", "News", "GitHub"]);
    await page.keyboard.press("Escape");
    assert.strictEqual(await visible("#plus-menu"), false);

    const picker = await page.$eval("#model-picker", (el) => el.textContent.replace(/\s+/g, " ").trim());
    assert.ok(!/:latest/.test(picker), picker);
    assert.ok(!/llama3\.2\s+llama3\.2/.test(picker), `one name, not two: "${picker}"`);
  });

  test("which AI answers is a small, quiet line", async () => {
    const box = await page.$eval("#ws-status-indicator", (el) => ({ size: parseFloat(getComputedStyle(el).fontSize), bg: getComputedStyle(el).backgroundColor }));
    assert.ok(box.size <= 13, `small (${box.size}px)`);
    assert.ok(/rgba\(0, 0, 0, 0\)|transparent/.test(box.bg), "no pill around it");
  });

  test("Settings is a full view: it covers the page, with no chat showing through", async () => {
    await page.click("#settings-btn");
    await sleep(200);
    const covers = await page.evaluate(() => {
      const modal = document.querySelector("#settings-modal .modal").getBoundingClientRect();
      const bg = getComputedStyle(document.getElementById("settings-modal")).backgroundColor;
      return { w: modal.width, h: modal.height, vw: innerWidth, vh: innerHeight, bg };
    });
    assert.strictEqual(covers.w, covers.vw);
    assert.strictEqual(covers.h, covers.vh);
    assert.ok(!/rgba\(.*,\s*0?\.\d+\)$/.test(covers.bg), `opaque background (${covers.bg})`);
    // Settings has the groups: companion, AI, extras, data (Telegram, notes and apps are in Extras)
    const groups = await page.$$eval("#settings-tabs .nav-group", (els) => els.map((e) => e.textContent.trim()));
    assert.deepStrictEqual(groups, ["You and your companion", "AI", "Extras", "Your data"]);
    await page.click("#settings-close");
  });
});
