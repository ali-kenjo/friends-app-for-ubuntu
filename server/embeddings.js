// Searching your notes by meaning. The "embeddings" specialist (a small local model, see specialists.js) turns text
// into numbers; notes with similar meaning have similar numbers. The numbers are kept in <data folder>/embeddings/vault.json
// (rebuilt for a note when it changes) and never leave this computer. Without an embeddings model nothing here runs and
// the notes search by words, as before.
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { dataDir, writeJson } = require("./config");
const settingsModule = require("./settings");
const specialists = require("./specialists");
const models = require("./models");
const localNotes = require("./local-notes");

const file = () => path.join(dataDir, "embeddings", "vault.json");
let index = null; // { model, notes: { path → { mtime, vector, title } } }
const MAX_PER_PASS = 60;

function brain(settings = settingsModule.get()) {
  const role = specialists.get("embeddings", settings);
  if (!role || role.enabled === false) return null;
  return specialists.brainFor("embeddings", settings);
}

const ready = (settings) => Boolean(brain(settings));

function load() {
  if (index) return index;
  try {
    index = JSON.parse(fs.readFileSync(file(), "utf8"));
  } catch {
    index = { model: "", notes: {} };
  }
  return index;
}

// Text → vectors (one per text). The model comes from the embeddings role.
async function embed(texts, settings = settingsModule.get()) {
  const b = brain(settings);
  if (!b) throw new Error("No embeddings model is set up (Settings → AI → Specialists).");
  const inputs = texts.map((t) => String(t).slice(0, 6000));
  return models.use(b, { role: "embeddings", why: "Embeddings model loaded to search your notes by meaning" }, async (loaded) => {
    const res = await fetch(`${loaded.baseUrl.replace(/\/+$/, "")}/api/embed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: loaded.model, input: inputs }), signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`The embeddings model answered ${res.status}. Is "${loaded.model}" installed? (ollama pull ${loaded.model})`);
    const data = await res.json();
    return data.embeddings || [];
  });
}

const cosine = (a, b) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

// Brings the numbers up to date for notes that are new or changed (a few at a time)
async function refresh(settings = settingsModule.get()) {
  const idx = load();
  const model = brain(settings)?.model || "";
  if (idx.model !== model) {
    idx.model = model; // another model makes other numbers: start again
    idx.notes = {};
  }
  const notes = await localNotes.listNotes({ localNotes: settings.localNotes, limit: 2000 });
  const stale = notes.filter((n) => !idx.notes[n.path] || idx.notes[n.path].mtime !== n.updatedAt).slice(0, MAX_PER_PASS);
  const gone = Object.keys(idx.notes).filter((p) => !notes.some((n) => n.path === p));
  for (const p of gone) delete idx.notes[p];
  for (let i = 0; i < stale.length; i += 8) {
    const batch = stale.slice(i, i + 8);
    const texts = await Promise.all(batch.map(async (n) => `${n.title}\n${(await fsp.readFile(path.join(localNotes.getVaultDir({ localNotes: settings.localNotes }), n.path), "utf8").catch(() => "")).slice(0, 4000)}`));
    const vectors = await embed(texts, settings);
    batch.forEach((n, j) => vectors[j] && (idx.notes[n.path] = { mtime: n.updatedAt, vector: vectors[j], title: n.title }));
  }
  fs.mkdirSync(path.dirname(file()), { recursive: true, mode: 0o700 });
  writeJson(file(), idx);
  return { indexed: Object.keys(idx.notes).length, total: notes.length, pending: Math.max(0, notes.filter((n) => !idx.notes[n.path]).length) };
}

// The notes closest in meaning to a question: [{ path, title, score }]
async function search(query, { limit = 6, settings = settingsModule.get() } = {}) {
  const status = await refresh(settings);
  const [q] = await embed([query], settings);
  if (!q) return { notes: [], ...status };
  const idx = load();
  const ranked = Object.entries(idx.notes)
    .map(([p, n]) => ({ path: p, title: n.title, score: +cosine(q, n.vector).toFixed(3) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return { notes: ranked, ...status };
}

const reload = () => (index = null);

module.exports = { ready, embed, refresh, search, cosine, reload };
