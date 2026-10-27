import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, LedgerError } from "../../src/index.js";
import type { LedgerErrorCode, ReleaseEntry } from "../../src/index.js";

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
    paid: [ledger.paidTo("c1"), ledger.paidTo("c2")],
  };
}

function funded(amount: number): Ledger {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount, key: "fund-1" });
  return ledger;
}

// Extends "repeating a release with key k1 returns the original entry and changes nothing": fundings.
test("private: repeating a funding returns the original entry and adds nothing", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  const original = ledger.fund({ amount: 50000, key: "f1" });
  const before = snapshot(ledger);
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(ledger.fund({ amount: 50000, key: "f1" }), original);
  }
  assert.deepEqual(snapshot(ledger), before);
  assert.equal(ledger.balances().funded, 50000);
  assert.equal(ledger.entries().length, 1);
});

// Extends "repeating a release with key k1 returns the original entry and changes nothing": refunds.
test("private: repeating a refund returns the original entry and refunds nothing more", () => {
  const ledger = funded(50000);
  const original = ledger.refund({ amount: 10000, key: "x1" });
  const before = snapshot(ledger);
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(ledger.refund({ amount: 10000, key: "x1" }), original);
  }
  assert.deepEqual(snapshot(ledger), before);
  assert.equal(ledger.balances().refunded, 10000);
  assert.equal(ledger.balances().held, 40000);
});

// Extends "repeating a release with key k1 returns the original entry and changes nothing": retried many times.
test("private: repeating a release many times pays the contributor once", () => {
  const ledger = funded(50000);
  const original = ledger.release({ amount: 20000, contributor: "c1", key: "k1" });
  for (let i = 0; i < 10; i++) {
    assert.deepEqual(ledger.release({ amount: 20000, contributor: "c1", key: "k1" }), original);
  }
  assert.equal(ledger.paidTo("c1"), 18000);
  assert.equal(ledger.balances().fees, 2000);
  assert.equal(ledger.balances().released, 20000);
  assert.equal(ledger.balances().held, 30000);
  assert.equal(ledger.entries().length, 2);
  assert.equal(ledger.status(), "partially released");
});

// Extends "repeating a release with key k1 returns the original entry and changes nothing": after later entries.
test("private: a retry after later entries returns its own original entry, not the latest", () => {
  const ledger = funded(50000);
  const first = ledger.release({ amount: 20000, contributor: "c1", key: "k1" });
  const fund = ledger.fund({ amount: 7000, key: "f2" });
  const refund = ledger.refund({ amount: 3000, key: "x1" });
  ledger.release({ amount: 1000, contributor: "c2", key: "k2" });
  const before = snapshot(ledger);
  const repeated = ledger.release({ amount: 20000, contributor: "c1", key: "k1" });
  assert.deepEqual(repeated, first);
  assert.equal(repeated.sequence, 2);
  assert.equal(repeated.amount, 20000);
  assert.equal(repeated.contributor, "c1");
  assert.equal(repeated.fee, 2000);
  assert.equal(repeated.net, 18000);
  assert.deepEqual(ledger.fund({ amount: 7000, key: "f2" }), fund);
  assert.deepEqual(ledger.refund({ amount: 3000, key: "x1" }), refund);
  assert.equal(ledger.fund({ amount: 50000, key: "fund-1" }).sequence, 1);
  assert.deepEqual(snapshot(ledger), before);
});

// Extends "a repeated release returns the original entry even when it would no longer be covered": a refund retry.
test("private: a repeated refund returns the original entry even when it would no longer be covered", () => {
  const ledger = funded(50000);
  const original = ledger.refund({ amount: 30000, key: "x1" });
  ledger.release({ amount: 15000, contributor: "c1", key: "r1" });
  assert.equal(ledger.balances().held, 5000);
  const before = snapshot(ledger);
  assert.deepEqual(ledger.refund({ amount: 30000, key: "x1" }), original);
  assert.deepEqual(snapshot(ledger), before);
});

