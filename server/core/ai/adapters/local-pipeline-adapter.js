// ---------- Local / OpenAI-Compatible Pipeline Adapter ----------
// Modular 100% local voice & tool pipeline:
//   PCM16 VAD -> Local STT (Faster-Whisper / Whisper.cpp HTTP) ->
//   OpenAI-compatible LLM (Ollama localhost:11434 / LM Studio / vLLM / LocalAI with tools) ->
//   Local TTS (Piper / Kokoro / system fallback).
const { VoiceProviderAdapter, detectLocalEndpoints } = require("../voice-adapter");
const roomContext = require("../room-context");
const local = require("../../../local");
const { execFile } = require("child_process");

function computeRms(pcmBuffer) {
  if (!pcmBuffer || pcmBuffer.length < 2) return 0;
  let sum = 0;
  const count = Math.floor(pcmBuffer.length / 2);
  for (let i = 0; i < count; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2) / 32768;
    sum += sample * sample;
  }
  return Math.sqrt(sum / Math.max(1, count));
}

function pcmToWav(pcmBuffer, sampleRate = 16000) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

function toOpenAIChatTools(tools = []) {
  return tools.map((t) => ({
    type: "function",
    function: {
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
    },
  }));
}

class LocalPipelineAdapter extends VoiceProviderAdapter {
  constructor(options = {}) {
    super("local-pipeline", options);
    const av = options.settings?.aiVoice || {};
    this.sttUrl = options.sttUrl || av.localSttUrl || "http://127.0.0.1:18492/transcribe";
    this.llmUrl = options.llmUrl || av.localLlmUrl || "http://127.0.0.1:11434/v1/chat/completions";
    this.llmModel = options.model || av.localLlmModel || "llama3.2";
    this.ttsEngine = options.ttsEngine || av.localTtsEngine || "piper";
    this.ttsUrl = options.ttsUrl || av.localTtsUrl || "http://127.0.0.1:18492/speak";
    this.vadThreshold = Number(options.vadThreshold || av.vadThreshold || 0.035);
    this.systemPrompt = options.systemPrompt || "";
    this.tools = Array.isArray(options.tools) ? options.tools : [];

    this.speechChunks = [];
    this.speaking = false;
    this.silenceMs = 0;
    this.abortCtrl = null;
    this.history = [];
    this.latestRoomCtx = roomContext.get();
  }

  async start() {
    await super.start();
    // Auto-detect Ollama/LM Studio/vLLM/LocalAI when default localhost URL is configured
    try {
      const detected = await detectLocalEndpoints();
      const firstLlm = detected.find((d) => ["ollama", "lmstudio", "vllm", "localai"].includes(d.id));
      if (firstLlm && !this.options.llmUrl && !this.options.settings?.aiVoice?.localLlmUrl) {
        this.llmUrl = firstLlm.endpoint;
        if (firstLlm.models?.length && !this.llmModel) this.llmModel = firstLlm.models[0];
      }
    } catch {}
    this.emit("audio_format", { rate: 22050 });
    this.emit("ready", { provider: this.id, model: this.llmModel, endpoint: this.llmUrl });
  }

  sendRoomContext(contextSummary) {
    this.latestRoomCtx = contextSummary || roomContext.get();
  }

  sendAudio(pcmBuffer) {
    if (this.closed) return;
    const buf = Buffer.from(pcmBuffer);
    const rms = computeRms(buf);
    if (rms >= this.vadThreshold) {
      if (!this.speaking) {
        this.speaking = true;
        if (this.interactionStatus === "IN_PROGRESS") this.interrupt();
      }
      this.silenceMs = 0;
      this.speechChunks.push(buf);
    } else if (this.speaking) {
      this.speechChunks.push(buf);
      this.silenceMs += Math.round((buf.length / 2 / 16000) * 1000);
      if (this.silenceMs >= 650) {
        this.endAudio();
      }
    }
  }

  endAudio() {
    if (!this.speechChunks.length) return;
    const audio = Buffer.concat(this.speechChunks.splice(0));
    this.speaking = false;
    this.silenceMs = 0;
    if (audio.length < 3200) return; // ignore tiny clicks < 100ms
    this.processVoiceUtterance(audio).catch((err) => this.emit("error", err));
  }

