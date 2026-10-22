// Node.js CommonJS bridge for whiteboard document model
let modelPromise = null;

async function getModel() {
  if (!modelPromise) {
    modelPromise = import("../src/js/whiteboard/model.mjs");
  }
  return modelPromise;
}

const VERSION = 1;

const ITEM_TYPES = Object.freeze({
  STROKE: "stroke",
  SHAPE: "shape",
  TEXT: "text",
  STICKY: "sticky",
  CHECKLIST: "checklist",
  TABLE: "table",
  IMAGE: "image",
  DIAGRAM: "diagram",
});

const SHAPE_TYPES = Object.freeze({
  RECT: "rect",
  CIRCLE: "circle",
  ELLIPSE: "ellipse",
  TRIANGLE: "triangle",
  STAR: "star",
  CYLINDER: "cylinder",
  CLOUD: "cloud",
  SPEECH_BUBBLE: "speech_bubble",
  ARROW: "arrow",
});

const STICKY_COLORS = Object.freeze(["#fef3c7", "#fce7f3", "#dbeafe", "#dcfce7", "#ffedd5"]);

function genId(prefix = "item") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createDocument(opts = {}) {
  const pages = opts.pages || [];
  return {
    id: String(opts.id || genId("board")),
    title: String(opts.title || "Untitled Board").trim().slice(0, 120),
    version: VERSION,
    scope: String(opts.scope || "general"),
    scopeId: String(opts.scopeId || ""),
    author: String(opts.author || "user"),
    createdAt: Number(opts.createdAt) || Date.now(),
    updatedAt: Date.now(),
    activePageIndex: Math.max(0, Number(opts.activePageIndex) || 0),
    settings: {
      background: opts.settings?.background || "grid",
      bgColor: opts.settings?.bgColor || "#ffffff",
      gridColor: opts.settings?.gridColor || "#e2e8f0",
      gridSize: Number(opts.settings?.gridSize) || 24,
      infinite: opts.settings?.infinite !== false,
      zoom: Number(opts.settings?.zoom) || 1,
      panX: Number(opts.settings?.panX) || 0,
      panY: Number(opts.settings?.panY) || 0,
    },
    pages: pages.length > 0 ? pages.map((p, i) => createPage({ ...p, name: p.name || `Page ${i + 1}` })) : [createPage({ name: "Page 1" })],
  };
}

function createPage(opts = {}) {
  return {
    id: String(opts.id || genId("page")),
    name: String(opts.name || opts.title || "Page 1").trim().slice(0, 60),
    createdAt: Number(opts.createdAt) || Date.now(),
    background: {
      type: opts.background?.type || "grid",
      color: opts.background?.color || "#ffffff",
      patternColor: opts.background?.patternColor || "#e2e8f0",
      size: Number(opts.background?.size) || 24,
    },
    items: Array.isArray(opts.items) ? opts.items.map(sanitizeItem) : [],
  };
}

function createStroke(opts = {}) {
  const pts = (opts.points || []).map((pt, i) => ({
    x: Number(pt.x) || 0,
    y: Number(pt.y) || 0,
    p: Number(pt.p ?? 0.5),
    t: Number(pt.t ?? i * 20),
  }));
  return {
    id: String(opts.id || genId("stroke")),
    type: ITEM_TYPES.STROKE,
    points: pts,
    color: String(opts.color || "#1e293b"),
    size: Math.max(1, Math.min(64, Number(opts.size || opts.width) || 3)),
    opacity: Math.max(0.05, Math.min(1, Number(opts.opacity) || 1)),
    style: String(opts.style || "marker"),
    t0: Number(opts.t0) || Date.now(),
    duration: Math.max(0, Number(opts.duration) || (pts.length > 1 ? pts[pts.length - 1].t : 0)),
    author: String(opts.author || "user"),
  };
}

function createShape(opts = {}) {
  return {
    id: String(opts.id || genId("shape")),
    type: ITEM_TYPES.SHAPE,
    shapeType: String(opts.shapeType || opts.shape || SHAPE_TYPES.RECT),
    x: Number(opts.x) || 0,
    y: Number(opts.y) || 0,
    width: Math.max(10, Number(opts.width) || 120),
    height: Math.max(10, Number(opts.height) || 80),
    strokeColor: String(opts.strokeColor || opts.stroke || "#1e293b"),
    fillColor: String(opts.fillColor || opts.fill || "transparent"),
    strokeWidth: Math.max(0, Math.min(32, Number(opts.strokeWidth ?? 2))),
    strokeStyle: String(opts.strokeStyle || "solid"),
    label: String(opts.label || ""),
    opacity: Number.isFinite(Number(opts.opacity)) ? Number(opts.opacity) : 1,
    author: String(opts.author || "user"),
  };
}

