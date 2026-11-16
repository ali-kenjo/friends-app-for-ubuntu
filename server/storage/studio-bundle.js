// ---------- Schema-Versioned Studio Storage & Full Bundle Export/Import ----------
// Manages schema-versioned studio persistence in ~/.config/friends-app-for-ubuntu/
// (synced seamlessly with active dataDir), 0600 credential fallback files, custom .glb
// asset overrides, automatic backups, schema migrations, and zero-dependency .zip / .json bundles.
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { dataDir, version } = require("../config");
const settings = require("../settings");
const logger = require("../logger");

const SCHEMA_VERSION = 1;
const SAFE_ASSET_ID = /^[a-z0-9_-]{1,64}$/i;
const MAX_GLB_BYTES = 25 * 1024 * 1024;
const GLB_MAGIC = 0x46546c67; // "glTF"

function ubuntuStudioDir() {
  if (process.env.FRIENDS_DATA_DIR || process.env.NODE_TEST_CONTEXT) return dataDir;
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdg, "friends-app-for-ubuntu");
}

function activeStorageDir() {
  return process.env.FRIENDS_DATA_DIR || process.env.NODE_TEST_CONTEXT ? dataDir : ubuntuStudioDir();
}

function assetsGlbDir() {
  return path.join(dataDir, "studio-assets");
}

function studioFile() {
  return path.join(dataDir, "studio-bundle-state.json");
}

function writeAtomic(filePath, content, mode = 0o644) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, content, { mode });
  try {
    fs.chmodSync(tmp, mode);
  } catch {}
  fs.renameSync(tmp, filePath);
}

/** Write sensitive provider secrets with strict 0600 permissions when needed. */
function writeSecureSecrets(filePath, data) {
  const payload = JSON.stringify(data, null, 2);
  writeAtomic(filePath, payload, 0o600);
}

/** Migrate legacy v0 studio data to schemaVersion 1 cleanly. */
function migrateState(raw) {
  const doc = raw && typeof raw === "object" ? { ...raw } : {};
  const fromVersion = Number(doc.schemaVersion || 0);
  if (fromVersion < 1) {
    doc.schemaVersion = 1;
    doc.migratedFrom = fromVersion;
    doc.migratedAt = new Date().toISOString();
    doc.roomLayouts = doc.roomLayouts && typeof doc.roomLayouts === "object" ? doc.roomLayouts : {};
    doc.customGlbs = doc.customGlbs && typeof doc.customGlbs === "object" ? doc.customGlbs : {};
    doc.dockPresets = doc.dockPresets && typeof doc.dockPresets === "object" ? doc.dockPresets : {};
  }
  doc.schemaVersion = SCHEMA_VERSION;
  return doc;
}

function loadStudioState() {
  try {
    const raw = JSON.parse(fs.readFileSync(studioFile(), "utf8"));
    return migrateState(raw);
  } catch {
    // Also check backup if main file is corrupted
    try {
      const bak = JSON.parse(fs.readFileSync(`${studioFile()}.bak`, "utf8"));
      return migrateState(bak);
    } catch {
      return migrateState({});
    }
  }
}

function saveStudioState(state) {
  const next = migrateState(state);
  next.updatedAt = new Date().toISOString();
  const target = studioFile();
  if (fs.existsSync(target)) {
    try {
      fs.copyFileSync(target, `${target}.bak`);
    } catch {}
  }
  writeAtomic(target, JSON.stringify(next, null, 2), 0o644);
  // Mirror lightweight copy to ~/.config/friends-app-for-ubuntu/ outside test mode
  const ubuntuDir = ubuntuStudioDir();
  if (ubuntuDir !== dataDir) {
    try {
      writeAtomic(path.join(ubuntuDir, "studio-bundle-state.json"), JSON.stringify(next, null, 2), 0o600);
    } catch {}
  }
  return next;
}

