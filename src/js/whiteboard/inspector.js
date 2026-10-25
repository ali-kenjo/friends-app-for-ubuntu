// ---------- The options of what you draw or select ----------
// The panel on the right (the Inspector): nothing selected shows the board's own options (or the tool's), a selection
// shows how it looks (Design), where it is and how it is arranged (Arrange), and what it is (About). The same
// choices appear in a small bar that floats next to the selection (ContextBar), for when the panel is closed.
import { h } from "../h.js";
import { t } from "../i18n.js";
import { getSettings, updateSettings } from "../store.js";
import { PALETTE, FILLS, HIGHLIGHTS, PENS, WIDTHS, SHAPE_CHOICES, FONT_CHOICES, BACKGROUNDS, THEME_CHOICES } from "./tools.mjs";
import { STICKY_COLORS, itemLabel } from "./model.mjs";
import { wbIcon } from "./wb-icons.js";
import { iconButton, swatchRow, selectField, segmented, numberStepper, field, section, toggleRow, ago } from "./controls.js";

const wbSettings = () => getSettings()?.whiteboard || {};
export const setWb = (patch) => updateSettings((s) => Object.assign((s.whiteboard ||= {}), patch));
const LINES = ["line", "arrow", "double_arrow", "connector"];
const isLine = (it) => it.type === "shape" && LINES.includes(it.shapeType);
const nearest = (list, n) => list.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));

const TYPE_NAMES = { stroke: "Drawing", shape: "Shape", text: "Text", sticky: "Sticky note", checklist: "Checklist", table: "Table", image: "Picture", diagram: "Diagram", frame: "Frame" };
export const typeName = (it) => (it.type === "shape" && it.shapeType === "connector" ? t("Arrow") : isLine(it) ? t("Line") : t(TYPE_NAMES[it.type] || it.type));
const authorName = (a) => (a === "ai" ? t("the robot") : a === "mission" ? t("a mission") : t("you"));

// How thick: a few lines to pick from
function widthPicker(value, onPick, label) {
  return h("div", { class: "wb-widths", role: "group", "aria-label": label },
    ...WIDTHS.map((w) => h("button", { type: "button", class: nearest(WIDTHS, value) === w ? "active" : "", "aria-pressed": String(nearest(WIDTHS, value) === w), title: `${w}`, "aria-label": `${label}: ${w}`, onclick: () => onPick(w) }, h("i", { style: `height:${Math.max(2, Math.min(w, 12))}px` }))));
}

const COLOR_KEY = (it) => (it.type === "shape" ? "strokeColor" : ["stroke", "sticky", "frame", "text"].includes(it.type) ? "color" : null);

