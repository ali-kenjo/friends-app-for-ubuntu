// Diagrams you can edit: a flowchart written in Mermaid's flowchart notation, or an indented outline, becomes real
// shapes and arrows on the board (not a picture), laid out in layers. Move a box and its arrows follow.
// Pure: it makes operations (see ops.mjs); the board applies them like anything else.
import { genId, color as cleanColor } from "./model.mjs";
import { guessMeasure } from "./text.mjs";

const SHAPE_FOR = { rect: "rect", round: "round_rect", stadium: "round_rect", circle: "circle", diamond: "diamond", hexagon: "hexagon", cylinder: "cylinder", cloud: "cloud" };

// ---------- Reading Mermaid flowcharts ----------
// graph TD / LR / TB / BT / RL, nodes A[text] A(text) A([text]) A((text)) A{text} A{{text}} A[(text)], arrows
// --> --- -.-> ==> with |labels| or -- text -->, chains (A --> B --> C), and A & B --> C. Anything else is not a flowchart: null.
export function parseFlow(code) {
  const text = String(code || "").replace(/%%.*$/gm, "").trim();
  const head = /^(?:graph|flowchart)\s*(TD|TB|BT|LR|RL)?\s*[;\n]?/i.exec(text);
  if (!head) return null;
  const direction = (head[1] || "TD").toUpperCase();
  const nodes = new Map();
  const edges = [];
  const body = text.slice(head[0].length);

  const node = (id, label, shape) => {
    const cur = nodes.get(id) || { id, label: id, shape: "rect" };
    if (label !== undefined) cur.label = label;
    if (shape) cur.shape = shape;
    nodes.set(id, cur);
    return cur;
  };
  // One node reference: id plus an optional shape and label
  const NODE = /^\s*([A-Za-z0-9_À-￿][\wÀ-￿-]*)\s*(?:\(\[(.*?)\]\)|\(\((.*?)\)\)|\[\((.*?)\)\]|\{\{(.*?)\}\}|\[(.*?)\]|\((.*?)\)|\{(.*?)\})?/s;
  const readNode = (s) => {
    const m = NODE.exec(s);
    if (!m) return null;
    const unq = (t) => (t === undefined ? undefined : t.replace(/^"(.*)"$/s, "$1").replace(/<br\s*\/?>/gi, "\n").trim());
    let shape;
    let label;
    if (m[2] !== undefined) { shape = "stadium"; label = m[2]; }
    else if (m[3] !== undefined) { shape = "circle"; label = m[3]; }
    else if (m[4] !== undefined) { shape = "cylinder"; label = m[4]; }
    else if (m[5] !== undefined) { shape = "hexagon"; label = m[5]; }
    else if (m[6] !== undefined) { shape = "rect"; label = m[6]; }
    else if (m[7] !== undefined) { shape = "round"; label = m[7]; }
    else if (m[8] !== undefined) { shape = "diamond"; label = m[8]; }
    node(m[1], unq(label), shape);
    return { id: m[1], length: m[0].length };
  };
  const ARROW = /^\s*(?:(<)?(-{2,}|={2,}|-\.+-|-\.-)(>)?(?:\s*\|([^|]*)\|)?|(--|==)\s+([^->=]+?)\s+(-{2,}>?|={2,}>?))/;

  const statements = body.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    if (/^(subgraph|end|direction|classDef|class|style|linkStyle|click)\b/i.test(stmt)) continue;
    // Groups on either side: A & B --> C
    let rest = stmt;
    let groups = [];
    let ok = true;
    let guard = 0;
    while (rest && guard++ < 50) {
      const ids = [];
      for (;;) {
        const r = readNode(rest);
        if (!r) { ok = false; break; }
        ids.push(r.id);
        rest = rest.slice(r.length);
        const amp = /^\s*&\s*/.exec(rest);
        if (amp) rest = rest.slice(amp[0].length);
        else break;
      }
      if (!ok) break;
      groups.push(ids);
      rest = rest.trimStart();
      if (!rest) break;
      // dotted: -.-> / -.- ; thick ==> ; plain --> ---
      const dotted = /^-\.+-?>?/.exec(rest);
      const label = [];
      let style = "solid";
      let arrowEnd = false;
      let consumed = 0;
      if (dotted) {
        style = "dashed";
        arrowEnd = dotted[0].endsWith(">");
        consumed = dotted[0].length;
      } else {
        const m = ARROW.exec(rest);
        if (!m) { ok = false; break; }
        consumed = m[0].length;
        if (m[2]) {
          style = m[2][0] === "=" ? "thick" : "solid";
          arrowEnd = Boolean(m[3]);
          if (m[4] !== undefined) label.push(m[4].trim());
        } else {
          style = m[5] === "==" ? "thick" : "solid";
          arrowEnd = m[7].endsWith(">");
          label.push(m[6].trim());
        }
      }
      rest = rest.slice(consumed).trimStart();
      const lab = /^\|([^|]*)\|/.exec(rest);
      if (lab) {
        label.push(lab[1].trim());
        rest = rest.slice(lab[0].length);
      }
      groups.push({ arrow: { style, arrowEnd, label: label.filter(Boolean).join(" ") } });
    }
    if (!ok) continue;
    for (let i = 0; i < groups.length - 2; i += 2) {
      const from = groups[i];
      const arrow = groups[i + 1].arrow;
      const to = groups[i + 2];
      for (const a of from) for (const b of to) edges.push({ from: a, to: b, ...arrow });
    }
  }
  if (!nodes.size) return null;
  return { direction, nodes: [...nodes.values()], edges };
}

