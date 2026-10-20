// A mission's plan: what the manager's JSON becomes, what is taken away, how it is edited before you approve it,
// and which step runs next (steps with the same specialist go together, so models aren't swapped back and forth).
const { test, describe } = require("node:test");
const assert = require("node:assert");
const plan = require("../server/missions/plan");

const OPTIONS = { roles: ["general", "coding", "writing", "research", "manager"], tools: ["web_search", "read_webpage", "send_gmail", "run_command", "create_file", "save_note_file", "send_telegram"], limits: { maxMinutes: 60, maxSteps: 25, maxCloudCalls: 60 }, caps: { maxMinutes: 120, maxSteps: 50, maxCloudCalls: 100 } };

const RAW = {
  summary: "Research and mail it",
  steps: [
    { title: "Search", role: "research", tools: ["web_search", "read_webpage"], inputs: "Find three sources", output: "Notes with links" },
    { title: "Write", role: "writing", tools: ["create_file"], inputs: "Write the report", output: "report.md", dependsOn: ["s1"] },
    { title: "Mail", role: "general", tools: ["send_gmail"], inputs: "Mail it", dependsOn: ["s2"], actions: [{ type: "email_send", to: ["Ann@X.com"], subject: "Report" }] },
  ],
};

describe("Normalising a plan", () => {
  test("steps get ids, known roles and tools, and the risk is worked out from the actions", () => {
    const p = plan.normalize(RAW, OPTIONS);
    assert.deepStrictEqual(p.steps.map((s) => s.id), ["s1", "s2", "s3"]);
    assert.deepStrictEqual(p.steps.map((s) => s.role), ["research", "writing", "general"]);
    assert.deepStrictEqual(p.steps.map((s) => s.risk), ["read", "write", "external"]);
    assert.strictEqual(p.risk, "external");
    assert.deepStrictEqual(p.steps[2].actions[0].to, ["ann@x.com"]);
    assert.strictEqual(p.steps[2].actions[0].risk, "external");
    assert.match(p.actions[0].summary, /Send an email to ann@x.com/);
    assert.deepStrictEqual(p.steps[1].dependsOn, ["s1"]);
  });

  test("the manager can't set a risk: it comes from the type", () => {
    const p = plan.normalize({ steps: [{ title: "x", actions: [{ type: "command", command: "npm test", risk: "read" }] }] }, OPTIONS);
    assert.strictEqual(p.steps[0].actions[0].risk, "system");
    assert.strictEqual(p.risk, "system");
  });

  test("a tool that needs an action the plan doesn't list is taken away", () => {
    const p = plan.normalize({ steps: [{ title: "Mail", tools: ["send_gmail", "web_search", "run_command", "send_telegram"], actions: [] }] }, OPTIONS);
    assert.deepStrictEqual(p.steps[0].tools, ["web_search"], "no email, command or Telegram action was listed, so none of them can be used");
    const listed = plan.normalize({ steps: [{ title: "Run", tools: ["run_command"], actions: [{ type: "command", command: "npm test" }] }] }, OPTIONS);
    assert.deepStrictEqual(listed.steps[0].tools, ["run_command"]);
  });

  test("actions that aren't complete or known are dropped", () => {
    const p = plan.normalize({ steps: [{ title: "x", actions: [{ type: "email_send", to: [], subject: "x" }, { type: "email_send", to: ["a@b.com"] }, { type: "fly" }, { type: "command" }, { type: "data_write", kind: "weather" }, { type: "file_delete", path: "~/Downloads/a.zip" }] }] }, OPTIONS);
    assert.deepStrictEqual(p.steps[0].actions.map((a) => a.type), ["file_delete"]);
    assert.strictEqual(p.steps[0].risk, "destructive");
  });

  test("an unknown role falls back to general; unknown tools and dependencies are dropped; the number of steps is capped", () => {
    const p = plan.normalize({ steps: [{ title: "a", role: "wizard", tools: ["nope"], dependsOn: ["s7"] }, ...Array.from({ length: 40 }, (_, i) => ({ title: `s${i}` }))] }, OPTIONS);
    assert.strictEqual(p.steps[0].role, "general");
    assert.deepStrictEqual(p.steps[0].tools, []);
    assert.deepStrictEqual(p.steps[0].dependsOn, []);
    assert.strictEqual(p.steps.length, 20);
  });

  test("limits start from the settings and never go over the caps", () => {
    assert.deepStrictEqual(plan.normalize({ steps: [{ title: "x" }] }, OPTIONS).limits, { maxMinutes: 60, maxSteps: 25, maxCloudCalls: 60 });
    const big = plan.normalize({ steps: [{ title: "x" }], limits: { maxMinutes: 9999, maxSteps: 999, maxCloudCalls: 999 } }, OPTIONS);
    assert.deepStrictEqual(big.limits, { maxMinutes: 120, maxSteps: 50, maxCloudCalls: 100 });
  });

  test("garbage in gives an empty plan, not an error", () => {
    assert.deepStrictEqual(plan.normalize(null, OPTIONS).steps, []);
    assert.deepStrictEqual(plan.normalize({ steps: "no" }, OPTIONS).steps, []);
  });
});

