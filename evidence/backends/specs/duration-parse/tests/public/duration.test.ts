import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDuration, formatDuration } from "../../src/index.js";

function assertInvalidDuration(text: string): void {
  assert.throws(
    () => parseDuration(text),
    (error: unknown) => error instanceof Error && error.message.includes("duration"),
  );
}

function assertInvalidMilliseconds(ms: number): void {
  assert.throws(
    () => formatDuration(ms),
    (error: unknown) => error instanceof Error && error.message.includes("milliseconds"),
  );
}

test("[happy-1] parses milliseconds", () => {
  assert.equal(parseDuration("250ms"), 250);
});

test("[happy-1] parses seconds", () => {
  assert.equal(parseDuration("90s"), 90000);
});

test("[happy-1] adds hours and minutes", () => {
  assert.equal(parseDuration("1h30m"), 5400000);
});

test("[happy-1] parses days", () => {
  assert.equal(parseDuration("2d"), 172800000);
});

test("[happy-1] allows a single zero count", () => {
  assert.equal(parseDuration("0s"), 0);
});

test("[happy-1] accepts zero components after days", () => {
  assert.equal(parseDuration("1d0h0m0s0ms"), 86400000);
});

test("[happy-1] parses the smallest positive duration", () => {
  assert.equal(parseDuration("1ms"), 1);
});

test("[happy-1] adds all five units", () => {
  assert.equal(parseDuration("1d1h1m1s1ms"), 90061001);
});

test("[happy-1] distinguishes minutes from milliseconds", () => {
  assert.equal(parseDuration("1m1ms"), 60001);
});

test("[happy-1] allows all components to be zero", () => {
  assert.equal(parseDuration("0d0h0m0s0ms"), 0);
});

test("[boundary-1] trims spaces and a trailing newline", () => {
  assert.equal(parseDuration("  45m\n"), 2700000);
});

test("[boundary-1] trims tabs and line breaks around zero", () => {
  assert.equal(parseDuration("\t\r\n0ms \t\r\n"), 0);
});

test("[boundary-1] accepts input without surrounding whitespace", () => {
  assert.equal(parseDuration("45m"), 2700000);
});

test("[happy-2] allows ninety minutes", () => {
  assert.equal(parseDuration("90m"), 5400000);
});

test("[happy-2] allows seconds at the minute threshold", () => {
  assert.equal(parseDuration("60s"), 60000);
});

test("[happy-2] allows minutes at the hour threshold", () => {
  assert.equal(parseDuration("60m"), 3600000);
});

test("[happy-2] allows hours at the day threshold", () => {
  assert.equal(parseDuration("24h"), 86400000);
});

test("[happy-2] allows milliseconds at the second threshold", () => {
  assert.equal(parseDuration("1000ms"), 1000);
});

test("[happy-2] adds oversized counts in descending unit order", () => {
  assert.equal(parseDuration("1h90m"), 9000000);
});

test("[boundary-2] parses the largest safe total across components", () => {
  assert.equal(parseDuration("104249991d8h59m991ms"), 9007199254740991);
});

test("[boundary-2] parses the largest safe count of milliseconds", () => {
  assert.equal(parseDuration("9007199254740991ms"), 9007199254740991);
});

test("[boundary-2] parses one millisecond below the safe limit", () => {
  assert.equal(parseDuration("104249991d8h59m990ms"), 9007199254740990);
});

test("[unhappy-1] rejects the empty string", () => {
  assertInvalidDuration("");
});

test("[unhappy-1] rejects a bare number", () => {
  assertInvalidDuration("90");
});

test("[unhappy-1] rejects fractional counts", () => {
  assertInvalidDuration("1.5h");
});

test("[unhappy-1] rejects a leading zero", () => {
  assertInvalidDuration("05s");
});

test("[unhappy-1] rejects a negative sign", () => {
  assertInvalidDuration("-3s");
});

test("[unhappy-1] rejects a positive sign", () => {
  assertInvalidDuration("+3s");
});

test("[unhappy-1] rejects spaces between components", () => {
  assertInvalidDuration("1h 30m");
});

test("[unhappy-1] rejects comma separators", () => {
  assertInvalidDuration("1h,30m");
});

test("[unhappy-1] rejects weeks", () => {
  assertInvalidDuration("3w");
});

test("[unhappy-1] rejects uppercase seconds", () => {
  assertInvalidDuration("3S");
});

test("[unhappy-1] rejects whitespace between count and unit", () => {
  assertInvalidDuration("3 s");
});

test("[unhappy-1] rejects a unit without a count", () => {
  assertInvalidDuration("ms");
});

test("[unhappy-1] rejects input that becomes empty after trimming", () => {
  assertInvalidDuration(" \t\r\n");
});

test("[unhappy-1] rejects multiple zero digits", () => {
  assertInvalidDuration("00ms");
});

test("[unhappy-1] rejects uppercase milliseconds", () => {
  assertInvalidDuration("3MS");
});

test("[unhappy-1] rejects mixed case milliseconds", () => {
  assertInvalidDuration("3Ms");
});

