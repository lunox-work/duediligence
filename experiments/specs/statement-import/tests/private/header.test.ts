import { test } from "node:test";
import assert from "node:assert/strict";
import { importStatement } from "../../src/index.js";
import type { ImportResult, StatementError } from "../../src/index.js";

const HEADER = "id;date;amount;currency;reference";
const CURRENCIES: ReadonlySet<string> = new Set(["SGD", "USD"]);
const TODAY = "2026-04-15";
const GOOD = "p-1;2026-03-31;120.50;SGD;March payout";

function failure(result: ImportResult): { errors: StatementError[]; total: number } {
  assert.equal(result.ok, false, "expected the import to fail");
  if (result.ok) throw new Error("unreachable");
  return {
    errors: result.errors.map((e) => ({ line: e.line, field: e.field, code: e.code, text: e.text })),
    total: result.total,
  };
}

function onlyHeaderError(statement: string, text: string): void {
  const { errors, total } = failure(importStatement(statement, CURRENCIES, TODAY));
  assert.deepEqual(errors, [{ line: 1, field: null, code: "header", text }]);
  assert.equal(total, 1);
}

// Extends public "[unhappy-1] a wrong header is the only error, even when later lines are also wrong":
// other near-miss headers, each followed by a valid line.
test("[unhappy-1] near-miss headers are header errors carrying the header line", () => {
  for (const header of [
    "id;date;amount;currency;reference;",
    "id;date;amount;currency",
    "id;date;amount;reference;currency",
    " id;date;amount;currency;reference",
    "id;date;amount;currency;reference ",
    "id,date,amount,currency,reference",
    "id; date; amount; currency; reference",
  ]) {
    onlyHeaderError([header, GOOD].join("\n"), header);
  }
});

// Extends public "[unhappy-1] a wrong header is the only error, even when later lines are also wrong":
// a payout line in place of the header, with many bad lines after it.
test("[unhappy-1] a statement missing its header is one header error, however many later lines are wrong", () => {
  const rows: string[] = [];
  for (let i = 0; i < 300; i++) rows.push(`bad_${i};2026-02-30;1;EUR;x`);
  onlyHeaderError([GOOD, ...rows, "", ""].join("\n"), GOOD);
});

// Extends public "[unhappy-1] a wrong header is the only error, even when later lines are also wrong":
// the header is checked alone, before the line count.
test("[unhappy-1] a wrong header over more than 10000 lines is still only the header error", () => {
  const rows: string[] = [];
  for (let i = 1; i <= 10001; i++) rows.push(`p-${i};2026-03-31;1.00;SGD;ref`);
  onlyHeaderError(["id;date;amount;currency;ref", ...rows].join("\n"), "id;date;amount;currency;ref");
});

// Extends public "[unhappy-1] an empty statement is a header error on line 1": an empty first line.
test("[unhappy-1] a statement starting with an empty line is a header error on line 1 only", () => {
  onlyHeaderError(["", HEADER, GOOD].join("\n"), "");
});

// Extends public "[unhappy-1] an empty statement is a header error on line 1": a statement of only a byte-order mark.
test("[unhappy-1] a statement that is only a byte-order mark is a header error on line 1", () => {
  const { errors, total } = failure(importStatement("﻿", CURRENCIES, TODAY));
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 1);
  assert.equal(errors[0].field, null);
  assert.equal(errors[0].code, "header");
  assert.equal(total, 1);
});

// Extends public "[unhappy-1] a header that differs only in case is a header error": with \r\n and a BOM,
// the header error is the same as without them.
test("[unhappy-1] a wrong header in a \\r\\n statement with a byte-order mark carries neither", () => {
  onlyHeaderError("﻿" + ["Id;date;amount;currency;reference", GOOD, ""].join("\r\n"), "Id;date;amount;currency;reference");
});

// Extends public "[unhappy-1] the exact header followed by a valid line is not a header error":
// the header alone, with and without its final newline.
test("[unhappy-1] the exact header with no payout lines imports no payouts", () => {
  for (const statement of [HEADER, HEADER + "\n", "﻿" + HEADER + "\r\n"]) {
    const result = importStatement(statement, CURRENCIES, TODAY);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.deepEqual(result.payouts, []);
  }
});

// Extends public "[unhappy-1] the exact header followed by a valid line is not a header error":
// a right header with later errors reports those errors, not a header error.
test("[unhappy-1] the exact header followed by bad lines reports the lines, not the header", () => {
  const { errors, total } = failure(
    importStatement([HEADER, "p-1;2026-03-31;1.00;EUR;x"].join("\n"), CURRENCIES, TODAY),
  );
  assert.deepEqual(errors, [{ line: 2, field: "currency", code: "currency", text: "EUR" }]);
  assert.equal(total, 1);
});
