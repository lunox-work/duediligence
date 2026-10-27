import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature } from "../../src/index.js";

// Extends public "[boundary-1] a doc string and a table belong to the step before them":
// the table on the first step and the doc string on the last, in the second scenario.
test("[boundary-1] a table on a first step and a doc string on a third step of a second scenario stay with them", () => {
  const text = [
    "Feature: Payloads",
    "  Scenario: Plain",
    "    Given nothing attached",
    "  Scenario: Attached",
    "    Given these accounts",
    "      | id | owner |",
    "      | 1  | Ada   |",
    "    When a request is made",
    "    Then the response is",
    "      \"\"\"",
    "      ok",
    "      \"\"\"",
  ].join("\n");

  const feature = parseFeature(text);
  assert.deepEqual(feature.scenarios[0].steps, [
    { keyword: "Given", text: "nothing attached", line: 3, docString: null, table: null },
  ]);
  assert.deepEqual(feature.scenarios[1].steps, [
    {
      keyword: "Given",
      text: "these accounts",
      line: 5,
      docString: null,
      table: [
        ["id", "owner"],
        ["1", "Ada"],
      ],
    },
    { keyword: "When", text: "a request is made", line: 8, docString: null, table: null },
    { keyword: "Then", text: "the response is", line: 9, docString: ["ok"], table: null },
  ]);
});

// Extends public "[boundary-1] a doc string and a table belong to the step before them": deeper
// opening quotes, lines indented further than them, and CRLF endings.
test("[boundary-1] only the opening quotes' indentation is removed, further indentation is kept", () => {
  const text = [
    "Feature: Payloads",
    "  Scenario: Nested",
    "    Given a nested document",
    "        \"\"\"",
    "        root",
    "          child",
    "            grandchild",
    "        tail",
    "        \"\"\"",
    "    Then it is read",
  ].join("\r\n");

  const steps = parseFeature(text).scenarios[0].steps;
  assert.deepEqual(steps[0].docString, ["root", "  child", "    grandchild", "tail"]);
  assert.equal(steps[0].table, null);
  assert.equal(steps[0].line, 3);
  assert.deepEqual(
    { keyword: steps[1].keyword, text: steps[1].text, line: steps[1].line, docString: steps[1].docString },
    { keyword: "Then", text: "it is read", line: 10, docString: null },
  );
});

// Extends public "[boundary-1] a doc string and a table belong to the step before them": tab indentation.
test("[boundary-1] a doc string indented with tabs has the tabs of the opening quotes removed", () => {
  const text = [
    "Feature: Payloads",
    "\tScenario: Tabs",
    "\t\tGiven a tabbed document",
    "\t\t\"\"\"",
    "\t\tfirst",
    "\t\t\tsecond",
    "\t\t\"\"\"",
  ].join("\n");

  assert.deepEqual(parseFeature(text).scenarios[0].steps[0].docString, ["first", "\tsecond"]);
});

// Extends public "[boundary-1] a doc string and a table belong to the step before them": no lines inside.
test("[boundary-1] a doc string with no lines between the quotes is an empty list", () => {
  const text = [
    "Feature: Payloads",
    "  Scenario: Empty document",
    "    Given an empty body",
    "      \"\"\"",
    "      \"\"\"",
    "    Then nothing is sent",
  ].join("\n");

  const steps = parseFeature(text).scenarios[0].steps;
  assert.deepEqual(steps[0].docString, []);
  assert.equal(steps[1].line, 6);
  assert.equal(steps[1].docString, null);
});

// Extends public "[boundary-1] a doc string and a table belong to the step before them": a bigger table,
// an empty cell, cells with inner spaces and tabs around them, and CRLF endings.
test("[boundary-1] a table's rows keep their order and each cell is trimmed, across CRLF endings", () => {
  const text = [
    "Feature: Payloads",
    "  Scenario: People",
    "    Given these people",
    "      | name          | role    | note |",
    "      |  Ada Lovelace | analyst |      |",
    "      |\tAlan Turing\t|  logician | x  |",
    "      | Grace Hopper  | admiral | y    |",
    "    Then there are three",
  ].join("\r\n");

  const steps = parseFeature(text).scenarios[0].steps;
  assert.deepEqual(steps[0].table, [
    ["name", "role", "note"],
    ["Ada Lovelace", "analyst", ""],
    ["Alan Turing", "logician", "x"],
    ["Grace Hopper", "admiral", "y"],
  ]);
  assert.equal(steps[0].docString, null);
  assert.deepEqual(
    { keyword: steps[1].keyword, text: steps[1].text, line: steps[1].line, table: steps[1].table },
    { keyword: "Then", text: "there are three", line: 8, table: null },
  );
});

