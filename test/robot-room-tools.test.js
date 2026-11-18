// The AI's robot tools on the helper: checked against the room the robot is in (the rooms store), refusals the
// AI can say, the 1.0 names still working, and room_edit under "AI may rearrange" (never, ask first, allowed).
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-robot-tools-"));
process.env.FRIENDS_DATA_DIR = tempDir;
process.env.KEYRING_BACKEND = "file";
process.env.LOG_LEVEL = "error";

describe("The AI's robot tools on the helper", () => {
  let settings;
  let rooms;
  let tools;
  let roomContext;
  let roomId;
  before(() => {
    settings = require("../server/settings");
    rooms = require("../server/rooms");
    tools = require("../server/tools");
    roomContext = require("../server/core/ai/room-context");
    const doc = rooms.create({ template: "lounge" });
    roomId = doc.id;
    // The fireplace is look-only
    const fire = doc.assets.find((a) => a.type === "fireplace");
    rooms.save(roomId, { ...doc, assets: doc.assets.map((a) => (a.id === fire.id ? { ...a, rules: { ...a.rules, permission: "look" } } : a)) });
    const base = settings.get();
    settings.set({ ...base, robot: { ...base.robot, room: { layoutId: roomId }, aiGestures: { voice: true, chat: true } } });
  });
  after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const run = async (name, args, extra = {}) => {
    const events = [];
    const result = await tools.run(name, args, { settings: settings.get(), onRobot: (e) => events.push(e), onActivity: () => {}, ...extra });
    return { result, events };
  };

  test("going, using and sitting: checked against the room, sent to the page as room commands", async () => {
    let r = await run("robot_go_to", { target: "fireplace" });
    assert.deepEqual(r.result, { ok: true });
    assert.equal(r.events[0].room.kind, "asset");
    r = await run("robot_use", { asset: "floor lamp" });
    assert.equal(r.events[0].room.action, "use");
    r = await run("robot_use", { asset: "fireplace", action: "touch" });
    assert.match(r.result.error, /only allowed to look at the Fireplace/);
    assert.equal(r.events.length, 0);
    r = await run("robot_posture", { posture: "sit" });
    assert.equal(r.events[0].room.posture, "sit");
    r = await run("robot_look_at", { target: "you" });
    assert.equal(r.events[0].lookAt.target, "user");
    r = await run("robot_go_to", { target: "the moon" });
    assert.match(r.result.error, /nothing called "the moon".*Things here/);
  });

  test("the 1.0 names still work", async () => {
    let r = await run("return_home", {});
    assert.equal(r.events[0].room.kind, "home");
    r = await run("robot_use_prop", { prop: "lamp", action: "toggle" });
    assert.equal(r.events[0].room.action, "use");
    r = await run("set_emotion", { emotion: "happy" });
    assert.equal(r.events[0].mood, "happy");
  });

  test("room_edit: never, ask first (no and yes), without asking", async () => {
    const set = (rearrange) => {
      const s = settings.get();
      settings.set({ ...s, robot: { ...s.robot, ai: { ...s.robot.ai, rearrange } } });
    };
    const lamp = () => rooms.get(roomId).assets.find((a) => a.type === "lamp_floor");
    const before = lamp().pos;
    set("off");
    let r = await run("room_edit", { changes: [{ op: "move", asset: "floor lamp", to: "left" }] });
    assert.match(r.result.error, /doesn't let you rearrange/);
    set("ask");
    r = await run("room_edit", { changes: [{ op: "move", asset: "floor lamp", to: "left" }] }, { confirm: async () => false });
    assert.match(r.result.error, /said no/);
    assert.deepEqual(lamp().pos, before);
    let asked = "";
    r = await run("room_edit", { changes: [{ op: "move", asset: "floor lamp", to: "left" }] }, { confirm: async (summary) => ((asked = summary), true) });
    assert.match(asked, /moved the Floor lamp/);
    assert.deepEqual(r.result.done, ["moved the Floor lamp"]);
    assert.ok(lamp().pos[0] < before[0]);
    // The proposed room was shown while it asked, then the preview ended, then the room changed
    assert.ok(r.events[0].roomPreview.room.assets.find((a) => a.type === "lamp_floor").pos[0] < before[0]);
    assert.equal(r.events[1].roomPreview.end, true);
    assert.deepEqual(r.events[2].roomChanged.done, [{ key: "moved the {name}", vars: { name: "Floor lamp" } }]);
    set("allowed");
    r = await run("room_edit", { changes: [{ op: "remove", asset: "spaceship" }] });
    assert.match(r.result.error, /No "spaceship"/);
    r = await run("room_edit", { changes: [{ op: "recolor", asset: "floor lamp", c1: "#112233" }] });
    assert.equal(r.result.ok, true);
  });

  test("Describe a room: the AI for small jobs is asked with catalog ids only; its layout comes back placed", async () => {
    const brains = require("../server/brains");
    const real = brains.forTask;
    let asked = "";
    brains.forTask = () => ({ key: "", model: "fake", api: { generateText: async ({ prompt }) => ((asked = prompt), '{"things":[{"type":"sofa","x":-1.5,"z":-1.5,"rot":0},{"type":"monstera","x":2,"z":-1.8}]}') } });
    const server = require("../server/server").start(0, "127.0.0.1");
    await new Promise((r) => (server.listening ? r() : server.on("listening", r)));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const res = await fetch(`${base}/api/rooms/${roomId}/describe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "a plant corner" }) });
      const out = await res.json();
      assert.equal(res.status, 200, JSON.stringify(out));
      assert.deepEqual(out.assets.map((a) => a.type).sort(), ["monstera", "sofa"]);
      assert.match(asked, /"""a plant corner"""/);
      assert.ok(!/photo_frame|calendar_wall/.test(asked), "no personal-data things in the prompt");
      // Switched off; no AI
      const s = settings.get();
      settings.set({ ...s, robot: { ...s.robot, ai: { ...s.robot.ai, describe: false } } });
      const off = await fetch(`${base}/api/rooms/${roomId}/describe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "x" }) });
      assert.equal(off.status, 403);
      settings.set(s);
      brains.forTask = () => null;
      const none = await fetch(`${base}/api/rooms/${roomId}/describe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "x" }) });
      assert.equal(none.status, 409);
      assert.match((await none.json()).error, /no AI set up/);
    } finally {
      brains.forTask = real;
      await new Promise((r) => server.close(r));
    }
  });

  test("the room block every provider gets: from the room the robot is in, and how it is", () => {
    roomContext.update({ where: "by the \"Fireplace\"", doing: "", posture: "stand" });
    const block = roomContext.formatPromptBlock();
    assert.match(block, /Room "Living room"/);
    assert.match(block, /"Fireplace".*look only/);
    assert.match(block, /Right now you're by the "Fireplace"/);
    const s = settings.get();
    assert.equal(roomContext.formatPromptBlock(undefined, { settings: { ...s, robot: { ...s.robot, ai: { ...s.robot.ai, context: "none" } } } }), "");
    const names = roomContext.formatPromptBlock(undefined, { settings: { ...s, robot: { ...s.robot, ai: { ...s.robot.ai, context: "names" } } } });
    assert.ok(!/you may|look only|Right now/.test(names), names);
  });
});
