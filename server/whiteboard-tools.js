// AI Whiteboard Tools Suite
// Declarations and execution handlers for whiteboard_* tools
const whiteboard = require("./whiteboard");
const {
  createPage,
  createItem,
  documentToText,
  calculateItemBounds,
} = require("./whiteboard-model");

const str = (description) => ({ type: "STRING", description });
const num = (description) => ({ type: "NUMBER", description });
const bool = (description) => ({ type: "BOOLEAN", description });
const fn = (name, description, properties, required = Object.keys(properties)) => ({
  name,
  description,
  parameters: { type: "OBJECT", properties, required },
});

const WHITEBOARD_TOOLS = {
  whiteboard_write_text: fn(
    "whiteboard_write_text",
    "Write text, markdown, KaTeX math ($...$), or code blocks on the whiteboard. Can animate as progressive handwriting.",
    {
      text: str("Text, markdown, formula, or code to write"),
      x: num("X coordinate (0-1600, default auto-placed)"),
      y: num("Y coordinate (0-1000, default auto-placed)"),
      fontSize: num("Font size in pixels (default 24)"),
      color: str("Text color hex code (e.g. '#1e293b' or '#ef4444')"),
      handwriting: bool("True to render with progressive handwriting animation"),
      boardId: str("Optional specific board ID"),
    },
    ["text"]
  ),

  whiteboard_draw_shape: fn(
    "whiteboard_draw_shape",
    "Draw a 2D geometric shape (rect, circle, ellipse, triangle, star, cylinder, cloud, speech_bubble, arrow) with fill, stroke, and an optional label.",
    {
      shape: {
        type: "STRING",
        enum: ["rect", "circle", "ellipse", "triangle", "star", "cylinder", "cloud", "speech_bubble", "arrow"],
        description: "The shape kind to draw",
      },
      x: num("X position of shape center or top-left"),
      y: num("Y position of shape center or top-left"),
      width: num("Width of shape in pixels (default 160)"),
      height: num("Height of shape in pixels (default 120)"),
      fill: str("Fill color (hex e.g. '#e0e7ff', or 'none')"),
      stroke: str("Stroke border color (hex e.g. '#3b82f6')"),
      strokeWidth: num("Border thickness in pixels (default 2)"),
      label: str("Optional text label inside or attached to the shape"),
      boardId: str("Optional specific board ID"),
    },
    ["shape", "x", "y"]
  ),

  whiteboard_draw_diagram: fn(
    "whiteboard_draw_diagram",
    "Add a diagram (Mermaid code, flowchart, tree, or mindmap) to the whiteboard.",
    {
      diagramType: {
        type: "STRING",
        enum: ["mermaid", "flowchart", "tree", "mindmap"],
        description: "Type of diagram (default: mermaid)",
      },
      code: str("Mermaid diagram code or diagram structure"),
      x: num("X position (default 100)"),
      y: num("Y position (default 100)"),
      width: num("Width of diagram block (default 400)"),
      height: num("Height of diagram block (default 300)"),
      boardId: str("Optional specific board ID"),
    },
    ["code"]
  ),

  whiteboard_add_sticky: fn(
    "whiteboard_add_sticky",
    "Post a sticky note on the whiteboard with notes, ideas, or reminders.",
    {
      text: str("Text written on the sticky note"),
      x: num("X position (default auto)"),
      y: num("Y position (default auto)"),
      color: str("Sticky color: 'yellow', 'pink', 'blue', 'green', 'orange', or hex code"),
      boardId: str("Optional specific board ID"),
    },
    ["text"]
  ),

  whiteboard_add_checklist: fn(
    "whiteboard_add_checklist",
    "Add an interactive checklist / task list to the whiteboard.",
    {
      title: str("Checklist title or topic"),
      items: {
        type: "ARRAY",
        items: { type: "STRING" },
        description: "List of checklist task strings",
      },
      x: num("X position (default 100)"),
      y: num("Y position (default 100)"),
      boardId: str("Optional specific board ID"),
    },
    ["items"]
  ),

  whiteboard_add_table: fn(
    "whiteboard_add_table",
    "Add a grid table to the whiteboard.",
    {
      title: str("Optional table title"),
      rows: {
        type: "ARRAY",
        items: {
          type: "ARRAY",
          items: { type: "STRING" },
        },
        description: "2D array of rows and column cell strings (first row is header)",
      },
      x: num("X position (default 100)"),
      y: num("Y position (default 100)"),
      boardId: str("Optional specific board ID"),
    },
    ["rows"]
  ),

  whiteboard_add_image: fn(
    "whiteboard_add_image",
    "Place an image, diagram illustration, or screenshot on the whiteboard.",
    {
      url: str("Image URL, local file path, or data URI"),
      x: num("X position"),
      y: num("Y position"),
      width: num("Display width (default 300)"),
      height: num("Display height (default 200)"),
      caption: str("Optional caption below image"),
      boardId: str("Optional specific board ID"),
    },
    ["url"]
  ),

  whiteboard_draw_freehand: fn(
    "whiteboard_draw_freehand",
    "Draw smooth freehand pen strokes or sketch curves on the whiteboard.",
    {
      points: {
        type: "ARRAY",
        items: { type: "OBJECT" },
        description: "List of {x, y} coordinate points",
      },
      color: str("Stroke color hex (default '#1e293b')"),
      width: num("Stroke width (default 3)"),
      boardId: str("Optional specific board ID"),
    },
    ["points"]
  ),

  whiteboard_highlight: fn(
    "whiteboard_highlight",
    "Highlight an area or item on the whiteboard with a translucent highlighter marker.",
    {
      x: num("X position"),
      y: num("Y position"),
      width: num("Highlight width"),
      height: num("Highlight height"),
      color: str("Highlight color hex (default '#fef08a' soft yellow)"),
      boardId: str("Optional specific board ID"),
    },
    ["x", "y", "width", "height"]
  ),

  whiteboard_point_at: fn(
    "whiteboard_point_at",
    "Point to a spot or item on the whiteboard. The robot arm reaches and points its marker or laser pointer, with an onscreen spotlight.",
    {
      x: num("X coordinate to point to"),
      y: num("Y coordinate to point to"),
      itemId: str("Optional item ID to point directly at"),
      label: str("Brief explanation or voice cue for what you are pointing out"),
      boardId: str("Optional specific board ID"),
    },
    []
  ),

  whiteboard_erase_region: fn(
    "whiteboard_erase_region",
    "Erase items within a bounding box, or erase a specific item. The robot performs an erasing wipe motion with its sponge.",
    {
      x: num("X coordinate"),
      y: num("Y coordinate"),
      width: num("Width of erase zone (default 100)"),
      height: num("Height of erase zone (default 100)"),
      itemId: str("Optional specific item ID to remove"),
      boardId: str("Optional specific board ID"),
    },
    []
  ),

  whiteboard_clear: fn(
    "whiteboard_clear",
    "Wipe clean the active page or the entire whiteboard document.",
    {
      pageOnly: bool("True to only clear current page (default), false to reset entire board"),
      boardId: str("Optional specific board ID"),
    },
    []
  ),

  whiteboard_new_page: fn(
    "whiteboard_new_page",
    "Add a new blank page to the whiteboard document and switch to it.",
    {
      title: str("Optional page title, e.g. 'Page 2' or 'System Architecture'"),
      boardId: str("Optional specific board ID"),
    },
    []
  ),

  whiteboard_read_board: fn(
    "whiteboard_read_board",
    "Read the current whiteboard contents, structure, and text so you can inspect what is drawn.",
    {
      boardId: str("Optional specific board ID"),
    },
    []
  ),

  whiteboard_snapshot: fn(
    "whiteboard_snapshot",
    "Export a snapshot of the whiteboard as markdown text or full JSON structure.",
    {
      format: {
        type: "STRING",
        enum: ["text", "json", "markdown"],
        description: "Export format (default 'markdown')",
      },
      boardId: str("Optional specific board ID"),
    },
    []
  ),
};

