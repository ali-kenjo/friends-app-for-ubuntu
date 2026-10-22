const { test, describe, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("Whiteboard local file storage and persistence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-wb-storage-test-"));
  process.env.FRIENDS_DATA_DIR = tempDir;

  const whiteboard = require("../server/whiteboard");

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("creates new board, writes to disk, and updates index", () => {
    const doc = whiteboard.create({ title: "Roadmap 2027", scope: "chat", scopeId: "chat-1" });
    assert.ok(doc.id);
    assert.strictEqual(doc.title, "Roadmap 2027");

    const diskFile = path.join(tempDir, "whiteboards", `${doc.id}.json`);
    assert.strictEqual(fs.existsSync(diskFile), true);

    const index = whiteboard.list();
    assert.ok(index.some((b) => b.id === doc.id && b.title === "Roadmap 2027"));
  });

  test("retrieves active board by scope, creating if absent", () => {
    const doc = whiteboard.getActive("character", "atlas");
    assert.ok(doc.id);
    assert.strictEqual(doc.scope, "character");
    assert.strictEqual(doc.scopeId, "atlas");

    // Fetching active again should return the existing board
    const doc2 = whiteboard.getActive("character", "atlas");
    assert.strictEqual(doc2.id, doc.id);
  });

  test("updates board and preserves version snapshots in history", () => {
    const doc = whiteboard.create({ title: "Draft Board" });
    const id = doc.id;

    // Update with pages
    doc.pages[0].name = "Updated Page 1";
    whiteboard.save(id, doc);

    // Update again
    doc.pages[0].name = "Second Revision";
    whiteboard.save(id, doc);

    const history = whiteboard.getHistory(id);
    assert.ok(history.length >= 2, "History must contain previous snapshots");

    // Restore older version
    const oldest = history[history.length - 1];
    const restored = whiteboard.restoreVersion(id, oldest.timestamp);
    assert.ok(restored);
  });

  test("duplicates board with clean copy title", () => {
    const orig = whiteboard.create({ title: "Sprint Tasks" });
    const copy = whiteboard.duplicate(orig.id);

    assert.notStrictEqual(copy.id, orig.id);
    assert.strictEqual(copy.title, "Sprint Tasks (Copy)");
    assert.ok(whiteboard.get(copy.id));
  });

  test("removes board and its history folder", () => {
    const doc = whiteboard.create({ title: "To Delete" });
    const id = doc.id;
    assert.ok(whiteboard.get(id));

    const ok = whiteboard.remove(id);
    assert.strictEqual(ok, true);
    assert.strictEqual(whiteboard.get(id), null);
    assert.strictEqual(fs.existsSync(path.join(tempDir, "whiteboards", `${id}.json`)), false);
  });

  test("exports board data as JSON and markdown text", () => {
    const doc = whiteboard.create({ title: "Meeting Notes" });
    const jsonExport = whiteboard.exportData(doc.id, { format: "json" });
    assert.strictEqual(jsonExport.format, "json");
    assert.strictEqual(jsonExport.title, "Meeting Notes");

    const textExport = whiteboard.exportData(doc.id, { format: "text" });
    assert.strictEqual(textExport.format, "text");
    assert.match(textExport.text, /# Meeting Notes/);
  });
});
