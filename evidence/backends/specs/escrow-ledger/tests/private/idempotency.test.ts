import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, LedgerError } from "../../src/index.js";
import type { Entry, EntryKind, LedgerErrorCode } from "../../src/index.js";

function expectError(action: () => unknown, code: LedgerErrorCode): void {
  assert.throws(action, (error: unknown) => error instanceof LedgerError && error.code === code);
}

function record(entry: Entry) {
  const base = { kind: entry.kind, amount: entry.amount, key: entry.key, sequence: entry.sequence };
  return entry.kind === "release"
    ? { ...base, contributor: entry.contributor, fee: entry.fee, net: entry.net }
    : base;
}

function snapshot(ledger: Ledger) {
  const { funded, held, released, refunded, fees } = ledger.balances();
  return {
    funded, held, released, refunded, fees, status: ledger.status(),
    entries: ledger.entries().map(record),
    paid: [ledger.paidTo("alice"), ledger.paidTo("bob"), ledger.paidTo("ALICE")],
  };
}

function invoke(ledger: Ledger, kind: EntryKind, amount: number, key: string, contributor = "alice"): Entry {
  return kind === "release" ? ledger.release({ amount, key, contributor }) : ledger[kind]({ amount, key });
}

// Extends public "retrying the same release returns its original entry without another movement".
test("[concurrency-1] a release retries one hundred times even when held is now smaller than its amount", () => {
  const ledger = new Ledger({ currency: "SGD", feeRateBps: 3333 });
  ledger.fund({ amount: 10001, key: "fund" });
  const original = record(ledger.release({ amount: 9000, contributor: "alice", key: "large-release" }));
  ledger.refund({ amount: 1000, key: "return" });
  const before = snapshot(ledger);
  for (let i = 0; i < 100; i++) {
    assert.deepEqual(record(ledger.release({ amount: 9000, contributor: "alice", key: "large-release" })), original);
    assert.deepEqual(snapshot(ledger), before);
  }
});

// Extends public "every entry kind can be retried after intervening entries": old keys beyond a short cache.
test("[concurrency-1] all historical keys survive two hundred forty intervening movements and reversed retries", () => {
  const ledger = new Ledger({ currency: "CAD", feeRateBps: 5000 });
  const calls: Array<() => Entry> = [() => ledger.fund({ amount: 100000, key: "initial" })];
  const originals = [record(calls[0]())];
  for (let i = 0; i < 80; i++) {
    const cycle: Array<() => Entry> = [
      () => ledger.fund({ amount: i + 2, key: `fund-${i}` }),
      () => ledger.release({ amount: i + 3, contributor: i % 2 === 0 ? "alice" : "bob", key: `pay-${i}` }),
      () => ledger.refund({ amount: i + 1, key: `refund-${i}` }),
    ];
    for (const call of cycle) {
      calls.push(call);
      originals.push(record(call()));
    }
  }
  const before = snapshot(ledger);
  for (let i = calls.length - 1; i >= 0; i--) {
    assert.deepEqual(record(calls[i]()), originals[i]);
  }
  assert.deepEqual(snapshot(ledger), before);
});

test("[concurrency-1] keys with property names, shared prefixes and long values remain distinct", () => {
  const ledger = new Ledger({ currency: "EUR", feeRateBps: 250 });
  ledger.fund({ amount: 10000, key: "capital" });
  const keys = ["__proto__", "constructor", "toString", "hasOwnProperty", "Key", "key", "key/1", "key/10",
    "決済/一", "x".repeat(4096) + "a", "x".repeat(4096) + "b"];
  const originals = keys.map((key, i) => record(ledger.release({ amount: 13 + i, contributor: "alice", key })));
  const before = snapshot(ledger);
  for (let i = keys.length - 1; i >= 0; i--) {
    assert.deepEqual(record(ledger.release({ amount: 13 + i, contributor: "alice", key: keys[i] })), originals[i]);
  }
  assert.deepEqual(snapshot(ledger), before);
});

test("[concurrency-1] independent task ledgers can use identical keys for different movements", () => {
  const first = new Ledger({ currency: "USD", feeRateBps: 1000 });
  const second = new Ledger({ currency: "JPY", feeRateBps: 5000 });
  first.fund({ amount: 901, key: "shared-funding" });
  second.fund({ amount: 802, key: "shared-funding" });
  const pay = record(first.release({ amount: 701, contributor: "alice", key: "shared-payout" }));
  const refund = record(second.refund({ amount: 602, key: "shared-payout" }));
  const beforeFirst = snapshot(first);
  const beforeSecond = snapshot(second);
  assert.deepEqual(record(second.refund({ amount: 602, key: "shared-payout" })), refund);
  assert.deepEqual(record(first.release({ amount: 701, contributor: "alice", key: "shared-payout" })), pay);
  assert.deepEqual(snapshot(first), beforeFirst);
  assert.deepEqual(snapshot(second), beforeSecond);
  assert.equal(first.balances().held, 200);
  assert.equal(second.balances().held, 200);
});

