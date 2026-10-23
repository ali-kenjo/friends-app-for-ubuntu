// What a step of a mission may do, and what an approved plan covers.
//
// Every action has a risk class:
//   read         looks at something (files, the web, your notes, your calendar): never needs listing
//   write        creates or changes something of yours (files, vault notes, tasks, reminders, a Gmail draft)
//   external     sends or publishes something (an email, a Telegram message, a calendar event, a GitHub issue)
//   destructive  deletes (always to the trash) or overwrites something that was there
//   system       runs a command on this computer, or installs something
//
// You approve a plan once, and the approval covers exactly the actions the plan lists. classify() says what a
// tool call is; covered() says whether the approved plan lists it. Anything else that is external, destructive
// or system pauses the mission and asks. Pure functions (the file checks are the only asynchronous part), so
// they're tested alone (test/missions-risk.test.js).
const fs = require("fs");
const os = require("os");
const path = require("path");

const RISKS = ["read", "write", "external", "destructive", "system"];
const rank = (risk) => Math.max(0, RISKS.indexOf(risk));
const maxRisk = (...risks) => risks.reduce((best, r) => (rank(r) > rank(best) ? r : best), "read");
// These three must be listed in the plan before they run
const NEEDS_LISTING = new Set(["external", "destructive", "system"]);

// ---------- Tools ----------
// type: what the plan calls it. kind: for data_write, which part of your life.
const TOOLS = {
  // looking
  list_folder: { risk: "read" }, read_file: { risk: "read" }, read_file_lines: { risk: "read" }, search_files: { risk: "read" },
  search_notes: { risk: "read" }, read_note: { risk: "read" }, list_notes: { risk: "read" }, semantic_search_notes: { risk: "read" },
  list_tasks: { risk: "read" }, list_reminders: { risk: "read" }, list_habits: { risk: "read" }, read_journal: { risk: "read" },
  daily_briefing: { risk: "read" }, list_calendar_events: { risk: "read" }, get_calendar_events: { risk: "read" }, check_focus: { risk: "read" },
  search_drive: { risk: "read" }, read_drive_file: { risk: "read" }, search_gmail: { risk: "read" }, read_gmail: { risk: "read" },
  youtube_my_channel: { risk: "read" }, youtube_video: { risk: "read" }, youtube_comments: { risk: "read" }, youtube_search: { risk: "read" },
  google_tasks: { risk: "read" }, search_github: { risk: "read" }, get_news: { risk: "read" }, recall_conversations: { risk: "read" },
  web_search: { risk: "read" }, read_webpage: { risk: "read" }, wikipedia: { risk: "read" }, get_weather: { risk: "read" }, convert_currency: { risk: "read" },
  github_my_repos: { risk: "read" }, github_issues: { risk: "read" }, github_pull_requests: { risk: "read" }, github_read_file: { risk: "read" }, github_notifications: { risk: "read" },
  notion_search: { risk: "read" }, notion_read_page: { risk: "read" }, todoist_tasks: { risk: "read" }, home_devices: { risk: "read" },
  reddit_subreddit: { risk: "read" }, reddit_search: { risk: "read" }, reddit_read_post: { risk: "read" }, reddit_rules: { risk: "read" },
  system_status: { risk: "read" }, notify_user: { risk: "read" }, resolve_follow_up: { risk: "read" },
  // changing your files (the path decides, see classify)
  create_file: { risk: "write", type: "file_write" }, edit_file: { risk: "write", type: "file_write" }, edit_file_part: { risk: "write", type: "file_write" },
  create_folder: { risk: "write", type: "file_write" }, move_item: { risk: "write", type: "file_write" },
  delete_item: { risk: "destructive", type: "file_delete" },
  // your vault and your life
  save_note_file: { risk: "write", type: "vault_write" }, append_note_file: { risk: "write", type: "vault_write" },
  save_note: { risk: "write", type: "data_write", kind: "memory" }, delete_note: { risk: "destructive", type: "data_write", kind: "memory" },
  add_task: { risk: "write", type: "data_write", kind: "tasks" }, update_task: { risk: "write", type: "data_write", kind: "tasks" }, delete_task: { risk: "destructive", type: "data_write", kind: "tasks" },
  set_reminder: { risk: "write", type: "data_write", kind: "reminders" }, cancel_reminder: { risk: "destructive", type: "data_write", kind: "reminders" },
  add_habit: { risk: "write", type: "data_write", kind: "habits" }, log_habit: { risk: "write", type: "data_write", kind: "habits" },
  write_journal: { risk: "write", type: "data_write", kind: "journal" },
  add_calendar_event: { risk: "write", type: "data_write", kind: "calendar" }, delete_calendar_event: { risk: "destructive", type: "data_write", kind: "calendar" },
  start_focus: { risk: "write", type: "data_write", kind: "focus" }, stop_focus: { risk: "write", type: "data_write", kind: "focus" },
  draft_gmail: { risk: "write", type: "email_draft" }, google_add_task: { risk: "write", type: "data_write", kind: "tasks" }, google_complete_task: { risk: "write", type: "data_write", kind: "tasks" },
  write_draft: { risk: "read" },
  // sending and publishing
  send_gmail: { risk: "external", type: "email_send" }, send_telegram: { risk: "external", type: "telegram_send" },
  create_calendar_event: { risk: "external", type: "calendar_create" }, update_calendar_event: { risk: "external", type: "calendar_change" },
  github_create_issue: { risk: "external", type: "tool" }, notion_create_page: { risk: "external", type: "tool" }, notion_append: { risk: "external", type: "tool" },
  todoist_add_task: { risk: "external", type: "tool" }, todoist_complete: { risk: "external", type: "tool" }, home_control: { risk: "external", type: "tool" },
  reddit_draft_post: { risk: "external", type: "tool" }, reddit_draft_comment: { risk: "external", type: "tool" },
  // your computer
  run_command: { risk: "system", type: "command" },
};

