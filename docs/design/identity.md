# Friends: the visual identity (0.6.0)

The robot is the brand, so the interface is lit by it. **The night room**: a violet-tinted ink room, and one warm lamp, the robot's screen,
that lights everything that matters. This document is the direction; `src/css/tokens.css` is the implementation and
`docs/design/design-system.md` lists the pieces.

## Design plan, and what was revised

| | Decision |
|---|---|
| **Palette** | `ink` #15121c (page), `raised` #211c2b (cards, fields, the message box), `sidebar` #100e16, `text` #efeaf5, `lamp` #f5a94a (the one accent). Light theme, designed on its own: `paper` #fbf9f8, `raised` #ffffff, `text` #231d2a, the lamp deepened to #8a5a1f-ish for thin text (`--accent-text`). |
| **Type** | **Bricolage Grotesque** for the few big things (the greeting, titles, the wordmark: it has a slightly quirky, friendly voice at large sizes); **Figtree** for everything you read and click (warm, open, very legible at 15 px). Both ship with the app. Arabic uses the system's own fonts. Sentence case everywhere; no all-caps labels. |
| **Shape** | Softer the bigger it is: 10 px controls, 24 px cards, 32 px message box, pills for buttons. Depth comes from two stacked shadows and layers of ink, not from borders (a 7 % hairline where two layers meet). |
| **Layout** | Left-aligned reading and lists, centred only where the robot is the content (Home before you speak). One column for a conversation (46 rem), two for Today. |
| **The one bold thing** | The robot on Home: large, melting into the page, with its light spilling across the room. Everything else is quiet. |

Reviewed against the usual defaults: the first draft's accent (a terracotta) and cream paper looked like every other warm AI product, so the
accent became a honey amber (the colour the robot already glows in) on a **violet** ink (not neutral grey or cream), and the type pairing was
chosen for the robot's character rather than a serif display. The ideas chips, the connector pills and the "answers come from…" badge were cut
rather than restyled.

## Principles

1. **One thing to do next.** Home is a robot, a greeting and a message box. At most three ideas, one row of follow-ups under a reply.
2. **One accent.** The lamp is the primary button, what is selected, the focus ring, the robot's light and its glow. Status colours (green, red, yellow) only ever mean status.
3. **One icon language.** Outline icons on a 24 px grid (`src/js/icons.js`). No emoji as icons. Emoji stay only inside content you write (the mood picker, your habits, what the AI says).
4. **The bar never overlaps.** The top bar has its own background and a soft fade under it.
5. **Motion answers something.** The robot floats and blinks; a badge nudges when a mission needs you; nothing else moves on its own, and `prefers-reduced-motion` turns it all off.
6. **Everything the audit fixed stays fixed**: right-to-left (Arabic), German, keyboard navigation, focus rings, screen-reader roles, 44 px touch targets. `npm run test:a11y` is clean.

## Where it lives

- Tokens: `src/css/tokens.css`. The shell (sidebar, Talk, Today, Settings as a full view, the top bar): `src/css/shell.css`. Missions: `src/css/missions.css`.
- Fonts: `src/css/fonts.css` (from `@fontsource-variable`, served from `/vendor/fonts/`).
- Icons: `src/js/icons.js` (`icon("calendar")`, `iconEl()`, `<i data-icon>` via `paintIcons`).
- Brand: the wordmark and logo in the sidebar are the robot's face (`#brand`); the app icon is `src/icon.svg` (also `build/icon.svg`, rendered to `build/icon.png`).
