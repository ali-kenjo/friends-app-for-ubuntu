// ---------- Behavior, Quotas, Waypoint Route & Choreography State Machine ----------
// Complete deterministic behavior controller handling:
//   - States: IDLE_HOME, ROAM_WAYPOINT, MOVING_TO_ASSET, INTERACTING_WITH_ASSET,
//             CHOREOGRAPHY_TOOL, FOLLOWING_USER, PAUSED
//   - Autonomous Roaming & Focus Lock
//   - Session, Hourly & Per-Asset Quotas + Global & Per-Asset Cooldowns
//   - Weighted Random Selection (0-100% weight * category multiplier * emotion modifier)
//   - 4 User-Speech Interrupt Policies (immediate_return, finish_briefly, pause_and_resume, finish_before_listening)
//   - Custom Waypoint Route Runner (loop, ping_pong, random)
//   - 9 AI Choreography Tool Executor (move_to_asset, explain_on_whiteboard, clear_whiteboard,
//     write_in_notebook, play_with_toy, water_flowers, set_emotion, follow_route, return_home)

import { bus, EVENTS } from "../event-bus.mjs";
import { appState } from "../state-store.mjs";
import { navMesh } from "./pathfinding.mjs";

export const BEHAVIOR_STATES = Object.freeze([
  "IDLE_HOME",
  "ROAM_WAYPOINT",
  "MOVING_TO_ASSET",
  "INTERACTING_WITH_ASSET",
  "CHOREOGRAPHY_TOOL",
  "FOLLOWING_USER",
  "PAUSED",
]);

export const EMOTION_WEIGHT_MODIFIERS = Object.freeze({
  curious: { rubiks_cube: 1.65, holo_projector: 1.6, books_notebook: 1.45, whiteboard: 1.35 },
  playful: { bouncy_ball: 1.85, rc_drone: 1.75, retro_handheld: 1.65, stacking_blocks: 1.5 },
  excited: { gaming_console: 1.7, bouncy_ball: 1.6, rc_drone: 1.6, mini_synth: 1.5 },
  calm: { vase_flowers: 1.75, books_notebook: 1.55, newtons_cradle: 1.45, mini_synth: 1.4 },
  thinking: { whiteboard: 1.75, rubiks_cube: 1.55, newtons_cradle: 1.4 },
  happy: { mini_synth: 1.55, vase_flowers: 1.45, bouncy_ball: 1.4 },
});

export class BehaviorEngine {
  constructor() {
    this.state = "IDLE_HOME";
    this.config = this.defaultConfig();
    this.position = { x: 0, z: 0.15, rotY: 0 };
    this.path = [];
    this.pathIndex = 0;

    this.activeAssetId = null;
    this.activeAction = "use";
    this.activePayload = {};
    this.dwellRemaining = 0;
    this.idleTimer = 3.0;
    this.pausedAction = null;

    this.sessionCount = 0;
    /** @type {Array<{ ts: number, assetId: string }>} */
    this.hourlyHistory = [];
    this.lastGlobalInteractionTs = 0;
    /** @type {Map<string, number>} */
    this.lastAssetTs = new Map();

    // Route state
    this.routeIndex = 0;
    this.routeDir = 1;
    this.routeModeOverride = null;
    this.onStepAction = null; // callback injected by runtime engine
    this.onToolComplete = null;
  }

  defaultConfig() {
    return {
      autonomousRoaming: true,
      focusLock: false,
      homeReturnDelaySec: 8,
      homeSpot: { x: 0, z: 0.15, rotY: 0 },
      quotas: {
        maxPerSession: 40,
        maxPerHour: 18,
        perAssetPerHour: 6,
        globalCooldownSec: 12,
        perAssetCooldownSec: 45,
      },
      kinematics: {
        walkSpeed: 1.15,
        turnRate: 4.5,
        easing: "smoothstep",
        headGazeWeight: 0.85,
        eyeGazeWeight: 1.0,
        idleMicroAmount: 0.7,
      },
      interruptPolicy: "finish_briefly",
      categoryMultipliers: { furniture: 0.8, desk_prop: 1.0, toy: 1.2, flower: 1.0 },
      assetWeights: {},
      assetDwells: {},
      toolPermissions: {},
      waypointRoute: {
        mode: "loop",
        gait: "hover",
        nodes: [
          { x: -0.9, z: 0.0, dwellSec: 3 },
          { x: 0.0, z: 0.35, dwellSec: 4 },
          { x: 0.9, z: -0.1, dwellSec: 3 },
        ],
      },
    };
  }

