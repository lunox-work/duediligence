import { test } from "node:test";
import assert from "node:assert/strict";
import { generateFeatureFile } from "../../src/index.js";

test("[happy-2] makes one Then step and lowercases only the first character", () => {
  const result = generateFeatureFile({
    key: "PAY-123",
    title: "Payouts",
    criteria: ["A payout is READY", "Retry FAILED payouts", "already complete"],
  });

  assert.equal(
    result.text,
    "Feature: Payouts\n" +
      "\n  Scenario: A payout is READY\n    Then a payout is READY\n" +
      "\n  Scenario: Retry FAILED payouts\n    Then retry FAILED payouts\n" +
      "\n  Scenario: already complete\n    Then already complete\n",
  );
});

test("[happy-2] preserves initial acronyms and words containing digits", () => {
  for (const criterion of ["API responds", "UTC is used", "JSON is returned", "2FA is required", "P2P works", "Version2 works", "v2 works"]) {
    const result = generateFeatureFile({
      key: "PAY-123",
      title: "Payouts",
      criteria: [criterion],
    });

    assert.equal(
      result.text,
      `Feature: Payouts\n\n  Scenario: ${criterion}\n    Then ${criterion}\n`,
    );
  }
});

test("[happy-2] lowercases a single uppercase letter because it is not an acronym", () => {
  const result = generateFeatureFile({ key: "PAY-123", title: "Payouts", criteria: ["A"] });

  assert.equal(result.text, "Feature: Payouts\n\n  Scenario: A\n    Then a\n");
});

test("[happy-2] does not split criteria starting with And, But, or a keyword prefix", () => {
  for (const [criterion, step] of [
    ["And a payout When ready", "and a payout When ready"],
    ["But retries Then stop", "but retries Then stop"],
    ["Givenchy works When requested", "givenchy works When requested"],
    ["Payouts When ready Then finish", "payouts When ready Then finish"],
  ]) {
    const result = generateFeatureFile({ key: "PAY-123", title: "Payouts", criteria: [criterion] });

    assert.equal(
      result.text,
      `Feature: Payouts\n\n  Scenario: ${criterion}\n    Then ${step}\n`,
    );
  }
});

test("[happy-3] splits the example into four steps while retaining the whole scenario title", () => {
  const criterion = "Given a payout failed When the retry job runs Then it is retried And the poster is told";
  const result = generateFeatureFile({ key: "PAY-123", title: "Payouts", criteria: [criterion] });

  assert.equal(
    result.text,
    `Feature: Payouts\n\n  Scenario: ${criterion}\n` +
      "    Given a payout failed\n" +
      "    When the retry job runs\n" +
      "    Then it is retried\n" +
      "    And the poster is told\n",
  );
});

test("[happy-3] recognizes all five keywords without regard to case and capitalizes each keyword", () => {
  const criterion = "gIvEn a READY payout wHeN the JOB runs tHeN it succeeds aNd the API responds bUt no DUPLICATE is sent";
  const result = generateFeatureFile({ key: "PAY-123", title: "Payouts", criteria: [criterion] });

  assert.equal(
    result.text,
    `Feature: Payouts\n\n  Scenario: ${criterion}\n` +
      "    Given a READY payout\n" +
      "    When the JOB runs\n" +
      "    Then it succeeds\n" +
      "    And the API responds\n" +
      "    But no DUPLICATE is sent\n",
  );
});

test("[happy-3] leaves keyword substrings within words intact", () => {
  const criterion = "Given Givenchy andrew Butcher Whenever Then candy remains";
  const result = generateFeatureFile({ key: "PAY-123", title: "Payouts", criteria: [criterion] });

  assert.equal(
    result.text,
    `Feature: Payouts\n\n  Scenario: ${criterion}\n` +
      "    Given Givenchy andrew Butcher Whenever\n" +
      "    Then candy remains\n",
  );
});

test("[happy-3] accepts When or Then as the initial keyword", () => {
  for (const [criterion, steps] of [
    ["wHeN a payout arrives tHeN it is queued", "    When a payout arrives\n    Then it is queued\n"],
    ["tHeN it is queued aNd the poster is told", "    Then it is queued\n    And the poster is told\n"],
  ]) {
    const result = generateFeatureFile({ key: "PAY-123", title: "Payouts", criteria: [criterion] });

    assert.equal(result.text, `Feature: Payouts\n\n  Scenario: ${criterion}\n${steps}`);
  }
});
