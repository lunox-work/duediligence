import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff, type NameTable } from "../../src/index.js";

function lines(...ls: string[]): string {
  return ls.map((l) => l + "\n").join("");
}

function file(p: string): string {
  return lines(`diff --git a/${p} b/${p}`, `--- a/${p}`, `+++ b/${p}`, "@@ -1 +1 @@", "-old", "+new");
}

// Extends "file headers: every public path in the header lines becomes the real path":
// several file entries, each mapping only its own file, at different depths.
test("[happy-1] several file entries each map their own file across a multi-file diff", () => {
  const table: NameTable = [
    { kind: "path", real: "billing/invoice.ts", public: "ledger/sheet.ts" },
    { kind: "path", real: "billing/line.ts", public: "ledger/row.ts" },
    { kind: "path", real: "root/main.ts", public: "top.ts" },
    { kind: "path", real: "a.ts", public: "deep/er/still/f.ts" },
  ];
  const diff = file("top.ts") + file("ledger/row.ts") + file("deep/er/still/f.ts") + file("ledger/sheet.ts");
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    file("root/main.ts") + file("billing/line.ts") + file("a.ts") + file("billing/invoice.ts"),
  );
  assert.deepEqual(result.unmapped, []);
});

// Extends "file headers: every public path in the header lines becomes the real path":
// a header block with no hunk (a mode change only).
test("[happy-1] the diff --git line of a mode-change-only file is mapped", () => {
  const table: NameTable = [{ kind: "path", real: "billing/invoice.ts", public: "ledger/sheet.ts" }];
  const diff = lines("diff --git a/ledger/sheet.ts b/ledger/sheet.ts", "old mode 100644", "new mode 100755");
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    lines("diff --git a/billing/invoice.ts b/billing/invoice.ts", "old mode 100644", "new mode 100755"),
  );
  assert.deepEqual(result.unmapped, []);
});

// Extends "file headers: a file entry does not map a longer file name that shares its prefix":
// other near-miss names, next to a file that is mapped.
test("[happy-2] a file entry maps only the exact path, not names that share or extend it", () => {
  const table: NameTable = [{ kind: "path", real: "billing/invoice.ts", public: "ledger/sheet.ts" }];
  const diff =
    file("ledger/sheet.ts.bak") + file("ledger/sheet.t") + file("ledger/sheet.ts") + file("ledger/sheet.tsx");
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    file("ledger/sheet.ts.bak") + file("ledger/sheet.t") + file("billing/invoice.ts") + file("ledger/sheet.tsx"),
  );
});

// Extends "directory entry: maps every path under the directory": a multi-segment
// public directory, a real directory of another depth, and deeper files.
test("[happy-2] a multi-segment directory entry maps paths at any depth under it", () => {
  const table: NameTable = [{ kind: "path", real: "src/billing", public: "pub/ledger" }];
  const diff = file("pub/ledger/x.ts") + file("pub/ledger/a/b/c/d.ts");
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, file("src/billing/x.ts") + file("src/billing/a/b/c/d.ts"));
  assert.deepEqual(result.unmapped, []);
});

test("[happy-2] a directory entry may map to a real path with more segments", () => {
  const table: NameTable = [{ kind: "path", real: "packages/core/billing", public: "ledger" }];
  const result = reverseMapDiff(file("ledger/sub/x.ts"), table);
  assert.equal(result.diff, file("packages/core/billing/sub/x.ts"));
  assert.deepEqual(result.unmapped, []);
});

// Extends "directory entry: matches whole path segments only, so ledgers/x.ts is not mapped":
// other names that share the prefix, mixed with a path that is mapped.
test("[happy-2] a directory entry skips ledger-old, ledger.ts and ledgers but maps ledger/", () => {
  const table: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];
  const diff = file("ledger-old/x.ts") + file("ledger.ts") + file("ledger/y.ts") + file("ledgers/x.ts");
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    file("ledger-old/x.ts") + file("ledger.ts") + file("billing/y.ts") + file("ledgers/x.ts"),
  );
});

