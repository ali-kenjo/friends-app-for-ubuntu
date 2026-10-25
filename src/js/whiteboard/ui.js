// ---------- The robot page: the board and the robot, together ----------
// One place to work with the robot: the board takes the whole page, the robot floats over it in a window you can put
// anywhere, the tools sit in a pill at the bottom, and the panels (boards, outline, sources, shapes, layouts) and the
// options come in from the sides when you want them. Everything you and the robot do goes through board-store (one
// board, changed by operations), so both of you can work at the same time.
import { h } from "../h.js";
import { t } from "../i18n.js";
import { announce } from "../a11y.js";
import { getSettings, onSettings } from "../store.js";
import { confirmDialog } from "../dialogs.js";
import { board, boardReady } from "./store.js";
import { BoardView } from "./view.js";
import { STICKY_COLORS, genId, documentToText } from "./model.mjs";
import { PALETTE, FILLS } from "./tools.mjs";
import { toSVG, themeOf } from "./render.mjs";
import { wbIcon } from "./wb-icons.js";
import { historyDialog, diagramDialog, keysDialog, seesDialog, modal } from "./dialogs.js";
import { iconButton, swatchRow, popover, menu, contextMenu } from "./controls.js";
import { ToolPill } from "./toolpill.js";
import { Inspector, ContextBar, setWb } from "./inspector.js";
import { boardsPanel, outlinePanel, shapesPanel, layoutsPanel } from "./side.js";
import { RobotWindow, roleName, FACE } from "./robotwin.js";
import { sourcesPanel } from "./sources-ui.js";
import { openPalette } from "./palette.js";
import { parseLinks, itemTexts } from "./links.mjs";
import { followSettings } from "./windows.js";
import { activeRole, roleChips } from "../robot/roles.mjs";
import { characterName } from "../characters.js";

const el = (id) => document.getElementById(id);
const wbSettings = () => getSettings()?.whiteboard || {};

function download(blob, name) {
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
}

const safeName = (s) => String(s || "whiteboard").replace(/[^\p{L}\p{N}_ -]+/gu, "").trim().slice(0, 60) || "whiteboard";
const SIDE_KEY = "friends.rwSide";

const RAIL = [
  ["boards", "boards", "Boards", "Your boards"],
  ["outline", "outline", "Outline", "Everything on this page"],
  ["sources", "sources", "Sources", "What the robot learns from: notes, texts and files"],
  ["shapes", "shapes", "Shapes", "A library of shapes to add"],
  ["layouts", "template", "Layouts", "Ready-made boards: plans, lessons, quizzes"],
];

class RobotPage {
  constructor() {
    this.built = false;
    this.shown = false;
    this.view = null;
    this.panels = {};
    this.side = null;
  }

  // The view is built the first time the page is shown (it needs a real size)
  async ensure() {
    if (this.built) return;
    this.built = true;
    this.root = el("view-whiteboard");
    this.actions = el("wb-actions");
    this.workspace = el("wb-workspace");
    await boardReady;
    this.buildLayout();
    this.view = new BoardView({
      container: this.viewport,
      store: board,
      getSettings,
      mode: "full",
      label: t("Whiteboard"),
      callbacks: {
        onTool: () => this.onTool(),
        onSelection: () => this.onSelection(),
        onStyle: () => this.onStyle(),
        onZoom: (z) => this.updateZoom(z),
        onMenu: (ctx) => this.contextMenu(ctx),
        onDiagram: (at) => (at?.edit ? diagramDialog(this.view, null, at.edit) : diagramDialog(this.view, at)),
        onHistory: () => this.syncHistory(),
        onPaint: () => this.ctxBar.place(),
        onEscape: () => {},
      },
    });
    this.pill.sync();
    this.bindStore();
    onSettings(() => this.onSettings());
    this.inspector.render({ force: true });
    this.renderPages();
    this.syncTitle();
    this.syncHistory();
    this.syncEmpty();
    this.onSettings();
    this.restoreSide();
  }

  show() {
    this.ensure().then(() => {
      this.shown = true;
      requestAnimationFrame(() => {
        this.syncCompact();
        this.syncRobotWindow();
        requestAnimationFrame(() => {
          this.view.resize();
          // The board is fitted once the page has its real size (the panels and the narrow layout decide it)
          if (!this.fittedOnce) {
            this.fittedOnce = true;
            this.view.fitBoard();
          }
          // The keyboard goes to the board, unless you have already put it somewhere else (the palette, a box)
          const at = document.activeElement;
          if (!at || at === document.body || at.closest("nav, .view-bar, .sidebar")) this.view.container.focus({ preventScroll: true });
        });
      });
    });
  }

