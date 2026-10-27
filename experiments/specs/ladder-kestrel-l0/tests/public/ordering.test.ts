import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

// R2. Versions are ordered by numbers, then tags

const orderingExamples: Array<[string, string, boolean]> = [
  ["1.10.0", ">1.9.0", true],
  ["2.0.0:rc", "<2.0.0:rc1", true],
  ["2.0.0:rc2", "<2.0.0:rc10", true],
  ["2.0.0:beta", ">2.0.0:alpha", true],
  ["2.0.0:10", "<2.0.0:a", true],
  ["2.0.0:rc", ">=2.0.0:rc", true],
];

for (const [version, range, answer] of orderingExamples) {
  test(`[happy-2] ordering: ${version} satisfies ${range} is ${answer}`, () => {
    assert.equal(satisfies(version, range), answer);
  });
}

test("[happy-2] boundary: numbers compare as numbers in every part", () => {
  assert.equal(satisfies("1.2.10", ">1.2.9"), true);
  assert.equal(satisfies("10.0.0", ">9.99.99"), true);
});

test("[happy-2] boundary: a version without a tag is greater than one with a tag", () => {
  // The tagged comparator of the same minor lets the tagged version be tested at all (R8).
  assert.equal(satisfies("2.0.0:rc", "<2.0.0,>=2.0.0:a"), true);
  assert.equal(satisfies("2.0.0", ">2.0.0:zzz"), true);
});

test("[happy-2] boundary: a tag that runs out first with equal runs is lower", () => {
  assert.equal(satisfies("2.0.0:rc1", "<2.0.0:rc1a"), true);
  assert.equal(satisfies("2.0.0:rc1", ">=2.0.0:rc1a"), false);
});

test("[happy-2] boundary: digit runs in tags compare as numbers, so rc01 is rc1", () => {
  assert.equal(satisfies("2.0.0:rc01", "=2.0.0:rc1"), true);
});
