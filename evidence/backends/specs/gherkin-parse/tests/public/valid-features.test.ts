import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature } from "../../src/index.js";

test("[happy-1] returns feature, scenarios and every step keyword in file order", () => {
  const result = parseFeature([
    "Feature: Payouts",
    "",
    "  Scenario: Successful payout",
    "    Given an account",
    "    When a payout is requested",
    "    Then the payout succeeds",
    "    And a receipt exists",
    "    But the balance is lower",
    "    * record the payout",
    "",
    "  Scenario: Declined payout",
    "    Given an empty account",
    "    Then the payout is declined",
    "",
  ].join("\n"));

  assert.deepEqual(result, {
    name: "Payouts",
    background: null,
    scenarios: [
      {
        name: "Successful payout", line: 3, tags: [],
        steps: [
          { keyword: "Given", text: "an account", line: 4, docString: null, table: null },
          { keyword: "When", text: "a payout is requested", line: 5, docString: null, table: null },
          { keyword: "Then", text: "the payout succeeds", line: 6, docString: null, table: null },
          { keyword: "And", text: "a receipt exists", line: 7, docString: null, table: null },
          { keyword: "But", text: "the balance is lower", line: 8, docString: null, table: null },
          { keyword: "*", text: "record the payout", line: 9, docString: null, table: null },
        ],
      },
      {
        name: "Declined payout", line: 11, tags: [],
        steps: [
          { keyword: "Given", text: "an empty account", line: 12, docString: null, table: null },
          { keyword: "Then", text: "the payout is declined", line: 13, docString: null, table: null },
        ],
      },
    ],
  });
});

test("[happy-1] handles CRLF, mixed leading whitespace and no final newline", () => {
  const result = parseFeature([
    "\t Feature: Payouts",
    " \tScenario: Indented",
    "\t \tGiven  an account  ",
    " \t* record it",
  ].join("\r\n"));

  assert.equal(result.name, "Payouts");
  assert.deepEqual(result.scenarios, [{
    name: "Indented", line: 2, tags: [],
    steps: [
      { keyword: "Given", text: " an account  ", line: 3, docString: null, table: null },
      { keyword: "*", text: "record it", line: 4, docString: null, table: null },
    ],
  }]);
});

test("[happy-2] skips descriptions, comments and blanks while assigning tags", () => {
  const result = parseFeature([
    "# file comment",
    "Feature: Payouts",
    "  A description of payouts.",
    "  Another description line.",
    "",
    "  # before the tags",
    "  @happy @fast",
    "",
    "  Scenario: Tagged payout",
    "    # before the step",
    "    Given an account",
    "",
    "    Then a payout succeeds",
    "",
    "  Scenario: Untagged payout",
    "    Given another account",
    "# final comment",
  ].join("\n"));

  assert.equal(result.name, "Payouts");
  assert.deepEqual(result.scenarios, [
    {
      name: "Tagged payout", line: 9, tags: ["@happy", "@fast"],
      steps: [
        { keyword: "Given", text: "an account", line: 11, docString: null, table: null },
        { keyword: "Then", text: "a payout succeeds", line: 13, docString: null, table: null },
      ],
    },
    {
      name: "Untagged payout", line: 15, tags: [],
      steps: [
        { keyword: "Given", text: "another account", line: 16, docString: null, table: null },
      ],
    },
  ]);
});

test("[happy-2] accumulates tag lines for only the next scenario across comments and blanks", () => {
  const result = parseFeature([
    "Feature: Tags",
    "\t@one @two",
    " \t# between tag lines",
    " \t",
    "  @three",
    "Scenario: First",
    "Given text with # and @literal",
    "@four",
    "Scenario: Second",
    "Then done",
    "Scenario: Third",
    "Then done again",
  ].join("\r\n"));

  assert.deepEqual(result.scenarios.map((scenario) => scenario.tags), [
    ["@one", "@two", "@three"], ["@four"], [],
  ]);
  assert.deepEqual(result.scenarios.map((scenario) => scenario.line), [6, 9, 11]);
  assert.equal(result.scenarios[0].steps[0].text, "text with # and @literal");
  assert.equal(result.scenarios[0].steps[0].line, 7);
});

test("[happy-3] returns background steps separately from both scenarios", () => {
  const result = parseFeature([
    "Feature: Payouts",
    "  Shared setup for payouts.",
    "  Background:",
    "    Given a bank",
    "    And an account",
    "  Scenario: First",
    "    When the first payout runs",
    "  Scenario: Second",
    "    Then the second payout succeeds",
  ].join("\n"));

  assert.deepEqual(result.background, [
    { keyword: "Given", text: "a bank", line: 4, docString: null, table: null },
    { keyword: "And", text: "an account", line: 5, docString: null, table: null },
  ]);
  assert.deepEqual(result.scenarios, [
    {
      name: "First", line: 6, tags: [],
      steps: [{ keyword: "When", text: "the first payout runs", line: 7, docString: null, table: null }],
    },
    {
      name: "Second", line: 8, tags: [],
      steps: [{ keyword: "Then", text: "the second payout succeeds", line: 9, docString: null, table: null }],
    },
  ]);
});

