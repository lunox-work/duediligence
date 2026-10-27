import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature } from "../../src/index.js";
import type { Step } from "../../src/index.js";

// Extends public "dedents doc strings and keeps keyword, comment and tag lines literal".
test("[boundary-1] treats every structural form inside a document as literal content", () => {
  const content = [
    "Given literal", "When literal", "Then literal", "And literal", "But literal", "* literal",
    "# literal comment", "@literal @alsoLiteral", "Background:", "Scenario: hidden",
    "Scenario Outline: hidden", "Feature: hidden", "| hidden | table |", "", "  deeper text  ",
  ];
  const lines = ["Feature: Opaque documents", "Scenario: Outer", "  But a document", '      """'];
  lines.push(...content.map((line) => `      ${line}`), '      """', "@real", "Scenario: Next", "* continue");
  const result = parseFeature(lines.join("\n"));
  assert.deepEqual(result, {
    name: "Opaque documents", background: null,
    scenarios: [
      {
        name: "Outer", line: 2, tags: [],
        steps: [{ keyword: "But", text: "a document", line: 3, docString: content, table: null }],
      },
      {
        name: "Next", line: content.length + 7, tags: ["@real"],
        steps: [{ keyword: "*", text: "continue", line: content.length + 8, docString: null, table: null }],
      },
    ],
  });
});

// Extends public "accepts an empty doc string with adjacent delimiters".
test("[boundary-1] distinguishes empty documents from absent documents in several sections", () => {
  assert.deepEqual(parseFeature([
    "Feature: Empty documents", "Background:", "Given shared document", '  """', '  """',
    "Scenario: First", "When empty input", '    """', '    """', "Then no attachment",
    "Scenario: Second", "* populated input", '"""', "one line", '"""',
    "And empty output", '\t"""', '\t"""',
  ].join("\r\n")), {
    name: "Empty documents",
    background: [{ keyword: "Given", text: "shared document", line: 3, docString: [], table: null }],
    scenarios: [
      {
        name: "First", line: 6, tags: [], steps: [
          { keyword: "When", text: "empty input", line: 7, docString: [], table: null },
          { keyword: "Then", text: "no attachment", line: 10, docString: null, table: null },
        ],
      },
      {
        name: "Second", line: 11, tags: [], steps: [
          { keyword: "*", text: "populated input", line: 12, docString: ["one line"], table: null },
          { keyword: "And", text: "empty output", line: 16, docString: [], table: null },
        ],
      },
    ],
  });
});

// Extends public "preserves blank doc string lines and removes tab indentation with CRLF".
test("[boundary-1] removes a mixed tab and space quote prefix while preserving remaining whitespace", () => {
  const prefix = " \t  \t";
  const result = parseFeature([
    "Feature: Mixed indentation", "Scenario: Exact whitespace", "\tGiven text", `${prefix}\"\"\"`,
    `${prefix}alpha  `, `${prefix}  nested`, "", prefix, `${prefix}\tomega\t`, `${prefix}\"\"\"`, "Then finish",
  ].join("\r\n"));
  assert.deepEqual(result.scenarios[0].steps, [
    {
      keyword: "Given", text: "text", line: 3,
      docString: ["alpha  ", "  nested", "", "", "\tomega\t"], table: null,
    },
    { keyword: "Then", text: "finish", line: 11, docString: null, table: null },
  ]);
});

// Extends public "dedents doc strings and keeps keyword, comment and tag lines literal".
test("[boundary-1] a zero-indent opener preserves leading spaces and tabs within its document", () => {
  const content = ["    first", "\t# still text", "  @stillText", '"', '""', "last  "];
  const result = parseFeature([
    "Feature: Zero indentation", "Scenario: Preserve content", "Given text", '"""',
    ...content, '"""', "Then done",
  ].join("\n"));
  assert.deepEqual(result.scenarios[0].steps, [
    { keyword: "Given", text: "text", line: 3, docString: content, table: null },
    { keyword: "Then", text: "done", line: content.length + 6, docString: null, table: null },
  ]);
});

// Extends public "attaches trimmed table rows to the preceding step only".
test("[boundary-1] keeps a large seven-column table and trims cells without changing internal text", () => {
  const rows: string[][] = [];
  const lines = ["Feature: Large table", "Scenario: Full matrix", "Given a matrix"];
  for (let i = 0; i < 180; i++) {
    const row = [`row ${i}`, "first  last", "", `東京 ${i}`, "@literal", "# literal", "Feature: literal"];
    rows.push(row);
    lines.push(`\t | ${row.map((cell) => `\t ${cell}  \t`).join(" | ")} |`);
  }
  lines.push("When inspected", "Then complete");
  assert.deepEqual(parseFeature(lines.join("\r\n")).scenarios[0].steps, [
    { keyword: "Given", text: "a matrix", line: 3, docString: null, table: rows },
    { keyword: "When", text: "inspected", line: 184, docString: null, table: null },
    { keyword: "Then", text: "complete", line: 185, docString: null, table: null },
  ]);
});

