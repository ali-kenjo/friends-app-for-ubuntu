// The Room Editor in the real page: opening it from the Studio, Settings and the palette, placing things
// from the catalog (a click and a drag), moving and turning with the keyboard, undo and redo, removing,
// touch, saving, and the editor in Arabic (right to left).
//   npm run test:e2e
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CHROME = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => p && fs.existsSync(p));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-e2e-room-editor-"));
process.env.FRIENDS_DATA_DIR = tempDir;
process.env.FRIENDS_VOICE_DIR = path.join(tempDir, "voice");
process.env.KEYRING_BACKEND = "file";
process.env.LOG_LEVEL = "error";
delete process.env.GEMINI_API_KEY;

describe("The Room Editor", { skip: !CHROME && "no Chrome found" }, () => {
  let browser;
  let page;
  let server;
  let base;
  let roomId;
  const problems = [];

  const api = (method, url, body) => fetch(`${base}${url}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
  const savedRoom = () => api("GET", `/api/rooms/${roomId}`);
  // The room is saved a moment after a change
  const savedWhere = async (check, what) => {
    const until = Date.now() + 15000;
    let last;
    while (Date.now() < until) {
      last = await savedRoom();
      if (check(last)) return last;
      await new Promise((r) => setTimeout(r, 150));
    }
    assert.fail(`Not saved: ${what}`);
  };
  const click = (selector) => page.evaluate((s) => document.querySelector(s).click(), selector);
  const editorOpen = () => page.waitForFunction(() => document.querySelector("#room-editor:not([hidden]) .re-stage canvas"), { timeout: 30000 });
  const editorClosed = () => page.waitForFunction(() => !document.getElementById("room-editor"), { timeout: 10000 });
  const done = async () => {
    await click("#room-editor .re-top-end .btn-primary");
    await editorClosed();
  };
  const selectedIds = () => page.evaluate(() => [...document.querySelectorAll(".re-tree [aria-selected=true]")].map((r) => r.dataset.id));
  const press = async (key, modifiers = []) => {
    for (const m of modifiers) await page.keyboard.down(m);
    await page.keyboard.press(key);
    for (const m of modifiers.reverse()) await page.keyboard.up(m);
  };

  before(async () => {
    const { start } = require("../../server/server");
    const settingsModule = require("../../server/settings");
    settingsModule.set({ ...settingsModule.get(), onboarding: { done: true }, robot: { ...settingsModule.get().robot, chatDock: false, quality: "low" } });
    server = start(0, "127.0.0.1");
    await new Promise((resolve) => (server.listening ? resolve() : server.on("listening", resolve)));
    base = `http://127.0.0.1:${server.address().port}`;
    // A furnished room to edit (the living room template)
    const doc = await api("POST", "/api/rooms", { template: "lounge", name: "Test lounge" });
    roomId = doc.id;
    const s = await api("GET", "/api/settings");
    s.robot.room = { layoutId: roomId };
    await api("PUT", "/api/settings", s);
    browser = await require("puppeteer-core").launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--accept-lang=en-US,en", "--disable-gpu", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    page = await browser.newPage();
    await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] }));
    await page.setViewport({ width: 1280, height: 860 });
    page.on("pageerror", (err) => problems.push(`page error: ${err.message}`));
    page.on("console", (msg) => msg.type() === "error" && !/Failed to load resource/.test(msg.text()) && problems.push(`console: ${msg.text()}`));
    await page.goto(`${base}/?robot-debug`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => window.friendsRobot?.room?.id, { timeout: 60000 });
  });

  after(async () => {
    await browser?.close();
    await new Promise((resolve) => server?.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("the Studio's Room tab names the room and opens the editor; Done brings the Studio back", async () => {
    await page.evaluate(() => document.querySelector("[data-open-studio]").click());
    await page.waitForFunction(() => !document.getElementById("robot-studio").hidden);
    await click("#rs-tab-room");
    assert.match(await page.$eval("#rs-panel-room .rs-room-summary", (el) => el.textContent), /Test lounge: \d+ things/);
    await click('#rs-panel-room [data-edit-room]');
    await editorOpen();
    assert.strictEqual(await page.evaluate(() => document.getElementById("robot-studio").hidden), true);
    // A full-screen dialog: focus is inside, the page behind is inert, the engine draws in the editor
    assert.strictEqual(await page.evaluate(() => document.getElementById("room-editor").contains(document.activeElement)), true);
    assert.strictEqual(await page.evaluate(() => document.getElementById("main").closest("[inert]") !== null), true);
    assert.strictEqual(await page.evaluate(() => window.friendsRobot.engine.active.name), "editor");
    assert.strictEqual(await page.$eval("#room-editor .re-name", (el) => el.value), "Test lounge");
    await done();
    await page.waitForFunction(() => !document.getElementById("robot-studio").hidden);
    await page.evaluate(() => document.getElementById("rs-done").click());
  });

  test("Settings → Robot opens it too", async () => {
    await click("#settings-btn");
    await click("#tab-robot");
    await click("#robot-room-edit");
    await editorOpen();
    await done();
    await page.keyboard.press("Escape");
  });

  test("nothing selected shows the room's own settings; a click in the catalog places a thing and selects it", async () => {
    await page.evaluate(() => import("/js/room/editor/open.js").then((m) => m.editRoom()));
    await editorOpen();
    assert.strictEqual(await page.$eval(".re-inspector .re-title", (el) => el.textContent), "The room");
    const before = (await savedRoom()).assets.length;
    await page.type(".re-search", "standing desk");
    await page.waitForFunction(() => document.querySelectorAll(".re-grid .re-item").length === 1);
    await click(".re-grid .re-item");
    const saved = await savedWhere((r) => r.assets.length === before + 1, "the standing desk");
    const desk = saved.assets.find((a) => a.type === "desk_standing");
    assert.ok(desk, "a standing desk is in the room");
    assert.strictEqual(desk.slot, "floor");
    assert.strictEqual(await page.$eval(".re-inspector .re-title", (el) => el.textContent), "Standing desk");
    assert.deepStrictEqual(await page.evaluate(() => window.friendsRobot.room.assets.some((a) => a.type === "desk_standing")), true);
    // …and the renderer built it
    await page.waitForFunction((id) => window.friendsRobot.engine.rooms.instances.has(id), { timeout: 15000 }, desk.id);
  });

  test("arrow keys move it, Q turns it, Ctrl+Z and Ctrl+Shift+Z undo and redo, every step is saved", async () => {
    const id = (await selectedIds())[0];
    const start = (await savedRoom()).assets.find((a) => a.id === id);
    await page.focus("#room-editor .re-stage");
    await page.keyboard.down("Shift");
    await press("ArrowRight");
    await page.keyboard.up("Shift");
    const moved = await savedWhere((r) => {
      const a = r.assets.find((x) => x.id === id);
      return Math.hypot(a.pos[0] - start.pos[0], a.pos[2] - start.pos[2]) > 0.09;
    }, "the desk 10 cm along");
    const at = moved.assets.find((a) => a.id === id).pos;
    await press("q");
    await savedWhere((r) => Math.round(r.assets.find((x) => x.id === id).rot - start.rot) === 15, "the desk turned 15°");
    await press("z", ["Control"]);
    await savedWhere((r) => Math.round(r.assets.find((x) => x.id === id).rot) === Math.round(start.rot), "the turn undone");
    await press("z", ["Control"]);
    await savedWhere((r) => Math.abs(r.assets.find((x) => x.id === id).pos[0] - start.pos[0]) < 0.001 && Math.abs(r.assets.find((x) => x.id === id).pos[2] - start.pos[2]) < 0.001, "the move undone");
    await press("z", ["Control", "Shift"]);
    await savedWhere((r) => Math.abs(r.assets.find((x) => x.id === id).pos[0] - at[0]) < 0.001, "the move redone");
    // The live region says what happened
    assert.match(await page.$eval("#room-editor .sr-only[aria-live]", (el) => el.textContent), /Redone|moved/);
  });

  test("a lamp dragged from the catalog into the room lands where it is dropped", async () => {
    await page.$eval(".re-search", (el) => (el.value = ""));
    await page.type(".re-search", "floor lamp");
    await page.waitForFunction(() => document.querySelectorAll(".re-grid .re-item").length >= 1);
    const before = (await savedRoom()).assets.filter((a) => a.type === "lamp_floor").length;
    const tile = await page.$(".re-grid .re-item");
    const from = await tile.boundingBox();
    const stage = await (await page.$("#room-editor .re-stage")).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    // Through a few points, so the drag starts and the ghost follows
    for (const k of [0.2, 0.5, 0.8, 1]) {
      await page.mouse.move(from.x + (stage.x + stage.width * 0.55 - from.x) * k, from.y + (stage.y + stage.height * 0.8 - from.y) * k, { steps: 4 });
    }
    await page.mouse.up();
    if (process.env.ROOM_EDITOR_SHOTS) await page.screenshot({ path: path.join(process.env.ROOM_EDITOR_SHOTS, "drag.jpg"), type: "jpeg" });
    const saved = await savedWhere((r) => r.assets.filter((a) => a.type === "lamp_floor").length === before + 1, "the dragged lamp");
    const lamp = saved.assets.filter((a) => a.type === "lamp_floor").at(-1);
    // Inside the room, on the floor
    assert.strictEqual(lamp.slot, "floor");
    assert.ok(Math.abs(lamp.pos[0]) <= saved.size.w / 2 && Math.abs(lamp.pos[2]) <= saved.size.d / 2, `inside the room: ${lamp.pos}`);
  });

  test("a picture frame goes on a wall, Delete removes it and undo brings it back", async () => {
    await page.$eval(".re-search", (el) => (el.value = ""));
    await page.type(".re-search", "picture frame");
    await page.waitForFunction(() => document.querySelectorAll(".re-grid .re-item").length >= 1);
    const count = (await savedRoom()).assets.length;
    await click(".re-grid .re-item");
    const saved = await savedWhere((r) => r.assets.length === count + 1, "the frame");
    const frame = saved.assets.at(-1);
    assert.strictEqual(frame.slot, "wall");
    await page.focus("#room-editor .re-stage");
    await press("Delete");
    await savedWhere((r) => !r.assets.some((a) => a.id === frame.id), "the frame removed");
    await press("z", ["Control"]);
    await savedWhere((r) => r.assets.some((a) => a.id === frame.id), "the frame back");
  });

  test("the outline lists everything, selects with the keyboard and hides with H", async () => {
    await click("#re-tab-outline");
    const rows = await page.$$eval(".re-tree [data-id]", (els) => els.length);
    assert.strictEqual(rows, (await savedRoom()).assets.length);
    await page.focus(".re-tree [data-id]");
    await press("ArrowDown");
    await press("Enter");
    const id = (await selectedIds())[0];
    assert.ok(id, "a row is selected");
    await page.focus(`.re-tree [data-id="${id}"]`);
    await press("h");
    await savedWhere((r) => r.assets.find((a) => a.id === id).hidden === true, "hidden");
    await press("h");
    await savedWhere((r) => r.assets.find((a) => a.id === id).hidden === false, "shown again");
    await page.keyboard.press("Escape"); // deselect
    await click("#re-tab-catalog");
  });

  test("the inspector's tabs work from the keyboard and a rule is saved", async () => {
    const id = (await savedRoom()).assets.find((a) => a.type === "desk_standing").id;
    await page.evaluate((x) => document.querySelector(`.re-tree [data-id="${x}"]`)?.click(), id);
    await page.waitForFunction(() => document.querySelector(".re-inspector [role=tab]"));
    await page.focus('.re-inspector [role=tab][aria-selected="true"]');
    await press("ArrowRight");
    await press("ArrowRight");
    await press("Enter");
    await page.waitForFunction(() => document.querySelector('.re-inspector [role=tab][aria-selected="true"]')?.textContent === "Robot rules");
    await page.evaluate(() => [...document.querySelectorAll(".re-inspector .rs-tile")].find((b) => b.textContent.includes("Never")).click());
    await savedWhere((r) => r.assets.find((a) => a.id === id).rules.permission === "never", "the rule");
  });

  test("touch: a tap selects a thing in the room", async () => {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".re-tree [aria-selected=true]"));
    // Where the desk is on screen, from the engine's camera
    const point = await page.evaluate(async () => {
      const e = window.friendsRobot.engine;
      const id = window.friendsRobot.room.assets.find((a) => a.type === "desk_standing").id;
      const g = e.rooms.instances.get(id).built.group;
      const THREE = await import("three");
      const box = new THREE.Box3().setFromObject(g);
      // The middle of the tabletop (the middle of its box is the empty space under it)
      const c = box.getCenter(new THREE.Vector3()).setY(box.max.y - 0.01).project(e.camera);
      const r = e.canvas.getBoundingClientRect();
      return { x: r.left + ((c.x + 1) / 2) * r.width, y: r.top + ((1 - c.y) / 2) * r.height, id };
    });
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForFunction((id) => document.querySelector(`.re-tree [data-id="${id}"]`)?.getAttribute("aria-selected") === "true", { timeout: 5000 }, point.id);
    await done();
    assert.strictEqual(await page.evaluate(() => window.friendsRobot.engine.active?.name !== "editor"), true);
  });

  test("the robot page's command palette opens it", async () => {
    await page.evaluate(() => (location.hash = "#robot"));
    await page.waitForFunction(() => document.body.dataset.view === "whiteboard", { timeout: 15000 });
    await press("p", ["Control"]);
    await page.waitForSelector(".rw-palette-input", { timeout: 10000 });
    await page.type(".rw-palette-input", "Edit the robot's room");
    await page.keyboard.press("Enter");
    await editorOpen();
    await done();
    await page.evaluate(() => (location.hash = "#home"));
  });

  test("a ready-made shot becomes voice mode's camera; closing the editor keeps a picture of the room", async () => {
    await page.evaluate(() => import("/js/room/editor/open.js").then((m) => m.editRoom()));
    await editorOpen();
    await page.waitForFunction(() => document.querySelector(".re-inspector .re-title")?.textContent === "The room");
    await page.evaluate(() => {
      const add = document.querySelector('.re-inspector select[aria-label="Add a ready-made shot"]');
      add.value = "auto";
      add.dispatchEvent(new Event("change"));
    });
    const withShot = await savedWhere((r) => r.cameras.some((c) => c.follow === "auto"), "the auto-frame shot");
    const shot = withShot.cameras.find((c) => c.follow === "auto");
    await page.waitForFunction(() => document.querySelector('.re-inspector select[aria-label="In voice mode the camera"]')?.options.length > 1);
    await page.evaluate((id) => {
      const pick = document.querySelector('.re-inspector select[aria-label="In voice mode the camera"]');
      pick.value = id;
      pick.dispatchEvent(new Event("change"));
    }, shot.id);
    await savedWhere((r) => r.defaultCamera === shot.id, "the shot chosen for voice mode");
    // Voice mode's own camera picker offers it, chosen
    assert.strictEqual(await page.$eval("#voice-scene-camera", (el) => el.value), shot.id);
    await done();
    const listed = await api("GET", "/api/rooms");
    assert.match(listed.rooms.find((r) => r.id === roomId).thumb, /^data:image\/jpeg;base64,/);
    // Back to the robot's own framing
    await page.evaluate(() => {
      const sel = document.getElementById("voice-scene-camera");
      sel.value = "auto";
      sel.dispatchEvent(new Event("change"));
    });
    await savedWhere((r) => r.defaultCamera === "auto", "the robot's own framing");
  });

  test("a scene hides a thing and is switched on; measuring and the room in words", async () => {
    await page.evaluate(() => import("/js/room/editor/open.js").then((m) => m.editRoom()));
    await editorOpen();
    await page.waitForFunction(() => document.querySelector(".re-inspector .re-title")?.textContent === "The room");
    await page.evaluate(() => [...document.querySelectorAll(".re-inspector button")].find((b) => b.textContent.trim() === "New scene").click());
    await page.waitForSelector(".re-scene[open] .re-scene-thing input");
    const first = await page.$eval(".re-scene[open] .re-scene-thing input", (el) => el.getAttribute("aria-label"));
    await page.evaluate(() => document.querySelector(".re-scene[open] .re-scene-thing input").click());
    const saved = await savedWhere((r) => r.scenes.length === 1 && Object.keys(r.scenes[0].overrides.hidden).length + Object.keys(r.scenes[0].overrides.lights).length === 1, "the scene's change");
    assert.match(first, /in this scene/);
    await page.evaluate(() => [...document.querySelectorAll(".re-scene[open] button")].find((b) => b.textContent.trim() === "Switch to it now").click());
    await savedWhere((r) => r.activeScene === saved.scenes[0].id, "the scene switched on");
    // Measuring: two clicks in the room, the distance is said
    await page.evaluate(() => [...document.querySelectorAll(".re-tools button")].find((b) => b.textContent.trim() === "Measure").click());
    const stage = await (await page.$("#room-editor .re-stage")).boundingBox();
    await page.mouse.click(stage.x + stage.width * 0.4, stage.y + stage.height * 0.75);
    await page.mouse.click(stage.x + stage.width * 0.7, stage.y + stage.height * 0.7);
    await page.waitForFunction(() => /cm between the two points/.test(document.querySelector("#room-editor .sr-only[aria-live]").textContent), { timeout: 5000 });
    await page.keyboard.press("Escape");
    assert.strictEqual(await page.evaluate(() => [...document.querySelectorAll(".re-tools button")].find((b) => b.textContent.trim() === "Measure").getAttribute("aria-pressed")), "false");
    // The room in words: one line per thing that shows
    await page.evaluate(() => [...document.querySelectorAll(".re-tools button")].find((b) => b.textContent.trim() === "Describe the room").click());
    await page.waitForSelector(".re-describe li");
    const lines = await page.$$eval(".re-describe li", (els) => els.length);
    assert.strictEqual(lines, (await savedRoom()).assets.filter((a) => !a.hidden).length);
    await page.keyboard.press("Escape");
    await page.evaluate((x) => [...document.querySelectorAll(".re-scene button")].find((b) => b.textContent.trim() === "Remove the scene")?.click(), null);
    await savedWhere((r) => r.scenes.length === 0 && r.activeScene === "auto", "the scene removed");
    await done();
  });

  test("my own model: the wizard reads a .glb, it's placed and drawn, a built-in can wear it, and it can be removed", async () => {
    // A little table made in the page with three.js's exporter: a top (material c1, with a picture), four
    // legs, and a node that says where the robot stands
    const b64 = await page.evaluate(async () => {
      const THREE = await import("three");
      const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
      const g = new THREE.Group();
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const x = c.getContext("2d");
      x.fillStyle = "#c08850";
      x.fillRect(0, 0, 64, 64);
      x.fillStyle = "#8a5a33";
      x.fillRect(0, 28, 64, 8);
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.7), new THREE.MeshStandardMaterial({ name: "c1", color: "#ffffff", map: new THREE.CanvasTexture(c) }));
      top.position.y = 0.73;
      g.add(top);
      for (const [lx, lz] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), new THREE.MeshStandardMaterial({ name: "metal legs", color: "#333333", metalness: 1 }));
        leg.position.set(lx, 0.35, lz);
        g.add(leg);
      }
      const stand = new THREE.Object3D();
      stand.name = "anchor_robot_stand";
      stand.position.set(0, 0, 0.8);
      g.add(stand);
      const buf = await new GLTFExporter().parseAsync(g, { binary: true });
      return btoa(String.fromCharCode(...new Uint8Array(buf)));
    });
    const file = path.join(tempDir, "my-table.glb");
    fs.writeFileSync(file, Buffer.from(b64, "base64"));
    await page.evaluate(() => import("/js/room/editor/open.js").then((m) => m.editRoom()));
    await editorOpen();
    await page.evaluate(() => document.querySelector('.re-chip[data-cat="mine"]').click());
    await page.waitForSelector(".re-add-model");
    await click(".re-add-model");
    await page.waitForSelector(".re-wizard input[type=file]");
    await (await page.$(".re-wizard input[type=file]")).uploadFile(file);
    await page.waitForSelector(".re-wiz-details:not([hidden])", { timeout: 20000 });
    const text = await page.$eval(".re-wizard", (el) => el.textContent);
    assert.match(text, /A flat top at 7[0-9] cm/, "the table top is found");
    assert.match(text, /Where the robot stands/, "the anchor is read");
    assert.match(text, /These take your colors: c1/);
    assert.strictEqual(await page.$eval(".re-wizard input[type=text]", (el) => el.value), "my table");
    await page.evaluate(() => [...document.querySelectorAll(".re-wizard .btn-primary")].at(-1).click());
    await page.waitForFunction(() => !document.querySelector(".re-wizard"), { timeout: 20000 });
    const models = await api("GET", "/api/room-assets");
    const entry = models.assets.find((e) => e.label === "my table");
    assert.ok(entry, "saved");
    assert.deepStrictEqual([entry.footprint.w, entry.footprint.d], [1.2, 0.7]);
    assert.ok(Math.abs(entry.height - 0.755) < 0.011, `height ${entry.height}`);
    assert.ok(entry.surfaces.length >= 1 && Math.abs(entry.surfaces[0].y - 0.755) < 0.03, JSON.stringify(entry.surfaces));
    assert.ok(entry.anchors.stand && Math.abs(entry.anchors.stand[2] - 0.8) < 0.02);
    // Placed in the room and drawn from its file (the textured top and the legs, not a stand-in box)
    const placed = await savedWhere((r) => r.assets.some((a) => a.type === `custom:${entry.id}`), "the model in the room");
    const id = placed.assets.find((a) => a.type === `custom:${entry.id}`).id;
    await page.waitForFunction((x) => {
      const inst = window.friendsRobot.engine.rooms.instances.get(x);
      return inst && inst.built.meshes.length >= 5;
    }, { timeout: 20000 }, id);
    assert.strictEqual(await page.evaluate((x) => Boolean(window.friendsRobot.engine.rooms.instances.get(x).built.meshes.find((m) => m.material.map)), id), true, "its picture loaded");
    // A built-in thing wears it and keeps being itself
    const desk = placed.assets.find((a) => !a.type.startsWith("custom:") && !a.parent && a.slot === "floor");
    await page.evaluate((x) => document.querySelector(`.re-tree [data-id="${x}"]`)?.click(), desk.id);
    await page.evaluate(() => [...document.querySelectorAll(".re-inspector [role=tab]")][3].click());
    await page.waitForSelector('.re-inspector select[aria-label="Wear one of my models"]');
    await page.evaluate((g) => {
      const s = document.querySelector('.re-inspector select[aria-label="Wear one of my models"]');
      s.value = g;
      s.dispatchEvent(new Event("change"));
    }, entry.id);
    await savedWhere((r) => r.assets.find((a) => a.id === desk.id).glb === entry.id && r.assets.find((a) => a.id === desk.id).type === desk.type, "the desk wearing the model");
    await page.evaluate((g) => {
      const s = document.querySelector('.re-inspector select[aria-label="Wear one of my models"]');
      s.value = "";
      s.dispatchEvent(new Event("change"));
    }, entry.id);
    await savedWhere((r) => !r.assets.find((a) => a.id === desk.id).glb, "the desk's own look");
    // Removed from my models: gone from the room and from the helper
    await page.keyboard.press("Escape");
    await page.evaluate(() => document.querySelector('.re-chip[data-cat="mine"]').click());
    await page.waitForSelector(".re-del");
    await click(".re-del");
    await page.waitForSelector("[role=alertdialog] [data-answer=yes]");
    await click("[role=alertdialog] [data-answer=yes]");
    await savedWhere((r) => !r.assets.some((a) => a.type === `custom:${entry.id}`), "the model gone from the room");
    assert.strictEqual((await api("GET", "/api/room-assets")).assets.length, 0);
    await page.evaluate(() => document.querySelector('.re-chip[data-cat="all"]').click());
    await done();
  });

  test("in Arabic the editor is right to left and every word is translated", async () => {
    const s = await api("GET", "/api/settings");
    s.ui.language = "ar";
    await api("PUT", "/api/settings", s);
    await page.goto(`${base}/?robot-debug`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.documentElement.dir === "rtl" && window.friendsRobot?.room?.id, { timeout: 60000 });
    await page.evaluate(() => import("/js/room/editor/open.js").then((m) => m.editRoom()));
    await editorOpen();
    assert.strictEqual(await page.$eval("#room-editor", (el) => getComputedStyle(el).direction), "rtl");
    assert.strictEqual(await page.$eval(".re-inspector .re-title", (el) => el.textContent), "الغرفة");
    // The catalog is on the right in right-to-left
    const [left, stage] = await Promise.all([page.$eval(".re-left", (el) => el.getBoundingClientRect().left), page.$eval(".re-stage", (el) => el.getBoundingClientRect().left)]);
    assert.ok(left > stage, "the catalog is on the right");
    // No English left in the editor's own words (names of the user's things excepted)
    const english = await page.evaluate(() => {
      const skip = new Set([document.querySelector("#room-editor .re-name")]);
      const words = [];
      for (const el of document.querySelectorAll("#room-editor .re-top button, #room-editor .re-tab, #room-editor .re-chip, #room-editor .re-inspector .rs-label, #room-editor .re-bottom button")) {
        if (skip.has(el)) continue;
        const text = el.textContent.trim();
        if (/[A-Za-z]{3,}/.test(text.replace(/16:9|9:16|Ctrl|Shift|PgUp|PgDn|Del|Q\/E/g, ""))) words.push(text);
      }
      return words;
    });
    assert.deepStrictEqual(english, []);
    await done();
    s.ui.language = "en";
    await api("PUT", "/api/settings", s);
  });

  test("no errors on the page", () => {
    assert.deepStrictEqual(problems, []);
  });
});