/** Validate and save a custom .glb asset override for an InteractiveAsset ID. */
function saveAssetGlb(assetId, buffer) {
  const id = String(assetId || "").trim();
  if (!SAFE_ASSET_ID.test(id)) throw new Error("Invalid asset id for GLB override.");
  if (!Buffer.isBuffer(buffer) || buffer.length < 20) throw new Error("Empty or truncated GLB file.");
  if (buffer.length > MAX_GLB_BYTES) throw new Error("GLB asset exceeds 25 MB limit.");
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error("File is not a binary .glb model.");

  const gltfVersion = buffer.readUInt32LE(4);
  if (gltfVersion !== 2) throw new Error("Only glTF 2.0 binary (.glb) files are supported.");

  // Inspect JSON chunk for expected socket names so UI can display feedback immediately
  let sockets = { handGrip: false, robotStand: false, dynamicCanvas: false };
  try {
    const jsonLen = buffer.readUInt32LE(12);
    const jsonType = buffer.readUInt32LE(16);
    if (jsonType === 0x4e4f534a && 20 + jsonLen <= buffer.length) {
      const json = JSON.parse(buffer.subarray(20, 20 + jsonLen).toString("utf8"));
      const nodeNames = new Set((json.nodes || []).map((n) => String(n?.name || "")));
      const matNames = new Set((json.materials || []).map((m) => String(m?.name || "")));
      const meshNames = new Set((json.meshes || []).map((m) => String(m?.name || "")));
      sockets = {
        handGrip: nodeNames.has("socket_hand_grip") || meshNames.has("socket_hand_grip"),
        robotStand: nodeNames.has("anchor_robot_stand") || meshNames.has("anchor_robot_stand"),
        dynamicCanvas: nodeNames.has("DynamicCanvas") || matNames.has("DynamicCanvas") || meshNames.has("DynamicCanvas"),
      };
    }
  } catch {}

  const outFile = path.join(assetsGlbDir(), `${id}.glb`);
  writeAtomic(outFile, buffer, 0o644);
  const state = loadStudioState();
  state.customGlbs[id] = { id, bytes: buffer.length, sockets, updatedAt: new Date().toISOString() };
  saveStudioState(state);
  return { id, bytes: buffer.length, sockets };
}

function getAssetGlb(assetId) {
  const id = String(assetId || "").trim();
  if (!SAFE_ASSET_ID.test(id)) return null;
  const full = path.join(assetsGlbDir(), `${id}.glb`);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full);
}

function deleteAssetGlb(assetId) {
  const id = String(assetId || "").trim();
  if (!SAFE_ASSET_ID.test(id)) return false;
  const full = path.join(assetsGlbDir(), `${id}.glb`);
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch {}
  const state = loadStudioState();
  delete state.customGlbs[id];
  saveStudioState(state);
  return true;
}

// ---------- Zero-Dependency ZIP Writer / Reader (Node zlib store/deflate) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Create a standard ZIP archive buffer from an array of { name: string, data: Buffer }.
 */
function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8");
    const compressed = zlib.deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

/** Parse a standard ZIP archive buffer into a Map<string, Buffer>. */
function parseZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error("Invalid ZIP bundle.");
  // Locate EOCD signature from end
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Malformed ZIP directory.");

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  let ptr = buf.readUInt32LE(eocdOffset + 16);
  const out = new Map();

  for (let i = 0; i < totalEntries; i++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error("Corrupted ZIP central header.");
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    ptr += 46 + nameLen + extraLen + commentLen;

    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("Corrupted ZIP local header.");
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const compData = buf.subarray(dataStart, dataStart + compSize);
    const data = method === 0 ? Buffer.from(compData) : method === 8 ? zlib.inflateRawSync(compData, { maxOutputLength: 64 * 1024 * 1024 }) : null;
    if (!data) throw new Error(`Unsupported ZIP compression method ${method}.`);
    out.set(name, data);
  }
  return out;
}

/** Build a complete redacted Studio Bundle object (settings, studio state, custom GLBs). */
function exportStudioBundle({ includeGlbs = true } = {}) {
  const current = settings.get();
  // Never export raw secrets!
  const cleanSettings = JSON.parse(JSON.stringify(current));
  if (cleanSettings.telegram) cleanSettings.telegram.botToken = "";
  if (cleanSettings.reddit) cleanSettings.reddit.clientSecret = "";
  if (cleanSettings.aiVoice) {
    cleanSettings.aiVoice.openaiKey = "";
    cleanSettings.aiVoice.geminiKey = "";
  }

  const studioState = loadStudioState();
  const glbAssets = {};
  if (includeGlbs) {
    try {
      const dir = assetsGlbDir();
      if (fs.existsSync(dir)) {
        for (const name of fs.readdirSync(dir)) {
          if (!name.endsWith(".glb")) continue;
          const id = name.replace(/\.glb$/, "");
          if (SAFE_ASSET_ID.test(id)) {
            glbAssets[id] = fs.readFileSync(path.join(dir, name)).toString("base64");
          }
        }
      }
    } catch {}
  }

  return {
    format: "friends-studio-bundle",
    schemaVersion: SCHEMA_VERSION,
    appVersion: version,
    exportedAt: new Date().toISOString(),
    settings: {
      robot: cleanSettings.robot,
      aiVoice: cleanSettings.aiVoice,
      visualStyle: cleanSettings.visualStyle,
      voiceDock: cleanSettings.voiceDock,
      behaviorEngine: cleanSettings.behaviorEngine,
      roomEditor: cleanSettings.roomEditor,
      stageMode: cleanSettings.stageMode,
      personality: cleanSettings.personality,
      roles: cleanSettings.roles,
    },
    studioState,
    glbAssets,
  };
}

