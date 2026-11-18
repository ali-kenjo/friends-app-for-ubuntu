// ---------- The robot in the Room Editor's viewport ----------
// Shows and edits where the robot lives and may go: its home (drag the robot; the ring ahead of it turns it),
// spots (markers with a facing), zones (shapes on the floor in their kind's color, with corner handles) and
// routes (numbered points joined by a line). Tools: place a spot, draw a zone (rectangle, circle, polygon),
// add route points. While simulating it also draws the path the robot plans and the nav grid's blocked cells.
import * as THREE from "three";
import { t } from "../../i18n.js";
import * as C from "../choices.mjs";
import * as RO from "./robot-ops.mjs";
import { displayName } from "../model.mjs";

const RAD = Math.PI / 180;
const Y = 0.02;
const color = (kind) => new THREE.Color(C.ZONE_KINDS.find((k) => k.id === kind)?.color || "#888888");
const mat = (c, opacity = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity, depthTest: false, side: THREE.DoubleSide });
const lineMat = (c) => new THREE.LineBasicMaterial({ color: c, transparent: true, depthTest: false });

export class RobotTools {
  // vp: the Viewport; ctx: the editor (room, commit, say, announce, robotSelected, robotTab, routeTool)
  constructor(vp, ed) {
    this.vp = vp;
    this.ed = ed;
    this.group = new THREE.Group();
    this.group.name = "robot-tools";
    this.group.renderOrder = 30;
    this.handles = []; // { mesh, kind, … } things a pointer can grab
    this.tool = null; // "spot" | "zone-rect" | "zone-circle" | "zone-poly" | "route:<id>"
    this.draft = null; // a zone being drawn
    this.drag = null;
    this.simLines = null;
  }

  attach() {
    this.vp.overlay.add(this.group);
  }

  detach() {
    this.clear();
    this.group.removeFromParent();
  }

