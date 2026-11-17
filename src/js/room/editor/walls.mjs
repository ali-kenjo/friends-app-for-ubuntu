// Which wall a point is nearest to, and how a thing on that wall faces (pure; shared by the editor's
// placing code and the renderer's architecture, which has the same rules for wall openings).
export const WALL_FACING = { back: 0, front: 180, left: 90, right: -90 };

export function wallOfPoint(room, x, z) {
  const { w, d } = room.size;
  const dist = { back: Math.abs(z + d / 2), front: Math.abs(z - d / 2), left: Math.abs(x + w / 2), right: Math.abs(x - w / 2) };
  return Object.entries(dist).sort((a, b) => a[1] - b[1])[0][0];
}

// The nearest wall that exists (null when the room has none)
export function nearestWall(room, x, z) {
  const { w, d } = room.size;
  const walls = room.architecture.walls;
  const list = [["back", Math.abs(z + d / 2)], ["front", Math.abs(z - d / 2)], ["left", Math.abs(x + w / 2)], ["right", Math.abs(x - w / 2)]].filter(([s]) => walls[s]);
  list.sort((a, b) => a[1] - b[1]);
  return list[0]?.[0] || null;
}

// A point on a wall's inner face: u along the wall from its middle, y up
export function wallPoint(room, side, u, y) {
  const { w, d } = room.size;
  if (side === "back") return [u, y, -d / 2];
  if (side === "front") return [-u, y, d / 2];
  if (side === "left") return [-w / 2, y, -u];
  return [w / 2, y, u];
}
