const { test, describe } = require("node:test");
const assert = require("node:assert");

describe("Whiteboard vector document model", async () => {
  const {
    VERSION,
    createDocument,
    createPage,
    createStroke,
    createShape,
    createText,
    createSticky,
    createChecklist,
    createTable,
    createDiagram,
    getBoundingBox,
    getSelectionBoundingBox,
    hitTest,
    addItem,
    updateItem,
    removeItem,
    moveItem,
    scaleItem,
    reorderItem,
    createUndoStack,
    pushUndoAction,
    undo,
    redo,
    getReplayTimeline,
    documentToText,
  } = await import("../src/js/whiteboard/model.mjs");

  test("creates a valid default document with one page", () => {
    const doc = createDocument({ title: "Brainstorming Session" });
    assert.strictEqual(doc.version, VERSION);
    assert.strictEqual(doc.title, "Brainstorming Session");
    assert.strictEqual(doc.pages.length, 1);
    assert.strictEqual(doc.activePageIndex, 0);
    assert.strictEqual(doc.pages[0].name, "Page 1");
    assert.deepStrictEqual(doc.pages[0].items, []);
  });

  test("stroke creation, bounding box, and hit testing", () => {
    const stroke = createStroke({
      points: [
        { x: 10, y: 10, p: 0.5, t: 0 },
        { x: 50, y: 50, p: 0.8, t: 100 },
        { x: 100, y: 10, p: 0.3, t: 250 },
      ],
      color: "#ef4444",
      size: 4,
    });
    assert.strictEqual(stroke.points.length, 3);
    assert.strictEqual(stroke.duration, 250);

    const bb = getBoundingBox(stroke);
    assert.ok(bb.minX <= 10 && bb.maxX >= 100);
    assert.ok(bb.minY <= 10 && bb.maxY >= 50);

    // Hit test on segment
    assert.strictEqual(hitTest(stroke, 50, 50, 5), true);
    // Hit test far away
    assert.strictEqual(hitTest(stroke, 200, 200, 5), false);
  });

  test("shapes, sticky notes, and text items bounding boxes", () => {
    const rect = createShape({ shapeType: "rect", x: 20, y: 30, width: 100, height: 60 });
    const bbRect = getBoundingBox(rect);
    assert.strictEqual(bbRect.minX, 20);
    assert.strictEqual(bbRect.minY, 30);
    assert.strictEqual(bbRect.width, 100);
    assert.strictEqual(bbRect.height, 60);

    const sticky = createSticky({ text: "Remember milk", x: 150, y: 200, width: 120, height: 120 });
    const text = createText({ text: "Project Alpha", x: 0, y: 0, width: 200, height: 50 });

    const groupBB = getSelectionBoundingBox([rect, sticky, text]);
    assert.strictEqual(groupBB.minX, 0);
    assert.strictEqual(groupBB.minY, 0);
    assert.ok(groupBB.maxX >= 270);
    assert.ok(groupBB.maxY >= 320);
  });

  test("item manipulations: add, update, move, scale, reorder, remove", () => {
    const page = createPage({ name: "Work Page" });
    const it1 = addItem(page, createShape({ shapeType: "circle", x: 50, y: 50, width: 40, height: 40 }));
    const it2 = addItem(page, createText({ text: "Diagram Start", x: 100, y: 50 }));

    assert.strictEqual(page.items.length, 2);

    // Update
    updateItem(page, it2.id, { text: "Updated Label" });
    assert.strictEqual(page.items[1].text, "Updated Label");

    // Move
    moveItem(page, it1.id, 10, -5);
    assert.strictEqual(page.items[0].x, 60);
    assert.strictEqual(page.items[0].y, 45);

    // Scale
    scaleItem(page, it1.id, 2, 2, 60, 45);
    assert.strictEqual(page.items[0].width, 80);

    // Reorder
    reorderItem(page, it1.id, "bring_to_front");
    assert.strictEqual(page.items[1].id, it1.id);

    // Remove
    assert.strictEqual(removeItem(page, it1.id), true);
    assert.strictEqual(page.items.length, 1);
  });

  test("undo and redo transaction management", () => {
    const page = createPage();
    const stack = createUndoStack();

    const shape = createShape({ x: 0, y: 0 });
    addItem(page, shape);
    pushUndoAction(stack, { type: "add", item: shape });

    assert.strictEqual(page.items.length, 1);

    // Undo add
    undo(page, stack);
    assert.strictEqual(page.items.length, 0);

    // Redo add
    redo(page, stack);
    assert.strictEqual(page.items.length, 1);
  });

  test("replay timeline preserves chronological order", () => {
    const page = createPage();
    const t0 = 1000;
    const s1 = createStroke({
      t0,
      points: [
        { x: 0, y: 0, t: 0 },
        { x: 10, y: 10, t: 50 },
      ],
      duration: 50,
    });
    const s2 = createStroke({
      t0: t0 + 100,
      points: [
        { x: 20, y: 20, t: 0 },
        { x: 30, y: 30, t: 40 },
      ],
      duration: 40,
    });
    addItem(page, s1);
    addItem(page, s2);

    const timeline = getReplayTimeline(page);
    assert.ok(timeline.length >= 4);
    for (let i = 0; i < timeline.length - 1; i++) {
      assert.ok(timeline[i].time <= timeline[i + 1].time, "Timeline events must be ordered by time");
    }
  });

  test("documentToText outputs clean markdown for AI understanding", () => {
    const doc = createDocument({ title: "Architecture Plan" });
    const page = doc.pages[0];
    addItem(page, createText({ text: "Client requests API gateway" }));
    addItem(page, createSticky({ title: "Security Note", text: "Enforce mTLS" }));
    addItem(page, createChecklist({ title: "Sprint Tasks", items: [{ text: "Write tests", checked: true }, { text: "Deploy", checked: false }] }));
    addItem(page, createTable({ headers: ["Service", "Port"], rows: [["Auth", "8080"], ["Data", "5432"]] }));
    addItem(page, createDiagram({ syntax: "mermaid", code: "graph LR; A-->B" }));

    const text = documentToText(doc);
    assert.match(text, /# Architecture Plan/);
    assert.match(text, /Client requests API gateway/);
    assert.match(text, /Security Note/);
    assert.match(text, /Enforce mTLS/);
    assert.match(text, /\[x\] Write tests/);
    assert.match(text, /\[ \] Deploy/);
    assert.match(text, /Headers: Service \| Port/);
    assert.match(text, /graph LR; A-->B/);
  });
});
