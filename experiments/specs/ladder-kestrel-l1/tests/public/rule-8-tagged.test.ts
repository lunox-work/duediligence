import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

test("[rule-8] a tagged version satisfies a group with a tagged comparator of its own minor", () => {
  assert.equal(satisfies("1.2.3:rc1", "=1.2.3:rc1"), true);
  assert.equal(satisfies("1.2.5:beta", ">=1.2.0:alpha, <2.0"), true);
  assert.equal(satisfies("1.2.5:beta", "<2.0, >=1.2.0:alpha"), true);
  assert.equal(satisfies("1.2.3:rc1", "^1.2.0:a"), true);
});

test("[rule-8] a tagged version needs every comparator to hold as well", () => {
  assert.equal(satisfies("1.2.3:rc1", "<1.2.3:alpha"), false);
  assert.equal(satisfies("1.2.5:beta", ">=1.2.0:alpha, <1.2.5"), false);
});

test("[rule-8] a tagged version satisfies no group without a tagged comparator of its own minor", () => {
  // No tagged comparator at all.
  assert.equal(satisfies("1.2.3:rc1", ">=1.0.0, <2.0"), false);
  assert.equal(satisfies("1.2.3:rc1", "<1.2.3"), false);
  // Tagged comparators of another MINOR or MAJOR.
  assert.equal(satisfies("1.2.3:rc1", ">=1.1.0:a, <2.0"), false);
  assert.equal(satisfies("1.2.3:rc1", ">=1.0.0:a"), false);
  assert.equal(satisfies("1.2.3:rc1", "<2.2.0:a"), false);
  // A wildcard names no version.
  assert.equal(satisfies("1.2.3:rc1", "*"), false);
  assert.equal(satisfies("1.2.3:rc1", "1.x"), false);
  assert.equal(satisfies("1.2.3:rc1", "1.2.x"), false);
});

test("[rule-8] the tagged comparator must be in the group that holds", () => {
  assert.equal(satisfies("1.2.3:rc1", ">=1.0, <2.0 | >=1.2.0:a, <1.2.0"), false);
  assert.equal(satisfies("1.2.3:rc1", ">=1.0, <2.0 | >=1.2.0:a"), true);
});

test("[rule-8] an untagged version needs no tagged comparator", () => {
  assert.equal(satisfies("1.2.3", ">=1.0.0, <2.0"), true);
  assert.equal(satisfies("1.2.3", "*"), true);
  assert.equal(satisfies("1.2.3", ">=1.2.3:rc1"), true);
});
