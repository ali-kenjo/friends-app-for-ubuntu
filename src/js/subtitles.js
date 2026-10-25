// ---------- Subtitles & Captions System Controller ----------
// Manages captions styling, speaker visibility, dock bubble overlay,
// and the live interactive preview in Settings.
import { getSettings, onSettings, updateSettings } from "./store.js";
import { t } from "./i18n.js";
import { characterName } from "./characters.js";

const root = document.documentElement;
let activeDockTimer = null;

// Map font IDs to actual CSS font family stacks
export const SUBTITLE_FONTS = {
  default: "inherit",
  bricolage: "var(--font-heading, 'Bricolage Grotesque', sans-serif)",
  figtree: "var(--font-ui, 'Figtree', sans-serif)",
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  serif: "Georgia, Cambria, 'Times New Roman', serif",
  mono: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace",
  dyslexic: "'OpenDyslexic', 'Comic Sans MS', sans-serif",
};

// Apply subtitle settings to root CSS custom properties and attributes
export function applySubtitleStyles(s = getSettings()) {
  const sub = s?.subtitles || {};
  const enabled = sub.enabled !== false;

  root.style.setProperty("--sub-font", SUBTITLE_FONTS[sub.fontFamily] || SUBTITLE_FONTS.default);
  root.style.setProperty("--sub-size", `${Number(sub.fontSize) || 20}px`);
  root.style.setProperty("--sub-weight", String(sub.fontWeight || "600"));
  root.style.setProperty("--sub-line-height", String(sub.lineHeight || "1.4"));
  root.style.setProperty("--sub-color-robot", sub.textColorRobot || "#ffffff");
  root.style.setProperty("--sub-color-user", sub.textColorUser || "#ffecd6");
  root.style.setProperty("--sub-bg-opacity", `${(Number(sub.bgOpacity) ?? 65) / 100}`);

  root.dataset.subtitlesEnabled = String(enabled);
  root.dataset.subtitlesPlacement = sub.placement || "bottom_center";
  root.dataset.subtitlesAlign = sub.alignment || "center";
  root.dataset.subtitlesBg = sub.bgStyle || "dark_pill";
  root.dataset.subtitlesOutline = sub.textOutline || "subtle";
  root.dataset.subtitlesAnim = sub.wordAnimation || "fade";

  updateDockCaptionVisibility(sub);
  updateSettingsPreview(sub);
}

// Controls floating subtitles directly over the robot dock
function updateDockCaptionVisibility(sub) {
  const dockCaption = document.getElementById("robot-dock-caption");
  if (!dockCaption) return;
  const show = sub.enabled !== false && sub.showInDock !== false;
  dockCaption.hidden = !show;
}

// Display live speech caption above robot dock when talking in text chat
export function showDockCaption(who, text, isUser = false) {
  const s = getSettings();
  const sub = s?.subtitles || {};
  if (sub.enabled === false || sub.showInDock === false) return;

  const vis = sub.speakerVisibility || "both";
  if (vis === "robot_only" && isUser) return;
  if (vis === "user_only" && !isUser) return;

  const dockCaption = document.getElementById("robot-dock-caption");
  if (!dockCaption) return;

  // What was said (by the AI, or heard from you) and the name are text, never markup
  const parts = [];
  if (sub.showSpeakerBadge !== false) {
    const tag = document.createElement("span");
    tag.className = `dock-caption-tag ${isUser ? "user" : "robot"}`;
    tag.textContent = isUser ? t("You") : who || characterName();
    parts.push(tag, " ");
  }
  const words = document.createElement("span");
  words.className = "dock-caption-text";
  words.textContent = text;
  parts.push(words);
  dockCaption.replaceChildren(...parts);
  dockCaption.hidden = false;
  dockCaption.classList.add("visible");

  if (activeDockTimer) clearTimeout(activeDockTimer);
  const dur = (Number(sub.durationSeconds) || 4) * 1000;
  activeDockTimer = setTimeout(() => {
    dockCaption.classList.remove("visible");
    setTimeout(() => {
      if (!dockCaption.classList.contains("visible")) dockCaption.hidden = true;
    }, 400);
  }, dur);
}

