import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature } from "../../src/index.js";
import type { Feature, Step } from "../../src/index.js";

function step(keyword: Step["keyword"], text: string, line: number): Step {
  return { keyword, text, line, docString: null, table: null };
}

// Extends public "[happy-1] returns the feature name and its scenarios with their steps and lines in file order":
// another feature name, three scenarios, every keyword, and lines that do not follow the public layout.
test("[happy-1] three scenarios under another feature name keep their names, lines and steps in order", () => {
  const text = [
    "Feature: Refunds",
    "",
    "",
    "  Scenario: Full refund",
    "    * a paid order",
    "    When the customer asks for a refund",
    "    And the order is unshipped",
    "    Then the full amount is returned",
    "    But the fee is kept",
    "",
    "  Scenario: Partial refund",
    "    Given a paid order of 80",
    "    When 30 is refunded",
    "    Then 50 remains",
    "  Scenario: No refund",
    "    Given a shipped order",
    "    Then nothing is returned",
  ].join("\n");

  const expected: Feature = {
    name: "Refunds",
    background: null,
    scenarios: [
      {
        name: "Full refund",
        line: 4,
        tags: [],
        steps: [
          step("*", "a paid order", 5),
          step("When", "the customer asks for a refund", 6),
          step("And", "the order is unshipped", 7),
          step("Then", "the full amount is returned", 8),
          step("But", "the fee is kept", 9),
        ],
      },
      {
        name: "Partial refund",
        line: 11,
        tags: [],
        steps: [
          step("Given", "a paid order of 80", 12),
          step("When", "30 is refunded", 13),
          step("Then", "50 remains", 14),
        ],
      },
      {
        name: "No refund",
        line: 15,
        tags: [],
        steps: [step("Given", "a shipped order", 16), step("Then", "nothing is returned", 17)],
      },
    ],
  };

  assert.deepEqual(parseFeature(text), expected);
});

// Extends public "[happy-1] returns the feature name and its scenarios ...": many more scenarios.
test("[happy-1] forty scenarios are returned in file order with their lines", () => {
  const lines = ["Feature: Bulk"];
  for (let i = 0; i < 40; i++) {
    lines.push(`  Scenario: Case ${i}`, `    Given value ${i}`, `    Then result ${i * 2}`, "");
  }
  const feature = parseFeature(lines.join("\n"));

  assert.equal(feature.name, "Bulk");
  assert.equal(feature.scenarios.length, 40);
  feature.scenarios.forEach((scenario, i) => {
    const at = 2 + i * 4;
    assert.deepEqual(scenario, {
      name: `Case ${i}`,
      line: at,
      tags: [],
      steps: [step("Given", `value ${i}`, at + 1), step("Then", `result ${i * 2}`, at + 2)],
    });
  });
});

// Extends public "[happy-1] reads CRLF line endings and tab indentation ...": colons in the feature name,
// an indented Feature: line, and "\n" and "\r\n" mixed in one file.
test("[happy-1] mixed LF and CRLF endings, an indented Feature: line and colons in names", () => {
  const text =
    " \tFeature: Ledger: nightly run\r\n" +
    "\n" +
    "  Scenario: Close: the day\n" +
    "    Given an open day\r\n" +
    "\t\tWhen it closes\n" +
    "    Then the totals are posted\r\n";

  assert.deepEqual(parseFeature(text), {
    name: "Ledger: nightly run",
    background: null,
    scenarios: [
      {
        name: "Close: the day",
        line: 3,
        tags: [],
        steps: [
          step("Given", "an open day", 4),
          step("When", "it closes", 5),
          step("Then", "the totals are posted", 6),
        ],
      },
    ],
  });
});

// Extends public "[happy-1] a step's text is what follows the keyword and exactly one space":
// other keywords and other numbers of extra spaces.
test("[happy-1] only one space after each keyword is dropped from the step's text", () => {
  const text = [
    "Feature: Spacing",
    "  Scenario: More spacing",
    "    When   three spaces",
    "    Then  two spaces",
    "    And a  double  gap inside",
    "    But    four",
    "    *  star with two",
  ].join("\n");

  const steps = parseFeature(text).scenarios[0].steps;
  assert.deepEqual(
    steps.map((s) => [s.keyword, s.text]),
    [
      ["When", "  three spaces"],
      ["Then", " two spaces"],
      ["And", "a  double  gap inside"],
      ["But", "   four"],
      ["*", " star with two"],
    ],
  );
});