// Extends public "a release key cannot be reused with a different kind, amount or contributor".
test("[unhappy-4] zero-net releases still conflict on amount or contributor and preserve the first call", () => {
  const ledger = new Ledger({ currency: "EUR", feeRateBps: 10000 });
  ledger.fund({ amount: 1000, key: "capital" });
  const original = record(ledger.release({ amount: 37, contributor: "alice", key: "used" }));
  const before = snapshot(ledger);
  for (const call of [
    () => ledger.release({ amount: 38, contributor: "alice", key: "used" }),
    () => ledger.release({ amount: 37, contributor: "ALICE", key: "used" }),
    () => ledger.release({ amount: 36, contributor: "bob", key: "used" }),
    () => ledger.fund({ amount: 37, key: "used" }),
    () => ledger.refund({ amount: 37, key: "used" }),
  ]) {
    expectError(call, "key_conflict");
    assert.deepEqual(snapshot(ledger), before);
  }
  assert.deepEqual(record(ledger.release({ amount: 37, contributor: "alice", key: "used" })), original);
});

// Extends public "fund and refund keys also conflict across kinds and a one-unit amount change".
test("[unhappy-4] every ordered pair of movement kinds shares one idempotency namespace", () => {
  for (const originalKind of ["fund", "release", "refund"] as const) {
    const ledger = new Ledger({ currency: "GBP", feeRateBps: 777 });
    ledger.fund({ amount: 10000, key: "initial" });
    const original = record(invoke(ledger, originalKind, 313, "used"));
    const before = snapshot(ledger);
    for (const conflictingKind of ["fund", "release", "refund"] as const) {
      if (conflictingKind === originalKind) continue;
      expectError(() => invoke(ledger, conflictingKind, 313, "used"), "key_conflict");
      assert.deepEqual(snapshot(ledger), before);
    }
    for (const amount of [312, 314, 3000]) {
      expectError(() => invoke(ledger, originalKind, amount, "used"), "key_conflict");
      assert.deepEqual(snapshot(ledger), before);
    }
    assert.deepEqual(record(invoke(ledger, originalKind, 313, "used")), original);
  }
});

// Extends public "fund and refund keys also conflict across kinds and a one-unit amount change":
// a rejection must not silently advance the next sequence number.
test("[unhappy-4] a fresh successful call after several conflicts gets the next contiguous sequence", () => {
  for (const kind of ["fund", "release", "refund"] as const) {
    const ledger = new Ledger({ currency: "CAD", feeRateBps: 250 });
    ledger.fund({ amount: 1000, key: "capital" });
    const original = record(invoke(ledger, kind, 100, "used"));
    const before = snapshot(ledger);
    for (const amount of [101, 99, 103, 97]) {
      expectError(() => invoke(ledger, kind, amount, "used"), "key_conflict");
      assert.deepEqual(snapshot(ledger), before);
    }
    const next = invoke(ledger, kind, 21, "fresh");
    assert.equal(next.sequence, 3);
    assert.equal(ledger.entries().length, 3);
    assert.deepEqual(record(ledger.entries()[1]), original);
    assert.deepEqual(record(invoke(ledger, kind, 100, "used")), original);
    assert.equal(ledger.balances().held, kind === "fund" ? 1121 : 879);
  }
});

// Extends public "an insufficient-funds rejection leaves the key available after funding".
test("[recovery-1] repeated insufficient requests on an open ledger can later succeed under their original keys", () => {
  for (const kind of ["release", "refund"] as const) {
    const ledger = new Ledger({ currency: "EUR", feeRateBps: 125 });
    const before = snapshot(ledger);
    for (let i = 0; i < 8; i++) {
      expectError(() => invoke(ledger, kind, 701, "recover"), "insufficient_funds");
      assert.deepEqual(snapshot(ledger), before);
    }
    ledger.fund({ amount: 702, key: "capital" });
    const result = invoke(ledger, kind, 701, "recover");
    assert.equal(result.sequence, 2);
    assert.equal(result.amount, 701);
    assert.equal(ledger.balances().held, 1);
    assert.equal(ledger.entries().length, 2);
    const after = snapshot(ledger);
    assert.deepEqual(record(invoke(ledger, kind, 701, "recover")), record(result));
    assert.deepEqual(snapshot(ledger), after);
  }
});

