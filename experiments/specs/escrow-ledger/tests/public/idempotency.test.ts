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
    paidToC1: ledger.paidTo("c1"),
  };
}

function funded(amount: number): Ledger {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount, key: "fund-1" });
  return ledger;
}

// Repeating a call with the same key returns the original entry

test("repeating a release with key k1 returns the original entry and changes nothing", () => {
  const ledger = funded(50000);
  const original = ledger.release({ amount: 20000, contributor: "c1", key: "k1" });
  const before = snapshot(ledger);
  const repeated = ledger.release({ amount: 20000, contributor: "c1", key: "k1" });
  assert.deepEqual(repeated, original);
  assert.deepEqual(snapshot(ledger), before);
  assert.equal(ledger.entries().length, 2);
  assert.equal(ledger.balances().held, 30000);
});

test("a repeated release returns the original entry even when it would no longer be covered", () => {
  const ledger = funded(50000);
  const original = ledger.release({ amount: 20000, contributor: "c1", key: "k1" });
  ledger.refund({ amount: 25000, key: "x1" });
  assert.equal(ledger.balances().held, 5000);
  const before = snapshot(ledger);
  const repeated = ledger.release({ amount: 20000, contributor: "c1", key: "k1" });
  assert.deepEqual(repeated, original);
  assert.deepEqual(snapshot(ledger), before);
});

// Reusing a key for a different call is refused

test("reusing k1 with a different amount or contributor fails with key_conflict", () => {
  const ledger = funded(50000);
  ledger.release({ amount: 20000, contributor: "c1", key: "k1" });
  const before = snapshot(ledger);
  rejects(() => ledger.release({ amount: 10000, contributor: "c1", key: "k1" }), "key_conflict");
  rejects(() => ledger.release({ amount: 20000, contributor: "c2", key: "k1" }), "key_conflict");
  rejects(() => ledger.refund({ amount: 20000, key: "k1" }), "key_conflict");
  rejects(() => ledger.fund({ amount: 20000, key: "k1" }), "key_conflict");
  assert.deepEqual(snapshot(ledger), before);
  assert.equal(ledger.paidTo("c2"), 0);
});

test("reusing a fund's key for a refund of the same amount fails with key_conflict", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f1" });
  ledger.fund({ amount: 10000, key: "f2" });
  const before = snapshot(ledger);
  rejects(() => ledger.refund({ amount: 10000, key: "f2" }), "key_conflict");
  assert.deepEqual(snapshot(ledger), before);
});

// A rejected call does not use up its key

test("after a call with key k2 is rejected, a valid call with k2 succeeds", () => {
  const ledger = funded(50000);
  rejects(() => ledger.refund({ amount: 50001, key: "k2" }), "insufficient_funds");
  const entry = ledger.refund({ amount: 10000, key: "k2" });
  assert.equal(entry.kind, "refund");
  assert.equal(entry.amount, 10000);
  assert.equal(entry.key, "k2");
  assert.equal(ledger.balances().held, 40000);
});

test("a key rejected on an empty ledger is free for its first entry", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  rejects(() => ledger.fund({ amount: 0, key: "k2" }), "invalid_amount");
  rejects(() => ledger.release({ amount: 100, contributor: "c1", key: "k2" }), "insufficient_funds");
  assert.equal(ledger.status(), "open");
  assert.deepEqual(ledger.entries(), []);
  const entry = ledger.fund({ amount: 100, key: "k2" });
  assert.equal(entry.sequence, 1);
  assert.equal(ledger.balances().held, 100);
});

// A retry after the ledger closed still returns the original entry

test("repeating the release that closed the ledger returns the original entry", () => {
  const ledger = funded(50000);
  const original = ledger.release({ amount: 50000, contributor: "c1", key: "k3" });
  assert.equal(ledger.status(), "closed");
  const before = snapshot(ledger);
  const repeated = ledger.release({ amount: 50000, contributor: "c1", key: "k3" });
  assert.deepEqual(repeated, original);
  assert.deepEqual(snapshot(ledger), before);
});

test("after closing, repeating an earlier release and the closing one both return their originals", () => {
  const ledger = funded(50000);
  const first = ledger.release({ amount: 20000, contributor: "c1", key: "k1" });
  const closing = ledger.release({ amount: 30000, contributor: "c1", key: "k3" });
  assert.equal(ledger.status(), "closed");
  const before = snapshot(ledger);
  assert.deepEqual(ledger.release({ amount: 30000, contributor: "c1", key: "k3" }), closing);
  assert.deepEqual(ledger.release({ amount: 20000, contributor: "c1", key: "k1" }), first);
  assert.deepEqual(snapshot(ledger), before);
});
