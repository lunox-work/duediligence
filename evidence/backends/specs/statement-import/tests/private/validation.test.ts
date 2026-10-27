import { test } from "node:test";
import assert from "node:assert/strict";
import { importStatement, type Payout, type StatementError } from "../../src/index.js";

const HEADER = "id;date;amount;currency;reference";
const TODAY = "2026-03-31";

function reject(lines: string[], errors: StatementError[], today = TODAY, currencies: ReadonlySet<string> = new Set(["SGD"])): void {
  assert.deepEqual(importStatement([HEADER, ...lines].join("\n"), currencies, today), {
    ok: false, errors, total: errors.length,
  });
}

// Extends public: imports payouts in input order and converts amounts to cents.
test("[happy-1] preserves eighteen unsorted payouts and exact cent values", () => {
  const cents = [29, 57, 101, 999, 7, 103, 5801, 100000001, 99, 10, 310, 12345, 1, 87, 90000, 42, 777, 99999999];
  const payouts: Payout[] = cents.map((amount, i) => ({
    id: `Z-${18 - i}`, date: i % 2 ? "2026-01-01" : TODAY, amount,
    currency: i % 3 ? "JPY" : "EUR", reference: `  payout ${i}: a,b "quoted"  `,
  }));
  const lines = payouts.map(p => `${p.id};${p.date};${Math.floor(p.amount / 100)}.${String(p.amount % 100).padStart(2, "0")};${p.currency};${p.reference}`);
  assert.deepEqual(importStatement([HEADER, ...lines].join("\n"), new Set(["EUR", "JPY"]), TODAY), { ok: true, payouts });
});

// Extends public: imports a single payout with an empty reference.
test("[happy-1] keeps several consecutive and interleaved empty references", () => {
  const references = ["", "", " middle ", "", "last", ""];
  const payouts = references.map((reference, i) => ({ id: `empty-${i}`, date: TODAY, amount: 201 + i, currency: "CAD", reference }));
  const lines = payouts.map(p => `${p.id};${p.date};2.${String(p.amount - 200).padStart(2, "0")};CAD;${p.reference}`);
  assert.deepEqual(importStatement([HEADER, ...lines].join("\n"), new Set(["CAD"]), TODAY), { ok: true, payouts });
});

// Extends public: rejects empty ids and characters outside letters digits and hyphens.
test("[unhappy-3] rejects punctuation and embedded controls without trimming ids", () => {
  for (const id of ["a/b", "a+b", "a@b", "a:b", "a\\b", "a\tb", "a\0b", "a\u007fb", "\ta", "a\t"]) {
    reject([`${id};${TODAY};1.00;SGD;`], [{ line: 2, field: "id", code: "id", text: id }]);
  }
});

// Extends public: rejects an id of 33 characters.
test("[unhappy-3] rejects much longer otherwise valid ids", () => {
  for (const size of [34, 64, 1024, 4096]) {
    const id = "A9-".repeat(Math.ceil(size / 3)).slice(0, size);
    reject([`${id};${TODAY};1.00;SGD;`], [{ line: 2, field: "id", code: "id", text: id }]);
  }
});

// Extends public: accepts ids of one and 32 allowed characters.
test("[unhappy-3] accepts numeric hyphen-only and exact-length ids without an extra shape rule", () => {
  const ids = ["-", "7", "--", "-09-", "9".repeat(31), "-".repeat(32), "Z".repeat(32)];
  assert.deepEqual(importStatement([HEADER, ...ids.map(id => `${id};${TODAY};1.00;SGD;`)].join("\n"), new Set(["SGD"]), TODAY), {
    ok: true, payouts: ids.map(id => ({ id, date: TODAY, amount: 100, currency: "SGD", reference: "" })),
  });
});

// Extends public: reports only the later occurrence of a repeated id even across another payout.
test("[unhappy-4] reports every later occurrence across several interleaved ids", () => {
  const ids = ["a", "b", "c", "a", "b", "a", "c", "d", "d"];
  reject(ids.map(id => `${id};${TODAY};1.00;SGD;`), [
    { line: 5, field: "id", code: "duplicate", text: "a" },
    { line: 6, field: "id", code: "duplicate", text: "b" },
    { line: 7, field: "id", code: "duplicate", text: "a" },
    { line: 8, field: "id", code: "duplicate", text: "c" },
    { line: 10, field: "id", code: "duplicate", text: "d" },
  ]);
});

test("[unhappy-4] remembers a valid id even when its first payout has another bad field", () => {
  reject([`once;${TODAY};0.00;SGD;`, `other;${TODAY};1.00;SGD;`, `once;${TODAY};2.00;SGD;`], [
    { line: 2, field: "amount", code: "amount", text: "0.00" },
    { line: 4, field: "id", code: "duplicate", text: "once" },
  ]);
});

