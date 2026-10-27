import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature } from "../../src/index.js";
import type { Feature, Step } from "../../src/index.js";

function step(keyword: Step["keyword"], text: string, line: number): Step {
  return { keyword, text, line, docString: null, table: null };
}

test("[happy-1] returns the feature name and its scenarios with their steps and lines in file order", () => {
  const text = [
    "Feature: Payouts",
    "",
    "  Scenario: First payout",
    "    Given an account with 100",
    "    When a payout of 40 runs",
    "    Then the balance is 60",
    "",
    "  Scenario: Second payout",
    "    Given a frozen account",
    "    And a payout request",
    "    But no funds",
    "    * nothing is paid",
    "",
  ].join("\n");

  const expected: Feature = {
    name: "Payouts",
    background: null,
    scenarios: [
      {
        name: "First payout",
        line: 3,
        tags: [],
        steps: [
          step("Given", "an account with 100", 4),
          step("When", "a payout of 40 runs", 5),
          step("Then", "the balance is 60", 6),
        ],
      },
      {
        name: "Second payout",
        line: 8,
        tags: [],
        steps: [
          step("Given", "a frozen account", 9),
          step("And", "a payout request", 10),
          step("But", "no funds", 11),
          step("*", "nothing is paid", 12),
        ],
      },
    ],
  };

  assert.deepEqual(parseFeature(text), expected);
});

test("[happy-1] reads CRLF line endings and tab indentation without leaking \\r into names or texts", () => {
  const text = [
    "Feature: Payouts",
    "\tScenario: Tabbed: with a colon",
    "\t\tGiven the \"Scenario:\" label",
    " \t * a starred step",
    "",
  ].join("\r\n");

  assert.deepEqual(parseFeature(text), {
    name: "Payouts",
    background: null,
    scenarios: [
      {
        name: "Tabbed: with a colon",
        line: 2,
        tags: [],
        steps: [
          step("Given", "the \"Scenario:\" label", 3),
          step("*", "a starred step", 4),
        ],
      },
    ],
  });
});

test("[happy-1] a step's text is what follows the keyword and exactly one space", () => {
  const text = [
    "Feature: Payouts",
    "  Scenario: Spacing",
    "    Given  two spaces after the keyword",
  ].join("\n");

  const feature = parseFeature(text);
  assert.equal(feature.scenarios[0].steps[0].text, " two spaces after the keyword");
});

test("[happy-2] skips comments, descriptions and blank lines, and gives tags to the next scenario", () => {
  const text = [
    "Feature: Payouts",
    "  Payouts move money out of an account.",
    "  They run nightly.",
    "",
    "  # a comment before the tags",
    "  @happy @smoke",
    "  Scenario: Tagged",
    "    # a comment between steps",
    "    Given a step",
    "",
    "    Then another step",
    "",
    "  Scenario: Untagged",
    "    Given a step",
    "",
  ].join("\n");

  assert.deepEqual(parseFeature(text), {
    name: "Payouts",
    background: null,
    scenarios: [
      {
        name: "Tagged",
        line: 7,
        tags: ["@happy", "@smoke"],
        steps: [step("Given", "a step", 9), step("Then", "another step", 11)],
      },
      {
        name: "Untagged",
        line: 13,
        tags: [],
        steps: [step("Given", "a step", 14)],
      },
    ],
  });
});

test("[happy-2] comments that look like keywords are skipped and tags from several tag lines all go to the next scenario", () => {
  const text = [
    "Feature: Payouts",
    "  Scenario: First",
    "    Given a step",
    "    # Scenario: not a scenario",
    "    # Given not a step",
    "    #@not-a-tag",
    "  @a @b",
    "  # between tag lines",
    "  @c",
    "  Scenario: Second",
    "    Then a step",
  ].join("\n");

  const feature = parseFeature(text);
  assert.equal(feature.scenarios.length, 2);
  assert.deepEqual(feature.scenarios[0].tags, []);
  assert.deepEqual(feature.scenarios[0].steps, [step("Given", "a step", 3)]);
  assert.deepEqual([...feature.scenarios[1].tags].sort(), ["@a", "@b", "@c"]);
  assert.equal(feature.scenarios[1].line, 10);
  assert.deepEqual(feature.scenarios[1].steps, [step("Then", "a step", 11)]);
});

test("[happy-3] returns the background's steps on their own, not copied into the scenarios", () => {
  const text = [
    "Feature: Payouts",
    "",
    "  Background:",
    "    Given a ledger",
    "    And a fixed clock",
    "",
    "  Scenario: One",
    "    When a payout runs",
    "",
    "  Scenario: Two",
    "    Then nothing is paid",
  ].join("\n");

  assert.deepEqual(parseFeature(text), {
    name: "Payouts",
    background: [step("Given", "a ledger", 4), step("And", "a fixed clock", 5)],
    scenarios: [
      { name: "One", line: 7, tags: [], steps: [step("When", "a payout runs", 8)] },
      { name: "Two", line: 10, tags: [], steps: [step("Then", "nothing is paid", 11)] },
    ],
  });
});

test("[happy-3] a background with no steps is an empty list, not null", () => {
  const text = [
    "Feature: Payouts",
    "  Background:",
    "  Scenario: Only",
    "    Given a step",
  ].join("\n");

  const feature = parseFeature(text);
  assert.deepEqual(feature.background, []);
  assert.deepEqual(feature.scenarios, [
    { name: "Only", line: 3, tags: [], steps: [step("Given", "a step", 4)] },
  ]);
});
