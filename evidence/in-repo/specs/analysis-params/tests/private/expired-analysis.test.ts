import assert from "node:assert/strict";
import { test } from "node:test";

import { expiredAnalysis } from "../../src/analysis.js";

/**
 * The watchdog's retry rule: requeue as the next attempt while
 * `attempt < maxAttempts`, otherwise fail as the attempt it was; refuse
 * anything but positive safe integers, checking `attempt` first.
 */

const ATTEMPT_MESSAGE = "attempt must be a positive safe integer";
const MAX_ATTEMPTS_MESSAGE = "maxAttempts must be a positive safe integer";
const MAX = Number.MAX_SAFE_INTEGER;

function assertRangeError(fn: () => unknown, message: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof RangeError, `expected a RangeError, got ${String(error)}`);
    assert.equal(error.message, message);
    return true;
  });
}

// Extends "[happy-5] the watchdog requeues while attempts remain and fails the last attempt":
// limits other than 3, every attempt up to the limit.
test("[happy-5] every attempt below a limit other than 3 is requeued as the next one", () => {
  for (const maxAttempts of [2, 4, 5, 7, 10]) {
    for (let attempt = 1; attempt < maxAttempts; attempt += 1) {
      assert.deepEqual(
        expiredAnalysis(attempt, maxAttempts),
        { status: "queued", attempt: attempt + 1 },
        `expiredAnalysis(${attempt}, ${maxAttempts})`,
      );
    }
    assert.deepEqual(expiredAnalysis(maxAttempts, maxAttempts), {
      status: "failed",
      attempt: maxAttempts,
    });
  }
});

// Extends "[happy-5] the watchdog requeues ...": the returned attempt is attempt + 1,
// not the limit, and the rule does not assume a limit of 3.
test("[happy-5] a requeue returns the next attempt number, not the limit", () => {
  assert.deepEqual(expiredAnalysis(1, 10), { status: "queued", attempt: 2 });
  assert.deepEqual(expiredAnalysis(4, 10), { status: "queued", attempt: 5 });
  assert.deepEqual(expiredAnalysis(9, 10), { status: "queued", attempt: 10 });
  assert.deepEqual(expiredAnalysis(10, 10), { status: "failed", attempt: 10 });
  assert.deepEqual(expiredAnalysis(3, 5), { status: "queued", attempt: 4 });
  assert.deepEqual(expiredAnalysis(5, 5), { status: "failed", attempt: 5 });
});

// Extends "[happy-5] the watchdog's decision does not depend on earlier calls":
// interleaved limits.
test("[happy-5] interleaved calls with different limits decide independently", () => {
  assert.deepEqual(expiredAnalysis(3, 3), { status: "failed", attempt: 3 });
  assert.deepEqual(expiredAnalysis(3, 6), { status: "queued", attempt: 4 });
  assert.deepEqual(expiredAnalysis(2, 2), { status: "failed", attempt: 2 });
  assert.deepEqual(expiredAnalysis(2, 6), { status: "queued", attempt: 3 });
  assert.deepEqual(expiredAnalysis(6, 6), { status: "failed", attempt: 6 });
});

// Extends "[boundary-1] attempts at a small or lowered limit": other limits,
// one below, at and above each, with the attempt kept unchanged on failure.
test("[boundary-1] one below, at and past each limit", () => {
  for (const maxAttempts of [1, 2, 3, 8, 100, 1000]) {
    if (maxAttempts > 1) {
      assert.deepEqual(expiredAnalysis(maxAttempts - 1, maxAttempts), {
        status: "queued",
        attempt: maxAttempts,
      });
    }
    assert.deepEqual(expiredAnalysis(maxAttempts, maxAttempts), {
      status: "failed",
      attempt: maxAttempts,
    });
    assert.deepEqual(expiredAnalysis(maxAttempts + 1, maxAttempts), {
      status: "failed",
      attempt: maxAttempts + 1,
    });
  }
});

// Extends "[boundary-1] attempts at a small or lowered limit": limits lowered far below the attempt.
test("[boundary-1] an attempt far past a lowered limit fails as the attempt it was", () => {
  assert.deepEqual(expiredAnalysis(2, 1), { status: "failed", attempt: 2 });
  assert.deepEqual(expiredAnalysis(7, 3), { status: "failed", attempt: 7 });
  assert.deepEqual(expiredAnalysis(50, 2), { status: "failed", attempt: 50 });
  assert.deepEqual(expiredAnalysis(MAX, 1), { status: "failed", attempt: MAX });
  assert.deepEqual(expiredAnalysis(MAX, MAX - 1), { status: "failed", attempt: MAX });
});

// Extends "[boundary-1] attempts at the largest safe integer": a first attempt
// against the largest limit, and large attempts below it.
test("[boundary-1] large attempts below the largest safe limit are requeued", () => {
  assert.deepEqual(expiredAnalysis(1, MAX), { status: "queued", attempt: 2 });
  assert.deepEqual(expiredAnalysis(MAX - 2, MAX), { status: "queued", attempt: MAX - 1 });
  assert.deepEqual(expiredAnalysis(2 ** 40, 2 ** 40 + 1), { status: "queued", attempt: 2 ** 40 + 1 });
  assert.deepEqual(expiredAnalysis(2 ** 40, 2 ** 40), { status: "failed", attempt: 2 ** 40 });
});

