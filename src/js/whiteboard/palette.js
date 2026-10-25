// ---------- Find anything: commands and boards ----------
// Ctrl+P lists everything you can do (tools, layouts, roles, exports, panels…) and runs it; Ctrl+O jumps to a board
// by name, or makes one. Type to narrow it down, arrow keys and Enter to choose, Esc to leave.
import { h } from "../h.js";
import { t } from "../i18n.js";
import { announce } from "../a11y.js";
import { board } from "./store.js";
import { TOOLS } from "./tools.mjs";
import { TEMPLATE_NAMES, TEMPLATE_TITLES } from "./templates.mjs";
import { STUDIO } from "./studio.mjs";
import { allRoles } from "../robot/roles.mjs";
import { getSettings } from "../store.js";
import { chooseRole, roleName } from "./robotwin.js";
import { wbIcon } from "./wb-icons.js";
import { ago } from "./controls.js";

const norm = (s) => String(s || "").toLowerCase();

// Every word you typed must be somewhere in it; matches at the start rank higher
function rank(entries, query) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return entries;
  return entries
    .map((e) => {
      const hay = norm(`${e.label} ${e.keywords || ""} ${e.group || ""}`);
      if (!words.every((w) => hay.includes(w))) return null;
      return { e, score: (norm(e.label).startsWith(words[0]) ? 0 : 1) + (hay.indexOf(words[0]) / 1000) };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score)
    .map((x) => x.e);
}

export function commandsFor(ui) {
  const list = [];
  const add = (group, label, run, { icon, hint = "", keywords = "" } = {}) => list.push({ group, label, run, icon, hint, keywords });
  for (const tool of TOOLS) add(t("Tools"), `${t("Tool")}: ${t(tool.label)}`, () => ui.view?.setTool(tool.id), { icon: tool.id === "select" ? "select" : tool.id, hint: tool.key.toUpperCase(), keywords: t(tool.hint) });
  for (const name of TEMPLATE_NAMES) add(t("Layouts"), `${t("Layout")}: ${t(TEMPLATE_TITLES[name] || name)}`, () => ui.openLayout(name), { icon: "template" });
  for (const s of STUDIO) add(t("Create with the robot"), `${t("Create")}: ${t(s.label)}`, () => ui.robotWin.ask(t(s.prompt)), { icon: s.icon, keywords: t(s.hint) });
  for (const role of allRoles(getSettings().roles)) add(t("Roles"), `${t("Role")}: ${roleName(role)}`, () => chooseRole(role.id), { icon: role.icon || "star", keywords: role.custom ? role.tagline : t(role.tagline) });
  const panel = (id, label, icon) => add(t("Panels"), label, () => ui.openPanel(id), { icon });
  panel("boards", t("Show the boards"), "boards");
  panel("outline", t("Show the outline"), "outline");
  panel("sources", t("Show the sources"), "sources");
  panel("shapes", t("Show the shapes"), "shapes");
  panel("layouts", t("Show the layouts"), "template");
  add(t("Panels"), t("Show or hide the options panel"), () => ui.toggleInspector(), { icon: "sliders" });
  add(t("Panels"), t("Show or hide the robot's window"), () => ui.setRobotWindow(!ui.robotWin.win.visible), { icon: "robot" });
  add(t("Panels"), t("Put the robot's window back where it started"), () => ui.robotWin.win.reset(), { icon: "undo" });
  add(t("View"), t("Show everything on this page"), () => ui.view?.fitContent(), { icon: "fit" });
  add(t("View"), t("Show the whole board"), () => ui.view?.fitBoard(), { icon: "grid" });
  add(t("View"), t("Zoom in"), () => ui.view?.setZoom(ui.view.zoom * 1.25), { icon: "zoomIn" });
  add(t("View"), t("Zoom out"), () => ui.view?.setZoom(ui.view.zoom / 1.25), { icon: "zoomOut" });
  add(t("View"), t("Zoom to 100%"), () => ui.view?.setZoom(1), { icon: "search" });
  add(t("Board"), t("New board"), () => ui.newBoard(), { icon: "plus" });
  add(t("Board"), t("Rename this board"), () => ui.renamePrompt(), { icon: "text" });
  add(t("Board"), t("Earlier versions of this board"), () => ui.openHistory(), { icon: "history" });
  add(t("Board"), t("Open a board file…"), () => ui.importJSON(), { icon: "fileUp" });
  add(t("Board"), t("What the robot sees"), () => ui.showWhatItSees(), { icon: "eye" });
  add(t("Board"), t("Take back the robot's last drawing"), () => ui.undoRobot(), { icon: "undo" });
  add(t("Page"), t("New page"), () => board.apply({ op: "page_add", page: { name: `${t("Page")} ${(board.doc?.pages.length || 0) + 1}` } }), { icon: "plus" });
  add(t("Page"), t("Next page"), () => board.setPage(board.pageIndex + 1), { icon: "chevronRight" });
  add(t("Page"), t("Previous page"), () => board.setPage(board.pageIndex - 1), { icon: "chevronLeft" });
  add(t("Save"), t("Save as a picture (PNG)"), () => ui.exportPNG(), { icon: "image" });
  add(t("Save"), t("Save as a drawing (SVG)"), () => ui.exportSVG(), { icon: "export" });
  add(t("Save"), t("Print or save as PDF"), () => ui.exportPDF(), { icon: "export" });
  add(t("Save"), t("Save as text (Markdown)"), () => ui.exportText(), { icon: "export" });
  add(t("Save"), t("Save the whole board (file)"), () => ui.exportJSON(), { icon: "export" });
  add(t("Help"), t("Keyboard shortcuts"), () => ui.showKeys(), { icon: "keyboard" });
  add(t("Help"), t("Settings for the robot"), () => document.dispatchEvent(new CustomEvent("friends:open-settings", { detail: { tab: "robot" } })), { icon: "robot" });
  return list;
}

