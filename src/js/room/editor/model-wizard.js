// ---------- "Add my model": a .glb of your own in the catalog ----------
// One dialog, in the order the questions come up: the file (seen on a turntable next to the robot's height),
// its name, category and where it goes, its size (units; the flat tops found by looking down on it), the
// anchors its node names give (anchor_robot_stand, socket_hand_grip, DynamicCanvas, surface_*, sit_*,
// look_*), what the robot may do with it, which materials take colors (c1, c2, c3), and "Stylize".
// The helper checks and cleans the file again (server/rooms.js) and keeps it with its entry.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { t, tp, nf } from "../../i18n.js";
import { h, section, toggle, textField, button, hint } from "../../robot/studio/ui.js";
import { CATEGORIES } from "../catalog.mjs";
import * as C from "../choices.mjs";
import { loadModel, TRIANGLE_CAP, MAX_TEXTURE } from "../render/custom-model.js";
import { loadCustomModels } from "../custom.js";

const ROBOT_HEIGHT = 1.31;
// Made when shown (the words are in the interface language)
const units = () => [
  { id: "1", label: t("Meters") },
  { id: "0.01", label: t("Centimeters") },
  { id: "0.001", label: t("Millimeters") },
  { id: "0.0254", label: t("Inches") },
];
const r2 = (v) => Math.round(v * 100) / 100;

// What the file holds, measured in its own units
export function analyse(scene) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  let triangles = 0;
  let maxTexture = 0;
  const materials = new Map();
  const nodes = [];
  scene.traverse((o) => {
    if (o.name) nodes.push(o);
    if (!o.isMesh) return;
    const g = o.geometry;
    triangles += Math.floor((g.index ? g.index.count : g.attributes.position.count) / 3);
    for (const m of [].concat(o.material)) {
      if (m?.name) materials.set(m.name, m);
      for (const k of ["map", "normalMap", "roughnessMap"]) if (m?.[k]?.image) maxTexture = Math.max(maxTexture, m[k].image.width || 0, m[k].image.height || 0);
    }
  });
  const base = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
  const at = (o) => o.getWorldPosition(new THREE.Vector3()).sub(base);
  const first = (re) => nodes.find((n) => re.test(n.name));
  const anchors = {};
  for (const [key, re] of [["stand", /^anchor_robot_stand$/], ["grip", /^socket_hand_grip$/], ["canvas", /^DynamicCanvas$/], ["sit", /^sit_/], ["look", /^look_/]]) {
    const n = first(re);
    if (n) anchors[key] = at(n);
  }
  const namedSurfaces = nodes.filter((n) => /^surface_/.test(n.name)).map((n) => {
    const p = at(n);
    const b = n.isMesh ? new THREE.Box3().setFromObject(n) : null;
    return { id: n.name.slice(8).replace(/[^\w-]/g, "").slice(0, 24) || undefined, x: p.x, y: b ? b.max.y - box.min.y : p.y, z: p.z, w: b ? b.max.x - b.min.x : null, d: b ? b.max.z - b.min.z : null };
  });
  const recolor = ["c1", "c2", "c3"].filter((k) => materials.has(k));
  const colorDefaults = Object.fromEntries(recolor.map((k) => [k, `#${materials.get(k).color?.getHexString() || "c9b8a0"}`]));
  return { box, base, triangles, maxTexture, anchors, namedSurfaces, recolor, colorDefaults };
}

// Flat tops, found by looking straight down on a grid over the model (in its own units)
export function detectSurfaces(scene, box) {
  const ray = new THREE.Raycaster();
  const H = box.max.y - box.min.y;
  const hits = [];
  const n = 9;
  const meshes = [];
  scene.traverse((o) => o.isMesh && meshes.push(o));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = box.min.x + ((i + 0.5) / n) * (box.max.x - box.min.x);
      const z = box.min.z + ((j + 0.5) / n) * (box.max.z - box.min.z);
      ray.set(new THREE.Vector3(x, box.max.y + H, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(meshes, false)[0];
      if (!hit?.face) continue;
      const up = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (up.y > 0.9 && hit.point.y - box.min.y > H * 0.15) hits.push(hit.point);
    }
  }
  // Heights that many rays agree on are surfaces
  const groups = [];
  for (const p of hits) {
    const g = groups.find((x) => Math.abs(x.y - p.y) < H * 0.03);
    if (g) g.points.push(p);
    else groups.push({ y: p.y, points: [p] });
  }
  return groups
    .filter((g) => g.points.length >= 4)
    .sort((a, b) => b.points.length - a.points.length)
    .slice(0, 3)
    .map((g) => {
      const xs = g.points.map((p) => p.x);
      const zs = g.points.map((p) => p.z);
      const step = Math.max((box.max.x - box.min.x) / n, (box.max.z - box.min.z) / n);
      const minX = Math.min(...xs) - step / 2;
      const maxX = Math.max(...xs) + step / 2;
      const minZ = Math.min(...zs) - step / 2;
      const maxZ = Math.max(...zs) + step / 2;
      return { x: (minX + maxX) / 2 - (box.min.x + box.max.x) / 2, z: (minZ + maxZ) / 2 - (box.min.z + box.max.z) / 2, y: g.y - box.min.y, w: maxX - minX, d: maxZ - minZ };
    });
}

