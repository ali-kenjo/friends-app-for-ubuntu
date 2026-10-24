// ---------- Procedural 3D Props, Companions, Seasons & Room Builder Renderer ----------
// Lazily constructs procedural 3D props (animated and interactive), companions,
// seasonal/festival decorations, and custom Room Builder items. Zero external downloads.
import * as THREE from "three";
import { matte, glossy, glowSprite, shade } from "./kit.js";
import { CATALOG_BY_ID } from "../room-catalog.mjs";
import { activeSeason } from "../room.mjs";
import { buildWhiteboard3D } from "./whiteboard3d.js";

// Default placement coordinates [x, y, z, rotY] for named place props when added to a room
const PROP_SLOTS = {
  clock: [-1.45, 2.15, -2.35, 0],
  window: [1.35, 1.75, -2.38, 0],
  rain_window: [1.35, 1.75, -2.36, 0],
  blinds: [1.35, 1.75, -2.34, 0],
  birds: [1.35, 1.85, -2.42, 0],
  curtains: [1.35, 1.75, -2.32, 0],
  fireplace: [1.45, 0, -1.65, -0.35],
  kettle: [-1.15, 0.72, -0.95, 0.2],
  lava_lamp: [-1.25, 0.72, -1.05, 0],
  record_player: [1.22, 0.68, -1.05, -0.25],
  radio: [-1.05, 0.72, -0.85, 0.25],
  tv: [1.45, 0.95, -1.55, -0.35],
  fish_tank: [-1.5, 0.75, -1.35, 0.25],
  cat_bed: [1.15, 0.02, -0.85, -0.4],
  plant: [-1.45, 0, -1.25, 0],
  lamp: [1.45, 0, -1.35, 0],
  mug: [0.78, 0.68, -0.65, 0],
  books: [-0.88, 0.68, -0.75, 0.15],
  rug: [0, 0.004, -0.35, 0],
  poster: [-0.85, 1.85, -2.38, 0],
  candles: [0.95, 0.68, -0.95, 0],
  globe: [-1.1, 0.72, -0.95, 0],
  telescope: [1.15, 0, -1.45, -0.4],
  bonsai: [-0.95, 0.65, -0.85, 0],
  lanterns: [0, 2.35, -1.45, 0],
  whiteboard: [-1.45, 1.45, -2.15, 0.22],
};

