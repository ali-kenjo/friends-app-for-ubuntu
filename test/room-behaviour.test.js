// The robot's behaviour in its room: home and facing, freedom and leash, visits by the rules (weights,
// quotas, Never), paths round no-go zones and what blocks them, slow and quiet zones, talking, listening,
// away and asleep, filming, routes, commands, postures and gaze; and the event log that says why.
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const model = require("../src/js/room/model.mjs");
const templates = require("../src/js/room/templates.mjs");
const ops = require("../src/js/room/editor/ops.mjs");
const { RoomBehaviour, anchorPoint, partOfDay } = require("../src/js/room/behaviour.mjs");

// A random that always gives the same numbers
function seeded(seed = 7) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const NOON = new Date(2026, 10, 16, 12, 0);
function run(b, seconds, ctx = {}, dt = 0.1) {
  for (let t = 0; t < seconds; t += dt) b.tick(dt, { now: NOON, ...ctx });
  return b.out;
}
const near = (a, b, eps = 0.08) => Math.hypot(a[0] - b[0], a[1] - b[1]) < eps;
const keys = (b) => b.log.map((e) => e.key);

// An empty 6 × 5 m room with the robot home in the middle, and some changes
function room(change = (r) => r) {
  let r = templates.templateRoom("empty", { size: "medium", walls: "three" });
  r = { ...r, size: { w: 6, d: 5, h: 2.7 }, robot: { ...r.robot, home: { pos: [0, 0, 0], facing: 0 } } };
  return model.sanitizeRoom(change(r));
}
const withRobot = (r, patch) => ({ ...r, robot: { ...r.robot, ...patch } });
const add = (r, type, pos, extra = {}) => {
  const res = ops.addAsset(r, type, { pos });
  return ops.updateAsset(res.room, res.id, extra);
};