// What can be set about the things you select, as groups of controls for a panel (or a bar)
export function designGroups(view, ui) {
  const items = view.selectedItems();
  const first = items[0];
  const types = new Set(items.map((i) => i.type));
  const has = (...ts) => ts.some((x) => types.has(x));
  const shapesOnly = items.every((i) => i.type !== "shape" || !isLine(i));
  const out = [];

  const colored = items.filter((i) => COLOR_KEY(i));
  if (colored.length) {
    const cur = first[COLOR_KEY(first)] || PALETTE[0];
    const onlySticky = types.size === 1 && types.has("sticky");
    out.push(section(onlySticky ? t("Color of the note") : has("text") && !has("shape", "stroke") ? t("Text color") : t("Color"), swatchRow(onlySticky ? STICKY_COLORS : PALETTE, cur, (c) => view.store.apply(colored.map((i) => ({ op: "update", page: view.page.id, id: i.id, set: { [COLOR_KEY(i)]: c } }))), t("Color"), { custom: !onlySticky })));
  }
  if (has("shape", "frame") && items.some((i) => i.type === "frame" || (i.type === "shape" && !isLine(i)))) {
    out.push(section(t("Fill"), swatchRow(FILLS, first.fillColor || "transparent", (c) => view.setProps({ fillColor: c }, (i) => i.type === "frame" || (i.type === "shape" && !isLine(i))), t("Fill color"))));
  }
  if (has("shape") && shapesOnly) {
    out.push(section(t("Shape"), selectField(SHAPE_CHOICES.map((c) => [c.id, t(c.label)]), first.shapeType, (v) => view.setProps({ shapeType: v }, (i) => i.type === "shape"), t("Shape"))));
  }
  if (has("shape", "stroke")) {
    const w = first.type === "stroke" ? first.size : first.strokeWidth;
    const rows = [field(t("Thickness"), widthPicker(w || 4, (x) => view.store.apply(items.map((i) => (i.type === "stroke" ? { op: "update", page: view.page.id, id: i.id, set: { size: x } } : i.type === "shape" ? { op: "update", page: view.page.id, id: i.id, set: { strokeWidth: x } } : null)).filter(Boolean)), t("Thickness")))];
    if (has("shape")) rows.push(field(t("Line"), segmented([["solid", t("Solid")], ["dashed", t("Dashed")], ["dotted", t("Dotted")]], first.strokeStyle || "solid", (x) => view.setProps({ strokeStyle: x }, (i) => i.type === "shape"), t("Line style"))));
    rows.push(field(t("Opacity"), numberStepper(Math.round((first.opacity ?? 1) * 100), 5, 100, 5, (n) => view.setProps({ opacity: n / 100 }, (i) => i.type === "stroke" || i.type === "shape"), t("Opacity (%)"))));
    out.push(section(t("Line"), ...rows));
  }
  if (items.some(isLine)) {
    out.push(section(t("Arrow"),
      field(t("Ends"), h("div", { class: "wb-seg-icons" },
        iconButton("back", t("Arrow at the start"), () => view.setProps({ arrowStart: !first.arrowStart }, (i) => i.type === "shape"), { pressed: Boolean(first.arrowStart), active: Boolean(first.arrowStart), cls: "small" }),
        iconButton("line", t("Arrow at the end"), () => view.setProps({ arrowEnd: !first.arrowEnd }, (i) => i.type === "shape"), { pressed: Boolean(first.arrowEnd), active: Boolean(first.arrowEnd), cls: "small" }))),
      first.shapeType === "connector" ? field(t("Route"), selectField([["straight", t("Straight")], ["elbow", t("Square corners")], ["curve", t("Curved")]], first.route || "straight", (r) => view.setProps({ route: r }, (i) => i.type === "shape" && i.shapeType === "connector"), t("Route"))) : null));
  }
  if (has("shape") && items.some((i) => i.type === "shape" && !isLine(i))) {
    out.push(section(t("Words inside"),
      field(t("Size"), numberStepper(first.fontSize || 20, 8, 120, 2, (n) => view.setProps({ fontSize: n }, (i) => i.type === "shape" && !isLine(i)), t("Size"))),
      field(t("Color"), swatchRow(PALETTE.slice(0, 8), first.labelColor || PALETTE[0], (c) => view.setProps({ labelColor: c }, (i) => i.type === "shape" && !isLine(i)), t("Color of the words"), { custom: false })),
      h("button", { type: "button", class: "btn small", onclick: () => view.editText(first, "label") }, t("Edit the words"))));
  }
  if (has("text")) {
    out.push(section(t("Text"),
      field(t("Font"), selectField(FONT_CHOICES.map((f) => [f.id, t(f.label)]), first.fontFamily || "marker", (f) => view.setProps({ fontFamily: f }, (i) => i.type === "text"), t("Font"))),
      field(t("Size"), numberStepper(first.fontSize || 20, 8, 160, 2, (n) => view.setProps({ fontSize: n }, (i) => i.type === "text"), t("Size"))),
      field(t("Align"), segmented([["left", t("Left")], ["center", t("Center")], ["right", t("Right")]], first.align || "left", (a) => view.setProps({ align: a }, (i) => i.type === "text"), t("Align"))),
      field(t("Reads as"), selectField([["plain", t("Plain")], ["markdown", t("Markdown")], ["math", t("Formula")], ["code", t("Code")]], first.format || "plain", (f) => view.setProps({ format: f }, (i) => i.type === "text"), t("How to read it"))),
      toggleRow(t("Bold"), Boolean(first.bold), (on) => view.setProps({ bold: on ? true : null }, (i) => i.type === "text"))));
  }
  if (has("table")) {
    const tbl = first;
    out.push(section(t("Table"), h("div", { class: "wb-btn-row" },
      h("button", { type: "button", class: "btn small", onclick: () => view.setProps({ rows: [...tbl.rows, Array(Math.max(1, tbl.headers.length)).fill("")] }, (i) => i.type === "table") }, t("+ Row")),
      h("button", { type: "button", class: "btn small", onclick: () => view.setProps({ headers: [...tbl.headers, ""], rows: tbl.rows.map((r) => [...r, ""]) }, (i) => i.type === "table") }, t("+ Column")),
      h("button", { type: "button", class: "btn small", onclick: () => tbl.rows.length && view.setProps({ rows: tbl.rows.slice(0, -1) }, (i) => i.type === "table") }, t("− Row")),
      h("button", { type: "button", class: "btn small", onclick: () => tbl.headers.length > 1 && view.setProps({ headers: tbl.headers.slice(0, -1), rows: tbl.rows.map((r) => r.slice(0, -1)) }, (i) => i.type === "table") }, t("− Column")))));
  }
  if (has("checklist")) {
    out.push(section(t("Checklist"), h("div", { class: "wb-btn-row" },
      h("button", { type: "button", class: "btn small", onclick: () => view.editText(first, "lines") }, t("Edit lines")),
      h("button", { type: "button", class: "btn small", onclick: () => view.store.apply(first.items.filter((c) => !c.checked).map((c) => ({ op: "check", page: view.page.id, id: first.id, item: c.id, checked: true }))) }, t("Tick all")),
      h("button", { type: "button", class: "btn small", onclick: () => view.store.apply(first.items.filter((c) => c.checked).map((c) => ({ op: "check", page: view.page.id, id: first.id, item: c.id, checked: false }))) }, t("Untick all")))));
  }
  if (has("image")) out.push(section(t("Picture"), field(t("Fills the frame"), segmented([["contain", t("Fit")], ["cover", t("Fill")]], first.fit || "contain", (f) => view.setProps({ fit: f }, (i) => i.type === "image"), t("How it fills the frame")))));
  if (has("diagram")) out.push(section(t("Diagram"), h("button", { type: "button", class: "btn small", onclick: () => ui.editDiagram(first) }, t("Edit text"))));
  if (has("frame")) out.push(section(t("Frame"), h("button", { type: "button", class: "btn small", onclick: () => view.editText(first, "title") }, t("Rename"))));
  return out;
}

