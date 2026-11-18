# The Robot Studio: how it is built

The robot's looks are plain data that the page and the helper both understand, drawn by small builders, changed by a dialog that writes settings. This note is for whoever adds a piece of clothing or a choice. The room around the robot is its own system since 1.1: see [room.md](room.md).

## The data

Two ES modules with no browser parts, used by the page *and* by the helper (`server/robot-look.js` loads them with `require()`; that needs Node 22.12 or newer):

- `src/js/robot/design.mjs`: the **design**. `colors`, `finish`, `glow`, `build` (sizes and shapes), `face`, `outfit` (seven slots, each `{ item, c1, c2, pattern }`). Holds the catalogs the Studio lists (shapes, eyes, the outfit with each piece's name, its starting colors and what its colors are called), `sanitizeDesign` (any input becomes a complete valid design), `shapeKey` (changes only when the *shapes* change, so a color never rebuilds the robot), `randomDesign` ("Surprise me").
- `src/js/robot/room.mjs`: 1.0's **room** object (`place`, colors, light, floor, air, props, sign, photo) and `PLACES`. Since 1.1 it only reads 1.0 rooms (looks, old files, migration); the robot's room is a room document (`src/js/room/`, [room.md](room.md)) and settings keep `robot.room = { layoutId }`.
- `src/js/robot/looks.mjs`: the 14 ready-made looks, and reading and writing a look file.

Where it is kept: `settings.robot.design`, `settings.robot.room` (a reference to a room document), `settings.robot.looks` (up to 24 saved ones); each character has its own `look: { design, room, accent }` (`server/characters.js`, swapped in `src/js/characters.js`). `server/settings.js` cleans all of it on every save and upgrades older settings (`robot.shell`, `.eyes`, `.mouth`, `.background`).

Every English name the Studio shows comes from these catalogs through `labels()`; `scripts/lib/i18n-scan.js` reads them, so `npm run i18n` knows they need a translation.

## Drawing the robot

- `parts.js`: `dimsOf(build)` (every number that depends on the design: head and body sizes, where the shoulders are, functions that say where the head's or the body's surface is, so clothes can fit) and the shapes: head, face screen, body outlines, tops (fins, ears, antennae), arms and hands, the hover.
- `model.js`: `buildRobot({ design, light, faceTexture })` puts them together with the materials (`applyLook` changes colors and finish without rebuilding; `applyPose` moves it).
- `outfit/`: one file per slot (`hats.js`, `glasses.js`, `headgear.js`, `neck.js`, `torso.js`, `back.js`, `chest.js`), `kit.js` (shared shapes, patterns, `eyeSpec` for glasses), `index.js` (puts each item on the right part, keeps its two paint colors in step with `c1` and `c2`, runs the items that move).
- The engine (`engine.js`) rebuilds the robot at the start of the next frame when `shapeKey` changed, however many changes came in; otherwise it only repaints.

### Adding a piece of clothing

1. Add the entry to the right list in `OUTFIT` (`design.mjs`): `item("scarf2", "Long scarf", "🧣", ["#d9534f", "#f4efe6"], ["Scarf", "Stripes"])`: id, name, icon, starting colors, what each color is called. An empty first color means "like the light".
2. Add the builder with the same id to the slot's file: `const scarf2 = (c) => { …; return { object, update?, recolor? } }`. `c` has `dims`, `make(geometry, material)`, `paint(1)` and `paint(2)` (materials that follow the item's colors), `glow(n)` (an emissive one), `group`, `keep`. Put it where the part's origin is (Head, Neck and Body are described in `model.js`). `update(pose, time)` may move it.
3. Look at it from the front, side and back (`?robot-debug` plus `friendsRobot`, or a contact sheet as in the notes below). `test/robot-look.test.js` checks that every catalog item has names and valid colors.

## The room

The Studio's Room tab shows the room the robot is in (its picture, its name, the template it came from) and
changes its light and air on the room document; "Start from a place" uses that place's template room. Everything
else (the Room Editor, the catalog, the robot's behaviour in its room, the renderer) is described in
[room.md](room.md).

- `scene.js`: the three lights; `setMood` sets their colors and strength from the room's mood; the key light's
  shadow camera fits the room's bounds.
- `world.js`: the mirror image in a glossy floor, the air (one `Points` object; each kind of air is a row in
  `AIR_KINDS`), bokeh, the light beam, rings.
- `robot-style.js`: the robot's shading (soft or cel-shaded with ink outlines), Settings → Robot → Graphics.

## Looking at it

`npm run design:shots` and `scripts/lib/harness.js` start the helper on a scratch data folder and a Chrome. WebGL in a headless Chrome needs `launch({ webgl: true })` (software rendering; slow, and the dock robot makes the whole page slow, so turn `robot.chatDock` off first). Open any page with `?robot-debug` and `window.friendsRobot` (the engine, the director) and `window.friendsSettings` (`updateSettings`) are there. A contact sheet is just: set a design and a room with `updateSettings`, wait a second, screenshot, repeat.

## Performance

A robot with an outfit is 30 to 150 draw calls; a room's counts per quality level are in `docs/release-1.1/DECISIONS.md` (R61). Nothing is allocated per frame. The air is one draw call; its particle count follows the quality (Low 40 %, Medium 70 %) and Settings → Robot → Graphics → Particles. On Low, the mirror, the light beam and most bokeh go; the shell uses simpler shaders.
