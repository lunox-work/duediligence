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

// boundary-2: Windows line endings and a byte-order mark

const ROWS = [
  "a-1;2026-03-31;0.29;SGD;first",
  "b-2;2024-02-29;1234567.89;USD;",
  "c-3;2026-04-15;7.05;SGD;last one",
];

// Extends public "[boundary-2] a statement with \r\n line endings and a byte-order mark imports as the same
// statement without them": each on its own, with a final \r\n, more lines.
test("[boundary-2] \\r\\n endings alone, a byte-order mark alone, and both with a final \\r\\n import the same payouts", () => {
  const expected = [
    { id: "a-1", date: "2026-03-31", amount: 29, currency: "SGD", reference: "first" },
    { id: "b-2", date: "2024-02-29", amount: 123456789, currency: "USD", reference: "" },
    { id: "c-3", date: "2026-04-15", amount: 705, currency: "SGD", reference: "last one" },
  ];
  for (const statement of [
    [HEADER, ...ROWS].join("\r\n"),
    "﻿" + [HEADER, ...ROWS].join("\n"),
    "﻿" + [HEADER, ...ROWS].join("\r\n") + "\r\n",
    [HEADER, ...ROWS].join("\r\n") + "\r\n",
  ]) {
    assert.deepEqual(payouts(importStatement(statement, CURRENCIES, TODAY)), expected);
  }
});

// Extends public "[boundary-2] the text of an error in a \r\n statement carries no \r": an error on every
// field that can end a line, and on whole lines.
test("[boundary-2] errors in a \\r\\n statement carry no \\r in field or line text", () => {
  const statement =
    "﻿" +
    [
      HEADER,
      "p-1;2026-03-31;1.00;SGD;bad\u0001",
      "p-2;2026-03-31;1.00;SGD;x;y",
      "p-3;2026-03-31;1.00;SGD",
      "p-4;2026-03-31;1.00;EUR;ok",
      "p-1;2026-04-16;1.00;SGD;",
    ].join("\r\n");
  const { errors, total } = failure(importStatement(statement, CURRENCIES, TODAY));
  assert.deepEqual(errors, [
    { line: 2, field: "reference", code: "reference", text: "bad\u0001" },
    { line: 3, field: null, code: "fields", text: "p-2;2026-03-31;1.00;SGD;x;y" },
    { line: 4, field: null, code: "fields", text: "p-3;2026-03-31;1.00;SGD" },
    { line: 5, field: "currency", code: "currency", text: "EUR" },
    { line: 6, field: "id", code: "duplicate", text: "p-1" },
    { line: 6, field: "date", code: "future", text: "2026-04-16" },
  ]);
  assert.equal(total, 6);
  for (const e of errors) assert.ok(!e.text.includes("\r"));
});

// Extends public "[boundary-2] the text of an error in a \r\n statement carries no \r": the same statement
// with \n endings gives the same errors.
test("[boundary-2] a failing statement gives the same errors with \\r\\n endings and a byte-order mark as without", () => {
  const rows = ["p-1;2026-03-31;120.5;SGD;", "p-1;2026-03-31;1.00;SGD;r".padEnd(200, "r"), "x;y", ""];
  const plain = failure(importStatement([HEADER, ...rows].join("\n"), CURRENCIES, TODAY));
  const windows = failure(importStatement("﻿" + [HEADER, ...rows].join("\r\n"), CURRENCIES, TODAY));
  assert.deepEqual(windows, plain);
  assert.deepEqual(plain.errors.map((e) => [e.line, e.code]), [
    [2, "amount"],
    [3, "duplicate"],
    [3, "reference"],
    [4, "fields"],
  ]);
});

// Extends public "[boundary-2] a statement with \r\n line endings and a byte-order mark imports as the same
// statement without them": the byte-order mark is not part of the header.
test("[boundary-2] a header after a byte-order mark is the exact header", () => {
  const result = importStatement("﻿" + HEADER + "\n" + ROWS[0], CURRENCIES, TODAY);
  assert.deepEqual(payouts(result).map((p) => p.id), ["a-1"]);
});

// boundary-3: A final newline is fine, an empty line is not

// Extends public "[boundary-3] an empty line between payout lines is a blank error on that line":
// an empty line right after the header, and several empty lines.
test("[boundary-3] each empty line is its own blank error, including right after the header", () => {
  const statement = [HEADER, "", "a;2026-03-31;1.00;SGD;x", "", "", "b;2026-03-31;1.00;SGD;y"].join("\n");
  const { errors, total } = failure(importStatement(statement, CURRENCIES, TODAY));
  assert.deepEqual(errors, [
    { line: 2, field: null, code: "blank", text: "" },
    { line: 4, field: null, code: "blank", text: "" },
    { line: 5, field: null, code: "blank", text: "" },
  ]);
  assert.equal(total, 3);
});

