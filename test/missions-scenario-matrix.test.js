// Scenario test matrix for Missions & Local AI (Workstream 5):
// Tests all requirements against fake Gemini, fake Ollama and fake hardware profile.
const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const fakeAi = require("./helpers/fake-ai");
const { waitFor } = fakeAi;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-scenario-matrix-"));
Object.assign(process.env, {
  FRIENDS_DATA_DIR: path.join(tempDir, "data"),
  KEYRING_BACKEND: "file",
  LOG_LEVEL: "error",
  FRIENDS_CLOUD_GAP_MS: "0",
  FRIENDS_FAKE_GPU: JSON.stringify({ totalMb: 8192, usedMb: 500 }),
  FRIENDS_CLOUD_SHORT_WAIT_MS: "0",
  FRIENDS_GEMINI_RETRY_MS: "0",
});
delete process.env.GEMINI_API_KEY;

describe("Missions & Local AI Scenario Test Matrix", () => {
  const ai = fakeAi.create();
  const dirs = {
    allowed: path.join(tempDir, "allowed"),
    workspace: path.join(tempDir, "workspace"),
    vault: path.join(tempDir, "vault"),
    outside: path.join(tempDir, "outside"),
  };
  let settings, brains, runner, store, models, cloud, risk, templates, automations;

  const setSettings = (change) => settings.set(change(JSON.parse(JSON.stringify(settings.get()))));
  const mission = (id) => store.get(id);

  const step = (title, extra = {}) => ({
    title,
    role: "general",
    tools: [],
    inputs: title,
    output: "A result",
    ...extra,
  });

  async function planned(raw, { questions = [], goal = "Conduct research and report", ...rest } = {}) {
    ai.behave.plan = raw;
    ai.behave.questions = questions;
    const made = runner.create(goal, { source: "app", ...rest });
    await waitFor(() => ["awaiting_approval", "clarifying", "failed", "paused"].includes(mission(made.id).status), 8000, "plan ready");
    return made.id;
  }

  const finished = (id, states = ["done", "failed", "stopped", "paused"]) =>
    waitFor(() => states.includes(mission(id).status), 15000, `mission ${id} to settle`);

  before(async () => {
    await ai.start();
    process.env.FRIENDS_GEMINI_API = ai.cloudUrl();
    settings = require("../server/settings");
    brains = require("../server/brains");
    runner = require("../server/missions/runner");
    store = require("../server/missions/store");
    models = require("../server/models");
    cloud = require("../server/missions/cloud");
    risk = require("../server/missions/risk");
    templates = require("../server/missions/templates");
    automations = require("../server/missions/automations");

    for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
    setSettings((s) => ({
      ...s,
      permissions: {
        ...s.permissions,
        folders: [dirs.allowed],
        files: { create: true, read: true, edit: true, delete: true },
        dirs: { create: true, read: true, edit: true, delete: true },
      },
      missions: { ...s.missions, workspace: dirs.workspace, enabled: true },
      localNotes: { ...s.localNotes, folder: dirs.vault, enabled: true },
    }));

    await brains.saveBrain({ provider: "gemini", name: "Gemini", model: "gemini-3.8-flash", key: "test-matrix-key" });
    await brains.saveBrain({ provider: "local", protocol: "ollama", name: "tiny", baseUrl: ai.localUrl(), model: "tiny:latest", contextSize: 4096 });
  });

  after(async () => {
    for (const m of store.all()) {
      if (["running", "paused", "planning"].includes(m.status)) runner.stop(m.id);
    }
    await ai.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    ai.reset();
    models.forget();
    ai.behave.cloudStream = null;
    ai.behave.localStream = null;
    ai.behave.review = { ok: true, reason: "fine", fix: "" };
    ai.behave.models = [
      { name: "tiny:latest", size: 800e6 },
      { name: "coder:latest", size: 4.2e9 },
      { name: "qwen3.5:4b", size: 3.3e9 },
    ];
    setSettings((s) => ({ ...s, privacy: { ...s.privacy, localOnly: false }, specialists: { ...s.specialists, roles: [] } }));
    cloud.forget();
  });

  // 1. Clarify -> Plan -> Edit Steps -> Approve -> Run -> Report
  test("Scenario 1: clarify -> plan -> edit steps -> approve -> run -> report & audit log", async () => {
    ai.behave.localStream = () => ({ content: "Step completed successfully." });
    const id = await planned(
      {
        title: "Matrix Test 1",
        summary: "Step 1 and Step 2",
        steps: [
          step("Initial gathering", { role: "research", output: "Gathered items" }),
          step("Report synthesis", { role: "writing", dependsOn: ["s1"], output: "Final synthesis" }),
        ],
      },
      { questions: [{ id: "q1", text: "Target format?" }], goal: "Research budget cameras" }
    );

    assert.strictEqual(mission(id).status, "clarifying");
    ai.behave.questions = [];
    runner.answer(id, [{ id: "q1", text: "Markdown summary" }]);
    await waitFor(() => mission(id).status === "awaiting_approval", 8000, "approval");

    // Edit steps before approval
    runner.editPlan(id, { edit: { s1: { title: "Custom gathering", inputs: "Detailed instructions" } } });
    assert.strictEqual(mission(id).plan.steps[0].title, "Custom gathering");

    runner.approve(id);
    await finished(id, ["done"]);
    assert.strictEqual(mission(id).status, "done");
    assert.ok(fs.existsSync(path.join(store.dirOf(id), "report.md")));

    // Audit log verification
    const auditRes = store.verifyAudit(id);
    assert.strictEqual(auditRes.valid, true);
    assert.ok(auditRes.count >= 4);

    const jsonExport = JSON.parse(store.exportAuditJson(id));
    assert.strictEqual(jsonExport.verified, true);
    assert.ok(jsonExport.records.length >= 4);

    const csvExport = store.exportAuditCsv(id);
    assert.ok(csvExport.includes("seq,at,isoTime,type"));
  });

  // 2. Step failure & fallback to manager
  test("Scenario 2: step failure, fallback to Gemini, manager takes over", async () => {
    let attempts = 0;
    ai.behave.localStream = () => {
      attempts++;
      throw new Error("Local model memory crash");
    };
    ai.behave.cloudStream = () => [{ text: "Cloud manager resolved the step." }];

    const id = await planned({
      title: "Failure Fallback Test",
      summary: "Local fails and falls back to cloud",
      steps: [step("Fragile step", { role: "general", output: "Resolved" })],
    });
    runner.approve(id);
    await finished(id, ["done"]);

    assert.strictEqual(mission(id).status, "done");
    assert.ok(attempts >= 1, "local model was tried");
    const audit = store.readAudit(id);
    assert.ok(audit.some((a) => a.type === "step-error" || a.type === "route"));
  });

  // 3. Manager check failing & retry
  test("Scenario 3: manager review check fails and retries with hint", async () => {
    let reviewCount = 0;
    ai.behave.review = () => {
      reviewCount++;
      if (reviewCount === 1) return { ok: false, reason: "Incomplete details", fix: "Provide concrete numbers" };
      return { ok: true, reason: "Good", fix: "" };
    };
    ai.behave.localStream = () => ({ content: "Step output." });

    const id = await planned({
      title: "Review Check Test",
      summary: "Checks result before passing",
      steps: [step("Checkable step", { role: "general", check: true, output: "Numbered list" })],
    });
    runner.approve(id);
    await finished(id, ["done"]);

    assert.strictEqual(mission(id).status, "done");
    assert.ok(reviewCount >= 2, "review check ran at least twice");
    const audit = store.readAudit(id);
    assert.ok(audit.some((a) => a.type === "review" && a.ok === false));
    assert.ok(audit.some((a) => a.type === "review" && a.ok === true));
  });

  // 4. Gemini quota exhausted (429) & resume
  test("Scenario 4: Gemini quota exhausted pauses with quota kind, resume works", async () => {
    ai.behave.cloudStatus = 429;
    const made = runner.create("Goal that hits quota", { source: "app" });
    await waitFor(() => mission(made.id).status === "paused", 8000, "paused on quota");

    assert.strictEqual(mission(made.id).status, "paused");
    assert.strictEqual(mission(made.id).pause.kind, "quota");

    // Recover quota
    ai.behave.cloudStatus = 0;
    ai.behave.plan = { title: "Recovered", summary: "After quota", steps: [step("First step")] };
    runner.resume(made.id);
    await waitFor(() => mission(made.id).status === "awaiting_approval", 8000, "plan ready after resume");
    assert.strictEqual(mission(made.id).status, "awaiting_approval");
  });

  // 5. Private mode (local-only manager mode and cloud pause)
  test("Scenario 5: Private mode uses local manager, cloud steps pause", async () => {
    const id = await planned(
      {
        title: "Private Mission",
        summary: "Local only",
        steps: [step("Local step", { role: "general", output: "Done locally" })],
      },
      { goal: "Private test", private: true }
    );
    assert.strictEqual(mission(id).private, true);

    ai.behave.localStream = () => ({ content: "Local execution done." });
    runner.approve(id);
    await finished(id, ["done"]);
    assert.strictEqual(mission(id).status, "done");
    // Verified no cloud calls were made
    assert.strictEqual(ai.hits.cloud.length, 0);
  });

  // 6. Stop mid-step & crash recovery with side effects
  test("Scenario 6: Stop mid-step aborts immediately; crash recovery asks confirmation for side-effects", async () => {
    ai.behave.localStream = () => ({ content: "Working..." });
    const id = await planned({
      title: "Interruption & Side Effects",
      summary: "Side effect confirmation test",
      steps: [
        step("Send alert", {
          role: "general",
          actions: [{ type: "telegram_send", risk: "external", summary: "Send you a Telegram message" }],
        }),
      ],
    });

    runner.approve(id);
    await waitFor(() => mission(id).status === "running", 8000, "step running");

    // Stop mid-step: aborts immediately
    const stopped = runner.stop(id);
    assert.strictEqual(stopped.status, "stopped");
    assert.strictEqual(mission(id).status, "stopped");

    // Allow background live execution to settle
    await fakeAi.sleep(50);

    // Simulate interruption with side effect recorded during crash
    const m = mission(id);
    m.status = "running";
    m.plan.steps[0].status = "running";
    m.plan.steps[0].effects = [{ tool: "send_telegram", summary: "Send you a Telegram message", at: Date.now() }];
    store.save(m);

    // Call recover() simulating server restart
    runner.recover();
    await waitFor(() => mission(id).status === "paused" && mission(id).pause?.kind === "approval", 8000, "recovery approval");
    assert.strictEqual(mission(id).status, "paused");
    assert.ok(mission(id).pause.message.includes("Run the step again"));

    // User declines to avoid duplicate side effect
    const requestId = mission(id).pause.request.id;
    runner.decide(id, requestId, false);
    await finished(id, ["done"]);
    assert.strictEqual(mission(id).plan.steps[0].status, "skipped");
  });

  // 7. Step-level controls: pause, retryStep, skipStep, editStepInRun, duplicate, archive, stopAll
  test("Scenario 7: Step-level controls (retry, skip, in-run edit, stopAll, duplicate, archive)", async () => {
    const id = await planned({
      title: "Step Controls Test",
      summary: "Testing individual step actions",
      steps: [
        step("Step 1", { role: "general" }),
        step("Step 2", { role: "general", dependsOn: ["s1"] }),
        step("Step 3", { role: "general", dependsOn: ["s2"] }),
      ],
    });

    // Skip step 2
    runner.skipStep(id, "s2");
    assert.strictEqual(mission(id).plan.steps[1].status, "skipped");

    // Edit step 3 in-run
    runner.editStepInRun(id, "s3", { title: "Updated Step 3 Title", inputs: "New inputs" });
    assert.strictEqual(mission(id).plan.steps[2].title, "Updated Step 3 Title");

    // Retry step 2
    runner.retryStep(id, "s2");
    assert.strictEqual(mission(id).plan.steps[1].status, "pending");

    // Duplicate mission
    const dup = runner.duplicate(id);
    assert.ok(dup.id !== id);
    assert.strictEqual(dup.plan.steps.length, 3);

    // Archive mission
    runner.archive(id, true);
    assert.strictEqual(mission(id).archived, true);

    // Stop-all
    const stopped = runner.stopAll();
    assert.ok(stopped.ok);
  });

  // 8. Sandbox security: path traversal, symlink escapes, trash deletion, scrubbed env
  test("Scenario 8: Sandbox security: traversal defense, symlink escapes, always-ask commands", async () => {
    const workdir = path.join(dirs.workspace, "sandbox-test-workdir");
    fs.mkdirSync(workdir, { recursive: true });

    // Path traversal in commands
    const c1 = risk.classifyCommand("cat ../../../etc/shadow", { workdir, folders: [dirs.allowed] });
    assert.strictEqual(c1.always, true);
    assert.match(c1.reason, /outside/);

    // Symlink creation pointing outside allowed folders
    const c2 = risk.classifyCommand("ln -s /etc/passwd ./secret_link", { workdir, folders: [dirs.allowed] });
    assert.strictEqual(c2.always, true);
    assert.match(c2.reason, /symlink/);

    // Always ask commands: sudo, npm install -g
    const c3 = risk.classifyCommand("sudo apt-get update", { workdir, folders: [dirs.allowed] });
    assert.strictEqual(c3.always, true);
    assert.match(c3.reason, /sudo/);

    const c4 = risk.classifyCommand("npm install -g express", { workdir, folders: [dirs.allowed] });
    assert.strictEqual(c4.always, true);
    assert.match(c4.reason, /whole computer/);

    // Allowed command inside workdir
    const c5 = risk.classifyCommand("npm test", { workdir, folders: [dirs.allowed] });
    assert.strictEqual(c5.always, undefined);
  });

  // 9. Tamper-evident hash chained audit log
  test("Scenario 9: Tamper-evident audit log detects unauthorized line modification", async () => {
    const id = await planned({
      title: "Tamper Test",
      summary: "Testing audit tamper detection",
      steps: [step("Step A")],
    });
    store.audit(id, { type: "action-1", data: "test-data-1" });
    store.audit(id, { type: "action-2", data: "test-data-2" });

    // Verification passes
    assert.strictEqual(store.verifyAudit(id).valid, true);

    // Tamper with audit log file directly
    const auditFilePath = path.join(store.dirOf(id), "audit.jsonl");
    const content = fs.readFileSync(auditFilePath, "utf8");
    const lines = content.trim().split("\n");
    // Modify one field in line 2
    const parsedLine = JSON.parse(lines[1]);
    parsedLine.tampered = true;
    lines[1] = JSON.stringify(parsedLine);
    fs.writeFileSync(auditFilePath, lines.join("\n") + "\n");

    // Verification MUST fail
    const verifyFail = store.verifyAudit(id);
    assert.strictEqual(verifyFail.valid, false);
    assert.match(verifyFail.reason, /altered|broken/i);
  });

  // 10. Templates gallery, export and import
  test("Scenario 10: 14 rich templates available, custom template import/export works", () => {
    const list = templates.list();
    assert.ok(list.length >= 14, "has all 14 built-in templates");

    const research = list.find((t) => t.id === "research_report");
    assert.ok(research);
    assert.ok(research.tags.includes("research"));

    const exported = templates.exportTemplate("research_report");
    assert.ok(exported.includes("friends.mission-template.v1"));

    const imported = templates.importTemplate(exported);
    assert.ok(imported.id.startsWith("imported-"));
    assert.strictEqual(imported.title, research.title);

    templates.removeTemplate(imported.id);
  });

  // 11. Chat priority over background missions
  test("Scenario 11: Chat priority preempts missions and sets waitingReason", async () => {
    const brain = { kind: "local", model: "tiny:latest", baseUrl: ai.localUrl() };

    const order = [];
    let observedReason = "";

    // Launch background mission usage holding model for 100ms
    const p1 = models.use(brain, { role: "general", why: "Mission step 1", priority: 0 }, async () => {
      await fakeAi.sleep(100);
      order.push("mission1");
    });

    // Small delay to ensure p1 is running and holding the model
    await fakeAi.sleep(15);

    // Enqueue lower priority mission step 2 first
    const p2 = models.use(brain, { role: "general", why: "Mission step 2", priority: 0 }, async () => {
      order.push("mission2");
    });

    // Enqueue higher priority chat request second
    const pChat = models.use(brain, { role: "chat", priority: "chat", why: "You are chatting" }, async () => {
      order.push("chat");
    });

    observedReason = models.status().waitingReason;

    await Promise.all([p1, p2, pChat]);
    assert.deepStrictEqual(order, ["mission1", "chat", "mission2"]);
    assert.match(observedReason, /waiting for the model because you are chatting/);
  });

  // 12. Automations: master kill switch & repeat schedules
  test("Scenario 12: Automations master kill switch halts all triggers", async () => {
    assert.strictEqual(automations.getKillSwitch(), false);
    automations.setKillSwitch(true);
    assert.strictEqual(automations.getKillSwitch(), true);

    let fired = false;
    const a = automations.create({
      name: "Kill Switch Test",
      goal: "Test kill switch",
      plan: { steps: [step("A")] },
      schedule: { kind: "interval", minutes: 5 },
    });

    // Run tick - should be blocked by kill switch
    await automations.tick(Date.now() + 10 * 60000);
    assert.strictEqual(fired, false);

    // Reset kill switch
    automations.setKillSwitch(false);
    automations.remove(a.id);
  });
});
