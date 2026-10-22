// ---------- The robot's parts ----------
// The shapes the built-in robot is made of, sized by its design (design.mjs):
// the head (a superellipsoid) and its face screen, the body (a lathed profile),
// arms and hands, the "top" (fins, antennae, ears…) and the hover. model.js puts
// them together; outfit/*.js dresses them. Sizes are in meters; the robot faces +z.
import * as THREE from "three";

const lerp = (a, b, t) => a + (b - a) * t;

const HEAD_PRESETS = {
  sphere: [0.32, 0.29, 0.31, 2.05],
  tv: [0.38, 0.27, 0.28, 4.4],
  dome: [0.35, 0.28, 0.31, 2.3],
  visor_helm: [0.39, 0.23, 0.32, 3.2],
  cube: [0.34, 0.27, 0.3, 4.8],
  teardrop: [0.34, 0.28, 0.29, 2.35],
  wide_oval: [0.41, 0.23, 0.29, 2.2],
  retro_monitor: [0.39, 0.28, 0.29, 4.6],
  cat_head: [0.37, 0.26, 0.3, 2.55],
};

// ---------- Sizes ----------
// All the numbers that depend on the design, in one place, so that the clothes can fit
export function dimsOf(build) {
  const h = build.head;
  const W = build.width;
  const H = build.height;
  // roundness 0 = a rounded box, 1 = an ellipsoid
  const preset = HEAD_PRESETS[build.headShape];
  const p = preset ? preset[3] : 2 + 2.5 * Math.pow(1 - build.roundness, 1.2);
  const ha = (preset ? preset[0] : 0.36) * h;
  const hb = (preset ? preset[1] : 0.25) * h;
  const hc = (preset ? preset[2] : 0.3) * h;
  const head = { a: ha, b: hb, c: hc, p, y: 0.24 * h, shape: build.headShape || "pill" };
  head.screen = { w: 0.58 * h, h: 0.36 * h, n: 4.2, y: 0.005 * h };
  const bodyH = 0.53 * H;
  const profile = bodyProfile(build.bodyShape, W, H);
  // The shoulders sit three quarters of the way up
  const shoulderY = 0.755 * bodyH - bodyH / 2; // relative to the Body's middle
  const arm = {
    radius: 0.043,
    length: 0.13 * build.arms,
    hand: 0.066 * build.hands,
    style: build.handStyle,
  };
  const dims = {
    size: build.size,
    hover: 0.15,
    head,
    body: { h: bodyH, W, H, profile, depth: build.bodyShape === "boxy" ? 0.96 : 0.9, shape: build.bodyShape },
    neck: { y: bodyH / 2 - 0.03, r: 0.085, h: 0.09 },
    shoulder: { y: shoulderY, x: radiusAt(profile, shoulderY + bodyH / 2) + 0.035 },
    arm,
  };
  dims.headTop = (x = 0) => head.y + head.b * Math.pow(Math.max(0, 1 - Math.abs(x / head.a) ** p), 1 / p);
  // The head's front surface (z) at x and y (y measured from the Head's origin); 0 if off the head
  dims.headFront = (x, y) => {
    const inner = 1 - Math.abs(x / head.a) ** p - Math.abs((y - head.y) / head.b) ** p;
    return head.c * Math.pow(Math.max(inner, 0), 1 / p);
  };
  dims.headSide = (y, z = 0) => {
    const inner = 1 - Math.abs((y - head.y) / head.b) ** p - Math.abs(z / head.c) ** p;
    return head.a * Math.pow(Math.max(inner, 0), 1 / p);
  };
  // The body's radius at a height above its bottom, and its front depth there
  dims.bodyRadius = (yAbove) => radiusAt(profile, yAbove);
  return dims;
}

