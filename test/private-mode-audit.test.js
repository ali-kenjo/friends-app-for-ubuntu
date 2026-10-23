const test = require("node:test");
const assert = require("node:assert/strict");
const privacy = require("../server/privacy");
const settings = require("../server/settings");
const redditConnector = require("../server/connectors/reddit");
const redditWatcher = require("../server/reddit-watcher");
const redact = require("../server/redact");

test("Private mode audit: leaving() telemetry strictly reflects outbound paths", () => {
  // 1. Standard mode with cloud AI and features
  const standardSettings = {
    privacy: { localOnly: false },
    telegram: { enabled: true },
    updates: { check: true },
    life: { briefingNews: true },
    reddit: { enabled: true, watchers: [{ id: "w1", subreddit: "news", enabled: true }] },
  };

  const stdLeaving = privacy.leaving(standardSettings);
  assert(stdLeaving.some((x) => x.id === "news"), "News must be listed when enabled in standard mode");
  assert(stdLeaving.some((x) => x.id === "updates"), "Updates must be listed when enabled in standard mode");
  assert(stdLeaving.some((x) => x.id === "telegram"), "Telegram must be listed when enabled");
  assert(stdLeaving.some((x) => x.id === "reddit-watchers"), "Reddit watchers must be listed when enabled");

  // 2. Private mode: everything online is blocked
  const privateSettings = {
    privacy: { localOnly: true },
    telegram: { enabled: false },
    updates: { check: true },
    life: { briefingNews: true },
    reddit: { enabled: true, watchers: [{ id: "w1", subreddit: "news", enabled: true }] },
  };

  const privLeaving = privacy.leaving(privateSettings);
  assert.equal(privLeaving.length, 0, "In Private mode with Telegram off, nothing may leave the computer");

  // 3. Private mode with Telegram bot on: only Telegram is reported
  const privWithTelegram = {
    ...privateSettings,
    telegram: { enabled: true },
  };
  const privTgLeaving = privacy.leaving(privWithTelegram);
  assert.equal(privTgLeaving.length, 1, "Only Telegram is listed in Private mode when Telegram is on");
  assert.equal(privTgLeaving[0].id, "telegram");
});

test("Private mode audit: Reddit API and watchers are strictly blocked", async () => {
  const origSettings = settings.get();
  try {
    // Enable private mode
    settings.set({
      ...origSettings,
      privacy: { ...origSettings.privacy, localOnly: true },
      reddit: {
        enabled: true,
        clientId: "test_client",
        watchers: [{ id: "w1", subreddit: "programming", enabled: true }],
      },
    });

    // 1. redditRequest should throw immediately
    await assert.rejects(
      async () => {
        await redditConnector.redditRequest({}, "/r/test/new.json");
      },
      /blocked in Private mode/i,
      "redditRequest must throw and block network in Private mode"
    );

    // 2. getAccessToken should throw immediately
    await assert.rejects(
      async () => {
        await redditConnector.getAccessToken({});
      },
      /blocked in Private mode/i,
      "getAccessToken must throw and block network in Private mode"
    );

    // 3. pollOnce should return empty array without network activity
    const matches = await redditWatcher.pollOnce();
    assert.deepEqual(matches, [], "pollOnce must return empty array without polling in Private mode");
  } finally {
    settings.set(origSettings);
  }
});

test("Private mode audit: Redaction of sensitive data", () => {
  const options = { keys: true, cards: true, emails: true, phones: true };

  // API Key scrubbing
  const textWithKey = "Here is my secret Gemini key: AIzaSyD1234567890abcdefghijklmnopqrstuvw";
  const redactedKey = redact.redactText(textWithKey, options);
  assert(!redactedKey.includes("AIzaSyD1234567890"), "API key must be redacted");
  assert(redactedKey.includes("[key]"), "Placeholder [key] must be inserted for API key");

  // Email scrubbing
  const textWithEmail = "Send report to contact@example.com for review";
  const redactedEmail = redact.redactText(textWithEmail, options);
  assert(!redactedEmail.includes("contact@example.com"), "Email address must be redacted");
  assert(redactedEmail.includes("[email]"), "Placeholder [email] must be inserted for email");

  // Phone number scrubbing
  const textWithPhone = "Call me at +1 555-123-4567 or (555) 987-6543";
  const redactedPhone = redact.redactText(textWithPhone, options);
  assert(!redactedPhone.includes("555-123-4567"), "Phone number must be redacted");
  assert(redactedPhone.includes("[phone]"), "Placeholder [phone] must be inserted for phone");

  // Deep redaction of tool returns / nested objects
  const payload = {
    author: "Alice",
    email: "alice@example.com",
    details: {
      notes: "Secret token: AIzaSyABCD1234efgh5678ijklmnopqrstuvw",
    },
    recipients: ["bob@example.com", "carol@example.com"],
  };

  const cleanPayload = redact.redactDeep(payload, options);
  assert.equal(cleanPayload.author, "Alice");
  assert.equal(cleanPayload.email, "[email]");
  assert.equal(cleanPayload.details.notes, "Secret token: [key]");
  assert.deepEqual(cleanPayload.recipients, ["[email]", "[email]"]);

  // Message contents redaction
  const contents = [
    {
      role: "user",
      parts: [
        { text: "My email is user@domain.com and key is AIzaSy1234567890123456789012345678901234" },
      ],
    },
  ];
  const cleanContents = redact.redactContents(contents, options);
  assert.equal(cleanContents[0].parts[0].text, "My email is [email] and key is [key]");
});
