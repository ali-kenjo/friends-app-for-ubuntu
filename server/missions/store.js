// Missions on disk: <data folder>/missions/<id>/mission.json (the state), audit.jsonl (every tool call and
// model call), and report.md. A mission's own folder to work in is made by the runner (see workdirFor).
// Everything is written as it changes, so a crash or a restart loses at most the step that was running.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { dataDir, writeJson } = require("../config");

const root = () => path.join(dataDir, "missions");
const dirOf = (id) => path.join(root(), String(id).replace(/[^\w-]/g, ""));
const fileOf = (id) => path.join(dirOf(id), "mission.json");
const auditFile = (id) => path.join(dirOf(id), "audit.jsonl");

const cache = new Map(); // id → mission (the live objects)
let loaded = false;

const now = () => Date.now();
const newId = () => `m-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex")}`;

function loadAll() {
  if (loaded) return;
  loaded = true;
  let names = [];
  try {
    names = fs.readdirSync(root());
  } catch {
    return;
  }
  for (const name of names) {
    try {
      const m = JSON.parse(fs.readFileSync(fileOf(name), "utf8"));
      if (m?.id) cache.set(m.id, m);
    } catch {}
  }
}

// A new mission, saved. fields: { goal, source, private }
function create(fields) {
  loadAll();
  const t = now();
  const mission = {
    id: newId(),
    createdAt: t,
    updatedAt: t,
    goal: String(fields.goal || "").trim().slice(0, 6000),
    title: "",
    source: fields.source || "app", // app | telegram | chat | schedule
    private: fields.private === true,
    status: "planning", // clarifying | planning | awaiting_approval | running | paused | done | failed | stopped
    pause: null, // { kind, message, request? } while paused
    clarify: { round: 0, questions: [], answers: [] },
    plan: null,
    scope: [], // the actions you approved (a copy of the plan's at approval time) plus ones you allowed while it ran
    approvedAt: null,
    limits: null,
    usage: { cloudCalls: 0, localCalls: 0, steps: 0, runMs: 0, tokens: 0 },
    model: null, // { role, model, kind, why, at }: what's loaded now
    report: null, // { title, note, summary, sources, files }
    workdir: "",
    automationId: fields.automationId || null,
    automation: fields.automation || null, // what to repeat when the plan is approved: { name, schedule | trigger }
    character: fields.character || null,
    dryRun: fields.dryRun === true,
    managerChoice: fields.managerChoice || "auto",
    modelOverrides: fields.modelOverrides || {},
    leastPrivilege: fields.leastPrivilege || null,
    approvalPolicy: fields.approvalPolicy || null,
    notificationRouting: fields.notificationRouting || null,
    reportFormat: fields.reportFormat || "vault",
    archived: false,
    timeline: [], // short lines for the page: { at, type, text, step? }
    error: "",
  };
  cache.set(mission.id, mission);
  fs.mkdirSync(dirOf(mission.id), { recursive: true, mode: 0o700 });
  save(mission);
  return mission;
}

function save(mission) {
  mission.updatedAt = now();
  writeJson(fileOf(mission.id), mission);
  return mission;
}

function get(id) {
  loadAll();
  const m = cache.get(String(id));
  if (!m) throw new Error("That mission doesn't exist (anymore).");
  return m;
}

const find = (id) => {
  loadAll();
  return cache.get(String(id)) || null;
};

function all() {
  loadAll();
  return [...cache.values()].sort((a, b) => b.createdAt - a.createdAt);
}

function remove(id) {
  loadAll();
  const m = cache.get(String(id));
  if (!m) return false;
  cache.delete(m.id);
  fs.rmSync(dirOf(m.id), { recursive: true, force: true });
  return true;
}

// Re-read from disk (after a restored backup)
function reload() {
  cache.clear();
  loaded = false;
}

// A short line for the page's timeline (kept to the last 150)
function note(mission, type, text, extra = {}) {
  mission.timeline.push({ at: now(), type, text: String(text).slice(0, 300), ...extra });
  if (mission.timeline.length > 150) mission.timeline.splice(0, mission.timeline.length - 150);
}

// ---------- The audit log ----------
const MAX_AUDIT_BYTES = 8 * 1024 * 1024;
const GENESIS_HASH = "0".repeat(64);

const short = (value, max = 700) => {
  let text;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  text = String(text ?? "");
  return text.length > max ? `${text.slice(0, max)}… (${text.length} characters)` : text;
};

function hashEntry(seq, prevHash, at, entry) {
  const canonical = JSON.stringify(entry, Object.keys(entry).sort());
  return crypto.createHash("sha256").update(`${seq}:${prevHash}:${at}:${canonical}`).digest("hex");
}

