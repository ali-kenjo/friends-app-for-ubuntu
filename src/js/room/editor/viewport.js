// ---------- The Room Editor's viewport: camera, picking, placing, handles ----------
// Works on the engine's own scene and canvas (the editor is a host of the shared robot engine). The
// camera orbits the room (or looks down on the plan, or out of the robot's eyes); things are picked by
// raycasting; a ghost follows the pointer while a thing is placed, green where it fits, red where it
// doesn't and amber where it would cut the robot off; a selected thing gets a footprint outline, a ring
// to turn it, a knob to size it and an arrow to lift it.
import * as THREE from "three";
import { entryFor } from "../catalog.mjs";
import { worldTransform, footprintOf } from "../model.mjs";
import { buildAsset } from "../render/assets/index.js";
import * as ops from "./ops.mjs";
import { lengthOf } from "./prefs.mjs";
import { nearestWall, WALL_FACING } from "./walls.mjs";

const RAD = Math.PI / 180;
const COLORS = { ok: new THREE.Color("#30a46c"), error: new THREE.Color("#e5484d"), warn: new THREE.Color("#f5a524"), select: new THREE.Color("#3e9bff") };
const EYE_LEVEL = 1.5;
const PICTURE_RAIL = 2.1;

export class Viewport {
  // ctx: { engine, host, getRoom, commit(room, label, opts), selection(), select(ids, opts), prefs(), announce(text), onWarn(info, accept), say(t, vars), onHover(id) }
  constructor(ctx) {
    this.ctx = ctx;
    this.engine = ctx.engine;
    this.host = ctx.host;
    this.view = "perspective";
    this.orbit = { target: new THREE.Vector3(0, 0.6, -0.4), yaw: 0.35, pitch: 0.42, dist: 6.2 };
    this.editorView = { position: [0, 2, 6], target: [0, 0.6, 0], fov: 38 };
    this.raycaster = new THREE.Raycaster();
    this.pointers = new Map();
    this.drag = null;
    this.ghost = null;
    this.overlay = new THREE.Group();
    this.overlay.name = "editor-overlay";
    this.handles = {};
    this.marquee = null;
    this.onDown = (e) => this.down(e);
    this.onMove = (e) => this.move(e);
    this.onUp = (e) => this.up(e);
    this.onWheel = (e) => this.wheel(e);
    this.onContext = (e) => e.preventDefault();
  }

  attach() {
    this.engine.stage.scene.add(this.overlay);
    this.host.addEventListener("pointerdown", this.onDown);
    this.host.addEventListener("pointermove", this.onMove);
    this.host.addEventListener("pointerup", this.onUp);
    this.host.addEventListener("pointercancel", this.onUp);
    this.host.addEventListener("wheel", this.onWheel, { passive: false });
    this.host.addEventListener("contextmenu", this.onContext);
    this.frameRoom();
  }

  detach() {
    this.cancelPlacing();
    this.stopMeasuring();
    this.overlay.removeFromParent();
    this.clearHandles();
    for (const [t, fn] of [["pointerdown", this.onDown], ["pointermove", this.onMove], ["pointerup", this.onUp], ["pointercancel", this.onUp], ["wheel", this.onWheel], ["contextmenu", this.onContext]]) this.host.removeEventListener(t, fn);
  }

  // ---------- Camera ----------
  setView(view) {
    this.view = view;
    if (view === "top") this.orbit.pitch = 1.5;
    else if (view === "perspective" && this.orbit.pitch > 1.2) this.orbit.pitch = 0.42;
    this.updateCamera();
  }

  frameRoom() {
    const room = this.ctx.getRoom();
    if (!room) return;
    const { w, d } = room.size;
    this.orbit.target.set(0, 0.5, -d * 0.12);
    this.orbit.dist = Math.max(w, d) * 1.15 + 1;
    this.updateCamera();
  }