  hide() {
    this.shown = false;
    this.robotWin?.sync();
  }

  // ---------- Building the page ----------
  buildLayout() {
    this.viewport = h("div", { class: "wb-viewport", id: "whiteboard-viewport-container" });
    this.stage = h("div", { class: "rw-stage" });
    this.pill = new ToolPill(this);
    this.pillDock = h("div", { class: "rw-pill-dock" }, this.pill.el);
    this.ctxBar = new ContextBar(this);
    this.status = h("div", { class: "wb-status", role: "status", "aria-live": "polite" });
    this.tabs = h("div", { class: "wb-page-tabs", role: "tablist", "aria-label": t("Pages") });
    this.pages = h("div", { class: "rw-pages" }, this.tabs);
    this.empty = this.buildEmpty();
    this.stage.append(this.viewport, this.empty, this.ctxBar.el, this.pillDock, this.pages, this.status);

    this.inspector = new Inspector(this);
    this.rail = this.buildRail();
    this.sideHost = h("aside", { class: "rw-side", hidden: true, "aria-label": t("Panels") });
    this.workspace.replaceChildren(this.rail, this.sideHost, this.stage, this.inspector.el);
    this.robotWin = new RobotWindow(this);
    followSettings(this.robotWin.win, "robot");
    this.buildActions();
    this.ro = new ResizeObserver(() => this.syncCompact());
    this.ro.observe(this.workspace);
  }

  buildRail() {
    const rail = h("nav", { class: "rw-rail", "aria-label": t("Panels") });
    this.railButtons = new Map();
    for (const [id, icon, label, hint] of RAIL) {
      const b = h("button", { type: "button", class: "rw-rail-btn", "aria-pressed": "false", "aria-label": t(label), title: `${t(label)}: ${t(hint)}`, onclick: () => this.togglePanel(id) }, h("span", { html: wbIcon(icon, 20) }), h("span", { class: "rw-rail-label" }, t(label)));
      this.railButtons.set(id, b);
      rail.append(b);
    }
    rail.append(h("span", { class: "fw-spacer" }));
    this.robotButton = h("button", { type: "button", class: "rw-rail-btn rw-rail-robot", "aria-pressed": "true", "aria-label": t("The robot's window"), title: t("Show or hide the robot's window"), onclick: () => this.setRobotWindow(!this.robotWin.win.visible) }, h("span", { class: "rw-rail-face", html: FACE }), h("span", { class: "rw-rail-label" }, t("Robot")));
    this.optionsButton = h("button", { type: "button", class: "rw-rail-btn", "aria-pressed": "true", "aria-label": t("Options"), title: t("Show or hide the options"), onclick: () => this.toggleInspector() }, h("span", { html: wbIcon("sliders", 20) }), h("span", { class: "rw-rail-label" }, t("Options")));
    rail.append(this.optionsButton, this.robotButton);
    return rail;
  }

  buildActions() {
    this.zoomLabel = h("span", { class: "wb-zoom-label", "aria-live": "off" }, "100%");
    this.undoBtn = iconButton("undo", t("Undo (Ctrl+Z)"), () => board.undo(), { cls: "small" });
    this.redoBtn = iconButton("redo", t("Redo (Ctrl+Y)"), () => board.redo(), { cls: "small" });
    this.switchBtn = h("button", { type: "button", class: "btn small", "aria-haspopup": "dialog", title: t("Go to a board (Ctrl+O)"), onclick: () => this.switchBoard() }, h("span", { html: wbIcon("boards", 16) }), h("span", { class: "rw-hide-narrow" }, t("Boards")));
    this.findBtn = h("button", { type: "button", class: "btn small", "aria-haspopup": "dialog", title: t("Find anything: commands, layouts, roles (Ctrl+P)"), onclick: () => openPalette(this, "commands") }, h("span", { html: wbIcon("search", 16) }), h("span", { class: "rw-hide-narrow" }, t("Find")), h("kbd", { class: "rw-hide-narrow" }, "Ctrl P"));
    this.saveBtn = h("button", { type: "button", class: "btn small", "aria-haspopup": "menu", "aria-expanded": "false", onclick: () => this.saveMenu() }, h("span", { html: wbIcon("export", 16) }), h("span", { class: "rw-hide-narrow" }, t("Save")), h("span", { html: wbIcon("chevronDown", 14) }));
    this.actions.replaceChildren(
      this.switchBtn,
      this.findBtn,
      h("span", { class: "wb-sep", role: "separator" }),
      this.undoBtn,
      this.redoBtn,
      h("div", { class: "wb-zoom-inline", role: "group", "aria-label": t("Zoom") },
        iconButton("zoomOut", t("Zoom out"), () => this.view.setZoom(this.view.zoom / 1.25), { cls: "small" }),
        this.zoomLabel,
        iconButton("zoomIn", t("Zoom in"), () => this.view.setZoom(this.view.zoom * 1.25), { cls: "small" }),
        iconButton("fit", t("Fit everything on this page"), () => this.view.fitContent(), { cls: "small" })),
      this.saveBtn,
      iconButton("history", t("Earlier versions"), () => this.openHistory(), { cls: "small" }),
      iconButton("keyboard", t("Keyboard shortcuts"), () => this.showKeys(), { cls: "small" }),
      iconButton("dock", t("Show it beside your chat"), () => this.openDock(), { cls: "small" })
    );
  }

