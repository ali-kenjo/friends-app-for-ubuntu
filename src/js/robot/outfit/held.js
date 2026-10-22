// ---------- Items held in the robot's hand ----------
// Attached to Arm_R_Hand (or Arm_L_Hand for shields/books). Also supports temporary
// idle-behavior held items (pose.heldOverride) when no permanent held item is worn.
import * as THREE from "three";
import { starGeometry, roundedRect, plate } from "./kit.js";

function handRoot(c, { x = 0, y = -0.04, z = 0.055, rx = 0, ry = 0, rz = 0 } = {}) {
  const g = new THREE.Group();
  const s = (c.dims.arm.hand || 0.066) / 0.066;
  g.position.set(x * s, y * s, z * s);
  g.rotation.set(rx, ry, rz);
  g.scale.setScalar(s);
  return g;
}

const mug = (c) => {
  const g = handRoot(c, { y: -0.03, z: 0.075, rx: 0.15 });
  const cupMat = c.paint(1, { roughness: 0.4, physical: true });
  const rimMat = c.paint(2, { roughness: 0.5 });
  const body = c.make(new THREE.CylinderGeometry(0.044, 0.038, 0.095, 24), cupMat);
  g.add(body);
  const rim = c.make(new THREE.TorusGeometry(0.043, 0.005, 10, 24), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.046;
  g.add(rim);
  const handle = c.make(new THREE.TorusGeometry(0.026, 0.0065, 10, 20, Math.PI), cupMat);
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(-0.042, 0, 0);
  g.add(handle);
  return { object: g, parent: "Arm_R" };
};

const book = (c) => {
  const g = handRoot(c, { x: 0.02, y: -0.04, z: 0.085, rx: -0.35, ry: 0.2 });
  const cover = c.paint(1, { roughness: 0.7 });
  const pages = c.paint(2, { roughness: 0.9 });
  for (const dir of [-1, 1]) {
    const half = new THREE.Group();
    half.rotation.y = dir * 0.28;
    const cov = c.make(new THREE.BoxGeometry(0.085, 0.12, 0.008), cover);
    cov.position.x = dir * 0.042;
    half.add(cov);
    const pg = c.make(new THREE.BoxGeometry(0.08, 0.112, 0.014), pages);
    pg.position.set(dir * 0.04, 0, 0.008);
    half.add(pg);
    g.add(half);
  }
  return { object: g, parent: "Arm_R" };
};

const tablet = (c) => {
  const g = handRoot(c, { x: -0.01, y: -0.035, z: 0.08, rx: -0.3, ry: -0.15 });
  const caseMat = c.paint(1, { roughness: 0.35, metalness: 0.4 });
  const screenMat = c.glow(2, 1.3);
  g.add(c.make(plate(roundedRect(0.11, 0.15, 0.016), 0.01, 0.002), caseMat));
  const scr = c.make(new THREE.PlaneGeometry(0.094, 0.132), screenMat, { shadow: false });
  scr.position.z = 0.0065;
  g.add(scr);
  return { object: g, parent: "Arm_L" };
};

const pen = (c) => {
  const g = handRoot(c, { y: -0.03, z: 0.06, rx: 0.55, rz: 0.3 });
  const body = c.paint(1, { roughness: 0.35 });
  const tip = c.paint(2, { roughness: 0.3, metalness: 0.6 });
  g.add(c.make(new THREE.CylinderGeometry(0.009, 0.009, 0.14, 14), body));
  const cone = c.make(new THREE.ConeGeometry(0.009, 0.03, 14), tip);
  cone.rotation.x = Math.PI;
  cone.position.y = -0.085;
  g.add(cone);
  return { object: g, parent: "Arm_R" };
};

const wrench = (c) => {
  const g = handRoot(c, { y: -0.03, z: 0.06, rx: 0.3 });
  const steel = c.paint(1, { roughness: 0.3, metalness: 0.8 });
  const grip = c.paint(2, { roughness: 0.6 });
  g.add(c.make(new THREE.BoxGeometry(0.022, 0.14, 0.012), steel));
  const handle = c.make(new THREE.BoxGeometry(0.026, 0.07, 0.015), grip);
  handle.position.y = -0.03;
  g.add(handle);
  const jaw = c.make(new THREE.TorusGeometry(0.03, 0.01, 10, 20, Math.PI * 1.35), steel);
  jaw.position.y = 0.085;
  jaw.rotation.z = 0.4;
  g.add(jaw);
  return { object: g, parent: "Arm_R" };
};

const wand = (c) => {
  const g = handRoot(c, { y: -0.02, z: 0.06, rx: 0.4 });
  const starMat = c.glow(1, 1.8);
  const stickMat = c.paint(2, { roughness: 0.5 });
  const stick = c.make(new THREE.CylinderGeometry(0.007, 0.01, 0.18, 12), stickMat);
  stick.position.y = 0.04;
  g.add(stick);
  const star = c.make(starGeometry(0.042, 0.02, 5, 0.012), starMat, { shadow: false });
  star.position.y = 0.14;
  g.add(star);
  return {
    object: g,
    parent: "Arm_R",
    update(pose, time) {
      star.rotation.z = time * 1.8;
    },
  };
};

const microphone = (c) => {
  const g = handRoot(c, { y: -0.02, z: 0.065, rx: 0.35 });
  const body = c.paint(1, { roughness: 0.4, metalness: 0.5 });
  const meshMat = c.paint(2, { roughness: 0.35, metalness: 0.75 });
  g.add(c.make(new THREE.CylinderGeometry(0.014, 0.011, 0.12, 16), body));
  const head = c.make(new THREE.SphereGeometry(0.028, 20, 16), meshMat);
  head.position.y = 0.075;
  g.add(head);
  return { object: g, parent: "Arm_R" };
};

const flower_held = (c) => {
  const g = handRoot(c, { y: -0.02, z: 0.06, rx: 0.25 });
  const petalMat = c.paint(1, { roughness: 0.55 });
  const stemMat = c.paint(2, { roughness: 0.7 });
  const stem = c.make(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 10), stemMat);
  stem.position.y = 0.04;
  g.add(stem);
  const head = new THREE.Group();
  head.position.y = 0.125;
  head.rotation.x = 0.4;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = c.make(new THREE.SphereGeometry(0.022, 12, 10), petalMat);
    p.scale.set(0.8, 0.4, 1.3);
    p.position.set(Math.sin(a) * 0.028, 0, Math.cos(a) * 0.028);
    p.rotation.y = a;
    head.add(p);
  }
  head.add(c.make(new THREE.SphereGeometry(0.016, 12, 10), stemMat));
  g.add(head);
  return { object: g, parent: "Arm_R" };
};

