// [[Links]] between boards, the way a notebook does it: write [[Another board]] in a text, note or label and it is a
// link to the board with that name (a board's own name is its title). Pure functions, shared by the page and the helper.

// [[Title]], [[Title#Page]], [[Title|what is shown]]
export const WIKILINK = /\[\[([^[\]\n|#]{1,120}?)(?:#([^[\]\n|]{0,80}))?(?:\|([^[\]\n]{0,80}))?\]\]/g;

export function parseLinks(text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(WIKILINK)) {
    const title = m[1].trim();
    if (title) out.push({ title, anchor: (m[2] || "").trim(), label: (m[3] || "").trim(), raw: m[0] });
  }
  return out;
}

// Everything an item says in words
export function itemTexts(item) {
  if (!item) return [];
  switch (item.type) {
    case "text":
      return [item.text];
    case "sticky":
      return [item.title, item.text];
    case "shape":
      return [item.label];
    case "frame":
      return [item.title];
    case "checklist":
      return [item.title, ...(item.items || []).map((c) => c.text)];
    case "table":
      return [item.title, ...(item.headers || []), ...(item.rows || []).flat()];
    case "image":
      return [item.caption];
    default:
      return [];
  }
}

// Every link a board makes: { title (as first written), count, ids: [item ids] } by lower-case title
export function linksOfDoc(doc) {
  const found = new Map();
  for (const page of doc?.pages || []) {
    for (const item of page.items || []) {
      for (const text of itemTexts(item)) {
        for (const link of parseLinks(text)) {
          const key = link.title.toLowerCase();
          const entry = found.get(key) || { title: link.title, count: 0, ids: [] };
          entry.count += 1;
          if (!entry.ids.includes(item.id)) entry.ids.push(item.id);
          found.set(key, entry);
        }
      }
    }
  }
  return found;
}
