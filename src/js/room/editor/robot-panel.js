// ---------- The robot's own inspector in the Room Editor ----------
// Where it lives (home, spots), how it stands (posture per state), where it looks (gaze per state), where it
// may go (freedom, zones, how it moves, what it does in each state), its routes, and how much it does on
// its own (autonomy). Every change is a step of the editor's history, like any other.
import { t } from "../../i18n.js";
import { h, section, tiles, slider, toggle, textField, button, hint, arrowKeys } from "../../robot/studio/ui.js";
import * as C from "../choices.mjs";
import { entryFor } from "../catalog.mjs";
import { defaultRules, displayName } from "../model.mjs";
import * as RO from "./robot-ops.mjs";

// Made when shown (the words are in the interface language)
const tabNames = () => [
  ["where", t("Where it lives")],
  ["posture", t("Posture")],
  ["gaze", t("Gaze")],
  ["move", t("Movement")],
  ["zones", t("Zones and routes")],
  ["auto", t("On its own")],
];
const stateWords = () => ({ idle: t("Idle"), talking: t("Talking"), listening: t("Listening"), thinking: t("Thinking"), away: t("When you're away") });
const cm = (m) => Math.round(m * 100);

function select(label, options, value, onChange) {
  const s = h("select", { class: "field", "aria-label": label }, ...options.map(([v, l]) => h("option", { value: v, text: l })));
  s.value = value ?? "";
  s.addEventListener("change", () => onChange(s.value));
  return h("div", { class: "rs-field" }, h("span", { class: "rs-label", text: label }), s);
}

function numberRow(label, value, onChange, { min, max, step = 1, suffix = "" }) {
  const id = `re-rb-${Math.random().toString(36).slice(2, 8)}`;
  const input = h("input", { id, type: "number", class: "field re-num", value: String(value), min, max, step });
  input.addEventListener("change", () => {
    const n = Number(input.value);
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
  });
  return h("div", { class: "re-num-row" }, h("label", { for: id, text: label }), input, suffix ? h("span", { class: "re-unit", text: suffix }) : null);
}

