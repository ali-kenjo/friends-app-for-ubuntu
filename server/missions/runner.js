// Carrying a mission out. The life of a mission:
//
//   planning → (clarifying: a few questions) → awaiting_approval → running → done
//                                                    │              │  ↑
//                                                    │              ↓  │ you answer / it comes back / you resume
//                                                    │            paused (approval, quota, limit, private, interrupted)
//                                                    └──────────── stopped | failed
//
// It runs inside the helper, so it carries on with the window closed (the tray keeps the helper alive). Its state
// is written to disk as it changes: after a restart or a crash it picks up at the step that was running. The
// manager (manager.js) asks, plans, checks and reports; the specialists and the tools (toolbelt.js) do the work.
// Approval covers exactly the actions in the plan (risk.js): anything else external, destructive or system pauses
// the mission and asks, here and on Telegram. Stop is immediate.
const crypto = require("crypto");
const { EventEmitter } = require("events");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const settingsModule = require("../settings");
const router = require("../router");
const models = require("../models");
const specialists = require("../specialists");
const localNotes = require("../local-notes");
const logger = require("../logger");
const store = require("./store");
const planner = require("./plan");
const manager = require("./manager");
const cloud = require("./cloud");
const risk = require("./risk");
const toolbelt = require("./toolbelt");
const automations = require("./automations");

const MAX_ATTEMPTS = 3;
const MAX_CLARIFY_ROUNDS = 2;
const events = new EventEmitter();
events.setMaxListeners(50);
const live = new Map(); // id → { controller, approvals: Map(requestId → (allowed) => void), timer }
let hooks = { telegramSend: null, googleToken: async () => null, telegramReady: () => false };

const setHooks = (h) => (hooks = { ...hooks, ...h });
const onEvent = (fn) => (events.on("event", fn), () => events.off("event", fn));

const now = () => Date.now();
const clip = (text, n) => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// ---------- Telling the page ----------
function summary(m) {
  const steps = m.plan?.steps || [];
  const running = steps.find((s) => s.status === "running");
  const done = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  return {
    id: m.id,
    title: m.title || clip(m.goal, 80),
    goal: m.goal,
    status: m.status,
    pause: m.pause,
    private: m.private,
    source: m.source,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    progress: { done, total: steps.length, current: running ? { id: running.id, title: running.title, role: running.role } : null },
    model: m.model,
    usage: m.usage,
    limits: m.limits,
    report: m.report ? { title: m.report.title, note: m.report.note, summary: m.report.summary } : null,
    automationId: m.automationId,
  };
}

// notify: { title, body } makes it a milestone (the desktop and Telegram say it)
function emit(m, type, extra = {}) {
  events.emit("event", { type, mission: summary(m), ...extra });
}

// A step of the plan as the page shows it
const viewStep = (s) => ({ ...s, output: s.output ? s.output.slice(0, 4000) : s.output });

function view(m) {
  return {
    ...summary(m),
    clarify: m.clarify,
    plan: m.plan ? { ...m.plan, steps: m.plan.steps.map(viewStep) } : null,
    scope: m.scope,
    approvedAt: m.approvedAt,
    workdir: m.workdir,
    report: m.report,
    timeline: m.timeline.slice(-80),
    sources: m.sources || [],
    files: m.files || [],
    error: m.error,
  };
}

const save = (m) => store.save(m);
const line = (m, type, text, extra) => store.note(m, type, text, extra);

// ---------- What the models are told about this computer and you ----------
async function context(m) {
  const settings = settingsModule.get();
  const token = m.private ? null : await hooks.googleToken().catch(() => null);
  const telegram = hooks.telegramReady();
  const toolList = toolbelt.catalog(settings, { google: Boolean(token), telegram, mission: m });
  return { settings, token, telegram, tools: toolList, world: manager.world(settings, { tools: toolList, google: Boolean(token), telegram }) };
}

// A manager call's side notes (rate limit waits, which model) go to the log and the page
function callContext(m, signal) {
  return {
    mission: m,
    signal,
    onWait: ({ ms, reason }) => {
      line(m, "wait", `Waiting ${Math.round(ms / 1000)} s: ${reason}`);
      store.audit(m.id, { type: "wait", ms, reason });
      emit(m, "waiting", { waitMs: ms, reason });
    },
    onCall: (info) => store.audit(m.id, { type: "manager", ...info }),
    onCloudStart: () => preloadNext(m),
  };
}

// While the cloud manager is thinking, the next local specialist can already be loaded
function preloadNext(m) {
  try {
    if (!m.plan || !models.preload) return;
    // The step that will run next (the same choice the loop makes: the loaded model's steps first)
    const next = planner.pickNext(m.plan, models.status().loaded?.role || null);
    const brain = next && next.role !== "manager" && specialists.brainFor(next.role, settingsModule.get());
    if (brain) models.preload(brain, { role: next.role, why: `Getting the ${next.role} specialist ready for “${next.title}”` });
  } catch {}
}

