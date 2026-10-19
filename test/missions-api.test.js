// Missions through the helper's HTTP interface and the chat's start_mission tool, with a fake Gemini and Ollama.
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const fakeAi = require("./helpers/fake-ai");
const { waitFor } = fakeAi;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-missions-api-"));
Object.assign(process.env, { FRIENDS_DATA_DIR: path.join(tempDir, "data"), KEYRING_BACKEND: "file", LOG_LEVEL: "error", FRIENDS_CLOUD_GAP_MS: "0",
  FRIENDS_FAKE_GPU: JSON.stringify({ totalMb: 6144, usedMb: 400 }), FRIENDS_CLOUD_SHORT_WAIT_MS: "0", FRIENDS_GEMINI_RETRY_MS: "0" });
delete process.env.GEMINI_API_KEY;

describe("The missions API", () => {
  const ai = fakeAi.create();
  let base, server, brains, settings;
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const step = (title, extra = {}) => ({ title, role: "general", tools: [], inputs: title, output: "A result", ...extra });

  before(async () => {
    await ai.start();
    process.env.FRIENDS_GEMINI_API = ai.cloudUrl();
    settings = require("../server/settings");
    brains = require("../server/brains");
    const s = settings.get();
    settings.set({ ...s, onboarding: { done: true }, missions: { ...s.missions, workspace: path.join(tempDir, "ws") }, localNotes: { ...s.localNotes, folder: path.join(tempDir, "vault") } });
    await brains.saveBrain({ provider: "gemini", name: "Gemini", model: "gemini-3.8-flash", key: "test-key" });
    await brains.saveBrain({ provider: "local", protocol: "ollama", name: "tiny", baseUrl: ai.localUrl(), model: "tiny:latest", contextSize: 8192 });
    server = require("../server/server").start(0, "127.0.0.1");
    await new Promise((r) => (server.listening ? r() : server.on("listening", r)));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    const list = (await call("GET", "/api/missions")).body.missions;
    for (const m of list) if (!["done", "failed", "stopped"].includes(m.status)) await call("POST", `/api/missions/${m.id}/stop`);
    await new Promise((r) => server.close(r));
    await ai.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("create, plan, edit, approve, follow along, read the audit log and the report", async () => {
    ai.behave.plan = { title: "API mission", summary: "Two steps", steps: [step("First"), step("Second", { dependsOn: ["s1"] })] };
    ai.behave.localStream = (ctx) => ({ content: `Done: ${/YOUR STEP: (.+)/.exec(ctx.prompt)[1].trim()}` });
    const created = await call("POST", "/api/missions", { goal: "Do two things for me please" });
    assert.strictEqual(created.status, 200);
    const id = created.body.id;
    await waitFor(async () => (await call("GET", `/api/missions/${id}`)).body.status === "awaiting_approval", 8000, "the plan");
    const planned = (await call("GET", `/api/missions/${id}`)).body;
    assert.strictEqual(planned.plan.steps.length, 2);
    assert.strictEqual(planned.title, "API mission");

    const edited = await call("PUT", `/api/missions/${id}/plan`, { edit: { s1: { title: "First, renamed" } } });
    assert.strictEqual(edited.body.plan.steps[0].title, "First, renamed");
    const approved = await call("POST", `/api/missions/${id}/approve`);
    assert.strictEqual(approved.body.status, "running");
    await waitFor(async () => (await call("GET", `/api/missions/${id}`)).body.status === "done", 15000, "the mission");
    const done = (await call("GET", `/api/missions/${id}`)).body;
    assert.deepStrictEqual(done.progress, { done: 2, total: 2, current: null });
    assert.ok(done.report.note);
    assert.ok(done.timeline.length > 3);
    const audit = (await call("GET", `/api/missions/${id}/audit`)).body.entries;
    assert.ok(audit.some((e) => e.type === "approved"));
    const overview = (await call("GET", "/api/missions")).body;
    assert.ok(overview.missions.some((m) => m.id === id && m.status === "done"));
    assert.ok(overview.usage.calls > 0, "the day's cloud calls are shown");
    assert.ok("model" in overview);
  });

  test("it says plainly what can't be done", async () => {
    assert.strictEqual((await call("POST", "/api/missions", { goal: "x" })).status, 400);
    assert.strictEqual((await call("GET", "/api/missions/m-nope")).status, 400);
    ai.behave.plan = { title: "Edit me", summary: "x", steps: [step("A")] };
    const id = (await call("POST", "/api/missions", { goal: "Another thing to do now" })).body.id;
    await waitFor(async () => (await call("GET", `/api/missions/${id}`)).body.status === "awaiting_approval", 8000, "the plan");
    const decide = await call("POST", `/api/missions/${id}/decision`, { requestId: "nope", allow: true });
    assert.strictEqual(decide.status, 400);
    assert.match(decide.body.error, /already been answered/);
    assert.strictEqual((await call("POST", `/api/missions/${id}/resume`, {})).status, 400, "it isn't paused");
    await call("POST", `/api/missions/${id}/stop`);
    const stopped = (await call("GET", `/api/missions/${id}`)).body;
    assert.strictEqual(stopped.status, "stopped");
    assert.strictEqual((await call("DELETE", `/api/missions/${id}`)).status, 200);
    assert.strictEqual((await call("GET", `/api/missions/${id}`)).status, 400);
  });

  test("the companion starts a mission with the start_mission tool, and says where it is", async () => {
    ai.behave.plan = { title: "From chat", summary: "x", steps: [step("A")] };
    const tools = require("../server/tools");
    const lines = [];
    const result = await tools.run("start_mission", { goal: "Sort out my Downloads folder by type, please" }, { settings: settings.get(), confirm: async () => false, onActivity: (l) => lines.push(l) });
    assert.strictEqual(result.ok, true);
    assert.match(result.note, /under Missions/);
    assert.match(lines[0], /Started a mission/);
    await waitFor(async () => (await call("GET", `/api/missions/${result.id}`)).body.status === "awaiting_approval", 8000, "its plan");
    assert.strictEqual((await call("GET", `/api/missions/${result.id}`)).body.source, "chat");
    await call("POST", `/api/missions/${result.id}/stop`);
    // It's offered to the AI in chat, and its prompt mentions missions in progress
    const declarations = tools.declarations(settings.get(), {}).map((d) => d.name);
    assert.ok(declarations.includes("start_mission"));
    const prompt = require("../server/prompt");
    const id2 = (await call("POST", "/api/missions", { goal: "A mission to show up in the prompt please" })).body.id;
    await waitFor(async () => (await call("GET", `/api/missions/${id2}`)).body.status === "awaiting_approval", 8000, "its plan");
    assert.match(prompt.build(settings.get(), { toolsOffered: tools.declarations(settings.get(), {}) }), /Missions in progress[\s\S]*waiting for their approval/);
    await call("POST", `/api/missions/${id2}/stop`);
  });

  test("missions can be switched off", async () => {
    const s = settings.get();
    settings.set({ ...s, missions: { ...s.missions, enabled: false } });
    try {
      assert.strictEqual((await call("POST", "/api/missions", { goal: "This should not start at all" })).status, 400);
      const declarations = require("../server/tools").declarations(settings.get(), {}).map((d) => d.name);
      assert.ok(!declarations.includes("start_mission"));
    } finally {
      settings.set({ ...settings.get(), missions: { ...settings.get().missions, enabled: true } });
    }
  });

  test("automations: watch my laptop, list, switch off, run, remove", async () => {
    const made = await call("POST", "/api/automations", { name: "Watch my laptop", watch: { everyMinutes: 5, gpuTemp: 85 } });
    assert.strictEqual(made.status, 200);
    assert.ok(made.body.watch);
    const listed = (await call("GET", "/api/automations")).body.automations;
    assert.ok(listed.some((a) => a.id === made.body.id));
    assert.strictEqual((await call("PATCH", `/api/automations/${made.body.id}`, { enabled: false })).body.enabled, false);
    assert.strictEqual((await call("POST", "/api/automations", { name: "Nothing", goal: "x" })).status, 400);
    assert.strictEqual((await call("DELETE", `/api/automations/${made.body.id}`)).status, 200);
  });
});
