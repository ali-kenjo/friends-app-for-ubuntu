// ---------- Physical IK, Hand-Attach Sockets & Gaze Tracking (core/robot/ik-sockets.mjs) ----------
// Drives procedural arm/hand IK reach targets, weighted head/eye gaze, idle micro-animations,
// and attaches/detaches held 3D prop meshes (marker, pen, book, watering can, controller, cube).
import * as THREE from "three";

function buildHeldPropVisual(kind) {
  const g = new THREE.Group();
  g.name = `HeldSocketProp_${kind}`;
  if (kind === "marker") {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 0.14, 10),
      new THREE.MeshStandardMaterial({ color: "#2563eb", roughness: 0.35 })
    );
    m.rotation.z = Math.PI / 2;
    g.add(m);
  } else if (kind === "pen") {
    const p = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, 0.14, 10),
      new THREE.MeshStandardMaterial({ color: "#f59e0b", roughness: 0.3, metalness: 0.4 })
    );
    p.rotation.z = Math.PI / 2;
    g.add(p);
  } else if (kind === "watering_can") {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.062, 0.1, 14),
      new THREE.MeshStandardMaterial({ color: "#38bdf8", roughness: 0.35 })
    );
    const spout = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.016, 0.1, 8),
      body.material
    );
    spout.position.set(0.065, 0.02, 0);
    spout.rotation.z = -0.9;
    g.add(body, spout);
  } else if (kind === "controller") {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.03, 0.068),
      new THREE.MeshStandardMaterial({ color: "#f1f5f9", roughness: 0.4 })
    );
    g.add(pad);
  } else if (kind === "book") {
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.025, 0.19),
      new THREE.MeshStandardMaterial({ color: "#2563eb", roughness: 0.65 })
    );
    g.add(book);
  } else {
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.08),
      new THREE.MeshStandardMaterial({ color: "#facc15", roughness: 0.35 })
    );
    g.add(cube);
  }
  return g;
}

export class RobotIKController {
  constructor() {
    this.held = { left: null, right: null };
    this.reachTarget = null; // THREE.Vector3 | null
    this.gazeTarget = null; // THREE.Vector3 | null
    this.headGazeWeight = 0.85;
    this.eyeGazeWeight = 1.0;
  }

  /**
   * Attach a procedural prop visual directly into the robot's Arm_R or Arm_L socket.
   * @param {Record<string, THREE.Object3D>} nodes
   * @param {"left"|"right"} hand
   * @param {string} propKind
   */
  attachToHand(nodes, hand = "right", propKind = "marker") {
    this.detachFromHand(nodes, hand);
    const armNode = hand === "left" ? nodes?.Arm_L : nodes?.Arm_R;
    if (!armNode) return false;
    const mesh = buildHeldPropVisual(propKind);
    mesh.position.set(hand === "left" ? -0.02 : 0.02, -0.22, 0.08);
    armNode.add(mesh);
    this.held[hand] = { propKind, mesh, parent: armNode };
    return true;
  }

  detachFromHand(nodes, hand = "right") {
    const cur = this.held[hand];
    if (cur?.mesh) cur.mesh.parent?.remove(cur.mesh);
    this.held[hand] = null;
  }

  dropAll(nodes) {
    this.detachFromHand(nodes, "left");
    this.detachFromHand(nodes, "right");
    this.reachTarget = null;
  }

  setReachTarget(x, y, z) {
    this.reachTarget = new THREE.Vector3(x, y, z);
  }

  clearReach() {
    this.reachTarget = null;
  }

  setGazeTarget(x, y, z) {
    this.gazeTarget = new THREE.Vector3(x, y, z);
  }

  clearGaze() {
    this.gazeTarget = null;
  }

  configure({ headGazeWeight, eyeGazeWeight } = {}) {
    if (Number.isFinite(Number(headGazeWeight))) this.headGazeWeight = Math.max(0, Math.min(1, Number(headGazeWeight)));
    if (Number.isFinite(Number(eyeGazeWeight))) this.eyeGazeWeight = Math.max(0, Math.min(1, Number(eyeGazeWeight)));
  }

  /** Apply procedural IK arm reach + weighted head gaze overlays after base rig pose. */
  applyPostPose(robot, dt = 0.016) {
    const nodes = robot?.nodes;
    if (!nodes) return;

    if (this.reachTarget && nodes.Arm_R && nodes.Root) {
      const worldRoot = new THREE.Vector3();
      nodes.Root.getWorldPosition(worldRoot);
      const dx = this.reachTarget.x - worldRoot.x;
      const dy = this.reachTarget.y - (worldRoot.y + 0.72);
      const dz = this.reachTarget.z - worldRoot.z;
      const pitch = Math.max(-1.45, Math.min(0.65, -Math.atan2(dy, Math.max(0.15, Math.hypot(dx, dz))) - 0.55));
      const lerpFactor = Math.min(1, dt * 8);
      nodes.Arm_R.rotation.x += (pitch - nodes.Arm_R.rotation.x) * lerpFactor;
      if (this.held.left) {
        nodes.Arm_L.rotation.x += (pitch - nodes.Arm_L.rotation.x) * lerpFactor;
      }
    }

    if (this.gazeTarget && nodes.Head && nodes.Root) {
      const rootPos = new THREE.Vector3();
      nodes.Root.getWorldPosition(rootPos);
      const dx = this.gazeTarget.x - rootPos.x;
      const dy = this.gazeTarget.y - (rootPos.y + 0.92);
      const dz = this.gazeTarget.z - rootPos.z;
      const targetYaw = Math.atan2(dx, Math.max(0.2, dz)) * this.headGazeWeight;
      const clampedYaw = Math.max(-0.7, Math.min(0.7, targetYaw - (nodes.Root.rotation.y || 0)));
      const clampedPitch = Math.max(-0.4, Math.min(0.4, -Math.atan2(dy, Math.max(0.25, Math.hypot(dx, dz))) * this.headGazeWeight));
      const alpha = Math.min(1, dt * 6);
      nodes.Head.rotation.y += (clampedYaw - nodes.Head.rotation.y) * alpha;
      nodes.Head.rotation.x += (clampedPitch - nodes.Head.rotation.x) * alpha;
    }
  }
}

export const ikSockets = new RobotIKController();
