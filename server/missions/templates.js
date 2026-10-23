// Built-in mission templates and custom template management (import/export .mission-template.json)
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { dataDir, writeJson } = require("../config");

const templatesFile = () => path.join(dataDir, "missions", "templates.json");

const BUILTIN_TEMPLATES = [
  {
    id: "research_report",
    title: "Deep Research Report",
    description: "Search multiple web sources, compare perspectives, and write a comprehensive note with links in your vault.",
    icon: "book-open",
    tags: ["research", "web", "vault"],
    goal: "Research [Topic] thoroughly: query top sources, read key articles, synthesize findings into a balanced report with source citations, and save it in the vault.",
    private: false,
    limits: { maxSteps: 8, maxMinutes: 15, maxCloudCalls: 20 },
    suggestedRoles: ["research", "summarizer", "writing"],
  },
  {
    id: "price_tracker",
    title: "Product Price Tracker",
    description: "Track prices of items, compare deals, and alert you on significant discounts.",
    icon: "tag",
    tags: ["shopping", "monitoring"],
    goal: "Check current prices and availability for [Product/Item] across major vendors, list deal options, and notify me with the best price.",
    private: false,
    limits: { maxSteps: 6, maxMinutes: 10, maxCloudCalls: 12 },
    suggestedRoles: ["research", "extraction"],
  },
  {
    id: "inbox_triage",
    title: "Inbox Triage & Drafts",
    description: "Scan recent emails, highlight urgent items, and draft polite replies for your review.",
    icon: "mail",
    tags: ["email", "productivity"],
    goal: "Triage unread Gmail messages from the past 24 hours, identify urgent correspondence, and prepare draft replies for human review.",
    private: false,
    limits: { maxSteps: 6, maxMinutes: 10, maxCloudCalls: 15 },
    suggestedRoles: ["email", "writing"],
  },
  {
    id: "file_organizer",
    title: "Download & File Organizer",
    description: "Scan ~/Downloads or a designated folder, sort files by category/date, and move junk to trash.",
    icon: "folder",
    tags: ["files", "cleanup", "local"],
    goal: "Analyze files in ~/Downloads, group documents, installers, and media into categorized subfolders, and clean temporary files safely to trash.",
    private: true,
    limits: { maxSteps: 8, maxMinutes: 10, maxCloudCalls: 0 },
    suggestedRoles: ["organizer", "general"],
  },
  {
    id: "backup_check",
    title: "Backup & Storage Health Check",
    description: "Verify backup existence, disk space, and data integrity across critical directories.",
    icon: "shield",
    tags: ["system", "backup", "maintenance"],
    goal: "Inspect backup directories, check available disk capacity, verify recent backup file timestamps, and produce a status check report.",
    private: true,
    limits: { maxSteps: 5, maxMinutes: 5, maxCloudCalls: 0 },
    suggestedRoles: ["checker", "general"],
  },
  {
    id: "system_watch",
    title: "System Hardware & Services Watch",
    description: "Inspect CPU load, GPU temperature, RAM, and failed systemd services.",
    icon: "cpu",
    tags: ["system", "monitoring", "local"],
    goal: "Collect system hardware metrics (CPU, RAM, GPU temperature), check for failed system services, and report any anomalies.",
    private: true,
    limits: { maxSteps: 4, maxMinutes: 5, maxCloudCalls: 0 },
    suggestedRoles: ["checker", "general"],
  },
  {
    id: "daily_digest",
    title: "Daily Morning Briefing",
    description: "Synthesize today's calendar, open tasks, unread notifications, and weather into a morning briefing.",
    icon: "sun",
    tags: ["daily", "tasks", "calendar"],
    goal: "Assemble a morning briefing covering today's calendar schedule, top priority tasks, pending reminders, and weather summary.",
    private: false,
    limits: { maxSteps: 6, maxMinutes: 8, maxCloudCalls: 10 },
    suggestedRoles: ["organizer", "summarizer"],
  },
  {
    id: "content_calendar",
    title: "Content & Social Publishing Calendar",
    description: "Plan a weekly schedule of posts, articles, or announcements with drafted content.",
    icon: "calendar",
    tags: ["social", "writing", "planning"],
    goal: "Draft a 7-day content calendar for [Topic/Project], outline post ideas, schedule draft entries, and prepare social snippets.",
    private: false,
    limits: { maxSteps: 7, maxMinutes: 12, maxCloudCalls: 16 },
    suggestedRoles: ["planner", "social", "writing"],
  },
  {
    id: "code_scaffold",
    title: "Software Project Scaffolder",
    description: "Create project directory, package manifest, initial boilerplate, tests, and git repository.",
    icon: "code",
    tags: ["coding", "git", "scaffold"],
    goal: "Scaffold a new project named [ProjectName] in workspace: generate project files, configure testing, create a README, and run initial test suite.",
    private: true,
    limits: { maxSteps: 8, maxMinutes: 15, maxCloudCalls: 0 },
    suggestedRoles: ["coding", "tool_caller"],
  },
  {
    id: "learning_plan",
    title: "Structured Learning Curriculum",
    description: "Build a multi-week self-study syllabus with milestone exercises and recommended reading.",
    icon: "award",
    tags: ["learning", "notes", "planning"],
    goal: "Create a 4-week structured curriculum for learning [Subject], specifying weekly topics, practical exercises, and reference notes.",
    private: false,
    limits: { maxSteps: 6, maxMinutes: 10, maxCloudCalls: 12 },
    suggestedRoles: ["planner", "writing"],
  },
  {
    id: "weekly_review",
    title: "Weekly Reflection & Audit",
    description: "Review completed tasks, habit consistency, journal logs, and notes generated this past week.",
    icon: "check-circle",
    tags: ["productivity", "habits", "journal"],
    goal: "Conduct a weekly review: analyze completed tasks, habit streak logs, journal entries, and compile key accomplishments into a vault summary.",
    private: true,
    limits: { maxSteps: 5, maxMinutes: 8, maxCloudCalls: 0 },
    suggestedRoles: ["summarizer", "organizer"],
  },
  {
    id: "reddit_digest",
    title: "Reddit Subreddit Monitor & Digest",
    description: "Search target subreddits for discussions matching keywords and prepare an executive summary.",
    icon: "message-circle",
    tags: ["reddit", "research", "monitoring"],
    goal: "Search r/[Subreddit] for posts about [Keyword], summarize community discussions and sentiment, and compile links to noteworthy threads.",
    private: false,
    limits: { maxSteps: 6, maxMinutes: 10, maxCloudCalls: 12 },
    suggestedRoles: ["research", "summarizer"],
  },
  {
    id: "telegram_reminders",
    title: "Deadline Milestone & Telegram Alert",
    description: "Track approaching deadlines and send formatted progress alerts to your Telegram chat.",
    icon: "send",
    tags: ["telegram", "reminders", "alerts"],
    goal: "Check upcoming task and calendar deadlines for this week, evaluate urgent items, and send a structured reminder via Telegram.",
    private: false,
    limits: { maxSteps: 4, maxMinutes: 5, maxCloudCalls: 6 },
    suggestedRoles: ["organizer", "tool_caller"],
  },
  {
    id: "whiteboard_explainer",
    title: "Whiteboard Architecture Explainer",
    description: "Explain a complex concept or system architecture and create an interactive whiteboard visual.",
    icon: "layout",
    tags: ["whiteboard", "reasoning", "education"],
    goal: "Explain [System/Concept] clearly: generate a conceptual breakdown and illustrate the structure on the whiteboard canvas.",
    private: false,
    limits: { maxSteps: 6, maxMinutes: 10, maxCloudCalls: 15 },
    suggestedRoles: ["reasoning", "writing"],
  },
];

