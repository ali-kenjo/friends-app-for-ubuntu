// CommonJS wrapper for whiteboard parser
let parserPromise = null;

async function getParser() {
  if (!parserPromise) {
    parserPromise = import("../src/js/whiteboard/parser.mjs");
  }
  return parserPromise;
}

async function parseWhiteboardBlocks(text) {
  const p = await getParser();
  const blocks = p.extractWhiteboardBlocks(text);
  const allCommands = [];
  for (const b of blocks) {
    const cmds = p.parseWhiteboardCommands(b);
    allCommands.push(...cmds);
  }
  return allCommands;
}

module.exports = {
  getParser,
  parseWhiteboardBlocks,
};
