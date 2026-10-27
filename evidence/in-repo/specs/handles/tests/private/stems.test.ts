import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkHandle,
  handleStemFromEmail,
  toHandleCase,
  toHandleStem,
} from "../../src/handle.js";

function show(value: string): string {
  return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
}

// --- toHandleStem: free text --------------------------------------------------

// Extends "[happy-7] toHandleStem lowercases and joins words with a hyphen":
// each maximal run of disallowed characters becomes exactly one hyphen.
test("[happy-7] toHandleStem replaces each maximal run of disallowed characters with a single hyphen", () => {
  const cases: Array<[string, string]> = [
    ["Acme  Corp", "acme-corp"],
    ["Acme\n\t Corp", "acme-corp"],
    ["a...b", "a-b"],
    ["a!@#$%^&*()b", "a-b"],
    ["a😀b", "a-b"],
    ["a😀😀 日本 b", "a-b"],
    ["2024 Annual Report", "2024-annual-report"],
    ["ACME_CORP", "acme_corp"],
    ["O'Brien & Sons, Ltd.", "o-brien-sons-ltd"],
  ];
  for (const [text, stem] of cases) {
    assert.equal(toHandleStem(text), stem, `toHandleStem(${show(text)})`);
  }
});

// Extends "[happy-7] toHandleStem keeps inner hyphens and underscores ...":
// hyphens in the text sit next to the replacement hyphens, never merged.
test("[happy-7] toHandleStem keeps existing hyphens beside replaced runs and keeps underscores at the ends", () => {
  const cases: Array<[string, string]> = [
    ["a - b", "a---b"],
    ["a.-.b", "a---b"],
    ["a- b", "a--b"],
    ["dana---rivers", "dana---rivers"],
    ["__dana__", "__dana__"],
    ["_ dana _", "_-dana-_"],
    ["-_dana_-", "_dana_"],
    ["Ñandú Café", "and-caf"],
  ];
  for (const [text, stem] of cases) {
    assert.equal(toHandleStem(text), stem, `toHandleStem(${show(text)})`);
  }
});

// Step 1 lowercases the whole text with toLowerCase before step 2 replaces
// disallowed characters, so characters that lowercase into a-z survive.
test("[happy-7] toHandleStem lowercases before replacing, so characters that lowercase into a-z are kept", () => {
  assert.equal(toHandleStem("Kelvin"), "kelvin");
  assert.equal(toHandleStem("İstanbul"), "i-stanbul");
});

// --- toHandleStem: short stems --------------------------------------------------

// Extends "[boundary-6] toHandleStem pads stems shorter than 3 characters with
// -user": other short stems, including ones made short by stripping.
test("[boundary-6] toHandleStem pads one- and two-character stems, including underscores and digits", () => {
  const cases: Array<[string, string]> = [
    ["_", "_-user"],
    ["__", "__-user"],
    ["-_-", "_-user"],
    ["7", "7-user"],
    ["J.", "j-user"],
    ["  Al  ", "al-user"],
    ["a b", "a-b"],
    ["a-", "a-user"],
    ["--ab--", "ab-user"],
    ["..x..", "x-user"],
  ];
  for (const [text, stem] of cases) {
    assert.equal(toHandleStem(text), stem, `toHandleStem(${show(text)})`);
  }
});

// Extends "[boundary-6] toHandleStem turns empty, non-ASCII-only and
// punctuation-only text into -user": other text with nothing allowed in it.
test("[boundary-6] toHandleStem turns whitespace-only, emoji-only and hyphen-and-punctuation text into -user", () => {
  for (const text of ["   ", "\t\n", "😀", "😀😀😀😀", "-", "--", ". - .", "éàü", "@"]) {
    assert.equal(toHandleStem(text), "-user", `toHandleStem(${show(text)})`);
  }
});

// --- toHandleStem: long stems ---------------------------------------------------

// Extends "[boundary-7] toHandleStem cuts long stems to 30 characters": 31
// characters, much longer text, and mixed allowed characters.
test("[boundary-7] toHandleStem keeps exactly the first 30 characters of long stems", () => {
  const long = "abcdefghij_0123456789_klmnopqrstuvwxyz";
  assert.equal(toHandleStem("x".repeat(31)), "x".repeat(30));
  assert.equal(toHandleStem("y".repeat(100000)), "y".repeat(30));
  assert.equal(toHandleStem(long), long.slice(0, 30));
  assert.equal(toHandleStem(long.toUpperCase()), long.slice(0, 30));
  assert.equal(toHandleStem(`${"_".repeat(3)}${"x".repeat(40)}`), `___${"x".repeat(27)}`);
});

