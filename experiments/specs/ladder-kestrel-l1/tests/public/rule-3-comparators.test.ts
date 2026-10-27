import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

test("[rule-3] each operator compares with its version", () => {
  assert.equal(satisfies("1.2.3", "=1.2.3"), true);
  assert.equal(satisfies("1.2.3", "=1.2.4"), false);
  assert.equal(satisfies("1.5.0", ">1.2.0"), true);
  assert.equal(satisfies("1.0.0", ">1.2.0"), false);
  assert.equal(satisfies("1.5.0", ">=1.2.0"), true);
  assert.equal(satisfies("1.0.0", ">=1.2.0"), false);
  assert.equal(satisfies("1.0.0", "<1.2.0"), true);
  assert.equal(satisfies("1.5.0", "<1.2.0"), false);
  assert.equal(satisfies("1.0.0", "<=1.2.0"), true);
  assert.equal(satisfies("1.5.0", "<=1.2.0"), false);
});

test("[rule-3] a version with no operator means =V", () => {
  assert.equal(satisfies("1.2.3", "1.2.3"), true);
  assert.equal(satisfies("1.2.4", "1.2.3"), false);
  assert.equal(satisfies("1.2.2", "1.2.3"), false);
});

test("[rule-3] at V itself only the inclusive operators hold", () => {
  assert.equal(satisfies("1.2.3", ">=1.2.3"), true);
  assert.equal(satisfies("1.2.3", "<=1.2.3"), true);
  assert.equal(satisfies("1.2.3", ">1.2.3"), false);
  assert.equal(satisfies("1.2.3", "<1.2.3"), false);
  assert.equal(satisfies("1.2", ">=1.2.0"), true);
  assert.equal(satisfies("1.2", ">1.2.0"), false);
});
