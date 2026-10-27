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

// Extends public "[happy-1] components add up": each unit alone, other counts.
test("[happy-1] each unit alone with counts other than the examples", () => {
  assert.equal(parseDuration("7ms"), 7);
  assert.equal(parseDuration("1s"), 1000);
  assert.equal(parseDuration("5m"), 300000);
  assert.equal(parseDuration("3h"), 10800000);
  assert.equal(parseDuration("1d"), 86400000);
  assert.equal(parseDuration("10d"), 864000000);
  assert.equal(parseDuration("123456ms"), 123456);
});

// Extends public "[happy-1] every unit once, with m and ms side by side".
test("[happy-1] skipped units and m directly followed by s or ms", () => {
  assert.equal(parseDuration("1d1ms"), 86400001);
  assert.equal(parseDuration("2h3s"), 7203000);
  assert.equal(parseDuration("1m1s"), 61000);
  assert.equal(parseDuration("1m1s1ms"), 61001);
  assert.equal(parseDuration("4d5m"), 345900000);
  assert.equal(parseDuration("3h7ms"), 10800007);
  assert.equal(parseDuration("12d23h59m59s999ms"), 1123199999);
});

// Extends public "[happy-1] components add up": zero in every position.
test("[happy-1] zero counts in any unit are allowed", () => {
  assert.equal(parseDuration("0ms"), 0);
  assert.equal(parseDuration("0d"), 0);
  assert.equal(parseDuration("0d0h0m0s0ms"), 0);
  assert.equal(parseDuration("1h0m"), 3600000);
  assert.equal(parseDuration("0h30m"), 1800000);
  assert.equal(parseDuration("0d0ms"), 0);
  assert.equal(parseDuration("1s0ms"), 1000);
});

test("[happy-1] counts with internal zeros are not leading zeros", () => {
  assert.equal(parseDuration("10s"), 10000);
  assert.equal(parseDuration("100ms"), 100);
  assert.equal(parseDuration("1h10m"), 4200000);
  assert.equal(parseDuration("20d1h"), 1731600000);
});

test("[happy-1] the result is a number", () => {
  assert.equal(typeof parseDuration("1h30m"), "number");
});

// Extends public "[boundary-1] tabs and CRLF around a multi-component duration".
test("[boundary-1] mixed leading and trailing whitespace around several components", () => {
  assert.equal(parseDuration("\n\t 2d3h \t\n"), 183600000);
  assert.equal(parseDuration(" 250ms"), 250);
  assert.equal(parseDuration("1d1h1m1s1ms   "), 90061001);
  assert.equal(parseDuration("\r\n0s\r\n"), 0);
});

// Extends public "[unhappy-1] malformed durations are rejected": malformed
// later components, which a check on only the first component would miss.
test("[unhappy-1] leading zeros, signs and decimals in a later component are rejected", () => {
  assertRejected("1h05m");
  assertRejected("1h00m");
  assertRejected("1h-30m");
  assertRejected("1h+30m");
  assertRejected("1h0.5m");
  assertRejected("1d2h3m4s05ms");
  assertRejected("007ms");
  assertRejected("0001d");
});

test("[unhappy-1] number syntaxes other than plain decimal digits are rejected", () => {
  assertRejected("1e3ms");
  assertRejected("1E3ms");
  assertRejected("0x10s");
  assertRejected("0b1s");
  assertRejected("0o7s");
  assertRejected("1_000ms");
  assertRejected(".5s");
  assertRejected("5.s");
  assertRejected("1.0s");
  assertRejected("Infinityms");
  assertRejected("NaNs");
  assertRejected("-0s");
});

test("[unhappy-1] a trailing count without a unit is rejected", () => {
  assertRejected("1h30");
  assertRejected("1d2");
  assertRejected("1ms5");
  assertRejected("1s0");
});

test("[unhappy-1] a unit without a count is rejected", () => {
  assertRejected("h");
  assertRejected("d");
  assertRejected("s");
  assertRejected("m");
  assertRejected("1hm");
  assertRejected("m30s");
});

test("[unhappy-1] garbage before, between or after components is rejected", () => {
  assertRejected("x1h");
  assertRejected("1hx");
  assertRejected("1h30m!");
  assertRejected("1h_30m");
  assertRejected("1h;30m");
  assertRejected("1h:30m");
  assertRejected("1h.30m");
  assertRejected("(1h)");
  assertRejected("1msx");
  assertRejected("1mss");
  assertRejected("1msms");
});

test("[unhappy-1] unknown and misspelled units are rejected", () => {
  assertRejected("3y");
  assertRejected("3us");
  assertRejected("3ns");
  assertRejected("3sec");
  assertRejected("3min");
  assertRejected("3hr");
  assertRejected("3hours");
  assertRejected("3sm");
  assertRejected("1h30mn");
});

