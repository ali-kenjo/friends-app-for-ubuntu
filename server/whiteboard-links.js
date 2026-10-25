// Which boards link to which: the links a board makes ([[Another board]] in its words), and the boards that link to it.
const whiteboard = require("./whiteboard");
const links = require("../src/js/whiteboard/links.mjs");

const MAX_BOARDS = 300;

// { outgoing: [{ title, id | null, count }], incoming: [{ id, title, count }] } for one board
function linksFor(boardId) {
  const doc = whiteboard.get(boardId);
  if (!doc) return null;
  const index = whiteboard.list().slice(0, MAX_BOARDS);
  const byTitle = new Map(index.map((b) => [String(b.title).toLowerCase(), b]));
  const mine = String(doc.title).toLowerCase();
  const outgoing = [...links.linksOfDoc(doc).entries()].map(([key, l]) => ({ title: l.title, id: byTitle.get(key)?.id || null, count: l.count }));
  const incoming = [];
  for (const b of index) {
    if (b.id === doc.id) continue;
    let other = null;
    try {
      other = whiteboard.get(b.id);
    } catch {}
    const hit = other && links.linksOfDoc(other).get(mine);
    if (hit) incoming.push({ id: b.id, title: b.title, count: hit.count });
  }
  return { outgoing, incoming };
}

module.exports = { linksFor };
