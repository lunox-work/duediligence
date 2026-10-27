import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature, ParseError, type Feature, type Step } from "../../src/index.js";

function feature(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

function stepOnLine(f: Feature, line: number): Step | undefined {
  const steps = [...(f.background ?? []), ...f.scenarios.flatMap((s) => s.steps)];
  return steps.find((s) => s.line === line);
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

test("[happy-10] Indentation is removed relative to the opening delimiter", () => {
  const text = feature(
    "Feature: F",
    "  Scenario: S",
    "    Given a document",
    "      ```json",
    "      {",
    '        "a": 1',
    "     }",
    "",
    "      ```",
  );
  const s = stepOnLine(parseFeature(text), 3);
  assert.deepEqual(s?.docString, ["{", '  "a": 1', "}", ""]);
  assert.equal(s?.table, null);
});

test("[happy-10] boundary: an unindented delimiter keeps all of the content's indentation", () => {
  const s = stepOnLine(parseFeature("Feature: F\nScenario: S\nGiven x\n```\n  a\n```\n"), 3);
  assert.deepEqual(s?.docString, ["  a"]);
  assert.equal(s?.table, null);
});

test("[happy-11] Content is not interpreted", () => {
  const text = feature(
    "Feature: F",
    "  Scenario: S",
    "    Given a note",
    '      """',
    "      # not a comment",
    "      Scenario: not a scenario",
    "      | not | a table |",
    "      ```",
    '      """',
    "    Then done",
  );
  const result = parseFeature(text);
  assert.deepEqual(
    result.scenarios.map((s) => ({ name: s.name, line: s.line, tags: s.tags })),
    [{ name: "S", line: 2, tags: [] }],
  );
  assert.deepEqual(
    result.scenarios[0].steps.map((s) => ({ keyword: s.keyword, text: s.text, line: s.line })),
    [
      { keyword: "Given", text: "a note", line: 3 },
      { keyword: "Then", text: "done", line: 10 },
    ],
  );
  assert.deepEqual(stepOnLine(result, 3)?.docString, [
    "# not a comment",
    "Scenario: not a scenario",
    "| not | a table |",
    "```",
  ]);
  assert.equal(stepOnLine(result, 10)?.docString, null);
});

test("[happy-11] boundary: Feature, Scenario Outline, tag and blank lines inside a doc string are content", () => {
  const result = parseFeature("Feature: F\nScenario: S\nGiven x\n```\nFeature: G\nScenario Outline: O\n@t\n\n```\n");
  assert.deepEqual(stepOnLine(result, 3)?.docString, ["Feature: G", "Scenario Outline: O", "@t", ""]);
});

test("[boundary-6] Doc string edge cases", () => {
  const rows: [string, string[]][] = [
    ["Feature: F\nScenario: S\nGiven x\n```\n```\n", []],
    ["Feature: F\r\nScenario: S\r\nGiven x\r\n    \"\"\"\r\n    a  \r\n    \"\"\"\r\n", ["a  "]],
    ["Feature: F\nScenario: S\nGiven x\n\t```\n\t\tdeep\n  two\n\t```\n", ["\tdeep", " two"]],
    ["Feature: F\nScenario: S\nGiven x\n\n# c\n```\na\n```\n", ["a"]],
    ["Feature: F\nScenario: S\nGiven x\n```\na \\`\\`\\` b\n```\n", ["a ``` b"]],
    ["Feature: F\nScenario: S\nGiven x\n\"\"\"\nsay \\\"\\\"\\\"\n\"\"\"\n", ["say \"\"\""]],
    ["Feature: F\nScenario: S\nGiven x\n```\n``` x\n```\n", ["``` x"]],
  ];
  for (const [text, docString] of rows) {
    assert.deepEqual(stepOnLine(parseFeature(text), 3)?.docString, docString, JSON.stringify(text));
  }
});

test("[boundary-6] boundary: a media type is ignored and a whitespace-only line loses only N characters", () => {
  const result = parseFeature('Feature: F\nBackground:\nGiven x\n    """text/plain\n      \n    """\n');
  assert.deepEqual(result.background, [
    { keyword: "Given", text: "x", line: 3, docString: ["  "], table: null },
  ]);
});

test("[unhappy-10] Unclosed, misplaced and repeated doc strings", () => {
  const rows: [string, number, string][] = [
    ["Feature: F\nScenario: S\nGiven x\n```\nnever closed\n", 4, "line 4: doc string is never closed"],
    ["Feature: F\nScenario: S\nGiven x\n\"\"\"\na\n```\n", 4, "line 4: doc string is never closed"],
    ["Feature: F\nScenario: S\n```\nx\n```\n", 3, "line 3: doc string must follow a step"],
    ["Feature: F\nScenario: S\nGiven x\n```\na\n```\n```\nb\n```\n", 7, "line 7: step already has a doc string"],
    ["Feature: F\nScenario: S\nGiven x\n| a |\n```\nb\n```\n", 5, "line 5: step already has a table"],
  ];
  for (const [text, line, message] of rows) assertParseError(text, line, message);
});

test("[unhappy-10] boundary: a delimiter line with more text does not close the doc string", () => {
  assertParseError("Feature: F\nScenario: S\nGiven x\n  ```\n  ```json\n", 4, "line 4: doc string is never closed");
});
