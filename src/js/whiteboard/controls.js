// Small controls the board's panels are made of: icon buttons, swatches, pickers, steppers, popovers and menus.
// They look the same everywhere (the tool pill, the inspector, the side panels, the windows).
import { h } from "../h.js";
import { t } from "../i18n.js";
import { wbIcon } from "./wb-icons.js";
import { colorLabel } from "./color-label.js";

export function iconButton(icon, label, onClick, { active = false, cls = "", disabled = false, pressed, size = 18 } = {}) {
  const b = h("button", { type: "button", class: `wb-btn${active ? " active" : ""} ${cls}`.trim(), title: label, "aria-label": label, onclick: onClick, disabled }, h("span", { class: "wb-icon", html: wbIcon(icon, size) }));
  if (pressed !== undefined) b.setAttribute("aria-pressed", String(pressed));
  return b;
}

export function swatchRow(colors, current, onPick, label, { custom = true } = {}) {
  const row = h("div", { class: "wb-swatches", role: "group", "aria-label": label });
  for (const c of colors) {
    const clear = c === "transparent";
    row.append(h("button", { type: "button", class: `wb-swatch${c === current ? " active" : ""}${clear ? " none" : ""}`, style: clear ? "" : `background:${c}`, title: clear ? t("None") : colorLabel(c), "aria-label": clear ? t("No color") : colorLabel(c), "aria-pressed": String(c === current), onclick: () => onPick(c) }));
  }
  if (custom) {
    const input = h("input", { type: "color", class: "wb-color-input", "aria-label": t("Another color"), title: t("Another color"), value: /^#[0-9a-f]{6}$/i.test(current) ? current : "#2563eb" });
    input.addEventListener("input", () => onPick(input.value));
    row.append(input);
  }
  return row;
}

export function selectField(options, value, onChange, label) {
  const sel = h("select", { class: "field wb-select", "aria-label": label, title: label }, ...options.map(([v, l]) => h("option", { value: v, selected: v === value }, l)));
  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}

export function segmented(options, value, onChange, label) {
  return h("div", { class: "wb-seg", role: "group", "aria-label": label }, ...options.map(([v, l, icon]) => h("button", { type: "button", class: v === value ? "active" : "", "aria-pressed": String(v === value), title: l, "aria-label": l, onclick: () => onChange(v) }, icon ? h("span", { html: wbIcon(icon, 16) }) : l)));
}

export function numberStepper(value, min, max, step, onChange, label) {
  const input = h("input", { type: "number", class: "field wb-number", min, max, step, value: Math.round(value), "aria-label": label, title: label });
  input.addEventListener("change", () => onChange(Math.min(max, Math.max(min, Number(input.value) || min))));
  return input;
}

// A labelled row: the label on one side, the control on the other
export function field(label, control, { stack = false } = {}) {
  return h("label", { class: `wb-row${stack ? " stack" : ""}` }, h("span", { class: "wb-row-label" }, label), control);
}

// A titled group in a panel
export function section(title, ...kids) {
  return h("section", { class: "wb-group" }, title ? h("h3", { class: "wb-group-title" }, title) : null, ...kids);
}

// A switch with its label
export function toggleRow(label, checked, onChange, { hint = "", name = "" } = {}) {
  const input = h("input", { type: "checkbox", class: "toggle", "data-wb-toggle": name || undefined });
  input.checked = Boolean(checked);
  input.addEventListener("change", () => onChange(input.checked));
  const row = h("label", { class: "wb-toggle-row" }, h("span", {}, label, hint ? h("small", {}, hint) : null), input);
  row.input = input;
  return row;
}

// ---------- A menu or a card that opens next to a button ----------
// build(close) returns the content. Opens above or below the anchor, whichever has room, stays inside the window,
// closes on Esc or a click elsewhere, and gives focus back.
export function popover(anchor, build, { label = "", cls = "", placement = "auto", align = "center", role = "dialog" } = {}) {
  document.querySelectorAll(".wb-pop").forEach((p) => p.remove());
  const box = h("div", { class: `wb-pop${anchor.closest("#voice-mode") ? " wb-pop-dark" : ""} ${cls}`.trim(), role, "aria-label": label || undefined });
  const close = (returnFocus = true) => {
    box.remove();
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", onKey, true);
    anchor.setAttribute("aria-expanded", "false");
    if (returnFocus) anchor.focus?.({ preventScroll: true });
  };
  const outside = (e) => {
    if (!box.contains(e.target) && !anchor.contains(e.target)) close(false);
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };
  box.append(build(close));
  document.body.append(box);
  anchor.setAttribute("aria-expanded", "true");
  const a = anchor.getBoundingClientRect();
  const r = box.getBoundingClientRect();
  const below = placement === "below" || (placement === "auto" && a.top < r.height + 16);
  const top = below ? a.bottom + 8 : a.top - r.height - 8;
  let left = align === "start" ? a.left : align === "end" ? a.right - r.width : a.left + a.width / 2 - r.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - r.width - 8));
  box.style.left = `${left}px`;
  box.style.top = `${Math.max(8, Math.min(top, window.innerHeight - r.height - 8))}px`;
  box.querySelector("button, input, select, [tabindex]")?.focus({ preventScroll: true });
  setTimeout(() => {
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", onKey, true);
  });
  return { close, el: box };
}

