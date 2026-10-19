// Models worth suggesting for a graphics card with about 6 GB (Settings → AI → Specialists, "Suggest models for my card").
// This is a list of suggestions, not something the app depends on: no role is tied to a model name, you pick from
// what's installed, and anything can be pulled. The list was checked against the Ollama library on CHECKED; it's the
// only place model names are written down, and a test makes sure each entry has what the page needs.
// gb: the download size of that tag, which is about the memory its weights take.
const CHECKED = "2026-10-19";

const SUGGESTIONS = {
  // One small multimodal model does the everyday jobs and looks at pictures: so these roles share it and nothing is swapped between them
  general: [
    { model: "qwen3.5:4b", gb: 3.3, why: "Small, fast, uses tools, reads pictures, and has a very long memory" },
    { model: "gemma4:e2b-it-qat", gb: 4.3, why: "Google's small model: good writing, uses tools, reads pictures" },
    { model: "qwen3.5:2b", gb: 2.7, why: "Smaller and faster, for a card that is also busy with something else" },
  ],
  writing: [
    { model: "qwen3.5:4b", gb: 3.3, why: "Writes well for its size, and shares the everyday model" },
    { model: "gemma4:e2b-it-qat", gb: 4.3, why: "A pleasant, natural writing voice" },
  ],
  research: [
    { model: "qwen3.5:4b", gb: 3.3, why: "Reads long pages and keeps track of sources; shares the everyday model" },
    { model: "gemma4:e2b-it-qat", gb: 4.3, why: "Good at boiling things down" },
  ],
  vision: [
    { model: "qwen3.5:4b", gb: 3.3, why: "It reads pictures and screenshots, and it's the everyday model: no swap needed" },
    { model: "qwen3-vl:2b", gb: 1.9, why: "A small model made for looking at pictures" },
    { model: "gemma4:e2b-it-qat", gb: 4.3, why: "Reads pictures too" },
  ],
  coding: [
    { model: "qwen2.5-coder:7b", gb: 4.7, fallback: "qwen2.5-coder:3b", why: "The best coder that fits: it is tight on 6 GB, so give it a short context; the 3B steps in when it doesn't fit" },
    { model: "qwen2.5-coder:3b", gb: 1.9, why: "A lot smaller and quicker, a bit less clever" },
  ],
  embeddings: [
    { model: "nomic-embed-text", gb: 0.3, why: "Tiny, quick, and good at finding notes by meaning" },
    { model: "embeddinggemma", gb: 0.3, why: "Google's small embedding model, also good for code" },
    { model: "qwen3-embedding:0.6b", gb: 0.65, why: "A little larger, better in many languages" },
  ],
};

const matches = (installed, model) => installed.some((n) => n === model || n === `${model}:latest` || (!model.includes(":") && n.startsWith(`${model}:`)));

// The suggestion for each role: one that's installed already when there is one, else the first that fits.
// totalMb: the card's memory (0 when there is none: then the smallest are preferred).
function suggest({ installed = [], totalMb = 6144 } = {}) {
  const budget = totalMb ? totalMb * 0.8 : 3500;
  const out = {};
  for (const [role, list] of Object.entries(SUGGESTIONS)) {
    const fitting = list.filter((s) => s.gb * 1024 <= budget);
    const pool = fitting.length ? fitting : [list.at(-1)];
    const have = pool.find((s) => matches(installed, s.model));
    const pick = have || pool[0];
    out[role] = { ...pick, installed: Boolean(have), alternatives: list.filter((s) => s !== pick).map((s) => ({ model: s.model, gb: s.gb, installed: matches(installed, s.model) })) };
  }
  return out;
}

module.exports = { CHECKED, SUGGESTIONS, suggest, matches };
