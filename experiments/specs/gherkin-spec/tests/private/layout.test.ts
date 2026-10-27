import { test } from "node:test";
import assert from "node:assert/strict";
import { generateFeatureFile } from "../../src/index.js";

function scenario(title: string, ...steps: string[]): string {
  return "\n" + `  Scenario: ${title}\n` + steps.map((step) => `    ${step}\n`).join("");
}

function oneCriterion(criterion: string): string {
  return generateFeatureFile({ key: "PAY-9", title: "Payouts", criteria: [criterion] }).text;
}

// Extends public "[happy-1] two criteria produce the exact feature text at .spec/<KEY>.feature"
test("[happy-1] five criteria keep their order, each in its own scenario, under another key", () => {
  const file = generateFeatureFile({
    key: "OPS-42",
    title: "Operations dashboard",
    criteria: [
      "Charts load in under a second",
      "Exports are CSV files",
      "Filters persist across reloads",
      "Errors show a banner",
      "Totals match the ledger",
    ],
  });
  assert.equal(file.path, ".spec/OPS-42.feature");
  assert.equal(
    file.text,
    "Feature: Operations dashboard\n" +
      "\n" +
      "  Scenario: Charts load in under a second\n" +
      "    Then charts load in under a second\n" +
      "\n" +
      "  Scenario: Exports are CSV files\n" +
      "    Then exports are CSV files\n" +
      "\n" +
      "  Scenario: Filters persist across reloads\n" +
      "    Then filters persist across reloads\n" +
      "\n" +
      "  Scenario: Errors show a banner\n" +
      "    Then errors show a banner\n" +
      "\n" +
      "  Scenario: Totals match the ledger\n" +
      "    Then totals match the ledger\n",
  );
});

// Extends public "[happy-1] two criteria produce the exact feature text at .spec/<KEY>.feature"
test("[happy-1] the path is .spec/ followed by the key and .feature for other valid keys", () => {
  for (const key of ["A-1", "Z9-0", "ABC123-000045", "X1Y2-9", "LONGPROJECT-987654321"]) {
    const file = generateFeatureFile({ key, title: "Payouts", criteria: ["Payouts are sent"] });
    assert.equal(file.path, `.spec/${key}.feature`);
    assert.equal(
      file.text,
      "Feature: Payouts\n" + "\n" + "  Scenario: Payouts are sent\n" + "    Then payouts are sent\n",
    );
  }
});

// Extends public "[happy-1] a single criterion gives one scenario, one trailing newline and no carriage returns"
test("[happy-1] criteria with CRLF line breaks, plain and in steps, give no carriage returns and one trailing newline", () => {
  const file = generateFeatureFile({
    key: "AB2-8",
    title: "Send\r\nreceipts",
    criteria: [
      "Receipts are emailed\r\n",
      "Given a receipt\r\nWhen it bounces\r\nThen support is told",
      "Refunds\r\nare logged\r\n",
    ],
  });
  assert.equal(file.path, ".spec/AB2-8.feature");
  assert.equal(
    file.text,
    "Feature: Send receipts\n" +
      "\n" +
      "  Scenario: Receipts are emailed\n" +
      "    Then receipts are emailed\n" +
      "\n" +
      "  Scenario: Given a receipt When it bounces Then support is told\n" +
      "    Given a receipt\n" +
      "    When it bounces\n" +
      "    Then support is told\n" +
      "\n" +
      "  Scenario: Refunds are logged\n" +
      "    Then refunds are logged\n",
  );
  assert.ok(!file.text.includes("\r"));
  assert.ok(file.text.endsWith("\n"));
  assert.ok(!file.text.endsWith("\n\n"));
});

// Extends public "[happy-1] a single criterion gives one scenario, one trailing newline and no carriage returns"
test("[happy-1] twenty criteria give twenty scenarios, each after one empty line", () => {
  const criteria: string[] = [];
  let expected = "Feature: Ledger entries\n";
  for (let i = 1; i <= 20; i++) {
    criteria.push(`Entry number ${i} is shown`);
    expected += scenario(`Entry number ${i} is shown`, `Then entry number ${i} is shown`);
  }
  const file = generateFeatureFile({ key: "LED-2000", title: "Ledger entries", criteria });
  assert.equal(file.path, ".spec/LED-2000.feature");
  assert.equal(file.text, expected);
  assert.ok(!file.text.endsWith("\n\n"));
});

