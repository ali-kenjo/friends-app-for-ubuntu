// ---------- The Robot Studio's panels ----------
// One builder per tab. Each makes its controls once and returns { el, refresh(robot) }: refresh
// moves every control to what the settings say now (without firing the controls' own handlers),
// so dragging a slider and the settings staying in step never fight.
import * as D from "../design.mjs";
import * as R from "../room.mjs";
import { BUILTIN_LOOKS } from "../looks.mjs";
import { t, tp } from "../../i18n.js";
import { robot as robotApi } from "../index.js";
import { TEMPLATE_BY_ID, TEMPLATES } from "../../room/templates.mjs";
import * as C from "../../room/choices.mjs";
import { h, section, hint, swatches, tiles, slider, toggle, textField, button, arrowKeys, nextId, glyph } from "./ui.js";

const OUTFIT_COLORS = ["#e05a47", "#f2c14e", "#4d8a62", "#3b6fd6", "#7a5cf0", "#f06bb0", "#f4efe6", "#2b2e35", "#8a5a33", "#5eead4", "#ff8a3d"];
const BLUSH_COLORS = ["#ff6f91", "#f472b6", "#ff8a3d", "#c084fc", "#5eead4"];
const percent = (v) => `${Math.round(v * 100)}%`;

// ctx: { edit(fn(robotSettings)), set(path, value) for the design, setRoom(path, value) }
export function colorsPanel(ctx) {
  const el = h("div", { class: "rs-panel-body" });
  const palette = D.SHELL_COLORS.map((c) => ({ color: c.color, label: c.label }));
  let linked = true;
  const head = swatches({ label: t("Head"), colors: palette, onChange: (c) => (linked ? ctx.design((d) => (d.colors.head = d.colors.body = d.colors.arms = c)) : ctx.design((d) => (d.colors.head = c))) });
  const body = swatches({ label: t("Body"), colors: palette, onChange: (c) => ctx.design((d) => (d.colors.body = c)) });
  const arms = swatches({ label: t("Arms and hands"), colors: palette, onChange: (c) => ctx.design((d) => (d.colors.arms = c)) });
  const joint = swatches({ label: t("Neck and shoulders"), colors: D.JOINT_COLORS, onChange: (c) => ctx.design((d) => (d.colors.joint = c)) });
  const same = toggle({
    label: t("One color for the whole robot"),
    onChange: (on) => {
      manual = !on;
      linked = on;
      if (on) ctx.design((d) => (d.colors.body = d.colors.arms = d.colors.head));
      sync();
    },
  });
  const separate = h("div", { class: "rs-indent" }, body.el, arms.el);
  const finish = tiles({ label: null, name: t("Finish"), items: D.FINISHES, onChange: (v) => ctx.design((d) => (d.finish = v)), compact: true, columns: 5 });
  const light = swatches({
    label: t("Color of the light"), colors: D.LIGHT_COLORS, empty: { label: t("Auto"), title: t("Like the app's accent color (Settings → Appearance)") },
    onChange: (c) => ctx.design((d) => (d.colors.light = c)),
    hint: t("The fins, the ring and the eyes glow in this color. Auto follows the app's accent color."),
  });
  const user = swatches({
    label: t("Light while you talk"), colors: D.LIGHT_COLORS, empty: { label: t("Auto"), title: t("A color that differs from its light") },
    onChange: (c) => ctx.design((d) => (d.colors.user = c)),
  });
  const glow = slider({ label: t("How bright the lights are"), min: D.RANGES.glow[0], max: D.RANGES.glow[1], step: D.RANGES.glow[3], def: 1, value: 1, onChange: (v) => ctx.design((d) => (d.glow = v)) });

  el.append(
    section(t("Shell"), same.el, head.el, separate, joint.el, finish.el),
    section(t("Light"), light.el, user.el, glow.el)
  );
  let manual = false; // you switched "one color" off yourself: keep the separate pickers even while the colors match
  function sync() {
    separate.hidden = linked;
    head.el.querySelector(".rs-label").textContent = linked ? t("Color") : t("Head");
    same.set(linked);
  }
  return {
    el,
    refresh(robot) {
      const d = robot.design;
      const equal = d.colors.head === d.colors.body && d.colors.body === d.colors.arms;
      linked = equal && !manual;
      head.set(d.colors.head);
      body.set(d.colors.body);
      arms.set(d.colors.arms);
      joint.set(d.colors.joint);
      finish.set(d.finish);
      light.set(d.colors.light);
      user.set(d.colors.user);
      glow.set(d.glow);
      sync();
    },
  };
}

