// Formulas on the board, drawn by Friends itself (nothing is downloaded and no web page is built): the common LaTeX
// you write in chats — fractions, roots, powers, indices, sums and integrals with limits, Greek letters, relations,
// arrows, matrices, brackets that grow with what's inside — laid out as boxes and drawn on the canvas, so a formula
// looks the same on the board, in the 3D room, in an exported picture and in a recording.
// Pure: parseTeX() makes a tree, layoutMath() boxes with positions, drawMath() draws them on any 2D context.

const GREEK = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ϵ", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ",
  lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", varpi: "ϖ", rho: "ρ", varrho: "ϱ", sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ", phi: "ϕ", varphi: "φ",
  chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
};
const REL = {
  leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈", equiv: "≡", sim: "∼", simeq: "≃", cong: "≅", propto: "∝", ll: "≪", gg: "≫", in: "∈", notin: "∉",
  ni: "∋", subset: "⊂", supset: "⊃", subseteq: "⊆", supseteq: "⊇", to: "→", rightarrow: "→", leftarrow: "←", leftrightarrow: "↔", Rightarrow: "⇒", Leftarrow: "⇐",
  Leftrightarrow: "⇔", implies: "⟹", iff: "⟺", mapsto: "↦", uparrow: "↑", downarrow: "↓", perp: "⊥", parallel: "∥", mid: "∣", vdash: "⊢", models: "⊨", gets: "←",
};
const BINOP = {
  pm: "±", mp: "∓", times: "×", div: "÷", cdot: "⋅", ast: "∗", star: "⋆", circ: "∘", bullet: "∙", oplus: "⊕", otimes: "⊗", cup: "∪", cap: "∩", setminus: "∖",
  land: "∧", wedge: "∧", lor: "∨", vee: "∨", wr: "≀", dagger: "†",
};
const ORD = {
  infty: "∞", partial: "∂", nabla: "∇", hbar: "ℏ", ell: "ℓ", Re: "ℜ", Im: "ℑ", aleph: "ℵ", angle: "∠", degree: "°", prime: "′", emptyset: "∅", varnothing: "∅",
  forall: "∀", exists: "∃", nexists: "∄", neg: "¬", lnot: "¬", ldots: "…", dots: "…", cdots: "⋯", vdots: "⋮", ddots: "⋱", therefore: "∴", because: "∵", top: "⊤", bot: "⊥",
  triangle: "△", square: "□", checkmark: "✓", ", ": " ",
};
const BIG = { sum: "∑", prod: "∏", coprod: "∐", int: "∫", iint: "∬", iiint: "∭", oint: "∮", bigcup: "⋃", bigcap: "⋂", bigoplus: "⨁", bigotimes: "⨂" };
const LIMITS_ABOVE = new Set(["sum", "prod", "coprod", "bigcup", "bigcap", "bigoplus", "bigotimes", "lim", "limsup", "liminf", "max", "min", "sup", "inf"]);
const FUNCS = new Set("sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh coth log ln lg exp lim limsup liminf max min sup inf det dim ker gcd lcm arg deg Pr mod hom".split(" "));
const BLACKBOARD = { R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ", P: "ℙ", H: "ℍ", E: "𝔼", F: "𝔽", K: "𝕂" };
const DELIMS = { "(": "(", ")": ")", "[": "[", "]": "]", "|": "|", "\\{": "{", "\\}": "}", "\\langle": "⟨", "\\rangle": "⟩", "\\lfloor": "⌊", "\\rfloor": "⌋", "\\lceil": "⌈", "\\rceil": "⌉", "\\|": "‖", ".": "", "\\vert": "|", "\\Vert": "‖", "/": "/" };
const SPACES = { ",": 0.17, ":": 0.22, ";": 0.28, "!": -0.17, " ": 0.28, quad: 1, qquad: 2, thinspace: 0.17, enspace: 0.5 };
const ACCENTS = { hat: "^", widehat: "^", bar: "¯", overline: "¯", vec: "→", tilde: "~", widetilde: "~", dot: "˙", ddot: "¨", check: "ˇ", acute: "´", grave: "`", breve: "˘", underline: "_" };

// ---------- Reading ----------
export function parseTeX(src) {
  const s = String(src ?? "").slice(0, 4000);
  let i = 0;
  const peek = () => s[i];
  const eof = () => i >= s.length;

  function readCommand() {
    // after the backslash
    const m = /^[A-Za-z]+/.exec(s.slice(i));
    if (m) {
      i += m[0].length;
      return m[0];
    }
    return s[i++] || "";
  }

  function skipSpaces() {
    while (!eof() && /\s/.test(peek())) i++;
  }

  function readGroup() {
    skipSpaces();
    if (peek() === "{") {
      i++;
      const node = parseSeq("}");
      if (peek() === "}") i++;
      return node;
    }
    return parseAtom();
  }

  function readRawGroup() {
    skipSpaces();
    if (peek() !== "{") return "";
    let depth = 0;
    let out = "";
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === "{") { depth++; if (depth === 1) continue; }
      if (c === "}") { depth--; if (depth === 0) { i++; break; } }
      out += c;
    }
    return out;
  }

  function readOptional() {
    skipSpaces();
    if (peek() !== "[") return null;
    i++;
    const node = parseSeq("]");
    if (peek() === "]") i++;
    return node;
  }

  function parseAtom() {
    skipSpaces();
    if (eof()) return null;
    const c = s[i];
    if (c === "{") {
      i++;
      const node = parseSeq("}");
      if (peek() === "}") i++;
      return node;
    }
    if (c === "\\") {
      i++;
      return parseCommand(readCommand());
    }
    i++;
    if (/[0-9.]/.test(c)) {
      let n = c;
      while (!eof() && /[0-9.]/.test(peek())) n += s[i++];
      return { t: "num", text: n };
    }
    if (/[A-Za-z]/.test(c)) return { t: "var", text: c };
    if (/[+\-*/=<>!?,;:|()[\]'"~^&]/.test(c)) {
      if ("=<>".includes(c)) return { t: "rel", text: c };
      if ("+-*".includes(c)) return { t: "bin", text: c === "-" ? "−" : c === "*" ? "∗" : c };
      if (c === "'") return { t: "ord", text: "′" };
      return { t: "ord", text: c };
    }
    return { t: "ord", text: c };
  }

  function parseCommand(name) {
    if (GREEK[name]) return { t: "var", text: GREEK[name], greek: true };
    if (REL[name]) return { t: "rel", text: REL[name] };
    if (BINOP[name]) return { t: "bin", text: BINOP[name] };
    if (ORD[name]) return { t: "ord", text: ORD[name] };
    if (BIG[name]) return { t: "big", text: BIG[name], name };
    if (FUNCS.has(name)) return { t: "func", text: name, limits: LIMITS_ABOVE.has(name) };
    if (name in SPACES) return { t: "space", em: SPACES[name] };
    if (name === "frac" || name === "dfrac" || name === "tfrac") return { t: "frac", num: readGroup(), den: readGroup() };
    if (name === "binom") return { t: "delim", left: "(", right: ")", body: { t: "frac", num: readGroup(), den: readGroup(), bar: false } };
    if (name === "sqrt") {
      const index = readOptional();
      return { t: "sqrt", index, body: readGroup() };
    }
    if (ACCENTS[name]) return { t: "accent", kind: name, mark: ACCENTS[name], body: readGroup() };
    if (name === "text" || name === "mathrm" || name === "textrm" || name === "operatorname" || name === "mbox") return { t: "text", text: readRawGroup() };
    if (name === "mathbf" || name === "boldsymbol" || name === "textbf") return { t: "styled", bold: true, body: readGroup() };
    if (name === "mathit" || name === "textit") return { t: "styled", italic: true, body: readGroup() };
    if (name === "mathbb") {
      const raw = readRawGroup();
      return { t: "var", text: [...raw].map((c) => BLACKBOARD[c] || c).join(""), upright: true };
    }
    if (name === "mathcal" || name === "mathscr" || name === "mathfrak") return { t: "styled", italic: true, body: readGroup() };
    if (name === "left") {
      skipSpaces();
      const l = readDelim();
      const body = parseSeq("\\right");
      let r = "";
      if (s.startsWith("\\right", i)) {
        i += 6;
        skipSpaces();
        r = readDelim();
      }
      return { t: "delim", left: l, right: r, body };
    }
    if (name === "right") return { t: "ord", text: "" };
    if (name === "begin") {
      const env = readRawGroup();
      return parseMatrix(env);
    }
    if (name === "end") { readRawGroup(); return { t: "ord", text: "" }; }
    if (name === "lbrace") return { t: "ord", text: "{" };
    if (name === "rbrace") return { t: "ord", text: "}" };
    if (name === "langle") return { t: "ord", text: "⟨" };
    if (name === "rangle") return { t: "ord", text: "⟩" };
    if (name === "overset" || name === "stackrel") { const top = readGroup(); const base = readGroup(); return { t: "script", base, sup: top, over: true }; }
    if (name === "underset") { const bottom = readGroup(); const base = readGroup(); return { t: "script", base, sub: bottom, over: true }; }
    if (name === "\\" || name === "cr") return { t: "newline" };
    if ("{}%$#&_".includes(name)) return { t: "ord", text: name };
    if (name === "limits" || name === "nolimits" || name === "displaystyle" || name === "textstyle" || name === "scriptstyle") return { t: "ord", text: "" };
    // Unknown: show its name so something reads
    return { t: "text", text: name };
  }

  function readDelim() {
    if (eof()) return "";
    if (peek() === "\\") {
      i++;
      const cmd = readCommand();
      const key = `\\${cmd}`;
      return key in DELIMS ? DELIMS[key] : cmd === "|" ? "‖" : "";
    }
    const c = s[i++];
    return c in DELIMS ? DELIMS[c] : "";
  }

  function parseMatrix(env) {
    const brackets = { pmatrix: ["(", ")"], bmatrix: ["[", "]"], Bmatrix: ["{", "}"], vmatrix: ["|", "|"], Vmatrix: ["‖", "‖"], matrix: ["", ""], cases: ["{", ""], array: ["", ""], smallmatrix: ["", ""], aligned: ["", ""], align: ["", ""], gathered: ["", ""] }[env] || ["", ""];
    if (env === "array") readRawGroup();
    const rows = [[]];
    let cell = [];
    const endCell = () => { rows[rows.length - 1].push({ t: "seq", items: cell }); cell = []; };
    while (!eof()) {
      skipSpaces();
      if (s.startsWith("\\end", i)) {
        i += 4;
        readRawGroup();
        break;
      }
      if (peek() === "&") { i++; endCell(); continue; }
      if (s.startsWith("\\\\", i)) { i += 2; endCell(); rows.push([]); continue; }
      const node = parseAtom();
      if (!node) break;
      cell.push(attachScripts(node));
    }
    endCell();
    if (rows.length > 1 && rows[rows.length - 1].every((c) => !c.items.length)) rows.pop();
    return { t: "matrix", rows, left: brackets[0], right: brackets[1], cases: env === "cases", align: env === "aligned" || env === "align" };
  }

  function attachScripts(base) {
    let sub = null, sup = null;
    for (;;) {
      skipSpaces();
      if (peek() === "^" && !sup) { i++; sup = readGroup(); }
      else if (peek() === "_" && !sub) { i++; sub = readGroup(); }
      else if (peek() === "'" ) { i++; sup = sup ? { t: "seq", items: [sup, { t: "ord", text: "′" }] } : { t: "ord", text: "′" }; }
      else break;
    }
    return sub || sup ? { t: "script", base, sub, sup } : base;
  }

  function parseSeq(stop) {
    const items = [];
    while (!eof()) {
      skipSpaces();
      if (eof()) break;
      if (stop === "}" && peek() === "}") break;
      if (stop === "]" && peek() === "]") break;
      if (stop === "\\right" && s.startsWith("\\right", i)) break;
      if (peek() === "&" || s.startsWith("\\\\", i)) {
        if (stop === undefined) { i += peek() === "&" ? 1 : 2; items.push({ t: "newline" }); continue; }
      }
      const atom = parseAtom();
      if (atom === null) break;
      items.push(attachScripts(atom));
    }
    return { t: "seq", items };
  }

  return parseSeq();
}