// What the current tool will make (nothing selected)
export function toolGroups(view) {
  const s = view.style;
  const tool = view.tool;
  const set = (k) => (v) => view.setStyle({ [k]: v });
  const hint = (text) => h("p", { class: "wb-hint-text" }, text);
  switch (tool) {
    case "pen":
      return [
        section(t("Pen"), selectField(PENS.map((p) => [p.id, t(p.label)]), s.pen, (p) => view.setStyle({ pen: p, width: PENS.find((x) => x.id === p).width }), t("Pen")), field(t("Thickness"), widthPicker(s.width, set("width"), t("Thickness")))),
        section(t("Color"), swatchRow(PALETTE, s.stroke, set("stroke"), t("Color"))),
      ];
    case "highlighter":
      return [section(t("Highlighter"), swatchRow(HIGHLIGHTS, s.hl, set("hl"), t("Color")))];
    case "shape":
      return [
        section(t("Shape"), selectField(SHAPE_CHOICES.map((c) => [c.id, t(c.label)]), s.shape, set("shape"), t("Shape"))),
        section(t("Outline"), swatchRow(PALETTE, s.stroke, set("stroke"), t("Outline color")), field(t("Thickness"), widthPicker(s.width, set("width"), t("Thickness")))),
        section(t("Fill"), swatchRow(FILLS, s.fill, set("fill"), t("Fill color"))),
      ];
    case "line":
      return [
        section(t("Line"), segmented([["arrow", t("Arrow")], ["line", t("Line")], ["double_arrow", t("Both ends")]], s.line, set("line"), t("Kind of line")), segmented([["solid", t("Solid")], ["dashed", t("Dashed")], ["dotted", t("Dotted")]], s.dash, set("dash"), t("Line style")), field(t("Thickness"), widthPicker(s.width, set("width"), t("Thickness")))),
        section(t("Color"), swatchRow(PALETTE, s.stroke, set("stroke"), t("Color"))),
      ];
    case "connector":
      return [hint(t("Drag from one thing to another: the arrow stays attached when you move them.")), section(t("Color"), swatchRow(PALETTE, s.stroke, set("stroke"), t("Color")), field(t("Thickness"), widthPicker(s.width, set("width"), t("Thickness"))))];
    case "text":
    case "math":
    case "code":
      return [
        section(t("Text"), field(t("Font"), selectField(FONT_CHOICES.map((f) => [f.id, t(f.label)]), s.fontFamily, set("fontFamily"), t("Font"))), field(t("Size"), numberStepper(s.fontSize, 8, 160, 2, set("fontSize"), t("Size")))),
        section(t("Color"), swatchRow(PALETTE, s.stroke, set("stroke"), t("Color"))),
        tool === "text" ? hint(t("Markdown works: **bold**, - lists, # headings")) : null,
      ];
    case "sticky":
      return [section(t("Color of the note"), swatchRow(STICKY_COLORS, s.sticky, set("sticky"), t("Note color"), { custom: false }))];
    case "frame":
      return [hint(t("Drag to draw a frame. Things inside it move with it.")), section(t("Color"), swatchRow(PALETTE, s.stroke, set("stroke"), t("Color")))];
    case "eraser":
      return [hint(t("Drag over things to rub them out."))];
    case "laser":
      return [hint(t("Move over the board to point at something. The robot sees where you point."))];
    case "hand":
      return [hint(t("Drag to move around. Scroll or pinch to zoom."))];
    default:
      return null;
  }
}

