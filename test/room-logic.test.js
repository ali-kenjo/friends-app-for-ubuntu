// The 1.1 room's logic: the permission model, navigation, scenes and schedules.
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const model = require("../src/js/room/model.mjs");
const rules = require("../src/js/room/rules.mjs");
const nav = require("../src/js/room/nav.mjs");
const schedule = require("../src/js/room/schedule.mjs");
const choices = require("../src/js/room/choices.mjs");
const catalog = require("../src/js/room/catalog.mjs");

const room = (extra = {}) =>
  model.sanitizeRoom({
    size: { w: 5, d: 4, h: 2.7 },
    architecture: { walls: { back: true, left: true, right: false, front: false } },
    assets: [
      { id: "desk", type: "desk_writing", pos: [-1.2, 0, -1.55] },
      { id: "mug", type: "mug", parent: "desk", pos: [0.3, 0, 0] },
      { id: "plant", type: "monstera", pos: [1.9, 0, -1.4] },
      { id: "vase", type: "vase_flowers", parent: "desk", pos: [-0.4, 0, 0] },
      { id: "board", type: "whiteboard", pos: [1.0, 0, 0.6], rot: 180 },
      ...(extra.assets || []),
    ],
    robot: extra.robot || {},
    scenes: extra.scenes || [],
    activeScene: extra.activeScene,
  });

const setRule = (r, id, patch) => {
  const a = r.assets.find((x) => x.id === id);
  a.rules = { ...a.rules, ...patch };
  return r;
};

describe("The permission model (rules.mjs)", () => {
  test("the matrix: permission × actor × action", () => {
    const expect = {
      free: { auto: { look: true, touch: true, water: true }, ai: { look: true, touch: true, water: true } },
      ask: { auto: { look: false, touch: false, water: false }, ai: { look: true, touch: true, water: true } },
      look: { auto: { look: true, go: true, touch: false, water: false }, ai: { look: true, go: true, touch: false, water: false } },
      never: { auto: { look: false, go: false, water: false }, ai: { look: false, go: false, water: false } },
    };
    for (const [perm, actors] of Object.entries(expect)) {
      for (const [actor, actions] of Object.entries(actors)) {
        for (const [action, ok] of Object.entries(actions)) {
          const r = setRule(room(), "plant", { permission: perm });
          assert.equal(rules.canDo(r, actor, "plant", action).ok, ok, `${perm} ${actor} ${action}`);
        }
      }
    }
  });

  test("the editor's own buttons may try any action the thing has; nobody can do what it doesn't support", () => {
    const r = setRule(room(), "plant", { permission: "never" });
    assert.equal(rules.canDo(r, "user", "plant", "water").ok, true);
    assert.equal(rules.canDo(r, "user", "plant", "sit").reason, "unsupported");
  });

  test("a refusal is a sentence the AI can say", () => {
    const r = setRule(room(), "vase", { permission: "look" });
    const res = rules.canDo(r, "ai", "vase", "touch");
    assert.equal(res.reason, "look_only");
    assert.equal(rules.explain(res, { name: "vase", action: "touch" }), "I'm only allowed to look at the vase, not touch it.");
    assert.equal(rules.explain(rules.canDo(setRule(room(), "plant", { permission: "never" }), "ai", "plant", "water"), { name: "monstera" }), "I'm not allowed to do anything with the monstera.");
  });

  test("allowed actions, fragile things, the AI switches and the autonomy preset", () => {
    let r = setRule(room(), "plant", { actions: ["look", "go"] });
    assert.equal(rules.canDo(r, "ai", "plant", "water").reason, "action_off");
    r = room();
    assert.equal(rules.canDo(r, "ai", "mug", "carry").reason, "fragile");
    assert.equal(rules.canDo(r, "ai", "plant", "water", { ai: { ...rules.DEFAULT_AI, use: false } }).reason, "ai_off");
    assert.equal(rules.canDo(r, "ai", "plant", "go", { ai: { ...rules.DEFAULT_AI, move: false } }).reason, "ai_off");
    r = room({ robot: { autonomy: { preset: "statue" } } });
    assert.equal(rules.canDo(r, "auto", "plant", "go").reason, "statue");
    assert.equal(rules.canDo(r, "auto", "plant", "look").ok, true);
  });

  test("filming keeps it in place on its own; Private mode and switched-off personal things", () => {
    const r = room();
    assert.equal(rules.canDo(r, "auto", "plant", "go", { filming: true }).reason, "filming");
    assert.equal(rules.canDo(r, "ai", "plant", "go", { filming: true }).ok, true, "you can still ask");
    assert.equal(rules.canDo(r, "ai", "board", "write").reason, "personal_off");
    r.assets.find((a) => a.id === "board").state.mirror = true;
    assert.equal(rules.canDo(r, "ai", "board", "write").ok, true);
    assert.equal(rules.canDo(r, "ai", "board", "write", { privateMode: true }).reason, "private");
  });

  test("a thing whose stand point is in a no-go zone can be looked at, not visited", () => {
    const r = room({ robot: { zones: [{ id: "z", kind: "nogo", shape: "circle", points: [[1.9, -1.4]], radius: 1.0 }] } });
    assert.equal(rules.canDo(r, "ai", "plant", "water").reason, "nogo");
    assert.equal(rules.canDo(r, "ai", "plant", "look").ok, true);
  });

  test("scenes override rules, and hidden or out-of-schedule things aren't there", () => {
    const r = room({ scenes: [{ id: "night", name: "Night", overrides: { rules: { plant: { permission: "never" } }, hidden: { board: true } } }], activeScene: "night" });
    assert.equal(rules.canDo(r, "ai", "plant", "water").reason, "never");
    assert.equal(rules.canDo(r, "ai", "board", "look").reason, "not_here");
    r.assets.find((a) => a.id === "plant").schedule = { months: [12] };
    r.activeScene = "none";
    assert.equal(rules.canDo(r, "ai", "plant", "look", { now: new Date(2026, 5, 1) }).reason, "not_here");
    assert.equal(rules.canDo(r, "ai", "plant", "look", { now: new Date(2026, 11, 20) }).ok, true);
  });

  test("candidates for visiting on its own leave out Never, Only-when-asked and weight 0", () => {
    const r = setRule(setRule(setRule(room(), "plant", { permission: "never" }), "board", { permission: "ask" }), "desk", { weight: 0 });
    const ids = rules.autonomousCandidates(r).map((a) => a.id);
    assert.ok(!ids.includes("plant") && !ids.includes("board") && !ids.includes("desk"));
    assert.ok(ids.includes("mug"));
  });

  test("the permission table lists what's allowed for each thing", () => {
    const table = rules.permissionTable(setRule(room(), "vase", { permission: "look" }), "ai");
    const vase = table.find((t) => t.id === "vase");
    assert.deepEqual(vase.allowed.sort(), ["go", "look"]);
  });
});

