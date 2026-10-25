// The whiteboard's dialogs: other boards, earlier versions, ready-made layouts, diagrams from text, the keys,
// and what the robot sees. Built from code, with the page behind them inert and focus coming back (a11y.js).
import { h } from "../h.js";
import { t } from "../i18n.js";
import { trapModal, announce } from "../a11y.js";
import { confirmDialog } from "../dialogs.js";
import { TEMPLATE_NAMES, TEMPLATE_INFO, TEMPLATE_TITLES, TEMPLATE_EXAMPLES, buildTemplate } from "./templates.mjs";
import { wbIcon } from "./wb-icons.js";

// A dialog with a title, a body and buttons. Returns { close, el, body }.
export function modal({ title, body, actions = [], wide = false, onClose }) {
  const id = `wbm-${Math.random().toString(36).slice(2, 7)}`;
  const backdrop = h("div", { class: "modal-backdrop wb-modal-backdrop", "data-modal": "" });
  const box = h("div", { class: `modal wb-modal${wide ? " wide" : ""}`, role: "dialog", "aria-modal": "true", "aria-labelledby": `${id}-t` });
  const head = h("header", { class: "modal-head" }, h("h2", { id: `${id}-t` }, title), h("button", { type: "button", class: "icon-btn small", "aria-label": t("Close"), onclick: () => close() }, h("span", { html: wbIcon("close", 16) })));
  const content = h("div", { class: "wb-modal-body" }, body);
  const foot = actions.length ? h("footer", { class: "wb-modal-foot" }, actions) : null;
  box.append(head, content);
  if (foot) box.append(foot);
  backdrop.append(box);
  document.body.append(backdrop);
  let release = null;
  const onKey = (e) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    e.preventDefault();
    close();
  };
  document.addEventListener("keydown", onKey, true);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  function close() {
    document.removeEventListener("keydown", onKey, true);
    release?.();
    backdrop.remove();
    onClose?.();
  }
  release = trapModal(backdrop);
  return { close, el: box, body: content };
}

const ago = (ms) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return t("just now");
  if (s < 3600) return t("{n} min ago", { n: Math.round(s / 60) });
  if (s < 86400) return t("{n} h ago", { n: Math.round(s / 3600) });
  return new Date(ms).toLocaleDateString();
};

// ---------- Other boards ----------
export async function boardsDialog(store) {
  const list = h("div", { class: "wb-board-list", role: "list" });
  const search = h("input", { class: "field", type: "search", placeholder: t("Find a board"), "aria-label": t("Find a board"), autocomplete: "off" });
  const nameInput = h("input", { class: "field", type: "text", placeholder: t("Name of a new board"), "aria-label": t("Name of a new board"), maxlength: "120", autocomplete: "off" });
  const dlg = modal({
    title: t("Whiteboards"),
    wide: true,
    body: [h("div", { class: "wb-board-tools" }, search, nameInput, h("button", { type: "button", class: "btn btn-primary", onclick: () => make() }, t("New board"))), list],
  });
  async function make() {
    const title = nameInput.value.trim() || t("Untitled Board");
    await store.createBoard(title);
    announce(t("Opened {title}", { title }));
    dlg.close();
  }
  nameInput.addEventListener("keydown", (e) => e.key === "Enter" && make());
  async function refresh() {
    let boards = [];
    try {
      boards = await store.boards();
    } catch {
      list.replaceChildren(h("p", { class: "wb-empty" }, t("Couldn't load the boards.")));
      return;
    }
    const q = search.value.trim().toLowerCase();
    const shown = boards.filter((b) => !q || b.title.toLowerCase().includes(q));
    list.replaceChildren(
      ...(shown.length
        ? shown.map((b) =>
            h(
              "div",
              { class: `wb-board-item${b.id === store.doc?.id ? " current" : ""}`, role: "listitem" },
              h("div", { class: "wb-board-info" }, h("strong", {}, b.title === "Main Whiteboard" ? t("Main Whiteboard") : b.title), h("span", { class: "wb-board-meta" }, `${b.pageCount} ${t("pages")} · ${b.itemCount} ${t("items")} · ${ago(b.updatedAt)}`)),
              h(
                "div",
                { class: "wb-board-actions" },
                h("button", { type: "button", class: "btn small", onclick: async () => (await store.openBoard(b.id), dlg.close()) }, b.id === store.doc?.id ? t("Showing") : t("Open")),
                h("button", { type: "button", class: "btn small", "aria-label": t("Make a copy of {title}", { title: b.title }), onclick: async () => (await store.io.send("POST", `/api/whiteboards/${b.id}/duplicate`, {}), refresh()) }, t("Copy")),
                h("button", {
                  type: "button",
                  class: "btn small btn-danger",
                  "aria-label": t("Delete {title}", { title: b.title }),
                  onclick: async () => {
                    if (await confirmDialog({ title: t("Delete this board?"), message: t("“{title}” and its earlier versions will be gone for good.", { title: b.title }), confirm: t("Delete"), danger: true })) {
                      await store.io.send("DELETE", `/api/whiteboards/${b.id}`, {});
                      refresh();
                    }
                  },
                }, t("Delete"))
              )
            )
          )
        : [h("p", { class: "wb-empty" }, t("No boards found."))])
    );
  }
  search.addEventListener("input", refresh);
  refresh();
  return dlg;
}