  configure(cfg = {}) {
    const def = this.defaultConfig();
    this.config = {
      ...def,
      ...cfg,
      homeSpot: { ...def.homeSpot, ...(cfg.homeSpot || {}) },
      quotas: { ...def.quotas, ...(cfg.quotas || {}) },
      kinematics: { ...def.kinematics, ...(cfg.kinematics || {}) },
      categoryMultipliers: { ...def.categoryMultipliers, ...(cfg.categoryMultipliers || {}) },
      assetWeights: { ...(cfg.assetWeights || {}) },
      assetDwells: { ...(cfg.assetDwells || {}) },
      toolPermissions: { ...(cfg.toolPermissions || {}) },
      waypointRoute: { ...def.waypointRoute, ...(cfg.waypointRoute || {}) },
    };
    appState.set("behavior", {
      autonomousRoaming: this.config.autonomousRoaming,
      focusLock: this.config.focusLock,
    });
  }

  setState(next) {
    if (this.state === next) return;
    this.state = next;
    appState.set("behavior", {
      state: next,
      activeAssetId: this.activeAssetId,
      sessionInteractions: this.sessionCount,
      hourlyInteractions: this.hourlyHistory.length,
    });
    bus.emit(EVENTS.BEHAVIOR_STATE, { state: next, activeAssetId: this.activeAssetId });
  }

  pruneHourly(now = Date.now()) {
    const cutoff = now - 3600 * 1000;
    while (this.hourlyHistory.length && this.hourlyHistory[0].ts < cutoff) {
      this.hourlyHistory.shift();
    }
  }

  /** Verify all session, hourly, per-asset quotas and cooldowns for an asset. */
  canInteractWithAsset(assetId, now = Date.now()) {
    const q = this.config.quotas;
    if (this.sessionCount >= q.maxPerSession) return false;
    this.pruneHourly(now);
    if (this.hourlyHistory.length >= q.maxPerHour) return false;

    if (this.lastGlobalInteractionTs > 0 && now - this.lastGlobalInteractionTs < q.globalCooldownSec * 1000) {
      return false;
    }

    const assetHourCount = this.hourlyHistory.filter((h) => h.assetId === assetId).length;
    if (assetHourCount >= q.perAssetPerHour) return false;

    const lastAsset = this.lastAssetTs.get(assetId) || 0;
    if (lastAsset > 0 && now - lastAsset < q.perAssetCooldownSec * 1000) {
      return false;
    }
    return true;
  }

  recordInteraction(assetId, now = Date.now()) {
    this.sessionCount++;
    this.lastGlobalInteractionTs = now;
    this.lastAssetTs.set(assetId, now);
    this.hourlyHistory.push({ ts: now, assetId });
    this.pruneHourly(now);
    appState.set("behavior", {
      sessionInteractions: this.sessionCount,
      hourlyInteractions: this.hourlyHistory.length,
    });
  }

  /** Compute effective weight combining base asset weight * category multiplier * emotion modifier. */
  effectiveWeight(asset, emotion = "calm") {
    if (!asset || asset.visible === false) return 0;
    const base = this.config.assetWeights[asset.id] ?? 50;
    if (base <= 0) return 0;
    const catMult = this.config.categoryMultipliers[asset.category] ?? 1.0;
    const emoMod = EMOTION_WEIGHT_MODIFIERS[emotion]?.[asset.kind] ?? 1.0;
    return base * catMult * emoMod;
  }

  pickNextAutonomousAsset(assets = [], emotion = "calm", now = Date.now()) {
    const candidates = [];
    let total = 0;
    for (const a of assets) {
      if (!this.canInteractWithAsset(a.id, now)) continue;
      const w = this.effectiveWeight(a, emotion);
      if (w > 0) {
        candidates.push({ asset: a, weight: w });
        total += w;
      }
    }
    if (!candidates.length || total <= 0) return null;
    let roll = Math.random() * total;
    for (const c of candidates) {
      roll -= c.weight;
      if (roll <= 0) return c.asset;
    }
    return candidates[candidates.length - 1].asset;
  }

  /** Move smoothly to (gx, gz) using live A* obstacle avoidance. */
  navigateTo(gx, gz, assets = []) {
    navMesh.rebuild(assets);
    this.path = navMesh.findPath(this.position.x, this.position.z, gx, gz);
    this.pathIndex = 0;
    bus.emit(EVENTS.ROBOT_PATH_UPDATED, { path: this.path });
  }