// Builds a procedural prop mesh group + optional update(dt, time, fx, state) and interactive metadata
export function buildPropMesh(id, { keep, colors, glow, level = "high", customColor = null }) {
  const g = new THREE.Group();
  g.name = `Prop_${id}`;
  const low = level === "low";
  const seg = low ? 12 : 24;
  const cMain = customColor ? new THREE.Color(customColor) : colors?.detail || new THREE.Color("#c89b6e");
  const cWall = colors?.wall || new THREE.Color("#2a2c34");
  const cGlow = glow || new THREE.Color("#ffb074");
  const glowing = [];
  const state = { on: true, pulse: 0 };
  let updater = null;

  const add = (geo, mat, x = 0, y = 0, z = 0, cast = !low) => {
    const m = new THREE.Mesh(keep(geo), keep(mat));
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = !low;
    g.add(m);
    return m;
  };

  if (id === "whiteboard" || id.startsWith("whiteboard_") || id === "chalkboard") {
    const style = id.startsWith("whiteboard_") ? id.replace("whiteboard_", "") : (id === "chalkboard" ? "chalkboard" : "whiteboard");
    const wb = buildWhiteboard3D({ style, keep, colors, glow, level });
    g.add(wb.group);
    updater = wb.update;
    g.userData.whiteboard = wb;
    g.userData.propId = "whiteboard";
    return { group: g, glow: glowing, update: updater, state, whiteboard: wb };
  }

  if (id === "clock" || id === "wall_clock" || id === "station_clock") {
    const rim = add(new THREE.TorusGeometry(0.24, 0.022, 10, seg), glossy(cMain, 0.4, { metalness: 0.4 }), 0, 0, 0, false);
    void rim;
    const face = add(new THREE.CircleGeometry(0.23, seg), matte("#f6f1e6"), 0, 0, -0.004, false);
    void face;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tick = add(new THREE.BoxGeometry(0.012, 0.032, 0.006), matte("#22252c"), Math.sin(a) * 0.185, Math.cos(a) * 0.185, 0.004, false);
      tick.rotation.z = -a;
    }
    const hourPivot = new THREE.Group();
    const minPivot = new THREE.Group();
    const secPivot = new THREE.Group();
    add(new THREE.BoxGeometry(0.016, 0.11, 0.008), matte("#1e2028"), 0, 0.045, 0.008, false);
    hourPivot.add(g.children.pop());
    add(new THREE.BoxGeometry(0.012, 0.155, 0.008), matte("#1e2028"), 0, 0.068, 0.01, false);
    minPivot.add(g.children.pop());
    add(new THREE.BoxGeometry(0.006, 0.17, 0.008), matte("#d9435b"), 0, 0.072, 0.012, false);
    secPivot.add(g.children.pop());
    g.add(hourPivot, minPivot, secPivot);
    updater = (dt, time, fx) => {
      const now = new Date();
      const s = now.getSeconds() + (fx?.friendly ? 0 : now.getMilliseconds() / 1000);
      const m = now.getMinutes() + s / 60;
      const h = (now.getHours() % 12) + m / 60;
      hourPivot.rotation.z = -(h / 12) * Math.PI * 2;
      minPivot.rotation.z = -(m / 60) * Math.PI * 2;
      secPivot.rotation.z = -(s / 60) * Math.PI * 2;
    };
  } else if (id === "kettle" || id === "tea_kettle" || id === "espresso") {
    const bodyMat = glossy(customColor || "#d96b43", 0.3, { metalness: 0.45 });
    add(new THREE.SphereGeometry(0.11, seg, seg), bodyMat, 0, 0.09, 0);
    add(new THREE.CylinderGeometry(0.055, 0.09, 0.04, seg), glossy("#b8c0cc", 0.3, { metalness: 0.7 }), 0, 0.18, 0);
    const spout = add(new THREE.CylinderGeometry(0.014, 0.022, 0.11, 10), bodyMat, 0.1, 0.13, 0);
    spout.rotation.z = -0.65;
    const handle = add(new THREE.TorusGeometry(0.075, 0.012, 8, 18, Math.PI), matte("#262932"), 0, 0.17, 0);
    handle.rotation.z = 0;
    const puffs = [];
    const puffMat = keep(new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35, depthWrite: false }));
    for (let i = 0; i < (low ? 2 : 4); i++) {
      const p = new THREE.Mesh(keep(new THREE.SphereGeometry(0.025 + i * 0.008, 10, 8)), puffMat.clone());
      keep(p.material);
      p.position.set(0.14, 0.2 + i * 0.06, 0);
      g.add(p);
      puffs.push(p);
    }
    updater = (dt, time, fx) => {
      puffs.forEach((p, i) => {
        p.visible = state.on;
        if (!state.on) return;
        const phase = fx?.friendly ? i * 0.25 : (time * 0.9 + i * 0.25) % 1;
        p.position.y = 0.19 + phase * 0.24;
        p.position.x = 0.14 + Math.sin(phase * 6 + i) * 0.02;
        p.scale.setScalar(0.7 + phase * 1.1);
        p.material.opacity = (1 - phase) * 0.35;
      });
    };
  } else if (id === "fireplace" || id === "fire_pit" || id === "wood_stove") {
    const stone = matte(customColor || "#46423e");
    add(new THREE.BoxGeometry(0.85, 0.68, 0.38), stone, 0, 0.34, 0);
    add(new THREE.BoxGeometry(0.94, 0.08, 0.44), matte("#6e4f3a"), 0, 0.7, 0.02);
    add(new THREE.BoxGeometry(0.52, 0.44, 0.28), matte("#181616"), 0, 0.24, 0.06, false);
    for (const x of [-0.1, 0.08]) {
      const log = add(new THREE.CylinderGeometry(0.04, 0.04, 0.36, 10), matte("#5a3a24"), x, 0.08, 0.08);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = x * 2;
    }
    const flameMat1 = keep(new THREE.MeshStandardMaterial({ color: "#ff5500", emissive: "#ff7b24", emissiveIntensity: 2.2, roughness: 0.4 }));
    const flameMat2 = keep(new THREE.MeshStandardMaterial({ color: "#ffcc00", emissive: "#ffd24c", emissiveIntensity: 2.5, roughness: 0.3 }));
    glowing.push(flameMat1, flameMat2);
    const flames = [
      add(new THREE.ConeGeometry(0.09, 0.26, 12), flameMat1, -0.06, 0.2, 0.09, false),
      add(new THREE.ConeGeometry(0.075, 0.22, 12), flameMat2, 0.06, 0.18, 0.1, false),
      add(new THREE.ConeGeometry(0.06, 0.18, 10), flameMat1, 0, 0.22, 0.07, false),
    ];
    const sprite = glowSprite(keep, "#ff8c3b", 1.35, 0.42);
    sprite.position.set(0, 0.25, 0.18);
    g.add(sprite);
    updater = (dt, time, fx) => {
      const calm = fx?.friendly || fx?.reduced;
      flames.forEach((f, i) => {
        f.visible = state.on;
        if (!state.on) return;
        f.scale.y = calm ? 1 : 0.85 + 0.25 * Math.sin(time * (9 + i * 3) + i);
        f.rotation.z = calm ? 0 : Math.sin(time * 6 + i) * 0.08;
      });
      sprite.visible = state.on;
      if (state.on) sprite.material.opacity = calm ? 0.38 : 0.34 + 0.08 * Math.sin(time * 11);
    };
  } else if (id === "lava_lamp") {
    const metal = glossy("#b0b7c4", 0.3, { metalness: 0.75 });
    const glassMat = keep(new THREE.MeshStandardMaterial({ color: "#2b1640", emissive: cGlow, emissiveIntensity: 0.65, transparent: true, opacity: 0.72, roughness: 0.2 }));
    const blobMat = keep(new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: cGlow, emissiveIntensity: 2.1, roughness: 0.3 }));
    glowing.push(glassMat, blobMat);
    add(new THREE.ConeGeometry(0.065, 0.09, seg), metal, 0, 0.045, 0);
    add(new THREE.CylinderGeometry(0.032, 0.062, 0.24, seg), glassMat, 0, 0.21, 0, false);
    add(new THREE.ConeGeometry(0.034, 0.06, seg), metal, 0, 0.36, 0);
    const blobs = [0, 1, 2].map((i) => add(new THREE.SphereGeometry(0.022 - i * 0.003, 12, 10), blobMat, 0, 0.14 + i * 0.06, 0, false));
    updater = (dt, time, fx) => {
      blobs.forEach((b, i) => {
        b.visible = state.on;
        const t = fx?.friendly ? i * 1.1 : time * (0.7 + i * 0.25) + i * 2.1;
        b.position.y = 0.13 + (0.5 + 0.5 * Math.sin(t)) * 0.16;
        b.scale.y = 0.85 + 0.3 * Math.cos(t * 1.5);
      });
      glassMat.emissiveIntensity = state.on ? 0.65 : 0.05;
    };
  } else if (id === "record_player" || id === "radio" || id === "boombox" || id === "synth") {
    const boxMat = matte(customColor || "#7a4e32");
    add(new THREE.BoxGeometry(0.38, 0.08, 0.32), boxMat, 0, 0.04, 0);
    const platter = new THREE.Group();
    platter.position.set(-0.03, 0.085, 0);
    const disc = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.12, 0.12, 0.008, seg)), keep(glossy("#16181d", 0.3)));
    const label = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.042, 0.042, 0.01, 16)), keep(matte("#e25b45")));
    platter.add(disc, label);
    g.add(platter);
    const arm = add(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 8), glossy("#cfd6e2", 0.25, { metalness: 0.8 }), 0.11, 0.1, 0.02, false);
    arm.rotation.x = Math.PI / 2;
    arm.rotation.z = 0.35;
    updater = (dt, time) => {
      if (state.on) platter.rotation.y = time * 1.8;
      arm.rotation.z = state.on ? 0.35 : 0.05;
    };
  } else if (id === "fish_tank") {
    const frameMat = matte("#232a36");
    const waterMat = keep(new THREE.MeshStandardMaterial({ color: "#1d6fa5", emissive: "#1a88b8", emissiveIntensity: 0.45, transparent: true, opacity: 0.55, roughness: 0.15 }));
    glowing.push(waterMat);
    add(new THREE.BoxGeometry(0.52, 0.04, 0.28), frameMat, 0, 0.02, 0);
    add(new THREE.BoxGeometry(0.5, 0.32, 0.26), waterMat, 0, 0.2, 0, false);
    add(new THREE.BoxGeometry(0.52, 0.03, 0.28), frameMat, 0, 0.375, 0);
    const fish = new THREE.Group();
    const fMat = keep(new THREE.MeshStandardMaterial({ color: "#ff7a2e", emissive: "#ff5500", emissiveIntensity: 0.4, roughness: 0.4 }));
    const fBody = new THREE.Mesh(keep(new THREE.SphereGeometry(0.032, 14, 10)), fMat);
    fBody.scale.set(1.4, 0.85, 0.6);
    const fTail = new THREE.Mesh(keep(new THREE.ConeGeometry(0.025, 0.035, 4)), fMat);
    fTail.rotation.z = Math.PI / 2;
    fTail.position.x = -0.048;
    fish.add(fBody, fTail);
    fish.position.set(0, 0.2, 0);
    g.add(fish);
    updater = (dt, time, fx) => {
      if (fx?.friendly) return;
      const sx = Math.sin(time * 0.9) * 0.16;
      const dx = Math.cos(time * 0.9);
      fish.position.x = sx;
      fish.position.y = 0.2 + Math.sin(time * 2.1) * 0.04;
      fish.rotation.y = dx >= 0 ? 0 : Math.PI;
    };
  } else if (id === "cat_bed") {
    add(new THREE.TorusGeometry(0.22, 0.06, 12, seg), matte(customColor || "#b86b52"), 0, 0.05, 0).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.04, seg), matte("#e8dfd1"), 0, 0.025, 0);
    const cat = buildSleepingCat(keep, "#e08e52");
    cat.position.set(0, 0.06, 0);
    g.add(cat);
    updater = (dt, time, fx) => {
      const breath = fx?.friendly ? 0 : Math.sin(time * 1.8) * 0.06;
      cat.scale.set(1 + breath * 0.3, 1 + breath, 1 + breath * 0.3);
      if (state.pulse > 0) {
        state.pulse = Math.max(0, state.pulse - dt);
        cat.rotation.y = Math.sin(time * 12) * 0.12;
      } else {
        cat.rotation.y = 0;
      }
    };
  } else if (id === "tv" || id === "monitors" || id === "radar_screen" || id === "chart_screen" || id === "nav_console") {
    const stand = glossy("#22252e", 0.4, { metalness: 0.4 });
    const screenMat = keep(new THREE.MeshStandardMaterial({ color: "#0b1320", emissive: cGlow, emissiveIntensity: 1.15, roughness: 0.25 }));
    glowing.push(screenMat);
    add(new THREE.BoxGeometry(0.68, 0.42, 0.035), stand, 0, 0.26, 0);
    add(new THREE.PlaneGeometry(0.62, 0.36), screenMat, 0, 0.26, 0.02, false);
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 12), stand, 0, 0.04, 0);
    add(new THREE.BoxGeometry(0.24, 0.02, 0.14), stand, 0, 0.01, 0);
    updater = () => {
      screenMat.emissiveIntensity = state.on ? 1.15 : 0.02;
    };
  } else if (id === "curtains" || id === "plant" || id === "hanging_ivy" || id === "fern" || id === "palm" || id === "bamboo") {
    const potMat = matte(customColor || "#b86b4b");
    add(new THREE.CylinderGeometry(0.13, 0.1, 0.22, seg), potMat, 0, 0.11, 0);
    const foliage = new THREE.Group();
    foliage.position.y = 0.22;
    const leafMat = matte("#4d8a54");
    for (let i = 0; i < (low ? 5 : 8); i++) {
      const a = (i / (low ? 5 : 8)) * Math.PI * 2;
      const leaf = new THREE.Mesh(keep(new THREE.SphereGeometry(0.07, 12, 10)), keep(leafMat));
      leaf.scale.set(0.7, 2.2, 0.35);
      leaf.position.set(Math.cos(a) * 0.07, 0.14 + (i % 3) * 0.05, Math.sin(a) * 0.07);
      leaf.rotation.set(Math.sin(a) * 0.45, -a, Math.cos(a) * 0.45);
      foliage.add(leaf);
    }
    g.add(foliage);
    updater = (dt, time, fx) => {
      const sway = fx?.friendly || fx?.reduced ? 0 : Math.sin(time * 1.4) * 0.045;
      foliage.rotation.z = sway;
      if (state.pulse > 0) {
        state.pulse = Math.max(0, state.pulse - dt);
        foliage.scale.setScalar(1 + 0.12 * Math.sin(state.pulse * Math.PI * 4));
      } else {
        foliage.scale.setScalar(1);
      }
    };
  } else if (id === "window" || id === "rain_window" || id === "blinds" || id === "birds" || id === "skylight" || id === "shoji" || id === "porthole") {
    const frameMat = matte(customColor || "#3a3f4d");
    const skyMat = keep(new THREE.MeshStandardMaterial({ color: "#4a78b8", emissive: cGlow, emissiveIntensity: 0.55, roughness: 0.4 }));
    glowing.push(skyMat);
    add(new THREE.BoxGeometry(1.15, 0.85, 0.04), frameMat, 0, 0, 0, false);
    add(new THREE.PlaneGeometry(1.04, 0.74), skyMat, 0, 0, 0.022, false);
    const slatGroup = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const slat = new THREE.Mesh(keep(new THREE.BoxGeometry(1.02, 0.022, 0.025)), keep(matte("#d8cfc0")));
      slat.position.set(0, 0.3 - i * 0.11, 0.03);
      slatGroup.add(slat);
    }
    slatGroup.visible = id === "blinds";
    g.add(slatGroup);
    updater = () => {
      skyMat.emissiveIntensity = state.on ? 0.55 : 0.12;
      if (id === "blinds") slatGroup.scale.y = state.on ? 1 : 0.2;
    };
  } else if (id === "lamp" || id === "lanterns" || id === "fairy_lights" || id === "string_lights" || id === "neon_bar" || id === "floor_lamp" || id === "desk_lamp" || id === "andon_lamp") {
    const stemMat = glossy("#2c303a", 0.4, { metalness: 0.5 });
    const bulbMat = keep(new THREE.MeshStandardMaterial({ color: "#fff0d6", emissive: cGlow, emissiveIntensity: 1.8, roughness: 0.3 }));
    glowing.push(bulbMat);
    add(new THREE.CylinderGeometry(0.12, 0.14, 0.03, seg), stemMat, 0, 0.015, 0);
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.95, 12), stemMat, 0, 0.48, 0);
    add(new THREE.ConeGeometry(0.2, 0.24, seg, 1, true), bulbMat, 0, 0.96, 0, false);
    const halo = glowSprite(keep, cGlow, 1.2, 0.32);
    halo.position.set(0, 0.92, 0);
    g.add(halo);
    updater = () => {
      bulbMat.emissiveIntensity = state.on ? 1.8 : 0.05;
      halo.visible = state.on;
    };
  } else if (id === "rug" || id === "round_rug" || id === "woven_rug" || id === "tatami_mat" || id === "cloud_rug" || id === "runner_rug" || id === "Checkered_rug") {
    const rMat = matte(customColor || cMain);
    const mesh = add(new THREE.CylinderGeometry(0.85, 0.85, 0.012, seg), rMat, 0, 0.006, 0, false);
    mesh.scale.set(1.2, 1, 0.85);
  } else {
    // Versatile procedural furniture/decor silhouette based on catalog category or prop id
    const catItem = CATALOG_BY_ID[id];
    const cat = catItem?.cat || "furniture";
    if (cat === "books" || id.includes("book")) {
      for (let i = 0; i < 3; i++) {
        add(new THREE.BoxGeometry(0.24 - i * 0.02, 0.045, 0.18), matte(i === 0 ? cMain : shade(cMain, { l: i * 0.1 - 0.15 })), 0, 0.022 + i * 0.046, 0).rotation.y = (i - 1) * 0.12;
      }
    } else if (cat === "food_drinks" || id.includes("mug") || id.includes("cup") || id.includes("tea")) {
      add(new THREE.CylinderGeometry(0.055, 0.048, 0.11, seg), glossy(customColor || "#f4efe6", 0.35), 0, 0.055, 0);
    } else if (cat === "instruments") {
      add(new THREE.CylinderGeometry(0.12, 0.14, 0.06, seg), glossy(customColor || "#b86b35", 0.4), 0, 0.18, 0).rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(0.035, 0.36, 0.025), matte("#3b2818"), 0, 0.36, 0);
    } else if (cat === "wall_decor" || cat === "windows" || id.includes("poster") || id.includes("sign") || id.includes("chart")) {
      add(new THREE.BoxGeometry(0.56, 0.42, 0.025), matte(customColor || cMain), 0, 0, 0, false);
      add(new THREE.PlaneGeometry(0.48, 0.34), matte(shade(cWall, { l: 0.18 })), 0, 0, 0.015, false);
    } else {
      add(new THREE.BoxGeometry(0.42, 0.32, 0.32), matte(customColor || cMain), 0, 0.16, 0);
    }
  }

  g.userData.propId = id;
  g.userData.interactive = true;
  g.userData.trigger = (action = "toggle") => {
    if (action === "on") state.on = true;
    else if (action === "off") state.on = false;
    else state.on = !state.on;
    state.pulse = 1.0;
    return state.on;
  };

  return { group: g, glow: glowing, update: updater, state };
}

