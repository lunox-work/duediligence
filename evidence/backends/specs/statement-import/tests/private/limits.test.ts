import { test } from "node:test";
import assert from "node:assert/strict";
import { importStatement, type StatementError } from "../../src/index.js";

const HEADER = "id;date;amount;currency;reference";
const TODAY = "2026-03-31";

function checkFailure(lines: string[], errors: StatementError[], total = errors.length): void {
  assert.deepEqual(importStatement([HEADER, ...lines].join("\n"), new Set(["SGD"]), TODAY), { ok: false, errors, total });
}

// Extends public: returns all errors when there are exactly 100.
test("[boundary-4] ninety-nine errors interleaved with valid rows are neither padded nor capped by line count", () => {
  const lines: string[] = [];
  const errors: StatementError[] = [];
  for (let i = 0; i < 99; i++) {
    lines.push(`valid-${i};${TODAY};1.00;SGD;`, `bad-${i};${TODAY};1.00;USD;`);
    errors.push({ line: i * 2 + 3, field: "currency", code: "currency", text: "USD" });
  }
  checkFailure(lines, errors);
});

// Extends public: returns all errors when there are exactly 100.
test("[boundary-4] exactly one hundred mixed blank and field errors are all retained", () => {
  const lines: string[] = [];
  const errors: StatementError[] = [];
  for (let i = 0; i < 25; i++) {
    const line = 2 + i * 3;
    lines.push(`bad-${i};bad;0.00;XXX;`, "", `valid-${i};${TODAY};1.00;SGD;`);
    errors.push(
      { line, field: "date", code: "date", text: "bad" },
      { line, field: "amount", code: "amount", text: "0.00" },
      { line, field: "currency", code: "currency", text: "XXX" },
      { line: line + 1, field: null, code: "blank", text: "" },
    );
  }
  checkFailure(lines, errors);
});

// Extends public: truncates at the first error beyond 100.
test("[boundary-4] the hundred-and-first error can be on a different field after twenty fully invalid rows", () => {
  const lines: string[] = [];
  const errors: StatementError[] = [];
  for (let i = 0; i < 20; i++) {
    const id = `invalid_${i}`;
    const reference = `r${"x".repeat(140)}`;
    lines.push(`${id};bad;0.00;XXX;${reference}`);
    errors.push(
      { line: i + 2, field: "id", code: "id", text: id },
      { line: i + 2, field: "date", code: "date", text: "bad" },
      { line: i + 2, field: "amount", code: "amount", text: "0.00" },
      { line: i + 2, field: "currency", code: "currency", text: "XXX" },
      { line: i + 2, field: "reference", code: "reference", text: reference },
    );
  }
  lines.push(`last;${TODAY};1.00;EUR;`);
  checkFailure(lines, errors, 101);
});

// Extends public: caps errors at 100 in field order but counts errors after the cap.
test("[boundary-4] a cap reached at the id still counts every remaining field on that same line", () => {
  const lines = Array.from({ length: 99 }, (_, i) => `broken-${i}`);
  const errors: StatementError[] = lines.map((text, i) => ({ line: i + 2, field: null, code: "fields", text }));
  const reference = "x".repeat(200);
  lines.push(`bad_id;bad;0.00;XXX;${reference}`);
  errors.push({ line: 101, field: "id", code: "id", text: "bad_id" });
  checkFailure(lines, errors, 104);
});

test("[boundary-4] duplicate and other validation continue hundreds of errors after truncation", () => {
  const lines = [`seed;${TODAY};1.00;SGD;`];
  const errors: StatementError[] = [];
  for (let i = 0; i < 101; i++) {
    const text = `broken-${i}`;
    lines.push(text);
    if (i < 100) errors.push({ line: i + 3, field: null, code: "fields", text });
  }
  for (let i = 0; i < 120; i++) lines.push(`seed;${TODAY};0.00;XXX;`);
  lines.push(`finish;${TODAY};1.00;SGD;`);
  checkFailure(lines, errors, 461);
});

test("[boundary-4] all ten thousand errors are counted at the maximum permitted statement size", () => {
  const lines = Array.from({ length: 10000 }, (_, i) => `p-${i};${TODAY};1.00;XXX;`);
  const errors: StatementError[] = Array.from({ length: 100 }, (_, i) => ({ line: i + 2, field: "currency", code: "currency", text: "XXX" }));
  checkFailure(lines, errors, 10000);
});

