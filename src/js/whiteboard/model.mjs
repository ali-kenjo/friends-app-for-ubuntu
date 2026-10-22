// Universal Vector Whiteboard Document Model
// Shared between browser canvas rendering, 3D room texture generation, and server storage.

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
};

export const SHAPE_TYPES = {
  RECT: "rect",
  ROUND_RECT: "round_rect",
  ELLIPSE: "ellipse",
  CIRCLE: "circle",
  TRIANGLE: "triangle",
  DIAMOND: "diamond",
  STAR: "star",
  LINE: "line",
  ARROW: "arrow",
  DOUBLE_ARROW: "double_arrow",
  CONNECTOR: "connector",
};

export const BG_TYPES = {
  PLAIN: "plain",
  GRID: "grid",
  RULED: "ruled",
  DOTS: "dots",
  GRAPH: "graph",
  MUSIC: "music",
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
  HIGHLIGHTER: "highlighter",
};

function genId(prefix = "item") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createDocument({
  id = genId("board"),
  title = "Untitled Board",
  scope = "general", // general | chat | character | mission
  scopeId = "",
  author = "user",
  settings = {},
  pages = [],
} = {}) {
  const doc = {
    id: String(id || genId("board")),
    title: String(title || "Untitled Board").trim().slice(0, 120),
    version: VERSION,
    scope: String(scope || "general"),
    scopeId: String(scopeId || ""),
    author: String(author || "user"),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    activePageIndex: 0,
    settings: {
      background: settings.background || BG_TYPES.GRID,
      bgColor: settings.bgColor || "#ffffff",
      gridColor: settings.gridColor || "#e2e8f0",
      gridSize: Number(settings.gridSize) || 24,
      infinite: settings.infinite !== false,
      zoom: Number(settings.zoom) || 1,
      panX: Number(settings.panX) || 0,
      panY: Number(settings.panY) || 0,
    },
    pages: pages.length > 0 ? pages.map((p, i) => createPage({ ...p, name: p.name || `Page ${i + 1}` })) : [createPage({ name: "Page 1" })],
  };
  return doc;
}

export function createPage({
  id = genId("page"),
  name = "Page 1",
  background = {},
  items = [],
} = {}) {
  return {
    id: String(id || genId("page")),
    name: String(name || "Page 1").trim().slice(0, 60),
    createdAt: Date.now(),
    background: {
      type: background.type || BG_TYPES.GRID,
      color: background.color || "#ffffff",
      patternColor: background.patternColor || "#e2e8f0",
      size: Number(background.size) || 24,
    },
    items: Array.isArray(items) ? items.map((it, idx) => sanitizeItem(it, idx)) : [],
  };
}

export function createStroke({
  id = genId("stroke"),
  points = [],
  color = "#1e293b",
  size = 3,
  opacity = 1,
  style = PEN_STYLES.MARKER,
  t0 = Date.now(),
  duration = 0,
  author = "user",
} = {}) {
  const pts = (points || []).map((pt) => ({
    x: Number(pt.x) || 0,
    y: Number(pt.y) || 0,
    p: Number(pt.p ?? 0.5), // pressure 0..1
    t: Number(pt.t ?? 0), // relative ms offset
  }));

  const dur = duration || (pts.length > 1 ? pts[pts.length - 1].t - pts[0].t : 0);

  return {
    id: String(id || genId("stroke")),
    type: ITEM_TYPES.STROKE,
    points: pts,
    color: String(color || "#1e293b"),
    size: Math.max(1, Math.min(64, Number(size) || 3)),
    opacity: Math.max(0.05, Math.min(1, Number(opacity) || 1)),
    style: PEN_STYLES[style?.toUpperCase()] || PEN_STYLES.MARKER,
    t0: Number(t0) || Date.now(),
    duration: Math.max(0, dur),
    author: String(author || "user"),
  };
}

export function createShape({
  id = genId("shape"),
  shapeType = SHAPE_TYPES.RECT,
  x = 0,
  y = 0,
  width = 120,
  height = 80,
  strokeColor = "#1e293b",
  fillColor = "transparent",
  strokeWidth = 2,
  strokeStyle = "solid",
  arrowStart = false,
  arrowEnd = false,
  startPort = null,
  endPort = null,
  points = [],
  rotation = 0,
  author = "user",
} = {}) {
  return {
    id: String(id || genId("shape")),
    type: ITEM_TYPES.SHAPE,
    shapeType: String(shapeType || SHAPE_TYPES.RECT),
    x: Number(x) || 0,
    y: Number(y) || 0,
    width: Number(width) || 120,
    height: Number(height) || 80,
    strokeColor: String(strokeColor || "#1e293b"),
    fillColor: String(fillColor || "transparent"),
    strokeWidth: Math.max(1, Math.min(32, Number(strokeWidth) || 2)),
    strokeStyle: ["solid", "dashed", "dotted"].includes(strokeStyle) ? strokeStyle : "solid",
    arrowStart: Boolean(arrowStart),
    arrowEnd: Boolean(arrowEnd),
    startPort: startPort ? { ...startPort } : null,
    endPort: endPort ? { ...endPort } : null,
    points: Array.isArray(points) ? points.map((p) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 })) : [],
    rotation: Number(rotation) || 0,
    author: String(author || "user"),
  };
}

