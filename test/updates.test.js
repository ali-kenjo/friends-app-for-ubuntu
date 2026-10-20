// The update check: it compares versions, asks a (fake) GitHub Releases, keeps the answer, says how to update for the way
// Friends was installed, and stays quiet in Private mode and when switched off. It never installs anything.
const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-updates-"));
Object.assign(process.env, { FRIENDS_DATA_DIR: path.join(tempDir, "data"), KEYRING_BACKEND: "file", LOG_LEVEL: "error" });

const pkg = require("../package.json");
const updates = require("../server/updates");

describe("Versions", () => {
  test("they compare like versions, not like text", () => {
    assert.strictEqual(updates.compare("0.10.0", "0.9.9"), 1);
    assert.strictEqual(updates.compare("0.5.1", "0.6.0"), -1);
    assert.strictEqual(updates.compare("v1.2.3", "1.2.3"), 0);
    assert.strictEqual(updates.compare("1.0.0-rc.1", "1.0.0"), -1, "a release candidate is older than the release");
    assert.strictEqual(updates.compare("1.0.0", "1.0.0-rc.1"), 1);
    assert.strictEqual(updates.compare("nonsense", "1.0.0"), 0, "something that isn't a version is never newer");
  });

  test("the repository comes from package.json", () => {
    assert.strictEqual(updates.repoOf(pkg), "ali-kenjo/friends-app-for-ubuntu");
    assert.strictEqual(updates.repoOf({ repository: "github:me/app" }), "me/app");
  });

  test("it knows how Friends was installed", () => {
    assert.strictEqual(updates.installKind({ APPIMAGE: "/home/me/Friends.AppImage" }, "/tmp/x"), "appimage");
    assert.strictEqual(updates.installKind({}, "/opt/friends/resources/app"), "deb");
    assert.strictEqual(updates.installKind({ FRIENDS_IN_DOCKER: "1" }, "/app"), "docker");
  });
});

