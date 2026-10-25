// What the AI sees of the board: not pixels, but a short written account of what is where, who made it, what you
// are doing on it right now and what changed since it last looked. It goes into every reply's instructions,
// into voice mode's setup, and back from the AI's whiteboard tools, so it is never working from a stale picture.
// Pure; the helper uses it (and the tests).
import { COLOR_NAMES, getBoundingBox, itemLabel } from "./model.mjs";
import { freeRegions, CANVAS } from "./arrange.mjs";

// Pale sticky-note colors get their own names, or "pink" paper would be called white
const PALE = { "pale yellow": "#fef08a", "pale blue": "#bae6fd", "pale green": "#bbf7d0", "pale pink": "#fbcfe8", "pale orange": "#fed7aa", "pale purple": "#e9d5ff", cream: "#fef3c7" };
const NAMED = [...Object.entries(COLOR_NAMES).filter(([k, v]) => v !== "transparent" && !["grey", "none", "mint", "peach", "lavender", "sky", "cream", "beige"].includes(k)), ...Object.entries(PALE)];

function rgb(hex) {
  const m = /^#([0-9a-f]{6})/i.exec(hex || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// "#dc2626" → "red"
export function colorName(hex) {
  const a = rgb(hex);
  if (!a) return "";
  let best = "";
  let bestD = Infinity;
  for (const [name, h] of NAMED) {
    const b = rgb(h);
    const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

const q = (s, n = 70) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const pt = (x, y) => `(${Math.round(x)}, ${Math.round(y)})`;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- Ink: what the pen strokes are ----------
export function classifyStroke(stroke) {
  const pts = stroke.points || [];
  const bb = getBoundingBox(stroke);
  if (pts.length < 2) return { kind: "dot", bb };
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += dist(pts[i - 1], pts[i]);
  const chord = dist(pts[0], pts[pts.length - 1]);
  const w = bb.width, h = bb.height;
  if (length < 14) return { kind: "dot", bb };
  if (chord < 0.28 * length && w > 28 && h > 28) return { kind: "loop", bb };
  if (chord / length > 0.88) {
    if (Math.abs(pts[pts.length - 1].y - pts[0].y) < 0.18 * Math.abs(pts[pts.length - 1].x - pts[0].x)) return { kind: "horizontal line", bb };
    if (Math.abs(pts[pts.length - 1].x - pts[0].x) < 0.18 * Math.abs(pts[pts.length - 1].y - pts[0].y)) return { kind: "vertical line", bb };
    return { kind: "diagonal line", bb };
  }
  return { kind: "scribble", bb };
}

const overlapX = (a, b) => Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) / Math.max(1, Math.min(a.width, b.width));

// Neighbouring strokes (close in space) are one drawing
function groupStrokes(strokes) {
  const groups = [];
  for (const s of strokes) {
    const bb = getBoundingBox(s);
    const near = groups.find((g) => !(bb.maxX < g.bb.minX - 30 || bb.minX > g.bb.maxX + 30 || bb.maxY < g.bb.minY - 30 || bb.minY > g.bb.maxY + 30));
    if (near) {
      near.strokes.push(s);
      near.bb = { minX: Math.min(near.bb.minX, bb.minX), minY: Math.min(near.bb.minY, bb.minY), maxX: Math.max(near.bb.maxX, bb.maxX), maxY: Math.max(near.bb.maxY, bb.maxY) };
    } else groups.push({ strokes: [s], bb: { minX: bb.minX, minY: bb.minY, maxX: bb.maxX, maxY: bb.maxY } });
  }
  return groups;
}

// ---------- One item, in a line ----------
function who(it, user) {
  return it.author === "ai" ? "by you" : it.author === "mission" ? "by a mission" : `by ${user}`;
}

function describeItem(it, { user, frames, byId }) {
  const b = getBoundingBox(it);
  const where = `at ${pt(b.minX, b.minY)} ${Math.round(b.width)}×${Math.round(b.height)}`;
  const tag = `[${it.id}]`;
  const by = who(it, user);
  const lock = it.locked ? ", locked" : "";
  const inFrame = frames.find((f) => f.id !== it.id && b.cx >= f.minX && b.cx <= f.maxX && b.cy >= f.minY && b.cy <= f.maxY);
  const place = inFrame ? `, in frame [${inFrame.id}]` : "";
  switch (it.type) {
    case "text":
      if (it.format === "math") return `${tag} formula "${q(it.text, 90)}" ${where} ${by}${lock}`;
      if (it.format === "code") return `${tag} code${it.language ? ` (${it.language})` : ""} "${q(it.text.split("\n")[0], 60)}" ${it.text.split("\n").length} lines ${where} ${by}${lock}`;
      return `${tag} text "${q(it.text, 110)}"${it.fontSize >= 30 ? " (large)" : ""} ${where} ${by}${lock}${place}`;
    case "sticky":
      return `${tag} sticky note (${colorName(it.color) || "pale"}) "${q(it.title ? `${it.title}: ${it.text}` : it.text, 110)}" ${where} ${by}${lock}${place}`;
    case "shape": {
      if (it.shapeType === "connector") {
        const from = it.from ? `[${it.from.id}]` : pt(it.points?.[0]?.x ?? it.x, it.points?.[0]?.y ?? it.y);
        const to = it.to ? `[${it.to.id}]` : pt(it.points?.at(-1)?.x ?? it.x, it.points?.at(-1)?.y ?? it.y);
        void byId;
        return `${tag} connector ${from} → ${to}${it.label ? ` "${q(it.label, 40)}"` : ""} ${by}${lock}`;
      }
      if (["line", "arrow", "double_arrow"].includes(it.shapeType)) {
        const a = it.points?.[0] || { x: it.x, y: it.y };
        const z = it.points?.at(-1) || { x: it.x + it.width, y: it.y + it.height };
        return `${tag} ${it.shapeType === "line" ? "line" : "arrow"} from ${pt(a.x, a.y)} to ${pt(z.x, z.y)} ${by}${lock}`;
      }
      const fill = it.fillColor && it.fillColor !== "transparent" ? colorName(it.fillColor) : "";
      return `${tag} ${fill ? `${fill} ` : ""}${it.shapeType.replace("_", " ")}${it.label ? ` "${q(it.label, 70)}"` : ""} ${where} ${by}${lock}${place}`;
    }
    case "checklist": {
      const rows = (it.items || []).slice(0, 14).map((c) => `${c.checked ? "[x]" : "[ ]"} ${q(c.text, 50)}`).join("; ");
      const more = (it.items || []).length > 14 ? `; … ${it.items.length - 14} more` : "";
      return `${tag} checklist "${q(it.title, 50)}" ${where} ${by}${lock}${place}: ${rows}${more}`;
    }
    case "table":
      return `${tag} table${it.title ? ` "${q(it.title, 40)}"` : ""} ${(it.headers || []).length} columns × ${(it.rows || []).length} rows, headers: ${(it.headers || []).map((h) => q(h, 24)).join(" | ")} ${where} ${by}${lock}${place}`;
    case "image":
      return `${tag} picture${it.caption ? ` "${q(it.caption, 50)}"` : ""} ${where} ${by}${lock}${place}`;
    case "diagram":
      return `${tag} diagram (${it.syntax}) "${q(it.code.split("\n")[0], 70)}" ${where} ${by}${lock}${place}`;
    case "frame":
      return `${tag} frame "${q(it.title, 60)}" ${where} ${by}${lock}`;
    default:
      return `${tag} ${it.type} ${where}`;
  }
}

function describeInk(group, items, user) {
  const first = group.strokes[0];
  const authors = [...new Set(group.strokes.map((s) => s.author))];
  const by = authors.length === 1 ? who(first, user) : "by both of you";
  const n = group.strokes.length;
  const bb = group.bb;
  const w = Math.round(bb.maxX - bb.minX), h = Math.round(bb.maxY - bb.minY);
  const ink = colorName(first.color);
  const head = `[${first.id}${n > 1 ? `+${n - 1}` : ""}]`;
  if (n === 1) {
    const c = classifyStroke(first);
    let extra = "";
    if (c.kind === "loop") {
      const inside = items.filter((it) => it.type !== "stroke" && it.type !== "frame").filter((it) => {
        const ib = getBoundingBox(it);
        return ib.cx >= bb.minX && ib.cx <= bb.maxX && ib.cy >= bb.minY && ib.cy <= bb.maxY;
      }).map((it) => it.id);
      if (inside.length) extra = `, circling ${inside.slice(0, 6).map((i) => `[${i}]`).join(" ")}`;
    } else if (c.kind === "horizontal line") {
      const under = items.filter((it) => it.type !== "stroke" && it.type !== "frame").filter((it) => {
        const ib = getBoundingBox(it);
        return bb.minY >= ib.maxY - 6 && bb.minY <= ib.maxY + 26 && overlapX(bb, ib) > 0.5;
      }).map((it) => it.id);
      if (under.length) extra = `, underlining ${under.slice(0, 4).map((i) => `[${i}]`).join(" ")}`;
    }
    return `${head} ${ink ? `${ink} ` : ""}pen ${c.kind} spanning ${pt(bb.minX, bb.minY)} ${w}×${h} ${by}${extra}`;
  }
  return `${head} ${ink ? `${ink} ` : ""}freehand drawing of ${n} strokes spanning ${pt(bb.minX, bb.minY)} ${w}×${h} ${by}`;
}

// ---------- The whole board ----------
const ago = (ms) => (ms < 1500 ? "just now" : ms < 60000 ? `${Math.round(ms / 1000)} s ago` : `${Math.round(ms / 60000)} min ago`);

// opts: { pageIndex, user (name), presence: { user, ai }, changes: [entries], maxChars, now, rev }
export function describeBoard(doc, opts = {}) {
  const user = opts.user || "the user";
  const max = opts.maxChars || 3500;
  const now = opts.now || Date.now();
  const pages = doc.pages || [];
  const pi = Math.max(0, Math.min(pages.length - 1, Number.isInteger(opts.pageIndex) ? opts.pageIndex : doc.activePageIndex || 0));
  const page = pages[pi] || { items: [], name: "" };
  const lines = [];
  lines.push(`Whiteboard "${q(doc.title, 60)}" (${doc.id}), page ${pi + 1} of ${pages.length} "${q(page.name, 40)}". The canvas is ${CANVAS.width}×${CANVAS.height}; x grows to the right, y downward, (0, 0) is the top-left corner.`);
  if (pages.length > 1) lines.push(`Pages: ${pages.map((p, i) => `${i + 1}. ${q(p.name, 24)} (${p.items.length})`).join(", ")}.`);

  const items = page.items || [];
  const frames = items.filter((it) => it.type === "frame").map((f) => ({ id: f.id, ...getBoundingBox(f) }));
  const strokes = items.filter((it) => it.type === "stroke");
  const others = items.filter((it) => it.type !== "stroke");
  const byId = new Map(items.map((it) => [it.id, it]));

  if (!items.length) {
    lines.push("The page is empty.");
  } else {
    lines.push(`${items.length} item${items.length === 1 ? "" : "s"} on this page:`);
    // Reading order: frames first, then top to bottom in bands of 60 px, left to right
    const order = [...others].sort((a, b) => {
      if ((a.type === "frame") !== (b.type === "frame")) return a.type === "frame" ? -1 : 1;
      const ba = getBoundingBox(a), bb = getBoundingBox(b);
      const band = Math.round(ba.minY / 60) - Math.round(bb.minY / 60);
      return band || ba.minX - bb.minX;
    });
    const budget = max - 700;
    let used = lines.join("\n").length;
    let shown = 0;
    for (const it of order) {
      const line = `- ${describeItem(it, { user, frames, byId })}`;
      if (used + line.length > budget) break;
      lines.push(line);
      used += line.length + 1;
      shown++;
    }
    for (const g of groupStrokes(strokes)) {
      const line = `- ${describeInk(g, others, user)}`;
      if (used + line.length > budget) break;
      lines.push(line);
      used += line.length + 1;
      shown++;
    }
    const total = others.length + groupStrokes(strokes).length;
    if (shown < total) lines.push(`- … and ${total - shown} more (call whiteboard_read_board to see everything).`);
    const free = freeRegions(page);
    if (free.length) lines.push(`Free space (x, y, width×height): ${free.map((r) => `${pt(r.x, r.y)} ${r.width}×${r.height}`).join("; ")}.`);
  }

  const p = opts.presence?.user;
  if (p) {
    const bits = [];
    if (p.page !== undefined && p.page !== pi) bits.push(`is looking at page ${p.page + 1}`);
    else bits.push("is looking at this page");
    if (p.selection?.length) bits.push(`has selected ${p.selection.slice(0, 6).map((i) => `[${i}]`).join(" ")}`);
    if (p.pointer) bits.push(`pointer near ${pt(p.pointer.x, p.pointer.y)}${p.pointerAt ? ` ${ago(now - p.pointerAt)}` : ""}`);
    if (p.tool && p.tool !== "select") bits.push(`tool: ${p.tool}`);
    if (p.drawingAt && now - p.drawingAt < 8000) bits.push("is drawing right now");
    lines.push(`${user} ${bits.join("; ")}.`);
  }
  const changes = formatChanges(opts.changes || [], { user, now });
  if (changes) lines.push(changes);
  return lines.join("\n");
}

// "Since you last looked: …" from the helper's change log entries
export function formatChanges(entries, { user = "the user", now = Date.now(), limit = 14 } = {}) {
  const bits = [];
  for (const e of entries) {
    const who = e.actor === "ai" ? "you" : e.actor === "mission" ? "a mission" : user;
    for (const b of e.briefs || []) {
      if (b.verb === "moved") bits.push(`${who} moved ${b.count} item${b.count === 1 ? "" : "s"}`);
      else if (b.verb === "cleared") bits.push(`${who} cleared ${b.count} items`);
      else if (b.verb === "ticked" || b.verb === "unticked") bits.push(`${who} ${b.verb} "${q(b.line, 40)}" in checklist [${b.id}]`);
      else if (b.verb === "changed") bits.push(`${who} changed ${b.type} [${b.id}]${b.label ? ` "${q(b.label, 40)}"` : ""}${b.fields?.length ? ` (${b.fields.slice(0, 4).join(", ")})` : ""}`);
      else bits.push(`${who} ${b.verb} ${b.type} [${b.id}]${b.label ? ` "${q(b.label, 40)}"` : ""}`);
    }
  }
  if (!bits.length) return "";
  // The same thing said twice in a row is said once
  const unique = bits.filter((b, i) => b !== bits[i - 1]);
  const shown = unique.slice(-limit);
  const note = unique.length > limit ? `(${unique.length - limit} earlier changes left out) ` : "";
  void now;
  return `Changes since you last looked: ${note}${shown.join("; ")}.`;
}

// An item by its id, the start of its id, or the words in it (the AI is not always exact)
export function findByRef(doc, ref, { pageIndex } = {}) {
  const r = String(ref ?? "").trim();
  if (!r) return null;
  const pages = doc.pages || [];
  const first = pages[Number.isInteger(pageIndex) ? pageIndex : doc.activePageIndex || 0];
  const order = first ? [first, ...pages.filter((p) => p !== first)] : pages;
  const clean = r.replace(/^\[|\]$/g, "");
  for (const page of order) {
    const hit = page.items.find((it) => it.id === clean);
    if (hit) return { item: hit, page };
  }
  if (clean.length >= 3) {
    const starts = [];
    for (const page of order) for (const it of page.items) if (it.id.startsWith(clean)) starts.push({ item: it, page });
    if (starts.length === 1) return starts[0];
  }
  const needle = clean.toLowerCase();
  const words = [];
  for (const page of order) {
    for (const it of page.items) {
      const label = (itemLabel(it, 200) || "").toLowerCase();
      if (!label) continue;
      if (label === needle) return { item: it, page };
      if (label.includes(needle)) words.push({ item: it, page });
    }
  }
  return words.length === 1 ? words[0] : words[0] && needle.length >= 4 ? words[0] : null;
}