  clear() {
    this.group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material && o !== this.group) o.material.dispose?.();
    });
    this.group.clear();
    this.handles = [];
  }

  // ---------- Drawing what there is ----------
  sync() {
    this.clear();
    const ed = this.ed;
    const room = ed.room;
    const robot = room.robot;
    const show = ed.robotSelected || this.tool || ed.simulating;
    if (!show) return;
    // Zones: a soft fill and an outline, corner handles when the zones tab is open
    for (const z of robot.zones) {
      const c = color(z.kind);
      let shape;
      if (z.shape === "circle") {
        shape = new THREE.Shape();
        shape.absarc(z.points[0][0], z.points[0][1], z.radius, 0, Math.PI * 2, false);
      } else {
        const pts = z.shape === "rect" ? [[z.points[0][0], z.points[0][1]], [z.points[1][0], z.points[0][1]], [z.points[1][0], z.points[1][1]], [z.points[0][0], z.points[1][1]]] : z.points;
        shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      }
      const geo = new THREE.ShapeGeometry(shape, 32);
      geo.rotateX(Math.PI / 2);
      const fill = new THREE.Mesh(geo, mat(c, 0.22));
      fill.position.y = Y;
      fill.renderOrder = 30;
      this.group.add(fill);
      const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(shape.getPoints(48).map((p) => new THREE.Vector3(p.x, Y + 0.002, p.y))), lineMat(c));
      edge.renderOrder = 31;
      this.group.add(edge);
      if (ed.robotSelected && ed.robotTab === "zones") {
        RO.zoneHandles(z).forEach(([x, y], i) => this.handle([x, y], c, { kind: "vertex", zone: z.id, index: i }, 0.06));
      }
    }
    // Routes: points (numbered by order) and the line through them
    for (const r of robot.routes) {
      if (!r.points.length) continue;
      const active = this.tool === `route:${r.id}`;
      const c = new THREE.Color(active ? "#f5a524" : "#3e9bff");
      const pts = r.points.map((p) => new THREE.Vector3(p.pos[0], Y + 0.01, p.pos[1]));
      if (r.mode === "loop" && pts.length > 2) pts.push(pts[0].clone());
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(c));
      line.renderOrder = 31;
      this.group.add(line);
      r.points.forEach((p, i) => this.handle(p.pos, c, { kind: "point", route: r.id, index: i }, 0.07, String(i + 1)));
    }
    // Spots: a marker and a short arrow its way
    for (const s of robot.spots) this.marker([s.pos[0], s.pos[2]], s.facing, new THREE.Color("#30a46c"), { kind: "spot", spot: s.id });
    // Home: a ring round the robot and a handle ahead of it that turns it
    if (ed.robotSelected) {
      const h = robot.home;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.4, 48), mat(new THREE.Color("#3e9bff"), 0.9));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(h.pos[0], Y + 0.004, h.pos[2]);
      ring.renderOrder = 32;
      this.group.add(ring);
      const f = h.facing * RAD;
      this.handle([h.pos[0] + Math.sin(f) * 0.55, h.pos[2] + Math.cos(f) * 0.55], new THREE.Color("#3e9bff"), { kind: "facing" }, 0.07);
    }
  }

  handle([x, z], c, data, r = 0.06, label = "") {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat(c, 0.95));
    mesh.position.set(x, Y + r, z);
    mesh.renderOrder = 33;
    mesh.userData.tool = data;
    this.group.add(mesh);
    this.handles.push(mesh);
    if (label) {
      const sprite = textSprite(label);
      sprite.position.set(x, Y + r * 3.2, z);
      this.group.add(sprite);
    }
    return mesh;
  }

  marker([x, z], facing, c, data) {
    const m = this.handle([x, z], c, data, 0.08);
    const f = facing * RAD;
    const arrow = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, Y + 0.01, z), new THREE.Vector3(x + Math.sin(f) * 0.35, Y + 0.01, z + Math.cos(f) * 0.35)]), lineMat(c));
    arrow.renderOrder = 31;
    this.group.add(arrow);
    return m;
  }

  // ---------- Tools ----------
  setTool(tool) {
    this.tool = tool;
    this.draft = null;
    this.vp.host.style.cursor = tool ? "crosshair" : "";
    this.sync();
  }

  pickHandle(e) {
    if (!this.handles.length) return null;
    this.vp.ray(e);
    const hit = this.vp.raycaster.intersectObjects(this.handles, false)[0];
    return hit ? hit.object.userData.tool : null;
  }

  // The pointer went down: true when the robot tools took it
  down(e) {
    if (e.button !== 0) return false;
    const ed = this.ed;
    const p = this.vp.floorPoint(e);
    if (this.tool && p) {
      if (this.tool === "spot") {
        const r = RO.addSpot(ed.room, t("Spot {n}", { n: ed.room.robot.spots.length + 1 }), p.x, p.z, 0);
        ed.commit(r.room, t("Spot"));
        ed.say(t("Spot placed"));
        this.setTool(null);
        return true;
      }
      if (this.tool.startsWith("route:")) {
        const id = this.tool.slice(6);
        ed.commit(RO.addPoint(ed.room, id, p.x, p.z), t("Route"));
        ed.say(t("Point {n} added", { n: ed.room.robot.routes.find((r) => r.id === id)?.points.length || 0 }));
        return true;
      }
      if (this.tool === "zone-rect" || this.tool === "zone-circle") {
        this.drag = { kind: this.tool, start: [p.x, p.z], end: [p.x, p.z] };
        return true;
      }
      if (this.tool === "zone-poly") {
        this.draft ||= [];
        const first = this.draft[0];
        // Back at the first point (or a double click): the polygon is closed
        if (first && this.draft.length >= 3 && (Math.hypot(p.x - first[0], p.z - first[1]) < 0.15 || e.detail >= 2)) return this.finishPoly(), true;
        this.draft.push([p.x, p.z]);
        this.drawDraft();
        return true;
      }
    }
    const grab = this.pickHandle(e);
    if (grab) {
      this.drag = { ...grab, start: room0(ed.room), key: `rt-${Date.now()}` };
      return true;
    }
    // The robot itself: selected, and dragging it moves its home
    if (this.vp.pickRobot(e)) {
      ed.selectRobot();
      this.drag = { kind: "home", start: room0(ed.room), key: `home-${Date.now()}` };
      return true;
    }
    return false;
  }

  move(e) {
    const d = this.drag;
    if (!d) return false;
    const ed = this.ed;
    const p = this.vp.floorPoint(e);
    if (!p) return true;
    const room = d.start;
    const opts = { coalesce: d.key };
    if (d.kind === "zone-rect" || d.kind === "zone-circle") {
      d.end = [p.x, p.z];
      this.draft = d.kind === "zone-rect" ? [d.start, [d.end[0], d.start[1]], d.end, [d.start[0], d.end[1]]] : { c: d.start, r: Math.hypot(d.end[0] - d.start[0], d.end[1] - d.start[1]) };
      this.drawDraft();
      return true;
    }
    if (d.kind === "home") {
      const check = RO.standCheck(room, p.x, p.z);
      ed.commit(RO.setHome(room, p.x, p.z), t("Home"), opts);
      ed.hint(check.ok ? `${Math.round(p.x * 100)}, ${Math.round(p.z * 100)} cm` : standWords(ed, room, check), e);
      d.bad = !check.ok;
      return true;
    }
    if (d.kind === "facing") {
      const h = room.robot.home;
      const facing = Math.round(Math.atan2(p.x - h.pos[0], p.z - h.pos[2]) / RAD / 5) * 5;
      ed.commit(RO.setHome(room, h.pos[0], h.pos[2], facing), t("Home"), opts);
      ed.hint(`${facing}°`, e);
      return true;
    }
    if (d.kind === "spot") ed.commit(RO.updateSpot(room, d.spot, { pos: [p.x, 0, p.z] }), t("Spot"), opts);
    else if (d.kind === "vertex") ed.commit(RO.moveVertex(room, d.zone, d.index, p.x, p.z), t("Zone"), opts);
    else if (d.kind === "point") ed.commit(RO.movePoint(room, d.route, d.index, p.x, p.z), t("Route"), opts);
    return true;
  }

  up() {
    const d = this.drag;
    if (!d) return false;
    this.drag = null;
    const ed = this.ed;
    ed.hint("");
    if (d.kind === "zone-rect" || d.kind === "zone-circle") {
      const [x0, z0] = d.start;
      const [x1, z1] = d.end;
      this.draft = null;
      if (Math.hypot(x1 - x0, z1 - z0) < 0.1) return this.drawDraft(), true;
      const r = d.kind === "zone-rect" ? RO.addZone(ed.room, { kind: "nogo", shape: "rect", points: [[Math.min(x0, x1), Math.min(z0, z1)], [Math.max(x0, x1), Math.max(z0, z1)]] }) : RO.addZone(ed.room, { kind: "nogo", shape: "circle", points: [[x0, z0]], radius: Math.hypot(x1 - x0, z1 - z0) });
      ed.commit(r.room, t("Zone"));
      ed.say(t("Zone drawn: no-go. Change its kind in the inspector."));
      this.setTool(null);
      return true;
    }
    // A home the robot can't stand on goes back
    if (d.kind === "home" && d.bad) {
      ed.commit(d.start, t("Home"), { coalesce: d.key, replace: true });
      ed.say(t("The robot can't stand there."));
    }
    return true;
  }

  // Enter closes a polygon; Escape drops a draft
  key(e) {
    if (this.tool === "zone-poly" && e.key === "Enter" && this.draft?.length >= 3) {
      this.finishPoly();
      return true;
    }
    if (e.key === "Escape" && this.tool) {
      this.setTool(null);
      return true;
    }
    return false;
  }

  finishPoly() {
    const r = RO.addZone(this.ed.room, { kind: "nogo", shape: "poly", points: this.draft });
    this.ed.commit(r.room, t("Zone"));
    this.ed.say(t("Zone drawn: no-go. Change its kind in the inspector."));
    this.setTool(null);
  }

  drawDraft() {
    this.group.getObjectByName("draft")?.removeFromParent();
    if (!this.draft) return;
    let pts;
    if (Array.isArray(this.draft)) pts = this.draft.map(([x, z]) => new THREE.Vector3(x, Y + 0.01, z));
    else pts = Array.from({ length: 49 }, (_, i) => new THREE.Vector3(this.draft.c[0] + Math.cos((i / 48) * Math.PI * 2) * this.draft.r, Y + 0.01, this.draft.c[1] + Math.sin((i / 48) * Math.PI * 2) * this.draft.r));
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), lineMat(new THREE.Color("#e5484d")));
    line.name = "draft";
    line.renderOrder = 34;
    this.group.add(line);
  }

  // ---------- Simulation overlays ----------
  // path: [[x, z]…]; grid: the nav grid (blocked cells drawn once per grid)
  showSim(path, grid) {
    let g = this.group.getObjectByName("sim-path");
    if (g) {
      g.removeFromParent();
      g.geometry.dispose();
    }
    if (path?.length > 1) {
      g = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.map(([x, z]) => new THREE.Vector3(x, Y + 0.015, z))), lineMat(new THREE.Color("#f5a524")));
      g.name = "sim-path";
      g.renderOrder = 35;
      this.group.add(g);
    }
    if (grid && grid !== this.simGrid) {
      this.simGrid = grid;
      this.group.getObjectByName("sim-grid")?.removeFromParent();
      const cells = [];
      for (let j = 0; j < grid.rows; j++) for (let i = 0; i < grid.cols; i++) if (grid.base[j * grid.cols + i] || grid.occ[j * grid.cols + i]) cells.push([grid.x0 + (i + 0.5) * grid.cell, grid.z0 + (j + 0.5) * grid.cell]);
      const geo = new THREE.PlaneGeometry(grid.cell * 0.8, grid.cell * 0.8);
      geo.rotateX(-Math.PI / 2);
      const inst = new THREE.InstancedMesh(geo, mat(new THREE.Color("#e5484d"), 0.18), Math.max(1, cells.length));
      const m = new THREE.Matrix4();
      cells.forEach(([x, z], k) => inst.setMatrixAt(k, m.makeTranslation(x, Y + 0.006, z)));
      inst.count = cells.length;
      inst.name = "sim-grid";
      inst.renderOrder = 29;
      this.group.add(inst);
    }
  }

  hideSim() {
    for (const name of ["sim-path", "sim-grid"]) this.group.getObjectByName(name)?.removeFromParent();
    this.simGrid = null;
  }
}

const room0 = (room) => room;

function standWords(ed, room, check) {
  if (check.reason === "outside") return t("The robot can't stand there: outside the room");
  if (check.reason === "nogo") return t("The robot can't stand there: a no-go zone");
  const a = room.assets.find((x) => x.id === check.with);
  return t("The robot can't stand there: inside the {name}", { name: a ? a.name || t(displayName(a)) : "" });
}

// A small number label above a route point
function textSprite(text) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  x.fillStyle = "rgba(20,14,10,0.85)";
  x.beginPath();
  x.arc(32, 32, 28, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "#ffffff";
  x.font = "bold 34px system-ui, sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(text, 32, 34);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(0.16, 0.16, 1);
  s.renderOrder = 36;
  return s;
}
