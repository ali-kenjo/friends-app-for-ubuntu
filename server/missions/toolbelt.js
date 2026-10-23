// The tools of one mission, with the guardrails around them. Everything a model does during a mission goes
// through execute(): it says what the call is (risk.js), checks that the approved plan covers it (or pauses the
// mission and asks you), keeps files inside the allowed folders and the mission's own folder, sends deletions to
// the trash, runs commands in the mission's folder with a time limit and a scrubbed environment, and writes every
// call to the mission's audit log.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const tools = require("../tools");
const files = require("../files");
const risk = require("./risk");
const store = require("./store");
const system = require("./system");
const logger = require("../logger");

const str = (description) => ({ type: "STRING", description });
const num = (description) => ({ type: "NUMBER", description });
const fn = (name, description, properties, required = Object.keys(properties)) => ({ name, description, parameters: { type: "OBJECT", properties, required } });

const FILE_TOOLS = new Set(["list_folder", "read_file", "read_file_lines", "search_files", "create_file", "edit_file", "edit_file_part", "create_folder", "move_item", "delete_item"]);
const OWN = {
  run_command: fn(
    "run_command",
    "Run a shell command in the mission's folder (it is the current folder of every command). Use it to run code and tests, use git, and use tools you need. Commands have a time limit and must be ones the plan lists; installing, sudo and anything outside the project always ask the user. The result has the exit code and the output.",
    { command: str("The command, as you would type it in a terminal"), timeout_seconds: num("Optional time limit in seconds (the plan's limit applies)") },
    ["command"]
  ),
  system_status: fn("system_status", "How this computer is doing: processor, memory, disks, the graphics card's temperature, failing services.", { parts: str("Optional, comma-separated: cpu, memory, disks, gpu, services (default: all)") }, []),
  notify_user: fn("notify_user", "Tell the user something now: a notification on this computer (and on Telegram when it's connected). For alerts and milestones; use it sparingly.", { message: str("What to say, one or two sentences"), title: str("Optional short title") }, ["message"]),
  send_telegram: fn("send_telegram", "Send the user a message on Telegram.", { text: str("The message") }, ["text"]),
  semantic_search_notes: fn("semantic_search_notes", "Search the user's notes vault by meaning (not only by the words), with a local embeddings model. Gives the notes closest to the question.", { query: str("What to look for, in a sentence"), limit: num("How many notes (default 6)") }, ["query"]),
};

const cap = (text, head = 3000, tail = 18000) => {
  const s = String(text || "");
  return s.length <= head + tail ? s : `${s.slice(0, head)}\n… (${s.length - head - tail} characters left out) …\n${s.slice(-tail)}`;
};

// The tools a mission may use, as declarations the models understand. google: signed in; telegram: set up.
function declarations(settings, { google = false, telegram = false, mission = null } = {}) {
  const open = {
    ...settings,
    privacy: { ...settings.privacy, localOnly: settings.privacy?.localOnly === true || mission?.private === true },
    permissions: { ...settings.permissions, folders: ["/"], files: { create: true, read: true, edit: true, delete: true }, dirs: { create: true, read: true, edit: true, delete: true } },
    life: { ...settings.life, enabled: true },
    localNotes: { ...settings.localNotes, enabled: true },
    aiNotes: { ...settings.aiNotes, enabled: true },
    companion: { ...settings.companion, recall: true, followUps: false },
  };
  const list = tools.declarations(open, { voice: false, robot: false, workspace: google, onAir: false, live: false }).filter((d) => d.name !== "start_mission");
  const names = new Set(list.map((d) => d.name));
  const extra = [OWN.run_command, OWN.system_status, OWN.notify_user];
  if (telegram) extra.push(OWN.send_telegram);
  if (require("../embeddings").ready(settings)) extra.push(OWN.semantic_search_notes);
  return [...list, ...extra.filter((d) => !names.has(d.name))];
}

// Describes every tool with its risk, for the planner
function catalog(settings, options) {
  return declarations(settings, options).map((d) => ({ name: d.name, description: d.description, risk: risk.TOOLS[d.name]?.risk || "external" }));
}

