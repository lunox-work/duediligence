import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney } from "../../src/index.js";

function namesCurrency(code: string) {
  return (err: unknown) => err instanceof Error && err.message.includes(code);
}

function saysInteger(err: unknown): boolean {
  return err instanceof Error && /integer/i.test(err.message);
}

// Extends "unsupported currency GBP is refused with a message naming it": other codes.
test("unsupported currency CHF is refused with a message naming it", () => {
  assert.throws(() => formatMoney({ minorUnits: 100, currency: "CHF" }), namesCurrency("CHF"));
});

test("unsupported currency GBP is refused for zero and negative amounts", () => {
  assert.throws(() => formatMoney({ minorUnits: 0, currency: "GBP" }), namesCurrency("GBP"));
  assert.throws(() => formatMoney({ minorUnits: -250, currency: "GBP" }), namesCurrency("GBP"));
});

test("unsupported made-up currency XYZ is refused with a message naming it", () => {
  assert.throws(() => formatMoney({ minorUnits: 1, currency: "XYZ" }), namesCurrency("XYZ"));
});

// Extends "unsupported currency JPY with no minor digits ...": codes that collide
// with properties every plain object has.
test("currency named after an object property toString is refused", () => {
  assert.throws(
    () => formatMoney({ minorUnits: 100, currency: "toString" }),
    namesCurrency("toString"),
  );
});

test("currency named after an object property constructor is refused", () => {
  assert.throws(
    () => formatMoney({ minorUnits: 100, currency: "constructor" }),
    namesCurrency("constructor"),
  );
});

test("unsupported currency KWD with three minor digits is refused with a message naming it", () => {
  assert.throws(() => formatMoney({ minorUnits: 1000, currency: "KWD" }), namesCurrency("KWD"));
});

// Extends "fractional minor units are refused as not an integer": other values and currencies.
test("a tenth of a minor unit in USD is refused as not an integer", () => {
  assert.throws(() => formatMoney({ minorUnits: 0.1, currency: "USD" }), saysInteger);
});

test("a large non-integer USD amount is refused as not an integer", () => {
  assert.throws(() => formatMoney({ minorUnits: 125000.01, currency: "USD" }), saysInteger);
});

test("fractional minor units in EUR are refused as not an integer", () => {
  assert.throws(() => formatMoney({ minorUnits: 99.9, currency: "EUR" }), saysInteger);
});

test("fractional minor units in IDR are refused as not an integer", () => {
  assert.throws(() => formatMoney({ minorUnits: 1500000.5, currency: "IDR" }), saysInteger);
});

test("NaN minor units are refused as not an integer", () => {
  assert.throws(() => formatMoney({ minorUnits: Number.NaN, currency: "USD" }), saysInteger);
});

test("infinite minor units are refused as not an integer", () => {
  assert.throws(
    () => formatMoney({ minorUnits: Number.POSITIVE_INFINITY, currency: "USD" }),
    saysInteger,
  );
});

// Extends "negative fraction of a minor unit is refused as not an integer".
test("negative fractional minor units in EUR are refused as not an integer", () => {
  assert.throws(() => formatMoney({ minorUnits: -12.5, currency: "EUR" }), saysInteger);
});

test("negative fractional minor units in IDR are refused as not an integer", () => {
  assert.throws(() => formatMoney({ minorUnits: -1.25, currency: "IDR" }), saysInteger);
});

test("negative infinite minor units are refused as not an integer", () => {
  assert.throws(
    () => formatMoney({ minorUnits: Number.NEGATIVE_INFINITY, currency: "EUR" }),
    saysInteger,
  );
});
