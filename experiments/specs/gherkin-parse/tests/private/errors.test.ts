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
  assert.ok(caught instanceof Error);
  assert.equal(caught.line, line);
  assert.match(caught.message, new RegExp(`line ${line}(?!\\d)`));
  return caught;
}

test("[unhappy-1] a ParseError is an Error carrying the line it was given", () => {
  const err = new ParseError("bad input at line 12", 12);
  assert.ok(err instanceof ParseError);
  assert.ok(err instanceof Error);
  assert.equal(err.line, 12);
  assert.match(err.message, /line 12(?!\d)/);
});

// Extends public "[unhappy-1] content before any Feature: line fails at the first such line":
// the first content is a step, with no Feature: anywhere.
test("[unhappy-1] a file whose first content is a step and that has no Feature: fails at the step", () => {
  assertParseErrorAt(["", "  ", "", "  Given a step", "  Then another"].join("\n"), 4);
});

// Extends public "[unhappy-1] content before any Feature: line ...": plain text on line 1.
test("[unhappy-1] plain text on the first line before Feature: fails at line 1", () => {
  assertParseErrorAt(["Some notes", "Feature: Payouts", "  Scenario: One", "    Given a step"].join("\n"), 1);
});

// Extends public "[unhappy-1] content before any Feature: line ...": a Background: first, CRLF endings.
test("[unhappy-1] a Background: before the Feature: line fails at the Background: line", () => {
  assertParseErrorAt(["", "Background:", "  Given a ledger", "Feature: Late"].join("\r\n"), 2);
});

// Extends public "[unhappy-1] a second Feature: line fails at that line": after a background,
// with the same name as the first.
test("[unhappy-1] a second Feature: line with the same name after a background fails at that line", () => {
  const text = [
    "Feature: Payouts",
    "  Background:",
    "    Given a ledger",
    "",
    "    And a clock",
    "  Feature: Payouts",
  ].join("\n");

  assertParseErrorAt(text, 6);
});

// Extends public "[unhappy-1] a second Feature: line fails at that line": a multi-digit line after a table,
// so a message that names a different line or a one-digit prefix fails.
test("[unhappy-1] a second Feature: line on line 12 after a table names line 12", () => {
  const text = [
    "Feature: Payouts",
    "  Scenario: One",
    "    Given these rows",
    "      | a | b |",
    "      | 1 | 2 |",
    "    Then a step",
    "  Scenario: Two",
    "    Given a step",
    "",
    "",
    "    # still fine",
    "    Feature: Refunds",
    "  Scenario: Three",
  ].join("\n");

  assertParseErrorAt(text, 12);
});

// Extends public "[unhappy-1] a step before any Background: or Scenario: fails at that line": every keyword.
test("[unhappy-1] a step with any keyword after a tag line and before any Scenario: fails at that line", () => {
  for (const line of ["When a step", "Then a step", "And a step", "But a step", "* a step"]) {
    const text = ["Feature: Payouts", "  @tagged", "  " + line, "  Scenario: One", "    Given a step"].join("\n");
    assertParseErrorAt(text, 3);
  }
});

// Extends public "[unhappy-1] a step before any Background: or Scenario: ...": several tag lines and
// comments first, on a multi-digit line, with a Background: only afterwards.
test("[unhappy-1] a step on line 10 after tags and comments, before the Background:, fails at line 10", () => {
  const text = [
    "Feature: Payouts",
    "  A description.",
    "",
    "  @one",
    "  # comment",
    "  @two",
    "",
    "  # another",
    "",
    "    Given a stray step",
    "  Background:",
    "    Given a ledger",
  ].join("\n");

  assertParseErrorAt(text, 10);
});

// Extends public "[unhappy-1] a line inside a scenario that is none of the recognised forms fails at that line":
// directly after the Scenario: line, before any step.
test("[unhappy-1] a free-text line straight after Scenario: fails at that line", () => {
  const text = [
    "Feature: Payouts",
    "  Scenario: Described",
    "    This scenario has a description line.",
    "    Given a step",
  ].join("\n");

  assertParseErrorAt(text, 3);
});

// Extends public "[unhappy-1] a line inside a scenario that is none of the recognised forms ...":
// after a table, in a second scenario, on a multi-digit line.
test("[unhappy-1] a free-text line after a table in a later scenario fails at its line", () => {
  const text = [
    "Feature: Payouts",
    "  Scenario: One",
    "    Given a step",
    "  Scenario: Two",
    "    Given these rows",
    "      | a |",
    "      | b |",
    "",
    "    # a comment",
    "    Then a step",
    "    oops, not a step",
  ].join("\n");

  assertParseErrorAt(text, 11);
});

// Extends public "[unhappy-1] a line inside a scenario that is none of the recognised forms ...":
// after a closed doc string.
test("[unhappy-1] a free-text line after a closed doc string fails at its line", () => {
  const text = [
    "Feature: Payouts",
    "  Scenario: One",
    "    Given a document",
    "      \"\"\"",
    "      body",
    "      \"\"\"",
    "    and then free text",
  ].join("\r\n");

  assertParseErrorAt(text, 7);
});

