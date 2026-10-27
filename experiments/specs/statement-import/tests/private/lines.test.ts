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

// Extends public "[happy-1] a correct statement imports its payouts in line order": more lines, other values.
test("[happy-1] a correct statement of several lines imports every payout in line order", () => {
  const result = run(
    "zz-9;2026-04-15;0.29;USD;first",
    "A;2024-02-29;1.15;SGD;  spaced  ",
    "12345;2000-01-01;4.35;SGD;",
    "---;2026-01-31;10.00;USD;café \u007f ~",
    "aB-3;2025-12-31;007.05;SGD;x",
  );
  assert.deepEqual(payouts(result), [
    { id: "zz-9", date: "2026-04-15", amount: 29, currency: "USD", reference: "first" },
    { id: "A", date: "2024-02-29", amount: 115, currency: "SGD", reference: "  spaced  " },
    { id: "12345", date: "2000-01-01", amount: 435, currency: "SGD", reference: "" },
    { id: "---", date: "2026-01-31", amount: 1000, currency: "USD", reference: "café \u007f ~" },
    { id: "aB-3", date: "2025-12-31", amount: 705, currency: "SGD", reference: "x" },
  ]);
});

// Extends public "[happy-1] a correct statement imports its payouts in line order": amounts a
// floating-point conversion gets wrong must come out as exact whole cents.
test("[happy-1] amounts convert to exact whole numbers of cents", () => {
  const amounts = ["0.29", "1.15", "4.35", "8.20", "19.99", "0.07", "1005.55", "9999999.99", "10000000.00"];
  const expected = [29, 115, 435, 820, 1999, 7, 100555, 999999999, 1000000000];
  const result = run(...amounts.map((amount, i) => row({ id: `a${i}`, amount })));
  const got = payouts(result).map((p) => p.amount);
  assert.deepEqual(got, expected);
  for (const amount of got) assert.ok(Number.isInteger(amount));
});

// Extends public "[happy-1] a correct statement imports its payouts in line order": currencies come
// from the set passed in, not from a fixed list.
test("[happy-1] currencies accepted are those of the set passed in", () => {
  const result = importStatement(
    [HEADER, row({ id: "a", currency: "EUR" }), row({ id: "b", currency: "JPY" })].join("\n"),
    new Set(["EUR", "JPY"]),
    TODAY,
  );
  assert.deepEqual(
    payouts(result).map((p) => p.currency),
    ["EUR", "JPY"],
  );
});

// Extends public "[happy-1] an empty reference field imports as an empty reference": several lines.
test("[happy-1] several lines with empty references each import an empty reference", () => {
  const result = run("a;2026-03-31;1.00;SGD;", "b;2026-03-30;2.00;USD;", "c;2026-03-29;3.00;SGD;");
  assert.deepEqual(
    payouts(result).map((p) => [p.id, p.reference]),
    [
      ["a", ""],
      ["b", ""],
      ["c", ""],
    ],
  );
});

// unhappy-2: A line with the wrong number of fields

// Extends public "[unhappy-2] a line with four fields is a fields error carrying the whole line": other counts.
test("[unhappy-2] lines with one, two, three, seven or ten fields are fields errors carrying the whole line", () => {
  for (const line of [
    "p-1",
    "p-1;2026-03-31",
    "p-1;2026-03-31;1.00",
    "p-1;2026-03-31;1.00;SGD;a;b;c",
    ";;;;;;;;;",
  ]) {
    oneError(run(line), null, "fields", line);
  }
});

// Extends public "[unhappy-2] the fields of a line with the wrong number of fields are not checked further":
// six fields, every one wrong.
test("[unhappy-2] a six-field line of bad fields has only the fields error", () => {
  const line = "x_y;2026-13-01;-1;eur;a\u0001;extra";
  oneError(run(line), null, "fields", line);
});

// Extends public "[unhappy-2] a line with six fields is a fields error carrying the whole line": among other lines.
test("[unhappy-2] fields errors on several lines are each reported, other lines still checked", () => {
  const { errors, total } = failure(
    run(row({ id: "a" }), "b;2026-03-31;1.00;SGD", row({ id: "c", currency: "EUR" }), "d;2026-03-31;1.00;SGD;x;y"),
  );
  assert.deepEqual(errors, [
    { line: 3, field: null, code: "fields", text: "b;2026-03-31;1.00;SGD" },
    { line: 4, field: "currency", code: "currency", text: "EUR" },
    { line: 5, field: null, code: "fields", text: "d;2026-03-31;1.00;SGD;x;y" },
  ]);
  assert.equal(total, 3);
});

