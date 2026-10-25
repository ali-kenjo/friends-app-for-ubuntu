const { describe, test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-wb-sync-test-"));
process.env.FRIENDS_DATA_DIR = tempDir;
process.env.LOG_LEVEL = "error";

const whiteboard = require("../server/whiteboard");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

describe("The shared whiteboard service", () => {
  after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  beforeEach(() => {
    whiteboard.flush();
    whiteboard.reset();
    fs.rmSync(path.join(tempDir, "whiteboards"), { recursive: true, force: true });
  });

  test("numbers every change, says who made it, and tells whoever listens", () => {
    const doc = whiteboard.current();
    const seen = [];
    const listener = (e) => seen.push(e);
    whiteboard.events.on("ops", listener);
    try {
      const a = whiteboard.apply(doc.id, { op: "add", item: { type: "text", text: "from the user" } }, { actor: "user", cid: "c1" });
      const b = whiteboard.apply(doc.id, { op: "add", item: { type: "text", text: "from the robot", x: 600 } }, { actor: "ai", batch: "turn1" });
      assert.deepStrictEqual([a.rev, b.rev], [1, 2]);
      assert.deepStrictEqual(seen.map((e) => [e.rev, e.actor, e.cid, e.batch]), [[1, "user", "c1", ""], [2, "ai", "", "turn1"]]);
      assert.strictEqual(seen[0].ops[0].item.author, "user");
      assert.strictEqual(seen[1].ops[0].item.author, "ai");
      assert.strictEqual(whiteboard.get(doc.id).rev, 2);
    } finally {
      whiteboard.events.off("ops", listener);
    }
  });

  test("changes that do nothing don't make a new number", () => {
    const doc = whiteboard.current();
    const r = whiteboard.apply(doc.id, { op: "update", id: "nope", set: { text: "x" } });
    assert.strictEqual(r.changed, false);
    assert.strictEqual(r.errors.length, 1);
    assert.strictEqual(whiteboard.get(doc.id).rev, 0);
  });

  test("you and the robot draw at the same moment and neither loses anything", () => {
    const doc = whiteboard.current();
    // Interleaved, the way two editors would really arrive
    for (let i = 0; i < 25; i++) {
      whiteboard.apply(doc.id, { op: "add", item: { type: "text", text: `user ${i}`, x: 10, y: i * 30 } }, { actor: "user" });
      whiteboard.apply(doc.id, { op: "add", item: { type: "text", text: `robot ${i}`, x: 800, y: i * 30 } }, { actor: "ai", batch: "t" });
    }
    const texts = whiteboard.get(doc.id).pages[0].items.map((i) => i.text);
    assert.strictEqual(texts.length, 50);
    assert.strictEqual(new Set(texts).size, 50);
    assert.strictEqual(whiteboard.get(doc.id).rev, 50);
  });

  test("a page that missed some changes can catch up, or is told to reload", () => {
    const doc = whiteboard.current();
    for (let i = 0; i < 5; i++) whiteboard.apply(doc.id, { op: "add", item: { type: "text", text: String(i) } }, { actor: i % 2 ? "ai" : "user" });
    const caught = whiteboard.since(doc.id, 3);
    assert.strictEqual(caught.reload, false);
    assert.deepStrictEqual(caught.changes.map((c) => c.rev), [4, 5]);
    assert.strictEqual(whiteboard.since(doc.id, 999).reload, true);
  });

  test("takes back the robot's whole reply at once, leaving yours", () => {
    const doc = whiteboard.current();
    whiteboard.apply(doc.id, { op: "add", item: { type: "text", text: "mine" } }, { actor: "user" });
    whiteboard.apply(doc.id, { op: "add", item: { type: "text", text: "robot 1", x: 500 } }, { actor: "ai", batch: "r1" });
    whiteboard.apply(doc.id, { op: "add", item: { type: "text", text: "robot 2", x: 500, y: 200 } }, { actor: "ai", batch: "r1" });
    const r = whiteboard.undoLast(doc.id);
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(whiteboard.get(doc.id).pages[0].items.map((i) => i.text), ["mine"]);
    assert.strictEqual(whiteboard.undoLast(doc.id).ok, false);
  });

  test("what the AI is told: the board, what you do on it, and what changed since it looked", () => {
    const doc = whiteboard.current();
    whiteboard.apply(doc.id, { op: "add", item: { type: "text", text: "Roadmap", x: 100, y: 100 } }, { actor: "ai" });
    const first = whiteboard.describeFor(doc.id, { user: "Ali" });
    assert.match(first.text, /Roadmap/);
    assert.strictEqual(first.changes, 0);
    whiteboard.setPresence(doc.id, "user", { page: 0, selection: [doc.pages[0].items[0].id], pointer: { x: 120, y: 130 }, tool: "pen", drawingAt: Date.now() });
    whiteboard.apply(doc.id, { op: "add", item: { type: "sticky", text: "Ali's idea", x: 600, y: 100 } }, { actor: "user" });
    const second = whiteboard.describeFor(doc.id, { user: "Ali" });
    assert.strictEqual(second.changes, 1);
    assert.match(second.text, /Ali added sticky/);
    assert.match(second.text, /has selected \[/);
    assert.match(second.text, /is drawing right now/);
    assert.strictEqual(whiteboard.describeFor(doc.id, { user: "Ali" }).changes, 0, "told once");
    // Presence nobody refreshed for a minute is gone
    assert.ok(whiteboard.getPresence(doc.id).user);
  });

  test("keeps safety copies, one every so often per kind of editor", () => {
    const doc = whiteboard.current();
    whiteboard.apply(doc.id, { op: "add", item: { type: "text", text: "a" } }, { actor: "ai" });
    whiteboard.apply(doc.id, { op: "add", item: { type: "text", text: "b", y: 200 } }, { actor: "ai" });
    whiteboard.apply(doc.id, { op: "add", item: { type: "text", text: "c", y: 400 } }, { actor: "user" });
    const history = whiteboard.getHistory(doc.id);
    assert.strictEqual(history.length, 2, "one for the robot, one for you");
    assert.deepStrictEqual(history.map((h) => h.actor).sort(), ["ai", "user"]);
    // Restoring goes back to a copy, keeps a copy of what it replaced, and everyone is told
    const events = [];
    const listener = (e) => events.push(e);
    whiteboard.events.on("board", listener);
    const aiCopy = history.find((h) => h.actor === "ai");
    const restored = whiteboard.restoreVersion(doc.id, aiCopy.versionId);
    whiteboard.events.off("board", listener);
    assert.strictEqual(restored.pages[0].items.length, 0, "the copy was taken before the robot's first edit");
    assert.ok(events.some((e) => e.type === "replaced"));
    assert.ok(restored.rev > 3);
  });

  test("stays on disk: written after a moment, reloaded as it was", () => {
    const doc = whiteboard.current();
    whiteboard.apply(doc.id, { op: "add", item: { type: "checklist", title: "Tasks", items: ["one", "two"] } }, { actor: "user" });
    whiteboard.flush();
    assert.ok(fs.existsSync(path.join(tempDir, "whiteboards", `${doc.id}.json`)));
    whiteboard.reset();
    const again = whiteboard.get(doc.id);
    assert.strictEqual(again.pages[0].items[0].title, "Tasks");
    assert.strictEqual(again.rev, 1);
    assert.strictEqual(whiteboard.current().id, doc.id, "the board in use is remembered");
    assert.strictEqual(whiteboard.list().find((b) => b.id === doc.id).itemCount, 1);
  });

  test("a damaged or hostile file loads cleaned up", () => {
    const dir = whiteboard.getStorageDir();
    fs.writeFileSync(path.join(dir, "evil.json"), JSON.stringify({ id: "evil", title: "<img src=x onerror=alert(1)>", pages: [{ id: "p", name: "Page", items: [{ type: "image", src: "https://evil.example/x.png", id: "i1" }, { type: "text", text: "ok", color: "red;x:y", id: "t1" }, "nonsense", { type: "stroke", points: "no" }] }] }));
    whiteboard.reset();
    const doc = whiteboard.get("evil");
    assert.strictEqual(doc.pages[0].items.find((i) => i.id === "i1").src, "");
    assert.strictEqual(doc.pages[0].items.find((i) => i.id === "t1").color, "#1e293b");
    assert.strictEqual(doc.pages[0].items.length, 4);
    fs.writeFileSync(path.join(dir, "broken.json"), "{ not json");
    assert.throws(() => whiteboard.get("broken"), /Corrupted/);
  });

  test("board ids can't point outside the folder", () => {
    for (const bad of ["../settings", "a/b", "..", "", "x".repeat(80), "a b"]) assert.throws(() => whiteboard.get(bad), /Invalid whiteboard ID/, bad);
  });

  describe("pictures", () => {
    test("only real pictures are kept, under a name made from what they hold", () => {
      const doc = whiteboard.current();
      const a = whiteboard.saveAsset(doc.id, PNG);
      assert.match(a.src, new RegExp(`^/api/whiteboards/assets/${doc.id}/[0-9a-f]{24}\\.png$`));
      assert.strictEqual(whiteboard.saveAsset(doc.id, PNG).src, a.src, "the same picture is kept once");
      assert.throws(() => whiteboard.saveAsset(doc.id, Buffer.from("<svg onload=alert(1)></svg>")), /PNG, JPEG, GIF and WebP/);
      assert.throws(() => whiteboard.saveAsset(doc.id, Buffer.from("<html><script>1</script></html>")), /PNG/);
      assert.throws(() => whiteboard.saveAsset(doc.id, Buffer.alloc(7 * 1024 * 1024, 1)), /6 MB/);
      assert.throws(() => whiteboard.saveAsset(doc.id, Buffer.alloc(0)), /empty/);
      assert.ok(whiteboard.readAsset(doc.id, a.src.split("/").pop()));
      assert.strictEqual(whiteboard.readAsset(doc.id, "../../settings.json"), null);
      assert.strictEqual(whiteboard.readAsset(doc.id, "nothing.png"), null);
      assert.strictEqual(whiteboard.readAsset(doc.id, "..%2Fx.png"), null);
    });

    test("a copy of a board brings its pictures, a deleted board takes them along", () => {
      const doc = whiteboard.current();
      const a = whiteboard.saveAsset(doc.id, PNG);
      whiteboard.apply(doc.id, { op: "add", item: { type: "image", src: a.src, x: 10, y: 10 } }, { actor: "user" });
      const copy = whiteboard.duplicate(doc.id);
      const src = copy.pages[0].items[0].src;
      assert.ok(src.includes(copy.id), src);
      assert.ok(whiteboard.readAsset(copy.id, src.split("/").pop()));
      whiteboard.remove(copy.id);
      assert.ok(!fs.existsSync(path.join(tempDir, "whiteboards", `${copy.id}.assets`)));
      assert.ok(whiteboard.readAsset(doc.id, a.src.split("/").pop()), "the original keeps its picture");
    });
  });
});

describe("The whiteboard over HTTP", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-wb-http-test-"));
  let server;
  let base;
  // The server module was already loaded with the first folder; these run against the same data
  before(async () => {
    server = require("../server/server").start(0, "127.0.0.1");
    await new Promise((resolve) => (server.listening ? resolve() : server.on("listening", resolve)));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(`${base}${url}`, { method, headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body) });
    const type = res.headers.get("content-type") || "";
    return { status: res.status, headers: res.headers, data: type.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer()) };
  };

  test("operations from the page are the user's, whatever they claim", async () => {
    const { data: cur } = await call("GET", "/api/whiteboards/current");
    const r = await call("POST", `/api/whiteboards/${cur.id}/ops`, { cid: "page-1", ops: [{ op: "add", item: { type: "text", text: "claims to be the robot", author: "ai", x: 40, y: 40 } }] });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.applied[0].item.author, "user");
    assert.ok(r.data.rev >= 1);
    const bad = await call("POST", `/api/whiteboards/${cur.id}/ops`, { ops: [{ op: "explode" }, 5, { op: "remove", id: "nope" }] });
    assert.strictEqual(bad.status, 200);
    assert.strictEqual(bad.data.errors.length, 3);
    const lots = await call("POST", `/api/whiteboards/${cur.id}/ops`, { ops: Array.from({ length: 500 }, () => ({ op: "add", item: { type: "text", text: "x" } })) });
    assert.strictEqual(lots.status, 400);
  });

  test("the page tells the helper what you are doing, and the AI is told", async () => {
    const { data: cur } = await call("GET", "/api/whiteboards/current");
    const p = await call("POST", `/api/whiteboards/${cur.id}/presence`, { page: 0, pointer: { x: 321, y: 123 }, tool: "highlighter", drawing: true, selection: ["abc", "../../x", 5] });
    assert.strictEqual(p.data.ok, true);
    const d = await call("GET", `/api/whiteboards/${cur.id}/describe`);
    assert.match(d.data.text, /pointer near \(321, 123\)/);
    assert.match(d.data.text, /tool: highlighter/);
    assert.match(d.data.text, /is drawing right now/);
    const pres = whiteboard.getPresence(cur.id).user;
    assert.deepStrictEqual(pres.selection, ["abc"], "only ids are kept");
  });

  test("every change reaches the page that is listening, at once", async () => {
    const { data: cur } = await call("GET", "/api/whiteboards/current");
    const res = await fetch(`${base}/api/events`);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let seen = "";
    const got = (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return seen;
        seen += value;
        if (/event: whiteboard\ndata: .*"text":"live"/s.test(seen)) return seen;
      }
    })();
    await new Promise((r) => setTimeout(r, 100));
    whiteboard.apply(cur.id, { op: "add", item: { type: "text", text: "live", x: 5, y: 5 } }, { actor: "ai", batch: "x" });
    const text = await Promise.race([got, new Promise((r) => setTimeout(() => r("timeout"), 3000))]);
    await reader.cancel();
    assert.notStrictEqual(text, "timeout");
    const line = text.split("\n").find((l) => l.startsWith("data:") && l.includes('"kind":"ops"'));
    const evt = JSON.parse(line.slice(5));
    assert.strictEqual(evt.actor, "ai");
    assert.strictEqual(evt.boardId, cur.id);
  });

  test("pictures: uploaded as they are, shown with safe headers, never anything else", async () => {
    const { data: cur } = await call("GET", "/api/whiteboards/current");
    const up = await call("POST", `/api/whiteboards/${cur.id}/assets`, PNG, { "Content-Type": "image/png" });
    assert.strictEqual(up.status, 200);
    const got = await call("GET", up.data.src);
    assert.strictEqual(got.status, 200);
    assert.strictEqual(got.headers.get("content-type"), "image/png");
    assert.strictEqual(got.headers.get("x-content-type-options"), "nosniff");
    assert.match(got.headers.get("content-security-policy"), /sandbox/);
    assert.ok(Buffer.compare(got.data, PNG) === 0);
    const html = await call("POST", `/api/whiteboards/${cur.id}/assets`, "<script>alert(1)</script>", { "Content-Type": "text/html" });
    assert.strictEqual(html.status, 400);
    assert.strictEqual((await call("GET", `/api/whiteboards/assets/${cur.id}/..%2F..%2Fsettings.json`)).status, 404);
    assert.strictEqual((await call("GET", `/api/whiteboards/assets/${cur.id}/missing.png`)).status, 404);
  });

  test("an unknown board is a 404, the current board can be changed, old restore paths still work", async () => {
    assert.strictEqual((await call("GET", "/api/whiteboards/nosuchboard")).status, 404);
    const a = (await call("POST", "/api/whiteboards", { title: "Second board" })).data;
    const set = await call("PUT", "/api/whiteboards/current", { id: a.id });
    assert.strictEqual(set.data.id, a.id);
    assert.strictEqual((await call("GET", "/api/whiteboards/current")).data.id, a.id);
    assert.strictEqual((await call("PUT", "/api/whiteboards/current", { id: "../x" })).status, 400);
    // History: the list and both ways of restoring
    await call("POST", `/api/whiteboards/${a.id}/ops`, { ops: [{ op: "add", item: { type: "text", text: "v1" } }] });
    await call("PUT", `/api/whiteboards/${a.id}`, { ...a, title: "Renamed" });
    const hist = (await call("GET", `/api/whiteboards/${a.id}/history`)).data.history;
    assert.ok(hist.length >= 1);
    assert.strictEqual((await call("POST", `/api/whiteboards/${a.id}/restore`, { versionId: hist[0].versionId })).status, 200);
    assert.strictEqual((await call("POST", `/api/whiteboards/${a.id}/history/${hist[0].versionId}/restore`)).status, 200);
    assert.strictEqual((await call("POST", `/api/whiteboards/${a.id}/restore`, { versionId: "../../etc/passwd" })).status, 400);
  });

  test("a backup has what you drew a moment ago, and a restore brings the board back as it was", async () => {
    const backup = require("../server/backup");
    const a = (await call("POST", "/api/whiteboards", { title: "Backed up" })).data;
    await call("POST", `/api/whiteboards/${a.id}/ops`, { ops: [{ op: "add", item: { type: "text", text: "before the backup" } }] });
    const made = backup.create("manual"); // the board is only saved a moment after a change: the backup saves it first
    await call("POST", `/api/whiteboards/${a.id}/ops`, { ops: [{ op: "add", item: { type: "text", text: "after the backup" } }] });
    const texts = async () => (await call("GET", `/api/whiteboards/${a.id}`)).data.pages.flatMap((p) => p.items.map((i) => i.text));
    assert.deepStrictEqual(await texts(), ["before the backup", "after the backup"]);
    backup.restoreSaved(made.name, { mode: "replace" });
    assert.deepStrictEqual(await texts(), ["before the backup"], "not what was in memory");
    // and it can still be drawn on afterwards
    await call("POST", `/api/whiteboards/${a.id}/ops`, { ops: [{ op: "add", item: { type: "text", text: "again" } }] });
    assert.deepStrictEqual(await texts(), ["before the backup", "again"]);
  });

  test("a whole board sent back is cleaned like anything else", async () => {
    const a = (await call("POST", "/api/whiteboards", { title: "Cleaned" })).data;
    const put = await call("PUT", `/api/whiteboards/${a.id}`, { ...a, pages: [{ id: "p1", name: "x", items: [{ type: "image", src: "javascript:alert(1)" }, { type: "text", text: "ok" }] }] });
    assert.strictEqual(put.data.pages[0].items[0].src, "");
    assert.strictEqual(put.data.pages[0].items[1].text, "ok");
    assert.ok(put.data.rev > a.rev);
  });
});
