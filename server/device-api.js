// What Settings → AI & privacy → This computer shows: what the computer is (hardware.js), what a local AI may ask of
// it, which models suit it (the suggestions, with what's installed marked), and the app's own view of it.
const hardware = require("./hardware");
const settingsModule = require("./settings");
const suggestions = require("./specialist-suggestions");
const specialists = require("./specialists");
const vram = require("./vram");

async function report(settings = settingsModule.get()) {
  const hw = await hardware.live();
  let installed = [];
  let running = false;
  const base = specialists.ollamaUrl(settings);
  try {
    installed = (await vram.installed(base)).map((m) => m.name);
    running = true;
  } catch {}
  return {
    ...hw,
    effective: hardware.effective(hw, settings.device),
    suggestions: suggestions.suggest({ installed, budgetMb: hw.fit.budgetMb }),
    suggestionsChecked: suggestions.CHECKED,
    ollama: { baseUrl: base, running, installed },
    device: settings.device,
  };
}

module.exports = { report };
