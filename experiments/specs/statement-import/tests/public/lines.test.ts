import { test } from "node:test";
import assert from "node:assert/strict";
import { importStatement } from "../../src/index.js";
import type { ErrorCode, FieldName, ImportResult, Payout, StatementError } from "../../src/index.js";

const HEADER = "id;date;amount;currency;reference";
const CURRENCIES: ReadonlySet<string> = new Set(["SGD", "USD"]);
const TODAY = "2026-04-15";

/** A valid payout line, with the given fields replaced. */
function row(fields: Partial<Record<FieldName, string>> = {}): string {
  return [
    fields.id ?? "p-1",
    fields.date ?? "2026-03-31",
    fields.amount ?? "120.50",
    fields.currency ?? "SGD",
    fields.reference ?? "March payout",
  ].join(";");
}

function run(...lines: string[]): ImportResult {
  return importStatement([HEADER, ...lines].join("\n"), CURRENCIES, TODAY);
}

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

/** Asserts the statement fails with exactly one error on line 2. */
function oneError(result: ImportResult, field: FieldName | null, code: ErrorCode, text: string): void {
  const { errors, total } = failure(result);
  assert.deepEqual(errors, [{ line: 2, field, code, text }]);
  assert.equal(total, 1);
}

// happy-1: A correct statement imports

test("[happy-1] a correct statement imports its payouts in line order", () => {
  const result = run(
    "p-1;2026-03-31;120.50;SGD;March payout",
    "Q-2;2026-04-01;7.05;USD;April advance",
  );
  assert.deepEqual(payouts(result), [
    { id: "p-1", date: "2026-03-31", amount: 12050, currency: "SGD", reference: "March payout" },
    { id: "Q-2", date: "2026-04-01", amount: 705, currency: "USD", reference: "April advance" },
  ]);
});

test("[happy-1] an empty reference field imports as an empty reference", () => {
  assert.deepEqual(payouts(run("p-1;2026-03-31;120.50;SGD;")), [
    { id: "p-1", date: "2026-03-31", amount: 12050, currency: "SGD", reference: "" },
  ]);
});

// unhappy-2: A line with the wrong number of fields

test("[unhappy-2] a line with four fields is a fields error carrying the whole line", () => {
  oneError(run("p-1;2026-03-31;120.50;SGD"), null, "fields", "p-1;2026-03-31;120.50;SGD");
});

test("[unhappy-2] a line with six fields is a fields error carrying the whole line", () => {
  const line = "p-1;2026-03-31;120.50;SGD;March;payout";
  oneError(run(line), null, "fields", line);
});

test("[unhappy-2] the fields of a line with the wrong number of fields are not checked further", () => {
  const line = "bad_id;2026-02-30;12;sgd";
  oneError(run(line), null, "fields", line);
});

// unhappy-3: A bad id

test("[unhappy-3] an id with a character other than letters, digits and - is an id error", () => {
  oneError(run(row({ id: "p_1" })), "id", "id", "p_1");
});

test("[unhappy-3] an empty id is an id error", () => {
  oneError(run(row({ id: "" })), "id", "id", "");
});

test("[unhappy-3] an id of 32 characters is accepted and one of 33 is an id error", () => {
  const id32 = "A-" + "9".repeat(30);
  assert.equal(payouts(run(row({ id: id32 })))[0].id, id32);
  const id33 = id32 + "x";
  oneError(run(row({ id: id33 })), "id", "id", id33);
});

// unhappy-4: A repeated id

test("[unhappy-4] the second line with a repeated id has a duplicate error and the first does not", () => {
  const { errors, total } = failure(
    run(row({ id: "p-1" }), row({ id: "p-1", reference: "again" })),
  );
  assert.deepEqual(errors, [{ line: 3, field: "id", code: "duplicate", text: "p-1" }]);
  assert.equal(total, 1);
});

test("[unhappy-4] ids differing only in case are not duplicates", () => {
  const result = payouts(run(row({ id: "P-1" }), row({ id: "p-1" })));
  assert.deepEqual(
    result.map((p) => p.id),
    ["P-1", "p-1"],
  );
});

// unhappy-5: A bad date

test("[unhappy-5] a date that is not a day in the calendar is a date error", () => {
  oneError(run(row({ date: "2026-02-30" })), "date", "date", "2026-02-30");
});

test("[unhappy-5] February 29th of a non-leap year is a date error", () => {
  oneError(run(row({ date: "2025-02-29" })), "date", "date", "2025-02-29");
});

