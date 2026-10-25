// Writing on the board: one text box that opens right where the thing is, looks like it (same font, color, size,
// zoomed with the board), grows as you type, and closes when you click elsewhere. Used for text, sticky notes,
// formulas, code, labels, titles, checklist lines and table cells.
export class InlineEditor {
  constructor(layer) {
    this.layer = layer;
    this.el = null;
    this.done = null;
  }

  get active() {
    return Boolean(this.el);
  }

  // rect: { left, top, width, height } in screen pixels inside the layer
  // font: { css (font shorthand without size), size (px, already zoomed), color, align, lineHeight }
  open({ rect, value = "", font = {}, multiline = true, placeholder = "", background = "", radius = 4, onCommit, onCancel, onTab, label = "Edit", mono = false, rtlAuto = true, minLines = 1 }) {
    this.close(false);
    const el = document.createElement(multiline ? "textarea" : "input");
    if (!multiline) el.type = "text";
    el.className = "wb-editor";
    el.value = value;
    el.placeholder = placeholder;
    el.setAttribute("aria-label", label);
    el.spellcheck = true;
    if (rtlAuto) el.dir = "auto";
    Object.assign(el.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${Math.max(40, rect.width)}px`,
      minHeight: `${Math.max(font.size * 1.3 * minLines, rect.height || 0)}px`,
      font: `${font.css || ""} ${font.size}px ${font.family || "inherit"}`.trim(),
      color: font.color || "inherit",
      textAlign: font.align || "left",
      lineHeight: String(font.lineHeight || 1.32),
      background: background || "transparent",
      borderRadius: `${radius}px`,
      padding: `${Math.max(2, font.pad ?? 6)}px`,
    });
    if (mono) el.style.fontFamily = "ui-monospace, Menlo, Consolas, monospace";
    this.el = el;
    this.layer.appendChild(el);
    let finished = false;
    let initial = value;
    const grow = () => {
      if (!multiline) return;
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight + 2, rect.height || 0)}px`;
    };
    const finish = (commit) => {
      if (finished) return;
      finished = true;
      const text = el.value;
      this.el = null;
      el.remove();
      if (commit) onCommit?.(text, text !== initial);
      else onCancel?.();
    };
    this.done = finish;
    el.addEventListener("input", grow);
    el.addEventListener("keydown", (e) => {
      e.stopPropagation(); // typing is not a shortcut
      if (e.key === "Escape") {
        e.preventDefault();
        finish(true);
      } else if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        finish(true);
      } else if (e.key === "Tab" && onTab) {
        e.preventDefault();
        const text = el.value;
        finished = true;
        this.el = null;
        el.remove();
        onTab(text, e.shiftKey, text !== initial);
      }
    });
    el.addEventListener("blur", () => setTimeout(() => finish(true), 0));
    // Clicks inside the editor must not reach the board
    for (const type of ["pointerdown", "pointerup", "click", "dblclick", "contextmenu", "wheel"]) el.addEventListener(type, (e) => e.stopPropagation());
    requestAnimationFrame(() => {
      grow();
      el.focus({ preventScroll: true });
      el.select?.();
    });
    return el;
  }

  // Closes without saving (the thing being edited went away, or the board is being left)
  close(commit = false) {
    if (this.done) {
      const f = this.done;
      this.done = null;
      f(commit);
    }
  }
}
