import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney } from "../../src/index.js";

// Scenario: A whole amount renders without decimals
test("whole USD amount renders without decimals", () => {
  assert.equal(formatMoney({ minorUnits: 125000, currency: "USD" }), "USD 1,250");
});

test("whole USD amount of exactly 1,000 gets its first group separator", () => {
  assert.equal(formatMoney({ minorUnits: 100000, currency: "USD" }), "USD 1,000");
});

// Scenario: A fractional amount renders with two decimals
test("fractional USD amount renders with two decimals", () => {
  assert.equal(formatMoney({ minorUnits: 125050, currency: "USD" }), "USD 1,250.50");
});

test("fractional USD amount of a single minor unit keeps two decimals", () => {
  assert.equal(formatMoney({ minorUnits: 125001, currency: "USD" }), "USD 1,250.01");
});

// Scenario: Less than one whole unit keeps its leading zero
test("EUR amount below one unit keeps its leading zero", () => {
  assert.equal(formatMoney({ minorUnits: 99, currency: "EUR" }), "EUR 0.99");
});

test("EUR amount of one minor unit keeps its leading zeros", () => {
  assert.equal(formatMoney({ minorUnits: 1, currency: "EUR" }), "EUR 0.01");
});

// Scenario: A currency with no minor digits never shows decimals
test("IDR amount never shows decimals", () => {
  assert.equal(formatMoney({ minorUnits: 1500000, currency: "IDR" }), "IDR 1,500,000");
});

test("IDR amount of 999 has no group separator and no decimals", () => {
  assert.equal(formatMoney({ minorUnits: 999, currency: "IDR" }), "IDR 999");
});

// Scenario: Zero is a whole amount
test("zero USD is a whole amount", () => {
  assert.equal(formatMoney({ minorUnits: 0, currency: "USD" }), "USD 0");
});

test("zero EUR is a whole amount", () => {
  assert.equal(formatMoney({ minorUnits: 0, currency: "EUR" }), "EUR 0");
});

// Scenario: A negative amount carries a leading minus sign
test("negative USD amount carries a leading minus sign", () => {
  assert.equal(formatMoney({ minorUnits: -1250, currency: "USD" }), "-USD 12.50");
});

test("negative USD amount of one minor unit carries a leading minus sign", () => {
  assert.equal(formatMoney({ minorUnits: -1, currency: "USD" }), "-USD 0.01");
});

// Scenario: The largest safe amount formats exactly
test("largest safe USD amount formats exactly", () => {
  assert.equal(
    formatMoney({ minorUnits: 9007199254740991, currency: "USD" }),
    "USD 90,071,992,547,409.91",
  );
});

test("most negative safe USD amount formats exactly", () => {
  assert.equal(
    formatMoney({ minorUnits: -9007199254740991, currency: "USD" }),
    "-USD 90,071,992,547,409.91",
  );
});
