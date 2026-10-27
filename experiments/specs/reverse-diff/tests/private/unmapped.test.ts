import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff, type NameTable } from "../../src/index.js";

function lines(...ls: string[]): string {
  return ls.map((l) => l + "\n").join("");
}

function file(p: string): string {
  return lines(`diff --git a/${p} b/${p}`, `--- a/${p}`, `+++ b/${p}`, "@@ -1 +1 @@", "-old", "+new");
}

const ledger: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];

// Extends "unmapped: a path no entry covers is left untouched and reported once":
// the same path in two file sections is still reported once.
test("[unhappy-1] a path named in several file sections is reported once", () => {
  const diff = file("docs/readme.md") + file("ledger/x.ts") + file("docs/readme.md");
  const result = reverseMapDiff(diff, ledger);
  assert.equal(result.diff, file("docs/readme.md") + file("billing/x.ts") + file("docs/readme.md"));
  assert.deepEqual(result.unmapped, ["docs/readme.md"]);
});

// Extends "unmapped: a path no entry covers is left untouched and reported once":
// an unmapped rename names two paths, each reported once, old one first.
test("[unhappy-1] both sides of an unmapped rename are reported once each, in order", () => {
  const diff = lines(
    "diff --git a/docs/old.md b/docs/new.md",
    "similarity index 80%",
    "rename from docs/old.md",
    "rename to docs/new.md",
    "--- a/docs/old.md",
    "+++ b/docs/new.md",
    "@@ -1 +1 @@",
    "-a",
    "+b",
  );
  const result = reverseMapDiff(diff, ledger);
  assert.equal(result.diff, diff);
  assert.deepEqual(result.unmapped, ["docs/old.md", "docs/new.md"]);
});

test("[unhappy-1] a rename from a mapped path to an unmapped one reports only the unmapped side", () => {
  const diff = lines(
    "diff --git a/ledger/a.ts b/docs/b.md",
    "similarity index 100%",
    "rename from ledger/a.ts",
    "rename to docs/b.md",
  );
  const result = reverseMapDiff(diff, ledger);
  assert.equal(
    result.diff,
    lines("diff --git a/billing/a.ts b/docs/b.md", "similarity index 100%", "rename from billing/a.ts", "rename to docs/b.md"),
  );
  assert.deepEqual(result.unmapped, ["docs/b.md"]);
});

test("[unhappy-1] an unmapped new file is reported once beside /dev/null", () => {
  const diff = lines(
    "diff --git a/docs/new.md b/docs/new.md",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/docs/new.md",
    "@@ -0,0 +1 @@",
    "+hello",
  );
  const result = reverseMapDiff(diff, ledger);
  assert.equal(result.diff, diff);
  assert.deepEqual(
    result.unmapped.filter((p: string) => p !== "/dev/null"),
    ["docs/new.md"],
  );
});

// Extends "file headers: a file entry does not map a longer file name that shares its prefix"
// and "directory entry: matches whole path segments only": near-miss names are reported.
test("[unhappy-1] paths that only share a prefix with an entry are reported in order", () => {
  const table: NameTable = [
    { kind: "path", real: "billing/invoice.ts", public: "ledger/sheet.ts" },
    { kind: "path", real: "safe", public: "vault" },
  ];
  const diff =
    file("ledger/sheet.ts.bak") + file("vaults/a.ts") + file("ledger/sheet.ts") + file("vault.ts") + file("vault/z.ts");
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    file("ledger/sheet.ts.bak") + file("vaults/a.ts") + file("billing/invoice.ts") + file("vault.ts") + file("safe/z.ts"),
  );
  assert.deepEqual(result.unmapped, ["ledger/sheet.ts.bak", "vaults/a.ts", "vault.ts"]);
});

// Extends "unmapped: paths are reported in the order they first appear, skipping mapped ones":
// many files, repeats and mapped files interleaved.
test("[unhappy-1] many unmapped paths are reported once each in first-appearance order", () => {
  const names = ["m", "c", "x", "a", "q", "b", "z", "d", "k", "e"];
  let diff = "";
  let expected = "";
  const unmapped: string[] = [];
  for (let round = 0; round < 3; round++) {
    for (const n of names) {
      const p = `${n}${round % 2}/f.ts`;
      diff += file(p) + file(`ledger/${n}.ts`);
      expected += file(p) + file(`billing/${n}.ts`);
      if (!unmapped.includes(p)) unmapped.push(p);
    }
  }
  const result = reverseMapDiff(diff, ledger);
  assert.equal(result.diff, expected);
  assert.deepEqual(result.unmapped, unmapped);
  assert.equal(result.unmapped.length, 20);
});

// Extends "unmapped: a path no entry covers is left untouched and reported once":
// with only identifier entries no path is covered, while hunk content is still mapped.
test("[unhappy-1] with only identifier entries every path is reported unmapped", () => {
  const table: NameTable = [{ kind: "identifier", real: "Invoice", public: "Sheet" }];
  const diff = file("src/main.ts") + lines("@@ -9 +9 @@", "+Sheet") + file("src/other.ts");
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, file("src/main.ts") + lines("@@ -9 +9 @@", "+Invoice") + file("src/other.ts"));
  assert.deepEqual(result.unmapped, ["src/main.ts", "src/other.ts"]);
});

test("[unhappy-1] with an empty table the diff is unchanged and every path is reported", () => {
  const diff = file("b/x.ts") + file("a/y.ts") + file("b/x.ts");
  const result = reverseMapDiff(diff, []);
  assert.equal(result.diff, diff);
  assert.deepEqual(result.unmapped, ["b/x.ts", "a/y.ts"]);
});
