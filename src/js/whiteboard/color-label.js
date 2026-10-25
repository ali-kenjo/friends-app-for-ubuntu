// The words for a color, for people who can't see it: "red", "pale blue" (translated), not "#dc2626"
import { t } from "../i18n.js";
import { colorName } from "./describe.mjs";

export function colorLabel(hex) {
  const name = colorName(hex);
  return name ? t(name) : String(hex || "");
}
