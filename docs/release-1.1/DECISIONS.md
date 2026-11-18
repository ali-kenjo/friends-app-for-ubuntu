# Friends 1.1 "The Room": decisions and measurements

Non-obvious choices, with the reason. Newest at the bottom of each section.

## Process

- **P1 (2026-11-16) Where the first session stops.** The prompt names one planned stop: the art-direction
  checkpoint after the hero set and one rebuilt template (§15 step 4). Steps 1–3 and the hero set are built
  before it; the owner's answer decides whether the asset work continues as is or the look changes first.
- **P2 Commits.** Commits are authored `ali-kenjo` with the GitHub private email (repo-local git config) and
  carry no AI co-author lines (the owner's standing rule). Nothing is pushed or tagged.

## Baseline

- **B1 Checks on `79a7138`.** `npm run check` ok; `npm test` 857/857 pass.
- **B2 Render cost on 1.0 (voice mode, 1280×720, SwiftShader, one frame, all passes summed with
  `renderer.info.autoReset = false`).** Low: 43–181 draw calls (average 138), up to 49k triangles; the
  Living room 181 calls / 196 meshes. High: 48–298 calls (average 176), up to 118k triangles; the Living
  room 248 calls / 118k triangles. Even the Green screen draws 107 calls on Low because the v1 props are
  added to every place. Raw numbers: `docs/design/screenshots/1.1/before/rooms/stats.json`. Frame times on
  SwiftShader (0.4–1.1 s) say nothing about real GPUs; real-GPU numbers are measured in step 9.
- **B3 Before shots** of every place and the three v1 presets, Low and High, 16:9 and 9:16, are in
  `docs/design/screenshots/1.1/before/rooms/` (`scripts/room-shots.js before`, kept as JPEG to keep the repository small). Voice mode's own buttons
  are hidden in these shots so the room is what's compared.

## Data (step 2)

- **D1 Choice lists live in `src/js/room/choices.mjs`**, apart from `model.mjs`, so the editor, renderer and
  helper share one source and the i18n scanner reads their labels like any other catalog.
- **D2 Moods.** The 7 place moods, the 5 v1 lighting presets and the 7 Builder rigs merge into 13 moods
  (duplicates folded: sunset_glow → golden, night_cyber_studio → neon, daylight → day, …). Each mood also
  carries the hemisphere bounce and a lift/gamma/gain grade.
- **D3 Positions of things on furniture are stored in the parent's frame** (x/z across it, y above the
  surface). Moving or turning the desk needs no update of the lamp on it, which is what §5.5 asks.
- **D4 The room is centred on the origin** (back wall at z = −d/2). With the default 5 × 4 m the back wall
  is at −2 m; the 1.0 Living room's wall was at −2.6 m, so place templates are 6 × 5.2 m to keep their framing.
- **D5 Catalog: 194 entries.** All 104 Builder props and the 15 v1 assets map onto entries (some merge:
  `rug_round` covers the braided and sunburst rugs, `window_french` covers four Builder windows); the places'
  placeable set pieces, the 5 companions and the 16 new assets are entries too. Backdrop pieces (sun, moon,
  skyline, ocean, hills, clouds…) and effects (bokeh, light shaft, rings) are not assets: they belong to the
  outside view and the atmosphere. Search tags come from a fixed, translated vocabulary (`TAGS`) so search
  works in German and Arabic.
- **D6 `pending` entries.** An entry whose 3D builder isn't written yet is marked `pending` and hidden from
  the editor; a unit test keeps "pending" and "has a builder" in step. Release needs zero pending entries
  (PLAN step 4).
- **D7 Templates not rebuilt yet keep a `legacy` block** (their 1.0 set, prop switches, sign words); the
  renderer draws that set until the template is rebuilt from catalog assets. When a template is rebuilt,
  its `props` map turns the old prop switches into hidden flags on its assets.
- **D8 0.7 "shelf" props floated at shelf height.** The migration stands each on a side table (props close
  together share one) instead of leaving it in mid-air or dropping it to the floor; the room's notes say so.