// Extends "repeating the release that closed the ledger returns the original entry": a refund that closed it.
test("private: repeating the refund that closed the ledger returns the original entry", () => {
  const ledger = funded(50000);
  ledger.release({ amount: 10000, contributor: "c1", key: "r1" });
  const closing = ledger.refund({ amount: 40000, key: "x3" });
  assert.equal(ledger.status(), "closed");
  const before = snapshot(ledger);
  assert.deepEqual(ledger.refund({ amount: 40000, key: "x3" }), closing);
  assert.deepEqual(snapshot(ledger), before);
  assert.equal(ledger.status(), "closed");
});

// Extends "after closing, repeating an earlier release and the closing one both return their originals": every kind.
test("private: after closing, repeating a funding, a refund and a release each return their originals", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 250 });
  const fund1 = ledger.fund({ amount: 300, key: "f1" });
  const fund2 = ledger.fund({ amount: 200, key: "f2" });
  const refund = ledger.refund({ amount: 100, key: "x1" });
  const release = ledger.release({ amount: 100, contributor: "c1", key: "r1" });
  const closing = ledger.release({ amount: 300, contributor: "c2", key: "k3" });
  assert.equal(ledger.status(), "closed");
  const before = snapshot(ledger);
  assert.deepEqual(ledger.release({ amount: 300, contributor: "c2", key: "k3" }), closing);
  assert.deepEqual(ledger.release({ amount: 100, contributor: "c1", key: "r1" }), release);
  assert.deepEqual(ledger.refund({ amount: 100, key: "x1" }), refund);
  assert.deepEqual(ledger.fund({ amount: 200, key: "f2" }), fund2);
  assert.deepEqual(ledger.fund({ amount: 300, key: "f1" }), fund1);
  assert.deepEqual(snapshot(ledger), before);
  assert.equal(ledger.paidTo("c1"), 98);
  assert.equal(ledger.paidTo("c2"), 292);
});

// Extends "reusing k1 with a different amount or contributor fails with key_conflict": fundings and refunds.
test("private: reusing a funding's or a refund's key with a different amount fails with key_conflict", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f1" });
  ledger.refund({ amount: 10000, key: "x1" });
  const before = snapshot(ledger);
  rejects(() => ledger.fund({ amount: 50001, key: "f1" }), "key_conflict");
  rejects(() => ledger.fund({ amount: 1, key: "f1" }), "key_conflict");
  rejects(() => ledger.refund({ amount: 10001, key: "x1" }), "key_conflict");
  rejects(() => ledger.refund({ amount: 1, key: "x1" }), "key_conflict");
  assert.deepEqual(snapshot(ledger), before);
});

// Extends "reusing a fund's key for a refund of the same amount fails with key_conflict": other kinds, same amount.
test("private: reusing a key for another kind with the same amount fails with key_conflict", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f1" });
  ledger.fund({ amount: 10000, key: "f2" });
  ledger.refund({ amount: 5000, key: "x1" });
  ledger.release({ amount: 3000, contributor: "c1", key: "r1" });
  const before = snapshot(ledger);
  rejects(() => ledger.release({ amount: 10000, contributor: "c1", key: "f2" }), "key_conflict");
  rejects(() => ledger.release({ amount: 5000, contributor: "c1", key: "x1" }), "key_conflict");
  rejects(() => ledger.fund({ amount: 5000, key: "x1" }), "key_conflict");
  rejects(() => ledger.refund({ amount: 3000, key: "r1" }), "key_conflict");
  rejects(() => ledger.fund({ amount: 3000, key: "r1" }), "key_conflict");
  assert.deepEqual(snapshot(ledger), before);
});

// Extends "reusing k1 with a different amount or contributor fails with key_conflict": both amount and contributor differ.
test("private: reusing a release's key with a different amount and contributor fails with key_conflict and pays no one", () => {
  const ledger = funded(50000);
  ledger.release({ amount: 20000, contributor: "c1", key: "k1" });
  ledger.release({ amount: 5000, contributor: "c2", key: "k2" });
  const before = snapshot(ledger);
  rejects(() => ledger.release({ amount: 5000, contributor: "c2", key: "k1" }), "key_conflict");
  rejects(() => ledger.release({ amount: 20000, contributor: "c1", key: "k2" }), "key_conflict");
  rejects(() => ledger.release({ amount: 1, contributor: "c3", key: "k1" }), "key_conflict");
  assert.deepEqual(snapshot(ledger), before);
  assert.equal(ledger.paidTo("c3"), 0);
});

