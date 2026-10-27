import { test } from "node:test";
import assert from "node:assert/strict";
import { importStatement } from "../../src/index.js";
import type { ImportResult, Payout, StatementError } from "../../src/index.js";

const HEADER = "id;date;amount;currency;reference";
const CURRENCIES: ReadonlySet<string> = new Set(["SGD", "USD"]);
const TODAY = "2026-04-15";

function payouts(result: ImportResult): Payout[] {
  assert.equal(result.ok, true, "expected the import to succeed");
  if (!result.ok) throw new Error("unreachable");
  return result.payouts.map((p) => ({
    id: p.id,
    date: p.date,
    amount: p.amount,
    currency: p.currency,
    reference: p.reference,
  }));
}

function failure(result: ImportResult): { errors: StatementError[]; total: number } {
  assert.equal(result.ok, false, "expected the import to fail");
  if (result.ok) throw new Error("unreachable");
  return {
    errors: result.errors.map((e) => ({ line: e.line, field: e.field, code: e.code, text: e.text })),
    total: result.total,
  };
}

/** `count` payout lines with distinct ids; `currencyAt(i)` gives line i's currency, i from 1. */
function lines(count: number, currencyAt: (i: number) => string = () => "SGD"): string[] {
  const out: string[] = [];
  for (let i = 1; i <= count; i++) out.push(`p-${i};2026-03-31;1.00;${currencyAt(i)};ref ${i}`);
  return out;
}

const ROWS = ["p-1;2026-03-31;120.50;SGD;March payout", "p-2;2026-04-01;5.00;USD;"];

// boundary-2: Windows line endings and a byte-order mark

test("[boundary-2] a statement with \\r\\n line endings and a byte-order mark imports as the same statement without them", () => {
  const plain = importStatement([HEADER, ...ROWS].join("\n"), CURRENCIES, TODAY);
  const windows = importStatement("﻿" + [HEADER, ...ROWS].join("\r\n"), CURRENCIES, TODAY);
  assert.deepEqual(payouts(windows), payouts(plain));
  assert.deepEqual(payouts(windows), [
    { id: "p-1", date: "2026-03-31", amount: 12050, currency: "SGD", reference: "March payout" },
    { id: "p-2", date: "2026-04-01", amount: 500, currency: "USD", reference: "" },
  ]);
});

test("[boundary-2] the text of an error in a \\r\\n statement carries no \\r", () => {
  const longRef = "r".repeat(141);
  const statement =
    "﻿" +
    [HEADER, "p-1;2026-03-31;1.00;SGD", `p-2;2026-03-31;1.00;SGD;${longRef}`, ""].join("\r\n");
  const { errors, total } = failure(importStatement(statement, CURRENCIES, TODAY));
  assert.deepEqual(errors, [
    { line: 2, field: null, code: "fields", text: "p-1;2026-03-31;1.00;SGD" },
    { line: 3, field: "reference", code: "reference", text: longRef },
  ]);
  assert.equal(total, 2);
});

// boundary-3: A final newline is fine, an empty line is not

test("[boundary-3] one newline after the last line is not an error", () => {
  const result = importStatement([HEADER, ...ROWS].join("\n") + "\n", CURRENCIES, TODAY);
  assert.deepEqual(
    payouts(result).map((p) => p.id),
    ["p-1", "p-2"],
  );
});

test("[boundary-3] two newlines at the end make a blank error on the empty line", () => {
  const result = importStatement([HEADER, ...ROWS].join("\n") + "\n\n", CURRENCIES, TODAY);
  const { errors, total } = failure(result);
  assert.deepEqual(errors, [{ line: 4, field: null, code: "blank", text: "" }]);
  assert.equal(total, 1);
});

test("[boundary-3] an empty line between payout lines is a blank error on that line", () => {
  const result = importStatement([HEADER, ROWS[0], "", ROWS[1]].join("\n"), CURRENCIES, TODAY);
  const { errors, total } = failure(result);
  assert.deepEqual(errors, [{ line: 3, field: null, code: "blank", text: "" }]);
  assert.equal(total, 1);
});

// boundary-4: Errors are capped and counted

test("[boundary-4] with more than 100 errors the first 100 are listed in order and the total is reported", () => {
  const statement = [HEADER, ...lines(150, () => "EUR")].join("\n");
  const { errors, total } = failure(importStatement(statement, CURRENCIES, TODAY));
  const expected: StatementError[] = [];
  for (let line = 2; line <= 101; line++) {
    expected.push({ line, field: "currency", code: "currency", text: "EUR" });
  }
  assert.deepEqual(errors, expected);
  assert.equal(total, 150);
});

test("[boundary-4] exactly 100 errors are all listed and 101 errors list 100", () => {
  const hundred = failure(
    importStatement([HEADER, ...lines(100, () => "EUR")].join("\n"), CURRENCIES, TODAY),
  );
  assert.equal(hundred.errors.length, 100);
  assert.equal(hundred.total, 100);
  assert.equal(hundred.errors[99].line, 101);

  const hundredAndOne = failure(
    importStatement([HEADER, ...lines(101, () => "EUR")].join("\n"), CURRENCIES, TODAY),
  );
  assert.equal(hundredAndOne.errors.length, 100);
  assert.equal(hundredAndOne.total, 101);
  assert.equal(hundredAndOne.errors[99].line, 101);
});

// unhappy-9: Too many lines

test("[unhappy-9] more than 10000 payout lines is one too-many error on line 10002 and nothing else", () => {
  const statement = [HEADER, ...lines(10001, (i) => (i === 1 ? "EUR" : "SGD"))].join("\n");
  const { errors, total } = failure(importStatement(statement, CURRENCIES, TODAY));
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 10002);
  assert.equal(errors[0].field, null);
  assert.equal(errors[0].code, "too-many");
  assert.equal(total, 1);
});

test("[unhappy-9] exactly 10000 payout lines import as usual", () => {
  const result = importStatement([HEADER, ...lines(10000)].join("\n"), CURRENCIES, TODAY);
  const imported = payouts(result);
  assert.equal(imported.length, 10000);
  assert.equal(imported[0].id, "p-1");
  assert.equal(imported[9999].id, "p-10000");
});

test("[unhappy-9] exactly 10000 payout lines are checked as usual", () => {
  const statement = [HEADER, ...lines(10000, (i) => (i === 10000 ? "EUR" : "SGD"))].join("\n");
  const { errors, total } = failure(importStatement(statement, CURRENCIES, TODAY));
  assert.deepEqual(errors, [{ line: 10001, field: "currency", code: "currency", text: "EUR" }]);
  assert.equal(total, 1);
});