// Extends public "[unhappy-2] a line with four fields is a fields error carrying the whole line":
// a line of five empty fields has the right count, so its fields are checked.
test("[unhappy-2] a line of five empty fields is not a fields error; its fields are checked", () => {
  const { errors, total } = failure(run(";;;;"));
  assert.deepEqual(errors, [
    { line: 2, field: "id", code: "id", text: "" },
    { line: 2, field: "date", code: "date", text: "" },
    { line: 2, field: "amount", code: "amount", text: "" },
    { line: 2, field: "currency", code: "currency", text: "" },
  ]);
  assert.equal(total, 4);
});

// unhappy-3: A bad id

// Extends public "[unhappy-3] an id with a character other than letters, digits and - is an id error": other characters.
test("[unhappy-3] ids with spaces, dots, slashes or other symbols are id errors", () => {
  for (const id of ["p.1", "p 1", " p-1", "p-1 ", "p/1", "p+1", "p@1", "p:1", "p#1", "p\u00001", "(p1)", "p_"]) {
    oneError(run(row({ id })), "id", "id", id);
  }
});

// Extends public "[unhappy-3] an id of 32 characters is accepted and one of 33 is an id error": other lengths and letters.
test("[unhappy-3] ids of 1 to 32 letters, digits and - are accepted; 33 or more are id errors", () => {
  const accepted = ["a", "Z", "7", "-", "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef", "0123456789-0123456789-0123456789"];
  const result = run(...accepted.map((id, i) => row({ id, reference: `r${i}` })));
  assert.deepEqual(
    payouts(result).map((p) => p.id),
    accepted,
  );
  for (const id of ["a".repeat(33), "Z".repeat(40), "1".repeat(100)]) {
    oneError(run(row({ id })), "id", "id", id);
  }
});

// Extends public "[unhappy-3] an empty id is an id error": an empty id among other lines.
test("[unhappy-3] an empty id on a later line is an id error on that line", () => {
  const { errors, total } = failure(run(row({ id: "a" }), row({ id: "b" }), row({ id: "" })));
  assert.deepEqual(errors, [{ line: 4, field: "id", code: "id", text: "" }]);
  assert.equal(total, 1);
});

// unhappy-4: A repeated id

// Extends public "[unhappy-4] the second line with a repeated id has a duplicate error and the first does not":
// non-adjacent repeats and three occurrences.
test("[unhappy-4] every later line repeating an id is a duplicate, the first is not", () => {
  const { errors, total } = failure(
    run(
      row({ id: "x-1" }),
      row({ id: "y-2" }),
      row({ id: "x-1" }),
      row({ id: "z-3" }),
      row({ id: "y-2" }),
      row({ id: "x-1" }),
    ),
  );
  assert.deepEqual(errors, [
    { line: 4, field: "id", code: "duplicate", text: "x-1" },
    { line: 6, field: "id", code: "duplicate", text: "y-2" },
    { line: 7, field: "id", code: "duplicate", text: "x-1" },
  ]);
  assert.equal(total, 3);
});

// Extends public "[unhappy-4] ids differing only in case are not duplicates": other case pairs, and an exact repeat among them.
test("[unhappy-4] only exact repeats are duplicates", () => {
  const { errors, total } = failure(
    run(row({ id: "abc" }), row({ id: "ABC" }), row({ id: "Abc" }), row({ id: "abc-" }), row({ id: "ABC" })),
  );
  assert.deepEqual(errors, [{ line: 6, field: "id", code: "duplicate", text: "ABC" }]);
  assert.equal(total, 1);
});

// Extends public "[unhappy-4] the second line with a repeated id has a duplicate error and the first does not":
// the duplicate sits in field order with the line's other errors.
test("[unhappy-4] a duplicate id comes before the line's other field errors", () => {
  const { errors, total } = failure(
    run(row({ id: "p-1" }), row({ id: "p-1", date: "2026-04-31", currency: "EUR" })),
  );
  assert.deepEqual(errors, [
    { line: 3, field: "id", code: "duplicate", text: "p-1" },
    { line: 3, field: "date", code: "date", text: "2026-04-31" },
    { line: 3, field: "currency", code: "currency", text: "EUR" },
  ]);
  assert.equal(total, 3);
});

