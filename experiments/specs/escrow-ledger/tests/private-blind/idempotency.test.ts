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

function snapshot(ledger: Ledger, contributors: string[] = []) {
  return {
    status: ledger.status(),
    balances: ledger.balances(),
    entries: ledger.entries(),
    paid: contributors.map((c) => ledger.paidTo(c)),
  };
}

test("repeating the spec's release with the same key returns the original entry and moves nothing", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f" });
  const original = ledger.release({ amount: 20000, contributor: "c1", key: "k1" });
  const before = snapshot(ledger, ["c1"]);
  const again = ledger.release({ amount: 20000, contributor: "c1", key: "k1" });
  assert.deepEqual(again, original);
  assert.deepEqual(snapshot(ledger, ["c1"]), before);
  assert.equal(ledger.balances().held, 30000);
  assert.equal(ledger.paidTo("c1"), 18000);
});

test("repeating a release many times, after other entries, still returns the original entry", () => {
  const ledger = new Ledger({ currency: "EUR", feeRateBps: 333 });
  ledger.fund({ amount: 70000, key: "fund-a" });
  const original = ledger.release({ amount: 12345, contributor: "dev-7", key: "payout-1" });
  ledger.fund({ amount: 100, key: "fund-b" });
  ledger.refund({ amount: 50, key: "back-a" });
  const before = snapshot(ledger, ["dev-7"]);
  for (let i = 0; i < 5; i++) {
    const again = ledger.release({ amount: 12345, contributor: "dev-7", key: "payout-1" });
    assert.deepEqual(again, original);
    assert.equal(again.sequence, 2);
  }
  assert.deepEqual(snapshot(ledger, ["dev-7"]), before);
  assert.equal(ledger.entries().length, 4);
});

test("repeating a fund with the same key returns the original entry and funds once", () => {
  const ledger = new Ledger({ currency: "GBP", feeRateBps: 0 });
  const original = ledger.fund({ amount: 4242, key: "deposit" });
  const again = ledger.fund({ amount: 4242, key: "deposit" });
  const third = ledger.fund({ amount: 4242, key: "deposit" });
  assert.deepEqual(again, original);
  assert.deepEqual(third, original);
  assert.equal(ledger.balances().funded, 4242);
  assert.equal(ledger.balances().held, 4242);
  assert.equal(ledger.entries().length, 1);
});

test("repeating a refund with the same key returns the original entry and refunds once", () => {
  const ledger = new Ledger({ currency: "GBP", feeRateBps: 0 });
  ledger.fund({ amount: 900, key: "f" });
  const original = ledger.refund({ amount: 300, key: "rf-x" });
  const again = ledger.refund({ amount: 300, key: "rf-x" });
  assert.deepEqual(again, original);
  assert.equal(ledger.balances().refunded, 300);
  assert.equal(ledger.balances().held, 600);
  assert.equal(ledger.entries().length, 2);
});

test("a retried release returns its original entry even when the same release would now be refused", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 100, key: "f" });
  const original = ledger.release({ amount: 60, contributor: "m", key: "rel" });
  ledger.refund({ amount: 30, key: "rf" });
  // only 10 is held now, less than 60
  const before = snapshot(ledger, ["m"]);
  const again = ledger.release({ amount: 60, contributor: "m", key: "rel" });
  assert.deepEqual(again, original);
  assert.deepEqual(snapshot(ledger, ["m"]), before);
});

test("reusing the spec's key for a different kind, amount or contributor fails with key_conflict", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f" });
  const original = ledger.release({ amount: 20000, contributor: "c1", key: "k1" });
  const before = snapshot(ledger, ["c1", "c2"]);
  assertLedgerError(() => ledger.fund({ amount: 20000, key: "k1" }), "key_conflict");
  assertLedgerError(() => ledger.refund({ amount: 20000, key: "k1" }), "key_conflict");
  assertLedgerError(() => ledger.release({ amount: 10000, contributor: "c1", key: "k1" }), "key_conflict");
  assertLedgerError(() => ledger.release({ amount: 20000, contributor: "c2", key: "k1" }), "key_conflict");
  assert.deepEqual(snapshot(ledger, ["c1", "c2"]), before);
  assert.deepEqual(ledger.release({ amount: 20000, contributor: "c1", key: "k1" }), original);
});

