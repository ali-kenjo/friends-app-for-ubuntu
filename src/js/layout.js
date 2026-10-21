// ---------- Layout: sidebar, greeting ----------
import { getSettings, onSettings } from "./store.js";
import { t } from "./i18n.js";
import { announce } from "./a11y.js";
const app = document.querySelector(".app");
const narrow = window.matchMedia("(max-width: 760px)");

// On a computer the sidebar can be hidden (remembered); on a phone it slides in over the page
function setSidebar(open) {
  const sidebar = document.getElementById("sidebar");
  if (narrow.matches) {
    app.classList.toggle("sidebar-open", open);
    // Off screen means off the tab order too; opening moves focus in, closing brings it back to the button
    sidebar.inert = !open;
    if (open) sidebar.querySelector("#new-chat")?.focus();
    else if (sidebar.contains(document.activeElement)) (document.querySelector(".view:not([hidden]) .sidebar-show") || document.getElementById("sidebar-open")).focus();
  } else {
    app.classList.toggle("sidebar-hidden", !open);
    try {
      localStorage.setItem("friends.sidebar", open ? "shown" : "hidden");
    } catch {}
  }
}

try {
  if (localStorage.getItem("friends.sidebar") === "hidden") app.classList.add("sidebar-hidden");
} catch {}

document.getElementById("sidebar-toggle").addEventListener("click", () => setSidebar(false));
// Every place has a button that brings the sidebar back (Talk, Missions and Today each have a top bar)
document.querySelectorAll("#sidebar-open, [data-sidebar-open]").forEach((b) => b.addEventListener("click", () => setSidebar(true)));
document.getElementById("sidebar-backdrop").addEventListener("click", () => setSidebar(false));

// On a phone, close the sidebar after picking something in it
document.querySelector(".sidebar").addEventListener("click", (e) => {
  if (narrow.matches && e.target.closest(".chat-link, #new-chat, #search-open, .nav-item, #brand, #settings-btn, #shortcuts-btn")) setSidebar(false);
});
narrow.addEventListener("change", () => {
  app.classList.remove("sidebar-open");
  document.getElementById("sidebar").inert = narrow.matches;
});
document.getElementById("sidebar").inert = narrow.matches;
// Esc closes the sidebar that slid in over the page
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && narrow.matches && app.classList.contains("sidebar-open") && !document.querySelector(".modal-backdrop:not([hidden]), .search-backdrop:not([hidden])")) setSidebar(false);
});

// "Recent chats" folds the chat list in and out
const chatsNav = document.getElementById("chats-nav");
chatsNav.addEventListener("click", (e) => {
  e.preventDefault();
  const folded = document.getElementById("chat-history").classList.toggle("folded");
  chatsNav.setAttribute("aria-expanded", String(!folded));
  announce(folded ? t("Chats hidden") : t("Chats shown"));
});

// A greeting and subtitle that fit the time of day, streaks, and context
let topStreak = null; // { name, streak }

function greet() {
  const s = getSettings();
  const name = s?.personality.userName?.trim();
  const hour = new Date().getHours();
  const part = hour < 5 ? t("Hello") : hour < 12 ? t("Good morning") : hour < 18 ? t("Good afternoon") : t("Good evening");
  const el = document.getElementById("greeting");
  if (el) {
    el.textContent = name ? t("{greeting}, {name}", { greeting: part, name }) : part;
    const who = s?.characters?.list.find((c) => c.id === s.characters.active);
    el.title = who ? `${who.name}: ${who.tagline}` : "";
  }
  const sub = document.getElementById("home-sub");
  if (sub) {
    if (topStreak && topStreak.streak >= 2) {
      sub.textContent = t("{n}-day streak on {habit}. What are we doing today?", { n: topStreak.streak, habit: topStreak.name });
    } else if (hour >= 5 && hour < 12) {
      sub.textContent = t("The kettle's warm. What are we doing today?");
    } else if (hour >= 18 && hour < 22) {
      sub.textContent = t("Golden hour in the room. What's on your mind?");
    } else if (hour >= 22 || hour < 5) {
      sub.textContent = t("A quiet night for thinking, tinkering, or winding down.");
    } else {
      sub.textContent = t("What are we doing today?");
    }
  }
}
greet();
onSettings(greet);
document.addEventListener("friends:language-ready", greet);
document.addEventListener("friends:life-today", (e) => {
  const habits = e.detail?.habits || [];
  const best = [...habits].sort((a, b) => (b.streak || 0) - (a.streak || 0))[0];
  topStreak = best && best.streak >= 2 ? { name: best.name, streak: best.streak } : null;
  greet();
});
setInterval(greet, 10 * 60 * 1000);
