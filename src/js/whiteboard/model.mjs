// Universal Vector Whiteboard Document Model
// One source of truth shared by the page (canvas, views), the 3D room board and the helper (server storage,
// the AI's tools): the server `require()`s this file too, so a board looks the same everywhere.
//
// A document has pages; a page has items in drawing order (the last one is on top). Every item says who made it
// (`author`: "user" | "ai" | "mission"), so both of you can see, and the AI can be told, whose work is whose.
// Everything that comes in (from the page, from the AI, from a file) goes through sanitizeItem(): numbers are
// clamped, colors checked, text capped, and pictures limited to ones the page can show without going online.

export const VERSION = 1;

export const ITEM_TYPES = {
  STROKE: "stroke",
  SHAPE: "shape",
  TEXT: "text",
  STICKY: "sticky",
  CHECKLIST: "checklist",
  TABLE: "table",
  IMAGE: "image",
  DIAGRAM: "diagram",
  FRAME: "frame",
};

export const SHAPE_TYPES = {
  RECT: "rect",
  ROUND_RECT: "round_rect",
  ELLIPSE: "ellipse",
  CIRCLE: "circle",
  TRIANGLE: "triangle",
  DIAMOND: "diamond",
  STAR: "star",
  HEXAGON: "hexagon",
  CYLINDER: "cylinder",
  CLOUD: "cloud",
  SPEECH_BUBBLE: "speech_bubble",
  LINE: "line",
  ARROW: "arrow",
  DOUBLE_ARROW: "double_arrow",
  CONNECTOR: "connector",
};

export const SHAPE_LIST = Object.values(SHAPE_TYPES);
export const LINE_SHAPES = ["line", "arrow", "double_arrow", "connector"];

export const BG_TYPES = {
  PLAIN: "plain",
  GRID: "grid",
  RULED: "ruled",
  DOTS: "dots",
  GRAPH: "graph",
  MUSIC: "music",
  ISOMETRIC: "isometric",
};

export const STICKY_COLORS = [
  "#fef08a", // soft yellow
  "#bae6fd", // soft sky blue
  "#bbf7d0", // soft mint green
  "#fbcfe8", // soft pink
  "#fed7aa", // soft peach
  "#e9d5ff", // soft lavender
];

export const PEN_STYLES = {
  MARKER: "marker",
  CHALK: "chalk",
  PEN: "pen",
  PENCIL: "pencil",
  HIGHLIGHTER: "highlighter",
};

export const FONT_FAMILIES = ["marker", "chalk", "sans", "serif", "mono"];
export const TEXT_FORMATS = ["plain", "markdown", "math", "code"];
export const ACTORS = ["user", "ai", "mission"];
export const ROUTES = ["straight", "elbow", "curve"];
export const PORTS = ["auto", "top", "right", "bottom", "left"];

// What a board may hold; bigger things are cut down instead of refused, so a long reply can't make a board unreadable
export const LIMITS = {
  pages: 100,
  itemsPerPage: 3000,
  strokePoints: 4000,
  text: 20000,
  code: 10000,
  title: 120,
  pageName: 60,
  tableRows: 100,
  tableCols: 20,
  checklistItems: 200,
  imageData: 4_000_000, // characters of a data: picture
  coordinate: 100000,
  size: 20000,
};

// Colors people (and the AI) say in words
export const COLOR_NAMES = {
  black: "#111827", white: "#ffffff", gray: "#6b7280", grey: "#6b7280", red: "#dc2626", orange: "#ea580c", amber: "#d97706",
  yellow: "#facc15", lime: "#84cc16", green: "#16a34a", teal: "#0d9488", cyan: "#0891b2", blue: "#2563eb", indigo: "#4f46e5",
  purple: "#9333ea", violet: "#7c3aed", pink: "#db2777", magenta: "#c026d3", brown: "#92400e", navy: "#1e3a8a", gold: "#ca8a04",
  silver: "#9ca3af", beige: "#e7d9bd", mint: "#bbf7d0", peach: "#fed7aa", lavender: "#e9d5ff", sky: "#bae6fd", cream: "#fef3c7",
  transparent: "transparent", none: "transparent",
};
// Sticky notes are paler
const STICKY_NAMES = { yellow: STICKY_COLORS[0], blue: STICKY_COLORS[1], green: STICKY_COLORS[2], pink: STICKY_COLORS[3], orange: STICKY_COLORS[4], peach: STICKY_COLORS[4], purple: STICKY_COLORS[5], lavender: STICKY_COLORS[5], violet: STICKY_COLORS[5], sky: STICKY_COLORS[1], mint: STICKY_COLORS[2] };

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC = /^(?:rgb|rgba|hsl|hsla)\(\s*[-\d.%\s,\/]+\)$/i;

