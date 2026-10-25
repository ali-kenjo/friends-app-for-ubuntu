// Changes to a board, as small operations. Both of you (and the AI) edit one board at the same time by sending
// operations instead of whole boards: "add this item", "move these", "tick that box". Two edits to different things
// never get in each other's way, and the helper decides the order, so everyone ends up with the same board.
//
// applyOps(doc, ops, { actor }) changes the document in place and returns what happened:
//   applied   the operations as they were really done (ids filled in, values cleaned): this is what gets shared
//   inverse   operations that undo them, in the order to apply
//   errors    the ones that could not be done, and why
// Pure (no page, no helper): the page, the helper and the tests all use it.
import {
  ACTORS, LIMITS, ITEM_TYPES, ID_PATTERN, getBoundingBox, itemLabel, createPage, sanitizeDocSettings, sanitizeItem, translateItem, genId,
} from "./model.mjs";
import { refreshConnectors } from "./connectors.mjs";
import { textLayout, checklistLayout, tableLayout } from "./render.mjs";

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const PROTECTED = new Set(["id", "type", "author", "createdAt"]);

export const OP_NAMES = ["add", "update", "remove", "translate", "reorder", "clear", "restore", "check", "page_add", "page_remove", "page_restore", "page_update", "page_move", "doc_update", "focus"];

// The page an operation means: by id, by number (0 is the first), or the one the board is showing
export function pageOf(doc, ref) {
  if (!doc?.pages?.length) return null;
  if (typeof ref === "string") return doc.pages.find((p) => p.id === ref) || null;
  if (typeof ref === "number" && Number.isInteger(ref)) return doc.pages[ref] || null;
  return doc.pages[Math.max(0, Math.min(doc.pages.length - 1, doc.activePageIndex || 0))];
}

export function findItem(doc, id, pageRef) {
  if (typeof id !== "string") return null;
  const first = pageRef !== undefined ? pageOf(doc, pageRef) : null;
  const pages = first ? [first, ...doc.pages.filter((p) => p !== first)] : doc.pages;
  for (const page of pages) {
    const index = page.items.findIndex((it) => it.id === id);
    if (index >= 0) return { page, index, item: page.items[index] };
  }
  return null;
}

function allIds(doc) {
  const ids = new Set();
  for (const p of doc.pages) {
    ids.add(p.id);
    for (const it of p.items) ids.add(it.id);
  }
  return ids;
}

// Text, checklists and tables are as tall as their words need: worked out when they're made or changed (and not
// when the one who made them said how tall)
const GROWS = new Set(["text", "checklist", "table"]);
function fitHeight(item) {
  if (item.type === "text") item.height = Math.max(item.height || 0, Math.ceil(textLayout(null, item).height));
  else if (item.type === "checklist") item.height = Math.max(item.height || 0, checklistLayout(null, item).height);
  else if (item.type === "table") item.height = tableLayout(null, item).height;
  return item;
}

const brief = (it) => (it ? { id: it.id, type: it.type, label: itemLabel(it, 50) } : null);

