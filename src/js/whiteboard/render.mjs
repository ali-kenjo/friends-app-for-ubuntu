// Drawing a board page on any 2D canvas: the board on screen, the board in the 3D room, a picture you export, a
// thumbnail, and the board in a recording all go through here, so they look the same. It draws every kind of item
// (pen strokes, shapes and arrows, text with a little Markdown, formulas, code, sticky notes, checklists, tables,
// pictures, diagrams, frames), the background patterns and themes, and the "someone is writing it" reveal.
// Browser or test: it only needs a 2D context (tests give it a recording one).
import { getBoundingBox, LINE_SHAPES, color as cleanColor } from "./model.mjs";
import { layoutText, guessMeasure, tokenizeCode, mergeTokens, isRtl, LINE_HEIGHT, PAD } from "./text.mjs";
import { layoutMath, drawMath, MATH_FONT } from "./math.mjs";
import { curveControls, pathMiddle } from "./connectors.mjs";

// ---------- Themes ----------
// ink: the default writing color on this surface. dark: light ink is needed (near-black ink is turned light).
export const THEMES = {
  // The two that follow the app: warm paper in a light app, deep midnight in a dark one (the default, "auto")
  paper: { bg: "#fbf8f2", grid: "#ece5d8", gridStrong: "#ddd2bf", ink: "#2b2118", dark: false, card: "#ffffff", cardLine: "#d9ccb6", shade: "rgba(60,40,20,.14)" },
  midnight: { bg: "#1c1713", grid: "rgba(255,236,214,.05)", gridStrong: "rgba(255,236,214,.11)", ink: "#f3e9dc", dark: true, card: "#2a221b", cardLine: "#4a3d32", shade: "rgba(0,0,0,.42)" },
  classic: { bg: "#ffffff", grid: "#e2e8f0", gridStrong: "#cbd5e1", ink: "#1e293b", dark: false, card: "#ffffff", cardLine: "#cbd5e1", shade: "rgba(15,23,42,.14)" },
  chalkboard: { bg: "#18241d", grid: "rgba(255,255,255,.06)", gridStrong: "rgba(255,255,255,.12)", ink: "#f4f1e8", dark: true, card: "#22332a", cardLine: "#4b6556", shade: "rgba(0,0,0,.35)" },
  blueprint: { bg: "#0d1e38", grid: "rgba(56,189,248,.22)", gridStrong: "rgba(56,189,248,.38)", ink: "#e0f2fe", dark: true, card: "#12294a", cardLine: "#2f6aa3", shade: "rgba(0,0,0,.35)" },
  cork: { bg: "#d8b98a", grid: "rgba(120,80,40,.16)", gridStrong: "rgba(120,80,40,.28)", ink: "#2a1f14", dark: false, card: "#fffaf0", cardLine: "#b4916a", shade: "rgba(60,30,0,.25)" },
  glass: { bg: "#10151f", grid: "rgba(255,255,255,.1)", gridStrong: "rgba(255,255,255,.2)", ink: "#eef2ff", dark: true, card: "#1a2232", cardLine: "#3b4863", shade: "rgba(0,0,0,.4)" },
  neon: { bg: "#08080c", grid: "rgba(56,189,248,.22)", gridStrong: "rgba(244,63,94,.35)", ink: "#f8fafc", dark: true, card: "#12121a", cardLine: "#334155", shade: "rgba(0,0,0,.5)" },
};
export const THEME_NAMES = Object.keys(THEMES);
// "auto" is paper in a light app and midnight in a dark one
export const themeOf = (name) => THEMES[name] || (name === "auto" ? (typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? THEMES.paper : THEMES.midnight) : THEMES.classic);

function lum(hex) {
  const m = /^#([0-9a-f]{6})/i.exec(hex || "");
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

// Dark ink on a dark board is unreadable and white ink on a light one too: turn it around (colors like red stay)
export function inkOn(theme, c) {
  if (!c || c === "transparent") return c;
  const hex = /^#[0-9a-f]{6}/i.test(c) ? c : null;
  if (!hex) return c;
  const l = lum(hex);
  if (theme.dark && l < 0.3) return theme.ink;
  if (!theme.dark && l > 0.93) return theme.ink;
  return c;
}

// ---------- Fonts ----------
const SANS = '"Figtree", "Noto Sans Arabic", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FAMILIES = {
  marker: `"Bricolage Grotesque", "Bradley Hand", "Segoe Print", "Chalkboard SE", "Noto Sans Arabic", ${SANS}`,
  chalk: `"Chalkboard SE", "Bradley Hand", "Bricolage Grotesque", "Noto Sans Arabic", ${SANS}`,
  sans: SANS,
  serif: 'Georgia, "Times New Roman", "Noto Naskh Arabic", "Noto Sans Arabic", serif',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "DejaVu Sans Mono", monospace',
};
export const fontCss = (family, size, { bold = false, italic = false, mono = false } = {}) =>
  `${italic ? "italic " : ""}${bold ? "700 " : family === "marker" ? "600 " : ""}${Math.max(6, Math.round(size * 10) / 10)}px ${mono ? FAMILIES.mono : FAMILIES[family] || FAMILIES.sans}`;

// A measure() for layoutText from a 2D context
export function makeMeasure(ctx, family = "sans") {
  return (text, style = {}) => {
    ctx.font = fontCss(style.mono ? "mono" : family, style.size || 20, { bold: style.bold, italic: style.italic });
    return ctx.measureText(text).width;
  };
}

// ---------- Caches ----------
let fontEpoch = 0;
export const bumpFonts = () => fontEpoch++; // call when a font finished loading: texts are measured again
const textCache = new WeakMap();
const mathCache = new Map();

function textKey(item) {
  return [item.text, item.width, item.fontSize, item.format, item.fontFamily, item.bold, item.italic, fontEpoch].join("\u0001");
}

// Laid-out text (with formulas measured) for a text-like item, cached per item version
export function textLayout(ctx, item) {
  const key = textKey(item);
  const hit = textCache.get(item);
  if (hit && hit.key === key) return hit.layout;
  const family = item.fontFamily || "marker";
  const measure = ctx ? makeMeasure(ctx, family) : guessMeasure;
  const layout = layoutText(item, measure);
  if (item.format === "math") {
    let y = PAD;
    for (const line of layout.lines) {
      if (line.kind === "math") {
        const laid = formula(line.formula, item.fontSize || 20, ctx);
        line.laid = laid;
        line.base = laid.a + 2;
        line.h = Math.max(line.h, Math.ceil(laid.a + laid.d + 8));
        line.w = laid.w;
      }
      line.y = y;
      y += line.h;
    }
    layout.height = y + PAD;
  }
  textCache.set(item, { key, layout });
  return layout;
}

