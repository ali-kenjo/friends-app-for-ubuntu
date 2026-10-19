// A mission's plan: the ordered steps the manager wrote, cleaned up into something you can read, edit and
// approve. The manager's JSON is never trusted as it comes: the risk of each action is worked out here from
// its type, tools that would need an action the plan doesn't list are taken away, and the sizes are limited.
//
// plan = {
//   summary,                         one short paragraph: what will be done and what you'll have at the end
//   steps: [{ id, title, role, tools, inputs, output, dependsOn, check, risk, actions }],
//   actions: [...],                  every side effect of every step, in one list (derived)
//   limits: { maxMinutes, maxSteps, maxCloudCalls },
//   risk,                            the highest risk of any action (derived)
// }
// action = { id, step, type, risk, summary, ...the fields of its type (see FIELDS) }
const { rank, maxRisk, TOOLS, NEEDS_LISTING, normalizeEmails } = require("./risk");

// Each kind of action: its risk, and the fields that say exactly what it is
const TYPES = {
  email_send: { risk: "external", fields: ["to", "subject"], label: "Send an email" },
  email_draft: { risk: "write", fields: ["to", "subject"], label: "Save an email draft" },
  telegram_send: { risk: "external", fields: [], label: "Send a Telegram message" },
  calendar_create: { risk: "external", fields: ["what"], label: "Add a Google Calendar event" },
  calendar_change: { risk: "external", fields: ["what"], label: "Change a Google Calendar event" },
  tool: { risk: "external", fields: ["tool"], label: "Use an app" },
  file_write: { risk: "write", fields: ["path"], label: "Create or change files" },
  file_delete: { risk: "destructive", fields: ["path"], label: "Move to the trash" },
  vault_write: { risk: "write", fields: ["title"], label: "Write a note in your vault" },
  data_write: { risk: "write", fields: ["kind"], label: "Change your tasks, reminders or calendar" },
  command: { risk: "system", fields: ["command"], label: "Run a command" },
  install: { risk: "system", fields: ["what"], label: "Install a package in the project" },
};
const DATA_KINDS = ["tasks", "reminders", "calendar", "habits", "journal", "memory", "focus"];
const MAX_STEPS_IN_PLAN = 20;

const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const clipText = (value, max) => String(value ?? "").trim().slice(0, max);
const clampInt = (n, lo, hi, fallback) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
};

// One action from the manager → a clean action, or null when it isn't one we know
function normalizeAction(raw, stepId, index) {
  const type = TYPES[raw?.type] ? raw.type : null;
  if (!type) return null;
  const action = { id: `${stepId}.${index + 1}`, step: stepId, type, risk: TYPES[type].risk };
  if (type === "email_send" || type === "email_draft") {
    action.to = normalizeEmails(raw.to);
    action.subject = clip(raw.subject, 200);
    if (!action.to.length || !action.subject) return null;
  } else if (type === "file_write" || type === "file_delete") {
    action.path = clip(raw.path, 400);
    if (!action.path) return null;
  } else if (type === "command") {
    action.command = clip(raw.command, 400);
    if (!action.command) return null;
  } else if (type === "install") {
    action.what = clip(raw.what || raw.command, 200);
    if (!action.what) return null;
  } else if (type === "vault_write") {
    action.title = clip(raw.title || "*", 200);
  } else if (type === "data_write") {
    action.kind = DATA_KINDS.includes(raw.kind) ? raw.kind : null;
    if (!action.kind) return null;
  } else if (type === "calendar_create" || type === "calendar_change") {
    action.what = clip(raw.what || raw.summary || raw.title, 200);
  } else if (type === "tool") {
    action.tool = clip(raw.tool, 80);
    if (!action.tool) return null;
  }
  action.summary = describeAction(action);
  return action;
}

// What an action says, in a line you can read
function describeAction(a) {
  switch (a.type) {
    case "email_send":
      return `Send an email to ${a.to.join(", ")}: “${a.subject}”`;
    case "email_draft":
      return `Save a draft email to ${a.to.join(", ")}: “${a.subject}”`;
    case "telegram_send":
      return "Send you a Telegram message";
    case "calendar_create":
      return `Add “${a.what || "an event"}” to Google Calendar`;
    case "calendar_change":
      return `Change ${a.what ? `“${a.what}”` : "an event"} on Google Calendar`;
    case "tool":
      return `Use ${a.tool.replace(/_/g, " ")}`;
    case "file_write":
      return `Create or change files in ${a.path}`;
    case "file_delete":
      return `Move ${a.path} to the trash`;
    case "vault_write":
      return a.title && a.title !== "*" ? `Write the note “${a.title}” in your vault` : "Write notes in your vault";
    case "data_write":
      return `Change your ${a.kind}`;
    case "command":
      return `Run: ${a.command}`;
    case "install":
      return `Install ${a.what} (inside the project)`;
    default:
      return a.type;
  }
}

// The tools a step may name: only ones we know (the mission's tool list), and the risky ones only when the plan lists what they do
const ACTION_FOR_TOOL = {
  send_gmail: "email_send", draft_gmail: "email_draft", send_telegram: "telegram_send", create_calendar_event: "calendar_create", update_calendar_event: "calendar_change",
  delete_item: "file_delete", run_command: "command",
};

