import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

function check(rows: Array<[string, string, boolean]>, key: string, label: string): void {
  for (const [version, range, answer] of rows) {
    test(`[${key}] ${label}: ${version} satisfies ${range} is ${answer}`, () => {
      assert.equal(satisfies(version, range), answer);
    });
  }
}

// R3. A comparator compares with one version
check(
  [
    ["2.4.0", "2.4", true],
    ["2.4.1", ">2.4", true],
    ["2.4.1", "<=2.4.0", false],
    ["3.0.0", ">=3.0", true],
  ],
  "happy-3",
  "comparators",
);

test("[happy-3] boundary: at V itself, only =, >=, <= and bare V hold", () => {
  assert.equal(satisfies("2.4.0", "=2.4.0"), true);
  assert.equal(satisfies("2.4.0", "2.4.0"), true);
  assert.equal(satisfies("2.4.0", ">=2.4.0"), true);
  assert.equal(satisfies("2.4.0", "<=2.4.0"), true);
  assert.equal(satisfies("2.4.0", ">2.4.0"), false);
  assert.equal(satisfies("2.4.0", "<2.4.0"), false);
});

test("[happy-3] boundary: a bare version is =V and does not hold for a neighbour", () => {
  assert.equal(satisfies("2.4.1", "2.4"), false);
});

// R4. A tilde range keeps the major and minor
check(
  [
    ["1.4.7", "~1.4.2", true],
    ["1.4.1", "~1.4.2", false],
    ["1.5.0", "~1.4.2", false],
    ["1.4.0", "~1.4", true],
  ],
  "happy-4",
  "tilde",
);

test("[happy-4] boundary: ~V holds for V itself", () => {
  assert.equal(satisfies("1.4.2", "~1.4.2"), true);
});

test("[happy-4] boundary: ~V does not hold for a later major with the same minor", () => {
  assert.equal(satisfies("2.4.2", "~1.4.2"), false);
});

// R5. A caret range keeps the major, or the minor too when the major is 0
check(
  [
    ["1.9.0", "^1.2.3", true],
    ["2.0.0", "^1.2.3", false],
    ["0.2.9", "^0.2.3", true],
    ["0.3.0", "^0.2.3", false],
  ],
  "happy-5",
  "caret",
);

test("[happy-5] boundary: ^V holds for V itself and not just below it", () => {
  assert.equal(satisfies("1.2.3", "^1.2.3"), true);
  assert.equal(satisfies("1.2.2", "^1.2.3"), false);
});

test("[happy-5] boundary: with major and minor 0, only the minor is kept, not the patch", () => {
  assert.equal(satisfies("0.0.5", "^0.0.3"), true);
  assert.equal(satisfies("0.1.0", "^0.0.3"), false);
});