// A color the canvas can use, or the fallback. Words become hex; nothing else (url(), var(), expression…) passes.
export function color(value, fallback = "#1e293b", { sticky = false } = {}) {
  if (typeof value !== "string") return fallback;
  const v = value.trim().toLowerCase();
  if (!v || v.length > 40) return fallback;
  if (HEX.test(v)) return v.length === 4 || v.length === 5 ? "#" + [...v.slice(1)].map((c) => c + c).join("") : v;
  if (FUNC.test(v)) return v;
  if (sticky && STICKY_NAMES[v]) return STICKY_NAMES[v];
  if (COLOR_NAMES[v]) return COLOR_NAMES[v];
  return fallback;
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const num = (v, fallback = 0, min = -LIMITS.coordinate, max = LIMITS.coordinate) => {
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
};
const r1 = (n) => Math.round(n * 10) / 10;
const str = (v, max = 200) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const actor = (v) => (ACTORS.includes(v) ? v : "user");
const bool = (v) => v === true || v === "true";

// Short ids: a letter for what it is, then a few random characters (`t7f2k`). Short, so the AI can name an item
// reliably and a board stays small. Old long ids from earlier boards still work: an id is any word of up to 64 characters.
const ID_LETTER = { stroke: "k", shape: "r", text: "t", sticky: "n", checklist: "c", table: "b", image: "i", diagram: "d", frame: "f", page: "p", board: "w", chk: "x", item: "o" };
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export const ID_PATTERN = /^[\w-]{1,64}$/;

export function genId(prefix = "item") {
  let tail = "";
  const bytes = typeof crypto !== "undefined" && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(5)) : Array.from({ length: 5 }, () => Math.floor(Math.random() * 256));
  for (let i = 0; i < 5; i++) tail += ALPHABET[bytes[i] % 36];
  return `${ID_LETTER[prefix] || prefix[0] || "o"}${tail}`;
}

const idOf = (value, prefix) => (typeof value === "string" && ID_PATTERN.test(value) ? value : genId(prefix));

export function createDocument({
  id,
  title = "Untitled Board",
  scope = "general", // general | chat | character | mission
  scopeId = "",
  author = "user",
  settings = {},
  pages = [],
  createdAt,
  activePageIndex = 0,
  rev = 0,
} = {}) {
  const list = Array.isArray(pages) ? pages.slice(0, LIMITS.pages) : [];
  const doc = {
    id: idOf(id, "board"),
    title: str(title || "Untitled Board", LIMITS.title).trim() || "Untitled Board",
    version: VERSION,
    rev: Math.max(0, Math.floor(num(rev, 0, 0, 1e12))),
    scope: str(scope || "general", 40),
    scopeId: str(scopeId || "", 80),
    author: actor(author),
    createdAt: num(createdAt, Date.now(), 0, 1e15) || Date.now(),
    updatedAt: Date.now(),
    activePageIndex: 0,
    settings: sanitizeDocSettings(settings),
    pages: list.length > 0 ? list.map((p, i) => createPage({ ...p, name: p?.name || `Page ${i + 1}` })) : [createPage({ name: "Page 1" })],
  };
  doc.activePageIndex = clamp(Math.floor(num(activePageIndex, 0, 0, 1e6)), 0, doc.pages.length - 1);
  return doc;
}

export function sanitizeDocSettings(s = {}) {
  const x = s && typeof s === "object" ? s : {};
  return {
    background: oneOf(x.background, Object.values(BG_TYPES), BG_TYPES.GRID),
    bgColor: color(x.bgColor, "#ffffff"),
    gridColor: color(x.gridColor, "#e2e8f0"),
    gridSize: num(x.gridSize, 24, 8, 128) || 24,
    infinite: x.infinite !== false,
    zoom: num(x.zoom, 1, 0.1, 8) || 1,
    panX: num(x.panX, 0),
    panY: num(x.panY, 0),
  };
}

