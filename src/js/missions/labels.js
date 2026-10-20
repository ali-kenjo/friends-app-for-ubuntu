// How missions are named on screen: states, risks, roles, times. (Every text goes through t() so it can be translated.)
import { t, tp, formatDate, formatTime } from "../i18n.js";

// state → { label, icon, tone } ("tone" only ever means status: good, warn, bad, or neutral/busy)
export function statusOf(m) {
  const kind = m.pause?.kind;
  switch (m.status) {
    case "planning":
      return { label: t("Planning"), icon: "sparkles", tone: "busy" };
    case "clarifying":
      return { label: t("Needs your answers"), icon: "chat", tone: "warn", needsYou: true };
    case "awaiting_approval":
      return { label: t("Needs your approval"), icon: "shield", tone: "warn", needsYou: true };
    case "running":
      return kind === "queued" ? { label: t("Waiting its turn"), icon: "hourglass", tone: "busy" } : { label: t("Running"), icon: "play", tone: "busy" };
    case "paused":
      if (kind === "approval") return { label: t("Asking you"), icon: "hand", tone: "warn", needsYou: true };
      if (kind === "quota") return { label: t("Waiting for Gemini"), icon: "hourglass", tone: "warn" };
      if (kind === "limit") return { label: t("Reached a limit"), icon: "gauge", tone: "warn", needsYou: true };
      if (kind === "private") return { label: t("Can't do this in Private mode"), icon: "lock", tone: "warn", needsYou: true };
      return { label: t("Paused"), icon: "pause", tone: "warn" };
    case "done":
      return { label: t("Done"), icon: "check", tone: "good" };
    case "failed":
      return { label: t("Didn't work out"), icon: "alert", tone: "bad", needsYou: true };
    case "stopped":
      return { label: t("Stopped"), icon: "stop", tone: "neutral" };
    default:
      return { label: m.status, icon: "info", tone: "neutral" };
  }
}

export const isActive = (m) => ["planning", "clarifying", "awaiting_approval", "running", "paused"].includes(m.status);
export const isRunning = (m) => m.status === "running" || m.status === "planning";

export function riskLabel(risk) {
  return { read: t("Reads"), write: t("Changes"), external: t("Sends"), destructive: t("Deletes"), system: t("Runs commands") }[risk] || risk;
}

export function riskHelp(risk) {
  return {
    read: t("It only looks at things."),
    write: t("It creates or changes your files, notes or lists."),
    external: t("It sends or publishes something: an email, a message, an event."),
    destructive: t("It deletes (always to the trash)."),
    system: t("It runs commands on this computer."),
  }[risk] || "";
}

export function roleLabel(role) {
  return { general: t("General"), coding: t("Coding"), writing: t("Writing"), research: t("Research"), vision: t("Vision"), manager: t("Manager (cloud)"), embeddings: t("Embeddings") }[role] || role;
}

// "2 minutes ago", "in 5 minutes", "today at 08:00", "Mon, 19 Oct 08:00"
export function when(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const diff = Date.now() - ms;
  if (diff < 0) {
    const mins = Math.round(-diff / 60000);
    if (mins < 60) return tp("in {n} minute", "in {n} minutes", Math.max(1, mins));
    if (d.toDateString() === new Date().toDateString()) return t("today at {time}", { time: formatTime(d) });
    return `${formatDate(d, { weekday: "short", day: "numeric", month: "short" })} ${formatTime(d)}`;
  }
  const mins = Math.round(diff / 60000);
  if (mins < 1) return t("just now");
  if (mins < 60) return tp("{n} minute ago", "{n} minutes ago", mins);
  if (mins < 24 * 60) return tp("{n} hour ago", "{n} hours ago", Math.round(mins / 60));
  return formatDate(d, { weekday: "short", day: "numeric", month: "short" });
}

export function duration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return tp("{n} second", "{n} seconds", Math.max(1, s));
  const m = Math.round(s / 60);
  return m < 90 ? tp("{n} minute", "{n} minutes", m) : t("{h} h {m} min", { h: Math.floor(m / 60), m: m % 60 });
}
