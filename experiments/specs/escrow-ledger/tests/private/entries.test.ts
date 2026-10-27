import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, LedgerError } from "../../src/index.js";
import type { Entry, LedgerErrorCode } from "../../src/index.js";

function rejects(fn: () => unknown, code: LedgerErrorCode): void {
  assert.throws(fn, (error: unknown) => {
    if (!(error instanceof LedgerError)) throw new assert.AssertionError({ message: `expected a LedgerError, got ${String(error)}` });
    assert.equal(error.code, code);
    return true;
  });
}

function assertBalanced(ledger: Ledger): void {
  const { funded, held, released, refunded } = ledger.balances();
  assert.equal(funded, held + released + refunded);
}

// Extends "entries are listed in order with kind, amount, key, sequence and release details": many more entries.
test("private: thirty entries are listed in order with consecutive sequences from 1", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 250 });
  const returned: Entry[] = [];
  const expected: Array<{ kind: string; amount: number; key: string }> = [];
  for (let i = 1; i <= 10; i++) {
    returned.push(ledger.fund({ amount: i * 1000, key: `f${i}` }));
    expected.push({ kind: "fund", amount: i * 1000, key: `f${i}` });
    returned.push(ledger.release({ amount: i * 100, contributor: `c${i}`, key: `r${i}` }));
    expected.push({ kind: "release", amount: i * 100, key: `r${i}` });
    returned.push(ledger.refund({ amount: i * 10, key: `x${i}` }));
    expected.push({ kind: "refund", amount: i * 10, key: `x${i}` });
    assertBalanced(ledger);
  }
  const entries = ledger.entries();
  assert.equal(entries.length, 30);
  entries.forEach((entry, index) => {
    assert.equal(entry.sequence, index + 1);
    assert.equal(entry.kind, expected[index].kind);
    assert.equal(entry.amount, expected[index].amount);
    assert.equal(entry.key, expected[index].key);
  });
  assert.deepEqual(entries, returned);
});

// Extends "entries are listed in order with kind, amount, key, sequence and release details": each release's own details.
test("private: each listed release carries its own contributor, fee and net", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 250 });
  ledger.fund({ amount: 10000, key: "f1" });
  ledger.release({ amount: 100, contributor: "alice", key: "r1" }); // 2.5 -> 2
  ledger.release({ amount: 300, contributor: "bob", key: "r2" }); // 7.5 -> 8
  ledger.refund({ amount: 50, key: "x1" });
  ledger.release({ amount: 1001, contributor: "alice", key: "r3" }); // 25.025 -> 25
  const releases = ledger.entries().filter((e) => e.kind === "release");
  assert.equal(releases.length, 3);
  const details = releases.map((e) => (e.kind === "release" ? [e.sequence, e.contributor, e.amount, e.fee, e.net] : []));
  assert.deepEqual(details, [
    [2, "alice", 100, 2, 98],
    [3, "bob", 300, 8, 292],
    [5, "alice", 1001, 25, 976],
  ]);
  assert.equal(ledger.paidTo("alice"), 98 + 976);
  assert.equal(ledger.paidTo("bob"), 292);
  assert.equal(ledger.balances().fees, 35);
});

// Extends "the returned entry matches the listed entry and sequences skip neither retries nor rejections": every kind of rejection.
test("private: sequences skip no number across retries and every kind of rejection", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  const a = ledger.fund({ amount: 50000, key: "a" });
  rejects(() => ledger.fund({ amount: 0, key: "z1" }), "invalid_amount");
  rejects(() => ledger.release({ amount: 50001, contributor: "c1", key: "z2" }), "insufficient_funds");
  rejects(() => ledger.refund({ amount: 50000, key: "a" }), "key_conflict");
  assert.deepEqual(ledger.fund({ amount: 50000, key: "a" }), a);
  const b = ledger.refund({ amount: 1000, key: "b" });
  rejects(() => ledger.release({ amount: 2.5, contributor: "c1", key: "z3" }), "invalid_amount");
  assert.deepEqual(ledger.refund({ amount: 1000, key: "b" }), b);
  rejects(() => ledger.fund({ amount: 1000, key: "b" }), "key_conflict");
  const c = ledger.release({ amount: 9000, contributor: "c1", key: "c" });
  const d = ledger.fund({ amount: 1, key: "d" });
  const e = ledger.release({ amount: 40001, contributor: "c2", key: "e" });
  assert.equal(ledger.status(), "closed");
  rejects(() => ledger.fund({ amount: 1, key: "f" }), "closed");
  assert.deepEqual(
    [a, b, c, d, e].map((x) => x.sequence),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(ledger.entries(), [a, b, c, d, e]);
  assertBalanced(ledger);
  const balances = ledger.balances();
  assert.equal(balances.funded, 50001);
  assert.equal(balances.held, 0);
  assert.equal(balances.released, 49001);
  assert.equal(balances.refunded, 1000);
  assert.equal(balances.fees, 900 + 4000);
});

// Extends "entries are listed in order with kind, amount, key, sequence and release details": the closing entry is listed.
test("private: the entry that closes the ledger is listed last and the record balances", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f1" });
  ledger.release({ amount: 20000, contributor: "c1", key: "r1" });
  const closing = ledger.refund({ amount: 30000, key: "x1" });
  const entries = ledger.entries();
  assert.equal(entries.length, 3);
  assert.deepEqual(entries[2], closing);
  assert.equal(closing.kind, "refund");
  assert.equal(closing.sequence, 3);
  assertBalanced(ledger);
  assert.equal(ledger.balances().funded, 50000);
  assert.equal(ledger.balances().held, 0);
});

// Extends "a new ledger has no entries and zero balances that still balance": each ledger has its own record.
test("private: two ledgers keep separate entries, each numbered from 1", () => {
  const a = new Ledger({ currency: "USD", feeRateBps: 1000 });
  const b = new Ledger({ currency: "USD", feeRateBps: 1000 });
  a.fund({ amount: 100, key: "a1" });
  a.fund({ amount: 200, key: "a2" });
  assert.deepEqual(b.entries(), []);
  assert.equal(b.balances().funded, 0);
  const first = b.fund({ amount: 300, key: "b1" });
  assert.equal(first.sequence, 1);
  const third = a.fund({ amount: 400, key: "a3" });
  assert.equal(third.sequence, 3);
  assert.equal(a.entries().length, 3);
  assert.equal(b.entries().length, 1);
  assert.equal(a.balances().funded, 700);
  assert.equal(b.balances().funded, 300);
});

// Extends "the returned entry matches the listed entry ...": each kind's returned entry has its kind, amount, key and sequence.
test("private: returned fund, refund and release entries carry their kind, amount, key and sequence", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 3333 });
  const fund = ledger.fund({ amount: 777, key: "fund-key" });
  const refund = ledger.refund({ amount: 77, key: "refund-key" });
  const release = ledger.release({ amount: 7, contributor: "c9", key: "release-key" });
  assert.deepEqual([fund.kind, fund.amount, fund.key, fund.sequence], ["fund", 777, "fund-key", 1]);
  assert.deepEqual([refund.kind, refund.amount, refund.key, refund.sequence], ["refund", 77, "refund-key", 2]);
  // 7 * 3333 / 10000 = 2.3331 -> 2
  assert.deepEqual(
    [release.kind, release.amount, release.key, release.sequence, release.contributor, release.fee, release.net],
    ["release", 7, "release-key", 3, "c9", 2, 5],
  );
  assert.deepEqual(ledger.entries(), [fund, refund, release]);
});
