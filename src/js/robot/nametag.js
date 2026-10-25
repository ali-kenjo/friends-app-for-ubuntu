// A small label with the character's name under the robot (Settings → Robot → Overview → Name tag),
// on Home, next to your chat, in voice mode and beside the whiteboard.
import { getSettings, onSettings } from "../store.js";
import { characterName } from "../characters.js";

const HOSTS = ["home-robot-stage", "robot-dock-stage", "voice-robot", "robot-preview"];
const tags = new Map();

function tagFor(id) {
  const host = document.getElementById(id);
  if (!host) return null;
  let tag = tags.get(id);
  if (!tag || !host.contains(tag)) {
    tag = document.createElement("div");
    tag.className = "robot-name-tag";
    tag.setAttribute("aria-hidden", "true"); // the name is already everywhere else for screen readers
    host.append(tag);
    tags.set(id, tag);
  }
  return tag;
}

function update() {
  const on = Boolean(getSettings()?.robot?.nameTag);
  const name = characterName();
  for (const id of HOSTS) {
    const tag = on ? tagFor(id) : tags.get(id);
    if (!tag) continue;
    tag.hidden = !on;
    tag.textContent = name;
  }
}

onSettings(update);
document.addEventListener("friends:robot-ready", update);