test("[unhappy-1] uppercase units other than the examples are rejected", () => {
  assertRejected("3D");
  assertRejected("3H");
  assertRejected("3M");
  assertRejected("3mS");
  assertRejected("1h30M");
  assertRejected("1H30m");
  assertRejected("1d1h1m1S");
});

test("[unhappy-1] whitespace inside a duration is rejected", () => {
  assertRejected("1 h");
  assertRejected("1h\n30m");
  assertRejected("1h\r\n30m");
  assertRejected("1 0s");
  assertRejected("1m s");
  assertRejected("  1d 1h  ");
  assertRejected("1h30m 1s");
});

test("[unhappy-1] whitespace-only input other than spaces is rejected", () => {
  assertRejected("\n");
  assertRejected("\t\r\n ");
});

// R2. Units run from largest to smallest, each at most once

// Extends public "[happy-2] a count may exceed the next unit".
test("[happy-2] counts far above the next unit's size in every unit", () => {
  assert.equal(parseDuration("48h"), 172800000);
  assert.equal(parseDuration("1440m"), 86400000);
  assert.equal(parseDuration("3600s"), 3600000);
  assert.equal(parseDuration("86400000ms"), 86400000);
  assert.equal(parseDuration("1h90m"), 9000000);
  assert.equal(parseDuration("1d25h61m61s1001ms"), 180122001);
  assert.equal(parseDuration("59s99999ms"), 158999);
});

// Extends public "[unhappy-2] out-of-order or repeated units are rejected".
test("[unhappy-2] other out-of-order pairs are rejected", () => {
  assertRejected("1m1h");
  assertRejected("1h1d");
  assertRejected("1s1d");
  assertRejected("1s1m");
  assertRejected("1ms1s");
  assertRejected("1ms1d");
  assertRejected("1s1h");
  assertRejected("1d1h1s1m");
  assertRejected("1d1h1m1ms1s");
});

test("[unhappy-2] each unit repeated is rejected", () => {
  assertRejected("1d1d");
  assertRejected("1m1m");
  assertRejected("1s1s");
  assertRejected("0ms0ms");
  assertRejected("1d1h1d");
  assertRejected("1m30s1m");
  assertRejected("1h1m1h");
  assertRejected("1d1h1m1s1ms1ms");
});

test("[unhappy-2] a unit repeated after valid ones with zero counts is rejected", () => {
  assertRejected("0d0d");
  assertRejected("1h0m0m");
  assertRejected("0s1s");
});

// R3. The result is a safe integer

// Extends public "[boundary-2] the largest safe duration parses": other
// spellings of the same total.
test("[boundary-2] the largest safe duration in hours, minutes and seconds", () => {
  assert.equal(parseDuration("2501999792h59m991ms"), Number.MAX_SAFE_INTEGER);
  assert.equal(parseDuration("150119987579m991ms"), Number.MAX_SAFE_INTEGER);
  assert.equal(parseDuration("9007199254740s991ms"), Number.MAX_SAFE_INTEGER);
  assert.equal(parseDuration(" 104249991d8h59m991ms\n"), Number.MAX_SAFE_INTEGER);
});

test("[boundary-2] large safe durations just below the limit parse exactly", () => {
  assert.equal(parseDuration("104249991d"), 9007199222400000);
  assert.equal(parseDuration("104249991d8h59m990ms"), 9007199254740990);
  assert.equal(parseDuration("104249991d8h59m"), 9007199254740000);
  assert.equal(parseDuration("9007199254740990ms"), 9007199254740990);
  assert.equal(parseDuration("9007199254740s"), 9007199254740000);
});

// Extends public "[unhappy-3] one millisecond more is rejected".
test("[unhappy-3] one millisecond over the limit in other spellings is rejected", () => {
  assertRejected("2501999792h59m992ms");
  assertRejected("150119987579m992ms");
  assertRejected("9007199254740s992ms");
  assertRejected("104249991d8h59m1s");
  assertRejected("104249991d9h");
});

test("[unhappy-3] a single component over the limit is rejected", () => {
  assertRejected("104249992d");
  assertRejected("2501999793h");
  assertRejected("150119987580m");
  assertRejected("9007199254741s");
  assertRejected("9007199254740993ms");
  assertRejected("99999999999999999999ms");
});

test("[unhappy-3] components each safe but summing past the limit are rejected", () => {
  assertRejected("104249991d104249991h");
  assertRejected("9007199254740s9007199254740991ms");
  assertRejected("1d9007199254740991ms");
  assertRejected("1s9007199254740991ms");
});

test("[unhappy-3] an enormous count is rejected rather than clamped", () => {
  assertRejected("1" + "0".repeat(400) + "d");
  assertRejected("9".repeat(30) + "s");
});
