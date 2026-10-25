// Text on the board: word wrapping, a little Markdown (bold, italic, `code`, lists, headings, quotes), code
// colors, and a guess at how big text will be before it is drawn (for the AI and the helper, which can't measure).
// Pure: the page hands in a measure() from the canvas, everyone else uses the guess.

// Roughly how wide a character is, in em, for fonts that are not known
function charEm(ch, mono) {
  if (mono) return 0.6;
  const c = ch.codePointAt(0);
  if (c === 32) return 0.28;
  if (c >= 0x1100 && (c <= 0x11ff || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xff00 && c <= 0xffef))) return 1;
  if (c >= 0x1f300) return 1.1; // emoji
  if (c >= 0x0600 && c <= 0x06ff) return 0.5;
  if (/[A-Z]/.test(ch)) return 0.64;
  if (/[a-z]/.test(ch)) return 0.5;
  if (/[0-9]/.test(ch)) return 0.56;
  if (/[iljtf.,;:'!|]/.test(ch)) return 0.3;
  if (/[mwMW@%]/.test(ch)) return 0.82;
  return 0.55;
}

// A measure() that needs no canvas: (text, { size, mono, bold }) → width in pixels
export function guessMeasure(text, style = {}) {
  const size = style.size || 20;
  let em = 0;
  for (const ch of String(text)) em += charEm(ch, style.mono);
  return em * size * (style.bold ? 1.06 : 1);
}

const CJK = /[⺀-꓏가-힯＀-￯]/;

// Breaks one paragraph into lines no wider than maxWidth. Words stay whole unless one alone is too wide.
export function wrapLine(text, maxWidth, measure, style = {}) {
  const out = [];
  const w = (s) => measure(s, style);
  const words = String(text).split(/(\s+)/).filter((s) => s !== "");
  let line = "";
  const push = () => {
    out.push(line.replace(/\s+$/, ""));
    line = "";
  };
  for (const word of words) {
    if (/^\s+$/.test(word)) {
      if (line) line += " ";
      continue;
    }
    if (w(line + word) <= maxWidth || !line) {
      if (w(word) > maxWidth) {
        // A word wider than the line (a long URL, Chinese): break it by characters
        for (const ch of Array.from(word)) {
          if (w(line + ch) > maxWidth && line) push();
          line += ch;
        }
      } else {
        line += word;
      }
    } else {
      push();
      if (w(word) > maxWidth) {
        for (const ch of Array.from(word)) {
          if (w(line + ch) > maxWidth && line) push();
          line += ch;
        }
      } else {
        line = word;
      }
    }
  }
  if (line || !out.length) push();
  void CJK;
  return out;
}

// ---------- Markdown-lite ----------
// Inline: **bold**, *italic* / _italic_, `code`, ~~strike~~, [[a link to a board]]. Returns runs: { text, bold, italic, code, strike, link }
const WIKI_START = /^\[\[([^[\]\n|#]{1,120}?)(?:#[^[\]\n|]{0,80})?(?:\|([^[\]\n]{0,80}))?\]\]/;
export function parseInline(text) {
  let link = null;
  const runs = [];
  let bold = false, italic = false, strike = false;
  let buf = "";
  const flush = () => {
    if (buf) runs.push({ text: buf, bold, italic, strike });
    buf = "";
  };
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const two = s.slice(i, i + 2);
    if (ch === "\\" && i + 1 < s.length) {
      buf += s[++i];
    } else if (ch === "`") {
      const end = s.indexOf("`", i + 1);
      if (end > i) {
        flush();
        runs.push({ text: s.slice(i + 1, end), code: true });
        i = end;
      } else buf += ch;
    } else if (two === "[[" && (link = WIKI_START.exec(s.slice(i))) && link[1].trim()) {
      // [[Another board]] or [[Another board|its words]]: a link to a board
      flush();
      runs.push({ text: (link[2] || link[1]).trim(), bold, italic, link: link[1].trim() });
      i += link[0].length - 1;
    } else if (two === "**") {
      flush();
      bold = !bold;
      i++;
    } else if (two === "~~") {
      flush();
      strike = !strike;
      i++;
    } else if ((ch === "*" || ch === "_") && (i === 0 || /[\s([{>]/.test(s[i - 1]) || italic) && (italic || /\S/.test(s[i + 1] || ""))) {
      flush();
      italic = !italic;
    } else buf += ch;
  }
  flush();
  return runs;
}

// Blocks: heading (1-3), paragraph, bullet / numbered item, quote, code fence, rule
export function parseBlocks(text) {
  const blocks = [];
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim();
      const body = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) body.push(lines[i++]);
      blocks.push({ kind: "code", lang, lines: body });
    } else if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
      blocks.push({ kind: "heading", level: m[1].length, runs: parseInline(m[2]) });
    } else if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
    } else if ((m = /^(\s*)(?:[-*+•])\s+(.*)$/.exec(line))) {
      blocks.push({ kind: "bullet", depth: Math.floor(m[1].replace(/\t/g, "  ").length / 2), runs: parseInline(m[2]) });
    } else if ((m = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line))) {
      blocks.push({ kind: "number", depth: Math.floor(m[1].replace(/\t/g, "  ").length / 2), n: Number(m[2]), runs: parseInline(m[3]) });
    } else if ((m = /^>\s?(.*)$/.exec(line))) {
      blocks.push({ kind: "quote", runs: parseInline(m[1]) });
    } else if (!line.trim()) {
      blocks.push({ kind: "gap" });
    } else {
      blocks.push({ kind: "para", runs: parseInline(line) });
    }
  }
  return blocks;
}

const HEADING_SCALE = { 1: 1.5, 2: 1.25, 3: 1.1 };
export const LINE_HEIGHT = 1.32;
export const PAD = 6;

// Lays text out inside the item's width. Returns { lines, height, width }; each line:
//   { runs: [{ text, bold?, italic?, code?, strike?, size, mono?, x, w }], x, y, h, kind, bullet?, bar?, bg? }
// format "plain" wraps by the box; "markdown" reads the marks above; "code" keeps every line as it is; "math" is one formula per line.
export function layoutText(item, measure = guessMeasure) {
  const size = item.fontSize || 20;
  const width = Math.max(40, (item.width || 240) - PAD * 2);
  const lines = [];
  let y = PAD;
  const add = (runs, opts = {}) => {
    const sz = opts.size || size;
    const h = Math.ceil(sz * LINE_HEIGHT) + (opts.extra || 0);
    let x = opts.indent || 0;
    const placed = runs.map((r) => {
      const style = { size: r.size || sz, mono: r.code || opts.mono, bold: r.bold || opts.bold };
      const w = measure(r.text, style);
      const out = { ...r, size: style.size, mono: style.mono, x, w };
      x += w;
      return out;
    });
    lines.push({ runs: placed, x: opts.indent || 0, y, h, kind: opts.kind || "text", ...(opts.bullet ? { bullet: opts.bullet } : {}), ...(opts.bar ? { bar: true } : {}), ...(opts.bg ? { bg: true } : {}), ...(opts.formula ? { formula: opts.formula } : {}) });
    y += h;
  };
  // Wrap a list of runs: break the plain text and keep each piece's marks
  const addRuns = (runs, opts = {}) => {
    const indent = opts.indent || 0;
    const avail = width - indent - (opts.right || 0);
    const sz = opts.size || size;
    const flat = runs.map((r) => ({ ...r, size: sz }));
    let cur = [];
    let curW = 0;
    const flush = () => {
      add(cur.length ? cur : [{ text: "" }], { ...opts, indent });
      cur = [];
      curW = 0;
      opts = { ...opts, bullet: undefined };
    };
    for (const run of flat) {
      const style = { size: sz, mono: run.code, bold: run.bold || opts.bold };
      const parts = String(run.text).split(/(\s+)/).filter((p) => p !== "");
      for (const part of parts) {
        const pw = measure(part, style);
        if (curW + pw > avail && curW > 0 && !/^\s+$/.test(part)) flush();
        if (/^\s+$/.test(part) && curW === 0) continue;
        if (pw > avail) {
          // A very long word: break it by characters
          for (const ch of Array.from(part)) {
            const cw = measure(ch, style);
            if (curW + cw > avail && curW > 0) flush();
            cur.push({ ...run, text: ch });
            curW += cw;
          }
        } else {
          cur.push({ ...run, text: part });
          curW += pw;
        }
      }
    }
    if (cur.length || !lines.length) flush();
  };

  const format = item.format || "plain";
  const text = String(item.text || "");
  if (format === "code") {
    for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
      const pieces = wrapLine(raw.replace(/\t/g, "  "), width - 12, measure, { size: size * 0.9, mono: true });
      for (const p of pieces) add([{ text: p, code: true }], { mono: true, size: size * 0.9, indent: 6, bg: true, kind: "code" });
    }
  } else if (format === "math") {
    for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
      if (!raw.trim()) add([{ text: "" }], { kind: "gap" });
      else add([{ text: raw }], { kind: "math", formula: raw.replace(/^\$\$?|\$\$?$/g, "").trim() });
    }
  } else if (format === "markdown") {
    for (const b of parseBlocks(text)) {
      if (b.kind === "gap") {
        y += Math.round(size * 0.35);
      } else if (b.kind === "heading") {
        const sz = size * (HEADING_SCALE[b.level] || 1.1);
        addRuns(b.runs.map((r) => ({ ...r, bold: true })), { size: sz, bold: true, kind: "heading", extra: 3 });
      } else if (b.kind === "rule") {
        add([{ text: "" }], { kind: "rule", extra: -Math.floor(size * 0.6) });
      } else if (b.kind === "bullet") {
        addRuns(b.runs, { indent: 18 + b.depth * 18, bullet: b.depth % 2 ? "◦" : "•", kind: "list" });
      } else if (b.kind === "number") {
        addRuns(b.runs, { indent: 22 + b.depth * 18, bullet: `${b.n}.`, kind: "list" });
      } else if (b.kind === "quote") {
        addRuns(b.runs.map((r) => ({ ...r, italic: true })), { indent: 14, bar: true, kind: "quote" });
      } else if (b.kind === "code") {
        for (const raw of b.lines.length ? b.lines : [""]) {
          for (const p of wrapLine(raw.replace(/\t/g, "  "), width - 12, measure, { size: size * 0.9, mono: true })) add([{ text: p, code: true }], { mono: true, size: size * 0.9, indent: 6, bg: true, kind: "code", lang: b.lang });
        }
      } else addRuns(b.runs, { kind: "text" });
    }
  } else {
    for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
      if (!raw.trim()) {
        y += Math.round(size * 0.5);
        continue;
      }
      for (const piece of wrapLine(raw, width, measure, { size, bold: item.bold })) add([{ text: piece, bold: item.bold, italic: item.italic }], { kind: "text" });
    }
  }
  const height = Math.max(Math.ceil(size * LINE_HEIGHT), y) + PAD;
  return { lines, height, width: item.width || 240 };
}

