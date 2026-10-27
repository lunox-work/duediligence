import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff, type NameTable } from "../../src/index.js";

function lines(...ls: string[]): string {
  return ls.map((l) => l + "\n").join("");
}

test("unmapped: a path no entry covers is left untouched and reported once", () => {
  const table: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];
  const diff = lines(
    "diff --git a/docs/readme.md b/docs/readme.md",
    "--- a/docs/readme.md",
    "+++ b/docs/readme.md",
    "@@ -1 +1 @@",
    "-old",
    "+new",
  );
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, diff);
  assert.deepEqual(result.unmapped, ["docs/readme.md"]);
});

test("unmapped: paths are reported in the order they first appear, skipping mapped ones", () => {
  const table: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];
  const file = (p: string) =>
    lines(`diff --git a/${p} b/${p}`, `--- a/${p}`, `+++ b/${p}`, "@@ -1 +1 @@", "-old", "+new");
  const diff = file("zeta/z.ts") + file("ledger/x.ts") + file("alpha/a.ts") + file("docs/readme.md");
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    file("zeta/z.ts") + file("billing/x.ts") + file("alpha/a.ts") + file("docs/readme.md"),
  );
  assert.deepEqual(result.unmapped, ["zeta/z.ts", "alpha/a.ts", "docs/readme.md"]);
});
