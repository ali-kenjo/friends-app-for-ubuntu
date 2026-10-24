// ---------- Settings → AI & privacy → Privacy ----------
// What could leave this computer right now, what Friends keeps and clearing it, and the note when Private mode has no local AI.
// The switches (Private mode, what is hidden from cloud AIs, deleting old chats) are plain settings (data-setting).
import { api } from "./api.js";
import { getSettings, onSettings, reloadSettings, flushSettings } from "./store.js";
import { t, tp } from "./i18n.js";
import { h } from "./h.js";
import { confirmDialog } from "./dialogs.js";
import { announce } from "./a11y.js";

const $ = (id) => document.getElementById(id);
let brains = [];

// ----- Private mode with no local AI -----
function renderPrivateNote() {
  const on = getSettings()?.privacy?.localOnly === true;
  const note = $("private-mode-note");
  const noLocal = !brains.some((b) => b.kind === "local");
  note.hidden = !(on && noLocal);
  note.textContent = on && noLocal ? t("Private mode is on, but there's no local AI yet. Add one under Your AIs, or chat won't work.") : "";
}

// ----- What could leave this computer -----
const FEATURES = {
  news: t("Headlines in your daily briefing"),
  telegram: t("Your Telegram bot (messages go through Telegram)"),
  updates: t("The daily check for a newer Friends (it sends nothing about you)"),
  reddit_watchers: t("Reddit watchers (checks configured subreddits periodically)"),
};

function renderLeaving(summary) {
  const list = $("leaving-list");
  const items = summary.leaving || [];
  list.replaceChildren(
    ...items.map((x) => {
      const text = x.kind === "ai" ? t("{name} (a cloud AI): your messages, when it answers", { name: x.name }) : x.kind === "app" ? t("{name}: only when you ask for it", { name: x.name }) : FEATURES[x.name] || x.name;
      return h("li", { text });
    })
  );
  const priv = getSettings()?.privacy?.localOnly === true;
  $("leaving-note").textContent = priv ? t("Private mode is on: nothing is sent to the internet.") : items.some((x) => x.kind === "ai") ? t("A cloud AI sees your message when it answers. Hide the private parts below.") : t("No cloud AI is on: your messages stay here.");
  if (!items.length) list.append(h("li", { class: "none", text: t("Nothing.") }));
}

function renderCounts(s) {
  $("privacy-counts").textContent = t("Kept here: {chats}, {memories}, {notes}, {episodes}.", {
    chats: tp("{n} chat", "{n} chats", s.chats),
    memories: tp("{n} memory", "{n} memories", s.memories),
    notes: tp("{n} note", "{n} notes", s.notes),
    episodes: tp("{n} remembered conversation", "{n} remembered conversations", s.episodes),
  });
}

async function refresh() {
  try {
    await flushSettings(); // what the helper says follows what was just switched
    const s = await api.privacy.get();
    renderLeaving(s);
    renderCounts(s);
  } catch {}
}

// ----- Clearing -----
const ASK = {
  chats: { title: t("Delete all chats?"), message: t("Every conversation is deleted from this computer. This can't be undone."), done: t("Chats deleted.") },
  memories: { title: t("Delete your memories?"), message: t("The things you asked it to remember are deleted. This can't be undone."), done: t("Memories deleted.") },
  notes: { title: t("Delete its notes?"), message: t("The notes the AI saved about you are deleted. This can't be undone."), done: t("Notes deleted.") },
  episodes: { title: t("Forget past chats?"), message: t("What it remembers of earlier conversations (and the things it planned to ask about) is deleted. The chats themselves stay."), done: t("Forgotten.") },
  usage: { title: t("Reset the usage counts?"), message: t("Today's counts and daily limits start from zero."), done: t("Counts reset.") },
};

document.querySelector(".clear-row")?.addEventListener("click", async (e) => {
  const button = e.target.closest("[data-clear]");
  if (!button) return;
  const what = button.dataset.clear;
  const ask = ASK[what];
  const feedback = $("clear-feedback");
  if (!(await confirmDialog({ title: ask.title, message: ask.message, confirm: t("Delete"), danger: true }))) return;
  button.disabled = true;
  try {
    const result = await api.privacy.clear(what);
    renderCounts(result);
    renderLeaving(result);
    feedback.className = "test-feedback ok";
    feedback.textContent = ask.done;
    announce(ask.done);
    // The page's lists follow: the chats in the sidebar, the memories in Settings
    if (what === "chats") document.dispatchEvent(new CustomEvent("friends:chats-changed"));
    if (what === "memories") reloadSettings();
  } catch (err) {
    feedback.className = "test-feedback error";
    feedback.textContent = t(err.message);
  } finally {
    button.disabled = false;
  }
});

document.addEventListener("friends:brains-changed", (e) => {
  brains = e.detail.brains;
  renderPrivateNote();
  refresh();
});
onSettings(() => {
  renderPrivateNote();
});
document.addEventListener("friends:settings", (e) => e.detail.open && e.detail.tab === "ai-control" && refresh());
document.addEventListener("friends:subtab", (e) => e.detail.name === "privacy" && refresh());
// Switching Private mode or a hidden kind changes what the card says
document.addEventListener("input", (e) => e.target.closest?.('[data-setting^="privacy."]') && setTimeout(refresh, 450));
