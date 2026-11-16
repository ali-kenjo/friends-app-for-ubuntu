// ---------- Mood & Time-of-Day Lighting Presets (core/world/lighting-presets.mjs) ----------
// Presets: Morning Daylight, Warm Desk Lamp, Sunset Glow, Night Cyber Studio, Neutral Broadcast
// Includes dynamic desk-lamp emission and subtle ambient tinting tied to robot emotions.
import * as THREE from "three";

export const LIGHTING_PRESETS = Object.freeze({
  morning_daylight: {
    id: "morning_daylight",
    label: "Morning Daylight",
    keyColor: "#fff8ed",
    keyIntensity: 2.35,
    keyPos: [2.8, 3.8, 2.8],
    fillColor: "#cfe6ff",
    fillIntensity: 0.95,
    rimColor: "#ffffff",
    rimIntensity: 1.05,
    ambientTint: "#e9f3ff",
    exposure: 1.08,
    lampEmission: 0.15,
    bgTint: "#1a202c",
  },
  warm_desk_lamp: {
    id: "warm_desk_lamp",
    label: "Warm Desk Lamp",
    keyColor: "#ffdcb3",
    keyIntensity: 1.85,
    keyPos: [2.1, 2.7, 2.4],
    fillColor: "#89a3cf",
    fillIntensity: 0.65,
    rimColor: "#ff9d5c",
    rimIntensity: 1.35,
    ambientTint: "#282019",
    exposure: 1.02,
    lampEmission: 1.4,
    bgTint: "#161419",
  },
  sunset_glow: {
    id: "sunset_glow",
    label: "Sunset Glow",
    keyColor: "#ff9b6a",
    keyIntensity: 2.05,
    keyPos: [3.2, 1.8, 2.1],
    fillColor: "#a78bfa",
    fillIntensity: 0.72,
    rimColor: "#ff5c8a",
    rimIntensity: 1.45,
    ambientTint: "#2d1d29",
    exposure: 1.04,
    lampEmission: 0.95,
    bgTint: "#1d1522",
  },
  night_cyber_studio: {
    id: "night_cyber_studio",
    label: "Night Cyber Studio",
    keyColor: "#7dd3fc",
    keyIntensity: 1.45,
    keyPos: [1.8, 3.0, 2.6],
    fillColor: "#c084fc",
    fillIntensity: 0.95,
    rimColor: "#22d3ee",
    rimIntensity: 1.9,
    ambientTint: "#11162b",
    exposure: 0.96,
    lampEmission: 1.85,
    bgTint: "#0b0f1b",
  },
  neutral_broadcast: {
    id: "neutral_broadcast",
    label: "Neutral Broadcast",
    keyColor: "#ffffff",
    keyIntensity: 2.2,
    keyPos: [2.2, 3.2, 3.0],
    fillColor: "#e2e8f0",
    fillIntensity: 1.05,
    rimColor: "#f8fafc",
    rimIntensity: 1.1,
    ambientTint: "#22252b",
    exposure: 1.0,
    lampEmission: 0.6,
    bgTint: "#17191e",
  },
});

export const EMOTION_AMBIENT_TINTS = Object.freeze({
  happy: "#ffd57a",
  curious: "#67e8f9",
  thinking: "#a78bfa",
  excited: "#fb7185",
  calm: "#86efac",
  playful: "#f472b6",
  proud: "#fbbf24",
  surprised: "#38bdf8",
});

export class LightingController {
  constructor() {
    this.presetId = "warm_desk_lamp";
    this.emotionTintEnabled = true;
    this.currentEmotion = "calm";
    this.lampEmissionScale = 1.0;
    this._hemi = null;
  }

  ensureHemiLight(stage) {
    if (this._hemi || !stage?.scene) return this._hemi;
    this._hemi = new THREE.HemisphereLight("#ffffff", "#222026", 0.32);
    stage.scene.add(this._hemi);
    return this._hemi;
  }

  /**
   * Apply a mood lighting preset + optional emotion ambient tint + desk lamp emissions.
   * @param {import('../../robot/scene.js').Stage} stage
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Object3D} [roomGroup]
   * @param {{ presetId?: string, emotion?: string, emotionTintEnabled?: boolean, lampEmissionScale?: number }} [opts]
   */
  apply(stage, renderer, roomGroup, opts = {}) {
    if (opts.presetId && LIGHTING_PRESETS[opts.presetId]) this.presetId = opts.presetId;
    if (opts.emotion) this.currentEmotion = opts.emotion;
    if (typeof opts.emotionTintEnabled === "boolean") this.emotionTintEnabled = opts.emotionTintEnabled;
    if (Number.isFinite(Number(opts.lampEmissionScale))) this.lampEmissionScale = Number(opts.lampEmissionScale);

    const p = LIGHTING_PRESETS[this.presetId] || LIGHTING_PRESETS.warm_desk_lamp;
    if (stage) {
      if (stage.key) {
        stage.key.color.set(p.keyColor);
        stage.key.intensity = p.keyIntensity;
        stage.key.position.set(p.keyPos[0], p.keyPos[1], p.keyPos[2]);
      }
      if (stage.fill) {
        stage.fill.color.set(p.fillColor);
        stage.fill.intensity = p.fillIntensity;
      }
      if (stage.rim) {
        stage.rim.color.set(p.rimColor);
        stage.rim.intensity = p.rimIntensity;
      }
      const hemi = this.ensureHemiLight(stage);
      if (hemi) {
        const base = new THREE.Color(p.ambientTint);
        if (this.emotionTintEnabled && EMOTION_AMBIENT_TINTS[this.currentEmotion]) {
          base.lerp(new THREE.Color(EMOTION_AMBIENT_TINTS[this.currentEmotion]), 0.22);
        }
        hemi.color.copy(base);
        hemi.intensity = 0.42;
      }
    }
    if (renderer) {
      renderer.toneMappingExposure = p.exposure;
    }

    // Drive dynamic desk-lamp emission inside the room mesh tree
    if (roomGroup) {
      const targetEmission = p.lampEmission * this.lampEmissionScale;
      roomGroup.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;
        if (obj.userData?.isLampBulb || /lamp|bulb|shade|emitter|led/i.test(obj.name || "")) {
          if (obj.material.emissiveIntensity !== undefined) {
            obj.material.emissiveIntensity = Math.max(0.05, targetEmission);
          }
        }
      });
    }
  }
}

export const lightingController = new LightingController();
