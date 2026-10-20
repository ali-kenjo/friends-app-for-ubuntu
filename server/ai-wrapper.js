// What happens around every call to an AI, whichever provider it is (the page's settings, one place):
//   - the AI's own settings: temperature, the longest reply, top-p, a line added to the instructions, tools off
//   - a daily limit per AI, and a count of calls, failures and speed (usage.js)
//   - a cloud AI never sees what Settings → Privacy hides (redact.js), also in what a tool brings back
//   - a time limit: how long an AI may stay silent (before it starts, and while it answers)
//   - a request that failed for a passing reason (busy, no connection) is tried again before anything was shown
// providers.js makes the api for a brain; brains.js wraps it here when it hands the brain out.
const usage = require("./usage");
const redact = require("./redact");
const logger = require("./logger");
const { say } = require("./say");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RETRY_MS = () => Number(process.env.FRIENDS_RETRY_MS ?? 800);

const isTransient = (err) => err && err.name !== "AbortError" && (err.retryable === true || /ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed/i.test(String(err.message)));

function limitError(brain, limit) {
  return Object.assign(new Error(say("{name} has used its daily limit of {limit} requests. It's counted again tomorrow, or raise the limit in its settings.", { name: brain.name || say("This AI"), limit })), { limit: true });
}

// fn(signal, arm, hold): runs with a signal that also fires when nothing happened for `seconds`. arm() says "something
// happened"; hold() pauses the clock (a tool waiting for you to answer isn't the AI being silent).
async function withIdle(parent, seconds, name, fn) {
  if (!seconds) return fn(parent, () => {}, () => {});
  const controller = new AbortController();
  let timedOut = false;
  let timer = null;
  const hold = () => clearTimeout(timer);
  const arm = () => {
    hold();
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, seconds * 1000);
  };
  const follow = () => controller.abort();
  if (parent?.aborted) controller.abort();
  parent?.addEventListener("abort", follow, { once: true });
  arm();
  try {
    return await fn(controller.signal, arm, hold);
  } catch (err) {
    if (timedOut) throw Object.assign(new Error(say("{name} didn't answer within {seconds} seconds. Wait longer in Settings → AI & privacy → Answers, or use another AI.", { name, seconds })), { timeout: true });
    throw err;
  } finally {
    hold();
    parent?.removeEventListener("abort", follow);
  }
}

// brain: the saved brain with kind ("cloud" | "local"), params, name, id. settings(): the live settings.
function wrap(api, brain, settings) {
  const params = brain.params || {};
  const own = (n) => (typeof n === "number" && Number.isFinite(n) ? n : undefined);

  const rules = () => {
    const s = settings();
    const ai = s.aiControl || {};
    return {
      timeout: own(params.timeoutSeconds) || ai.timeoutSeconds || 0,
      retries: brain.provider === "gemini" ? 0 : ai.retries ?? 1, // Gemini's code already tries its other models
      maxTokens: params.maxTokens || ai.maxTokens || undefined,
      redact: brain.kind === "cloud" ? s.privacy?.redact : null,
    };
  };

  const guard = () => {
    if (usage.overLimit(brain.id, params.dailyLimit)) throw limitError(brain, params.dailyLimit);
  };

  async function run(call, { started }) {
    const t0 = Date.now();
    const { retries } = rules();
    try {
      for (let n = 0; ; n++) {
        try {
          const result = await call();
          usage.record(brain.id, { ok: true, ms: Date.now() - t0 });
          return result;
        } catch (err) {
          if (n >= retries || started() || !isTransient(err)) throw err;
          logger.info(`${brain.name}: ${err.message} Trying again.`);
          await sleep(RETRY_MS() * 2 ** n);
        }
      }
    } catch (err) {
      // A stop pressed by the person, or another AI that answered first, isn't the AI's fault
      if (err.name !== "AbortError" || err.timeout) usage.record(brain.id, { ok: false, error: err.message });
      throw err;
    }
  }

  async function streamChat(args) {
    guard();
    const r = rules();
    let began = false;
    const next = { ...args };
    if (own(params.temperature) !== undefined) next.temperature = params.temperature;
    if (next.maxTokens === undefined && r.maxTokens) next.maxTokens = r.maxTokens;
    if (next.topP === undefined && own(params.topP) !== undefined && params.topP > 0) next.topP = params.topP;
    if (params.tools === "off") next.tools = [];
    if (params.systemPrefix) next.system = `${params.systemPrefix}\n\n${next.system || ""}`.trim();
    if (redact.active(r.redact)) {
      next.contents = redact.redactContents(next.contents, r.redact);
      if (next.system) next.system = redact.redactText(next.system, r.redact);
    }
    return run(
      () =>
        withIdle(args.signal, r.timeout, brain.name || "The AI", (signal, arm, hold) =>
          api.streamChat({
            ...next,
            signal,
            onText: (piece) => {
              began = true;
              arm();
              return args.onText?.(piece);
            },
            runTool: args.runTool
              ? async (name, a) => {
                  began = true; // a tool may do something that can't be undone: no second try after this
                  hold();
                  try {
                    const result = await args.runTool(name, a);
                    return redact.active(r.redact) ? redact.redactDeep(result, r.redact) : result;
                  } finally {
                    arm();
                  }
                }
              : undefined,
          })
        ),
      { started: () => began }
    );
  }

  async function generateText(args) {
    guard();
    const r = rules();
    const next = { ...args };
    if (redact.active(r.redact)) {
      if (next.prompt) next.prompt = redact.redactText(next.prompt, r.redact);
      if (next.system) next.system = redact.redactText(next.system, r.redact);
    }
    return run(() => withIdle(args.signal, r.timeout, brain.name || "The AI", (signal) => api.generateText({ ...next, signal })), { started: () => false });
  }

  return { ...api, streamChat, generateText };
}

module.exports = { wrap, withIdle, isTransient };
