// Voice mode's toolbar (voice/dock-model.mjs): the saved layout from 1.0 keeps working, presets, moving a button,
// keys, what the menus offer (the room's things by their rules, spots, shots, scenes), and 1.0's stage settings
// becoming the room's. And the robot's gaze never turns into NaN (it used to, on its first frame in voice mode).
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const M = require("../src/js/voice/dock-model.mjs");
const templates = require("../src/js/room/templates.mjs");
const ops = require("../src/js/room/editor/ops.mjs");
const { newId } = require("../src/js/room/model.mjs");
const { RoomBehaviour } = require("../src/js/room/behaviour.mjs");
const { Animator } = require("../src/js/robot/animator.mjs");

const lounge = () => templates.templateRoom("lounge");

describe("The toolbar's layout", () => {
  test("a fresh layout has every module once, the creator preset, a rail beside the robot", () => {
    const d = M.sanitizeDock(null);
    assert.deepEqual(d.order, M.MODULE_IDS);
    assert.equal(d.preset, "creator_stage");
    assert.equal(d.position, "left");
    assert.deepEqual(d.shortcuts, { ...Object.fromEntries(M.MODULE_IDS.map((id) => [id, ""])), ...M.DEFAULT_SHORTCUTS });
  });

  test("a 1.0 layout keeps its order, choices and keys; its two dead switches are dropped", () => {
    const v1 = {
      preset: "custom", position: "right", showLabels: true,
      order: ["open_studio", "mic_mode", "mic_mute", "vision_toggle", "clean_stage"],
      visible: { open_studio: false, mic_mode: true, vision_toggle: true, clean_stage: true },
      shortcuts: { mic_mute: "KeyM", summon_home: "KeyR", clean_stage: "KeyH", roam_toggle: "KeyR" },
    };
    const d = M.sanitizeDock(v1);
    assert.equal(d.position, "right");
    assert.equal(d.showLabels, true);
    assert.equal(d.order.includes("mic_mode") || d.order.includes("vision_toggle"), false);
    assert.equal(d.order.indexOf("open_studio"), 0, "its own order first");
    assert.ok(d.order.indexOf("mic_mute") < d.order.indexOf("clean_stage"));
    assert.ok(d.order.indexOf("interrupt") === d.order.indexOf("mic_mute") + 1, "a module it didn't know joins next to its neighbour");
    assert.equal(d.visible.open_studio, false);
    assert.equal(d.shortcuts.mic_mute, "", "M already mutes in voice mode");
    assert.equal(d.shortcuts.summon_home, "KeyR");
    assert.equal(d.shortcuts.roam_toggle, "", "a key used twice keeps its first module");
    assert.equal(M.wasRemoved("mic_mode"), true);
  });

  test("presets, moving a button, keys", () => {
    let d = M.applyPreset(M.sanitizeDock(null), "minimal");
    assert.equal(d.visible.summon_home, false);
    assert.equal(d.visible.clean_stage, true);
    d = M.moveModule(d, "interrupt", -1);
    assert.equal(d.order[0], "interrupt");
    assert.equal(d.preset, "custom");
    assert.equal(M.moveModule(d, "interrupt", -1), d, "the first can't go further");
    assert.equal(M.moduleForKey(M.sanitizeDock(null), "KeyH"), "clean_stage");
    assert.equal(M.moduleForKey(M.sanitizeDock(null), "KeyM"), null);
    assert.equal(M.validKey("KeyF"), false);
    assert.equal(M.validKey("Digit3"), true);
    assert.equal(M.moduleForKey({ ...M.sanitizeDock(null), visible: { ...M.sanitizeDock(null).visible, clean_stage: false } }, "KeyH"), null, "a hidden button's key does nothing");
  });
});

describe("What the menus offer", () => {
  test("things: only what the thing's own rules allow when you ask, never look-only or Never", () => {
    let room = lounge();
    const items = M.propItems(room);
    assert.ok(items.length > 0);
    assert.ok(items.every((x) => x.action !== "look"));
    const first = items[0];
    room = ops.updateAsset(room, first.id, { rules: { ...room.assets.find((a) => a.id === first.id).rules, permission: "never" } });
    assert.equal(M.propItems(room).some((x) => x.id === first.id), false);
    const hidden = ops.updateAsset(lounge(), first.id, { hidden: true });
    assert.equal(M.propItems(hidden).some((x) => x.id === first.id), false);
    // The lounge's tall bookcase stands where the robot can't get to it: not offered
    assert.equal(M.propItems(lounge()).some((x) => x.id === "bookcase"), false);
  });

  test("spots, scenes, and shots: saved ones first, ready-made ones join the room when picked", () => {
    const room = lounge();
    assert.equal(M.spotItems(room)[0].kind, "home");
    assert.equal(M.sceneItems(room)[0].id, "auto");
    const cams = M.cameraItems(room, (k, v) => k.replace(/\{(\w+)\}/g, (_, x) => v[x]));
    assert.equal(cams[0].id, "auto");
    const preset = cams.find((c) => c.preset);
    const next = M.withPresetShot(room, preset.preset, newId);
    assert.equal(next.cameras.length, room.cameras.length + 1);
    assert.equal(next.defaultCamera, next.cameras.at(-1).id);
  });

  test("1.0's stage backdrop and camera become the room's, once", () => {
    const room = lounge();
    const say = (k, v) => k.replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? "");
    assert.equal(M.stageIntoRoom(room, { backdrop: "full_room", cameraPreset: "wide_room" }, say, newId), null);
    const green = M.stageIntoRoom(room, { backdrop: "chroma_green", cameraPreset: "wide_room" }, say, newId);
    assert.equal(green.backdrop.layer, "chroma_green");
    const solid = M.stageIntoRoom(room, { backdrop: "solid_studio", solidColor: "#223344" }, say, newId);
    assert.deepEqual([solid.backdrop.layer, solid.backdrop.color], ["solid", "#223344"]);
    const follow = M.stageIntoRoom(room, { backdrop: "full_room", cameraPreset: "follow_robot" }, say, newId);
    assert.equal(follow.cameras.at(-1).follow, "follow");
    assert.equal(follow.defaultCamera, follow.cameras.at(-1).id);
    // A room that has its own backdrop already keeps it
    assert.equal(M.stageIntoRoom({ ...room, backdrop: { ...room.backdrop, layer: "solid" } }, { backdrop: "chroma_blue" }, say, newId), null);
  });
});

describe("The robot's gaze stays a number", () => {
  test("before its room is known, the behaviour's gaze carries its weights", () => {
    const g = new RoomBehaviour().out.gaze;
    for (const k of ["headWeight", "eyeWeight", "headLimit"]) assert.ok(Number.isFinite(g[k]), k);
  });

  test("a room pose with a gaze missing its weights doesn't break the animator", () => {
    const a = new Animator({ random: () => 0.5 });
    a.setRoomPose({ x: 0, z: 0, yaw: 0, posture: { kind: "stand" }, gaze: { mode: "you", point: null }, speed: 0, turnRate: 0 });
    let pose;
    for (let i = 0; i < 20; i++) pose = a.update(i ? 0.05 : 0);
    const bad = Object.entries(pose).filter(([, v]) => typeof v === "number" && !Number.isFinite(v)).map(([k]) => k);
    assert.deepEqual(bad, []);
  });
});
