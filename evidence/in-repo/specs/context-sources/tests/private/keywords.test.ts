import assert from "node:assert/strict";
import { test } from "node:test";

import { contextKeywords } from "../../src/sources.js";

/**
 * contextKeywords: maximal runs of Unicode letters or digits in the
 * lower-cased title, at least 3 UTF-16 code units, not all digits, not
 * stopwords, without repeats, in first-seen order, uncapped.
 */

// Extends "[happy-3] titles become keywords": letters beyond Latin.
test("[happy-3] letters of any script make words", () => {
  assert.deepEqual(contextKeywords("ОПЛАТА Картой"), ["оплата", "картой"]);
  assert.deepEqual(contextKeywords("東京駅 の 地図"), ["東京駅"]);
});

// Extends "[happy-3] titles become keywords": length is in code units.
test("[happy-3] a word's length counts UTF-16 code units, not characters", () => {
  // "𝐀" is one letter of two code units; "𝐀b" is two letters of three.
  assert.deepEqual(contextKeywords("𝐀 𝐀b"), ["𝐀b"]);
});

// Extends "[happy-3] titles become keywords": lower-casing comes first.
test("[happy-3] the title is lower-cased before it is split", () => {
  // "İ" lower-cases to "i" and a combining dot, which is not a letter, so
  // the lower-cased title splits into "i" and "stanbul".
  assert.deepEqual(contextKeywords("İstanbul"), ["stanbul"]);
});

// Extends "[happy-3] titles become keywords": other separators.
test("[happy-3] emoji, apostrophes and symbols separate words", () => {
  assert.deepEqual(contextKeywords("login🔥redirect user's #billing@acme+pay"), [
    "login",
    "redirect",
    "user",
    "billing",
    "acme",
    "pay",
  ]);
});

// Extends "[happy-3] titles become keywords": stopwords are whole words.
test("[happy-3] words that only contain or resemble a stopword are kept", () => {
  assert.deepEqual(contextKeywords("Updated settings: fixing issues, getter therefore bugs"), [
    "updated",
    "settings",
    "fixing",
    "issues",
    "getter",
    "therefore",
    "bugs",
  ]);
});

// Extends "[happy-3] titles become keywords": first-seen order.
test("[happy-3] keywords keep first-seen order, not sorted, without repeats", () => {
  assert.deepEqual(contextKeywords("Zeta alpha ZETA beta Alpha gamma"), [
    "zeta",
    "alpha",
    "beta",
    "gamma",
  ]);
});

// Extends "[happy-3] keywords are not capped and words mixing letters and digits are kept".
test("[happy-3] a title of hundreds of words keeps every one, once", () => {
  const words = Array.from({ length: 300 }, (_, index) => `term${index}`);
  const separators = [" ", ", ", "-", "/", "_", "."];
  const title = [...words, ...words]
    .map((word, index) => (index === 0 ? word : separators[index % separators.length] + word))
    .join("");
  assert.deepEqual(contextKeywords(title), words);
});

test("[happy-3] each call returns a new array", () => {
  const first = contextKeywords("login redirect");
  first.push("extra");
  assert.deepEqual(contextKeywords("login redirect"), ["login", "redirect"]);
});

// Extends "[boundary-1] short words, numbers, stopwords and repeats are dropped".
test("[boundary-1] all-digit words are dropped at any length, mixed ones are kept", () => {
  assert.deepEqual(contextKeywords("2024 100k x86 0x1f 12345678 v2 ab abc 007"), [
    "100k",
    "x86",
    "0x1f",
    "abc",
  ]);
});

test("[boundary-1] a stopword with more characters joined is another word", () => {
  assert.deepEqual(contextKeywords("the2 forms into-onto"), ["the2", "forms"]);
});

// Extends "[boundary-1] every listed stopword is dropped, whatever its case".
test("[boundary-1] separators, stopwords, short words and numbers together give nothing", () => {
  assert.deepEqual(contextKeywords("  a/b_c-d.e  ---  THE  And  of  to  42  Was  "), []);
});

test("[boundary-1] a repeat differing only in case or separators is dropped", () => {
  assert.deepEqual(contextKeywords("API api-Api_API"), ["api"]);
});
