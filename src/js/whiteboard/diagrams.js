// Mermaid diagrams on the board (the kinds that are not flowcharts, which become real shapes): drawn once by
// Mermaid, kept as a picture, and shown on the canvas. Without foreignObject labels (those would make the canvas
// unusable for exports and the 3D board), and only when Mermaid can read the text.
let mermaidPromise = null;
const cache = new Map(); // key → { img } | { failed: true } | { pending: true }
let count = 0;

async function loadMermaid(dark) {
  mermaidPromise ||= import("/vendor/mermaid/mermaid.esm.min.mjs").then((m) => m.default);
  const mermaid = await mermaidPromise;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "default",
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    fontFamily: "Figtree, system-ui, sans-serif",
  });
  return mermaid;
}

// A picture for the diagram if it's ready; otherwise null and a redraw is asked for when it is
export function diagramImage(item, dark, onReady) {
  const key = `${dark ? "d" : "l"}|${item.code}`;
  const hit = cache.get(key);
  if (hit?.img) return hit.img;
  if (hit) return null;
  cache.set(key, { pending: true });
  if (cache.size > 60) cache.delete(cache.keys().next().value);
  (async () => {
    try {
      const mermaid = await loadMermaid(dark);
      const { svg } = await mermaid.render(`wb-diagram-${++count}`, item.code);
      if (/<foreignObject/i.test(svg)) throw new Error("This diagram needs HTML labels.");
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("The diagram couldn't be drawn."));
        img.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      });
      cache.set(key, { img });
    } catch {
      cache.set(key, { failed: true });
      document.getElementById(`dwb-diagram-${count}`)?.remove(); // Mermaid's leftover error box
    }
    onReady?.();
  })();
  return null;
}
