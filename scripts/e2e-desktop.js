// Manual check of the desktop app: starts the real Electron window (it appears on
// your screen for a few seconds), checks that the page loaded with the local-AI
// settings and no errors, then closes it. Needs `npm run desktop` to work
// (Electron downloaded: node node_modules/electron/install.js).
//   node scripts/e2e-desktop.js
//   node scripts/e2e-desktop.js --appimage dist/Friends-<version>-x86_64.AppImage    (the same check on the AppImage)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const electron = path.join(root, "node_modules", "electron", "dist", "electron");
const appImage = process.argv.includes("--appimage") ? path.resolve(process.argv[process.argv.indexOf("--appimage") + 1] || "") : "";
if (appImage ? !fs.existsSync(appImage) : !fs.existsSync(electron)) {
  console.error(appImage ? `✗ ${appImage} isn't there: npm run dist:appimage` : "✗ Electron isn't downloaded: node node_modules/electron/install.js");
  process.exit(1);
}
// A terminal inside an editor built on Electron (VS Code, and its snap in particular) passes on variables that make another
// Electron app behave as plain Node (ELECTRON_RUN_AS_NODE) or crash in GTK (the snap's GTK, GIO and schema folders).
// They're taken out, and the snap's saved originals put back.
const cleanEnv = { ...process.env };
for (const key of Object.keys(cleanEnv)) {
  const original = /^(.+)_VSCODE_SNAP_ORIG$/.exec(key);
  if (original) {
    if (cleanEnv[key]) cleanEnv[original[1]] = cleanEnv[key];
    else delete cleanEnv[original[1]];
  }
  if (/^(SNAP|VSCODE|GTK_|GDK_PIXBUF|GIO_|GSETTINGS_SCHEMA_DIR|ELECTRON_RUN_AS_NODE|GIT_ASKPASS)/.test(key) || key.endsWith("_VSCODE_SNAP_ORIG")) delete cleanEnv[key];
}
const work = fs.mkdtempSync(path.join(os.tmpdir(), "friends-desktop-e2e-"));
const debugPort = 9333 + Math.floor(Math.random() * 500);

async function main() {
  // An AppImage starts Electron itself (with --no-sandbox, see scripts/build-appimage.js); it's run without needing FUSE
  const proc = spawn(appImage || electron, appImage ? [`--remote-debugging-port=${debugPort}`] : [root, "--no-sandbox", `--remote-debugging-port=${debugPort}`], {
    env: { ...cleanEnv, FRIENDS_DATA_DIR: work, FRIENDS_VOICE_DIR: path.join(work, "voice"), KEYRING_BACKEND: "file", LOG_LEVEL: "error", ...(appImage ? { APPIMAGE_EXTRACT_AND_RUN: "1" } : {}) },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // its own process group, so everything it started can be stopped
  });
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  let exit;
  try {
    const puppeteer = require("puppeteer-core");
    let browser;
    for (let i = 0; i < 60 && !browser; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${debugPort}`, defaultViewport: null }).catch(() => null);
    }
    if (!browser) throw new Error("The window didn't start.\n" + log.slice(-600));
    let page;
    for (let i = 0; i < 40 && !page; i++) {
      page = (await browser.pages()).find((p) => /(127\.0\.0\.1|localhost):\d+/.test(p.url()));
      if (!page) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!page) throw new Error("The app window never loaded the page.");
    const problems = [];
    page.on("pageerror", (err) => problems.push(err.message));
    await page.reload({ waitUntil: "networkidle2" });
    await page.evaluate(() => {
      document.getElementById("settings-btn")?.click();
      document.querySelector('.modal-nav .tab[data-tab="ai-control"]')?.click();
    });
    await page.waitForSelector("#local-card", { visible: true, timeout: 10000 });
    await page.waitForFunction(() => !/Looking for/.test(document.getElementById("local-card-status").textContent), { timeout: 10000 });
    const info = await page.evaluate(async () => ({
      title: document.title,
      status: document.getElementById("local-card-status").textContent,
      privateMode: Boolean(document.getElementById("private-mode-toggle")),
      health: (await (await fetch("/api/health")).json()).status,
    }));
    console.log(`• window: "${info.title}", ${page.url()}`);
    console.log(`• local AI card: ${info.status}`);
    if (info.title !== "Friends" || !info.privateMode || info.health !== "ok") throw new Error(`The page isn't what it should be: ${JSON.stringify(info)}`);
    if (problems.length) throw new Error(`Page errors: ${problems.join("; ")}`);
    await browser.disconnect();
    console.log(`✓ The desktop app${appImage ? " (the AppImage)" : ""} starts and shows the local-AI settings.`);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    exit = 1;
  } finally {
    try {
      process.kill(-proc.pid);
    } catch {
      proc.kill();
    }
    fs.rmSync(work, { recursive: true, force: true });
    process.exit(exit || 0);
  }
}

main();