test("[unhappy-1] rejects an internal newline", () => {
  assertInvalidDuration("1s\n1ms");
});

test("[unhappy-1] rejects trailing non-duration text", () => {
  assertInvalidDuration("1ms!");
});

test("[unhappy-1] rejects exponent notation", () => {
  assertInvalidDuration("1e3ms");
});

test("[unhappy-2] rejects minutes followed by hours", () => {
  assertInvalidDuration("30m1h");
});

test("[unhappy-2] rejects repeated hours", () => {
  assertInvalidDuration("1h1h");
});

test("[unhappy-2] rejects seconds repeated after milliseconds", () => {
  assertInvalidDuration("1s500ms2s");
});

test("[unhappy-2] rejects milliseconds followed by seconds", () => {
  assertInvalidDuration("5ms1s");
});

test("[unhappy-2] rejects out-of-order zero components", () => {
  assertInvalidDuration("0h0d");
});

test("[unhappy-2] rejects repeated zero components", () => {
  assertInvalidDuration("0ms0ms");
});

test("[unhappy-2] rejects repeated days separated by another unit", () => {
  assertInvalidDuration("1d0h1d");
});

test("[unhappy-3] rejects a total one millisecond above the safe limit", () => {
  assertInvalidDuration("104249991d8h59m992ms");
});

test("[unhappy-3] rejects a single millisecond count above the safe limit", () => {
  assertInvalidDuration("9007199254740992ms");
});

test("[unhappy-3] rejects an unsafe sum of individually safe components", () => {
  assertInvalidDuration("9007199254740s992ms");
});

test("[unhappy-3] rejects a day count whose conversion overflows", () => {
  assertInvalidDuration("104249992d");
});

test("[unhappy-3] rejects a count far beyond the safe limit", () => {
  assertInvalidDuration("999999999999999999999999999999999999999999999999999999999999ms");
});

test("[happy-3] formats zero as milliseconds", () => {
  assert.equal(formatDuration(0), "0ms");
});

test("[happy-3] formats milliseconds", () => {
  assert.equal(formatDuration(250), "250ms");
});

test("[happy-3] formats seconds using minutes and seconds", () => {
  assert.equal(formatDuration(90000), "1m30s");
});

test("[happy-3] formats hours and minutes while omitting zero units", () => {
  assert.equal(formatDuration(5400000), "1h30m");
});

test("[happy-3] formats an exact day", () => {
  assert.equal(formatDuration(86400000), "1d");
});

test("[happy-3] formats all five nonzero components", () => {
  assert.equal(formatDuration(90061001), "1d1h1m1s1ms");
});

test("[happy-3] formats the smallest positive value", () => {
  assert.equal(formatDuration(1), "1ms");
});

test("[happy-3] formats just below a second", () => {
  assert.equal(formatDuration(999), "999ms");
});

test("[happy-3] formats an exact second", () => {
  assert.equal(formatDuration(1000), "1s");
});

test("[happy-3] formats just above a second", () => {
  assert.equal(formatDuration(1001), "1s1ms");
});

test("[happy-3] formats just below a minute", () => {
  assert.equal(formatDuration(59999), "59s999ms");
});

test("[happy-3] formats an exact minute", () => {
  assert.equal(formatDuration(60000), "1m");
});

test("[happy-3] formats an exact hour", () => {
  assert.equal(formatDuration(3600000), "1h");
});

test("[happy-3] omits zero units between nonzero components", () => {
  assert.equal(formatDuration(86400001), "1d1ms");
});

test("[boundary-3] formats the largest safe integer", () => {
  assert.equal(formatDuration(9007199254740991), "104249991d8h59m991ms");
});

test("[boundary-3] formats one millisecond below the safe limit", () => {
  assert.equal(formatDuration(9007199254740990), "104249991d8h59m990ms");
});

test("[boundary-4] round trips the specified mixed duration", () => {
  assert.equal(parseDuration(formatDuration(123456789)), 123456789);
});

test("[boundary-4] round trips zero", () => {
  assert.equal(parseDuration(formatDuration(0)), 0);
});

test("[boundary-4] round trips the smallest positive duration", () => {
  assert.equal(parseDuration(formatDuration(1)), 1);
});

test("[boundary-4] round trips the largest safe integer", () => {
  assert.equal(parseDuration(formatDuration(9007199254740991)), 9007199254740991);
});

test("[unhappy-4] rejects a negative millisecond count", () => {
  assertInvalidMilliseconds(-1);
});

test("[unhappy-4] rejects fractional milliseconds", () => {
  assertInvalidMilliseconds(1.5);
});

test("[unhappy-4] rejects NaN", () => {
  assertInvalidMilliseconds(NaN);
});

test("[unhappy-4] rejects positive infinity", () => {
  assertInvalidMilliseconds(Infinity);
});

test("[unhappy-4] rejects the first unsafe integer", () => {
  assertInvalidMilliseconds(9007199254740992);
});

test("[unhappy-4] rejects a positive fraction below one millisecond", () => {
  assertInvalidMilliseconds(0.5);
});

test("[unhappy-4] rejects negative infinity", () => {
  assertInvalidMilliseconds(-Infinity);
});
