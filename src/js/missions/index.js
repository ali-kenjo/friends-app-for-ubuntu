// ---------- Missions ----------
// Everything the assistant does for you in the background: start one, answer its questions, read and approve its
// plan, watch it work, stop it, read its report. (The engine is server/missions/; views.js shows this place.)
// The list is the front page; a mission opens in the same place (#missions/<id>). It follows the helper's
// events, so progress shows as it happens, and the sidebar badge and Home say when a mission needs you.
import { api } from "../api.js";
import { h } from "../h.js";
import { t, tp, nf } from "../i18n.js";
import { icon, iconEl } from "../icons.js";
import { onServerEvent } from "../events.js";
import { showView, currentView } from "../views.js";
import { getSettings, onSettings } from "../store.js";
import { announce } from "../a11y.js";
import { toast } from "../life.js";
import { looksLikeMission } from "./detect.mjs";
import { statusOf, isActive, roleLabel, when } from "./labels.js";
import { renderDetail } from "./detail.js";

const root = document.getElementById("missions-root");
const actionsBar = document.getElementById("missions-actions");
const badge = document.getElementById("missions-badge");
const homeNote = document.getElementById("home-mission-note");

const state = { overview: null, openId: null, detail: null, composer: false, drafts: new Map(), error: "", loading: true };
let refreshTimer = null;
let composerEl = null;
let lastActive = -1;

export const missionsEnabled = () => getSettings()?.missions?.enabled !== false;

// ---------- Talking to the helper ----------
async function run(fn) {
  try {
    state.error = "";
    const result = await fn();
    await refresh({ force: true });
    return result;
  } catch (err) {
    state.error = err.message;
    toast({ icon: "alert", title: t("That didn't work"), body: err.message });
    await refresh({ force: true });
    return null;
  }
}

async function refresh({ force = false } = {}) {
  try {
    state.overview = await api.missions.overview();
    if (state.openId) {
      try {
        state.detail = await api.missions.get(state.openId);
      } catch {
        state.detail = null;
      }
    }
  } catch (err) {
    state.error = err.message;
  }
  state.loading = false;
  updateOutside();
  if (currentView() === "missions") draw({ force });
}

const scheduleRefresh = () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh(), 150);
};

// ---------- What the rest of the page shows ----------
function updateOutside() {
  const list = state.overview?.missions || [];
  const needs = list.filter((m) => statusOf(m).needsYou && isActive(m));
  badge.hidden = !needs.length;
  badge.textContent = nf(needs.length);
  badge.title = tp("{n} mission needs you", "{n} missions need you", needs.length);
  badge.classList.toggle("attention", needs.length > 0);
  const running = list.filter((m) => m.status === "running" && !m.pause).length + list.filter((m) => m.status === "planning").length;
  if (running !== lastActive) {
    lastActive = running;
    document.dispatchEvent(new CustomEvent("friends:missions-active", { detail: { running, needs: needs.length } }));
  }
  // Home: a quiet line when something is going on
  const first = needs[0] || list.find((m) => m.status === "running" || m.status === "planning");
  if (!first || !missionsEnabled()) {
    homeNote.hidden = true;
  } else {
    const s = statusOf(first);
    homeNote.hidden = false;
    homeNote.href = `#missions/${first.id}`;
    homeNote.classList.toggle("waiting", Boolean(s.needsYou));
    const more = list.filter((m) => isActive(m)).length - 1;
    homeNote.replaceChildren(...[h("span", { class: "pulse", "aria-hidden": "true" }), h("span", { text: s.needsYou ? `${first.title}: ${s.label.toLowerCase()}` : first.progress.total ? t("{title}: step {n} of {total}", { title: first.title, n: Math.min(first.progress.total, first.progress.done + 1), total: first.progress.total }) : t("{title}: working on it", { title: first.title }) }), more > 0 ? h("span", { class: "row-desc", text: tp("and {n} more", "and {n} more", more) }) : null].filter(Boolean));
  }
}