export function shapePanel(ctx) {
  const el = h("div", { class: "rs-panel-body" });
  const b = D.RANGES.build;
  const sliderFor = (key, label, note = "") => slider({ label, min: b[key][0], max: b[key][1], step: b[key][3], def: b[key][2], value: b[key][2], onChange: (v) => ctx.design((d) => (d.build[key] = v)), format: percent });
  const body = tiles({ label: t("Body"), items: D.BODIES, onChange: (v) => ctx.design((d) => (d.build.bodyShape = v)), compact: true, columns: 5 });
  const top = tiles({ label: t("On top of its head"), items: D.TOPS, onChange: (v) => ctx.design((d) => (d.build.topStyle = v)), compact: true, columns: 5 });
  const hands = tiles({ label: t("Hands"), items: D.HANDS, onChange: (v) => ctx.design((d) => (d.build.handStyle = v)), compact: true, columns: 4 });
  const hover = tiles({ label: t("How it floats"), items: D.HOVERS, onChange: (v) => ctx.design((d) => (d.build.hover = v)), compact: true, columns: 4 });
  const sliders = {
    size: sliderFor("size", t("Overall size")),
    head: sliderFor("head", t("Head size")),
    roundness: slider({ label: t("Head shape"), min: 0, max: 1, step: 0.01, def: b.roundness[2], value: b.roundness[2], onChange: (v) => ctx.design((d) => (d.build.roundness = v)), format: (v) => (v < 0.2 ? t("Boxy") : v > 0.8 ? t("Round") : t("Soft")) }),
    width: sliderFor("width", t("Body width")),
    height: sliderFor("height", t("Body height")),
    arms: sliderFor("arms", t("Arm length")),
    hands: sliderFor("hands", t("Hand size")),
    top: sliderFor("top", t("Size of the fins, ears or antennae")),
  };
  el.append(
    section(t("Shapes"), body.el, top.el, hands.el, hover.el),
    section(t("Proportions"), hint(t("Double-click a slider to put it back.")), ...Object.values(sliders).map((s) => s.el))
  );
  return {
    el,
    refresh(robot) {
      const bd = robot.design.build;
      body.set(bd.bodyShape);
      top.set(bd.topStyle);
      hands.set(bd.handStyle);
      hover.set(bd.hover);
      for (const [key, s] of Object.entries(sliders)) s.set(bd[key]);
    },
  };
}

export function facePanel(ctx) {
  const el = h("div", { class: "rs-panel-body" });
  const eyes = tiles({ label: null, name: t("Eyes"), items: D.EYES, onChange: (v) => ctx.design((d) => (d.face.eyes = v)), compact: true, columns: 4 });
  const eyeSize = slider({ label: t("Eye size"), min: D.RANGES.face.eyeSize[0], max: D.RANGES.face.eyeSize[1], step: 0.01, def: 1, value: 1, onChange: (v) => ctx.design((d) => (d.face.eyeSize = v)), format: percent });
  const eyeGap = slider({ label: t("Space between the eyes"), min: D.RANGES.face.eyeGap[0], max: D.RANGES.face.eyeGap[1], step: 0.01, def: 1, value: 1, onChange: (v) => ctx.design((d) => (d.face.eyeGap = v)), format: percent });
  const mouth = tiles({ label: null, name: t("Mouth"), items: D.MOUTHS, onChange: (v) => ctx.design((d) => (d.face.mouth = v)), compact: true, columns: 5 });
  const color = swatches({
    label: t("Color of the eyes and mouth"), colors: D.LIGHT_COLORS, empty: { label: t("Light"), title: t("Like its light color") },
    onChange: (c) => ctx.design((d) => (d.colors.face = c)),
  });
  const blush = swatches({ label: t("Blush"), colors: BLUSH_COLORS, onChange: (c) => ctx.design((d) => (d.face.blush = c)), hint: t("Shows when it's shy or happy.") });
  el.append(section(t("Eyes"), eyes.el, eyeSize.el, eyeGap.el), section(t("Mouth"), mouth.el), section(t("Colors"), color.el, blush.el));
  return {
    el,
    refresh(robot) {
      const d = robot.design;
      eyes.set(d.face.eyes);
      eyeSize.set(d.face.eyeSize);
      eyeGap.set(d.face.eyeGap);
      mouth.set(d.face.mouth);
      color.set(d.colors.face);
      blush.set(d.face.blush);
    },
  };
}