function formula(src, size, ctx) {
  const key = `${size}|${src}|${fontEpoch}`;
  let laid = mathCache.get(key);
  if (!laid) {
    const measure = ctx
      ? (text, sz, st = {}) => {
          ctx.font = `${st.italic ? "italic " : ""}${st.bold ? "bold " : ""}${sz}px ${MATH_FONT}`;
          return ctx.measureText(text).width;
        }
      : undefined;
    laid = layoutMath(src, size, measure);
    if (mathCache.size > 400) mathCache.clear();
    mathCache.set(key, laid);
  }
  return laid;
}

// ---------- Tables and checklists: where the parts are (also for clicking them) ----------
const ROW_H = 34;
export function checklistLayout(ctx, item) {
  const measure = ctx ? makeMeasure(ctx, "sans") : guessMeasure;
  const size = 16;
  const inner = Math.max(40, item.width - 52);
  let y = 46;
  const rows = [];
  for (const c of item.items || []) {
    const lines = wrapForWidth(c.text, inner, (t) => measure(t, { size }));
    const h = Math.max(ROW_H - 4, lines.length * Math.ceil(size * 1.3) + 10);
    rows.push({ id: c.id, checked: c.checked, lines, x: 12, y, w: item.width - 24, h, box: { x: 14, y: y + 6, size: 20 } });
    y += h;
  }
  return { rows, height: Math.max(60, y + 12) };
}

