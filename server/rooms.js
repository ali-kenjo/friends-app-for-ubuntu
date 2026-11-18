// ---------- Rooms: the store and its API ----------
// Each room is a document in <data>/rooms/<id>.json (written atomically; the page autosaves a moment
// after a change). Your own models are <data>/room-assets/<id>.glb with a <id>.json catalog entry.
// Rooms, imports and bundles are untrusted: everything goes through src/js/room/model.mjs.
//
//   GET/POST /api/rooms   GET/PUT/DELETE /api/rooms/:id   POST /api/rooms/:id/duplicate
//   GET /api/rooms/:id/export (.friends-room: a zip with room.json and the models it uses)   POST /api/rooms/import
//   POST /api/room-assets (a .glb, ?meta=<json>)   GET/DELETE /api/room-assets/:id   GET /api/room-assets/:id/info
const fs = require("fs");
const path = require("path");
const { dataDir, writeJson } = require("./config");
const logger = require("./logger");
const model = require("../src/js/room/model.mjs");
const templates = require("../src/js/room/templates.mjs");
const migrate = require("../src/js/room/migrate.mjs");
const legacyRoom = require("../src/js/robot/room.mjs");
const { buildZip, parseZip } = require("./storage/studio-bundle");

const roomsDir = () => path.join(dataDir, "rooms");
const assetsDir = () => path.join(dataDir, "room-assets");
const MAX_GLB = 25 * 1024 * 1024;
const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const EXPORT_APP = "friends-room";
const EXPORT_VERSION = 1;

const bad = (message, http = 400) => Object.assign(new Error(message), { http });
const fileFor = (id) => path.join(roomsDir(), `${id}.json`);
const checkId = (id) => {
  if (!model.cleanId(id)) throw bad("That room id isn't valid.");
  return id;
};

// ---------- Your own models (catalog entries) ----------
let customCache = null;
function customCatalog() {
  if (customCache) return customCache;
  const out = {};
  let names = [];
  try {
    names = fs.readdirSync(assetsDir()).filter((n) => /^[\w-]{1,40}\.json$/.test(n));
  } catch {}
  for (const n of names) {
    try {
      const entry = model.sanitizeCustomEntry(JSON.parse(fs.readFileSync(path.join(assetsDir(), n), "utf8")), n.slice(0, -5));
      if (entry && fs.existsSync(path.join(assetsDir(), `${entry.id}.glb`))) out[entry.id] = entry;
    } catch {}
  }
  customCache = out;
  return out;
}

// ---------- Rooms ----------
function readRoom(id) {
  try {
    const raw = JSON.parse(fs.readFileSync(fileFor(id), "utf8"));
    const upgraded = migrate.upgradeLegacy(model.migrateRoom(raw));
    const doc = model.sanitizeRoom({ ...upgraded, id }, { custom: customCatalog() });
    // A room rebuilt from its template is written back once, so it isn't rebuilt on every read
    if (raw.legacy && !doc.legacy) write(doc);
    return doc;
  } catch {
    return null;
  }
}

function list() {
  let names = [];
  try {
    names = fs.readdirSync(roomsDir()).filter((n) => /^[\w-]{1,40}\.json$/.test(n));
  } catch {}
  const rooms = [];
  for (const n of names) {
    const doc = readRoom(n.slice(0, -5));
    if (!doc) continue;
    rooms.push({ id: doc.id, name: doc.name, template: doc.template, updatedAt: doc.updatedAt, createdAt: doc.createdAt, assets: doc.assets.length, size: doc.size, thumb: thumbOf(doc.id) });
  }
  rooms.sort((a, b) => b.updatedAt - a.updatedAt);
  return { rooms, templates: templates.TEMPLATES, limit: model.LIMITS.rooms };
}

function thumbOf(id) {
  try {
    const t = fs.readFileSync(path.join(roomsDir(), `${id}.thumb`), "utf8");
    return t.startsWith("data:image/") && t.length < 120000 ? t : "";
  } catch {
    return "";
  }
}

const taken = () => new Set(list().rooms.map((r) => r.id));

function get(id) {
  checkId(id);
  return readRoom(id) || null;
}

