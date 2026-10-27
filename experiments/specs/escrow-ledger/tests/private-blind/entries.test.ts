import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, LedgerError } from "../../src/index.js";
import type { Entry, LedgerErrorCode } from "../../src/index.js";

function assertLedgerError(fn: () => unknown, code: LedgerErrorCode): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof LedgerError, `expected a LedgerError, got ${String(error)}`);
    assert.equal((error as LedgerError).code, code);
    return true;
  });
}

function assertEntry(actual: Entry | undefined, expected: Record<string, unknown>): void {
  assert.ok(actual !== undefined, "missing entry");
  for (const [field, value] of Object.entries(expected)) {
    assert.equal((actual as unknown as Record<string, unknown>)[field], value, `${field} of entry ${actual?.sequence}`);
  }
}

test("entries are listed in order with sequence numbers from 1 and their fields", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f1" });
  ledger.release({ amount: 20000, contributor: "c1", key: "k1" });
  ledger.refund({ amount: 10000, key: "rf1" });
  const entries = ledger.entries();
  assert.equal(entries.length, 3);
  assertEntry(entries[0], { kind: "fund", amount: 50000, key: "f1", sequence: 1 });
  assertEntry(entries[1], { kind: "release", amount: 20000, key: "k1", sequence: 2, contributor: "c1", fee: 2000, net: 18000 });
  assertEntry(entries[2], { kind: "refund", amount: 10000, key: "rf1", sequence: 3 });
});

test("entries in another order and with other values keep their order and fields", () => {
  const ledger = new Ledger({ currency: "EUR", feeRateBps: 250 });
  ledger.fund({ amount: 900, key: "alpha" });
  ledger.fund({ amount: 100, key: "beta" });
  ledger.refund({ amount: 77, key: "gamma" });
  ledger.release({ amount: 300, contributor: "zoe", key: "delta" });
  ledger.release({ amount: 100, contributor: "yan", key: "epsilon" });
  ledger.fund({ amount: 5, key: "zeta" });
  ledger.refund({ amount: 1, key: "eta" });
  const entries = ledger.entries();
  assert.equal(entries.length, 7);
  assertEntry(entries[0], { kind: "fund", amount: 900, key: "alpha", sequence: 1 });
  assertEntry(entries[1], { kind: "fund", amount: 100, key: "beta", sequence: 2 });
  assertEntry(entries[2], { kind: "refund", amount: 77, key: "gamma", sequence: 3 });
  assertEntry(entries[3], { kind: "release", amount: 300, key: "delta", sequence: 4, contributor: "zoe", fee: 8, net: 292 });
  assertEntry(entries[4], { kind: "release", amount: 100, key: "epsilon", sequence: 5, contributor: "yan", fee: 2, net: 98 });
  assertEntry(entries[5], { kind: "fund", amount: 5, key: "zeta", sequence: 6 });
  assertEntry(entries[6], { kind: "refund", amount: 1, key: "eta", sequence: 7 });
});

test("each call returns the entry it appended", () => {
  const ledger = new Ledger({ currency: "EUR", feeRateBps: 1700 });
  const a = ledger.fund({ amount: 6000, key: "one" });
  const b = ledger.release({ amount: 1234, contributor: "pat", key: "two" });
  const c = ledger.refund({ amount: 66, key: "three" });
  assertEntry(a, { kind: "fund", amount: 6000, key: "one", sequence: 1 });
  // 1234 * 0.17 = 209.78
  assertEntry(b, { kind: "release", amount: 1234, key: "two", sequence: 2, contributor: "pat", fee: 210, net: 1024 });
  assertEntry(c, { kind: "refund", amount: 66, key: "three", sequence: 3 });
  assert.deepEqual(ledger.entries(), [a, b, c]);
});

test("every release entry's fee plus net equals its amount", () => {
  const ledger = new Ledger({ currency: "EUR", feeRateBps: 4999 });
  ledger.fund({ amount: 1000000, key: "f" });
  const amounts = [1, 2, 3, 99, 101, 12345, 54321];
  amounts.forEach((amount, i) => {
    ledger.release({ amount, contributor: `c${i % 2}`, key: `r${i}` });
  });
  const releases = ledger.entries().filter((e) => e.kind === "release");
  assert.equal(releases.length, amounts.length);
  for (const entry of releases) {
    assert.ok(entry.kind === "release");
    assert.equal(entry.fee + entry.net, entry.amount);
  }
  const b = ledger.balances();
  assert.equal(b.fees + ledger.paidTo("c0") + ledger.paidTo("c1"), b.released);
});

test("rejected calls and retries add no entries and use up no sequence numbers", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 1000, key: "a" });
  assertLedgerError(() => ledger.release({ amount: 1001, contributor: "c", key: "b" }), "insufficient_funds");
  assertLedgerError(() => ledger.fund({ amount: -3, key: "c" }), "invalid_amount");
  assertLedgerError(() => ledger.refund({ amount: 5, key: "a" }), "key_conflict");
  ledger.fund({ amount: 1000, key: "a" });
  const next = ledger.refund({ amount: 5, key: "d" });
  assert.equal(next.sequence, 2);
  const entries = ledger.entries();
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((e) => e.sequence), [1, 2]);
  assert.deepEqual(entries.map((e) => e.key), ["a", "d"]);
});

test("the balances agree with the entries", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 650 });
  ledger.fund({ amount: 20000, key: "f1" });
  ledger.release({ amount: 3333, contributor: "a", key: "r1" });
  ledger.refund({ amount: 4444, key: "x1" });
  ledger.fund({ amount: 555, key: "f2" });
  ledger.release({ amount: 6666, contributor: "b", key: "r2" });
  const entries = ledger.entries();
  let funded = 0;
  let released = 0;
  let refunded = 0;
  let fees = 0;
  for (const entry of entries) {
    if (entry.kind === "fund") funded += entry.amount;
    if (entry.kind === "refund") refunded += entry.amount;
    if (entry.kind === "release") {
      released += entry.amount;
      fees += entry.fee;
    }
  }
  const b = ledger.balances();
  assert.equal(b.funded, funded);
  assert.equal(b.released, released);
  assert.equal(b.refunded, refunded);
  assert.equal(b.fees, fees);
  assert.equal(b.held, funded - released - refunded);
  assert.equal(b.funded, b.held + b.released + b.refunded);
  assert.equal(funded, 20555);
  assert.equal(released, 9999);
  assert.equal(refunded, 4444);
});
