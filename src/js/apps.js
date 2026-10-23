// ---------- Settings → Connected Apps: apps and MCP servers ----------
// The built-in apps (server/connectors/) as cards you switch on, set up and
// test, and any other app through MCP (server/mcp.js).
import { iconEl } from "./icons.js";
import { api } from "./api.js";
import { t, tp } from "./i18n.js";
import { confirmDialog } from "./dialogs.js";
import { skeleton } from "./ui.js";
import { getSettings, updateSettings, onSettings } from "./store.js";

const grid = document.getElementById("app-grid");
const mcpList = document.getElementById("mcp-list");
const form = document.getElementById("mcp-form");
const mcpStatus = document.getElementById("mcp-status");
const presetSelect = document.getElementById("mcp-preset");
const presetHelp = document.getElementById("mcp-preset-help");

// Well-known MCP servers, to start from (they need Node's npx or Python's uvx)
const PRESETS = {
  playwright: { name: t("Browser"), transport: "stdio", command: "npx", args: "-y @playwright/mcp@latest", trust: "ask", help: t("Opens and uses web pages in a real browser: test the websites you build, fill forms, take screenshots. Needs Node.js.") },
  context7: { name: t("Code docs"), transport: "stdio", command: "npx", args: "-y @upstash/context7-mcp", trust: "all", help: t("Up-to-date documentation and examples for programming libraries, for building apps. Needs Node.js.") },
  git: { name: t("Git"), transport: "stdio", command: "uvx", args: "mcp-server-git --repository ~/projects/my-app", trust: "read-only", local: true, help: t("History, diffs, branches and commits of one Git repository (change the path). Needs uv: pipx install uv.") },
  files: { name: t("Files"), transport: "stdio", command: "npx", args: "-y @modelcontextprotocol/server-filesystem ~/Documents", trust: "read-only", local: true, help: t("Reads and writes files in the folders you list. (Friends' own file access in Settings → AI & privacy does this too.)") },
  memory: { name: t("Knowledge graph"), transport: "stdio", command: "npx", args: "-y @modelcontextprotocol/server-memory", trust: "all", local: true, help: t("A graph of people, things and how they relate, kept on this computer.") },
  fetch: { name: t("Fetch"), transport: "stdio", command: "uvx", args: "mcp-server-fetch", trust: "read-only", help: t("Fetches web pages as Markdown. Needs uv.") },
  github: { name: t("GitHub MCP"), transport: "http", url: "https://api.githubcopilot.com/mcp/", trust: "read-only", help: t("GitHub's own MCP server, with everything GitHub can do. Paste a personal access token below.") },
};

for (const [id, p] of Object.entries(PRESETS)) presetSelect.append(Object.assign(document.createElement("option"), { value: id, textContent: p.name }));

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ----- Built-in apps -----
function statusOf(app) {
  if (!app.config.enabled) return [t("Off"), "off"];
  if (app.privateOff) return [t("Off in Private mode"), "off"];
  if (!app.ready) return [t("Needs setting up"), "warn"];
  return [t("On"), "on"];
}

