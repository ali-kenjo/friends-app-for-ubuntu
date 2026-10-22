const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("Whiteboard REST API endpoints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-wb-api-test-"));
  process.env.FRIENDS_DATA_DIR = tempDir;
  process.env.LOG_LEVEL = "error";

  let server;
  let base;

  before(async () => {
    server = require("../server/server").start(0, "127.0.0.1");
    await new Promise((resolve) => (server.listening ? resolve() : server.on("listening", resolve)));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const api = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    return { status: res.status, data };
  };

  test("CRUD lifecycle via REST API", async () => {
    // 1. Create a board
    const { status: createStatus, data: created } = await api("POST", "/api/whiteboards", {
      title: "Team Architecture",
      scope: "general",
    });
    assert.strictEqual(createStatus, 200);
    assert.ok(created.id);
    assert.strictEqual(created.title, "Team Architecture");

    const id = created.id;

    // 2. List boards
    const { status: listStatus, data: list } = await api("GET", "/api/whiteboards");
    assert.strictEqual(listStatus, 200);
    assert.ok(Array.isArray(list));
    assert.ok(list.some((b) => b.id === id));

    // 3. Get board by ID
    const { status: getStatus, data: fetched } = await api("GET", `/api/whiteboards/${id}`);
    assert.strictEqual(getStatus, 200);
    assert.strictEqual(fetched.id, id);
    assert.strictEqual(fetched.title, "Team Architecture");

    // 4. Update board via PUT
    fetched.title = "Updated Architecture";
    const { status: putStatus, data: updated } = await api("PUT", `/api/whiteboards/${id}`, fetched);
    assert.strictEqual(putStatus, 200);
    assert.strictEqual(updated.title, "Updated Architecture");

    // 5. Duplicate board
    const { status: dupStatus, data: duplicated } = await api("POST", `/api/whiteboards/${id}/duplicate`);
    assert.strictEqual(dupStatus, 200);
    assert.notStrictEqual(duplicated.id, id);
    assert.strictEqual(duplicated.title, "Updated Architecture (Copy)");

    // 6. Delete board
    const { status: delStatus, data: delRes } = await api("DELETE", `/api/whiteboards/${id}`);
    assert.strictEqual(delStatus, 200);
    assert.strictEqual(delRes.ok, true);
  });

  test("Active whiteboard endpoint retrieves or creates for scope", async () => {
    const { status, data: active } = await api("GET", "/api/whiteboards/active?scope=mission&scopeId=m-123");
    assert.strictEqual(status, 200);
    assert.ok(active.id);
    assert.strictEqual(active.scope, "mission");
    assert.strictEqual(active.scopeId, "m-123");
  });

  test("Export endpoint produces markdown and JSON", async () => {
    const { data: created } = await api("POST", "/api/whiteboards", { title: "Export Test" });
    const { status: jsonStatus, data: exportedJson } = await api("POST", `/api/whiteboards/${created.id}/export`, { format: "json" });
    assert.strictEqual(jsonStatus, 200);
    assert.strictEqual(exportedJson.format, "json");

    const { status: textStatus, data: exportedText } = await api("POST", `/api/whiteboards/${created.id}/export`, { format: "text" });
    assert.strictEqual(textStatus, 200);
    assert.strictEqual(exportedText.format, "text");
    assert.match(exportedText.text, /# Export Test/);
  });
});
