// Pure theme pack definitions, color math, and WCAG contrast helpers.
// Shared between the browser (src/js/appearance.js) and Node tests (test/theme-packs.test.js).

export const THEME_PACK_IDS = ["cozy", "sunrise", "forest", "lavender", "ocean", "classic"];
export const APPEARANCE_MODES = ["dark", "light", "system"];
export const ROUNDNESS_IDS = ["sharp", "soft", "pill"];
export const DENSITY_IDS = ["comfortable", "cozy", "compact"];
export const ANIMATION_IDS = ["off", "subtle", "lively"];
export const BACKGROUND_IDS = ["plain", "gradient", "aurora", "pattern"];
export const CHAT_STYLE_IDS = ["minimal", "bubbles", "cards", "notebook", "postcards"];
export const SIDEBAR_STYLE_IDS = ["classic", "floating", "minimal"];

// User-selectable accent colors. Every accent works on top of every pack in dark and light modes
// and provides dark-mode and light-mode text/link variants that pass WCAG AA (>= 4.5:1) on all surfaces.
export const ACCENTS = {
  "#f5a94a": {
    id: "honey",
    label: "Honey",
    swatch: "#f5a94a",
    dark: { accent: "#f5a94a", hover: "#f8ba68", text: "#f7bc6c", link: "#ffc477", onAccent: "#241604", rgb: "245, 169, 74" },
    light: { accent: "#a65606", hover: "#8c4704", text: "#703800", link: "#703800", onAccent: "#fffcf7", rgb: "166, 86, 6" },
  },
  "#eb7a53": {
    id: "terracotta",
    label: "Terracotta",
    swatch: "#eb7a53",
    dark: { accent: "#eb7a53", hover: "#f29270", text: "#f7a488", link: "#f9b49c", onAccent: "#210e07", rgb: "235, 122, 83" },
    light: { accent: "#ad401f", hover: "#913316", text: "#75270f", link: "#75270f", onAccent: "#fff9f6", rgb: "173, 64, 31" },
  },
  "#fb7185": {
    id: "rose",
    label: "Dusty rose",
    swatch: "#fb7185",
    dark: { accent: "#fb7185", hover: "#fda4af", text: "#fda4af", link: "#fecdd3", onAccent: "#240a10", rgb: "251, 113, 133" },
    light: { accent: "#b02841", hover: "#941e34", text: "#781427", link: "#781427", onAccent: "#fff8f9", rgb: "176, 40, 65" },
  },
  "#34d399": {
    id: "sage",
    label: "Sage",
    swatch: "#34d399",
    dark: { accent: "#34d399", hover: "#6ee7b7", text: "#6ee7b7", link: "#a7f3d0", onAccent: "#062117", rgb: "52, 211, 153" },
    light: { accent: "#0d6b4a", hover: "#09573b", text: "#064730", link: "#064730", onAccent: "#f5fcf9", rgb: "13, 107, 74" },
  },
  "#a78bfa": {
    id: "lavender",
    label: "Lavender",
    swatch: "#a78bfa",
    dark: { accent: "#a78bfa", hover: "#c4b5fd", text: "#c4b5fd", link: "#ddd6fe", onAccent: "#140b29", rgb: "167, 139, 250" },
    light: { accent: "#5c38bf", hover: "#4b2ba3", text: "#3d208a", link: "#3d208a", onAccent: "#faf8ff", rgb: "92, 56, 191" },
  },
  "#38bdf8": {
    id: "sky",
    label: "Sea glass",
    swatch: "#38bdf8",
    dark: { accent: "#38bdf8", hover: "#7dd3fc", text: "#7dd3fc", link: "#bae6fd", onAccent: "#061924", rgb: "56, 189, 248" },
    light: { accent: "#086291", hover: "#064f75", text: "#043f5e", link: "#043f5e", onAccent: "#f5fbff", rgb: "8, 98, 145" },
  },
};

