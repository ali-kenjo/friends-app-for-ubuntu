// ---------- 14 New 3D Places ----------
// Bedroom, Kitchen, Library & study, Greenhouse & garden, Rooftop terrace,
// Workshop & lab, Cabin with a fireplace, Seaside, Forest campfire, Café,
// Arcade, Observatory, Tatami room, Spaceship bridge.
import * as THREE from "three";
import { canvasTexture, matte, glossy, glowSprite, shade, css } from "./kit.js";
import { buildPropMesh } from "./props3d.js";

function makePlaceShell({ id, colors, glow, props, sign, keep, group: room, level = "high", mode = "vignette", ownFloor = false, roam = 0.85, customDraw }) {
  const group = new THREE.Group();
  group.name = `Place_${id}`;
  room.add(group);
  const low = level === "low";
  const glowing = [];
  const updaters = [];

  const add = (geo, mat, x = 0, y = 0, z = 0, { cast = !low, receive = !low } = {}) => {
    const m = new THREE.Mesh(keep(geo), keep(mat));
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = receive;
    group.add(m);
    return m;
  };

  // Back wall or sky plane with soft procedural lighting gradient
  const wallTex = keep(
    canvasTexture(low ? 256 : 512, low ? 128 : 256, (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, css(shade(colors.wall, { l: 0.04 })));
      grad.addColorStop(1, css(shade(colors.wall, { l: -0.04 })));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      const rad = ctx.createRadialGradient(w * 0.55, h * 0.4, 10, w * 0.55, h * 0.4, w * 0.48);
      rad.addColorStop(0, `rgba(${(glow.r * 255) | 0},${(glow.g * 255) | 0},${(glow.b * 255) | 0},0.28)`);
      rad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rad;
      ctx.fillRect(0, 0, w, h);
    })
  );
  add(new THREE.PlaneGeometry(10, 5), matte("#ffffff", { map: wallTex }), 0, 1.5, -2.55, { cast: false, receive: false });

  // Place-specific architectural centerpiece
  if (customDraw) {
    customDraw({ add, group, keep, colors, glow, props, sign, low, glowing, updaters });
  }

  // Place all enabled switchable props in well-spaced room slots around the stage
  const SLOTS = [
    [-1.55, 0, -1.45, 0.25],
    [1.55, 0, -1.45, -0.25],
    [-1.25, 0, -1.85, 0.15],
    [1.25, 0, -1.85, -0.15],
    [-1.75, 0, -0.95, 0.4],
    [1.75, 0, -0.95, -0.4],
    [-0.95, 1.85, -2.42, 0],
    [0.95, 1.85, -2.42, 0],
    [0, 2.15, -2.42, 0],
    [-1.4, 0.72, -1.35, 0.2],
    [1.4, 0.72, -1.35, -0.2],
    [0, 0.004, -0.45, 0],
    [-0.75, 0, -1.65, 0.1],
    [0.75, 0, -1.65, -0.1],
    [0, 0, -1.95, 0],
  ];

  let idx = 0;
  for (const [propId, on] of Object.entries(props || {})) {
    if (!on) continue;
    const slot = SLOTS[idx % SLOTS.length];
    idx++;
    const built = buildPropMesh(propId, { keep, colors, glow, level });
    const isWall = ["clock", "window", "rain_window", "blinds", "birds", "poster", "sign", "menu_board", "star_chart", "scroll", "porthole", "skylight"].includes(propId);
    built.group.position.set(slot[0], isWall ? 1.82 : slot[1], isWall ? -2.42 : slot[2]);
    built.group.rotation.y = isWall ? 0 : slot[3];
    group.add(built.group);
    glowing.push(...built.glow);
    if (built.update) updaters.push(built.update);
  }

  return {
    ownFloor,
    roam,
    glow: glowing,
    backdrop: {
      mode,
      bg: colors.wall,
      edge: colors.wall.clone().multiplyScalar(0.32),
      glow: 0.18,
      glowColor: glow,
      blobs: [{ x: 0.55, y: 0.62, r: 0.45, strength: 0.18, color: glow }],
    },
    update(dt, time, pose, fx) {
      for (const fn of updaters) fn(dt, time, fx);
    },
  };
}

