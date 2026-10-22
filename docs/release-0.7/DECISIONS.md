# Decisions for Friends 0.7.0

## Workstream 1 — Look and feel: warm, cozy, playful

1. **Local Variable Fonts (`src/fonts/`, 348 KB total)**:
   - Bundled five open-licensed (SIL OFL 1.1) WOFF2 variable fonts directly under `src/fonts/` (`bricolage-grotesque-latin`, `bricolage-grotesque-latin-ext`, `figtree-latin`, `figtree-latin-ext`, and `noto-sans-arabic`) with full license attribution in `src/fonts/LICENSE.txt`. This keeps total font payload at 348 KB (well below the 500 KB budget), covers English, German, and Arabic offline without any CDN or system font dependency, and preserves system font fallbacks.
2. **Switchable Theme Engine (`src/js/theme-packs.mjs`)**:
   - Implemented a pure, side-effect-free ES module (`src/js/theme-packs.mjs`) shared between browser code and `node:test` (`test/theme-packs.test.js`). Rather than duplicating static CSS selectors for every combination of 6 theme packs × 2 modes × 6 accents × warmth slider × time-of-day tint × character mood tint, `resolveThemeTokens()` computes exact CSS custom properties while guaranteeing WCAG AA contrast (`>= 4.5:1`) for all text, muted text, accent text, links, status colors, and solid accent buttons across every permutation.
3. **Synthesized WebAudio UI Sounds (`src/js/sounds.js`)**:
   - Synthesized all UI taps, marimba reminder chimes, and celebration chords procedurally using the browser's native `AudioContext` (sine/triangle oscillators + short filtered noise bursts). Zero audio files are bundled or loaded, and sounds default to `enabled: false` with a gentle one-time onboarding card (`#sounds-intro`) shown after the AI and Missions intro.
4. **Hardware Quality Tier Synchronization**:
   - Shared the `data-quality-tier` attribute on `<html>` with `robot.quality` (`auto` steps down to `low` when `hardwareConcurrency <= 2` or `deviceMemory <= 2`). On `low`, backdrop blurs, procedural paper grain, and ambient floating motes step down automatically so weak integrated graphics never jank.

## Workstream 2 — 3D Robot engine, room builder, procedural props, and studio camera

1. **Procedural Room Builder & Lightweight Room Schemas (`src/js/robot/room-catalog.mjs`, `src/js/robot/studio/panels.js`)**:
   - Designed a comprehensive room builder with 150+ procedural items across 13 categories, using procedural Three.js geometries and materials rather than bundled binary meshes. Preserves the zero-external-download and offline-first principles. Custom rooms serialize to versioned `.robot-room.json` files with slot-based snapping (`floor`, `wall`, `shelf`, `ceiling`), position/rotation/scale, item colors, and procedural architecture styles (plaster, brick, wood paneling, floorboards, tiles).
2. **Procedural WebAudio Robot Sound Engine (`src/js/robot/sound.js`)**:
   - Synthesized robot blips, motor servos, hums, and prop ambience entirely via procedural WebAudio oscillators, biquad filters, and noise envelopes. Characters modulate sound pitch and volume independently, and sounds can optionally be mixed into voice recording streams via `AudioNode` graph splitting.
3. **Rigorous Quality Budgets & Live Monitoring (`src/js/robot/engine.js`, `test/robot-budget.test.js`)**:
   - Enforced hardware-agnostic budgets across tiers (`low`: 140 draw calls / 60,000 triangles / 45 particles; `medium`: 220 / 120,000 / 90; `high`: 320 / 240,000 / 160). Automated testing verifies budget tiers, feature gating (bloom, shadows, high-res face meshes), and graceful down-stepping under frame drops. Settings → Robot features live FPS and draw-call telemetry.
4. **Camera & Photo Studio Export**:


## Workstream 3 — Vector Whiteboard, 3D Room Prop, Robot Arm Kinematics, and AI Tools

1. **Universal Vector Document Model (`src/js/whiteboard/model.mjs`, `server/whiteboard-model.js`)**:
   - Designed a shared vector document schema (`version: 1`) supporting strokes, geometric shapes, arrows, curved connectors, rich typography with handwriting fonts, KaTeX formulas, code blocks, sticky notes, checklists, tables, images, and Mermaid diagrams. Each stroke and item tracks progressive timestamps (`t0`, `duration`) and parametric progress for real-time stroke-by-stroke replay and synchronized robot drawing choreography.
2. **Dynamic 3D Canvas Reflection & Arm Kinematics (`src/js/robot/places/whiteboard3d.js`, `src/js/robot/animator.mjs`)**:
   - Integrated the whiteboard directly into the 3D room across 7 distinct prop styles (`whiteboard`, `chalkboard`, `glass`, `cork`, `easel`, `flipchart`, `screen`). Rendered via an offscreen 2D canvas dynamically projected onto Three.js `CanvasTexture` with dirty-rect flagging. Synchronized robot arm forward kinematics, gaze targeting, eraser sweeping gestures, laser pointer spotlight beam, and procedural marker/chalk WebAudio sounds.
3. **AI Tools Suite & Fenced Block Fallback (`server/whiteboard-tools.js`, `server/whiteboard-parser.js`)**:
   - Declared 15 expressive whiteboard tools with a compact 6-tool subset for small local models. Integrated a resilient fenced markdown block fallback (` ```whiteboard ... ``` `) supporting both concise declarative DSL commands (`write`, `shape`, `sticky`, `clear`, `diagram`) and structured JSON lines, ensuring zero-configuration operation for non-function-calling models.
4. **Multilingual Handwriting & Accessible Multi-View Canvas (`src/js/whiteboard/canvas.js`, `src/js/whiteboard/ui.js`)**:
   - Implemented high-performance dual-buffer 2D canvas with subpixel pressure smoothing, Arabic RTL text shaping, KaTeX math integration, and full keyboard-accessible controls. Offered three unified presentation surfaces: full-page studio view, dockable chat side panel, and detachable floating pop-out window with real-time `BroadcastChannel` synchronization.