// ---------- 1. Questions, then the plan ----------
async function prepare(m) {
  const entry = live.get(m.id) || startLive(m);
  const ctx = callContext(m, entry.controller.signal);
  try {
    m.status = "planning";
    m.pause = null;
    m.error = "";
    save(m);
    emit(m, "planning");
    const c = await context(m);
    if (m.clarify.round < MAX_CLARIFY_ROUNDS) {
      const questions = await manager.clarify(m, c.world, ctx);
      if (questions.length) {
        m.clarify.questions = questions;
        m.clarify.answers = [];
        m.clarify.round++;
        m.status = "clarifying";
        line(m, "questions", `${questions.length} question${questions.length === 1 ? "" : "s"} before planning`);
        save(m);
        emit(m, "questions", { notify: { title: "A few questions first", body: questions.map((q) => `• ${q.text}`).join("\n") }, questions });
        return;
      }
    }
    const raw = await manager.plan(m, c.world, ctx);
    const settings = c.settings;
    const roles = specialists.list(settings).filter((r) => r.enabled !== false && r.kind !== "embedding").map((r) => r.id).concat("manager");
    const p = planner.normalize(raw, { roles, tools: c.tools.map((t) => t.name), limits: settings.missions.limits, caps: settings.missions.caps });
    if (!p.steps.length) throw new Error("The manager didn't come up with any steps. Try describing the goal a little differently.");
    m.plan = p;
    m.plan.steps.forEach((s) => (s.status = "pending"));
    m.title = clip(raw.title, 90) || m.title || clip(m.goal, 80);
    m.limits = p.limits;
    m.status = "awaiting_approval";
    line(m, "plan", `The plan is ready: ${p.steps.length} steps`);
    store.audit(m.id, { type: "plan", steps: p.steps.length, risk: p.risk, actions: p.actions.length });
    save(m);
    emit(m, "plan-ready", { notify: { title: "A plan to approve", body: `${m.title}: ${p.steps.length} steps. Open it to approve.` } });
  } catch (err) {
    await settle(m, err, "planning");
  } finally {
    stopLive(m);
  }
}

// ---------- Errors become the right state ----------
async function settle(m, err, where) {
  if (err.name === "AbortError" || live.get(m.id)?.stopping) {
    m.status = "stopped";
    m.pause = null;
    line(m, "stopped", "Stopped");
    save(m);
    emit(m, "stopped");
    return;
  }
  if (err.name === "QuotaPause") {
    m.status = "paused";
    m.pause = { kind: "quota", message: err.message, until: err.until };
    line(m, "paused", err.message);
    save(m);
    scheduleResume(m, err.until);
    emit(m, "paused", { notify: { title: "Waiting for Gemini", body: err.message } });
    return;
  }
  if (err.name === "LimitReached") {
    m.status = "paused";
    m.pause = { kind: "limit", message: `${err.message} It stopped there. You can continue (the limit doubles) or stop for good.`, which: err.which };
    line(m, "paused", err.message);
    save(m);
    emit(m, "paused", { notify: { title: "Mission paused", body: m.pause.message } });
    return;
  }
  if (err instanceof router.RouteError || err.code === "NO_MANAGER") {
    // Private mode and a step that can't be done locally: wait, don't go to the cloud
    m.status = "paused";
    m.pause = { kind: "private", message: err.message };
    line(m, "paused", err.message);
    save(m);
    emit(m, "paused", { notify: { title: "Mission paused", body: err.message } });
    return;
  }
  logger.warn(`Mission ${m.id} (${where}) failed:`, err.message);
  m.status = "failed";
  m.error = err.message;
  m.pause = null;
  line(m, "failed", err.message);
  store.audit(m.id, { type: "failed", where, error: err.message });
  save(m);
  emit(m, "failed", { notify: { title: "A mission didn't work out", body: `${m.title}: ${clip(err.message, 200)}` } });
}

// ---------- 2. Your answers, edits and approval ----------
function answer(id, answers) {
  const m = store.get(id);
  if (m.status !== "clarifying") throw new Error("This mission isn't waiting for answers.");
  const list = Array.isArray(answers) ? answers : [];
  m.clarify.answers = m.clarify.questions.map((q) => ({ id: q.id, text: clip(list.find((a) => a.id === q.id)?.text ?? "", 800) }));
  line(m, "answers", "You answered");
  save(m);
  prepare(m);
  return view(m);
}