export const bedroom = (ctx) =>
  makePlaceShell({
    ...ctx,
    id: "bedroom",
    customDraw({ add, colors }) {
      // Cozy headboard and bed frame on the left back
      add(new THREE.BoxGeometry(1.4, 0.85, 0.12), matte(colors.detail), -1.35, 0.42, -2.2);
      add(new THREE.BoxGeometry(1.36, 0.32, 1.35), matte("#e8dfd3"), -1.35, 0.16, -1.55);
    },
  });

export const kitchen = (ctx) =>
  makePlaceShell({
    ...ctx,
    id: "kitchen",
    customDraw({ add, colors }) {
      // Warm kitchen counter and backsplash
      add(new THREE.BoxGeometry(3.4, 0.82, 0.68), matte(colors.detail), 0, 0.41, -1.95);
      add(new THREE.BoxGeometry(3.48, 0.06, 0.74), glossy("#f5efe6", 0.35), 0, 0.84, -1.95);
    },
  });

export const library = (ctx) =>
  makePlaceShell({
    ...ctx,
    id: "library",
    customDraw({ add, colors }) {
      // Tall wooden bookshelves flanking the room
      for (const x of [-1.75, 1.75]) {
        add(new THREE.BoxGeometry(1.1, 2.4, 0.34), matte(colors.detail), x, 1.2, -2.15);
      }
    },
  });

export const greenhouse = (ctx) =>
  makePlaceShell({
    ...ctx,
    id: "greenhouse",
    customDraw({ add, colors, glow, glowing, keep }) {
      // Glass conservatory ribs
      const ribMat = glossy(colors.detail, 0.4, { metalness: 0.4 });
      for (const x of [-1.8, -0.6, 0.6, 1.8]) {
        add(new THREE.BoxGeometry(0.06, 2.8, 0.06), ribMat, x, 1.4, -2.35);
      }
      const sunMat = keep(new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: glow, emissiveIntensity: 0.65, transparent: true, opacity: 0.25 }));
      glowing.push(sunMat);
      add(new THREE.PlaneGeometry(4.2, 1.2), sunMat, 0, 2.35, -2.38, { cast: false });
    },
  });

export const rooftop = (ctx) =>
  makePlaceShell({
    ...ctx,
    id: "rooftop",
    mode: "gradient",
    customDraw({ add, colors, glow }) {
      // Low parapet wall and distant skyline silhouettes
      add(new THREE.BoxGeometry(5.6, 0.55, 0.22), matte(colors.detail), 0, 0.275, -1.95);
      for (const [x, w, h] of [[-2.1, 0.65, 1.8], [-1.2, 0.55, 2.3], [1.1, 0.7, 2.1], [2.0, 0.6, 1.65]]) {
        add(new THREE.BoxGeometry(w, h, 0.12), matte(shade(colors.wall, { l: -0.06 })), x, h / 2, -2.42, { cast: false });
      }
      void glow;
    },
  });

export const workshop = (ctx) =>
  makePlaceShell({
    ...ctx,
    id: "workshop",
    customDraw({ add, colors, glow, glowing, keep }) {
      // Workbench and glowing pegboard strip
      add(new THREE.BoxGeometry(3.2, 0.78, 0.65), matte(colors.detail), 0, 0.39, -1.9);
      const strip = keep(new THREE.MeshStandardMaterial({ color: "#111822", emissive: glow, emissiveIntensity: 1.6 }));
      glowing.push(strip);
      add(new THREE.BoxGeometry(2.6, 0.06, 0.04), strip, 0, 1.95, -2.4, { cast: false });
    },
  });

export const cabin = (ctx) =>
  makePlaceShell({
    ...ctx,
    id: "cabin",
    customDraw({ add, colors }) {
      // Timber beams
      for (let i = 0; i < 5; i++) {
        add(new THREE.CylinderGeometry(0.11, 0.11, 5.4, 12), matte(colors.detail), 0, 0.35 + i * 0.48, -2.38).rotation.z = Math.PI / 2;
      }
    },
  });

export const seaside = (ctx) =>
  makePlaceShell({
    ...ctx,
    id: "seaside",
    mode: "gradient",
    customDraw({ add, colors, glow, keep }) {
      // Ocean horizon band and wooden pier rail
      const seaMat = keep(new THREE.MeshStandardMaterial({ color: colors.detail, emissive: glow, emissiveIntensity: 0.28, roughness: 0.25 }));
      add(new THREE.PlaneGeometry(9.5, 1.4), seaMat, 0, 0.65, -2.35, { cast: false });
    },
  });

