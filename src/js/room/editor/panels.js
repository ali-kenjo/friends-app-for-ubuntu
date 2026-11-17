// ---------- The Room Editor's panels: catalog, outline, inspector, room settings, new room ----------
// Built from the Robot Studio's controls (robot/studio/ui.js) and h(); every word goes through t().
import { t, tp } from "../../i18n.js";
import { getSettings, updateSettings } from "../../store.js";
import { h, section, tiles, slider, swatches, toggle, textField, button, hint, arrowKeys, glyph } from "../../robot/studio/ui.js";
import { CATALOG, CATALOG_BY_ID, CATEGORIES } from "../catalog.mjs";
import * as C from "../choices.mjs";
import { TEMPLATES } from "../templates.mjs";
import { defaultRules, displayName, worldTransform, newId } from "../model.mjs";
import * as ops from "./ops.mjs";
import { resolveShot, shotPresets } from "../cameras.mjs";
import { thumbFor } from "./thumbs.js";

const PALETTE = ["#f4efe6", "#ede4d6", "#d9c29c", "#c89b6e", "#b07a4a", "#8a5a33", "#5a3d2b", "#2d3038", "#c47a5a", "#e05a47", "#f2c14e", "#4d8a62", "#5b8fa8", "#6f9cf5", "#7c66dc", "#c98bb8"];
// Made when shown (the words are in the interface language)
const stateLabels = () => ({
  on: t("Switched on"),
  curtains: t("Curtains drawn"),
  open: t("Open"),
  steam: t("Steam"),
  asleep: t("Asleep"),
  down: t("Screen down"),
  mirror: t("Show my whiteboard on it (your own things)"),
  showNotes: t("Show my notes (your own things)"),
  showPhotos: t("Show my photos (your own things)"),
  showEvents: t("Show my calendar (your own things)"),
  showInbox: t("Show my inbox (your own things)"),
});
const boardStyles = () => [["classic", t("Classic")], ["glass", t("Glass")], ["chalk", t("Chalkboard")], ["cork", t("Cork")], ["dark", t("Dark")], ["paper", t("Paper roll")], ["neon", t("Neon")]];
const cm = (m) => Math.round(m * 100);

const editorPrefs = () => getSettings()?.robot?.editor || {};
const setEditorPref = (key, value) => updateSettings((s) => (s.robot.editor = { ...(s.robot.editor || {}), [key]: value }));

// ---------- Catalog ----------
export function catalogPanel(ed) {
  const el = h("div", { class: "re-catalog" });
  const search = h("input", { type: "search", class: "field re-search", placeholder: t("Search things"), "aria-label": t("Search things") });
  const cats = h("div", { class: "re-cats", role: "radiogroup", "aria-label": t("Categories") });
  const grid = h("div", { class: "re-grid", role: "list", "aria-label": t("Things you can place") });
  const note = h("p", { class: "rs-hint re-cat-note" });
  let category = "all";
  const seenThumbs = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const img = e.target;
      seenThumbs.unobserve(img);
      thumbFor(img.dataset.id, (url) => {
        img.src = url;
        img.classList.add("ready");
      });
    }
  }, { root: grid, rootMargin: "120px" });
  const chips = [["all", t("All")], ["favourites", t("Favourites")], ["recent", t("Recently used")], ["sets", t("My sets")], ...CATEGORIES.map((c) => [c.id, t(c.label)])];
  for (const [id, label] of chips) {
    const b = h("button", { type: "button", class: "re-chip", role: "radio", "aria-checked": String(id === "all"), "data-cat": id, text: label });
    b.addEventListener("click", () => {
      category = id;
      for (const x of cats.children) x.setAttribute("aria-checked", String(x.dataset.cat === id));
      render();
    });
    cats.append(b);
  }
  arrowKeys(cats, 'button[role="radio"]');
  search.addEventListener("input", () => render());

  // Search in the language shown and in English, over names and search words
  const matches = (a, q) => {
    if (!q) return true;
    const words = [a.label, t(a.label), t(CATEGORIES.find((c) => c.id === a.category)?.label || ""), ...a.tags, ...a.tags.map((x) => t(x))].join(" ").toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => words.includes(w));
  };

  const tile = (a) => {
    const fav = (editorPrefs().favourites || []).includes(a.id);
    const slots = a.slots.map((s) => t(C.SLOTS.find((x) => x.id === s)?.label || s)).join(", ");
    const badges = [];
    if (a.actions.some((x) => !["look", "go", "point"].includes(x))) badges.push(h("span", { class: "re-badge", text: t("Interactive") }));
    if (a.personalData) badges.push(h("span", { class: "re-badge personal", text: t("Your own things") }));
    const img = h("img", { class: "re-thumb", alt: "", "data-id": a.id, width: 96, height: 96, draggable: false });
    seenThumbs.observe(img);
    const b = h("button", { type: "button", class: "re-item", title: t("{name}: {w} × {d} × {h} cm · goes on: {slots}", { name: t(a.label), w: cm(a.footprint.w), d: cm(a.footprint.d), h: cm(a.height), slots }) }, img, h("span", { class: "re-item-name", text: t(a.label) }), h("span", { class: "re-item-slots", text: slots }), ...badges);
    b.addEventListener("click", () => {
      if (b.dataset.dragged) return void delete b.dataset.dragged;
      ed.vp.placeNearCentre(a.id);
      remember(a.id);
    });
    // Dragging a tile into the room: a ghost follows the pointer until it's dropped. The browser's own
    // drag of the picture is stopped, or it would take the pointer away after the first move.
    b.addEventListener("dragstart", (e) => e.preventDefault());
    b.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let dragging = false;
      const move = (ev) => {
        if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) {
          dragging = true;
          b.dataset.dragged = "1";
          ed.vp.startPlacing(a.id, { stamp: ev.shiftKey });
        }
        if (!dragging) return;
        const r = ed.stage.getBoundingClientRect();
        const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        if (inside) ed.vp.updateGhost(ev);
        else if (ed.vp.ghost) ed.vp.ghost.group.visible = false;
      };
      const stop = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        document.removeEventListener("pointercancel", cancel);
      };
      // A touch that turns into scrolling the catalog
      const cancel = () => {
        stop();
        if (dragging) ed.vp.cancelPlacing();
      };
      const up = (ev) => {
        stop();
        if (!dragging) return;
        const r = ed.stage.getBoundingClientRect();
        const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        if (inside && ed.vp.dropGhost(ev)) remember(a.id);
        else if (!ev.shiftKey) ed.vp.cancelPlacing();
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
      document.addEventListener("pointercancel", cancel);
    });
    const star = h("button", { type: "button", class: `re-fav${fav ? " on" : ""}`, "aria-pressed": String(fav), "aria-label": t("Favourite: {name}", { name: t(a.label) }), text: fav ? "★" : "☆" });
    star.addEventListener("click", () => {
      const list = new Set(editorPrefs().favourites || []);
      if (list.has(a.id)) list.delete(a.id);
      else list.add(a.id);
      setEditorPref("favourites", [...list]);
      star.classList.toggle("on");
      star.setAttribute("aria-pressed", String(list.has(a.id)));
      star.textContent = list.has(a.id) ? "★" : "☆";
    });
    return h("div", { class: "re-cell", role: "listitem" }, b, star);
  };

  const remember = (id) => {
    const recent = [id, ...(editorPrefs().recent || []).filter((x) => x !== id)].slice(0, 16);
    setEditorPref("recent", recent);
  };

  const setTile = (set) => {
    const b = button(set.name, () => {
      const r = ops.paste(ed.room, set.clip, [0, 0, 0.5]);
      ed.commit(r.room, t("Add {name}", { name: set.name }));
      ed.select(r.ids);
    }, { icon: "cube" });
    const del = button(t("Remove"), () => setEditorPref("sets", (editorPrefs().sets || []).filter((s) => s.id !== set.id)).then(render), { title: t("Remove the set {name}", { name: set.name }) });
    return h("div", { class: "re-set", role: "listitem" }, b, del);
  };

  function render() {
    const q = search.value.trim();
    grid.replaceChildren();
    note.textContent = "";
    if (category === "sets") {
      const sets = editorPrefs().sets || [];
      for (const s of sets) grid.append(setTile(s));
      if (!sets.length) note.textContent = t("Select a few things in the room and use “Save as a set” to keep them here.");
      return;
    }
    let list = CATALOG.filter((a) => !a.pending && matches(a, q));
    if (category === "favourites") list = list.filter((a) => (editorPrefs().favourites || []).includes(a.id));
    else if (category === "recent") list = (editorPrefs().recent || []).map((id) => CATALOG_BY_ID[id]).filter((a) => a && matches(a, q));
    else if (category !== "all") list = list.filter((a) => a.category === category);
    for (const a of list) grid.append(tile(a));
    if (!list.length) note.textContent = category === "favourites" ? t("Star things to find them here.") : t("Nothing matches.");
  }

  el.append(search, cats, note, grid);
  render();
  return { el, render };
}

