import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

test("[rule-1] a version without PATCH is the same version as with PATCH 0", () => {
  assert.equal(satisfies("2.4", "=2.4.0"), true);
  assert.equal(satisfies("2.4.0", "=2.4"), true);
  assert.equal(satisfies("2.4", "2.4.0"), true);
  assert.equal(satisfies("2.4.1", "=2.4"), false);
});

test("[rule-1] zero parts and tags of lowercase letters and digits are valid versions", () => {
  for (const version of ["0.0", "0.0.0", "10.20.30", "1.2:rc1", "1.2.3:0", "1.2.3:abc123"]) {
    assert.doesNotThrow(() => satisfies(version, "*"), version);
  }
  assert.equal(satisfies("0.0", "*"), true);
  assert.equal(satisfies("10.20.30", "=10.20.30"), true);
});

test("[rule-1] malformed versions throw an Error naming the version", () => {
  const invalid = [
    "",
    "1",
    "01.2",
    "1.02",
    "1.2.03",
    "v1.2",
    " 1.2",
    "1.2 ",
    "1. 2",
    "1.2.3.4",
    "1..2",
    "1.2-rc1",
    "1.2.3-rc1",
    "1.2.3+rc1",
    "1.2:",
    "1.2:RC1",
    "1.2:Rc",
    "1.2:rc-1",
    "1.2:rc.1",
    "1.2::rc",
    "1.2.x",
  ];
  for (const version of invalid) {
    assert.throws(
      () => satisfies(version, "*"),
      (err: unknown) => err instanceof Error && err.message.includes("version"),
      JSON.stringify(version),
    );
  }
});
