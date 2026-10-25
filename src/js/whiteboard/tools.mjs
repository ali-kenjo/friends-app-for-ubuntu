// The whiteboard's tools and the choices that go with them (colors, pens, shapes): one list, used by the toolbar
// in the full view, the small toolbars of the side panel and of voice mode, the keyboard shortcuts and the tests.

export const TOOLS = [
  { id: "select", key: "v", label: "Select", hint: "Select and move things" },
  { id: "hand", key: "h", label: "Hand", hint: "Move around the board (or hold Space)" },
  { id: "pen", key: "p", label: "Pen", hint: "Draw" },
  { id: "highlighter", key: "m", label: "Highlighter", hint: "Mark things with a see-through color" },
  { id: "eraser", key: "e", label: "Eraser", hint: "Rub things out" },
  { id: "shape", key: "r", label: "Shapes", hint: "Boxes, circles, stars and more" },
  { id: "line", key: "l", label: "Arrow", hint: "Lines and arrows" },
  { id: "connector", key: "c", label: "Connector", hint: "An arrow that stays attached to what it joins" },
  { id: "text", key: "t", label: "Text", hint: "Write, with Markdown if you like" },
  { id: "sticky", key: "n", label: "Sticky note", hint: "Stick a note on the board" },
  { id: "checklist", key: "k", label: "Checklist", hint: "A list you can tick off" },
  { id: "table", key: "b", label: "Table", hint: "Rows and columns" },
  { id: "math", key: "f", label: "Formula", hint: "A maths formula (LaTeX)" },
  { id: "code", key: "d", label: "Code", hint: "A code block" },
  { id: "diagram", key: "g", label: "Diagram", hint: "A flowchart or mind map from text" },
  { id: "frame", key: "w", label: "Frame", hint: "Group things under a title" },
  { id: "image", key: "i", label: "Picture", hint: "Put a picture on the board" },
  { id: "laser", key: "z", label: "Pointer", hint: "Point at things; the robot sees where" },
];
export const TOOL_IDS = TOOLS.map((t) => t.id);
export const TOOL_BY_KEY = Object.fromEntries(TOOLS.map((t) => [t.key, t.id]));

// Tools the small toolbars show
export const QUICK_TOOLS = ["select", "pen", "highlighter", "eraser", "shape", "text", "sticky", "laser"];

export const PALETTE = ["#1e293b", "#dc2626", "#ea580c", "#d97706", "#16a34a", "#0d9488", "#2563eb", "#7c3aed", "#db2777", "#6b7280", "#ffffff"];
export const FILLS = ["transparent", "#fee2e2", "#ffedd5", "#fef9c3", "#dcfce7", "#ccfbf1", "#dbeafe", "#ede9fe", "#fce7f3", "#e2e8f0", "#1e293b"];
export const HIGHLIGHTS = ["#fde047", "#86efac", "#7dd3fc", "#f9a8d4", "#fdba74", "#c4b5fd"];

export const PENS = [
  { id: "marker", label: "Marker", width: 4 },
  { id: "pen", label: "Fine pen", width: 2.5 },
  { id: "pencil", label: "Pencil", width: 2 },
  { id: "chalk", label: "Chalk", width: 5 },
];

export const WIDTHS = [2, 4, 8, 14];

export const SHAPE_CHOICES = [
  { id: "rect", label: "Rectangle" },
  { id: "round_rect", label: "Rounded box" },
  { id: "ellipse", label: "Ellipse" },
  { id: "circle", label: "Circle" },
  { id: "triangle", label: "Triangle" },
  { id: "diamond", label: "Diamond" },
  { id: "hexagon", label: "Hexagon" },
  { id: "star", label: "Star" },
  { id: "cylinder", label: "Cylinder" },
  { id: "cloud", label: "Cloud" },
  { id: "speech_bubble", label: "Speech bubble" },
];

export const FONT_CHOICES = [
  { id: "marker", label: "Handwriting" },
  { id: "sans", label: "Clean" },
  { id: "serif", label: "Book" },
  { id: "mono", label: "Code" },
  { id: "chalk", label: "Chalk" },
];

export const BACKGROUNDS = [
  { id: "grid", label: "Grid" },
  { id: "dots", label: "Dots" },
  { id: "ruled", label: "Lined paper" },
  { id: "graph", label: "Graph paper" },
  { id: "isometric", label: "Isometric" },
  { id: "music", label: "Music staves" },
  { id: "plain", label: "Plain" },
];

export const THEME_CHOICES = [
  { id: "auto", label: "Follow the app" },
  { id: "paper", label: "Paper" },
  { id: "midnight", label: "Midnight" },
  { id: "classic", label: "Whiteboard" },
  { id: "chalkboard", label: "Chalkboard" },
  { id: "blueprint", label: "Blueprint" },
  { id: "cork", label: "Cork" },
  { id: "glass", label: "Glass" },
  { id: "neon", label: "Neon" },
];

export const DEFAULT_STYLE = Object.freeze({
  stroke: "#1e293b",
  fill: "transparent",
  hl: "#fde047",
  width: 4,
  dash: "solid",
  opacity: 1,
  pen: "marker",
  shape: "rect",
  line: "arrow",
  fontSize: 24,
  fontFamily: "marker",
  align: "left",
  sticky: "#fef08a",
});

// The canvas the robot is told about, and the paper outline drawn on the board
export const BOARD_AREA = Object.freeze({ x: 0, y: 0, width: 1600, height: 1000 });
