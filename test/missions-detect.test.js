// "Make this a mission?": a cheap guess at whether a message is a goal or a plan, and not a question or small talk.
const { test, describe } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = () => import(pathToFileURL(path.join(__dirname, "..", "src", "js", "missions", "detect.mjs")));

describe("Does it sound like a mission", () => {
  test("a question, small talk and short requests are not", async () => {
    const { looksLikeMission } = await load();
    for (const text of ["What's the weather like?", "hi", "Can you explain how ingress controllers work in Kubernetes?", "Thanks, that was great!", "remind me to call mom at 5", "Wie spät ist es in Tokio?"]) assert.strictEqual(looksLikeMission(text), false, text);
  });

  test("a pasted plan (three or more list items) is", async () => {
    const { looksLikeMission } = await load();
    assert.ok(looksLikeMission("Here is what I want:\n1. Look at my Downloads folder\n2. Move PDFs into Documents/PDFs\n3. Tell me what is left\n4. Delete empty folders"));
    assert.ok(looksLikeMission("- check disk usage\n- list the biggest folders\n- write the result into a note"));
  });

  test("a long goal with a doing word is, in English, German and Arabic", async () => {
    const { looksLikeMission } = await load();
    assert.ok(looksLikeMission("Research the three best budget laptops for video editing, compare their prices and battery life, and write me a short report with sources."));
    assert.ok(looksLikeMission("Recherchiere die drei besten günstigen Laptops für Videoschnitt, vergleiche Preise und Akkulaufzeit und schreibe mir einen kurzen Bericht mit Quellen."));
    assert.ok(looksLikeMission("ابحث عن أفضل ثلاثة حواسيب محمولة اقتصادية لمونتاج الفيديو وقارن الأسعار واكتب لي تقريراً قصيراً مع المصادر."));
  });

  test("the word mission at the start always counts", async () => {
    const { looksLikeMission } = await load();
    assert.ok(looksLikeMission("mission: tidy my desktop and report what you did"));
    assert.ok(looksLikeMission("/mission clean up my projects folder please"));
  });

  test("a long question isn't", async () => {
    const { looksLikeMission } = await load();
    assert.strictEqual(looksLikeMission("Do you think it would be better to build an app in React or in Vue if I want to compare them for my next project?"), false);
  });
});