test("[boundary-4] fifty thousand field errors are counted without confusing error and payout limits", () => {
  const reference = "x".repeat(141);
  const lines = Array.from({ length: 10000 }, (_, i) => `bad_${i};bad;0.00;XXX;${reference}`);
  const errors: StatementError[] = [];
  for (let i = 0; i < 20; i++) {
    errors.push(
      { line: i + 2, field: "id", code: "id", text: `bad_${i}` },
      { line: i + 2, field: "date", code: "date", text: "bad" },
      { line: i + 2, field: "amount", code: "amount", text: "0.00" },
      { line: i + 2, field: "currency", code: "currency", text: "XXX" },
      { line: i + 2, field: "reference", code: "reference", text: reference },
    );
  }
  checkFailure(lines, errors, 50000);
});

// Extends public: reports only too-many for 10001 payout lines despite earlier errors.
test("[unhappy-9] substantially oversized statements return just too-many with CRLF and a final newline", () => {
  for (const count of [10002, 12345]) {
    const lines = Array.from({ length: count }, (_, i) => `p-${i};${TODAY};1.00;SGD;`);
    lines[0] = "bad_id;bad;0.00;XXX;\t";
    lines[400] = "";
    lines[10000] = "not;five;fields";
    const result = importStatement(`\uFEFF${[HEADER, ...lines].join("\r\n")}\r\n`, new Set(["SGD"]), TODAY);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("Expected the specified too-many result");
    assert.equal(result.total, 1);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].line, 10002);
    assert.equal(result.errors[0].field, null);
    assert.equal(result.errors[0].code, "too-many");
    // The spec does not prescribe which text to attach to this size error.
  }
});

test("[unhappy-9] too-many is returned for otherwise valid rows without a final newline", () => {
  const lines = Array.from({ length: 10001 }, (_, i) => `limit-${i};${TODAY};2.03;EUR;row ${i}`);
  const result = importStatement([HEADER, ...lines].join("\n"), new Set(["EUR"]), TODAY);
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("Expected the specified too-many result");
  assert.equal(result.total, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].line, 10002);
  assert.equal(result.errors[0].field, null);
  assert.equal(result.errors[0].code, "too-many");
});

// Extends public: accepts exactly 10000 payout lines with one final newline.
test("[unhappy-9] exactly ten thousand varied payouts import with BOM CRLF and descending ids", () => {
  const payouts = Array.from({ length: 10000 }, (_, i) => ({
    id: `v-${10000 - i}`, date: i % 2 ? "2024-02-29" : TODAY,
    amount: 201 + i % 99, currency: i % 2 ? "EUR" : "CAD", reference: i % 3 ? `payout ${i}` : "",
  }));
  const lines = payouts.map(p => `${p.id};${p.date};2.${String(p.amount % 100).padStart(2, "0")};${p.currency};${p.reference}`);
  assert.deepEqual(importStatement(`\uFEFF${[HEADER, ...lines].join("\r\n")}\r\n`, new Set(["EUR", "CAD"]), TODAY), { ok: true, payouts });
});

test("[unhappy-9] exactly ten thousand rows also import without a trailing newline", () => {
  const payouts = Array.from({ length: 10000 }, (_, i) => ({ id: `n-${i}`, date: TODAY, amount: 29, currency: "SGD", reference: "" }));
  const lines = payouts.map(p => `${p.id};${TODAY};0.29;SGD;`);
  assert.deepEqual(importStatement([HEADER, ...lines].join("\n"), new Set(["SGD"]), TODAY), { ok: true, payouts });
});

// Extends public: validates the last payout when there are exactly 10000 lines.
test("[unhappy-9] the last permitted row gets all five errors while earlier problems remain ordered", () => {
  const lines = Array.from({ length: 10000 }, (_, i) => `p-${i};${TODAY};1.00;SGD;`);
  lines[0] = "p-0;bad;1.00;SGD;";
  const reference = "r".repeat(142);
  lines[9999] = `p-0;2026-04-01;-2.00;XXX;${reference}`;
  checkFailure(lines, [
    { line: 2, field: "date", code: "date", text: "bad" },
    { line: 10001, field: "id", code: "duplicate", text: "p-0" },
    { line: 10001, field: "date", code: "future", text: "2026-04-01" },
    { line: 10001, field: "amount", code: "amount", text: "-2.00" },
    { line: 10001, field: "currency", code: "currency", text: "XXX" },
    { line: 10001, field: "reference", code: "reference", text: reference },
  ]);
});

test("[unhappy-9] field-count validation applies to the last permitted row with a final CRLF", () => {
  const lines = Array.from({ length: 10000 }, (_, i) => `p-${i};${TODAY};1.00;SGD;`);
  const text = "last;bad;0.00;XXX;\t;extra";
  lines[9999] = text;
  assert.deepEqual(importStatement(`${[HEADER, ...lines].join("\r\n")}\r\n`, new Set(["SGD"]), TODAY), {
    ok: false, errors: [{ line: 10001, field: null, code: "fields", text }], total: 1,
  });
});
