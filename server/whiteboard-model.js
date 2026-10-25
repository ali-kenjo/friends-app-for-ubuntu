// The whiteboard document model for the helper: the very same code the page uses (src/js/whiteboard/*.mjs),
// so a board means the same thing to the page, the AI's tools and the files on disk.
const model = require("../src/js/whiteboard/model.mjs");
const ops = require("../src/js/whiteboard/ops.mjs");

// { x, y, width, height } of an item
function calculateItemBounds(item) {
  const b = model.getBoundingBox(item);
  return { x: b.minX, y: b.minY, width: b.width, height: b.height };
}

module.exports = {
  ...model,
  ...ops,
  calculateItemBounds,
  getModel: async () => model,
};