// Extends public: treats differently cased ids as distinct.
test("[unhappy-4] distinguishes four case variants while detecting exact repeats", () => {
  const ids = ["Ab-9", "aB-9", "AB-9", "ab-9", "AB-9", "aB-9"];
  reject(ids.map(id => `${id};${TODAY};1.00;SGD;`), [
    { line: 6, field: "id", code: "duplicate", text: "AB-9" },
    { line: 7, field: "id", code: "duplicate", text: "aB-9" },
  ]);
});

test("[unhappy-4] duplicate tracking is local to each import", () => {
  const statement = `${HEADER}\nshared;${TODAY};3.00;SGD;`;
  const expected = { ok: true, payouts: [{ id: "shared", date: TODAY, amount: 300, currency: "SGD", reference: "" }] };
  assert.deepEqual(importStatement(statement, new Set(["SGD"]), TODAY), expected);
  assert.deepEqual(importStatement(statement, new Set(["SGD"]), TODAY), expected);
});

// Extends public: rejects malformed dates and nonexistent calendar days.
test("[unhappy-5] rejects extra date text short years and every thirty-day month overflow", () => {
  for (const date of ["26-03-01", "02026-03-01", "2026-003-01", "2026-03-001", "2026-03-01 ", "2026-03-01\t", "x2026-03-01", "2026-06-31", "2026-09-31", "2026-11-31", "2026-01-32", "2026-02-29", "2026-02-00"]) {
    reject([`d;${date};1.00;SGD;`], [{ line: 2, field: "date", code: "date", text: date }]);
  }
});

test("[unhappy-5] invalid future-looking dates receive date rather than future errors", () => {
  for (const date of ["2027-02-29", "2028-02-30", "2030-13-01", "2026-04-31"]) {
    reject([`d;${date};1.00;SGD;`], [{ line: 2, field: "date", code: "date", text: date }]);
  }
});

// Extends public: accepts leap days including the divisible-by-400 century.
test("[unhappy-5] uses Gregorian century rules for other centuries and ordinary leap years", () => {
  for (const date of ["2100-02-29", "2200-02-29", "2300-02-29"]) {
    reject([`d;${date};1.00;SGD;`], [{ line: 2, field: "date", code: "date", text: date }], "2500-12-31");
  }
  const dates = ["2400-02-29", "2096-02-29", "2028-02-29", "2100-02-28"];
  assert.deepEqual(importStatement([HEADER, ...dates.map((d, i) => `leap-${i};${d};1.00;SGD;`)].join("\n"), new Set(["SGD"]), "2500-12-31"), {
    ok: true, payouts: dates.map((date, i) => ({ id: `leap-${i}`, date, amount: 100, currency: "SGD", reference: "" })),
  });
});

// Extends public: accepts today using the supplied date.
test("[unhappy-5] changes the future decision when the supplied today changes", () => {
  const line = "same;2040-01-01;1.00;SGD;";
  reject([line], [{ line: 2, field: "date", code: "future", text: "2040-01-01" }], "2039-12-31");
  const expected = { ok: true, payouts: [{ id: "same", date: "2040-01-01", amount: 100, currency: "SGD", reference: "" }] };
  assert.deepEqual(importStatement(`${HEADER}\n${line}`, new Set(["SGD"]), "2040-01-01"), expected);
  assert.deepEqual(importStatement(`${HEADER}\n${line}`, new Set(["SGD"]), "2040-12-31"), expected);
});

// Extends public: reports the next calendar day as future.
test("[unhappy-5] detects future dates over leap-day month and year transitions", () => {
  for (const [today, date] of [["2024-02-28", "2024-02-29"], ["2024-02-29", "2024-03-01"], ["2026-12-31", "2027-01-01"], ["2026-03-31", "2031-01-01"]]) {
    reject([`d;${date};1.00;SGD;`], [{ line: 2, field: "date", code: "future", text: date }], today);
  }
});

// Extends public: rejects zero and amounts outside the required decimal format.
test("[unhappy-6] rejects numeric prefixes exponents hex nonfinite values and embedded whitespace", () => {
  for (const amount of ["2.99garbage", "2.99.00", "1e2.00", "0x10.00", "NaN", "Infinity", "2\t.99", "\t2.99", "2.99\t", "2.9 9", "2,99", "--2.99", "2..99", "0.00"]) {
    reject([`a;${TODAY};${amount};SGD;`], [{ line: 2, field: "amount", code: "amount", text: amount }]);
  }
});

