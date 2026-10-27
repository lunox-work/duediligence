import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, LedgerError } from "../../src/index.js";
import type { LedgerErrorCode } from "../../src/index.js";

const MAX = Number.MAX_SAFE_INTEGER;

function rejects(fn: () => unknown, code: LedgerErrorCode): void {
  assert.throws(fn, (error: unknown) => {
    if (!(error instanceof LedgerError)) throw new assert.AssertionError({ message: `expected a LedgerError, got ${String(error)}` });
    assert.ok(error instanceof Error);
    assert.equal(error.code, code);
    return true;
  });
}

function snapshot(ledger: Ledger) {
  return {
    status: ledger.status(),
    balances: ledger.balances(),
    entries: ledger.entries(),
    paidToC1: ledger.paidTo("c1"),
  };
}

// Extends "a ledger in usd or US or at 10001 or 2.5 bps fails with invalid_ledger": other malformed currencies.
test("private: currencies that are not three uppercase letters fail with invalid_ledger", () => {
  for (const currency of ["", "U", "USDX", "EURO", "UsD", "usD", "Usd", "U1D", "123", "US ", " USD", "U-D", "US$"]) {
    rejects(() => new Ledger({ currency, feeRateBps: 1000 }), "invalid_ledger");
  }
});

// Extends "fee rates of 0 and 10000 are accepted and -1 is not": other valid currencies and rates.
test("private: other three-letter uppercase currencies and whole rates are accepted", () => {
  for (const currency of ["USD", "EUR", "JPY", "GBP", "IDR", "AAA", "ZZZ"]) {
    for (const feeRateBps of [0, 1, 250, 5000, 9999, 10000]) {
      const ledger = new Ledger({ currency, feeRateBps });
      assert.equal(ledger.status(), "open");
    }
  }
});

// Extends "a ledger in usd or US or at 10001 or 2.5 bps fails with invalid_ledger": other invalid fee rates.
test("private: fee rates that are not whole numbers from 0 to 10000 fail with invalid_ledger", () => {
  for (const feeRateBps of [-10000, -0.5, 0.5, 9999.5, 10000.0001, 10002, 20000, 1e9, NaN, Infinity, -Infinity]) {
    rejects(() => new Ledger({ currency: "USD", feeRateBps }), "invalid_ledger");
  }
});

// Extends "zero, negative and fractional amounts fail with invalid_amount and change nothing": other invalid amounts.
test("private: other invalid amounts fail with invalid_amount and change nothing", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "fund" });
  const before = snapshot(ledger);
  const amounts = [-0, -50000, -1.5, 0.5, 0.0001, 1.0000001, 49999.5, NaN, Infinity, -Infinity, MAX + 2, 2 ** 60, Number.MIN_SAFE_INTEGER];
  for (const [i, amount] of amounts.entries()) {
    rejects(() => ledger.fund({ amount, key: `f${i}` }), "invalid_amount");
    rejects(() => ledger.release({ amount, contributor: "c1", key: `r${i}` }), "invalid_amount");
    rejects(() => ledger.refund({ amount, key: `x${i}` }), "invalid_amount");
  }
  assert.deepEqual(snapshot(ledger), before);
});

// Extends "zero, negative and fractional amounts fail with invalid_amount and change nothing": a fractional amount within what is held.
test("private: a fractional release covered by what is held still fails with invalid_amount", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f1" });
  const before = snapshot(ledger);
  rejects(() => ledger.release({ amount: 100.5, contributor: "c1", key: "r1" }), "invalid_amount");
  rejects(() => ledger.refund({ amount: 49999.99, key: "x1" }), "invalid_amount");
  assert.deepEqual(snapshot(ledger), before);
});

// Extends "zero, negative and fractional amounts fail with invalid_amount and change nothing": on a new ledger.
test("private: invalid fundings on a new ledger leave it open and empty", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  for (const [i, amount] of [0, -1, 2.5, NaN, MAX + 1].entries()) {
    rejects(() => ledger.fund({ amount, key: `f${i}` }), "invalid_amount");
  }
  assert.equal(ledger.status(), "open");
  assert.deepEqual(ledger.entries(), []);
  assert.equal(ledger.balances().funded, 0);
  assert.equal(ledger.balances().held, 0);
});

// Extends "an amount of Number.MAX_SAFE_INTEGER + 1 fails with invalid_amount": the maximum itself is valid for every call.
test("private: an amount of exactly Number.MAX_SAFE_INTEGER is valid for a release and a refund", () => {
  const a = new Ledger({ currency: "USD", feeRateBps: 0 });
  a.fund({ amount: MAX, key: "f1" });
  const release = a.release({ amount: MAX, contributor: "c1", key: "r1" });
  assert.equal(release.amount, MAX);
  assert.equal(release.net, MAX);
  assert.equal(a.paidTo("c1"), MAX);

  const b = new Ledger({ currency: "USD", feeRateBps: 0 });
  b.fund({ amount: MAX, key: "f1" });
  const refund = b.refund({ amount: MAX, key: "x1" });
  assert.equal(refund.amount, MAX);
  assert.equal(b.balances().refunded, MAX);
  assert.equal(b.status(), "closed");
});
