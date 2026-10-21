# Friends design system, as implemented

Everything here is in `src/css/` and `src/js/theme-packs.mjs`. The stylesheet is 25 plain files loaded in order by `<link>` tags in `index.html` (no bundler). The first file defines the tokens; the last two are about the person, not the component.

| File | What's in it |
|---|---|
| `tokens.css` | Every colour, size, space, radius, shadow, timing and layer. Components read these; `src/js/theme-packs.mjs` computes active pack overrides dynamically. |
| `fonts.css` | Open-licensed variable WOFF2 fonts bundled locally under `/fonts/` (`Bricolage Grotesque`, `Figtree`, `Noto Sans Arabic`, with `src/fonts/LICENSE.txt`). |
| `base.css` … `missions.css` | Surface stylesheets split by area and kept in cascade order, reading from design tokens. |
| `voice-ui.css` | The voice screen's top bar, controls and banners, in one place. |
| `components.css` | Reusable pieces: settings navigation, advanced sections, buttons' states, first-run guide, shortcuts, dialogs, skeleton, procedural empty-state illustrations, animated progress rings, celebration particles, error blocks. |
| `rtl.css` | What doesn't mirror by itself. |
| `a11y.css` | Loaded last, so it wins: focus ring, touch targets, reduced motion, higher contrast, forced colours, screen-reader-only text. |

Your own choices (Settings → Appearance) sit on top of the tokens:
- `data-theme` (`dark` | `light`), `data-theme-pack` (`cozy` | `sunrise` | `forest` | `lavender` | `ocean` | `classic`)
- `data-roundness` (`sharp` | `soft` | `pill`), `data-bg-style` (`plain` | `gradient` | `aurora` | `pattern`), `data-sidebar-style` (`panel` | `floating` | `minimal`)
- `data-animation` (`off` | `subtle` | `lively`), `data-grain` (`true` | `false`), `data-particles` (`true` | `false`)
- `data-chat-style` (`minimal` | `bubbles` | `cards` | `notebook` | `postcards`) and `data-chat-density` (`comfortable` | `compact`)
- `--accent`, `--chat-font` and `--chat-size` are set on `<html>`. Reading size scales the conversation only.

## Principles

1. **A cozy room at golden hour.** Warm neutrals (cream, oat, sand, terracotta, honey, sage, dusty rose) in light mode and warm cocoa, plum and charcoal-brown in dark mode — never cold blue-grey unless the user picks *Classic*.
2. **Calm and alive.** Soft rounded shapes, layered warm shadows, gentle gradients, optional procedural paper grain, press/hover micro-interactions, animated progress rings, and tasteful celebrations that respect reduced motion.
3. **Honest about privacy.** What leaves the computer is always visible: the "who answered" badge, the status line, the privacy prompts. Nothing is hidden to look tidier.
4. **Readable for hours.** 16 px reading text, 1.7 line height, a 46 rem column, nothing smaller than 12 px.
5. **Every language is a first-class language.** Layout is logical (start/end), never left/right; text is never fixed-width.
6. **Works with a keyboard, a finger and a screen reader.** Every pack and mode meets WCAG AA (verified in `test/theme-packs.test.js` and `npm run test:a11y`).

## Theme packs & colour roles

Six switchable packs live in `src/js/theme-packs.mjs`, each with a dark and a light palette:
- **Cozy** (default): Warm cocoa and oat at golden hour (`#181310` dark / `#fbf7f2` light).
- **Sunrise**: Apricot light, terracotta and soft blush (`#1c1312` dark / `#fff8f4` light).
- **Forest**: Quiet moss, warm cedar and sunlit fern (`#121814` dark / `#f6f9f5` light).
- **Lavender night**: Velvet plum dusk, heather and starlight (`#171320` dark / `#faf7fd` light).
- **Ocean**: Sea glass, coastal mist and warm driftwood (`#11181c` dark / `#f4f9fb` light).
- **Classic**: Quiet warm stone and crisp paper (`#15121c` dark / `#fbf9f8` light).

Optional surface modifiers blend smoothly in `resolveThemeTokens()` while preserving WCAG AA contrast:
- **Warmth slider (`0..10`)**: shifts surfaces between cool stone (`0`) and golden candlelight (`10`, default `6`).
- **Follow time of day (`timeTint`)**: applies a subtle morning, afternoon, evening or night warmth tint.
- **Character mood tint (`characterTint`)**: when *Each has its own look* is on, Atlas feels calmer and Mira brighter.