// ---------- Outfit ----------
export function outfitPanel(ctx) {
  const el = h("div", { class: "rs-panel-body" });
  let slot = "hat";
  let shown = null; // which item the open slot's controls were made for
  const nav = h("div", { class: "rs-subtabs", role: "tablist", "aria-label": t("Part of the robot") });
  const tabs = new Map();
  for (const s of D.SLOTS) {
    const b = h("button", { type: "button", class: "rs-subtab", role: "tab", id: nextId("rs-slot"), "aria-selected": "false", "data-slot": s.id }, h("span", { text: t(s.label) }), h("i", { class: "rs-dot", "aria-hidden": "true" }));
    b.addEventListener("click", () => {
      slot = s.id;
      shown = null;
      ctx.refresh();
    });
    tabs.set(s.id, b);
    nav.append(b);
  }
  arrowKeys(nav, 'button[role="tab"]');
  const content = h("div", { class: "rs-slot-body", role: "tabpanel" });
  el.append(nav, content);

  function render(robot) {
    const o = robot.design.outfit[slot];
    const def = D.SLOTS.find((s) => s.id === slot);
    const items = D.OUTFIT[slot];
    const key = `${slot}|${o.item}`;
    for (const [id, b] of tabs) {
      const on = id === slot;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle("on", on);
      b.classList.toggle("worn", robot.design.outfit[id].item !== "none");
    }
    content.setAttribute("aria-labelledby", tabs.get(slot).id);
    if (shown === key) return updateColors(robot);
    shown = key;
    content.replaceChildren();
    const choose = tiles({
      label: null, name: t(def.label), items, value: o.item, columns: 4,
      onChange: (id) => {
        ctx.design((d) => {
          const it = D.ITEMS[slot][id];
          d.outfit[slot] = { item: id, c1: it.colors[0] ?? "", c2: it.colors[1] ?? "", pattern: d.outfit[slot].pattern };
        });
      },
    });
    content.append(choose.el);
    const item = D.ITEMS[slot][o.item];
    if (o.item !== "none") {
      const colors = h("div", { class: "rs-colors" });
      const names = item.names;
      const make = (n) => {
        const empty = item.colors[n] === "" ? { label: t("Light"), title: t("Like its light color") } : null;
        return swatches({ label: t(names[n] || (n ? "Second color" : "Color")), colors: OUTFIT_COLORS, empty, onChange: (c) => ctx.design((d) => (d.outfit[slot][n ? "c2" : "c1"] = c)) });
      };
      const first = make(0);
      colors.append(first.el);
      const second = names.length > 1 ? make(1) : null;
      if (second) colors.append(second.el);
      content.append(section(t("Colors"), colors));
      content.colors = [first, second];
      if (def.pattern) {
        const pattern = tiles({ label: null, name: t("Pattern"), items: D.PATTERNS, value: o.pattern, columns: 4, compact: true, onChange: (v) => ctx.design((d) => (d.outfit[slot].pattern = v)) });
        content.append(section(t("Pattern"), pattern.el));
        content.pattern = pattern;
      } else content.pattern = null;
    } else {
      content.colors = null;
      content.append(hint(t("Nothing here yet. Pick something above.")));
    }
    content.choose = choose;
    updateColors(robot);
  }
  function updateColors(robot) {
    const o = robot.design.outfit[slot];
    content.choose?.set(o.item);
    if (content.colors) {
      content.colors[0]?.set(o.c1);
      content.colors[1]?.set(o.c2);
    }
    content.pattern?.set(o.pattern);
  }
  return { el, refresh: render };
}

