import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDuration, formatDuration } from "../../src/index.js";

const limit = 9007199254740991n;

function invalid(text: string): void {
  assert.throws(
    () => parseDuration(text),
    (error: unknown) => error instanceof Error && error.message.includes("duration"),
    text,
  );
}

// Extends public "[boundary-2] parses the largest safe total across components".
test("[boundary-2] accepts equivalent noncanonical decompositions of the safe limit", () => {
  for (const text of [
    "9007199254740s991ms",
    "150119987579m991ms",
    "2501999792h3540991ms",
    "104249991d32340991ms",
    "104249990d32h59m991ms",
    "0d0h0m9007199254740s991ms",
  ]) {
    assert.equal(parseDuration(text), Number(limit), text);
  }
});

// Extends public "[boundary-2] parses the largest safe count of milliseconds".
test("[boundary-2] safe millisecond counts retain their low bits at large magnitudes", () => {
  for (const offset of [2n, 3n, 7n, 255n, 1023n, 4095n, 65535n]) {
    const ms = limit - offset;
    assert.equal(parseDuration(`${ms}ms`), Number(ms));
    assert.equal(parseDuration(`0d0h0m0s${ms}ms`), Number(ms));
  }
});

// Extends public "[boundary-2] parses one millisecond below the safe limit".
test("[boundary-2] accepts near limit totals split after each possible large unit", () => {
  const components: [string, bigint][] = [
    ["d", 86400000n], ["h", 3600000n], ["m", 60000n], ["s", 1000n],
  ];
  for (const offset of [2n, 99n, 991n, 992n, 1000n, 60000n, 86400000n]) {
    const ms = limit - offset;
    for (const [unit, weight] of components) {
      const text = `${ms / weight}${unit}${ms % weight}ms`;
      assert.equal(parseDuration(text), Number(ms), text);
    }
  }
});

test("[boundary-2] accepts the largest safe single count for each larger unit", () => {
  for (const [unit, weight] of [
    ["d", 86400000n], ["h", 3600000n], ["m", 60000n], ["s", 1000n],
  ] as const) {
    const count = limit / weight;
    assert.equal(parseDuration(`${count}${unit}`), Number(count * weight));
    assert.equal(parseDuration(`  ${count}${unit}${limit % weight}ms\n`), Number(limit));
  }
});

// Extends public "[unhappy-3] rejects a total one millisecond above the safe limit".
test("[unhappy-3] rejects near limit overflow in different decompositions", () => {
  for (const text of [
    "104249990d32h59m992ms",
    "104249991d8h58m60992ms",
    "2501999792h3540992ms",
    "150119987579m992ms",
    "104249991d32340992ms",
  ]) invalid(text);
});

// Extends public "[unhappy-3] rejects a single millisecond count above the safe limit".
test("[unhappy-3] rejects unsafe integers of several magnitudes without rounding down", () => {
  for (const excess of [2n, 3n, 17n, 1000n, 999999999999999999999n]) {
    invalid(`${limit + excess}ms`);
  }
});

// Extends public "[unhappy-3] rejects an unsafe sum of individually safe components".
test("[unhappy-3] sums every component before applying the safe total limit", () => {
  // The first two components are below the limit; the last raises the total by one.
  invalid("104249990d32h59m992ms");
  invalid("2501999791h118m60s992ms");
  invalid("1d9007199168340992ms");
  invalid("1h9007199251140992ms");
  invalid("1m9007199254680992ms");
  invalid("1s9007199254739992ms");
});

// Extends public "[unhappy-3] rejects a day count whose conversion overflows".
test("[unhappy-3] rejects the first unsafe scaled count in every large unit", () => {
  for (const [unit, weight] of [
    ["d", 86400000n], ["h", 3600000n], ["m", 60000n], ["s", 1000n],
  ] as const) {
    invalid(`${limit / weight + 1n}${unit}`);
    invalid(`${limit / weight + 1n}${unit}0ms`);
  }
});

// Extends public "[unhappy-3] rejects a count far beyond the safe limit".
test("[unhappy-3] rejects thousands of digits in every count position", () => {
  const huge = "9".repeat(4096);
  for (const unit of ["d", "h", "m", "s", "ms"]) invalid(huge + unit);
  invalid(`0d0h0m0s${huge}ms`);
  invalid(`${huge}d0h0m0s0ms`);
});

test("[unhappy-3] trailing zero components cannot reset an overflowing sum", () => {
  invalid("104249992d0h0m0s0ms");
  invalid("2501999793h0m0s0ms");
  invalid("9007199254741s0ms");
});

// Extends public "[boundary-3] formats the largest safe integer".
test("[boundary-3] formats safe limit neighbors when lower components disappear", () => {
  const cases: [number, string][] = [
    [9007199254740989, "104249991d8h59m989ms"],
    [9007199254740001, "104249991d8h59m1ms"],
    [9007199254740000, "104249991d8h59m"],
    [9007199254739999, "104249991d8h58m59s999ms"],
    [9007199251200000, "104249991d8h"],
    [9007199222400000, "104249991d"],
  ];
  for (const [ms, text] of cases) assert.equal(formatDuration(ms), text);
});

// Extends public "[boundary-3] formats one millisecond below the safe limit".
test("[boundary-3] preserves exact remainders throughout the top millisecond range", () => {
  for (const remainder of [0, 1, 2, 7, 17, 99, 127, 255, 511, 989]) {
    const ms = 9007199254740000 + remainder;
    const expected = `104249991d8h59m${remainder === 0 ? "" : `${remainder}ms`}`;
    assert.equal(formatDuration(ms), expected);
  }
});