| Token | Cozy Dark | Cozy Light | Used for |
|---|---|---|---|
| `--bg-main` | `#181310` | `#fbf7f2` | The page, the conversation |
| `--bg-sidebar` | `#120e0c` | `#f3ece3` | Sidebar, settings navigation |
| `--bg-input`, `--bg-subtle` | `#241d18`, `#1e1814` | `#ffffff`, `#f6f0e8` | Raised surfaces (cards, fields, the message box), quiet fills |
| `--bg-hover` | `#2f2620` | `#eae1d6` | Hover, rows |
| `--bg-active` | accent 20% in `--bg-main` | accent 22% in white | Selected |
| `--text` | `#f5ede4` (≥ 15:1) | `#261d16` (≥ 15:1) | Primary text |
| `--text-muted` | `#b8a99a` (≥ 6.5:1) | `#635447` (≥ 6.0:1) | Secondary text |
| `--border`, `--hairline` | `#3d322a`, white 7% | `#ded3c6`, ink 8% | Field borders; the quiet line between two layers |
| `--accent` | `#f5a94a` (Honey default) | the same | Fills, glows, the send button, the robot's light |
| `--on-accent` | `#241504` | `#241504` | Text on an accent fill (≥ 4.5:1 across all six accents) |
| `--accent-text` | lightened accent (≥ 6.8:1) | darkened accent (≥ 5.4:1 on page, ≥ 4.5:1 on hover) | The accent as text, a thin icon or a selected border |
| `--link`, `--focus` | `#ffc67a` | `#7c4300` | Links, the focus ring |
| `--danger` | `#ff8f8f` | `#b3201f` | Errors, destructive actions |
| `--success`, `--warning` | `#62d6a3`, `#ffd166` | `#17724a`, `#855400` | Status |
| `--scrim` | `rgba(10, 7, 5, 0.64)` | `rgba(38, 29, 22, 0.38)` | Behind dialogs |

The six accent choices (Settings → Appearance) are Honey `#f5a94a` (default), Terracotta `#eb7a53`, Dusty rose `#fb7185`, Sage `#34d399`, Lavender `#a78bfa` and Sea glass `#38bdf8`. Every pack × mode × accent combination is tested for WCAG AA contrast in `test/theme-packs.test.js`.

`prefers-contrast: more` swaps in stronger borders and muted text; `forced-colors` uses system colours.

## Type

Rem-based, so the browser's text size applies. Three open-licensed variable typefaces ship locally in `src/fonts/` totaling 348 KB (`<= 500 KB`), with full license text in `src/fonts/LICENSE.txt`:
- **Bricolage Grotesque** (Latin + Latin Extended) for the greeting, headings and wordmark.
- **Figtree** (Latin + Latin Extended) for body and UI controls.
- **Noto Sans Arabic** for Arabic script, paired with Figtree for Latin numerals/code.
Nothing loads from a website.

| Token | Size | Use |
|---|---|---|
| `--fs-xs` | 0.75rem (12) | Captions, badges, timestamps |
| `--fs-sm` | 0.8125rem (13) | Descriptions, buttons, group labels, secondary text |
| `--fs-base` | 0.9375rem (15) | Interface text |
| `--fs-md` | 1rem (16) | Emphasised interface text, lead paragraphs |
| `--fs-lg` | 1.0625rem (17) | Field values, reading text |
| `--fs-xl` | 1.25rem (20) | Dialog titles, card titles |
| `--fs-2xl` | 1.5rem (24) | Panel headings, place titles |
| `--fs-3xl` | 2rem (32) | Settings headings, the greeting while setting up |
| `--fs-4xl` | 3rem (48) | The greeting |

## Space, shape, elevation, motion, sound, layers

- **Space** (4 px grid, `h` = half step): `--space-h` 2, `-1` 4, `-1h` 6, `-2` 8, `-2h` 10, `-3` 12, `-3h` 14, `-4` 16, `-5` 20, `-6` 24, `-8` 32, `-10` 40, `-12` 48 px.
- **Radius**: controlled by the Roundness setting (`sharp`, `soft` default, `pill`) via `--radius-xs` through `--radius-2xl` and `--radius-pill`.
- **Elevation**: `--shadow-rest`, `--shadow-pop`, `--shadow-sheet`, `--shadow-modal` — warm-tinted layered shadows per pack and mode.
- **Motion**: `--dur-fast` 150 ms, `--dur-base` 200 ms, `--dur-slow` 300 ms, `--ease`. Controlled by `theme.animation` (`off`, `subtle`, `lively`). With `prefers-reduced-motion: reduce` or `data-animation="off"`, animations and transitions are disabled. Low hardware quality tier (`data-quality-tier="low"`) degrades backdrop blur, grain and ambient particles automatically.
- **Soft sounds (`src/js/sounds.js`)**: synthesized procedurally with WebAudio (no audio files). Off by default, with a gentle one-time offer in onboarding (`#sounds-intro`), a master toggle, volume slider, preview chime button, and per-category switches (`ui`, `notifications`, `celebrations`).
- **Alive details (`src/js/celebrate.js`, `src/js/illustrations.js`)**: procedural inline SVG empty-state illustrations, animated SVG progress rings (`progressRing`) on habits and missions, optional floating golden motes (`syncAmbientParticles`), and tasteful sparkle bursts (`celebrate`) when finishing a mission, task or habit streak.

## Keeping it so

- `npm test`: includes `test/theme-packs.test.js` validating WCAG AA contrast across all 6 packs, 2 modes, 6 accents, warmth extremes and tints.
- `npm run test:a11y`: axe-core over all surfaces in Cozy and Classic plus hero surfaces in Sunrise, Forest, Lavender and Ocean, in English and Arabic, dark and light.
- `npm run i18n`: verifies 100% translation coverage in German (`de`) and Arabic (`ar`) with zero unused entries.
- `npm run test:e2e`: keyboard-only flow, first run, theme pack switching, settings search, languages, touch targets and zoom.
- `npm run design:shots <name>`: captures screenshots into `docs/design/screenshots/<name>/` (supports `--packs` and `--hero`).
