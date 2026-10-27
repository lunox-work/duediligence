import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDuration, parseDuration } from "../../src/index.js";

function assertRejected(value: number): void {
  assert.throws(
    () => formatDuration(value),
    (error: unknown) => error instanceof Error && error.message.includes("milliseconds"),
    `expected ${String(value)} to be rejected`,
  );
}

// R4. Formatting gives the shortest string that parses back

test("[happy-3] formatting", () => {
  assert.equal(formatDuration(0), "0ms");
  assert.equal(formatDuration(250), "250ms");
  assert.equal(formatDuration(90000), "1m30s");
  assert.equal(formatDuration(5400000), "1h30m");
  assert.equal(formatDuration(86400000), "1d");
  assert.equal(formatDuration(90061001), "1d1h1m1s1ms");
});

test("[happy-3] values at a unit's edge carry into the larger unit", () => {
  assert.equal(formatDuration(1), "1ms");
  assert.equal(formatDuration(999), "999ms");
  assert.equal(formatDuration(1000), "1s");
  assert.equal(formatDuration(60000), "1m");
  assert.equal(formatDuration(3600000), "1h");
  assert.equal(formatDuration(86400001), "1d1ms");
});

test("[boundary-3] formatting the largest safe integer", () => {
  assert.equal(formatDuration(9007199254740991), "104249991d8h59m991ms");
});

test("[boundary-3] formatting one below the largest safe integer", () => {
  assert.equal(formatDuration(9007199254740990), "104249991d8h59m990ms");
});

test("[boundary-4] formatting then parsing gives the number back", () => {
  assert.equal(parseDuration(formatDuration(123456789)), 123456789);
});

test("[boundary-4] formatting then parsing round-trips zero and the largest safe integer", () => {
  assert.equal(parseDuration(formatDuration(0)), 0);
  assert.equal(parseDuration(formatDuration(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
});

test("[unhappy-4] values that are not non-negative safe integers are rejected", () => {
  for (const value of [-1, 1.5, NaN, Infinity, 9007199254740992]) {
    assertRejected(value);
  }
});

test("[unhappy-4] negative infinity, tiny fractions and the most negative safe integer are rejected", () => {
  assertRejected(-Infinity);
  assertRejected(0.5);
  assertRejected(Number.MIN_SAFE_INTEGER);
});