// Extends public "[unhappy-1] a line inside a scenario that is none of the recognised forms ...":
// words that start with a keyword but have no space after it are not steps.
test("[unhappy-1] a line starting with a keyword not followed by a space fails at that line", () => {
  for (const bad of ["Givenness is rare", "Andrew pays", "Butter melts", "Thence it follows"]) {
    const text = ["Feature: Payouts", "  Scenario: One", "    Given a step", "    " + bad].join("\n");
    assertParseErrorAt(text, 4);
  }
});

// Extends public "[unhappy-1] a line inside a scenario that is none of the recognised forms ...":
// keywords are matched as written, so a lower-case keyword is not a step.
test("[unhappy-1] a lower-case keyword inside a scenario fails at that line", () => {
  const text = ["Feature: Payouts", "  Scenario: One", "    Given a step", "    then a lower-case step"].join("\n");

  assertParseErrorAt(text, 4);
});

// Extends public "[unhappy-1] a line inside a scenario that is none of the recognised forms ...":
// an "Examples:" line is none of the forms the spec lists.
test("[unhappy-1] an Examples: line inside a scenario fails at that line", () => {
  const text = [
    "Feature: Payouts",
    "  Scenario: One",
    "    Given <n> steps",
    "    Examples:",
    "      | n |",
    "      | 1 |",
  ].join("\n");

  assertParseErrorAt(text, 4);
});

// Extends public "[unhappy-1] a doc string that is never closed fails at the line that opened it":
// a first doc string is closed, a later one is not.
test("[unhappy-1] when an earlier doc string is closed, the later unclosed one fails at its own opening line", () => {
  const text = [
    "Feature: Payouts",
    "  Scenario: One",
    "    Given a document",
    "      \"\"\"",
    "      closed",
    "      \"\"\"",
    "  Scenario: Two",
    "    Given a step",
    "",
    "    # comment",
    "    When another document",
    "      \"\"\"",
    "      never closed",
    "    Then a step",
    "",
    "  Scenario: Three",
    "    Given a step",
  ].join("\n");

  assertParseErrorAt(text, 12);
});

// Extends public "[unhappy-1] a doc string that is never closed ...": in a background, no final newline.
test("[unhappy-1] an unclosed doc string in the background fails at its opening line", () => {
  const text = ["Feature: Payouts", "  Background:", "    Given a config", "      \"\"\"", "      key: value"].join(
    "\r\n",
  );

  assertParseErrorAt(text, 4);
});

// Extends public "[unhappy-1] a doc string that is never closed ...": the unclosed doc string swallows later
// lines, so an error-looking line after it does not decide the error.
test("[unhappy-1] an unclosed doc string fails at its opening line even with a Scenario Outline: after it", () => {
  const text = [
    "Feature: Payouts",
    "  Scenario: One",
    "    Given a document",
    "    \"\"\"",
    "    text",
    "  Scenario Outline: Inside the open doc string",
    "    Feature: also inside",
  ].join("\n");

  assertParseErrorAt(text, 4);
});

// Extends public "[unhappy-1] Scenario Outline: fails at its line, saying it is not supported":
// as the first scenario, right after the Feature: line.
test("[unhappy-1] a Scenario Outline: as the first scenario fails at its line, saying it is not supported", () => {
  const text = ["Feature: Payouts", "Scenario Outline: First", "  Given <n> steps"].join("\n");

  const err = assertParseErrorAt(text, 2);
  assert.match(err.message, /support/i);
});

// Extends public "[unhappy-1] Scenario Outline: fails at its line ...": after tags and a background, on a
// multi-digit line with CRLF endings; the error names the outline's line, not the tag line's.
test("[unhappy-1] a tagged Scenario Outline: on line 11 after a background fails at line 11", () => {
  const text = [
    "Feature: Payouts",
    "  Background:",
    "    Given a ledger",
    "  Scenario: One",
    "    Given a step",
    "      | a |",
    "",
    "  # an outline follows",
    "",
    "  @outline",
    "  Scenario Outline: Many",
    "    Given <n> steps",
  ].join("\r\n");

  const err = assertParseErrorAt(text, 11);
  assert.match(err.message, /support/i);
});

// Extends public "[unhappy-1] a line inside a scenario that is none of the recognised forms ...": the error
// is where the file first goes wrong, not at a later Scenario Outline: or second Feature: line.
test("[unhappy-1] the error names the first bad line when later lines are also bad", () => {
  const text = [
    "Feature: Payouts",
    "  Scenario: One",
    "    Given a step",
    "    not a step",
    "  Scenario Outline: Later",
    "Feature: Later",
  ].join("\n");

  assertParseErrorAt(text, 4);
});
