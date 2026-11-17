// The Room Editor's logic: undo/redo, placing, moving with parents, checks, snapping, copy and paste.
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const model = require("../src/js/room/model.mjs");
const ops = require("../src/js/room/editor/ops.mjs");
const { History } = require("../src/js/room/editor/history.mjs");
const templates = require("../src/js/room/templates.mjs");

const empty = () => templates.templateRoom("empty", { size: "medium", walls: "corner" });
const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

describe("Undo and redo", () => {
  test("each change is a step; at least 100 are kept; a drag is one step", () => {
    const h = new History();
    let room = empty();
    for (let i = 0; i < 120; i++) {
      const before = room;
      room = ops.addAsset(room, "mug", { pos: [0, 0, 0] }).room;
      h.push("Add", before, room);
    }
    assert.equal(room.assets.length, 120);
    let n = 0;
    while (h.canUndo) {
      room = h.undo(room).room;
      n++;
    }
    assert.ok(n >= 100, `only ${n} steps kept`);
    // A drag: many pushes with one key become one step
    const h2 = new History();
    let r = ops.addAsset(empty(), "desk_writing", { pos: [0, 0, -1] }).room;
    const start = r;
    for (let i = 1; i <= 20; i++) {
      const before = r;
      r = ops.nudge(r, ["desk_writing"], 0.01, 0);
      h2.push("Move", before, r, { coalesce: "drag-1", now: 1000 + i * 30 });
    }
    assert.equal(h2.undoStack.length, 1);
    const back = h2.undo(r).room;
    assert.deepEqual(back.assets[0].pos, start.assets[0].pos);
    const again = h2.redo(back).room;
    assert.ok(near(again.assets[0].pos[0], 0.2));
  });

  test("undo and redo of adding, changing and removing, and of the room's own settings", () => {
    const h = new History();
    let room = empty();
    const step = (label, fn) => {
      const before = room;
      room = fn(room);
      h.push(label, before, room);
    };
    step("Add desk", (r) => ops.addAsset(r, "desk_writing", { pos: [0, 0, -1.5] }).room);
    step("Add lamp", (r) => ops.addAsset(r, "lamp_desk", { pos: [0.3, 0.76, -1.5], parent: "desk_writing" }).room);
    step("Mood", (r) => ({ ...r, atmosphere: { ...r.atmosphere, mood: "cozy" } }));
    step("Remove desk", (r) => ops.removeAssets(r, ["desk_writing"]));
    assert.equal(room.assets.length, 0, "removing the desk removed the lamp on it");
    room = h.undo(room).room;
    assert.equal(room.assets.length, 2);
    room = h.undo(room).room;
    assert.equal(room.atmosphere.mood, "day");
    room = h.redo(room).room;
    assert.equal(room.atmosphere.mood, "cozy");
    assert.equal(h.undoLabel, "Mood");
  });
});