- **D9 Builder "interactive: off" becomes the rule "Look, don't touch"**; "animated: off" switches off steam.
- **D10 1.0 settings are recognised by their `roomEditor` key** in the stored file (0.6–0.8 never had it);
  only then do the default preset's things and the behaviour engine's settings go into the room in use.
- **D11 Saved looks, custom rooms and each character's room each become a room document; identical legacy
  rooms share one** (the 64-room limit is never exceeded; past it, references fall back to the room in use).
- **D12 Custom models are in every backup**, not only "with files": the prompt asks for rooms/ and
  room-assets/ in backups, and a room is broken without its models. The 25 MB cap per model holds.
- **D13 Unknown glTF extensions** are stripped from the stored model (the file is rebuilt); a model that
  *requires* one Friends can't draw is refused with a reason. Textures over 2048 px are reported in the
  model's info and scaled down when the page loads the model.
- **D14 The start-up migration and the switch of `robot.room` to `{ layoutId }` land together with the new
  renderer (step 3)**, so every commit keeps a working app; until then the rooms store, its API and the
  migration are complete and tested but the page still reads the 1.0 room object.

## Rendering (step 3)

- **R1 Procedural maps are made as raw pixels in a module worker** (`kit/texture-worker.js`), handed back as
  transferable buffers and uploaded as `DataTexture`s, so neither the worker nor the page needs a canvas
  (OffscreenCanvas isn't needed at all). Without workers the same pure code runs in idle time.
- **R2 Maps are neutral detail (light gray)** and the material's color tints them, so recoloring never needs
  a new texture; materials are cached by family, finish, color and tier.
- **R3 Draw calls per asset:** pieces sharing a color slot and material merge into one mesh; repeated parts
  (books, leaves, petals, stickers) merge into the same mesh with per-piece tints in vertex colors instead of
  instancing, which gives the same one-call-per-material result without per-asset instancing bookkeeping.
  Hero assets come out at 1–6 calls.
- **R4 Small round parts get fewer segments** (about one per 8 mm around for spheres, 6 mm for capsules,
  1–2 bevel segments under 8 mm radius): the first sheet had a 126k-triangle succulent trio and a 54k puzzle
  cube; now 11k and 7k.
- **R5 Tangent frames for normal maps** come from `computeTangents()` on the compacted (indexed) geometry
  where a map is used; elsewhere three.js' derivative frame is used.
- **R6 The v1 lighting controller and shader pipeline no longer touch the room.** 1.0's controller overwrote
  the key/fill/rim lights (and the key's position) with its preset on every settings change, so place moods
  never showed; its presets are moods now (D2) and only its emotion tint survives, on the stage's bounce
  light. The shader themes restore "captured" base materials, which would undo recolors, so they style the
  robot only. Which themes stay in the UI is decided in step 8 (§4.5).
- **R7 In a room the rim light stays high and at 40 %.** It exists to outline the robot, but as a
  directional light it also lit the whole floor in its color and glared off it towards the camera (the
  first Living room had a lilac floor). three.js has no per-object light masks, so it is gentler in rooms.
- **R8 Floors and walls are matte (roughness ≥ 0.6) and take 30–35 % of the room's reflection**, for the
  same reason: at grazing angles reflections washed big surfaces out.
- **R9 One merged contact-shadow mesh per room** (a quad per thing, one shared soft-footprint texture, one
  draw call) rather than a decal object per asset type.
- **R10 The Living room template uses the "Cozy evening" mood at 110 %.** 1.0's own evening mood never
  showed there (R6: the warm desk-lamp preset always won), so warm is what "like its 1.0 self" means.
  Its TV and fish tank (off by default in 1.0) have no asset in the rebuilt room; a migrated room that had
  them on gets a note saying so.
- **R11 Budgets.** The rebuilt Living room (19 things) draws 107 calls / 110k triangles on Low and 305 calls /
  596k triangles on High per frame, summed over the main, shadow and glow passes (1.0: 181 / 49k and
  248 / 118k, without shadows from furniture). `QUALITY_BUDGETS` is reworked with the tiers in step 3's
  leftovers; segment counts already adapt to size (R4).
- **P3 (2026-11-17) Art direction approved.** The owner saw the hero contact sheets and the Living room
  before/after and answered "good for me". The look stands; the remaining assets and templates follow it.
- **R12 Post stages.** AO is three.js' GTAOPass at half resolution with its output switched off: its map is
  multiplied into the picture in the engine's own final pass, before bloom is added, so glow is never
  darkened. Glowing, see-through and unlit things are hidden for AO's depth pass. Depth of field lives in
  the same final pass (twelve taps): "diorama" needs no depth, "portrait" focuses on the robot using AO's
  depth, so it is available where AO is (High, Ultra). Grading is the mood's lift/gamma/gain, off on chroma.
  SMAA runs only when multisampling isn't available or is chosen. Verified on screen in the Living room:
  High with AO and grading draws 370–387 calls / 0.71–0.78 M triangles per frame (budget 560 / 2.4 M).
- **R13 Budgets are per frame over all passes** (Low 180 / 0.3 M, Medium 420 / 1.2 M, High 560 / 2.4 M,
  Ultra 720 / 4 M draw calls / triangles); `test/robot-budget.test.js` pins them. "ultra" is a valid
  `robot.quality` now.
- **R14 The whole catalog is built (194 assets).** Measured from the contact sheets: median 3 draw calls per
  asset (max 12, for things with parts that move on their own: fish, a train, wind chimes), median 2.4k
  triangles on Low and 7.2k on High (max 22k / 42k). `test/room-assets.test.js` keeps every asset within
  14 calls and 25k/60k triangles, the median at 6 calls or fewer, standing on the floor at its catalog size,
  and no entry pending. Sheets: `docs/design/screenshots/1.1/assets/catalog-{low,high}.jpg`.
- **R15 Builders are registered by catalog id** (one registry over the asset modules) instead of
  "category/id" paths, so a builder can live in whichever module groups it best.
- **R16 All 27 places are rebuilt from catalog assets** (`src/js/room/rebuilt.mjs`). Each keeps its 1.0
  palette, mood and "about": the same pieces in the same places, with the switches that were off in 1.0
  as hidden things. Every 1.0 prop switch has a home (an asset, an asset state such as curtains, an
  atmosphere effect such as bokeh, or the painted view outside), checked by a unit test. Studio-like
  places keep their light effects (bokeh, light shaft, rings) as `atmosphere.effects`; Gradient keeps its
  spotlight; Green and Blue screen are the chroma backdrop layer with nothing drawn.
- **R17 Scenery is painted, not placed.** The sun, moon, clouds, skyline, sea, hills, planet and stars are
  the outside view (outside.js). Animated scenery of 1.0 that the painter doesn't draw yet (flocks of
  birds, butterflies, a rainbow, a balloon, a kite, a windmill, light trails, a holo billboard, shooting
  stars, satellites) is listed as scenery so no false "missing" note appears, and is a polish item in
  PLAN step 9 ("animated outside scenery").
- **R18 Rooms already saved with a legacy block are rebuilt on load** (`migrate.upgradeLegacy`): the
  template's things with the room's prop switches, companions, sign words, changed colors and atmosphere,
  plus every thing the room had of its own; written back once. A 0.7 room with "Use custom room build" on
  keeps only the Builder's walls, floor and props, as in 1.0.
- **R19 Default colors take the rebuilt template's curated wall and floor colors** (the 1.0 palettes were
  tuned for a painted backdrop and read too dark as real walls); a color the user had changed carries over.