function editPlan(id, ops) {
  const m = store.get(id);
  if (m.status !== "awaiting_approval") throw new Error("A plan can only be changed before you approve it.");
  const settings = settingsModule.get();
  const statuses = new Map(m.plan.steps.map((s) => [s.id, s.status]));
  m.plan = planner.edit(m.plan, ops, { caps: settings.missions.caps });
  m.plan.steps.forEach((s) => (s.status = statuses.get(s.id) || "pending"));
  if (!m.plan.steps.length) throw new Error("A plan needs at least one step. Stop the mission instead.");
  m.limits = m.plan.limits;
  line(m, "plan", "You changed the plan");
  save(m);
  emit(m, "plan-edited");
  return view(m);
}

function workdirFor(m, settings) {
  const base = risk.expand(settings.missions.workspace || "~/friends-workspace");
  const slug = String(m.title || m.goal).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "mission";
  const dir = path.join(path.resolve(base), `${new Date(m.createdAt).toISOString().slice(0, 10)}-${slug}-${m.id.slice(-4)}`);
  fs.mkdirSync(dir, { recursive: true });
  return fs.realpathSync(dir);
}

function approve(id) {
  const m = store.get(id);
  if (m.status !== "awaiting_approval" || !m.plan) throw new Error("There's no plan waiting for your approval.");
  const settings = settingsModule.get();
  m.scope = m.plan.actions.map((a) => ({ ...a }));
  m.approvedAt = now();
  m.limits = m.plan.limits;
  m.workdir = workdirFor(m, settings);
  m.status = "running";
  line(m, "approved", `You approved the plan (${m.scope.length} listed action${m.scope.length === 1 ? "" : "s"})`);
  store.audit(m.id, { type: "approved", scope: m.scope.map((a) => a.summary), limits: m.limits });
  // "Repeat this": approving the plan also sets up the schedule or trigger that runs exactly this plan again
  if (m.automation && !m.automationId) {
    try {
      const made = automations.create({ name: m.automation.name || m.title, goal: m.goal, plan: m.plan, private: m.private, schedule: m.automation.schedule, trigger: m.automation.trigger });
      m.automationId = made.id;
      line(m, "automation", `It will run again: ${automations.describe(made)}`);
    } catch (err) {
      line(m, "automation", `Couldn't set up the repeat: ${err.message}`);
    }
  }
  save(m);
  emit(m, "approved");
  run(m);
  return view(m);
}

// "Repeat this" for a mission that has an approved plan already
function automate(id, { schedule = null, trigger = null, name = "" } = {}) {
  const m = store.get(id);
  if (!m.plan || !m.approvedAt) throw new Error("Approve the plan first; the approval is what is repeated.");
  const made = automations.create({ name: name || m.title, goal: m.goal, plan: m.plan, private: m.private, schedule, trigger });
  m.automationId = made.id;
  line(m, "automation", `It will run again: ${automations.describe(made)}`);
  save(m);
  emit(m, "automation");
  return made;
}

// ---------- 3. Running ----------
function startLive(m) {
  const entry = { controller: new AbortController(), approvals: new Map(), timer: null, stopping: false };
  live.set(m.id, entry);
  return entry;
}

function stopLive(m) {
  const entry = live.get(m.id);
  // (a pending resume, after a rate limit, keeps its entry)
  if (entry && !entry.running && !entry.timer) live.delete(m.id);
}

const running = () => [...live.values()].filter((e) => e.running).length;

// How many missions run at once: the rest wait their turn
const waitingQueue = [];
function run(m) {
  const max = settingsModule.get().missions.maxConcurrent || require("../hardware").last()?.fit.missionsAtOnce || 2;
  if (running() >= max) {
    m.status = "running";
    m.pause = { kind: "queued", message: "Another mission is running; this one starts when it's done." };
    save(m);
    waitingQueue.push(m.id);
    emit(m, "queued");
    return;
  }
  execute(m).finally(() => {
    const next = waitingQueue.shift();
    const waiting = next && store.find(next);
    if (waiting && waiting.status === "running" && waiting.pause?.kind === "queued") {
      waiting.pause = null;
      run(waiting);
    }
  });
}