export function createPage({ id, name = "Page 1", title, background = {}, items = [], createdAt } = {}) {
  const bg = background && typeof background === "object" ? background : {};
  const page = {
    id: idOf(id, "page"),
    name: str(name || title || "Page 1", LIMITS.pageName).trim() || "Page 1",
    createdAt: num(createdAt, Date.now(), 0, 1e15) || Date.now(),
    background: {
      type: oneOf(bg.type, Object.values(BG_TYPES), BG_TYPES.GRID),
      color: color(bg.color, "#ffffff"),
      patternColor: color(bg.patternColor, "#e2e8f0"),
      size: num(bg.size, 24, 8, 128) || 24,
    },
    items: [],
  };
  if (Array.isArray(items)) {
    const seen = new Set();
    for (const [idx, raw] of items.slice(0, LIMITS.itemsPerPage).entries()) {
      const item = sanitizeItem(raw, idx);
      if (seen.has(item.id)) item.id = genId(item.type);
      seen.add(item.id);
      page.items.push(item);
    }
  }
  return page;
}

// ---------- Items ----------
// What every kind of item carries
function base(opts, type) {
  const now = Date.now();
  const created = num(opts.createdAt, 0, 0, 1e15) || now;
  const out = {
    id: idOf(opts.id, type),
    type,
    author: actor(opts.author),
    createdAt: created,
    updatedAt: num(opts.updatedAt, created, 0, 1e15) || created,
  };
  if (bool(opts.locked)) out.locked = true;
  if (typeof opts.group === "string" && ID_PATTERN.test(opts.group)) out.group = opts.group;
  if (typeof opts.name === "string" && opts.name.trim()) out.name = str(opts.name.trim(), 60);
  return out;
}

export function createStroke(opts = {}) {
  const raw = Array.isArray(opts.points) ? opts.points : [];
  // Long strokes are thinned (keeping the ends) so one scribble can't swell a board
  const step = raw.length > LIMITS.strokePoints ? raw.length / LIMITS.strokePoints : 1;
  const points = [];
  for (let i = 0; i < raw.length && points.length < LIMITS.strokePoints; i += step) {
    const pt = raw[Math.floor(i)] || {};
    points.push({ x: r1(num(pt.x)), y: r1(num(pt.y)), p: Math.round(num(pt.p ?? 0.5, 0.5, 0, 1) * 100) / 100, t: Math.round(num(pt.t ?? 0, 0, 0, 3_600_000)) });
  }
  const last = raw.length ? raw[raw.length - 1] : null;
  if (last && points.length && (points[points.length - 1].x !== r1(num(last.x)) || points[points.length - 1].y !== r1(num(last.y)))) {
    points.push({ x: r1(num(last.x)), y: r1(num(last.y)), p: Math.round(num(last.p ?? 0.5, 0.5, 0, 1) * 100) / 100, t: Math.round(num(last.t ?? 0, 0, 0, 3_600_000)) });
  }
  const duration = num(opts.duration, 0, 0, 3_600_000) || (points.length > 1 ? Math.max(0, points[points.length - 1].t - points[0].t) : 0);
  const style = String(opts.style || "marker").toLowerCase();
  return {
    ...base(opts, "stroke"),
    points,
    color: color(opts.color, "#1e293b"),
    size: clamp(num(opts.size ?? opts.width, 3), 1, 64) || 3,
    opacity: clamp(num(opts.opacity, 1), 0.05, 1),
    style: Object.values(PEN_STYLES).includes(style) ? style : "marker",
    t0: num(opts.t0, 0, 0, 1e15) || Date.now(),
    duration,
  };
}

