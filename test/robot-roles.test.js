// What the robot is to you: a teacher, a coach, a co-host… or a role you made yourself. The choices are cleaned, they
// reach the AI's instructions (and only when they matter), and an unknown role can't be smuggled in.
const { describe, test, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-roles-test-"));
process.env.FRIENDS_DATA_DIR = tempDir;
process.env.LOG_LEVEL = "error";

const roles = require("../src/js/robot/roles.mjs");
const settings = require("../server/settings");
const prompt = require("../server/prompt");

describe("Roles", () => {
  after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  test("every built-in role is complete: a name, a line, what it does, quick actions", () => {
    assert.ok(roles.ROLE_IDS.length >= 10);
    for (const [id, role] of Object.entries(roles.ROLES)) {
      assert.ok(role.name && role.tagline && role.icon, id);
      assert.ok(role.chips.length >= 3 && role.chips.every(([label, text]) => label && text), `${id} has quick actions`);
      if (id !== "assistant") assert.ok(role.instructions.length > 120 && role.board.length > 40, `${id} says what to do and how to use the board`);
    }
  });

  test("a saved choice is kept when valid, and a bad one falls back", () => {
    const good = roles.cleanRoles({ active: "teacher", audience: "child", pace: "slow", challenge: "tough", boardUse: "lots", topic: "  fractions  " });
    assert.deepStrictEqual([good.active, good.audience, good.pace, good.challenge, good.boardUse, good.topic], ["teacher", "child", "slow", "tough", "lots", "fractions"]);
    const bad = roles.cleanRoles({ active: "wizard", audience: "alien", pace: 5, challenge: null, boardUse: {}, topic: "x".repeat(900) });
    assert.deepStrictEqual([bad.active, bad.audience, bad.pace, bad.challenge, bad.boardUse], ["assistant", "adult", "normal", "balanced", "auto"]);
    assert.strictEqual(bad.topic.length, 160);
    assert.deepStrictEqual(roles.cleanRoles(undefined), roles.cleanRoles({}));
  });

  test("your own roles: named, limited, with quick actions made of a label and words", () => {
    const r = roles.cleanRoles({
      active: "chef",
      custom: [
        { id: "chef", name: "  Chef  ", tagline: "Teaches recipes", instructions: "You are my chef.", chips: [["Next step", "What's the next step?"], ["", "no label"], ["no words", ""], "junk"] },
        { name: "" },
        { id: "teacher", name: "Fake teacher" },
        ...Array.from({ length: 20 }, (_, i) => ({ name: `Extra ${i}` })),
      ],
    });
    assert.strictEqual(r.active, "chef");
    assert.strictEqual(r.custom[0].name, "Chef");
    assert.deepStrictEqual(r.custom[0].chips, [["Next step", "What's the next step?"]]);
    assert.ok(r.custom.length <= roles.MAX_CUSTOM_ROLES);
    assert.ok(!r.custom.some((c) => c.id === "teacher" || !c.name), "no nameless role and none that takes a built-in's id");
    assert.strictEqual(new Set(r.custom.map((c) => c.id)).size, r.custom.length, "every id is its own");
    // A role you deleted can't stay the active one
    assert.strictEqual(roles.cleanRoles({ active: "gone", custom: [] }).active, "assistant");
  });

  test("the companion adds nothing to the instructions; any other role says what to do", () => {
    assert.deepStrictEqual(roles.promptSection(roles.cleanRoles({}), "Sam"), []);
    const lines = roles.promptSection(roles.cleanRoles({ active: "teacher", audience: "child", pace: "slow", challenge: "gentle", topic: "fractions", boardUse: "lots" }), "Sam").join("\n");
    assert.match(lines, /# Your role right now: Teacher/);
    assert.match(lines, /Sam's teacher/);
    assert.doesNotMatch(lines, /\{user\}/);
    assert.match(lines, /fractions/);
    assert.match(lines, /child/);
    assert.match(lines, /slowly/);
    assert.match(lines, /On the whiteboard:/);
    assert.match(lines, /a lot/);
    const own = roles.promptSection(roles.cleanRoles({ active: "quiz", custom: [{ id: "quiz", name: "Quiz master", instructions: "Ask {user} trivia." }] }), "Sam").join("\n");
    assert.match(own, /Quiz master/);
    assert.match(own, /Ask Sam trivia\./);
  });

  test("the role reaches the AI's instructions through the settings, and a new one replaces the old", () => {
    settings.set({ roles: { active: "coach", topic: "my first marathon" } });
    const s = settings.get();
    assert.strictEqual(s.roles.active, "coach");
    const withCoach = prompt.build(s, {});
    assert.match(withCoach, /# Your role right now: Coach/);
    assert.match(withCoach, /my first marathon/);
    settings.set({ roles: { active: "assistant", topic: "" } });
    assert.doesNotMatch(prompt.build(settings.get(), {}), /Your role right now/);
  });

  test("the picker and the pane read the same role the helper uses", () => {
    assert.strictEqual(roles.activeRole({ active: "teacher" }).id, "teacher");
    assert.strictEqual(roles.activeRole({ active: "nope" }).id, "assistant");
    const mine = roles.activeRole({ active: "x", custom: [{ id: "x", name: "Mine", tagline: "", instructions: "", board: "", chips: [] }] });
    assert.deepStrictEqual([mine.custom, mine.name], [true, "Mine"]);
    assert.strictEqual(roles.allRoles({ custom: [{ id: "x", name: "Mine" }] }).length, roles.ROLE_IDS.length + 1);
    assert.deepStrictEqual(roles.roleChips({ active: "teacher" }).map((c) => c[0]), roles.ROLES.teacher.chips.map((c) => c[0]));
  });
});
