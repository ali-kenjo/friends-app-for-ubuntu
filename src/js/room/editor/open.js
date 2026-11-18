// ---------- Every way into the Room Editor ----------
// Buttons carry data-edit-room ("" picks the form: the compact overlay over voice mode, full screen
// elsewhere); the palette and the voice dock call editRoom(). The editor's code (and three.js's editing
// helpers) load the first time it opens. Coming from the Robot Studio, the Studio comes back after.
import { t } from "../../i18n.js";
import { announce } from "../../a11y.js";
import { bus, EVENTS } from "../../core/event-bus.mjs";
import { isStudioOpen, closeStudio, openStudio } from "../../robot/studio/studio.js";

let opening = null;

const voiceOpen = () => {
  const v = document.getElementById("voice-mode");
  return Boolean(v && !v.hidden);
};

// robot: open with the robot selected (its home, gaze, movement, routes and rules)
export async function editRoom({ mode, robot = false } = {}) {
  if (opening) return opening;
  const fromStudio = isStudioOpen();
  if (fromStudio) closeStudio();
  document.getElementById("voice-scene-pop")?.setAttribute("hidden", "");
  document.getElementById("voice-scene")?.setAttribute("aria-expanded", "false");
  opening = (async () => {
    try {
      const m = await import("./editor.js");
      const ed = await m.openRoomEditor({ mode: mode || (voiceOpen() ? "overlay" : "full") });
      if (ed && robot) ed.selectRobot();
      if (ed && fromStudio) document.addEventListener("friends:room-editor-closed", () => openStudio("room"), { once: true });
      return ed;
    } catch (err) {
      console.error(err);
      announce(t("The room editor couldn't open."));
      if (fromStudio) openStudio("room");
      return null;
    } finally {
      opening = null;
    }
  })();
  return opening;
}

document.addEventListener("click", (e) => {
  const opener = e.target.closest?.("[data-edit-room]");
  if (!opener) return;
  e.preventDefault();
  editRoom({ mode: opener.dataset.editRoom || undefined, robot: opener.hasAttribute("data-edit-robot") });
});

// The voice dock's "Edit room" button
bus.on(EVENTS.DOCK_ACTION, (ev) => {
  if (ev?.action === "edit_room") editRoom();
});
