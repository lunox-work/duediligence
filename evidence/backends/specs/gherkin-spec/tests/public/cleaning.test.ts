import { test } from "node:test";
import assert from "node:assert/strict";
import { generateFeatureFile } from "../../src/index.js";

test("[boundary-1] removes each specified list marker and collapses whitespace", () => {
  const result = generateFeatureFile({
    key: "PAY-123",
    title: " \tPayout\r\n  checks  ",
    criteria: [
      " \t- a\t passes \n",
      "\n *  b\npasses\t",
      " 1. c\r\n passes ",
      "\t2) d   passes\n",
      " [ ] e\t\tpasses ",
      "\n[x] f \n passes\t",
    ],
  });

  assert.equal(
    result.text,
    "Feature: Payout checks\n" +
      "\n  Scenario: a passes\n    Then a passes\n" +
      "\n  Scenario: b passes\n    Then b passes\n" +
      "\n  Scenario: c passes\n    Then c passes\n" +
      "\n  Scenario: d passes\n    Then d passes\n" +
      "\n  Scenario: e passes\n    Then e passes\n" +
      "\n  Scenario: f passes\n    Then f passes\n",
  );
});

test("[boundary-1] removes a marker only once and leaves markers inside criteria intact", () => {
  const result = generateFeatureFile({
    key: "PAY-123",
    title: "Payouts",
    criteria: ["- - a", "* [x] b", "A payout - keeps * its markers"],
  });

  assert.equal(
    result.text,
    "Feature: Payouts\n" +
      "\n  Scenario: - a\n    Then - a\n" +
      "\n  Scenario: [x] b\n    Then [x] b\n" +
      "\n  Scenario: A payout - keeps * its markers\n    Then a payout - keeps * its markers\n",
  );
});

test("[boundary-1] retains title list markers and cleans a criterion before detecting steps", () => {
  const result = generateFeatureFile({
    key: "PAY-123",
    title: " \t-  Payout\n checks ",
    criteria: [" \t[x]  gIvEn a\npayout \t wHeN it arrives\r\n tHeN it is queued  "],
  });

  assert.equal(
    result.text,
    "Feature: - Payout checks\n" +
      "\n  Scenario: gIvEn a payout wHeN it arrives tHeN it is queued\n" +
      "    Given a payout\n" +
      "    When it arrives\n" +
      "    Then it is queued\n",
  );
});

test("[boundary-2] omits empty criteria before, between, and after real criteria", () => {
  const result = generateFeatureFile({
    key: "PAY-123",
    title: "Payouts",
    criteria: ["", " \t\n", "First payout", "- \t", "[ ] \n", "Second payout", "[x] \t", ""],
  });

  assert.equal(
    result.text,
    "Feature: Payouts\n" +
      "\n  Scenario: First payout\n    Then first payout\n" +
      "\n  Scenario: Second payout\n    Then second payout\n",
  );
});

test("[boundary-2] suffixes repeated titles from the second occurrence without changing steps", () => {
  const result = generateFeatureFile({
    key: "PAY-123",
    title: "Payouts",
    criteria: ["A payout", "A payout", "A payout", "A payout"],
  });

  assert.equal(
    result.text,
    "Feature: Payouts\n" +
      "\n  Scenario: A payout\n    Then a payout\n" +
      "\n  Scenario: A payout (2)\n    Then a payout\n" +
      "\n  Scenario: A payout (3)\n    Then a payout\n" +
      "\n  Scenario: A payout (4)\n    Then a payout\n",
  );
});

test("[boundary-2] counts duplicates after cleaning and maintains a separate count per title", () => {
  const result = generateFeatureFile({
    key: "PAY-123",
    title: "Payouts",
    criteria: ["- A payout", "Other payout", "", "\t[x] A\n payout ", "* Other\tpayout", "1. A payout"],
  });

  assert.equal(
    result.text,
    "Feature: Payouts\n" +
      "\n  Scenario: A payout\n    Then a payout\n" +
      "\n  Scenario: Other payout\n    Then other payout\n" +
      "\n  Scenario: A payout (2)\n    Then a payout\n" +
      "\n  Scenario: Other payout (2)\n    Then other payout\n" +
      "\n  Scenario: A payout (3)\n    Then a payout\n",
  );
});
