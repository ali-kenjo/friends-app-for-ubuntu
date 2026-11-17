// ---------- Your own models: their catalog entries, on the page ----------
// The helper keeps each model (.glb) with a catalog entry the wizard made (server/rooms.js). The page loads
// the entries once and again after a change; the renderer, the editor and the thumbnails look a room's
// "custom:<id>" things up here. "friends:room-custom" tells them the list changed.
import { entryFor, setCustomEntries } from "./catalog.mjs";
import { CUSTOM_PREFIX } from "./model.mjs";

let entries = {};
let loading = null;

export function loadCustomModels({ force = false } = {}) {
  if (loading && !force) return loading;
  loading = fetch("/api/room-assets")
    .then((r) => (r.ok ? r.json() : { assets: [] }))
    .then(({ assets }) => {
      entries = Object.fromEntries((assets || []).map((e) => [e.id, e]));
      setCustomEntries(entries);
      document.dispatchEvent(new CustomEvent("friends:room-custom", { detail: { count: assets.length } }));
      return entries;
    })
    .catch(() => entries);
  return loading;
}

// { id → entry }, for model.sanitizeRoom's `custom`
export const customModels = () => entries;
export const customList = () => Object.values(entries);

// The catalog entry for a thing's type: a built-in one, or one of your models
export const defForType = (type) => entryFor(type);

export const customType = (id) => `${CUSTOM_PREFIX}${id}`;
