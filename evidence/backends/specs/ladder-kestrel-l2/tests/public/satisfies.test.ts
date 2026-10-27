import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

// spec.md has no explicit scenario tags. Its first six bullets describe
// happy scenarios in order; its last bullet describes unhappy scenario 1.

test("[happy-1] full versions support both release and tagged identity", () => {
  assert.equal(satisfies("2.4.1", "2.4.1"), true);
  assert.equal(satisfies("2.4.1:rc1", "2.4.1:rc1"), true);
});

test("[happy-1] a release sorts strictly after its tagged version", () => {
  assert.equal(satisfies("2.4.1", ">2.4.1:rc1"), true);
  assert.equal(satisfies("2.4.1", "<=2.4.1:rc1"), false);
});

test("[happy-1] a tagged version sorts strictly before its release", () => {
  assert.equal(satisfies("2.4.1:rc1", ">=2.4.1:rc1,<2.4.1"), true);
  assert.equal(satisfies("2.4.1:rc1", ">=2.4.1:rc1,>=2.4.1"), false);
});

test("[happy-2] bare versions require exact equality", () => {
  assert.equal(satisfies("2.4.1", "2.4.1"), true);
  assert.equal(satisfies("2.4.0", "2.4.1"), false);
  assert.equal(satisfies("2.4.2", "2.4.1"), false);
});

test("[happy-2] explicit equality compares all three version components", () => {
  assert.equal(satisfies("2.4.1", "=2.4.1"), true);
  assert.equal(satisfies("3.4.1", "=2.4.1"), false);
  assert.equal(satisfies("2.5.1", "=2.4.1"), false);
  assert.equal(satisfies("2.4.2", "=2.4.1"), false);
});

test("[happy-2] greater-than excludes equality and compares components numerically", () => {
  assert.equal(satisfies("2.4.10", ">2.4.9"), true);
  assert.equal(satisfies("2.10.0", ">2.9.99"), true);
  assert.equal(satisfies("10.0.0", ">9.99.99"), true);
  assert.equal(satisfies("2.4.1", ">2.4.1"), false);
  assert.equal(satisfies("2.4.0", ">2.4.1"), false);
});

test("[happy-2] greater-than-or-equal includes its endpoint", () => {
  assert.equal(satisfies("2.4.2", ">=2.4.1"), true);
  assert.equal(satisfies("2.4.1", ">=2.4.1"), true);
  assert.equal(satisfies("2.4.0", ">=2.4.1"), false);
});

test("[happy-2] less-than excludes equality and respects component priority", () => {
  assert.equal(satisfies("2.4.9", "<2.4.10"), true);
  assert.equal(satisfies("2.9.99", "<2.10.0"), true);
  assert.equal(satisfies("9.99.99", "<10.0.0"), true);
  assert.equal(satisfies("2.4.1", "<2.4.1"), false);
  assert.equal(satisfies("2.4.2", "<2.4.1"), false);
});

test("[happy-2] less-than-or-equal includes its endpoint", () => {
  assert.equal(satisfies("2.4.0", "<=2.4.1"), true);
  assert.equal(satisfies("2.4.1", "<=2.4.1"), true);
  assert.equal(satisfies("2.4.2", "<=2.4.1"), false);
});

test("[happy-3] tilde includes its minimum and later patches", () => {
  assert.equal(satisfies("2.4.1", "~2.4.1"), true);
  assert.equal(satisfies("2.4.10", "~2.4.1"), true);
});

test("[happy-3] tilde rejects earlier versions and a changed minor or major", () => {
  assert.equal(satisfies("2.4.0", "~2.4.1"), false);
  assert.equal(satisfies("2.3.99", "~2.4.1"), false);
  assert.equal(satisfies("2.5.0", "~2.4.1"), false);
  assert.equal(satisfies("3.4.1", "~2.4.1"), false);
});

test("[happy-3] caret includes its minimum and later versions in the same major", () => {
  assert.equal(satisfies("2.4.1", "^2.4.1"), true);
  assert.equal(satisfies("2.4.10", "^2.4.1"), true);
  assert.equal(satisfies("2.5.0", "^2.4.1"), true);
});

test("[happy-3] caret bounds use the same major even when that major is zero", () => {
  assert.equal(satisfies("2.4.0", "^2.4.1"), false);
  assert.equal(satisfies("3.0.0", "^2.4.1"), false);
  assert.equal(satisfies("0.2.3", "^0.2.3"), true);
  assert.equal(satisfies("0.3.0", "^0.2.3"), true);
  assert.equal(satisfies("0.2.2", "^0.2.3"), false);
  assert.equal(satisfies("1.0.0", "^0.2.3"), false);
});

test("[happy-4] star accepts release versions including the zero version", () => {
  assert.equal(satisfies("2.4.1", "*"), true);
  assert.equal(satisfies("0.0.0", "*"), true);
  assert.equal(satisfies("999.999.999", "*"), true);
});

