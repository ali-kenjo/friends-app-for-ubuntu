const { describe, it } = require("node:test");
const assert = require("node:assert");

describe("Robot Room 3D Whiteboard Prop & Interaction", () => {
  it("builds 3D whiteboard meshes in all 7 styles", async () => {
    const { buildWhiteboard3D, WHITEBOARD_STYLES } = await import("../src/js/robot/places/whiteboard3d.js");
    assert.strictEqual(WHITEBOARD_STYLES.length, 7);

    for (const style of WHITEBOARD_STYLES) {
      const wb = buildWhiteboard3D({ style });
      assert.ok(wb.group, `Group missing for ${style}`);
      assert.strictEqual(wb.style, style);
      assert.ok(wb.face, `Face mesh missing for ${style}`);
      assert.ok(typeof wb.renderDocument === "function");
      assert.ok(typeof wb.pointAt === "function");
      assert.ok(typeof wb.update === "function");

      // Verify spotlight pointAt mechanics
      wb.pointAt(800, 500);
      wb.update(0.1, 1.0);
    }
  });

  it("renders vector whiteboard document items to 2D texture canvas", async () => {
    const { buildWhiteboard3D } = await import("../src/js/robot/places/whiteboard3d.js");
    const wb = buildWhiteboard3D({ style: "chalkboard" });

    const doc = {
      title: "Chalkboard Demo",
      activePageIndex: 0,
      pages: [
        {
          id: "p1",
          items: [
            { type: "stroke", points: [{ x: 10, y: 10 }, { x: 50, y: 50 }], color: "#ffffff", size: 4 },
            { type: "shape", shapeType: "circle", x: 100, y: 100, width: 80, height: 80, stroke: "#38bdf8", fill: "#0284c7", label: "Orbit" },
            { type: "text", text: "E = mc^2", x: 200, y: 200, fontSize: 24, color: "#fef08a" },
            { type: "sticky", text: "Remember test", x: 300, y: 100, color: "#fef3c7" },
            { type: "checklist", title: "Todos", items: [{ text: "Done item", checked: true }], x: 400, y: 200 },
            { type: "diagram", syntax: "mermaid", code: "graph LR; A-->B", x: 500, y: 200 },
          ],
        },
      ],
    };

    assert.doesNotThrow(() => {
      wb.renderDocument(doc);
    });
  });

  // 1.1: the whiteboard you place is the catalog's (src/js/room/render/assets); 1.0's prop catalog is gone
  it("is a thing in the room catalog, built in each of its seven styles", async () => {
    const { entryFor } = await import("../src/js/room/catalog.mjs");
    const { buildAsset } = await import("../src/js/room/render/assets/index.js");
    const def = entryFor("whiteboard");
    assert.ok(def && def.actions.includes("write"));
    for (const style of ["classic", "glass", "chalk", "cork", "dark", "paper", "neon"]) {
      const built = buildAsset(def, { id: "whiteboard", state: { style } }, "high");
      assert.ok(built.group && built.group.children.length > 0, style);
    }
  });

  it("supports whiteboard synthesized sounds in sound engine", async () => {
    const { robotSound } = await import("../src/js/robot/sound.js");
    assert.ok(robotSound);

    robotSound.configure({ enabled: true, categories: { whiteboard: true } });
    assert.strictEqual(robotSound.play("marker", { force: true }), true);
    assert.strictEqual(robotSound.play("chalk", { force: true }), true);
    assert.strictEqual(robotSound.play("eraser", { force: true }), true);
    assert.strictEqual(robotSound.play("sticky", { force: true }), true);
  });

  it("registers whiteboard in animator ROOM_SPOTS", async () => {
    const { ROOM_SPOTS } = await import("../src/js/robot/animator.mjs");
    assert.ok(ROOM_SPOTS.whiteboard);
    assert.ok(ROOM_SPOTS.board);
    assert.strictEqual(Array.isArray(ROOM_SPOTS.whiteboard), true);
    assert.strictEqual(ROOM_SPOTS.whiteboard.length, 2);
  });
});