async function execute(m) {
  const entry = live.get(m.id) || startLive(m);
  if (entry.running) return;
  entry.running = true;
  const { signal } = entry.controller;
  m.status = "running";
  m.pause = null;
  m.error = "";
  m.sources ||= [];
  m.files ||= [];
  const settings = settingsModule.get();
  if (!m.workdir || !fs.existsSync(m.workdir)) m.workdir = workdirFor(m, settings);
  const startedAt = now();
  const baseMs = m.usage.runMs || 0;
  let pausedMs = 0;
  const elapsed = () => baseMs + (now() - startedAt) - pausedMs;
  line(m, "started", "Running");
  save(m);
  emit(m, "started");

  const c = await context(m).catch((err) => ({ error: err }));
  if (c.error) {
    entry.running = false;
    return settle(m, c.error, "running");
  }

  const step = { current: null };
  const belt = toolbelt.create({
    mission: m,
    settings: c.settings,
    google: c.token,
    gitIdentity: await gitIdentity(),
    telegramSend: c.telegram ? hooks.telegramSend : null,
    notify: (n) => emit(m, "notify", { notify: n }),
    signal,
    remainingMs: () => Math.max(1000, m.limits.maxMinutes * 60000 - elapsed()),
    checkLimits: () => {
      if (elapsed() > m.limits.maxMinutes * 60000) throw new cloud.LimitReached(`This mission has used its ${m.limits.maxMinutes} minutes.`, "maxMinutes");
    },
    requestApproval: ({ action, why, step: s }) => requestApproval(m, entry, { action, why, step: s }, (ms) => (pausedMs += ms)),
  });

  try {
    // A step that was running when it stopped starts again (unless it had already sent or deleted something: it asks first)
    for (const s of m.plan.steps) if (s.status === "running") await recoverStep(m, entry, s);
    for (;;) {
      if (signal.aborted) throw Object.assign(new Error("Stopped."), { name: "AbortError" });
      if (elapsed() > m.limits.maxMinutes * 60000) throw new cloud.LimitReached(`This mission has used its ${m.limits.maxMinutes} minutes.`, "maxMinutes");
      if (m.usage.steps >= m.limits.maxSteps) throw new cloud.LimitReached(`This mission has used its ${m.limits.maxSteps} steps.`, "maxSteps");
      const next = planner.pickNext(m.plan, models.status().loaded?.role || null);
      if (!next) break;
      step.current = next;
      m.usage.runMs = elapsed();
      await runStep(m, entry, next, belt, c, signal);
      if (next.status === "failed") {
        throw Object.assign(new Error(`Step ${m.plan.steps.indexOf(next) + 1} (“${next.title}”) didn't work: ${next.error}`), { stepFailed: true });
      }
    }
    m.usage.runMs = elapsed();
    await finish(m, entry, c, signal);
  } catch (err) {
    m.usage.runMs = elapsed();
    // The step that was running is picked up again later
    for (const open of m.plan.steps.filter((x) => x.status === "running")) open.status = "pending";
    await settle(m, err, "running");
  } finally {
    entry.running = false;
    m.usage.runMs = elapsed();
    save(m);
    stopLive(m);
  }
}

async function gitIdentity() {
  const read = (key) => new Promise((resolve) => execFile("git", ["config", "--global", "--get", key], { timeout: 3000 }, (err, out) => resolve(err ? "" : String(out).trim())));
  const [name, email] = await Promise.all([read("user.name"), read("user.email")]);
  return { name: name || "Friends", email: email || "friends@localhost" };
}

// What running something again means for a step that was cut short
async function recoverStep(m, entry, s) {
  const done = (s.effects || []).filter((e) => e.summary);
  if (done.length) {
    const action = { type: "resume", risk: "external", summary: `Friends was interrupted during “${s.title}”, after it had already done: ${done.map((d) => d.summary).join("; ")}. Run the step again (it might repeat that)?` };
    const allowed = await requestApproval(m, entry, { action, why: "Doing it again might repeat something that can't be undone", step: s });
    if (!allowed) {
      s.status = "skipped";
      s.error = "Skipped after an interruption.";
      line(m, "step", `Skipped “${s.title}”`);
      save(m);
      return;
    }
  }
  s.status = "pending";
  s.effects = [];
}

// ---------- Asking you in the middle ----------
function requestApproval(m, entry, { action, why, step: s }, addPaused = () => {}) {
  return new Promise((resolve) => {
    if (entry.controller.signal.aborted) return resolve(false);
    const request = {
      id: crypto.randomUUID(),
      at: now(),
      risk: action.risk,
      type: action.type,
      summary: action.summary,
      why,
      step: s ? { id: s.id, title: s.title } : null,
    };
    const asked = now();
    m.status = "paused";
    m.pause = { kind: "approval", message: action.summary, request };
    line(m, "approval", `Waiting for you: ${action.summary}`);
    store.audit(m.id, { type: "approval-asked", request });
    save(m);
    emit(m, "approval", { request, notify: { title: "A mission needs your OK", body: `${m.title}: ${action.summary}`, request } });
    entry.approvals.set(request.id, (allowed) => {
      entry.approvals.delete(request.id);
      addPaused(now() - asked);
      m.status = "running";
      m.pause = null;
      line(m, "approval", allowed ? "You allowed it" : "You said no");
      save(m);
      emit(m, "resumed");
      resolve(allowed);
    });
  });
}

function decide(id, requestId, allow) {
  const entry = live.get(id);
  const answer = entry?.approvals.get(requestId);
  if (!answer) throw new Error("That question has already been answered, or the mission has moved on.");
  answer(allow === true);
  return view(store.get(id));
}

// ---------- One step ----------
const allToolNames = (belt) => new Set(belt.declarations().map((d) => d.name));

function stepIndex(m, s) {
  return m.plan.steps.indexOf(s) + 1;
}