// Extends public "[happy-2] a plain criterion becomes one Then step with its first character lowercased"
test("[happy-2] only the first character is lowercased; later capitals are kept", () => {
  assert.equal(
    oneCriterion("Payouts reach Stripe and PayPal"),
    "Feature: Payouts\n" +
      scenario("Payouts reach Stripe and PayPal", "Then payouts reach Stripe and PayPal"),
  );
  assert.equal(oneCriterion("Done"), "Feature: Payouts\n" + scenario("Done", "Then done"));
});

// Extends public "[happy-2] a plain criterion becomes one Then step with its first character lowercased"
test("[happy-2] a criterion already starting in lowercase is kept as it is in its step", () => {
  assert.equal(
    oneCriterion("payouts are sent in EUR"),
    "Feature: Payouts\n" + scenario("payouts are sent in EUR", "Then payouts are sent in EUR"),
  );
});

// Extends public "[happy-2] an all-uppercase acronym first word is left as it is"
test("[happy-2] other first words of two or more uppercase letters are left as they are", () => {
  assert.equal(
    oneCriterion("UTC timestamps are stored"),
    "Feature: Payouts\n" + scenario("UTC timestamps are stored", "Then UTC timestamps are stored"),
  );
  assert.equal(
    oneCriterion("OK responses are cached"),
    "Feature: Payouts\n" + scenario("OK responses are cached", "Then OK responses are cached"),
  );
  assert.equal(
    oneCriterion("HTTPS is required"),
    "Feature: Payouts\n" + scenario("HTTPS is required", "Then HTTPS is required"),
  );
  assert.equal(oneCriterion("SLA"), "Feature: Payouts\n" + scenario("SLA", "Then SLA"));
});

// Extends public "[happy-2] an all-uppercase acronym first word is left as it is":
// a shortcut that only looks at the first two letters keeps "APIs".
test("[happy-2] a first word with a lowercase letter after its capitals has its first character lowercased", () => {
  assert.equal(
    oneCriterion("APIs are versioned"),
    "Feature: Payouts\n" + scenario("APIs are versioned", "Then aPIs are versioned"),
  );
});

// Extends public "[happy-2] an all-uppercase acronym first word is left as it is":
// only the first word decides, not a later acronym.
test("[happy-2] an acronym after the first word does not keep the first character", () => {
  assert.equal(
    oneCriterion("Every API error is logged"),
    "Feature: Payouts\n" + scenario("Every API error is logged", "Then every API error is logged"),
  );
});

// Extends public "[happy-2] a first word containing a digit is left as it is"
test("[happy-2] a first word with a digit anywhere in it is left as it is", () => {
  assert.equal(
    oneCriterion("Payout2 runs nightly"),
    "Feature: Payouts\n" + scenario("Payout2 runs nightly", "Then Payout2 runs nightly"),
  );
  assert.equal(
    oneCriterion("2FA is required"),
    "Feature: Payouts\n" + scenario("2FA is required", "Then 2FA is required"),
  );
  assert.equal(
    oneCriterion("S3 buckets are private"),
    "Feature: Payouts\n" + scenario("S3 buckets are private", "Then S3 buckets are private"),
  );
  assert.equal(
    oneCriterion("Batch10x is faster"),
    "Feature: Payouts\n" + scenario("Batch10x is faster", "Then Batch10x is faster"),
  );
});

// Extends public "[happy-2] a first word containing a digit is left as it is":
// a digit in a later word does not keep the first character.
test("[happy-2] a digit after the first word does not keep the first character", () => {
  assert.equal(
    oneCriterion("Retries stop after 3 attempts"),
    "Feature: Payouts\n" +
      scenario("Retries stop after 3 attempts", "Then retries stop after 3 attempts"),
  );
});

// Extends public "[happy-3] keywords are matched ignoring case, only as whole words, and written capitalized":
// only Given, When or Then as the first word make a criterion steps.
test("[happy-2] a criterion whose first word is And or But becomes one lowercased Then step", () => {
  assert.equal(
    oneCriterion("And the poster is told"),
    "Feature: Payouts\n" + scenario("And the poster is told", "Then and the poster is told"),
  );
  assert.equal(
    oneCriterion("But refunds are not retried"),
    "Feature: Payouts\n" +
      scenario("But refunds are not retried", "Then but refunds are not retried"),
  );
});

// Extends public "[happy-3] keywords are matched ignoring case, only as whole words, and written capitalized"
test("[happy-2] a first word that only begins with a keyword is not written in steps", () => {
  assert.equal(
    oneCriterion("Whenever a payout fails then it is retried"),
    "Feature: Payouts\n" +
      scenario(
        "Whenever a payout fails then it is retried",
        "Then whenever a payout fails then it is retried",
      ),
  );
  assert.equal(
    oneCriterion("Givens are paid when due"),
    "Feature: Payouts\n" + scenario("Givens are paid when due", "Then givens are paid when due"),
  );
  assert.equal(
    oneCriterion("Thenable results resolve and settle"),
    "Feature: Payouts\n" +
      scenario("Thenable results resolve and settle", "Then thenable results resolve and settle"),
  );
});