// Live interactive preview in Settings → Subtitles
function updateSettingsPreview(sub) {
  const preview = document.getElementById("subtitles-preview-box");
  if (!preview) return;

  const vis = sub.speakerVisibility || "both";
  const showBadge = sub.showSpeakerBadge !== false;
  const userVisible = vis === "both" || vis === "user_only";
  const robotVisible = vis === "both" || vis === "robot_only";

  let html = "";
  if (userVisible) {
    html += `
      <div class="preview-caption-line user">
        ${showBadge ? `<span class="caption-tag user">${t("You")}</span>` : ""}
        <span class="caption-text">${t("Can you explain how this works on the board?")}</span>
      </div>
    `;
  }
  if (robotVisible) {
    html += `
      <div class="preview-caption-line robot">
        ${showBadge ? `<span class="caption-tag companion"></span>` : ""}
        <span class="caption-text">${t("Absolutely! I can sketch out the complete architecture right now.")}</span>
      </div>
    `;
  }

  preview.innerHTML = html;
  const companionTag = preview.querySelector(".caption-tag.companion");
  if (companionTag) companionTag.textContent = characterName();
  preview.className = `subtitles-preview-box bg-${sub.bgStyle || "dark_pill"} outline-${sub.textOutline || "subtle"} align-${sub.alignment || "center"}`;
  preview.style.fontFamily = SUBTITLE_FONTS[sub.fontFamily] || SUBTITLE_FONTS.default;
  preview.style.fontSize = `${Number(sub.fontSize) || 20}px`;
  preview.style.fontWeight = sub.fontWeight || "600";
  preview.style.lineHeight = sub.lineHeight || "1.4";
  preview.style.setProperty("--sub-color-user", sub.textColorUser || "#ffecd6");
  preview.style.setProperty("--sub-color-robot", sub.textColorRobot || "#ffffff");
  preview.style.setProperty("--sub-bg-opacity", `${(Number(sub.bgOpacity) ?? 65) / 100}`);
}

// Bind interactive UI controls in Settings → Subtitles
export function initSubtitlesUI() {
  const pane = document.getElementById("pane-subtitles");
  if (!pane) return;

  // Master switch
  const masterToggle = document.getElementById("subtitles-enabled-toggle");
  masterToggle?.addEventListener("change", (e) => {
    updateSettings((s) => ((s.subtitles ||= {}).enabled = e.target.checked));
  });

  // Range sliders with dynamic number readout
  const sizeInput = document.getElementById("subtitles-size-input");
  const sizeVal = document.getElementById("subtitles-size-value");
  sizeInput?.addEventListener("input", (e) => {
    if (sizeVal) sizeVal.textContent = `${e.target.value}px`;
    updateSettings((s) => ((s.subtitles ||= {}).fontSize = Number(e.target.value)));
  });

  const opacityInput = document.getElementById("subtitles-opacity-input");
  const opacityVal = document.getElementById("subtitles-opacity-value");
  opacityInput?.addEventListener("input", (e) => {
    if (opacityVal) opacityVal.textContent = `${e.target.value}%`;
    updateSettings((s) => ((s.subtitles ||= {}).bgOpacity = Number(e.target.value)));
  });

  const durInput = document.getElementById("subtitles-duration-input");
  const durVal = document.getElementById("subtitles-duration-value");
  durInput?.addEventListener("input", (e) => {
    if (durVal) durVal.textContent = `${e.target.value}s`;
    updateSettings((s) => ((s.subtitles ||= {}).durationSeconds = Number(e.target.value)));
  });

  // Color pickers
  const colorRobot = document.getElementById("subtitles-color-robot");
  colorRobot?.addEventListener("input", (e) => {
    updateSettings((s) => ((s.subtitles ||= {}).textColorRobot = e.target.value));
  });

  const colorUser = document.getElementById("subtitles-color-user");
  colorUser?.addEventListener("input", (e) => {
    updateSettings((s) => ((s.subtitles ||= {}).textColorUser = e.target.value));
  });

  // Select dropdowns and generic toggles with data-sub-setting
  pane.querySelectorAll("[data-sub-setting]").forEach((el) => {
    const key = el.dataset.subSetting;
    el.addEventListener("change", () => {
      const val = el.type === "checkbox" ? el.checked : el.value;
      updateSettings((s) => {
        (s.subtitles ||= {})[key] = val;
      });
    });
  });

  // Preset size quick buttons
  pane.querySelectorAll("[data-sub-preset-size]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sz = Number(btn.dataset.subPresetSize);
      if (sizeInput) sizeInput.value = sz;
      if (sizeVal) sizeVal.textContent = `${sz}px`;
      updateSettings((s) => ((s.subtitles ||= {}).fontSize = sz));
    });
  });
}

// Subscribe to settings changes
onSettings(applySubtitleStyles);
