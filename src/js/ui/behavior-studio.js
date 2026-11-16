// ---------- 5-Tab Behavior, IK & Choreography Studio UI (ui/behavior-studio.js) ----------
// Tabs:
//   1. Spatial & Routes (Home Spot, NavMesh debug, Custom Waypoint Route Builder)
//   2. Quotas & Cooldowns (Session/Hour/Per-Asset limits, cooldowns, Roaming/Focus Lock)
//   3. Weights & Emotion (0-100% per asset, category multipliers, emotion modifier matrix)
//   4. AI Triggers & Interrupts (9 AI tool permission toggles + 4 Speech Interrupt Policies)
//   5. Dwell, Kinematics & Audio (Min/Max Dwell sliders, speed/turn/easing/gaze/idle, Foley volume)
import { appState } from "../core/state-store.mjs";
import { bus } from "../core/event-bus.mjs";
import { behaviorEngine, EMOTION_WEIGHT_MODIFIERS } from "../core/robot/behavior-engine.mjs";
import { unifiedRoom } from "../core/world/unified-room-manager.mjs";
import { navMesh } from "../core/robot/pathfinding.mjs";
import { getSettings, updateSettings } from "../store.js";

const AI_TOOL_NAMES = [
  "move_to_asset",
  "explain_on_whiteboard",
  "clear_whiteboard",
  "write_in_notebook",
  "play_with_toy",
  "water_flowers",
  "set_emotion",
  "follow_route",
  "return_home",
];

const INTERRUPT_POLICIES = [
  { id: "immediate_return", label: "Immediate Stop & Return Home" },
  { id: "finish_briefly", label: "Finish Step Briefly (~1s) & Listen" },
  { id: "pause_and_resume", label: "Pause & Resume After Speech" },
  { id: "finish_before_listening", label: "Finish Action Before Listening" },
];