// The board's own options (nothing selected, the Select tool)
export function boardGroups(ui) {
  const wb = wbSettings();
  return [
    section(t("Paper"),
      field(t("Pattern"), selectField(BACKGROUNDS.map((b) => [b.id, t(b.label)]), wb.bgPattern || "grid", (v) => setWb({ bgPattern: v }), t("Paper"))),
      field(t("Look"), selectField(THEME_CHOICES.map((b) => [b.id, t(b.label)]), wb.dockTheme || "auto", (v) => setWb({ dockTheme: v }), t("Board look"))),
      field(t("Grid size"), numberStepper(wb.gridSize || 28, 12, 64, 4, (n) => setWb({ gridSize: n }), t("Grid size")))),
    section(t("Helpers"),
      toggleRow(t("Snap things to the grid"), Boolean(wb.snapToGrid), (on) => setWb({ snapToGrid: on })),
      toggleRow(t("Guide lines while moving"), wb.smartGuides !== false, (on) => setWb({ smartGuides: on })),
      field(t("Who made what"), selectField([["off", t("Never show")], ["hover", t("When pointing at it")], ["always", t("Always")]], wb.showAuthors || "hover", (v) => setWb({ showAuthors: v }), t("Who made what")))),
    section(t("The robot and this board"),
      h("button", { type: "button", class: "btn small", onclick: () => ui.showWhatItSees() }, h("span", { html: wbIcon("eye", 16) }), t("What the robot sees")),
      h("button", { type: "button", class: "wb-link", onclick: () => document.dispatchEvent(new CustomEvent("friends:open-settings", { detail: { tab: "robot" } })) }, t("More whiteboard settings…"))),
  ];
}