  /** Execute an AI Choreography tool cleanly through the state machine. */
  handleChoreographyTool({ tool, args = {} }, assets = []) {
    if (this.config.toolPermissions[tool] === false) {
      return { ok: false, reason: `Permission disabled for ${tool}` };
    }

    if (tool === "set_emotion") {
      const emotion = String(args.emotion || "happy").toLowerCase();
      appState.set("behavior", { emotion });
      bus.emit(EVENTS.ROBOT_EMOTION, { emotion });
      return { ok: true, emotion };
    }

    if (tool === "return_home") {
      const home = this.config.homeSpot || { x: 0, z: 0.15, rotY: 0 };
      this.activeAssetId = null;
      this.activeAction = "home";
      this.navigateTo(home.x, home.z, assets);
      this.setState("MOVING_TO_ASSET");
      return { ok: true, target: "home" };
    }

    if (tool === "follow_route") {
      this.routeModeOverride = args.mode || null;
      this.activeAssetId = null;
      const node = this.nextRouteNode();
      if (!node) return { ok: false, reason: "No waypoint nodes defined" };
      this.navigateTo(node.x, node.z, assets);
      this.setState("ROAM_WAYPOINT");
      return { ok: true, routeMode: this.routeModeOverride || this.config.waypointRoute.mode };
    }

    const assetMap = {
      explain_on_whiteboard: "whiteboard",
      clear_whiteboard: "whiteboard",
      write_in_notebook: "books_notebook",
      water_flowers: "vase_flowers",
      play_with_toy: args.toyId || "rubiks_cube",
      move_to_asset: args.assetId || "desk_table",
    };

    const targetId = assetMap[tool] || args.assetId;
    const asset = assets.find((a) => a.id === targetId || a.kind === targetId);
    if (!asset) return { ok: false, reason: `Asset ${targetId} not present in room` };

    this.activeAssetId = asset.id;
    this.activeAction =
      tool === "explain_on_whiteboard"
        ? "explain"
        : tool === "clear_whiteboard"
          ? "clear"
          : tool === "water_flowers"
            ? "water"
            : tool === "write_in_notebook"
              ? "note"
              : args.action || "play";
    this.activePayload = { ...args, tool };

    const spot = this.approachFor(asset);
    this.navigateTo(spot.x, spot.z, assets);
    this.setState("CHOREOGRAPHY_TOOL");
    return { ok: true, assetId: asset.id };
  }

  approachFor(asset) {
    const off = asset.approachOffset || [0, 0.55];
    const sin = Math.sin(asset.rotY || 0);
    const cos = Math.cos(asset.rotY || 0);
    return {
      x: (asset.x || 0) + off[0] * cos + off[1] * sin,
      z: (asset.z || 0) - off[0] * sin + off[1] * cos,
    };
  }

  nextRouteNode() {
    const route = this.config.waypointRoute;
    const nodes = route?.nodes || [];
    if (!nodes.length) return null;
    const mode = this.routeModeOverride || route.mode || "loop";
    if (mode === "random") {
      this.routeIndex = Math.floor(Math.random() * nodes.length);
    } else if (mode === "ping_pong") {
      if (nodes.length > 1) {
        this.routeIndex += this.routeDir;
        if (this.routeIndex >= nodes.length) {
          this.routeIndex = nodes.length - 2;
          this.routeDir = -1;
        } else if (this.routeIndex < 0) {
          this.routeIndex = 1;
          this.routeDir = 1;
        }
      }
    } else {
      this.routeIndex = (this.routeIndex + 1) % nodes.length;
    }
    return nodes[Math.max(0, Math.min(nodes.length - 1, this.routeIndex))];
  }

  /** Apply configured User-Speech Interrupt Policy when user starts talking. */
  onUserSpeechStart(assets = []) {
    const policy = this.config.interruptPolicy || "finish_briefly";
    if (policy === "finish_before_listening") return;

    if (policy === "pause_and_resume") {
      if (this.state === "INTERACTING_WITH_ASSET" || this.state === "MOVING_TO_ASSET") {
        this.pausedAction = {
          state: this.state,
          assetId: this.activeAssetId,
          action: this.activeAction,
          dwellRemaining: this.dwellRemaining,
        };
      }
      this.setState("FOLLOWING_USER");
      return;
    }

    if (policy === "finish_briefly") {
      if (this.state === "INTERACTING_WITH_ASSET") {
        this.dwellRemaining = Math.min(this.dwellRemaining, 0.9);
      } else {
        this.setState("FOLLOWING_USER");
      }
      return;
    }

    // immediate_return
    this.activeAssetId = null;
    this.pausedAction = null;
    this.dwellRemaining = 0;
    this.path = [];
    const home = this.config.homeSpot || { x: 0, z: 0.15 };
    this.navigateTo(home.x, home.z, assets);
    this.setState("FOLLOWING_USER");
  }

  onUserSpeechEnd(assets = []) {
    if (this.state !== "FOLLOWING_USER") return;
    if (this.pausedAction?.assetId) {
      const target = assets.find((a) => a.id === this.pausedAction.assetId);
      if (target) {
        this.activeAssetId = target.id;
        this.activeAction = this.pausedAction.action;
        this.dwellRemaining = Math.max(1.5, this.pausedAction.dwellRemaining);
        this.pausedAction = null;
        this.setState("INTERACTING_WITH_ASSET");
        return;
      }
    }
    this.pausedAction = null;
    this.setState("IDLE_HOME");
    this.idleTimer = 2.0;
  }

