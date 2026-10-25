// Ready-made boards: a SWOT, a kanban, a mind map, a timeline… The AI (or you) names one and gives its words; this
// lays it out. Every template takes a title and sections ({ title, items }), and returns operations to apply.
import { genId, STICKY_COLORS, color as cleanColor } from "./model.mjs";
import { guessMeasure, estimateTextHeight } from "./text.mjs";
import { outlineToOps } from "./graph.mjs";

export const TEMPLATE_NAMES = [
  "swot", "kanban", "pros_cons", "mind_map", "timeline", "eisenhower", "retro", "meeting_notes", "weekly_plan",
  "comparison", "brainstorm", "cornell_notes", "process", "venn",
  "lesson_plan", "flashcards", "quiz", "glossary", "summary", "faq",
];

export const TEMPLATE_INFO = {
  swot: "Strengths, weaknesses, opportunities, threats (4 sections, in that order).",
  kanban: "Columns of cards; one section per column (default: To do, Doing, Done).",
  pros_cons: "Two columns: section 1 is the pros, section 2 the cons.",
  mind_map: "The title in the middle, sections as branches with their items as leaves.",
  timeline: "A line with events; section 1's items are 'when - what'.",
  eisenhower: "Urgent/important matrix (4 sections: do now, schedule, delegate, drop).",
  retro: "Start / Stop / Continue (3 sections).",
  meeting_notes: "Agenda, notes and action items (3 sections).",
  weekly_plan: "One box per day; one section per day.",
  comparison: "A table: sections are the columns, their items the rows.",
  brainstorm: "The topic in the middle, section 1's items as sticky notes around it.",
  cornell_notes: "Cues, notes and summary (3 sections).",
  process: "Numbered steps with arrows; section 1's items are the steps.",
  venn: "Two overlapping circles: section 1, section 2, and what they share (section 3).",
  lesson_plan: "A lesson: goals, warm-up, steps, practice, recap, homework (up to 6 sections, in that order).",
  flashcards: "Cards with a front and a back: each section is one card (its heading is the front, its items the back).",
  quiz: "A quiz: each section is one question (its heading) with its answer (its items); questions are listed first, answers beside them.",
  glossary: "A table of terms and meanings: each section is one term (its heading) with its meaning (its items).",
  summary: "A summary: key points, takeaways and open questions (3 sections, in that order).",
  faq: "Questions and answers: each section is one question (its heading) with its answer (its items).",
};

// What the page calls them, and a small example of the words each takes (for the layout picker)
export const TEMPLATE_TITLES = {
  swot: "SWOT analysis", kanban: "Kanban board", pros_cons: "Pros and cons", mind_map: "Mind map", timeline: "Timeline", eisenhower: "Priority matrix",
  retro: "Retrospective", meeting_notes: "Meeting notes", weekly_plan: "Week plan", comparison: "Comparison table", brainstorm: "Brainstorm", cornell_notes: "Cornell notes", process: "Process steps", venn: "Venn diagram",
  lesson_plan: "Lesson plan", flashcards: "Flashcards", quiz: "Quiz", glossary: "Glossary", summary: "Summary", faq: "Questions and answers",
};
export const TEMPLATE_EXAMPLES = {
  swot: "Strengths: fast | friendly\nWeaknesses: small team\nOpportunities: new market\nThreats: big competitors",
  kanban: "To do: write intro | find photos\nDoing: edit video\nDone: script",
  pros_cons: "Pros: cheaper | quicker\nCons: riskier",
  mind_map: "Ideas: videos | blog | podcast\nTools: camera | mic",
  timeline: "Events: Jan - Kick-off | Mar - Launch | Jun - Review",
  eisenhower: "Do now: fix bug\nSchedule: plan trip\nDelegate: book hotel\nDrop: scroll feeds",
  retro: "Start: demos\nStop: late meetings\nContinue: pair work",
  meeting_notes: "Agenda: goals | budget\nNotes: agreed to start Monday\nActions: send plan | book room",
  weekly_plan: "Mon: gym | emails\nTue: video shoot\nWed: edit",
  comparison: "Plan A: cheap | slow\nPlan B: pricey | fast",
  brainstorm: "Ideas: a | b | c | d | e",
  cornell_notes: "Cues: key terms\nNotes: the main points\nSummary: one sentence",
  process: "Steps: plan | build | test | ship",
  venn: "A: red | round\nB: sweet | small\nBoth: apple",
  lesson_plan: "Goals: understand fractions | add simple fractions\nWarm-up: share a pizza between 4\nSteps: what is a fraction | numerator and denominator | adding\nPractice: 1/4 + 2/4 | 1/2 + 1/4\nRecap: parts of a whole",
  flashcards: "Numerator: the top number\nDenominator: the bottom number\nImproper fraction: top is bigger than bottom",
  quiz: "What is 1/2 + 1/4?: 3/4\nWhich number is the denominator in 3/5?: 5",
  glossary: "Fraction: a part of a whole\nNumerator: the top number",
  summary: "Key points: a fraction is a part of a whole | the bottom number says how many parts\nTakeaways: add fractions with the same bottom\nOpen questions: what about different bottoms?",
  faq: "What is a fraction?: a part of a whole\nWhy does the bottom number matter?: it says the size of the parts",
};