// ---------- The list ----------
function missionRow(m) {
  const s = statusOf(m);
  const p = m.progress;
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return h(
    "li",
    { class: `mission-row tone-${s.tone}` },
    h(
      "a",
      { class: "mission-link", href: `#missions/${m.id}` },
      h("span", { class: `status-dot status-${s.tone}`, "aria-hidden": "true" }, iconEl(s.icon, { size: 16 })),
      h(
        "span",
        { class: "mission-main" },
        h("span", { class: "mission-title", text: m.title }),
        h("span", { class: "mission-sub" }, [
          s.label,
          p.total && isActive(m) ? tp("{n} of {total} step", "{n} of {total} steps", p.done, { total: p.total }) : "",
          m.status === "running" && p.current ? p.current.title : "",
          m.private ? t("Private") : "",
          m.automationId ? t("Repeats") : "",
          when(m.updatedAt),
        ].filter(Boolean).join(" · "))
      ),
      m.status === "running" && p.total ? h("span", { class: "bar small", "aria-hidden": "true" }, h("i", { style: `width:${pct}%` })) : null,
      iconEl("chevronRight", { size: 18 })
    )
  );
}

function section(title, items, { empty = "", id = "" } = {}) {
  if (!items.length && !empty) return null;
  return h("section", { class: "m-section", "aria-labelledby": `m-${id}` }, h("h2", { class: "section-title", id: `m-${id}`, text: title }), items.length ? h("ul", { class: "mission-list" }, items) : h("p", { class: "row-desc", text: empty }));
}

function modelStrip(o) {
  const loaded = o.model?.loaded;
  const bits = [];
  if (loaded) bits.push(h("span", { class: "strip-item" }, iconEl("chip", { size: 15 }), loaded.model, loaded.role ? ` · ${roleLabel(loaded.role)}` : "", loaded.placement === "cpu" ? ` · ${t("on the processor")}` : loaded.placement === "split" ? ` · ${t("part on the graphics card")}` : ""));
  else bits.push(h("span", { class: "strip-item muted" }, iconEl("chip", { size: 15 }), t("No local model loaded")));
  if (loaded?.why) bits.push(h("span", { class: "strip-item muted", text: loaded.why }));
  if (o.model?.waiting) bits.push(h("span", { class: "strip-item muted", text: tp("{n} waiting for a model", "{n} waiting for a model", o.model.waiting) }));
  bits.push(h("span", { class: "strip-item muted" }, iconEl("cloud", { size: 15 }), tp("Gemini today: {n} call", "Gemini today: {n} calls", o.usage?.calls || 0)));
  return h("div", { class: "model-strip", role: "status" }, bits);
}

