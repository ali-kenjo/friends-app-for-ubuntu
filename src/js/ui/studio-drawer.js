// ---------- Collapsible Studio Workspace Drawer (ui/studio-drawer.js) ----------
// Unified tabbed studio hosting:
//   - Room Editor (3D gizmos, spawn, .glb override, NavMesh, presets)
//   - Behavior Engine (5 sub-tabs)
//   - Voice Dock Manager (12 module toggles, presets, position, shortcuts)
//   - Visual & Lighting (4 Shader Styles, 5 Mood Lighting presets, OBS Backdrops, Quality)
//   - AI & Provider (Gemini Live + Extended Thinking toggle, OpenAI Realtime, Local Pipeline,
//                    Text Sandbox runner, 0600 Keys, and Full Studio Bundle Export/Import)
import { appState } from "../core/state-store.mjs";
import { bus, EVENTS } from "../core/event-bus.mjs";
import { getSettings, updateSettings } from "../store.js";
import { renderRoomEditorTab } from "./room-editor.js";
import { renderBehaviorStudioTab } from "./behavior-studio.js";
import { DOCK_MODULES, DOCK_PRESETS, voiceDock } from "./voice-dock.js";
import { CAMERA_PRESET_VIEWS, cleanStage } from "./clean-stage.js";
import { LIGHTING_PRESETS } from "../core/world/lighting-presets.mjs";
import { roomGizmos } from "../core/world/gizmos.mjs";
import { unifiedRoom } from "../core/world/unified-room-manager.mjs";
import { behaviorEngine } from "../core/robot/behavior-engine.mjs";
import { downloadStudioBundle, importStudioBundleFile } from "../storage/bundle-client.mjs";

const TABS = [
  { id: "room_editor", label: "Room" },
  { id: "behavior_engine", label: "Behavior" },
  { id: "voice_dock", label: "Dock" },
  { id: "visual_lighting", label: "Visual" },
  { id: "ai_provider", label: "AI & Data" },
];

export class StudioDrawer {
  constructor() {
    this.el = null;
    this.cleanupTab = null;
  }

  mount(parent = document.body) {
    if (this.el) return;
    this.el = document.createElement("aside");
    this.el.id = "v1-studio-drawer";
    this.el.className = "v1-studio-drawer hidden";
    this.el.setAttribute("aria-label", "3D Robot Studio Drawer");
    parent.appendChild(this.el);

    bus.on(EVENTS.DOCK_ACTION, ({ action, forceOpen }) => {
      if (action === "open_studio") {
        this.toggle(typeof forceOpen === "boolean" ? forceOpen : undefined);
      }
    });
  }

  toggle(force) {
    const next = typeof force === "boolean" ? force : !appState.get("studioOpen");
    appState.set(null, { studioOpen: next });
    this.el?.classList.toggle("hidden", !next);
    const activeTab = appState.get("studioTab") || "room_editor";
    roomGizmos.setActive(next && activeTab === "room_editor");
    if (next) this.render();
    else {
      this.cleanupTab?.();
      this.cleanupTab = null;
    }
    voiceDock.render();
  }

  render() {
    if (!this.el || !appState.get("studioOpen")) return;
    this.cleanupTab?.();
    this.cleanupTab = null;

    const tab = appState.get("studioTab") || "room_editor";
    roomGizmos.setActive(tab === "room_editor");

    this.el.innerHTML = `
      <div class="v1-drawer-head">
        <strong>Friends 3D Studio v1.0</strong>
        <button type="button" class="v1-pill-btn" data-close-drawer>Close</button>
      </div>
      <div class="v1-drawer-tabs">
        ${TABS.map(
          (t) => `<button type="button" class="${tab === t.id ? "active" : ""}" data-tab="${t.id}">${t.label}</button>`
        ).join("")}
      </div>
      <div class="v1-drawer-body"></div>
    `;

    this.el.querySelector("[data-close-drawer]")?.addEventListener("click", () => this.toggle(false));
    this.el.querySelectorAll("[data-tab]").forEach((btn) =>
      btn.addEventListener("click", () => {
        appState.set(null, { studioTab: btn.dataset.tab });
        this.render();
      })
    );

    const body = this.el.querySelector(".v1-drawer-body");
    if (tab === "room_editor") {
      this.cleanupTab = renderRoomEditorTab(body);
    } else if (tab === "behavior_engine") {
      this.cleanupTab = renderBehaviorStudioTab(body);
    } else if (tab === "voice_dock") {
      this.renderVoiceDockTab(body);
    } else if (tab === "visual_lighting") {
      this.renderVisualTab(body);
    } else if (tab === "ai_provider") {
      this.renderAiTab(body);
    }
  }

