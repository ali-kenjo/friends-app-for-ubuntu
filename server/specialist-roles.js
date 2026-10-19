// The specialist roles as plain data, and how what you changed is cleaned up. (No imports of the rest of the
// helper, so settings.js can use it; the part that finds models and brains is specialists.js.)
const TOOL_GROUPS = {
  web: ["web_search", "read_webpage", "wikipedia", "get_news", "get_weather", "convert_currency", "search_github", "github_read_file"],
  filesRead: ["list_folder", "read_file", "read_file_lines", "search_files"],
  filesWrite: ["create_file", "edit_file", "edit_file_part", "create_folder", "move_item", "delete_item"],
  vault: ["search_notes", "read_note", "list_notes", "semantic_search_notes", "save_note_file", "append_note_file"],
  command: ["run_command"],
  system: ["system_status", "notify_user"],
  life: ["add_task", "list_tasks", "set_reminder", "list_reminders", "add_calendar_event", "list_calendar_events"],
};
const group = (...names) => names.flatMap((n) => TOOL_GROUPS[n]);

// The built-in roles. model: "" means "the general role's".
const DEFAULT_ROLES = [
  {
    id: "general",
    label: "General",
    when: "Everyday work: reading, summarising a little, sorting, simple decisions, talking to your tools.",
    kind: "chat",
    tools: ["*"],
    contextSize: 8192,
    system:
      "You are the general helper of Friends, a personal assistant. You carry out one step of a larger plan. Do exactly what the step asks, use the tools you were given, check what they returned, and answer with the result: short, concrete, no filler. If something fails, try another way before giving up, and say what you could not do.",
  },
  {
    id: "coding",
    label: "Coding",
    when: "Writing, changing and running code: scripts, small programs, tests, fixing a failing test, project setup.",
    kind: "chat",
    tools: group("filesRead", "filesWrite", "command", "vault"),
    contextSize: 8192,
    system:
      "You are the coding specialist of Friends. You work inside the project folder you are given (the current folder of every command). Write complete, working files, run the code and its tests, read the errors, and fix them until they pass. Keep the code simple and readable, with no unused dependencies. Never install anything that the plan didn't list. When you are done, say in a few lines what you built and how to run it.",
  },
  {
    id: "writing",
    label: "Writing and social media",
    when: "Writing text: reports, emails, posts, captions, scripts, summaries of what was found, in the user's voice.",
    kind: "chat",
    tools: group("filesRead", "vault", "web"),
    contextSize: 8192,
    system:
      "You are the writing specialist of Friends. You write clear, warm, natural text that sounds like a person, not a template: the right length, no filler, no clichés, in the language the user writes in. For posts and captions, keep the platform in mind. You only use facts you were given or found; you never invent sources or numbers.",
  },
  {
    id: "research",
    label: "Research summaries",
    when: "Reading pages and sources and boiling them down: key facts, numbers, differences, with where each came from.",
    kind: "chat",
    tools: group("web", "filesRead", "vault"),
    contextSize: 8192,
    system:
      "You are the research specialist of Friends. You read what the tools return and boil it down to the facts that matter: numbers, dates, names, differences between sources. Every claim keeps its source (a link or a file). If sources disagree, say so. If you did not find something, say that instead of guessing.",
  },
  {
    id: "vision",
    label: "Vision",
    when: "Looking at pictures and screenshots: describing, reading text in images, spotting what is wrong in a screenshot.",
    kind: "chat",
    vision: true,
    tools: [],
    contextSize: 4096,
    system: "You are the vision specialist of Friends. You look closely at the pictures you are given and describe or read what is in them accurately: text, layout, objects, what looks wrong. You never claim to see what isn't there.",
  },
  {
    id: "embeddings",
    label: "Embeddings (memory and notes search)",
    when: "Turning text into numbers, so notes and memories can be searched by meaning. Not used for chatting.",
    kind: "embedding",
    tools: [],
    contextSize: 2048,
    system: "",
  },
];
const BUILTIN = new Set(DEFAULT_ROLES.map((r) => r.id));
const MAX_CUSTOM = 10;

const clip = (v, n) => String(v ?? "").trim().slice(0, n);

// settings.specialists.roles is a list of what you changed: { id, model, system, tools, contextSize, enabled, label?, when? }
function sanitize(list) {
  const out = [];
  const seen = new Set();
  for (const r of Array.isArray(list) ? list : []) {
    const id = clip(r?.id, 40).toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (!id || seen.has(id) || id === "manager") continue;
    if (!BUILTIN.has(id) && seen.size >= BUILTIN.size + MAX_CUSTOM) continue;
    seen.add(id);
    const entry = { id, model: clip(r.model, 200), system: clip(r.system, 4000), enabled: r.enabled !== false };
    if (Array.isArray(r.tools)) entry.tools = r.tools.map((t) => clip(t, 60)).filter(Boolean).slice(0, 80);
    const ctx = Math.round(Number(r.contextSize));
    if (Number.isFinite(ctx) && ctx > 0) entry.contextSize = Math.min(131072, Math.max(1024, ctx));
    if (!BUILTIN.has(id)) {
      entry.label = clip(r.label, 60) || id;
      entry.when = clip(r.when, 300);
      entry.kind = r.kind === "embedding" ? "embedding" : "chat";
      entry.vision = r.vision === true;
    }
    out.push(entry);
  }
  return out;
}


module.exports = { TOOL_GROUPS, DEFAULT_ROLES, BUILTIN, MAX_CUSTOM, sanitize };
