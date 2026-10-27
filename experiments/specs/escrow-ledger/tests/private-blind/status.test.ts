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

test("a new ledger is open", () => {
  assert.equal(new Ledger({ currency: "USD", feeRateBps: 1000 }).status(), "open");
  assert.equal(new Ledger({ currency: "BRL", feeRateBps: 0 }).status(), "open");
});

test("the status moves from open to funded to partially released", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  assert.equal(ledger.status(), "open");
  ledger.fund({ amount: 50000, key: "f" });
  assert.equal(ledger.status(), "funded");
  ledger.release({ amount: 20000, contributor: "c1", key: "r" });
  assert.equal(ledger.status(), "partially released");
});

test("the status follows other amounts through funded and partially released", () => {
  const ledger = new Ledger({ currency: "MXN", feeRateBps: 1 });
  ledger.fund({ amount: 3, key: "a" });
  assert.equal(ledger.status(), "funded");
  ledger.fund({ amount: 4, key: "b" });
  assert.equal(ledger.status(), "funded");
  ledger.release({ amount: 1, contributor: "p", key: "c" });
  assert.equal(ledger.status(), "partially released");
});

test("a ledger stays partially released through later funding and refunds while anything is held", () => {
  const ledger = new Ledger({ currency: "EUR", feeRateBps: 400 });
  ledger.fund({ amount: 1000, key: "f1" });
  ledger.release({ amount: 999, contributor: "x", key: "r1" });
  assert.equal(ledger.status(), "partially released");
  ledger.fund({ amount: 500, key: "f2" });
  assert.equal(ledger.status(), "partially released");
  ledger.refund({ amount: 300, key: "rf1" });
  assert.equal(ledger.status(), "partially released");
  ledger.release({ amount: 100, contributor: "y", key: "r2" });
  assert.equal(ledger.status(), "partially released");
  ledger.refund({ amount: 100, key: "rf2" });
  assert.equal(ledger.status(), "partially released");
  assert.equal(ledger.balances().held, 1);
});

test("refunds before any release leave the ledger funded", () => {
  const ledger = new Ledger({ currency: "EUR", feeRateBps: 400 });
  ledger.fund({ amount: 8000, key: "f1" });
  ledger.refund({ amount: 2000, key: "rf1" });
  assert.equal(ledger.status(), "funded");
  ledger.refund({ amount: 5999, key: "rf2" });
  assert.equal(ledger.status(), "funded");
  ledger.fund({ amount: 10, key: "f2" });
  assert.equal(ledger.status(), "funded");
});

test("releasing everything in one entry closes the ledger", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f" });
  ledger.release({ amount: 50000, contributor: "c1", key: "r" });
  assert.equal(ledger.status(), "closed");
  assert.equal(ledger.balances().held, 0);
});

test("releasing everything over several entries closes the ledger only when nothing is held", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 12345, key: "f" });
  ledger.release({ amount: 5000, contributor: "a", key: "r1" });
  assert.equal(ledger.status(), "partially released");
  ledger.release({ amount: 7344, contributor: "b", key: "r2" });
  assert.equal(ledger.status(), "partially released");
  ledger.release({ amount: 1, contributor: "a", key: "r3" });
  assert.equal(ledger.status(), "closed");
});

test("refunding everything closes the ledger, even with no release", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 600, key: "f1" });
  ledger.fund({ amount: 400, key: "f2" });
  ledger.refund({ amount: 999, key: "rf1" });
  assert.equal(ledger.status(), "funded");
  ledger.refund({ amount: 1, key: "rf2" });
  assert.equal(ledger.status(), "closed");
  assert.equal(ledger.balances().refunded, 1000);
});

test("a mix of releases and refunds that empties the ledger closes it", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f" });
  ledger.refund({ amount: 10000, key: "rf" });
  ledger.release({ amount: 25000, contributor: "c1", key: "r1" });
  ledger.fund({ amount: 2000, key: "f2" });
  assert.equal(ledger.status(), "partially released");
  ledger.release({ amount: 16000, contributor: "c2", key: "r2" });
  assert.equal(ledger.status(), "partially released");
  ledger.refund({ amount: 1000, key: "rf2" });
  assert.equal(ledger.status(), "closed");
});

test("every fund, release or refund on a closed ledger fails with closed and changes nothing", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f" });
  ledger.release({ amount: 30000, contributor: "c1", key: "r" });
  ledger.refund({ amount: 20000, key: "rf" });
  assert.equal(ledger.status(), "closed");
  const before = snapshot(ledger);
  const paid = ledger.paidTo("c1");
  assertLedgerError(() => ledger.fund({ amount: 50000, key: "again" }), "closed");
  assertLedgerError(() => ledger.fund({ amount: 1, key: "again-2" }), "closed");
  assertLedgerError(() => ledger.release({ amount: 1, contributor: "c1", key: "again-3" }), "closed");
  assertLedgerError(() => ledger.refund({ amount: 1, key: "again-4" }), "closed");
  assert.deepEqual(snapshot(ledger), before);
  assert.equal(ledger.paidTo("c1"), paid);
});

test("a ledger closed by a refund refuses later funding with closed", () => {
  const ledger = new Ledger({ currency: "KRW", feeRateBps: 0 });
  ledger.fund({ amount: 77, key: "only" });
  ledger.refund({ amount: 77, key: "all-back" });
  assert.equal(ledger.status(), "closed");
  assertLedgerError(() => ledger.fund({ amount: 77, key: "new-fund" }), "closed");
  assertLedgerError(() => ledger.release({ amount: 5, contributor: "w", key: "new-rel" }), "closed");
  assert.equal(ledger.status(), "closed");
  assert.equal(ledger.entries().length, 2);
});

test("a rejected call leaves the status as it was", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 500, key: "f" });
  assertLedgerError(() => ledger.release({ amount: 501, contributor: "a", key: "r" }), "insufficient_funds");
  assert.equal(ledger.status(), "funded");
  ledger.release({ amount: 100, contributor: "a", key: "r2" });
  assertLedgerError(() => ledger.refund({ amount: 401, key: "rf" }), "insufficient_funds");
  assertLedgerError(() => ledger.fund({ amount: 0, key: "f0" }), "invalid_amount");
  assert.equal(ledger.status(), "partially released");
});
