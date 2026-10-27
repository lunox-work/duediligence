import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature, ParseError, type Step, type StepKeyword } from "../../src/index.js";

function feature(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

function step(keyword: StepKeyword, text: string, line: number): Step {
  return { keyword, text, line, docString: null, table: null };
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

test("[happy-7] Every keyword, extra spaces and hash signs", () => {
  const text = feature(
    "Feature: F",
    "  Scenario: S",
    "    Given a",
    "    When b",
    "    Then c",
    "    And d",
    "    But e",
    "    * f",
    "    Given  two spaces",
    "    Then it costs 5 # not a comment",
  );
  const steps = parseFeature(text).scenarios[0].steps;
  assert.deepEqual(steps, [
    step("Given", "a", 3),
    step("When", "b", 4),
    step("Then", "c", 5),
    step("And", "d", 6),
    step("But", "e", 7),
    step("*", "f", 8),
    step("Given", " two spaces", 9),
    step("Then", "it costs 5 # not a comment", 10),
  ]);
  assert.equal(steps.find((s) => s.line === 9)?.text, " two spaces");
});

test("[happy-7] boundary: a scenario may start with But and And, and texts may be one character after extra spaces", () => {
  const steps = parseFeature("Feature: F\nScenario: S\n  But first\n  And  then\n  *  #\n").scenarios[0].steps;
  assert.deepEqual(steps, [step("But", "first", 3), step("And", " then", 4), step("*", " #", 5)]);
});

test("[unhappy-4] Steps outside a Background or Scenario", () => {
  const rows: [string, number, string][] = [
    ["Feature: F\nGiven x\n", 2, 'line 2: step outside a "Background:" or "Scenario:"'],
    ["Feature: F\n  Some description\n  * x\n", 3, 'line 3: step outside a "Background:" or "Scenario:"'],
    ["Feature: F\nScenario: S\nRule: R\nWhen x\n", 4, 'line 4: step outside a "Background:" or "Scenario:"'],
  ];
  for (const [text, line, message] of rows) assertParseError(text, line, message);
});

test("[unhappy-4] boundary: a step under a Rule that follows the Background", () => {
  assertParseError(
    "Feature: F\nBackground:\nGiven a\nRule: R\n  But b\n",
    5,
    'line 5: step outside a "Background:" or "Scenario:"',
  );
});

test("[unhappy-5] Lines that look like steps but are not", () => {
  const rows: [string, number, string][] = [
    ["Feature: F\nScenario: S\n  given x\n", 3, 'line 3: unexpected line "given x"'],
    ["Feature: F\nScenario: S\n  Given:x\n", 3, 'line 3: unexpected line "Given:x"'],
    ["Feature: F\nScenario: S\n  Given\n", 3, 'line 3: unexpected line "Given"'],
    ["Feature: F\nScenario: S\n  Given \n", 3, 'line 3: unexpected line "Given"'],
    ["Feature: F\nScenario: S\n  Andx\n", 3, 'line 3: unexpected line "Andx"'],
  ];
  for (const [text, line, message] of rows) assertParseError(text, line, message);
});

test("[unhappy-5] boundary: an asterisk with no space is not a step", () => {
  assertParseError("Feature: F\nScenario: S\n  *x\n", 3, 'line 3: unexpected line "*x"');
});

test("[unhappy-6] A tab after the keyword does not make a step", () => {
  assertParseError("Feature: F\nScenario: S\n  Given\tx\n", 3, 'line 3: unexpected line "Given\tx"');
});

test("[unhappy-6] boundary: a tab after an asterisk in a Background does not make a step", () => {
  assertParseError("Feature: F\nBackground:\n  *\tx\n", 3, 'line 3: unexpected line "*\tx"');
});

test("[unhappy-7] Prose inside a scenario or background", () => {
  const rows: [string, number, string][] = [
    ["Feature: F\nScenario: S\nGiven x\nthis is prose \n", 4, 'line 4: unexpected line "this is prose"'],
    ["Feature: F\nScenario: S\n  A description\n", 3, 'line 3: unexpected line "A description"'],
    ["Feature: F\nBackground:\n  prose\n", 3, 'line 3: unexpected line "prose"'],
  ];
  for (const [text, line, message] of rows) assertParseError(text, line, message);
});

test("[unhappy-7] boundary: prose after a step's table is reported trimmed", () => {
  assertParseError(
    "Feature: F\nScenario: S\nGiven x\n| a |\n\t  Free text\t\n",
    5,
    'line 5: unexpected line "Free text"',
  );
});
