import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatus, writeStatus } from "../../src/index.js";

const STATUSES = ["draft", "review", "published", "claimed", "merged"];

function assertRangeError(value: string): void {
  assert.throws(
    () => writeStatus(value),
    (err: unknown) => {
      if (!(err instanceof RangeError)) throw new Error(`expected a RangeError for ${JSON.stringify(value)}`);
      assert.equal(err.message, `Invalid sandbox status: "${value}"`);
      return true;
    },
  );
}

function assertTypeError(value: unknown): void {
  assert.throws(
    () => writeStatus(value as string),
    (err: unknown) => {
      if (!(err instanceof TypeError)) throw new Error(`expected a TypeError for ${String(value)}`);
      assert.equal(err.message, "Sandbox status must be a string");
      return true;
    },
  );
}

test("[happy-1] writeStatus returns draft as itself", () => {
  assert.equal(writeStatus("draft"), "draft");
});

test("[happy-1] writeStatus returns every one of the five statuses as itself", () => {
  for (const status of STATUSES) {
    assert.equal(writeStatus(status), status);
  }
});

test("[unhappy-1] writeStatus rejects case changes, separators and unknown words with a RangeError naming the value", () => {
  for (const value of ["Draft", "REVIEW", "in-review", "in review", "in_review", "approved", "publish"]) {
    assertRangeError(value);
  }
});

test("[unhappy-1] writeStatus does not trim surrounding whitespace and names the value verbatim", () => {
  for (const value of [" draft", "draft ", "merged\n"]) {
    assertRangeError(value);
  }
});

test("[unhappy-2] writeStatus rejects in-review although readStatus reads it as review", () => {
  assert.equal(readStatus("in-review"), "review");
  assertRangeError("in-review");
});

test("[unhappy-2] writeStatus rejects a padded mixed-case old spelling that readStatus reads as review", () => {
  assert.equal(readStatus("  In-Review\n"), "review");
  assertRangeError("  In-Review\n");
});

test("[unhappy-3] writeStatus rejects undefined and null with a TypeError", () => {
  assertTypeError(undefined);
  assertTypeError(null);
});

test("[unhappy-3] writeStatus rejects a number and an object with a TypeError", () => {
  assertTypeError(1);
  assertTypeError({});
});

test("[boundary-1] writeStatus rejects the empty string with a RangeError", () => {
  assertRangeError("");
});

test("[boundary-1] writeStatus rejects a single space with a RangeError naming it verbatim", () => {
  assertRangeError(" ");
});
