// ---------- Unified 3D InteractiveAsset Manager & Spatial Debug Overlays ----------
// Spawns procedural furniture/desk props/8 toys + custom .glb overrides, syncs
// surface-snap attachments, renders spatial debug overlays (NavMesh, approach anchors,
// Home Standing Spot, waypoint route splines & numbered badges), and executes asset actions.
import * as THREE from "three";
import {
  ASSET_DEFINITIONS,
  ROOM_LAYOUT_PRESETS,
  loadNormalizedGlb,
  makeAssetEntry,
  resolveSurfaceSnap,
} from "./asset-framework.mjs";
import {
  buildWhiteboardProp,
  buildDeskTableProp,
  buildStudyChairProp,
  buildVaseFlowersProp,
  buildBooksNotebookProp,
  buildPensCupProp,
  buildGamingConsoleProp,
} from "./props-unified.mjs";
import { buildToyMesh } from "./toys.mjs";
import { shaderPipeline } from "./shader-pipeline.mjs";
import { appState } from "../state-store.mjs";
import { bus, EVENTS } from "../event-bus.mjs";

export class UnifiedRoomManager {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = "UnifiedRoomAssets";
    this.debugGroup = new THREE.Group();
    this.debugGroup.name = "SpatialDebugOverlays";
    this.root.add(this.debugGroup);