// raw: the manager's JSON. options: { roles: [ids], tools: [names offered], limits: the caps from Settings }
function normalize(raw, { roles = ["general"], tools = [], limits = {}, caps = {} } = {}) {
  const input = raw && typeof raw === "object" ? raw : {};
  const known = new Set(tools);
  const roleIds = new Set(roles);
  const steps = [];
  const rawSteps = Array.isArray(input.steps) ? input.steps.slice(0, MAX_STEPS_IN_PLAN) : [];
  rawSteps.forEach((r, i) => {
    const id = `s${i + 1}`;
    const rawActions = Array.isArray(r?.actions) ? r.actions : [];
    const actions = rawActions.map((a, n) => normalizeAction(a, id, n)).filter(Boolean);
    const role = roleIds.has(r?.role) ? r.role : roleIds.has(r?.specialist) ? r.specialist : roles.includes("general") ? "general" : roles[0];
    const dependsOn = (Array.isArray(r?.dependsOn) ? r.dependsOn : []).map(String).filter((d) => steps.some((s) => s.id === d));
    steps.push({
      id,
      title: clip(r?.title, 140) || `Step ${i + 1}`,
      role,
      tools: [...new Set((Array.isArray(r?.tools) ? r.tools : []).map(String).filter((t) => known.has(t)))],
      inputs: clipText(r?.inputs, 1200),
      output: clipText(r?.output || r?.expected, 600),
      dependsOn,
      check: r?.check === true,
      actions,
    });
  });

  const done = finish({ summary: clipText(input.summary, 1500), steps, limits: normalizeLimits(input.limits, limits, caps) });
  return done;
}

function normalizeLimits(raw = {}, defaults = {}, caps = {}) {
  const pick = (key, lo, hi, fallback) => clampInt(raw?.[key] ?? defaults[key], lo, Math.min(hi, caps[key] || hi), fallback);
  return {
    maxMinutes: pick("maxMinutes", 1, 24 * 60, 60),
    maxSteps: pick("maxSteps", 1, 200, 25),
    maxCloudCalls: pick("maxCloudCalls", 0, 1000, 60),
  };
}

// Derived parts: each step's risk, the tools it may really use, the one list of actions, the plan's risk
function finish(plan) {
  const listedTypes = new Set(plan.steps.flatMap((s) => s.actions.map((a) => a.type)));
  const actions = [];
  for (const step of plan.steps) {
    step.tools = step.tools.filter((tool) => {
      const need = ACTION_FOR_TOOL[tool] || (TOOLS[tool] && NEEDS_LISTING.has(TOOLS[tool].risk) ? "tool" : null);
      if (!need) return true;
      if (need === "tool") return step.actions.some((a) => a.type === "tool" && a.tool === tool) || listedTypes.has("tool");
      return listedTypes.has(need);
    });
    step.risk = step.actions.reduce((risk, a) => maxRisk(risk, a.risk), "read");
    // A step that writes (files, notes) is at least "write" even when the manager forgot to list it
    if (rank(step.risk) < rank("write") && step.tools.some((t) => TOOLS[t]?.risk === "write")) step.risk = "write";
    actions.push(...step.actions);
  }
  plan.actions = actions;
  plan.risk = plan.steps.reduce((risk, s) => maxRisk(risk, s.risk), "read");
  return plan;
}

// ---------- Editing before you approve ----------
// ops: { remove: [stepIds], edit: { stepId: { title, inputs, output } }, removeAction: [actionIds], limits: {…} }
function edit(plan, ops = {}, options = {}) {
  const remove = new Set((ops.remove || []).map(String));
  const removeAction = new Set((ops.removeAction || []).map(String));
  const steps = plan.steps
    .filter((s) => !remove.has(s.id))
    .map((s) => {
      const change = ops.edit?.[s.id] || {};
      return {
        ...s,
        title: change.title !== undefined ? clip(change.title, 140) || s.title : s.title,
        inputs: change.inputs !== undefined ? clipText(change.inputs, 1200) : s.inputs,
        output: change.output !== undefined ? clipText(change.output, 600) : s.output,
        dependsOn: s.dependsOn.filter((d) => !remove.has(d)),
        actions: s.actions.filter((a) => !removeAction.has(a.id)),
      };
    });
  const limits = ops.limits ? normalizeLimits({ ...plan.limits, ...ops.limits }, plan.limits, options.caps) : plan.limits;
  return finish({ summary: plan.summary, steps, limits });
}

// The steps that can run now: not done, with everything they depend on done
function ready(plan) {
  const done = new Set(plan.steps.filter((s) => s.status === "done" || s.status === "skipped").map((s) => s.id));
  return plan.steps.filter((s) => (!s.status || s.status === "pending") && s.dependsOn.every((d) => done.has(d)));
}

// Which ready step to run next: the one that uses the model that's already loaded (no swapping), else the first
function pickNext(plan, loadedRole = null) {
  const candidates = ready(plan);
  if (!candidates.length) return null;
  return candidates.find((s) => s.role === loadedRole) || candidates[0];
}

module.exports = { TYPES, DATA_KINDS, normalize, normalizeAction, normalizeLimits, describeAction, finish, edit, ready, pickNext, ACTION_FOR_TOOL };
