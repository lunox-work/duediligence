import { test } from "node:test";
import assert from "node:assert/strict";
import { generateFeatureFile } from "../../src/index.js";

test("[boundary-1] list markers and stray whitespace are removed from criteria", () => {
  const file = generateFeatureFile({
    key: "PAY-10",
    title: "Markers",
    criteria: [
      "- Alpha is sent",
      "  *\tBeta is sent  ",
      "1.  Gamma\nis sent",
      "2) Delta  \t is sent",
      "\n[ ] Epsilon is sent",
      "[x]   Zeta   is\r\nsent ",
    ],
  });
  assert.equal(
    file.text,
    "Feature: Markers\n" +
      "\n" +
      "  Scenario: Alpha is sent\n" +
      "    Then alpha is sent\n" +
      "\n" +
      "  Scenario: Beta is sent\n" +
      "    Then beta is sent\n" +
      "\n" +
      "  Scenario: Gamma is sent\n" +
      "    Then gamma is sent\n" +
      "\n" +
      "  Scenario: Delta is sent\n" +
      "    Then delta is sent\n" +
      "\n" +
      "  Scenario: Epsilon is sent\n" +
      "    Then epsilon is sent\n" +
      "\n" +
      "  Scenario: Zeta is sent\n" +
      "    Then zeta is sent\n",
  );
});

test("[boundary-1] the title is cleaned of whitespace but keeps its list marker", () => {
  const file = generateFeatureFile({
    key: "PAY-11",
    title: "  - Payout\t\treport \n",
    criteria: ["Reports are sent"],
  });
  assert.equal(
    file.text,
    "Feature: - Payout report\n" +
      "\n" +
      "  Scenario: Reports are sent\n" +
      "    Then reports are sent\n",
  );
});

test("[boundary-1] a list marker is removed only once", () => {
  const file = generateFeatureFile({
    key: "PAY-12",
    title: "Markers",
    criteria: ["- - Payouts are retried"],
  });
  assert.equal(
    file.text,
    "Feature: Markers\n" +
      "\n" +
      "  Scenario: - Payouts are retried\n" +
      "    Then - Payouts are retried\n",
  );
});

test("[boundary-2] empty criteria are skipped and repeated titles are numbered", () => {
  const file = generateFeatureFile({
    key: "PAY-20",
    title: "Retries",
    criteria: [
      "",
      "Payouts are retried",
      "   ",
      "Payouts are retried",
      "\t\n",
      "Payouts are retried",
    ],
  });
  assert.equal(
    file.text,
    "Feature: Retries\n" +
      "\n" +
      "  Scenario: Payouts are retried\n" +
      "    Then payouts are retried\n" +
      "\n" +
      "  Scenario: Payouts are retried (2)\n" +
      "    Then payouts are retried\n" +
      "\n" +
      "  Scenario: Payouts are retried (3)\n" +
      "    Then payouts are retried\n",
  );
});

test("[boundary-2] criteria that differ only before cleaning count as repeated", () => {
  const file = generateFeatureFile({
    key: "PAY-21",
    title: "Retries",
    criteria: ["Payouts  are retried", "- Payouts are\tretried"],
  });
  assert.equal(
    file.text,
    "Feature: Retries\n" +
      "\n" +
      "  Scenario: Payouts are retried\n" +
      "    Then payouts are retried\n" +
      "\n" +
      "  Scenario: Payouts are retried (2)\n" +
      "    Then payouts are retried\n",
  );
});
