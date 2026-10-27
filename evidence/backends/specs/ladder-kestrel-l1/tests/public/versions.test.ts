import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

// spec.md has numbered rules rather than @kind tags; [rule-N] follows them.
function check(cases: readonly (readonly [string, string, boolean])[]): void {
  for (const [version, range, expected] of cases) {
    assert.equal(satisfies(version, range), expected, `${version} against ${range}`);
  }
}

test("[rule-1] accepts two or three numeric components including zero", () => {
  check([
    ["2.4", "=2.4.0", true],
    ["2.4.0", "2.4", true],
    ["0.0", "=0.0.0", true],
    ["0.0.1", "0.0.1", true],
    ["12.34.56", "=12.34.56", true],
    ["2.4.1", "2.4", false],
  ]);
});

test("[rule-1] accepts lowercase alphanumeric tags with an optional patch", () => {
  for (const tag of ["a", "0", "abc", "123", "a01b2", "00"]) {
    assert.equal(satisfies(`2.4:${tag}`, `=2.4.0:${tag}`), true);
    assert.equal(satisfies(`2.4.0:${tag}`, `2.4:${tag}`), true);
  }
});

test("[rule-1] rejects leading zeros in each numeric component", () => {
  for (const version of ["00.0", "01.2", "1.02", "1.2.00", "1.2.03", "01.2:a"]) {
    assert.throws(() => satisfies(version, "*"), (error: unknown) =>
      error instanceof Error && /version/.test(error.message), version);
  }
});

test("[rule-1] rejects malformed versions and disallowed tag characters", () => {
  for (const version of [
    "", "1", "1.2.3.4", "v1.2", " 1.2", "1.2 ", "1. 2", "1.2\n",
    "-1.2", "+1.2", "1.-2", "1.2.-3", "1..2", "1.2.",
    "1.2-a", "1.2+a", "1.2:", "1.2:A", "1.2:aB", "1.2:a-b",
    "1.2:a_b", "1.2:a.b", "1.2:a:b", "1.2:a b",
  ]) {
    assert.throws(() => satisfies(version, "*"), (error: unknown) =>
      error instanceof Error && /version/.test(error.message), JSON.stringify(version));
  }
});

test("[rule-2] compares each numeric component as a number", () => {
  check([
    ["10.0", ">2.99.99", true],
    ["2.10", ">2.9.99", true],
    ["2.4.10", ">2.4.9", true],
    ["2.0", "<10.0", true],
    ["2.9", "<2.10", true],
    ["2.4.9", "<2.4.10", true],
  ]);
});

test("[rule-2] earlier numeric components take priority over later ones and tags", () => {
  check([
    ["2.99.99", "<3.0.0:a", true],
    ["2.4.99", "<2.5.0:a", true],
    ["2.4.3", "<2.4.4:a", true],
    ["3.0", ">2.99.99:z", true],
  ]);
});

test("[rule-2] an untagged version is greater than any tag at the same numbers", () => {
  check([
    ["2.4.3", ">2.4.3:z999", true],
    ["2.4.3", "=2.4.3:z999", false],
    ["2.4.3:a", "<2.4.3,>=2.4.3:a", true],
    ["2.4.3:a", ">=2.4.3,>=2.4.3:a", false],
  ]);
});

test("[rule-2] compares digit runs numerically within tags", () => {
  check([
    ["2.4:a10", ">2.4:a2", true],
    ["2.4:a2", "<2.4:a10", true],
    ["2.4:10a", ">2.4:2z", true],
    ["2.4:a1b10", ">2.4:a1b2", true],
  ]);
});

test("[rule-2] leading zeros in digit runs do not change tag equality", () => {
  check([
    ["2.4:a02", "=2.4:a2", true],
    ["2.4:000", "=2.4:0", true],
    ["2.4:a01b002", "=2.4:a1b2", true],
    ["2.4:a02", ">2.4:a2", false],
    ["2.4:a02", "<2.4:a2", false],
    ["2.4:a02b3", ">2.4:a2b2", true],
  ]);
});

test("[rule-2] compares letter runs by character code", () => {
  check([
    ["2.4:b", ">2.4:a", true],
    ["2.4:aa", "<2.4:b", true],
    ["2.4:ab", ">2.4:aa", true],
    ["2.4:aa", ">2.4:a", true],
    ["2.4:a1c", ">2.4:a1b", true],
  ]);
});

test("[rule-2] a digit run is below a letter run at any position", () => {
  check([
    ["2.4:9", "<2.4:a", true],
    ["2.4:a", ">2.4:999", true],
    ["2.4:a1", "<2.4:aa", true],
    ["2.4:a1b", ">2.4:a1", true],
  ]);
});

test("[rule-2] a tag that runs out after equal runs is lower", () => {
  check([
    ["2.4:a", "<2.4:a0", true],
    ["2.4:a1", "<2.4:a1b", true],
    ["2.4:a01", "<2.4:a1b", true],
    ["2.4:a1b", ">2.4:a1", true],
    ["2.4:a1b", "=2.4:a1", false],
  ]);
});

test("[rule-2] equal tagged versions respect inclusive and strict comparisons", () => {
  check([
    ["2.4:a1", "=2.4.0:a1", true],
    ["2.4:a1", ">=2.4.0:a1", true],
    ["2.4:a1", "<=2.4.0:a1", true],
    ["2.4:a1", ">2.4.0:a1", false],
    ["2.4:a1", "<2.4.0:a1", false],
  ]);
});