// Extends public "[boundary-3] two newlines at the end make a blank error on the empty line": more newlines at the end.
test("[boundary-3] three newlines at the end make blank errors on the two empty lines", () => {
  const statement = [HEADER, "a;2026-03-31;1.00;SGD;x"].join("\n") + "\n\n\n";
  const { errors, total } = failure(importStatement(statement, CURRENCIES, TODAY));
  assert.deepEqual(errors, [
    { line: 3, field: null, code: "blank", text: "" },
    { line: 4, field: null, code: "blank", text: "" },
  ]);
  assert.equal(total, 2);
});

// Extends public "[boundary-3] two newlines at the end make a blank error on the empty line": \r\n endings.
test("[boundary-3] two \\r\\n at the end make a blank error with empty text", () => {
  const statement = [HEADER, "a;2026-03-31;1.00;SGD;x", "b;2026-03-31;1.00;SGD;y"].join("\r\n") + "\r\n\r\n";
  const { errors, total } = failure(importStatement(statement, CURRENCIES, TODAY));
  assert.deepEqual(errors, [{ line: 4, field: null, code: "blank", text: "" }]);
  assert.equal(total, 1);
});

// Extends public "[boundary-3] two newlines at the end make a blank error on the empty line":
// the header followed by an empty line.
test("[boundary-3] the header followed by two newlines is a blank error on line 2", () => {
  const { errors, total } = failure(importStatement(HEADER + "\n\n", CURRENCIES, TODAY));
  assert.deepEqual(errors, [{ line: 2, field: null, code: "blank", text: "" }]);
  assert.equal(total, 1);
});

// Extends public "[boundary-3] one newline after the last line is not an error": a failing statement
// with a final newline reports no extra error for it.
test("[boundary-3] a final newline adds no error to a statement with other errors", () => {
  const statement = [HEADER, "a;2026-03-31;1.00;EUR;x", "b;2026-03-31;1.00;SGD;y"].join("\n") + "\n";
  const { errors, total } = failure(importStatement(statement, CURRENCIES, TODAY));
  assert.deepEqual(errors, [{ line: 2, field: "currency", code: "currency", text: "EUR" }]);
  assert.equal(total, 1);
});

// Extends public "[boundary-3] one newline after the last line is not an error": more lines, with \r\n.
test("[boundary-3] a final \\r\\n after many lines is not an error", () => {
  const result = importStatement([HEADER, ...lines(30)].join("\r\n") + "\r\n", CURRENCIES, TODAY);
  const imported = payouts(result);
  assert.equal(imported.length, 30);
  assert.equal(imported[29].id, "p-30");
  assert.equal(imported[29].reference, "ref 30");
});

// boundary-4: Errors are capped and counted

// Extends public "[boundary-4] with more than 100 errors the first 100 are listed in order and the total is reported":
// several errors per line, so the cap falls inside a line.
test("[boundary-4] the cap falls inside a line with several errors and the total counts them all", () => {
  const rows: string[] = [];
  for (let i = 1; i <= 40; i++) rows.push(`p-${i};2026-02-30;1;EUR;r`);
  const { errors, total } = failure(importStatement([HEADER, ...rows].join("\n"), CURRENCIES, TODAY));
  assert.equal(total, 120);
  assert.equal(errors.length, 100);
  const expected: StatementError[] = [];
  for (let line = 2; expected.length < 100; line++) {
    expected.push({ line, field: "date", code: "date", text: "2026-02-30" });
    expected.push({ line, field: "amount", code: "amount", text: "1" });
    expected.push({ line, field: "currency", code: "currency", text: "EUR" });
  }
  assert.deepEqual(errors, expected.slice(0, 100));
  assert.deepEqual(errors[99], { line: 35, field: "date", code: "date", text: "2026-02-30" });
});