- **R20 The editor draws with the robot's own engine** (`robot.host("editor", …)` at priority 50 with an
  `editorView` camera the engine follows) instead of a second renderer: one scene, one set of lights and
  post-processing, so what you edit is exactly what voice mode shows. Catalog thumbnails are the one
  exception: a small offscreen renderer draws each asset once, cached in IndexedDB per catalog version.
- **R21 Texture clones follow their source.** Materials use clones of the shared procedural textures (own
  repeat, shared image). Clones made before the worker fills the image used to keep the 1×1 placeholder's
  GPU storage and filters, so the full-size upload overflowed (a WebGL error, and in a software renderer a
  crashed tab). Clones now read the source's mipmap settings and are released when the image grows.
- **R22 One way into the editor** (`src/js/room/editor/open.js`): buttons carry `data-edit-room`; the palette
  and the voice dock call `editRoom()`. Over voice mode it opens as a compact overlay (the conversation
  goes on); elsewhere full screen. Coming from the Studio, the Studio closes and comes back after Done.
- **R23 Keys a control uses stay with it.** The editor's shortcuts ignore keys a widget already handled
  (arrow keys in tabs, tile groups and the outline), and the inspector puts focus back on the same control
  after a change rebuilds it.
- **R24 Room camera shots apply only where the room is the picture**: hosts that set `world: true`
  themselves (voice mode, the editor's shot view). The Studio, Home and the dock keep framing the robot
  even when room effects are on. A shot measured from a thing falls back to the robot's framing while
  that thing is hidden or gone. The camera math is pure (`src/js/room/cameras.mjs`).
- **R25 The Studio's quick room controls wait for step 8.** Its 1.0 place/mood/floor/air controls, the
  looks and character switching and the Studio's undo all still write 1.0 room objects (and the Studio
  tests check those); replacing only the mood control now would put two "Mood" controls side by side.
