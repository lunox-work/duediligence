import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff, type NameTable } from "../../src/index.js";

function lines(...ls: string[]): string {
  return ls.map((l) => l + "\n").join("");
}

test("file headers: every public path in the header lines becomes the real path", () => {
  const table: NameTable = [{ kind: "path", real: "billing/invoice.ts", public: "ledger/sheet.ts" }];
  const diff = lines(
    "diff --git a/ledger/sheet.ts b/ledger/sheet.ts",
    "--- a/ledger/sheet.ts",
    "+++ b/ledger/sheet.ts",
    "@@ -1 +1 @@",
    "-old",
    "+new",
  );
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/billing/invoice.ts b/billing/invoice.ts",
      "--- a/billing/invoice.ts",
      "+++ b/billing/invoice.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
    ),
  );
  assert.deepEqual(result.unmapped, []);
});

test("file headers: a file entry does not map a longer file name that shares its prefix", () => {
  const table: NameTable = [{ kind: "path", real: "billing/invoice.ts", public: "ledger/sheet.ts" }];
  const diff = lines(
    "diff --git a/ledger/sheet.tsx b/ledger/sheet.tsx",
    "--- a/ledger/sheet.tsx",
    "+++ b/ledger/sheet.tsx",
    "@@ -1 +1 @@",
    "-old",
    "+new",
  );
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, diff);
  assert.deepEqual(result.unmapped, ["ledger/sheet.tsx"]);
});

test("directory entry: maps every path under the directory", () => {
  const table: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];
  const diff = lines(
    "diff --git a/ledger/a/b.ts b/ledger/a/b.ts",
    "--- a/ledger/a/b.ts",
    "+++ b/ledger/a/b.ts",
    "@@ -1 +1 @@",
    "-old",
    "+new",
  );
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/billing/a/b.ts b/billing/a/b.ts",
      "--- a/billing/a/b.ts",
      "+++ b/billing/a/b.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
    ),
  );
  assert.deepEqual(result.unmapped, []);
});

test("directory entry: matches whole path segments only, so ledgers/x.ts is not mapped", () => {
  const table: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];
  const diff = lines(
    "diff --git a/ledgers/x.ts b/ledgers/x.ts",
    "--- a/ledgers/x.ts",
    "+++ b/ledgers/x.ts",
    "@@ -1 +1 @@",
    "-old",
    "+new",
  );
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, diff);
  assert.deepEqual(result.unmapped, ["ledgers/x.ts"]);
});

test("renames: rename from and rename to lines are mapped", () => {
  const table: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];
  const diff = lines(
    "diff --git a/ledger/a.ts b/ledger/b.ts",
    "similarity index 100%",
    "rename from ledger/a.ts",
    "rename to ledger/b.ts",
  );
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/billing/a.ts b/billing/b.ts",
      "similarity index 100%",
      "rename from billing/a.ts",
      "rename to billing/b.ts",
    ),
  );
  assert.deepEqual(result.unmapped, []);
});

test("new and deleted files: /dev/null headers are left as they are", () => {
  const table: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];
  const diff = lines(
    "diff --git a/ledger/new.ts b/ledger/new.ts",
    "new file mode 100644",
    "index 0000000..3b18e51",
    "--- /dev/null",
    "+++ b/ledger/new.ts",
    "@@ -0,0 +1 @@",
    "+hello",
    "diff --git a/ledger/gone.ts b/ledger/gone.ts",
    "deleted file mode 100644",
    "index 3b18e51..0000000",
    "--- a/ledger/gone.ts",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-hello",
  );
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/billing/new.ts b/billing/new.ts",
      "new file mode 100644",
      "index 0000000..3b18e51",
      "--- /dev/null",
      "+++ b/billing/new.ts",
      "@@ -0,0 +1 @@",
      "+hello",
      "diff --git a/billing/gone.ts b/billing/gone.ts",
      "deleted file mode 100644",
      "index 3b18e51..0000000",
      "--- a/billing/gone.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-hello",
    ),
  );
});

test("most specific path entry wins over a covering directory entry", () => {
  const table: NameTable = [
    { kind: "path", real: "billing", public: "ledger" },
    { kind: "path", real: "payments/core.ts", public: "ledger/core.ts" },
  ];
  const diff = lines(
    "diff --git a/ledger/core.ts b/ledger/core.ts",
    "--- a/ledger/core.ts",
    "+++ b/ledger/core.ts",
    "@@ -1 +1 @@",
    "-old",
    "+new",
  );
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/payments/core.ts b/payments/core.ts",
      "--- a/payments/core.ts",
      "+++ b/payments/core.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
    ),
  );
  assert.deepEqual(result.unmapped, []);
});

test("most specific path entry wins regardless of table order, and siblings use the directory entry", () => {
  const table: NameTable = [
    { kind: "path", real: "payments/core.ts", public: "ledger/core.ts" },
    { kind: "path", real: "billing", public: "ledger" },
  ];
  const diff = lines(
    "diff --git a/ledger/core.ts b/ledger/core.ts",
    "--- a/ledger/core.ts",
    "+++ b/ledger/core.ts",
    "@@ -1 +1 @@",
    "-old",
    "+new",
    "diff --git a/ledger/other.ts b/ledger/other.ts",
    "--- a/ledger/other.ts",
    "+++ b/ledger/other.ts",
    "@@ -1 +1 @@",
    "-old",
    "+new",
  );
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/payments/core.ts b/payments/core.ts",
      "--- a/payments/core.ts",
      "+++ b/payments/core.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "diff --git a/billing/other.ts b/billing/other.ts",
      "--- a/billing/other.ts",
      "+++ b/billing/other.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
    ),
  );
  assert.deepEqual(result.unmapped, []);
});
