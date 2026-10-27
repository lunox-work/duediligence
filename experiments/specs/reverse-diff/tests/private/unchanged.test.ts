import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff, type NameTable } from "../../src/index.js";

const table: NameTable = [
  { kind: "path", real: "billing", public: "ledger" },
  { kind: "identifier", real: "Invoice", public: "Sheet" },
];

// Extends "unchanged: lines without public names, no-newline markers and a missing final
// newline are kept": the last line holds a public name and has no newline after it.
test("[boundary-4] a mapped last line without a final newline gets none added", () => {
  const diff = ["diff --git a/ledger/x.ts b/ledger/x.ts", "--- a/ledger/x.ts", "+++ b/ledger/x.ts", "@@ -1 +1 @@", "-a", "+Sheet"].join("\n");
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    ["diff --git a/billing/x.ts b/billing/x.ts", "--- a/billing/x.ts", "+++ b/billing/x.ts", "@@ -1 +1 @@", "-a", "+Invoice"].join("\n"),
  );
});

// Extends "unchanged: lines without public names, no-newline markers ...": a marker in the
// middle of a multi-file diff, followed by another file.
test("[boundary-4] a no-newline marker mid-diff is kept and the next file is still mapped", () => {
  const diff = [
    "diff --git a/ledger/x.ts b/ledger/x.ts",
    "--- a/ledger/x.ts",
    "+++ b/ledger/x.ts",
    "@@ -1 +1 @@",
    "-Sheet",
    "+Sheet;",
    "\\ No newline at end of file",
    "diff --git a/ledger/y.ts b/ledger/y.ts",
    "--- a/ledger/y.ts",
    "+++ b/ledger/y.ts",
    "@@ -1 +1 @@",
    "-x",
    "\\ No newline at end of file",
    "+Sheet",
    "",
  ].join("\n");
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    [
      "diff --git a/billing/x.ts b/billing/x.ts",
      "--- a/billing/x.ts",
      "+++ b/billing/x.ts",
      "@@ -1 +1 @@",
      "-Invoice",
      "+Invoice;",
      "\\ No newline at end of file",
      "diff --git a/billing/y.ts b/billing/y.ts",
      "--- a/billing/y.ts",
      "+++ b/billing/y.ts",
      "@@ -1 +1 @@",
      "-x",
      "\\ No newline at end of file",
      "+Invoice",
      "",
    ].join("\n"),
  );
});

// Extends "unchanged: CRLF and LF line endings are each kept on mapped and unmapped lines":
// CRLF throughout, with no-newline markers and no final line ending.
test("[boundary-4] CRLF endings, no-newline markers and a missing final CRLF are all kept", () => {
  const diff = [
    "diff --git a/ledger/x.ts b/ledger/x.ts",
    "index 83db48f..bf269f4 100644",
    "--- a/ledger/x.ts",
    "+++ b/ledger/x.ts",
    "@@ -1,2 +1,2 @@ Sheet",
    " keep",
    "-Sheet",
    "\\ No newline at end of file",
    "+x Sheet",
    "\\ No newline at end of file",
  ].join("\r\n");
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    [
      "diff --git a/billing/x.ts b/billing/x.ts",
      "index 83db48f..bf269f4 100644",
      "--- a/billing/x.ts",
      "+++ b/billing/x.ts",
      "@@ -1,2 +1,2 @@ Invoice",
      " keep",
      "-Invoice",
      "\\ No newline at end of file",
      "+x Invoice",
      "\\ No newline at end of file",
    ].join("\r\n"),
  );
});

// Extends "unchanged: CRLF and LF line endings are each kept ...": a mapped CRLF last line
// with no line ending after it, and endings that alternate line by line.
test("[boundary-4] alternating LF and CRLF endings are kept line by line", () => {
  const src = [
    "diff --git a/ledger/x.ts b/ledger/x.ts",
    "--- a/ledger/x.ts",
    "+++ b/ledger/x.ts",
    "@@ -1,4 +1,4 @@",
    " Sheet",
    " plain",
    "-Sheet",
    "+Sheet",
    " end Sheet",
  ];
  const out = [
    "diff --git a/billing/x.ts b/billing/x.ts",
    "--- a/billing/x.ts",
    "+++ b/billing/x.ts",
    "@@ -1,4 +1,4 @@",
    " Invoice",
    " plain",
    "-Invoice",
    "+Invoice",
    " end Invoice",
  ];
  const join = (ls: string[]) =>
    ls.map((l, i) => (i === ls.length - 1 ? l : l + (i % 2 === 0 ? "\r\n" : "\n"))).join("");
  const result = reverseMapDiff(join(src), table);
  assert.equal(result.diff, join(out));
});

// Extends "unchanged: lines without public names ... are kept": a diff that holds no public
// name at all is returned byte for byte, odd whitespace and non-ASCII text included.
test("[boundary-4] a diff holding no public name comes back byte for byte", () => {
  const diff = [
    "diff --git a/src/x.ts b/src/x.ts",
    "index 83db48f..bf269f4 100644",
    "--- a/src/x.ts",
    "+++ b/src/x.ts",
    "@@ -1,5 +1,5 @@ SheetList   MySheet",
    " ",
    "-\t  héllo — ✓  ",
    "+ledgers  SheetList\t\t",
    "+",
    "   two  leading  spaces",
    "",
  ].join("\n");
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, diff);
});

test("[boundary-4] an empty diff comes back empty with nothing unmapped", () => {
  const result = reverseMapDiff("", table);
  assert.equal(result.diff, "");
  assert.deepEqual(result.unmapped, []);
});

// Extends "unchanged: lines without public names ... are kept": lines with no public name
// among many that are mapped stay as they are.
test("[boundary-4] in a long hunk, lines without a public name are unchanged", () => {
  const src: string[] = [];
  const out: string[] = [];
  for (let i = 0; i < 200; i++) {
    if (i % 5 === 0) {
      src.push(`+  Sheet ${i}  `);
      out.push(`+  Invoice ${i}  `);
    } else {
      const l = `${i % 2 === 0 ? "-" : " "}\tvalue = ${i};  // SheetList`;
      src.push(l);
      out.push(l);
    }
  }
  const head = ["diff --git a/ledger/x.ts b/ledger/x.ts", "--- a/ledger/x.ts", "+++ b/ledger/x.ts", "@@ -1,160 +1,160 @@"];
  const mappedHead = ["diff --git a/billing/x.ts b/billing/x.ts", "--- a/billing/x.ts", "+++ b/billing/x.ts", "@@ -1,160 +1,160 @@"];
  const result = reverseMapDiff([...head, ...src].join("\n") + "\n", table);
  assert.equal(result.diff, [...mappedHead, ...out].join("\n") + "\n");
});
