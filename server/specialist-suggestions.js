// Models worth suggesting for the memory this computer can give a local model (Settings → AI → Specialists, "Pick models
// for my computer"; hardware.js works out that budget from the graphics card, or the shared memory of a Mac, or the RAM).
// This is a list of suggestions, not something the app depends on: no role is tied to a model name, you pick from
// what's installed, and anything can be pulled. The list was checked against the Ollama library on CHECKED; it's the
// only place model names are written down, and a test makes sure each entry has what the page needs.
// Each list goes from the best a big computer can run to the smallest: the first one that fits the budget is the pick.
// gb: the download size of that tag, which is about the memory its weights take.
const CHECKED = "2026-10-20";

// One multimodal model does the everyday jobs and looks at pictures: so those roles share it and nothing is swapped between them
const EVERYDAY = [
  { model: "gpt-oss:120b", gb: 65, why: "OpenAI's open model for very large memory: strong reasoning, uses tools (text only)" },
  { model: "qwen3.5:35b", gb: 22, why: "A big all-rounder: uses tools, reads pictures, long memory" },
  { model: "qwen3.5:27b", gb: 17, why: "Strong and still moderate: uses tools, reads pictures, long memory" },
  { model: "gemma4:26b", gb: 16, why: "Google's larger model: very good writing, uses tools, reads pictures" },
  { model: "qwen3.5:9b", gb: 6.6, why: "The sweet spot: clever, uses tools, reads pictures, long memory" },
  { model: "gemma4:e4b", gb: 6.6, why: "Google's mid-size model: natural writing, uses tools, reads pictures" },
  { model: "qwen3.5:4b", gb: 3.3, why: "Small, fast, uses tools, reads pictures, and has a very long memory" },
  { model: "gemma4:e2b-it-qat", gb: 4.3, why: "Google's small model: good writing, uses tools, reads pictures" },
  { model: "qwen3.5:2b", gb: 2.7, why: "Smaller and faster, for a computer that is also busy with something else" },
  { model: "qwen3.5:0.8b", gb: 1.3, why: "Tiny: for very little memory, simple jobs only" },
];

const SUGGESTIONS = {
  general: EVERYDAY,
  writing: EVERYDAY,
  research: EVERYDAY,
  vision: EVERYDAY,
  coding: [
    { model: "qwen3-coder:30b", gb: 19, fallback: "qwen2.5-coder:14b", why: "The best coder here: a large mixture-of-experts model that only uses a small part at a time, so it's quick; long memory" },
    { model: "qwen2.5-coder:14b", gb: 9.0, fallback: "qwen2.5-coder:7b", why: "A very capable coder that fits a 12 GB card" },
    { model: "qwen2.5-coder:7b", gb: 4.7, fallback: "qwen2.5-coder:3b", why: "The best coder that fits 6 to 8 GB: it is tight on 6 GB, so give it a short context; the 3B steps in when it doesn't fit" },
    { model: "qwen2.5-coder:3b", gb: 1.9, why: "A lot smaller and quicker, a bit less clever" },
    { model: "qwen2.5-coder:1.5b", gb: 1.0, why: "Very small: simple scripts and completions" },
  ],
  embeddings: [
    { model: "nomic-embed-text", gb: 0.3, why: "Tiny, quick, and good at finding notes by meaning" },
    { model: "embeddinggemma", gb: 0.3, why: "Google's small embedding model, also good for code" },
    { model: "qwen3-embedding:0.6b", gb: 0.65, why: "A little larger, better in many languages" },
    { model: "mxbai-embed-large", gb: 0.67, why: "A well-tested larger model for finding things by meaning" },
  ],
};

const matches = (installed, model) => installed.some((n) => n === model || n === `${model}:latest` || (!model.includes(":") && n.startsWith(`${model}:`)));

// The suggestion for each role: one that's installed already when there is one that fits, else the best that fits.
// budgetMb: what a local model may use (hardware.js fit.budgetMb). totalMb: a graphics card's memory, for callers that
// only know that (the budget is that minus a margin). With neither, the smallest are preferred.
function suggest({ installed = [], totalMb = 0, budgetMb = null } = {}) {
  const budget = (budgetMb ?? (totalMb ? Math.max(0, totalMb - 448) : 3500)) * 0.9;
  const out = {};
  for (const [role, list] of Object.entries(SUGGESTIONS)) {
    const fitting = list.filter((s) => s.gb * 1024 <= budget);
    const pool = fitting.length ? fitting : [list.at(-1)];
    const have = pool.find((s) => matches(installed, s.model));
    const pick = have || pool[0];
    out[role] = { ...pick, installed: Boolean(have), fits: fitting.length > 0, alternatives: list.filter((s) => s !== pick).map((s) => ({ model: s.model, gb: s.gb, installed: matches(installed, s.model), fits: s.gb * 1024 <= budget })) };
  }
  return out;
}

module.exports = { CHECKED, SUGGESTIONS, suggest, matches };