test("reusing a fund key for anything else fails with key_conflict", () => {
  const ledger = new Ledger({ currency: "CHF", feeRateBps: 75 });
  const original = ledger.fund({ amount: 8000, key: "seed" });
  const before = snapshot(ledger, ["q"]);
  assertLedgerError(() => ledger.fund({ amount: 8001, key: "seed" }), "key_conflict");
  assertLedgerError(() => ledger.fund({ amount: 1, key: "seed" }), "key_conflict");
  assertLedgerError(() => ledger.refund({ amount: 8000, key: "seed" }), "key_conflict");
  assertLedgerError(() => ledger.release({ amount: 8000, contributor: "q", key: "seed" }), "key_conflict");
  assert.deepEqual(snapshot(ledger, ["q"]), before);
  assert.deepEqual(ledger.fund({ amount: 8000, key: "seed" }), original);
});

test("reusing a refund key for anything else fails with key_conflict", () => {
  const ledger = new Ledger({ currency: "CHF", feeRateBps: 75 });
  ledger.fund({ amount: 8000, key: "f" });
  ledger.refund({ amount: 250, key: "give-back" });
  const before = snapshot(ledger, ["q"]);
  assertLedgerError(() => ledger.refund({ amount: 251, key: "give-back" }), "key_conflict");
  assertLedgerError(() => ledger.fund({ amount: 250, key: "give-back" }), "key_conflict");
  assertLedgerError(() => ledger.release({ amount: 250, contributor: "q", key: "give-back" }), "key_conflict");
  assert.deepEqual(snapshot(ledger, ["q"]), before);
});

test("reusing a release key with only a different contributor fails with key_conflict", () => {
  const ledger = new Ledger({ currency: "NOK", feeRateBps: 1200 });
  ledger.fund({ amount: 5000, key: "f" });
  ledger.release({ amount: 1000, contributor: "ann", key: "gate-1" });
  ledger.release({ amount: 1000, contributor: "ben", key: "gate-2" });
  const before = snapshot(ledger, ["ann", "ben"]);
  assertLedgerError(() => ledger.release({ amount: 1000, contributor: "ben", key: "gate-1" }), "key_conflict");
  assertLedgerError(() => ledger.release({ amount: 1000, contributor: "ann", key: "gate-2" }), "key_conflict");
  assertLedgerError(() => ledger.release({ amount: 999, contributor: "ann", key: "gate-1" }), "key_conflict");
  assert.deepEqual(snapshot(ledger, ["ann", "ben"]), before);
});

test("a key rejected for insufficient funds can be used for a valid release", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f" });
  assertLedgerError(() => ledger.release({ amount: 60000, contributor: "c1", key: "k2" }), "insufficient_funds");
  const entry = ledger.release({ amount: 20000, contributor: "c1", key: "k2" });
  assert.equal(entry.key, "k2");
  assert.equal(entry.amount, 20000);
  assert.equal(entry.sequence, 2);
  assert.equal(ledger.balances().held, 30000);
});

test("a key rejected for an invalid amount can be used for a call of another kind", () => {
  const ledger = new Ledger({ currency: "SGD", feeRateBps: 50 });
  ledger.fund({ amount: 1000, key: "f" });
  assertLedgerError(() => ledger.fund({ amount: 0, key: "retry-me" }), "invalid_amount");
  const entry = ledger.refund({ amount: 400, key: "retry-me" });
  assert.equal(entry.kind, "refund");
  assert.equal(entry.key, "retry-me");
  assert.equal(ledger.balances().held, 600);
  // and that call is now the one the key repeats
  assert.deepEqual(ledger.refund({ amount: 400, key: "retry-me" }), entry);
  assertLedgerError(() => ledger.fund({ amount: 1, key: "retry-me" }), "key_conflict");
});

