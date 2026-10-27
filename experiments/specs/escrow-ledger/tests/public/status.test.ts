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
  };
}

function funded(amount: number): Ledger {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount, key: "fund-1" });
  return ledger;
}

function assertClosedToEverything(ledger: Ledger): void {
  const before = snapshot(ledger);
  rejects(() => ledger.fund({ amount: 100, key: "late-f" }), "closed");
  rejects(() => ledger.release({ amount: 100, contributor: "c1", key: "late-r" }), "closed");
  rejects(() => ledger.refund({ amount: 100, key: "late-x" }), "closed");
  assert.deepEqual(snapshot(ledger), before);
}

// The status moves through open, funded, partially released and closed

test("status moves from open to funded to partially released and stays there", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  assert.equal(ledger.status(), "open");
  ledger.fund({ amount: 50000, key: "f1" });
  assert.equal(ledger.status(), "funded");
  ledger.release({ amount: 20000, contributor: "c1", key: "r1" });
  assert.equal(ledger.status(), "partially released");
  ledger.fund({ amount: 10000, key: "f2" });
  assert.equal(ledger.status(), "partially released");
  ledger.refund({ amount: 5000, key: "x1" });
  assert.equal(ledger.status(), "partially released");
});

test("a refund before any release leaves it funded, and 1 held after a release keeps it partially released", () => {
  const ledger = funded(50000);
  ledger.refund({ amount: 10000, key: "x1" });
  assert.equal(ledger.status(), "funded");
  ledger.release({ amount: 20000, contributor: "c1", key: "r1" });
  ledger.refund({ amount: 19999, key: "x2" });
  assert.equal(ledger.balances().held, 1);
  assert.equal(ledger.status(), "partially released");
});

// A release or refund that empties the ledger closes it

test("releasing everything closes the ledger and later calls fail with closed", () => {
  const ledger = funded(50000);
  ledger.release({ amount: 50000, contributor: "c1", key: "r1" });
  assert.equal(ledger.balances().held, 0);
  assert.equal(ledger.status(), "closed");
  assertClosedToEverything(ledger);
});

test("refunding everything in one entry closes the ledger", () => {
  const ledger = funded(50000);
  ledger.refund({ amount: 50000, key: "x1" });
  assert.equal(ledger.status(), "closed");
  assertClosedToEverything(ledger);
});

test("the ledger closes on the entry that leaves nothing held, not before", () => {
  const ledger = funded(50000);
  ledger.release({ amount: 20000, contributor: "c1", key: "r1" });
  ledger.refund({ amount: 29999, key: "x1" });
  assert.equal(ledger.status(), "partially released");
  ledger.release({ amount: 1, contributor: "c2", key: "r2" });
  assert.equal(ledger.status(), "closed");
  assertClosedToEverything(ledger);
});
