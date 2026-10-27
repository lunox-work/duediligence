import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, LedgerError } from "../../src/index.js";
import type { LedgerErrorCode } from "../../src/index.js";

function rejects(fn: () => unknown, code: LedgerErrorCode): void {
  assert.throws(fn, (error: unknown) => {
    if (!(error instanceof LedgerError)) throw new assert.AssertionError({ message: `expected a LedgerError, got ${String(error)}` });
    assert.equal(error.code, code);
    return true;
  });
}

function snapshot(ledger: Ledger) {
  return {
    status: ledger.status(),
    balances: ledger.balances(),
    entries: ledger.entries(),
    paid: [ledger.paidTo("c1"), ledger.paidTo("c2"), ledger.paidTo("c3")],
  };
}

function assertClosedToEverything(ledger: Ledger, tag: string): void {
  const before = snapshot(ledger);
  rejects(() => ledger.fund({ amount: 1, key: `${tag}-f` }), "closed");
  rejects(() => ledger.fund({ amount: 50000, key: `${tag}-f2` }), "closed");
  rejects(() => ledger.release({ amount: 1, contributor: "c2", key: `${tag}-r` }), "closed");
  rejects(() => ledger.refund({ amount: 1, key: `${tag}-x` }), "closed");
  assert.deepEqual(snapshot(ledger), before);
  assert.equal(ledger.status(), "closed");
}

// Extends "a refund before any release leaves it funded, ...": more fundings and refunds before any release.
test("private: fundings and refunds before any release keep the ledger funded", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f1" });
  ledger.refund({ amount: 10000, key: "x1" });
  assert.equal(ledger.status(), "funded");
  ledger.fund({ amount: 5000, key: "f2" });
  assert.equal(ledger.status(), "funded");
  ledger.refund({ amount: 44999, key: "x2" });
  assert.equal(ledger.balances().held, 1);
  assert.equal(ledger.status(), "funded");
  ledger.release({ amount: 1, contributor: "c1", key: "r1" });
  assert.equal(ledger.status(), "closed");
});

// Extends "status moves from open to funded to partially released and stays there": a longer run after the first release.
test("private: the ledger stays partially released through many later fundings and refunds", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 1000, key: "f0" });
  ledger.release({ amount: 1, contributor: "c1", key: "r0" });
  assert.equal(ledger.status(), "partially released");
  for (let i = 1; i <= 10; i++) {
    ledger.fund({ amount: 500, key: `f${i}` });
    assert.equal(ledger.status(), "partially released");
    ledger.refund({ amount: 499, key: `x${i}` });
    assert.equal(ledger.status(), "partially released");
  }
  assert.equal(ledger.balances().held, 1009);
});

// Extends "status moves from open to funded to partially released and stays there": a second release.
test("private: a second release that leaves something held keeps it partially released", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f1" });
  ledger.release({ amount: 10000, contributor: "c1", key: "r1" });
  ledger.release({ amount: 39999, contributor: "c2", key: "r2" });
  assert.equal(ledger.balances().held, 1);
  assert.equal(ledger.status(), "partially released");
});

// Extends "refunding everything in one entry closes the ledger": in several refund entries.
test("private: refunding everything in several entries closes the ledger on the last one", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f1" });
  for (let i = 1; i <= 4; i++) {
    ledger.refund({ amount: 10000, key: `x${i}` });
    assert.equal(ledger.status(), "funded");
  }
  ledger.refund({ amount: 10000, key: "x5" });
  assert.equal(ledger.balances().held, 0);
  assert.equal(ledger.balances().refunded, 50000);
  assert.equal(ledger.status(), "closed");
  assertClosedToEverything(ledger, "a");
});

// Extends "releasing everything closes the ledger and later calls fail with closed": in several releases to several contributors.
test("private: releasing everything in several entries closes the ledger on the last one", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 30000, key: "f1" });
  ledger.fund({ amount: 20000, key: "f2" });
  ledger.release({ amount: 25000, contributor: "c1", key: "r1" });
  assert.equal(ledger.status(), "partially released");
  ledger.release({ amount: 24999, contributor: "c2", key: "r2" });
  assert.equal(ledger.status(), "partially released");
  ledger.release({ amount: 1, contributor: "c3", key: "r3" });
  assert.equal(ledger.status(), "closed");
  assert.equal(ledger.balances().released, 50000);
  assertClosedToEverything(ledger, "b");
});

// Extends "the ledger closes on the entry that leaves nothing held, not before": a refund closes it after a release.
test("private: a refund that empties a partially released ledger closes it", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f1" });
  ledger.release({ amount: 20000, contributor: "c1", key: "r1" });
  ledger.fund({ amount: 1000, key: "f2" });
  ledger.refund({ amount: 31000, key: "x1" });
  assert.equal(ledger.balances().held, 0);
  assert.equal(ledger.status(), "closed");
  assertClosedToEverything(ledger, "c");
});

// Extends "releasing everything closes the ledger and later calls fail with closed": at the 10000 bps and minimum-amount edges.
test("private: a single release of the minimum amount at 10000 bps closes the ledger", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 10000 });
  ledger.fund({ amount: 1, key: "f1" });
  const entry = ledger.release({ amount: 1, contributor: "c1", key: "r1" });
  assert.equal(entry.fee, 1);
  assert.equal(entry.net, 0);
  assert.equal(ledger.status(), "closed");
  assertClosedToEverything(ledger, "d");
});

// Extends "releasing everything closes the ledger and later calls fail with closed": a rejected call does not close it.
test("private: rejected calls on an open or funded ledger do not change its status", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  rejects(() => ledger.refund({ amount: 1, key: "x0" }), "insufficient_funds");
  assert.equal(ledger.status(), "open");
  ledger.fund({ amount: 100, key: "f1" });
  rejects(() => ledger.release({ amount: 101, contributor: "c1", key: "r1" }), "insufficient_funds");
  rejects(() => ledger.release({ amount: 0, contributor: "c1", key: "r2" }), "invalid_amount");
  assert.equal(ledger.status(), "funded");
  ledger.release({ amount: 50, contributor: "c1", key: "r3" });
  rejects(() => ledger.refund({ amount: 51, key: "x1" }), "insufficient_funds");
  assert.equal(ledger.status(), "partially released");
});

// Extends "status moves from open to funded to partially released and stays there": each ledger has its own status.
test("private: two ledgers keep their own status and balances", () => {
  const a = new Ledger({ currency: "USD", feeRateBps: 1000 });
  const b = new Ledger({ currency: "EUR", feeRateBps: 500 });
  a.fund({ amount: 100, key: "k" });
  assert.equal(a.status(), "funded");
  assert.equal(b.status(), "open");
  b.fund({ amount: 300, key: "k" });
  a.release({ amount: 100, contributor: "c1", key: "r" });
  assert.equal(a.status(), "closed");
  assert.equal(b.status(), "funded");
  assert.equal(b.balances().held, 300);
  assert.equal(b.paidTo("c1"), 0);
  b.release({ amount: 100, contributor: "c1", key: "r" });
  assert.equal(b.status(), "partially released");
  assert.equal(b.paidTo("c1"), 95);
  assert.equal(a.paidTo("c1"), 90);
});