// Extends public "[happy-3] a criterion written as steps is split at its keywords and titled with the whole criterion"
test("[happy-2] a plain criterion with keywords after its first word is not split", () => {
  assert.equal(
    oneCriterion("Payouts stop when the limit is hit and then resume but given notice"),
    "Feature: Payouts\n" +
      scenario(
        "Payouts stop when the limit is hit and then resume but given notice",
        "Then payouts stop when the limit is hit and then resume but given notice",
      ),
  );
});

// Extends public "[happy-3] a criterion written as steps is split at its keywords and titled with the whole criterion"
test("[happy-3] every keyword is split on, including repeated And", () => {
  const criterion =
    "Given a payout failed And the payee is verified When the retry job runs Then it is retried And the poster is told But the fee is not charged again";
  assert.equal(
    oneCriterion(criterion),
    "Feature: Payouts\n" +
      scenario(
        criterion,
        "Given a payout failed",
        "And the payee is verified",
        "When the retry job runs",
        "Then it is retried",
        "And the poster is told",
        "But the fee is not charged again",
      ),
  );
});

// Extends public "[happy-3] a criterion written as steps is split at its keywords and titled with the whole criterion"
test("[happy-3] a criterion may start with When or Then and repeat keywords in any order", () => {
  const whenFirst = "When the job runs Given a lock Then it waits When the lock frees Then it runs";
  assert.equal(
    oneCriterion(whenFirst),
    "Feature: Payouts\n" +
      scenario(
        whenFirst,
        "When the job runs",
        "Given a lock",
        "Then it waits",
        "When the lock frees",
        "Then it runs",
      ),
  );
  const thenFirst = "Then the payout is sent";
  assert.equal(
    oneCriterion(thenFirst),
    "Feature: Payouts\n" + scenario(thenFirst, "Then the payout is sent"),
  );
});

// Extends public "[happy-3] keywords are matched ignoring case, only as whole words, and written capitalized"
test("[happy-3] keywords in upper or mixed case are written capitalized", () => {
  const criterion = "THEN the payout is sent AND the ledger is updated bUt no email goes out wHEN quiet GIVEN night";
  assert.equal(
    oneCriterion(criterion),
    "Feature: Payouts\n" +
      scenario(
        criterion,
        "Then the payout is sent",
        "And the ledger is updated",
        "But no email goes out",
        "When quiet",
        "Given night",
      ),
  );
});

// Extends public "[happy-3] keywords are matched ignoring case, only as whole words, and written capitalized"
test("[happy-3] words that contain a keyword are not split", () => {
  const criterion =
    "Given Andrew is a Butler whenever forgiven Then thenceforth he is paid with candy and butter";
  assert.equal(
    oneCriterion(criterion),
    "Feature: Payouts\n" +
      scenario(
        criterion,
        "Given Andrew is a Butler whenever forgiven",
        "Then thenceforth he is paid with candy",
        "And butter",
      ),
  );
});

// Extends public "[happy-3] a criterion written as steps is split at its keywords and titled with the whole criterion"
test("[happy-3] the text after each keyword is kept as written", () => {
  const criterion = "Given Stripe is down When API calls fail Then CSV exports retry";
  assert.equal(
    oneCriterion(criterion),
    "Feature: Payouts\n" +
      scenario(criterion, "Given Stripe is down", "When API calls fail", "Then CSV exports retry"),
  );
});

// Extends public "[happy-3] a criterion written as steps is split at its keywords and titled with the whole criterion"
test("[happy-3] steps criteria and plain criteria mix in one file", () => {
  const file = generateFeatureFile({
    key: "PAY-77",
    title: "Retry failed payouts",
    criteria: [
      "Failed payouts are retried",
      "Given a payout failed When the retry job runs Then it is retried",
      "Retries stop after three attempts",
    ],
  });
  assert.equal(
    file.text,
    "Feature: Retry failed payouts\n" +
      scenario("Failed payouts are retried", "Then failed payouts are retried") +
      scenario(
        "Given a payout failed When the retry job runs Then it is retried",
        "Given a payout failed",
        "When the retry job runs",
        "Then it is retried",
      ) +
      scenario("Retries stop after three attempts", "Then retries stop after three attempts"),
  );
});