export const THEME_PACKS = {
  cozy: {
    id: "cozy",
    label: "Cozy",
    description: "Warm cocoa and oat at golden hour",
    defaultAccent: "#f5a94a",
    dark: {
      bgMain: "#181310",
      bgSidebar: "#120e0b",
      bgInput: "#221b16",
      bgSubtle: "#1d1713",
      bgHover: "#2b221c",
      text: "#f7efe4",
      textMuted: "#b8a796",
      border: "#3d3129",
      hairline: "rgba(255, 236, 214, 0.08)",
      danger: "#fca5a5",
      dangerBorder: "#6e2f34",
      dangerBg: "#2e191c",
      success: "#6ee7b7",
      warning: "#fcd34d",
      heroGlowA: "rgba(245, 169, 74, 0.16)",
      heroGlowB: "rgba(235, 122, 83, 0.11)",
    },
    light: {
      bgMain: "#f9f4ec",
      bgSidebar: "#f1e9dc",
      bgInput: "#fffdf9",
      bgSubtle: "#f4ede2",
      bgHover: "#eae0d1",
      text: "#241b15",
      textMuted: "#594a3e",
      border: "#d8cbb8",
      hairline: "rgba(44, 30, 18, 0.09)",
      danger: "#a81b1b",
      dangerBorder: "#efb7b5",
      dangerBg: "#fdecea",
      success: "#0d6343",
      warning: "#7c4303",
      heroGlowA: "rgba(245, 169, 74, 0.22)",
      heroGlowB: "rgba(235, 122, 83, 0.14)",
    },
  },
  sunrise: {
    id: "sunrise",
    label: "Sunrise",
    description: "Apricot light, terracotta and soft blush",
    defaultAccent: "#eb7a53",
    dark: {
      bgMain: "#1a1213",
      bgSidebar: "#140d0e",
      bgInput: "#251a1b",
      bgSubtle: "#1f1617",
      bgHover: "#2e2022",
      text: "#faeee9",
      textMuted: "#bda49d",
      border: "#422f31",
      hairline: "rgba(255, 226, 218, 0.08)",
      danger: "#fca5a5",
      dangerBorder: "#6e2f34",
      dangerBg: "#2e191c",
      success: "#6ee7b7",
      warning: "#fcd34d",
      heroGlowA: "rgba(235, 122, 83, 0.18)",
      heroGlowB: "rgba(251, 113, 133, 0.12)",
    },
    light: {
      bgMain: "#fcf4ef",
      bgSidebar: "#f5e8e0",
      bgInput: "#fffcfa",
      bgSubtle: "#f7ece5",
      bgHover: "#ede0d7",
      text: "#281917",
      textMuted: "#5e433e",
      border: "#decbc2",
      hairline: "rgba(56, 26, 20, 0.09)",
      danger: "#a81b1b",
      dangerBorder: "#efb7b5",
      dangerBg: "#fdecea",
      success: "#0d6343",
      warning: "#7c4303",
      heroGlowA: "rgba(235, 122, 83, 0.22)",
      heroGlowB: "rgba(251, 113, 133, 0.15)",
    },
  },
  forest: {
    id: "forest",
    label: "Forest",
    description: "Quiet moss, warm cedar and sunlit fern",
    defaultAccent: "#34d399",
    dark: {
      bgMain: "#121714",
      bgSidebar: "#0d120f",
      bgInput: "#1a221d",
      bgSubtle: "#161d18",
      bgHover: "#222c26",
      text: "#ebf3ec",
      textMuted: "#9fb3a4",
      border: "#2e3d33",
      hairline: "rgba(218, 242, 224, 0.08)",
      danger: "#fca5a5",
      dangerBorder: "#6e2f34",
      dangerBg: "#2b191c",
      success: "#6ee7b7",
      warning: "#fcd34d",
      heroGlowA: "rgba(52, 211, 153, 0.15)",
      heroGlowB: "rgba(245, 169, 74, 0.10)",
    },
    light: {
      bgMain: "#f4f7f2",
      bgSidebar: "#e9efe6",
      bgInput: "#fcfefb",
      bgSubtle: "#eef3ec",
      bgHover: "#e2e9df",
      text: "#162119",
      textMuted: "#435748",
      border: "#c8d4c5",
      hairline: "rgba(20, 42, 26, 0.09)",
      danger: "#a81b1b",
      dangerBorder: "#efb7b5",
      dangerBg: "#fdecea",
      success: "#0d6343",
      warning: "#7c4303",
      heroGlowA: "rgba(52, 211, 153, 0.20)",
      heroGlowB: "rgba(245, 169, 74, 0.14)",
    },
  },
  lavender: {
    id: "lavender",
    label: "Lavender night",
    description: "Velvet plum dusk, heather and starlight",
    defaultAccent: "#a78bfa",
    dark: {
      bgMain: "#15121c",
      bgSidebar: "#100e16",
      bgInput: "#211c2b",
      bgSubtle: "#1a1623",
      bgHover: "#292334",
      text: "#f2edf9",
      textMuted: "#afa4c2",
      border: "#373044",
      hairline: "rgba(232, 220, 255, 0.08)",
      danger: "#fca5a5",
      dangerBorder: "#6a2f36",
      dangerBg: "#2d1a20",
      success: "#6ee7b7",
      warning: "#fcd34d",
      heroGlowA: "rgba(167, 139, 250, 0.17)",
      heroGlowB: "rgba(251, 113, 133, 0.11)",
    },
    light: {
      bgMain: "#f7f4fb",
      bgSidebar: "#ede8f5",
      bgInput: "#fefcff",
      bgSubtle: "#f2eef9",
      bgHover: "#e6e0f0",
      text: "#1e1829",
      textMuted: "#4e4363",
      border: "#d3cbe0",
      hairline: "rgba(34, 22, 56, 0.09)",
      danger: "#a81b1b",
      dangerBorder: "#efb7b5",
      dangerBg: "#fdecea",
      success: "#0d6343",
      warning: "#7c4303",
      heroGlowA: "rgba(167, 139, 250, 0.20)",
      heroGlowB: "rgba(251, 113, 133, 0.13)",
    },
  },
  ocean: {
    id: "ocean",
    label: "Ocean",
    description: "Sea glass, coastal mist and warm driftwood",
    defaultAccent: "#38bdf8",
    dark: {
      bgMain: "#11171b",
      bgSidebar: "#0c1115",
      bgInput: "#182127",
      bgSubtle: "#141c21",
      bgHover: "#202b33",
      text: "#eaf3f7",
      textMuted: "#9eb3bf",
      border: "#2b3a44",
      hairline: "rgba(212, 238, 255, 0.08)",
      danger: "#fca5a5",
      dangerBorder: "#6a2f36",
      dangerBg: "#2b191d",
      success: "#6ee7b7",
      warning: "#fcd34d",
      heroGlowA: "rgba(56, 189, 248, 0.16)",
      heroGlowB: "rgba(52, 211, 153, 0.11)",
    },
    light: {
      bgMain: "#f3f7fa",
      bgSidebar: "#e7eff4",
      bgInput: "#fcfeff",
      bgSubtle: "#edf3f7",
      bgHover: "#e0e9ef",
      text: "#142028",
      textMuted: "#415563",
      border: "#c5d3dc",
      hairline: "rgba(18, 38, 52, 0.09)",
      danger: "#a81b1b",
      dangerBorder: "#efb7b5",
      dangerBg: "#fdecea",
      success: "#0d6343",
      warning: "#7c4303",
      heroGlowA: "rgba(56, 189, 248, 0.20)",
      heroGlowB: "rgba(52, 211, 153, 0.13)",
    },
  },
  classic: {
    id: "classic",
    label: "Classic",
    description: "Quiet warm stone and crisp paper",
    defaultAccent: "#f5a94a",
    dark: {
      bgMain: "#15121c",
      bgSidebar: "#100e16",
      bgInput: "#211c2b",
      bgSubtle: "#1a1623",
      bgHover: "#292334",
      text: "#efeaf5",
      textMuted: "#afa8be",
      border: "#373041",
      hairline: "rgba(255, 255, 255, 0.07)",
      danger: "#ff9494",
      dangerBorder: "#6a2f36",
      dangerBg: "#2d1a20",
      success: "#62d6a3",
      warning: "#ffd166",
      heroGlowA: "rgba(245, 169, 74, 0.14)",
      heroGlowB: "rgba(245, 169, 74, 0.07)",
    },
    light: {
      bgMain: "#fbf9f8",
      bgSidebar: "#f2eeed",
      bgInput: "#ffffff",
      bgSubtle: "#f6f2f1",
      bgHover: "#e9e3e3",
      text: "#231d2a",
      textMuted: "#564f61",
      border: "#d9d0d3",
      hairline: "rgba(35, 29, 42, 0.09)",
      danger: "#a81b1b",
      dangerBorder: "#efb7b5",
      dangerBg: "#fdecea",
      success: "#0d6343",
      warning: "#7c4303",
      heroGlowA: "rgba(245, 169, 74, 0.16)",
      heroGlowB: "rgba(245, 169, 74, 0.08)",
    },
  },
};

