// [[Links]] between boards: found in any words on a board, resolved by a board's name, and seen from both ends.
const { describe, test, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-links-test-"));
process.env.FRIENDS_DATA_DIR = tempDir;
process.env.LOG_LEVEL = "error";

const links = require("../src/js/whiteboard/links.mjs");
const text = require("../src/js/whiteboard/text.mjs");
const whiteboard = require("../server/whiteboard");
const { linksFor } = require("../server/whiteboard-links");

describe("[[Links]] between boards", () => {
  after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  test("are read from the words, with a page and what is shown", () => {
    assert.deepStrictEqual(links.parseLinks("See [[Lesson 2]], [[Plan#Week 3|the plan]] and [[ ]] but not [a] or [[x\ny]].").map((l) => [l.title, l.anchor, l.label]), [["Lesson 2", "", ""], ["Plan", "Week 3", "the plan"]]);
    assert.deepStrictEqual(links.parseLinks(null), []);
  });

  test("are drawn as links in Markdown text, and only when they are whole", () => {
    const runs = text.parseInline("Go to [[Lesson 2]] or [[Plan|the plan]] but not [[ ]] or [[open");
    assert.deepStrictEqual(runs.filter((r) => r.link).map((r) => [r.text, r.link]), [["Lesson 2", "Lesson 2"], ["the plan", "Plan"]]);
    assert.match(runs.map((r) => r.text).join(""), /\[\[ \]\] or \[\[open/);
  });

  test("count every thing that says one, whatever kind of thing it is", () => {
    const doc = { pages: [{ items: [
      { id: "a", type: "text", text: "Read [[Lesson 2]]" },
      { id: "b", type: "sticky", text: "also [[lesson 2]]", title: "" },
      { id: "c", type: "shape", label: "[[Quiz]]" },
      { id: "d", type: "checklist", title: "x", items: [{ text: "do [[Quiz]]" }] },
      { id: "e", type: "table", headers: ["h"], rows: [["[[Table link]]"]] },
      { id: "f", type: "stroke", points: [] },
    ] }] };
    const found = links.linksOfDoc(doc);
    assert.deepStrictEqual([...found.keys()].sort(), ["lesson 2", "quiz", "table link"]);
    assert.strictEqual(found.get("lesson 2").count, 2, "the same board by another spelling of its case");
    assert.deepStrictEqual(found.get("quiz").ids, ["c", "d"]);
  });

  test("are followed from both ends by the helper", () => {
    const a = whiteboard.create({ title: "Plan" });
    const b = whiteboard.create({ title: "Lesson 2" });
    const c = whiteboard.create({ title: "Notes" });
    whiteboard.apply(a.id, [{ op: "add", item: { type: "text", text: "Next: [[Lesson 2]] and [[Not made yet]]", format: "markdown" } }], { actor: "user" });
    whiteboard.apply(c.id, [{ op: "add", item: { type: "sticky", text: "back to [[plan]]" } }], { actor: "user" });
    const fromA = linksFor(a.id);
    assert.deepStrictEqual(fromA.outgoing.map((l) => [l.title, l.id]).sort(), [["Lesson 2", b.id], ["Not made yet", null]].sort());
    assert.deepStrictEqual(fromA.incoming.map((l) => [l.id, l.count]), [[c.id, 1]]);
    assert.deepStrictEqual(linksFor(b.id).incoming.map((l) => l.id), [a.id]);
    assert.strictEqual(linksFor("nope"), null);
  });
});
