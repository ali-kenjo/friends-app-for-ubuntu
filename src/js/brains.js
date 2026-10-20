// ---------- Settings → AI & privacy → Your AIs ----------
// The list of AIs, adding one (from a pasted key or address, or by picking a service; several models at once), editing
// one (its own settings), what runs on this computer, and local voice. The helper keeps the brains (server/brains.js);
// this draws them and sends what you choose. Answers, Privacy and This computer are ai-answers.js, ai-privacy.js, ai-device.js.
import { api as helper } from "./api.js";
import { getSettings, onSettings } from "./store.js";
import { t, tp, nf } from "./i18n.js";
import { announce } from "./a11y.js";
import { skeleton } from "./ui.js";
import { h } from "./h.js";
import { loadServices, services, cloudService, localService, localByAddress, describe, logo } from "./ai-services.js";

const api = helper.brains;
const DEFAULT_CONTEXT = 8192;

let brains = [];
let loadedBrains = false; // the helper hasn't told us yet: the list shows grey bars, not "No AI yet"
let defaultBrainId = null;
let usage = {}; // today's calls per AI id
let confirmDeleteId = null;
let detected = []; // the AI servers running on this computer
let detecting = false;

const $ = (id) => document.getElementById(id);
const aiOverview = $("ai-overview");
const brainList = $("brain-list");
const listError = $("brain-list-error");
const aiAdd = $("ai-add");
const form = $("ai-form");
const formError = $("ai-form-error");
const saveBtn = $("ai-form-save");

const ICONS = {
  star: '<svg viewBox="0 0 24 24"><polygon points="12 3 14.8 8.8 21 9.6 16.5 14 17.6 20.2 12 17.2 6.4 20.2 7.5 14 3 9.6 9.2 8.8"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><line x1="13.5" y1="6.5" x2="17.5" y2="10.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><polyline points="4 7 20 7"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>',
  lightning: '<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  up: '<svg viewBox="0 0 24 24"><polyline points="6 15 12 9 18 15"/></svg>',
  down: '<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>',
  check: '<svg viewBox="0 0 24 24"><polyline points="5 12 10 17 19 7"/></svg>',
};

const icon = (name) => h("span", { class: "ico", html: ICONS[name], "aria-hidden": "true" });

function showError(el, message) {
  if (!el) return;
  el.textContent = message ? t(message) : "";
  el.hidden = !message;
}