const balloon = (c) => {
  const g = handRoot(c, { y: 0, z: 0.05 });
  const balMat = c.paint(1, { roughness: 0.2, physical: true });
  const strMat = c.paint(2, { roughness: 0.8 });
  const string = c.make(new THREE.CylinderGeometry(0.0025, 0.0025, 0.28, 8), strMat, { shadow: false });
  string.position.y = 0.14;
  g.add(string);
  const orb = c.make(new THREE.SphereGeometry(0.095, 24, 18), balMat);
  orb.scale.set(1, 1.18, 1);
  orb.position.y = 0.36;
  g.add(orb);
  return {
    object: g,
    parent: "Arm_R",
    update(pose, time) {
      orb.position.x = Math.sin(time * 1.5) * 0.015;
    },
  };
};

const lantern = (c) => {
  const g = handRoot(c, { y: -0.04, z: 0.065 });
  const glowMat = c.glow(1, 1.9);
  const frameMat = c.paint(2, { roughness: 0.4, metalness: 0.7 });
  const ring = c.make(new THREE.TorusGeometry(0.022, 0.004, 8, 18), frameMat);
  ring.position.y = 0.02;
  g.add(ring);
  const capTop = c.make(new THREE.CylinderGeometry(0.025, 0.048, 0.025, 8), frameMat);
  capTop.position.y = -0.015;
  g.add(capTop);
  const core = c.make(new THREE.CylinderGeometry(0.036, 0.032, 0.075, 12), glowMat, { shadow: false });
  core.position.y = -0.065;
  g.add(core);
  const capBot = c.make(new THREE.CylinderGeometry(0.038, 0.03, 0.018, 8), frameMat);
  capBot.position.y = -0.11;
  g.add(capBot);
  return { object: g, parent: "Arm_R" };
};

