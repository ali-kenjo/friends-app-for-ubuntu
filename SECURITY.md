# Security

Friends is meant to run on your own computer.

- The helper listens on `127.0.0.1` only and refuses requests whose `Host` or `Origin` isn't one of its own addresses (this blocks other websites in your browser from using it). `ALLOWED_HOSTS` adds more, and `*` turns the checks off: only do that behind something you trust.
- API keys go to the system keyring, or a private file (mode 0600) in your data folder. A key is only sent to the service it belongs to; a local AI's key never falls back to your Gemini key.
- File tools work only inside the folders you allow, follow symbolic links before checking, and ask before acting.
- In Auto, Dynamic and Fastest mode, a message only goes to the cloud after you agree (configurable); declining keeps it local.
- **Private mode** (Settings → AI control) keeps everything on the computer: no Gemini, Google or GitHub, nothing from other websites.
- Local voice (`voice/server.py`) listens on `127.0.0.1` only and refuses other `Host` headers.
- **Connected apps** (GitHub, Notion, Todoist, Home Assistant) and **MCP servers**: their tokens go to the system keyring, never into backups or to the page. Actions that change something ask first (Home Assistant: locks, alarms and covers always ask; MCP: each action asks unless you trust that app). On camera (ON AIR) none of your accounts, files or memories are offered to the AI.
- **Reading web pages**: the AI can't open anything on this computer or your home network; the address is checked when connecting and on every redirect, with size and time limits.
- **Missions** (what the assistant does for you in the background) run under a gate, not on trust: the plan lists every action that sends, deletes or runs a command, and approving it covers exactly those. Anything else (also anything a web page or file the AI read tried to talk it into) pauses the mission and asks you, in the app and on Telegram. Files stay in the folders you allow and the mission's own folder, deletes go to the trash, commands run in the mission's folder with a time limit and a scrubbed environment (no API keys, a home folder that is the mission's), and `sudo`, installs and system settings always ask. Each mission has limits (minutes, steps, cloud calls), a Stop button that works at once, and an audit log of every tool call and model used. In Private mode a mission never uses the cloud: it pauses instead.
- **Telegram**: your own bot, long polling (no open port); only the user ids you list may talk to it (with none listed, the first person to write becomes the only one); its token is kept in the system keyring. Approving a mission's plan from Telegram covers the same listed actions as in the app.
- **Update checks** ask GitHub's public releases page once a day and send nothing but the request itself; nothing is downloaded or installed by itself, they are off in Private mode and can be switched off. The AppImage and the `.deb` are published with a `SHA256SUMS` file, and the AppImage build verifies the packaging tool it downloads against a pinned checksum.
- **Staying signed in to Google** uses an OAuth client of your own with PKCE; the refresh token is kept in the system keyring and only ever sent to Google. Sign out (Settings → Connected Apps) revokes it.
- **Backups** contain your data but never API keys or tokens.

Found a problem? Please report it privately to the maintainers (a GitHub security advisory on the repository) before making it public.
