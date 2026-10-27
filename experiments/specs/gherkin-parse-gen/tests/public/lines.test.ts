import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature, type Feature } from "../../src/index.js";

function feature(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

function scenarioSummary(f: Feature): { name: string; line: number; tags: string[] }[] {
  return f.scenarios.map((s) => ({ name: s.name, line: s.line, tags: s.tags }));
}

test("[happy-2] Windows line endings", () => {
  assert.deepEqual(parseFeature("Feature: F\r\n  Scenario: S\r\n    Given x\r\n"), {
    name: "F",
    background: null,
    scenarios: [
      {
        name: "S",
        line: 2,
        tags: [],
        steps: [{ keyword: "Given", text: "x", line: 3, docString: null, table: null }],
      },
    ],
  });
});

test("[happy-2] boundary: blank Windows lines count towards line numbers", () => {
  assert.deepEqual(parseFeature("Feature: F\r\n\r\nScenario: S\r\n\r\nGiven x\r\n"), {
    name: "F",
    background: null,
    scenarios: [
      {
        name: "S",
        line: 3,
        tags: [],
        steps: [{ keyword: "Given", text: "x", line: 5, docString: null, table: null }],
      },
    ],
  });
});

test("[boundary-3] Mixed endings, missing final newline, byte order mark and lone carriage return", () => {
  const rows: { text: string; name: string }[] = [
    { text: "Feature: F\nScenario: S\r\nGiven x", name: "F" },
    { text: "﻿Feature: F\nScenario: S\nGiven x\n", name: "F" },
    { text: "Feature: A\rB\nScenario: S\nGiven x\r\n", name: "A\rB" },
  ];
  for (const row of rows) {
    const result = parseFeature(row.text);
    assert.equal(result.name, row.name, JSON.stringify(row.text));
    assert.equal(result.scenarios[0].line, 2, JSON.stringify(row.text));
    assert.equal(result.scenarios[0].steps[0].line, 3, JSON.stringify(row.text));
    assert.equal(result.scenarios[0].steps[0].text, "x", JSON.stringify(row.text));
  }
  const third = parseFeature(rows[2].text);
  assert.equal(third.name.length, 3);
  assert.deepEqual([...third.name], ["A", "\r", "B"]);
});

test("[boundary-3] boundary: a lone carriage return inside a step's text is kept", () => {
  const result = parseFeature("Feature: F\nScenario: S\nGiven a\rb\n");
  assert.deepEqual(result.scenarios[0].steps, [
    { keyword: "Given", text: "a\rb", line: 3, docString: null, table: null },
  ]);
});

test("[happy-3] Blank lines and comments count towards line numbers", () => {
  const text = feature(
    "# language: en",
    "Feature: F",
    "",
    "  # a comment",
    "  Scenario: S",
    "",
    "    Given x",
  );
  const result = parseFeature(text);
  assert.equal(result.name, "F");
  assert.deepEqual(scenarioSummary(result), [{ name: "S", line: 5, tags: [] }]);
  assert.deepEqual(result.scenarios[0].steps, [
    { keyword: "Given", text: "x", line: 7, docString: null, table: null },
  ]);
});

test("[happy-3] boundary: whitespace-only lines and comments before the Feature line count", () => {
  const result = parseFeature("\n  \t\n# c\nFeature: F\n# c2\nScenario: S\n\nGiven x\n");
  assert.equal(result.name, "F");
  assert.deepEqual(scenarioSummary(result), [{ name: "S", line: 6, tags: [] }]);
  assert.deepEqual(result.scenarios[0].steps, [
    { keyword: "Given", text: "x", line: 8, docString: null, table: null },
  ]);
});