const paintbrush = (c) => {
  const g = handRoot(c, { y: -0.02, z: 0.06, rx: 0.45 });
  const tipMat = c.paint(1, { roughness: 0.5 });
  const woodMat = c.paint(2, { roughness: 0.75 });
  g.add(c.make(new THREE.CylinderGeometry(0.008, 0.011, 0.16, 12), woodMat));
  const bristles = c.make(new THREE.ConeGeometry(0.018, 0.048, 14), tipMat);
  bristles.position.y = 0.1;
  g.add(bristles);
  return { object: g, parent: "Arm_R" };
};

const gamepad = (c) => {
  const g = handRoot(c, { x: 0.02, y: -0.03, z: 0.075, rx: -0.2 });
  const body = c.paint(1, { roughness: 0.4 });
  const btn = c.paint(2, { roughness: 0.3 });
  g.add(c.make(plate(roundedRect(0.12, 0.068, 0.024), 0.022, 0.004), body));
  for (const sx of [-0.032, 0.032]) {
    const b = c.make(new THREE.CylinderGeometry(0.012, 0.012, 0.008, 14), btn);
    b.rotation.x = Math.PI / 2;
    b.position.set(sx, 0, 0.014);
    g.add(b);
  }
  return { object: g, parent: "Arm_R" };
};

const magnifying_glass = (c) => {
  const g = handRoot(c, { y: -0.02, z: 0.065, rx: 0.3 });
  const rimMat = c.paint(1, { roughness: 0.3, metalness: 0.75 });
  const glassMat = c.paint(2, { roughness: 0.1, transparent: true, opacity: 0.35 });
  const handle = c.make(new THREE.CylinderGeometry(0.009, 0.011, 0.1, 12), rimMat);
  handle.position.y = -0.02;
  g.add(handle);
  const rim = c.make(new THREE.TorusGeometry(0.048, 0.007, 12, 28), rimMat);
  rim.position.y = 0.075;
  g.add(rim);
  const lens = c.make(new THREE.CircleGeometry(0.046, 24), glassMat, { shadow: false });
  lens.position.y = 0.075;
  g.add(lens);
  return { object: g, parent: "Arm_R" };
};

const umbrella = (c) => {
  const g = handRoot(c, { y: -0.02, z: 0.05, rx: 0.1 });
  const canopyMat = c.paint(1, { roughness: 0.6, side: THREE.DoubleSide });
  const shaftMat = c.paint(2, { roughness: 0.5 });
  const shaft = c.make(new THREE.CylinderGeometry(0.006, 0.006, 0.34, 10), shaftMat);
  shaft.position.y = 0.15;
  g.add(shaft);
  const dome = c.make(new THREE.SphereGeometry(0.19, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.46), canopyMat);
  dome.position.y = 0.24;
  g.add(dome);
  return { object: g, parent: "Arm_R" };
};

const shield = (c) => {
  const g = handRoot(c, { x: 0.03, y: 0.01, z: 0.065, ry: 0.25 });
  const main = c.paint(1, { roughness: 0.35, metalness: 0.65 });
  const boss = c.paint(2, { roughness: 0.25, metalness: 0.8 });
  g.add(c.make(plate(roundedRect(0.15, 0.19, 0.045), 0.016, 0.004), main));
  const center = c.make(new THREE.SphereGeometry(0.028, 16, 12), boss);
  center.scale.z = 0.45;
  center.position.z = 0.01;
  g.add(center);
  return { object: g, parent: "Arm_L" };
};

export default {
  mug,
  book,
  tablet,
  pen,
  wrench,
  wand,
  microphone,
  flower_held,
  balloon,
  lantern,
  paintbrush,
  gamepad,
  magnifying_glass,
  umbrella,
  shield,
};
