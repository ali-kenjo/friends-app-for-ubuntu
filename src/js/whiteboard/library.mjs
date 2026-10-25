// The shape library: things you can put on the board with a click or by dragging them out of the panel, in groups
// (basic shapes, flowchart, arrows, notes, containers, school, symbols). Each entry makes one or more items around
// a point. Pure data and geometry; the panel draws previews of them with the board's own renderer.
import { STICKY_COLORS } from "./model.mjs";

const INK = "#1e293b";
const shape = (shapeType, w, h, extra = {}) => ({ type: "shape", shapeType, width: w, height: h, strokeColor: INK, strokeWidth: 3, fillColor: "transparent", ...extra });
// Items are made with their middle at (0, 0); `place` moves them to a point
const centered = (items) => items.map((it) => ({ ...it, x: -(it.width || 0) / 2, y: -(it.height || 0) / 2 }));
const arrowItem = (x1, y1, x2, y2, extra = {}) => ({ type: "shape", shapeType: "arrow", points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), strokeColor: INK, strokeWidth: 3, arrowEnd: true, ...extra });
const text = (x, y, w, s, extra = {}) => ({ type: "text", x, y, width: w, height: (extra.fontSize || 20) * 1.5, text: s, fontSize: 20, fontFamily: "sans", color: INK, ...extra });

const TINTS = [
  ["#dbeafe", "#2563eb"],
  ["#dcfce7", "#16a34a"],
  ["#fef9c3", "#d97706"],
  ["#fee2e2", "#dc2626"],
  ["#ede9fe", "#7c3aed"],
  ["#ccfbf1", "#0d9488"],
];

