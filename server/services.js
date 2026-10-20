// The AI services Friends knows how to connect to, so adding one is "pick it, paste a key" (cloud) or "pick it" (on this
// computer). Nothing here is required: any OpenAI-compatible service works with its address and a key ("Any other service"),
// and any local server with its address. The addresses and key formats were written from each service's documentation
// (checked 2026-10-20); the address is always editable in the form, so a service that moves is a one-line fix.
//
//   cloud services: id, label, company, color, baseUrl, keyUrl, keyHint (what a key starts with), keyPrefix (for recognising
//     a pasted key), models ("list": ask the service, "static": a fixed list, as it has none), quirks
//   local servers: id, label, port, url, protocol ("ollama" is Ollama's own API, "openai" the OpenAI-style one), download
//
// quirks (what the service needs that plain OpenAI doesn't):
//   noTemperature  the service rejects a temperature, so none is sent
//   noTools        the service can't call tools (the chat still works)
//   tokensParam    "max_completion_tokens" instead of "max_tokens"
//   headers        extra headers on every request

const CLOUD = [
  // Google's own API (not OpenAI-style): voice conversations with Gemini Live need it
  { id: "gemini", label: "Gemini", company: "Google", color: "#4f8df5", baseUrl: "", keyUrl: "https://aistudio.google.com/apikey", keyHint: "AIza…", keyPrefix: /^AIza[0-9A-Za-z_-]{30,}$/, models: "list", quirks: {}, native: true, about: "Google's Gemini: a free key from AI Studio, and the only one with live voice" },
  { id: "openai", label: "ChatGPT", company: "OpenAI", color: "#10a37f", baseUrl: "https://api.openai.com/v1", keyUrl: "https://platform.openai.com/api-keys", keyHint: "sk-…", keyPrefix: /^sk-(proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}$/, models: "list", quirks: { tokensParam: "max_completion_tokens" }, about: "OpenAI's GPT models" },
  { id: "anthropic", label: "Claude", company: "Anthropic", color: "#d97757", baseUrl: "https://api.anthropic.com/v1", keyUrl: "https://platform.claude.com/settings/keys", keyHint: "sk-ant-…", keyPrefix: /^sk-ant-/, models: "static", staticModels: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1", "claude-sonnet-4-6"], quirks: { noTemperature: true }, about: "Anthropic's Claude, through its OpenAI-compatible endpoint" },
  { id: "openrouter", label: "OpenRouter", company: "OpenRouter", color: "#6467f2", baseUrl: "https://openrouter.ai/api/v1", keyUrl: "https://openrouter.ai/keys", keyHint: "sk-or-…", keyPrefix: /^sk-or-/, models: "list", quirks: {}, about: "One key for hundreds of models from many companies, some free" },
  { id: "groq", label: "Groq", company: "Groq", color: "#f55036", baseUrl: "https://api.groq.com/openai/v1", keyUrl: "https://console.groq.com/keys", keyHint: "gsk_…", keyPrefix: /^gsk_/, models: "list", quirks: {}, about: "Very fast open models, with a free tier" },
  { id: "mistral", label: "Mistral", company: "Mistral AI", color: "#fa520f", baseUrl: "https://api.mistral.ai/v1", keyUrl: "https://console.mistral.ai/api-keys", keyHint: "", keyPrefix: null, models: "list", quirks: {}, about: "Mistral AI from France" },
  { id: "deepseek", label: "DeepSeek", company: "DeepSeek", color: "#4d6bfe", baseUrl: "https://api.deepseek.com/v1", keyUrl: "https://platform.deepseek.com/api_keys", keyHint: "sk-…", keyPrefix: null, models: "list", quirks: {}, about: "DeepSeek's chat and reasoning models" },
  { id: "xai", label: "Grok", company: "xAI", color: "#71767b", baseUrl: "https://api.x.ai/v1", keyUrl: "https://console.x.ai", keyHint: "xai-…", keyPrefix: /^xai-/, models: "list", quirks: {}, about: "xAI's Grok" },
  { id: "together", label: "Together AI", company: "Together AI", color: "#0f6fff", baseUrl: "https://api.together.xyz/v1", keyUrl: "https://api.together.ai/settings/api-keys", keyHint: "", keyPrefix: null, models: "list", quirks: {}, about: "Many open models, pay as you go" },
  { id: "fireworks", label: "Fireworks AI", company: "Fireworks AI", color: "#6720ff", baseUrl: "https://api.fireworks.ai/inference/v1", keyUrl: "https://fireworks.ai/account/api-keys", keyHint: "fw_…", keyPrefix: /^fw_/, models: "list", quirks: {}, about: "Fast open models" },
  { id: "perplexity", label: "Perplexity", company: "Perplexity", color: "#20808d", baseUrl: "https://api.perplexity.ai", keyUrl: "https://www.perplexity.ai/settings/api", keyHint: "pplx-…", keyPrefix: /^pplx-/, models: "static", staticModels: ["sonar", "sonar-pro", "sonar-reasoning", "sonar-reasoning-pro", "sonar-deep-research"], quirks: { noTools: true }, about: "Answers with web search and sources built in" },
  { id: "cerebras", label: "Cerebras", company: "Cerebras", color: "#f15a29", baseUrl: "https://api.cerebras.ai/v1", keyUrl: "https://cloud.cerebras.ai", keyHint: "csk-…", keyPrefix: /^csk-/, models: "list", quirks: {}, about: "Extremely fast open models, with a free tier" },
  { id: "sambanova", label: "SambaNova", company: "SambaNova", color: "#ee7624", baseUrl: "https://api.sambanova.ai/v1", keyUrl: "https://cloud.sambanova.ai/apis", keyHint: "", keyPrefix: null, models: "list", quirks: {}, about: "Fast open models" },
  { id: "nvidia", label: "NVIDIA NIM", company: "NVIDIA", color: "#76b900", baseUrl: "https://integrate.api.nvidia.com/v1", keyUrl: "https://build.nvidia.com/settings/api-keys", keyHint: "nvapi-…", keyPrefix: /^nvapi-/, models: "list", quirks: {}, about: "NVIDIA's hosted models, with free credits" },
  { id: "huggingface", label: "Hugging Face", company: "Hugging Face", color: "#ffbd45", baseUrl: "https://router.huggingface.co/v1", keyUrl: "https://huggingface.co/settings/tokens", keyHint: "hf_…", keyPrefix: /^hf_/, models: "list", quirks: {}, about: "Open models through Hugging Face's inference router" },
  { id: "moonshot", label: "Kimi", company: "Moonshot AI", color: "#1783ff", baseUrl: "https://api.moonshot.ai/v1", keyUrl: "https://platform.moonshot.ai/console/api-keys", keyHint: "sk-…", keyPrefix: null, models: "list", quirks: {}, about: "Moonshot AI's Kimi" },
  { id: "qwen", label: "Qwen", company: "Alibaba Cloud", color: "#615ced", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", keyUrl: "https://modelstudio.console.alibabacloud.com", keyHint: "sk-…", keyPrefix: null, models: "list", quirks: {}, about: "Alibaba's Qwen models" },
  { id: "zai", label: "GLM", company: "Z.ai", color: "#2d7ff9", baseUrl: "https://api.z.ai/api/paas/v4", keyUrl: "https://z.ai/manage-apikey/apikey-list", keyHint: "", keyPrefix: null, models: "list", quirks: {}, about: "Z.ai's GLM models" },
  { id: "cohere", label: "Cohere", company: "Cohere", color: "#39594d", baseUrl: "https://api.cohere.ai/compatibility/v1", keyUrl: "https://dashboard.cohere.com/api-keys", keyHint: "", keyPrefix: null, models: "list", quirks: {}, about: "Cohere's Command models" },
  { id: "deepinfra", label: "DeepInfra", company: "DeepInfra", color: "#5b8def", baseUrl: "https://api.deepinfra.com/v1/openai", keyUrl: "https://deepinfra.com/dash/api_keys", keyHint: "", keyPrefix: null, models: "list", quirks: {}, about: "Many open models, pay as you go" },
  { id: "nebius", label: "Nebius", company: "Nebius", color: "#2f6bff", baseUrl: "https://api.studio.nebius.com/v1", keyUrl: "https://studio.nebius.com/settings/api-keys", keyHint: "", keyPrefix: null, models: "list", quirks: {}, about: "Open models hosted in Europe" },
  { id: "scaleway", label: "Scaleway", company: "Scaleway", color: "#4f0599", baseUrl: "https://api.scaleway.ai/v1", keyUrl: "https://console.scaleway.com/iam/api-keys", keyHint: "", keyPrefix: null, models: "list", quirks: {}, about: "Open models hosted in France" },
  { id: "hyperbolic", label: "Hyperbolic", company: "Hyperbolic", color: "#5d3bff", baseUrl: "https://api.hyperbolic.xyz/v1", keyUrl: "https://app.hyperbolic.xyz/settings", keyHint: "", keyPrefix: null, models: "list", quirks: {}, about: "Open models, pay as you go" },
  // Any other service that speaks the OpenAI API (Azure's OpenAI v1 endpoint, a company gateway, a self-hosted proxy…)
  { id: "custom", label: "Any other service", company: "Your own address", color: "#8a8499", baseUrl: "", keyUrl: "", keyHint: "", keyPrefix: null, models: "list", quirks: {}, about: "Any service that speaks the OpenAI API: give its address and key", custom: true },
];

// Servers that run models on this computer (or your network). The first is asked in Ollama's own API.
const LOCAL = [
  { id: "ollama", label: "Ollama", port: 11434, url: "http://127.0.0.1:11434", protocol: "ollama", download: "https://ollama.com/download", start: "ollama serve", about: "The easiest way to run models: pull one by name" },
  { id: "lmstudio", label: "LM Studio", port: 1234, url: "http://127.0.0.1:1234/v1", protocol: "openai", download: "https://lmstudio.ai", start: "Open LM Studio, load a model, and start its local server", about: "A desktop app to find, load and chat with models" },
  { id: "llamacpp", label: "llama.cpp, LocalAI or llamafile", port: 8080, url: "http://127.0.0.1:8080/v1", protocol: "openai", download: "https://github.com/ggml-org/llama.cpp", start: "llama-server -m model.gguf", about: "The engine under many tools, run directly" },
  { id: "jan", label: "Jan", port: 1337, url: "http://127.0.0.1:1337/v1", protocol: "openai", download: "https://jan.ai", start: "Open Jan and switch on its local API server", about: "An open desktop app that runs models offline" },
  { id: "vllm", label: "vLLM", port: 8000, url: "http://127.0.0.1:8000/v1", protocol: "openai", download: "https://docs.vllm.ai", start: "vllm serve <model>", about: "A fast server for a GPU computer" },
  { id: "koboldcpp", label: "KoboldCpp", port: 5001, url: "http://127.0.0.1:5001/v1", protocol: "openai", download: "https://github.com/LostRuins/koboldcpp", start: "Start KoboldCpp with a model", about: "One file that runs models, with an OpenAI-style API" },
  { id: "textgen", label: "text-generation-webui or TabbyAPI", port: 5000, url: "http://127.0.0.1:5000/v1", protocol: "openai", download: "https://github.com/oobabooga/text-generation-webui", start: "Start it with --api", about: "A web interface and API for many model formats" },
  { id: "gpt4all", label: "GPT4All", port: 4891, url: "http://127.0.0.1:4891/v1", protocol: "openai", download: "https://www.nomic.ai/gpt4all", start: "Open GPT4All, Settings, and switch on the local API server", about: "A desktop app for private chat with local models" },
  { id: "dockermr", label: "Docker Model Runner", port: 12434, url: "http://127.0.0.1:12434/engines/v1", protocol: "openai", download: "https://docs.docker.com/ai/model-runner/", start: "Turn on host-side TCP support in Docker Desktop", about: "Models run by Docker" },
  { id: "other", label: "Another server", port: 0, url: "", protocol: "openai", custom: true, download: "", start: "", about: "Any server with an OpenAI-style API on this computer or your network: give its address" },
  { id: "sglang", label: "SGLang", port: 30000, url: "http://127.0.0.1:30000/v1", protocol: "openai", download: "https://docs.sglang.ai", start: "python -m sglang.launch_server --model-path <model>", about: "A fast server for a GPU computer" },
];

const cloud = (id) => CLOUD.find((s) => s.id === id) || null;
const local = (id) => LOCAL.find((s) => s.id === id) || null;

// What the page gets: no functions, keyPrefix as text
function publicCatalog() {
  return {
    cloud: CLOUD.map(({ keyPrefix, ...s }) => ({ ...s, keyPattern: keyPrefix ? keyPrefix.source : "" })),
    local: LOCAL,
  };
}

// ---------- Recognising what someone pasted ----------
// A key or an address in one box: which service is it? { kind: "key"|"address"|"unknown", matches: [service ids], certain }
function recognise(input) {
  const text = String(input || "").trim();
  if (!text) return { kind: "unknown", matches: [], certain: false };

  // An address: http(s)://…, host:port, or localhost
  if (/^https?:\/\//i.test(text) || /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(text) || /^[\w.-]+:\d{2,5}(\/|$)/.test(text)) {
    let url;
    try {
      url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `http://${text}`);
    } catch {
      return { kind: "unknown", matches: [], certain: false };
    }
    const known = CLOUD.filter((s) => s.baseUrl).find((s) => new URL(s.baseUrl).host === url.host);
    if (known) return { kind: "address", matches: [known.id], certain: true, cloud: true };
    const port = Number(url.port) || (url.protocol === "https:" ? 443 : 80);
    const server = LOCAL.find((s) => s.port === port);
    return { kind: "address", matches: server ? [server.id] : [], certain: Boolean(server), cloud: false, url: url.origin };
  }

  // A key: the prefixes that only one service uses, then the ones several do
  const specific = CLOUD.filter((s) => s.keyPrefix && s.id !== "openai").find((s) => s.keyPrefix.test(text));
  if (specific) return { kind: "key", matches: [specific.id], certain: true };
  if (/^sk-(proj|svcacct|admin)-/.test(text)) return { kind: "key", matches: ["openai"], certain: true };
  if (/^sk-[A-Za-z0-9]{20,}$/.test(text)) return { kind: "key", matches: ["openai", "deepseek", "moonshot", "qwen"], certain: false };
  if (/^[A-Za-z0-9]{32}$/.test(text)) return { kind: "key", matches: ["mistral", "cohere"], certain: false };
  if (/^[a-f0-9]{64}$/.test(text)) return { kind: "key", matches: ["together"], certain: false };
  if (text.length >= 20 && !/\s/.test(text)) return { kind: "key", matches: [], certain: false };
  return { kind: "unknown", matches: [], certain: false };
}

module.exports = { CLOUD, LOCAL, cloud, local, publicCatalog, recognise };
