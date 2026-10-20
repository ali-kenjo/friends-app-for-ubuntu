// ---------- Settings → AI & privacy → Answers ----------
// Which AI answers (the routing mode and its rules), the AI for small jobs, how it thinks, and the limits. Most of it is
// plain settings that bind themselves (data-setting, store.js); this adds what they say, and the list of AIs to pick from.
import { getSettings, onSettings, updateSettings } from "./store.js";
import { t, tp } from "./i18n.js";
import { h } from "./h.js";

const $ = (id) => document.getElementById(id);

// ----- Which AI answers -----
const MODE_TEXT = {
  fixed: t("Every message goes to the one AI you pick in the model menu."),
  auto: t("Short and ordinary messages go to a local AI; the cloud AI takes what a local one can't (below). If one fails, the other answers."),
  dynamic: t("Like Auto, and it reacts to how things are going: a local AI that is slow or fails is replaced by the cloud for a while, a cloud AI that is down by the local one."),
  fastest: t("Asks the local and the cloud AI at once, and the first one to start answering wins; the other is cancelled."),
  local: t("Only an AI on this computer answers."),
  cloud: t("Only a cloud AI (Gemini, ChatGPT, Claude…) answers."),
};
const routingOptions = $("routing-options");
const isPrivate = () => getSettings()?.privacy?.localOnly === true;

function renderRouting() {
  const mode = isPrivate() ? "local" : getSettings()?.routing?.mode || "fixed";
  $("routing-mode-desc").textContent = isPrivate() ? t("Private mode is on, so only a local AI answers.") : MODE_TEXT[mode];
  routingOptions.querySelectorAll("[data-for]").forEach((el) => el.classList.toggle("is-inactive", !el.dataset.for.split(" ").includes(mode)));
  // The fine rules are only worth showing for the modes that use them
  $("routing-advanced").hidden = !routingOptions.querySelector("#routing-advanced [data-for]:not(.is-inactive)");
}
onSettings(renderRouting);

// ----- The AI for small jobs: any AI in the list -----
const taskSelect = $("task-brain");
function renderTaskBrains({ brains }) {
  const wanted = getSettings()?.routing?.taskBrain || 0;
  taskSelect.replaceChildren(h("option", { value: "0", text: t("Chosen by the mode") }), ...brains.filter((b) => b.enabled).map((b) => h("option", { value: String(b.id), text: `${b.name} (${b.model})` })));
  taskSelect.value = brains.some((b) => b.id === wanted && b.enabled) ? String(wanted) : "0";
}
document.addEventListener("friends:brains-changed", (e) => renderTaskBrains(e.detail));

// ----- How it thinks -----
const reasoningGrid = $("reasoning-effort-grid");
const contextValLabel = $("context-val-label");

reasoningGrid.addEventListener("click", (e) => {
  const choice = e.target.closest("[data-effort]");
  if (!choice) return;
  updateSettings((s) => {
    s.aiControl ||= {};
    s.aiControl.reasoningEffort = choice.dataset.effort;
  });
});

$("context-window-slider").addEventListener("input", (e) => {
  contextValLabel.textContent = tp("{n} message", "{n} messages", Number(e.target.value));
});

onSettings((s) => {
  const ai = s.aiControl || {};
  reasoningGrid.querySelectorAll("[data-effort]").forEach((btn) => {
    const on = btn.dataset.effort === (ai.reasoningEffort || "balanced");
    btn.classList.toggle("selected", on);
    btn.setAttribute("aria-checked", String(on));
  });
  if (ai.contextWindow) contextValLabel.textContent = tp("{n} message", "{n} messages", ai.contextWindow);
});
