// Models worth suggesting for the memory this computer can give a local model (Settings → AI → Specialists, "Pick models
// for my computer"; hardware.js works out that budget from the graphics card, or the shared memory of a Mac, or the RAM).
// This is a list of suggestions, not something the app depends on: no role is tied to a model name, you pick from
// what's installed, and anything can be pulled. The list was checked against the Ollama library on CHECKED; it's the
// only place model names are written down, and a test makes sure each entry has what the page needs.
// Each list goes from the best a big computer can run to the smallest: the first one that fits the budget is the pick.
// gb: the download size of that tag, which is about the memory its weights take.
const CHECKED = "2026-10-23";

// Hardware tier descriptions and recommended baseline budgets
const TIERS = [
  { id: "cpu", label: "CPU only", minVramGb: 0, maxVramGb: 0, budgetMb: 2500, note: "Runs on system processor: small models only" },
  { id: "vram_4gb", label: "~4 GB video memory", minVramGb: 3, maxVramGb: 5, budgetMb: 3600, note: "Compact models, short context" },
  { id: "vram_6gb", label: "~6 GB video memory", minVramGb: 5, maxVramGb: 7, budgetMb: 5200, note: "Balanced small models" },
  { id: "vram_8gb", label: "~8 GB video memory", minVramGb: 7, maxVramGb: 10, budgetMb: 7200, note: "Mid-size 7B-9B models fit well" },
  { id: "vram_12gb", label: "~12 GB video memory", minVramGb: 10, maxVramGb: 14, budgetMb: 11000, note: "Full 9B models and 14B coders" },
  { id: "vram_16gb", label: "~16 GB video memory", minVramGb: 14, maxVramGb: 20, budgetMb: 15000, note: "Large 14B-27B models" },
  { id: "vram_24gb", label: "~24 GB video memory", minVramGb: 20, maxVramGb: 36, budgetMb: 23000, note: "Heavy 30B-35B specialists" },
  { id: "vram_48gb", label: "~48 GB+ video memory", minVramGb: 36, maxVramGb: 128, budgetMb: 46000, note: "Very large models (70B-120B)" },
  { id: "apple_unified", label: "Apple unified memory", unified: true, budgetMb: null, note: "Dynamic memory sharing with macOS" },
  { id: "multi_gpu", label: "Multi-GPU", multiGpu: true, budgetMb: null, note: "Combined VRAM across multiple graphics cards" },
];

// One multimodal model does everyday jobs, writing, summaries, translation, extraction, planning, and vision
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
  planner: EVERYDAY,
  checker: EVERYDAY,
  summarizer: EVERYDAY,
  translator: EVERYDAY,
  extraction: EVERYDAY,
  reasoning: [
    { model: "qwen3.5:35b", gb: 22, why: "Deep mathematical reasoning and long-context logic" },
    { model: "qwen3.5:27b", gb: 17, why: "Complex reasoning and algorithmic derivations" },
    { model: "qwen3.5:9b", gb: 6.6, why: "Strong logic and mathematical proofs" },
    { model: "qwen3.5:4b", gb: 3.3, why: "Fast and lightweight math solver" },
    { model: "qwen3.5:2b", gb: 2.7, why: "Basic calculations and logic" },
  ],
  tool_caller: EVERYDAY,
  social: EVERYDAY,
  email: EVERYDAY,
  organizer: EVERYDAY,
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

// Determines which hardware tier best fits this device configuration
function tierForHardware(hw) {
  if (!hw) return TIERS[0];
  if (hw.gpus?.length > 1 && hw.gpus.every((g) => g.usable && !g.shared)) return TIERS.find((t) => t.id === "multi_gpu");
  const card = hw.gpus?.find((g) => g.usable && !g.shared) || hw.gpus?.find((g) => g.unified);
  if (!card) return TIERS.find((t) => t.id === "cpu");
  if (card.unified) return TIERS.find((t) => t.id === "apple_unified");
  const gbVal = (card.vramMb || 0) / 1024;
  for (const t of TIERS) {
    if (t.minVramGb !== undefined && gbVal >= t.minVramGb && gbVal < t.maxVramGb) return t;
  }
  return gbVal >= 36 ? TIERS.find((t) => t.id === "vram_48gb") : TIERS[0];
}

// The suggestion for each role: one that's installed already when there is one that fits, else the best that fits.
// budgetMb: what a local model may use (hardware.js fit.budgetMb). totalMb: a graphics card's memory, for callers that
// only know that (the budget is that minus a margin). With neither, the smallest are preferred.
function suggest({ installed = [], totalMb = 0, budgetMb = null, hw = null } = {}) {
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

module.exports = { CHECKED, TIERS, SUGGESTIONS, suggest, matches, tierForHardware };