const INK = "#1e293b";
const items = (s) => (Array.isArray(s?.items) ? s.items.map((x) => String(x ?? "").trim()).filter(Boolean) : []);
const secTitle = (s, fallback) => String(s?.title || fallback || "");

class Builder {
  constructor(x, y) {
    this.ops = [];
    this.ids = {};
    this.x = x;
    this.y = y;
    this.box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  }
  track(x, y, w, h) {
    this.box.minX = Math.min(this.box.minX, x);
    this.box.minY = Math.min(this.box.minY, y);
    this.box.maxX = Math.max(this.box.maxX, x + w);
    this.box.maxY = Math.max(this.box.maxY, y + h);
  }
  add(item, key) {
    const id = genId(item.type);
    this.ops.push({ op: "add", item: { ...item, id } });
    this.track(item.x ?? 0, item.y ?? 0, item.width ?? 0, item.height ?? 0);
    if (key) this.ids[key] = id;
    return id;
  }
  frame(x, y, w, h, title, tint = "#94a3b8") {
    return this.add({ type: "frame", x, y, width: w, height: h, title, color: tint, fillColor: cleanColor(tint) === "transparent" ? "transparent" : tint + "14" });
  }
  text(x, y, w, text, o = {}) {
    const item = { type: "text", x, y, width: w, text, fontSize: o.size || 18, color: o.color || INK, format: o.format || "plain", align: o.align || "left", fontFamily: o.font || "sans", bold: o.bold };
    item.height = Math.max(24, estimateTextHeight(item));
    return this.add(item);
  }
  title(text, w) {
    if (!text) return;
    this.text(this.x, this.y, w, text, { size: 30, bold: true, format: "plain" });
    this.y += 56;
  }
  sticky(x, y, text, i = 0, size = 150) {
    return this.add({ type: "sticky", x, y, width: size, height: size, text, color: STICKY_COLORS[i % STICKY_COLORS.length], tilt: ((i * 7) % 5) - 2 });
  }
  list(x, y, w, lines, o = {}) {
    if (!lines.length) return 0;
    const text = lines.map((l) => (o.plain ? l : `- ${l}`)).join("\n");
    const item = { type: "text", x, y, width: w, text, fontSize: o.size || 18, color: INK, format: "markdown", fontFamily: "sans" };
    item.height = Math.max(24, estimateTextHeight(item));
    this.add(item);
    return item.height;
  }
  result() {
    const b = this.box;
    const bounds = b.minX === Infinity ? { x: this.x, y: this.y, width: 0, height: 0 } : { x: b.minX, y: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY };
    return { ops: this.ops, ids: this.ids, bounds };
  }
}

const TINTS = ["#3b82f6", "#ef4444", "#16a34a", "#f59e0b", "#9333ea", "#0891b2"];

// Four boxes in a grid
function quadrants(b, title, secs, names, tints, w = 440, h = 320) {
  b.title(title, w * 2 + 24);
  const top = b.y;
  names.forEach((name, i) => {
    const x = b.x + (i % 2) * (w + 24);
    const y = top + Math.floor(i / 2) * (h + 24);
    b.frame(x, y, w, h, secTitle(secs[i], name), tints[i]);
    b.list(x + 16, y + 46, w - 32, items(secs[i]), { size: 17 });
  });
}

