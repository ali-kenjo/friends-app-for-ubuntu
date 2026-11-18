// ---------- What the windows and open sides show ----------
// A painted view per outside kind (choices.mjs OUTSIDES) and time of day: a sky, a horizon, and the
// landscape's own shapes (rooftops with lit windows, hills and trees, the sea, pines in snow, stars).
// Drawn once on a canvas per kind, phase and seed, cached; shown unlit so it glows like daylight would.
// On top of the painting, a little life (stepOutside, about 12 times a second, only for views on screen, still
// with reduced motion or camera-friendly filming): birds and a balloon by day, butterflies in the garden, a
// windmill turning on the hills and a rainbow after golden hour, a kite and a sailboat by the sea, light trails
// and a holo billboard in the city, fireflies in the forest, shooting stars and satellites at night, comets and
// satellites in space, clouds that drift.
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
  return c;
}

// ---------- The life on top ----------
// Each actor: { draw(ctx, w, h, t) } with its own timing; t is seconds since the view was made
function actorsFor(kind, phase, seed) {
  const r = rnd(seed * 31 + 5);
  const day = phase === "day" || phase === "golden";
  const dark = phase === "night" || phase === "evening";
  const list = [];
  const H = 512;
  const hy = H * 0.7;
  // A flock: a few small V's crossing slowly, the next one some seconds later
  if (day && ["hills", "garden_day", "sea", "clouds"].includes(kind)) {
    const birds = Array.from({ length: 5 }, (_, i) => ({ dx: i * 16 + r() * 8, dy: (i % 2) * 9 + r() * 6, ph: r() * 6 }));
    const y0 = H * (0.18 + r() * 0.15);
    list.push({
      draw(ctx, w, h, t) {
        const span = w + 260;
        const x0 = ((t * 28) % (span + 400)) - 200;
        if (x0 > span) return;
        ctx.strokeStyle = phase === "golden" ? "rgba(60,40,40,0.75)" : "rgba(40,50,70,0.7)";
        ctx.lineWidth = 2;
        for (const b of birds) {
          const x = x0 - b.dx;
          const y = y0 + b.dy + Math.sin(t * 1.3 + b.ph) * 3;
          const flap = Math.sin(t * 9 + b.ph) * 3;
          ctx.beginPath();
          ctx.moveTo(x - 6, y - 2 - flap);
          ctx.lineTo(x, y);
          ctx.lineTo(x + 6, y - 2 - flap);
          ctx.stroke();
        }
      },
    });
  }
  // A hot-air balloon drifting very slowly
  if (phase === "day" && ["hills", "clouds", "garden_day"].includes(kind)) {
    const y = H * (0.22 + r() * 0.12);
    const hue = Math.floor(r() * 360);
    list.push({
      draw(ctx, w, h, t) {
        const x = (w * 0.15 + t * 4) % (w + 80) - 40;
        const yy = y + Math.sin(t * 0.3) * 6;
        ctx.fillStyle = `hsl(${hue} 70% 58%)`;
        ctx.beginPath();
        ctx.ellipse(x, yy, 14, 17, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `hsl(${(hue + 40) % 360} 75% 64%)`;
        ctx.fillRect(x - 3, yy - 16, 6, 30);
        ctx.strokeStyle = "rgba(60,40,30,0.8)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 8, yy + 12);
        ctx.lineTo(x - 4, yy + 24);
        ctx.moveTo(x + 8, yy + 12);
        ctx.lineTo(x + 4, yy + 24);
        ctx.stroke();
        ctx.fillStyle = "#7a5332";
        ctx.fillRect(x - 5, yy + 24, 10, 7);
      },
    });
  }
  // Butterflies over the garden
  if (day && kind === "garden_day") {
    const flies = Array.from({ length: 5 }, () => ({ x: r(), y: hy + 30 + r() * 90, ph: r() * 6, c: ["#ffd84a", "#ff8fb0", "#ffffff", "#ffab5e"][Math.floor(r() * 4)] }));
    list.push({
      draw(ctx, w, h, t) {
        for (const f of flies) {
          const x = (f.x * w + Math.sin(t * 0.4 + f.ph) * 60 + t * 6) % w;
          const y = f.y + Math.sin(t * 1.7 + f.ph) * 12;
          const open = 0.4 + Math.abs(Math.sin(t * 12 + f.ph)) * 0.6;
          ctx.fillStyle = f.c;
          ctx.beginPath();
          ctx.ellipse(x - 3 * open, y, 3.5 * open, 3, -0.4, 0, Math.PI * 2);
          ctx.ellipse(x + 3 * open, y, 3.5 * open, 3, 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    });
  }
  // A windmill on the hills, its sails turning
  if (kind === "hills") {
    const x = 1024 * (0.62 + r() * 0.2);
    const base = hy - 30;
    list.push({
      draw(ctx, w, h, t) {
        ctx.fillStyle = dark ? "#2b2a36" : "#e9e2d6";
        ctx.beginPath();
        ctx.moveTo(x - 9, base);
        ctx.lineTo(x - 5, base - 62);
        ctx.lineTo(x + 5, base - 62);
        ctx.lineTo(x + 9, base);
        ctx.fill();
        ctx.save();
        ctx.translate(x, base - 62);
        ctx.rotate(t * 0.6);
        ctx.fillStyle = dark ? "#3a3946" : "#f8f3ea";
        for (let k = 0; k < 4; k++) {
          ctx.rotate(Math.PI / 2);
          ctx.fillRect(-2, 0, 4, 36);
          ctx.fillRect(1, 8, 7, 26);
        }
        ctx.restore();
      },
    });
  }
  // A faint rainbow over the hills and the garden at golden hour
  if (phase === "golden" && (kind === "hills" || kind === "garden_day")) {
    list.push({
      draw(ctx, w, h) {
        const cx = w * 0.32;
        ["#ff5a5a", "#ffa94a", "#ffe45a", "#6ad16a", "#5aa0ff", "#8a6aff"].forEach((c, i) => {
          ctx.strokeStyle = c;
          ctx.globalAlpha = 0.16;
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.arc(cx, hy + 20, 230 - i * 7, Math.PI, Math.PI * 2);
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
      },
    });
  }
  // By the sea: a kite on its string, a sailboat along the horizon, a lighthouse beam at night
  if (kind === "sea") {
    if (day) {
      list.push({
        draw(ctx, w, h, t) {
          const ax = w * 0.18;
          const kx = ax + 60 + Math.sin(t * 0.7) * 18;
          const ky = H * 0.32 + Math.sin(t * 1.1) * 10;
          ctx.strokeStyle = "rgba(255,255,255,0.7)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(ax, h);
          ctx.quadraticCurveTo(ax + 40, ky + 120, kx, ky + 14);
          ctx.stroke();
          ctx.fillStyle = "#ff5a7a";
          ctx.beginPath();
          ctx.moveTo(kx, ky - 14);
          ctx.lineTo(kx + 10, ky);
          ctx.lineTo(kx, ky + 14);
          ctx.lineTo(kx - 10, ky);
          ctx.fill();
        },
      });
    }
    list.push({
      draw(ctx, w, h, t) {
        const x = ((t * 6) % (w + 60)) - 30;
        ctx.fillStyle = dark ? "#1d2a44" : "#f6f2ea";
        ctx.beginPath();
        ctx.moveTo(x, hy - 2);
        ctx.lineTo(x, hy - 24);
        ctx.lineTo(x + 12, hy - 4);
        ctx.fill();
        ctx.fillStyle = dark ? "#151c2e" : "#5b4636";
        ctx.fillRect(x - 8, hy - 3, 22, 4);
      },
    });
    if (dark) {
      list.push({
        draw(ctx, w, h, t) {
          const x = w * 0.88;
          const a = Math.sin(t * 0.9);
          const g = ctx.createLinearGradient(x, hy - 40, x + a * 260, hy - 50);
          g.addColorStop(0, "rgba(255,240,190,0.55)");
          g.addColorStop(1, "rgba(255,240,190,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(x, hy - 40);
          ctx.lineTo(x + a * 260, hy - 70);
          ctx.lineTo(x + a * 260, hy - 30);
          ctx.fill();
          ctx.fillStyle = "#e9e2d6";
          ctx.fillRect(x - 4, hy - 40, 8, 38);
        },
      });
    }
  }
  // The city: light trails along the street, and a holo billboard slowly changing color
  if (kind === "city_night") {
    const cars = Array.from({ length: 7 }, () => ({ s: 60 + r() * 80, off: r() * 1200, dir: r() < 0.5 ? 1 : -1 }));
    list.push({
      draw(ctx, w, h, t) {
        for (const c of cars) {
          const y = H * (c.dir > 0 ? 0.9 : 0.94);
          const x = c.dir > 0 ? ((t * c.s + c.off) % (w + 120)) - 60 : w - (((t * c.s + c.off) % (w + 120)) - 60);
          const g = ctx.createLinearGradient(x, y, x - c.dir * 46, y);
          g.addColorStop(0, c.dir > 0 ? "rgba(255,236,170,0.95)" : "rgba(255,90,80,0.95)");
          g.addColorStop(1, "rgba(255,200,150,0)");
          ctx.fillStyle = g;
          ctx.fillRect(Math.min(x, x - c.dir * 46), y - 1.5, 46, 3);
        }
      },
    });
    const bx = 1024 * (0.2 + r() * 0.5);
    list.push({
      draw(ctx, w, h, t) {
        const hue = (t * 12) % 360;
        ctx.fillStyle = `hsla(${hue} 90% 62% / 0.55)`;
        ctx.fillRect(bx, H * 0.36, 70, 34);
        ctx.strokeStyle = `hsla(${(hue + 60) % 360} 100% 75% / 0.85)`;
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, H * 0.36, 70, 34);
      },
    });
  }
  // Fireflies in the forest at night
  if (kind === "forest" && dark) {
    const flies = Array.from({ length: 14 }, () => ({ x: r(), y: hy - 10 + r() * 90, ph: r() * 6 }));
    list.push({
      draw(ctx, w, h, t) {
        for (const f of flies) {
          const a = 0.5 + 0.5 * Math.sin(t * 1.6 + f.ph);
          ctx.fillStyle = `rgba(214,255,122,${0.25 + a * 0.6})`;
          ctx.beginPath();
          ctx.arc((f.x * w + Math.sin(t * 0.3 + f.ph) * 20) % w, f.y + Math.sin(t * 0.5 + f.ph) * 6, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    });
  }
  // Clouds that drift
  if (kind === "clouds") {
    const puffs = Array.from({ length: 3 }, () => ({ y: H * (0.3 + r() * 0.4), s: 6 + r() * 6, off: r() * 1200, size: 70 + r() * 50 }));
    list.push({
      draw(ctx, w, h, t) {
        for (const p of puffs) {
          const x = ((t * p.s + p.off) % (w + 300)) - 150;
          const g = ctx.createRadialGradient(x, p.y, 4, x, p.y, p.size);
          g.addColorStop(0, "rgba(255,255,255,0.7)");
          g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = g;
          ctx.fillRect(x - p.size, p.y - p.size, p.size * 2, p.size * 2);
        }
      },
    });
  }
  // Shooting stars (now and then) and satellites at night, and comets in space
  if (dark || kind === "space") {
    const every = 9 + r() * 6;
    list.push({
      draw(ctx, w, h, t) {
        const k = (t % every) / 0.9;
        if (k > 1) return;
        const n = Math.floor(t / every);
        const rr = rnd(seed + n * 17);
        const x0 = w * (0.2 + rr() * 0.6);
        const y0 = H * (0.05 + rr() * 0.2);
        const len = kind === "space" ? 120 : 80;
        const x = x0 + k * 160;
        const y = y0 + k * 50;
        const g = ctx.createLinearGradient(x, y, x - len, y - len * 0.3);
        g.addColorStop(0, `rgba(255,255,255,${1 - k * 0.6})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = kind === "space" ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - len, y - len * 0.3);
        ctx.stroke();
      },
    });
    const sats = Array.from({ length: kind === "space" ? 3 : 1 }, () => ({ y: H * (0.1 + r() * 0.3), s: 5 + r() * 6, off: r() * 1000 }));
    list.push({
      draw(ctx, w, h, t) {
        for (const sat of sats) {
          const x = ((t * sat.s + sat.off) % (w + 20)) - 10;
          const blink = Math.sin(t * 3 + sat.off) > 0.7;
          ctx.fillStyle = blink ? "rgba(255,120,120,0.95)" : "rgba(255,255,255,0.85)";
          ctx.fillRect(x, sat.y, 2.5, 2.5);
        }
      },
    });
  }
  return list;
}

// One view: the painting, the canvas it's shown on (painting + life) and its texture
function makeView(kind, phase, seed) {
  const base = paint(kind, phase, seed);
  const out = document.createElement("canvas");
  out.width = base.width;
  out.height = base.height;
  const ctx = out.getContext("2d");
  ctx.drawImage(base, 0, 0);
  const texture = new THREE.CanvasTexture(out);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.shared = true;
  const view = { base, out, ctx, texture, actors: actorsFor(kind, phase, seed), t: Math.random() * 30, since: 0 };
  texture.userData.outside = view;
  if (view.actors.length) draw(view);
  return view;
}

function draw(view) {
  const { ctx, base, out } = view;
  ctx.drawImage(base, 0, 0);
  for (const a of view.actors) a.draw(ctx, out.width, out.height, view.t);
  view.texture.needsUpdate = true;
}

export function outsideTexture(kind, hour = 14, seed = 7) {
  const phase = phaseFor(hour);
  const key = `${kind}|${phase}|${seed}`;
  if (!cache.has(key)) cache.set(key, makeView(kind, phase, seed));
  return cache.get(key).texture;
}

// The life moves on, for the views given (their textures): still with reduced motion or while filming
// camera-friendly; fps: how often a view is redrawn (lower on the Low quality)
export function stepOutside(textures, dt, { still = false, fps = 12 } = {}) {
  if (still) return;
  for (const tex of textures) {
    const view = tex?.userData?.outside;
    if (!view || !view.actors.length) continue;
    view.t += dt;
    view.since += dt;
    if (view.since < 1 / fps) continue;
    view.since = 0;
    draw(view);
  }
}

// The kinds of life a view has (for tests and the editor's words)
export const outsideLife = (kind, phase) => actorsFor(kind, phase, 7).length;

// How bright the view is (it lights nothing, but daylight views read brighter than night ones)
export const outsideGlow = (hour) => ({ day: 1, golden: 0.95, evening: 0.85, night: 0.75 })[phaseFor(hour)];