// Extends "after a call with key k2 is rejected, a valid call with k2 succeeds": other rejections and kinds.
test("private: a key rejected for an invalid amount or insufficient funds is free for a different valid call", () => {
  const ledger = funded(50000);
  rejects(() => ledger.release({ amount: 1.5, contributor: "c1", key: "k2" }), "invalid_amount");
  rejects(() => ledger.release({ amount: 60000, contributor: "c1", key: "k2" }), "insufficient_funds");
  rejects(() => ledger.refund({ amount: -5, key: "k2" }), "invalid_amount");
  const entry = ledger.release({ amount: 20000, contributor: "c2", key: "k2" });
  assert.equal(entry.kind, "release");
  assert.equal(entry.amount, 20000);
  assert.equal(entry.contributor, "c2");
  assert.equal(entry.key, "k2");
  assert.equal(entry.sequence, 2);
  assert.equal(ledger.paidTo("c2"), 18000);
  assert.equal(ledger.paidTo("c1"), 0);
  // The accepted call now owns the key.
  assert.deepEqual(ledger.release({ amount: 20000, contributor: "c2", key: "k2" }), entry);
  rejects(() => ledger.release({ amount: 10000, contributor: "c1", key: "k2" }), "key_conflict");
});

// Extends "after a call with key k2 is rejected, a valid call with k2 succeeds": the same call, once it is covered.
test("private: a release rejected for insufficient funds succeeds with the same key once it is covered", () => {
  const ledger = funded(10000);
  rejects(() => ledger.release({ amount: 15000, contributor: "c1", key: "k2" }), "insufficient_funds");
  ledger.fund({ amount: 5000, key: "f2" });
  const entry = ledger.release({ amount: 15000, contributor: "c1", key: "k2" });
  assert.equal(entry.sequence, 3);
  assert.equal(entry.net, 13500);
  assert.equal(ledger.status(), "closed");
});

// Extends "a key rejected on an empty ledger is free for its first entry": a key rejected on a funded ledger used for a funding.
test("private: a key rejected for a refund is free for a later funding", () => {
  const ledger = funded(100);
  rejects(() => ledger.refund({ amount: 101, key: "k2" }), "insufficient_funds");
  const entry = ledger.fund({ amount: 101, key: "k2" });
  assert.equal(entry.kind, "fund");
  assert.equal(entry.sequence, 2);
  assert.equal(ledger.balances().held, 201);
});

// Extends "repeating a release with key k1 returns the original entry and changes nothing": keys belong to one ledger.
test("private: the same key on two ledgers makes two independent entries", () => {
  const a = new Ledger({ currency: "USD", feeRateBps: 1000 });
  const b = new Ledger({ currency: "USD", feeRateBps: 1000 });
  const fa = a.fund({ amount: 50000, key: "k1" });
  const fb = b.fund({ amount: 70000, key: "k1" });
  assert.equal(fa.amount, 50000);
  assert.equal(fb.amount, 70000);
  assert.equal(fb.sequence, 1);
  assert.equal(a.balances().held, 50000);
  assert.equal(b.balances().held, 70000);
  rejects(() => a.fund({ amount: 70000, key: "k1" }), "key_conflict");
});

// Extends "repeating a release with key k1 returns the original entry and changes nothing": interleaved retries.
test("private: interleaved retries of many calls add no entries and move no money", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 100000, key: "f" });
  const originals: ReleaseEntry[] = [];
  for (let i = 1; i <= 10; i++) {
    originals.push(ledger.release({ amount: i * 1000, contributor: `c${i % 2 + 1}`, key: `r${i}` }));
    for (let j = 1; j <= i; j++) {
      assert.deepEqual(ledger.release({ amount: j * 1000, contributor: `c${j % 2 + 1}`, key: `r${j}` }), originals[j - 1]);
    }
  }
  assert.equal(ledger.entries().length, 11);
  assert.equal(ledger.balances().released, 55000);
  assert.equal(ledger.balances().held, 45000);
  assert.equal(ledger.balances().fees, 5500);
  assert.equal(ledger.paidTo("c1"), (2 + 4 + 6 + 8 + 10) * 900);
  assert.equal(ledger.paidTo("c2"), (1 + 3 + 5 + 7 + 9) * 900);
});
