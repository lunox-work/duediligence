import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

test("[happy-1] a missing patch equals an explicit zero patch", () => {
  assert.equal(satisfies("2.4", "=2.4.0"), true);
  assert.equal(satisfies("2.4.0", "=2.4"), true);
});

test("[happy-1] omitted patches work at zero and preserve tags", () => {
  assert.equal(satisfies("0.0", "=0.0.0"), true);
  assert.equal(satisfies("0.0:a0", "=0.0.0:a0"), true);
  assert.equal(satisfies("2.4", "=2.4.1"), false);
});

test("[unhappy-1] all invalid version examples name the version", () => {
  for (const version of [
    "02.4", "2", "2.4.1.0", "v2.4.1", "2.4.1-rc1",
    "2.4.1:RC1", "2.4.1:", "2.4.1:rc.1",
  ]) {
    assert.throws(
      () => satisfies(version, "*"),
      (error: unknown) => error instanceof Error && error.message.includes("version"),
      version,
    );
  }
});

test("[unhappy-1] empty versions, whitespace and leading zeros are invalid", () => {
  for (const version of [
    "", " 2.4", "2.4 ", "2. 4", "2.04", "2.4.01", "00.0",
    "-1.2", "+1.2", "1..2", "1.2:rc_1", "1.2:rc:1",
  ]) {
    assert.throws(
      () => satisfies(version, "*"),
      (error: unknown) => error instanceof Error && error.message.includes("version"),
      version,
    );
  }
});

test("[happy-2] ordering matches all numeric and tag examples", () => {
  const cases: [string, string][] = [
    ["1.10.0", ">1.9.0"],
    ["2.0.0:rc", "<2.0.0:rc1"],
    ["2.0.0:rc2", "<2.0.0:rc10"],
    ["2.0.0:beta", ">2.0.0:alpha"],
    ["2.0.0:10", "<2.0.0:a"],
    ["2.0.0:rc", ">=2.0.0:rc"],
  ];
  for (const [version, range] of cases) {
    assert.equal(satisfies(version, range), true, `${version} in ${range}`);
  }
});

test("[happy-2] numeric components compare in major minor patch priority", () => {
  assert.equal(satisfies("10.0.0", ">9.99.99"), true);
  assert.equal(satisfies("1.2.10", ">1.2.9"), true);
  assert.equal(satisfies("1.9.99", ">1.10.0"), false);
  assert.equal(satisfies("1.2.99", ">2.0.0"), false);
});

test("[happy-2] an untagged version is greater than its tagged counterpart", () => {
  assert.equal(satisfies("2.0.0", ">2.0.0:rc99"), true);
  assert.equal(satisfies("2.0.0:rc99", ">=2.0.0:a,<2.0.0"), true);
  assert.equal(satisfies("2.0.0:rc99", ">=2.0.0:a,>=2.0.0"), false);
});

test("[happy-2] tag runs compare numerically and continue after equal runs", () => {
  assert.equal(satisfies("2.0:rc12b", ">2.0:rc2z"), true);
  assert.equal(satisfies("2.0:rc12b", "<2.0:rc12c"), true);
  assert.equal(satisfies("2.0:rc12b", ">2.0:rc12"), true);
  assert.equal(satisfies("2.0:a1", "<2.0:aa"), true);
});

test("[happy-2] equal numeric tag runs ignore leading zeros", () => {
  assert.equal(satisfies("2.0:rc02b", "=2.0.0:rc2b"), true);
  assert.equal(satisfies("2.0:rc02b", ">2.0:rc2b"), false);
  assert.equal(satisfies("2.0:rc02b", "<2.0:rc2b"), false);
  assert.equal(satisfies("2.0:0", "=2.0:00"), true);
});

test("[unhappy-4] an invalid version is reported before an invalid range", () => {
  assert.throws(
    () => satisfies("1.2.3.4", "nonsense"),
    (error: unknown) => error instanceof Error && error.message.includes("version"),
  );
});

test("[unhappy-4] two empty inputs still report the invalid version first", () => {
  assert.throws(
    () => satisfies("", ""),
    (error: unknown) => error instanceof Error && error.message.includes("version"),
  );
});
