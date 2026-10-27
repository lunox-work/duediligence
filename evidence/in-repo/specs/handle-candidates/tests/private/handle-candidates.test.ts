import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HANDLE_MAX_LENGTH,
  checkHandle,
  handleCandidates,
} from "../../src/handle.js";

/**
 * The numbered variants the profile store tries when a handle stem is taken,
 * checked beyond the cases the public suite pins: other stems, other lengths,
 * larger counts, longer runs of collisions, and refusals the public suite
 * does not try.
 */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

function throwsWith(kind: ErrorConstructor | RangeErrorConstructor, word: string) {
  return (error: unknown) =>
    error instanceof kind && error.message.includes(word);
}

function assertAllValid(candidates: readonly string[]): void {
  for (const candidate of candidates) {
    assert.deepEqual(checkHandle(candidate), { status: "ok" }, candidate);
    assert.ok(candidate.length <= HANDLE_MAX_LENGTH, candidate);
  }
}

/** The variant for `n` under R2: the stem cut to 30 minus the digit count. */
function variant(stem: string, n: number): string {
  const digits = String(n);
  return `${stem.slice(0, HANDLE_MAX_LENGTH - digits.length)}${digits}`;
}

function range(from: number, to: number): number[] {
  const numbers: number[] = [];
  for (let n = from; n <= to; n += 1) numbers.push(n);
  return numbers;
}

// Extends "[happy-1] a short stem gets plain numbered variants": another stem,
// and a count that reaches two-digit numbers.
test("[happy-1] a hyphenated stem gets plain numbered variants into two digits", () => {
  assert.deepEqual(handleCandidates("grace-hopper", 12), [
    "grace-hopper",
    "grace-hopper2",
    "grace-hopper3",
    "grace-hopper4",
    "grace-hopper5",
    "grace-hopper6",
    "grace-hopper7",
    "grace-hopper8",
    "grace-hopper9",
    "grace-hopper10",
    "grace-hopper11",
    "grace-hopper12",
  ]);
});

// Extends "[happy-1] a short stem gets plain numbered variants": the shortest
// valid stem.
test("[happy-1] a three-character stem gets plain numbered variants", () => {
  assert.deepEqual(handleCandidates("abc", 5), [
    "abc",
    "abc2",
    "abc3",
    "abc4",
    "abc5",
  ]);
});

// Extends "[happy-1] a short stem gets plain numbered variants": stems that
// pass checkHandle but that a cleaning step (toHandleStem) would change.
test("[happy-1] a valid stem with edge hyphens, digits or underscores is used exactly as given", () => {
  assert.deepEqual(handleCandidates("-ada", 3), ["-ada", "-ada2", "-ada3"]);
  assert.deepEqual(handleCandidates("ada-", 3), ["ada-", "ada-2", "ada-3"]);
  assert.deepEqual(handleCandidates("--ada--", 2), ["--ada--", "--ada--2"]);
  assert.deepEqual(handleCandidates("007", 4), ["007", "0072", "0073", "0074"]);
  assert.deepEqual(handleCandidates("___", 2), ["___", "___2"]);
  assert.deepEqual(handleCandidates("a_b", 3), ["a_b", "a_b2", "a_b3"]);
});

// Extends "[happy-1] a 29-character stem fits every one-digit number without a
// cut": one character shorter, every two-digit number still fits.
test("[happy-1] a 28-character stem fits every two-digit number without a cut", () => {
  const stem = `${ALPHABET}xy`;
  assert.equal(stem.length, 28);
  const result = handleCandidates(stem, 99);
  assert.deepEqual(result, [stem, ...range(2, 99).map((n) => `${stem}${n}`)]);
  assert.equal(result[98]?.length, HANDLE_MAX_LENGTH);
  assertAllValid(result);
});

// Extends "[happy-1] a 29-character stem fits every one-digit number without a
// cut": a 27-character stem is never cut, even at 100.
test("[happy-1] a 27-character stem is never cut, up to the largest count", () => {
  const stem = `${ALPHABET}q`;
  assert.equal(stem.length, 27);
  const result = handleCandidates(stem, 100);
  assert.deepEqual(result, [stem, ...range(2, 100).map((n) => `${stem}${n}`)]);
  assert.equal(result[99], `${stem}100`);
  assertAllValid(result);
});

