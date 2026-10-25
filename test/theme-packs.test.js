const { test, describe } = require("node:test");
const assert = require("node:assert");

describe("Theme packs and WCAG AA contrast", () => {
  test("loads pure theme-packs.mjs module", async () => {
    const mod = await import("../src/js/theme-packs.mjs");
    assert.deepStrictEqual(mod.THEME_PACK_IDS, [
      "cozy",
      "sunrise",
      "forest",
      "lavender",
      "ocean",
      "classic",
      "midnight",
      "nordic",
      "matcha",
      "espresso",
      "cyberpunk",
      "sunset",
    ]);
    assert.ok(mod.CHAT_STYLE_IDS.length >= 5, "at least 5 chat styles (minimal, bubbles + 3 new ones)");
  });

  test("every theme pack, mode, accent, warmth extreme, time tint, and character tint meets WCAG AA contrast (>= 4.5:1)", async () => {
    const { THEME_PACK_IDS, ACCENTS, resolveThemeTokens, contrastRatio, blendOnHex } = await import("../src/js/theme-packs.mjs");
    const accentKeys = Object.keys(ACCENTS);
    const failures = [];

    for (const pack of THEME_PACK_IDS) {
      for (const mode of ["dark", "light"]) {
        for (const accent of accentKeys) {
          for (const warmth of [0, 6, 10]) {
            for (const characterId of ["", "atlas", "mira"]) {
              const tokens = resolveThemeTokens({
                pack,
                mode,
                accent,
                warmth,
                timeTint: true,
                timeHour: mode === "dark" ? 22 : 8,
                characterTint: Boolean(characterId),
                characterId,
              });

              const surfaces = [
                ["bgMain", tokens.bgMain],
                ["bgSidebar", tokens.bgSidebar],
                ["bgInput", tokens.bgInput],
                ["bgSubtle", tokens.bgSubtle],
                ["bgHover", tokens.bgHover],
              ];

              const textColors = [
                ["text", tokens.text],
                ["textMuted", tokens.textMuted],
                ["accentText", tokens.accentText],
                ["link", tokens.link],
                ["danger", tokens.danger],
                ["success", tokens.success],
                ["warning", tokens.warning],
              ];

              for (const [sName, sHex] of surfaces) {
                for (const [tName, tHex] of textColors) {
                  const ratio = contrastRatio(tHex, sHex);
                  if (ratio < 4.5) {
                    failures.push(`${pack}/${mode}/acc=${accent}/w=${warmth}/char=${characterId || "none"}: ${tName} (${tHex}) on ${sName} (${sHex}) = ${ratio.toFixed(2)}:1 (< 4.5)`);
                  }
                }
              }

              // Also check accentText on accentSubtle pill over bgInput
              const pillBg = blendOnHex(tokens.accentSubtle, tokens.bgInput);
              const pillRatio = contrastRatio(tokens.accentText, pillBg);
              if (pillRatio < 4.5) {
                failures.push(`${pack}/${mode}/acc=${accent}/w=${warmth}: accentText (${tokens.accentText}) on accentSubtle pill (${pillBg}) = ${pillRatio.toFixed(2)}:1 (< 4.5)`);
              }

              // Also check onAccent against solid accent button background
              const btnRatio = contrastRatio(tokens.onAccent, tokens.accent);
              if (btnRatio < 4.5) {
                failures.push(`${pack}/${mode}/acc=${accent}: onAccent (${tokens.onAccent}) on accent (${tokens.accent}) = ${btnRatio.toFixed(2)}:1 (< 4.5)`);
              }
            }
          }
        }
      }
    }

    assert.deepStrictEqual(failures, [], `Contrast failures:\n${failures.slice(0, 20).join("\n")}`);
  });
});