function createText(opts = {}) {
  return {
    id: String(opts.id || genId("text")),
    type: ITEM_TYPES.TEXT,
    text: String(opts.text || ""),
    x: Number(opts.x) || 0,
    y: Number(opts.y) || 0,
    width: Math.max(20, Number(opts.width) || 200),
    height: Math.max(20, Number(opts.height) || 40),
    fontSize: Math.max(8, Math.min(128, Number(opts.fontSize) || 20)),
    color: String(opts.color || "#1e293b"),
    handwriting: Boolean(opts.handwriting),
    author: String(opts.author || "user"),
  };
}

function createSticky(opts = {}) {
  return {
    id: String(opts.id || genId("sticky")),
    type: ITEM_TYPES.STICKY,
    title: String(opts.title || "").slice(0, 100),
    text: String(opts.text || ""),
    x: Number(opts.x) || 0,
    y: Number(opts.y) || 0,
    width: Math.max(80, Math.min(480, Number(opts.width) || 160)),
    height: Math.max(80, Math.min(480, Number(opts.height) || 160)),
    color: String(opts.color || STICKY_COLORS[0]),
    tilt: Math.max(-10, Math.min(10, Number(opts.tilt) || 0)),
    author: String(opts.author || "user"),
  };
}

function createChecklist(opts = {}) {
  return {
    id: String(opts.id || genId("checklist")),
    type: ITEM_TYPES.CHECKLIST,
    title: String(opts.title || "Checklist").slice(0, 100),
    items: Array.isArray(opts.items)
      ? opts.items.map((it) => ({
          id: it.id || genId("chk"),
          text: String(it.text || it),
          checked: Boolean(it.checked || it.done),
        }))
      : [],
    x: Number(opts.x) || 0,
    y: Number(opts.y) || 0,
    width: Math.max(120, Number(opts.width) || 220),
    height: Math.max(60, Number(opts.height) || 140),
    color: String(opts.color || "#ffffff"),
    strokeColor: String(opts.strokeColor || "#cbd5e1"),
    author: String(opts.author || "user"),
  };
}

function createTable(opts = {}) {
  return {
    id: String(opts.id || genId("table")),
    type: ITEM_TYPES.TABLE,
    title: String(opts.title || ""),
    headers: Array.isArray(opts.headers) ? opts.headers.map(String) : [],
    rows: Array.isArray(opts.rows) ? opts.rows.map((r) => (Array.isArray(r) ? r.map(String) : [])) : [],
    x: Number(opts.x) || 0,
    y: Number(opts.y) || 0,
    width: Math.max(100, Number(opts.width) || 320),
    height: Math.max(60, Number(opts.height) || 180),
    strokeColor: String(opts.strokeColor || "#94a3b8"),
    headerBg: String(opts.headerBg || "#f1f5f9"),
    author: String(opts.author || "user"),
  };
}

function createImageItem(opts = {}) {
  return {
    id: String(opts.id || genId("image")),
    type: ITEM_TYPES.IMAGE,
    src: String(opts.src || opts.url || ""),
    x: Number(opts.x) || 0,
    y: Number(opts.y) || 0,
    width: Math.max(30, Number(opts.width) || 240),
    height: Math.max(30, Number(opts.height) || 180),
    caption: String(opts.caption || "").slice(0, 150),
    author: String(opts.author || "user"),
  };
}

function createDiagram(opts = {}) {
  return {
    id: String(opts.id || genId("diagram")),
    type: ITEM_TYPES.DIAGRAM,
    syntax: String(opts.syntax || opts.diagramType || "mermaid"),
    code: String(opts.code || "").slice(0, 10000),
    x: Number(opts.x) || 0,
    y: Number(opts.y) || 0,
    width: Math.max(100, Number(opts.width) || 340),
    height: Math.max(60, Number(opts.height) || 220),
    author: String(opts.author || "user"),
  };
}