  renderVoiceDockTab(body) {
    const cfg = voiceDock.config;
    body.innerHTML = `
      <div class="v1-sec">
        <h4>Toolbar Presets</h4>
        <div class="v1-btn-row">
          ${Object.entries(DOCK_PRESETS)
            .map(([id, p]) => `<button type="button" class="v1-pill-btn ${cfg.preset === id ? "active" : ""}" data-dp="${id}">${p.label}</button>`)
            .join("")}
        </div>
      </div>
      <div class="v1-sec">
        <h4>Position &amp; Display</h4>
        <div class="v1-num-grid">
          <label>Dock Side
            <select data-dpos>
              <option value="bottom" ${cfg.position === "bottom" ? "selected" : ""}>Bottom</option>
              <option value="left" ${cfg.position === "left" ? "selected" : ""}>Left</option>
              <option value="right" ${cfg.position === "right" ? "selected" : ""}>Right</option>
              <option value="floating" ${cfg.position === "floating" ? "selected" : ""}>Floating (Draggable)</option>
            </select>
          </label>
          <label class="v1-toggle"><input type="checkbox" data-dlbl ${cfg.showLabels ? "checked" : ""}> Show Labels</label>
        </div>
      </div>
      <div class="v1-sec">
        <h4>Visible Action Modules &amp; Shortcuts</h4>
        ${DOCK_MODULES.map(
          (m) => `
          <div class="v1-wp-row">
            <label><input type="checkbox" data-dmod="${m.id}" ${cfg.visible[m.id] !== false ? "checked" : ""}> ${m.icon} ${m.label}</label>
            <input type="text" class="v1-sc-input" data-dsc="${m.id}" placeholder="Key" value="${cfg.shortcuts?.[m.id] || ""}">
          </div>`
        ).join("")}
      </div>
    `;

    body.querySelectorAll("[data-dp]").forEach((b) =>
      b.addEventListener("click", () => {
        voiceDock.applyPreset(b.dataset.dp);
        this.renderVoiceDockTab(body);
      })
    );
    body.querySelector("[data-dpos]")?.addEventListener("change", (e) => {
      voiceDock.configure({ position: e.target.value });
      voiceDock.persist();
    });
    body.querySelector("[data-dlbl]")?.addEventListener("change", (e) => {
      voiceDock.configure({ showLabels: e.target.checked, preset: "custom" });
      voiceDock.persist();
    });
    body.querySelectorAll("[data-dmod]").forEach((cb) =>
      cb.addEventListener("change", () => {
        voiceDock.config.visible[cb.dataset.dmod] = cb.checked;
        voiceDock.config.preset = "custom";
        voiceDock.persist();
        voiceDock.render();
      })
    );
    body.querySelectorAll("[data-dsc]").forEach((inp) =>
      inp.addEventListener("change", () => {
        voiceDock.config.shortcuts[inp.dataset.dsc] = inp.value.trim();
        voiceDock.persist();
        voiceDock.render();
      })
    );
  }

