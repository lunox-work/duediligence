import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature, ParseError } from "../../src/index.js";

function expectParseError(source: string, line: number, unsupported = false): void {
  assert.throws(() => parseFeature(source), (error: unknown) => {
    assert.ok(error instanceof ParseError, "the invalid file must throw ParseError, not an arbitrary error");
    if (!(error instanceof ParseError)) return false;
    assert.equal(error.line, line);
    assert.ok(error.message.includes(`line ${line}`), `the message must name line ${line}`);
    if (unsupported) assert.match(error.message, /not supported|unsupported/i);
    return true;
  });
}

// Extends public "rejects content before the first feature at that content's line".
test("[unhappy-1] rejects a tag before the feature after many leading comments and blanks", () => {
  const lines: string[] = [];
  for (let i = 0; i < 35; i++) lines.push("\t# ignored", " \t");
  lines.push(" \t@premature @tag", "Feature: Too late", "Scenario: Later", "Given value");
  expectParseError(lines.join("\r\n"), 71);
});

// Extends public "reports line one when a scenario appears before a feature".
test("[unhappy-1] rejects each other structural form when it is the first content in a file", () => {
  for (const first of ["Background:", "Given value", "When value", "Then value", "And value", "But value", "* value", '"""', "| a | b |"]) {
    expectParseError(`${first}\nFeature: Later\nScenario: Later\nThen finish`, 1);
  }
});

// Extends public "reports line one when a scenario appears before a feature".
test("[unhappy-1] reports an indented scenario after preamble comments as missing its feature", () => {
  expectParseError([
    "", "\t# preamble", " \t", "# Feature: comment only", "\t Scenario: Premature",
    "Feature: Actual but late", "Scenario: Otherwise valid", "Given text",
  ].join("\r\n"), 5);
});

// Extends public "rejects a second feature at its line".
test("[unhappy-1] rejects a second feature after a background and a populated scenario", () => {
  expectParseError([
    "Feature: Original", "Background:", "Given setup", "And more setup", "@case", "Scenario: Valid",
    "Given row", "| a | b |", "Then complete", "# separator", "\tFeature: Duplicate",
    "Scenario: Later", "Given later",
  ].join("\r\n"), 11);
});

// Extends public "rejects a second feature at its line".
test("[unhappy-1] ignores feature-like document lines and rejects the real duplicate after its close", () => {
  expectParseError([
    "Feature: Original", "Scenario: Document", "Given payload", '  """', "  Feature: literal",
    "  Scenario: literal", "  @literal", '  """', "Then ready", "",
    "\t Feature: Actual duplicate",
  ].join("\n"), 11);
});

// Extends public "rejects a second feature even before the first scenario".
test("[unhappy-1] rejects a duplicate feature after a long description rather than treating it as prose", () => {
  const lines = ["Feature: First"];
  for (let i = 0; i < 60; i++) lines.push(`Description paragraph ${i}.`);
  lines.push("# another comment", "", " \tFeature: Second", "Scenario: Too late", "Given value");
  expectParseError(lines.join("\r\n"), 64);
});

// Extends public "rejects a second feature even before the first scenario".
test("[unhappy-1] rejects a second feature while still reading background steps", () => {
  expectParseError([
    "Feature: First", "Background:", "Given shared setup", "And shared rows", "| a | b |", "",
    "\tFeature: Second", "Scenario: First scenario", "Then finish",
  ].join("\n"), 7);
});

// Extends public "rejects every step keyword before a background or scenario".
test("[unhappy-1] rejects every orphan step after pending tags and comments with CRLF", () => {
  for (const keyword of ["*", "But", "And", "Then", "When", "Given"]) {
    expectParseError([
      "\t# preamble", "Feature: Orphan step", "A description.", "", "@next @pending", "# comment", "\t",
      ` \t${keyword} premature # @literal`, "Background:", "Given later setup", "Scenario: Later", "Then finish",
    ].join("\r\n"), 8);
  }
});

// Extends public "rejects unrecognized content inside a scenario at its line".
test("[unhappy-1] does not recognize keyword prefixes or lowercase lookalikes as steps", () => {
  for (const invalid of [
    "Givenly value", "Whenever value", "Thence value", "Android value", "Butter value", "** value",
    "given value", "when value", "then value", "and value", "but value",
  ]) {
    expectParseError([
      "Feature: Exact keywords", "Scenario: Case", "Given valid", "# comment", ` \t${invalid}`, "Then too late",
    ].join("\n"), 5);
  }
});

// Extends public "rejects unrecognized content immediately after a scenario header".
test("[unhappy-1] rejects step-like lines without the required space after the keyword", () => {
  for (const keyword of ["Given", "When", "Then", "And", "But", "*"]) {
    for (const invalid of [`${keyword}\tvalue`, `${keyword}: value`, `${keyword}value`]) {
      expectParseError([
        "Feature: Step separators", "Scenario: Exact separator", `\t${invalid}`, "Then too late",
      ].join("\r\n"), 3);
    }
  }
});

