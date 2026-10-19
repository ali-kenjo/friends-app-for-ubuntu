// Missions: the public face of the engine (server/missions/). server.js calls init() once, then the routes use
// the functions below. The pieces: runner.js (the life of a mission), manager.js (the planner), toolbelt.js and
// risk.js (what a step may do), cloud.js (rate limits), automations.js (schedules and triggers).
const runner = require("./runner");
const automations = require("./automations");
const cloud = require("./cloud");
const models = require("../models");
const settingsModule = require("../settings");

// fns: { push(type, data) (to the page), notify({ title, body, action }) (desktop), telegram: { send(text, options), ready() },
//        googleToken() }
function init(fns) {
  runner.setHooks({
    telegramSend: fns.telegram ? (text) => fns.telegram.send(text) : null,
    telegramReady: () => Boolean(fns.telegram?.ready()),
    googleToken: fns.googleToken || (async () => null),
  });
  runner.onEvent((e) => {
    fns.push("mission", e);
    if (e.notify) {
      const cfg = settingsModule.get().missions?.notify || {};
      if (cfg.desktop !== false) fns.notify({ title: e.notify.title, body: e.notify.body, action: { type: "mission", id: e.mission?.id } });
      if (cfg.telegram !== false) fns.telegram?.event?.(e);
    }
  });
  models.onChange((status) => fns.push("model", status));
  automations.init({
    fire: runner.createFromPlan,
    alert: ({ title, body }) => {
      fns.push("alert", { title, body });
      fns.notify({ title, body, action: { type: "missions" } });
      fns.telegram?.alert?.(`${title}\n${body}`);
    },
  });
  runner.recover();
}

// Everything the Missions page needs at once
function overview() {
  const list = runner.list();
  return {
    missions: list,
    automations: automations.all().map((a) => ({ ...a, description: automations.describe(automations.find(a.id)) })),
    usage: cloud.usageToday(),
    model: models.status(),
    active: list.filter((m) => ["planning", "clarifying", "awaiting_approval", "running", "paused"].includes(m.status)).length,
  };
}

module.exports = { init, overview, runner, automations, cloud, ...runner };