test("[happy-4] a major wildcard includes the whole major and excludes its neighbors", () => {
  assert.equal(satisfies("2.4.1", "2.x"), true);
  assert.equal(satisfies("2.0.0", "2.x"), true);
  assert.equal(satisfies("2.99.99", "2.x"), true);
  assert.equal(satisfies("1.99.99", "2.x"), false);
  assert.equal(satisfies("3.0.0", "2.x"), false);
});

test("[happy-4] a patch wildcard fixes both major and minor", () => {
  assert.equal(satisfies("2.4.1", "2.4.x"), true);
  assert.equal(satisfies("2.4.0", "2.4.x"), true);
  assert.equal(satisfies("2.4.99", "2.4.x"), true);
  assert.equal(satisfies("2.3.99", "2.4.x"), false);
  assert.equal(satisfies("2.5.0", "2.4.x"), false);
  assert.equal(satisfies("3.4.1", "2.4.x"), false);
});

test("[happy-5] comma joins require every comparator to hold", () => {
  assert.equal(satisfies("2.4.5", ">=2.4.1,<2.5.0,>2.4.3"), true);
  assert.equal(satisfies("2.4.2", ">=2.4.1,<2.5.0,>2.4.3"), false);
});

test("[happy-5] conjunctions retain inclusive and exclusive endpoints", () => {
  assert.equal(satisfies("2.4.1", ">=2.4.1,<2.5.0"), true);
  assert.equal(satisfies("2.4.0", ">=2.4.1,<2.5.0"), false);
  assert.equal(satisfies("2.5.0", ">=2.4.1,<2.5.0"), false);
  assert.equal(satisfies("2.4.1", ">=2.4.1,<=2.4.1"), true);
  assert.equal(satisfies("2.4.1", ">2.4.1,<=2.4.1"), false);
});

test("[happy-5] either alternative group can satisfy a range", () => {
  assert.equal(satisfies("2.4.5", ">=2.4.0,<2.5.0|>=3.1.0,<3.2.0"), true);
  assert.equal(satisfies("3.1.5", ">=2.4.0,<2.5.0|>=3.1.0,<3.2.0"), true);
  assert.equal(satisfies("2.4.1", "2.4.1|2.4.1"), true);
});

test("[happy-5] alternatives reject versions outside every complete group", () => {
  assert.equal(satisfies("2.3.99", ">=2.4.0,<2.5.0|>=3.1.0,<3.2.0"), false);
  assert.equal(satisfies("2.5.0", ">=2.4.0,<2.5.0|>=3.1.0,<3.2.0"), false);
  assert.equal(satisfies("3.1.0", ">=2.4.0,<2.5.0|>=3.1.0,<3.2.0"), true);
  assert.equal(satisfies("3.2.0", ">=2.4.0,<2.5.0|>=3.1.0,<3.2.0"), false);
});

test("[happy-6] a tagged version can match a range mentioning a tag", () => {
  assert.equal(satisfies("2.4.1:rc1", "=2.4.1:rc1"), true);
  assert.equal(satisfies("2.4.1:rc1", ">=2.4.1:rc1,<2.4.1"), true);
});

test("[happy-6] tagged versions are excluded when the range mentions no tag", () => {
  assert.equal(satisfies("2.4.1:rc1", "*"), false);
  assert.equal(satisfies("2.4.1:rc1", "2.x"), false);
  assert.equal(satisfies("2.4.1:rc1", "2.4.x"), false);
  assert.equal(satisfies("2.4.1:rc1", ">=2.4.0,<2.5.0"), false);
  assert.equal(satisfies("2.4.1:rc1", "~2.4.0"), false);
  assert.equal(satisfies("2.4.1:rc1", "^2.4.0"), false);
});

test("[happy-6] mentioning a tag still requires the comparator to hold", () => {
  assert.equal(satisfies("2.4.1:rc1", ">2.4.1:rc1"), false);
  assert.equal(satisfies("2.4.1:rc1", "<2.4.1:rc1"), false);
  assert.equal(satisfies("2.4.1:rc1", "<=2.4.1:rc1"), true);
});

test("[unhappy-1] malformed version components throw an Error", () => {
  for (const version of ["not-a-version", "two.4.1", "2.four.1", "2.4.one", "2.4.x"]) {
    assert.throws(() => satisfies(version, "*"), Error);
  }
});

test("[unhappy-1] empty and incomplete versions throw an Error", () => {
  for (const version of ["", "2", "2.4", "2.4.1.0"]) {
    assert.throws(() => satisfies(version, "*"), Error);
  }
});

test("[unhappy-1] invalid range syntax throws an Error", () => {
  for (const range of ["not-a-range", "==2.4.1", ">>2.4.1", ">=two.4.1"]) {
    assert.throws(() => satisfies("2.4.1", range), Error);
  }
});

test("[unhappy-1] empty ranges and comparators missing their version throw an Error", () => {
  for (const range of ["", "=", ">", ">=", "<", "<=", "~", "^"]) {
    assert.throws(() => satisfies("2.4.1", range), Error);
  }
});