test("[happy-2] a multi-segment directory entry matches whole segments only", () => {
  const table: NameTable = [{ kind: "path", real: "src/billing", public: "pub/ledger" }];
  const diff = file("pub/ledgers/x.ts") + file("pub/ledger2/x.ts") + file("pub/ledger/x.ts");
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, file("pub/ledgers/x.ts") + file("pub/ledger2/x.ts") + file("src/billing/x.ts"));
});

// Extends "directory entry: maps every path under the directory": a directory named
// like the a/ and b/ prefixes is still mapped behind them.
test("[happy-2] a directory entry whose public name is 'b' is mapped behind the a/ and b/ prefixes", () => {
  const table: NameTable = [{ kind: "path", real: "lib", public: "b" }];
  const result = reverseMapDiff(file("b/x.ts"), table);
  assert.equal(result.diff, file("lib/x.ts"));
  assert.deepEqual(result.unmapped, []);
});

// Extends "directory entry: maps every path under the directory": many files.
test("[happy-2] a directory entry maps every one of many files under it", () => {
  const table: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];
  let diff = "";
  let expected = "";
  for (let i = 0; i < 60; i++) {
    diff += file(`ledger/m${i}/f${i}.ts`);
    expected += file(`billing/m${i}/f${i}.ts`);
  }
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, expected);
  assert.deepEqual(result.unmapped, []);
});

// Extends "renames: rename from and rename to lines are mapped": the two sides
// covered by different entries, with a hunk after the rename.
test("[boundary-1] rename lines whose two sides are covered by different entries are each mapped", () => {
  const table: NameTable = [
    { kind: "path", real: "billing", public: "ledger" },
    { kind: "path", real: "safe/box.ts", public: "vault/b.ts" },
  ];
  const diff = lines(
    "diff --git a/ledger/a.ts b/vault/b.ts",
    "similarity index 90%",
    "rename from ledger/a.ts",
    "rename to vault/b.ts",
    "index 83db48f..bf269f4 100644",
    "--- a/ledger/a.ts",
    "+++ b/vault/b.ts",
    "@@ -1 +1 @@",
    "-old",
    "+new",
  );
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/billing/a.ts b/safe/box.ts",
      "similarity index 90%",
      "rename from billing/a.ts",
      "rename to safe/box.ts",
      "index 83db48f..bf269f4 100644",
      "--- a/billing/a.ts",
      "+++ b/safe/box.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
    ),
  );
  assert.deepEqual(result.unmapped, []);
});

// Extends "renames: rename from and rename to lines are mapped": several renames in one diff.
test("[boundary-1] every rename in a multi-rename diff is mapped", () => {
  const table: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];
  const rename = (from: string, to: string) =>
    lines(`diff --git a/${from} b/${to}`, "similarity index 100%", `rename from ${from}`, `rename to ${to}`);
  const diff = rename("ledger/a.ts", "ledger/b.ts") + rename("ledger/x/c.ts", "ledger/y/d.ts");
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, rename("billing/a.ts", "billing/b.ts") + rename("billing/x/c.ts", "billing/y/d.ts"));
  assert.deepEqual(result.unmapped, []);
});

