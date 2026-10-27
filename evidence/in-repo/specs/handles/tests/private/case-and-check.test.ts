import assert from "node:assert/strict";
import { test } from "node:test";

import { checkHandle, toHandleCase } from "../../src/handle.js";

const LENGTH_REJECTION = {
  status: "invalid",
  problem: "length",
  reason: "Handle must be between 3 and 30 characters.",
};
const CHARSET_REJECTION = {
  status: "invalid",
  problem: "charset",
  reason: "Handle can use letters, numbers, hyphens and underscores only.",
};

function show(value: string): string {
  return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
}

// --- toHandleCase -----------------------------------------------------------

// Extends "[happy-3] toHandleCase trims surrounding whitespace and lowercases":
// every whitespace String.prototype.trim removes, not just spaces.
test("[happy-3] toHandleCase trims every kind of surrounding whitespace that trim removes", () => {
  const cases: Array<[string, string]> = [
    ["\r\nDANA\r\n", "dana"],
    [" Dana ", "dana"],
    ["\v\fDana\t\t", "dana"],
    [" 　Dana ", "dana"],
    ["﻿Dana", "dana"],
    [" \t \n Org_24 \n \t ", "org_24"],
  ];
  for (const [raw, cased] of cases) {
    assert.equal(toHandleCase(raw), cased, `toHandleCase(${show(raw)})`);
  }
});

// Extends "[happy-3] toHandleCase keeps inner whitespace and disallowed
// characters ...": nothing is collapsed, replaced or removed inside.
test("[happy-3] toHandleCase keeps inner whitespace runs and punctuation untouched", () => {
  const cases: Array<[string, string]> = [
    ["  Dana   Rivers  ", "dana   rivers"],
    ["A\tB\nC", "a\tb\nc"],
    ["Rivers.Dana+Work@Example.Test", "rivers.dana+work@example.test"],
    ["--DANA--", "--dana--"],
    ["__X__", "__x__"],
    ["😀Dana😀", "😀dana😀"],
    ["ÀÉÎÕÜ", "àéîõü"],
    ["x".repeat(100), "x".repeat(100)],
    [`  ${"Q".repeat(50)}  `, "q".repeat(50)],
  ];
  for (const [raw, cased] of cases) {
    assert.equal(toHandleCase(raw), cased, `toHandleCase(${show(raw)})`);
  }
});

// The lowercasing is String.prototype.toLowerCase, including mappings that
// change length or leave ASCII.
test("[happy-3] toHandleCase lowercases with toLowerCase, including length-changing mappings", () => {
  assert.equal(toHandleCase("Kab"), "kab");
  assert.equal(toHandleCase("İİ"), "i̇i̇");
  assert.equal(toHandleCase(" ẞ "), "ß");
});

// Extends "[boundary-1] toHandleCase is idempotent ...": other inputs.
test("[boundary-1] toHandleCase is idempotent on padded mixed input, inner whitespace and special mappings", () => {
  for (const raw of [
    "  Mixed_Case-9  ",
    " Dana  Rivers ",
    "Kelvin",
    "İstanbul",
    " A\tB ",
    "\r\n",
  ]) {
    const once = toHandleCase(raw);
    assert.equal(toHandleCase(once), once, `toHandleCase twice on ${show(raw)}`);
    assert.equal(toHandleCase(toHandleCase(once)), once);
  }
  assert.equal(toHandleCase(toHandleCase(" Dana  Rivers ")), "dana  rivers");
});

// --- checkHandle: valid handles --------------------------------------------

// Extends "[happy-4] checkHandle accepts handles made of a-z, 0-9, hyphen and
// underscore": every allowed character, at every position.
test("[happy-4] checkHandle accepts every letter, digit, hyphen and underscore in any position", () => {
  for (const handle of [
    "abcdefghijklmnopqrstuvwxyz",
    "0123456789",
    "z9_",
    "ab-",
    "ab_",
    "_ab",
    "---",
    "-_-",
    "9-9",
    "x_y-z_0",
  ]) {
    assert.deepEqual(checkHandle(handle), { status: "ok" }, `checkHandle(${show(handle)})`);
  }
});

// Extends "[happy-4] ... as a new unfrozen object": the ok result is a plain
// object whose mutation does not leak into later calls.
test("[happy-4] checkHandle ok results are independent plain objects", () => {
  const first = checkHandle("feversoul") as { status: string };
  assert.deepEqual(Object.keys(first), ["status"]);
  assert.equal(Object.getPrototypeOf(first), Object.prototype);
  first.status = "tampered";
  assert.deepEqual(checkHandle("feversoul"), { status: "ok" });
});

// --- checkHandle: length limits ---------------------------------------------

// Extends "[boundary-2] checkHandle accepts handles of exactly 3 and exactly 30
// characters": other characters and every length in range.
test("[boundary-2] checkHandle accepts every length from 3 to 30 with mixed allowed characters", () => {
  const source = "a1-_b2-_c3-_d4-_e5-_f6-_g7-_h8-_";
  for (let length = 3; length <= 30; length++) {
    const handle = source.slice(0, length);
    assert.equal(handle.length, length);
    assert.deepEqual(checkHandle(handle), { status: "ok" }, `${length} characters`);
  }
});