test("[unhappy-5] a date not in YYYY-MM-DD form is a date error", () => {
  oneError(run(row({ date: "2026-3-31" })), "date", "date", "2026-3-31");
  oneError(run(row({ date: "31/03/2026" })), "date", "date", "31/03/2026");
});

test("[unhappy-5] February 29th of a leap year is accepted", () => {
  assert.equal(payouts(run(row({ date: "2024-02-29" })))[0].date, "2024-02-29");
});

test("[unhappy-5] a date after today is a future error", () => {
  oneError(run(row({ date: "2026-04-16" })), "date", "future", "2026-04-16");
});

test("[unhappy-5] a date equal to today is accepted", () => {
  assert.equal(payouts(run(row({ date: TODAY })))[0].date, TODAY);
});

// unhappy-6: A bad amount

test("[unhappy-6] an amount without exactly two decimal digits is an amount error", () => {
  oneError(run(row({ amount: "120.5" })), "amount", "amount", "120.5");
  oneError(run(row({ amount: "120" })), "amount", "amount", "120");
  oneError(run(row({ amount: "120.500" })), "amount", "amount", "120.500");
});

test("[unhappy-6] an amount of 0.00 is an amount error", () => {
  oneError(run(row({ amount: "0.00" })), "amount", "amount", "0.00");
});

test("[unhappy-6] an amount with a sign, a space or a thousands separator is an amount error", () => {
  for (const amount of ["-1.00", "+1.00", " 1.00", "1 000.00", "1,000.00"]) {
    oneError(run(row({ amount })), "amount", "amount", amount);
  }
});

test("[unhappy-6] 0.01 is accepted as 1 cent and 1234567.89 as 123456789 cents", () => {
  const result = payouts(run(row({ id: "a", amount: "0.01" }), row({ id: "b", amount: "1234567.89" })));
  assert.deepEqual(
    result.map((p) => p.amount),
    [1, 123456789],
  );
});

// unhappy-7: A bad currency

test("[unhappy-7] a currency not in the accepted set is a currency error", () => {
  oneError(run(row({ currency: "EUR" })), "currency", "currency", "EUR");
});

test("[unhappy-7] currency comparison is exact: sgd is not SGD", () => {
  oneError(run(row({ currency: "sgd" })), "currency", "currency", "sgd");
});

// unhappy-8: A bad reference

test("[unhappy-8] a reference longer than 140 characters is a reference error", () => {
  const reference = "r".repeat(141);
  oneError(run(row({ reference })), "reference", "reference", reference);
});

test("[unhappy-8] a reference holding a character whose code is below 32 is a reference error", () => {
  oneError(run(row({ reference: "March\tpayout" })), "reference", "reference", "March\tpayout");
  oneError(run(row({ reference: "x\u001fy" })), "reference", "reference", "x\u001fy");
});

test("[unhappy-8] a reference of exactly 140 characters is accepted", () => {
  const reference = "r".repeat(140);
  assert.equal(payouts(run(row({ reference })))[0].reference, reference);
});

test("[unhappy-8] a reference may be empty", () => {
  assert.equal(payouts(run(row({ reference: "" })))[0].reference, "");
});

// boundary-1: One line, several errors

test("[boundary-1] a line with a wrong date, amount and currency has three errors in field order", () => {
  const { errors, total } = failure(
    run(row({ date: "2026-02-30", amount: "12", currency: "sgd" })),
  );
  assert.deepEqual(errors, [
    { line: 2, field: "date", code: "date", text: "2026-02-30" },
    { line: 2, field: "amount", code: "amount", text: "12" },
    { line: 2, field: "currency", code: "currency", text: "sgd" },
  ]);
  assert.equal(total, 3);
});

test("[boundary-1] errors on lines 2 and 3 are listed with line 2's first", () => {
  const { errors, total } = failure(
    run(row({ id: "a", currency: "EUR" }), row({ id: "b_", reference: "x\u0001" })),
  );
  assert.deepEqual(errors, [
    { line: 2, field: "currency", code: "currency", text: "EUR" },
    { line: 3, field: "id", code: "id", text: "b_" },
    { line: 3, field: "reference", code: "reference", text: "x\u0001" },
  ]);
  assert.equal(total, 3);
});

test("[boundary-1] an error on one line does not stop the lines after it being checked", () => {
  const { errors, total } = failure(
    run(row({ id: "a", amount: "0.00" }), row({ id: "b" }), row({ id: "c", date: "2026-04-16" })),
  );
  assert.deepEqual(errors, [
    { line: 2, field: "amount", code: "amount", text: "0.00" },
    { line: 4, field: "date", code: "future", text: "2026-04-16" },
  ]);
  assert.equal(total, 2);
});
