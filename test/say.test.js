// The helper's own sentences (Telegram, notifications, the reason an AI didn't answer) in the app's language:
// Settings wins, "auto" follows the browser the page reported, the browser's language is remembered for the next start,
// and a sentence without a translation comes out in English instead of breaking.
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-say-"));
Object.assign(process.env, { FRIENDS_DATA_DIR: path.join(tempDir, "data"), KEYRING_BACKEND: "file", LOG_LEVEL: "error" });

describe("Sentences made by the helper", () => {
  let settings, sayModule, wrapper, usage;
  const pick = (language) => settings.set({ ...settings.get(), ui: { ...settings.get().ui, language } });

  before(() => {
    settings = require("../server/settings");
    sayModule = require("../server/say");
    wrapper = require("../server/ai-wrapper");
    usage = require("../server/usage");
  });
  after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  test("English until something says otherwise; placeholders are filled", () => {
    assert.strictEqual(sayModule.language(), "en");
    assert.strictEqual(sayModule.say("Reminder: {text}", { text: "call" }), "Reminder: call");
  });

  test("the language picked in Settings is the language of the sentence", () => {
    pick("de");
    assert.strictEqual(sayModule.say("Reminder: {text}", { text: "Bank" }), "Erinnerung: Bank");
    pick("ar");
    assert.strictEqual(sayModule.say("Reminder: {text}", { text: "Bank" }), "تذكير: Bank");
    pick("en");
    assert.strictEqual(sayModule.say("Reminder: {text}", { text: "Bank" }), "Reminder: Bank");
  });

  test("a sentence nobody translated comes out as written", () => {
    pick("de");
    assert.strictEqual(sayModule.say("A sentence with no translation, {x}", { x: 1 }), "A sentence with no translation, 1");
  });

  test("plurals follow the language: German one/other, Arabic six forms", () => {
    pick("de");
    assert.strictEqual(sayModule.sayN("Stopped {n} mission.", "Stopped {n} missions.", 1), "1 Mission gestoppt.");
    assert.strictEqual(sayModule.sayN("Stopped {n} mission.", "Stopped {n} missions.", 3), "3 Missionen gestoppt.");
    pick("ar");
    assert.match(sayModule.sayN("Stopped {n} mission.", "Stopped {n} missions.", 2), /مهمّتين/);
    assert.match(sayModule.sayN("Stopped {n} mission.", "Stopped {n} missions.", 11), /11 مهمّة/);
  });

  test("on auto the browser decides, and it is remembered for the next start", () => {
    pick("auto");
    sayModule.noteBrowser("de-DE,de;q=0.9");
    assert.strictEqual(sayModule.language(), "de");
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(process.env.FRIENDS_DATA_DIR, "language.json"), "utf8")).language, "de");
    sayModule.noteBrowser("");
    sayModule.noteBrowser("*");
    assert.strictEqual(sayModule.language(), "de", "nothing said, nothing changed");
    sayModule.noteBrowser("fr-FR");
    assert.strictEqual(sayModule.language(), "en", "a language the app doesn't have: English, like the page");
  });

  test("the reason an AI didn't answer is in the language too", async () => {
    pick("de");
    usage.clearCache();
    const api = { async generateText() { return "ok"; }, async streamChat() {} };
    const ai = wrapper.wrap(api, { id: "say-1", name: "Mein Modell", kind: "cloud", provider: "openai", params: { dailyLimit: 1 } }, () => settings.get());
    await ai.generateText({ prompt: "a" });
    await assert.rejects(() => ai.generateText({ prompt: "b" }), (err) => err.limit === true && /Mein Modell hat sein Tageslimit von 1 Anfragen erreicht/.test(err.message));
    pick("en");
    await assert.rejects(() => ai.generateText({ prompt: "c" }), /Mein Modell has used its daily limit of 1 requests/);
  });
});