describe("Navigation (nav.mjs)", () => {
  test("zones: rectangle, circle, polygon", () => {
    assert.ok(nav.pointInZone({ shape: "rect", points: [[0, 0], [1, 1]] }, 0.5, 0.5));
    assert.ok(!nav.pointInZone({ shape: "circle", points: [[0, 0]], radius: 0.5 }, 0.6, 0));
    const tri = { shape: "poly", points: [[0, 0], [2, 0], [0, 2]] };
    assert.ok(nav.pointInZone(tri, 0.4, 0.4));
    assert.ok(!nav.pointInZone(tri, 1.5, 1.5));
  });

  test("footprints are oriented: a long desk turned 90° blocks along z, not x", () => {
    const r = model.sanitizeRoom({ assets: [{ id: "d", type: "desk_writing", rot: 90 }] });
    const b = nav.obb(r, r.assets[0]);
    assert.ok(nav.inObb(b, 0, 0.65));
    assert.ok(!nav.inObb(b, 0.65, 0));
  });

  test("a path goes around furniture with clearance, and is smooth", () => {
    const r = model.sanitizeRoom({ size: { w: 5, d: 4, h: 2.7 }, assets: [{ id: "sofa", type: "sofa", pos: [0, 0, 0] }], robot: { movement: { clearance: 10 } } });
    const g = nav.buildGrid(r);
    const p = nav.findPath(g, [0, 1.2], [0, -1.2]);
    assert.ok(p.ok);
    const sofa = nav.obb(r, r.assets[0]);
    for (const [x, z] of p.points) assert.ok(!nav.inObb(sofa, x, z, nav.ROBOT_RADIUS), `point ${x},${z} touches the sofa`);
    assert.ok(nav.pathLength(p.points) > 2.4);
    const direct = nav.findPath(g, [-2, 1.2], [2, 1.2]);
    assert.equal(direct.points.length, 2, "an open line stays a straight line");
  });

  test("a no-go zone forces a detour; an allowed area keeps it inside", () => {
    const base = { size: { w: 5, d: 4, h: 2.7 }, architecture: { walls: { back: false, left: false, right: false, front: false } } };
    const free = nav.findPath(nav.buildGrid(model.sanitizeRoom(base)), [-1.5, 0], [1.5, 0]);
    const blocked = model.sanitizeRoom({ ...base, robot: { zones: [{ id: "z", kind: "nogo", shape: "rect", points: [[-0.4, -1.2], [0.4, 1.2]] }] } });
    const detour = nav.findPath(nav.buildGrid(blocked), [-1.5, 0], [1.5, 0]);
    assert.ok(detour.ok);
    assert.ok(nav.pathLength(detour.points) > nav.pathLength(free.points) + 0.5);
    for (const [x, z] of detour.points) assert.ok(!nav.pointInZone(blocked.robot.zones[0], x, z));
    const walled = model.sanitizeRoom({ ...base, robot: { zones: [{ id: "z", kind: "nogo", shape: "rect", points: [[-0.4, -2.5], [0.4, 2.5]] }] } });
    const none = nav.findPath(nav.buildGrid(walled), [-1.5, 0], [1.5, 0]);
    assert.equal(none.ok, false);
    assert.equal(none.reason, "no_path");
    const allowed = model.sanitizeRoom({ ...base, robot: { zones: [{ id: "a", kind: "allowed", shape: "rect", points: [[-2, -1], [0, 1]] }] } });
    const g = nav.buildGrid(allowed);
    assert.equal(nav.findPath(g, [-1, 0], [1.5, 0]).points.every(([x]) => x <= 0.05), true);
  });

  test("slow zones cost more, so a path prefers to go around them when it's cheap", () => {
    const r = model.sanitizeRoom({ size: { w: 5, d: 4, h: 2.7 }, architecture: { walls: { back: false, left: false, right: false, front: false } }, robot: { zones: [{ id: "s", kind: "slow", shape: "rect", points: [[-0.3, -0.6], [0.3, 0.6]] }] } });
    const p = nav.findPath(nav.buildGrid(r), [-1.5, 0], [1.5, 0]);
    assert.ok(p.points.some(([, z]) => Math.abs(z) > 0.55));
  });

  test("incremental updates: moving one thing changes only its cells", () => {
    const r = model.sanitizeRoom({ assets: [{ id: "a", type: "table_side", pos: [-1, 0, 0] }, { id: "b", type: "table_side", pos: [1, 0, 0] }] });
    const g = nav.buildGrid(r);
    const cellsB = [...g.owners.get("b").cells];
    r.assets[0].pos = [-1, 0, 1];
    nav.updateGrid(g, r);
    assert.deepEqual(g.owners.get("b").cells, cellsB);
    const fresh = nav.buildGrid(r);
    assert.deepEqual([...g.occ], [...fresh.occ]);
    r.assets.pop();
    nav.updateGrid(g, r);
    assert.ok(!g.owners.has("b"));
  });

  test("reachability: things and spots it can't get to are named, and what blocks the way", () => {
    const r = model.sanitizeRoom({
      size: { w: 5, d: 4, h: 2.7 },
      architecture: { walls: { back: true, left: true, right: true, front: false } },
      assets: [{ id: "case", type: "bookcase", pos: [0, 0, -1.83] }, { id: "s1", type: "sofa", pos: [-1.2, 0, -0.6] }, { id: "s2", type: "sofa", pos: [1.0, 0, -0.6] }],
      robot: { home: { pos: [0, 0, 1.2] }, spots: [{ id: "corner", pos: [0, 0, -1.2] }] },
    });
    const missing = nav.unreachable(r);
    assert.ok(missing.some((m) => m.id === "case"));
    assert.deepEqual(nav.whatBlocks(r, [0, 1.2], nav.standPoint(r, r.assets[0])).slice(0, 2).sort(), ["s1", "s2"]);
  });

  test("the stand point of a thing on a desk is the desk's", () => {
    const r = room();
    const desk = nav.standPoint(r, r.assets.find((a) => a.id === "desk"));
    const mug = nav.standPoint(r, r.assets.find((a) => a.id === "mug"));
    assert.deepEqual(desk, mug);
  });
});