// Extends public "[unhappy-4] the second line with a repeated id has a duplicate error and the first does not":
// a duplicate is listed in line order with the errors of the lines around it.
test("[unhappy-4] a duplicate is listed in line order among other lines' errors", () => {
  const { errors, total } = failure(
    run(row({ id: "a", amount: "1" }), row({ id: "b" }), row({ id: "b" }), row({ id: "c", currency: "EUR" })),
  );
  assert.deepEqual(errors, [
    { line: 2, field: "amount", code: "amount", text: "1" },
    { line: 4, field: "id", code: "duplicate", text: "b" },
    { line: 5, field: "currency", code: "currency", text: "EUR" },
  ]);
  assert.equal(total, 3);
});

// Extends public "[unhappy-4] the second line with a repeated id has a duplicate error and the first does not":
// the first line having another error does not stop the second being a duplicate.
test("[unhappy-4] the repeat of an id whose first line has another error is still a duplicate", () => {
  const { errors, total } = failure(run(row({ id: "q", currency: "EUR" }), row({ id: "q" })));
  assert.deepEqual(errors, [
    { line: 2, field: "currency", code: "currency", text: "EUR" },
    { line: 3, field: "id", code: "duplicate", text: "q" },
  ]);
  assert.equal(total, 2);
});

// unhappy-5: A bad date

// Extends public "[unhappy-5] a date that is not a day in the calendar is a date error": days a lenient
// date parser rolls over into the next month.
test("[unhappy-5] days past the end of their month are date errors", () => {
  for (const date of ["2026-04-31", "2026-06-31", "2025-09-31", "2025-11-31", "2026-01-32", "2026-02-29", "2023-02-29", "1900-02-29"]) {
    oneError(run(row({ date })), "date", "date", date);
  }
});

// Extends public "[unhappy-5] a date not in YYYY-MM-DD form is a date error": other malformed dates.
test("[unhappy-5] malformed dates and out-of-range months or days are date errors", () => {
  for (const date of [
    "",
    "2026-13-01",
    "2026-00-10",
    "2026-04-00",
    "2026/03/31",
    "20260331",
    "26-03-31",
    "2026-03-1",
    " 2026-03-31",
    "2026-03-31 ",
    "2026-03-31T00:00",
    "+2026-03-31",
    "March 31",
  ]) {
    oneError(run(row({ date })), "date", "date", date);
  }
});

// Extends public "[unhappy-5] February 29th of a leap year is accepted": other leap years and last days of months.
test("[unhappy-5] leap days of leap years and last days of months are accepted", () => {
  const dates = ["2000-02-29", "2020-02-29", "2026-01-31", "2026-02-28", "2025-04-30", "2025-12-31", "1999-01-01"];
  const result = run(...dates.map((date, i) => row({ id: `d${i}`, date })));
  assert.deepEqual(
    payouts(result).map((p) => p.date),
    dates,
  );
});

// Extends public "[unhappy-5] a date after today is a future error": other future dates and other todays.
test("[unhappy-5] dates after the given today are future errors, judged against that today", () => {
  for (const date of ["2026-05-01", "2027-01-01", "2026-12-31", "9999-12-31"]) {
    oneError(run(row({ date })), "date", "future", date);
  }
  const leap = importStatement([HEADER, row({ date: "2024-03-01" })].join("\n"), CURRENCIES, "2024-02-29");
  oneError(leap, "date", "future", "2024-03-01");
  const yearEnd = importStatement([HEADER, row({ date: "2027-01-01" })].join("\n"), CURRENCIES, "2026-12-31");
  oneError(yearEnd, "date", "future", "2027-01-01");
  const early = importStatement([HEADER, row({ date: "2026-03-31" })].join("\n"), CURRENCIES, "2026-03-30");
  oneError(early, "date", "future", "2026-03-31");
});

// Extends public "[unhappy-5] a date equal to today is accepted": other todays, and dates before them.
test("[unhappy-5] dates on or before the given today are accepted", () => {
  const result = importStatement(
    [HEADER, row({ id: "a", date: "2030-06-15" }), row({ id: "b", date: "2030-06-14" }), row({ id: "c", date: "2029-12-31" })].join("\n"),
    CURRENCIES,
    "2030-06-15",
  );
  assert.deepEqual(
    payouts(result).map((p) => p.date),
    ["2030-06-15", "2030-06-14", "2029-12-31"],
  );
});

