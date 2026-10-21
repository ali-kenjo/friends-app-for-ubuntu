// ---------- First run ----------
// A new person meets the companion first: the robot and a greeting. Until an AI is set up, a short
// guide under them looks for an AI on this computer (and offers it with one click), or takes a free
// Gemini key. "Not now" hides it; the status line under the message box brings it back. Once an AI
// answers, a card says that Missions exist (once).
import { api } from "./api.js";
import { getSettings, onSettings, updateSettings, flushSettings } from "./store.js";
import { announce } from "./a11y.js";
import { t, tp } from "./i18n.js";
import { showView } from "./views.js";
import { playCelebrationSound } from "./sounds.js";

const main = document.getElementById("main");
const card = document.getElementById("onboarding");
const intro = document.getElementById("missions-intro");
const soundsIntro = document.getElementById("sounds-intro");
const status = document.getElementById("onb-local-status");
const actions = document.getElementById("onb-local-actions");
const help = document.getElementById("onb-local-help");
const cloudForm = document.getElementById("onb-cloud");
const keyInput = document.getElementById("onb-key");
const cloudSave = document.getElementById("onb-cloud-save");
const cloudError = document.getElementById("onb-cloud-error");
const chip = document.getElementById("ws-status-indicator");

const DEFAULT_CONTEXT = 8192;
let brains = null; // unknown until the helper has told us
let reopened = false; // asked for again after "Not now"
let timer = null;
let busy = false;

const hasAI = () => (brains || []).some((b) => b.enabled);

function shouldShow() {
  const s = getSettings();
  if (!s || brains === null || hasAI()) return false;
  return reopened || !s.onboarding?.done;
}

function sync() {
  const show = shouldShow();
  const was = !card.hidden;
  card.hidden = !show;
  main.classList.toggle("onboarding-open", show); // the robot and the greeting stay; the ideas make room
  if (show && !was) detect();
  if (!show) clearTimeout(timer);
  syncIntro();
}

// The card about Missions (and then a gentle one-time offer for soft UI sounds)
function syncIntro() {
  const s = getSettings();
  const baseReady = Boolean(s) && brains !== null && hasAI() && card.hidden && s.onboarding?.done === true && !main.classList.contains("has-chat");
  const showMissions = baseReady && s.onboarding?.missions !== true;
  intro.hidden = !showMissions;
  if (soundsIntro) {
    const showSounds = baseReady && !showMissions && s.onboarding?.sounds === false && !s.sound?.enabled;
    soundsIntro.hidden = !showSounds;
  }
}
function seenIntro() {
  updateSettings((s) => {
    s.onboarding ||= {};
    s.onboarding.missions = true;
    if (s.onboarding.sounds === undefined) s.onboarding.sounds = false;
  });
  syncIntro();
}
function seenSounds(enable = false) {
  updateSettings((s) => {
    s.onboarding ||= {};
    s.onboarding.sounds = true;
    if (enable) {
      s.sound ||= {};
      s.sound.enabled = true;
    }
  });
  if (enable) playCelebrationSound({ force: true });
  syncIntro();
}
document.getElementById("missions-intro-go").addEventListener("click", () => {
  seenIntro();
  showView("missions");
});
document.getElementById("missions-intro-dismiss").addEventListener("click", () => {
  seenIntro();
  document.getElementById("composer-input").focus();
});
document.getElementById("sounds-intro-enable")?.addEventListener("click", () => {
  seenSounds(true);
  document.getElementById("composer-input").focus();
});
document.getElementById("sounds-intro-dismiss")?.addEventListener("click", () => {
  seenSounds(false);
  document.getElementById("composer-input").focus();
});
new MutationObserver(syncIntro).observe(main, { attributes: true, attributeFilter: ["class"] });

// ----- An AI on this computer -----
async function detect() {
  clearTimeout(timer);
  let servers = [];
  try {
    servers = (await api.local.servers()).servers.filter((s) => s.running);
  } catch {}
  renderLocal(servers);
  // Maybe they're starting one right now: look again every few seconds while the guide is up
  if (!card.hidden) timer = setTimeout(detect, 5000);
}

