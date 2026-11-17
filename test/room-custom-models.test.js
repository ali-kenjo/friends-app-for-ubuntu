// Your own models: their catalog entries survive being saved and read back, and once registered the
// pure modules treat them like built-ins (cleaning, footprint, names, the robot's permissions).
const { test, describe, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const model = require("../src/js/room/model.mjs");
const catalog = require("../src/js/room/catalog.mjs");
const templates = require("../src/js/room/templates.mjs");
const ops = require("../src/js/room/editor/ops.mjs");

const raw = { label: "My table", category: "tables", slots: ["floor"], footprint: { w: 1.2, d: 0.7 }, height: 0.76, unit: 0.01, stylize: false, surfaces: [{ id: "top", y: 0.755, w: 1.2, d: 0.7 }], anchors: { stand: [0, 0, 0.8] }, actions: ["go", "touch"], colorDefaults: { c1: "#d9a066" }, info: { recolor: ["c1"], triangles: 960, bytes: 1000 } };

describe("Your own models", () => {
  afterEach(() => catalog.setCustomEntries({}));

  test("an entry read back keeps its colors, unit, surfaces and anchors", () => {
    const once = model.sanitizeCustomEntry(raw, "my_table");
    const twice = model.sanitizeCustomEntry(JSON.parse(JSON.stringify(once)), "my_table");
    assert.deepEqual(twice, once);
    assert.deepEqual(once.colors, [{ key: "c1", label: "Color 1", def: "#d9a066" }]);
    assert.equal(once.unit, 0.01);
    assert.equal(once.stylize, false);
    assert.equal(once.surfaces[0].y, 0.755);
    assert.deepEqual(once.anchors.stand, [0, 0, 0.8]);
    assert.deepEqual(once.actions, ["look", "go", "touch"]);
  });

  test("registered, a room keeps its things and the pure modules know their size and name", () => {
    const entry = model.sanitizeCustomEntry(raw, "my_table");
    const room = templates.templateRoom("empty");
    const withIt = { ...room, assets: [...room.assets, { id: "t1", type: "custom:my_table", pos: [0, 0, -1], colors: { c1: "#112233" } }] };
    // Not registered (and not given): dropped, with a note
    const notes = [];
    assert.equal(model.sanitizeRoom(withIt, { notes }).assets.some((a) => a.id === "t1"), false);
    assert.ok(notes.some((n) => /unknown/.test(n)));
    catalog.setCustomEntries({ my_table: entry });
    const clean = model.sanitizeRoom(withIt);
    const t1 = clean.assets.find((a) => a.id === "t1");
    assert.equal(t1.colors.c1, "#112233");
    assert.equal(catalog.entryFor("custom:my_table"), entry);
    assert.equal(model.displayName(t1), "My table");
    const fp = model.footprintOf(clean, t1);
    assert.ok(Math.abs(fp[1][0] - fp[0][0] - 1.2) < 1e-6, "its own footprint");
    // Something can be put on its top
    const mug = ops.addAsset(clean, "mug", { parent: "t1", surface: "top", slot: "surface", pos: [0, 0, 0], local: true });
    assert.equal(model.sanitizeRoom(mug.room).assets.find((a) => a.id === mug.id).parent, "t1");
  });

  test("a built-in can wear a model and stays itself", () => {
    const room = ops.addAsset(templates.templateRoom("empty"), "desk_writing", { pos: [0, 0, -1] }).room;
    const desk = room.assets.at(-1);
    const worn = model.sanitizeRoom(ops.updateAsset(room, desk.id, { glb: "my_table" }));
    const d = worn.assets.find((a) => a.id === desk.id);
    assert.equal(d.type, "desk_writing");
    assert.equal(d.glb, "my_table");
  });
});