// ---------- Reading an outline ----------
// "- Plan\n  - Research\n  - Build\n    - Test" → { text, children }. A plain list of lines is a flat tree; "Topic: a, b, c" too.
export function parseOutline(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  if (!lines.length) return null;
  if (lines.length === 1 && lines[0].includes(":")) {
    const [root, rest] = lines[0].split(/:(.*)/s);
    return { text: root.trim(), children: rest.split(/[,;|]/).map((s) => s.trim()).filter(Boolean).map((t) => ({ text: t, children: [] })) };
  }
  const items = lines.map((l) => {
    const m = /^(\s*)(?:[-*+•]|\d+[.)])?\s*(.*)$/.exec(l.replace(/\t/g, "  "));
    return { depth: Math.floor(m[1].length / 2), text: m[2].trim() };
  });
  const base = Math.min(...items.map((i) => i.depth));
  const roots = [];
  const stack = [];
  for (const it of items) {
    const node = { text: it.text, children: [] };
    const depth = it.depth - base;
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    (stack.length ? stack[stack.length - 1].node.children : roots).push(node);
    stack.push({ depth, node });
  }
  return roots.length === 1 ? roots[0] : { text: "", children: roots };
}

// ---------- Laying out ----------
function sizeOf(node, fontSize) {
  const lines = String(node.label ?? node.text ?? "").split("\n");
  const w = Math.max(...lines.map((l) => guessMeasure(l, { size: fontSize })), 20);
  const diamond = node.shape === "diamond";
  const round = node.shape === "circle";
  const width = Math.min(300, Math.max(diamond ? 130 : 96, Math.ceil(w + (diamond ? 70 : 36))));
  const height = Math.max(diamond ? 84 : 54, Math.ceil(lines.length * fontSize * 1.35 + (diamond ? 44 : 22)));
  return round ? { w: Math.max(width, height), h: Math.max(width, height) } : { w: width, h: height };
}