export function createText({
  id = genId("text"),
  text = "",
  x = 0,
  y = 0,
  width = 200,
  height = 40,
  fontSize = 20,
  fontFamily = "marker", // marker | chalk | sans | serif | mono
  color = "#1e293b",
  align = "left", // left | center | right
  format = "plain", // plain | math | code
  language = "",
  rotation = 0,
  author = "user",
} = {}) {
  return {
    id: String(id || genId("text")),
    type: ITEM_TYPES.TEXT,
    text: String(text || ""),
    x: Number(x) || 0,
    y: Number(y) || 0,
    width: Math.max(20, Number(width) || 200),
    height: Math.max(20, Number(height) || 40),
    fontSize: Math.max(8, Math.min(128, Number(fontSize) || 20)),
    fontFamily: ["marker", "chalk", "sans", "serif", "mono"].includes(fontFamily) ? fontFamily : "marker",
    color: String(color || "#1e293b"),
    align: ["left", "center", "right"].includes(align) ? align : "left",
    format: ["plain", "math", "code"].includes(format) ? format : "plain",
    language: String(language || ""),
    rotation: Number(rotation) || 0,
    author: String(author || "user"),
  };
}

export function createSticky({
  id = genId("sticky"),
  title = "",
  text = "",
  x = 0,
  y = 0,
  width = 160,
  height = 160,
  color = STICKY_COLORS[0],
  tilt = 0,
  pinned = true,
  author = "user",
} = {}) {
  return {
    id: String(id || genId("sticky")),
    type: ITEM_TYPES.STICKY,
    title: String(title || "").slice(0, 100),
    text: String(text || ""),
    x: Number(x) || 0,
    y: Number(y) || 0,
    width: Math.max(80, Math.min(480, Number(width) || 160)),
    height: Math.max(80, Math.min(480, Number(height) || 160)),
    color: STICKY_COLORS.includes(color) ? color : STICKY_COLORS[0],
    tilt: Math.max(-10, Math.min(10, Number(tilt) || 0)),
    pinned: pinned !== false,
    author: String(author || "user"),
  };
}

export function createChecklist({
  id = genId("checklist"),
  title = "Checklist",
  items = [],
  x = 0,
  y = 0,
  width = 220,
  height = 140,
  color = "#ffffff",
  strokeColor = "#cbd5e1",
  author = "user",
} = {}) {
  return {
    id: String(id || genId("checklist")),
    type: ITEM_TYPES.CHECKLIST,
    title: String(title || "Checklist").slice(0, 100),
    items: Array.isArray(items)
      ? items.map((it) => ({
          id: it.id || genId("chk"),
          text: String(it.text || ""),
          checked: Boolean(it.checked),
        }))
      : [],
    x: Number(x) || 0,
    y: Number(y) || 0,
    width: Math.max(120, Number(width) || 220),
    height: Math.max(60, Number(height) || 140),
    color: String(color || "#ffffff"),
    strokeColor: String(strokeColor || "#cbd5e1"),
    author: String(author || "user"),
  };
}

export function createTable({
  id = genId("table"),
  headers = [],
  rows = [],
  x = 0,
  y = 0,
  width = 320,
  height = 180,
  strokeColor = "#94a3b8",
  headerBg = "#f1f5f9",
  author = "user",
} = {}) {
  return {
    id: String(id || genId("table")),
    type: ITEM_TYPES.TABLE,
    headers: Array.isArray(headers) ? headers.map(String) : [],
    rows: Array.isArray(rows) ? rows.map((r) => (Array.isArray(r) ? r.map(String) : [])) : [],
    x: Number(x) || 0,
    y: Number(y) || 0,
    width: Math.max(100, Number(width) || 320),
    height: Math.max(60, Number(height) || 180),
    strokeColor: String(strokeColor || "#94a3b8"),
    headerBg: String(headerBg || "#f1f5f9"),
    author: String(author || "user"),
  };
}

