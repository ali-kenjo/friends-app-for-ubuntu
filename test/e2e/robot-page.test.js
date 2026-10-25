// End-to-end: the Robot page as a place to work. The shape library, the sources (what the robot learns from), the
// roles (a teacher, a coach…), the options of what is selected, the arrows that grow a diagram, links between boards,
// and finding anything with Ctrl+P.
//   npm run test:e2e
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const { launch, sleep } = require("../../scripts/lib/harness");

const hasChrome = ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", process.env.CHROME_PATH].some((p) => p && fs.existsSync(p));

describe("The Robot page", { skip: !hasChrome && "no Chrome found" }, () => {
  let h;
  let page;
  let whiteboard;
  const problems = [];
  const visible = (sel) => page.$eval(sel, (el) => !el.closest("[hidden]") && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0).catch(() => false);
  const board = () => h.api("GET", "/api/whiteboards/current");
  const items = async () => (await board()).pages.flatMap((p) => p.items);
  const until = async (check, what, ms = 8000) => {
    const stop = Date.now() + ms;
    while (Date.now() < stop) {
      if (await check()) return;
      await sleep(120);
    }
    assert.fail(`Never happened: ${what}`);
  };
  const rail = (name) => page.evaluate((n) => document.querySelector(`.rw-rail-btn[aria-label="${n}"]`).click(), name);
  const settings = () => h.api("GET", "/api/settings");

  before(async () => {
    h = await launch();
    page = h.page;
    page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && problems.push(`console: ${m.text()}`));
    await h.addLocalBrain();
    await h.setLook({ width: 1440, height: 900 });
    whiteboard = require("../../server/whiteboard");
    await page.goto(h.base + "/?robot-debug#whiteboard", { waitUntil: "networkidle2" });
    await until(() => visible("#wb-workspace .wb-stage"), "the page is shown");
  });

  after(async () => {
    await h?.close();
  });

  test("a shape from the library goes onto the board, and is yours", async () => {
    await rail("Shapes");
    await until(() => visible(".rw-tile"), "the shapes are listed");
    assert.ok((await page.$$(".rw-tile")).length >= 10);
    await page.evaluate(() => [...document.querySelectorAll(".rw-tile")].find((b) => b.getAttribute("aria-label") === "Diamond").click());
    await until(async () => (await items()).some((i) => i.type === "shape" && i.shapeType === "diamond"), "the diamond is on the board");
    const diamond = (await items()).find((i) => i.shapeType === "diamond");
    assert.strictEqual(diamond.author, "user");
    // Search narrows the library
    await page.type(".rw-side .rw-search", "arrow");
    await sleep(300);
    const names = await page.$$eval(".rw-tile", (t) => t.map((x) => x.getAttribute("aria-label")));
    assert.ok(names.length >= 3 && names.length < 15 && names.includes("Arrow"), names.join(", "));
    await rail("Shapes");
  });

  test("what is selected can be changed in the options, and its place and size can be typed", async () => {
    const id = (await items()).find((i) => i.shapeType === "diamond").id;
    await page.evaluate((i) => window.friendsRobotPage.view.setSelection([i]), id);
    await until(() => visible(".rw-ctx"), "a bar floats next to the selection");
    assert.ok((await page.$$eval(".rw-inspector-tabs button", (b) => b.map((x) => x.textContent))).join() === "Design,Arrange,About");
    await page.evaluate(() => document.getElementById("insp-tab-arrange").click());
    await sleep(200);
    await page.$eval(".rw-inspector .wb-xy input", (el) => el.focus());
    await page.evaluate(() => {
      const input = document.querySelector(".rw-inspector .wb-xy input");
      input.value = "333";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await until(async () => (await items()).find((i) => i.id === id).x === 333, "the shape moves to the x that was typed");
    // Its look: a color from the Design tab
    await page.evaluate(() => document.getElementById("insp-tab-design").click());
    await sleep(200);
    await page.evaluate(() => document.querySelector('.rw-inspector .wb-swatch[aria-label="red"]')?.click());
    await until(async () => (await items()).find((i) => i.id === id).strokeColor === "#dc2626", "the outline turns red");
    // The About tab says who made it and what the robot calls it
    await page.evaluate(() => document.getElementById("insp-tab-about").click());
    await sleep(200);
    assert.match(await page.$eval(".wb-about", (d) => d.textContent), new RegExp(`\\[${id}\\]`));
  });

  test("the arrows around a box grow the next box, joined by an arrow that stays attached", async () => {
    const shape = (await items()).find((i) => i.shapeType === "diamond");
    await page.evaluate((i) => window.friendsRobotPage.view.setSelection([i]), shape.id);
    await sleep(300);
    const at = await page.evaluate(() => {
      const v = window.friendsRobotPage.view;
      const spot = v.connectSpots().find((s) => s.side === "right");
      const p = v.toScreen(spot.x, spot.y);
      const r = v.stage.getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    });
    await page.mouse.click(at.x, at.y);
    await until(async () => (await items()).filter((i) => i.shapeType === "diamond").length === 2, "a second box grows");
    const all = await items();
    const connector = all.find((i) => i.shapeType === "connector");
    assert.ok(connector, "and an arrow joins them");
    assert.strictEqual(connector.from.id, shape.id);
    assert.strictEqual(connector.from.port, "right");
    assert.ok(all.find((i) => i.id === connector.to.id).x > shape.x + shape.width, "the new box is to the right");
    await page.keyboard.press("Escape");
  });

  test("what the robot learns from: a text is added as a source, switched off, read and removed", async () => {
    await rail("Sources");
    await until(() => visible(".rw-empty-sources"), "there are none yet, and it says what to do");
    await page.evaluate(() => [...document.querySelectorAll(".rw-empty-sources .btn")].find((b) => /Paste a text/.test(b.textContent)).click());
    await until(() => visible(".wb-modal textarea"), "the dialog opens");
    await page.type('.wb-modal input[type="text"]', "Biology handout");
    await page.type(".wb-modal textarea", "Photosynthesis turns light into sugar.");
    await page.evaluate(() => [...document.querySelectorAll(".wb-modal button")].find((b) => b.textContent.trim() === "Add").click());
    await until(() => visible(".rw-source"), "the source is listed");
    assert.strictEqual(await page.$eval(".rw-source-n", (n) => n.textContent), "S1");
    const id = (await board()).id;
    const listed = (await h.api("GET", `/api/whiteboards/${id}/sources`)).sources;
    assert.strictEqual(listed.length, 1);
    assert.ok(await visible(".rw-studio-card:not([disabled])"), "what it can make from them is on offer");
    await page.evaluate(() => document.querySelector(".rw-source .toggle").click());
    await until(async () => (await h.api("GET", `/api/whiteboards/${id}/sources`)).sources[0].enabled === false, "it can be switched off");
    await page.evaluate(() => document.querySelector(".rw-source-main").click());
    await until(() => visible(".wb-modal .wb-sees"), "reading it");
    assert.match(await page.$eval(".wb-modal .wb-sees", (p) => p.textContent), /Photosynthesis/);
    await page.keyboard.press("Escape");
    await page.evaluate(() => document.querySelector('.rw-source [aria-label^="More for"]').click());
    await page.evaluate(() => [...document.querySelectorAll(".wb-menu-item")].find((b) => /Remove/.test(b.textContent)).click());
    await until(() => visible(".confirm-backdrop .btn-danger"), "it asks first");
    await page.evaluate(() => document.querySelector(".confirm-backdrop .btn-danger").click());
    await until(async () => (await h.api("GET", `/api/whiteboards/${id}/sources`)).sources.length === 0, "and removes it");
    await rail("Sources");
  });

  test("what the robot is to you: a teacher from its window, seen in the chat's top bar and in settings", async () => {
    await page.click(".rw-role-btn");
    await until(() => visible(".rw-role-pop"), "the roles are offered");
    assert.ok((await page.$$(".rw-role")).length >= 10);
    await page.evaluate(() => [...document.querySelectorAll(".rw-role")].find((b) => /Teacher/.test(b.textContent)).click());
    await until(async () => (await settings()).roles.active === "teacher", "the role is saved");
    assert.match(await page.$eval(".rw-role-btn", (b) => b.textContent), /Teacher/);
    assert.ok((await page.$$eval(".rw-robot-chips .wb-chip-btn", (c) => c.map((x) => x.textContent))).some((t) => /lesson plan/i.test(t)), "its quick actions follow");
    assert.match(await page.$eval(".rw-robot-input", (i) => i.placeholder), /Teacher/i);
    await page.evaluate(() => document.getElementById("nav-home").click());
    await sleep(300);
    assert.match(await page.$eval("#role-pill", (b) => b.textContent), /Teacher/);
    // Settings → Robot → Roles shows it and offers more
    await page.evaluate(() => document.getElementById("settings-btn").click());
    await sleep(300);
    await page.evaluate(() => document.getElementById("tab-robot").click());
    await page.evaluate(() => document.getElementById("subtab-rb-roles").click());
    await sleep(300);
    assert.match(await page.$eval("#roles-root .rw-role.current", (b) => b.textContent), /Teacher/);
    await page.evaluate(() => [...document.querySelectorAll("#roles-root .btn")].find((b) => /Make a role/.test(b.textContent)).click());
    await until(() => visible("#roles-root .roles-editor"), "a role of your own can be made");
    assert.strictEqual((await settings()).roles.custom.length, 1);
    await page.evaluate(() => document.getElementById("settings-close").click());
    await page.evaluate(() => document.getElementById("nav-whiteboard").click());
    await until(() => visible("#wb-workspace .wb-stage"), "back on the Robot page");
  });

  test("Ctrl+P finds anything, and Ctrl+O goes to a board or makes one", async () => {
    await page.focus(".wb-viewport");
    await page.keyboard.down("Control");
    await page.keyboard.press("p");
    await page.keyboard.up("Control");
    await until(() => visible(".rw-palette"), "the palette opens");
    await page.keyboard.type("coach");
    await sleep(200);
    await page.keyboard.press("Enter");
    await until(async () => (await settings()).roles.active === "coach", "the command ran: the robot is a coach");
    await page.focus(".wb-viewport");
    await page.keyboard.down("Control");
    await page.keyboard.press("o");
    await page.keyboard.up("Control");
    await until(() => visible(".rw-palette"), "the boards open");
    await page.keyboard.type("Lesson notes");
    await sleep(300);
    await page.keyboard.press("Enter");
    await until(async () => (await board()).title === "Lesson notes", "a board of that name is made and opened");
  });

  test("[[Links]] between boards are followed from both ends", async () => {
    const main = (await h.api("GET", "/api/whiteboards")).find((b) => b.title !== "Lesson notes");
    // The new board links to the first one
    const current = (await board()).id;
    whiteboard.apply(current, [{ op: "add", item: { type: "text", text: `Back to [[${main.title}]] and on to [[Next steps]]`, format: "markdown", x: 100, y: 100 } }], { actor: "user" });
    await rail("Boards");
    await until(() => visible(".rw-links .rw-outline-item"), "the links are listed");
    const labels = await page.$$eval(".rw-links .rw-outline-item .rw-outline-label", (l) => l.map((x) => x.textContent));
    assert.ok(labels.includes(main.title) && labels.includes("Next steps"), labels.join(", "));
    // The one it points to sees who points at it
    await page.evaluate((t) => [...document.querySelectorAll(".rw-links .rw-outline-item")].find((b) => b.textContent.includes(t)).click(), main.title);
    await until(async () => (await board()).id === main.id, "the link opens that board");
    await until(async () => (await page.$$eval(".rw-links .rw-outline-item .rw-outline-label", (l) => l.map((x) => x.textContent))).includes("Lesson notes"), "which shows who links to it");
    await rail("Boards");
  });

  test("the Outline lists what is on the page and takes you to it", async () => {
    await rail("Outline");
    const item = ".rw-side-panel:not([hidden]) .rw-outline-item";
    await until(() => visible(item), "the outline lists things");
    const labels = await page.$$eval(`${item} .rw-outline-label`, (l) => l.map((x) => x.textContent));
    assert.ok(labels.length >= 2);
    await page.type(".rw-side-panel:not([hidden]) .rw-search", "zzzz-nothing");
    await sleep(300);
    assert.strictEqual((await page.$$(item)).length, 0);
    await page.$eval(".rw-side-panel:not([hidden]) .rw-search", (i) => { i.value = ""; i.dispatchEvent(new Event("input")); });
    await sleep(300);
    await page.click(item);
    await until(async () => (await page.evaluate(() => window.friendsRobotPage.view.selection.size)) === 1, "clicking one selects it");
    await rail("Outline");
  });

  test("the robot answers from the sources and says where from; Create asks for something made of them", async () => {
    const id = (await board()).id;
    require("../../server/whiteboard-sources").add(id, { title: "Handout", text: "Photosynthesis makes sugar." });
    h.behave.text = "Photosynthesis makes sugar [S1] and oxygen.";
    await page.evaluate(() => document.querySelector(".rw-studio").click());
    await until(() => visible(".wb-menu-list .wb-menu-item"), "the Create menu opens");
    const offered = await page.$$eval(".wb-menu-list .wb-menu-item", (b) => b.map((x) => x.textContent));
    assert.ok(offered.some((t) => /Summary/.test(t)) && offered.some((t) => /Quiz/.test(t)) && offered.some((t) => /Flashcards/.test(t)), offered.join(" | "));
    await page.evaluate(() => [...document.querySelectorAll(".wb-menu-list .wb-menu-item")].find((b) => /Summary/.test(b.textContent)).click());
    await until(() => visible(".rw-robot-reply .rw-cite"), "the answer shows [S1] as a button");
    assert.match(await page.$eval(".rw-robot-reply", (r) => r.textContent), /Photosynthesis makes sugar/);
    await page.evaluate(() => document.querySelector(".rw-robot-reply .rw-cite").click());
    await until(() => visible(".wb-modal .wb-sees"), "a click on it opens the source");
    assert.match(await page.$eval(".wb-modal h2", (e) => e.textContent), /S1: Handout/);
    assert.match(await page.$eval(".wb-modal .wb-sees", (e) => e.textContent), /Photosynthesis makes sugar/);
    await page.keyboard.press("Escape");
    // What was asked was said as a person would say it, in the one conversation
    const chats = await h.api("GET", "/api/chats");
    const chat = await h.api("GET", `/api/chats/${chats[0].id}`);
    assert.match(chat.messages[0].text, /summary of what is on the board and in my sources/);
    h.behave.text = undefined;
  });

  test("on a phone the panels lie over the board and the robot's window folds to its title bar", async () => {
    await h.setLook({ width: 390 });
    await page.goto(h.base + "/?robot-debug#whiteboard", { waitUntil: "networkidle2" });
    await until(() => visible("#wb-workspace .wb-stage"), "the page is shown");
    assert.strictEqual(await page.$eval("#wb-workspace", (w) => w.dataset.compact), "true");
    assert.strictEqual(await visible(".rw-inspector"), false, "the options wait until asked for");
    assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, "nothing runs off the side");
    const win = await page.$eval(".rw-robot-win", (w) => w.getBoundingClientRect().height);
    assert.ok(win < 80, `the robot's window is just its title bar (${Math.round(win)} px)`);
    await rail("Shapes");
    await until(() => visible(".rw-tile"), "a panel opens");
    assert.ok(await page.$eval(".rw-side", (s) => getComputedStyle(s).position === "absolute"), "over the board, not squeezing it");
  });

  test("nothing went wrong in the page along the way", () => {
    assert.deepStrictEqual(problems, []);
  });
});