export function createShape(opts = {}) {
  const shapeType = String(opts.shapeType || opts.shape || SHAPE_TYPES.RECT).toLowerCase();
  const kind = SHAPE_LIST.includes(shapeType) ? shapeType : SHAPE_TYPES.RECT;
  const fill = opts.fillColor ?? opts.fill;
  const stroke = opts.strokeColor ?? opts.stroke;
  const strokeWidth = opts.strokeWidth === undefined || opts.strokeWidth === null ? 2 : num(opts.strokeWidth, 2, 0, 32);
  const out = {
    ...base(opts, "shape"),
    shapeType: kind,
    x: r1(num(opts.x)),
    y: r1(num(opts.y)),
    width: r1(num(opts.width, 120, -LIMITS.size, LIMITS.size)) || 120,
    height: r1(num(opts.height, 80, -LIMITS.size, LIMITS.size)) || 80,
    strokeColor: stroke === "none" ? "transparent" : color(stroke, "#1e293b"),
    fillColor: fill === undefined || fill === null || fill === "" ? "transparent" : fill === "none" ? "transparent" : color(fill, "transparent"),
    strokeWidth,
    strokeStyle: oneOf(opts.strokeStyle, ["solid", "dashed", "dotted"], "solid"),
    opacity: clamp(num(opts.opacity, 1), 0.05, 1),
    rotation: num(opts.rotation, 0, -360, 360),
  };
  if (opts.label) out.label = str(opts.label, 200);
  if (opts.labelColor) out.labelColor = color(opts.labelColor, "#1e293b");
  if (opts.fontSize) out.fontSize = clamp(num(opts.fontSize, 16), 8, 96);
  if (kind === "round_rect" || kind === "rect") out.radius = clamp(num(opts.radius, kind === "round_rect" ? 14 : 0), 0, 200);
  if (LINE_SHAPES.includes(kind)) {
    out.arrowStart = bool(opts.arrowStart) || kind === "double_arrow";
    out.arrowEnd = opts.arrowEnd === undefined ? kind === "arrow" || kind === "double_arrow" || kind === "connector" : bool(opts.arrowEnd);
    out.route = oneOf(opts.route, ROUTES, "straight");
    let pts = Array.isArray(opts.points) ? opts.points.slice(0, 64).map((p) => ({ x: r1(num(p?.x)), y: r1(num(p?.y)) })) : [];
    // An old line: from (x, y) to (x + width, y + height)
    if (pts.length < 2) pts = [{ x: out.x, y: out.y }, { x: r1(out.x + out.width), y: r1(out.y + out.height) }];
    out.points = pts;
    if (kind === "connector") {
      const end = (e) => (e && typeof e === "object" && typeof e.id === "string" && ID_PATTERN.test(e.id) ? { id: e.id, port: oneOf(e.port, PORTS, "auto") } : null);
      const from = end(opts.from);
      const to = end(opts.to);
      if (from) out.from = from;
      if (to) out.to = to;
      if (Array.isArray(opts.sides) && opts.sides.length === 2 && opts.sides.every((s) => ["top", "right", "bottom", "left"].includes(s))) out.sides = [opts.sides[0], opts.sides[1]];
    }
    const box = pointsBox(pts, out.strokeWidth);
    out.x = box.minX;
    out.y = box.minY;
    out.width = Math.max(1, box.maxX - box.minX);
    out.height = Math.max(1, box.maxY - box.minY);
  }
  return out;
}

function pointsBox(points, pad = 0) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const h = pad / 2;
  return { minX: r1(minX - h), minY: r1(minY - h), maxX: r1(maxX + h), maxY: r1(maxY + h) };
}

export function createText(opts = {}) {
  const format = oneOf(opts.format, TEXT_FORMATS, "plain");
  const out = {
    ...base(opts, "text"),
    text: str(opts.text, format === "code" ? LIMITS.code : LIMITS.text),
    x: r1(num(opts.x)),
    y: r1(num(opts.y)),
    width: Math.max(20, r1(num(opts.width, 240, 0, LIMITS.size))),
    height: Math.max(20, r1(num(opts.height, 40, 0, LIMITS.size))),
    fontSize: clamp(num(opts.fontSize, 20), 8, 160),
    fontFamily: oneOf(opts.fontFamily, FONT_FAMILIES, "marker"),
    color: color(opts.color, "#1e293b"),
    align: oneOf(opts.align, ["left", "center", "right"], "left"),
    format,
    language: str(opts.language, 30),
    rotation: num(opts.rotation, 0, -360, 360),
  };
  if (bool(opts.handwriting)) out.handwriting = true;
  if (opts.bold) out.bold = true;
  if (opts.italic) out.italic = true;
  if (opts.underline) out.underline = true;
  if (opts.background) out.background = color(opts.background, "transparent");
  return out;
}

export function createSticky(opts = {}) {
  return {
    ...base(opts, "sticky"),
    title: str(opts.title, 100),
    text: str(opts.text, LIMITS.text),
    x: r1(num(opts.x)),
    y: r1(num(opts.y)),
    width: clamp(r1(num(opts.width, 160)), 80, 600),
    height: clamp(r1(num(opts.height, 160)), 80, 600),
    color: color(opts.color, STICKY_COLORS[0], { sticky: true }),
    tilt: clamp(num(opts.tilt, 0), -10, 10),
    pinned: opts.pinned !== false,
  };
}

