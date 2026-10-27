import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff, type NameTable } from "../../src/index.js";

const lines = (...ls: string[]): string => ls.join("\n") + "\n";

const header = (p: string): string[] => [`diff --git a/${p} b/${p}`, `--- a/${p}`, `+++ b/${p}`];

test("hunks: spec example maps Sheet in context, removed, added lines and hunk header text", () => {
  const table: NameTable = [{ kind: "identifier", real: "Invoice", public: "Sheet" }];
  const input = lines(
    ...header("src/k.ts"),
    "@@ -1,3 +1,3 @@ class Sheet {",
    " const a = new Sheet();",
    "-a.total(Sheet.empty);",
    "+a.total(Sheet.zero, SheetList);",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      ...header("src/k.ts"),
      "@@ -1,3 +1,3 @@ class Invoice {",
      " const a = new Invoice();",
      "-a.total(Invoice.empty);",
      "+a.total(Invoice.zero, SheetList);",
    ),
  );
});

test("hunks: whole words only, at every position in a line, other words left alone", () => {
  const table: NameTable = [{ kind: "identifier", real: "Customer", public: "Tok" }];
  const input = lines(
    ...header("src/k.ts"),
    "@@ -120,5 +118,6 @@ export function makeTok(t: Tok) {",
    "   if (!Tok) return Tok.none;",
    "-Tok",
    "-  const x = Tok.from(MyTok, Toks);",
    "+  const x = Tok.from(Tok, \"Tok's\", Tokens);",
    "+  log([Tok], Tok+Tok);",
    "+Tok",
    "   return Tok.Tok;",
    " }",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      ...header("src/k.ts"),
      "@@ -120,5 +118,6 @@ export function makeTok(t: Customer) {",
      "   if (!Customer) return Customer.none;",
      "-Customer",
      "-  const x = Customer.from(MyTok, Toks);",
      "+  const x = Customer.from(Customer, \"Customer's\", Tokens);",
      "+  log([Customer], Customer+Customer);",
      "+Customer",
      "   return Customer.Customer;",
      " }",
    ),
  );
});

test("hunks: several identifiers across several hunks and files are all mapped", () => {
  const table: NameTable = [
    { kind: "identifier", real: "Order", public: "Qa" },
    { kind: "identifier", real: "Price", public: "Zr" },
  ];
  const input = lines(
    ...header("src/one.ts"),
    "@@ -1,2 +1,2 @@ type Qa = {",
    "   p: Zr;",
    "-  q: Qa[];",
    "+  q: Array<Qa | Zr>;",
    "@@ -20,1 +20,2 @@",
    " const z = new Zr(Qa);",
    "+export { Qa, Zr, QaZr };",
    ...header("src/two.ts"),
    "@@ -5,2 +5,1 @@ function Zr() {",
    "-  return Qa;",
    " }",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      ...header("src/one.ts"),
      "@@ -1,2 +1,2 @@ type Order = {",
      "   p: Price;",
      "-  q: Order[];",
      "+  q: Array<Order | Price>;",
      "@@ -20,1 +20,2 @@",
      " const z = new Price(Order);",
      "+export { Order, Price, QaZr };",
      ...header("src/two.ts"),
      "@@ -5,2 +5,1 @@ function Price() {",
      "-  return Order;",
      " }",
    ),
  );
});

test("hunks: hunk line numbers are kept while the text after the second @@ is mapped", () => {
  const table: NameTable = [{ kind: "identifier", real: "Ledger", public: "W" }];
  const input = lines(
    ...header("src/k.ts"),
    "@@ -987,3 +1002,4 @@ impl W for W {",
    " a",
    "+b",
    " c",
    " d",
    "@@ -1500,2 +1516,2 @@",
    "-W",
    "+X",
    " W",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      ...header("src/k.ts"),
      "@@ -987,3 +1002,4 @@ impl Ledger for Ledger {",
      " a",
      "+b",
      " c",
      " d",
      "@@ -1500,2 +1516,2 @@",
      "-Ledger",
      "+X",
      " Ledger",
    ),
  );
});

test("hunks: path and identifier entries apply together in one diff", () => {
  const table: NameTable = [
    { kind: "path", real: "billing", public: "ledger" },
    { kind: "identifier", real: "Invoice", public: "Sheet" },
  ];
  const input = lines(
    "diff --git a/ledger/q.ts b/ledger/q.ts",
    "index abc1234..def5678 100644",
    "--- a/ledger/q.ts",
    "+++ b/ledger/q.ts",
    "@@ -4,2 +4,2 @@ export class Sheet {",
    "   id = 0;",
    "-  copy(): Sheet { return this; }",
    "+  copy(): Sheet { return new Sheet(); }",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      "diff --git a/billing/q.ts b/billing/q.ts",
      "index abc1234..def5678 100644",
      "--- a/billing/q.ts",
      "+++ b/billing/q.ts",
      "@@ -4,2 +4,2 @@ export class Invoice {",
      "   id = 0;",
      "-  copy(): Invoice { return this; }",
      "+  copy(): Invoice { return new Invoice(); }",
    ),
  );
  assert.deepEqual(result.unmapped, []);
});

test("one pass: spec example +Beta(Gamma) becomes +Alpha(Beta)", () => {
  const table: NameTable = [
    { kind: "identifier", real: "Alpha", public: "Beta" },
    { kind: "identifier", real: "Beta", public: "Gamma" },
  ];
  const input = lines(...header("src/k.ts"), "@@ -0,0 +1 @@", "+Beta(Gamma)");
  const result = reverseMapDiff(input, table);
  assert.equal(result.diff, lines(...header("src/k.ts"), "@@ -0,0 +1 @@", "+Alpha(Beta)"));
});

test("one pass: swapped identifiers trade places in every kind of hunk line", () => {
  const table: NameTable = [
    { kind: "identifier", real: "Left", public: "Right" },
    { kind: "identifier", real: "Right", public: "Left" },
  ];
  const input = lines(
    ...header("src/k.ts"),
    "@@ -3,2 +3,2 @@ Right Left",
    " Left(Right)",
    "-Right.Left",
    "+Left Right Left",
  );
  const result = reverseMapDiff(input, table);
  assert.equal(
    result.diff,
    lines(
      ...header("src/k.ts"),
      "@@ -3,2 +3,2 @@ Left Right",
      " Right(Left)",
      "-Left.Right",
      "+Right Left Right",
    ),
  );
});

test("one pass: a chain of three identifiers listed in reverse order is applied once", () => {
  const table: NameTable = [
    { kind: "identifier", real: "Cc", public: "Dd" },
    { kind: "identifier", real: "Bb", public: "Cc" },
    { kind: "identifier", real: "Aa", public: "Bb" },
  ];
  const input = lines(...header("src/k.ts"), "@@ -1 +1 @@", "-Dd", "+Bb Cc Dd");
  const result = reverseMapDiff(input, table);
  assert.equal(result.diff, lines(...header("src/k.ts"), "@@ -1 +1 @@", "-Cc", "+Aa Bb Cc"));
});

test("one pass: a real name that contains another public name is not mapped again", () => {
  const table: NameTable = [
    { kind: "identifier", real: "SheetList", public: "Sheet" },
    { kind: "identifier", real: "Sheet", public: "Page" },
  ];
  const input = lines(...header("src/k.ts"), "@@ -1 +1 @@", "-Page", "+Sheet Page");
  const result = reverseMapDiff(input, table);
  assert.equal(result.diff, lines(...header("src/k.ts"), "@@ -1 +1 @@", "-Sheet", "+SheetList Sheet"));
});