describe("Scenes and schedules (schedule.mjs)", () => {
  const at = (h, m = 0, day = 3) => new Date(2026, 10, 15 + ((day - 0 + 7) % 7), h, m); // 2026-11-15 is a Sunday

  test("time windows, also past midnight", () => {
    assert.ok(schedule.inWindow("09:00", "17:00", at(12)));
    assert.ok(!schedule.inWindow("09:00", "17:00", at(18)));
    assert.ok(schedule.inWindow("22:00", "06:00", at(23)));
    assert.ok(schedule.inWindow("22:00", "06:00", at(5)));
    assert.ok(!schedule.inWindow("22:00", "06:00", at(12)));
  });

  test("Work by day and Chill after 19:00 switch on their own; filming has its own scene; a chosen scene wins", () => {
    const r = room({
      scenes: [
        { id: "work", name: "Work", when: { kind: "schedule", from: "08:00", to: "19:00" }, overrides: { lights: { lamp: { on: true } }, home: { pos: [-1.2, 0, -0.9], facing: 180 } } },
        { id: "chill", name: "Chill", when: { kind: "schedule", from: "19:00", to: "08:00" }, overrides: { mood: "cozy" } },
        { id: "film", name: "Filming", when: { kind: "filming" } },
      ],
    });
    assert.equal(schedule.activeScene(r, { now: at(10) }).id, "work");
    assert.equal(schedule.activeScene(r, { now: at(21) }).id, "chill");
    assert.equal(schedule.activeScene(r, { now: at(21), filming: true }).id, "film");
    const eff = schedule.effectiveRoom(r, { now: at(21) });
    assert.equal(eff.room.atmosphere.mood, "cozy");
    const work = schedule.effectiveRoom(r, { now: at(10) });
    assert.deepEqual(work.room.robot.home.pos, [-1.2, 0, -0.9]);
    r.activeScene = "chill";
    assert.equal(schedule.activeScene(r, { now: at(10) }).id, "chill");
    r.activeScene = "none";
    assert.equal(schedule.activeScene(r, { now: at(10) }), null);
  });

  test("weekdays", () => {
    const r = room({ scenes: [{ id: "we", name: "Weekend", when: { kind: "schedule", weekdays: [0, 6] } }] });
    assert.equal(schedule.activeScene(r, { now: new Date(2026, 10, 15, 12) })?.id, "we"); // Sunday
    assert.equal(schedule.activeScene(r, { now: new Date(2026, 10, 16, 12) }), null); // Monday
  });

  test("an asset's own schedule: a tree in December, a lamp after 18:00, a thing only in one scene", () => {
    assert.ok(schedule.scheduleAllows({ months: [12] }, { now: new Date(2026, 11, 3) }));
    assert.ok(!schedule.scheduleAllows({ months: [12] }, { now: new Date(2026, 6, 3) }));
    assert.ok(schedule.scheduleAllows({ from: "18:00" }, { now: at(19) }));
    assert.ok(!schedule.scheduleAllows({ from: "18:00" }, { now: at(9) }));
    assert.ok(!schedule.scheduleAllows({ scenes: ["film"] }, { scene: null }));
    assert.ok(schedule.scheduleAllows({ scenes: ["film"] }, { scene: { id: "film" } }));
    assert.ok(schedule.scheduleAllows({ seasons: ["winter"] }, { now: new Date(2026, 11, 20) }), "Christmas is in winter");
  });

  test("a thing on a hidden thing is hidden with it", () => {
    const r = room({ scenes: [{ id: "s", overrides: { hidden: { desk: true } } }], activeScene: "s" });
    const eff = schedule.effectiveRoom(r);
    assert.ok(eff.hidden.has("mug") && eff.hidden.has("vase"));
  });

  test("the next change is found for a timer", () => {
    const r = room({ scenes: [{ id: "chill", when: { kind: "schedule", from: "19:00", to: "08:00" } }] });
    const ms = schedule.nextChange(r, new Date(2026, 10, 16, 18, 30, 0));
    assert.equal(ms, 30 * 60 * 1000);
  });
});

describe("Choices", () => {
  test("every list has unique ids and labels for translation", () => {
    const words = new Set(choices.labels());
    for (const [name, list] of Object.entries(choices)) {
      if (!Array.isArray(list) || !list[0]?.label) continue;
      const ids = list.map((e) => e.id);
      assert.equal(new Set(ids).size, ids.length, name);
      for (const e of list) assert.ok(words.has(e.label), `${name}: ${e.label}`);
    }
    assert.ok(choices.MOODS.every((m) => m.key && m.fill && m.rim && m.hemi && m.grade));
    void catalog;
  });
});
