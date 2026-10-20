// Shared by scripts/build-deb.js and scripts/build-appimage.js: Electron with Friends' own name on the program, and the
// app inside it with only its runtime dependencies. Both packages put the same files in different wrappers.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..", "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const electronDist = path.join(root, "node_modules", "electron", "dist");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });

// Newer npm versions don't run Electron's own download when installing, so it's fetched here
function ensureElectron() {
  if (fs.existsSync(path.join(electronDist, "electron"))) return;
  const installer = path.join(root, "node_modules", "electron", "install.js");
  if (!fs.existsSync(installer)) {
    console.error("Electron isn't installed. Run: npm ci");
    process.exit(1);
  }
  console.log("Downloading Electron…");
  run(process.execPath, [installer], { cwd: root });
  if (!fs.existsSync(path.join(electronDist, "electron"))) {
    console.error("Electron couldn't be downloaded. Run: node node_modules/electron/install.js");
    process.exit(1);
  }
}

// Puts Electron (the program is called `friends`) and the app into dest (an empty folder): dest/friends, dest/resources/app
function stageApp(dest) {
  ensureElectron();
  const app = path.join(dest, "resources", "app");
  // Electron itself, with our name on the program
  fs.cpSync(electronDist, dest, { recursive: true });
  fs.renameSync(path.join(dest, "electron"), path.join(dest, "friends"));
  fs.rmSync(path.join(dest, "resources", "default_app.asar"), { force: true });

  // The app, with only its runtime dependencies
  fs.mkdirSync(app, { recursive: true });
  for (const dir of ["electron", "server", "src", "voice"]) fs.cpSync(path.join(root, dir), path.join(app, dir), { recursive: true });
  fs.mkdirSync(path.join(app, "build"));
  fs.copyFileSync(path.join(root, "build", "icon.png"), path.join(app, "build", "icon.png"));
  const appPkg = { ...pkg, scripts: undefined, devDependencies: undefined, build: undefined };
  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify(appPkg, null, 2));
  fs.copyFileSync(path.join(root, "package-lock.json"), path.join(app, "package-lock.json"));
  run("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: app });
  fs.rmSync(path.join(app, "package-lock.json"));
  return app;
}

module.exports = { root, pkg, run, stageApp, ensureElectron };