// Rooms changed (saved, made, removed): the AI's room block is made again (core/ai/room-context.js)
const events = new (require("events").EventEmitter)();

function write(doc) {
  writeJson(fileFor(doc.id), doc);
  events.emit("change", doc.id);
  return doc;
}

// body: { template, name, size, walls } for a new room from a template, or { room } for a copy of a document
function create(body = {}) {
  const ids = taken();
  if (ids.size >= model.LIMITS.rooms) throw bad(`You can keep up to ${model.LIMITS.rooms} rooms. Delete one first.`, 409);
  const now = Date.now();
  let doc;
  if (body.room && typeof body.room === "object") {
    const notes = [];
    doc = model.sanitizeRoom(migrate.upgradeLegacy(model.migrateRoom(body.room)), { custom: customCatalog(), notes, now });
  } else {
    const t = typeof body.template === "string" && templates.TEMPLATE_BY_ID[body.template] ? body.template : "empty";
    doc = templates.templateRoom(t, { size: body.size, walls: body.walls, floor: body.floor, wall: body.wall, now });
  }
  const name = model.text(body.name, model.LIMITS.name, "") || doc.name;
  doc.id = model.newId(slug(name) || "room", ids);
  doc.name = name;
  doc.createdAt = doc.updatedAt = now;
  return write(doc);
}

const slug = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);

function save(id, body) {
  checkId(id);
  const old = readRoom(id);
  if (!old) throw bad("Room not found", 404);
  const raw = body && typeof body === "object" && body.room && typeof body.room === "object" ? body.room : body;
  const notes = [];
  const doc = model.sanitizeRoom({ ...raw, id }, { custom: customCatalog(), notes });
  doc.createdAt = old.createdAt;
  doc.updatedAt = Date.now();
  if (typeof body?.thumb === "string" && body.thumb.startsWith("data:image/") && body.thumb.length < 120000) {
    fs.writeFileSync(path.join(roomsDir(), `${id}.thumb`), body.thumb, { mode: 0o600 });
  }
  return write(doc);
}

function remove(id) {
  checkId(id);
  const existed = fs.existsSync(fileFor(id));
  for (const f of [fileFor(id), path.join(roomsDir(), `${id}.thumb`)]) {
    try {
      fs.unlinkSync(f);
    } catch {}
  }
  return { ok: existed };
}

function duplicate(id, body = {}) {
  const doc = get(id);
  if (!doc) throw bad("Room not found", 404);
  return create({ room: doc, name: model.text(body.name, model.LIMITS.name, "") || `${doc.name} (copy)` });
}

// ---------- Export and import (.friends-room) ----------
function exportRoom(id) {
  const doc = get(id);
  if (!doc) throw bad("Room not found", 404);
  const entries = [{ name: "room.json", data: Buffer.from(JSON.stringify({ app: EXPORT_APP, version: EXPORT_VERSION, room: doc }, null, 2)) }];
  const used = new Set();
  for (const a of doc.assets) {
    if (a.glb) used.add(a.glb);
    if (a.type.startsWith(model.CUSTOM_PREFIX)) used.add(a.type.slice(model.CUSTOM_PREFIX.length));
  }
  const custom = customCatalog();
  for (const gid of used) {
    const glb = path.join(assetsDir(), `${gid}.glb`);
    if (!fs.existsSync(glb)) continue;
    entries.push({ name: `models/${gid}.glb`, data: fs.readFileSync(glb) });
    if (custom[gid]) entries.push({ name: `models/${gid}.json`, data: Buffer.from(JSON.stringify(custom[gid])) });
  }
  return { buffer: buildZip(entries), filename: `${slug(doc.name) || "room"}.friends-room` };
}

