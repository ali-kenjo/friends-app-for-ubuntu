// A fake cloud service with the OpenAI-style API (OpenAI, Groq, OpenRouter, a company gateway…), for tests.
//   const ai = fakeOpenai.create({ keys: ["good-key"], models: ["small", "big"] });
//   await ai.start(); ai.url() → "http://127.0.0.1:PORT/v1"; ai.hits → every request it got
// behave: { status, delay, text, rejectTemperature, tokensParam ("max_tokens" | "max_completion_tokens"), noTools, noList }
const http = require("node:http");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function create({ keys = ["good-key"], models = ["small-model", "big-model"], ...initial } = {}) {
  const behave = { status: 0, delay: 0, text: "Hello from the service", rejectTemperature: false, tokensParam: "max_tokens", noTools: false, noList: false, failFirst: 0, ...initial };
  const hits = [];
  let failures = 0;

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
    const auth = req.headers.authorization || "";
    hits.push({ method: req.method, url: req.url, auth, body, headers: req.headers });
    const json = (status, data) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(data));
    if (keys.length && !keys.includes(auth.replace(/^Bearer /, ""))) return json(401, { error: { message: "Incorrect API key provided" } });
    if (behave.status) return json(behave.status, { error: { message: behave.status === 429 ? "Rate limit reached" : behave.status === 402 ? "Insufficient credit" : "broken" } });

    if (req.url === "/v1/models") {
      if (behave.noList) return json(404, { error: { message: "no such route" } });
      return json(200, { data: [...models, "text-embedding-3-small", "dall-e-3", "whisper-1"].map((id) => ({ id })) });
    }
    if (req.url === "/v1/chat/completions") {
      if (behave.failFirst && failures < behave.failFirst) {
        failures++;
        return json(503, { error: { message: "The server is overloaded" } });
      }
      if (behave.rejectTemperature && body.temperature !== undefined) return json(400, { error: { message: "Unsupported value: 'temperature' does not support 0.3 with this model. Only the default (1) value is supported." } });
      if (behave.tokensParam === "max_completion_tokens" && body.max_tokens !== undefined) return json(400, { error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead." } });
      if (behave.tokensParam === "max_tokens" && body.max_completion_tokens !== undefined) return json(400, { error: { message: "Unsupported parameter: 'max_completion_tokens'. Use 'max_tokens'." } });
      if (behave.noTools && body.tools) return json(400, { error: { message: "This model does not support tools" } });
      if (!models.includes(body.model)) return json(404, { error: { message: `The model \`${body.model}\` does not exist` } });
      if (behave.delay) await sleep(behave.delay);
      const text = typeof behave.text === "function" ? behave.text(body) : behave.text;
      if (body.stream) {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        for (const piece of text.match(/.{1,12}/gs) || [""]) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
        return res.end("data: [DONE]\n\n");
      }
      return json(200, { choices: [{ message: { role: "assistant", content: text } }] });
    }
    return json(404, { error: { message: "not found" } });
  });

  return {
    behave,
    hits,
    start: () => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)),
    stop: () => new Promise((resolve) => (server.closeAllConnections?.(), server.close(resolve))),
    url: () => `http://127.0.0.1:${server.address().port}/v1`,
    reset: () => {
      hits.length = 0;
      failures = 0;
    },
    chats: () => hits.filter((h) => h.url === "/v1/chat/completions"),
  };
}

module.exports = { create };