// ---------- A new mission ----------
function newMissionForm() {
  const goal = h("textarea", { class: "field textarea goal-input", rows: 4, maxlength: 6000, placeholder: t("Describe a goal, or paste a plan. For example: research the three best budget laptops for video editing and write me a report."), "aria-label": t("The goal") });
  const priv = h("input", { type: "checkbox", class: "toggle", id: "new-private" });
  const globalPrivate = getSettings()?.privacy?.localOnly === true;
  if (globalPrivate) {
    priv.checked = true;
    priv.disabled = true;
  }
  const repeat = h("select", { class: "field", "aria-label": t("Repeat") }, [
    h("option", { value: "", text: t("Just once") }),
    h("option", { value: "daily", text: t("Every day") }),
    h("option", { value: "weekdays", text: t("Weekdays") }),
    h("option", { value: "weekly", text: t("Every week") }),
    h("option", { value: "file", text: t("When a file appears in a folder") }),
    h("option", { value: "disk", text: t("When the disk fills up") }),
  ]);
  const time = h("input", { class: "field narrow", type: "time", value: "08:00", "aria-label": t("At what time") });
  const day = h("select", { class: "field", "aria-label": t("On which day") }, [1, 2, 3, 4, 5, 6, 7].map((d) => h("option", { value: d, text: [t("Monday"), t("Tuesday"), t("Wednesday"), t("Thursday"), t("Friday"), t("Saturday"), t("Sunday")][d - 1] })));
  day.value = "5";
  const folder = h("input", { class: "field", type: "text", placeholder: t("Folder, e.g. ~/Downloads"), "aria-label": t("Folder to watch") });
  const percent = h("input", { class: "field narrow", type: "number", min: 50, max: 99, value: 90, "aria-label": t("Percent full") });
  const sync = () => {
    time.hidden = !["daily", "weekdays", "weekly"].includes(repeat.value);
    day.hidden = repeat.value !== "weekly";
    folder.hidden = repeat.value !== "file";
    percent.hidden = repeat.value !== "disk";
  };
  repeat.addEventListener("change", sync);
  sync();
  const hint = h("p", { class: "form-error", role: "alert", hidden: true });
  const start = h("button", { type: "submit", class: "btn btn-primary" }, iconEl("play", { size: 16 }), t("Make a plan"));
  const form = h(
    "form",
    {
      class: "card new-mission",
      "aria-label": t("New mission"),
      onsubmit: async (e) => {
        e.preventDefault();
        hint.hidden = true;
        const text = goal.value.trim();
        if (text.length < 4) {
          hint.textContent = t("Say what the goal is, in a sentence or two.");
          hint.hidden = false;
          return goal.focus();
        }
        let automation = null;
        if (repeat.value === "file") {
          if (!folder.value.trim()) {
            hint.textContent = t("Which folder should it watch?");
            hint.hidden = false;
            return folder.focus();
          }
          automation = { trigger: { kind: "file", folder: folder.value.trim() } };
        } else if (repeat.value === "disk") automation = { trigger: { kind: "disk", mount: "/", percent: Number(percent.value) } };
        else if (repeat.value === "weekly") automation = { schedule: { kind: "weekly", days: [Number(day.value)], time: time.value } };
        else if (repeat.value) automation = { schedule: { kind: repeat.value, time: time.value } };
        start.disabled = true;
        try {
          const made = await api.missions.create(text, { private: priv.checked, automation });
          goal.value = "";
          state.composer = false;
          location.hash = `#missions/${made.id}`;
          announce(t("Mission started. It's making a plan."));
        } catch (err) {
          hint.textContent = err.message;
          hint.hidden = false;
        } finally {
          start.disabled = false;
        }
      },
    },
    h("h2", { class: "section-title", text: t("A new mission") }),
    goal,
    h("div", { class: "form-row" }, h("label", { class: "inline-toggle" }, priv, h("span", { text: t("Private: only models on this computer") })), h("span", { class: "spacer" }), repeat, day, time, folder, percent),
    hint,
    h("div", { class: "actions-row" }, start, h("button", { type: "button", class: "btn btn-ghost", onclick: () => ((state.composer = false), draw({ force: true })) }, t("Cancel")))
  );
  form.goal = goal;
  return form;
}

function examples() {
  const examples = [
    { icon: "globe", text: t("Research the three best budget laptops for video editing and write me a short report") },
    { icon: "folder", text: t("Sort my Downloads folder into folders by type") },
    { icon: "code", text: t("Build a small command-line to-do app in Node.js, with tests, and commit it") },
    { icon: "gauge", text: t("Watch my computer and tell me when the disk, memory or graphics card gets too full or hot") },
  ];
  return h("div", { class: "empty-examples" }, examples.map((x) => h("button", { type: "button", class: "prompt-chip", onclick: () => openComposer(x.text) }, iconEl(x.icon, { size: 15 }), x.text)));
}

function openComposer(text = "") {
  state.composer = true;
  draw({ force: true });
  composerEl?.goal?.focus();
  if (text && composerEl) composerEl.goal.value = text;
}

// ---------- Repeating missions ----------
function automationRow(a) {
  const on = a.enabled;
  const what = a.watch ? t("Watches your computer") : a.description;
  const bits = [what, a.lastRun ? t("last run {when}", { when: when(a.lastRun) }) : t("hasn't run yet"), on && a.nextRun ? t("next {when}", { when: when(a.nextRun) }) : ""].filter(Boolean).join(" · ");
  const toggle = h("input", { type: "checkbox", class: "toggle", checked: on, "aria-label": t("{name} on", { name: a.name }), onchange: () => run(() => api.automations.update(a.id, { enabled: toggle.checked })) });
  return h(
    "li",
    { class: "automation" },
    h("span", { class: "status-dot status-neutral", "aria-hidden": "true" }, iconEl(a.watch ? "gauge" : "repeat", { size: 16 })),
    h("span", { class: "mission-main" }, h("span", { class: "mission-title", text: a.name }), h("span", { class: "mission-sub", text: bits }), a.alerts?.length ? h("span", { class: "mission-sub warn", text: t("Last alert: {text}", { text: a.alerts.at(-1).text }) }) : null),
    h("span", { class: "automation-actions" }, !a.watch ? h("button", { type: "button", class: "btn small", onclick: () => run(() => api.automations.run(a.id)) }, t("Run now")) : null, toggle, h("button", { type: "button", class: "icon-btn small", title: t("Remove this repeat"), "aria-label": `${t("Remove this repeat")}: ${a.name}`, onclick: () => run(() => api.automations.remove(a.id)) }, iconEl("trash", { size: 16 })))
  );
}

