const { test, describe, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("Robot settings are kept, checked and repaired", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-robot-settings-test-"));
  process.env.FRIENDS_DATA_DIR = tempDir;

  const settings = require("../server/settings");

  after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  test("defaults: the robot is set up for voice mode, AI gestures only there", () => {
    const r = settings.get().robot;
    assert.strictEqual(r.chatDock, true);
    assert.strictEqual(r.design.colors.head, "#ede4d6");
    assert.strictEqual(r.design.face.mouth, "line");
    assert.strictEqual(r.design.face.eyes, "classic");
    assert.strictEqual(r.room.place, "studio");
    assert.deepStrictEqual(r.looks, []);
    assert.strictEqual(r.shot, "medium");
    assert.strictEqual(r.position, "center");
    assert.strictEqual(r.seat, "front");
    assert.strictEqual(r.followFace, false);
    assert.strictEqual(r.cinematic, false);
    assert.strictEqual(r.roam, true);
    assert.strictEqual(r.world, true);
    assert.deepStrictEqual(r.aiGestures, { voice: true, chat: false });
    assert.deepStrictEqual(r.aiAllowed, { mood: true, gesture: true, prop: true, move: true, look: true });
    assert.strictEqual(r.interactive, true);
    assert.strictEqual(r.nameTag, false);
    assert.strictEqual(r.smartMoods, false);
    assert.strictEqual(r.quality, "auto");
    assert.deepStrictEqual(r.filming, { delay: 3, cameraFriendly: true, largeCaptions: false, largerFace: false });
  });

  test("every robot choice is saved when it's valid", () => {
    const input = {
      robot: {
        chatDock: false, customRooms: [], cameraMoves: [], shot: "close",
        position: "left", seat: "right", followFace: true, eyesFollowCursor: false, cinematic: true, roam: false, world: false, aiGestures: { voice: false, chat: true },
        smartMoods: true, quality: "high", voicePlace: { x: 0.2, y: -0.1, scale: 1.4 },
        aiAllowed: { mood: false, gesture: true, prop: false, move: true, look: true }, interactive: false, nameTag: true,
        sound: { enabled: true, volume: 80, pitch: 1.2, blips: false, servos: true, emotes: true, ambience: false, recordMix: true },
        reactions: { mission: false, reminder: true, notifications: false, taskDone: true, habitStreak: false, timeOfDay: true, userReturn: false },
        filming: { delay: 10, cameraFriendly: false, largeCaptions: true, largerFace: true },
      },
    };
    const saved = settings.set(input).robot;
    const { design, room, looks, ...rest } = saved;
    assert.deepStrictEqual(rest, input.robot);
    assert.deepStrictEqual(design, settings.DEFAULTS.robot.design);
    assert.deepStrictEqual(room, settings.DEFAULTS.robot.room);
    assert.deepStrictEqual(looks, []);
    const onDisk = JSON.parse(fs.readFileSync(path.join(tempDir, "settings.json"), "utf8")).robot;
    assert.deepStrictEqual(onDisk, saved);
  });

  test("unknown choices fall back to the defaults", () => {
    const r = settings.set({
      robot: {
        design: { colors: { head: "gold" }, face: { eyes: "laser" } }, room: { place: "https://evil.example/bg.png" }, shot: "extreme", position: "top",
        seat: "behind", quality: "ultra",
      },
    }).robot;
    assert.strictEqual(r.design.colors.head, "#ede4d6");
    assert.strictEqual(r.design.face.eyes, "classic");
    assert.strictEqual(r.room.place, "studio");
    assert.strictEqual(r.shot, "medium");
    assert.strictEqual(r.position, "center");
    assert.strictEqual(r.seat, "front");
    assert.strictEqual(r.quality, "auto");
  });

  test("wrong types are dropped: a string isn't a switch, an object isn't a choice", () => {
    const r = settings.set({
      robot: {
        chatDock: "yes", design: { face: { mouth: 1, eyes: { evil: true } } }, followFace: "true", aiGestures: "all",
        filming: { delay: "5", cameraFriendly: null, largeCaptions: [] },
      },
    }).robot;
    assert.strictEqual(r.chatDock, true);
    assert.strictEqual(r.design.face.mouth, "line");
    assert.strictEqual(r.followFace, false);
    assert.strictEqual(r.design.face.eyes, "classic");
    assert.deepStrictEqual(r.aiGestures, { voice: true, chat: false });
    assert.strictEqual(r.filming.delay, 3);
    assert.strictEqual(r.filming.cameraFriendly, true);
    assert.strictEqual(r.filming.largeCaptions, false);
  });

  test("the start delay snaps to 0, 3, 5 or 10 seconds", () => {
    const delay = (d) => settings.set({ robot: { filming: { delay: d } } }).robot.filming.delay;
    assert.strictEqual(delay(0), 0);
    assert.strictEqual(delay(4), 3);
    assert.strictEqual(delay(4.6), 5);
    assert.strictEqual(delay(8), 10);
    assert.strictEqual(delay(600), 10);
    assert.strictEqual(delay(-7), 0);
    assert.strictEqual(delay(Number.NaN), 3);
  });

  test("keys the robot doesn't know are not stored", () => {
    const r = settings.set({ robot: { script: "<img onerror=alert(1)>", filming: { extra: 1 } } }).robot;
    assert.strictEqual(r.script, undefined);
    assert.strictEqual(r.filming.extra, undefined);
  });

  test("older settings files without the robot get its defaults", () => {
    fs.writeFileSync(path.join(tempDir, "settings.json"), JSON.stringify({ theme: { appearance: "dark", accent: "#34d399" } }));
    const fresh = settings.sanitize(JSON.parse(fs.readFileSync(path.join(tempDir, "settings.json"), "utf8")));
    assert.deepStrictEqual(fresh.robot, settings.DEFAULTS.robot);
    assert.strictEqual(fresh.theme.accent, "#34d399");
  });
  test("every whiteboard choice is kept when valid, and a bad one falls back", () => {
    const wb = settings.DEFAULTS.whiteboard;
    const good = {
      enabled: true, aiDrawing: false, awareness: "onRequest", reactToEdits: "comment", initiative: "proactive", followRobot: false, showRobotCursor: false,
      voiceOpen: "manual", voiceAutoHide: 30, writingStyle: "chalk", dockTheme: "midnight", robotWindow: false, inspector: false,
      markerColor: "#112233", markerSize: 8, gridSize: 40, showInFilming: false, showInRecordings: false,
    };
    const saved = settings.set({ whiteboard: good }).whiteboard;
    for (const [k, v] of Object.entries(good)) {
      assert.deepStrictEqual(saved[k], v, k);
    }
    const bad = settings.set({
      whiteboard: { dockTheme: "plaid", markerColor: "red; x", markerSize: 9999, gridSize: 3, voiceAutoHide: 7777 },
    }).whiteboard;
    assert.strictEqual(bad.dockTheme, wb.dockTheme);
    assert.strictEqual(bad.markerColor, wb.markerColor);
    assert.strictEqual(bad.markerSize, 32);
    assert.strictEqual(bad.gridSize, 12);
    assert.strictEqual(bad.voiceAutoHide, 300, "any time becomes the nearest one on offer");
    settings.set({ whiteboard: wb });
  });

  test("the AI's body moves are offered and run only where the user allows them", () => {
    const tools = require("../server/tools");
    const base = settings.get();
    const on = { ...base, robot: { ...base.robot, aiGestures: { voice: true, chat: true } } };
    const names = (s) => tools.declarations(s, { voice: true, robot: true }).map((t) => t.name).filter((n) => n.startsWith("robot_"));
    assert.deepStrictEqual(names(on).sort(), ["robot_gesture", "robot_go_to", "robot_look_at", "robot_mood", "robot_use_prop"]);
    const some = { ...on, robot: { ...on.robot, aiAllowed: { mood: false, gesture: true, prop: false, move: true, look: true } } };
    assert.deepStrictEqual(names(some).sort(), ["robot_gesture", "robot_go_to", "robot_look_at"]);
    assert.strictEqual(tools.robotAllowed(some, "robot_mood"), false);
    assert.strictEqual(tools.robotAllowed(some, "robot_gesture"), true);
    assert.strictEqual(tools.robotAllowed(some, "robot_go_to"), true);
  });
});
