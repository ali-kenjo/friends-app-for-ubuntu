// ---------- The tools, in a pill at the bottom of the board ----------
// The page's pill has the everyday tools in front, the rest under "More", and a color well that opens the options of
// the tool (or of what is selected). The small windows (beside the chat, in voice mode) have a shorter one.
import { h } from "../h.js";
import { t } from "../i18n.js";
import { TOOLS, QUICK_TOOLS, SHAPE_CHOICES, PALETTE } from "./tools.mjs";
import { wbIcon } from "./wb-icons.js";
import { popover, menu, iconButton } from "./controls.js";
import { toolGroups, designGroups } from "./inspector.js";

const ICON_FOR = { select: "select", hand: "hand", pen: "pen", highlighter: "highlighter", eraser: "eraser", shape: "shape", line: "line", connector: "connector", text: "text", sticky: "sticky", checklist: "checklist", table: "table", math: "math", code: "code", diagram: "diagram", frame: "frame", image: "image", laser: "laser" };
const FRONT = [["select", "hand"], ["pen", "highlighter", "eraser"], ["shape", "connector", "text", "sticky"]];
const MORE = ["line", "frame", "checklist", "table", "math", "code", "diagram", "image", "laser"];

const toolOf = (id) => TOOLS.find((x) => x.id === id);

export class ToolPill {
  // ui: { view, board } (the owner; the view may come later). compact: the short one for the small windows.
  constructor(ui, { compact = false } = {}) {
    this.ui = ui;
    this.compact = compact;
    this.buttons = new Map();
    this.el = h("div", { class: `rw-pill${compact ? " compact" : ""}`, role: "toolbar", "aria-label": t("Whiteboard tools") });
    this.build();
  }

  get view() {
    return this.ui.view;
  }

  toolButton(id) {
    const tool = toolOf(id);
    const b = h("button", { type: "button", class: "wb-btn wb-tool", "data-wb-tool": id, title: `${t(tool.label)}: ${t(tool.hint)} (${tool.key.toUpperCase()})`, "aria-label": t(tool.label), "aria-pressed": "false", onclick: () => this.view?.setTool(id) }, h("span", { class: "wb-icon", html: wbIcon(ICON_FOR[id], 20) }));
    this.buttons.set(id, b);
    return b;
  }

  build() {
    const parts = [];
    if (this.compact) {
      parts.push(...QUICK_TOOLS.map((id) => this.toolButton(id)));
    } else {
      FRONT.forEach((group, i) => {
        if (i) parts.push(h("span", { class: "wb-sep", role: "separator" }));
        for (const id of group) {
          parts.push(this.toolButton(id));
          if (id === "shape") parts.push(this.shapeCaret());
        }
      });
      parts.push(this.moreButton());
    }
    parts.push(h("span", { class: "wb-sep", role: "separator" }));
    this.well = h("button", { type: "button", class: "rw-well", "aria-haspopup": "true", "aria-expanded": "false", title: t("Color and options"), "aria-label": t("Color and options"), onclick: () => this.openStyle() }, h("i", { class: "rw-well-dot" }));
    parts.push(this.well);
    if (this.compact) {
      this.undoBtn = iconButton("undo", t("Undo (Ctrl+Z)"), () => this.ui.board.undo(), { cls: "small" });
      this.redoBtn = iconButton("redo", t("Redo (Ctrl+Y)"), () => this.ui.board.redo(), { cls: "small" });
      parts.push(this.undoBtn, this.redoBtn);
    }
    this.el.replaceChildren(...parts);
  }

  shapeCaret() {
    const b = h("button", { type: "button", class: "wb-caret", "aria-haspopup": "menu", "aria-expanded": "false", title: t("Pick a shape"), "aria-label": t("Pick a shape"), onclick: () => this.openShapes(b) }, h("span", { html: wbIcon("chevronDown", 12) }));
    return b;
  }

  openShapes(anchor) {
    const cur = this.view?.style.shape;
    menu(anchor, SHAPE_CHOICES.map((c) => ({ label: t(c.label), current: c.id === cur, fn: () => (this.view.setStyle({ shape: c.id }), this.view.setTool("shape")) })));
  }

  moreButton() {
    const b = h("button", { type: "button", class: "wb-btn wb-more", "aria-haspopup": "menu", "aria-expanded": "false", title: t("More tools"), "aria-label": t("More tools"), onclick: () => {
      menu(b, MORE.map((id) => {
        const tool = toolOf(id);
        return { icon: ICON_FOR[id], label: t(tool.label), hint: `${t(tool.hint)} (${tool.key.toUpperCase()})`, current: this.view?.tool === id, fn: () => this.view?.setTool(id) };
      }), { align: "center" });
    } }, h("span", { class: "wb-icon", html: wbIcon("plus", 20) }));
    this.moreBtn = b;
    return b;
  }

  // The options of the tool, or of what is selected
  openStyle() {
    const v = this.view;
    if (!v) return;
    popover(this.well, () => {
      const groups = v.selection.size ? designGroups(v, this.ui) : toolGroups(v) || [h("p", { class: "wb-hint-text" }, t("Pick a tool to see its options."))];
      return h("div", { class: "wb-pop-body" }, ...groups.filter(Boolean));
    }, { label: t("Color and options"), cls: "wb-style-pop" });
  }

  // Which tool is on, and which color it draws in
  sync() {
    const v = this.view;
    if (!v) return;
    for (const [id, b] of this.buttons) {
      b.classList.toggle("active", id === v.tool);
      b.setAttribute("aria-pressed", String(id === v.tool));
    }
    if (this.moreBtn) this.moreBtn.classList.toggle("active", MORE.includes(v.tool));
    const s = v.style;
    const color = v.tool === "highlighter" ? s.hl : v.tool === "sticky" ? s.sticky : v.tool === "shape" && s.fill && s.fill !== "transparent" ? s.fill : s.stroke || PALETTE[0];
    this.well.querySelector(".rw-well-dot").style.background = color;
  }

  syncHistory() {
    const st = this.ui.board.historyState();
    if (this.undoBtn) this.undoBtn.disabled = !st.canUndo;
    if (this.redoBtn) this.redoBtn.disabled = !st.canRedo;
  }
}
