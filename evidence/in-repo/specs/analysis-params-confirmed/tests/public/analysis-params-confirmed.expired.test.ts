import assert from "node:assert/strict";
import { test } from "node:test";

import { expiredAnalysis } from "../src/analysis.js";

/**
 * The watchdog's rule for an analysis whose worker lost its lease: requeue it
 * as the next attempt while `attempt < maxAttempts`, otherwise fail it with
 * `attempt` unchanged.
 */

test("[happy-5] an expired attempt is requeued while attempts remain and failed at the limit", () => {
  assert.deepEqual(expiredAnalysis(1, 3), { status: "queued", attempt: 2 });
  assert.deepEqual(expiredAnalysis(2, 3), { status: "queued", attempt: 3 });
  assert.deepEqual(expiredAnalysis(3, 3), { status: "failed", attempt: 3 });
});

test("[happy-5] the last attempt before the limit is requeued as the limit itself", () => {
  assert.deepEqual(expiredAnalysis(9, 10), { status: "queued", attempt: 10 });
  assert.deepEqual(expiredAnalysis(10, 10), { status: "failed", attempt: 10 });
});

test("[boundary-1] attempts at the edges of the limit", () => {
  assert.deepEqual(expiredAnalysis(1, 1), { status: "failed", attempt: 1 });
  assert.deepEqual(expiredAnalysis(1, 2), { status: "queued", attempt: 2 });
  assert.deepEqual(expiredAnalysis(5, 3), { status: "failed", attempt: 5 });
  assert.deepEqual(
    expiredAnalysis(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER),
    { status: "queued", attempt: Number.MAX_SAFE_INTEGER },
  );
  assert.deepEqual(
    expiredAnalysis(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    { status: "failed", attempt: Number.MAX_SAFE_INTEGER },
  );
});

test("[boundary-1] an attempt one past a lowered limit fails and is not rejected", () => {
  assert.doesNotThrow(() => expiredAnalysis(4, 3));
  assert.deepEqual(expiredAnalysis(4, 3), { status: "failed", attempt: 4 });
});

test("[boundary-2] each call returns a new object", () => {
  const first = expiredAnalysis(1, 3);
  const second = expiredAnalysis(1, 3);
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
});

test("[boundary-2] changing one result does not affect the next call", () => {
  const first = expiredAnalysis(1, 3);
  first.status = "failed";
  first.attempt = 99;
  assert.deepEqual(expiredAnalysis(1, 3), { status: "queued", attempt: 2 });
});

test("[boundary-3] arguments that are not positive integers are compared as given", () => {
  const rows: [number, number, "queued" | "failed", number][] = [
    [0, 3, "queued", 1],
    [1.5, 3, "queued", 2.5],
    [1, 0, "failed", 1],
    [0, 0, "failed", 0],
    [Number.NaN, 3, "failed", Number.NaN],
  ];
  for (const [attempt, maxAttempts, status, result] of rows) {
    let actual: ReturnType<typeof expiredAnalysis> | undefined;
    assert.doesNotThrow(() => {
      actual = expiredAnalysis(attempt, maxAttempts);
    });
    assert.deepEqual(actual, { status, attempt: result });
  }
});

test("[boundary-3] negative, infinite and NaN limits go through the same comparison", () => {
  assert.deepEqual(expiredAnalysis(-1, 3), { status: "queued", attempt: 0 });
  assert.deepEqual(expiredAnalysis(1, Number.POSITIVE_INFINITY), {
    status: "queued",
    attempt: 2,
  });
  assert.deepEqual(
    expiredAnalysis(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
    { status: "failed", attempt: Number.POSITIVE_INFINITY },
  );
  assert.deepEqual(expiredAnalysis(2, Number.NaN), { status: "failed", attempt: 2 });
});
