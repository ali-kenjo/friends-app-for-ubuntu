// Plants that need care (room/care.mjs): they droop over days with plant care on, the robot prefers a thirsty
// plant and waters it, watering starts the clock again, and the AI is told which plants look thirsty.
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const model = require("../src/js/room/model.mjs");
const templates = require("../src/js/room/templates.mjs");
const ops = require("../src/js/room/editor/ops.mjs");
const care = require("../src/js/room/care.mjs");
const AI = require("../src/js/room/ai.mjs");
const { RoomBehaviour } = require("../src/js/room/behaviour.mjs");

const DAY = 86400000;
const NOW = new Date(2026, 10, 18, 12).getTime();

function room(plantCare = true, wateredDaysAgo = 3) {
  let r = templates.templateRoom("empty", { size: "medium", walls: "three" });
  r = { ...r, size: { w: 6, d: 5, h: 2.7 }, robot: { ...r.robot, home: { pos: [0, 0, 0], facing: 0 } } };
  let res = ops.addAsset(r, "monstera", { pos: [-2, 0, -1.8] });
  const plant = res.id;
  res = ops.addAsset(res.room, "desk_writing", { pos: [2, 0, -1.8] });
  r = ops.updateAsset(res.room, plant, { care: { wateredAt: NOW - wateredDaysAgo * DAY } });
  r = { ...r, robot: { ...r.robot, autonomy: { ...r.robot.autonomy, plantCare, preset: "custom", quotas: { ...r.robot.autonomy.quotas, globalCooldownSec: 0, perAssetCooldownSec: 0 } }, states: { ...r.robot.states, idle: "visit" }, movement: { ...r.robot.movement, freedom: "free" } } };
  return { room: model.sanitizeRoom(r, { now: NOW }), plant };
}

describe("Plants that need care", () => {
  test("thirst grows over days with plant care on, and is nothing with it off or for things that aren't plants", () => {
    const { room: r, plant } = room(true, 1.5);
    const a = r.assets.find((x) => x.id === plant);
    assert.ok(Math.abs(care.thirst(r, a, NOW) - 0.5) < 0.01);
    assert.equal(care.isThirsty(r, a, NOW), true);
    assert.equal(care.thirst(r, a, NOW + 10 * DAY), 1);
    assert.equal(care.thirst(room(false).room, a, NOW), 0, "off by default");
    assert.equal(care.thirst(r, r.assets.find((x) => x.type === "desk_writing"), NOW), 0);
    // Watering: back to nothing; kept by the model (a time not in the future)
    const watered = care.water(r, plant, NOW);
    assert.equal(care.thirst(watered, watered.assets.find((x) => x.id === plant), NOW), 0);
    const saved = model.sanitizeRoom({ ...watered, assets: watered.assets.map((x) => (x.id === plant ? { ...x, care: { wateredAt: NOW + 5 * DAY } } : x)) }, { now: NOW });
    assert.ok(saved.assets.find((x) => x.id === plant).care.wateredAt <= Date.now());
  });

  test("on its own, the robot goes to the thirsty plant and waters it", () => {
    const { room: r, plant } = room(true, 3);
    let seed = 4;
    const b = new RoomBehaviour({ random: () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646 });
    const used = [];
    b.onAction = (x) => used.push(x);
    b.setRoom(r);
    for (let t = 0; t < 120; t += 0.1) b.tick(0.1, { now: new Date(NOW) });
    assert.ok(used.some((u) => u.assetId === plant && u.action === "water"), JSON.stringify(used));
  });

  test("the AI is told a plant looks thirsty", () => {
    const { room: r } = room(true, 3);
    assert.match(AI.roomBlock(r, { now: NOW }), /looks thirsty/);
    assert.doesNotMatch(AI.roomBlock(room(false).room, { now: NOW }), /thirsty/);
  });
});

describe("Carrying, putting back, tidying up", () => {
  function carryRoom(tidy) {
    let r = templates.templateRoom("empty", { size: "medium", walls: "three" });
    r = { ...r, size: { w: 6, d: 5, h: 2.7 }, robot: { ...r.robot, home: { pos: [0, 0, 0], facing: 0 }, autonomy: { ...r.robot.autonomy, tidy } } };
    const res = ops.addAsset(r, "ball_bouncy", { pos: [1.5, 0, -1.2] });
    return { room: model.sanitizeRoom(res.room), id: res.id };
  }
  const run = (b, sec, state = "idle") => {
    for (let t = 0; t < sec; t += 0.1) b.tick(0.1, { now: new Date(NOW), state });
  };

  test("asked to carry a thing, it goes there and picks it up; asked to put it back, it lets go there", () => {
    const { room: r, id } = carryRoom(false);
    const b = new RoomBehaviour({ random: () => 0.5 });
    b.setRoom(r);
    assert.equal(b.command({ kind: "asset", id, action: "carry", actor: "ai" }).ok, true);
    run(b, 15);
    assert.equal(b.out.carrying, id);
    // It keeps it while it goes home
    b.command({ kind: "home" });
    run(b, 10);
    assert.equal(b.out.carrying, id);
    assert.equal(b.command({ kind: "asset", id, action: "put_back", actor: "ai" }).ok, true);
    run(b, 15);
    assert.equal(b.out.carrying, null);
    assert.ok(b.log.some((e) => e.key === "Put the {name} back"));
    // Its place in the room never changed
    assert.deepEqual(r.assets.find((a) => a.id === id).pos, [1.5, 0, -1.2]);
  });

  test("with Tidy up on, it puts back what it carried by itself after a while; with it off it keeps it", () => {
    for (const tidy of [true, false]) {
      const { room: r, id } = carryRoom(tidy);
      const b = new RoomBehaviour({ random: () => 0.5 });
      b.setRoom(r);
      b.command({ kind: "asset", id, action: "carry", actor: "ai" });
      run(b, 15);
      assert.equal(b.out.carrying, id);
      run(b, 90);
      assert.equal(b.out.carrying, tidy ? null : id, `tidy ${tidy}`);
      if (tidy) assert.ok(b.log.some((e) => e.key === "Tidying up: the {name}"));
    }
  });

  test("a fragile thing isn't carried; one removed from the room is let go", () => {
    let { room: r, id } = carryRoom(false);
    r = ops.updateAsset(r, id, { rules: { ...r.assets.find((a) => a.id === id).rules, fragile: true } });
    const b = new RoomBehaviour({ random: () => 0.5 });
    b.setRoom(model.sanitizeRoom(r));
    assert.equal(b.command({ kind: "asset", id, action: "carry", actor: "ai" }).reason, "fragile");
    const c = carryRoom(false);
    const b2 = new RoomBehaviour({ random: () => 0.5 });
    b2.setRoom(c.room);
    b2.command({ kind: "asset", id: c.id, action: "carry", actor: "ai" });
    run(b2, 15);
    b2.setRoom(ops.removeAssets(c.room, [c.id]));
    assert.equal(b2.carrying, null, "let go of a thing that's gone");
  });
});
