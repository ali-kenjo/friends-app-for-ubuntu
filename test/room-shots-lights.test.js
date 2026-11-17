// Camera shots of a room (fixed, follow, auto-frame, measured from a thing) and lamps' own settings
// (brightness, color, on by itself at dusk).
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const model = require("../src/js/room/model.mjs");
const ops = require("../src/js/room/editor/ops.mjs");
const templates = require("../src/js/room/templates.mjs");
const cams = require("../src/js/room/cameras.mjs");
const { effectiveRoom, roomIsDark } = require("../src/js/room/schedule.mjs");

const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;
const lounge = () => templates.templateRoom("lounge");

describe("Camera shots", () => {
  test("a shot measured from a thing moves and turns with it, and is unavailable while it's hidden or gone", () => {
    let room = ops.addAsset(templates.templateRoom("empty"), "desk_writing", { pos: [1, 0, -1] }).room;
    const desk = room.assets.at(-1).id;
    const shot = { id: "s", name: "Desk", pos: [0, 1.4, 1.5], target: [0, 0.7, 0], fov: 34, follow: "fixed", relative: desk };
    room = model.sanitizeRoom({ ...room, cameras: [shot], defaultCamera: "s" });
    assert.equal(room.defaultCamera, "s");
    const a = cams.resolveShot(room, room.cameras[0]);
    assert.ok(near(a.pos[0], 1) && near(a.pos[2], 0.5) && near(a.target[2], -1), JSON.stringify(a));
    // Turned 90°: the camera swings round with the desk
    room = ops.rotateBy(room, [desk], 90);
    const b = cams.resolveShot(room, room.cameras[0]);
    assert.ok(near(b.pos[0], 2.5) && near(b.pos[2], -1), JSON.stringify(b));
    assert.equal(cams.resolveShot(room, room.cameras[0], { hidden: new Set([desk]) }), null);
    room = ops.removeAssets(room, [desk]);
    assert.equal(cams.usableShots(room).length, 0);
    // The model drops a default camera that no longer exists; "auto" is the robot's own framing
    assert.equal(model.sanitizeRoom({ ...room, cameras: [], defaultCamera: "s" }).defaultCamera, "auto");
  });

  test("follow keeps its offset to the robot; auto-frame stays put, aims at the robot and fits it", () => {
    const follow = cams.shotFrame({ pos: [0, 1, 2], target: [0, 0.7, 0], fov: 30, follow: "follow" }, { robot: [1, -0.5], home: [0, 0] });
    assert.deepEqual(follow.pos, [1, 1, 1.5]);
    assert.deepEqual(follow.target, [1, 0.7, -0.5]);
    const far = cams.shotFrame({ pos: [0, 1.5, 6], target: [0, 0, 0], fov: 30, follow: "auto" }, { robot: [0, 0], height: 1.2 });
    const close = cams.shotFrame({ pos: [0, 1.5, 2], target: [0, 0, 0], fov: 30, follow: "auto" }, { robot: [0, 0], height: 1.2 });
    assert.deepEqual(far.pos, [0, 1.5, 6]);
    assert.ok(near(far.target[1], 1.2 * 0.62));
    assert.ok(far.fov < close.fov, "further away, a longer lens");
    assert.ok(far.fov >= 14 && close.fov <= 60);
  });

  test("presets: the whole room, eye level, auto-frame, and shots at the room's main things", () => {
    const room = lounge();
    const list = cams.shotPresets(room);
    assert.deepEqual(list.slice(0, 3).map((p) => p.follow), ["fixed", "follow", "auto"]);
    const at = list.filter((p) => p.relative);
    assert.ok(at.length >= 1, "at least one thing to film at");
    for (const p of at) assert.ok(room.assets.some((a) => a.id === p.relative));
    // Each preset is a valid shot once it's in the room
    const clean = model.sanitizeRoom({ ...room, cameras: list.map(({ key, ...p }, i) => ({ id: `p${i}`, ...p, key })) });
    assert.equal(clean.cameras.length, list.length);
    assert.equal(cams.usableShots(clean).length, list.length);
  });
});

describe("Lamps", () => {
  test("a lamp keeps its own brightness and color; other things have no light settings", () => {
    let room = model.sanitizeRoom(ops.addAsset(templates.templateRoom("empty"), "lamp_floor", { pos: [0, 0, -1] }).room);
    const lamp = room.assets.at(-1);
    assert.deepEqual(lamp.light, { intensity: 1, color: null, auto: "manual" });
    room = model.sanitizeRoom(ops.updateAsset(room, lamp.id, { light: { intensity: 9, color: "#9FC6FF", auto: "dusk" } }));
    assert.deepEqual(room.assets.find((a) => a.id === lamp.id).light, { intensity: 2, color: "#9fc6ff", auto: "dusk" });
    const mug = ops.addAsset(room, "mug", { pos: [0, 0, 0] });
    assert.equal(model.sanitizeRoom(mug.room).assets.find((a) => a.id === mug.id).light, null);
  });

  test("a lamp set to dusk is on when the room is dark and off in daylight; a scene's switch wins", () => {
    let room = ops.addAsset(templates.templateRoom("empty"), "lamp_floor", { pos: [0, 0, -1] }).room;
    const id = room.assets.at(-1).id;
    room = model.sanitizeRoom(ops.updateAsset(room, id, { light: { intensity: 1, color: null, auto: "dusk" } }));
    const at = (hour, timeMode = "manual") => model.sanitizeRoom({ ...room, atmosphere: { ...room.atmosphere, timeMode, timeHour: hour } });
    const on = (r, now) => effectiveRoom(r, { now }).room.assets.find((a) => a.id === id).state.on;
    assert.equal(on(at(13)), false);
    assert.equal(on(at(21)), true);
    assert.equal(roomIsDark(at(6)), true);
    // Following the real clock
    assert.equal(on(at(12, "clock"), new Date(2026, 0, 5, 22, 0)), true);
    assert.equal(on(at(12, "clock"), new Date(2026, 0, 5, 11, 0)), false);
    // A scene that switches it keeps it as the scene says
    const scened = model.sanitizeRoom({ ...at(21), scenes: [{ id: "work", name: "Work", when: { kind: "manual" }, overrides: { lights: { [id]: { on: false } } } }], activeScene: "work" });
    assert.equal(on(scened), false);
  });
});