function watchForm() {
  const n = (label, value, min, max, step = 1) => h("label", { class: "limit" }, h("span", { text: label }), h("input", { class: "field narrow", type: "number", min, max, step, value, "data-key": label }));
  const every = n(t("Check every (minutes)"), 5, 1, 1440);
  const cpu = n(t("Processor % at"), 90, 20, 100);
  const mem = n(t("Memory % at"), 90, 20, 100);
  const disk = n(t("Disk % at"), 90, 50, 99);
  const gpu = n(t("Graphics card °C at"), 85, 40, 110);
  const services = h("input", { type: "checkbox", class: "toggle", checked: true });
  const value = (el) => Number(el.querySelector("input").value);
  return h(
    "form",
    {
      class: "card watch-form",
      onsubmit: (e) => {
        e.preventDefault();
        run(() => api.automations.create({ name: t("Watch my computer"), watch: { everyMinutes: value(every), cpu: value(cpu), memory: value(mem), disk: value(disk), gpuTemp: value(gpu), services: services.checked } })).then(() => ((state.watching = false), draw({ force: true })));
      },
    },
    h("h2", { class: "section-title", text: t("Watch my computer") }),
    h("p", { class: "row-desc", text: t("It looks at the processor, memory, disks, the graphics card's temperature and failing services, and tells you (here, on your desktop and on Telegram) when something goes over. No model is used for this.") }),
    h("div", { class: "limit-row" }, every, cpu, mem, disk, gpu),
    h("label", { class: "inline-toggle" }, services, h("span", { text: t("Also tell me about failing services") })),
    h("div", { class: "actions-row" }, h("button", { type: "submit", class: "btn btn-primary" }, t("Start watching")), h("button", { type: "button", class: "btn btn-ghost", onclick: () => ((state.watching = false), draw({ force: true })) }, t("Cancel")))
  );
}

// ---------- Drawing ----------
function drawList() {
  const o = state.overview;
  const list = o?.missions || [];
  const needs = list.filter((m) => isActive(m) && statusOf(m).needsYou);
  const running = list.filter((m) => isActive(m) && !statusOf(m).needsYou);
  const history = list.filter((m) => !isActive(m) && !statusOf(m).needsYou);
  const failedNeedsYou = list.filter((m) => !isActive(m) && statusOf(m).needsYou && m.status === "failed" && Date.now() - m.updatedAt < 24 * 3600 * 1000);
  const autos = o?.automations || [];
  const nodes = [];
  if (o) nodes.push(modelStrip(o));
  if (state.composer || (!list.length && !autos.length && !state.watching)) {
    composerEl = composerEl || newMissionForm();
    nodes.push(composerEl);
  }
  if (state.watching) nodes.push(watchForm());
  if (!list.length && !autos.length) {
    nodes.push(
      h(
        "div",
        { class: "empty-state" },
        h("span", { class: "empty-icon" }, iconEl("missions", { size: 28 })),
        h("h2", { class: "empty-title", text: t("Give me a goal") }),
        h("p", { class: "empty-text", text: t("I make a plan, you approve it once, and I get it done in the background. You can stop me at any time.") }),
        examples()
      )
    );
  } else {
    nodes.push(section(t("Needs you"), [...needs, ...failedNeedsYou].map(missionRow), { id: "needs" }));
    nodes.push(section(t("In progress"), running.map(missionRow), { id: "running" }));
    nodes.push(section(t("Repeating"), autos.map(automationRow), { id: "repeat", empty: t("Nothing repeats yet. Choose “Repeat” when you start a mission, or watch your computer.") }));
    nodes.push(section(t("History"), history.filter((m) => !failedNeedsYou.includes(m)).map(missionRow), { id: "history" }));
  }
  if (state.error) nodes.push(h("p", { class: "form-error", role: "alert", text: state.error }));
  root.replaceChildren(...nodes.filter(Boolean));
  actionsBar.replaceChildren(
    h("button", { type: "button", class: "btn", onclick: () => ((state.watching = !state.watching), draw({ force: true })) }, iconEl("gauge", { size: 16 }), t("Watch my computer")),
    h("button", { type: "button", class: "btn btn-primary", onclick: () => openComposer() }, iconEl("plus", { size: 16 }), t("New mission"))
  );
}

