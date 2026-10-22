// Things worn on the sides of the head: headphones, a headset with a microphone, earmuffs.
import * as THREE from "three";

// The band over the head, from one ear to the other: it goes back as it rises, so it
// passes behind the fins instead of through them
function band(c, material, thickness = 0.013) {
  const { head } = c.dims;
  const side = c.dims.headSide(head.y, 0) + 0.02;
  const rise = head.b + 0.012;
  const points = [];
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * Math.PI;
    points.push(new THREE.Vector3(Math.cos(t) * side, head.y + Math.sin(t) * rise, -Math.sin(t) * 0.05 * (head.c / 0.3)));
  }
  return c.make(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, thickness, 10), material, { shadow: false });
}

// One ear cup: a flat cylinder facing the head, with a soft cushion on the inner side
function cup(c, side, shell, cushion, radius = 0.072) {
  const { head } = c.dims;
  const x = c.dims.headSide(head.y, 0) + 0.022;
  const g = new THREE.Group();
  g.position.set(side * x, head.y, 0);
  const hs = head.a / 0.36;
  const r = radius * hs;
  const outer = c.make(new THREE.CylinderGeometry(r, r, 0.05, 40), shell);
  outer.rotation.z = Math.PI / 2;
  g.add(outer);
  const pad = c.make(new THREE.TorusGeometry(r * 0.88, 0.017, 14, 40), cushion);
  pad.rotation.y = Math.PI / 2;
  pad.position.x = -side * 0.027;
  g.add(pad);
  return g;
}

const headphones = (c) => {
  const g = new THREE.Group();
  const shell = c.paint(1, { roughness: 0.4, metalness: 0.15 });
  const cushion = c.paint(2, { roughness: 0.7 });
  g.add(band(c, shell));
  g.add(cup(c, 1, shell, cushion), cup(c, -1, shell, cushion));
  return { object: g };
};

const headset = (c) => {
  const g = new THREE.Group();
  const shell = c.paint(1, { roughness: 0.4, metalness: 0.15 });
  const cushion = c.paint(2, { roughness: 0.7 });
  g.add(band(c, shell));
  const left = cup(c, 1, shell, cushion);
  g.add(left, cup(c, -1, shell, cushion));
  // The boom: from the cup forward and down to the corner of the mouth
  const { head } = c.dims;
  const hs = head.a / 0.36;
  const x0 = left.position.x - 0.01;
  const mouthY = head.y + head.screen.y - 0.3 * head.screen.w * 0.5;
  const tipZ = c.dims.headFront(0.1 * hs, mouthY) + 0.035;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x0, head.y - 0.02, 0.01),
    new THREE.Vector3(x0 + 0.015, head.y - 0.075, tipZ * 0.55),
    new THREE.Vector3(x0 - 0.05, mouthY - 0.01, tipZ - 0.03),
    new THREE.Vector3(0.095 * hs, mouthY, tipZ),
  ]);
  g.add(c.make(new THREE.TubeGeometry(curve, 28, 0.0052, 8), shell, { shadow: false }));
  const capsule = c.make(new THREE.CapsuleGeometry(0.0125, 0.02, 6, 14), cushion, { shadow: false });
  capsule.position.set(0.095 * hs, mouthY, tipZ);
  capsule.rotation.z = Math.PI / 2;
  g.add(capsule);
  return { object: g };
};

const earmuffs = (c) => {
  const g = new THREE.Group();
  const shell = c.paint(1, { roughness: 0.5 });
  const fluff = c.paint(2, { roughness: 1 });
  g.add(band(c, shell, 0.011));
  const { head } = c.dims;
  const hs = head.a / 0.36;
  for (const s of [1, -1]) {
    const x = c.dims.headSide(head.y, 0) + 0.03;
    const puff = new THREE.SphereGeometry(1, 36, 24);
    puff.scale(0.04, 0.085 * hs, 0.085 * hs);
    const m = c.make(puff, fluff);
    m.position.set(s * x, head.y, 0);
    g.add(m);
    // a rim of tufts
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const tuft = c.make(new THREE.SphereGeometry(0.02 * hs, 12, 10), fluff);
      tuft.position.set(s * (x + 0.0), head.y + Math.sin(a) * 0.082 * hs, Math.cos(a) * 0.082 * hs);
      g.add(tuft);
    }
  }
  return { object: g };
};

const cat_headphones = (c) => {
  const g = new THREE.Group();
  const shell = c.paint(1, { roughness: 0.4, metalness: 0.15 });
  const neon = c.glow(2, 1.5);
  g.add(band(c, shell));
  g.add(cup(c, 1, shell, neon), cup(c, -1, shell, neon));
  const { head } = c.dims;
  const hs = head.a / 0.36;
  for (const s of [-1, 1]) {
    const ear = c.make(new THREE.ConeGeometry(0.055 * hs, 0.095 * hs, 4), shell);
    ear.position.set(s * 0.19 * hs, head.y + head.b + 0.025 * hs, -0.03 * hs);
    ear.rotation.z = -s * 0.45;
    ear.rotation.y = Math.PI / 4;
    g.add(ear);
    const inner = c.make(new THREE.ConeGeometry(0.032 * hs, 0.06 * hs, 4), neon, { shadow: false });
    inner.position.set(s * 0.19 * hs, head.y + head.b + 0.02 * hs, -0.015 * hs);
    inner.rotation.z = -s * 0.45;
    inner.rotation.y = Math.PI / 4;
    g.add(inner);
  }
  return { object: g };
};