// Extends public "[boundary-4] with more than 100 errors the first 100 are listed in order and the total is reported":
// many more errors, of mixed kinds, with valid lines between.
test("[boundary-4] thousands of mixed errors are capped at the first 100 and all counted", () => {
  const rows: string[] = [];
  for (let i = 1; i <= 3000; i++) {
    if (i % 3 === 1) rows.push(`q-${i};2026-03-31;1.00;SGD;ok`);
    else if (i % 3 === 2) rows.push(`q-${i - 1};2026-03-31;0.00;SGD;x`);
    else rows.push(`q-${i};2026-03-31;1.00;SGD`);
  }
  const { errors, total } = failure(importStatement([HEADER, ...rows].join("\n"), CURRENCIES, TODAY));
  // Lines i % 3 === 2: duplicate + amount (2 errors); i % 3 === 0: fields (1 error).
  assert.equal(total, 1000 + 1000 * 2);
  assert.equal(errors.length, 100);
  const expected: StatementError[] = [];
  for (let i = 1; expected.length < 100; i++) {
    const line = i + 1;
    if (i % 3 === 0) expected.push({ line, field: null, code: "fields", text: rows[i - 1] });
    else if (i % 3 === 2) {
      expected.push({ line, field: "id", code: "duplicate", text: `q-${i - 1}` });
      expected.push({ line, field: "amount", code: "amount", text: "0.00" });
    }
  }
  assert.deepEqual(errors, expected.slice(0, 100));
});

// Extends public "[boundary-4] exactly 100 errors are all listed and 101 errors list 100": 99 and 102 errors,
// with blank lines counted.
test("[boundary-4] 99 errors are all listed; 102 errors including blank lines list 100 and count 102", () => {
  const ninetyNine = failure(
    importStatement([HEADER, ...lines(99, () => "EUR")].join("\n"), CURRENCIES, TODAY),
  );
  assert.equal(ninetyNine.errors.length, 99);
  assert.equal(ninetyNine.total, 99);

  const statement = [HEADER, "", ...lines(100, () => "EUR")].join("\n") + "\n\n";
  const capped = failure(importStatement(statement, CURRENCIES, TODAY));
  assert.equal(capped.total, 102);
  assert.equal(capped.errors.length, 100);
  assert.deepEqual(capped.errors[0], { line: 2, field: null, code: "blank", text: "" });
  assert.deepEqual(capped.errors[1], { line: 3, field: "currency", code: "currency", text: "EUR" });
  assert.deepEqual(capped.errors[99], { line: 101, field: "currency", code: "currency", text: "EUR" });
});

// unhappy-9: Too many lines

// Extends public "[unhappy-9] more than 10000 payout lines is one too-many error on line 10002 and nothing else":
// far more lines, all of them bad.
test("[unhappy-9] 15000 bad payout lines are still one too-many error on line 10002", () => {
  const statement = [HEADER, ...lines(15000, () => "EUR")].join("\n");
  const { errors, total } = failure(importStatement(statement, CURRENCIES, TODAY));
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 10002);
  assert.equal(errors[0].field, null);
  assert.equal(errors[0].code, "too-many");
  assert.equal(total, 1);
});

// Extends public "[unhappy-9] more than 10000 payout lines is one too-many error on line 10002 and nothing else":
// all lines valid, \r\n endings and a final newline.
test("[unhappy-9] 10001 valid payout lines with \\r\\n endings are one too-many error on line 10002", () => {
  const statement = "﻿" + [HEADER, ...lines(10001)].join("\r\n") + "\r\n";
  const { errors, total } = failure(importStatement(statement, CURRENCIES, TODAY));
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 10002);
  assert.equal(errors[0].field, null);
  assert.equal(errors[0].code, "too-many");
  assert.equal(total, 1);
});

// Extends public "[unhappy-9] exactly 10000 payout lines import as usual": a final newline does not make a 10001st line.
test("[unhappy-9] exactly 10000 payout lines and a final newline import as usual", () => {
  const imported = payouts(importStatement([HEADER, ...lines(10000)].join("\n") + "\n", CURRENCIES, TODAY));
  assert.equal(imported.length, 10000);
  assert.equal(imported[9999].id, "p-10000");
});

// Extends public "[unhappy-9] exactly 10000 payout lines are checked as usual": many errors among
// exactly 10000 lines are capped and counted, not replaced by too-many.
test("[unhappy-9] exactly 10000 payout lines with many errors report them as usual", () => {
  const statement = [HEADER, ...lines(10000, (i) => (i % 2 === 0 ? "EUR" : "SGD"))].join("\n");
  const { errors, total } = failure(importStatement(statement, CURRENCIES, TODAY));
  assert.equal(total, 5000);
  assert.equal(errors.length, 100);
  assert.deepEqual(errors[0], { line: 3, field: "currency", code: "currency", text: "EUR" });
  assert.deepEqual(errors[99], { line: 201, field: "currency", code: "currency", text: "EUR" });
});
