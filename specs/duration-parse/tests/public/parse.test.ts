import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDuration } from "../../src/index.js";

function assertRejected(text: string): void {
  assert.throws(
    () => parseDuration(text),
    (error: unknown) => error instanceof Error && error.message.includes("duration"),
    `expected ${JSON.stringify(text)} to be rejected`,
  );
}

// R1. A duration is one or more components, each a count and a unit

test("[happy-1] components add up", () => {
  assert.equal(parseDuration("250ms"), 250);
  assert.equal(parseDuration("90s"), 90000);
  assert.equal(parseDuration("1h30m"), 5400000);
  assert.equal(parseDuration("2d"), 172800000);
  assert.equal(parseDuration("0s"), 0);
  assert.equal(parseDuration("1d0h0m0s0ms"), 86400000);
});

test("[happy-1] every unit once, with m and ms side by side", () => {
  assert.equal(parseDuration("1d1h1m1s1ms"), 90061001);
  assert.equal(parseDuration("1m1ms"), 60001);
});

test("[boundary-1] surrounding whitespace is ignored", () => {
  assert.equal(parseDuration("  45m\n"), 2700000);
});

test("[boundary-1] tabs and CRLF around a multi-component duration are ignored", () => {
  assert.equal(parseDuration("\t1h30m \r\n"), 5400000);
});

test("[unhappy-1] malformed durations are rejected", () => {
  for (const text of [
    "",
    "90",
    "1.5h",
    "05s",
    "-3s",
    "+3s",
    "1h 30m",
    "1h,30m",
    "3w",
    "3S",
    "3 s",
    "ms",
  ]) {
    assertRejected(text);
  }
});

test("[unhappy-1] whitespace-only, bare zero, uppercase ms and inner tabs are rejected", () => {
  assertRejected("   ");
  assertRejected("0");
  assertRejected("00s");
  assertRejected("3MS");
  assertRejected("3Ms");
  assertRejected("1h\t30m");
});

// R2. Units run from largest to smallest, each at most once

test("[happy-2] a count may exceed the next unit", () => {
  assert.equal(parseDuration("90m"), 5400000);
});

test("[happy-2] a count equal to the next unit's size is valid", () => {
  assert.equal(parseDuration("60m"), 3600000);
  assert.equal(parseDuration("1000ms"), 1000);
});

test("[unhappy-2] out-of-order or repeated units are rejected", () => {
  for (const text of ["30m1h", "1h1h", "1s500ms2s", "5ms1s"]) {
    assertRejected(text);
  }
});

test("[unhappy-2] repeated zero components and repeated ms are rejected", () => {
  assertRejected("0h0h");
  assertRejected("1ms1ms");
  assertRejected("1ms1m");
});

// R3. The result is a safe integer

test("[boundary-2] the largest safe duration parses", () => {
  assert.equal(parseDuration("104249991d8h59m991ms"), 9007199254740991);
});

test("[boundary-2] the largest safe duration as a single ms component parses", () => {
  assert.equal(parseDuration("9007199254740991ms"), Number.MAX_SAFE_INTEGER);
});

test("[unhappy-3] one millisecond more is rejected", () => {
  assertRejected("104249991d8h59m992ms");
});

test("[unhappy-3] totals far above the safe range are rejected, not clamped", () => {
  assertRejected("9007199254740992ms");
  assertRejected("99999999999999999999d");
});