function buildSystem(m, s, role, workdir, hint) {
  return [
    role?.system || "",
    "",
    `You are carrying out step ${stepIndex(m, s)} of ${m.plan.steps.length} of an approved plan, in the background, for the user. Nobody is watching right now: don't ask questions, make sensible choices and say what you chose.`,
    "Use only your tools. An action that the plan doesn't list will stop the whole mission and ask the user, so don't try things the plan doesn't need. Never claim to have done something you didn't do or couldn't check.",
    `Your working folder is ${workdir}. It is the current folder of every command you run, and a path without a folder (like “notes.md”) is inside it.`,
    "Write what the step had to produce as your final answer: the result itself, with no preamble about what you are going to do.",
    hint ? `\nThis is another try. What went wrong before and what to do differently: ${hint}` : "",
  ]
    .filter((x) => x !== undefined)
    .join("\n");
}

function buildPrompt(m, s) {
  const prior = m.plan.steps.filter((x) => (s.dependsOn.includes(x.id) || (!s.dependsOn.length && m.plan.steps.indexOf(x) === m.plan.steps.indexOf(s) - 1)) && x.output);
  const answers = m.clarify.answers.filter((a) => a.text);
  return [
    `The mission: ${m.goal}`,
    m.plan.summary ? `The plan: ${m.plan.summary}` : "",
    answers.length ? `What the user said when asked:\n${m.clarify.questions.map((q) => `- ${q.text} → ${m.clarify.answers.find((a) => a.id === q.id)?.text || "(no answer)"}`).join("\n")}` : "",
    "",
    `YOUR STEP: ${s.title}`,
    s.inputs ? `What to do: ${s.inputs}` : "",
    s.output ? `What to hand back: ${s.output}` : "",
    prior.length ? `\nResults of the steps before this one:\n${prior.map((x) => `### ${x.title}\n${manager.clip(x.output, 3500)}`).join("\n\n")}` : "",
  ]
    .filter((x) => x !== "")
    .join("\n");
}

