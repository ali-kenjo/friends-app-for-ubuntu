// ---------- What the windows and open sides show ----------
// A painted view per outside kind (choices.mjs OUTSIDES) and time of day: a sky, a horizon, and the
// landscape's own shapes (rooftops with lit windows, hills and trees, the sea, pines in snow, stars).
// Drawn once on a canvas per kind, phase and seed, cached; shown unlit so it glows like daylight would.
import * as THREE from "three";

// The sky by phase: [top, horizon, ground, stars]
const PHASES = {
  day: ["#6fb4f2", "#dff0ff", "#8fb07e", false],
  golden: ["#f3a469", "#ffe0b0", "#7c6a4a", false],
  evening: ["#2a2f6b", "#f08a5f", "#2a2230", true],
  night: ["#070d24", "#27356b", "#0d1020", true],
};

export function phaseFor(hour) {
  if (hour >= 7.5 && hour < 17) return "day";
  if ((hour >= 6 && hour < 7.5) || (hour >= 17 && hour < 19)) return "golden";
  if (hour >= 19 && hour < 21.5) return "evening";
  return "night";
}

const cache = new Map();
const rnd = (seed) => {
  let s = seed || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};

function paint(kind, phase, seed) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext("2d");
  const w = c.width;
  const h = c.height;
  const r = rnd(seed);
  const [top, horizon, ground, stars] = kind === "space" ? ["#05061a", "#141a4a", "#05061a", true] : PHASES[phase] || PHASES.day;
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.72);
  sky.addColorStop(0, top);
  sky.addColorStop(1, horizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  if (stars) {
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
      const s = r() < 0.1 ? 2.2 : 1.3;
      ctx.fillRect(r() * w, r() * h * 0.6, s, s);
    }
  }
  // Sun or moon
  if (kind !== "space") {
    const night = phase === "night" || phase === "evening";
    ctx.fillStyle = night ? "#f4f1e0" : phase === "golden" ? "#ffd38a" : "#fff8e0";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 40;
    ctx.beginPath();
    ctx.arc(w * 0.74, h * (phase === "golden" ? 0.5 : 0.2), night ? 16 : 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  const lit = phase === "evening" || phase === "night";
  const hy = h * 0.7;
  if (kind === "city_night") {
    let x = 0;
    while (x < w) {
      const bw = 34 + r() * 60;
      const bh = 50 + r() * 190;
      ctx.fillStyle = new THREE.Color(ground).offsetHSL(0, 0, r() * 0.06).getStyle();
      ctx.beginPath();
      ctx.roundRect(x, hy - bh, bw, bh + h, 4);
      ctx.fill();
      for (let wy = hy - bh + 10; wy < hy - 8; wy += 16) {
        for (let wx = x + 6; wx < x + bw - 8; wx += 12) {
          if (r() < (lit ? 0.32 : 0.08)) {
            ctx.fillStyle = r() < 0.8 ? "#ffd98a" : "#9fd6ff";
            ctx.fillRect(wx, wy, 5, 8);
          }
        }
      }
      x += bw + 3;
    }
  } else if (kind === "hills" || kind === "garden_day") {
    for (let layer = 0; layer < 3; layer++) {
      const col = new THREE.Color(ground).offsetHSL(0, 0, 0.08 - layer * 0.05);
      ctx.fillStyle = col.getStyle();
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, hy - 40 + layer * 30 - Math.sin(x / (160 - layer * 30) + layer * 2 + seed) * (40 - layer * 8));
      ctx.lineTo(w, h);
      ctx.fill();
    }
    if (kind === "garden_day") {
      for (let i = 0; i < 9; i++) {
        const x = r() * w;
        const y = hy + 30 + r() * 60;
        ctx.fillStyle = new THREE.Color(ground).offsetHSL(0.02, 0.05, -0.1).getStyle();
        ctx.beginPath();
        ctx.arc(x, y - 40, 26 + r() * 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#5a4030";
        ctx.fillRect(x - 3, y - 20, 6, 28);
      }
    }
  } else if (kind === "sea") {
    ctx.fillStyle = new THREE.Color(horizon).lerp(new THREE.Color("#2d6fa8"), 0.6).getStyle();
    ctx.fillRect(0, hy, w, h - hy);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 40; i++) {
      const y = hy + 6 + r() * (h - hy);
      ctx.lineWidth = 1 + (y - hy) / 80;
      ctx.beginPath();
      ctx.moveTo(r() * w, y);
      ctx.lineTo(r() * w, y);
      ctx.stroke();
    }
  } else if (kind === "forest" || kind === "snow") {
    const snow = kind === "snow";
    ctx.fillStyle = snow ? "#e8eef6" : ground;
    ctx.fillRect(0, hy, w, h);
    for (let i = 0; i < 28; i++) {
      const x = r() * w;
      const s = 40 + r() * 70;
      const y = hy + r() * 40;
      ctx.fillStyle = new THREE.Color(snow ? "#3d5a4c" : "#1f3328").offsetHSL(0, 0, -r() * 0.05).getStyle();
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(x, y - s - k * 0 - (2 - k) * s * 0.35);
        ctx.lineTo(x - s * (0.25 + k * 0.1), y - s * 0.35 * (2 - k) + s * 0.1);
        ctx.lineTo(x + s * (0.25 + k * 0.1), y - s * 0.35 * (2 - k) + s * 0.1);
        ctx.fill();
        if (snow) {
          ctx.fillStyle = "rgba(255,255,255,0.8)";
          ctx.beginPath();
          ctx.moveTo(x, y - s - (2 - k) * s * 0.35);
          ctx.lineTo(x - s * 0.1, y - s * 0.35 * (2 - k) - s * 0.25);
          ctx.lineTo(x + s * 0.1, y - s * 0.35 * (2 - k) - s * 0.25);
          ctx.fill();
          ctx.fillStyle = "#3d5a4c";
        }
      }
    }
  } else if (kind === "clouds") {
    for (let i = 0; i < 14; i++) {
      const x = r() * w;
      const y = h * (0.35 + r() * 0.55);
      const g = ctx.createRadialGradient(x, y, 4, x, y, 90 + r() * 80);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 200, y - 200, 400, 400);
    }
  } else if (kind === "space") {
    const g = ctx.createRadialGradient(w * 0.3, h * 0.6, 10, w * 0.3, h * 0.6, 220);
    g.addColorStop(0, "#d98a5f");
    g.addColorStop(0.55, "#8a4a3a");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w * 0.3, h * 0.62, 150, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.shared = true;
  return t;
}

export function outsideTexture(kind, hour = 14, seed = 7) {
  const phase = phaseFor(hour);
  const key = `${kind}|${phase}|${seed}`;
  if (!cache.has(key)) cache.set(key, paint(kind, phase, seed));
  return cache.get(key);
}

// How bright the view is (it lights nothing, but daylight views read brighter than night ones)
export const outsideGlow = (hour) => ({ day: 1, golden: 0.95, evening: 0.85, night: 0.75 })[phaseFor(hour)];
