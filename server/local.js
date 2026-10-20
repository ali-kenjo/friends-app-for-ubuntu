// Finds AI model servers running on this computer, so Settings can offer them
// with one click. Only 127.0.0.1 is asked, with a short timeout.
const services = require("./services");

// The servers in the catalogue (services.js), at their usual ports; and the address in OLLAMA_HOST when Ollama runs elsewhere
const KNOWN = services.LOCAL.filter((s) => s.url).map((s) => ({ id: s.id, label: s.label, url: s.url, protocol: s.protocol }));
if (process.env.OLLAMA_HOST) {
  try {
    const host = process.env.OLLAMA_HOST.trim();
    const url = new URL(/^[a-z]+:\/\//i.test(host) ? host : `http://${host}`);
    if (url.hostname === "0.0.0.0" || url.hostname === "::") url.hostname = "127.0.0.1";
    const origin = url.port ? url.origin : `${url.origin}:11434`;
    const ollama = KNOWN.find((s) => s.id === "ollama");
    if (ollama) ollama.url = origin;
  } catch {}
}

// Tests (and unusual setups) can name other servers: FRIENDS_LOCAL_SERVERS='[{"label":"X","url":"http://127.0.0.1:9/v1","protocol":"openai"}]'
let SERVERS = KNOWN;
try {
  if (process.env.FRIENDS_LOCAL_SERVERS) SERVERS = JSON.parse(process.env.FRIENDS_LOCAL_SERVERS);
} catch {}

const NOT_CHAT = /embed|rerank|whisper|tts|bge-|nomic-bert/i;

async function probe(server, timeoutMs) {
  try {
    const res = await fetch(`${server.url}${server.protocol === "ollama" ? "/api/tags" : "/models"}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ...server, running: false, models: [] };
    const data = await res.json();
    const items = data.models || data.data || (Array.isArray(data) ? data : []);
    const models = items.map((m) => (typeof m === "string" ? m : m.name || m.id)).filter((n) => typeof n === "string" && n && !NOT_CHAT.test(n));
    return { ...server, running: true, models };
  } catch {
    return { ...server, running: false, models: [] };
  }
}

// [{ label, url, protocol, running, models }] for every known server
const detect = ({ timeoutMs = 700, servers = SERVERS } = {}) => Promise.all(servers.map((s) => probe(s, timeoutMs)));

module.exports = { SERVERS, detect };
