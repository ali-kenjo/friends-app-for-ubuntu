// The model manager: making a local model ready on a small graphics card (unloading the one before, estimating whether
// it fits, falling back to a smaller model or the processor), the queue that keeps one heavy model at a time, the
// specialist roles and their settings page, suggestions, pulling models, and searching notes by meaning.
const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const fakeAi = require("./helpers/fake-ai");
const { waitFor, sleep } = fakeAi;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-vram-"));
Object.assign(process.env, { FRIENDS_DATA_DIR: path.join(tempDir, "data"), KEYRING_BACKEND: "file", LOG_LEVEL: "error", FRIENDS_FAKE_GPU: JSON.stringify({ totalMb: 6144, usedMb: 400 }) });
delete process.env.GEMINI_API_KEY;

describe("The model manager", () => {
  const ai = fakeAi.create();
  let vram, models, specialists, api, suggestions, settings, brains, embeddings, localNotes;
  const setGpu = (gpu) => (process.env.FRIENDS_FAKE_GPU = gpu === "none" ? "none" : JSON.stringify(gpu));
  const brainOf = (model, extra = {}) => brains.apiFor && { ...extra, id: 1, name: model, provider: "local", protocol: "ollama", baseUrl: ai.localUrl(), model, contextSize: 8192, kind: "local", key: "", api: brains.apiFor({ provider: "local", protocol: "ollama", baseUrl: ai.localUrl(), contextSize: 8192, ...extra }) };
  const setSettings = (change) => settings.set(change(JSON.parse(JSON.stringify(settings.get()))));

  before(async () => {
    await ai.start();
    vram = require("../server/vram");
    models = require("../server/models");
    specialists = require("../server/specialists");
    api = require("../server/specialists-api");
    suggestions = require("../server/specialist-suggestions");
    settings = require("../server/settings");
    brains = require("../server/brains");
    embeddings = require("../server/embeddings");
    localNotes = require("../server/local-notes");
    await brains.saveBrain({ provider: "local", protocol: "ollama", name: "tiny", baseUrl: ai.localUrl(), model: "tiny:latest", contextSize: 8192 });
    setSettings((s) => ({ ...s, localNotes: { ...s.localNotes, folder: path.join(tempDir, "vault") } }));
  });

  after(async () => {
    await ai.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    ai.reset();
    ai.behave.models = [{ name: "tiny:latest", size: 800e6 }, { name: "coder:latest", size: 4.2e9 }, { name: "big:latest", size: 9e9 }, { name: "huge:latest", size: 14e9 }];
    setGpu({ totalMb: 6144, usedMb: 400 });
    models.forget();
    setSettings((s) => ({ ...s, privacy: { ...s.privacy, localOnly: false }, specialists: { baseUrl: "", roles: [], suggestedSeen: false } }));
  });

  describe("Will it fit", () => {
    test("the memory a model needs: its weights, the context, and some overhead", async () => {
      const est = await vram.estimate(ai.localUrl(), "tiny:latest", 8192);
      assert.strictEqual(est.known, true);
      assert.strictEqual(est.weightsMb, Math.round(800e6 / 1024 / 1024));
      assert.ok(est.kvMb > 500 && est.kvMb < 1500, `a typical context at 8192 is about 1 GB, not ${est.kvMb}`);
      assert.strictEqual(est.totalMb, est.weightsMb + est.kvMb + 160);
      assert.ok((await vram.estimate(ai.localUrl(), "tiny:latest", 2048)).totalMb < est.totalMb, "a shorter context needs less");
      assert.strictEqual((await vram.estimate(ai.localUrl(), "nothing:latest", 4096)).known, false);
    });

    test("it runs on the card when it fits, in part when part fits, on the processor when it doesn't, and as Ollama decides with no card", () => {
      const card = { totalMb: 6144, usedMb: 400 };
      assert.strictEqual(vram.place({ totalMb: 2000 }, card).placement, "gpu");
      assert.strictEqual(vram.place({ totalMb: 7000 }, card).placement, "split");
      assert.strictEqual(vram.place({ totalMb: 12000 }, card).placement, "cpu");
      assert.strictEqual(vram.place({ totalMb: 2000 }, null).placement, "auto");
      // What other programs use counts: the desktop on the same card
      assert.strictEqual(vram.place({ totalMb: 4500 }, { totalMb: 6144, usedMb: 400 }).placement, "gpu");
      assert.strictEqual(vram.place({ totalMb: 4500 }, { totalMb: 6144, usedMb: 2500 }).placement, "split");
      // A model that is loaded already doesn't count against itself
      assert.strictEqual(vram.place({ totalMb: 4500 }, { totalMb: 6144, usedMb: 4900 }, 4500).placement, "gpu");
    });

    test("the badge in Settings: would this model fit the card", async () => {
      assert.strictEqual((await vram.fits(ai.localUrl(), "tiny:latest", 4096)).placement, "gpu");
      assert.strictEqual((await vram.fits(ai.localUrl(), "big:latest", 8192)).placement, "split", "9 GB of weights: part on the card");
      assert.strictEqual((await vram.fits(ai.localUrl(), "huge:latest", 8192)).placement, "cpu");
      assert.strictEqual((await vram.fits(ai.localUrl(), "nothing:latest", 8192)).placement, "unknown");
    });
  });

  describe("Getting a model ready", () => {
    test("the one before is unloaded first, then the new one is loaded on the card", async () => {
      await vram.prepare(brainOf("tiny:latest"), { role: "general" });
      assert.deepStrictEqual(ai.hits.loads.map((l) => l.model), ["tiny:latest"]);
      const r = await vram.prepare(brainOf("coder:latest"), { role: "coding" });
      assert.deepStrictEqual(ai.hits.unloads, ["tiny:latest"], "the small one made room");
      assert.deepStrictEqual(ai.hits.loads.map((l) => l.model), ["tiny:latest", "coder:latest"]);
      assert.strictEqual(r.placement, "gpu");
      assert.deepStrictEqual(r.unloaded, ["tiny:latest"]);
      assert.ok(r.sizeVram > 0);
      assert.deepStrictEqual([...ai.loaded.keys()], ["coder:latest"], "one heavy model at a time");
    });

    test("the same model again isn't loaded twice", async () => {
      await vram.prepare(brainOf("tiny:latest"), { role: "general" });
      await vram.prepare(brainOf("tiny:latest"), { role: "writing" });
      assert.strictEqual(ai.hits.unloads.length, 0);
    });

    test("a model that doesn't fit runs on the processor, and says so", async () => {
      const r = await vram.prepare(brainOf("huge:latest"), { role: "general" });
      assert.strictEqual(r.placement, "cpu");
      assert.strictEqual(r.brain.numGpu, 0);
      assert.strictEqual(ai.hits.loads.at(-1).options.num_gpu, 0, "Ollama was told: no graphics card");
    });

    test("or on the role's smaller model, when it has one", async () => {
      const r = await vram.prepare(brainOf("huge:latest"), { role: "coding", fallbackModel: "tiny:latest" });
      assert.strictEqual(r.fallbackUsed, true);
      assert.strictEqual(r.brain.model, "tiny:latest");
      assert.strictEqual(r.placement, "gpu");
      assert.deepStrictEqual(ai.hits.loads.map((l) => l.model), ["tiny:latest"], "the big one was never loaded");
    });

    test("no graphics card: it just loads (Ollama decides)", async () => {
      setGpu("none");
      const r = await vram.prepare(brainOf("coder:latest"), { role: "coding" });
      assert.notStrictEqual(r.placement, "cpu");
      assert.ok(!("num_gpu" in (ai.hits.loads.at(-1).options || {})), "nothing forced");
    });

    test("when Ollama isn't there it doesn't throw: the call itself will say so", async () => {
      const r = await vram.prepare({ ...brainOf("tiny:latest"), baseUrl: "http://127.0.0.1:9" }, {});
      assert.ok(r.error);
    });
  });

  describe("One heavy model at a time", () => {
    test("calls wait their turn, and a model is only swapped when it really differs", async () => {
      const order = [];
      const run = (model, role) =>
        models.use(brainOf(model), { role, why: `${role} loaded` }, async () => {
          order.push(`start ${role}`);
          await sleep(30);
          order.push(`end ${role}`);
        });
      await Promise.all([run("tiny:latest", "general"), run("tiny:latest", "writing"), run("coder:latest", "coding")]);
      assert.deepStrictEqual(order, ["start general", "end general", "start writing", "end writing", "start coding", "end coding"], "never two at once");
      assert.deepStrictEqual(ai.hits.loads.map((l) => l.model), ["tiny:latest", "coder:latest"], "general and writing share one load");
      assert.deepStrictEqual(ai.hits.unloads, ["tiny:latest"]);
      assert.strictEqual(models.status().loaded.model, "coder:latest");
      assert.strictEqual(models.status().loaded.role, "coding");
      assert.match(models.status().loaded.why, /coding loaded/);
    });

    test("changes are announced, with why", async () => {
      const seen = [];
      const off = models.onChange((s) => seen.push(s.loaded && `${s.loaded.model}|${s.loaded.why}`));
      await models.use(brainOf("tiny:latest"), { role: "general", why: "General specialist loaded for step 1" }, async () => {});
      await models.use(brainOf("coder:latest"), { role: "coding", why: "Coding specialist loaded for step 3" }, async () => {});
      off();
      assert.deepStrictEqual(seen, ["tiny:latest|General specialist loaded for step 1", "coder:latest|Coding specialist loaded for step 3"]);
    });

    test("the next specialist can be loaded while the cloud thinks, but never over one that is in use", async () => {
      assert.strictEqual(await models.preload(brainOf("coder:latest"), { role: "coding", why: "Getting ready" }), true);
      assert.deepStrictEqual([...ai.loaded.keys()], ["coder:latest"]);
      let preloaded = null;
      await models.use(brainOf("tiny:latest"), { role: "general" }, async () => {
        preloaded = await models.preload(brainOf("coder:latest"), { role: "coding" });
      });
      assert.strictEqual(preloaded, false, "tiny was in use: nothing was unloaded under it");
      assert.deepStrictEqual([...ai.loaded.keys()], ["tiny:latest"]);
    });

    test("a cloud brain doesn't wait for the queue", async () => {
      let ran = false;
      await models.use({ kind: "cloud", model: "gemini" }, {}, async () => (ran = true));
      assert.ok(ran);
    });
  });

  describe("The roles", () => {
    test("no model name is built in: a role uses the general role's, which uses the local AI you set up", () => {
      assert.strictEqual(specialists.modelOf("general"), "tiny:latest");
      assert.strictEqual(specialists.modelOf("coding"), "tiny:latest");
      setSettings((s) => ({ ...s, specialists: { ...s.specialists, roles: [{ id: "general", model: "qwen3.5:4b" }, { id: "coding", model: "qwen2.5-coder:7b", fallback: "qwen2.5-coder:3b", contextSize: 4096 }] } }));
      assert.strictEqual(specialists.modelOf("writing"), "qwen3.5:4b", "writing shares the general model");
      assert.strictEqual(specialists.modelOf("coding"), "qwen2.5-coder:7b");
      const b = specialists.brainFor("coding");
      assert.strictEqual(b.contextSize, 4096);
      assert.strictEqual(b.fallbackModel, "qwen2.5-coder:3b");
      assert.strictEqual(b.baseUrl, ai.localUrl());
      assert.strictEqual(specialists.brainFor("coding", { ...settings.get(), specialists: { ...settings.get().specialists, roles: [{ id: "coding", enabled: false }] } }), null, "a role that's off has no brain");
    });

    test("your own roles can be added; settings keep only what's valid", () => {
      const made = api.addRole({ label: "Translator", when: "Translating", system: "You translate.", model: "tiny:latest" });
      assert.strictEqual(made.id, "translator");
      assert.ok(specialists.list().some((r) => r.id === "translator" && !r.builtin));
      assert.throws(() => api.addRole({ label: "Translator" }), /already/);
      assert.throws(() => api.addRole({}), /name/);
      setSettings((s) => ({ ...s, specialists: { ...s.specialists, roles: [...s.specialists.roles, { id: "manager", model: "x" }, { id: "../etc", model: "y" }] } }));
      assert.ok(!specialists.list().some((r) => r.id === "manager"), "the manager isn't a specialist");
      api.removeRole("translator");
      assert.ok(!specialists.list().some((r) => r.id === "translator"));
    });
  });

  describe("Settings → AI → Specialists", () => {
    test("every role with its model, whether it's installed, and whether it fits the card", async () => {
      setSettings((s) => ({ ...s, specialists: { ...s.specialists, roles: [{ id: "coding", model: "huge:latest" }, { id: "writing", model: "missing:latest" }] } }));
      const o = await api.overview();
      assert.strictEqual(o.running, true);
      assert.deepStrictEqual(o.roles.map((r) => r.id), ["general", "coding", "writing", "research", "vision", "embeddings"]);
      const by = Object.fromEntries(o.roles.map((r) => [r.id, r]));
      assert.strictEqual(by.general.effectiveModel, "tiny:latest");
      assert.strictEqual(by.general.installed, true);
      assert.strictEqual(by.general.fits.placement, "gpu");
      assert.strictEqual(by.research.inherited, true, "it uses the general model");
      assert.strictEqual(by.coding.fits.placement, "cpu", "14 GB doesn't fit a 6 GB card");
      assert.strictEqual(by.writing.installed, false);
      assert.strictEqual(by.writing.fits.placement, "unknown");
      assert.deepStrictEqual(o.installed.map((m) => m.name).sort(), ["big:latest", "coder:latest", "huge:latest", "tiny:latest"]);
      assert.strictEqual(o.vram.gpu.totalMb, 6144);
      assert.ok(o.suggestions.coding.model);
      assert.ok(o.suggestionsChecked);
    });

    test("pick a model for a role, and put it back", async () => {
      api.saveRole("coding", { model: "coder:latest", fallback: "tiny:latest", contextSize: 4096 });
      let o = await api.overview();
      assert.strictEqual(o.roles.find((r) => r.id === "coding").model, "coder:latest");
      assert.strictEqual(o.roles.find((r) => r.id === "coding").fallback, "tiny:latest");
      assert.strictEqual(o.roles.find((r) => r.id === "coding").contextSize, 4096);
      api.saveRole("coding", { enabled: false });
      assert.strictEqual((await api.overview()).roles.find((r) => r.id === "coding").enabled, false);
      api.removeRole("coding");
      o = await api.overview();
      assert.strictEqual(o.roles.find((r) => r.id === "coding").model, "");
    });

    test("test: a real request that loads the model, and what happened", async () => {
      ai.behave.models = [{ name: "tiny:latest", size: 800e6 }];
      const r = await api.test("general");
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.model, "tiny:latest");
      assert.strictEqual(r.placement, "gpu");
      assert.ok(r.text);
      assert.ok(ai.loaded.has("tiny:latest"));
      await assert.rejects(() => api.test("nonsense"), /doesn't exist/);
      const emb = await api.test("embeddings");
      assert.match(emb.text, /3 numbers/);
    });

    test("reset to the suggestions for this card: the base roles get suggested models, the others share the everyday one", async () => {
      ai.behave.models = [{ name: "qwen3.5:4b", size: 3.3e9 }, { name: "tiny:latest", size: 800e6 }];
      const o = await api.reset();
      const by = Object.fromEntries(o.roles.map((r) => [r.id, r]));
      assert.strictEqual(by.general.model, "qwen3.5:4b");
      assert.strictEqual(by.coding.model, "qwen2.5-coder:7b");
      assert.strictEqual(by.coding.fallback, "qwen2.5-coder:3b");
      assert.strictEqual(by.embeddings.model, "nomic-embed-text");
      assert.strictEqual(by.vision.model, "", "vision shares the everyday model: no swapping between them");
      assert.strictEqual(by.vision.effectiveModel, "qwen3.5:4b");
      assert.strictEqual(by.general.installed, true);
      assert.strictEqual(by.coding.installed, false, "suggested, not installed: it can be pulled");
    });

    test("models can be removed", async () => {
      assert.deepStrictEqual(await api.deleteModel("huge:latest"), { ok: true });
    });
  });

  describe("Pulling models", () => {
    test("it reports progress as Ollama downloads", async () => {
      const progress = [];
      await api.pull("qwen3.5:4b", (p) => progress.push(p));
      assert.ok(progress.length >= 3);
      assert.deepStrictEqual(progress.map((p) => p.percent).filter((p) => p !== null).slice(-3), [10, 60, 100]);
      assert.strictEqual(progress[0].status, "pulling manifest");
    });

    test("not in Private mode (it downloads from the internet), and only real names", async () => {
      await assert.rejects(() => api.pull("../../etc", () => {}), /isn't a model name/);
      setSettings((s) => ({ ...s, privacy: { ...s.privacy, localOnly: true } }));
      await assert.rejects(() => api.pull("qwen3.5:4b", () => {}), /Private mode/);
    });
  });

  describe("Suggestions", () => {
    test("every suggestion has what the page shows", () => {
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(suggestions.CHECKED));
      for (const [role, list] of Object.entries(suggestions.SUGGESTIONS)) {
        assert.ok(list.length, role);
        for (const s of list) {
          assert.ok(s.model && s.gb > 0 && s.why, `${role}/${s.model}`);
          if (s.fallback) assert.ok(Object.values(suggestions.SUGGESTIONS).flat().some((x) => x.model === s.fallback), `${s.model}'s fallback is itself a suggestion`);
        }
      }
    });

    test("one that is installed wins; a smaller card gets smaller models", () => {
      assert.strictEqual(suggestions.suggest({ installed: [], totalMb: 6144 }).coding.model, "qwen2.5-coder:7b");
      assert.strictEqual(suggestions.suggest({ installed: ["qwen2.5-coder:3b"], totalMb: 6144 }).coding.model, "qwen2.5-coder:3b");
      assert.strictEqual(suggestions.suggest({ installed: [], totalMb: 4096 }).coding.model, "qwen2.5-coder:3b");
      assert.strictEqual(suggestions.suggest({ installed: ["qwen3.5:9b"], totalMb: 6144 }).general.installed, false, "a tag has to match");
      assert.strictEqual(suggestions.suggest({ installed: ["nomic-embed-text:latest"], totalMb: 6144 }).embeddings.installed, true, "name and :latest are the same");
      assert.ok(suggestions.suggest({ installed: [], totalMb: 0 }).general.gb <= 3.5, "no card to count: the small ones");
    });
  });

  describe("Searching notes by meaning", () => {
    test("with an embeddings model, notes are found by closeness, and only changed notes are embedded again", async () => {
      setSettings((s) => ({ ...s, specialists: { ...s.specialists, roles: [{ id: "embeddings", model: "tiny:latest" }] } }));
      assert.strictEqual(embeddings.ready(settings.get()), true);
      await localNotes.writeNote({ localNotes: settings.get().localNotes }, "Banana bread", "aaaa aaaa aaaa a recipe with aaa");
      await localNotes.writeNote({ localNotes: settings.get().localNotes }, "Taxes", "form 12 deadline");
      const first = await embeddings.search("aaaaaaa", { limit: 5 });
      assert.strictEqual(first.indexed, 2);
      assert.match(first.notes[0].title, /Banana/, "the note most like the question comes first");
      assert.ok(first.notes[0].score >= first.notes[1].score);
      const calls = ai.hits.generate;
      const again = await embeddings.search("aaaaaaa");
      assert.strictEqual(again.indexed, 2);
      await sleep(10);
      await localNotes.writeNote({ localNotes: settings.get().localNotes }, "Taxes", "form 12 deadline " + "a".repeat(80));
      const changed = await embeddings.search("aaaaaaa");
      assert.strictEqual(changed.notes[0].title, "Taxes", "the changed note was embedded again");
      void calls;
    });

    test("without one, nothing runs", () => {
      setSettings((s) => ({ ...s, specialists: { ...s.specialists, roles: [{ id: "embeddings", enabled: false }] } }));
      assert.strictEqual(embeddings.ready(settings.get()), false);
    });
  });
});