function exportBundleBuffer(format = "json") {
  const bundle = exportStudioBundle({ includeGlbs: true });
  if (format === "zip") {
    const manifest = { ...bundle, glbAssets: Object.keys(bundle.glbAssets) };
    const entries = [{ name: "studio-bundle.json", data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8") }];
    for (const [id, b64] of Object.entries(bundle.glbAssets)) {
      entries.push({ name: `assets/${id}.glb`, data: Buffer.from(b64, "base64") });
    }
    return {
      mime: "application/zip",
      filename: `friends-studio-bundle-${new Date().toISOString().slice(0, 10)}.zip`,
      buffer: buildZip(entries),
    };
  }
  return {
    mime: "application/json; charset=utf-8",
    filename: `friends-studio-bundle-${new Date().toISOString().slice(0, 10)}.json`,
    buffer: Buffer.from(JSON.stringify(bundle, null, 2), "utf8"),
  };
}

function importStudioBundle(inputBufferOrObj) {
  let bundle = null;
  const glbMap = new Map();

  if (Buffer.isBuffer(inputBufferOrObj)) {
    if (inputBufferOrObj.length >= 4 && inputBufferOrObj.readUInt32LE(0) === 0x04034b50) {
      const files = parseZip(inputBufferOrObj);
      const rawJson = files.get("studio-bundle.json");
      if (!rawJson) throw new Error("ZIP bundle is missing studio-bundle.json.");
      bundle = JSON.parse(rawJson.toString("utf8"));
      for (const [name, data] of files.entries()) {
        const m = name.match(/^assets\/([a-z0-9_-]{1,64})\.glb$/i);
        if (m) glbMap.set(m[1], data);
      }
    } else {
      bundle = JSON.parse(inputBufferOrObj.toString("utf8"));
    }
  } else if (inputBufferOrObj && typeof inputBufferOrObj === "object") {
    bundle = inputBufferOrObj;
  }

  if (!bundle || bundle.format !== "friends-studio-bundle") {
    throw new Error("Invalid file: expected a Friends Studio Bundle.");
  }

  // Backup current settings + studio state before applying
  try {
    const bak = exportStudioBundle({ includeGlbs: false });
    writeAtomic(path.join(dataDir, `studio-pre-import-${Date.now()}.json`), JSON.stringify(bak, null, 2), 0o600);
  } catch (err) {
    logger.warn("Pre-import backup skipped:", err.message);
  }

  if (bundle.glbAssets && typeof bundle.glbAssets === "object" && !Array.isArray(bundle.glbAssets)) {
    for (const [id, b64] of Object.entries(bundle.glbAssets)) {
      if (typeof b64 === "string" && SAFE_ASSET_ID.test(id)) {
        glbMap.set(id, Buffer.from(b64, "base64"));
      }
    }
  }

  for (const [id, glbBuf] of glbMap.entries()) {
    saveAssetGlb(id, glbBuf);
  }

  if (bundle.studioState && typeof bundle.studioState === "object") {
    saveStudioState(migrateState(bundle.studioState));
  }

  if (bundle.settings && typeof bundle.settings === "object") {
    const allowedPatch = {};
    for (const k of ["robot", "aiVoice", "visualStyle", "voiceDock", "behaviorEngine", "roomEditor", "stageMode", "personality", "roles"]) {
      if (bundle.settings[k] !== undefined) allowedPatch[k] = bundle.settings[k];
    }
    settings.patch(allowedPatch);
  }

  return {
    ok: true,
    importedGlbs: [...glbMap.keys()],
    schemaVersion: Number(bundle.schemaVersion || 1),
  };
}

module.exports = {
  SCHEMA_VERSION,
  ubuntuStudioDir,
  activeStorageDir,
  loadStudioState,
  saveStudioState,
  migrateState,
  writeSecureSecrets,
  saveAssetGlb,
  getAssetGlb,
  deleteAssetGlb,
  buildZip,
  parseZip,
  exportStudioBundle,
  exportBundleBuffer,
  importStudioBundle,
};