// Where it is and how things line up
export function arrangeGroups(view) {
  const items = view.selectedItems();
  if (!items.length) return [];
  const box = view.selectionBox();
  const first = items[0];
  const out = [];
  const num = (label, value, key) => {
    const input = h("input", { type: "number", class: "field wb-number", value: Math.round(value), step: "1", "aria-label": label, title: label });
    input.addEventListener("change", () => view.setSelectionBox({ [key]: Number(input.value) }));
    input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur());
    return h("label", { class: "wb-xy" }, h("span", {}, label), input);
  };
  const locked = items.every((i) => i.locked);
  out.push(section(t("Place and size"), h("div", { class: "wb-xy-grid" }, num("X", box.minX, "x"), num("Y", box.minY, "y"), num(t("W"), box.width, "width"), num(t("H"), box.height, "height"))));
  if (items.length === 1 && ["shape", "text", "image"].includes(first.type) && !isLine(first)) {
    out.push(section(t("Turn"), numberStepper(first.rotation || 0, -180, 180, 5, (n) => view.setProps({ rotation: n }, (i) => i.type !== "stroke"), t("Angle (degrees)"))));
  }
  if (items.length >= 2) {
    const a = (icon, label, mode) => iconButton(icon, label, () => view.arrange(mode), { cls: "small" });
    out.push(section(t("Line up"),
      h("div", { class: "wb-btn-row" }, a("alignLeft", t("Align left"), "align_left"), a("alignCenter", t("Align centers"), "align_center"), a("alignRight", t("Align right"), "align_right"), a("alignTop", t("Align top"), "align_top"), a("alignMiddle", t("Align middles"), "align_middle"), a("alignBottom", t("Align bottom"), "align_bottom")),
      h("div", { class: "wb-btn-row" }, a("distH", t("Spread out across"), "distribute_h"), a("distV", t("Spread out down"), "distribute_v"),
        h("button", { type: "button", class: "btn small", onclick: () => view.arrange("grid") }, t("Grid")),
        h("button", { type: "button", class: "btn small", onclick: () => view.arrange("stack_v") }, t("Stack down")),
        h("button", { type: "button", class: "btn small", onclick: () => view.arrange("stack_h") }, t("Stack across")))));
  }
  out.push(section(t("Order"), h("div", { class: "wb-btn-row" },
    iconButton("front", t("Bring to front (Ctrl+Shift+])"), () => view.order("front"), { cls: "small" }),
    h("button", { type: "button", class: "btn small", onclick: () => view.order("forward") }, t("Forward")),
    h("button", { type: "button", class: "btn small", onclick: () => view.order("backward") }, t("Backward")),
    iconButton("back", t("Send to back (Ctrl+Shift+[)"), () => view.order("back"), { cls: "small" }))));
  out.push(section(t("Things you can do"), h("div", { class: "wb-btn-row" },
    h("button", { type: "button", class: "btn small", "aria-pressed": String(locked), onclick: () => view.setLocked(!locked) }, h("span", { html: wbIcon(locked ? "unlock" : "lock", 16) }), locked ? t("Unlock") : t("Lock")),
    h("button", { type: "button", class: "btn small", onclick: () => view.duplicate() }, h("span", { html: wbIcon("copy", 16) }), t("Duplicate")),
    h("button", { type: "button", class: "btn small", onclick: () => view.wrapInFrame() }, h("span", { html: wbIcon("frame", 16) }), t("Wrap in a frame")),
    h("button", { type: "button", class: "btn small danger", onclick: () => view.deleteSelection() }, h("span", { html: wbIcon("trash", 16) }), t("Delete")))));
  out.push(section(t("Style"), h("div", { class: "wb-btn-row" },
    h("button", { type: "button", class: "btn small", onclick: () => view.copyStyle() }, t("Copy the look")),
    h("button", { type: "button", class: "btn small", onclick: () => view.pasteStyle() }, t("Paste the look")))));
  return out;
}