// ---------- Outline: everything in the room, as a tree ----------
export function outlinePanel(ed) {
  const el = h("div", { class: "re-outline" });
  const tree = h("ul", { class: "re-tree", role: "tree", "aria-label": t("Everything in the room") });
  el.append(hint(t("Enter selects, F2 renames, H hides, L locks; the arrows move between rows.")), tree);
  tree.addEventListener("keydown", (e) => {
    const rows = [...tree.querySelectorAll('[role="treeitem"]')];
    const at = rows.indexOf(document.activeElement);
    if (at < 0) return;
    const id = rows[at].dataset.id;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      rows[Math.max(0, Math.min(rows.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)))].focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (id) ed.select(e.shiftKey ? [...ed.selected, id] : [id]);
    } else if (e.key === "F2" && id) {
      e.preventDefault();
      rename(id);
    } else if ((e.key === "h" || e.key === "l") && id) {
      e.preventDefault();
      e.stopPropagation();
      const key = e.key === "h" ? "hidden" : "locked";
      ed.commit(ops.updateAsset(ed.room, id, { [key]: !ed.room.assets.find((a) => a.id === id)[key] }), key === "hidden" ? t("Hide") : t("Lock"));
      tree.querySelector(`[data-id="${CSS.escape(id)}"]`)?.focus();
    }
  });

  const rename = (id) => {
    const a = ed.room.assets.find((x) => x.id === id);
    const row = tree.querySelector(`[data-id="${CSS.escape(id)}"] .re-row-name`);
    if (!a || !row) return;
    const input = h("input", { class: "field re-rename", type: "text", maxlength: 60, value: a.name || t(ops.defOf(a)?.label || ""), "aria-label": t("New name") });
    const done = (keep) => {
      if (keep) ed.commit(ops.updateAsset(ed.room, id, { name: input.value.trim().slice(0, 60) }), t("Rename"));
      else refresh();
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") done(true);
      if (e.key === "Escape") done(false);
    });
    input.addEventListener("blur", () => done(true));
    row.replaceWith(input);
    input.focus();
    input.select();
  };

  const row = (a, depth) => {
    const sel = ed.selected.includes(a.id);
    const name = a.name || t(ops.defOf(a)?.label || a.type);
    const li = h("li", { role: "treeitem", tabindex: "-1", "aria-selected": String(sel), "aria-level": String(depth + 1), class: `re-row${sel ? " on" : ""}${a.hidden ? " hidden-thing" : ""}`, "data-id": a.id, style: `--depth:${depth}` });
    const nameBtn = h("span", { class: "re-row-name", text: name });
    li.addEventListener("click", (e) => ed.select(e.shiftKey ? [...ed.selected, a.id] : [a.id]));
    li.addEventListener("dblclick", () => rename(a.id));
    const eye = h("button", { type: "button", class: "re-row-btn", "aria-pressed": String(a.hidden), "aria-label": a.hidden ? t("Show {name}", { name }) : t("Hide {name}", { name }), text: a.hidden ? "◌" : "●", tabindex: "-1" });
    eye.addEventListener("click", (e) => {
      e.stopPropagation();
      ed.commit(ops.updateAsset(ed.room, a.id, { hidden: !a.hidden }), t("Hide"));
    });
    const lock = h("button", { type: "button", class: "re-row-btn", "aria-pressed": String(a.locked), "aria-label": a.locked ? t("Unlock {name}", { name }) : t("Lock {name}", { name }), text: a.locked ? "🔒" : "🔓", tabindex: "-1" });
    lock.addEventListener("click", (e) => {
      e.stopPropagation();
      ed.commit(ops.updateAsset(ed.room, a.id, { locked: !a.locked }), t("Lock"));
    });
    const up = h("button", { type: "button", class: "re-row-btn", "aria-label": t("Move {name} up the list", { name }), text: "↑", tabindex: "-1" });
    up.addEventListener("click", (e) => {
      e.stopPropagation();
      const list = [...ed.room.assets];
      const i = list.findIndex((x) => x.id === a.id);
      if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
      ed.commit({ ...ed.room, assets: list }, t("Reorder"));
    });
    li.append(nameBtn, h("span", { class: "re-row-tools" }, up, eye, lock));
    return li;
  };

  function refresh() {
    const focusedId = document.activeElement?.closest?.(".re-tree [data-id]")?.dataset.id;
    tree.replaceChildren();
    const robotRow = h("li", { role: "treeitem", tabindex: "0", class: "re-row robot", "aria-level": "1" }, h("span", { class: "re-row-name", text: t("The robot (its home)") }));
    tree.append(robotRow);
    const add = (parent, depth) => {
      for (const a of ed.room.assets.filter((x) => (x.parent || null) === parent)) {
        tree.append(row(a, depth));
        add(a.id, depth + 1);
      }
    };
    add(null, 0);
    if (focusedId) tree.querySelector(`[data-id="${CSS.escape(focusedId)}"]`)?.focus();
  }

  return { el, refresh };
}

