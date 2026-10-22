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
   - Implemented extended camera presets (`orbit`, `dolly`, `rack_focus`, `handheld`, `security_cam`, `cinematic`) alongside direct PNG photo and cutout export (`robot.capturePhoto({ transparent })`), preserving background keying and custom camera orientations.

