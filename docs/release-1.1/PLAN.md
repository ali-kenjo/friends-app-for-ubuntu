# Friends 1.1 "The Room": plan and progress

Source: `friends-room-editor-prompt.md` (the handoff prompt, kept outside the repo), binding rules in
`docs/release-0.7/RULES.md`. Branch `release/1.1-room` from `79a7138` (v1.0.0). Decisions: `DECISIONS.md`.

A box is ticked only when the item is **built, tested and verified on screen**. `[~]` means started,
with what is left written next to it. A fresh session continues from this file and DECISIONS.md.

**Where we are:** see "Status" at the bottom.

---

## Step 1: Baseline

- [x] Branch `release/1.1-room` from `79a7138`.
- [x] Baseline checks recorded: `npm run check` ok, `npm test` 857/857, e2e and a11y results in DECISIONS.md (B1).
- [x] Before screenshots of every place (27) and the 3 v1 presets in voice mode, Low and High:
      `docs/design/screenshots/1.1/before/` (script `scripts/room-shots.js`, later `npm run design:rooms`).
- [~] Performance numbers per tier (draw calls and triangles summed over every pass, fps on software
      WebGL and, where possible, the real GPU): DECISIONS.md (B2).
      **Left:** real-GPU frame rates (only SwiftShader draw calls/triangles are recorded so far, DECISIONS B2).
- [x] Settings fixtures from 0.6, 0.7, 0.8 and 1.0, with and without saved v1 assets and Builder items:
      `test/fixtures/settings-{0.6,0.7,0.8,1.0}*.json`.

## Step 2: Data

- [x] `src/js/room/model.mjs`: schema (§4.4), ids, limits (§4.2), `sanitizeRoom()`, `migrateRoom()`,
      `roomSummary()`; units meters/degrees; unknown asset types dropped with a note.