function getLastEntry(missionId) {
  try {
    const file = auditFile(missionId);
    if (!fs.existsSync(file)) return null;
    const content = fs.readFileSync(file, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    if (!lines.length) return null;
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

function audit(missionId, entry) {
  try {
    const file = auditFile(missionId);
    let size = 0;
    try {
      size = fs.statSync(file).size;
    } catch {}
    if (size > MAX_AUDIT_BYTES) return; // a runaway mission can't fill the disk with its own log

    const last = getLastEntry(missionId);
    const seq = last?.seq ? last.seq + 1 : 1;
    const prevHash = last?.entryHash || GENESIS_HASH;
    const t = now();
    const entryHash = hashEntry(seq, prevHash, t, entry);
    const record = { seq, at: t, prevHash, entryHash, ...entry };
    const line = JSON.stringify(record);

    fs.appendFileSync(file, line + "\n", { mode: 0o600 });
  } catch {}
}

function readAudit(missionId, { limit = 500 } = {}) {
  try {
    const lines = fs.readFileSync(auditFile(missionId), "utf8").split("\n").filter(Boolean);
    return lines.slice(-limit).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return { at: 0, type: "broken", text: l.slice(0, 100) };
      }
    });
  } catch {
    return [];
  }
}

function verifyAudit(missionId) {
  try {
    const file = auditFile(missionId);
    if (!fs.existsSync(file)) return { valid: true, count: 0 };
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n").filter(Boolean);
    if (!lines.length) return { valid: true, count: 0 };

    let expectedSeq = 1;
    let expectedPrevHash = GENESIS_HASH;
    let firstAt = null;
    let lastAt = null;

    for (let i = 0; i < lines.length; i++) {
      let rec;
      try {
        rec = JSON.parse(lines[i]);
      } catch {
        return { valid: false, count: lines.length, brokenAt: i + 1, reason: `Malformed JSON on line ${i + 1}` };
      }
      if (firstAt === null) firstAt = rec.at;
      lastAt = rec.at;

      const { seq, at, prevHash, entryHash, ...originalEntry } = rec;

      if (seq !== expectedSeq) {
        return { valid: false, count: lines.length, brokenAt: i + 1, reason: `Sequence gap or mismatch: expected ${expectedSeq}, got ${seq}` };
      }
      if (prevHash !== expectedPrevHash) {
        return { valid: false, count: lines.length, brokenAt: i + 1, reason: `Hash chain broken at line ${i + 1}: prevHash mismatch` };
      }
      const calculatedHash = hashEntry(seq, prevHash, at, originalEntry);
      if (calculatedHash !== entryHash) {
        return { valid: false, count: lines.length, brokenAt: i + 1, reason: `Hash verification failed at line ${i + 1}: entry was altered` };
      }
      expectedSeq++;
      expectedPrevHash = entryHash;
    }

    return { valid: true, count: lines.length, firstAt, lastAt };
  } catch (err) {
    return { valid: false, count: 0, reason: err.message };
  }
}

function exportAuditJson(missionId) {
  const records = readAudit(missionId, { limit: 10000 });
  const verification = verifyAudit(missionId);
  return JSON.stringify({ missionId, exportedAt: now(), verified: verification.valid, verification, count: records.length, records }, null, 2);
}

function exportAuditCsv(missionId) {
  const records = readAudit(missionId, { limit: 10000 });
  const escapeCsv = (str) => `"${String(str ?? "").replace(/"/g, '""')}"`;
  const header = ["seq", "at", "isoTime", "type", "step", "risk", "tool", "action", "ok", "summary", "result", "prevHash", "entryHash"];
  const rows = records.map((r) =>
    [
      r.seq || "",
      r.at || "",
      r.at ? new Date(r.at).toISOString() : "",
      escapeCsv(r.type),
      escapeCsv(r.step),
      escapeCsv(r.risk),
      escapeCsv(r.tool),
      escapeCsv(r.action),
      r.ok !== undefined ? r.ok : "",
      escapeCsv(r.summary || r.text || ""),
      escapeCsv(r.result || r.error || ""),
      escapeCsv(r.prevHash),
      escapeCsv(r.entryHash),
    ].join(",")
  );
  return [header.join(","), ...rows].join("\n");
}

function readReport(missionId) {
  try {
    return fs.readFileSync(path.join(dirOf(missionId), "report.md"), "utf8");
  } catch {
    return "";
  }
}

function writeReport(missionId, markdown) {
  fs.mkdirSync(dirOf(missionId), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dirOf(missionId), "report.md"), markdown, { mode: 0o600 });
}

module.exports = {
  create,
  save,
  get,
  find,
  all,
  remove,
  reload,
  note,
  audit,
  readAudit,
  verifyAudit,
  exportAuditJson,
  exportAuditCsv,
  readReport,
  writeReport,
  short,
  dirOf,
  root,
  newId,
};