// What it is, and who made it
export function aboutGroups(view, ui) {
  const items = view.selectedItems();
  if (!items.length) return [];
  const it = items[0];
  const rows = [];
  if (items.length === 1) {
    rows.push(
      ["Kind", typeName(it)],
      ["Made by", authorName(it.author)],
      ["Name for the robot", `[${it.id}]`]
    );
    if (it.createdAt) rows.push(["Made", ago(it.createdAt)]);
    if (it.updatedAt && it.updatedAt - (it.createdAt || 0) > 2000) rows.push(["Changed", ago(it.updatedAt)]);
    if (it.locked) rows.push(["Locked", t("Yes")]);
    const label = itemLabel(it, 160);
    if (label) rows.push(["Says", label]);
  } else {
    rows.push(["Selected", t("{n} things", { n: items.length })]);
    const mine = items.filter((i) => i.author === "user").length;
    rows.push(["Made by", `${mine} ${t("by you")}, ${items.length - mine} ${t("by the robot or a mission")}`]);
  }
  return [
    section("", h("dl", { class: "wb-about" }, rows.flatMap(([k, v]) => [h("dt", {}, t(k)), h("dd", { dir: "auto" }, v)]))),
    section(t("With the robot"), h("div", { class: "wb-btn-row" },
      h("button", { type: "button", class: "btn small", onclick: () => ui.askAbout(items) }, h("span", { html: wbIcon("ask", 16) }), t("Ask the robot about this")),
      h("button", { type: "button", class: "btn small", onclick: () => ui.askAbout(items, t("Explain this to me, and point at the parts as you go.")) }, h("span", { html: wbIcon("eye", 16) }), t("Explain this")))),
  ];
}

// ---------- The panel ----------
export class Inspector {
  constructor(ui) {
    this.ui = ui;
    this.tab = "design";
    this.head = h("div", { class: "rw-inspector-tabs", role: "tablist", "aria-label": t("Options") });
    this.body = h("div", { class: "rw-inspector-body", role: "tabpanel" });
    this.title = h("h2", { class: "rw-panel-title" }, t("Options"));
    this.el = h("aside", { class: "rw-inspector", "aria-label": t("Options") }, this.title, this.head, this.body);
  }

  get view() {
    return this.ui.view;
  }

  // Redraws, unless you are typing in one of its fields (that would take the cursor away)
  render({ force = false } = {}) {
    const v = this.view;
    if (!v || this.el.hidden) return;
    const active = document.activeElement;
    if (!force && this.el.contains(active) && active.matches?.("input[type=number], input[type=text], textarea")) return;
    const count = v.selection.size;
    const tabs = count ? [["design", t("Design")], ["arrange", t("Arrange")], ["about", t("About")]] : [];
    if (!tabs.some(([id]) => id === this.tab)) this.tab = "design";
    this.head.hidden = !count;
    this.head.replaceChildren(...tabs.map(([id, label]) => h("button", { type: "button", role: "tab", id: `insp-tab-${id}`, "aria-selected": String(id === this.tab), tabindex: id === this.tab ? "0" : "-1", class: id === this.tab ? "active" : "", onclick: () => ((this.tab = id), this.render({ force: true })), onkeydown: (e) => this.tabKey(e, tabs) }, label)));
    this.body.setAttribute("aria-labelledby", count ? `insp-tab-${this.tab}` : "");
    let groups;
    if (count) {
      this.title.textContent = v.selection.size === 1 ? typeName(v.selectedItems()[0]) : t("{n} selected", { n: count });
      groups = this.tab === "arrange" ? arrangeGroups(v) : this.tab === "about" ? aboutGroups(v, this.ui) : designGroups(v, this.ui);
    } else {
      groups = toolGroups(v);
      this.title.textContent = groups ? t("Tool options") : t("The board");
      groups ||= boardGroups(this.ui);
    }
    this.body.replaceChildren(...groups.filter(Boolean));
  }