// mode: "commands" | "boards"
export async function openPalette(ui, mode = "commands") {
  document.querySelector(".rw-palette-backdrop")?.remove();
  const opener = document.activeElement;
  let entries = [];
  let results = [];
  let at = 0;
  const input = h("input", { type: "text", class: "rw-palette-input", role: "combobox", "aria-expanded": "true", "aria-controls": "rw-palette-list", "aria-autocomplete": "list", placeholder: mode === "boards" ? t("Go to a board, or type a name to make one…") : t("Type what you want to do…"), autocomplete: "off", spellcheck: "false" });
  const list = h("div", { class: "rw-palette-list", id: "rw-palette-list", role: "listbox", "aria-label": mode === "boards" ? t("Boards") : t("Commands") });
  const box = h("div", { class: "rw-palette", role: "dialog", "aria-modal": "true", "aria-label": mode === "boards" ? t("Go to a board") : t("Command palette") }, h("div", { class: "rw-palette-head" }, h("span", { html: wbIcon(mode === "boards" ? "boards" : "search", 18) }), input), list, h("div", { class: "rw-palette-foot" }, h("span", {}, "↑↓"), t("choose"), h("span", {}, "Enter"), t("do it"), h("span", {}, "Esc"), t("close")));
  const backdrop = h("div", { class: "rw-palette-backdrop", "data-modal": "" }, box);
  document.body.append(backdrop);
  const close = () => {
    backdrop.remove();
    opener?.focus?.({ preventScroll: true });
  };

  if (mode !== "boards") entries = commandsFor(ui);
  const load = async () => {
    try {
      const boards = await board.boards();
      entries = boards.sort((a, b) => b.updatedAt - a.updatedAt).map((b) => ({ label: b.title === "Main Whiteboard" ? t("Main Whiteboard") : b.title, hint: `${b.pageCount} ${t("pages")} · ${ago(b.updatedAt)}`, icon: "boards", current: b.id === board.doc?.id, run: async () => (await board.openBoard(b.id), announce(t("Opened {title}", { title: b.title }))) }));
    } catch {
      entries = [];
    }
    draw();
  };

  function draw() {
    results = rank(entries, input.value).slice(0, 60);
    if (mode === "boards" && input.value.trim()) {
      const name = input.value.trim().slice(0, 120);
      if (!results.some((r) => norm(r.label) === norm(name))) results.push({ label: t("Make a board called “{name}”", { name }), icon: "plus", run: async () => (await board.createBoard(name), announce(t("Opened {title}", { title: name }))) });
    }
    at = Math.min(at, Math.max(0, results.length - 1));
    let last = "";
    list.replaceChildren(
      ...(results.length
        ? results.flatMap((r, i) => {
            const out = [];
            if (r.group && r.group !== last && !input.value.trim()) out.push(h("div", { class: "rw-palette-group", role: "presentation" }, r.group));
            last = r.group || "";
            out.push(h("div", { class: `rw-palette-item${i === at ? " current" : ""}${r.current ? " open" : ""}`, role: "option", id: `rw-pal-${i}`, "aria-selected": String(i === at), onclick: () => choose(i), onpointermove: () => i !== at && ((at = i), mark()) }, h("span", { class: "rw-row-icon", html: wbIcon(r.icon || "chevronRight", 16) }), h("span", { class: "rw-palette-label", dir: "auto" }, r.label), r.hint ? h("kbd", {}, r.hint) : null));
            return out;
          })
        : [h("p", { class: "wb-empty" }, t("Nothing matches."))])
    );
    input.setAttribute("aria-activedescendant", results.length ? `rw-pal-${at}` : "");
  }

  function mark() {
    list.querySelectorAll(".rw-palette-item").forEach((el) => {
      const i = Number(el.id.replace("rw-pal-", ""));
      el.classList.toggle("current", i === at);
      el.setAttribute("aria-selected", String(i === at));
    });
    input.setAttribute("aria-activedescendant", `rw-pal-${at}`);
    list.querySelector(".current")?.scrollIntoView({ block: "nearest" });
  }

  function choose(i) {
    const r = results[i];
    if (!r) return;
    close();
    setTimeout(() => r.run(), 0);
  }

  input.addEventListener("input", () => ((at = 0), draw()));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") (at = Math.min(results.length - 1, at + 1)), mark();
    else if (e.key === "ArrowUp") (at = Math.max(0, at - 1)), mark();
    else if (e.key === "Enter") choose(at);
    else if (e.key === "Escape") close();
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  backdrop.addEventListener("pointerdown", (e) => e.target === backdrop && close());
  draw();
  input.focus();
  // The boards come from the helper: what you type meanwhile is kept
  if (mode === "boards") await load();
}
