import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature, ParseError, type Feature } from "../../src/index.js";

function feature(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

function scenarioSummary(f: Feature): { name: string; line: number; tags: string[] }[] {
  return f.scenarios.map((s) => ({ name: s.name, line: s.line, tags: s.tags }));
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

test("[happy-8] Tags across several lines, comments, duplicates and rules", () => {
  const text = feature(
    "Feature: F",
    "",
    "  @a @b",
    "  # between",
    "  @c @a # trailing comment",
    "  Scenario: One",
    "    Given x",
    "",
    "  Scenario: Two",
    "    Given y",
    "",
    "  @r",
    "  Rule: R",
    "",
    "    @d",
    "    Scenario: Three",
  );
  assert.deepEqual(scenarioSummary(parseFeature(text)), [
    { name: "One", line: 6, tags: ["@a", "@b", "@c", "@a"] },
    { name: "Two", line: 9, tags: [] },
    { name: "Three", line: 16, tags: ["@d"] },
  ]);
});

test("[happy-8] boundary: tags split on tabs, and a hash token comments out the rest of the line", () => {
  const result = parseFeature("Feature: F\n@a\t@b  #c @notatag\nScenario: S\n");
  assert.deepEqual(scenarioSummary(result), [{ name: "S", line: 3, tags: ["@a", "@b"] }]);
});

test("[unhappy-8] Tags that belong to no scenario, and malformed tags", () => {
  const rows: [string, number, string][] = [
    ["Feature: F\n@t\nGiven x\n", 3, 'line 3: tags must be followed by "Scenario:" or "Rule:"'],
    ["Feature: F\n@t\nBackground:\n", 3, 'line 3: tags must be followed by "Scenario:" or "Rule:"'],
    ["Feature: F\nScenario: S\n@t\nsome text\n", 4, 'line 4: tags must be followed by "Scenario:" or "Rule:"'],
    ["Feature: F\nScenario: S\nGiven x\n@t\n", 4, 'line 4: tags must be followed by "Scenario:" or "Rule:"'],
    ["Feature: F\n@t\n\n@u\n# c\n", 4, 'line 4: tags must be followed by "Scenario:" or "Rule:"'],
    ["Feature: F\n@t\nScenario Outline: O\n", 3, 'line 3: "Scenario Outline:" is not supported'],
    ["Feature: F\n@smoke fast\nScenario: S\n", 2, 'line 2: invalid tag "fast"'],
    ["Feature: F\n@ @x\nScenario: S\n", 2, 'line 2: invalid tag "@"'],
  ];
  for (const [text, line, message] of rows) assertParseError(text, line, message);
});

test("[unhappy-8] boundary: tags on the last line of a file with no final newline", () => {
  assertParseError("Feature: F\nScenario: S\n@t", 3, 'line 3: tags must be followed by "Scenario:" or "Rule:"');
});
