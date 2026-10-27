import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature } from "../../src/index.js";

test("[boundary-1] a doc string and a table belong to the step before them", () => {
  const text = [
    "Feature: Payloads",
    "  Scenario: Attachments",
    "    Given a payload",
    "      \"\"\"",
    "      {",
    "        \"amount\": 10",
    "      }",
    "      \"\"\"",
    "    Then the rows are",
    "      | name  | amount |",
    "      |  Ada  |   10   |",
    "    And a plain step",
  ].join("\n");

  const steps = parseFeature(text).scenarios[0].steps;
  assert.deepEqual(steps, [
    {
      keyword: "Given",
      text: "a payload",
      line: 3,
      docString: ["{", "  \"amount\": 10", "}"],
      table: null,
    },
    {
      keyword: "Then",
      text: "the rows are",
      line: 9,
      docString: null,
      table: [
        ["name", "amount"],
        ["Ada", "10"],
      ],
    },
    { keyword: "And", text: "a plain step", line: 12, docString: null, table: null },
  ]);
});

test("[boundary-1] lines inside a doc string are never read as keywords, comments or tags", () => {
  const text = [
    "Feature: Payloads",
    "  Scenario: Tricky doc string",
    "    Given a document",
    "    \"\"\"",
    "    Feature: not a second feature",
    "    Scenario: not a scenario",
    "    Scenario Outline: not an outline",
    "    Background: not a background",
    "    Given not a step",
    "    # not a comment",
    "    @not-a-tag",
    "    | not | a table |",
    "    \"\"\"",
    "    Then it is kept as written",
  ].join("\r\n");

  const feature = parseFeature(text);
  assert.equal(feature.background, null);
  assert.equal(feature.scenarios.length, 1);
  const steps = feature.scenarios[0].steps;
  assert.equal(steps.length, 2);
  assert.deepEqual(steps[0].docString, [
    "Feature: not a second feature",
    "Scenario: not a scenario",
    "Scenario Outline: not an outline",
    "Background: not a background",
    "Given not a step",
    "# not a comment",
    "@not-a-tag",
    "| not | a table |",
  ]);
  assert.equal(steps[0].table, null);
  assert.deepEqual(
    { keyword: steps[1].keyword, text: steps[1].text, line: steps[1].line },
    { keyword: "Then", text: "it is kept as written", line: 14 },
  );
});
