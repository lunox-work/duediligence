import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff } from "../../src/index.js";

function headers(oldPath: string, newPath: string = oldPath): string {
  return [
    `diff --git a/${oldPath} b/${newPath}`,
    `--- a/${oldPath}`,
    `+++ b/${newPath}`,
    "",
  ].join("\n");
}

test("[happy-1] maps all file header occurrences to the real path", () => {
  const result = reverseMapDiff(headers("ledger/sheet.ts"), [
    { kind: "path", real: "billing/invoice.ts", public: "ledger/sheet.ts" },
  ]);

  assert.deepEqual(result, {
    diff: headers("billing/invoice.ts"),
    unmapped: [],
  });
});

test("[happy-1] maps distinct old and new file paths independently", () => {
  const result = reverseMapDiff(headers("ledger/old.ts", "ledger/new.ts"), [
    { kind: "path", real: "billing/before.ts", public: "ledger/old.ts" },
    { kind: "path", real: "billing/after.ts", public: "ledger/new.ts" },
  ]);

  assert.deepEqual(result, {
    diff: headers("billing/before.ts", "billing/after.ts"),
    unmapped: [],
  });
});

test("[happy-2] maps directory descendants while retaining their suffixes", () => {
  const result = reverseMapDiff(
    headers("ledger/a/b.ts") + headers("ledger/c.ts"),
    [{ kind: "path", real: "billing", public: "ledger" }],
  );

  assert.deepEqual(result, {
    diff: headers("billing/a/b.ts") + headers("billing/c.ts"),
    unmapped: [],
  });
});

test("[happy-2] leaves a directory with a longer segment name unmapped", () => {
  const result = reverseMapDiff(
    headers("ledger/a.ts") + headers("ledgers/x.ts"),
    [{ kind: "path", real: "billing", public: "ledger" }],
  );

  assert.deepEqual(result, {
    diff: headers("billing/a.ts") + headers("ledgers/x.ts"),
    unmapped: ["ledgers/x.ts"],
  });
});

test("[happy-3] maps words in hunk headings and all three content line kinds", () => {
  const diff = [
    "@@ -1,3 +1,3 @@ class Sheet {",
    " const a = new Sheet();",
    "-a.total(Sheet.empty);",
    "+a.total(Sheet.zero, SheetList);",
    "",
  ].join("\n");
  const expected = [
    "@@ -1,3 +1,3 @@ class Invoice {",
    " const a = new Invoice();",
    "-a.total(Invoice.empty);",
    "+a.total(Invoice.zero, SheetList);",
    "",
  ].join("\n");

  assert.deepEqual(
    reverseMapDiff(diff, [
      { kind: "identifier", real: "Invoice", public: "Sheet" },
    ]),
    { diff: expected, unmapped: [] },
  );
});

test("[happy-3] replaces punctuation-delimited words but preserves larger words", () => {
  const diff = [
    "@@ -7 +7 @@ SheetList",
    "-SheetList(ListSheet);",
    "+Sheet(SheetList, ListSheet, Sheet);",
    "",
  ].join("\n");
  const expected = [
    "@@ -7 +7 @@ SheetList",
    "-SheetList(ListSheet);",
    "+Invoice(SheetList, ListSheet, Invoice);",
    "",
  ].join("\n");

  assert.equal(
    reverseMapDiff(diff, [
      { kind: "identifier", real: "Invoice", public: "Sheet" },
    ]).diff,
    expected,
  );
});

test("[boundary-1] maps rename lines and a new file while preserving the null header", () => {
  const diff = [
    "diff --git a/ledger/a.ts b/ledger/b.ts",
    "similarity index 100%",
    "rename from ledger/a.ts",
    "rename to ledger/b.ts",
    "diff --git a/ledger/new.ts b/ledger/new.ts",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/ledger/new.ts",
    "@@ -0,0 +1 @@",
    "+export {};",
    "",
  ].join("\n");
  const expected = [
    "diff --git a/billing/a.ts b/billing/b.ts",
    "similarity index 100%",
    "rename from billing/a.ts",
    "rename to billing/b.ts",
    "diff --git a/billing/new.ts b/billing/new.ts",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/billing/new.ts",
    "@@ -0,0 +1 @@",
    "+export {};",
    "",
  ].join("\n");

  assert.deepEqual(
    reverseMapDiff(diff, [{ kind: "path", real: "billing", public: "ledger" }]),
    { diff: expected, unmapped: [] },
  );
});

test("[boundary-1] maps a deleted file while preserving the null destination", () => {
  const diff = [
    "diff --git a/ledger/old.ts b/ledger/old.ts",
    "deleted file mode 100644",
    "--- a/ledger/old.ts",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-export {};",
    "",
  ].join("\n");
  const expected = [
    "diff --git a/billing/old.ts b/billing/old.ts",
    "deleted file mode 100644",
    "--- a/billing/old.ts",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-export {};",
    "",
  ].join("\n");

  assert.deepEqual(
    reverseMapDiff(diff, [{ kind: "path", real: "billing", public: "ledger" }]),
    { diff: expected, unmapped: [] },
  );
});

test("[boundary-2] chooses an exact file mapping over an earlier directory mapping", () => {
  const result = reverseMapDiff(headers("ledger/core.ts"), [
    { kind: "path", real: "billing", public: "ledger" },
    { kind: "path", real: "payments/core.ts", public: "ledger/core.ts" },
  ]);

  assert.deepEqual(result, {
    diff: headers("payments/core.ts"),
    unmapped: [],
  });
});

