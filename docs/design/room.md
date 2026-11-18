# The Room: how it is built

Friends 1.1 has one room system. A **room** is a document: its architecture (size, walls, floor, ceiling, the view
outside), its atmosphere (mood, time of day, air, season, weather), its things, how the robot behaves in it,
camera shots and scenes. Everything that draws, edits or reasons about the robot's room reads that document.
This note is for whoever adds a thing to the catalog, a template, a behaviour or a setting. Decisions and their
reasons are in `docs/release-1.1/DECISIONS.md` (R-numbers below); the order of work is in `PLAN.md`.

## The document

`src/js/room/model.mjs` (pure, used by the page and by the helper through `require()`):

- `emptyRoom()`, `sanitizeRoom(raw, { custom, now })`: any input becomes a complete, valid room. Ids are
  `^[\w-]{1,40}$`, colors `#rrggbb`, numbers are clamped, unknown things are dropped with a note in `room.notes`.
  Every load, import and save goes through it (untrusted input, §10).
- Units are meters and degrees. `pos` is `[x, y, z]` with the floor at `y = 0` and the back wall at `-d/2`; a thing
  on another thing has `parent` and `surface` and a position in that parent's frame (`worldTransform()` resolves
  it). `slot` is `floor`, `wall`, `surface` or `ceiling`.
- Each asset carries its look (`colors`, `variant`, `scale`, `state`), its **rules** for the robot
  (`permission`, allowed `actions`, weight, cooldown, dwell, mood affinity, keep distance, fragile), an optional
  `schedule`, a lamp's `light`, and a plant's `care` (when it was last watered).
- `robot`: home, spots, posture per state, gaze per state, movement, zones, routes, autonomy (preset, quotas,
  interrupt policy, foley, tidy up, plant care), per-state choices.
- `cameras` and `defaultCamera`, `scenes` and `activeScene`, `backdrop` (full, robot and chosen things, solid,
  green or blue screen, transparent).