    /** @type {Map<string, { asset: any, controller: any, group: THREE.Group, sockets: any }>} */
    this.instances = new Map();
    this.foleyVolume = 0.65;
    this.shaderTheme = "cozy_stylized";
    this.accentHex = "#f5a94a";
  }

  attachToScene(scene) {
    if (scene && !this.root.parent) scene.add(this.root);
  }

  setFoleyVolume(vol0to100) {
    this.foleyVolume = Math.max(0, Math.min(1, Number(vol0to100) / 100));
  }

  setVisualTheme(theme, accent) {
    this.shaderTheme = theme || this.shaderTheme;
    if (accent) this.accentHex = accent;
    shaderPipeline.applyStyle(this.root, this.shaderTheme, { accent: this.accentHex });
  }

  loadPreset(presetId = "creator_studio_desk") {
    const preset = ROOM_LAYOUT_PRESETS[presetId] || ROOM_LAYOUT_PRESETS.creator_studio_desk;
    const clonedAssets = preset.assets.map((a) => ({ ...a }));
    appState.set("roomAssets", clonedAssets);
    appState.set("roomMeta", {
      presetId: preset.id,
      homeSpot: { ...preset.homeSpot },
    });
    this.syncFromState();
    bus.emit(EVENTS.ROOM_PRESET_LOADED, { presetId: preset.id });
    bus.emit(EVENTS.ROOM_CHANGED, appState.buildRoomContextSummary());
  }

  syncFromState() {
    const assets = appState.get("roomAssets") || [];
    const wantedIds = new Set(assets.map((a) => a.id));

    for (const [id, inst] of this.instances.entries()) {
      if (!wantedIds.has(id)) {
        this.root.remove(inst.group);
        this.instances.delete(id);
      }
    }

    for (const asset of assets) {
      let inst = this.instances.get(asset.id);
      if (!inst || inst.kind !== asset.kind || inst.customGlbId !== (asset.customGlbId || "")) {
        if (inst) this.root.remove(inst.group);
        inst = this.createInstance(asset);
        this.instances.set(asset.id, inst);
        this.root.add(inst.group);
      }
      inst.asset = asset;
      inst.group.visible = asset.visible !== false;
      inst.group.position.set(asset.x || 0, asset.y || 0, asset.z || 0);
      inst.group.rotation.y = asset.rotY || 0;
      const sc = Math.max(0.25, Math.min(3.0, Number(asset.scale) || 1));
      inst.group.scale.setScalar(sc);
      inst.group.userData.assetId = asset.id;
    }

    shaderPipeline.applyStyle(this.root, this.shaderTheme, { accent: this.accentHex });
    this.rebuildDebugOverlays();
  }

  createInstance(asset) {
    let controller = null;
    switch (asset.kind) {
      case "whiteboard":
        controller = buildWhiteboardProp(asset, this.foleyVolume);
        break;
      case "desk_table":
        controller = buildDeskTableProp(asset);
        break;
      case "study_chair":
        controller = buildStudyChairProp(asset);
        break;
      case "vase_flowers":
        controller = buildVaseFlowersProp(asset, this.foleyVolume);
        break;
      case "books_notebook":
        controller = buildBooksNotebookProp(asset, this.foleyVolume);
        break;
      case "pens_cup":
        controller = buildPensCupProp(asset);
        break;
      case "gaming_console":
        controller = buildGamingConsoleProp(asset, this.foleyVolume);
        break;
      default:
        controller = buildToyMesh(asset.kind, asset, this.foleyVolume);
        break;
    }

    const group = controller.group;
    group.userData.assetId = asset.id;

    // Extract standard sockets cleanly
    const sockets = { handGrip: null, robotStand: null, dynamicCanvasMeshes: [] };
    group.traverse((obj) => {
      if (obj.name === "socket_hand_grip") sockets.handGrip = obj;
      if (obj.name === "anchor_robot_stand") sockets.robotStand = obj;
      if (obj.userData?.isDynamicCanvas) sockets.dynamicCanvasMeshes.push(obj);
    });

    if (asset.customGlbId) {
      const def = ASSET_DEFINITIONS[asset.kind] || ASSET_DEFINITIONS.bouncy_ball;
      loadNormalizedGlb(`/api/studio/asset-glb/${encodeURIComponent(asset.customGlbId)}`, {
        targetHeight: def.targetHeight || 0.8,
      })
        .then(({ group: glbGroup, sockets: glbSockets }) => {
          const cur = this.instances.get(asset.id);
          if (!cur || cur.customGlbId !== asset.customGlbId) return;
          // Swap visual children while keeping controller state & DynamicCanvas binding
          while (group.children.length) group.remove(group.children[0]);
          group.add(glbGroup);
          if (controller.canvasTex && glbSockets.dynamicCanvasMeshes.length) {
            for (const m of glbSockets.dynamicCanvasMeshes) {
              if (m.material) {
                m.material.map = controller.canvasTex;
                m.material.needsUpdate = true;
              }
            }
          }
          cur.sockets = glbSockets;
          shaderPipeline.applyStyle(group, this.shaderTheme, { accent: this.accentHex });
        })
        .catch(() => {});
    }

    return { kind: asset.kind, customGlbId: asset.customGlbId || "", asset, controller, group, sockets };
  }

  /** Move an asset and propagate delta transforms to surface-snapped child props (e.g. desk -> lamp/vase). */
  moveAsset(assetId, nextTransform, applySnap = true) {
    const assets = [...(appState.get("roomAssets") || [])];
    const idx = assets.findIndex((a) => a.id === assetId);
    if (idx < 0) return;

    const prev = assets[idx];
    const updated = { ...prev, ...nextTransform };
    const dx = (updated.x || 0) - (prev.x || 0);
    const dy = (updated.y || 0) - (prev.y || 0);
    const dz = (updated.z || 0) - (prev.z || 0);

    if (applySnap && updated.surfaceSnap !== false) {
      const snap = resolveSurfaceSnap(updated, assets);
      updated.y = snap.y;
      updated.attachedTo = snap.attachedTo;
    }
    assets[idx] = updated;

    // Move props snapped onto this parent
    for (let i = 0; i < assets.length; i++) {
      if (assets[i].attachedTo === assetId) {
        assets[i] = {
          ...assets[i],
          x: (assets[i].x || 0) + dx,
          y: (assets[i].y || 0) + dy,
          z: (assets[i].z || 0) + dz,
        };
      }
    }

    appState.set("roomAssets", assets);
    this.syncFromState();
    bus.emit(EVENTS.PROP_TRANSFORMED, { assetId, transform: updated });
    bus.emit(EVENTS.ROOM_CHANGED, appState.buildRoomContextSummary());
  }

  spawnAsset(kind) {
    const assets = [...(appState.get("roomAssets") || [])];
    const existing = assets.filter((a) => a.kind === kind).length;
    const id = existing === 0 ? kind : `${kind}_${existing + 1}`;
    const entry = makeAssetEntry(kind, {
      id,
      x: Number(((Math.random() - 0.5) * 1.2).toFixed(2)),
      z: Number((-0.4 - Math.random() * 0.8).toFixed(2)),
    });
    const snap = resolveSurfaceSnap(entry, assets);
    entry.y = snap.y;
    entry.attachedTo = snap.attachedTo;
    assets.push(entry);
    appState.set("roomAssets", assets);
    this.syncFromState();
    bus.emit(EVENTS.ROOM_CHANGED, appState.buildRoomContextSummary());
    return entry;
  }

  /** Execute an asset action (from AI tool, Behavior Engine, or Quick Prop menu). */
  triggerAssetAction(assetId, action = "use", payload = {}) {
    const inst = this.instances.get(assetId);
    if (!inst) return false;
    const { controller } = inst;

    if (inst.kind === "whiteboard") {
      if (action === "clear") {
        controller.clearBoard?.();
        appState.set("roomMeta", { whiteboardText: "" });
      } else if (action === "explain" || payload.title) {
        controller.writeStructured?.(payload);
        appState.set("roomMeta", { whiteboardText: controller.getTextSummary?.() || "" });
      } else {
        controller.writeStructured?.({
          title: "Interactive Whiteboard",
          bullets: ["Ready for diagrams", "Ask AI to explain any topic"],
        });
        appState.set("roomMeta", { whiteboardText: controller.getTextSummary?.() || "" });
      }
    } else if (inst.kind === "vase_flowers") {
      if (action === "water") {
        controller.triggerWater?.();
        appState.set("roomMeta", { flowerState: "vibrant_bloom" });
      } else if (action === "droop") {
        controller.setHydration?.("drooping");
        appState.set("roomMeta", { flowerState: "drooping" });
      }
    } else if (inst.kind === "books_notebook") {
      const noteText = payload.note || "Reviewed interactive session goals";
      controller.addNote?.(noteText);
      appState.set("roomMeta", { notebookNotes: controller.getNotes?.() || [] });
    } else if (inst.kind === "gaming_console") {
      controller.playSession?.();
    } else {
      controller.trigger?.(action, payload);
    }

    bus.emit(EVENTS.PROP_INTERACT, { assetId, action, payload });
    bus.emit(EVENTS.PROP_STATE_CHANGED, { assetId, action });
    return true;
  }

  /** Build visual NavMesh, approach anchors, Home Spot ring, and Waypoint splines. */
  rebuildDebugOverlays(navGrid = null, waypointRoute = null) {
    while (this.debugGroup.children.length) this.debugGroup.remove(this.debugGroup.children[0]);
    const overlays = appState.get("debugOverlays") || {};
    const assets = appState.get("roomAssets") || [];
    const home = appState.get("roomMeta")?.homeSpot || { x: 0, z: 0.15, rotY: 0 };

    if (overlays.homeSpot) {
      const homeRing = new THREE.Mesh(
        new THREE.RingGeometry(0.18, 0.23, 28),
        new THREE.MeshBasicMaterial({ color: "#38bdf8", side: THREE.DoubleSide, transparent: true, opacity: 0.72 })
      );
      homeRing.rotation.x = -Math.PI / 2;
      homeRing.position.set(home.x || 0, 0.012, home.z || 0);
      homeRing.userData.skipShaderPipeline = true;
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.14, 10),
        new THREE.MeshBasicMaterial({ color: "#38bdf8" })
      );
      arrow.rotation.x = Math.PI / 2;
      arrow.position.set(0, 0.02, 0.22);
      arrow.userData.skipShaderPipeline = true;
      const wrap = new THREE.Group();
      wrap.position.set(home.x || 0, 0.01, home.z || 0);
      wrap.rotation.y = home.rotY || 0;
      wrap.add(arrow);
      this.debugGroup.add(homeRing, wrap);
    }

    if (overlays.anchors) {
      for (const a of assets) {
        if (a.visible === false) continue;
        const off = a.approachOffset || [0, 0.55];
        const sin = Math.sin(a.rotY || 0);
        const cos = Math.cos(a.rotY || 0);
        const ax = (a.x || 0) + off[0] * cos + off[1] * sin;
        const az = (a.z || 0) - off[0] * sin + off[1] * cos;
        const marker = new THREE.Mesh(
          new THREE.RingGeometry(0.09, 0.125, 16),
          new THREE.MeshBasicMaterial({ color: "#fbbf24", side: THREE.DoubleSide })
        );
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(ax, 0.015, az);
        marker.userData.skipShaderPipeline = true;
        this.debugGroup.add(marker);
      }
    }

    if (overlays.navMesh && navGrid?.cells) {
      const cellSize = navGrid.resolution || 0.22;
      const geo = new THREE.PlaneGeometry(cellSize * 0.82, cellSize * 0.82);
      const freeMat = new THREE.MeshBasicMaterial({ color: "#22c55e", transparent: true, opacity: 0.22, side: THREE.DoubleSide });
      const blockedMat = new THREE.MeshBasicMaterial({ color: "#ef4444", transparent: true, opacity: 0.38, side: THREE.DoubleSide });
      for (const cell of navGrid.cells) {
        const m = new THREE.Mesh(geo, cell.blocked ? blockedMat : freeMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(cell.x, 0.008, cell.z);
        m.userData.skipShaderPipeline = true;
        this.debugGroup.add(m);
      }
    }

    if (overlays.routes && waypointRoute?.nodes?.length >= 2) {
      const pts = waypointRoute.nodes.map((n) => new THREE.Vector3(n.x || 0, 0.03, n.z || 0));
      const lineGeo = new THREE.BufferGeometry().setFromPoints(
        waypointRoute.mode === "loop" ? [...pts, pts[0]] : pts
      );
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: "#a78bfa" }));
      line.userData.skipShaderPipeline = true;
      this.debugGroup.add(line);

      pts.forEach((p, idx) => {
        const badge = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16),
          new THREE.MeshBasicMaterial({ color: idx === 0 ? "#22d3ee" : "#a78bfa" })
        );
        badge.position.copy(p);
        badge.userData.skipShaderPipeline = true;
        this.debugGroup.add(badge);
      });
    }
  }

  getApproachSpot(assetId) {
    const inst = this.instances.get(assetId);
    if (!inst) return null;
    if (inst.sockets?.robotStand) {
      const wp = new THREE.Vector3();
      inst.sockets.robotStand.getWorldPosition(wp);
      return { x: wp.x, z: wp.z, lookX: inst.asset.x || 0, lookZ: inst.asset.z || 0 };
    }
    const a = inst.asset;
    const off = a.approachOffset || [0, 0.55];
    const sin = Math.sin(a.rotY || 0);
    const cos = Math.cos(a.rotY || 0);
    return {
      x: (a.x || 0) + off[0] * cos + off[1] * sin,
      z: (a.z || 0) - off[0] * sin + off[1] * cos,
      lookX: a.x || 0,
      lookZ: a.z || 0,
    };
  }

  update(dt, time) {
    for (const inst of this.instances.values()) {
      inst.controller?.update?.(dt, time);
    }
  }
}

export const unifiedRoom = new UnifiedRoomManager();
