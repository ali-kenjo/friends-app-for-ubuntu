// ---------- Settings → AI → Specialists ----------
// The roles (general, coding, writing…), the model each uses, whether it fits the graphics card, a test button,
// pulling and removing models, and suggestions for the memory this computer can give (server/hardware.js). The helper does the work
// (server/specialists-api.js, server/vram.js); this draws it and sends what you pick.
import { api } from "./api.js";
import { h } from "./h.js";
import { t, nf } from "./i18n.js";
import { iconEl } from "./icons.js";
import { announce } from "./a11y.js";
import { confirmDialog } from "./dialogs.js";
import { updateSettings, flushSettings, reloadSettings } from "./store.js";
import { onServerEvent } from "./events.js";

const $ = (id) => document.getElementById(id);
const rolesEl = $("spec-roles");
const statusEl = $("spec-status");
const modelsEl = $("spec-models");
const feedback = $("spec-feedback");

let data = null;
let busy = false;
const tests = new Map(); // role id → the last test result

const say = (text, kind = "") => {
  feedback.textContent = text;
  feedback.className = `test-feedback ${kind}`;
};
const clean = (name) => String(name || "").replace(/:latest$/, "");
const gb = (mb) => `\u2066${nf(Math.round((mb / 1024) * 10) / 10)} GB\u2069`; // (kept together in right-to-left text)

async function load() {
  try {
    data = await api.specialists.overview();
    reloadSettings(); // the helper may have changed the settings itself (the roles): the page's copy follows
    for (const r of data.roles) {
      r.label = t(r.label); // the built-in roles have texts from the helper
      r.when = t(r.when);
    }
    draw();
  } catch (err) {
    say(err.message, "error");
  }
}

async function act(fn, ok = "") {
  if (busy) return;
  busy = true;
  try {
    const result = await fn();
    if (ok) say(ok, "ok");
    await load();
    return result;
  } catch (err) {
    say(err.message, "error");
  } finally {
    busy = false;
  }
}

// ---------- The status line ----------
function drawStatus() {
  const v = data.vram;
  const bits = [];
  bits.push(h("span", { class: `strip-item ${data.running ? "" : "muted"}` }, iconEl("chip", { size: 15 }), data.running ? t("Ollama is running") : t("Ollama isn't running. Start it with: ollama serve")));
  if (v.gpu) bits.push(h("span", { class: "strip-item" }, iconEl("gauge", { size: 15 }), t("{card}: {used} of {total} used", { card: v.gpu.name, used: gb(v.gpu.usedMb), total: gb(v.gpu.totalMb) })));
  else bits.push(h("span", { class: "strip-item muted" }, iconEl("gauge", { size: 15 }), t("No graphics card Friends can use was found: Ollama decides where models run")));
  const loaded = data.loaded?.loaded;
  bits.push(h("span", { class: "strip-item" }, iconEl("play", { size: 15 }), loaded ? `${t("Loaded now")}: ${loaded.model}${loaded.role ? ` (${loaded.role})` : ""}` : v.loaded.length ? `${t("Loaded now")}: ${v.loaded.map((m) => clean(m.name)).join(", ")}` : t("Nothing is loaded now")));
  statusEl.replaceChildren(...bits);
  statusEl.className = "spec-status card model-strip";
}

// ---------- A role ----------
function fitBadge(role) {
  if (!role.enabled) return h("span", { class: "chip" }, t("Off"));
  if (!role.effectiveModel) return h("span", { class: "chip status-warn" }, t("No model yet"));
  if (!role.installed) return h("span", { class: "chip status-warn" }, t("Not installed"));
  const f = role.fits;
  if (!f || f.placement === "unknown") return h("span", { class: "chip" }, t("Size unknown"));
  if (f.placement === "gpu") return h("span", { class: "chip status-good", title: t("About {need} needed, {have} free on the card", { need: gb(f.totalMb), have: gb(f.availableMb) }) }, iconEl("check", { size: 13 }), t("Fits the card"));
  if (f.placement === "split") return h("span", { class: "chip status-warn", title: t("About {need} needed, {have} free on the card", { need: gb(f.totalMb), have: gb(f.availableMb) }) }, t("Part runs on the processor"));
  if (f.placement === "auto") return h("span", { class: "chip" }, t("No card to count"));
  return h("span", { class: "chip status-bad", title: t("About {need} needed, {have} free on the card", { need: gb(f.totalMb), have: gb(f.availableMb) }) }, iconEl("warning", { size: 13 }), t("Too big for the card: runs on the processor"));
}

