import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, LedgerError } from "../../src/index.js";
import type { LedgerErrorCode } from "../../src/index.js";

function expectError(action: () => unknown, code: LedgerErrorCode): void {
  assert.throws(action, (error: unknown) => error instanceof LedgerError && error.code === code);
}

function snapshot(ledger: Ledger) {
  return {
    balances: { ...ledger.balances() },
    entries: ledger.entries().map((entry) => ({ ...entry })),
    status: ledger.status(),
    paidC1: ledger.paidTo("c1"),
    paidC2: ledger.paidTo("c2"),
  };
}

test("[concurrency-1] retrying the same release returns its original entry without another movement", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "fund" });
  const original = { ...ledger.release({ amount: 20000, contributor: "c1", key: "k1" }) };
  const before = snapshot(ledger);
  for (let retry = 0; retry < 3; retry++) {
    assert.deepEqual(ledger.release({ amount: 20000, contributor: "c1", key: "k1" }), original);
    assert.deepEqual(snapshot(ledger), before);
  }
});

test("[concurrency-1] every entry kind can be retried after intervening entries", () => {
  for (const kind of ["fund", "release", "refund"] as const) {
    const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
    ledger.fund({ amount: 50000, key: "initial" });
    const call = () => kind === "release"
      ? ledger.release({ amount: 1, contributor: "c1", key: "retry" })
      : ledger[kind]({ amount: 1, key: "retry" });
    const original = { ...call() };
    ledger.fund({ amount: 10, key: "later-fund" });
    ledger.release({ amount: 5, contributor: "c2", key: "later-release" });
    const before = snapshot(ledger);
    assert.deepEqual(call(), original);
    assert.deepEqual(snapshot(ledger), before);
  }
});

test("[unhappy-4] a release key cannot be reused with a different kind, amount or contributor", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "fund" });
  const original = { ...ledger.release({ amount: 20000, contributor: "c1", key: "k1" }) };
  const before = snapshot(ledger);
  const conflicts = [
    () => ledger.fund({ amount: 20000, key: "k1" }),
    () => ledger.refund({ amount: 20000, key: "k1" }),
    () => ledger.release({ amount: 20001, contributor: "c1", key: "k1" }),
    () => ledger.release({ amount: 20000, contributor: "c2", key: "k1" }),
  ];
  for (const conflict of conflicts) {
    expectError(conflict, "key_conflict");
    assert.deepEqual(snapshot(ledger), before);
  }
  assert.deepEqual(ledger.release({ amount: 20000, contributor: "c1", key: "k1" }), original);
  assert.deepEqual(snapshot(ledger), before);
});

test("[unhappy-4] fund and refund keys also conflict across kinds and a one-unit amount change", () => {
  for (const kind of ["fund", "refund"] as const) {
    const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
    ledger.fund({ amount: 10, key: "initial" });
    ledger[kind]({ amount: 1, key: "used" });
    const before = snapshot(ledger);
    expectError(() => ledger[kind]({ amount: 2, key: "used" }), "key_conflict");
    assert.deepEqual(snapshot(ledger), before);
    const otherKind = kind === "fund" ? "refund" : "fund";
    expectError(() => ledger[otherKind]({ amount: 1, key: "used" }), "key_conflict");
    assert.deepEqual(snapshot(ledger), before);
  }
});

test("[recovery-1] an insufficient-funds rejection leaves the key available after funding", () => {
  for (const kind of ["release", "refund"] as const) {
    const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
    ledger.fund({ amount: 1, key: "initial" });
    const call = () => kind === "release"
      ? ledger.release({ amount: 2, contributor: "c1", key: "k2" })
      : ledger.refund({ amount: 2, key: "k2" });
    const before = snapshot(ledger);
    expectError(call, "insufficient_funds");
    assert.deepEqual(snapshot(ledger), before);
    ledger.fund({ amount: 2, key: "top-up" });
    const entry = call();
    assert.equal(entry.key, "k2");
    assert.equal(entry.kind, kind);
    assert.equal(entry.amount, 2);
    assert.equal(entry.sequence, 3);
    assert.equal(ledger.balances().held, 1);
    const after = snapshot(ledger);
    assert.deepEqual(call(), entry);
    assert.deepEqual(snapshot(ledger), after);
  }
});

test("[recovery-1] an invalid-amount rejection permits a corrected one-unit call with the same key", () => {
  for (const kind of ["fund", "release", "refund"] as const) {
    const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
    ledger.fund({ amount: 2, key: "initial" });
    const before = snapshot(ledger);
    expectError(() => kind === "release"
      ? ledger.release({ amount: 0, contributor: "c1", key: "k2" })
      : ledger[kind]({ amount: 0, key: "k2" }), "invalid_amount");
    assert.deepEqual(snapshot(ledger), before);
    const entry = kind === "release"
      ? ledger.release({ amount: 1, contributor: "c1", key: "k2" })
      : ledger[kind]({ amount: 1, key: "k2" });
    assert.equal(entry.kind, kind);
    assert.equal(entry.key, "k2");
    assert.equal(entry.amount, 1);
    assert.equal(entry.sequence, 2);
    assert.equal(ledger.balances().held, kind === "fund" ? 3 : 1);
    assert.equal(ledger.entries().length, 2);
  }
});

