// ---------- The Robot Studio's panels ----------
// One builder per tab. Each makes its controls once and returns { el, refresh(robot) }: refresh
// moves every control to what the settings say now (without firing the controls' own handlers),
// so dragging a slider and the settings staying in step never fight.
import * as D from "../design.mjs";
import * as R from "../room.mjs";
import * as C from "../room-catalog.mjs";
import { BUILTIN_LOOKS } from "../looks.mjs";
import { t } from "../../i18n.js";
import { h, section, hint, swatches, tiles, slider, toggle, textField, button, arrowKeys, nextId, glyph } from "./ui.js";

const OUTFIT_COLORS = ["#e05a47", "#f2c14e", "#4d8a62", "#3b6fd6", "#7a5cf0", "#f06bb0", "#f4efe6", "#2b2e35", "#8a5a33", "#5eead4", "#ff8a3d"];
const ROOM_COLORS = ["#0b0b0d", "#26272c", "#3a4ea8", "#5aa6f2", "#7a5cf0", "#c0507f", "#f3a469", "#4a7a4a", "#6b4a3a", "#eaf4ff", "#ffd9b0", "#ff3ea5"];
const BLUSH_COLORS = ["#ff6f91", "#f472b6", "#ff8a3d", "#c084fc", "#5eead4"];
const percent = (v) => `${Math.round(v * 100)}%`;