export function renderBehaviorStudioTab(container) {
  if (!container) return;
  let activeSubTab = "spatial";

  const commit = (nextCfg) => {
    behaviorEngine.configure(nextCfg);
    unifiedRoom.setFoleyVolume(nextCfg.foley?.volume ?? 65);
    appState.set("roomMeta", { homeSpot: { ...nextCfg.homeSpot } });
    unifiedRoom.rebuildDebugOverlays(navMesh, nextCfg.waypointRoute);
    updateSettings({ behaviorEngine: nextCfg }).catch(() => {});
  };

  const render = () => {
    const s = getSettings()?.behaviorEngine || behaviorEngine.defaultConfig();
    const cfg = JSON.parse(JSON.stringify({ ...behaviorEngine.defaultConfig(), ...s }));
    const assets = appState.get("roomAssets") || [];
    const runtime = appState.get("behavior") || {};

    container.innerHTML = `
      <div class="v1-subtabs">
        <button type="button" class="${activeSubTab === "spatial" ? "active" : ""}" data-sub="spatial">1. Spatial &amp; Routes</button>
        <button type="button" class="${activeSubTab === "quotas" ? "active" : ""}" data-sub="quotas">2. Quotas</button>
        <button type="button" class="${activeSubTab === "weights" ? "active" : ""}" data-sub="weights">3. Weights</button>
        <button type="button" class="${activeSubTab === "triggers" ? "active" : ""}" data-sub="triggers">4. AI &amp; Interrupts</button>
        <button type="button" class="${activeSubTab === "kinematics" ? "active" : ""}" data-sub="kinematics">5. Dwell &amp; IK</button>
      </div>
      <div class="v1-subtab-body"></div>
    `;

    container.querySelectorAll("[data-sub]").forEach((b) =>
      b.addEventListener("click", () => {
        activeSubTab = b.dataset.sub;
        render();
      })
    );

    const body = container.querySelector(".v1-subtab-body");
    if (activeSubTab === "spatial") {
      body.innerHTML = `
        <div class="v1-status-bar">State: <b>${runtime.state || "IDLE_HOME"}</b> · Emotion: <b>${runtime.emotion || "calm"}</b></div>
        <div class="v1-sec">
          <h4>Home Standing Spot</h4>
          <div class="v1-num-grid">
            <label>Home X <input type="number" step="0.05" data-home="x" value="${cfg.homeSpot.x}"></label>
            <label>Home Z <input type="number" step="0.05" data-home="z" value="${cfg.homeSpot.z}"></label>
            <label>Facing Yaw <input type="number" step="0.1" data-home="rotY" value="${cfg.homeSpot.rotY}"></label>
          </div>
        </div>
        <div class="v1-sec">
          <h4>Custom Waypoint Route Builder</h4>
          <div class="v1-num-grid">
            <label>Order
              <select data-route="mode">
                <option value="loop" ${cfg.waypointRoute.mode === "loop" ? "selected" : ""}>Loop</option>
                <option value="ping_pong" ${cfg.waypointRoute.mode === "ping_pong" ? "selected" : ""}>Ping-Pong</option>
                <option value="random" ${cfg.waypointRoute.mode === "random" ? "selected" : ""}>Random Node</option>
              </select>
            </label>
            <label>Gait
              <select data-route="gait">
                <option value="walk" ${cfg.waypointRoute.gait === "walk" ? "selected" : ""}>Walk</option>
                <option value="hover" ${cfg.waypointRoute.gait === "hover" ? "selected" : ""}>Hover</option>
                <option value="brisk" ${cfg.waypointRoute.gait === "brisk" ? "selected" : ""}>Brisk</option>
                <option value="playful" ${cfg.waypointRoute.gait === "playful" ? "selected" : ""}>Playful</option>
              </select>
            </label>
          </div>
          <label class="v1-toggle"><input type="checkbox" data-wp-edit ${appState.get("waypointEditMode") ? "checked" : ""}> Click 3D Floor to Append Waypoint</label>
          <div class="v1-wp-list">
            ${(cfg.waypointRoute.nodes || [])
              .map(
                (n, i) => `
              <div class="v1-wp-row">
                <span>#${i + 1} (${Number(n.x).toFixed(2)}, ${Number(n.z).toFixed(2)})</span>
                <label>Dwell <input type="number" min="1" max="30" step="1" data-wp-dwell="${i}" value="${n.dwellSec || 3}">s</label>
                <button type="button" class="v1-pill-btn danger" data-wp-del="${i}">×</button>
              </div>`
              )
              .join("")}
          </div>
          <button type="button" class="v1-pill-btn" data-test-route>Test Follow Route Now</button>
        </div>
      `;

      body.querySelectorAll("[data-home]").forEach((inp) =>
        inp.addEventListener("change", () => {
          cfg.homeSpot[inp.dataset.home] = Number(inp.value) || 0;
          commit(cfg);
        })
      );
      body.querySelectorAll("[data-route]").forEach((sel) =>
        sel.addEventListener("change", () => {
          cfg.waypointRoute[sel.dataset.route] = sel.value;
          commit(cfg);
        })
      );
      body.querySelector("[data-wp-edit]")?.addEventListener("change", (e) => {
        appState.set(null, { waypointEditMode: e.target.checked });
      });
      body.querySelectorAll("[data-wp-dwell]").forEach((inp) =>
        inp.addEventListener("change", () => {
          const i = Number(inp.dataset.wpDwell);
          cfg.waypointRoute.nodes[i].dwellSec = Math.max(1, Number(inp.value) || 3);
          commit(cfg);
        })
      );
      body.querySelectorAll("[data-wp-del]").forEach((btn) =>
        btn.addEventListener("click", () => {
          cfg.waypointRoute.nodes.splice(Number(btn.dataset.wpDel), 1);
          commit(cfg);
          render();
        })
      );
      body.querySelector("[data-test-route]")?.addEventListener("click", () => {
        behaviorEngine.handleChoreographyTool({ tool: "follow_route", args: {} }, assets);
      });
    } else if (activeSubTab === "quotas") {
      body.innerHTML = `
        <div class="v1-sec">
          <h4>Autonomy &amp; Focus Lock</h4>
          <label class="v1-toggle"><input type="checkbox" data-be="autonomousRoaming" ${cfg.autonomousRoaming ? "checked" : ""}> Enable Autonomous Roaming</label>
          <label class="v1-toggle"><input type="checkbox" data-be="focusLock" ${cfg.focusLock ? "checked" : ""}> Focus Lock (Keep Robot Near User)</label>
          <div class="v1-num-grid">
            <label>Session Cap <input type="number" min="1" max="500" data-q="maxPerSession" value="${cfg.quotas.maxPerSession}"></label>
            <label>Hourly Cap <input type="number" min="1" max="200" data-q="maxPerHour" value="${cfg.quotas.maxPerHour}"></label>
            <label>Per-Asset / Hr <input type="number" min="1" max="60" data-q="perAssetPerHour" value="${cfg.quotas.perAssetPerHour}"></label>
            <label>Global Cooldown (s) <input type="number" min="1" max="300" data-q="globalCooldownSec" value="${cfg.quotas.globalCooldownSec}"></label>
            <label>Asset Cooldown (s) <input type="number" min="1" max="600" data-q="perAssetCooldownSec" value="${cfg.quotas.perAssetCooldownSec}"></label>
            <label>Return Delay (s) <input type="number" min="1" max="120" data-be-num="homeReturnDelaySec" value="${cfg.homeReturnDelaySec}"></label>
          </div>
        </div>
      `;
      body.querySelectorAll("[data-be]").forEach((cb) =>
        cb.addEventListener("change", () => {
          cfg[cb.dataset.be] = cb.checked;
          commit(cfg);
        })
      );
      body.querySelectorAll("[data-q]").forEach((inp) =>
        inp.addEventListener("change", () => {
          cfg.quotas[inp.dataset.q] = Math.max(1, Number(inp.value) || 1);
          commit(cfg);
        })
      );
      body.querySelector("[data-be-num]")?.addEventListener("change", (e) => {
        cfg.homeReturnDelaySec = Math.max(1, Number(e.target.value) || 8);
        commit(cfg);
      });
    } else if (activeSubTab === "weights") {
      body.innerHTML = `
        <div class="v1-sec">
          <h4>Category Multipliers</h4>
          <div class="v1-num-grid">
            ${["furniture", "desk_prop", "toy", "flower"]
              .map(
                (cat) => `<label>${cat} <input type="number" step="0.1" min="0" max="3" data-cat="${cat}" value="${cfg.categoryMultipliers[cat] ?? 1}"></label>`
              )
              .join("")}
          </div>
        </div>
        <div class="v1-sec">
          <h4>Per-Asset Probability Weights (0-100%)</h4>
          ${assets
            .map((a) => {
              const w = cfg.assetWeights[a.id] ?? 50;
              return `<label class="v1-slider-row"><span>${a.name || a.id}</span><input type="range" min="0" max="100" data-weight="${a.id}" value="${w}"><b>${w}%</b></label>`;
            })
            .join("")}
        </div>
        <div class="v1-sec">
          <h4>Emotion-Linked Bias Matrix</h4>
          <div class="v1-muted">${Object.entries(EMOTION_WEIGHT_MODIFIERS)
            .map(([em, map]) => `<b>${em}:</b> ${Object.keys(map).join(", ")}`)
            .join("<br>")}</div>
        </div>
      `;
      body.querySelectorAll("[data-cat]").forEach((inp) =>
        inp.addEventListener("change", () => {
          cfg.categoryMultipliers[inp.dataset.cat] = Math.max(0, Math.min(3, Number(inp.value) || 1));
          commit(cfg);
        })
      );
      body.querySelectorAll("[data-weight]").forEach((rng) =>
        rng.addEventListener("input", () => {
          const val = Number(rng.value);
          cfg.assetWeights[rng.dataset.weight] = val;
          rng.nextElementSibling.textContent = `${val}%`;
          commit(cfg);
        })
      );
    } else if (activeSubTab === "triggers") {
      body.innerHTML = `
        <div class="v1-sec">
          <h4>User-Speech Interrupt Policy</h4>
          <select data-policy>
            ${INTERRUPT_POLICIES.map(
              (p) => `<option value="${p.id}" ${cfg.interruptPolicy === p.id ? "selected" : ""}>${p.label}</option>`
            ).join("")}
          </select>
        </div>
        <div class="v1-sec">
          <h4>AI Tool Bridge Permissions</h4>
          <div class="v1-check-grid">
            ${AI_TOOL_NAMES.map(
              (t) => `<label><input type="checkbox" data-tool="${t}" ${cfg.toolPermissions[t] !== false ? "checked" : ""}> ${t}</label>`
            ).join("")}
          </div>
        </div>
      `;
      body.querySelector("[data-policy]")?.addEventListener("change", (e) => {
        cfg.interruptPolicy = e.target.value;
        commit(cfg);
      });
      body.querySelectorAll("[data-tool]").forEach((cb) =>
        cb.addEventListener("change", () => {
          cfg.toolPermissions[cb.dataset.tool] = cb.checked;
          commit(cfg);
        })
      );
    } else if (activeSubTab === "kinematics") {
      const foley = cfg.foley || { enabled: true, volume: 65 };
      body.innerHTML = `
        <div class="v1-sec">
          <h4>Kinematics &amp; IK Gaze</h4>
          <div class="v1-num-grid">
            <label>Walk Speed (m/s) <input type="number" step="0.1" min="0.4" max="3" data-kin="walkSpeed" value="${cfg.kinematics.walkSpeed}"></label>
            <label>Turn Rate <input type="number" step="0.5" min="1" max="12" data-kin="turnRate" value="${cfg.kinematics.turnRate}"></label>
            <label>Easing
              <select data-kin-sel="easing">
                <option value="linear" ${cfg.kinematics.easing === "linear" ? "selected" : ""}>Linear</option>
                <option value="smoothstep" ${cfg.kinematics.easing === "smoothstep" ? "selected" : ""}>Smoothstep</option>
                <option value="spring" ${cfg.kinematics.easing === "spring" ? "selected" : ""}>Spring</option>
              </select>
            </label>
            <label>Head Gaze Weight <input type="number" step="0.05" min="0" max="1" data-kin="headGazeWeight" value="${cfg.kinematics.headGazeWeight}"></label>
            <label>Eye Gaze Weight <input type="number" step="0.05" min="0" max="1" data-kin="eyeGazeWeight" value="${cfg.kinematics.eyeGazeWeight}"></label>
            <label>Idle Micro-Anim <input type="number" step="0.1" min="0" max="1" data-kin="idleMicroAmount" value="${cfg.kinematics.idleMicroAmount}"></label>
          </div>
        </div>
        <div class="v1-sec">
          <h4>Procedural Foley SFX</h4>
          <label class="v1-toggle"><input type="checkbox" data-foley-en ${foley.enabled ? "checked" : ""}> Enable Procedural Foley SFX</label>
          <label class="v1-slider-row"><span>Foley Volume</span><input type="range" min="0" max="100" data-foley-vol value="${foley.volume}"><b>${foley.volume}%</b></label>
        </div>
        <div class="v1-sec">
          <h4>Per-Asset Min/Max Dwell (seconds)</h4>
          ${assets
            .slice(0, 8)
            .map((a) => {
              const pair = cfg.assetDwells[a.id] || [3, 7];
              return `<div class="v1-wp-row"><span>${a.name || a.id}</span>
                <label>Min <input type="number" min="1" max="30" data-dmin="${a.id}" value="${pair[0]}"></label>
                <label>Max <input type="number" min="1" max="60" data-dmax="${a.id}" value="${pair[1]}"></label></div>`;
            })
            .join("")}
        </div>
      `;
      body.querySelectorAll("[data-kin]").forEach((inp) =>
        inp.addEventListener("change", () => {
          cfg.kinematics[inp.dataset.kin] = Number(inp.value) || 1;
          commit(cfg);
        })
      );
      body.querySelector("[data-kin-sel]")?.addEventListener("change", (e) => {
        cfg.kinematics.easing = e.target.value;
        commit(cfg);
      });
      body.querySelector("[data-foley-en]")?.addEventListener("change", (e) => {
        cfg.foley = { ...foley, enabled: e.target.checked };
        commit(cfg);
      });
      body.querySelector("[data-foley-vol]")?.addEventListener("input", (e) => {
        const val = Number(e.target.value);
        cfg.foley = { ...foley, volume: val };
        e.target.nextElementSibling.textContent = `${val}%`;
        commit(cfg);
      });
      body.querySelectorAll("[data-dmin]").forEach((inp) =>
        inp.addEventListener("change", () => {
          const id = inp.dataset.dmin;
          const prev = cfg.assetDwells[id] || [3, 7];
          cfg.assetDwells[id] = [Math.max(1, Number(inp.value) || 2), prev[1]];
          commit(cfg);
        })
      );
      body.querySelectorAll("[data-dmax]").forEach((inp) =>
        inp.addEventListener("change", () => {
          const id = inp.dataset.dmax;
          const prev = cfg.assetDwells[id] || [3, 7];
          cfg.assetDwells[id] = [prev[0], Math.max(prev[0], Number(inp.value) || 6)];
          commit(cfg);
        })
      );
    }
  };

  const offWp = bus.on("editor:waypoint_floor_click", ({ x, z }) => {
    const cur = getSettings()?.behaviorEngine || behaviorEngine.defaultConfig();
    const nodes = [...(cur.waypointRoute?.nodes || []), { x, z, dwellSec: 3 }];
    commit({ ...cur, waypointRoute: { ...cur.waypointRoute, nodes } });
    if (activeSubTab === "spatial") render();
  });

  render();
  return () => offWp();
}
