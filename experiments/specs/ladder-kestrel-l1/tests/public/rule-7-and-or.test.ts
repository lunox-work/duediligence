import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

test("[rule-7] commas join comparators with AND", () => {
  assert.equal(satisfies("1.5.0", ">=1.0, <2.0"), true);
  assert.equal(satisfies("2.0.0", ">=1.0, <2.0"), false);
  assert.equal(satisfies("0.9.0", ">=1.0, <2.0"), false);
});

test("[rule-7] bars join groups with OR, and commas bind within a group", () => {
  assert.equal(satisfies("0.5.0", "<1.0 | >=2.0"), true);
  assert.equal(satisfies("2.1.0", "<1.0 | >=2.0"), true);
  assert.equal(satisfies("1.5.0", "<1.0 | >=2.0"), false);
  assert.equal(satisfies("1.2.0", ">=1.0, <1.5 | >=3.0"), true);
  assert.equal(satisfies("3.1.0", ">=1.0, <1.5 | >=3.0"), true);
  assert.equal(satisfies("2.0.0", ">=1.0, <1.5 | >=3.0"), false);
});

test("[rule-7] spaces are allowed around separators and at the ends", () => {
  assert.equal(satisfies("1.5.0", ">=1.0,<2.0"), true);
  assert.equal(satisfies("1.5.0", "  >=1.0  ,  <2.0  "), true);
  assert.equal(satisfies("3.0.0", "<1.0|3.0"), true);
  assert.equal(satisfies("3.0.0", " <1.0   |   3.0 "), true);
  assert.equal(satisfies("1.5.0", " * "), true);
});

test("[rule-7] empty comparators or groups and spaces inside a comparator are invalid", () => {
  const invalid = [
    "",
    "   ",
    "1.0 || 2.0",
    "1.0||2.0",
    "| 1.0",
    "1.0 |",
    ",>=1.0",
    ">=1.0,",
    ">=1.0, ",
    ">=1.0,,<2.0",
    ">=1.0, , <2.0",
    "> 1.0",
    ">= 1.0",
    ">=1.0, < 2.0",
    "~ 1.2",
    "^ 1.2",
    "1. 0",
    "1.0 2.0",
  ];
  for (const range of invalid) {
    assert.throws(
      () => satisfies("1.0.0", range),
      (err: unknown) => err instanceof Error && err.message.includes("range"),
      JSON.stringify(range),
    );
  }
});

test("[rule-7] an invalid group makes the range invalid even when another group holds", () => {
  for (const range of ["1.0 | > 2.0", "1.0 |", "1.0, >=0.5 |  | 2.0"]) {
    assert.throws(
      () => satisfies("1.0.0", range),
      (err: unknown) => err instanceof Error && err.message.includes("range"),
      JSON.stringify(range),
    );
  }
});
