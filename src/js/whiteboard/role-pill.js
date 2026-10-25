// The role pill in the chat's top bar and in voice mode: what the robot is to you right now (a teacher, a coach…),
// and a click changes it.
import { h } from "../h.js";
import { t } from "../i18n.js";
import { getSettings, onSettings } from "../store.js";
import { activeRole } from "../robot/roles.mjs";
import { wbIcon } from "./wb-icons.js";
import { openRolePicker, roleName } from "./robotwin.js";
import { board } from "./store.js";

for (const id of ["role-pill", "voice-role"]) {
  const pill = document.getElementById(id);
  if (!pill) continue;
  const draw = () => {
    const role = activeRole(getSettings()?.roles);
    pill.replaceChildren(h("span", { class: "wb-icon", html: wbIcon(role.icon || "star", 16) }), h("span", { class: "role-pill-name" }, roleName(role)), h("span", { html: wbIcon("chevronDown", 12) }));
    pill.setAttribute("aria-label", `${t("What the robot is to you right now")}: ${roleName(role)}`);
  };
  pill.addEventListener("click", () => openRolePicker(pill, { onChange: draw }));
  onSettings(draw);
}

// The Robot item in the sidebar shows what it is doing: busy (thinking, writing on the board) or listening (voice mode)
const dot = document.getElementById("nav-robot-state");
const voiceMode = document.getElementById("voice-mode");
if (dot) {
  const state = () => {
    const voice = voiceMode && !voiceMode.hidden;
    const busy = Boolean(document.querySelector("#messages .msg.pending, #messages .msg.streaming")) || board.writing;
    dot.dataset.state = busy ? "busy" : voice ? "listening" : "";
    dot.title = busy ? t("Working on it") : voice ? t("Listening") : "";
  };
  new MutationObserver(state).observe(document.getElementById("messages"), { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });
  if (voiceMode) new MutationObserver(state).observe(voiceMode, { attributes: true, attributeFilter: ["hidden"] });
  for (const ev of ["status", "reveal"]) board.on(ev, state);
}
