import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature, ParseError } from "../../src/index.js";

function assertParseError(source: string, line: number, detail?: RegExp): void {
  assert.throws(() => parseFeature(source), (error: unknown) => {
    assert.ok(error instanceof ParseError, "expected a ParseError");
    if (!(error instanceof ParseError)) return false;
    assert.equal(error.line, line);
    assert.ok(error.message.includes(`line ${line}`), "message must include the offending line");
    if (detail) assert.match(error.message, detail);
    return true;
  });
}

test("[unhappy-1] rejects content before the first feature at that content's line", () => {
  assertParseError([
    "",
    "# leading comment",
    "  Unexpected content",
    "Feature: Too late",
    "Scenario: Example",
    "Given a value",
  ].join("\n"), 3);
});

test("[unhappy-1] reports line one when a scenario appears before a feature", () => {
  assertParseError("Scenario: Missing feature\r\nGiven a value", 1);
});

test("[unhappy-1] rejects a second feature at its line", () => {
  assertParseError([
    "Feature: First",
    "Scenario: Example",
    "Given a value",
    "",
    "  Feature: Second",
  ].join("\n"), 5);
});

test("[unhappy-1] rejects a second feature even before the first scenario", () => {
  assertParseError("Feature: First\r\n\tFeature: Second", 2);
});

test("[unhappy-1] rejects every step keyword before a background or scenario", () => {
  for (const keyword of ["Given", "When", "Then", "And", "But", "*"]) {
    assertParseError([
      "Feature: Missing section",
      "An introductory description.",
      "",
      `\t${keyword} a value`,
      "Scenario: Too late",
      "Then finish",
    ].join("\n"), 4);
  }
});

test("[unhappy-1] rejects unrecognized content inside a scenario at its line", () => {
  assertParseError([
    "Feature: Invalid scenario",
    "Scenario: Example",
    "Given a value",
    "# this comment is valid",
    "",
    "  This is not a step",
    "Then finish",
  ].join("\n"), 6);
});

test("[unhappy-1] rejects unrecognized content immediately after a scenario header", () => {
  assertParseError("Feature: Invalid\r\nScenario: Example\r\n\tUnrecognized", 3);
});

test("[unhappy-1] reports the opening line of an unterminated doc string", () => {
  assertParseError([
    "Feature: Documents",
    "Scenario: Unclosed",
    "  Given a document",
    '    """',
    "    document content",
    "    # still document content",
    "    @stillDocumentContent",
    "    Scenario: also document content",
    "",
  ].join("\n"), 4);
});

test("[unhappy-1] reports the opener when an unterminated doc string starts at end of input", () => {
  assertParseError([
    "Feature: Documents",
    "Background:",
    "Given a document",
    '\t"""',
  ].join("\r\n"), 4);
});

test("[unhappy-1] rejects a scenario outline and says it is unsupported", () => {
  assertParseError([
    "Feature: Outlines",
    "Scenario: Ordinary scenario",
    "Given a value",
    "",
    "  Scenario Outline: Parameterized scenario",
    "    Given <value>",
  ].join("\n"), 5, /not supported|unsupported/i);
});

test("[unhappy-1] rejects an outline as the first scenario with CRLF and tab indentation", () => {
  assertParseError("Feature: Outlines\r\n\tScenario Outline: Example", 2, /not supported|unsupported/i);
});