// unhappy-6: A bad amount

// Extends public "[unhappy-6] an amount without exactly two decimal digits is an amount error": other malformed amounts.
test("[unhappy-6] amounts not of digits, a dot and two digits are amount errors", () => {
  for (const amount of [
    "",
    ".50",
    "1.",
    "1.5",
    "1.0a",
    "a.00",
    "1,00",
    "1e2",
    "1e2.00",
    "0x1.00",
    "1.00 ",
    "1. 00",
    "Infinity",
    "NaN",
    "1..00",
    "1.0.0",
    "$1.00",
  ]) {
    oneError(run(row({ amount })), "amount", "amount", amount);
  }
});

// Extends public "[unhappy-6] an amount with a sign, a space or a thousands separator is an amount error": other placements.
test("[unhappy-6] signs, spaces and separators anywhere in an amount are amount errors", () => {
  for (const amount of ["-0.01", "1.00-", "+0.50", "12 345.67", "1'000.00", "1_000.00", "1.000,00", "\t1.00"]) {
    oneError(run(row({ amount })), "amount", "amount", amount);
  }
});

// Extends public "[unhappy-6] an amount of 0.00 is an amount error": zero among valid lines; small non-zero amounts are fine.
test("[unhappy-6] 0.00 is an amount error while 0.10 and 0.01 import", () => {
  const { errors, total } = failure(
    run(row({ id: "a", amount: "0.10" }), row({ id: "b", amount: "0.00" }), row({ id: "c", amount: "0.01" })),
  );
  assert.deepEqual(errors, [{ line: 3, field: "amount", code: "amount", text: "0.00" }]);
  assert.equal(total, 1);
  assert.deepEqual(
    payouts(run(row({ id: "a", amount: "0.10" }), row({ id: "c", amount: "0.01" }))).map((p) => p.amount),
    [10, 1],
  );
});

// unhappy-7: A bad currency

// Extends public "[unhappy-7] a currency not in the accepted set is a currency error": a different accepted set.
test("[unhappy-7] a currency outside a different accepted set is a currency error", () => {
  const result = importStatement([HEADER, row({ currency: "SGD" })].join("\n"), new Set(["EUR"]), TODAY);
  oneError(result, "currency", "currency", "SGD");
});

// Extends public "[unhappy-7] a currency not in the accepted set is a currency error": an empty accepted set.
test("[unhappy-7] with no accepted currencies every currency is a currency error", () => {
  const { errors, total } = failure(
    importStatement([HEADER, row({ id: "a" }), row({ id: "b", currency: "USD" })].join("\n"), new Set<string>(), TODAY),
  );
  assert.deepEqual(errors, [
    { line: 2, field: "currency", code: "currency", text: "SGD" },
    { line: 3, field: "currency", code: "currency", text: "USD" },
  ]);
  assert.equal(total, 2);
});

// Extends public "[unhappy-7] currency comparison is exact: sgd is not SGD": other near misses.
test("[unhappy-7] currencies differing by case, spaces or length are currency errors", () => {
  for (const currency of ["Sgd", "usD", " SGD", "SGD ", "SG", "SGDD", ""]) {
    oneError(run(row({ currency })), "currency", "currency", currency);
  }
});

// unhappy-8: A bad reference

// Extends public "[unhappy-8] a reference longer than 140 characters is a reference error": much longer, other characters.
test("[unhappy-8] references well over 140 characters are reference errors", () => {
  for (const reference of ["ab ".repeat(47), "x".repeat(500), "é".repeat(141)]) {
    oneError(run(row({ reference })), "reference", "reference", reference);
  }
});

// Extends public "[unhappy-8] a reference holding a character whose code is below 32 is a reference error": other control codes.
test("[unhappy-8] references holding any character with code 0 to 31 are reference errors", () => {
  for (let code = 0; code < 32; code++) {
    if (code === 10 || code === 13) continue;
    const reference = `pay${String.fromCharCode(code)}out`;
    oneError(run(row({ reference })), "reference", "reference", reference);
  }
});

