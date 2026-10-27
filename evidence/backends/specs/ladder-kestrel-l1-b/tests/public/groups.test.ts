import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

test("[happy-7] commas and bars match the grouping examples", () => {
  assert.equal(satisfies("1.5.0", ">=1.0 , <2.0"), true);
  assert.equal(satisfies("2.5.0", ">=1.0,<2.0"), false);
  assert.equal(satisfies("2.5.0", ">=1.0,<2.0 | >=2.5"), true);
});

test("[happy-7] spaces are allowed at range edges and around separators", () => {
  assert.equal(satisfies("1.5", "  >=1.0  ,  <2.0  |  =3.0  "), true);
  assert.equal(satisfies("3.0", "  >=1.0  ,  <2.0  |  =3.0  "), true);
  assert.equal(satisfies("2.0", "  >=1.0  ,  <2.0  |  =3.0  "), false);
  assert.equal(satisfies("1.5", "  =1.5  "), true);
});

test("[happy-7] AND binds within each OR group at endpoint boundaries", () => {
  const range = ">=1.0,<2.0|>=3.0,<4.0";
  assert.equal(satisfies("1.0", range), true);
  assert.equal(satisfies("2.0", range), false);
  assert.equal(satisfies("3.0", range), true);
  assert.equal(satisfies("4.0", range), false);
  assert.equal(satisfies("1.5", ">=1.0,<1.0"), false);
});

test("[happy-7] groups combine wildcards tilde and caret comparators", () => {
  assert.equal(satisfies("1.4.3", "~1.4.2,<=1.4.3|^2.0,2.x"), true);
  assert.equal(satisfies("1.4.4", "~1.4.2,<=1.4.3|^2.0,2.x"), false);
  assert.equal(satisfies("2.8.0", "~1.4.2,<=1.4.3|^2.0,2.x"), true);
});

test("[unhappy-3] invalid range examples report the range", () => {
  for (const range of [">=1.0 <2.0", "=1.5 || =2.0", ">= 1.0", ">=1.0,"]) {
    assert.throws(
      () => satisfies("1.5.0", range),
      (error: unknown) => error instanceof Error && error.message.includes("range"),
      range,
    );
  }
});

test("[unhappy-3] empty ranges groups and comparators are invalid", () => {
  for (const range of ["", "   ", "|1.5", "1.5|", ",1.5", "1.5,,<2.0", "1.5, ,<2.0", "1.5| |2.0"]) {
    assert.throws(
      () => satisfies("1.5.0", range),
      (error: unknown) => error instanceof Error && error.message.includes("range"),
      range,
    );
  }
});

test("[unhappy-3] invalid comparator syntax and invalid operands name the range", () => {
  for (const range of [
    "nonsense", "!=1.5", "==1.5", "=>1.5", ">", "~", "^",
    "=01.5", "=1", "=1.5.0.0", "=1.5:RC", "=1.5:", "1. 5",
  ]) {
    assert.throws(
      () => satisfies("1.5.0", range),
      (error: unknown) => error instanceof Error && error.message.includes("range"),
      range,
    );
  }
});

test("[unhappy-3] every branch is validated even when another already decides the result", () => {
  for (const range of ["*|nonsense", "*|>7.x", "1.5,", "<1.0,nonsense", "1.5||2.0"]) {
    assert.throws(
      () => satisfies("1.5.0", range),
      (error: unknown) => error instanceof Error && error.message.includes("range"),
      range,
    );
  }
});

test("[happy-8] tagged versions match all eligibility examples", () => {
  assert.equal(satisfies("3.2.1:rc1", ">=3.2.0:a"), true);
  assert.equal(satisfies("3.2.1:rc1", ">=3.2.0"), false);
  assert.equal(satisfies("3.2.1:rc1", ">=3.1.0:a"), false);
  assert.equal(satisfies("3.2.1:rc1", "*"), false);
  assert.equal(satisfies("3.2.1:rc1", ">=3.2.0:a,<4.0.0"), true);
  assert.equal(satisfies("3.2.1:rc1", ">=3.2.0 | >=3.2.0:a"), true);
});

test("[happy-8] a tagged comparator in a failed group cannot authorize another group", () => {
  assert.equal(satisfies("3.2.1:rc1", "*|>=3.2.2:a"), false);
  assert.equal(satisfies("3.2.1:rc1", ">=3.2.2:a|*"), false);
  assert.equal(satisfies("3.2.1:rc1", ">=3.2.0:a,<3.2.1|*"), true);
});

test("[happy-8] eligibility requires both matching major and matching minor", () => {
  assert.equal(satisfies("3.2.1:rc1", ">=2.2.0:a"), false);
  assert.equal(satisfies("3.2.1:rc1", ">=3.1.0:a,<4.0"), false);
  assert.equal(satisfies("3.2.1:rc1", ">=3.2:a"), true);
});

test("[happy-8] wildcards alone cannot authorize tags but can join a tagged comparator", () => {
  assert.equal(satisfies("3.2.1:rc1", "3.x"), false);
  assert.equal(satisfies("3.2.1:rc1", "3.2.x"), false);
  assert.equal(satisfies("3.2.1:rc1", "*,3.x,3.2.x,>=3.2.0:a"), true);
  assert.equal(satisfies("3.2.1:rc1", "3.3.x,>=3.2.0:a"), false);
});

test("[happy-8] tagged tilde caret and upper bounds can authorize their own minor", () => {
  assert.equal(satisfies("3.2.1:rc1", "~3.2.0:a"), true);
  assert.equal(satisfies("3.2.1:rc1", "^3.2.0:a"), true);
  assert.equal(satisfies("3.3.1:rc1", "^3.2.0:a"), false);
  assert.equal(satisfies("3.2.1:rc1", "<3.2.2:a"), true);
  assert.equal(satisfies("3.2.1:rc1", "=3.2.1:rc1"), true);
});

test("[happy-8] eligibility never overrides a failed comparator", () => {
  assert.equal(satisfies("3.2.1:rc1", ">=3.2.1:rc2"), false);
  assert.equal(satisfies("3.2.1:rc1", ">=3.2.0:a,>3.2.1"), false);
  assert.equal(satisfies("3.2.1:rc1", "~3.2.0"), false);
  assert.equal(satisfies("3.2.1:rc1", "^3.2.0"), false);
});
