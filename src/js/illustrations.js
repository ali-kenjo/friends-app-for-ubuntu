// ---------- Procedural SVG Illustrations & Progress Rings ----------
// Drawn entirely with inline SVG and design tokens (no external assets).

export function emptyIllustration(kind = "missions") {
  const wrap = document.createElement("div");
  wrap.className = `cozy-illustration ill-${kind}`;
  wrap.setAttribute("aria-hidden", "true");

  if (kind === "missions") {
    // Robot holding a glowing lantern beside a small map scroll
    wrap.innerHTML = `<svg viewBox="0 0 120 88" fill="none">
      <ellipse cx="60" cy="76" rx="42" ry="7" fill="var(--accent-subtle)"/>
      <rect x="34" y="24" width="38" height="32" rx="11" fill="var(--bg-hover)" stroke="var(--text-muted)" stroke-width="2"/>
      <rect x="39" y="29" width="28" height="20" rx="7" fill="var(--bg-main)"/>
      <rect x="45" y="35" width="4" height="7" rx="2" fill="var(--accent)"/>
      <rect x="57" y="35" width="4" height="7" rx="2" fill="var(--accent)"/>
      <path d="M50 45q3 2.2 6 0" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="53" y1="24" x2="53" y2="17" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"/>
      <circle cx="53" cy="15" r="3" fill="var(--accent)"/>
      <rect x="41" y="58" width="24" height="14" rx="7" fill="var(--bg-hover)" stroke="var(--text-muted)" stroke-width="2"/>
      <path d="M72 46c6 0 10 3 12 7" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"/>
      <circle cx="86" cy="58" r="9" fill="var(--accent-subtle)" stroke="var(--accent)" stroke-width="1.8"/>
      <circle cx="86" cy="58" r="3.5" fill="var(--accent)"/>
    </svg>`;
  } else if (kind === "today") {
    // Cozy steaming mug and a small leafy sprout
    wrap.innerHTML = `<svg viewBox="0 0 108 76" fill="none">
      <ellipse cx="54" cy="66" rx="36" ry="6" fill="var(--accent-subtle)"/>
      <path d="M40 24c0-3 2-5 2-8M48 22c0-3 2-5 2-8" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" opacity="0.85"/>
      <rect x="32" y="28" width="28" height="28" rx="7" fill="var(--bg-hover)" stroke="var(--text-muted)" stroke-width="2"/>
      <path d="M60 34h5a6 6 0 0 1 0 12h-5" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"/>
      <path d="M76 56V42" stroke="var(--success)" stroke-width="2" stroke-linecap="round"/>
      <path d="M76 46c-6-1-9-6-7-10 5 0 8 4 7 10Z" fill="var(--accent-subtle)" stroke="var(--success)" stroke-width="1.6"/>
      <path d="M76 43c6-1 9-6 7-10-5 0-8 4-7 10Z" fill="var(--accent-subtle)" stroke="var(--success)" stroke-width="1.6"/>
    </svg>`;
  } else {
    // Robot waving beside a warm chat bubble
    wrap.innerHTML = `<svg viewBox="0 0 110 76" fill="none">
      <ellipse cx="55" cy="66" rx="36" ry="6" fill="var(--accent-subtle)"/>
      <rect x="28" y="22" width="36" height="30" rx="10" fill="var(--bg-hover)" stroke="var(--text-muted)" stroke-width="2"/>
      <rect x="33" y="27" width="26" height="18" rx="6" fill="var(--bg-main)"/>
      <rect x="39" y="32" width="3.8" height="6.5" rx="1.9" fill="var(--accent)"/>
      <rect x="49" y="32" width="3.8" height="6.5" rx="1.9" fill="var(--accent)"/>
      <rect x="68" y="18" width="24" height="18" rx="6" fill="var(--accent-subtle)" stroke="var(--accent)" stroke-width="1.6"/>
      <circle cx="75" cy="27" r="1.6" fill="var(--accent)"/>
      <circle cx="80" cy="27" r="1.6" fill="var(--accent)"/>
      <circle cx="85" cy="27" r="1.6" fill="var(--accent)"/>
    </svg>`;
  }
  return wrap;
}

// Animated SVG progress ring for missions and habit streaks
export function progressRing(done = 0, total = 1, { size = 34, stroke = 3.5, label = "" } = {}) {
  const pct = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
  const r = (size - stroke * 2) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  const span = document.createElement("span");
  span.className = "progress-ring";
  if (label) {
    span.setAttribute("role", "img");
    span.setAttribute("aria-label", label);
  } else {
    span.setAttribute("aria-hidden", "true");
  }
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none"/>
    <circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none"
      stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" stroke-linecap="round"/>
  </svg>`;
  return span;
}
