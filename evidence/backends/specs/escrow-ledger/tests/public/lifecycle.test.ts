import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, LedgerError } from "../../src/index.js";

test("[happy-4] status follows funding, partial release, later funding and refunds", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  assert.equal(ledger.status(), "open");
  ledger.fund({ amount: 50000, key: "fund-1" });
  assert.equal(ledger.status(), "funded");
  ledger.release({ amount: 20000, contributor: "c1", key: "release-1" });
  assert.equal(ledger.status(), "partially released");
  ledger.fund({ amount: 5000, key: "fund-2" });
  assert.equal(ledger.status(), "partially released");
  ledger.refund({ amount: 10000, key: "refund-1" });
  assert.equal(ledger.status(), "partially released");
  ledger.release({ amount: 5000, contributor: "c2", key: "release-2" });
  assert.equal(ledger.status(), "partially released");
  ledger.refund({ amount: 20000, key: "refund-2" });
  assert.equal(ledger.status(), "closed");
});

test("[happy-4] refunds before any release leave the ledger funded with one unit held", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "fund-1" });
  ledger.refund({ amount: 49999, key: "refund-1" });
  assert.equal(ledger.balances().held, 1);
  assert.equal(ledger.status(), "funded");
  ledger.fund({ amount: 1, key: "fund-2" });
  ledger.refund({ amount: 1, key: "refund-2" });
  assert.equal(ledger.balances().held, 1);
  assert.equal(ledger.status(), "funded");
});

test("[boundary-2] a single full release or refund closes and forbids new entries of every kind", () => {
  for (const kind of ["release", "refund"] as const) {
    const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
    ledger.fund({ amount: 50000, key: "fund" });
    if (kind === "release") {
      ledger.release({ amount: 50000, contributor: "c1", key: "close" });
    } else {
      ledger.refund({ amount: 50000, key: "close" });
    }
    assert.equal(ledger.balances().held, 0);
    assert.equal(ledger.status(), "closed");
    const before = {
      balances: { ...ledger.balances() },
      entries: ledger.entries().map((entry) => ({ ...entry })),
      paid: ledger.paidTo("c1"),
    };
    const calls = [
      () => ledger.fund({ amount: 1, key: "later-fund" }),
      () => ledger.release({ amount: 1, contributor: "c1", key: "later-release" }),
      () => ledger.refund({ amount: 1, key: "later-refund" }),
    ];
    for (const call of calls) {
      assert.throws(call, (error: unknown) => error instanceof LedgerError && error.code === "closed");
      assert.deepEqual({
        balances: { ...ledger.balances() },
        entries: ledger.entries().map((entry) => ({ ...entry })),
        paid: ledger.paidTo("c1"),
      }, before);
      assert.equal(ledger.status(), "closed");
    }
  }
});

test("[boundary-2] multiple releases, refunds or mixed payouts close on the last held unit", () => {
  for (const first of ["release", "refund"] as const) {
    for (const last of ["release", "refund"] as const) {
      const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
      ledger.fund({ amount: 50000, key: "fund" });
      if (first === "release") {
        ledger.release({ amount: 49999, contributor: "c1", key: "first" });
      } else {
        ledger.refund({ amount: 49999, key: "first" });
      }
      assert.equal(ledger.balances().held, 1);
      assert.equal(ledger.status(), first === "release" ? "partially released" : "funded");
      if (last === "release") {
        ledger.release({ amount: 1, contributor: "c1", key: "last" });
      } else {
        ledger.refund({ amount: 1, key: "last" });
      }
      assert.equal(ledger.balances().held, 0);
      assert.equal(ledger.status(), "closed");
    }
  }
});