// A small turntable: the model, and a pale stand-in of the robot's height beside it
function turntable() {
  const canvas = h("canvas", { class: "re-wiz-stage", width: 360, height: 260, role: "img", "aria-label": t("The model next to the robot's height") });
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return { el: h("p", { class: "rs-hint", text: t("No 3D preview here (WebGL isn't available).") }), show() {}, dispose() {} };
  }
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  const sun = new THREE.DirectionalLight("#fff1e0", 2);
  sun.position.set(-2, 4, 3);
  scene.add(sun, new THREE.HemisphereLight("#e8eeff", "#a89a86", 0.6));
  const robot = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, ROBOT_HEIGHT - 0.56, 6, 16), new THREE.MeshStandardMaterial({ color: "#f2c49a", transparent: true, opacity: 0.45, roughness: 0.6 }));
  robot.position.y = ROBOT_HEIGHT / 2;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ color: "#3a312a", roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor, robot);
  const camera = new THREE.PerspectiveCamera(30, 360 / 260, 0.01, 100);
  const turn = new THREE.Group();
  scene.add(turn);
  let raf = 0;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const draw = () => {
    if (!still) turn.rotation.y += 0.01;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(draw);
  };
  return {
    el: canvas,
    // model: the scene; unit: meters per unit
    show(model, unit) {
      turn.clear();
      if (!model) return;
      const copy = model.clone(true);
      copy.scale.setScalar(unit);
      copy.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(copy);
      copy.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      turn.add(copy);
      const size = box.getSize(new THREE.Vector3());
      turn.position.x = Math.max(size.x, size.z) / 2 + 0.45;
      robot.position.x = -0.35;
      const tall = Math.max(size.y, ROBOT_HEIGHT);
      const wide = turn.position.x + Math.max(size.x, size.z) / 2 + 0.5;
      const dist = Math.max(tall / 2 / Math.tan((15 * Math.PI) / 180), wide / Math.tan((15 * Math.PI) / 180) / camera.aspect) * 1.1;
      camera.position.set(wide / 2 - 0.4, tall * 0.55 + dist * 0.25, dist);
      camera.lookAt(wide / 2 - 0.4, tall * 0.45, 0);
      if (!raf) draw();
    },
    dispose() {
      cancelAnimationFrame(raf);
      renderer.dispose();
      renderer.forceContextLoss?.();
      pmrem.dispose();
    },
  };
}