describe("Editing before approving", () => {
  test("remove a step: its dependants stop depending on it, and its actions go with it", () => {
    const p = plan.normalize(RAW, OPTIONS);
    const edited = plan.edit(p, { remove: ["s2"] }, { caps: OPTIONS.caps });
    assert.deepStrictEqual(edited.steps.map((s) => s.id), ["s1", "s3"]);
    assert.deepStrictEqual(edited.steps[1].dependsOn, []);
    const noMail = plan.edit(p, { remove: ["s3"] }, { caps: OPTIONS.caps });
    assert.strictEqual(noMail.risk, "write");
    assert.deepStrictEqual(noMail.actions, []);
  });

  test("remove one action: the step loses the right to use the tool that needed it", () => {
    const p = plan.normalize(RAW, OPTIONS);
    const edited = plan.edit(p, { removeAction: ["s3.1"] }, { caps: OPTIONS.caps });
    assert.deepStrictEqual(edited.steps[2].actions, []);
    assert.deepStrictEqual(edited.steps[2].tools, []);
    assert.strictEqual(edited.risk, "write");
  });

  test("change what a step says, and the limits (within the caps)", () => {
    const p = plan.normalize(RAW, OPTIONS);
    const edited = plan.edit(p, { edit: { s1: { title: "Search wider", inputs: "Five sources" } }, limits: { maxMinutes: 500, maxSteps: 3 } }, { caps: OPTIONS.caps });
    assert.strictEqual(edited.steps[0].title, "Search wider");
    assert.strictEqual(edited.steps[0].inputs, "Five sources");
    assert.strictEqual(edited.limits.maxMinutes, 120);
    assert.strictEqual(edited.limits.maxSteps, 3);
  });
});

describe("Which step runs next", () => {
  const steps = (list) => ({ steps: list.map((s) => ({ tools: [], dependsOn: [], ...s })) });

  test("a step waits for what it depends on", () => {
    const p = steps([{ id: "a", role: "coding", status: "pending" }, { id: "b", role: "coding", status: "pending", dependsOn: ["a"] }]);
    assert.strictEqual(plan.pickNext(p).id, "a");
    p.steps[0].status = "done";
    assert.strictEqual(plan.pickNext(p).id, "b");
    p.steps[1].status = "done";
    assert.strictEqual(plan.pickNext(p), null);
  });

  test("of the steps that can run now, the one that uses the loaded model goes first", () => {
    const p = steps([{ id: "a", role: "writing", status: "pending" }, { id: "b", role: "coding", status: "pending" }, { id: "c", role: "writing", status: "pending" }]);
    assert.strictEqual(plan.pickNext(p, "coding").id, "b");
    assert.strictEqual(plan.pickNext(p, "writing").id, "a");
    assert.strictEqual(plan.pickNext(p, null).id, "a");
    p.steps[0].status = "done";
    assert.strictEqual(plan.pickNext(p, "writing").id, "c");
  });
});
