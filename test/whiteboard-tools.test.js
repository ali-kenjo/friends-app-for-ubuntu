const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const tools = require("../server/tools");
const whiteboard = require("../server/whiteboard");
const settings = require("../server/settings");
const { getStorageDir } = require("../server/whiteboard");

describe("AI Whiteboard Tools Suite", () => {
  beforeEach(() => {
    // Reset test storage directory
    const dir = getStorageDir();
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("declares all 15 whiteboard tools and respects whiteboard.enabled setting", () => {
    const s = { ...settings.get(), whiteboard: { enabled: true, aiDrawing: true } };
    const decls = tools.declarations(s);
    const wbDecls = decls.filter((t) => t.name.startsWith("whiteboard_"));
    assert.strictEqual(wbDecls.length, 15);

    const names = new Set(wbDecls.map((t) => t.name));
    assert.ok(names.has("whiteboard_write_text"));
    assert.ok(names.has("whiteboard_draw_shape"));
    assert.ok(names.has("whiteboard_draw_diagram"));
    assert.ok(names.has("whiteboard_add_sticky"));
    assert.ok(names.has("whiteboard_add_checklist"));
    assert.ok(names.has("whiteboard_add_table"));
    assert.ok(names.has("whiteboard_add_image"));
    assert.ok(names.has("whiteboard_draw_freehand"));
    assert.ok(names.has("whiteboard_highlight"));
    assert.ok(names.has("whiteboard_point_at"));
    assert.ok(names.has("whiteboard_erase_region"));
    assert.ok(names.has("whiteboard_clear"));
    assert.ok(names.has("whiteboard_new_page"));
    assert.ok(names.has("whiteboard_read_board"));
    assert.ok(names.has("whiteboard_snapshot"));

    // When disabled in settings, whiteboard tools are omitted
    const disabledS = { ...settings.get(), whiteboard: { enabled: false } };
    const disabledDecls = tools.declarations(disabledS).filter((t) => t.name.startsWith("whiteboard_"));
    assert.strictEqual(disabledDecls.length, 0);

    // When aiDrawing is turned off, whiteboard tools are omitted
    const noDrawS = { ...settings.get(), whiteboard: { enabled: true, aiDrawing: false } };
    const noDrawDecls = tools.declarations(noDrawS).filter((t) => t.name.startsWith("whiteboard_"));
    assert.strictEqual(noDrawDecls.length, 0);
  });

  it("filters essential subset with compact schema for local models", () => {
    const s = { ...settings.get(), aiControl: { localTools: "essential" }, whiteboard: { enabled: true, aiDrawing: true } };
    const all = tools.declarations(s);
    const local = tools.forLocal(all, s);
    const wbLocal = local.filter((t) => t.name.startsWith("whiteboard_"));
    assert.strictEqual(wbLocal.length, 6);

    const essentialNames = new Set(wbLocal.map((t) => t.name));
    assert.deepStrictEqual(
      essentialNames,
      new Set([
        "whiteboard_write_text",
        "whiteboard_draw_shape",
        "whiteboard_add_sticky",
        "whiteboard_point_at",
        "whiteboard_read_board",
        "whiteboard_clear",
      ])
    );
  });

  it("executes drawing and writing tools, emitting whiteboard events and updating documents", async () => {
    const wbEvents = [];
    const robotEvents = [];
    const activity = [];
    const ctx = {
      settings: settings.get(),
      onWhiteboard: (e) => wbEvents.push(e),
      onRobot: (e) => robotEvents.push(e),
      onActivity: (a) => activity.push(a),
    };

    // 1. Write text
    const textRes = await tools.run("whiteboard_write_text", { text: "Hello AI World!", x: 100, y: 150 }, ctx);
    assert.strictEqual(textRes.ok, true);
    assert.ok(textRes.itemId);
    assert.strictEqual(wbEvents.length, 1);
    assert.strictEqual(wbEvents[0].type, "item_created");
    assert.strictEqual(wbEvents[0].item.text, "Hello AI World!");

    // 2. Draw shape
    const shapeRes = await tools.run(
      "whiteboard_draw_shape",
      { shape: "circle", x: 300, y: 300, width: 80, height: 80, label: "Core Node" },
      ctx
    );
    assert.strictEqual(shapeRes.ok, true);
    assert.strictEqual(shapeRes.shape, "circle");

    // 3. Add sticky note
    const stickyRes = await tools.run("whiteboard_add_sticky", { text: "Brainstorming idea", color: "yellow" }, ctx);
    assert.strictEqual(stickyRes.ok, true);

    // 4. Add checklist
    const checkRes = await tools.run(
      "whiteboard_add_checklist",
      { title: "Sprint Goals", items: ["Unit tests", "Documentation", "Integration"] },
      ctx
    );
    assert.strictEqual(checkRes.ok, true);

    // 5. Add table
    const tableRes = await tools.run(
      "whiteboard_add_table",
      { title: "Metrics", rows: [["Metric", "Value"], ["Tests", "600+"], ["Coverage", "100%"]] },
      ctx
    );
    assert.strictEqual(tableRes.ok, true);

    // 6. Draw diagram
    const diagRes = await tools.run(
      "whiteboard_draw_diagram",
      { diagramType: "mermaid", code: "graph TD; A-->B; B-->C;" },
      ctx
    );
    assert.strictEqual(diagRes.ok, true);

    // 7. Add image
    const imgRes = await tools.run(
      "whiteboard_add_image",
      { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", caption: "Mock Image" },
      ctx
    );
    assert.strictEqual(imgRes.ok, true);

    // 8. Draw freehand
    const freeRes = await tools.run(
      "whiteboard_draw_freehand",
      { points: [{ x: 10, y: 10 }, { x: 50, y: 60 }, { x: 90, y: 40 }] },
      ctx
    );
    assert.strictEqual(freeRes.ok, true);

    // 9. Highlight
    const highRes = await tools.run("whiteboard_highlight", { x: 100, y: 150, width: 200, height: 40 }, ctx);
    assert.strictEqual(highRes.ok, true);

    // 10. Point at
    const pointRes = await tools.run("whiteboard_point_at", { x: 300, y: 300, label: "Notice the core node" }, ctx);
    assert.strictEqual(pointRes.ok, true);
    assert.ok(robotEvents.some((e) => e.gesture === "point_left" || e.gesture === "point_right"));

    // 11. Read board
    const readRes = await tools.run("whiteboard_read_board", {}, ctx);
    assert.strictEqual(readRes.ok, true);
    assert.match(readRes.summary, /Hello AI World!/);
    assert.match(readRes.summary, /Sprint Goals/);

    // 12. Snapshot
    const snapRes = await tools.run("whiteboard_snapshot", { format: "markdown" }, ctx);
    assert.strictEqual(snapRes.ok, true);
    assert.match(snapRes.text, /Hello AI World!/);

    // 13. New page
    const pageRes = await tools.run("whiteboard_new_page", { title: "Architecture Flow" }, ctx);
    assert.strictEqual(pageRes.ok, true);
    assert.strictEqual(pageRes.pageIndex, 1);

    // 14. Erase region on page 2 (nothing to erase)
    const eraseRes = await tools.run("whiteboard_erase_region", { x: 0, y: 0, width: 500, height: 500 }, ctx);
    assert.strictEqual(eraseRes.ok, true);
    assert.strictEqual(eraseRes.erasedCount, 0);

    // 15. Clear board
    const clearRes = await tools.run("whiteboard_clear", { pageOnly: true }, ctx);
    assert.strictEqual(clearRes.ok, true);
  });
});
