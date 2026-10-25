// ---------- The sources panel ----------
// What the robot learns from on this board: texts you paste, files, notes from your vault, its own notes, your chats and
// pages of the board. Each can be switched on or off; the ones that are on are told to the robot (numbered S1, S2…), and
// it says where something comes from like [S1]. Under them, what it can make out of them in one click.
import { h } from "../h.js";
import { t } from "../i18n.js";
import { announce } from "../a11y.js";
import { confirmDialog } from "../dialogs.js";
import { board } from "./store.js";
import { STUDIO, SOURCE_QUESTIONS } from "./studio.mjs";
import { wbIcon } from "./wb-icons.js";
import { iconButton, menu } from "./controls.js";
import { modal } from "./dialogs.js";

const FILE_TYPES = ".txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.log,.srt,.vtt,.tex,.xml,.yaml,.yml,.rst,.org";
const MAX_FILE = 1_000_000;
const KIND_ICON = { paste: "paste", file: "fileUp", vault: "note", note: "bulb", chat: "chatSource", page: "boards" };
const KIND_NAME = { paste: "Text", file: "File", vault: "Note", note: "Robot's note", chat: "Chat", page: "Board page" };

const sizeText = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export function sourcesPanel(ui) {
  const list = h("div", { class: "rw-sources" });
  const studio = h("div", { class: "rw-studio-grid" });
  const addBtn = h("button", { type: "button", class: "btn small", "aria-haspopup": "menu", "aria-expanded": "false", onclick: () => addMenu() }, h("span", { html: wbIcon("plus", 16) }), t("Add"));
  const drop = h("p", { class: "wb-hint-text rw-drop" }, t("Drop a file here to add it."));
  const el = h("div", { class: "rw-side-panel" },
    h("header", { class: "rw-side-head" }, h("h2", {}, t("Sources")), h("span", { class: "fw-spacer" }), addBtn),
    h("p", { class: "wb-hint-text" }, t("What the robot learns from on this board. It tells you which source an answer comes from, like [S1].")),
    list, drop,
    h("section", { class: "rw-studio-sec" }, h("h3", { class: "wb-group-title" }, t("Create with the robot")), studio));
  let sources = [];

  const base = () => `/api/whiteboards/${encodeURIComponent(board.doc?.id || "")}/sources`;

  async function refresh() {
    if (!board.doc) return;
    try {
      sources = (await board.io.get(base())).sources || [];
    } catch {
      sources = [];
    }
    draw();
  }

  function draw() {
    // A list only while there is something in it
    if (sources.length) list.setAttribute("role", "list");
    else list.removeAttribute("role");
    list.replaceChildren(
      ...(sources.length
        ? sources.map((s) => row(s))
        : [h("div", { class: "rw-empty-sources" },
            h("p", {}, t("Nothing here yet. Add notes, texts or files and ask the robot about them: it answers from them and shows where it found it.")),
            h("div", { class: "wb-btn-row" },
              h("button", { type: "button", class: "btn small", onclick: () => pasteDialog() }, t("Paste a text")),
              h("button", { type: "button", class: "btn small", onclick: () => pickFile() }, t("Add a file")),
              h("button", { type: "button", class: "btn small", onclick: () => notesDialog() }, t("From my notes"))))])
    );
    drawStudio();
  }

  function drawStudio() {
    const on = sources.filter((s) => s.enabled);
    studio.replaceChildren(
      ...STUDIO.map((s) => h("button", { type: "button", class: "rw-studio-card", disabled: !on.length && !board.page?.items?.length, title: t(s.hint), onclick: () => ui.robotWin.ask(t(s.prompt)) }, h("span", { html: wbIcon(s.icon, 18) }), h("span", {}, t(s.label)))),
      ...(on.length ? SOURCE_QUESTIONS.map((q) => h("button", { type: "button", class: "rw-ask-card", onclick: () => ui.robotWin.ask(t(q)) }, h("span", { html: wbIcon("ask", 16) }), h("span", {}, t(q)))) : [])
    );
  }

  function row(s) {
    const more = iconButton("more", t("More for {title}", { title: s.title }), (e) => {
      e.stopPropagation();
      menu(more, [
        { icon: "eye", label: t("Read it"), fn: () => view(s) },
        { icon: "text", label: t("Rename"), fn: () => rename(s) },
        { icon: "ask", label: t("Ask the robot about it"), fn: () => ui.robotWin.ask(t("Tell me about source {n}: what is in it and what matters.", { n: `S${s.n}` })) },
        { separator: true },
        { icon: "trash", label: t("Remove"), danger: true, fn: () => remove(s) },
      ], { align: "end" });
    }, { cls: "small" });
    const toggle = h("input", { type: "checkbox", class: "toggle small", checked: s.enabled, "aria-label": t("The robot uses {title}", { title: s.title }), onchange: () => patch(s, { enabled: toggle.checked }) });
    return h("div", { class: `rw-source${s.enabled ? "" : " off"}`, role: "listitem", id: `rw-source-${s.n}` },
      h("span", { class: "rw-source-n", title: t("The robot calls it S{n}", { n: s.n }) }, `S${s.n}`),
      h("button", { type: "button", class: "rw-source-main", onclick: () => view(s) },
        h("span", { class: "rw-source-title", dir: "auto" }, s.title),
        h("small", {}, h("span", { class: "rw-source-kind", html: wbIcon(KIND_ICON[s.kind] || "paste", 12) }), `${t(KIND_NAME[s.kind] || "Text")} · ${t("{n} characters", { n: sizeText(s.size) })}`)),
      toggle, more);
  }

  async function patch(s, change) {
    try {
      await board.io.send("PATCH", `${base()}/${s.id}`, change);
    } catch (e) {
      announce(e.message);
    }
    refresh();
  }

  async function rename(s) {
    const name = await ui.promptText({ title: t("Rename the source"), label: t("Name"), value: s.title, confirm: t("Rename") });
    if (name) patch(s, { title: name });
  }

  async function remove(s) {
    if (!(await confirmDialog({ title: t("Remove this source?"), message: t("“{title}” is taken off this board. The original stays where it is.", { title: s.title }), confirm: t("Remove"), danger: true }))) return;
    await board.io.send("DELETE", `${base()}/${s.id}`, {}).catch((e) => announce(e.message));
    refresh();
  }

  async function view(s) {
    const pre = h("pre", { class: "wb-sees", dir: "auto", tabindex: "0" }, t("Loading…"));
    modal({ title: `S${s.n}: ${s.title}`, wide: true, body: [h("p", { class: "hint" }, `${t(KIND_NAME[s.kind] || "Text")} · ${t("{n} characters", { n: sizeText(s.size) })}`), pre] });
    try {
      pre.textContent = (await board.io.get(`${base()}/${s.id}`)).text;
    } catch {
      pre.textContent = t("Couldn't load it.");
    }
  }

  async function add(body) {
    try {
      await board.io.send("POST", base(), body);
      announce(t("Added to the sources"));
    } catch (e) {
      announce(e.message);
      ui.view?.say?.(e.message);
    }
    refresh();
  }

  function addMenu() {
    menu(addBtn, [
      { icon: "paste", label: t("Paste a text"), fn: () => pasteDialog() },
      { icon: "fileUp", label: t("Add a file"), hint: t("Text, Markdown, CSV, web pages…"), fn: () => pickFile() },
      { icon: "note", label: t("From my notes and chats"), fn: () => notesDialog() },
      { icon: "boards", label: t("This page of the board"), fn: () => add({ kind: "page", page: board.pageIndex }) },
    ], { align: "end" });
  }

  function pasteDialog() {
    const title = h("input", { class: "field", type: "text", maxlength: "120", "aria-label": t("Name") });
    const text = h("textarea", { class: "field textarea", rows: "10", "aria-label": t("The text"), spellcheck: "true", placeholder: t("Paste or type what the robot should learn from.") });
    const dlg = modal({
      title: t("Paste a text"),
      wide: true,
      body: [h("label", { class: "wb-field" }, h("span", {}, t("Name (optional)")), title), h("label", { class: "wb-field" }, h("span", {}, t("The text")), text)],
      actions: [h("button", { type: "button", class: "btn", onclick: () => dlg.close() }, t("Cancel")), h("button", { type: "button", class: "btn btn-primary", onclick: async () => (await add({ kind: "paste", title: title.value, text: text.value }), dlg.close()) }, t("Add"))],
    });
    text.focus();
  }

  function pickFile() {
    const input = h("input", { type: "file", accept: FILE_TYPES, multiple: true });
    input.onchange = () => [...input.files].forEach(addFile);
    input.click();
  }

  async function addFile(file) {
    if (file.size > MAX_FILE) return announce(t("{name} is too big (the most is 1 MB of text).", { name: file.name }));
    if (/\.(pdf|docx?|pptx?|xlsx?|odt|png|jpe?g|gif|webp|zip)$/i.test(file.name)) return announce(t("{name} isn't plain text. Paste its text instead.", { name: file.name }));
    add({ kind: "file", title: file.name, text: await file.text() });
  }

  async function notesDialog() {
    const body = h("div", { class: "rw-pick" }, h("p", { class: "wb-empty" }, t("Loading…")));
    const dlg = modal({ title: t("From my notes and chats"), wide: true, body });
    let found = { vault: [], notes: [], chats: [] };
    try {
      found = await board.io.get("/api/whiteboards/available-sources");
    } catch {}
    const q = h("input", { type: "search", class: "field", placeholder: t("Find"), "aria-label": t("Find"), autocomplete: "off" });
    const lists = h("div", { class: "rw-pick-lists" });
    const pick = (label, items, make) => h("section", {}, h("h3", { class: "wb-group-title" }, label), ...(items.length ? items.map((it) => h("button", { type: "button", class: "rw-pick-item", onclick: async () => (await add(make(it)), dlg.close()) }, h("span", { dir: "auto" }, it.title || it.path))) : [h("p", { class: "wb-hint-text" }, t("Nothing here."))]));
    const draw = () => {
      const f = q.value.trim().toLowerCase();
      const keep = (x) => !f || String(x.title || x.path).toLowerCase().includes(f);
      lists.replaceChildren(
        pick(t("Notes in your vault"), found.vault.filter(keep), (n) => ({ kind: "vault", path: n.path })),
        pick(t("The robot's own notes"), found.notes.filter(keep), (n) => ({ kind: "note", noteId: n.id })),
        pick(t("Your chats"), found.chats.filter(keep), (c) => ({ kind: "chat", chatId: c.id }))
      );
    };
    q.addEventListener("input", draw);
    body.replaceChildren(q, lists);
    draw();
    q.focus();
  }

  // A file dropped on the panel
  el.addEventListener("dragover", (e) => [...(e.dataTransfer?.types || [])].includes("Files") && e.preventDefault());
  el.addEventListener("drop", (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    [...e.dataTransfer.files].forEach(addFile);
  });

  board.on("sources", (e) => e.id === board.doc?.id && el.isConnected && refresh());
  for (const ev of ["doc"]) board.on(ev, () => el.isConnected && !el.closest("[hidden]") && refresh());
  board.on("change", () => el.isConnected && !el.closest("[hidden]") && drawStudio());

  return {
    el,
    refresh,
    focus: () => addBtn.focus(),
    // Opens the viewer of one source (a click on [S2] in the robot's answer)
    show(n) {
      const s = sources.find((x) => x.n === n);
      if (s) view(s);
      else document.getElementById(`rw-source-${n}`)?.scrollIntoView({ block: "center" });
    },
    count: () => sources.filter((s) => s.enabled).length,
  };
}