describe("The check", () => {
  let github, base, settings, server;
  const hits = [];
  const behave = { status: 200, release: null, delay: 0 };
  const release = (version, extra = {}) => ({
    tag_name: `v${version}`,
    name: `Friends ${version}`,
    html_url: `https://github.com/ali-kenjo/friends-app-for-ubuntu/releases/tag/v${version}`,
    body: `## What's new\n- Missions\n- Specialists`,
    draft: false,
    prerelease: false,
    published_at: "2026-10-20T10:00:00Z",
    assets: [
      { name: `friends_${version}_amd64.deb`, browser_download_url: `https://github.com/x/releases/download/v${version}/friends_${version}_amd64.deb`, size: 1 },
      { name: `Friends-${version}-x86_64.AppImage`, browser_download_url: `https://github.com/x/releases/download/v${version}/Friends-${version}-x86_64.AppImage`, size: 1 },
    ],
    ...extra,
  });
  const call = async (method, url) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${url}`, { method });
    return { status: res.status, body: await res.json() };
  };

  before(async () => {
    github = http.createServer((req, res) => {
      hits.push({ url: req.url, agent: req.headers["user-agent"], accept: req.headers.accept, cookie: req.headers.cookie, auth: req.headers.authorization });
      setTimeout(() => {
        res.writeHead(behave.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(behave.release || { message: "Not Found" }));
      }, behave.delay);
    });
    await new Promise((r) => github.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${github.address().port}`;
    process.env.FRIENDS_UPDATES_API = base;
    settings = require("../server/settings");
    server = require("../server/server").start(0, "127.0.0.1");
    await new Promise((r) => (server.listening ? r() : server.on("listening", r)));
  });

  after(async () => {
    await new Promise((r) => server.close(r));
    await new Promise((r) => github.close(r));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    hits.length = 0;
    Object.assign(behave, { status: 200, release: null, delay: 0 });
    fs.rmSync(path.join(process.env.FRIENDS_DATA_DIR, "updates.json"), { force: true });
    settings.set({ ...settings.get(), updates: { check: true }, privacy: { localOnly: false } });
  });

  test("a newer release is reported with its notes and the files that fit", async () => {
    behave.release = release("99.0.0");
    const made = await call("POST", "/api/updates/check");
    assert.strictEqual(made.status, 200);
    assert.strictEqual(made.body.available, true);
    assert.strictEqual(made.body.current, pkg.version);
    assert.strictEqual(made.body.latest.version, "99.0.0");
    assert.match(made.body.latest.notes, /Missions/);
    assert.match(made.body.latest.deb, /friends_99\.0\.0_amd64\.deb$/);
    assert.match(made.body.latest.appImage, /\.AppImage$/);
    assert.match(made.body.latest.url, /^https:\/\/github\.com\//);
    // It's kept: reading doesn't ask again
    hits.length = 0;
    const read = await call("GET", "/api/updates");
    assert.strictEqual(read.body.latest.version, "99.0.0");
    assert.strictEqual(hits.length, 0, "GET only reads what was kept");
  });

  test("nothing is sent but the request itself", async () => {
    behave.release = release("99.0.0");
    await call("POST", "/api/updates/check");
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0].url, "/releases/latest");
    assert.strictEqual(hits[0].agent, `Friends/${pkg.version}`);
    assert.strictEqual(hits[0].cookie, undefined);
    assert.strictEqual(hits[0].auth, undefined);
  });

  test("the same or an older release says you're up to date", async () => {
    behave.release = release(pkg.version);
    const same = await call("POST", "/api/updates/check");
    assert.strictEqual(same.body.available, false);
    assert.strictEqual(same.body.latest, null);
    assert.ok(same.body.checkedAt > 0);
    behave.release = release("0.0.1");
    assert.strictEqual((await call("POST", "/api/updates/check")).body.available, false);
  });

  test("drafts, pre-releases and tags that aren't versions are ignored", async () => {
    for (const odd of [release("99.0.0", { draft: true }), release("99.0.0", { prerelease: true }), release("99.0.0", { tag_name: "nightly" })]) {
      behave.release = odd;
      assert.strictEqual((await call("POST", "/api/updates/check")).body.available, false);
    }
  });

  test("a link that isn't GitHub is not passed on", async () => {
    behave.release = release("99.0.0", { html_url: "https://evil.example/download" });
    assert.strictEqual((await call("POST", "/api/updates/check")).body.latest.url, "");
  });

  test("no release yet, GitHub limiting, and GitHub being down are said plainly", async () => {
    behave.status = 404;
    const none = await call("POST", "/api/updates/check");
    assert.strictEqual(none.body.available, false);
    assert.strictEqual(none.body.error, "");
    behave.status = 403;
    const limited = await call("POST", "/api/updates/check");
    assert.strictEqual(limited.status, 400);
    assert.match(limited.body.error, /limiting requests/);
    assert.match((await call("GET", "/api/updates")).body.error, /limiting requests/, "the last problem is kept for the page");
    behave.status = 500;
    assert.match((await call("POST", "/api/updates/check")).body.error, /answer Friends understands/);
  });

  test("Private mode never asks the internet", async () => {
    settings.set({ ...settings.get(), privacy: { localOnly: true } });
    behave.release = release("99.0.0");
    const made = await call("POST", "/api/updates/check");
    assert.strictEqual(made.status, 400);
    assert.match(made.body.error, /Private mode is on/);
    assert.strictEqual(hits.length, 0);
    assert.strictEqual((await call("GET", "/api/updates")).body.private, true);
  });

  test("switched off, only the button asks; the automatic check stays quiet", async () => {
    settings.set({ ...settings.get(), updates: { check: false } });
    behave.release = release("99.0.0");
    await updates.check();
    assert.strictEqual(hits.length, 0, "the automatic check does nothing when it's off");
    assert.strictEqual((await call("GET", "/api/updates")).body.enabled, false);
    assert.strictEqual((await call("POST", "/api/updates/check")).body.available, true, "Check now still works");
  });

  test("the automatic check asks at most once a day", async () => {
    behave.release = release("99.0.0");
    updates.schedule(() => settings.get(), { firstDelay: 10, every: 20 });
    await new Promise((r) => setTimeout(r, 400));
    updates.schedule(() => ({ ...settings.get(), updates: { check: false } }), { firstDelay: 100000, every: 100000 }); // stops the timers
    assert.strictEqual(hits.length, 1, "asked once, then a day hadn't passed");
  });

  test("a slow answer doesn't make two requests at once", async () => {
    behave.release = release("99.0.0");
    behave.delay = 150;
    await Promise.all([call("POST", "/api/updates/check"), call("POST", "/api/updates/check")]);
    assert.strictEqual(hits.length, 1);
  });
});
