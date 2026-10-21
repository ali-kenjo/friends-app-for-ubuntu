// ---------- Celebrations & Ambient Golden-Hour Particles ----------
// Tasteful sparkles/confetti when a mission finishes, a task is checked off, or a habit streak grows.
// Respects prefers-reduced-motion, the Appearance animation setting, and hardware quality tier.
import { getSettings, onSettings } from "./store.js";

const reduceMotion = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: true };

export function motionAllowed() {
  if (reduceMotion.matches) return false;
  const anim = getSettings()?.theme?.animation || "lively";
  return anim !== "off";
}

export function celebrate(anchorEl = null, { kind = "task" } = {}) {
  document.dispatchEvent(new CustomEvent("friends:celebrate", { detail: { kind } }));
  if (!motionAllowed()) return;

  const rect = anchorEl?.getBoundingClientRect?.();
  const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const cy = rect ? rect.top + rect.height / 2 : window.innerHeight * 0.35;

  const container = document.createElement("div");
  container.className = "celebrate-burst";
  container.setAttribute("aria-hidden", "true");
  container.style.left = `${cx}px`;
  container.style.top = `${cy}px`;

  const count = kind === "mission" ? 18 : 12;
  const colors = ["var(--accent)", "#f5a94a", "#eb7a53", "#fb7185", "#34d399", "#a78bfa"];

  for (let i = 0; i < count; i++) {
    const p = document.createElement("i");
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
    const dist = (kind === "mission" ? 56 : 38) + Math.random() * 34;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 14;
    p.style.setProperty("--dx", `${dx.toFixed(1)}px`);
    p.style.setProperty("--dy", `${dy.toFixed(1)}px`);
    p.style.setProperty("--rot", `${Math.round(Math.random() * 260 - 130)}deg`);
    p.style.setProperty("--c", colors[i % colors.length]);
    container.append(p);
  }

  document.body.append(container);
  setTimeout(() => container.remove(), 900);
}

// Optional ambient floating golden-hour dust motes
let ambientEl = null;

export function syncAmbientParticles(s = getSettings()) {
  if (typeof document === "undefined") return;
  const lowQuality = document.documentElement.dataset.quality === "low";
  const want = Boolean(s?.theme?.particles) && motionAllowed() && !lowQuality;
  if (!want) {
    if (ambientEl) {
      ambientEl.remove();
      ambientEl = null;
    }
    return;
  }
  if (ambientEl) return;
  ambientEl = document.createElement("div");
  ambientEl.id = "ambient-particles";
  ambientEl.className = "ambient-particles";
  ambientEl.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 14; i++) {
    const mote = document.createElement("span");
    mote.style.setProperty("--x", `${(i * 7.3 + 5) % 96}%`);
    mote.style.setProperty("--y", `${(i * 13.7 + 9) % 92}%`);
    mote.style.setProperty("--d", `${12 + (i % 5) * 3}s`);
    mote.style.setProperty("--delay", `-${(i * 1.9).toFixed(1)}s`);
    mote.style.setProperty("--sz", `${3 + (i % 3) * 2}px`);
    ambientEl.append(mote);
  }
  document.body.append(ambientEl);
}

if (typeof window !== "undefined") {
  reduceMotion.addEventListener?.("change", () => syncAmbientParticles());
  onSettings(syncAmbientParticles);
}
