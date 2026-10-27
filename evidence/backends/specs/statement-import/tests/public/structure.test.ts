import { test } from "node:test";
import assert from "node:assert/strict";
import { importStatement, type StatementError } from "../../src/index.js";

const HEADER = "id;date;amount;currency;reference";
const TODAY = "2026-03-31";
const VALID_LINE = "p-1;2026-03-31;120.50;SGD;March payout";
const PAYOUT = { id: "p-1", date: TODAY, amount: 12050, currency: "SGD", reference: "March payout" };

function checkErrors(statement: string, errors: StatementError[]): void {
  assert.deepEqual(importStatement(statement, new Set(["SGD"]), TODAY), {
    ok: false,
    errors,
    total: errors.length,
  });
}

test("[unhappy-1] reports only the wrong header despite invalid later lines", () => {
  const header = "date;id;amount;currency;reference";
  checkErrors(`${header}\n\n;bad;0.00;XXX;\nwrong`, [{ line: 1, field: null, code: "header", text: header }]);
});

test("[unhappy-1] reports a header error for an empty statement", () => {
  checkErrors("", [{ line: 1, field: null, code: "header", text: "" }]);
});

test("[unhappy-1] requires the header exactly including case field count and spaces", () => {
  for (const header of ["Id;date;amount;currency;reference", `${HEADER} `, ` ${HEADER}`, `${HEADER};`, "id;date;amount;currency", ""]) {
    checkErrors(`${header}\n${VALID_LINE}`, [{ line: 1, field: null, code: "header", text: header }]);
  }
});

test("[unhappy-2] reports a four-field line without checking its invalid fields", () => {
  const line = ";bad;0.00;XXX";
  checkErrors(`${HEADER}\n${line}`, [{ line: 2, field: null, code: "fields", text: line }]);
});

test("[unhappy-2] reports a six-field line including its trailing empty field", () => {
  const line = `${VALID_LINE};`;
  checkErrors(`${HEADER}\n${line}`, [{ line: 2, field: null, code: "fields", text: line }]);
});

test("[unhappy-2] continues checking later lines after a field-count error", () => {
  checkErrors(`${HEADER}\nwrong\np-2;2026-03-31;0.00;SGD;`, [
    { line: 2, field: null, code: "fields", text: "wrong" },
    { line: 3, field: "amount", code: "amount", text: "0.00" },
  ]);
});

test("[boundary-1] reports date amount and currency errors together in field order", () => {
  checkErrors(`${HEADER}\np-1;2026-02-30;0.00;XXX;`, [
    { line: 2, field: "date", code: "date", text: "2026-02-30" },
    { line: 2, field: "amount", code: "amount", text: "0.00" },
    { line: 2, field: "currency", code: "currency", text: "XXX" },
  ]);
});

test("[boundary-1] checks every field and orders errors by line while importing nothing", () => {
  const reference = "r".repeat(141);
  checkErrors(`${HEADER}\nbad_id;2026-04-01;-1.00;XXX;${reference}\np-2;bad;0.00;sgd;\n${VALID_LINE}`, [
    { line: 2, field: "id", code: "id", text: "bad_id" },
    { line: 2, field: "date", code: "future", text: "2026-04-01" },
    { line: 2, field: "amount", code: "amount", text: "-1.00" },
    { line: 2, field: "currency", code: "currency", text: "XXX" },
    { line: 2, field: "reference", code: "reference", text: reference },
    { line: 3, field: "date", code: "date", text: "bad" },
    { line: 3, field: "amount", code: "amount", text: "0.00" },
    { line: 3, field: "currency", code: "currency", text: "sgd" },
  ]);
});

test("[boundary-2] accepts a leading BOM with Windows line endings and a final newline", () => {
  const normalized = `${HEADER}\n${VALID_LINE}`;
  const windows = `\uFEFF${HEADER}\r\n${VALID_LINE}\r\n`;
  const expected = { ok: true, payouts: [PAYOUT] };
  assert.deepEqual(importStatement(normalized, new Set(["SGD"]), TODAY), expected);
  assert.deepEqual(importStatement(windows, new Set(["SGD"]), TODAY), expected);
});

test("[boundary-2] accepts BOM and Windows endings independently", () => {
  for (const statement of [`\uFEFF${HEADER}\n${VALID_LINE}`, `${HEADER}\r\n${VALID_LINE}`]) {
    assert.deepEqual(importStatement(statement, new Set(["SGD"]), TODAY), { ok: true, payouts: [PAYOUT] });
  }
});

test("[boundary-2] omits carriage returns from offending field and line text", () => {
  const reference = "r".repeat(141);
  checkErrors(`\uFEFF${HEADER}\r\np-1;2026-03-31;0.00;XXX;${reference}\r\nwrong\r\n`, [
    { line: 2, field: "amount", code: "amount", text: "0.00" },
    { line: 2, field: "currency", code: "currency", text: "XXX" },
    { line: 2, field: "reference", code: "reference", text: reference },
    { line: 3, field: null, code: "fields", text: "wrong" },
  ]);
});