  /** Step simulation forward by dt seconds. */
  tick(dt, assets = [], now = Date.now()) {
    if (this.state === "PAUSED") return;

    const gait = this.config.waypointRoute?.gait || "hover";
    const gaitSpeedMult = gait === "brisk" ? 1.45 : gait === "playful" ? 1.25 : 1.0;
    const speed = (this.config.kinematics.walkSpeed || 1.15) * gaitSpeedMult;

    // 1. Follow active A* path if walking/hovering
    if (
      (this.state === "MOVING_TO_ASSET" || this.state === "CHOREOGRAPHY_TOOL" || this.state === "ROAM_WAYPOINT" || this.state === "FOLLOWING_USER") &&
      this.pathIndex < this.path.length
    ) {
      const wp = this.path[this.pathIndex];
      const dx = wp.x - this.position.x;
      const dz = wp.z - this.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.05) {
        this.position.x = wp.x;
        this.position.z = wp.z;
        this.pathIndex++;
        if (this.pathIndex >= this.path.length) {
          this.onPathArrived(assets, now);
        }
      } else {
        const step = Math.min(dist, speed * dt);
        this.position.x += (dx / dist) * step;
        this.position.z += (dz / dist) * step;
        const targetYaw = Math.atan2(dx, dz);
        const turnAlpha = Math.min(1, dt * (this.config.kinematics.turnRate || 4.5));
        this.position.rotY += Math.atan2(Math.sin(targetYaw - this.position.rotY), Math.cos(targetYaw - this.position.rotY)) * turnAlpha;
      }
      return;
    }

    // 2. Interacting dwell timer
    if (this.state === "INTERACTING_WITH_ASSET") {
      this.dwellRemaining -= dt;
      if (this.dwellRemaining <= 0) {
        this.activeAssetId = null;
        if (this.config.autonomousRoaming && !this.config.focusLock && Math.random() < 0.45) {
          const node = this.nextRouteNode();
          if (node) {
            this.navigateTo(node.x, node.z, assets);
            this.setState("ROAM_WAYPOINT");
            return;
          }
        }
        const home = this.config.homeSpot || { x: 0, z: 0.15 };
        this.navigateTo(home.x, home.z, assets);
        this.setState("MOVING_TO_ASSET");
        this.activeAction = "home";
      }
      return;
    }

    // 3. Idle at Home -> pick autonomous activity or waypoint roam
    if (this.state === "IDLE_HOME" && this.config.autonomousRoaming && !this.config.focusLock) {
      this.idleTimer -= dt;
      if (this.idleTimer <= 0) {
        const emotion = appState.get("behavior")?.emotion || "calm";
        const chosen = this.pickNextAutonomousAsset(assets, emotion, now);
        if (chosen) {
          this.activeAssetId = chosen.id;
          this.activeAction = chosen.kind === "vase_flowers" ? "water" : "use";
          this.activePayload = {};
          const spot = this.approachFor(chosen);
          this.navigateTo(spot.x, spot.z, assets);
          this.setState("MOVING_TO_ASSET");
        } else {
          this.idleTimer = Math.max(3, this.config.homeReturnDelaySec || 6);
        }
      }
    }
  }

  onPathArrived(assets, now) {
    if (this.state === "FOLLOWING_USER") {
      this.position.rotY = 0;
      return;
    }
    if (this.state === "ROAM_WAYPOINT") {
      const node = this.config.waypointRoute?.nodes?.[this.routeIndex];
      this.dwellRemaining = Number(node?.dwellSec) || 3;
      this.setState("INTERACTING_WITH_ASSET");
      return;
    }
    if (this.activeAction === "home" || !this.activeAssetId) {
      this.position.rotY = this.config.homeSpot?.rotY || 0;
      this.setState("IDLE_HOME");
      this.idleTimer = Math.max(3, this.config.homeReturnDelaySec || 6);
      return;
    }

    const asset = assets.find((a) => a.id === this.activeAssetId);
    if (asset) {
      const dx = (asset.x || 0) - this.position.x;
      const dz = (asset.z || 0) - this.position.z;
      this.position.rotY = Math.atan2(dx, dz);
    }

    this.recordInteraction(this.activeAssetId, now);
    this.onStepAction?.({
      assetId: this.activeAssetId,
      action: this.activeAction,
      payload: this.activePayload,
    });

    const dwellRange = this.config.assetDwells[this.activeAssetId] || [3.5, 6.5];
    const minD = Number(dwellRange[0] ?? 3.5);
    const maxD = Math.max(minD, Number(dwellRange[1] ?? 6.5));
    this.dwellRemaining = minD + Math.random() * (maxD - minD);
    this.setState("INTERACTING_WITH_ASSET");
  }
}

export const behaviorEngine = new BehaviorEngine();
