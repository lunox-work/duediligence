import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkHandle,
  isValidHandle,
  normalizeHandle,
  toHandleCase,
} from "../../src/handle.js";

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

// --- normalizeHandle: accepted ----------------------------------------------

// Extends "[happy-5] normalizeHandle returns the lowercased handle and the
// typed casing for display": other casings and other surrounding whitespace.
test("[happy-5] normalizeHandle keeps the exact typed casing for display after trimming any whitespace", () => {
  const cases: Array<[string, string, string]> = [
    ["  FeVeR_sOuL  ", "fever_soul", "FeVeR_sOuL"],
    [" Org-24 ", "org-24", "Org-24"],
    ["\r\nDANA\r\n", "dana", "DANA"],
    ["﻿ Dana_Rivers　", "dana_rivers", "Dana_Rivers"],
    ["--X--", "--x--", "--X--"],
    ["___", "___", "___"],
    ["2024", "2024", "2024"],
  ];
  for (const [raw, handle, display] of cases) {
    assert.deepEqual(
      normalizeHandle(raw),
      { status: "ok", handle, display },
      `normalizeHandle(${show(raw)})`,
    );
  }
});

// Extends "[happy-5] normalizeHandle trims tabs and newlines ...": the check
// runs on the lowercased form, so a character that lowercases into a-z is
// accepted while display keeps it as typed.
test("[happy-5] normalizeHandle checks the lowercased form, so the Kelvin sign lowercases into an accepted k", () => {
  assert.deepEqual(normalizeHandle(" Kab "), {
    status: "ok",
    handle: "kab",
    display: "Kab",
  });
});

// Extends "[happy-5] ... each call returns a new object": the ok result is a
// plain object with exactly three keys whose mutation does not leak.
test("[happy-5] normalizeHandle ok results are independent plain objects with exactly three keys", () => {
  const first = normalizeHandle(" Dana ") as { handle: string };
  assert.deepEqual(Object.keys(first).sort(), ["display", "handle", "status"]);
  assert.equal(Object.isFrozen(first), false);
  first.handle = "tampered";
  assert.deepEqual(normalizeHandle(" Dana "), {
    status: "ok",
    handle: "dana",
    display: "Dana",
  });
});

// --- normalizeHandle: length after trimming ---------------------------------

// Extends "[boundary-4] normalizeHandle accepts input that fits the limits
// once trimmed": heavy padding of other whitespace at both limits.
test("[boundary-4] normalizeHandle accepts 3 and 30 characters surrounded by long whitespace padding", () => {
  const pad = " \t\n ".repeat(10);
  assert.deepEqual(normalizeHandle(`${pad}AbC${pad}`), {
    status: "ok",
    handle: "abc",
    display: "AbC",
  });
  const thirty = "Ab-_".repeat(7) + "Cd";
  assert.equal(thirty.length, 30);
  assert.deepEqual(normalizeHandle(`${pad}${thirty}${pad}`), {
    status: "ok",
    handle: thirty.toLowerCase(),
    display: thirty,
  });
});

// Extends "[boundary-4] normalizeHandle rejects input that is too short or
// too long once trimmed": inner whitespace counts, padding does not rescue.
test("[boundary-4] normalizeHandle rejects 2 or 31 characters once trimmed, however much padding there is", () => {
  const pad = " \t\n".repeat(10);
  for (const raw of [
    `${pad}Ab${pad}`,
    `${pad}${"X".repeat(31)}${pad}`,
    `${"x".repeat(31)}  `,
    "\t\n\r ",
    "\n",
  ]) {
    assert.equal(normalizeHandle(raw).status, "invalid", `normalizeHandle(${show(raw)})`);
    assert.deepEqual(normalizeHandle(raw), LENGTH_REJECTION, `normalizeHandle(${show(raw)})`);
  }
  // Inner whitespace is part of the length: 31 once trimmed.
  const spaced = `  ${Array.from({ length: 16 }, () => "x").join(" ")}  `;
  assert.deepEqual(normalizeHandle(spaced), LENGTH_REJECTION);
});

// Length is measured on the lowercased form: "İİ" is 2 code units as typed
// but 4 once lowercased, so it fails the charset, not the length.
test("[boundary-4] normalizeHandle measures length on the lowercased form", () => {
  assert.deepEqual(normalizeHandle("İİ"), CHARSET_REJECTION);
});

// --- normalizeHandle: rejected ----------------------------------------------