function card(app) {
  const c = el("div", "app-card");
  c.dataset.id = app.id;
  const head = el("div", "app-head");
  const toggle = Object.assign(document.createElement("input"), { type: "checkbox", className: "toggle", checked: app.config.enabled });
  toggle.setAttribute("aria-label", t("{name} on", { name: t(app.name) }));
  toggle.addEventListener("change", () => save(app.id, { enabled: toggle.checked }));
  const [label, kind] = statusOf(app);
  const title = el("div", "app-title");
  const name = el("strong", "");
  name.append(iconEl(app.icon && app.icon.length < 20 ? app.icon : "puzzle", { size: 18 }), document.createTextNode(` ${t(app.name)}`));
  title.append(name, el("span", `app-status ${kind}`, label));
  head.append(title, toggle);
  c.append(head, el("p", "row-desc", t(app.description)));

  if (app.fields.length) {
    const box = el("details", "app-setup");
    box.append(el("summary", "", app.ready ? t("Settings") : t("Set up")));
    if (!app.ready && app.config.enabled) box.open = true;
    if (app.help) box.append(el("p", "row-desc", t(app.help)));
    if (app.link) {
      const a = Object.assign(el("a", "app-link", t("Open the page ↗")), { href: app.link, target: "_blank", rel: "noopener noreferrer" });
      box.append(a);
    }
    const inputs = {};
    for (const f of app.fields) {
      const wrap = el("label", "form-field");
      wrap.append(el("span", "row-label", t(f.label)));
      let input;
      if (f.type === "select") {
        input = el("select", "field");
        for (const [value, text] of f.options) input.append(Object.assign(document.createElement("option"), { value, textContent: t(text) }));
        input.value = app.config[f.key] || f.options[0][0];
      } else {
        input = Object.assign(document.createElement("input"), { className: "field", type: f.secret ? "password" : "text", autocomplete: "off", spellcheck: false });
        input.placeholder = f.secret && app.config[f.key] ? t("Saved (type to replace)") : f.placeholder || "";
        if (!f.secret) input.value = app.config[f.key] || "";
      }
      if (f.help) wrap.append(el("span", "row-desc", t(f.help)));
      wrap.append(input);
      inputs[f.key] = input;
      box.append(wrap);
    }
    const bar = el("div", "form-test-bar");
    const saveBtn = el("button", "btn small btn-primary", t("Save"));
    const testBtn = el("button", "btn small", t("Test"));
    const feedback = el("span", "test-feedback");
    saveBtn.type = testBtn.type = "button";
    saveBtn.addEventListener("click", async () => {
      const body = { enabled: true };
      for (const f of app.fields) {
        const v = inputs[f.key].value;
        if (!f.secret || v.trim()) body[f.key] = v;
      }
      await save(app.id, body, feedback);
    });
    testBtn.addEventListener("click", () => test(app.id, feedback));
    bar.append(saveBtn, testBtn);
    if (app.fields.some((f) => f.secret && app.config[f.key])) {
      const forget = el("button", "btn small btn-danger", t("Disconnect"));
      forget.type = "button";
      forget.addEventListener("click", async () => {
        const ok = await confirmDialog({ title: t("Disconnect {name}?", { name: t(app.name) }), message: t("The saved token is removed from this computer. You can connect again at any time."), confirm: t("Disconnect"), danger: true });
        if (!ok) return;
        await api.connectors.remove(app.id).catch(() => {});
        refresh();
      });
      bar.append(forget);
    }
    bar.append(feedback);
    box.append(bar);
    c.append(box);
  } else {
    const bar = el("div", "form-test-bar");
    const testBtn = el("button", "btn small", t("Test"));
    testBtn.type = "button";
    const feedback = el("span", "test-feedback");
    testBtn.addEventListener("click", () => test(app.id, feedback));
    bar.append(testBtn, feedback);
    c.append(bar);
  }
  return c;
}

async function save(id, body, feedback) {
  try {
    await api.connectors.save(id, body);
    if (feedback) {
      feedback.textContent = t("Saved.");
      feedback.className = "test-feedback ok";
    }
    setTimeout(refresh, feedback ? 700 : 0);
  } catch (err) {
    if (feedback) {
      feedback.textContent = err.message;
      feedback.className = "test-feedback error";
    }
  }
}

async function test(id, feedback) {
  feedback.textContent = t("Testing…");
  feedback.className = "test-feedback";
  try {
    const r = await api.connectors.test(id);
    feedback.textContent = r.message;
    feedback.className = "test-feedback ok";
  } catch (err) {
    feedback.textContent = err.message;
    feedback.className = "test-feedback error";
  }
}

// ----- MCP servers -----
const STATUS = { ready: [t("Running"), "on"], starting: [t("Starting…"), "warn"], error: [t("Problem"), "error"], stopped: [t("Stopped"), "off"], off: [t("Off"), "off"] };

