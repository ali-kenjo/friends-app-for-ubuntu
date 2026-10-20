// One mission, open: its questions, its plan (to read, edit and approve), what it is doing now, the question
// it may be asking you, its report, and its audit log. Drawn again whenever the mission changes (index.js).
import { api } from "../api.js";
import { h } from "../h.js";
import { t, tp, nf, formatTime } from "../i18n.js";
import { icon, iconEl } from "../icons.js";
import { renderMarkdown } from "../render.js";
import { announce } from "../a11y.js";
import { confirmDialog } from "../dialogs.js";
import { statusOf, isActive, riskLabel, riskHelp, roleLabel, when, duration } from "./labels.js";

const ICON = (name, size = 16) => iconEl(name, { size });
const MODE_NOTE = () => t("Private: only models on this computer, nothing goes to the cloud.");

export function badge(risk) {
  return h("span", { class: `risk risk-${risk}`, title: riskHelp(risk) }, riskLabel(risk));
}

function chip(m) {
  const s = statusOf(m);
  return h("span", { class: `status status-${s.tone}` }, ICON(s.icon, 15), s.label);
}

// ---------- The pieces ----------
function stepIcon(status) {
  const name = { done: "check", running: "play", failed: "alert", skipped: "close", pending: "clock" }[status || "pending"] || "clock";
  return h("span", { class: `step-state step-${status || "pending"}`, title: { done: t("Done"), running: t("Running now"), failed: t("Didn't work"), skipped: t("Skipped"), pending: t("Waiting") }[status || "pending"] }, ICON(name, 15));
}

function actionLine(a, { removable = false, onRemove } = {}) {
  return h(
    "li",
    { class: "action" },
    badge(a.risk),
    h("span", { class: "action-text", text: a.summary }),
    removable ? h("button", { type: "button", class: "icon-btn small", title: t("Take this out of the plan"), "aria-label": `${t("Take this out of the plan")}: ${a.summary}`, onclick: () => onRemove(a) }, ICON("close", 15)) : null
  );
}

function stepDetails(m, s, ctx) {
  const editable = m.status === "awaiting_approval";
  const body = h("div", { class: "step-details" });
  if (editable) {
    const title = h("input", { class: "field", type: "text", value: s.title, "aria-label": t("What this step is called"), maxlength: 140 });
    const inputs = h("textarea", { class: "field textarea", rows: 3, "aria-label": t("What this step does"), maxlength: 1200 });
    inputs.value = s.inputs || "";
    const save = h("button", { type: "button", class: "btn small", onclick: () => ctx.run(() => api.missions.editPlan(m.id, { edit: { [s.id]: { title: title.value, inputs: inputs.value } } })) }, t("Save changes to this step"));
    body.append(h("label", { class: "field-label" }, t("Name"), title), h("label", { class: "field-label" }, t("What it does"), inputs), save);
  } else {
    if (s.inputs) body.append(h("p", { class: "step-line" }, h("strong", { text: t("What it does") }), " ", s.inputs));
  }
  if (s.output) body.append(h("p", { class: "step-line" }, h("strong", { text: t("What it hands back") }), " ", s.output));
  if (s.tools?.length) body.append(h("p", { class: "step-line" }, h("strong", { text: t("Tools") }), " ", s.tools.map((x) => x.replace(/_/g, " ")).join(", ")));
  if (s.dependsOn?.length) body.append(h("p", { class: "step-line" }, h("strong", { text: t("After") }), " ", s.dependsOn.map((id) => m.plan.steps.findIndex((x) => x.id === id) + 1).filter(Boolean).map((n) => t("step {n}", { n })).join(", ")));
  if (s.status === "failed" && s.error) body.append(h("p", { class: "form-error", text: t(s.error) }));
  if (s.output && s.status === "done" && !editable) {
    const out = h("div", { class: "step-output" });
    renderMarkdown(out, s.output);
    body.append(h("p", { class: "step-line" }, h("strong", { text: t("Result") })), out);
  }
  return body;
}

