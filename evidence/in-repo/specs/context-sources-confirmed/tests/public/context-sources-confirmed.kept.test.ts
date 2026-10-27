import assert from "node:assert/strict";
import { test } from "node:test";

import { keptDocuments } from "../src/sources.js";

/** Documents named "d1.md", "d2.md"… whose texts are that many "a" characters. */
function ofLengths(lengths: readonly number[]) {
  return lengths.map((length, index) => ({
    path: `d${index + 1}.md`,
    bytes: length,
    text: "a".repeat(length),
  }));
}

test("[happy-7] a short document is kept with its line endings normalized and its ends trimmed", () => {
  const cases: [string, string][] = [
    ["Hello\r\n", "Hello"],
    ["  # Pay\r\nCharges\rcards.\n\n", "# Pay\nCharges\ncards."],
  ];
  for (const [text, kept] of cases) {
    assert.deepEqual(keptDocuments([{ path: "README.md", bytes: 10, text }]), {
      documents: [{ path: "README.md", bytes: 10, text: kept, truncated: false }],
      omitted: 0,
    });
  }
});

test("[happy-7] two lone carriage returns become two newlines, inner spaces stay and bytes pass through", () => {
  const input = [{ path: "./docs/x.md", bytes: 999, text: "\ta \r\r  b\r\n" }];
  const before = structuredClone(input);
  assert.deepEqual(keptDocuments(input), {
    documents: [
      { path: "./docs/x.md", bytes: 999, text: "a \n\n  b", truncated: false },
    ],
    omitted: 0,
  });
  assert.deepEqual(input, before);
});

test("[boundary-8] the per-document cap", () => {
  const cases: [number, number, boolean][] = [
    [1, 1, false],
    [12000, 12000, false],
    [12001, 12000, true],
    [50000, 12000, true],
  ];
  for (const [length, kept, truncated] of cases) {
    const result = keptDocuments(ofLengths([length]));
    assert.equal(result.documents.length, 1, String(length));
    assert.equal(result.documents[0]!.text.length, kept, String(length));
    assert.equal(result.documents[0]!.truncated, truncated, String(length));
    assert.equal(result.omitted, 0, String(length));
  }
});

test("[boundary-8] the cap measures the normalized, trimmed text in UTF-16 code units", () => {
  const padded = keptDocuments([
    { path: "a.md", bytes: 1, text: `  ${"a".repeat(12000)}\n\n` },
  ]);
  assert.equal(padded.documents[0]!.text, "a".repeat(12000));
  assert.equal(padded.documents[0]!.truncated, false);

  const crlf = keptDocuments([
    { path: "b.md", bytes: 1, text: "a\r\n".repeat(6000) },
  ]);
  assert.equal(crlf.documents[0]!.text, `${"a\n".repeat(5999)}a`);
  assert.equal(crlf.documents[0]!.truncated, false);

  const wide = keptDocuments([
    { path: "c.md", bytes: 1, text: "😀".repeat(6001) },
  ]);
  assert.equal(wide.documents[0]!.text, "😀".repeat(6000));
  assert.equal(wide.documents[0]!.truncated, true);
});

test("[boundary-9] the total cap cuts the document that reaches it and omits the rest", () => {
  const cases: [number[], number[], boolean[], number][] = [
    [
      [12000, 12000, 12000, 12000, 10],
      [12000, 12000, 12000, 12000],
      [false, false, false, false],
      1,
    ],
    [
      [12000, 12000, 12000, 11000, 5000],
      [12000, 12000, 12000, 11000, 1000],
      [false, false, false, false, true],
      0,
    ],
    [
      [20000, 20000, 20000, 20000],
      [12000, 12000, 12000, 12000],
      [true, true, true, true],
      0,
    ],
    [
      [30000, 30000, 30000, 30000, 30000],
      [12000, 12000, 12000, 12000],
      [true, true, true, true],
      1,
    ],
  ];
  for (const [lengths, kept, truncated, omitted] of cases) {
    const result = keptDocuments(ofLengths(lengths));
    const label = JSON.stringify(lengths);
    assert.deepEqual(
      result.documents.map((document) => document.text.length),
      kept,
      label,
    );
    assert.deepEqual(
      result.documents.map((document) => document.truncated),
      truncated,
      label,
    );
    assert.equal(result.omitted, omitted, label);
  }
});

test("[boundary-9] a blank document takes no room, and each one met after the room is used up is omitted", () => {
  const documents = [
    { path: "a.md", bytes: 1, text: "a".repeat(12000) },
    { path: "blank.md", bytes: 1, text: " \r\n " },
    { path: "b.md", bytes: 1, text: "b".repeat(12000) },
    { path: "c.md", bytes: 1, text: "c".repeat(12000) },
    { path: "d.md", bytes: 1, text: "d".repeat(12000) },
    { path: "e.md", bytes: 1, text: "e" },
    { path: "f.md", bytes: 1, text: "f" },
  ];
  const result = keptDocuments(documents);
  assert.deepEqual(
    result.documents.map((document) => [document.path, document.text.length]),
    [
      ["a.md", 12000],
      ["b.md", 12000],
      ["c.md", 12000],
      ["d.md", 12000],
    ],
  );
  assert.equal(result.omitted, 3);
});

test("[boundary-10] more than CONTEXT_DOCUMENTS_MAX documents are all kept", () => {
  const documents = Array.from({ length: 13 }, (_, index) => ({
    path: `d${index + 1}.md`,
    bytes: 5,
    text: `doc ${index + 1}`,
  }));
  const result = keptDocuments(documents);
  assert.deepEqual(
    result.documents.map((document) => document.text),
    documents.map((document) => document.text),
  );
  assert.equal(result.omitted, 0);
});

test("[boundary-10] documents keep the order given, without re-ranking", () => {
  const result = keptDocuments([
    { path: "z/notes.md", bytes: 1, text: "z" },
    { path: "docs/setup.md", bytes: 1, text: "s" },
    { path: "README.md", bytes: 1, text: "r" },
  ]);
  assert.deepEqual(
    result.documents.map((document) => document.path),
    ["z/notes.md", "docs/setup.md", "README.md"],
  );
  assert.equal(result.omitted, 0);
});

test("[unhappy-3] blank documents are dropped and counted", () => {
  assert.deepEqual(
    keptDocuments([
      { path: "a.md", bytes: 3, text: "  \n" },
      { path: "b.md", bytes: 0, text: "" },
      { path: "README.md", bytes: 5, text: "Hello" },
    ]),
    {
      documents: [{ path: "README.md", bytes: 5, text: "Hello", truncated: false }],
      omitted: 2,
    },
  );
});

test("[unhappy-3] text of only line endings and tabs is blank", () => {
  assert.deepEqual(
    keptDocuments([
      { path: "a.md", bytes: 6, text: "\r\n\r\n\t\r" },
      { path: "b.md", bytes: 1, text: "b" },
    ]),
    {
      documents: [{ path: "b.md", bytes: 1, text: "b", truncated: false }],
      omitted: 1,
    },
  );
});

test("[unhappy-4] keptDocuments with no documents", () => {
  assert.deepEqual(keptDocuments([]), { documents: [], omitted: 0 });
});

test("[unhappy-4] only blank documents keep nothing and count each one", () => {
  assert.deepEqual(
    keptDocuments([
      { path: "a.md", bytes: 0, text: "" },
      { path: "b.md", bytes: 1, text: " " },
      { path: "c.md", bytes: 1, text: "\n" },
    ]),
    { documents: [], omitted: 3 },
  );
});
