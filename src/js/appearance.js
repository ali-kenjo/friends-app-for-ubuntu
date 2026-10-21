// ---------- Theme packs, appearance, motion, sounds and chat font ----------
import { getSettings, onSettings, updateSettings, flushSettings } from "./store.js";
import { setLanguage, getLanguage } from "./i18n.js";
import { THEME_PACKS, ACCENTS, resolveThemeTokens } from "./theme-packs.mjs";
import { syncAmbientParticles } from "./celebrate.js";
import { playCelebrationSound } from "./sounds.js";

const root = document.documentElement;
const appearance = document.getElementById("appearance");
const accentColors = document.getElementById("accent-colors");
const packGrid = document.getElementById("theme-packs");
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const languageSelect = document.getElementById("language-select");

const FONTS = {
  default: "inherit",
  sans: 'var(--font-ui)',
  serif: 'var(--font-serif)',
  mono: 'var(--font-mono)',
};

let current = "dark";

// Text on the accent: dark ink on a light accent, light ink on a dark one
function onAccentFallback(hex) {
  const clean = String(hex || "#f5a94a").replace(/^#/, "");
  if (clean.length !== 6) return "#241604";
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(clean.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.24 ? "#241604" : "#fffcf7";
}

function detectHardwareTier(s) {
  const rq = s?.robot?.quality || "auto";
  if (rq === "low" || rq === "medium" || rq === "high") return rq;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (cores <= 2 || mem <= 2) return "low";
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return "low";
  } catch {
    return "low";
  }
  return "medium";
}

function resolvedMode(appMode = current) {
  const light = appMode === "light" || (appMode === "system" && !systemDark.matches);
  return light ? "light" : "dark";
}

function applyAll(s = getSettings()) {
  if (!s) return;
  root.dataset.private = s.privacy?.localOnly === true ? "true" : "false";
  current = s.theme?.appearance || "dark";
  const mode = resolvedMode(current);
  const quality = detectHardwareTier(s);
  const animLevel = reduceMotion.matches ? "off" : s.theme?.animation || "lively";
  const charTintOn = s.theme?.characterTint !== false && Boolean(s.characters?.switchLook);
  const activeCharId = s.characters?.active || "";

  const tokens = resolveThemeTokens({
    pack: s.theme?.pack || "cozy",
    mode,
    accent: s.theme?.accent || "#f5a94a",
    warmth: s.theme?.warmth ?? 6,
    roundness: s.theme?.roundness || "soft",
    timeTint: Boolean(s.theme?.timeTint),
    timeHour: new Date().getHours(),
    characterTint: charTintOn,
    characterId: activeCharId,
  });

  root.dataset.theme = mode;
  root.dataset.pack = tokens.pack;
  root.dataset.roundness = s.theme?.roundness || "soft";
  root.dataset.chatStyle = s.chat?.style || "minimal";
  root.dataset.chatDensity = s.chat?.density || "comfortable";
  root.dataset.sidebarStyle = s.theme?.sidebarStyle || "classic";
  root.dataset.background = s.theme?.background || "gradient";
  root.dataset.animation = animLevel;
  root.dataset.quality = quality;
  root.dataset.grain = s.theme?.grain && quality !== "low" ? "on" : "off";

  root.style.setProperty("--bg-main", tokens.bgMain);
  root.style.setProperty("--bg-sidebar", tokens.bgSidebar);
  root.style.setProperty("--bg-input", tokens.bgInput);
  root.style.setProperty("--bg-subtle", tokens.bgSubtle);
  root.style.setProperty("--bg-hover", tokens.bgHover);
  root.style.setProperty("--bg-active", tokens.bgActive);
  root.style.setProperty("--text", tokens.text);
  root.style.setProperty("--text-muted", tokens.textMuted);
  root.style.setProperty("--border", tokens.border);
  root.style.setProperty("--hairline", tokens.hairline);

  const knownAccent = ACCENTS[s.theme?.accent];
  const accentHex = knownAccent ? tokens.accent : s.theme?.accent || "#f5a94a";
  const onAcc = knownAccent ? tokens.onAccent : onAccentFallback(accentHex);

  root.style.setProperty("--accent", accentHex);
  root.style.setProperty("--accent-hover", tokens.accentHover);
  root.style.setProperty("--accent-text", tokens.accentText);
  root.style.setProperty("--link", tokens.link);
  root.style.setProperty("--focus", tokens.focus);
  root.style.setProperty("--on-accent", onAcc);
  root.style.setProperty("--accent-subtle", tokens.accentSubtle);
  root.style.setProperty("--glow", tokens.glow);
  root.style.setProperty("--danger", tokens.danger);
  root.style.setProperty("--danger-border", tokens.dangerBorder);
  root.style.setProperty("--danger-bg", tokens.dangerBg);
  root.style.setProperty("--success", tokens.success);
  root.style.setProperty("--warning", tokens.warning);
  root.style.setProperty("--hero-glow-a", tokens.heroGlowA);
  root.style.setProperty("--hero-glow-b", tokens.heroGlowB);

  root.style.setProperty("--chat-font", FONTS[s.font?.family] || FONTS.default);
  root.style.setProperty("--chat-size", `${s.font?.size || 16}px`);

  appearance?.querySelectorAll(".choice").forEach((c) => {
    const on = c.dataset.appearance === current;
    c.classList.toggle("selected", on);
    c.setAttribute("aria-checked", String(on));
  });

  accentColors?.querySelectorAll(".color").forEach((c) => {
    const on = c.dataset.color?.toLowerCase() === (s.theme?.accent || "").toLowerCase();
    c.classList.toggle("selected", on);
    c.setAttribute("aria-checked", String(on));
  });

  packGrid?.querySelectorAll(".pack-choice").forEach((c) => {
    const id = c.dataset.pack;
    const on = id === (s.theme?.pack || "cozy");
    c.classList.toggle("selected", on);
    c.setAttribute("aria-checked", String(on));
    const p = THEME_PACKS[id] || THEME_PACKS.cozy;
    const pal = p[mode];
    const dots = c.querySelectorAll(".pack-dot");
    if (dots[0]) dots[0].style.background = pal.bgMain;
    if (dots[1]) dots[1].style.background = pal.bgInput;
    if (dots[2]) dots[2].style.background = p.defaultAccent;
  });

  if (languageSelect) languageSelect.value = s.ui?.language || "auto";
  syncAmbientParticles(s);
}

onSettings(applyAll);

systemDark.addEventListener("change", () => applyAll(getSettings()));
reduceMotion.addEventListener("change", () => applyAll(getSettings()));

appearance?.addEventListener("click", (e) => {
  const choice = e.target.closest("[data-appearance]");
  if (choice) updateSettings((s) => (s.theme.appearance = choice.dataset.appearance));
});

accentColors?.addEventListener("click", (e) => {
  const color = e.target.closest("[data-color]");
  if (color) updateSettings((s) => (s.theme.accent = color.dataset.color));
});

packGrid?.addEventListener("click", (e) => {
  const card = e.target.closest("[data-pack]");
  if (!card) return;
  const packId = card.dataset.pack;
  updateSettings((s) => {
    s.theme.pack = packId;
  });
});

document.getElementById("sound-test-btn")?.addEventListener("click", () => {
  playCelebrationSound({ force: true });
});

if (languageSelect) {
  languageSelect.value = getLanguage().setting;
  languageSelect.addEventListener("change", async () => {
    const choice = languageSelect.value;
    updateSettings((s) => ((s.ui ||= {}).language = choice));
    await flushSettings();
    setLanguage(choice);
  });
}
