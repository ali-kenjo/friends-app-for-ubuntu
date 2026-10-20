// Sections inside a Settings section: <div class="subtabs" role="tablist"> with buttons data-subtab="x", and the parts
// <div class="subpane" data-subpane="x">. Arrow keys move between them. A part that isn't showing is hidden by its class (not
// by the hidden attribute), so finding a setting (settings.js) still reaches it and revealSubpane() opens it first.
const bars = () => [...document.querySelectorAll(".subtabs")];
const tabsOf = (bar) => [...bar.querySelectorAll(".subtab")];
const panesOf = (bar) => [...(bar.closest(".pane, .ai-overview, .view") || document).querySelectorAll(".subpane")];

export function showSubtab(bar, name, { focus = false } = {}) {
  for (const tab of tabsOf(bar)) {
    const on = tab.dataset.subtab === name;
    tab.classList.toggle("active", on);
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    if (on && focus) tab.focus();
  }
  for (const pane of panesOf(bar)) pane.classList.toggle("active", pane.dataset.subpane === name);
  document.dispatchEvent(new CustomEvent("friends:subtab", { detail: { name } }));
}

// Opens the part that holds `el` (a setting found by the search, or a link into it)
export function revealSubpane(el) {
  const pane = el?.closest?.(".subpane");
  if (!pane || pane.classList.contains("active")) return;
  const bar = bars().find((b) => tabsOf(b).some((t) => t.dataset.subtab === pane.dataset.subpane));
  if (bar) showSubtab(bar, pane.dataset.subpane);
}

for (const bar of bars()) {
  bar.addEventListener("click", (e) => {
    const tab = e.target.closest(".subtab");
    if (tab) showSubtab(bar, tab.dataset.subtab);
  });
  bar.addEventListener("keydown", (e) => {
    const all = tabsOf(bar);
    const at = all.indexOf(document.activeElement);
    if (at < 0) return;
    const rtl = getComputedStyle(bar).direction === "rtl";
    const next = { ArrowRight: at + (rtl ? -1 : 1), ArrowLeft: at + (rtl ? 1 : -1), Home: 0, End: all.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    showSubtab(bar, all[(next + all.length) % all.length].dataset.subtab, { focus: true });
  });
}