  tabKey(e, tabs) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = tabs.findIndex(([id]) => id === this.tab);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length][0];
    this.tab = next;
    this.render({ force: true });
    document.getElementById(`insp-tab-${next}`)?.focus();
    e.preventDefault();
  }
}

// ---------- The bar next to the selection ----------
export class ContextBar {
  constructor(ui) {
    this.ui = ui;
    this.el = h("div", { class: "rw-ctx", role: "toolbar", "aria-label": t("What you can do with the selection"), hidden: true });
    this.key = "";
  }

  // Follows the selection around the board; called whenever the board is painted
  place() {
    const v = this.ui.view;
    const rect = v?.selection.size && !v.drag && !v.editor.active ? v.selectionRect() : null;
    if (!rect || !this.ui.ctxBarWanted()) {
      this.el.hidden = true;
      return;
    }
    const key = [...v.selection].join(",") + this.signature(v);
    if (key !== this.key) {
      this.key = key;
      this.build();
    }
    this.el.hidden = false;
    const w = this.el.offsetWidth || 260;
    const hgt = this.el.offsetHeight || 44;
    const stage = v.stage;
    let left = rect.left + rect.width / 2 - w / 2;
    let top = rect.top - hgt - 14;
    if (top < 8) top = Math.min(rect.bottom + 14, stage.clientHeight - hgt - 70);
    left = Math.max(8, Math.min(left, stage.clientWidth - w - 8));
    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(Math.max(8, top))}px`;
  }

  // What the bar shows depends on the kind of thing, its color and whether it is locked
  signature(v) {
    return v.selectedItems().map((i) => `${i.type}${i.locked ? "L" : ""}${i[COLOR_KEY(i) || "color"] || ""}${i.fillColor || ""}`).join("|");
  }

  build() {
    const v = this.ui.view;
    const items = v.selectedItems();
    if (!items.length) return;
    const first = items[0];
    const kids = [];
    const locked = items.every((i) => i.locked);
    const colorKey = COLOR_KEY(first);
    if (colorKey && !locked) {
      const cur = first[colorKey] || PALETTE[0];
      const onlySticky = items.every((i) => i.type === "sticky");
      const chip = h("button", { type: "button", class: "rw-ctx-color", "aria-haspopup": "true", "aria-expanded": "false", title: t("Color"), "aria-label": t("Color"), style: `background:${cur}`, onclick: () => this.ui.colorPopover(chip, items, onlySticky) });
      kids.push(chip);
    }
    if (items.some((i) => i.type === "shape" && !isLine(i)) && !locked) {
      const fillChip = h("button", { type: "button", class: "rw-ctx-color fill", "aria-haspopup": "true", "aria-expanded": "false", title: t("Fill"), "aria-label": t("Fill"), style: `background:${first.fillColor && first.fillColor !== "transparent" ? first.fillColor : "transparent"}`, onclick: () => this.ui.fillPopover(fillChip, items) });
      kids.push(fillChip);
    }
    if (kids.length) kids.push(h("span", { class: "wb-sep", role: "separator" }));
    kids.push(
      iconButton(locked ? "unlock" : "lock", locked ? t("Unlock (Ctrl+L)") : t("Lock so nobody moves it (Ctrl+L)"), () => v.setLocked(!locked), { cls: "small", pressed: locked, active: locked }),
      iconButton("copy", t("Duplicate (Ctrl+D)"), () => v.duplicate(), { cls: "small" }),
      iconButton("trash", t("Delete (Delete)"), () => v.deleteSelection(), { cls: "small danger" }),
      h("span", { class: "wb-sep", role: "separator" }),
      h("button", { type: "button", class: "btn small rw-ctx-ask", title: t("Ask the robot about this"), onclick: () => this.ui.askAbout(items) }, h("span", { html: wbIcon("ask", 16) }), t("Ask the robot")),
      iconButton("sliders", t("More options"), () => this.ui.openInspector(), { cls: "small" })
    );
    this.el.replaceChildren(...kids);
  }
}

export { widthPicker };