// Google Calendar deletions go through the same name as the local calendar's: the account decides
const normalizeEmails = (to) =>
  (Array.isArray(to) ? to : String(to || "").split(/[,;]/))
    .map((x) => String(x).trim().toLowerCase())
    .filter(Boolean);
const normalizeText = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

const home = os.homedir();
const expand = (p) => (p === "~" ? home : String(p).startsWith("~/") ? path.join(home, String(p).slice(2)) : String(p));
const inside = (child, parent) => child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);

// ---------- Commands ----------
// Run in the mission's own folder. Some are never covered by a plan, even if the plan lists them: they ask
// again at the moment they would run ("sudo, installs outside the project, anything touching system settings").
const ALWAYS_ASK = [
  [/(^|[\s;&|(])sudo\b|\bsu\s+-?\w*\s*($|;|&)|\bdoas\b|\bpkexec\b/, "it needs administrator rights (sudo)"],
  [/(^|[\s;&|(])(apt|apt-get|aptitude|dpkg|snap|flatpak|dnf|yum|pacman|zypper|brew)\s+/, "it installs or changes software on this computer"],
  // (pip run from a project's own environment, like .venv/bin/pip, is a project install: see INSTALLERS)
  [/(^|[\s;&|(])(pip3?|pipx|python3?\s+-m\s+pip)\s+(install|uninstall)\b/, "it installs Python packages outside a project environment"],
  [/\bnpm\s+(i|install|add|uninstall)\b.*(\s-g\b|--global|--location[= ]global)|\b(yarn|pnpm)\s+(global|add\s+-g)\b/, "it installs a program for the whole computer"],
  [/\bcargo\s+install\b|\bgo\s+install\b|\bgem\s+install\b/, "it installs a program for the whole computer"],
  [/(^|[\s;&|(])(systemctl|service|journalctl\s+--vacuum|loginctl|timedatectl|hostnamectl|localectl)\b/, "it changes system services"],
  [/\b(gsettings|dconf|xdg-settings|nmcli|ufw|iptables|nft|resolvectl|update-alternatives|crontab)\b/, "it changes system settings"],
  [/\b(chmod|chown|chgrp)\s+(-R\s+)?\S+\s+(\/|~)(\s|$|\/(usr|etc|bin|var|lib|opt|home\/[^/\s]+\/?\s))/, "it changes permissions outside the project"],
  [/\b(mkfs|fdisk|parted|dd\s+if=|wipefs|shred|mount|umount|losetup)\b/, "it works on disks"],
  [/\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z|da)?sh\b|\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?python/, "it runs something it downloads"],
  [/(^|[\s;&|(])(reboot|shutdown|poweroff|halt|init\s+[0-6])\b/, "it restarts or turns off the computer"],
  [/\bkill(all)?\s+-9\s+(1|-1)\b|\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(\/|~|\$HOME|\*)(\s|$)/, "it would delete far more than the project"],
  [/>\s*\/(etc|usr|bin|boot|var|lib|sys|proc)\b|\btee\s+(-a\s+)?\/(etc|usr|bin|boot|var|lib)\b/, "it writes to system folders"],
  [/\bgit\s+push\b|\bgh\s+(pr|issue|repo|release)\s+(create|merge|delete)\b/, "it publishes something to a remote"],
  [/\bssh\b|\bscp\b|\brsync\b[^;&|]*:/, "it connects to another computer"],
];

// Package installs inside the project: allowed when the plan lists them
const INSTALLERS = [
  /^(npm|pnpm|yarn)\s+(i|install|add|ci)(\s+(.*))?$/,
  /^(\.?\/?(\.?venv|env)\/bin\/)?(pip3?|python3?\s+-m\s+pip)\s+install\s+(.*)$/,
  /^cargo\s+add\s+(.*)$/,
  /^(go\s+get)\s+(.*)$/,
  /^(bundle\s+add|composer\s+require)\s+(.*)$/,
];

// The words of a command that are file locations
function pathWords(command) {
  return String(command)
    .split(/[\s=;&|<>()`"']+/)
    .filter((w) => /^(~|\/|\.\.\/|\$HOME)/.test(w) || w === "..");
}

function safeRealpath(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    let cur = path.resolve(p);
    while (cur && cur !== path.dirname(cur)) {
      cur = path.dirname(cur);
      try {
        const r = fs.realpathSync(cur);
        return path.join(r, path.relative(cur, path.resolve(p)));
      } catch {}
    }
    return path.resolve(p);
  }
}

// Says what a command is. { always, reason } when it always asks; { installs } when it installs project packages.
// folders: the real paths a command may mention (the mission's folder and your allowed folders).
function classifyCommand(command, { workdir, folders = [] } = {}) {
  const text = String(command || "").trim().replace(/\s+/g, " ");
  if (!text) return { always: true, reason: "the command is empty" };
  for (const [re, reason] of ALWAYS_ASK) if (re.test(text)) return { always: true, reason };
  const base = workdir ? path.resolve(workdir) : null;
  const roots = [base, ...folders.map((f) => path.resolve(expand(f)))].filter(Boolean);
  const safeRoots = roots.map(safeRealpath);

  // Check symbolic link creation pointing outside allowed roots
  if (/\bln\s+(-[a-zA-Z]*s[a-zA-Z]*|--symbolic)\b/.test(text)) {
    const lnArgs = text.split(/\s+/).filter((w) => w && !w.startsWith("-") && w !== "ln");
    if (lnArgs.length > 0) {
      const target = lnArgs[0].replace(/^\$\{?HOME\}?/, base || home).replace(/^~(?=\/|$)/, base || home);
      const resTarget = path.isAbsolute(target) ? path.resolve(target) : (base ? path.resolve(base, target) : path.resolve(target));
      const realTarget = safeRealpath(resTarget);
      if (!safeRoots.some((r) => inside(realTarget, r))) {
        return { always: true, reason: "it creates a symlink pointing outside the project or allowed folders" };
      }
    }
  }

  for (const word of pathWords(text)) {
    if (word === ".." || word.startsWith("../")) {
      if (!base) return { always: true, reason: "it reaches outside the project folder" };
      const resolved = path.resolve(base, word);
      const realResolved = safeRealpath(resolved);
      if (!safeRoots.some((r) => inside(realResolved, r))) return { always: true, reason: "it reaches outside the project folder" };
      continue;
    }
    // In a mission's command ~ and $HOME are the mission's own folder (the shell is started with HOME set to it)
    const resolved = path.resolve(word.replace(/^\$\{?HOME\}?/, base || home).replace(/^~(?=\/|$)/, base || home));
    // Standard tools and temporary files are fine to name: /usr/bin/env, /dev/null, /tmp
    if (/^\/(usr\/(bin|local\/bin)|bin|dev\/null|dev\/stdout|dev\/stderr|tmp)(\/|$)/.test(resolved)) continue;
    const realResolved = safeRealpath(resolved);
    if (!safeRoots.some((r) => inside(realResolved, r))) return { always: true, reason: `it touches ${word}, outside the project and your allowed folders` };
  }
  for (const re of INSTALLERS) {
    const m = text.match(re);
    if (m) {
      const args = (m[m.length - 1] || "").split(/\s+/).filter((w) => w && !w.startsWith("-") && !/^(install|add)$/.test(w));
      return { installs: args };
    }
  }
  return {};
}

// "npm test", "node *", "git *": a listed command ending in * covers any arguments
function commandMatches(listed, command) {
  const want = normalizeText(listed);
  const got = normalizeText(command);
  if (!want) return false;
  if (want === got) return true;
  if (want.endsWith(" *")) {
    const head = want.slice(0, -2);
    return got === head || got.startsWith(head + " ");
  }
  if (want === "*") return false; // a bare * would cover everything: never
  return false;
}

// ---------- What a tool call is ----------
// Returns { risk, type, summary, ...what is needed to match it }.
// ctx: { workdir, resolveFile(path) → Promise<{ real, where: "work" | "folder" | null }> , settings }
async function classify(name, args = {}, ctx = {}) {
  const entry = TOOLS[name];
  // A tool that isn't in the table (an MCP app) is external: it's treated as something that acts for you
  if (!entry) {
    if (String(name).startsWith("mcp_")) return { risk: "external", type: "tool", tool: name, summary: `Use the app tool ${name}` };
    return { risk: "external", type: "tool", tool: name, summary: `Use ${name}` };
  }
  const out = { risk: entry.risk, type: entry.type || "read", tool: name };
  switch (entry.type) {
    case "email_send":
    case "email_draft":
      out.to = normalizeEmails(args.to);
      out.subject = String(args.subject || "");
      out.summary = `${entry.type === "email_send" ? "Send" : "Save as a draft"} an email to ${out.to.join(", ") || "(nobody)"}: “${out.subject}”`;
      break;
    case "telegram_send":
      out.summary = "Send you a Telegram message";
      break;
    case "calendar_create":
      out.what = String(args.summary || args.title || "");
      out.summary = `Add “${out.what}” to Google Calendar${args.start ? ` (${args.start})` : ""}`;
      break;
    case "calendar_change":
      out.what = String(args.summary || "");
      out.summary = `Change a Google Calendar event${out.what ? ` to “${out.what}”` : ""}`;
      break;
    case "tool":
      out.summary = `Use ${name.replace(/_/g, " ")}${args.title ? `: “${args.title}”` : ""}`;
      break;
    case "vault_write":
      out.what = String(args.title || "");
      out.summary = `${name === "append_note_file" ? "Add to" : "Write"} the note “${out.what}” in your vault`;
      break;
    case "data_write":
      out.kind = entry.kind;
      out.what = String(args.title || args.text || args.name || args.task || args.reminder || args.eventId || "");
      out.summary = `${entry.risk === "destructive" ? "Remove" : "Change"} your ${entry.kind}${out.what ? `: ${out.what}` : ""}`;
      if (name === "delete_calendar_event" && ctx.googleCalendar) {
        out.risk = "external";
        out.type = "calendar_change";
      }
      break;
    case "file_write":
    case "file_delete": {
      const targets = [args.path, name === "move_item" ? args.new_path : null].filter(Boolean);
      out.paths = [];
      for (const p of targets) {
        const where = ctx.resolveFile ? await ctx.resolveFile(p) : { real: path.resolve(expand(p)), where: null };
        out.paths.push(where);
      }
      out.summary = `${entry.type === "file_delete" ? "Move to the trash" : name === "move_item" ? "Move" : "Write"} ${out.paths.map((x) => x.shown || x.real).join(" → ")}`;
      break;
    }
    case "command": {
      out.command = String(args.command || "");
      Object.assign(out, classifyCommand(out.command, { workdir: ctx.workdir, folders: ctx.folders || [] }));
      out.summary = `Run: ${out.command.slice(0, 200)}`;
      if (out.installs?.length) {
        out.type = "install";
        out.summary = `Install ${out.installs.join(", ")} (${out.command.split(" ")[0]}), inside the project`;
      }
      break;
    }
    default:
      out.summary = name.replace(/_/g, " ");
  }
  return out;
}

// ---------- What the approved plan covers ----------
// declared: the plan's actions: [{ type, risk, to?, subject?, path?, command?, what?, kind?, tool?, title? }]
// Returns { ok, why }: when not ok, why is what to tell you.
function covered(action, declared = [], { workdir = "", folders = [] } = {}) {
  const same = declared.filter((d) => d.type === action.type);
  const none = (why) => ({ ok: false, why });
  if (action.risk === "read") return { ok: true };

  switch (action.type) {
    case "file_write":
    case "file_delete": {
      const all = action.paths || [];
      for (const target of all) {
        if (target.where === "work") continue; // the mission's own folder is its own to use
        const listed = same.some((d) => {
          const dp = path.resolve(expand(d.path || ""));
          return d.path && inside(target.real, dp);
        });
        if (!listed) return none(`${target.shown || target.real} isn't in the plan`);
      }
      return { ok: true };
    }
    case "vault_write": {
      // A note under "Missions/" is the mission's own report
      if (/^missions\//i.test(action.what || "")) return { ok: true };
      if (same.some((d) => !d.title || normalizeText(d.title) === normalizeText(action.what) || d.title === "*")) return { ok: true };
      return none(`the note “${action.what}” isn't in the plan`);
    }
    case "data_write":
      return same.some((d) => d.kind === action.kind) ? { ok: true } : none(`changing your ${action.kind} isn't in the plan`);
    case "email_send":
    case "email_draft": {
      const match = same.find((d) => {
        const to = normalizeEmails(d.to);
        return action.to.length > 0 && action.to.every((a) => to.includes(a)) && normalizeText(d.subject) === normalizeText(action.subject);
      });
      return match ? { ok: true } : none("that email (recipient and subject) isn't in the plan");
    }
    case "telegram_send":
      return same.length ? { ok: true } : none("sending a Telegram message isn't in the plan");
    case "calendar_create":
    case "calendar_change": {
      const match = same.find((d) => !d.what || normalizeText(d.what) === normalizeText(action.what));
      return match ? { ok: true } : none("that calendar event isn't in the plan");
    }
    case "command": {
      if (action.always) return none(`${action.reason}, so it always asks first`);
      return same.some((d) => commandMatches(d.command, action.command)) ? { ok: true } : none("that command isn't in the plan");
    }
    case "install": {
      if (action.always) return none(`${action.reason}, so it always asks first`);
      // Installing what the plan lists (by name), or running the listed command itself
      const listedCommand = declared.some((d) => d.type === "command" && commandMatches(d.command, action.command));
      const listed = same.map((d) => normalizeText(d.what || d.command));
      const names = action.installs || [];
      const allListed = names.length === 0 ? listedCommand : names.every((n) => listed.some((l) => l.includes(normalizeText(n.replace(/@.*$/, "")))));
      return allListed ? { ok: true } : none(`installing ${names.join(", ") || "packages"} isn't in the plan`);
    }
    case "tool":
      return same.some((d) => d.tool === action.tool) ? { ok: true } : none(`${action.tool.replace(/_/g, " ")} isn't in the plan`);
    case "internet":
      return same.length ? { ok: true } : none("using the internet isn't in the plan");
    default:
      return action.risk === "write" ? { ok: true } : none("it isn't in the plan");
  }
}

module.exports = { RISKS, rank, maxRisk, NEEDS_LISTING, TOOLS, classify, classifyCommand, commandMatches, covered, normalizeEmails, normalizeText, expand, inside };
