// ---------- OpenAI Realtime API Adapter (server/core/ai/adapters/openai-realtime-adapter.js) ----------
// Bidirectional WebSocket audio + server VAD + transcript + function calling adapter.
const { WebSocket } = require("ws");
const { VoiceProviderAdapter } = require("../voice-adapter");
const roomContext = require("../room-context");

const DEFAULT_OPENAI_REALTIME = "wss://api.openai.com/v1/realtime";

function toOpenAITools(tools = []) {
  return tools.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description || "",
    parameters: {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(t.parameters?.properties || {}).map(([k, v]) => [
          k,
          { ...v, type: String(v.type || "string").toLowerCase() },
        ])
      ),
      ...(Array.isArray(t.parameters?.required) ? { required: t.parameters.required } : {}),
    },
  }));
}

class OpenAIRealtimeAdapter extends VoiceProviderAdapter {
  constructor(options = {}) {
    super("openai-realtime", options);
    this.ws = null;
    this.ready = false;
    this.model = options.model || "gpt-4o-realtime-preview";
    this.voice = options.voiceName || "alloy";
    this.apiKey = options.apiKey || "";
    this.systemPrompt = options.systemPrompt || "";
    this.tools = Array.isArray(options.tools) ? options.tools : [];
    this.vadThreshold = Number(options.vadThreshold || 0.5);
    this.upstreamUrl = options.upstreamUrl || process.env.FRIENDS_OPENAI_REALTIME_URL || `${DEFAULT_OPENAI_REALTIME}?model=${encodeURIComponent(this.model)}`;
  }

  async start() {
    await super.start();
    if (!this.apiKey) throw new Error("Missing OpenAI API key for OpenAI Realtime.");
    this.ws = new WebSocket(this.upstreamUrl, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });
    this.ws.on("open", () => {
      this.sendSessionUpdate();
    });
    this.ws.on("message", (data) => this.handleMessage(data));
    this.ws.on("error", (err) => this.emit("error", err));
    this.ws.on("close", (code, reason) => {
      this.ready = false;
      this.setInteractionStatus("IDLE");
      this.emit("close", { code, reason: String(reason || "") });
    });
  }

  sendSessionUpdate() {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const persona = this.options.settings?.aiVoice?.systemPersona
      ? `\n\n## Custom Robot Personality\n${this.options.settings.aiVoice.systemPersona}`
      : "";
    const instructions = `${this.systemPrompt}${persona}\n\n${roomContext.formatPromptBlock()}`.trim();

    this.ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          instructions,
          voice: this.voice,
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: { model: "whisper-1" },
          turn_detection: {
            type: "server_vad",
            threshold: Math.min(0.95, Math.max(0.1, this.vadThreshold * 10)),
            prefix_padding_ms: 280,
            silence_duration_ms: 480,
          },
          tools: toOpenAITools(this.tools),
          tool_choice: "auto",
        },
      })
    );
  }

  handleMessage(raw) {
    let msg;
    try {
      const buf = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw);
      msg = JSON.parse(buf.toString("utf8"));
    } catch {
      return;
    }

    switch (msg.type) {
      case "session.created":
      case "session.updated": {
        if (!this.ready) {
          this.ready = true;
          this.emit("audio_format", { rate: 24000 });
          this.emit("ready", { provider: this.id, model: this.model });
        }
        break;
      }
      case "input_audio_buffer.speech_started": {
        this.emit("interrupted");
        this.setInteractionStatus("IDLE");
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        if (msg.transcript) this.emit("transcript", { role: "user", text: msg.transcript });
        break;
      }
      case "response.audio.delta": {
        if (msg.delta) {
          this.setInteractionStatus("IN_PROGRESS");
          this.emit("audio", Buffer.from(msg.delta, "base64"));
        }
        break;
      }
      case "response.audio_transcript.delta": {
        if (msg.delta) {
          this.setInteractionStatus("IN_PROGRESS");
          this.emit("transcript", { role: "model", text: msg.delta });
        }
        break;
      }
      case "response.function_call_arguments.done": {
        let args = {};
        try {
          args = JSON.parse(msg.arguments || "{}");
        } catch {}
        this.emit("tool_calls", [{ id: msg.call_id, name: msg.name, args }]);
        break;
      }
      case "response.done": {
        this.setInteractionStatus("IDLE");
        this.emit("turn_complete");
        break;
      }
      case "error": {
        this.emit("error", new Error(msg.error?.message || "OpenAI Realtime error"));
        break;
      }
      default:
        break;
    }
  }

  sendAudio(pcmBuffer) {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
    // OpenAI Realtime accepts 24kHz PCM16 cleanly or resampled 16->24kHz; forward buffered PCM bytes
    this.ws.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        audio: Buffer.from(pcmBuffer).toString("base64"),
      })
    );
  }

  endAudio() {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    this.ws.send(JSON.stringify({ type: "response.create" }));
  }

  async sendText(text) {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
    this.setInteractionStatus("IN_PROGRESS");
    this.ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: String(text || "") }],
        },
      })
    );
    this.ws.send(JSON.stringify({ type: "response.create" }));
  }

  sendRoomContext(contextSummary) {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: `[System Room Update]\n${roomContext.formatPromptBlock(contextSummary)}` }],
        },
      })
    );
  }

  sendToolResult(callId, _name, result) {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(result),
        },
      })
    );
    this.ws.send(JSON.stringify({ type: "response.create" }));
  }

  interrupt() {
    super.interrupt();
    if (this.ready && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "response.cancel" }));
    }
  }

  async stop() {
    await super.stop();
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
  }
}

module.exports = OpenAIRealtimeAdapter;