// Extends public "preserves empty table cells in a single CRLF row at end of input".
test("[boundary-1] retains all-empty rows and empty cells at every column position", () => {
  const result = parseFeature([
    "Feature: Empty cells", "Scenario: All positions", "But a table",
    "\t| | | | | |", "  |  | left | | right |\t|", "| first | | middle | | last |",
    "Scenario: Final table", "* another table", "| | |", "| x | |",
  ].join("\r\n"));
  assert.deepEqual(result.scenarios, [
    {
      name: "All positions", line: 2, tags: [], steps: [{
        keyword: "But", text: "a table", line: 3, docString: null,
        table: [["", "", "", "", ""], ["", "left", "", "right", ""], ["first", "", "middle", "", "last"]],
      }],
    },
    {
      name: "Final table", line: 7, tags: [],
      steps: [{ keyword: "*", text: "another table", line: 8, docString: null, table: [["", ""], ["x", ""]] }],
    },
  ]);
});

// Extends public "attaches trimmed table rows to the preceding step only"
// and "returns background steps separately from both scenarios".
test("[boundary-1] keeps background attachments separate from similarly shaped scenario attachments", () => {
  assert.deepEqual(parseFeature([
    "Feature: Shared payloads", "Background:", "Given shared text", '  """', "  shared", '  """',
    "And shared rows", " | key | value |", " | a | b |", "@local", "Scenario: Local payloads",
    "Given local rows", " | local | row |", "When local text", '\t"""', "\tlocal", '\t"""', "Then done",
  ].join("\n")), {
    name: "Shared payloads",
    background: [
      { keyword: "Given", text: "shared text", line: 3, docString: ["shared"], table: null },
      { keyword: "And", text: "shared rows", line: 7, docString: null, table: [["key", "value"], ["a", "b"]] },
    ],
    scenarios: [{
      name: "Local payloads", line: 11, tags: ["@local"], steps: [
        { keyword: "Given", text: "local rows", line: 12, docString: null, table: [["local", "row"]] },
        { keyword: "When", text: "local text", line: 14, docString: ["local"], table: null },
        { keyword: "Then", text: "done", line: 18, docString: null, table: null },
      ],
    }],
  });
});

// Extends public "dedents doc strings and keeps keyword, comment and tag lines literal".
test("[boundary-1] reads a long document without treating embedded headers as real sections", () => {
  const content: string[] = [];
  const forms = ["Given literal", "Feature: literal", "Scenario Outline: literal", "# literal", "@literal", "| cell |"];
  for (let i = 0; i < 160; i++) content.push(`${forms[i % forms.length]} ${i}`);
  const result = parseFeature([
    "Feature: Long document", "Scenario: Long", "Given payload", '   """',
    ...content.map((line) => `   ${line}`), '   """', "Then done", "Scenario: After", "And more",
  ].join("\r\n"));
  assert.equal(result.scenarios.length, 2);
  assert.deepEqual(result.scenarios[0].steps, [
    { keyword: "Given", text: "payload", line: 3, docString: content, table: null },
    { keyword: "Then", text: "done", line: 166, docString: null, table: null },
  ]);
  assert.equal(result.scenarios[1].line, 167);
  assert.deepEqual(result.scenarios[1].steps, [
    { keyword: "And", text: "more", line: 168, docString: null, table: null },
  ]);
});

// Extends public "attaches trimmed table rows to the preceding step only"
// and "accepts an empty doc string with adjacent delimiters".
test("[boundary-1] alternates documents tables and plain steps without leaking attachments", () => {
  const expected: Step[] = [];
  const lines = ["Feature: Attachment ownership", "Scenario: Alternating"];
  for (let i = 0; i < 18; i++) {
    lines.push(`And item ${i}`);
    const item: Step = { keyword: "And", text: `item ${i}`, line: lines.length, docString: null, table: null };
    if (i % 3 === 0) {
      lines.push('  """', `  document ${i}`, '  """');
      item.docString = [`document ${i}`];
    } else if (i % 3 === 1) {
      lines.push(`  | row ${i} |`, "  | | ");
      item.table = [[`row ${i}`], [""]];
    }
    expected.push(item);
  }
  assert.deepEqual(parseFeature(lines.join("\n")).scenarios[0].steps, expected);
});