test("[happy-1] the candidates for a smaller count are the start of those for a larger count", () => {
  for (const stem of [
    "ada",
    "grace-hopper",
    "abcdefghijklmnopqrstuvwxyz0123",
    "1".repeat(30),
  ]) {
    const all = handleCandidates(stem, 100);
    for (const count of [1, 2, 3, 9, 10, 11, 12, 20, 50, 99]) {
      assert.deepEqual(
        handleCandidates(stem, count),
        all.slice(0, count),
        `${stem} × ${count}`,
      );
    }
  }
});

test("[happy-1] a call is not affected by the calls before it", () => {
  const first = handleCandidates("ada", 4);
  // A stem that is itself one of the earlier candidates, and a long run of
  // other calls in between: nothing carries over.
  assert.deepEqual(handleCandidates("ada2", 3), ["ada2", "ada22", "ada23"]);
  handleCandidates("abcdefghijklmnopqrstuvwxyz0123", 100);
  handleCandidates("ada", 100);
  const again = handleCandidates("ada", 4);
  assert.deepEqual(first, ["ada", "ada2", "ada3", "ada4"]);
  assert.deepEqual(again, ["ada", "ada2", "ada3", "ada4"]);
});

// Extends "[happy-2] one candidate is the stem alone" and "[happy-2] one
// candidate from a 30-character stem is the whole stem, uncut": other stems,
// including ones a numbered variant would collide with or a cleaning step
// would change.
test("[happy-2] one candidate is each stem alone, unchanged", () => {
  for (const stem of [
    "abc",
    "ada",
    "-ada",
    "ada-",
    "007",
    "a_b-c",
    "abcdefghijklmnopqrstuvwxyz0123",
    "1".repeat(30),
    "-".repeat(29) + "a",
  ]) {
    assert.deepEqual(handleCandidates(stem, 1), [stem], stem);
  }
});

// Extends "[boundary-1] a 30-character stem loses its last character for a
// one-digit number": another 30-character stem, every one-digit number.
test("[boundary-1] another 30-character stem keeps its first 29 characters for every one-digit number", () => {
  const stem = "the-quick-brown-fox-jumps-over";
  assert.equal(stem.length, HANDLE_MAX_LENGTH);
  const result = handleCandidates(stem, 9);
  assert.deepEqual(result, [
    stem,
    ...range(2, 9).map((n) => `the-quick-brown-fox-jumps-ove${n}`),
  ]);
  assertAllValid(result);
});

// Extends "[boundary-1] a 30-character stem loses its last character for a
// one-digit number": the character lost is a hyphen.
test("[boundary-1] a 30-character stem ending in a hyphen loses that hyphen for a one-digit number", () => {
  const stem = `${ALPHABET}abc-`;
  assert.equal(stem.length, HANDLE_MAX_LENGTH);
  assert.deepEqual(handleCandidates(stem, 3), [
    stem,
    `${ALPHABET}abc2`,
    `${ALPHABET}abc3`,
  ]);
});

// Extends "[boundary-2] two-digit numbers cut one character more": every
// candidate up to 20, across the change from one digit to two.
test("[boundary-2] a 30-character stem keeps 29 characters for one digit and 28 for two, up to 20", () => {
  const stem = "abcdefghijklmnopqrstuvwxyz-abc";
  const result = handleCandidates(stem, 20);
  assert.deepEqual(result, [
    stem,
    ...range(2, 9).map((n) => `abcdefghijklmnopqrstuvwxyz-ab${n}`),
    ...range(10, 20).map((n) => `abcdefghijklmnopqrstuvwxyz-a${n}`),
  ]);
  for (const candidate of result) {
    assert.equal(candidate.length, HANDLE_MAX_LENGTH, candidate);
  }
});

// Extends "[boundary-2] a 29-character stem is first cut when the number
// reaches two digits": a 28-character stem is first cut at three digits.
test("[boundary-2] a 28-character stem is first cut when the number reaches three digits", () => {
  const stem = `${ALPHABET}-z`;
  assert.equal(stem.length, 28);
  const result = handleCandidates(stem, 100);
  assert.equal(result.length, 100);
  assert.equal(result[97], `${stem}98`);
  assert.equal(result[98], `${stem}99`);
  assert.equal(result[99], `${ALPHABET}-100`);
});