describe("Behaviour in the room", () => {
  test("idle and calm: it stays home, facing the way home faces", () => {
    const b = new RoomBehaviour({ random: seeded() });
    b.setRoom(room((r) => withRobot(r, { home: { pos: [1, 0, -0.5], facing: 30 } })));
    const out = run(b, 20);
    assert.ok(near([out.x, out.z], [1, -0.5]));
    assert.ok(Math.abs(out.yaw - 30) < 1);
    assert.equal(out.posture.kind, "stand");
  });

  test("curious: it visits a thing it may, never one marked Never, and says so", () => {
    let r = room();
    r = add(r, "desk_writing", [-1.8, 0, -1.6]);
    const desk = r.assets.at(-1).id;
    r = add(r, "lamp_floor", [1.8, 0, -1.6], { rules: { permission: "never" } });
    r = model.sanitizeRoom(withRobot(r, { autonomy: { ...r.robot.autonomy, preset: "curious" }, movement: { ...r.robot.movement, freedom: "free" } }));
    const used = [];
    const b = new RoomBehaviour({ random: seeded(3) });
    b.onAction = (a) => used.push(a);
    b.setRoom(r);
    run(b, 60);
    assert.ok(used.some((u) => u.assetId === desk), `used: ${JSON.stringify(used)}`);
    assert.ok(!used.some((u) => u.assetId !== desk));
    assert.ok(keys(b).includes("Skipped the {name}: Never"));
    assert.ok(keys(b).includes("Going to the {name}"));
  });

  test("quotas: no more visits an hour than the preset allows", () => {
    let r = room();
    r = add(r, "desk_writing", [-1.5, 0, -1.6]);
    r = add(r, "chair_office", [1.5, 0, -1.6]);
    r = model.sanitizeRoom(withRobot(r, { autonomy: { ...r.robot.autonomy, preset: "custom", quotas: { ...r.robot.autonomy.quotas, maxPerHour: 2, globalCooldownSec: 0, perAssetCooldownSec: 0 } }, states: { ...r.robot.states, idle: "visit" }, movement: { ...r.robot.movement, freedom: "free" } }));
    const b = new RoomBehaviour({ random: seeded(5) });
    b.setRoom(r);
    run(b, 400);
    assert.equal(b.visits.all.length, 2);
    assert.ok(keys(b).includes("Not visiting: {n} visits this hour already"));
  });

  test("paths go round a no-go zone; with no way through, the log names what blocks it", () => {
    let r = room((x) => withRobot(x, { zones: [{ id: "z", name: "Cables", kind: "nogo", shape: "rect", points: [[-0.6, -1.4], [0.6, -0.4]] }] }));
    const b = new RoomBehaviour({ random: seeded() });
    b.setRoom(r);
    b.command({ kind: "home" });
    b.goTo([0, -2], { why: "command", name: "the back" });
    for (const p of b.task.points) assert.ok(!(p[0] > -0.6 && p[0] < 0.6 && p[1] > -1.4 && p[1] < -0.4), `through the zone at ${p}`);
    // A wall of sofas across the room, wall to wall
    let walled = room();
    for (const x of [-2, 0, 2]) walled = add(walled, "sofa", [x, 0, -1]);
    const c = new RoomBehaviour({ random: seeded() });
    c.setRoom(model.sanitizeRoom(walled));
    assert.equal(c.goTo([0, -2.2], { why: "command", name: "the back wall" }), false);
    assert.equal(c.log.at(-1).key, "No path to {name}: blocked by the {by}");
    assert.equal(c.log.at(-1).vars.by, "Plush sofa");
  });

  test("slow zones slow it down, quiet zones keep it quiet", () => {
    // (a slow zone costs more to cross, so paths go round one when they can: this one is the whole floor)
    const zones = [{ id: "s", name: "", kind: "slow", shape: "rect", points: [[-3, -2.5], [3, 2.5]] }, { id: "q", name: "", kind: "quiet", shape: "circle", points: [[0, 0]], radius: 0.5 }];
    const b = new RoomBehaviour({ random: seeded() });
    b.setRoom(room((r) => withRobot(r, { zones })));
    b.command({ kind: "spot", id: "x" }); // no such spot: nothing happens
    b.goTo([2.5, 0], { why: "command" });
    let top = 0;
    for (let i = 0; i < 60; i++) top = Math.max(top, b.tick(0.1, { now: NOON }).speed);
    assert.ok(top <= 0.9 * 0.45 + 1e-6, `top speed ${top}`);
    assert.ok(keys(b).includes("Slowed down: slow zone"));
    const c = new RoomBehaviour({ random: seeded() });
    c.setRoom(room((r) => withRobot(r, { zones })));
    assert.equal(run(c, 1).quiet, true);
  });

  test("near home: wandering stays on its leash", () => {
    const b = new RoomBehaviour({ random: seeded(11) });
    b.setRoom(room((r) => withRobot(r, { movement: { ...r.robot.movement, freedom: "near_home", leash: 0.8 }, states: { ...r.robot.states, idle: "wander" }, autonomy: { ...r.robot.autonomy, preset: "custom" } })));
    let far = 0;
    for (let i = 0; i < 1200; i++) {
      const o = b.tick(0.1, { now: NOON });
      far = Math.max(far, Math.hypot(o.x, o.z));
    }
    assert.ok(far > 0.2, "it moved");
    assert.ok(far <= 0.8 + 0.15, `went ${far} m from home`);
  });

  test("talking: to the stage zone, facing you; listening: turns to you", () => {
    const b = new RoomBehaviour({ random: seeded() });
    b.setRoom(room((r) => withRobot(r, { home: { pos: [1.5, 0, -1], facing: 90 }, zones: [{ id: "st", name: "Stage", kind: "stage", shape: "rect", points: [[-0.5, 0.5], [0.5, 1.5]] }], states: { ...r.robot.states, talking: "stage" } })));
    const out = run(b, 15, { state: "talking" });
    assert.ok(near([out.x, out.z], [0, 1], 0.12), `at ${out.x}, ${out.z}`);
    assert.ok(Math.abs(out.yaw) < 5, `facing ${out.yaw}`);
    const c = new RoomBehaviour({ random: seeded() });
    c.setRoom(room((r) => withRobot(r, { home: { pos: [1.5, 0, -1], facing: -90 } })));
    const l = run(c, 4, { state: "listening" });
    assert.ok(near([l.x, l.z], [1.5, -1]));
    assert.ok(Math.abs(l.yaw - Math.atan2(-1.5, 3.1 + 1) * 57.2958) < 3, `facing ${l.yaw}`);
  });

  test("away: to the rest zone, resting, then asleep; back when you're here", () => {
    const b = new RoomBehaviour({ random: seeded() });
    b.setRoom(room((r) => withRobot(r, { zones: [{ id: "rz", name: "Nook", kind: "rest", shape: "circle", points: [[-2, -1.5]], radius: 0.4 }], states: { ...r.robot.states, away: { afterMin: 1, sleepAfterMin: 2 } } })));
    let out = run(b, 20, { awaySec: 70 });
    assert.ok(near([out.x, out.z], [-2, -1.5], 0.12));
    assert.equal(out.posture.kind, "rest");
    assert.equal(out.sleeping, false);
    out = run(b, 1, { awaySec: 200 });
    assert.equal(out.sleeping, true);
    assert.ok(keys(b).includes("Asleep"));
    out = run(b, 20, { awaySec: 0, state: "listening" });
    assert.equal(out.sleeping, false);
    assert.equal(out.posture.kind, "stand");
  });

  test("filming: it stays put and keeps a steady gaze", () => {
    const b = new RoomBehaviour({ random: seeded() });
    b.setRoom(room((r) => withRobot(r, { autonomy: { ...r.robot.autonomy, preset: "playful" }, movement: { ...r.robot.movement, freedom: "free" } })));
    const out = run(b, 60, { filming: true });
    assert.ok(near([out.x, out.z], [0, 0]));
    assert.equal(out.gaze.mode, "camera");
    assert.equal(out.roam, false);
  });

  test("routes: a loop visits its points in order and waits at each", () => {
    const points = [{ pos: [-1.5, -1], dwell: 1 }, { pos: [1.5, -1], dwell: 1 }, { pos: [0, 1.2], dwell: 1 }];
    const b = new RoomBehaviour({ random: seeded() });
    b.setRoom(room((r) => withRobot(r, { routes: [{ id: "patrol", name: "Patrol", mode: "loop", when: { kind: "manual" }, points }] })));
    assert.equal(b.command({ kind: "route", id: "Patrol" }).ok, true);
    const order = [];
    for (let i = 0; i < 600; i++) {
      b.tick(0.1, { now: NOON });
      const t = b.task;
      if (t?.kind === "route" && t.dwellUntil >= 0 && order.at(-1) !== t.idx) order.push(t.idx);
    }
    assert.deepEqual(order.slice(0, 4), [0, 1, 2, 0]);
  });

  test("commands: a spot by name; a thing it may not touch is refused with a reason", () => {
    let r = room((x) => withRobot(x, { spots: [{ id: "win", name: "By the window", pos: [2, 0, -1.8], facing: 180 }] }));
    r = add(r, "vase_flowers", [-2, 0, -2], { rules: { permission: "look" } });
    const vase = r.assets.at(-1).id;
    const b = new RoomBehaviour({ random: seeded() });
    b.setRoom(model.sanitizeRoom(r));
    assert.equal(b.command({ kind: "spot", id: "by the window" }).ok, true);
    const out = run(b, 15);
    assert.ok(near([out.x, out.z], [2, -1.8], 0.1));
    assert.ok(Math.abs(Math.abs(out.yaw) - 180) < 3);
    const no = b.command({ kind: "asset", id: vase, action: "touch", actor: "ai" });
    assert.equal(no.ok, false);
    assert.equal(no.reason, "look_only");
    assert.match(no.text, /only allowed to look/);
  });

  test("posture: it sits on its chair once it's there, and looks where the state says", () => {
    let r = room();
    r = add(r, "chair_office", [1.5, 0, -1]);
    const chair = r.assets.at(-1).id;
    r = model.sanitizeRoom(withRobot(r, { posture: { ...r.robot.posture, idle: { kind: "sit", asset: chair } }, gaze: { ...r.robot.gaze, idle: { ...r.robot.gaze.idle, mode: "asset", asset: chair } } }));
    const b = new RoomBehaviour({ random: seeded() });
    b.setRoom(r);
    b.visit(r.assets.find((a) => a.id === chair), "sit", "command");
    const out = run(b, 20);
    assert.equal(out.posture.kind, "sit");
    assert.deepEqual(out.posture.point.map((v) => Math.round(v * 100)), anchorPoint(r, r.assets.find((a) => a.id === chair), "sit").map((v) => Math.round(v * 100)));
    assert.equal(out.gaze.mode, "asset");
    assert.ok(out.gaze.point);
  });

  test("parts of the day", () => {
    assert.equal(partOfDay(8), "morning");
    assert.equal(partOfDay(14), "afternoon");
    assert.equal(partOfDay(19), "evening");
    assert.equal(partOfDay(23), "night");
    assert.equal(partOfDay(2), "night");
  });
});
