// ---------- The room around the robot, in 3D ----------
// Turns the room settings (room.mjs) into what's drawn: a backdrop painted behind everything (the
// engine's last pass), the set pieces of the place (places/*.js), the floor, the light, and the
// air that drifts through. The World (world.js) does the mirror image, the particles, the bokeh and the rings.
import * as THREE from "three";
import { PLACE_BY_ID, LIGHT_MOODS, resolved, activeSeason } from "./room.mjs";
import { radialTexture } from "./scene.js";
import { Kept, canvasTexture } from "./places/kit.js";
import { PLACE_BUILDERS } from "./places/index.js";
import { augmentPlaceProps, buildCompanions, buildSeasonalSet, buildCustomBuilderItems } from "./places/props3d.js";

const FLOOR_SIZE = 18;

// A soft round alpha: opaque in the middle, gone at the edge (a floor that fades into the backdrop)
const fadeTexture = (inner = 0.28, size = 256) =>
  canvasTexture(size, size, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "#fff");
    g.addColorStop(inner, "#fff");
    g.addColorStop(1, "#000");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { srgb: false });

const GRID_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// A glowing grid on the floor that fades out into the distance and glows brightest near the robot
const GRID_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uBase;
uniform vec3 uRobot;
uniform float uTime;
varying vec3 vWorld;
float line(float v, float width) {
  float f = abs(fract(v - 0.5) - 0.5) / fwidth(v);
  return 1.0 - clamp(f / width, 0.0, 1.0);
}
void main() {
  vec2 p = vWorld.xz;
  float g = max(line(p.x, 1.2), line(p.y, 1.2));
  float big = max(line(p.x * 0.2, 1.8), line(p.y * 0.2, 1.8));
  float d = length(p - uRobot.xz);
  float fade = smoothstep(7.5, 0.5, d);
  float pulse = 0.85 + 0.15 * sin(d * 2.5 - uTime * 1.2);
  vec3 c = uBase + uColor * (g * 0.5 + big * 0.9) * fade * pulse;
  float a = clamp(0.88 * smoothstep(8.5, 3.0, d) , 0.0, 1.0);
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`;

export class RoomScene {
  // stage: the Stage (lights, shadows); world: the World (air, mirror…)
  constructor(stage, world) {
    this.stage = stage;
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = "Room";
    stage.scene.add(this.group);
    this.kept = new Kept(); // what the floors need, for good
    this.placeKept = new Kept(); // what the current place needs, until the next one
    this.key = "";
    this.built = null;
    this.backdrop = { mode: "vignette", bg: new THREE.Color("#26272c"), edge: new THREE.Color("#0b0b0d"), glow: 0, glowColor: new THREE.Color("#6f9cf5"), blobs: [] };
    this.glowing = new Set();
    this.robotAt = new THREE.Vector3();
    this.floor = null;
    this.floorKind = "";
    this.time = 0;
    this.makeFloors();
  }

  makeFloors() {
    const geo = this.kept.add(new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE));
    const fade = this.kept.add(fadeTexture(0.34));
    const fadeWide = this.kept.add(fadeTexture(0.5));
    const poolTexture = this.kept.add(radialTexture([[0, "rgba(255,255,255,0.78)"], [0.5, "rgba(255,255,255,0.62)"], [1, "rgba(255,255,255,0)"]], 256));
    this.floors = {
      // A dark glossy pool under the robot that fades into the room; the mirror image shows through it
      glossy: new THREE.Mesh(geo, this.kept.add(new THREE.MeshBasicMaterial({ map: poolTexture, transparent: true, depthWrite: false, toneMapped: false }))),
      // A matte floor that takes the light and the robot's shadow
      matte: new THREE.Mesh(geo, this.kept.add(new THREE.MeshLambertMaterial({ transparent: true, alphaMap: fade, depthWrite: false }))),
      grid: new THREE.Mesh(
        geo,
        this.kept.add(
          new THREE.ShaderMaterial({
            vertexShader: GRID_VERTEX,
            fragmentShader: GRID_FRAGMENT,
            transparent: true,
            depthWrite: false,
            uniforms: { uColor: { value: new THREE.Color("#6a5cff") }, uBase: { value: new THREE.Color("#0d1030") }, uRobot: { value: this.robotAt }, uTime: { value: 0 } },
          })
        )
      ),
    };
    this.floors.glossy.scale.set(0.28, 0.28, 1); // the pool is smaller than the matte floor
    void fadeWide;
    for (const [kind, mesh] of Object.entries(this.floors)) {
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.001;
      mesh.renderOrder = 0;
      mesh.receiveShadow = kind === "matte";
      mesh.visible = false;
      this.group.add(mesh);
    }
  }

  // room: the settings; look: { light (THREE.Color), level, friendly }
  configure(room, look) {
    const info = resolved(room);
    const place = info.place;
    this.place = place;
    this.info = info;
    const glow = room.colors.glow ? new THREE.Color(room.colors.glow) : look.light.clone();
    const colors = { wall: new THREE.Color(room.colors.wall), floor: new THREE.Color(room.colors.floor), glow, detail: new THREE.Color(room.colors.detail) };
    this.colors = colors;
    const season = activeSeason(room.season);
    const key = JSON.stringify([
      room.place,
      room.colors,
      room.props,
      room.sign,
      room.companions,
      season,
      room.timeMode,
      room.timeHour,
      room.weatherSync,
      this.weatherState,
      room.builder,
      info.light,
      look.light.getHex(),
      look.level === "low",
    ]);
    if (key !== this.key) {
      this.key = key;
      this.clear();
      const keep = (x) => this.placeKept.add(x);
      const build = PLACE_BUILDERS[room.place];
      this.built = build ? build({ THREE, group: this.group, room, place, colors, glow, props: room.props, sign: room.sign, mood: info.light, light: look.light, level: look.level, keep, stage: this.stage }) : null;
      this.glowing = new Set(this.built?.glow || []);
      this.backdrop = this.built?.backdrop || this.backdrop;
      this.extraUpdaters = [];
      if (!place.chroma && room.place !== "photo") {
        const aug = augmentPlaceProps(room.place, room.props, this.group, { keep, colors, glow, level: look.level });
        const comp = buildCompanions(room.companions, { group: this.group, keep, glow, level: look.level });
        const seas = buildSeasonalSet(room.season, { group: this.group, keep, level: look.level });
        const bld = buildCustomBuilderItems(room.builder, { group: this.group, keep, colors, glow, level: look.level });
        for (const m of [...aug.glow, ...comp.glow, ...seas.glow, ...bld.glow]) this.glowing.add(m);
        this.extraUpdaters.push(...aug.updaters, ...comp.updaters, ...seas.updaters, ...bld.updaters);
      }
    }
    // The floor: the one asked for, unless the place makes its own
    const kind = this.built?.ownFloor ? "none" : info.floor;
    this.floorKind = kind;
    for (const [k, mesh] of Object.entries(this.floors)) mesh.visible = k === kind;
    // A place can ask for a smaller floor (a few clouds underfoot, not a ground to the horizon)
    const scale = this.built?.floorScale ?? 1;
    this.floors.matte.scale.set(scale, scale, 1);
    this.floors.glossy.material.color.copy(colors.floor);
    this.floors.matte.material.color.copy(colors.floor);
    const grid = this.floors.grid.material.uniforms;
    grid.uColor.value.copy(colors.glow.clone().lerp(colors.detail, 0.35));
    grid.uBase.value.copy(colors.floor);
    // Time-of-day & lighting rig adjustment
    let lightMood = info.light;
    let brightness = room.brightness;
    if (!place.chroma) {
      let hour = 14;
      if (room.timeMode === "real") hour = new Date().getHours();
      else if (room.timeMode === "day") hour = 13;
      else if (room.timeMode === "sunset") hour = 18.5;
      else if (room.timeMode === "night") hour = 23;
      else if (room.timeMode === "manual") hour = Number(room.timeHour) || 14;
      if (room.timeMode && room.timeMode !== "place") {
        if (hour < 6 || hour >= 21) {
          if (room.light === "place") lightMood = "moonlight";
          brightness *= 0.84;
        } else if (hour >= 17 && hour < 21) {
          if (room.light === "place") lightMood = "sunset";
          brightness *= 0.94;
        }
      }
      if (room.builder?.lightingRig && room.builder.lightingRig !== "default") {
        const rigMap = { warm_lamp: "warm", studio_soft: "studio", neon_rim: "neon", golden_hour: "sunset", moonlight: "moonlight" };
        if (rigMap[room.builder.lightingRig]) lightMood = rigMap[room.builder.lightingRig];
      }
    }
    this.stage.setMood(lightMood, brightness);
    // The air and the effects (including seasonal or Weather connector air when applicable)
    const chroma = Boolean(place.chroma);
    let airKind = room.air === "none" ? "" : room.air;
    if (!airKind && !chroma && room.weatherSync && this.weatherState === "snow") airKind = "snow";
    else if (!airKind && !chroma && season === "winter") airKind = "snow";
    else if (!airKind && !chroma && season === "spring") airKind = "petals";
    else if (!airKind && !chroma && season === "summer") airKind = "fireflies";
    this.world.configure({
      air: { kind: airKind, amount: room.airAmount, color: this.airColor(room, colors, airKind) },
      bokeh: Boolean(room.props.bokeh),
      shaft: Boolean(room.props.shaft),
      rings: Boolean(room.props.rings),
      reflection: kind === "glossy" && !chroma,
    });
    this.stage.setChroma(chroma);
    return this;
  }

  // Petals, bubbles and so on take their color from the place (its detail color), not from the robot
  airColor(room, colors, kind = room.air) {
    if (kind === "petals") return colors.detail.clone();
    if (kind === "fireflies" || kind === "embers") return null;
    return null;
  }

  // Interactive prop trigger by propId (from click or AI tool robot_use_prop)
  triggerProp(propId, action = "toggle") {
    const id = String(propId || "").toLowerCase();
    let target = null;
    this.group.traverse((o) => {
      if (target) return;
      const pid = String(o.userData?.propId || "").toLowerCase();
      if (pid && (pid === id || pid.includes(id) || id.includes(pid))) {
        target = o;
      }
    });
    if (!target) return { triggered: false, propId };
    const state = target.userData.trigger ? target.userData.trigger(action) : true;
    const pos = new THREE.Vector3();
    target.getWorldPosition(pos);
    return { triggered: true, propId: target.userData.propId || propId, state, position: { x: pos.x, y: pos.y, z: pos.z } };
  }

  get isChroma() {
    return Boolean(this.place?.chroma);
  }

  // The little robot next to the chat: no set, no floor, no air; the engine paints the page's own colors behind it
  configureDock() {
    this.key = "dock";
    this.clear();
    this.place = null;
    this.info = null;
    this.backdrop = { mode: "dock", blobs: [] };
    for (const mesh of Object.values(this.floors)) mesh.visible = false;
    this.stage.setMood("studio", 1);
    this.stage.setChroma(false);
    this.world.configure({ air: { kind: "", amount: 1, color: null }, bokeh: false, shaft: false, rings: false, reflection: false });
    return this;
  }

  clear() {
    this.built?.dispose?.();
    this.placeKept.dispose();
    for (const child of [...this.group.children]) {
      if (Object.values(this.floors).includes(child)) continue;
      this.group.remove(child);
      child.traverse?.((o) => {
        o.geometry?.dispose?.();
        for (const m of [].concat(o.material || [])) {
          for (const k of ["map", "alphaMap", "emissiveMap"]) m[k]?.dispose?.();
          m.dispose?.();
        }
      });
    }
    this.built = null;
    this.glowing = new Set();
    this.extraUpdaters = [];
  }

  update(dt, pose, fx) {
    this.time += dt;
    const x = pose.posX || 0;
    const z = pose.posZ || 0;
    this.robotAt.set(x, 0, z);
    for (const mesh of Object.values(this.floors)) {
      mesh.position.x = x;
      mesh.position.z = z;
    }
    this.floors.grid.material.uniforms.uTime.value = this.time;
    const fxObj = fx || {};
    this.built?.update?.(dt, this.time, pose, fxObj);
    if (this.extraUpdaters?.length) {
      for (const fn of this.extraUpdaters) fn(dt, this.time, fxObj);
    }
  }

  dispose() {
    this.clear();
    this.kept.dispose();
    this.group.removeFromParent();
  }
}

export { LIGHT_MOODS, PLACE_BY_ID };
