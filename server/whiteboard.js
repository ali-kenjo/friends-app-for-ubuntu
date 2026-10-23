// Whiteboard Storage & Management Engine
// Stores vector whiteboard documents as versioned JSON in <data folder>/whiteboards/
const fs = require("fs");
const path = require("path");
const { dataDir } = require("./config");
const { createDocument, documentToText } = require("./whiteboard-model");

const MAX_STORAGE_BYTES = 50 * 1024 * 1024; // 50 MB safety limit
const MAX_HISTORY_PER_BOARD = 10;

function getStorageDir() {
  const dir = path.join(dataDir, "whiteboards");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

function getIndexPath() {
  return path.join(getStorageDir(), "index.json");
}

function getBoardPath(id) {
  const safeId = path.basename(String(id || "")).replace(/[^\w-]/g, "");
  if (!safeId) throw new Error("Invalid whiteboard ID");
  return path.join(getStorageDir(), `${safeId}.json`);
}

function getHistoryDir(id) {
  const safeId = path.basename(String(id || "")).replace(/[^\w-]/g, "");
  const dir = path.join(getStorageDir(), `${safeId}.history`);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

function readIndex() {
  try {
    const p = getIndexPath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      if (Array.isArray(data)) return data;
    }
  } catch {}
  return rebuildIndex();
}

function writeIndex(index) {
  try {
    const p = getIndexPath();
    fs.writeFileSync(p, JSON.stringify(index, null, 2), { mode: 0o600 });
  } catch (err) {
    console.error("Failed to write whiteboard index:", err.message);
  }
}

function rebuildIndex() {
  const dir = getStorageDir();
  const entries = [];
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f.endsWith(".json") && f !== "index.json") {
        try {
          const doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
          if (doc && doc.id) {
            entries.push({
              id: doc.id,
              title: doc.title || "Untitled Board",
              scope: doc.scope || "general",
              scopeId: doc.scopeId || "",
              pageCount: doc.pages?.length || 1,
              itemCount: doc.pages?.reduce((acc, p) => acc + (p.items?.length || 0), 0) || 0,
              updatedAt: doc.updatedAt || doc.createdAt || Date.now(),
              createdAt: doc.createdAt || Date.now(),
              author: doc.author || "user",
            });
          }
        } catch {}
      }
    }
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    writeIndex(entries);
  } catch {}
  return entries;
}

function list({ scope = "", scopeId = "", search = "" } = {}) {
  let index = readIndex();
  if (scope) {
    index = index.filter((b) => b.scope === scope && (!scopeId || b.scopeId === scopeId));
  }
  if (search) {
    const q = search.toLowerCase();
    index = index.filter((b) => b.title?.toLowerCase().includes(q));
  }
  return index;
}

function get(id) {
  const p = getBoardPath(id);
  if (!fs.existsSync(p)) return null;
  try {
    const doc = JSON.parse(fs.readFileSync(p, "utf8"));
    return doc;
  } catch (err) {
    throw new Error(`Corrupted whiteboard file: ${err.message}`);
  }
}

function getActive(scope = "general", scopeId = "") {
  const existing = list({ scope, scopeId });
  if (existing.length > 0) {
    const top = get(existing[0].id);
    if (top) return top;
  }
  // Create a default board for this scope
  const doc = createDocument({
    title: scope === "general" ? "Main Whiteboard" : `Whiteboard (${scope})`,
    scope,
    scopeId,
  });
  save(doc.id, doc);
  return doc;
}

let snapshotSeq = 0;

function saveSnapshot(id, doc) {
  try {
    const dir = getHistoryDir(id);
    const ts = `${Date.now()}_${(++snapshotSeq % 1000).toString().padStart(3, "0")}`;
    const snapFile = path.join(dir, `${ts}.json`);
    fs.writeFileSync(snapFile, JSON.stringify(doc), { mode: 0o600 });

    // Prune old snapshots
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    while (files.length > MAX_HISTORY_PER_BOARD) {
      const oldest = files.shift();
      fs.rmSync(path.join(dir, oldest), { force: true });
    }
  } catch {}
}