export function createChecklist(opts = {}) {
  const list = Array.isArray(opts.items) ? opts.items : [];
  return {
    ...base(opts, "checklist"),
    title: str(opts.title || "Checklist", 100),
    items: list.slice(0, LIMITS.checklistItems).map((it) => {
      const o = it && typeof it === "object" ? it : { text: it };
      return { id: idOf(o.id, "chk"), text: str(o.text, 300), checked: bool(o.checked) || bool(o.done) };
    }),
    x: r1(num(opts.x)),
    y: r1(num(opts.y)),
    width: Math.max(120, r1(num(opts.width, 240, 0, LIMITS.size))),
    height: Math.max(60, r1(num(opts.height, 140, 0, LIMITS.size))),
    color: color(opts.color, "#ffffff"),
    strokeColor: color(opts.strokeColor, "#cbd5e1"),
  };
}

export function createTable(opts = {}) {
  const cell = (c) => str(c, 300);
  const headers = Array.isArray(opts.headers) ? opts.headers.slice(0, LIMITS.tableCols).map(cell) : [];
  const rows = Array.isArray(opts.rows) ? opts.rows.slice(0, LIMITS.tableRows).map((r) => (Array.isArray(r) ? r.slice(0, LIMITS.tableCols).map(cell) : [])) : [];
  const out = {
    ...base(opts, "table"),
    title: str(opts.title, 100),
    headers,
    rows,
    x: r1(num(opts.x)),
    y: r1(num(opts.y)),
    width: Math.max(100, r1(num(opts.width, 360, 0, LIMITS.size))),
    height: Math.max(60, r1(num(opts.height, 180, 0, LIMITS.size))),
    strokeColor: color(opts.strokeColor, "#94a3b8"),
    headerBg: color(opts.headerBg, "#f1f5f9"),
  };
  return out;
}

// A picture the page can show without going online: a data: picture, or one the helper keeps (/api/whiteboards/assets/…)
export const IMAGE_SRC = /^(?:data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+|\/api\/whiteboards\/assets\/[\w-]+\/[\w.-]+)$/;

export function safeImageSrc(value) {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s || s.length > LIMITS.imageData) return "";
  return IMAGE_SRC.test(s) ? s : "";
}

export function createImageItem(opts = {}) {
  return {
    ...base(opts, "image"),
    src: safeImageSrc(opts.src ?? opts.url),
    mime: str(opts.mime || "image/png", 40),
    x: r1(num(opts.x)),
    y: r1(num(opts.y)),
    width: Math.max(30, r1(num(opts.width, 240, 0, LIMITS.size))),
    height: Math.max(30, r1(num(opts.height, 180, 0, LIMITS.size))),
    fit: oneOf(opts.fit, ["contain", "cover"], "contain"),
    caption: str(opts.caption, 150),
    rotation: num(opts.rotation, 0, -360, 360),
  };
}

export function createDiagram(opts = {}) {
  return {
    ...base(opts, "diagram"),
    syntax: oneOf(opts.syntax || opts.diagramType, ["mermaid", "graph"], "mermaid"),
    code: str(opts.code, LIMITS.code),
    x: r1(num(opts.x)),
    y: r1(num(opts.y)),
    width: Math.max(100, r1(num(opts.width, 400, 0, LIMITS.size))),
    height: Math.max(60, r1(num(opts.height, 260, 0, LIMITS.size))),
  };
}

export function createFrame(opts = {}) {
  return {
    ...base(opts, "frame"),
    title: str(opts.title, 100),
    x: r1(num(opts.x)),
    y: r1(num(opts.y)),
    width: Math.max(60, r1(num(opts.width, 360, 0, LIMITS.size))),
    height: Math.max(60, r1(num(opts.height, 280, 0, LIMITS.size))),
    color: color(opts.color, "#94a3b8"),
    fillColor: color(opts.fillColor ?? opts.fill, "transparent"),
  };
}

export function createItem(opts = {}) {
  const type = String(opts.kind || opts.type || "shape").toLowerCase();
  if (type === "table") {
    // The tools give all the rows, the first being the header
    const rawRows = opts.rows || [];
    if (rawRows.length > 0 && Array.isArray(rawRows[0]) && !opts.headers) return createTable({ ...opts, headers: rawRows[0], rows: rawRows.slice(1) });
  }
  return sanitizeItem({ ...opts, type });
}

