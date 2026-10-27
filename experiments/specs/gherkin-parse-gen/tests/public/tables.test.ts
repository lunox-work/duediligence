import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature, ParseError } from "../../src/index.js";

function feature(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

function assertParseError(text: string, line: number, message: string): void {
  assert.throws(
    () => parseFeature(text),
    (err: unknown) => {
      assert.ok(err instanceof ParseError, `expected a ParseError for ${JSON.stringify(text)}`);
      const e = err as ParseError;
      assert.equal(e.line, line, JSON.stringify(text));
      assert.equal(e.message, message, JSON.stringify(text));
      return true;
    },
  );
}

test("[happy-9] A table with blank lines, comments and an empty cell", () => {
  const text = feature(
    "Feature: F",
    "  Scenario: S",
    "    Given the prices:",
    "",
    "      # header next",
    "      |  item  | price |",
    "      | tea    |  2.50 |",
    "",
    "      | coffee |       |",
    "    Then done",
  );
  assert.deepEqual(parseFeature(text), {
    name: "F",
    background: null,
    scenarios: [
      {
        name: "S",
        line: 2,
        tags: [],
        steps: [
          {
            keyword: "Given",
            text: "the prices:",
            line: 3,
            docString: null,
            table: [
              ["item", "price"],
              ["tea", "2.50"],
              ["coffee", ""],
            ],
          },
          { keyword: "Then", text: "done", line: 10, docString: null, table: null },
        ],
      },
    ],
  });
});

test("[happy-9] boundary: single-cell rows belong to a Background step", () => {
  assert.deepEqual(parseFeature("Feature: F\nBackground:\nGiven t\n|a|\n|b|\nScenario: S\n"), {
    name: "F",
    background: [{ keyword: "Given", text: "t", line: 3, docString: null, table: [["a"], ["b"]] }],
    scenarios: [{ name: "S", line: 6, tags: [], steps: [] }],
  });
});

test("[boundary-5] Escapes in cells", () => {
  const text = feature("Feature: F", "  Scenario: S", "    Given cells", String.raw`      | a \| b | c\\d | e\nf | g\h |`);
  const stepOnLine3 = parseFeature(text).scenarios[0].steps.find((s) => s.line === 3);
  assert.deepEqual(stepOnLine3?.table, [["a | b", "c\\d", "e\nf", "g\\h"]]);
});

test("[boundary-5] boundary: escapes are decoded left to right after trimming", () => {
  const text = feature("Feature: F", "Scenario: S", "Given cells", String.raw`| \\n | \n | \t |`);
  const stepOnLine3 = parseFeature(text).scenarios[0].steps.find((s) => s.line === 3);
  assert.deepEqual(stepOnLine3?.table, [["\\n", "\n", "\\t"]]);
});

test("[unhappy-9] Malformed and misplaced table rows", () => {
  const rows: [string, number, string][] = [
    [
      "Feature: F\nScenario: S\nGiven x\n| a | b |\n| c |\n",
      5,
      "line 5: table row has the wrong number of cells: expected 2, found 1",
    ],
    ["Feature: F\nScenario: S\nGiven x\n| a | b\n", 4, 'line 4: table row must end with "|"'],
    ["Feature: F\nScenario: S\nGiven x\n|\n", 4, 'line 4: table row must end with "|"'],
    ["Feature: F\nScenario: S\nGiven x\n| a \\|\n", 4, 'line 4: table row must end with "|"'],
    ["Feature: F\nScenario: S\n| a |\n", 3, "line 3: table row must follow a step"],
    ["Feature: F\nBackground:\n| a |\n", 3, "line 3: table row must follow a step"],
    ["Feature: F\nScenario: S\nGiven x\n```\na\n```\n| a |\n", 7, "line 7: step already has a doc string"],
  ];
  assert.equal(rows[3][0].split("\n")[3], "| a \\|");
  for (const [text, line, message] of rows) assertParseError(text, line, message);
});

test("[unhappy-9] boundary: a later row with more cells than the first, after blank and comment lines", () => {
  assertParseError(
    "Feature: F\nScenario: S\nGiven x\n| a |\n\n# c\n| b | c | d |\n",
    7,
    "line 7: table row has the wrong number of cells: expected 1, found 3",
  );
});
