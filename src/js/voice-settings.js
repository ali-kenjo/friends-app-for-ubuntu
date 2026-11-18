// Settings → Characters → Voice conversation: the interrupt key. The conversation style and the
// sensitivity are plain selects (data-setting); a key needs the next key you press.
import { t } from "./i18n.js";
import { getSettings, onSettings, updateSettings } from "./store.js";
import { keyLabel, RESERVED_KEYS } from "./barge.mjs";

const button = document.getElementById("interrupt-key-btn");
const clear = document.getElementById("interrupt-key-clear");
const note = document.getElementById("interrupt-key-note");
let listening = false;

function show() {
  const key = getSettings()?.voice?.interruptKey || "";
  button.textContent = listening ? t("Press a key…") : key ? keyLabel(key, t("Space bar")) : t("No interrupt key");
  button.classList.toggle("active", listening);
  clear.hidden = !key || listening;
}

function stop(message = "") {
  listening = false;
  note.textContent = message;
  show();
}

function onKey(e) {
  if (!listening) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.code === "Escape") return stop();
  if (["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(e.code)) return; // wait for a real key
  if (RESERVED_KEYS.includes(e.code)) return stop(t("{key} already does something in voice mode. Pick another key.", { key: keyLabel(e.code, t("Space bar")) }));
  updateSettings((s) => (s.voice.interruptKey = e.code));
  stop();
}

button?.addEventListener("click", () => {
  listening = !listening;
  note.textContent = listening ? t("Press the key you want, or Esc to cancel.") : "";
  show();
});
button?.addEventListener("blur", () => listening && stop());
clear?.addEventListener("click", () => {
  updateSettings((s) => (s.voice.interruptKey = ""));
  show();
});
document.addEventListener("keydown", onKey, true); // before the settings panel's own keys (Esc closes it)
onSettings(show);

// ---------- Live voice service (moved here from 1.0's studio drawer) ----------
// Rows for the chosen service only; keys are sent once and kept in the system keyring by the helper (the field
// empties and says a key is saved).
const serviceRows = document.querySelectorAll("[data-voice-for]");
const keyFields = [
  { input: document.getElementById("voice-gemini-key"), setting: "geminiKey", has: "hasGeminiKey" },
  { input: document.getElementById("voice-openai-key"), setting: "openaiKey", has: "hasOpenaiKey" },
];
function showService() {
  const av = getSettings()?.aiVoice || {};
  for (const row of serviceRows) row.hidden = !row.dataset.voiceFor.split(" ").includes(av.provider || "gemini-live");
  for (const k of keyFields) if (k.input && document.activeElement !== k.input) k.input.placeholder = av[k.has] ? t("A key is saved (type to replace it)") : t("Paste a key");
}
for (const k of keyFields) {
  k.input?.addEventListener("change", () => {
    const value = k.input.value.trim();
    if (!value) return;
    updateSettings((s) => (s.aiVoice[k.setting] = value));
    k.input.value = "";
  });
}
onSettings(showService);

// ---------- Data & backups → Robot and voice setup ----------
const bundleNote = document.getElementById("studio-bundle-note");
const bundleFile = document.getElementById("studio-bundle-file");
document.getElementById("studio-bundle-export")?.addEventListener("click", async () => {
  const { downloadStudioBundle } = await import("./storage/bundle-client.mjs");
  try {
    await downloadStudioBundle("zip");
  } catch (err) {
    bundleNote.textContent = t("Couldn't export: {error}", { error: err.message });
  }
});
document.getElementById("studio-bundle-import")?.addEventListener("click", () => bundleFile?.click());
bundleFile?.addEventListener("change", async () => {
  const file = bundleFile.files?.[0];
  bundleFile.value = "";
  if (!file) return;
  const { importStudioBundleFile } = await import("./storage/bundle-client.mjs");
  try {
    await importStudioBundleFile(file);
    bundleNote.textContent = t("Imported. Reloading…");
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    bundleNote.textContent = t("Couldn't import: {error}", { error: err.message });
  }
});
