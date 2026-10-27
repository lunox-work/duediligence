import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff, type NameTable } from "../../src/index.js";

test("unchanged: lines without public names, no-newline markers and a missing final newline are kept", () => {
  const table: NameTable = [
    { kind: "path", real: "billing", public: "ledger" },
    { kind: "identifier", real: "Invoice", public: "Sheet" },
  ];
  const diff = [
    "diff --git a/ledger/x.ts b/ledger/x.ts",
    "index 83db48f..bf269f4 100644",
    "--- a/ledger/x.ts",
    "+++ b/ledger/x.ts",
    "@@ -1,3 +1,3 @@ function run() {",
    "   keep  this\tspacing  ",
    "-const n = 1;",
    "\\ No newline at end of file",
    "+const n = 2;",
    "\\ No newline at end of file",
  ].join("\n");
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    [
      "diff --git a/billing/x.ts b/billing/x.ts",
      "index 83db48f..bf269f4 100644",
      "--- a/billing/x.ts",
      "+++ b/billing/x.ts",
      "@@ -1,3 +1,3 @@ function run() {",
      "   keep  this\tspacing  ",
      "-const n = 1;",
      "\\ No newline at end of file",
      "+const n = 2;",
      "\\ No newline at end of file",
    ].join("\n"),
  );
});

test("unchanged: CRLF and LF line endings are each kept on mapped and unmapped lines", () => {
  const table: NameTable = [
    { kind: "path", real: "billing", public: "ledger" },
    { kind: "identifier", real: "Invoice", public: "Sheet" },
  ];
  const diff =
    "diff --git a/ledger/x.ts b/ledger/x.ts\r\n" +
    "--- a/ledger/x.ts\r\n" +
    "+++ b/ledger/x.ts\n" +
    "@@ -1,3 +1,3 @@\r\n" +
    " plain\r\n" +
    "-Sheet\r\n" +
    "+Sheet\n" +
    " other\n";
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    "diff --git a/billing/x.ts b/billing/x.ts\r\n" +
      "--- a/billing/x.ts\r\n" +
      "+++ b/billing/x.ts\n" +
      "@@ -1,3 +1,3 @@\r\n" +
      " plain\r\n" +
      "-Invoice\r\n" +
      "+Invoice\n" +
      " other\n",
  );
});