// Extends public "[boundary-1] a doc string and a table belong to the step before them": many rows.
test("[boundary-1] a table of thirty rows is returned whole on its step", () => {
  const lines = ["Feature: Payloads", "  Scenario: Many rows", "    Given a long table"];
  const expected: string[][] = [];
  for (let i = 0; i < 30; i++) {
    lines.push(`      | row ${i} | ${i * i} |`);
    expected.push([`row ${i}`, String(i * i)]);
  }
  lines.push("    Then it is read");

  const steps = parseFeature(lines.join("\n")).scenarios[0].steps;
  assert.equal(steps.length, 2);
  assert.deepEqual(steps[0].table, expected);
  assert.equal(steps[1].line, 34);
});

// Extends public "[boundary-1] a doc string and a table belong to the step before them": two doc strings
// and two tables on separate steps of one scenario.
test("[boundary-1] each of several steps keeps its own doc string or table", () => {
  const text = [
    "Feature: Payloads",
    "  Scenario: Several",
    "    Given a first document",
    "      \"\"\"",
    "      one",
    "      \"\"\"",
    "    And a first table",
    "      | a |",
    "    When a second document",
    "      \"\"\"",
    "      two",
    "      \"\"\"",
    "    Then a second table",
    "      | b | c |",
  ].join("\n");

  const steps = parseFeature(text).scenarios[0].steps;
  assert.deepEqual(
    steps.map((s) => [s.line, s.docString, s.table]),
    [
      [3, ["one"], null],
      [7, null, [["a"]]],
      [9, ["two"], null],
      [13, null, [["b", "c"]]],
    ],
  );
});

// Spans the background scenario, but asserts that doc strings and tables belong to the step before them.
test("[boundary-1] a doc string and a table on background steps belong to those steps", () => {
  const text = [
    "Feature: Payloads",
    "  Background:",
    "    Given a config",
    "      \"\"\"",
    "      Feature: inside a background doc string",
    "      \"\"\"",
    "    And these limits",
    "      | limit | 5 |",
    "  Scenario: Uses them",
    "    Then they apply",
  ].join("\n");

  const feature = parseFeature(text);
  assert.deepEqual(feature.background, [
    {
      keyword: "Given",
      text: "a config",
      line: 3,
      docString: ["Feature: inside a background doc string"],
      table: null,
    },
    { keyword: "And", text: "these limits", line: 7, docString: null, table: [["limit", "5"]] },
  ]);
  assert.deepEqual(feature.scenarios[0].steps, [
    { keyword: "Then", text: "they apply", line: 10, docString: null, table: null },
  ]);
});

// Extends public "[boundary-1] lines inside a doc string are never read as keywords, comments or tags":
// indented further than the quotes, in a later scenario, with "Scenario Outline:" and "Feature:" inside.
test("[boundary-1] keyword, comment and tag lines indented inside a later doc string are kept as its lines", () => {
  const text = [
    "Feature: Payloads",
    "  Scenario: First",
    "    Given a step",
    "  Scenario: Second",
    "    Given a document",
    "      \"\"\"",
    "        Scenario Outline: kept",
    "        Examples:",
    "      Feature: kept",
    "        @kept",
    "        # kept",
    "      * kept",
    "      \"\"\"",
    "  @after",
    "  Scenario: Third",
    "    Then it is a scenario",
  ].join("\n");

  const feature = parseFeature(text);
  assert.equal(feature.scenarios.length, 3);
  assert.deepEqual(feature.scenarios[1].steps[0].docString, [
    "  Scenario Outline: kept",
    "  Examples:",
    "Feature: kept",
    "  @kept",
    "  # kept",
    "* kept",
  ]);
  assert.equal(feature.scenarios[1].steps.length, 1);
  assert.deepEqual(feature.scenarios[1].tags, []);
  assert.deepEqual(feature.scenarios[2].tags, ["@after"]);
  assert.equal(feature.scenarios[2].line, 15);
  assert.equal(feature.scenarios[2].steps[0].line, 16);
});