function loadCustom() {
  try {
    const data = JSON.parse(fs.readFileSync(templatesFile(), "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveCustom(templates) {
  fs.mkdirSync(path.dirname(templatesFile()), { recursive: true, mode: 0o700 });
  writeJson(templatesFile(), templates);
}

function list() {
  const custom = loadCustom();
  const customIds = new Set(custom.map((c) => c.id));
  const builtins = BUILTIN_TEMPLATES.filter((b) => !customIds.has(b.id)).map((b) => ({ ...b, builtin: true }));
  return [...custom.map((c) => ({ ...c, builtin: false })), ...builtins];
}

function get(id) {
  const allTemplates = list();
  return allTemplates.find((t) => t.id === id) || null;
}

function saveTemplate(template) {
  if (!template || typeof template !== "object") throw new Error("Template must be an object.");
  const title = String(template.title || "").trim();
  if (title.length < 3) throw new Error("Template title must have at least 3 characters.");
  const id = template.id || `custom-${crypto.randomBytes(3).toString("hex")}`;
  const custom = loadCustom().filter((c) => c.id !== id);
  const record = {
    id,
    title,
    description: String(template.description || "").slice(0, 500),
    icon: template.icon || "file-text",
    tags: Array.isArray(template.tags) ? template.tags : [],
    goal: String(template.goal || "").slice(0, 6000),
    plan: template.plan ? JSON.parse(JSON.stringify(template.plan)) : null,
    private: template.private === true,
    limits: template.limits || null,
    suggestedRoles: Array.isArray(template.suggestedRoles) ? template.suggestedRoles : [],
    updatedAt: Date.now(),
  };
  custom.push(record);
  saveCustom(custom);
  return record;
}

function removeTemplate(id) {
  const custom = loadCustom();
  const next = custom.filter((c) => c.id !== id);
  if (next.length === custom.length) return false;
  saveCustom(next);
  return true;
}

function exportTemplate(id) {
  const t = get(id);
  if (!t) throw new Error("Template not found.");
  return JSON.stringify({
    schema: "friends.mission-template.v1",
    exportedAt: new Date().toISOString(),
    template: {
      id: t.id,
      title: t.title,
      description: t.description,
      icon: t.icon,
      tags: t.tags,
      goal: t.goal,
      plan: t.plan,
      private: t.private,
      limits: t.limits,
      suggestedRoles: t.suggestedRoles,
    },
  }, null, 2);
}

function importTemplate(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`Invalid JSON format: ${err.message}`);
  }
  const raw = parsed.template || parsed;
  if (!raw.title || !raw.goal) throw new Error("Imported template requires title and goal.");
  return saveTemplate({
    ...raw,
    id: `imported-${crypto.randomBytes(3).toString("hex")}`,
  });
}

module.exports = {
  BUILTIN_TEMPLATES,
  list,
  get,
  saveTemplate,
  removeTemplate,
  exportTemplate,
  importTemplate,
};
