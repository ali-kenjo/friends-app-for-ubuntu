// ---------- Customizable Voice Mode Action Dock (ui/voice-dock.js) ----------
// 12 toggleable action modules, drag-and-drop ordering, icon-only vs icon+label mode,
// dock position (Bottom / Left / Right / Floating), custom keyboard shortcuts, and 3 presets
// (Minimal, Creator Stage, Full Control).
import { bus, EVENTS } from "../core/event-bus.mjs";
import { appState } from "../core/state-store.mjs";
import { updateSettings } from "../store.js";
import { unifiedRoom } from "../core/world/unified-room-manager.mjs";

export const DOCK_MODULES = [
  { id: "mic_mute", label: "Mute Mic", icon: "🎙️" },
  { id: "mic_mode", label: "VAD / PTT", icon: "🎧" },
  { id: "interrupt", label: "Stop AI", icon: "✋" },
  { id: "summon_home", label: "Go Home", icon: "🏠" },
  { id: "emotion_picker", label: "Emotion", icon: "😊" },
  { id: "toggle_whiteboard", label: "Whiteboard", icon: "📋" },
  { id: "quick_prop", label: "Props / Toys", icon: "🎲" },
  { id: "camera_preset", label: "Camera", icon: "🎥" },
  { id: "vision_toggle", label: "Vision Ctx", icon: "👁️" },
  { id: "roam_toggle", label: "Auto Roam", icon: "🧭" },
  { id: "clean_stage", label: "Clean Stage", icon: "📺" },
  { id: "open_studio", label: "Studio", icon: "⚙️" },
];

export const DOCK_PRESETS = Object.freeze({
  minimal: {
    label: "Minimal",
    showLabels: false,
    visible: {
      mic_mute: true,
      mic_mode: false,
      interrupt: true,
      summon_home: false,
      emotion_picker: false,
      toggle_whiteboard: false,
      quick_prop: false,
      camera_preset: false,
      vision_toggle: false,
      roam_toggle: false,
      clean_stage: true,
      open_studio: true,
    },
  },
  creator_stage: {
    label: "Creator Stage",
    showLabels: false,
    visible: {
      mic_mute: true,
      mic_mode: true,
      interrupt: true,
      summon_home: true,
      emotion_picker: true,
      toggle_whiteboard: true,
      quick_prop: true,
      camera_preset: true,
      vision_toggle: false,
      roam_toggle: true,
      clean_stage: true,
      open_studio: true,
    },
  },
  full_control: {
    label: "Full Control",
    showLabels: true,
    visible: Object.fromEntries(DOCK_MODULES.map((m) => [m.id, true])),
  },
});

const EMOTIONS = ["happy", "curious", "thinking", "excited", "calm", "playful"];
const CAMERA_PRESETS = [
  { id: "wide_room", label: "Wide Room" },
  { id: "desk_closeup", label: "Desk Close-Up" },
  { id: "whiteboard_focus", label: "Whiteboard Focus" },
  { id: "follow_robot", label: "Follow Robot" },
  { id: "cinema_orbit", label: "Cinema Orbit" },
];

export class VoiceDockController {
  constructor() {
    this.el = null;
    this.popover = null;
    this.config = {
      preset: "creator_stage",
      position: "bottom",
      floatingX: 24,
      floatingY: 24,
      showLabels: false,
      order: DOCK_MODULES.map((m) => m.id),
      visible: { ...DOCK_PRESETS.creator_stage.visible },
      shortcuts: {
        mic_mute: "KeyM",
        interrupt: "",
        summon_home: "KeyR",
        clean_stage: "KeyH",
        toggle_whiteboard: "KeyB",
        roam_toggle: "KeyP",
      },
    };
    this._onKeyDown = (e) => this.handleShortcut(e);
  }