// ---------- Inspector ----------
export function inspectorPanel(ed) {
  const el = h("div", { class: "re-inspector" });
  let tab = "look";
  let shownFor = "";

  const commit = (fn, label) => {
    const id = ed.selected[0];
    ed.commit(ops.updateAsset(ed.room, id, fn(ed.room.assets.find((a) => a.id === id))), label);
  };

  const FOCUSABLE = "button, input, select, textarea, [tabindex]";
  function refresh() {
    const key = `${ed.selected.join(",")}|${tab}`;
    const focused = el.contains(document.activeElement) ? document.activeElement : null;
    // Don't rebuild under the user's hands while they drag a slider or type in a field
    if (focused && key === shownFor && (focused.tagName === "INPUT" || focused.tagName === "SELECT")) return update();
    const same = key === shownFor;
    const at = focused ? [...el.querySelectorAll(FOCUSABLE)].indexOf(focused) : -1;
    const scroll = el.scrollTop;
    shownFor = key;
    build();
    // The same panel again (a change was made from it): focus and scroll stay where they were
    if (same) {
      el.scrollTop = scroll;
      if (at >= 0) (el.querySelectorAll(FOCUSABLE)[at] || el.querySelector(FOCUSABLE))?.focus({ preventScroll: true });
    } else if (focused) el.querySelector(FOCUSABLE)?.focus({ preventScroll: true });
  }

  function build() {
    el.replaceChildren();
    if (!ed.selected.length) return el.append(...roomPanel(ed));
    if (ed.selected.length > 1) return el.append(...manyPanel(ed));
    const a = ed.room.assets.find((x) => x.id === ed.selected[0]);
    const def = ops.defOf(a);
    const tabs = h("div", { class: "re-tabs", role: "tablist", "aria-label": t("Inspector") });
    for (const [id, label] of [["look", t("Look")], ["place", t("Placement")], ["rules", t("Robot rules")], ["advanced", t("Advanced")]]) {
      const b = h("button", { type: "button", role: "tab", class: "re-tab", "aria-selected": String(tab === id), tabindex: tab === id ? "0" : "-1", text: label });
      b.addEventListener("click", () => {
        tab = id;
        refresh();
        el.querySelector('.re-tab[aria-selected="true"]')?.focus();
      });
      tabs.append(b);
    }
    arrowKeys(tabs, '[role="tab"]');
    el.append(h("h2", { class: "re-title", text: a.name || t(def.label) }), tabs);
    const body = { look: lookTab, place: placeTab, rules: rulesTab, advanced: advancedTab }[tab](ed, a, def, commit);
    el.append(...body);
  }

  // Small updates (a drag moved the thing): the number fields follow without a rebuild
  function update() {
    const a = ed.room.assets.find((x) => x.id === ed.selected[0]);
    if (!a) return;
    for (const input of el.querySelectorAll("[data-axis]")) if (document.activeElement !== input) input.value = String(cm(a.pos[Number(input.dataset.axis)]));
  }

  return { el, refresh };
}

function numberRow(label, value, onChange, { min = -9999, max = 9999, step = 1, suffix = "", axis = null } = {}) {
  const id = `re-n-${Math.random().toString(36).slice(2, 8)}`;
  const input = h("input", { id, type: "number", class: "field re-num", value: String(value), min, max, step, ...(axis !== null ? { "data-axis": String(axis) } : {}) });
  input.addEventListener("change", () => {
    const n = Number(input.value);
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
  });
  return h("div", { class: "re-num-row" }, h("label", { for: id, text: label }), input, suffix ? h("span", { class: "re-unit", text: suffix }) : null);
}