// ---------- Shapes ----------
// |x/a|^p + |y/b|^p + |z/c|^p = 1: a sphere pushed out into a rounded box
export function superellipsoid(a, b, c, p, widthSegments = 72, heightSegments = 48) {
  const geo = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = Math.pow(Math.abs(v.x) ** p + Math.abs(v.y) ** p + Math.abs(v.z) ** p, -1 / p);
    pos.setXYZ(i, v.x * k * a, v.y * k * b, v.z * k * c);
  }
  geo.computeVertexNormals();
  return geo;
}

// The face screen: a squircle-shaped patch lying on the head's front surface,
// with texture coordinates running evenly across it
export function faceScreen(head) {
  const { a, b, c, p } = head;
  const { w, h, n, y: dy } = head.screen;
  const segX = 56;
  const segY = 36;
  const positions = [];
  const uvs = [];
  for (let j = 0; j <= segY; j++) {
    for (let i = 0; i <= segX; i++) {
      const s = (i / segX) * 2 - 1;
      const t = (j / segY) * 2 - 1;
      const r = Math.max(Math.abs(s), Math.abs(t));
      let x = 0;
      let y = 0;
      if (r > 0) {
        const dx = s / r;
        const dyy = t / r;
        const k = Math.pow(Math.abs(dx) ** n + Math.abs(dyy) ** n, -1 / n);
        x = r * dx * k * (w / 2);
        y = r * dyy * k * (h / 2);
      }
      const inner = 1 - Math.abs(x / a) ** p - Math.abs((y + dy) / b) ** p;
      const z = c * Math.pow(Math.max(inner, 0), 1 / p) + 0.004;
      positions.push(x, y + dy, z);
      uvs.push(x / w + 0.5, y / h + 0.5);
    }
  }
  const index = [];
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a0 = j * (segX + 1) + i;
      const b0 = a0 + 1;
      const c0 = a0 + segX + 1;
      const d0 = c0 + 1;
      index.push(a0, b0, d0, a0, d0, c0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

// A smooth profile turned around the y axis. points: [radius, height] from bottom to top
export function lathe(points, segments = 56) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

// A profile through a few control points, smoothed into many
export function smoothProfile(controls, count = 44) {
  const curve = new THREE.SplineCurve(controls.map(([r, y]) => new THREE.Vector2(r, y)));
  return curve.getPoints(count).map((v) => [Math.max(0, v.x), v.y]);
}

// ---------- The body ----------
const BODY_CONTROLS = {
  bean: [[0, 0], [0.13, 0.012], [0.225, 0.07], [0.262, 0.19], [0.245, 0.33], [0.195, 0.45], [0.1, 0.515], [0, 0.53]],
  egg: [[0, 0], [0.1, 0.01], [0.19, 0.06], [0.245, 0.16], [0.265, 0.27], [0.24, 0.38], [0.17, 0.47], [0.085, 0.52], [0, 0.535]],
  capsule: [[0, 0], [0.11, 0.008], [0.19, 0.035], [0.222, 0.09], [0.228, 0.2], [0.228, 0.34], [0.21, 0.43], [0.16, 0.495], [0.08, 0.525], [0, 0.532]],
  pear: [[0, 0], [0.13, 0.01], [0.235, 0.06], [0.29, 0.16], [0.285, 0.26], [0.22, 0.37], [0.145, 0.46], [0.085, 0.515], [0, 0.53]],
  hourglass: [[0, 0], [0.14, 0.015], [0.26, 0.1], [0.25, 0.18], [0.18, 0.27], [0.25, 0.37], [0.23, 0.45], [0.11, 0.515], [0, 0.53]],
  teardrop: [[0, 0], [0.15, 0.015], [0.28, 0.09], [0.3, 0.18], [0.25, 0.3], [0.18, 0.41], [0.11, 0.49], [0, 0.53]],
  barrel: [[0, 0], [0.16, 0.01], [0.25, 0.05], [0.275, 0.18], [0.28, 0.27], [0.275, 0.37], [0.24, 0.47], [0.12, 0.52], [0, 0.53]],
  bell: [[0, 0], [0.26, 0.015], [0.29, 0.08], [0.26, 0.2], [0.22, 0.33], [0.18, 0.44], [0.1, 0.51], [0, 0.53]],
  diamond: [[0, 0], [0.09, 0.02], [0.18, 0.12], [0.29, 0.26], [0.21, 0.39], [0.12, 0.48], [0, 0.53]],
  boxy: [[0, 0], [0.2, 0.01], [0.235, 0.04], [0.24, 0.2], [0.24, 0.36], [0.23, 0.48], [0.12, 0.52], [0, 0.53]],
};

function ballControls() {
  const R = 0.268;
  const points = [[0, 0]];
  for (let i = 1; i < 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI;
    points.push([R * Math.cos(a), R + R * Math.sin(a)]);
  }
  points.push([0, 2 * R]);
  return points;
}

// The body's outline, widened by `W` and stretched by `H` (a list of [radius, height])
export function bodyProfile(shape, W = 1, H = 1) {
  const controls = shape === "ball" ? ballControls() : BODY_CONTROLS[shape] || BODY_CONTROLS.bean;
  return smoothProfile(controls).map(([r, y]) => [r * W, y * H]);
}

function radiusAt(profile, y) {
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1];
    const [r1, y1] = profile[i];
    if (y >= y0 && y <= y1) return lerp(r0, r1, y1 === y0 ? 0 : (y - y0) / (y1 - y0));
  }
  return profile.at(-1)?.[0] || 0;
}