// ops: one operation or a list. opts.actor: user | ai | mission (who is doing it, which marks what they add)
export function applyOps(doc, ops, { actor = "user", now = Date.now() } = {}) {
  const who = ACTORS.includes(actor) ? actor : "user";
  const list = Array.isArray(ops) ? ops : [ops];
  const result = { applied: [], inverse: [], errors: [], changed: false, touched: new Set(), pages: new Set(), briefs: [] };
  let ids = null;
  const used = () => (ids ||= allIds(doc));
  const connectorPages = new Set();

  const fail = (op, message) => result.errors.push({ op: op?.op || String(op), error: message });
  const done = (op, inverse, touched = [], page = null) => {
    result.applied.push(op);
    if (inverse) result.inverse.push(...(Array.isArray(inverse) ? inverse : [inverse]));
    for (const id of touched) result.touched.add(id);
    if (page) {
      result.pages.add(page.id);
      connectorPages.add(page);
    }
    result.changed = true;
  };
  // An AI or a mission can't change what you locked
  const blocked = (item) => item?.locked && who !== "user";

  for (const raw of list) {
    if (!raw || typeof raw !== "object" || typeof raw.op !== "string") {
      fail(raw, "Not an operation.");
      continue;
    }
    try {
      switch (raw.op) {
        case "add": {
          const page = pageOf(doc, raw.page);
          if (!page) { fail(raw, "No such page."); break; }
          if (page.items.length >= LIMITS.itemsPerPage) { fail(raw, "The page is full."); break; }
          if (!raw.item || typeof raw.item !== "object") { fail(raw, "Nothing to add."); break; }
          const item = sanitizeItem({ ...raw.item, author: raw.keepAuthor ? raw.item.author : who, createdAt: raw.keepAuthor ? raw.item.createdAt : now, updatedAt: now });
          if (GROWS.has(item.type) && (raw.item.height === undefined || item.type === "table")) fitHeight(item);
          if (used().has(item.id)) item.id = uniqueId(item.type, used());
          used().add(item.id);
          let index = Number.isInteger(raw.index) ? Math.max(0, Math.min(page.items.length, raw.index)) : raw.at === "back" ? 0 : page.items.length;
          page.items.splice(index, 0, item);
          done({ op: "add", page: page.id, item, index, ...(raw.keepAuthor ? { keepAuthor: true } : {}) }, { op: "remove", page: page.id, id: item.id }, [item.id], page);
          result.briefs.push({ verb: "added", ...brief(item) });
          break;
        }
        case "update": {
          const found = findItem(doc, raw.id, raw.page);
          if (!found) { fail(raw, "No such item."); break; }
          if (blocked(found.item) && !(Object.keys(raw.set || {}).every((k) => k === "locked"))) { fail(raw, "That item is locked."); break; }
          const set = {};
          for (const [k, v] of Object.entries(raw.set && typeof raw.set === "object" ? raw.set : {})) if (!PROTECTED.has(k)) set[k] = v;
          if (!Object.keys(set).length) { fail(raw, "Nothing to change."); break; }
          const before = {};
          for (const k of Object.keys(set)) before[k] = found.item[k] === undefined ? null : clone(found.item[k]);
          const next = { ...found.item, ...set, updatedAt: now };
          for (const k of Object.keys(set)) if (set[k] === null) delete next[k];
          const updated = sanitizeItem({ ...next, id: found.item.id, type: found.item.type, author: found.item.author, createdAt: found.item.createdAt });
          if (GROWS.has(updated.type) && set.height === undefined) {
            if (updated.type !== "text" || ["text", "width", "fontSize", "format", "fontFamily"].some((k) => k in set)) {
              updated.height = found.item.height; // start from the old height, grow if the words need more
              fitHeight(updated);
              if (updated.type === "text" && "text" in set) updated.height = Math.ceil(textLayout(null, { ...updated, height: 0 }).height);
            }
          }
          found.page.items[found.index] = updated;
          // What really changed (cleaned values), so the inverse and the share agree
          const clean = {};
          const back = {};
          for (const k of Object.keys(set)) {
            clean[k] = updated[k] === undefined ? null : clone(updated[k]);
            back[k] = before[k];
          }
          if (updated.height !== found.item.height && !("height" in clean)) {
            clean.height = updated.height;
            back.height = found.item.height;
          }
          done({ op: "update", page: found.page.id, id: updated.id, set: clean }, { op: "update", page: found.page.id, id: updated.id, set: back }, [updated.id], found.page);
          result.briefs.push({ verb: "changed", ...brief(updated), fields: Object.keys(set) });
          break;
        }
        case "remove": {
          const wanted = Array.isArray(raw.ids) ? raw.ids : [raw.id];
          const removed = [];
          const errorsBefore = result.errors.length;
          for (const id of wanted) {
            const found = findItem(doc, id, raw.page);
            if (!found) continue;
            if (blocked(found.item)) { fail({ op: "remove", id }, "That item is locked."); continue; }
            found.page.items.splice(found.index, 1);
            removed.push({ page: found.page, item: found.item, index: found.index });
          }
          if (!removed.length) { if (result.errors.length === errorsBefore) fail(raw, "No such item."); break; }
          // Back to front, so each goes back where it was
          const inverse = removed.slice().reverse().map((r) => ({ op: "add", page: r.page.id, item: r.item, index: r.index, keepAuthor: true }));
          for (const r of removed) result.briefs.push({ verb: "removed", ...brief(r.item) });
          for (const r of removed) used().delete(r.item.id);
          const page = removed[0].page;
          done({ op: "remove", ids: removed.map((r) => r.item.id), page: page.id }, inverse, removed.map((r) => r.item.id), page);
          for (const r of removed) { result.pages.add(r.page.id); connectorPages.add(r.page); }
          break;
        }
        case "translate": {
          const dx = Number(raw.dx);
          const dy = Number(raw.dy);
          if (!Number.isFinite(dx) || !Number.isFinite(dy)) { fail(raw, "Move by numbers."); break; }
          const moved = [];
          let page = null;
          for (const id of Array.isArray(raw.ids) ? raw.ids : [raw.id]) {
            const found = findItem(doc, id, raw.page);
            if (!found || blocked(found.item)) continue;
            translateItem(found.item, dx, dy);
            found.item.updatedAt = now;
            moved.push(found.item.id);
            page ||= found.page;
          }
          if (!moved.length) { fail(raw, "No such item."); break; }
          done({ op: "translate", page: page.id, ids: moved, dx, dy }, { op: "translate", page: page.id, ids: moved, dx: -dx, dy: -dy }, moved, page);
          result.briefs.push({ verb: "moved", count: moved.length, ids: moved });
          break;
        }
        case "reorder": {
          const found = findItem(doc, raw.id, raw.page);
          if (!found) { fail(raw, "No such item."); break; }
          const page = found.page;
          const last = page.items.length - 1;
          let to = found.index;
          const a = raw.to;
          if (Number.isInteger(a)) to = Math.max(0, Math.min(last, a));
          else if (a === "front" || a === "bring_to_front") to = last;
          else if (a === "back" || a === "send_to_back") to = 0;
          else if (a === "forward" || a === "bring_forward") to = Math.min(last, found.index + 1);
          else if (a === "backward" || a === "send_backward") to = Math.max(0, found.index - 1);
          else { fail(raw, "Move it to the front, the back, forward or backward."); break; }
          if (to === found.index) break;
          page.items.splice(found.index, 1);
          page.items.splice(to, 0, found.item);
          done({ op: "reorder", page: page.id, id: found.item.id, to }, { op: "reorder", page: page.id, id: found.item.id, to: found.index }, [found.item.id], page);
          break;
        }
        case "clear": {
          const page = pageOf(doc, raw.page);
          if (!page) { fail(raw, "No such page."); break; }
          const gone = [];
          const kept = [];
          page.items.forEach((it, index) => (blocked(it) ? kept.push(it) : gone.push({ item: it, index })));
          if (!gone.length) break;
          page.items = kept;
          for (const g of gone) used().delete(g.item.id);
          done({ op: "clear", page: page.id, ids: gone.map((g) => g.item.id) }, { op: "restore", page: page.id, items: gone.map((g) => ({ item: g.item, index: g.index })) }, gone.map((g) => g.item.id), page);
          result.briefs.push({ verb: "cleared", count: gone.length });
          break;
        }
        case "restore": {
          const page = pageOf(doc, raw.page);
          if (!page) { fail(raw, "No such page."); break; }
          const restored = [];
          for (const entry of Array.isArray(raw.items) ? raw.items : []) {
            const src = entry && entry.item ? entry : { item: entry };
            if (!src.item || page.items.length >= LIMITS.itemsPerPage) continue;
            const item = sanitizeItem({ ...src.item, updatedAt: now });
            if (used().has(item.id)) item.id = uniqueId(item.type, used());
            used().add(item.id);
            const index = Number.isInteger(src.index) ? Math.max(0, Math.min(page.items.length, src.index)) : page.items.length;
            page.items.splice(index, 0, item);
            restored.push(item);
          }
          if (!restored.length) break;
          done({ op: "restore", page: page.id, items: restored.map((it) => ({ item: it })) }, { op: "remove", page: page.id, ids: restored.map((it) => it.id) }, restored.map((it) => it.id), page);
          break;
        }
        case "check": {
          const found = findItem(doc, raw.id, raw.page);
          if (!found || found.item.type !== ITEM_TYPES.CHECKLIST) { fail(raw, "No such checklist."); break; }
          const entries = found.item.items || [];
          const entry = typeof raw.item === "string" ? entries.find((e) => e.id === raw.item) : Number.isInteger(raw.index) ? entries[raw.index] : null;
          if (!entry) { fail(raw, "No such line in that checklist."); break; }
          const was = Boolean(entry.checked);
          const checked = raw.checked === "toggle" || raw.checked === undefined ? !was : Boolean(raw.checked);
          if (checked === was) break;
          entry.checked = checked;
          found.item.updatedAt = now;
          done({ op: "check", page: found.page.id, id: found.item.id, item: entry.id, checked }, { op: "check", page: found.page.id, id: found.item.id, item: entry.id, checked: was }, [found.item.id], found.page);
          result.briefs.push({ verb: checked ? "ticked" : "unticked", ...brief(found.item), line: entry.text });
          break;
        }
        case "page_add": {
          if (doc.pages.length >= LIMITS.pages) { fail(raw, "Too many pages."); break; }
          const spec = raw.page && typeof raw.page === "object" ? raw.page : {};
          const page = createPage({ ...spec, items: [], name: spec.name || spec.title || `Page ${doc.pages.length + 1}` });
          if (used().has(page.id)) page.id = uniqueId("page", used());
          used().add(page.id);
          const index = Number.isInteger(raw.index) ? Math.max(0, Math.min(doc.pages.length, raw.index)) : doc.pages.length;
          doc.pages.splice(index, 0, page);
          const oldFocus = doc.activePageIndex;
          if (raw.focus !== false) doc.activePageIndex = index;
          else if (index <= oldFocus) doc.activePageIndex = oldFocus + 1;
          done({ op: "page_add", page: { id: page.id, name: page.name, background: page.background, createdAt: page.createdAt }, index, focus: raw.focus !== false }, [{ op: "page_remove", page: page.id, focusTo: oldFocus }], [page.id], null);
          result.pages.add(page.id);
          result.briefs.push({ verb: "added a page", id: page.id, type: "page", label: page.name });
          break;
        }
        case "page_remove": {
          if (doc.pages.length <= 1) { fail(raw, "A board keeps at least one page."); break; }
          const page = pageOf(doc, raw.page);
          if (!page || typeof raw.page === "undefined") { fail(raw, "No such page."); break; }
          const index = doc.pages.indexOf(page);
          if (page.items.some((it) => blocked(it))) { fail(raw, "That page has locked items."); break; }
          doc.pages.splice(index, 1);
          const oldFocus = doc.activePageIndex;
          if (Number.isInteger(raw.focusTo)) doc.activePageIndex = Math.max(0, Math.min(doc.pages.length - 1, raw.focusTo));
          else doc.activePageIndex = Math.max(0, Math.min(doc.pages.length - 1, index <= oldFocus ? Math.max(0, oldFocus - 1) : oldFocus));
          used().delete(page.id);
          for (const it of page.items) used().delete(it.id);
          done({ op: "page_remove", page: page.id }, [{ op: "page_restore", page, index, focusTo: oldFocus }], [page.id], null);
          result.pages.add(page.id);
          result.briefs.push({ verb: "removed a page", id: page.id, type: "page", label: page.name });
          break;
        }
        case "page_restore": {
          if (!raw.page || typeof raw.page !== "object" || doc.pages.length >= LIMITS.pages) { fail(raw, "Nothing to restore."); break; }
          const page = createPage(raw.page);
          if (used().has(page.id)) page.id = uniqueId("page", used());
          used().add(page.id);
          for (const it of page.items) used().add(it.id);
          const index = Number.isInteger(raw.index) ? Math.max(0, Math.min(doc.pages.length, raw.index)) : doc.pages.length;
          doc.pages.splice(index, 0, page);
          if (Number.isInteger(raw.focusTo)) doc.activePageIndex = Math.max(0, Math.min(doc.pages.length - 1, raw.focusTo));
          done({ op: "page_restore", page, index, focusTo: doc.activePageIndex }, [{ op: "page_remove", page: page.id }], [page.id], page);
          break;
        }
        case "page_update": {
          const page = pageOf(doc, raw.page);
          if (!page || typeof raw.page === "undefined") { fail(raw, "No such page."); break; }
          const set = raw.set && typeof raw.set === "object" ? raw.set : {};
          const before = {};
          const clean = {};
          if (typeof set.name === "string") {
            before.name = page.name;
            page.name = createPage({ name: set.name }).name;
            clean.name = page.name;
          }
          if (set.background && typeof set.background === "object") {
            before.background = clone(page.background);
            page.background = createPage({ background: { ...page.background, ...set.background } }).background;
            clean.background = clone(page.background);
          }
          if (!Object.keys(clean).length) break;
          done({ op: "page_update", page: page.id, set: clean }, { op: "page_update", page: page.id, set: before }, [page.id], null);
          result.pages.add(page.id);
          break;
        }
        case "page_move": {
          const page = pageOf(doc, raw.page);
          if (!page || typeof raw.page === "undefined" || !Number.isInteger(raw.to)) { fail(raw, "No such page."); break; }
          const from = doc.pages.indexOf(page);
          const to = Math.max(0, Math.min(doc.pages.length - 1, raw.to));
          if (to === from) break;
          const focused = doc.pages[doc.activePageIndex];
          doc.pages.splice(from, 1);
          doc.pages.splice(to, 0, page);
          doc.activePageIndex = Math.max(0, doc.pages.indexOf(focused));
          done({ op: "page_move", page: page.id, to }, { op: "page_move", page: page.id, to: from }, [page.id], null);
          result.pages.add(page.id);
          break;
        }
        case "doc_update": {
          const set = raw.set && typeof raw.set === "object" ? raw.set : {};
          const before = {};
          const clean = {};
          if (typeof set.title === "string" && set.title.trim()) {
            before.title = doc.title;
            doc.title = set.title.trim().slice(0, LIMITS.title);
            clean.title = doc.title;
          }
          if (set.settings && typeof set.settings === "object") {
            before.settings = clone(doc.settings);
            doc.settings = sanitizeDocSettings({ ...doc.settings, ...set.settings });
            clean.settings = clone(doc.settings);
          }
          if (!Object.keys(clean).length) break;
          done({ op: "doc_update", set: clean }, { op: "doc_update", set: before }, [], null);
          break;
        }
        case "focus": {
          const page = pageOf(doc, raw.page);
          if (!page || typeof raw.page === "undefined") { fail(raw, "No such page."); break; }
          const index = doc.pages.indexOf(page);
          if (index === doc.activePageIndex) break;
          const was = doc.activePageIndex;
          doc.activePageIndex = index;
          done({ op: "focus", page: page.id }, { op: "focus", page: doc.pages[was]?.id }, [], null);
          break;
        }
        default:
          fail(raw, `Unknown operation "${String(raw.op).slice(0, 30)}".`);
      }
    } catch (err) {
      fail(raw, err.message);
    }
  }

  for (const page of connectorPages) {
    if (doc.pages.includes(page)) for (const id of refreshConnectors(page)) result.touched.add(id);
  }
  result.inverse.reverse();
  result.touched = [...result.touched];
  result.pages = [...result.pages];
  if (result.changed) doc.updatedAt = now;
  return result;
}

function uniqueId(type, taken) {
  for (let i = 0; i < 20; i++) {
    const id = genId(type);
    if (!taken.has(id)) return id;
  }
  return `${genId(type)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export const validId = (id) => typeof id === "string" && ID_PATTERN.test(id);

// How big an operation list may be in one go
export const MAX_OPS = 400;

// Everything of one page worth keeping when it is thrown away or restored
export const pageCopy = (page) => clone(page);

export { getBoundingBox };
