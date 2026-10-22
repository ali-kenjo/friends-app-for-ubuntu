// Robust parser for fenced markdown whiteboard blocks: ```whiteboard ... ```
// Supports both structured JSON commands and concise DSL syntax.
// Hardened against malformed, malicious, or adversarial inputs.

import {
  ITEM_TYPES,
  SHAPE_TYPES,
  PEN_STYLES,
  STICKY_COLORS,
  createStroke,
  createShape,
  createText,
  createSticky,
  createChecklist,
  createTable,
  createDiagram,
} from "./model.mjs";

const BLOCK_REGEX = /```(?:whiteboard|wb)\s*\n([\s\S]*?)\n```/gi;

export function extractWhiteboardBlocks(text = "") {
  if (typeof text !== "string") return [];
  const matches = [];
  let match;
  BLOCK_REGEX.lastIndex = 0;
  while ((match = BLOCK_REGEX.exec(text)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

export function parseWhiteboardCommands(blockText = "") {
  if (typeof blockText !== "string" || !blockText.trim()) return [];
  const lines = blockText.split("\n");
  const commands = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith("#") || rawLine.startsWith("//")) continue;

    // Check if line or chunk is JSON
    if (rawLine.startsWith("{") && rawLine.endsWith("}")) {
      try {
        const parsed = JSON.parse(rawLine);
        if (parsed && typeof parsed === "object") {
          commands.push(normalizeJsonCommand(parsed));
          continue;
        }
      } catch {}
    }

    // DSL Line Parsing
    const cmd = parseDslLine(rawLine, lines, i);
    if (cmd) {
      commands.push(cmd);
      if (cmd._consumedLines) i += cmd._consumedLines;
    }
  }

  return commands.filter(Boolean);
}

function normalizeJsonCommand(obj) {
  const op = String(obj.op || obj.type || obj.action || "").toLowerCase();
  switch (op) {
    case "text":
    case "write_text":
      return {
        action: "add_item",
        item: createText({
          text: obj.text || obj.content || "",
          x: obj.x,
          y: obj.y,
          fontSize: obj.fontSize,
          color: obj.color,
          format: obj.format,
          language: obj.language,
        }),
      };
    case "shape":
    case "draw_shape":
      return {
        action: "add_item",
        item: createShape({
          shapeType: obj.shape || obj.shapeType || SHAPE_TYPES.RECT,
          x: obj.x,
          y: obj.y,
          width: obj.width || obj.w,
          height: obj.height || obj.h,
          strokeColor: obj.strokeColor || obj.color,
          fillColor: obj.fillColor,
          arrowStart: obj.arrowStart,
          arrowEnd: obj.arrowEnd,
        }),
      };
    case "sticky":
    case "add_sticky":
      return {
        action: "add_item",
        item: createSticky({
          title: obj.title || "",
          text: obj.text || obj.content || "",
          x: obj.x,
          y: obj.y,
          color: obj.color,
        }),
      };
    case "checklist":
    case "add_checklist":
      return {
        action: "add_item",
        item: createChecklist({
          title: obj.title || "Checklist",
          items: Array.isArray(obj.items) ? obj.items.map((it) => (typeof it === "string" ? { text: it, checked: false } : it)) : [],
          x: obj.x,
          y: obj.y,
        }),
      };
    case "table":
    case "add_table":
      return {
        action: "add_item",
        item: createTable({
          headers: obj.headers || [],
          rows: obj.rows || [],
          x: obj.x,
          y: obj.y,
        }),
      };
    case "diagram":
    case "draw_diagram":
      return {
        action: "add_item",
        item: createDiagram({
          syntax: obj.syntax || "mermaid",
          code: obj.code || obj.diagram || "",
          x: obj.x,
          y: obj.y,
        }),
      };
    case "point":
    case "point_at":
      return {
        action: "point_at",
        x: Number(obj.x) || 0,
        y: Number(obj.y) || 0,
        target: obj.target || "",
      };
    case "clear":
      return { action: "clear" };
    case "erase":
    case "erase_region":
      return {
        action: "erase_region",
        x: Number(obj.x) || 0,
        y: Number(obj.y) || 0,
        width: Number(obj.width || obj.w) || 100,
        height: Number(obj.height || obj.h) || 100,
        itemId: obj.id || obj.itemId,
      };
    default:
      return null;
  }
}

function parseDslLine(line, lines, currentIndex) {
  const parts = line.split(/\s+/);
  const verb = parts[0].toLowerCase();

  if (verb === "clear") {
    return { action: "clear" };
  }

  if (verb === "point" || verb === "point_at") {
    const coords = extractCoordinates(line);
    return {
      action: "point_at",
      x: coords ? coords.x : 0,
      y: coords ? coords.y : 0,
      target: parts.slice(1).join(" "),
    };
  }

  if (verb === "text") {
    const coords = extractCoordinates(line) || { x: 50, y: 50 };
    const textContent = line.replace(/^text\s*(?:\[[^\]]+\]|\([^)]+\))?\s*/i, "");
    return {
      action: "add_item",
      item: createText({
        text: textContent,
        x: coords.x,
        y: coords.y,
      }),
    };
  }

  if (verb === "math") {
    const coords = extractCoordinates(line) || { x: 50, y: 50 };
    const mathContent = line.replace(/^math\s*(?:\[[^\]]+\]|\([^)]+\))?\s*/i, "");
    return {
      action: "add_item",
      item: createText({
        text: mathContent,
        x: coords.x,
        y: coords.y,
        format: "math",
      }),
    };
  }

  if (verb === "sticky") {
    const coords = extractCoordinates(line) || { x: 100, y: 100 };
    let color = STICKY_COLORS[0];
    for (const c of STICKY_COLORS) {
      if (line.includes(c)) {
        color = c;
        break;
      }
    }
    const stickyContent = line.replace(/^sticky\s*(?:\[[^\]]+\]|\([^)]+\))?\s*(?:#[0-9a-f]{6})?\s*/i, "");
    return {
      action: "add_item",
      item: createSticky({
        text: stickyContent,
        x: coords.x,
        y: coords.y,
        color,
      }),
    };
  }

  if (verb === "checklist") {
    const coords = extractCoordinates(line) || { x: 80, y: 80 };
    const rest = line.replace(/^checklist\s*(?:\[[^\]]+\]|\([^)]+\))?\s*/i, "");
    let title = "Checklist";
    let itemStr = rest;
    if (rest.includes(":")) {
      const colIdx = rest.indexOf(":");
      title = rest.slice(0, colIdx).trim() || "Checklist";
      itemStr = rest.slice(colIdx + 1);
    }
    const items = itemStr
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text) => ({ text, checked: false }));
    return {
      action: "add_item",
      item: createChecklist({
        title,
        items,
        x: coords.x,
        y: coords.y,
      }),
    };
  }

  if (verb === "rect" || verb === "rectangle") {
    const coords = extractBox(line) || { x: 50, y: 50, w: 120, h: 80 };
    return {
      action: "add_item",
      item: createShape({
        shapeType: SHAPE_TYPES.RECT,
        x: coords.x,
        y: coords.y,
        width: coords.w,
        height: coords.h,
      }),
    };
  }

  if (verb === "circle" || verb === "ellipse") {
    const coords = extractBox(line) || { x: 50, y: 50, w: 80, h: 80 };
    return {
      action: "add_item",
      item: createShape({
        shapeType: verb === "circle" ? SHAPE_TYPES.CIRCLE : SHAPE_TYPES.ELLIPSE,
        x: coords.x,
        y: coords.y,
        width: coords.w,
        height: coords.h,
      }),
    };
  }

  if (verb === "arrow" || verb === "line") {
    const coords = extractLinePoints(line) || { x1: 50, y1: 50, x2: 150, y2: 150 };
    return {
      action: "add_item",
      item: createShape({
        shapeType: verb === "arrow" ? SHAPE_TYPES.ARROW : SHAPE_TYPES.LINE,
        x: coords.x1,
        y: coords.y1,
        width: coords.x2 - coords.x1,
        height: coords.y2 - coords.y1,
        arrowEnd: verb === "arrow",
      }),
    };
  }

  if (verb === "diagram") {
    const syntax = parts[1] || "mermaid";
    // Check if diagram has a multiline block
    let codeLines = [];
    let consumed = 0;
    for (let j = currentIndex + 1; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim().startsWith("end_diagram") || l.trim().startsWith("```")) {
        consumed = j - currentIndex;
        break;
      }
      codeLines.push(l);
    }
    const code = codeLines.length > 0 ? codeLines.join("\n") : parts.slice(2).join(" ");
    return {
      action: "add_item",
      _consumedLines: consumed,
      item: createDiagram({
        syntax,
        code,
        x: 60,
        y: 60,
      }),
    };
  }

  return null;
}