test("[boundary-3] retrying the closing release succeeds with its original entry", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "fund" });
  const original = { ...ledger.release({ amount: 50000, contributor: "c1", key: "k3" }) };
  assert.equal(ledger.status(), "closed");
  const before = snapshot(ledger);
  assert.deepEqual(ledger.release({ amount: 50000, contributor: "c1", key: "k3" }), original);
  assert.deepEqual(snapshot(ledger), before);
});

test("[boundary-3] closing with a one-unit refund preserves retries of all previous entry kinds", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  const fund = { ...ledger.fund({ amount: 2, key: "fund" }) };
  const release = { ...ledger.release({ amount: 1, contributor: "c1", key: "release" }) };
  const refund = { ...ledger.refund({ amount: 1, key: "refund" }) };
  assert.equal(ledger.status(), "closed");
  const before = snapshot(ledger);
  assert.deepEqual(ledger.fund({ amount: 2, key: "fund" }), fund);
  assert.deepEqual(snapshot(ledger), before);
  assert.deepEqual(ledger.release({ amount: 1, contributor: "c1", key: "release" }), release);
  assert.deepEqual(snapshot(ledger), before);
  assert.deepEqual(ledger.refund({ amount: 1, key: "refund" }), refund);
  assert.deepEqual(snapshot(ledger), before);
});

test("[happy-5] entries retain their fields and order while balances follow the record", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  const calls = [
    () => ledger.fund({ amount: 50000, key: "fund-1" }),
    () => ledger.release({ amount: 20000, contributor: "c1", key: "release-1" }),
    () => ledger.refund({ amount: 10000, key: "refund" }),
    () => ledger.fund({ amount: 5000, key: "fund-2" }),
    () => ledger.release({ amount: 5000, contributor: "c2", key: "release-2" }),
  ];
  const expected = [
    { kind: "fund", amount: 50000, key: "fund-1", sequence: 1 },
    { kind: "release", amount: 20000, key: "release-1", sequence: 2, contributor: "c1", fee: 2000, net: 18000 },
    { kind: "refund", amount: 10000, key: "refund", sequence: 3 },
    { kind: "fund", amount: 5000, key: "fund-2", sequence: 4 },
    { kind: "release", amount: 5000, key: "release-2", sequence: 5, contributor: "c2", fee: 500, net: 4500 },
  ];
  for (let index = 0; index < calls.length; index++) {
    assert.deepEqual(calls[index](), expected[index]);
    assert.deepEqual(ledger.entries(), expected.slice(0, index + 1));
    const balances = ledger.balances();
    const entries = ledger.entries();
    const funded = entries.filter((entry) => entry.kind === "fund").reduce((sum, entry) => sum + entry.amount, 0);
    const released = entries.filter((entry) => entry.kind === "release").reduce((sum, entry) => sum + entry.amount, 0);
    const refunded = entries.filter((entry) => entry.kind === "refund").reduce((sum, entry) => sum + entry.amount, 0);
    assert.equal(balances.funded, funded);
    assert.equal(balances.released, released);
    assert.equal(balances.refunded, refunded);
    assert.equal(balances.held, funded - released - refunded);
    assert.equal(balances.funded, balances.held + balances.released + balances.refunded);
  }
  assert.deepEqual(ledger.balances(), {
    funded: 55000, held: 20000, released: 25000, refunded: 10000, fees: 2500,
  });
  assert.equal(ledger.paidTo("c1"), 18000);
  assert.equal(ledger.paidTo("c2"), 4500);
});

test("[happy-5] an empty record starts at sequence one and rejections and retries add no entries", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  assert.deepEqual(ledger.entries(), []);
  assert.deepEqual(ledger.balances(), {
    funded: 0, held: 0, released: 0, refunded: 0, fees: 0,
  });
  assert.equal(ledger.paidTo("c1"), 0);
  expectError(() => ledger.refund({ amount: 1, key: "rejected" }), "insufficient_funds");
  assert.deepEqual(ledger.entries(), []);
  const first = ledger.fund({ amount: 1, key: "fund" });
  assert.equal(first.sequence, 1);
  assert.deepEqual(ledger.fund({ amount: 1, key: "fund" }), first);
  const second = ledger.release({ amount: 1, contributor: "c1", key: "release" });
  assert.equal(second.sequence, 2);
  assert.deepEqual(ledger.entries(), [
    { kind: "fund", amount: 1, key: "fund", sequence: 1 },
    { kind: "release", amount: 1, key: "release", sequence: 2, contributor: "c1", fee: 0, net: 1 },
  ]);
  assert.deepEqual(ledger.balances(), {
    funded: 1, held: 0, released: 1, refunded: 0, fees: 0,
  });
});