// ---------- One mission's toolbelt ----------
// opts: { mission, settings, google (token or null), telegramSend(text), notify({title, body}), requestApproval({ action, why }) → Promise<boolean>,
//         checkLimits(), signal, step() → the running step (for the log) }
function create(opts) {
  const { mission, settings, signal } = opts;
  const workdir = mission.workdir;
  const folders = settings.permissions?.folders || [];
  const timeoutDefault = (settings.missions?.commandTimeoutSeconds || 120) * 1000;
  let lastNotify = 0;

  // The settings the file tools see: the mission's own folder is fully its own; elsewhere your permission grid decides
  const toolSettings = (where) => ({
    ...settings,
    privacy: { ...settings.privacy, localOnly: settings.privacy?.localOnly === true || mission.private === true },
    aiControl: { ...settings.aiControl, confirmTools: false },
    permissions:
      where === "work"
        ? { folders: [workdir], files: { create: true, read: true, edit: true, delete: true }, dirs: { create: true, read: true, edit: true, delete: true }, askBeforeActing: false, useTrash: true }
        : { ...settings.permissions, askBeforeActing: false, useTrash: true },
  });

  async function resolveFile(p) {
    const raw = String(p ?? "").trim();
    const expanded = risk.expand(raw);
    const abs = raw === "" || raw === "." ? workdir : path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(workdir, expanded);
    try {
      const { real } = await files.resolve(abs, [workdir]);
      return { real, abs, where: "work", shown: files.shown(real) };
    } catch {}
    try {
      const { real } = await files.resolve(abs, folders);
      return { real, abs, where: "folder", shown: files.shown(real) };
    } catch {}
    return { real: abs, abs, where: null, shown: files.shown(abs) };
  }

  const classifyCtx = { workdir, folders, resolveFile, googleCalendar: Boolean(opts.google) };
  const effects = []; // external and destructive things done in the running step (for a restart: don't repeat them)

  async function runCommand(args) {
    const command = String(args.command || "").trim();
    const remaining = opts.remainingMs?.() ?? Infinity;
    const wanted = Number(args.timeout_seconds) > 0 ? Number(args.timeout_seconds) * 1000 : timeoutDefault;
    const timeout = Math.max(2000, Math.min(wanted, timeoutDefault * 5, remaining));
    const gitName = process.env.FRIENDS_GIT_NAME || opts.gitIdentity?.name || "Friends";
    const gitEmail = process.env.FRIENDS_GIT_EMAIL || opts.gitIdentity?.email || "friends@localhost";
    const env = {
      PATH: process.env.PATH,
      HOME: workdir, // no access to your dotfiles, keys or caches
      LANG: "C.UTF-8",
      TERM: "dumb",
      CI: "1",
      NO_COLOR: "1",
      TMPDIR: os.tmpdir(),
      npm_config_cache: path.join(workdir, ".npm-cache"),
      XDG_CACHE_HOME: path.join(workdir, ".cache"),
      GIT_AUTHOR_NAME: gitName,
      GIT_COMMITTER_NAME: gitName,
      GIT_AUTHOR_EMAIL: gitEmail,
      GIT_COMMITTER_EMAIL: gitEmail,
      GIT_TERMINAL_PROMPT: "0",
    };
    const started = Date.now();
    return new Promise((resolve) => {
      const child = spawn("bash", ["-c", command], { cwd: workdir, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let killed = "";
      const add = (chunk) => {
        out += chunk;
        if (out.length > 200000) out = out.slice(0, 20000) + out.slice(-120000);
      };
      child.stdout.on("data", (c) => add(c.toString()));
      child.stderr.on("data", (c) => add(c.toString()));
      const kill = (why) => {
        if (killed) return;
        killed = why;
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {}
        setTimeout(() => {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {}
        }, 3000).unref();
      };
      const timer = setTimeout(() => kill("timeout"), timeout);
      const onAbort = () => kill("stopped");
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ error: `Couldn't run it: ${err.message}` });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        const result = { ok: code === 0 && !killed, exitCode: code, output: cap(out), seconds: +((Date.now() - started) / 1000).toFixed(1) };
        if (killed === "timeout") result.error = `The command ran longer than ${Math.round(timeout / 1000)} seconds and was stopped.`;
        if (killed === "stopped") result.error = "The mission was stopped.";
        resolve(result);
      });
    });
  }

  // The file tools: paths are made absolute (a relative one is in the mission's folder), then the usual tool runs
  async function runFileTool(name, args, ctx) {
    const mapped = { ...args };
    const where = [];
    for (const key of ["path", "new_path"]) {
      if (args[key] === undefined && !(key === "path" && ["list_folder", "search_files"].includes(name))) continue;
      const r = await resolveFile(args[key]);
      mapped[key] = r.abs;
      where.push(r.where);
    }
    if (where.includes(null)) return { error: `${args.path ?? args.new_path} is outside the folders ${folders.length ? "you allowed" : "(none are allowed yet)"} and this mission's own folder. Settings → AI & privacy → Permissions and file access lets you allow more.` };
    return tools.run(name, mapped, { ...ctx, settings: toolSettings(where.every((w) => w === "work") ? "work" : "grid") });
  }

  // The one place a model's tool call goes through. step: the running step { id, title, effects }
  async function execute(name, args, step) {
    if (signal?.aborted) throw Object.assign(new Error("Stopped."), { name: "AbortError" });
    opts.checkLimits?.();
    args = args && typeof args === "object" ? args : {};
    const log = (extra) => store.audit(mission.id, { type: "tool", step: step?.id, tool: name, args: store.short(args, 500), ...extra });

    if (step?.allowed && !step.allowed.has(name)) {
      log({ ok: false, denied: "not in this step's tools" });
      return { error: `${name} isn't one of the tools of this step. Use only: ${[...step.allowed].join(", ") || "none (just answer)"}.` };
    }
    const action = await risk.classify(name, args, classifyCtx);
    // A file outside what's allowed: tell the model, don't ask the user for something that can't be allowed here
    if (action.paths?.some((p) => p.where === null)) {
      const bad = action.paths.find((p) => p.where === null);
      log({ ok: false, risk: action.risk, denied: "outside the allowed folders" });
      return { error: `${bad.shown} is outside the folders you allowed and this mission's own folder.` };
    }

    const verdict = risk.covered(action, mission.scope, { workdir, folders });
    // An action you allowed earlier in this mission, exactly as it is, isn't asked again (the commands that always ask included)
    const granted = mission.scope.some((d) => d.grantedAt && d.type === action.type && d.summary === action.summary);
    if (!verdict.ok && !granted) {
      const asking = opts.requestApproval({ action, why: verdict.why, step });
      // While you decide, other missions can use the model
      const allowed = await (step?.pause ? step.pause(asking) : asking);
      const declined = "The user declined this action. Carry on without it, or change the approach.";
      log({ risk: action.risk, approval: allowed ? "allowed" : "declined", why: verdict.why, ...(allowed ? {} : { ok: false, result: declined }) });
      if (!allowed) return { error: declined };
      // What you allowed becomes part of what this mission may do
      mission.scope.push({ type: action.type, risk: action.risk, ...scopeFields(action), summary: action.summary, grantedAt: Date.now() });
      store.save(mission);
    }

    if (mission.dryRun && (action.risk === "external" || action.risk === "destructive" || action.risk === "system" || action.risk === "write")) {
      const simulated = { ok: true, dryRun: true, simulated: true, output: `[Dry Run] Would perform: ${action.summary}` };
      log({ ok: true, risk: action.risk, action: action.type, dryRun: true, result: store.short(simulated, 600) });
      return simulated;
    }

    const ctx = {
      settings: toolSettings("grid"),
      googleAccessToken: opts.google || null,
      confirm: async () => true, // the plan (or your answer just now) is the confirmation
      onActivity: (line) => step?.activity?.(line),
      onDraft: () => {},
      onRobot: () => {},
      signal,
    };
    let result;
    try {
      if (name === "run_command") result = await runCommand(args);
      else if (name === "system_status") result = { ok: true, ...(await system.snapshot(args.parts ? String(args.parts).split(/[\s,]+/).filter(Boolean) : null)) };
      else if (name === "semantic_search_notes") result = { ok: true, ...(await require("../embeddings").search(String(args.query || ""), { limit: Math.min(15, Number(args.limit) || 6), settings })) };
      else if (name === "notify_user") {
        if (Date.now() - lastNotify < 20000) result = { ok: true, note: "Skipped: it already notified a moment ago." };
        else {
          lastNotify = Date.now();
          opts.notify?.({ title: String(args.title || "Friends").slice(0, 80), body: String(args.message || "").slice(0, 400) });
          result = { ok: true };
        }
      } else if (name === "send_telegram") {
        if (!opts.telegramSend) result = { error: "Telegram isn't set up." };
        else {
          await opts.telegramSend(String(args.text || "").slice(0, 3500));
          result = { ok: true };
        }
      } else if (FILE_TOOLS.has(name)) result = await runFileTool(name, args, ctx);
      else result = await tools.run(name, args, ctx);
    } catch (err) {
      if (err.name === "AbortError") throw err;
      result = { error: err.message };
    }
    const ok = !result?.error;
    if (ok && (action.risk === "external" || action.risk === "destructive") && step) {
      step.effects ||= [];
      step.effects.push({ tool: name, summary: action.summary, at: Date.now() });
      store.save(mission);
    }
    log({ ok, risk: action.risk, action: action.type, result: store.short(result, 600) });
    return result;
  }

  return { execute, declarations: () => declarations(settings, { google: Boolean(opts.google), telegram: Boolean(opts.telegramSend), mission }), resolveFile, runCommand, effects };
}

// What of an action is kept when it's allowed while a mission runs
function scopeFields(a) {
  const out = {};
  for (const key of ["to", "subject", "command", "what", "kind", "tool", "title", "installs"]) if (a[key] !== undefined) out[key] = a[key];
  if (a.paths) out.path = a.paths.map((p) => p.real)[0];
  if (a.type === "install") out.what = (a.installs || []).join(" ") || a.command;
  return out;
}

module.exports = { create, declarations, catalog, OWN, FILE_TOOLS, cap };
