// ---------- Robot Toy Box: All 8 Distinct Interactive 3D Toys (core/world/toys.mjs) ----------
// 1. Bouncy Physics Ball (gravity + surface bounce + chase/juggle)
// 2. 3D Rubik's Cube (articulated rotating 3x3 layers + solve/stumped animation)
// 3. Mini RC Drone / Paper Glider (CatmullRom 3D aerial spline + spinning rotors)
// 4. Retro Handheld Console (backlit screen + animated buttons + win/lose jump)
// 5. Holo-Projector / Laser Emitter (3D rotating wireframe hologram + floor laser chase)
// 6. Newton's Cradle (physics momentum pendulum 5-sphere desk toy + clack SFX)
// 7. Stateful Stacking Blocks (4 blocks stack upright / topple scatter / re-stack)
// 8. Mini Synth / Kalimba (glowing keys + pentatonic harmonic WebAudio tones)
import * as THREE from "three";
import { playFoley } from "./asset-framework.mjs";

export function buildToyMesh(kind, asset, foleyVol = 0.6) {
  switch (kind) {
    case "bouncy_ball":
      return buildBouncyBall(asset, foleyVol);
    case "rubiks_cube":
      return buildRubiksCube(asset, foleyVol);
    case "rc_drone":
      return buildRcDrone(asset, foleyVol);
    case "retro_handheld":
      return buildRetroHandheld(asset, foleyVol);
    case "holo_projector":
      return buildHoloProjector(asset, foleyVol);
    case "newtons_cradle":
      return buildNewtonsCradle(asset, foleyVol);
    case "stacking_blocks":
      return buildStackingBlocks(asset, foleyVol);
    case "mini_synth":
    default:
      return buildMiniSynth(asset, foleyVol);
  }
}

function buildBouncyBall(asset, foleyVol) {
  const g = new THREE.Group();
  g.name = `Asset_${asset.id}`;
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 20, 18),
    new THREE.MeshStandardMaterial({ color: "#fb7185", roughness: 0.35 })
  );
  ball.position.y = 0.1;
  ball.castShadow = true;
  const stripe = new THREE.Mesh(
    new THREE.TorusGeometry(0.098, 0.012, 8, 24),
    new THREE.MeshStandardMaterial({ color: "#fef08a", roughness: 0.4 })
  );
  ball.add(stripe);
  g.add(ball);

  let vy = 0;
  let py = 0.1;
  function trigger(action = "play") {
    vy = action === "juggle" ? 3.4 : 2.8;
    py = 0.12;
    playFoley("bounce", foleyVol);
  }
  function update(dt) {
    if (vy !== 0 || py > 0.105) {
      vy -= 9.8 * dt;
      py += vy * dt;
      ball.rotation.x += dt * 5;
      if (py <= 0.1) {
        py = 0.1;
        if (Math.abs(vy) > 0.65) {
          vy = -vy * 0.72;
          playFoley("bounce", foleyVol * 0.8);
        } else {
          vy = 0;
        }
      }
      ball.position.y = py;
    }
  }
  return { group: g, trigger, update };
}

function buildRubiksCube(asset, foleyVol) {
  const g = new THREE.Group();
  g.name = `Asset_${asset.id}`;
  const colors = ["#ef4444", "#2563eb", "#facc15", "#22c55e", "#f97316", "#f8fafc"];
  const cubePivot = new THREE.Group();
  cubePivot.position.y = 0.075;
  const topSlice = new THREE.Group();
  const s = 0.036;

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        const c = colors[Math.abs(x + y * 2 + z * 3) % colors.length];
        const piece = new THREE.Mesh(
          new THREE.BoxGeometry(s * 0.9, s * 0.9, s * 0.9),
          new THREE.MeshStandardMaterial({ color: c, roughness: 0.28 })
        );
        piece.position.set(x * s, y * s, z * s);
        piece.castShadow = true;
        if (y === 1) topSlice.add(piece);
        else cubePivot.add(piece);
      }
    }
  }
  cubePivot.add(topSlice);
  const grip = new THREE.Object3D();
  grip.name = "socket_hand_grip";
  grip.position.set(0, 0.08, 0);
  g.add(cubePivot, grip);

  let twistTimer = 0;
  let stepCount = 0;
  function trigger() {
    twistTimer = 3.2;
    stepCount = 0;
    playFoley("rubik", foleyVol);
  }
  function update(dt) {
    if (twistTimer > 0) {
      twistTimer -= dt;
      topSlice.rotation.y += dt * 4.2;
      cubePivot.rotation.z = Math.sin(twistTimer * 3) * 0.25;
      if (Math.floor((3.2 - twistTimer) * 3) > stepCount) {
        stepCount++;
        playFoley("rubik", foleyVol);
      }
      if (twistTimer <= 0) {
        topSlice.rotation.y = Math.round(topSlice.rotation.y / (Math.PI / 2)) * (Math.PI / 2);
        cubePivot.rotation.z = 0;
      }
    }
  }
  return { group: g, trigger, update };
}