const flower_crown = (c) => {
  const g = new THREE.Group();
  const { head } = c.dims;
  const hs = head.a / 0.36;
  const petal = c.paint(1, { roughness: 0.6 });
  const vine = c.paint(2, { roughness: 0.75 });
  const ring = c.make(new THREE.TorusGeometry(0.24 * hs, 0.012 * hs, 10, 40), vine);
  ring.rotation.x = Math.PI / 2 - 0.12;
  ring.position.set(0, head.y + head.b * 0.72, 0.01);
  g.add(ring);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const fl = c.make(new THREE.SphereGeometry(0.032 * hs, 14, 10), petal);
    fl.position.set(Math.sin(a) * 0.24 * hs, head.y + head.b * 0.72 - Math.cos(a) * 0.028 * hs, Math.cos(a) * 0.24 * hs + 0.01);
    g.add(fl);
  }
  return { object: g };
};

const laurel_wreath = (c) => {
  const g = new THREE.Group();
  const { head } = c.dims;
  const hs = head.a / 0.36;
  const gold = c.paint(1, { roughness: 0.25, metalness: 0.85 });
  const stem = c.paint(2, { roughness: 0.4, metalness: 0.6 });
  const ring = c.make(new THREE.TorusGeometry(0.245 * hs, 0.008 * hs, 10, 40, Math.PI * 1.75), stem);
  ring.rotation.x = Math.PI / 2 - 0.14;
  ring.rotation.z = -Math.PI * 0.375;
  ring.position.set(0, head.y + head.b * 0.68, 0);
  g.add(ring);
  for (let i = 0; i < 12; i++) {
    const a = -2.3 + (i / 11) * 4.6;
    const leaf = c.make(new THREE.SphereGeometry(0.028 * hs, 12, 8), gold);
    leaf.scale.set(0.5, 0.3, 1.3);
    leaf.position.set(Math.sin(a) * 0.245 * hs, head.y + head.b * 0.68, Math.cos(a) * 0.245 * hs);
    leaf.rotation.y = a + Math.PI / 2;
    g.add(leaf);
  }
  return { object: g };
};

const sweatband = (c) => {
  const g = new THREE.Group();
  const { head } = c.dims;
  const hs = head.a / 0.36;
  const main = c.paint(1, { roughness: 0.9 });
  const stripe = c.paint(2, { roughness: 0.9 });
  const y = head.y + head.b * 0.62;
  const bandMesh = c.make(new THREE.TorusGeometry(0.255 * hs, 0.022 * hs, 12, 48), main);
  bandMesh.rotation.x = Math.PI / 2;
  bandMesh.scale.set(1.08, 0.86, 1);
  bandMesh.position.y = y;
  g.add(bandMesh);
  const mid = c.make(new THREE.TorusGeometry(0.257 * hs, 0.008 * hs, 10, 48), stripe);
  mid.rotation.x = Math.PI / 2;
  mid.scale.set(1.08, 0.86, 1);
  mid.position.y = y;
  g.add(mid);
  return { object: g };
};

const pilot_goggles = (c) => {
  const g = new THREE.Group();
  const { head } = c.dims;
  const hs = head.a / 0.36;
  const brass = c.paint(1, { roughness: 0.35, metalness: 0.7 });
  const lens = c.paint(2, { roughness: 0.15, transparent: true, opacity: 0.55 });
  const y = head.y + head.b * 0.68;
  const strap = c.make(new THREE.TorusGeometry(0.25 * hs, 0.014 * hs, 10, 44), brass);
  strap.rotation.x = Math.PI / 2 - 0.15;
  strap.scale.set(1.06, 0.85, 1);
  strap.position.y = y;
  g.add(strap);
  for (const s of [-1, 1]) {
    const rim = c.make(new THREE.CylinderGeometry(0.052 * hs, 0.052 * hs, 0.028 * hs, 24), brass);
    rim.rotation.x = Math.PI / 2 - 0.25;
    rim.position.set(s * 0.075 * hs, y + 0.02 * hs, 0.215 * hs);
    g.add(rim);
    const glass = c.make(new THREE.CircleGeometry(0.044 * hs, 20), lens, { shadow: false });
    glass.position.set(s * 0.075 * hs, y + 0.024 * hs, 0.23 * hs);
    glass.rotation.x = -0.25;
    g.add(glass);
  }
  return { object: g };
};

const antlers = (c) => {
  const g = new THREE.Group();
  const { head } = c.dims;
  const hs = head.a / 0.36;
  const wood = c.paint(1, { roughness: 0.85 });
  const tip = c.paint(2, { roughness: 0.7 });
  for (const s of [-1, 1]) {
    const root = new THREE.Group();
    root.position.set(s * 0.17 * hs, dimsTopY(c, s * 0.17 * hs) - 0.01, -0.02);
    root.rotation.z = -s * 0.35;
    root.add(c.make(new THREE.CapsuleGeometry(0.016 * hs, 0.16 * hs, 6, 12), wood).translateY(0.08 * hs));
    for (const [y, dir, len] of [[0.06, 0.7, 0.07], [0.12, -0.6, 0.065], [0.16, 0.5, 0.055]]) {
      const tine = c.make(new THREE.CapsuleGeometry(0.011 * hs, len * hs, 5, 10), tip);
      tine.position.set(s * dir * 0.03 * hs, y * hs, 0);
      tine.rotation.z = -s * dir;
      root.add(tine);
    }
    g.add(root);
  }
  return { object: g };
};

function dimsTopY(c, x) {
  return c.dims.headTop(x);
}

export default { headphones, headset, earmuffs, cat_headphones, flower_crown, laurel_wreath, sweatband, pilot_goggles, antlers };