// What a brain's list entry says about its credentials or where it runs
function maskKey(brain) {
  if (brain.kind === "local") return String(brain.baseUrl || "").replace(/^https?:\/\//, "").replace(/\/(v1|engines\/v1)$/, "");
  if (brain.service === "custom") return String(brain.baseUrl || "").replace(/^https?:\/\//, "");
  if (!brain.keyHint) return t("No key");
  if (brain.keyHint === "env") return t("System key (Google AI Studio)");
  return "••••" + brain.keyHint;
}

// ---------- The list ----------
function apply(state) {
  loadedBrains = true;
  brains = state.brains || [];
  defaultBrainId = state.defaultBrainId;
  renderBrains();
  updateBanner();
}

// The first-run guide (onboarding.js) added an AI itself
document.addEventListener("friends:brains-apply", (e) => apply(e.detail));

async function refreshUsage() {
  try {
    usage = (await helper.usage.get()).byBrain || {};
    renderBrains();
  } catch {}
}

function updateBanner() {
  const def = brains.find((b) => b.id === defaultBrainId) || brains[0];
  const name = $("ai-active-brain-name");
  const meta = $("ai-active-brain-meta");
  if (!def) {
    name.textContent = t("No AI connected");
    meta.textContent = t("Add an AI below to start chatting");
    return;
  }
  const d = describe(def);
  name.textContent = t("{name} (default)", { name: def.name });
  meta.textContent = `${d.label} · ${def.model} · ${maskKey(def)}`;
}

function usageLine(b) {
  const u = usage[b.id];
  const limit = b.params?.dailyLimit;
  if (!u || !u.calls) return limit ? t("Not used today · limit: {n} a day", { n: nf(limit) }) : t("Not used today");
  const bits = [limit ? t("{n} of {limit} requests today", { n: nf(u.calls), limit: nf(limit) }) : tp("{n} request today", "{n} requests today", u.calls)];
  if (u.avgMs) bits.push(t("{ms} ms on average", { ms: nf(u.avgMs) }));
  if (u.errors) bits.push(tp("{n} failed", "{n} failed", u.errors));
  return bits.join(" · ");
}

function brainRow(b, index) {
  const d = describe(b);
  const isDefault = b.id === defaultBrainId;
  const priv = getSettings()?.privacy?.localOnly === true;
  if (confirmDeleteId === b.id) {
    return h(
      "li",
      { class: "brain confirm", "data-id": b.id },
      h("span", { role: "alert", text: t("Delete {name}?", { name: b.name }) }),
      h("div", { class: "brain-actions" }, h("button", { type: "button", class: "btn", "data-action": "cancel-delete", text: t("Cancel") }), h("button", { type: "button", class: "btn btn-danger", "data-action": "confirm-delete", text: t("Delete") }))
    );
  }
  const u = usage[b.id];
  const act = (action, name, labelText, body, extra = {}) => h("button", { type: "button", class: `icon-btn small ${extra.class || ""}`.trim(), "data-action": action, title: labelText, "aria-label": t("{action}: {name}", { action: labelText, name }), "aria-pressed": extra.pressed, disabled: extra.disabled }, body);
  return h(
    "li",
    { class: `brain${isDefault ? " is-default" : ""}${!b.enabled ? " is-off" : ""}${priv && b.kind !== "local" ? " is-blocked" : ""}`, "data-id": b.id },
    logo(d.label, d.color),
    h(
      "div",
      { class: "brain-info" },
      h("div", { class: "brain-name" }, h("span", { text: b.name }), isDefault ? h("span", { class: "badge", text: t("Default") }) : null, h("span", { class: `tag kind-${b.kind}`, text: b.kind === "local" ? t("On this computer") : t("Cloud") })),
      h("div", { class: "brain-meta", text: `${d.label} · ${b.model} · ${maskKey(b)}` }),
      h("div", { class: `brain-usage${u?.errors ? " has-errors" : ""}`, title: u?.lastError || "", text: usageLine(b) }),
      b.note ? h("div", { class: "brain-note row-desc", text: b.note }) : null
    ),
    h(
      "div",
      { class: "brain-actions" },
      act("test", b.name, t("Test the connection"), icon("lightning")),
      h("input", { type: "checkbox", class: "toggle", "data-action": "toggle", title: isDefault ? t("The default AI stays on") : t("On / off"), "aria-label": t("{name} on", { name: b.name }), checked: b.enabled, disabled: isDefault }),
      act("up", b.name, t("Move up"), icon("up"), { disabled: index === 0 }),
      act("down", b.name, t("Move down"), icon("down"), { disabled: index === brains.length - 1 }),
      act("default", b.name, isDefault ? t("The default AI") : t("Make default"), icon("star"), { class: isDefault ? "star-on" : "", pressed: String(isDefault) }),
      act("edit", b.name, t("Edit"), icon("edit")),
      act("delete", b.name, t("Delete"), icon("trash"), { class: "danger" })
    )
  );
}

function renderBrains() {
  brainList.replaceChildren();
  if (!loadedBrains) {
    brainList.append(skeleton("li"));
    return;
  }
  if (!brains.length) brainList.append(h("li", { class: "brain-empty", text: t("No AI yet. Add one to start chatting.") }));
  else brains.forEach((b, i) => brainList.append(brainRow(b, i)));
  // The model picker in the composer, and the other parts of this section, follow these changes
  document.dispatchEvent(new CustomEvent("friends:brains-changed", { detail: { brains, defaultBrainId } }));
}

// Run a change in the helper, then redraw with the result
async function update(action, { focus } = {}) {
  showError(listError, "");
  try {
    apply(await action());
    if (focus) document.querySelector(`.brain[data-id="${focus.id}"] [data-action="${focus.action}"]:not(:disabled)`)?.focus();
  } catch (err) {
    showError(listError, err.message);
    renderBrains();
  }
}

// Ping / test a single brain
async function testSingleBrain(id, button) {
  const li = button.closest(".brain");
  const meta = li?.querySelector(".brain-meta");
  const original = meta ? meta.textContent : "";
  button.disabled = true;
  if (meta) {
    meta.textContent = t("Testing connection…");
    meta.classList.remove("error");
  }
  try {
    const res = await api.test(id);
    if (meta) {
      meta.textContent = `✓ ${t("{ms} ms latency", { ms: nf(res.latencyMs) })} · ${t("{model} verified", { model: res.model })}`;
      announce(meta.textContent);
    }
  } catch (err) {
    if (meta) {
      meta.textContent = t("Connection error: {message}", { message: t(err.message) });
      meta.classList.add("error");
      announce(meta.textContent, { urgent: true });
    }
  } finally {
    button.disabled = false;
    setTimeout(() => {
      if (meta && (meta.textContent.includes("✓") || meta.classList.contains("error"))) {
        meta.classList.remove("error");
        meta.textContent = original;
      }
    }, 4500);
  }
}

brainList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn || btn.dataset.action === "toggle") return;
  const id = Number(btn.closest(".brain").dataset.id);
  switch (btn.dataset.action) {
    case "test":
      return testSingleBrain(id, btn);
    case "default":
      return update(() => api.setDefault(id));
    case "up":
    case "down":
      return update(() => api.move(id, btn.dataset.action), { focus: { id, action: btn.dataset.action } });
    case "edit":
      return openEdit(id);
    case "delete":
      confirmDeleteId = id;
      break;
    case "cancel-delete":
      confirmDeleteId = null;
      break;
    case "confirm-delete":
      confirmDeleteId = null;
      return update(() => api.remove(id));
  }
  renderBrains();
  if (btn.dataset.action === "delete") document.querySelector(`.brain[data-id="${id}"] [data-action="cancel-delete"]`)?.focus();
});