// Compact tool definitions for local models
const WHITEBOARD_TOOLS_LOCAL = {
  whiteboard_write_text: fn(
    "whiteboard_write_text",
    "Write text or formula on the whiteboard.",
    { text: str("Text or formula"), x: num("X"), y: num("Y"), color: str("Color hex") },
    ["text"]
  ),
  whiteboard_draw_shape: fn(
    "whiteboard_draw_shape",
    "Draw a shape (rect, circle, triangle, star, arrow).",
    { shape: str("Shape kind"), x: num("X"), y: num("Y"), width: num("W"), height: num("H"), fill: str("Fill") },
    ["shape", "x", "y"]
  ),
  whiteboard_add_sticky: fn(
    "whiteboard_add_sticky",
    "Post a sticky note.",
    { text: str("Note text"), x: num("X"), y: num("Y"), color: str("yellow|pink|blue|green") },
    ["text"]
  ),
  whiteboard_point_at: fn(
    "whiteboard_point_at",
    "Point at whiteboard spot (robot arm gesture).",
    { x: num("X"), y: num("Y"), label: str("Label") },
    []
  ),
  whiteboard_read_board: fn(
    "whiteboard_read_board",
    "Read whiteboard text and items.",
    {},
    []
  ),
  whiteboard_clear: fn(
    "whiteboard_clear",
    "Clear whiteboard contents.",
    { pageOnly: bool("Page only") },
    []
  ),
};

