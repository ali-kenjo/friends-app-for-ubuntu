// Builds dist/Friends-<version>-x86_64.AppImage: one file that runs on most Linux desktops without installing
// anything (the .deb from `npm run dist` stays the way to install it properly). Electron + this app are laid out as an
// AppDir and packed by appimagetool, which is downloaded once (pinned to a version and its checksum) into
// ~/.cache/friends-build. Set APPIMAGETOOL to use your own copy instead.
//   npm run dist:appimage
// Run it with `chmod +x Friends-*.AppImage && ./Friends-*.AppImage`. On a recent Ubuntu an AppImage needs libfuse2
// (sudo apt install libfuse2t64); without it, `./Friends-*.AppImage --appimage-extract-and-run` works too.
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { root, pkg, run, stageApp } = require("./lib/stage-app");

// appimagetool 1.9.1 (released 2025-11-18). The checksum is of the file the first download gave; a download that doesn't
// match is thrown away, so a changed file is noticed instead of run.
const TOOL = {
  version: "1.9.1",
  url: "https://github.com/AppImage/appimagetool/releases/download/1.9.1/appimagetool-x86_64.AppImage",
  sha256: "ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0",
};

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

async function findTool() {
  if (process.env.APPIMAGETOOL) {
    if (!fs.existsSync(process.env.APPIMAGETOOL)) throw new Error(`APPIMAGETOOL points at ${process.env.APPIMAGETOOL}, which isn't there.`);
    return process.env.APPIMAGETOOL;
  }
  const cache = path.join(os.homedir(), ".cache", "friends-build");
  const file = path.join(cache, `appimagetool-${TOOL.version}-x86_64.AppImage`);
  if (fs.existsSync(file) && sha256(file) === TOOL.sha256) return file;
  console.log(`Downloading appimagetool ${TOOL.version}…`);
  fs.mkdirSync(cache, { recursive: true });
  const res = await fetch(TOOL.url, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`Couldn't download appimagetool (${res.status}). Download it yourself and set APPIMAGETOOL=/path/to/appimagetool.`);
  const part = `${file}.part`;
  fs.writeFileSync(part, Buffer.from(await res.arrayBuffer()));
  if (sha256(part) !== TOOL.sha256) {
    fs.rmSync(part, { force: true });
    throw new Error("The downloaded appimagetool doesn't match the checksum this script expects, so it isn't used.");
  }
  fs.chmodSync(part, 0o755);
  fs.renameSync(part, file);
  return file;
}

async function main() {
  if (process.platform !== "linux" || process.arch !== "x64") throw new Error("An AppImage for x86_64 Linux can only be built on x86_64 Linux.");
  const tool = await findTool();
  const out = path.join(root, "dist");
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "friends-appimage-"));
  const appDir = path.join(work, "Friends.AppDir");
  try {
    // Electron and the app under usr/lib/friends
    stageApp(path.join(appDir, "usr", "lib", "friends"));

    // The program that AppImage starts. The sandbox helper can't have its setuid bit inside an AppImage, so Electron's own
    // sandbox is off (as in `npm run desktop`); Friends only opens its own page from 127.0.0.1.
    const appRun = path.join(appDir, "AppRun");
    fs.writeFileSync(appRun, '#!/bin/sh\nHERE="$(dirname "$(readlink -f "$0")")"\nexec "$HERE/usr/lib/friends/friends" --no-sandbox "$@"\n');
    fs.chmodSync(appRun, 0o755);

    // Launcher entry and icon
    fs.writeFileSync(
      path.join(appDir, "friends.desktop"),
      ["[Desktop Entry]", "Type=Application", "Name=Friends", "Comment=A personal AI companion that gets things done", "Exec=friends", "Icon=friends", "Terminal=false", "Categories=Network;InstantMessaging;Chat;", "StartupWMClass=Friends", "StartupNotify=true", ""].join("\n")
    );
    fs.copyFileSync(path.join(root, "build", "icon.png"), path.join(appDir, "friends.png"));
    fs.symlinkSync("friends.png", path.join(appDir, ".DirIcon"));
    const icons = path.join(appDir, "usr", "share", "icons", "hicolor", "512x512", "apps");
    fs.mkdirSync(icons, { recursive: true });
    fs.copyFileSync(path.join(root, "build", "icon.png"), path.join(icons, "friends.png"));

    fs.mkdirSync(out, { recursive: true });
    const file = path.join(out, `Friends-${pkg.version}-x86_64.AppImage`);
    fs.rmSync(file, { force: true });
    // appimagetool is itself an AppImage: run it without needing FUSE
    run(tool, ["--no-appstream", "--comp", "zstd", appDir, file], { env: { ...process.env, ARCH: "x86_64", APPIMAGE_EXTRACT_AND_RUN: "1" } });
    fs.chmodSync(file, 0o755);
    console.log(`\nBuilt ${file}\nRun it with: chmod +x ${path.basename(file)} && ./${path.basename(file)}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