  // What shows on an empty page: where to begin
  buildEmpty() {
    this.emptyList = h("div", { class: "rw-empty-actions" });
    return h("div", { class: "rw-empty", hidden: true }, h("div", { class: "rw-empty-card" }, h("div", { class: "rw-empty-face", html: FACE }), this.emptyTitle = h("h2", {}, t("Start here")), this.emptyText = h("p", {}, ""), this.emptyList));
  }

  syncEmpty() {
    const empty = !board.page?.items?.length && !board.writing;
    this.empty.hidden = !empty;
    if (!empty) return;
    const role = activeRole(getSettings().roles);
    this.emptyTitle.textContent = role.id === "assistant" ? t("A clean board") : t("A clean board for {name} as {role}", { name: characterName(), role: roleName(role) });
    this.emptyText.textContent = t("Draw, write or drop a picture here. Or ask the robot, and watch it work next to you.");
    const go = (label, icon, fn) => h("button", { type: "button", class: "rw-empty-btn", onclick: fn }, h("span", { html: wbIcon(icon, 18) }), h("span", {}, label));
    const chips = roleChips(getSettings().roles).slice(0, 3);
    this.emptyList.replaceChildren(
      ...chips.map(([label, prompt]) => go(role.custom ? label : t(label), "sparkle", () => this.robotWin.askAbout([], role.custom ? prompt : t(prompt)))),
      go(t("Start from a layout"), "template", () => this.openPanel("layouts")),
      go(t("Pick a shape"), "shapes", () => this.openPanel("shapes")),
      go(t("Add a source"), "sources", () => this.openPanel("sources"))
    );
  }

  // ---------- The panels ----------
  registerPanel(id, panel) {
    this.panels[id] = panel;
    panel.el.hidden = true;
    this.sideHost.append(panel.el);
  }

  panelFor(id) {
    if (!this.panels[id]) {
      const make = { boards: boardsPanel, outline: outlinePanel, shapes: shapesPanel, layouts: layoutsPanel, sources: sourcesPanel }[id];
      if (!make) return null;
      this.registerPanel(id, make.call(this, this));
    }
    return this.panels[id];
  }

  togglePanel(id) {
    if (this.side === id) this.closePanel();
    else this.openPanel(id);
  }

  openPanel(id) {
    const panel = this.panelFor(id);
    if (!panel) return;
    this.side = id;
    for (const [pid, p] of Object.entries(this.panels)) p.el.hidden = pid !== id;
    this.sideHost.hidden = false;
    this.workspace.dataset.side = id;
    for (const [rid, b] of this.railButtons) b.setAttribute("aria-pressed", String(rid === id));
    panel.refresh?.();
    panel.focus?.();
    try {
      localStorage.setItem(SIDE_KEY, id);
    } catch {}
    requestAnimationFrame(() => this.view?.resize());
  }

  closePanel() {
    this.side = null;
    this.sideHost.hidden = true;
    delete this.workspace.dataset.side;
    for (const b of this.railButtons.values()) b.setAttribute("aria-pressed", "false");
    try {
      localStorage.setItem(SIDE_KEY, "");
    } catch {}
    requestAnimationFrame(() => this.view?.resize());
    this.view?.container.focus({ preventScroll: true });
  }

  restoreSide() {
    let id = "";
    try {
      id = localStorage.getItem(SIDE_KEY) || "";
    } catch {}
    if (id && RAIL.some(([r]) => r === id) && !this.compact) this.openPanel(id);
  }

