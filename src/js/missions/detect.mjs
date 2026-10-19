// Does a message sound like a goal or a plan to carry out in the background (a mission), rather than a question or
// a chat? A cheap guess, so the page (and Telegram) can offer "Make this a mission?"; it never starts one by itself.
// Plain module: the page and the helper both use it (test/missions-detect.test.js).

const VERBS = new RegExp(
  [
    // English
    "research", "find out", "investigate", "compare", "look into", "write (me )?(a|an|the) (report|summary|article|script|program|app|tool|overview|brief)",
    "build (me )?(a|an|the)", "create (me )?(a|an|the) (project|app|website|script|tool|program|folder structure)", "organi[sz]e", "clean up", "go through", "collect",
    "sort (my|the|all)", "rename (all|my|the)", "convert (all|my|the)", "batch", "monitor", "keep an eye on", "every (morning|day|evening|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)",
    "draft and send", "send (an? |the )?(email|mail|message)s? to", "set up (a|an|the)", "step by step", "and then",
    // Deutsch
    "recherchier", "finde heraus", "vergleich", "schreib(e)? (mir )?(einen|eine|ein) (bericht|zusammenfassung|artikel|skript|programm|app)", "bau(e)? (mir )?(ein|eine|einen)", "erstell(e)? (mir )?(ein|eine|einen)",
    "sortier", "räum", "organisier", "überwach", "jeden (morgen|tag|abend|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)", "schick(e)? (eine |die )?(mail|e-mail|nachricht)", "und dann",
    // العربية
    "ابحث", "قارن", "اكتب (لي )?(تقرير|ملخص|برنامج|سكربت)", "ابنِ", "أنشئ", "رتّب", "رتب", "نظّم", "راقب", "كل (صباح|يوم|أسبوع)",
  ].join("|"),
  "iu"
);

// text: what was written. Returns true when it looks like a mission.
export function looksLikeMission(text) {
  const t = String(text || "").trim();
  if (t.length < 25) return false;
  if (/^\/?mission\b/i.test(t)) return true;
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  const listed = lines.filter((l) => /^(\d+[.)]|[-*•])\s+\S/.test(l)).length;
  // A pasted plan: a list of at least three things
  if (listed >= 3 && t.length > 50) return true;
  const question = /[?؟]\s*$/.test(t) && t.length < 140 && lines.length < 3;
  if (question) return false;
  const long = t.length > 100 || lines.length >= 3;
  return long && VERBS.test(t);
}
