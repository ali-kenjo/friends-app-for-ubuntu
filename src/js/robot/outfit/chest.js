// Something on the chest: a glowing core, a heart, a star, a bolt, a name badge, buttons.
import * as THREE from "three";
import { bodySurface, starGeometry, heartGeometry, boltGeometry, plate, roundedRect } from "./kit.js";

// A spot on the front of the body, lying flat on it
function spot(c, y, lift = 0.006) {
  const s = bodySurface(c, y);
  const g = new THREE.Group();
  g.position.set(0, y - c.dims.body.h / 2, s.z + lift);
  g.rotation.x = s.tilt;
  g.scale.setScalar(1.45 * c.dims.body.W ** 0.5);
  return g;
}

const heightOf = (c, f) => c.dims.body.h * f;

const core = (c) => {
  const g = spot(c, heightOf(c, 0.55), 0.004);
  const rim = c.paint(2, { roughness: 0.3, metalness: 0.6 });
  const light = c.glow(1, 1.9);
  const ring = c.make(new THREE.TorusGeometry(0.05, 0.011, 14, 40), rim, { shadow: false });
  g.add(ring);
  const disc = c.make(new THREE.CircleGeometry(0.05, 36), light, { shadow: false });
  disc.position.z = 0.001;
  g.add(disc);
  return {
    object: g,
    update(pose, time) {
      light.emissiveIntensity = 1.5 + 0.35 * Math.sin(time * 2.4) + (pose.speaking || 0) * 0.9;
    },
  };
};

const flat = (build, depth) => (c) => {
  const g = spot(c, heightOf(c, 0.55), 0.004);
  const main = c.paint(1, { roughness: 0.4, physical: true });
  const shine = c.paint(2, { roughness: 0.3 });
  const geo = build(depth);
  const m = c.make(geo, main, { shadow: false });
  g.add(m);
  const hi = c.make(new THREE.SphereGeometry(0.008, 10, 8), shine, { shadow: false });
  hi.position.set(-0.026, 0.026, depth * 0.6);
  hi.scale.z = 0.4;
  g.add(hi);
  return { object: g };
};

const heart = flat(() => heartGeometry(0.044, 0.014), 0.014);
const star = flat(() => starGeometry(0.058, 0.026, 5, 0.012), 0.012);
const bolt = flat(() => boltGeometry(0.055, 0.012), 0.012);