test("a key rejected on a never-funded ledger can be used once there is money", () => {
  const ledger = new Ledger({ currency: "SGD", feeRateBps: 50 });
  assertLedgerError(() => ledger.refund({ amount: 10, key: "early" }), "insufficient_funds");
  assertLedgerError(() => ledger.release({ amount: 10, contributor: "u", key: "early" }), "insufficient_funds");
  const fund = ledger.fund({ amount: 10, key: "early" });
  assert.equal(fund.key, "early");
  assert.equal(fund.sequence, 1);
  assert.equal(ledger.balances().held, 10);
});

test("a key rejected with a fractional amount can be reused with a whole one", () => {
  const ledger = new Ledger({ currency: "SGD", feeRateBps: 50 });
  ledger.fund({ amount: 2000, key: "f" });
  assertLedgerError(() => ledger.release({ amount: 10.5, contributor: "v", key: "kx" }), "invalid_amount");
  const entry = ledger.release({ amount: 11, contributor: "w", key: "kx" });
  assert.equal(entry.contributor, "w");
  assert.equal(entry.amount, 11);
  assert.equal(ledger.paidTo("v"), 0);
});

test("retrying the release that closed the ledger returns the original entry instead of failing", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f" });
  const original = ledger.release({ amount: 50000, contributor: "c1", key: "k3" });
  assert.equal(ledger.status(), "closed");
  const before = snapshot(ledger, ["c1"]);
  assert.deepEqual(ledger.release({ amount: 50000, contributor: "c1", key: "k3" }), original);
  assert.deepEqual(snapshot(ledger, ["c1"]), before);
});

test("retrying the closing release after partial releases returns the original entry", () => {
  const ledger = new Ledger({ currency: "EUR", feeRateBps: 250 });
  ledger.fund({ amount: 3000, key: "fa" });
  ledger.release({ amount: 1700, contributor: "lee", key: "ra" });
  const original = ledger.release({ amount: 1300, contributor: "kim", key: "final" });
  assert.equal(ledger.status(), "closed");
  const before = snapshot(ledger, ["lee", "kim"]);
  const again = ledger.release({ amount: 1300, contributor: "kim", key: "final" });
  assert.deepEqual(again, original);
  assert.equal(again.sequence, 3);
  assert.deepEqual(snapshot(ledger, ["lee", "kim"]), before);
});

test("retrying the refund that closed the ledger returns the original entry", () => {
  const ledger = new Ledger({ currency: "EUR", feeRateBps: 250 });
  ledger.fund({ amount: 3000, key: "fa" });
  ledger.release({ amount: 1000, contributor: "lee", key: "ra" });
  const original = ledger.refund({ amount: 2000, key: "close-out" });
  assert.equal(ledger.status(), "closed");
  const before = snapshot(ledger, ["lee"]);
  assert.deepEqual(ledger.refund({ amount: 2000, key: "close-out" }), original);
  assert.deepEqual(snapshot(ledger, ["lee"]), before);
});

test("retrying earlier calls on a closed ledger returns their original entries", () => {
  const ledger = new Ledger({ currency: "EUR", feeRateBps: 250 });
  const fund = ledger.fund({ amount: 3000, key: "fa" });
  const release = ledger.release({ amount: 1000, contributor: "lee", key: "ra" });
  ledger.refund({ amount: 2000, key: "close-out" });
  assert.equal(ledger.status(), "closed");
  const before = snapshot(ledger, ["lee"]);
  assert.deepEqual(ledger.fund({ amount: 3000, key: "fa" }), fund);
  assert.deepEqual(ledger.release({ amount: 1000, contributor: "lee", key: "ra" }), release);
  assert.deepEqual(snapshot(ledger, ["lee"]), before);
  assertLedgerError(() => ledger.fund({ amount: 3000, key: "fb" }), "closed");
});