export function robotPanel(ed, state) {
  const room = ed.room;
  const robot = room.robot;
  const tab = state.robotTab || "where";
  const setRobot = (patch, label = t("Robot"), coalesce = null) => ed.commit({ ...ed.room, robot: { ...ed.room.robot, ...patch } }, label, coalesce ? { coalesce } : {});
  const sub = (key, patch, label, coalesce) => setRobot({ [key]: { ...ed.room.robot[key], ...patch } }, label, coalesce);

  const tabs = h("div", { class: "re-tabs", role: "tablist", "aria-label": t("The robot") });
  for (const [id, label] of tabNames()) {
    const b = h("button", { type: "button", role: "tab", class: "re-tab", "aria-selected": String(tab === id), tabindex: tab === id ? "0" : "-1", text: label });
    b.addEventListener("click", () => {
      state.robotTab = id;
      ed.inspector.refresh();
      ed.inspector.el.querySelector('.re-tab[aria-selected="true"]')?.focus();
    });
    tabs.append(b);
  }
  arrowKeys(tabs, '[role="tab"]');
  const things = room.assets.filter((a) => !a.hidden);
  const withAnchor = (name) => things.filter((a) => entryFor(a.type)?.anchors?.[name]);
  const thingOptions = (list) => [["", t("None")], ...list.map((a) => [a.id, displayName(a)])];

  const body = {
    // ----- Home and spots -----
    where() {
      const home = robot.home;
      const check = RO.standCheck(room, home.pos[0], home.pos[2]);
      const spots = robot.spots.map((s) => h("div", { class: "re-rb-item" },
        textField({ label: t("Name"), max: 60, value: s.name, onChange: (v) => ed.commit(RO.updateSpot(ed.room, s.id, { name: v }), t("Spot"), { coalesce: `spot-name-${s.id}` }) }).el,
        slider({ label: t("Facing"), min: -180, max: 180, step: 5, value: s.facing, def: 0, format: (v) => `${Math.round(v)}°`, onChange: (v) => ed.commit(RO.updateSpot(ed.room, s.id, { facing: v }), t("Spot"), { coalesce: `spot-face-${s.id}` }) }).el,
        h("div", { class: "rs-actions re-wrap" },
          state.simulating ? button(t("Go there now"), () => ed.sim.command({ kind: "spot", id: s.id }), { icon: "play" }) : null,
          button(t("Remove the spot"), () => ed.commit(RO.removeSpot(ed.room, s.id), t("Spot")), { icon: "trash" })),
      ));
      return [
        section(t("Home"),
          hint(t("Drag the robot in the room to move its home; its ring turns it.")),
          numberRow(t("Across (X)"), cm(home.pos[0]), (v) => setRobot({ home: { ...ed.room.robot.home, pos: [v / 100, 0, ed.room.robot.home.pos[2]] } }, t("Home")), { min: -700, max: 700, suffix: "cm" }),
          numberRow(t("Depth (Z)"), cm(home.pos[2]), (v) => setRobot({ home: { ...ed.room.robot.home, pos: [ed.room.robot.home.pos[0], 0, v / 100] } }, t("Home")), { min: -600, max: 600, suffix: "cm" }),
          slider({ label: t("Facing"), min: -180, max: 180, step: 5, value: home.facing, def: 0, format: (v) => `${Math.round(v)}°`, onChange: (v) => setRobot({ home: { ...ed.room.robot.home, facing: v } }, t("Home"), "home-facing") }).el,
          check.ok ? null : h("p", { class: "rs-hint warn", role: "note", text: standWords(room, check) }),
        ),
        section(t("Spots"), hint(t("Named places it can go to: by the window, at the desk, a talk spot. Routes, scenes and the AI use them.")), ...spots, h("div", { class: "rs-actions" }, button(t("Add a spot"), () => ed.robotTool("spot"), { icon: "plus" }))),
      ];
    },
    // ----- Posture -----
    posture() {
      const p = robot.posture;
      const per = ["idle", "talking", "listening", "away"].map((k) => {
        const cur = p[k];
        const list = cur.kind === "sit" ? withAnchor("sit") : cur.kind === "lean" ? withAnchor("lean") : cur.kind === "rest" ? withAnchor("rest") : [];
        const pick = cur.kind === "stand" ? null : select(cur.kind === "rest" ? t("On") : t("Where"), thingOptions(list), cur.asset || "", (v) => sub("posture", { [k]: { ...cur, asset: v || null } }, t("Posture")));
        const none = cur.kind !== "stand" && !list.length ? hint(cur.kind === "sit" ? t("There's nothing to sit on in the room yet.") : cur.kind === "lean" ? t("There's nothing to lean on in the room yet.") : t("Without a charging pad it rests where it is.")) : null;
        return section(stateWords()[k], tiles({ label: null, name: stateWords()[k], items: C.POSTURES, value: cur.kind, compact: true, columns: 2, onChange: (v) => sub("posture", { [k]: { kind: v, asset: null } }, t("Posture")) }).el, pick, none);
      });
      return [
        section(t("How it hovers"), tiles({ label: t("Hover height"), items: C.HOVER_HEIGHTS, value: p.hover, compact: true, columns: 3, onChange: (v) => sub("posture", { hover: v }, t("Posture")) }).el, tiles({ label: t("Stance"), items: C.STANCES, value: p.stance, compact: true, columns: 3, onChange: (v) => sub("posture", { stance: v }, t("Posture")) }).el),
        ...per,
      ];
    },
    // ----- Gaze -----
    gaze() {
      return ["talking", "listening", "thinking", "idle"].map((k) => {
        const g = robot.gaze[k];
        const set = (patch, coalesce) => sub("gaze", { [k]: { ...ed.room.robot.gaze[k], ...patch } }, t("Gaze"), coalesce ? `gaze-${k}-${coalesce}` : null);
        return section(stateWords()[k],
          select(t("Looks"), C.GAZE_MODES.map((m) => [m.id, t(m.label)]), g.mode, (v) => set({ mode: v })),
          g.mode === "asset" ? select(t("At"), thingOptions(things), g.asset || "", (v) => set({ asset: v || null })) : null,
          g.mode === "point" ? h("div", {}, numberRow(t("Across (X)"), cm(g.point[0]), (v) => set({ point: [v / 100, g.point[1], g.point[2]] }), { min: -700, max: 700, suffix: "cm" }), numberRow(t("Height (Y)"), cm(g.point[1]), (v) => set({ point: [g.point[0], v / 100, g.point[2]] }), { min: 0, max: 500, suffix: "cm" }), numberRow(t("Depth (Z)"), cm(g.point[2]), (v) => set({ point: [g.point[0], g.point[1], v / 100] }), { min: -600, max: 600, suffix: "cm" })) : null,
          slider({ label: t("Turns its head (rather than just its eyes)"), min: 0, max: 1, step: 0.05, value: g.headWeight, def: 0.85, onChange: (v) => set({ headWeight: v }, "head") }).el,
          slider({ label: t("Moves its eyes"), min: 0, max: 1, step: 0.05, value: g.eyeWeight, def: 1, onChange: (v) => set({ eyeWeight: v }, "eye") }).el,
          slider({ label: t("Looks away now and then"), min: 0, max: 1, step: 0.05, value: g.lookAway, def: 0.3, onChange: (v) => set({ lookAway: v }, "away") }).el,
          toggle({ label: t("Don't stare: break eye contact naturally"), value: g.dontStare, onChange: (on) => set({ dontStare: on }) }).el,
          slider({ label: t("How far the head turns"), min: 10, max: 90, step: 5, value: g.headLimit, def: 55, format: (v) => `${Math.round(v)}°`, onChange: (v) => set({ headLimit: v }, "limit") }).el,
        );
      });
    },
    // ----- Movement and per-state choices -----
    move() {
      const mv = robot.movement;
      const st = robot.states;
      const setMv = (patch, key) => sub("movement", patch, t("Movement"), key ? `mv-${key}` : null);
      const setSt = (patch) => sub("states", patch, t("Behaviour"));
      const timeRow = (label, value, onChange) => {
        const id = `re-rb-t-${Math.random().toString(36).slice(2, 8)}`;
        const input = h("input", { id, type: "time", class: "field", value });
        input.addEventListener("change", () => onChange(input.value));
        return h("div", { class: "re-num-row" }, h("label", { for: id, text: label }), input);
      };
      return [
        section(t("Where it may go"), tiles({ label: null, name: t("Freedom"), items: C.FREEDOMS, value: mv.freedom, columns: 2, onChange: (v) => setMv({ freedom: v }) }).el, mv.freedom === "near_home" ? slider({ label: t("How far from home"), min: 0.2, max: 3, step: 0.05, value: mv.leash, def: 1.2, format: (v) => t("{n} m", { n: v.toFixed(2) }), onChange: (v) => setMv({ leash: v }, "leash") }).el : null),
        section(t("How it moves"),
          slider({ label: t("Clearance from walls and furniture"), min: 0, max: 60, step: 1, value: mv.clearance, def: 15, format: (v) => t("{n} cm", { n: Math.round(v) }), onChange: (v) => setMv({ clearance: v }, "clear") }).el,
          slider({ label: t("Speed"), min: 0.2, max: 2.5, step: 0.05, value: mv.speed, def: 0.9, format: (v) => t("{n} m/s", { n: v.toFixed(2) }), onChange: (v) => setMv({ speed: v }, "speed") }).el,
          slider({ label: t("Acceleration"), min: 0.3, max: 5, step: 0.05, value: mv.accel, def: 1.6, format: (v) => v.toFixed(2), onChange: (v) => setMv({ accel: v }, "accel") }).el,
          slider({ label: t("Turn speed"), min: 30, max: 720, step: 10, value: mv.turn, def: 220, format: (v) => t("{n}°/s", { n: Math.round(v) }), onChange: (v) => setMv({ turn: v }, "turn") }).el,
          tiles({ label: t("Gait"), items: C.GAITS, value: mv.gait, compact: true, columns: 3, onChange: (v) => setMv({ gait: v }) }).el,
          tiles({ label: t("Paths"), items: C.PATH_STYLES, value: mv.path, compact: true, columns: 3, onChange: (v) => setMv({ path: v }) }).el,
          slider({ label: t("Banks into turns"), min: 0, max: 1, step: 0.05, value: mv.banking, def: 0.4, onChange: (v) => setMv({ banking: v }, "bank") }).el,
        ),
        section(t("What it does"),
          ...["talking", "listening", "thinking", "idle"].map((k) => select(stateWords()[k], C.STATE_CHOICES[k].map((c) => [c.id, t(c.label)]), st[k], (v) => setSt({ [k]: v }))),
        ),
        section(t("When you're away"),
          slider({ label: t("Goes to rest after"), min: 1, max: 240, step: 1, value: st.away.afterMin, def: 5, format: (v) => t("{n} min", { n: Math.round(v) }), onChange: (v) => sub("states", { away: { ...ed.room.robot.states.away, afterMin: v } }, t("Behaviour"), "away-after") }).el,
          slider({ label: t("Falls asleep after"), min: 1, max: 480, step: 1, value: st.away.sleepAfterMin, def: 20, format: (v) => t("{n} min", { n: Math.round(v) }), onChange: (v) => sub("states", { away: { ...ed.room.robot.states.away, sleepAfterMin: v } }, t("Behaviour"), "away-sleep") }).el,
        ),
        section(t("At night"), toggle({ label: t("Calmer at night, resting"), value: st.night.on, onChange: (on) => setSt({ night: { ...st.night, on } }) }).el, st.night.on ? timeRow(t("From"), st.night.from, (v) => setSt({ night: { ...ed.room.robot.states.night, from: v } })) : null, st.night.on ? timeRow(t("Until"), st.night.to, (v) => setSt({ night: { ...ed.room.robot.states.night, to: v } })) : null),
        section(t("While filming"), toggle({ label: t("Stays in place"), value: st.filming.stay, onChange: (on) => setSt({ filming: { ...st.filming, stay: on } }) }).el, toggle({ label: t("Keeps a steady gaze"), value: st.filming.steadyGaze, onChange: (on) => setSt({ filming: { ...st.filming, steadyGaze: on } }) }).el, hint(t("With reduced motion switched on in your system, it doesn't roam and turns only a little."))),
      ];
    },
    // ----- Zones and routes -----
    zones() {
      const zones = robot.zones.map((z) => {
        const kind = C.ZONE_KINDS.find((k) => k.id === z.kind);
        return h("div", { class: "re-rb-item", style: `--zone:${kind?.color || "#888"}` },
          h("div", { class: "re-rb-zone-head" }, h("span", { class: "re-rb-swatch", "aria-hidden": "true" }), h("span", { text: z.name || t(kind?.label || "") }), h("span", { class: "re-scene-meta", text: t(C.ZONE_SHAPES.find((s) => s.id === z.shape)?.label || "") })),
          textField({ label: t("Name"), max: 60, value: z.name, onChange: (v) => ed.commit(RO.updateZone(ed.room, z.id, { name: v }), t("Zone"), { coalesce: `zone-name-${z.id}` }) }).el,
          select(t("Kind"), C.ZONE_KINDS.map((k) => [k.id, t(k.label)]), z.kind, (v) => ed.commit(RO.updateZone(ed.room, z.id, { kind: v }), t("Zone"))),
          hint(t(kind?.about || "")),
          h("div", { class: "rs-actions" }, button(t("Remove the zone"), () => ed.commit(RO.removeZone(ed.room, z.id), t("Zone")), { icon: "trash" })),
        );
      });
      const routes = robot.routes.map((r) => {
        const blocked = new Set(RO.blockedPoints(room, r));
        const points = h("ol", { class: "re-rb-points" }, ...r.points.map((p, i) => h("li", { class: blocked.has(i) ? "blocked" : "" },
          h("span", { class: "re-rb-point-n", text: String(i + 1) }),
          numberRow(t("Waits"), p.dwell, (v) => ed.commit(RO.updatePoint(ed.room, r.id, i, { dwell: v }), t("Route")), { min: 0, max: 600, step: 0.5, suffix: "s" }),
          select(t("Looks at"), thingOptions(things), p.look || "", (v) => ed.commit(RO.updatePoint(ed.room, r.id, i, { look: v || null }), t("Route"))),
          select(t("Does"), [["", t("Nothing")], ...things.flatMap((a) => (entryFor(a.type)?.actions || []).filter((x) => !["look", "go"].includes(x)).map((x) => [`${a.id}|${x}`, `${t(C.ACTIONS.find((c) => c.id === x)?.label || x)}: ${displayName(a)}`]))], p.action?.asset ? `${p.action.asset}|${p.action.action}` : "", (v) => {
            const [asset, action] = v.split("|");
            ed.commit(RO.updatePoint(ed.room, r.id, i, { action: v ? { asset, action, gesture: null } : null }), t("Route"));
          }),
          blocked.has(i) ? h("p", { class: "rs-hint warn", text: t("It can't get to this point.") }) : null,
          h("div", { class: "rs-actions re-wrap" },
            i > 0 ? button(t("Earlier"), () => ed.commit(RO.reorderPoint(ed.room, r.id, i, i - 1), t("Route")), { icon: "arrowUp" }) : null,
            button(t("A point after it"), () => ed.commit(RO.insertPoint(ed.room, r.id, i), t("Route")), { icon: "plus" }),
            button(t("Remove"), () => ed.commit(RO.removePoint(ed.room, r.id, i), t("Route")), { icon: "trash" })),
        )));
        const when = r.when;
        return h("div", { class: "re-rb-item" },
          textField({ label: t("Name"), max: 60, value: r.name, onChange: (v) => ed.commit(RO.updateRoute(ed.room, r.id, { name: v }), t("Route"), { coalesce: `route-name-${r.id}` }) }).el,
          tiles({ label: t("Goes"), items: C.ROUTE_MODES, value: r.mode, compact: true, columns: 2, onChange: (v) => ed.commit(RO.updateRoute(ed.room, r.id, { mode: v }), t("Route")) }).el,
          select(t("Runs"), C.ROUTE_WHEN.map((w) => [w.id, t(w.label)]), when.kind, (v) => ed.commit(RO.updateRoute(ed.room, r.id, { when: { kind: v } }), t("Route"))),
          when.kind === "every" ? numberRow(t("Every"), when.everyMin, (v) => ed.commit(RO.updateRoute(ed.room, r.id, { when: { everyMin: v } }), t("Route")), { min: 1, max: 240, suffix: t("min") }) : null,
          when.kind === "scene" ? select(t("In the scene"), [["", t("None")], ...room.scenes.map((sc) => [sc.id, sc.name || t("Scene")])], when.scene || "", (v) => ed.commit(RO.updateRoute(ed.room, r.id, { when: { scene: v || null } }), t("Route"))) : null,
          points,
          h("div", { class: "rs-actions re-wrap" },
            button(state.routeTool === r.id ? t("Done adding points") : t("Add points in the room"), () => ed.robotTool(state.routeTool === r.id ? null : `route:${r.id}`), { icon: "plus" }),
            state.simulating && r.points.length ? button(t("Test run"), () => ed.sim.command({ kind: "route", id: r.id }), { icon: "play" }) : null,
            button(t("Remove the route"), () => ed.commit(RO.removeRoute(ed.room, r.id), t("Route")), { icon: "trash" })),
        );
      });
      return [
        section(t("Zones"), hint(t("Drawn in the plan from above. No-go: never enters; allowed: stays inside; slow, quiet, stage, rest.")), ...zones,
          h("div", { class: "rs-actions re-wrap" }, ...C.ZONE_SHAPES.map((s) => button(t("Draw: {shape}", { shape: t(s.label) }), () => ed.robotTool(`zone-${s.id}`), { icon: "pen" })))),
        section(t("Routes"), ...routes, h("div", { class: "rs-actions" }, button(t("New route"), () => {
          const r = RO.addRoute(ed.room, t("Route {n}", { n: ed.room.robot.routes.length + 1 }));
          ed.commit(r.room, t("Route"));
          ed.robotTool(`route:${r.id}`);
        }, { icon: "plus" }))),
      ];
    },
    // ----- Autonomy -----
    auto() {
      const au = robot.autonomy;
      const q = au.quotas;
      const setQ = (k) => (v) => sub("autonomy", { quotas: { ...ed.room.robot.autonomy.quotas, [k]: v } }, t("On its own"), `q-${k}`);
      return [
        section(t("How much it does on its own"), tiles({ label: null, name: t("Autonomy"), items: C.AUTONOMY_PRESETS, value: au.preset, columns: 3, compact: true, onChange: (v) => {
          const p = C.AUTONOMY_PRESETS.find((x) => x.id === v);
          const patch = { autonomy: { ...ed.room.robot.autonomy, preset: v, quotas: { ...ed.room.robot.autonomy.quotas, ...(p.quotas || {}) } } };
          if (p.freedom) patch.movement = { ...ed.room.robot.movement, freedom: p.freedom };
          if (p.idle) patch.states = { ...ed.room.robot.states, idle: p.idle };
          setRobot(patch, t("On its own"));
        } }).el),
        section(t("Limits"),
          slider({ label: t("Visits per hour"), min: 0, max: 120, step: 1, value: q.maxPerHour, def: 6, format: (v) => `${Math.round(v)}`, onChange: setQ("maxPerHour") }).el,
          slider({ label: t("Visits per conversation"), min: 0, max: 500, step: 1, value: q.maxPerSession, def: 40, format: (v) => `${Math.round(v)}`, onChange: setQ("maxPerSession") }).el,
          slider({ label: t("Visits to one thing per hour"), min: 0, max: 60, step: 1, value: q.perAssetPerHour, def: 6, format: (v) => `${Math.round(v)}`, onChange: setQ("perAssetPerHour") }).el,
          slider({ label: t("Pause between visits"), min: 0, max: 600, step: 1, value: q.globalCooldownSec, def: 12, format: (v) => t("{n} s", { n: Math.round(v) }), onChange: setQ("globalCooldownSec") }).el,
          slider({ label: t("Pause before the same thing again"), min: 0, max: 3600, step: 5, value: q.perAssetCooldownSec, def: 45, format: (v) => t("{n} s", { n: Math.round(v) }), onChange: setQ("perAssetCooldownSec") }).el,
          slider({ label: t("Back home after"), min: 1, max: 120, step: 1, value: au.homeReturnSec, def: 8, format: (v) => t("{n} s", { n: Math.round(v) }), onChange: (v) => sub("autonomy", { homeReturnSec: v }, t("On its own"), "home-return") }).el,
        ),
        section(t("When you start talking"), select(t("If it's busy"), C.INTERRUPT_POLICIES.map((p) => [p.id, t(p.label)]), au.interrupt, (v) => sub("autonomy", { interrupt: v }, t("On its own")))),
        section(t("Sounds"), slider({ label: t("Sounds of things it uses"), min: 0, max: 100, step: 1, value: au.foley, def: 65, format: (v) => `${Math.round(v)}%`, onChange: (v) => sub("autonomy", { foley: v }, t("On its own"), "foley") }).el),
        section(t("Rules"), hint(t("Each thing's rules are in its Robot rules tab.")), h("div", { class: "rs-actions" }, button(t("Reset every thing's rules"), () => ed.commit({ ...ed.room, assets: ed.room.assets.map((a) => ({ ...a, rules: defaultRules(entryFor(a.type)) })) }, t("Rules")), { icon: "undo" }))),
      ];
    },
  }[tab]();

  return [h("h2", { class: "re-title", text: t("The robot") }), tabs, ...body];
}

function standWords(room, check) {
  if (check.reason === "outside") return t("The robot can't stand there: outside the room");
  if (check.reason === "nogo") return t("The robot can't stand there: a no-go zone");
  const a = room.assets.find((x) => x.id === check.with);
  return t("The robot can't stand there: inside the {name}", { name: a ? displayName(a) : "" });
}