  // [[Another board]]: go to it, or make it when there is none yet
  async openByTitle(title) {
    const boards = await board.boards().catch(() => []);
    const found = boards.find((b) => String(b.title).toLowerCase() === title.toLowerCase());
    if (found) return board.openBoard(found.id);
    if (await confirmDialog({ title: t("Make a board called “{title}”?", { title }), message: t("There is no board with that name yet."), confirm: t("Make it") })) {
      await board.createBoard(title);
      announce(t("Opened {title}", { title }));
    }
    return null;
  }

  // A click on [S2] in the robot's answer: the sources panel opens and shows it
  openSource(n) {
    this.openPanel("sources");
    this.panels.sources?.refresh().then(() => this.panels.sources.show(n));
  }

  openLayout(name) {
    this.openPanel("layouts");
    this.panels.layouts?.el.querySelectorAll(".rw-layout-card").forEach((b) => b.textContent.startsWith(name) && b.click());
  }

  // ---------- The options panel ----------
  inspectorOpen() {
    return wbSettings().inspector !== false && !this.compact;
  }

  toggleInspector() {
    if (this.compact) {
      this.inspector.el.classList.toggle("open");
      this.syncInspector();
      return;
    }
    setWb({ inspector: wbSettings().inspector === false });
  }

  openInspector() {
    if (this.compact) this.inspector.el.classList.add("open");
    else if (wbSettings().inspector === false) setWb({ inspector: true });
    this.syncInspector();
  }

  syncInspector() {
    const open = this.compact ? this.inspector.el.classList.contains("open") : wbSettings().inspector !== false;
    this.inspector.el.hidden = !open;
    this.workspace.dataset.inspector = open ? "open" : "closed";
    this.optionsButton?.setAttribute("aria-pressed", String(open));
    if (open) this.inspector.render({ force: true });
    requestAnimationFrame(() => this.view?.resize());
  }

  ctxBarWanted() {
    return this.view?.tool === "select" && this.shown;
  }

  // On a narrow screen the panels float over the board instead of taking room from it
  syncCompact() {
    const compact = this.workspace.clientWidth < 900;
    if (compact === this.compact) return;
    this.compact = compact;
    this.workspace.dataset.compact = String(compact);
    this.syncInspector();
    if (compact && this.side && !this.compactSeen) this.closePanel();
    this.compactSeen = true;
    // On a phone the robot's window starts as a title bar under the pages, so the board is in view
    if (compact && this.robotWin.win.visible && !this.robotChosen) this.robotWin.win.set({ shaded: true, x: 0.04, y: 0.14, w: 0.92 }, { save: false });
  }

  // ---------- The robot's window ----------
  setRobotWindow(open) {
    this.robotChosen = true;
    setWb({ robotWindow: open });
    this.syncRobotWindow();
  }

  syncRobotWindow() {
    const open = wbSettings().robotWindow !== false;
    if (open && !this.robotWin.win.visible) this.robotWin.show();
    else if (!open && this.robotWin.win.visible) this.robotWin.hide();
    this.robotButton?.setAttribute("aria-pressed", String(open));
    this.robotWin.sync();
  }

  askAbout(items, prompt = "") {
    this.robotWin.askAbout(items, prompt);
  }

  async undoRobot() {
    const res = await board.undoRobot().catch((e) => ({ ok: false, error: e.message }));
    announce(res.ok ? t("Took back the robot's last drawing") : t(res.error || "Nothing to undo"));
  }

  showWhatItSees() {
    seesDialog(board);
  }

  // ---------- Tools and what changes with them ----------
  onTool() {
    this.pill.sync();
    this.inspector.render({ force: true });
    this.ctxBar.place();
  }

  onSelection() {
    this.inspector.render({ force: true });
    this.robotWin.syncAbout();
    this.ctxBar.place();
    if (this.side === "outline") this.panels.outline?.refresh();
  }

  onStyle() {
    this.pill.sync();
    this.inspector.render();
  }

  syncHistory() {
    const s = board.historyState();
    if (this.undoBtn) this.undoBtn.disabled = !s.canUndo;
    if (this.redoBtn) this.redoBtn.disabled = !s.canRedo;
  }

  updateZoom(z) {
    if (this.zoomLabel) this.zoomLabel.textContent = `${Math.round(z * 100)}%`;
  }

