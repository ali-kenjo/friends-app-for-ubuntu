// What the AI writes (or a page, a post, a message it read) is shown as formatted text, never as a web page of its own.
// It may not load anything from the internet by itself (pictures, videos, styles: a way to tell someone what you are
// reading), draw a form that sends your answers somewhere, or restyle the whole app. Links stay links.
import DOMPurify from "/vendor/dompurify/purify.es.mjs";

// Nothing that loads or submits on its own
// (A task list's checkboxes stay: with no form around them they can't send anything.)
const FORBID_TAGS = ["img", "picture", "source", "video", "audio", "track", "style", "link", "meta", "base", "form", "textarea", "select", "option", "button", "object", "embed", "iframe", "frame", "frameset"];
const FORBID_ATTR = ["srcset", "poster", "background", "formaction", "action", "ping"];
// A style that fetches something, or hides what it does by escaping
const LOADS = /url\s*\(|image-set|@import|expression\s*\(|\\|javascript:|behavior\s*:|-moz-binding/i;

DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
  if (data.attrName === "style" && LOADS.test(String(data.attrValue))) data.keepAttr = false;
});

// Links in replies open in a new tab, so the chat stays open
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

export const cleanHtml = (html) => DOMPurify.sanitize(String(html ?? ""), { FORBID_TAGS, FORBID_ATTR });
