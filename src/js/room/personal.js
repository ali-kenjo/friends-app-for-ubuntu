// ---------- Your own things on the things in the room (room/personal.js) ----------
// A whiteboard, a notebook, a tablet, a wall calendar and a photo frame can show your own things, each only when
// you switch it on (Room Editor → the thing → How it is; Settings → Robot → Privacy), and not while filming or
// recording unless "Show them while filming" is on (RoomRenderer.applyPersonal decides; this module draws).
// Everything stays on this computer: the pictures are drawn here from what the page already has.
//
// personalTexture(asset) → a canvas texture kept up to date (one per kind; one per photo), or null.
import * as THREE from "three";
import { t } from "../i18n.js";
import { api } from "../api.js";
import { board } from "../whiteboard/store.js";
import { renderPageTo } from "../whiteboard/render.mjs";

const KIND = { mirror: "board", showNotes: "notes", showInbox: "inbox", showEvents: "events", showPhotos: "photo" };
const SIZES = { board: [1024, 640], notes: [380, 500], inbox: [512, 340], events: [288, 336], photo: [512, 384] };
const textures = new Map(); // key → { tex, canvas, draw }
const data = { notes: null, inbox: null, events: null };
let polling = 0;

// Which of your things an asset shows (null: none switched on)
export function personalKind(asset) {
  const s = asset?.state || {};
  for (const [key, kind] of Object.entries(KIND)) if (s[key]) return kind;
  return null;
}

function entry(key, kind, draw) {
  let e = textures.get(key);
  if (!e) {
    const [w, h] = SIZES[kind];
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.userData.shared = true; // owned here, not by the room (RoomRenderer doesn't dispose it)
    e = { tex, canvas, draw };
    textures.set(key, e);
    redraw(e);
  }
  return e;
}

function redraw(e) {
  const ctx = e.canvas.getContext("2d");
  try {
    e.draw(ctx, e.canvas.width, e.canvas.height);
  } catch (err) {
    console.warn("Couldn't draw your things:", err.message);
  }
  e.tex.needsUpdate = true;
}

