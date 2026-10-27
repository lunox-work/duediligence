import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

test("[rule-2] MAJOR, MINOR and PATCH compare as numbers, in that order", () => {
  assert.equal(satisfies("1.10.0", ">1.9.0"), true);
  assert.equal(satisfies("1.9.0", ">1.10.0"), false);
  assert.equal(satisfies("1.2.10", ">1.2.9"), true);
  assert.equal(satisfies("2.0.0", ">1.99.99"), true);
  assert.equal(satisfies("1.99.99", "<2.0.0"), true);
});

test("[rule-2] a version without a tag is greater than one with a tag", () => {
  assert.equal(satisfies("1.2.3", ">1.2.3:rc1"), true);
  assert.equal(satisfies("1.2.3", "<=1.2.3:zzz"), false);
  assert.equal(satisfies("1.2.3:rc1", "<1.2.3, >=1.2.3:a"), true);
});

test("[rule-2] tags compare run by run", () => {
  // Two digit runs compare as numbers.
  assert.equal(satisfies("1.2.3:rc10", ">1.2.3:rc9"), true);
  // Two letter runs compare by character code.
  assert.equal(satisfies("1.2.3:alpha", "<1.2.3:beta"), true);
  assert.equal(satisfies("1.2.3:b", ">1.2.3:azzz"), true);
  // A digit run is lower than a letter run.
  assert.equal(satisfies("1.2.3:9", "<1.2.3:a"), true);
  assert.equal(satisfies("1.2.3:99z", "<1.2.3:a"), true);
  // The tag that runs out first is lower.
  assert.equal(satisfies("1.2.3:rc", "<1.2.3:rc1"), true);
  assert.equal(satisfies("1.2.3:rc1", ">1.2.3:rc"), true);
});

test("[rule-2] tags whose runs are all equal make the same version", () => {
  assert.equal(satisfies("1.2.3:rc01", "=1.2.3:rc1"), true);
  assert.equal(satisfies("1.2.3:rc1", "1.2.3:rc001"), true);
  assert.equal(satisfies("1.2.3:rc1", ">1.2.3:rc01"), false);
  assert.equal(satisfies("1.2.3:rc1", "<1.2.3:rc01"), false);
  assert.equal(satisfies("1.2:rc1", "=1.2.0:rc1"), true);
});
