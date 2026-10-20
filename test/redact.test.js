// Keeping private things out of what goes to a cloud AI.
const { test, describe } = require("node:test");
const assert = require("node:assert");
const redact = require("../server/redact");

const all = { keys: true, cards: true, emails: true, phones: true };

describe("Hiding what is private", () => {
  test("keys of the usual services, a bearer token and a private key are hidden", () => {
    const text = "use sk-proj-abcdefghijklmnopqrstuvwx and AIzaSyA1234567890123456789012345678901 and ghp_abcdefghijklmnopqrstuvwxyz0123456789 and gsk_abcdefghijklmnopqrstuvwxyz";
    const out = redact.redactText(text, { keys: true });
    assert.strictEqual(out, "use [key] and [key] and [key] and [key]");
    assert.strictEqual(redact.redactText("Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123", { keys: true }), "Authorization: [key]");
    assert.match(redact.redactText("-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----", { keys: true }), /^\[key\]$/);
  });

  test("card numbers are hidden only when they pass the Luhn check, so other long numbers stay", () => {
    assert.strictEqual(redact.redactText("pay with 4111 1111 1111 1111 please", { cards: true }), "pay with [card] please");
    assert.strictEqual(redact.redactText("order 4111 1111 1111 1112 shipped", { cards: true }), "order 4111 1111 1111 1112 shipped");
    assert.ok(redact.luhn("4111111111111111"));
    assert.ok(!redact.luhn("4111111111111112"));
  });

  test("emails are hidden", () => {
    assert.strictEqual(redact.redactText("write to ann.lee+work@example.co.uk or bob@x.io", { emails: true }), "write to [email] or [email]");
  });

  test("phone numbers need a plus sign or separators; dates, addresses and plain numbers stay", () => {
    const out = redact.redactText("call +49 170 1234567 or (030) 123-4567; on 2026-10-20 at 192.168.100.200, invoice 12345678, total 1234567890", { phones: true });
    assert.strictEqual(out, "call [phone] or [phone]; on 2026-10-20 at 192.168.100.200, invoice 12345678, total 1234567890");
  });

  test("only the kinds that are switched on are touched", () => {
    const text = "ann@example.com +49 170 1234567 sk-proj-abcdefghijklmnopqrstuvwx";
    assert.strictEqual(redact.redactText(text, { emails: true }), "[email] +49 170 1234567 sk-proj-abcdefghijklmnopqrstuvwx");
    assert.strictEqual(redact.redactText(text, {}), text);
    assert.ok(!redact.active({ keys: false, cards: false }));
    assert.ok(redact.active({ keys: true }));
  });

  test("contents keep their shape: text parts change, pictures and files are left alone", () => {
    const contents = [{ role: "user", parts: [{ text: "mail ann@example.com" }, { inlineData: { mimeType: "image/png", data: "AAAA" } }] }, { role: "model", parts: [{ text: "ok" }] }];
    const out = redact.redactContents(contents, all);
    assert.strictEqual(out[0].parts[0].text, "mail [email]");
    assert.deepStrictEqual(out[0].parts[1], contents[0].parts[1]);
    assert.strictEqual(contents[0].parts[0].text, "mail ann@example.com", "the original is not changed");
    assert.strictEqual(redact.redactContents(contents, {}), contents, "nothing to hide: the same object");
  });

  test("whatever a tool brings back is cleaned too, however deep", () => {
    const out = redact.redactDeep({ emails: [{ from: "bob@example.com", n: 3 }], note: "key sk-proj-abcdefghijklmnopqrstuvwx" }, all);
    assert.deepStrictEqual(out, { emails: [{ from: "[email]", n: 3 }], note: "key [key]" });
  });
});