// Extends "new and deleted files: /dev/null headers are left as they are":
// /dev/null stays even when a path entry names "dev".
test("[boundary-1] /dev/null is left as it is even when a path entry has public name 'dev'", () => {
  const table: NameTable = [
    { kind: "path", real: "device", public: "dev" },
    { kind: "path", real: "billing", public: "ledger" },
  ];
  const diff = lines(
    "diff --git a/dev/new.ts b/dev/new.ts",
    "new file mode 100644",
    "index 0000000..3b18e51",
    "--- /dev/null",
    "+++ b/dev/new.ts",
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
      "diff --git a/device/new.ts b/device/new.ts",
      "new file mode 100644",
      "index 0000000..3b18e51",
      "--- /dev/null",
      "+++ b/device/new.ts",
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

// Extends "new and deleted files: /dev/null headers are left as they are": file entries.
test("[boundary-1] new and deleted files covered by file entries are mapped beside /dev/null", () => {
  const table: NameTable = [
    { kind: "path", real: "billing/invoice.ts", public: "ledger/sheet.ts" },
    { kind: "path", real: "billing/old.ts", public: "ledger/gone.ts" },
  ];
  const diff = lines(
    "diff --git a/ledger/sheet.ts b/ledger/sheet.ts",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/ledger/sheet.ts",
    "@@ -0,0 +1,2 @@",
    "+a",
    "+b",
    "diff --git a/ledger/gone.ts b/ledger/gone.ts",
    "deleted file mode 100644",
    "--- a/ledger/gone.ts",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-a",
  );
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/billing/invoice.ts b/billing/invoice.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/billing/invoice.ts",
      "@@ -0,0 +1,2 @@",
      "+a",
      "+b",
      "diff --git a/billing/old.ts b/billing/old.ts",
      "deleted file mode 100644",
      "--- a/billing/old.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-a",
    ),
  );
});

const nested: NameTable = [
  { kind: "path", real: "billing", public: "ledger" },
  { kind: "path", real: "payments/core", public: "ledger/sub" },
  { kind: "path", real: "x/y.ts", public: "ledger/sub/deep.ts" },
];

const nestedDiff =
  file("ledger/sub/deep.ts") +
  file("ledger/sub/other.ts") +
  file("ledger/subway/z.ts") +
  file("ledger/sub/deep.tsx") +
  file("ledger/top.ts");

const nestedExpected =
  file("x/y.ts") +
  file("payments/core/other.ts") +
  file("billing/subway/z.ts") +
  file("payments/core/deep.tsx") +
  file("billing/top.ts");

// Extends "most specific path entry wins over a covering directory entry": three levels.
test("[boundary-2] with three nested entries, each path uses the deepest entry that covers it", () => {
  const result = reverseMapDiff(nestedDiff, nested);
  assert.equal(result.diff, nestedExpected);
  assert.deepEqual(result.unmapped, []);
});

// Extends "most specific path entry wins regardless of table order...": other orders.
test("[boundary-2] the deepest covering entry wins in every table order", () => {
  const orders = [
    [2, 1, 0],
    [1, 0, 2],
    [0, 2, 1],
    [2, 0, 1],
  ];
  for (const order of orders) {
    const table: NameTable = order.map((i) => nested[i]);
    const result = reverseMapDiff(nestedDiff, table);
    assert.equal(result.diff, nestedExpected, `order ${order.join(",")}`);
  }
});

test("[boundary-2] the most specific entry wins in rename lines and new-file headers too", () => {
  const table: NameTable = [
    { kind: "path", real: "billing", public: "ledger" },
    { kind: "path", real: "payments/core.ts", public: "ledger/core.ts" },
  ];
  const diff = lines(
    "diff --git a/ledger/core.ts b/ledger/x.ts",
    "similarity index 100%",
    "rename from ledger/core.ts",
    "rename to ledger/x.ts",
    "diff --git a/ledger/core.ts b/ledger/core.ts",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/ledger/core.ts",
    "@@ -0,0 +1 @@",
    "+a",
  );
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/payments/core.ts b/billing/x.ts",
      "similarity index 100%",
      "rename from payments/core.ts",
      "rename to billing/x.ts",
      "diff --git a/payments/core.ts b/payments/core.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/payments/core.ts",
      "@@ -0,0 +1 @@",
      "+a",
    ),
  );
});

// Path names are replaced in one pass too: a mapped path is not mapped again.
test("[boundary-3] swapped path entries map each path once", () => {
  const table: NameTable = [
    { kind: "path", real: "left", public: "right" },
    { kind: "path", real: "right", public: "left" },
  ];
  const diff = file("right/x.ts") + file("left/y.ts");
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, file("left/x.ts") + file("right/y.ts"));
  assert.deepEqual(result.unmapped, []);
});
