// ---------- RoomRenderer: draws a room document ----------
// Replaces 1.0's RoomScene (places) and UnifiedRoomManager (v1 props): one renderer for one room system.
// configure(room, look) takes a room document (src/js/room/model.mjs) and builds what's needed:
//   architecture (floor, walls with openings, ceiling, the view outside), every visible asset by its
//   builder, one merged mesh of soft contact shadows under them, a budget of practical lights (lamps,
//   candles, screens), the mood, the bounce light, room reflections, and the backdrop layer (§5.9).
// Scenes and schedules decide what is there right now (schedule.mjs).
//
// A template whose set isn't rebuilt from catalog things yet still has its 1.0 set drawn by the old place
// builders (through RoomScene, kept inside); its assets are added on top. That bridge goes when every
// template is rebuilt (docs/release-1.1/PLAN.md, step 4).
import * as THREE from "three";
import { RoomScene } from "../../robot/room3d.js";
import { sanitizeRoom as sanitizeLegacyRoom, resolved, activeSeason } from "../../robot/room.mjs";
import { CATALOG_BY_ID } from "../catalog.mjs";
import { worldTransform, footprintOf } from "../model.mjs";
import { effectiveRoom } from "../schedule.mjs";
import { legacyRoomOf } from "../as-legacy.mjs";
import { MOOD_BY_ID, CHROMA } from "../choices.mjs";
import { buildAsset, hasBuilder } from "./assets/index.js";
import { recolor } from "./kit/build.js";
import { contactShadowTexture } from "./kit/textures.js";
import { buildArchitecture, updateCutaway, wallOf, WALL_FACING } from "./architecture.js";
import { outsideTexture } from "./outside.js";

const RAD = Math.PI / 180;
export const LIGHT_BUDGET = { low: 0, medium: 2, high: 4, ultra: 6 };
// Flat things don't get a contact shadow (rugs, mats, pads), nor do wall and ceiling things
const NO_DECAL = (def, a) => !def || def.overlap || def.height < 0.03 || a.slot === "wall" || a.slot === "ceiling";

// The hour the room shows (fixed, the real clock, or the template's own)
export function roomHour(room, now = new Date()) {
  const a = room.atmosphere;
  if (a.timeMode === "clock") return now.getHours() + now.getMinutes() / 60;
  if (a.timeMode === "manual") return a.timeHour;
  return a.timeHour ?? 14;
}

// The mood after the clock: following the real clock moves through morning, day, golden, evening, night
export function roomMood(room, now = new Date()) {
  const a = room.atmosphere;
  if (a.timeMode !== "clock") return a.mood;
  const h = roomHour(room, now);
  if (h >= 6 && h < 9) return "morning";
  if (h >= 9 && h < 17) return "day";
  if (h >= 17 && h < 20) return "golden";
  if (h >= 20 && h < 22.5) return "evening";
  return "night";
}

export class RoomRenderer {
  constructor(stage, world) {
    this.stage = stage;
    this.world = world;
    this.legacy = new RoomScene(stage, world);
    this.group = new THREE.Group();
    this.group.name = "Room";
    stage.scene.add(this.group);
    this.assetGroup = new THREE.Group();
    this.assetGroup.name = "Assets";
    this.group.add(this.assetGroup);
    this.instances = new Map(); // asset id → { key, built, def }
    this.arch = null;
    this.archKey = "";
    this.doc = null;
    this.mode = "legacy"; // "legacy" (a 1.0 room object), "doc" (a room document), "dock"
    this.layer = "full";
    this.ownBackdrop = null;
    this.lights = [];
    this.lightLevel = "";
    this.decals = null;
    this.roomGlow = [];
    this.version = 0;
    this.envKey = "";
    this.envTimer = 0;
    this.hidden = new Set();
  }

  // ---- what the engine reads ----
  get key() {
    return `${this.legacy.key}|${this.archKey}|${this.version}`;
  }
  get glowing() {
    return new Set([...this.legacy.glowing, ...this.roomGlow]);
  }
  get backdrop() {
    return this.ownBackdrop || this.legacy.backdrop;
  }
  get isChroma() {
    return this.layer === "chroma_green" || this.layer === "chroma_blue" || Boolean(this.legacy.place?.chroma);
  }
  get place() {
    return this.legacy.place;
  }
  get built() {
    return this.mode === "doc" && !this.doc?.legacy ? { roam: 1 } : this.legacy.built;
  }
  set weatherState(v) {
    this.legacy.weatherState = v;
  }
  get weatherState() {
    return this.legacy.weatherState;
  }

