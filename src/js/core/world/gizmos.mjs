// ---------- 3D Viewport Transform Gizmo Controller (core/world/gizmos.mjs) ----------
// Attaches Three.js TransformControls cleanly to selected InteractiveAssets inside the
// 3D viewport with Translate/Rotate/Scale modes, Grid & Surface snapping, and Undo/Redo.
import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { appState } from "../state-store.mjs";
import { bus, EVENTS } from "../event-bus.mjs";
import { unifiedRoom } from "./unified-room-manager.mjs";

export class RoomGizmoController {
  constructor() {
    this.controls = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.beforeDrag = null;
    this.enabled = false;
  }

  init(camera, domElement, scene) {
    if (!camera || !domElement || !scene) return;
    if (this.controls) this.dispose();

    this.camera = camera;
    this.domElement = domElement;
    this.scene = scene;

    this.controls = new TransformControls(camera, domElement);
    this.controls.size = 0.72;
    this.controls.visible = false;
    this.controls.enabled = false;
    const helper = this.controls.getHelper ? this.controls.getHelper() : this.controls;
    helper.userData.skipShaderPipeline = true;
    scene.add(helper);

    this.controls.addEventListener("dragging-changed", (event) => {
      const dragging = Boolean(event.value);
      const id = appState.get("selectedAssetId");
      if (!id) return;
      const inst = unifiedRoom.instances.get(id);
      if (!inst) return;
      if (dragging) {
        this.beforeDrag = {
          x: inst.asset.x,
          y: inst.asset.y,
          z: inst.asset.z,
          rotY: inst.asset.rotY,
          scale: inst.asset.scale,
        };
      } else if (this.beforeDrag) {
        const snapPrev = { ...this.beforeDrag };
        const obj = inst.group;
        const snapNext = {
          x: Number(obj.position.x.toFixed(3)),
          y: Number(obj.position.y.toFixed(3)),
          z: Number(obj.position.z.toFixed(3)),
          rotY: Number(obj.rotation.y.toFixed(3)),
          scale: Number(obj.scale.x.toFixed(3)),
        };
        const useSurfaceSnap = appState.get("surfaceSnap") !== false;
        unifiedRoom.moveAsset(id, snapNext, useSurfaceSnap);
        appState.undo.push({
          label: `Transform ${id}`,
          undo: () => unifiedRoom.moveAsset(id, snapPrev, false),
          redo: () => unifiedRoom.moveAsset(id, snapNext, useSurfaceSnap),
        });
        this.beforeDrag = null;
      }
    });

    this._onPointerDown = (e) => this.handleViewportClick(e);
    domElement.addEventListener("pointerdown", this._onPointerDown);
  }

  setActive(on) {
    this.enabled = Boolean(on);
    if (!this.controls) return;
    if (!this.enabled) {
      this.controls.detach();
      this.controls.visible = false;
      this.controls.enabled = false;
    } else {
      this.selectAsset(appState.get("selectedAssetId"));
    }
  }

  setMode(mode = "translate") {
    const clean = ["translate", "rotate", "scale"].includes(mode) ? mode : "translate";
    appState.set(null, { gizmoMode: clean });
    if (!this.controls) return;
    this.controls.setMode(clean);
    this.controls.showX = clean !== "rotate";
    this.controls.showY = true;
    this.controls.showZ = clean !== "rotate";
  }

  setSnap(gridSnap, gridSize = 0.1) {
    appState.set(null, { gridSnap: Boolean(gridSnap) });
    if (!this.controls) return;
    this.controls.setTranslationSnap(gridSnap ? gridSize : null);
    this.controls.setRotationSnap(gridSnap ? Math.PI / 12 : null);
  }

  selectAsset(assetId) {
    appState.set(null, { selectedAssetId: assetId || null });
    bus.emit(EVENTS.PROP_SELECTED, { assetId: assetId || null });
    if (!this.controls || !this.enabled) return;
    if (!assetId) {
      this.controls.detach();
      this.controls.visible = false;
      this.controls.enabled = false;
      return;
    }
    const inst = unifiedRoom.instances.get(assetId);
    if (!inst) {
      this.controls.detach();
      return;
    }
    this.controls.attach(inst.group);
    this.controls.visible = true;
    this.controls.enabled = true;
    this.setMode(appState.get("gizmoMode") || "translate");
  }

  handleViewportClick(e) {
    if (!this.enabled || !this.camera || !this.domElement) return;
    if (this.controls?.dragging) return;
    const rect = this.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // In Waypoint Edit mode, floor click appends a waypoint node!
    if (appState.get("waypointEditMode")) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hitPt = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(plane, hitPt)) {
        bus.emit("editor:waypoint_floor_click", {
          x: Number(hitPt.x.toFixed(2)),
          z: Number(hitPt.z.toFixed(2)),
        });
      }
      return;
    }

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const roots = [...unifiedRoom.instances.values()].map((i) => i.group);
    const hits = this.raycaster.intersectObjects(roots, true);
    if (!hits.length) return;
    let obj = hits[0].object;
    while (obj && !obj.userData?.assetId) obj = obj.parent;
    if (obj?.userData?.assetId) {
      this.selectAsset(obj.userData.assetId);
    }
  }

  dispose() {
    if (this.domElement && this._onPointerDown) {
      this.domElement.removeEventListener("pointerdown", this._onPointerDown);
    }
    if (this.controls) {
      const helper = this.controls.getHelper ? this.controls.getHelper() : this.controls;
      helper.parent?.remove(helper);
      this.controls.dispose();
      this.controls = null;
    }
  }
}

export const roomGizmos = new RoomGizmoController();
