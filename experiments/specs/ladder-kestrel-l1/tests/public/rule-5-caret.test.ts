import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

test("[rule-5] a caret range holds from V up within the same MAJOR", () => {
  assert.equal(satisfies("1.2.3", "^1.2.3"), true);
  assert.equal(satisfies("1.2.4", "^1.2.3"), true);
  assert.equal(satisfies("1.9.0", "^1.2.3"), true);
  assert.equal(satisfies("1.2.2", "^1.2.3"), false);
  assert.equal(satisfies("2.0.0", "^1.2.3"), false);
  assert.equal(satisfies("0.9.9", "^1.2.3"), false);
});

test("[rule-5] a caret range with MAJOR 0 also keeps the MINOR", () => {
  assert.equal(satisfies("0.2.3", "^0.2.3"), true);
  assert.equal(satisfies("0.2.9", "^0.2.3"), true);
  assert.equal(satisfies("0.2.2", "^0.2.3"), false);
  assert.equal(satisfies("0.3.0", "^0.2.3"), false);
  assert.equal(satisfies("1.2.3", "^0.2.3"), false);
});

test("[rule-5] a caret range on 0.0 keeps the MINOR but not the PATCH", () => {
  assert.equal(satisfies("0.0.3", "^0.0.3"), true);
  assert.equal(satisfies("0.0.9", "^0.0.3"), true);
  assert.equal(satisfies("0.0.2", "^0.0.3"), false);
  assert.equal(satisfies("0.1.0", "^0.0.3"), false);
});
