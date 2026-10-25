// End-to-end: the shared whiteboard in the real page. You draw, the robot draws (as the AI's own tools do, on the
// helper), and each shows up for the other: on the whiteboard page, in the panel beside the chat and in voice mode.
//   npm run test:e2e
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const { launch, sleep } = require("../../scripts/lib/harness");

const hasChrome = ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", process.env.CHROME_PATH].some((p) => p && fs.existsSync(p));

describe("The shared whiteboard", { skip: !hasChrome && "no Chrome found" }, () => {
  let h;
  let page;
  let whiteboard;
  let id;
  const problems = [];
  const visible = (sel) => page.$eval(sel, (el) => !el.closest("[hidden]") && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0).catch(() => false);
  const board = () => h.api("GET", "/api/whiteboards/current");
  const items = async () => (await board()).pages.flatMap((p) => p.items);
  const robotDraws = (ops) => whiteboard.apply(id, ops, { actor: "ai", batch: `e2e-${Math.random().toString(36).slice(2, 7)}` });
  const until = async (check, what, ms = 8000) => {
    const stop = Date.now() + ms;
    while (Date.now() < stop) {
      if (await check()) return;
      await sleep(120);
    }
    assert.fail(`Never happened: ${what}`);
  };
  const live = () => page.evaluate(() => [...document.querySelectorAll("[aria-live]")].map((e) => e.textContent).join(" | "));
  const fingerprint = (sel) => page.$eval(sel, (c) => c.toDataURL().length + ":" + c.toDataURL().slice(-80));

  before(async () => {
    h = await launch();
    page = h.page;
    page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && problems.push(`console: ${m.text()}`));
    await h.addLocalBrain();
    await h.setLook({ width: 1440, height: 900 });
    whiteboard = require("../../server/whiteboard");
    id = whiteboard.current().id;
  });

  after(async () => {
    await h?.close();
  });

  test("the Robot page opens with its tools, the robot's window and a board to draw on", async () => {
    await page.evaluate(() => (location.hash = "#whiteboard"));
    await until(() => visible("#wb-workspace .wb-stage"), "the board is shown");
    assert.ok((await page.$$("[data-wb-tool]")).length >= 8, "the tools are there");
    assert.ok((await page.$$("#wb-workspace .wb-stage canvas")).length >= 2, "paper and drawing layers");
    assert.strictEqual(await page.evaluate(() => document.body.dataset.view), "whiteboard");
    assert.strictEqual(await page.$eval("#nav-whiteboard", (n) => n.textContent.trim()), "Robot", "it is the Robot place in the sidebar");
    assert.deepStrictEqual(await page.$$eval(".rw-rail-btn[aria-label]", (b) => b.map((x) => x.getAttribute("aria-label")).slice(0, 5)), ["Boards", "Outline", "Sources", "Shapes", "Layouts"]);
    await until(() => visible(".rw-robot-win"), "the robot's window floats over the board");
    assert.strictEqual(await visible(".rw-inspector"), true, "the options are on the right");
    // The board takes the look of the app: dark app, dark paper
    assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  });

  test("what you draw with the pen is kept as yours", async () => {
    await page.click('[data-wb-tool="pen"]');
    const box = await (await page.$("#wb-workspace .wb-stage")).boundingBox();
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 200 + i * 20, box.y + 200 + Math.sin(i) * 30);
    await page.mouse.up();
    await until(async () => (await items()).some((i) => i.type === "stroke"), "the stroke reaches the helper");
    const stroke = (await items()).find((i) => i.type === "stroke");
    assert.strictEqual(stroke.author, "user");
    assert.ok(stroke.points.length >= 5);
  });

  test("the robot's drawing appears on your page while you are there, and is marked as the robot's", async () => {
    const before = await fingerprint("#wb-workspace .wb-stage canvas:nth-of-type(2)").catch(() => "");
    robotDraws([
      { op: "add", item: { type: "sticky", text: "Hello from the robot", x: 900, y: 120, color: "pink" } },
      { op: "add", item: { type: "text", text: '<img src=x onerror="window.__xss=1">', x: 900, y: 400 } },
    ]);
    await until(async () => (await fingerprint("#wb-workspace .wb-stage canvas:nth-of-type(2)").catch(() => "")) !== before, "the page paints what the robot drew");
    const mine = (await items()).find((i) => i.text === "Hello from the robot");
    assert.strictEqual(mine.author, "ai");
    assert.strictEqual(await page.evaluate(() => window.__xss), undefined, "words on the board are only drawn, never run");
    assert.strictEqual(await page.$("#wb-workspace img[src='x']"), null);
  });

  test("the robot always knows what is on the board and what you did", async () => {
    const text = (await h.api("GET", `/api/whiteboards/${id}/describe`)).text;
    assert.match(text, /Hello from the robot/);
    assert.match(text, /pen stroke|drawing|stroke|ink/i, "your drawing is in it");
    assert.match(text, /by (the user|you|\w+)/);
  });

  test("beside the chat: the conversation moves over, the robot's changes are told, and you can take them back", async () => {
    await page.evaluate(() => document.getElementById("nav-home").click());
    await sleep(500);
    await page.evaluate(() => document.getElementById("home-wb-toggle-btn").click());
    await until(() => visible(".wb-win-chat"), "the board opens");
    assert.strictEqual(await page.$eval("#main", (m) => m.dataset.wbDock), "end");
    assert.ok(await page.$eval("#main", (m) => parseFloat(getComputedStyle(m).paddingInlineEnd) > 300), "room is made for it");
    robotDraws([{ op: "add", item: { type: "checklist", title: "Plan", items: ["One", "Two"], x: 100, y: 600 } }]);
    await until(async () => /The robot changed the whiteboard/.test(await live()), "the change is read out");
    assert.ok((await items()).some((i) => i.type === "checklist"));
    await page.click('.wb-win-chat [aria-label="Take back the robot\'s last drawing"]');
    await until(async () => !(await items()).some((i) => i.type === "checklist"), "its last drawing is taken back");
    assert.ok((await items()).some((i) => i.text === "Hello from the robot"), "only the last batch went");
    assert.ok((await items()).some((i) => i.type === "stroke"), "yours stays");
    await page.evaluate(() => document.getElementById("home-wb-toggle-btn").click());
    await until(async () => !(await visible(".wb-win-chat")), "the board closes");
    assert.strictEqual(await page.$eval("#main", (m) => m.dataset.wbDock), undefined);
  });

  test("beside the chat the board goes where you put it: dragged, docked from its menu, made bigger from the keyboard, and remembered", async () => {
    await page.evaluate(() => document.getElementById("home-wb-toggle-btn").click());
    await until(() => visible(".wb-win-chat"), "the board opens");
    const rect = () => page.$eval(".wb-win-chat", (w) => { const r = w.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, mode: w.dataset.mode }; });
    const start = await rect();
    assert.strictEqual(start.mode, "right", "it starts docked on the right");
    // Pulled off its edge by the title bar it floats
    const head = await (await page.$(".wb-win-chat .fw-head")).boundingBox();
    await page.mouse.move(head.x + 80, head.y + 18);
    await page.mouse.down();
    await page.mouse.move(head.x - 160, head.y + 140, { steps: 8 });
    await page.mouse.up();
    await until(async () => (await rect()).mode === "float", "it floats once it is pulled away");
    const moved = await rect();
    assert.ok(moved.x < start.x - 100 && moved.y > start.y + 60, `it moved (${Math.round(start.x)},${Math.round(start.y)} → ${Math.round(moved.x)},${Math.round(moved.y)})`);
    await until(async () => (await h.api("GET", "/api/settings")).whiteboard.windows.chat.mode === "float", "the place is kept");
    // A corner pulled changes its size
    const before = await rect();
    const corner = await (await page.$(".wb-win-chat .fw-h[data-h='se']")).boundingBox();
    await page.mouse.move(corner.x + 6, corner.y + 6);
    await page.mouse.down();
    await page.mouse.move(corner.x + 90, corner.y + 70, { steps: 6 });
    await page.mouse.up();
    const bigger = await rect();
    assert.ok(bigger.w > before.w + 40 && bigger.h > before.h + 30, "it is bigger");
    // The menu has every place by name, and the keyboard moves and resizes it
    await page.click('.wb-win-chat .fw-head [aria-haspopup="menu"]');
    await page.evaluate(() => [...document.querySelectorAll(".wb-win-chat .fw-menu-item")].find((b) => /Dock to the left/.test(b.textContent)).click());
    await until(async () => (await rect()).mode === "left", "docked to the left from the menu");
    assert.strictEqual(await page.$eval("#main", (m) => m.dataset.wbDock), "start", "the conversation moves the other way");
    await page.focus(".wb-win-chat .fw-head");
    const w0 = (await rect()).w;
    await page.keyboard.down("Alt");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.up("Alt");
    await until(async () => (await rect()).w > w0 + 20, "Alt and the arrow keys make it wider");
    await until(async () => (await h.api("GET", "/api/settings")).whiteboard.windows.chat.mode === "left", "and that is kept too");
    // Back where it started
    await page.focus(".wb-win-chat .fw-head");
    await page.keyboard.press("Home");
    await until(async () => (await rect()).mode === "right", "Home puts it back");
    await page.evaluate(() => document.getElementById("home-wb-toggle-btn").click());
    await until(async () => !(await visible(".wb-win-chat")), "closed");
  });

  test("in voice mode the board sits beside the robot, and its place can be changed", async () => {
    await page.evaluate(() => document.getElementById("voice-open").click());
    await until(() => visible("#voice-mode"), "voice mode opens");
    await page.evaluate(() => document.getElementById("voice-board-btn").click());
    await until(() => visible(".wb-win-voice"), "the board is shown in voice mode");
    assert.strictEqual(await page.$eval("#voice-mode", (m) => m.dataset.board), "end", "the captions make room for it");
    await page.click('.wb-win-voice .fw-head [aria-haspopup="menu"]');
    await page.evaluate(() => [...document.querySelectorAll(".wb-win-voice .fw-menu-item")].find((b) => /Dock to the left/.test(b.textContent)).click());
    await until(async () => (await page.$eval("#voice-mode", (m) => m.dataset.board)) === "start", "it moves to the other side");
    await page.click('.wb-win-voice .fw-head [aria-haspopup="menu"]');
    await page.evaluate(() => [...document.querySelectorAll(".wb-win-voice .fw-menu-item")].find((b) => /Float freely/.test(b.textContent)).click());
    await until(async () => (await page.$eval("#voice-mode", (m) => m.dataset.board)) === "float", "or floats");
    await page.evaluate(() => document.getElementById("voice-board-btn").click());
    await until(async () => !(await visible(".wb-win-voice")), "the board is put away");
  });

  test("in voice mode the robot can be moved and made bigger, and is put back", async () => {
    await page.evaluate(() => document.querySelector('.voice-theme-btn[data-theme="robot"]').click());
    await sleep(300);
    await page.evaluate(() => document.getElementById("voice-place").click());
    await until(() => visible(".voice-place"), "the move mode starts");
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.up("Shift");
    await page.keyboard.press("+");
    await page.keyboard.press("+");
    await until(async () => { const p = (await h.api("GET", "/api/settings")).robot.voicePlace; return p.x > 0.1 && p.scale > 1.1; }, "the place and size are kept");
    await page.keyboard.press("Escape");
    await until(async () => !(await visible(".voice-place")), "Escape ends it");
    await page.evaluate(() => document.getElementById("voice-place").click());
    await until(() => visible(".voice-place"), "again");
    await page.keyboard.press("0");
    await until(async () => { const p = (await h.api("GET", "/api/settings")).robot.voicePlace; return p.x === 0 && p.y === 0 && p.scale === 1; }, "0 puts it back in the middle");
    await page.keyboard.press("Enter");
    await page.evaluate(() => document.querySelector('.voice-theme-btn[data-theme="sunset"]').click());
  });

  test("in a video the board is part of the picture", async () => {
    await page.evaluate(() => document.getElementById("voice-board-btn").click());
    await until(() => visible(".wb-win-voice"), "the board is back");
    await page.evaluate(() => document.getElementById("voice-record").click());
    await page.evaluate(() => document.querySelector('#voice-rec-frame [data-frame="16:9"]').click());
    await sleep(900);
    assert.strictEqual(await page.$eval("#voice-mode", (m) => m.dataset.frame), "16:9");
    const sample = () => page.evaluate(() => {
      const c = document.getElementById("voice-waves");
      const ctx = c.getContext("2d");
      // the right-hand side is where the board is drawn
      const d = ctx.getImageData(Math.round(c.width * 0.8), Math.round(c.height * 0.35), 60, 60).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
      return Math.round(sum / (d.length / 4));
    });
    const withBoard = await sample();
    await page.evaluate(() => document.getElementById("voice-board-btn").click());
    await sleep(900);
    const without = await sample();
    assert.ok(Math.abs(withBoard - without) > 25, `the board is in the picture (${withBoard} with it, ${without} without)`);
    await page.evaluate(() => document.getElementById("voice-board-btn").click());
    await until(() => visible(".wb-win-voice"), "and back");
    await page.evaluate(() => document.querySelector('#voice-rec-frame [data-frame="screen"]').click());
    await page.evaluate(() => document.getElementById("voice-record").click());
  });

  test("filming the screen: the board stays as just a picture, or stays out of it", async () => {
    await page.evaluate(() => document.getElementById("voice-end")?.click());
    await sleep(400);
    await page.goto(h.base + "/?robot-debug", { waitUntil: "networkidle2" });
    await sleep(600);
    const filmingOnly = (on) => page.evaluate((v) => window.friendsSettings.updateSettings((s) => { s.whiteboard.showInFilming = v; }), on);
    await page.evaluate(() => document.getElementById("voice-open").click());
    await until(() => visible("#voice-mode"), "voice mode opens");
    await page.evaluate(() => document.getElementById("voice-board-btn").click());
    await until(() => visible(".wb-win-voice"), "the board is shown");
    await page.evaluate(() => document.getElementById("voice-filming").click());
    await until(() => page.$eval("#voice-mode", (m) => m.classList.contains("filming")), "filming mode starts");
    assert.strictEqual(await visible(".wb-win-voice"), true, "it stays in view while filming");
    assert.strictEqual(await visible(".wb-win-voice .rw-pill"), false, "without its tools");
    assert.strictEqual(await page.$eval(".wb-win-voice", (b) => getComputedStyle(b).pointerEvents), "none", "nothing to click: it is only a picture");
    await filmingOnly(false);
    await until(async () => !(await visible(".wb-win-voice")), "the board leaves the picture when it is switched off for filming");
    await filmingOnly(true);
    await until(() => visible(".wb-win-voice"), "and comes back");
    await page.evaluate(() => document.getElementById("filming-exit").click());
    await until(async () => !(await page.$eval("#voice-mode", (m) => m.classList.contains("filming"))), "filming ends");
    assert.strictEqual(await visible(".wb-win-voice .rw-pill"), true, "the tools are back");
    await page.evaluate(() => document.getElementById("voice-end")?.click());
    await sleep(300);
  });

  test("the settings for the board are in Settings → Robot and are saved", async () => {
    await page.evaluate(() => document.getElementById("voice-end")?.click());
    await sleep(400);
    await page.evaluate(() => document.getElementById("settings-btn").click());
    await sleep(300);
    await page.evaluate(() => document.getElementById("tab-robot").click());
    await sleep(300);
    const tabs = await page.$$eval("#pane-robot .subtabs [role=tab], .subtabs [role=tab]", (t) => t.map((x) => x.id).filter((i) => /rb-/.test(i)));
    assert.ok(tabs.includes("subtab-rb-board"), `the board has its own part (${tabs.join(", ")})`);
    await page.evaluate(() => document.getElementById("subtab-rb-board").click());
    await sleep(300);
    await page.evaluate(() => document.querySelector('[data-setting="whiteboard.showInRecordings"]').click());
    await until(async () => (await h.api("GET", "/api/settings")).whiteboard.showInRecordings === false, "the choice is saved");
    await page.evaluate(() => document.querySelector('[data-setting="whiteboard.showInRecordings"]').click());
    await until(async () => (await h.api("GET", "/api/settings")).whiteboard.showInRecordings === true, "and can be switched back");
  });

  test("the Robot section's shortcut opens the Studio on the page it names, and the status card says who is there", async () => {
    // (Settings → Robot is still open from the test before)
    await page.evaluate(() => document.getElementById("subtab-rb-overview")?.click());
    await sleep(300);
    const who = await page.$eval("#robot-status-character", (el) => el.textContent.trim());
    assert.ok(who.length > 0, "the card names the character the robot is");
    await page.evaluate(() => document.getElementById("subtab-rb-behaviour")?.click());
    await sleep(300);
    await page.evaluate(() => document.querySelector('[data-open-studio="behaviors"]').click());
    await until(() => page.$eval("#rs-tab-behaviors", (el) => el.getAttribute("aria-selected") === "true").catch(() => false), "the Studio opens on Behaviors");
    await page.evaluate(() => document.getElementById("rs-done")?.click());
    await sleep(200);
  });

  test("nothing went wrong in the page along the way", () => {
    assert.deepStrictEqual(problems, []);
  });
});
