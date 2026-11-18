// Settings → Robot → Graphics, → Editor and → Privacy: cleaning what's saved, how the graphics settings
// combine with the quality level, lengths in centimetres or inches, the reset defaults.
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const G = require("../src/js/robot/graphics.mjs");
const P = require("../src/js/room/editor/prefs.mjs");
const ops = require("../src/js/room/editor/ops.mjs");
const templates = require("../src/js/room/templates.mjs");

describe("Graphics settings", () => {
  test("defaults are kept, unknown keys dropped, values clamped or replaced", () => {
    assert.deepEqual(G.sanitizeGraphics(undefined), G.GRAPHICS_DEFAULTS);
    const g = G.sanitizeGraphics({ renderScale: 20, bloom: 999, fps: "144", lights: 3, shadows: "fuzzy", sway: "yes", hack: 1, shadowRes: 2048 });
    assert.equal(g.renderScale, 50);
    assert.equal(g.bloom, 150);
    assert.equal(g.fps, "display", "an unknown rate is the default");
    assert.equal(g.lights, "3", "numbers for a choice are read as its text");
    assert.equal(g.shadowRes, "2048");
    assert.equal(g.shadows, "auto");
    assert.equal(g.sway, true, "only true or false switches");
    assert.equal("hack" in g, false);
  });

  test("auto follows the quality level; each choice overrides only its part", () => {
    const r = G.resolveGraphics("medium", {});
    assert.equal(r.level, "medium");
    assert.equal(r.geometry, "medium");
    assert.equal(r.textures, "medium");
    assert.equal(r.lights, null);
    assert.equal(r.shadowSize, null);
    assert.equal(r.fps, 0);
    assert.equal(r.scale, 1);
    const o = G.resolveGraphics("medium", { geometry: "ultra", textures: "low", lights: "6", shadowRes: "4096", renderScale: 75, bloom: 50, particles: 0, dofStrength: 30 });
    assert.equal(o.level, "medium", "the level itself is unchanged");
    assert.deepEqual([o.geometry, o.textures, o.lights, o.shadowSize, o.scale, o.bloom, o.particles, o.dofStrength], ["ultra", "low", 6, 4096, 0.75, 0.5, 0, 0.3]);
  });

  test("the battery saver: one level lower and 30 frames a second, only on battery and only when on", () => {
    assert.equal(G.resolveGraphics("high", {}, { onBattery: false }).level, "high");
    const saving = G.resolveGraphics("high", {}, { onBattery: true });
    assert.equal(saving.level, "medium");
    assert.equal(saving.fps, 30);
    assert.equal(saving.saving, true);
    assert.equal(G.resolveGraphics("low", {}, { onBattery: true }).level, "low", "nothing below Low");
    const off = G.resolveGraphics("high", { batterySaver: false }, { onBattery: true });
    assert.equal(off.level, "high");
    assert.equal(off.fps, 0);
    assert.equal(G.resolveGraphics("ultra", { fps: "60" }, { onBattery: true }).fps, 30);
  });

  test("slower in the background: a separate cap the engine uses while the window isn't in front", () => {
    assert.equal(G.resolveGraphics("high", {}).idleFps, 30);
    assert.equal(G.resolveGraphics("high", { throttleHidden: false }).idleFps, 0);
    assert.equal(G.resolveGraphics("high", { throttleHidden: false, fps: "60" }).idleFps, 60);
    assert.equal(G.resolveGraphics("high", { fps: "30" }).idleFps, 30);
  });

  test("shadow softness and what rebuilds the room", () => {
    assert.equal(G.shadowRadius("hard", 5), 1);
    assert.equal(G.shadowRadius("auto", 5), 5);
    assert.equal(G.shadowRadius("soft", 5), 5);
    assert.equal(G.shadowRadius("very_soft", 5), 9);
    const a = G.buildKey(G.resolveGraphics("high", {}));
    assert.equal(a, G.buildKey(G.resolveGraphics("high", { bloom: 10, fps: "30", overlay: true })), "post effects and the frame rate don't rebuild the room");
    assert.notEqual(a, G.buildKey(G.resolveGraphics("high", { textures: "low" })));
    assert.notEqual(a, G.buildKey(G.resolveGraphics("high", { contactShadows: false })));
    assert.notEqual(a, G.buildKey(G.resolveGraphics("high", { reflections: false })));
  });

  test("the v1 drawer's anti-aliasing, shadows and throttle are read once", () => {
    assert.deepEqual(G.graphicsFromV1({ antiAliasing: "fxaa", shadowQuality: "off", throttleWhenHidden: false }), { aa: "smaa", shadows: "off", throttleHidden: false });
    assert.deepEqual(G.graphicsFromV1({ shadowQuality: "high" }), {});
    assert.deepEqual(G.graphicsFromV1(null), {});
  });
});

