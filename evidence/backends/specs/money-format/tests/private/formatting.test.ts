import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney } from "../../src/index.js";

// Extends public "formats a whole USD amount without decimals": more than one comma.
test("[happy-1] groups every three whole digits in a large USD amount", () => {
  assert.equal(formatMoney({ minorUnits: 123456789000, currency: "USD" }), "USD 1,234,567,890");
});

// Extends public "groups whole units at the first thousands boundary": both sides and later boundaries.
test("[happy-1] groups whole USD amounts around successive thousands boundaries", () => {
  const cases: Array<[number, string]> = [
    [100, "USD 1"],
    [99900, "USD 999"],
    [100100, "USD 1,001"],
    [99999900, "USD 999,999"],
    [100000000, "USD 1,000,000"],
    [100000100, "USD 1,000,001"],
  ];
  for (const [minorUnits, expected] of cases) {
    assert.equal(formatMoney({ minorUnits, currency: "USD" }), expected);
  }
});

// Extends public "formats a whole USD amount without decimals": EUR has the same scale.
test("[happy-1] suppresses decimals for whole EUR amounts at several magnitudes", () => {
  const cases: Array<[number, string]> = [
    [100, "EUR 1"], [4200, "EUR 42"], [987654300, "EUR 9,876,543"],
    [100000000100, "EUR 1,000,000,001"],
  ];
  for (const [minorUnits, expected] of cases) {
    assert.equal(formatMoney({ minorUnits, currency: "EUR" }), expected);
  }
});

// Extends public "preserves two decimal places in a fractional USD amount": other tails and group counts.
test("[happy-2] preserves fractional tails and internal zero groups in USD", () => {
  const cases: Array<[number, string]> = [
    [110, "USD 1.10"], [142, "USD 1.42"], [99999, "USD 999.99"],
    [100000099, "USD 1,000,000.99"],
    [100000000105, "USD 1,000,000,001.05"],
    [987654321098, "USD 9,876,543,210.98"],
  ];
  for (const [minorUnits, expected] of cases) {
    assert.equal(formatMoney({ minorUnits, currency: "USD" }), expected);
  }
});

// Extends public "pads a one-minor-unit fraction above a whole amount": later groups and another currency.
test("[happy-2] pads cents after multiple whole-unit groups for both two-digit currencies", () => {
  for (const currency of ["USD", "EUR"]) {
    assert.equal(formatMoney({ minorUnits: 100000007, currency }), `${currency} 1,000,000.07`);
    assert.equal(formatMoney({ minorUnits: 100000001, currency }), `${currency} 1,000,000.01`);
  }
});

// Extends public "preserves two decimal places in a fractional USD amount": EUR fractions above one unit.
test("[happy-2] applies two-decimal formatting to substantial EUR amounts", () => {
  const cases: Array<[number, string]> = [
    [101, "EUR 1.01"], [1230, "EUR 12.30"], [5432107, "EUR 54,321.07"],
    [23456789012, "EUR 234,567,890.12"],
  ];
  for (const [minorUnits, expected] of cases) {
    assert.equal(formatMoney({ minorUnits, currency: "EUR" }), expected);
  }
});

// Extends both public fractional-USD tests: every cent tail, with different whole-unit magnitudes.
test("[happy-2] preserves all nonzero cent remainders without rounding or trimming", () => {
  const wholeAmounts: Array<[number, string]> = [[7, "7"], [1234, "1,234"], [1000002, "1,000,002"]];
  for (const currency of ["USD", "EUR"]) {
    for (const [whole, grouped] of wholeAmounts) {
      for (let cents = 1; cents < 100; cents += 1) {
        assert.equal(
          formatMoney({ minorUnits: whole * 100 + cents, currency }),
          `${currency} ${grouped}.${String(cents).padStart(2, "0")}`,
        );
      }
    }
  }
});

// Extends public "keeps the leading zero below one EUR": middle values including trailing-zero cents.
test("[happy-3] retains both fraction digits for intermediate subunit EUR amounts", () => {
  const cases: Array<[number, string]> = [
    [7, "EUR 0.07"], [10, "EUR 0.10"], [20, "EUR 0.20"], [47, "EUR 0.47"], [90, "EUR 0.90"],
  ];
  for (const [minorUnits, expected] of cases) {
    assert.equal(formatMoney({ minorUnits, currency: "EUR" }), expected);
  }
});

// Extends public "formats the smallest positive EUR amount": all positive values below a unit, including USD.
test("[happy-3] formats every positive subunit amount in both two-digit currencies", () => {
  for (const currency of ["EUR", "USD"]) {
    for (let minorUnits = 1; minorUnits < 100; minorUnits += 1) {
      assert.equal(formatMoney({ minorUnits, currency }), `${currency} 0.${String(minorUnits).padStart(2, "0")}`);
    }
  }
});

// Extends public "formats IDR with grouping and no decimals": grouping at several boundaries.
test("[happy-4] groups IDR around successive thousands boundaries", () => {
  const cases: Array<[number, string]> = [
    [999, "IDR 999"], [1000, "IDR 1,000"], [1001, "IDR 1,001"],
    [999999, "IDR 999,999"], [1000000, "IDR 1,000,000"],
    [1000001, "IDR 1,000,001"], [1234567890123, "IDR 1,234,567,890,123"],
  ];
  for (const [minorUnits, expected] of cases) {
    assert.equal(formatMoney({ minorUnits, currency: "IDR" }), expected);
  }
});

// Extends public "treats one IDR minor unit as one whole unit": values with nonzero last two digits.
test("[happy-4] never interprets the last two IDR digits as cents", () => {
  const cases: Array<[number, string]> = [
    [7, "IDR 7"], [10, "IDR 10"], [99, "IDR 99"], [100, "IDR 100"],
    [101, "IDR 101"], [125050, "IDR 125,050"], [123456789, "IDR 123,456,789"],
  ];
  for (const [minorUnits, expected] of cases) {
    assert.equal(formatMoney({ minorUnits, currency: "IDR" }), expected);
  }
});

// Extends public "treats one IDR minor unit as one whole unit": alternate scales on consecutive calls.
test("[happy-4] selects the currency scale for each call", () => {
  assert.equal(formatMoney({ minorUnits: 123456, currency: "USD" }), "USD 1,234.56");
  assert.equal(formatMoney({ minorUnits: 123456, currency: "IDR" }), "IDR 123,456");
  assert.equal(formatMoney({ minorUnits: 123456, currency: "EUR" }), "EUR 1,234.56");
  assert.equal(formatMoney({ minorUnits: 123456, currency: "IDR" }), "IDR 123,456");
});