// Extends "[boundary-7] toHandleStem never ends a cut stem in a hyphen and
// trims leading hyphens before cutting": several hyphens at the cut, leading
// disallowed runs, and runs collapsed before the cut.
test("[boundary-7] toHandleStem strips every trailing hyphen left by the cut and strips the leading hyphen before cutting", () => {
  const cases: Array<[string, string]> = [
    // Several hyphens end up at the cut.
    [`${"x".repeat(27)}---yyy`, "x".repeat(27)],
    [`${"x".repeat(25)}-----${"y".repeat(10)}`, "x".repeat(25)],
    // A leading disallowed run is stripped before the cut.
    [`  ...  ${"x".repeat(40)}`, "x".repeat(30)],
    [`日本${"z".repeat(30)}`, "z".repeat(30)],
    // Disallowed runs collapse before the cut, so the stem stays short.
    [`ab${".".repeat(40)}cd`, "ab-cd"],
    [`ab${" ".repeat(100)}cd`, "ab-cd"],
    // An underscore at the cut is kept.
    [`${"x".repeat(29)}_y`, `${"x".repeat(29)}_`],
    // Only the cut stem is checked for padding.
    [`a${"-".repeat(29)}bcd`, "a-user"],
  ];
  for (const [text, stem] of cases) {
    assert.equal(toHandleStem(text), stem, `toHandleStem(${show(text)})`);
  }
});

// --- toHandleStem: very long hyphen runs ---------------------------------------

// Extends "[boundary-8] toHandleStem turns 100000 hyphens into -user" and
// "[boundary-8] ... 100000 hyphens before a letter ...": long runs after a
// letter, between letters, and on both sides.
test("[boundary-8] toHandleStem handles 100000 hyphens after a letter, between letters and around a letter", () => {
  const run = "-".repeat(100000);
  assert.equal(toHandleStem(`a${run}`), "a-user");
  assert.equal(toHandleStem(`a${run}b`), "a-user");
  assert.equal(toHandleStem(`${run}a${run}`), "a-user");
  assert.equal(toHandleStem(`${run}abc${run}def`), "abc");
});

// Extends "[boundary-8] ... 100000 disallowed characters": long mixed runs of
// hyphens and disallowed characters, and many short alternating runs.
test("[boundary-8] toHandleStem handles 100000 mixed hyphens and disallowed characters", () => {
  assert.equal(toHandleStem("-.".repeat(50000)), "-user");
  assert.equal(toHandleStem(`${"- ".repeat(50000)}ok`), "ok-user");
  assert.equal(toHandleStem("a-".repeat(50000)), "a-".repeat(15).slice(0, 29));
  assert.equal(toHandleStem(`${"-".repeat(100000)}${"Q".repeat(100000)}`), "q".repeat(30));
});

// --- toHandleStem: every stem is a valid handle -------------------------------

// Extends both "[boundary-9]" public tests: many more kinds of text.
test("[boundary-9] stems from a wide range of text pass checkHandle and are unchanged by toHandleCase", () => {
  for (const text of [
    "x",
    "_",
    "-_-",
    "a - b",
    "Kelvin",
    "İstanbul",
    `${"x".repeat(27)}---yyy`,
    `ab${"-".repeat(40)}cd`,
    "y".repeat(5000),
    `${"- ".repeat(1000)}ok`,
    "😀😀😀",
    "O'Brien & Sons, Ltd.",
    "dana@example.test",
    "   ",
  ]) {
    const stem = toHandleStem(text);
    assert.deepEqual(checkHandle(stem), { status: "ok" }, `stem of ${show(text)}`);
    assert.equal(toHandleCase(stem), stem, `stem of ${show(text)}`);
    assert.equal(stem.endsWith("-"), false, `stem of ${show(text)}`);
  }
});

// Every stem of every length of text from 0 to 40 passes checkHandle.
test("[boundary-9] stems of hyphenated text at every length from 0 to 40 pass checkHandle", () => {
  const source = "ab-cd.ef gh_ij-kl.mn op_qr-st.uv wx_yz-01.23";
  for (let length = 0; length <= 40; length++) {
    const text = source.slice(0, length);
    const stem = toHandleStem(text);
    assert.deepEqual(checkHandle(stem), { status: "ok" }, `stem of ${show(text)}`);
    assert.equal(toHandleCase(stem), stem, `stem of ${show(text)}`);
  }
});