test("[boundary-3] accepts one final newline after the last payout", () => {
  assert.deepEqual(importStatement(`${HEADER}\n${VALID_LINE}\n`, new Set(["SGD"]), TODAY), {
    ok: true,
    payouts: [PAYOUT],
  });
});

test("[boundary-3] reports an interior empty line and continues to later errors", () => {
  checkErrors(`${HEADER}\n${VALID_LINE}\n\np-2;2026-03-31;0.00;SGD;`, [
    { line: 3, field: null, code: "blank", text: "" },
    { line: 4, field: "amount", code: "amount", text: "0.00" },
  ]);
});

test("[boundary-3] reports the empty line left by two final newlines", () => {
  checkErrors(`${HEADER}\n${VALID_LINE}\n\n`, [{ line: 3, field: null, code: "blank", text: "" }]);
});

test("[boundary-3] reports an empty first payout line with Windows endings", () => {
  checkErrors(`${HEADER}\r\n\r\n${VALID_LINE}\r\n`, [{ line: 2, field: null, code: "blank", text: "" }]);
});

test("[boundary-4] caps errors at 100 in field order but counts errors after the cap", () => {
  const lines = ["first;2026-03-31;0.00;SGD;"];
  const errors: StatementError[] = [{ line: 2, field: "amount", code: "amount", text: "0.00" }];
  const reference = "r".repeat(141);
  for (let index = 0; index < 21; index++) {
    const id = `bad_${index}`;
    const line = index + 3;
    lines.push(`${id};bad;0.00;XXX;${reference}`);
    errors.push(
      { line, field: "id", code: "id", text: id },
      { line, field: "date", code: "date", text: "bad" },
      { line, field: "amount", code: "amount", text: "0.00" },
      { line, field: "currency", code: "currency", text: "XXX" },
      { line, field: "reference", code: "reference", text: reference },
    );
  }
  assert.deepEqual(importStatement([HEADER, ...lines].join("\n"), new Set(["SGD"]), TODAY), {
    ok: false,
    errors: errors.slice(0, 100),
    total: 106,
  });
});

test("[boundary-4] returns all errors when there are exactly 100", () => {
  const lines: string[] = [];
  const errors: StatementError[] = [];
  for (let index = 0; index < 100; index++) {
    lines.push(`p-${index};2026-03-31;0.00;SGD;`);
    errors.push({ line: index + 2, field: "amount", code: "amount", text: "0.00" });
  }
  checkErrors([HEADER, ...lines].join("\n"), errors);
});

test("[boundary-4] truncates at the first error beyond 100", () => {
  const lines: string[] = [];
  const errors: StatementError[] = [];
  for (let index = 0; index < 101; index++) {
    lines.push(`p-${index};2026-03-31;0.00;SGD;`);
    if (index < 100) errors.push({ line: index + 2, field: "amount", code: "amount", text: "0.00" });
  }
  assert.deepEqual(importStatement([HEADER, ...lines].join("\n"), new Set(["SGD"]), TODAY), {
    ok: false,
    errors,
    total: 101,
  });
});

test("[unhappy-9] reports only too-many for 10001 payout lines despite earlier errors", () => {
  const lines = Array.from({ length: 10001 }, (_: unknown, index: number) => `p-${index};2026-03-31;1.00;SGD;`);
  lines[0] = "bad";
  const result = importStatement([HEADER, ...lines].join("\n"), new Set(["SGD"]), TODAY);
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("Expected the size limit to reject the statement");
  assert.equal(result.total, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].line, 10002);
  assert.equal(result.errors[0].field, null);
  assert.equal(result.errors[0].code, "too-many");
});

test("[unhappy-9] accepts exactly 10000 payout lines with one final newline", () => {
  const lines = Array.from({ length: 10000 }, (_: unknown, index: number) => `p-${index};2026-03-31;1.00;SGD;`);
  const payouts = Array.from({ length: 10000 }, (_: unknown, index: number) => ({
    id: `p-${index}`, date: TODAY, amount: 100, currency: "SGD", reference: "",
  }));
  assert.deepEqual(importStatement(`${[HEADER, ...lines].join("\n")}\n`, new Set(["SGD"]), TODAY), { ok: true, payouts });
});

test("[unhappy-9] validates the last payout when there are exactly 10000 lines", () => {
  const lines = Array.from({ length: 10000 }, (_: unknown, index: number) => `p-${index};2026-03-31;1.00;SGD;`);
  lines[9999] = "p-9999;2026-03-31;0.00;SGD;";
  checkErrors([HEADER, ...lines].join("\n"), [{ line: 10001, field: "amount", code: "amount", text: "0.00" }]);
});