function sanitizeItem(item) {
  if (!item || typeof item !== "object") return createShape();
  const type = String(item.type || item.kind || "").toLowerCase();
  switch (type) {
    case "stroke":
      return createStroke(item);
    case "shape":
      return createShape(item);
    case "text":
      return createText(item);
    case "sticky":
      return createSticky(item);
    case "checklist":
      return createChecklist(item);
    case "table":
      return createTable(item);
    case "image":
      return createImageItem(item);
    case "diagram":
      return createDiagram(item);
    default:
      return createShape(item);
  }
}

function createItem(opts = {}) {
  const type = String(opts.kind || opts.type || "shape").toLowerCase();
  if (type === "stroke") return createStroke(opts);
  if (type === "shape") return createShape(opts);
  if (type === "text") return createText(opts);
  if (type === "sticky") return createSticky(opts);
  if (type === "checklist") return createChecklist(opts);
  if (type === "table") {
    const rawRows = opts.rows || [];
    const headers = rawRows.length > 0 ? rawRows[0] : [];
    const dataRows = rawRows.slice(1);
    return createTable({ ...opts, headers, rows: dataRows });
  }
  if (type === "image") return createImageItem(opts);
  if (type === "diagram") return createDiagram(opts);
  return sanitizeItem(opts);
}

function getBoundingBox(item) {
  if (!item) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, cx: 0, cy: 0 };

  if (item.type === ITEM_TYPES.STROKE) {
    if (!item.points || item.points.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, cx: 0, cy: 0 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of item.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = (item.size || 3) / 2;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    const width = Math.max(0, maxX - minX);
    const height = Math.max(0, maxY - minY);
    return { minX, minY, maxX, maxY, width, height, cx: minX + width / 2, cy: minY + height / 2 };
  }

  const x = Number(item.x) || 0;
  const y = Number(item.y) || 0;
  const width = Math.max(0, Number(item.width) || 0);
  const height = Math.max(0, Number(item.height) || 0);
  return {
    minX: x,
    minY: y,
    maxX: x + width,
    maxY: y + height,
    width,
    height,
    cx: x + width / 2,
    cy: y + height / 2,
  };
}

function calculateItemBounds(item) {
  const b = getBoundingBox(item);
  return {
    x: b.minX,
    y: b.minY,
    width: b.width,
    height: b.height,
  };
}

function documentToText(doc) {
  if (!doc) return "";
  const lines = [`# ${doc.title || "Whiteboard"}`];
  (doc.pages || []).forEach((page, pIdx) => {
    lines.push(`\n## Page ${pIdx + 1}: ${page.name}`);
    for (const it of page.items || []) {
      if (it.type === "text" && it.text) {
        lines.push(`- [Text] ${it.text}`);
      } else if (it.type === "sticky") {
        lines.push(`- [Sticky note${it.title ? ` "${it.title}"` : ""}] ${it.text}`);
      } else if (it.type === "checklist") {
        lines.push(`- [Checklist "${it.title || "Checklist"}"]`);
        (it.items || []).forEach((c) => lines.push(`  - [${c.checked ? "x" : " "}] ${c.text}`));
      } else if (it.type === "table") {
        lines.push(`- [Table] Headers: ${(it.headers || []).join(" | ")}`);
        (it.rows || []).forEach((r) => lines.push(`  | ${(r || []).join(" | ")} |`));
      } else if (it.type === "diagram" && it.code) {
        lines.push(`- [Diagram (${it.syntax || "mermaid"})]:\n\`\`\`${it.syntax || "mermaid"}\n${it.code}\n\`\`\``);
      } else if (it.type === "shape") {
        lines.push(`- [Shape: ${it.shapeType || "rect"}] at (${Math.round(it.x || 0)}, ${Math.round(it.y || 0)})`);
      }
    }
    if (!page.items || page.items.length === 0) lines.push("(empty page)");
  });
  return lines.join("\n");
}

module.exports = {
  VERSION,
  ITEM_TYPES,
  SHAPE_TYPES,
  STICKY_COLORS,
  createDocument,
  createPage,
  createStroke,
  createShape,
  createText,
  createSticky,
  createChecklist,
  createTable,
  createImageItem,
  createDiagram,
  sanitizeItem,
  createItem,
  getBoundingBox,
  calculateItemBounds,
  documentToText,
  getModel,
};
