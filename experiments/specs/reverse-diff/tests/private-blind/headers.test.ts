import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff, type NameTable } from "../../src/index.js";

const lines = (...ls: string[]): string => ls.join("\n") + "\n";

const notDevNull = (paths: string[]): string[] => paths.filter((p) => p !== "/dev/null");

test("headers: spec example file path is mapped in diff --git, --- and +++ lines", () => {
  const table: NameTable = [{ kind: "path", real: "billing/invoice.ts", public: "ledger/sheet.ts" }];
  const input = lines(
    "diff --git a/ledger/sheet.ts b/ledger/sheet.ts",
    "index 3b18e51..a9c4d2f 100644",
    "--- a/ledger/sheet.ts",
    "+++ b/ledger/sheet.ts",
    "@@ -1 +1 @@",
    "-export const x = 1;",
    "+export const x = 2;",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/billing/invoice.ts b/billing/invoice.ts",
      "index 3b18e51..a9c4d2f 100644",
      "--- a/billing/invoice.ts",
      "+++ b/billing/invoice.ts",
      "@@ -1 +1 @@",
      "-export const x = 1;",
      "+export const x = 2;",
    ),
  );
  assert.deepEqual(result.unmapped, []);
});

test("headers: other file entries map each file of a multi-file diff", () => {
  const table: NameTable = [
    { kind: "path", real: "server/auth/token.go", public: "pub/k9/q.go" },
    { kind: "path", real: "README.md", public: "NOTES.md" },
  ];
  const input = lines(
    "diff --git a/NOTES.md b/NOTES.md",
    "index 0a1b2c3..4d5e6f7 100644",
    "--- a/NOTES.md",
    "+++ b/NOTES.md",
    "@@ -2,2 +2,2 @@",
    " intro",
    "-old line",
    "+new line",
    "diff --git a/pub/k9/q.go b/pub/k9/q.go",
    "index 1111111..2222222 100644",
    "--- a/pub/k9/q.go",
    "+++ b/pub/k9/q.go",
    "@@ -10,1 +10,2 @@ func main() {",
    " \treturn",
    "+\t// done",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/README.md b/README.md",
      "index 0a1b2c3..4d5e6f7 100644",
      "--- a/README.md",
      "+++ b/README.md",
      "@@ -2,2 +2,2 @@",
      " intro",
      "-old line",
      "+new line",
      "diff --git a/server/auth/token.go b/server/auth/token.go",
      "index 1111111..2222222 100644",
      "--- a/server/auth/token.go",
      "+++ b/server/auth/token.go",
      "@@ -10,1 +10,2 @@ func main() {",
      " \treturn",
      "+\t// done",
    ),
  );
  assert.deepEqual(result.unmapped, []);
});

test("headers: spec example directory entry maps a path under it", () => {
  const table: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];
  const input = lines(
    "diff --git a/ledger/a/b.ts b/ledger/a/b.ts",
    "--- a/ledger/a/b.ts",
    "+++ b/ledger/a/b.ts",
    "@@ -1 +1 @@",
    "-x;",
    "+y;",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/billing/a/b.ts b/billing/a/b.ts",
      "--- a/billing/a/b.ts",
      "+++ b/billing/a/b.ts",
      "@@ -1 +1 @@",
      "-x;",
      "+y;",
    ),
  );
  assert.deepEqual(result.unmapped, []);
});

test("headers: directory entry with a multi-segment real name maps files at several depths", () => {
  const table: NameTable = [{ kind: "path", real: "services/billing", public: "ledger" }];
  const input = lines(
    "diff --git a/ledger/top.rs b/ledger/top.rs",
    "--- a/ledger/top.rs",
    "+++ b/ledger/top.rs",
    "@@ -3 +3 @@",
    "-fn a() {}",
    "+fn b() {}",
    "diff --git a/ledger/x/y/z.rs b/ledger/x/y/z.rs",
    "--- a/ledger/x/y/z.rs",
    "+++ b/ledger/x/y/z.rs",
    "@@ -7 +7 @@",
    "-let q = 1;",
    "+let q = 2;",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/services/billing/top.rs b/services/billing/top.rs",
      "--- a/services/billing/top.rs",
      "+++ b/services/billing/top.rs",
      "@@ -3 +3 @@",
      "-fn a() {}",
      "+fn b() {}",
      "diff --git a/services/billing/x/y/z.rs b/services/billing/x/y/z.rs",
      "--- a/services/billing/x/y/z.rs",
      "+++ b/services/billing/x/y/z.rs",
      "@@ -7 +7 @@",
      "-let q = 1;",
      "+let q = 2;",
    ),
  );
  assert.deepEqual(result.unmapped, []);
});