// A .friends-room zip, a room document as JSON, or a 0.7 .robot-room.json
function importRoom(buffer, { name } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw bad("That file is empty.");
  let roomData = null;
  const models = new Map();
  if (buffer.readUInt32LE(0) === 0x04034b50) {
    let files;
    try {
      files = parseZip(buffer);
    } catch {
      throw bad("That file isn't a Friends room.");
    }
    const json = files.get("room.json");
    if (!json) throw bad("That file isn't a Friends room.");
    roomData = parseJson(json.toString("utf8"));
    for (const [file, data] of files) {
      const m = file.match(/^models\/([\w-]{1,40})\.(glb|json)$/);
      if (!m) continue;
      const entry = models.get(m[1]) || {};
      entry[m[2]] = data;
      models.set(m[1], entry);
    }
  } else roomData = parseJson(buffer.toString("utf8"));
  if (!roomData || typeof roomData !== "object") throw bad("That file isn't a Friends room.");
  let doc;
  if (roomData.app === EXPORT_APP && roomData.room) doc = roomData.room;
  else if (roomData.schema && Array.isArray(roomData.assets)) doc = roomData;
  else {
    // 0.7 / 1.0 .robot-room.json
    const old = legacyRoom.readRoomFile(buffer.toString("utf8"));
    if (!old) throw bad("That file isn't a Friends room.");
    doc = migrate.roomFromLegacy(old.room, { name: old.name || "Imported room" });
  }
  // Its models come in under new ids, and the room points at them
  const remap = {};
  for (const [oldId, m] of models) {
    if (!m.glb) continue;
    try {
      const meta = m.json ? parseJson(m.json.toString("utf8")) : {};
      const saved = saveAsset(m.glb, { ...meta, id: undefined });
      remap[oldId] = saved.id;
    } catch (err) {
      logger.warn?.(`A model in an imported room was left out: ${err.message}`);
    }
  }
  if (Object.keys(remap).length && Array.isArray(doc.assets)) {
    doc.assets = doc.assets.map((a) => {
      const next = { ...a };
      if (next.glb && remap[next.glb]) next.glb = remap[next.glb];
      if (typeof next.type === "string" && next.type.startsWith(model.CUSTOM_PREFIX)) {
        const gid = next.type.slice(model.CUSTOM_PREFIX.length);
        if (remap[gid]) next.type = model.CUSTOM_PREFIX + remap[gid];
      }
      return next;
    });
  }
  return create({ room: doc, name: model.text(name, model.LIMITS.name, "") || model.text(doc.name, model.LIMITS.name, "") || "Imported room" });
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------- Your own models: upload, validate, clean ----------
// glTF extensions three.js understands; anything else is stripped (or the model is refused when it's required)
const KNOWN_EXTENSIONS = new Set([
  "KHR_materials_clearcoat", "KHR_materials_sheen", "KHR_materials_transmission", "KHR_materials_volume", "KHR_materials_ior",
  "KHR_materials_specular", "KHR_materials_emissive_strength", "KHR_materials_unlit", "KHR_materials_iridescence", "KHR_materials_anisotropy",
  "KHR_materials_dispersion", "KHR_texture_transform", "KHR_mesh_quantization", "KHR_lights_punctual", "EXT_texture_webp",
]);
const MAX_TEXTURE = 2048;

function readGlb(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20) throw bad("Empty or truncated .glb file.");
  if (buffer.length > MAX_GLB) throw bad("The model is bigger than 25 MB.");
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw bad("That file isn't a binary .glb model.");
  if (buffer.readUInt32LE(4) !== 2) throw bad("Only glTF 2.0 binary (.glb) files are supported.");
  const jsonLen = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== JSON_CHUNK || 20 + jsonLen > buffer.length) throw bad("The model's description is damaged.");
  const json = parseJson(buffer.subarray(20, 20 + jsonLen).toString("utf8"));
  if (!json || typeof json !== "object") throw bad("The model's description is damaged.");
  let bin = null;
  const binStart = 20 + jsonLen;
  if (binStart + 8 <= buffer.length && buffer.readUInt32LE(binStart + 4) === BIN_CHUNK) {
    const binLen = buffer.readUInt32LE(binStart);
    bin = buffer.subarray(binStart + 8, binStart + 8 + binLen);
  }
  return { json, bin };
}

