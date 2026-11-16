// ---------- Provider-Agnostic VoiceProviderAdapter & Registry (server/core/ai/voice-adapter.js) ----------
// Unified interface abstracting bidirectional audio streaming, VAD/barge-in interrupts,
// transcripts, emotion tags, interaction_status lifecycle, and async tool calling across:
//   - gemini-live (Gemini 3.8 Live + Extended Thinking option)
//   - openai-realtime (OpenAI Realtime WebSocket API)
//   - local-pipeline (Local STT Faster-Whisper/Whisper.cpp + Ollama/LM Studio/vLLM + Piper/Kokoro TTS)
//   - text-sandbox (Zero-API-key, zero-mic interactive mode)
const EventEmitter = require("events");
const keys = require("../../keys");

/**
 * Base contract every VoiceProviderAdapter implements.
 */
class VoiceProviderAdapter extends EventEmitter {
  constructor(id, options = {}) {
    super();
    this.id = id;
    this.options = options;
    this.started = false;
    this.closed = false;
    this.interactionStatus = "IDLE"; // IN_PROGRESS | IDLE
  }

  /** Connect / initialize the voice session. */
  async start() {
    this.started = true;
  }

  /** Stream raw 16kHz mono PCM16 audio bytes from microphone. */
  sendAudio(_pcmBuffer) {}

  /** Signal end of utterance / mic pause. */
  endAudio() {}

  /** Send user text input (chat message or simulated speech). */
  async sendText(_text) {}

  /** Inject updated structured room-state context silently. */
  sendRoomContext(_contextSummary) {}

  /** Return async/non-blocking tool execution result back to the provider. */
  sendToolResult(_callId, _name, _result) {}

  /** Interrupt / cancel current assistant speech (barge-in). */
  interrupt() {
    this.setInteractionStatus("IDLE");
    this.emit("interrupted");
  }

  /** Gracefully tear down connections and timers. */
  async stop() {
    this.closed = true;
    this.setInteractionStatus("IDLE");
  }

  setInteractionStatus(status) {
    const next = status === "IN_PROGRESS" ? "IN_PROGRESS" : "IDLE";
    if (this.interactionStatus !== next) {
      this.interactionStatus = next;
      this.emit("interaction_status", { status: next });
    }
  }
}

/** Probe localhost ports for local OpenAI-compatible / Ollama / Whisper servers. */
async function detectLocalEndpoints() {
  const probes = [
    { id: "ollama", name: "Ollama", url: "http://127.0.0.1:11434/api/tags", endpoint: "http://127.0.0.1:11434/v1/chat/completions" },
    { id: "lmstudio", name: "LM Studio", url: "http://127.0.0.1:1234/v1/models", endpoint: "http://127.0.0.1:1234/v1/chat/completions" },
    { id: "vllm", name: "vLLM", url: "http://127.0.0.1:8000/v1/models", endpoint: "http://127.0.0.1:8000/v1/chat/completions" },
    { id: "localai", name: "LocalAI", url: "http://127.0.0.1:8080/v1/models", endpoint: "http://127.0.0.1:8080/v1/chat/completions" },
    { id: "local_voice", name: "Local Whisper/TTS", url: "http://127.0.0.1:18492/health", endpoint: "http://127.0.0.1:18492" },
  ];
  const found = [];
  await Promise.all(
    probes.map(async (p) => {
      try {
        const res = await fetch(p.url, { signal: AbortSignal.timeout(700) });
        if (res.ok) {
          let models = [];
          try {
            const json = await res.json();
            if (Array.isArray(json.models)) models = json.models.map((m) => m.name || m.id).filter(Boolean);
            else if (Array.isArray(json.data)) models = json.data.map((m) => m.id).filter(Boolean);
          } catch {}
          found.push({ id: p.id, name: p.name, endpoint: p.endpoint, models });
        }
      } catch {}
    })
  );
  return found;
}

/** Resolve API keys safely from settings -> keyring/0600 file -> env. */
function resolveProviderKey(provider, settings, brainKey = "") {
  if (brainKey) return brainKey;
  if (provider === "openai-realtime") {
    return settings?.aiVoice?.openaiKey || keys.getSecret("v1-openai-key") || process.env.OPENAI_API_KEY || "";
  }
  return settings?.aiVoice?.geminiKey || keys.getSecret("v1-gemini-key") || process.env.GEMINI_API_KEY || "";
}

function createAdapter(providerId, options = {}) {
  const id = String(providerId || "gemini-live");
  if (id === "text-sandbox") {
    const TextSandboxAdapter = require("./adapters/text-sandbox-adapter");
    return new TextSandboxAdapter(options);
  }
  if (id === "openai-realtime") {
    const OpenAIRealtimeAdapter = require("./adapters/openai-realtime-adapter");
    return new OpenAIRealtimeAdapter(options);
  }
  if (id === "local-pipeline") {
    const LocalPipelineAdapter = require("./adapters/local-pipeline-adapter");
    return new LocalPipelineAdapter(options);
  }
  const GeminiLiveAdapter = require("./adapters/gemini-live-adapter");
  return new GeminiLiveAdapter(options);
}

const PROVIDER_CATALOG = [
  {
    id: "gemini-live",
    name: "Gemini Live API",
    description: "Bidirectional real-time voice + async tool calling with optional Extended Thinking.",
    requiresKey: true,
    defaultModel: "gemini-3.8-live",
    voices: ["Kore", "Aoede", "Charon", "Fenrir", "Puck", "Leda", "Orus", "Zephyr"],
  },
  {
    id: "openai-realtime",
    name: "OpenAI Realtime API",
    description: "Real-time bidirectional voice & function calling via OpenAI Realtime WebSocket.",
    requiresKey: true,
    defaultModel: "gpt-4o-realtime-preview",
    voices: ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"],
  },
  {
    id: "local-pipeline",
    name: "Local / OpenAI-Compatible Pipeline",
    description: "Local STT (Faster-Whisper/Whisper.cpp) + Ollama/LM Studio/vLLM/LocalAI + Piper/Kokoro TTS.",
    requiresKey: false,
    defaultModel: "llama3.2",
    voices: ["piper", "kokoro", "system"],
  },
  {
    id: "text-sandbox",
    name: "Text / Silent Sandbox Mode",
    description: "Zero API keys and zero microphone required. Full interactive chat & 3D room choreography.",
    requiresKey: false,
    defaultModel: "sandbox-v1",
    voices: ["silent"],
  },
];

module.exports = {
  VoiceProviderAdapter,
  PROVIDER_CATALOG,
  createAdapter,
  detectLocalEndpoints,
  resolveProviderKey,
};
