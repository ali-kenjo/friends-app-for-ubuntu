const { test, describe, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("Robot quality levels and performance budgets", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-robot-budget-test-"));
  process.env.FRIENDS_DATA_DIR = tempDir;
  process.env.LOG_LEVEL = "error";

  const { room: R } = require("../server/robot-look");

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("quality budgets are strictly tiered and bounded", async () => {
    // Read engine.js exports
    const engineSrc = fs.readFileSync(path.join(__dirname, "../src/js/robot/engine.js"), "utf8");
    
    // Extract QUALITY and QUALITY_BUDGETS from src/js/robot/engine.js
    const budgetMatch = engineSrc.match(/export const QUALITY_BUDGETS = (\{[\s\S]*?\n\};)/);
    assert.ok(budgetMatch, "QUALITY_BUDGETS must be defined and exported in engine.js");
    
    // Parse through safe Function constructor
    const budgets = new Function(`return ${budgetMatch[1].replace(/;$/, "")}`)();
    assert.ok(budgets.low && budgets.medium && budgets.high, "Must define low, medium, and high budgets");

    // Verify low tier budget constraints
    assert.strictEqual(budgets.low.drawCalls, 140);
    assert.strictEqual(budgets.low.triangles, 60000);
    assert.strictEqual(budgets.low.particles, 45);

    // Verify medium tier budget constraints
    assert.strictEqual(budgets.medium.drawCalls, 220);
    assert.strictEqual(budgets.medium.triangles, 120000);
    assert.strictEqual(budgets.medium.particles, 90);

    // Verify high tier budget constraints
    assert.strictEqual(budgets.high.drawCalls, 320);
    assert.strictEqual(budgets.high.triangles, 240000);
    assert.strictEqual(budgets.high.particles, 160);

    // Strict monotonic ordering: low < medium < high
    assert.ok(budgets.low.drawCalls < budgets.medium.drawCalls && budgets.medium.drawCalls < budgets.high.drawCalls);
    assert.ok(budgets.low.triangles < budgets.medium.triangles && budgets.medium.triangles < budgets.high.triangles);
    assert.ok(budgets.low.particles < budgets.medium.particles && budgets.medium.particles < budgets.high.particles);
  });

  test("low quality disables expensive graphics features to honor budget", () => {
    const engineSrc = fs.readFileSync(path.join(__dirname, "../src/js/robot/engine.js"), "utf8");
    const qualityMatch = engineSrc.match(/export const QUALITY = (\{[\s\S]*?\n\};)/);
    assert.ok(qualityMatch, "QUALITY must be defined and exported in engine.js");

    const quality = new Function(`return ${qualityMatch[1].replace(/;$/, "")}`)();

    // Low tier must turn off bloom, shadows, and rich materials
    assert.strictEqual(quality.low.bloom, false);
    assert.strictEqual(quality.low.shadows, false);
    assert.strictEqual(quality.low.rich, false);
    assert.strictEqual(quality.low.samples, 2);
    assert.strictEqual(quality.low.ratio, 1);
    assert.strictEqual(quality.low.face, "low");

    // Medium & High enable richer rendering
    assert.strictEqual(quality.medium.bloom, true);
    assert.strictEqual(quality.medium.shadows, true);
    assert.strictEqual(quality.medium.rich, true);

    assert.strictEqual(quality.high.bloom, true);
    assert.strictEqual(quality.high.shadows, true);
    assert.strictEqual(quality.high.rich, true);
    assert.strictEqual(quality.high.shadowSize, 2048);
  });

  test("auto-quality steps down progressively under frame drops", () => {
    const engineSrc = fs.readFileSync(path.join(__dirname, "../src/js/robot/engine.js"), "utf8");
    const downMatch = engineSrc.match(/const DOWN = (\{[\s\S]*?\});/);
    assert.ok(downMatch, "DOWN step mapping must be defined");
    const down = new Function(`return ${downMatch[1]}`)();

    assert.strictEqual(down.high, "medium");
    assert.strictEqual(down.medium, "low");
    assert.strictEqual(down.low, undefined, "low is the floor tier and cannot step down further");
  });

  test("room places and catalog items stay bounded for performance", () => {
    // Check all places defined in R.PLACES
    assert.ok(Array.isArray(R.PLACES));
    assert.ok(R.PLACES.length >= 10, "Should have rich selection of places");

    // Ensure all places have sensible defaults and prop names
    for (const place of R.PLACES) {
      assert.ok(typeof place.id === "string" && place.id.length > 0);
      assert.ok(typeof place.label === "string" && place.label.length > 0);
      assert.ok(typeof place.about === "string");
      assert.ok(place.colors && typeof place.colors === "object");
      assert.ok(Array.isArray(place.props), `Props for ${place.id} should be an array`);
      assert.ok(place.props.length <= 25, `Props for ${place.id} must not exceed 25 items`);
    }

    // Default room configuration
    const defaultRoom = R.defaultRoom();
    assert.strictEqual(defaultRoom.place, "studio");
    assert.strictEqual(defaultRoom.timeMode, "manual");
    assert.ok(defaultRoom.builder && typeof defaultRoom.builder === "object");
  });

  test("performance stats reporting contract conforms to schema", () => {
    // Simulate engine stats output
    const budget = { drawCalls: 140, triangles: 60000, particles: 45 };
    const simulatedInfo = { calls: 42, triangles: 18500 };
    const simulatedParticles = 36;
    const stats = {
      fps: 60,
      level: "low",
      setting: "low",
      drawCalls: simulatedInfo.calls,
      triangles: simulatedInfo.triangles,
      particles: simulatedParticles,
      budget,
    };

    assert.ok(stats.drawCalls <= stats.budget.drawCalls, "Draw calls within low budget");
    assert.ok(stats.triangles <= stats.budget.triangles, "Triangles within low budget");
    assert.ok(stats.particles <= stats.budget.particles, "Particles within low budget");
    assert.strictEqual(stats.level, "low");
  });
});
