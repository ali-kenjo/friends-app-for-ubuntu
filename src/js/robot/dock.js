// ---------- The robot on Home, and next to your text chats ----------
// Before you've said anything, Home shows the robot big under the top bar, with a greeting (the
// "home" host). Once a conversation is open it moves to a small corner of its own (the "dock"):
// A small live robot in the bottom right corner. It only uses the empty space
// beside the centered chat column, so it never covers messages or the
// composer: it gets smaller as that space shrinks and hides when there's
// none (or the window is under 760 px). You can fold it away; that's
// remembered. It draws nothing while folded, hidden or behind voice mode.
import { robot } from "./index.js";
import { getSettings, onSettings } from "../store.js";

const main = document.getElementById("main");
const dock = document.getElementById("robot-dock");
const stage = document.getElementById("robot-dock-stage");
const foldButton = document.getElementById("robot-dock-toggle");
const openButton = document.getElementById("robot-dock-open");
const voiceMode = document.getElementById("voice-mode");
const narrow = window.matchMedia("(max-width: 760px)");
const homeRobot = document.getElementById("home-robot");
const homeStage = document.getElementById("home-robot-stage");

// Sizes, biggest first: [name, width, height]; each needs its width + 32 px of space
const SIZES = [
  ["large", 176, 204],
  ["compact", 132, 156],
  ["tiny", 96, 116],
];
const COLUMN = { chat: 760, welcome: 700 }; // the centered content's width (style.css)

let folded = false;
try {
  folded = localStorage.getItem("friends.robotDock") === "folded";
} catch {}

robot.host("dock", stage, { priority: 1, shot: "dock", background: "dock", position: "center", cinematic: false });
// Home's big robot paints the page's own colors with a stronger glow behind it
robot.host("home", homeStage, { priority: 2, shot: "dock", background: "dock", position: "center", cinematic: false, glowBoost: 2.4 });

// How much room is free beside the centered column
function freeSpace() {
  const column = COLUMN.chat;
  return (main.clientWidth - column) / 2;
}

let size = null;
function update() {
  const on = Boolean(getSettings()?.robot?.chatDock) && !robot.unavailable;
  // Home (nothing said yet): the big robot, or its face as a picture when the 3D one is off or can't start
  const onHome = !main.hidden && !main.classList.contains("has-chat");
  const homeLive = on && onHome && voiceMode.hidden;
  robot.show("home", homeLive);
  homeRobot.dataset.live = String(homeLive && Boolean(robot.engine));
  const room = freeSpace();
  size = narrow.matches ? null : SIZES.find(([, w]) => room >= w + 32) || null;
  const fits = on && Boolean(size) && !main.hidden && main.classList.contains("has-chat");
  dock.hidden = !fits || folded;
  openButton.hidden = !fits || !folded;
  if (size) {
    dock.dataset.size = size[0];
    dock.style.setProperty("--dock-w", `${size[1]}px`);
    dock.style.setProperty("--dock-h", `${size[2]}px`);
  }
  robot.show("dock", fits && !folded && voiceMode.hidden);
}

function setFolded(value) {
  folded = value;
  try {
    localStorage.setItem("friends.robotDock", folded ? "folded" : "open");
  } catch {}
  update();
  (folded ? openButton : foldButton).focus({ preventScroll: true });
}

foldButton.addEventListener("click", () => setFolded(true));
openButton.addEventListener("click", () => setFolded(false));

// Say hi: a click (or Enter) on the robot makes it wave
for (const el of [stage, homeRobot]) {
  el.addEventListener("click", () => robot.director.toolEvent({ gesture: "wave" }));
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      robot.director.toolEvent({ gesture: "wave" });
    }
  });
}

new ResizeObserver(update).observe(main);
new MutationObserver(update).observe(main, { attributes: true, attributeFilter: ["class", "hidden"] });
document.addEventListener("friends:robot-ready", update);
new MutationObserver(update).observe(voiceMode, { attributes: true, attributeFilter: ["hidden"] });
narrow.addEventListener("change", update);
onSettings(update);
document.addEventListener("friends:robot-unavailable", update);

// "Follow my face" is using the camera: a small dot on the dock says so
document.addEventListener("friends:robot-face", (e) => {
  dock.classList.toggle("camera-on", e.detail.state === "on" || e.detail.state === "looking");
});

// The robot is on screen next to the chat (so the AI may be offered its tools)
export const dockShowing = () => (!dock.hidden && robot.engine?.active?.name === "dock") || (homeRobot.dataset.live === "true" && robot.engine?.active?.name === "home");

// A mission is running or waiting (src/js/missions/): the robot looks busy, and the face picture says so
document.addEventListener("friends:missions-active", (e) => {
  const working = e.detail?.running > 0;
  robot.director.working(working);
  homeRobot.classList.toggle("working", working);
});