// Opens the wizard; resolves to the saved entry, or null
export function addModelWizard() {
  return new Promise((resolve) => {
    const back = h("div", { class: "modal-backdrop re-new" });
    const box = h("div", { class: "modal re-new-box re-wizard", role: "dialog", "aria-modal": "true", "aria-labelledby": "re-wiz-title" });
    const stage = turntable();
    const status = h("p", { class: "rs-hint", role: "status" });
    const state = { bytes: null, scene: null, info: null, surfaces: [], unit: 1, slots: ["floor"], actions: ["go", "touch"], stylize: true, category: "decor", name: "", w: 0.6, d: 0.6, height: 0.8 };
    const finish = (value) => {
      stage.dispose();
      back.remove();
      resolve(value);
    };

    // 1. The file
    const file = h("input", { type: "file", accept: ".glb,model/gltf-binary", class: "field", "aria-label": t("Your model (.glb)") });
    const details = h("div", { class: "re-wiz-details", hidden: true });
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      if (!f) return;
      if (f.size > 25 * 1024 * 1024) return void (status.textContent = t("The model is bigger than 25 MB."));
      status.textContent = t("Reading the model…");
      try {
        state.bytes = await f.arrayBuffer();
        state.scene = await loadModel(null, state.bytes);
        state.info = analyse(state.scene);
        state.name ||= f.name.replace(/\.glb$/i, "").replace(/[_-]+/g, " ").slice(0, 60);
        // A model taller than a house is probably in centimeters
        const rawH = state.info.box.max.y - state.info.box.min.y;
        state.unit = rawH > 20 ? 0.01 : 1;
        state.surfaces = detectSurfaces(state.scene, state.info.box);
        // Its node names say what it's for: a seat (sit_*) can be sat on, a grip (socket_hand_grip) carried
        if (state.info.anchors.sit) state.actions = [...new Set([...state.actions, "sit"])];
        if (state.info.anchors.grip) state.actions = [...new Set([...state.actions, "carry"])];
        status.textContent = "";
        details.hidden = false;
        render();
      } catch (err) {
        state.scene = null;
        details.hidden = true;
        status.textContent = t("That file couldn't be read as a .glb model ({reason}).", { reason: err.message || "?" });
      }
    });

    function render() {
      const info = state.info;
      const raw = info.box.getSize(new THREE.Vector3());
      const u = state.unit;
      state.w = r2(raw.x * u);
      state.d = r2(raw.z * u);
      state.height = r2(raw.y * u);
      stage.show(state.scene, u);
      details.replaceChildren();
      // 2. Name, category, where it goes
      const cat = h("select", { class: "field", "aria-label": t("Category") }, ...CATEGORIES.map((c) => h("option", { value: c.id, text: t(c.label) })));
      cat.value = state.category;
      cat.addEventListener("change", () => (state.category = cat.value));
      const slotToggles = C.SLOTS.filter((s) => s.id !== "stack").map((s) => toggle({ label: t(s.label), value: state.slots.includes(s.id), onChange: (on) => (state.slots = on ? [...new Set([...state.slots, s.id])] : state.slots.filter((x) => x !== s.id)) }).el);
      // 3. Size and surfaces
      const unit = h("select", { class: "field", "aria-label": t("The model is made in") }, ...units().map((x) => h("option", { value: x.id, text: x.label })));
      unit.value = units().some((x) => Number(x.id) === u) ? String(u) : "1";
      unit.addEventListener("change", () => {
        state.unit = Number(unit.value);
        render();
      });
      const heightId = "re-wiz-height";
      const height = h("input", { id: heightId, type: "number", class: "field re-num", min: 2, max: 400, step: 1, value: String(Math.round(state.height * 100)) });
      height.addEventListener("change", () => {
        const want = Number(height.value) / 100;
        if (want > 0.02 && raw.y > 0) {
          state.unit = want / raw.y;
          render();
        }
      });
      const times = state.height / ROBOT_HEIGHT;
      const surfaces = h("ul", { class: "re-wiz-surfaces" }, ...state.surfaces.map((sf, i) => h("li", {}, h("span", { text: t("A flat top at {h} cm, {w} × {d} cm", { h: Math.round(sf.y * u * 100), w: Math.round(sf.w * u * 100), d: Math.round(sf.d * u * 100) }) }), button(t("Remove"), () => {
        state.surfaces.splice(i, 1);
        render();
      }))));
      // 4. Anchors, 5. actions and colors, 6. stylize, and the triangle check
      const found = Object.keys(info.anchors);
      const anchorWords = { stand: t("Where the robot stands"), grip: t("Where it holds it"), canvas: t("A screen it can draw on"), sit: t("Where it sits"), look: t("Where it looks") };
      const actionToggles = C.ACTIONS.filter((a) => a.id !== "look").map((a) => toggle({ label: t(a.label), value: state.actions.includes(a.id), onChange: (on) => (state.actions = on ? [...new Set([...state.actions, a.id])] : state.actions.filter((x) => x !== a.id)) }).el);
      const heavy = Object.entries(TRIANGLE_CAP).filter(([, cap]) => info.triangles > cap).map(([lvl]) => lvl);
      const levelWords = { low: t("Low"), medium: t("Medium"), high: t("High"), ultra: t("Ultra") };
      details.append(
        section(t("2. What it is"), textField({ label: t("Name"), max: 60, value: state.name, onChange: (v) => (state.name = v) }).el, h("div", { class: "rs-field" }, h("span", { class: "rs-label", text: t("Category") }), cat), h("div", { class: "rs-label", text: t("It goes on") }), ...slotToggles),
        section(t("3. Size"), h("div", { class: "rs-field" }, h("span", { class: "rs-label", text: t("The model is made in") }), unit), h("div", { class: "re-num-row" }, h("label", { for: heightId, text: t("Height") }), height, h("span", { class: "re-unit", text: "cm" })), hint(t("{w} × {d} cm on the floor, about {x} times the robot's height.", { w: Math.round(state.w * 100), d: Math.round(state.d * 100), x: nf(Math.round(times * 10) / 10) })), state.surfaces.length ? surfaces : hint(t("No flat top found: nothing can be put on it."))),
        section(t("4. Anchors"), found.length ? h("ul", { class: "re-wiz-surfaces" }, ...found.map((k) => h("li", { text: anchorWords[k] }))) : null, hint(t("Read from the model's node names: anchor_robot_stand, socket_hand_grip, DynamicCanvas, surface_*, sit_* and look_*. Without them the robot stands in front of it and looks at its middle."))),
        section(t("5. What the robot may do with it"), ...actionToggles, info.recolor.length ? hint(t("These take your colors: {list}.", { list: info.recolor.join(", ") })) : hint(t("Name materials c1, c2 and c3 to make them recolorable."))),
        section(t("6. Look"), toggle({ label: t("Stylize: soft materials like the rest of the room"), value: state.stylize, onChange: (on) => (state.stylize = on) }).el),
        hint(tp("{n} triangle", "{n} triangles", info.triangles)),
        heavy.length ? h("p", { class: "rs-hint warn", role: "note", text: t("Too detailed for {levels}: it's shown as a box of its size there.", { levels: heavy.map((l) => levelWords[l]).join(", ") }) }) : null,
        info.maxTexture > MAX_TEXTURE ? hint(t("Its pictures are bigger than {n} px and are made smaller.", { n: MAX_TEXTURE })) : null,
      );
    }

    const add = button(t("Add to my models"), async () => {
      if (!state.scene || !state.bytes) return void (status.textContent = t("Choose a .glb file first."));
      if (!state.slots.length) return void (status.textContent = t("Choose at least one place it goes on."));
      const u = state.unit;
      const v3 = (p) => (p ? [r2(p.x * u), r2(p.y * u), r2(p.z * u)] : null);
      const surfaces = [...state.info.namedSurfaces.map((s) => ({ ...s, w: s.w ?? state.w / u, d: s.d ?? state.d / u })), ...state.surfaces].slice(0, 8).map((s, i) => ({ id: s.id || `top${i + 1}`, x: r2(s.x * u), y: r2(s.y * u), z: r2(s.z * u), w: Math.max(0.05, r2(s.w * u)), d: Math.max(0.05, r2(s.d * u)) }));
      const anchors = Object.fromEntries(Object.entries(state.info.anchors).map(([k, p]) => [k, v3(p)]));
      const meta = { label: state.name.trim() || t("My model"), category: state.category, slots: state.slots, footprint: { w: state.w, d: state.d }, height: state.height, surfaces, anchors, actions: state.actions, stylize: state.stylize, unit: u, colorDefaults: state.info.colorDefaults };
      add.disabled = true;
      status.textContent = t("Saving…");
      try {
        const res = await fetch(`/api/room-assets?meta=${encodeURIComponent(JSON.stringify(meta))}`, { method: "POST", headers: { "Content-Type": "model/gltf-binary" }, body: state.bytes });
        const entry = await res.json();
        if (!res.ok) throw new Error(entry.error || res.status);
        await loadCustomModels({ force: true });
        finish(entry);
      } catch (err) {
        add.disabled = false;
        status.textContent = t("The model couldn't be saved ({reason}).", { reason: err.message });
      }
    }, { primary: true, icon: "check" });

    box.append(
      h("h2", { id: "re-wiz-title", text: t("Add my model") }),
      h("div", { class: "re-wiz-cols" },
        h("div", { class: "re-wiz-main" }, section(t("1. The file"), file, hint(t("A .glb file (glTF 2.0), up to 25 MB. It stays on this computer."))), status, details),
        h("div", { class: "re-wiz-side" }, stage.el),
      ),
      h("div", { class: "rs-actions re-wiz-actions" }, button(t("Cancel"), () => finish(null)), add),
    );
    box.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        finish(null);
      }
    });
    back.append(box);
    document.body.append(back);
    file.focus();
  });
}