// ---------- Earlier versions ----------
export async function historyDialog(store) {
  const list = h("div", { class: "wb-board-list", role: "list" }, h("p", { class: "wb-empty" }, t("Loading…")));
  const dlg = modal({ title: t("Earlier versions"), body: [h("p", { class: "hint" }, t("Friends keeps a copy now and then, and one before the robot changes things. Going back keeps a copy of what you have now.")), list] });
  let history = [];
  try {
    history = (await store.io.get(`/api/whiteboards/${encodeURIComponent(store.doc.id)}/history`)).history || [];
  } catch {}
  const who = { ai: t("before the robot drew"), mission: t("before a mission drew"), user: t("saved while you worked") };
  list.replaceChildren(
    ...(history.length
      ? history.map((snap) =>
          h(
            "div",
            { class: "wb-board-item", role: "listitem" },
            h("div", { class: "wb-board-info" }, h("strong", {}, new Date(snap.timestamp).toLocaleString()), h("span", { class: "wb-board-meta" }, snap.why === "replaced" ? t("before it was replaced") : who[snap.actor] || who.user)),
            h("div", { class: "wb-board-actions" }, h("button", {
              type: "button",
              class: "btn small",
              onclick: async () => {
                if (await confirmDialog({ title: t("Go back to this version?"), message: t("The board looks like it did then. What you have now is kept as an earlier version."), confirm: t("Go back") })) {
                  await store.io.send("POST", `/api/whiteboards/${encodeURIComponent(store.doc.id)}/restore`, { versionId: snap.versionId });
                  await store.resync();
                  announce(t("Went back to an earlier version"));
                  dlg.close();
                }
              },
            }, t("Go back")))
          )
        )
      : [h("p", { class: "wb-empty" }, t("No earlier versions yet."))])
  );
  return dlg;
}

// ---------- Ready-made layouts ----------
export function templatesDialog(view, store) {
  const grid = h("div", { class: "wb-template-grid" });
  const form = h("div", { class: "wb-template-form", hidden: true });
  const dlg = modal({ title: t("Start from a layout"), wide: true, body: [h("p", { class: "hint" }, t("Pick a layout, type your own words (or keep the example), and it is laid out for you. The robot can do the same when you ask.")), grid, form] });
  for (const name of TEMPLATE_NAMES) {
    grid.append(h("button", { type: "button", class: "wb-template-card", onclick: () => pick(name) }, h("strong", {}, t(TEMPLATE_TITLES[name] || name)), h("span", {}, t(TEMPLATE_INFO[name]))));
  }
  function pick(name) {
    grid.hidden = true;
    form.hidden = false;
    const title = h("input", { class: "field", type: "text", value: t(TEMPLATE_TITLES[name]), "aria-label": t("Title"), maxlength: "100" });
    const sections = h("textarea", { class: "field textarea", rows: "8", "aria-label": t("Words, one line per section"), spellcheck: "true" });
    sections.value = TEMPLATE_EXAMPLES[name] || "";
    form.replaceChildren(
      h("h3", {}, t(TEMPLATE_TITLES[name] || name)),
      h("label", { class: "wb-field" }, h("span", {}, t("Title")), title),
      h("label", { class: "wb-field" }, h("span", {}, t("Words: one line per section, like “Heading: one; two; three”")), sections),
      h("div", { class: "wb-modal-foot" }, h("button", { type: "button", class: "btn", onclick: () => ((grid.hidden = false), (form.hidden = true)) }, t("Back")), h("button", {
        type: "button",
        class: "btn btn-primary",
        onclick: async () => {
          const built = buildTemplate(name, { title: title.value, sections: sections.value });
          const b = built.bounds;
          const at = view.centerPoint();
          const { findFreeSpot } = await import("./arrange.mjs");
          const spot = findFreeSpot(view.page, Math.min(b.width, 1500) + 40, Math.min(b.height, 950) + 40, { near: { x: Math.max(40, at.x - b.width / 2), y: Math.max(30, at.y - b.height / 2) } });
          const { offsetAdds } = await import("./arrange.mjs");
          offsetAdds(built.ops, spot.x - b.x, spot.y - b.y);
          const res = await store.apply(built.ops.map((o) => ({ ...o, page: view.page.id })));
          if (res.applied?.length) {
            dlg.close();
            view.fitContent({ x: spot.x, y: spot.y, width: b.width, height: b.height });
            announce(t("Layout added"));
          }
        },
      }, t("Add to the board")))
    );
    title.focus();
  }
  return dlg;
}