// Pictures named in a step (vision): files in the mission's folder or an allowed folder
async function imagesFor(s, m, belt) {
  const out = [];
  const text = `${s.inputs || ""} ${m.plan.steps.map((x) => x.output || "").join(" ")}`;
  for (const word of text.match(/[\w~./-]+\.(?:png|jpe?g|webp)/gi) || []) {
    if (out.length >= 3) break;
    const r = await belt.resolveFile(word);
    if (!r.where) continue;
    try {
      const stat = fs.statSync(r.real);
      if (stat.size > 4 * 1024 * 1024) continue;
      const ext = path.extname(r.real).toLowerCase();
      out.push({ inlineData: { mimeType: ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg", data: fs.readFileSync(r.real).toString("base64") } });
    } catch {}
  }
  return out;
}

async function runStep(m, entry, s, belt, c, signal) {
  const settings = c.settings;
  const role = specialists.get(s.role, settings) || { id: s.role, label: s.role, system: "", tools: ["*"] };
  const index = stepIndex(m, s);
  s.status = "running";
  s.startedAt = s.startedAt || now();
  s.attempts = s.attempts || 0;
  s.effects = [];
  s.error = "";
  line(m, "step", `Step ${index} of ${m.plan.steps.length}: ${s.title}`, { step: s.id });
  save(m);
  emit(m, "step", { step: s.id });

  const privateMode = m.private || settings.privacy?.localOnly === true;
  const mgr = privateMode ? null : await cloud.manager(settings);
  const names = allToolNames(belt);
  const roleTools = specialists.toolSet(role);
  const allowed = new Set(s.tools.filter((t) => names.has(t) && (!roleTools || roleTools.has(t) || t === "notify_user")));
  const stepCtx = {
    id: s.id,
    title: s.title,
    allowed,
    effects: s.effects,
    activity: (text) => line(m, "activity", text, { step: s.id }),
  };
  let hint = "";
  let escalate = false;
  let lastError = null;
  let fatal = null; // a pause or a stop inside a model call: router.execute would flatten it into a plain error

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal.aborted) throw Object.assign(new Error("Stopped."), { name: "AbortError" });
    s.attempts++;
    // After a result that didn't pass the check, the manager takes the step (not in Private mode)
    const effectiveRole = escalate && mgr ? "manager" : s.role;
    let output = "";
    let ranLocal = false;
    try {
      const routePlan = router.planStep({
        role: effectiveRole,
        privateMode,
        label: role.label,
        deps: { local: (r) => specialists.brainFor(r, settings), cloud: (tier) => (mgr ? (tier === "plan" ? mgr.plan : mgr.fast) : null) },
      });
      routePlan.escalate = true;
      const images = role.vision ? await imagesFor(s, m, belt) : [];
      const system = buildSystem(m, s, role, m.workdir, hint);
      const prompt = buildPrompt(m, s);
      let text = "";
      const result = await router.execute(routePlan, {
        track: false,
        signal,
        slowMs: Number(process.env.FRIENDS_MISSION_SLOW_MS) || (settings.routing?.dynamic?.slowSeconds || 45) * 4000,
        emit: (event) => {
          store.audit(m.id, { type: "route", step: s.id, name: event.name, model: event.model, kind: event.kind, reason: event.reason });
          if (event.kind === "cloud" && effectiveRole !== "manager") line(m, "escalate", `Step ${index}: the manager takes over (${event.reason})`, { step: s.id });
        },
        run: async (rs, { signal: sig, started }) => {
          if (fatal) throw fatal;
          text = "";
          const brain = rs.brain;
          const decls = belt.declarations().filter((d) => allowed.has(d.name));
          const contents = [{ role: "user", parts: [...images, { text: prompt }] }];
          const callModel = (b, control) =>
            b.api.streamChat({
              key: b.key,
              model: b.model,
              contents,
              system,
              temperature: 0.3,
              fast: rs.kind === "cloud" && effectiveRole !== "manager",
              tools: decls,
              isFreeTool: () => false,
              signal: sig,
              onText: (piece) => {
                if (!started()) throw Object.assign(new Error("Another model answered first."), { name: "AbortError" });
                text += piece;
              },
              runTool: (name, args) => {
                if (!started()) throw Object.assign(new Error("Another model answered first."), { name: "AbortError" });
                // The model lets go of its turn while you decide
                stepCtx.pause = control?.pause;
                return belt.execute(name, args, stepCtx).then((r) => (collect(m, name, args, r, belt), r));
              },
            });
          m.model = { role: rs.kind === "cloud" ? "manager" : s.role, model: brain.model, kind: rs.kind, why: rs.reason, at: now() };
          try {
            if (rs.kind === "cloud") {
              emit(m, "model");
              return await cloud.call(() => callModel(brain, null), { mission: m, signal: sig, model: brain.model, onWait: callContext(m, sig).onWait });
            }
            m.usage.localCalls++;
            return await models.use(brain, { role: s.role, why: `${role.label} specialist loaded for step ${index}`, mission: m.id, step: s.id, signal: sig, fallbackModel: brain.fallbackModel }, async (b, control) => {
              m.model = { ...m.model, ...(models.status().loaded ? { placement: models.status().loaded.placement } : {}) };
              emit(m, "model");
              return callModel(b, control);
            });
          } catch (err) {
            if ((err.name === "AbortError" && signal.aborted) || err.name === "QuotaPause" || err.name === "LimitReached") fatal = err;
            throw err;
          }
        },
      });
      ranLocal = result.step.kind === "local";
      output = text.trim();
      store.audit(m.id, { type: "model-used", step: s.id, attempt, model: result.step.brain.model, kind: result.step.kind });
    } catch (err) {
      if (fatal) throw fatal;
      if (err.name === "AbortError" || err.name === "QuotaPause" || err.name === "LimitReached" || err instanceof router.RouteError) throw err;
      lastError = err;
      hint = `It failed with: ${clip(err.message, 300)}. Try another way.`;
      line(m, "retry", `Step ${index}, try ${attempt} of ${MAX_ATTEMPTS}: ${clip(err.message, 160)}`, { step: s.id });
      store.audit(m.id, { type: "step-error", step: s.id, attempt, error: err.message });
      continue;
    }

    if (!output) {
      lastError = new Error("The model answered with nothing.");
      hint = "You answered with nothing. Do the step, and give the result as your answer.";
      continue;
    }
    // The manager checks results that matter, and every result of a local model (not in Private mode: there is no manager above it)
    const mustCheck = (s.check || (ranLocal && !privateMode)) && attempt < MAX_ATTEMPTS;
    if (mustCheck) {
      try {
        const review = await manager.review(m, s, output, callContext(m, signal));
        store.audit(m.id, { type: "review", step: s.id, ok: review.ok, reason: review.reason });
        if (!review.ok) {
          hint = review.fix || review.reason || "The result didn't pass the check.";
          lastError = new Error(review.reason || "The result didn't pass the check.");
          escalate = ranLocal && Boolean(mgr);
          line(m, "retry", `Step ${index}: the result didn't pass the check (${clip(review.reason, 120)})${escalate ? ", so the manager takes it" : ""}`, { step: s.id });
          continue;
        }
      } catch (err) {
        if (err.name === "AbortError" || err.name === "QuotaPause" || err.name === "LimitReached") throw err;
        // A check that couldn't run doesn't fail the step
        store.audit(m.id, { type: "review-skipped", step: s.id, error: err.message });
      }
    }
    s.output = output;
    s.status = "done";
    s.finishedAt = now();
    s.effects = [];
    m.usage.steps++;
    line(m, "step-done", `Step ${index} done: ${s.title}`, { step: s.id });
    save(m);
    emit(m, "step", { step: s.id });
    // Halfway: a short word (only for longer plans)
    const doneCount = m.plan.steps.filter((x) => x.status === "done").length;
    if (m.plan.steps.length >= 4 && doneCount === Math.ceil(m.plan.steps.length / 2)) emit(m, "halfway", { notify: { title: "Halfway there", body: `${m.title}: ${doneCount} of ${m.plan.steps.length} steps done.` } });
    return;
  }
  s.status = "failed";
  s.error = lastError ? lastError.message : "It didn't work.";
  s.finishedAt = now();
  line(m, "step-failed", `Step ${index} failed: ${clip(s.error, 160)}`, { step: s.id });
  save(m);
  emit(m, "step", { step: s.id });
}

// Sources (pages read) and files made, for the report
function collect(m, name, args, result, belt) {
  if (!result || result.error) return;
  const add = (list, value) => value && !list.includes(value) && list.length < 60 && list.push(value);
  m.sources ||= [];
  m.files ||= [];
  if (result.url) add(m.sources, result.url);
  for (const s of result.sources || []) add(m.sources, s?.url);
  for (const r of (result.results || []).slice(0, 5)) add(m.sources, r?.url);
  if (["create_file", "edit_file", "edit_file_part", "move_item"].includes(name)) add(m.files, args.new_path || args.path);
}

// ---------- 4. The report ----------
async function finish(m, entry, c, signal) {
  line(m, "report", "Writing the report");
  save(m);
  emit(m, "reporting");
  const facts = { steps: m.plan.steps, sources: m.sources || [], files: (m.files || []).map((f) => f) };
  let md;
  try {
    md = await manager.report(m, facts, callContext(m, signal));
  } catch (err) {
    if (err.name === "AbortError" || err.name === "QuotaPause") throw err;
    md = fallbackReport(m, facts);
  }
  md = String(md || "").trim() || fallbackReport(m, facts);
  const title = (md.match(/^#\s+(.+)$/m)?.[1] || m.title).replace(/[\\/:*?"<>|]/g, " ").trim().slice(0, 90);
  const day = new Date().toISOString().slice(0, 10);
  const footer = `\n\n---\n*A Friends mission, ${day}. Goal: ${clip(m.goal, 300)}${m.workdir ? ` · Files: \`${m.workdir}\`` : ""}*\n`;
  let note = "";
  try {
    const saved = await localNotes.writeNote(c.settings.localNotes?.folder ? { localNotes: c.settings.localNotes } : null, `Missions/${day} ${title}`, md + footer, { tags: ["mission"] });
    note = saved.path;
  } catch (err) {
    logger.warn("Couldn't save the mission's report in the vault:", err.message);
  }
  store.writeReport(m.id, md + footer);
  const summaryText = clip(md.replace(/^#.*$/gm, "").replace(/[*_`>#-]/g, "").trim(), 300);
  m.report = { title, note, summary: summaryText, sources: m.sources || [], files: m.files || [], at: now() };
  m.status = "done";
  m.pause = null;
  m.model = null;
  line(m, "done", note ? `Done. The report is in your vault: ${note}` : "Done");
  store.audit(m.id, { type: "done", note });
  save(m);
  emit(m, "done", { notify: { title: "A mission is done", body: `${title}${note ? ` (saved in your notes as ${note})` : ""}` } });
}

function fallbackReport(m, facts) {
  return [`# ${m.title}`, "", "**Summary**", m.plan?.summary || "", "", "**What was done**", ...facts.steps.map((s) => `- ${s.title} (${s.status})`), "", "**Results**", ...facts.steps.filter((s) => s.output).map((s) => `### ${s.title}\n${s.output}`), facts.sources.length ? `\n**Sources**\n${facts.sources.map((x) => `- ${x}`).join("\n")}` : ""].join("\n");
}

// ---------- Stop, resume, remove ----------
function stop(id) {
  const m = store.get(id);
  if (["done", "failed", "stopped"].includes(m.status)) return view(m);
  const entry = live.get(id);
  if (entry) {
    entry.stopping = true;
    for (const answer of [...entry.approvals.values()]) answer(false);
    entry.controller.abort();
    clearTimeout(entry.timer);
  }
  // Effective at once, whatever it was doing (a running command is killed by the abort)
  m.status = "stopped";
  m.pause = null;
  line(m, "stopped", "Stopped by you");
  store.audit(m.id, { type: "stopped" });
  save(m);
  emit(m, "stopped");
  return view(m);
}

function scheduleResume(m, until) {
  const entry = live.get(m.id) || startLive(m);
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    entry.timer = null;
    const mm = store.find(m.id);
    if (mm && mm.status === "paused" && mm.pause?.kind === "quota") resume(m.id);
  }, Math.max(1000, Math.min(until - now(), 2 ** 31 - 1)));
  entry.timer.unref?.();
}

