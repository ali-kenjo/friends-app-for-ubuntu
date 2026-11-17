// ---------- A room document as the 1.0 room object ----------
// Pure. For the parts that still speak 1.0 (the old place builders inside RoomRenderer, and the Robot
// Studio's Room tab until the Room Editor replaces it, PLAN step 5).
import { sanitizeRoom, roomFor, PLACE_BY_ID } from "../robot/room.mjs";

const OLD_LIGHTS = ["studio", "day", "golden", "evening", "night", "neon", "fireside"];

// What a 1.0 place builder needs, from a room document that still has a legacy block
export function legacyRoomOf(room) {
  const l = room.legacy;
  const a = room.atmosphere;
  return sanitizeRoom({
    place: l.place,
    colors: { ...room.architecture.palette },
    light: l.light && l.light !== "auto" ? l.light : OLD_LIGHTS.includes(a.mood) ? a.mood : "auto",
    brightness: a.brightness,
    floor: l.floor,
    air: a.air,
    airAmount: a.airAmount,
    props: l.props,
    companions: l.companions,
    timeMode: a.timeMode === "clock" ? "clock" : "manual",
    timeHour: a.timeHour,
    weatherSync: a.weatherSync,
    season: a.season,
    sign: l.sign,
    photo: room.architecture.photo,
  });
}

// settings.robot.room (a reference or a 1.0 object) → a 1.0 object; doc: the loaded room document
export function asLegacy(room, doc) {
  if (!room?.layoutId) return room;
  if (doc?.id === room.layoutId) {
    if (doc.legacy) return legacyRoomOf(doc);
    if (doc.backdrop?.layer === "chroma_green") return roomFor("green");
    if (doc.backdrop?.layer === "chroma_blue") return roomFor("blue");
    const base = roomFor(PLACE_BY_ID[doc.template] ? doc.template : "studio");
    return sanitizeRoom({ ...base, brightness: doc.atmosphere.brightness, air: doc.atmosphere.air, airAmount: doc.atmosphere.airAmount, season: doc.atmosphere.season });
  }
  return roomFor("studio");
}
