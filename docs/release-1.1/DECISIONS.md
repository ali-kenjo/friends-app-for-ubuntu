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