  renderVisualTab(body) {
    const vs = getSettings()?.visualStyle || {};
    const sm = getSettings()?.stageMode || {};
    const theme = vs.shaderTheme || appState.get("shaderStyle") || "cozy_stylized";
    const light = vs.lightingPreset || appState.get("lightingPreset") || "warm_desk_lamp";
    const backdrop = sm.backdrop || appState.get("stageBackdrop") || "full_room";

    body.innerHTML = `
      <div class="v1-sec">
        <h4>4-Style Hot-Swappable Shader Pipeline</h4>
        <div class="v1-btn-row">
          ${[
            ["cozy_stylized", "Cozy Stylized (Default)"],
            ["realistic_pbr", "Realistic PBR"],
            ["anime_cel", "Anime Cel-Shaded"],
            ["minimalist_studio", "Minimalist Studio"],
          ]
            .map(([id, lbl]) => `<button type="button" class="v1-pill-btn ${theme === id ? "active" : ""}" data-shader="${id}">${lbl}</button>`)
            .join("")}
        </div>
      </div>
      <div class="v1-sec">
        <h4>Mood &amp; Time-of-Day Lighting</h4>
        <div class="v1-btn-row">
          ${Object.values(LIGHTING_PRESETS)
            .map((p) => `<button type="button" class="v1-pill-btn ${light === p.id ? "active" : ""}" data-light="${p.id}">${p.label}</button>`)
            .join("")}
        </div>
        <label class="v1-toggle"><input type="checkbox" data-etint ${vs.emotionLightingTint !== false ? "checked" : ""}> Ambient Emotion Tinting</label>
        <label class="v1-slider-row"><span>Desk Lamp Glow</span><input type="range" min="0" max="2.5" step="0.1" data-lamp-em value="${vs.deskLampEmission ?? 1}"><b>${vs.deskLampEmission ?? 1}x</b></label>
      </div>
      <div class="v1-sec">
        <h4>Clean Stage &amp; OBS Backdrops</h4>
        <div class="v1-num-grid">
          <label>Backdrop
            <select data-backdrop>
              <option value="full_room" ${backdrop === "full_room" ? "selected" : ""}>Full 3D Room</option>
              <option value="solid_studio" ${backdrop === "solid_studio" ? "selected" : ""}>Solid Studio Backdrop</option>
              <option value="chroma_green" ${backdrop === "chroma_green" ? "selected" : ""}>Chroma-Key Green</option>
              <option value="chroma_blue" ${backdrop === "chroma_blue" ? "selected" : ""}>Chroma-Key Blue</option>
              <option value="transparent_window" ${backdrop === "transparent_window" ? "selected" : ""}>Transparent Window</option>
            </select>
          </label>
          <label>Camera Angle
            <select data-cam>
              ${Object.entries(CAMERA_PRESET_VIEWS)
                .map(([id, v]) => `<option value="${id}" ${(sm.cameraPreset || "wide_room") === id ? "selected" : ""}>${v.label}</option>`)
                .join("")}
            </select>
          </label>
        </div>
        <button type="button" class="v1-pill-btn" data-enter-clean>Enter Clean Stage Mode (H / F11)</button>
      </div>
      <div class="v1-sec">
        <h4>GPU &amp; Rendering Performance</h4>
        <div class="v1-num-grid">
          <label>Shadows
            <select data-shadowq>
              <option value="high" ${vs.shadowQuality === "high" ? "selected" : ""}>High (2048px)</option>
              <option value="medium" ${vs.shadowQuality === "medium" ? "selected" : ""}>Medium (1024px)</option>
              <option value="off" ${vs.shadowQuality === "off" ? "selected" : ""}>Off</option>
            </select>
          </label>
          <label class="v1-toggle"><input type="checkbox" data-throttle ${vs.throttleWhenHidden !== false ? "checked" : ""}> Throttle FPS when minimized</label>
        </div>
      </div>
    `;

    body.querySelectorAll("[data-shader]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const val = btn.dataset.shader;
        appState.set(null, { shaderStyle: val });
        unifiedRoom.setVisualTheme(val);
        updateSettings({ visualStyle: { shaderTheme: val } }).catch(() => {});
        bus.emit(EVENTS.SHADER_CHANGED, { shaderTheme: val });
        this.renderVisualTab(body);
      })
    );
    body.querySelectorAll("[data-light]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const val = btn.dataset.light;
        appState.set(null, { lightingPreset: val });
        updateSettings({ visualStyle: { lightingPreset: val } }).catch(() => {});
        bus.emit(EVENTS.LIGHTING_CHANGED, { presetId: val });
        this.renderVisualTab(body);
      })
    );
    body.querySelector("[data-etint]")?.addEventListener("change", (e) => {
      updateSettings({ visualStyle: { emotionLightingTint: e.target.checked } }).catch(() => {});
      bus.emit(EVENTS.LIGHTING_CHANGED, { emotionTintEnabled: e.target.checked });
    });
    body.querySelector("[data-lamp-em]")?.addEventListener("input", (e) => {
      const val = Number(e.target.value);
      e.target.nextElementSibling.textContent = `${val}x`;
      updateSettings({ visualStyle: { deskLampEmission: val } }).catch(() => {});
      bus.emit(EVENTS.LIGHTING_CHANGED, { lampEmissionScale: val });
    });
    body.querySelector("[data-backdrop]")?.addEventListener("change", (e) => {
      cleanStage.setBackdrop(e.target.value);
    });
    body.querySelector("[data-cam]")?.addEventListener("change", (e) => {
      cleanStage.setCameraPreset(e.target.value);
    });
    body.querySelector("[data-enter-clean]")?.addEventListener("click", () => {
      this.toggle(false);
      cleanStage.toggleCleanStage(true);
    });
    body.querySelector("[data-shadowq]")?.addEventListener("change", (e) => {
      updateSettings({ visualStyle: { shadowQuality: e.target.value } }).catch(() => {});
    });
    body.querySelector("[data-throttle]")?.addEventListener("change", (e) => {
      updateSettings({ visualStyle: { throttleWhenHidden: e.target.checked } }).catch(() => {});
    });
  }

  renderAiTab(body) {
    const av = getSettings()?.aiVoice || {};
    body.innerHTML = `
      <div class="v1-sec">
        <h4>Voice &amp; AI Provider Adapter</h4>
        <div class="v1-num-grid">
          <label>Active Provider
            <select data-av="provider">
              <option value="gemini-live" ${av.provider === "gemini-live" ? "selected" : ""}>Gemini Live API</option>
              <option value="openai-realtime" ${av.provider === "openai-realtime" ? "selected" : ""}>OpenAI Realtime API</option>
              <option value="local-pipeline" ${av.provider === "local-pipeline" ? "selected" : ""}>Local Pipeline (Ollama/Whisper/Piper)</option>
              <option value="text-sandbox" ${av.provider === "text-sandbox" ? "selected" : ""}>Text / Silent Sandbox (Zero Key)</option>
            </select>
          </label>
          <label class="v1-toggle"><input type="checkbox" data-av-chk="extendedThinking" ${av.extendedThinking ? "checked" : ""}> Gemini Extended Thinking (3.8-live)</label>
          <label>Gemini Key (stored 0600) <input type="password" data-av-inp="geminiKey" placeholder="${av.hasGeminiKey ? "Saved safely (••••)" : "Paste key"}"></label>
          <label>OpenAI Key (stored 0600) <input type="password" data-av-inp="openaiKey" placeholder="${av.hasOpenaiKey ? "Saved safely (••••)" : "Paste key"}"></label>
          <label>Local LLM Endpoint <input type="text" data-av-inp="localLlmUrl" value="${av.localLlmUrl || "http://127.0.0.1:11434/v1/chat/completions"}"></label>
          <label>Local Model ID <input type="text" data-av-inp="localLlmModel" value="${av.localLlmModel || "llama3.2"}"></label>
          <label>VAD Threshold <input type="number" step="0.005" min="0.005" max="0.4" data-av-num="vadThreshold" value="${av.vadThreshold || 0.035}"></label>
        </div>
        <label>Custom Robot Personality Prompt
          <textarea rows="3" data-av-inp="systemPersona" placeholder="Optional custom persona instructions...">${av.systemPersona || ""}</textarea>
        </label>
        <button type="button" class="v1-pill-btn" data-detect-local>Auto-Detect Ollama / Local Servers</button>
        <div class="v1-muted" id="v1-local-detect-out"></div>
      </div>

      <div class="v1-sec">
        <h4>Text / Silent Sandbox Quick Tester</h4>
        <div class="v1-btn-row">
          <input type="text" class="v1-sandbox-input" placeholder="e.g. 'explain A* pathfinding on the whiteboard' or 'play with rubiks cube'">
          <button type="button" class="v1-pill-btn active" data-sandbox-send>Send</button>
        </div>
        <div class="v1-muted" data-sandbox-log></div>
      </div>

      <div class="v1-sec">
        <h4>Full Studio Bundle Backup &amp; Share</h4>
        <div class="v1-btn-row">
          <button type="button" class="v1-pill-btn" data-exp="zip">Export Bundle (.ZIP)</button>
          <button type="button" class="v1-pill-btn" data-exp="json">Export Bundle (.JSON)</button>
          <label class="v1-pill-btn v1-file-btn">Import Studio Bundle<input type="file" accept=".zip,.json" data-imp-bundle hidden></label>
        </div>
      </div>
    `;

    body.querySelector("[data-av='provider']")?.addEventListener("change", (e) => {
      updateSettings({ aiVoice: { provider: e.target.value } }).catch(() => {});
    });
    body.querySelector("[data-av-chk='extendedThinking']")?.addEventListener("change", (e) => {
      updateSettings({
        aiVoice: {
          extendedThinking: e.target.checked,
          geminiModel: e.target.checked ? "gemini-3.8-live-extended-thinking" : "gemini-3.8-live",
        },
      }).catch(() => {});
    });
    body.querySelectorAll("[data-av-inp]").forEach((inp) =>
      inp.addEventListener("change", () => {
        updateSettings({ aiVoice: { [inp.dataset.avInp]: inp.value } }).catch(() => {});
      })
    );
    body.querySelector("[data-av-num='vadThreshold']")?.addEventListener("change", (e) => {
      updateSettings({ aiVoice: { vadThreshold: Number(e.target.value) || 0.035 } }).catch(() => {});
    });

    body.querySelector("[data-detect-local]")?.addEventListener("click", async () => {
      const out = body.querySelector("#v1-local-detect-out");
      out.textContent = "Probing localhost Ollama / LM Studio / vLLM / Whisper...";
      try {
        const res = await fetch("/api/studio/ollama/detect");
        const data = await res.json();
        const found = data.endpoints || [];
        out.textContent = found.length
          ? `Found: ${found.map((f) => `${f.name} (${f.endpoint}${f.models?.length ? `: ${f.models.slice(0, 3).join(", ")}` : ""})`).join(" | ")}`
          : "No local AI server detected on default ports yet.";
      } catch {
        out.textContent = "Could not probe local endpoints.";
      }
    });

    body.querySelector("[data-sandbox-send]")?.addEventListener("click", async () => {
      const inp = body.querySelector(".v1-sandbox-input");
      const log = body.querySelector("[data-sandbox-log]");
      const text = inp?.value?.trim();
      if (!text) return;
      log.textContent = "Running sandbox turn...";
      try {
        const res = await fetch("/api/studio/voice/sandbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = await res.json();
        log.textContent = data.reply || "";
        for (const ev of data.robotEvents || []) {
          if (ev.choreography) behaviorEngine.handleChoreographyTool(ev.choreography, appState.get("roomAssets") || []);
        }
      } catch (err) {
        log.textContent = err.message;
      }
    });

    body.querySelectorAll("[data-exp]").forEach((btn) =>
      btn.addEventListener("click", () => downloadStudioBundle(btn.dataset.exp))
    );
    body.querySelector("[data-imp-bundle]")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await importStudioBundleFile(file);
        location.reload();
      } catch (err) {
        alert(err.message);
      }
    });
  }
}

export const studioDrawer = new StudioDrawer();
