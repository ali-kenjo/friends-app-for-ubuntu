const { describe, test, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-wb-store-test-"));
process.env.FRIENDS_DATA_DIR = tempDir;

const whiteboard = require("../server/whiteboard");

describe("The page's copy of the board", async () => {
  const { BoardStore, revealDuration } = await import("../src/js/whiteboard/board-store.mjs");
  after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  // A page wired straight to the helper's service, with a clock and frames we move by hand
  function page({ settings = {}, delayEcho = false } = {}) {
    let clock = 0;
    const frames = [];
    const handlers = [];
    const posted = [];
    const echoes = [];
    const forward = (e) => (delayEcho ? echoes.push(e) : handlers.forEach((h) => h({ kind: "ops", ...e })));
    whiteboard.events.on("ops", forward);
    const io = {
      now: () => clock,
      raf: (fn) => (frames.push(fn), frames.length),
      caf: () => {},
      subscribe: (fn) => (handlers.push(fn), () => handlers.splice(handlers.indexOf(fn), 1)),
      get: async (url) => {
        if (url.endsWith("/current")) return JSON.parse(JSON.stringify(whiteboard.current()));
        const id = url.split("/").pop();
        return JSON.parse(JSON.stringify(whiteboard.get(id)));
      },
      send: async (method, url, body) => {
        posted.push({ method, url, body });
        if (url.endsWith("/ops")) return whiteboard.apply(url.split("/")[3], body.ops, { actor: "user", cid: body.cid });
        if (url.endsWith("/presence")) return { ok: true };
        if (url.endsWith("/undo-ai")) return whiteboard.undoLast(url.split("/")[3]);
        if (url.endsWith("/current")) return whiteboard.setCurrent(body.id);
        throw new Error(`unexpected ${method} ${url}`);
      },
      upload: async () => ({}),
    };
    const store = new BoardStore(io, () => ({ whiteboard: { animate: true, writingSpeed: "normal", followRobot: true, ...settings } }));
    const tick = (ms) => {
      clock += ms;
      const run = frames.splice(0);
      run.forEach((f) => f());
    };
    return {
      store, io, posted, tick, handlers,
      deliverEchoes: () => echoes.splice(0).forEach((e) => handlers.forEach((h) => h({ kind: "ops", ...e }))),
      stop: () => whiteboard.events.off("ops", forward),
    };
  }

  beforeEach(() => {
    whiteboard.flush();
    whiteboard.reset();
    fs.rmSync(path.join(tempDir, "whiteboards"), { recursive: true, force: true });
  });

  test("loads the board both of you share and shows what you add straight away", async () => {
    const p = page();
    await p.store.init();
    const seen = [];
    p.store.on("change", (c) => seen.push(c));
    const res = await p.store.apply({ op: "add", item: { type: "text", text: "Hello", x: 10, y: 10 } });
    assert.strictEqual(res.changed, true);
    assert.strictEqual(p.store.page.items.length, 1);
    assert.strictEqual(p.store.page.items[0].author, "user");
    assert.strictEqual(p.store.rev, 1);
    assert.strictEqual(seen.length, 1, "told once, not again for its own echo");
    assert.strictEqual(seen[0].local, true);
    p.stop();
  });

  test("what the robot draws arrives by itself, marked as its own", async () => {
    const p = page();
    await p.store.init();
    const remote = [];
    p.store.on("remote", (r) => remote.push(r));
    whiteboard.apply(p.store.doc.id, { op: "add", item: { type: "sticky", text: "From the robot", x: 600, y: 100 } }, { actor: "ai", batch: "t1" });
    assert.strictEqual(p.store.page.items[0].author, "ai");
    assert.strictEqual(remote.length, 1);
    assert.strictEqual(remote[0].actor, "ai");
    assert.strictEqual(p.store.rev, 1);
    p.stop();
  });

  test("changes applied in the helper's order even when they arrive out of order", async () => {
    const p = page({ delayEcho: true });
    await p.store.init();
    const id = p.store.doc.id;
    whiteboard.apply(id, { op: "add", item: { type: "text", text: "one", x: 0, y: 0 } }, { actor: "ai" });
    whiteboard.apply(id, { op: "add", item: { type: "text", text: "two", x: 0, y: 100 } }, { actor: "ai" });
    whiteboard.apply(id, { op: "add", item: { type: "text", text: "three", x: 0, y: 200 } }, { actor: "user" });
    // Deliver 3, then 1, then 2
    const held = [];
    p.deliverEchoes = null;
    const events = [];
    const listener = (e) => events.push(e);
    whiteboard.events.on("ops", listener);
    whiteboard.apply(id, { op: "add", item: { type: "text", text: "four", x: 0, y: 300 } }, { actor: "ai" });
    whiteboard.events.off("ops", listener);
    void held;
    // The store has seen nothing yet: feed it by hand, backwards
    const all = [1, 2, 3, 4].map((r) => ({ kind: "ops", boardId: id, rev: r, actor: r === 3 ? "user" : "ai", ops: [{ op: "add", page: p.store.doc.pages[0].id, item: { type: "text", id: `x${r}`, text: `n${r}`, x: 0, y: r * 100 } }] }));
    p.store.fromServer(all[3]);
    p.store.fromServer(all[1]);
    assert.strictEqual(p.store.rev, 0, "waits for the first");
    p.store.fromServer(all[0]);
    assert.strictEqual(p.store.rev, 2);
    p.store.fromServer(all[2]);
    assert.strictEqual(p.store.rev, 4);
    assert.deepStrictEqual(p.store.page.items.map((i) => i.id), ["x1", "x2", "x3", "x4"]);
    p.store.destroy();
    p.stop();
  });

  test("its own change isn't applied twice, whichever arrives first", async () => {
    for (const echoFirst of [true, false]) {
      whiteboard.reset();
      fs.rmSync(path.join(tempDir, "whiteboards"), { recursive: true, force: true });
      const p = page({ delayEcho: !echoFirst });
      await p.store.init();
      const op = p.store.apply({ op: "add", item: { type: "text", text: "once" } });
      await op;
      p.deliverEchoes();
      assert.strictEqual(p.store.page.items.length, 1, `echoFirst=${echoFirst}`);
      p.stop();
    }
  });

  test("your own undo and redo, one step at a time, leaving the robot's work", async () => {
    const p = page();
    await p.store.init();
    const id = p.store.doc.id;
    await p.store.apply({ op: "add", item: { type: "text", text: "A", x: 0, y: 0 } });
    whiteboard.apply(id, { op: "add", item: { type: "text", text: "robot", x: 500, y: 0 } }, { actor: "ai", batch: "x" });
    await p.store.apply({ op: "add", item: { type: "text", text: "B", x: 0, y: 200 } });
    assert.deepStrictEqual(p.store.page.items.map((i) => i.text), ["A", "robot", "B"]);
    await p.store.undo();
    assert.deepStrictEqual(p.store.page.items.map((i) => i.text), ["A", "robot"]);
    await p.store.undo();
    assert.deepStrictEqual(p.store.page.items.map((i) => i.text), ["robot"]);
    assert.strictEqual(p.store.historyState().canUndo, false);
    await p.store.redo();
    await p.store.redo();
    assert.deepStrictEqual(p.store.page.items.map((i) => i.text), ["A", "robot", "B"]);
    assert.strictEqual(p.store.historyState().canRedo, false);
    // Undo, redo, undo again works the same
    await p.store.undo();
    await p.store.redo();
    await p.store.undo();
    assert.deepStrictEqual(p.store.page.items.map((i) => i.text), ["A", "robot"]);
    // A new change clears what could be redone
    await p.store.apply({ op: "add", item: { type: "text", text: "C", y: 400 } });
    assert.strictEqual(p.store.historyState().canRedo, false);
    p.stop();
  });

  test("the robot's drawing can be taken back as a whole", async () => {
    const p = page();
    await p.store.init();
    const id = p.store.doc.id;
    whiteboard.apply(id, { op: "add", item: { type: "text", text: "r1", x: 500 } }, { actor: "ai", batch: "a" });
    whiteboard.apply(id, { op: "add", item: { type: "text", text: "r2", x: 500, y: 200 } }, { actor: "ai", batch: "a" });
    await p.store.apply({ op: "add", item: { type: "text", text: "mine", y: 400 } });
    const r = await p.store.undoRobot();
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(p.store.page.items.map((i) => i.text), ["mine"]);
    p.stop();
  });

  test("a board that is switched to by the robot is loaded by the page", async () => {
    const p = page();
    await p.store.init();
    const first = p.store.doc.id;
    const other = whiteboard.create({ title: "Second" });
    whiteboard.setCurrent(other.id);
    p.store.fromServer({ kind: "board", type: "current", id: other.id });
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(p.store.doc.id, other.id);
    assert.notStrictEqual(p.store.doc.id, first);
    p.stop();
  });

  test("when the helper can't be reached the change is shown, kept, and sent later", async () => {
    const p = page();
    await p.store.init();
    const real = p.io.send;
    p.io.send = async () => {
      throw new Error("down");
    };
    const r = await p.store.apply({ op: "add", item: { type: "text", text: "offline", x: 1, y: 1 } });
    assert.strictEqual(r.offline, true);
    assert.strictEqual(p.store.status, "offline");
    assert.strictEqual(p.store.page.items.length, 1);
    p.io.send = real;
    await p.store.flushOutbox();
    assert.strictEqual(p.store.status, "online");
    assert.strictEqual(whiteboard.current().pages[0].items.length, 1);
    assert.strictEqual(p.store.page.items.length, 1, "after reloading it is still there once");
    p.stop();
  });

  test("the robot's work is written out one thing after the other, and finishes", async () => {
    const p = page();
    await p.store.init();
    const id = p.store.doc.id;
    const frames = [];
    p.store.on("frame", (f) => frames.push(f));
    whiteboard.apply(id, [{ op: "add", item: { type: "text", text: "First line of the answer", x: 0, y: 0 } }, { op: "add", item: { type: "shape", shapeType: "rect", x: 500, y: 0, width: 100, height: 50 } }], { actor: "ai", batch: "w" });
    const [a, b] = p.store.page.items;
    assert.strictEqual(p.store.reveal.get(a.id), 0);
    assert.strictEqual(p.store.reveal.get(b.id), 0, "the second waits its turn, hidden");
    assert.ok(p.store.writing);
    p.tick(16); // the first frame starts the clock of the first thing
    p.tick(400);
    assert.ok(p.store.reveal.get(a.id) > 0 && p.store.reveal.get(a.id) < 1);
    assert.strictEqual(p.store.reveal.get(b.id), 0);
    for (let i = 0; i < 40; i++) p.tick(250);
    assert.strictEqual(p.store.reveal.size, 0);
    assert.strictEqual(p.store.writing, false);
    // What you draw yourself is never written out like that
    await p.store.apply({ op: "add", item: { type: "text", text: "mine", y: 300 } });
    assert.strictEqual(p.store.reveal.size, 0);
    p.stop();
  });

  test("with the animation off, or skipped, everything is just there", async () => {
    const off = page({ settings: { animate: false } });
    await off.store.init();
    whiteboard.apply(off.store.doc.id, { op: "add", item: { type: "text", text: "now" } }, { actor: "ai" });
    assert.strictEqual(off.store.reveal.size, 0);
    off.stop();
    whiteboard.reset();
    fs.rmSync(path.join(tempDir, "whiteboards"), { recursive: true, force: true });
    const on = page();
    await on.store.init();
    whiteboard.apply(on.store.doc.id, { op: "add", item: { type: "text", text: "later" } }, { actor: "ai" });
    assert.strictEqual(on.store.reveal.size, 1);
    on.store.finishReveal();
    assert.strictEqual(on.store.reveal.size, 0);
    on.stop();
  });

  test("a long batch is written in a few seconds at most", () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ type: "text", text: "word ".repeat(30), id: `t${i}` }));
    assert.ok(items.reduce((s, it) => s + revealDuration(it), 0) > 20000);
    assert.ok(revealDuration(items[0], "fast") < revealDuration(items[0], "normal"));
    assert.ok(revealDuration(items[0], "slow") > revealDuration(items[0], "normal"));
  });

  test("following the robot to a page it added, unless that's switched off", async () => {
    const p = page();
    await p.store.init();
    whiteboard.apply(p.store.doc.id, { op: "page_add", page: { name: "Robot page" } }, { actor: "ai" });
    assert.strictEqual(p.store.pageIndex, 1);
    p.stop();
    whiteboard.reset();
    fs.rmSync(path.join(tempDir, "whiteboards"), { recursive: true, force: true });
    const stay = page({ settings: { followRobot: false } });
    await stay.store.init();
    whiteboard.apply(stay.store.doc.id, { op: "page_add", page: { name: "Robot page" } }, { actor: "ai" });
    assert.strictEqual(stay.store.pageIndex, 0);
    stay.stop();
  });

  test("tells the helper where you are, not more often than a few times a second", async () => {
    const p = page();
    await p.store.init();
    p.posted.length = 0;
    for (let i = 0; i < 30; i++) p.store.sendPresence({ pointer: { x: i, y: i }, tool: "pen" });
    await new Promise((r) => setTimeout(r, 450));
    const sent = p.posted.filter((x) => x.url.endsWith("/presence"));
    assert.ok(sent.length >= 1 && sent.length <= 3, `${sent.length} presence posts`);
    assert.deepStrictEqual(sent.at(-1).body.pointer, { x: 29, y: 29 });
    assert.strictEqual(sent.at(-1).body.page, 0);
    p.stop();
  });
});