// Extends "[boundary-2] checkHandle rejects handles of 0, 2 and 31 characters
// for length": 1 character, far longer handles, and other characters.
test("[boundary-2] checkHandle rejects 1, 32, 60 and 1000 characters and short or long hyphen and underscore runs for length", () => {
  for (const handle of [
    "a",
    "x".repeat(32),
    "x".repeat(60),
    "x".repeat(1000),
    "--",
    "_",
    "9",
    "-".repeat(31),
    "_".repeat(31),
    "0".repeat(31),
  ]) {
    assert.deepEqual(checkHandle(handle), LENGTH_REJECTION, `checkHandle(${show(handle)})`);
  }
});

// Length is UTF-16 code units, so astral characters count twice.
test("[boundary-2] checkHandle counts UTF-16 code units, not code points, against the limits", () => {
  // 31 code units but 16 code points: too long.
  assert.deepEqual(checkHandle(`a${"😀".repeat(15)}`), LENGTH_REJECTION);
  // 32 code units but 16 code points: too long.
  assert.deepEqual(checkHandle("😀".repeat(16)), LENGTH_REJECTION);
  // 2 code units, 1 code point: too short.
  assert.deepEqual(checkHandle("😀"), LENGTH_REJECTION);
});

// --- checkHandle: character set ----------------------------------------------

// Extends "[unhappy-1] checkHandle rejects spaces, slashes, at signs and dots
// for charset": the ASCII neighbours of the allowed ranges and other symbols.
test("[unhappy-1] checkHandle rejects ASCII characters just outside a-z, 0-9, hyphen and underscore", () => {
  for (const bad of ["`", "{", "/", ":", "@", "[", "\\", "]", "^", ",", ".", "+", "=", "~", "!", "#", "$", "%", "&", "*", "'", '"', "|", "?", "<", ">", "(", ")", ";"]) {
    for (const handle of [`${bad}abc`, `ab${bad}c`, `abc${bad}`]) {
      assert.deepEqual(checkHandle(handle), CHARSET_REJECTION, `checkHandle(${show(handle)})`);
    }
  }
});

// Extends "[unhappy-1] checkHandle does not lowercase or trim ...": any single
// uppercase letter, and whitespace or newlines anywhere.
test("[unhappy-1] checkHandle rejects any uppercase letter and any whitespace or control character", () => {
  for (const handle of [
    "ABC",
    "abC",
    "Abc",
    "aZz",
    "abc ",
    "\tabc",
    "ab\ncd",
    "abc\r\n",
    "ab\u0000c",
    "a b",
    `${"x".repeat(29)}X`,
  ]) {
    assert.deepEqual(checkHandle(handle), CHARSET_REJECTION, `checkHandle(${show(handle)})`);
  }
});

// Extends "[unhappy-1] ... rejects non-ASCII for charset": other scripts,
// look-alikes and astral characters whose code-unit length is in range.
test("[unhappy-1] checkHandle rejects non-ASCII letters, digits and look-alikes for charset", () => {
  for (const handle of [
    "ñandu",
    "straße",
    "日本語",
    "ａｂｃ",
    "١٢٣",
    "abċ",
    "i̇i̇",
    "dana‐rivers",
    "dana​",
    "😀a",
    "😀".repeat(15),
  ]) {
    assert.deepEqual(checkHandle(handle), CHARSET_REJECTION, `checkHandle(${show(handle)})`);
  }
});

// The rejection is a new, unfrozen object each call.
test("[unhappy-1] checkHandle charset rejections are new unfrozen objects with exactly three keys", () => {
  const first = checkHandle("has space");
  const second = checkHandle("has space");
  assert.notEqual(first, second);
  assert.equal(Object.isFrozen(first), false);
  assert.deepEqual(Object.keys(first).sort(), ["problem", "reason", "status"]);
  (first as { reason: string }).reason = "tampered";
  assert.deepEqual(checkHandle("has space"), CHARSET_REJECTION);
});

// --- checkHandle: length before charset ---------------------------------------

// Extends "[boundary-3] checkHandle reports length, not charset, ...": other
// bad characters, uppercase, whitespace, and empty and very long input.
test("[boundary-3] checkHandle reports only length for short or long handles whatever their characters", () => {
  for (const handle of [
    "",
    "A",
    "AB",
    " a",
    "\n",
    "@",
    "😀",
    "X".repeat(31),
    " ".repeat(31),
    `${"x".repeat(30)}.`,
    `.${"x".repeat(30)}`,
    "日".repeat(40),
    `a${"😀".repeat(15)}`,
  ]) {
    const result = checkHandle(handle);
    assert.equal(result.status, "invalid", `checkHandle(${show(handle)})`);
    assert.deepEqual(result, LENGTH_REJECTION, `checkHandle(${show(handle)})`);
  }
});

// Extends "[boundary-3] checkHandle reports charset when the length is right
// but a character is bad": both limits, and lengths counted in code units.
test("[boundary-3] checkHandle reports charset at both length limits and for astral characters within them", () => {
  for (const handle of [
    "A.b",
    "ab.",
    "...",
    `${"x".repeat(29)}.`,
    ".".repeat(30),
    " ".repeat(3),
    "😀a",
    "😀".repeat(15),
  ]) {
    const result = checkHandle(handle);
    assert.equal(result.status, "invalid", `checkHandle(${show(handle)})`);
    assert.deepEqual(result, CHARSET_REJECTION, `checkHandle(${show(handle)})`);
  }
});