  focus(ids) {
    const room = this.ctx.getRoom();
    const list = ids.map((id) => room.assets.find((a) => a.id === id)).filter(Boolean);
    if (!list.length) return this.frameRoom();
    const pts = list.map((a) => worldTransform(room, a));
    const c = pts.reduce((s, p) => s.add(new THREE.Vector3(p.x, p.y, p.z)), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const size = Math.max(...list.map((a) => Math.max(ops.defOf(a)?.footprint.w || 0.5, ops.defOf(a)?.height || 0.5) * a.scale));
    this.orbit.target.copy(c).add(new THREE.Vector3(0, size * 0.3, 0));
    this.orbit.dist = Math.max(1.2, size * 3.2);
    this.updateCamera();
  }

  updateCamera() {
    const room = this.ctx.getRoom();
    const o = this.orbit;
    const ev = this.editorView;
    if (this.view === "eyes" && room) {
      const h = room.robot.home;
      const f = h.facing * RAD;
      const eye = [h.pos[0] + Math.sin(f) * 0.12, 1.08, h.pos[2] + Math.cos(f) * 0.12];
      ev.position = eye;
      ev.target = [eye[0] + Math.sin(f) * 3, 0.95, eye[2] + Math.cos(f) * 3];
      ev.fov = 62;
      ev.up = null;
      return;
    }
    if (this.view === "top") {
      ev.position = [o.target.x, Math.max(4, o.dist * 1.6), o.target.z + 0.001];
      ev.target = [o.target.x, 0, o.target.z];
      ev.fov = 34;
      ev.up = [0, 0, -1];
      return;
    }
    const p = new THREE.Vector3(Math.sin(o.yaw) * Math.cos(o.pitch), Math.sin(o.pitch), Math.cos(o.yaw) * Math.cos(o.pitch)).multiplyScalar(o.dist).add(o.target);
    ev.position = p.toArray();
    ev.target = o.target.toArray();
    ev.fov = 38;
    ev.up = null;
  }

  wheel(e) {
    e.preventDefault();
    if (this.view === "shot" || this.view === "eyes") return;
    this.orbit.dist = Math.min(18, Math.max(0.8, this.orbit.dist * (1 + Math.sign(e.deltaY) * 0.1 * (this.ctx.prefs().orbitSpeed || 1))));
    this.updateCamera();
  }

  // ---------- Picking ----------
  ndc(e) {
    const r = this.host.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  }

  ray(e) {
    this.raycaster.setFromCamera(this.ndc(e), this.engine.camera);
    return this.raycaster.ray;
  }

  // The thing under the pointer (its id) and where it was hit
  pickAsset(e, { exclude = new Set() } = {}) {
    this.ray(e);
    const hits = this.raycaster.intersectObjects(this.engine.rooms.assetGroup.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.assetId) o = o.parent;
      if (o && !exclude.has(o.userData.assetId)) return { id: o.userData.assetId, point: h.point, normal: h.face?.normal ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : null };
    }
    return null;
  }

  pickHandle(e) {
    this.ray(e);
    const list = Object.values(this.handles).filter((m) => m?.isMesh);
    const hits = this.raycaster.intersectObjects(list, false);
    return hits[0]?.object.userData.handle || null;
  }

  pickRobot(e) {
    const room = this.ctx.getRoom();
    const h = room.robot.home;
    const s = new THREE.Sphere(new THREE.Vector3(h.pos[0], 0.65, h.pos[2]), 0.42);
    return this.ray(e).intersectsSphere(s);
  }