function planCard(m, ctx) {
  const plan = m.plan;
  const editable = m.status === "awaiting_approval";
  const list = h("ol", { class: "steps" });
  plan.steps.forEach((s, i) => {
    const details = h("details", { class: "step-more" }, h("summary", {}, t("Details")), stepDetails(m, s, ctx));
    const row = h(
      "li",
      { class: `step step-row s-${s.status || "pending"}`, "data-step": s.id },
      h(
        "div",
        { class: "step-head" },
        stepIcon(s.status),
        h("span", { class: "step-title" }, h("span", { class: "step-n", text: `${i + 1}.` }), " ", s.title),
        h("span", { class: "chip role", text: roleLabel(s.role) }),
        s.risk && s.risk !== "read" ? badge(s.risk) : null,
        editable ? h("button", { type: "button", class: "icon-btn small", title: t("Take this step out of the plan"), "aria-label": `${t("Take this step out of the plan")}: ${s.title}`, onclick: () => ctx.run(() => api.missions.editPlan(m.id, { remove: [s.id] })) }, ICON("trash", 16)) : null
      ),
      details
    );
    list.append(row);
  });

  const actions = plan.actions || [];
  const covers = h(
    "div",
    { class: "covers" },
    h("h3", { class: "section-title" }, m.status === "awaiting_approval" ? t("Approving covers exactly this") : t("What this plan may do")),
    actions.length
      ? h("ul", { class: "actions" }, actions.map((a) => actionLine(a, { removable: editable, onRemove: (x) => ctx.run(() => api.missions.editPlan(m.id, { removeAction: [x.id] })) })))
      : h("p", { class: "row-desc", text: t("Nothing outside its own folder: it only reads, thinks and writes in the folder it gets for this mission.") }),
    h("p", { class: "row-desc", text: t("Anything else that sends, deletes or runs a command stops the mission and asks you first. Commands like sudo and installs always ask.") })
  );

  const limits = plan.limits || m.limits || {};
  const field = (key, label, max) => {
    const input = h("input", { class: "field narrow", type: "number", min: 0, max, value: limits[key], disabled: !editable, "aria-label": label });
    if (editable) input.addEventListener("change", () => ctx.run(() => api.missions.editPlan(m.id, { limits: { [key]: Number(input.value) } })));
    return h("label", { class: "limit" }, h("span", { text: label }), input);
  };
  const limitBox = h("div", { class: "limits" }, h("h3", { class: "section-title" }, t("Limits")), h("div", { class: "limit-row" }, field("maxMinutes", t("Minutes at most")), field("maxSteps", t("Steps at most")), field("maxCloudCalls", t("Cloud calls at most"))));

  const card = h("section", { class: "card plan" }, h("h3", { class: "section-title" }, t("The plan")), plan.summary ? h("p", { class: "plan-summary", text: plan.summary }) : null, list, covers, limitBox);
  if (m.automation || m.automationId) card.append(h("p", { class: "row-desc repeat-note" }, ICON("repeat", 15), " ", m.automationId ? t("This mission repeats. Approving it again isn't needed: each run uses this plan.") : t("Approving this plan also sets up the repeat you chose.")));
  if (m.private) card.append(h("p", { class: "row-desc" }, ICON("lock", 15), " ", MODE_NOTE()));
  return card;
}

function questionsCard(m, ctx) {
  const inputs = m.clarify.questions.map((q) => {
    const input = h("input", { class: "field", id: `answer-${q.id}`, type: "text", maxlength: 800, "aria-label": q.text, value: ctx.draft(m.id, q.id) });
    input.addEventListener("input", () => ctx.setDraft(m.id, q.id, input.value));
    return h("label", { class: "question" }, h("span", { class: "question-text", text: q.text }), input);
  });
  const send = h(
    "button",
    {
      type: "submit",
      class: "btn btn-primary",
    },
    t("Send my answers")
  );
  const form = h("form", { class: "card questions", onsubmit: (e) => (e.preventDefault(), ctx.run(() => api.missions.answer(m.id, m.clarify.questions.map((q, i) => ({ id: q.id, text: inputs[i].querySelector("input").value }))))) }, h("h3", { class: "section-title" }, t("A few questions first")), h("p", { class: "row-desc", text: t("Only what it can't decide itself. Leave one empty to let it choose.") }), inputs, h("div", { class: "actions-row" }, send));
  return form;
}

function approvalCard(m, ctx) {
  const r = m.pause.request;
  const stepName = r.step ? t("In step “{title}”.", { title: r.step.title }) : "";
  return h(
    "section",
    { class: "card approval", role: "alert" },
    h("h3", { class: "section-title" }, ICON("hand", 18), t("It needs your OK")),
    h("p", { class: "approval-what" }, badge(r.risk), h("span", { text: r.summary })),
    h("p", { class: "row-desc", text: `${r.why ? `${t("Why it asks")}: ${r.why}. ` : ""}${stepName}` }),
    h(
      "div",
      { class: "actions-row" },
      h("button", { type: "button", class: "btn btn-primary", onclick: () => ctx.run(() => api.missions.decide(m.id, r.id, true)) }, t("Allow this once")),
      h("button", { type: "button", class: "btn", onclick: () => ctx.run(() => api.missions.decide(m.id, r.id, false)) }, t("No, carry on without it"))
    )
  );
}

