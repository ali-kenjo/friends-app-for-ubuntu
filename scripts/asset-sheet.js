// The asset contact sheet: every room asset drawn by its real builder, front / three-quarter / top,
// at Low and High, for the visual review against the art rules (docs/design/room.md).
//   node scripts/asset-sheet.js [--only hero|all] [--ids desk_writing,sofa] [--levels low,high] [--out name]
//   npm run design:assets
// Writes docs/design/screenshots/1.1/assets/<name>-<level>.jpg and stats.json (draw calls, triangles, size).
const fs = require("node:fs");
const path = require("node:path");
const { launch, root } = require("./lib/harness");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const ONLY = flag("only", "all");
const IDS = flag("ids", "").split(",").filter(Boolean);
const LEVELS = flag("levels", "low,high").split(",");
const NAME = flag("out", IDS.length ? "selection" : ONLY);
const outDir = path.join(root, "docs", "design", "screenshots", "1.1", "assets");

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const h = await launch({ webgl: true });
  const errors = [];
  h.page.on("pageerror", (e) => errors.push(e.message));
  h.page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const all = {};
  try {
    await h.page.goto(`${h.base}/?room-lab`, { waitUntil: "domcontentloaded" });
    await h.page.waitForFunction(() => window.friendsRoomLab, { timeout: 60000 });
    for (const level of LEVELS) {
      const { url, stats } = await h.page.evaluate((o) => window.friendsRoomLab.renderSheet(o), { ids: IDS.length ? IDS : null, level, only: ONLY });
      const file = path.join(outDir, `${NAME}-${level}.jpg`);
      fs.writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
      all[level] = stats;
      console.log(`  ${path.relative(root, file)}  (${stats.length} assets)`);
    }
  } finally {
    fs.writeFileSync(path.join(outDir, `${NAME}-stats.json`), JSON.stringify({ when: new Date().toISOString(), stats: all, errors }, null, 2) + "\n");
    await h.close();
  }
  if (errors.length) {
    console.log(`${errors.length} problem(s):\n  ${errors.slice(0, 20).join("\n  ")}`);
    process.exitCode = 1;
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
