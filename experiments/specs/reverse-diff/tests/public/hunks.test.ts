import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff, type NameTable } from "../../src/index.js";

function lines(...ls: string[]): string {
  return ls.map((l) => l + "\n").join("");
}

const header = lines(
  "diff --git a/src/main.ts b/src/main.ts",
  "--- a/src/main.ts",
  "+++ b/src/main.ts",
);

test("hunk content: whole-word identifiers are mapped in context, removed, added lines and the @@ text", () => {
  const table: NameTable = [{ kind: "identifier", real: "Invoice", public: "Sheet" }];
  const diff =
    header +
    lines(
      "@@ -1,3 +1,3 @@ class Sheet {",
      " const a = new Sheet();",
      "-a.total(Sheet.empty);",
      "+a.total(Sheet.zero, SheetList);",
    );
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    header +
      lines(
        "@@ -1,3 +1,3 @@ class Invoice {",
        " const a = new Invoice();",
        "-a.total(Invoice.empty);",
        "+a.total(Invoice.zero, SheetList);",
      ),
  );
});

test("hunk content: words containing the public name are left, while it is mapped at line edges", () => {
  const table: NameTable = [{ kind: "identifier", real: "Invoice", public: "Sheet" }];
  const diff =
    header +
    lines(
      "@@ -1,3 +1,3 @@",
      " MySheet SheetList Sheets",
      "-Sheet",
      "+x = Sheet",
    );
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    header +
      lines(
        "@@ -1,3 +1,3 @@",
        " MySheet SheetList Sheets",
        "-Invoice",
        "+x = Invoice",
      ),
  );
});

test("one pass: a replaced name is not replaced again", () => {
  const table: NameTable = [
    { kind: "identifier", real: "Alpha", public: "Beta" },
    { kind: "identifier", real: "Beta", public: "Gamma" },
  ];
  const diff = header + lines("@@ -0,0 +1 @@", "+Beta(Gamma)");
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, header + lines("@@ -0,0 +1 @@", "+Alpha(Beta)"));
});

test("one pass: the result does not depend on table order", () => {
  const table: NameTable = [
    { kind: "identifier", real: "Beta", public: "Gamma" },
    { kind: "identifier", real: "Alpha", public: "Beta" },
  ];
  const diff = header + lines("@@ -1,2 +1,2 @@", "-Gamma", "+Beta(Gamma)");
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, header + lines("@@ -1,2 +1,2 @@", "-Beta", "+Alpha(Beta)"));
});