  floorPoint(e, y = 0) {
    const p = new THREE.Vector3();
    return this.ray(e).intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p) ? p : null;
  }

  // Where a thing of this type would go under the pointer: floor, wall, surface, ceiling (by its slots)
  // → { world, slot, parent, surface, side } or null
  pickPlacement(e, def, { exclude = new Set() } = {}) {
    const room = this.ctx.getRoom();
    const slots = def.slots;
    const noSnap = e.ctrlKey || e.metaKey;
    const prefs = this.ctx.prefs();
    // On another thing's surface
    if (slots.includes("surface") || slots.includes("stack")) {
      const hit = this.pickAsset(e, { exclude });
      if (hit && (!hit.normal || hit.normal.y > 0.55)) {
        const host = room.assets.find((a) => a.id === hit.id);
        const hdef = ops.defOf(host);
        if (hdef?.surfaces?.length) {
          const t = worldTransform(room, host);
          const k = host.scale * (hdef.variants?.[host.variant] ?? 1);
          const surf = hdef.surfaces.map((s) => ({ s, y: t.y + s.y * k })).sort((a, b) => Math.abs(a.y - hit.point.y) - Math.abs(b.y - hit.point.y))[0];
          if (surf && Math.abs(surf.y - hit.point.y) < 0.12) {
            let world = [hit.point.x, surf.y, hit.point.z];
            if (prefs.snapSurfaces && !noSnap) {
              // Near the middle of the surface it snaps to the middle
              const cx = t.x + (surf.s.x || 0) * k;
              const cz = t.z + (surf.s.z || 0) * k;
              if (Math.hypot(world[0] - cx, world[2] - cz) < 0.06) world = [cx, surf.y, cz];
            }
            return { world, slot: "surface", parent: host.id, surface: surf.s.id };
          }
        }
      }
    }
    // On a wall
    if (slots.includes("wall")) {
      const w = this.wallHit(e, room);
      if (w) {
        let y = w.point.y - def.height / 2;
        if (prefs.snapWalls && !noSnap) {
          const centre = y + def.height / 2;
          if (Math.abs(centre - EYE_LEVEL) < 0.08) y = EYE_LEVEL - def.height / 2;
          else if (Math.abs(y + def.height - PICTURE_RAIL) < 0.08) y = PICTURE_RAIL - def.height;
          // Just above the furniture below it
          const below = this.furnitureBelow(room, w.point);
          if (below !== null && Math.abs(y - (below + 0.15)) < 0.1) y = below + 0.15;
        }
        y = Math.max(0, Math.min(room.size.h - def.height, y));
        let along = w.point.clone();
        if (prefs.snapGrid && !noSnap) along = new THREE.Vector3(ops.snap(along.x, prefs.grid), along.y, ops.snap(along.z, prefs.grid));
        return { world: [along.x, y, along.z], slot: "wall", side: w.side, rot: WALL_FACING[w.side] };
      }
    }
    // On the floor
    if (slots.includes("floor")) {
      const p = this.floorPoint(e);
      if (p) {
        let world = [p.x, 0, p.z];
        if (prefs.snapGrid && !noSnap) world = [ops.snap(world[0], prefs.grid), 0, ops.snap(world[2], prefs.grid)];
        return { world, slot: "floor" };
      }
    }
    // Hanging from the ceiling
    if (slots.includes("ceiling")) {
      const p = this.floorPoint(e, room.size.h) || this.floorPoint(e, 0);
      if (p) return { world: [prefs.snapGrid && !noSnap ? ops.snap(p.x, prefs.grid) : p.x, room.size.h, prefs.snapGrid && !noSnap ? ops.snap(p.z, prefs.grid) : p.z], slot: "ceiling" };
    }
    return null;
  }

  // The nearest existing wall's inner face under the pointer: { side, point }
  wallHit(e, room) {
    const ray = this.ray(e);
    const { w, d, h } = room.size;
    const walls = room.architecture.walls;
    const planes = [["back", new THREE.Vector3(0, 0, 1), d / 2], ["front", new THREE.Vector3(0, 0, -1), d / 2], ["left", new THREE.Vector3(1, 0, 0), w / 2], ["right", new THREE.Vector3(-1, 0, 0), w / 2]];
    let best = null;
    for (const [side, n, c] of planes) {
      if (!walls[side]) continue;
      const p = new THREE.Vector3();
      if (!ray.intersectPlane(new THREE.Plane(n, c), p)) continue;
      if (p.y < 0 || p.y > h || Math.abs(p.x) > w / 2 + 0.01 || Math.abs(p.z) > d / 2 + 0.01) continue;
      const dist = p.distanceTo(ray.origin);
      if (!best || dist < best.dist) best = { side, point: p, dist };
    }
    return best;
  }

  furnitureBelow(room, point) {
    let top = null;
    for (const a of room.assets) {
      if (a.parent || a.slot !== "floor" || a.hidden) continue;
      const def = ops.defOf(a);
      const b = footprintOf(room, a);
      const xs = b.map((p) => p[0]);
      const zs = b.map((p) => p[1]);
      if (point.x < Math.min(...xs) - 0.1 || point.x > Math.max(...xs) + 0.1 || point.z < Math.min(...zs) - 0.6 || point.z > Math.max(...zs) + 0.6) continue;
      top = Math.max(top ?? 0, def.height * a.scale);
    }
    return top;
  }

  // ---------- Placing a new thing (a catalog tile dragged in, or clicked) ----------
  startPlacing(type, { stamp = false } = {}) {
    this.cancelPlacing();
    const def = entryFor(type);
    if (!def) return;
    const built = buildAsset(def, { id: "ghost" }, "low");
    built.group.traverse((o) => {
      if (!o.isMesh) return;
      o.material = new THREE.MeshBasicMaterial({ color: COLORS.ok, transparent: true, opacity: 0.42, depthWrite: false });
      o.castShadow = o.receiveShadow = false;
      o.renderOrder = 10;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 35), new THREE.LineBasicMaterial({ color: COLORS.ok, transparent: true, opacity: 0.9 }));
      o.add(edges);
    });
    built.group.visible = false;
    this.overlay.add(built.group);
    this.ghost = { type, def, group: built.group, at: null, check: null, stamp };
    this.ctx.announce(this.ctx.say("Placing {name}. Move the pointer to where it goes; Escape cancels.", { name: this.ctx.say(def.label) }));
  }

  cancelPlacing() {
    if (!this.ghost) return;
    this.ghost.group.removeFromParent();
    this.ghost.group.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose?.();
    });
    this.ghost = null;
    this.ctx.onHint?.("");
  }

  // Try the ghost where the pointer is: its place, its color, its reason
  updateGhost(e) {
    const g = this.ghost;
    const at = this.pickPlacement(e, g.def);
    if (!at) {
      g.group.visible = false;
      g.at = null;
      return;
    }
    const room = this.ctx.getRoom();
    let world = at.world;
    const tmp = ops.addAsset(room, g.type, { pos: world, slot: at.slot, parent: at.parent, surface: at.surface, rot: at.rot ?? 0 });
    if (at.slot === "floor" && this.ctx.prefs().snapWalls && !e.ctrlKey) {
      world = ops.snapToWalls(tmp.room, tmp.room.assets.find((a) => a.id === tmp.id), world);
    }
    const tmp2 = ops.addAsset(room, g.type, { pos: world, slot: at.slot, parent: at.parent, surface: at.surface, rot: at.rot ?? 0 });
    const check = ops.placementCheck(tmp2.room, tmp2.id);
    g.at = { ...at, world };
    g.check = check;
    const a = tmp2.room.assets.find((x) => x.id === tmp2.id);
    const t = worldTransform(tmp2.room, a);
    g.group.position.set(t.x, t.y, t.z);
    g.group.rotation.set(0, t.rot * RAD, 0);
    g.group.visible = true;
    const c = COLORS[check.level] || COLORS.ok;
    g.group.traverse((o) => {
      if (o.material?.color) o.material.color.copy(c);
    });
    this.ctx.onHint?.(check.level === "ok" ? "" : this.reasonWords(check), e);
  }

  reasonWords(check) {
    const say = this.ctx.say;
    const name = (id) => {
      const a = this.ctx.getRoom().assets.find((x) => x.id === id);
      return a ? a.name || say(ops.defOf(a)?.label || a.type) : "";
    };
    if (check.reason === "outside") return say("Outside the room");
    if (check.reason === "wall") return say("Inside a wall");
    if (check.reason === "overlap") return say("On top of the {name}", { name: name(check.with) });
    if (check.reason === "blocks_home") return check.cuts ? say("Blocks the robot's way to the {name}", { name: name(check.cuts) }) : say("Stands where the robot lives");
    return "";
  }

  // Drop the ghost: placed when it fits; on amber, ask first
  dropGhost(e) {
    const g = this.ghost;
    if (!g?.at) return false;
    if (g.check.level === "error") {
      this.ctx.announce(this.reasonWords(g.check));
      return false;
    }
    const place = () => {
      const room = this.ctx.getRoom();
      const res = ops.addAsset(room, g.type, { pos: g.at.world, slot: g.at.slot, parent: g.at.parent, surface: g.at.surface, rot: g.at.rot ?? 0, matchColors: this.ctx.prefs().matchColors });
      this.ctx.commit(res.room, this.ctx.say("Add {name}", { name: this.ctx.say(g.def.label) }));
      this.ctx.select([res.id]);
      this.ctx.announce(this.ctx.say("{name} placed", { name: this.ctx.say(g.def.label) }));
      if (!(g.stamp || e?.shiftKey)) this.cancelPlacing();
    };
    if (g.check.level === "warn") this.ctx.onWarn(this.reasonWords(g.check), place);
    else place();
    return true;
  }

  // A click on a catalog tile: the first good spot near the middle of the view
  placeNearCentre(type) {
    const def = entryFor(type);
    const room = this.ctx.getRoom();
    const r = this.host.getBoundingClientRect();
    const fake = { clientX: r.left + r.width / 2, clientY: r.top + r.height * 0.6, ctrlKey: false, metaKey: false };
    let at = this.pickPlacement(fake, def);
    if (!at || at.slot === "floor" || !at) {
      const spot = ops.firstFreeSpot(room, type, at ? [at.world[0], at.world[2]] : [0, -room.size.d / 4]);
      if (def.slots.includes("floor")) at = { world: [spot[0], 0, spot[1]], slot: "floor" };
    }
    if (!at && def.slots.includes("wall")) {
      const side = nearestWall(room, 0, -room.size.d / 2) || "back";
      at = { world: side === "back" ? [0, def.mount ?? 1.2, -room.size.d / 2] : [-room.size.w / 2, def.mount ?? 1.2, 0], slot: "wall", rot: WALL_FACING[side] };
    }
    if (!at && def.slots.includes("surface")) {
      const host = room.assets.find((a) => !a.parent && ops.defOf(a)?.surfaces?.length);
      if (host) at = { world: [0, 0, 0], slot: "surface", parent: host.id, surface: ops.defOf(host).surfaces[0].id, local: true };
    }
    if (!at && def.slots.includes("ceiling")) at = { world: [0, room.size.h, -room.size.d / 4], slot: "ceiling" };
    if (!at) return null;
    const res = ops.addAsset(room, type, { pos: at.world, slot: at.slot, parent: at.parent, surface: at.surface, rot: at.rot ?? 0, local: at.local, matchColors: this.ctx.prefs().matchColors });
    this.ctx.commit(res.room, this.ctx.say("Add {name}", { name: this.ctx.say(def.label) }));
    this.ctx.select([res.id]);
    this.ctx.announce(this.ctx.say("{name} placed", { name: this.ctx.say(def.label) }));
    return res.id;
  }

  // ---------- Pointer ----------
  down(e) {
    this.host.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      // Two fingers: pinch to zoom, move to pan
      const [a, b] = [...this.pointers.values()];
      this.drag = { kind: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y), dist0: this.orbit.dist, mid: [(a.x + b.x) / 2, (a.y + b.y) / 2], target0: this.orbit.target.clone() };
      return;
    }
    if (this.ghost) return;
    if (this.measure && e.button === 0) return this.measureClick(e);
    // The robot, its home, spots, zones and routes (robot-tools.js)
    if (this.ctx.tools?.down(e)) return;
    const room = this.ctx.getRoom();
    const sel = this.ctx.selection();
    const pan = e.button === 2 || e.button === 1 || (e.shiftKey && e.button === 0 && !this.pickAsset(e));
    if (pan) {
      this.drag = { kind: "pan", x: e.clientX, y: e.clientY, target0: this.orbit.target.clone() };
      return;
    }
    const handle = sel.length === 1 ? this.pickHandle(e) : null;
    if (handle) {
      const a = room.assets.find((x) => x.id === sel[0]);
      const t = worldTransform(room, a);
      this.drag = { kind: handle, id: a.id, start: room, t, rot0: a.rot, scale0: a.scale, y0: a.pos[1], sx: e.clientX, sy: e.clientY, key: `h-${Date.now()}`, moved: false };
      return;
    }
    const hit = this.pickAsset(e);
    if (hit) {
      const ids = ops.groupMembers(room, hit.id);
      const additive = e.shiftKey;
      if (!sel.includes(hit.id) || additive) this.ctx.select(additive ? [...new Set([...sel, ...ids])] : ids);
      const a = room.assets.find((x) => x.id === hit.id);
      if (!a.locked) this.drag = { kind: "move", id: hit.id, ids: this.ctx.selection(), start: room, sx: e.clientX, sy: e.clientY, key: `m-${Date.now()}`, moved: false };
      return;
    }
    if (this.view === "top") this.drag = { kind: "marquee", sx: e.clientX, sy: e.clientY, additive: e.shiftKey };
    else this.drag = { kind: "orbit", x: e.clientX, y: e.clientY, yaw0: this.orbit.yaw, pitch0: this.orbit.pitch, sx: e.clientX, sy: e.clientY, moved: false };
  }

  move(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.ghost) return this.updateGhost(e);
    if (this.ctx.tools?.move(e)) return;
    if (this.measure && this.measure.a && !this.measure.b && !this.drag) return this.measureTo(this.measurePoint(e), e);
    const d = this.drag;
    if (!d) {
      const hover = this.pickAsset(e);
      this.host.style.cursor = this.pickHandle(e) ? "grab" : hover ? "pointer" : "";
      return;
    }
    if (d.kind === "pinch" && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      this.orbit.dist = Math.min(18, Math.max(0.8, (d.dist0 * d.d0) / Math.max(10, dist)));
      return this.updateCamera();
    }
    if (d.kind === "orbit") {
      const inv = this.ctx.prefs().invertOrbit ? -1 : 1;
      this.orbit.yaw = d.yaw0 - ((e.clientX - d.x) * 0.006 * inv * (this.ctx.prefs().orbitSpeed || 1));
      this.orbit.pitch = Math.min(1.45, Math.max(0.08, d.pitch0 + (e.clientY - d.y) * 0.004 * inv));
      d.moved ||= Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4;
      return this.updateCamera();
    }
    if (d.kind === "pan") {
      const k = this.orbit.dist * 0.0016;
      const right = new THREE.Vector3(Math.cos(this.orbit.yaw), 0, -Math.sin(this.orbit.yaw));
      const fwd = new THREE.Vector3(Math.sin(this.orbit.yaw), 0, Math.cos(this.orbit.yaw));
      if (this.view === "top") right.set(1, 0, 0), fwd.set(0, 0, 1);
      this.orbit.target.copy(d.target0).addScaledVector(right, -(e.clientX - d.x) * k).addScaledVector(fwd, -(e.clientY - d.y) * k);
      return this.updateCamera();
    }
    if (d.kind === "marquee") return this.drawMarquee(d, e);
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4 && !d.moved) return;
    d.moved = true;
    if (d.kind === "move") return this.dragMove(d, e);
    if (d.kind === "rotate") return this.dragRotate(d, e);
    if (d.kind === "size") return this.dragSize(d, e);
    if (d.kind === "lift") return this.dragLift(d, e);
  }

  up(e) {
    this.pointers.delete(e.pointerId);
    this.host.releasePointerCapture?.(e.pointerId);
    if (this.ctx.tools?.up(e)) return;
    if (this.ghost) {
      this.dropGhost(e);
      return;
    }
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.kind === "marquee") return this.endMarquee(d, e);
    if (d.kind === "orbit" && !d.moved) this.ctx.select([]); // a click on empty space clears the selection
    if (d.moved && ["move", "rotate", "size", "lift"].includes(d.kind)) {
      this.ctx.onHint?.("");
      const room = this.ctx.getRoom();
      const check = d.kind === "move" ? ops.placementCheck(room, d.id) : { level: "ok" };
      if (check.level === "error") {
        // It can't stay there: back to where it was
        this.ctx.commit(d.start, this.ctx.say("Move"), { coalesce: d.key, replace: true });
        this.ctx.announce(this.reasonWords(check));
      } else if (check.level === "warn") {
        this.ctx.onWarn(this.reasonWords(check), () => {}, () => this.ctx.commit(d.start, this.ctx.say("Move"), { coalesce: d.key, replace: true }));
      }
    }
  }

  dragMove(d, e) {
    const room = d.start;
    const a = room.assets.find((x) => x.id === d.id);
    const def = ops.defOf(a);
    const exclude = new Set([a.id, ...ops.descendants(room, a.id)]);
    const at = this.pickPlacement(e, def, { exclude });
    if (!at) return;
    let next;
    if (d.ids.length > 1) {
      // A group slides together by the main thing's offset
      const t = worldTransform(room, a);
      next = ops.nudge(room, d.ids.filter((id) => !room.assets.find((x) => x.id === id)?.parent), at.world[0] - t.x, at.world[2] - t.z);
    } else {
      let world = at.world;
      if (at.slot === "floor" && !e.ctrlKey) {
        if (this.ctx.prefs().snapWalls) world = ops.snapToWalls(room, a, world);
        if (this.ctx.prefs().snapGuides) {
          const g = ops.guides(room, a, world);
          world = g.pos;
          this.showGuides(g.hits);
        }
      }
      next = ops.placeAt(room, a.id, world, { parent: at.parent || null, surface: at.surface || null, slot: at.slot, rot: at.slot === "wall" && a.slot !== "wall" ? at.rot : null });
    }
    this.ctx.commit(next, this.ctx.say("Move {name}", { name: this.ctx.say(def.label) }), { coalesce: d.key });
    const check = ops.placementCheck(next, a.id, { checkPath: false });
    const moved = next.assets.find((x) => x.id === a.id);
    const dist = moved.slot === "floor" && this.ctx.prefs().showMeasurements ? ops.wallDistances(next, moved) : null;
    const inch = this.ctx.prefs().units === "in";
    const far = dist && { left: lengthOf(dist.left, this.ctx.prefs().units).n, back: lengthOf(dist.back, this.ctx.prefs().units).n };
    this.ctx.onHint?.(check.level === "ok" ? (dist ? this.ctx.say(inch ? "{left} in from the left wall, {back} in from the back" : "{left} cm from the left wall, {back} cm from the back", far) : "") : this.reasonWords(check), e);
  }

  dragRotate(d, e) {
    const p = this.floorPoint(e, d.t.y);
    if (!p) return;
    const angle = Math.atan2(p.x - d.t.x, p.z - d.t.z) / RAD;
    const prefs = this.ctx.prefs();
    const room = d.start;
    const a = room.assets.find((x) => x.id === d.id);
    const parentRot = a.parent ? worldTransform(room, room.assets.find((x) => x.id === a.parent)).rot : 0;
    let rot = angle - parentRot;
    if (prefs.snapAngle && !e.ctrlKey) rot = ops.snapAngle(rot, prefs.angle);
    this.ctx.commit(ops.updateAsset(room, d.id, { rot }), this.ctx.say("Turn"), { coalesce: d.key });
    this.ctx.onHint?.(this.ctx.say("{deg}°", { deg: Math.round(((rot % 360) + 360) % 360) }), e);
  }

  dragSize(d, e) {
    const p = this.floorPoint(e, d.t.y);
    if (!p) return;
    const r0 = this.handles.size.userData.r0;
    const r = Math.hypot(p.x - d.t.x, p.z - d.t.z);
    const next = ops.scaleTo(d.start, d.id, d.scale0 * (r / Math.max(0.05, r0)));
    this.ctx.commit(next, this.ctx.say("Size"), { coalesce: d.key });
    this.ctx.onHint?.(`${Math.round(next.assets.find((x) => x.id === d.id).scale * 100)} %`, e);
  }

  dragLift(d, e) {
    const dy = -(e.clientY - d.sy) * this.orbit.dist * 0.0018;
    const a = d.start.assets.find((x) => x.id === d.id);
    const room = d.start;
    const max = a.slot === "wall" ? room.size.h - (ops.defOf(a)?.height || 0) : 3;
    const y = Math.max(0, Math.min(max, d.y0 + dy));
    this.ctx.commit(ops.updateAsset(room, d.id, a.slot === "ceiling" ? { drop: Math.max(0, Math.min(2, (a.drop || 0) - dy)) } : { pos: [a.pos[0], Math.round(y * 1000) / 1000, a.pos[2]] }), this.ctx.say("Lift"), { coalesce: d.key });
    this.ctx.onHint?.(this.lengthWords(y), e);
  }

  // ---------- Measuring: two clicks, the distance between them ----------
  // A point on a thing (where the pointer hits it) or on the floor
  measurePoint(e) {
    const hit = this.pickAsset(e);
    return hit ? hit.point.clone() : this.floorPoint(e);
  }

  startMeasuring() {
    this.stopMeasuring();
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: COLORS.warn, depthTest: false, transparent: true }));
    line.renderOrder = 20;
    line.visible = false;
    const dots = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), new THREE.MeshBasicMaterial({ color: COLORS.warn, depthTest: false }));
      m.renderOrder = 21;
      m.visible = false;
      return m;
    });
    this.overlay.add(line, ...dots);
    this.measure = { a: null, b: null, line, dots };
    this.host.style.cursor = "crosshair";
    this.ctx.announce(this.ctx.say("Measuring: click where it starts, then where it ends. Escape stops."));
  }

  stopMeasuring() {
    const m = this.measure;
    if (!m) return false;
    for (const o of [m.line, ...m.dots]) {
      o.removeFromParent();
      o.geometry.dispose();
      o.material.dispose();
    }
    this.measure = null;
    this.host.style.cursor = "";
    this.ctx.onHint?.("");
    return true;
  }

  measureClick(e) {
    const m = this.measure;
    const p = this.measurePoint(e);
    if (!p) return;
    if (!m.a || m.b) {
      m.a = p;
      m.b = null;
      m.dots[0].position.copy(p);
      m.dots[0].visible = true;
      m.dots[1].visible = false;
      m.line.visible = false;
      this.ctx.onHint?.("");
      return;
    }
    m.b = p;
    this.measureTo(p, e, true);
  }

  measureTo(p, e, done = false) {
    const m = this.measure;
    if (!p || !m?.a) return;
    m.dots[1].position.copy(p);
    m.dots[1].visible = true;
    m.line.geometry.setFromPoints([m.a, p]);
    m.line.visible = true;
    const len = lengthOf(m.a.distanceTo(p), this.ctx.prefs().units);
    this.ctx.onHint?.(this.lengthWords(m.a.distanceTo(p)), e);
    if (done) this.ctx.announce(this.ctx.say(len.unit === "in" ? "{n} in between the two points" : "{n} cm between the two points", { n: len.n }));
  }

  // "120 cm" or "47 in", as Settings → Robot → Editor → Units says
  lengthWords(m) {
    const len = lengthOf(m, this.ctx.prefs().units);
    return this.ctx.say(len.unit === "in" ? "{n} in" : "{n} cm", { n: len.n });
  }

  // ---------- Marquee (in the plan from above) ----------
  drawMarquee(d, e) {
    if (!this.marquee) {
      this.marquee = document.createElement("div");
      this.marquee.className = "re-marquee";
      this.host.append(this.marquee);
    }
    const r = this.host.getBoundingClientRect();
    const x0 = Math.min(d.sx, e.clientX) - r.left;
    const y0 = Math.min(d.sy, e.clientY) - r.top;
    Object.assign(this.marquee.style, { left: `${x0}px`, top: `${y0}px`, width: `${Math.abs(e.clientX - d.sx)}px`, height: `${Math.abs(e.clientY - d.sy)}px` });
    d.ex = e.clientX;
    d.ey = e.clientY;
  }

  endMarquee(d) {
    this.marquee?.remove();
    this.marquee = null;
    if (d.ex === undefined) return this.ctx.select([]);
    const room = this.ctx.getRoom();
    const r = this.host.getBoundingClientRect();
    const [x0, x1] = [Math.min(d.sx, d.ex), Math.max(d.sx, d.ex)];
    const [y0, y1] = [Math.min(d.sy, d.ey), Math.max(d.sy, d.ey)];
    const picked = [];
    for (const a of room.assets) {
      if (a.hidden || a.parent) continue;
      const t = worldTransform(room, a);
      const v = new THREE.Vector3(t.x, t.y, t.z).project(this.engine.camera);
      const sx = r.left + ((v.x + 1) / 2) * r.width;
      const sy = r.top + ((1 - v.y) / 2) * r.height;
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) picked.push(a.id);
    }
    this.ctx.select(d.additive ? [...new Set([...this.ctx.selection(), ...picked])] : picked);
  }

  // ---------- Selection outline and handles ----------
  clearHandles() {
    for (const o of Object.values(this.handles)) {
      o.removeFromParent();
      o.geometry?.dispose();
      o.material?.dispose();
    }
    this.handles = {};
  }

  syncSelection({ focused = false } = {}) {
    this.clearHandles();
    const room = this.ctx.getRoom();
    const sel = this.ctx.selection();
    const accent = focused ? COLORS.warn : COLORS.select;
    for (const id of sel) {
      const a = room.assets.find((x) => x.id === id);
      if (!a) continue;
      const t = worldTransform(room, a);
      const pts = footprintOf(room, a).map(([x, z]) => new THREE.Vector3(x, (a.slot === "wall" ? t.y : t.y) + 0.012, z));
      if (a.slot === "wall" || a.slot === "ceiling") {
        // A wall thing: a box outline around it instead of a footprint
        const def = ops.defOf(a);
        const k = a.scale * (def.variants?.[a.variant] ?? 1);
        const box = new THREE.Box3(new THREE.Vector3(-def.footprint.w * k / 2, a.slot === "ceiling" ? -def.height * k : 0, 0), new THREE.Vector3(def.footprint.w * k / 2, a.slot === "ceiling" ? 0 : def.height * k, def.footprint.d * k));
        const helper = new THREE.Box3Helper(box, accent);
        helper.position.set(t.x, t.y, t.z);
        helper.rotation.y = t.rot * RAD;
        helper.material.depthTest = false;
        helper.renderOrder = 20;
        this.overlay.add(helper);
        this.handles[`box-${id}`] = helper;
      } else {
        const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: accent, depthTest: false, transparent: true, linewidth: 2 }));
        line.renderOrder = 20;
        this.overlay.add(line);
        this.handles[`outline-${id}`] = line;
      }
    }
    if (sel.length !== 1) return;
    const a = room.assets.find((x) => x.id === sel[0]);
    if (!a || a.locked) return;
    const t = worldTransform(room, a);
    const def = ops.defOf(a);
    const k = a.scale * (def.variants?.[a.variant] ?? 1);
    const r = Math.hypot(def.footprint.w, def.footprint.d) * k * 0.5 + 0.14;
    const size = Math.max(0.035, Math.min(0.08, r * 0.06)) * (this.ctx.prefs().handleSize || 1);
    const mat = (c) => new THREE.MeshBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: 0.95 });
    // The ring to turn it (on the wall's face for wall things)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, size * 0.35, 8, 64), mat(COLORS.select));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(t.x, t.y + 0.02, t.z);
    ring.userData.handle = a.slot === "wall" ? "none" : "rotate";
    ring.renderOrder = 21;
    if (a.slot !== "wall") (this.overlay.add(ring), (this.handles.rotate = ring));
    // The knob to size it, at its front right
    const knob = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 12), mat("#ffffff"));
    const c = Math.cos(t.rot * RAD);
    const s = Math.sin(t.rot * RAD);
    const lx = (def.footprint.w * k) / 2 + 0.04;
    const lz = a.slot === "wall" ? def.footprint.d * k : (def.footprint.d * k) / 2 + 0.04;
    knob.position.set(t.x + lx * c + lz * s, t.y + (a.slot === "wall" ? def.height * k : 0.03), t.z - lx * s + lz * c);
    knob.userData.handle = "size";
    knob.userData.r0 = Math.hypot(knob.position.x - t.x, knob.position.z - t.z);
    knob.renderOrder = 22;
    this.overlay.add(knob);
    this.handles.size = knob;
    // The arrow to lift it (things on walls, on surfaces and from the ceiling)
    if (a.slot !== "floor") {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(size * 1.2, size * 3, 16), mat(COLORS.warn));
      arrow.position.set(t.x, t.y + (a.slot === "ceiling" ? 0.1 : def.height * k + 0.12), t.z + (a.slot === "wall" ? def.footprint.d * k + 0.05 : 0));
      arrow.userData.handle = "lift";
      arrow.renderOrder = 22;
      this.overlay.add(arrow);
      this.handles.lift = arrow;
    }
  }

  showGuides(hits) {
    if (this.handles.guides) {
      this.handles.guides.removeFromParent();
      this.handles.guides.geometry.dispose();
      delete this.handles.guides;
    }
    if (!hits.length) return;
    const room = this.ctx.getRoom();
    const pts = [];
    for (const h of hits) {
      if (h.axis === "x") pts.push(new THREE.Vector3(h.at, 0.015, -room.size.d / 2), new THREE.Vector3(h.at, 0.015, room.size.d / 2));
      else pts.push(new THREE.Vector3(-room.size.w / 2, 0.015, h.at), new THREE.Vector3(room.size.w / 2, 0.015, h.at));
    }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#f472b6", depthTest: false, transparent: true, opacity: 0.8 }));
    lines.renderOrder = 19;
    this.overlay.add(lines);
    this.handles.guides = lines;
  }
}
