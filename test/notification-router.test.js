const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-notif-router-"));
process.env.FRIENDS_DATA_DIR = tempDir;

const notifications = require("../server/notifications");
const settings = require("../server/settings");

test("Unified Notification Router", async (t) => {
  t.after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  t.beforeEach(() => {
    notifications.clearLog();
    notifications.unregisterChannel("desktop");
    notifications.unregisterChannel("inapp");
    notifications.unregisterChannel("telegram");
    const s = settings.get();
    settings.set({
      ...s,
      notifications: {
        ...s.notifications,
        dnd: { enabled: false, until: 0 },
        digest: { enabled: false, mode: "hourly", time: "09:00" },
        quietHours: { enabled: false, start: "22:00", end: "08:00", allowUrgent: true },
        rateLimits: { maxPerMinute: 15, maxPerHour: 100 },
      },
    });
  });

  await t.test("registers channels and dispatches events based on matrix", async () => {
    const delivered = [];
    notifications.registerChannel("desktop", {
      send: async (item) => {
        delivered.push({ channel: "desktop", id: item.id });
        return { status: "sent" };
      },
    });
    notifications.registerChannel("telegram", {
      send: async (item) => {
        delivered.push({ channel: "telegram", id: item.id });
        return { status: "sent" };
      },
    });

    // Reminder is enabled on both desktop and telegram by default
    const res = await notifications.dispatch("reminder", {
      title: "Drink water",
      body: "Stay hydrated",
    });

    assert.equal(res.dispatched, true);
    assert.equal(delivered.length, 2);
    assert.equal(res.destinations.desktop.status, "sent");
    assert.equal(res.destinations.telegram.status, "sent");

    const log = notifications.getLog();
    assert.equal(log.length, 1);
    assert.equal(log[0].event, "reminder");
    assert.equal(log[0].destinations.desktop.status, "sent");
  });

  await t.test("matrix toggle disables specific channels", async () => {
    const delivered = [];
    notifications.registerChannel("desktop", {
      send: async (item) => {
        delivered.push("desktop");
      },
    });
    notifications.registerChannel("telegram", {
      send: async (item) => {
        delivered.push("telegram");
      },
    });

    // Override habit_nudge which has telegram: false in default matrix
    const res = await notifications.dispatch("habit_nudge", {
      title: "Meditation streak",
      body: "Keep it up!",
    });

    assert.equal(res.dispatched, true);
    assert.equal(delivered.includes("desktop"), true);
    assert.equal(delivered.includes("telegram"), false);
    assert.equal(res.destinations.telegram.status, "disabled_in_matrix");
  });

  await t.test("DND suppresses non-urgent notifications but allows urgent ones", async () => {
    const delivered = [];
    notifications.registerChannel("desktop", {
      send: async (item) => {
        delivered.push(item.id);
      },
    });

    // Temporarily turn on DND
    const s = settings.get();
    settings.set({
      ...s,
      notifications: {
        ...s.notifications,
        dnd: { enabled: true, until: Date.now() + 60000 },
      },
    });

    // Non-urgent reminder
    const resNormal = await notifications.dispatch("reminder", { title: "Normal reminder" });
    assert.equal(resNormal.dispatched, false);
    assert.equal(resNormal.reason, "suppressed_dnd");
    assert.equal(delivered.length, 0);

    // Urgent approval bypasses DND
    const resUrgent = await notifications.dispatch("mission_approval", { title: "Critical action" }, { urgent: true });
    assert.equal(resUrgent.dispatched, true);
    assert.equal(delivered.length, 1);

    // Reset settings
    settings.set(s);
  });

  await t.test("digest mode queues non-urgent notifications and flushDigest delivers them", async () => {
    const delivered = [];
    notifications.registerChannel("desktop", {
      send: async (item) => {
        delivered.push(item);
      },
    });

    const s = settings.get();
    settings.set({
      ...s,
      notifications: {
        ...s.notifications,
        digest: { enabled: true, mode: "hourly", time: "09:00" },
      },
    });

    const resQueued = await notifications.dispatch("reminder", { title: "Buy groceries" });
    assert.equal(resQueued.queuedForDigest, true);
    assert.equal(delivered.length, 0);

    const flushedCount = await notifications.flushDigest();
    assert.equal(flushedCount, 1);
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].event, "briefing");

    // Reset settings
    settings.set(s);
  });

  await t.test("rate limits cap rapid notification bursts", async () => {
    notifications.registerChannel("desktop", {
      send: async () => ({ status: "sent" }),
    });

    const s = settings.get();
    settings.set({
      ...s,
      notifications: {
        ...s.notifications,
        rateLimits: { maxPerMinute: 3, maxPerHour: 50 },
      },
    });

    const r1 = await notifications.dispatch("reminder", { title: "N1" });
    const r2 = await notifications.dispatch("reminder", { title: "N2" });
    const r3 = await notifications.dispatch("reminder", { title: "N3" });
    const r4 = await notifications.dispatch("reminder", { title: "N4" });

    assert.equal(r1.destinations.desktop.status, "sent");
    assert.equal(r2.destinations.desktop.status, "sent");
    assert.equal(r3.destinations.desktop.status, "sent");
    assert.equal(r4.destinations.desktop.status, "rate_limited");

    // Reset settings
    settings.set(s);
  });
});