export const campfire = (ctx) =>
  makePlaceShell({
    ...ctx,
    id: "campfire",
    mode: "gradient",
    customDraw({ add, colors }) {
      // Pine silhouettes in the background
      for (const [x, s] of [[-2.1, 1.2], [-1.35, 0.95], [1.4, 1.1], [2.15, 1.25]]) {
        add(new THREE.ConeGeometry(0.48 * s, 1.65 * s, 12), matte(colors.detail), x, 0.9 * s, -2.15);
      }
    },
  });

export const cafe = (ctx) =>
  makePlaceShell({
    ...ctx,
    id: "cafe",
    customDraw({ add, colors }) {
      // Café counter & striped awning
      add(new THREE.BoxGeometry(2.8, 0.85, 0.62), matte(colors.detail), -0.6, 0.425, -1.85);
      add(new THREE.BoxGeometry(3.2, 0.22, 0.45), matte("#c85a3a"), 0, 2.35, -2.15);
    },
  });

export const arcade = (ctx) =>
  makePlaceShell({
    ...ctx,
    id: "arcade",
    customDraw({ add, colors, glow, glowing, keep }) {
      // Glowing arcade cabinet silhouettes
      const neonMat = keep(new THREE.MeshStandardMaterial({ color: "#120c24", emissive: glow, emissiveIntensity: 1.85 }));
      glowing.push(neonMat);
      for (const x of [-1.45, 1.45]) {
        add(new THREE.BoxGeometry(0.62, 1.55, 0.52), matte(colors.detail), x, 0.775, -1.95);
        add(new THREE.PlaneGeometry(0.48, 0.38), neonMat, x, 1.12, -1.68, { cast: false });
      }
    },
  });

export const observatory = (ctx) =>
  makePlaceShell({
    ...ctx,
    id: "observatory",
    customDraw({ add, colors, glow, glowing, keep }) {
      // Arched dome ribs & star aperture
      const arch = keep(new THREE.MeshStandardMaterial({ color: colors.detail, metalness: 0.5, roughness: 0.4 }));
      add(new THREE.TorusGeometry(2.2, 0.08, 12, 36, Math.PI), arch, 0, 0.4, -2.25);
      const starGlow = glowSprite(keep, glow, 2.2, 0.28);
      starGlow.position.set(0, 1.85, -2.3);
      ctx.group.add(starGlow);
      void glowing;
    },
  });

export const tatami = (ctx) =>
  makePlaceShell({
    ...ctx,
    id: "tatami",
    customDraw({ add, colors, keep }) {
      // Shoji lattice panels on the back wall
      const paperMat = keep(new THREE.MeshStandardMaterial({ color: "#f6efe2", emissive: "#ffe4b8", emissiveIntensity: 0.35, roughness: 0.8 }));
      for (const x of [-1.1, 0, 1.1]) {
        add(new THREE.PlaneGeometry(0.95, 2.1), paperMat, x, 1.15, -2.42, { cast: false });
        add(new THREE.BoxGeometry(1.02, 2.18, 0.03), matte(colors.detail), x, 1.15, -2.44, { cast: false });
      }
    },
  });

export const spaceship = (ctx) =>
  makePlaceShell({
    ...ctx,
    id: "spaceship",
    customDraw({ add, colors, glow, glowing, keep }) {
      // Sci-fi bridge viewport frame & glowing console trim
      const hull = glossy(colors.detail, 0.35, { metalness: 0.7 });
      const holo = keep(new THREE.MeshStandardMaterial({ color: "#081826", emissive: glow, emissiveIntensity: 1.75 }));
      glowing.push(holo);
      add(new THREE.BoxGeometry(4.4, 0.18, 0.35), hull, 0, 2.35, -2.15);
      add(new THREE.BoxGeometry(4.4, 0.45, 0.45), hull, 0, 0.225, -2.1);
      add(new THREE.BoxGeometry(3.6, 0.04, 0.06), holo, 0, 0.46, -1.86, { cast: false });
    },
  });