test("headers: directory entry with a multi-segment public name maps only paths under all its segments", () => {
  const table: NameTable = [{ kind: "path", real: "lib", public: "pkg/inner" }];
  const input = lines(
    "diff --git a/pkg/inner/m.py b/pkg/inner/m.py",
    "--- a/pkg/inner/m.py",
    "+++ b/pkg/inner/m.py",
    "@@ -1 +1 @@",
    "-a = 1",
    "+a = 2",
    "diff --git a/pkg/innerx/m.py b/pkg/innerx/m.py",
    "--- a/pkg/innerx/m.py",
    "+++ b/pkg/innerx/m.py",
    "@@ -1 +1 @@",
    "-a = 1",
    "+a = 2",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/lib/m.py b/lib/m.py",
      "--- a/lib/m.py",
      "+++ b/lib/m.py",
      "@@ -1 +1 @@",
      "-a = 1",
      "+a = 2",
      "diff --git a/pkg/innerx/m.py b/pkg/innerx/m.py",
      "--- a/pkg/innerx/m.py",
      "+++ b/pkg/innerx/m.py",
      "@@ -1 +1 @@",
      "-a = 1",
      "+a = 2",
    ),
  );
  assert.deepEqual(result.unmapped, ["pkg/innerx/m.py"]);
});

test("headers: path entry matches whole segments only, spec example ledgers/x.ts", () => {
  const table: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];
  const input = lines(
    "diff --git a/ledgers/x.ts b/ledgers/x.ts",
    "--- a/ledgers/x.ts",
    "+++ b/ledgers/x.ts",
    "@@ -1 +1 @@",
    "-1;",
    "+2;",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(result.diff, input);
  assert.deepEqual(result.unmapped, ["ledgers/x.ts"]);
});

test("headers: names sharing only a prefix with a directory entry are not mapped", () => {
  const table: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];
  const section = (p: string): string[] => [
    `diff --git a/${p} b/${p}`,
    `--- a/${p}`,
    `+++ b/${p}`,
    "@@ -4 +4 @@",
    "-k();",
    "+m();",
  ];
  const input = lines(
    ...section("ledger/ok.ts"),
    ...section("ledger-old/x.ts"),
    ...section("ledger.ts"),
    ...section("ledgerX/deep/y.ts"),
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      ...section("billing/ok.ts"),
      ...section("ledger-old/x.ts"),
      ...section("ledger.ts"),
      ...section("ledgerX/deep/y.ts"),
    ),
  );
  assert.deepEqual(result.unmapped, ["ledger-old/x.ts", "ledger.ts", "ledgerX/deep/y.ts"]);
});

test("headers: directories named a and b are mapped without disturbing the a/ and b/ prefixes", () => {
  const table: NameTable = [
    { kind: "path", real: "src", public: "a" },
    { kind: "path", real: "dist", public: "b" },
  ];
  const input = lines(
    "diff --git a/a/x.ts b/a/x.ts",
    "--- a/a/x.ts",
    "+++ b/a/x.ts",
    "@@ -1 +1 @@",
    "-p;",
    "+q;",
    "diff --git a/b/y.ts b/b/y.ts",
    "--- a/b/y.ts",
    "+++ b/b/y.ts",
    "@@ -1 +1 @@",
    "-p;",
    "+q;",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/src/x.ts b/src/x.ts",
      "--- a/src/x.ts",
      "+++ b/src/x.ts",
      "@@ -1 +1 @@",
      "-p;",
      "+q;",
      "diff --git a/dist/y.ts b/dist/y.ts",
      "--- a/dist/y.ts",
      "+++ b/dist/y.ts",
      "@@ -1 +1 @@",
      "-p;",
      "+q;",
    ),
  );
  assert.deepEqual(result.unmapped, []);
});

