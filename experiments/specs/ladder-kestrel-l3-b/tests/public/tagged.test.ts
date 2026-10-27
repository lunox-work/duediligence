import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

// R8. A tagged version needs a tagged comparator of its own minor

const taggedExamples: Array<[string, string, boolean]> = [
  ["3.2.1:rc1", ">=3.2.0:a", true],
  ["3.2.1:rc1", ">=3.2.0", false],
  ["3.2.1:rc1", ">=3.1.0:a", false],
  ["3.2.1:rc1", "*", false],
  ["3.2.1:rc1", ">=3.2.0:a,<4.0.0", true],
  ["3.2.1:rc1", ">=3.2.0 | >=3.2.0:a", true],
];

for (const [version, range, answer] of taggedExamples) {
  test(`[happy-8] tagged versions: ${version} satisfies ${range} is ${answer}`, () => {
    assert.equal(satisfies(version, range), answer);
  });
}

test("[happy-8] boundary: a tagged comparator of the same minor is not enough when it does not hold", () => {
  assert.equal(satisfies("3.2.1:rc1", "<3.2.0:z"), false);
  assert.equal(satisfies("3.2.1:rc1", ">=3.2.0:a,<3.2.1"), false);
});

test("[happy-8] boundary: the tagged comparator must share the major as well as the minor", () => {
  assert.equal(satisfies("3.2.1:rc1", ">=2.2.0:a"), false);
});

test("[happy-8] boundary: a wildcard names no version", () => {
  assert.equal(satisfies("3.2.1:rc1", "3.x"), false);
  assert.equal(satisfies("3.2.1:rc1", "3.2.x"), false);
});

test("[happy-8] boundary: the rule does not restrict a version without a tag", () => {
  assert.equal(satisfies("3.2.1", ">=3.2.0:a"), true);
});
