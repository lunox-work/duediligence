import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDuration } from "../../src/index.js";

function invalid(ms: number): void {
  assert.throws(
    () => formatDuration(ms),
    (error: unknown) => error instanceof Error && error.message.includes("milliseconds"),
    String(ms),
  );
}

// Extends public "[unhappy-4] rejects a negative millisecond count".
test("[unhappy-4] rejects negative integers at small and large magnitudes", () => {
  for (const ms of [-2, -1000, -86400000, -2147483649, -Number.MAX_SAFE_INTEGER]) invalid(ms);
});

// Extends public "[unhappy-4] rejects fractional milliseconds".
test("[unhappy-4] rejects fractional remainders in otherwise ordinary durations", () => {
  for (const ms of [2.25, 999.125, 60000.5, 86400000.75, 2147483648.5, -2.5]) invalid(ms);
});

// Extends public "[unhappy-4] rejects NaN".
test("[unhappy-4] rejects NaN repeatedly across valid formatting calls", () => {
  invalid(Number.NaN);
  assert.equal(formatDuration(42007), "42s7ms");
  invalid(Number.NaN);
  invalid(-Number.NaN);
  assert.equal(formatDuration(0), "0ms");
});

// Extends public "[unhappy-4] rejects positive infinity".
test("[unhappy-4] infinity cannot be formatted or poison subsequent calls", () => {
  invalid(Number.POSITIVE_INFINITY);
  assert.equal(formatDuration(7200017), "2h17ms");
  invalid(Number.POSITIVE_INFINITY);
  invalid(Number.MAX_VALUE);
});

// Extends public "[unhappy-4] rejects the first unsafe integer".
test("[unhappy-4] rejects unsafe integers beyond the immediate limit", () => {
  for (const ms of [9007199254740994, 9007199254740996, 2 ** 54, 1e20, 1e100, Number.MAX_VALUE]) invalid(ms);
});

// Extends public "[unhappy-4] rejects a positive fraction below one millisecond".
test("[unhappy-4] rejects nonzero submillisecond values without rounding or underflow", () => {
  for (const ms of [Number.MIN_VALUE, Number.EPSILON, 0.001, 0.25, 0.9999999999999999]) invalid(ms);
});

// Extends public "[unhappy-4] rejects negative infinity".
test("[unhappy-4] rejects negative infinity alongside other negative extremes", () => {
  invalid(Number.NEGATIVE_INFINITY);
  invalid(-Number.MAX_VALUE);
  invalid(-Number.MIN_VALUE);
  assert.equal(formatDuration(130000), "2m10s");
  invalid(Number.NEGATIVE_INFINITY);
});

test("[unhappy-4] rejects fractional values arbitrarily close to an integer", () => {
  for (const ms of [1 - Number.EPSILON, 1 + Number.EPSILON, 1000.0000000000001, 4503599627370495.5]) invalid(ms);
});

test("[unhappy-4] invalid values stay invalid in alternating call order", () => {
  for (const ms of [Number.NaN, -0.125, 2 ** 53, Number.POSITIVE_INFINITY, 59.5]) {
    assert.equal(formatDuration(86400042), "1d42ms");
    invalid(ms);
    assert.equal(formatDuration(121001), "2m1s1ms");
    invalid(ms);
  }
});
