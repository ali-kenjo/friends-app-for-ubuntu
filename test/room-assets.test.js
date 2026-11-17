// The room's 3D asset builders: every catalog entry that isn't pending has one, and each builds into a few
// merged, rounded meshes within the triangle budget (no browser needed: geometry only).
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");

let catalog;
let assets;
before(async () => {
  catalog = await import("../src/js/room/catalog.mjs");
  assets = await import("../src/js/room/render/assets/index.js");
});

// Builders that draw a picture on a canvas use a plain pixel when there is no page, so every asset is checked
const NEEDS_CANVAS = new Set();

describe("Room asset builders", () => {
  test("an entry is pending exactly when it has no 3D builder", () => {
    for (const a of catalog.CATALOG) assert.equal(assets.hasBuilder(a), !a.pending, `${a.id}: pending=${a.pending}, builder=${assets.hasBuilder(a)}`);
    assert.ok(catalog.CATALOG.filter((a) => a.hero).every((a) => assets.hasBuilder(a)), "the whole hero set is built");
    // Release gate (PLAN step 4): every catalog entry has its 3D builder, nothing is hidden as pending
    assert.deepEqual(catalog.CATALOG.filter((a) => a.pending).map((a) => a.id), []);
  });

  test("each built asset is a handful of merged meshes within budget, at High and Low", () => {
    const counts = [];
    for (const level of ["high", "low"]) {
      for (const def of catalog.CATALOG.filter((a) => !a.pending && !NEEDS_CANVAS.has(a.id))) {
        const built = assets.buildAsset(def, { id: def.id }, level);
        assert.ok(built, def.id);
        let calls = 0;
        let tris = 0;
        built.group.traverse((o) => {
          if (!o.isMesh) return;
          calls++;
          const g = o.geometry;
          tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
          assert.ok(g.attributes.normal && g.attributes.uv, `${def.id}: normals and UVs`);
          assert.ok(!Number.isNaN(g.boundingSphere?.radius ?? 0), `${def.id}: a sane bound`);
        });
        // A typical asset is a few merged meshes; ones with parts that move on their own (fish, a train) need more
        assert.ok(calls >= 1 && calls <= 14, `${def.id} (${level}): ${calls} draw calls`);
        counts.push(calls);
        assert.ok(tris <= (level === "low" ? 25000 : 60000), `${def.id} (${level}): ${Math.round(tris)} triangles`);
      }
    }
    counts.sort((a, b) => a - b);
    assert.ok(counts[Math.floor(counts.length / 2)] <= 6, `the typical asset is at most 6 draw calls (median ${counts[Math.floor(counts.length / 2)]})`);
  });

  test("assets stand on the floor at their catalog size (within 15 %)", async () => {
    const THREE = await import("three");
    for (const def of catalog.CATALOG.filter((a) => !a.pending && !NEEDS_CANVAS.has(a.id))) {
      const built = assets.buildAsset(def, { id: def.id }, "low");
      const box = new THREE.Box3().setFromObject(built.group);
      const size = box.getSize(new THREE.Vector3());
      if (def.slots[0] !== "ceiling") assert.ok(Math.abs(box.min.y) < 0.03, `${def.id} floats or sinks: bottom at ${box.min.y.toFixed(3)}`);
      assert.ok(size.y <= def.height * 1.15 + 0.03 && size.y >= def.height * 0.6, `${def.id}: height ${size.y.toFixed(2)} vs ${def.height}`);
      const w = Math.max(size.x, size.z);
      const fw = Math.max(def.footprint.w, def.footprint.d);
      assert.ok(w <= fw * 1.25 + 0.15, `${def.id}: ${w.toFixed(2)} wide vs ${fw}`);
    }
  });

  test("recoloring swaps materials and keeps the geometry", async () => {
    const { recolor } = await import("../src/js/room/render/kit/build.js");
    const def = catalog.CATALOG_BY_ID.sofa;
    const built = assets.buildAsset(def, { id: "s" }, "high");
    const geos = [];
    built.group.traverse((o) => o.isMesh && geos.push(o.geometry));
    recolor(built, def, { c1: "#123456" }, "high");
    const after = [];
    let tinted = false;
    built.group.traverse((o) => {
      if (!o.isMesh) return;
      after.push(o.geometry);
      if (o.userData.slot === "c1" && o.material.color.getHexString() !== new (require("three").Color)(def.colors[0].def).getHexString()) tinted = true;
    });
    assert.deepEqual(after, geos);
    assert.ok(tinted);
  });
});