brainList.addEventListener("change", (e) => {
  if (e.target.dataset.action !== "toggle") return;
  const id = Number(e.target.closest(".brain").dataset.id);
  update(() => api.setEnabled(id, e.target.checked));
});

// The test button in the banner: the default AI
const pingBtn = $("ai-ping-btn");
const pingStatus = $("ai-ping-status");
pingBtn?.addEventListener("click", async () => {
  pingBtn.disabled = true;
  pingBtn.querySelector("span").textContent = t("Pinging…");
  pingStatus.className = "ai-ping-status";
  pingStatus.hidden = false;
  pingStatus.textContent = t("Testing the connection and how fast it answers…");
  try {
    const res = await api.test(defaultBrainId || brains[0]?.id);
    pingStatus.className = "ai-ping-status ok";
    pingStatus.textContent = `✓ ${t("Online · answers in {ms} ms · {model} is ready for chat and voice", { ms: nf(res.latencyMs), model: res.model })}`;
    announce(pingStatus.textContent);
  } catch (err) {
    pingStatus.className = "ai-ping-status error";
    pingStatus.textContent = t("Connection error: {message}", { message: t(err.message) });
    announce(pingStatus.textContent, { urgent: true });
  } finally {
    pingBtn.disabled = false;
    pingBtn.querySelector("span").textContent = t("Test connection");
  }
});

// ---------- On this computer ----------
const localServers = $("local-servers");
const localStatus = $("local-card-status");
const localHelp = $("local-help");

const sameServer = (a, b) => String(a || "").replace(/\/(v1|engines\/v1)$/, "") === String(b || "").replace(/\/(v1|engines\/v1)$/, "");
const hasModel = (server, model) => brains.some((b) => b.provider === "local" && sameServer(b.baseUrl, server.url) && b.model.replace(/:latest$/, "") === model.replace(/:latest$/, ""));

function renderLocal() {
  localServers.replaceChildren();
  const running = detected.filter((s) => s.running);
  localHelp.hidden = running.length > 0 || detecting;
  localStatus.textContent = detecting ? t("Looking for AI model servers…") : running.length ? t("{names} found. Add a model with one click.", { names: running.map((s) => s.label).join(", ") }) : t("No local AI server is running.");

  for (const server of running) {
    const fresh = server.models.filter((m) => !hasModel(server, m));
    const models = h("div", { class: "local-models" });
    if (!server.models.length) models.append(h("span", { class: "row-desc", text: server.protocol === "ollama" ? t("No models yet. Run: ollama pull llama3.2") : t("No model is loaded yet. Load one in the server.") }));
    for (const model of server.models) {
      const chip = h("span", { class: "local-model" }, h("span", { text: model }));
      if (hasModel(server, model)) chip.append(h("span", { class: "added", text: t("✓ Added") }));
      else {
        const add = h("button", { type: "button", class: "btn", text: t("Add"), "aria-label": t("Add {model}", { model }) });
        add.addEventListener("click", () => addDetected(server, [model], add));
        chip.append(add);
      }
      models.append(chip);
    }
    const head = h("div", { class: "local-server-name" }, h("span", { class: "dot" }), h("span", { class: "label", text: server.label }), h("span", { class: "meta", text: `${tp("{n} model", "{n} models", server.models.length)} · ${server.url.replace(/^https?:\/\//, "")}` }));
    if (fresh.length > 1) {
      const all = h("button", { type: "button", class: "btn small", text: tp("Add all {n}", "Add all {n}", fresh.length) });
      all.addEventListener("click", () => addDetected(server, fresh, all));
      head.append(all);
    }
    localServers.append(h("div", { class: "local-server" }, head, models));
  }
}

async function addDetected(server, models, button) {
  button.disabled = true;
  button.textContent = t("Loading…"); // the first request loads the model, which can take a moment
  showError(listError, "");
  try {
    const hw = await hardwareHints();
    const base = { provider: "local", protocol: server.protocol, baseUrl: server.url };
    if (server.protocol === "ollama") Object.assign(base, { contextSize: hw.contextSize || DEFAULT_CONTEXT, keepAlive: hw.keepAlive || 0 });
    if (models.length === 1) apply(await api.save({ ...base, name: models[0].replace(/:latest$/, ""), model: models[0] }));
    else {
      const result = await api.bulk({ ...base, models });
      apply(result.state);
      if (result.failed.length) showError(listError, t("{n} could not be added: {first}", { n: result.failed.length, first: `${result.failed[0].model}: ${t(result.failed[0].error)}` }));
    }
  } catch (err) {
    showError(listError, err.message);
    button.disabled = false;
    button.textContent = t("Add");
  }
}