// extend: the limit that was reached is doubled (the page's "Continue")
function resume(id, { extend = false } = {}) {
  const m = store.get(id);
  if (!["paused", "stopped", "failed"].includes(m.status)) throw new Error("This mission isn't paused.");
  if (m.status === "paused" && m.pause?.kind === "approval") throw new Error("It's waiting for your answer to its question.");
  if (!m.plan || !m.approvedAt) {
    // Never approved: planning starts again
    clearTimeout(live.get(m.id)?.timer);
    live.delete(m.id);
    prepare(m);
    return view(m);
  }
  if (extend && m.pause?.which) {
    const key = m.pause.which;
    m.limits[key] = Math.min(settingsModule.get().missions.caps[key] * 2 || Infinity, Math.max(1, m.limits[key] * 2));
    if (m.plan.limits) m.plan.limits[key] = m.limits[key];
  }
  const entry = live.get(m.id);
  if (entry) {
    clearTimeout(entry.timer);
    entry.timer = null;
    if (!entry.running) live.delete(m.id);
  }
  m.plan.steps.forEach((s) => {
    if (s.status === "failed") s.status = "pending";
  });
  m.status = "running";
  m.pause = null;
  m.error = "";
  line(m, "resumed", "Carrying on");
  save(m);
  emit(m, "resumed");
  run(m);
  return view(m);
}

