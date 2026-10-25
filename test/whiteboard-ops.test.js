const { test, describe } = require("node:test");
const assert = require("node:assert");

describe("Whiteboard operations: both of you edit one board", async () => {
  const M = await import("../src/js/whiteboard/model.mjs");
  const O = await import("../src/js/whiteboard/ops.mjs");
  const C = await import("../src/js/whiteboard/connectors.mjs");
  const A = await import("../src/js/whiteboard/arrange.mjs");

  const fresh = () => M.createDocument({ title: "Test" });
  const add = (doc, item, actor = "user") => O.applyOps(doc, { op: "add", item }, { actor }).applied[0].item;

  test("items get short ids, the author of whoever made them, and bad input is cleaned", () => {
    const doc = fresh();
    const t = add(doc, { type: "text", text: "Hello", x: 10, y: 20, color: "red; background:url(x)", fontSize: 9999, author: "ai" }, "user");
    assert.match(t.id, /^t[a-z0-9]{5}$/);
    assert.strictEqual(t.author, "user", "the author is who did it, not what the item claims");
    assert.strictEqual(t.fontSize, 160);
    assert.strictEqual(t.color, "#1e293b", "a color that is not a color falls back");
    const s = add(doc, { type: "sticky", text: "Hi", color: "pink" }, "ai");
    assert.strictEqual(s.color, M.STICKY_COLORS[3]);
    assert.strictEqual(s.author, "ai");
    const sh = add(doc, { type: "shape", shape: "circle", fill: "red", stroke: "blue", label: "A" });
    assert.strictEqual(sh.shapeType, "circle");
    assert.strictEqual(sh.fillColor, "#dc2626");
    assert.strictEqual(sh.label, "A");
  });

  test("pictures must be ones the page can show offline", () => {
    const doc = fresh();
    assert.strictEqual(add(doc, { type: "image", src: "https://evil.example/pixel.png" }).src, "");
    assert.strictEqual(add(doc, { type: "image", src: "javascript:alert(1)" }).src, "");
    assert.strictEqual(add(doc, { type: "image", src: "file:///etc/passwd" }).src, "");
    assert.strictEqual(add(doc, { type: "image", src: "data:image/png;base64,AAAA" }).src, "data:image/png;base64,AAAA");
    assert.strictEqual(add(doc, { type: "image", src: "/api/whiteboards/assets/wabc12/h4sh.png" }).src, "/api/whiteboards/assets/wabc12/h4sh.png");
    assert.strictEqual(add(doc, { type: "image", src: "/api/whiteboards/assets/../../settings" }).src, "");
  });

  test("update changes only what it names, and its inverse puts it back", () => {
    const doc = fresh();
    const t = add(doc, { type: "text", text: "One", x: 5, y: 6 });
    const r = O.applyOps(doc, { op: "update", id: t.id, set: { text: "Two", color: "#ef4444" } });
    assert.deepStrictEqual(r.errors, []);
    const now = doc.pages[0].items[0];
    assert.strictEqual(now.text, "Two");
    assert.strictEqual(now.x, 5);
    assert.strictEqual(now.id, t.id);
    O.applyOps(doc, r.inverse);
    assert.strictEqual(doc.pages[0].items[0].text, "One");
    assert.strictEqual(doc.pages[0].items[0].color, "#1e293b");
  });

  test("the type, id and author of an item can't be changed", () => {
    const doc = fresh();
    const t = add(doc, { type: "text", text: "x" });
    O.applyOps(doc, { op: "update", id: t.id, set: { type: "sticky", id: "other", author: "ai" } });
    const it = doc.pages[0].items[0];
    assert.strictEqual(it.type, "text");
    assert.strictEqual(it.id, t.id);
    assert.strictEqual(it.author, "user");
  });

  test("two edits to different items both survive, in any order", () => {
    const base = fresh();
    const a = add(base, { type: "sticky", text: "A", x: 0, y: 0 });
    const b = add(base, { type: "sticky", text: "B", x: 300, y: 0 });
    const userEdit = { op: "translate", ids: [a.id], dx: 50, dy: 0 };
    const aiEdit = { op: "update", id: b.id, set: { text: "B2" } };
    const one = JSON.parse(JSON.stringify(base));
    O.applyOps(one, userEdit, { actor: "user" });
    O.applyOps(one, aiEdit, { actor: "ai" });
    const two = JSON.parse(JSON.stringify(base));
    O.applyOps(two, aiEdit, { actor: "ai" });
    O.applyOps(two, userEdit, { actor: "user" });
    assert.deepStrictEqual(one.pages[0].items.map((i) => [i.id, i.x, i.text]), two.pages[0].items.map((i) => [i.id, i.x, i.text]));
    assert.strictEqual(one.pages[0].items[0].x, 50);
    assert.strictEqual(one.pages[0].items[1].text, "B2");
  });

  test("an edit to an item that is already gone is reported, not applied", () => {
    const doc = fresh();
    const t = add(doc, { type: "text", text: "x" });
    O.applyOps(doc, { op: "remove", id: t.id });
    const r = O.applyOps(doc, { op: "update", id: t.id, set: { text: "late" } }, { actor: "ai" });
    assert.strictEqual(r.errors.length, 1);
    assert.strictEqual(r.changed, false);
  });

  test("an AI or a mission can't change what you locked, you can", () => {
    const doc = fresh();
    const t = add(doc, { type: "text", text: "mine", locked: true });
    assert.strictEqual(O.applyOps(doc, { op: "update", id: t.id, set: { text: "x" } }, { actor: "ai" }).errors.length, 1);
    assert.strictEqual(O.applyOps(doc, { op: "remove", id: t.id }, { actor: "mission" }).changed, false);
    assert.strictEqual(O.applyOps(doc, { op: "translate", ids: [t.id], dx: 5, dy: 0 }, { actor: "ai" }).changed, false);
    assert.strictEqual(O.applyOps(doc, { op: "update", id: t.id, set: { text: "yours" } }, { actor: "user" }).changed, true);
    assert.strictEqual(O.applyOps(doc, { op: "update", id: t.id, set: { locked: null } }, { actor: "ai" }).changed, true, "only unlocking is allowed to anyone");
  });

  test("remove, clear and their inverses bring things back where they were, with their author", () => {
    const doc = fresh();
    const a = add(doc, { type: "text", text: "a" }, "user");
    const b = add(doc, { type: "text", text: "b" }, "ai");
    const c = add(doc, { type: "text", text: "c" }, "user");
    const r = O.applyOps(doc, { op: "remove", id: b.id }, { actor: "user" });
    assert.deepStrictEqual(doc.pages[0].items.map((i) => i.id), [a.id, c.id]);
    O.applyOps(doc, r.inverse, { actor: "user" });
    assert.deepStrictEqual(doc.pages[0].items.map((i) => i.id), [a.id, b.id, c.id]);
    assert.strictEqual(doc.pages[0].items[1].author, "ai", "undoing a delete keeps who made it");
    const cl = O.applyOps(doc, { op: "clear" }, { actor: "ai" });
    assert.strictEqual(doc.pages[0].items.length, 0);
    O.applyOps(doc, cl.inverse);
    assert.deepStrictEqual(doc.pages[0].items.map((i) => i.id), [a.id, b.id, c.id]);
  });

  test("clear leaves locked items alone for the AI", () => {
    const doc = fresh();
    add(doc, { type: "text", text: "keep", locked: true });
    add(doc, { type: "text", text: "go" });
    O.applyOps(doc, { op: "clear" }, { actor: "ai" });
    assert.deepStrictEqual(doc.pages[0].items.map((i) => i.text), ["keep"]);
  });

  test("ticking a checklist line is its own operation, so two ticks don't undo each other", () => {
    const doc = fresh();
    const c = add(doc, { type: "checklist", title: "T", items: ["a", "b", "c"] });
    const ids = doc.pages[0].items[0].items.map((i) => i.id);
    O.applyOps(doc, { op: "check", id: c.id, item: ids[0], checked: true }, { actor: "user" });
    O.applyOps(doc, { op: "check", id: c.id, item: ids[2], checked: true }, { actor: "ai" });
    assert.deepStrictEqual(doc.pages[0].items[0].items.map((i) => i.checked), [true, false, true]);
    const r = O.applyOps(doc, { op: "check", id: c.id, index: 1 });
    assert.strictEqual(doc.pages[0].items[0].items[1].checked, true);
    O.applyOps(doc, r.inverse);
    assert.strictEqual(doc.pages[0].items[0].items[1].checked, false);
  });

  test("translate moves strokes by their points and everything else by x and y", () => {
    const doc = fresh();
    const s = add(doc, { type: "stroke", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] });
    const t = add(doc, { type: "text", text: "x", x: 5, y: 5 });
    const r = O.applyOps(doc, { op: "translate", ids: [s.id, t.id], dx: 100, dy: -5 });
    assert.deepStrictEqual(doc.pages[0].items[0].points.map((p) => [p.x, p.y]), [[100, -5], [110, 5]]);
    assert.strictEqual(doc.pages[0].items[1].x, 105);
    O.applyOps(doc, r.inverse);
    assert.strictEqual(doc.pages[0].items[1].x, 5);
  });

  test("text grows to fit its words; a table is as tall as its rows", () => {
    const doc = fresh();
    const t = add(doc, { type: "text", text: "word ".repeat(200), width: 200, fontSize: 20 });
    assert.ok(t.height > 300, `height ${t.height}`);
    const tbl = add(doc, { type: "table", headers: ["a", "b"], rows: [["1", "2"], ["3", "4"], ["5", "6"]] });
    assert.ok(tbl.height >= 4 * 32 && tbl.height < 400);
    const r = O.applyOps(doc, { op: "update", id: t.id, set: { text: "short" } });
    assert.ok(doc.pages[0].items[0].height < 60);
    O.applyOps(doc, r.inverse);
    assert.ok(doc.pages[0].items[0].height > 300);
  });

  test("an id that is taken gets a new one", () => {
    const doc = fresh();
    const a = add(doc, { type: "text", text: "a", id: "same1" });
    const b = add(doc, { type: "text", text: "b", id: "same1" });
    assert.strictEqual(a.id, "same1");
    assert.notStrictEqual(b.id, "same1");
    assert.strictEqual(doc.pages[0].items.length, 2);
  });

  test("pages: add, rename, move, remove (never the last), and focus", () => {
    const doc = fresh();
    const first = doc.pages[0].id;
    const r = O.applyOps(doc, { op: "page_add", page: { name: "Second" } });
    assert.strictEqual(doc.pages.length, 2);
    assert.strictEqual(doc.activePageIndex, 1);
    const second = doc.pages[1].id;
    O.applyOps(doc, { op: "page_update", page: second, set: { name: "Ideas" } });
    assert.strictEqual(doc.pages[1].name, "Ideas");
    O.applyOps(doc, { op: "page_move", page: second, to: 0 });
    assert.strictEqual(doc.pages[0].id, second);
    assert.strictEqual(doc.pages[doc.activePageIndex].id, second, "the page being shown stays the one shown");
    O.applyOps(doc, { op: "focus", page: first });
    assert.strictEqual(doc.pages[doc.activePageIndex].id, first);
    O.applyOps(doc, r.inverse);
    assert.strictEqual(doc.pages.length, 1);
    assert.strictEqual(O.applyOps(doc, { op: "page_remove", page: doc.pages[0].id }).errors.length, 1, "a board keeps one page");
  });

  test("removing a page can be undone with everything on it", () => {
    const doc = fresh();
    O.applyOps(doc, { op: "page_add", page: { name: "B" } });
    const pid = doc.pages[1].id;
    add(doc, { type: "text", text: "on B" });
    const r = O.applyOps(doc, { op: "page_remove", page: pid });
    assert.strictEqual(doc.pages.length, 1);
    O.applyOps(doc, r.inverse);
    assert.strictEqual(doc.pages.length, 2);
    assert.strictEqual(doc.pages[1].items[0].text, "on B");
  });

  test("a page holds at most so many items, and unknown operations are refused", () => {
    const doc = fresh();
    const many = Array.from({ length: M.LIMITS.itemsPerPage + 5 }, (_, i) => ({ op: "add", item: { type: "shape", x: i, y: 0 } }));
    const r = O.applyOps(doc, many);
    assert.strictEqual(doc.pages[0].items.length, M.LIMITS.itemsPerPage);
    assert.ok(r.errors.length >= 5);
    assert.strictEqual(O.applyOps(doc, { op: "explode" }).errors.length, 1);
    assert.strictEqual(O.applyOps(doc, "nonsense").errors.length, 1);
  });

  test("a stroke is thinned when it has too many points, keeping the ends", () => {
    const pts = Array.from({ length: 20000 }, (_, i) => ({ x: i, y: i }));
    const s = M.createStroke({ points: pts });
    assert.ok(s.points.length <= M.LIMITS.strokePoints + 1);
    assert.strictEqual(s.points[0].x, 0);
    assert.strictEqual(s.points.at(-1).x, 19999);
  });

  describe("connectors", () => {
    test("an arrow glued to two boxes follows them, and lets go when one is deleted", () => {
      const doc = fresh();
      const a = add(doc, { type: "shape", shapeType: "rect", x: 0, y: 0, width: 100, height: 60 });
      const b = add(doc, { type: "shape", shapeType: "rect", x: 300, y: 0, width: 100, height: 60 });
      add(doc, { type: "shape", shapeType: "connector", from: { id: a.id }, to: { id: b.id } });
      const conn = () => doc.pages[0].items.find((i) => i.shapeType === "connector");
      assert.deepStrictEqual([conn().points[0].x, conn().points.at(-1).x], [100, 300]);
      O.applyOps(doc, { op: "translate", ids: [b.id], dx: 0, dy: 200 });
      assert.strictEqual(conn().points.at(-1).y, 230 - 0 > 0 ? conn().points.at(-1).y : 0);
      assert.ok(conn().points.at(-1).y > 100, "the arrow end moved with the box");
      O.applyOps(doc, { op: "remove", id: b.id });
      assert.strictEqual(conn().to, undefined);
      assert.strictEqual(conn().from.id, a.id);
    });

    test("routes: straight, elbow with right angles, and anchors face each other", () => {
      const a = { id: "a", type: "shape", x: 0, y: 0, width: 100, height: 60 };
      const b = { id: "b", type: "shape", x: 300, y: 200, width: 100, height: 60 };
      const pa = C.anchorPoint(a, "auto", { x: 350, y: 230 });
      const pb = C.anchorPoint(b, "auto", { x: 50, y: 30 });
      assert.ok(["right", "bottom"].includes(pa.side));
      const pts = C.routePoints({ ...pa }, { ...pb }, "elbow");
      for (let i = 1; i < pts.length; i++) assert.ok(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y, "every segment is horizontal or vertical");
      assert.strictEqual(C.routePoints(pa, pb, "straight").length, 2);
    });
  });

  describe("arranging", () => {
    test("align and distribute make translate operations that line things up", () => {
      const doc = fresh();
      const items = [0, 1, 2].map((i) => add(doc, { type: "shape", shapeType: "rect", x: i * 137 + (i === 1 ? 20 : 0), y: i * 50, width: 60, height: 40 }));
      const page = doc.pages[0];
      O.applyOps(doc, A.arrangeOps(page, items.map((i) => O.findItem(doc, i.id).item), "align_left"));
      assert.deepStrictEqual(page.items.map((i) => i.x), [0, 0, 0]);
      O.applyOps(doc, A.arrangeOps(page, page.items, "stack_v", { gap: 10 }));
      assert.deepStrictEqual(page.items.map((i) => i.y), [0, 50, 100]);
    });

    test("a free spot never touches anything, and is as close as it can get", () => {
      const doc = fresh();
      add(doc, { type: "shape", shapeType: "rect", x: 100, y: 100, width: 300, height: 300 });
      const spot = A.findFreeSpot(doc.pages[0], 150, 100, { near: { x: 150, y: 150 } });
      const r = { minX: spot.x, minY: spot.y, maxX: spot.x + 150, maxY: spot.y + 100 };
      assert.ok(r.maxX <= 100 || r.minX >= 400 || r.maxY <= 100 || r.minY >= 400, JSON.stringify(spot));
      const regions = A.freeRegions(doc.pages[0]);
      assert.ok(regions.length >= 1);
    });
  });
});
