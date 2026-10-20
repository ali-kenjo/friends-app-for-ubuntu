// The services Friends knows (cloud and local; server/services.js), loaded once, and how an AI looks in a list: its
// service, its colour, a round mark with its first letter.
import { api } from "./api.js";
import { t } from "./i18n.js";

let catalog = null;
let loading = null;

// { cloud: [...], local: [...] }; null until the helper has answered (the page works without it)
export const services = () => catalog;

export function loadServices() {
  if (catalog) return Promise.resolve(catalog);
  loading ||= api.services.list().then(
    (c) => {
      catalog = c;
      document.dispatchEvent(new CustomEvent("friends:services-ready"));
      return c;
    },
    () => {
      loading = null; // asked again next time
      return null;
    }
  );
  return loading;
}

const cloudEntry = (id) => catalog?.cloud.find((s) => s.id === id) || null;
const localEntry = (id) => catalog?.local.find((s) => s.id === id) || null;
export const cloudService = cloudEntry;
export const localService = localEntry;

// Which local server a saved address belongs to (by its port)
export function localByAddress(url) {
  const port = Number((String(url || "").match(/:(\d{2,5})(\/|$)/) || [])[1]);
  return catalog?.local.find((s) => s.port === port) || null;
}

// What to call and colour an AI in lists: { label, company, color, kind }
export function describe(brain) {
  if (brain.provider === "gemini") {
    const s = cloudEntry("gemini");
    return { label: s?.label || "Gemini", company: s?.company || "Google", color: s?.color || "#4f8df5", kind: "cloud" };
  }
  if (brain.provider === "openai") {
    const s = cloudEntry(brain.service);
    return { label: s?.label || t("Cloud AI"), company: s?.company || t("A cloud service"), color: s?.color || "#8a8499", kind: "cloud" };
  }
  const s = localByAddress(brain.baseUrl);
  return { label: s?.label || t("Local AI"), company: t("On this computer"), color: "#3fa56b", kind: "local" };
}

// The round mark: the first letter on the service's colour
export function logo(label, color, className = "brain-logo") {
  const el = document.createElement("div");
  el.className = className;
  el.style.setProperty("--c", color || "#8a8499");
  el.setAttribute("aria-hidden", "true");
  el.textContent = String(label || "?").trim()[0]?.toUpperCase() || "?";
  return el;
}
