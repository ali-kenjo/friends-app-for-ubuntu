// ---------- Gemini Live API Adapter (server/core/ai/adapters/gemini-live-adapter.js) ----------
// Wraps Gemini Multimodal Live WebSocket (gemini-3.8-live default + optional
// gemini-3.8-live-extended-thinking with interaction_status IN_PROGRESS / IDLE handling).
const { WebSocket } = require("ws");
const { VoiceProviderAdapter } = require("../voice-adapter");
const roomContext = require("../room-context");
const gemini = require("../../../gemini");

const DEFAULT_UPSTREAM =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const MIC_MIME = "audio/pcm;rate=16000";

class GeminiLiveAdapter extends VoiceProviderAdapter {
  constructor(options = {}) {
    super("gemini-live", options);
    this.ws = null;
    this.ready = false;
    this.rate = 24000;
    this.upstreamUrl = options.upstreamUrl || process.env.FRIENDS_LIVE_UPSTREAM || DEFAULT_UPSTREAM;
    this.model = options.model || (options.extendedThinking ? gemini.EXTENDED_THINKING_LIVE_MODEL : "gemini-3.8-live");
    this.voiceName = options.voiceName || "Kore";
    this.systemPrompt = options.systemPrompt || "";
    this.tools = Array.isArray(options.tools) ? options.tools : [];
    this.apiKey = options.apiKey || "";
    this.thinkingLevel = options.thinkingLevel || "medium";
    this.vadConfig = options.vadConfig || {};
  }

  async start() {
    await super.start();
    if (!this.apiKey) throw new Error("Missing Gemini API key.");
    this.ws = new WebSocket(this.upstreamUrl, { headers: { "x-goog-api-key": this.apiKey } });
    this.ws.on("open", () => {
      const setup = this.buildSetupPayload();
      this.ws.send(JSON.stringify({ setup }));
    });
    this.ws.on("message", (data) => this.handleMessage(data));
    this.ws.on("error", (err) => this.emit("error", err));
    this.ws.on("close", (code, reason) => {
      this.ready = false;
      this.setInteractionStatus("IDLE");
      this.emit("close", { code, reason: String(reason || "") });
    });
  }

  buildSetupPayload() {
    const contextBlock = roomContext.formatPromptBlock();
    const persona = this.options.settings?.aiVoice?.systemPersona
      ? `\n\n## Custom Robot Personality\n${this.options.settings.aiVoice.systemPersona}`
      : "";
    const isExtended = gemini.liveSupportsThinking(this.model);
    const nonBlockingTools = this.tools.map((t) => ({ ...t, behavior: "NON_BLOCKING" }));

    return {
      model: `models/${this.model}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        ...(isExtended ? { thinkingConfig: { thinkingLevel: this.thinkingLevel } } : {}),
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voiceName } } },
      },
      systemInstruction: {
        parts: [{ text: `${this.systemPrompt}${persona}\n\n${contextBlock}`.trim() }],
      },
      tools: nonBlockingTools.length ? [{ functionDeclarations: nonBlockingTools }] : [],
      realtimeInputConfig: { automaticActivityDetection: this.vadConfig },
      contextWindowCompression: { slidingWindow: {} },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    };
  }

  handleMessage(raw) {
    let msg;
    try {
      const buf = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw);
      msg = JSON.parse(buf.toString("utf8"));
    } catch {
      return;
    }

    if (msg.setupComplete) {
      this.ready = true;
      this.emit("ready", { provider: this.id, model: this.model });
    }

    // Extended thinking lifecycle events
    const iStatus = msg.interactionStatus || msg.serverContent?.interactionStatus;
    if (iStatus === "IN_PROGRESS" || iStatus === "IDLE") {
      this.setInteractionStatus(iStatus);
    }

    if (msg.serverContent) {
      const c = msg.serverContent;
      if (c.inputTranscription?.text) {
        this.emit("transcript", { role: "user", text: c.inputTranscription.text });
      }
      for (const part of c.modelTurn?.parts || []) {
        if (part.thought) continue;
        const audio = part.inlineData;
        if (audio?.data && (!audio.mimeType || audio.mimeType.startsWith("audio/"))) {
          const rate = Number(/rate=(\d+)/.exec(audio.mimeType || "")?.[1]) || 24000;
          if (rate !== this.rate) {
            this.rate = rate;
            this.emit("audio_format", { rate });
          }
          this.setInteractionStatus("IN_PROGRESS");
          this.emit("audio", Buffer.from(audio.data, "base64"));
        }
      }
      if (c.outputTranscription?.text) {
        this.emit("transcript", { role: "model", text: c.outputTranscription.text });
      }
      if (c.interrupted) {
        this.setInteractionStatus("IDLE");
        this.emit("interrupted");
      }
      if (c.turnComplete) {
        this.setInteractionStatus("IDLE");
        this.emit("turn_complete");
      }
    }

    if (msg.toolCall?.functionCalls?.length) {
      this.emit("tool_calls", msg.toolCall.functionCalls);
    }
    if (msg.toolCallCancellation?.ids?.length) {
      this.emit("tool_cancellations", msg.toolCallCancellation.ids);
    }
  }

  sendAudio(pcmBuffer) {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        realtimeInput: { audio: { data: Buffer.from(pcmBuffer).toString("base64"), mimeType: MIC_MIME } },
      })
    );
  }

  endAudio() {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
  }

  async sendText(text) {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
    this.setInteractionStatus("IN_PROGRESS");
    this.ws.send(JSON.stringify({ realtimeInput: { text: String(text || "") } }));
  }

  sendRoomContext(contextSummary) {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
    const text = `[Room Update]\n${roomContext.formatPromptBlock(contextSummary)}`;
    this.ws.send(
      JSON.stringify({
        clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: false },
      })
    );
  }

  sendToolResult(callId, name, result) {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        toolResponse: {
          functionResponses: [
            {
              id: callId,
              name,
              response: result,
              ...(gemini.liveAsyncTools(this.model) ? { scheduling: "SILENT" } : {}),
            },
          ],
        },
      })
    );
  }

  interrupt() {
    super.interrupt();
    // Client-side barge-in notification for non-VAD triggers
    if (this.ready && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ realtimeInput: { text: "" } }));
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

module.exports = GeminiLiveAdapter;