// --- handleStemFromEmail ---------------------------------------------------------

// Extends "[happy-8] handleStemFromEmail derives the stem from the local part":
// subaddresses are not stripped and the domain is ignored.
test("[happy-8] handleStemFromEmail keeps plus tags and ignores the domain whatever it contains", () => {
  const cases: Array<[string, string]> = [
    ["dana+work@example.test", "dana-work"],
    ["+work@example.test", "work"],
    ["Ops.Team@Acme-Holdings.Example", "ops-team"],
    ["dana@a.very.long.domain.with.many.parts.example.test", "dana"],
    ["Dana_Rivers@example.test", "dana_rivers"],
    ["dana rivers@example.test", "dana-rivers"],
    ["2024.report@example.test", "2024-report"],
  ];
  for (const [email, stem] of cases) {
    assert.equal(handleStemFromEmail(email), stem, `handleStemFromEmail(${show(email)})`);
  }
});

// Extends "[happy-8] handleStemFromEmail trims hyphens and pads a short local
// part": other short and hyphen-wrapped local parts.
test("[happy-8] handleStemFromEmail pads short local parts and strips hyphens around them", () => {
  const cases: Array<[string, string]> = [
    ["QA@example.test", "qa-user"],
    ["x@example.test", "x-user"],
    ["-jo-@example.test", "jo-user"],
    ["...dana...@example.test", "dana"],
    ["abc@example.test", "abc"],
  ];
  for (const [email, stem] of cases) {
    assert.equal(handleStemFromEmail(email), stem, `handleStemFromEmail(${show(email)})`);
  }
});

// Extends "[boundary-10] handleStemFromEmail handles an empty local part,
// empty input and no at sign": other strings with no at sign, and an at sign
// at the end.
test("[boundary-10] handleStemFromEmail uses the whole string without an at sign and the prefix with a trailing at sign", () => {
  const cases: Array<[string, string]> = [
    ["Dana Rivers", "dana-rivers"],
    ["Rivers.Dana+Work", "rivers-dana-work"],
    ["jo", "jo-user"],
    ["example.test", "example-test"],
    ["dana@", "dana"],
    ["   ", "-user"],
  ];
  for (const [email, stem] of cases) {
    assert.equal(handleStemFromEmail(email), stem, `handleStemFromEmail(${show(email)})`);
  }
});

// Extends "[boundary-10] handleStemFromEmail splits on the first at sign and
// cuts long local parts": the first at sign, not the last or the first
// non-empty part, and cuts that land on hyphens.
test("[boundary-10] handleStemFromEmail splits on the first at sign even when the local part is empty, and cuts without a trailing hyphen", () => {
  const cases: Array<[string, string]> = [
    ["@dana@example.test", "-user"],
    ["@@", "-user"],
    ["dana@@example.test", "dana"],
    ["jo@dana@example.test", "jo-user"],
    ["dana@rivers@example.test", "dana"],
    [`${"x".repeat(29)}.y@example.test`, "x".repeat(29)],
    [`${"x".repeat(27)}---yyy@example.test`, "x".repeat(27)],
    [`${"X".repeat(31)}@example.test`, "x".repeat(30)],
    [`${"-".repeat(100000)}@example.test`, "-user"],
  ];
  for (const [email, stem] of cases) {
    assert.equal(handleStemFromEmail(email), stem, `handleStemFromEmail(${show(email)})`);
  }
});

// Extends "[boundary-11] handleStemFromEmail equals toHandleStem of the local
// part": many addresses, with the local part found by the first at sign.
test("[boundary-11] handleStemFromEmail equals toHandleStem of everything before the first at sign for many addresses", () => {
  for (const email of [
    "Rivers.Dana+Work@Example.Test",
    "a@b@c@d",
    "@x",
    "no at sign at all",
    "Kelvin@example.test",
    `${"Ab.".repeat(20)}@example.test`,
    "jo@",
    "",
  ]) {
    const at = email.indexOf("@");
    const local = at === -1 ? email : email.slice(0, at);
    assert.equal(handleStemFromEmail(email), toHandleStem(local), `handleStemFromEmail(${show(email)})`);
  }
  assert.equal(handleStemFromEmail("Kelvin@example.test"), "kelvin");
  assert.equal(handleStemFromEmail("a@b@c@d"), "a-user");
});
