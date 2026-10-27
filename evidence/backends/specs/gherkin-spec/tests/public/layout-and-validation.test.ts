import { test } from "node:test";
import assert from "node:assert/strict";
import { generateFeatureFile } from "../../src/index.js";

test("[happy-1] generates the exact two-criterion feature and path", () => {
  const result = generateFeatureFile({
    key: "PAY-123",
    title: "Retry failed payouts",
    criteria: ["Failed payouts are retried", "Retries stop after three attempts"],
  });

  assert.equal(result.path, ".spec/PAY-123.feature");
  assert.equal(
    result.text,
    "Feature: Retry failed payouts\n" +
      "\n" +
      "  Scenario: Failed payouts are retried\n" +
      "    Then failed payouts are retried\n" +
      "\n" +
      "  Scenario: Retries stop after three attempts\n" +
      "    Then retries stop after three attempts\n",
  );
});

test("[happy-1] handles one criterion and valid keys at the format boundaries", () => {
  for (const key of ["A-0", "A1B2-003"]) {
    const result = generateFeatureFile({
      key,
      title: "Payout",
      criteria: ["Complete"],
    });

    assert.equal(result.path, `.spec/${key}.feature`);
    assert.equal(
      result.text,
      "Feature: Payout\n\n  Scenario: Complete\n    Then complete\n",
    );
  }
});

test("[unhappy-1] generates the exact TODO feature for an empty criteria list", () => {
  const result = generateFeatureFile({
    key: "PAY-124",
    title: "Payout report",
    criteria: [],
  });

  assert.equal(result.path, ".spec/PAY-124.feature");
  assert.equal(
    result.text,
    "Feature: Payout report\n\n  # TODO: PAY-124 has no acceptance criteria yet.\n",
  );
});

test("[unhappy-1] uses the cleaned title and actual key when all criteria clean to empty", () => {
  const result = generateFeatureFile({
    key: "REPORT2-0",
    title: " \tPayout\r\n  report \n",
    criteria: ["", " \t\r\n ", "- \t", "* \n", "1. \t", "2) \n", "[ ] \t", "[x] \n"],
  });

  assert.equal(result.path, ".spec/REPORT2-0.feature");
  assert.equal(
    result.text,
    "Feature: Payout report\n\n  # TODO: REPORT2-0 has no acceptance criteria yet.\n",
  );
});

test("[unhappy-2] rejects the specified malformed keys and names each key in its error", () => {
  for (const key of ["pay-123", "PAY123", "PAY-12A"]) {
    assert.throws(
      () => generateFeatureFile({ key, title: "Payout report", criteria: ["Ready"] }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok((error as Error).message.includes(key));
        return true;
      },
    );
  }
});

test("[unhappy-2] rejects keys with invalid starts, missing parts, or surrounding characters", () => {
  for (const key of ["1PAY-123", "-123", "PAY-", "PAY--123", "PAY_-123", " PAY-123", "PAY-123 ", "PAY-123\n"]) {
    assert.throws(
      () => generateFeatureFile({ key, title: "Payout report", criteria: [] }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const message = (error as Error).message;
        assert.ok(message.includes(key) || message.includes(JSON.stringify(key)));
        return true;
      },
    );
  }
});

test("[unhappy-2] rejects an empty title with an error saying the title is empty", () => {
  assert.throws(
    () => generateFeatureFile({ key: "PAY-123", title: "", criteria: ["Ready"] }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match((error as Error).message, /title/i);
      assert.match((error as Error).message, /empty/i);
      return true;
    },
  );
});

test("[unhappy-2] rejects a title that becomes empty after cleaning even without criteria", () => {
  assert.throws(
    () => generateFeatureFile({ key: "PAY-123", title: " \t\r\n  ", criteria: [] }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match((error as Error).message, /title/i);
      assert.match((error as Error).message, /empty/i);
      return true;
    },
  );
});
