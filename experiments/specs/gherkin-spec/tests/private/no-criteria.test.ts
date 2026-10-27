import { test } from "node:test";
import assert from "node:assert/strict";
import { generateFeatureFile } from "../../src/index.js";

function namesKey(key: string) {
  return (err: Error) => {
    assert.ok(err instanceof Error);
    assert.ok(err.message.includes(key), `expected "${err.message}" to name ${key}`);
    return true;
  };
}

function saysTitleEmpty(err: Error) {
  assert.ok(err instanceof Error);
  assert.match(err.message, /title/i);
  assert.match(err.message, /empty/i);
  return true;
}

// Extends public "[unhappy-1] a ticket with no criteria gets the TODO feature"
test("[unhappy-1] the TODO feature names another key and uses the cleaned title", () => {
  const file = generateFeatureFile({ key: "OPS-9", title: "  Ops\t\tdashboard\r\n", criteria: [] });
  assert.equal(file.path, ".spec/OPS-9.feature");
  assert.equal(
    file.text,
    "Feature: Ops dashboard\n" + "\n" + "  # TODO: OPS-9 has no acceptance criteria yet.\n",
  );
});

// Extends public "[unhappy-1] a ticket with no criteria gets the TODO feature"
test("[unhappy-1] the TODO feature keeps a list marker in the title", () => {
  const file = generateFeatureFile({ key: "AB12-3456", title: "- Payout report", criteria: [] });
  assert.equal(file.path, ".spec/AB12-3456.feature");
  assert.equal(
    file.text,
    "Feature: - Payout report\n" + "\n" + "  # TODO: AB12-3456 has no acceptance criteria yet.\n",
  );
  assert.ok(!file.text.endsWith("\n\n"));
});

// Extends public "[unhappy-1] a ticket whose criteria are all empty once cleaned gets the TODO feature"
test("[unhappy-1] many whitespace-only criteria give the TODO feature", () => {
  const criteria: string[] = [];
  for (let i = 0; i < 12; i++) criteria.push(["", " ", "\t", "\r\n", "\n \t\r\n  "][i % 5]);
  const file = generateFeatureFile({ key: "Z1-0", title: "Empty", criteria });
  assert.equal(file.path, ".spec/Z1-0.feature");
  assert.equal(file.text, "Feature: Empty\n" + "\n" + "  # TODO: Z1-0 has no acceptance criteria yet.\n");
  assert.ok(!file.text.includes("\r"));
});

// Extends public "[unhappy-2] a lowercase key is refused with an error naming the key"
test("[unhappy-2] keys with lowercase letters or not starting with a letter are refused, naming the key", () => {
  for (const key of ["Pay-1", "pAY-1", "PAy-1", "aPAY-1", "1PAY-1", "9-1"]) {
    assert.throws(
      () => generateFeatureFile({ key, title: "Payouts", criteria: ["Payouts are sent"] }),
      namesKey(key),
    );
  }
});

// Extends public "[unhappy-2] a key without a dash is refused with an error naming the key"
test("[unhappy-2] keys with a missing or malformed dash part are refused, naming the key", () => {
  for (const key of ["PAY-", "-123", "PAY--1", "PAY-1-2", "PAY_1", "PAY.1", "PAY-1.5", "PAY 1"]) {
    assert.throws(
      () => generateFeatureFile({ key, title: "Payouts", criteria: ["Payouts are sent"] }),
      namesKey(key),
    );
  }
});

// Extends public "[unhappy-2] a key with a letter after the dash is refused with an error naming the key"
test("[unhappy-2] keys with other characters after the digits are refused, naming the key", () => {
  for (const key of ["PAY-12a", "PAY-1X2", "PAY-12/", "PAY-12-", "PAY-12#"]) {
    assert.throws(
      () => generateFeatureFile({ key, title: "Payouts", criteria: ["Payouts are sent"] }),
      namesKey(key),
    );
  }
});

// Extends public "[unhappy-2] a lowercase key is refused with an error naming the key":
// a ticket without criteria is refused too, not given a TODO feature.
test("[unhappy-2] an invalid key is refused even when the ticket has no criteria", () => {
  assert.throws(
    () => generateFeatureFile({ key: "pay-124", title: "Payout report", criteria: [] }),
    namesKey("pay-124"),
  );
  assert.throws(
    () => generateFeatureFile({ key: "PAY124", title: "Payout report", criteria: ["", "  "] }),
    namesKey("PAY124"),
  );
});

// Extends public "[unhappy-2] a title that is only whitespace is refused with an error saying the title is empty"
test("[unhappy-2] an empty title is refused with an error saying the title is empty", () => {
  assert.throws(
    () => generateFeatureFile({ key: "PAY-126", title: "", criteria: ["Payouts are sent"] }),
    saysTitleEmpty,
  );
  assert.throws(
    () => generateFeatureFile({ key: "PAY-127", title: "\r\n\r\n", criteria: ["Payouts are sent"] }),
    saysTitleEmpty,
  );
});

// Extends public "[unhappy-2] a title that is only whitespace is refused with an error saying the title is empty":
// a ticket without criteria is refused too, not given a TODO feature.
test("[unhappy-2] an empty title is refused even when the ticket has no criteria", () => {
  assert.throws(
    () => generateFeatureFile({ key: "PAY-128", title: "  ", criteria: [] }),
    saysTitleEmpty,
  );
  assert.throws(
    () => generateFeatureFile({ key: "PAY-129", title: "", criteria: ["\t", ""] }),
    saysTitleEmpty,
  );
});
