import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney } from "../../src/index.js";

// @happy: a whole amount renders without decimals

test("whole USD amount from the spec renders without decimals", () => {
  assert.equal(formatMoney({ minorUnits: 125000, currency: "USD" }), "USD 1,250");
});

test("whole USD amounts of other sizes render without decimals", () => {
  assert.equal(formatMoney({ minorUnits: 100, currency: "USD" }), "USD 1");
  assert.equal(formatMoney({ minorUnits: 99900, currency: "USD" }), "USD 999");
  assert.equal(formatMoney({ minorUnits: 100000, currency: "USD" }), "USD 1,000");
  assert.equal(formatMoney({ minorUnits: 4200000, currency: "USD" }), "USD 42,000");
  assert.equal(formatMoney({ minorUnits: 100000000, currency: "USD" }), "USD 1,000,000");
  assert.equal(formatMoney({ minorUnits: 123456789000, currency: "USD" }), "USD 1,234,567,890");
});

test("whole EUR amounts render without decimals", () => {
  assert.equal(formatMoney({ minorUnits: 700, currency: "EUR" }), "EUR 7");
  assert.equal(formatMoney({ minorUnits: 31400000, currency: "EUR" }), "EUR 314,000");
});

// @happy: a fractional amount renders with two decimals

test("fractional USD amount from the spec renders with two decimals", () => {
  assert.equal(formatMoney({ minorUnits: 125050, currency: "USD" }), "USD 1,250.50");
});

test("fractional amounts keep both decimal digits including zeros", () => {
  assert.equal(formatMoney({ minorUnits: 101, currency: "USD" }), "USD 1.01");
  assert.equal(formatMoney({ minorUnits: 110, currency: "USD" }), "USD 1.10");
  assert.equal(formatMoney({ minorUnits: 123405, currency: "USD" }), "USD 1,234.05");
  assert.equal(formatMoney({ minorUnits: 99999999, currency: "USD" }), "USD 999,999.99");
  assert.equal(formatMoney({ minorUnits: 100000001, currency: "USD" }), "USD 1,000,000.01");
});

test("fractional EUR amounts render with two decimals", () => {
  assert.equal(formatMoney({ minorUnits: 987654321, currency: "EUR" }), "EUR 9,876,543.21");
  assert.equal(formatMoney({ minorUnits: 1020, currency: "EUR" }), "EUR 10.20");
});

// @happy: less than one whole unit keeps its leading zero

test("sub-unit EUR amount from the spec keeps its leading zero", () => {
  assert.equal(formatMoney({ minorUnits: 99, currency: "EUR" }), "EUR 0.99");
});

test("other sub-unit amounts keep the leading zero and two decimals", () => {
  assert.equal(formatMoney({ minorUnits: 1, currency: "EUR" }), "EUR 0.01");
  assert.equal(formatMoney({ minorUnits: 5, currency: "USD" }), "USD 0.05");
  assert.equal(formatMoney({ minorUnits: 10, currency: "USD" }), "USD 0.10");
  assert.equal(formatMoney({ minorUnits: 50, currency: "EUR" }), "EUR 0.50");
  assert.equal(formatMoney({ minorUnits: 99, currency: "USD" }), "USD 0.99");
});

// @happy: a currency with no minor digits never shows decimals

test("IDR amount from the spec is grouped with no decimals", () => {
  assert.equal(formatMoney({ minorUnits: 1500000, currency: "IDR" }), "IDR 1,500,000");
});

test("IDR amounts of other sizes never show decimals", () => {
  assert.equal(formatMoney({ minorUnits: 1, currency: "IDR" }), "IDR 1");
  assert.equal(formatMoney({ minorUnits: 99, currency: "IDR" }), "IDR 99");
  assert.equal(formatMoney({ minorUnits: 999, currency: "IDR" }), "IDR 999");
  assert.equal(formatMoney({ minorUnits: 1000, currency: "IDR" }), "IDR 1,000");
  assert.equal(formatMoney({ minorUnits: 12345, currency: "IDR" }), "IDR 12,345");
  assert.equal(formatMoney({ minorUnits: 125050, currency: "IDR" }), "IDR 125,050");
  assert.equal(formatMoney({ minorUnits: 987654321, currency: "IDR" }), "IDR 987,654,321");
});

