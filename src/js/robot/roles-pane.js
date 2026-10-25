// ---------- Settings → Robot → Roles ----------
// Every role to pick from (a teacher, a tutor, a coach…), and the ones you make yourself: a name, a line about it,
// what it should do, and up to six quick actions. The choice is the same one the robot's window and voice mode make.
import { h } from "../h.js";
import { t } from "../i18n.js";
import { getSettings, onSettings, updateSettings } from "../store.js";
import { allRoles, activeRole, MAX_CUSTOM_ROLES } from "./roles.mjs";
import { wbIcon } from "../whiteboard/wb-icons.js";
import { chooseRole, roleName } from "../whiteboard/robotwin.js";
import { WINDOWS } from "../whiteboard/geometry.mjs";
import { characterName } from "../characters.js";
import { FACE } from "../whiteboard/robotwin.js";
import { DEFAULT_PLACE } from "../whiteboard/geometry.mjs";

const root = document.getElementById("roles-root");
const now = document.getElementById("robot-now-card");

const roles = () => getSettings()?.roles || {};
const setRoles = (fn) =>
  updateSettings((s) => {
    const next = { ...(s.roles || {}) };
    fn(next);
    s.roles = next;
  });

// "Label: what to say", one per line
const chipsToText = (chips) => (chips || []).map(([label, prompt]) => `${label}: ${prompt}`).join("\n");
const textToChips = (text) =>
  String(text || "")
    .split("\n")
    .map((line) => {
      const i = line.indexOf(":");
      return i > 0 ? [line.slice(0, i).trim(), line.slice(i + 1).trim()] : null;
    })
    .filter((c) => c && c[0] && c[1])
    .slice(0, 6);

let editing = null; // id of the role of yours that is open

function card(role, current) {
  return h("button", { type: "button", role: "radio", "aria-checked": String(role.id === current), class: `rw-role${role.id === current ? " current" : ""}`, onclick: () => chooseRole(role.id) },
    h("span", { class: "rw-role-icon", html: wbIcon(role.icon || "star", 18) }),
    h("span", { class: "rw-role-text" }, h("strong", {}, roleName(role)), h("small", {}, role.custom ? role.tagline : t(role.tagline))));
}

function editor(role) {
  const name = h("input", { type: "text", class: "field", value: role.name, maxlength: "40", "aria-label": t("Name of the role") });
  const tagline = h("input", { type: "text", class: "field", value: role.tagline, maxlength: "160", "aria-label": t("In one line") });
  const instructions = h("textarea", { class: "field textarea", rows: "6", maxlength: "3000", "aria-label": t("What it should do"), placeholder: t("You are my … Do this, and that. Never this.") });
  instructions.value = role.instructions;
  const board = h("textarea", { class: "field textarea", rows: "3", maxlength: "1000", "aria-label": t("What it should do on the whiteboard") });
  board.value = role.board;
  const chips = h("textarea", { class: "field textarea", rows: "4", "aria-label": t("Quick actions"), placeholder: t("Quiz me: Quiz me on this, one question at a time") });
  chips.value = chipsToText(role.chips);
  const save = () =>
    setRoles((r) => {
      r.custom = (r.custom || []).map((c) => (c.id === role.id ? { ...c, name: name.value.trim() || c.name, tagline: tagline.value.trim(), instructions: instructions.value.trim(), board: board.value.trim(), chips: textToChips(chips.value) } : c));
    });
  for (const el of [name, tagline, instructions, board, chips]) el.addEventListener("change", save);
  const field = (label, control, hint) => h("label", { class: "wb-field" }, h("span", {}, label), control, hint ? h("small", { class: "hint" }, hint) : null);
  return h("div", { class: "roles-editor" },
    field(t("Name"), name),
    field(t("In one line"), tagline),
    field(t("What it should do"), instructions, t("Say it like you would to a person. {user} is replaced by your name.")),
    field(t("On the whiteboard"), board, t("How it uses the board in this role (optional).")),
    field(t("Quick actions"), chips, t("One per line, like “Label: what to say”. Up to six.")),
    h("div", { class: "wb-btn-row" },
      h("button", { type: "button", class: "btn small", onclick: () => ((editing = null), render()) }, t("Done")),
      h("button", { type: "button", class: "btn small btn-danger", onclick: () => {
        setRoles((r) => {
          r.custom = (r.custom || []).filter((c) => c.id !== role.id);
          if (r.active === role.id) r.active = "assistant";
        });
        editing = null;
      } }, t("Delete this role"))));
}