function pausedCard(m, ctx) {
  const kind = m.pause?.kind;
  const buttons = [];
  let text = t(m.pause?.message || "");
  if (kind === "quota") {
    buttons.push(h("button", { type: "button", class: "btn", onclick: () => ctx.run(() => api.missions.resume(m.id)) }, t("Try again now")));
    const wait = m.pause.until ? t("Gemini's free limit is reached for now. The mission waits and carries on by itself around {time}.", { time: formatTime(m.pause.until) }) : text;
    text = t("{message} (It uses Gemini's free limit; billing on your key in Google AI Studio raises it.)", { message: wait });
  } else if (kind === "limit") {
    buttons.push(h("button", { type: "button", class: "btn btn-primary", onclick: () => ctx.run(() => api.missions.resume(m.id, true)) }, t("Continue (the limit doubles)")));
    const used = { cloudCalls: t("This mission has used its {n} cloud calls.", { n: m.limits?.maxCloudCalls }), maxMinutes: t("This mission has used its {n} minutes.", { n: m.limits?.maxMinutes }), maxSteps: t("This mission has used its {n} steps.", { n: m.limits?.maxSteps }) }[m.pause.which];
    if (used) text = `${used} ${t("It stopped there. You can continue (the limit doubles) or stop for good.")}`;
  } else if (kind === "private") {
    buttons.push(h("button", { type: "button", class: "btn", onclick: () => ctx.run(() => api.missions.resume(m.id)) }, t("Try again")));
  } else if (kind === "queued") {
    return null;
  } else {
    buttons.push(h("button", { type: "button", class: "btn", onclick: () => ctx.run(() => api.missions.resume(m.id)) }, t("Carry on")));
  }
  return h("section", { class: "card paused" }, h("h3", { class: "section-title" }, ICON(statusOf(m).icon, 18), statusOf(m).label), h("p", { text }), h("div", { class: "actions-row" }, buttons));
}