// ---------- Room ----------
// The room it's in (a room document): which one, a place to start from, and its light and air. Everything
// else (furniture, walls, the robot's rules) is in the Room Editor.
export function roomPanel(ctx) {
  const el = h("div", { class: "rs-panel-body" });
  const doc = () => robotApi.room;
  const setAtm = (patch) => {
    const d = doc();
    if (d) robotApi.setRoom({ ...d, atmosphere: { ...d.atmosphere, ...patch } });
  };
  // Your room
  const roomName = h("p", { class: "rs-room-summary", "aria-live": "polite" });
  const roomFrom = h("p", { class: "rs-hint rs-room-from" });
  const roomPic = h("img", { class: "rs-room-pic", alt: "", hidden: true });
  const edit = h("button", { type: "button", class: "btn btn-primary small", "data-edit-room": "full", text: t("Edit the room…") });
  const picture = () => {
    const id = doc()?.id;
    if (!id) return;
    fetch("/api/rooms")
      .then((r) => r.json())
      .then(({ rooms }) => {
        const thumb = rooms.find((r) => r.id === id)?.thumb;
        roomPic.hidden = !thumb;
        if (thumb) roomPic.src = thumb;
      })
      .catch(() => {});
  };
  // A place to start from: its template room (made the first time, then the same one)
  const placeItems = TEMPLATES.filter((x) => x.kind === "place");
  const places = tiles({ label: null, name: t("Place"), items: placeItems, onChange: (id) => ctx.place(id), columns: 3 });
  const surprise = button(t("Surprise me"), () => ctx.randomRoom(), { icon: "dice" });
  // Light and air (the room's atmosphere)
  const mood = tiles({ label: t("Mood"), items: C.MOODS, onChange: (v) => setAtm({ mood: v }), compact: true, columns: 4 });
  const brightness = slider({ label: t("Brightness"), min: 0.5, max: 1.5, step: 0.01, def: 1, value: 1, onChange: (v) => setAtm({ brightness: v }), format: percent });
  const time = tiles({ label: t("Time of day"), items: C.TIME_MODES, onChange: (v) => setAtm({ timeMode: v }), compact: true, columns: 3 });
  const hour = slider({ label: t("Hour"), min: 0, max: 24, step: 0.25, def: 14, value: 14, onChange: (v) => setAtm({ timeHour: v }), format: (v) => `${String(Math.floor(v)).padStart(2, "0")}:${String(Math.round((v % 1) * 60)).padStart(2, "0")}` });
  const air = tiles({ label: null, name: t("In the air"), items: C.AIRS, onChange: (v) => setAtm({ air: v }), compact: true, columns: 5 });
  const amount = slider({ label: t("How much"), min: 0.3, max: 2, step: 0.01, def: 1, value: 1, onChange: (v) => setAtm({ airAmount: v }), format: percent });
  const photo = ctx.photoControls();
  const photoSection = section(t("Your picture"), photo.el);
  el.append(
    section(t("Your room"), h("div", { class: "rs-room-card" }, roomPic, h("div", {}, roomName, roomFrom)), hint(t("Place furniture and things, change the walls and the light, and say what the robot may use.")), h("div", { class: "rs-actions" }, edit)),
    section(t("Start from a place"), hint(t("Each place is a room of its own: what you change in one stays there.")), places.el, h("div", { class: "rs-actions" }, surprise)),
    section(t("Light and mood"), mood.el, brightness.el, time.el, hour.el),
    section(t("In the air"), air.el, amount.el),
    photoSection,
  );
  document.addEventListener("friends:room-editor-closed", () => setTimeout(picture, 400));
  let shownFor = "";
  return {
    el,
    refresh() {
      const d = doc();
      if (!d) {
        roomName.textContent = t("The room is still loading.");
        return;
      }
      roomName.textContent = tp("{name}: {n} thing", "{name}: {n} things", d.assets.filter((a) => !a.hidden).length, { name: d.name });
      const from = TEMPLATE_BY_ID[d.template];
      roomFrom.textContent = from && from.kind !== "empty" ? t("Made from: {template}", { template: t(from.label) }) : "";
      if (shownFor !== d.id) {
        shownFor = d.id;
        picture();
      }
      places.set(d.template);
      const a = d.atmosphere;
      mood.set(a.mood);
      brightness.set(a.brightness);
      time.set(a.timeMode);
      hour.set(a.timeHour);
      hour.el.hidden = a.timeMode !== "manual";
      air.set(a.air);
      amount.set(a.airAmount);
      amount.el.hidden = a.air === "none";
      photoSection.hidden = d.architecture.outside !== "photo";
      photo.refresh(d);
    },
  };
}