export const LIBRARY = [
  {
    id: "basic",
    name: "Basic shapes",
    entries: [
      ["rect", "Rectangle", () => centered([shape("rect", 160, 100)])],
      ["round_rect", "Rounded box", () => centered([shape("round_rect", 160, 100)])],
      ["ellipse", "Ellipse", () => centered([shape("ellipse", 170, 100)])],
      ["circle", "Circle", () => centered([shape("circle", 110, 110)])],
      ["triangle", "Triangle", () => centered([shape("triangle", 130, 110)])],
      ["diamond", "Diamond", () => centered([shape("diamond", 150, 110)])],
      ["hexagon", "Hexagon", () => centered([shape("hexagon", 150, 110)])],
      ["star", "Star", () => centered([shape("star", 120, 120)])],
      ["cylinder", "Cylinder", () => centered([shape("cylinder", 110, 130)])],
      ["cloud", "Cloud", () => centered([shape("cloud", 170, 110)])],
      ["speech_bubble", "Speech bubble", () => centered([shape("speech_bubble", 170, 110)])],
    ].map(([id, name, make]) => ({ id, name, make })),
  },
  {
    id: "flow",
    name: "Flowchart",
    entries: [
      { id: "start", name: "Start or end", make: () => centered([shape("round_rect", 170, 64, { label: "Start", fillColor: "#dcfce7", strokeColor: "#16a34a", fontSize: 20 })]) },
      { id: "step", name: "Step", make: () => centered([shape("rect", 170, 80, { label: "Step", fillColor: "#dbeafe", strokeColor: "#2563eb", fontSize: 20 })]) },
      { id: "decision", name: "Decision", make: () => centered([shape("diamond", 170, 110, { label: "Yes or no?", fillColor: "#fef9c3", strokeColor: "#d97706", fontSize: 18 })]) },
      { id: "data", name: "Data store", make: () => centered([shape("cylinder", 120, 130, { label: "Data", fillColor: "#ede9fe", strokeColor: "#7c3aed", fontSize: 18 })]) },
      { id: "idea", name: "Idea", make: () => centered([shape("cloud", 180, 110, { label: "Idea", fillColor: "#ccfbf1", strokeColor: "#0d9488", fontSize: 20 })]) },
      { id: "end", name: "Stop", make: () => centered([shape("round_rect", 170, 64, { label: "End", fillColor: "#fee2e2", strokeColor: "#dc2626", fontSize: 20 })]) },
    ],
  },
  {
    id: "lines",
    name: "Arrows and lines",
    entries: [
      { id: "arrow", name: "Arrow", make: () => [arrowItem(-80, 0, 80, 0)] },
      { id: "arrow_down", name: "Arrow down", make: () => [arrowItem(0, -70, 0, 70)] },
      { id: "arrow_both", name: "Both ways", make: () => [arrowItem(-80, 0, 80, 0, { arrowStart: true })] },
      { id: "line", name: "Line", make: () => [arrowItem(-80, 0, 80, 0, { arrowEnd: false, shapeType: "line" })] },
      { id: "dashed", name: "Dashed arrow", make: () => [arrowItem(-80, 0, 80, 0, { strokeStyle: "dashed" })] },
      { id: "diagonal", name: "Diagonal arrow", make: () => [arrowItem(-60, 50, 60, -50)] },
    ],
  },
  {
    id: "notes",
    name: "Notes and text",
    entries: [
      ...STICKY_COLORS.slice(0, 6).map((c, i) => ({ id: `sticky-${i}`, name: ["Yellow note", "Pink note", "Blue note", "Green note", "Orange note", "Purple note"][i], make: () => centered([{ type: "sticky", width: 170, height: 170, text: "", color: c }]) })),
      { id: "heading", name: "Heading", make: () => centered([text(0, 0, 360, "A heading", { fontSize: 44, bold: true, height: 64 })]) },
      { id: "paragraph", name: "Paragraph", make: () => centered([text(0, 0, 360, "Write something here. **Bold**, *italic* and lists work.", { fontSize: 20, format: "markdown", height: 70 })]) },
      { id: "quote", name: "Quote", make: () => centered([text(0, 0, 360, "> A line worth keeping", { fontSize: 24, format: "markdown", fontFamily: "serif", height: 50 })]) },
      { id: "checklist", name: "Checklist", make: () => centered([{ type: "checklist", width: 260, height: 150, title: "To do", items: [{ text: "First" }, { text: "Second" }, { text: "Third" }] }]) },
      { id: "table", name: "Table", make: () => centered([{ type: "table", width: 360, height: 150, headers: ["", "", ""], rows: [["", "", ""], ["", "", ""]] }]) },
      { id: "formula", name: "Formula", make: () => centered([text(0, 0, 260, "E = mc^2", { fontSize: 32, format: "math", height: 56 })]) },
      { id: "code", name: "Code", make: () => centered([text(0, 0, 360, "function hello() {\n  return \"hi\";\n}", { fontSize: 18, format: "code", fontFamily: "mono", height: 100 })]) },
    ],
  },
  {
    id: "frames",
    name: "Containers",
    entries: [
      { id: "frame", name: "Frame", make: () => centered([{ type: "frame", width: 420, height: 300, title: "Group", color: "#94a3b8", fillColor: "transparent" }]) },
      ...TINTS.map(([, line], i) => ({ id: `frame-${i}`, name: ["Blue area", "Green area", "Yellow area", "Red area", "Purple area", "Teal area"][i], make: () => centered([{ type: "frame", width: 420, height: 300, title: "Group", color: line, fillColor: `${line}14` }]) })),
    ],
  },
  {
    id: "school",
    name: "For learning",
    entries: [
      {
        id: "axes",
        name: "Coordinate axes",
        make: () => [
          arrowItem(-150, 0, 150, 0, { arrowStart: false }),
          arrowItem(0, 120, 0, -120),
          text(138, 8, 30, "x", { fontSize: 20, width: 30, height: 28 }),
          text(8, -140, 30, "y", { fontSize: 20, width: 30, height: 28 }),
        ],
      },
      {
        id: "numberline",
        name: "Number line",
        make: () => [
          arrowItem(-220, 0, 220, 0, { arrowStart: true }),
          ...Array.from({ length: 9 }, (_, i) => [shape("rect", 2, 16, { x: -200 + i * 50, y: -8, strokeWidth: 2, fillColor: INK }), text(-212 + i * 50, 14, 26, String(i - 4), { fontSize: 16, width: 26, height: 22, align: "center" })]).flat(),
        ],
      },
      {
        id: "venn",
        name: "Venn diagram",
        make: () => [
          shape("circle", 200, 200, { x: -170, y: -100, fillColor: "#3b82f633", strokeColor: "#3b82f6" }),
          shape("circle", 200, 200, { x: -30, y: -100, fillColor: "#ef444433", strokeColor: "#ef4444" }),
        ],
      },
      {
        id: "fraction",
        name: "Fraction bar",
        make: () => Array.from({ length: 4 }, (_, i) => shape("rect", 70, 56, { x: -140 + i * 70, y: -28, fillColor: i < 1 ? "#93c5fd" : "transparent", strokeColor: INK })),
      },
      { id: "question", name: "Question", make: () => centered([text(0, 0, 360, "Question: ", { fontSize: 28, bold: true, height: 44 })]) },
      { id: "example", name: "Worked example", make: () => centered([text(0, 0, 400, "**Example**\n\n1. First step\n2. Second step\n3. So the answer is …", { fontSize: 20, format: "markdown", height: 130 })]) },
    ],
  },
  {
    id: "symbols",
    name: "Symbols",
    entries: ["✅", "❌", "⭐", "❤️", "💡", "❓", "❗", "👍", "⚠️", "🎯", "📌", "🔥", "🚀", "➕", "➖", "➡️", "⬅️", "⬆️", "⬇️", "😀", "🎉", "📚", "✏️", "🔒"].map((ch, i) => ({ id: `sym-${i}`, name: ch, make: () => centered([text(0, 0, 70, ch, { fontSize: 48, height: 72, align: "center" })]) })),
  },
];

export const ENTRY_BY_ID = new Map(LIBRARY.flatMap((g) => g.entries.map((e) => [`${g.id}:${e.id}`, e])));

// The items of an entry with their middle at (cx, cy)
export function makeEntry(key, cx = 0, cy = 0) {
  const entry = ENTRY_BY_ID.get(key);
  if (!entry) return [];
  return entry.make().map((it) => {
    const out = { ...it, x: (it.x || 0) + cx, y: (it.y || 0) + cy };
    if (Array.isArray(it.points)) out.points = it.points.map((p) => ({ x: p.x + cx, y: p.y + cy }));
    return out;
  });
}