- **R26 Your models are registered next to the built-in catalog** (`catalog.entryFor(type)` finds either;
  the page registers them from `/api/room-assets`, the helper passes them explicitly). The pure modules
  (model, ops, nav, rules, cameras) and the renderer use `entryFor`, so a model's size, surfaces, anchors and
  rules work like a built-in's, and the page's own room cleaning keeps them.
- **R27 Models are drawn as their file says, stylized on request.** Stylize maps plain materials onto the
  kit's families by name and settings (without the kit's baked-shading vertex colors, which a model
  doesn't have) and keeps a material's own picture, softened. Triangle caps per level: Low 40k, Medium
  120k, High 250k, Ultra 500k; above the cap the model is a box of its size and the Inspector says why.
- **R28 The page may fetch `blob:` URLs** (`connect-src 'self' blob:`): three.js's GLTFLoader decodes a
  model's embedded pictures from blob URLs it makes itself; without it a model loaded but lost its textures.
- **R29 `npm run check` checks every relative import of the page's code**: a wrong path passed lint and
  parsing and only failed in the browser.
- **R30 One behaviour engine, pure, on the room document** (`room/behaviour.mjs`). It replaces the v1
  engine's moving of the robot (that engine still ticks for its remaining v1 users until step 8). It runs
  only where the room is the scene and the robot may act (voice mode: host option `behave`); the editor
  shows the robot at home as set, the Studio, Home and the dock at home facing you.
- **R31 On its own the robot never switches your things.** Autonomous visits touch, play, read, water, sit,
  lean, write or tidy; "use" (switching, which is saved) happens only when you or the AI ask.
- **R32 "You" are in front of the room's middle**, a little past its front edge (where the camera is):
  talking and listening turn it to there.
- **R33 Slow zones cost more to cross**, so paths go round them when they can; inside one it moves at 45 %.
- **R34 Dragging the robot in voice mode moves it by the pointer's movement across the floor**, not to the
  floor point under the pointer (from a camera this high, that point is well behind the robot's body).
- **R35 No time limit on the "Make this its home" offer** (it stays until used, dismissed, replaced or voice
  mode closes): a message that disappears by itself can be gone before someone can reach it.
- **R36 Found and fixed: the robot's sounds never played.** `robot/index.js` called `robotSound.giggle()`,
  `.blip()` and `.water()` and looked sounds up as methods, but the sound module only has `play(kind)`; touching
  the robot threw. Sounds now go through `play()`, and quiet zones silence them.
- **R37 The AI's tools are checked on the helper against the live room** (`src/js/room/ai.mjs`, shared with the
  page): names resolve to things (your names first, then catalog names, ids, kinds), spots, home, you and
  directions; what doesn't exist or isn't allowed comes back as a sentence the AI can say. The page gets a
  room command for the behaviour engine.
- **R38 The room block lists every visible thing with what the AI may do with it**, names quoted, and says
  plainly what the user switched off. Things that show the user's own things say only that they're off,
  unless switched on, not in Private mode, and not while filming (until a "show while filming" switch exists:
  step 8, Settings → Privacy).
