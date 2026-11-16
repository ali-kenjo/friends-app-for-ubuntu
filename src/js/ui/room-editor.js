// ---------- Live 3D Visual Room Layout Editor UI (ui/room-editor.js) ----------
// Transform Gizmos (Translate, Rotate, Scale, Grid & Surface Snap), Undo/Redo,
// 3 Built-In Room Layout Presets, Spatial Debug Overlays, Asset Catalog Drawer
// (Spawn, Duplicate, Hide/Show, Rename, Reset, Custom .glb Upload/Clear), and Property Inspector.
import { appState } from "../core/state-store.mjs";
import { bus, EVENTS } from "../core/event-bus.mjs";
import { ASSET_DEFINITIONS, ROOM_LAYOUT_PRESETS } from "../core/world/asset-framework.mjs";
import { unifiedRoom } from "../core/world/unified-room-manager.mjs";
import { roomGizmos } from "../core/world/gizmos.mjs";
import { navMesh } from "../core/robot/pathfinding.mjs";
import { uploadAssetGlb, removeAssetGlb } from "../storage/bundle-client.mjs";
import { getSettings, updateSettings } from "../store.js";

export function renderRoomEditorTab(container) {
  if (!container) return;

  const saveLayout = () => {
    const assets = appState.get("roomAssets") || [];
    const presetId = appState.get("roomMeta")?.presetId || "creator_studio_desk";
    const gridSnap = Boolean(appState.get("gridSnap"));
    const surfaceSnap = appState.get("surfaceSnap") !== false;
    updateSettings({
      roomEditor: { presetId, gridSnap, surfaceSnap, assets },
    }).catch(() => {});
  };

  const render = () => {
    const selectedId = appState.get("selectedAssetId");
    const assets = appState.get("roomAssets") || [];
    const selected = assets.find((a) => a.id === selectedId) || null;
    const overlays = appState.get("debugOverlays") || {};
    const gizmoMode = appState.get("gizmoMode") || "translate";
    const gridSnap = Boolean(appState.get("gridSnap"));
    const surfaceSnap = appState.get("surfaceSnap") !== false;
    const currentPreset = appState.get("roomMeta")?.presetId || "creator_studio_desk";

    container.innerHTML = `
      <div class="v1-sec">
        <h4>Room Layout Presets</h4>
        <div class="v1-btn-row">
          ${Object.values(ROOM_LAYOUT_PRESETS)
            .map(
              (p) =>
                `<button type="button" class="v1-pill-btn ${currentPreset === p.id ? "active" : ""}" data-preset="${p.id}" title="${p.description}">${p.label}</button>`
            )
            .join("")}
        </div>
      </div>

      <div class="v1-sec">
        <h4>3D Transform Gizmos &amp; Snapping</h4>
        <div class="v1-btn-row">
          <button type="button" class="v1-pill-btn ${gizmoMode === "translate" ? "active" : ""}" data-gizmo="translate">Move (XYZ)</button>
          <button type="button" class="v1-pill-btn ${gizmoMode === "rotate" ? "active" : ""}" data-gizmo="rotate">Rotate (Y)</button>
          <button type="button" class="v1-pill-btn ${gizmoMode === "scale" ? "active" : ""}" data-gizmo="scale">Scale</button>
        </div>
        <div class="v1-check-row">
          <label><input type="checkbox" data-snap="grid" ${gridSnap ? "checked" : ""}> Grid Snap (0.1m)</label>
          <label><input type="checkbox" data-snap="surface" ${surfaceSnap ? "checked" : ""}> Surface Snap</label>
        </div>
        <div class="v1-btn-row">
          <button type="button" class="v1-pill-btn" data-hist="undo" ${appState.undo.canUndo() ? "" : "disabled"}>Undo (Ctrl+Z)</button>
          <button type="button" class="v1-pill-btn" data-hist="redo" ${appState.undo.canRedo() ? "" : "disabled"}>Redo (Ctrl+Y)</button>
        </div>
      </div>

      <div class="v1-sec">
        <h4>Spatial Debug Overlays</h4>
        <div class="v1-check-grid">
          <label><input type="checkbox" data-dbg="navMesh" ${overlays.navMesh ? "checked" : ""}> Walkable NavMesh</label>
          <label><input type="checkbox" data-dbg="anchors" ${overlays.anchors ? "checked" : ""}> Prop Anchors</label>
          <label><input type="checkbox" data-dbg="homeSpot" ${overlays.homeSpot ? "checked" : ""}> Home Spot</label>
          <label><input type="checkbox" data-dbg="routes" ${overlays.routes ? "checked" : ""}> Waypoint Route</label>
        </div>
      </div>

      <div class="v1-sec">
        <h4>Selected Asset Inspector</h4>
        ${
          selected
            ? `
          <div class="v1-inspector">
            <label>Name <input type="text" data-prop="name" value="${selected.name || selected.id}"></label>
            <div class="v1-num-grid">
              <label>X <input type="number" step="0.05" data-num="x" value="${Number(selected.x || 0).toFixed(2)}"></label>
              <label>Y <input type="number" step="0.05" data-num="y" value="${Number(selected.y || 0).toFixed(2)}"></label>
              <label>Z <input type="number" step="0.05" data-num="z" value="${Number(selected.z || 0).toFixed(2)}"></label>
              <label>RotY <input type="number" step="0.1" data-num="rotY" value="${Number(selected.rotY || 0).toFixed(2)}"></label>
              <label>Scale <input type="number" step="0.05" min="0.25" max="3" data-num="scale" value="${Number(selected.scale || 1).toFixed(2)}"></label>
            </div>
            <div class="v1-btn-row">
              <button type="button" class="v1-pill-btn" data-asset-act="duplicate">Duplicate</button>
              <button type="button" class="v1-pill-btn" data-asset-act="toggle-vis">${selected.visible === false ? "Show" : "Hide"}</button>
              <button type="button" class="v1-pill-btn" data-asset-act="reset">Reset Pose</button>
              <button type="button" class="v1-pill-btn danger" data-asset-act="delete">Remove</button>
            </div>
            <div class="v1-glb-box">
              <span>Custom .GLB Override: ${selected.customGlbId ? "Active" : "Procedural Default"}</span>
              <div class="v1-btn-row">
                <label class="v1-pill-btn v1-file-btn">Attach .GLB<input type="file" accept=".glb,.gltf" data-glb-upload hidden></label>
                ${selected.customGlbId ? `<button type="button" class="v1-pill-btn" data-asset-act="clear-glb">Clear .GLB</button>` : ""}
              </div>
            </div>
          </div>
        `
            : `<p class="v1-muted">Click any 3D prop/toy in the viewport or pick from the room list below.</p>`
        }
      </div>

      <div class="v1-sec">
        <h4>Active Room Assets (${assets.length})</h4>
        <div class="v1-asset-list">
          ${assets
            .map(
              (a) => `
            <button type="button" class="v1-asset-chip ${selectedId === a.id ? "active" : ""} ${a.visible === false ? "hidden-item" : ""}" data-select="${a.id}">
              <span>${a.name || a.id}</span>
              <small>${a.category}${a.attachedTo ? ` · on ${a.attachedTo}` : ""}</small>
            </button>`
            )
            .join("")}
        </div>
      </div>

      <div class="v1-sec">
        <h4>Spawn Furniture, Props &amp; 8 Toys</h4>
        <div class="v1-catalog-grid">
          ${Object.values(ASSET_DEFINITIONS)
            .map((d) => `<button type="button" class="v1-pill-btn" data-spawn="${d.kind}">+ ${d.name}</button>`)
            .join("")}
        </div>
      </div>
    `;

    // Bind events cleanly
    container.querySelectorAll("[data-preset]").forEach((btn) =>
      btn.addEventListener("click", () => {
        unifiedRoom.loadPreset(btn.dataset.preset);
        saveLayout();
        render();
      })
    );

    container.querySelectorAll("[data-gizmo]").forEach((btn) =>
      btn.addEventListener("click", () => {
        roomGizmos.setMode(btn.dataset.gizmo);
        render();
      })
    );

    container.querySelector('[data-snap="grid"]')?.addEventListener("change", (e) => {
      roomGizmos.setSnap(e.target.checked, 0.1);
      saveLayout();
    });
    container.querySelector('[data-snap="surface"]')?.addEventListener("change", (e) => {
      appState.set(null, { surfaceSnap: e.target.checked });
      saveLayout();
    });

    container.querySelector('[data-hist="undo"]')?.addEventListener("click", () => {
      if (appState.undo.undo()) {
        saveLayout();
        render();
      }
    });
    container.querySelector('[data-hist="redo"]')?.addEventListener("click", () => {
      if (appState.undo.redo()) {
        saveLayout();
        render();
      }
    });

    container.querySelectorAll("[data-dbg]").forEach((cb) =>
      cb.addEventListener("change", () => {
        const cur = { ...(appState.get("debugOverlays") || {}) };
        cur[cb.dataset.dbg] = cb.checked;
        appState.set(null, { debugOverlays: cur });
        if (cb.dataset.dbg === "navMesh" && cb.checked) {
          navMesh.rebuild(appState.get("roomAssets") || []);
        }
        unifiedRoom.rebuildDebugOverlays(navMesh, getSettings()?.behaviorEngine?.waypointRoute);
      })
    );

    container.querySelectorAll("[data-select]").forEach((btn) =>
      btn.addEventListener("click", () => {
        roomGizmos.selectAsset(btn.dataset.select);
        render();
      })
    );

    container.querySelectorAll("[data-spawn]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const created = unifiedRoom.spawnAsset(btn.dataset.spawn);
        roomGizmos.selectAsset(created.id);
        saveLayout();
        render();
      })
    );

    if (selected) {
      container.querySelectorAll("[data-num]").forEach((inp) =>
        inp.addEventListener("change", () => {
          const val = Number(inp.value);
          if (!Number.isFinite(val)) return;
          const prev = { x: selected.x, y: selected.y, z: selected.z, rotY: selected.rotY, scale: selected.scale };
          const next = { ...prev, [inp.dataset.num]: val };
          const useSnap = inp.dataset.num !== "y" && surfaceSnap;
          unifiedRoom.moveAsset(selected.id, next, useSnap);
          appState.undo.push({
            label: `Edit ${selected.id}.${inp.dataset.num}`,
            undo: () => unifiedRoom.moveAsset(selected.id, prev, false),
            redo: () => unifiedRoom.moveAsset(selected.id, next, useSnap),
          });
          saveLayout();
        })
      );

      container.querySelector('[data-prop="name"]')?.addEventListener("change", (e) => {
        unifiedRoom.moveAsset(selected.id, { name: e.target.value.trim().slice(0, 60) || selected.id }, false);
        saveLayout();
      });

      container.querySelectorAll("[data-asset-act]").forEach((btn) =>
        btn.addEventListener("click", async () => {
          const act = btn.dataset.assetAct;
          const list = [...(appState.get("roomAssets") || [])];
          if (act === "duplicate") {
            const copy = { ...selected, id: `${selected.kind}_${Date.now().toString(36)}`, x: Number((selected.x + 0.25).toFixed(2)) };
            list.push(copy);
            appState.set("roomAssets", list);
            unifiedRoom.syncFromState();
            roomGizmos.selectAsset(copy.id);
          } else if (act === "toggle-vis") {
            unifiedRoom.moveAsset(selected.id, { visible: selected.visible === false }, false);
          } else if (act === "reset") {
            unifiedRoom.moveAsset(selected.id, { x: 0, y: 0, z: -0.6, rotY: 0, scale: 1 }, true);
          } else if (act === "delete") {
            appState.set("roomAssets", list.filter((a) => a.id !== selected.id));
            roomGizmos.selectAsset(null);
            unifiedRoom.syncFromState();
            bus.emit(EVENTS.ROOM_CHANGED, appState.buildRoomContextSummary());
          } else if (act === "clear-glb") {
            await removeAssetGlb(selected.id).catch(() => {});
            unifiedRoom.moveAsset(selected.id, { customGlbId: "" }, false);
          }
          saveLayout();
          render();
        })
      );

      container.querySelector("[data-glb-upload]")?.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          await uploadAssetGlb(selected.id, file);
          unifiedRoom.moveAsset(selected.id, { customGlbId: selected.id }, false);
          saveLayout();
          render();
        } catch (err) {
          alert(err.message);
        }
      });
    }
  };

  render();
  const off1 = bus.on(EVENTS.PROP_SELECTED, render);
  const off2 = bus.on(EVENTS.PROP_TRANSFORMED, () => saveLayout());
  return () => {
    off1();
    off2();
  };
}
