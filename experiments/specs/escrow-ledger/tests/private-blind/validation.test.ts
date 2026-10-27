import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, LedgerError } from "../../src/index.js";
import type { LedgerErrorCode } from "../../src/index.js";

function assertLedgerError(fn: () => unknown, code: LedgerErrorCode): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof LedgerError, `expected a LedgerError, got ${String(error)}`);
    assert.equal((error as LedgerError).code, code);
    return true;
  });
}

function snapshot(ledger: Ledger) {
  return {
    status: ledger.status(),
    balances: ledger.balances(),
    entries: ledger.entries(),
  };
}

// Amounts that are invalid but never more than what the ledgers below hold.
const INVALID_AMOUNTS = [0, -1, -50000, 0.5, 100.25, 2.5, NaN, -Infinity];
// Amounts that are invalid and also larger than anything a ledger could hold.
const TOO_LARGE_AMOUNTS = [Number.MAX_SAFE_INTEGER + 1, 2 ** 60, Infinity];

test("the spec's invalid amounts are refused with invalid_amount", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f" });
  const before = snapshot(ledger);
  for (const amount of [0, -1, 0.5]) {
    assertLedgerError(() => ledger.fund({ amount, key: "x" }), "invalid_amount");
    assertLedgerError(() => ledger.release({ amount, contributor: "c1", key: "y" }), "invalid_amount");
    assertLedgerError(() => ledger.refund({ amount, key: "z" }), "invalid_amount");
  }
  assert.deepEqual(snapshot(ledger), before);
});

test("funding a non-whole, non-positive or unsafe amount fails with invalid_amount", () => {
  const ledger = new Ledger({ currency: "EUR", feeRateBps: 250 });
  ledger.fund({ amount: 1000, key: "base" });
  const before = snapshot(ledger);
  [...INVALID_AMOUNTS, ...TOO_LARGE_AMOUNTS].forEach((amount, i) => {
    assertLedgerError(() => ledger.fund({ amount, key: `fund-${i}` }), "invalid_amount");
  });
  assert.deepEqual(snapshot(ledger), before);
});

test("funding a new ledger with an invalid amount leaves it open and empty", () => {
  const ledger = new Ledger({ currency: "EUR", feeRateBps: 250 });
  assertLedgerError(() => ledger.fund({ amount: -7, key: "neg" }), "invalid_amount");
  assertLedgerError(() => ledger.fund({ amount: 3.14, key: "frac" }), "invalid_amount");
  assert.equal(ledger.status(), "open");
  assert.deepEqual(ledger.entries(), []);
  assert.equal(ledger.balances().funded, 0);
});

test("releasing an invalid amount fails with invalid_amount", () => {
  const ledger = new Ledger({ currency: "GBP", feeRateBps: 500 });
  ledger.fund({ amount: 900000, key: "f" });
  ledger.release({ amount: 1000, contributor: "k", key: "r0" });
  const before = snapshot(ledger);
  const paid = ledger.paidTo("k");
  INVALID_AMOUNTS.forEach((amount, i) => {
    assertLedgerError(() => ledger.release({ amount, contributor: "k", key: `rel-${i}` }), "invalid_amount");
  });
  assert.deepEqual(snapshot(ledger), before);
  assert.equal(ledger.paidTo("k"), paid);
});

test("refunding an invalid amount fails with invalid_amount", () => {
  const ledger = new Ledger({ currency: "GBP", feeRateBps: 500 });
  ledger.fund({ amount: 900000, key: "f" });
  const before = snapshot(ledger);
  INVALID_AMOUNTS.forEach((amount, i) => {
    assertLedgerError(() => ledger.refund({ amount, key: `ref-${i}` }), "invalid_amount");
  });
  assert.deepEqual(snapshot(ledger), before);
});

test("the spec's invalid ledgers are refused with invalid_ledger", () => {
  assertLedgerError(() => new Ledger({ currency: "usd", feeRateBps: 1000 }), "invalid_ledger");
  assertLedgerError(() => new Ledger({ currency: "US", feeRateBps: 1000 }), "invalid_ledger");
  assertLedgerError(() => new Ledger({ currency: "USD", feeRateBps: 10001 }), "invalid_ledger");
  assertLedgerError(() => new Ledger({ currency: "USD", feeRateBps: 2.5 }), "invalid_ledger");
});

test("a currency that is not three uppercase letters fails with invalid_ledger", () => {
  for (const currency of ["", "E", "eur", "Eur", "eUR", "EURO", "GB", "G8P", "12A", "US$", " USD", "USD ", "U D", "ABCD"]) {
    assertLedgerError(() => new Ledger({ currency, feeRateBps: 300 }), "invalid_ledger");
  }
});

test("a fee rate outside 0 to 10000 or not whole fails with invalid_ledger", () => {
  for (const feeRateBps of [-1, -10000, 10002, 20000, 0.1, 9999.5, 1000.01, NaN, Infinity, -Infinity]) {
    assertLedgerError(() => new Ledger({ currency: "EUR", feeRateBps }), "invalid_ledger");
  }
});

test("a ledger with any three uppercase letters and a rate from 0 to 10000 is valid", () => {
  for (const currency of ["EUR", "JPY", "XYZ", "AAA", "ZZZ"]) {
    for (const feeRateBps of [0, 1, 250, 9999, 10000]) {
      const ledger = new Ledger({ currency, feeRateBps });
      assert.equal(ledger.status(), "open");
    }
  }
});