function mcpItem(s) {
  const li = el("li", "app-card mcp-item");
  const head = el("div", "app-head");
  const [label, kind] = STATUS[s.status] || [s.status, "off"];
  const title = el("div", "app-title");
  const name = el("strong", "");
  name.append(iconEl("puzzle", { size: 18 }), document.createTextNode(` ${s.name}`));
  title.append(name, el("span", `app-status ${kind}`, label));
  const toggle = Object.assign(document.createElement("input"), { type: "checkbox", className: "toggle", checked: s.enabled });
  toggle.setAttribute("aria-label", t("{name} on", { name: s.name }));
  toggle.addEventListener("change", async () => {
    await api.mcp.save({ id: s.id, enabled: toggle.checked }).catch(() => {});
    setTimeout(refresh, 1500);
  });
  head.append(title, toggle);
  li.append(head);
  li.append(el("p", "row-desc mcp-where", s.transport === "http" ? s.url : `${s.command} ${s.args}`.trim()));
  if (s.error) li.append(el("p", "form-error", s.error));
  if (s.tools.length) {
    const tools = el("details", "app-setup");
    tools.append(el("summary", "", tp("{n} tool", "{n} tools", s.tools.length)));
    const ul = el("ul", "mcp-tools");
    for (const tool of s.tools) {
      const item = el("li", "");
      item.append(el("code", "", tool.name), document.createTextNode(` ${tool.readOnly ? t("(reads only)") + " " : ""}${tool.description.slice(0, 140)}`));
      ul.append(item);
    }
    tools.append(ul);
    li.append(tools);
  }
  const bar = el("div", "form-test-bar");
  const trust = el("select", "field");
  for (const [v, label] of [["ask", t("Always ask")], ["read-only", t("Ask, except reading")], ["all", t("Never ask")]]) trust.append(Object.assign(document.createElement("option"), { value: v, textContent: label }));
  trust.value = s.trust;
  trust.setAttribute("aria-label", t("Ask before each action"));
  trust.addEventListener("change", () => api.mcp.save({ id: s.id, trust: trust.value }).then(refresh, () => {}));
  const restart = el("button", "btn small", t("Restart"));
  restart.type = "button";
  restart.addEventListener("click", async () => {
    restart.disabled = true;
    await api.mcp.restart(s.id).catch(() => {});
    refresh();
  });
  const remove = el("button", "btn small btn-danger", t("Remove"));
  remove.type = "button";
  remove.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: t("Remove {name}?", { name: s.name }), message: t("The app is stopped and taken out of the list. Its saved token is deleted."), confirm: t("Remove"), danger: true });
    if (!ok) return;
    await api.mcp.remove(s.id).catch(() => {});
    refresh();
  });
  bar.append(trust, restart, remove);
  li.append(bar);
  return li;
}

function syncTransport() {
  const http = form.transport.value === "http";
  form.querySelector(".mcp-http").hidden = !http;
  form.querySelector(".mcp-stdio").hidden = http;
}
form.transport.addEventListener("change", syncTransport);

presetSelect.addEventListener("change", () => {
  const p = PRESETS[presetSelect.value];
  presetHelp.textContent = p?.help || "";
  if (!p) return;
  form.name.value = p.name;
  form.transport.value = p.transport;
  form.command.value = p.command || "";
  form.args.value = p.args || "";
  form.url.value = p.url || "";
  form.trust.value = p.trust || "ask";
  form.local.checked = p.local === true;
  syncTransport();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  mcpStatus.textContent = t("Adding…");
  mcpStatus.className = "test-feedback";
  try {
    await api.mcp.save({
      name: form.name.value,
      transport: form.transport.value,
      command: form.command.value,
      args: form.args.value,
      cwd: form.cwd.value,
      env: form.env.value,
      url: form.url.value,
      token: form.token.value,
      trust: form.trust.value,
      local: form.local.checked,
    });
    form.reset();
    presetHelp.textContent = "";
    syncTransport();
    mcpStatus.textContent = t("Added. It starts in a moment (the first start can take a minute while it downloads).");
    mcpStatus.className = "test-feedback ok";
    refresh();
    setTimeout(refresh, 5000);
    setTimeout(refresh, 20000);
  } catch (err) {
    mcpStatus.textContent = err.message;
    mcpStatus.className = "test-feedback error";
  }
});

grid.append(skeleton());
mcpList.append(skeleton("li"));

// ----- Telegram companion bot settings -----
function syncTelegramAllowedUsers() {
  const raw = document.getElementById("telegram-allowed-users")?.value || "";
  const ids = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  updateSettings((s) => {
    s.telegram.allowedUserIds = ids;
  });
}

document.getElementById("telegram-allowed-users")?.addEventListener("change", syncTelegramAllowedUsers);

document.getElementById("telegram-save-btn")?.addEventListener("click", async () => {
  syncTelegramAllowedUsers();
  const feedback = document.getElementById("telegram-feedback");
  const tokenInput = document.getElementById("telegram-token-input");
  try {
    // The token goes to the system keyring, not into the settings
    if (tokenInput?.value.trim()) {
      await api.telegram.saveToken(tokenInput.value.trim());
      tokenInput.value = "";
    }
    if (feedback) {
      feedback.textContent = t("Saved.");
      feedback.className = "test-feedback ok";
      setTimeout(() => { feedback.textContent = ""; }, 2500);
    }
  } catch (err) {
    if (feedback) {
      feedback.textContent = err.message;
      feedback.className = "test-feedback error";
    }
  }
  await refreshTelegramStatus();
});