  // ---------- Pickers that open next to a button ----------
  colorPopover(anchor, items, onlySticky) {
    const key = (it) => (it.type === "shape" ? "strokeColor" : "color");
    const first = items[0];
    popover(anchor, (close) => h("div", { class: "wb-pop-body" }, swatchRow(onlySticky ? STICKY_COLORS : PALETTE, first[key(first)] || PALETTE[0], (c) => {
      this.view.store.apply(items.filter((i) => ["shape", "stroke", "sticky", "frame", "text"].includes(i.type)).map((i) => ({ op: "update", page: this.view.page.id, id: i.id, set: { [key(i)]: c } })));
      close();
    }, t("Color"), { custom: !onlySticky })), { label: t("Color") });
  }

  fillPopover(anchor, items) {
    popover(anchor, (close) => h("div", { class: "wb-pop-body" }, swatchRow(FILLS, items[0].fillColor || "transparent", (c) => {
      this.view.setProps({ fillColor: c }, (i) => i.type === "shape" || i.type === "frame");
      close();
    }, t("Fill color"))), { label: t("Fill") });
  }

  // ---------- Menus ----------
  saveMenu() {
    menu(this.saveBtn, [
      { icon: "image", label: t("Picture (PNG)"), fn: () => this.exportPNG() },
      { icon: "export", label: t("Drawing (SVG)"), fn: () => this.exportSVG() },
      { icon: "export", label: t("Print or save as PDF"), fn: () => this.exportPDF() },
      { icon: "export", label: t("Text (Markdown)"), fn: () => this.exportText() },
      { icon: "export", label: t("The whole board (file)"), fn: () => this.exportJSON() },
      { separator: true },
      { icon: "fileUp", label: t("Open a board file…"), fn: () => this.importJSON() },
    ], { align: "end" });
  }

  // What the right-click menu offers: for a thing, or for the empty board
  contextMenu({ x, y, at, items, view }) {
    const e = [];
    if (items.length) {
      const first = items[0];
      e.push(
        { label: t("Edit"), icon: "text", fn: () => view.editText(first, first.type === "shape" ? "label" : first.type === "table" ? "cell" : "text") },
        { label: t("Ask the robot about this"), icon: "ask", fn: () => this.askAbout(items) },
        ...[...new Set(itemTexts(first).flatMap((s) => parseLinks(s).map((l) => l.title)))].slice(0, 4).map((title) => ({ label: t("Go to “{title}”", { title }), icon: "link", fn: () => this.openByTitle(title) })),
        { separator: true },
        { label: t("Duplicate"), icon: "copy", fn: () => view.duplicate() },
        { label: t("Copy"), icon: "copy", fn: () => view.copy() },
        { label: t("Cut"), fn: () => view.cut() },
        { label: t("Wrap in a frame"), icon: "frame", fn: () => view.wrapInFrame() },
        { separator: true },
        { label: t("Bring to front"), icon: "front", fn: () => view.order("front") },
        { label: t("Send to back"), icon: "back", fn: () => view.order("back") },
        { label: items.every((i) => i.locked) ? t("Unlock") : t("Lock"), icon: "lock", fn: () => view.setLocked(!items.every((i) => i.locked)) },
        { separator: true },
        { label: t("Delete"), icon: "trash", danger: true, fn: () => view.deleteSelection() }
      );
    } else {
      e.push(
        { label: t("Paste"), icon: "copy", fn: () => view.paste(at) },
        { label: t("Add a sticky note here"), icon: "sticky", fn: () => (view.setTool("sticky"), view.beginSticky(at)) },
        { label: t("Write here"), icon: "text", fn: () => (view.setTool("text"), view.beginText(at, { format: "plain" })) },
        { separator: true },
        { label: t("Select everything"), fn: () => view.selectAll() },
        { label: t("Show the whole board"), icon: "grid", fn: () => view.fitBoard() },
        { label: t("Find anything…"), icon: "search", fn: () => openPalette(this, "commands") }
      );
    }
    contextMenu(x, y, e);
  }

