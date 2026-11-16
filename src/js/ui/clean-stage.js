// ---------- Clean Stage & OBS Broadcast Mode Controller (ui/clean-stage.js) ----------
// Manages Studio Mode collapsible drawer, Clean Stage mode (H / F11) hiding all UI
// with auto-hiding hover corner pill, OBS backdrops (Full 3D Room, Solid Studio,
// Chroma-Key Green/Blue, Compositor-Transparent Window), and critically-damped camera transitions.
import { bus, EVENTS } from "../core/event-bus.mjs";
import { appState } from "../core/state-store.mjs";
import { updateSettings } from "../store.js";

export const CAMERA_PRESET_VIEWS = Object.freeze({
  wide_room: { label: "Wide Room", pos: [0, 1.48, 3.25], target: [0, 0.85, -0.35] },
  desk_closeup: { label: "Desk Close-Up", pos: [-0.25, 1.38, 0.48], target: [-0.95, 0.85, -1.15] },
  whiteboard_focus: { label: "Whiteboard Focus", pos: [0.35, 1.4, 0.55], target: [1.22, 1.25, -1.25] },
  follow_robot: { label: "Follow Robot", pos: [0, 1.32, 2.15], target: [0, 0.85, 0] },
  cinema_orbit: { label: "Cinema Orbit", pos: [1.65, 1.55, 2.45], target: [0, 0.82, -0.45] },
});

export class CleanStageController {
  constructor() {
    this.pill = null;
    this.drawer = null;
    this.stage = {
      cleanStage: false,
      backdrop: "full_room", // full_room | solid_studio | chroma_green | chroma_blue | transparent_window
      solidColor: "#14161f",
      cameraPreset: "wide_room",
      hoverPill: true,
    };
  }

  mount(parent = document.body) {
    if (this.pill) return;
    this.pill = document.createElement("div");
    this.pill.id = "v1-stage-hover-pill";
    this.pill.className = "v1-stage-hover-pill hidden";
    this.pill.setAttribute("data-no-i18n", "");
    this.pill.innerHTML = `
      <button type="button" id="v1-pill-exit-clean">Exit Clean Stage (H)</button>
      <button type="button" id="v1-pill-open-studio">Studio</button>
    `;
    parent.appendChild(this.pill);

    this.pill.querySelector("#v1-pill-exit-clean")?.addEventListener("click", () => this.toggleCleanStage(false));
    this.pill.querySelector("#v1-pill-open-studio")?.addEventListener("click", () => {
      this.toggleCleanStage(false);
      bus.emit(EVENTS.DOCK_ACTION, { action: "open_studio", forceOpen: true });
    });

    bus.on(EVENTS.DOCK_ACTION, ({ action, preset }) => {
      if (action === "clean_stage") this.toggleCleanStage();
      if (action === "camera_preset" && preset) this.setCameraPreset(preset);
    });
  }

  configure(cfg = {}) {
    if (!cfg || typeof cfg !== "object") return;
    this.stage = { ...this.stage, ...cfg };
    this.applyCleanStage(Boolean(this.stage.cleanStage));
    this.applyBackdrop(this.stage.backdrop, this.stage.solidColor);
  }

  toggleCleanStage(force) {
    const next = typeof force === "boolean" ? force : !appState.get("cleanStage");
    this.applyCleanStage(next);
    updateSettings({ stageMode: { cleanStage: next } }).catch(() => {});
  }

  applyCleanStage(on) {
    this.stage.cleanStage = Boolean(on);
    appState.set(null, { cleanStage: this.stage.cleanStage });
    document.body.classList.toggle("v1-clean-stage", this.stage.cleanStage);
    if (this.pill) {
      this.pill.classList.toggle("hidden", !this.stage.cleanStage || !this.stage.hoverPill);
    }
    bus.emit(EVENTS.STAGE_MODE_CHANGED, { ...this.stage });
  }

  setBackdrop(backdrop, solidColor = this.stage.solidColor) {
    this.applyBackdrop(backdrop, solidColor);
    updateSettings({ stageMode: { backdrop, solidColor } }).catch(() => {});
  }

  applyBackdrop(backdrop, solidColor = "#14161f") {
    this.stage.backdrop = backdrop;
    this.stage.solidColor = solidColor;
    appState.set(null, { stageBackdrop: backdrop });
    document.body.classList.toggle("v1-transparent-stage", backdrop === "transparent_window");
    bus.emit(EVENTS.STAGE_MODE_CHANGED, { ...this.stage });
  }

  setCameraPreset(presetId) {
    if (!CAMERA_PRESET_VIEWS[presetId]) return;
    this.stage.cameraPreset = presetId;
    appState.set(null, { cameraPreset: presetId });
    updateSettings({ stageMode: { cameraPreset: presetId } }).catch(() => {});
    bus.emit(EVENTS.CAMERA_PRESET_CHANGED, { preset: presetId, view: CAMERA_PRESET_VIEWS[presetId] });
  }
}

export const cleanStage = new CleanStageController();
