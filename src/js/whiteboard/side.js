// ---------- The panels on the left of the board ----------
// Boards (your notebook of boards), Outline (everything on the page, found by what it says), Shapes (a library to
// pick from, with pictures) and Layouts (ready-made boards: planning, lessons, quizzes). They sit next to a rail of
// icons; one is open at a time.
import { h } from "../h.js";
import { t } from "../i18n.js";
import { announce } from "../a11y.js";
import { confirmDialog } from "../dialogs.js";
import { board } from "./store.js";
import { createItem, itemLabel, getBoundingBox, genId } from "./model.mjs";
import { renderPageTo } from "./render.mjs";
import { LIBRARY, makeEntry } from "./library.mjs";
import { TEMPLATE_NAMES, TEMPLATE_INFO, TEMPLATE_TITLES, TEMPLATE_EXAMPLES, buildTemplate } from "./templates.mjs";
import { findFreeSpot, offsetAdds } from "./arrange.mjs";
import { wbIcon } from "./wb-icons.js";
import { iconButton, menu, ago } from "./controls.js";
import { typeName } from "./inspector.js";

const debounce = (fn, ms = 250) => {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

const panelHead = (title, ...actions) => h("header", { class: "rw-side-head" }, h("h2", {}, title), h("span", { class: "fw-spacer" }), ...actions);
const searchBox = (placeholder, onInput) => {
  const input = h("input", { type: "search", class: "field rw-search", placeholder, "aria-label": placeholder, autocomplete: "off", spellcheck: "false" });
  input.addEventListener("input", () => onInput(input.value.trim().toLowerCase()));
  return input;
};
const titleOf = (b) => (b.title === "Main Whiteboard" ? t("Main Whiteboard") : b.title || t("Untitled Board"));

// ---------- Boards ----------
export function boardsPanel(ui) {
  const list = h("div", { class: "rw-list", role: "list" });
  let query = "";
  let cache = [];
  const search = searchBox(t("Find a board"), (q) => ((query = q), draw()));
  const make = async () => {
    const title = t("Untitled Board");
    await board.createBoard(title);
    announce(t("Opened {title}", { title }));
    ui.renamePrompt();
  };
  const links = h("div", { class: "rw-links" });
  const el = h("div", { class: "rw-side-panel" }, panelHead(t("Boards"), iconButton("plus", t("New board"), make, { cls: "small" })), search, list, links);

  function draw() {
    const shown = cache.filter((b) => !query || (b.title || "").toLowerCase().includes(query)).sort((a, b) => (b.id === board.doc?.id) - (a.id === board.doc?.id) || b.updatedAt - a.updatedAt);
    list.replaceChildren(
      ...(shown.length
        ? shown.map((b) => {
            const current = b.id === board.doc?.id;
            const more = iconButton("more", t("More for {title}", { title: titleOf(b) }), (e) => {
              e.stopPropagation();
              menu(more, [
                { icon: "text", label: t("Rename"), fn: () => rename(b) },
                { icon: "copy", label: t("Make a copy"), fn: async () => (await board.io.send("POST", `/api/whiteboards/${b.id}/duplicate`, {}), refresh()) },
                { separator: true },
                { icon: "trash", label: t("Delete"), danger: true, fn: () => remove(b) },
              ], { align: "end" });
            }, { cls: "small" });
            const row = h("div", { class: `rw-row${current ? " current" : ""}`, role: "listitem" },
              h("button", { type: "button", class: "rw-row-main", "aria-current": current ? "true" : undefined, onclick: async () => (await board.openBoard(b.id), announce(t("Opened {title}", { title: titleOf(b) }))) },
                h("span", { class: "rw-row-icon", html: wbIcon("boards", 18) }),
                h("span", { class: "rw-row-text" }, h("strong", { dir: "auto" }, titleOf(b)), h("small", {}, `${b.pageCount} ${t("pages")} · ${b.itemCount} ${t("items")} · ${ago(b.updatedAt)}`))),
              more);
            return row;
          })
        : [h("p", { class: "wb-empty" }, query ? t("No boards found.") : t("No boards yet."))])
    );
  }

  async function refresh() {
    try {
      cache = await board.boards();
    } catch {
      list.replaceChildren(h("p", { class: "wb-empty" }, t("Couldn't load the boards.")));
      return;
    }
    draw();
    drawLinks();
  }

  // The links this board makes, and the boards that link to it ([[Another board]] in a text)
  async function drawLinks() {
    if (!board.doc) return;
    let data = null;
    try {
      data = await board.io.get(`/api/whiteboards/${encodeURIComponent(board.doc.id)}/links`);
    } catch {}
    if (!data) return links.replaceChildren();
    const row = (label, hint, fn, icon = "link") => h("button", { type: "button", class: "rw-outline-item", onclick: fn }, h("span", { class: "rw-row-icon", html: wbIcon(icon, 16) }), h("span", { class: "rw-outline-label", dir: "auto" }, label), hint ? h("small", { class: "rw-link-hint" }, hint) : null);
    links.replaceChildren(
      h("section", { class: "rw-outline-group" },
        h("h3", {}, t("Links from this board"), h("span", { class: "rw-count" }, String(data.outgoing.length))),
        ...(data.outgoing.length ? data.outgoing.map((l) => (l.id ? row(l.title, l.count > 1 ? `×${l.count}` : "", () => board.openBoard(l.id)) : row(l.title, t("make it"), () => ui.openByTitle(l.title), "plus"))) : [h("p", { class: "wb-hint-text" }, t("Write [[Another board]] in a text (set to Markdown) to link to it."))])),
      h("section", { class: "rw-outline-group" },
        h("h3", {}, t("Linked from"), h("span", { class: "rw-count" }, String(data.incoming.length))),
        ...(data.incoming.length ? data.incoming.map((l) => row(titleOf(l), l.count > 1 ? `×${l.count}` : "", () => board.openBoard(l.id), "boards")) : [h("p", { class: "wb-hint-text" }, t("No other board links here yet."))]))
    );
  }

  async function rename(b) {
    const name = await ui.promptText({ title: t("Rename the board"), label: t("Board name"), value: titleOf(b), confirm: t("Rename") });
    if (!name || name === b.title) return;
    await board.io.send("PATCH", `/api/whiteboards/${b.id}`, { title: name });
    refresh();
  }

  async function remove(b) {
    if (!(await confirmDialog({ title: t("Delete this board?"), message: t("“{title}” and its earlier versions will be gone for good.", { title: titleOf(b) }), confirm: t("Delete"), danger: true }))) return;
    await board.io.send("DELETE", `/api/whiteboards/${b.id}`, {});
    refresh();
  }

  const later = debounce(refresh, 600);
  for (const ev of ["doc", "change"]) board.on(ev, () => el.isConnected && !el.closest("[hidden]") && later());
  return { el, refresh, focus: () => search.focus() };
}

// ---------- Outline ----------
const GROUPS = [
  ["Frames and headings", (it) => it.type === "frame" || (it.type === "text" && /^#{1,3}\s/.test(it.text || "")) || (it.type === "text" && (it.fontSize || 0) >= 34), "frame"],
  ["Notes", (it) => it.type === "sticky", "sticky"],
  ["Lists and tables", (it) => it.type === "checklist" || it.type === "table", "checklist"],
  ["Text", (it) => it.type === "text", "text"],
  ["Shapes and arrows", (it) => it.type === "shape", "shape"],
  ["Pictures and diagrams", (it) => it.type === "image" || it.type === "diagram", "image"],
  ["Drawings", (it) => it.type === "stroke", "pen"],
];

export function outlinePanel(ui) {
  const body = h("div", { class: "rw-list" });
  let query = "";
  let who = "all";
  const search = searchBox(t("Find something on this page"), (q) => ((query = q), draw()));
  const chips = h("div", { class: "rw-chips", role: "group", "aria-label": t("Who made it") },
    ...[["all", t("All")], ["user", t("Mine")], ["ai", t("The robot's")]].map(([id, label]) => h("button", { type: "button", class: "rw-chip", "aria-pressed": String(id === who), "data-who": id, onclick: () => ((who = id), [...chips.children].forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.who === who))), draw()) }, label)));
  const el = h("div", { class: "rw-side-panel" }, panelHead(t("Outline")), search, chips, body);

  function labelOf(it) {
    const s = itemLabel(it, 70);
    if (s) return s;
    if (it.type === "shape") return it.shapeType === "connector" ? t("Arrow") : t("Shape");
    return typeName(it);
  }

  function draw() {
    const items = (board.page?.items || []).filter((it) => (who === "all" || (who === "user" ? it.author === "user" : it.author !== "user")) && (!query || `${labelOf(it)} ${typeName(it)}`.toLowerCase().includes(query)));
    const used = new Set();
    const out = [];
    for (const [name, test, icon] of GROUPS) {
      const rows = items.filter((it) => !used.has(it.id) && test(it));
      rows.forEach((it) => used.add(it.id));
      if (!rows.length) continue;
      out.push(h("section", { class: "rw-outline-group" },
        h("h3", {}, t(name), h("span", { class: "rw-count" }, String(rows.length))),
        ...rows.map((it) => h("button", { type: "button", class: `rw-outline-item${ui.view?.selection.has(it.id) ? " current" : ""}`, onclick: () => ui.reveal(it.id) },
          h("span", { class: "rw-row-icon", html: wbIcon(icon, 16) }),
          h("span", { class: "rw-outline-label", dir: "auto" }, labelOf(it)),
          it.author !== "user" ? h("span", { class: "rw-badge", title: it.author === "mission" ? t("a mission") : t("the robot") }, it.author === "mission" ? "M" : "AI") : null))));
    }
    body.replaceChildren(...(out.length ? out : [h("p", { class: "wb-empty" }, board.page?.items?.length ? t("Nothing matches.") : t("Nothing on this page yet."))]));
  }

  const later = debounce(draw, 200);
  for (const ev of ["doc", "page", "change"]) board.on(ev, () => later());
  return { el, refresh: draw, focus: () => search.focus() };
}

