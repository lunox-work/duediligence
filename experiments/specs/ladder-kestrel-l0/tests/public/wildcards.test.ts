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

// R6. Wildcards

const wildcardExamples: Array<[string, string, boolean]> = [
  ["7.1.3", "*", true],
  ["7.1.3", "7.x", true],
  ["7.1.3", "7.2.x", false],
];

for (const [version, range, answer] of wildcardExamples) {
  test(`[happy-6] wildcards: ${version} satisfies ${range} is ${answer}`, () => {
    assert.equal(satisfies(version, range), answer);
  });
}

test("[happy-6] boundary: M.N.x holds across the whole minor and M.x stops at the next major", () => {
  assert.equal(satisfies("7.2.0", "7.2.x"), true);
  assert.equal(satisfies("7.2.99", "7.2.x"), true);
  assert.equal(satisfies("8.0.0", "7.x"), false);
  assert.equal(satisfies("6.99.99", "7.x"), false);
});

test("[happy-6] boundary: * holds for the lowest version", () => {
  assert.equal(satisfies("0.0", "*"), true);
});

test("[unhappy-2] an operator before a wildcard is invalid: >7.x", () => {
  assertRangeError("7.1.3", ">7.x");
});

test("[unhappy-2] boundary: no operator at all may precede a wildcard, not even =", () => {
  assertRangeError("7.1.3", "=7.x");
  assertRangeError("7.1.3", "~7.1.x");
  assertRangeError("7.1.3", "^7.x");
  assertRangeError("7.1.3", ">=*");
});

test("[unhappy-2] boundary: other wildcard look-alikes are invalid ranges", () => {
  assertRangeError("7.1.3", "x");
  assertRangeError("7.1.3", "7.*");
  assertRangeError("7.1.3", "7.x.x");
});
