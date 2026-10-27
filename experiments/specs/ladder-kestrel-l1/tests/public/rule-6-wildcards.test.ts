import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

test("[rule-6] * holds for every version", () => {
  assert.equal(satisfies("0.0", "*"), true);
  assert.equal(satisfies("1.2.3", "*"), true);
  assert.equal(satisfies("99.0.1", "*"), true);
});

test("[rule-6] M.x and M.N.x hold for versions with that MAJOR, and MINOR", () => {
  assert.equal(satisfies("1.0", "1.x"), true);
  assert.equal(satisfies("1.99.99", "1.x"), true);
  assert.equal(satisfies("0.9.9", "1.x"), false);
  assert.equal(satisfies("2.0.0", "1.x"), false);
  assert.equal(satisfies("0.5.0", "0.x"), true);
  assert.equal(satisfies("1.2.0", "1.2.x"), true);
  assert.equal(satisfies("1.2.99", "1.2.x"), true);
  assert.equal(satisfies("1.1.9", "1.2.x"), false);
  assert.equal(satisfies("1.3.0", "1.2.x"), false);
  assert.equal(satisfies("2.2.0", "1.2.x"), false);
});

test("[rule-6] misplaced or operator-prefixed wildcards are invalid ranges", () => {
  const invalid = [
    "x",
    "x.1",
    "1.x.x",
    "1.x.0",
    "1.2.3.x",
    "1.X",
    "**",
    "=*",
    ">*",
    ">1.x",
    "=1.2.x",
    "<=1.x",
    "~1.x",
    "^1.2.x",
  ];
  for (const range of invalid) {
    assert.throws(
      () => satisfies("1.2.3", range),
      (err: unknown) => err instanceof Error && err.message.includes("range"),
      JSON.stringify(range),
    );
  }
});
