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

  // 1.1: 1.0's event bus, state store and undo stack, its A* grid and its behaviour engine were replaced by the room
  // system (src/js/room/: editor/history.mjs, ai.mjs, nav.mjs, behaviour.mjs). These three tests check the same
  // things on the modules that do them now (step 8, DECISIONS R53).
  test("Undo and redo, and the room as the AI is told it (whiteboard, flowers, a toy)", async () => {
    const templates = await import("../src/js/room/templates.mjs");
    const ops = await import("../src/js/room/editor/ops.mjs");
    const { History } = await import("../src/js/room/editor/history.mjs");
    const AI = await import("../src/js/room/ai.mjs");
    let room = templates.templateRoom("empty", { size: "medium", walls: "corner" });
    const h = new History();
    for (const [type, pos] of [["whiteboard", [0, 0, -1.4]], ["vase_flowers", [0.6, 0, -0.6]], ["puzzle_cube", [0.2, 0, -0.5]]]) {
      const before = room;
      room = ops.addAsset(room, type, { pos }).room;
      h.push(`Add ${type}`, before, room);
    }
    const block = AI.roomBlock(room, { state: { where: "at home" } });
    for (const words of [/whiteboard/i, /flowers/i, /cube/i]) assert.match(block, words);
    const back = h.undo(room);
    assert.equal(back.room.assets.length, room.assets.length - 1);
    assert.equal(h.redo(back.room).room.assets.length, room.assets.length);
  });

  test("The nav grid keeps the robot clear of furniture and finds a path around it", async () => {
    const templates = await import("../src/js/room/templates.mjs");
    const ops = await import("../src/js/room/editor/ops.mjs");
    const nav = await import("../src/js/room/nav.mjs");
    let room = templates.templateRoom("empty", { size: "medium", walls: "corner" });
    room = ops.addAsset(room, "desk_writing", { pos: [0, 0, 0] }).room;
    const g = nav.buildGrid(room);
    const [ci, cj] = nav.cellOf(g, 0, 0);
    assert.equal(nav.isFree(g, ci, cj), false, "the desk's middle is blocked");
    const found = nav.findPath(g, [-1.4, 0], [1.4, 0]);
    assert.ok(found.ok && found.points.length >= 2, "a path round the desk");
    const path = found.points;
    const desk = room.assets.at(-1);
    const box = nav.obb(room, desk);
    for (const p of path) assert.equal(nav.inObb(box, p[0], p[1]), false, `waypoint ${p} is inside the desk`);
    const last = path.at(-1);
    assert.ok(Math.hypot(last[0] - 1.4, last[1]) < 0.15);
  });

  test("The robot's behaviour: quotas, mood affinity, routes, the four interrupt policies, and 1.0's nine choreography tools as aliases", async () => {
    const templates = await import("../src/js/room/templates.mjs");
    const ops = await import("../src/js/room/editor/ops.mjs");
    const model = await import("../src/js/room/model.mjs");
    const { RoomBehaviour } = await import("../src/js/room/behaviour.mjs");
    const AI = await import("../src/js/room/ai.mjs");
    const C = await import("../src/js/room/choices.mjs");
    let seed = 11;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const run = (b, sec, ctx = {}) => {
      for (let t = 0; t < sec; t += 0.1) b.tick(0.1, { now: new Date(2026, 10, 16, 12), ...ctx });
      return b.out;
    };
    let room = templates.templateRoom("empty", { size: "medium", walls: "three" });
    room = { ...room, size: { w: 6, d: 5, h: 2.7 }, robot: { ...room.robot, home: { pos: [0, 0, 0], facing: 0 } } };
    let r = ops.addAsset(room, "desk_writing", { pos: [-1.5, 0, -1.6] });
    const desk = r.id;
    r = ops.addAsset(r.room, "puzzle_cube", { pos: [1.5, 0, -1.6] });
    const cube = r.id;
    // Sleepy: the cube is never chosen (its mood affinity is 0); quotas: two visits an hour
    room = ops.updateAsset(r.room, cube, { rules: { ...r.room.assets.find((a) => a.id === cube).rules, moods: { sleepy: 0 } } });
    room = model.sanitizeRoom({ ...room, robot: { ...room.robot, autonomy: { ...room.robot.autonomy, preset: "custom", quotas: { ...room.robot.autonomy.quotas, maxPerHour: 2, globalCooldownSec: 0, perAssetCooldownSec: 0 } }, states: { ...room.robot.states, idle: "visit" }, movement: { ...room.robot.movement, freedom: "free" } } });
    const used = [];
    const b = new RoomBehaviour({ random });
    b.onAction = (a) => used.push(a.assetId);
    b.setRoom(room);
    run(b, 400, { mood: "sleepy" });
    assert.equal(b.visits.all.length, 2, "two visits an hour");
    assert.ok(used.length && used.every((id) => id === desk), `visited: ${used}`);
    // A ping-pong route between two points
    const rb = new RoomBehaviour({ random });
    rb.setRoom(model.sanitizeRoom({ ...room, robot: { ...room.robot, routes: [{ id: "r1", name: "Pace", mode: "ping_pong", points: [{ pos: [-1, 0], dwell: 0 }, { pos: [1, 0], dwell: 0 }], when: { kind: "manual" } }] } }));
    assert.equal(rb.command({ kind: "route", id: "r1" }).ok, true);
    assert.equal(rb.task.kind, "route");
    // The four interrupt policies are all known to the engine
    assert.deepEqual(C.INTERRUPT_POLICIES.map((p) => p.id).sort(), ["finish_before_listening", "finish_briefly", "immediate_return", "pause_and_resume"]);
    for (const policy of C.INTERRUPT_POLICIES.map((p) => p.id)) {
      const ib = new RoomBehaviour({ random });
      ib.setRoom(model.sanitizeRoom({ ...room, robot: { ...room.robot, autonomy: { ...room.robot.autonomy, interrupt: policy } } }));
      ib.goTo([2.2, -1.8], { why: "visit", name: "the corner", then: { kind: "dwell", asset: null, action: "look", dwell: 6 } });
      run(ib, 1);
      run(ib, 0.3, { state: "listening" });
      assert.ok(ib.log.length > 0, policy);
    }
    // 1.0's nine choreography tools still work: each is one of the 1.1 robot tools
    const nine = ["set_emotion", "explain_on_whiteboard", "clear_whiteboard", "write_in_notebook", "water_flowers", "play_with_toy", "move_to_asset", "follow_route", "return_home"];
    for (const name of nine) {
      const [now] = AI.aliasCall(name, { emotion: "excited", toyId: cube, assetId: desk, mode: "ping_pong", note: "Takeaway" });
      assert.ok(["robot_mood", "robot_go_to", "robot_use", "robot_route"].includes(now), `${name} → ${now}`);
    }
    assert.deepEqual(AI.aliasCall("set_emotion", { emotion: "excited" }), ["robot_mood", { mood: "excited" }]);
    assert.equal(AI.robotCommand(room, ...AI.aliasCall("move_to_asset", { assetId: desk })).ok, true);
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
