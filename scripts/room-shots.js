// Screenshots of every room template in voice mode, for the README's before/after pairs and the visual review.
//   node scripts/room-shots.js <label> [--quality low,high] [--aspects 16x9,9x16] [--themes dark,light] [--only lounge,desk]
//   npm run design:rooms            (label "after")
// Writes docs/design/screenshots/1.1/<label>/rooms/<room>-<quality>-<aspect>-<theme>.png and stats.json
// (draw calls and triangles summed over every render pass of one frame, frame time on this machine).
// Starts the real helper on a scratch data folder with software WebGL (see scripts/lib/harness.js).
const fs = require("node:fs");
const path = require("node:path");
const { launch, sleep, root } = require("./lib/harness");

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--")) || "after";
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const QUALITIES = flag("quality", "low,high").split(",");
const ASPECTS = flag("aspects", "16x9,9x16").split(",");
const THEMES = flag("themes", "dark").split(",");
const ONLY = flag("only", "").split(",").filter(Boolean);
const SIZES = { "16x9": [1280, 720], "9x16": [540, 960] };

const outDir = path.join(root, "docs", "design", "screenshots", "1.1", label, "rooms");

async function main() {
  const { roomList } = await import(path.join(root, "scripts", "lib", "room-list.mjs"));
  const rooms = roomList(label === "before" ? "legacy" : "rooms").filter((r) => !ONLY.length || ONLY.includes(r.id));
  fs.mkdirSync(outDir, { recursive: true });
  const h = await launch({ webgl: true });
  const { page, api, base } = h;
  // Voice mode in the Robot style (it remembers the style in localStorage; Sunset is its default)
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("friends.voiceTheme", "robot");
      localStorage.setItem("friends.language", "en");
    } catch {}
  });
  const stats = {};
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    for (const theme of THEMES) {
      for (const quality of QUALITIES) {
        for (const aspect of ASPECTS) {
          const [width, height] = SIZES[aspect];
          await page.setViewport({ width, height, deviceScaleFactor: 1 });
          for (const r of rooms) {
            const s = await api("GET", "/api/settings");
            await api("PUT", "/api/settings", await r.settings(s, { theme, quality }, api));
            await page.goto(`${base}/?robot-debug&voice=1`, { waitUntil: "domcontentloaded" });
            const ok = await page
              .waitForFunction(() => window.friendsRobot?.engine?.running && window.friendsRobot.engine.roomKey, { timeout: 60000 })
              .then(() => true, () => false);
            if (!ok) {
              errors.push(`${r.id}: the engine did not start`);
              continue;
            }
            await sleep(2500); // the room is built, the camera has settled, the robot has greeted
            // …and the procedural textures have arrived from their worker
            await page.evaluate(() => import("/js/room/render/kit/textures.js").then((m) => Promise.race([m.texturesSettled(), new Promise((r) => setTimeout(r, 20000))])));
            await sleep(300);
            // Only the picture: voice mode's buttons, captions and notes are hidden for these shots
            await page.addStyleTag({ content: "#voice-mode * { visibility: hidden !important; } #voice-mode canvas.robot-canvas { visibility: visible !important; }" });
            const frame = await page.evaluate(() => {
              const e = window.friendsRobot.engine;
              const info = e.renderer.info;
              info.autoReset = false;
              info.reset();
              const t0 = performance.now();
              e.renderNow();
              const gl = e.renderer.getContext();
              gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); // waits for the frame to finish
              const ms = performance.now() - t0;
              const out = { calls: info.render.calls, triangles: info.render.triangles, ms: Math.round(ms), level: e.level };
              info.autoReset = true;
              let meshes = 0;
              e.stage.scene.traverseVisible((o) => o.isMesh && meshes++);
              out.meshes = meshes;
              return out;
            });
            const name = `${r.id}-${quality}-${aspect}-${theme}.png`;
            await page.screenshot({ path: path.join(outDir, name) });
            stats[`${r.id}|${quality}|${aspect}|${theme}`] = frame;
            console.log(`  ${name}  calls ${frame.calls}  tris ${frame.triangles}  meshes ${frame.meshes}  ${frame.ms} ms`);
          }
        }
      }
    }
  } finally {
    fs.writeFileSync(path.join(outDir, "stats.json"), JSON.stringify({ when: new Date().toISOString(), renderer: "SwiftShader (software WebGL)", stats, errors }, null, 2) + "\n");
    await h.close();
  }
  if (errors.length) {
    console.log(`${errors.length} problem(s):\n  ${errors.join("\n  ")}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
