// ---------- The robot's behaviour in its room ----------
// Pure, with its own clock (advanced by tick()), so node:test checks it. It owns where the robot is and
// which way it faces; the animator adds its small moves on top (animator.setBase). Every tick it decides,
// from the room (home, spots, zones, routes, rules, autonomy), the robot's state (idle, talking, listening,
// thinking, away) and the mode (filming, reduced motion, night):
//   where it goes (paths on the nav grid, round no-go zones, slower in slow zones),
//   how it stands (stand, sit, lean, rest; hover height and stance),
//   where it looks (a mode, and a point when the mode needs one),
//   whether it may make sounds (quiet zones),
// and it says why in an event log ({ key, vars }: translated where it's shown).
import { effectiveRoom, inWindow, roomHour } from "./schedule.mjs";
import { canDo, explain } from "./rules.mjs";
import { buildGrid, findPath, standPoint, zonesAt, pointInZone, whatBlocks, nearestFree, centreOf } from "./nav.mjs";
import { entryFor } from "./catalog.mjs";
import { worldTransform, displayName } from "./model.mjs";
import { AUTONOMY_PRESETS, TIMES_OF_DAY, HOVER_HEIGHTS } from "./choices.mjs";

const RAD = Math.PI / 180;
const SLOW_ZONE = 0.45;
const FRAGILE = 0.5;
const ARRIVE = 0.04;
const LOG_MAX = 60;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;
const facingTo = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]) / RAD;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// The part of the day an hour is in (TIMES_OF_DAY), for "when it likes to visit"
export function partOfDay(hour) {
  const h = hour < 5 ? hour + 24 : hour;
  return TIMES_OF_DAY.find((p) => h >= p.from && h < p.to)?.id || "night";
}

// A world point of a thing's anchor (look, sit, lean, rest), or its middle at a height
export function anchorPoint(room, asset, name) {
  const def = entryFor(asset.type);
  const t = worldTransform(room, asset);
  const a = def?.anchors?.[name] || (name === "look" ? [0, (def?.height || 0.6) * 0.65, 0] : null);
  if (!a) return null;
  const k = (asset.scale || 1) * (def?.variants?.[asset.variant] ?? 1);
  const c = Math.cos(t.rot * RAD);
  const s = Math.sin(t.rot * RAD);
  return [t.x + (a[0] * c + a[2] * s) * k, t.y + a[1] * k, t.z + (-a[0] * s + a[2] * c) * k];
}