test("headers: public path names are matched literally, not as patterns", () => {
  const table: NameTable = [{ kind: "path", real: "core", public: "lib.v1" }];
  const input = lines(
    "diff --git a/lib.v1/a.ts b/lib.v1/a.ts",
    "--- a/lib.v1/a.ts",
    "+++ b/lib.v1/a.ts",
    "@@ -1 +1 @@",
    "-1;",
    "+2;",
    "diff --git a/libxv1/a.ts b/libxv1/a.ts",
    "--- a/libxv1/a.ts",
    "+++ b/libxv1/a.ts",
    "@@ -1 +1 @@",
    "-1;",
    "+2;",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/core/a.ts b/core/a.ts",
      "--- a/core/a.ts",
      "+++ b/core/a.ts",
      "@@ -1 +1 @@",
      "-1;",
      "+2;",
      "diff --git a/libxv1/a.ts b/libxv1/a.ts",
      "--- a/libxv1/a.ts",
      "+++ b/libxv1/a.ts",
      "@@ -1 +1 @@",
      "-1;",
      "+2;",
    ),
  );
  assert.deepEqual(result.unmapped, ["libxv1/a.ts"]);
});

test("renames: spec example rename lines and a /dev/null header are handled", () => {
  const table: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];
  const input = lines(
    "diff --git a/ledger/a.ts b/ledger/b.ts",
    "similarity index 100%",
    "rename from ledger/a.ts",
    "rename to ledger/b.ts",
    "diff --git a/ledger/c.ts b/ledger/c.ts",
    "new file mode 100644",
    "index 0000000..5716ca5",
    "--- /dev/null",
    "+++ b/ledger/c.ts",
    "@@ -0,0 +1 @@",
    "+export {};",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/billing/a.ts b/billing/b.ts",
      "similarity index 100%",
      "rename from billing/a.ts",
      "rename to billing/b.ts",
      "diff --git a/billing/c.ts b/billing/c.ts",
      "new file mode 100644",
      "index 0000000..5716ca5",
      "--- /dev/null",
      "+++ b/billing/c.ts",
      "@@ -0,0 +1 @@",
      "+export {};",
    ),
  );
  assert.deepEqual(notDevNull(result.unmapped), []);
});

test("renames: a deleted file keeps its +++ /dev/null header", () => {
  const table: NameTable = [{ kind: "path", real: "accounts", public: "zq" }];
  const input = lines(
    "diff --git a/zq/gone.py b/zq/gone.py",
    "deleted file mode 100644",
    "index 5716ca5..0000000",
    "--- a/zq/gone.py",
    "+++ /dev/null",
    "@@ -1,2 +0,0 @@",
    "-import os",
    "-print(1)",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/accounts/gone.py b/accounts/gone.py",
      "deleted file mode 100644",
      "index 5716ca5..0000000",
      "--- a/accounts/gone.py",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-import os",
      "-print(1)",
    ),
  );
  assert.deepEqual(notDevNull(result.unmapped), []);
});

test("renames: a rename across differently mapped directories with a hunk maps both sides", () => {
  const table: NameTable = [
    { kind: "path", real: "billing", public: "ledger" },
    { kind: "path", real: "archive", public: "vault" },
  ];
  const input = lines(
    "diff --git a/ledger/x/a.ts b/vault/deep/b.ts",
    "similarity index 88%",
    "rename from ledger/x/a.ts",
    "rename to vault/deep/b.ts",
    "index 9f8e7d6..6c5b4a3 100644",
    "--- a/ledger/x/a.ts",
    "+++ b/vault/deep/b.ts",
    "@@ -1,2 +1,2 @@",
    " keep();",
    "-drop();",
    "+add();",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/billing/x/a.ts b/archive/deep/b.ts",
      "similarity index 88%",
      "rename from billing/x/a.ts",
      "rename to archive/deep/b.ts",
      "index 9f8e7d6..6c5b4a3 100644",
      "--- a/billing/x/a.ts",
      "+++ b/archive/deep/b.ts",
      "@@ -1,2 +1,2 @@",
      " keep();",
      "-drop();",
      "+add();",
    ),
  );
  assert.deepEqual(result.unmapped, []);
});

