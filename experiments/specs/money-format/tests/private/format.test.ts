import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney } from "../../src/index.js";

// Extends "whole USD amount renders without decimals": other whole amounts, other currencies.
test("whole USD amount of one unit renders without decimals", () => {
  assert.equal(formatMoney({ minorUnits: 100, currency: "USD" }), "USD 1");
});

test("whole USD amount below one thousand has no separator and no decimals", () => {
  assert.equal(formatMoney({ minorUnits: 99900, currency: "USD" }), "USD 999");
});

test("whole EUR amount renders without decimals", () => {
  assert.equal(formatMoney({ minorUnits: 500, currency: "EUR" }), "EUR 5");
});

test("whole EUR amount in millions groups every three digits without decimals", () => {
  assert.equal(formatMoney({ minorUnits: 123456700, currency: "EUR" }), "EUR 1,234,567");
});

// Extends "whole USD amount of exactly 1,000 gets its first group separator": more groups.
test("whole USD amount of exactly 1,000,000 gets two group separators", () => {
  assert.equal(formatMoney({ minorUnits: 100000000, currency: "USD" }), "USD 1,000,000");
});

test("whole USD amount of 10,000 and 100,000 group correctly", () => {
  assert.equal(formatMoney({ minorUnits: 1000000, currency: "USD" }), "USD 10,000");
  assert.equal(formatMoney({ minorUnits: 10000000, currency: "USD" }), "USD 100,000");
});

test("whole USD amount of 999,999 has one separator", () => {
  assert.equal(formatMoney({ minorUnits: 99999900, currency: "USD" }), "USD 999,999");
});

// Extends "fractional USD amount renders with two decimals": other fractions and sizes.
test("fractional USD amount with a trailing zero keeps both decimals", () => {
  assert.equal(formatMoney({ minorUnits: 110, currency: "USD" }), "USD 1.10");
});

test("fractional USD amount just below a thousand has no separator", () => {
  assert.equal(formatMoney({ minorUnits: 99999, currency: "USD" }), "USD 999.99");
});

test("fractional USD amount in millions groups the whole part only", () => {
  assert.equal(formatMoney({ minorUnits: 123456789, currency: "USD" }), "USD 1,234,567.89");
});

test("fractional EUR amount renders with two decimals", () => {
  assert.equal(formatMoney({ minorUnits: 1000001, currency: "EUR" }), "EUR 10,000.01");
});

// Extends "fractional USD amount of a single minor unit keeps two decimals".
test("fractional USD amount with a leading zero in the fraction keeps it", () => {
  assert.equal(formatMoney({ minorUnits: 100005, currency: "USD" }), "USD 1,000.05");
});

test("fractional USD amount of one unit and one minor unit", () => {
  assert.equal(formatMoney({ minorUnits: 101, currency: "USD" }), "USD 1.01");
});

// Extends "EUR amount below one unit keeps its leading zero": other sub-unit values.
test("EUR amount of ten minor units keeps leading zero and trailing zero", () => {
  assert.equal(formatMoney({ minorUnits: 10, currency: "EUR" }), "EUR 0.10");
});

test("USD amount below one unit keeps its leading zero", () => {
  assert.equal(formatMoney({ minorUnits: 50, currency: "USD" }), "USD 0.50");
});

// Extends "EUR amount of one minor unit keeps its leading zeros".
test("EUR amount of nine minor units keeps its leading zeros", () => {
  assert.equal(formatMoney({ minorUnits: 9, currency: "EUR" }), "EUR 0.09");
});

// Extends "IDR amount never shows decimals": other IDR sizes.
test("IDR amount of exactly 1,000 gets a separator and no decimals", () => {
  assert.equal(formatMoney({ minorUnits: 1000, currency: "IDR" }), "IDR 1,000");
});

test("IDR amount not divisible by 100 is not split into decimals", () => {
  assert.equal(formatMoney({ minorUnits: 1550, currency: "IDR" }), "IDR 1,550");
});

test("IDR amount of 12,345,678 groups in threes without decimals", () => {
  assert.equal(formatMoney({ minorUnits: 12345678, currency: "IDR" }), "IDR 12,345,678");
});