describe("Placing and moving", () => {
  test("a lamp dropped on a desk becomes its child and follows when the desk moves and turns", () => {
    let room = ops.addAsset(empty(), "desk_writing", { pos: [0, 0, -1.5] }).room;
    room = ops.addAsset(room, "lamp_desk", { pos: [0.4, 0.76, -1.5], parent: "desk_writing" }).room;
    const lamp = room.assets.find((a) => a.type === "lamp_desk");
    assert.equal(lamp.parent, "desk_writing");
    assert.ok(near(lamp.pos[0], 0.4) && near(lamp.pos[1], 0));
    room = ops.nudge(room, ["desk_writing"], 0.5, 0);
    let t = model.worldTransform(room, room.assets.find((a) => a.type === "lamp_desk"));
    assert.ok(near(t.x, 0.9));
    room = ops.rotateBy(room, ["desk_writing"], 90);
    t = model.worldTransform(room, room.assets.find((a) => a.type === "lamp_desk"));
    assert.ok(near(t.x, 0.5) && near(t.z, -1.9), `${t.x}, ${t.z}`);
  });

  test("dragging a thing off the desk onto the floor re-parents it and keeps where it is in the room", () => {
    let room = ops.addAsset(empty(), "desk_writing", { pos: [0, 0, -1.5], rot: 30 }).room;
    room = ops.addAsset(room, "mug", { pos: [0.2, 0.76, -1.4], parent: "desk_writing" }).room;
    const before = model.worldTransform(room, room.assets[1]);
    room = ops.placeAt(room, "mug", [1, 0, 0.5]);
    const m = room.assets[1];
    assert.equal(m.parent, null);
    assert.deepEqual(m.pos, [1, 0, 0.5]);
    assert.ok(near(model.worldTransform(room, m).rot, before.rot), "it keeps its turn");
  });

  test("checks: outside the room, in a wall, on another thing (rugs may overlap), cutting the path home", () => {
    let room = ops.addAsset(empty(), "sofa", { pos: [0, 0, -1.4] }).room;
    let r = ops.addAsset(room, "armchair", { pos: [0.3, 0, -1.4] });
    assert.equal(ops.placementCheck(r.room, r.id).reason, "overlap");
    r = ops.addAsset(room, "rug_round", { pos: [0, 0, -0.95] });
    assert.equal(ops.placementCheck(r.room, r.id).level, "ok");
    r = ops.addAsset(room, "armchair", { pos: [0, 0, -2.0] });
    assert.equal(ops.placementCheck(r.room, r.id).reason, "wall");
    r = ops.addAsset(room, "armchair", { pos: [5, 0, 0] });
    assert.equal(ops.placementCheck(r.room, r.id).reason, "outside");
    // A bookcase behind a row of low shelves with one gap; a third shelf in the gap cuts the robot off from it
    let c = templates.templateRoom("empty", { size: "medium", walls: "three" });
    c = ops.addAsset(c, "bookcase", { pos: [0, 0, -1.82] }).room;
    c = ops.addAsset(c, "shelf_low", { pos: [-1.66, 0, -0.55], scale: 1.4 }).room;
    c = ops.addAsset(c, "shelf_low", { pos: [1.66, 0, -0.55], scale: 1.4 }).room;
    assert.equal(ops.placementCheck(c, "shelf_low").level, "ok", "a row with a gap leaves the way open");
    const block = ops.addAsset(c, "shelf_low", { pos: [0, 0, -0.55], scale: 1.33 });
    assert.equal(ops.placementCheck(block.room, block.id).level, "warn");
    assert.equal(ops.placementCheck(block.room, block.id).reason, "blocks_home");
  });

  test("a click-placed thing never lands on the robot's home", () => {
    const room = empty();
    const home = [room.robot.home.pos[0], room.robot.home.pos[2]];
    const spot = ops.firstFreeSpot(room, "desk_standing", home);
    assert.ok(Math.hypot(spot[0] - home[0], spot[1] - home[1]) > 0.3, `too close to home: ${spot}`);
    const placed = ops.addAsset(room, "desk_standing", { pos: [spot[0], 0, spot[1]] });
    assert.equal(ops.placementCheck(placed.room, placed.id).level, "ok");
  });

  test("duplicate goes to the first free spot; ids never collide", () => {
    let room = ops.addAsset(empty(), "table_side", { pos: [0, 0, -1] }).room;
    const d = ops.duplicate(room, ["table_side"]);
    assert.equal(d.room.assets.length, 2);
    assert.notEqual(d.ids[0], "table_side");
    assert.equal(ops.placementCheck(d.room, d.ids[0], { checkPath: false }).level, "ok");
  });

  test("copy and paste, also into another room, with the things on top", () => {
    let a = ops.addAsset(empty(), "desk_writing", { pos: [0, 0, -1.5] }).room;
    a = ops.addAsset(a, "mug", { pos: [0, 0.76, -1.5], parent: "desk_writing" }).room;
    const clip = ops.copy(a, ["desk_writing"]);
    const b = ops.paste(templates.templateRoom("lounge"), clip, [0, 0, 1]);
    const desk = b.room.assets.find((x) => x.id === b.ids[0]);
    assert.equal(desk.type, "desk_writing");
    assert.ok(b.room.assets.some((x) => x.type === "mug" && x.parent === desk.id));
  });

  test("snapping: grid, angle, walls, guides; align and distribute; group; copy look; replace", () => {
    assert.equal(ops.snap(0.137, 0.05), 0.15);
    assert.equal(ops.snapAngle(52, 45), 45);
    let room = ops.addAsset(empty(), "bookcase", { pos: [0, 0, -1.7] }).room;
    const s = ops.snapToWalls(room, room.assets[0], [0, 0, -1.78]);
    assert.ok(near(s[2], -2 + 0.17 + 0.005, 0.002));
    room = ops.addAsset(room, "table_side", { pos: [1, 0, 0] }).room;
    const g = ops.guides(room, { id: "x" }, [0.98, 0, 0.3]);
    assert.ok(g.hits.some((h) => h.axis === "x"));
    let r = empty();
    for (const x of [-1.5, -0.2, 1.2]) r = ops.addAsset(r, "pouf", { pos: [x, 0, (x + 2) / 3] }).room;
    const ids = r.assets.map((a) => a.id);
    const al = ops.align(r, ids, "left");
    assert.ok(al.assets.every((a) => near(a.pos[0], al.assets[0].pos[0])));
    const di = ops.distribute(r, ids);
    assert.ok(near(di.assets[1].pos[0], (-1.5 + 1.2) / 2));
    const gr = ops.group(r, ids.slice(0, 2));
    assert.deepEqual(ops.groupMembers(gr.room, ids[0]).sort(), ids.slice(0, 2).sort());
    const cl = ops.copyLook(ops.updateAsset(r, ids[0], { colors: { c1: "#123456" } }), ids[0], [ids[1]]);
    assert.equal(cl.assets[1].colors.c1, "#123456");
    const rep = ops.replaceWith(r, ids[0], "bean_bag");
    assert.equal(rep.assets[0].type, "bean_bag");
    assert.deepEqual(rep.assets[0].pos, r.assets[0].pos);
  });

  test("keyboard moves are said in words", () => {
    let room = ops.addAsset(empty(), "desk_writing", { pos: [0, 0, -1.5] }).room;
    room = ops.nudge(room, ["desk_writing"], -0.1, 0);
    assert.equal(ops.moveWords(room, "desk_writing", -0.1, 0), "Writing desk moved 10 cm left, on the floor");
  });

  test("a new wall thing faces into the room from its wall", () => {
    const r = ops.addAsset(empty(), "frame_picture", { pos: [-2.5, 1.4, 0.2], slot: "wall" });
    assert.equal(r.room.assets[0].rot, 90);
  });
});