// How tall a text item will be, without a canvas
export function estimateTextHeight(item) {
  return Math.ceil(layoutText(item, guessMeasure).height);
}

// ---------- Code colors ----------
const KEYWORDS = new Set((
  "abstract as async await break case catch class const continue def default del delete do elif else enum except export extends false final finally fn for from func function go if implements import in instanceof interface is lambda let match mod new nil none null of override package pass private protected pub public raise return self static struct super switch this throw true try type typeof use var void while with yield int float double bool char string str long short unsigned using namespace template"
).split(/\s+/));

// A line of code as colored pieces: { text, kind } with kind = plain | kw | str | num | com | fn
export function tokenizeCode(line) {
  const out = [];
  const s = String(line);
  let i = 0;
  const push = (text, kind) => text && out.push({ text, kind });
  while (i < s.length) {
    const rest = s.slice(i);
    let m;
    if ((m = /^(\/\/.*|#.*|--.*)/.exec(rest))) {
      push(m[1], "com");
      i += m[1].length;
    } else if ((m = /^("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)/.exec(rest))) {
      push(m[1], "str");
      i += m[1].length;
    } else if ((m = /^(0x[0-9a-f]+|\d+(?:\.\d+)?)/i.exec(rest))) {
      push(m[1], "num");
      i += m[1].length;
    } else if ((m = /^([A-Za-z_$][\w$]*)/.exec(rest))) {
      const word = m[1];
      const after = s[i + word.length];
      push(word, KEYWORDS.has(word) ? "kw" : after === "(" ? "fn" : "plain");
      i += word.length;
    } else {
      push(rest[0], "plain");
      i++;
    }
  }
  return out;
}

// Merges neighbours of the same kind (smaller drawing lists)
export function mergeTokens(tokens) {
  const out = [];
  for (const t of tokens) {
    const last = out[out.length - 1];
    if (last && last.kind === t.kind) last.text += t.text;
    else out.push({ ...t });
  }
  return out;
}

// Does the text contain right-to-left script (Arabic, Hebrew)? Used to align and shape it the right way
export const isRtl = (text) => /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(String(text || ""));