const ESSENTIAL_WHITEBOARD_TOOLS = new Set([
  "whiteboard_write_text",
  "whiteboard_draw_shape",
  "whiteboard_add_sticky",
  "whiteboard_point_at",
  "whiteboard_read_board",
  "whiteboard_clear",
]);

const isWhiteboardTool = (name) => Object.hasOwn(WHITEBOARD_TOOLS, name);

function resolveDocument(args = {}, ctx = {}) {
  if (args.boardId) {
    const doc = whiteboard.get(args.boardId);
    if (doc) return doc;
  }
  return whiteboard.getActive(ctx.scope || "general", ctx.scopeId || "");
}

function resolveActivePage(doc) {
  if (!Array.isArray(doc.pages) || doc.pages.length === 0) {
    const p = createPage({ title: "Page 1" });
    doc.pages = [p];
    doc.activePageIndex = 0;
    return p;
  }
  const idx = Math.max(0, Math.min(doc.pages.length - 1, doc.activePageIndex || 0));
  doc.activePageIndex = idx;
  return doc.pages[idx];
}

// Auto-placement helper: finds a reasonable Y offset if none given
function nextAutoPlacement(page, defaultX = 100, defaultY = 100) {
  if (!page.items || page.items.length === 0) return { x: defaultX, y: defaultY };
  let maxY = 100;
  for (const item of page.items) {
    const bounds = calculateItemBounds(item);
    if (bounds.y + bounds.height > maxY) {
      maxY = bounds.y + bounds.height;
    }
  }
  const nextY = Math.min(850, maxY + 40);
  return { x: defaultX, y: nextY };
}