export class RoomBehaviour {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.t = 0;
    this.room = null;
    this.eff = null;
    this.grid = null;
    this.gridKey = "";
    this.pos = [0, 0.15];
    this.yaw = 0;
    this.speed = 0;
    this.task = null; // { kind: "go"|"dwell"|"route"|"hold", … }
    this.why = ""; // what the current task is for: "home", "wander", "visit", "route", "rest", "stage", "closer", "command", "pace"
    this.ctxState = "idle";
    this.visits = { all: [], per: new Map(), session: 0, last: -1e9 };
    this.next = { wander: 0, visit: 0, route: 0 };
    this.routeRuns = new Map(); // route id → last start (seconds)
    this.log = [];
    this.onLog = null;
    this.onAction = null; // ({ assetId, action }) when it uses a thing
    this.sleeping = false;
    this.out = this.output();
  }

  // ---------- The room ----------
  setRoom(room, { now = new Date(), filming = false } = {}) {
    const first = !this.room;
    this.room = room;
    this.eff = effectiveRoom(room, { now, filming });
    const key = JSON.stringify([room.size, room.architecture?.walls, room.robot.zones, room.robot.movement.clearance, room.assets.map((a) => [a.id, a.type, a.pos, a.rot, a.scale, a.variant, a.parent, a.slot]), [...this.eff.hidden].sort()]);
    if (key !== this.gridKey) {
      this.gridKey = key;
      this.grid = buildGrid(this.eff.room, { hidden: this.eff.hidden });
    }
    if (first) {
      this.pos = this.home();
      this.yaw = room.robot.home.facing;
    }
    // A thing it was heading for went away: back home
    if (this.task?.asset && !this.eff.room.assets.some((a) => a.id === this.task.asset && !this.eff.hidden.has(a.id))) this.goHome("gone");
  }

  home() {
    const h = this.room.robot.home.pos;
    return [h[0], h[2]];
  }

  // ---------- The event log ----------
  say(key, vars = {}) {
    const last = this.log[this.log.length - 1];
    if (last && last.key === key && JSON.stringify(last.vars) === JSON.stringify(vars) && this.t - last.t < 5) return;
    const e = { t: Math.round(this.t * 10) / 10, key, vars };
    this.log.push(e);
    if (this.log.length > LOG_MAX) this.log.shift();
    this.onLog?.(e);
  }

  // ---------- Going places ----------
  // Plans a path; false (and a reason in the log) when there is none
  goTo(to, { why, face = null, asset = null, then = null, name = "" } = {}) {
    if (!this.grid) return false;
    const target = this.leashed(to, why);
    const p = findPath(this.grid, this.pos, target, { smooth: this.room.robot.movement.path });
    if (!p.ok) {
      const by = whatBlocks(this.eff.room, this.pos, target, { hidden: this.eff.hidden });
      const byName = by.length ? displayName(this.eff.room.assets.find((a) => a.id === by[0])) : "";
      if (byName) this.say("No path to {name}: blocked by the {by}", { name: name || "?", by: byName });
      else this.say("No path to {name}", { name: name || "?" });
      return false;
    }
    this.task = { kind: "go", points: p.points, i: 1, face, asset, then };
    this.why = why;
    return true;
  }

  // With freedom "near home", a goal outside the leash is brought back inside it (commands and rest excepted)
  leashed(to, why) {
    const mv = this.room.robot.movement;
    // (the leash keeps its own wandering near home; you send it further: a command, rest, the stage, its seat)
    if (mv.freedom !== "near_home" || ["command", "rest", "home", "stage", "place"].includes(why)) return to;
    const h = this.home();
    const d = dist(to, h);
    if (d <= mv.leash) return to;
    const k = mv.leash / d;
    return [h[0] + (to[0] - h[0]) * k, h[1] + (to[1] - h[1]) * k];
  }

  goHome(reason = "") {
    const h = this.home();
    this.sleeping = false;
    if (dist(this.pos, h) < ARRIVE) {
      this.task = { kind: "hold", face: this.room.robot.home.facing };
      this.why = "home";
      return;
    }
    if (reason) this.say("Back home");
    if (!this.goTo(h, { why: "home", face: this.room.robot.home.facing, name: "home" })) this.task = { kind: "hold", face: null };
  }

  // Where it spends its idle time: the seat or the desk its idle posture names (to sit or lean there), or home
  goIdlePlace() {
    const want = this.room.robot.posture.idle;
    const a = (want.kind === "sit" || want.kind === "lean") && want.asset && this.eff.room.assets.find((x) => x.id === want.asset && !this.eff.hidden.has(x.id));
    if (!a) return this.goHome("after");
    const at = standPoint(this.eff.room, a);
    const look = anchorPoint(this.eff.room, a, want.kind) || anchorPoint(this.eff.room, a, "look");
    if (dist(this.pos, at) < ARRIVE * 2) {
      this.task = { kind: "hold", face: look ? facingTo(at, [look[0], look[2]]) + (want.kind === "sit" ? 180 : 0) : null };
      this.why = "place";
      return;
    }
    if (!this.goTo(at, { why: "place", face: look ? facingTo(at, [look[0], look[2]]) + (want.kind === "sit" ? 180 : 0) : null, name: displayName(a) })) this.goHome("after");
  }

  // ---------- Commands (the AI, the voice dock, the editor's buttons) ----------
  // { kind: "home" } | { kind: "spot", id } | { kind: "asset", id, action, actor } | { kind: "route", id } | { kind: "stop" }
  command(cmd, ctx = {}) {
    if (!this.room) return { ok: false, reason: "not_found", text: "" };
    if (cmd.kind === "stop") {
      this.task = { kind: "hold", face: null };
      this.why = "command";
      return { ok: true };
    }
    if (cmd.kind === "home") {
      this.goHome("command");
      return { ok: true };
    }
    if (cmd.kind === "spot") {
      const s = this.room.robot.spots.find((x) => x.id === cmd.id || x.name.toLowerCase() === String(cmd.id).toLowerCase());
      if (!s) return { ok: false, reason: "not_found", text: "" };
      const ok = this.goTo([s.pos[0], s.pos[2]], { why: "command", face: s.facing, name: s.name });
      if (ok) this.say("Going to {name}", { name: s.name });
      return ok ? { ok: true } : { ok: false, reason: "no_path" };
    }
    if (cmd.kind === "route") {
      const r = this.room.robot.routes.find((x) => x.id === cmd.id || x.name.toLowerCase() === String(cmd.id).toLowerCase());
      if (!r || !r.points.length) return { ok: false, reason: "not_found" };
      this.startRoute(r, "command");
      return { ok: true };
    }
    if (cmd.kind === "asset") {
      const action = cmd.action || "go";
      const actor = cmd.actor || "ai";
      const res = canDo(this.room, actor, cmd.id, action, { ...ctx, now: ctx.now });
      const a = this.eff.room.assets.find((x) => x.id === cmd.id);
      const name = a ? displayName(a) : "";
      if (!res.ok) {
        this.say("Not doing it: {why}", { why: { reason: res.reason, name, action } });
        return { ...res, text: explain(res, { name, action }) };
      }
      return this.visit(a, action, "command") ? { ok: true } : { ok: false, reason: "no_path" };
    }
    return { ok: false, reason: "unsupported" };
  }

  // Goes to a thing and does something with it there
  visit(a, action, why) {
    const at = standPoint(this.eff.room, a);
    const r = a.rules || {};
    // Keep its distance: stand further out, along the line from the thing
    let goal = at;
    if (r.keepDistance) {
      const t = worldTransform(this.eff.room, a);
      const d = dist(at, [t.x, t.z]) || 1;
      goal = [at[0] + ((at[0] - t.x) / d) * (r.keepDistance / 100), at[1] + ((at[1] - t.z) / d) * (r.keepDistance / 100)];
    }
    const look = anchorPoint(this.eff.room, a, "look");
    const name = displayName(a);
    const dwell = r.dwell || [3, 8];
    const ok = this.goTo(goal, { why, asset: a.id, face: look ? facingTo(goal, [look[0], look[2]]) : null, name, then: { kind: "dwell", asset: a.id, action, dwell: dwell[0] + this.random() * Math.max(0, dwell[1] - dwell[0]) } });
    if (ok) this.say("Going to the {name}", { name });
    return ok;
  }

  startRoute(r, why) {
    this.routeRuns.set(r.id, this.t);
    this.task = { kind: "route", route: r.id, idx: 0, dir: 1, dwellUntil: -1, leg: null, done: 0 };
    this.why = why;
    this.say("Following the route {name}", { name: r.name || r.id });
  }

  // ---------- Each tick ----------
  // ctx: { state, now, filming, reducedMotion, mood, awaySec, privateMode, ai }
  tick(dt, ctx = {}) {
    if (!this.room) return this.out;
    this.t += dt;
    const now = ctx.now || new Date();
    const robot = this.room.robot;
    const state = ctx.state || "idle";
    const prev = this.ctxState;
    this.ctxState = state;
    const filming = Boolean(ctx.filming) && robot.states.filming.stay;
    const still = filming || robot.autonomy.preset === "statue" || robot.movement.freedom === "stay";
    const night = robot.states.night.on && inWindow(robot.states.night.from, robot.states.night.to, now);
    const awayMin = (ctx.awaySec || 0) / 60;
    const away = state === "away" || (state === "idle" && awayMin >= robot.states.away.afterMin);
    if (state !== prev && state !== "idle") this.sleeping = false;

    // ---- Decide (only when the current task allows it) ----
    const commanded = this.why === "command" && this.task && this.task.kind !== "hold";
    if (!commanded) {
      if (filming) {
        if (this.task?.kind === "go" || this.task?.kind === "route") this.say("Staying put: filming");
        this.task = { kind: "hold", face: this.task?.face ?? null };
        this.why = "filming";
      } else if (away || night) {
        this.decideRest(away ? awayMin : 0, night, ctx);
      } else if (state === "talking") this.decideTalking(still);
      else if (state === "listening") this.decideListening(still);
      else if (state === "thinking") this.decideThinking(still, ctx);
      else this.decideIdle(still, ctx, now);
    }

    // ---- Move ----
    this.move(dt, ctx);

    // ---- What it shows ----
    this.out = this.output(state, ctx, { away: away || night, filming });
    return this.out;
  }

  decideRest(awayMin, night, ctx) {
    const robot = this.room.robot;
    if (this.why !== "rest") {
      const target = this.restPlace();
      this.sleeping = false;
      this.say(night ? "Night: resting" : "You're away: going to rest");
      if (!target || dist(this.pos, target.at) < ARRIVE || ctx.reducedMotion || !this.goTo(target.at, { why: "rest", face: target.face, name: target.name })) {
        this.task = { kind: "hold", face: target?.face ?? null };
        this.why = "rest";
      }
    }
    if (!this.sleeping && awayMin >= robot.states.away.afterMin + robot.states.away.sleepAfterMin && this.task?.kind === "hold") {
      this.sleeping = true;
      this.say("Asleep");
    }
  }

  // Where it rests: on its pad (the away posture's thing), in a rest zone, at a spot called "rest", or home
  restPlace() {
    const robot = this.room.robot;
    const pad = robot.posture.away.asset && this.eff.room.assets.find((a) => a.id === robot.posture.away.asset && !this.eff.hidden.has(a.id));
    if (pad) {
      const at = standPoint(this.eff.room, pad);
      const t = worldTransform(this.eff.room, pad);
      return { at: [t.x, t.z], face: facingTo(at, [t.x, t.z]) + 180, name: displayName(pad) };
    }
    const zone = robot.zones.find((z) => z.kind === "rest");
    if (zone) return { at: this.zoneCentre(zone), face: robot.home.facing, name: zone.name || "rest" };
    const spot = robot.spots.find((s) => /rest|sleep|charg/i.test(s.name));
    if (spot) return { at: [spot.pos[0], spot.pos[2]], face: spot.facing, name: spot.name };
    return { at: this.home(), face: robot.home.facing, name: "home" };
  }

  zoneCentre(z) {
    if (z.shape === "circle") return [...z.points[0]];
    const xs = z.points.map((p) => p[0]);
    const zs = z.points.map((p) => p[1]);
    const c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
    // The middle of an L-shaped polygon may be outside it: the nearest free cell inside instead
    if (!pointInZone(z, c[0], c[1]) && this.grid) {
      const n = nearestFree(this.grid, z.points[0][0], z.points[0][1]);
      if (n) return centreOf(this.grid, n[0], n[1]);
    }
    return c;
  }

  // Where you are: in front of the room's middle, a little past its front edge (where the camera is)
  you() {
    return [0, this.room.size.d / 2 + 0.6];
  }

  decideTalking(still) {
    const choice = this.room.robot.states.talking;
    if (this.why === "talk") return;
    this.why = "talk";
    const stage = this.room.robot.zones.find((z) => z.kind === "stage");
    if (choice === "stage" && stage && !still) {
      const c = this.zoneCentre(stage);
      if (this.goTo(c, { why: "stage", face: facingTo(c, this.you()), name: stage.name || "stage" })) return void (this.why = "talk");
    } else if (choice === "closer" && !still) {
      const y = this.you();
      const goal = [this.pos[0] + (y[0] - this.pos[0]) * 0.25, this.pos[1] + Math.min(0.6, (y[1] - this.pos[1]) * 0.35)];
      if (this.goTo(goal, { why: "talk", face: facingTo(goal, y), name: "you" })) return void (this.why = "talk");
    }
    this.task = { kind: "hold", face: facingTo(this.pos, this.you()) };
    this.why = "talk";
  }

  decideListening(still) {
    if (this.why === "listen") return;
    this.why = "listen";
    if (this.room.robot.states.listening === "closer" && !still) {
      const y = this.you();
      const goal = [this.pos[0], this.pos[1] + Math.min(0.5, (y[1] - this.pos[1]) * 0.3)];
      if (this.goTo(goal, { why: "listen", face: facingTo(goal, y), name: "you" })) return void (this.why = "listen");
    }
    // Turn to you, where it is
    this.task = { kind: "hold", face: facingTo(this.pos, this.you()) };
    this.why = "listen";
  }

  decideThinking(still, ctx) {
    const choice = this.room.robot.states.thinking;
    if (choice === "pace" && !still && !ctx.reducedMotion) {
      if (this.why === "pace" && this.task?.kind === "go") return;
      if (this.why === "pace" && this.t < this.next.wander) return;
      const side = this.random() < 0.5 ? -1 : 1;
      const goal = [this.pos[0] + side * (0.25 + this.random() * 0.2), this.pos[1]];
      this.next.wander = this.t + 2.5;
      if (this.goTo(goal, { why: "pace", name: "pace" })) return;
    }
    if (this.why !== "think") {
      this.task = { kind: "hold", face: this.task?.face ?? null };
      this.why = "think";
    }
  }

  decideIdle(still, ctx, now) {
    const robot = this.room.robot;
    // Busy with something: let it finish
    if (this.task && this.task.kind !== "hold" && ["visit", "wander", "route", "home", "command", "place"].includes(this.why)) return;
    if (["talk", "listen", "think", "pace", "rest", "filming", "gone"].includes(this.why) || !this.task) {
      // Back from a conversation or a rest: home, after a moment
      this.next.home = this.t + robot.autonomy.homeReturnSec;
      this.why = "after";
      this.task = { kind: "hold", face: this.task?.face ?? null };
    }
    if (this.why === "after") {
      if (this.t < this.next.home) return;
      if (!still) return this.goIdlePlace();
      this.task = { kind: "hold", face: robot.home.facing };
      this.why = "home";
      return;
    }
    if (still || ctx.reducedMotion) return;
    const preset = AUTONOMY_PRESETS.find((p) => p.id === robot.autonomy.preset);
    const idle = robot.autonomy.preset === "custom" ? robot.states.idle : preset?.idle || robot.states.idle;
    // A route that is due runs first
    const due = this.dueRoute(now, idle);
    if (due) return this.startRoute(due, "route");
    if (robot.movement.freedom === "routes") return;
    if (idle === "visit" && this.t >= this.next.visit) {
      this.next.visit = this.t + 4 + this.random() * 6;
      if (this.tryVisit(ctx, now)) return;
    }
    if ((idle === "wander" || idle === "visit") && this.t >= this.next.wander) {
      this.next.wander = this.t + 8 + this.random() * 8;
      this.wander();
    }
  }

  dueRoute(now, idle) {
    const scene = this.eff.scene?.id;
    for (const r of this.room.robot.routes) {
      if (!r.points.length) continue;
      const last = this.routeRuns.get(r.id) ?? -1e9;
      const w = r.when;
      if (w.kind === "idle" && idle === "route" && this.t - last > 5) return r;
      if (w.kind === "every" && this.t - last >= w.everyMin * 60) return r;
      if (w.kind === "window" && inWindow(w.from, w.to, now) && this.t - last > 30) return r;
      if (w.kind === "scene" && scene && w.scene === scene && this.t - last > 30) return r;
    }
    return null;
  }

  wander() {
    const h = this.home();
    const mv = this.room.robot.movement;
    const reach = mv.freedom === "near_home" ? mv.leash : Math.max(this.room.size.w, this.room.size.d) / 2;
    for (let i = 0; i < 6; i++) {
      const a = this.random() * Math.PI * 2;
      const r = (0.3 + this.random() * 0.7) * reach;
      const goal = [h[0] + Math.sin(a) * r, h[1] + Math.cos(a) * r];
      if (this.goTo(goal, { why: "wander", name: "a spot" })) return true;
    }
    return false;
  }

  // The weighted pick among the things it may visit on its own (rules, quotas, cooldowns, moods, time of day)
  tryVisit(ctx, now) {
    const q = this.room.robot.autonomy.quotas;
    const preset = AUTONOMY_PRESETS.find((p) => p.id === this.room.robot.autonomy.preset);
    const maxPerHour = this.room.robot.autonomy.preset !== "custom" && preset?.quotas ? preset.quotas.maxPerHour : q.maxPerHour;
    const hourAgo = this.t - 3600;
    this.visits.all = this.visits.all.filter((x) => x > hourAgo);
    if (this.visits.session >= q.maxPerSession) return this.quiet("Not visiting: the session's limit is reached");
    if (this.visits.all.length >= maxPerHour) return this.quiet("Not visiting: {n} visits this hour already", { n: this.visits.all.length });
    if (this.t - this.visits.last < q.globalCooldownSec) return false;
    const part = partOfDay(roomHour(this.room, now));
    const ctxRules = { ...ctx, now, hidden: this.eff.hidden };
    const options = [];
    for (const a of this.eff.room.assets) {
      if (this.eff.hidden.has(a.id)) continue;
      const def = entryFor(a.type);
      if (!def || def.actions.every((x) => x === "look")) continue;
      const r = a.rules || {};
      const name = displayName(a);
      const go = canDo(this.eff.room, "auto", a.id, "go", ctxRules);
      if (!go.ok) {
        if (r.permission === "never") this.quiet("Skipped the {name}: Never", { name });
        continue;
      }
      const per = (this.visits.per.get(a.id) || []).filter((x) => x > hourAgo);
      this.visits.per.set(a.id, per);
      if (per.length && this.t - per[per.length - 1] < Math.max(r.cooldown ?? 45, q.perAssetCooldownSec)) continue;
      if (per.length >= Math.min(r.maxPerHour ?? 6, q.perAssetPerHour)) continue;
      if (r.times?.length && !r.times.includes(part)) continue;
      let w = r.weight ?? 50;
      if (ctx.mood && r.moods?.[ctx.mood] !== undefined) w *= r.moods[ctx.mood];
      if (w <= 0) continue;
      // What it does there: the first thing it may do of what the thing offers (beyond looking and going)
      // (never "use" on its own: switching your things is done when you ask)
      const act = ["touch", "play", "read", "water", "sit", "lean", "write", "tidy"].find((x) => def.actions.includes(x) && canDo(this.eff.room, "auto", a.id, x, ctxRules).ok) || "look";
      options.push({ a, w, act });
    }
    if (!options.length) return false;
    let pick = this.random() * options.reduce((s, o) => s + o.w, 0);
    const choice = options.find((o) => (pick -= o.w) <= 0) || options[options.length - 1];
    if (!this.visit(choice.a, choice.act, "visit")) return false;
    this.visits.all.push(this.t);
    this.visits.session++;
    this.visits.last = this.t;
    this.visits.per.get(choice.a.id).push(this.t);
    return true;
  }

  quiet(key, vars) {
    this.say(key, vars);
    return false;
  }

  // ---------- Moving along ----------
  move(dt, ctx) {
    const mv = this.room.robot.movement;
    const task = this.task;
    let want = 0;
    let faceTo = task?.face ?? null;
    if (task?.kind === "go") {
      const p = task.points[task.i];
      if (!p) this.arrive();
      else {
        const d = dist(this.pos, p);
        if (d < ARRIVE * 2) task.i++;
        else {
          // Slower in slow zones and near fragile things
          const zones = zonesAt(this.eff.room, this.pos[0], this.pos[1]);
          let k = 1;
          if (zones.some((z) => z.kind === "slow")) {
            k = SLOW_ZONE;
            this.say("Slowed down: slow zone");
          }
          const target = task.asset && this.eff.room.assets.find((a) => a.id === task.asset);
          if (target && (target.rules?.fragile || entryFor(target.type)?.fragile) && dist(this.pos, task.points[task.points.length - 1]) < 1) k = Math.min(k, FRAGILE);
          if (ctx.reducedMotion) k = Math.min(k, 0.6);
          want = mv.speed * k;
          // Slow down to arrive
          const left = this.remaining();
          want = Math.min(want, Math.sqrt(2 * mv.accel * Math.max(0, left)) + 0.05);
          faceTo = facingTo(this.pos, p);
          // Moves only once it roughly faces the way (it turns on the spot first)
          const off = Math.abs(wrap(faceTo - this.yaw));
          if (off > 60) want = 0;
          const step = Math.min(d, Math.max(0, this.speed) * dt);
          this.pos = [this.pos[0] + ((p[0] - this.pos[0]) / d) * step, this.pos[1] + ((p[1] - this.pos[1]) / d) * step];
        }
      }
    } else if (task?.kind === "dwell") {
      // Done with it: a moment, then home (decideIdle)
      if (this.t >= task.until) {
        this.next.home = this.t + this.room.robot.autonomy.homeReturnSec;
        this.why = "after";
        this.task = { kind: "hold", face: this.yaw };
      }
    } else if (task?.kind === "route") {
      this.stepRoute(dt, ctx);
      want = this.speed;
      faceTo = this.task?.face ?? faceTo;
    }
    // Accelerate and brake
    const a = mv.accel * dt;
    if (this.task?.kind !== "route") this.speed = want > this.speed ? Math.min(want, this.speed + a) : Math.max(want, this.speed - a * 1.5);
    // Turn
    if (faceTo !== null && faceTo !== undefined) {
      const turn = (ctx.reducedMotion ? Math.min(mv.turn, 90) : mv.turn) * dt;
      const off = wrap(faceTo - this.yaw);
      this.yaw = wrap(this.yaw + clamp(off, -turn, turn));
    }
  }

  remaining() {
    const t = this.task;
    if (t?.kind !== "go") return 0;
    let sum = dist(this.pos, t.points[t.i] || this.pos);
    for (let i = t.i; i < t.points.length - 1; i++) sum += dist(t.points[i], t.points[i + 1]);
    return sum;
  }

  arrive() {
    const t = this.task;
    this.speed = 0;
    if (t.then?.kind === "dwell") {
      this.task = { kind: "dwell", until: this.t + t.then.dwell, asset: t.then.asset, action: t.then.action, face: t.face };
      const a = this.eff.room.assets.find((x) => x.id === t.then.asset);
      if (a && t.then.action !== "look" && t.then.action !== "go") {
        this.say("Using the {name}: {action}", { name: displayName(a), action: t.then.action });
        this.onAction?.({ assetId: a.id, action: t.then.action });
      }
      return;
    }
    if (this.why === "route") return;
    this.task = { kind: "hold", face: t.face };
    if (this.why === "home") this.say("Home");
  }

  stepRoute(dt, ctx) {
    const t = this.task;
    const r = this.room.robot.routes.find((x) => x.id === t.route);
    if (!r || !r.points.length) return this.goHome("route");
    const pt = r.points[t.idx];
    if (!t.leg) {
      const p = findPath(this.grid, this.pos, pt.pos, { smooth: this.room.robot.movement.path });
      if (!p.ok) {
        this.say("No path to point {n} of the route", { n: t.idx + 1 });
        return this.nextRoutePoint(r);
      }
      t.leg = { points: p.points, i: 1 };
    }
    if (t.dwellUntil >= 0) {
      this.speed = 0;
      if (this.t >= t.dwellUntil) this.nextRoutePoint(r);
      return;
    }
    // Walk the leg
    const p = t.leg.points[t.leg.i];
    const mv = this.room.robot.movement;
    if (!p) {
      t.dwellUntil = this.t + pt.dwell;
      const look = pt.look && this.eff.room.assets.find((a) => a.id === pt.look);
      if (look) {
        const lp = anchorPoint(this.eff.room, look, "look");
        t.face = facingTo(this.pos, [lp[0], lp[2]]);
      }
      if (pt.action?.asset && pt.action.action) {
        const ok = canDo(this.room, "auto", pt.action.asset, pt.action.action, { ...ctx, hidden: this.eff.hidden });
        if (ok.ok) this.onAction?.({ assetId: pt.action.asset, action: pt.action.action });
        else this.say("Skipped a step of the route: {why}", { why: { reason: ok.reason, name: displayName(this.eff.room.assets.find((a) => a.id === pt.action.asset) || { type: "" }), action: pt.action.action } });
      }
      if (pt.action?.gesture) this.onAction?.({ gesture: pt.action.gesture });
      return;
    }
    const d = dist(this.pos, p);
    if (d < ARRIVE * 2) {
      t.leg.i++;
      return;
    }
    t.face = facingTo(this.pos, p);
    const off = Math.abs(wrap(t.face - this.yaw));
    const slow = zonesAt(this.eff.room, this.pos[0], this.pos[1]).some((z) => z.kind === "slow") ? SLOW_ZONE : 1;
    const want = off > 60 ? 0 : mv.speed * slow * (ctx.reducedMotion ? 0.6 : 1);
    this.speed = want > this.speed ? Math.min(want, this.speed + mv.accel * dt) : Math.max(want, this.speed - mv.accel * dt * 1.5);
    const step = Math.min(d, this.speed * dt);
    this.pos = [this.pos[0] + ((p[0] - this.pos[0]) / d) * step, this.pos[1] + ((p[1] - this.pos[1]) / d) * step];
  }

  nextRoutePoint(r) {
    const t = this.task;
    t.leg = null;
    t.dwellUntil = -1;
    const n = r.points.length;
    if (r.mode === "random") t.idx = n > 1 ? (t.idx + 1 + Math.floor(this.random() * (n - 1))) % n : 0;
    else if (r.mode === "ping_pong") {
      if (t.idx + t.dir >= n || t.idx + t.dir < 0) t.dir = -t.dir;
      t.idx += t.dir;
    } else t.idx++;
    if (t.idx >= n || t.idx < 0) {
      if (r.mode === "once") {
        this.say("Route done: {name}", { name: r.name || r.id });
        this.why = "after";
        this.next.home = this.t + this.room.robot.autonomy.homeReturnSec;
        this.task = { kind: "hold", face: this.yaw };
        return;
      }
      t.idx = 0;
    }
  }

  // ---------- What it shows ----------
  output(state = "idle", ctx = {}, { away = false, filming = false } = {}) {
    const robot = this.room?.robot;
    if (!robot) return { x: 0, z: 0.15, yaw: 0, posture: { kind: "stand", asset: null, point: null }, gaze: { mode: "you", point: null }, hover: 0, stance: "upright", speed: 0, moving: false, quiet: false, sleeping: false, path: [] };
    const key = away ? "away" : state === "thinking" ? "idle" : state;
    // Posture: sit, lean or rest only once it's there (and the thing is)
    const want = robot.posture[key] || robot.posture.idle;
    let posture = { kind: "stand", asset: null, point: null };
    const settled = !this.task || this.task.kind === "hold" || this.task.kind === "dwell";
    if (want.kind === "rest" && away && settled) posture = { kind: "rest", asset: want.asset, point: null };
    else if ((want.kind === "sit" || want.kind === "lean") && want.asset && settled) {
      const a = this.eff.room.assets.find((x) => x.id === want.asset && !this.eff.hidden.has(x.id));
      const p = a && anchorPoint(this.eff.room, a, want.kind);
      if (p && dist(this.pos, standPoint(this.eff.room, a)) < 0.6) posture = { kind: want.kind, asset: a.id, point: p };
    }
    // Gaze: the state's settings; "task" looks where it's going or at what it's using
    const gk = state === "away" ? "idle" : ["talking", "listening", "thinking"].includes(state) ? state : "idle";
    const g = robot.gaze[gk];
    let point = null;
    let mode = g.mode;
    if (filming && robot.states.filming.steadyGaze) mode = "camera";
    else if (mode === "task") {
      const t = this.task;
      const asset = t?.asset && this.eff.room.assets.find((a) => a.id === t.asset);
      if (asset) point = anchorPoint(this.eff.room, asset, "look");
      else if (t?.kind === "go" && t.points[t.i]) point = [t.points[t.i][0], 0.7, t.points[t.i][1]];
      else mode = "natural";
    } else if (mode === "asset") {
      const asset = g.asset && this.eff.room.assets.find((a) => a.id === g.asset && !this.eff.hidden.has(a.id));
      point = asset ? anchorPoint(this.eff.room, asset, "look") : null;
      if (!point) mode = "natural";
    } else if (mode === "point") point = [...g.point];
    if (state === "thinking" && robot.states.thinking === "look_up") {
      mode = "point";
      point = [this.pos[0], 2.4, this.pos[1] + 0.6];
    }
    const quiet = zonesAt(this.eff.room, this.pos[0], this.pos[1]).some((z) => z.kind === "quiet");
    const hover = HOVER_HEIGHTS.find((x) => x.id === robot.posture.hover)?.lift ?? 0;
    return {
      x: this.pos[0],
      z: this.pos[1],
      yaw: this.yaw,
      posture,
      gaze: { mode, point, headWeight: g.headWeight, eyeWeight: g.eyeWeight, lookAway: g.lookAway, dontStare: g.dontStare, headLimit: g.headLimit },
      hover,
      stance: robot.posture.stance,
      gait: robot.movement.gait,
      banking: robot.movement.banking,
      speed: this.speed,
      moving: this.speed > 0.02,
      quiet,
      sleeping: this.sleeping,
      roam: !filming && !ctx.reducedMotion && robot.movement.freedom !== "stay" && robot.autonomy.preset !== "statue",
      path: this.task?.kind === "go" ? this.task.points.slice(this.task.i - 1) : this.task?.leg ? this.task.leg.points.slice(this.task.leg.i - 1) : [],
      why: this.why,
    };
  }
}

// The words of the event log (for the i18n scanner)
export function labels() {
  return [
    "No path to {name}: blocked by the {by}", "No path to {name}", "Back home", "Home", "Going to {name}", "Going to the {name}", "Not doing it: {why}",
    "Following the route {name}", "Staying put: filming", "Night: resting", "You're away: going to rest", "Asleep",
    "Not visiting: the session's limit is reached", "Not visiting: {n} visits this hour already", "Skipped the {name}: Never",
    "Slowed down: slow zone", "Using the {name}: {action}", "No path to point {n} of the route", "Skipped a step of the route: {why}", "Route done: {name}",
  ];
}