// ---------- Shapes ----------
const previewCache = new Map();

// A small picture of a library entry, drawn by the board's own renderer
function preview(key, size = 64) {
  const dark = document.documentElement.dataset.theme !== "light";
  const id = `${key}|${dark}`;
  if (previewCache.has(id)) return previewCache.get(id);
  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(size * 1.4 * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size * 1.4}px`;
  canvas.style.height = `${size}px`;
  const items = makeEntry(key, 0, 0).map((it) => createItem({ ...it, id: genId(it.type) })).filter(Boolean);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const it of items) {
    const b = getBoundingBox(it);
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  const pad = 14;
  if (items.length && Number.isFinite(minX)) {
    renderPageTo(canvas, { items }, { region: { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 }, theme: dark ? "midnight" : "paper", pattern: "plain", background: false });
  }
  previewCache.set(id, canvas);
  return canvas;
}

export function shapesPanel(ui) {
  const body = h("div", { class: "rw-shapes" });
  let query = "";
  const search = searchBox(t("Find a shape"), (q) => ((query = q), draw()));
  const el = h("div", { class: "rw-side-panel" }, panelHead(t("Shapes")), h("p", { class: "wb-hint-text" }, t("Click a shape to add it, or drag it onto the board.")), search, body);
  const open = new Set(["basic", "flow"]);

  function tile(group, entry) {
    const key = `${group.id}:${entry.id}`;
    const b = h("button", { type: "button", class: "rw-tile", draggable: "true", title: t(entry.name), "aria-label": t(entry.name), onclick: () => ui.view?.addLibraryEntry(key), ondragstart: (e) => (e.dataTransfer.setData("application/x-friends-shape", key), (e.dataTransfer.effectAllowed = "copy")) });
    const slot = h("span", { class: "rw-tile-art" });
    b.append(slot, h("span", { class: "rw-tile-name" }, t(entry.name)));
    // Pictures are drawn when they come into view
    tileObserver.observe(b);
    b.draw = () => slot.replaceChildren(copyCanvas(preview(key)));
    return b;
  }

  function draw() {
    const groups = LIBRARY.map((g) => ({ g, entries: g.entries.filter((e) => !query || t(e.name).toLowerCase().includes(query) || t(g.name).toLowerCase().includes(query)) })).filter((x) => x.entries.length);
    body.replaceChildren(...groups.map(({ g, entries }) => {
      const expanded = query ? true : open.has(g.id);
      const section = h("section", { class: "rw-shape-group" });
      const toggle = h("button", { type: "button", class: "rw-shape-head", "aria-expanded": String(expanded), onclick: () => {
        if (open.has(g.id)) open.delete(g.id);
        else open.add(g.id);
        draw();
      } }, h("span", { html: wbIcon(expanded ? "chevronDown" : "chevronRight", 14) }), h("span", {}, t(g.name)), h("span", { class: "rw-count" }, String(entries.length)));
      section.append(toggle);
      if (expanded) section.append(h("div", { class: "rw-tiles" }, ...entries.map((e) => tile(g, e))));
      return section;
    }));
    if (!groups.length) body.replaceChildren(h("p", { class: "wb-empty" }, t("Nothing matches.")));
  }

  const tileObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      tileObserver.unobserve(e.target);
      e.target.draw?.();
    }
  }, { root: body, rootMargin: "120px" });
  new MutationObserver(() => {
    if (previewCache.size) previewCache.clear();
    if (el.isConnected && !el.closest("[hidden]")) draw();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  draw();
  return { el, refresh: draw, focus: () => search.focus() };
}

function copyCanvas(src) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.style.width = src.style.width;
  c.style.height = src.style.height;
  c.getContext("2d").drawImage(src, 0, 0);
  return c;
}

// ---------- Layouts ----------
const KINDS = [
  ["Planning", ["kanban", "weekly_plan", "timeline", "process", "eisenhower", "meeting_notes"]],
  ["Thinking", ["mind_map", "brainstorm", "swot", "pros_cons", "comparison", "venn", "retro"]],
  ["Learning", ["lesson_plan", "flashcards", "quiz", "glossary", "summary", "faq", "cornell_notes"]],
];

export function layoutsPanel(ui) {
  const body = h("div", { class: "rw-layouts" });
  const el = h("div", { class: "rw-side-panel" }, panelHead(t("Layouts")), h("p", { class: "wb-hint-text" }, t("Pick a layout, type your own words (or keep the example), and it is laid out for you. The robot can do the same when you ask.")), body);

  function showList() {
    body.replaceChildren(...KINDS.map(([name, ids]) => h("section", { class: "rw-layout-group" },
      h("h3", {}, t(name)),
      ...ids.filter((id) => TEMPLATE_NAMES.includes(id)).map((id) => h("button", { type: "button", class: "rw-layout-card", onclick: () => showForm(id) }, h("strong", {}, t(TEMPLATE_TITLES[id] || id)), h("span", {}, t(TEMPLATE_INFO[id])))))));
  }

  function showForm(name) {
    const title = h("input", { class: "field", type: "text", value: t(TEMPLATE_TITLES[name]), "aria-label": t("Title"), maxlength: "100" });
    const sections = h("textarea", { class: "field textarea", rows: "9", "aria-label": t("Words, one line per section"), spellcheck: "true" });
    sections.value = TEMPLATE_EXAMPLES[name] || "";
    body.replaceChildren(
      h("button", { type: "button", class: "rw-back", onclick: showList }, h("span", { html: wbIcon("chevronLeft", 14) }), t("All layouts")),
      h("h3", {}, t(TEMPLATE_TITLES[name] || name)),
      h("p", { class: "wb-hint-text" }, t(TEMPLATE_INFO[name])),
      h("label", { class: "wb-field" }, h("span", {}, t("Title")), title),
      h("label", { class: "wb-field" }, h("span", {}, t("Words: one line per section, like “Heading: one; two; three”")), sections),
      h("button", { type: "button", class: "btn btn-primary", onclick: async () => {
        const view = ui.view;
        if (!view) return;
        const built = buildTemplate(name, { title: title.value, sections: sections.value });
        const b = built.bounds;
        const at = view.centerPoint();
        const spot = findFreeSpot(view.page, Math.min(b.width, 1500) + 40, Math.min(b.height, 950) + 40, { near: { x: Math.max(40, at.x - b.width / 2), y: Math.max(30, at.y - b.height / 2) } });
        offsetAdds(built.ops, spot.x - b.x, spot.y - b.y);
        const res = await board.apply(built.ops.map((o) => ({ ...o, page: view.page.id })));
        if (res.applied?.length) {
          view.fitContent({ x: spot.x, y: spot.y, width: b.width, height: b.height });
          announce(t("Layout added"));
          showList();
        }
      } }, t("Add to the board"))
    );
    title.focus();
  }

  showList();
  return { el, refresh: showList, focus: () => el.querySelector("button")?.focus() };
}
