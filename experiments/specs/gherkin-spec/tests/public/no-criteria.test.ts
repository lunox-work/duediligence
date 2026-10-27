import { test } from "node:test";
import assert from "node:assert/strict";
import { generateFeatureFile } from "../../src/index.js";

const TODO_TEXT =
  "Feature: Payout report\n" +
  "\n" +
  "  # TODO: PAY-124 has no acceptance criteria yet.\n";

test("[unhappy-1] a ticket with no criteria gets the TODO feature", () => {
  const file = generateFeatureFile({ key: "PAY-124", title: "Payout report", criteria: [] });
  assert.equal(file.path, ".spec/PAY-124.feature");
  assert.equal(file.text, TODO_TEXT);
});

test("[unhappy-1] a ticket whose criteria are all empty once cleaned gets the TODO feature", () => {
  const file = generateFeatureFile({
    key: "PAY-124",
    title: "Payout report",
    criteria: ["", "   ", "\t\n "],
  });
  assert.equal(file.path, ".spec/PAY-124.feature");
  assert.equal(file.text, TODO_TEXT);
});

function namesKey(key: string) {
  return (err: Error) => {
    assert.ok(err instanceof Error);
    assert.ok(err.message.includes(key), `expected "${err.message}" to name ${key}`);
    return true;
  };
}

test("[unhappy-2] a lowercase key is refused with an error naming the key", () => {
  assert.throws(
    () => generateFeatureFile({ key: "pay-123", title: "Payouts", criteria: ["Payouts are sent"] }),
    namesKey("pay-123"),
  );
});

test("[unhappy-2] a key without a dash is refused with an error naming the key", () => {
  assert.throws(
    () => generateFeatureFile({ key: "PAY123", title: "Payouts", criteria: ["Payouts are sent"] }),
    namesKey("PAY123"),
  );
});

test("[unhappy-2] a key with a letter after the dash is refused with an error naming the key", () => {
  assert.throws(
    () => generateFeatureFile({ key: "PAY-12A", title: "Payouts", criteria: ["Payouts are sent"] }),
    namesKey("PAY-12A"),
  );
});

test("[unhappy-2] a title that is only whitespace is refused with an error saying the title is empty", () => {
  assert.throws(
    () => generateFeatureFile({ key: "PAY-125", title: " \t\n ", criteria: ["Payouts are sent"] }),
    (err: Error) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /title/i);
      assert.match(err.message, /empty/i);
      return true;
    },
  );
});
