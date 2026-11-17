// ---------- Scenes and schedules: which scene is on now, which things are there now ----------
// Pure. A scene is a named variant of a room ("Work", "Chill", "Night", "Filming") that overrides what
// shows, colors, lights, the mood, the robot's home and rules. It is switched by hand, by a schedule
// (time window + weekdays) or by a mode (filming). An asset's own schedule shows it only in a season,
// month, time window, weekday or scene.
import { activeSeason } from "../robot/room.mjs";

const minutes = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// Is `now` inside from..to (minutes of the day)? A window may run past midnight (22:00–06:00).
export function inWindow(from, to, now = new Date()) {
  const a = minutes(from);
  const b = minutes(to);
  if (a === null && b === null) return true;
  const t = now.getHours() * 60 + now.getMinutes();
  if (a !== null && b === null) return t >= a;
  if (a === null && b !== null) return t < b;
  return a <= b ? t >= a && t < b : t >= a || t < b;
}

const weekdayOk = (days, now) => !days?.length || days.includes(now.getDay());

// The hour the room shows (fixed, the real clock, or the template's own)
export function roomHour(room, now = new Date()) {
  const a = room.atmosphere;
  if (a.timeMode === "clock") return now.getHours() + now.getMinutes() / 60;
  if (a.timeMode === "manual") return a.timeHour;
  return a.timeHour ?? 14;
}

// Is it dark in the room? (for lamps that switch on by themselves at dusk)
export function roomIsDark(room, now = new Date(), mood = room.atmosphere.mood) {
  const h = roomHour(room, now);
  if (room.atmosphere.timeMode === "clock" || room.atmosphere.timeMode === "manual") return h >= 18 || h < 7;
  return ["evening", "night", "neon", "fireside"].includes(mood) || h >= 18 || h < 7;
}

// The scene in force: the chosen one, or (on "auto") filming → a "filming" scene, else the first
// scheduled scene whose window and weekday match. "none" means no scene.
export function activeScene(room, { now = new Date(), filming = false } = {}) {
  const scenes = room?.scenes || [];
  if (room?.activeScene === "none") return null;
  if (room?.activeScene && room.activeScene !== "auto") return scenes.find((s) => s.id === room.activeScene) || null;
  if (filming) {
    const f = scenes.find((s) => s.when.kind === "filming");
    if (f) return f;
  }
  return scenes.find((s) => s.when.kind === "schedule" && weekdayOk(s.when.weekdays, now) && inWindow(s.when.from, s.when.to, now)) || null;
}

// Does an asset's own schedule let it show now?
export function scheduleAllows(schedule, { now = new Date(), scene = null, season } = {}) {
  if (!schedule) return true;
  const s = schedule;
  if (s.scenes?.length && !(scene && s.scenes.includes(scene.id))) return false;
  if (s.months?.length && !s.months.includes(now.getMonth() + 1)) return false;
  if (!weekdayOk(s.weekdays, now)) return false;
  if ((s.from || s.to) && !inWindow(s.from, s.to, now)) return false;
  if (s.seasons?.length) {
    const current = season ?? activeSeason("auto", now);
    // A plain season (spring…) also covers its festivals' dates; a festival must match itself
    const plain = { christmas: "winter", new_year: "winter", halloween: "autumn" }[current] || current;
    if (!s.seasons.includes(current) && !s.seasons.includes(plain)) return false;
  }
  return true;
}

// The room as it is right now: the scene's overrides applied, scheduled things in or out.
// Returns { room, scene, hidden:Set } and never changes the room it is given.
export function effectiveRoom(room, ctx = {}) {
  const scene = activeScene(room, ctx);
  const o = scene?.overrides || {};
  const hidden = new Set();
  const assets = room.assets.map((a) => {
    let next = a;
    const patch = {};
    if (o.hidden && a.id in o.hidden) patch.hidden = o.hidden[a.id];
    if (o.colors?.[a.id]) patch.colors = { ...a.colors, ...o.colors[a.id] };
    if (o.lights?.[a.id]) patch.state = { ...a.state, on: o.lights[a.id].on, intensity: o.lights[a.id].intensity };
    if (o.rules?.[a.id]) patch.rules = { ...a.rules, ...o.rules[a.id] };
    // A lamp set to come on at dusk follows the room's light (a scene's own switch wins)
    if (a.light?.auto === "dusk" && a.state && "on" in a.state && !o.lights?.[a.id]) patch.state = { ...a.state, on: roomIsDark(room, ctx.now || new Date(), o.mood || room.atmosphere.mood) };
    if (Object.keys(patch).length) next = { ...a, ...patch };
    if (next.hidden || !scheduleAllows(next.schedule, { ...ctx, scene })) hidden.add(next.id);
    return next;
  });
  // A thing on a hidden thing is hidden with it
  const byId = new Map(assets.map((a) => [a.id, a]));
  for (const a of assets) {
    let p = a.parent ? byId.get(a.parent) : null;
    let guard = 0;
    while (p && guard++ < 16) {
      if (hidden.has(p.id)) {
        hidden.add(a.id);
        break;
      }
      p = p.parent ? byId.get(p.parent) : null;
    }
  }
  const robot = { ...room.robot };
  if (o.home) robot.home = { ...o.home };
  if (o.posture?.idle) robot.posture = { ...robot.posture, idle: { ...o.posture.idle } };
  const atmosphere = o.mood ? { ...room.atmosphere, mood: o.mood } : room.atmosphere;
  return { room: { ...room, assets, robot, atmosphere }, scene, hidden };
}

// When the next scene change happens (for a timer), in ms from now, or null when nothing is scheduled
export function nextChange(room, now = new Date()) {
  const marks = [];
  for (const s of room?.scenes || []) {
    if (s.when.kind !== "schedule") continue;
    for (const hhmm of [s.when.from, s.when.to]) if (hhmm) marks.push(minutes(hhmm));
  }
  for (const a of room?.assets || []) for (const hhmm of [a.schedule?.from, a.schedule?.to]) if (hhmm) marks.push(minutes(hhmm));
  if (!marks.length) return null;
  const t = now.getHours() * 60 + now.getMinutes();
  const ahead = marks.map((m) => (m > t ? m - t : m + 1440 - t));
  const min = Math.min(...ahead);
  return (min * 60 - now.getSeconds()) * 1000;
}