function buildRcDrone(asset, foleyVol) {
  const g = new THREE.Group();
  g.name = `Asset_${asset.id}`;
  const drone = new THREE.Group();
  drone.position.set(0, 0.95, 0);

  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.04, 0.14),
    new THREE.MeshStandardMaterial({ color: "#38bdf8", roughness: 0.3, metalness: 0.6 })
  );
  hull.name = "DroneMetalBody";
  drone.add(hull);
  const rotors = [];
  for (const [rx, rz] of [
    [-0.1, -0.1],
    [0.1, -0.1],
    [-0.1, 0.1],
    [0.1, 0.1],
  ]) {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.005, 0.016),
      new THREE.MeshStandardMaterial({ color: "#e2e8f0", roughness: 0.4 })
    );
    blade.position.set(rx, 0.03, rz);
    drone.add(blade);
    rotors.push(blade);
  }
  g.add(drone);

  const spline = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0, 0.95, 0),
      new THREE.Vector3(0.45, 1.35, -0.25),
      new THREE.Vector3(0.2, 1.55, 0.35),
      new THREE.Vector3(-0.45, 1.25, 0.2),
    ],
    true
  );

  let flightT = 0;
  let flying = false;
  function trigger() {
    flying = true;
    flightT = 0.001;
    playFoley("drone", foleyVol);
  }
  function update(dt, time) {
    const speed = flying ? 28 : 8;
    for (const r of rotors) r.rotation.y += dt * speed;
    if (flying) {
      flightT += dt * 0.18;
      if (flightT >= 1) {
        flying = false;
        drone.position.set(0, 0.95, 0);
      } else {
        spline.getPoint(flightT, drone.position);
        drone.rotation.z = Math.sin(flightT * Math.PI * 4) * 0.18;
      }
    } else {
      drone.position.y = 0.92 + Math.sin(time * 2.2) * 0.04;
    }
  }
  return { group: g, trigger, update, getTargetPosition: () => drone.getWorldPosition(new THREE.Vector3()) };
}

function buildRetroHandheld(asset, foleyVol) {
  const g = new THREE.Group();
  g.name = `Asset_${asset.id}`;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.095, 0.15, 0.025),
    new THREE.MeshStandardMaterial({ color: "#8b5cf6", roughness: 0.35 })
  );
  body.position.y = 0.075;
  body.castShadow = true;
  const screenMat = new THREE.MeshStandardMaterial({
    color: "#bbf7d0",
    emissive: "#4ade80",
    emissiveIntensity: 0.9,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.068, 0.056), screenMat);
  screen.position.set(0, 0.105, 0.0135);
  const grip = new THREE.Object3D();
  grip.name = "socket_hand_grip";
  grip.position.set(0, 0.08, 0);
  g.add(body, screen, grip);

  let playTimer = 0;
  function trigger() {
    playTimer = 3.0;
    playFoley("console", foleyVol);
  }
  function update(dt, time) {
    if (playTimer > 0) {
      playTimer -= dt;
      screenMat.emissiveIntensity = 1.2 + Math.sin(time * 16) * 0.5;
      body.rotation.z = Math.sin(time * 9) * 0.08;
    } else {
      body.rotation.z = 0;
      screenMat.emissiveIntensity = 0.5;
    }
  }
  return { group: g, trigger, update };
}

function buildHoloProjector(asset, foleyVol) {
  const g = new THREE.Group();
  g.name = `Asset_${asset.id}`;
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.105, 0.045, 16),
    new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.3, metalness: 0.7 })
  );
  base.name = "HoloMetalBase";
  base.position.y = 0.0225;

  const holoMat = new THREE.MeshBasicMaterial({ color: "#38bdf8", wireframe: true, transparent: true, opacity: 0.85 });
  const holo = new THREE.Mesh(new THREE.TorusKnotGeometry(0.075, 0.02, 48, 8), holoMat);
  holo.position.y = 0.22;

  const laserDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.035, 16),
    new THREE.MeshBasicMaterial({ color: "#f43f5e", side: THREE.DoubleSide })
  );
  laserDot.rotation.x = -Math.PI / 2;
  laserDot.position.set(0.35, 0.005, 0.45);
  laserDot.visible = false;

  g.add(base, holo, laserDot);

  let mode = "holo"; // holo | laser
  let timer = 0;
  function trigger(action = "play") {
    mode = action === "laser" ? "laser" : mode === "holo" ? "laser" : "holo";
    timer = 5.0;
    laserDot.visible = mode === "laser";
    holo.visible = mode === "holo";
    playFoley("holo", foleyVol);
  }
  function update(dt, time) {
    holo.rotation.y += dt * 1.4;
    holo.rotation.x = Math.sin(time * 0.8) * 0.25;
    if (timer > 0) {
      timer -= dt;
      if (mode === "laser") {
        laserDot.position.set(Math.cos(time * 2.4) * 0.5, 0.008, Math.sin(time * 3.1) * 0.4 + 0.45);
      }
      if (timer <= 0) {
        laserDot.visible = false;
        holo.visible = true;
        mode = "holo";
      }
    }
  }
  return { group: g, trigger, update };
}

