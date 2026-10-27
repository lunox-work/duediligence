import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

// spec.md supplies no tagged scenarios or version/range grammar. The key
// below identifies the sole documented interface contract. These tests do
// not assume that any particular string is a valid version or range.
function assertDocumentedOutcome(version: string, range: string): void {
  let result: unknown;
  try {
    result = satisfies(version, range);
  } catch (error: unknown) {
    assert.ok(error instanceof Error, "Invalid input must throw an Error");
    return;
  }
  assert.equal(typeof result, "boolean", "Successful calls must return a boolean");
}

test("[contract-1] ordinary string arguments produce a boolean or an Error", () => {
  assertDocumentedOutcome("1.2.3", "1.2.3");
  assertDocumentedOutcome("1.2.3", "2.0.0");
});

test("[contract-1] empty string boundaries produce a boolean or an Error", () => {
  assertDocumentedOutcome("", "1.2.3");
  assertDocumentedOutcome("1.2.3", "");
  assertDocumentedOutcome("", "");
});
