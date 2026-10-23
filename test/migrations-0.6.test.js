const test = require("node:test");
const assert = require("node:assert/strict");
const backup = require("../server/backup");
const settingsModule = require("../server/settings");

test("Migration 0.6: settings normalize cleanly populates 0.7 defaults without losing 0.6 data", () => {
  // A legacy 0.6 settings payload (missing 0.7 theme packs, sounds, whiteboard, missions, reddit, notifications)
  const legacy06 = {
    ui: { language: "de", design: 1 },
    font: { family: "default", size: 18 },
    chat: { style: "bubbles", density: "compact", suggestions: false },
    privacy: { localOnly: false, redact: { keys: true, cards: true } },
    memory: { enabled: true, items: [{ id: "mem1", text: "User prefers dark chocolate" }] },
    characters: { active: "mira", list: [{ id: "mira", name: "Mira" }] },
  };

  const normalized = settingsModule.sanitize(legacy06);

  // 1. Verify 0.6 user data was preserved
  assert.equal(normalized.ui.language, "de");
  assert.equal(normalized.font.size, 18);
  assert.equal(normalized.chat.style, "bubbles");
  assert.equal(normalized.memory.items.length, 1);
  assert.equal(normalized.memory.items[0].text, "User prefers dark chocolate");
  assert.equal(normalized.characters.active, "mira");

  // 2. Verify 0.7 defaults populated
  assert(normalized.theme, "Theme settings must exist");
  assert.equal(normalized.theme.pack, "cozy");
  assert.equal(normalized.theme.appearance, "dark");

  assert(normalized.sound, "Sound settings must exist");
  assert.equal(normalized.sound.enabled, false);

  assert(normalized.whiteboard, "Whiteboard settings must exist");
  assert.equal(normalized.whiteboard.enabled, true);
  assert.equal(normalized.whiteboard.writingStyle, "marker");

  assert(normalized.reddit, "Reddit settings must exist");
  assert.equal(normalized.reddit.enabled, false);
  assert.deepEqual(normalized.reddit.watchers, []);

  assert(normalized.notifications, "Notifications settings must exist");
  assert.equal(normalized.notifications.enabled, true);
  assert(normalized.notifications.matrix, "Notification matrix must exist");

  assert(normalized.missions, "Missions settings must exist");
  assert.equal(normalized.missions.enabled, true);
  assert.equal(normalized.missions.workspace, "~/friends-workspace");
});

test("Backup & Migration 0.6 audit: all new 0.7 paths included, all secrets excluded", () => {
  // Verify SAFE_PATH supports deeper nested 0.7 paths
  const testPaths = [
    "settings.json",
    "chats/chat_123.json",
    "notes/my-note.md",
    "whiteboards/board1.json",
    "whiteboards/board1.history/1700000000000.json",
    "robot/rooms/cozy-cabin.json",
    "robot/looks/casual-atlas.json",
    "missions/m_abc123/audit.jsonl",
    "missions/m_abc123/artifacts/report.md",
  ];

  // Pattern from server/backup.js
  const SAFE_PATH = /^[\w][\w.-]*(\/[\w][\w.-]*){0,6}$/;
  for (const p of testPaths) {
    assert(SAFE_PATH.test(p), `SAFE_PATH must accept valid nested path: ${p}`);
  }

  // Verify SKIP regex excludes all secrets
  const secretPaths = [
    "secrets.json",
    ".env",
    "subfolder/.env",
    "keyring.key",
    "ssl/server.key",
    ".health-probe",
    "desktop/Cache",
    "voice/model.onnx",
    "backups/friends-backup.json.gz",
    "temp.tmp",
  ];

  const SKIP = [
    /^secrets\.json$/,
    /^desktop(\/|$)/,
    /^voice(\/|$)/,
    /^backups(\/|$)/,
    /\.tmp$/,
    /(^|\/)\.health-probe$/,
    /(^|\/)\.env/,
    /\.key$/,
  ];
  const skipped = (rel) => SKIP.some((re) => re.test(rel));

  for (const s of secretPaths) {
    assert(skipped(s), `Backup SKIP must reject sensitive path: ${s}`);
  }

  // Verify pack and unpack roundtrip
  const sampleBackup = {
    format: "friends-backup",
    version: 1,
    app: "0.7.0",
    createdAt: new Date().toISOString(),
    withFiles: false,
    files: [
      { path: "settings.json", encoding: "utf8", data: JSON.stringify({ theme: { pack: "cozy" } }) },
      { path: "whiteboards/board1.json", encoding: "utf8", data: JSON.stringify({ items: [] }) },
      { path: "robot/rooms/room1.json", encoding: "utf8", data: JSON.stringify({ props: [] }) },
    ],
  };

  const packed = backup.pack(sampleBackup);
  assert(Buffer.isBuffer(packed), "pack should return a compressed buffer");

  const unpacked = backup.unpack(packed);
  assert.equal(unpacked.format, "friends-backup");
  assert.equal(unpacked.files.length, 3);
  assert.equal(unpacked.files[1].path, "whiteboards/board1.json");
});
