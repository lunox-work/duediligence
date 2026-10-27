import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

function assertThrowsWith(version: string, range: string, word: string): void {
  assert.throws(
    () => satisfies(version, range),
    (err: unknown) => err instanceof Error && err.message.includes(word),
    `expected satisfies(${JSON.stringify(version)}, ${JSON.stringify(range)}) to throw an Error mentioning "${word}"`,
  );
}

// R1. A version is MAJOR.MINOR, optionally .PATCH, optionally :tag

test("[happy-1] a missing patch is zero: 2.4 satisfies =2.4.0", () => {
  assert.equal(satisfies("2.4", "=2.4.0"), true);
});

test("[happy-1] boundary: 2.4 and 2.4.0 are the same version, so 2.4 is not >2.4.0", () => {
  assert.equal(satisfies("2.4", ">2.4.0"), false);
  assert.equal(satisfies("2.4.0", "=2.4"), true);
});

test("[happy-1] boundary: 0 itself is allowed in every part", () => {
  assert.equal(satisfies("0.0", "=0.0.0"), true);
});

const invalidVersions = [
  "02.4",
  "2",
  "2.4.1.0",
  "v2.4.1",
  "2.4.1-rc1",
  "2.4.1:RC1",
  "2.4.1:",
  "2.4.1:rc.1",
];

for (const version of invalidVersions) {
  test(`[unhappy-1] invalid version ${JSON.stringify(version)} throws a version error`, () => {
    assertThrowsWith(version, "*", "version");
  });
}

test("[unhappy-1] boundary: leading zeros in MINOR or PATCH are invalid", () => {
  assertThrowsWith("2.04", "*", "version");
  assertThrowsWith("2.4.01", "*", "version");
});

test("[unhappy-1] boundary: spaces and the empty string are not versions", () => {
  assertThrowsWith(" 2.4.1", "*", "version");
  assertThrowsWith("2.4.1 ", "*", "version");
  assertThrowsWith("", "*", "version");
});

// R9. Errors name what is invalid

test("[unhappy-4] both invalid: the version error wins", () => {
  assertThrowsWith("1.2.3.4", "nonsense", "version");
});

test("[unhappy-4] boundary: an empty tag with an empty range still reports the version", () => {
  assertThrowsWith("2.4.1:", "", "version");
});

test("[unhappy-4] boundary: a valid version with an invalid range reports the range", () => {
  assertThrowsWith("1.2.3", "nonsense", "range");
});