export const ROUNDNESS_PRESETS = {
  sharp: { xs: "3px", sm: "6px", md: "8px", lg: "10px", xl: "14px", xxl: "18px", pill: "999px" },
  soft: { xs: "6px", sm: "10px", md: "14px", lg: "18px", xl: "24px", xxl: "32px", pill: "999px" },
  pill: { xs: "8px", sm: "14px", md: "20px", lg: "26px", xl: "32px", xxl: "40px", pill: "999px" },
};

// ---------- Color math & WCAG 2.1 contrast ----------
export function hexToRgb(hex) {
  const clean = String(hex || "#000000").replace(/^#/, "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function mixHex(hexA, hexB, weightB = 0.5) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const w = Math.max(0, Math.min(1, weightB));
  return rgbToHex({
    r: a.r * (1 - w) + b.r * w,
    g: a.g * (1 - w) + b.g * w,
    b: a.b * (1 - w) + b.b * w,
  });
}

export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(hexA, hexB) {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

export function blendOnHex(fg, bgHex) {
  if (typeof fg === "string" && fg.startsWith("#")) return fg;
  const m = String(fg).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!m) return bgHex;
  const [, r, g, b, a = "1"] = m;
  const alpha = Math.max(0, Math.min(1, parseFloat(a)));
  const bg = hexToRgb(bgHex);
  return rgbToHex({
    r: bg.r * (1 - alpha) + Number(r) * alpha,
    g: bg.g * (1 - alpha) + Number(g) * alpha,
    b: bg.b * (1 - alpha) + Number(b) * alpha,
  });
}

export function resolveThemeTokens({
  pack = "cozy",
  mode = "dark",
  accent = "#f5a94a",
  warmth = 6,
  roundness = "soft",
  timeTint = false,
  timeHour = 14,
  characterTint = false,
  characterId = "",
} = {}) {
  const packDef = THEME_PACKS[pack] || THEME_PACKS.cozy;
  const resolvedMode = mode === "light" ? "light" : "dark";
  const base = packDef[resolvedMode];
  const accentEntry = ACCENTS[accent] || ACCENTS[packDef.defaultAccent] || ACCENTS["#f5a94a"];
  const acc = accentEntry[resolvedMode];

  const wDelta = (Math.max(0, Math.min(10, Number(warmth ?? 6))) - 5) / 5;
  const warmAnchor = resolvedMode === "dark" ? "#26180f" : "#f7e7d2";
  const coolAnchor = resolvedMode === "dark" ? "#13161b" : "#eef2f6";
  const tintAnchor = wDelta >= 0 ? warmAnchor : coolAnchor;
  const tintAmount = Math.abs(wDelta) * (resolvedMode === "dark" ? 0.06 : 0.05);

  let timeAnchor = null;
  let timeAmount = 0;
  if (timeTint) {
    const h = ((Number(timeHour) % 24) + 24) % 24;
    if (h >= 5 && h < 11) {
      timeAnchor = resolvedMode === "dark" ? "#241911" : "#fdf2e0";
      timeAmount = 0.035;
    } else if (h >= 17 && h < 21) {
      timeAnchor = resolvedMode === "dark" ? "#261613" : "#fcecdf";
      timeAmount = 0.04;
    } else if (h >= 21 || h < 5) {
      timeAnchor = resolvedMode === "dark" ? "#13101a" : "#f0ecf7";
      timeAmount = 0.035;
    }
  }

  let charAnchor = null;
  let charAmount = 0;
  if (characterTint && characterId) {
    const id = String(characterId).toLowerCase();
    if (id.includes("atlas")) {
      charAnchor = resolvedMode === "dark" ? "#131b1a" : "#eff5f2";
      charAmount = 0.035;
    } else if (id.includes("mira")) {
      charAnchor = resolvedMode === "dark" ? "#231713" : "#fcf1e8";
      charAmount = 0.035;
    }
  }

  const applyTints = (hex) => {
    let out = tintAmount > 0 ? mixHex(hex, tintAnchor, tintAmount) : hex;
    if (timeAnchor && timeAmount > 0) out = mixHex(out, timeAnchor, timeAmount);
    if (charAnchor && charAmount > 0) out = mixHex(out, charAnchor, charAmount);
    return out;
  };

  const bgMain = applyTints(base.bgMain);
  const bgSidebar = applyTints(base.bgSidebar);
  const bgInput = applyTints(base.bgInput);
  const bgSubtle = applyTints(base.bgSubtle);
  const bgHover = applyTints(base.bgHover);
  const bgActive = mixHex(bgMain, acc.accent, resolvedMode === "dark" ? 0.16 : 0.12);

  const radii = ROUNDNESS_PRESETS[roundness] || ROUNDNESS_PRESETS.soft;
  const subtleAlpha = resolvedMode === "dark" ? 0.14 : 0.11;
  const glowAlpha = resolvedMode === "dark" ? 0.22 : 0.18;

  return {
    pack: packDef.id,
    mode: resolvedMode,
    bgMain,
    bgSidebar,
    bgInput,
    bgSubtle,
    bgHover,
    bgActive,
    text: base.text,
    textMuted: base.textMuted,
    border: base.border,
    hairline: base.hairline,
    accent: acc.accent,
    accentHover: acc.hover,
    accentText: acc.text,
    link: acc.link,
    focus: acc.link,
    onAccent: acc.onAccent,
    accentRgb: acc.rgb,
    accentSubtle: `rgba(${acc.rgb}, ${subtleAlpha})`,
    glow: `rgba(${acc.rgb}, ${glowAlpha})`,
    danger: base.danger,
    dangerBorder: base.dangerBorder,
    dangerBg: base.dangerBg,
    success: base.success,
    warning: base.warning,
    heroGlowA: base.heroGlowA,
    heroGlowB: base.heroGlowB,
    radii,
  };
}
