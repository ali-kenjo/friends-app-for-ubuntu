# Friends 0.7.0 Release Plan

## 1. Look and feel (warm, cozy, playful theme system)
- [x] Bundle local open-licensed (SIL OFL) rounded woff2 fonts subset to Latin, Latin Extended (German) and Arabic (<= 500 KB total) with license files and system-font fallbacks
- [x] Refactor design tokens into switchable theme packs (`cozy` default, `sunrise`, `forest`, `lavender`, `ocean`, `classic`) with dark and light variants and full user accent color support
- [x] Add Settings → Appearance controls and persistence (`pack`, `appearance` mode, `accent`, `warmth` slider, `roundness`, `density`, `animation` level, `grain`, `background`, `chat.style` with 5 styles, `sidebarStyle`, `timeTint`, `characterTint` tied to per-character look) and register all in Settings search
- [x] Build micro-interactions and motion: press/hover feedback, message arrival animation, typing indicator, smooth view transitions (Talk, Missions, Today, Settings), skeleton loaders, and SVG progress rings/paths for missions and habits
- [x] Add procedural SVG empty-state illustrations (robot and cozy props) with warm, kind copy
- [x] Add context-aware dynamic greetings and subtitles (time of day, habit streaks, active missions)
- [x] Add tasteful celebrations (sparkles/confetti on mission completion, task completion, habit streak) and optional ambient floating particles respecting reduced motion and quality tier
- [x] Build procedural WebAudio UI sound synthesizer (`src/js/sounds.js`) with per-category switches (`ui`, `notifications`, `celebrations`), volume slider, off by default, and a gentle one-time onboarding offer
- [x] Redesign key surfaces for cohesive warmth: start screen (cozy scene, friendly activity suggestion cards), chat and robot dock, voice mode controls, Missions cards, Today habits/streaks, Settings sections, dialogs, menus, toasts, and clear kind error states
- [x] Rewrite microcopy with a warm, human, lightly humorous voice across English, German (`de.js`), and Arabic (`ar.js`) with RTL logical CSS and 100% `npm run i18n` coverage
- [x] Ensure hardware-agnostic performance: animate `transform`/`opacity`, step down blur/grain/particles on Low quality tier or weak hardware (shared with `robot.quality`), and keep 390px phone layouts overflow-free
- [x] Add pure unit test (`test/theme-packs.test.js`) verifying WCAG AA contrast across every theme pack, mode, and accent default, and extend `scripts/a11y.js` (`npm run test:a11y`) over the new packs in English and Arabic
- [x] Update `docs/design/design-system.md`, extend `scripts/design-shots.js`, generate and inspect `0.7.0` screenshots across packs/languages/modes, and record decisions in `docs/release-0.7/DECISIONS.md`

## 2. Robot engine and surroundings
- [ ] Break down into concrete checklist items and implement Robot engine and surroundings workstream

## 3. Whiteboard
- [ ] Break down into concrete checklist items and implement Whiteboard workstream

## 4. Telegram hardening and Reddit
- [ ] Break down into concrete checklist items and implement Telegram hardening and Reddit workstream

## 5. Missions and local AI
- [ ] Break down into concrete checklist items and implement Missions and local AI workstream

## 6. Integration and release
- [ ] Break down into concrete checklist items and implement Integration and release workstream
