// ---------- What the robot may do with each thing: one permission model ----------
// Pure. The behaviour engine (on its own), the AI tools (when you ask) and the editor all ask canDo():
//
//   canDo(room, actor, assetId, action, context) → { ok, reason, message }
//     actor    "auto" (on its own) | "ai" (an AI tool call) | "user" (the editor's test buttons)
//     context  { ai, filming, privateMode, now, scene, hidden, personalInFilming }
//              ai: the robot-level switches { mood, gestures, move, look, use, rearrange }
//
// It combines the thing's rules (permission, allowed actions, fragile), the scene's overrides, zones,
// the AI switches, filming mode, Private mode and personal-data flags.
import { CATALOG_BY_ID } from "./catalog.mjs";
import { LOOK_ACTIONS, ACTIONS } from "./choices.mjs";
import { worldTransform, displayName } from "./model.mjs";
import { effectiveRoom } from "./schedule.mjs";
import { zonesAt, standPoint } from "./nav.mjs";

export const DEFAULT_AI = { mood: true, gestures: true, move: true, look: true, use: true, rearrange: "ask" };
export const REARRANGE = ["off", "ask", "allowed"];

// Which AI switch an action needs
export function aiSwitchFor(action) {
  if (action === "look") return "look";
  if (action === "go") return "move";
  if (action === "point") return "gestures";
  return "use";
}

// The reasons, as the AI says them out loud ({name}: the thing, {action}: what it was asked)
export const REASONS = {
  not_found: "There's no {name} in the room.",
  not_here: "The {name} isn't in the room right now.",
  unsupported: "I can't {action} the {name}.",
  never: "I'm not allowed to do anything with the {name}.",
  look_only: "I'm only allowed to look at the {name}, not touch it.",
  only_when_asked: "I only do that with the {name} when you ask me.",
  action_off: "I'm not allowed to {action} the {name}.",
  ai_off: "I'm not allowed to {action} things right now.",
  fragile: "The {name} is fragile, so I won't carry it.",
  nogo: "The {name} is in a place I'm not allowed to go.",
  filming: "I stay put while we're filming.",
  private: "The {name} shows your own things, and Private mode is on.",
  personal_off: "The {name} shows your own things, and that's switched off.",
  statue: "I'm set to stay still.",
};

export function explain(result, { name = "", action = "", say = null } = {}) {
  if (result.ok) return "";
  const label = ACTIONS.find((a) => a.id === action)?.label || action;
  const words = (say ? say(label) : label).toLowerCase();
  const tpl = REASONS[result.reason] || REASONS.unsupported;
  const vars = { name, action: words };
  return say ? say(tpl, vars) : tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

const no = (reason) => ({ ok: false, reason });
const yes = { ok: true, reason: "" };

export function canDo(room, actor, assetId, action, context = {}) {
  const ctx = { ai: DEFAULT_AI, filming: false, privateMode: false, ...context };
  // The room as it is now (scene overrides, schedules), unless the caller already worked that out
  let current = room;
  let hidden = ctx.hidden;
  if (!hidden) {
    const eff = effectiveRoom(room, ctx);
    current = eff.room;
    hidden = eff.hidden;
  }
  const asset = current.assets.find((a) => a.id === assetId);
  if (!asset) return no("not_found");
  if (hidden.has(asset.id)) return no("not_here");
  const def = CATALOG_BY_ID[asset.type] || null;
  const supported = def?.actions || ["look"];
  if (!supported.includes(action)) return no("unsupported");
  const rules = asset.rules || {};
  const perm = rules.permission || "free";
  if (actor === "user") return yes; // the editor's buttons try any action the thing has
  if (perm === "never") return no("never");
  if (perm === "look" && !LOOK_ACTIONS.has(action)) return no("look_only");
  if (perm === "ask" && actor === "auto") return no("only_when_asked");
  if (Array.isArray(rules.actions) && !rules.actions.includes(action)) return no("action_off");
  if (actor === "ai" && ctx.ai && ctx.ai[aiSwitchFor(action)] === false) return no("ai_off");
  if (actor === "auto") {
    const preset = current.robot?.autonomy?.preset;
    if (preset === "statue" && action !== "look") return no("statue");
    if (ctx.filming && current.robot?.states?.filming?.stay !== false && action !== "look") return no("filming");
  }
  if (action === "carry" && (rules.fragile || def?.fragile)) return no("fragile");
  if (def?.personalData && (action === "read" || action === "write")) {
    if (ctx.privateMode) return no("private");
    if (!personalOn(asset)) return no("personal_off");
  }
  // Going there: the place it would stand must not be in a no-go zone
  if (action !== "look" && action !== "point") {
    const at = standPoint(current, asset);
    if (at && zonesAt(current, at[0], at[1]).some((z) => z.kind === "nogo")) return no("nogo");
  }
  return yes;
}

// Is a personal-data thing switched on to show your own things?
export function personalOn(asset) {
  const s = asset.state || {};
  return Boolean(s.mirror || s.showNotes || s.showPhotos || s.showEvents || s.showInbox);
}

// For the behaviour engine: may it visit/look at this thing on its own at all?
export function autonomousCandidates(room, context = {}) {
  const eff = effectiveRoom(room, context);
  const out = [];
  for (const a of eff.room.assets) {
    if (eff.hidden.has(a.id)) continue;
    const perm = a.rules?.permission || "free";
    if (perm === "never" || perm === "ask") continue;
    if ((a.rules?.weight ?? 50) <= 0) continue;
    out.push(a);
  }
  return out;
}

// Everything the robot may do with each thing, for the AI's room block and the inspector
export function permissionTable(room, actor, context = {}) {
  const eff = effectiveRoom(room, context);
  const ctx = { ...context, hidden: eff.hidden };
  return eff.room.assets
    .filter((a) => !eff.hidden.has(a.id))
    .map((a) => {
      const def = CATALOG_BY_ID[a.type];
      const allowed = (def?.actions || []).filter((act) => canDo(eff.room, actor, a.id, act, ctx).ok);
      return { id: a.id, name: displayName(a), permission: a.rules?.permission || "free", allowed, where: worldTransform(eff.room, a) };
    });
}

export function labels() {
  return Object.values(REASONS);
}
