// The mission engine, end to end, against a fake Gemini and a fake Ollama: questions, the plan, the approval,
// the scope it enforces (an unlisted risky action pauses and asks), stop, resuming after a restart, Private mode,
// escalation to the manager, rate limits, limits, and the report in the vault. Nothing leaves this computer.
const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const fakeAi = require("./helpers/fake-ai");
const { waitFor } = fakeAi;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-missions-"));
Object.assign(process.env, {
  FRIENDS_DATA_DIR: path.join(tempDir, "data"),
  KEYRING_BACKEND: "file",
  LOG_LEVEL: "error",
  FRIENDS_CLOUD_GAP_MS: "0",
  FRIENDS_FAKE_GPU: JSON.stringify({ totalMb: 6144, usedMb: 400 }),
  FRIENDS_CLOUD_SHORT_WAIT_MS: "0",
  FRIENDS_GEMINI_RETRY_MS: "0",
});
delete process.env.GEMINI_API_KEY;

describe("The mission engine", () => {
  const ai = fakeAi.create();
  const dirs = { allowed: path.join(tempDir, "allowed"), workspace: path.join(tempDir, "workspace"), vault: path.join(tempDir, "vault"), other: path.join(tempDir, "elsewhere") };
  let settings, brains, runner, store, files, models, cloud;

  const setSettings = (change) => settings.set(change(JSON.parse(JSON.stringify(settings.get()))));
  const mission = (id) => store.get(id);

  // A mission to the point where its plan waits for approval
  async function planned(raw, { questions = [], goal = "Do the thing" } = {}) {
    ai.behave.plan = raw;
    ai.behave.questions = questions;
    const made = runner.create(goal, { source: "app" });
    await waitFor(() => ["awaiting_approval", "clarifying", "failed", "paused"].includes(mission(made.id).status), 8000, "the plan");
    return made.id;
  }
  const finished = (id, states = ["done", "failed", "stopped", "paused"]) => waitFor(() => states.includes(mission(id).status), 15000, `mission ${id} to settle (it is ${mission(id).status})`);

  async function drive(raw, options) {
    const id = await planned(raw, options);
    assert.strictEqual(mission(id).status, "awaiting_approval", mission(id).error);
    runner.approve(id);
    await finished(id);
    return id;
  }
  const step = (title, extra = {}) => ({ title, role: "general", tools: [], inputs: title, output: "A result", ...extra });
  const outputOf = (id, n = 0) => mission(id).plan.steps[n].output;
  // What a failing assertion should say about the mission
  const why = (id) => `status ${mission(id).status}; pause ${JSON.stringify(mission(id).pause)}; error ${mission(id).error}; ${mission(id).timeline.slice(-4).map((t) => t.text).join(" | ")}`;
  // The step a scripted model is answering
  const stepOf = (ctx) => /YOUR STEP: (.+)/.exec(ctx.prompt)?.[1]?.trim() || "";

  before(async () => {
    await ai.start();
    process.env.FRIENDS_GEMINI_API = ai.cloudUrl();
    settings = require("../server/settings");
    brains = require("../server/brains");
    runner = require("../server/missions/runner");
    store = require("../server/missions/store");
    files = require("../server/files");
    models = require("../server/models");
    cloud = require("../server/missions/cloud");
    for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
    setSettings((s) => ({
      ...s,
      permissions: { ...s.permissions, folders: [dirs.allowed], files: { create: true, read: true, edit: true, delete: true }, dirs: { create: true, read: true, edit: true, delete: true } },
      missions: { ...s.missions, workspace: dirs.workspace },
      localNotes: { ...s.localNotes, folder: dirs.vault },
    }));
    await brains.saveBrain({ provider: "gemini", name: "Gemini", model: "gemini-3.8-flash", key: "test-key" });
    await brains.saveBrain({ provider: "local", protocol: "ollama", name: "tiny", baseUrl: ai.localUrl(), model: "tiny:latest", contextSize: 8192 });
  });

  after(async () => {
    for (const m of store.all()) if (["running", "paused", "planning"].includes(m.status)) runner.stop(m.id);
    await ai.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    ai.reset();
    models.forget(); // (the fake Ollama has nothing loaded again)
    ai.behave.cloudStream = null;
    ai.behave.localStream = null;
    ai.behave.review = { ok: true, reason: "fine", fix: "" };
    ai.behave.models = [{ name: "tiny:latest", size: 800e6 }, { name: "coder:latest", size: 4.2e9 }];
    setSettings((s) => ({ ...s, privacy: { ...s.privacy, localOnly: false }, specialists: { ...s.specialists, roles: [] } }));
    cloud.forget();
  });

  describe("From a goal to a report", () => {
    test("it asks what it needs, plans, waits for approval, runs on the specialists, and saves the report in the vault", async () => {
      ai.behave.localStream = (ctx) => ({ content: `Result of: ${stepOf(ctx)}` });
      const id = await planned({ title: "Laptops", summary: "Find laptops, write it up", steps: [step("Find laptops", { role: "research", output: "A list" }), step("Write the report", { role: "writing", dependsOn: ["s1"], output: "A report" })] }, { questions: [{ id: "q1", text: "What is the budget?" }], goal: "Research budget laptops and write a report" });
      assert.strictEqual(mission(id).status, "clarifying");
      assert.deepStrictEqual(mission(id).clarify.questions.map((q) => q.text), ["What is the budget?"]);

      ai.behave.questions = [];
      runner.answer(id, [{ id: "q1", text: "800 euros" }]);
      await waitFor(() => mission(id).status === "awaiting_approval", 8000, "the plan after the answers");
      const plan = mission(id).plan;
      assert.strictEqual(plan.steps.length, 2);
      assert.strictEqual(mission(id).title, "Laptops");
      assert.match(ai.hits.cloud.find((h) => h.kind === "plan").prompt, /800 euros/, "the planner got the answers");
      assert.strictEqual(ai.hits.local.filter((h) => h.kind === "step").length, 0, "nothing runs before you approve");

      runner.approve(id);
      await finished(id);
      const m = mission(id);
      assert.strictEqual(m.status, "done", m.error);
      assert.deepStrictEqual(m.plan.steps.map((s) => s.status), ["done", "done"]);
      assert.match(outputOf(id, 0), /Result of: Find laptops/);
      assert.match(ai.hits.local.find((h) => h.kind === "step").prompt, /Research budget laptops/);
      assert.match(ai.hits.local.filter((h) => h.kind === "step")[1].prompt, /Result of: Find laptops/, "the second step gets the first's result");
      // The report is a note in the vault, and in the mission
      assert.ok(m.report.note, "a note path");
      assert.ok(fs.existsSync(path.join(dirs.vault, m.report.note)), "the note is in the vault");
      assert.match(fs.readFileSync(path.join(dirs.vault, m.report.note), "utf8"), /The report/);
      assert.match(m.report.note, /^Missions\//);
      // The audit log says what happened
      const audit = store.readAudit(id).map((e) => e.type);
      for (const type of ["plan", "approved", "route", "model-used", "done"]) assert.ok(audit.includes(type), `${type} in the audit log: ${audit}`);
      assert.ok(m.workdir.startsWith(fs.realpathSync(dirs.workspace)), "its own folder is in the workspace");
    });

    test("a goal that needs no questions goes straight to the plan", async () => {
      const id = await planned({ title: "Quick", summary: "x", steps: [step("Only step")] });
      assert.strictEqual(mission(id).status, "awaiting_approval");
      assert.strictEqual(mission(id).clarify.questions.length, 0);
      runner.stop(id);
    });

    test("the plan can be edited before approval, and not after", async () => {
      const id = await planned({ title: "Edit", summary: "x", steps: [step("One"), step("Two"), step("Three")] });
      runner.editPlan(id, { remove: ["s2"], edit: { s1: { title: "First" } } });
      assert.deepStrictEqual(mission(id).plan.steps.map((s) => s.title), ["First", "Three"]);
      runner.approve(id);
      assert.throws(() => runner.editPlan(id, { remove: ["s1"] }), /before you approve/);
      await finished(id);
      assert.strictEqual(mission(id).status, "done");
    });

    test("a plan that can't be read fails with a message, and planning can be tried again", async () => {
      ai.behave.plan = { title: "Empty", steps: [] };
      const made = runner.create("Do something odd");
      await waitFor(() => mission(made.id).status === "failed", 8000, "failure");
      assert.match(mission(made.id).error, /any steps/);
      ai.behave.plan = { title: "Better", summary: "x", steps: [step("A step")] };
      runner.resume(made.id);
      await waitFor(() => mission(made.id).status === "awaiting_approval", 8000, "a plan the second time");
      runner.stop(made.id);
    });
  });

  describe("Approve once, with guardrails", () => {
    const command = (c) => ({ type: "command", command: c });
    const runCommandScript = (...commands) => (ctx) => (ctx.round < commands.length ? { tools: [{ name: "run_command", args: { command: commands[ctx.round] } }] } : { content: `Ran ${commands.length} commands.` });

    test("an action the plan lists runs without asking, in the mission's own folder, with a clean environment", async () => {
      ai.behave.localStream = runCommandScript("pwd", "echo \"home=$HOME key=${GEMINI_API_KEY:-none}\"");
      const id = await drive({ title: "Cmd", summary: "x", steps: [step("Run", { tools: ["run_command"], actions: [command("pwd"), command("echo *")] })] });
      assert.strictEqual(mission(id).status, "done", why(id));
      const audit = store.readAudit(id).filter((e) => e.type === "tool");
      assert.strictEqual(audit.length, 2);
      assert.ok(audit.every((e) => e.ok), JSON.stringify(audit));
      assert.ok(!store.readAudit(id).some((e) => e.type === "approval-asked"), "nothing was asked");
      assert.match(audit[0].result, new RegExp(mission(id).workdir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(audit[1].result, new RegExp(`home=${mission(id).workdir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "HOME is the mission's folder, not yours");
      assert.match(audit[1].result, /key=none/, "no key leaks into a command");
    });

    test("an unlisted command pauses the mission and asks; saying no lets it carry on without it", async () => {
      ai.behave.localStream = runCommandScript("echo unlisted");
      const id = await planned({ title: "Ask", summary: "x", steps: [step("Run", { tools: ["run_command"], actions: [command("echo listed")] })] });
      runner.approve(id);
      await waitFor(() => mission(id).status === "paused" && mission(id).pause?.kind === "approval", 8000, "the question");
      const request = mission(id).pause.request;
      assert.strictEqual(request.risk, "system");
      assert.match(request.summary, /echo unlisted/);
      assert.match(request.why, /isn't in the plan/);
      runner.decide(id, request.id, false);
      await finished(id, ["done", "failed"]);
      assert.strictEqual(mission(id).status, "done");
      const asked = store.readAudit(id).filter((e) => e.type === "tool" && e.approval);
      assert.strictEqual(asked[0].approval, "declined");
      assert.match(store.readAudit(id).filter((e) => e.type === "tool").at(-1).result || "", /declined/, "the model was told the user said no");
      assert.ok(!mission(id).scope.some((a) => a.grantedAt), "a declined action isn't added to what is allowed");
    });

    test("saying yes lets that one action run, and it is remembered for this mission", async () => {
      ai.behave.localStream = runCommandScript("echo once", "echo once");
      const id = await planned({ title: "Allow", summary: "x", steps: [step("Run", { tools: ["run_command"], actions: [command("echo listed")] })] });
      runner.approve(id);
      await waitFor(() => mission(id).pause?.kind === "approval", 8000, "the question");
      runner.decide(id, mission(id).pause.request.id, true);
      await finished(id);
      assert.strictEqual(mission(id).status, "done", mission(id).error);
      assert.strictEqual(store.readAudit(id).filter((e) => e.type === "approval-asked").length, 1, "asked once, not twice, for the same thing");
      assert.ok(mission(id).scope.some((a) => a.grantedAt && /echo once/.test(a.summary)));
    });

    test("sudo and installs always ask, even when the plan lists them", async () => {
      ai.behave.localStream = runCommandScript("sudo -n true");
      const id = await planned({ title: "Sudo", summary: "x", steps: [step("Run", { tools: ["run_command"], actions: [command("sudo -n true")] })] });
      runner.approve(id);
      await waitFor(() => mission(id).pause?.kind === "approval", 8000, "the question");
      assert.match(mission(id).pause.request.why, /always asks/);
      runner.decide(id, mission(id).pause.request.id, false);
      await finished(id);
      assert.ok(store.readAudit(id).some((e) => e.approval === "declined"));
    });

    test("a tool that the step wasn't given can't be used", async () => {
      ai.behave.localStream = (ctx) => (ctx.round === 0 ? { tools: [{ name: "run_command", args: { command: "echo hi" } }] } : { content: "done" });
      const id = await drive({ title: "NoTool", summary: "x", steps: [step("Just think", { tools: [] })] });
      assert.strictEqual(mission(id).status, "done");
      const tool = store.readAudit(id).find((e) => e.type === "tool");
      assert.ok(!tool.ok);
      assert.match(tool.denied, /not in this step's tools/);
    });

    test("files: the mission's folder is free, an allowed folder needs listing, anything else is refused, and deleting goes to the trash", async () => {
      const inside = path.join(dirs.allowed, "listed");
      const unlisted = path.join(dirs.allowed, "unlisted");
      const trashed = [];
      const realRemove = files.remove;
      files.remove = async (real, useTrash) => (trashed.push({ real, useTrash }), { path: real, trash: useTrash });
      try {
        fs.mkdirSync(inside, { recursive: true });
        fs.mkdirSync(unlisted, { recursive: true });
        fs.writeFileSync(path.join(inside, "old.txt"), "old");
        ai.behave.localStream = (ctx) => {
          const calls = [
            { name: "create_file", args: { path: "mine.txt", content: "in my folder" } },
            { name: "create_file", args: { path: path.join(inside, "new.txt"), content: "in a listed folder" } },
            { name: "create_file", args: { path: path.join(dirs.other, "no.txt"), content: "nope" } },
            { name: "delete_item", args: { path: path.join(inside, "old.txt") } },
          ];
          return ctx.round < calls.length ? { tools: [calls[ctx.round]] } : { content: "done" };
        };
        const id = await drive({
          title: "Files",
          summary: "x",
          steps: [step("Write", { tools: ["create_file", "delete_item"], actions: [{ type: "file_write", path: inside }, { type: "file_delete", path: path.join(inside, "old.txt") }] })],
        });
        assert.strictEqual(mission(id).status, "done", mission(id).error);
        assert.ok(fs.existsSync(path.join(mission(id).workdir, "mine.txt")), "a file in its own folder");
        assert.strictEqual(fs.readFileSync(path.join(inside, "new.txt"), "utf8"), "in a listed folder");
        assert.ok(!fs.existsSync(path.join(dirs.other, "no.txt")), "outside the allowed folders: refused");
        const tools = store.readAudit(id).filter((e) => e.type === "tool");
        assert.match(tools[2].denied, /outside the allowed folders/);
        assert.ok(!store.readAudit(id).some((e) => e.type === "approval-asked"), "nothing outside the plan was asked: it was refused or listed");
        assert.deepStrictEqual(trashed.map((t) => t.useTrash), [true], "deleting always means the trash");
      } finally {
        files.remove = realRemove;
      }
    });

    test("a file in an allowed folder that the plan doesn't list pauses and asks", async () => {
      const target = path.join(dirs.allowed, "unlisted", "x.txt");
      ai.behave.localStream = (ctx) => (ctx.round === 0 ? { tools: [{ name: "create_file", args: { path: target, content: "x" } }] } : { content: "done" });
      const id = await planned({ title: "Unlisted", summary: "x", steps: [step("Write", { tools: ["create_file"], actions: [] })] });
      runner.approve(id);
      await waitFor(() => mission(id).pause?.kind === "approval", 8000, "the question");
      assert.match(mission(id).pause.request.summary, /unlisted/);
      runner.decide(id, mission(id).pause.request.id, false);
      await finished(id);
      assert.ok(!fs.existsSync(target));
    });

    test("a mission that waits for you gives the model back to the others", async () => {
      ai.behave.localStream = (ctx) => (stepOf(ctx) === "Ask" && ctx.round === 0 ? { tools: [{ name: "run_command", args: { command: "echo needs-ok" } }] } : { content: `ok ${stepOf(ctx)}` });
      const a = await planned({ title: "Waiting", summary: "x", steps: [step("Ask", { tools: ["run_command"], actions: [{ type: "command", command: "echo listed" }] })] });
      const b = await planned({ title: "Other", summary: "x", steps: [step("Quick")] });
      runner.approve(a);
      await waitFor(() => mission(a).pause?.kind === "approval", 8000, "A's question");
      runner.approve(b);
      await finished(b, ["done"]); // B gets the model although A has not been answered
      assert.strictEqual(mission(a).status, "paused");
      runner.decide(a, mission(a).pause.request.id, false);
      await finished(a, ["done"]);
    });
  });

  describe("Stop, restart, limits", () => {
    test("Stop is immediate: a running command is killed", async () => {
      ai.behave.localStream = (ctx) => (ctx.round === 0 ? { tools: [{ name: "run_command", args: { command: "sleep 30" } }] } : { content: "done" });
      const id = await planned({ title: "Slow", summary: "x", steps: [step("Wait", { tools: ["run_command"], actions: [{ type: "command", command: "sleep *" }] })] });
      runner.approve(id);
      await waitFor(() => store.readAudit(id).length > 2 && mission(id).plan.steps[0].status === "running", 8000, "the command to start");
      await new Promise((r) => setTimeout(r, 300));
      const t0 = Date.now();
      runner.stop(id);
      assert.strictEqual(mission(id).status, "stopped", "stopped at once");
      await waitFor(() => !runner.live.get(id)?.running, 5000, "the run to end");
      assert.ok(Date.now() - t0 < 4000, "the 30 second command didn't have to finish");
      assert.strictEqual(mission(id).status, "stopped");
    });

    test("after a restart it picks up where it was", async () => {
      ai.behave.localStream = (ctx) => ({ content: `Result of: ${stepOf(ctx)}` });
      const id = await planned({ title: "Restart", summary: "x", steps: [step("First"), step("Second", { dependsOn: ["s1"] })] });
      // Make it look like the helper died while the first step was done and the second was running
      const m = mission(id);
      m.scope = [];
      m.approvedAt = Date.now();
      m.limits = m.plan.limits;
      m.workdir = path.join(dirs.workspace, "restart-test");
      fs.mkdirSync(m.workdir, { recursive: true });
      m.plan.steps[0].status = "done";
      m.plan.steps[0].output = "Result of: First";
      m.plan.steps[1].status = "running";
      m.status = "running";
      store.save(m);
      store.reload();
      runner.live.clear();
      runner.recover();
      await finished(id);
      assert.strictEqual(mission(id).status, "done", mission(id).error);
      assert.deepStrictEqual(mission(id).plan.steps.map((s) => s.status), ["done", "done"]);
      assert.ok(!ai.hits.local.some((h) => h.kind === "step" && /YOUR STEP: First/.test(h.prompt)), "the finished step was not done again");
      assert.ok(store.readAudit(id).length > 0);
    });

    test("a step that had already sent or deleted something asks before it is run again", async () => {
      ai.behave.localStream = (ctx) => ({ content: "again" });
      const id = await planned({ title: "Careful", summary: "x", steps: [step("Send it")] });
      const m = mission(id);
      m.scope = [];
      m.approvedAt = Date.now();
      m.limits = m.plan.limits;
      m.workdir = path.join(dirs.workspace, "careful-test");
      fs.mkdirSync(m.workdir, { recursive: true });
      m.plan.steps[0].status = "running";
      m.plan.steps[0].effects = [{ tool: "send_gmail", summary: "Send an email to ann@x.com" }];
      m.status = "running";
      store.save(m);
      store.reload();
      runner.live.clear();
      runner.recover();
      await waitFor(() => mission(id).pause?.kind === "approval", 8000, "the question about repeating it");
      assert.match(mission(id).pause.request.summary, /Send an email to ann@x.com/);
      runner.decide(id, mission(id).pause.request.id, false);
      await finished(id);
      assert.strictEqual(mission(id).plan.steps[0].status, "skipped");
      assert.ok(!ai.hits.local.some((h) => h.kind === "step"), "it was not run again");
    });

    test("a limit pauses it with a clear message, and Continue doubles the limit", async () => {
      ai.behave.localStream = (ctx) => ({ content: `Result of: ${stepOf(ctx)}` });
      const id = await planned({ title: "Limits", summary: "x", steps: [step("One"), step("Two"), step("Three")], limits: { maxSteps: 1 } });
      runner.approve(id);
      await finished(id, ["paused"]);
      assert.strictEqual(mission(id).pause.kind, "limit");
      assert.match(mission(id).pause.message, /1 steps/);
      assert.strictEqual(mission(id).plan.steps[0].status, "done");
      runner.resume(id, { extend: true });
      await finished(id);
      assert.strictEqual(mission(id).status, "paused", "two steps: still over the doubled limit of 2");
      runner.resume(id, { extend: true });
      await finished(id, ["done"]);
      assert.strictEqual(mission(id).plan.steps.every((s) => s.status === "done"), true);
    });

    test("a command that runs too long is stopped", async () => {
      setSettings((s) => ({ ...s, missions: { ...s.missions, commandTimeoutSeconds: 5 } }));
      ai.behave.localStream = (ctx) => (ctx.round === 0 ? { tools: [{ name: "run_command", args: { command: "sleep 20", timeout_seconds: 1 } }] } : { content: "gave up on it" });
      const id = await drive({ title: "Timeout", summary: "x", steps: [step("Wait", { tools: ["run_command"], actions: [{ type: "command", command: "sleep *" }] })] });
      const tool = store.readAudit(id).find((e) => e.type === "tool");
      assert.match(tool.result, /longer than/);
    });
  });

  describe("Private mode, escalation and rate limits", () => {
    test("Private mode: the manager is a local model, the cloud is never asked", async () => {
      setSettings((s) => ({ ...s, privacy: { ...s.privacy, localOnly: true } }));
      ai.behave.localStream = (ctx) => ({ content: `Local result of: ${stepOf(ctx)}` });
      const id = await drive({ title: "Private", summary: "x", steps: [step("Do it", { check: true })] });
      assert.strictEqual(mission(id).status, "done", mission(id).error);
      assert.strictEqual(mission(id).private, true);
      assert.strictEqual(ai.hits.cloud.length, 0, "nothing went to the cloud");
      assert.ok(ai.hits.local.some((h) => h.kind === "plan"), "a local model planned");
      assert.ok(ai.hits.local.some((h) => h.kind === "report"), "and wrote the report");
    });

    test("Private mode: a step that can't be done locally pauses instead of going to the cloud", async () => {
      ai.behave.localStream = () => ({ content: "fine" });
      setSettings((s) => ({ ...s, privacy: { ...s.privacy, localOnly: true } }));
      const id = await planned({ title: "Look", summary: "x", steps: [step("Look at the screenshot", { role: "vision" })] });
      assert.strictEqual(mission(id).status, "awaiting_approval");
      // The local model goes away before the plan is approved
      const local = brains.ofKind("local")[0];
      brains.deleteBrain(local.id);
      try {
        runner.approve(id);
        await finished(id);
        assert.strictEqual(mission(id).status, "paused", why(id));
        assert.strictEqual(mission(id).pause.kind, "private");
        assert.match(mission(id).pause.message, /Private mode/);
        assert.strictEqual(ai.hits.cloud.length, 0, "the cloud was never asked");
      } finally {
        await brains.saveBrain({ provider: "local", protocol: "ollama", name: "tiny", baseUrl: ai.localUrl(), model: "tiny:latest", contextSize: 8192 });
      }
    });

    test("a local result that fails the manager's check is escalated to the cloud", async () => {
      ai.behave.localStream = (ctx) => ({ content: "a lazy answer" });
      ai.behave.cloudStream = (ctx) => [{ text: "A careful answer from the manager" }];
      let reviews = 0;
      ai.behave.review = () => (reviews++ === 0 ? { ok: false, reason: "too thin", fix: "Be specific" } : { ok: true, reason: "good" });
      const id = await drive({ title: "Escalate", summary: "x", steps: [step("Write", { role: "writing" })] });
      assert.strictEqual(mission(id).status, "done", mission(id).error);
      assert.match(outputOf(id), /careful answer from the manager/);
      assert.ok(ai.hits.cloud.some((h) => h.kind === "step"), "the cloud ran the step");
      assert.match(ai.hits.cloud.find((h) => h.kind === "step").prompt, /YOUR STEP: Write/);
      assert.ok(store.readAudit(id).some((e) => e.type === "review" && e.ok === false));
      assert.ok(mission(id).timeline.some((t) => /manager takes it/.test(t.text)));
    });

    test("a specialist that fails is replaced by the manager for that step", async () => {
      ai.behave.localStream = () => {
        throw new Error("the model fell over");
      };
      ai.behave.cloudStream = () => [{ text: "The manager did it" }];
      const id = await drive({ title: "Fails", summary: "x", steps: [step("Do it", { role: "coding" })] });
      assert.strictEqual(mission(id).status, "done", mission(id).error);
      assert.match(outputOf(id), /The manager did it/);
    });

    test("Gemini's rate limit pauses the mission with a message, and it carries on when asked again", async () => {
      ai.behave.cloudStatus = 429;
      ai.behave.cloudRetryDelay = "0.2s";
      ai.behave.plan = { title: "Quota", summary: "x", steps: [step("Only")] };
      const made = runner.create("Plan while rate limited");
      await waitFor(() => mission(made.id).status === "paused", 8000, "the rate limit pause");
      assert.strictEqual(mission(made.id).pause.kind, "quota");
      assert.match(mission(made.id).pause.message, /free limit|waits/i);
      assert.ok(mission(made.id).pause.until > Date.now());
      ai.behave.cloudStatus = 0;
      await new Promise((r) => setTimeout(r, 400)); // Gemini's models are back after the retry delay it named
      runner.resume(made.id);
      await waitFor(() => mission(made.id).status === "awaiting_approval", 8000, `the plan after the pause (${why(made.id)})`);
      runner.stop(made.id);
      assert.ok(cloud.usageToday().calls > 0, "the day's calls are counted");
    });

    test("the cloud call limit of a mission is enforced", async () => {
      ai.behave.localStream = (ctx) => ({ content: `Result of: ${stepOf(ctx)}` });
      const id = await planned({ title: "Calls", summary: "x", steps: [step("One", { check: true })], limits: { maxCloudCalls: 0 } });
      runner.approve(id);
      await finished(id, ["paused"]);
      assert.strictEqual(mission(id).pause.kind, "limit");
      assert.match(mission(id).pause.message, /cloud calls/);
    });
  });

  describe("Scheduled missions", () => {
    test("approving a plan that is to be repeated also schedules it, and each run is exactly the plan you approved", async () => {
      const automations = require("../server/missions/automations");
      ai.behave.localStream = (ctx) => ({ content: `Result of: ${stepOf(ctx)}` });
      ai.behave.plan = { title: "Morning digest", summary: "x", steps: [step("Gather"), step("Write", { dependsOn: ["s1"], role: "writing" })] };
      ai.behave.questions = [];
      const made = runner.create("Every morning, make me a digest", { source: "app", automation: { name: "Morning digest", schedule: { kind: "daily", time: "07:30" } } });
      await waitFor(() => mission(made.id).status === "awaiting_approval", 8000, "the plan");
      assert.strictEqual(automations.all().length, 0, "nothing is scheduled before you approve");
      runner.approve(made.id);
      await finished(made.id, ["done"]);
      const automation = automations.all().find((a) => a.name === "Morning digest");
      assert.ok(automation, "scheduled when approved");
      assert.strictEqual(mission(made.id).automationId, automation.id);
      assert.strictEqual(automation.steps, 2);
      assert.deepStrictEqual(automation.schedule, { kind: "daily", time: "07:30" });
      const planCalls = ai.hits.cloud.filter((h) => h.kind === "plan").length;
      const questionCalls = ai.hits.cloud.filter((h) => h.kind === "clarify").length;
      // A run: no questions, no planning, no new approval
      runner.createFromPlan("Every morning, make me a digest", automations.find(automation.id).plan, { source: "schedule", automationId: automation.id, title: "Morning digest" });
      const run = store.all().sort((a, b) => b.createdAt - a.createdAt)[0];
      assert.strictEqual(run.source, "schedule");
      await finished(run.id, ["done"]);
      assert.strictEqual(ai.hits.cloud.filter((h) => h.kind === "plan").length, planCalls, "it didn't plan again");
      assert.strictEqual(ai.hits.cloud.filter((h) => h.kind === "clarify").length, questionCalls, "it didn't ask again");
      assert.strictEqual(run.approvedAt > 0, true);
      assert.ok(store.readAudit(run.id).some((e) => e.type === "approved" && e.by === "automation"));
      automations.remove(automation.id);
    });
  });

  describe("Specialists", () => {
    test("steps for the same model run together, and the model is swapped only when it really differs", async () => {
      setSettings((s) => ({ ...s, specialists: { ...s.specialists, roles: [{ id: "coding", model: "coder:latest" }, { id: "general", model: "tiny:latest" }, { id: "writing", model: "tiny:latest" }] } }));
      ai.behave.localStream = (ctx) => ({ content: `Result of: ${stepOf(ctx)}` });
      const id = await drive({ title: "Swap", summary: "x", steps: [step("Write A", { role: "writing" }), step("Code B", { role: "coding" }), step("Write C", { role: "writing" })] });
      assert.strictEqual(mission(id).status, "done", mission(id).error);
      const order = ai.hits.local.filter((h) => h.kind === "step").map((h) => /YOUR STEP: (.+)/.exec(h.prompt)[1].trim());
      assert.deepStrictEqual(order, ["Write A", "Write C", "Code B"], "the two writing steps go together, so the model isn't swapped back and forth");
      const modelsUsed = ai.hits.local.filter((h) => h.kind === "step").map((h) => h.model);
      assert.deepStrictEqual(modelsUsed, ["tiny:latest", "tiny:latest", "coder:latest"]);
      // The card holds one heavy model: the small one was unloaded to make room for the coder, once
      assert.deepStrictEqual(ai.hits.unloads, ["tiny:latest"]);
      assert.deepStrictEqual(ai.hits.loads.map((l) => l.model), ["tiny:latest", "coder:latest"], "tiny was loaded once for both writing steps");
      assert.match(mission(id).timeline.map((t) => t.text).join("|"), /Step 2 of 3: Code B/);
      assert.match(store.readAudit(id).filter((e) => e.type === "route").map((e) => e.model).join(","), /coder:latest/);
    });

    test("a role's own instructions reach its model", async () => {
      setSettings((s) => ({ ...s, specialists: { ...s.specialists, roles: [{ id: "writing", system: "Always write like a pirate." }] } }));
      ai.behave.localStream = () => ({ content: "Arr." });
      await drive({ title: "Pirate", summary: "x", steps: [step("Write", { role: "writing" })] });
      assert.match(ai.hits.local.find((h) => h.kind === "step").system, /like a pirate/);
    });
  });
});