  mount(parent = document.body) {
    if (this.el) return;
    this.el = document.createElement("div");
    this.el.id = "v1-voice-dock";
    this.el.className = "v1-voice-dock pos-bottom";
    this.el.setAttribute("role", "toolbar");
    this.el.setAttribute("aria-label", "Voice Mode Action Dock");
    this.el.setAttribute("data-no-i18n", "");

    this.popover = document.createElement("div");
    this.popover.className = "v1-dock-popover hidden";
    this.popover.setAttribute("data-no-i18n", "");
    parent.appendChild(this.el);
    parent.appendChild(this.popover);

    window.addEventListener("keydown", this._onKeyDown);
    document.addEventListener("click", (e) => {
      if (!this.popover.contains(e.target) && !this.el.contains(e.target)) {
        this.popover.classList.add("hidden");
      }
    });

    this.enableFloatingDrag();
    this.render();
  }

  configure(cfg = {}) {
    if (!cfg || typeof cfg !== "object") return;
    this.config = {
      ...this.config,
      ...cfg,
      visible: { ...this.config.visible, ...(cfg.visible || {}) },
      shortcuts: { ...this.config.shortcuts, ...(cfg.shortcuts || {}) },
      order: Array.isArray(cfg.order) && cfg.order.length ? cfg.order : this.config.order,
    };
    this.render();
  }

  applyPreset(presetId) {
    const p = DOCK_PRESETS[presetId];
    if (!p) return;
    this.config.preset = presetId;
    this.config.showLabels = p.showLabels;
    this.config.visible = { ...p.visible };
    this.persist();
    this.render();
  }

  persist() {
    updateSettings({ voiceDock: { ...this.config } }).catch(() => {});
    bus.emit(EVENTS.DOCK_LAYOUT_CHANGED, this.config);
  }

  enableFloatingDrag() {
    let dragStart = null;
    this.el.addEventListener("pointerdown", (e) => {
      if (this.config.position !== "floating" || e.target.closest("button")) return;
      dragStart = {
        x: e.clientX - (this.config.floatingX || 24),
        y: e.clientY - (this.config.floatingY || 24),
      };
    });
    window.addEventListener("pointermove", (e) => {
      if (!dragStart) return;
      this.config.floatingX = Math.max(8, Math.min(window.innerWidth - 120, e.clientX - dragStart.x));
      this.config.floatingY = Math.max(8, Math.min(window.innerHeight - 80, e.clientY - dragStart.y));
      this.el.style.left = `${this.config.floatingX}px`;
      this.el.style.top = `${this.config.floatingY}px`;
    });
    window.addEventListener("pointerup", () => {
      if (!dragStart) return;
      dragStart = null;
      this.persist();
    });
  }

  setVisible(inVoiceView) {
    if (!this.el) return;
    this.el.style.display = inVoiceView ? "flex" : "none";
    if (!inVoiceView) this.popover?.classList.add("hidden");
  }

  render() {
    if (!this.el) return;
    this.el.className = `v1-voice-dock pos-${this.config.position} ${this.config.showLabels ? "with-labels" : "icons-only"}`;
    if (this.config.position === "floating") {
      this.el.style.left = `${this.config.floatingX || 24}px`;
      this.el.style.top = `${this.config.floatingY || 24}px`;
      this.el.style.bottom = "auto";
      this.el.style.right = "auto";
      this.el.style.transform = "none";
    } else {
      this.el.style.left = "";
      this.el.style.top = "";
      this.el.style.bottom = "";
      this.el.style.right = "";
      this.el.style.transform = "";
    }

    const modMap = new Map(DOCK_MODULES.map((m) => [m.id, m]));
    const ordered = this.config.order.map((id) => modMap.get(id)).filter(Boolean);
    for (const m of DOCK_MODULES) {
      if (!ordered.find((o) => o.id === m.id)) ordered.push(m);
    }

    const v = appState.get("voice") || {};
    const b = appState.get("behavior") || {};
    this.el.innerHTML = "";

    for (const mod of ordered) {
      if (this.config.visible[mod.id] === false) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "v1-dock-btn";
      btn.dataset.module = mod.id;
      btn.draggable = true;

      let active = false;
      let label = mod.label;
      let icon = mod.icon;
      if (mod.id === "mic_mute") {
        active = Boolean(v.muted);
        icon = v.muted ? "🔇" : "🎙️";
        label = v.muted ? "Unmute" : "Mute";
      } else if (mod.id === "mic_mode") {
        active = v.micMode === "ptt";
        label = v.micMode === "ptt" ? "Push-to-Talk" : "Auto VAD";
      } else if (mod.id === "vision_toggle") {
        active = Boolean(v.visionContext);
      } else if (mod.id === "roam_toggle") {
        active = b.autonomousRoaming !== false;
        icon = active ? "⏸️" : "▶️";
        label = active ? "Roam On" : "Roam Paused";
      } else if (mod.id === "clean_stage") {
        active = Boolean(appState.get("cleanStage"));
      } else if (mod.id === "open_studio") {
        active = Boolean(appState.get("studioOpen"));
      }

      if (active) btn.classList.add("is-active");
      const shortcut = this.config.shortcuts?.[mod.id];
      btn.title = shortcut ? `${label} (${shortcut.replace("Key", "")})` : label;
      btn.innerHTML = `<span class="v1-dock-ico">${icon}</span><span class="v1-dock-lbl">${label}</span>`;

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.triggerAction(mod.id, btn);
      });