function lookTab(ed, a, def, commit) {
  const out = [];
  const colors = def.colors.map((c) => swatches({ label: t(c.label), colors: PALETTE, value: a.colors?.[c.key] || c.def, onChange: (v) => commit((x) => ({ colors: { ...x.colors, [c.key]: v } }), t("Color")) }).el);
  if (colors.length) out.push(section(t("Colors"), ...colors, h("div", { class: "rs-actions" }, button(t("Back to its own colors"), () => commit(() => ({ colors: {} }), t("Color")), { icon: "undo" }))));
  out.push(section(t("Size"), tiles({ label: null, name: t("Size"), items: C.VARIANTS, value: a.variant, compact: true, columns: 3, onChange: (v) => commit(() => ({ variant: v }), t("Size")) }).el));
  const states = [];
  for (const [k, v] of Object.entries(def.states || {})) {
    if (typeof v === "boolean") states.push(toggle({ label: stateLabels()[k] || k, value: a.state?.[k] ?? v, onChange: (on) => commit((x) => ({ state: { ...x.state, [k]: on } }), t("Switch")) }).el);
    else if (k === "text") states.push(textField({ label: t("Words on the sign"), max: 16, value: a.state?.text ?? v, onChange: (val) => commit((x) => ({ state: { ...x.state, text: val } }), t("Sign")) }).el);
    else if (k === "style") states.push(tiles({ label: t("Style"), items: boardStyles().map(([id, label]) => ({ id, label })), value: a.state?.style ?? v, compact: true, columns: 4, onChange: (s) => commit((x) => ({ state: { ...x.state, style: s } }), t("Style")) }).el);
  }
  if (states.length) out.push(section(t("How it is"), ...states));
  if (def.light) {
    const l = a.light || { intensity: 1, color: null, auto: "manual" };
    const setLight = (patch, label = t("Light")) => commit((x) => ({ light: { ...(x.light || l), ...patch } }), label);
    out.push(section(
      t("Light"),
      slider({ label: t("Brightness"), min: 0, max: 2, step: 0.05, value: l.intensity, def: 1, onChange: (v) => ed.commit(ops.updateAsset(ed.room, a.id, { light: { ...(ed.room.assets.find((x) => x.id === a.id).light || l), intensity: v } }), t("Light"), { coalesce: `light-${a.id}` }) }).el,
      swatches({ label: t("Light color"), colors: ["#ffc98a", "#ffe2b8", "#fff4e0", "#dfe8ff", "#9fc6ff", "#c7a6ff", "#ff9fb2", "#9fe8c0"], value: l.color || "", empty: { label: t("Its own"), title: t("The lamp's usual color") }, onChange: (v) => setLight({ color: v || null }) }).el,
      toggle({ label: t("Switch on by itself when it gets dark"), value: l.auto === "dusk", onChange: (on) => setLight({ auto: on ? "dusk" : "manual" }) }).el,
      l.auto === "dusk" ? hint(t("It follows the room's time and mood; a scene can still switch it.")) : null,
    ));
  }
  if (def.personalData) out.push(hint(t("This shows your own things only when you switch it on. It stays hidden while filming unless you allow it in Settings → Robot → Privacy, and it follows Private mode.")));
  return out;
}

function placeTab(ed, a, def, commit) {
  const rel = a.parent ? t("on the {name}", { name: displayName(ed.room.assets.find((x) => x.id === a.parent)) }) : t("in the room");
  const pos = (i) => (v) => commit((x) => {
    const p = [...x.pos];
    p[i] = v / 100;
    return { pos: p };
  }, t("Move"));
  const out = [
    section(t("Where"), hint(t("Measured {rel}, in centimetres.", { rel })), numberRow(t("Across (X)"), cm(a.pos[0]), pos(0), { suffix: "cm", axis: 0 }), numberRow(t("Height (Y)"), cm(a.pos[1]), pos(1), { min: 0, suffix: "cm", axis: 1 }), numberRow(t("Depth (Z)"), cm(a.pos[2]), pos(2), { suffix: "cm", axis: 2 })),
    section(t("Turn and size"), numberRow(t("Turn"), Math.round(a.rot), (v) => commit(() => ({ rot: v }), t("Turn")), { min: -180, max: 180, suffix: "°" }), slider({ label: t("Size"), min: def.scale[0], max: def.scale[1], step: 0.01, value: a.scale, def: 1, onChange: (v) => ed.commit(ops.scaleTo(ed.room, a.id, v), t("Size"), { coalesce: `size-${a.id}` }) }).el),
  ];
  const moves = [];
  if (a.slot !== "floor" && def.slots.includes("floor")) moves.push(button(t("Send to the floor"), () => {
    const tr = worldTransform(ed.room, a);
    const spot = ops.firstFreeSpot(ed.room, a.type, [tr.x, tr.z], { exclude: [a.id] });
    ed.commit(ops.placeAt(ed.room, a.id, [spot[0], 0, spot[1]], { slot: "floor" }), t("Move"));
  }));
  if (def.slots.includes("surface") && !a.parent) {
    const hosts = ed.room.assets.filter((x) => x.id !== a.id && !x.parent && ops.defOf(x)?.surfaces?.length && !ops.descendants(ed.room, a.id).includes(x.id));
    if (hosts.length) {
      const s = h("select", { class: "field", "aria-label": t("Put it on") }, h("option", { value: "", text: t("Put it on…") }), ...hosts.map((x) => h("option", { value: x.id, text: displayName(x) })));
      s.addEventListener("change", () => {
        if (!s.value) return;
        const host = ed.room.assets.find((x) => x.id === s.value);
        ed.commit({ ...ops.updateAsset(ed.room, a.id, { parent: host.id, surface: ops.defOf(host).surfaces[0].id, slot: "surface", pos: [0, 0, 0] }) }, t("Move"));
      });
      moves.push(s);
    }
  }
  const same = CATALOG.filter((x) => x.category === def.category && x.id !== a.type && !x.pending);
  if (same.length) {
    const s = h("select", { class: "field", "aria-label": t("Replace with") }, h("option", { value: "", text: t("Replace with…") }), ...same.map((x) => h("option", { value: x.id, text: t(x.label) })));
    s.addEventListener("change", () => s.value && ed.commit(ops.replaceWith(ed.room, a.id, s.value), t("Replace")));
    moves.push(s);
  }
  moves.push(button(t("Copy its look"), () => {
    ed.lookFrom = a.id;
    ed.say(t("Look copied. Select other things and use “Paste look”."));
  }, { icon: "copy" }));
  if (ed.lookFrom && ed.lookFrom !== a.id) moves.push(button(t("Paste look"), () => ed.commit(ops.copyLook(ed.room, ed.lookFrom, [a.id]), t("Paste look")), { icon: "palette" }));
  out.push(section(t("More"), h("div", { class: "rs-actions re-wrap" }, ...moves)));
  return out;
}