// Extends public: accepts one cent and the specified large amount.
test("[unhappy-6] preserves cents for rounding-sensitive fractions and larger safe amounts", () => {
  const amounts: [string, number][] = [["0.07", 7], ["0.29", 29], ["0.57", 57], ["0.58", 58], ["1.13", 113], ["9.95", 995], ["99999999.99", 9999999999], ["1000000000.01", 100000000001]];
  assert.deepEqual(importStatement([HEADER, ...amounts.map(([amount], i) => `money-${i};${TODAY};${amount};SGD;`)].join("\n"), new Set(["SGD"]), TODAY), {
    ok: true, payouts: amounts.map(([, amount], i) => ({ id: `money-${i}`, date: TODAY, amount, currency: "SGD", reference: "" })),
  });
});

// Extends public: accepts leading zero digits in a positive amount.
test("[unhappy-6] accepts many leading zeros without changing cent values", () => {
  const amounts: [string, number][] = [["00000000.01", 1], ["000009.09", 909], [`${"0".repeat(200)}7.03`, 703]];
  assert.deepEqual(importStatement([HEADER, ...amounts.map(([amount], i) => `zero-${i};${TODAY};${amount};SGD;`)].join("\n"), new Set(["SGD"]), TODAY), {
    ok: true, payouts: amounts.map(([, amount], i) => ({ id: `zero-${i}`, date: TODAY, amount, currency: "SGD", reference: "" })),
  });
});

// Extends public: rejects unaccepted currencies with exact case and spacing.
test("[unhappy-7] rejects familiar codes when a different accepted set is supplied", () => {
  for (const currency of ["SGD", "USD", "EUR", "jpy", "JPY ", " JPY", "JpY"]) {
    reject([`c;${TODAY};1.00;${currency};`], [{ line: 2, field: "currency", code: "currency", text: currency }], TODAY, new Set(["JPY", "CAD"]));
  }
});

// Extends public: accepts a currency according to the supplied set.
test("[unhappy-7] set membership alone allows custom codes and preserves their exact text", () => {
  const codes = ["credits", "X-PTS", " usd ", "", "7"];
  assert.deepEqual(importStatement([HEADER, ...codes.map((code, i) => `code-${i};${TODAY};1.00;${code};`)].join("\n"), new Set(codes), TODAY), {
    ok: true, payouts: codes.map((currency, i) => ({ id: `code-${i}`, date: TODAY, amount: 100, currency, reference: "" })),
  });
});

// Extends public: rejects a currency when the accepted set is empty.
test("[unhappy-7] an empty set rejects every payout after a successful import with a nonempty set", () => {
  const lines = ["CAD", "USD", "SGD"].map((c, i) => `currency-${i};${TODAY};1.00;${c};`);
  assert.deepEqual(importStatement([HEADER, ...lines].join("\n"), new Set(["CAD", "USD", "SGD"]), TODAY), {
    ok: true, payouts: ["CAD", "USD", "SGD"].map((currency, i) => ({ id: `currency-${i}`, date: TODAY, amount: 100, currency, reference: "" })),
  });
  reject(lines, ["CAD", "USD", "SGD"].map((text, i) => ({ line: i + 2, field: "currency", code: "currency", text })), TODAY, new Set<string>());
});

// Extends public: rejects a reference of 141 characters.
test("[unhappy-8] rejects references well past the limit even when their excess is whitespace", () => {
  for (const reference of ["x".repeat(142), " ".repeat(1024), ` ${"x".repeat(8192)} `, `${"x".repeat(140)} `]) {
    reject([`r;${TODAY};1.00;SGD;${reference}`], [{ line: 2, field: "reference", code: "reference", text: reference }]);
  }
});

// Extends public: rejects references containing characters below code 32.
test("[unhappy-8] rejects every non-newline ASCII control at multiple reference positions", () => {
  for (let code = 0; code < 32; code++) {
    if (code === 10) continue; // LF separates statement lines rather than belonging to a field.
    const control = String.fromCharCode(code);
    const reference = code === 13 ? `before${control}after` : `${control}middle${control}`;
    reject([`r;${TODAY};1.00;SGD;${reference}`], [{ line: 2, field: "reference", code: "reference", text: reference }]);
  }
});

// Extends public: accepts empty and 140-character references including spaces.
test("[unhappy-8] accepts exact reference length and characters at or above code 32", () => {
  const references = ["", " ", " ".repeat(140), "a".repeat(139), "é".repeat(140), "[comma, quote\" slash/ backslash\\]", "before\u007fafter", "\uFEFFinside"];
  assert.deepEqual(importStatement([HEADER, ...references.map((r, i) => `ref-${i};${TODAY};1.00;SGD;${r}`)].join("\n"), new Set(["SGD"]), TODAY), {
    ok: true, payouts: references.map((reference, i) => ({ id: `ref-${i}`, date: TODAY, amount: 100, currency: "SGD", reference })),
  });
});