describe("Room Editor preferences", () => {
  test("cleaned to the choices there are", () => {
    assert.deepEqual(P.sanitizePrefs(null), P.DEFAULT_PREFS);
    const p = P.sanitizePrefs({ grid: "0.25", angle: 7, units: "in", handleSize: 1.5, orbitSpeed: 9, autosave: "no", extra: 1 });
    assert.equal(p.grid, 0.25, "a saved number in text is read as the number");
    assert.equal(p.angle, 15);
    assert.equal(p.units, "in");
    assert.equal(p.handleSize, 1.5);
    assert.equal(p.orbitSpeed, 1);
    assert.equal(p.autosave, true);
    assert.equal("extra" in p, false);
  });

  test("lengths in centimetres or inches, and back", () => {
    assert.deepEqual(P.lengthOf(1.2), { n: 120, unit: "cm" });
    assert.deepEqual(P.lengthOf(1.2, "in"), { n: 47, unit: "in" });
    assert.deepEqual(P.lengthOf(0.1, "in"), { n: 4, unit: "in" });
    assert.equal(P.lengthText(0.5, "cm"), "50 cm");
    assert.equal(P.lengthText(0.0254 * 10, "in"), "10 in");
    assert.ok(Math.abs(P.fromUnits(P.toUnits(2.54, "in"), "in") - 2.54) < 0.01);
    assert.equal(P.fromUnits(150, "cm"), 1.5);
  });

  test("a keyboard move is said in the units chosen", () => {
    const room = templates.templateRoom("empty", { size: "medium", walls: "corner" });
    const res = ops.addAsset(room, "desk_writing", { pos: [0, 0, 0] });
    const id = res.id;
    assert.match(ops.moveWords(res.room, id, -0.1, 0), /10 cm left/);
    assert.match(ops.moveWords(res.room, id, 0, 0.0254 * 2, undefined, "in"), /2 in forward/);
  });
});

describe("Settings: the Graphics, Editor and Privacy groups", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-graphics-test-"));
  let settings;
  let server;
  let base;
  before(async () => {
    process.env.FRIENDS_DATA_DIR = tempDir;
    process.env.LOG_LEVEL = "error";
    settings = require("../server/settings");
    const { start } = require("../server/server");
    server = start(0, "127.0.0.1");
    await new Promise((resolve) => (server.listening ? resolve() : server.on("listening", resolve)));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("saved and cleaned by the helper", () => {
    const s = settings.get();
    settings.set({ ...s, robot: { ...s.robot, graphics: { renderScale: 70, lights: "9" }, editor: { units: "in", grid: "0.5" }, privacy: { personalInFilming: true } } });
    const r = settings.get().robot;
    assert.equal(r.graphics.renderScale, 70);
    assert.equal(r.graphics.lights, "auto");
    assert.equal(r.editor.units, "in");
    assert.equal(r.editor.grid, 0.5);
    assert.equal(r.privacy.personalInFilming, true);
    settings.patch({ robot: { graphics: { bloom: 20 } } });
    assert.equal(settings.get().robot.graphics.bloom, 20);
    assert.equal(settings.get().robot.graphics.renderScale, 70, "a patch changes only what it names");
  });

  test("the v1 drawer's visual settings seed Graphics when there's none yet", () => {
    const s = settings.get();
    const { graphics, ...robot } = s.robot;
    settings.set({ ...s, robot, visualStyle: { ...s.visualStyle, antiAliasing: "off", throttleWhenHidden: false } });
    const g = settings.get().robot.graphics;
    assert.equal(g.aa, "off");
    assert.equal(g.throttleHidden, false);
  });

  test("the defaults for Reset come from the helper and carry no secrets", async () => {
    const res = await fetch(`${base}/api/settings/defaults`);
    assert.equal(res.status, 200);
    const d = await res.json();
    assert.deepEqual(d.robot.graphics, G.GRAPHICS_DEFAULTS);
    assert.deepEqual(d.robot.editor, P.DEFAULT_PREFS);
    assert.deepEqual(d.robot.privacy, { personalInFilming: false });
    assert.equal(d.aiVoice.geminiKey, "");
    assert.equal(d.aiVoice.openaiKey, "");
  });
});
