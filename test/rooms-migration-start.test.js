// Starting the helper on a data folder with 1.0 settings moves its rooms into room documents, once.
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-rooms-start-"));
process.env.FRIENDS_DATA_DIR = tempDir;
process.env.LOG_LEVEL = "error";
fs.writeFileSync(path.join(tempDir, "settings.json"), fs.readFileSync(path.join(__dirname, "fixtures", "settings-1.0.json")));

describe("Rooms are migrated when the helper starts", () => {
  let server;
  let base;
  const api = (url) => fetch(base + url).then((r) => r.json());

  before(async () => {
    server = require("../server/server").start(0, "127.0.0.1");
    await new Promise((resolve) => (server.listening ? resolve() : server.on("listening", resolve)));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("the settings point at a room that holds the 1.0 place and its v1 things; it's written to disk", async () => {
    const s = await api("/api/settings");
    assert.match(s.robot.room.layoutId, /^[\w-]+$/);
    const room = await api(`/api/rooms/${s.robot.room.layoutId}`);
    assert.equal(room.template, "lounge");
    assert.ok(room.assets.some((a) => a.type === "whiteboard"), "the v1 things came along");
    assert.equal(s.robot.ai.use, false, "aiAllowed.prop off carried into the one permission model");
    const onDisk = JSON.parse(fs.readFileSync(path.join(tempDir, "settings.json"), "utf8"));
    assert.equal(onDisk.robot.room.layoutId, s.robot.room.layoutId);
    assert.ok(fs.existsSync(path.join(tempDir, "rooms", `${s.robot.room.layoutId}.json`)));
  });

  test("each character's room is a room too, and a second start changes nothing", async () => {
    const s = await api("/api/settings");
    // The characters that were in the file (built-ins the cleaner adds later start from their default room)
    const stored = require("./fixtures/settings-1.0.json").characters.list.map((c) => c.id);
    for (const c of s.characters.list.filter((x) => stored.includes(x.id))) assert.ok(c.look.room.layoutId, c.id);
    const before = (await api("/api/rooms")).rooms.length;
    const rooms = require("../server/rooms");
    assert.equal(rooms.migrateOnStart(JSON.parse(fs.readFileSync(path.join(tempDir, "settings.json"), "utf8"))), null);
    assert.equal((await api("/api/rooms")).rooms.length, before);
  });
});
