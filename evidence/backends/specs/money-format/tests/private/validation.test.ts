import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney } from "../../src/index.js";

function namesCurrency(error: unknown, currency: string): boolean {
  assert.ok(error instanceof Error);
  assert.ok((error as Error).message.includes(currency), `Expected error to name ${currency}`);
  return true;
}

function requiresInteger(error: unknown): boolean {
  assert.ok(error instanceof Error);
  assert.match((error as Error).message, /integer/i);
  return true;
}

// Extends public "refuses GBP with an error naming the currency": other valid ISO currencies are unsupported too.
test("[unhappy-1] refuses unsupported ISO currencies rather than relying on locale support", () => {
  for (const currency of ["JPY", "CAD", "AUD", "CHF", "CNY", "KWD"]) {
    assert.throws(() => formatMoney({ minorUnits: 2500, currency }), (error: unknown) => namesCurrency(error, currency));
  }
});

// Extends public "refuses an unsupported currency even for zero": zero must still validate non-GBP codes.
test("[unhappy-1] refuses zero amounts for several unsupported currencies", () => {
  for (const currency of ["JPY", "CAD", "KWD"]) {
    assert.throws(() => formatMoney({ minorUnits: 0, currency }), (error: unknown) => namesCurrency(error, currency));
  }
});

// Extends public "refuses GBP with an error naming the currency": negative and large valid integer amounts.
test("[unhappy-1] checks unsupported currencies for negative and large amounts", () => {
  for (const currency of ["GBP", "JPY", "CHF"]) {
    for (const minorUnits of [-1, -123450, Number.MAX_SAFE_INTEGER]) {
      assert.throws(() => formatMoney({ minorUnits, currency }), (error: unknown) => namesCurrency(error, currency));
    }
  }
});

// Extends public "refuses fractional minor units with an integer error": negative fractions must not be truncated.
test("[unhappy-2] refuses negative fractional minor units in every supported currency", () => {
  for (const currency of ["USD", "EUR", "IDR"]) {
    for (const minorUnits of [-0.25, -1.5, -98765.125]) {
      assert.throws(() => formatMoney({ minorUnits, currency }), requiresInteger);
    }
  }
});

// Extends public "refuses fractional minor units with an integer error": EUR cannot skip validation.
test("[unhappy-2] refuses fractional EUR minor units at different magnitudes", () => {
  for (const minorUnits of [0.01, 1.01, 123456.75, 1000000000000.5]) {
    assert.throws(() => formatMoney({ minorUnits, currency: "EUR" }), requiresInteger);
  }
});

// Extends public "refuses fractional minor units below one in IDR": positive values above one too.
test("[unhappy-2] refuses fractional IDR amounts above one whole unit", () => {
  for (const minorUnits of [1.25, 100.01, 1500000.5, 1000000000000.25]) {
    assert.throws(() => formatMoney({ minorUnits, currency: "IDR" }), requiresInteger);
  }
});

// Extends both public integer-error tests: tiny fractions must not be rounded to zero.
test("[unhappy-2] refuses nonzero fractions arbitrarily close to zero", () => {
  for (const currency of ["USD", "EUR", "IDR"]) {
    for (const minorUnits of [Number.MIN_VALUE, -Number.MIN_VALUE, 1e-10, -1e-10]) {
      assert.throws(() => formatMoney({ minorUnits, currency }), requiresInteger);
    }
  }
});

// Extends public "refuses fractional minor units with an integer error": near-integers must not use an epsilon tolerance.
test("[unhappy-2] refuses representable fractions immediately beside integers", () => {
  for (const currency of ["USD", "EUR", "IDR"]) {
    for (const minorUnits of [1 + Number.EPSILON, 1 - Number.EPSILON, -1 - Number.EPSILON, 999.9999999999]) {
      assert.throws(() => formatMoney({ minorUnits, currency }), requiresInteger);
    }
  }
});

// Extends public "refuses fractional minor units with an integer error": NaN is not a whole number of minor units.
test("[unhappy-2] refuses NaN with an integer error", () => {
  for (const currency of ["USD", "EUR", "IDR"]) {
    assert.throws(() => formatMoney({ minorUnits: Number.NaN, currency }), requiresInteger);
  }
});

// Extends both public integer-error tests: neither infinity is an integer amount.
test("[unhappy-2] refuses infinite amounts with an integer error", () => {
  for (const currency of ["USD", "EUR", "IDR"]) {
    for (const minorUnits of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.throws(() => formatMoney({ minorUnits, currency }), requiresInteger);
    }
  }
});