export function sanitizeItem(item, idx = 0) {
  if (!item || typeof item !== "object") return createShape({ id: genId("shape") });
  const type = String(item.type || item.kind || "").toLowerCase();
  switch (type) {
    case ITEM_TYPES.STROKE:
      return createStroke(item);
    case ITEM_TYPES.SHAPE:
      return createShape(item);
    case ITEM_TYPES.TEXT:
      return createText(item);
    case ITEM_TYPES.STICKY:
      return createSticky(item);
    case ITEM_TYPES.CHECKLIST:
      return createChecklist(item);
    case ITEM_TYPES.TABLE:
      return createTable(item);
    case ITEM_TYPES.IMAGE:
      return createImageItem(item);
    case ITEM_TYPES.DIAGRAM:
      return createDiagram(item);
    case ITEM_TYPES.FRAME:
      return createFrame(item);
    default:
      void idx;
      return createShape({ ...item, shapeType: item.shapeType || SHAPE_TYPES.RECT });
  }
}

// A whole document from anything that looks like one (a file, a restore, an older board)
export function sanitizeDocument(raw) {
  if (!raw || typeof raw !== "object") return createDocument();
  return createDocument(raw);
}

// ---------- Geometry & Spatial Queries ----------
const EMPTY_BOX = { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, cx: 0, cy: 0 };