// Extends public "[unhappy-8] a reference of exactly 140 characters is accepted": codes 32 and above,
// and 140 characters of other kinds.
test("[unhappy-8] references of 140 characters with codes 32 and above are accepted", () => {
  const references = [" ".repeat(140), "\u007f".repeat(140), "é".repeat(140), "a b,c.d!".repeat(17) + "abcd"];
  const result = run(...references.map((reference, i) => row({ id: `r${i}`, reference })));
  assert.deepEqual(
    payouts(result).map((p) => p.reference),
    references,
  );
});

// Extends public "[unhappy-8] a reference may be empty": an empty reference on a line with another error
// adds no reference error.
test("[unhappy-8] an empty reference on a line with other errors is not itself an error", () => {
  const { errors, total } = failure(run(row({ id: "p_1", reference: "" })));
  assert.deepEqual(errors, [{ line: 2, field: "id", code: "id", text: "p_1" }]);
  assert.equal(total, 1);
});

// boundary-1: One line, several errors

// Extends public "[boundary-1] a line with a wrong date, amount and currency has three errors in field order":
// every field wrong at once.
test("[boundary-1] a line with all five fields wrong has five errors in field order", () => {
  const reference = "y".repeat(141);
  const { errors, total } = failure(
    run(row({ id: "p 1", date: "2026-04-16", amount: "1,00", currency: "usd", reference })),
  );
  assert.deepEqual(errors, [
    { line: 2, field: "id", code: "id", text: "p 1" },
    { line: 2, field: "date", code: "future", text: "2026-04-16" },
    { line: 2, field: "amount", code: "amount", text: "1,00" },
    { line: 2, field: "currency", code: "currency", text: "usd" },
    { line: 2, field: "reference", code: "reference", text: reference },
  ]);
  assert.equal(total, 5);
});

// Extends public "[boundary-1] a line with a wrong date, amount and currency has three errors in field order":
// other pairs of fields.
test("[boundary-1] two wrong fields on a line are listed in field order", () => {
  const { errors, total } = failure(
    run(
      row({ id: "a", amount: "0.00", reference: "\u0002" }),
      row({ id: "b!", currency: "EUR" }),
      row({ id: "c", date: "2026-02-30", reference: "\u0007" }),
    ),
  );
  assert.deepEqual(errors, [
    { line: 2, field: "amount", code: "amount", text: "0.00" },
    { line: 2, field: "reference", code: "reference", text: "\u0002" },
    { line: 3, field: "id", code: "id", text: "b!" },
    { line: 3, field: "currency", code: "currency", text: "EUR" },
    { line: 4, field: "date", code: "date", text: "2026-02-30" },
    { line: 4, field: "reference", code: "reference", text: "\u0007" },
  ]);
  assert.equal(total, 6);
});

// Extends public "[boundary-1] errors on lines 2 and 3 are listed with line 2's first": many lines,
// mixing kinds of error, valid lines between.
test("[boundary-1] errors across many lines are listed in line order", () => {
  const { errors, total } = failure(
    run(
      row({ id: "a" }),
      row({ id: "b", currency: "EUR" }),
      "c;2026-03-31",
      row({ id: "d" }),
      "",
      row({ id: "b", amount: "5" }),
      row({ id: "e", date: "2026-04-16" }),
    ),
  );
  assert.deepEqual(errors, [
    { line: 3, field: "currency", code: "currency", text: "EUR" },
    { line: 4, field: null, code: "fields", text: "c;2026-03-31" },
    { line: 6, field: null, code: "blank", text: "" },
    { line: 7, field: "id", code: "duplicate", text: "b" },
    { line: 7, field: "amount", code: "amount", text: "5" },
    { line: 8, field: "date", code: "future", text: "2026-04-16" },
  ]);
  assert.equal(total, 6);
});

// Extends public "[boundary-1] an error on one line does not stop the lines after it being checked":
// a statement with any error imports nothing, even its valid lines.
test("[boundary-1] one bad line among many valid ones fails the whole import", () => {
  const rows: string[] = [];
  for (let i = 1; i <= 50; i++) rows.push(row({ id: `v${i}` }));
  rows.push(row({ id: "w", currency: "GBP" }));
  for (let i = 51; i <= 100; i++) rows.push(row({ id: `v${i}` }));
  const result = run(...rows);
  assert.equal(result.ok, false);
  const { errors, total } = failure(result);
  assert.deepEqual(errors, [{ line: 52, field: "currency", code: "currency", text: "GBP" }]);
  assert.equal(total, 1);
});