// Extends "[boundary-2] two-digit numbers cut one character more": a
// 29-character stem through one, two and three digits.
test("[boundary-2] a 29-character stem is uncut for one digit, cut to 28 for two and to 27 for three", () => {
  const stem = `${ALPHABET}xyz`;
  assert.equal(stem.length, 29);
  const result = handleCandidates(stem, 100);
  assert.deepEqual(result, [
    stem,
    ...range(2, 9).map((n) => `${stem}${n}`),
    ...range(10, 99).map((n) => `${ALPHABET}xy${n}`),
    `${ALPHABET}x100`,
  ]);
  assertAllValid(result);
});

// Extends "[boundary-3] a cut that ends on a hyphen keeps it": the cut for a
// one-digit number ends on the hyphen.
test("[boundary-3] a one-digit cut that ends on a hyphen keeps it", () => {
  const stem = `${ALPHABET}ab-c`;
  assert.equal(stem.length, HANDLE_MAX_LENGTH);
  const result = handleCandidates(stem, 2);
  assert.deepEqual(result, [stem, `${ALPHABET}ab-2`]);
  assertAllValid(result);
});

// Extends "[boundary-3] a cut that ends on an underscore keeps it": the cut
// for a two-digit number ends on the underscore.
test("[boundary-3] a two-digit cut that ends on an underscore keeps it", () => {
  const stem = `${ALPHABET}a_bc`;
  assert.equal(stem.length, HANDLE_MAX_LENGTH);
  const result = handleCandidates(stem, 10);
  assert.equal(result.length, 10);
  assert.equal(result[8], `${ALPHABET}a_b9`);
  assert.equal(result[9], `${ALPHABET}a_10`);
  assertAllValid(result);
});

// Extends "[boundary-3] a cut that ends on a hyphen keeps it": a run of
// hyphens, cut at one, two and three digits.
test("[boundary-3] a cut that ends on a run of hyphens keeps every one of them", () => {
  const stem = `${ALPHABET}---x`;
  assert.equal(stem.length, HANDLE_MAX_LENGTH);
  const result = handleCandidates(stem, 100);
  assert.equal(result.length, 100);
  assert.equal(result[1], `${ALPHABET}---2`);
  assert.equal(result[8], `${ALPHABET}---9`);
  assert.equal(result[9], `${ALPHABET}--10`);
  assert.equal(result[98], `${ALPHABET}--99`);
  assert.equal(result[99], `${ALPHABET}-100`);
  assertAllValid(result);
});

test("[boundary-3] a stem of hyphens but its last character keeps every hyphen", () => {
  const hyphens = "-".repeat(29);
  const result = handleCandidates(`${hyphens}a`, 11);
  assert.deepEqual(result, [
    `${hyphens}a`,
    ...range(2, 9).map((n) => `${hyphens}${n}`),
    `${"-".repeat(28)}10`,
    `${"-".repeat(28)}11`,
  ]);
  assertAllValid(result);
});

// Extends "[boundary-4] a variant that repeats the stem is skipped": the same
// stem, carried on into two-digit numbers.
test("[boundary-4] after the variant that repeats the stem is skipped, numbering carries on into two digits", () => {
  const stem = "abcdefghijklmnopqrstuvwxyz0123";
  assert.deepEqual(handleCandidates(stem, 12), [
    "abcdefghijklmnopqrstuvwxyz0123",
    "abcdefghijklmnopqrstuvwxyz0122",
    "abcdefghijklmnopqrstuvwxyz0124",
    "abcdefghijklmnopqrstuvwxyz0125",
    "abcdefghijklmnopqrstuvwxyz0126",
    "abcdefghijklmnopqrstuvwxyz0127",
    "abcdefghijklmnopqrstuvwxyz0128",
    "abcdefghijklmnopqrstuvwxyz0129",
    "abcdefghijklmnopqrstuvwxyz0110",
    "abcdefghijklmnopqrstuvwxyz0111",
    "abcdefghijklmnopqrstuvwxyz0112",
    "abcdefghijklmnopqrstuvwxyz0113",
  ]);
});

