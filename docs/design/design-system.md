# Friends design system, as implemented

Everything here is in `src/css/`. The stylesheet is 19 plain files loaded in order by `<link>` tags in `index.html` (no bundler). The first file defines the tokens; the last two are about the person, not the component.

| File | What's in it |
|---|---|
| `tokens.css` | Every colour, size, space, radius, shadow, timing and layer. Components read these. |
| `base.css` … `apps.css` | The original sections, split by area and kept in their original order (so the cascade is as before), migrated to the tokens. |
| `voice-ui.css` | The voice screen's top bar and banners, in one place. |
| `components.css` | Pieces added in the overhaul (settings navigation, advanced sections, buttons' states, first-run guide, shortcuts, dialogs, skeleton, error blocks…). |
| `rtl.css` | What doesn't mirror by itself. |
| `a11y.css` | Loaded last, so it wins: focus ring, touch targets, reduced motion, higher contrast, forced colours, screen-reader-only text. |

Your own choices (Settings → Appearance) sit on top of the tokens: `--accent`, `--chat-font` and `--chat-size` are set on `<html>`, and `data-theme`, `data-private`, `data-chat-style` and `data-chat-density` select variants. Reading size scales the conversation only.

## Principles

1. **Calm.** Few colours, one accent, quiet surfaces; motion only to explain a change.
2. **Honest about privacy.** What leaves the computer is always visible: the "who answered" badge, the status line, the privacy prompts. Nothing is hidden to look tidier.
3. **Readable for hours.** 16 px reading text, 1.7 line height, a 46 rem column, nothing smaller than 12 px.
4. **Every language is a first-class language.** Layout is logical (start/end), never left/right; text is never fixed-width.
5. **Works with a keyboard, a finger and a screen reader.** Not added afterwards.

## Colour roles

Dark is the default; `:root[data-theme="light"]` overrides the same names. Contrast is measured against the surface the text sits on.

| Token | Dark | Light | Used for |
|---|---|---|---|
| `--bg-main` | `#15121c` | `#fbf9f8` | The page, the conversation |
| `--bg-sidebar` | `#100e16` | `#f2eeed` | Sidebar, settings navigation |
| `--bg-input`, `--bg-subtle` | `#211c2b`, `#1a1623` | `#ffffff`, `#f6f2f1` | Raised surfaces (cards, fields, the message box), quiet fills |
| `--bg-hover` | `#2b2536` | `#e9e3e3` | Hover, rows |
| `--bg-active` | accent 20% in `--bg-main` | accent 22% in white | Selected |
| `--text` | `#efeaf5` (15.6:1) | `#231d2a` (15.6:1) | Text |
| `--text-muted` | `#a8a1b7` (7.4:1; 5.9:1 on hover) | `#5b5466` (6.9:1; 5.7:1 on hover) | Secondary text |
| `--border`, `--hairline` | `#373041`, white 7% | `#d9d0d3`, ink 9% | Field borders; the quiet line between two layers |
| `--accent` | `#f5a94a`, "the lamp" (your choice) | the same | Fills, glows, the send button, the robot's light |
| `--on-accent` | `#2a1a05` (8.5:1 on the lamp); set from the accent's own brightness | same | Text on an accent fill |
| `--accent-text` | `--accent` (≥ 6.8:1) | `--accent` mixed 50% with `#1c1000` (≥ 5.4:1 on the page, ≥ 4.5:1 on hover, all five accents) | The accent as text, a thin icon or a selected border |
| `--link`, `--focus` | `#ffc477` (11.8:1) | `#7a4300` (7.6:1) | Links, the focus ring |
| `--danger` | `#ff8f8f` (8.4:1) | `#b3201f` (6.4:1) | Errors, destructive actions |
| `--success`, `--warning` | `#62d6a3`, `#ffd166` | `#17724a` (5.6:1), `#8a5a00` (5.6:1) | Status |
| `--scrim` | `rgba(8,5,14,.62)` | `rgba(35,29,42,.38)` | Behind dialogs |

The accent choices (Settings → Appearance) are amber `#f5a94a` (the default), pink `#f472b6`, violet `#a78bfa`, blue `#6fb4f5` and green `#4fd1a5`. On a dark surface each is ≥ 6.8:1; on white each is 1.9 to 2.7:1, which is why text and thin icons use `--accent-text` and never `--accent`. `npm run test:a11y -- --accent <colour>` runs the checks for one. Before 0.6.0 the default was blue (`#6f9cf5`); settings that never changed it move to the amber on their own. See [identity.md](identity.md) for why.

`prefers-contrast: more` swaps in stronger borders and muted text; `forced-colors` uses system colours.

## Type

Rem-based, so the browser's text size applies. Two typefaces ship with the app (Bricolage Grotesque for the greeting, titles and the wordmark; Figtree for everything else; see `src/css/fonts.css`). Arabic uses the system's Noto Sans Arabic, Segoe UI or Tahoma. Nothing loads from a website.

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

Labels are in sentence case (no all-caps). Line heights: `--lh-tight` 1.25, `--lh-normal` 1.5, `--lh-reading` 1.7. The conversation uses `--chat-size` (12 to 22 px, default 16) and `--chat-font`.

## Space, shape, elevation, motion, layers

- **Space** (4 px grid, `h` = half step): `--space-h` 2, `-1` 4, `-1h` 6, `-2` 8, `-2h` 10, `-3` 12, `-3h` 14, `-4` 16, `-5` 20, `-6` 24, `-8` 32, `-10` 40, `-12` 48 px. Values off the grid were snapped to the nearest step (5 → 4, 7 and 9 → 8, 11 and 13 → 12, 18 → 20, 22 → 24); 1 px hairlines, 3 px and a handful of larger optical values stay literal.
- **Radius** (softer the bigger the thing): `--radius-xs` 6, `-sm` 10, `-md` 14, `-lg` 18, `-xl` 24, `-2xl` 32 (the message box), `-pill` 999 px.
- **Elevation**: `--shadow-rest` (cards, the message box), `--shadow-pop` (menus, popovers), `--shadow-sheet` (drawers), `--shadow-modal` (dialogs); each a close and a far soft shadow, tinted violet; lighter in the light theme. A hairline (`--hairline`) only where two layers meet.
- **Motion**: `--dur-fast` 150 ms, `--dur-base` 200 ms, `--dur-slow` 300 ms, `--ease`. Animate `transform` and `opacity` only. With `prefers-reduced-motion: reduce` every animation and transition is cut to nothing.
- **Layers**: `--z-base` 1, `-raised` 2, `-panel` 3, `-popover` 4, `-float` 5, `-overlay` 6, `-bar` 7, `-toast-local` 8, `-menu` 20, `-sidebar-backdrop` 80, `-sidebar` 90, `-modal` 100, `-search` 150, `-voice` 200, `-top` 300 (confirmation dialogs sit at `-modal` + 10).
- **Layout**: `--sidebar-w` 300 px, `--reading-w` 46 rem. Two breakpoints, written literally in `@media` because custom properties can't be used there: **760 px** (the sidebar slides in over the page; settings navigation becomes a strip) and **560 px** (the phone layout: the message box on two lines, the voice bar wraps, dialogs stack). The old 520, 580 and 640 px are folded into these.
- **Direction**: `--dir` is +1, or −1 in right-to-left; things that slide use `translateX(calc(… * var(--dir)))`.

## Right to left

`<html lang dir>` is set by `js/i18n.js`. The layout uses flex/grid and logical properties (`margin-inline-start`, `inset-inline-end`, `border-inline-start`, `text-align: start`), so it mirrors by itself. `rtl.css` mirrors the icons that point (sidebar toggle, back arrows), keeps code, formulas and their toolbars left to right, and flips the disclosure arrows. Centred things (`left: 50%` with `translate(-50%)`) are symmetric and stay. Each paragraph of a reply has its own `dir="auto"`.

## Components

Every interactive element has hover, pressed, focus-visible and disabled states; the ones that can wait have a loading state.

- **Buttons** `.btn` (secondary), `.btn-primary`, `.btn-ghost`, `.btn-danger` (+ `.solid` in dialogs), `.btn.small`, `.icon-btn`, `.link-btn`. Loading: add `.is-loading` (a spinner joins the label). Disabled: 50% opacity, `not-allowed`.
- **Fields** `.field` (text, select, textarea): hover, focus (ring + border), disabled, invalid (`:user-invalid`, `aria-invalid`).
- **Toggle** `.toggle` (a switch; the row is the label), **tick box** `.perm-check`, **range** `.range`. On touch each gets a 44 px hit area.
- **Segmented control** `.seg`, `.voice-seg`; **choice cards** `.choice` (a radio group: `role="radio"`, `aria-checked`); **colour swatches** `.color`.
- **Cards** `.local-card`, `.char-card`, `.app-card`, `.explain-item`, `.onboarding-option`; **advanced section** `details.advanced`.
- **Badges and pills** `.msg-via` (who answered), `.chip`, `.prompt-chip`, `.app-status`, `.nav-badge`, `.ws-status-indicator`.
- **Menus** `.model-menu`: `role="menu"` holding groups of `menuitemradio`; arrows, Home, End, Esc, Tab.
- **Dialogs** `.modal` in `.modal-backdrop` (Settings, Today, shortcuts), `.search-panel`, `.confirm-modal` (`confirmDialog()`), the Google-actions prompt, the picture viewer, and the voice screen. All go through `js/a11y.js`: the page behind is inert, focus goes in and comes back. Drawers: `.voice-drawer`.
- **Toasts** `.chat-toast` (status), `.life-toast` (alert, with actions). **Announcements** for screen readers: `announce()` into two visually hidden live regions.
- **Tabs** `.tab` (settings, vertical) and `.life-tab` (Today): `role="tab"`, `aria-selected`, roving tabindex, arrow keys.
- **Empty states** `.chat-empty`, `.memory-empty`, `.note-empty`, `.brain-empty`, `.folder-empty`: say what's missing and what to do next.
- **Loading** `.skeleton-list` (shimmer bars, `aria-busy` on the list).
- **Errors** `.msg-error` in a reply (what happened, the way forward, `role="alert"`), `.form-error` in forms.

## Focus, touch, motion (a11y.css)

- **Focus ring**: `2px solid var(--focus)`, offset 2 px, on anything focusable via `:focus-visible`, in both themes; white with a dark halo on the voice screen; the message box shows it on the box.
- **Touch**: with `(pointer: coarse)`, every control is at least 44 × 44 px (`min-width`/`min-height`).
- **Screen readers**: `.sr-only`, a skip link, labelled landmarks, one `h1`.

## Writing

Calm, warm, direct. "You" and "your". One word per thing: **AI** (not "brain" or "model" unless it is one), **chat**, **character**, **Private mode**, **local** (on this computer) and **cloud** (Gemini). Say what happens and what to do next ("No AI is set up yet. Friends needs an AI to answer you. Set one up, then try again."). No internal terms in front of people. English is the source language; German uses "du", Arabic uses Modern Standard Arabic.

## Keeping it so

- `npm run test:a11y`: axe-core over the main surfaces in dark and light, left to right and right to left; fails on serious or critical findings (add `--all-impacts` for everything).
- `npm run i18n`: how complete the translations are (`-- --missing` lists what to translate); `test/i18n.test.js` fails when they aren't.
- `npm run test:e2e`: the keyboard-only flow, first run, languages, touch targets and zoom.
- `npm run design:shots <name>`: every surface in every state, language, theme and width, into `docs/design/screenshots/<name>/`.