function rulesTab(ed, a, def, commit) {
  const r = { ...defaultRules(def), ...(a.rules || {}) };
  const set = (patch, label = t("Rule")) => commit((x) => ({ rules: { ...defaultRules(def), ...(x.rules || {}), ...patch } }), label);
  const actions = (r.actions || def.actions).slice();
  const actionToggles = def.actions.map((act) => toggle({ label: t(C.ACTIONS.find((x) => x.id === act)?.label || act), value: actions.includes(act), onChange: (on) => set({ actions: on ? [...new Set([...actions, act])] : actions.filter((x) => x !== act) }) }).el);
  const times = C.TIMES_OF_DAY.map((tt) => toggle({ label: t(tt.label), value: r.times.includes(tt.id), onChange: (on) => set({ times: on ? [...r.times, tt.id] : r.times.filter((x) => x !== tt.id) }) }).el);
  const bulk = button(t("Use these rules for every {category} thing", { category: t(CATEGORIES.find((c) => c.id === def.category)?.label || "") }), () => {
    const ids = ed.room.assets.filter((x) => ops.defOf(x)?.category === def.category).map((x) => x.id);
    ed.commit(ops.updateMany(ed.room, ids, (x) => ({ rules: { ...defaultRules(ops.defOf(x)), permission: r.permission, weight: r.weight, cooldown: r.cooldown, maxPerHour: r.maxPerHour, keepDistance: r.keepDistance } })), t("Rules"));
  });
  return [
    section(t("What the robot may do with it"), tiles({ label: null, name: t("Permission"), items: C.PERMISSIONS, value: r.permission, columns: 2, onChange: (v) => set({ permission: v }) }).el),
    section(t("Allowed actions"), ...actionToggles),
    section(t("Visiting on its own"), slider({ label: t("How much it likes it"), min: 0, max: 100, step: 1, value: r.weight, def: 50, format: (v) => `${Math.round(v)}`, onChange: (v) => set({ weight: v }) }).el, slider({ label: t("Wait before the next visit"), min: 0, max: 600, step: 5, value: r.cooldown, def: 45, format: (v) => t("{n} s", { n: Math.round(v) }), onChange: (v) => set({ cooldown: v }) }).el, slider({ label: t("At most per hour"), min: 0, max: 60, step: 1, value: r.maxPerHour, def: 6, format: (v) => `${Math.round(v)}`, onChange: (v) => set({ maxPerHour: v }) }).el, slider({ label: t("Stays at least"), min: 0, max: 120, step: 1, value: r.dwell[0], def: 3, format: (v) => t("{n} s", { n: Math.round(v) }), onChange: (v) => set({ dwell: [v, Math.max(v, r.dwell[1])] }) }).el, slider({ label: t("Stays at most"), min: 0, max: 300, step: 1, value: r.dwell[1], def: 8, format: (v) => t("{n} s", { n: Math.round(v) }), onChange: (v) => set({ dwell: [Math.min(v, r.dwell[0]), v] }) }).el, slider({ label: t("Keeps its distance"), min: 0, max: 200, step: 5, value: r.keepDistance, def: 0, format: (v) => t("{n} cm", { n: Math.round(v) }), onChange: (v) => set({ keepDistance: v }) }).el, toggle({ label: t("Fragile: careful and slow, never carried"), value: r.fragile, onChange: (on) => set({ fragile: on }) }).el),
    section(t("When it likes to visit"), ...times, hint(t("None chosen: any time."))),
    h("div", { class: "rs-actions" }, bulk),
  ];
}

function advancedTab(ed, a, def, commit) {
  const sch = a.schedule || { seasons: [], months: [], from: "", to: "", weekdays: [], scenes: [] };
  const setSch = (patch) => commit((x) => ({ schedule: { ...(x.schedule || sch), ...patch } }), t("Schedule"));
  const timeInput = (label, key) => {
    const id = `re-t-${key}`;
    const input = h("input", { id, type: "time", class: "field", value: sch[key] || "" });
    input.addEventListener("change", () => setSch({ [key]: input.value }));
    return h("div", { class: "re-num-row" }, h("label", { for: id, text: label }), input);
  };
  return [
    section(t("Name"), textField({ label: t("Its name (the robot and the AI use it)"), max: 60, value: a.name, placeholder: t(def.label), onChange: (v) => commit(() => ({ name: v }), t("Rename")) }).el),
    section(t("Shown"), toggle({ label: t("Hidden"), value: a.hidden, onChange: (on) => commit(() => ({ hidden: on }), t("Hide")) }).el, toggle({ label: t("Locked (can't be moved by mistake)"), value: a.locked, onChange: (on) => commit(() => ({ locked: on }), t("Lock")) }).el),
    section(t("Only at some times"), hint(t("Leave everything empty and it's always there.")), ...C.SEASONS.filter((s) => !["none", "auto"].includes(s.id)).map((s) => toggle({ label: t(s.label), value: sch.seasons.includes(s.id), onChange: (on) => setSch({ seasons: on ? [...sch.seasons, s.id] : sch.seasons.filter((x) => x !== s.id) }) }).el), timeInput(t("From"), "from"), timeInput(t("Until"), "to"), h("div", { class: "re-weekdays" }, ...C.WEEKDAYS.map((d) => toggle({ label: t(d.label), value: sch.weekdays.includes(d.id), onChange: (on) => setSch({ weekdays: on ? [...sch.weekdays, d.id] : sch.weekdays.filter((x) => x !== d.id) }) }).el)), h("div", { class: "rs-actions" }, button(t("Always there"), () => commit(() => ({ schedule: null }), t("Schedule"))))),
    section(t("Remove"), h("div", { class: "rs-actions" }, button(t("Remove it"), () => ed.removeSelected(), { icon: "trash" }))),
  ];
}

function manyPanel(ed) {
  const ids = ed.selected;
  const save = button(t("Save as a set"), async () => {
    const clip = ops.copy(ed.room, ids);
    const name = tp("Set of {n} thing", "Set of {n} things", ids.length);
    const sets = [...(editorPrefs().sets || []), { id: newId("set", new Set((editorPrefs().sets || []).map((s) => s.id))), name, clip }].slice(-24);
    await setEditorPref("sets", sets);
    ed.catalog.render();
    ed.say(t("Saved in the catalog under My sets"));
  }, { icon: "save" });
  return [
    h("h2", { class: "re-title", text: tp("{n} thing selected", "{n} things selected", ids.length) }),
    section(t("Line them up"), h("div", { class: "rs-actions re-wrap" }, button(t("Align left"), () => ed.commit(ops.align(ed.room, ids, "left"), t("Align"))), button(t("Align centres"), () => ed.commit(ops.align(ed.room, ids, "center"), t("Align"))), button(t("Align right"), () => ed.commit(ops.align(ed.room, ids, "right"), t("Align"))), button(t("Even gaps"), () => ed.commit(ops.distribute(ed.room, ids), t("Distribute"))))),
    section(t("Together"), h("div", { class: "rs-actions re-wrap" }, button(t("Group them"), () => ed.commit(ops.group(ed.room, ids).room, t("Grouped"))), button(t("Ungroup"), () => ed.commit(ops.ungroup(ed.room, ids), t("Ungroup"))), save, ed.lookFrom ? button(t("Paste look"), () => ed.commit(ops.copyLook(ed.room, ed.lookFrom, ids), t("Paste look")), { icon: "palette" }) : null, button(t("Remove them"), () => ed.removeSelected(), { icon: "trash" }))),
  ];
}