- **R39 "Ask first" shows the proposed room on screen while it asks** (nothing saved until Apply); "Describe a
  room" applies at once as one step with Keep it / Undo, since you asked for it in the editor.
- **R40 The text sandbox adapter reads the live room** for "what's in the room" and for going to a thing named.
- **R41 `robot.room` is always a reference to a room document.** A 1.0 room arriving in settings (a built-in look,
  an older look file, a character's look) becomes a room document once (`rooms.fromLegacy`, remembered by its
  content in `rooms/.legacy-map.json`) and settings keep `{ layoutId }`. The Studio's Room tab now picks a place
  (its template room, made once and reused) and changes the room document's light and air; the Room Builder tab
  and the Studio's custom rooms are gone (the Room Editor does both).
- **R42 `src/js/robot/room.mjs` and `room-catalog.mjs` stay as readers of 1.0 rooms** (migration, old look files,
  character defaults); nothing draws or edits 1.0 rooms any more.
- **R43 Graphics settings are one group, `robot.graphics`, resolved against the quality tier**
  (`src/js/robot/graphics.mjs`). "Like the quality" follows the tier; each choice overrides only its part
  (geometry and texture detail are separate levels in the kit, lamps override `LIGHT_BUDGET`, shadow softness
  is the key light's blur radius, so no shader recompiles). The battery saver draws one level lower and caps at
  30 fps while on battery: Electron's `powerMonitor` in the desktop app (through the helper's event stream), the
  Battery API in a browser. "Slower in the background" is a separate cap (30 fps) the engine uses while another
  window is in front, never while filming (creators record with OBS in front). The frame rate is measured in real
  time (it was the animation's capped step, so a slow machine read 10 fps at worst). The v1 drawer's
  anti-aliasing, shadows-off and throttle seed the group once when there's none yet.
- **R44 The Room Editor's preferences are saved settings now (`robot.editor`, `room/editor/prefs.mjs`).** Before,
  the helper dropped them on save (they weren't in its defaults), so they lasted until a reload. Units (cm or
  inches) apply to the editor's fields, hints, tooltips and spoken moves; the model wizard keeps its own unit
  choice (the file's units). "Show where the robot can't go" draws the nav grid whenever the robot's tools show.
- **R45 Settings → Robot → Room edits the room document, not settings** (name, mood, brightness, time, tint, air,
  season, weather, wind, the voice-mode camera, the backdrop), saved like the editor saves it. Its reset puts back
  the template's light and air. The tint switch is now the one the renderer reads (it read the v1 drawer's
  `visualStyle.emotionLightingTint`).
- **R46 Reset per group asks the helper for its defaults** (`GET /api/settings/defaults`: no secrets, those are
  empty) so a reset is exactly a fresh install's values. Behaviour's reset covers the app-wide switches; the
  per-room robot rules (home, gaze, movement, routes, interactions) live with the room and are reached from
  Behaviour → "Edit its rules in the room…" (the editor opens on the robot).
- **R47 The Settings preview outranks Home's robot** (priority 2.5): both were 2 and Home, registered first, kept
  the canvas under the Settings window, so the preview showed nothing (since 0.6). Voice mode (3) still wins, so
  opening Settings while filming doesn't take the picture from the recording.
- **R48 Voice mode's toolbar was rebuilt on the room system** (`src/js/voice/dock.js`, pure `dock-model.mjs`).
  1.0's dock (emoji, untranslated, built with `innerHTML`) saved nothing: its `updateSettings({…})` calls passed an
  object where the store takes a function and threw. Its "VAD / PTT" and "Vision" switches changed nothing
  anywhere (no push-to-talk or vision exists) and are gone; its M shortcut fought voice mode's own M (one press
  muted and unmuted). The saved layout (`settings.voiceDock`) keeps working: order, which buttons, labels,
  position and keys; new buttons (Go to…, Scene) join next to their neighbours. Home, spots and things go through
  the behaviour engine (a thing is offered only if its own rules allow it when you ask and the robot can reach
  it); Camera lists the room's shots, then ready-made ones (picked: added to the room); Scene sets the room's
  scene; Roam is `robot.roam`, which now also tells the behaviour engine to stay put; Clean stage hides
  everything but the picture (H, the pill, or Escape brings it back). The default position is a rail on the
  left: at the bottom it covers the robot (a saved position stays). Arrow keys move along it, Alt + arrow moves
  a button, menus are proper menus.
