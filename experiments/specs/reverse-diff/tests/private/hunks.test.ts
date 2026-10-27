import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff, type NameTable } from "../../src/index.js";

function lines(...ls: string[]): string {
  return ls.map((l) => l + "\n").join("");
}

function header(p: string): string {
  return lines(`diff --git a/${p} b/${p}`, `--- a/${p}`, `+++ b/${p}`);
}

const main = header("src/main.ts");
const sheet: NameTable = [{ kind: "identifier", real: "Invoice", public: "Sheet" }];

// Extends "hunk content: whole-word identifiers are mapped in context, removed, added lines
// and the @@ text": every occurrence on a line, not just the first.
test("[happy-3] every occurrence of a public name on a line is mapped", () => {
  const diff =
    main +
    lines(
      "@@ -1,3 +1,3 @@ Sheet Sheet",
      " Sheet Sheet(Sheet)",
      "-Sheet.a(Sheet.b(Sheet));",
      "+Sheet.Sheet = [Sheet, Sheet, Sheet];",
    );
  const result = reverseMapDiff(diff, sheet);
  assert.equal(
    result.diff,
    main +
      lines(
        "@@ -1,3 +1,3 @@ Invoice Invoice",
        " Invoice Invoice(Invoice)",
        "-Invoice.a(Invoice.b(Invoice));",
        "+Invoice.Invoice = [Invoice, Invoice, Invoice];",
      ),
  );
});

// Extends "hunk content: whole-word identifiers are mapped ...": several entries,
// several hunks and several files.
test("[happy-3] several identifiers are mapped in every hunk of every file", () => {
  const table: NameTable = [
    { kind: "identifier", real: "Invoice", public: "Sheet" },
    { kind: "identifier", real: "Line", public: "Row" },
    { kind: "identifier", real: "total", public: "sum" },
  ];
  const diff =
    header("src/a.ts") +
    lines("@@ -1,2 +1,2 @@ class Sheet {", " let r: Row;", "-sum(r);", "+sum(r, Sheet);") +
    lines("@@ -20,3 +20,4 @@ function sum() {", " return Row;", "-Sheet", "+Sheet", "+Row") +
    header("src/b.ts") +
    lines("@@ -5 +5 @@", "-Row.sum()", "+Sheet.sum(Row)");
  const result = reverseMapDiff(diff, table);
  assert.equal(
    result.diff,
    header("src/a.ts") +
      lines("@@ -1,2 +1,2 @@ class Invoice {", " let r: Line;", "-total(r);", "+total(r, Invoice);") +
      lines("@@ -20,3 +20,4 @@ function total() {", " return Line;", "-Invoice", "+Invoice", "+Line") +
      header("src/b.ts") +
      lines("@@ -5 +5 @@", "-Line.total()", "+Invoice.total(Line)"),
  );
});

// Extends "hunk content: whole-word identifiers are mapped ...": the @@ ranges stay as
// they are while only the text after the second @@ is mapped.
test("[happy-3] hunk ranges are unchanged and only the text after the second @@ is mapped", () => {
  const diff =
    main +
    lines(
      "@@ -10,7 +12,8 @@ export function make(s: Sheet): SheetList<Sheet> {",
      " x",
      "@@ -100 +101,0 @@",
      "-y",
      "@@ -0,0 +1 @@ Sheet",
      "+z",
    );
  const result = reverseMapDiff(diff, sheet);
  assert.equal(
    result.diff,
    main +
      lines(
        "@@ -10,7 +12,8 @@ export function make(s: Invoice): SheetList<Invoice> {",
        " x",
        "@@ -100 +101,0 @@",
        "-y",
        "@@ -0,0 +1 @@ Invoice",
        "+z",
      ),
  );
});

// Extends "hunk content: words containing the public name are left, while it is mapped at
// line edges": other words around it and punctuation next to it.
test("[happy-3] words that contain the public name are left, punctuation-bounded ones are mapped", () => {
  const diff =
    main +
    lines(
      "@@ -1,4 +1,4 @@",
      " aSheetb SheetSheet MySheets",
      "-(Sheet)",
      "+Sheet;",
      "+<Sheet>{Sheet}[Sheet]",
      " Sheets Sheet",
    );
  const result = reverseMapDiff(diff, sheet);
  assert.equal(
    result.diff,
    main +
      lines(
        "@@ -1,4 +1,4 @@",
        " aSheetb SheetSheet MySheets",
        "-(Invoice)",
        "+Invoice;",
        "+<Invoice>{Invoice}[Invoice]",
        " Sheets Invoice",
      ),
  );
});