async function detectLocal() {
  if (detecting) return;
  detecting = true;
  renderLocal();
  try {
    detected = (await helper.local.servers()).servers;
  } catch {
    detected = [];
  }
  detecting = false;
  renderLocal();
}

// What this computer suggests for a new Ollama AI (hardware.js decides; the page asks once a minute at most)
let hintsAt = 0;
let hints = {};
async function hardwareHints() {
  if (Date.now() - hintsAt < 60000) return hints;
  try {
    const hw = await helper.hardware.get();
    hints = { contextSize: hw.effective.contextSize, keepAlive: hw.effective.keepAliveMinutes, suggested: ["general", "coding", "embeddings"].map((r) => hw.suggestions[r]?.model).filter(Boolean) };
    hintsAt = Date.now();
  } catch {}
  return hints;
}

// ---------- Local voice (listening and speaking on this computer) ----------
const voiceStatus = $("local-voice-status");
const voiceBtn = $("local-voice-btn");
let voicePoll = null;

function renderVoice(s) {
  voiceBtn.hidden = false;
  voiceBtn.disabled = false;
  if (s.installing) {
    voiceStatus.textContent = t("Setting up… {step} (a few minutes, once)", { step: s.step || "" });
    voiceBtn.textContent = t("Setting up…");
    voiceBtn.disabled = true;
  } else if (s.installed) {
    voiceStatus.textContent = t("Ready. Listens (Whisper) and speaks (Piper) in English, German and Arabic. It starts when you talk and stops when idle.");
    voiceBtn.hidden = true;
  } else {
    voiceStatus.textContent = s.error || t("Talk to a local AI and hear it answer, all on this computer. One-time download of about {size} GB.", { size: nf(s.sizeMb / 1000, { maximumFractionDigits: 1 }) });
    voiceBtn.textContent = s.error ? t("Try again") : t("Set up");
  }
}

async function refreshVoice() {
  try {
    const s = await helper.local.voice();
    renderVoice(s);
    if (s.installing && !voicePoll) voicePoll = setInterval(refreshVoice, 2000);
    if (!s.installing && voicePoll) {
      clearInterval(voicePoll);
      voicePoll = null;
    }
  } catch {}
}

voiceBtn.addEventListener("click", async () => {
  voiceBtn.disabled = true;
  try {
    renderVoice(await helper.local.installVoice());
    refreshVoice();
  } catch (err) {
    voiceStatus.textContent = t(err.message);
    voiceBtn.disabled = false;
  }
});

$("local-refresh").addEventListener("click", () => {
  detectLocal();
  refreshVoice();
});
window.addEventListener("focus", () => {
  if (!aiOverview.hidden && aiOverview.offsetParent) detectLocal();
});

// ---------- Adding and editing ----------
// The form works in two ways: adding (pick a service, connect, tick models) and editing (one AI, one model).
let editing = null; // the brain being edited, or null while adding
let chosen = null; // { id, kind: "cloud" | "local", entry }: the service being connected
let modelNames = []; // what the service or server listed
let ticked = new Set();
let modelsRequest = 0;
let heldKey = ""; // a key pasted in the box above, kept until its service is picked

const pickView = $("ai-pick");
const providerOf = (c) => (c.id === "gemini" ? "gemini" : c.kind === "local" ? "local" : "openai");
const protocolOf = (c) => (c.kind === "local" ? c.entry.protocol || "openai" : undefined);

function openAdd({ service = null, kind = null, key = "", baseUrl = "", candidates = null } = {}) {
  editing = null;
  heldKey = key;
  aiOverview.hidden = true;
  aiAdd.hidden = false;
  $("ai-add-title").textContent = t("Add an AI");
  $("ai-add-result").hidden = true;
  showError(formError, "");
  loadServices().then(() => {
    const cloud = service ? cloudService(service) : null;
    const local = service ? localService(service) : null;
    const entry = kind === "local" ? local : kind === "cloud" ? cloud : cloud || local;
    if (entry) chooseService(entry, entry === local ? "local" : "cloud", { key, baseUrl });
    else showPicker(candidates);
  });
  aiAdd.scrollIntoView({ block: "start" });
}

function showPicker(candidates = null) {
  chosen = null;
  form.hidden = true;
  pickView.hidden = false;
  const note = $("service-none");
  note.hidden = true;
  renderTiles(candidates);
  $("ai-search").value = "";
  $("ai-search").focus();
}