function buildSleepingCat(keep, hex = "#e08e52") {
  const g = new THREE.Group();
  const fur = keep(matte(hex));
  const body = new THREE.Mesh(keep(new THREE.SphereGeometry(0.13, 18, 14)), fur);
  body.scale.set(1.25, 0.65, 1.05);
  g.add(body);
  const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.075, 16, 12)), fur);
  head.position.set(0.11, 0.03, 0.04);
  g.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(keep(new THREE.ConeGeometry(0.028, 0.05, 4)), fur);
    ear.position.set(0.12, 0.095, 0.04 + s * 0.042);
    g.add(ear);
  }
  return g;
}

// ---------- Companions (cat, drone, goldfish, plant_sprite, vacuum) ----------
export function buildCompanions(companions = {}, { group, keep, glow, level = "high" }) {
  const updaters = [];
  const glowing = [];
  if (!companions || typeof companions !== "object") return { updaters, glow: glowing };

  if (companions.cat) {
    const c = buildPropMesh("cat_bed", { keep, glow, level });
    c.group.position.set(1.05, 0, -0.55);
    c.group.userData.propId = "cat";
    group.add(c.group);
    if (c.update) updaters.push(c.update);
  }

  if (companions.drone) {
    const d = new THREE.Group();
    d.name = "Companion_drone";
    d.userData.propId = "drone";
    const shell = keep(glossy("#d8e0ec", 0.3, { metalness: 0.5 }));
    const eyeMat = keep(new THREE.MeshStandardMaterial({ color: "#10141d", emissive: glow || "#5eead4", emissiveIntensity: 1.8 }));
    glowing.push(eyeMat);
    d.add(new THREE.Mesh(keep(new THREE.SphereGeometry(0.085, 18, 14)), shell));
    const eye = new THREE.Mesh(keep(new THREE.SphereGeometry(0.035, 12, 10)), eyeMat);
    eye.position.set(0, 0, 0.072);
    d.add(eye);
    const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(0.13, 0.012, 8, 24)), shell);
    ring.rotation.x = Math.PI / 2;
    d.add(ring);
    d.position.set(-0.85, 1.35, -0.45);
    group.add(d);
    updaters.push((dt, time, fx) => {
      if (fx?.friendly) return;
      d.position.x = -0.85 + Math.cos(time * 0.8) * 0.22;
      d.position.y = 1.35 + Math.sin(time * 1.9) * 0.08;
      d.position.z = -0.45 + Math.sin(time * 0.8) * 0.16;
      d.rotation.y = Math.sin(time * 0.6) * 0.35;
    });
  }

  if (companions.goldfish) {
    const f = buildPropMesh("fish_tank", { keep, glow, level });
    f.group.position.set(-1.15, 0, -0.75);
    f.group.scale.setScalar(0.82);
    f.group.userData.propId = "goldfish";
    group.add(f.group);
    glowing.push(...f.glow);
    if (f.update) updaters.push(f.update);
  }

  if (companions.plant_sprite) {
    const sp = new THREE.Group();
    sp.name = "Companion_plant_sprite";
    sp.userData.propId = "plant_sprite";
    const bodyMat = keep(new THREE.MeshStandardMaterial({ color: "#b8f2c8", emissive: "#5eead4", emissiveIntensity: 0.75, roughness: 0.5 }));
    glowing.push(bodyMat);
    const body = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.055, 0.08, 8, 14)), bodyMat);
    body.position.y = 0.09;
    sp.add(body);
    const leaf = new THREE.Mesh(keep(new THREE.SphereGeometry(0.045, 12, 8)), keep(matte("#4ea854")));
    leaf.scale.set(1.2, 0.3, 0.7);
    leaf.position.set(0, 0.19, 0);
    sp.add(leaf);
    sp.position.set(-0.78, 0, -0.35);
    group.add(sp);
    updaters.push((dt, time, fx) => {
      if (fx?.friendly) return;
      sp.rotation.z = Math.sin(time * 2.2) * 0.12;
      sp.position.y = Math.abs(Math.sin(time * 2.2)) * 0.03;
    });
  }

  if (companions.vacuum) {
    const v = new THREE.Group();
    v.name = "Companion_vacuum";
    v.userData.propId = "vacuum";
    const disc = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.16, 0.17, 0.055, 24)), keep(glossy("#2b303c", 0.35, { metalness: 0.4 })));
    disc.position.y = 0.028;
    const ledMat = keep(new THREE.MeshStandardMaterial({ color: "#5eead4", emissive: "#5eead4", emissiveIntensity: 1.6 }));
    glowing.push(ledMat);
    const led = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.025, 0.025, 0.01, 14)), ledMat);
    led.position.set(0, 0.058, 0.08);
    v.add(disc, led);
    v.position.set(0.65, 0, -0.95);
    group.add(v);
    updaters.push((dt, time, fx) => {
      if (fx?.friendly) return;
      v.position.x = Math.sin(time * 0.45) * 0.95;
      v.position.z = -0.95 + Math.cos(time * 0.3) * 0.25;
      v.rotation.y = Math.cos(time * 0.45) * 1.2;
    });
  }

  return { updaters, glow: glowing };
}

