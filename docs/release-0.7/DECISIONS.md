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

## Workstream 4 — Unified Notification Router, Hardened Telegram Companion, and Reddit Connector

1. **Unified Notification Router (`server/notifications.js`)**:
   - Built a single event router for all app subsystems (`reminder`, `focus_complete`, `mission_plan`, `mission_question`, `mission_approval`, `mission_progress`, `mission_done`, `mission_trouble`, `watch_alert`, `briefing`, `habit_nudge`, `follow_up`, `reddit_match`).
   - Implemented a configurable routing matrix (`event × destination`) supporting `desktop`, `inapp`, and `telegram` destinations, with quiet hours and Do-Not-Disturb (with high-urgency bypass), hourly/daily digest queues, per-channel sliding window rate limits, an exponential-backoff retry queue, and an in-memory ring-buffer delivery audit log (`GET /api/notifications/log`).
   - Modular channel registry allows registering future delivery destinations via a uniform interface (`{ send: async (item) => ... }`) without modifying callers.
2. **Telegram Companion Hardening & Audit (`server/telegram.js`, `docs/release-0.7/TELEGRAM-AUDIT.md`)**:
   - Performed an exhaustive audit and built a comprehensive mock Telegram Bot API test server (`test/helpers/fake-telegram.js`) simulating 18 failure and edge cases (409 conflict, 429 rate limit backoff, 401 token revocation, network drops, message splitting at 4000 characters with boundary preservation, Markdown/HTML escaping, and flood prevention).
   - Replaced fragile manual user ID entry with an instant one-time 6-digit pairing code workflow (`/pair <code>`) with role-based access control (`admin`, `chat`, `notify_only`). Unauthorized users are silently dropped without replies to prevent spam and flood loops.
   - Enforced long-polling only (`getUpdates`) with zero open ports or webhooks, ensuring strict local-first privacy. Added support for SOCKS5/HTTP proxies and custom/self-hosted Bot API servers.
3. **Official Reddit OAuth 2.0 Connector & Prompt-Injection Defense (`server/connectors/reddit.js`, `server/reddit-watcher.js`)**:
   - Built an official Reddit connector strictly adhering to Reddit Data API developer terms (zero web scraping). App credentials and refresh tokens are securely stored in the system keyring.
   - Strictly enforced the official 100 queries per minute rate limit with minimum request gaps and automatic tracking of `X-Ratelimit` response headers and 429 backoff.
   - Placed all posting, commenting, and message actions strictly behind explicit human confirmation dialogs in the "sends" risk class, preventing automated external actions.
   - Guarded all incoming Reddit community content against indirect prompt injection by wrapping it in untrusted data delimiters (`<untrusted_reddit_content>`) and sanitizing potential model instruction overrides.

## Workstream 5 — Missions and local AI: Hardened execution, audit chaining, specialist ecosystem & template gallery

1. **Cryptographic SHA-256 Tamper-Evident Hash-Chained Audit Log (`server/missions/store.js`)**:
   - Every mission maintains a cryptographic audit trail in `audit.jsonl`. Each entry contains a monotonically increasing `seq`, the previous entry's hash `prevHash`, and its own `entryHash = sha256(canonicalPayload + prevHash)`. The genesis entry anchors to 64 zeroes.
   - Full chain verification via `store.verifyAudit(missionId)` (`GET /api/missions/:id/audit/verify`) detects any retroactive modification, truncation, or reordering. Export endpoints provide JSON and RFC 4180 CSV formats, and the frontend detail view displays a cryptographic verification badge.
2. **Priority Semaphore & Chat Preemption in Model Scheduler (`server/models.js`)**:
   - Refactored `models.use()` to support a priority-aware execution queue (`chat` 10, `high` 5, `mission` 0, `preload` -1).
   - Interactive user chats immediately preempt background missions for VRAM/GPU resources, setting the mission state to a clear yield explanation (`waitingReason: "waiting for the model because you are chatting"`).
   - Enforced anti-thrashing swap cooldowns (minimum residency) to prevent performance-degrading model thrashing when missions and interactive conversation alternate.
