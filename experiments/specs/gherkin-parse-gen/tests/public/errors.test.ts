import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature, ParseError } from "../../src/index.js";

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

function assertTypeError(value: unknown): void {
  assert.throws(
    () => parseFeature(value as string),
    (err: unknown) => {
      assert.ok(err instanceof TypeError, `expected a TypeError for ${String(value)}`);
      assert.ok(!(err instanceof ParseError), `expected no ParseError for ${String(value)}`);
      return true;
    },
  );
}

test("[unhappy-1] Missing, late or repeated Feature line", () => {
  const rows: [string, number, string][] = [
    ["", 1, 'line 1: expected "Feature:"'],
    ["\n  \n# only a comment\n", 1, 'line 1: expected "Feature:"'],
    ["Scenario: S\nFeature: F\n", 1, 'line 1: expected "Feature:"'],
    ["# c\n\nhello\nFeature: F\n", 3, 'line 3: expected "Feature:"'],
    ["@tag\nFeature: F\n", 1, 'line 1: expected "Feature:"'],
    ["feature: F\n", 1, 'line 1: expected "Feature:"'],
    ["Feature: A\nFeature: B\n", 2, 'line 2: second "Feature:"'],
    ["Feature: A\nScenario: S\nGiven x\n  Feature: B\n", 4, 'line 4: second "Feature:"'],
  ];
  for (const [text, line, message] of rows) assertParseError(text, line, message);
});

test("[unhappy-1] boundary: a second Feature line after tags fails with its own reason", () => {
  assertParseError("Feature: A\n@t\nFeature: B\n", 3, 'line 3: second "Feature:"');
});

test("[unhappy-2] Misplaced and repeated backgrounds", () => {
  const rows: [string, number, string][] = [
    ["Feature: F\nScenario: S\nBackground:\n", 3, 'line 3: "Background:" must come before any "Rule:" or "Scenario:"'],
    ["Feature: F\nRule: R\nBackground:\n", 3, 'line 3: "Background:" must come before any "Rule:" or "Scenario:"'],
    ["Feature: F\nBackground:\nGiven x\nBackground:\n", 4, 'line 4: second "Background:"'],
    ["Feature: F\nBackground:\nScenario: S\nBackground:\n", 4, 'line 4: second "Background:"'],
  ];
  for (const [text, line, message] of rows) assertParseError(text, line, message);
});

test("[unhappy-2] boundary: a Background after an Example", () => {
  assertParseError(
    "Feature: F\nExample: E\nBackground: late\n",
    3,
    'line 3: "Background:" must come before any "Rule:" or "Scenario:"',
  );
});

test("[unhappy-3] Outlines and templates are not supported", () => {
  const rows: [string, number, string][] = [
    ["Feature: F\nScenario Outline: O\n  Given <x>\n", 2, 'line 2: "Scenario Outline:" is not supported'],
    ["Feature: F\nScenario: S\nGiven x\n  Scenario Template: T\n", 4, 'line 4: "Scenario Template:" is not supported'],
    ["Feature: F\nScenario: S\n  Given x\n  Examples:\n", 4, 'line 4: unexpected line "Examples:"'],
  ];
  for (const [text, line, message] of rows) assertParseError(text, line, message);
});

test("[unhappy-3] boundary: a Scenario Outline in the feature description is still rejected", () => {
  assertParseError(
    "Feature: F\n  description\n  Scenario Outline: O\n",
    3,
    'line 3: "Scenario Outline:" is not supported',
  );
});

test("[happy-12] Constructing a ParseError", () => {
  const err = new ParseError("bad indent", 7);
  assert.equal(err.line, 7);
  assert.equal(err.message, "line 7: bad indent");
  assert.equal(err.name, "ParseError");
  assert.ok(err instanceof ParseError);
  assert.ok(err instanceof Error);
});

test("[happy-12] boundary: a ParseError at line 1 with a quoted reason", () => {
  const err = new ParseError('second "Feature:"', 1);
  assert.equal(err.line, 1);
  assert.equal(err.message, 'line 1: second "Feature:"');
  assert.equal(err.name, "ParseError");
  assert.ok(err instanceof ParseError);
  assert.ok(err instanceof Error);
});

test("[unhappy-11] The first error in the file is reported", () => {
  assertParseError(
    "Feature: F\nGiven x\nScenario Outline: O\nFeature: G\n",
    2,
    'line 2: step outside a "Background:" or "Scenario:"',
  );
});

test("[unhappy-11] boundary: an unclosed doc string is reported before a Feature line inside it", () => {
  assertParseError("Feature: F\nScenario: S\nGiven x\n```\nFeature: G\n", 4, "line 4: doc string is never closed");
});

test("[unhappy-12] Non-string input is a TypeError", () => {
  for (const value of [undefined, null, 42]) assertTypeError(value);
});

test("[unhappy-12] boundary: an array holding a valid feature text is a TypeError", () => {
  assertTypeError(["Feature: F\n"]);
});
