// Friends 1.1 "The Room": the definition of done (friends-room-editor-prompt.md §14), item by item, in the real
// page. Each scenario is built through the same room modules the Room Editor uses, checked, and (with DOD_SHOTS
// set to a folder) photographed in the editor: npm run test:e2e, or
//   DOD_SHOTS=docs/design/screenshots/1.1/dod node --test test/e2e/definition-of-done.test.js
// Items 1, 8 (High at 60 fps on a real GPU), 9, 10 and 11 are checked by the other suites; see docs/release-1.1/PLAN.md.
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CHROME = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => p && fs.existsSync(p));
const SHOTS = process.env.DOD_SHOTS ? path.resolve(process.env.DOD_SHOTS) : null;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-e2e-dod-"));
process.env.FRIENDS_DATA_DIR = tempDir;
process.env.FRIENDS_VOICE_DIR = path.join(tempDir, "voice");
process.env.KEYRING_BACKEND = "file";
process.env.LOG_LEVEL = "error";
delete process.env.GEMINI_API_KEY;

describe("The definition of done (§14)", { skip: !CHROME && "no Chrome found" }, () => {
  let browser;
  let page;
  let server;
  let base;
  let roomId;
  const problems = [];
  const api = (method, url, body) => fetch(`${base}${url}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());

  // The room is built in the page with the editor's own modules, shown, and saved
  const inPage = (fn, arg) => page.evaluate(fn, arg);
  const editorOpen = () => page.waitForFunction(() => document.querySelector("#room-editor:not([hidden]) .re-stage canvas"), { timeout: 30000 });
  // The room in the editor (the engine draws it there); check(…) runs while it's open; a picture with DOD_SHOTS
  async function shoot(name, { view = "perspective", check = null, robot = false } = {}) {
    await inPage((withRobot) => import("/js/room/editor/open.js").then((m) => m.editRoom({ robot: withRobot })), robot);
    await editorOpen();
    if (view !== "perspective") await page.evaluate((v) => document.querySelector(`.re-views [data-view="${v}"]`)?.click(), view);
    await new Promise((r) => setTimeout(r, SHOTS ? 4000 : 1500));
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      await (await page.$("#room-editor .re-stage")).screenshot({ path: path.join(SHOTS, `${name}.png`) });
    }
    const result = check ? await inPage(check) : null;
    await page.evaluate(() => document.querySelector("#room-editor .re-top-end .btn-primary").click());
    await page.waitForFunction(() => !document.getElementById("room-editor"), { timeout: 10000 });
    return result;
  }

  before(async () => {
    const { start } = require("../../server/server");
    const settings = require("../../server/settings");
    settings.set({ ...settings.get(), onboarding: { done: true }, robot: { ...settings.get().robot, chatDock: false, quality: "low" } });
    server = start(0, "127.0.0.1");
    await new Promise((resolve) => (server.listening ? resolve() : server.on("listening", resolve)));
    base = `http://127.0.0.1:${server.address().port}`;
    // New room → Empty (medium, corner walls)
    roomId = (await api("POST", "/api/rooms", { template: "empty", name: "Done", size: "medium", walls: "corner" })).id;
    const s = await api("GET", "/api/settings");
    s.robot.room = { layoutId: roomId };
    await api("PUT", "/api/settings", s);
    browser = await require("puppeteer-core").launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--accept-lang=en-US,en", "--disable-gpu", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 860 });
    page.on("pageerror", (err) => problems.push(`page error: ${err.message}`));
    page.on("console", (msg) => msg.type() === "error" && !/Failed to load resource/.test(msg.text()) && problems.push(`console: ${msg.text()}`));
    await page.goto(`${base}/?robot-debug`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => window.friendsRobot?.room?.id, { timeout: 60000 });
    await inPage(async () => {
      window.dod = {
        ops: await import("/js/room/editor/ops.mjs"),
        RO: await import("/js/room/editor/robot-ops.mjs"),
        SC: await import("/js/room/editor/scenes.mjs"),
        History: (await import("/js/room/editor/history.mjs")).History,
        model: await import("/js/room/model.mjs"),
        nav: await import("/js/room/nav.mjs"),
        sched: await import("/js/room/schedule.mjs"),
        AI: await import("/js/room/ai.mjs"),
        B: (await import("/js/room/behaviour.mjs")).RoomBehaviour,
        catalog: await import("/js/room/catalog.mjs"),
      };
      // A run of the room's behaviour engine for so many seconds (what Simulate does, without waiting)
      window.dod.run = (room, seconds, ctx = {}, every = null) => {
        let seed = 9;
        const b = new window.dod.B({ random: () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646 });
        b.setRoom(room);
        for (let t = 0; t < seconds; t += 0.1) {
          b.tick(0.1, { now: new Date(2026, 10, 18, 12), ...ctx });
          every?.(b);
        }
        return b;
      };
    });
  });

  after(async () => {
    await browser?.close();
    await new Promise((resolve) => server?.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("2. building from an empty room: desk, chair, lamp and mug on the desk, picture and clock on the wall, rug, monstera; the desk carries what's on it; undo and redo every step; shadows", async () => {
    const out = await inPage(() => {
      const { ops, History, model } = window.dod;
      let r = window.friendsRobot.room;
      const h = new History();
      const ids = {};
      const step = (key, type, o) => {
        const before = r;
        const res = ops.addAsset(r, type, o);
        r = res.room;
        ids[key] = res.id;
        h.push(`Add ${type}`, before, r);
      };
      const back = -r.size.d / 2;
      step("desk", "desk_writing", { pos: [0.4, 0, back + 0.42] });
      step("chair", "chair_office", { pos: [0.4, 0, back + 1.05], rot: 180 });
      step("lamp", "lamp_desk", { pos: [0.85, 0.76, back + 0.35], parent: ids.desk });
      step("mug", "mug", { pos: [0.1, 0.76, back + 0.5], parent: ids.desk });
      step("picture", "frame_picture", { pos: [0.4, 1.55, back + 0.02], slot: "wall" });
      step("clock", "clock_wall", { pos: [1.4, 1.7, back + 0.02], slot: "wall" });
      step("rug", "rug_round", { pos: [0.4, 0, back + 1.1] });
      step("monstera", "monstera", { pos: [-r.size.w / 2 + 0.45, 0, back + 0.45] });
      // Moving the desk moves the lamp and the mug
      const at = (room, id) => model.worldTransform(room, room.assets.find((a) => a.id === id));
      const lampBefore = at(r, ids.lamp);
      const before = r;
      r = ops.nudge(r, [ids.desk], 0.3, 0.1);
      h.push("Move desk", before, r);
      const lampAfter = at(r, ids.lamp);
      const mugMoved = Math.abs(at(r, ids.mug).x - at(before, ids.mug).x - 0.3) < 0.01;
      // Undo every step, then redo every step
      let room = r;
      let undone = 0;
      for (let u; (u = h.undo(room)); undone++) room = u.room;
      const emptyAgain = room.assets.length === 0;
      let redone = 0;
      for (let u; (u = h.redo(room)); redone++) room = u.room;
      window.friendsRobot.setRoom(room);
      window.dod.ids = ids;
      return { count: room.assets.length, lampDx: lampAfter.x - lampBefore.x, lampDz: lampAfter.z - lampBefore.z, mugMoved, undone, redone, emptyAgain, sameAsBefore: JSON.stringify(room.assets) === JSON.stringify(r.assets) };
    });
    assert.strictEqual(out.count, 8);
    assert.ok(Math.abs(out.lampDx - 0.3) < 0.01 && Math.abs(out.lampDz - 0.1) < 0.01, `the lamp follows the desk: ${out.lampDx}, ${out.lampDz}`);
    assert.ok(out.mugMoved, "the mug follows the desk");
    assert.deepStrictEqual([out.undone, out.redone, out.emptyAgain, out.sameAsBefore], [9, 9, true, true]);
    // Saved, and drawn with soft shadows and contact shadows
    await page.waitForFunction(async (id) => (await (await fetch(`/api/rooms/${id}`)).json()).assets.length === 8, { timeout: 10000 }, roomId);
    const shadows = await shoot("2-built", {
      check: () => {
        const e = window.friendsRobot.engine;
        let cast = 0;
        e.rooms.assetGroup.traverse((o) => o.isMesh && o.castShadow && cast++);
        return { cast, decals: Boolean(e.rooms.decals) };
      },
    });
    assert.ok(shadows.cast > 0, "things cast shadows (from Medium up; Low draws contact shadows only)");
    assert.ok(shadows.decals, "contact shadows under things");
  });

  test("3. directing the robot: home by the window facing the desk; gaze at you while talking, at what it's doing otherwise", async () => {
    const out = await inPage(() => {
      const { ops, RO, model } = window.dod;
      let r = window.friendsRobot.room;
      const back = -r.size.d / 2;
      const win = ops.addAsset(r, "window_french", { pos: [-1.3, 1.1, back + 0.02], slot: "wall" });
      r = win.room;
      const desk = model.worldTransform(r, r.assets.find((a) => a.id === window.dod.ids.desk));
      const home = [-1.3, back + 0.7];
      const facing = (Math.atan2(desk.x - home[0], desk.z - home[1]) * 180) / Math.PI;
      r = RO.setHome(r, home[0], home[1], facing);
      r = { ...r, robot: { ...r.robot, gaze: { ...r.robot.gaze, talking: { ...r.robot.gaze.talking, mode: "you" }, idle: { ...r.robot.gaze.idle, mode: "task" } } } };
      r = model.sanitizeRoom(r);
      window.friendsRobot.setRoom(r);
      const idle = window.dod.run(r, 20);
      const talking = window.dod.run(r, 3, { state: "talking" });
      // Something to do (the desk): while idle it looks at it
      const busy = window.dod.run(r, 0.2);
      busy.command({ kind: "asset", id: window.dod.ids.desk, action: "touch", actor: "ai" });
      for (let t = 0; t < 2; t += 0.1) busy.tick(0.1, { now: new Date(2026, 10, 18, 12) });
      return { at: [idle.out.x, idle.out.z], home, yaw: idle.out.yaw, facing, idleGaze: busy.out.gaze.mode, gazePoint: busy.out.gaze.point, desk: [desk.x, desk.z], talkGaze: talking.out.gaze.mode };
    });
    assert.ok(Math.hypot(out.at[0] - out.home[0], out.at[1] - out.home[1]) < 0.3, `at home by the window: ${out.at} (home ${out.home})`);
    assert.ok(Math.abs(((out.yaw - out.facing + 540) % 360) - 180) < 15, `facing the desk: ${out.yaw} vs ${out.facing}`);
    assert.strictEqual(out.idleGaze, "task");
    assert.ok(Math.hypot(out.gazePoint[0] - out.desk[0], out.gazePoint[2] - out.desk[1]) < 0.8, `looking at the desk: ${out.gazePoint}`);
    assert.strictEqual(out.talkGaze, "you");
    await shoot("3-home-by-the-window");
  });

  test("4. zones and rules: a no-go zone round the monstera and the monstera set to Never; Simulate never goes there; the AI asking to water it is refused", async () => {
    const out = await inPage(() => {
      const { RO, model, nav, AI, ops } = window.dod;
      let r = window.friendsRobot.room;
      const m = r.assets.find((a) => a.id === window.dod.ids.monstera);
      r = RO.addZone(r, { kind: "nogo", shape: "circle", points: [[m.pos[0], m.pos[2]]], radius: 0.7 }).room;
      r = ops.updateAsset(r, m.id, { rules: { ...m.rules, permission: "never" } });
      r = model.sanitizeRoom({ ...r, robot: { ...r.robot, autonomy: { ...r.robot.autonomy, preset: "curious" }, movement: { ...r.robot.movement, freedom: "free" } } });
      window.friendsRobot.setRoom(r);
      const zone = r.robot.zones.at(-1);
      let inside = 0;
      const used = [];
      const b = window.dod.run(r, 600, {}, (beh) => nav.pointInZone(zone, beh.pos[0], beh.pos[1]) && inside++);
      b.onAction = (a) => used.push(a.assetId);
      const refusal = AI.robotCommand(r, "robot_use", { asset: "monstera", action: "water" });
      return { inside, visitedMonstera: b.visits.per.has(m.id) && b.visits.per.get(m.id).length > 0, refusal, log: b.log.map((e) => e.key) };
    });
    assert.strictEqual(out.inside, 0, "never inside the no-go zone");
    assert.strictEqual(out.visitedMonstera, false);
    assert.strictEqual(out.refusal.ok, false);
    assert.match(out.refusal.error, /not allowed/i);
    // (zones show while the robot is selected)
    await shoot("4-no-go-zone", { view: "top", robot: true });
  });

  test("5. posture: with the sofa as 'sit while idle' it sits on the sofa when idle and gets up to talk", async () => {
    const out = await inPage(() => {
      const { ops, model } = window.dod;
      let r = window.friendsRobot.room;
      const sofa = ops.addAsset(r, "sofa", { pos: [1.2, 0, 0.9], rot: 180 });
      r = sofa.room;
      window.dod.ids.sofa = sofa.id;
      // (a calm robot: a curious one goes visiting when idle instead of settling)
      r = model.sanitizeRoom({ ...r, robot: { ...r.robot, autonomy: { ...r.robot.autonomy, preset: "calm" }, posture: { ...r.robot.posture, idle: { kind: "sit", asset: sofa.id }, talking: { kind: "stand", asset: null } } } });
      window.friendsRobot.setRoom(r);
      let seed = 5;
      const b = new window.dod.B({ random: () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646 });
      b.setRoom(r);
      const now = new Date(2026, 10, 18, 12);
      for (let t = 0; t < 40; t += 0.1) b.tick(0.1, { now });
      const idle = b.out.posture.kind;
      for (let t = 0; t < 4; t += 0.1) b.tick(0.1, { now, state: "talking" });
      return { idle, talking: b.out.posture.kind };
    });
    assert.strictEqual(out.idle, "sit");
    assert.strictEqual(out.talking, "stand");
  });

  test("6. scenes: 'Work' (desk lamp on, home at the desk) by day and 'Chill' (the sofa, a warm mood) after 19:00 switch on by themselves", async () => {
    const out = await inPage(() => {
      const { SC, sched, model } = window.dod;
      let r = window.friendsRobot.room;
      const { ids } = window.dod;
      let w = SC.addScene(r, "Work");
      r = SC.updateScene(w.room, w.id, { when: { kind: "schedule", from: "08:00", to: "19:00", weekdays: [] } });
      r = SC.setLamp(r, w.id, ids.lamp, true);
      r = { ...r, scenes: r.scenes.map((s) => (s.id === w.id ? { ...s, overrides: { ...s.overrides, home: { pos: [0.4, 0, -r.size.d / 2 + 1.0], facing: 180 } } } : s)) };
      const c = SC.addScene(r, "Chill");
      r = SC.updateScene(c.room, c.id, { when: { kind: "schedule", from: "19:00", to: "23:59", weekdays: [] } });
      r = { ...r, scenes: r.scenes.map((s) => (s.id === c.id ? { ...s, overrides: { ...s.overrides, mood: "warm_lamp", posture: { idle: { kind: "sit", asset: ids.sofa } } } } : s)) };
      r = model.sanitizeRoom({ ...r, activeScene: "auto" });
      window.friendsRobot.setRoom(r);
      const day = sched.effectiveRoom(r, { now: new Date(2026, 10, 18, 10) });
      const evening = sched.effectiveRoom(r, { now: new Date(2026, 10, 18, 20, 30) });
      const lamp = (eff) => eff.room.assets.find((a) => a.id === ids.lamp).state.on;
      return { day: day.scene?.name, lampDay: lamp(day), homeDay: day.room.robot.home.pos, evening: evening.scene?.name, mood: evening.room.atmosphere.mood, sitEvening: evening.room.robot.posture.idle };
    });
    assert.strictEqual(out.day, "Work");
    assert.strictEqual(out.lampDay, true);
    assert.deepStrictEqual(out.homeDay, [0.4, 0, -1], "home at the desk");
    assert.strictEqual(out.evening, "Chill");
    assert.strictEqual(out.mood, "warm_lamp");
    assert.strictEqual(out.sitEvening.kind, "sit");
    await shoot("6-scenes");
  });

  test("7. custom models: a Blender chair with sit_ and anchor_robot_stand comes in through the wizard, stands on the floor at its size, and the robot can sit on it", async () => {
    const b64 = await inPage(async () => {
      const THREE = await import("three");
      const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
      const g = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ name: "c1", color: "#b07a4a" });
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), wood);
      seat.position.y = 0.45;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), wood);
      back.position.set(0, 0.72, -0.225);
      g.add(seat, back);
      for (const [x, z] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), wood);
        leg.position.set(x, 0.225, z);
        g.add(leg);
      }
      const sitNode = new THREE.Object3D();
      sitNode.name = "sit_seat";
      sitNode.position.set(0, 0.48, 0);
      const stand = new THREE.Object3D();
      stand.name = "anchor_robot_stand";
      stand.position.set(0, 0, 0.6);
      g.add(sitNode, stand);
      const buf = await new GLTFExporter().parseAsync(g, { binary: true });
      return btoa(String.fromCharCode(...new Uint8Array(buf)));
    });
    const file = path.join(tempDir, "blender-chair.glb");
    fs.writeFileSync(file, Buffer.from(b64, "base64"));
    await inPage(() => import("/js/room/editor/open.js").then((m) => m.editRoom()));
    await editorOpen();
    await page.evaluate(() => document.querySelector('.re-chip[data-cat="mine"]').click());
    await page.waitForSelector(".re-add-model");
    await page.evaluate(() => document.querySelector(".re-add-model").click());
    await page.waitForSelector(".re-wizard input[type=file]");
    await (await page.$(".re-wizard input[type=file]")).uploadFile(file);
    await page.waitForSelector(".re-wiz-details:not([hidden])", { timeout: 20000 });
    await page.evaluate(() => [...document.querySelectorAll(".re-wizard .btn-primary")].at(-1).click());
    await page.waitForFunction(() => !document.querySelector(".re-wizard"), { timeout: 20000 });
    await page.evaluate(() => document.querySelector("#room-editor .re-top-end .btn-primary").click());
    await page.waitForFunction(() => !document.getElementById("room-editor"), { timeout: 10000 });
    const entry = (await api("GET", "/api/room-assets")).assets.find((e) => e.label === "blender chair");
    assert.ok(entry, "imported");
    assert.ok(entry.actions.includes("sit"), "its sit_ node made it a seat");
    assert.ok(entry.anchors.sit && Math.abs(entry.anchors.sit[1] - 0.48) < 0.02, JSON.stringify(entry.anchors));
    assert.ok(Math.abs(entry.height - 0.97) < 0.03 && Math.abs(entry.footprint.w - 0.5) < 0.03, `its own size: ${entry.height} × ${entry.footprint.w}`);
    const out = await inPage(async (id) => {
      await (await import("/js/room/custom.js")).loadCustomModels();
      const { ops, model } = window.dod;
      let r = window.friendsRobot.room;
      const res = ops.addAsset(r, `custom:${id}`, { pos: [-1.0, 0, 0.6], def: window.dod.catalog.entryFor(`custom:${id}`) });
      r = model.sanitizeRoom(res.room, { custom: window.dod.catalog.customEntries() });
      window.friendsRobot.setRoom(r);
      const placed = r.assets.find((a) => a.id === res.id);
      let seed = 3;
      const b = new window.dod.B({ random: () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646 });
      b.setRoom(r);
      const cmd = b.command({ kind: "posture", posture: "sit", id: res.id });
      for (let t = 0; t < 30; t += 0.1) b.tick(0.1, { now: new Date(2026, 10, 18, 12) });
      return { y: placed?.pos[1], slot: placed?.slot, cmd, posture: b.out.posture.kind, seatY: b.out.posture.point?.[1] };
    }, entry.id);
    assert.deepStrictEqual([out.slot, out.y], ["floor", 0], "on the floor");
    assert.strictEqual(out.cmd.ok, true);
    assert.strictEqual(out.posture, "sit");
    assert.ok(Math.abs(out.seatY - 0.48) < 0.05, `sits at the seat's height: ${out.seatY}`);
    await shoot("7-custom-chair");
  });

  test("8. the Low tier on software WebGL draws the room without errors", async () => {
    const info = await inPage(() => ({ level: window.friendsRobot.engine.level, mode: window.friendsRobot.engine.rooms.mode }));
    assert.strictEqual(info.level, "low");
    assert.deepStrictEqual(problems, []);
  });
});