3. **Multi-Stage Small-Model JSON Recovery & Local Manager Mode (`server/missions/manager.js`)**:
   - Unlocked completely offline and Private mission planning, step checking, and reporting via local models using a manager mode selector (`auto`, `gemini`, `local`).
   - Built a 5-stage JSON recovery pipeline (`repairJsonText`): markdown code block stripping, smart bracket balance extraction, relaxed JSON quoting (converting unquoted or single-quoted keys and strings), trailing comma removal, and truncated object completion.
   - Integrated context-window-aware step sizing heuristics (capping generated plan steps according to the model's active context window) and a second-pass plan validation check to guarantee executable DAG structure.
4. **Hardened File Sandbox & Symlink Realpath Traversal Defense (`server/missions/risk.js`)**:
   - Replaced naive string-prefix path checks with `safeRealpath` to prevent directory traversal and symlink escapes outside permitted workspace folders.
   - Disallowed creating symlinks inside the workspace pointing to files or directories outside allowed roots.
   - Enforced scrubbed subshell environments (`HOME=workdir`, stripping `GEMINI_API_KEY`, tokens, and credentials) and redirected deletions to the user's trash folder.
   - Enforced an "always-ask" safety policy intercepting dangerous commands (`sudo`, global package installations `npm install -g`, `pip install --system`, disk formatting, systemd service edits) requiring explicit user re-confirmation regardless of pre-approved mission plan scope.
5. **Crash Recovery Mid-Step with Side-Effects Confirmation (`server/missions/runner.js`)**:
   - During startup crash recovery, the runner checks for steps interrupted mid-execution. If the step already triggered irrevocable side-effects (sends, deletes, file writes, or shell commands), it halts auto-resume and pauses the mission with an explicit confirmation request, preventing duplicate emails, messages, or corrupted file mutations.
6. **10 Built-In Specialist Roles & Family-Tailored Prompt Templates (`server/specialist-roles.js`, `server/specialist-suggestions.js`)**:
   - Expanded specialist roles from 6 to 16 with 10 new built-in roles (`planner`, `checker`, `summarizer`, `translator`, `extraction`, `reasoning`, `tool_caller`, `social`, `email`, `organizer`).
   - Automatically detects model family architecture (`llama`, `qwen`, `gemma`, `phi`, `mistral`, `deepseek`) to apply optimal system prompts, stop tokens, and tool-calling delimiters.
   - Maintained versioned hardware tier suggestions (`CHECKED = "2026-10-23"`) across 10 VRAM/RAM hardware configurations from CPU-only to 48GB+ multi-GPU rigs, verified by `npm run doctor`.

7. **Integration, QA, and Release Hardening (Workstream 6)**:
   - **Settings Search Indexing & Studio Navigation**: Added direct quick-link buttons in `pane-robot` for the 3D Studio tabs (Colors, Shape, Face, Outfit, Room, Looks). Wired `apps.js` to ensure connected app cards (including Reddit) are populated immediately upon opening Settings so that `buildIndex()` indexes all dynamic connectors. Disambiguated chain link prop material color label from directional "Left" to avoid German translation collision in automated DOM inspections.
   - **Private Mode Audit & Telemetry Parity**: Hardened `server/privacy.js` so that `reddit_watchers` is explicitly listed in `leaving()` telemetry when active, and verified that Private mode strictly halts all Reddit API calls, watcher polling, and model cloud egress. Added `test/private-mode-audit.test.js`.
   - **0.6 Migration & Backup Traversal Hardening**: Verified that 0.6 settings configurations migrate cleanly without data loss. Hardened `SAFE_PATH` in `server/backup.js` to support up to 6 nested directory levels for whiteboard snapshots, custom rooms, and mission audit logs while strictly excluding system secrets. Added `test/migrations-0.6.test.js`.
   - **Full Quality Suite Verification**: Verified zero test regressions across unit/integration tests (680 tests, 131 suites), full browser e2e tests (100 tests, 16 suites), desktop Electron smoke test, WCAG AA contrast accessibility suite (`npm run test:a11y`), strict i18n parity (`3569/3569` across EN/DE/AR), and resolved all npm audit vulnerabilities to 0.