// A list of choices in a popover. entries: [{ label, hint, icon, current, fn, danger }]
export function menu(anchor, entries, opts = {}) {
  return popover(
    anchor,
    (close) => {
      const list = h("div", { class: "wb-menu-list", role: "menu" });
      for (const e of entries) {
        if (e.separator) {
          list.append(h("div", { class: "fw-menu-sep", role: "separator" }));
          continue;
        }
        list.append(h("button", { type: "button", role: e.current !== undefined ? "menuitemradio" : "menuitem", "aria-checked": e.current !== undefined ? String(Boolean(e.current)) : undefined, class: `wb-menu-item${e.danger ? " danger" : ""}${e.current ? " current" : ""}`, onclick: () => (close(false), e.fn()) },
          e.icon ? h("span", { class: "wb-menu-icon", html: wbIcon(e.icon, 16) }) : null,
          h("span", { class: "wb-menu-text" }, h("span", {}, e.label), e.hint ? h("small", {}, e.hint) : null)));
      }
      list.addEventListener("keydown", (ev) => {
        const items = [...list.querySelectorAll("button")];
        const i = items.indexOf(document.activeElement);
        if (ev.key === "ArrowDown") items[(i + 1) % items.length]?.focus();
        else if (ev.key === "ArrowUp") items[(i - 1 + items.length) % items.length]?.focus();
        else return;
        ev.preventDefault();
      });
      return list;
    },
    { role: "menu", ...opts }
  );
}

// A right-click menu at a point
export function contextMenu(x, y, entries) {
  document.querySelector(".wb-context")?.remove();
  const box = h("div", { class: "wb-context", role: "menu" });
  for (const e of entries) {
    if (e.separator) box.append(h("div", { class: "fw-menu-sep", role: "separator" }));
    else box.append(h("button", { type: "button", role: "menuitem", class: `wb-menu-item${e.danger ? " danger" : ""}`, onclick: () => (box.remove(), e.fn()) }, e.icon ? h("span", { class: "wb-menu-icon", html: wbIcon(e.icon, 16) }) : null, h("span", { class: "wb-menu-text" }, e.label)));
  }
  document.body.append(box);
  const r = box.getBoundingClientRect();
  box.style.left = `${Math.max(4, Math.min(x, window.innerWidth - r.width - 8))}px`;
  box.style.top = `${Math.max(4, Math.min(y, window.innerHeight - r.height - 8))}px`;
  box.querySelector("button")?.focus();
  const close = (e) => {
    if (e.type === "keydown" && e.key !== "Escape") return;
    if (e.type === "pointerdown" && box.contains(e.target)) return;
    box.remove();
    document.removeEventListener("pointerdown", close, true);
    document.removeEventListener("keydown", close, true);
  };
  setTimeout(() => {
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close, true);
  });
}

export const ago = (ms) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return t("just now");
  if (s < 3600) return t("{n} min ago", { n: Math.round(s / 60) });
  if (s < 86400) return t("{n} h ago", { n: Math.round(s / 3600) });
  return new Date(ms).toLocaleDateString();
};