export function getBoundingBox(item) {
  if (!item) return { ...EMPTY_BOX };

  if (item.type === ITEM_TYPES.STROKE) {
    if (!item.points || item.points.length === 0) return { ...EMPTY_BOX };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const pad = (item.size || 3) / 2;
    for (const p of item.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY), cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }

  const x = Number(item.x) || 0;
  const y = Number(item.y) || 0;
  const w = Number(item.width) || 0;
  const h = Number(item.height) || 0;
  const minX = Math.min(x, x + w);
  const minY = Math.min(y, y + h);
  const maxX = Math.max(x, x + w);
  const maxY = Math.max(y, y + h);
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY), cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export function getSelectionBoundingBox(items = []) {
  if (!items || items.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const it of items) {
    const bb = getBoundingBox(it);
    if (bb.minX < minX) minX = bb.minX;
    if (bb.minY < minY) minY = bb.minY;
    if (bb.maxX > maxX) maxX = bb.maxX;
    if (bb.maxY > maxY) maxY = bb.maxY;
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export function pageBox(page) {
  return getSelectionBoundingBox(page?.items || []);
}

function distSq(p1, p2) {
  return (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
}

function distToSegmentSquared(p, v, w) {
  const l2 = distSq(v, w);
  if (l2 === 0) return distSq(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return distSq(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}

// Is the point on the item? Strokes and lines must be touched; a frame only by its title bar or edge (so what is
// inside it can be picked); a shape with no fill by its outline; everything else anywhere inside.
export function hitTest(item, x, y, tolerance = 8) {
  if (!item) return false;
  const bb = getBoundingBox(item);
  if (x < bb.minX - tolerance || x > bb.maxX + tolerance || y < bb.minY - tolerance || y > bb.maxY + tolerance) return false;

  if (item.type === ITEM_TYPES.STROKE) {
    const pts = item.points || [];
    const r2 = Math.pow(Math.max(tolerance, (item.size || 3) / 2 + 4), 2);
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegmentSquared({ x, y }, pts[i], pts[i + 1]) <= r2) return true;
    }
    return pts.length === 1 && distSq({ x, y }, pts[0]) <= r2;
  }
  if (item.type === ITEM_TYPES.SHAPE && LINE_SHAPES.includes(item.shapeType) && Array.isArray(item.points)) {
    const r2 = Math.pow(Math.max(tolerance, (item.strokeWidth || 2) / 2 + 4), 2);
    for (let i = 0; i < item.points.length - 1; i++) {
      if (distToSegmentSquared({ x, y }, item.points[i], item.points[i + 1]) <= r2) return true;
    }
    return false;
  }
  if (item.type === ITEM_TYPES.FRAME) {
    const edge = Math.max(tolerance, 12);
    const inner = x > bb.minX + edge && x < bb.maxX - edge && y > bb.minY + 34 && y < bb.maxY - edge;
    return !inner;
  }
  if (item.type === ITEM_TYPES.SHAPE && (!item.fillColor || item.fillColor === "transparent") && item.strokeWidth > 0 && ["rect", "round_rect", "ellipse", "circle", "triangle", "diamond", "hexagon", "star"].includes(item.shapeType)) {
    // An empty shape is picked by its outline or by what it says
    const edge = Math.max(tolerance, (item.strokeWidth || 2) + 6);
    const inner = x > bb.minX + edge && x < bb.maxX - edge && y > bb.minY + edge && y < bb.maxY - edge;
    return !inner || Boolean(item.label);
  }
  return true;
}

export function hitTestBox(item, minX, minY, maxX, maxY) {
  const bb = getBoundingBox(item);
  return bb.maxX >= minX && bb.minX <= maxX && bb.maxY >= minY && bb.minY <= maxY;
}

// ---------- Item Manipulations (on a page, in place) ----------
export function addItem(page, item) {
  const sanitized = sanitizeItem(item, page.items.length);
  page.items.push(sanitized);
  return sanitized;
}

export function updateItem(page, id, patch = {}) {
  const idx = page.items.findIndex((it) => it.id === id);
  if (idx === -1) return null;
  const curr = page.items[idx];
  const next = { ...curr, ...patch, id: curr.id, type: curr.type, updatedAt: Date.now() };
  for (const k of Object.keys(patch)) if (patch[k] === null) delete next[k];
  const updated = sanitizeItem(next);
  page.items[idx] = updated;
  return updated;
}

export function removeItem(page, id) {
  const idx = page.items.findIndex((it) => it.id === id);
  if (idx === -1) return false;
  page.items.splice(idx, 1);
  return true;
}

export function getItem(page, id) {
  return page?.items?.find((it) => it.id === id) || null;
}

export function moveItem(page, id, dx, dy) {
  const it = getItem(page, id);
  if (!it) return false;
  translateItem(it, dx, dy);
  return true;
}

export function translateItem(it, dx, dy) {
  if (it.type === ITEM_TYPES.STROKE) {
    for (const p of it.points) {
      p.x = r1(p.x + dx);
      p.y = r1(p.y + dy);
    }
  } else {
    it.x = r1((Number(it.x) || 0) + dx);
    it.y = r1((Number(it.y) || 0) + dy);
    if (Array.isArray(it.points)) for (const p of it.points) { p.x = r1(p.x + dx); p.y = r1(p.y + dy); }
  }
  return it;
}

export function scaleItem(page, id, sx, sy, originX = 0, originY = 0) {
  const it = getItem(page, id);
  if (!it) return false;
  if (it.type === ITEM_TYPES.STROKE) {
    for (const p of it.points) {
      p.x = originX + (p.x - originX) * sx;
      p.y = originY + (p.y - originY) * sy;
    }
  } else {
    const x = Number(it.x) || 0;
    const y = Number(it.y) || 0;
    it.x = originX + (x - originX) * sx;
    it.y = originY + (y - originY) * sy;
    it.width = Math.max(10, (Number(it.width) || 10) * Math.abs(sx));
    it.height = Math.max(10, (Number(it.height) || 10) * Math.abs(sy));
    if (Array.isArray(it.points)) for (const p of it.points) { p.x = originX + (p.x - originX) * sx; p.y = originY + (p.y - originY) * sy; }
  }
  return true;
}

export function reorderItem(page, id, action) {
  const idx = page.items.findIndex((it) => it.id === id);
  if (idx === -1) return false;
  const it = page.items[idx];
  const last = page.items.length - 1;
  let to = idx;
  if (typeof action === "number") to = clamp(Math.floor(action), 0, last);
  else if (action === "bring_to_front" || action === "front") to = last;
  else if (action === "send_to_back" || action === "back") to = 0;
  else if (action === "bring_forward" || action === "forward") to = Math.min(last, idx + 1);
  else if (action === "send_backward" || action === "backward") to = Math.max(0, idx - 1);
  else return false;
  if (to === idx) return action === "bring_to_front" || action === "front" || action === "send_to_back" || action === "back" ? true : false;
  page.items.splice(idx, 1);
  page.items.splice(to, 0, it);
  return true;
}

// ---------- Undo / Redo Transaction Manager (single page, used by simple callers and tests) ----------
export function createUndoStack(maxDepth = 50) {
  return { undoList: [], redoList: [], maxDepth };
}

export function pushUndoAction(stack, action) {
  if (!stack) return;
  stack.undoList.push(action);
  if (stack.undoList.length > stack.maxDepth) stack.undoList.shift();
  stack.redoList = []; // clear redo on new action
}

export function undo(page, stack) {
  if (!stack || stack.undoList.length === 0) return null;
  const action = stack.undoList.pop();
  const inverse = applyInverseAction(page, action);
  stack.redoList.push(action);
  return inverse;
}

export function redo(page, stack) {
  if (!stack || stack.redoList.length === 0) return null;
  const action = stack.redoList.pop();
  applyAction(page, action);
  stack.undoList.push(action);
  return action;
}

function applyAction(page, action) {
  switch (action.type) {
    case "add":
      addItem(page, action.item);
      break;
    case "remove":
      removeItem(page, action.id);
      break;
    case "update":
      updateItem(page, action.id, action.after);
      break;
    case "clear":
      page.items = [];
      break;
  }
}

function applyInverseAction(page, action) {
  switch (action.type) {
    case "add":
      removeItem(page, action.item.id);
      break;
    case "remove":
      page.items.splice(action.index ?? page.items.length, 0, action.item);
      break;
    case "update":
      updateItem(page, action.id, action.before);
      break;
    case "clear":
      page.items = [...(action.items || [])];
      break;
  }
}

// ---------- Chronological Replay Timeline ----------
export function getReplayTimeline(page) {
  if (!page || !Array.isArray(page.items)) return [];
  const events = [];

  for (const it of page.items) {
    if (it.type === ITEM_TYPES.STROKE && it.points?.length > 0) {
      const baseTime = it.t0 || 0;
      events.push({ type: "stroke_start", itemId: it.id, time: baseTime, color: it.color, size: it.size, style: it.style, point: it.points[0] });
      for (let i = 1; i < it.points.length; i++) {
        events.push({ type: "stroke_move", itemId: it.id, time: baseTime + (it.points[i].t || 0), point: it.points[i] });
      }
      events.push({ type: "stroke_end", itemId: it.id, time: baseTime + (it.duration || (it.points[it.points.length - 1].t || 0)) });
    } else {
      events.push({ type: "item_place", itemId: it.id, item: it, time: it.createdAt || it.t0 || 0 });
    }
  }

  events.sort((a, b) => a.time - b.time);
  return events;
}

// ---------- A short brief of one item, for logs and lists ----------
export function itemLabel(it, max = 60) {
  if (!it) return "";
  const clip = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max);
  switch (it.type) {
    case ITEM_TYPES.TEXT:
      return clip(it.text);
    case ITEM_TYPES.STICKY:
      return clip(it.title ? `${it.title}: ${it.text}` : it.text);
    case ITEM_TYPES.CHECKLIST:
      return clip(it.title);
    case ITEM_TYPES.TABLE:
      return clip(it.title || (it.headers || []).join(" | "));
    case ITEM_TYPES.DIAGRAM:
      return clip(it.code);
    case ITEM_TYPES.IMAGE:
      return clip(it.caption);
    case ITEM_TYPES.FRAME:
      return clip(it.title);
    case ITEM_TYPES.SHAPE:
      return clip(it.label);
    default:
      return "";
  }
}

// ---------- Structured Text Summary for AI & Search ----------
export function documentToText(doc) {
  if (!doc) return "";
  const lines = [`# ${doc.title || "Whiteboard"}`];

  (doc.pages || []).forEach((page, pIdx) => {
    lines.push(`\n## Page ${pIdx + 1}: ${page.name}`);
    for (const it of page.items || []) {
      if (it.type === ITEM_TYPES.TEXT && it.text) {
        lines.push(`- [Text] ${it.text}`);
      } else if (it.type === ITEM_TYPES.STICKY) {
        lines.push(`- [Sticky note${it.title ? ` "${it.title}"` : ""}] ${it.text}`);
      } else if (it.type === ITEM_TYPES.CHECKLIST) {
        lines.push(`- [Checklist "${it.title}"]`);
        (it.items || []).forEach((c) => lines.push(`  - [${c.checked ? "x" : " "}] ${c.text}`));
      } else if (it.type === ITEM_TYPES.TABLE) {
        lines.push(`- [Table${it.title ? ` "${it.title}"` : ""}] Headers: ${(it.headers || []).join(" | ")}`);
        (it.rows || []).forEach((r) => lines.push(`  | ${(r || []).join(" | ")} |`));
      } else if (it.type === ITEM_TYPES.DIAGRAM && it.code) {
        lines.push(`- [Diagram (${it.syntax})]:\n\`\`\`${it.syntax}\n${it.code}\n\`\`\``);
      } else if (it.type === ITEM_TYPES.FRAME && it.title) {
        lines.push(`- [Frame] ${it.title}`);
      } else if (it.type === ITEM_TYPES.IMAGE) {
        lines.push(`- [Image]${it.caption ? ` ${it.caption}` : ""}`);
      } else if (it.type === ITEM_TYPES.SHAPE) {
        lines.push(`- [Shape: ${it.shapeType}${it.label ? ` "${it.label}"` : ""}] at (${Math.round(it.x)}, ${Math.round(it.y)})`);
      }
    }
    if (!page.items || page.items.length === 0) lines.push("(empty page)");
  });

  return lines.join("\n");
}