function extractCoordinates(str) {
  const match = str.match(/(?:\[|\()([-\d.]+)\s*,\s*([-\d.]+)(?:\]|\))/);
  if (match) {
    return { x: Number(match[1]) || 0, y: Number(match[2]) || 0 };
  }
  return null;
}

function extractBox(str) {
  const match = str.match(/(?:\[|\()([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)(?:\]|\))/);
  if (match) {
    return {
      x: Number(match[1]) || 0,
      y: Number(match[2]) || 0,
      w: Math.max(10, Number(match[3]) || 100),
      h: Math.max(10, Number(match[4]) || 100),
    };
  }
  const pt = extractCoordinates(str);
  if (pt) return { x: pt.x, y: pt.y, w: 100, h: 80 };
  return null;
}

function extractLinePoints(str) {
  const match = str.match(/(?:\[|\()([-\d.]+)\s*,\s*([-\d.]+)(?:\]|\))\s*(?:->|--)\s*(?:\[|\()([-\d.]+)\s*,\s*([-\d.]+)(?:\]|\))/);
  if (match) {
    return {
      x1: Number(match[1]) || 0,
      y1: Number(match[2]) || 0,
      x2: Number(match[3]) || 0,
      y2: Number(match[4]) || 0,
    };
  }
  return null;
}
