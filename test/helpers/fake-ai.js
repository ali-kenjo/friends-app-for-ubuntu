// A fake Gemini (the cloud manager) and a fake Ollama (the specialists) that can play a whole mission:
// they answer the manager's questions, plan, check and report in JSON, run scripted tool calls, load and unload
// models, and can run out of quota. Everything they were asked is in `hits`.
//
//   const ai = create();  await ai.start();  // set FRIENDS_GEMINI_API = ai.cloudUrl() before requiring server/gemini.js
//   ai.behave.plan = { title, summary, steps: [...] }        what the planner returns (object or fn(ctx))
//   ai.behave.cloudStream = (ctx) => parts                   one round of a Gemini step (ctx.round counts tool results so far)
//   ai.behave.localStream = (ctx) => ({ content, tools })    one round of an Ollama step
const http = require("node:http");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Which of the manager's jobs a system prompt is (see server/missions/manager.js)
function kindOf(system = "") {
  if (/You are the planning manager/.test(system)) return "plan";
  if (/You prepare the plan for a goal/.test(system)) return "clarify";
  if (/You check the result of one step/.test(system)) return "review";
  if (/You write the final report/.test(system)) return "report";
  return "other";
}

function create() {
  const behave = {
    questions: [],
    plan: null,
    review: { ok: true, reason: "fine", fix: "" },
    report: "# The report\n\n**Summary**\nIt worked.\n\n**Results**\nAll good.\n",
    cloudStream: null,
    localStream: null,
    cloudStatus: 0, // an HTTP status every cloud call answers with
    cloudRetryDelay: "1s",
    cloudDelay: 0,
    localDelay: 0,
    models: [
      { name: "tiny:latest", size: 800e6 },
      { name: "coder:latest", size: 4.2e9 },
      { name: "huge:latest", size: 9e9 },
    ],
  };
  const hits = { cloud: [], local: [], loads: [], unloads: [], generate: 0, ps: 0 };
  const loaded = new Map(); // model → { size_vram }

  const readBody = async (req) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    return chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
  };
  const value = (v, ctx) => (typeof v === "function" ? v(ctx) : v);

  // ----- Gemini -----
  const cloud = http.createServer(async (req, res) => {
    const body = await readBody(req);
    if (req.url.startsWith("/models?")) {
      return res.end(JSON.stringify({ models: ["gemini-3.8-flash", "gemini-3.8-pro", "gemini-flash-lite-latest"].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ["generateContent"] })) }));
    }
    const model = decodeURIComponent(req.url.match(/models\/([^:]+):/)?.[1] || "");
    const system = body.systemInstruction?.parts?.[0]?.text || "";
    const prompt = body.contents?.at(-1)?.parts?.map((p) => p.text || "").join("") || "";
    if (behave.cloudDelay) await sleep(behave.cloudDelay);
    if (behave.cloudStatus) {
      const detail = behave.cloudStatus === 429 ? { code: 429, message: "quota", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: behave.cloudRetryDelay }] } : { message: "broken" };
      return res.writeHead(behave.cloudStatus).end(JSON.stringify({ error: detail }));
    }
    if (req.url.includes(":generateContent")) {
      const kind = kindOf(system);
      hits.cloud.push({ kind, model, system, prompt, json: body.generationConfig?.responseMimeType === "application/json" });
      if (kind === "plan") return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value(behave.plan, { prompt, system }) || { title: "T", summary: "S", steps: [] }) }] } }] }));
      if (kind === "clarify") return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ questions: value(behave.questions, { prompt }) }) }] } }] }));
      if (kind === "review") return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value(behave.review, { prompt })) }] } }] }));
      if (kind === "report") return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: value(behave.report, { prompt }) }] } }] }));
      return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: '["ok"]' }] } }] }));
    }
    if (req.url.includes(":streamGenerateContent")) {
      const round = (body.contents || []).filter((c) => c.parts?.some((p) => p.functionResponse)).length;
      const ctx = { body, round, system, prompt: body.contents?.[0]?.parts?.map((p) => p.text || "").join("") || "", model, tools: (body.tools?.[0]?.functionDeclarations || []).map((d) => d.name) };
      hits.cloud.push({ kind: "step", model, round, tools: ctx.tools, system, prompt: ctx.prompt });
      let parts;
      try {
        parts = behave.cloudStream ? behave.cloudStream(ctx) : [{ text: "Cloud step result" }];
      } catch (err) {
        return res.writeHead(500).end(JSON.stringify({ error: { message: err.message } })); // a script that throws is a broken model
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      return res.end(`data: ${JSON.stringify({ candidates: [{ content: { parts } }] })}\n\n`);
    }
    res.writeHead(404).end("{}");
  });

  // ----- Ollama -----
  const local = http.createServer(async (req, res) => {
    const body = await readBody(req);
    if (req.url === "/api/tags") return res.end(JSON.stringify({ models: behave.models.map((m) => ({ name: m.name, model: m.name, size: m.size })) }));
    if (req.url === "/api/ps") {
      hits.ps++;
      return res.end(JSON.stringify({ models: [...loaded].map(([name, v]) => ({ name, model: name, size: v.size, size_vram: v.size_vram, context_length: 8192 })) }));
    }
    if (req.url === "/api/show") {
      const entry = behave.models.find((m) => m.name === body.model || m.name === `${body.model}:latest`);
      return entry ? res.end(JSON.stringify({ details: { parameter_size: "3.8B", quantization_level: "Q4_K_M" }, model_info: { "general.parameter_count": Math.round(entry.size / 0.55) } })) : res.writeHead(404).end(JSON.stringify({ error: "model not found" }));
    }
    if (req.url === "/api/generate") {
      hits.generate++;
      const name = body.model;
      if (body.keep_alive === 0) {
        hits.unloads.push(name);
        loaded.delete(name);
      } else {
        const entry = behave.models.find((m) => m.name === name || m.name === `${name}:latest`);
        hits.loads.push({ model: name, options: body.options || {} });
        loaded.set(name, { size: entry?.size || 1e9, size_vram: body.options?.num_gpu === 0 ? 0 : entry?.size || 1e9 });
      }
      return res.end(JSON.stringify({ done: true }));
    }
    if (req.url === "/api/pull") {
      res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      res.write(JSON.stringify({ status: "pulling manifest" }) + "\n");
      for (const pct of [10, 60, 100]) res.write(JSON.stringify({ status: "downloading", total: 1000, completed: pct * 10, digest: "sha256:x" }) + "\n");
      return res.end(JSON.stringify({ status: "success" }) + "\n");
    }
    if (req.url === "/api/delete") return res.end("{}");
    if (req.url === "/api/embed") return res.end(JSON.stringify({ embeddings: (body.input || []).map((t) => [t.length % 7, (t.match(/a/g) || []).length, 1]) }));
    if (req.url === "/api/chat") {
      const system = body.messages?.[0]?.role === "system" ? body.messages[0].content : "";
      if (behave.localDelay) await sleep(behave.localDelay);
      if (body.stream === false) {
        const kind = kindOf(system);
        hits.local.push({ kind, model: body.model, system, json: body.format === "json" });
        if (kind === "plan") return res.end(JSON.stringify({ message: { content: JSON.stringify(value(behave.plan, { system }) || {}) }, done: true }));
        if (kind === "clarify") return res.end(JSON.stringify({ message: { content: JSON.stringify({ questions: value(behave.questions, {}) }) }, done: true }));
        if (kind === "review") return res.end(JSON.stringify({ message: { content: JSON.stringify(value(behave.review, {})) }, done: true }));
        if (kind === "report") return res.end(JSON.stringify({ message: { content: value(behave.report, {}) }, done: true }));
        return res.end(JSON.stringify({ message: { content: "ok" }, done: true }));
      }
      const round = (body.messages || []).filter((m) => m.role === "tool").length;
      const ctx = { body, round, system, model: body.model, options: body.options || {}, prompt: body.messages?.find((m) => m.role === "user")?.content || "", tools: (body.tools || []).map((t) => t.function.name) };
      hits.local.push({ kind: "step", model: body.model, round, tools: ctx.tools, options: ctx.options, system, prompt: ctx.prompt });
      let out;
      try {
        out = behave.localStream ? behave.localStream(ctx) : { content: "Local step result" };
      } catch (err) {
        return res.writeHead(500).end(JSON.stringify({ error: err.message }));
      }
      res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      res.write(JSON.stringify({ message: { role: "assistant", content: out.content || "", tool_calls: (out.tools || []).map((t) => ({ function: { name: t.name, arguments: t.args } })) } }) + "\n");
      return res.end(JSON.stringify({ done: true }) + "\n");
    }
    res.writeHead(404).end("{}");
  });

  const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const close = (server) => new Promise((resolve) => server.close(resolve));
  const url = (server) => `http://127.0.0.1:${server.address().port}`;

  return {
    behave,
    hits,
    loaded,
    start: async () => (await listen(cloud), await listen(local)),
    stop: async () => (cloud.closeAllConnections?.(), local.closeAllConnections?.(), await close(cloud), await close(local)),
    cloudUrl: () => url(cloud),
    localUrl: () => url(local),
    reset() {
      hits.cloud.length = hits.local.length = hits.loads.length = hits.unloads.length = 0;
      hits.generate = hits.ps = 0;
      loaded.clear();
      behave.cloudStatus = 0;
    },
  };
}

// Waits until fn() is truthy (or throws after ms)
async function waitFor(fn, ms = 8000, what = "something") {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error(`Timed out waiting for ${what}`);
    await sleep(15);
  }
}

module.exports = { create, waitFor, sleep, kindOf };
