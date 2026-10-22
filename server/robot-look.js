// The robot's look: what it looks like (design) and what's around it (room). The
// shapes of both, their choices and how a saved one is cleaned live in
// src/js/robot/design.mjs and room.mjs, which the page uses too (plain ES modules
// with no browser parts), so the two sides can't drift apart.
const design = require("../src/js/robot/design.mjs");
const room = require("../src/js/robot/room.mjs");
const catalog = require("../src/js/robot/room-catalog.mjs");

const MAX_LOOKS = 24;
const MAX_ROOMS = 24;
const MAX_CAMERA_MOVES = 12;
const clone = (v) => JSON.parse(JSON.stringify(v));

// One saved look: a name, a design and a room
function cleanLook(input, id) {
  const l = input && typeof input === "object" ? input : {};
  const out = {
    id: /^[\w-]{1,40}$/.test(l.id) ? l.id : id,
    name: typeof l.name === "string" ? l.name.replace(/\s+/g, " ").trim().slice(0, 40) || "My look" : "My look",
    design: design.sanitizeDesign(l.design),
    room: room.sanitizeRoom(l.room),
  };
  if (typeof l.thumb === "string" && l.thumb.startsWith("data:image/") && l.thumb.length < 40000) {
    out.thumb = l.thumb;
  }
  return out;
}

// settings.robot.looks, cleaned: at most 24, each id used once
function cleanLooks(list) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    if (out.length >= MAX_LOOKS) break;
    const look = cleanLook(item, `look-${Date.now().toString(36)}-${out.length}`);
    if (seen.has(look.id)) continue;
    seen.add(look.id);
    out.push(look);
  }
  return out;
}

// One saved custom room (B.14): up to 24 named rooms
function cleanCustomRoom(input, id) {
  const r = input && typeof input === "object" ? input : {};
  const out = {
    id: /^[\w-]{1,40}$/.test(r.id) ? r.id : id,
    name: typeof r.name === "string" ? r.name.replace(/\s+/g, " ").trim().slice(0, 40) || "My room" : "My room",
    room: room.sanitizeRoom(r.room),
  };
  if (typeof r.thumb === "string" && r.thumb.startsWith("data:image/") && r.thumb.length < 40000) {
    out.thumb = r.thumb;
  }
  return out;
}

function cleanCustomRooms(list) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    if (!item || typeof item !== "object") continue;
    if (out.length >= MAX_ROOMS) break;
    const entry = cleanCustomRoom(item, `room-${Date.now().toString(36)}-${out.length}`);
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

// Saved custom camera moves (B.15)
function cleanCameraMoves(list) {
  const seen = new Set();
  const out = [];
  const clamp = (n, lo, hi, def) => (Number.isFinite(Number(n)) ? Math.min(hi, Math.max(lo, Math.round(Number(n) * 1000) / 1000)) : def);
  for (const item of Array.isArray(list) ? list : []) {
    if (!item || typeof item !== "object") continue;
    if (out.length >= MAX_CAMERA_MOVES) break;
    const id = /^[\w-]{1,40}$/.test(item.id) ? item.id : `cam-${Date.now().toString(36)}-${out.length}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: typeof item.name === "string" ? item.name.replace(/\s+/g, " ").trim().slice(0, 40) || "Camera move" : "Camera move",
      shot: typeof item.shot === "string" ? item.shot.slice(0, 24) : "medium",
      view: typeof item.view === "string" ? item.view.slice(0, 24) : "front",
      yaw: clamp(item.yaw, -Math.PI, Math.PI, 0),
      pitch: clamp(item.pitch, -0.8, 0.8, 0),
      zoom: clamp(item.zoom, 0.5, 2, 1),
    });
  }
  return out;
}

// Older settings kept a shell color name, eye style and mouth switch (robot.shell, .eyes,
// .mouth) and a background (robot.background): they become the design and the room
function upgradeRobot(robot) {
  if (!robot || typeof robot !== "object") return robot;
  const next = { ...robot };
  if (!next.design) next.design = design.designFromLegacy(robot);
  if (!next.room) next.room = room.roomFromLegacy(robot.background);
  return next;
}

module.exports = {
  design, room, catalog,
  MAX_LOOKS, MAX_ROOMS, MAX_CAMERA_MOVES,
  clone, cleanLook, cleanLooks, cleanCustomRoom, cleanCustomRooms, cleanCameraMoves, upgradeRobot,
};
