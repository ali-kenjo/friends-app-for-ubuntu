// A tiny way to build page elements: h("button", { class: "btn", onclick: fn }, "Label", otherElement).
// Text is always set as text (never as HTML), so what a model or a file says can't become markup.
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key === "html") el.innerHTML = value; // only for icons we draw ourselves
    else if (key === "style") el.style.cssText = value;
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in el && typeof value !== "string" && typeof value !== "number") el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const kid of kids.flat()) if (kid !== undefined && kid !== null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