// Extends public "rejects unrecognized content immediately after a scenario header".
test("[unhappy-1] rejects descriptions in a later scenario even when feature descriptions were valid", () => {
  expectParseError([
    "Feature: Descriptions", "This feature description is allowed.", "Background:", "Given shared setup",
    "Scenario: First", "Then valid", "@next", "# between", "Scenario: Second", "\tThis scenario prose is invalid.",
    "Then finish",
  ].join("\r\n"), 10);
});

// Extends public "rejects unrecognized content inside a scenario at its line".
test("[unhappy-1] resumes validation after closing a document and after completing a table", () => {
  expectParseError([
    "Feature: Resume", "Scenario: Document", "Given payload", '"""', "opaque", '"""',
    " \tNot a recognized line", "Then finish",
  ].join("\n"), 7);
  expectParseError([
    "Feature: Resume", "Scenario: Table", "Given rows", "| a | b |", "| c | d |",
    "", "# valid comment", "\tNot a recognized line", "Then finish",
  ].join("\r\n"), 8);
});

// Extends public "rejects unrecognized content inside a scenario at its line".
test("[unhappy-1] reports the physical invalid line after a large valid prefix", () => {
  const lines = ["Feature: Long valid prefix"];
  for (let i = 0; i < 30; i++) lines.push(`Scenario: Case ${i}`, `Given value ${i}`, "# ignored", "", `Then done ${i}`);
  lines.push(" \tUnknown content", "Then never reached");
  expectParseError(lines.join("\r\n"), 152);
});

// Extends public "reports the opening line of an unterminated doc string".
test("[unhappy-1] reports the later unclosed document rather than the first closed document", () => {
  expectParseError([
    "Feature: Multiple documents", "Background:", "Given shared text", '  """', "  shared", '  """',
    "Scenario: First", "Given closed text", '\t"""', "\tfirst", '\t"""', "Then ready",
    "Scenario: Second", "But unclosed text", '    """', "    payload", "    Feature: still literal",
    "    Scenario Outline: still literal", "    @stillLiteral", "    | still | literal |", "",
  ].join("\r\n"), 15);
});

// Extends public "reports the opening line of an unterminated doc string".
test("[unhappy-1] an unclosed background document takes precedence over its literal outline text", () => {
  const lines = ["Feature: Background document", "A description.", "\tBackground:", "\tGiven payload", '\t\t"""'];
  for (let i = 0; i < 90; i++) lines.push(`\t\tline ${i}`);
  lines.push("\t\tScenario Outline: literal", "\t\tFeature: literal", "\t\t# literal comment", "\t\t@literal");
  expectParseError(lines.join("\n"), 5);
});

// Extends public "reports the opener when an unterminated doc string starts at end of input".
test("[unhappy-1] reports an EOF opener after earlier tables and closed documents", () => {
  const lines = [
    "Feature: EOF document", "Scenario: First", "Given rows", "| a | b |", "When text", '"""', "closed", '"""',
    "Scenario: Second", "Given unfinished", ' \t"""',
  ];
  expectParseError(lines.join("\r\n"), 11);
  expectParseError(lines.join("\n") + "\n", 11);
});

// Extends public "rejects a scenario outline and says it is unsupported".
test("[unhappy-1] rejects a tagged outline after documents and tables at the actual header line", () => {
  expectParseError([
    "Feature: Unsupported outline", "Scenario: Ordinary", "Given a document", '  """',
    "  Scenario Outline: literal", '  """', "And rows", "| value |", "| one |", "Then ready",
    "@outline @pending", "# between tags and header", "", "\tScenario Outline: Actual outline", "Given <value>",
  ].join("\r\n"), 14, true);
});

// Extends public "rejects an outline as the first scenario with CRLF and tab indentation".
test("[unhappy-1] rejects an outline as the first scenario after background and pending tags", () => {
  expectParseError([
    "Feature: Setup and outline", "A description.", "\tBackground:", "\tGiven common", "\tAnd common rows",
    "\t| a | b |", "\t@pending", "\t# comment", " \tScenario Outline: First case", "Then <result>",
  ].join("\r\n"), 9, true);
});

// Extends public "rejects unrecognized content inside a scenario at its line".
test("[unhappy-1] reports the first invalid line when more errors follow it", () => {
  expectParseError([
    "Feature: Error ordering", "Scenario: First", "Given valid", "Unrecognized content", "Feature: Duplicate",
    "Scenario Outline: Unsupported too", "Given doc", '"""', "never closed",
  ].join("\n"), 4);
});

// Extends public "rejects content before the first feature at that content's line".
test("[unhappy-1] the exported ParseError constructor retains its line and names it in the message", () => {
  const error = new ParseError("Invalid feature content", 137);
  assert.ok(error instanceof Error);
  assert.ok(error instanceof ParseError);
  assert.equal(error.line, 137);
  assert.ok(error.message.includes("line 137"));
});