- **R49 1.0's stage settings become the room's** (`stageIntoRoom`): the stage backdrop (`stageMode.backdrop`) is
  the room's backdrop layer, and the fixed camera views (made for 1.0's desk room) become the room's own shots,
  once. The engine draws the backdrop from the room only; the "solid" and "transparent" layers now hide the
  room (before, only the 1.0 stage setting did).
- **R50 The robot's shading is soft or cel-shaded** (`src/js/robot/robot-style.js`, Settings → Robot →
  Graphics). The cel look keeps the parts' own color objects and leaves glowing parts alone, so the robot's
  colors and the glow pass keep working (1.0's theme materials were copies taken once: the light color stopped
  following the design). "Realistic" and "Minimalist" looked like soft on the 1.1 robot and are gone (saved
  ones read as soft); 1.0's lighting presets and desk-lamp glow are the room's moods and each lamp's own light.
- **R51 The 1.0 studio drawer is gone, and what was in it moved**: live voice service (provider, Gemini thinking,
  keys kept in the keyring, OpenAI voice, the local pipeline's addresses and model, voice detection, extra
  instructions) → Settings → Characters → Voice conversation → Live voice service; dock → Settings →
  Characters → Voice mode toolbar; robot setup export/import → Data & backups. Its "auto-detect local servers"
  and "sandbox tester" called endpoints the helper doesn't have; AI & privacy → "AI on this computer" finds local
  servers, and the "Typing only" service is the sandbox. Its Room and Behavior tabs are the Room Editor.
- **R52 The robot had no head in voice mode** (since step 6): before its room was known the behaviour engine's
  gaze had no weights, the animator multiplied by undefined, and the NaN stayed in its springs. The gaze now
  always carries its weights, and the animator treats a missing weight as the usual one.
- **R53 1.0's unified-room code is gone** (`src/js/core/world/*`, `core/robot/*`, `core/state-store.mjs`,
  `core/event-bus.mjs`, `core/v1-runtime.mjs`). It still ticked 1.0's behaviour engine on an invisible copy of
  1.0's desk room and could put a marker or a pen in the robot's hand. What it still did for 1.1 moved: the room
  context bridge (and the live session's socket) to `core/ai/room-context-bridge.mjs`, the mood tint to
  `robot/index.js`; the toolbar and "stop talking" talk through a `friends:voice-action` event. The three
  `v1-architecture` tests about it now check the same things on the room system (undo and the AI's room block;
  the nav grid round furniture; quotas, mood affinity, routes, the four interrupt policies and 1.0's nine
  choreography tools as aliases). The first-run guide's 1.0 wizard (untranslated, 1.0 room presets) is a
  translated "Voice and the robot" fold-out: live voice service, shading, and the room to start with (a template).
- **R54 1.0's place builders and prop catalog are gone** (`robot/places/*` but `kit.js`,
  `room/as-legacy.mjs`): every place is a rebuilt template, and a room still marked as a 1.0 place is rebuilt
  from its template when read. `room3d.js` keeps the floors a room can ask for (the glossy pool, the grid), the
  chat dock's plain stage, and a quiet stage while a room document loads; the whiteboard tests now build the
  catalog's whiteboard.
- **R55 Things that show your own things show them now** (`src/js/room/personal.js`; each builder marks its display
  surface, `RoomRenderer.applyPersonal` swaps it). Before, the switches only changed what the AI may do. The
  whiteboard shows your board's current page (drawn by the whiteboard's own page renderer, so `whiteboard3d.js`
  went too: R54's exception is gone), the notebook an open page with your latest notes, the tablet your recent
  notifications, the wall calendar today's events, reminders and tasks, and the photo frame a photo you choose in
  the editor (kept in `room-photos/`, PNG/JPEG/WebP told by their bytes, at most 8 MB; carried in a room's export
  and import; in backups like everything else you keep). All of it is drawn on this computer from what the page
  already has. While filming or recording each goes back to its own face, unless Settings → Robot → Privacy →
  "Show them while filming and recording" is on (recording now tells the robot it started and stopped).