function drawDetail() {
  const m = state.detail;
  actionsBar.replaceChildren();
  if (!m) {
    root.replaceChildren(h("div", { class: "empty-state" }, h("h2", { class: "empty-title", text: t("That mission isn't here") }), h("p", { class: "empty-text", text: t("It was removed, or it never existed.") }), h("a", { class: "btn btn-primary", href: "#missions", text: t("All missions") })));
    return;
  }
  const ctx = {
    run,
    goBack: () => (location.hash = "#missions"),
    draft: (id, qid) => state.drafts.get(`${id}:${qid}`) || "",
    setDraft: (id, qid, value) => state.drafts.set(`${id}:${qid}`, value),
  };
  const scroll = root.closest(".view-scroll");
  const top = scroll?.scrollTop || 0;
  // A redraw keeps the keyboard where it was (the title, an answer being typed)
  const keep = root.contains(document.activeElement) ? document.activeElement.id : "";
  root.replaceChildren(renderDetail(m, ctx));
  if (keep) document.getElementById(keep)?.focus({ preventScroll: true });
  if (scroll) scroll.scrollTop = top;
}

let drawnKey = "";
function draw({ force = false } = {}) {
  // Typing somewhere in a form isn't interrupted by a refresh that changed nothing important
  const typing = root.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  const key = state.openId ? `${state.openId}:${state.detail?.updatedAt}:${state.detail?.status}` : `list:${JSON.stringify((state.overview?.missions || []).map((m) => [m.id, m.status, m.updatedAt, m.progress.done]))}:${JSON.stringify((state.overview?.automations || []).map((a) => [a.id, a.enabled, a.lastRun]))}:${state.overview?.model?.loaded?.model}:${state.overview?.usage?.calls}:${state.composer}:${state.watching}`;
  if (!force && typing && key.split(":")[0] === drawnKey.split(":")[0]) return;
  if (!force && key === drawnKey) return;
  drawnKey = key;
  if (state.openId) drawDetail();
  else drawList();
}

// ---------- Which mission is open ----------
document.addEventListener("friends:view", (e) => {
  if (e.detail.name !== "missions") return;
  const id = e.detail.detail || null;
  const changed = id !== state.openId;
  state.openId = id;
  state.detail = null;
  if (changed) drawnKey = "";
  refresh({ force: true }).then(() => {
    if (changed) document.getElementById(id ? "mission-title" : "missions-title")?.focus({ preventScroll: true });
  });
});

// From a chat: "Make this a mission" (chat.js)
export async function startFromChat(text) {
  const made = await api.missions.create(text, { source: "chat" });
  location.hash = `#missions/${made.id}`;
  return made;
}
export { looksLikeMission };

// ---------- Live ----------
onServerEvent("mission", (e) => {
  scheduleRefresh();
  if (!e?.notify || !missionsEnabled()) return;
  // In the page: a message with a way to open it (the desktop and Telegram say it too)
  if (currentView() === "missions" && state.openId === e.mission?.id) return;
  toast({ icon: e.type === "done" ? "check" : e.type === "failed" ? "alert" : "missions", title: t(e.notify.title), body: e.notify.body, actions: [[t("Open"), () => (location.hash = `#missions/${e.mission.id}`)]] });
});
onServerEvent("model", () => currentView() === "missions" && !state.openId && scheduleRefresh());
onServerEvent("alert", (a) => toast({ icon: "gauge", title: a.title, body: a.body, actions: [[t("Open Missions"), () => (location.hash = "#missions")]] }));

onSettings(() => {
  document.getElementById("nav-missions").hidden = !missionsEnabled();
  if (!missionsEnabled() && currentView() === "missions") showView("home");
});
setInterval(() => document.visibilityState === "visible" && refresh(), 30000);
refresh();