const font = (px, weight = 400) => `${weight} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
// Lines of text that fit a width, cut with "…"
function fit(ctx, text, width) {
  let s = String(text || "");
  if (ctx.measureText(s).width <= width) return s;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1);
  return `${s}…`;
}

// ---------- What each kind draws ----------
function drawBoard(ctx, w, h) {
  const page = board.page;
  ctx.fillStyle = "#fbfbf8";
  ctx.fillRect(0, 0, w, h);
  if (page) renderPageTo(ctx.canvas, page, { region: { x: 0, y: 0, width: 1600, height: 1000 }, theme: "classic", pattern: "none", background: true });
}

function drawNotes(ctx, w, h) {
  ctx.fillStyle = "#f6f1e3";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#cfd8e8";
  ctx.lineWidth = 2;
  for (let y = 92; y < h; y += 40) {
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.lineTo(w - 20, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#e9a3a3";
  ctx.beginPath();
  ctx.moveTo(52, 0);
  ctx.lineTo(52, h);
  ctx.stroke();
  ctx.fillStyle = "#2f3440";
  ctx.font = font(26, 600);
  ctx.fillText(fit(ctx, t("My notes"), w - 80), 64, 60);
  const notes = data.notes || [];
  ctx.font = font(22);
  if (!notes.length) {
    ctx.fillStyle = "#7a7f8a";
    ctx.fillText(fit(ctx, t("No notes yet"), w - 80), 64, 120);
    return;
  }
  notes.slice(0, 10).forEach((n, i) => {
    ctx.fillStyle = "#2f3440";
    ctx.fillText(fit(ctx, `• ${n.title}`, w - 84), 64, 120 + i * 40);
  });
}

function drawInbox(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#1d2433");
  g.addColorStop(1, "#141925");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#e9eef8";
  ctx.font = font(26, 600);
  ctx.fillText(fit(ctx, t("Inbox"), w - 40), 24, 44);
  const list = data.inbox || [];
  if (!list.length) {
    ctx.fillStyle = "#9aa6bd";
    ctx.font = font(20);
    ctx.fillText(fit(ctx, t("Nothing new"), w - 48), 24, 92);
    return;
  }
  list.slice(0, 5).forEach((n, i) => {
    const y = 70 + i * 54;
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(16, y, w - 32, 46);
    ctx.fillStyle = "#e9eef8";
    ctx.font = font(19, 600);
    ctx.fillText(fit(ctx, n.title || "", w - 56), 28, y + 20);
    ctx.fillStyle = "#9aa6bd";
    ctx.font = font(16);
    ctx.fillText(fit(ctx, n.body || "", w - 56), 28, y + 40);
  });
}

function drawEvents(ctx, w, h) {
  const now = new Date();
  ctx.fillStyle = "#fbf8f1";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#e5484d";
  ctx.fillRect(0, 0, w, 64);
  ctx.fillStyle = "#ffffff";
  ctx.font = font(26, 700);
  ctx.textAlign = "center";
  ctx.fillText(now.toLocaleDateString(document.documentElement.lang || undefined, { weekday: "long", day: "numeric", month: "short" }), w / 2, 42);
  ctx.textAlign = "start";
  const items = data.events || [];
  ctx.font = font(19);
  if (!items.length) {
    ctx.fillStyle = "#7a7f8a";
    ctx.fillText(fit(ctx, t("Nothing planned today"), w - 32), 16, 104);
    return;
  }
  items.slice(0, 6).forEach((it, i) => {
    const y = 102 + i * 38;
    ctx.fillStyle = "#e5484d";
    ctx.font = font(17, 700);
    ctx.fillText(it.time || "", 16, y);
    ctx.fillStyle = "#2f3440";
    ctx.font = font(19);
    ctx.fillText(fit(ctx, it.text, w - 90), 74, y);
  });
}

function photoDraw(id) {
  let img = null;
  let failed = false;
  return (ctx, w, h) => {
    ctx.fillStyle = "#e9e3d6";
    ctx.fillRect(0, 0, w, h);
    if (!id) {
      ctx.fillStyle = "#6f6a60";
      ctx.font = font(22, 500);
      ctx.textAlign = "center";
      ctx.fillText(fit(ctx, t("Choose a photo in the Room Editor"), w - 40), w / 2, h / 2);
      ctx.textAlign = "start";
      return;
    }
    if (img?.complete && img.naturalWidth) {
      // Fill the frame, cropping what's left over
      const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * k;
      const dh = img.naturalHeight * k;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      return;
    }
    if (!img && !failed) {
      img = new Image();
      img.onload = () => redraw(textures.get(`photo:${id}`));
      img.onerror = () => {
        failed = true;
        img = null;
      };
      img.src = `/api/room-photos/${encodeURIComponent(id)}`;
    }
  };
}

// ---------- Keeping it current ----------
const clock = (ms) => new Date(ms).toLocaleTimeString(document.documentElement.lang || undefined, { hour: "2-digit", minute: "2-digit" });
async function refresh() {
  const used = new Set([...textures.keys()].map((k) => k.split(":")[0]));
  const jobs = [];
  if (used.has("notes")) jobs.push(api.notes.list().then((list) => (data.notes = Array.isArray(list) ? list : list?.notes || [])).catch(() => {}));
  if (used.has("inbox")) jobs.push(api.notifications.getLog().then((list) => (data.inbox = Array.isArray(list) ? list : list?.log || [])).catch(() => {}));
  if (used.has("events")) {
    jobs.push(
      api.life
        .today()
        .then((d) => {
          const events = (d?.events || []).map((e) => ({ at: Date.parse(e.start || e.at || "") || 0, text: e.title || e.summary || "" }));
          const reminders = (d?.reminders || []).map((r) => ({ at: r.at || 0, text: r.text || "" }));
          const due = (d?.dueToday || []).map((x) => ({ at: Date.parse(x.due || "") || 0, text: x.title || "" }));
          data.events = [...events, ...reminders, ...due].filter((x) => x.text).sort((a, b) => a.at - b.at).map((x) => ({ ...x, time: x.at ? clock(x.at) : "" }));
        })
        .catch(() => {}),
    );
  }
  await Promise.all(jobs);
  for (const [key, e] of textures) if (key !== "board" && !key.startsWith("photo:")) redraw(e);
}

function startPolling() {
  if (polling) return;
  refresh();
  polling = setInterval(() => document.visibilityState !== "hidden" && refresh(), 60000);
}

for (const ev of ["doc", "page", "change"]) {
  board.on(ev, () => {
    const e = textures.get("board");
    if (e) redraw(e);
  });
}
document.addEventListener("friends:language-ready", () => {
  for (const e of textures.values()) redraw(e);
});

export function personalTexture(asset) {
  const kind = personalKind(asset);
  if (!kind) return null;
  if (kind === "board") return entry("board", kind, drawBoard).tex;
  if (kind === "photo") {
    const id = asset.state?.photo || "";
    return entry(`photo:${id}`, kind, photoDraw(id)).tex;
  }
  startPolling();
  const draw = { notes: drawNotes, inbox: drawInbox, events: drawEvents }[kind];
  return entry(kind, kind, draw).tex;
}
