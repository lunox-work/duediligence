import { test } from "node:test";
import assert from "node:assert/strict";
import { splitBounty } from "../../src/index.js";

// Lets the tests pass arguments the signature does not allow.
const split = splitBounty as unknown as (bounty: unknown, hiddenTestShareBps: unknown) => unknown;

type Row = [bounty: number, bps: number, hiddenTests: number, uat: number];

function assertSplits(rows: Row[]): void {
  for (const [bounty, bps, hiddenTests, uat] of rows) {
    assert.deepEqual(
      splitBounty(bounty, bps),
      { hiddenTests, uat },
      `splitBounty(${bounty}, ${bps})`,
    );
  }
}

function assertThrowsNaming(
  fn: () => unknown,
  type: new (...args: any[]) => Error,
  name: string,
  label: string,
): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof type, `${label}: expected a ${type.name}, got ${String(error)}`);
    const { message } = error as Error;
    assert.ok(
      message.includes(name),
      `${label}: expected the message to contain "${name}", got "${message}"`,
    );
    return true;
  });
}

const MAX = Number.MAX_SAFE_INTEGER;

test("[happy-1] splitBounty splits each example bounty into the hidden-test share and the rest", () => {
  assertSplits([
    [1000, 7500, 750, 250],
    [999, 7500, 749, 250],
    [100, 3333, 33, 67],
    [10000, 1, 1, 9999],
  ]);
});

test("[happy-1] splitBounty with a share one basis point below the whole leaves one unit for UAT", () => {
  assertSplits([[10000, 9999, 9999, 1]]);
});

test("[boundary-1] splitBounty rounds the hidden-test share down and handles zero and whole shares", () => {
  assertSplits([
    [1, 7500, 0, 1],
    [3, 7500, 2, 1],
    [9999, 1, 0, 9999],
    [1000, 0, 0, 1000],
    [1000, 10000, 1000, 0],
  ]);
});

test("[boundary-1] splitBounty of a zero bounty is zero and zero at any share", () => {
  assertSplits([
    [0, 7500, 0, 0],
    [0, 0, 0, 0],
    [0, 10000, 0, 0],
  ]);
});

test("[boundary-2] splitBounty is exact near Number.MAX_SAFE_INTEGER where float math is off by one", () => {
  const rows: Row[] = [
    [MAX, 7500, 6755399441055743, 2251799813685248],
    [MAX, 232, 208967022709990, 8798232232031001],
    [MAX, 9999, 9006298534815516, 900719925475],
    [4503599627370497, 7500, 3377699720527872, 1125899906842625],
  ];
  assertSplits(rows);
  for (const [bounty, bps] of rows) {
    const { hiddenTests, uat } = splitBounty(bounty, bps);
    assert.equal(hiddenTests + uat, bounty, `parts of splitBounty(${bounty}, ${bps}) add up`);
  }
});

test("[boundary-2] splitBounty of Number.MAX_SAFE_INTEGER at the whole and the zero share", () => {
  const rows: Row[] = [
    [MAX, 10000, MAX, 0],
    [MAX, 0, 0, MAX],
  ];
  assertSplits(rows);
  for (const [bounty, bps] of rows) {
    const { hiddenTests, uat } = splitBounty(bounty, bps);
    assert.equal(hiddenTests + uat, bounty, `parts of splitBounty(${bounty}, ${bps}) add up`);
  }
});

test("[boundary-3] splitBounty(-0, 7500) returns positive zeros", () => {
  const result = splitBounty(-0, 7500);
  assert.deepEqual(result, { hiddenTests: 0, uat: 0 });
  assert.ok(Object.is(result.hiddenTests, 0), "hiddenTests is not -0");
  assert.ok(Object.is(result.uat, 0), "uat is not -0");
});

test("[boundary-3] -0 never comes back at the zero and whole shares or as a share", () => {
  const cases: Array<[number, number, number, number]> = [
    [-0, 0, 0, 0],
    [-0, 10000, 0, 0],
    [1000, -0, 0, 1000],
  ];
  for (const [bounty, bps, hiddenTests, uat] of cases) {
    const result = splitBounty(bounty, bps);
    const label = `splitBounty(${Object.is(bounty, -0) ? "-0" : bounty}, ${Object.is(bps, -0) ? "-0" : bps})`;
    assert.deepEqual(result, { hiddenTests, uat }, label);
    assert.ok(Object.is(result.hiddenTests, hiddenTests), `${label}: hiddenTests is not -0`);
    assert.ok(Object.is(result.uat, uat), `${label}: uat is not -0`);
  }
});

test("[unhappy-1] splitBounty rejects a bounty that is not a safe non-negative integer with a RangeError", () => {
  for (const bounty of [-1, 1.5, NaN, Infinity, 9007199254740992]) {
    assertThrowsNaming(() => split(bounty, 7500), RangeError, "bounty", `bounty ${bounty}`);
  }
});

test("[unhappy-1] splitBounty rejects a bounty that is not of type number with a TypeError", () => {
  for (const bounty of ["1000", undefined, null, 1000n]) {
    assertThrowsNaming(() => split(bounty, 7500), TypeError, "bounty", `bounty ${String(bounty)}`);
  }
});

test("[unhappy-1] splitBounty rejects bounties just outside the valid range", () => {
  for (const bounty of [MAX + 1, -1, -Infinity, 0.5]) {
    assertThrowsNaming(() => split(bounty, 7500), RangeError, "bounty", `bounty ${bounty}`);
  }
  assertThrowsNaming(() => split(new Number(1000), 7500), TypeError, "bounty", "boxed Number bounty");
});

test("[unhappy-2] splitBounty rejects a share that is not an integer from 0 to 10000 with a RangeError", () => {
  for (const bps of [-1, 10001, 75.5, NaN, Infinity]) {
    assertThrowsNaming(() => split(1000, bps), RangeError, "hiddenTestShareBps", `share ${bps}`);
  }
});

test("[unhappy-2] splitBounty rejects a share that is not of type number with a TypeError", () => {
  for (const bps of ["7500", undefined, null]) {
    assertThrowsNaming(() => split(1000, bps), TypeError, "hiddenTestShareBps", `share ${String(bps)}`);
  }
});

test("[unhappy-2] splitBounty rejects shares just outside the range, also with a zero bounty", () => {
  for (const bps of [10001, -1, 10000.5, -Infinity]) {
    assertThrowsNaming(() => split(1000, bps), RangeError, "hiddenTestShareBps", `share ${bps}`);
    assertThrowsNaming(() => split(0, bps), RangeError, "hiddenTestShareBps", `zero bounty, share ${bps}`);
  }
});

test("[unhappy-3] splitBounty(-1, 10001) reports the bounty", () => {
  assertThrowsNaming(() => split(-1, 10001), RangeError, "bounty", "splitBounty(-1, 10001)");
});

test("[unhappy-3] the bounty is checked first whatever is wrong with each argument", () => {
  assertThrowsNaming(() => split("1000", 10001), TypeError, "bounty", 'splitBounty("1000", 10001)');
  assertThrowsNaming(() => split(1.5, "7500"), RangeError, "bounty", 'splitBounty(1.5, "7500")');
  assertThrowsNaming(() => split(undefined, undefined), TypeError, "bounty", "splitBounty(undefined, undefined)");
});