// Extends "hunk content: words containing the public name are left ...": public names
// where one is a prefix of another.
test("[happy-3] a public name that is a prefix of another public name maps only its own word", () => {
  const table: NameTable = [
    { kind: "identifier", real: "Invoice", public: "Sheet" },
    { kind: "identifier", real: "Ledger", public: "SheetList" },
  ];
  const diff = main + lines("@@ -1 +1 @@", "-SheetList<Sheet>", "+Sheet SheetList SheetLists");
  const expected = main + lines("@@ -1 +1 @@", "-Ledger<Invoice>", "+Invoice Ledger SheetLists");
  assert.equal(reverseMapDiff(diff, table).diff, expected);
  assert.equal(reverseMapDiff(diff, [table[1], table[0]]).diff, expected);
});

// Extends "hunk content: whole-word identifiers are mapped ...": spacing around a mapped
// name is kept as it is.
test("[happy-3] tabs and repeated spaces around a mapped name are kept", () => {
  const diff = main + lines("@@ -1 +1 @@", "-\t\tSheet  =  Sheet ;  ", "+    Sheet\t");
  const result = reverseMapDiff(diff, sheet);
  assert.equal(result.diff, main + lines("@@ -1 +1 @@", "-\t\tInvoice  =  Invoice ;  ", "+    Invoice\t"));
});

// Extends "hunk content: whole-word identifiers are mapped ...": a long hunk.
test("[happy-3] a long hunk is mapped on every line that holds the name", () => {
  const src: string[] = [];
  const out: string[] = [];
  for (let i = 0; i < 300; i++) {
    const prefix = i % 3 === 0 ? " " : i % 3 === 1 ? "-" : "+";
    if (i % 7 === 0) {
      src.push(`${prefix}line ${i} MySheet SheetList`);
      out.push(`${prefix}line ${i} MySheet SheetList`);
    } else {
      src.push(`${prefix}line ${i} uses Sheet`);
      out.push(`${prefix}line ${i} uses Invoice`);
    }
  }
  const diff = main + lines("@@ -1,200 +1,200 @@", ...src);
  const result = reverseMapDiff(diff, sheet);
  assert.equal(result.diff, main + lines("@@ -1,200 +1,200 @@", ...out));
});

// Extends "one pass: a replaced name is not replaced again": two entries that swap names.
test("[boundary-3] swapped identifier entries exchange the names", () => {
  const table: NameTable = [
    { kind: "identifier", real: "Alpha", public: "Beta" },
    { kind: "identifier", real: "Beta", public: "Alpha" },
  ];
  const diff = main + lines("@@ -1 +1 @@ Alpha", "-Alpha(Beta)", "+Beta(Alpha)");
  const expected = main + lines("@@ -1 +1 @@ Beta", "-Beta(Alpha)", "+Alpha(Beta)");
  assert.equal(reverseMapDiff(diff, table).diff, expected);
  assert.equal(reverseMapDiff(diff, [table[1], table[0]]).diff, expected);
});

// Extends "one pass: the result does not depend on table order": a longer chain, every order.
test("[boundary-3] a chain of four entries maps each name one step in every table order", () => {
  const chain: NameTable = [
    { kind: "identifier", real: "A1", public: "B1" },
    { kind: "identifier", real: "B1", public: "C1" },
    { kind: "identifier", real: "C1", public: "D1" },
    { kind: "identifier", real: "D1", public: "E1" },
  ];
  const diff = main + lines("@@ -1 +1 @@ E1 B1", "-B1 C1 D1 E1", "+E1(D1(C1(B1)))");
  const expected = main + lines("@@ -1 +1 @@ D1 A1", "-A1 B1 C1 D1", "+D1(C1(B1(A1)))");
  const orders = [
    [0, 1, 2, 3],
    [3, 2, 1, 0],
    [1, 3, 0, 2],
    [2, 0, 3, 1],
  ];
  for (const order of orders) {
    const table: NameTable = order.map((i) => chain[i]);
    assert.equal(reverseMapDiff(diff, table).diff, expected, `order ${order.join(",")}`);
  }
});

// Extends "one pass: a replaced name is not replaced again": many entries in one chain.
test("[boundary-3] a chain of many entries maps each name exactly once", () => {
  const table: NameTable = [];
  const words: string[] = [];
  const mapped: string[] = [];
  for (let i = 0; i < 40; i++) {
    (table as { kind: "identifier"; real: string; public: string }[]).push({
      kind: "identifier",
      real: `Name${i}x`,
      public: `Name${i + 1}x`,
    });
    words.push(`Name${i + 1}x`);
    mapped.push(`Name${i}x`);
  }
  const diff = main + lines("@@ -1 +1 @@", "-" + words.join(" "), "+" + words.reverse().join(","));
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, main + lines("@@ -1 +1 @@", "-" + mapped.join(" "), "+" + mapped.reverse().join(",")));
});
