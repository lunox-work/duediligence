import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDuration, parseDuration } from "../../src/index.js";

function assertRejected(value: unknown): void {
  assert.throws(
    () => formatDuration(value as number),
    (error: unknown) => error instanceof Error && error.message.includes("milliseconds"),
    `expected ${String(value)} to be rejected`,
  );
}

const UNITS: ReadonlyArray<readonly [string, bigint]> = [
  ["d", 86400000n],
  ["h", 3600000n],
  ["m", 60000n],
  ["s", 1000n],
  ["ms", 1n],
];

// The string R4 defines: largest units first, zero components left out.
function canonical(ms: number): string {
  let rest = BigInt(ms);
  if (rest === 0n) return "0ms";
  let text = "";
  for (const [unit, size] of UNITS) {
    const count = rest / size;
    rest %= size;
    if (count > 0n) text += `${count}${unit}`;
  }
  return text;
}

// Deterministic spread of values across the safe range.
function sampleValues(): number[] {
  const values: number[] = [];
  let x = 1n;
  for (let i = 0; i < 300; i++) {
    x = (x * 6364136223846793005n + 1442695040888963407n) % (1n << 64n);
    values.push(Number(x % 9007199254740992n));
    values.push(Number(x % 100000000n));
    values.push(Number(x % 100000n));
  }
  return values;
}

// R4. Formatting gives the shortest string that parses back

// Extends public "[happy-3] formatting": other values for each unit alone.
test("[happy-3] multiples of a single unit use only that unit", () => {
  assert.equal(formatDuration(7), "7ms");
  assert.equal(formatDuration(5000), "5s");
  assert.equal(formatDuration(300000), "5m");
  assert.equal(formatDuration(10800000), "3h");
  assert.equal(formatDuration(172800000), "2d");
  assert.equal(formatDuration(864000000), "10d");
  assert.equal(formatDuration(8640000000000000), "100000000d");
});

// Extends public "[happy-3] values at a unit's edge carry into the larger unit".
test("[happy-3] values just below a unit's edge use every smaller unit", () => {
  assert.equal(formatDuration(1001), "1s1ms");
  assert.equal(formatDuration(59999), "59s999ms");
  assert.equal(formatDuration(3599999), "59m59s999ms");
  assert.equal(formatDuration(86399999), "23h59m59s999ms");
  assert.equal(formatDuration(172799999), "1d23h59m59s999ms");
});

test("[happy-3] zero components in the middle are left out", () => {
  assert.equal(formatDuration(86401000), "1d1s");
  assert.equal(formatDuration(3600001), "1h1ms");
  assert.equal(formatDuration(60001), "1m1ms");
  assert.equal(formatDuration(90000000), "1d1h");
  assert.equal(formatDuration(86460000), "1d1m");
  assert.equal(formatDuration(3601000), "1h1s");
  assert.equal(formatDuration(61000), "1m1s");
  assert.equal(formatDuration(3660000), "1h1m");
  assert.equal(formatDuration(7200500), "2h500ms");
});

test("[happy-3] multi-digit counts in every unit", () => {
  assert.equal(formatDuration(1123199999), "12d23h59m59s999ms");
  assert.equal(formatDuration(1234567890123), "14288d23h31m30s123ms");
  assert.equal(formatDuration(999999999999999), "11574074d1h46m39s999ms");
  assert.equal(formatDuration(4503599627370496), "52124995d16h29m30s496ms");
});

test("[happy-3] a spread of values formats to the canonical string", () => {
  for (const ms of sampleValues()) {
    assert.equal(formatDuration(ms), canonical(ms), `formatting ${ms}`);
  }
});

test("[happy-3] the result is a string", () => {
  assert.equal(typeof formatDuration(5400000), "string");
});

// Extends public "[boundary-3] formatting one below the largest safe integer".
test("[boundary-3] formatting other values near the largest safe integer", () => {
  assert.equal(formatDuration(9007199254740000), "104249991d8h59m");
  assert.equal(formatDuration(9007199222400000), "104249991d");
  assert.equal(formatDuration(9007199254740001), "104249991d8h59m1ms");
  assert.equal(formatDuration(9007199254739999), "104249991d8h58m59s999ms");
});

// Extends public "[boundary-4] formatting then parsing gives the number back".
test("[boundary-4] formatting then parsing round-trips a spread of values", () => {
  for (const ms of sampleValues()) {
    assert.equal(parseDuration(formatDuration(ms)), ms, `round-tripping ${ms}`);
  }
});

test("[boundary-4] formatting then parsing round-trips unit edges", () => {
  for (const ms of [1, 999, 1000, 1001, 59999, 60000, 3599999, 3600000, 86399999, 86400000, 86400001]) {
    assert.equal(parseDuration(formatDuration(ms)), ms, `round-tripping ${ms}`);
  }
});

test("[boundary-4] parsing then formatting a non-canonical string gives the canonical one", () => {
  assert.equal(formatDuration(parseDuration("90m")), "1h30m");
  assert.equal(formatDuration(parseDuration("1d0h0m0s0ms")), "1d");
  assert.equal(formatDuration(parseDuration("1000ms")), "1s");
  assert.equal(formatDuration(parseDuration("0d0s")), "0ms");
});

// Extends public "[unhappy-4] values that are not non-negative safe integers are rejected".
test("[unhappy-4] other negative integers are rejected", () => {
  assertRejected(-2);
  assertRejected(-1000);
  assertRejected(-86400000);
  assertRejected(-9007199254740992);
});

test("[unhappy-4] other fractions are rejected", () => {
  assertRejected(0.1);
  assertRejected(999.999);
  assertRejected(1000.5);
  assertRejected(-0.5);
  assertRejected(Number.EPSILON);
  assertRejected(Number.MIN_VALUE);
  assertRejected(86400000.25);
});

test("[unhappy-4] integers above the safe range are rejected", () => {
  assertRejected(9007199254740994);
  assertRejected(2 ** 60);
  assertRejected(1e21);
  assertRejected(Number.MAX_VALUE);
});

test("[unhappy-4] values that are not numbers are rejected", () => {
  assertRejected("1000");
  assertRejected(1000n);
  assertRejected(null);
  assertRejected(undefined);
  assertRejected({});
});