  // room: a room document ({ schema, … }) or a 1.0 room object; look: { light, level, filming, now }
  configure(room, look) {
    if (!room || !room.schema) {
      // A 1.0 room object (nothing migrated yet, or an old look being previewed)
      this.mode = "legacy";
      this.clearDoc();
      this.layer = "full";
      this.ownBackdrop = null;
      this.stage.setRoomBounds(null);
      this.legacy.configure(room, look);
      return this;
    }
    this.mode = "doc";
    this.doc = room;
    const level = look.level || "high";
    const eff = effectiveRoom(room, { now: look.now || new Date(), filming: Boolean(look.filming) });
    this.hidden = eff.hidden;
    const doc = eff.room;
    this.layer = room.backdrop?.layer || "full";
    const chroma = this.layer === "chroma_green" || this.layer === "chroma_blue";
    // ---- The set: the 1.0 place's, or the room's own architecture ----
    if (chroma) {
      this.legacy.configure(sanitizeLegacyRoom({ place: this.layer === "chroma_blue" ? "blue" : "green" }), look);
      this.clearArchitecture();
      this.assetGroup.visible = false;
      this.ownBackdrop = { mode: "flat", bg: new THREE.Color(this.layer === "chroma_blue" ? CHROMA.blue : CHROMA.green), edge: new THREE.Color(this.layer === "chroma_blue" ? CHROMA.blue : CHROMA.green), glow: 0, glowColor: new THREE.Color(), blobs: [] };
      this.stage.setRoomBounds(null);
      this.syncLights([], level);
      this.version++;
      return this;
    }
    this.assetGroup.visible = true;
    if (doc.legacy) {
      this.legacy.configure(legacyRoomOf(doc), look);
      this.clearArchitecture();
      this.ownBackdrop = null;
      if (!["studio", "day", "golden", "evening", "night", "neon", "fireside"].includes(roomMood(doc))) this.stage.setMood(roomMood(doc), doc.atmosphere.brightness);
      this.stage.setRoomBounds(null);
    } else {
      this.legacy.clear();
      this.legacy.key = "";
      this.legacy.place = null;
      for (const mesh of Object.values(this.legacy.floors)) mesh.visible = false;
      if (doc.architecture.floor.material === "grid") this.legacy.floors.grid.visible = true;
      this.buildArchitecture(doc, level);
      this.stage.setMood(roomMood(doc), doc.atmosphere.brightness);
      this.stage.setChroma(false);
      this.configureAir(doc);
      this.ownBackdrop = this.backdropFor(doc);
    }
    this.syncAssets(doc, level);
    this.syncDecals(doc);
    this.syncLights(doc.assets.filter((a) => !this.hidden.has(a.id)), level, doc);
    if (!doc.legacy) {
      const box = this.arch?.bounds?.clone() || new THREE.Box3(new THREE.Vector3(-doc.size.w / 2, 0, -doc.size.d / 2), new THREE.Vector3(doc.size.w / 2, doc.size.h, doc.size.d / 2));
      this.stage.setRoomBounds(box, { floorColor: doc.architecture.floor.color, mapSize: level === "low" ? 1024 : level === "medium" ? 2048 : 4096, soft: level === "high" || level === "ultra" ? 5 : 3 });
      this.scheduleEnvironment(doc);
    }
    // Selected-things layer: only the chosen things stay
    if (this.layer === "selected") {
      const keep = new Set(room.backdrop.keep || []);
      for (const [id, inst] of this.instances) inst.built.group.visible = keep.has(id);
      if (this.arch) this.arch.group.visible = false;
      this.legacy.group.visible = false;
      if (this.decals) this.decals.visible = false;
    } else {
      this.legacy.group.visible = true;
      if (this.arch) this.arch.group.visible = true;
      if (this.decals) this.decals.visible = true;
    }
    this.version++;
    return this;
  }

