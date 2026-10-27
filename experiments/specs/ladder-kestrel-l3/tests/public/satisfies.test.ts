import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

// spec.md tags no scenarios. Keys follow the clauses of its one paragraph,
// in order: tagged versions, `>=`, `~`, `^`, `,` (AND), `|` (OR); and the
// interface's "throws when not valid".

test("[happy-1] a version with a colon tag is accepted", () => {
  assert.equal(satisfies("2.4.1:rc1", ">=2.4.1:rc1"), true);
});

test("[happy-1] a version with a colon tag is not satisfied by a range above its numbers", () => {
  assert.equal(satisfies("2.4.1:rc1", ">=2.4.2"), false);
});

test("[happy-2] >= is satisfied by a greater version", () => {
  assert.equal(satisfies("2.4.1", ">=1.0.0"), true);
});

test("[happy-2] >= is satisfied by an equal version but not by one just below", () => {
  assert.equal(satisfies("2.4.1", ">=2.4.1"), true);
  assert.equal(satisfies("2.4.0", ">=2.4.1"), false);
});

test("[happy-3] ~ is satisfied by its own base version", () => {
  assert.equal(satisfies("2.4.1", "~2.4.1"), true);
});

test("[happy-3] ~ is not satisfied by a version just below its base", () => {
  assert.equal(satisfies("2.4.0", "~2.4.1"), false);
});

test("[happy-4] ^ is satisfied by its own base version", () => {
  assert.equal(satisfies("2.4.1", "^2.4.1"), true);
});

test("[happy-4] ^ is not satisfied by a version just below its base", () => {
  assert.equal(satisfies("2.4.0", "^2.4.1"), false);
});

test("[happy-5] , is satisfied when every comparator is", () => {
  assert.equal(satisfies("2.4.1", ">=1.0.0,>=2.0.0"), true);
});

test("[happy-5] , is not satisfied when only the last comparator fails", () => {
  assert.equal(satisfies("2.4.1", ">=1.0.0,>=2.4.2"), false);
});

test("[happy-6] | is satisfied when any alternative is", () => {
  assert.equal(satisfies("2.4.1", ">=3.0.0|>=1.0.0"), true);
});

test("[happy-6] | is not satisfied when no alternative is", () => {
  assert.equal(satisfies("2.4.1", ">=3.0.0|>=2.4.2"), false);
});

test("[unhappy-1] an invalid version throws", () => {
  assert.throws(() => satisfies("not a version", ">=1.0.0"), Error);
});

test("[unhappy-1] a comparator with no version throws", () => {
  assert.throws(() => satisfies("2.4.1", ">="), Error);
});