// Extends public "[happy-1] returns the feature name ...": the text after the keyword is kept whole,
// even when it holds other keywords, "#", "@", "|" or quotes.
test("[happy-1] a step's text keeps keywords, '#', '@', '|' and quotes that follow the keyword", () => {
  const text = [
    "Feature: Texts",
    "  Scenario: Odd texts",
    "    Given When Then",
    "    And Scenario: inside a step",
    "    Then a # sign is not a comment",
    "    But mail goes to ops@example.com",
    "    * Given",
    "    When a | pipe and \"\"\" quotes appear",
  ].join("\n");

  assert.deepEqual(parseFeature(text).scenarios[0].steps, [
    step("Given", "When Then", 3),
    step("And", "Scenario: inside a step", 4),
    step("Then", "a # sign is not a comment", 5),
    step("But", "mail goes to ops@example.com", 6),
    step("*", "Given", 7),
    step("When", "a | pipe and \"\"\" quotes appear", 8),
  ]);
});

// Extends public "[happy-1] returns the feature name ...": a scenario with no steps.
test("[happy-1] a scenario with no steps has an empty list of steps", () => {
  const text = [
    "Feature: Drafts",
    "  Scenario: Not written yet",
    "  Scenario: Written",
    "    Given a step",
    "  Scenario: Also not written",
  ].join("\n");

  assert.deepEqual(parseFeature(text).scenarios, [
    { name: "Not written yet", line: 2, tags: [], steps: [] },
    { name: "Written", line: 3, tags: [], steps: [step("Given", "a step", 4)] },
    { name: "Also not written", line: 5, tags: [], steps: [] },
  ]);
});

// Extends public "[happy-2] skips comments, descriptions and blank lines, and gives tags to the next scenario":
// a description that runs straight into a tag line, tag lines indented with tabs, several spaces between tags.
test("[happy-2] a description ended by a tag line is skipped and tags separated by several spaces are read", () => {
  const text = [
    "Feature: Payouts",
    "  Payouts move money out.",
    "",
    "  Backgrounds and Scenarios are described below.",
    "  Amounts are in # of cents, sent to @finance.",
    "\t@nightly   @slow",
    "\t@issue-42",
    "  Scenario: Nightly batch",
    "    Given a batch",
  ].join("\n");

  const feature = parseFeature(text);
  assert.equal(feature.name, "Payouts");
  assert.equal(feature.background, null);
  assert.equal(feature.scenarios.length, 1);
  assert.equal(feature.scenarios[0].name, "Nightly batch");
  assert.equal(feature.scenarios[0].line, 8);
  assert.deepEqual([...feature.scenarios[0].tags].sort(), ["@issue-42", "@nightly", "@slow"]);
  assert.deepEqual(feature.scenarios[0].steps, [step("Given", "a batch", 9)]);
});

// Extends public "[happy-2] ... gives tags to the next scenario": tags go to the next scenario only,
// in the middle of three scenarios.
test("[happy-2] tags belong only to the next scenario, not to the one before or the ones after", () => {
  const text = [
    "Feature: Payouts",
    "  Scenario: First",
    "    Given a step",
    "  @middle",
    "  Scenario: Second",
    "    Given a step",
    "  Scenario: Third",
    "    Given a step",
    "  @last @really",
    "  Scenario: Fourth",
    "    Given a step",
  ].join("\n");

  const feature = parseFeature(text);
  assert.deepEqual(
    feature.scenarios.map((s) => [s.name, [...s.tags].sort()]),
    [
      ["First", []],
      ["Second", ["@middle"]],
      ["Third", []],
      ["Fourth", ["@last", "@really"]],
    ],
  );
});