// ---------- A diagram from text ----------
const DIAGRAM_EXAMPLES = {
  flowchart: "graph TD\n  A[Start] --> B{Is it ready?}\n  B -->|yes| C[Ship it]\n  B -->|no| D[Keep working]\n  D --> B",
  tree: "- Project\n  - Research\n  - Build\n    - Frontend\n    - Backend\n  - Launch",
  mindmap: "- My idea\n  - Why\n  - Who for\n  - How\n  - What next",
  mermaid: "sequenceDiagram\n  You->>Robot: Draw me a plan\n  Robot-->>You: Here it is",
};

export function diagramDialog(view, at, existing = null) {
  const kind = h("select", { class: "field", "aria-label": t("Kind of diagram") }, ...[["flowchart", t("Flowchart")], ["tree", t("Tree")], ["mindmap", t("Mind map")], ["mermaid", t("Other (Mermaid)")]].map(([v, l]) => h("option", { value: v }, l)));
  const code = h("textarea", { class: "field textarea wb-code", rows: "10", spellcheck: "false", "aria-label": t("The diagram as text"), dir: "ltr" });
  code.value = existing?.code || DIAGRAM_EXAMPLES.flowchart;
  if (existing) kind.value = "mermaid";
  kind.addEventListener("change", () => {
    if (Object.values(DIAGRAM_EXAMPLES).includes(code.value) || !code.value.trim()) code.value = DIAGRAM_EXAMPLES[kind.value];
  });
  const dlg = modal({
    title: existing ? t("Edit the diagram") : t("Diagram from text"),
    wide: true,
    body: [
      h("p", { class: "hint" }, t("A flowchart, tree or mind map becomes real boxes and arrows you can move. Other Mermaid diagrams stay as one block.")),
      h("label", { class: "wb-field" }, h("span", {}, t("Kind")), kind),
      h("label", { class: "wb-field" }, h("span", {}, t("Text")), code),
    ],
    actions: [
      h("button", { type: "button", class: "btn", onclick: () => dlg.close() }, t("Cancel")),
      h("button", {
        type: "button",
        class: "btn btn-primary",
        onclick: async () => {
          if (existing) {
            await view.store.apply({ op: "update", page: view.page.id, id: existing.id, set: { code: code.value } });
          } else {
            const res = await view.createDiagram(code.value, at, { kind: kind.value });
            const added = res?.applied?.filter((o) => o.op === "add").map((o) => o.item.id) || [];
            if (added.length) view.setSelection(added);
          }
          dlg.close();
          view.setTool("select");
        },
      }, existing ? t("Save") : t("Add to the board")),
    ],
  });
  code.focus();
  return dlg;
}

// ---------- The keys ----------
const KEYS = [
  ["V", "Select"], ["H or Space + drag", "Move around"], ["P", "Pen"], ["M", "Highlighter"], ["E", "Eraser"], ["R", "Shapes"], ["L", "Arrow"], ["C", "Connector"],
  ["T", "Text"], ["N", "Sticky note"], ["K", "Checklist"], ["B", "Table"], ["F", "Formula"], ["D", "Code"], ["G", "Diagram"], ["W", "Frame"], ["I", "Picture"], ["Z", "Pointer"],
  ["Ctrl + Z / Ctrl + Shift + Z", "Undo / redo"], ["Ctrl + A", "Select everything"], ["Ctrl + C / X / V", "Copy / cut / paste"], ["Ctrl + D", "Duplicate"], ["Delete", "Delete"],
  ["Arrow keys (Shift = bigger steps)", "Nudge"], ["Enter", "Edit the selected thing"], ["Tab", "Next thing"], ["Ctrl + ] / [", "Forward / backward"], ["Ctrl + L", "Lock / unlock"],
  ["+ / − / 0", "Zoom in / out / show the board"], ["Shift + 1", "Show everything"], ["Esc", "Let go, or back to Select"], ["Shift while drawing", "Straight lines, even sizes"], ["Alt while dragging", "Drag a copy"],
];

export function keysDialog() {
  return modal({
    title: t("Keyboard shortcuts"),
    wide: true,
    body: h("dl", { class: "wb-keys" }, KEYS.flatMap(([k, d]) => [h("dt", {}, ...k.split(" / ").flatMap((p, i) => [i ? " / " : "", h("kbd", {}, p)])), h("dd", {}, t(d))])),
  });
}

// ---------- What the robot sees ----------
export async function seesDialog(store) {
  const pre = h("pre", { class: "wb-sees", tabindex: "0", dir: "auto" }, t("Loading…"));
  const dlg = modal({ title: t("What the robot sees"), wide: true, body: [h("p", { class: "hint" }, t("This is the written account of the board the robot gets with every message: what is where, who made it, what you are doing and what changed. It never sees the screen itself.")), pre] });
  try {
    pre.textContent = (await store.describe()).text;
  } catch {
    pre.textContent = t("Couldn't load it.");
  }
  return dlg;
}
