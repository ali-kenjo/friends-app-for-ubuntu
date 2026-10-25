import { t } from "../i18n.js";
import { getSettings } from "../store.js";
import { showDockCaption } from "../subtitles.js";

const voiceCaption = document.getElementById("voice-caption");

let line = { user: false, text: "", at: 0 }; // what the canvas draws
let shown = { who: "", text: "" }; // what the page shows

// Words fade in as they arrive; a line that only grows (streaming) adds just the new words
function appendWords(el, text, stagger, anim = "fade") {
  if (anim === "none") {
    el.textContent = (el.textContent || "") + text;
    return;
  }
  const parts = text.match(/\S+\s*|\s+/g) || [];
  parts.forEach((part, i) => {
    const span = document.createElement("span");
    span.className = "w";
    if (anim === "pop") span.classList.add("pop");
    span.textContent = part;
    if (stagger) span.style.animationDelay = `${Math.min(i * 22, 380)}ms`;
    el.append(span);
  });
}

export const captions = {
  // On the page only
  set(who, text) {
    if (!text || !voiceCaption) {
      if (voiceCaption) voiceCaption.innerHTML = "";
      shown = { who: "", text: "" };
      return;
    }

    const s = getSettings();
    const sub = s?.subtitles || {};
    if (sub.enabled === false || sub.showInVoice === false) {
      voiceCaption.innerHTML = "";
      shown = { who: "", text: "" };
      return;
    }

    const isUser = who === "You";
    const vis = sub.speakerVisibility || "both";
    if (vis === "robot_only" && isUser) {
      voiceCaption.innerHTML = "";
      shown = { who: "", text: "" };
      return;
    }
    if (vis === "user_only" && !isUser) {
      voiceCaption.innerHTML = "";
      shown = { who: "", text: "" };
      return;
    }

    const showBadge = sub.showSpeakerBadge !== false;
    const body = voiceCaption.querySelector(".caption-text");

    if (body && shown.who === who && text.startsWith(shown.text)) {
      appendWords(body, text.slice(shown.text.length), false, sub.wordAnimation);
    } else {
      voiceCaption.innerHTML = `
        ${showBadge ? `<span class="caption-tag ${isUser ? "user" : "companion"}"></span>` : ""}
        <span class="caption-text"></span>
      `;
      if (showBadge) {
        const tag = voiceCaption.querySelector(".caption-tag");
        if (tag) tag.textContent = isUser ? t("You") : who;
      }
      appendWords(voiceCaption.querySelector(".caption-text"), text, true, sub.wordAnimation);
    }
    shown = { who, text };
  },

  // On the page and in the video
  show(who, text, isUser) {
    captions.set(who, text);
    line = { user: isUser, text, at: performance.now() };
    showDockCaption(who, text, isUser);
  },

  clear() {
    captions.set("", "");
  },

  // Voice mode opened: nothing said yet
  reset() {
    captions.clear();
    line = { user: false, text: "", at: 0 };
  },

  // The last two lines of what's being said, drawn into the picture
  draw(ctx, w, h) {
    const s = getSettings();
    const sub = s?.subtitles || {};
    if (sub.enabled === false || sub.showInRecordings === false) return;

    const { text, user, at } = line;
    if (!text) return;

    const vis = sub.speakerVisibility || "both";
    if (vis === "robot_only" && user) return;
    if (vis === "user_only" && !user) return;

    const dur = (Number(sub.durationSeconds) || 4) * 1000;
    const age = performance.now() - at;
    const fade = age < dur ? 1 : Math.max(0, 1 - (age - dur) / 600);
    if (!fade) return;

    const portrait = h > w;
    const baseSize = Number(sub.fontSize) || 20;
    const size = Math.round(Math.min(w, h) * (portrait ? 0.05 : 0.042) * (baseSize / 20));
    const fontFam = sub.fontFamily === "mono" ? "monospace" : sub.fontFamily === "serif" ? "serif" : 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.font = `${sub.fontWeight || "600"} ${size}px ${fontFam}`;
    ctx.textAlign = sub.alignment || "center";
    ctx.textBaseline = "middle";
    const maxWidth = w * (portrait ? 0.86 : 0.72);

    const lines = [];
    let current = "";
    for (const word of text.split(/\s+/)) {
      const next = current ? `${current} ${word}` : word;
      if (current && ctx.measureText(next).width > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    const maxL = Number(sub.maxLines) || 2;
    const last = maxL > 0 ? lines.slice(-maxL) : lines;

    const lineHeight = size * (Number(sub.lineHeight) || 1.35);
    const place = sub.placement || "bottom_center";
    let y = place.startsWith("top")
      ? h * 0.16 + ((last.length - 1) * lineHeight) / 2
      : place === "centered_floating"
      ? h * 0.5 - ((last.length - 1) * lineHeight) / 2
      : h * (portrait ? 0.8 : 0.84) - ((last.length - 1) * lineHeight) / 2;

    const alignX = sub.alignment === "left" ? w * 0.1 : sub.alignment === "right" ? w * 0.9 : w / 2;
    const bgOpacity = ((Number(sub.bgOpacity) ?? 65) / 100) * fade;

    for (const textLine of last) {
      const textWidth = ctx.measureText(textLine).width + size * 1.1;
      const boxX = sub.alignment === "left" ? alignX : sub.alignment === "right" ? alignX - textWidth : alignX - textWidth / 2;

      if (sub.bgStyle !== "none" && bgOpacity > 0) {
        ctx.fillStyle = sub.bgStyle === "accent_tint"
          ? `rgba(245, 169, 74, ${0.45 * bgOpacity})`
          : `rgba(0, 0, 0, ${0.65 * bgOpacity})`;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(boxX, y - lineHeight / 2, textWidth, lineHeight, size * 0.3);
        else ctx.rect(boxX, y - lineHeight / 2, textWidth, lineHeight);
        ctx.fill();
      }

      if (sub.textOutline === "strong") {
        ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
        ctx.lineWidth = Math.max(2, size * 0.15);
        ctx.strokeText(textLine, alignX, y);
      } else if (sub.textOutline === "glow") {
        ctx.shadowColor = user ? "#ffecd6" : "#38bdf8";
        ctx.shadowBlur = 8;
      }

      ctx.fillStyle = user
        ? (sub.textColorUser || `rgba(255, 236, 214, ${0.8 * fade})`)
        : (sub.textColorRobot || `rgba(255, 255, 255, ${fade})`);
      ctx.fillText(textLine, alignX, y);
      ctx.shadowBlur = 0;
      y += lineHeight;
    }
  },
};
