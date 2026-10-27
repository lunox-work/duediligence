import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

function check(cases: readonly (readonly [string, string, boolean])[]): void {
  for (const [version, range, expected] of cases) {
    assert.equal(satisfies(version, range), expected, `${version} against ${range}`);
  }
}

test("[rule-8] a matching tagged comparator admits tags from its own minor", () => {
  check([
    ["2.4.3:b", ">=2.4.3:a,<2.5", true],
    ["2.4.4:a", ">=2.4.3:z,<2.5", true],
    ["2.4.3:a", "2.4.3:a", true],
    ["2.4.3:a", ">=2.4.3:b,<2.5", false],
  ]);
});

test("[rule-8] untagged comparators alone cannot admit an otherwise ordered tag", () => {
  check([
    ["2.4.3:a", ">=2.4.0,<2.5", false],
    ["2.4.3:a", "<2.5", false],
    ["2.4.3:a", "~2.4", false],
    ["2.4.3:a", "^2.4", false],
    ["2.4.3", ">=2.4.0,<2.5", true],
  ]);
});

test("[rule-8] wildcards provide no tagged comparator even at the matching minor", () => {
  check([
    ["2.4:a", "*", false], ["2.4:a", "2.x", false],
    ["2.4:a", "2.4.x", false], ["2.4:a", "*|2.x|2.4.x", false],
    ["2.4:a", "2.4.x,>=2.4:a", true],
    ["2.4:a", "*,>=2.4:a", true],
  ]);
});

test("[rule-8] the qualifying tagged comparator must match both major and minor", () => {
  check([
    ["2.4:a", ">=2.3:a,<2.5", false],
    ["2.4:a", ">=1.4:a,<2.5", false],
    ["2.4:a", "^2.3:a", false],
    ["2.4:a", "<2.5:a", false],
    ["2.4:a", "<=2.4:b", true],
  ]);
});

test("[rule-8] qualifying tags can occur in upper bounds tilde and caret comparators", () => {
  check([
    ["2.4:a", "<2.4:b", true],
    ["2.4:a", "<=2.4:a", true],
    ["2.4.1:b", "~2.4.0:a", true],
    ["2.4.1:b", "^2.4.0:a", true],
    ["2.4:b", "<2.4:b", false],
  ]);
});

test("[rule-8] a tag in another OR group cannot qualify an untagged group", () => {
  check([
    ["2.4:b", ">=2.4:c|<2.5", false],
    ["2.4:b", "<2.5|>=2.4:c", false],
    ["2.4:b", "2.4:a|*", false],
    ["2.4:b", "*|>=2.4:a", true],
    ["2.4:b", ">=2.4:a|*", true],
  ]);
});

test("[rule-8] admission still requires every comparator in the qualifying group", () => {
  check([
    ["2.4:b", ">=2.4:a,<2.4:c", true],
    ["2.4:b", ">=2.4:a,<2.4:b", false],
    ["2.4:b", ">=2.4:a,3.x", false],
    ["2.4:b", "3.x,>=2.4:a", false],
  ]);
});

test("[rule-9] invalid versions throw an Error identifying the version", () => {
  for (const version of ["not-a-version", "1", "01.2", "1.2:"]) {
    assert.throws(() => satisfies(version, "*"), (error: unknown) =>
      error instanceof Error && /version/.test(error.message), version);
  }
});

test("[rule-9] invalid range syntax and comparator versions identify the range", () => {
  for (const range of [
    "not-a-range", "2", "=", ">=", "~", "^", "==2.4", "!=2.4", "><2.4",
    "v2.4", "=02.4", ">=2.04", "~2.4.00", "^2.4:A", "2.4:",
    "2.4.3.4", "2.4-a", "2.4+a", "2.4 - 2.5", "(2.4)",
  ]) {
    assert.throws(() => satisfies("2.4", range), (error: unknown) =>
      error instanceof Error && /range/.test(error.message), range);
  }
});

test("[rule-9] version validation takes precedence when both inputs are invalid", () => {
  for (const [version, range] of [["bad", "bad"], ["", ""], ["01.2", "*||"], ["1.2:", ">= 1.2"]]) {
    assert.throws(() => satisfies(version, range), (error: unknown) =>
      error instanceof Error && /version/.test(error.message), `${version} against ${range}`);
  }
});

test("[rule-9] matching alternatives cannot hide invalid range branches", () => {
  for (const range of ["*|bad", "bad|*", "2.4|=02.4", "2.4|", "*,bad"]) {
    assert.throws(() => satisfies("2.4", range), (error: unknown) =>
      error instanceof Error && /range/.test(error.message), range);
  }
});

test("[rule-9] failing comparators and tagged admission cannot hide invalid syntax", () => {
  for (const [version, range] of [["2.4", ">3.0,bad"], ["2.4:a", "*|bad"], ["2.4:a", ">3.0,bad"]]) {
    assert.throws(() => satisfies(version, range), (error: unknown) =>
      error instanceof Error && /range/.test(error.message), `${version} against ${range}`);
  }
});