// Extends "[unhappy-2] normalizeHandle returns exactly the checkHandle
// rejection with no handle or display": other bad characters and padding.
test("[unhappy-2] normalizeHandle returns the charset rejection for inner whitespace, punctuation and non-ASCII after trimming", () => {
  for (const raw of [
    "  Dana Rivers  ",
    "dana\trivers",
    "Dana@Example",
    "dana/rivers",
    "Dana+Work",
    "  ÑANDU  ",
    "日本語",
    "😀Dana",
    "ab​c",
  ]) {
    const result = normalizeHandle(raw);
    assert.deepEqual(result, CHARSET_REJECTION, `normalizeHandle(${show(raw)})`);
    assert.equal("handle" in result, false);
    assert.equal("display" in result, false);
  }
});

// Extends "[unhappy-2] normalizeHandle rejects blank input for length ...":
// length is reported before charset, as checkHandle does.
test("[unhappy-2] normalizeHandle returns the length rejection when the trimmed input is too short or long, even with bad characters", () => {
  for (const raw of ["", "a", " A. ", "😀", `  ${"É".repeat(31)}  `, `${"x".repeat(40)}`]) {
    const result = normalizeHandle(raw);
    assert.deepEqual(result, LENGTH_REJECTION, `normalizeHandle(${show(raw)})`);
    assert.equal("handle" in result, false);
    assert.equal("display" in result, false);
  }
});

// The rejection equals what checkHandle says about the lowercased form, and
// is a fresh object each time.
test("[unhappy-2] normalizeHandle rejections equal checkHandle of toHandleCase and are new objects", () => {
  for (const raw of ["Ab", " A.B ", "Has Space", `${"Y".repeat(31)}`]) {
    assert.deepEqual(normalizeHandle(raw), checkHandle(toHandleCase(raw)), `normalizeHandle(${show(raw)})`);
  }
  const first = normalizeHandle("ab");
  assert.notEqual(first, normalizeHandle("ab"));
  assert.equal(Object.isFrozen(first), false);
  (first as { problem: string }).problem = "charset";
  assert.deepEqual(normalizeHandle("ab"), LENGTH_REJECTION);
});

// --- normalizeHandle: consistency ---------------------------------------------

// Extends "[boundary-5] the normalized handle equals toHandleCase of the input
// and passes checkHandle": many other accepted inputs.
test("[boundary-5] every accepted handle equals toHandleCase of the input and passes checkHandle", () => {
  for (const raw of [
    " FeverSoul ",
    "\r\nDANA--RIVERS\r\n",
    "_x_",
    "Org_24-Team",
    " Kelvin ",
    `\n${"Ab".repeat(15)}\t`,
  ]) {
    const result = normalizeHandle(raw);
    assert.ok(result.status === "ok", `normalizeHandle(${show(raw)})`);
    assert.equal(result.handle, toHandleCase(raw));
    assert.equal(result.display, raw.trim());
    assert.deepEqual(checkHandle(result.handle), { status: "ok" });
  }
});

// --- isValidHandle ------------------------------------------------------------

// Extends "[happy-6] isValidHandle is true for valid input and false for
// invalid input": other whitespace, casing and character sets.
test("[happy-6] isValidHandle accepts trimmed and lowercased input and rejects bad characters after normalizing", () => {
  const cases: Array<[string, boolean]> = [
    ["DANA", true],
    ["\tDana\n", true],
    [" Org-24 ", true],
    ["Kab", true],
    ["___", true],
    ["Dana Rivers", false],
    ["dana@example", false],
    ["école", false],
    ["İİ", false],
    ["😀a", false],
    ["\n\n\n", false],
  ];
  for (const [raw, valid] of cases) {
    assert.equal(isValidHandle(raw), valid, `isValidHandle(${show(raw)})`);
  }
});

// Extends "[happy-6] isValidHandle agrees with normalizeHandle at the length
// limits and on empty input": agreement over every length 0..40 with padding.
test("[happy-6] isValidHandle agrees with normalizeHandle at every padded length from 0 to 40", () => {
  for (let length = 0; length <= 40; length++) {
    const raw = `  ${"Q".repeat(length)}\t`;
    const expected = length >= 3 && length <= 30;
    assert.equal(isValidHandle(raw), expected, `${length} characters`);
    assert.equal(isValidHandle(raw), normalizeHandle(raw).status === "ok", `${length} characters`);
  }
});
