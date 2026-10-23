// The manager: the model that asks the questions, writes the plan, checks each result and writes the report.
// It is Gemini (a stronger model plans and checks, a faster one does routine steps, see cloud.js), or, in
// Private mode and when there is no cloud AI, the general local model. It only ever talks (text and JSON):
// the work itself is done by the specialists and the tools (runner.js).
const settingsModule = require("../settings");
const models = require("../models");
const specialists = require("../specialists");
const characters = require("../characters");
const cloud = require("./cloud");
const risk = require("./risk");
const redact = require("../redact");

const clip = (value, max) => {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}… (${text.length} characters)` : text;
};

// The reply as an object, even when the model wrapped it in a code fence or said a word before it
function parseJson(text) {
  let s = String(text || "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const firstBrace = s.indexOf("{");
  const firstBracket = s.indexOf("[");
  let start = -1;
  let end = -1;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace;
    end = s.lastIndexOf("}");
  } else if (firstBracket !== -1) {
    start = firstBracket;
    end = s.lastIndexOf("]");
  }
  if (start >= 0 && end > start) {
    s = s.slice(start, end + 1);
  }

  // 1. Try clean parse
  try {
    return JSON.parse(s);
  } catch {}

  // 2. Trailing comma repair
  let r = s.replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(r);
  } catch {}

  // 3. Unquoted keys { key: "val" }
  r = r.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
  try {
    return JSON.parse(r);
  } catch {}

  // 4. Single quotes to double quotes
  r = r.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
  try {
    return JSON.parse(r);
  } catch {}

  // 5. Unescaped control characters inside string literals
  r = r.replace(/"((?:[^"\\]|\\.)*)"/g, (match) =>
    match.replace(/[\r\n\t]/g, (c) => (c === "\n" ? "\\n" : c === "\r" ? "\\r" : "\\t"))
  );
  try {
    return JSON.parse(r);
  } catch {}

  throw new Error("The manager's answer wasn't something I could read as a plan. Try again.");
}

// ---------- One call to the manager ----------
// tier: "plan" (stronger) or "fast". Returns the text. ctx: { mission, signal, onWait }
async function ask({ system, prompt, tier = "plan", json = false, temperature = 0.3 }, ctx = {}) {
  const settings = settingsModule.get();
  const mission = ctx.mission;
  const choice = mission?.managerChoice || settings.missions?.managerChoice || "auto";
  const isPrivate = mission?.private || settings.privacy?.localOnly === true;
  const useCloud = (choice === "gemini" || (choice === "auto" && !isPrivate)) && !isPrivate;

  const m = useCloud ? await cloud.manager(settings) : null;
  if (m) {
    const brain = tier === "plan" ? m.plan : m.fast;
    ctx.onCloudStart?.();
    const redactOpts = settings.privacy?.redact;
    const cleanSystem = redact.active(redactOpts) ? redact.redactText(system, redactOpts) : system;
    const cleanPrompt = redact.active(redactOpts) ? redact.redactText(prompt, redactOpts) : prompt;
    const text = await cloud.call(() => brain.api.generateText({ key: brain.key, model: brain.model, system: cleanSystem, prompt: cleanPrompt, temperature, json, thinking: tier === "plan", signal: ctx.signal }), { mission, signal: ctx.signal, onWait: ctx.onWait, model: brain.model });
    if (mission) ctx.onCall?.({ kind: "cloud", model: brain.model, tier });
    return text;
  }

  // No cloud (Private mode, Local manager mode, or no Gemini): local model is the manager
  // Check for planner specialist first, then reasoning, then general
  const local = specialists.brainFor("planner", settings) || specialists.brainFor("reasoning", settings) || specialists.brainFor("general", settings);
  if (!local) {
    throw Object.assign(new Error(isPrivate ? "Private mode is on, and there is no local model for the manager. Add one in Settings → AI & privacy." : "There is no AI to plan with. Add Gemini or a local model in Settings → AI & privacy."), { code: "NO_MANAGER" });
  }
  const text = await models.use(local, { role: "manager", why: "The manager (local)", mission: mission?.id }, (brain) => brain.api.generateText({ key: "", model: brain.model, system, prompt, temperature, json, signal: ctx.signal }));
  if (mission) {
    mission.usage.localCalls++;
    ctx.onCall?.({ kind: "local", model: local.model, tier });
  }
  return text;
}

// ---------- What the manager is told about the world ----------
function world(settings, { tools = [], google = false, telegram = false } = {}) {
  const roles = specialists.list(settings).filter((r) => r.enabled !== false && r.kind !== "embedding");
  const who = settings.personality?.userName || "";
  const active = characters.active(settings);
  const folders = settings.permissions?.folders || [];
  return {
    date: new Date().toLocaleString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    user: who,
    character: active ? { name: active.name, tagline: active.tagline || "" } : null,
    folders,
    workspace: settings.missions?.workspace || "~/friends-workspace",
    roles,
    tools,
    google,
    telegram,
    private: settings.privacy?.localOnly === true,
    compactContext: ((specialists.brainFor("planner", settings) || specialists.brainFor("general", settings))?.contextSize || 8192) <= 4096,
  };
}

const toolLines = (tools) => tools.map((t) => `- ${t.name} [${t.risk}]: ${clip(t.description, 140)}`).join("\n");
const roleLines = (roles) => roles.map((r) => `- ${r.id}: ${r.when}`).concat(["- manager: hard reasoning, architecture and anything that must be right the first time (uses the cloud AI; avoid for routine work)"]).join("\n");

// ---------- 1. Questions ----------
async function clarify(mission, w, ctx) {
  const voice = w.character ? `Ask in the voice of ${w.character.name}${w.character.tagline ? ` (${w.character.tagline})` : ""}: friendly and brief.` : "Ask in a friendly, brief way.";
  const system = [
    "You prepare the plan for a goal that a personal assistant will carry out on the user's computer. Before planning, decide whether you must ask the user something.",
    "Ask ONLY what you truly cannot decide yourself with a sensible default, or find out with your tools. Never ask for things that are in the goal. Ask at most 3 questions, each short and answerable in a few words. If the goal is clear enough, ask nothing.",
    voice,
    "Write in the language the user's goal is written in.",
    `Today is ${w.date}.${w.user ? ` The user is ${w.user}.` : ""}`,
    'Reply with JSON only: {"questions":[{"id":"q1","text":"..."}]}  (an empty list when you need to ask nothing).',
  ].join("\n");
  const prior = mission.clarify.answers.length
    ? `\n\nYou already asked, and the user answered:\n${mission.clarify.questions.map((q) => `Q: ${q.text}\nA: ${mission.clarify.answers.find((a) => a.id === q.id)?.text || "(no answer)"}`).join("\n")}\n\nAsk again only if something important is still missing.`
    : "";
  const text = await ask({ system, prompt: `The goal:\n${mission.goal}${prior}`, tier: "fast", json: true, temperature: 0.2 }, ctx);
  const data = parseJson(text);
  return (Array.isArray(data.questions) ? data.questions : [])
    .map((q, i) => ({ id: `q${i + 1}`, text: String(q?.text || q || "").trim().slice(0, 300) }))
    .filter((q) => q.text)
    .slice(0, 3);
}

// ---------- 2. The plan ----------
async function plan(mission, w, ctx) {
  const system = [
    'You are the planning manager of "Friends", a personal assistant that carries out goals in the background on the user\'s Linux computer. You write a plan that a person approves ONCE and that then runs without asking again, so it must be concrete, small, and honest about everything it changes.',
    `Today is ${w.date}.${w.user ? ` The user is ${w.user}.` : ""} Write the plan in the language the goal is written in.`,
    w.private ? "PRIVATE MODE: everything runs on local models on this computer. There is no cloud AI and nothing is sent to the internet: don't plan web research, Gmail, Calendar or anything online. If the goal needs that, say so in the summary and plan only what can be done locally." : "",
    "",
    "TOOLS (a step may only use these; the risk class is in brackets):",
    toolLines(w.tools),
    "",
    "SPECIALISTS (who runs a step, set as its role):",
    roleLines(w.roles),
    "",
    "HOW TO PLAN",
    w.compactContext
      ? "- Compact context: plan 3 to 5 small, focused steps in order. Keep inputs, outputs and actions brief."
      : "- 3 to 10 steps in order. Each step is one clear piece of work with one result. Put steps that use the same specialist next to each other. Write a step so a small model can do it: say exactly what to do, with what, and what to hand back.",
    "- Each step has: id (s1, s2…), title, role, tools (names from the list above), inputs (what it gets; refer to earlier steps by id), output (what it must produce, so it can be checked), dependsOn (ids), check (true when a wrong result would waste the later steps), actions.",
    "- `actions` lists EVERY side effect of the step, exactly. The user approves only what is listed here: anything else stops the mission and asks. Reading, searching and thinking need no action.",
    "  Action types and their fields:",
    '    {"type":"email_send","to":["a@b.com"],"subject":"…"}   {"type":"email_draft","to":[…],"subject":"…"}   {"type":"telegram_send"}',
    '    {"type":"calendar_create","what":"event title"}   {"type":"file_write","path":"~/Documents/reports"}   {"type":"file_delete","path":"~/Downloads/old.zip"}',
    '    {"type":"vault_write","title":"note title"}   {"type":"data_write","kind":"tasks|reminders|calendar|habits|journal|memory"}',
    '    {"type":"command","command":"npm test"}  (a trailing * allows any arguments, e.g. "node *")   {"type":"install","what":"express (npm)"}',
    "- The mission has its own working folder: files in it need no action. Files anywhere else need file_write or file_delete with the folder or file (only inside the user's allowed folders). Deleting always means moving to the trash.",
    "- Commands run inside the working folder. List each command you will need. Never plan sudo, installs outside the project, or changes to system settings.",
    "- Send an email only when the goal says to, to exactly the addresses the user gave. When unsure, save a draft instead.",
    "- For a research report: search several sources, read the best pages, compare them, then write the report as a step. The mission itself saves the finished report as a note in the user's vault, so don't list that.",
    "- For software: create a project folder inside the working folder, write the code, run it and its tests, fix what fails, write a README, and `git init` and commit if the goal says so (list those commands).",
    "- Only list what you need. The plan should be as small as the goal allows. The limits shown to the user are set elsewhere.",
    "",
    'Reply with JSON only: {"title":"short name","summary":"what will be done and what the user will have at the end, 2-3 sentences","steps":[{"id":"s1","title":"…","role":"research","tools":["web_search","read_webpage"],"inputs":"…","output":"…","dependsOn":[],"check":false,"actions":[]}]}',
  ]
    .filter((l) => l !== undefined)
    .join("\n");
  const answers = mission.clarify.answers.length
    ? `\n\nThe user answered your questions:\n${mission.clarify.questions.map((q) => `Q: ${q.text}\nA: ${mission.clarify.answers.find((a) => a.id === q.id)?.text || "(no answer: choose a sensible default)"}`).join("\n")}`
    : "";
  const context = [
    w.folders.length ? `The user's allowed folders: ${w.folders.join(", ")}.` : "The user has not allowed any folders yet (so only the working folder can be used).",
    `The working folder of this mission is made inside ${w.workspace}.`,
    w.google ? "Google (Gmail, Calendar, Drive) is connected." : "Google is not connected (no Gmail, Calendar or Drive).",
    w.telegram ? "Telegram is connected." : "",
  ]
    .filter(Boolean)
    .join(" ");
  const text = await ask({ system, prompt: `${context}\n\nThe goal:\n${mission.goal}${answers}`, tier: "plan", json: true, temperature: 0.3 }, ctx);
  const parsed = parseJson(text);

  // Second-pass validation & self-check for small-model safeguards
  if (Array.isArray(parsed.steps)) {
    const knownIds = new Set();
    parsed.steps.forEach((s, idx) => {
      s.id = s.id || `s${idx + 1}`;
      knownIds.add(s.id);
      s.dependsOn = (Array.isArray(s.dependsOn) ? s.dependsOn : []).filter((dep) => knownIds.has(dep) && dep !== s.id);
      s.actions = Array.isArray(s.actions) ? s.actions : [];
      s.tools = Array.isArray(s.tools) ? s.tools : [];
      s.check = Boolean(s.check);
    });
  }
  return parsed;
}