function tile(entry, kind, { running = false, hint = false } = {}) {
  const b = h("button", { type: "button", class: `service-tile${hint ? " hint" : ""}`, "data-id": entry.id, "data-kind": kind, "aria-label": `${entry.label}: ${t(entry.about || "")}` }, logo(entry.label, entry.color || "#3fa56b", "service-logo"), h("span", { class: "service-text" }, h("span", { class: "service-name", text: entry.label }), h("span", { class: "service-sub", text: kind === "local" ? (entry.custom ? t("Give its address") : running ? t("Running now") : entry.about ? t(entry.about) : "") : t(entry.company || "") })));
  b.addEventListener("click", () => chooseService(entry, kind, { key: heldKey }));
  return b;
}

function renderTiles(candidates = null) {
  const cat = services();
  if (!cat) return;
  const q = $("ai-search").value.trim().toLowerCase();
  const matches = (e) => !q || `${e.label} ${e.company || ""} ${e.about || ""}`.toLowerCase().includes(q);
  const running = new Set(detected.filter((s) => s.running).map((s) => s.id));
  const local = cat.local.filter(matches);
  const cloud = cat.cloud.filter(matches);
  // A key that could be several services' puts those first
  const first = new Set(candidates || []);
  const sortedCloud = [...cloud].sort((a, b) => Number(first.has(b.id)) - Number(first.has(a.id)));
  $("service-grid-local").replaceChildren(...local.sort((a, b) => Number(running.has(b.id)) - Number(running.has(a.id))).map((e) => tile(e, "local", { running: running.has(e.id) })));
  $("service-grid-cloud").replaceChildren(...sortedCloud.map((e) => tile(e, "cloud", { hint: first.has(e.id) })));
  $("service-none").hidden = local.length + cloud.length > 0;
  if (candidates?.length) $("ai-add-result").hidden = true;
}
$("ai-search").addEventListener("input", () => renderTiles());
document.addEventListener("friends:services-ready", () => !pickView.hidden && renderTiles());