  backdropFor(doc) {
    const a = doc.architecture;
    if (this.layer === "solid") {
      const c = new THREE.Color(doc.backdrop.color);
      return { mode: "flat", bg: c, edge: c, glow: 0, glowColor: new THREE.Color(), blobs: [] };
    }
    if (a.outside !== "none" && a.outside !== "photo") return { mode: "image", texture: outsideTexture(a.outside, roomHour(doc), 11), aspect: 2, dim: 0, bg: new THREE.Color(a.backdrop.bg), edge: new THREE.Color(a.backdrop.edge), glow: 0, glowColor: new THREE.Color(), blobs: [] };
    if (a.outside === "photo") return { mode: "image", bg: new THREE.Color(a.backdrop.bg), edge: new THREE.Color(a.backdrop.edge), glow: 0, glowColor: new THREE.Color(), blobs: [] };
    const bg = new THREE.Color(a.backdrop.bg);
    return { mode: "vignette", bg, edge: bg.clone().multiplyScalar(0.35), glow: a.backdrop.glow, glowColor: new THREE.Color(a.backdrop.glowColor || "#ffffff"), blobs: [] };
  }

  configureAir(doc) {
    const a = doc.atmosphere;
    const season = activeSeason(a.season);
    let kind = a.air === "none" ? "" : a.air;
    if (!kind && a.weatherSync && this.legacy.weatherState === "snow") kind = "snow";
    else if (!kind && season === "winter") kind = "snow";
    this.world.configure({ air: { kind, amount: a.airAmount, color: kind === "petals" ? new THREE.Color(doc.architecture.palette.detail) : null }, bokeh: false, shaft: false, rings: false, reflection: doc.architecture.floor.material === "glossy" });
  }

  // ---- Architecture ----
  buildArchitecture(doc, level) {
    const openings = doc.assets.filter((a) => a.slot === "wall" && CATALOG_BY_ID[a.type]?.opening && !this.hidden.has(a.id)).map((a) => [a.id, a.pos, a.scale, a.variant]);
    const key = JSON.stringify([doc.size, doc.architecture, openings, level, Math.floor(roomHour(doc) * 2)]);
    if (key === this.archKey && this.arch) return;
    this.clearArchitecture();
    this.arch = buildArchitecture(doc, { level, hidden: this.hidden });
    this.group.add(this.arch.group);
    this.archKey = key;
  }

  clearArchitecture() {
    if (!this.arch) return;
    this.arch.group.removeFromParent();
    disposeOwned(this.arch.group);
    for (const w of this.arch.walls) w.faded?.dispose();
    this.arch = null;
    this.archKey = "";
  }

  // ---- Assets ----
  syncAssets(doc, level) {
    const byId = new Map(doc.assets.map((a) => [a.id, a]));
    const seen = new Set();
    this.roomGlow = [...(this.arch?.glowing || [])];
    for (const a of doc.assets) {
      if (this.hidden.has(a.id)) continue;
      const def = CATALOG_BY_ID[a.type];
      if (!def || !hasBuilder(def)) continue;
      seen.add(a.id);
      const shapeKey = JSON.stringify([a.type, a.state, level, a.glb, a.variant === "M" ? "" : ""]);
      let inst = this.instances.get(a.id);
      if (!inst || inst.shapeKey !== shapeKey) {
        if (inst) this.dropInstance(a.id);
        const built = buildAsset(def, a, level);
        if (!built) continue;
        built.group.userData.assetId = a.id;
        built.group.userData.propId = a.id;
        built.group.userData.interactive = a.rules?.permission !== "never";
        this.assetGroup.add(built.group);
        inst = { shapeKey, colorKey: JSON.stringify(a.colors), built, def };
        this.instances.set(a.id, inst);
      } else if (inst.colorKey !== JSON.stringify(a.colors)) {
        recolor(inst.built, def, a.colors, level);
        inst.colorKey = JSON.stringify(a.colors);
      }
      const t = worldTransform(doc, a, byId);
      const k = a.scale * (def.variants?.[a.variant] ?? 1);
      const g = inst.built.group;
      g.position.set(t.x, t.y, t.z);
      g.rotation.set(0, t.rot * RAD, 0);
      g.scale.setScalar(k);
      if (a.slot === "ceiling") g.position.y = doc.size.h;
      this.roomGlow.push(...inst.built.glowing);
    }
    for (const id of [...this.instances.keys()]) if (!seen.has(id)) this.dropInstance(id);
  }