      // Drag-and-drop reorder directly on the dock
      btn.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData("text/plain", mod.id);
      });
      btn.addEventListener("dragover", (e) => e.preventDefault());
      btn.addEventListener("drop", (e) => {
        e.preventDefault();
        const dragged = e.dataTransfer?.getData("text/plain");
        if (!dragged || dragged === mod.id) return;
        const arr = [...this.config.order];
        const fromIdx = arr.indexOf(dragged);
        const toIdx = arr.indexOf(mod.id);
        if (fromIdx < 0 || toIdx < 0) return;
        arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, dragged);
        this.config.order = arr;
        this.config.preset = "custom";
        this.persist();
        this.render();
      });

      this.el.appendChild(btn);
    }
  }

  triggerAction(moduleId, anchorEl = null) {
    if (moduleId === "emotion_picker" && anchorEl) {
      this.openPopover(anchorEl, EMOTIONS.map((em) => ({
        label: em.charAt(0).toUpperCase() + em.slice(1),
        onClick: () => bus.emit(EVENTS.DOCK_ACTION, { action: "set_emotion", emotion: em }),
      })));
      return;
    }
    if (moduleId === "camera_preset" && anchorEl) {
      this.openPopover(anchorEl, CAMERA_PRESETS.map((cp) => ({
        label: cp.label,
        onClick: () => bus.emit(EVENTS.DOCK_ACTION, { action: "camera_preset", preset: cp.id }),
      })));
      return;
    }
    if (moduleId === "quick_prop" && anchorEl) {
      const assets = (appState.get("roomAssets") || []).filter((a) => a.visible !== false);
      const items = assets.map((a) => ({
        label: a.name || a.id,
        onClick: () => unifiedRoom.triggerAssetAction(a.id, a.kind === "vase_flowers" ? "water" : "play"),
      }));
      this.openPopover(anchorEl, items.length ? items : [{ label: "No active props", onClick: () => {} }]);
      return;
    }
    bus.emit(EVENTS.DOCK_ACTION, { action: moduleId });
  }

  openPopover(anchorEl, items) {
    if (!this.popover) return;
    this.popover.innerHTML = "";
    for (const item of items) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = item.label;
      b.addEventListener("click", () => {
        item.onClick();
        this.popover.classList.add("hidden");
      });
      this.popover.appendChild(b);
    }
    const r = anchorEl.getBoundingClientRect();
    this.popover.style.left = `${Math.max(12, Math.min(window.innerWidth - 210, r.left))}px`;
    this.popover.style.top = `${Math.max(12, r.top - Math.min(260, items.length * 36 + 16))}px`;
    this.popover.classList.remove("hidden");
  }

  handleShortcut(e) {
    const tag = e.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
    if (e.code === "F11") {
      e.preventDefault();
      this.triggerAction("clean_stage");
      return;
    }
    const voiceModeEl = document.getElementById("voice-mode");
    const voiceOpen = voiceModeEl ? !voiceModeEl.hidden : false;
    for (const [modId, code] of Object.entries(this.config.shortcuts || {})) {
      if (!code || e.code !== code) continue;
      if (modId !== "clean_stage" && !voiceOpen) continue;
      e.preventDefault();
      this.triggerAction(modId);
      return;
    }
  }
}

export const voiceDock = new VoiceDockController();
