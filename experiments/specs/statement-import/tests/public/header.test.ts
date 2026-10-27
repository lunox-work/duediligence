import { test } from "node:test";
import assert from "node:assert/strict";
import { importStatement } from "../../src/index.js";
import type { ImportResult, StatementError } from "../../src/index.js";

const HEADER = "id;date;amount;currency;reference";
const CURRENCIES: ReadonlySet<string> = new Set(["SGD", "USD"]);
const TODAY = "2026-04-15";

function failure(result: ImportResult): { errors: StatementError[]; total: number } {
  assert.equal(result.ok, false, "expected the import to fail");
  if (result.ok) throw new Error("unreachable");
  return {
    errors: result.errors.map((e) => ({ line: e.line, field: e.field, code: e.code, text: e.text })),
    total: result.total,
  };
}

test("[unhappy-1] a wrong header is the only error, even when later lines are also wrong", () => {
  const statement = [
    "id;date;amount;currency;ref",
    "bad_id;2026-02-30;12;sgd;x",
    "p-1;2026-03-31",
  ].join("\n");
  const { errors, total } = failure(importStatement(statement, CURRENCIES, TODAY));
  assert.deepEqual(errors, [
    { line: 1, field: null, code: "header", text: "id;date;amount;currency;ref" },
  ]);
  assert.equal(total, 1);
});

test("[unhappy-1] a header that differs only in case is a header error", () => {
  const statement = ["ID;DATE;AMOUNT;CURRENCY;REFERENCE", "p-1;2026-03-31;120.50;SGD;March payout"].join("\n");
  const { errors, total } = failure(importStatement(statement, CURRENCIES, TODAY));
  assert.deepEqual(errors, [
    { line: 1, field: null, code: "header", text: "ID;DATE;AMOUNT;CURRENCY;REFERENCE" },
  ]);
  assert.equal(total, 1);
});

test("[unhappy-1] an empty statement is a header error on line 1", () => {
  const { errors, total } = failure(importStatement("", CURRENCIES, TODAY));
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 1);
  assert.equal(errors[0].field, null);
  assert.equal(errors[0].code, "header");
  assert.equal(total, 1);
});

test("[unhappy-1] the exact header followed by a valid line is not a header error", () => {
  const result = importStatement([HEADER, "p-1;2026-03-31;120.50;SGD;March payout"].join("\n"), CURRENCIES, TODAY);
  assert.equal(result.ok, true);
});
