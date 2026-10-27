import { test } from "node:test";
import assert from "node:assert/strict";
import { generateFeatureFile } from "../../src/index.js";

test("[happy-1] two criteria produce the exact feature text at .spec/<KEY>.feature", () => {
  const file = generateFeatureFile({
    key: "PAY-123",
    title: "Retry failed payouts",
    criteria: ["Failed payouts are retried", "Retries stop after three attempts"],
  });
  assert.equal(file.path, ".spec/PAY-123.feature");
  assert.equal(
    file.text,
    "Feature: Retry failed payouts\n" +
      "\n" +
      "  Scenario: Failed payouts are retried\n" +
      "    Then failed payouts are retried\n" +
      "\n" +
      "  Scenario: Retries stop after three attempts\n" +
      "    Then retries stop after three attempts\n",
  );
});

test("[happy-1] a single criterion gives one scenario, one trailing newline and no carriage returns", () => {
  const file = generateFeatureFile({
    key: "AB2-7",
    title: "Send receipts",
    criteria: ["Receipts are emailed"],
  });
  assert.equal(file.path, ".spec/AB2-7.feature");
  assert.equal(
    file.text,
    "Feature: Send receipts\n" +
      "\n" +
      "  Scenario: Receipts are emailed\n" +
      "    Then receipts are emailed\n",
  );
  assert.ok(!file.text.includes("\r"));
  assert.ok(!file.text.endsWith("\n\n"));
});

test("[happy-2] a plain criterion becomes one Then step with its first character lowercased", () => {
  const file = generateFeatureFile({
    key: "PAY-1",
    title: "Payouts",
    criteria: ["A payout is sent once a day"],
  });
  assert.equal(
    file.text,
    "Feature: Payouts\n" +
      "\n" +
      "  Scenario: A payout is sent once a day\n" +
      "    Then a payout is sent once a day\n",
  );
});

test("[happy-2] an all-uppercase acronym first word is left as it is", () => {
  const file = generateFeatureFile({
    key: "PAY-2",
    title: "Payouts",
    criteria: ["API errors are logged"],
  });
  assert.equal(
    file.text,
    "Feature: Payouts\n" +
      "\n" +
      "  Scenario: API errors are logged\n" +
      "    Then API errors are logged\n",
  );
});

test("[happy-2] a first word containing a digit is left as it is", () => {
  const file = generateFeatureFile({
    key: "PAY-3",
    title: "Payouts",
    criteria: ["V2 payouts are enabled"],
  });
  assert.equal(
    file.text,
    "Feature: Payouts\n" +
      "\n" +
      "  Scenario: V2 payouts are enabled\n" +
      "    Then V2 payouts are enabled\n",
  );
});

test("[happy-3] a criterion written as steps is split at its keywords and titled with the whole criterion", () => {
  const criterion =
    "Given a payout failed When the retry job runs Then it is retried And the poster is told";
  const file = generateFeatureFile({
    key: "PAY-123",
    title: "Retry failed payouts",
    criteria: [criterion],
  });
  assert.equal(
    file.text,
    "Feature: Retry failed payouts\n" +
      "\n" +
      `  Scenario: ${criterion}\n` +
      "    Given a payout failed\n" +
      "    When the retry job runs\n" +
      "    Then it is retried\n" +
      "    And the poster is told\n",
  );
});

test("[happy-3] keywords are matched ignoring case, only as whole words, and written capitalized", () => {
  const criterion =
    "given an Android device when the user opens the app then the payout shows but the balance does not";
  const file = generateFeatureFile({
    key: "PAY-5",
    title: "Mobile payouts",
    criteria: [criterion],
  });
  assert.equal(
    file.text,
    "Feature: Mobile payouts\n" +
      "\n" +
      `  Scenario: ${criterion}\n` +
      "    Given an Android device\n" +
      "    When the user opens the app\n" +
      "    Then the payout shows\n" +
      "    But the balance does not\n",
  );
});