function render() {
  if (!root) return;
  // Not while typing in one of the fields: it would take the cursor away
  if (root.contains(document.activeElement) && document.activeElement.matches("input, textarea")) return;
  const r = roles();
  const current = activeRole(r).id;
  const all = allRoles(r);
  const builtin = all.filter((x) => !x.custom);
  const mine = all.filter((x) => x.custom);
  root.replaceChildren(
    h("div", { class: "subhead" }, h("div", { class: "subhead-title" }, t("Roles to pick from"))),
    h("div", { class: "rw-roles", role: "radiogroup", "aria-label": t("What the robot is to you") }, ...builtin.map((x) => card(x, current))),
    h("div", { class: "subhead" }, h("div", { class: "subhead-title" }, t("Your own roles"))),
    h("p", { class: "hint" }, t("Anything you can describe: a chef who teaches you a recipe, a quiz master, a debate opponent, a quiet writing partner.")),
    mine.length ? h("div", { class: "rw-roles", role: "radiogroup", "aria-label": t("Your own roles") }, ...mine.map((x) => h("div", { class: "roles-mine" }, card(x, current), h("button", { type: "button", class: "btn small", "aria-expanded": String(editing === x.id), onclick: () => ((editing = editing === x.id ? null : x.id), render()) }, t("Edit"))))) : null,
    editing && mine.find((x) => x.id === editing) ? editor(mine.find((x) => x.id === editing)) : null,
    mine.length < MAX_CUSTOM_ROLES
      ? h("div", { class: "wb-btn-row" }, h("button", { type: "button", class: "btn", onclick: () => {
          const id = `role-${Date.now().toString(36)}`;
          setRoles((x) => {
            x.custom = [...(x.custom || []), { id, name: t("My role"), tagline: "", instructions: "", board: "", chips: [] }];
          });
          editing = id;
          render();
        } }, h("span", { html: wbIcon("plus", 16) }), t("Make a role")))
      : null
  );
}

// The top of Overview: who the robot is and what it is to you, and the ways in
function renderNow() {
  if (!now) return;
  const role = activeRole(roles());
  now.replaceChildren(
    h("span", { class: "robot-now-face", html: FACE }),
    h("div", { class: "robot-now-text" }, h("strong", {}, `${characterName()} · ${roleName(role)}`), h("span", {}, role.custom ? role.tagline : t(role.tagline))),
    h("div", { class: "wb-btn-row" },
      h("button", { type: "button", class: "btn btn-primary small", onclick: () => ((location.hash = "#whiteboard"), document.getElementById("settings-close")?.click()) }, t("Open the Robot page")),
      h("button", { type: "button", class: "btn small", onclick: () => document.querySelector('.subtab[data-subtab="rb-roles"]')?.click() }, t("Change its role")))
  );
}

onSettings(() => {
  render();
  renderNow();
});

// "Put the windows back" and "Put the robot in the middle"
document.getElementById("wb-reset-windows")?.addEventListener("click", () =>
  updateSettings((s) => {
    s.whiteboard.windows = JSON.parse(JSON.stringify(WINDOWS));
  })
);
document.getElementById("wb-reset-robot-place")?.addEventListener("click", () =>
  updateSettings((s) => {
    s.robot.voicePlace = { ...DEFAULT_PLACE };
  })
);
