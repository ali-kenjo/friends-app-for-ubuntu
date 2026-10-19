# Changelog

## Unreleased (0.6.0): a companion with an assistant behind it

### Phase 4: the model manager (specialists on a small graphics card)
- **Specialists** (Settings → AI → Specialists): roles with a model each, instructions, context size and a fallback: *General*, *Coding*, *Writing and social media*, *Research summaries*, *Vision* and *Embeddings*. No model names are built in: you pick from what Ollama has installed, or **pull** one (a progress bar; a name check; off in Private mode). Add your own roles (a translator, a poet); reset to the suggested defaults.
- **Suggestions for 6 GB** (checked on ollama.com on 2026-10-19, and rechecked by `npm run doctor` against what you have installed): a 4B everyday model, a 7B coder, a small embeddings model. The pane shows your card, what is loaded now and why, and a badge per role: *fits the card*, *part runs on the processor*, *too big: runs on the processor*, *not installed*.
- **VRAM-aware loading** (`server/vram.js`, `server/models.js`): one heavy model at a time. Before a step the loaded one is unloaded (Ollama `keep_alive: 0`, then wait for `/api/ps` to say it is gone); the model's weights, its context memory and a margin are weighed against the free memory on the card (`nvidia-smi`); it runs on the card, split with the processor, on the processor alone (`num_gpu: 0`) or on the role's smaller fallback model, and what Ollama really did is read back and shown. Consecutive steps for the same specialist run together, and the next specialist is preloaded while the cloud thinks.
- **Escalation**: a specialist step that fails, is too slow or doesn't pass the manager's check goes to Gemini, unless the mission is Private (then it pauses instead).
- **The Gemini manager**: a stronger model plans and checks, a faster one does routine steps (both configurable, "automatic" picks from what your key can use). A serial queue with a gap between calls, backoff on rate limits (honouring Google's retry hint), a per-day call count shown on Missions, and a pause with a clear message instead of a failure when the free limit is reached.
- **Notes search by meaning** with the embeddings specialist: the numbers stay in your data folder and never leave the computer (`semantic_search_notes`, offered to missions once an embeddings model is installed; without one the notes search by words, as before).
- **A provider layer** (`server/providers.js`): Gemini, Ollama and OpenAI-compatible servers sit behind one interface (`generateText`, `stream`, `warm`, `unload`, `listModels`), so another provider is one entry.
- `test/vram.test.js` (the fit estimate, placement, unloading, fallback, a fake card), `test/e2e/specialists.test.js` (the pane in a real browser), and swapping assertions in `test/missions-engine.test.js` against a fake Ollama.

### Phase 3: the mission engine
- **Missions**: say a goal (the message box, voice, Telegram's `/mission`, or Missions → New mission). The manager asks only what it can't decide, writes a **plan** (steps with a specialist, tools, inputs, outputs and a **risk class**: reads, changes, sends, deletes, runs commands), lists **every side effect explicitly** (recipients and subject, files and folders, commands, installs), and waits for **one approval** in the app or with Telegram's inline buttons. You can edit or remove steps before approving.
- **It runs in the background** in the helper: closing the window or going to the tray doesn't stop it, state is written to disk as it changes (`<data>/missions/<id>/`), and after a restart or a crash it carries on (a step that had already sent or deleted something asks before repeating it). Live progress on Missions, the robot shows *working*, and milestones notify (a plan to approve, a question, halfway, done, trouble) on the desktop and on Telegram. The result is a **report note** in your notes vault, plus the report on the mission's page.
- **Safety** (`server/missions/risk.js`, `toolbelt.js`): approving covers exactly the listed actions. Anything else that sends, deletes or runs a command pauses the mission and asks (app and Telegram); re-planning inside the approved scope doesn't. Files only in the folders you allow and the mission's own folder; deletes go to the trash; commands run in the mission's folder with a time limit, a scrubbed environment (no keys) and a check for `sudo`, installs and system settings, which always ask. Per-mission limits (minutes, steps, cloud calls) are shown on the plan, a big **Stop** (and `/stop`) works at once, and an **audit log** records every tool call and model used. **Private mode** keeps a mission local and pauses it instead of using the cloud.
- **What it can do**: research and reports; emails and messages (Gmail, Telegram, Calendar, each send listed in the plan); laptop and file work (organise, batch rename, small scripts, watching the system); building software (a project folder with tests and a commit).
- **Repeating and triggered missions** (Missions → Repeating): *every morning*, *every Friday*, *every few hours*, *when a file appears in a folder*, *when the disk fills up*, all running the plan you approved (also from the tray, with the window closed), and **Watch my computer** (processor, memory, disks, the card's temperature, failing services: alerts, no model needed).
- **Telegram** reworked: `/mission`, `/missions`, `/stop`, plan and question messages with **Approve / Stop** buttons, only the allowed user ids; the token is kept in the system keyring.
- **Settings → AI → Missions**: on/off, the workspace folder, limits, the planning and routine models, how it tells you.
- `test/missions-risk.test.js`, `missions-plan`, `missions-engine`, `missions-api`, `missions-automations` and `telegram.test.js` (approval scope enforcement, stop, resume after a restart, quota pauses, Private mode, scheduled and triggered missions, Telegram buttons) with `test/helpers/fake-ai.js`, a fake Gemini and a fake Ollama; `test/e2e/missions.test.js` (the Missions page in a real browser).

### Phase 2: the night room (a new look)
- **One accent** (a warm amber, "the lamp": the robot's light is the interface's light) on a violet-tinted ink, with a light theme designed on its own. The blue and orange of before are gone; the accent swatches in Settings → Appearance are amber, pink, violet, blue and green, and anyone who never changed the blue gets the amber. See `docs/design/identity.md`.
- **Two typefaces that ship with the app**: Bricolage Grotesque for the greeting, titles and the wordmark, Figtree for everything else.
- **One icon language**: outline icons everywhere (`src/js/icons.js`). No more emoji as icons: the start chips, the Robot Studio's tabs and buttons, the voice screen's themes and pills, connector cards, tool steps, "Daily briefing" and the rest. Emoji stay only inside what you write (the mood picker, your habits) and what the AI says.
- **Header overlap fixed**: the top bar has its own background and a soft fade, so the conversation starts below the Atlas/Mira switch and never runs under it.
- **Fewer pills**: one row of follow-ups under a reply, connector shortcuts behind the message box's **+**, and "answers come from…" is a small quiet line. The model picker shows one clean name ("llama3.2", not "llama3.2 llama3.2:latest").
- **Settings and Today are full views**; sentence-case labels instead of mixed capitals; a bigger, softer shape scale; depth from layered shadows instead of borders.
- A **logo**: the robot's face (sidebar, app icon, README).
- Still true: right-to-left (Arabic), German, keyboard navigation, focus rings, screen-reader roles, 44 px touch targets; `npm run test:a11y` is clean (it now also scans Today, Missions, the **+** menu and Settings as full views).

### Phase 1: three places, not a dozen
- The sidebar has **Talk**, **Missions** and **Today** (Alt+1, Alt+2, Alt+3). Talk is Home: the robot greets you (big, before you've said anything; a corner of the chat afterwards), with one message box and a mic button. The voice card, the five connector pills and the six activity chips are gone from the start screen: three ideas, and **+** in the message box (attach a file, or look something up in Calendar, Gmail, Drive, News or GitHub).
- **Today** is a page, not a window: one box adds a task, a reminder or an event, with what's coming up, your tasks (including ones without a date), habits, focus and a quick journal line under it; the old tabs are folded under "All tasks, reminders, calendar, habits and journal". (The calendar events of the day now show; the page asked the helper for a field it didn't send.)
- **Settings** is a full view with the groups *You and your companion*, *AI*, *Extras* and *Your data*. Telegram and the Notes vault have their own sections.
- The addresses `#today`, `#voice`, `#chat/<id>` keep working (the tray and notifications), and `#missions`, `#missions/<id>` and `#settings` are new.
- First run: you meet the robot and a greeting first; once an AI answers, one card says Missions exist.
- The README no longer describes Builder mode (it was removed in 0.4.0; file tools remain and Missions can build software).

## 0.5.1: A conversation that takes turns like a person

Voice mode no longer answers every pause, says hello twice, or ignores the mute button.

### Added
- **Conversation style** (Settings → Characters → Voice conversation, and a pill on the voice screen): **Listener** answers only when you speak to it directly and waits about 2.5 s (for talking on camera), **Balanced** (the default) listens while you explain and answers when it makes sense, **Chatty** answers fast and joins in. It sets how long Gemini Live waits after you stop, and what the AI is told about when to talk and when to listen. Changing it mid-conversation resumes the session with the new style. Studio and Instant voice use it too: the AI can answer `[silent]`, which is neither said, shown nor saved.
- **Interrupt key** (Space by default, any key you like in Settings): cuts it off while it talks. **Interrupting by voice** (Easy, Normal, Hard) sets how easily your voice cuts it off; choose Hard on speakers.

### Changed
- Muting now also stops what the AI is saying, at once, and no longer tells Gemini your turn ended (that made it answer half a sentence a moment later). Typing to it while muted still gets an answer out loud.
- In voice mode the "keep the conversation alive" nudges (suggest an activity when it runs dry, keep the momentum, always ask a follow-up) only apply in the Chatty style.

### Fixed
- Opening voice mode: the greeting is no longer interrupted by what the microphone heard while connecting, so it doesn't say hello twice.

## 0.5.0: The Robot Studio

Everything about the robot's looks is now yours to change, and so is the room around it.

### Added
- **The Robot Studio** (Settings → Robot → Open Robot Studio…, or Customize… in voice mode's 🎥 menu): a big live preview and six tabs, **Colors**, **Shape**, **Face**, **Outfit**, **Room** and **Looks**. Changes show at once in voice mode, the chat dock and recordings, are saved as you go, and can be undone (Ctrl+Z / Ctrl+Shift+Z).
- **Colors and finish**: head, body, arms, neck and shoulders in 16 colors or any you pick; matte, satin, glossy, metallic or pearl; the light (fins, ring, eyes) in any color, a second one for while you talk, how bright it all is.
- **Shape**: five bodies, nine things for the top of its head (fins, antenna, two antennae, cat, bear or bunny ears, a sprout, horns), four kinds of hands, four ways of floating, eight proportion sliders (size, head, head shape, body width and height, arms, hands, ears).
- **Face**: eight eye styles (new: big, dots, tall, pixel, visor), eye size and spacing, five mouths, the color of the eyes and mouth, the blush color.
- **An outfit in seven places, 53 pieces**: hats, glasses and other things for the face, headphones, things for the neck, clothes (with seven patterns in two colors), things for the back (a cape that sways, wings that flap, a jetpack with flames) and the chest (a glowing core, a heart, a name badge…). Propellers spin; a cap or a hat never hides the ears or fins.
- **Surroundings**: thirteen places, in colors you choose: Studio, Glow, Cozy desk, **Podcast studio** (a neon sign with your own words, a microphone, sound panels), **Living room**, **Space**, **Sunset hills**, **Neon city**, **Clouds**, Gradient, **your own picture** (PNG, JPEG or WebP, blurred and dimmed as you like) and the two chroma colors. Each has pieces of the set you can switch on or off, a lighting mood (daylight, golden hour, evening, night, neon), a floor (glossy mirror, matte, glowing grid, none) and what drifts through the air (dust, fireflies, snow, stars, bubbles, petals, sparkles, embers, rain).
- **Looks**: 14 ready-made looks, up to 24 of your own, **Surprise me**, and sharing a look as a small file (Export / Import). **Each character keeps its own robot and room** (Atlas in a headset in the podcast studio, Mira in a beanie in the living room).
- The camera frames a taller, wider or smaller robot (or one in a tall hat) in proportion; the Studio can look at the robot from the front, the side, the back, or turn it slowly all the way around.
- Chat avatars follow the robot: its shell color, its eyes and the color of its face.
- `test/robot-look.test.js` (the schema, migrations and saved looks), `test/robot-background.test.js` (the picture), `test/e2e/studio.test.js` (the Studio in a real browser).

### Changed
- Settings → Robot: the shell color, eye, mouth and background choices moved into the Studio; Settings keeps a summary and a place menu. Settings from before are upgraded on their own (a shell color becomes the head, body and arms color; "Accent glow" becomes the Glow place).
- The room's effects (reflection, drifting air, rings, bokeh, light beam) are part of the place now, and work in every place, not only in the Studio and Glow ones.
- Needs Node 22.12 or newer (the helper and the page share the robot's design code, and `require()` of an ES module is built in from 22.12).

### Fixed
- Test browsers on Chrome 154 and newer need `--use-angle=swiftshader --enable-unsafe-swiftshader` for software WebGL; the old `--use-gl=swiftshader` gave no WebGL at all. The scripts that draw the robot (`scripts/lib/harness.js` with `webgl: true`) use the new flags.

## 0.4.0: Flagship Voice Mode, Telegram Companion, and Local Life Management

Major evolution transforming Friends into an autonomous, privacy-first personal companion and content partner ready for public release.

### Flagship Voice Mode (The Star)
- **Document Grounding**: Live document attachment in voice mode (via Voice Drawer → Document or Notes Vault dropdown) grounds conversational turns, scripts, vault notes, or custom briefs into real-time voice sessions across both Gemini Live and Classic engines.
- **Acting Dynamics & Scene Briefs**: Configurable on-camera acting presets (*Best Friends Banter*, *Podcast Co-Host*, *Comedy Partner*, *Sarcastic Critic*, *Curious Interviewer*, *Custom*) and persistent scene briefs empower dynamic roleplay, YouTube/podcast co-hosting, and scripted content creation.
- **Long Conversational Continuity**: Tuned system prompt and grounding structure for sustained conversational presence, active listening, and natural banter without robotic repetition.

### Comprehensive Life Management (Beyond Google)
- **Remote Telegram Bot Companion**: Zero-setup-cost Telegram bot engine with long-polling (`getUpdates`), sender ID whitelist security, conversational turn dispatch, and reminder/focus push notifications.
- **Local Markdown Notes Vault**: Privacy-first, Obsidian/Logseq-compatible markdown notes directory (`~/FriendsVault` by default) supporting daily notes, frontmatter tags, fuzzy search, and live voice grounding attachment.
- **Local Offline Calendar**: Fully offline, JSON-backed calendar engine with `.ics` export and import for seamless interoperability with Thunderbird, Apple Calendar, or Google Calendar.
- **Focus & Pomodoro Sessions**: Native focus timer with audio cues, desktop alerts, and optional remote Telegram notifications upon completion.
- **Expanded Daily Agenda**: Unified `today` command incorporating calendar events, pending tasks, reminders, active focus sessions, and weather into a cohesive daily briefing.

### Builder Mode Deprecation & Clean Up
- **Clean Architecture**: Fully retired legacy web builder prototypes, dev preview servers, and arbitrary shell execution, while preserving robust sandboxed file editing tools (`read_file`, `create_file`, `edit_file_part`, `read_file_lines`, `search_files`).
- **Complete Internationalization**: 100% translation coverage across English, German (`de`), and Arabic (`ar`) with complete RTL mirroring and 0 missing strings.

## 0.4.0 too: the design overhaul

A product-design pass over the whole interface (merged before 0.4.0). The audit, the design system and screenshots before and after (English, German, Arabic) are in `docs/design/`.

### Added
- **German and Arabic** (Settings → Appearance → Language; "Automatic" follows the browser). 1,275 texts in each language, with plurals (Arabic has six forms), numbers and dates by `Intl`. English stays the source text, and any text without a translation shows in English.
- **Right to left.** Arabic mirrors the whole layout: sidebar, dialogs, messages, buttons, sliding panels, arrows. Each paragraph of a reply takes its own direction, so Arabic with English or German inside it reads right; code and formulas stay left to right.
- **A first-run guide.** With no AI set up, the start screen finds a local AI by itself (one click to use it), takes a Gemini key, explains local vs cloud and Private mode in plain words, and the "which AI answers" line under it is truthful (it said "Cloud Ready" whatever the state).
- **Settings in groups, with search.** Appearance (language, theme, chat text), Characters, Memory, Daily life, Robot, AI & privacy, Connected apps, Builder, Data & backups. A search box finds a setting and takes you to it; advanced options (routing rules, how much of the chat the AI sees, an Ollama AI's memory use) fold away; saving says so.
- **Keyboard shortcuts** (press **?**): Alt+N new chat, Ctrl+, Settings, F2 and Delete in the list of chats, arrow keys in the list, menus, tabs and Settings; Enter sends and Shift+Enter breaks the line in the now-growing message box.
- **A question before anything that can't be undone**: one accessible dialog for clearing memory, notes and remembered conversations, deleting or restoring a backup, **importing in "replace" mode (which used to replace everything without asking)**, resetting or deleting a character, disconnecting an app.
- `npm run test:a11y` (axe-core over the main surfaces, dark and light, English and Arabic), `npm run i18n` (translation coverage), `npm run design:shots` (every surface, state, language, theme and width).
- Tests: translation completeness and plurals, the language setting, first run, keyboard-only use, focus trapping, Arabic layout, German text expansion, touch targets and 200% zoom.

### Changed
- **Accessibility**: dialogs make the page behind them inert, take the focus in and give it back; the conversation is no longer a live region (a finished reply is announced once); tabs, radio groups, the model menu and the message actions have the right roles; one visible focus ring in both themes; 44 px targets on touch screens; reduced motion, higher contrast and forced colours are honoured; contrast fixed (the accent colours were 1.9 to 2.7:1 on the light theme; accent text is now darker there). axe-core: 52 serious or critical findings before, none now.
- **Chat**: wider reading column and 1.7 line height (16 px by default; the size setting still scales everything), the conversation keeps following the bottom as a diagram or the follow-up chips appear, errors say what happened and what to do (Try again, Try the other AI, Check AI settings, Set up an AI), files dropped on the page light up the message box, the "who answered" badge is always visible, focusable and explains why.
- **Sidebar**: the profile row and Settings stay in view while the chat list scrolls; real buttons instead of links; chats move with the arrow keys; a skeleton while they load.
- **Voice screen**: the top bar wraps instead of squeezing (it broke below about 1100 px and on phones); states differ by shape as well as colour.
- **Wording**: "brain" is "AI", "AI control" is "AI & privacy", no internal terms on the first screen ("Hero Experience", "barge-in intelligence").
- The stylesheet is 19 small files built on design tokens (type scale in rem, a 4 px space grid, radius, elevation, motion, layers; two breakpoints) with logical properties, instead of one 6,000-line file with 27 `z-index`es and 19 font sizes. About 45 dead rules went. It is larger (115 KB to 152 KB, 21 KB to 29 KB gzipped): the new pieces are bigger than the dead ones.

### Fixed (voice mode: it repeating itself)
- **Its own voice is no longer taken as you.** On speakers the microphone also hears the AI; the speech-to-text turned that into the AI's own sentences, which it then answered, so it seemed to repeat its words. Both engines now compare what was heard with what the AI said a moment ago (`src/js/echo.mjs`): a near copy is dropped (Studio and Instant listen again; Live silences the answer to it, and it isn't saved to the chat).
- **Live: the wait after its voice includes the speakers' own delay** (`outputLatency`; Bluetooth speakers add 200 ms or more), so the end of a sentence isn't sent to Gemini as something you said.
- **Live: a conversation could start behind your back.** Closing voice mode (or picking another engine) while the microphone was still loading left a second Live connection that listened, answered unheard and saved turns into the chat, spending the Gemini quota. It is cancelled now.
- **Live: after a lost connection, the next answer could stay silent** (an answer you had cut off was still being dropped); the half answer is saved and the state starts clean.
- The voice instructions say never to say the same thing twice and not to answer its own echo.
- Closing the desktop window to the tray ends a voice conversation; the microphone stayed open before.

### Removed
- Unused: `metadata.json` (left from the app's template), `isRtl()`, the briefing's empty `addBriefingSource` hook.

### Dev dependencies
- `axe-core` (accessibility checks, `npm run test:a11y`). Nothing new at run time.

### Fixed
- The "Sign in with Google" button no longer sticks out of the settings on a phone or with longer words.
- The start screen's top is no longer cut off in a small window.
- The hero title is no longer invisible on the light theme.

## 0.3.2

### Fixed
- **No more signing in to Google every time**: when Friends opens (and every 50 minutes), it renews Google's access by itself, without asking, as long as you're still signed in to Google. "Stay signed in for good" with your own OAuth client is now only needed if that doesn't work.
- "Sign in with Google" and "Disconnect" no longer show at the same time; anything hidden stays hidden.

## 0.3.1

### Added
- **Stay signed in to Google**: with an OAuth client of your own (Settings → Connected Apps → Stay signed in), you sign in once and stay signed in; before, Google's sign-in ended when Friends closed. Voice mode and the morning briefing use it too.

### Fixed
- **Slow or missing answers on Gemini's free tier**: a model whose quota is used up, or that's busy, is now skipped until it's back, and more Gemini models are tried; when every one is out, the message says when they're back.
- **Silent voice mode**: Gemini Live now tries its other voice models when one's quota is used up.
- **Replies start sooner**: normal replies think only briefly (first words in about 2 seconds instead of over 10); Deep still thinks at length.
- Follow-up suggestions, memories, summaries and the briefing run on a light Gemini model, so they don't use up the main model's quota.

### Changed
- The Docker image runs on Node.js 26; KaTeX 0.19; Dependabot removed.

## 0.3.0

### Added
- **Backups**: your chats, memory, settings and everything else you keep in Friends are backed up once a day by themselves (the last 10 are kept), and before every restore. Settings → Data & backups lists them, backs up now, restores, and exports or imports a backup (optionally with attachments) to take your data to another computer. `npm run backup` does it from the terminal. API keys are never in a backup.
- **Characters**: two built-in characters you can switch between with one tap (at the top of the chat and in voice mode). **Atlas**: calm, sharp, dry-witted and always a step ahead. **Mira**: bright, playful, fearless, your hype-woman and most honest friend. Each has a full character sheet (who they are, personality, humor, opinions, interests, quirks, catchphrases, how they relate to you, how they act on camera, what they never do), their own Gemini voice (30 to choose from) and their own look (robot shell, eyes, accent color). Edit them or make your own in Settings → Characters. They share one memory of you and know each other.
- **They remember your conversations**: when a chat or voice conversation goes quiet, a short memory of it is written (what you talked about, how you seemed, what's still open). New conversations start with the latest ones, `recall_conversations` looks further back, and things worth asking about later ("how did the interview go?") become follow-ups. See and remove them in Settings → Memory.
- **Never boring**: 16 things to do together (debate, would you rather, story building, quiz, hot takes, 20 questions, role-play, German or English practice, content ideas…) on the start screen and in voice mode's 🎲 menu; the AI suggests one when a conversation runs dry, brings its own opinions and stories, and brings up topics you love (Settings → Characters → What you love talking about).
- **ON AIR, co-host mode**: in voice mode (and by itself in filming mode and while recording) the AI knows it's on camera: it co-hosts in a format you pick (podcast, reaction, Q&A, debate, explainer, storytime), plays to the audience, and keeps everything private out of it (memories, notes, emails, calendar, files). Live switches without dropping the conversation.
- **Daily life**: tasks (lists, due dates and times, priorities), reminders (once or repeating, with snooze), habits (streaks and the last 7 days) and a journal (with a mood), kept on this computer. Just tell your AI ("remind me in 20 minutes to stretch", "add buy milk to shopping", "I went to the gym") or use **Today** in the sidebar. Reminders pop up in the page, as desktop notifications, and are said out loud in voice mode.
- **Daily briefing**: your day in one message (calendar, reminders, tasks, habits, follow-ups, headlines), written by your character. Ask for it, press ☀️ in Today, or have it waiting every morning (Settings → Daily life).
- **The desktop app keeps running in the tray** when you close the window, so reminders still come; it can start when you log in (in the tray). Notifications open the right place when clicked.
- **Connected apps** (Settings → Connected Apps), each switched on and off and tested on its own card:
  - No account needed: **Weather** (Open-Meteo, with your town for the briefing), **Web search** in every chat (Google Search through your Gemini key, DuckDuckGo otherwise) and **reading web pages** (never anything on your computer or home network), **Wikipedia** (any language) and **Currency** conversion.
  - With a token (kept in the keyring, never in backups): **GitHub** (your repos, issues, pull requests, files, notifications; opening an issue asks first), **Notion** (search, read, write pages; writing asks first), **Todoist** and **Home Assistant** (lights, heating, blinds, media and scenes by voice; locks, alarms and covers always ask; works in Private mode on your own network).
  - With Google sign-in: **YouTube** (your channel's numbers, your videos' views and comments, YouTube search), **Google Tasks**, reading a whole email and saving **Gmail drafts**, and Calendar for any dates, with changing and deleting events (asks first). Sign out and in again once to allow them.
  - **Any other app through MCP**: add an MCP server (a program on this computer, or an address with a token) and its tools are offered to the AI; ready-made starts for a browser (Playwright), code docs (Context7), Git, files, a knowledge graph, fetch and GitHub's own MCP server. Every action asks first unless you trust the app (all its tools, or the read-only ones).
- **Builder mode** (Settings → Builder): build websites, apps and SaaS products together, inside the folders you allow.
  - Code tools: change part of a file (instead of rewriting it), search code, read lines, see a project's tree.
  - Project starters: a website, a SaaS landing page (hero, features, pricing, FAQ), a Node.js API with tests, a React app (Vite), and Next.js through its official creator.
  - Running commands (installs, tests, builds, git, dev servers in the background) in five modes: **Off**, **Suggest only**, **Ask every time**, **Smart** (safe everyday commands run by themselves, the rest ask) and **Auto** (everything except risky commands, which always ask: sudo, deleting outside the project, git push, ssh, piping downloads into a shell…). Your own "may also run" and "never without asking" lists, a time limit, and no API keys passed to commands. Private mode always asks.
  - **Live preview**: a website folder served on this computer, as a link; dev servers' addresses come back too. Settings → Builder shows what's running, with Stop.
- **Gemini overloaded?** Another Gemini model answers instead of an error.
- **Local AIs get the essential tools** (Settings → AI control → Tools for a local AI), so small models stay focused and keep room in their memory; or all of them.
- **It speaks first**: voice mode opens with a greeting that picks up from last time, in Studio and Instant voice too.
- **`npm run update`**: tests, backs up, builds and installs the desktop app in one step.
- **Releases**: tagging a version builds the `.deb` on GitHub and publishes it with a checksum.

### Changed
- Settings → AI personality is now Settings → Characters. A name you gave the AI before becomes your own character, with the voice you'd picked.
- Node.js 22 or newer is needed (Node 20 is no longer maintained).

## 0.2.0

### Added
- **Local AI**: use models on your own computer, with Ollama (through its own API: context size, keep-alive), LM Studio, llama.cpp, Jan, vLLM, LocalAI, KoboldCpp or any OpenAI-compatible server (Settings → AI control → Privacy & local AI). Running servers are found automatically and a model is added with one click.
- **Routing modes**: Auto, Dynamic, Fastest, Local only, Cloud only or one chosen AI, in the model menu and in Settings → AI control. Local first, the cloud for what a local model can't do, fallbacks both ways, a question before anything goes to the cloud, a "who answered" badge on each reply, and a button to answer again with the other AI.
- **Private mode**: only a local AI answers; Gemini, Gemini Live, Google sign-in and tools, GitHub and news are off, and nothing is sent to the internet.
- **Local voice**: listening (Whisper) and speaking (Piper) on this computer, in English, German and Arabic, set up with one button or `npm run voice:setup`.
- **Google sign-in setup in the app** (Settings → Connected Apps): paste your own Firebase web config instead of editing files; "Authentication is not ready" now says what to do.
- Local models are loaded into memory as soon as they're chosen, so the first reply is quick.
- `./scripts/install.sh` (no sudo), `npm run doctor`, `npm run check`, `npm run test:e2e`, `npm run test:voice`, `npm run test:desktop`.

### Fixed
- The app couldn't start without internet (it loaded Firebase from Google at start). Firebase is now loaded only when you sign in.
- A fallback model could repeat an action that already ran (an email sent twice) after a rate limit.
- Gemini streaming could lose the last event, and one damaged event discarded the whole reply.
- Gmail: a line break in an address could add hidden headers (e.g. Bcc).
- Network helpers could garble characters at chunk boundaries and had no timeouts.
- The `.deb` builder wrote `Maintainer: undefined`.
- The Docker image was reachable by every device on the network with host checks off; the port is now published on 127.0.0.1 only.
- Request logs no longer contain query strings (search terms).
- Settings controls now have names for screen readers; an empty bar under the AI status card is gone.

### Changed
- Removed the unused `firebase` package (about 170 MB) and the stale `bun.lock`.
- The AI is only told about tools it really has (Google tools need a signed-in account).