test("[happy-3] ends an indented background at an immediately following tagged scenario", () => {
  const result = parseFeature([
    "Feature: Setup",
    "\tBackground:",
    "\t\tGiven shared setup",
    "\t@case",
    "\tScenario: Local setup",
    "\t\tGiven local setup",
  ].join("\r\n"));

  assert.deepEqual(result.background, [
    { keyword: "Given", text: "shared setup", line: 3, docString: null, table: null },
  ]);
  assert.deepEqual(result.scenarios, [{
    name: "Local setup", line: 5, tags: ["@case"],
    steps: [{ keyword: "Given", text: "local setup", line: 6, docString: null, table: null }],
  }]);
});

test("[boundary-1] dedents doc strings and keeps keyword, comment and tag lines literal", () => {
  const result = parseFeature([
    "Feature: Documents",
    "Scenario: Literal content",
    "  Given a document",
    '    """',
    "    first line",
    "      nested line",
    "    Given literal text",
    "    # literal comment",
    "    @literal",
    "    Scenario: literal scenario",
    "    Feature: literal feature",
    "    | literal table |",
    '    """',
    "  Then continue",
  ].join("\n"));

  assert.deepEqual(result.scenarios, [{
    name: "Literal content", line: 2, tags: [],
    steps: [
      {
        keyword: "Given", text: "a document", line: 3,
        docString: [
          "first line", "  nested line", "Given literal text", "# literal comment",
          "@literal", "Scenario: literal scenario", "Feature: literal feature", "| literal table |",
        ],
        table: null,
      },
      { keyword: "Then", text: "continue", line: 14, docString: null, table: null },
    ],
  }]);
});

test("[boundary-1] accepts an empty doc string with adjacent delimiters", () => {
  const result = parseFeature([
    "Feature: Documents",
    "Scenario: Empty document",
    "Given a document",
    '"""',
    '"""',
  ].join("\n"));

  assert.deepEqual(result.scenarios[0].steps, [
    { keyword: "Given", text: "a document", line: 3, docString: [], table: null },
  ]);
});

test("[boundary-1] preserves blank doc string lines and removes tab indentation with CRLF", () => {
  const result = parseFeature([
    "Feature: Documents",
    "Scenario: Indented document",
    "\tGiven a document",
    '\t\t"""',
    "\t\talpha",
    "",
    "\t\t",
    "\t\t\tomega",
    '\t\t"""',
    "\tThen finish",
  ].join("\r\n"));

  assert.deepEqual(result.scenarios[0].steps[0].docString, ["alpha", "", "", "\tomega"]);
  assert.equal(result.scenarios[0].steps[1].line, 10);
});

test("[boundary-1] attaches trimmed table rows to the preceding step only", () => {
  const result = parseFeature([
    "Feature: Tables",
    "Scenario: Rows",
    "  Given accounts",
    "    | name  | balance |",
    "    | Alice Smith |  10  |",
    "  When accounts are checked",
    "    | result |",
    "    | ready |",
    "  Then finish",
  ].join("\n"));

  assert.deepEqual(result.scenarios[0].steps, [
    {
      keyword: "Given", text: "accounts", line: 3, docString: null,
      table: [["name", "balance"], ["Alice Smith", "10"]],
    },
    {
      keyword: "When", text: "accounts are checked", line: 6, docString: null,
      table: [["result"], ["ready"]],
    },
    { keyword: "Then", text: "finish", line: 9, docString: null, table: null },
  ]);
});

test("[boundary-1] preserves empty table cells in a single CRLF row at end of input", () => {
  const result = parseFeature([
    "Feature: Tables",
    "Scenario: Empty cells",
    "Given a row",
    "\t|  | middle value |\t|",
  ].join("\r\n"));

  assert.deepEqual(result.scenarios[0].steps, [
    {
      keyword: "Given", text: "a row", line: 3, docString: null,
      table: [["", "middle value", ""]],
    },
  ]);
});

test("[boundary-2] parses the feature-only input with no scenarios or background", () => {
  assert.deepEqual(parseFeature("Feature: Empty"), {
    name: "Empty", background: null, scenarios: [],
  });
});

test("[boundary-2] keeps a feature empty when surrounded by blanks, comments and description", () => {
  assert.deepEqual(parseFeature([
    "",
    "\t# file comment",
    " \tFeature: Empty",
    "  A description without scenarios.",
    " \t",
    "  # final comment",
    "",
  ].join("\r\n")), {
    name: "Empty", background: null, scenarios: [],
  });
});
