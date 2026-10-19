// ---------- The three places: Talk, Missions, Today ----------
// The main surface has only three destinations. Home (Talk) is the companion: the robot, the
// conversation and the message box. Missions is everything the assistant does in the background.
// Today is your day. Everything else lives in Settings.
//
// This module owns which one is showing, the sidebar's highlight, and the address:
//   #today  #missions  #missions/<id>  #voice  #chat/<id>  #settings  #home (or nothing)
// (The tray and notifications of the desktop app go to these, see electron/desktop.js.)
// It never imports the parts it opens: it says what's wanted with events, and they listen.
import { t } from "./i18n.js";
import { announce } from "./a11y.js";

const VIEWS = {
  home: { el: () => document.getElementById("main"), nav: "nav-home", title: () => t("Talk") },
  missions: { el: () => document.getElementById("view-missions"), nav: "nav-missions", title: () => t("Missions"), heading: "missions-title" },
  today: { el: () => document.getElementById("view-today"), nav: "today-open", title: () => t("Today"), heading: "life-title" },
};

let current = "home";
let first = true;
const coarse = matchMedia("(pointer: coarse)");

export const currentView = () => current;
export const isView = (name) => current === name;

const fire = (name, detail) => document.dispatchEvent(new CustomEvent(`friends:${name}`, { detail }));

// The address for a view: nothing for Home, #today, #missions or #missions/<id>
const hashFor = (name, detail = "") => (name === "home" ? "" : name === "missions" && detail ? `#missions/${detail}` : `#${name}`);

function setHash(name, detail) {
  const wanted = hashFor(name, detail);
  if (location.hash === wanted) return;
  const url = location.pathname + location.search + wanted;
  // A step in the browser's history, so Back goes to where you were
  if (wanted) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
}

// options.detail: e.g. a mission's id; options.focus: move the keyboard to the new place (default)
export function showView(name, { detail = "", focus = true, updateHash = true } = {}) {
  if (!VIEWS[name]) name = "home";
  const changed = name !== current;
  for (const [key, view] of Object.entries(VIEWS)) {
    const el = view.el();
    if (el) el.hidden = key !== name;
    const nav = document.getElementById(view.nav);
    if (nav) {
      nav.classList.toggle("active", key === name);
      if (key === name) nav.setAttribute("aria-current", "page");
      else nav.removeAttribute("aria-current");
    }
  }
  document.body.dataset.view = name;
  if (updateHash) setHash(name, detail);
  current = name;
  if (changed || detail) fire("view", { name, detail });
  if (changed && !first) {
    announce(VIEWS[name].title());
    if (focus) {
      if (VIEWS[name].heading) document.getElementById(VIEWS[name].heading)?.focus({ preventScroll: true });
      else if (!coarse.matches) document.getElementById("composer-input")?.focus({ preventScroll: true });
    }
  }
  first = false;
}

// Follows the address: the first load, the back button, and the desktop app's tray
function follow() {
  const hash = location.hash;
  const chat = hash.match(/^#chat\/([\w-]+)$/);
  const mission = hash.match(/^#missions\/([\w-]+)$/);
  if (hash === "#today") showView("today", { updateHash: false });
  else if (hash === "#missions" || mission) showView("missions", { updateHash: false, detail: mission?.[1] || "" });
  else if (hash === "#voice") {
    history.replaceState(null, "", location.pathname + location.search);
    showView("home", { updateHash: false });
    fire("open-voice");
  } else if (chat) {
    showView("home", { updateHash: false });
    fire("open-chat", { id: chat[1] });
  } else if (hash === "#settings") {
    history.replaceState(null, "", location.pathname + location.search);
    fire("open-settings", {});
  } else {
    showView("home", { updateHash: false });
    if (hash) history.replaceState(null, "", location.pathname + location.search);
  }
}

for (const [name, view] of Object.entries(VIEWS)) {
  document.getElementById(view.nav)?.addEventListener("click", (e) => {
    e.preventDefault();
    showView(name);
  });
}
document.getElementById("brand")?.addEventListener("click", (e) => {
  e.preventDefault();
  showView("home");
});
// Alt+1, Alt+2, Alt+3: Talk, Missions, Today (not while a dialog or voice mode is open)
document.addEventListener("keydown", (e) => {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const name = { Digit1: "home", Digit2: "missions", Digit3: "today" }[e.code];
  if (!name || document.querySelector(".modal-backdrop:not([hidden]), .search-backdrop:not([hidden]), #voice-mode:not([hidden])")) return;
  e.preventDefault();
  showView(name);
});
window.addEventListener("hashchange", follow);
window.addEventListener("popstate", follow);

// Called by app.js once every part of the page is loaded and listening
export function startViews() {
  follow();
}
