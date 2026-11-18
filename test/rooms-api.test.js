// The rooms store over HTTP: CRUD, duplicate, export/import with a model, .glb checks, backups.
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-rooms-api-"));
process.env.FRIENDS_DATA_DIR = tempDir;
process.env.LOG_LEVEL = "error";

// A small, valid glTF 2.0 binary: a named chair with a seat node and a stand anchor (and an unknown extension)
function makeGlb({ extensions = true, required = [], version = 2 } = {}) {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const bin = Buffer.from(positions.buffer);
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0, 1, 2] }],
    nodes: [{ name: "Chair", mesh: 0 }, { name: "sit_seat", translation: [0, 0.45, 0] }, { name: "anchor_robot_stand", translation: [0, 0, 0.7] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ name: "c1", ...(extensions ? { extensions: { VENDOR_sparkle: { amount: 1 } } } : {}) }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", max: [1, 1, 0], min: [0, 0, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length }],
    buffers: [{ byteLength: bin.length }],
    ...(extensions ? { extensionsUsed: ["VENDOR_sparkle"] } : {}),
    ...(required.length ? { extensionsRequired: required, extensionsUsed: required } : {}),
  };
  let text = Buffer.from(JSON.stringify(json));
  if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
  const head = Buffer.alloc(12);
  const jh = Buffer.alloc(8);
  const bh = Buffer.alloc(8);
  jh.writeUInt32LE(text.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  bh.writeUInt32LE(bin.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(version, 4);
  head.writeUInt32LE(12 + 8 + text.length + 8 + bin.length, 8);
  return Buffer.concat([head, jh, text, bh, bin]);
}

describe("Rooms over HTTP", () => {
  let server;
  let base;
  const api = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  };
  const raw = async (method, url, body) => {
    const res = await fetch(base + url, { method, body });
    return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()), headers: res.headers };
  };

  before(async () => {
    server = require("../server/server").start(0, "127.0.0.1");
    await new Promise((resolve) => (server.listening ? resolve() : server.on("listening", resolve)));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("create from a template, read, save, list, duplicate, delete", async () => {
    const made = await api("POST", "/api/rooms", { template: "empty", name: "Test room", size: "small", walls: "three" });
    assert.equal(made.status, 200);
    const id = made.data.id;
    assert.equal(made.data.name, "Test room");
    assert.deepEqual(made.data.size, { w: 3.5, d: 3, h: 2.6 });
    assert.ok(fs.existsSync(path.join(tempDir, "rooms", `${id}.json`)));

    const doc = (await api("GET", `/api/rooms/${id}`)).data;
    doc.assets.push({ id: "desk", type: "desk_writing", pos: [0, 0, -1] }, { id: "lamp", type: "lamp_desk", parent: "desk", pos: [0.4, 0, 0] }, { id: "evil", type: "<script>" });
    const saved = await api("PUT", `/api/rooms/${id}`, doc);
    assert.equal(saved.status, 200);
    assert.equal(saved.data.assets.length, 2, "the unknown thing is dropped");
    assert.equal(saved.data.createdAt, made.data.createdAt);
    assert.ok(saved.data.notes.some((n) => n.includes("<script>")));

    const listed = (await api("GET", "/api/rooms")).data;
    assert.ok(listed.rooms.some((r) => r.id === id && r.assets === 2));
    assert.ok(listed.templates.length >= 31);

    const copy = await api("POST", `/api/rooms/${id}/duplicate`, {});
    assert.equal(copy.data.name, "Test room (copy)");
    assert.notEqual(copy.data.id, id);
    assert.equal(copy.data.assets.length, 2);

    assert.equal((await api("DELETE", `/api/rooms/${copy.data.id}`)).data.ok, true);
    assert.equal((await api("GET", `/api/rooms/${copy.data.id}`)).status, 404);
    assert.equal((await api("GET", "/api/rooms/..%2F..%2Fsettings")).status, 404);
  });

  test("a room from a template keeps the template's character", async () => {
    const made = (await api("POST", "/api/rooms", { template: "cozy_study_corner" })).data;
    assert.equal(made.template, "cozy_study_corner");
    assert.ok(made.assets.some((a) => a.type === "desk_writing"));
  });

  test("models: a valid .glb is cleaned and kept; broken ones are refused with a reason", async () => {
    const meta = encodeURIComponent(JSON.stringify({ label: "Blender chair", category: "seating", slots: ["floor"], footprint: { w: 0.6, d: 0.6 }, height: 0.9, anchors: { sit: [0, 0.45, 0], stand: [0, 0, 0.7] }, actions: ["sit"] }));
    const up = await fetch(`${base}/api/room-assets?meta=${meta}`, { method: "POST", body: makeGlb() }).then((r) => r.json());
    assert.equal(up.id, "blender_chair");
    assert.equal(up.info.triangles, 1);
    assert.deepEqual(up.info.stripped, ["VENDOR_sparkle"]);
    assert.equal(up.info.sockets.sit, 1);
    assert.equal(up.info.sockets.stand, true);
    assert.deepEqual(up.colors.map((c) => c.key), ["c1"]);
    const back = await raw("GET", `/api/room-assets/${up.id}`);
    assert.equal(back.status, 200);
    assert.ok(!back.buffer.includes(Buffer.from("VENDOR_sparkle")), "the unknown extension is gone from the file");
    assert.equal(back.buffer.readUInt32LE(8), back.buffer.length, "the rebuilt file's length field is right");

    for (const [body, words] of [
      [Buffer.from("not a model at all, sorry"), /isn't a binary .glb/],
      [makeGlb({ version: 1 }), /glTF 2.0/],
      [makeGlb({ required: ["VENDOR_magic"] }), /can't draw/],
      [Buffer.alloc(4), /truncated/],
    ]) {
      const res = await fetch(`${base}/api/room-assets`, { method: "POST", body });
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, words);
    }
    const all = (await api("GET", "/api/room-assets")).data.assets;
    assert.equal(all.length, 1);
  });

  test("export and import round trip, with the model it uses", async () => {
    const made = (await api("POST", "/api/rooms", { template: "empty", name: "With my chair" })).data;
    made.assets.push({ id: "mine", type: "custom:blender_chair", pos: [0.5, 0, -0.5] }, { id: "ball", type: "ball_bouncy", glb: "blender_chair", pos: [1, 0, 0] });
    const saved = (await api("PUT", `/api/rooms/${made.id}`, made)).data;
    assert.equal(saved.assets.length, 2, "a room may use your own model");
    const out = await raw("GET", `/api/rooms/${made.id}/export`);
    assert.equal(out.status, 200);
    assert.match(out.headers.get("content-disposition"), /with_my_chair\.friends-room/);
    const { parseZip } = require("../server/storage/studio-bundle");
    const files = parseZip(out.buffer);
    assert.ok(files.has("room.json") && files.has("models/blender_chair.glb") && files.has("models/blender_chair.json"));

    const imported = await fetch(`${base}/api/rooms/import`, { method: "POST", body: out.buffer }).then((r) => r.json());
    assert.notEqual(imported.id, made.id);
    const mine = imported.assets.find((a) => a.id === "mine");
    assert.match(mine.type, /^custom:blender_chair_\d+$/, "the model comes in under a new id and the room points at it");
    assert.equal(imported.assets.find((a) => a.id === "ball").glb, mine.type.slice(7));
    assert.equal((await api("GET", "/api/room-assets")).data.assets.length, 2);
  });

  test("a 0.7 .robot-room.json and a bare room document import too; junk doesn't", async () => {
    const old = JSON.stringify({ app: "friends-robot-room", version: 2, name: "Old café", room: { place: "cafe", sign: "OPEN" } });
    const a = await fetch(`${base}/api/rooms/import`, { method: "POST", body: old }).then((r) => r.json());
    assert.equal(a.template, "cafe");
    assert.equal(a.name, "Old café");
    const b = await fetch(`${base}/api/rooms/import`, { method: "POST", body: JSON.stringify({ schema: 1, name: "Bare", assets: [{ id: "m", type: "mug" }] }) }).then((r) => r.json());
    assert.equal(b.name, "Bare");
    const junk = await fetch(`${base}/api/rooms/import`, { method: "POST", body: "{]" });
    assert.equal(junk.status, 400);
  });

  test("backups include rooms and models, and a restore brings them back", async () => {
    const backup = require("../server/backup");
    const snap = backup.snapshot();
    const paths = snap.files.map((f) => f.path);
    assert.ok(paths.some((p) => /^rooms\/[\w-]+\.json$/.test(p)));
    assert.ok(paths.some((p) => /^room-assets\/[\w-]+\.glb$/.test(p)));
    assert.ok(paths.some((p) => /^room-assets\/[\w-]+\.json$/.test(p)));
  });

  test("photos for photo frames: told by their bytes, served back, carried in a room's export and import", async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
    const up = await fetch(`${base}/api/room-photos`, { method: "POST", headers: { "Content-Type": "image/png" }, body: png });
    assert.equal(up.status, 200);
    const { id, type } = await up.json();
    assert.match(id, /^ph_[0-9a-f]{12}$/);
    assert.equal(type, "image/png");
    const got = await raw("GET", `/api/room-photos/${id}`);
    assert.equal(got.status, 200);
    assert.equal(got.headers.get("content-type"), "image/png");
    assert.ok(got.buffer.equals(png));
    // Not a picture, whatever its name says; too big; a path in the id
    const text = await fetch(`${base}/api/room-photos`, { method: "POST", headers: { "Content-Type": "image/png" }, body: Buffer.from("<svg onload=alert(1)>") });
    assert.equal(text.status, 400);
    const big = await fetch(`${base}/api/room-photos`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(8 * 1024 * 1024)]) });
    assert.ok(big.status === 400 || big.status === 413);
    assert.equal((await raw("GET", "/api/room-photos/..%2Fsettings")).status, 404);
    // A room with the photo in a frame: exported with it, imported with a new copy
    const made = (await api("GET", `/api/rooms/${(await api("POST", "/api/rooms", { template: "empty", name: "Photo room" })).data.id}`)).data;
    const ops = require("../src/js/room/editor/ops.mjs");
    const res = ops.addAsset(made, "photo_frame", { pos: [0, 1.4, -1.9], slot: "wall" });
    const withPhoto = ops.updateAsset(res.room, res.id, { state: { showPhotos: true, photo: id } });
    assert.equal((await api("PUT", `/api/rooms/${made.id}`, withPhoto)).status, 200);
    const zip = await raw("GET", `/api/rooms/${made.id}/export`);
    assert.equal(zip.status, 200);
    const back = await fetch(`${base}/api/rooms/import`, { method: "POST", body: zip.buffer });
    const imported = await back.json();
    const frame = imported.assets.find((a) => a.type === "photo_frame");
    assert.ok(frame.state.photo && frame.state.photo !== id, "a copy under its own id");
    assert.ok((await raw("GET", `/api/room-photos/${frame.state.photo}`)).buffer.equals(png));
    assert.equal((await api("DELETE", `/api/room-photos/${frame.state.photo}`)).data.ok, true);
    assert.equal((await raw("GET", `/api/room-photos/${frame.state.photo}`)).status, 404);
  });

  test("there is a limit on how many rooms are kept", async () => {
    const rooms = require("../server/rooms");
    const have = rooms.list().rooms.length;
    for (let i = have; i < 64; i++) rooms.create({ template: "empty" });
    const res = await api("POST", "/api/rooms", { template: "empty" });
    assert.equal(res.status, 409);
  });
});
