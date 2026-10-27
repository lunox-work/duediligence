import assert from "node:assert/strict";
import { test } from "node:test";

import { keptDocuments } from "../../src/sources.js";

/**
 * keptDocuments: input order, a per-document cap of 12000 code units, a
 * running room of 48000, at most 12 kept, no halved surrogate pairs, blank
 * texts dropped uncounted.
 */

/** One document per length, its text that many of `char`. */
function docsOfLengths(lengths: readonly number[], char = "a") {
  return lengths.map((length, index) => ({
    path: `docs/d${index}.md`,
    bytes: length,
    text: char.repeat(length),
  }));
}

function doc(path: string, text: string) {
  return { path, bytes: text.length, text };
}

const lengthsOf = (result: ReturnType<typeof keptDocuments>) =>
  result.documents.map((document) => document.text.length);
const flagsOf = (result: ReturnType<typeof keptDocuments>) =>
  result.documents.map((document) => document.truncated);

// Extends "[happy-7] a short document is kept as it is".
test("[happy-7] several short documents are kept verbatim, in order, with only their four fields", () => {
  const input = [
    { path: "README.md", bytes: 3, text: "# Title\r\n\r\nBody\t \n" },
    { path: "docs/ü.md", bytes: 77, text: "Ünïcödé 😀\n" },
    { path: "c.md", bytes: 12, text: " x" },
  ];
  const copy = input.map((document) => ({ ...document }));
  const result = keptDocuments(input);
  assert.deepEqual(result, {
    documents: [
      { path: "README.md", bytes: 3, text: "# Title\r\n\r\nBody\t \n", truncated: false },
      { path: "docs/ü.md", bytes: 77, text: "Ünïcödé 😀\n", truncated: false },
      { path: "c.md", bytes: 12, text: " x", truncated: false },
    ],
    omitted: 0,
  });
  assert.deepEqual(input, copy);
});

// Extends "[happy-7] uncut text keeps its whitespace, and path and bytes pass through".
test("[happy-7] the returned list is a new array", () => {
  const input = [doc("a.md", "A")];
  const first = keptDocuments(input);
  first.documents.push({ path: "x.md", bytes: 1, text: "x", truncated: false });
  assert.equal(input.length, 1);
  assert.deepEqual(keptDocuments(input), {
    documents: [{ path: "a.md", bytes: 1, text: "A", truncated: false }],
    omitted: 0,
  });
});

// Extends "[boundary-8] the per-document cap".
test("[boundary-8] lengths just under, just over and far over the per-document cap", () => {
  const cases: [number, number, boolean][] = [
    [11999, 11999, false],
    [12002, 12000, true],
    [100000, 12000, true],
  ];
  for (const [length, kept, truncated] of cases) {
    const result = keptDocuments(docsOfLengths([length]));
    assert.deepEqual(lengthsOf(result), [kept], String(length));
    assert.deepEqual(flagsOf(result), [truncated], String(length));
    assert.equal(result.omitted, 0, String(length));
  }
});

// Extends "[boundary-8] a cut keeps the start of the text".
test("[boundary-8] each document is cut on its own and keeps its start", () => {
  const text = Array.from({ length: 3000 }, (_, index) => String(index % 10)).join("").repeat(5);
  const result = keptDocuments([
    doc("a.md", text),
    doc("b.md", "bbbbb"),
    doc("c.md", "c".repeat(30000)),
  ]);
  assert.equal(result.documents[0]!.text, text.slice(0, 12000));
  assert.deepEqual(lengthsOf(result), [12000, 5, 12000]);
  assert.deepEqual(flagsOf(result), [true, false, true]);
  assert.equal(result.omitted, 0);
});

// Extends "[boundary-9] the total cap cuts the document that reaches it and omits the rest".
test("[boundary-9] the room shrinks by the length kept, not by the cap", () => {
  const input = [
    ...docsOfLengths([12000, 12000, 12000]),
    doc("docs/pair.md", "a".repeat(11999) + "😀" + "zzz"),
    doc("docs/last.md", "bc"),
  ];
  const result = keptDocuments(input);
  // The fourth keeps 11999 code units, leaving a room of 1 for the fifth.
  assert.deepEqual(lengthsOf(result), [12000, 12000, 12000, 11999, 1]);
  assert.deepEqual(flagsOf(result), [false, false, false, true, true]);
  assert.equal(result.documents[4]!.text, "b");
  assert.equal(result.omitted, 0);
});