  // ---------- Pages ----------
  renderPages() {
    const doc = board.doc;
    if (!doc || !this.tabs) return;
    this.tabs.replaceChildren(
      ...doc.pages.map((p, i) => {
        const active = i === board.pageIndex;
        const tab = h("button", { type: "button", role: "tab", class: `wb-page-tab${active ? " active" : ""}`, "aria-selected": String(active), tabindex: active ? "0" : "-1", title: p.name, onclick: () => board.setPage(i), ondblclick: () => this.renamePage(i), oncontextmenu: (e) => (e.preventDefault(), this.pageMenu(i, e)) },
          h("span", { class: "wb-page-num" }, String(i + 1)), h("span", { class: "wb-page-name" }, p.name), h("span", { class: "wb-page-badge" }, String(p.items.length)));
        tab.addEventListener("keydown", (e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            board.setPage(i + (e.key === "ArrowRight" ? 1 : -1));
            requestAnimationFrame(() => this.tabs.querySelector('[aria-selected="true"]')?.focus());
          }
        });
        return tab;
      })
    );
    this.pages.replaceChildren(
      this.tabs,
      h("button", { type: "button", class: "wb-btn small wb-add-page", title: t("Add a page"), "aria-label": t("Add a page"), onclick: () => board.apply({ op: "page_add", page: { name: `${t("Page")} ${doc.pages.length + 1}` } }) }, h("span", { html: wbIcon("plus", 14) })),
      h("button", { type: "button", class: "wb-btn small", title: t("More for this page"), "aria-label": t("More for this page"), "aria-haspopup": "menu", onclick: (e) => this.pageMenu(board.pageIndex, e) }, h("span", { html: wbIcon("more", 16) }))
    );
    this.tabs.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  renamePage(i) {
    const page = board.doc.pages[i];
    const tab = this.tabs.children[i];
    if (!tab) return;
    const input = h("input", { class: "field wb-page-input", value: page.name, "aria-label": t("Page name"), maxlength: "60" });
    tab.replaceChildren(input);
    input.focus();
    input.select();
    const done = (save) => {
      if (save && input.value.trim() && input.value.trim() !== page.name) board.apply({ op: "page_update", page: page.id, set: { name: input.value.trim() } });
      else this.renderPages();
    };
    input.addEventListener("blur", () => done(true));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") done(true);
      else if (e.key === "Escape") done(false);
      e.stopPropagation();
    });
  }

  pageMenu(i, e) {
    const page = board.doc.pages[i];
    const anchor = e.currentTarget && e.currentTarget !== document ? e.currentTarget : this.pages;
    const entries = [
      { label: t("Rename"), icon: "text", fn: () => this.renamePage(i) },
      { label: t("Copy this page"), icon: "copy", fn: () => this.copyPage(i) },
    ];
    if (i > 0) entries.push({ label: t("Move left"), icon: "chevronLeft", fn: () => board.apply({ op: "page_move", page: page.id, to: i - 1 }) });
    if (i < board.doc.pages.length - 1) entries.push({ label: t("Move right"), icon: "chevronRight", fn: () => board.apply({ op: "page_move", page: page.id, to: i + 1 }) });
    if (board.doc.pages.length > 1) {
      entries.push({ separator: true }, {
        label: t("Delete this page"),
        icon: "trash",
        danger: true,
        fn: async () => {
          if (await confirmDialog({ title: t("Delete this page?"), message: t("It and everything on it will be removed. You can still undo this."), confirm: t("Delete"), danger: true })) board.apply({ op: "page_remove", page: page.id });
        },
      });
    }
    if (e.clientX && e.type === "contextmenu") contextMenu(e.clientX, e.clientY, entries);
    else menu(anchor, entries, { align: "start" });
  }

  copyPage(i) {
    const page = JSON.parse(JSON.stringify(board.doc.pages[i]));
    const ids = new Map(page.items.map((it) => [it.id, genId(it.type)]));
    page.id = genId("page");
    page.name = `${page.name} (${t("copy")})`.slice(0, 60);
    for (const it of page.items) {
      it.id = ids.get(it.id);
      for (const end of ["from", "to"]) if (it[end]) it[end] = ids.has(it[end].id) ? { ...it[end], id: ids.get(it[end].id) } : undefined;
    }
    board.apply({ op: "page_restore", page, index: i + 1, focusTo: i + 1 });
  }

  // ---------- The board's name ----------
  syncTitle() {
    const doc = board.doc;
    const titleEl = el("whiteboard-title-text");
    const sub = el("whiteboard-subtitle-text");
    if (!doc) return;
    if (titleEl && !titleEl.querySelector("input")) titleEl.textContent = doc.title === "Main Whiteboard" ? t("Main Whiteboard") : doc.title;
    if (sub) sub.textContent = `${doc.pages[board.pageIndex]?.name || ""} · ${doc.pages[board.pageIndex]?.items.length || 0} ${t("items")}`;
  }

  renameBoard() {
    const titleEl = el("whiteboard-title-text");
    const cur = board.doc.title === "Main Whiteboard" ? t("Main Whiteboard") : board.doc.title;
    const input = h("input", { class: "field wb-title-input", value: cur, "aria-label": t("Board name"), maxlength: "120" });
    titleEl.replaceChildren(input);
    input.focus();
    input.select();
    let finished = false;
    const done = (save) => {
      if (finished) return;
      finished = true;
      const name = input.value.trim();
      titleEl.replaceChildren();
      if (save && name && name !== cur) board.apply({ op: "doc_update", set: { title: name } }).then(() => this.syncTitle());
      this.syncTitle();
      this.view?.container.focus({ preventScroll: true });
    };
    input.addEventListener("blur", () => done(true));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") done(true);
      else if (e.key === "Escape") done(false);
      e.stopPropagation();
    });
  }

  renamePrompt() {
    if (this.shown) this.renameBoard();
  }

  // A small dialog that asks for one line of text
  promptText({ title, label, value = "", confirm = t("OK") }) {
    return new Promise((resolve) => {
      const input = h("input", { class: "field", type: "text", value, maxlength: "120", "aria-label": label });
      let answered = false;
      const finish = (v) => {
        if (answered) return;
        answered = true;
        dlg.close();
        resolve(v);
      };
      const dlg = modal({
        title,
        body: h("label", { class: "wb-field" }, h("span", {}, label), input),
        actions: [h("button", { type: "button", class: "btn", onclick: () => finish(null) }, t("Cancel")), h("button", { type: "button", class: "btn btn-primary", onclick: () => finish(input.value.trim()) }, confirm)],
        onClose: () => finish(null),
      });
      input.addEventListener("keydown", (e) => e.key === "Enter" && finish(input.value.trim()));
      input.focus();
      input.select();
    });
  }

  async newBoard() {
    const name = await this.promptText({ title: t("A new board"), label: t("Board name"), value: t("Untitled Board"), confirm: t("Make it") });
    if (!name) return;
    await board.createBoard(name);
    announce(t("Opened {title}", { title: name }));
  }

  switchBoard() {
    openPalette(this, "boards");
  }

  openHistory() {
    historyDialog(board);
  }

  showKeys() {
    keysDialog();
  }

  editDiagram(item) {
    diagramDialog(this.view, null, item);
  }

  // Selects a thing and brings it into view
  reveal(id) {
    const v = this.view;
    const it = v?.page?.items.find((x) => x.id === id);
    if (!it) return;
    v.setTool("select");
    v.setSelection([id]);
    const b = v.selectionBox();
    if (b) {
      const z = Math.max(0.6, Math.min(v.zoom, 1.4));
      v.setZoom(z);
      v.centerOn((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    }
    v.container.focus({ preventScroll: true });
  }

  // ---------- The board and the store ----------
  bindStore() {
    board.on("doc", () => (this.renderPages(), this.syncTitle(), this.inspector.render({ force: true }), this.syncEmpty()));
    board.on("page", () => (this.renderPages(), this.syncTitle(), this.syncEmpty()));
    board.on("change", (c) => {
      this.renderPages();
      this.syncTitle();
      this.syncEmpty();
      if (this.view?.selection.size) this.inspector.render();
    });
    board.on("remote", (r) => this.onRemote(r));
    board.on("status", () => this.syncStatus());
    board.on("reveal", () => (this.syncStatus(), this.syncEmpty()));
    board.on("cue", (cue) => this.onCue(cue));
    const title = el("whiteboard-title-text");
    title?.addEventListener("dblclick", () => this.renameBoard());
    title?.setAttribute("title", t("Double-click to rename"));
    document.addEventListener("keydown", (e) => this.onKey(e), true);
  }

  // Ctrl+P (commands) and Ctrl+O (boards) while this page is showing
  onKey(e) {
    if (!this.shown || document.body.dataset.view !== "whiteboard") return;
    if (document.querySelector(".modal-backdrop:not([hidden]), .rw-palette-backdrop, #voice-mode:not([hidden])")) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const key = e.key.toLowerCase();
    if (key === "p") {
      e.preventDefault();
      openPalette(this, "commands");
    } else if (key === "o") {
      e.preventDefault();
      openPalette(this, "boards");
    }
  }

  syncStatus() {
    if (!this.status) return;
    const bits = [];
    if (board.status === "offline") bits.push(h("span", { class: "wb-chip warn" }, t("Can't reach Friends. Your changes are kept and sent when it's back.")));
    if (board.writing) bits.push(h("span", { class: "wb-chip live" }, h("i", { class: "wb-dot" }), t("The robot is writing…")));
    this.status.replaceChildren(...bits);
    this.robotWin?.setStatus(board.writing ? t("Drawing…") : t("Ready"), board.writing ? 60000 : 100);
  }

  // Things the robot did, and cues it gives
  onRemote(r) {
    if (r.actor === "user") return;
    const fresh = (r.briefs || []).filter((b) => b.verb !== "moved");
    if (fresh.length) {
      const b = fresh[0];
      announce(t("The robot changed the whiteboard: {what}", { what: `${b.verb} ${b.type || ""} ${b.label || ""}`.trim() }));
    }
    this.robotWin?.setStatus(r.briefs?.some((b) => b.verb === "cleared") ? t("Wiped the board") : t("Just drew something"));
  }

  onCue(cue) {
    const v = this.view;
    if (!v) return;
    if (cue.type === "view") {
      if (cue.region) v.fitContent(cue.region);
      else v.fitContent();
    } else if (cue.type === "point_at") {
      this.robotWin?.setStatus(t("Pointing at something"));
      if (wbSettings().followRobot !== false && v.cursorAt === null && Number.isFinite(cue.x)) {
        const s = v.toScreen(cue.x, cue.y);
        if (s.x < 0 || s.y < 0 || s.x > v.width || s.y > v.height) v.centerOn(cue.x, cue.y);
      }
    } else if (cue.type === "looking") this.robotWin?.setStatus(t("Looking at the board"));
  }

  onSettings() {
    this.view?.schedule();
    this.view?.afterChange();
    this.syncInspector();
    this.syncRobotWindow();
    this.robotWin?.syncSettings();
    this.syncEmpty();
    if (this.view && !this.view.selection.size) this.inspector.render();
  }

  // ---------- Elsewhere ----------
  openDock() {
    document.dispatchEvent(new CustomEvent("friends:whiteboard-dock", { detail: { open: true } }));
    document.getElementById("nav-home")?.click();
  }

  // ---------- Saving a copy ----------
  exportPNG() {
    this.view.toBlob("image/png").then((blob) => blob && download(blob, `${safeName(board.doc.title)}.png`));
  }

  exportSVG() {
    const svg = toSVG(board.page, { theme: this.view.theme, title: board.doc.title });
    download(new Blob([svg], { type: "image/svg+xml" }), `${safeName(board.doc.title)}.svg`);
  }

  async exportPDF() {
    const blob = await this.view.toBlob("image/png", { scale: 2, theme: themeOf("classic") });
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const sheet = h("div", { class: "wb-print-sheet" }, h("img", { src: url, alt: board.doc.title }));
    document.body.append(sheet);
    document.body.classList.add("wb-printing");
    const done = () => {
      document.body.classList.remove("wb-printing");
      sheet.remove();
      URL.revokeObjectURL(url);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    sheet.querySelector("img").addEventListener("load", () => window.print());
  }

  exportText() {
    download(new Blob([documentToText(board.doc)], { type: "text/markdown" }), `${safeName(board.doc.title)}.md`);
  }

  exportJSON() {
    download(new Blob([JSON.stringify(board.doc, null, 2)], { type: "application/json" }), `${safeName(board.doc.title)}.board.json`);
  }

  importJSON() {
    const input = h("input", { type: "file", accept: ".json,application/json" });
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) return announce(t("That file is too big for a board."));
      try {
        const doc = JSON.parse(await file.text());
        if (!doc || !Array.isArray(doc.pages)) throw new Error("not a board");
        const made = await board.io.send("POST", "/api/whiteboards", { title: doc.title || file.name.replace(/\.json$/, "") });
        await board.io.send("PUT", `/api/whiteboards/${made.id}`, { ...doc, id: made.id });
        await board.openBoard(made.id);
        announce(t("Opened {title}", { title: doc.title || "" }));
      } catch {
        announce(t("That file isn't a Friends whiteboard."));
      }
    };
    input.click();
  }
}

export const robotPage = new RobotPage();
export const whiteboardPage = robotPage;
// For checking the page by hand or in a test browser: open the app with ?robot-debug
if (new URLSearchParams(location.search).has("robot-debug")) window.friendsRobotPage = robotPage;

document.addEventListener("friends:view", (e) => {
  if (e.detail?.name === "whiteboard") robotPage.show();
  else robotPage.hide();
});
// Opened by address (#whiteboard) before the first "view" event
if (document.body.dataset.view === "whiteboard") robotPage.show();