document.getElementById("telegram-test-btn")?.addEventListener("click", async () => {
  const feedback = document.getElementById("telegram-feedback");
  if (feedback) {
    feedback.textContent = t("Testing bot connection…");
    feedback.className = "test-feedback";
  }
  try {
    const res = await api.telegram.test();
    if (res.ok) {
      if (feedback) {
        feedback.textContent = t("Connected as @{name}!", { name: res.bot?.username || "bot" });
        feedback.className = "test-feedback ok";
      }
    } else {
      if (feedback) {
        feedback.textContent = res.error || t("Failed to connect.");
        feedback.className = "test-feedback error";
      }
    }
    refreshTelegramStatus();
  } catch (err) {
    if (feedback) {
      feedback.textContent = err.message;
      feedback.className = "test-feedback error";
    }
  }
});

async function refreshTelegramStatus() {
  const pill = document.getElementById("telegram-status-pill");
  if (!pill) return;
  try {
    const st = await api.telegram.status();
    if (st.running) {
      pill.textContent = st.botUsername ? `@${st.botUsername}` : t("Active");
      pill.className = "app-status on";
    } else if (st.enabled && st.lastError) {
      pill.textContent = t("Error");
      pill.className = "app-status warn";
      pill.title = st.lastError;
    } else if (st.enabled) {
      pill.textContent = t("Starting…");
      pill.className = "app-status warn";
    } else {
      pill.textContent = t("Off");
      pill.className = "app-status off";
    }
  } catch {
    pill.textContent = t("Off");
    pill.className = "app-status off";
  }
}

// ----- Telegram pairing & user management -----
let pairingPollTimer = null;

async function renderTelegramPairedUsers() {
  const container = document.getElementById("telegram-paired-list");
  const emptyHint = document.getElementById("telegram-no-paired");
  if (!container) return;

  try {
    const health = await api.telegram.health?.().catch(() => null);
    const s = await api.settings.get();
    const paired = s?.telegram?.pairedUsers || [];

    if (!paired.length) {
      container.innerHTML = "";
      if (emptyHint) emptyHint.style.display = "block";
      return;
    }

    if (emptyHint) emptyHint.style.display = "none";
    container.innerHTML = "";

    for (const u of paired) {
      const li = document.createElement("li");
      li.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: var(--bg-subtle, rgba(0,0,0,0.03)); border-radius: 6px; font-size: 0.9em;";

      const info = document.createElement("div");
      info.innerHTML = `<strong>${u.firstName || u.username || "User"}</strong> ${u.username ? `(@${u.username})` : ""} <span style="font-family: monospace; font-size: 0.85em; opacity: 0.7;">ID: ${u.id}</span>`;

      const actions = document.createElement("div");
      actions.style.cssText = "display: flex; align-items: center; gap: 8px;";

      const select = document.createElement("select");
      select.className = "field";
      select.style.padding = "2px 6px";
      select.innerHTML = `
        <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
        <option value="chat" ${u.role === "chat" ? "selected" : ""}>Chat</option>
        <option value="notify_only" ${u.role === "notify_only" ? "selected" : ""}>Notify only</option>
      `;
      select.addEventListener("change", async () => {
        await api.telegram.setUserRole(u.id, select.value);
        renderTelegramPairedUsers();
      });

      const revokeBtn = document.createElement("button");
      revokeBtn.type = "button";
      revokeBtn.className = "btn small";
      revokeBtn.textContent = t("Revoke");
      revokeBtn.addEventListener("click", async () => {
        await api.telegram.revokeUser(u.id);
        renderTelegramPairedUsers();
      });

      actions.append(select, revokeBtn);
      li.append(info, actions);
      container.append(li);
    }
  } catch (err) {
    console.debug("Failed to render paired users:", err);
  }
}

document.getElementById("telegram-pair-btn")?.addEventListener("click", async () => {
  const display = document.getElementById("telegram-pair-display");
  const hint = document.getElementById("telegram-pair-hint");
  const cmd = document.getElementById("telegram-pair-cmd");
  try {
    const res = await api.telegram.pairStart();
    if (res && res.code) {
      if (display) display.textContent = res.code;
      if (cmd) cmd.textContent = `/pair ${res.code}`;
      if (hint) hint.style.display = "block";

      if (pairingPollTimer) clearInterval(pairingPollTimer);
      pairingPollTimer = setInterval(async () => {
        const st = await api.telegram.pairStatus();
        if (!st.active) {
          clearInterval(pairingPollTimer);
          pairingPollTimer = null;
          if (display) display.textContent = "";
          if (hint) hint.style.display = "none";
          renderTelegramPairedUsers();
        }
      }, 4000);
    }
  } catch (err) {
    console.warn("Pairing start failed:", err);
  }
});

