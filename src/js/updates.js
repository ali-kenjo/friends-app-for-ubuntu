// ---------- Updates (Settings → Data & backups) ----------
// Says whether a newer Friends exists (server/updates.js asks GitHub Releases once a day) and how to get it for the
// way this copy was installed. It never installs anything. A new version also shows once, as a small notice.
import { api } from "./api.js";
import { t, formatDateTime } from "./i18n.js";
import { renderMarkdown } from "./render.js";
import { toast } from "./life.js";

const $ = (id) => document.getElementById(id);
const line = $("update-line");
const how = $("update-how");
const notes = $("update-notes");
const download = $("update-download");
const page = $("update-page");
const checkButton = $("update-check");

const SEEN = "friends.update-seen";
const seen = () => {
  try {
    return localStorage.getItem(SEEN) || "";
  } catch {
    return "";
  }
};
const markSeen = (version) => {
  try {
    localStorage.setItem(SEEN, version);
  } catch {}
};

// What to do, by the way Friends was installed
function howTo(state) {
  const v = state.latest.version;
  return {
    appimage: t("Download the new AppImage, make it executable (chmod +x) and use it in place of the old file."),
    deb: t("Download the .deb, then install it with: sudo apt install ./friends_{version}_amd64.deb", { version: v }),
    source: t("In the project folder, run: npm run update"),
  }[state.install];
}

function draw(state, { error = "" } = {}) {
  const parts = [];
  if (state.private) parts.push(t("Private mode is on, so Friends can't ask the internet. Turn it off to check."));
  else if (state.available) parts.push(t("Friends {version} is available. You have {current}.", { version: state.latest.version, current: state.current }));
  else if (state.checkedAt) parts.push(t("You have Friends {version}, the newest one.", { version: state.current }));
  else parts.push(t("You have Friends {version}. Not checked for a newer one yet.", { version: state.current }));
  if (state.checkedAt && !state.private) parts.push(t("Last checked {when}.", { when: formatDateTime(new Date(state.checkedAt)) }));
  line.textContent = parts.join(" ");
  const problem = error || state.error;
  line.classList.toggle("has-update", state.available && !state.private);
  checkButton.disabled = state.private;

  how.hidden = !state.available;
  if (state.available) how.textContent = howTo(state);
  notes.hidden = !(state.available && state.latest.notes);
  if (!notes.hidden) renderMarkdown($("update-notes-body"), state.latest.notes);
  const asset = state.available ? (state.install === "appimage" ? state.latest.appImage : state.install === "deb" ? state.latest.deb : "") : "";
  download.hidden = !asset;
  if (asset) download.href = asset;
  page.hidden = !(state.available && state.latest.url);
  if (!page.hidden) page.href = state.latest.url;

  // A failed check says so under the line, in the language of the page
  let problemEl = $("update-problem");
  if (problem && !state.private) {
    if (!problemEl) {
      problemEl = document.createElement("p");
      problemEl.id = "update-problem";
      problemEl.className = "row-desc form-error";
      line.after(problemEl);
    }
    problemEl.textContent = t(problem);
  } else problemEl?.remove();
}

async function load() {
  try {
    const state = await api.updates.get();
    draw(state);
    return state;
  } catch {
    return null;
  }
}

checkButton.addEventListener("click", async () => {
  checkButton.disabled = true;
  line.textContent = t("Checking…");
  try {
    draw(await api.updates.check());
  } catch (err) {
    draw(await api.updates.get().catch(() => ({ current: "", install: "source" })), { error: err.message });
  } finally {
    checkButton.disabled = false;
  }
});

document.addEventListener("friends:settings", (e) => e.detail.open && e.detail.tab === "data" && load());

// A notice once per version, a few seconds after start (the helper checks by itself a little after it starts)
async function announce() {
  const state = await load();
  if (!state?.available || state.private || !state.enabled || seen() === state.latest.version) return;
  markSeen(state.latest.version);
  toast({
    icon: "download",
    title: t("Friends {version} is available", { version: state.latest.version }),
    body: t("You have {current}. It isn't installed by itself.", { current: state.current }),
    actions: [[t("See what's new"), () => document.dispatchEvent(new CustomEvent("friends:open-settings", { detail: { tab: "data" } }))]],
  });
}
setTimeout(announce, 60 * 1000);
