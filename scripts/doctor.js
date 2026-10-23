// `npm run doctor`: checks that this computer is ready to run Friends and says
// how to fix what isn't. Nothing is changed and nothing leaves this computer
// (it only asks 127.0.0.1).
const fs = require("fs");
const net = require("net");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tty = process.stdout.isTTY;
const paint = (code, text) => (tty ? `\x1b[${code}m${text}\x1b[0m` : text);
let errors = 0;
let warnings = 0;

const ok = (text) => console.log(`${paint(32, "✓")} ${text}`);
const warn = (text, fix) => (warnings++, console.log(`${paint(33, "!")} ${text}${fix ? `\n    → ${fix}` : ""}`));
const fail = (text, fix) => (errors++, console.log(`${paint(31, "✗")} ${text}${fix ? `\n    → ${fix}` : ""}`));

function portFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer().once("error", () => resolve(false)).once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

const gb = (mb) => `${(Math.round((mb / 1024) * 10) / 10).toFixed(1)} GB`;

// What Missions need: models that fit the card, a Gemini key for the manager, a place to work
async function assistant() {
  const settings = require("../server/settings").get();
  const specialistsApi = require("../server/specialists-api");
  let view = null;
  try {
    view = await specialistsApi.overview(settings);
  } catch (err) {
    warn(`Couldn't look at the specialists: ${err.message}`);
  }
  // What this computer is (server/hardware.js), and what that means for local AI
  const hw = await require("../server/hardware").live().catch(() => null);
  if (hw) {
    const form = { laptop: "Laptop", desktop: "Desktop computer", server: "Server", "single-board": "Single-board computer" }[hw.formFactor] || "Computer";
    ok(`${form}: ${hw.cpu.model || hw.os.name}, ${gb(hw.memory.totalMb)} memory (${gb(hw.memory.availableMb)} free), ${hw.os.name}${hw.container !== "none" ? `, in ${hw.container}` : ""}`);
    const card = hw.gpus.find((g) => g.usable && !g.shared) || hw.gpus.find((g) => g.unified);
    if (card && card.unified) ok(`${card.name}: shares the computer's memory; models may use about ${gb(hw.fit.budgetMb)}`);
    else if (card) ok(`${card.name}: ${gb(card.vramMb)}, ${gb(card.freeMb)} free now. Local models are loaded one at a time to fit it`);
    else warn("No graphics card that local models can use: they run on the processor, which is slow", "Fine for small models; for speed use a card with 6 GB or more and its driver (nvidia-smi or rocm-smi must work)");
    if (!hw.fit.canRunLocal) warn(`Only about ${gb(hw.fit.budgetMb)} of memory can go to a local model`, "Use a cloud AI for the heavy parts, or free some memory");
    else ok(`Models up to about ${hw.fit.maxParamsB} billion parameters run well here (${hw.fit.tier} tier, ${hw.fit.engine})`);
    if (hw.battery.present && hw.battery.onBattery) console.log(`${paint(2, "·")} On battery (${hw.battery.percent ?? "?"}%): repeating missions wait for the charger`);
  }
  if (view) {
    // Ollama and the specialists
    if (!view.running) {
      warn(`Ollama isn't answering at ${view.baseUrl}: Missions have no specialist models to use`, "Install it (https://ollama.com/download) and start it: ollama serve");
    } else {
      const used = view.roles.filter((r) => r.enabled && r.effectiveModel);
      const byModel = new Map();
      for (const r of used) byModel.set(r.effectiveModel, [...(byModel.get(r.effectiveModel) || []), r]);
      for (const [model, roles] of byModel) {
        const names = roles.map((r) => r.label).join(", ");
        const worst = roles.find((r) => !r.installed) ? "missing" : roles[0].fits?.placement || "unknown";
        const clean = model.replace(/:latest$/, "");
        if (worst === "missing") {
          const optional = roles.every((r) => r.id === "embeddings");
          if (optional) console.log(`${paint(2, "·")} ${names}: ${clean} isn't installed (optional: it lets notes be searched by meaning). Run: ollama pull ${clean}`);
          else warn(`${names}: ${clean} isn't installed`, `Run: ollama pull ${clean}`);
        } else if (worst === "gpu") ok(`${names}: ${clean} fits the card`);
        else if (worst === "split") warn(`${names}: ${clean} only partly fits the card, so part runs on the processor`, "Lower its context size, or pick a smaller model in Settings → AI → Specialists");
        else if (worst === "cpu") warn(`${names}: ${clean} is too big for the card and runs on the processor`, "Pick a smaller model, or set a smaller fallback, in Settings → AI → Specialists");
        else ok(`${names}: ${clean} is installed`);
      }
      const general = view.roles.find((r) => r.id === "general");
      if (!general?.effectiveModel) {
        const s = view.suggestions;
        warn("No everyday model is chosen yet", `Settings → AI → Specialists → Use the suggestions (for your card: ${s.general.model} everyday, ${s.coding.model} for code, ${s.embeddings.model} for notes)`);
      }
      const suggestionsModule = require("../server/specialist-suggestions");
      if (suggestionsModule.CHECKED) {
        const checkedDate = new Date(suggestionsModule.CHECKED);
        const monthsOld = (Date.now() - checkedDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
        if (monthsOld > 6) warn(`Specialist model suggestions were checked on ${suggestionsModule.CHECKED} (>6 months old)`, "Check for newly released open-weight model recommendations");
        else ok(`Specialist model suggestions up to date (verified ${suggestionsModule.CHECKED})`);
      }
    }
  }

  // Gemini plans and checks missions
  const brains = require("../server/brains");
  const keys = require("../server/keys");
  const gemini = brains.publicState().brains.filter((b) => b.provider === "gemini");
  if (gemini.some((b) => keys.getOptionalKey(b.id))) ok("A Gemini key is set: Gemini plans and checks missions");
  else warn("No Gemini key: with no cloud manager, missions are planned by a model on this computer", "Add a free key in Settings → AI & privacy → Add an AI → Gemini (https://aistudio.google.com/apikey)");

  // Where missions work
  try {
    const workspace = require("../server/missions/risk").expand(settings.missions.workspace || "~/friends-workspace");
    let dir = workspace;
    while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
    fs.accessSync(dir, fs.constants.W_OK);
    ok(`Missions work in ${workspace}`);
  } catch (err) {
    fail(`Missions can't write to their workspace folder (${err.code || err.message})`, "Choose another in Settings → AI → Missions → Workspace folder");
  }

  // Bubblewrap sandbox for Missions
  const sandbox = require("../server/missions/sandbox");
  const sb = sandbox.check();
  if (sb.ok) {
    ok("Mission sandbox: bubblewrap is ready (process, filesystem, and network isolation)");
  } else if (sb.reason === "missing") {
    fail("Mission sandbox: bubblewrap (bwrap) is not installed", "Install it: sudo apt install bubblewrap");
  } else if (sb.reason === "userns") {
    fail(`Mission sandbox: unprivileged user namespaces are blocked (${sb.message})`, "Enable them: sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0");
  } else {
    fail(`Mission sandbox check failed: ${sb.message}`, "Ensure bubblewrap can create sandboxes");
  }

  // Updates: what the last check found (this script never goes to the internet)
  const state = require("../server/updates").state(settings);
  if (state.available) warn(`Friends ${state.latest.version} is available (you have ${state.current})`, `See what's new: ${state.latest.url || "Settings → Data & backups → Updates"}`);
  else if (state.checkedAt) ok(`Friends ${state.current} is the newest version (checked ${new Date(state.checkedAt).toLocaleDateString("en-GB")})`);
}

async function main() {
  console.log(paint(1, `Friends ${pkg.version}: checking this computer\n`));

  // Node
  const [needMajor, needMinor = 0] = (pkg.engines?.node || ">=20").match(/\d+/g).map(Number);
  const [haveMajor, haveMinor] = process.versions.node.split(".").map(Number);
  if (haveMajor > needMajor || (haveMajor === needMajor && haveMinor >= needMinor)) ok(`Node.js ${process.versions.node}`);
  else fail(`Node.js ${process.versions.node} is too old (needs ${needMajor}.${needMinor} or newer)`, "Install a current Node.js: https://nodejs.org or `nvm install --lts`");
  const missing = Object.keys(pkg.dependencies || {}).filter((d) => !fs.existsSync(path.join(root, "node_modules", d, "package.json")));
  if (!missing.length) ok("Dependencies are installed");
  else fail(`Dependencies are missing (${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""})`, "Run: npm ci");

  // Data folder
  const config = require("../server/config");
  const storage = config.checkStorage();
  if (storage.ok) ok(`Your data is kept in ${storage.path}`);
  else fail(`Can't write to ${storage.path}: ${storage.error}`, "Set FRIENDS_DATA_DIR to a folder you can write to");

  // Backups
  const backups = require("../server/backup").list();
  if (backups.length) {
    const days = Math.floor((Date.now() - backups[0].createdAt) / 86400000);
    if (days <= 2) ok(`Your data is backed up (${backups.length} backup${backups.length === 1 ? "" : "s"}, the newest ${days ? `${days} day${days === 1 ? "" : "s"} ago` : "today"})`);
    else warn(`The newest backup is ${days} days old`, "Back up now: npm run backup (or Settings → Data & backups)");
  } else console.log(`${paint(2, "·")} No backups yet: Friends makes one a day while it runs, or run: npm run backup`);

  // API keys
  const keys = require("../server/keys");
  if (keys.isSystemKeyringOperational()) ok("API keys are kept in the system keyring");
  else warn("No system keyring: API keys go into a private file (mode 0600) in your data folder", "Optional: install GNOME Keyring or KWallet. Not needed for local AI, which has no key");

  // The port
  const port = config.port;
  const running = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false);
  if (running) ok(`Friends is already running at http://localhost:${port}`);
  else if (await portFree(port)) ok(`Port ${port} is free (start it with: npm start)`);
  else fail(`Port ${port} is used by something else`, `Start Friends on another port: PORT=3001 npm start`);

  // Local AI
  const detected = await require("../server/local").detect();
  const found = detected.filter((s) => s.running);
  if (found.length) {
    for (const s of found) ok(`${s.label} is running with ${s.models.length} model${s.models.length === 1 ? "" : "s"}${s.models.length ? ` (${s.models.slice(0, 3).join(", ")}${s.models.length > 3 ? "…" : ""})` : ""}`);
    if (found.every((s) => !s.models.length)) warn("The local AI server has no model yet", found[0].protocol === "ollama" ? "Run: ollama pull llama3.2" : "Load a model in the server");
  } else {
    warn("No local AI server found (optional: it keeps your chats on this computer)", "Install Ollama (https://ollama.com/download), then: ollama pull llama3.2");
  }

  // The assistant: the graphics card, the specialist models, Gemini (the manager) and the folder missions work in
  await assistant();

  // Local voice
  const voice = require("../server/voice");
  if (voice.installed()) ok("Local voice is set up (listening and speaking offline)");
  else console.log(`${paint(2, "·")} Local voice: not set up (optional, ~1 GB). Talking to a local AI needs it: npm run voice:setup`);

  // Desktop app
  const electron = path.join(root, "node_modules", "electron", "dist", "electron");
  if (fs.existsSync(electron)) ok("Electron is ready for the desktop app (npm run desktop / npm run dist)");
  else console.log(`${paint(2, "·")} Desktop app: not set up (optional). Run: npm ci && node node_modules/electron/install.js`);

  console.log(`\n${errors ? paint(31, `${errors} problem${errors === 1 ? "" : "s"} to fix`) : paint(32, "Ready.")}${warnings ? paint(33, `  ${warnings} tip${warnings === 1 ? "" : "s"}`) : ""}`);
  process.exit(errors ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
