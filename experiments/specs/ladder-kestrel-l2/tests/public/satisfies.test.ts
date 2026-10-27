import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

// Versions, with an optional tag; a tagged version precedes its release.

test("[rule-1] a plain version satisfies a range naming that version", () => {
  assert.equal(satisfies("2.4.1", "=2.4.1"), true);
});

test("[rule-1] a tagged version satisfies a range naming that tagged version", () => {
  assert.equal(satisfies("2.4.1:rc1", "=2.4.1:rc1"), true);
});

test("[rule-1] a release comes after its tagged version", () => {
  assert.equal(satisfies("2.4.1", ">2.4.1:rc1"), true);
  assert.equal(satisfies("2.4.1", "<2.4.1:rc1"), false);
});

test("[rule-1] a tagged version comes before its release", () => {
  assert.equal(satisfies("2.4.1:rc1", ">=2.4.1:rc1,<2.4.1"), true);
});

// Comparators, and a bare version meaning `=`.

test("[rule-2] each comparator holds for a version on its side", () => {
  assert.equal(satisfies("2.4.2", ">2.4.1"), true);
  assert.equal(satisfies("2.4.2", ">=2.4.1"), true);
  assert.equal(satisfies("2.4.0", "<2.4.1"), true);
  assert.equal(satisfies("2.4.0", "<=2.4.1"), true);
  assert.equal(satisfies("2.4.1", "2.4.1"), true);
});

test("[rule-2] at the compared version only the inclusive comparators hold", () => {
  assert.equal(satisfies("2.4.1", ">2.4.1"), false);
  assert.equal(satisfies("2.4.1", "<2.4.1"), false);
  assert.equal(satisfies("2.4.1", ">=2.4.1"), true);
  assert.equal(satisfies("2.4.1", "<=2.4.1"), true);
});

test("[rule-2] a bare version does not match a neighbouring version", () => {
  assert.equal(satisfies("2.4.2", "2.4.1"), false);
  assert.equal(satisfies("2.4.0", "2.4.1"), false);
});

// Tilde and caret.

test("[rule-3] ~V matches a later version in the same major and minor", () => {
  assert.equal(satisfies("2.4.7", "~2.4.1"), true);
});

test("[rule-3] ~V includes V and excludes the next minor and anything below V", () => {
  assert.equal(satisfies("2.4.1", "~2.4.1"), true);
  assert.equal(satisfies("2.5.0", "~2.4.1"), false);
  assert.equal(satisfies("2.4.0", "~2.4.1"), false);
});

test("[rule-3] ^V matches a later version in the same major", () => {
  assert.equal(satisfies("2.9.0", "^2.4.1"), true);
});

test("[rule-3] ^V includes V and excludes the next major and anything below V", () => {
  assert.equal(satisfies("2.4.1", "^2.4.1"), true);
  assert.equal(satisfies("3.0.0", "^2.4.1"), false);
  assert.equal(satisfies("2.4.0", "^2.4.1"), false);
});

test("[rule-3] ^V with major 0 still spans the whole major", () => {
  assert.equal(satisfies("0.9.0", "^0.2.3"), true);
});

// Wildcards.

test("[rule-4] wildcards match versions within what they leave fixed", () => {
  assert.equal(satisfies("7.3.9", "*"), true);
  assert.equal(satisfies("2.9.3", "2.x"), true);
  assert.equal(satisfies("2.4.9", "2.4.x"), true);
});

test("[rule-4] wildcards exclude versions just outside what they leave fixed", () => {
  assert.equal(satisfies("3.0.0", "2.x"), false);
  assert.equal(satisfies("1.9.9", "2.x"), false);
  assert.equal(satisfies("2.5.0", "2.4.x"), false);
  assert.equal(satisfies("2.3.9", "2.4.x"), false);
});

// `,` and `|`.

test("[rule-5] comparators joined by , all hold", () => {
  assert.equal(satisfies("2.5.0", ">=2.0.0,<3.0.0"), true);
});

test("[rule-5] one failing comparator in a , list fails the group", () => {
  assert.equal(satisfies("3.0.0", ">=2.0.0,<3.0.0"), false);
});

test("[rule-5] a version matching any | alternative satisfies the range", () => {
  assert.equal(satisfies("3.1.0", "1.x|3.x"), true);
  assert.equal(satisfies("1.2.0", "1.x|3.x"), true);
});

test("[rule-5] a version between | alternatives matches none", () => {
  assert.equal(satisfies("2.0.0", "1.x|3.x"), false);
  assert.equal(satisfies("1.7.0", ">=1.0.0,<1.5.0|>=3.0.0"), false);
  assert.equal(satisfies("3.2.0", ">=1.0.0,<1.5.0|>=3.0.0"), true);
});

// Tagged versions and ranges without a tag.

test("[rule-6] a tagged version matches a range mentioning a tag", () => {
  assert.equal(satisfies("2.4.1:rc1", ">=2.4.1:rc1"), true);
});

test("[rule-6] a tagged version matches no range that mentions no tag", () => {
  assert.equal(satisfies("2.4.1:rc1", "*"), false);
  assert.equal(satisfies("2.4.1:rc1", ">=2.0.0"), false);
  assert.equal(satisfies("2.4.1:rc1", "<2.4.1"), false);
  assert.equal(satisfies("2.4.1:rc1", "2.4.x"), false);
});

// Invalid input.

test("[rule-7] an invalid version throws an Error", () => {
  assert.throws(() => satisfies("banana", "2.4.1"), Error);
});

test("[rule-7] an invalid range throws an Error", () => {
  assert.throws(() => satisfies("2.4.1", ">=banana"), Error);
});

test("[rule-7] an invalid version throws even against a range matching everything", () => {
  assert.throws(() => satisfies("", "*"), Error);
});