// ---------- The room itself (nothing selected) ----------
function roomPanel(ed) {
  const room = ed.room;
  const arch = room.architecture;
  const atm = room.atmosphere;
  const setArch = (patch, label = t("Room")) => ed.commit({ ...ed.room, architecture: { ...ed.room.architecture, ...patch } }, label, { coalesce: `arch-${Object.keys(patch)[0]}` });
  const setAtm = (patch, label = t("Atmosphere")) => ed.commit({ ...ed.room, atmosphere: { ...ed.room.atmosphere, ...patch } }, label, { coalesce: `atm-${Object.keys(patch)[0]}` });
  const setSize = (k) => (v) => ed.commit({ ...ed.room, size: { ...ed.room.size, [k]: v } }, t("Room size"), { coalesce: `size-${k}` });
  const wallNames = { back: t("Back wall"), left: t("Left wall"), right: t("Right wall"), front: t("Front wall") };
  const wallToggles = ["back", "left", "right", "front"].map((side) => toggle({ label: wallNames[side], value: arch.walls[side], onChange: (on) => setArch({ walls: { ...ed.room.architecture.walls, [side]: on } }, t("Walls")) }).el);
  const accentSide = h("select", { class: "field", "aria-label": t("Accent wall") }, ...[["", t("No accent wall")], ["back", t("Back wall")], ["left", t("Left wall")], ["right", t("Right wall")]].map(([v, l]) => h("option", { value: v, text: l })));
  accentSide.value = arch.accentWall?.side || "";
  accentSide.addEventListener("change", () => setArch({ accentWall: accentSide.value ? { side: accentSide.value, material: arch.accentWall?.material || "painted", color: arch.accentWall?.color || arch.palette.detail } : null }, t("Accent wall")));
  const setCams = (cameras, extra = {}) => ed.commit({ ...ed.room, cameras, ...extra }, t("Camera shots"));
  const lookThrough = (c) => {
    const r = resolveShot(ed.room, c);
    if (!r) return;
    ed.vp.setView("perspective");
    ed.vp.orbit.target.set(...r.target);
    const d = Math.hypot(r.pos[0] - r.target[0], r.pos[1] - r.target[1], r.pos[2] - r.target[2]);
    ed.vp.orbit.dist = d;
    ed.vp.orbit.yaw = Math.atan2(r.pos[0] - r.target[0], r.pos[2] - r.target[2]);
    ed.vp.orbit.pitch = Math.asin((r.pos[1] - r.target[1]) / Math.max(0.01, d));
    ed.vp.updateCamera();
  };
  const cams = room.cameras.map((c) => {
    const usable = Boolean(resolveShot(room, c));
    const follow = h("select", { class: "field", "aria-label": t("How {name} moves", { name: c.name || t("Shot") }) }, ...C.CAMERA_FOLLOW.map((f) => h("option", { value: f.id, text: t(f.label) })));
    follow.value = c.follow;
    follow.addEventListener("change", () => setCams(ed.room.cameras.map((x) => (x.id === c.id ? { ...x, follow: follow.value } : x))));
    return h("div", { class: "re-cam" },
      h("span", { class: "re-cam-name", text: c.name || t("Shot") }),
      follow,
      button(t("Look through it"), () => lookThrough(c), { title: usable ? "" : t("Not available now") }),
      button(t("Remove"), () => setCams(ed.room.cameras.filter((x) => x.id !== c.id), ed.room.defaultCamera === c.id ? { defaultCamera: "auto" } : {})),
      usable ? null : hint(t("The thing it's measured from is hidden or gone, so it isn't used for now.")),
    );
  });
  const inVoice = h("select", { class: "field", "aria-label": t("In voice mode the camera") }, h("option", { value: "auto", text: t("Frames the robot (close, medium, wide)") }), ...room.cameras.map((c) => h("option", { value: c.id, text: c.name || t("Shot") })));
  inVoice.value = room.defaultCamera || "auto";
  inVoice.addEventListener("change", () => ed.commit({ ...ed.room, defaultCamera: inVoice.value }, t("Camera shots")));
  const presets = shotPresets(room, (k, v) => t(k, v));
  const addPreset = h("select", { class: "field", "aria-label": t("Add a ready-made shot") }, h("option", { value: "", text: t("Add a ready-made shot…") }), ...presets.map((p) => h("option", { value: p.key, text: p.name })));
  addPreset.addEventListener("change", () => {
    const p = presets.find((x) => x.key === addPreset.value);
    if (!p) return;
    const id = newId("shot", new Set(ed.room.cameras.map((c) => c.id)));
    const { key, ...shot } = p;
    void key;
    setCams([...ed.room.cameras, { id, ...shot }]);
    ed.say(t("Shot added: {name}", { name: p.name }));
  });
  const saveShot = button(t("Save this view as a shot"), () => {
    const v = ed.vp.editorView;
    const taken = new Set(ed.room.cameras.map((c) => c.id));
    const id = newId("shot", taken);
    ed.commit({ ...ed.room, cameras: [...ed.room.cameras, { id, name: t("Shot {n}", { n: ed.room.cameras.length + 1 }), pos: v.position.map((x) => Math.round(x * 1000) / 1000), target: v.target.map((x) => Math.round(x * 1000) / 1000), fov: v.fov, follow: "fixed", relative: null }] }, t("Camera shots"));
    ed.say(t("View saved as a shot"));
  }, { icon: "camera" });
  const keepSel = button(t("Keep the things I select"), () => ed.commit({ ...ed.room, backdrop: { ...ed.room.backdrop, keep: [...ed.selected] } }, t("Backdrop")));
  return [
    h("h2", { class: "re-title", text: t("The room") }),
    hint(t("Nothing is selected: these are the room's own settings. Click a thing to change it.")),
    section(t("Size"), slider({ label: t("Width"), min: 2, max: 14, step: 0.05, value: room.size.w, def: 5, format: (v) => t("{n} m", { n: v.toFixed(2) }), onChange: setSize("w") }).el, slider({ label: t("Depth"), min: 2, max: 12, step: 0.05, value: room.size.d, def: 4, format: (v) => t("{n} m", { n: v.toFixed(2) }), onChange: setSize("d") }).el, slider({ label: t("Height"), min: 2.2, max: 5, step: 0.05, value: room.size.h, def: 2.7, format: (v) => t("{n} m", { n: v.toFixed(2) }), onChange: setSize("h") }).el),
    section(t("Walls"), ...wallToggles, tiles({ label: t("Walls in front of the robot"), items: C.CUTAWAYS, value: arch.cutaway, compact: true, columns: 2, onChange: (v) => setArch({ cutaway: v }) }).el, tiles({ label: t("Wall finish"), items: C.WALL_MATERIALS, value: arch.wall.material, compact: true, columns: 3, onChange: (v) => setArch({ wall: { ...ed.room.architecture.wall, material: v, color: C.WALL_MATERIALS.find((m) => m.id === v).def } }) }).el, swatches({ label: t("Wall color"), colors: PALETTE, value: arch.wall.color, onChange: (v) => setArch({ wall: { ...ed.room.architecture.wall, color: v } }) }).el, toggle({ label: t("Skirting board"), value: arch.wall.trim, onChange: (on) => setArch({ wall: { ...ed.room.architecture.wall, trim: on } }) }).el, swatches({ label: t("Trim color"), colors: PALETTE, value: arch.wall.trimColor, onChange: (v) => setArch({ wall: { ...ed.room.architecture.wall, trimColor: v } }) }).el, h("div", { class: "rs-field" }, h("span", { class: "rs-label", text: t("Accent wall") }), accentSide), arch.accentWall ? swatches({ label: t("Accent color"), colors: PALETTE, value: arch.accentWall.color, onChange: (v) => setArch({ accentWall: { ...ed.room.architecture.accentWall, color: v } }) }).el : null, slider({ label: t("Wall thickness"), min: 0.05, max: 0.4, step: 0.01, value: arch.thickness, def: 0.12, format: (v) => t("{n} cm", { n: cm(v) }), onChange: (v) => setArch({ thickness: v }) }).el),
    section(t("Floor"), tiles({ label: null, name: t("Floor"), items: C.FLOOR_MATERIALS, value: arch.floor.material, compact: true, columns: 3, onChange: (v) => setArch({ floor: { material: v, color: C.FLOOR_MATERIALS.find((m) => m.id === v).def } }) }).el, swatches({ label: t("Floor color"), colors: PALETTE, value: arch.floor.color, onChange: (v) => setArch({ floor: { ...ed.room.architecture.floor, color: v } }) }).el),
    section(t("Ceiling"), tiles({ label: null, name: t("Ceiling"), items: C.CEILINGS, value: arch.ceiling.kind, compact: true, columns: 3, onChange: (v) => setArch({ ceiling: { ...ed.room.architecture.ceiling, kind: v } }) }).el),
    section(t("Outside"), tiles({ label: null, name: t("Outside"), items: C.OUTSIDES, value: arch.outside, compact: true, columns: 2, onChange: (v) => setArch({ outside: v }) }).el),
    section(t("Light and mood"), tiles({ label: null, name: t("Mood"), items: C.MOODS, value: atm.mood, compact: true, columns: 3, onChange: (v) => setAtm({ mood: v }) }).el, slider({ label: t("Brightness"), min: 0.5, max: 1.5, step: 0.01, value: atm.brightness, def: 1, onChange: (v) => setAtm({ brightness: v }) }).el, tiles({ label: t("Time of day"), items: C.TIME_MODES, value: atm.timeMode, compact: true, columns: 3, onChange: (v) => setAtm({ timeMode: v }) }).el, slider({ label: t("Hour"), min: 0, max: 24, step: 0.25, value: atm.timeHour, def: 14, format: (v) => `${String(Math.floor(v)).padStart(2, "0")}:${String(Math.round((v % 1) * 60)).padStart(2, "0")}`, onChange: (v) => setAtm({ timeHour: v }) }).el, toggle({ label: t("Tint with the robot's feelings"), value: atm.emotionTint, onChange: (on) => setAtm({ emotionTint: on }) }).el),
    section(t("In the air"), tiles({ label: null, name: t("In the air"), items: C.AIRS, value: atm.air, compact: true, columns: 3, onChange: (v) => setAtm({ air: v }) }).el, slider({ label: t("How much"), min: 0.3, max: 2, step: 0.01, value: atm.airAmount, def: 1, onChange: (v) => setAtm({ airAmount: v }) }).el, slider({ label: t("Wind"), min: 0, max: 1, step: 0.01, value: atm.wind, def: 0.3, onChange: (v) => setAtm({ wind: v }) }).el, tiles({ label: t("Season"), items: C.SEASONS, value: atm.season, compact: true, columns: 2, onChange: (v) => setAtm({ season: v }) }).el, toggle({ label: t("Follow the weather outside (when connected, not in Private mode)"), value: atm.weatherSync, onChange: (on) => setAtm({ weatherSync: on }) }).el),
    section(t("Light effects"), ...[["bokeh", "Soft lights"], ["shaft", "Beam of light"], ["rings", "Rings when it talks"], ["spot", "Spotlight"]].map(([k, l]) => toggle({ label: t(l), value: Boolean(atm.effects?.[k]), onChange: (on) => setAtm({ effects: { ...(ed.room.atmosphere.effects || {}), [k]: on } }) }).el)),
    section(t("What's drawn behind the robot"), tiles({ label: null, name: t("Backdrop"), items: C.BACKDROP_LAYERS, value: room.backdrop.layer, compact: true, columns: 2, onChange: (v) => ed.commit({ ...ed.room, backdrop: { ...ed.room.backdrop, layer: v } }, t("Backdrop")) }).el, room.backdrop.layer === "solid" ? swatches({ label: t("Backdrop color"), colors: PALETTE, value: room.backdrop.color, onChange: (v) => ed.commit({ ...ed.room, backdrop: { ...ed.room.backdrop, color: v } }, t("Backdrop")) }).el : null, room.backdrop.layer === "selected" ? h("div", {}, hint(tp("{n} thing stays; select others and press the button to change them.", "{n} things stay; select others and press the button to change them.", room.backdrop.keep.length)), keepSel) : null),
    section(t("Camera shots"), h("div", { class: "rs-field" }, h("span", { class: "rs-label", text: t("In voice mode the camera") }), inVoice), ...cams, addPreset, h("div", { class: "rs-actions" }, saveShot)),
  ];
}

