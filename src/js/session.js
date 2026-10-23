// Local API Session Management (src/js/session.js)
// Exchanges launch token for an HttpOnly SameSite=Strict cookie and clears URL fragment.
// Handles auth gate display when API requests return 401.

let gateShown = false;

export function showAuthGate() {
  if (gateShown) return;
  gateShown = true;
  const gate = document.getElementById("auth-gate");
  if (gate) gate.hidden = false;
  const app = document.querySelector(".app");
  if (app) app.hidden = true;
}

export async function initSession() {
  const hash = window.location.hash || "";
  const match = hash.match(/(?:^|[#&])token=([a-f0-9]{32,64})/i);
  if (match) {
    const token = match[1];
    try {
      await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch (e) {
      console.warn("Session token exchange failed:", e);
    }
    // Scrub token from location hash immediately so it never leaks
    let clean = hash.replace(/(?:^|[#&])token=[a-f0-9]{32,64}/i, "");
    if (clean.startsWith("&")) clean = "#" + clean.slice(1);
    if (clean === "#") clean = "";
    try {
      window.history.replaceState(null, "", window.location.pathname + window.location.search + clean);
    } catch {}
  }
}