// Layers by longest path (an edge that closes a cycle is ignored for the layering), then ordered to tangle less
export function layoutGraph(graph, { fontSize = 18, gapLayer = 90, gapNode = 46 } = {}) {
  const ids = graph.nodes.map((n) => n.id);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out = new Map(ids.map((id) => [id, []]));
  const inc = new Map(ids.map((id) => [id, []]));
  const edges = [];
  const seen = new Set();
  for (const e of graph.edges) {
    const key = `${e.from}>${e.to}`;
    if (!byId.has(e.from) || !byId.has(e.to) || e.from === e.to || seen.has(key)) continue;
    seen.add(key);
    edges.push(e);
  }
  // Depth-first from the nodes nothing points to; an edge into a node still being visited closes a cycle
  const state = new Map();
  const back = new Set();
  const visit = (id) => {
    state.set(id, 1);
    for (const e of edges) {
      if (e.from !== id) continue;
      if (state.get(e.to) === 1) back.add(e);
      else if (!state.has(e.to)) visit(e.to);
    }
    state.set(id, 2);
  };
  const hasIncoming = new Set(edges.map((e) => e.to));
  for (const id of ids) if (!hasIncoming.has(id) && !state.has(id)) visit(id);
  for (const id of ids) if (!state.has(id)) visit(id);
  const forward = edges.filter((e) => !back.has(e));
  const layer = new Map(ids.map((id) => [id, 0]));
  for (let pass = 0; pass < ids.length; pass++) {
    let moved = false;
    for (const e of forward) {
      if (layer.get(e.to) < layer.get(e.from) + 1) {
        layer.set(e.to, layer.get(e.from) + 1);
        moved = true;
      }
    }
    if (!moved) break;
  }
  for (const e of forward) {
    out.get(e.from).push(e.to);
    inc.get(e.to).push(e.from);
  }
  const rows = [];
  for (const id of ids) (rows[layer.get(id)] ||= []).push(id);
  for (let i = 0; i < rows.length; i++) rows[i] ||= [];
  // Barycenter sweeps
  const posIn = (row) => new Map(row.map((id, i) => [id, i]));
  for (let sweep = 0; sweep < 4; sweep++) {
    for (let i = 1; i < rows.length; i++) {
      const prev = posIn(rows[i - 1]);
      rows[i].sort((a, b) => bary(a, inc, prev) - bary(b, inc, prev));
    }
    for (let i = rows.length - 2; i >= 0; i--) {
      const next = posIn(rows[i + 1]);
      rows[i].sort((a, b) => bary(a, out, next) - bary(b, out, next));
    }
  }
  const horizontal = graph.direction === "LR" || graph.direction === "RL";
  const sizes = new Map(ids.map((id) => [id, sizeOf(byId.get(id), fontSize)]));
  const place = new Map();
  let along = 0;
  const crossLen = rows.map((row) => row.reduce((s, id) => s + (horizontal ? sizes.get(id).h : sizes.get(id).w), 0) + Math.max(0, row.length - 1) * gapNode);
  const widest = Math.max(0, ...crossLen);
  rows.forEach((row, ri) => {
    const layerThick = Math.max(0, ...row.map((id) => (horizontal ? sizes.get(id).w : sizes.get(id).h)));
    let cross = (widest - crossLen[ri]) / 2;
    for (const id of row) {
      const s = sizes.get(id);
      const x = horizontal ? along + (layerThick - s.w) / 2 : cross;
      const y = horizontal ? cross : along + (layerThick - s.h) / 2;
      place.set(id, { x, y, w: s.w, h: s.h });
      cross += (horizontal ? s.h : s.w) + gapNode;
    }
    along += layerThick + gapLayer;
  });
  if (graph.direction === "BT" || graph.direction === "RL") {
    const total = along - gapLayer;
    for (const p of place.values()) {
      if (horizontal) p.x = total - p.x - p.w;
      else p.y = total - p.y - p.h;
    }
  }
  return place;
}

function bary(id, links, pos) {
  const list = links.get(id).map((x) => pos.get(x)).filter((v) => v !== undefined);
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : Infinity;
}

const NODE_FILLS = ["#e0e7ff", "#dcfce7", "#fef3c7", "#fce7f3", "#e0f2fe", "#ede9fe"];