test("[boundary-9] twelve documents can share the total room exactly", () => {
  const exact = keptDocuments(docsOfLengths(Array(12).fill(4000)));
  assert.deepEqual(lengthsOf(exact), Array(12).fill(4000));
  assert.deepEqual(flagsOf(exact), Array(12).fill(false));
  assert.equal(exact.omitted, 0);

  const over = keptDocuments(docsOfLengths(Array(12).fill(4001)));
  assert.deepEqual(lengthsOf(over), [...Array(11).fill(4001), 3989]);
  assert.deepEqual(flagsOf(over), [...Array(11).fill(false), true]);
  assert.equal(over.omitted, 0);
});

test("[boundary-9] a short document after a long one is cut by the room, keeping its start", () => {
  const input = [
    doc("a.md", "a".repeat(5000)),
    doc("b.md", "b".repeat(30000)),
    doc("c.md", "c".repeat(30000)),
    doc("d.md", "d".repeat(30000)),
    doc("e.md", "e".repeat(30000)),
  ];
  const result = keptDocuments(input);
  assert.deepEqual(lengthsOf(result), [5000, 12000, 12000, 12000, 7000]);
  assert.deepEqual(flagsOf(result), [false, true, true, true, true]);
  assert.equal(result.documents[4]!.text, "e".repeat(7000));
  assert.equal(result.omitted, 0);
});

test("[boundary-9] once the room is spent, each later non-blank document is counted", () => {
  const input = [
    ...docsOfLengths([12000, 12000, 12000, 12000]),
    doc("blank.md", "   "),
    doc("x.md", "x"),
    doc("nl.md", "\n"),
    doc("y.md", "y"),
  ];
  const result = keptDocuments(input);
  assert.deepEqual(lengthsOf(result), [12000, 12000, 12000, 12000]);
  assert.equal(result.omitted, 2);
});

// Extends "[boundary-10] a cut never ends halfway through a surrogate pair".
test("[boundary-10] a cut by the remaining room does not halve a surrogate pair", () => {
  const input = [
    ...docsOfLengths([12000, 12000, 12000, 6000]),
    doc("docs/pair.md", "a".repeat(5999) + "😀" + "b"),
    doc("docs/q.md", "q"),
  ];
  const result = keptDocuments(input);
  assert.equal(result.documents[4]!.text, "a".repeat(5999));
  assert.equal(result.documents[4]!.truncated, true);
  // The room left is 1, which "q" fits.
  assert.equal(result.documents[5]!.text, "q");
  assert.equal(result.documents.length, 6);
  assert.equal(result.omitted, 0);
});

// Extends "[boundary-10] a whole surrogate pair inside the cap is kept".
test("[boundary-10] a text of surrogate pairs is cut between pairs", () => {
  const even = keptDocuments([doc("a.md", "😀".repeat(6001))]).documents[0]!;
  assert.equal(even.text, "😀".repeat(6000));
  assert.equal(even.truncated, true);

  const odd = keptDocuments([doc("b.md", "x" + "😀".repeat(6000))]).documents[0]!;
  assert.equal(odd.text, "x" + "😀".repeat(5999));
  assert.equal(odd.truncated, true);

  const whole = keptDocuments([doc("c.md", "😀".repeat(6000))]).documents[0]!;
  assert.equal(whole.text, "😀".repeat(6000));
  assert.equal(whole.truncated, false);
});

test("[boundary-10] a lone high surrogate at the cut is dropped too", () => {
  const result = keptDocuments([doc("a.md", "x".repeat(11999) + "\uD800" + "yz")]);
  assert.equal(result.documents[0]!.text, "x".repeat(11999));
  assert.equal(result.documents[0]!.truncated, true);
});

