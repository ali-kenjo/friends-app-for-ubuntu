const { test, describe } = require("node:test");
const assert = require("node:assert");

describe("Whiteboard fenced block parser & DSL", async () => {
  const {
    extractWhiteboardBlocks,
    parseWhiteboardCommands,
  } = await import("../src/js/whiteboard/parser.mjs");

  test("extracts fenced whiteboard and wb blocks from markdown text", () => {
    const markdown = `
Here is what we should draw:

\`\`\`whiteboard
text [100, 50] System Architecture
rect [100, 100, 140, 80]
\`\`\`

And also a quick note:
\`\`\`wb
sticky [300, 100] Deploy on Friday
\`\`\`
`;
    const blocks = extractWhiteboardBlocks(markdown);
    assert.strictEqual(blocks.length, 2);
    assert.match(blocks[0], /System Architecture/);
    assert.match(blocks[1], /Deploy on Friday/);
  });

  test("parses DSL lines into model action objects", () => {
    const dsl = `
# This is a comment
text [40, 60] Launch Checklist
checklist [40, 120] Review code | Run tests | Push commit
sticky [260, 60] Don't forget docs!
rect [40, 40, 400, 260]
arrow [100, 100] -> [200, 100]
point [150, 100]
clear
`;
    const commands = parseWhiteboardCommands(dsl);
    assert.strictEqual(commands.length, 7);

    assert.strictEqual(commands[0].action, "add_item");
    assert.strictEqual(commands[0].item.type, "text");
    assert.strictEqual(commands[0].item.text, "Launch Checklist");

    assert.strictEqual(commands[1].action, "add_item");
    assert.strictEqual(commands[1].item.type, "checklist");
    assert.strictEqual(commands[1].item.items.length, 3);

    assert.strictEqual(commands[2].action, "add_item");
    assert.strictEqual(commands[2].item.type, "sticky");

    assert.strictEqual(commands[3].action, "add_item");
    assert.strictEqual(commands[3].item.type, "shape");
    assert.strictEqual(commands[3].item.shapeType, "rect");

    assert.strictEqual(commands[4].action, "add_item");
    assert.strictEqual(commands[4].item.type, "shape");
    assert.strictEqual(commands[4].item.shapeType, "arrow");

    assert.strictEqual(commands[5].action, "point_at");
    assert.strictEqual(commands[5].x, 150);
    assert.strictEqual(commands[5].y, 100);

    assert.strictEqual(commands[6].action, "clear");
  });

  test("parses structured JSON lines seamlessly", () => {
    const jsonLines = `
{"op": "write_text", "text": "Formulas", "x": 50, "y": 30, "format": "math"}
{"op": "draw_shape", "shape": "circle", "x": 100, "y": 100, "w": 60, "h": 60}
{"op": "add_sticky", "title": "Priority", "text": "Urgent bug", "color": "#fbcfe8"}
{"op": "draw_diagram", "syntax": "mermaid", "code": "graph TD; A-->B;"}
`;
    const commands = parseWhiteboardCommands(jsonLines);
    assert.strictEqual(commands.length, 4);
    assert.strictEqual(commands[0].item.format, "math");
    assert.strictEqual(commands[1].item.shapeType, "circle");
    assert.strictEqual(commands[2].item.color, "#fbcfe8");
    assert.strictEqual(commands[3].item.type, "diagram");
  });

  test("fuzz testing on hostile, corrupted, and malformed inputs", () => {
    const hostileInputs = [
      "",
      null,
      undefined,
      12345,
      {},
      "```whiteboard",
      "```whiteboard\n",
      "text",
      "text [NaN, Infinity] foo",
      "rect [-999999999, -999999999, -100, -100]",
      "checklist [,,,] |||||",
      "arrow [] -> []",
      "sticky []",
      '{"op": "write_text", "text": "' + "A".repeat(10000) + '"}',
      '{"__proto__": {"polluted": true}}',
      "<script>alert(1)</script>",
      "\x00\x01\x02\x03\x04\x05",
      "point [abc, def]",
    ];

    for (const input of hostileInputs) {
      assert.doesNotThrow(() => {
        const blocks = extractWhiteboardBlocks(input);
        for (const b of blocks) {
          parseWhiteboardCommands(b);
        }
        if (typeof input === "string") {
          parseWhiteboardCommands(input);
        }
      }, `Fuzzer failed on input: ${typeof input === "string" ? input.slice(0, 30) : input}`);
    }
    assert.strictEqual(Object.prototype.polluted, undefined, "Prototype pollution prevented");
  });
});