export function bodyGeometry(dims) {
  const segs = dims.body.shape === "boxy" ? 24 : 60;
  const geo = lathe(dims.body.profile, segs);
  geo.scale(1, 1, dims.body.depth);
  return geo;
}

// ---------- The top: fins, antennae, ears… ----------
// Each side is a group named Fin_L / Fin_R (the animator perks and glows them), with a
// glowing part named like "Fin_L_Light". `shell` is the head's material, `glow` the
// side's light, `joint` the dark one. Returns [left, right].
export function buildTop(style, k, dims, m, make) {
  const { head } = dims;
  const side = (name, s, glow) => {
    const g = new THREE.Group();
    g.name = name;
    const light = (geometry, x = 0, y = 0, z = 0) => {
      const tip = make(geometry, glow, { shadow: false });
      tip.name = `${name}_Light`;
      tip.position.set(x, y, z);
      return tip;
    };
    // Where the top sits: on the head's upper corner, a little behind the middle
    const at = (xFrac, down = 0.02) => {
      const x = s * xFrac * head.a;
      g.position.set(x, dims.headTop(x) - down * k, -0.03 * (head.c / 0.3));
    };
    switch (style) {
      case "fins": {
        at(0.69, 0.025);
        g.rotation.z = -s * 0.35;
        const profile = smoothProfile([[0, 0], [0.04, 0.004], [0.042, 0.05], [0.052, 0.1], [0.045, 0.14], [0.022, 0.168], [0, 0.172]], 36);
        const base = lathe(profile.filter(([, y]) => y <= 0.092).concat([[0.05, 0.092]]), 36);
        const tip = lathe([[0.0495, 0.088], ...profile.filter(([, y]) => y > 0.092)], 36);
        for (const geo of [base, tip]) geo.scale(k, k, 0.55 * k);
        g.add(make(base, m.head));
        const l = make(tip, glow, { shadow: false });
        l.name = `${name}_Light`;
        g.add(l);
        break;
      }
      case "antenna": {
        if (s < 0) break; // one antenna in the middle (Fin_L); Fin_R stays empty
        g.position.set(0, dims.headTop(0) - 0.01, -0.02);
        g.add(make(new THREE.CylinderGeometry(0.009 * k, 0.012 * k, 0.15 * k, 16), m.joint, { shadow: false }).translateY(0.075 * k));
        g.add(light(new THREE.SphereGeometry(0.034 * k, 24, 18), 0, 0.165 * k, 0));
        break;
      }
      case "twin": {
        at(0.55, 0.01);
        g.rotation.z = -s * 0.42;
        g.add(make(new THREE.CylinderGeometry(0.008 * k, 0.011 * k, 0.17 * k, 14), m.joint, { shadow: false }).translateY(0.085 * k));
        g.add(light(new THREE.SphereGeometry(0.03 * k, 24, 18), 0, 0.185 * k, 0));
        break;
      }
      case "cat": {
        at(0.6, 0.04);
        g.rotation.z = -s * 0.3;
        const ear = new THREE.ConeGeometry(0.105 * k, 0.19 * k, 4, 1);
        ear.rotateY(Math.PI / 4);
        ear.scale(1, 1, 0.42);
        g.add(make(ear, m.head).translateY(0.075 * k));
        const inner = new THREE.ConeGeometry(0.066 * k, 0.12 * k, 4, 1);
        inner.rotateY(Math.PI / 4);
        inner.scale(1, 1, 0.4);
        g.add(light(inner, 0, 0.058 * k, 0.022 * k));
        break;
      }
      case "fox": {
        at(0.64, 0.035);
        g.rotation.z = -s * 0.38;
        const ear = new THREE.ConeGeometry(0.095 * k, 0.25 * k, 4, 1);
        ear.rotateY(Math.PI / 4);
        ear.scale(1, 1, 0.38);
        g.add(make(ear, m.head).translateY(0.11 * k));
        const inner = new THREE.ConeGeometry(0.055 * k, 0.17 * k, 4, 1);
        inner.rotateY(Math.PI / 4);
        inner.scale(1, 1, 0.35);
        g.add(light(inner, 0, 0.09 * k, 0.02 * k));
        break;
      }
      case "bear": {
        at(0.74, 0.04);
        g.rotation.z = -s * 0.5;
        const ear = new THREE.SphereGeometry(0.07 * k, 28, 20);
        ear.scale(1, 1, 0.55);
        g.add(make(ear, m.head).translateY(0.04 * k));
        const inner = new THREE.CircleGeometry(0.04 * k, 24);
        g.add(light(inner, 0, 0.04 * k, 0.04 * k));
        break;
      }
      case "puppy": {
        at(0.78, 0.02);
        g.rotation.z = -s * 0.85;
        const ear = new THREE.CapsuleGeometry(0.042 * k, 0.14 * k, 6, 18);
        ear.scale(1, 1, 0.36);
        g.add(make(ear, m.head).translateY(0.06 * k));
        g.add(light(new THREE.SphereGeometry(0.024 * k, 16, 12), 0, 0.12 * k, 0.015 * k));
        break;
      }
      case "bunny": {
        at(0.46, 0.03);
        g.rotation.z = -s * 0.2;
        const ear = new THREE.CapsuleGeometry(0.045 * k, 0.17 * k, 8, 22);
        ear.scale(1, 1, 0.38);
        g.add(make(ear, m.head).translateY(0.12 * k));
        const inner = new THREE.CapsuleGeometry(0.026 * k, 0.14 * k, 6, 16);
        inner.scale(1, 1, 0.3);
        g.add(light(inner, 0, 0.12 * k, 0.019 * k));
        break;
      }
      case "axolotl": {
        at(0.84, 0.06);
        g.rotation.z = -s * 0.65;
        for (let i = 0; i < 3; i++) {
          const gill = new THREE.CapsuleGeometry(0.018 * k, 0.09 * k, 5, 12);
          const mesh = light(gill, s * i * 0.02 * k, (0.04 + i * 0.035) * k, 0);
          mesh.rotation.z = -s * (0.2 + i * 0.22);
          g.add(mesh);
        }
        break;
      }
      case "sprout": {
        if (s < 0) break; // one sprout in the middle; both leaves hang on Fin_L
        g.position.set(0, dims.headTop(0) - 0.01, -0.02);
        g.add(make(new THREE.CylinderGeometry(0.007 * k, 0.01 * k, 0.08 * k, 12), m.joint, { shadow: false }).translateY(0.04 * k));
        for (const dir of [1, -1]) {
          const leaf = new THREE.SphereGeometry(0.05 * k, 20, 14);
          leaf.scale(1, 0.34, 0.7);
          const mesh = light(leaf, dir * 0.052 * k, 0.1 * k, 0);
          mesh.rotation.z = dir * 0.55;
          g.add(mesh);
        }
        break;
      }
      case "horns": {
        at(0.55, 0.04);
        g.rotation.z = -s * 0.42;
        const horn = new THREE.ConeGeometry(0.058 * k, 0.2 * k, 20, 1);
        g.add(make(horn, m.joint).translateY(0.095 * k));
        g.add(light(new THREE.SphereGeometry(0.02 * k, 14, 10), 0, 0.2 * k, 0));
        break;
      }
      case "halo_ant": {
        if (s < 0) break;
        g.position.set(0, dims.headTop(0) - 0.01, -0.02);
        g.add(make(new THREE.CylinderGeometry(0.008 * k, 0.01 * k, 0.09 * k, 12), m.joint, { shadow: false }).translateY(0.045 * k));
        const ring = new THREE.TorusGeometry(0.095 * k, 0.016 * k, 14, 36);
        ring.rotateX(Math.PI / 2);
        g.add(light(ring, 0, 0.12 * k, 0));
        break;
      }
      case "dish": {
        if (s < 0) break;
        g.position.set(0.08 * head.a, dims.headTop(0.08 * head.a) - 0.01, -0.02);
        g.add(make(new THREE.CylinderGeometry(0.01 * k, 0.014 * k, 0.07 * k, 12), m.joint).translateY(0.035 * k));
        const dish = new THREE.SphereGeometry(0.075 * k, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
        dish.rotateX(Math.PI * 0.75);
        g.add(make(dish, m.head).translateY(0.09 * k));
        g.add(light(new THREE.SphereGeometry(0.018 * k, 14, 10), 0, 0.12 * k, 0.03 * k));
        break;
      }
      case "unicorn": {
        if (s < 0) break;
        g.position.set(0, dims.headTop(0) - 0.02, 0.06 * (head.c / 0.3));
        g.rotation.x = 0.28;
        const horn = new THREE.ConeGeometry(0.042 * k, 0.22 * k, 20, 1);
        g.add(light(horn, 0, 0.11 * k, 0));
        break;
      }
      case "bolts": {
        at(0.86, 0.08);
        g.rotation.z = -s * 1.15;
        g.add(make(new THREE.CylinderGeometry(0.018 * k, 0.018 * k, 0.06 * k, 12), m.joint).translateY(0.03 * k));
        g.add(light(new THREE.CylinderGeometry(0.032 * k, 0.032 * k, 0.024 * k, 6), 0, 0.07 * k, 0));
        break;
      }
      case "crown_spikes": {
        at(0.45, 0.02);
        g.rotation.z = -s * 0.25;
        for (let i = 0; i < 2; i++) {
          const spike = new THREE.ConeGeometry(0.032 * k, 0.11 * k, 6);
          g.add(light(spike, (i - 0.5) * 0.05 * k, 0.055 * k, 0));
        }
        break;
      }
      default:
        return null;
    }
    return g;
  };
  const L = side("Fin_L", 1, m.finGlowL);
  const R = side("Fin_R", -1, m.finGlowR);
  return [L, R].filter(Boolean);
}

// ---------- Arms and hands ----------
export function buildArm(name, side, dims, m, make) {
  const { arm } = dims;
  const a = new THREE.Group();
  a.name = name;
  a.position.set(side * dims.shoulder.x, dims.shoulder.y, 0);
  a.add(make(new THREE.SphereGeometry(0.052, 28, 18), m.joint));
  const total = arm.length + arm.radius * 2;
  const upper = make(new THREE.CapsuleGeometry(arm.radius, arm.length, 8, 20), m.arms);
  upper.position.y = 0.008 - total / 2;
  a.add(upper);
  const bottom = 0.008 - total;
  const hand = buildHand(arm.style, arm.hand, m, make);
  hand.name = `${name}_Hand`;
  hand.position.y = bottom - 0.017 * (arm.hand / 0.066);
  a.add(hand);
  return a;
}

function buildHand(style, r, m, make) {
  const g = new THREE.Group();
  const s = r / 0.066;
  switch (style) {
    case "ball": {
      g.add(make(new THREE.SphereGeometry(r * 0.9, 28, 20), m.arms));
      break;
    }
    case "mitten": {
      const palm = new THREE.SphereGeometry(r, 28, 20);
      palm.scale(0.95, 1.2, 0.8);
      g.add(make(palm, m.arms));
      const thumb = make(new THREE.SphereGeometry(r * 0.42, 20, 14), m.arms);
      thumb.position.set(0.8 * r, 0.25 * r, 0.1 * r);
      g.add(thumb);
      break;
    }
    case "pincer": {
      const wrist = make(new THREE.SphereGeometry(r * 0.55, 20, 14), m.arms);
      g.add(wrist);
      for (const dir of [1, -1]) {
        const claw = new THREE.CapsuleGeometry(r * 0.3, r * 1.2, 6, 14);
        const mesh = make(claw, m.arms);
        mesh.position.set(dir * r * 0.5, -r * 0.8, 0);
        mesh.rotation.z = dir * 0.28;
        g.add(mesh);
      }
      break;
    }
    case "three_finger": {
      const palm = new THREE.SphereGeometry(r * 0.78, 24, 16);
      palm.scale(1, 0.85, 0.65);
      g.add(make(palm, m.arms));
      for (const i of [-1, 0, 1]) {
        const f = make(new THREE.CapsuleGeometry(r * 0.2, r * 0.65, 5, 10), m.arms);
        f.position.set(i * r * 0.45, -r * 0.75, 0);
        f.rotation.z = i * 0.15;
        g.add(f);
      }
      break;
    }
    case "paw": {
      const pad = new THREE.SphereGeometry(r * 0.95, 24, 18);
      pad.scale(1.05, 0.95, 0.75);
      g.add(make(pad, m.arms));
      for (const i of [-1, 0, 1]) {
        const toe = make(new THREE.SphereGeometry(r * 0.32, 14, 10), m.joint);
        toe.position.set(i * r * 0.48, -r * 0.65, r * 0.35);
        g.add(toe);
      }
      break;
    }
    case "claw": {
      g.add(make(new THREE.CylinderGeometry(r * 0.5, r * 0.65, r * 0.5, 16), m.joint));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const prong = make(new THREE.ConeGeometry(r * 0.22, r * 1.2, 8), m.arms);
        prong.position.set(Math.cos(a) * r * 0.45, -r * 0.7, Math.sin(a) * r * 0.45);
        prong.rotation.x = Math.PI;
        g.add(prong);
      }
      break;
    }
    case "magnet": {
      const u = make(new THREE.TorusGeometry(r * 0.68, r * 0.26, 12, 24, Math.PI), m.arms);
      u.rotation.z = Math.PI;
      g.add(u);
      for (const dir of [-1, 1]) {
        const tip = make(new THREE.CylinderGeometry(r * 0.26, r * 0.26, r * 0.4, 12), m.ring, { shadow: false });
        tip.position.set(dir * r * 0.68, -r * 0.2, 0);
        g.add(tip);
      }
      break;
    }
    case "blade": {
      const fin = new THREE.ConeGeometry(r * 0.65, r * 1.8, 4);
      fin.scale(0.35, 1, 1);
      fin.rotateX(Math.PI);
      const mesh = make(fin, m.arms);
      mesh.position.y = -r * 0.6;
      g.add(mesh);
      break;
    }
    default: {
      const hand = new THREE.SphereGeometry(0.066 * s, 32, 22);
      hand.scale(0.82, 1.12, 0.56);
      g.add(make(hand, m.arms));
    }
  }
  return g;
}