export function createImageItem({
  id = genId("image"),
  src = "",
  mime = "image/png",
  x = 0,
  y = 0,
  width = 240,
  height = 180,
  fit = "contain",
  caption = "",
  rotation = 0,
  author = "user",
} = {}) {
  return {
    id: String(id || genId("image")),
    type: ITEM_TYPES.IMAGE,
    src: String(src || ""),
    mime: String(mime || "image/png"),
    x: Number(x) || 0,
    y: Number(y) || 0,
    width: Math.max(30, Number(width) || 240),
    height: Math.max(30, Number(height) || 180),
    fit: ["contain", "cover"].includes(fit) ? fit : "contain",
    caption: String(caption || "").slice(0, 150),
    rotation: Number(rotation) || 0,
    author: String(author || "user"),
  };
}

export function createDiagram({
  id = genId("diagram"),
  syntax = "mermaid", // mermaid | graph
  code = "",
  nodes = [],
  edges = [],
  x = 0,
  y = 0,
  width = 340,
  height = 220,
  author = "user",
} = {}) {
  return {
    id: String(id || genId("diagram")),
    type: ITEM_TYPES.DIAGRAM,
    syntax: ["mermaid", "graph"].includes(syntax) ? syntax : "mermaid",
    code: String(code || "").slice(0, 10000),
    nodes: Array.isArray(nodes) ? nodes : [],
    edges: Array.isArray(edges) ? edges : [],
    x: Number(x) || 0,
    y: Number(y) || 0,
    width: Math.max(100, Number(width) || 340),
    height: Math.max(60, Number(height) || 220),
    author: String(author || "user"),
  };
}

export function createItem(opts = {}) {
  const type = String(opts.kind || opts.type || "shape").toLowerCase();
  if (type === "stroke") return createStroke(opts);
  if (type === "shape") return createShape(opts);
  if (type === "text") return createText(opts);
  if (type === "sticky") return createSticky(opts);
  if (type === "checklist") return createChecklist(opts);
  if (type === "table") {
    const rawRows = opts.rows || [];
    const headers = rawRows.length > 0 && Array.isArray(rawRows[0]) ? rawRows[0] : (opts.headers || []);
    const dataRows = rawRows.length > 0 && Array.isArray(rawRows[0]) ? rawRows.slice(1) : (opts.rows || []);
    return createTable({ ...opts, headers, rows: dataRows });
  }
  if (type === "image") return createImageItem(opts);
  if (type === "diagram") return createDiagram(opts);
  return sanitizeItem(opts);
}

export function sanitizeItem(item, idx = 0) {
  if (!item || typeof item !== "object") return createShape({ id: genId(`item_${idx}`) });
  const type = String(item.type || "").toLowerCase();
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
    default:
      return createShape({ ...item, shapeType: item.shapeType || SHAPE_TYPES.RECT });
  }
}

// ---------- Geometry & Spatial Queries ----------

export function getBoundingBox(item) {
  if (!item) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, cx: 0, cy: 0 };

  if (item.type === ITEM_TYPES.STROKE) {
    if (!item.points || item.points.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, cx: 0, cy: 0 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
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
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
    };
  }

  const x = Number(item.x) || 0;
  const y = Number(item.y) || 0;
  const w = Number(item.width) || 0;
  const h = Number(item.height) || 0;

  const minX = Math.min(x, x + w);
  const minY = Math.min(y, y + h);
  const maxX = Math.max(x, x + w);
  const maxY = Math.max(y, y + h);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