function modelSelect(role) {
  const options = [];
  if (role.id !== "general") options.push(h("option", { value: "", text: t("Same as General ({model})", { model: clean(data.roles.find((r) => r.id === "general")?.effectiveModel) || t("none yet") }) }));
  const names = data.installed.map((m) => m.name);
  for (const m of data.installed) options.push(h("option", { value: m.name, text: `${clean(m.name)} · ${nf(m.sizeGb)} GB` }));
  if (role.model && !names.includes(role.model)) options.push(h("option", { value: role.model, text: `${clean(role.model)} (${t("not installed")})` }));
  if (role.id === "general" && !role.model && role.effectiveModel && !names.includes(role.effectiveModel)) options.unshift(h("option", { value: "", text: `${clean(role.effectiveModel) || t("Choose a model")}` }));
  const select = h("select", { class: "field", "aria-label": `${role.label}: ${t("model")}` }, options);
  select.value = role.model || (role.id === "general" && names.includes(role.effectiveModel) ? role.effectiveModel : "");
  select.addEventListener("change", () => act(() => api.specialists.save(role.id, { model: select.value }), t("Saved.")));
  return select;
}

function roleDetails(role) {
  const system = h("textarea", { class: "field textarea wide", rows: 5, maxlength: 4000, "aria-label": `${role.label}: ${t("Its instructions")}` });
  system.value = role.system;
  const ctx = h("input", { class: "field narrow", type: "number", min: 1024, max: 131072, step: 1024, value: role.contextSize, "aria-label": t("Context size (tokens)") });
  const fallback = h("select", { class: "field", "aria-label": t("If it doesn't fit, use") }, [h("option", { value: "", text: t("Nothing: use the processor") }), ...data.installed.map((m) => h("option", { value: m.name, text: clean(m.name) }))]);
  fallback.value = role.fallback || "";
  const enabled = h("input", { type: "checkbox", class: "toggle", checked: role.enabled, "aria-label": `${role.label} ${t("on")}` });
  return h(
    "div",
    { class: "spec-details" },
    h("label", { class: "inline-toggle" }, enabled, h("span", { text: t("This role is on") })),
    h("label", { class: "field-label" }, t("Its instructions"), system),
    h("div", { class: "form-row" }, h("label", { class: "limit" }, h("span", { text: t("Context size (tokens)") }), ctx), role.kind !== "embedding" ? h("label", { class: "limit" }, h("span", { text: t("If it doesn't fit, use") }), fallback) : null),
    h(
      "div",
      { class: "actions-row" },
      h("button", { type: "button", class: "btn btn-primary small", onclick: () => act(() => api.specialists.save(role.id, { system: system.value, contextSize: Number(ctx.value), fallback: fallback.value, enabled: enabled.checked }), t("Saved.")) }, t("Save")),
      h(
        "button",
        {
          type: "button",
          class: "btn small",
          onclick: async () => {
            if (role.builtin || (await confirmDialog({ title: t("Remove this role?"), message: role.label, confirm: t("Remove"), danger: true }))) act(() => api.specialists.remove(role.id), role.builtin ? t("Back to the default for this role.") : t("Removed."));
          },
        },
        role.builtin ? t("Back to the default") : t("Remove this role")
      )
    )
  );
}

function roleCard(role) {
  const result = tests.get(role.id);
  const test = h("button", { type: "button", class: "btn small", disabled: !role.enabled || !role.effectiveModel, onclick: () => runTest(role) }, iconEl("play", { size: 14 }), t("Test"));
  const pull = !role.installed && role.effectiveModel && role.enabled ? h("button", { type: "button", class: "btn small btn-primary", onclick: () => startPull(role.effectiveModel) }, iconEl("download", { size: 14 }), t("Pull {model}", { model: clean(role.effectiveModel) })) : null;
  const details = h("details", { class: "spec-more" }, h("summary", {}, t("Instructions and settings")), roleDetails(role));
  return h(
    "li",
    { class: `spec-role card${role.enabled ? "" : " off"}` },
    h("div", { class: "spec-head" }, h("h4", { class: "spec-name", text: role.label }), fitBadge(role), role.inherited ? h("span", { class: "chip" }, t("shares the general model")) : null),
    h("p", { class: "row-desc", text: role.when }),
    h("div", { class: "spec-controls" }, modelSelect(role), test, pull),
    result ? h("p", { class: `test-feedback ${result.ok ? "ok" : "error"}`, role: "status" }, result.ok ? `${result.model} · ${t("answered in {ms} ms", { ms: nf(result.ms) })}${result.placement ? ` · ${placementText(result.placement)}` : ""}${result.text ? `: “${result.text}”` : ""}` : result.error) : null,
    details
  );
}

const placementText = (p) => ({ gpu: t("on the graphics card"), split: t("part on the graphics card"), cpu: t("on the processor") }[p] || p);

async function runTest(role) {
  tests.set(role.id, { ok: true, model: role.effectiveModel, ms: 0, text: t("Loading the model and asking it…") });
  draw();
  try {
    tests.set(role.id, await api.specialists.test(role.id));
  } catch (err) {
    tests.set(role.id, { ok: false, error: err.message });
  }
  await load();
}