- **R56 Out of reach is shown, and templates don't ship with it.** The editor marks things the robot can't get to
  from its home (a "!" in the outline, and the robot rules name what's in the way). Wall and ceiling things count
  as reached from 1.5 m in front of them (it can look or point from there; the behaviour engine uses the same
  reach), so a window above a sofa is fine. A room made from a template makes what still can't be reached
  look-only (a gaming chair tucked under the podcast desk, a fern deep in the library's corner), and things set
  to look-only or Never aren't counted. The model wizard switches on "sit" for a model with a `sit_` node and
  "carry" for one with `socket_hand_grip`.
- **R57 The views outside have life** (step 9, R17's list): birds, a balloon, a windmill, a rainbow at golden hour,
  butterflies, a kite, a sailboat, a lighthouse beam, light trails and a holo billboard in the city, fireflies,
  drifting clouds, shooting stars, satellites and comets. Drawn over the painting on its own canvas about 12
  times a second (6 on Low), only for the views on screen, still with reduced motion and while filming
  camera-friendly; the billboard changes color slowly instead of flickering. The canvas the life is drawn on exists only while a
  view is on screen and goes again after 10 seconds without it (keeping one for every view of every room you
  visited would add up: a full test run once lost its browser to memory).
- **R58 Plants that need care** (`src/js/room/care.mjs`, off by default; the robot → On its own → Plants and
  tidying). Each plant remembers when it was last watered (`asset.care.wateredAt`), droops a little over three
  days (it leans over and sags), the robot is up to seven times likelier to visit a thirsty plant and waters it
  (the clock starts again, saved with the room), and the AI is told which plants look thirsty. 1.0's vase
  hydration, for every plant.
- **R59 Carrying is the real thing, and Tidy up puts it back.** Asked to carry something (the AI's `robot_use`
  with "carry", or a route step), the robot walks there and picks it up: the thing's own model moves to just in
  front of it at hand height (a big one held smaller) and follows it, arms around it; the room document keeps
  the thing's place. "Put back" walks it to its place and lets go; with Tidy up on it does that by itself after
  45 seconds. Fragile things aren't carried; a thing removed or hidden is let go. The AI is told what it's
  carrying.
- **R60 It notices what you place.** Something new in the room while it acts there (placed in the editor during a
  conversation, or by the AI) gets a four-second look and a curious tilt (not while filming); with the editor on
  top it looks once the conversation shows it again.
- **R61 Measured per tier** (step 9 performance pass; voice mode at 1280 × 720, `engine.getStats()`, summed over
  every pass of a frame: the scene, shadows, the glow pass and AO's depth pass). Draw calls / triangles:

  | Room (things) | Low | Medium | High | Ultra |
  |---|---|---|---|---|
  | Living room (21) | 106 / 110k | 387 / 576k | 387 / 779k | 387 / 977k |
  | Podcast studio (20) | 91 / 74k | 344 / 419k | 344 / 577k | 344 / 741k |
  | Library (16) | 76 / 105k | 294 / 562k | 294 / 739k | 294 / 895k |
  | Café (18) | 78 / 62k | 294 / 366k | 300 / 532k | 300 / 677k |
  | Spaceship (15) | 58 / 70k | 212 / 315k | 212 / 425k | 212 / 538k |
  | Creator studio desk (12) | 80 / 65k | 310 / 349k | 326 / 469k | 329 / 580k |
  | Budget (R11) | 180 / 300k | 420 / 1.2M | 560 / 2.4M | 720 / 4M |

  Every template is inside its tier's budget. Medium's jump in draw calls is the shadow and AO passes (each pass
  draws the scene again); High and Ultra add triangles (rounder geometry, the robot's detail), not calls. These
  counts don't depend on the computer. Frame rates do, and this environment has only software WebGL (all of the
  page's tests run there, on Low, without errors); "60 fps on High with 60 things on a real GPU" (§14 item 8) is
  for the owner's machine: Settings → Robot → Graphics → Performance overlay shows the frame rate and the
  counts against the budget live. Auto steps down below about 50 fps for 3 seconds (unit-tested), never while
  filming.