// ---------- New room ----------
// Resolves to { template, name, size, walls } or { template } (for a template), or null
export function newRoomDialog({ current, tab = "empty" } = {}) {
  return new Promise((resolve) => {
    let size = "medium";
    let walls = "corner";
    let floor = "oak_planks";
    let wall = "plaster";
    const back = h("div", { class: "modal-backdrop re-new" });
    const box = h("div", { class: "modal re-new-box", role: "dialog", "aria-modal": "true", "aria-labelledby": "re-new-title" });
    const finish = (value) => {
      back.remove();
      resolve(value);
    };
    const empty = h("div", { class: "re-new-empty" },
      tiles({ label: t("Size"), items: C.SIZE_PRESETS.filter((s) => s.w).map((s) => ({ id: s.id, label: s.label, about: `${s.w} × ${s.d} m` })), value: size, columns: 3, onChange: (v) => (size = v) }).el,
      tiles({ label: t("Walls"), items: C.WALL_LAYOUTS, value: walls, compact: true, columns: 3, onChange: (v) => (walls = v) }).el,
      tiles({ label: t("Floor"), items: C.FLOOR_MATERIALS.filter((m) => !["none", "grid", "glossy", "cloud"].includes(m.id)), value: floor, compact: true, columns: 3, onChange: (v) => (floor = v) }).el,
      tiles({ label: t("Wall finish"), items: C.WALL_MATERIALS, value: wall, compact: true, columns: 3, onChange: (v) => (wall = v) }).el,
      h("div", { class: "rs-actions" }, button(t("Make the empty room"), async () => {
        finish({ template: "empty", size, walls, floor, wall, name: t("Empty room") });
      }, { primary: true })),
    );
    const temps = h("div", { class: "re-new-temps", role: "list" }, ...TEMPLATES.filter((x) => x.kind !== "empty").map((x) => {
      const b = button(t(x.label), () => finish({ template: x.id, name: t(x.label) }), { icon: x.icon, title: t(x.about) });
      return h("div", { role: "listitem" }, b);
    }));
    const dup = h("div", {}, hint(t("A copy of {name}, to change without losing the original.", { name: current?.name || "" })), button(t("Duplicate this room"), () => finish({ room: current, name: t("{name} (copy)", { name: current?.name || "" }) }), { primary: true }));
    const panes = { empty, template: temps, duplicate: dup };
    const tabs = h("div", { class: "re-tabs", role: "tablist", "aria-label": t("New room") });
    const show = (id) => {
      for (const [k, p] of Object.entries(panes)) p.hidden = k !== id;
      for (const b of tabs.children) b.setAttribute("aria-selected", String(b.dataset.tab === id));
    };
    for (const [id, label] of [["empty", t("Empty")], ["template", t("From a template")], ["duplicate", t("Duplicate")]]) {
      const b = h("button", { type: "button", role: "tab", class: "re-tab", "data-tab": id, text: label });
      b.addEventListener("click", () => show(id));
      tabs.append(b);
    }
    arrowKeys(tabs, '[role="tab"]');
    box.append(h("h2", { id: "re-new-title", text: t("New room") }), tabs, empty, temps, dup, h("div", { class: "rs-actions" }, button(t("Cancel"), () => finish(null))));
    box.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        finish(null);
      }
    });
    back.append(box);
    document.body.append(back);
    show(tab);
    box.querySelector('[role="tab"][aria-selected="true"]')?.focus();
  });
}

