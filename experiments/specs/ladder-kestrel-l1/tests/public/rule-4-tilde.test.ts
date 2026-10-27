import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

test("[rule-4] a tilde range holds from V up within the same MAJOR and MINOR", () => {
  assert.equal(satisfies("1.2.3", "~1.2.3"), true);
  assert.equal(satisfies("1.2.10", "~1.2.3"), true);
  assert.equal(satisfies("1.2.2", "~1.2.3"), false);
  assert.equal(satisfies("1.3.0", "~1.2.3"), false);
  assert.equal(satisfies("2.2.3", "~1.2.3"), false);
});

test("[rule-4] a tilde range stops at the next MINOR, even from PATCH 0", () => {
  assert.equal(satisfies("1.2.0", "~1.2"), true);
  assert.equal(satisfies("1.2.99", "~1.2"), true);
  assert.equal(satisfies("1.3.0", "~1.2"), false);
  assert.equal(satisfies("1.1.99", "~1.2"), false);
  assert.equal(satisfies("0.0.5", "~0.0"), true);
  assert.equal(satisfies("0.1.0", "~0.0"), false);
});

test("[rule-4] a tilde range on a tagged version orders tags below the untagged version", () => {
  assert.equal(satisfies("1.2.3:rc2", "~1.2.3:rc1"), true);
  assert.equal(satisfies("1.2.3:rc0", "~1.2.3:rc1"), false);
  assert.equal(satisfies("1.2.3", "~1.2.3:rc1"), true);
});