function remove(id) {
  const m = store.get(id);
  if (["running", "planning"].includes(m.status) && live.get(id)?.running) stop(id);
  store.remove(id);
  events.emit("event", { type: "removed", mission: { id } });
  return { ok: true };
}

// ---------- After a restart ----------
// A mission that was running carries on; one waiting out a rate limit is timed again; planning starts over
function recover() {
  for (const m of store.all()) {
    try {
      if (m.status === "running") {
        line(m, "restart", "Friends started again; carrying on");
        save(m);
        run(m);
      } else if (m.status === "planning") {
        prepare(m);
      } else if (m.status === "paused" && m.pause?.kind === "quota") {
        if (m.pause.until > now()) scheduleResume(m, m.pause.until);
        else resume(m.id);
      } else if (m.status === "paused" && m.pause?.kind === "approval") {
        // The question was lost with the old process: the step asks again
        m.status = "running";
        m.pause = null;
        save(m);
        run(m);
      }
    } catch (err) {
      logger.warn(`Couldn't pick up mission ${m.id}:`, err.message);
    }
  }
}

// ---------- Starting ----------
function create(goal, { source = "app", private: isPrivate = false, character = null, automationId = null, automation = null } = {}) {
  const text = String(goal || "").trim();
  if (text.length < 4) throw new Error("Say what the goal is, in a sentence or two.");
  const settings = settingsModule.get();
  if (settings.missions?.enabled === false) throw new Error("Missions are switched off in Settings → AI → Missions.");
  const m = store.create({ goal: text, source, private: isPrivate === true || settings.privacy?.localOnly === true, character, automationId, automation });
  m.title = clip(text, 80);
  line(m, "created", `Mission started from ${source}`);
  save(m);
  emit(m, "created");
  prepare(m);
  return view(m);
}

// A mission that starts from a plan already approved (an automation's run): no questions, no new approval
function createFromPlan(goal, plan, { source = "schedule", private: isPrivate = false, automationId = null, title = "" } = {}) {
  const settings = settingsModule.get();
  const m = store.create({ goal, source, private: isPrivate === true || settings.privacy?.localOnly === true, automationId });
  m.title = clip(title || goal, 90);
  m.plan = JSON.parse(JSON.stringify(plan));
  m.plan.steps.forEach((s) => {
    s.status = "pending";
    delete s.output;
    delete s.error;
    s.attempts = 0;
  });
  m.scope = m.plan.actions.map((a) => ({ ...a }));
  m.approvedAt = now();
  m.limits = m.plan.limits;
  m.workdir = workdirFor(m, settings);
  m.status = "running";
  line(m, "created", `Started by its schedule (the plan was approved before)`);
  store.audit(m.id, { type: "approved", scope: m.scope.map((a) => a.summary), by: "automation", automationId });
  save(m);
  emit(m, "created");
  run(m);
  return view(m);
}

const list = () => store.all().map(summary);
const get = (id) => view(store.get(id));
const audit = (id) => (store.get(id), store.readAudit(id));
const report = (id) => (store.get(id), store.readReport(id));
const active = () => store.all().filter((m) => ["planning", "clarifying", "awaiting_approval", "running", "paused"].includes(m.status));

module.exports = { report, create, createFromPlan, automate, answer, editPlan, approve, decide, stop, resume, remove, recover, list, get, audit, active, onEvent, setHooks, summary, view, events, live, MAX_ATTEMPTS };