// ----- Notification Router Matrix & Log -----
const NOTIF_EVENTS = [
  { id: "reminder", label: t("Reminders & alarms") },
  { id: "focus_complete", label: t("Focus session complete") },
  { id: "mission_plan", label: t("Mission plan to approve") },
  { id: "mission_question", label: t("Mission question for you") },
  { id: "mission_done", label: t("Mission finished") },
  { id: "mission_trouble", label: t("Mission trouble / paused") },
  { id: "watch_alert", label: t("Watcher alerts & system monitors") },
  { id: "briefing", label: t("Morning daily briefing") },
  { id: "reddit_match", label: t("Reddit community watch matches") },
];

async function renderNotificationMatrix() {
  const tbody = document.getElementById("notif-matrix-tbody");
  if (!tbody) return;

  const s = await api.settings.get();
  const matrix = s?.notifications?.matrix || {};
  tbody.innerHTML = "";

  const chNames = { desktop: t("Desktop"), inapp: t("In-App"), telegram: t("Telegram") };
  for (const ev of NOTIF_EVENTS) {
    const row = document.createElement("tr");
    row.style.borderBottom = "1px solid var(--border)";

    const labelTd = document.createElement("th");
    labelTd.scope = "row";
    labelTd.style.fontWeight = "normal";
    labelTd.style.textAlign = "left";
    labelTd.style.padding = "8px 12px";
    labelTd.textContent = ev.label;
    row.appendChild(labelTd);

    for (const ch of ["desktop", "inapp", "telegram"]) {
      const td = document.createElement("td");
      td.style.cssText = "padding: 8px 12px; text-align: center;";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.setAttribute("aria-label", `${ev.label} - ${chNames[ch] || ch}`);
      cb.checked = matrix[ev.id]?.[ch] !== false; // Default on
      cb.addEventListener("change", () => {
        updateSettings((settingsObj) => {
          if (!settingsObj.notifications) settingsObj.notifications = {};
          if (!settingsObj.notifications.matrix) settingsObj.notifications.matrix = {};
          if (!settingsObj.notifications.matrix[ev.id]) settingsObj.notifications.matrix[ev.id] = {};
          settingsObj.notifications.matrix[ev.id][ch] = cb.checked;
        });
      });
      td.appendChild(cb);
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }
}

async function renderNotificationLog() {
  const logContainer = document.getElementById("notif-log-container");
  if (!logContainer) return;
  try {
    const res = await api.notifications.getLog();
    const list = res.log || [];
    if (!list.length) {
      logContainer.innerHTML = `<span class="hint">${t("No delivery logs yet.")}</span>`;
      return;
    }
    logContainer.innerHTML = list.slice(0, 30).map((e) => {
      const time = new Date(e.timestamp).toLocaleTimeString();
      return `<div style="padding: 3px 0; border-bottom: 1px dashed rgba(128,128,128,0.2);">
        <span style="opacity: 0.6;">[${time}]</span> <strong>${e.event}</strong>: ${e.title} → <em>${e.channel}</em> (${e.success ? "ok" : "failed"})
      </div>`;
    }).join("");
  } catch (err) {
    console.debug("Failed to read notification log:", err);
  }
}

document.getElementById("notif-refresh-log-btn")?.addEventListener("click", renderNotificationLog);
document.getElementById("notif-test-btn")?.addEventListener("click", async () => {
  await api.notifications.sendTest({ title: "Test Notification", body: "Friends notification router test alert." });
  setTimeout(renderNotificationLog, 500);
});

onSettings((s) => {
  const allowedInput = document.getElementById("telegram-allowed-users");
  if (allowedInput && document.activeElement !== allowedInput) {
    allowedInput.value = (s?.telegram?.allowedUserIds || []).join(", ");
  }
  const tokenInput = document.getElementById("telegram-token-input");
  if (tokenInput) tokenInput.placeholder = s?.telegram?.hasToken ? t("Saved. Type a new token to replace it.") : "123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ";
  refreshTelegramStatus();
  renderTelegramPairedUsers();
  renderNotificationMatrix();
});

// ----- Drawing it all -----
async function refresh() {
  refreshTelegramStatus();
  try {
    const { apps, mcp } = await api.connectors.list();
    grid.replaceChildren(...apps.map(card));
    mcpList.replaceChildren(...(mcp.length ? mcp.map(mcpItem) : [el("li", "memory-empty", t("No extra apps yet. Add one below, or start from a ready-made one."))]));
  } catch (err) {
    grid.replaceChildren(el("p", "form-error", err.message));
  }
}

document.addEventListener("friends:settings", (e) => {
  if (e.detail.open) {
    refresh();
    if (e.detail.tab === "telegram") {
      refreshTelegramStatus();
      renderTelegramPairedUsers();
    }
    if (e.detail.tab === "notifications") {
      renderNotificationMatrix();
      renderNotificationLog();
    }
  }
});