test("[boundary-2] keeps specific mappings ahead of a later general mapping at segment boundaries", () => {
  const result = reverseMapDiff(
    headers("ledger/lib/deep/a.ts") +
      headers("ledger/core.ts") +
      headers("ledger/core.tsx"),
    [
      { kind: "path", real: "payments/sdk", public: "ledger/lib" },
      { kind: "path", real: "payments/core.ts", public: "ledger/core.ts" },
      { kind: "path", real: "billing", public: "ledger" },
    ],
  );

  assert.deepEqual(result, {
    diff:
      headers("payments/sdk/deep/a.ts") +
      headers("payments/core.ts") +
      headers("billing/core.tsx"),
    unmapped: [],
  });
});

test("[boundary-3] replaces chained public identifiers in one pass", () => {
  const result = reverseMapDiff("@@ -1 +1 @@\n-Beta\n+Beta(Gamma)\n", [
    { kind: "identifier", real: "Alpha", public: "Beta" },
    { kind: "identifier", real: "Beta", public: "Gamma" },
  ]);

  assert.deepEqual(result, {
    diff: "@@ -1 +1 @@\n-Alpha\n+Alpha(Beta)\n",
    unmapped: [],
  });
});

test("[boundary-3] avoids cascading with reversed table order and repeated names", () => {
  const result = reverseMapDiff(
    "@@ -1,2 +1,2 @@ Gamma\n Beta(Gamma)\n-Beta\n+Gamma(Beta, Gamma, BetaGamma)\n",
    [
      { kind: "identifier", real: "Beta", public: "Gamma" },
      { kind: "identifier", real: "Alpha", public: "Beta" },
    ],
  );

  assert.deepEqual(result, {
    diff: "@@ -1,2 +1,2 @@ Beta\n Alpha(Beta)\n-Alpha\n+Beta(Alpha, Beta, BetaGamma)\n",
    unmapped: [],
  });
});

test("[boundary-4] preserves unchanged metadata, whitespace, content and newline markers", () => {
  const body = [
    "@@ -1,2 +1,2 @@ function untouched() {",
    " \tconst label = 'café';  ",
    "-\treturn 1;",
    "\\ No newline at end of file",
    "+\treturn 2;",
    "\\ No newline at end of file",
    "",
  ].join("\n");
  const diff = [
    "diff --git a/ledger/a.ts b/ledger/a.ts",
    "index 1234567..89abcde 100644",
    "--- a/ledger/a.ts",
    "+++ b/ledger/a.ts",
    "",
  ].join("\n") + body;
  const expected = [
    "diff --git a/billing/a.ts b/billing/a.ts",
    "index 1234567..89abcde 100644",
    "--- a/billing/a.ts",
    "+++ b/billing/a.ts",
    "",
  ].join("\n") + body;

  assert.equal(
    reverseMapDiff(diff, [
      { kind: "path", real: "billing", public: "ledger" },
      { kind: "identifier", real: "Invoice", public: "Sheet" },
    ]).diff,
    expected,
  );
});

test("[boundary-4] preserves mixed line endings and a missing final newline while mapping", () => {
  const diff =
    "diff --git a/ledger/a.ts b/ledger/a.ts\r\n" +
    "--- a/ledger/a.ts\r\n" +
    "+++ b/ledger/a.ts\n" +
    "@@ -1 +1 @@ Sheet\r\n" +
    "-Sheet.old();\n" +
    "\\ No newline at end of file\r\n" +
    "+Sheet.new();\r\n" +
    "\\ No newline at end of file";
  const expected =
    "diff --git a/billing/a.ts b/billing/a.ts\r\n" +
    "--- a/billing/a.ts\r\n" +
    "+++ b/billing/a.ts\n" +
    "@@ -1 +1 @@ Invoice\r\n" +
    "-Invoice.old();\n" +
    "\\ No newline at end of file\r\n" +
    "+Invoice.new();\r\n" +
    "\\ No newline at end of file";

  assert.deepEqual(
    reverseMapDiff(diff, [
      { kind: "path", real: "billing", public: "ledger" },
      { kind: "identifier", real: "Invoice", public: "Sheet" },
    ]),
    { diff: expected, unmapped: [] },
  );
});

test("[unhappy-1] leaves an unknown path unchanged and reports it only once", () => {
  const diff = headers("docs/readme.md");

  assert.deepEqual(
    reverseMapDiff(diff, [{ kind: "path", real: "billing", public: "ledger" }]),
    { diff, unmapped: ["docs/readme.md"] },
  );
});

test("[unhappy-1] reports unknown paths in first appearance order across repeated sections", () => {
  const diff =
    headers("docs/z.md") +
    headers("ledger/a.ts") +
    headers("docs/a.md") +
    headers("docs/z.md");
  const expected =
    headers("docs/z.md") +
    headers("billing/a.ts") +
    headers("docs/a.md") +
    headers("docs/z.md");

  assert.deepEqual(
    reverseMapDiff(diff, [{ kind: "path", real: "billing", public: "ledger" }]),
    { diff: expected, unmapped: ["docs/z.md", "docs/a.md"] },
  );
});
