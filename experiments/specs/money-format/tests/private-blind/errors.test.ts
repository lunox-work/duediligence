import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney } from "../../src/index.js";

function assertFailsWith(fn: () => unknown, pattern: RegExp): void {
  assert.throws(fn, (err: unknown) => {
    if (!(err instanceof Error)) {
      assert.fail("expected an Error");
      return false;
    }
    assert.match(err.message, pattern);
    return true;
  });
}

// @unhappy: an unsupported currency is refused

test("unsupported GBP from the spec is refused naming GBP", () => {
  assertFailsWith(() => formatMoney({ minorUnits: 100, currency: "GBP" }), /GBP/);
});

test("other unsupported currencies are refused naming the currency", () => {
  assertFailsWith(() => formatMoney({ minorUnits: 100, currency: "JPY" }), /JPY/);
  assertFailsWith(() => formatMoney({ minorUnits: 0, currency: "CHF" }), /CHF/);
  assertFailsWith(() => formatMoney({ minorUnits: -4321, currency: "SGD" }), /SGD/);
  assertFailsWith(() => formatMoney({ minorUnits: 1500000, currency: "XAU" }), /XAU/);
});

// @unhappy: an amount that is not a whole number of minor units is refused

test("fractional minor units from the spec are refused as not an integer", () => {
  assertFailsWith(() => formatMoney({ minorUnits: 12.5, currency: "USD" }), /integer/i);
});

test("other non-integer minor units are refused as not an integer", () => {
  assertFailsWith(() => formatMoney({ minorUnits: 0.1, currency: "USD" }), /integer/i);
  assertFailsWith(() => formatMoney({ minorUnits: -3.75, currency: "EUR" }), /integer/i);
  assertFailsWith(() => formatMoney({ minorUnits: 1500000.5, currency: "IDR" }), /integer/i);
  assertFailsWith(() => formatMoney({ minorUnits: 99.999, currency: "EUR" }), /integer/i);
});

test("non-finite minor units are refused as not an integer", () => {
  assertFailsWith(() => formatMoney({ minorUnits: Number.NaN, currency: "USD" }), /integer/i);
  assertFailsWith(
    () => formatMoney({ minorUnits: Number.POSITIVE_INFINITY, currency: "EUR" }),
    /integer/i,
  );
  assertFailsWith(
    () => formatMoney({ minorUnits: Number.NEGATIVE_INFINITY, currency: "IDR" }),
    /integer/i,
  );
});