// ---------- Your rooms: pick one to edit (and to be the robot's room) ----------
// Resolves to a room id, or null
export function roomPickerDialog({ current } = {}) {
  return new Promise((resolve) => {
    const back = h("div", { class: "modal-backdrop re-new" });
    const box = h("div", { class: "modal re-new-box", role: "dialog", "aria-modal": "true", "aria-labelledby": "re-pick-title" });
    const list = h("div", { class: "re-rooms", role: "list", "aria-busy": "true" });
    const finish = (value) => {
      back.remove();
      resolve(value);
    };
    box.append(h("h2", { id: "re-pick-title", text: t("Your rooms") }), hint(t("The room you pick is the one the robot lives in.")), list, h("div", { class: "rs-actions" }, button(t("Cancel"), () => finish(null))));
    box.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        finish(null);
      }
    });
    back.append(box);
    document.body.append(back);
    fetch("/api/rooms")
      .then((r) => r.json())
      .then(({ rooms }) => {
        list.removeAttribute("aria-busy");
        for (const r of rooms) {
          const here = r.id === current;
          const pic = r.thumb ? h("img", { class: "re-room-pic", src: r.thumb, alt: "" }) : h("span", { class: "re-room-pic empty", "aria-hidden": "true" }, glyph("home", 28));
          const b = h("button", { type: "button", class: `re-room${here ? " on" : ""}`, "aria-current": here ? "true" : undefined }, pic, h("span", { class: "re-room-name", text: r.name }), h("span", { class: "re-room-meta", text: tp("{n} thing", "{n} things", r.assets) }));
          b.addEventListener("click", () => finish(here ? null : r.id));
          list.append(h("div", { role: "listitem" }, b));
        }
        list.querySelector(".re-room")?.focus();
      })
      .catch(() => {
        list.removeAttribute("aria-busy");
        list.append(h("p", { class: "rs-hint", text: t("The rooms couldn't be loaded.") }));
      });
  });
}