// Extends "[boundary-4] a variant that repeats an earlier variant is skipped,
// and its number is not reused": the stem and earlier variants both repeat.
test("[boundary-4] a stem of 30 ones skips 11 for the stem and 12 to 19 for earlier variants, then goes on at 20", () => {
  const ones = "1".repeat(30);
  assert.deepEqual(handleCandidates(ones, 14), [
    ones,
    `${"1".repeat(29)}2`,
    `${"1".repeat(29)}3`,
    `${"1".repeat(29)}4`,
    `${"1".repeat(29)}5`,
    `${"1".repeat(29)}6`,
    `${"1".repeat(29)}7`,
    `${"1".repeat(29)}8`,
    `${"1".repeat(29)}9`,
    `${"1".repeat(28)}10`,
    `${"1".repeat(28)}20`,
    `${"1".repeat(28)}21`,
    `${"1".repeat(28)}22`,
    `${"1".repeat(28)}23`,
  ]);
});

// Extends "[boundary-4] a variant that repeats an earlier variant is skipped,
// and its number is not reused": skips at two digits and at three, at the
// largest count.
test("[boundary-4] a stem of 30 ones gives 100 distinct handles, the last numbered 109", () => {
  const ones = "1".repeat(30);
  const result = handleCandidates(ones, 100);
  const numbers = [...range(2, 9), 10, ...range(20, 99), ...range(100, 109)];
  assert.deepEqual(result, [ones, ...numbers.map((n) => variant(ones, n))]);
  assert.equal(result[99], `${"1".repeat(27)}109`);
  assert.equal(new Set(result).size, 100);
  assertAllValid(result);
});

// Extends "[boundary-4] a variant that repeats the stem is skipped": the same
// stem at the largest count, where 22 to 29 repeat earlier candidates and
// three-digit numbers are needed.
test("[boundary-4] the stem ending 0123 at the largest count skips 3 and 22 to 29 and ends at 109", () => {
  const stem = "abcdefghijklmnopqrstuvwxyz0123";
  const result = handleCandidates(stem, 100);
  const numbers = [
    2,
    ...range(4, 9),
    ...range(10, 21),
    ...range(30, 99),
    ...range(100, 109),
  ];
  assert.deepEqual(result, [stem, ...numbers.map((n) => variant(stem, n))]);
  assert.equal(result[99], "abcdefghijklmnopqrstuvwxyz0109");
  assert.equal(new Set(result).size, 100);
  assertAllValid(result);
});

// Extends "[boundary-4] a variant that repeats an earlier variant is skipped,
// and its number is not reused": a 29-character stem, whose own variants are
// uncut until two digits.
test("[boundary-4] a 29-character stem ending in 1 skips 12 to 19 and goes on at 20", () => {
  const stem = `${ALPHABET}ab1`;
  assert.equal(stem.length, 29);
  const result = handleCandidates(stem, 13);
  assert.deepEqual(result, [
    stem,
    ...range(2, 9).map((n) => `${stem}${n}`),
    `${ALPHABET}ab10`,
    `${ALPHABET}ab11`,
    `${ALPHABET}ab20`,
    `${ALPHABET}ab21`,
  ]);
  assert.equal(new Set(result).size, 13);
});

// Extends "[unhappy-1] an invalid stem is refused": more characters outside
// the charset, including ones that lowercase or normalize into it.
test("[unhappy-1] stems with characters outside the charset are refused", () => {
  for (const stem of [
    "ADA",
    "adA",
    "GRACE-HOPPER",
    "ada.lovelace",
    "ada@example",
    "ada/x",
    "ada+1",
    "ada\tx",
    "ada\n",
    "\nada",
    "Kda",
    "adé",
    "ａｄａ",
    "   ",
  ]) {
    assert.throws(
      () => handleCandidates(stem, 3),
      throwsWith(Error, "stem"),
      `expected ${JSON.stringify(stem)} refused`,
    );
  }
});

