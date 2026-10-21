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