function renderLocal(servers) {
  if (busy) return;
  actions.replaceChildren();
  const models = servers.flatMap((server) => server.models.slice(0, 4).map((model) => ({ server, model })));
  help.hidden = models.length > 0;
  if (!servers.length) {
    status.textContent = t("No AI found on this computer yet.");
    const again = button(t("Look again"), "btn", detect);
    actions.append(again);
    return;
  }
  if (!models.length) {
    status.textContent = t("{name} is running but has no model yet. Run ollama pull llama3.2 in a terminal.", { name: servers[0].label });
    actions.append(button(t("Look again"), "btn", detect));
    return;
  }
  const names = [...new Set(servers.map((s) => s.label))].join(", ");
  status.textContent = tp("Found {name} with {n} model.", "Found {name} with {n} models.", models.length, { name: names });
  models.forEach(({ server, model }, i) => {
    const label = model.replace(/:latest$/, "");
    actions.append(button(t("Use {model}", { model: label }), i === 0 ? "btn btn-primary" : "btn", (e) => useLocal(server, model, e.currentTarget)));
  });
}

function button(text, className, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

async function useLocal(server, model, el) {
  busy = true;
  const label = el.textContent;
  el.disabled = true;
  el.textContent = t("Loading…"); // the first request loads the model, which can take a moment
  try {
    const data = { provider: "local", protocol: server.protocol, name: model.replace(/:latest$/, ""), baseUrl: server.url, model };
    if (server.protocol === "ollama") data.contextSize = DEFAULT_CONTEXT;
    done(await api.brains.save(data), data.name);
  } catch (err) {
    status.textContent = err.message;
    el.disabled = false;
    el.textContent = label;
  } finally {
    busy = false;
  }
}

// ----- A cloud AI: the key says which service it is -----
cloudForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const key = keyInput.value.trim();
  if (!key) return;
  cloudError.hidden = true;
  cloudSave.disabled = true;
  cloudSave.textContent = t("Checking the key…");
  try {
    const found = await api.services.recognise(key);
    const id = found.certain ? found.matches[0] : "gemini"; // a key that looks like nothing is tried as Gemini's, as before
    if (found.kind === "key" && !found.certain && found.matches.length) {
      // Could be several services: Settings asks which
      document.dispatchEvent(new CustomEvent("friends:open-settings", { detail: { tab: "ai-control" } }));
      document.dispatchEvent(new CustomEvent("friends:add-ai", { detail: { key, candidates: found.matches } }));
      keyInput.value = "";
      return;
    }
    const entry = (await api.services.list()).cloud.find((s) => s.id === id);
    const brain = id === "gemini" ? { provider: "gemini", name: "Gemini", model: "", key } : { provider: "openai", service: id, name: entry?.label, model: "", key };
    done(await api.brains.save(brain), entry?.label || "Gemini");
    keyInput.value = "";
  } catch (err) {
    cloudError.textContent = t(err.message);
    cloudError.hidden = false;
  } finally {
    cloudSave.disabled = false;
    cloudSave.textContent = t("Connect");
  }
});

// ----- Done, or later -----
function done(state, name) {
  brains = state.brains || [];
  // brains.js owns the list in Settings and the model menu: hand it the new state
  document.dispatchEvent(new CustomEvent("friends:brains-apply", { detail: state }));
  updateSettings((s) => {
    s.onboarding ||= {};
    s.onboarding.done = true;
    s.onboarding.sounds = false;
  });
  flushSettings();
  reopened = false;
  sync();
  announce(t("{name} is ready. Say hello.", { name }));
  document.getElementById("composer-input").focus();
}

document.getElementById("onb-skip").addEventListener("click", () => {
  updateSettings((s) => {
    s.onboarding ||= {};
    s.onboarding.done = true;
    s.onboarding.sounds = false;
  });
  reopened = false;
  sync();
  document.getElementById("composer-input").focus();
});

// The status line, or a message that found no AI, brings the guide back
export function openOnboarding() {
  reopened = true;
  sync();
  card.scrollIntoView({ block: "center" });
  (card.querySelector("#onb-local-actions .btn-primary") || keyInput).focus({ preventScroll: true });
}
export const onboardingShowing = () => !card.hidden;

chip.addEventListener("click", () => {
  if (!hasAI()) openOnboarding();
  else document.getElementById("model-picker").click();
});
document.addEventListener("friends:onboarding-open", openOnboarding);

document.addEventListener("friends:brains-changed", (e) => {
  brains = e.detail.brains || [];
  sync();
});
onSettings(sync);
