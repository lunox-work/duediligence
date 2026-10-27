import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney } from "../../src/index.js";

// Integer-only reference arithmetic avoids the rounding that these cases detect.
function exactText(minorUnits: number, currency: string): string {
  const value = BigInt(minorUnits);
  const magnitude = value < 0n ? -value : value;
  const divisor = currency === "IDR" ? 1n : 100n;
  const whole = (magnitude / divisor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const remainder = magnitude % divisor;
  const fraction = remainder === 0n ? "" : `.${remainder.toString().padStart(2, "0")}`;
  return `${value < 0n ? "-" : ""}${currency} ${whole}${fraction}`;
}

// Extends public "formats zero USD without decimals" and "formats zero in a currency with no minor digits".
test("[boundary-1] formats zero EUR as a whole amount", () => {
  assert.equal(formatMoney({ minorUnits: 0, currency: "EUR" }), "EUR 0");
});

// Extends both public zero tests: zero after fractional, negative and differently scaled amounts.
test("[boundary-1] formats zero independently of preceding calls", () => {
  for (const currency of ["EUR", "IDR", "USD"]) {
    assert.equal(formatMoney({ minorUnits: -37, currency: "EUR" }), "-EUR 0.37");
    assert.equal(formatMoney({ minorUnits: 0, currency }), `${currency} 0`);
    assert.equal(formatMoney({ minorUnits: 103, currency: "IDR" }), "IDR 103");
    assert.equal(formatMoney({ minorUnits: 0, currency }), `${currency} 0`);
  }
});

// Extends public "places the negative sign before the currency code": whole amounts and repeated commas.
test("[boundary-2] formats negative whole amounts without decimal digits", () => {
  const cases: Array<[number, string]> = [
    [-100, "-USD 1"], [-100000000, "-USD 1,000,000"],
    [-123456789000, "-USD 1,234,567,890"],
  ];
  for (const [minorUnits, expected] of cases) {
    assert.equal(formatMoney({ minorUnits, currency: "USD" }), expected);
  }
});

// Extends public "places the negative sign before the currency code": EUR and multiple fractional tails.
test("[boundary-2] preserves grouping and two fraction digits for negative EUR", () => {
  const cases: Array<[number, string]> = [
    [-105, "-EUR 1.05"], [-1230, "-EUR 12.30"], [-99999, "-EUR 999.99"],
    [-100000010, "-EUR 1,000,000.10"], [-123456789045, "-EUR 1,234,567,890.45"],
  ];
  for (const [minorUnits, expected] of cases) {
    assert.equal(formatMoney({ minorUnits, currency: "EUR" }), expected);
  }
});

// Extends public "preserves the sign and leading zero for minus one minor unit": all subunit magnitudes.
test("[boundary-2] keeps a single leading minus and zero for every negative subunit amount", () => {
  for (const currency of ["USD", "EUR"]) {
    for (let cents = 1; cents < 100; cents += 1) {
      assert.equal(formatMoney({ minorUnits: -cents, currency }), `-${currency} 0.${String(cents).padStart(2, "0")}`);
    }
  }
});

// Extends both public negative tests: negative amounts in the zero-digit currency.
test("[boundary-2] formats negative IDR with its own scale and no fraction", () => {
  const cases: Array<[number, string]> = [
    [-1, "-IDR 1"], [-99, "-IDR 99"], [-100, "-IDR 100"],
    [-1001, "-IDR 1,001"], [-1000007, "-IDR 1,000,007"],
    [-1234567890123, "-IDR 1,234,567,890,123"],
  ];
  for (const [minorUnits, expected] of cases) {
    assert.equal(formatMoney({ minorUnits, currency: "IDR" }), expected);
  }
});

// Extends public "formats the largest safe integer amount exactly": EUR at the same limit.
test("[boundary-3] formats the safe integer maximum exactly in EUR", () => {
  assert.equal(formatMoney({ minorUnits: Number.MAX_SAFE_INTEGER, currency: "EUR" }), "EUR 90,071,992,547,409.91");
});

// Extends public "formats the negative safe integer limit exactly": EUR at the negative limit.
test("[boundary-3] formats the negative safe integer limit exactly in EUR", () => {
  assert.equal(formatMoney({ minorUnits: -Number.MAX_SAFE_INTEGER, currency: "EUR" }), "-EUR 90,071,992,547,409.91");
});

// Extends both public safe-limit tests: an entire cent cycle beside each limit, not just the .91 example.
test("[boundary-3] preserves every remainder near the safe integer limits", () => {
  for (let offset = 0; offset <= 200; offset += 1) {
    const magnitude = Number.MAX_SAFE_INTEGER - offset;
    for (const currency of ["USD", "EUR"]) {
      for (const minorUnits of [magnitude, -magnitude]) {
        assert.equal(formatMoney({ minorUnits, currency }), exactText(minorUnits, currency));
      }
    }
  }
});

// Extends public "formats the largest safe integer amount exactly": whole amounts and small remainders nearby.
test("[boundary-3] distinguishes whole amounts and tiny fractions at large safe magnitudes", () => {
  const cases: Array<[number, string]> = [
    [9007199254740900, "90,071,992,547,409"],
    [9007199254740901, "90,071,992,547,409.01"],
    [9007199254740910, "90,071,992,547,409.10"],
    [9007199254740899, "90,071,992,547,408.99"],
  ];
  for (const currency of ["USD", "EUR"]) {
    for (const [magnitude, text] of cases) {
      assert.equal(formatMoney({ minorUnits: magnitude, currency }), `${currency} ${text}`);
      assert.equal(formatMoney({ minorUnits: -magnitude, currency }), `-${currency} ${text}`);
    }
  }
});

// Extends both public safe-limit tests: zero-digit currency at the limits, without scaling.
test("[boundary-3] formats safe integer limits exactly in IDR", () => {
  assert.equal(formatMoney({ minorUnits: Number.MAX_SAFE_INTEGER, currency: "IDR" }), "IDR 9,007,199,254,740,991");
  assert.equal(formatMoney({ minorUnits: -Number.MAX_SAFE_INTEGER, currency: "IDR" }), "-IDR 9,007,199,254,740,991");
});

// Extends both public safe-limit tests: rounding hazards at powers of two throughout the safe range.
test("[boundary-3] formats exact cents around large binary precision transitions", () => {
  for (const exponent of [40, 45, 48, 49, 50, 51, 52]) {
    for (const offset of [-101, -1, 0, 1, 99, 100, 101]) {
      const magnitude = 2 ** exponent + offset;
      for (const currency of ["USD", "EUR", "IDR"]) {
        for (const minorUnits of [magnitude, -magnitude]) {
          assert.equal(formatMoney({ minorUnits, currency }), exactText(minorUnits, currency));
        }
      }
    }
  }
});
