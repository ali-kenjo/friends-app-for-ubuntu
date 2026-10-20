// Two settings that change what an AI is told and offered: the language of the answers, and keeping memories and notes from
// cloud AIs.
const { test, describe } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.FRIENDS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "friends-ai-prompt-"));
process.env.KEYRING_BACKEND = "file";
process.env.LOG_LEVEL = "error";

const settings = require("../server/settings");
const prompt = require("../server/prompt");
const tools = require("../server/tools");

const base = () => {
  const s = JSON.parse(JSON.stringify(settings.get()));
  s.memory = { enabled: true, items: [{ id: "1", text: "Likes strong tea" }] };
  s.aiNotes.enabled = true;
  s.permissions.folders = [];
  return s;
};

describe("The language of the answers", () => {
  test("by default nothing is said about it; chosen, the AI is told to answer in it", () => {
    assert.doesNotMatch(prompt.build(base()), /Always answer in/);
    const s = base();
    s.aiControl.replyLanguage = "de";
    assert.match(prompt.build(s), /# Language\nAlways answer in German, even when .* writes in another language, unless they clearly ask you to switch\./);
    s.aiControl.replyLanguage = "ar";
    assert.match(prompt.build(s), /Always answer in Arabic/);
  });

  test("only known languages are kept", () => {
    const s = settings.sanitize({ ...base(), aiControl: { ...base().aiControl, replyLanguage: "klingon" } });
    assert.strictEqual(s.aiControl.replyLanguage, "auto");
    assert.strictEqual(settings.sanitize({ ...base(), aiControl: { ...base().aiControl, replyLanguage: "fr" } }).aiControl.replyLanguage, "fr");
    assert.ok(Object.keys(settings.REPLY_LANGUAGES).length >= 15);
  });
});

describe("Memories and notes for a cloud AI", () => {
  test("they are in the instructions for a local AI, and left out for a cloud AI when sharing is off", () => {
    const s = base();
    assert.match(prompt.build(s), /Likes strong tea/);
    assert.match(prompt.build(s, { withhold: false }), /Your memory notes/);
    const withheld = prompt.build(s, { withhold: true });
    assert.doesNotMatch(withheld, /Likes strong tea/);
    assert.doesNotMatch(withheld, /Your memory notes/);
  });

  test("the tools that read or write them aren't offered to it either", () => {
    const s = base();
    s.localNotes.enabled = true;
    s.companion.recall = true;
    const names = (opts) => tools.declarations(s, opts).map((t) => t.name);
    const all = names({});
    for (const n of ["save_note", "search_notes", "recall_conversations"]) assert.ok(all.includes(n), `${n} is offered normally`);
    const some = names({ withhold: true });
    for (const n of ["save_note", "delete_note", "search_notes", "read_note", "list_notes", "recall_conversations"]) assert.ok(!some.includes(n), `${n} is kept back`);
    assert.ok(some.includes("add_task") || some.length > 0, "the rest is still there");
  });

  test("a setting that is on by default, and keeps for a day count", () => {
    assert.strictEqual(settings.get().privacy.shareMemoryWithCloud, true);
    assert.strictEqual(settings.sanitize({ privacy: { keepChatsDays: 30 } }).privacy.keepChatsDays, 30);
  });
});