export function getSelectionBoundingBox(items = []) {
  if (!items || items.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const it of items) {
    const bb = getBoundingBox(it);
    if (bb.minX < minX) minX = bb.minX;
    if (bb.minY < minY) minY = bb.minY;
    if (bb.maxX > maxX) maxX = bb.maxX;
    if (bb.maxY > maxY) maxY = bb.maxY;
  }

  if (minX === Infinity) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

export function hitTest(item, x, y, tolerance = 8) {
  if (!item) return false;
  const bb = getBoundingBox(item);
  if (
    x < bb.minX - tolerance ||
    x > bb.maxX + tolerance ||
    y < bb.minY - tolerance ||
    y > bb.maxY + tolerance
  ) {
    return false;
  }

  if (item.type === ITEM_TYPES.STROKE) {
    const pts = item.points || [];
    const r2 = Math.pow(Math.max(tolerance, (item.size || 3) / 2 + 4), 2);
    for (let i = 0; i < pts.length - 1; i++) {
      const d2 = distToSegmentSquared({ x, y }, pts[i], pts[i + 1]);
      if (d2 <= r2) return true;
    }
    return pts.length === 1 && distSq({ x, y }, pts[0]) <= r2;
  }

  return true;
}

export function hitTestBox(item, minX, minY, maxX, maxY) {
  const bb = getBoundingBox(item);
  return (
    bb.maxX >= minX &&
    bb.minX <= maxX &&
    bb.maxY >= minY &&
    bb.minY <= maxY
  );
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

// ---------- Item Manipulations ----------

export function addItem(page, item) {
  const sanitized = sanitizeItem(item, page.items.length);
  page.items.push(sanitized);
  return sanitized;
}

export function updateItem(page, id, patch = {}) {
  const idx = page.items.findIndex((it) => it.id === id);
  if (idx === -1) return null;
  const curr = page.items[idx];
  const updated = sanitizeItem({ ...curr, ...patch, id: curr.id, type: curr.type });
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
  return page.items.find((it) => it.id === id) || null;
}

export function moveItem(page, id, dx, dy) {
  const it = getItem(page, id);
  if (!it) return false;
  if (it.type === ITEM_TYPES.STROKE) {
    for (const p of it.points) {
      p.x += dx;
      p.y += dy;
    }
  } else {
    it.x = (Number(it.x) || 0) + dx;
    it.y = (Number(it.y) || 0) + dy;
  }
  return true;
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
  }
  return true;
}

export function reorderItem(page, id, action) {
  const idx = page.items.findIndex((it) => it.id === id);
  if (idx === -1) return false;
  const it = page.items[idx];

  switch (action) {
    case "bring_to_front":
      page.items.splice(idx, 1);
      page.items.push(it);
      return true;
    case "send_to_back":
      page.items.splice(idx, 1);
      page.items.unshift(it);
      return true;
    case "bring_forward":
      if (idx < page.items.length - 1) {
        page.items[idx] = page.items[idx + 1];
        page.items[idx + 1] = it;
        return true;
      }
      return false;
    case "send_backward":
      if (idx > 0) {
        page.items[idx] = page.items[idx - 1];
        page.items[idx - 1] = it;
        return true;
      }
      return false;
    default:
      return false;
  }
}

// ---------- Undo / Redo Transaction Manager ----------

export function createUndoStack(maxDepth = 50) {
  return {
    undoList: [],
    redoList: [],
    maxDepth,
  };
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
      events.push({
        type: "stroke_start",
        itemId: it.id,
        time: baseTime,
        color: it.color,
        size: it.size,
        style: it.style,
        point: it.points[0],
      });
      for (let i = 1; i < it.points.length; i++) {
        events.push({
          type: "stroke_move",
          itemId: it.id,
          time: baseTime + (it.points[i].t || 0),
          point: it.points[i],
        });
      }
      events.push({
        type: "stroke_end",
        itemId: it.id,
        time: baseTime + (it.duration || (it.points[it.points.length - 1].t || 0)),
      });
    } else {
      events.push({
        type: "item_place",
        itemId: it.id,
        item: it,
        time: it.createdAt || it.t0 || 0,
      });
    }
  }

  events.sort((a, b) => a.time - b.time);
  return events;
}

// ---------- Structured Text Summary for AI & Search ----------

export function documentToText(doc) {
  if (!doc) return "";
  const lines = [`# ${doc.title || "Whiteboard"}`];

  doc.pages.forEach((page, pIdx) => {
    lines.push(`\n## Page ${pIdx + 1}: ${page.name}`);
    let textItems = 0;

    for (const it of page.items) {
      if (it.type === ITEM_TYPES.TEXT && it.text) {
        lines.push(`- [Text] ${it.text}`);
        textItems++;
      } else if (it.type === ITEM_TYPES.STICKY) {
        lines.push(`- [Sticky note${it.title ? ` "${it.title}"` : ""}] ${it.text}`);
        textItems++;
      } else if (it.type === ITEM_TYPES.CHECKLIST) {
        lines.push(`- [Checklist "${it.title}"]`);
        it.items.forEach((c) => lines.push(`  - [${c.checked ? "x" : " "}] ${c.text}`));
        textItems++;
      } else if (it.type === ITEM_TYPES.TABLE) {
        lines.push(`- [Table] Headers: ${it.headers.join(" | ")}`);
        it.rows.forEach((r) => lines.push(`  | ${r.join(" | ")} |`));
        textItems++;
      } else if (it.type === ITEM_TYPES.DIAGRAM && it.code) {
        lines.push(`- [Diagram (${it.syntax})]:\n\`\`\`${it.syntax}\n${it.code}\n\`\`\``);
        textItems++;
      } else if (it.type === ITEM_TYPES.SHAPE) {
        lines.push(`- [Shape: ${it.shapeType}] at (${Math.round(it.x)}, ${Math.round(it.y)})`);
      }
    }
    if (page.items.length === 0) lines.push("(empty page)");
  });

  return lines.join("\n");
}