// ---------- Seasonal & Festival Decorations ----------
export function buildSeasonalSet(seasonPref, { group, keep, level = "high" }) {
  const s = activeSeason(seasonPref);
  const glowing = [];
  const updaters = [];
  if (!s || s === "none" || level === "low") return { glow: glowing, updaters };

  const root = new THREE.Group();
  root.name = `Season_${s}`;
  group.add(root);

  if (s === "christmas" || s === "winter") {
    // Festive string lights across the top & snow/tree accent on the left
    const bulbColors = s === "christmas" ? ["#ff4d4d", "#4dff88", "#ffd24c", "#5eb8ff"] : ["#bfe6ff", "#ffffff"];
    const bulbs = bulbColors.map((hex) => {
      const m = keep(new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 1.9 }));
      glowing.push(m);
      return m;
    });
    const bulbGeo = keep(new THREE.SphereGeometry(0.032, 10, 8));
    for (let i = 0; i < 11; i++) {
      const x = -2.0 + i * 0.4;
      const y = 2.45 - Math.sin((i / 10) * Math.PI) * 0.22;
      const m = new THREE.Mesh(bulbGeo, bulbs[i % bulbs.length]);
      m.position.set(x, y, -1.95);
      root.add(m);
    }
    if (s === "christmas") {
      const tree = new THREE.Group();
      tree.position.set(-1.75, 0, -1.55);
      const pine = keep(matte("#265c3a"));
      for (const [y, r, h] of [[0.45, 0.42, 0.65], [0.85, 0.32, 0.55], [1.2, 0.22, 0.45]]) {
        const cone = new THREE.Mesh(keep(new THREE.ConeGeometry(r, h, 16)), pine);
        cone.position.y = y;
        tree.add(cone);
      }
      const star = new THREE.Mesh(keep(new THREE.OctahedronGeometry(0.085)), bulbs[2]);
      star.position.y = 1.48;
      tree.add(star);
      root.add(tree);
    }
  } else if (s === "halloween") {
    const pumpMat = keep(matte("#e66c1f"));
    const glowEye = keep(new THREE.MeshStandardMaterial({ color: "#ffe066", emissive: "#ffae00", emissiveIntensity: 2.2 }));
    glowing.push(glowEye);
    for (const [x, z, sc] of [[-1.55, -1.25, 1], [1.55, -1.35, 0.8]]) {
      const p = new THREE.Mesh(keep(new THREE.SphereGeometry(0.18 * sc, 16, 12)), pumpMat);
      p.scale.y = 0.78;
      p.position.set(x, 0.14 * sc, z);
      const core = new THREE.Mesh(keep(new THREE.SphereGeometry(0.08 * sc, 10, 8)), glowEye);
      core.position.set(x, 0.15 * sc, z + 0.12 * sc);
      root.add(p, core);
    }
  } else if (s === "ramadan_eid") {
    const goldMat = keep(new THREE.MeshStandardMaterial({ color: "#f5c451", emissive: "#f5a623", emissiveIntensity: 1.7, metalness: 0.6, roughness: 0.3 }));
    glowing.push(goldMat);
    const crescent = new THREE.Mesh(keep(new THREE.TorusGeometry(0.22, 0.038, 12, 28, Math.PI * 1.45)), goldMat);
    crescent.position.set(1.55, 2.15, -2.0);
    crescent.rotation.z = 0.6;
    root.add(crescent);
    for (const x of [-1.45, -0.75, 0.75]) {
      const lantern = new THREE.Mesh(keep(new THREE.OctahedronGeometry(0.09)), goldMat);
      lantern.scale.y = 1.45;
      lantern.position.set(x, 2.25, -1.85);
      root.add(lantern);
    }
  } else if (s === "spring" || s === "autumn" || s === "summer" || s === "new_year") {
    const hex = s === "spring" ? "#f7a8c4" : s === "autumn" ? "#d96b27" : s === "new_year" ? "#ffd24c" : "#b8ff66";
    const orbMat = keep(new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 1.4 }));
    glowing.push(orbMat);
    const geo = keep(new THREE.SphereGeometry(0.045, 10, 8));
    for (let i = 0; i < 8; i++) {
      const a = (i / 7) * Math.PI - Math.PI / 2;
      const m = new THREE.Mesh(geo, orbMat);
      m.position.set(Math.sin(a) * 1.8, 2.25 + Math.cos(a * 2) * 0.12, -1.9);
      root.add(m);
    }
  }

  return { glow: glowing, updaters };
}

