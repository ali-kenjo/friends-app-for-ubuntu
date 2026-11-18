// Directing the robot in the editor: where it may stand, spots, zones (corners, circles, moving), routes
// (adding, inserting, moving, reordering, removing), and that the model keeps what they make.
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const model = require("../src/js/room/model.mjs");
const templates = require("../src/js/room/templates.mjs");
const ops = require("../src/js/room/editor/ops.mjs");
const R = require("../src/js/room/editor/robot-ops.mjs");

const base = () => model.sanitizeRoom({ ...templates.templateRoom("empty"), size: { w: 6, d: 5, h: 2.7 } });

describe("Directing the robot", () => {
  test("home: not outside the room, not in furniture, not in a no-go zone", () => {
    let room = ops.addAsset(base(), "desk_writing", { pos: [1.5, 0, -1.5] }).room;
    room = model.sanitizeRoom(room);
    assert.equal(R.standCheck(room, 0, 0).ok, true);
    assert.equal(R.standCheck(room, 3.2, 0).reason, "outside");
    const inDesk = R.standCheck(room, 1.5, -1.5);
    assert.equal(inDesk.reason, "furniture");
    assert.equal(inDesk.with, room.assets.at(-1).id);
    const z = R.addZone(room, { kind: "nogo", shape: "circle", points: [[-1, 1]], radius: 0.5 });
    assert.equal(R.standCheck(z.room, -1, 1).reason, "nogo");
    const home = model.sanitizeRoom(R.setHome(room, -0.4, 0.7, 45.4)).robot.home;
    assert.deepEqual(home, { pos: [-0.4, 0, 0.7], facing: 45 });
  });

  test("spots and zones are kept by the model; corners and circles move", () => {
    let room = base();
    const s = R.addSpot(room, "By the window", 2, -1.8, 180);
    room = R.updateSpot(s.room, s.id, { name: "Window" });
    const z = R.addZone(room, { name: "Cables", kind: "nogo", shape: "rect", points: [[-1, -1], [0, 0]] });
    room = R.moveVertex(z.room, z.id, 1, 0.5, 0.25);
    const c = R.addZone(room, { kind: "quiet", shape: "circle", points: [[1, 1]], radius: 0.4 });
    room = R.moveVertex(c.room, c.id, 1, 1.9, 1);
    room = R.moveZone(room, c.id, -0.5, 0);
    const clean = model.sanitizeRoom(room);
    assert.deepEqual(clean.robot.spots, [{ id: s.id, name: "Window", pos: [2, 0, -1.8], facing: 180 }]);
    assert.deepEqual(clean.robot.zones.find((x) => x.id === z.id).points, [[-1, -1], [0.5, 0.25]]);
    const circle = clean.robot.zones.find((x) => x.id === c.id);
    assert.deepEqual(circle.points, [[0.5, 1]]);
    assert.equal(circle.radius, 0.9);
    assert.equal(R.zoneHandles(circle).length, 2);
    assert.equal(model.sanitizeRoom(R.removeZone(room, z.id)).robot.zones.length, 1);
  });

  test("routes: points added, inserted between, moved, reordered and removed", () => {
    const r = R.addRoute(base(), "Patrol");
    let room = r.room;
    room = R.addPoint(room, r.id, -1, -1);
    room = R.addPoint(room, r.id, 1, -1);
    room = R.addPoint(room, r.id, 0, 1);
    room = R.insertPoint(room, r.id, 0);
    let pts = room.robot.routes[0].points.map((p) => p.pos);
    assert.deepEqual(pts, [[-1, -1], [0, -1], [1, -1], [0, 1]]);
    room = R.movePoint(room, r.id, 1, 0, -1.5);
    room = R.reorderPoint(room, r.id, 3, 0);
    room = R.updatePoint(room, r.id, 0, { dwell: 5 });
    room = R.removePoint(room, r.id, 2);
    room = R.updateRoute(room, r.id, { mode: "ping_pong", when: { kind: "every", everyMin: 15 } });
    const clean = model.sanitizeRoom(room).robot.routes[0];
    assert.deepEqual(clean.points.map((p) => p.pos), [[0, 1], [-1, -1], [1, -1]]);
    assert.equal(clean.points[0].dwell, 5);
    assert.equal(clean.mode, "ping_pong");
    assert.deepEqual([clean.when.kind, clean.when.everyMin], ["every", 15]);
  });

  test("a route point inside furniture is reported", () => {
    let room = ops.addAsset(base(), "desk_writing", { pos: [1.5, 0, -1.5] }).room;
    const r = R.addRoute(room, "Through the desk");
    room = R.addPoint(R.addPoint(r.room, r.id, 0, 0), r.id, 1.5, -1.5);
    assert.deepEqual(R.blockedPoints(model.sanitizeRoom(room), room.robot.routes[0]), [1]);
  });
});