// Extends "[boundary-11] once the room is used up, later documents are omitted".
test("[boundary-11] each document whose cut leaves nothing is counted, and the room stays for the next", () => {
  const input = [
    ...docsOfLengths([12000, 12000, 12000, 11999]),
    doc("docs/e1.md", "😀"),
    doc("docs/blank.md", "  "),
    doc("docs/e2.md", "😀x"),
    doc("docs/q.md", "q"),
    doc("docs/r.md", "r"),
  ];
  const result = keptDocuments(input);
  assert.deepEqual(
    result.documents.map((document) => document.path),
    ["docs/d0.md", "docs/d1.md", "docs/d2.md", "docs/d3.md", "docs/q.md"],
  );
  assert.equal(result.documents[4]!.text, "q");
  assert.equal(result.omitted, 3);
});

// Extends "[boundary-12] more than CONTEXT_DOCUMENTS_MAX documents".
test("[boundary-12] each document past the cap is counted once, also when the room is spent", () => {
  const input = [...docsOfLengths(Array(12).fill(4000)), doc("x.md", "x"), doc("y.md", "y"), doc("z.md", "z")];
  const result = keptDocuments(input);
  assert.equal(result.documents.length, 12);
  assert.equal(result.omitted, 3);
});

test("[boundary-12] a document omitted for its cut does not take a place under the cap", () => {
  const input = [
    ...docsOfLengths([12000, 12000, 12000, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1499]),
    doc("docs/emoji.md", "😀"),
    doc("docs/z.md", "z"),
    doc("docs/w.md", "w"),
  ];
  const result = keptDocuments(input);
  assert.equal(result.documents.length, 12);
  assert.equal(result.documents[11]!.path, "docs/z.md");
  assert.equal(result.documents[11]!.text, "z");
  assert.equal(result.omitted, 2);
});

test("[boundary-12] fifty documents keep the first twelve and count thirty-eight", () => {
  const input = Array.from({ length: 50 }, (_, index) => doc(`n${index + 1}.md`, `doc ${index + 1}`));
  const result = keptDocuments(input);
  assert.deepEqual(
    result.documents.map((document) => document.text),
    Array.from({ length: 12 }, (_, index) => `doc ${index + 1}`),
  );
  assert.equal(result.omitted, 38);
});

// Extends "[unhappy-3] blank documents are dropped without being counted".
test("[unhappy-3] every kind of whitespace is blank, and a blank document takes no room", () => {
  const input = [
    doc("spaces.md", " ".repeat(20000)),
    doc("crlf.md", "\t\r\n"),
    doc("unicode.md", " 　﻿"),
    doc("sep.md", " "),
    ...docsOfLengths([12000, 12000, 12000, 12000]),
  ];
  const result = keptDocuments(input);
  assert.deepEqual(
    result.documents.map((document) => document.path),
    ["docs/d0.md", "docs/d1.md", "docs/d2.md", "docs/d3.md"],
  );
  assert.deepEqual(flagsOf(result), [false, false, false, false]);
  assert.equal(result.omitted, 0);
});

test("[unhappy-3] a non-blank document whose kept start is only whitespace is kept", () => {
  const result = keptDocuments([doc("a.md", " ".repeat(12000) + "x")]);
  assert.deepEqual(result, {
    documents: [{ path: "a.md", bytes: 12001, text: " ".repeat(12000), truncated: true }],
    omitted: 0,
  });
});

// Extends "[unhappy-3] blank documents neither take a place under the count cap nor count past it".
test("[unhappy-3] blank documents met after the room is spent are not counted", () => {
  const result = keptDocuments([...docsOfLengths([12000, 12000, 12000, 12000]), doc("a.md", " "), doc("b.md", "\n\n")]);
  assert.equal(result.documents.length, 4);
  assert.equal(result.omitted, 0);
});

// Extends "[unhappy-4] no documents".
test("[unhappy-4] no documents gives a new empty list each time", () => {
  const first = keptDocuments([]);
  first.documents.push({ path: "x.md", bytes: 1, text: "x", truncated: false });
  assert.deepEqual(keptDocuments([]), { documents: [], omitted: 0 });
});