function stripUnknown(json) {
  const required = Array.isArray(json.extensionsRequired) ? json.extensionsRequired : [];
  const missing = required.filter((e) => !KNOWN_EXTENSIONS.has(e));
  if (missing.length) throw bad(`The model needs something Friends can't draw (${missing.slice(0, 3).join(", ")}).`);
  const stripped = [];
  const clean = (o) => {
    if (!o || typeof o !== "object") return;
    if (o.extensions && typeof o.extensions === "object") {
      for (const k of Object.keys(o.extensions)) if (!KNOWN_EXTENSIONS.has(k)) {
        delete o.extensions[k];
        stripped.push(k);
      }
    }
    for (const v of Object.values(o)) if (v && typeof v === "object") clean(v);
  };
  clean(json);
  if (Array.isArray(json.extensionsUsed)) json.extensionsUsed = json.extensionsUsed.filter((e) => KNOWN_EXTENSIONS.has(e));
  return [...new Set(stripped)];
}

// Width and height of a PNG or JPEG
function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
      i += 2 + len;
    }
  }
  return null;
}

function inspect(json, bin) {
  let triangles = 0;
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      const mode = prim.mode ?? 4;
      if (mode !== 4) continue;
      const acc = json.accessors?.[prim.indices ?? prim.attributes?.POSITION];
      triangles += Math.floor((acc?.count || 0) / 3);
    }
  }
  let maxTexture = 0;
  for (const img of json.images || []) {
    const view = json.bufferViews?.[img.bufferView];
    if (!view || !bin) continue;
    const size = imageSize(bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength));
    if (size) maxTexture = Math.max(maxTexture, size[0], size[1]);
  }
  const names = (json.nodes || []).map((n) => String(n?.name || ""));
  const materials = (json.materials || []).map((m) => String(m?.name || ""));
  return {
    triangles,
    maxTexture,
    textureCapped: maxTexture > MAX_TEXTURE,
    sockets: {
      stand: names.some((n) => n === "anchor_robot_stand"),
      grip: names.some((n) => n === "socket_hand_grip"),
      canvas: names.includes("DynamicCanvas") || materials.includes("DynamicCanvas"),
      sit: names.filter((n) => /^sit_/.test(n)).length,
      look: names.filter((n) => /^look_/.test(n)).length,
      surfaces: names.filter((n) => /^surface_/.test(n)).length,
    },
    recolor: ["c1", "c2", "c3"].filter((k) => materials.includes(k)),
  };
}

function rebuildGlb(json, bin) {
  let text = Buffer.from(JSON.stringify(json), "utf8");
  const pad = (4 - (text.length % 4)) % 4;
  if (pad) text = Buffer.concat([text, Buffer.alloc(pad, 0x20)]);
  const parts = [Buffer.alloc(12), Buffer.alloc(8), text];
  if (bin) {
    let b = bin;
    const bp = (4 - (b.length % 4)) % 4;
    if (bp) b = Buffer.concat([b, Buffer.alloc(bp)]);
    const head = Buffer.alloc(8);
    head.writeUInt32LE(b.length, 0);
    head.writeUInt32LE(BIN_CHUNK, 4);
    parts.push(head, b);
  }
  parts[1].writeUInt32LE(text.length, 0);
  parts[1].writeUInt32LE(JSON_CHUNK, 4);
  const total = parts.reduce((n, p) => n + p.length, 0);
  parts[0].writeUInt32LE(GLB_MAGIC, 0);
  parts[0].writeUInt32LE(2, 4);
  parts[0].writeUInt32LE(total, 8);
  return Buffer.concat(parts);
}

// buffer: the .glb; meta: what the wizard says about it (name, category, slots, footprint, anchors…)
function saveAsset(buffer, meta = {}) {
  const { json, bin } = readGlb(buffer);
  const stripped = stripUnknown(json);
  const info = inspect(json, bin);
  const ids = new Set(Object.keys(customCatalog()));
  const id = model.newId(slug(meta.label || meta.name) || "model", ids);
  const entry = model.sanitizeCustomEntry({ ...meta, id, info: { ...info, stripped, bytes: buffer.length } }, id);
  fs.mkdirSync(assetsDir(), { recursive: true, mode: 0o700 });
  const out = stripped.length ? rebuildGlb(json, bin) : buffer;
  const tmp = path.join(assetsDir(), `${id}.glb.tmp`);
  fs.writeFileSync(tmp, out, { mode: 0o600 });
  fs.renameSync(tmp, path.join(assetsDir(), `${id}.glb`));
  writeJson(path.join(assetsDir(), `${id}.json`), entry);
  customCache = null;
  return entry;
}