// ---------- The hover ----------
export function buildHover(style, dims, m, make) {
  const g = new THREE.Group();
  g.name = "HoverRing";
  const k = dims.body.W;
  const ring = (radius, y, tube = 0.019, seg = 64) => {
    const mesh = make(new THREE.TorusGeometry(radius, tube, 16, seg), m.ring, { shadow: false });
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = y;
    return mesh;
  };
  switch (style) {
    case "ring":
      g.add(ring(0.16 * k, -0.03));
      break;
    case "double":
      g.add(ring(0.17 * k, -0.03, 0.016), ring(0.12 * k, -0.085, 0.014));
      break;
    case "jets":
      for (const x of [-0.1, 0.1]) {
        const nozzle = make(new THREE.CylinderGeometry(0.05, 0.036, 0.05, 24), m.joint);
        nozzle.position.set(x * k, -0.015, 0);
        g.add(nozzle);
        const flame = make(new THREE.ConeGeometry(0.036, 0.1, 24, 1, true), m.ring, { shadow: false });
        flame.rotation.x = Math.PI;
        flame.position.set(x * k, -0.09, 0);
        g.add(flame);
      }
      break;
    case "cloud_pad": {
      const base = make(new THREE.SphereGeometry(0.17 * k, 24, 16), m.head);
      base.scale.set(1.2, 0.35, 1.1);
      base.position.y = -0.05;
      g.add(base);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const puff = make(new THREE.SphereGeometry(0.075 * k, 16, 12), m.head);
        puff.position.set(Math.cos(a) * 0.14 * k, -0.05, Math.sin(a) * 0.13 * k);
        g.add(puff);
      }
      g.add(ring(0.14 * k, -0.09, 0.012));
      break;
    }
    case "saucer": {
      const disc = make(new THREE.CylinderGeometry(0.22 * k, 0.14 * k, 0.04, 32), m.joint);
      disc.position.y = -0.04;
      g.add(disc);
      g.add(ring(0.22 * k, -0.04, 0.014));
      break;
    }
    case "propeller_base": {
      const hub = make(new THREE.CylinderGeometry(0.04, 0.03, 0.06, 16), m.joint);
      hub.position.y = -0.04;
      g.add(hub);
      for (let i = 0; i < 3; i++) {
        const blade = make(new THREE.BoxGeometry(0.28 * k, 0.008, 0.045), m.ring, { shadow: false });
        blade.position.y = -0.065;
        blade.rotation.y = (i / 3) * Math.PI;
        g.add(blade);
      }
      break;
    }
    case "star_ring":
      g.add(ring(0.18 * k, -0.035, 0.018, 5));
      g.add(ring(0.12 * k, -0.075, 0.012, 5));
      break;
    case "lotus": {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const petal = new THREE.SphereGeometry(0.065 * k, 14, 10);
        petal.scale(0.6, 0.25, 1.4);
        const mesh = make(petal, m.ring, { shadow: false });
        mesh.position.set(Math.cos(a) * 0.14 * k, -0.04, Math.sin(a) * 0.14 * k);
        mesh.rotation.y = -a + Math.PI / 2;
        mesh.rotation.x = -0.25;
        g.add(mesh);
      }
      break;
    }
    case "wheels": {
      for (const x of [-0.14, 0.14]) {
        const wheel = make(new THREE.CylinderGeometry(0.065, 0.065, 0.036, 24), m.joint);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x * k, -0.05, 0);
        g.add(wheel);
        const rim = make(new THREE.TorusGeometry(0.042, 0.008, 10, 20), m.ring, { shadow: false });
        rim.rotation.y = Math.PI / 2;
        rim.position.set((x + Math.sign(x) * 0.019) * k, -0.05, 0);
        g.add(rim);
      }
      break;
    }
    case "stubby_legs": {
      for (const x of [-0.1, 0.1]) {
        const leg = make(new THREE.CapsuleGeometry(0.038, 0.05, 6, 14), m.arms);
        leg.position.set(x * k, -0.045, 0.01);
        g.add(leg);
      }
      break;
    }
    default:
      return null;
  }
  return g;
}