// Extends "IDR amount of 999 has no group separator and no decimals".
test("small IDR amounts have no separator and no decimals", () => {
  assert.equal(formatMoney({ minorUnits: 1, currency: "IDR" }), "IDR 1");
  assert.equal(formatMoney({ minorUnits: 50, currency: "IDR" }), "IDR 50");
});

test("IDR amount of 999,999 has exactly one separator", () => {
  assert.equal(formatMoney({ minorUnits: 999999, currency: "IDR" }), "IDR 999,999");
});

// Extends "zero USD is a whole amount" / "zero EUR is a whole amount".
test("zero IDR is a whole amount", () => {
  assert.equal(formatMoney({ minorUnits: 0, currency: "IDR" }), "IDR 0");
});

// Extends "negative USD amount carries a leading minus sign": other sizes and currencies.
test("negative whole USD amount carries a leading minus and no decimals", () => {
  assert.equal(formatMoney({ minorUnits: -125000, currency: "USD" }), "-USD 1,250");
});

test("negative USD amount in millions groups after the minus sign", () => {
  assert.equal(formatMoney({ minorUnits: -123456789, currency: "USD" }), "-USD 1,234,567.89");
});

test("negative USD amount of exactly 100,000 does not put a separator after the minus", () => {
  assert.equal(formatMoney({ minorUnits: -10000000, currency: "USD" }), "-USD 100,000");
});

test("negative EUR amount below one unit keeps its leading zero", () => {
  assert.equal(formatMoney({ minorUnits: -99, currency: "EUR" }), "-EUR 0.99");
});

test("negative IDR amount carries a leading minus and no decimals", () => {
  assert.equal(formatMoney({ minorUnits: -1500000, currency: "IDR" }), "-IDR 1,500,000");
});

test("negative IDR amount of 100,000 does not put a separator after the minus", () => {
  assert.equal(formatMoney({ minorUnits: -100000, currency: "IDR" }), "-IDR 100,000");
});

// Extends "negative USD amount of one minor unit carries a leading minus sign".
test("negative USD amount of ten minor units keeps both decimals", () => {
  assert.equal(formatMoney({ minorUnits: -10, currency: "USD" }), "-USD 0.10");
});

test("negative IDR amount of one unit", () => {
  assert.equal(formatMoney({ minorUnits: -1, currency: "IDR" }), "-IDR 1");
});

// Extends "largest safe USD amount formats exactly": other large values where
// dividing by 100 in floating point loses the exact minor units.
test("large USD amount ending in .90 formats exactly", () => {
  assert.equal(
    formatMoney({ minorUnits: 9007199254740990, currency: "USD" }),
    "USD 90,071,992,547,409.90",
  );
});

test("large USD amount ending in .99 formats exactly", () => {
  assert.equal(
    formatMoney({ minorUnits: 9007199254740899, currency: "USD" }),
    "USD 90,071,992,547,408.99",
  );
});

test("large USD amount ending in .01 formats exactly", () => {
  assert.equal(
    formatMoney({ minorUnits: 9007199254740901, currency: "USD" }),
    "USD 90,071,992,547,409.01",
  );
});

test("large EUR amount 89,999,999,999,999.99 formats exactly", () => {
  assert.equal(
    formatMoney({ minorUnits: 8999999999999999, currency: "EUR" }),
    "EUR 89,999,999,999,999.99",
  );
});

test("largest safe IDR amount formats exactly without decimals", () => {
  assert.equal(
    formatMoney({ minorUnits: 9007199254740991, currency: "IDR" }),
    "IDR 9,007,199,254,740,991",
  );
});

// Extends "most negative safe USD amount formats exactly".
test("most negative safe EUR amount formats exactly", () => {
  assert.equal(
    formatMoney({ minorUnits: -9007199254740991, currency: "EUR" }),
    "-EUR 90,071,992,547,409.91",
  );
});

test("most negative safe IDR amount formats exactly", () => {
  assert.equal(
    formatMoney({ minorUnits: -9007199254740991, currency: "IDR" }),
    "-IDR 9,007,199,254,740,991",
  );
});

test("large negative USD amount ending in .99 formats exactly", () => {
  assert.equal(
    formatMoney({ minorUnits: -9007199254740899, currency: "USD" }),
    "-USD 90,071,992,547,408.99",
  );
});