// ---------- Boxes ----------
// A box: { w, a (above the baseline), d (below), cmds: [{ k:"text", x, y, text, size, italic?, bold?, color? } | { k:"line", x1,y1,x2,y2,width } | { k:"path", d:[…], width }] }
const FONT_SERIF = '"STIX Two Math", "Cambria Math", "Latin Modern Math", "Times New Roman", "DejaVu Serif", serif';
export const MATH_FONT = FONT_SERIF;

function defaultMeasure(text, size) {
  return Array.from(String(text)).length * size * 0.56;
}

const shift = (cmds, dx, dy) =>
  cmds.map((c) => {
    if (c.k === "text") return { ...c, x: c.x + dx, y: c.y + dy };
    if (c.k === "line") return { ...c, x1: c.x1 + dx, y1: c.y1 + dy, x2: c.x2 + dx, y2: c.y2 + dy };
    if (c.k === "path") return { ...c, d: c.d.map((p) => (p.length === 2 ? [p[0] + dx, p[1] + dy] : p.length === 4 ? [p[0] + dx, p[1] + dy, p[2] + dx, p[3] + dy] : [p[0] + dx, p[1] + dy, p[2] + dx, p[3] + dy, p[4] + dx, p[5] + dy])) };
    return c;
  });

export function layoutMath(tex, size = 20, measure = defaultMeasure) {
  const tree = typeof tex === "string" ? parseTeX(tex) : tex;
  const m = (text, sz, style) => measure(text, sz, style);

  const glyph = (text, sz, { italic = false, bold = false } = {}) => ({
    w: m(text, sz, { italic, bold }),
    a: sz * 0.74,
    d: sz * 0.22,
    cmds: [{ k: "text", x: 0, y: 0, text, size: sz, italic, bold }],
  });
  const hbox = (parts, gap = 0) => {
    let x = 0, a = 0, d = 0;
    const cmds = [];
    for (const p of parts) {
      cmds.push(...shift(p.cmds, x, 0));
      x += p.w + gap;
      a = Math.max(a, p.a);
      d = Math.max(d, p.d);
    }
    return { w: Math.max(0, x - (parts.length ? gap : 0)), a, d, cmds };
  };
  const space = (w) => ({ w, a: 0, d: 0, cmds: [] });

  function box(node, sz, st = {}) {
    if (!node) return space(0);
    switch (node.t) {
      case "seq": {
        const parts = [];
        let prev = null;
        for (const it of node.items) {
          if (it.t === "newline") { parts.push({ newline: true }); prev = null; continue; }
          // Space around relations and binary operators, but not at the start of a group ("−x")
          const kind = it.t === "script" ? it.base?.t : it.t;
          if (kind === "rel" && prev) parts.push(space(sz * 0.28));
          if (kind === "bin" && prev && prev !== "bin" && prev !== "rel") parts.push(space(sz * 0.2));
          parts.push(box(it, sz, st));
          if (kind === "rel") parts.push(space(sz * 0.28));
          if (kind === "bin" && prev && prev !== "bin" && prev !== "rel") parts.push(space(sz * 0.2));
          prev = kind;
        }
        // Lines (\\ in a formula) stack
        if (parts.some((p) => p.newline)) {
          const rows = [[]];
          for (const p of parts) (p.newline ? rows.push([]) : rows[rows.length - 1].push(p));
          return vstack(rows.map((r) => hbox(r)), sz * 0.4, "left");
        }
        return hbox(parts);
      }
      case "num":
        return glyph(node.text, sz, { bold: st.bold });
      case "var":
        return glyph(node.text, sz, { italic: !node.upright && !st.upright && st.italic !== false, bold: st.bold });
      case "ord":
        return node.text === " " ? space(sz * 0.28) : glyph(node.text, sz, { bold: st.bold });
      case "rel":
      case "bin":
        return glyph(node.text, sz, { bold: st.bold });
      case "space":
        return space(node.em * sz);
      case "text":
        return glyph(node.text, sz, { bold: st.bold });
      case "styled":
        return box(node.body, sz, { ...st, bold: node.bold ?? st.bold, italic: node.italic ?? st.italic, upright: false });
      case "func": {
        const g = glyph(node.text, sz, { bold: st.bold });
        return hbox([g, space(sz * 0.14)]);
      }
      case "big": {
        const big = glyph(node.text, sz * (node.name === "int" || node.name.startsWith("i") || node.name === "oint" ? 1.5 : 1.35));
        big.a = sz * 0.95;
        big.d = sz * 0.55;
        return big;
      }
      case "frac": {
        const n = box(node.num, sz * 0.88, st);
        const dn = box(node.den, sz * 0.88, st);
        const pad = sz * 0.14;
        const w = Math.max(n.w, dn.w) + pad * 2;
        const axis = sz * 0.3;
        const gap = sz * 0.1;
        const barW = Math.max(1, sz * 0.055);
        const cmds = [
          ...shift(n.cmds, (w - n.w) / 2, -(axis + gap + n.d)),
          ...shift(dn.cmds, (w - dn.w) / 2, -axis + gap + dn.a),
        ];
        if (node.bar !== false) cmds.push({ k: "line", x1: 0, y1: -axis, x2: w, y2: -axis, width: barW });
        return { w, a: axis + gap + n.d + n.a, d: Math.max(0, -axis + gap + dn.a + dn.d), cmds };
      }
      case "sqrt": {
        const body = box(node.body, sz, st);
        const idx = node.index ? box(node.index, sz * 0.6, st) : null;
        const rad = sz * 0.62;
        const top = body.a + sz * 0.16;
        const bar = Math.max(1, sz * 0.05);
        const x0 = idx ? Math.max(0, idx.w - rad * 0.3) : 0;
        const bx = x0 + rad;
        const cmds = [
          { k: "path", width: bar, d: [[x0, -top * 0.45], [x0 + rad * 0.22, -top * 0.5], [x0 + rad * 0.5, body.d + sz * 0.05], [bx, -top]] },
          { k: "line", x1: bx, y1: -top, x2: bx + body.w + sz * 0.12, y2: -top, width: bar },
          ...shift(body.cmds, bx + sz * 0.06, 0),
        ];
        if (idx) cmds.push(...shift(idx.cmds, 0, -top * 0.55 - idx.d));
        return { w: bx + body.w + sz * 0.14, a: top + bar + (idx ? Math.max(0, idx.a + idx.d - top * 0.5) : 0), d: body.d, cmds };
      }
      case "accent": {
        const body = box(node.body, sz, st);
        const mark = glyph(node.mark, sz * 0.8);
        const raise = body.a + sz * (node.kind === "bar" || node.kind === "overline" ? 0.12 : 0.02);
        if (node.kind === "underline") {
          return { w: body.w, a: body.a, d: body.d + sz * 0.12, cmds: [...body.cmds, { k: "line", x1: 0, y1: body.d + sz * 0.08, x2: body.w, y2: body.d + sz * 0.08, width: Math.max(1, sz * 0.05) }] };
        }
        if (node.kind === "bar" || node.kind === "overline") {
          return { w: body.w, a: body.a + sz * 0.2, d: body.d, cmds: [...body.cmds, { k: "line", x1: 0, y1: -(body.a + sz * 0.12), x2: body.w, y2: -(body.a + sz * 0.12), width: Math.max(1, sz * 0.05) }] };
        }
        return { w: body.w, a: raise + sz * 0.3, d: body.d, cmds: [...body.cmds, ...shift(mark.cmds, (body.w - mark.w) / 2, -(raise - sz * 0.2))] };
      }
      case "script": {
        const base = box(node.base, sz, st);
        const sSz = sz * 0.68;
        const sub = node.sub ? box(node.sub, sSz, st) : null;
        const sup = node.sup ? box(node.sup, sSz, st) : null;
        const above = node.over || (node.base?.t === "big" && LIMITS_ABOVE.has(node.base.name)) || (node.base?.t === "func" && node.base.limits);
        if (above) {
          const w = Math.max(base.w, sub?.w || 0, sup?.w || 0);
          const cmds = [...shift(base.cmds, (w - base.w) / 2, 0)];
          let a = base.a, d = base.d;
          if (sup) { cmds.push(...shift(sup.cmds, (w - sup.w) / 2, -(base.a + sup.d + sz * 0.08))); a = base.a + sup.a + sup.d + sz * 0.1; }
          if (sub) { cmds.push(...shift(sub.cmds, (w - sub.w) / 2, base.d + sub.a + sz * 0.08)); d = base.d + sub.a + sub.d + sz * 0.1; }
          return { w, a, d, cmds };
        }
        const supUp = Math.max(sz * 0.42, base.a * 0.62);
        const subDown = Math.max(sz * 0.22, base.d + sz * 0.1);
        const both = sub && sup;
        const w = base.w + Math.max(sub?.w || 0, sup?.w || 0) + sz * 0.04;
        const cmds = [...base.cmds];
        let a = base.a, d = base.d;
        if (sup) { cmds.push(...shift(sup.cmds, base.w + sz * 0.03, -supUp - (both ? sz * 0.04 : 0))); a = Math.max(a, supUp + sup.a); }
        if (sub) { cmds.push(...shift(sub.cmds, base.w + sz * 0.03, subDown + (both ? sz * 0.06 : 0))); d = Math.max(d, subDown + sub.d); }
        return { w, a, d, cmds };
      }
      case "delim": {
        const body = box(node.body, sz, st);
        return fence(body, node.left, node.right, sz);
      }
      case "matrix": {
        const rows = node.rows.map((r) => r.map((c) => box(c, sz, st)));
        const cols = Math.max(...rows.map((r) => r.length), 1);
        const colW = Array.from({ length: cols }, (_, c) => Math.max(...rows.map((r) => r[c]?.w || 0)));
        const rowA = rows.map((r) => Math.max(sz * 0.7, ...r.map((b) => b.a)));
        const rowD = rows.map((r) => Math.max(sz * 0.2, ...r.map((b) => b.d)));
        const gapX = sz * (node.align ? 0.2 : 0.9);
        const gapY = sz * 0.35;
        const cmds = [];
        let y = 0;
        rows.forEach((r, ri) => {
          let x = 0;
          y += rowA[ri];
          r.forEach((b, ci) => {
            const left = node.align || node.cases ? 0 : (colW[ci] - b.w) / 2;
            cmds.push(...shift(b.cmds, x + (node.align && ci % 2 === 0 ? colW[ci] - b.w : left), y));
            x += colW[ci] + gapX;
          });
          y += rowD[ri] + gapY;
        });
        const total = y - gapY;
        const w = colW.reduce((s, v) => s + v, 0) + gapX * Math.max(0, cols - 1);
        const mid = total / 2;
        const body = { w, a: mid + sz * 0.3, d: total - mid - sz * 0.3, cmds: shift(cmds, 0, -mid + sz * 0.3) };
        return node.left || node.right ? fence(body, node.left, node.right, sz) : body;
      }
      default:
        return space(0);
    }
  }

  function vstack(boxes, gap, align = "center") {
    const w = Math.max(...boxes.map((b) => b.w), 0);
    let y = 0;
    const cmds = [];
    let first = true, firstA = 0;
    for (const b of boxes) {
      y += first ? b.a : b.a;
      cmds.push(...shift(b.cmds, align === "center" ? (w - b.w) / 2 : 0, y));
      if (first) { firstA = b.a; first = false; }
      y += b.d + gap;
    }
    const total = y - gap;
    return { w, a: firstA, d: total - firstA, cmds };
  }

  // Brackets that grow with what's inside
  function fence(body, left, right, sz) {
    const pen = Math.max(1, sz * 0.06);
    const top = -(body.a + sz * 0.1);
    const bottom = body.d + sz * 0.1;
    const mid = (top + bottom) / 2;
    const bw = Math.max(sz * 0.3, (bottom - top) * 0.09);
    const cmds = [];
    const draw = (ch, x) => {
      if (!ch) return;
      const line = (x1, y1, x2, y2) => cmds.push({ k: "line", x1, y1, x2, y2, width: pen });
      const path = (d) => cmds.push({ k: "path", width: pen, d });
      const hook = bw * 0.55;
      switch (ch) {
        case "(": path([[x + bw * 0.8, top], [x - bw * 0.3, mid, x + bw * 0.8, bottom]]); break;
        case ")": path([[x + bw * 0.2, top], [x + bw * 1.3, mid, x + bw * 0.2, bottom]]); break;
        case "[": path([[x + bw * 0.3 + hook, top], [x + bw * 0.3, top], [x + bw * 0.3, bottom], [x + bw * 0.3 + hook, bottom]]); break;
        case "]": path([[x + bw * 0.7 - hook, top], [x + bw * 0.7, top], [x + bw * 0.7, bottom], [x + bw * 0.7 - hook, bottom]]); break;
        case "⌊": path([[x + bw * 0.3, top], [x + bw * 0.3, bottom], [x + bw * 0.3 + hook, bottom]]); break;
        case "⌋": path([[x + bw * 0.7, top], [x + bw * 0.7, bottom], [x + bw * 0.7 - hook, bottom]]); break;
        case "⌈": path([[x + bw * 0.3 + hook, top], [x + bw * 0.3, top], [x + bw * 0.3, bottom]]); break;
        case "⌉": path([[x + bw * 0.7 - hook, top], [x + bw * 0.7, top], [x + bw * 0.7, bottom]]); break;
        case "|": case "∣": line(x + bw / 2, top, x + bw / 2, bottom); break;
        case "‖": line(x + bw * 0.35, top, x + bw * 0.35, bottom); line(x + bw * 0.65, top, x + bw * 0.65, bottom); break;
        case "{": path([[x + bw * 0.85, top], [x + bw * 0.4, top + (mid - top) * 0.15], [x + bw * 0.4, mid - (mid - top) * 0.2], [x + bw * 0.05, mid], [x + bw * 0.4, mid + (bottom - mid) * 0.2], [x + bw * 0.4, bottom - (bottom - mid) * 0.15], [x + bw * 0.85, bottom]]); break;
        case "}": path([[x + bw * 0.15, top], [x + bw * 0.6, top + (mid - top) * 0.15], [x + bw * 0.6, mid - (mid - top) * 0.2], [x + bw * 0.95, mid], [x + bw * 0.6, mid + (bottom - mid) * 0.2], [x + bw * 0.6, bottom - (bottom - mid) * 0.15], [x + bw * 0.15, bottom]]); break;
        case "⟨": path([[x + bw * 0.8, top], [x + bw * 0.2, mid], [x + bw * 0.8, bottom]]); break;
        case "⟩": path([[x + bw * 0.2, top], [x + bw * 0.8, mid], [x + bw * 0.2, bottom]]); break;
        case "/": line(x + bw * 0.8, top, x + bw * 0.2, bottom); break;
        default: cmds.push({ k: "text", x, y: mid + sz * 0.3, text: ch, size: sz });
      }
    };
    let x = 0;
    if (left) draw(left, 0);
    x = (left ? bw : 0) + sz * 0.05;
    cmds.push(...shift(body.cmds, x, 0));
    x += body.w + sz * 0.05;
    if (right) draw(right, x);
    const w = x + (right ? bw : 0);
    return { w, a: body.a + sz * 0.12, d: body.d + sz * 0.12, cmds };
  }

  const out = box(tree, size);
  return { ...out, size, tex: typeof tex === "string" ? tex : "" };
}

