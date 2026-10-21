// ---------- Soft UI sound set (synthesized with WebAudio, no audio files) ----------
// Off by default. Per-category switches (UI controls, notifications, celebrations) and a volume slider
// live in Settings → Appearance, with a gentle one-time offer in onboarding.
import { getSettings } from "./store.js";

let ctx = null;

function ensureContext() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx) {
    try {
      ctx = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function canPlay(category, { force = false } = {}) {
  if (force) return true;
  const s = getSettings()?.sound;
  if (!s || !s.enabled) return false;
  if ((s.volume ?? 60) <= 0) return false;
  if (category === "ui" && s.ui === false) return false;
  if (category === "notifications" && s.notifications === false) return false;
  if (category === "celebrations" && s.celebrations === false) return false;
  return true;
}

function masterGain(ac, scale = 1) {
  const s = getSettings()?.sound;
  const vol = Math.max(0, Math.min(100, Number(s?.volume ?? 60))) / 100;
  const g = ac.createGain();
  g.gain.value = Math.max(0.0001, vol * 0.18 * scale);
  g.connect(ac.destination);
  return g;
}

function tone(ac, dest, { freq = 440, freqEnd = 0, type = "sine", start = 0, duration = 0.08, peak = 1 }) {
  const osc = ac.createOscillator();
  const env = ac.createGain();
  const t0 = ac.currentTime + start;
  const t1 = t0 + duration;

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd > 0) {
    osc.frequency.exponentialRampToValueAtTime(freqEnd, t1);
  }

  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.012, duration * 0.25));
  env.gain.exponentialRampToValueAtTime(0.0001, t1);

  osc.connect(env);
  env.connect(dest);
  osc.start(t0);
  osc.stop(t1 + 0.01);
}

export function playUiSound(kind = "click", opts = {}) {
  if (!canPlay("ui", opts)) return;
  const ac = ensureContext();
  if (!ac) return;
  const out = masterGain(ac, 0.75);

  if (kind === "toggle") {
    tone(ac, out, { freq: 392, freqEnd: 523.25, type: "sine", duration: 0.065, peak: 0.8 });
  } else if (kind === "tab") {
    tone(ac, out, { freq: 349.23, freqEnd: 440, type: "triangle", duration: 0.07, peak: 0.65 });
  } else if (kind === "send") {
    tone(ac, out, { freq: 440, freqEnd: 587.33, type: "sine", duration: 0.09, peak: 0.85 });
    tone(ac, out, { freq: 659.25, type: "triangle", start: 0.035, duration: 0.09, peak: 0.45 });
  } else {
    // Soft wooden felt tap
    tone(ac, out, { freq: 320, freqEnd: 240, type: "sine", duration: 0.045, peak: 0.7 });
  }
}

export function playNotificationSound(opts = {}) {
  if (!canPlay("notifications", opts)) return;
  const ac = ensureContext();
  if (!ac) return;
  const out = masterGain(ac, 0.9);
  // Warm two-note marimba interval (F4 -> C5)
  tone(ac, out, { freq: 349.23, type: "sine", start: 0, duration: 0.18, peak: 0.85 });
  tone(ac, out, { freq: 523.25, type: "sine", start: 0.09, duration: 0.28, peak: 0.9 });
  tone(ac, out, { freq: 1046.5, type: "triangle", start: 0.09, duration: 0.16, peak: 0.22 });
}

export function playCelebrationSound(opts = {}) {
  if (!canPlay("celebrations", opts)) return;
  const ac = ensureContext();
  if (!ac) return;
  const out = masterGain(ac, 1);
  // Warm golden-hour chord arpeggio (Fmaj9: F4 - A4 - C5 - E5 - G5)
  const notes = [349.23, 440, 523.25, 659.25, 783.99];
  notes.forEach((freq, i) => {
    tone(ac, out, { freq, type: "sine", start: i * 0.055, duration: 0.26 + i * 0.04, peak: 0.85 - i * 0.08 });
    tone(ac, out, { freq: freq * 2, type: "triangle", start: i * 0.055, duration: 0.14, peak: 0.18 });
  });
}

// Wire subtle UI feedback to interactive controls
if (typeof document !== "undefined") {
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target.closest?.("button, .nav-item, .tab, .subtab, .life-tab, .character-chip, .swatch, input[type='checkbox']");
      if (!target || target.disabled) return;
      if (target.id === "send-btn") playUiSound("send");
      else if (target.matches("input[type='checkbox']")) playUiSound("toggle");
      else if (target.matches(".nav-item, .tab, .subtab, .life-tab")) playUiSound("tab");
      else playUiSound("click");
    },
    { passive: true }
  );

  document.addEventListener("friends:celebrate", () => playCelebrationSound());
  document.addEventListener("friends:toast", () => playNotificationSound());
}
