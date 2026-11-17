// ---------- The asset lab: contact sheets for the visual review ----------
// Loaded only with ?room-lab (scripts/asset-sheet.js drives it). Every asset is built by its real builder,
// set on a neutral turntable and drawn from the front, at three-quarters and from the top, so the sheet
// can be checked against the art rules (docs/design/room.md): faceting, hard edges, floating, parts
// passing through each other, thin parts that shimmer, scale, silhouettes and colors.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { CATALOG, CATALOG_BY_ID } from "../catalog.mjs";
import { buildAsset, hasBuilder } from "./assets/index.js";
import { texturesSettled } from "./kit/textures.js";

const VIEWS = {
  front: { yaw: 0, pitch: 0.12 },
  three: { yaw: -0.68, pitch: 0.38 },
  top: { yaw: -0.001, pitch: 1.5 },
};

function makeStage(renderer) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.45;
  scene.background = new THREE.Color("#dcd8d0");
  const key = new THREE.DirectionalLight("#fff1e0", 2.2);
  key.position.set(-2.5, 4, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 6;
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.015;
  const fill = new THREE.DirectionalLight("#dfe8ff", 0.7);
  fill.position.set(3, 2, 2);
  const rim = new THREE.DirectionalLight("#ffffff", 1.1);
  rim.position.set(1, 3, -3);
  const hemi = new THREE.HemisphereLight("#e8eeff", "#a89a86", 0.55);
  scene.add(key, fill, rim, hemi);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  return { scene, key };
}

async function renderSheet({ ids = null, level = "high", tile = 300, views = ["front", "three", "top"], columns = 3, only = "hero" } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(tile, tile, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const { scene, key } = makeStage(renderer);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 60);
  const list = (ids ? ids.map((id) => CATALOG_BY_ID[id]) : CATALOG.filter((a) => (only === "hero" ? a.hero : true))).filter((d) => d && hasBuilder(d));
  const built = list.map((def) => ({ def, b: buildAsset(def, { id: def.id }, level) }));
  // Let the textures arrive before drawing
  scene.add(...built.map((x) => x.b.group));
  built.forEach((x) => (x.b.group.visible = false));
  renderer.compile(scene, camera);
  await texturesSettled();
  const cellW = tile * views.length;
  const rows = Math.ceil(built.length / columns);
  const sheet = document.createElement("canvas");
  sheet.width = cellW * columns;
  sheet.height = (tile + 26) * rows;
  const ctx = sheet.getContext("2d");
  ctx.fillStyle = "#c9c4bb";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  const stats = [];
  for (let i = 0; i < built.length; i++) {
    const { def, b } = built[i];
    b.group.visible = true;
    // Wall things stand upright facing +z; ceiling things hang from y = 0, so lift them into view
    const box = new THREE.Box3().setFromObject(b.group);
    if (def.slots[0] === "ceiling") b.group.position.y = -box.min.y + 0.02;
    if (def.slots[0] === "wall") b.group.position.y = 0.02;
    box.setFromObject(b.group);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(0.12, size.length() / 2);
    key.shadow.camera.left = key.shadow.camera.bottom = -radius * 4;
    key.shadow.camera.right = key.shadow.camera.top = radius * 4;
    key.shadow.camera.far = radius * 12 + 8;
    key.shadow.camera.updateProjectionMatrix();
    key.target.position.copy(centre);
    key.position.copy(centre).add(new THREE.Vector3(-2.5, 4, 3).normalize().multiplyScalar(radius * 4 + 2));
    let tris = 0;
    let calls = 0;
    b.group.traverse((o) => {
      if (o.isMesh) {
        calls++;
        tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      }
    });
    stats.push({ id: def.id, drawCalls: calls, triangles: Math.round(tris), size: size.toArray().map((v) => Math.round(v * 100) / 100) });
    const col = i % columns;
    const row = Math.floor(i / columns);
    views.forEach((v, j) => {
      const view = VIEWS[v];
      const dist = (radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.08;
      camera.position.set(centre.x + Math.sin(view.yaw) * Math.cos(view.pitch) * dist, centre.y + Math.sin(view.pitch) * dist, centre.z + Math.cos(view.yaw) * Math.cos(view.pitch) * dist);
      camera.lookAt(centre);
      b.update?.(0.016, 1.3, {});
      renderer.render(scene, camera);
      ctx.drawImage(renderer.domElement, col * cellW + j * tile, row * (tile + 26), tile, tile);
    });
    ctx.fillStyle = "#2b2a28";
    ctx.font = "600 15px system-ui, sans-serif";
    ctx.fillText(`${def.label}  ·  ${calls} calls · ${Math.round(tris / 100) / 10}k tris · ${size.x.toFixed(2)}×${size.z.toFixed(2)}×${size.y.toFixed(2)} m`, col * cellW + 8, row * (tile + 26) + tile + 18);
    b.group.visible = false;
  }
  const url = sheet.toDataURL("image/jpeg", 0.92);
  renderer.dispose();
  return { url, stats };
}

window.friendsRoomLab = { renderSheet };