Where rooms live: `server/rooms.js` (`/api/rooms`, one JSON file per room in `rooms/`), your models in
`room-assets/`, photos for photo frames in `room-photos/`. Settings hold only a reference:
`settings.robot.room = { layoutId }` (R41). A 1.0 room (a place, the Room Builder, the v1 unified room, a look,
a character's room) becomes a document once, through `migrate.mjs` and `rooms.fromLegacy`.

## The catalog

`src/js/room/catalog.mjs`: 194 things in 18 categories, each with a label, color slots and their names,
footprint and height, slots, surfaces things can stand on, anchors (where the robot stands, looks, sits,
leans, grips), the actions it offers, states (a lamp's switch, a sign's words, a board's style), and flags
(`hero`, `light`, `personalData`, `fragile`). `entryFor(type)` also answers for your own models
(`custom:<id>`, `setCustomEntries`).

Each catalog id has a builder in `src/js/room/render/assets/*.js` that describes the thing with the kit
(`render/kit/`): `Build` gives rounded boxes, lathes, tubes, cushions, leaves, books… at the quality's tier,
materials by family (wood, fabric, metal, ceramic, plastic, glass, leather, paper, emissive…) and finish, and
merges pieces that share a material. A builder marks moving parts (`b.moving`), lights (`b.lightsAt`), and the
display a thing shows your own things on (`b.named.display`, R55).

**Adding a thing:** add the entry to `catalog.mjs` (its id, label, category, colors, footprint, slots, anchors,
actions), write a builder with the same id, then look at it: `npm run design:assets` draws contact sheets at Low
and High into `docs/design/screenshots/1.1/assets/`. `test/room-assets.test.js` builds every entry at High and Low
(merged meshes within budget, standing on the floor at its catalog size, recoloring); the catalog's integrity
(labels, colors, anchors, actions) is checked in `test/room-model.test.js`.

## Templates

`src/js/room/templates.mjs`: 31 templates: an empty room (size and wall layout), the 27 places of 1.0 rebuilt
from catalog things (`rebuilt.mjs`, pure data), and 1.0's three presets. `templateRoom(id)` makes the room;
what the robot can't reach from its home there is made look-only (R56). `test/room-model.test.js` validates
every template.

## Drawing it

- `render/RoomRenderer.js`: turns a room document into the scene. It builds the architecture
  (`architecture.js`: walls with their openings, trim, the floor, the ceiling, the view behind each window),
  one instance per thing (rebuilt only when its shape changes), one merged mesh of contact shadows, a fixed
  budget of practical lights given to the strongest nearest lamps, the mood, the room's own reflections, the
  backdrop, things your own things show on (`applyPersonal`), a thing the robot carries (`hold`), and plants
  that droop (`care.mjs`). Graphics settings arrive as `look.detail` (R43).
- `render/outside.js`: the painted views (city, garden, hills, sea, forest, snow, clouds, space) by time of day,
  with their animated life drawn on top (R57).
- `robot/engine.js`: the one WebGL engine for every place the robot shows (voice mode, the Studio, Settings, the
  chat dock, the whiteboard window, the Room Editor). Passes: the scene, the glow pass, ambient occlusion,
  bloom, the final pass (backdrop, grading, depth of field, SMAA). `robot/graphics.mjs` resolves the Graphics
  settings against the quality tier; `robot/room3d.js` keeps the floors a room can ask for and the plain stages.

## Editing it

`src/js/room/editor/`: the Room Editor, full screen or over voice mode.

- `editor.js` holds the room being edited, the history (`history.mjs`, diffs, a drag is one step), the top bar,
  the catalog, the outline and the inspector (`panels.js`), the robot's inspector (`robot-panel.js`) and its
  tools in the room (`robot-tools.js`: home, spots, zones, routes, the nav grid).
- `viewport.js`: the camera (perspective, plan, the robot's eyes, the camera shot), picking, placing from the
  catalog with a ghost, handles, snapping, measuring.
- `ops.mjs` and `robot-ops.mjs`: pure changes to a room (add, move, parent, nudge, align, duplicate, zones,
  routes, spots). Everything the editor does is one of these, so it's tested without a browser
  (`test/room-editor-logic.test.js`, `test/room-robot-ops.test.js`).
- `model-wizard.js`: "Add my model" for a `.glb` (size, flat tops, anchors from node names, colors, a stand-in box
  over the triangle cap).
- `prefs.mjs`: the editor's preferences (`settings.robot.editor`, Settings → Robot → Editor, R44).

## The robot in it

- `room/behaviour.mjs`: one pure behaviour engine, `tick(dt, ctx)` to an output the engine and the animator
  follow (position, facing, posture, gaze, gait, what it carries). It decides by state (idle, talking,
  listening, thinking, away, night, filming), autonomy preset, quotas and cooldowns, scenes and schedules, and
  takes commands (home, a spot, a thing with an action, a route, look, posture, stop). Paths come from
  `room/nav.mjs` (a grid with clearance, A*, smoothing, zones; `unreachable()`, `whatBlocks()`).
- `room/rules.mjs`: one permission model, `canDo(room, actor, assetId, action, context)`, for the robot on its
  own, the AI's tools, the editor's "Try it" and the voice toolbar: the thing's rules, scenes, zones, the AI
  switches, filming, Private mode and personal-data switches. Its reasons are sentences the AI can say.
- `room/care.mjs` (plants that need care, R58), carrying and tidying up (R59), noticing new things (R60).

## The AI and the room

- `room/ai.mjs`: the robot tools checked against the live room on the helper (`server/tools.js`), the aliases for
  1.0's tool names, the room block every provider is told (`server/core/ai/room-context.js`; the page reports how
  the robot is through `core/ai/room-context-bridge.mjs`), `room_edit` with a preview and approval, and
  "Describe a room".
- `room/personal.js`: what things that show your own things draw (on this computer only, blank while filming
  unless allowed).

## Settings

- Settings → Robot → Room edits the room document (`room/settings-room.js`); Graphics, Editor and Privacy are
  settings groups (`robot.graphics`, `robot.editor`, `robot.privacy`), each with Reset (R43–R47).
- Voice mode's toolbar (`voice/dock.js`, `dock-model.mjs`) works through the same room (R48).

## Tests and pictures

- Pure modules have `node:test` suites in `test/room-*.test.js`, `test/voice-dock.test.js`,
  `test/robot-graphics.test.js`; the helper's rooms API is in `test/rooms-api.test.js`.
- The page: `test/e2e/room-editor.test.js` (the editor, the robot, voice mode, Settings, Arabic) and
  `test/e2e/definition-of-done.test.js` (§14 item by item; `DOD_SHOTS=docs/design/screenshots/1.1/dod` to keep its
  pictures). `npm run test:a11y` runs axe on the page and, with WebGL, on the editor.
- `npm run design:assets` (contact sheets) and `npm run design:rooms` (every template in voice mode) write to
  `docs/design/screenshots/1.1/`. Software WebGL is slow: turn `robot.chatDock` off, as the harness does.
