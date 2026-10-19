// ---------- Missions ----------
// Everything the assistant does for you in the background. (The place itself is in index.html;
// views.js shows it. The engine is server/missions/.)
import { t } from "../i18n.js";
import { icon } from "../icons.js";

const root = document.getElementById("missions-root");

const EXAMPLES = [
  { icon: "globe", text: t("Research the three best budget laptops for video editing and write me a short report") },
  { icon: "folder", text: t("Sort my Downloads folder into folders by type") },
  { icon: "code", text: t("Build a small command-line to-do app in Node.js, with tests, and commit it") },
];

function empty() {
  const box = document.createElement("div");
  box.className = "empty-state";
  box.innerHTML = `<span class="empty-icon">${icon("missions", { size: 28 })}</span>
    <h2 class="empty-title"></h2>
    <p class="empty-text"></p>
    <div class="empty-examples"></div>`;
  box.querySelector(".empty-title").textContent = t("Give me a goal");
  box.querySelector(".empty-text").textContent = t("I make a plan, you approve it once, and I get it done in the background. You can stop me at any time.");
  const list = box.querySelector(".empty-examples");
  for (const example of EXAMPLES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "prompt-chip";
    b.innerHTML = icon(example.icon, { size: 15 });
    b.append(document.createTextNode(` ${example.text}`));
    list.append(b);
  }
  return box;
}

root.replaceChildren(empty());
