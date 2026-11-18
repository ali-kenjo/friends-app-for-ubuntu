// ---------- Settings → Characters → Voice mode toolbar ----------
// The layout preset, and for each button: on or off, and its key (the next key you press). Position and labels
// are plain controls (data-setting="voiceDock.…").
import { t } from "../i18n.js";
import { getSettings, onSettings, updateSettings } from "../store.js";
import { keyLabel } from "../barge.mjs";
import * as M from "./dock-model.mjs";

const presetSelect = document.getElementById("dock-preset");
const list = document.getElementById("dock-modules");
const note = document.getElementById("dock-keys-note");
const NOTE = () => t("Switch each button on or off, and give it a key (M, F, Escape and Space are taken by voice mode)");
let listening = null; // the module waiting for a key

const dock = () => M.sanitizeDock(getSettings()?.voiceDock);
const save = (next) => updateSettings((s) => (s.voiceDock = JSON.parse(JSON.stringify(M.sanitizeDock(next)))));

function render() {
  if (!list || !getSettings()) return;
  const d = dock();
  presetSelect.value = d.preset;
  const focused = document.activeElement?.closest?.("[data-dock-id]");
  const refocus = focused && { id: focused.dataset.dockId, kind: focused.dataset.kind };
  const rows = d.order.map((id) => {
    const m = M.DOCK_MODULES.find((x) => x.id === id);
    const row = document.createElement("div");
    row.className = "row dock-module";
    const name = document.createElement("label");
    name.className = "row-label";
    name.htmlFor = `dock-on-${id}`;
    name.textContent = t(m.label);
    const actions = document.createElement("div");
    actions.className = "row-actions";
    const key = document.createElement("button");
    key.type = "button";
    key.className = "btn small";
    key.dataset.dockId = id;
    key.dataset.kind = "key";
    const code = id === "mic_mute" ? "KeyM" : d.shortcuts[id];
    key.textContent = listening === id ? t("Press a key…") : code ? keyLabel(code, t("Space bar")) : t("No key");
    key.setAttribute("aria-label", t("Key for {name}: {key}", { name: t(m.label), key: key.textContent }));
    key.classList.toggle("active", listening === id);
    // (the microphone keeps voice mode's own M)
    key.disabled = id === "mic_mute" || id === "interrupt";
    if (id === "interrupt") key.textContent = t("Interrupt key");
    key.addEventListener("click", () => {
      listening = listening === id ? null : id;
      note.textContent = listening ? t("Press the key you want, Delete for none, or Esc to cancel.") : NOTE();
      render();
    });
    key.addEventListener("blur", () => {
      if (listening === id) setTimeout(() => listening === id && stop(), 0);
    });
    const on = document.createElement("input");
    on.type = "checkbox";
    on.className = "toggle";
    on.id = `dock-on-${id}`;
    on.dataset.dockId = id;
    on.dataset.kind = "on";
    on.checked = d.visible[id] !== false;
    on.addEventListener("change", () => save({ ...dock(), preset: "custom", visible: { ...dock().visible, [id]: on.checked } }));
    actions.append(key, on);
    row.append(name, actions);
    return row;
  });
  list.replaceChildren(...rows);
  if (refocus) list.querySelector(`[data-dock-id="${refocus.id}"][data-kind="${refocus.kind}"]`)?.focus();
}

function stop(message = "") {
  listening = null;
  note.textContent = message || NOTE();
  render();
}

document.addEventListener(
  "keydown",
  (e) => {
    if (!listening) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === "Escape") return stop();
    if (["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(e.code)) return;
    const id = listening;
    const d = dock();
    if (e.code === "Delete" || e.code === "Backspace") {
      save({ ...d, shortcuts: { ...d.shortcuts, [id]: "" } });
      return stop();
    }
    if (!M.validKey(e.code) || e.code === getSettings()?.voice?.interruptKey) {
      return stop(M.RESERVED_KEYS.has(e.code) || e.code === getSettings()?.voice?.interruptKey ? t("{key} already does something in voice mode. Pick another key.", { key: keyLabel(e.code, t("Space bar")) }) : t("Pick a letter or a number."));
    }
    // A key another button had moves to this one
    const shortcuts = Object.fromEntries(Object.entries(d.shortcuts).map(([k, v]) => [k, v === e.code ? "" : v]));
    save({ ...d, shortcuts: { ...shortcuts, [id]: e.code } });
    stop();
  },
  true,
);

presetSelect?.addEventListener("change", () => {
  if (presetSelect.value === "custom") save({ ...dock(), preset: "custom" });
  else save(M.applyPreset(dock(), presetSelect.value));
});

onSettings(render);
document.addEventListener("friends:language-ready", render);
