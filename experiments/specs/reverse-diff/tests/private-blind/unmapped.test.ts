import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff, type NameTable } from "../../src/index.js";

const lines = (...ls: string[]): string => ls.join("\n") + "\n";

const section = (p: string): string[] => [
  `diff --git a/${p} b/${p}`,
  "index 1234567..89abcde 100644",
  `--- a/${p}`,
  `+++ b/${p}`,
  "@@ -1 +1 @@",
  "-one",
  "+two",
];

test("unmapped: spec example docs/readme.md is left as is and reported once", () => {
  const table: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];
  const input = lines(...section("docs/readme.md"));
  const result = reverseMapDiff(input, table);
  assert.equal(result.diff, input);
  assert.deepEqual(result.unmapped, ["docs/readme.md"]);
});

test("unmapped: paths are reported once each in order of first appearance", () => {
  const table: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];
  const input = lines(
    ...section("zeta/z.md"),
    ...section("ledger/a.ts"),
    ...section("alpha/a.md"),
    ...section("zeta/z.md"),
    ...section("mid/m.md"),
    ...section("alpha/a.md"),
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      ...section("zeta/z.md"),
      ...section("billing/a.ts"),
      ...section("alpha/a.md"),
      ...section("zeta/z.md"),
      ...section("mid/m.md"),
      ...section("alpha/a.md"),
    ),
  );
  assert.deepEqual(result.unmapped, ["zeta/z.md", "alpha/a.md", "mid/m.md"]);
});

test("unmapped: renames report only the uncovered side, in order", () => {
  const table: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];
  const input = lines(
    "diff --git a/docs/old.md b/ledger/new.md",
    "similarity index 100%",
    "rename from docs/old.md",
    "rename to ledger/new.md",
    "diff --git a/ledger/r.md b/notes/r.md",
    "similarity index 100%",
    "rename from ledger/r.md",
    "rename to notes/r.md",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/docs/old.md b/billing/new.md",
      "similarity index 100%",
      "rename from docs/old.md",
      "rename to billing/new.md",
      "diff --git a/billing/r.md b/notes/r.md",
      "similarity index 100%",
      "rename from billing/r.md",
      "rename to notes/r.md",
    ),
  );
  assert.deepEqual(result.unmapped, ["docs/old.md", "notes/r.md"]);
});

test("unmapped: with an empty table every path is reported and the diff is unchanged", () => {
  const input = lines(...section("b/second.c"), ...section("a/first.c"), ...section("b/second.c"));
  const result = reverseMapDiff(input, []);
  assert.equal(result.diff, input);
  assert.deepEqual(result.unmapped, ["b/second.c", "a/first.c"]);
});

test("unmapped: paths in a CRLF diff are reported without the line ending", () => {
  const table: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];
  const input = section("docs/guide.txt").join("\r\n") + "\r\n";
  const result = reverseMapDiff(input, table);
  assert.equal(result.diff, input);
  assert.deepEqual(result.unmapped, ["docs/guide.txt"]);
});

test("unmapped: a new uncovered file is reported and kept", () => {
  const table: NameTable = [{ kind: "path", real: "billing", public: "ledger" }];
  const input = lines(
    "diff --git a/docs/new.md b/docs/new.md",
    "new file mode 100644",
    "index 0000000..d00491f",
    "--- /dev/null",
    "+++ b/docs/new.md",
    "@@ -0,0 +1 @@",
    "+hello",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(result.diff, input);
  assert.deepEqual(
    result.unmapped.filter((p) => p !== "/dev/null"),
    ["docs/new.md"],
  );
});
