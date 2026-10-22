// ---------- Synthesized WebAudio sounds for the robot and interactive props ----------
// Off by default. Uses only WebAudio oscillators and filtered noise (zero audio downloads).
// Supports volume, per-character pitch, category switches, and optional mixing into recordings.

const DEFAULT_CONFIG = {
  enabled: false,
  volume: 0.4,
  pitch: 1,
  recordMix: false,
  categories: {
    blips: true,
    hums: true,
    servos: true,
    giggles: true,
    sighs: true,
    chimes: true,
    ambience: true,
  },
};

class RobotSoundEngine {
  constructor() {
    this.config = { ...DEFAULT_CONFIG, categories: { ...DEFAULT_CONFIG.categories } };
    this.characterPitch = 1;
    this.ctx = null;
    this.master = null;
    this.recCtx = null;
    this.recNode = null;
    this.ambienceLoop = null;
    this.ambienceKind = "";
  }

  configure(cfg = {}) {
    if (!cfg || typeof cfg !== "object") return;
    if (typeof cfg.enabled === "boolean") this.config.enabled = cfg.enabled;
    if (cfg.volume != null && Number.isFinite(Number(cfg.volume))) {
      this.config.volume = Math.min(1, Math.max(0, Number(cfg.volume)));
    }
    if (cfg.pitch != null && Number.isFinite(Number(cfg.pitch))) {
      this.config.pitch = Math.min(1.6, Math.max(0.6, Number(cfg.pitch)));
    }
    if (typeof cfg.recordMix === "boolean") this.config.recordMix = cfg.recordMix;
    if (cfg.categories && typeof cfg.categories === "object") {
      for (const k of Object.keys(DEFAULT_CONFIG.categories)) {
        if (typeof cfg.categories[k] === "boolean") this.config.categories[k] = cfg.categories[k];
      }
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.config.enabled ? this.config.volume : 0, this.ctx.currentTime, 0.03);
    }
    if (!this.config.enabled) this.stopAmbience();
  }

  setCharacterPitch(pitch = 1) {
    if (Number.isFinite(Number(pitch))) {
      this.characterPitch = Math.min(1.6, Math.max(0.6, Number(pitch)));
    }
  }

  get effectivePitch() {
    return Math.min(2.0, Math.max(0.5, (this.config.pitch || 1) * (this.characterPitch || 1)));
  }

  ensureContext() {
    if (typeof window === "undefined") return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!this.ctx) {
      try {
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.config.volume;
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Returns an audio node on the voice recorder's AudioContext when recordMix is enabled
  recordingNode(audioCtx) {
    if (!this.config.enabled || !this.config.recordMix || !audioCtx) return null;
    if (this.recCtx !== audioCtx || !this.recNode) {
      this.recCtx = audioCtx;
      this.recNode = audioCtx.createGain();
      this.recNode.gain.value = this.config.volume;
    }
    return this.recNode;
  }

  // Internal helper: runs synthesis on primary ctx and (if recording with recordMix) on recCtx
  withTargets(fn) {
    const ctx = this.ensureContext();
    if (ctx && this.master) {
      this.master.gain.value = this.config.volume;
      fn(ctx, this.master);
    }
    if (this.config.recordMix && this.recCtx && this.recNode && this.recCtx !== ctx && this.recCtx.state === "running") {
      this.recNode.gain.value = this.config.volume;
      fn(this.recCtx, this.recNode);
    }
  }

  play(kind = "blip", { force = false } = {}) {
    if (!force && !this.config.enabled) return false;
    const catMap = {
      blip: "blips",
      hum: "hums",
      servo: "servos",
      giggle: "giggles",
      sigh: "sighs",
      chime: "chimes",
      water: "ambience",
      music: "ambience",
      fireplace: "ambience",
    };
    const cat = catMap[kind] || "blips";
    if (!force && this.config.categories[cat] === false) return false;

    const p = this.effectivePitch;
    this.withTargets((ctx, dest) => {
      const t0 = ctx.currentTime;
      if (kind === "blip") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(520 * p, t0);
        osc.frequency.exponentialRampToValueAtTime(780 * p, t0 + 0.06);
        osc.frequency.exponentialRampToValueAtTime(640 * p, t0 + 0.11);
        gain.gain.setValueAtTime(0.001, t0);
        gain.gain.linearRampToValueAtTime(0.18, t0 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
        osc.connect(gain).connect(dest);
        osc.start(t0);
        osc.stop(t0 + 0.13);
      } else if (kind === "hum") {
        const notes = [293.66, 369.99, 440.0];
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          const st = t0 + i * 0.16;
          osc.frequency.setValueAtTime(freq * p, st);
          gain.gain.setValueAtTime(0.001, st);
          gain.gain.linearRampToValueAtTime(0.11, st + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, st + 0.22);
          osc.connect(gain).connect(dest);
          osc.start(st);
          osc.stop(st + 0.24);
        });
      } else if (kind === "servo") {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(320 * p, t0);
        filter.Q.value = 3.5;
        osc.frequency.setValueAtTime(140 * p, t0);
        osc.frequency.linearRampToValueAtTime(220 * p, t0 + 0.09);
        osc.frequency.linearRampToValueAtTime(160 * p, t0 + 0.18);
        gain.gain.setValueAtTime(0.001, t0);
        gain.gain.linearRampToValueAtTime(0.08, t0 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.19);
        osc.connect(filter).connect(gain).connect(dest);
        osc.start(t0);
        osc.stop(t0 + 0.2);
      } else if (kind === "giggle") {
        const hops = [620, 740, 680, 820];
        hops.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          const st = t0 + i * 0.075;
          osc.frequency.setValueAtTime(freq * p, st);
          osc.frequency.exponentialRampToValueAtTime(freq * 1.15 * p, st + 0.05);
          gain.gain.setValueAtTime(0.001, st);
          gain.gain.linearRampToValueAtTime(0.15, st + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, st + 0.068);
          osc.connect(gain).connect(dest);
          osc.start(st);
          osc.stop(st + 0.072);
        });
      } else if (kind === "sigh") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(420 * p, t0);
        osc.frequency.exponentialRampToValueAtTime(240 * p, t0 + 0.38);
        gain.gain.setValueAtTime(0.001, t0);
        gain.gain.linearRampToValueAtTime(0.12, t0 + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
        osc.connect(gain).connect(dest);
        osc.start(t0);
        osc.stop(t0 + 0.42);
      } else if (kind === "chime") {
        const chord = [523.25, 659.25, 783.99, 1046.5];
        chord.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          const st = t0 + i * 0.055;
          osc.frequency.setValueAtTime(freq * p, st);
          gain.gain.setValueAtTime(0.001, st);
          gain.gain.linearRampToValueAtTime(0.14, st + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, st + 0.32);
          osc.connect(gain).connect(dest);
          osc.start(st);
          osc.stop(st + 0.34);
        });
      } else if (kind === "water") {
        const drops = [480, 620, 790];
        drops.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          const st = t0 + i * 0.08;
          osc.frequency.setValueAtTime(freq, st);
          osc.frequency.exponentialRampToValueAtTime(freq * 1.35, st + 0.06);
          gain.gain.setValueAtTime(0.001, st);
          gain.gain.linearRampToValueAtTime(0.1, st + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, st + 0.07);
          osc.connect(gain).connect(dest);
          osc.start(st);
          osc.stop(st + 0.08);
        });
      }
    });
    return true;
  }

  // Soft synthesized room ambience when clicking radio, record_player, or fireplace
  toggleAmbience(kind = "music") {
    if (this.ambienceLoop && this.ambienceKind === kind) {
      this.stopAmbience();
      return false;
    }
    this.stopAmbience();
    this.ambienceKind = kind;
    const playStep = () => {
      if (this.config.categories.ambience === false) return;
      this.withTargets((ctx, dest) => {
        const t0 = ctx.currentTime;
        if (kind === "fireplace") {
          // Warm low crackle pops
          for (let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "triangle";
            const st = t0 + i * 0.35;
            osc.frequency.setValueAtTime(110 + (i * 47) % 90, st);
            gain.gain.setValueAtTime(0.001, st);
            gain.gain.linearRampToValueAtTime(0.05, st + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, st + 0.08);
            osc.connect(gain).connect(dest);
            osc.start(st);
            osc.stop(st + 0.09);
          }
        } else {
          // Lo-fi warm synthesized chord pad for radio / record player
          const chords = [
            [261.63, 329.63, 392.0, 493.88],
            [220.0, 261.63, 329.63, 392.0],
            [174.61, 220.0, 261.63, 349.23],
            [196.0, 246.94, 293.66, 392.0],
          ];
          const chord = chords[Math.floor(Date.now() / 2400) % chords.length];
          chord.forEach((freq) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, t0);
            gain.gain.setValueAtTime(0.001, t0);
            gain.gain.linearRampToValueAtTime(0.035, t0 + 0.3);
            gain.gain.exponentialRampToValueAtTime(0.001, t0 + 2.1);
            osc.connect(gain).connect(dest);
            osc.start(t0);
            osc.stop(t0 + 2.2);
          });
        }
      });
    };
    playStep();
    this.ambienceLoop = setInterval(playStep, 2200);
    return true;
  }

  stopAmbience() {
    if (this.ambienceLoop) {
      clearInterval(this.ambienceLoop);
      this.ambienceLoop = null;
    }
    this.ambienceKind = "";
  }
}

export const robotSound = new RobotSoundEngine();