function save(id, doc) {
  if (!doc || typeof doc !== "object") throw new Error("Invalid document data");
  const p = getBoardPath(id);

  // If already exists, save snapshot before overwriting
  if (fs.existsSync(p)) {
    try {
      const prev = JSON.parse(fs.readFileSync(p, "utf8"));
      saveSnapshot(id, prev);
    } catch {}
  }

  const cleanDoc = {
    ...doc,
    id: String(id),
    title: String(doc.title || "Untitled Board").trim().slice(0, 120),
    updatedAt: Date.now(),
    pages: Array.isArray(doc.pages) && doc.pages.length > 0 ? doc.pages : createDocument().pages,
  };

  const payload = JSON.stringify(cleanDoc, null, 2);
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, payload, { mode: 0o600 });
  fs.renameSync(tmp, p);

  // Update index
  const index = readIndex();
  const idx = index.findIndex((b) => b.id === id);
  const meta = {
    id: cleanDoc.id,
    title: cleanDoc.title,
    scope: cleanDoc.scope || "general",
    scopeId: cleanDoc.scopeId || "",
    pageCount: cleanDoc.pages.length,
    itemCount: cleanDoc.pages.reduce((acc, pg) => acc + (pg.items?.length || 0), 0),
    updatedAt: cleanDoc.updatedAt,
    createdAt: cleanDoc.createdAt || cleanDoc.updatedAt,
    author: cleanDoc.author || "user",
  };

  if (idx !== -1) index[idx] = meta;
  else index.unshift(meta);
  index.sort((a, b) => b.updatedAt - a.updatedAt);
  writeIndex(index);

  enforceLimits();
  return cleanDoc;
}

function create(data = {}) {
  const doc = createDocument(data);
  return save(doc.id, doc);
}

function patch(id, partial = {}) {
  const doc = get(id);
  if (!doc) throw new Error("Whiteboard not found");
  const updated = {
    ...doc,
    ...partial,
    id: doc.id,
    settings: { ...doc.settings, ...(partial.settings || {}) },
  };
  return save(id, updated);
}

function remove(id) {
  const p = getBoardPath(id);
  let removed = false;
  if (fs.existsSync(p)) {
    fs.rmSync(p, { force: true });
    removed = true;
  }
  const hist = getHistoryDir(id);
  if (fs.existsSync(hist)) {
    fs.rmSync(hist, { recursive: true, force: true });
  }

  const index = readIndex().filter((b) => b.id !== id);
  writeIndex(index);
  return removed;
}

function duplicate(id) {
  const orig = get(id);
  if (!orig) throw new Error("Whiteboard not found");
  const copy = createDocument({
    ...orig,
    id: undefined,
    title: `${orig.title} (Copy)`.slice(0, 120),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return save(copy.id, copy);
}

function getHistory(id) {
  const dir = getHistoryDir(id);
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const key = f.replace(".json", "");
        const ts = Number(key.split("_")[0]);
        return {
          versionId: key,
          timestamp: isNaN(ts) ? Date.now() : ts,
          filename: f,
        };
      })
      .sort((a, b) => b.versionId.localeCompare(a.versionId));
  } catch {
    return [];
  }
}

function restoreVersion(id, versionOrTimestamp) {
  const dir = getHistoryDir(id);
  const target = String(versionOrTimestamp || "").replace(".json", "");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const match = files.find((f) => f.replace(".json", "") === target || f.startsWith(target + "_") || f === `${target}.json`);
  if (!match) throw new Error("Snapshot not found");
  const snapPath = path.join(dir, match);
  const doc = JSON.parse(fs.readFileSync(snapPath, "utf8"));
  return save(id, doc);
}

function exportData(id, { format = "json" } = {}) {
  const doc = get(id);
  if (!doc) throw new Error("Whiteboard not found");

  if (format === "text") {
    return { format: "text", text: documentToText(doc), title: doc.title };
  }

  return { format: "json", data: doc, title: doc.title };
}

function exportBoard(id, format = "markdown") {
  const doc = get(id);
  if (!doc) throw new Error("Whiteboard not found");
  if (format === "markdown" || format === "text") {
    return documentToText(doc);
  }
  return JSON.stringify(doc, null, 2);
}

function enforceLimits() {
  try {
    const dir = getStorageDir();
    let totalSize = 0;
    const files = fs.readdirSync(dir).map((f) => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      totalSize += stat.size;
      return { name: f, path: full, size: stat.size, mtime: stat.mtimeMs, isDir: stat.isDirectory() };
    });

    if (totalSize > MAX_STORAGE_BYTES) {
      // Remove oldest history folders first
      const histories = files.filter((f) => f.isDir && f.name.endsWith(".history")).sort((a, b) => a.mtime - b.mtime);
      for (const h of histories) {
        fs.rmSync(h.path, { recursive: true, force: true });
        totalSize -= h.size;
        if (totalSize <= MAX_STORAGE_BYTES) break;
      }
    }
  } catch {}
}

module.exports = {
  getStorageDir,
  list,
  get,
  getActive,
  create,
  save,
  patch,
  remove,
  duplicate,
  getHistory,
  restoreVersion,
  exportData,
  exportBoard,
  enforceLimits,
};
