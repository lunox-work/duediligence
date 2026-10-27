import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff, type NameTable } from "../../src/index.js";

const lines = (...ls: string[]): string => ls.join("\n") + "\n";

test("unchanged: a diff holding no public name comes back byte for byte", () => {
  const table: NameTable = [
    { kind: "path", real: "secret", public: "zz9" },
    { kind: "identifier", real: "Thing", public: "Qx" },
  ];
  const input = lines(
    "diff --git a/src/app.ts b/src/app.ts",
    "old mode 100644",
    "new mode 100755",
    "index 1f2e3d4..5a6b7c8",
    "--- a/src/app.ts",
    "+++ b/src/app.ts",
    "@@ -1,4 +1,4 @@",
    " const s = \"  spaced\\t\\ttabs  \";   ",
    "-let q = 1;\t",
    "+let q = 2;",
    " ",
    " // ünïcödé — 漢字 Qxy xQx zz9x",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(result.diff, input);
});

test("unchanged: no-newline markers and a missing final newline are kept while content is mapped", () => {
  const table: NameTable = [{ kind: "identifier", real: "Invoice", public: "Sheet" }];
  const input = [
    "diff --git a/src/n.txt b/src/n.txt",
    "--- a/src/n.txt",
    "+++ b/src/n.txt",
    "@@ -1,2 +1,2 @@",
    " Sheet top",
    "-Sheet old",
    "\\ No newline at end of file",
    "+Sheet new",
    "\\ No newline at end of file",
  ].join("\n");
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    [
      "diff --git a/src/n.txt b/src/n.txt",
      "--- a/src/n.txt",
      "+++ b/src/n.txt",
      "@@ -1,2 +1,2 @@",
      " Invoice top",
      "-Invoice old",
      "\\ No newline at end of file",
      "+Invoice new",
      "\\ No newline at end of file",
    ].join("\n"),
  );
});

test("unchanged: no-newline marker is kept even when its words are public names", () => {
  const table: NameTable = [
    { kind: "identifier", real: "document", public: "file" },
    { kind: "identifier", real: "row", public: "newline" },
  ];
  const input = lines(
    "diff --git a/src/n.txt b/src/n.txt",
    "--- a/src/n.txt",
    "+++ b/src/n.txt",
    "@@ -1 +1 @@",
    "-a file",
    "\\ No newline at end of file",
    "+a newline",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/src/n.txt b/src/n.txt",
      "--- a/src/n.txt",
      "+++ b/src/n.txt",
      "@@ -1 +1 @@",
      "-a document",
      "\\ No newline at end of file",
      "+a row",
    ),
  );
});

test("unchanged: CRLF line endings are kept while paths and identifiers are mapped", () => {
  const table: NameTable = [
    { kind: "path", real: "billing", public: "ledger" },
    { kind: "identifier", real: "Invoice", public: "Sheet" },
  ];
  const crlf = (...ls: string[]): string => ls.join("\r\n") + "\r\n";
  const input = crlf(
    "diff --git a/ledger/w.ts b/ledger/w.ts",
    "index 0123456..789abcd 100644",
    "--- a/ledger/w.ts",
    "+++ b/ledger/w.ts",
    "@@ -1,2 +1,2 @@ Sheet",
    " Sheet",
    "-x(Sheet)",
    "+y(Sheet)",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    crlf(
      "diff --git a/billing/w.ts b/billing/w.ts",
      "index 0123456..789abcd 100644",
      "--- a/billing/w.ts",
      "+++ b/billing/w.ts",
      "@@ -1,2 +1,2 @@ Invoice",
      " Invoice",
      "-x(Invoice)",
      "+y(Invoice)",
    ),
  );
  assert.deepEqual(result.unmapped, []);
});

test("unchanged: mixed line endings and no final newline are each kept as they were", () => {
  const table: NameTable = [
    { kind: "path", real: "billing", public: "ledger" },
    { kind: "identifier", real: "Invoice", public: "Sheet" },
  ];
  const input =
    "diff --git a/ledger/m.ts b/ledger/m.ts\r\n" +
    "--- a/ledger/m.ts\n" +
    "+++ b/ledger/m.ts\r\n" +
    "@@ -1,2 +1,2 @@\n" +
    " Sheet\r\n" +
    "-plain\n" +
    "+Sheet";
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    "diff --git a/billing/m.ts b/billing/m.ts\r\n" +
      "--- a/billing/m.ts\n" +
      "+++ b/billing/m.ts\r\n" +
      "@@ -1,2 +1,2 @@\n" +
      " Invoice\r\n" +
      "-plain\n" +
      "+Invoice",
  );
});

test("unchanged: an empty diff maps to an empty diff with nothing unmapped", () => {
  const table: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];
  const result = reverseMapDiff("", table);
  assert.equal(result.diff, "");
  assert.deepEqual(result.unmapped, []);
});