function wrapForWidth(text, width, w) {
  const out = [];
  for (const raw of String(text || "").split("\n")) {
    let line = "";
    for (const word of raw.split(/(\s+)/)) {
      if (!line || w(line + word) <= width) line += word;
      else {
        out.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out.length ? out : [""];
}

export function tableLayout(ctx, item) {
  const measure = ctx ? makeMeasure(ctx, "sans") : guessMeasure;
  const cols = Math.max(item.headers?.length || 0, ...(item.rows || []).map((r) => r.length), 1);
  const titleH = item.title ? 34 : 0;
  const colW = item.width / cols;
  const size = 15;
  const pad = 8;
  const rowsOut = [];
  let y = titleH;
  const all = [item.headers?.length ? { cells: item.headers, header: true } : null, ...(item.rows || []).map((cells) => ({ cells }))].filter(Boolean);
  all.forEach((row, ri) => {
    let lines = 1;
    const wrapped = Array.from({ length: cols }, (_, c) => {
      const l = wrapForWidth(row.cells[c] ?? "", colW - pad * 2, (t) => measure(t, { size, bold: row.header }));
      lines = Math.max(lines, l.length);
      return l;
    });
    const h = Math.max(32, lines * Math.ceil(size * 1.3) + 14);
    rowsOut.push({ header: Boolean(row.header), index: row.header ? -1 : ri - (item.headers?.length ? 1 : 0), y, h, cells: wrapped });
    y += h;
  });
  return { cols, colW, titleH, rows: rowsOut, height: Math.max(60, y) };
}

// The box an item really takes (text and tables grow with their words)
export function itemBox(ctx, item) {
  if (item.type === "text") {
    const h = Math.max(item.height || 0, textLayout(ctx, item).height);
    return { minX: item.x, minY: item.y, maxX: item.x + item.width, maxY: item.y + h, width: item.width, height: h, cx: item.x + item.width / 2, cy: item.y + h / 2 };
  }
  if (item.type === "table") {
    const h = tableLayout(ctx, item).height;
    return { minX: item.x, minY: item.y, maxX: item.x + item.width, maxY: item.y + h, width: item.width, height: h, cx: item.x + item.width / 2, cy: item.y + h / 2 };
  }
  if (item.type === "checklist") {
    const h = Math.max(item.height || 0, checklistLayout(ctx, item).height);
    return { minX: item.x, minY: item.y, maxX: item.x + item.width, maxY: item.y + h, width: item.width, height: h, cx: item.x + item.width / 2, cy: item.y + h / 2 };
  }
  return getBoundingBox(item);
}

// ---------- Images ----------
export class ImageCache {
  constructor(onChange = () => {}) {
    this.map = new Map();
    this.onChange = onChange;
  }
  get(src) {
    if (!src || typeof Image === "undefined") return null;
    let e = this.map.get(src);
    if (!e) {
      const img = new Image();
      e = { img, ok: false, failed: false };
      img.onload = () => {
        e.ok = true;
        this.onChange();
      };
      img.onerror = () => {
        e.failed = true;
        this.onChange();
      };
      img.src = src;
      this.map.set(src, e);
      if (this.map.size > 120) this.map.delete(this.map.keys().next().value);
    }
    return e.ok ? e.img : e.failed ? "failed" : null;
  }
}

// ---------- Background ----------
// view: { zoom, panX, panY } (model → screen); pattern: plain | grid | dots | ruled | graph | music | isometric
export function drawBackground(ctx, w, h, view, pattern, theme, gridSize = 24, { fill = true } = {}) {
  const th = typeof theme === "string" ? themeOf(theme) : theme;
  ctx.save();
  if (fill) {
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, w, h);
  }
  const zoom = view.zoom || 1;
  const step = (gridSize || 24) * zoom;
  if (pattern !== "plain" && pattern !== "none" && step >= 6) {
    const sx = (((view.panX || 0) % step) + step) % step;
    const sy = (((view.panY || 0) % step) + step) % step;
    ctx.lineWidth = 1;
    if (pattern === "dots") {
      ctx.fillStyle = th.gridStrong;
      const r = Math.max(0.9, 1.3 * Math.min(zoom, 1.6));
      for (let x = sx; x < w; x += step) for (let y = sy; y < h; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (pattern === "ruled" || pattern === "lines") {
      ctx.strokeStyle = th.grid;
      ctx.beginPath();
      for (let y = sy; y < h; y += step * 1.4) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
      }
      ctx.stroke();
      ctx.strokeStyle = "rgba(220,38,38,.35)";
      ctx.beginPath();
      const mx = (view.panX || 0) + 90 * zoom;
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, h);
      ctx.stroke();
    } else if (pattern === "music") {
      ctx.strokeStyle = th.gridStrong;
      ctx.beginPath();
      const gap = step * 0.4;
      for (let y0 = sy; y0 < h; y0 += gap * 4 + step * 2) for (let k = 0; k < 5; k++) {
        ctx.moveTo(0, y0 + k * gap + 0.5);
        ctx.lineTo(w, y0 + k * gap + 0.5);
      }
      ctx.stroke();
    } else if (pattern === "isometric") {
      ctx.strokeStyle = th.grid;
      ctx.beginPath();
      const isoH = step * Math.sin(Math.PI / 3);
      for (let y = (((view.panY || 0) % isoH) + isoH) % isoH; y < h; y += isoH) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      const tan = Math.tan(Math.PI / 3);
      for (let x = -h / tan + sx; x < w + h / tan; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x + h / tan, h);
        ctx.moveTo(x, 0);
        ctx.lineTo(x - h / tan, h);
      }
      ctx.stroke();
    } else {
      // grid / graph (graph has a stronger line every five)
      ctx.strokeStyle = th.grid;
      ctx.beginPath();
      for (let x = sx; x < w; x += step) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
      }
      for (let y = sy; y < h; y += step) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
      }
      ctx.stroke();
      if (pattern === "graph") {
        ctx.strokeStyle = th.gridStrong;
        ctx.beginPath();
        const big = step * 5;
        const bx = (((view.panX || 0) % big) + big) % big;
        const by = (((view.panY || 0) % big) + big) % big;
        for (let x = bx; x < w; x += big) {
          ctx.moveTo(x + 0.5, 0);
          ctx.lineTo(x + 0.5, h);
        }
        for (let y = by; y < h; y += big) {
          ctx.moveTo(0, y + 0.5);
          ctx.lineTo(w, y + 0.5);
        }
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

// ---------- Paths ----------
function shapePath(ctx, kind, x, y, w, h, item = {}) {
  ctx.beginPath();
  switch (kind) {
    case "ellipse":
    case "circle":
      ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      break;
    case "triangle":
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    case "diamond":
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w / 2, y + h);
      ctx.lineTo(x, y + h / 2);
      ctx.closePath();
      break;
    case "hexagon": {
      const k = Math.min(w * 0.25, h * 0.5);
      ctx.moveTo(x + k, y);
      ctx.lineTo(x + w - k, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w - k, y + h);
      ctx.lineTo(x + k, y + h);
      ctx.lineTo(x, y + h / 2);
      ctx.closePath();
      break;
    }
    case "star": {
      const cx = x + w / 2, cy = y + h / 2;
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.42 : 1;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const px = cx + Math.cos(a) * (w / 2) * r;
        const py = cy + Math.sin(a) * (h / 2) * r;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case "cylinder": {
      const ry = Math.min(h * 0.15, 22);
      ctx.moveTo(x, y + ry);
      ctx.ellipse(x + w / 2, y + ry, w / 2, ry, 0, Math.PI, 0);
      ctx.lineTo(x + w, y + h - ry);
      ctx.ellipse(x + w / 2, y + h - ry, w / 2, ry, 0, 0, Math.PI);
      ctx.closePath();
      break;
    }
    case "cloud": {
      ctx.moveTo(x + w * 0.2, y + h * 0.8);
      ctx.bezierCurveTo(x - w * 0.05, y + h * 0.8, x - w * 0.02, y + h * 0.4, x + w * 0.2, y + h * 0.42);
      ctx.bezierCurveTo(x + w * 0.2, y + h * 0.05, x + w * 0.6, y + h * 0.02, x + w * 0.66, y + h * 0.3);
      ctx.bezierCurveTo(x + w * 0.95, y + h * 0.2, x + w * 1.05, y + h * 0.7, x + w * 0.82, y + h * 0.8);
      ctx.closePath();
      break;
    }
    case "speech_bubble": {
      const r = Math.min(14, w / 4, h / 4);
      const bh = h * 0.82;
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + bh - r);
      ctx.quadraticCurveTo(x + w, y + bh, x + w - r, y + bh);
      ctx.lineTo(x + w * 0.4, y + bh);
      ctx.lineTo(x + w * 0.22, y + h);
      ctx.lineTo(x + w * 0.26, y + bh);
      ctx.lineTo(x + r, y + bh);
      ctx.quadraticCurveTo(x, y + bh, x, y + bh - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      break;
    }
    case "round_rect":
      roundRect(ctx, x, y, w, h, item.radius ?? 14);
      break;
    default:
      if (item.radius) roundRect(ctx, x, y, w, h, item.radius);
      else ctx.rect(x, y, w, h);
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

const setDash = (ctx, style, width) => ctx.setLineDash(style === "dashed" ? [width * 3 + 4, width * 2 + 3] : style === "dotted" ? [1, width * 2 + 3] : []);

function arrowHead(ctx, from, to, size, fill) {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.save();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(a - 0.45), to.y - size * Math.sin(a - 0.45));
  ctx.lineTo(to.x - size * Math.cos(a + 0.45), to.y - size * Math.sin(a + 0.45));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

// The path of a line-like shape (points; a curve between two ends)
function strokePath(ctx, item, upTo = 1) {
  const pts = item.points || [];
  ctx.beginPath();
  if (pts.length < 2) return pts;
  if (item.route === "curve" && pts.length === 2) {
    const [c1, c2] = curveControls(pts[0], pts[1], item.sides);
    ctx.moveTo(pts[0].x, pts[0].y);
    if (upTo >= 1) ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, pts[1].x, pts[1].y);
    else {
      // part of a curve: sample it
      const n = 24;
      for (let i = 1; i <= Math.ceil(n * upTo); i++) {
        const t = Math.min(i / n, upTo);
        const u = 1 - t;
        ctx.lineTo(
          u * u * u * pts[0].x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * pts[1].x,
          u * u * u * pts[0].y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * pts[1].y
        );
      }
    }
    return pts;
  }
  // Polyline, only the first `upTo` of its length
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let left = total * upTo;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (left >= seg) {
      ctx.lineTo(pts[i].x, pts[i].y);
      left -= seg;
    } else {
      const t = seg ? left / seg : 0;
      ctx.lineTo(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t);
      break;
    }
  }
  return pts;
}

// ---------- One item ----------
// st: { theme, ctx2 (measuring context), reveal: Map id → 0..1, images, diagram(item) → drawable|null, tip: {} out }
export function drawItem(ctx, item, st) {
  const th = st.theme;
  const progress = st.reveal?.get(item.id);
  const p = progress === undefined ? 1 : Math.max(0, Math.min(1, progress));
  if (p <= 0) return;
  ctx.save();
  if (item.rotation && item.type !== "stroke" && !LINE_SHAPES.includes(item.shapeType)) {
    const b = getBoundingBox(item);
    ctx.translate(b.cx, b.cy);
    ctx.rotate((item.rotation * Math.PI) / 180);
    ctx.translate(-b.cx, -b.cy);
  }
  try {
    switch (item.type) {
      case "stroke":
        drawStroke(ctx, item, th, p, st);
        break;
      case "shape":
        drawShape(ctx, item, th, p, st);
        break;
      case "text":
        drawTextItem(ctx, item, th, p, st);
        break;
      case "sticky":
        drawSticky(ctx, item, th, p, st);
        break;
      case "checklist":
        drawChecklist(ctx, item, th, p, st);
        break;
      case "table":
        drawTable(ctx, item, th, p, st);
        break;
      case "image":
        drawImage(ctx, item, th, p, st);
        break;
      case "diagram":
        drawDiagram(ctx, item, th, p, st);
        break;
      case "frame":
        drawFrame(ctx, item, th, p, st);
        break;
      default:
        break;
    }
  } finally {
    ctx.restore();
  }
}

const tip = (st, x, y, item) => {
  if (st.tip) {
    st.tip.x = x;
    st.tip.y = y;
    st.tip.id = item.id;
    st.tip.kind = item.type;
  }
};

function drawStroke(ctx, item, th, p, st) {
  const pts = item.points || [];
  if (!pts.length) return;
  const n = p < 1 ? Math.max(1, Math.floor(pts.length * p)) : pts.length;
  const shown = pts.slice(0, n);
  const style = item.style || "marker";
  const hl = style === "highlighter";
  ctx.strokeStyle = hl ? item.color : inkOn(th, item.color);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineCap = hl ? "butt" : "round";
  ctx.lineJoin = "round";
  const size = item.size || 3;
  ctx.globalAlpha = (hl ? Math.min(item.opacity ?? 0.4, 0.45) : item.opacity ?? 1) * (style === "pencil" ? 0.85 : 1);
  if (shown.length === 1) {
    ctx.beginPath();
    ctx.arc(shown[0].x, shown[0].y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === "pen" && shown.length < 600) {
    // Pressure: a thicker line where it was pressed harder
    for (let i = 1; i < shown.length; i++) {
      const pr = ((shown[i].p ?? 0.5) + (shown[i - 1].p ?? 0.5)) / 2;
      ctx.lineWidth = Math.max(0.6, size * (0.45 + pr * 0.9));
      ctx.beginPath();
      ctx.moveTo(shown[i - 1].x, shown[i - 1].y);
      ctx.lineTo(shown[i].x, shown[i].y);
      ctx.stroke();
    }
  } else {
    ctx.lineWidth = hl ? Math.max(size, 14) : style === "pencil" ? Math.max(1, size * 0.65) : size;
    if (style === "chalk") ctx.setLineDash([size * 6, size * 0.6]);
    ctx.beginPath();
    ctx.moveTo(shown[0].x, shown[0].y);
    for (let i = 1; i < shown.length - 1; i++) {
      const mx = (shown[i].x + shown[i + 1].x) / 2;
      const my = (shown[i].y + shown[i + 1].y) / 2;
      ctx.quadraticCurveTo(shown[i].x, shown[i].y, mx, my);
    }
    const last = shown[shown.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }
  if (p < 1) tip(st, shown[shown.length - 1].x, shown[shown.length - 1].y, item);
}

function drawShape(ctx, item, th, p, st) {
  const stroke = inkOn(th, item.strokeColor);
  const sw = item.strokeWidth ?? 2;
  ctx.globalAlpha = item.opacity ?? 1;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = sw;
  if (LINE_SHAPES.includes(item.shapeType)) {
    ctx.strokeStyle = stroke;
    setDash(ctx, item.strokeStyle, sw);
    const pts = strokePath(ctx, item, p);
    if (sw > 0 && pts.length > 1) ctx.stroke();
    if (p >= 1 && pts.length > 1) {
      const head = Math.max(8, 5 + sw * 2.2);
      if (item.arrowEnd) {
        const from = item.route === "curve" && pts.length === 2 ? curveControls(pts[0], pts[1], item.sides)[1] : pts[pts.length - 2];
        arrowHead(ctx, from, pts[pts.length - 1], head, stroke);
      }
      if (item.arrowStart) {
        const from = item.route === "curve" && pts.length === 2 ? curveControls(pts[0], pts[1], item.sides)[0] : pts[1];
        arrowHead(ctx, from, pts[0], head, stroke);
      }
      if (item.label) {
        const mid = pathMiddle(pts);
        const size = item.fontSize || 14;
        ctx.font = fontCss("sans", size, { bold: true });
        const w = ctx.measureText(item.label).width + 12;
        ctx.setLineDash([]);
        ctx.fillStyle = th.bg;
        ctx.globalAlpha = 0.92;
        ctx.beginPath();
        roundRect(ctx, mid.x - w / 2, mid.y - size * 0.85, w, size * 1.7, 6);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = inkOn(th, item.labelColor || th.ink);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(item.label, mid.x, mid.y);
      }
    } else if (p < 1 && pts.length > 1) {
      const last = pts[pts.length - 1];
      tip(st, pts[0].x + (last.x - pts[0].x) * p, pts[0].y + (last.y - pts[0].y) * p, item);
    }
    return;
  }
  const x = Math.min(item.x, item.x + item.width), y = Math.min(item.y, item.y + item.height);
  const w = Math.abs(item.width), h = Math.abs(item.height);
  const fill = item.fillColor && item.fillColor !== "transparent" ? item.fillColor : null;
  // First the outline is drawn, then the fill comes up
  const outline = Math.min(1, p / 0.7);
  const fillAlpha = p < 0.7 ? 0 : (p - 0.7) / 0.3;
  if (item.shadow !== false && fill && p >= 1) {
    ctx.save();
    ctx.shadowColor = th.shade;
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    shapePath(ctx, item.shapeType, x, y, w, h, item);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  } else if (fill && fillAlpha > 0) {
    shapePath(ctx, item.shapeType, x, y, w, h, item);
    ctx.save();
    ctx.globalAlpha = (item.opacity ?? 1) * fillAlpha;
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }
  if (sw > 0 && stroke !== "transparent") {
    ctx.strokeStyle = stroke;
    shapePath(ctx, item.shapeType, x, y, w, h, item);
    if (outline < 1) {
      const per = 2 * (w + h);
      ctx.setLineDash([per * outline, per]);
      tip(st, x + w * outline, y, item);
    } else setDash(ctx, item.strokeStyle, sw);
    ctx.stroke();
  }
  if (item.label && p >= 0.7) {
    ctx.setLineDash([]);
    ctx.globalAlpha = (item.opacity ?? 1) * (p < 1 ? (p - 0.7) / 0.3 : 1);
    const size = item.fontSize || 16;
    const labelItem = { text: item.label, width: Math.max(30, w - 16), fontSize: size, format: "plain", fontFamily: "sans", bold: true };
    const layout = textLayout(st.ctx2 || ctx, labelItem);
    const top = y + (h - (layout.height - PAD * 2)) / 2;
    // On a filled shape the words are read against the fill, not against the board (a light box on a dark board
    // needs dark words); a color you chose is kept when it can be read there
    const readable = (c) => Math.abs(lum(c) - lum(fill)) > 0.35;
    ctx.fillStyle = fill && fill !== "transparent" ? (item.labelColor && /^#[0-9a-f]{6}$/i.test(item.labelColor) && readable(item.labelColor) ? item.labelColor : lum(fill) > 0.55 ? "#1e293b" : "#f8fafc") : inkOn(th, item.labelColor || th.ink);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "center";
    for (const line of layout.lines) {
      const run = line.runs.map((r) => r.text).join("");
      ctx.font = fontCss("sans", size, { bold: true });
      ctx.fillText(run, x + w / 2, top + line.y - PAD + size * 1.02);
    }
  }
}

function drawTextItem(ctx, item, th, p, st) {
  const layout = textLayout(st.ctx2 || ctx, item);
  const family = item.fontFamily || "marker";
  const size = item.fontSize || 20;
  const color = inkOn(th, item.color);
  if (item.background && item.background !== "transparent") {
    ctx.fillStyle = item.background;
    ctx.beginPath();
    roundRect(ctx, item.x, item.y, item.width, Math.max(item.height, layout.height), 8);
    ctx.fill();
  }
  const total = layout.lines.reduce((s, l) => s + l.runs.reduce((a, r) => a + Array.from(r.text).length, 0), 0) || 1;
  let budget = p < 1 ? Math.ceil(total * p) : Infinity;
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = 1;
  let last = null;
  for (const line of layout.lines) {
    if (budget <= 0) break;
    const baseY = item.y + line.y + (line.base ?? line.h * 0.76);
    if (line.kind === "rule") {
      ctx.strokeStyle = th.cardLine;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(item.x + PAD, item.y + line.y + 4);
      ctx.lineTo(item.x + item.width - PAD, item.y + line.y + 4);
      ctx.stroke();
      continue;
    }
    if (line.bg) {
      ctx.fillStyle = th.dark ? "rgba(255,255,255,.08)" : "rgba(15,23,42,.06)";
      ctx.fillRect(item.x + PAD, item.y + line.y, item.width - PAD * 2, line.h);
    }
    if (line.bar) {
      ctx.fillStyle = th.cardLine;
      ctx.fillRect(item.x + PAD, item.y + line.y + 2, 3, line.h - 4);
    }
    if (line.kind === "math" && line.laid) {
      const lx = item.align === "center" ? item.x + (item.width - line.laid.w) / 2 : item.align === "right" ? item.x + item.width - PAD - line.laid.w : item.x + PAD;
      drawMath(ctx, line.laid, lx, item.y + line.y + line.base, { color });
      budget -= Array.from(line.runs[0]?.text || "").length;
      last = { x: lx + line.laid.w, y: baseY };
      continue;
    }
    const lineText = line.runs.map((r) => r.text).join("");
    const rtl = isRtl(lineText);
    const lineW = line.runs.length ? line.runs[line.runs.length - 1].x + line.runs[line.runs.length - 1].w - line.x : 0;
    let startX;
    const align = item.align === "left" && rtl ? "right" : item.align;
    if (align === "center") startX = item.x + (item.width - lineW) / 2;
    else if (align === "right") startX = item.x + item.width - PAD - lineW;
    else startX = item.x + PAD + line.x;
    if (line.bullet) {
      ctx.font = fontCss(family, size);
      ctx.fillStyle = color;
      ctx.textAlign = "left";
      ctx.fillText(line.bullet, rtl ? item.x + item.width - PAD - line.x + 4 : item.x + PAD + line.x - (line.bullet.length > 1 ? 24 : 14), baseY);
    }
    if (line.kind === "code") {
      const tokens = mergeTokens(tokenizeCode(lineText));
      let tx = startX;
      ctx.font = fontCss("mono", line.runs[0]?.size || size * 0.9);
      ctx.textAlign = "left";
      for (const tk of tokens) {
        if (budget <= 0) break;
        const part = budget === Infinity ? tk.text : Array.from(tk.text).slice(0, budget).join("");
        ctx.fillStyle = tk.kind === "kw" ? (th.dark ? "#c4b5fd" : "#7c3aed") : tk.kind === "str" ? (th.dark ? "#86efac" : "#15803d") : tk.kind === "num" ? (th.dark ? "#fdba74" : "#c2410c") : tk.kind === "com" ? (th.dark ? "#94a3b8" : "#64748b") : tk.kind === "fn" ? (th.dark ? "#7dd3fc" : "#0369a1") : color;
        ctx.fillText(part, tx, baseY);
        tx += ctx.measureText(tk.text).width;
        budget -= Array.from(tk.text).length;
      }
      last = { x: tx, y: baseY };
      continue;
    }
    ctx.textAlign = "left";
    let x = startX;
    if (rtl) {
      // A right-to-left line is drawn whole so the letters join and the order is right
      ctx.direction = "rtl";
      ctx.textAlign = "right";
      ctx.font = fontCss(family, line.runs[0]?.size || size, { bold: line.runs[0]?.bold, italic: line.runs[0]?.italic });
      ctx.fillStyle = color;
      const shownText = budget === Infinity ? lineText : Array.from(lineText).slice(0, budget).join("");
      ctx.fillText(shownText, align === "left" ? item.x + PAD + lineW : align === "center" ? item.x + (item.width + lineW) / 2 : item.x + item.width - PAD, baseY);
      ctx.direction = "ltr";
      budget -= Array.from(lineText).length;
      last = { x: item.x + PAD, y: baseY };
      continue;
    }
    for (const run of line.runs) {
      if (budget <= 0) break;
      const str = budget === Infinity ? run.text : Array.from(run.text).slice(0, budget).join("");
      ctx.font = fontCss(family, run.size || size, { bold: run.bold || item.bold, italic: run.italic || item.italic, mono: run.code });
      if (run.code) {
        ctx.fillStyle = th.dark ? "rgba(255,255,255,.12)" : "rgba(15,23,42,.08)";
        ctx.fillRect(x - 2, baseY - (run.size || size) * 0.85, ctx.measureText(str).width + 4, (run.size || size) * 1.15);
      }
      // A link to another board is in the app's warm link color and underlined
      ctx.fillStyle = run.link ? (th.dark ? "#ffc477" : "#b45309") : color;
      ctx.fillText(str, x, baseY);
      const w = ctx.measureText(str).width;
      if (run.strike) {
        ctx.fillRect(x, baseY - (run.size || size) * 0.3, w, 1.5);
      }
      if (run.link) ctx.fillRect(x, baseY + 3, w, 1.5);
      if (item.underline) ctx.fillRect(x, baseY + 3, w, 1.5);
      x += w;
      budget -= Array.from(run.text).length;
      last = { x, y: baseY };
    }
  }
  if (p < 1 && last) tip(st, last.x, last.y - size * 0.3, item);
}

function drawSticky(ctx, item, th, p, st) {
  const { x, y, width: w, height: h } = item;
  ctx.globalAlpha = p;
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(((item.tilt || 0) * Math.PI) / 180);
  ctx.translate(-w / 2, -h / 2);
  ctx.save();
  ctx.shadowColor = th.shade;
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = item.color;
  ctx.beginPath();
  roundRect(ctx, 0, 0, w, h, 3);
  ctx.fill();
  ctx.restore();
  // a darker corner, like a note lifting
  ctx.fillStyle = "rgba(0,0,0,.07)";
  ctx.beginPath();
  ctx.moveTo(w, h - 22);
  ctx.lineTo(w - 22, h);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  if (item.pinned !== false) {
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(w / 2, 9, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.beginPath();
    ctx.arc(w / 2 - 1.5, 7.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // The words, as large as fit
  const body = (item.title ? `**${item.title}**\n` : "") + item.text;
  let size = 18;
  let layout;
  for (; size >= 10; size -= 1) {
    layout = textLayout(st.ctx2 || ctx, { text: body, width: w - 8, fontSize: size, format: "markdown", fontFamily: "marker" });
    if (layout.height <= h - 26) break;
  }
  ctx.fillStyle = "#1f2937";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const total = layout.lines.reduce((s, l) => s + l.runs.reduce((a, r) => a + Array.from(r.text).length, 0), 0) || 1;
  let budget = p < 1 ? Math.ceil(total * p) : Infinity;
  for (const line of layout.lines) {
    if (budget <= 0) break;
    let tx = 12 + line.x;
    const by = 22 + line.y - PAD + line.h * 0.72;
    if (line.bullet) {
      ctx.font = fontCss("marker", size);
      ctx.fillText(line.bullet, 6 + line.x - 4, by);
    }
    for (const run of line.runs) {
      if (budget <= 0) break;
      const str = budget === Infinity ? run.text : Array.from(run.text).slice(0, budget).join("");
      ctx.font = fontCss("marker", run.size || size, { bold: run.bold, italic: run.italic, mono: run.code });
      if (isRtl(str)) {
        ctx.direction = "rtl";
        ctx.textAlign = "right";
        ctx.fillText(str, w - 12, by);
        ctx.direction = "ltr";
        ctx.textAlign = "left";
      } else ctx.fillText(str, tx, by);
      tx += ctx.measureText(str).width;
      budget -= Array.from(run.text).length;
    }
  }
  if (p < 1) tip(st, x + w / 2, y + h / 2, item);
}

function drawCard(ctx, th, x, y, w, h, fill, line) {
  ctx.save();
  ctx.shadowColor = th.shade;
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = fill;
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = line;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, 10);
  ctx.stroke();
}

function drawChecklist(ctx, item, th, p, st) {
  const lay = checklistLayout(st.ctx2 || ctx, item);
  const h = Math.max(item.height, lay.height);
  ctx.globalAlpha = p;
  const bgFill = item.color && lum(item.color) > 0.9 && th.dark ? th.card : item.color;
  drawCard(ctx, th, item.x, item.y, item.width, h, bgFill || th.card, item.strokeColor || th.cardLine);
  const fg = bgFill === th.card || th.dark ? th.ink : "#0f172a";
  ctx.fillStyle = fg;
  ctx.font = fontCss("sans", 17, { bold: true });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const done = (item.items || []).filter((c) => c.checked).length;
  ctx.fillText(item.title || "Checklist", item.x + 14, item.y + 28);
  if (item.items?.length) {
    ctx.font = fontCss("sans", 12);
    ctx.globalAlpha = p * 0.65;
    ctx.textAlign = "right";
    ctx.fillText(`${done}/${item.items.length}`, item.x + item.width - 14, item.y + 28);
    ctx.textAlign = "left";
    ctx.globalAlpha = p;
  }
  for (const row of lay.rows) {
    const bx = item.x + row.box.x;
    const by = item.y + row.box.y;
    ctx.strokeStyle = row.checked ? "#16a34a" : th.dark ? "#94a3b8" : "#94a3b8";
    ctx.lineWidth = 2;
    ctx.fillStyle = row.checked ? "#16a34a" : "transparent";
    ctx.beginPath();
    roundRect(ctx, bx, by, row.box.size, row.box.size, 5);
    if (row.checked) ctx.fill();
    ctx.stroke();
    if (row.checked) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(bx + 5, by + 10.5);
      ctx.lineTo(bx + 9, by + 14.5);
      ctx.lineTo(bx + 15.5, by + 6);
      ctx.stroke();
    }
    ctx.fillStyle = fg;
    ctx.globalAlpha = p * (row.checked ? 0.55 : 1);
    ctx.font = fontCss("sans", 16);
    row.lines.forEach((l, i) => {
      const rtl = isRtl(l);
      if (rtl) {
        ctx.direction = "rtl";
        ctx.textAlign = "right";
        ctx.fillText(l, item.x + item.width - 14, item.y + row.y + 20 + i * 21);
        ctx.direction = "ltr";
        ctx.textAlign = "left";
      } else ctx.fillText(l, item.x + row.box.x + 32, item.y + row.y + 20 + i * 21);
      if (row.checked) ctx.fillRect(item.x + row.box.x + 32, item.y + row.y + 14 + i * 21, Math.min(item.width - 60, ctx.measureText(l).width), 1.5);
    });
    ctx.globalAlpha = p;
  }
  if (p < 1) tip(st, item.x + item.width / 2, item.y + h / 2, item);
}

function drawTable(ctx, item, th, p, st) {
  const lay = tableLayout(st.ctx2 || ctx, item);
  ctx.globalAlpha = p;
  drawCard(ctx, th, item.x, item.y, item.width, lay.height, th.card, item.strokeColor || th.cardLine);
  const fg = th.dark ? th.ink : "#0f172a";
  if (item.title) {
    ctx.fillStyle = fg;
    ctx.font = fontCss("sans", 16, { bold: true });
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(item.title, item.x + 12, item.y + 23);
  }
  ctx.textBaseline = "alphabetic";
  for (const row of lay.rows) {
    if (row.header) {
      ctx.fillStyle = th.dark ? "rgba(255,255,255,.1)" : item.headerBg;
      ctx.fillRect(item.x + 1, item.y + row.y, item.width - 2, row.h);
    }
    ctx.strokeStyle = item.strokeColor || th.cardLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(item.x, item.y + row.y + row.h + 0.5);
    ctx.lineTo(item.x + item.width, item.y + row.y + row.h + 0.5);
    ctx.stroke();
    row.cells.forEach((lines, c) => {
      ctx.fillStyle = fg;
      ctx.font = fontCss("sans", 15, { bold: row.header });
      lines.forEach((l, i) => {
        if (isRtl(l)) {
          ctx.direction = "rtl";
          ctx.textAlign = "right";
          ctx.fillText(l, item.x + (c + 1) * lay.colW - 8, item.y + row.y + 21 + i * 20);
          ctx.direction = "ltr";
          ctx.textAlign = "left";
        } else ctx.fillText(l, item.x + c * lay.colW + 8, item.y + row.y + 21 + i * 20);
      });
    });
  }
  ctx.strokeStyle = item.strokeColor || th.cardLine;
  ctx.beginPath();
  for (let c = 1; c < lay.cols; c++) {
    ctx.moveTo(item.x + c * lay.colW + 0.5, item.y + lay.titleH);
    ctx.lineTo(item.x + c * lay.colW + 0.5, item.y + lay.height);
  }
  ctx.stroke();
  if (p < 1) tip(st, item.x + item.width / 2, item.y + lay.height / 2, item);
}

function placeholder(ctx, th, x, y, w, h, title, sub) {
  ctx.fillStyle = th.dark ? "rgba(255,255,255,.06)" : "rgba(99,102,241,.08)";
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = th.dark ? "#6366f1" : "#818cf8";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = th.dark ? "#c7d2fe" : "#4338ca";
  ctx.font = fontCss("sans", 14, { bold: true });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(title, x + 12, y + 24);
  if (sub) {
    ctx.font = fontCss("mono", 12);
    ctx.globalAlpha = 0.75;
    sub.split("\n").slice(0, Math.max(1, Math.floor((h - 44) / 16))).forEach((l, i) => ctx.fillText(l.slice(0, Math.floor((w - 24) / 7)), x + 12, y + 46 + i * 16));
    ctx.globalAlpha = 1;
  }
}

function drawImage(ctx, item, th, p, st) {
  ctx.globalAlpha = p;
  const img = st.images?.get(item.src);
  const { x, y, width: w, height: h } = item;
  if (img && img !== "failed") {
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, 6);
    ctx.clip();
    const ir = img.naturalWidth / Math.max(1, img.naturalHeight);
    const br = w / h;
    let dw = w, dh = h;
    if ((item.fit === "cover") === ir > br) {
      dh = h;
      dw = h * ir;
    } else {
      dw = w;
      dh = w / ir;
    }
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
  } else {
    placeholder(ctx, th, x, y, w, h, img === "failed" ? "Picture" : "Loading…", "");
  }
  if (item.caption) {
    ctx.fillStyle = inkOn(th, th.ink);
    ctx.font = fontCss("sans", 13);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(item.caption, x + w / 2, y + h + 6);
  }
  if (p < 1) tip(st, x + w / 2, y + h / 2, item);
}

function drawDiagram(ctx, item, th, p, st) {
  ctx.globalAlpha = p;
  const art = st.diagram?.(item, th);
  const { x, y, width: w, height: h } = item;
  if (art) {
    const aw = art.naturalWidth || art.width || w;
    const ah = art.naturalHeight || art.height || h;
    const k = Math.min(w / aw, h / ah);
    ctx.fillStyle = th.dark ? th.card : "#ffffff";
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.drawImage(art, x + (w - aw * k) / 2, y + (h - ah * k) / 2, aw * k, ah * k);
  } else {
    placeholder(ctx, th, x, y, w, h, `Diagram (${item.syntax})`, item.code);
  }
  if (p < 1) tip(st, x + w / 2, y + h / 2, item);
}

function drawFrame(ctx, item, th, p) {
  ctx.globalAlpha = p;
  const { x, y, width: w, height: h } = item;
  const line = inkOn(th, item.color);
  if (item.fillColor && item.fillColor !== "transparent") {
    ctx.fillStyle = item.fillColor;
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
  }
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 6]);
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, 14);
  ctx.stroke();
  ctx.setLineDash([]);
  if (item.title) {
    ctx.font = fontCss("sans", 17, { bold: true });
    ctx.textBaseline = "alphabetic";
    const tw = ctx.measureText(item.title).width + 24;
    ctx.fillStyle = line;
    ctx.globalAlpha = p * 0.14;
    ctx.beginPath();
    roundRect(ctx, x + 12, y - 1, tw, 32, 10);
    ctx.fill();
    ctx.globalAlpha = p;
    ctx.fillStyle = line;
    ctx.textAlign = "left";
    ctx.fillText(item.title, x + 24, y + 21);
  }
}

// ---------- A page ----------
// opts: { theme (name or object), reveal (Map), images (ImageCache), diagram (fn), hidden (Set of ids not to draw), ctx2 (measuring ctx) }
// Returns { tip } where the pen of something being written is.
export function drawPage(ctx, page, opts = {}) {
  const theme = typeof opts.theme === "string" ? themeOf(opts.theme) : opts.theme || THEMES.classic;
  const st = { theme, reveal: opts.reveal, images: opts.images, diagram: opts.diagram, ctx2: opts.ctx2 || ctx, tip: {} };
  const view = opts.view;
  for (const item of page?.items || []) {
    if (opts.hidden?.has(item.id)) continue;
    if (view && !visible(item, view)) continue;
    drawItem(ctx, item, st);
  }
  return { tip: st.tip.id ? st.tip : null };
}

// Skip what is far outside the screen (view: { x, y, w, h } in model units)
function visible(item, v) {
  const b = getBoundingBox(item);
  const pad = 40 + (item.type === "text" || item.type === "table" || item.type === "checklist" ? 4000 : 0);
  return !(b.maxX < v.x - pad || b.minX > v.x + v.w + pad || b.maxY < v.y - 40 || b.minY > v.y + v.h + 40) || item.type === "text" || item.type === "table" || item.type === "checklist";
}

// A page drawn into a whole canvas: the model rectangle `region` {x, y, width, height} fitted to the canvas.
// background: draw the paper too. Returns the transform used.
export function renderPageTo(canvas, page, { region = { x: 0, y: 0, width: 1600, height: 1000 }, theme = "classic", pattern = "grid", gridSize = 24, background = true, reveal, images, diagram, hidden, bgColor } = {}) {
  const ctx = canvas.getContext("2d");
  const th = typeof theme === "string" ? themeOf(theme) : theme;
  const k = Math.min(canvas.width / region.width, canvas.height / region.height);
  const ox = (canvas.width - region.width * k) / 2 - region.x * k;
  const oy = (canvas.height - region.height * k) / 2 - region.y * k;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (background) {
    drawBackground(ctx, canvas.width, canvas.height, { zoom: k, panX: ox, panY: oy }, pattern, bgColor ? { ...th, bg: bgColor } : th, gridSize);
  } else ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(k, 0, 0, k, ox, oy);
  const out = drawPage(ctx, page, { theme: th, reveal, images, diagram, hidden });
  ctx.restore();
  return { scale: k, offsetX: ox, offsetY: oy, ...out };
}

// ---------- SVG (a picture you can keep and edit) ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const safeColor = (c, fb = "#1e293b") => cleanColor(c, fb);

export function toSVG(page, { theme = "classic", region = null, background = true, title = "" } = {}) {
  const th = typeof theme === "string" ? themeOf(theme) : theme;
  const items = page?.items || [];
  let box = region;
  if (!box) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const it of items) {
      const b = itemBox(null, it);
      minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
    }
    box = items.length ? { x: minX - 40, y: minY - 40, width: maxX - minX + 80, height: maxY - minY + 80 } : { x: 0, y: 0, width: 1600, height: 1000 };
  }
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.width} ${box.height}" width="${Math.round(box.width)}" height="${Math.round(box.height)}">`];
  if (title) out.push(`<title>${esc(title)}</title>`);
  if (background) out.push(`<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="${th.bg}"/>`);
  for (const it of items) {
    const stroke = safeColor(inkOn(th, it.strokeColor || it.color));
    switch (it.type) {
      case "stroke": {
        const d = (it.points || []).map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
        out.push(`<path d="${d}" fill="none" stroke="${safeColor(inkOn(th, it.color))}" stroke-width="${it.size}" stroke-linecap="round" stroke-linejoin="round" opacity="${it.style === "highlighter" ? Math.min(it.opacity, 0.45) : it.opacity}"/>`);
        break;
      }
      case "shape": {
        const fill = it.fillColor && it.fillColor !== "transparent" ? safeColor(it.fillColor) : "none";
        if (LINE_SHAPES.includes(it.shapeType)) {
          const d = (it.points || []).map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
          out.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${it.strokeWidth}"${it.strokeStyle === "dashed" ? ' stroke-dasharray="10 7"' : ""}/>`);
        } else if (it.shapeType === "ellipse" || it.shapeType === "circle") {
          out.push(`<ellipse cx="${it.x + it.width / 2}" cy="${it.y + it.height / 2}" rx="${Math.abs(it.width / 2)}" ry="${Math.abs(it.height / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="${it.strokeWidth}"/>`);
        } else if (it.shapeType === "diamond") {
          out.push(`<polygon points="${it.x + it.width / 2},${it.y} ${it.x + it.width},${it.y + it.height / 2} ${it.x + it.width / 2},${it.y + it.height} ${it.x},${it.y + it.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${it.strokeWidth}"/>`);
        } else if (it.shapeType === "triangle") {
          out.push(`<polygon points="${it.x + it.width / 2},${it.y} ${it.x + it.width},${it.y + it.height} ${it.x},${it.y + it.height}" fill="${fill}" stroke="${stroke}" stroke-width="${it.strokeWidth}"/>`);
        } else {
          out.push(`<rect x="${it.x}" y="${it.y}" width="${Math.abs(it.width)}" height="${Math.abs(it.height)}" rx="${it.radius || 0}" fill="${fill}" stroke="${stroke}" stroke-width="${it.strokeWidth}"/>`);
        }
        if (it.label) out.push(`<text x="${it.x + it.width / 2}" y="${it.y + it.height / 2}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${it.fontSize || 16}" font-weight="700" fill="${safeColor(inkOn(th, it.labelColor || th.ink))}">${esc(it.label)}</text>`);
        break;
      }
      case "text": {
        const lay = layoutText(it, guessMeasure);
        const lines = lay.lines.map((l) => l.runs.map((r) => r.text).join(""));
        out.push(`<text font-family="sans-serif" font-size="${it.fontSize}" fill="${safeColor(inkOn(th, it.color))}"${it.align === "center" ? ` text-anchor="middle"` : ""}>`);
        lay.lines.forEach((l, i) => out.push(`<tspan x="${it.x + (it.align === "center" ? it.width / 2 : PAD + l.x)}" y="${it.y + l.y + (l.h || it.fontSize * LINE_HEIGHT) * 0.76}">${esc(lines[i])}</tspan>`));
        out.push("</text>");
        break;
      }
      case "sticky":
        out.push(`<rect x="${it.x}" y="${it.y}" width="${it.width}" height="${it.height}" rx="3" fill="${safeColor(it.color, "#fef08a")}"/>`);
        out.push(`<text font-family="sans-serif" font-size="15" fill="#1f2937">${esc(`${it.title ? it.title + ": " : ""}${it.text}`).split(/\n/).map((l, i) => `<tspan x="${it.x + 12}" y="${it.y + 30 + i * 20}">${l}</tspan>`).join("")}</text>`);
        break;
      case "checklist":
        out.push(`<rect x="${it.x}" y="${it.y}" width="${it.width}" height="${it.height}" rx="10" fill="${th.card}" stroke="${th.cardLine}"/>`);
        out.push(`<text font-family="sans-serif" font-size="16" fill="${th.dark ? th.ink : "#0f172a"}"><tspan x="${it.x + 14}" y="${it.y + 28}" font-weight="700">${esc(it.title)}</tspan>${(it.items || []).map((c, i) => `<tspan x="${it.x + 14}" y="${it.y + 62 + i * 30}">${c.checked ? "☑" : "☐"} ${esc(c.text)}</tspan>`).join("")}</text>`);
        break;
      case "table": {
        out.push(`<rect x="${it.x}" y="${it.y}" width="${it.width}" height="${it.height}" rx="10" fill="${th.card}" stroke="${th.cardLine}"/>`);
        const cols = Math.max(it.headers.length, 1);
        const rows = [it.headers, ...it.rows];
        out.push(`<text font-family="sans-serif" font-size="14" fill="${th.dark ? th.ink : "#0f172a"}">${rows.map((r, ri) => r.map((c, ci) => `<tspan x="${it.x + ci * (it.width / cols) + 8}" y="${it.y + 24 + ri * 32}"${ri === 0 ? ' font-weight="700"' : ""}>${esc(c)}</tspan>`).join("")).join("")}</text>`);
        break;
      }
      case "frame":
        out.push(`<rect x="${it.x}" y="${it.y}" width="${it.width}" height="${it.height}" rx="14" fill="none" stroke="${safeColor(inkOn(th, it.color))}" stroke-width="2" stroke-dasharray="9 6"/>`);
        if (it.title) out.push(`<text x="${it.x + 20}" y="${it.y + 20}" font-family="sans-serif" font-size="16" font-weight="700" fill="${safeColor(inkOn(th, it.color))}">${esc(it.title)}</text>`);
        break;
      case "image":
        if (it.src && it.src.startsWith("data:image/")) out.push(`<image href="${esc(it.src)}" x="${it.x}" y="${it.y}" width="${it.width}" height="${it.height}" preserveAspectRatio="xMidYMid meet"/>`);
        break;
      case "diagram":
        out.push(`<rect x="${it.x}" y="${it.y}" width="${it.width}" height="${it.height}" rx="10" fill="none" stroke="#6366f1" stroke-dasharray="6 5"/>`);
        out.push(`<text x="${it.x + 12}" y="${it.y + 24}" font-family="sans-serif" font-size="14" fill="#4338ca">${esc(`Diagram (${it.syntax})`)}</text>`);
        break;
      default:
        break;
    }
  }
  out.push("</svg>");
  return out.join("\n");
}