async function chooseService(entry, kind, { key = "", baseUrl = "" } = {}) {
  chosen = { id: entry.id, kind, entry };
  const f = form.elements;
  form.reset();
  pickView.hidden = true;
  form.hidden = false;
  showError(formError, "");
  $("ai-add-result").hidden = true;
  const d = { label: entry.label, color: entry.color || "#3fa56b" };
  $("ai-form-head").replaceChildren(logo(d.label, d.color, "service-logo big"), h("div", { class: "ai-form-title" }, h("strong", { text: t("Connect {name}", { name: entry.label }) }), h("span", { class: "row-desc", text: kind === "local" ? t("Runs on this computer or your network") : t(entry.company || "") })));
  $("ai-form-about").textContent = t(entry.about || "");
  modelsRequest++; // an answer still on its way for the one before is ignored
  $("ai-connect-status").textContent = "";
  $("ai-connect-status").className = "test-feedback";
  f.name.value = "";
  f.name.placeholder = entry.label;
  f.key.value = key;
  f.key.type = "password";

  const local = kind === "local";
  const custom = Boolean(entry.custom);
  // Address: a local server's, or your own service's; a known cloud service has its own
  $("field-baseurl").hidden = !(local || custom);
  f.baseUrl.value = baseUrl || (local ? entry.url || "" : "");
  f.baseUrl.required = local || custom;
  $("baseurl-label").textContent = local ? t("Server address") : t("Service address");
  $("baseurl-desc").textContent = local ? t("Where the server listens. A server on another computer works too.") : t("The address of the service's OpenAI-style API, for example {example}", { example: "https://api.example.com/v1" });
  // Key
  const keyless = local || entry.id === "custom";
  $("field-key").hidden = false;
  $("key-label").textContent = keyless ? t("API key (optional)") : t("API key");
  f.key.required = !keyless;
  f.key.placeholder = keyless ? t("Usually none") : entry.keyHint || t("Paste your API key");
  const desc = $("key-desc");
  desc.replaceChildren();
  if (keyless) desc.append(local ? t("Most local servers need none. Leave empty unless yours asks for one.") : t("Leave empty if the service needs none."));
  else if (entry.keyUrl) desc.append(t("Get one at"), " ", h("a", { href: entry.keyUrl, target: "_blank", rel: "noopener noreferrer", text: entry.keyUrl.replace(/^https?:\/\//, "") }));
  // Own settings that only some have
  $("ollama-field").hidden = !(local && entry.protocol === "ollama");
  $("speech-field").hidden = !local;
  $("field-models").hidden = true;
  $("models-label").textContent = t("Models");
  $("ai-add-title").textContent = t("Add an AI");
  saveBtn.textContent = t("Add");
  saveBtn.disabled = true;
  modelNames = [];
  ticked = new Set();
  renderModels();
  // Fit a new Ollama AI to this computer
  if (local && entry.protocol === "ollama") {
    const hw = await hardwareHints();
    if (hw.contextSize) f.contextSize.value = String(hw.contextSize);
    if (hw.keepAlive) f.keepAlive.value = String([5, 15, 30, 60, 240, 1440].includes(hw.keepAlive) ? hw.keepAlive : 15);
    $("context-hint").textContent = t("How much of the chat the model sees at once. Friends suggests {n} tokens for this computer.", { n: nf(hw.contextSize || DEFAULT_CONTEXT) });
  }
  // A server with nothing to ask for, or a key that came with the box above: connect at once
  if (local || key || entry.id === "openrouter") connect();
  else f.key.focus();
}

// What the form says about the service, for the helper
const query = () => {
  const f = form.elements;
  const c = chosen;
  const q = { provider: providerOf(c), key: f.key.value.trim() };
  if (c.kind === "local") Object.assign(q, { protocol: protocolOf(c), baseUrl: f.baseUrl.value.trim() });
  else if (q.provider === "openai") Object.assign(q, { service: c.id, baseUrl: f.baseUrl.value.trim() });
  return q;
};

async function connect() {
  const status = $("ai-connect-status");
  const mine = ++modelsRequest;
  const q = query();
  showError(formError, "");
  status.className = "test-feedback";
  status.textContent = t("Connecting…");
  $("ai-connect-go").disabled = true;
  try {
    const models = await api.models(q);
    if (mine !== modelsRequest) return;
    modelNames = models;
    status.className = "test-feedback ok";
    status.textContent = models.length ? `✓ ${tp("{n} model available", "{n} models available", models.length)}` : q.provider === "local" ? t("Connected, but it has no models yet.") : t("Enter your key, then connect.");
    $("field-models").hidden = false;
    ticked = new Set();
    const hw = await hardwareHints();
    const preferred = editing ? [editing.model] : models.length ? [models.find((m) => (hw.suggested || []).some((s) => m === s || m === `${s}:latest`)) || models[0]] : [];
    for (const m of preferred) if (m) ticked.add(m);
    renderModels();
    updateSave();
    if (models.length) announce(status.textContent);
  } catch (err) {
    if (mine !== modelsRequest) return;
    status.className = "test-feedback error";
    status.textContent = "";
    showError(formError, err.message);
    // A server that has no list can still be used by naming the model
    $("field-models").hidden = q.provider !== "local" && q.provider !== "openai";
    renderModels();
    updateSave();
  } finally {
    if (mine === modelsRequest) $("ai-connect-go").disabled = false;
  }
}

$("ai-connect-go").addEventListener("click", connect);
form.elements.key.addEventListener("change", () => {
  if (chosen && form.elements.key.value.trim() && !editing) connect();
});
form.elements.baseUrl.addEventListener("change", () => {
  if (chosen && !$("field-baseurl").hidden && (chosen.kind === "local" || form.elements.key.value.trim() || chosen.entry.custom)) connect();
});

// The list of models: tick several to add (a radio when editing)
const suggestedSet = () => new Set(hints.suggested || []);
function renderModels() {
  const list = $("ai-model-list");
  const q = $("ai-model-filter").value.trim().toLowerCase();
  const single = Boolean(editing);
  const names = modelNames.filter((m) => !q || m.toLowerCase().includes(q));
  const shown = names.slice(0, 200);
  list.replaceChildren(
    ...shown.map((m, i) => {
      const id = `model-${i}`;
      const present = !single && chosen && brains.some((b) => b.model === m && b.provider === providerOf(chosen) && (chosen.kind === "local" ? sameServer(b.baseUrl, form.elements.baseUrl.value) : (b.service || "") === (chosen.id === "gemini" ? "" : chosen.id)));
      const suggested = [...suggestedSet()].some((s) => m === s || m === `${s}:latest`);
      const input = h("input", { type: single ? "radio" : "checkbox", name: "pick", id, value: m, checked: ticked.has(m), disabled: present });
      input.addEventListener("change", () => {
        if (single) ticked = new Set([m]);
        else if (input.checked) ticked.add(m);
        else ticked.delete(m);
        updateSave();
      });
      return h("li", { class: "model-item" }, input, h("label", { for: id }, h("span", { class: "model-name", text: m }), present ? h("span", { class: "tag", text: t("Already added") }) : null, suggested ? h("span", { class: "tag good", text: t("Suggested for this computer") }) : null));
    })
  );
  $("ai-model-count").textContent = names.length > shown.length ? t("Showing {n} of {total}. Filter to find the rest.", { n: shown.length, total: names.length }) : "";
  $("ai-model-none").hidden = single;
}
$("ai-model-filter").addEventListener("input", renderModels);
$("ai-model-none").addEventListener("click", () => {
  ticked = new Set();
  renderModels();
  updateSave();
});
form.elements.model.addEventListener("input", updateSave);

function pickedModels() {
  const typed = form.elements.model.value.trim();
  const all = [...ticked];
  if (typed && !all.includes(typed)) all.push(typed);
  return all;
}

function updateSave() {
  const n = pickedModels().length;
  saveBtn.disabled = n === 0;
  if (editing) saveBtn.textContent = t("Save");
  else saveBtn.textContent = n > 1 ? tp("Add {n} models", "Add {n} models", n) : t("Add");
  $("field-name").hidden = !editing && n > 1;
}

// The AI's own settings, as the helper wants them
function ownParams() {
  const f = form.elements;
  const params = {};
  for (const key of ["temperature", "maxTokens", "topP", "timeoutSeconds", "dailyLimit"]) if (f[key].value !== "") params[key] = Number(f[key].value);
  if (f.systemPrefix.value.trim()) params.systemPrefix = f.systemPrefix.value.trim();
  if (f.tools.value === "off") params.tools = "off";
  if (f.vision.value !== "auto") params.vision = f.vision.value;
  return params;
}

function fillOwn(brain) {
  const f = form.elements;
  const p = brain.params || {};
  for (const key of ["temperature", "maxTokens", "topP", "timeoutSeconds", "dailyLimit"]) f[key].value = p[key] ?? "";
  f.systemPrefix.value = p.systemPrefix || "";
  f.tools.value = p.tools || "auto";
  f.vision.value = p.vision || "auto";
  f.note.value = brain.note || "";
  $("ai-own-settings").open = Boolean(Object.keys(p).length || brain.note);
}

function openEdit(id) {
  const brain = brains.find((b) => b.id === id);
  if (!brain) return;
  editing = brain;
  confirmDeleteId = null;
  aiOverview.hidden = true;
  aiAdd.hidden = false;
  pickView.hidden = true;
  form.hidden = false;
  showError(formError, "");
  $("ai-add-result").hidden = true;
  loadServices().then(() => {
    const d = describe(brain);
    const entry = brain.provider === "gemini" ? cloudService("gemini") : brain.provider === "openai" ? cloudService(brain.service) : localByAddress(brain.baseUrl) || { id: "local", label: d.label, protocol: brain.protocol, url: brain.baseUrl, color: d.color, about: "" };
    chosen = { id: brain.provider === "local" ? entry.id || "local" : brain.provider === "gemini" ? "gemini" : brain.service, kind: brain.kind, entry: { ...entry, protocol: brain.protocol } };
    const f = form.elements;
    form.reset();
    $("ai-add-title").textContent = t("Edit this AI");
    $("ai-form-head").replaceChildren(logo(d.label, d.color, "service-logo big"), h("div", { class: "ai-form-title" }, h("strong", { text: brain.name }), h("span", { class: "row-desc", text: `${d.label} · ${maskKey(brain)}` })));
    $("ai-form-about").textContent = "";
    f.name.value = brain.name;
    f.key.value = "";
    f.key.type = "password";
    const local = brain.kind === "local";
    $("field-baseurl").hidden = !(local || brain.service === "custom");
    f.baseUrl.value = brain.baseUrl || "";
    f.baseUrl.required = false;
    $("baseurl-label").textContent = local ? t("Server address") : t("Service address");
    $("baseurl-desc").textContent = "";
    const keyless = local || brain.service === "custom";
    $("key-label").textContent = keyless ? t("API key (optional)") : t("API key");
    f.key.required = false;
    f.key.placeholder = brain.keyHint ? `${maskKey(brain)} — ${t("leave empty to keep")}` : keyless ? t("Usually none") : t("Paste your API key");
    $("key-desc").textContent = t("Leave empty to keep the saved key.");
    $("ollama-field").hidden = !(local && brain.protocol === "ollama");
    $("speech-field").hidden = !local;
    f.contextSize.value = String(brain.contextSize ?? 0);
    f.keepAlive.value = String(brain.keepAlive ?? 0);
    f.speechUrl.value = brain.speechUrl || "";
    f.speechModel.value = brain.speechModel || "";
    fillOwn(brain);
    $("field-models").hidden = false;
    $("models-label").textContent = t("Model");
    $("field-model-typed").hidden = false;
    f.model.value = "";
    modelNames = [brain.model];
    ticked = new Set([brain.model]);
    renderModels();
    updateSave();
    $("ai-connect-status").textContent = "";
    // The models this key or server can use (the saved key is used when none is typed)
    api.models({ id: brain.id, key: "" }).then((models) => {
      modelNames = [...new Set([brain.model, ...models])];
      renderModels();
    }, () => {});
    f.name.focus();
  });
}

function closeAdd() {
  aiAdd.hidden = true;
  aiOverview.hidden = false;
  editing = null;
  chosen = null;
  heldKey = "";
  renderBrains();
  detectLocal();
  refreshUsage();
  $("brain-add").focus();
}

$("brain-add").addEventListener("click", () => openAdd());
$("ai-add-back").addEventListener("click", closeAdd);
$("ai-form-cancel").addEventListener("click", () => (editing ? closeAdd() : showPicker()));

// What the form's models and fields become when saved
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!chosen) return;
  const f = form.elements;
  const models = pickedModels();
  if (!models.length) return;
  const base = { ...query(), params: ownParams(), note: f.note.value.trim() };
  if (!base.key) delete base.key;
  if (chosen.kind === "local") {
    base.speechUrl = f.speechUrl.value.trim();
    base.speechModel = f.speechModel.value.trim();
    if (chosen.entry.protocol === "ollama") {
      base.contextSize = Number(f.contextSize.value) || 0;
      base.keepAlive = Number(f.keepAlive.value) || 0;
    }
  }
  showError(formError, "");
  saveBtn.disabled = true;
  const label = saveBtn.textContent;
  saveBtn.textContent = chosen.kind === "local" ? t("Checking the server…") : t("Checking the key…");
  try {
    if (editing) {
      apply(await api.save({ ...base, id: editing.id, name: f.name.value.trim() || editing.name, model: models[0] }));
      closeAdd();
    } else if (models.length === 1) {
      apply(await api.save({ ...base, name: f.name.value.trim() || undefined, model: models[0] }));
      closeAdd();
    } else {
      const result = await api.bulk({ ...base, models });
      apply(result.state);
      showResult(result);
    }
  } catch (err) {
    showError(formError, err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = label;
    updateSave();
  }
});

function showResult(result) {
  const box = $("ai-add-result");
  box.replaceChildren(
    result.added.length ? h("p", { class: "ok", text: `✓ ${tp("{n} AI added", "{n} AIs added", result.added.length)}` }) : null,
    result.skipped.length ? h("p", { class: "row-desc", text: t("{n} were already there: {names}", { n: result.skipped.length, names: result.skipped.join(", ") }) }) : null,
    ...result.failed.map((f) => h("p", { class: "form-error", text: `${f.model}: ${t(f.error)}` })),
    h("button", { type: "button", class: "btn btn-primary", id: "ai-add-done", text: t("Done"), onclick: closeAdd })
  );
  box.hidden = false;
  announce(box.textContent);
  $("ai-add-done").focus();
  ticked = new Set();
  renderModels();
  updateSave();
}

$("key-toggle").addEventListener("click", () => {
  const input = form.elements.key;
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  const label = show ? t("Hide the key") : t("Show the key");
  $("key-toggle").title = label;
  $("key-toggle").setAttribute("aria-label", label);
});

// ---------- Paste a key or an address ----------
const smart = $("smart-add");
const smartInput = $("smart-input");
const smartHint = $("smart-hint");

smart.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = smartInput.value.trim();
  if (!text) return openAdd();
  smartHint.textContent = t("Looking…");
  await loadServices();
  let found;
  try {
    found = await helper.services.recognise(text);
  } catch (err) {
    smartHint.textContent = err.message;
    return;
  }
  smartInput.value = "";
  smartHint.textContent = t("Friends works out which service it belongs to.");
  const id = found.matches[0];
  if (found.kind === "key" && found.certain) openAdd({ service: id, kind: id === "gemini" || services()?.cloud.some((s) => s.id === id) ? "cloud" : "local", key: text });
  else if (found.kind === "key") {
    openAdd({ key: text, candidates: found.matches });
    if (found.matches.length) announce(t("That key could belong to more than one service. Pick yours."));
  } else if (found.kind === "address") {
    if (found.certain && found.cloud) openAdd({ service: id, kind: "cloud", baseUrl: text.startsWith("http") ? text : `https://${text}` });
    else if (found.certain) openAdd({ service: id, kind: "local", baseUrl: text });
    else openAdd({ service: "other", kind: "local", baseUrl: found.url || text });
  } else openAdd({ key: "" });
});

// The first-run guide had a key that could belong to several services
document.addEventListener("friends:add-ai", (e) => openAdd({ key: e.detail.key, candidates: e.detail.candidates }));

// ---------- Start ----------
const reveal = () => {
  renderBrains();
  renderLocal();
};
document.addEventListener("friends:services-ready", reveal);
document.addEventListener("friends:settings", (e) => {
  if (e.detail.open && e.detail.tab === "ai-control") {
    refreshUsage();
    detectLocal();
  }
});
document.addEventListener("friends:brains-changed", () => renderLocal());
// Private mode greys the cloud AIs in the list
onSettings(() => loadedBrains && renderBrains());

renderBrains();
loadServices();
helper.brains.list().then(
  (state) => {
    apply(state);
    refreshUsage();
  },
  (err) => {
    loadedBrains = true;
    renderBrains();
    showError(listError, err.message);
  }
);
detectLocal();
refreshVoice();