// Extends "[boundary-2] each expiredAnalysis call returns a new object":
// failed results and many calls, each a distinct object.
test("[boundary-2] queued and failed results are each a new object on every call", () => {
  const failedA = expiredAnalysis(3, 3);
  const failedB = expiredAnalysis(3, 3);
  assert.deepEqual(failedA, failedB);
  assert.notEqual(failedA, failedB);
  const seen = new Set<object>();
  for (let i = 0; i < 20; i += 1) {
    const result = expiredAnalysis(1 + (i % 4), 3);
    assert.equal(seen.has(result), false);
    seen.add(result);
  }
  assert.equal(seen.size, 20);
});

// Extends "[unhappy-1] an attempt that is not a positive integer is refused":
// other values that are not positive safe integers.
test("[unhappy-1] other attempts that are not positive safe integers are refused", () => {
  for (const attempt of [
    -0,
    -2,
    -MAX,
    Number.NEGATIVE_INFINITY,
    Number.MIN_VALUE,
    0.5,
    1 + Number.EPSILON,
    2.000001,
    MAX + 2,
    2 ** 60,
    1e300,
  ]) {
    assertRangeError(() => expiredAnalysis(attempt, 3), ATTEMPT_MESSAGE);
  }
});

// Extends "[unhappy-1] an attempt that is not a positive integer is refused":
// values that are not numbers at all, some of which compare as >= 1.
test("[unhappy-1] an attempt that is not a number is refused", () => {
  for (const attempt of ["2", true, null, undefined, [2], 2n]) {
    assertRangeError(() => expiredAnalysis(attempt as unknown as number, 3), ATTEMPT_MESSAGE);
  }
});

// Extends "[unhappy-1] ...": an invalid attempt is refused whatever the limit,
// including when it is past the limit.
test("[unhappy-1] an invalid attempt is refused with a valid limit of any size", () => {
  for (const maxAttempts of [1, 2, 100, MAX]) {
    assertRangeError(() => expiredAnalysis(0, maxAttempts), ATTEMPT_MESSAGE);
    assertRangeError(() => expiredAnalysis(1.5, maxAttempts), ATTEMPT_MESSAGE);
    assertRangeError(() => expiredAnalysis(MAX + 1, maxAttempts), ATTEMPT_MESSAGE);
    assertRangeError(() => expiredAnalysis(Number.POSITIVE_INFINITY, maxAttempts), ATTEMPT_MESSAGE);
  }
});

// Extends "[unhappy-2] a maxAttempts that is not a positive integer is refused":
// other values that are not positive safe integers.
test("[unhappy-2] other limits that are not positive safe integers are refused", () => {
  for (const maxAttempts of [
    -0,
    -1,
    -MAX,
    Number.NEGATIVE_INFINITY,
    Number.MIN_VALUE,
    0.5,
    3 + 2 * Number.EPSILON,
    MAX + 2,
    1e300,
  ]) {
    assertRangeError(() => expiredAnalysis(1, maxAttempts), MAX_ATTEMPTS_MESSAGE);
  }
});

// Extends "[unhappy-2] ...": the limit is checked even when the attempt is at
// or past it, where an unchecked comparison would simply fail the analysis.
test("[unhappy-2] an invalid limit is refused even when the attempt is at or past it", () => {
  assertRangeError(() => expiredAnalysis(5, Number.NaN), MAX_ATTEMPTS_MESSAGE);
  assertRangeError(() => expiredAnalysis(5, 0), MAX_ATTEMPTS_MESSAGE);
  assertRangeError(() => expiredAnalysis(5, -3), MAX_ATTEMPTS_MESSAGE);
  assertRangeError(() => expiredAnalysis(5, 2.5), MAX_ATTEMPTS_MESSAGE);
  assertRangeError(() => expiredAnalysis(3, 2.5), MAX_ATTEMPTS_MESSAGE);
  assertRangeError(() => expiredAnalysis(MAX, Number.NEGATIVE_INFINITY), MAX_ATTEMPTS_MESSAGE);
  assertRangeError(() => expiredAnalysis(2, 1.5), MAX_ATTEMPTS_MESSAGE);
});

// Extends "[unhappy-2] ...": the limit is checked when the attempt is below it.
test("[unhappy-2] an invalid limit above the attempt is refused", () => {
  assertRangeError(() => expiredAnalysis(1, 3.5), MAX_ATTEMPTS_MESSAGE);
  assertRangeError(() => expiredAnalysis(2, MAX + 1), MAX_ATTEMPTS_MESSAGE);
  assertRangeError(() => expiredAnalysis(1, MAX + 3), MAX_ATTEMPTS_MESSAGE);
});

// Extends "[unhappy-2] ...": limits that are not numbers.
test("[unhappy-2] a limit that is not a number is refused", () => {
  for (const maxAttempts of ["3", true, null, undefined, [3], 3n]) {
    assertRangeError(() => expiredAnalysis(1, maxAttempts as unknown as number), MAX_ATTEMPTS_MESSAGE);
    assertRangeError(() => expiredAnalysis(4, maxAttempts as unknown as number), MAX_ATTEMPTS_MESSAGE);
  }
});

// Extends "[unhappy-3] the attempt is reported for any pair of invalid arguments": more pairs.
test("[unhappy-3] the attempt is reported for every pair of invalid arguments", () => {
  const invalidAttempts = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX + 1];
  const invalidLimits = [0, -3, 2.5, Number.NaN, Number.POSITIVE_INFINITY, MAX + 1];
  for (const attempt of invalidAttempts) {
    for (const maxAttempts of invalidLimits) {
      assertRangeError(() => expiredAnalysis(attempt, maxAttempts), ATTEMPT_MESSAGE);
    }
  }
});
