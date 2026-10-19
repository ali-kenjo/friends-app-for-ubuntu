// Missions that start by themselves: schedules (every morning, every Friday), triggers (a file appears, the disk fills
// up) and watches (alerts without a model). They run from the tray, so none of this needs a window.
const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-automations-"));
Object.assign(process.env, { FRIENDS_DATA_DIR: path.join(tempDir, "data"), KEYRING_BACKEND: "file", LOG_LEVEL: "error" });

describe("Automations", () => {
  let automations, system, store;
  const fired = [];
  const alerts = [];
  const plan = { summary: "x", steps: [{ id: "s1", title: "Do", role: "general", tools: [], dependsOn: [], actions: [] }], actions: [], limits: { maxMinutes: 5, maxSteps: 5, maxCloudCalls: 5 } };
  const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

  before(() => {
    automations = require("../server/missions/automations");
    system = require("../server/missions/system");
    store = require("../server/missions/store");
    automations.init({ fire: (goal, p, options) => (fired.push({ goal, plan: p, options }), { id: `m-fake-${fired.length}` }), alert: (a) => alerts.push(a) });
    automations.stop();
  });
  after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  beforeEach(() => {
    fired.length = 0;
    alerts.length = 0;
    for (const a of automations.all()) automations.remove(a.id);
  });

  test("when a schedule next fires: every day, weekdays, a weekday, an interval", () => {
    const n = automations.nextAfter;
    assert.strictEqual(n({ kind: "daily", time: "08:00" }, at(2026, 10, 19, 7, 0)), at(2026, 10, 19, 8, 0));
    assert.strictEqual(n({ kind: "daily", time: "08:00" }, at(2026, 10, 19, 8, 0)), at(2026, 10, 20, 8, 0), "after the time: tomorrow");
    // 2026-10-19 is a Monday: "every Friday" is the 23rd, "weekdays" skips the weekend
    assert.strictEqual(n({ kind: "weekly", days: [5], time: "09:30" }, at(2026, 10, 19, 12, 0)), at(2026, 10, 23, 9, 30));
    assert.strictEqual(n({ kind: "weekly", days: [1, 2, 3, 4, 5], time: "08:00" }, at(2026, 10, 23, 12, 0)), at(2026, 10, 26, 8, 0));
    assert.strictEqual(n({ kind: "interval", minutes: 90 }, 1000000), 1000000 + 90 * 60000);
    assert.strictEqual(n({ kind: "interval", minutes: 1 }, 0), 5 * 60000, "no more often than every five minutes");
  });

  test("a schedule or a trigger is needed, and so is an approved plan", () => {
    assert.throws(() => automations.create({ goal: "x", plan }), /when it should run/);
    assert.throws(() => automations.create({ goal: "x", schedule: { kind: "daily", time: "08:00" } }), /approved plan/);
    assert.ok(automations.create({ goal: "x", plan, schedule: { kind: "daily", time: "08:00" } }).id);
    assert.strictEqual(automations.cleanSchedule({ kind: "weekly", days: [9] }), null);
    assert.deepStrictEqual(automations.cleanSchedule({ kind: "weekdays", time: "7:00" }), { kind: "weekly", days: [1, 2, 3, 4, 5], time: "08:00" });
    assert.deepStrictEqual(automations.cleanTrigger({ kind: "disk", percent: 5 }), { kind: "disk", mount: "/", percent: 50 });
    assert.strictEqual(automations.cleanTrigger({ kind: "file" }), null);
  });

  test("a schedule starts the approved plan when its time comes, once, and not when it's switched off", async () => {
    const a = automations.create({ name: "Morning", goal: "Summarise my inbox", plan, schedule: { kind: "daily", time: "08:00" } });
    const due = automations.find(a.id).nextRun;
    await automations.tick(due - 60000);
    assert.strictEqual(fired.length, 0, "not yet");
    await automations.tick(due + 1000);
    assert.strictEqual(fired.length, 1);
    assert.strictEqual(fired[0].options.source, "schedule");
    assert.strictEqual(fired[0].options.automationId, a.id);
    assert.match(fired[0].goal, /Summarise my inbox/);
    assert.match(fired[0].goal, /Started because: its schedule/);
    assert.deepStrictEqual(fired[0].plan.steps.map((s) => s.title), ["Do"], "exactly the plan that was approved");
    assert.ok(automations.find(a.id).nextRun > due, "the next run is later");
    await automations.tick(due + 2000);
    assert.strictEqual(fired.length, 1, "not twice");
    automations.update(a.id, { enabled: false });
    await automations.tick(automations.find(a.id).nextRun + 1000);
    assert.strictEqual(fired.length, 1, "off means off");
  });

  test("a run that is still going isn't started again on top of itself", async () => {
    const a = automations.create({ goal: "Slow one", plan, schedule: { kind: "interval", minutes: 5 } });
    const running = store.create({ goal: "x", source: "schedule" });
    running.status = "running";
    automations.find(a.id).runs.push(running.id);
    await automations.tick(automations.find(a.id).nextRun + 1000);
    assert.strictEqual(fired.length, 0);
    running.status = "done";
    await automations.tick(automations.find(a.id).nextRun + 1000);
    assert.strictEqual(fired.length, 1);
  });

  test("a file appearing in a folder starts it (the first look only learns what is there)", async () => {
    const dir = path.join(tempDir, "watched");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "old.pdf"), "x");
    automations.create({ goal: "Sort the new file", plan, trigger: { kind: "file", folder: dir, pattern: "*.pdf" } });
    await automations.tick();
    assert.strictEqual(fired.length, 0, "old.pdf was already there");
    fs.writeFileSync(path.join(dir, "notes.txt"), "x");
    await automations.tick();
    assert.strictEqual(fired.length, 0, "not a pdf");
    fs.writeFileSync(path.join(dir, "invoice.pdf"), "x");
    await automations.tick();
    assert.strictEqual(fired.length, 1);
    assert.match(fired[0].goal, /invoice\.pdf/);
    await automations.tick();
    assert.strictEqual(fired.length, 1, "it saw it already");
  });

  test("the disk filling up starts it once, and again only after it has dropped well below the limit", async () => {
    const real = system.snapshot;
    let used = 50;
    system.snapshot = async () => ({ disks: [{ mount: "/", usedPercent: used, freeGb: 10, totalGb: 100 }] });
    try {
      automations.create({ goal: "Clean up the disk", plan, trigger: { kind: "disk", mount: "/", percent: 90 } });
      await automations.tick(1);
      assert.strictEqual(fired.length, 0);
      used = 93;
      await automations.tick(Date.now() + 120000);
      assert.strictEqual(fired.length, 1);
      assert.match(fired[0].goal, /93% full/);
      await automations.tick(Date.now() + 240000);
      assert.strictEqual(fired.length, 1, "still over: no second run");
      used = 88;
      await automations.tick(Date.now() + 360000);
      used = 94;
      await automations.tick(Date.now() + 480000);
      assert.strictEqual(fired.length, 1, "88 isn't far enough below 90 to re-arm");
      used = 60;
      await automations.tick(Date.now() + 600000);
      used = 95;
      await automations.tick(Date.now() + 720000);
      assert.strictEqual(fired.length, 2, "after dropping to 60 it fires again");
    } finally {
      system.snapshot = real;
    }
  });

  test("a watch tells you about trouble without any model, once per problem", async () => {
    const real = system.snapshot;
    let snap = { cpuPercent: 20, memory: { usedPercent: 40, availableGb: 8 }, disks: [{ mount: "/", usedPercent: 50, freeGb: 100 }], gpu: { temperatureC: 55 }, failedServices: [] };
    system.snapshot = async () => snap;
    try {
      const a = automations.create({ name: "Watch my laptop", watch: { everyMinutes: 5, gpuTemp: 80 } });
      assert.strictEqual(fired.length, 0);
      await automations.tick();
      assert.strictEqual(alerts.length, 0, "all is well");
      snap = { ...snap, gpu: { temperatureC: 91 }, failedServices: ["foo.service"] };
      automations.find(a.id).lastRun = 0;
      await automations.tick();
      assert.strictEqual(alerts.length, 1);
      assert.match(alerts[0].body, /graphics card is at 91/);
      assert.match(alerts[0].body, /foo\.service/);
      automations.find(a.id).lastRun = 0;
      await automations.tick();
      assert.strictEqual(alerts.length, 1, "the same trouble isn't repeated");
      snap = { ...snap, gpu: { temperatureC: 55 }, failedServices: [] };
      automations.find(a.id).lastRun = 0;
      await automations.tick();
      snap = { ...snap, cpuPercent: 99 };
      automations.find(a.id).lastRun = 0;
      await automations.tick();
      assert.strictEqual(alerts.length, 2, "new trouble is");
      assert.strictEqual(fired.length, 0, "no mission, no model");
      assert.strictEqual(automations.all().find((x) => x.id === a.id).alerts.length, 2);
    } finally {
      system.snapshot = real;
    }
  });

  test("they're kept on disk", () => {
    const a = automations.create({ name: "Kept", goal: "x", plan, schedule: { kind: "daily", time: "08:00" } });
    automations.reload();
    assert.ok(automations.all().some((x) => x.id === a.id && x.name === "Kept"));
    assert.strictEqual(automations.describe(automations.find(a.id)), "Every day at 08:00");
  });
});