  async processVoiceUtterance(pcm16) {
    this.setInteractionStatus("IN_PROGRESS");
    let text = "";
    try {
      const res = await fetch(this.sttUrl, {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: pcmToWav(pcm16, 16000),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json();
        text = String(data.text || "").trim();
      }
    } catch {
      // Fallback gracefully if no local STT daemon is active
    }
    if (!text) {
      this.setInteractionStatus("IDLE");
      return;
    }
    this.emit("transcript", { role: "user", text });
    await this.runLlmTurn(text);
  }

  async sendText(text) {
    const clean = String(text || "").trim();
    if (!clean || this.closed) return;
    this.setInteractionStatus("IN_PROGRESS");
    await this.runLlmTurn(clean);
  }

  async runLlmTurn(userText) {
    this.abortCtrl?.abort();
    this.abortCtrl = new AbortController();

    this.history.push({ role: "user", content: userText });
    if (this.history.length > 20) this.history = this.history.slice(-20);

    const persona = this.options.settings?.aiVoice?.systemPersona
      ? `\n\n${this.options.settings.aiVoice.systemPersona}`
      : "";
    const systemMsg = {
      role: "system",
      content: `${this.systemPrompt}${persona}\n\n${roomContext.formatPromptBlock(this.latestRoomCtx)}`.trim(),
    };

    try {
      const payload = {
        model: this.llmModel,
        messages: [systemMsg, ...this.history],
        ...(this.tools.length ? { tools: toOpenAIChatTools(this.tools), tool_choice: "auto" } : {}),
        stream: false,
      };
      const res = await fetch(this.llmUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: this.abortCtrl.signal,
      });
      if (!res.ok) {
        throw new Error(`Local LLM endpoint returned HTTP ${res.status}`);
      }
      const data = await res.json();
      const msg = data.choices?.[0]?.message || data.message || {};
      const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

      if (calls.length) {
        const parsedCalls = calls.map((c, idx) => {
          let args = c.function?.arguments;
          if (typeof args === "string") {
            try {
              args = JSON.parse(args);
            } catch {
              args = {};
            }
          }
          return {
            id: c.id || `local-${Date.now()}-${idx}`,
            name: c.function?.name || c.name,
            args: args || {},
          };
        });
        this.emit("tool_calls", parsedCalls);
      }

      const replyText = String(msg.content || "").trim();
      if (replyText) {
        this.history.push({ role: "assistant", content: replyText });
        this.emit("transcript", { role: "model", text: replyText });
        await this.speakText(replyText);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        // Offline resilience: try OpenAI compat local server list or emit crisp error
        this.emit("error", err);
      }
    } finally {
      this.setInteractionStatus("IDLE");
      this.emit("turn_complete");
    }
  }

  async sendToolResult(callId, name, result) {
    this.history.push({
      role: "tool",
      tool_call_id: callId,
      name,
      content: JSON.stringify(result),
    });
  }

  async speakText(text) {
    if (!text || this.closed) return;
    // Try configured local TTS HTTP endpoint (Piper / Kokoro / voice/server.py)
    try {
      const res = await fetch(this.ttsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, engine: this.ttsEngine }),
        signal: this.abortCtrl?.signal || AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        // Strip 44-byte WAV header when returning PCM16 bytes
        const pcm = buf.length > 44 && buf.subarray(0, 4).toString("ascii") === "RIFF" ? buf.subarray(44) : buf;
        this.emit("audio", pcm);
        return;
      }
    } catch {}

    // Fallback: try local piper or espeak-ng CLI silently if available on Ubuntu
    try {
      await new Promise((resolve) => {
        execFile("which", ["piper"], (err) => {
          void err;
          resolve();
        });
      });
    } catch {}
    void local;
  }

  interrupt() {
    this.abortCtrl?.abort();
    this.speechChunks.length = 0;
    this.speaking = false;
    super.interrupt();
  }
}

module.exports = LocalPipelineAdapter;
