# The Robot page and its whiteboard: how it is built

One board that you and the robot work on at the same time, and the robot always knows what is on it. This is the
developer's guide; the user's side is in the README and in Settings → Robot → Whiteboard.

## The idea

- A board is a document of pages of **items** (`src/js/whiteboard/model.mjs`): stroke, shape (also arrows that are
  glued to other items), text, sticky, checklist, table, image, diagram, frame.
- Everything that changes it is an **operation** (`ops.mjs`): `add`, `update`, `remove`, `translate`, `reorder`,
  `clear`, `restore`, `check`, `page_*`, `doc_update`, `focus`. `applyOps(doc, ops, { actor })` is pure: it returns
  what was applied, the **inverse** operations (that is what undo is made of), the errors, and short "briefs" ("added
  sticky note [abc] "Hello"").
- The **helper** (`server/whiteboard.js`) is the one place that orders them: it applies them to its copy, numbers the
  change (`rev`), keeps a change log with the actor (`user`, `ai`, `mission`) and a `batch` id (one reply = one batch),
  saves a moment later, and tells every page through the existing event stream (`event: whiteboard`, kinds `ops`,
  `board`, `presence`).
- Pages send their operations to `POST /api/whiteboards/:id/ops` (always as the user); the AI's tools run on the helper
  (`server/whiteboard-tools.js`) and use `apply()` directly. "Take back the robot's last drawing" applies the inverse of
  the last `ai` batch.
- Modules ending in `.mjs` are shared by the page and the helper (`require()` of an ES module, Node 22.12+).

## What the robot knows

`describe.mjs` writes the board as text: what is where, who made it, free space, what the user is doing (presence:
page, pointer, selection, tool, drawing) and "changes since you last looked" (from the change log).

- Text chat: `prompt.js` adds it to the instructions of every reply (`whiteboardSection`), cut to the model's size.
- Voice (Gemini Live): in the setup, and as a quiet "App note" a few seconds after you change something
  (`live.js`: `boardChanged`, `sendBoardNote`); tool results carry `whatTheUserDidMeanwhile`.
- Telegram: `/whiteboard` sends a picture of the board.
- It is data, never instructions: text is quoted and line breaks can't start a new "line" of instructions.
- It is **withheld** when the person keeps memory from cloud AIs, and **redacted** like everything else that goes to a
  cloud AI (`redact.js`); in Private mode only a local AI sees it.

## Who may change what

- Settings → Robot → Whiteboard: on/off, who may draw, where the AI may use it (voice, chat, missions), how often it
  looks, whether it comments, how freely it draws (`server/settings.js` has the choices and the sanitising).
- `mayChange()` in `whiteboard-tools.js`: the AI asks (`ctx.confirm`) before it changes, moves or erases something the
  user made (if that is switched on); a **mission never does**, whatever its plan says; locked items are never changed
  by anyone but the user; images are only `data:image/…` or the helper's own pictures (`/api/whiteboards/assets/…`,
  checked by their first bytes, served with a sandboxing policy).

## Drawing

- `render.mjs` draws a page on any 2D canvas, and is used for the board on screen (`view.js`), for the exports and for the thumbnails. It has a `reveal` mode (the
  robot's writing is shown as it is "written") and returns where the pen tip is.
- `text.mjs` (Markdown, wrapping, code colors), `math.mjs` (TeX layout), `graph.mjs` (flowcharts and outlines to real
  shapes and arrows), `templates.mjs` (14 layouts), `arrange.mjs` (align, distribute, free space), `connectors.mjs`
  (arrows that stay attached).
- `board-store.mjs` is the page's copy of the board: it sends operations, keeps your undo stack, and merges what the
  helper tells it (so your drawing and the robot's never overwrite each other).
- `bridge.js` is the robot's body: the arm follows the pen, the eyes follow what you draw, the sound of a marker. (The board is not hung
  in the 3D room: there is one board on screen, in a window you place.)

## The page (`ui.js` and what it is made of)

The sidebar's **Robot** (view key `whiteboard`, addresses `#whiteboard` and `#robot`, Alt+4) is one workspace, built by
`ui.js` the first time it is shown:

- the board (`view.js`, the same `BoardView` the windows use) fills the stage, in the board's look: `dockTheme` `auto`
  is `paper` in a light app and `midnight` in a dark one (`render.mjs` `themeOf`); the selection and the robot's pointer
  take the app's accent and the robot's light color;
- **the tools** are a pill at the bottom (`toolpill.js`, a short version for the windows); a color well opens the options
  of the tool or of what is selected in a pop-up (`controls.js` has the small parts: swatches, steppers, pop-overs, menus);
- **the options** on the right are `inspector.js`: nothing selected shows the tool's or the board's own options, a
  selection shows Design / Arrange (typed position and size, align, order, frame, copy the look) / About (who made it,
  what the robot calls it); `ContextBar` is the little bar that follows the selection;
- **the panels** on the left (`side.js`, `sources-ui.js`): Boards (with the links in and out), Outline, Sources, Shapes
  (`library.mjs`, previews drawn by `render.mjs`), Layouts (`templates.mjs`);
- **Ctrl+P / Ctrl+O** are `palette.js`;
- **the robot's window** is `robotwin.js`: the live 3D robot (the engine's "board" host), what it says (with [S1] as
  buttons), quick actions of its role, the Create menu (`studio.mjs`), and the role picker, which the pills in the chat's
  top bar and in voice mode open too (`role-pill.js`).

