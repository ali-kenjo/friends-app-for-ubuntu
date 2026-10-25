// `npm run test:a11y`: axe-core over the main surfaces, in dark and light, left-to-right (English)
// and right-to-left (Arabic). Fails on serious or critical violations.
//   node scripts/a11y.js [--langs en,ar] [--themes dark,light] [--width 1280] [--report path.json] [--all-impacts]
// Needs Chrome (CHROME_PATH or the usual places). Runs against the real helper with a fake local AI.
const fs = require("node:fs");
const path = require("node:path");
const { launch, sleep } = require("./lib/harness");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const LANGS = flag("langs", "en,ar").split(",");
const THEMES = flag("themes", "dark,light").split(",");
const FULL_PACKS = flag("packs", "cozy,classic").split(",").filter(Boolean);
const HERO_PACKS = flag("hero-packs", "sunrise,forest,lavender,ocean").split(",").filter(Boolean);
const WIDTH = Number(flag("width", 1280));
const REPORT = flag("report", "");
const ACCENT = flag("accent", ""); // one of the accent colours of Settings → Appearance, e.g. #f59e0b
const FAIL_ON = args.includes("--all-impacts") ? ["minor", "moderate", "serious", "critical"] : ["serious", "critical"];

const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

async function main() {
  const h = await launch();
  const { page } = h;
  const results = [];

  const scan = async (surface, lang, theme, pack = "cozy") => {
    await page.evaluate(axeSource).catch(() => {});
    const out = await page.evaluate(async () => {
      // Scan what's visible; hidden dialogs are scanned when they're open
      const r = await window.axe.run(document, { resultTypes: ["violations"], runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target.join(" "), summary: n.failureSummary?.split("\n").slice(0, 3).join(" ") })), count: v.nodes.length }));
    });
    for (const v of out) results.push({ surface, lang, theme, pack, ...v });
    const bad = out.filter((v) => FAIL_ON.includes(v.impact));
    console.log(`${bad.length ? "✗" : "✓"} ${lang} ${pack}/${theme} ${surface}${out.length ? `  (${out.length} finding${out.length > 1 ? "s" : ""}, ${bad.length} serious or worse)` : ""}`);
  };
  const click = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);

  // The whiteboard: its page, the dialogs on it, the panel beside the chat, and the robot's settings for it
  const scanWhiteboard = async (lang, theme, pack) => {
    const whiteboard = require("../server/whiteboard");
    const board = whiteboard.current();
    if (!board.pages.some((p) => p.items.length)) {
      whiteboard.apply(board.id, [
        { op: "add", item: { type: "sticky", text: "Idea", x: 120, y: 120, color: "pink" } },
        { op: "add", item: { type: "text", text: "Roadmap", x: 420, y: 110, fontSize: 32 } },
        { op: "add", item: { type: "checklist", title: "Today", items: ["Write", "Draw", "Ship"], x: 120, y: 380 } },
      ], { actor: "ai", batch: "a11y" });
    }
    await click("#nav-whiteboard");
    await sleep(1100);
    await scan("whiteboard", lang, theme, pack);
    // something selected, so its options and the bar next to it are showing
    await page.evaluate(() => document.querySelector('[data-wb-tool="select"]')?.click());
    await page.keyboard.down("Control");
    await page.keyboard.press("a");
    await page.keyboard.up("Control");
    await sleep(300);
    await scan("whiteboard-selection", lang, theme, pack);
    await click("#insp-tab-arrange");
    await sleep(200);
    await scan("whiteboard-arrange", lang, theme, pack);
    await click("#insp-tab-design");
    await page.keyboard.press("Escape");
    // The panels on the left, one by one
    for (const [i, name] of ["boards", "outline", "sources", "shapes", "layouts"].entries()) {
      await page.evaluate((n) => document.querySelectorAll(".rw-rail-btn")[n]?.click(), i);
      await sleep(700);
      await scan(`whiteboard-${name}`, lang, theme, pack);
    }
    await page.evaluate(() => document.querySelectorAll(".rw-rail-btn")[4]?.click());
    // What the robot is: the roles on offer
    await click(".rw-role-btn");
    await sleep(500);
    await scan("whiteboard-roles", lang, theme, pack);
    await page.keyboard.press("Escape");
    // Find anything
    await page.keyboard.down("Control");
    await page.keyboard.press("p");
    await page.keyboard.up("Control");
    await sleep(500);
    await scan("whiteboard-palette", lang, theme, pack);
    await page.keyboard.press("Escape");
    // The dialogs
    for (const [index, name] of [[0, "history"]]) {
      await page.evaluate(() => document.querySelector('#wb-actions [aria-label="Earlier versions"]')?.click());
      await sleep(600);
      await scan(`whiteboard-${name}`, lang, theme, pack);
      await page.keyboard.press("Escape");
      await sleep(250);
      void index;
    }
    // Beside the chat: the board in its window
    await click("#nav-home");
    await sleep(400);
    await click("#home-wb-toggle-btn");
    await sleep(900);
    await scan("whiteboard-dock", lang, theme, pack);
    await page.evaluate(() => document.querySelector('.wb-win-chat .fw-head [aria-haspopup="menu"]')?.click());
    await sleep(300);
    await scan("whiteboard-dock-menu", lang, theme, pack);
    await page.keyboard.press("Escape");
    await click("#home-wb-toggle-btn");
    await sleep(300);
    // Settings → Robot, each of its parts
    await click("#settings-btn");
    await sleep(300);
    await page.evaluate(() => document.querySelector('.modal-nav .tab[data-tab="robot"]')?.click());
    await sleep(300);
    const parts = await page.evaluate(() => [...document.querySelectorAll('.subtabs [role="tab"]')].map((t) => t.id).filter((id) => /^subtab-rb-/.test(id)));
    for (const id of parts) {
      await page.evaluate((i) => document.getElementById(i)?.click(), id);
      await sleep(300);
      await scan(`settings-robot-${id.replace("subtab-rb-", "")}`, lang, theme, pack);
    }
    await click("#settings-close");
    await sleep(300);
  };

  for (const lang of LANGS) {
    for (const theme of THEMES) {
      for (const pack of FULL_PACKS) {
        // First run: nothing is set up yet
        await h.removeBrains();
        await h.setLook({ theme, pack, width: WIDTH, lang, onboarding: false, accent: ACCENT });
        await scan("first-run", lang, theme, pack);

        await h.setLook({ theme, pack, width: WIDTH, lang, accent: ACCENT });
        await scan("start-no-ai", lang, theme, pack);

        await h.addLocalBrain();
        await h.setLook({ theme, pack, width: WIDTH, lang, accent: ACCENT });
        await scan("start", lang, theme, pack);

        await page.type("#composer-input", "Show me code, math and a diagram");
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => document.querySelector(".msg.model .msg-body")?.innerText.length > 40, { timeout: 20000 }).catch(() => {});
        await sleep(2500);
        await scan("chat", lang, theme, pack);

        await click("#model-picker");
        await sleep(250);
        await scan("model-menu", lang, theme, pack);
        await click("#model-picker");

        await click("#search-open");
        await sleep(250);
        await scan("search", lang, theme, pack);
        await page.keyboard.press("Escape");

        // The "+" menu, Today (and everything else under it), Missions
        await click("#plus-btn");
        await sleep(200);
        await scan("plus-menu", lang, theme, pack);
        await click("#plus-btn");
        await click("#today-open");
        await sleep(500);
        await scan("today", lang, theme, pack);
        await page.evaluate(() => (document.getElementById("today-more").open = true));
        for (const tab of ["tasks", "reminders", "calendar", "habits", "journal"]) {
          await click(`[data-life-tab="${tab}"]`);
          await sleep(250);
          await scan(`today-${tab}`, lang, theme, pack);
        }
        await click("#nav-missions");
        await sleep(500);
        await scan("missions", lang, theme, pack);
        await click("#nav-home");
        await sleep(300);

        await click("#settings-btn");
        await sleep(300);
        const tabs = await page.evaluate(() => [...document.querySelectorAll(".modal-nav .tab")].map((t) => t.dataset.tab));
        for (const tab of tabs) {
          await page.evaluate((t) => document.querySelector(`.modal-nav .tab[data-tab="${t}"]`)?.click(), tab);
          await sleep(300);
          await scan(`settings-${tab}`, lang, theme, pack);
          // AI & privacy has four sections of its own, and an add form
          if (tab === "ai-control") {
            for (const section of ["answers", "privacy", "device"]) {
              await page.evaluate((n) => document.querySelector(`.subtab[data-subtab="${n}"]`)?.click(), section);
              await sleep(500);
              await scan(`settings-ai-${section}`, lang, theme, pack);
            }
            await page.evaluate(() => document.querySelector('.subtab[data-subtab="ais"]')?.click());
            await page.evaluate(() => document.getElementById("brain-add")?.click());
            await sleep(500);
            await scan("settings-ai-add-pick", lang, theme, pack);
            await page.evaluate(() => document.querySelector('#service-grid-cloud .service-tile[data-id="groq"]')?.click());
            await sleep(400);
            await scan("settings-ai-add-form", lang, theme, pack);
            await page.evaluate(() => document.getElementById("ai-add-back")?.click());
            await sleep(300);
          }
        }
        // The Robot Studio: every tab, and the outfit and room with something chosen (so their colors and options are showing)
        await page.evaluate(() => document.querySelector('.modal-nav .tab[data-tab="robot"]')?.click());
        await click("#robot-studio-open");
        await sleep(500);
        for (const tab of ["colors", "shape", "face", "outfit", "room", "looks"]) {
          await click(`#rs-tab-${tab}`);
          await sleep(250);
          await scan(`studio-${tab}`, lang, theme, pack);
        }
        await click("#rs-tab-outfit");
        await page.evaluate(() => document.querySelector("#rs-panel-outfit .rs-tile[data-id=beanie]")?.click());
        await page.evaluate(() => document.querySelector('#rs-panel-outfit [data-slot="torso"]')?.click());
        await page.evaluate(() => document.querySelector("#rs-panel-outfit .rs-tile[data-id=sweater]")?.click());
        await sleep(250);
        await scan("studio-outfit-worn", lang, theme, pack);
        await click("#rs-tab-room");
        await page.evaluate(() => document.querySelector("#rs-panel-room .rs-tile[data-id=podcast]")?.click());
        await sleep(250);
        await scan("studio-room-podcast", lang, theme, pack);
        await click("#rs-done");
        await sleep(200);
        await click("#settings-close");

        await scanWhiteboard(lang, theme, pack);

        await click("#voice-open");
        await sleep(1200);
        await scan("voice", lang, theme, pack);
        await click("#voice-board-btn");
        await sleep(900);
        await scan("voice-board", lang, theme, pack);
        await click("#voice-board-btn");
        await click("#voice-role");
        await sleep(400);
        await scan("voice-role", lang, theme, pack);
        await page.keyboard.press("Escape");
        await click("#voice-place");
        await sleep(400);
        await scan("voice-move", lang, theme, pack);
        await page.keyboard.press("Escape");
        await click("#voice-filming");
        await sleep(400);
        await scan("filming-setup", lang, theme, pack);
        await page.keyboard.press("Escape");
        await click("#voice-end");
        await sleep(300);
      }

      // Hero surfaces across the remaining theme packs
      for (const pack of HERO_PACKS) {
        await h.addLocalBrain();
        await h.setLook({ theme, pack, width: WIDTH, lang, accent: ACCENT });
        await scan("start", lang, theme, pack);
        await page.type("#composer-input", "Show me code, math and a diagram");
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => document.querySelector(".msg.model .msg-body")?.innerText.length > 40, { timeout: 20000 }).catch(() => {});
        await sleep(2000);
        await scan("chat", lang, theme, pack);
        await click("#today-open");
        await sleep(400);
        await scan("today", lang, theme, pack);
        await click("#nav-missions");
        await sleep(400);
        await scan("missions", lang, theme, pack);
        await click("#nav-home");
        await sleep(250);
        await click("#settings-btn");
        await sleep(300);
        await page.evaluate(() => document.querySelector('.modal-nav .tab[data-tab="appearance"]')?.click());
        await sleep(250);
        await scan("settings-appearance", lang, theme, pack);
        await click("#settings-close");
        await sleep(200);
      }
    }
  }

  await h.close();
  if (REPORT) fs.writeFileSync(REPORT, JSON.stringify(results, null, 2));

  const bad = results.filter((v) => FAIL_ON.includes(v.impact));
  const byRule = new Map();
  for (const v of results) {
    const e = byRule.get(v.id) || { impact: v.impact, help: v.help, where: new Set(), example: v.nodes[0]?.target };
    e.where.add(v.surface);
    byRule.set(v.id, e);
  }
  if (byRule.size) {
    console.log("\nFindings by rule:");
    for (const [id, e] of byRule) console.log(`  ${e.impact.padEnd(8)} ${id}: ${e.help} — ${[...e.where].slice(0, 6).join(", ")}${e.where.size > 6 ? "…" : ""}  e.g. ${e.example}`);
  }
  if (bad.length) {
    console.error(`\n✗ ${bad.length} ${FAIL_ON.length > 2 ? "" : "serious or critical "}violation${bad.length > 1 ? "s" : ""}`);
    process.exit(1);
  }
  console.log(`\n✓ No ${FAIL_ON.length > 2 ? "" : "serious or critical "}accessibility violations`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