const badge = (c) => {
  const g = spot(c, heightOf(c, 0.58), 0.006);
  const paper = c.paint(1, { roughness: 0.5 });
  const stripe = c.paint(2, { roughness: 0.5 });
  g.add(c.make(plate(roundedRect(0.15, 0.1, 0.014), 0.008, 0.002), paper, { shadow: false }));
  const top = c.make(plate(roundedRect(0.15, 0.03, 0.01), 0.01, 0.002), stripe, { shadow: false });
  top.position.y = 0.035;
  g.add(top);
  // A line of text, drawn on a canvas (uses design.badgeText)
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const texture = c.keep(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  const drawText = (txt) => {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = "#1d1f24";
    const s = String(txt || "HELLO").trim() || "HELLO";
    ctx.font = `bold ${s.length > 8 ? 28 : 38}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s.slice(0, 14), 128, 34);
    texture.needsUpdate = true;
  };
  drawText(c.design?.badgeText);
  const label = c.make(new THREE.PlaneGeometry(0.12, 0.03), c.keep(new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false })), { shadow: false });
  label.position.set(0, -0.015, 0.0065);
  g.add(label);
  return {
    object: g,
    recolor() {
      drawText(c.design?.badgeText);
    },
  };
};

const buttons = (c) => {
  const g = new THREE.Group();
  const button = c.paint(1, { roughness: 0.35, physical: true });
  const rim = c.paint(2, { roughness: 0.3, metalness: 0.6 });
  for (const f of [0.64, 0.52, 0.4]) {
    const s = spot(c, heightOf(c, f), 0.003);
    const b = c.make(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 24), button, { shadow: false });
    b.rotation.x = Math.PI / 2;
    s.add(b);
    const r = c.make(new THREE.TorusGeometry(0.026, 0.0045, 8, 24), rim, { shadow: false });
    r.position.z = 0.004;
    s.add(r);
    g.add(s);
  }
  return { object: g };
};

const pocket_protector = (c) => {
  const g = spot(c, heightOf(c, 0.58), 0.005);
  const pouch = c.paint(1, { roughness: 0.5 });
  const pens = c.paint(2, { roughness: 0.35 });
  g.add(c.make(plate(roundedRect(0.095, 0.105, 0.012), 0.01, 0.002), pouch, { shadow: false }));
  for (const dx of [-0.024, 0, 0.024]) {
    const p = c.make(new THREE.CylinderGeometry(0.007, 0.007, 0.055, 10), pens, { shadow: false });
    p.position.set(dx, 0.055, 0.002);
    g.add(p);
  }
  return { object: g };
};

const sheriff_star = (c) => {
  const g = spot(c, heightOf(c, 0.56), 0.005);
  const gold = c.paint(1, { roughness: 0.25, metalness: 0.85 });
  const tip = c.paint(2, { roughness: 0.3, metalness: 0.8 });
  g.add(c.make(starGeometry(0.06, 0.032, 6, 0.01), gold, { shadow: false }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 2;
    const ball = c.make(new THREE.SphereGeometry(0.008, 10, 8), tip, { shadow: false });
    ball.position.set(Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.004);
    g.add(ball);
  }
  return { object: g };
};

const compass_badge = (c) => {
  const g = spot(c, heightOf(c, 0.56), 0.005);
  const brass = c.paint(1, { roughness: 0.3, metalness: 0.8 });
  const needleMat = c.paint(2, { roughness: 0.35 });
  g.add(c.make(new THREE.TorusGeometry(0.048, 0.008, 10, 32), brass, { shadow: false }));
  const face = c.make(new THREE.CircleGeometry(0.046, 28), c.keep(new THREE.MeshStandardMaterial({ color: "#faf6ee", roughness: 0.5 })), { shadow: false });
  g.add(face);
  const needle = c.make(new THREE.ConeGeometry(0.012, 0.068, 4), needleMat, { shadow: false });
  needle.position.z = 0.005;
  needle.rotation.z = -0.45;
  g.add(needle);
  return { object: g };
};

const equalizer = (c) => {
  const g = spot(c, heightOf(c, 0.55), 0.005);
  const barMat = c.glow(1, 1.8);
  const frameMat = c.paint(2, { roughness: 0.4 });
  g.add(c.make(plate(roundedRect(0.16, 0.095, 0.015), 0.008, 0.002), frameMat, { shadow: false }));
  const bars = [];
  for (let i = 0; i < 5; i++) {
    const b = c.make(new THREE.BoxGeometry(0.018, 0.055, 0.008), barMat, { shadow: false });
    b.position.set((i - 2) * 0.028, 0, 0.004);
    g.add(b);
    bars.push(b);
  }
  return {
    object: g,
    update(pose, time) {
      const spk = pose.speaking || 0;
      bars.forEach((b, i) => {
        b.scale.y = 0.35 + 0.65 * Math.abs(Math.sin(time * (3 + i * 0.8))) * (0.4 + 0.9 * spk);
      });
    },
  };
};

const pixel_heart = (c) => {
  const g = spot(c, heightOf(c, 0.56), 0.005);
  const main = c.paint(1, { roughness: 0.35, physical: true });
  const hi = c.paint(2, { roughness: 0.3 });
  const grid = [
    [-2, 1], [-1, 1], [1, 1], [2, 1],
    [-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0],
    [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
    [-1, -2], [0, -2], [1, -2],
    [0, -3],
  ];
  const s = 0.016;
  const box = new THREE.BoxGeometry(s, s, 0.012);
  grid.forEach(([x, y], idx) => {
    const m = c.make(box, idx === 0 || idx === 4 ? hi : main, { shadow: false });
    m.position.set(x * s, y * s + 0.015, 0);
    g.add(m);
  });
  return { object: g };
};

const dial_gauge = (c) => {
  const g = spot(c, heightOf(c, 0.56), 0.005);
  const rim = c.paint(1, { roughness: 0.3, metalness: 0.75 });
  const handMat = c.paint(2, { roughness: 0.4 });
  g.add(c.make(new THREE.TorusGeometry(0.05, 0.009, 12, 32), rim, { shadow: false }));
  const hand = c.make(new THREE.BoxGeometry(0.008, 0.042, 0.006), handMat, { shadow: false });
  hand.position.set(0, 0.01, 0.005);
  g.add(hand);
  return {
    object: g,
    update(pose, time) {
      hand.rotation.z = Math.sin(time * 2.2) * 0.6 + (pose.speaking || 0) * 0.8;
    },
  };
};

const ribbon_pin = (c) => {
  const g = spot(c, heightOf(c, 0.58), 0.005);
  const rosette = c.paint(1, { roughness: 0.55 });
  const center = c.paint(2, { roughness: 0.3, metalness: 0.7 });
  g.add(c.make(starGeometry(0.048, 0.038, 12, 0.01), rosette, { shadow: false }));
  const mid = c.make(new THREE.CircleGeometry(0.026, 24), center, { shadow: false });
  mid.position.z = 0.006;
  g.add(mid);
  for (const s of [-1, 1]) {
    const tail = c.make(new THREE.BoxGeometry(0.022, 0.065, 0.006), rosette, { shadow: false });
    tail.position.set(s * 0.016, -0.048, -0.002);
    tail.rotation.z = s * 0.22;
    g.add(tail);
  }
  return { object: g };
};

export default {
  core, heart, star, bolt, badge, buttons,
  pocket_protector, sheriff_star, compass_badge, equalizer, pixel_heart, dial_gauge, ribbon_pin,
};