test("the same minor units format by each currency's own digits", () => {
  assert.equal(formatMoney({ minorUnits: 250075, currency: "USD" }), "USD 2,500.75");
  assert.equal(formatMoney({ minorUnits: 250075, currency: "EUR" }), "EUR 2,500.75");
  assert.equal(formatMoney({ minorUnits: 250075, currency: "IDR" }), "IDR 250,075");
});

// @boundary: zero is a whole amount

test("zero USD from the spec renders as a whole amount", () => {
  assert.equal(formatMoney({ minorUnits: 0, currency: "USD" }), "USD 0");
});

test("zero in EUR and IDR renders as a whole amount", () => {
  assert.equal(formatMoney({ minorUnits: 0, currency: "EUR" }), "EUR 0");
  assert.equal(formatMoney({ minorUnits: 0, currency: "IDR" }), "IDR 0");
});

// @boundary: a negative amount carries a leading minus sign

test("negative USD amount from the spec carries a leading minus sign", () => {
  assert.equal(formatMoney({ minorUnits: -1250, currency: "USD" }), "-USD 12.50");
});

test("other negative amounts carry a leading minus before the code", () => {
  assert.equal(formatMoney({ minorUnits: -1, currency: "USD" }), "-USD 0.01");
  assert.equal(formatMoney({ minorUnits: -99, currency: "EUR" }), "-EUR 0.99");
  assert.equal(formatMoney({ minorUnits: -500, currency: "EUR" }), "-EUR 5");
  assert.equal(formatMoney({ minorUnits: -125050, currency: "USD" }), "-USD 1,250.50");
  assert.equal(formatMoney({ minorUnits: -100000000, currency: "USD" }), "-USD 1,000,000");
  assert.equal(formatMoney({ minorUnits: -1500, currency: "IDR" }), "-IDR 1,500");
  assert.equal(formatMoney({ minorUnits: -7, currency: "IDR" }), "-IDR 7");
});

// @boundary: the largest safe amount formats exactly

test("largest safe USD amount from the spec formats exactly", () => {
  assert.equal(
    formatMoney({ minorUnits: 9007199254740991, currency: "USD" }),
    "USD 90,071,992,547,409.91",
  );
});

test("largest safe amount formats exactly in EUR and IDR", () => {
  assert.equal(
    formatMoney({ minorUnits: Number.MAX_SAFE_INTEGER, currency: "EUR" }),
    "EUR 90,071,992,547,409.91",
  );
  assert.equal(
    formatMoney({ minorUnits: Number.MAX_SAFE_INTEGER, currency: "IDR" }),
    "IDR 9,007,199,254,740,991",
  );
});

test("smallest safe amount formats exactly with a leading minus", () => {
  assert.equal(
    formatMoney({ minorUnits: Number.MIN_SAFE_INTEGER, currency: "USD" }),
    "-USD 90,071,992,547,409.91",
  );
  assert.equal(
    formatMoney({ minorUnits: Number.MIN_SAFE_INTEGER, currency: "IDR" }),
    "-IDR 9,007,199,254,740,991",
  );
});

test("other large safe amounts format exactly", () => {
  assert.equal(
    formatMoney({ minorUnits: 9007199254740901, currency: "USD" }),
    "USD 90,071,992,547,409.01",
  );
  assert.equal(
    formatMoney({ minorUnits: 9007199254740900, currency: "EUR" }),
    "EUR 90,071,992,547,409",
  );
  assert.equal(
    formatMoney({ minorUnits: 1234567890123457, currency: "USD" }),
    "USD 12,345,678,901,234.57",
  );
  assert.equal(
    formatMoney({ minorUnits: 9007199254740989, currency: "IDR" }),
    "IDR 9,007,199,254,740,989",
  );
});