test("[recovery-1] an unfunded rejected key may be reused for a different kind or contributor", () => {
  for (const rejectedKind of ["release", "refund"] as const) {
    for (const acceptedKind of ["fund", "release", "refund"] as const) {
      const ledger = new Ledger({ currency: "CHF", feeRateBps: 250 });
      expectError(() => invoke(ledger, rejectedKind, 123, "reuse", "alice"), "insufficient_funds");
      ledger.fund({ amount: 1000, key: "capital" });
      const entry = invoke(ledger, acceptedKind, 57, "reuse", "bob");
      assert.equal(entry.kind, acceptedKind);
      assert.equal(entry.amount, 57);
      assert.equal(entry.sequence, 2);
      if (entry.kind === "release") assert.equal(entry.contributor, "bob");
      assert.equal(ledger.entries().length, 2);
    }
  }
});

// Extends public "an invalid-amount rejection permits a corrected one-unit call with the same key".
test("[recovery-1] fractional and unsafe rejected requests do not reserve keys or sequence numbers", () => {
  for (const rejectedKind of ["fund", "release", "refund"] as const) {
    for (const acceptedKind of ["fund", "release", "refund"] as const) {
      const ledger = new Ledger({ currency: "USD", feeRateBps: 731 });
      ledger.fund({ amount: 10000, key: "capital" });
      const before = snapshot(ledger);
      for (const amount of [0.125, -7, Number.MAX_SAFE_INTEGER + 1, NaN]) {
        expectError(() => invoke(ledger, rejectedKind, amount, "recover", "alice"), "invalid_amount");
        assert.deepEqual(snapshot(ledger), before);
      }
      const accepted = invoke(ledger, acceptedKind, 313, "recover", "bob");
      assert.equal(accepted.sequence, 2);
      assert.equal(accepted.key, "recover");
      assert.equal(accepted.amount, 313);
      assert.equal(accepted.kind, acceptedKind);
      assert.equal(ledger.entries().length, 2);
      const after = snapshot(ledger);
      assert.deepEqual(record(invoke(ledger, acceptedKind, 313, "recover", "bob")), record(accepted));
      assert.deepEqual(snapshot(ledger), after);
    }
  }
});

// Extends public "retrying the closing release succeeds with its original entry".
test("[boundary-3] closing after a mixed history preserves every earlier entry in reverse retry order", () => {
  const ledger = new Ledger({ currency: "GBP", feeRateBps: 3333 });
  const calls: Array<() => Entry> = [
    () => ledger.fund({ amount: 10003, key: "fund-1" }),
    () => ledger.refund({ amount: 701, key: "refund-1" }),
    () => ledger.release({ amount: 313, contributor: "alice", key: "release-1" }),
    () => ledger.fund({ amount: 211, key: "fund-2" }),
    () => ledger.release({ amount: 113, contributor: "bob", key: "release-2" }),
    () => ledger.refund({ amount: 97, key: "refund-2" }),
    () => ledger.release({ amount: 8990, contributor: "alice", key: "closing-release" }),
  ];
  const originals = calls.map((call) => record(call()));
  assert.equal(ledger.balances().held, 0);
  assert.equal(ledger.status(), "closed");
  const before = snapshot(ledger);
  for (let round = 0; round < 5; round++) {
    for (let i = calls.length - 1; i >= 0; i--) {
      assert.deepEqual(record(calls[i]()), originals[i]);
      assert.deepEqual(snapshot(ledger), before);
    }
  }
});

// Extends public "closing with a one-unit refund preserves retries of all previous entry kinds".
test("[boundary-3] a large closing refund and earlier funding remain retryable without reopening", () => {
  const ledger = new Ledger({ currency: "SGD", feeRateBps: 9999 });
  const fundingAmount = Number.MAX_SAFE_INTEGER;
  const first = record(ledger.fund({ amount: fundingAmount, key: "capital" }));
  const pay = record(ledger.release({ amount: 50003, contributor: "alice", key: "pay" }));
  const refundAmount = fundingAmount - 50003;
  const last = record(ledger.refund({ amount: refundAmount, key: "closing-refund" }));
  assert.equal(ledger.status(), "closed");
  const before = snapshot(ledger);
  for (let i = 0; i < 10; i++) {
    assert.deepEqual(record(ledger.refund({ amount: refundAmount, key: "closing-refund" })), last);
    assert.deepEqual(record(ledger.fund({ amount: fundingAmount, key: "capital" })), first);
    assert.deepEqual(record(ledger.release({ amount: 50003, contributor: "alice", key: "pay" })), pay);
    assert.deepEqual(snapshot(ledger), before);
  }
});
