// The helper's own sentences for a person, in the app's language (English, German, Arabic): what the Telegram bot says,
// notifications, and the reason an AI didn't answer. The page translates its own texts (src/js/i18n.js); this is the same
// idea for what is made here. Write the sentence in English with {placeholders}: say("Stopped {count} missions.", { count }).
// The translations are the page's catalogs (src/js/i18n/de.js, ar.js); `npm run i18n` finds every say("…") in server/
// and checks it has one, like it does for the page.
//
// Which language: the one picked in Settings; on "auto" the browser's, which the page tells with every request
// (Accept-Language) and which is remembered for the next start (Telegram can speak before a page is open).
const fs = require("fs");
const path = require("path");
const settings = require("./settings");
const { dataDir, writeJson } = require("./config");
const core = require("../src/js/i18n-core.mjs");

const file = () => path.join(dataDir, "language.json");
const translators = new Map();
let seen = null; // the browser's language: "de", "ar", "en"

function catalog(lang) {
  if (lang === "en") return {};
  try {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "js", "i18n", `${lang}.js`), "utf8");
    return new Function(`return (${src.replace(/^[\s\S]*?export default/, "").trim().replace(/;\s*$/, "")})`)();
  } catch {
    return {};
  }
}

const translator = (lang) => {
  if (!translators.has(lang)) translators.set(lang, core.createTranslator(lang, catalog(lang)));
  return translators.get(lang);
};

function remembered() {
  if (seen) return seen;
  try {
    const stored = JSON.parse(fs.readFileSync(file(), "utf8")).language;
    if (core.LANGUAGES[stored]) seen = stored;
  } catch {}
  return seen;
}

// The language texts are made in right now
function language() {
  const chosen = settings.get().ui?.language;
  return core.LANGUAGES[chosen] ? chosen : remembered() || "en";
}

// The page asked for something: its browser's languages say what "auto" means (the header, e.g. "de-DE,de;q=0.9,en;q=0.8")
function noteBrowser(acceptLanguage) {
  if (!acceptLanguage) return;
  const tags = String(acceptLanguage).split(",").map((part) => part.split(";")[0].trim()).filter((tag) => tag && tag !== "*");
  if (!tags.length) return;
  const lang = core.detectLanguage(tags);
  if (lang === seen) return;
  seen = lang;
  try {
    writeJson(file(), { language: lang });
  } catch {}
}

const say = (text, params) => translator(language()).t(text, params);
const sayN = (one, other, n, params) => translator(language()).tp(one, other, n, params);

module.exports = { say, sayN, language, noteBrowser };
