import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HANDLE_MAX_LENGTH,
  checkHandle,
  handleCandidates,
} from "../src/handle.js";

/**
 * The numbered variants the profile store tries when a handle stem is taken:
 * the stem, then the stem followed by 2, 3, 4…, cut so each fits, distinct,
 * and refused outright for a stem or a count it cannot work with.
 */

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

test("[happy-1] a short stem gets plain numbered variants", () => {
  assert.deepEqual(handleCandidates("ada", 4), ["ada", "ada2", "ada3", "ada4"]);
});

test("[happy-1] a 29-character stem fits every one-digit number without a cut", () => {
  const stem = "abcdefghijklmnopqrstuvwxyzabc";
  assert.equal(stem.length, 29);
  assert.deepEqual(handleCandidates(stem, 9), [
    stem,
    `${stem}2`,
    `${stem}3`,
    `${stem}4`,
    `${stem}5`,
    `${stem}6`,
    `${stem}7`,
    `${stem}8`,
    `${stem}9`,
  ]);
});

test("[happy-2] one candidate is the stem alone", () => {
  assert.deepEqual(handleCandidates("grace-hopper", 1), ["grace-hopper"]);
});

test("[happy-2] one candidate from a 30-character stem is the whole stem, uncut", () => {
  const stem = "abcdefghijklmnopqrstuvwxyz_a-b";
  assert.equal(stem.length, HANDLE_MAX_LENGTH);
  assert.deepEqual(handleCandidates(stem, 1), [stem]);
});

test("[boundary-1] a 30-character stem loses its last character for a one-digit number", () => {
  assert.deepEqual(handleCandidates("abcdefghijklmnopqrstuvwxyzabcd", 3), [
    "abcdefghijklmnopqrstuvwxyzabcd",
    "abcdefghijklmnopqrstuvwxyzabc2",
    "abcdefghijklmnopqrstuvwxyzabc3",
  ]);
});

test("[boundary-1] every one-digit variant of a 30-character stem is cut to 29 characters plus the digit", () => {
  const stem = "abcdefghijklmnopqrstuvwxyzabcd";
  const result = handleCandidates(stem, 9);
  assert.equal(result.length, 9);
  assert.equal(result[0], stem);
  for (let n = 2; n <= 9; n += 1) {
    assert.equal(result[n - 1], `abcdefghijklmnopqrstuvwxyzabc${n}`);
    assert.equal(result[n - 1]?.length, HANDLE_MAX_LENGTH);
  }
});

test("[boundary-2] two-digit numbers cut one character more", () => {
  const result = handleCandidates("abcdefghijklmnopqrstuvwxyz-abc", 10);
  assert.equal(result.length, 10);
  assert.equal(result[8], "abcdefghijklmnopqrstuvwxyz-ab9");
  assert.equal(result[9], "abcdefghijklmnopqrstuvwxyz-a10");
});

test("[boundary-2] a 29-character stem is first cut when the number reaches two digits", () => {
  const stem = "abcdefghijklmnopqrstuvwxyz-ab";
  assert.equal(stem.length, 29);
  const result = handleCandidates(stem, 10);
  assert.equal(result.length, 10);
  assert.equal(result[8], `${stem}9`);
  assert.equal(result[9], "abcdefghijklmnopqrstuvwxyz-a10");
});

test("[boundary-3] a cut that ends on a hyphen keeps it", () => {
  const result = handleCandidates("abcdefghijklmnopqrstuvwxyza-bc", 11);
  assert.equal(result.length, 11);
  assert.equal(result[10], "abcdefghijklmnopqrstuvwxyza-11");
  assertAllValid(result);
});

test("[boundary-3] a cut that ends on an underscore keeps it", () => {
  const result = handleCandidates("abcdefghijklmnopqrstuvwxyzab_c", 2);
  assert.deepEqual(result, [
    "abcdefghijklmnopqrstuvwxyzab_c",
    "abcdefghijklmnopqrstuvwxyzab_2",
  ]);
  assertAllValid(result);
});

test("[boundary-4] a variant that repeats the stem is skipped", () => {
  const stem = "abcdefghijklmnopqrstuvwxyz0123";
  assert.equal(stem.length, 30);
  assert.deepEqual(handleCandidates(stem, 3), [
    "abcdefghijklmnopqrstuvwxyz0123",
    "abcdefghijklmnopqrstuvwxyz0122",
    "abcdefghijklmnopqrstuvwxyz0124",
  ]);
});

test("[boundary-4] a variant that repeats an earlier variant is skipped, and its number is not reused", () => {
  // Cut to 28 for two digits, 12 to 19 rebuild the variants 2 to 9 already
  // in the list, so the twelfth candidate is number 20.
  const stem = "abcdefghijklmnopqrstuvwxyzab1c";
  const result = handleCandidates(stem, 12);
  assert.deepEqual(result, [
    stem,
    "abcdefghijklmnopqrstuvwxyzab12",
    "abcdefghijklmnopqrstuvwxyzab13",
    "abcdefghijklmnopqrstuvwxyzab14",
    "abcdefghijklmnopqrstuvwxyzab15",
    "abcdefghijklmnopqrstuvwxyzab16",
    "abcdefghijklmnopqrstuvwxyzab17",
    "abcdefghijklmnopqrstuvwxyzab18",
    "abcdefghijklmnopqrstuvwxyzab19",
    "abcdefghijklmnopqrstuvwxyzab10",
    "abcdefghijklmnopqrstuvwxyzab11",
    "abcdefghijklmnopqrstuvwxyzab20",
  ]);
  assert.equal(new Set(result).size, 12);
});

test("[unhappy-1] an invalid stem is refused", () => {
  for (const stem of [
    "",
    "ab",
    "Ada",
    "ada lovelace",
    "ada!",
    "abcdefghijklmnopqrstuvwxyz01234",
  ]) {
    assert.throws(
      () => handleCandidates(stem, 3),
      throwsWith(Error, "stem"),
      `expected ${JSON.stringify(stem)} refused`,
    );
  }
});

test("[unhappy-1] a stem that would only pass once trimmed is refused as given", () => {
  for (const stem of [" ada", "ada ", "  ada  "]) {
    assert.throws(
      () => handleCandidates(stem, 3),
      throwsWith(Error, "stem"),
      `expected ${JSON.stringify(stem)} refused`,
    );
  }
});

test("[unhappy-2] a count out of range is refused", () => {
  for (const count of [0, -1, 2.5, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => handleCandidates("ada", count),
      throwsWith(RangeError, "count"),
      `expected ${count} refused`,
    );
  }
});

test("[unhappy-2] counts just outside the whole numbers 1 to 100 are refused", () => {
  for (const count of [0.5, 1.5, 99.5, 100.5, Number.NEGATIVE_INFINITY]) {
    assert.throws(
      () => handleCandidates("ada", count),
      throwsWith(RangeError, "count"),
      `expected ${count} refused`,
    );
  }
});

test("[boundary-5] the largest count is allowed", () => {
  const result = handleCandidates("ada", 100);
  assert.equal(result.length, 100);
  assert.equal(result[99], "ada100");
});

test("[boundary-5] the largest count from a 30-character stem ends on a three-digit number with the stem cut to 27", () => {
  const stem = "abcdefghijklmnopqrstuvwxyzabcd";
  const result = handleCandidates(stem, 100);
  assert.equal(result.length, 100);
  assert.equal(result[0], stem);
  assert.equal(result[99], "abcdefghijklmnopqrstuvwxyza100");
  assert.equal(new Set(result).size, 100);
  assertAllValid(result);
});