// ---------- Custom Room Builder Items ----------
export function buildCustomBuilderItems(builder, { group, keep, colors, glow, level = "high" }) {
  const glowing = [];
  const updaters = [];
  const items = builder?.items;
  if (!Array.isArray(items) || !items.length) return { glow: glowing, updaters };

  for (const it of items) {
    const built = buildPropMesh(it.propId, { keep, colors, glow, level, customColor: it.color });
    built.group.position.set(it.x || 0, it.y || 0, it.z || -1.2);
    built.group.rotation.y = ((it.rot || 0) * Math.PI) / 180;
    built.group.scale.setScalar(it.scale || 1);
    built.group.userData.builderUid = it.uid;
    built.group.userData.interactive = it.interactive !== false;
    group.add(built.group);
    glowing.push(...built.glow);
    if (built.update && it.animate !== false) updaters.push(built.update);
  }
  return { glow: glowing, updaters };
}

// Augments any place with enabled props from its 15-prop list that weren't already built by the base place
export function augmentPlaceProps(placeId, props, existingGroup, { keep, colors, glow, level = "high" }) {
  const glowing = [];
  const updaters = [];
  if (!props || typeof props !== "object") return { glow: glowing, updaters };

  const alreadyBuilt = new Set();
  existingGroup.traverse((o) => {
    if (o.userData?.propId) alreadyBuilt.add(o.userData.propId);
  });
  // Native props handled directly by legacy place files
  const NATIVE = {
    desk: ["plant", "mug", "books", "lamp"],
    podcast: ["sign", "panels", "mic", "pendants", "plant"],
    lounge: ["lamp", "plant", "shelf", "picture"],
    space: ["planet", "rings", "nebula", "ship"],
    garden: ["arch", "lanterns", "trees", "pond"],
    city: ["buildings", "signs", "moon", "bridge"],
    sky: ["sun", "clouds", "birds", "balloon"],
  };
  for (const k of NATIVE[placeId] || []) alreadyBuilt.add(k);

  let idx = 0;
  for (const [id, on] of Object.entries(props)) {
    if (!on || alreadyBuilt.has(id) || ["bokeh", "shaft", "rings"].includes(id)) continue;
    const built = buildPropMesh(id, { keep, colors, glow, level });
    const slot = PROP_SLOTS[id] || [((idx % 2 ? 1 : -1) * (1.15 + (idx % 3) * 0.25)), 0, -1.1 - (idx % 4) * 0.25, 0];
    built.group.position.set(slot[0], slot[1], slot[2]);
    built.group.rotation.y = slot[3] || 0;
    existingGroup.add(built.group);
    glowing.push(...built.glow);
    if (built.update) updaters.push(built.update);
    idx++;
  }
  return { glow: glowing, updaters };
}
