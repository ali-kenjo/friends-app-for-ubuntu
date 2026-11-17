// The rooms scripts/room-shots.js photographs, and how each is put into the settings.
// Every place, and the three v1 presets (shown in the Studio place, where 1.0 drew them).
import { PLACES, roomFor } from "../../src/js/robot/room.mjs";

const V1_PRESETS = ["creator_studio_desk", "cozy_study_corner", "minimalist_open_stage"];

const base = (s, { theme, quality }) => ({
  ...s,
  onboarding: { ...(s.onboarding || {}), done: true },
  theme: { ...s.theme, appearance: theme },
  robot: { ...s.robot, chatDock: false, quality },
});

// "legacy": 1.0 room objects in the settings (the before shots); "rooms": a room document made from each
// template through the rooms API, and the settings pointing at it (1.1)
export function roomList(kind = "legacy") {
  if (kind === "rooms") return roomDocs();
  const list = PLACES.map((p) => ({
    id: p.id,
    settings: (s, o) => {
      const out = base(s, o);
      out.robot.room = roomFor(p.id);
      return out;
    },
  }));
  for (const preset of V1_PRESETS) {
    list.push({
      id: `v1-${preset}`,
      settings: (s, o) => {
        const out = base(s, o);
        out.robot.room = roomFor("studio");
        out.roomEditor = { ...(s.roomEditor || {}), presetId: preset, assets: [] };
        return out;
      },
    });
  }
  return list;
}

const made = new Map();
function roomDocs() {
  const ids = [...PLACES.map((p) => p.id), ...V1_PRESETS];
  return ids.map((id) => ({
    id,
    settings: async (s, o, api) => {
      if (!made.has(id)) made.set(id, (await api("POST", "/api/rooms", { template: id })).id);
      const out = base(s, o);
      out.robot.room = { layoutId: made.get(id) };
      return out;
    },
  }));
}
