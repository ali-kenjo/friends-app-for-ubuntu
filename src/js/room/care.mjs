// ---------- Plants that need care (room/care.mjs) ----------
// Pure. With "Plants need care" on (the robot → On its own; off by default), each plant (a thing that can be
// watered) remembers when it was last watered (asset.care.wateredAt) and slowly droops over real days; the robot
// prefers a thirsty plant when it visits things on its own, and watering it starts the clock again. This is 1.0's
// vase hydration for every plant.
import { entryFor } from "./catalog.mjs";

export const THIRSTY_DAYS = 3; // from just watered to fully drooping
const DAY = 86400000;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export const isPlant = (asset) => Boolean(entryFor(asset?.type)?.actions?.includes("water"));

// 0 (just watered) … 1 (drooping); always 0 with plant care off or for things that aren't plants
export function thirst(room, asset, now = Date.now()) {
  if (!room?.robot?.autonomy?.plantCare || !isPlant(asset)) return 0;
  const at = asset.care?.wateredAt || room.updatedAt || room.createdAt || now;
  return clamp01((now - at) / (THIRSTY_DAYS * DAY));
}

// Thirsty enough that it should be watered (and that the AI is told it looks thirsty)
export const isThirsty = (room, asset, now) => thirst(room, asset, now) >= 0.5;

// The room with the plant watered now
export function water(room, assetId, now = Date.now()) {
  return { ...room, assets: room.assets.map((a) => (a.id === assetId && isPlant(a) ? { ...a, care: { wateredAt: now } } : a)) };
}

// Cleaning what's saved: a time, not in the future
export function cleanCare(raw, now = Date.now()) {
  const at = Number(raw?.wateredAt);
  return Number.isFinite(at) && at > 0 ? { wateredAt: Math.min(at, now) } : null;
}
