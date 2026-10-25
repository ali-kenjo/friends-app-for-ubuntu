// Where the board's windows were left (beside the chat, in voice mode, the robot's own): kept in the settings, so they
// are where you put them the next time, and "put everything back" in Settings → Robot works for all of them.
import { getSettings, updateSettings, onSettings } from "../store.js";
import { WINDOWS, cleanGeometry } from "./geometry.mjs";

export const windowGeometry = (id) => getSettings()?.whiteboard?.windows?.[id] || WINDOWS[id];

export function saveWindow(id, geometry) {
  updateSettings((s) => {
    s.whiteboard ||= {};
    s.whiteboard.windows = { ...(s.whiteboard.windows || {}), [id]: geometry };
  });
}

const same = (a, b) => ["mode", "x", "y", "w", "h", "size", "shaded"].every((k) => a[k] === b[k]);

// Keeps a window where the settings say (they change from Settings, or from another place the window is shown)
export function followSettings(win, id) {
  onSettings(() => {
    const wanted = cleanGeometry(windowGeometry(id), WINDOWS[id]);
    if (!same(wanted, win.geometry) && !win.el.classList.contains("moving")) win.set(wanted, { save: false });
  });
}