- [x] `src/js/room/catalog.mjs`: catalog entry shape (§4.3); entries for every existing asset first
      (104 Builder props, 15 v1 assets, the places' set pieces, 5 companions), then the new ones; `labels()`;
      registered in `scripts/lib/i18n-scan.js`. Fix the malformed `sand_timer` entry.
- [x] `src/js/room/templates.mjs`: 27 places + 3 v1 presets + "Empty" as room documents; `labels()`.
- [x] `src/js/room/rules.mjs`: `canDo(room, actor, assetId, action, context) → { ok, reason }`.
- [x] `src/js/room/nav.mjs`: grid from oriented footprints, clearance, zones; A*; string pulling +
      Catmull-Rom; reachability.
- [x] `src/js/room/schedule.mjs`: scenes and schedules (active scene and active assets now).
- [x] `server/rooms.js`: store `<dataDir>/rooms/<id>.json` (atomic, debounced), `room-assets/<id>.glb`+`.json`;
      API `GET/POST /api/rooms`, `GET/PUT/DELETE /api/rooms/:id`, `POST /api/rooms/:id/duplicate`,
      `GET /api/rooms/:id/export` (.friends-room zip), `POST /api/rooms/import`, `POST /api/room-assets`,
      `GET/DELETE /api/room-assets/:id`; session auth.
- [~] Migrations (§4.5) with fixtures: places → template rooms; `room.builder.items` → assets;
      builder styles/rig → architecture/mood; `roomEditor.assets` → assets in the room in use only
      (radians → degrees, `customGlbId` → `glb`); `behaviorEngine` → robot movement/autonomy/routes/home;
      weights/dwells → per-asset rules; `toolPermissions` + `robot.aiAllowed` → one permission model;
      `robot.customRooms` → rooms; built-in looks → templates; each character's `look.room` → its own room.
      `robot.room` and `look.room` become `{ layoutId }`; legacy fields stay readable for one release.
      **Left:** built-in looks (looks.mjs) still hold 1.0 room objects and the Studio still writes them (the engine draws those through the old path; they convert on the next start). Goes with the editor (step 5).
- [~] Backups (`server/backup.js`) and studio bundles (`server/storage/studio-bundle.js`) include `rooms/`
      and `room-assets/`; bundle schema bumped; 1.0 bundles and 0.7 `.robot-room.json` still import.
      **Left:** backups include rooms/ and room-assets/ (tested) and 0.7 `.robot-room.json` imports through /api/rooms/import; the studio bundle (`server/storage/studio-bundle.js`) doesn't carry rooms yet and its schema isn't bumped.
- [x] Unit + HTTP tests for all of the above.

## Step 3: Rendering foundations

- [x] `src/js/room/render/kit/geometry.js`: `roundedBox`, `roundedCylinder`, `capsule`, `latheProfile`,
      `tubeAlong`, `extrudeRounded`, `cushion`, `leaf`, `petal`, `book`; creased normals (~35°), tangents,
      tier segment counts (48/32/16 profiles, 4/3/2 bevels); per-material merge helper.
- [x] `kit/materials.js`: the §3 families as factories with c1–c3 slots; material cache by family+colors;
      recolor without rebuilding geometry.
- [x] `kit/textures.js` + worker: procedural, seeded, cached maps (wood grain, fabric weave, bouclé, leather,
      terrazzo, brick, plaster, tile, concrete, grass, paper fibre, brushed metal) at 256/512/1024;
      normal from height in the worker (`OffscreenCanvas`), idle-time fallback; no visible tiling on large
      surfaces (two scales / per-room offset).
- [x] Contact shadows: one soft footprint texture (`kit/texture-gen.mjs`), all of a room's decals merged into one mesh (`RoomRenderer.syncDecals`), instead of a `kit/decals.js` (DECISIONS R8).
- [~] `render/lighting.js`: key shadow camera fitted to room bounds (CSM for big open-air on High), soft
      shadows by setting (PCFSoft / VSM on High), hemisphere bounce from the floor color, practical light
      budget (0/2/4/6) by importance and distance, window sun patches by time of day, per-room environment
      PMREM (debounced), emotion tint kept, chroma free of shadows and glow.
      **Left:** CSM for big open-air rooms and VSM on High; soft-shadow setting. Done (in `scene.js` + `RoomRenderer.js`, no separate lighting.js): room-fitted key shadow, hemisphere bounce, practical light budget, sun patches, per-room environment, emotion tint, chroma free of shadow and glow.
- [x] `engine.js`: AO stage (half-res GTAO/SAO + blur, before bloom; excludes emissive, transparent, face;
      off on Low, chroma, transparent); per-mood grading (lift/gamma/gain); optional DoF (diorama/portrait)
      on High/Ultra; SMAA when MSAA is unavailable; per-frame stats summed over all passes
      (`renderer.info.autoReset = false`).
- [x] Tiers Low/Medium/High/Ultra + Auto (steps down below ~50 fps for 3 s, never while filming); budgets;
      `compileAsync` on room load.
- [~] `src/js/room/render/RoomRenderer.js` replacing `RoomScene` (room3d.js) and `UnifiedRoomManager`.
      **Left:** it replaces RoomScene and UnifiedRoomManager in the engine, but keeps RoomScene inside for templates not rebuilt yet (DECISIONS D7); room3d.js goes in step 8.
- [x] `npm run design:assets`: contact sheet of every asset (front, three-quarter, top; Low and High) to
      `docs/design/screenshots/1.1/assets/`.

## Step 4: Assets and templates

- [x] Hero set (~30, §8.6.1): writing desk, standing desk, office chair, dining chair, sofa, armchair, pouf,
      bookcase, low shelf, bed, side table, coffee table, rugs (round, rectangular, runner), monstera,
      fig tree, succulents, flower vase, floor lamp, desk lamp, whiteboard (board mirror, 7 styles),
      books and notebook, mug, pen cup, game console with controller, TV/monitor, windows (3 kinds) with
      curtains, wall clock, picture frames, pinboard, plush toy, bouncy ball, puzzle cube.
- [x] One template rebuilt from the hero set (Living room) with before/after shots.
- [x] **ART-DIRECTION CHECKPOINT** (approved by the owner on 2026-11-17: "good for me"): show the owner the contact sheet and the
      before/after of the template; continue only after approval. Record the outcome in DECISIONS.md.
- [x] The rest of the existing catalog (remaining Builder props and v1 assets).
- [x] Every place's set pieces as catalog assets.
- [x] Companions (cat, goldfish, drone, plant sprite, vacuum) as animated assets with rules.
- [x] New assets: bean bag, gaming chair, cat tree, room divider, door, platform/stage, plant shelf,
      hanging plants, wall shelves set, kitchen counter set, aquarium, projector screen, charging pad,
      photo frame (personal data), wall calendar (personal data).
- [x] Catalog ≥ 150 assets, each with en/de/ar names, 2–3 named color slots, footprint, surfaces/anchors,
      actions, LODs, thumbnail, contact-sheet entry.
- [x] All 27 templates + 3 presets rebuilt from catalog assets and architecture; compared with 1.0.
- [x] Contact sheets reviewed against §3; every failure fixed.

## Step 5: Editor

- [x] Full-screen Room Editor (§5.2): top bar (inline rename, room menu, undo/redo, views: Perspective,
      Top-down, Robot's eyes, Camera shot 16:9 / 9:16; snapping menu; Done), Catalog + Outline (left),
      viewport with selection handles and guides, Inspector tabs Look / Placement / Robot rules / Advanced
      (right), tools and context hints below; at phone width the room on top and the panels in a sheet
      below. A compact overlay form over voice mode. (Simulate and the Robot/Spots/Zones/Routes tools are
      step 6; Cameras and Measure are below.)
- [x] Entry points: Studio → Room tab ("Your room" with its name and count, Edit the room…), voice mode's
      Robot scene menu, the voice dock ("Edit room"), Settings → Robot (overview and "Where it is"), the
      robot page's palette ("Edit the robot's room"). One opener (`editor/open.js`, `data-edit-room`); from
      the Studio, the Studio comes back after Done. (The voice request is an AI tool: step 7.)
- [x] Studio Room tab summary: the room's picture and template name.
- [ ] Studio Room tab: quick mood/time/air on the room document (step 8, when the tab's 1.0 place, mood,
      floor and air controls go; until then they would be two "Mood" controls side by side).
- [x] Catalog: categories, search in en/de/ar over labels and tags, favourites, recently used, My sets;
      thumbnails drawn from the real builders and cached in IndexedDB by catalog version; badges; click or drag.
- [x] Catalog: My models ("Add my model…", remove), placed and used like any other thing.
- [x] Placing by drag (§5.4): ghost, slot-aware raycast (floor, wall flush, surfaces re-parent, ceiling),
      green/red/amber with the reason shown and announced, Esc, Shift stamps, "match room colors". A
      click places in view at the first free spot, never on the robot's home.
- [x] Moving/turning/sizing (§5.5): slide, re-parent, children follow, rotate ring, size and lift handles,
      the keys table, multi-select + marquee (plan view), snapping (grid, angle, guides, walls, surface
      centre; Ctrl off), distances while dragging, Placement tab, replace, copy look, align, even gaps,
      group, save as a set.
- [x] Architecture (§5.6): New room dialog (Empty with size, walls, floor and wall finish; Template;
      Duplicate), walls, accent wall, thickness, cutaway, floor, ceiling, outside.
- [x] Atmosphere (§5.7): mood, brightness, time of day, emotion tint, air, wind, season, weather, light effects.
- [x] Per-light settings (brightness, own color) and "on by itself when it gets dark" (follows the room's
      time and mood; a scene's switch wins); the engine re-checks clock-dependent things every 30 s.
- [x] Camera shots (§5.8): save the view as a shot, look through it, remove.
- [x] Shot presets (the whole room, eye level, auto-frame, at the room's main things, measured from
      them and unavailable while they're hidden or gone), fixed / follow / auto-frame, the shot voice mode
      uses (`defaultCamera`, also chosen in voice mode's Robot scene menu); the editor's shot view fits it
      to the picture shape.
- [x] Backdrop layers (§5.9): full room, robot + chosen things, solid, chroma, transparent (the old
      `stageMode.backdrop` goes in step 8).
- [x] History/saving/sharing (§5.10): command undo (≥100 steps, drags as one), autosave + "Saved",
      revert, Save as…, duplicate, export/import `.friends-room`, copy/paste between rooms (Ctrl+C/V).
- [x] Room picker ("Your rooms…") with pictures; the editor sends the room's picture when it closes.
- [x] Custom models wizard (§5.11): the file on a turntable next to the robot's height; name, category,
      slots; units and height, flat tops found by downward raycasts (removable); anchors from node names
      (anchor_robot_stand, socket_hand_grip, DynamicCanvas, surface_*, sit_*, look_*); actions; c1–c3
      recolorable; Stylize (kit families, normals, shadows). Re-skinning built-ins (Advanced tab →
      "Wear one of my models"). Textures capped at 2048 px; triangles capped per graphics level (a box of
      its size above the cap, with a note). In backups and room exports; offline.
- [x] Extras: per-asset schedules (Advanced tab), floor plan as a PNG, scenes (which is on now; per scene
      its name, when it switches on, its mood, what shows and which lamps are on; holds only what it
      changes), the measure tool, "Describe the room" (the room in words, for screen readers and anyone).
- [ ] Extras that need the robot or the AI: Describe a room (AI, step 7), ask the robot to rearrange and
      tidy up (step 7), plants that need care (step 6).
- [ ] The robot reacts to placed things during a conversation (with step 6).
- [x] Touch, keyboard and accessibility for all of the above: keyboard shortcuts, outline as a tree,
      arrow keys in tabs/tiles not stolen by the shortcuts, focus kept when the inspector rebuilds, live
      announcements, 44 px targets on touch, RTL. `test/e2e/room-editor.test.js` (12 tests),
      `scripts/a11y.js` scans the editor.

## Step 6: Robot

- [x] Home + facing ring (drag the robot in the editor; invalid outside the room, inside furniture or in a
      no-go zone: it goes back, with the reason), named spots with facing (placed in the room, dragged).
- [x] Postures (new animator poses): hover height, idle stance, sit (`sit`), lean (`lean`), rest/dock on
      charging pad; per state (idle, talking, listening, away); the idle seat or desk is its idle place.
- [x] Gaze modes and per-mode weights/look-away/don't-stare/head limits; per state.
- [x] Movement: freedom modes, leash, zones (rect/circle/polygon drawn in the plan, corner handles; no-go,
      allowed, slow, quiet, stage, rest), clearance, speed/accel/turn, gait, path style, banking, per-state
      behaviour, away/night, filming and reduced-motion overrides; all in the robot's inspector.
- [x] Routes: named, points placed and dragged in the room (numbered), inserted, reordered, removed, with
      dwell/look/action; modes, when to run; unreachable points flagged; test run in Simulate.
- [x] Rules UI (§6.6): permission, allowed actions, visit weight/cooldown/max/dwell/times/mood/keep-distance/
      fragile, bulk per category, personal-data assets, global autonomy preset/quotas/interrupt/foley/reset.
- [x] Behaviour engine (`src/js/room/behaviour.mjs`, pure, 13 unit tests) owns position and heading: home and
      facing, freedom and leash, visits by the rules (weights, moods, times, quotas, cooldowns, Never, keep
      distance, fragile), paths round no-go zones (and what blocks them), slow and quiet zones, per-state
      choices (talking: stage/closer/stay; listening: turn/closer; thinking: stay/pace/look up; idle:
      stay/wander/route/visit), away → rest → asleep, night, filming and reduced motion, routes (loop,
      back and forth, random, once; dwell, look, action), commands (home, spot, thing, route, stop),
      postures and gaze out, and an event log of why. The engine places and turns the robot's root from it
      in voice mode (`behave: true`, real time even when frames are slow); the stage shadow, hit test, focus,
      vignette and camera follow the robot's place in the room. The animator draws hover height, stance,
      sit, lean, rest, asleep, the gait while moving and banking, and the gaze weights, look-away and head
      limit. The v1 engine no longer moves the robot.
- [x] Dragging the robot in voice mode carries it across its room (never into furniture or a no-go zone);
      "Make this its home" then saves it as home (offered until used, dismissed or voice mode closes).
- [x] Interrupt policies in the behaviour (stop and come back, finish briefly, pause and resume, finish
      first), unit-tested; mood affinity per thing in its Robot rules tab.
- [ ] Navigation/interaction with anchors, aim IK, sit/lean, carrying the real mesh; move `core/robot/*`
      into `src/js/room/robot/`; fix id collisions, unsanitized inputs, shadow/camera bug.
- [x] Camera follow (voice mode follows the robot's place in the room) and auto-frame (room shots, step 5).
- [x] Simulate ▶ (1×/5×, path line, nav grid, zones), event log explaining decisions (translated),
      "Try it" buttons for each interaction of a selected thing, Go there now for spots.

## Step 7: AI

- [ ] Tool set (§7.3) replacing `ROBOT_TOOLS` + `CHOREOGRAPHY_TOOLS`; old names as aliases for one release.
- [ ] One permission model in `rules.mjs` (§7.4); migrate `robot.aiAllowed` + `behaviorEngine.toolPermissions`.
- [ ] Room context block (§7.5) from `roomSummary()`: size-capped, names quoted as data, personal-data
      redaction, every adapter (Gemini Live, OpenAI Realtime, local pipeline, text sandbox) + normal chat.
- [ ] `room_edit` with "AI may rearrange" Off / Ask first (default) / Allowed; ghost preview Apply/Cancel; undoable.
- [ ] Describe a room (local AI in Private mode; never personal-data contents; listed in "what could leave").

## Step 8: Consolidation

- [ ] Settings → Robot pages: Graphics, Room, Behaviour (§9 table), searchable, reset per group.
- [ ] Voice-dock actions mapped onto the new system.
- [ ] Remove old code once unused: `src/js/ui/{studio-drawer,room-editor,behavior-studio}.js`,
      `src/css/v1-studio.css`, `src/js/core/world/*`, `src/js/core/robot/*`, `src/js/robot/room-catalog.mjs`,
      `src/js/robot/places/props3d.js`; `room3d.js` and the legacy place builders once every template is rebuilt.
- [ ] Every old control mapped (table below) and verified.

## Step 9: Polish

- [ ] i18n (de/ar complete, `npm run i18n` clean), RTL, `data-no-i18n` removed from anything with words.
- [ ] Accessibility: `scripts/a11y.js` extended to the editor; axe clean en/ar; contrast AA in 6 packs × 2.
- [ ] Performance pass; measured numbers per tier in DECISIONS.md.
- [ ] Docs: `docs/design/room.md`, `docs/design/robot-studio.md`, README (accurate numbers, screenshots),
      CHANGELOG 1.1.0 (migration notes, keyboard map).
- [ ] Animated outside scenery the painter doesn't draw yet: flocks of birds, butterflies, rainbow, balloon, kite,
      windmill, light trails, holo billboard, shooting stars, satellites (DECISIONS R17).
- [ ] Final screenshots in `docs/design/screenshots/1.1/`; `npm run design:assets` and `design:rooms`.
- [ ] Definition of done (§14) items 1–11 each verified on screen, with how.
- [ ] Final report.

---

## Old controls and where they live now

Filled in as each moves (step 5–8). "→ ?" means not moved yet.

| Old control | Where it was | Where it lives now |
|---|---|---|
| Place picker (27 places), Surprise me | Studio → Room | → ? (New room → Template; Room tab summary) |
| Mood, Brightness | Studio → Room | → ? (Editor atmosphere; Room tab quick controls) |
| Floor kind (glossy/matte/grid/none) | Studio → Room | → ? (Editor architecture → floor) |
| In the air, How much | Studio → Room | → ? (Editor atmosphere; Room tab quick controls) |
| Place colors (wall/floor/glow/detail), Back to usual colors | Studio → Room | → ? (Editor architecture + asset Look) |
| What's in the room (per-place prop toggles) | Studio → Room | → ? (assets in the room: hide/show in Outline) |
| Words on the sign | Studio → Room | → ? (neon sign asset → Look → text) |
| Your picture: blur, dim | Studio → Room | → ? (Outside view "photo") |
| Companions | Studio → Room | → ? (catalog companions) |
| Time mode/hour, weather sync, season | Studio → Room | → ? (Editor atmosphere) |
| Room Builder: enable, wall/floor/ceiling/window style, lighting rig | Studio → Room Builder | → ? (Editor architecture + mood) |
| Builder: add prop (104), X/Y/Z, rotate, scale, c1/c2, animated, interactive, delete | Studio → Room Builder | → ? (Editor catalog, handles, inspector) |
| Custom rooms: name, save, export, import | Studio → Room Builder | → ? (Editor room menu) |
| v1 Room: presets, spawn 15 assets, move/rotate/scale, attach/clear .glb, duplicate, remove, reset pose, undo/redo, debug overlays | v1 drawer → Room | → ? |
| v1 Behavior: autonomy, focus lock, home X/Z/yaw, return delay, quotas, kinematics, gaze weights, foley, interrupt policy, category multipliers, per-asset weights/dwells, waypoint route builder, AI tool permissions | v1 drawer → Behavior | → ? |
| v1 Visual: shader theme, lighting preset, emotion tint, desk-lamp glow, shadow quality, GPU stats | v1 drawer → Visual | → ? |
| v1 Clean stage & backdrops (full/solid/chroma/transparent) | v1 drawer, clean-stage | → ? (backdrop layers) |
| v1 AI & Data: provider adapter, keys, local endpoint/model, VAD threshold, text sandbox tester, bundle export/import | v1 drawer → AI & Data | → ? (Settings → AI / Data & backups) |
| v1 Dock: position, toolbar presets, visible modules and shortcuts | v1 drawer → Dock | → ? (Settings → Voice) |
| Camera presets (wide, desk close-up, whiteboard focus, follow robot, cinema orbit) | clean-stage, voice dock | → ? (camera shots, room-relative) |
| Voice dock: go home, auto roam, emotion, whiteboard, props/toys, camera, clean stage, studio, mute, VAD/PTT, vision, stop AI | voice dock | → ? |

---

## Status

2026-11-17: the owner approved the art direction at the checkpoint. Work continues with the list below.

Done and committed: step 1 (baseline), step 2 (data, store, API, migration on start), the parts of step 3
ticked above, the hero set (38 assets) plus 6 more the Living room needed (string lights, fireplace, candles,
sleeping cat, record player, kettle), and the Living room template rebuilt from catalog assets.

Shown to the owner: `docs/design/screenshots/1.1/assets/hero-{low,high}.jpg` (contact sheets) and
`docs/design/screenshots/1.1/{before,after}/rooms/lounge-* (before: .jpg, after: .png)`.

Next, after approval (in this order):
1. Step 3 leftovers: CSM for big open-air rooms and VSM on High; the graphics settings that drive
   `engine.setPost()` (depth of field, AA, AO, grading) get their UI in step 8. Done since the checkpoint:
   the AO stage (GTAO at half resolution), per-mood grading, depth of field (diorama, portrait), SMAA when
   there is no multisampling, the Ultra tier, reworked budgets, `compileAsync`, per-frame stats over all passes.
2. Step 4 is done (2026-11-17): 194 assets built, all 27 places rebuilt (`src/js/room/rebuilt.mjs`),
   rooms with a legacy block rebuilt on load. The old place builders now only draw 1.0 room objects the
   Studio's Room tab still writes (gone with that tab in step 5/8).
3. Step 5 (2026-11-17): the editor itself is built and committed (see the ticked items); the open
   items of step 5 come next, then steps 6–9.

Known transitional state on this branch (each has its step):
- The Studio's Room and Room Builder tabs, the looks and character switching still write 1.0 room objects;
  the engine draws those through the old place builders and they become room documents on the next start.
- The v1 drawer's Room tab edits `roomEditor.assets`, which is no longer drawn (the room document is).
  The v1 behaviour engine still moves the robot between the old v1 positions (replaced in step 6).
- v1 shader themes now style the robot only; v1 lighting presets no longer override the mood (DECISIONS R6).