// Draws a laid-out formula; (x, y) is where its baseline starts (left). color: any canvas color.
export function drawMath(ctx, laid, x, y, { color = "#1e293b" } = {}) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  for (const c of laid.cmds) {
    if (c.k === "text") {
      ctx.font = `${c.italic ? "italic " : ""}${c.bold ? "bold " : ""}${Math.max(6, c.size)}px ${FONT_SERIF}`;
      ctx.fillText(c.text, x + c.x, y + c.y);
    } else if (c.k === "line") {
      ctx.lineWidth = c.width;
      ctx.beginPath();
      ctx.moveTo(x + c.x1, y + c.y1);
      ctx.lineTo(x + c.x2, y + c.y2);
      ctx.stroke();
    } else if (c.k === "path") {
      ctx.lineWidth = c.width;
      ctx.beginPath();
      c.d.forEach((p, i) => {
        if (i === 0) ctx.moveTo(x + p[0], y + p[1]);
        else if (p.length === 2) ctx.lineTo(x + p[0], y + p[1]);
        else if (p.length === 4) ctx.quadraticCurveTo(x + p[0], y + p[1], x + p[2], y + p[3]);
        else ctx.bezierCurveTo(x + p[0], y + p[1], x + p[2], y + p[3], x + p[4], y + p[5]);
      });
      ctx.stroke();
    }
  }
  ctx.restore();
}