// Extends public "[happy-2] comments that look like keywords are skipped ...": comments that look like
// a second Feature:, a Scenario Outline: or a doc string, anywhere in the file, are not errors.
test("[happy-2] comments that look like Feature:, Scenario Outline: or doc string lines are skipped", () => {
  const text = [
    "Feature: Payouts",
    "# Feature: not a second feature",
    "  Background:",
    "    # Scenario Outline: not an outline",
    "    Given a ledger",
    "\t#\t\"\"\"",
    "#",
    "  Scenario: Only",
    "    #| not | a table |",
    "    Given a step",
    "    # Examples:",
  ].join("\n");

  assert.deepEqual(parseFeature(text), {
    name: "Payouts",
    background: [step("Given", "a ledger", 5)],
    scenarios: [{ name: "Only", line: 8, tags: [], steps: [step("Given", "a step", 10)] }],
  });
});

// Extends public "[happy-2] skips comments, descriptions and blank lines ...": a description that runs
// straight into Scenario:, with no comment or tag between them.
test("[happy-2] a description directly followed by Scenario: is skipped", () => {
  const text = [
    "Feature: Payouts",
    "  The first description line.",
    "  The second description line, mentioning Scenario and Background.",
    "  Scenario: Straight after",
    "    Then it is read",
  ].join("\n");

  assert.deepEqual(parseFeature(text), {
    name: "Payouts",
    background: null,
    scenarios: [{ name: "Straight after", line: 4, tags: [], steps: [step("Then", "it is read", 5)] }],
  });
});

// Extends public "[happy-2] skips ... blank lines": blank lines made of spaces and tabs.
test("[happy-2] lines holding only spaces and tabs are blank and skipped", () => {
  const text = [
    "Feature: Payouts",
    "   ",
    "  Scenario: Spaced",
    "\t",
    "    Given a step",
    " \t ",
    "    Then another",
  ].join("\n");

  assert.deepEqual(parseFeature(text).scenarios, [
    {
      name: "Spaced",
      line: 3,
      tags: [],
      steps: [step("Given", "a step", 5), step("Then", "another", 7)],
    },
  ]);
});

// Extends public "[happy-3] returns the background's steps on their own ...": a background after a
// description and a comment, every keyword, comments and blank lines inside it, and tagged scenarios.
test("[happy-3] a background after a description holds its steps and the scenarios hold only their own", () => {
  const text = [
    "Feature: Transfers",
    "  Money moves between accounts.",
    "  # setup follows",
    "  Background:",
    "    Given a ledger",
    "    # a comment in the background",
    "",
    "    And two accounts",
    "    But no transfers yet",
    "    * a fixed clock",
    "",
    "  @fast",
    "  Scenario: Transfer",
    "    When 10 moves",
    "    Then both balances change",
    "  Scenario: Reject",
    "    When 1000 moves",
    "  Scenario: Idle",
  ].join("\n");

  assert.deepEqual(parseFeature(text), {
    name: "Transfers",
    background: [
      step("Given", "a ledger", 5),
      step("And", "two accounts", 8),
      step("But", "no transfers yet", 9),
      step("*", "a fixed clock", 10),
    ],
    scenarios: [
      {
        name: "Transfer",
        line: 13,
        tags: ["@fast"],
        steps: [step("When", "10 moves", 14), step("Then", "both balances change", 15)],
      },
      { name: "Reject", line: 16, tags: [], steps: [step("When", "1000 moves", 17)] },
      { name: "Idle", line: 18, tags: [], steps: [] },
    ],
  });
});

// Extends public "[happy-3] returns the background's steps on their own ...": a background and no scenarios.
test("[happy-3] a background with steps and no scenarios is returned with an empty list of scenarios", () => {
  const text = ["Feature: Setup only", "Background:", "  Given a ledger", "  When nothing else happens", ""].join(
    "\r\n",
  );

  assert.deepEqual(parseFeature(text), {
    name: "Setup only",
    background: [step("Given", "a ledger", 3), step("When", "nothing else happens", 4)],
    scenarios: [],
  });
});

// Extends public "[happy-3] a background with no steps is an empty list, not null": the empty background
// is followed by comments and blank lines, and there are no scenarios.
test("[happy-3] an empty background followed only by comments is an empty list", () => {
  const text = ["Feature: Payouts", "", "  Background:", "", "  # nothing yet", ""].join("\n");

  assert.deepEqual(parseFeature(text), { name: "Payouts", background: [], scenarios: [] });
});