async function run(name, args = {}, ctx = {}) {
  const doc = resolveDocument(args, ctx);
  const page = resolveActivePage(doc);

  switch (name) {
    case "whiteboard_write_text": {
      const text = String(args.text || "").trim();
      if (!text) return { error: "Text cannot be empty." };
      const auto = nextAutoPlacement(page, 100, 100);
      const x = Number.isFinite(Number(args.x)) ? Number(args.x) : auto.x;
      const y = Number.isFinite(Number(args.y)) ? Number(args.y) : auto.y;
      const fontSize = Number.isFinite(Number(args.fontSize)) ? Number(args.fontSize) : 24;
      const color = String(args.color || "#1e293b").trim();
      const handwriting = args.handwriting === true;

      const item = createItem({
        kind: "text",
        text,
        x,
        y,
        fontSize,
        color,
        handwriting,
        author: "ai",
      });

      page.items.push(item);
      whiteboard.save(doc.id, doc);

      ctx.onWhiteboard?.({
        type: "item_created",
        boardId: doc.id,
        pageId: page.id,
        item,
      });

      ctx.onActivity?.(`Wrote on whiteboard: "${text.slice(0, 32)}${text.length > 32 ? "..." : ""}"`);
      return { ok: true, itemId: item.id, boardId: doc.id, x, y };
    }

    case "whiteboard_draw_shape": {
      const shape = String(args.shape || "rect").toLowerCase().trim();
      const auto = nextAutoPlacement(page, 150, 150);
      const x = Number.isFinite(Number(args.x)) ? Number(args.x) : auto.x;
      const y = Number.isFinite(Number(args.y)) ? Number(args.y) : auto.y;
      const width = Number.isFinite(Number(args.width)) && Number(args.width) > 0 ? Number(args.width) : 160;
      const height = Number.isFinite(Number(args.height)) && Number(args.height) > 0 ? Number(args.height) : 120;
      const fill = String(args.fill || "#e0e7ff").trim();
      const stroke = String(args.stroke || "#3b82f6").trim();
      const strokeWidth = Number.isFinite(Number(args.strokeWidth)) ? Number(args.strokeWidth) : 2;
      const label = args.label ? String(args.label).trim() : "";

      const item = createItem({
        kind: "shape",
        shape,
        x,
        y,
        width,
        height,
        fill,
        stroke,
        strokeWidth,
        label,
        author: "ai",
      });

      page.items.push(item);
      whiteboard.save(doc.id, doc);

      ctx.onWhiteboard?.({
        type: "item_created",
        boardId: doc.id,
        pageId: page.id,
        item,
      });

      ctx.onActivity?.(`Drew ${shape} on whiteboard`);
      return { ok: true, itemId: item.id, boardId: doc.id, shape, x, y };
    }

    case "whiteboard_draw_diagram": {
      const code = String(args.code || "").trim();
      if (!code) return { error: "Diagram code or structure is required." };
      const diagramType = String(args.diagramType || "mermaid").toLowerCase().trim();
      const auto = nextAutoPlacement(page, 100, 100);
      const x = Number.isFinite(Number(args.x)) ? Number(args.x) : auto.x;
      const y = Number.isFinite(Number(args.y)) ? Number(args.y) : auto.y;
      const width = Number.isFinite(Number(args.width)) && Number(args.width) > 0 ? Number(args.width) : 400;
      const height = Number.isFinite(Number(args.height)) && Number(args.height) > 0 ? Number(args.height) : 300;

      const item = createItem({
        kind: "diagram",
        diagramType,
        code,
        x,
        y,
        width,
        height,
        author: "ai",
      });

      page.items.push(item);
      whiteboard.save(doc.id, doc);

      ctx.onWhiteboard?.({
        type: "item_created",
        boardId: doc.id,
        pageId: page.id,
        item,
      });

      ctx.onActivity?.(`Added ${diagramType} diagram to whiteboard`);
      return { ok: true, itemId: item.id, boardId: doc.id };
    }

    case "whiteboard_add_sticky": {
      const text = String(args.text || "").trim();
      if (!text) return { error: "Sticky note text is required." };
      const auto = nextAutoPlacement(page, 200, 150);
      const x = Number.isFinite(Number(args.x)) ? Number(args.x) : auto.x;
      const y = Number.isFinite(Number(args.y)) ? Number(args.y) : auto.y;
      const color = String(args.color || "#fef3c7").trim();

      const item = createItem({
        kind: "sticky",
        text,
        x,
        y,
        width: 180,
        height: 180,
        color,
        author: "ai",
      });

      page.items.push(item);
      whiteboard.save(doc.id, doc);

      ctx.onWhiteboard?.({
        type: "item_created",
        boardId: doc.id,
        pageId: page.id,
        item,
      });

      ctx.onActivity?.(`Posted sticky note: "${text.slice(0, 24)}"`);
      return { ok: true, itemId: item.id, boardId: doc.id };
    }

    case "whiteboard_add_checklist": {
      let rawItems = args.items;
      if (typeof rawItems === "string") {
        rawItems = rawItems.split(/[\n|]/).map((s) => s.trim()).filter(Boolean);
      }
      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        return { error: "Checklist must contain at least one task item." };
      }
      const title = String(args.title || "Checklist").trim();
      const items = rawItems.map((it) => (typeof it === "string" ? { text: it, done: false } : { text: String(it.text || ""), done: Boolean(it.done) }));
      const auto = nextAutoPlacement(page, 150, 100);
      const x = Number.isFinite(Number(args.x)) ? Number(args.x) : auto.x;
      const y = Number.isFinite(Number(args.y)) ? Number(args.y) : auto.y;

      const item = createItem({
        kind: "checklist",
        title,
        items,
        x,
        y,
        width: 260,
        height: 60 + items.length * 32,
        author: "ai",
      });

      page.items.push(item);
      whiteboard.save(doc.id, doc);

      ctx.onWhiteboard?.({
        type: "item_created",
        boardId: doc.id,
        pageId: page.id,
        item,
      });

      ctx.onActivity?.(`Added checklist: "${title}" (${items.length} items)`);
      return { ok: true, itemId: item.id, boardId: doc.id };
    }

    case "whiteboard_add_table": {
      let rawRows = args.rows;
      if (!Array.isArray(rawRows) || rawRows.length === 0) {
        return { error: "Table must have at least one row." };
      }
      const rows = rawRows.map((r) => (Array.isArray(r) ? r.map(String) : [String(r)]));
      const title = args.title ? String(args.title).trim() : "";
      const auto = nextAutoPlacement(page, 100, 100);
      const x = Number.isFinite(Number(args.x)) ? Number(args.x) : auto.x;
      const y = Number.isFinite(Number(args.y)) ? Number(args.y) : auto.y;
      const cols = Math.max(...rows.map((r) => r.length), 1);
      const width = Math.max(280, cols * 140);
      const height = Math.max(120, rows.length * 38 + 40);

      const item = createItem({
        kind: "table",
        title,
        rows,
        x,
        y,
        width,
        height,
        author: "ai",
      });

      page.items.push(item);
      whiteboard.save(doc.id, doc);

      ctx.onWhiteboard?.({
        type: "item_created",
        boardId: doc.id,
        pageId: page.id,
        item,
      });

      ctx.onActivity?.(`Added table with ${rows.length} rows`);
      return { ok: true, itemId: item.id, boardId: doc.id };
    }

    case "whiteboard_add_image": {
      const url = String(args.url || "").trim();
      if (!url) return { error: "Image URL or data URI required." };
      const auto = nextAutoPlacement(page, 100, 100);
      const x = Number.isFinite(Number(args.x)) ? Number(args.x) : auto.x;
      const y = Number.isFinite(Number(args.y)) ? Number(args.y) : auto.y;
      const width = Number.isFinite(Number(args.width)) && Number(args.width) > 0 ? Number(args.width) : 300;
      const height = Number.isFinite(Number(args.height)) && Number(args.height) > 0 ? Number(args.height) : 200;
      const caption = args.caption ? String(args.caption).trim() : "";

      const item = createItem({
        kind: "image",
        url,
        x,
        y,
        width,
        height,
        caption,
        author: "ai",
      });

      page.items.push(item);
      whiteboard.save(doc.id, doc);

      ctx.onWhiteboard?.({
        type: "item_created",
        boardId: doc.id,
        pageId: page.id,
        item,
      });

      ctx.onActivity?.("Placed image on whiteboard");
      return { ok: true, itemId: item.id, boardId: doc.id };
    }

    case "whiteboard_draw_freehand": {
      const points = Array.isArray(args.points) ? args.points : [];
      if (points.length < 2) return { error: "Freehand stroke requires at least 2 points." };
      const color = String(args.color || "#1e293b").trim();
      const width = Number.isFinite(Number(args.width)) && Number(args.width) > 0 ? Number(args.width) : 3;

      const item = createItem({
        kind: "stroke",
        points,
        color,
        width,
        author: "ai",
      });

      page.items.push(item);
      whiteboard.save(doc.id, doc);

      ctx.onWhiteboard?.({
        type: "item_created",
        boardId: doc.id,
        pageId: page.id,
        item,
      });

      ctx.onActivity?.("Drew sketch strokes on whiteboard");
      return { ok: true, itemId: item.id, boardId: doc.id };
    }

    case "whiteboard_highlight": {
      const x = Number(args.x) || 100;
      const y = Number(args.y) || 100;
      const width = Number(args.width) || 200;
      const height = Number(args.height) || 40;
      const color = String(args.color || "#fef08a").trim();

      const item = createItem({
        kind: "shape",
        shape: "rect",
        x,
        y,
        width,
        height,
        fill: color,
        stroke: "none",
        strokeWidth: 0,
        opacity: 0.45,
        author: "ai",
      });

      page.items.unshift(item); // insert behind existing text
      whiteboard.save(doc.id, doc);

      ctx.onWhiteboard?.({
        type: "item_created",
        boardId: doc.id,
        pageId: page.id,
        item,
      });

      ctx.onActivity?.("Highlighted section on whiteboard");
      return { ok: true, itemId: item.id, boardId: doc.id };
    }

    case "whiteboard_point_at": {
      let targetX = 800;
      let targetY = 500;
      if (args.itemId) {
        const item = page.items?.find((it) => it.id === args.itemId);
        if (item) {
          const b = calculateItemBounds(item);
          targetX = b.x + b.width / 2;
          targetY = b.y + b.height / 2;
        }
      } else {
        if (Number.isFinite(Number(args.x))) targetX = Number(args.x);
        if (Number.isFinite(Number(args.y))) targetY = Number(args.y);
      }

      const label = args.label ? String(args.label).trim() : "";

      // Emit whiteboard spotlight/laser cue
      ctx.onWhiteboard?.({
        type: "point_at",
        boardId: doc.id,
        pageId: page.id,
        x: targetX,
        y: targetY,
        label,
      });

      // Cue robot arm and gaze
      ctx.onRobot?.({
        lookAt: { x: (targetX / 1600) * 2 - 1, y: 1 - (targetY / 1000) * 2 },
        gesture: targetX > 800 ? "point_right" : "point_left",
      });

      ctx.onActivity?.(label ? `Pointed to: ${label}` : "Pointed to whiteboard");
      return { ok: true, x: targetX, y: targetY };
    }

    case "whiteboard_erase_region": {
      let erasedCount = 0;
      if (args.itemId) {
        const initLen = page.items.length;
        page.items = page.items.filter((it) => it.id !== args.itemId);
        erasedCount = initLen - page.items.length;
      } else if (Number.isFinite(Number(args.x)) && Number.isFinite(Number(args.y))) {
        const rx = Number(args.x);
        const ry = Number(args.y);
        const rw = Number(args.width) || 100;
        const rh = Number(args.height) || 100;

        const initLen = page.items.length;
        page.items = page.items.filter((it) => {
          const b = calculateItemBounds(it);
          const overlaps = !(b.x + b.width < rx || b.x > rx + rw || b.y + b.height < ry || b.y > ry + rh);
          return !overlaps;
        });
        erasedCount = initLen - page.items.length;
      }

      whiteboard.save(doc.id, doc);

      ctx.onWhiteboard?.({
        type: "region_erased",
        boardId: doc.id,
        pageId: page.id,
        erasedCount,
      });

      ctx.onRobot?.({
        gesture: "scratch_head",
      });

      ctx.onActivity?.(`Erased ${erasedCount} item${erasedCount === 1 ? "" : "s"} from whiteboard`);
      return { ok: true, erasedCount };
    }

    case "whiteboard_clear": {
      const pageOnly = args.pageOnly !== false;
      if (pageOnly) {
        page.items = [];
      } else {
        doc.pages = [createPage({ title: "Page 1" })];
        doc.activePageIndex = 0;
      }

      whiteboard.save(doc.id, doc);

      ctx.onWhiteboard?.({
        type: "board_cleared",
        boardId: doc.id,
        pageOnly,
      });

      ctx.onActivity?.("Wiped the whiteboard clean");
      return { ok: true, pageOnly };
    }

    case "whiteboard_new_page": {
      const title = String(args.title || `Page ${doc.pages.length + 1}`).trim();
      const newPage = createPage({ title });
      doc.pages.push(newPage);
      doc.activePageIndex = doc.pages.length - 1;

      whiteboard.save(doc.id, doc);

      ctx.onWhiteboard?.({
        type: "page_created",
        boardId: doc.id,
        pageId: newPage.id,
        pageIndex: doc.activePageIndex,
      });

      ctx.onActivity?.(`Added new whiteboard page: "${title}"`);
      return { ok: true, pageId: newPage.id, pageIndex: doc.activePageIndex, title };
    }

    case "whiteboard_read_board": {
      const text = documentToText(doc);
      return {
        ok: true,
        title: doc.title,
        activePage: page.title,
        pageCount: doc.pages.length,
        itemCount: page.items.length,
        summary: text || "(The whiteboard is currently empty)",
      };
    }

    case "whiteboard_snapshot": {
      const format = String(args.format || "markdown").toLowerCase().trim();
      const exp = whiteboard.exportData(doc.id, { format: format === "json" ? "json" : "text" });
      return { ok: true, format, ...exp };
    }

    default:
      throw new Error(`Unknown whiteboard tool: ${name}`);
  }
}

module.exports = {
  WHITEBOARD_TOOLS,
  WHITEBOARD_TOOLS_LOCAL,
  ESSENTIAL_WHITEBOARD_TOOLS,
  isWhiteboardTool,
  run,
};