// A flowchart as operations: boxes with their words, and arrows glued to them
export function flowToOps(graph, { x = 100, y = 100, fontSize = 18, ink = "#1e293b", fills = NODE_FILLS } = {}) {
  const place = layoutGraph(graph, { fontSize });
  const ids = new Map(graph.nodes.map((n) => [n.id, genId("shape")]));
  const ops = [];
  let i = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of graph.nodes) {
    const p = place.get(n.id);
    const fill = n.shape === "diamond" ? "#fef3c7" : fills[i++ % fills.length];
    ops.push({
      op: "add",
      item: {
        type: "shape", id: ids.get(n.id), shapeType: SHAPE_FOR[n.shape] || "rect", x: Math.round(x + p.x), y: Math.round(y + p.y), width: Math.round(p.w), height: Math.round(p.h),
        fillColor: cleanColor(fill), strokeColor: ink, strokeWidth: 2, label: n.label, fontSize, labelColor: ink,
      },
    });
    minX = Math.min(minX, x + p.x); minY = Math.min(minY, y + p.y); maxX = Math.max(maxX, x + p.x + p.w); maxY = Math.max(maxY, y + p.y + p.h);
  }
  for (const e of graph.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    ops.push({
      op: "add",
      item: {
        type: "shape", shapeType: "connector", from: { id: ids.get(e.from) }, to: { id: ids.get(e.to) }, route: "elbow", strokeColor: ink,
        strokeWidth: e.style === "thick" ? 4 : 2, strokeStyle: e.style === "dashed" ? "dashed" : "solid", arrowEnd: e.arrowEnd !== false, label: e.label || undefined, fontSize: Math.max(12, fontSize - 3),
      },
    });
  }
  return { ops, ids: Object.fromEntries(ids), bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
}

// ---------- Trees and mind maps ----------
function sizeText(text, fontSize) {
  return sizeOf({ label: text, shape: "rect" }, fontSize);
}

