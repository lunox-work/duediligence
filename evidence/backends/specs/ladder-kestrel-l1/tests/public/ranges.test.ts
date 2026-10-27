import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

function check(cases: readonly (readonly [string, string, boolean])[]): void {
  for (const [version, range, expected] of cases) {
    assert.equal(satisfies(version, range), expected, `${version} against ${range}`);
  }
}

test("[rule-3] bare versions and equals comparators select the same version", () => {
  check([
    ["2.4.0", "2.4", true], ["2.4", "=2.4.0", true],
    ["2.4.1", "2.4", false], ["2.3.9", "=2.4", false],
  ]);
});

test("[rule-3] strict comparators exclude equality and accept the correct side", () => {
  check([
    ["2.4.1", ">2.4", true], ["2.4", ">2.4.0", false],
    ["2.3.9", ">2.4", false], ["2.3.9", "<2.4", true],
    ["2.4", "<2.4.0", false], ["2.4.1", "<2.4", false],
  ]);
});

test("[rule-3] inclusive comparators include equality and reject the wrong side", () => {
  check([
    ["2.4", ">=2.4.0", true], ["2.4.1", ">=2.4", true],
    ["2.3.9", ">=2.4", false], ["2.4", "<=2.4.0", true],
    ["2.3.9", "<=2.4", true], ["2.4.1", "<=2.4", false],
  ]);
});

test("[rule-4] tilde accepts its lower bound and higher patches", () => {
  check([
    ["2.4", "~2.4", true], ["2.4.3", "~2.4.3", true],
    ["2.4.10", "~2.4.3", true], ["2.4.2", "~2.4.3", false],
  ]);
});

test("[rule-4] tilde excludes adjacent minors and majors including at zero", () => {
  check([
    ["2.5", "~2.4", false], ["2.3.99", "~2.4", false],
    ["3.4", "~2.4", false], ["0.0.9", "~0.0", true],
    ["0.1", "~0.0", false],
  ]);
});

test("[rule-4] tilde with a tag uses ordering within its fixed major and minor", () => {
  check([
    ["2.4.3:a", "~2.4.3:a", true], ["2.4.3:b", "~2.4.3:a", true],
    ["2.4.3", "~2.4.3:a", true], ["2.4.3:a", "~2.4.3:b", false],
    ["2.5:a", "~2.4.3:a", false],
  ]);
});

test("[rule-5] positive-major caret includes the lower bound and later minors", () => {
  check([
    ["2.4.3", "^2.4.3", true], ["2.4.4", "^2.4.3", true],
    ["2.9", "^2.4.3", true], ["2.4.2", "^2.4.3", false],
    ["2.3.99", "^2.4.3", false], ["3.0", "^2.4.3", false],
  ]);
});

test("[rule-5] zero-major caret fixes the minor while allowing higher patches", () => {
  check([
    ["0.4.3", "^0.4.3", true], ["0.4.99", "^0.4.3", true],
    ["0.4.2", "^0.4.3", false], ["0.5", "^0.4.3", false],
    ["1.4.3", "^0.4.3", false],
  ]);
});

test("[rule-5] caret at major and minor zero still permits later patches", () => {
  check([
    ["0.0.3", "^0.0.3", true], ["0.0.4", "^0.0.3", true],
    ["0.0.99", "^0.0", true], ["0.0.2", "^0.0.3", false],
    ["0.1", "^0.0.3", false],
  ]);
});

test("[rule-5] tagged caret bounds can admit a release but still exclude earlier tags", () => {
  check([
    ["2.4:a", "^2.4:a", true], ["2.4:b", "^2.4:a", true],
    ["2.4", "^2.4:a", true], ["2.5", "^2.4:a", true],
    ["2.4:a", "^2.4:b", false], ["3.0", "^2.4:a", false],
  ]);
});

test("[rule-6] star accepts untagged versions across all numeric components", () => {
  check([["0.0", "*", true], ["2.4.3", "*", true], ["123.456.789", "*", true]]);
});

test("[rule-6] major wildcard fixes only the major including zero", () => {
  check([
    ["2.0", "2.x", true], ["2.99.99", "2.x", true],
    ["1.99.99", "2.x", false], ["3.0", "2.x", false],
    ["0.9.9", "0.x", true], ["1.0", "0.x", false],
  ]);
});

test("[rule-6] minor wildcard fixes both major and minor", () => {
  check([
    ["2.4", "2.4.x", true], ["2.4.99", "2.4.x", true],
    ["2.3.99", "2.4.x", false], ["2.5", "2.4.x", false],
    ["3.4", "2.4.x", false], ["0.0.1", "0.0.x", true],
  ]);
});

test("[rule-6] rejects operators on wildcards and malformed wildcard forms", () => {
  for (const range of [
    "x", "X", "2.X", "2.*", "*.4", "2.x.0", "2.x.x", "2.4.x.0",
    "2.4.3.x", "=2.x", ">2.x", ">=2.4.x", "<2.x", "<=2.4.x",
    "~2.x", "^2.4.x", "=*", ">*", "~*", "^*", "2.x:a", "02.x", "2.04.x",
  ]) {
    assert.throws(() => satisfies("2.4", range), (error: unknown) =>
      error instanceof Error && /range/.test(error.message), range);
  }
});

test("[rule-7] comma groups require every comparator including endpoint bounds", () => {
  check([
    ["2.4", ">=2.4,<2.6", true], ["2.5.99", ">=2.4,<2.6", true],
    ["2.3.99", ">=2.4,<2.6", false], ["2.6", ">=2.4,<2.6", false],
    ["2.4", ">2.4,<2.4", false],
  ]);
});

test("[rule-7] bars accept any matching group and reject when none match", () => {
  check([
    ["1.2", "1.2|3.4", true], ["3.4", "1.2|3.4", true],
    ["2.4", "1.2|3.4", false],
  ]);
});

test("[rule-7] commas bind within each alternative", () => {
  check([
    ["1.5", ">=1.0,<2.0|>=3.0,<4.0", true],
    ["3.5", ">=1.0,<2.0|>=3.0,<4.0", true],
    ["2.5", ">=1.0,<2.0|>=3.0,<4.0", false],
    ["4.0", ">=1.0,<2.0|>=3.0,<4.0", false],
    ["1.5", "1.x|>=3.0,<4.0", true],
  ]);
});

test("[rule-7] accepts spaces at the range edges and around separators", () => {
  check([
    ["2.4", "  >=2.4  ,  <2.6  |  =3.0  ", true],
    ["3.0", "  >=2.4  ,  <2.6  |  =3.0  ", true],
    ["2.6", "  >=2.4  ,  <2.6  |  =3.0  ", false],
    ["2.4", "  2.4  ", true], ["2.4", " * ", true],
  ]);
});

test("[rule-7] rejects empty ranges comparators and groups", () => {
  for (const range of ["", "   ", "|", "||", "*||2.4", "|*", "*|", "*| |2.4", ",*", "*,", "*,,2.4", "*, ,2.4"]) {
    assert.throws(() => satisfies("2.4", range), (error: unknown) =>
      error instanceof Error && /range/.test(error.message), JSON.stringify(range));
  }
});

test("[rule-7] rejects spaces inside comparators", () => {
  for (const range of [">= 2.4", "= 2.4", "~ 2.4", "^ 2.4", "2 .4", "2. 4", "2.4 .0", "2.4: a", "2.4:a b", "2. x", "2.4 3.0", "> =2.4"]) {
    assert.throws(() => satisfies("2.4", range), (error: unknown) =>
      error instanceof Error && /range/.test(error.message), range);
  }
});