test("specific: spec example file entry wins over its directory entry", () => {
  const table: NameTable = [
    { kind: "path", real: "billing", public: "ledger" },
    { kind: "path", real: "payments/core.ts", public: "ledger/core.ts" },
  ];
  const input = lines(
    "diff --git a/ledger/core.ts b/ledger/core.ts",
    "--- a/ledger/core.ts",
    "+++ b/ledger/core.ts",
    "@@ -1 +1 @@",
    "-1;",
    "+2;",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/payments/core.ts b/payments/core.ts",
      "--- a/payments/core.ts",
      "+++ b/payments/core.ts",
      "@@ -1 +1 @@",
      "-1;",
      "+2;",
    ),
  );
  assert.deepEqual(result.unmapped, []);
});

test("specific: deepest of three nested entries wins whatever the table order", () => {
  const entries: NameTable = [
    { kind: "path", real: "x/one.ts", public: "ledger/sub/f.ts" },
    { kind: "path", real: "y/sub2", public: "ledger/sub" },
    { kind: "path", real: "billing", public: "ledger" },
  ];
  const section = (p: string): string[] => [
    `diff --git a/${p} b/${p}`,
    `--- a/${p}`,
    `+++ b/${p}`,
    "@@ -2 +2 @@",
    "-u;",
    "+v;",
  ];
  const input = lines(
    ...section("ledger/h.ts"),
    ...section("ledger/sub/f.ts"),
    ...section("ledger/sub/g.ts"),
    ...section("ledger/core.tsx"),
  );
  const expected = lines(
    ...section("billing/h.ts"),
    ...section("x/one.ts"),
    ...section("y/sub2/g.ts"),
    ...section("billing/core.tsx"),
  );
  for (const table of [entries, [...entries].reverse(), [entries[1], entries[2], entries[0]]]) {
    const result = reverseMapDiff(input, table);
    assert.equal(result.diff, expected);
    assert.deepEqual(result.unmapped, []);
  }
});

test("specific: a nested directory entry covers only whole segments, others fall back to the parent", () => {
  const table: NameTable = [
    { kind: "path", real: "payments/engine", public: "ledger/core" },
    { kind: "path", real: "billing", public: "ledger" },
  ];
  const input = lines(
    "diff --git a/ledger/core/x.ts b/ledger/corex/y.ts",
    "similarity index 95%",
    "rename from ledger/core/x.ts",
    "rename to ledger/corex/y.ts",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/payments/engine/x.ts b/billing/corex/y.ts",
      "similarity index 95%",
      "rename from payments/engine/x.ts",
      "rename to billing/corex/y.ts",
    ),
  );
  assert.deepEqual(result.unmapped, []);
});

test("one pass: swapped path entries are each applied once", () => {
  const table: NameTable = [
    { kind: "path", real: "north", public: "south" },
    { kind: "path", real: "south", public: "north" },
  ];
  const input = lines(
    "diff --git a/south/m.ts b/north/n.ts",
    "similarity index 70%",
    "rename from south/m.ts",
    "rename to north/n.ts",
    "--- a/south/m.ts",
    "+++ b/north/n.ts",
    "@@ -1 +1 @@",
    "-1;",
    "+2;",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/north/m.ts b/south/n.ts",
      "similarity index 70%",
      "rename from north/m.ts",
      "rename to south/n.ts",
      "--- a/north/m.ts",
      "+++ b/south/n.ts",
      "@@ -1 +1 @@",
      "-1;",
      "+2;",
    ),
  );
  assert.deepEqual(result.unmapped, []);
});