  dropInstance(id) {
    const inst = this.instances.get(id);
    if (!inst) return;
    inst.built.group.removeFromParent();
    disposeOwned(inst.built.group);
    this.instances.delete(id);
  }

  // One mesh for every soft footprint shadow in the room (one draw call)
  syncDecals(doc) {
    const byId = new Map(doc.assets.map((a) => [a.id, a]));
    const pos = [];
    const uv = [];
    for (const a of doc.assets) {
      if (this.hidden.has(a.id) || !this.instances.has(a.id)) continue;
      const def = CATALOG_BY_ID[a.type];
      if (NO_DECAL(def, a)) continue;
      const corners = footprintOf(doc, a, byId);
      const t = worldTransform(doc, a, byId);
      // Grown a little past the footprint, so the shadow fades out around the thing
      const cx = corners.reduce((s, c) => s + c[0], 0) / 4;
      const cz = corners.reduce((s, c) => s + c[1], 0) / 4;
      const grow = (c) => [cx + (c[0] - cx) * 1.35, cz + (c[1] - cz) * 1.35];
      const [p0, p1, p2, p3] = corners.map(grow);
      const y = t.y + 0.003;
      pos.push(...p0.flatMap((v, i) => (i ? [y, v] : [v])), ...p1.flatMap((v, i) => (i ? [y, v] : [v])), ...p2.flatMap((v, i) => (i ? [y, v] : [v])));
      pos.push(...p0.flatMap((v, i) => (i ? [y, v] : [v])), ...p2.flatMap((v, i) => (i ? [y, v] : [v])), ...p3.flatMap((v, i) => (i ? [y, v] : [v])));
      uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    }
    if (this.decals) {
      this.decals.geometry.dispose();
      this.decals.removeFromParent();
      this.decals = null;
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    if (!this.decalMaterial) {
      this.decalMaterial = new THREE.MeshBasicMaterial({ color: "#000000", map: contactShadowTexture(), transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
    }
    this.decals = new THREE.Mesh(geo, this.decalMaterial);
    this.decals.renderOrder = 1;
    this.decals.name = "contact-shadows";
    this.group.add(this.decals);
  }

  // ---- Practical lights: a fixed number per tier (no shader recompiles), given to the strongest nearest lamps ----
  syncLights(assets, level, doc) {
    const budget = LIGHT_BUDGET[level] ?? 4;
    if (this.lightLevel !== level) {
      for (const l of this.lights) l.removeFromParent(), l.dispose?.();
      this.lights = Array.from({ length: budget }, () => {
        const l = new THREE.PointLight("#ffc98a", 0, 3, 2);
        l.castShadow = false;
        this.group.add(l);
        return l;
      });
      this.lightLevel = level;
    }
    const byId = doc ? new Map(doc.assets.map((a) => [a.id, a])) : new Map();
    const candidates = [];
    for (const a of assets) {
      const def = CATALOG_BY_ID[a.type];
      if (!def?.light || a.state?.on === false || !this.instances.has(a.id)) continue;
      const t = worldTransform(doc, a, byId);
      const k = a.scale * (def.variants?.[a.variant] ?? 1);
      const at = def.light.at || [0, 1, 0];
      const c = Math.cos(t.rot * RAD);
      const s = Math.sin(t.rot * RAD);
      const p = new THREE.Vector3(t.x + (at[0] * c + at[2] * s) * k, t.y + at[1] * k, t.z + (-at[0] * s + at[2] * c) * k);
      candidates.push({ p, def, weight: def.light.intensity / (1 + p.distanceTo(new THREE.Vector3(0, 0.8, 0.5))) });
    }
    candidates.sort((x, y) => y.weight - x.weight);
    this.lights.forEach((l, i) => {
      const c = candidates[i];
      if (!c) {
        l.intensity = 0;
        return;
      }
      l.position.copy(c.p);
      l.color.set(c.def.light.color);
      // three.js lights are physical: a lamp of "1" is about a 25 W bulb at these distances
      l.intensity = c.def.light.intensity * 1.6;
      l.distance = c.def.light.distance;
    });
  }

  // Reflections from this room, rebuilt a moment after the architecture or mood settles
  scheduleEnvironment(doc) {
    const wins = doc.assets.filter((a) => a.slot === "wall" && CATALOG_BY_ID[a.type]?.opening && !this.hidden.has(a.id));
    const spec = {
      w: doc.size.w,
      d: doc.size.d,
      h: doc.size.h,
      wall: doc.architecture.wall.color,
      floor: doc.architecture.floor.color,
      ceiling: doc.architecture.ceiling.kind === "none" ? "#20222a" : doc.architecture.ceiling.color,
      light: (MOOD_BY_ID[roomMood(doc)] || MOOD_BY_ID.studio).key[0],
      windows: wins.map((a) => ({ x: a.pos[0], y: a.pos[1] + 0.8, z: a.pos[2] + 0.05, w: 1, h: 1.2, color: roomHour(doc) > 19 || roomHour(doc) < 6 ? "#3a4a7a" : "#dff0ff" })),
    };
    const key = JSON.stringify(spec);
    if (key === this.envKey) return;
    this.envKey = key;
    clearTimeout(this.envTimer);
    this.envTimer = setTimeout(() => this.stage.makeRoomEnvironment(spec), 120);
  }

  configureDock() {
    this.mode = "dock";
    this.clearDoc();
    this.layer = "full";
    this.ownBackdrop = null;
    this.stage.setRoomBounds(null);
    this.legacy.configureDock();
    return this;
  }

  clearDoc() {
    for (const id of [...this.instances.keys()]) this.dropInstance(id);
    this.clearArchitecture();
    if (this.decals) {
      this.decals.geometry.dispose();
      this.decals.removeFromParent();
      this.decals = null;
    }
    for (const l of this.lights) l.intensity = 0;
    this.roomGlow = [];
    this.doc = null;
  }

  // Tapping a thing (or the AI's robot_use_prop): switch it, if it can be switched
  triggerProp(propId, action = "toggle") {
    if (this.mode !== "doc") return this.legacy.triggerProp(propId, action);
    const id = String(propId || "");
    const asset = this.doc.assets.find((a) => a.id === id) || this.doc.assets.find((a) => a.type === id) || this.doc.assets.find((a) => a.type.includes(id) || id.includes(a.type));
    const inst = asset && this.instances.get(asset.id);
    if (!inst) return this.legacy.triggerProp(propId, action);
    const def = inst.def;
    let state = true;
    if (def.states && "on" in def.states) {
      asset.state = { ...asset.state, on: action === "on" ? true : action === "off" ? false : !(asset.state?.on ?? def.states.on) };
      state = asset.state.on;
    }
    const pos = new THREE.Vector3();
    inst.built.group.getWorldPosition(pos);
    return { triggered: true, propId: asset.id, state, position: { x: pos.x, y: pos.y, z: pos.z }, changed: asset };
  }

  update(dt, pose, fx = {}, camera = null) {
    this.legacy.update(dt, pose, fx);
    if (this.mode !== "doc") return;
    const wind = this.doc?.atmosphere?.wind ?? 0.3;
    const f = { ...fx, wind };
    for (const inst of this.instances.values()) inst.built.update?.(dt, this.legacy.time, f);
    if (this.arch && camera) updateCutaway(this.arch.walls, camera, this.doc.architecture.cutaway, dt);
  }

  dispose() {
    clearTimeout(this.envTimer);
    this.clearDoc();
    for (const l of this.lights) l.removeFromParent();
    this.decalMaterial?.dispose();
    this.legacy.dispose();
    this.group.removeFromParent();
  }
}

// Frees what an asset or the architecture owns (shared kit materials and textures stay)
function disposeOwned(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    for (const m of [].concat(o.material || [])) {
      if (!m || m.userData?.shared) continue;
      for (const k of ["map", "alphaMap", "emissiveMap"]) if (m[k] && !m[k].userData?.shared) m[k].dispose();
      m.dispose();
    }
  });
}

export { wallOf, WALL_FACING, resolved, legacyRoomOf };