// ---------- Models on this computer ----------
function modelItem(m) {
  return h(
    "li",
    { class: "spec-model" },
    h("span", { class: "spec-model-name", text: clean(m.name) }),
    h("span", { class: "row-desc", text: `${nf(m.sizeGb)} GB` }),
    data.roles.filter((r) => r.enabled && r.effectiveModel === m.name).length ? h("span", { class: "row-desc", text: data.roles.filter((r) => r.enabled && r.effectiveModel === m.name).map((r) => r.label).join(", ") }) : null,
    h(
      "button",
      {
        type: "button",
        class: "icon-btn small",
        title: t("Remove this model from this computer"),
        "aria-label": `${t("Remove this model from this computer")}: ${clean(m.name)}`,
        onclick: async () => {
          if (await confirmDialog({ title: t("Remove {model}?", { model: clean(m.name) }), message: t("It is deleted from this computer. You can pull it again later."), confirm: t("Remove"), danger: true })) act(() => api.specialists.removeModel(m.name), t("Removed."));
        },
      },
      iconEl("trash", { size: 16 })
    )
  );
}

// ---------- Pulling ----------
async function startPull(model) {
  const wrap = $("spec-progress");
  const bar = $("spec-progress-bar");
  const text = $("spec-progress-text");
  const go = $("spec-pull-go");
  wrap.hidden = false;
  go.disabled = true;
  bar.style.width = "0%";
  bar.parentElement.setAttribute("aria-valuenow", "0");
  text.textContent = t("Starting…");
  try {
    const res = await fetch("/api/specialists/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }) });
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let failed = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line) continue;
        const e = JSON.parse(line);
        if (e.type === "progress") {
          if (e.percent !== null) {
            bar.style.width = `${e.percent}%`;
            bar.parentElement.setAttribute("aria-valuenow", String(e.percent));
          }
          text.textContent = e.percent !== null ? `${model}: ${e.percent}%` : `${model}: ${e.status}`;
        } else if (e.type === "error") failed = e.error;
      }
    }
    if (failed) throw new Error(failed);
    text.textContent = t("{model} is ready.", { model });
    announce(text.textContent);
    await load();
  } catch (err) {
    text.textContent = err.message;
  } finally {
    go.disabled = false;
  }
}

$("spec-pull").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("spec-pull-name").value.trim();
  if (name) startPull(name);
});

// ---------- Suggestions, new roles, reset ----------
function drawSuggestions() {
  const card = $("spec-setup");
  const s = data.suggestions;
  const needPull = ["general", "coding", "embeddings"].filter((r) => !s[r].installed);
  const seen = data.suggestionsSeen;
  card.hidden = seen && !needPull.length;
  if (card.hidden) return;
  const hw = data.hardware;
  const card2 = hw ? t("This computer can give a local model about {memory} ({tier}).", { memory: gb(hw.budgetMb), tier: hw.canRunLocal ? t("models up to about {n} billion parameters", { n: hw.maxParamsB }) : t("very small models only") }) : t("Looking at this computer…");
  $("spec-setup-text").textContent = `${card2} ${t("Suggested (checked {date}): {general} for everyday work, {coding} for code, {embeddings} for finding notes.", { date: data.suggestionsChecked, general: clean(s.general.model), coding: clean(s.coding.model), embeddings: clean(s.embeddings.model) })}`;
}

$("spec-use-suggestions").addEventListener("click", async () => {
  await act(() => api.specialists.reset(), t("Suggested models chosen. Pull the ones that aren't installed yet."));
  updateSettings((s) => (s.specialists.suggestedSeen = true));
  flushSettings();
});
$("spec-dismiss-suggestions").addEventListener("click", () => {
  updateSettings((s) => (s.specialists.suggestedSeen = true));
  flushSettings().then(load);
});
$("spec-reset").addEventListener("click", async () => {
  if (await confirmDialog({ title: t("Reset the specialists?"), message: t("The roles go back to the suggested defaults for your card. Your own roles stay."), confirm: t("Reset") })) act(() => api.specialists.reset(), t("Back to the suggested defaults."));
});
$("spec-add").addEventListener("click", () => {
  $("spec-new").hidden = false;
  $("spec-new").elements.label.focus();
});
$("spec-new-cancel").addEventListener("click", () => ($("spec-new").hidden = true));
$("spec-new").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target.elements;
  act(() => api.specialists.add({ label: f.label.value, when: f.when.value, system: f.system.value }), t("Role added. Pick its model.")).then(() => {
    e.target.reset();
    e.target.hidden = true;
  });
});

function draw() {
  drawStatus();
  drawSuggestions();
  rolesEl.replaceChildren(...data.roles.map(roleCard));
  modelsEl.replaceChildren(...(data.installed.length ? data.installed.map(modelItem) : [h("li", { class: "memory-empty", text: data.running ? t("No models yet. Pull one above.") : t("Ollama isn't running.") })]));
  $("spec-pull-list").replaceChildren(...[...new Set(Object.values(data.suggestions).flatMap((s) => [s.model, ...s.alternatives.map((a) => a.model)]))].map((m) => h("option", { value: m })));
  $("spec-pull-name").placeholder = clean(data.suggestions.general.model);
}

// Shown when the section opens, and kept fresh while a mission loads models
document.addEventListener("friends:settings", (e) => e.detail.open && e.detail.tab === "specialists" && load());
onServerEvent("model", () => document.getElementById("pane-specialists").classList.contains("active") && !busy && load());
