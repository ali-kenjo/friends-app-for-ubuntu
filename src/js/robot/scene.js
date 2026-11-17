// ---------- Where the robot stands ----------
// Soft three-point light (a key, a fill, a rim from behind; their colors and
// strength follow the room's lighting mood), room reflections for the glossy
// screen, a soft contact shadow so the floating robot still feels grounded,
// and a glow under its hover ring. The set of each place is made by room3d.js;
// the flat backdrops (including chroma green and blue) are painted by the
// engine's last pass, so their colors come out exact.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { LIGHT_MOODS } from "./room.mjs";
import { MOOD_BY_ID } from "../room/choices.mjs";

// A soft round spot: a canvas gradient, big and blurry on purpose (no fine detail)
export function radialTexture(stops, size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const KEY_AT = { x: -1.6, y: 2.8, z: 2.6 };

export class Stage {
  constructor(renderer) {
    this.scene = new THREE.Scene();
    this.renderer = renderer;
    this.disposables = [];

    // Reflections: a neutral room, blurred for rough surfaces
    this.makeEnvironment();

    // Key: warm, from above left and in front; it casts the soft shadows
    this.key = new THREE.DirectionalLight("#fff1e0", 1.75);
    this.key.position.set(KEY_AT.x, KEY_AT.y, KEY_AT.z);
    this.key.target.position.set(0, 0.6, 0);
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = 4;
    Object.assign(this.key.shadow.camera, { left: -1.1, right: 1.1, top: 1.6, bottom: -0.4, near: 0.5, far: 8 });
    // Fill: cool and soft from the other side
    this.fill = new THREE.DirectionalLight("#dfe8ff", 0.55);
    this.fill.position.set(2.2, 1.2, 2.0);
    this.fill.target.position.set(0, 0.6, 0);
    // Rim: from behind, so the shell's edges catch a line of light
    this.rim = new THREE.DirectionalLight("#ffffff", 1.5);
    this.rim.position.set(0.8, 2.2, -2.6);
    this.rim.target.position.set(0, 0.7, 0);
    this.scene.add(this.key, this.key.target, this.fill, this.fill.target, this.rim, this.rim.target);
    // Bounce light: the sky's color from above, the floor's from below (a cheap global-illumination feel);
    // off until a room asks for it, so the 1.0 places look as they did
    this.hemi = new THREE.HemisphereLight("#d9e2ff", "#6b4a3a", 0);
    this.scene.add(this.hemi);
    this.roomBounds = null;

    // The soft shadow right under it, and the ring's glow on the floor
    const shadowTexture = radialTexture([[0, "rgba(0,0,0,0.62)"], [0.45, "rgba(0,0,0,0.3)"], [1, "rgba(0,0,0,0)"]]);
    this.contact = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9),
      new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, toneMapped: false })
    );
    this.contact.rotation.x = -Math.PI / 2;
    this.contact.position.y = 0.002;
    this.contact.renderOrder = 1;
    const glowTexture = radialTexture([[0, "rgba(255,255,255,0.55)"], [0.35, "rgba(255,255,255,0.22)"], [1, "rgba(255,255,255,0)"]]);
    this.floorGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.8),
      new THREE.MeshBasicMaterial({ map: glowTexture, color: "#6f9cf5", transparent: true, depthWrite: false, toneMapped: false })
    );
    this.floorGlow.rotation.x = -Math.PI / 2;
    this.floorGlow.position.y = 0.003;
    this.floorGlow.renderOrder = 2;
    this.scene.add(this.contact, this.floorGlow);
    this.disposables.push(shadowTexture, glowTexture, this.contact.geometry, this.contact.material, this.floorGlow.geometry, this.floorGlow.material);

    this.mood = LIGHT_MOODS.studio;
    this.brightness = 1;
    this.friendly = false;
  }

  makeEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envTarget?.dispose();
    this.envTarget = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = (this.mood?.env ?? 0.38) * (0.6 + 0.4 * (this.brightness ?? 1));
    room.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    pmrem.dispose();
  }

  // The lighting mood (room.mjs LIGHT_MOODS) and how bright: colors and strengths of the three lights
  setMood(id, brightness = 1) {
    this.mood = MOOD_BY_ID[id] || LIGHT_MOODS[id] || LIGHT_MOODS.studio;
    this.brightness = brightness;
    this.applyLights();
  }

  applyLights() {
    const m = this.mood;
    const b = this.brightness;
    // Softer and a little less contrast on camera (no hot spots on the shell)
    const [key, fill, rim] = this.friendly ? [0.857, 1.27, 0.767] : [1, 1, 1];
    this.key.color.set(m.key[0]);
    this.key.intensity = m.key[1] * key * b;
    this.fill.color.set(m.fill[0]);
    this.fill.intensity = m.fill[1] * fill * b;
    this.rim.color.set(m.rim[0]);
    this.rim.intensity = m.rim[1] * rim * b * (this.roomBounds ? 0.4 : 1);
    this.scene.environmentIntensity = m.env * (0.6 + 0.4 * b);
    if (this.roomBounds && m.hemi) {
      this.hemi.color.set(m.hemi[0]);
      if (this.emotionTint) this.hemi.color.lerp(this.emotionTint, 0.22);
      this.hemi.intensity = m.hemi[1] * b;
    } else this.hemi.intensity = 0;
  }

  // The robot's feeling, as a slight tint of the bounce light (null: none)
  setEmotionTint(hex) {
    this.emotionTint = hex ? new THREE.Color(hex) : null;
    this.applyLights();
  }

  // A room with walls: the key light's shadow covers the whole room (every thing casts and receives),
  // from a fixed place above the front left; the robot's own soft contact shadow still follows it.
  // floorColor tints the bounce light from below. null goes back to the 1.0 behaviour.
  setRoomBounds(box, { floorColor = "#6b4a3a", mapSize = 2048, soft = 4 } = {}) {
    this.roomBounds = box ? box.clone() : null;
    if (box) {
      const c = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const r = Math.max(size.x, size.z) * 0.62 + 0.4;
      this.key.position.set(c.x - r * 0.55, Math.max(3.4, size.y + 1.6), c.z + r * 0.85);
      this.key.target.position.set(c.x, 0.4, c.z);
      const cam = this.key.shadow.camera;
      Object.assign(cam, { left: -r, right: r, top: r, bottom: -r, near: 0.3, far: r * 4 + 6 });
      cam.updateProjectionMatrix();
      this.key.shadow.radius = soft;
      this.key.shadow.bias = -0.00025;
      this.key.shadow.normalBias = 0.025;
      this.hemi.groundColor.set(floorColor);
      // The rim light outlines the robot from behind; in a room it would also light the whole floor in its
      // color and glare off it towards the camera, so it stays high and gentle there (DECISIONS R7)
      this.rim.position.set(0.8, 2.6, -2.6);
      this.rim.target.position.set(0, 0.8, 0);
      if (this.key.shadow.mapSize.x !== mapSize) this.setShadows(this.key.castShadow, mapSize);
    } else {
      Object.assign(this.key.shadow.camera, { left: -1.1, right: 1.1, top: 1.6, bottom: -0.4, near: 0.5, far: 8 });
      this.rim.position.set(0.8, 2.2, -2.6);
      this.rim.target.position.set(0, 0.7, 0);
      this.key.shadow.camera.updateProjectionMatrix();
      this.key.shadow.radius = 4;
      this.key.shadow.bias = -0.0004;
      this.key.shadow.normalBias = 0.02;
    }
    this.applyLights();
  }

  // Reflections from this room (its walls, floor and window light), not a neutral studio
  makeRoomEnvironment(spec) {
    if (!spec) return this.makeEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const scene = new THREE.Scene();
    const { w = 5, d = 4, h = 2.7, wall = "#e9e1d4", floor = "#b88457", ceiling = "#f1ece3", windows = [], light = "#fff1e0" } = spec;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [wall, wall, ceiling, floor, wall, wall].map((c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(0.55), side: THREE.BackSide })));
    box.position.y = h / 2;
    scene.add(box);
    for (const win of windows) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(win.w, win.h), new THREE.MeshBasicMaterial({ color: new THREE.Color(win.color || "#dff0ff").multiplyScalar(1.1) }));
      p.position.set(win.x, win.y, win.z);
      p.lookAt(0, win.y, 0);
      scene.add(p);
    }
    // A soft bright patch where the key light comes from
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(light).multiplyScalar(1.6) }));
    lamp.position.set(-w * 0.3, h * 0.9, d * 0.3);
    scene.add(lamp);
    const target = pmrem.fromScene(scene, 0.035);
    this.envTarget?.dispose();
    this.envTarget = target;
    this.scene.environment = target.texture;
    scene.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) m.dispose();
    });
    pmrem.dispose();
    this.applyLights();
  }

  // Chroma keys must stay one flat color: no shadow, no glow spilling onto them
  setChroma(on) {
    this.contact.visible = !on;
    this.floorGlow.visible = !on;
  }

  setAccent(color) {
    this.floorGlow.material.color.copy(color);
  }

  // Contact shadow, floor glow and the key light's shadow follow where it is
  // in the room (x, z) and how high it floats
  follow(hoverY, x = 0, z = 0) {
    const lift = Math.max(0, hoverY);
    const s = 1 + lift * 1.6;
    this.contact.position.set(x, 0.002, z);
    this.floorGlow.position.set(x, 0.003, z);
    if (!this.roomBounds) {
      this.key.position.set(KEY_AT.x + x, KEY_AT.y, KEY_AT.z + z);
      this.key.target.position.set(x, 0.6, z);
    }
    this.contact.scale.set(s, s, 1);
    this.contact.material.opacity = Math.max(0.35, 1 - lift * 2.2);
    this.floorGlow.material.opacity = Math.max(0.3, 0.9 - lift * 2.5);
  }

  setShadows(on, size = 2048) {
    this.key.castShadow = on;
    if (this.key.shadow.mapSize.x !== size) {
      this.key.shadow.mapSize.set(size, size);
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
  }

  setCameraFriendly(on) {
    this.friendly = on;
    this.applyLights();
  }

  dispose() {
    for (const d of this.disposables) d.dispose?.();
    this.envTarget?.dispose();
    this.key.shadow.map?.dispose();
  }
}