// ---------- Personality & Behaviors ----------
export function behaviorsPanel(ctx) {
  const el = h("div", { class: "rs-panel-body" });
  const presets = tiles({
    label: t("Personality presets"),
    items: D.BEHAVIOR_PRESETS,
    onChange: (presetId) => {
      ctx.design((d) => {
        d.behaviors.preset = presetId;
        const p = D.BEHAVIOR_PRESETS.find((x) => x.id === presetId);
        if (p?.sliders) {
          for (const [k, v] of Object.entries(p.sliders)) d.behaviors[k] = v;
        }
      });
    },
    compact: true,
    columns: 3,
  });

  const sliders = {};
  const sliderEls = [];
  for (const s of D.BEHAVIOR_SLIDERS) {
    const range = D.RANGES.behaviors[s.id] || [0.2, 2.0, 1.0, 0.05];
    const sc = slider({
      label: t(s.label),
      min: range[0],
      max: range[1],
      step: range[3] || 0.05,
      def: s.defaultVal,
      value: s.defaultVal,
      onChange: (v) => ctx.design((d) => (d.behaviors[s.id] = v)),
      format: percent,
    });
    sliders[s.id] = sc;
    sliderEls.push(sc.el);
  }

  const idles = {};
  const idleEls = [];
  for (const b of D.IDLE_BEHAVIORS) {
    const tog = toggle({
      label: t(b.label),
      onChange: (on) => ctx.design((d) => {
        if (!d.behaviors.idle[b.id]) d.behaviors.idle[b.id] = { on: true, freq: 1 };
        d.behaviors.idle[b.id].on = on;
      }),
    });
    idles[b.id] = tog;
    idleEls.push(tog.el);
  }

  el.append(
    section(t("Personality"), presets.el, ...sliderEls),
    section(t("Idle behaviors"), ...idleEls)
  );

  return {
    el,
    refresh(robot) {
      const b = robot.design?.behaviors || D.DEFAULT_BEHAVIORS;
      presets.set(b.preset || "balanced");
      for (const [id, sc] of Object.entries(sliders)) {
        if (b[id] !== undefined) sc.set(b[id]);
      }
      for (const [id, tog] of Object.entries(idles)) {
        tog.set(b.idle?.[id]?.on ?? true);
      }
    },
  };
}

// ---------- Looks ----------
export function looksPanel(ctx) {
  const el = h("div", { class: "rs-panel-body" });
  const builtin = h("div", { class: "rs-looks" });
  const mine = h("div", { class: "rs-looks" });
  const empty = hint(t("Nothing saved yet. Make it yours in the other tabs, then save it here."));
  const name = textField({ label: t("Name this look"), max: 40, value: "", placeholder: t("My look"), onChange: () => {} });
  const save = button(t("Save this look"), () => ctx.saveLook(name.input.value), { primary: true, icon: "save" });
  const surprise = button(t("Surprise me"), () => ctx.randomLook(), { icon: "dice" });
  const exportBtn = button(t("Export…"), () => ctx.exportLook(name.input.value), { icon: "download", title: t("Save this look as a file you can share") });
  const importBtn = button(t("Import…"), () => ctx.importLook(), { icon: "upload", title: t("Open a look someone shared") });
  const note = h("p", { class: "rs-hint", text: t("Each character keeps its own look while \"Each has its own look\" is on (Settings → Characters).") });
  el.append(
    section(t("Make it yours"), h("div", { class: "rs-save" }, name.el, save), h("div", { class: "rs-actions" }, surprise, exportBtn, importBtn), note),
    section(t("My looks"), mine, empty),
    section(t("Start from a look"), builtin)
  );

  const card = (look, { saved = false } = {}) => {
    const d = look.design;
    const worn = Object.keys(d.outfit).filter((k) => d.outfit[k].item !== "none").map((k) => t(D.ITEMS[k][d.outfit[k].item].label));
    const place = look.room?.layoutId ? { label: ctx.roomName(look.room.layoutId) } : R.PLACE_BY_ID[look.room?.place] || R.PLACE_BY_ID.studio;
    const b = h(
      "button", { type: "button", class: "rs-look", "data-id": look.id, title: look.about ? t(look.about) : "" },
      h("span", { class: "rs-look-swatch", "aria-hidden": "true", style: `--a:${d.colors.head};--b:${d.colors.body};--c:${d.colors.light || "var(--accent)"}` }, h("span", { class: "rs-look-eyes" }, h("i"), h("i"))),
      h("span", { class: "rs-look-name", text: look.builtin ? t(look.label) : look.name }),
      h("span", { class: "rs-look-things", "aria-hidden": "true", text: [place ? t(place.label) : "", worn.slice(0, 2).join(", ")].filter(Boolean).join(" · ") })
    );
    b.addEventListener("click", () => ctx.applyLook(look));
    if (!saved) return b;
    const wrap = h("div", { class: "rs-look-wrap" }, b);
    const del = h("button", { type: "button", class: "rs-look-del", "aria-label": t("Delete {name}", { name: look.name }), title: t("Delete this look") }, glyph("close", 14));
    del.addEventListener("click", () => ctx.deleteLook(look));
    wrap.append(del);
    return wrap;
  };
  builtin.replaceChildren(...BUILTIN_LOOKS.map((l) => card(l)));

  let key = "";
  return {
    el,
    refresh(robot) {
      const k = JSON.stringify(robot.looks.map((l) => [l.id, l.name]));
      if (k === key) return;
      key = k;
      mine.replaceChildren(...robot.looks.map((l) => card(l, { saved: true })));
      empty.hidden = robot.looks.length > 0;
    },
  };
}
