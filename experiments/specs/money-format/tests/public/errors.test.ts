import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney } from "../../src/index.js";

// Scenario: An unsupported currency is refused
test("unsupported currency GBP is refused with a message naming it", () => {
  assert.throws(
    () => formatMoney({ minorUnits: 100, currency: "GBP" }),
    (err: unknown) => err instanceof Error && err.message.includes("GBP"),
  );
});

test("unsupported currency JPY with no minor digits is refused with a message naming it", () => {
  assert.throws(
    () => formatMoney({ minorUnits: 100, currency: "JPY" }),
    (err: unknown) => err instanceof Error && err.message.includes("JPY"),
  );
});

// Scenario: An amount that is not a whole number of minor units is refused
test("fractional minor units are refused as not an integer", () => {
  assert.throws(
    () => formatMoney({ minorUnits: 12.5, currency: "USD" }),
    (err: unknown) => err instanceof Error && /integer/i.test(err.message),
  );
});

test("negative fraction of a minor unit is refused as not an integer", () => {
  assert.throws(
    () => formatMoney({ minorUnits: -0.5, currency: "USD" }),
    (err: unknown) => err instanceof Error && /integer/i.test(err.message),
  );
});