function updateAsset(id, meta = {}) {
  checkId(id);
  const old = customCatalog()[id];
  if (!old) throw bad("Model not found", 404);
  const entry = model.sanitizeCustomEntry({ ...old, ...meta, id, info: old.info }, id);
  writeJson(path.join(assetsDir(), `${id}.json`), entry);
  customCache = null;
  return entry;
}

function getAsset(id) {
  checkId(id);
  const file = path.join(assetsDir(), `${id}.glb`);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

function assetInfo(id) {
  checkId(id);
  return customCatalog()[id] || null;
}

function removeAsset(id) {
  checkId(id);
  let ok = false;
  for (const ext of ["glb", "json"]) {
    try {
      fs.unlinkSync(path.join(assetsDir(), `${id}.${ext}`));
      ok = true;
    } catch {}
  }
  customCache = null;
  return { ok };
}

const listAssets = () => ({ assets: Object.values(customCatalog()) });

// ---------- A 1.0 room object (an older look, a character, a look file) as a room document ----------
// Made once and reused: rooms/.legacy-map.json remembers which 1.0 room (by its content) became which document.
const legacyMapFile = () => path.join(roomsDir(), ".legacy-map.json"); // (a dot: not a room file)
function fromLegacy(legacyObject) {
  const clean = legacyRoom.sanitizeRoom(legacyObject);
  const key = require("crypto").createHash("sha1").update(JSON.stringify(clean)).digest("hex").slice(0, 16);
  let map = {};
  try {
    map = JSON.parse(fs.readFileSync(legacyMapFile(), "utf8")) || {};
  } catch {}
  if (map[key] && readRoom(map[key])) return map[key];
  const doc = migrate.roomFromLegacy(clean, { now: Date.now() });
  const made = create({ room: doc, name: doc.name });
  map[key] = made.id;
  fs.mkdirSync(roomsDir(), { recursive: true, mode: 0o700 });
  writeJson(legacyMapFile(), map);
  return made.id;
}

// ---------- On start: 0.6–1.0 settings become rooms ----------
// stored: the settings file as read. Returns the settings to keep (with references), or null when nothing changed.
function migrateOnStart(stored) {
  if (!stored || typeof stored !== "object") return null;
  const result = migrate.migrateSettings(stored);
  if (!result) return null;
  const existing = taken();
  const rename = {};
  for (const doc of result.rooms) {
    let id = doc.id;
    if (existing.has(id)) id = model.newId(id, existing);
    existing.add(id);
    rename[doc.id] = id;
    write({ ...doc, id });
  }
  const fix = (ref) => (ref && rename[ref.layoutId] ? { layoutId: rename[ref.layoutId] } : ref);
  const s = result.settings;
  s.robot.room = fix(s.robot.room);
  s.robot.customRooms = (s.robot.customRooms || []).map((c) => ({ ...c, room: fix(c.room) }));
  s.robot.looks = (s.robot.looks || []).map((l) => ({ ...l, room: fix(l.room) }));
  if (Array.isArray(s.characters?.list)) s.characters.list = s.characters.list.map((c) => (c?.look ? { ...c, look: { ...c.look, room: fix(c.look.room) } } : c));
  logger.info?.(`Rooms: moved ${result.rooms.length} room(s) from ${s.roomsMigratedFrom} settings`);
  return s;
}

// A room to show when the one asked for is missing (deleted, or settings from another computer)
function ensure(id) {
  if (id && model.cleanId(id) && readRoom(id)) return id;
  const first = list().rooms[0];
  if (first) return first.id;
  return create({ template: "studio" }).id;
}

const reset = () => {
  customCache = null;
};

module.exports = {
  events,
  fromLegacy,
  list, get, create, save, remove, duplicate, exportRoom, importRoom,
  saveAsset, updateAsset, getAsset, assetInfo, removeAsset, listAssets, customCatalog,
  migrateOnStart, ensure, reset, readGlb, inspect, MAX_GLB,
};