function buildNewtonsCradle(asset, foleyVol) {
  const g = new THREE.Group();
  g.name = `Asset_${asset.id}`;
  const frameMat = new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.25, metalness: 0.85 });
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.02, 0.14),
    new THREE.MeshStandardMaterial({ color: "#3b2f2f", roughness: 0.5 })
  );
  base.name = "CradleWoodBase";
  base.position.y = 0.01;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 8), frameMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 0.21;
  g.add(base, bar);

  const pivots = [];
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Group();
    p.position.set((i - 2) * 0.032, 0.21, 0);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.14, 6), frameMat);
    string.position.y = -0.07;
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.0155, 14, 14), frameMat);
    sphere.name = "CradleMetalSphere";
    sphere.position.y = -0.14;
    p.add(string, sphere);
    g.add(p);
    pivots.push(p);
  }

  let energy = 0.45;
  let lastSide = 1;
  function trigger() {
    energy = 1.0;
    playFoley("cradle", foleyVol);
  }
  function update(dt, time) {
    energy = Math.max(0.12, energy - dt * 0.08);
    const s = Math.sin(time * 5.2);
    const angle = s * 0.55 * energy;
    if ((s > 0 && lastSide < 0) || (s < 0 && lastSide > 0)) {
      lastSide = s >= 0 ? 1 : -1;
      if (energy > 0.35) playFoley("cradle", foleyVol * energy * 0.5);
    }
    pivots[0].rotation.z = Math.min(0, angle);
    pivots[4].rotation.z = Math.max(0, angle);
  }
  return { group: g, trigger, update };
}

function buildStackingBlocks(asset, foleyVol) {
  const g = new THREE.Group();
  g.name = `Asset_${asset.id}`;
  const cols = ["#f87171", "#fbbf24", "#34d399", "#60a5fa"];
  const blocks = cols.map((c, idx) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.06, 0.075),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.48 })
    );
    m.name = `BlockWood_${idx}`;
    m.position.set(0, 0.03 + idx * 0.062, 0);
    m.castShadow = true;
    g.add(m);
    return m;
  });

  let stacked = true;
  function trigger(action = "play") {
    stacked = action === "topple" ? false : !stacked;
    playFoley("block", foleyVol);
    blocks.forEach((b, i) => {
      if (stacked) {
        b.position.set(0, 0.03 + i * 0.062, 0);
        b.rotation.set(0, i * 0.08, 0);
      } else {
        b.position.set((i - 1.5) * 0.09, 0.03, ((i % 2) - 0.5) * 0.08);
        b.rotation.set(0.1, i * 0.7, 0.25);
      }
    });
  }
  return { group: g, trigger, isStacked: () => stacked, update() {} };
}

function buildMiniSynth(asset, foleyVol) {
  const g = new THREE.Group();
  g.name = `Asset_${asset.id}`;
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.032, 0.14),
    new THREE.MeshStandardMaterial({ color: "#b45309", roughness: 0.5 })
  );
  deck.name = "KalimbaWoodDeck";
  deck.position.y = 0.016;
  deck.castShadow = true;
  g.add(deck);

  const keys = [];
  for (let i = 0; i < 6; i++) {
    const kMat = new THREE.MeshStandardMaterial({ color: "#e2e8f0", emissive: "#38bdf8", emissiveIntensity: 0.1, roughness: 0.25, metalness: 0.75 });
    const key = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.012, 0.075), kMat);
    key.position.set((i - 2.5) * 0.034, 0.036, 0.015);
    g.add(key);
    keys.push({ mesh: key, mat: kMat });
  }

  let melodyTimer = 0;
  let lastNote = -1;
  const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
  function trigger() {
    melodyTimer = 1.8;
    lastNote = -1;
  }
  function update(dt) {
    if (melodyTimer > 0) {
      melodyTimer -= dt;
      const step = Math.floor((1.8 - melodyTimer) * 4) % keys.length;
      if (step !== lastNote) {
        lastNote = step;
        playFoley("kalimba", foleyVol, scale[step]);
        keys.forEach((k, idx) => {
          k.mat.emissiveIntensity = idx === step ? 1.8 : 0.1;
          k.mesh.position.y = idx === step ? 0.031 : 0.036;
        });
      }
      if (melodyTimer <= 0) {
        keys.forEach((k) => {
          k.mat.emissiveIntensity = 0.1;
          k.mesh.position.y = 0.036;
        });
      }
    }
  }
  return { group: g, trigger, update };
}
