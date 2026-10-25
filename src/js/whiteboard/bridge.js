// The robot and the board: what ties the shared whiteboard to the 3D robot.
//   - while the robot writes, its arm follows its pen and it looks at the spot, and you hear the marker;
//   - it looks at what you draw, and at what you point at.
// Everything here is the robot's body: what the AI decides to draw is decided on the helper (server/whiteboard-tools.js).
import { robot } from "../robot/index.js";
import { getSettings } from "../store.js";
import { announce } from "../a11y.js";
import { t } from "../i18n.js";
import { board } from "./store.js";
import { voicePanel } from "./panel.js";

const wb = () => getSettings()?.whiteboard || {};
let lastSound = 0;
let lastLook = 0;

// In voice mode, with the board open beside the robot: the one you are both looking at is on its right
const panelBeside = () => (voicePanel?.sideOfRobot() || 0) !== 0 && robot.engine?.active?.name === "voice";

// Which side of the robot the board is on: the board's own page has it to the robot's left; in voice mode it is beside it
function sideOfBoard() {
  const e = robot.engine;
  if (panelBeside()) return voicePanel.sideOfRobot();
  const host = e?.active?.name;
  return host === "board" ? -1 : 1;
}

const norm = (tip) => ({ x: Math.max(-1, Math.min(1, (tip.x / 1600) * 2 - 1)), y: Math.max(-1, Math.min(1, 1 - (tip.y / 1000) * 2)) });

board.on("frame", followPen);

// ---------- The arm and the eyes ----------
function followPen() {
  if (!board.writing || !board.tip || wb().robotArm === false) return;
  const { x, y } = norm(board.tip);
  robot.director.boardSide(sideOfBoard());
  robot.director.boardWork(x, y, "write");
  // The sound of a marker, now and then
  const now = performance.now();
  if (wb().sound !== false && now - lastSound > 280) {
    lastSound = now;
    robot.sound.play(wb().writingStyle === "chalk" ? "chalk" : "marker");
  }
}

// The robot turns to the board when it starts writing on it
board.on("reveal", (r) => {
  if (!r.start || wb().robotArm === false) return;
  robot.director.boardSide(sideOfBoard());
});

// What it does when somebody else changes the board
board.on("remote", (r) => {
  if (wb().robotArm === false) return;
  const cleared = (r.briefs || []).some((b) => b.verb === "cleared" || b.verb === "removed");
  if (cleared && r.actor !== "user") {
    robot.director.boardSide(sideOfBoard());
    robot.director.boardWork(-0.1, 0.1, "erase");
    if (wb().sound !== false) robot.sound.play("eraser");
  }
});

// It looks at what you draw (a moment, not every point), and at where you point with the pointer tool
board.on("change", (c) => {
  if (!c?.local || wb().robotArm === false || wb().awareness === "off") return;
  const now = performance.now();
  if (now - lastLook < 700) return;
  const op = (c.ops || []).find((o) => o.op === "add" && o.item);
  if (!op) return;
  const it = op.item;
  const x = (it.x ?? it.points?.[0]?.x ?? 800) + (it.width || 0) / 2;
  const y = (it.y ?? it.points?.[0]?.y ?? 500) + (it.height || 0) / 2;
  lastLook = now;
  const n = norm({ x, y });
  robot.animator.lookAt({ x: sideOfBoard() * 0.6, y: n.y * 0.4, duration: 1.6 });
});

board.on("cue", (cue) => {
  if (cue.type === "point_at") {
    if (wb().robotArm !== false) {
      const n = norm({ x: cue.x, y: cue.y });
      robot.director.boardSide(sideOfBoard());
      robot.animator.workBoard({ x: n.x, y: n.y, mode: "point", duration: 3 });
    }
  }
});

// What the robot did to the board is read out to those who can't see it
board.on("remote", (r) => {
  if (r.actor === "user" || document.body.dataset.view === "whiteboard") return;
  const b = (r.briefs || [])[0];
  if (b) announce(t("The robot changed the whiteboard: {what}", { what: `${b.verb} ${b.type || ""} ${b.label || ""}`.trim() }));
});
