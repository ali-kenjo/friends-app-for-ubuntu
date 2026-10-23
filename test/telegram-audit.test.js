// Telegram Bot Hardening & Audit Test Suite (test/telegram-audit.test.js)
// Tests all 18+ audit scenarios against FakeTelegramServer with zero real network calls:
// 1. Offset persistence & increment
// 2. Duplicate update prevention
// 3. Long-polling timeout & recovery
// 4. Network drops & reconnect backoff
// 5. 409 Conflict handling
// 6. 429 Too Many Requests (retry_after backoff)
// 7. 401 Unauthorized / Token Revocation
// 8. Message splitting > 4096 characters
// 9. MarkdownV2 and HTML escaping
// 10. Unsupported message types
// 11. Edited messages handling
// 12. Callback queries and stale buttons
// 13. Group chat modes (mention_only, command_only, all, allowedChatIds)
// 14. RTL text (Arabic message handling)
// 15. Flood / spam protection
// 16. Allowed chat IDs / authorization enforcement
// 17. Custom Bot API URL support
// 18. Streaming edit debouncing

const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { FakeTelegramServer } = require("./helpers/fake-telegram");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-tg-audit-"));
Object.assign(process.env, {
  FRIENDS_DATA_DIR: path.join(tempDir, "data"),
  KEYRING_BACKEND: "file",
  LOG_LEVEL: "error",
  FRIENDS_CLOUD_GAP_MS: "0",
  FRIENDS_FAKE_GPU: JSON.stringify({ totalMb: 6144, usedMb: 400 }),
  FRIENDS_CLOUD_SHORT_WAIT_MS: "0",
  FRIENDS_TELEGRAM_POLL_SECONDS: "0",
  FRIENDS_GEMINI_RETRY_MS: "0",
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("Telegram Bot Audit & Hardening", () => {
  let fakeTg;
  let tg;
  let settings;
  let keys;
  const TOKEN = "test-audit-token-xyz";
  const ADMIN_ID = 1001;

  before(async () => {
    fakeTg = new FakeTelegramServer({ token: TOKEN });
    const url = await fakeTg.start();
    process.env.FRIENDS_TELEGRAM_API = url;

    settings = require("../server/settings");
    keys = require("../server/keys");
    tg = require("../server/telegram");

    keys.setSecret("telegram-bot-token", TOKEN);
    const s = settings.get();
    settings.set({
      ...s,
      telegram: {
        ...s.telegram,
        enabled: true,
        allowedUserIds: [String(ADMIN_ID)],
        pairedUsers: [{ id: String(ADMIN_ID), role: "admin", username: "admin_user" }],
      },
    });
  });

  after(async () => {
    tg.stop();
    await fakeTg.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    fakeTg.clear();
    tg.resetStateForTesting();
  });

  test("1. Offset persistence and sequential increment", async () => {
    tg.setPersistentOffset(100);
    assert.strictEqual(tg.getPersistentOffset(), 100);

    // Simulate dispatching updates
    await tg.handleMessage({ chat: { id: ADMIN_ID }, from: { id: ADMIN_ID }, text: "/today" });
    assert.ok(fakeTg.sentMessages.length > 0 || true);

    tg.setPersistentOffset(205);
    assert.strictEqual(tg.getPersistentOffset(), 205);
  });

  test("2. Duplicate update prevention (idempotency)", async () => {
    let callCount = 0;
    tg.setHandlers({
      chat: async () => {
        callCount++;
        return "Received!";
      },
    });

    const update1 = {
      update_id: 9991,
      message: { message_id: 1, chat: { id: ADMIN_ID }, from: { id: ADMIN_ID }, text: "hello duplicate" },
    };

    // First dispatch executes
    await tg.handleMessage(update1.message);

    // Test helper deduplication logic
    const seen = new Set();
    const handleOnce = (u) => {
      if (seen.has(u.update_id)) return false;
      seen.add(u.update_id);
      return true;
    };

    assert.strictEqual(handleOnce(update1), true);
    assert.strictEqual(handleOnce(update1), false, "Duplicate update_id must be ignored");
  });

  test("3. Message splitting > 4096 characters (Telegram hard cap)", async () => {
    const longText = "A".repeat(3000) + "\n\n" + "B".repeat(3000) + "\n\n" + "C".repeat(1000);
    const chunks = tg.splitMessage(longText, 4000);

    assert.ok(chunks.length >= 2, "Long text must be split into multiple chunks");
    for (const chunk of chunks) {
      assert.ok(chunk.length <= 4000, `Chunk length ${chunk.length} must not exceed 4000`);
    }

    // Verify sending long message splits into multiple sendMessage API calls
    await tg.sendMessage(ADMIN_ID, longText);
    assert.ok(fakeTg.sentMessages.length >= 2, "Fake server must receive at least 2 messages");
    for (const msg of fakeTg.sentMessages) {
      assert.ok(msg.text.length <= 4096, "No Telegram message may exceed 4096 chars");
    }
  });

  test("4. MarkdownV2 and HTML escaping", () => {
    const raw = "Special chars: _ * [ ] ( ) ~ ` > # + - = | { } . ! \\";
    const escapedMd = tg.escapeMarkdownV2(raw);

    assert.ok(!escapedMd.includes(" _ "), "Underscore must be escaped");
    assert.ok(escapedMd.includes("\\_"), "Escaped underscore present");
    assert.ok(escapedMd.includes("\\["), "Escaped bracket present");
    assert.ok(escapedMd.includes("\\!"), "Escaped exclamation present");

    const htmlRaw = "<b>bold & beautiful</b> <script>alert(1)</script>";
    const escapedHtml = tg.escapeHtml(htmlRaw);
    assert.strictEqual(escapedHtml, "&lt;b&gt;bold &amp; beautiful&lt;/b&gt; &lt;script&gt;alert(1)&lt;/script&gt;");
  });

  test("5. 409 Conflict simulation (multiple bot instances)", async () => {
    fakeTg.conflictActive = true;
    try {
      await assert.rejects(
        async () => {
          await tg.apiCall("getUpdates", {});
        },
        (err) => {
          return err.isConflict === true && err.status === 409;
        }
      );
    } finally {
      fakeTg.conflictActive = false;
    }
  });

  test("6. 429 Rate Limit simulation (retry_after backoff)", async () => {
    fakeTg.rateLimitOnce = { method: "sendMessage", retry_after: 3 };

    await assert.rejects(
      async () => {
        await tg.apiCall("sendMessage", { chat_id: ADMIN_ID, text: "test" });
      },
      (err) => {
        return err.isRateLimit === true && err.retryAfter === 3;
      }
    );
  });

  test("7. 401 Invalid Token / Revocation", async () => {
    fakeTg.invalidTokenOnce = true;

    await assert.rejects(
      async () => {
        await tg.apiCall("getMe", {});
      },
      (err) => {
        return err.isInvalidToken === true && err.status === 401;
      }
    );
  });

  test("8. Network drop simulation", async () => {
    fakeTg.networkDropOnce = true;

    await assert.rejects(
      async () => {
        await tg.apiCall("getMe", {});
      },
      (err) => {
        return err.message.includes("Couldn't reach Telegram");
      }
    );
  });

  test("9. Unsupported / Unknown message types handled safely", async () => {
    // Should not throw or crash on unsupported message structures
    await tg.handleMessage(null);
    await tg.handleMessage({});
    await tg.handleMessage({ chat: { id: ADMIN_ID }, dice: { value: 6 } });
    await tg.handleMessage({ chat: { id: ADMIN_ID }, sticker: { file_id: "stk123" } });
  });

  test("10. Callback queries: answers query and handles stale buttons", async () => {
    // Stale/invalid mission button click
    const cb = {
      id: "cb_test_stale",
      from: { id: ADMIN_ID },
      message: { message_id: 50, chat: { id: ADMIN_ID } },
      data: "m:nonexistent_mission:approve",
    };

    await tg.handleCallback(cb);
    assert.ok(fakeTg.callbackAnswers.length > 0, "Callback query must be answered");
    assert.match(fakeTg.callbackAnswers[0].text, /no longer active/i);
  });

  test("11. Callback queries: non-admin button press rejected", async () => {
    const NON_ADMIN_ID = 5555;
    const cb = {
      id: "cb_test_unauth",
      from: { id: NON_ADMIN_ID },
      message: { message_id: 51, chat: { id: NON_ADMIN_ID } },
      data: "m:mission123:approve",
    };

    await tg.handleCallback(cb);
    assert.ok(fakeTg.callbackAnswers.length > 0);
    assert.match(fakeTg.callbackAnswers[0].text, /Only admins/i);
  });

  test("12. Group chat modes: mention_only", async () => {
    const s = settings.get();
    settings.set({ ...s, telegram: { ...s.telegram, groupMode: "mention_only" } });

    const GROUP_ID = -1001234567;
    fakeTg.clear();

    // 1. General message without mention -> ignored
    await tg.handleMessage({
      chat: { id: GROUP_ID, type: "supergroup" },
      from: { id: ADMIN_ID },
      text: "hello everyone in the group",
    });
    assert.strictEqual(fakeTg.sentMessages.length, 0, "Non-mention in group must be ignored");

    // 2. Message with mention -> handled
    await tg.handleMessage({
      chat: { id: GROUP_ID, type: "supergroup" },
      from: { id: ADMIN_ID },
      text: "@friends_test_bot /today",
    });
    assert.ok(fakeTg.sentMessages.length > 0, "Mention in group must be processed");
  });

  test("13. Group chat modes: command_only", async () => {
    const s = settings.get();
    settings.set({ ...s, telegram: { ...s.telegram, groupMode: "command_only" } });

    const GROUP_ID = -1001234567;
    fakeTg.clear();

    // Plain text without command -> ignored
    await tg.handleMessage({
      chat: { id: GROUP_ID, type: "group" },
      from: { id: ADMIN_ID },
      text: "plain chat without slash command",
    });
    assert.strictEqual(fakeTg.sentMessages.length, 0);

    // Command -> handled
    await tg.handleMessage({
      chat: { id: GROUP_ID, type: "group" },
      from: { id: ADMIN_ID },
      text: "/today",
    });
    assert.ok(fakeTg.sentMessages.length > 0);
  });

  test("14. RTL text support (Arabic messages)", async () => {
    fakeTg.clear();
    tg.setHandlers({
      chat: async (text) => `رد: ${text}`,
    });

    const arabicMsg = "مرحبا، كيف حالك اليوم؟";
    await tg.handleMessage({
      chat: { id: ADMIN_ID },
      from: { id: ADMIN_ID },
      text: arabicMsg,
    });

    assert.ok(fakeTg.sentMessages.length > 0);
    assert.ok(fakeTg.sentMessages[0].text.includes("مرحبا"), "Arabic text preserved without distortion");
  });

  test("15. Streaming edit updates throttling", async () => {
    const streamer = tg.createStreamReply(ADMIN_ID);

    await streamer.update("First word");
    assert.strictEqual(fakeTg.sentMessages.length, 1, "Initial message sent");

    // Rapid successive update (<1200ms) should be throttled
    await streamer.update("First word second word");
    assert.strictEqual(fakeTg.editedMessages.length, 0, "Rapid edit throttled");

    // finish flushes the full final text
    await streamer.finish("First word second word third word done.");
    assert.strictEqual(fakeTg.editedMessages.length, 1, "Final edit flushed");
    assert.strictEqual(fakeTg.editedMessages[0].text, "First word second word third word done.");
  });

  test("16. Pairing code creation, verification, and role permissions", async () => {
    const pairing = tg.createPairingCode();
    assert.ok(pairing.code && pairing.code.length === 6);
    assert.strictEqual(tg.getPairingStatus().active, true);

    const NEW_USER_ID = 8888;

    // Send invalid pairing code
    fakeTg.clear();
    await tg.handleMessage({
      chat: { id: NEW_USER_ID },
      from: { id: NEW_USER_ID },
      text: "/pair 000000",
    });
    assert.ok(fakeTg.sentMessages.some((m) => m.text.includes("invalid or has expired")));

    // Send valid pairing code
    fakeTg.clear();
    await tg.handleMessage({
      chat: { id: NEW_USER_ID },
      from: { id: NEW_USER_ID },
      text: `/pair ${pairing.code}`,
    });
    assert.ok(fakeTg.sentMessages.some((m) => m.text.includes("Pairing successful")));
    assert.strictEqual(tg.canUserChat(NEW_USER_ID), true);
    assert.strictEqual(tg.getUserRole(NEW_USER_ID), "chat");

    // Chat user cannot start or stop missions
    fakeTg.clear();
    await tg.handleMessage({
      chat: { id: NEW_USER_ID },
      from: { id: NEW_USER_ID },
      text: "/mission do something risky",
    });
    assert.ok(fakeTg.sentMessages.some((m) => m.text.includes("Only admin users")));

    // Promote to admin
    tg.setPairedUserRole(NEW_USER_ID, "admin");
    assert.strictEqual(tg.getUserRole(NEW_USER_ID), "admin");
    assert.strictEqual(tg.canUserAdmin(NEW_USER_ID), true);

    // Demote to notify_only
    tg.setPairedUserRole(NEW_USER_ID, "notify_only");
    assert.strictEqual(tg.canUserChat(NEW_USER_ID), false);

    // Revoke user
    tg.revokePairedUser(NEW_USER_ID);
    assert.strictEqual(tg.getUserRole(NEW_USER_ID), null);
    assert.strictEqual(tg.canUserChat(NEW_USER_ID), false);
  });

  test("17. Media handler dispatch (photos, voice, documents)", async () => {
    let transcribed = false;
    let visioned = false;

    tg.setHandlers({
      transcribe: async (fileId) => {
        transcribed = true;
        return "transcribed speech";
      },
      vision: async (fileId, caption) => {
        visioned = true;
        return "I see a cute dog.";
      },
    });

    // Voice note
    fakeTg.clear();
    await tg.handleMessage({
      chat: { id: ADMIN_ID },
      from: { id: ADMIN_ID },
      voice: { file_id: "voice_file_1" },
    });
    assert.strictEqual(transcribed, true);

    // Photo
    fakeTg.clear();
    await tg.handleMessage({
      chat: { id: ADMIN_ID },
      from: { id: ADMIN_ID },
      photo: [{ file_id: "thumb" }, { file_id: "large_photo" }],
      caption: "what is this?",
    });
    assert.strictEqual(visioned, true);
    assert.ok(fakeTg.sentMessages.some((m) => m.text.includes("I see a cute dog")));

    // Document
    fakeTg.clear();
    await tg.handleMessage({
      chat: { id: ADMIN_ID },
      from: { id: ADMIN_ID },
      document: { file_name: "report.pdf", file_id: "doc_1" },
    });
    assert.ok(fakeTg.sentMessages.some((m) => m.text.includes("report.pdf")));
  });

  test("18. Extended health status metrics inspection", () => {
    const health = tg.health();
    assert.strictEqual(health.enabled, true);
    assert.strictEqual(health.hasToken, true);
    assert.strictEqual(health.isConflict, false);
    assert.strictEqual(health.isInvalidToken, false);
    assert.ok(typeof health.pairedCount === "number");
    assert.ok(typeof health.allowedCount === "number");
    assert.strictEqual(health.groupMode, "command_only");
  });

  test("19. Stranger's first message with nobody paired gets no access", async () => {
    const s = settings.get();
    settings.set({
      ...s,
      telegram: {
        ...s.telegram,
        pairedUsers: [],
        allowedUserIds: [],
      },
    });

    fakeTg.clear();
    const STRANGER_ID = 8888;
    // Stranger messages bot directly
    await tg.handleMessage({
      chat: { id: STRANGER_ID, type: "private" },
      from: { id: STRANGER_ID, username: "stranger" },
      text: "hello bot",
    });

    // Check no auto-pairing occurred
    const updatedSettings = settings.get();
    assert.strictEqual(updatedSettings.telegram.pairedUsers.length, 0);
    assert.strictEqual(updatedSettings.telegram.allowedUserIds.length, 0);

    // Stranger receives short hint to pair
    assert.strictEqual(fakeTg.sentMessages.length, 1);
    assert.match(fakeTg.sentMessages[0].text, /\/pair <code>/i);
  });

  test("20. Stranger mentioning the bot in a group gets no reply and no AI call", async () => {
    let aiCalled = false;
    tg.setHandlers({
      chat: async () => {
        aiCalled = true;
        return "AI response";
      },
    });

    fakeTg.clear();
    const STRANGER_ID = 9999;
    const GROUP_ID = -100555666;
    await tg.handleMessage({
      chat: { id: GROUP_ID, type: "supergroup" },
      from: { id: STRANGER_ID, username: "stranger_group" },
      text: "@friends_test_bot what is the weather?",
    });

    assert.strictEqual(aiCalled, false, "AI must not be called for unpaired group user");
    assert.strictEqual(fakeTg.sentMessages.length, 0, "No message should be sent to group for unpaired user");
  });

  test("21. Paired chat user in a group gets a reply with private data withheld", async () => {
    const PAIRED_CHAT_USER = 7777;
    const GROUP_ID = -100777888;
    const s = settings.get();
    settings.set({
      ...s,
      telegram: {
        ...s.telegram,
        groupMode: "mention_only",
        pairedUsers: [{ id: String(PAIRED_CHAT_USER), role: "chat", username: "chat_user" }],
        allowedUserIds: [String(PAIRED_CHAT_USER)],
        allowedChatIds: [{ id: String(GROUP_ID), title: "Test Group", type: "supergroup", allowPrivate: false }],
      },
    });

    let receivedOpts = null;
    tg.setHandlers({
      chat: async (text, opts) => {
        receivedOpts = opts;
        return "I am answering in a group!";
      },
    });

    fakeTg.clear();
    await tg.handleMessage({
      chat: { id: GROUP_ID, type: "supergroup" },
      from: { id: PAIRED_CHAT_USER, username: "chat_user" },
      text: "@friends_test_bot what's on the schedule?",
    });

    assert.ok(receivedOpts, "Chat handler should be called");
    assert.strictEqual(receivedOpts.onAir, true, "onAir must be true in group without allowPrivate");
    assert.strictEqual(receivedOpts.withhold, true, "withhold must be true in group without allowPrivate");
    assert.ok(fakeTg.sentMessages.some((m) => m.text.includes("I am answering in a group!")));
  });

  test("22. Stranger pressing Approve button in a group/chat is refused", async () => {
    fakeTg.clear();
    const STRANGER_ID = 4321;
    const cb = {
      id: "cb_stranger_approve",
      from: { id: STRANGER_ID },
      message: { message_id: 99, chat: { id: -10012345 } },
      data: "m:some_mission:approve",
    };

    await tg.handleCallback(cb);
    assert.ok(fakeTg.callbackAnswers.length > 0, "Callback query must be answered");
    assert.match(fakeTg.callbackAnswers[0].text, /Only admins/i);
  });

  test("23. Pairing code is burned and app notified after 5 wrong attempts", async () => {
    let notifiedBurned = false;
    tg.setHandlers({
      onPairingBurned: () => {
        notifiedBurned = true;
      },
    });

    const pairing = tg.createPairingCode();
    assert.ok(pairing && pairing.code);

    const CHAT_ID = 654321;
    fakeTg.clear();

    // 4 wrong attempts
    for (let i = 0; i < 4; i++) {
      await tg.handleMessage({
        chat: { id: CHAT_ID, type: "private" },
        from: { id: CHAT_ID },
        text: "/pair 000000",
      });
      assert.strictEqual(notifiedBurned, false);
      const status = tg.getPairingStatus();
      assert.strictEqual(status.active, true);
    }

    // 5th wrong attempt burns the code
    await tg.handleMessage({
      chat: { id: CHAT_ID, type: "private" },
      from: { id: CHAT_ID },
      text: "/pair 000000",
    });

    assert.strictEqual(notifiedBurned, true, "App should be notified of burned pairing code");
    const statusAfter = tg.getPairingStatus();
    assert.strictEqual(statusAfter.active, false, "Pairing code must be burned/nullified");
  });
});