// style "tree": the root on top, branches below. style "mindmap": the root in the middle, branches left and right.
export function outlineToOps(root, { style = "tree", x = 100, y = 100, fontSize = 18, ink = "#1e293b" } = {}) {
  if (!root) return { ops: [], ids: {}, bounds: { x, y, width: 0, height: 0 } };
  const ops = [];
  const count = (n) => 1 + n.children.reduce((s, c) => s + count(c), 0);
  if (count(root) > 120) throw new Error("That outline is too big for one diagram (120 items at most).");
  const palette = ["#e0e7ff", "#dcfce7", "#fef3c7", "#fce7f3", "#e0f2fe", "#ede9fe"];
  const pos = new Map();
  const ids = new Map();
  const id = (n) => (ids.has(n) ? ids.get(n) : (ids.set(n, genId("shape")), ids.get(n)));
  const GAP_X = 36, GAP_Y = 70, GAP_SIB = 26;

  if (style === "mindmap" && root.children.length) {
    // Right and left halves, each a tree growing sideways
    const halves = [[], []];
    root.children.forEach((c, i) => halves[i % 2].push(c));
    const sideLayout = (nodes, dir) => {
      let cursor = 0;
      const place = (n, depth) => {
        const s = sizeText(n.text, fontSize);
        let childTop = cursor;
        const kids = n.children.map((c) => place(c, depth + 1));
        let cy;
        if (kids.length) cy = (kids[0].cy + kids[kids.length - 1].cy) / 2;
        else { cy = cursor + s.h / 2; cursor += s.h + GAP_SIB; }
        void childTop;
        const entry = { node: n, depth, cy, s, kids };
        return entry;
      };
      const tops = nodes.map((n) => place(n, 1));
      const used = Math.max(0, cursor - GAP_SIB);
      return { tops, used, dir };
    };
    const R = sideLayout(halves[0], 1);
    const L = sideLayout(halves[1], -1);
    const rootSize = sizeText(root.text, fontSize + 3);
    const total = Math.max(R.used, L.used, rootSize.h);
    const midY = y + total / 2;
    const colWidth = (entry, depth, acc) => {
      acc[depth] = Math.max(acc[depth] || 0, entry.s.w);
      entry.kids.forEach((k) => colWidth(k, depth + 1, acc));
    };
    const place = (side, rootRight, rootLeft) => {
      const widths = {};
      side.tops.forEach((t) => colWidth(t, 1, widths));
      const edges = { 0: side.dir > 0 ? rootRight : rootLeft };
      const depthMax = Math.max(0, ...Object.keys(widths).map(Number));
      for (let d = 1; d <= depthMax; d++) {
        const prev = edges[d - 1];
        edges[d] = side.dir > 0 ? prev + GAP_X + widths[d] : prev - GAP_X - widths[d];
      }
      const shift = (total - side.used) / 2;
      const walk = (e, parentKey) => {
        const left = side.dir > 0 ? edges[e.depth - 1] + GAP_X : edges[e.depth - 1] - GAP_X - e.s.w;
        pos.set(e.node, { x: left, y: y + shift + e.cy - e.s.h / 2, w: e.s.w, h: e.s.h, parent: parentKey, depth: e.depth, branch: side });
        e.kids.forEach((k) => walk(k, e.node));
      };
      side.tops.forEach((t) => walk(t, root));
    };
    const rootX = x + Math.max(240, 0);
    pos.set(root, { x: rootX, y: midY - rootSize.h / 2, w: rootSize.w, h: rootSize.h, parent: null, depth: 0 });
    place(R, rootX + rootSize.w, rootX);
    place(L, rootX + rootSize.w, rootX);
  } else {
    // Tree: every leaf takes a slot across; a parent sits in the middle of its children
    let cursor = 0;
    const walk = (n, depth, parent) => {
      const s = sizeText(n.text, fontSize);
      const kids = n.children.map((c) => walk(c, depth + 1, n));
      let cx;
      if (kids.length) cx = (kids[0].cx + kids[kids.length - 1].cx) / 2;
      else { cx = cursor + s.w / 2; cursor += s.w + GAP_SIB; }
      const entry = { node: n, depth, cx, s, parent };
      pos.set(n, entry);
      return entry;
    };
    walk(root, 0, null);
    const rowH = new Map();
    for (const e of pos.values()) rowH.set(e.depth, Math.max(rowH.get(e.depth) || 0, e.s.h));
    const rowY = new Map();
    let yy = y;
    for (let d = 0; d <= Math.max(...rowH.keys()); d++) { rowY.set(d, yy); yy += (rowH.get(d) || 0) + GAP_Y; }
    for (const [n, e] of [...pos.entries()]) {
      pos.set(n, { x: x + e.cx - e.s.w / 2, y: rowY.get(e.depth) + ((rowH.get(e.depth) || 0) - e.s.h) / 2, w: e.s.w, h: e.s.h, parent: e.parent, depth: e.depth });
    }
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const nodeList = [...pos.entries()];
  const sorted = nodeList.sort((a, b) => a[1].depth - b[1].depth);
  for (const [n, p] of sorted) {
    if (!n.text && p.depth === 0) continue; // a made-up empty root
    const root0 = p.depth === 0;
    ops.push({
      op: "add",
      item: {
        type: "shape", id: id(n), shapeType: root0 ? "round_rect" : "round_rect", x: Math.round(p.x), y: Math.round(p.y), width: Math.round(p.w), height: Math.round(p.h),
        fillColor: cleanColor(root0 ? "#c7d2fe" : palette[(p.depth - 1) % palette.length]), strokeColor: ink, strokeWidth: root0 ? 3 : 2, label: n.text, fontSize: root0 ? fontSize + 3 : fontSize, labelColor: ink,
      },
    });
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x + p.w); maxY = Math.max(maxY, p.y + p.h);
  }
  for (const [n, p] of sorted) {
    if (!p.parent || !ids.has(p.parent) || !ids.has(n)) continue;
    const pp = pos.get(p.parent);
    const toLeft = style === "mindmap" && p.x + p.w / 2 < pp.x + pp.w / 2;
    ops.push({
      op: "add",
      item: {
        type: "shape", shapeType: "connector", from: { id: ids.get(p.parent), port: style === "mindmap" ? (toLeft ? "left" : "right") : "bottom" }, to: { id: ids.get(n), port: style === "mindmap" ? (toLeft ? "right" : "left") : "top" },
        route: style === "mindmap" ? "curve" : "elbow", strokeColor: ink, strokeWidth: 2, arrowEnd: false,
      },
    });
  }
  return { ops, ids: Object.fromEntries([...ids.entries()].map(([n, v]) => [n.text, v])), bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
}
