import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

test("[happy-3] comparators match the examples", () => {
  assert.equal(satisfies("2.4.0", "2.4"), true);
  assert.equal(satisfies("2.4.1", ">2.4"), true);
  assert.equal(satisfies("2.4.1", "<=2.4.0"), false);
  assert.equal(satisfies("3.0.0", ">=3.0"), true);
});

test("[happy-3] strict and inclusive comparators differ at equality", () => {
  assert.equal(satisfies("2.4", "=2.4.0"), true);
  assert.equal(satisfies("2.4", ">2.4.0"), false);
  assert.equal(satisfies("2.4", ">=2.4.0"), true);
  assert.equal(satisfies("2.4", "<2.4.0"), false);
  assert.equal(satisfies("2.4", "<=2.4.0"), true);
});

test("[happy-3] comparators handle values on either side of the operand", () => {
  assert.equal(satisfies("2.4.1", "=2.4.0"), false);
  assert.equal(satisfies("2.3.9", "<2.4"), true);
  assert.equal(satisfies("2.3.9", "<=2.4"), true);
  assert.equal(satisfies("2.3.9", ">=2.4"), false);
  assert.equal(satisfies("2.4.1", "<2.4"), false);
});

test("[happy-4] tilde matches the examples", () => {
  assert.equal(satisfies("1.4.7", "~1.4.2"), true);
  assert.equal(satisfies("1.4.1", "~1.4.2"), false);
  assert.equal(satisfies("1.5.0", "~1.4.2"), false);
  assert.equal(satisfies("1.4.0", "~1.4"), true);
});

test("[happy-4] tilde includes its floor and requires both major and minor", () => {
  assert.equal(satisfies("1.4.2", "~1.4.2"), true);
  assert.equal(satisfies("2.4.2", "~1.4.2"), false);
  assert.equal(satisfies("1.3.99", "~1.4.2"), false);
  assert.equal(satisfies("0.0.1", "~0.0"), true);
  assert.equal(satisfies("0.1.0", "~0.0"), false);
});

test("[happy-5] caret matches the examples", () => {
  assert.equal(satisfies("1.9.0", "^1.2.3"), true);
  assert.equal(satisfies("2.0.0", "^1.2.3"), false);
  assert.equal(satisfies("0.2.9", "^0.2.3"), true);
  assert.equal(satisfies("0.3.0", "^0.2.3"), false);
});

test("[happy-5] caret includes its floor and excludes lower versions", () => {
  assert.equal(satisfies("1.2.3", "^1.2.3"), true);
  assert.equal(satisfies("1.2.2", "^1.2.3"), false);
  assert.equal(satisfies("1.1.99", "^1.2.3"), false);
  assert.equal(satisfies("0.2.3", "^0.2.3"), true);
  assert.equal(satisfies("0.2.2", "^0.2.3"), false);
});

test("[happy-5] caret at major and minor zero permits later patches", () => {
  assert.equal(satisfies("0.0.9", "^0.0.3"), true);
  assert.equal(satisfies("0.1.0", "^0.0.3"), false);
  assert.equal(satisfies("0.0", "^0.0"), true);
  assert.equal(satisfies("1.0.0", "^0.0"), false);
});

test("[happy-6] wildcards match the examples", () => {
  assert.equal(satisfies("7.1.3", "*"), true);
  assert.equal(satisfies("7.1.3", "7.x"), true);
  assert.equal(satisfies("7.1.3", "7.2.x"), false);
});

test("[happy-6] wildcard component boundaries include zero and omitted patches", () => {
  assert.equal(satisfies("0.0", "*"), true);
  assert.equal(satisfies("0.0", "0.x"), true);
  assert.equal(satisfies("0.0.99", "0.0.x"), true);
  assert.equal(satisfies("7.2", "7.2.x"), true);
  assert.equal(satisfies("7.99.99", "7.x"), true);
  assert.equal(satisfies("8.0", "7.x"), false);
  assert.equal(satisfies("7.3.0", "7.2.x"), false);
});

test("[unhappy-2] an operator before a wildcard reports an invalid range", () => {
  assert.throws(
    () => satisfies("7.1.3", ">7.x"),
    (error: unknown) => error instanceof Error && error.message.includes("range"),
  );
});

test("[unhappy-2] other operators and malformed wildcard shapes are invalid", () => {
  for (const range of [
    "=7.x", ">=7.x", "<7.1.x", "<=7.1.x", "~2.4.x", "^7.x", "=*",
    "x", "2.*", "2.x.x", "2.x.0", "2.X", "02.x", "2.04.x",
  ]) {
    assert.throws(
      () => satisfies("7.1.3", range),
      (error: unknown) => error instanceof Error && error.message.includes("range"),
      range,
    );
  }
});
