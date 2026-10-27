import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

// spec.md has no tagged scenarios. Number its features in their stated order:
// happy-1: colon tags; happy-2: >=; happy-3: ~; happy-4: ^;
// happy-5: comma AND; happy-6: pipe OR.
// The interface additionally requires errors for invalid versions (unhappy-1)
// and invalid ranges (unhappy-2).

test("[happy-1] a colon-tagged version satisfies its inclusive comparator", () => {
  assert.equal(satisfies("2.4.1:rc1", ">=2.4.1:rc1"), true);
});

test("[happy-1] a colon-tagged version below the required patch is excluded", () => {
  assert.equal(satisfies("2.4.1:rc1", ">=2.4.2:rc1"), false);
});

test("[happy-2] an inclusive comparator accepts a greater version", () => {
  assert.equal(satisfies("2.5.0", ">=2.4.1"), true);
});

test("[happy-2] an inclusive comparator includes equality and excludes the preceding patch", () => {
  assert.equal(satisfies("2.4.1", ">=2.4.1"), true);
  assert.equal(satisfies("2.4.0", ">=2.4.1"), false);
});

test("[happy-3] a tilde range accepts a later patch in the same minor", () => {
  assert.equal(satisfies("2.4.2", "~2.4.1"), true);
});

test("[happy-3] a tilde range excludes the next minor at its upper boundary", () => {
  assert.equal(satisfies("2.5.0", "~2.4.1"), false);
});

test("[happy-4] a caret range accepts a later minor in the same nonzero major", () => {
  assert.equal(satisfies("2.5.0", "^2.4.1"), true);
});

test("[happy-4] a caret range excludes the next major at its upper boundary", () => {
  assert.equal(satisfies("3.0.0", "^2.4.1"), false);
});

test("[happy-5] comma AND accepts a version satisfying both comparators", () => {
  assert.equal(satisfies("2.6.0", ">=2.4.1,>=2.5.0"), true);
});

test("[happy-5] comma AND requires both comparators at an inclusive threshold", () => {
  assert.equal(satisfies("2.5.0", ">=2.4.1,>=2.5.0"), true);
  assert.equal(satisfies("2.4.9", ">=2.4.1,>=2.5.0"), false);
  assert.equal(satisfies("2.4.9", ">=2.5.0,>=2.4.1"), false);
});

test("[happy-6] pipe OR accepts a version satisfying either alternative", () => {
  assert.equal(satisfies("2.4.2", ">=2.4.1|>=3.0.0"), true);
  assert.equal(satisfies("2.4.2", ">=3.0.0|>=2.4.1"), true);
});

test("[happy-6] pipe OR includes an alternative's threshold and excludes versions below both", () => {
  assert.equal(satisfies("2.4.1", ">=3.0.0|>=2.4.1"), true);
  assert.equal(satisfies("2.4.0", ">=3.0.0|>=2.4.1"), false);
});

test("[unhappy-1] a malformed version throws an Error", () => {
  assert.throws(() => satisfies("not-a-version", ">=2.4.1"), Error);
});

test("[unhappy-1] an empty version throws an Error", () => {
  assert.throws(() => satisfies("", ">=2.4.1"), Error);
});

test("[unhappy-2] a malformed range throws an Error", () => {
  assert.throws(() => satisfies("2.4.1", "not-a-range"), Error);
});

test("[unhappy-2] a comparator with no version operand throws an Error", () => {
  assert.throws(() => satisfies("2.4.1", ">="), Error);
});