On a narrow screen (`data-compact`) the panels float over the board and the robot's window starts folded.

## Windows (`float.js`, `geometry.mjs`, `windows.js`, `panel.js`)

`FloatingWindow` is the one window: drag by the title bar (it is pulled off an edge, magnets pull it to edges and the
middle, pushing it past an edge docks it there, a shadow shows where), 8 handles to resize, the Move and resize menu
(every place by name), the arrow keys on the title bar (Alt resizes, Home resets), double-click to fill the space, fold
to the title bar. Its place is a fraction of the space it floats in (`{ mode: float|left|right|bottom|max, x, y, w, h,
size, shaded }`, cleaned by `cleanGeometry`, kept in `settings.whiteboard.windows`, so it survives a resize of the app
and "Put the windows back" resets all). In a space narrower than 700 px it is a sheet along the bottom
(`effective()`). The owner hears about every layout (`onLayout`): beside the chat that is how the conversation (and the
little robot) make room (`#main[data-wb-dock]`, `--wb-dock-w`), in voice mode how the captions and the robot do.

`panel.js` makes two of them (`chat`, `voice`) with a compact `ToolPill`; `VoicePanel.drawTo` draws the board into a
recording; `fitLayer` keeps the voice windows between the top bar and the controls.

## The robot in voice mode (`voice/robot-place.js`)

`robot.voicePlace` is `{ x, y, scale }` (fractions of the screen from the middle, and a factor); the engine takes
`placeX`, `placeY` and `placeScale` as host options (view offset and camera distance). The move mode is a layer over the
picture (drag, wheel, pinch, arrow keys, + and −, 0 to put it back, Enter or Esc to finish). Unless you placed it, a
docked board pushes the robot to the middle of what is left.

## Roles (`src/js/robot/roles.mjs`)

Plain data shared by the page and the helper: the built-in roles (name, tagline, instructions, how it uses the board,
quick actions), your own (`cleanRoles`: up to 10, ids that can't be a built-in's), and the choices that go with all of
them (explain for, pace, how hard to push, use of the board, a focus). `promptSection` is what `server/prompt.js` adds to
the AI's instructions ("Your role right now"); `server/live.js` tells Gemini Live when it changes mid-conversation
(`sendRoleNote`). The text of a role you wrote is yours (like Custom instructions); the focus is put to the AI as a wish.

## Sources and links

`server/whiteboard-sources.js` keeps each board's sources in `whiteboards/<board>.sources/sources.json` (up to 24, 150 000
characters each, 800 000 in all; web pages lose their tags, control characters go). `promptText` tells the AI the ones
that are switched on (each line quoted, a share of the room each, with how to read on) and `readPart` is behind the tool
`whiteboard_read_source`. They follow the same gate as the board's description (`whiteboard-tools.js` `awareness`): nothing
goes to a cloud AI when memory sharing is off, and Private mode applies. They go with a board when it is copied and are
removed when it is deleted. `server/whiteboard-links.js` and `links.mjs` find `[[Another board]]` in any words on a board
and answer "links from" and "linked from"; in Markdown text they are drawn as links (`text.mjs`, `render.mjs`).

## Tests

- `test/whiteboard-*.test.js`: the model, the operations, the helper's service and its routes, the AI tools (every tool,
  the permissions, "asks before", "a mission never"), the store, and the pure modules.
- `test/robot-roles.test.js`, `test/whiteboard-library.test.js` (shapes, layouts, windows, what the robot makes),
  `test/whiteboard-sources.test.js` (the module, the AI side, the routes), `test/whiteboard-links.test.js`.
- `test/e2e/whiteboard.test.js`: you draw, the robot draws, each appears for the other; the board beside the chat is
  dragged, resized, docked and remembered; voice mode (the board, moving the robot); a video; filming; the settings.
  `test/e2e/robot-page.test.js`: shapes, options, the arrows that grow a diagram, sources, roles, Ctrl+P/Ctrl+O, links,
  the outline, a phone. `test/e2e/security.test.js`: what words from outside can't do.
- `npm run test:a11y` scans the page and its panels and pop-ups, the windows, voice mode (board, role, move) and Settings → Robot.
