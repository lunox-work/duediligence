import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

function assertRangeError(version: string, range: string): void {
  assert.throws(
    () => satisfies(version, range),
    (err: unknown) => err instanceof Error && err.message.includes("range"),
    `expected satisfies(${JSON.stringify(version)}, ${JSON.stringify(range)}) to throw an Error mentioning "range"`,
  );
}

// R7. Commas join with AND, bars with OR

const groupExamples: Array<[string, string, boolean]> = [
  ["1.5.0", ">=1.0 , <2.0", true],
  ["2.5.0", ">=1.0,<2.0", false],
  ["2.5.0", ">=1.0,<2.0 | >=2.5", true],
];

for (const [version, range, answer] of groupExamples) {
  test(`[happy-7] groups and comparators: ${version} satisfies ${range} is ${answer}`, () => {
    assert.equal(satisfies(version, range), answer);
  });
}

test("[happy-7] boundary: a group fails when one comparator fails at its edge", () => {
  assert.equal(satisfies("2.0.0", ">=1.0,<2.0"), false);
  assert.equal(satisfies("1.0.0", ">=1.0,<2.0"), true);
});

test("[happy-7] boundary: spaces at the start and end of the range are allowed", () => {
  assert.equal(satisfies("1.5.0", "  >=1.0 , <2.0  "), true);
  assert.equal(satisfies("3.0.0", " <1.0|>=3.0 "), true);
});

test("[happy-7] boundary: an OR range fails when no group holds", () => {
  assert.equal(satisfies("2.2.0", ">=1.0,<2.0 | >=2.5"), false);
});

const invalidRanges = [">=1.0 <2.0", "=1.5 || =2.0", ">= 1.0", ">=1.0,"];

for (const range of invalidRanges) {
  test(`[unhappy-3] invalid range ${JSON.stringify(range)} throws a range error`, () => {
    assertRangeError("1.5.0", range);
  });
}

test("[unhappy-3] boundary: an empty range is invalid", () => {
  assertRangeError("1.5.0", "");
});

test("[unhappy-3] boundary: empty groups and comparators at the edges are invalid", () => {
  assertRangeError("1.5.0", ">=1.0 |");
  assertRangeError("1.5.0", "| >=1.0");
  assertRangeError("1.5.0", ",>=1.0");
});
