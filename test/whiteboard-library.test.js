// The shape library and the teaching layouts: every entry makes real items, every layout lays out cleanly, and the
// remembered places of windows and of the robot stay inside what makes sense.
const { describe, test } = require("node:test");
const assert = require("node:assert");

const library = require("../src/js/whiteboard/library.mjs");
const model = require("../src/js/whiteboard/model.mjs");
const ops = require("../src/js/whiteboard/ops.mjs");
const templates = require("../src/js/whiteboard/templates.mjs");
const geometry = require("../src/js/whiteboard/geometry.mjs");
const studio = require("../src/js/whiteboard/studio.mjs");

describe("The shape library", () => {
  test("has groups, and every entry makes valid items around the point it is given", () => {
    assert.ok(library.LIBRARY.length >= 6);
    const seen = new Set();
    for (const group of library.LIBRARY) {
      assert.ok(group.entries.length >= 4, group.id);
      for (const entry of group.entries) {
        const key = `${group.id}:${entry.id}`;
        assert.ok(!seen.has(key), `${key} appears once`);
        seen.add(key);
        const items = library.makeEntry(key, 800, 500);
        assert.ok(items.length >= 1, key);
        for (const item of items) {
          const made = model.createItem({ ...item, id: model.genId(item.type) });
          assert.ok(made?.type, key);
          const box = model.getBoundingBox(made);
          assert.ok(Math.abs((box.minX + box.maxX) / 2 - 800) < 400 && Math.abs((box.minY + box.maxY) / 2 - 500) < 300, `${key} sits around the point`);
        }
      }
    }
    assert.deepStrictEqual(library.makeEntry("nope:nothing", 0, 0), []);
  });

  test("an entry can be added to a board as it is", () => {
    const doc = model.createDocument({ title: "t" });
    const page = doc.pages[0];
    for (const key of ["basic:diamond", "lines:arrow", "notes:sticky-1", "school:axes", "school:numberline", "frames:frame-2"]) {
      const items = library.makeEntry(key, 600, 400).map((item) => ({ op: "add", page: page.id, item: { ...item, id: model.genId(item.type) } }));
      const res = ops.applyOps(doc, items, { actor: "user" });
      assert.strictEqual(res.errors.length, 0, `${key}: ${res.errors[0]?.error}`);
    }
  });
});

describe("The teaching layouts", () => {
  const NEW = ["lesson_plan", "flashcards", "quiz", "glossary", "summary", "faq"];

  test("each is listed, described and has a title and an example", () => {
    for (const name of NEW) {
      assert.ok(templates.TEMPLATE_NAMES.includes(name), name);
      assert.ok(templates.TEMPLATE_INFO[name] && templates.TEMPLATE_TITLES[name] && templates.TEMPLATE_EXAMPLES[name], name);
    }
    for (const name of templates.TEMPLATE_NAMES) assert.ok(templates.TEMPLATE_TITLES[name] && templates.TEMPLATE_EXAMPLES[name], `${name} has a title and an example for the picker`);
  });

  test("each lays out its own example without a single error, inside the board", () => {
    for (const name of templates.TEMPLATE_NAMES) {
      const built = templates.buildTemplate(name, { title: "Fractions", sections: templates.TEMPLATE_EXAMPLES[name] });
      assert.ok(built.ops.length >= 2, name);
      assert.ok(built.bounds.width > 100 && built.bounds.width <= 1600, `${name} fits the width (${built.bounds.width})`);
      const doc = model.createDocument({ title: "t" });
      const res = ops.applyOps(doc, built.ops.map((o) => ({ ...o, page: doc.pages[0].id })), { actor: "ai" });
      assert.strictEqual(res.errors.length, 0, `${name}: ${res.errors[0]?.error}`);
    }
  });

  test("flashcards and quizzes use the words you give them", () => {
    const cards = templates.buildTemplate("flashcards", { sections: "Numerator: the top number\nDenominator: the bottom number" });
    const texts = cards.ops.map((o) => o.item.text).filter(Boolean);
    assert.ok(texts.includes("Numerator") && texts.includes("the top number") && texts.includes("Denominator"));
    const quiz = templates.buildTemplate("quiz", { sections: [{ title: "What is 1/2 + 1/4?", items: ["3/4"] }] });
    const all = quiz.ops.map((o) => o.item.text || o.item.title).join("\n");
    assert.match(all, /1\. What is 1\/2 \+ 1\/4\?/);
    assert.match(all, /1\. 3\/4/);
  });
});

describe("Where windows and the robot are remembered", () => {
  test("a window stays inside the space and keeps a valid mode", () => {
    const f = geometry.WINDOWS.chat;
    const g = geometry.cleanGeometry({ mode: "float", x: 9, y: -4, w: 5, h: 0, size: 3, shaded: "yes" }, f);
    assert.ok(g.x >= 0 && g.x <= 0.8 && g.y === 0 && g.w === 1 && g.h === 0.1 && g.size === 0.8, JSON.stringify(g));
    assert.strictEqual(g.shaded, f.shaded);
    assert.strictEqual(geometry.cleanGeometry({ mode: "sideways" }, f).mode, f.mode);
    assert.deepStrictEqual(geometry.cleanGeometry(null, f), f);
    assert.deepStrictEqual(Object.keys(geometry.cleanWindows({ chat: { mode: "left" }, evil: {} })).sort(), ["chat", "robot", "voice"]);
    assert.strictEqual(geometry.cleanWindows({ chat: { mode: "left" } }).chat.mode, "left");
  });

  test("the robot's place in voice mode is bounded", () => {
    assert.deepStrictEqual(geometry.cleanPlace({ x: 9, y: -9, scale: 99 }), { x: 0.5, y: -0.4, scale: 2 });
    assert.deepStrictEqual(geometry.cleanPlace({ x: "far", scale: 0 }), { x: 0, y: 0, scale: 0.5 });
    assert.deepStrictEqual(geometry.cleanPlace(null), geometry.DEFAULT_PLACE);
  });
});

describe("What the robot can make for you", () => {
  test("each one is a request in plain words, and names the layout it uses", () => {
    assert.ok(studio.STUDIO.length >= 6);
    for (const s of studio.STUDIO) assert.ok(s.id && s.label && s.hint && s.icon && s.prompt.length > 40, s.id);
    for (const [id, layout] of [["summary", "summary"], ["faq", "faq"], ["timeline", "timeline"], ["mindmap", "mind map"], ["quiz", "quiz"], ["flashcards", "flashcards"]]) {
      assert.match(studio.STUDIO.find((s) => s.id === id).prompt, new RegExp(layout));
    }
  });
});