function progressCard(m) {
  const p = m.progress;
  const bar = h("div", { class: "bar", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": p.total, "aria-valuenow": p.done, "aria-label": t("Progress") }, h("i", { style: `width:${p.total ? Math.round((p.done / p.total) * 100) : 0}%` }));
  const bits = [p.total ? tp("{n} of {total} step done", "{n} of {total} steps done", p.done, { total: p.total }) : "", m.usage?.runMs ? t("{time} so far", { time: duration(m.usage.runMs) }) : ""].filter(Boolean).join(" · ");
  const now = p.current ? h("p", { class: "now" }, ICON("play", 15), " ", t("Now: {title}", { title: p.current.title })) : null;
  const model = m.model
    ? h("p", { class: "model-line" }, ICON(m.model.kind === "cloud" ? "cloud" : "chip", 15), " ", [m.model.kind === "cloud" ? t("The manager is doing this step") : t("{role} specialist", { role: roleLabel(m.model.role) }), m.model.model, m.model.placement === "cpu" ? t("on the processor") : m.model.placement === "split" ? t("part on the graphics card") : "", /^The .+ specialist$/.test(m.model.why || "") ? "" : t(m.model.why || "")].filter(Boolean).join(" · "))
    : null;
  return h("section", { class: "card progress" }, bar, h("p", { class: "row-desc", text: bits }), now, model);
}

function timeline(m) {
  const items = m.timeline.slice(-30).reverse();
  if (!items.length) return null;
  return h(
    "details",
    { class: "card timeline", open: isActive(m) },
    h("summary", {}, t("What happened")),
    h("ul", { class: "log" }, items.map((e) => h("li", { class: `log-${e.type}` }, h("time", { text: when(e.at) }), h("span", { text: e.text }))))
  );
}

function reportCard(m) {
  const box = h("section", { class: "card report" }, h("h3", { class: "section-title" }, t("The report")));
  const body = h("div", { class: "report-body" });
  box.append(body);
  api.missions.report(m.id).then(
    ({ markdown }) => renderMarkdown(body, markdown || m.report?.summary || ""),
    () => (body.textContent = m.report?.summary || "")
  );
  const r = m.report || {};
  if (r.note) box.append(h("p", { class: "row-desc" }, ICON("book", 15), " ", t("Saved in your notes vault as {note}", { note: r.note })));
  if (r.sources?.length) box.append(h("details", { class: "sources" }, h("summary", {}, tp("{n} source", "{n} sources", r.sources.length)), h("ul", {}, r.sources.map((u) => h("li", {}, /^https?:/.test(u) ? h("a", { href: u, target: "_blank", rel: "noopener noreferrer", text: u }) : u)))));
  if (r.files?.length) box.append(h("details", { class: "sources" }, h("summary", {}, tp("{n} file", "{n} files", r.files.length)), h("ul", {}, r.files.map((f) => h("li", { text: f })))));
  if (m.workdir) box.append(h("p", { class: "row-desc", text: t("Its folder: {path}", { path: m.workdir }) }));
  return box;
}

function auditCard(m) {
  const body = h("div", { class: "audit-body" });
  const details = h("details", { class: "card audit" }, h("summary", {}, t("Audit log: every tool call and model it used")), body);
  details.addEventListener("toggle", async () => {
    if (!details.open || body.dataset.loaded) return;
    body.dataset.loaded = "1";
    body.textContent = t("Loading…");
    try {
      const { entries } = await api.missions.audit(m.id);
      const rows = entries.filter((e) => ["tool", "route", "model-used", "approved", "approval-asked", "review", "manager", "step-error", "done", "failed", "stopped", "wait"].includes(e.type));
      body.replaceChildren(
        rows.length
          ? h(
              "table",
              { class: "audit-table" },
              h("thead", {}, h("tr", {}, h("th", { text: t("When") }), h("th", { text: t("What") }), h("th", { text: t("Details") }))),
              h(
                "tbody",
                {},
                rows.map((e) => {
                  const what = e.type === "tool" ? `${e.tool}${e.risk ? ` [${e.risk}]` : ""}${e.approval ? ` (${e.approval})` : ""}` : e.type === "route" || e.type === "model-used" ? `${e.type === "route" ? t("model chosen") : t("model used")}: ${e.model || e.name || ""}${e.kind ? ` (${e.kind})` : ""}` : e.type;
                  const detail = e.type === "tool" ? [e.args, e.denied || e.result].filter(Boolean).join(" → ") : e.reason || e.error || e.text || (e.request ? e.request.summary : "") || "";
                  return h("tr", {}, h("td", { text: new Date(e.at).toLocaleTimeString() }), h("td", { text: what }), h("td", { class: "mono", text: String(detail).slice(0, 400) }));
                })
              )
            )
          : h("p", { class: "row-desc", text: t("Nothing logged yet.") })
      );
    } catch (err) {
      body.textContent = err.message;
    }
  });
  return details;
}

function repeatCard(m, ctx) {
  const kind = h("select", { class: "field", "aria-label": t("How often") }, [
    h("option", { value: "daily", text: t("Every day") }),
    h("option", { value: "weekdays", text: t("Weekdays") }),
    h("option", { value: "weekly", text: t("Every week") }),
    h("option", { value: "interval", text: t("Every few hours") }),
  ]);
  const time = h("input", { class: "field narrow", type: "time", value: "08:00", "aria-label": t("At what time") });
  const day = h("select", { class: "field", "aria-label": t("On which day") }, [1, 2, 3, 4, 5, 6, 7].map((d) => h("option", { value: d, text: [t("Monday"), t("Tuesday"), t("Wednesday"), t("Thursday"), t("Friday"), t("Saturday"), t("Sunday")][d - 1] })));
  day.value = "5";
  const hours = h("input", { class: "field narrow", type: "number", min: 1, max: 168, value: 6, "aria-label": t("Hours between runs") });
  const sync = () => {
    day.hidden = kind.value !== "weekly";
    time.hidden = kind.value === "interval";
    hours.hidden = kind.value !== "interval";
  };
  kind.addEventListener("change", sync);
  sync();
  const save = h(
    "button",
    {
      type: "button",
      class: "btn",
      onclick: () => {
        const schedule = kind.value === "interval" ? { kind: "interval", minutes: Math.max(5, Number(hours.value) * 60) } : kind.value === "weekly" ? { kind: "weekly", days: [Number(day.value)], time: time.value } : { kind: kind.value, time: time.value };
        ctx.run(() => api.missions.automate(m.id, { schedule, name: m.title }));
      },
    },
    t("Repeat this mission")
  );
  return h("section", { class: "card repeat" }, h("h3", { class: "section-title" }, ICON("repeat", 18), t("Do this again")), h("p", { class: "row-desc", text: t("It runs by itself with exactly the plan you approved, also with the window closed (from the tray).") }), h("div", { class: "repeat-row" }, kind, day, time, hours, save));
}

// ---------- The whole page ----------
// ctx: { run(fn) → runs an API call, shows errors, redraws; draft/setDraft for answers; goBack() }
export function renderDetail(m, ctx) {
  const root = h("div", { class: "mission-detail" });
  const s = statusOf(m);
  const stoppable = isActive(m);
  const head = h(
    "div",
    { class: "detail-head" },
    h("a", { class: "back-link", href: "#missions" }, ICON("chevronRight", 16), t("All missions")),
    h("div", { class: "detail-titles" }, h("h2", { class: "mission-title", id: "mission-title", tabindex: -1, text: m.title }), h("div", { class: "detail-meta" }, chip(m), m.private ? h("span", { class: "chip" }, ICON("lock", 14), t("Private")) : null, h("span", { class: "row-desc", text: `${m.source === "telegram" ? t("From Telegram") : m.source === "chat" ? t("From a chat") : m.source === "schedule" ? t("Started by its schedule") : t("From Missions")} · ${when(m.createdAt)}` }))),
    stoppable
      ? h(
          "button",
          {
            type: "button",
            class: "btn btn-danger stop-btn",
            onclick: async () => {
              if (m.status === "running" || m.status === "paused") ctx.run(() => api.missions.stop(m.id));
              else if (await confirmDialog({ title: t("Stop this mission?"), message: t("It hasn't started. Nothing was done."), confirm: t("Stop it") })) ctx.run(() => api.missions.stop(m.id));
            },
          },
          ICON("stop", 18),
          m.status === "running" || m.status === "paused" ? t("Stop") : t("Discard")
        )
      : null
  );
  root.append(head);
  root.append(h("p", { class: "goal" }, h("strong", { text: t("The goal") }), " ", m.goal));

  if (m.status === "failed") root.append(h("section", { class: "card failed", role: "alert" }, h("h3", { class: "section-title" }, ICON("alert", 18), t("It didn't work out")), h("p", { text: m.error ? t(m.error) : t("Something went wrong.") }), h("div", { class: "actions-row" }, h("button", { type: "button", class: "btn", onclick: () => ctx.run(() => api.missions.resume(m.id)) }, t("Try again")))));
  if (m.status === "stopped") root.append(h("section", { class: "card stopped" }, h("p", { text: t("You stopped this mission.") }), m.approvedAt ? h("div", { class: "actions-row" }, h("button", { type: "button", class: "btn", onclick: () => ctx.run(() => api.missions.resume(m.id)) }, t("Carry on where it stopped"))) : null));
  if (m.status === "paused" && m.pause?.kind === "approval") root.append(approvalCard(m, ctx));
  else if (m.status === "paused" || (m.status === "running" && m.pause)) {
    const card = pausedCard(m, ctx);
    if (card) root.append(card);
  }
  if (m.status === "clarifying") root.append(questionsCard(m, ctx));
  if (m.status === "planning") root.append(h("section", { class: "card" }, h("p", { class: "planning" }, h("span", { class: "spinner", "aria-hidden": "true" }), t("Making a plan…"))));
  if (m.plan && m.status !== "clarifying") {
    if (["running", "paused"].includes(m.status)) root.append(progressCard(m));
    // Once it's over, the report comes first and the plan folds away
    if (m.status === "done") {
      root.append(reportCard(m));
      if (!m.automationId) root.append(repeatCard(m, ctx));
    }
    const settled = ["done", "stopped", "failed"].includes(m.status);
    root.append(settled ? h("details", { class: "plan-fold" }, h("summary", {}, t("The plan it followed")), planCard(m, ctx)) : planCard(m, ctx));
    if (m.status === "awaiting_approval") {
      root.append(
        h(
          "div",
          { class: "approve-bar" },
          h("button", { type: "button", class: "btn btn-primary big", onclick: () => ctx.run(() => api.missions.approve(m.id)) }, ICON("check", 18), t("Approve and run")),
          h("span", { class: "row-desc", text: t("You approve once. It runs in the background, and Stop is always here.") })
        )
      );
    }
  }
  if (m.status === "done" && !m.plan) root.append(reportCard(m));
  const tl = timeline(m);
  if (tl) root.append(tl);
  if (m.status !== "planning") root.append(auditCard(m));
  root.append(
    h(
      "div",
      { class: "actions-row end" },
      !isActive(m)
        ? h(
            "button",
            {
              type: "button",
              class: "btn btn-ghost",
              onclick: async () => {
                if (await confirmDialog({ title: t("Remove this mission?"), message: t("Its history and audit log go. The files it made and its note stay."), confirm: t("Remove") })) {
                  await ctx.run(() => api.missions.remove(m.id));
                  ctx.goBack();
                }
              },
            },
            ICON("trash", 16),
            t("Remove from the list")
          )
        : null
    )
  );
  return root;
}
