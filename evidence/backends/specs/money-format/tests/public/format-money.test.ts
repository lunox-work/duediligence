import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney } from "../../src/index.js";

test("[happy-1] formats a whole USD amount without decimals", () => {
  assert.equal(formatMoney({ minorUnits: 125000, currency: "USD" }), "USD 1,250");
});

test("[happy-1] groups whole units at the first thousands boundary", () => {
  assert.equal(formatMoney({ minorUnits: 100000, currency: "USD" }), "USD 1,000");
});

test("[happy-2] preserves two decimal places in a fractional USD amount", () => {
  assert.equal(formatMoney({ minorUnits: 125050, currency: "USD" }), "USD 1,250.50");
});

test("[happy-2] pads a one-minor-unit fraction above a whole amount", () => {
  assert.equal(formatMoney({ minorUnits: 100001, currency: "USD" }), "USD 1,000.01");
});

test("[happy-3] keeps the leading zero below one EUR", () => {
  assert.equal(formatMoney({ minorUnits: 99, currency: "EUR" }), "EUR 0.99");
});

test("[happy-3] formats the smallest positive EUR amount", () => {
  assert.equal(formatMoney({ minorUnits: 1, currency: "EUR" }), "EUR 0.01");
});

test("[happy-4] formats IDR with grouping and no decimals", () => {
  assert.equal(formatMoney({ minorUnits: 1500000, currency: "IDR" }), "IDR 1,500,000");
});

test("[happy-4] treats one IDR minor unit as one whole unit", () => {
  assert.equal(formatMoney({ minorUnits: 1, currency: "IDR" }), "IDR 1");
});

test("[boundary-1] formats zero USD without decimals", () => {
  assert.equal(formatMoney({ minorUnits: 0, currency: "USD" }), "USD 0");
});

test("[boundary-1] formats zero in a currency with no minor digits", () => {
  assert.equal(formatMoney({ minorUnits: 0, currency: "IDR" }), "IDR 0");
});

test("[boundary-2] places the negative sign before the currency code", () => {
  assert.equal(formatMoney({ minorUnits: -1250, currency: "USD" }), "-USD 12.50");
});

test("[boundary-2] preserves the sign and leading zero for minus one minor unit", () => {
  assert.equal(formatMoney({ minorUnits: -1, currency: "USD" }), "-USD 0.01");
});

test("[boundary-3] formats the largest safe integer amount exactly", () => {
  assert.equal(
    formatMoney({ minorUnits: 9007199254740991, currency: "USD" }),
    "USD 90,071,992,547,409.91",
  );
});

test("[boundary-3] formats the negative safe integer limit exactly", () => {
  assert.equal(
    formatMoney({ minorUnits: -9007199254740991, currency: "USD" }),
    "-USD 90,071,992,547,409.91",
  );
});

test("[unhappy-1] refuses GBP with an error naming the currency", () => {
  assert.throws(
    () => formatMoney({ minorUnits: 100, currency: "GBP" }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match((error as Error).message, /GBP/);
      return true;
    },
  );
});

test("[unhappy-1] refuses an unsupported currency even for zero", () => {
  assert.throws(
    () => formatMoney({ minorUnits: 0, currency: "GBP" }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match((error as Error).message, /GBP/);
      return true;
    },
  );
});

test("[unhappy-2] refuses fractional minor units with an integer error", () => {
  assert.throws(
    () => formatMoney({ minorUnits: 12.5, currency: "USD" }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match((error as Error).message, /integer/i);
      return true;
    },
  );
});

test("[unhappy-2] refuses fractional minor units below one in IDR", () => {
  assert.throws(
    () => formatMoney({ minorUnits: 0.5, currency: "IDR" }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match((error as Error).message, /integer/i);
      return true;
    },
  );
});
