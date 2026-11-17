// ---------- The page's side of the rooms store ----------
// Small helpers over /api/rooms for the parts of the page that pick rooms (the place pickers, the Studio).
import { updateSettings } from "../store.js";

export async function listRooms() {
  const res = await fetch("/api/rooms");
  return res.ok ? res.json() : { rooms: [], templates: [] };
}

// The room made from a template: the one already made from it (the most recent), or a new one
export async function roomForTemplate(templateId) {
  const { rooms } = await listRooms();
  const existing = rooms.find((r) => r.template === templateId);
  if (existing) return existing.id;
  const res = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: templateId }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "The room couldn't be made");
  return (await res.json()).id;
}

// Show a template's room around the robot
export async function useTemplate(templateId) {
  const id = await roomForTemplate(templateId);
  await updateSettings((s) => (s.robot.room = { layoutId: id }));
  return id;
}
