import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature, ParseError } from "../../src/index.js";

function assertParseErrorAt(text: string, line: number): ParseError {
  let caught: unknown = undefined;
  try {
    parseFeature(text);
  } catch (err: unknown) {
    caught = err;
  }
  if (!(caught instanceof ParseError)) {
    throw new assert.AssertionError({ message: `expected a ParseError, got ${String(caught)}` });
  }
  assert.equal(caught.line, line);
  assert.match(caught.message, new RegExp(`line ${line}(?!\\d)`));
  return caught;
}

test("[unhappy-1] a second Feature: line fails at that line", () => {
  const text = [
    "Feature: Payouts",
    "  Scenario: One",
    "    Given a step",
    "Feature: Refunds",
    "  Scenario: Two",
    "    Given a step",
  ].join("\n");

  assertParseErrorAt(text, 4);
});

test("[unhappy-1] error lines count from 1 across CRLF line endings and blank lines", () => {
  const text = [
    "Feature: Payouts",
    "",
    "  Scenario: One",
    "",
    "    Given a step",
    "",
    "Feature: Refunds",
  ].join("\r\n");

  assertParseErrorAt(text, 7);
});

test("[unhappy-1] content before any Feature: line fails at the first such line", () => {
  const text = ["", "", "Scenario: Orphan", "  Given a step", "Feature: Late"].join("\n");

  assertParseErrorAt(text, 3);
});

test("[unhappy-1] a step before any Background: or Scenario: fails at that line", () => {
  const text = [
    "Feature: Payouts",
    "  @tagged",
    "  Given a step with no scenario",
    "  Scenario: One",
    "    Given a step",
  ].join("\n");

  assertParseErrorAt(text, 3);
});

test("[unhappy-1] a line inside a scenario that is none of the recognised forms fails at that line", () => {
  const text = [
    "Feature: Payouts",
    "  Scenario: One",
    "    Given a step",
    "    this line is not a step",
    "    Then another step",
  ].join("\n");

  assertParseErrorAt(text, 4);
});

test("[unhappy-1] a doc string that is never closed fails at the line that opened it", () => {
  const text = [
    "Feature: Payouts",
    "  Scenario: One",
    "    Given a document",
    "      \"\"\"",
    "      some text",
    "    Then another step",
    "",
  ].join("\n");

  assertParseErrorAt(text, 4);
});

test("[unhappy-1] Scenario Outline: fails at its line, saying it is not supported", () => {
  const text = [
    "Feature: Payouts",
    "  Scenario: One",
    "    Given a step",
    "",
    "  Scenario Outline: Many",
    "    Given <n> steps",
  ].join("\n");

  const err = assertParseErrorAt(text, 5);
  assert.match(err.message, /support/i);
});
