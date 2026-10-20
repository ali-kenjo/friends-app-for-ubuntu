// Is there a newer Friends? Asks GitHub Releases (the latest published, not a draft or pre-release) and says so. It never
// downloads or installs anything: the page shows what's new and how to update for the way Friends was installed.
//   - Off with Settings → Data & backups → "Check for updates", and never in Private mode (nothing goes to the internet).
//   - At most once a day (and a little after start-up), the answer is kept in <data folder>/updates.json.
//   - The only thing sent is the request itself: no id, no version, no settings (the User-Agent names the app).
const fs = require("fs");
const path = require("path");
const { dataDir, writeJson } = require("./config");
const settingsModule = require("./settings");
const logger = require("./logger");
const pkg = require("../package.json");

const DAY = 24 * 60 * 60 * 1000;
const file = () => path.join(dataDir, "updates.json");

// Tests point this at a fake GitHub
const api = () => process.env.FRIENDS_UPDATES_API || `https://api.github.com/repos/${repoOf(pkg)}`;
const repoOf = (p) => String(p.repository?.url || p.repository || "").replace(/^git\+/, "").replace(/\.git$/, "").replace(/^(https?:\/\/github\.com\/|github:)/, "") || "ali-kenjo/friends-app-for-ubuntu";

// "v0.6.0-rc.1" → { nums: [0,6,0], pre: "rc.1" }; anything that isn't a version → null
function parse(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(String(version || "").trim());
  return m ? { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] || "" } : null;
}

// -1, 0 or 1; a version with a pre-release part (0.6.0-rc.1) is older than the same without one
function compare(a, b) {
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] < y.nums[i] ? -1 : 1;
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

// How this copy of Friends was installed, so the advice fits: "appimage", "deb", "docker" or "source"
function installKind(env = process.env, root = path.resolve(__dirname, "..")) {
  if (env.APPIMAGE) return "appimage";
  if (root.startsWith("/opt/friends/")) return "deb";
  if (env.FRIENDS_IN_DOCKER || fs.existsSync("/.dockerenv")) return "docker";
  return "source";
}

function stored() {
  try {
    return JSON.parse(fs.readFileSync(file(), "utf8"));
  } catch {
    return {};
  }
}

const clip = (s, n) => String(s || "").slice(0, n);

// What the page needs from a GitHub release
function summarize(release) {
  const assets = (release.assets || []).map((a) => ({ name: String(a.name), url: String(a.browser_download_url || ""), size: a.size || 0 }));
  return {
    version: String(release.tag_name || "").replace(/^v/, ""),
    name: clip(release.name, 120),
    url: /^https:\/\/github\.com\//.test(release.html_url || "") ? release.html_url : "",
    notes: clip(release.body, 4000),
    publishedAt: release.published_at || null,
    deb: assets.find((a) => /\.deb$/.test(a.name))?.url || "",
    appImage: assets.find((a) => /\.AppImage$/.test(a.name))?.url || "",
  };
}

// What the page shows: where we are, and the newest release if it is newer
function state(settings = settingsModule.get()) {
  const saved = stored();
  const latest = saved.latest && compare(saved.latest.version, pkg.version) > 0 ? saved.latest : null;
  return {
    current: pkg.version,
    enabled: settings.updates?.check !== false,
    private: settings.privacy?.localOnly === true,
    install: installKind(),
    checkedAt: saved.checkedAt || 0,
    error: saved.error || "",
    available: Boolean(latest),
    latest,
  };
}

let running = null;

// Asks GitHub now. { force } is for the button: it works even when the automatic check is off, but never in Private mode.
async function check({ force = false, settings = settingsModule.get() } = {}) {
  if (settings.privacy?.localOnly) throw new Error("Private mode is on, so Friends can't ask the internet for updates. Turn it off to check.");
  if (!force && settings.updates?.check === false) return state(settings);
  if (running) return running;
  running = (async () => {
    const saved = stored();
    try {
      const res = await fetch(`${api()}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": `Friends/${pkg.version}`, "X-GitHub-Api-Version": "2022-11-28" },
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 404) {
        // No release published yet
        writeJson(file(), { ...saved, checkedAt: Date.now(), error: "", latest: null });
      } else if (!res.ok) {
        throw new Error(res.status === 403 || res.status === 429 ? "GitHub is limiting requests right now. Try again later." : "GitHub didn't give an answer Friends understands.");
      } else {
        const release = await res.json();
        if (release.draft || release.prerelease || !parse(release.tag_name)) writeJson(file(), { ...saved, checkedAt: Date.now(), error: "" });
        else writeJson(file(), { checkedAt: Date.now(), error: "", latest: summarize(release) });
      }
    } catch (err) {
      const message = err.name === "TimeoutError" ? "GitHub didn't answer in time." : err.message || "Couldn't check for updates.";
      logger.debug("Update check failed:", message);
      writeJson(file(), { ...saved, checkedAt: Date.now(), error: message });
      if (force) throw new Error(message);
    }
    return state(settings);
  })().finally(() => (running = null));
  return running;
}

let timer = null;
let firstTimer = null;

// The automatic check: a little after start-up, then when a day has passed (looked at every hour)
function schedule(getSettings, { firstDelay = 45 * 1000, every = 60 * 60 * 1000 } = {}) {
  const tick = async () => {
    const settings = getSettings();
    if (settings.privacy?.localOnly || settings.updates?.check === false) return;
    if (Date.now() - (stored().checkedAt || 0) < DAY) return;
    await check({ settings }).catch(() => {});
  };
  clearInterval(timer);
  clearTimeout(firstTimer);
  firstTimer = setTimeout(tick, firstDelay);
  firstTimer.unref?.();
  timer = setInterval(tick, every);
  timer.unref?.();
}

module.exports = { check, state, schedule, compare, parse, installKind, summarize, repoOf };