const pair = (obj, path) => {
  const keys = path.split(".");
  const last = keys.pop();
  return [keys.reduce((o, k) => o[k], obj), last];
};

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
export function roomPanel(ctx) {
  const el = h("div", { class: "rs-panel-body" });
  const places = tiles({ label: null, name: t("Place"), items: R.PLACES, onChange: (id) => ctx.place(id), columns: 3 });
  const dynamic = h("div", { class: "rs-room-dynamic" });
  const light = tiles({ label: t("Mood"), items: R.LIGHTS, onChange: (v) => ctx.room((r) => (r.light = v)), compact: true, columns: 4 });
  const brightness = slider({ label: t("Brightness"), min: R.RANGES.brightness[0], max: R.RANGES.brightness[1], step: 0.01, def: 1, value: 1, onChange: (v) => ctx.room((r) => (r.brightness = v)), format: percent });
  const floor = tiles({ label: null, name: t("Floor"), items: R.FLOORS, onChange: (v) => ctx.room((r) => (r.floor = v)), compact: true, columns: 5 });
  const air = tiles({ label: null, name: t("In the air"), items: R.AIRS, onChange: (v) => ctx.room((r) => (r.air = v)), compact: true, columns: 5 });
  const amount = slider({ label: t("How much"), min: R.RANGES.airAmount[0], max: R.RANGES.airAmount[1], step: 0.01, def: 1, value: 1, onChange: (v) => ctx.room((r) => (r.airAmount = v)), format: percent });
  const surprise = button(t("Surprise me"), () => ctx.randomRoom(), { icon: "dice" });
  const lighting = section(t("Lighting"), light.el, brightness.el);
  const ground = section(t("Floor"), floor.el);
  const atmosphere = section(t("In the air"), air.el, amount.el);
  el.append(section(t("Place"), places.el, h("div", { class: "rs-actions" }, surprise)), dynamic, lighting, ground, atmosphere);

  let builtFor = null;
  let colorControls = {};
  let propControls = {};
  let sign = null;
  let photo = null;

  function build(room) {
    const place = R.PLACE_BY_ID[room.place];
    builtFor = room.place;
    colorControls = {};
    propControls = {};
    sign = null;
    photo = null;
    dynamic.replaceChildren();
    const colors = [];
    if (!place.chroma) {
      for (const key of R.COLOR_KEYS) {
        if (!place.names[key]) continue;
        const c = swatches({
          label: t(place.names[key]), colors: ROOM_COLORS, empty: key === "glow" ? { label: t("Light"), title: t("Like the robot's light color") } : null,
          onChange: (v) => ctx.room((r) => (r.colors[key] = v)),
        });
        colorControls[key] = c;
        colors.push(c.el);
      }
    }
    if (colors.length) dynamic.append(section(t("Colors"), ...colors, h("div", { class: "rs-actions" }, button(t("Back to the usual colors"), () => ctx.room((r) => (r.colors = { ...place.colors })), { icon: "undo" }))));
    if (place.props.length || place.sign) {
      const list = [];
      for (const prop of place.props) {
        const c = toggle({ label: t(prop.label), onChange: (on) => ctx.room((r) => (r.props[prop.id] = on)) });
        propControls[prop.id] = c;
        list.push(c.el);
      }
      if (place.sign) {
        sign = textField({ label: t("Words on the sign"), max: 16, placeholder: t("ON AIR"), onChange: (v) => ctx.room((r) => (r.sign = v)) });
        list.push(sign.el);
      }
      dynamic.append(section(t("What's in the room"), ...list));
    }
    if (place.photo) {
      photo = ctx.photoControls();
      dynamic.append(section(t("Your picture"), photo.el));
    }
    el.classList.toggle("is-chroma", Boolean(place.chroma));
    lighting.hidden = atmosphere.hidden = Boolean(place.chroma);
    ground.hidden = Boolean(place.chroma || place.ownFloor);
  }
  return {
    el,
    refresh(robot) {
      const room = robot.room;
      if (builtFor !== room.place) build(room);
      places.set(room.place);
      for (const [key, c] of Object.entries(colorControls)) c.set(room.colors[key]);
      for (const [id, c] of Object.entries(propControls)) c.set(room.props[id]);
      sign?.set(room.sign);
      photo?.refresh(room);
      light.set(room.light);
      brightness.set(room.brightness);
      floor.set(room.floor);
      air.set(room.air);
      amount.set(room.airAmount);
      amount.el.hidden = room.air === "none";
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

// ---------- Room Builder ----------
export function builderPanel(ctx) {
  const el = h("div", { class: "rs-panel-body" });

  const enableTog = toggle({
    label: t("Use custom room build"),
    note: t("Replaces the standard set with your custom walls, floor and placed props."),
    onChange: (on) => ctx.room((r) => {
      r.builder.enabled = on;
    }),
  });

  const wallTile = tiles({
    label: t("Walls style"),
    items: C.WALL_STYLES,
    onChange: (id) => ctx.room((r) => (r.builder.wallStyle = id)),
    compact: true,
    columns: 4,
  });

  const floorTile = tiles({
    label: t("Floor style"),
    items: C.FLOOR_STYLES,
    onChange: (id) => ctx.room((r) => (r.builder.floorStyle = id)),
    compact: true,
    columns: 4,
  });

  const ceilingTile = tiles({
    label: t("Ceiling style"),
    items: C.CEILING_STYLES,
    onChange: (id) => ctx.room((r) => (r.builder.ceilingStyle = id)),
    compact: true,
    columns: 3,
  });

  const windowTile = tiles({
    label: t("Window style"),
    items: C.WINDOW_STYLES,
    onChange: (id) => ctx.room((r) => (r.builder.windowStyle = id)),
    compact: true,
    columns: 4,
  });

  const lightingTile = tiles({
    label: t("Lighting rig"),
    items: C.LIGHTING_RIGS,
    onChange: (id) => ctx.room((r) => (r.builder.lightingRig = id)),
    compact: true,
    columns: 4,
  });

  let selectedCategory = "all";
  let searchQuery = "";
  let selectedItemId = null;

  const catalogGrid = h("div", { class: "rs-tiles compact", style: "--cols:4" });

  function renderCatalog() {
    const q = searchQuery.toLowerCase().trim();
    const filtered = C.BUILDER_CATALOG.filter((p) => {
      if (selectedCategory !== "all" && p.category !== selectedCategory) return false;
      if (q && !t(p.label).toLowerCase().includes(q) && !p.id.toLowerCase().includes(q) && !p.slot.toLowerCase().includes(q)) return false;
      return true;
    });
    catalogGrid.replaceChildren(
      ...filtered.map((item) => {
        const b = h(
          "button",
          {
            type: "button",
            class: "rs-tile",
            title: `${t(item.label)} (${t(item.slot)})`,
            role: "button",
          },
          h("span", { class: "rs-tile-icon", text: item.shape === "sofa" ? "🛋" : item.slot === "wall" ? "🖼" : item.slot === "ceiling" ? "💡" : "📦" }),
          h("span", { class: "rs-tile-label", text: t(item.label) })
        );
        b.addEventListener("click", () => {
          ctx.room((r) => {
            if (r.builder.items.length >= C.MAX_BUILDER_ITEMS) return;
            const created = C.sanitizeBuilderItem({ propId: item.id }, r.builder.items.length);
            if (created) {
              r.builder.enabled = true;
              r.builder.items.push(created);
              selectedItemId = created.id;
            }
          });
        });
        return b;
      })
    );
  }

  const categoryItems = [{ id: "all", label: "All" }, ...C.BUILDER_CATEGORIES];
  const categoryTile = tiles({
    label: t("Catalog category"),
    items: categoryItems,
    value: "all",
    onChange: (cat) => {
      selectedCategory = cat;
      renderCatalog();
    },
    compact: true,
    columns: 4,
  });

  const searchBox = textField({
    label: t("Search props"),
    placeholder: t("Search 100+ props…"),
    onChange: (val) => {
      searchQuery = val;
      renderCatalog();
    },
  });

  renderCatalog();

  const placedList = h("div", { class: "rs-actions", style: "flex-wrap:wrap;margin-block-end:var(--space-2);" });
  const editorEl = h("div", { class: "rs-indent" });
  editorEl.hidden = true;

  const slotTile = tiles({
    label: t("Snap slot"),
    items: [
      { id: "floor", label: "Floor" },
      { id: "wall", label: "Wall" },
      { id: "shelf", label: "Shelf" },
      { id: "ceiling", label: "Ceiling" },
    ],
    onChange: (slot) => ctx.room((r) => {
      const it = r.builder.items.find((x) => x.id === selectedItemId);
      if (it) {
        it.slot = slot;
        const snaps = C.SNAP_SLOTS[slot] || C.SNAP_SLOTS.floor;
        const snap = snaps[0];
        it.x = snap[0];
        it.y = snap[1];
        it.z = snap[2];
      }
    }),
    compact: true,
    columns: 4,
  });

  const posX = slider({ label: t("Position X"), min: -2.2, max: 2.2, step: 0.05, def: 0, value: 0, onChange: (v) => ctx.room((r) => { const it = r.builder.items.find((x) => x.id === selectedItemId); if (it) it.x = v; }), format: (v) => `${v.toFixed(2)}m` });
  const posY = slider({ label: t("Height Y"), min: 0, max: 2.6, step: 0.05, def: 0, value: 0, onChange: (v) => ctx.room((r) => { const it = r.builder.items.find((x) => x.id === selectedItemId); if (it) it.y = v; }), format: (v) => `${v.toFixed(2)}m` });
  const posZ = slider({ label: t("Position Z"), min: -1.5, max: 1.2, step: 0.05, def: 0, value: 0, onChange: (v) => ctx.room((r) => { const it = r.builder.items.find((x) => x.id === selectedItemId); if (it) it.z = v; }), format: (v) => `${v.toFixed(2)}m` });
  const rotY = slider({ label: t("Rotate Y"), min: -180, max: 180, step: 5, def: 0, value: 0, onChange: (v) => ctx.room((r) => { const it = r.builder.items.find((x) => x.id === selectedItemId); if (it) it.rotY = v; }), format: (v) => `${v}°` });
  const scale = slider({ label: t("Scale"), min: 0.4, max: 2.2, step: 0.05, def: 1, value: 1, onChange: (v) => ctx.room((r) => { const it = r.builder.items.find((x) => x.id === selectedItemId); if (it) it.scale = v; }), format: percent });

  const c1Picker = swatches({ label: t("Primary color"), colors: ROOM_COLORS, onChange: (c) => ctx.room((r) => { const it = r.builder.items.find((x) => x.id === selectedItemId); if (it) it.c1 = c; }) });
  const c2Picker = swatches({ label: t("Secondary color"), colors: ROOM_COLORS, onChange: (c) => ctx.room((r) => { const it = r.builder.items.find((x) => x.id === selectedItemId); if (it) it.c2 = c; }) });

  const animTog = toggle({ label: t("Animated"), onChange: (on) => ctx.room((r) => { const it = r.builder.items.find((x) => x.id === selectedItemId); if (it) it.animated = on; }) });
  const interTog = toggle({ label: t("Interactive"), onChange: (on) => ctx.room((r) => { const it = r.builder.items.find((x) => x.id === selectedItemId); if (it) it.interactive = on; }) });

  const dupBtn = button(t("Duplicate"), () => {
    ctx.room((r) => {
      const it = r.builder.items.find((x) => x.id === selectedItemId);
      if (!it || r.builder.items.length >= C.MAX_BUILDER_ITEMS) return;
      const copy = { ...it, id: `item-${Date.now().toString(36)}`, x: Math.min(2.2, it.x + 0.2) };
      r.builder.items.push(copy);
      selectedItemId = copy.id;
    });
  }, { icon: "copy" });

  const delBtn = button(t("Delete prop"), () => {
    ctx.room((r) => {
      r.builder.items = r.builder.items.filter((x) => x.id !== selectedItemId);
      selectedItemId = r.builder.items[0]?.id || null;
    });
  }, { icon: "trash" });

  editorEl.append(
    slotTile.el,
    posX.el, posY.el, posZ.el, rotY.el, scale.el,
    c1Picker.el, c2Picker.el,
    animTog.el, interTog.el,
    h("div", { class: "rs-actions" }, dupBtn, delBtn)
  );

  const roomNameField = textField({ label: t("Name this custom room"), max: 40, value: "", placeholder: t("My custom room"), onChange: () => {} });
  const saveRoomBtn = button(t("Save custom room"), () => ctx.saveCustomRoom(roomNameField.input.value), { primary: true, icon: "save" });
  const exportRoomBtn = button(t("Export room…"), () => ctx.exportCustomRoom(roomNameField.input.value), { icon: "download", title: t("Save room as .robot-room.json") });
  const importRoomBtn = button(t("Import room…"), () => ctx.importCustomRoom(), { icon: "upload", title: t("Open .robot-room.json") });
  const myRoomsList = h("div", { class: "rs-looks" });
  const emptyRooms = hint(t("No custom rooms saved yet. Design your room above, then save it here."));

  el.append(
    section(t("Room Builder"), enableTog.el),
    section(t("Room Architecture"), wallTile.el, floorTile.el, ceilingTile.el, windowTile.el, lightingTile.el),
    section(t("Add Props"), searchBox.el, categoryTile.el, catalogGrid),
    section(t("Placed Props"), placedList, editorEl),
    section(t("Save & Share Custom Rooms"), h("div", { class: "rs-save" }, roomNameField.el, saveRoomBtn), h("div", { class: "rs-actions" }, exportRoomBtn, importRoomBtn), myRoomsList, emptyRooms)
  );

  return {
    el,
    refresh(robot) {
      const bld = robot.room?.builder || C.DEFAULT_BUILDER;
      enableTog.set(bld.enabled);
      wallTile.set(bld.wallStyle);
      floorTile.set(bld.floorStyle);
      ceilingTile.set(bld.ceilingStyle);
      windowTile.set(bld.windowStyle);
      lightingTile.set(bld.lightingRig);

      if (!bld.items.some((x) => x.id === selectedItemId)) {
        selectedItemId = bld.items[0]?.id || null;
      }
      placedList.replaceChildren(
        ...bld.items.map((it) => {
          const def = C.CATALOG_BY_ID[it.propId];
          const isSel = it.id === selectedItemId;
          const b = h("button", {
            type: "button",
            class: `btn small${isSel ? " btn-primary" : ""}`,
            text: def ? t(def.label) : it.id,
          });
          b.addEventListener("click", () => {
            selectedItemId = it.id;
            ctx.refresh();
          });
          return b;
        })
      );

      const sel = bld.items.find((x) => x.id === selectedItemId);
      if (sel) {
        editorEl.hidden = false;
        slotTile.set(sel.slot);
        posX.set(sel.x);
        posY.set(sel.y);
        posZ.set(sel.z);
        rotY.set(sel.rotY);
        scale.set(sel.scale);
        c1Picker.set(sel.c1);
        c2Picker.set(sel.c2);
        animTog.set(sel.animated);
        interTog.set(sel.interactive);
      } else {
        editorEl.hidden = true;
      }

      const customRooms = robot.customRooms || [];
      emptyRooms.hidden = customRooms.length > 0;
      myRoomsList.replaceChildren(
        ...customRooms.map((cr) => {
          const btn = h("button", { type: "button", class: "rs-look", "data-id": cr.id },
            h("span", { class: "rs-look-swatch", "aria-hidden": "true", style: `--a:${cr.room.colors?.wall || "#3a4ea8"};--b:${cr.room.colors?.floor || "#26272c"};--c:${cr.room.colors?.glow || "#ffd4a6"}` }),
            h("span", { class: "rs-look-name", text: cr.name }),
            h("span", { class: "rs-look-things", text: `${cr.room.builder?.items?.length || 0} props` })
          );
          btn.addEventListener("click", () => ctx.applyCustomRoom(cr));
          const wrap = h("div", { class: "rs-look-wrap" }, btn);
          const del = h("button", { type: "button", class: "rs-look-del", "aria-label": t("Delete {name}", { name: cr.name }), title: t("Delete this room") }, glyph("close", 14));
          del.addEventListener("click", () => ctx.deleteCustomRoom(cr));
          wrap.append(del);
          return wrap;
        })
      );
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
    const place = R.PLACE_BY_ID[look.room.place];
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