// ---------- 3. Checking a result ----------
async function review(mission, step, output, ctx) {
  const system = [
    "You check the result of one step of a mission before the next step uses it. Judge whether the result is what the step asked for: complete, concrete, in the right form, not an excuse, and not invented (no made-up sources, numbers or files).",
    'Reply with JSON only: {"ok":true|false,"reason":"one short sentence","fix":"if not ok: what to do differently, in one or two sentences"}. Be fair: small imperfections are ok.',
  ].join("\n");
  const prompt = [`The mission's goal: ${clip(mission.goal, 600)}`, `The step: ${step.title}`, `What it had to produce: ${step.output || "(not said)"}`, "", `What it produced:\n${clip(output, 5000)}`].join("\n");
  const data = parseJson(await ask({ system, prompt, tier: "fast", json: true, temperature: 0.1 }, ctx));
  return { ok: data.ok !== false, reason: clip(data.reason || "", 300), fix: clip(data.fix || "", 400) };
}

// ---------- 4. The report ----------
async function report(mission, facts, ctx) {
  const system = [
    "You write the final report of a mission that a personal assistant carried out for the user, as a note in Markdown. Write in the language of the goal. Be clear and honest: what was done, what was found or made, what didn't work. No filler.",
    "Structure: a title line (# …), then **Summary** (3-5 sentences), **What was done** (a short list), **Results** (the substance: findings, a comparison table when comparing, or what was built and how to run it), **Sources** (a list of links, one per source actually used; leave the section out if there were none), **Files** (paths of files made, if any), **Next steps** (only if there are real ones).",
    "Use only facts that are in the step results below. Never invent a source, a number or a file.",
  ].join("\n");
  const stepsText = facts.steps.map((s) => `### ${s.title} (${s.status})\n${clip(s.output || "(no output)", 3500)}`).join("\n\n");
  const prompt = [`Goal: ${mission.goal}`, `Plan summary: ${mission.plan?.summary || ""}`, "", "What the steps produced:", stepsText, "", facts.sources.length ? `Sources used (links):\n${facts.sources.map((s) => `- ${s}`).join("\n")}` : "", facts.files.length ? `Files made:\n${facts.files.map((f) => `- ${f}`).join("\n")}` : ""].join("\n");
  return ask({ system, prompt, tier: "plan", temperature: 0.4 }, ctx);
}

module.exports = { ask, parseJson, world, clarify, plan, review, report, clip };