const BUILDERS = {
  swot(b, { title, sections }) {
    quadrants(b, title || "SWOT analysis", sections, ["Strengths", "Weaknesses", "Opportunities", "Threats"], ["#16a34a", "#ef4444", "#3b82f6", "#f59e0b"]);
  },
  eisenhower(b, { title, sections }) {
    quadrants(b, title || "Priorities", sections, ["Do now", "Schedule", "Delegate", "Drop"], ["#ef4444", "#3b82f6", "#f59e0b", "#6b7280"]);
  },
  kanban(b, { title, sections }) {
    const cols = sections.length ? sections : [{ title: "To do" }, { title: "Doing" }, { title: "Done" }];
    b.title(title || "Kanban board", 900);
    const colW = 250;
    cols.slice(0, 6).forEach((col, c) => {
      const x = b.x + c * (colW + 20);
      const cards = items(col);
      const h = Math.max(300, 70 + cards.length * 166);
      b.frame(x, b.y, colW, h, secTitle(col, `Column ${c + 1}`), TINTS[c % TINTS.length]);
      cards.slice(0, 12).forEach((card, i) => b.sticky(x + 50, b.y + 52 + i * 166, card, c + i, 150));
    });
  },
  retro(b, { title, sections }) {
    BUILDERS.kanban(b, { title: title || "Retrospective", sections: sections.length ? sections.slice(0, 3) : [{ title: "Start" }, { title: "Stop" }, { title: "Continue" }] });
  },
  pros_cons(b, { title, sections }) {
    b.title(title || "Pros and cons", 900);
    const w = 440;
    [[sections[0], "Pros", "#16a34a"], [sections[1], "Cons", "#ef4444"]].forEach(([sec, name, tint], i) => {
      const x = b.x + i * (w + 24);
      const lines = items(sec);
      const h = Math.max(280, 70 + lines.length * 46);
      b.frame(x, b.y, w, h, secTitle(sec, name), tint);
      b.list(x + 16, b.y + 46, w - 32, lines, { size: 19 });
    });
  },
  comparison(b, { title, sections }) {
    const cols = sections.slice(0, 8);
    const rows = Math.max(0, ...cols.map((c) => items(c).length));
    b.title(title || "Comparison", 900);
    const headers = cols.map((c, i) => secTitle(c, `Option ${i + 1}`));
    const body = Array.from({ length: rows }, (_, r) => cols.map((c) => items(c)[r] || ""));
    b.add({ type: "table", x: b.x, y: b.y, width: Math.max(360, cols.length * 200), height: 44 + (rows + 1) * 40, headers, rows: body });
  },
  mind_map(b, { title, sections }) {
    const root = { text: title || "Mind map", children: sections.map((s) => ({ text: secTitle(s, ""), children: items(s).map((t) => ({ text: t, children: [] })) })).filter((n) => n.text || n.children.length) };
    const made = outlineToOps(root, { style: "mindmap", x: b.x, y: b.y });
    for (const op of made.ops) { b.ops.push(op); if (op.item?.width) b.track(op.item.x, op.item.y, op.item.width, op.item.height); }
  },
  brainstorm(b, { title, sections }) {
    const ideas = sections.flatMap(items).slice(0, 24);
    const cx = b.x + 520, cy = b.y + 330;
    const topic = b.add({ type: "shape", shapeType: "ellipse", x: cx - 130, y: cy - 60, width: 260, height: 120, label: title || "Brainstorm", fillColor: "#c7d2fe", strokeColor: INK, strokeWidth: 3, fontSize: 22, labelColor: INK });
    ideas.forEach((idea, i) => {
      const a = (i / Math.max(ideas.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const rx = 430, ry = 290;
      const id = b.sticky(cx + Math.cos(a) * rx - 75, cy + Math.sin(a) * ry - 75, idea, i, 150);
      b.ops.push({ op: "add", item: { type: "shape", shapeType: "connector", from: { id: topic }, to: { id }, route: "curve", strokeColor: "#64748b", strokeWidth: 2, arrowEnd: false } });
    });
  },
  timeline(b, { title, sections }) {
    b.title(title || "Timeline", 900);
    const events = items(sections[0]).slice(0, 12).map((e) => {
      const m = /^(.{1,24}?)\s+[-–—:]\s+(.*)$/.exec(e);
      return m ? { when: m[1], what: m[2] } : { when: "", what: e };
    });
    const y = b.y + 230;
    const step = Math.min(210, Math.max(130, 1300 / Math.max(events.length, 1)));
    const width = Math.max(400, events.length * step + 60);
    b.add({ type: "shape", shapeType: "arrow", points: [{ x: b.x, y }, { x: b.x + width, y }], strokeColor: INK, strokeWidth: 4, arrowEnd: true });
    events.forEach((ev, i) => {
      const x = b.x + 60 + i * step;
      b.add({ type: "shape", shapeType: "circle", x: x - 9, y: y - 9, width: 18, height: 18, fillColor: TINTS[i % TINTS.length], strokeColor: INK, strokeWidth: 2 });
      const up = i % 2 === 0;
      if (ev.when) b.text(x - 70, up ? y - 70 : y + 22, 140, ev.when, { size: 18, bold: true, align: "center" });
      b.text(x - 80, up ? y - 70 - Math.min(110, estimateTextHeight({ text: ev.what, width: 160, fontSize: 16, format: "plain" })) + (ev.when ? -26 : 0) : y + 22 + (ev.when ? 28 : 0), 160, ev.what, { size: 16, align: "center" });
    });
  },
  meeting_notes(b, { title, sections }) {
    b.title(title || "Meeting notes", 1100);
    const [agenda, notes, actions] = sections;
    const top = b.y;
    b.frame(b.x, top, 340, 420, secTitle(agenda, "Agenda"), "#3b82f6");
    b.list(b.x + 16, top + 46, 308, items(agenda), { size: 17 });
    b.frame(b.x + 364, top, 440, 420, secTitle(notes, "Notes"), "#16a34a");
    b.list(b.x + 380, top + 46, 408, items(notes), { size: 17 });
    b.frame(b.x + 828, top, 340, 420, secTitle(actions, "Action items"), "#f59e0b");
    b.add({ type: "checklist", x: b.x + 844, y: top + 46, width: 308, height: 60 + Math.max(2, items(actions).length) * 32, title: "To do", items: items(actions).map((t) => ({ text: t })) });
  },
  cornell_notes(b, { title, sections }) {
    b.title(title || "Notes", 1100);
    const [cues, notes, summary] = sections;
    const top = b.y;
    b.frame(b.x, top, 300, 520, secTitle(cues, "Cues"), "#9333ea");
    b.list(b.x + 16, top + 46, 268, items(cues), { size: 17 });
    b.frame(b.x + 320, top, 700, 520, secTitle(notes, "Notes"), "#3b82f6");
    b.list(b.x + 336, top + 46, 668, items(notes), { size: 17 });
    b.frame(b.x, top + 540, 1020, 150, secTitle(summary, "Summary"), "#16a34a");
    b.list(b.x + 16, top + 584, 988, items(summary), { size: 17 });
  },
  weekly_plan(b, { title, sections }) {
    b.title(title || "Week plan", 1100);
    const days = sections.length ? sections.slice(0, 7) : ["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => ({ title: d }));
    const w = Math.min(230, Math.floor(1300 / days.length) - 12);
    days.forEach((day, i) => {
      const x = b.x + i * (w + 12);
      b.frame(x, b.y, w, 420, secTitle(day, `Day ${i + 1}`), TINTS[i % TINTS.length]);
      b.list(x + 12, b.y + 46, w - 24, items(day), { size: 16 });
    });
  },
  process(b, { title, sections }) {
    b.title(title || "Process", 900);
    const steps = items(sections[0]).slice(0, 10);
    const w = 320, h = 64, gap = 54;
    let prev = null;
    steps.forEach((s, i) => {
      const id = b.add({ type: "shape", shapeType: "round_rect", x: b.x, y: b.y + i * (h + gap), width: w, height: h, label: `${i + 1}. ${s}`, fillColor: STICKY_COLORS[i % STICKY_COLORS.length], strokeColor: INK, strokeWidth: 2, fontSize: 18, labelColor: INK });
      if (prev) b.ops.push({ op: "add", item: { type: "shape", shapeType: "connector", from: { id: prev, port: "bottom" }, to: { id, port: "top" }, route: "straight", strokeColor: INK, strokeWidth: 2, arrowEnd: true } });
      prev = id;
    });
  },
  venn(b, { title, sections }) {
    b.title(title || "Venn diagram", 900);
    const [a, bb, both] = sections;
    const top = b.y;
    const r = 210;
    b.add({ type: "shape", shapeType: "circle", x: b.x, y: top, width: r * 2, height: r * 2, fillColor: "#3b82f633", strokeColor: "#3b82f6", strokeWidth: 3 });
    b.add({ type: "shape", shapeType: "circle", x: b.x + r * 1.1, y: top, width: r * 2, height: r * 2, fillColor: "#ef444433", strokeColor: "#ef4444", strokeWidth: 3 });
    b.text(b.x + 20, top + 70, 170, secTitle(a, "A"), { size: 22, bold: true, align: "center" });
    b.list(b.x + 30, top + 110, 160, items(a), { size: 16 });
    b.text(b.x + r * 1.1 + 235, top + 70, 170, secTitle(bb, "B"), { size: 22, bold: true, align: "center" });
    b.list(b.x + r * 1.1 + 245, top + 110, 160, items(bb), { size: 16 });
    b.text(b.x + r * 0.55 + 90, top + 100, 150, secTitle(both, "Both"), { size: 20, bold: true, align: "center" });
    b.list(b.x + r * 0.55 + 100, top + 140, 140, items(both), { size: 16 });
  },
};

Object.assign(BUILDERS, {
  lesson_plan(b, { title, sections }) {
    const names = ["Goals", "Warm-up", "Steps", "Practice", "Recap", "Homework"];
    const secs = sections.slice(0, 6);
    const w = 400, h = 330;
    b.title(title || "Lesson plan", 3 * (w + 24));
    const top = b.y;
    const count = Math.max(secs.length, 3);
    for (let i = 0; i < count; i++) {
      const x = b.x + (i % 3) * (w + 24);
      const y = top + Math.floor(i / 3) * (h + 24);
      const lines = items(secs[i]);
      b.frame(x, y, w, h, secTitle(secs[i], names[i]), TINTS[i % TINTS.length]);
      // The steps are numbered, the rest are bullets
      const numbered = /step/i.test(secTitle(secs[i], names[i]));
      b.list(x + 16, y + 46, w - 32, numbered ? lines.map((l, k) => `${k + 1}. ${l}`) : lines, { size: 17, plain: numbered });
    }
  },
  flashcards(b, { title, sections }) {
    const cards = sections
      .flatMap((s) => (s.title ? [{ q: s.title, a: items(s).join("; ") }] : items(s).map((l) => ({ q: l, a: "" }))))
      .slice(0, 30);
    b.title(title || "Flashcards", 1100);
    const top = b.y;
    cards.forEach((card, i) => {
      const x = b.x + (i % 3) * 520;
      const y = top + Math.floor(i / 3) * 190;
      b.add({ type: "sticky", x, y, width: 230, height: 160, text: card.q, color: STICKY_COLORS[0], tilt: 0 });
      b.add({ type: "sticky", x: x + 250, y, width: 230, height: 160, text: card.a || "…", color: STICKY_COLORS[1], tilt: 0 });
    });
  },
  quiz(b, { title, sections }) {
    const qs = sections.filter((s) => s.title || items(s).length).slice(0, 20);
    b.title(title || "Quiz", 1100);
    const top = b.y;
    const rows = qs.map((s, i) => `${i + 1}. ${s.title || items(s)[0] || ""}`);
    b.frame(b.x, top, 640, Math.max(220, 70 + rows.length * 54), "Questions", "#3b82f6");
    b.text(b.x + 16, top + 46, 608, rows.join("\n\n"), { size: 19 });
    const answers = qs.map((s, i) => `${i + 1}. ${s.title ? items(s).join("; ") : ""}`.trim());
    b.frame(b.x + 664, top, 420, Math.max(220, 70 + rows.length * 54), "Answers", "#16a34a");
    b.text(b.x + 680, top + 46, 388, answers.join("\n\n"), { size: 19 });
  },
  glossary(b, { title, sections }) {
    const rows = sections.map((s) => [s.title || items(s)[0] || "", s.title ? items(s).join("; ") : items(s).slice(1).join("; ")]).filter((r) => r[0]).slice(0, 40);
    b.title(title || "Glossary", 900);
    b.add({ type: "table", x: b.x, y: b.y, width: 760, height: 44 + (rows.length + 1) * 44, headers: ["Term", "Meaning"], rows });
  },
  summary(b, { title, sections }) {
    const names = ["Key points", "Takeaways", "Open questions"];
    const secs = sections.slice(0, 3);
    const w = 400, h = 340;
    b.title(title || "Summary", 3 * (w + 24));
    const top = b.y;
    for (let i = 0; i < Math.max(secs.length, 2); i++) {
      const x = b.x + i * (w + 24);
      b.frame(x, top, w, h, secTitle(secs[i], names[i]), TINTS[i % TINTS.length]);
      b.list(x + 16, top + 46, w - 32, items(secs[i]), { size: 18 });
    }
  },
  faq(b, { title, sections }) {
    const qs = sections.filter((s) => s.title).slice(0, 12);
    b.title(title || "Questions and answers", 1100);
    const top = b.y;
    const w = 520;
    const heights = [0, 0];
    qs.forEach((s, i) => {
      const col = i % 2;
      const answer = items(s).join("\n");
      const hgt = Math.max(130, 64 + estimateTextHeight({ text: answer, width: w - 32, fontSize: 17, format: "plain" }));
      const x = b.x + col * (w + 24);
      b.frame(x, top + heights[col], w, hgt, s.title, TINTS[i % TINTS.length]);
      b.text(x + 16, top + heights[col] + 46, w - 32, answer, { size: 17 });
      heights[col] += hgt + 24;
    });
  },
});

// sections can arrive as a list, as JSON text, or as lines "Heading: one | two | three"
export function parseSections(input) {
  if (Array.isArray(input)) {
    return input.map((s) => (typeof s === "string" ? { title: s, items: [] } : { title: String(s?.title ?? s?.name ?? ""), items: Array.isArray(s?.items) ? s.items : typeof s?.items === "string" ? splitItems(s.items) : [] })).slice(0, 12);
  }
  if (input && typeof input === "object") return parseSections(Object.entries(input).map(([title, v]) => ({ title, items: Array.isArray(v) ? v : typeof v === "string" ? splitItems(v) : [] })));
  const text = String(input ?? "").trim();
  if (!text) return [];
  if (/^[[{]/.test(text)) {
    try {
      return parseSections(JSON.parse(text));
    } catch { /* plain lines */ }
  }
  return text.split(/\n+/).map((line) => {
    const m = /^\s*(?:[-*#\d.)]+\s*)?([^:|]{1,60}):\s*(.*)$/.exec(line);
    return m ? { title: m[1].trim(), items: splitItems(m[2]) } : { title: "", items: splitItems(line) };
  }).filter((s) => s.title || s.items.length).slice(0, 12);
}

const splitItems = (s) => String(s).split(/\s*[|;]\s*|\s*,\s+(?=[A-Z0-9])/).map((x) => x.trim()).filter(Boolean);

// name: a template; params: { title, sections, x, y }
export function buildTemplate(name, params = {}) {
  const key = String(name || "").toLowerCase().replace(/[\s-]+/g, "_");
  const build = BUILDERS[key];
  if (!build) throw new Error(`Unknown template "${String(name).slice(0, 30)}". Use one of: ${TEMPLATE_NAMES.join(", ")}.`);
  const b = new Builder(Number.isFinite(params.x) ? params.x : 80, Number.isFinite(params.y) ? params.y : 60);
  build(b, { title: params.title ? String(params.title).slice(0, 100) : "", sections: parseSections(params.sections) });
  return { template: key, ...b.result() };
}

export { guessMeasure };