// Extends "[unhappy-1] an invalid stem is refused": more lengths outside 3 to
// 30, including long stems a cut would otherwise make fit.
test("[unhappy-1] stems shorter than 3 or longer than 30 characters are refused", () => {
  for (const stem of [
    "a",
    "-a",
    "1",
    "12",
    "a".repeat(31),
    "1".repeat(31),
    `${"abcdefghijklmnopqrstuvwxyz0123"}-`,
    "a".repeat(100),
  ]) {
    assert.throws(
      () => handleCandidates(stem, 3),
      throwsWith(Error, "stem"),
      `expected ${JSON.stringify(stem)} refused`,
    );
  }
});

test("[unhappy-1] an invalid stem is refused when only one candidate is asked for", () => {
  for (const stem of ["", "ab", "Ada", "ada!", "a".repeat(31)]) {
    assert.throws(
      () => handleCandidates(stem, 1),
      throwsWith(Error, "stem"),
      `expected ${JSON.stringify(stem)} refused`,
    );
  }
});

test("[unhappy-1] an invalid stem is refused at the largest count", () => {
  for (const stem of ["", "ab", "Ada", "ada lovelace", "a".repeat(31)]) {
    assert.throws(
      () => handleCandidates(stem, 100),
      throwsWith(Error, "stem"),
      `expected ${JSON.stringify(stem)} refused`,
    );
  }
});

// Extends "[unhappy-2] a count out of range is refused": counts far above 100.
test("[unhappy-2] counts well above 100 are refused", () => {
  for (const count of [
    102,
    200,
    1000,
    2 ** 31,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_VALUE,
  ]) {
    assert.throws(
      () => handleCandidates("ada", count),
      throwsWith(RangeError, "count"),
      `expected ${count} refused`,
    );
  }
});

// Extends "[unhappy-2] counts just outside the whole numbers 1 to 100 are
// refused": below 1, and fractions a hair from a whole number.
test("[unhappy-2] counts below 1 and near-whole fractions are refused", () => {
  for (const count of [
    -0,
    -100,
    -0.5,
    Number.MIN_VALUE,
    1e-9,
    1 - Number.EPSILON,
    1 + Number.EPSILON,
    3.000001,
    50.1,
    100 - 1e-9,
  ]) {
    assert.throws(
      () => handleCandidates("ada", count),
      throwsWith(RangeError, "count"),
      `expected ${count} refused`,
    );
  }
});

// Extends "[unhappy-2] a count out of range is refused": other valid stems.
test("[unhappy-2] a count out of range is refused whatever the stem", () => {
  for (const stem of [
    "grace-hopper",
    "abc",
    "abcdefghijklmnopqrstuvwxyz0123",
    "1".repeat(30),
  ]) {
    for (const count of [0, 101, 2.5, Number.NaN, Number.NEGATIVE_INFINITY]) {
      assert.throws(
        () => handleCandidates(stem, count),
        throwsWith(RangeError, "count"),
        `expected ${stem} × ${count} refused`,
      );
    }
  }
});

// Extends "[boundary-5] the largest count is allowed": every entry, not only
// the last.
test("[boundary-5] the largest count from a short stem is the stem then 2 to 100", () => {
  const result = handleCandidates("ada", 100);
  assert.deepEqual(result, ["ada", ...range(2, 100).map((n) => `ada${n}`)]);
  assert.equal(new Set(result).size, 100);
});

// Extends "[boundary-5] the largest count is allowed": other stems.
test("[boundary-5] the largest count is allowed for other stems", () => {
  const hopper = handleCandidates("grace-hopper", 100);
  assert.equal(hopper.length, 100);
  assert.equal(hopper[0], "grace-hopper");
  assert.equal(hopper[99], "grace-hopper100");

  const abc = handleCandidates("abc", 100);
  assert.equal(abc.length, 100);
  assert.equal(abc[99], "abc100");

  const zeros = "0".repeat(30);
  const result = handleCandidates(zeros, 100);
  assert.equal(result.length, 100);
  assert.equal(result[99], `${"0".repeat(27)}100`);
  assert.equal(new Set(result).size, 100);
  assertAllValid(result);
});

test("[boundary-5] counts just inside the range give exactly that many candidates", () => {
  const ninetyNine = handleCandidates("ada", 99);
  assert.equal(ninetyNine.length, 99);
  assert.equal(ninetyNine[98], "ada99");
  assert.equal(handleCandidates("ada", 50).length, 50);
  assert.equal(handleCandidates("ada", 2).length, 2);
});
