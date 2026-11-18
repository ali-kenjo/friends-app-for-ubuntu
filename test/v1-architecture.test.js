const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { WebSocketServer } = require("ws");

function buildValidGlbBuffer(nodeNames = ["socket_hand_grip", "anchor_robot_stand"], materialNames = ["DynamicCanvas"]) {
  const gltf = {
    asset: { version: "2.0" },
    nodes: nodeNames.map((name) => ({ name })),
    materials: materialNames.map((name) => ({ name })),
  };
  let jsonStr = JSON.stringify(gltf);
  while (Buffer.byteLength(jsonStr, "utf8") % 4 !== 0) jsonStr += " ";
  const jsonBuf = Buffer.from(jsonStr, "utf8");
  const totalLen = 12 + 8 + jsonBuf.length;
  const out = Buffer.alloc(totalLen);
  out.writeUInt32LE(0x46546c67, 0); // "glTF"
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLen, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16); // "JSON"
  jsonBuf.copy(out, 20);
  return out;
}

describe("friends-app-for-ubuntu v1.0 Architecture", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-v1-test-"));
  process.env.FRIENDS_DATA_DIR = tempDir;
  process.env.KEYRING_BACKEND = "file";
  process.env.LOG_LEVEL = "error";

  const studioBundle = require("../server/storage/studio-bundle");
  const roomContext = require("../server/core/ai/room-context");
  const { createAdapter } = require("../server/core/ai/voice-adapter");
  const GeminiLiveAdapter = require("../server/core/ai/adapters/gemini-live-adapter");
  const OpenAIRealtimeAdapter = require("../server/core/ai/adapters/openai-realtime-adapter");
  const LocalPipelineAdapter = require("../server/core/ai/adapters/local-pipeline-adapter");
  const gemini = require("../server/gemini");
  const tools = require("../server/tools");
  const settings = require("../server/settings");

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  test("EventBus, ReactiveStateStore & UndoStack manage typed events and room-context serialization", async () => {
    const { EventBus, EVENTS } = await import("../src/js/core/event-bus.mjs");
    const { ReactiveStateStore, UndoStack } = await import("../src/js/core/state-store.mjs");

    const bus = new EventBus();
    const seen = [];
    const off = bus.on(EVENTS.ROOM_CHANGED, (p) => seen.push(p));
    bus.emit(EVENTS.ROOM_CHANGED, { count: 2 });
    off();
    bus.emit(EVENTS.ROOM_CHANGED, { count: 3 });
    assert.deepEqual(seen, [{ count: 2 }]);

    const store = new ReactiveStateStore();
    store.set("roomMeta", { whiteboardText: "Sprint Plan", flowerState: "vibrant_bloom", notebookNotes: ["Note A"] });
    store.set("roomAssets", [
      { id: "whiteboard", kind: "whiteboard", name: "Whiteboard", visible: true, x: 0, y: 0, z: -1.4 },
      { id: "vase_flowers", kind: "vase_flowers", name: "Flowers", visible: true, x: 0.6, y: 0.78, z: -0.6 },
      { id: "rubiks_cube", kind: "rubiks_cube", category: "toy", name: "Rubik's Cube", visible: true, x: 0.2, y: 0.78, z: -0.5 },
    ]);
    const ctx = store.buildRoomContextSummary();
    assert.equal(ctx.whiteboardText, "Sprint Plan");
    assert.equal(ctx.flowerHydration, "vibrant_bloom");
    assert.deepEqual(ctx.notebookNotes, ["Note A"]);
    assert.ok(ctx.availableToys.some((t) => t.id === "rubiks_cube"));

    const undo = new UndoStack();
    let v = 1;
    undo.push({ label: "set2", undo: () => (v = 1), redo: () => (v = 2) });
    v = 2;
    assert.equal(undo.undo(), true);
    assert.equal(v, 1);
    assert.equal(undo.redo(), true);
    assert.equal(v, 2);
  });

  test("NavMeshGrid avoids furniture colliders and computes valid A* obstacle-free paths", async () => {
    const { NavMeshGrid } = await import("../src/js/core/robot/pathfinding.mjs");
    const grid = new NavMeshGrid();
    // Place large desk obstacle right between (-1.2, 0) and (1.2, 0)
    grid.rebuild([{ id: "desk_table", x: 0, z: 0, y: 0, colliderRadius: 0.55, visible: true }]);
    assert.equal(grid.isWalkableCell(grid.colFor(0), grid.rowFor(0)), false);

    const path = grid.findPath(-1.2, 0, 1.2, 0);
    assert.ok(path.length >= 2, "Path should route around center desk obstacle");
    for (const pt of path) {
      const d = Math.hypot(pt.x, pt.z);
      assert.ok(d > 0.5, `Waypoint (${pt.x}, ${pt.z}) too close to blocked obstacle`);
    }
    const last = path[path.length - 1];
    assert.equal(last.x, 1.2);
    assert.equal(last.z, 0);
  });

  test("BehaviorEngine enforces state machine, quotas/cooldowns, emotion weights, waypoint routes, 4 interrupt policies, and all 9 choreography tools", async () => {
    const { BehaviorEngine } = await import("../src/js/core/robot/behavior-engine.mjs");
    const engine = new BehaviorEngine();
    const assets = [
      { id: "whiteboard", kind: "whiteboard", category: "furniture", x: 0, z: -1.4, rotY: 0, colliderRadius: 0.4, approachOffset: [0, 0.7], visible: true },
      { id: "books_notebook", kind: "books_notebook", category: "desk_prop", x: -0.4, z: -0.6, rotY: 0, colliderRadius: 0.25, approachOffset: [0, 0.55], visible: true },
      { id: "vase_flowers", kind: "vase_flowers", category: "flower", x: 0.6, z: -0.6, rotY: 0, colliderRadius: 0.25, approachOffset: [0, 0.55], visible: true },
      { id: "rubiks_cube", kind: "rubiks_cube", category: "toy", x: 0.2, z: -0.5, rotY: 0, colliderRadius: 0.2, approachOffset: [0, 0.5], visible: true },
      { id: "desk_table", kind: "desk_table", category: "furniture", x: 0, z: -0.7, rotY: 0, colliderRadius: 0.45, approachOffset: [0, 0.75], visible: true },
    ];

    // Quotas & cooldowns
    const t0 = 1_000_000;
    engine.configure({ quotas: { maxPerSession: 2, maxPerHour: 2, perAssetPerHour: 1, globalCooldownSec: 5, perAssetCooldownSec: 30 } });
    assert.equal(engine.canInteractWithAsset("rubiks_cube", t0), true);
    engine.recordInteraction("rubiks_cube", t0);
    assert.equal(engine.canInteractWithAsset("vase_flowers", t0 + 1000), false, "global cooldown blocks immediate repeat");
    assert.equal(engine.canInteractWithAsset("rubiks_cube", t0 + 6000), false, "per-asset cooldown/quota blocks same asset");
    assert.equal(engine.canInteractWithAsset("vase_flowers", t0 + 6000), true);
    engine.recordInteraction("vase_flowers", t0 + 6000);
    assert.equal(engine.canInteractWithAsset("whiteboard", t0 + 12000), false, "session quota reached");

    // Reset session & test weighted emotion bias
    engine.sessionCount = 0;
    engine.lastGlobalInteractionTs = 0;
    const playfulCube = engine.effectiveWeight(assets[3], "playful");
    const curiousCube = engine.effectiveWeight(assets[3], "curious");
    assert.ok(curiousCube > playfulCube, "curious emotion should boost rubiks_cube weight");

    // Test all 9 AI choreography tools
    const res1 = engine.handleChoreographyTool({ tool: "set_emotion", args: { emotion: "excited" } }, assets);
    assert.equal(res1.ok, true);
    assert.equal(res1.emotion, "excited");

    const res2 = engine.handleChoreographyTool({ tool: "explain_on_whiteboard", args: { title: "Demo", bullets: ["A"] } }, assets);
    assert.equal(res2.ok, true);
    assert.equal(engine.state, "CHOREOGRAPHY_TOOL");

    const res3 = engine.handleChoreographyTool({ tool: "clear_whiteboard" }, assets);
    assert.equal(res3.ok, true);

    const res4 = engine.handleChoreographyTool({ tool: "write_in_notebook", args: { note: "Takeaway" } }, assets);
    assert.equal(res4.ok, true);

    const res5 = engine.handleChoreographyTool({ tool: "water_flowers" }, assets);
    assert.equal(res5.ok, true);

    const res6 = engine.handleChoreographyTool({ tool: "play_with_toy", args: { toyId: "rubiks_cube" } }, assets);
    assert.equal(res6.ok, true);

    const res7 = engine.handleChoreographyTool({ tool: "move_to_asset", args: { assetId: "desk_table" } }, assets);
    assert.equal(res7.ok, true);

    const res8 = engine.handleChoreographyTool({ tool: "follow_route", args: { mode: "ping_pong" } }, assets);
    assert.equal(res8.ok, true);
    assert.equal(engine.state, "ROAM_WAYPOINT");

    const res9 = engine.handleChoreographyTool({ tool: "return_home" }, assets);
    assert.equal(res9.ok, true);
    assert.equal(engine.state, "MOVING_TO_ASSET");

    // Test all 4 interrupt policies
    engine.setState("INTERACTING_WITH_ASSET");
    engine.activeAssetId = "rubiks_cube";
    engine.dwellRemaining = 5;

    engine.configure({ interruptPolicy: "finish_before_listening" });
    engine.onUserSpeechStart(assets);
    assert.equal(engine.state, "INTERACTING_WITH_ASSET");

    engine.configure({ interruptPolicy: "finish_briefly" });
    engine.onUserSpeechStart(assets);
    assert.ok(engine.dwellRemaining <= 0.9);

    engine.configure({ interruptPolicy: "pause_and_resume" });
    engine.onUserSpeechStart(assets);
    assert.equal(engine.state, "FOLLOWING_USER");
    engine.onUserSpeechEnd(assets);
    assert.equal(engine.state, "INTERACTING_WITH_ASSET");

    engine.configure({ interruptPolicy: "immediate_return" });
    engine.onUserSpeechStart(assets);
    assert.equal(engine.state, "FOLLOWING_USER");
    engine.onUserSpeechEnd(assets);
    assert.equal(engine.state, "IDLE_HOME");
  });

  test("Studio Bundle persistence: schema migration, 0600 secret mode, .glb socket inspection, .zip & .json export/import", () => {
    // 0 -> v1 migration
    const migrated = studioBundle.migrateState({ customGlbs: {} });
    assert.equal(migrated.schemaVersion, 1);

    // 0600 secrets file permissions
    const secPath = path.join(tempDir, "test-secrets.json");
    studioBundle.writeSecureSecrets(secPath, { apiKey: "secret-123" });
    const mode = fs.statSync(secPath).mode & 0o777;
    assert.equal(mode, 0o600);

    // GLB validation + socket detection
    const glbBuf = buildValidGlbBuffer(["socket_hand_grip", "anchor_robot_stand"], ["DynamicCanvas"]);
    const savedGlb = studioBundle.saveAssetGlb("whiteboard", glbBuf);
    assert.equal(savedGlb.id, "whiteboard");
    assert.equal(savedGlb.sockets.handGrip, true);
    assert.equal(savedGlb.sockets.robotStand, true);
    assert.equal(savedGlb.sockets.dynamicCanvas, true);
    assert.throws(() => studioBundle.saveAssetGlb("bad", Buffer.from("this-is-definitely-not-a-binary-glb-file")), /not a binary .glb/i);

    // ZIP roundtrip
    const zipExport = studioBundle.exportBundleBuffer("zip");
    assert.equal(zipExport.mime, "application/zip");
    studioBundle.deleteAssetGlb("whiteboard");
    assert.equal(studioBundle.getAssetGlb("whiteboard"), null);

    const zipImported = studioBundle.importStudioBundle(zipExport.buffer);
    assert.equal(zipImported.ok, true);
    assert.deepEqual(zipImported.importedGlbs, ["whiteboard"]);
    assert.ok(Buffer.isBuffer(studioBundle.getAssetGlb("whiteboard")));

    // JSON roundtrip (strips secrets)
    const jsonExport = studioBundle.exportBundleBuffer("json");
    const parsedJson = JSON.parse(jsonExport.buffer.toString("utf8"));
    assert.equal(parsedJson.settings.aiVoice.openaiKey, "");
    assert.equal(parsedJson.settings.aiVoice.geminiKey, "");
  });

  test("Live RoomContextRegistry & Gemini/OpenAI/Local/TextSandbox VoiceProviderAdapters", async () => {
    // 1.1: the room block is made from the room the robot is in (the rooms store), plus how the robot is now
    const rooms = require("../server/rooms");
    const doc = rooms.create({ template: "lounge" });
    settings.set({ ...settings.get(), robot: { ...settings.get().robot, room: { layoutId: doc.id } } });
    roomContext.update({ where: "at home", doing: "", posture: "stand" });
    const block = roomContext.formatPromptBlock();
    assert.match(block, /Room "Living room"/);
    assert.match(block, /"Fireplace"/);
    assert.match(block, /Right now you're at home/);

    // Gemini extended thinking toggle + model selection
    assert.equal(gemini.liveSupportsThinking(gemini.EXTENDED_THINKING_LIVE_MODEL), true);
    const liveList = await gemini.liveModels("k", { extendedThinking: true });
    assert.ok(liveList.includes(gemini.EXTENDED_THINKING_LIVE_MODEL));

    // GeminiLiveAdapter setup payload + interaction_status handling
    const toolDecls = Object.values(tools.ROBOT_TOOLS);
    const gAdapter = new GeminiLiveAdapter({
      apiKey: "demo",
      extendedThinking: true,
      tools: toolDecls,
    });
    const setup = gAdapter.buildSetupPayload();
    assert.equal(setup.model, `models/${gemini.EXTENDED_THINKING_LIVE_MODEL}`);
    assert.ok(setup.generationConfig.thinkingConfig);
    assert.equal(setup.tools[0].functionDeclarations[0].behavior, "NON_BLOCKING");

    const statuses = [];
    gAdapter.on("interaction_status", (ev) => statuses.push(ev.status));
    gAdapter.handleMessage(JSON.stringify({ serverContent: { interactionStatus: "IN_PROGRESS" } }));
    gAdapter.handleMessage(JSON.stringify({ interactionStatus: "IDLE" }));
    assert.deepEqual(statuses, ["IN_PROGRESS", "IDLE"]);

    // OpenAIRealtimeAdapter session & tool protocol
    const wss = new WebSocketServer({ port: 0 });
    await once(wss, "listening");
    const oaPort = wss.address().port;
    wss.on("connection", (ws) => {
      ws.on("message", (msg) => {
        const p = JSON.parse(msg.toString());
        if (p.type === "session.update") {
          ws.send(JSON.stringify({ type: "session.updated" }));
          ws.send(JSON.stringify({ type: "response.function_call_arguments.done", call_id: "c1", name: "water_flowers", arguments: "{}" }));
        }
      });
    });
    const oa = new OpenAIRealtimeAdapter({
      apiKey: "oa-key",
      upstreamUrl: `ws://127.0.0.1:${oaPort}`,
      tools: toolDecls,
    });
    const oaCalls = [];
    oa.on("tool_calls", (list) => oaCalls.push(...list));
    try {
      await once((() => { oa.start(); return oa; })(), "ready");
      await new Promise((r) => setTimeout(r, 30));
      assert.equal(oaCalls.length, 1);
      assert.equal(oaCalls[0].name, "water_flowers");
    } finally {
      await oa.stop().catch(() => {});
      for (const c of wss.clients) c.terminate();
      wss.close();
    }

    // TextSandboxAdapter zero-key room tool calling
    const sandbox = createAdapter("text-sandbox", { settings: settings.get() });
    const sbCalls = [];
    const sbTranscripts = [];
    sandbox.on("tool_calls", (list) => sbCalls.push(...list));
    sandbox.on("transcript", (tr) => sbTranscripts.push(tr));
    await sandbox.start();
    await sandbox.sendText("Draw a flowchart of solar power on the whiteboard");
    assert.ok(sbCalls.some((c) => c.name === "explain_on_whiteboard"));
    assert.ok(sbTranscripts.some((tr) => tr.role === "model"));
    await sandbox.stop();

    // LocalPipelineAdapter PCM energy VAD & interrupt
    const local = new LocalPipelineAdapter({ settings: settings.get() });
    await local.start();
    local.interrupt();
    assert.equal(local.speaking, false);
    await local.stop();
  });
});
