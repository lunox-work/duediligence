import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, LedgerError } from "../../src/index.js";
import type { Balances, Entry, LedgerErrorCode } from "../../src/index.js";

function expectError(action: () => unknown, code: LedgerErrorCode): void {
  assert.throws(action, (error: unknown) => error instanceof LedgerError && error.code === code);
}

function record(entry: Entry) {
  const base = { kind: entry.kind, amount: entry.amount, key: entry.key, sequence: entry.sequence };
  return entry.kind === "release"
    ? { ...base, contributor: entry.contributor, fee: entry.fee, net: entry.net }
    : base;
}

function expectBalances(ledger: Ledger, expected: Balances): void {
  const actual = ledger.balances();
  for (const field of ["funded", "held", "released", "refunded", "fees"] as const) {
    assert.equal(actual[field], expected[field], field);
  }
  assert.equal(actual.funded, actual.held + actual.released + actual.refunded);
}

function snapshot(ledger: Ledger) {
  const { funded, held, released, refunded, fees } = ledger.balances();
  return {
    funded, held, released, refunded, fees, status: ledger.status(),
    entries: ledger.entries().map(record),
    paid: ledger.paidTo("worker"),
  };
}

// Extends public "status follows funding, partial release, later funding and refunds".
test("[happy-4] zero-net releases at a full fee rate permanently establish partially released status", () => {
  const ledger = new Ledger({ currency: "JPY", feeRateBps: 10000 });
  assert.equal(ledger.status(), "open");
  ledger.fund({ amount: 1000, key: "capital" });
  assert.equal(ledger.status(), "funded");
  ledger.refund({ amount: 100, key: "initial-refund" });
  assert.equal(ledger.status(), "funded");
  ledger.release({ amount: 100, contributor: "worker", key: "zero-net" });
  assert.equal(ledger.paidTo("worker"), 0);
  assert.equal(ledger.status(), "partially released");
  for (let i = 0; i < 30; i++) {
    ledger.fund({ amount: i + 2, key: `fund-${i}` });
    assert.equal(ledger.status(), "partially released");
    ledger.refund({ amount: i + 1, key: `refund-${i}` });
    assert.equal(ledger.status(), "partially released");
  }
  assert.equal(ledger.balances().held, 830);
});

// Extends public "refunds before any release leave the ledger funded with one unit held".
test("[happy-4] repeated partial refunds without releases remain funded at many held balances", () => {
  const ledger = new Ledger({ currency: "NZD", feeRateBps: 731 });
  ledger.fund({ amount: 17000, key: "capital" });
  let held = 17000;
  for (let i = 1; i <= 40; i++) {
    ledger.refund({ amount: i * 13, key: `refund-${i}` });
    held -= i * 13;
    assert.equal(ledger.balances().held, held);
    assert.equal(ledger.status(), "funded");
    ledger.fund({ amount: i * 3, key: `fund-${i}` });
    held += i * 3;
    assert.equal(ledger.balances().held, held);
    assert.equal(ledger.status(), "funded");
  }
  ledger.release({ amount: 7, contributor: "worker", key: "first-release" });
  assert.equal(ledger.status(), "partially released");
});

// Extends public "a single full release or refund closes and forbids new entries of every kind".
test("[boundary-2] closing at minimum and maximum amounts forbids every fresh valid movement", () => {
  for (const amount of [1, 37, Number.MAX_SAFE_INTEGER]) {
    for (const kind of ["release", "refund"] as const) {
      const ledger = new Ledger({ currency: "CHF", feeRateBps: 10000 });
      ledger.fund({ amount, key: "capital" });
      if (kind === "release") ledger.release({ amount, contributor: "worker", key: "close" });
      else ledger.refund({ amount, key: "close" });
      assert.equal(ledger.status(), "closed");
      assert.equal(ledger.balances().held, 0);
      const before = snapshot(ledger);
      for (const laterAmount of [1, 17, Number.MAX_SAFE_INTEGER]) {
        expectError(() => ledger.fund({ amount: laterAmount, key: `fund-${laterAmount}` }), "closed");
        expectError(() => ledger.release({ amount: laterAmount, contributor: "worker", key: `pay-${laterAmount}` }), "closed");
        expectError(() => ledger.refund({ amount: laterAmount, key: `refund-${laterAmount}` }), "closed");
        assert.deepEqual(snapshot(ledger), before);
      }
    }
  }
});

// Extends public "multiple releases, refunds or mixed payouts close on the last held unit".
test("[boundary-2] long payout combinations close on an arbitrary final balance after additional funding", () => {
  for (const firstKind of ["release", "refund"] as const) {
    for (const lastKind of ["release", "refund"] as const) {
      const ledger = new Ledger({ currency: "EUR", feeRateBps: 250 });
      ledger.fund({ amount: 1000, key: "capital" });
      for (let i = 0; i < 20; i++) {
        if (firstKind === "release") ledger.release({ amount: 37, contributor: "worker", key: `pay-${i}` });
        else ledger.refund({ amount: 37, key: `refund-${i}` });
        ledger.fund({ amount: 3, key: `top-up-${i}` });
        assert.equal(ledger.status(), firstKind === "release" ? "partially released" : "funded");
      }
      assert.equal(ledger.balances().held, 320);
      if (lastKind === "release") ledger.release({ amount: 320, contributor: "worker", key: "close" });
      else ledger.refund({ amount: 320, key: "close" });
      assert.equal(ledger.status(), "closed");
      assert.equal(ledger.balances().held, 0);
      const before = snapshot(ledger);
      expectError(() => ledger.fund({ amount: 320, key: "reopen" }), "closed");
      assert.deepEqual(snapshot(ledger), before);
    }
  }
});

// Extends public "entries retain their fields and order while balances follow the record".
test("[happy-5] a three-hundred-sixty-one-entry mixed record matches an independent accounting model", () => {
  const ledger = new Ledger({ currency: "SGD", feeRateBps: 3125 });
  const expected: Entry[] = [];
  const totals: Balances = { funded: 0, held: 0, released: 0, refunded: 0, fees: 0 };
  const contributors = ["worker", "Worker", "constructor", "__proto__", "team/日本"];
  const paid = new Map<string, number>();
  function append(entry: Entry): void {
    expected.push(entry);
    assert.deepEqual(ledger.entries().map(record), expected.map(record));
    expectBalances(ledger, totals);
    for (const name of contributors) assert.equal(ledger.paidTo(name), paid.get(name) ?? 0);
  }
  const initial: Entry = { kind: "fund", amount: 200000, key: "capital", sequence: 1 };
  assert.deepEqual(record(ledger.fund({ amount: initial.amount, key: initial.key })), record(initial));
  totals.funded = totals.held = initial.amount;
  append(initial);
  for (let i = 0; i < 120; i++) {
    const fund = { kind: "fund" as const, amount: i * 19 + 1, key: `fund-${i}`, sequence: expected.length + 1 };
    assert.deepEqual(record(ledger.fund({ amount: fund.amount, key: fund.key })), record(fund));
    totals.funded += fund.amount;
    totals.held += fund.amount;
    append(fund);

    const amount = i * 11 + 3;
    const product = BigInt(amount) * 3125n;
    const quotient = product / 10000n;
    const remainder = product % 10000n;
    const fee = Number(quotient + (remainder > 5000n || (remainder === 5000n && quotient % 2n !== 0n) ? 1n : 0n));
    const contributor = contributors[i % contributors.length];
    const release = { kind: "release" as const, amount, key: `release-${i}`, sequence: expected.length + 1,
      contributor, fee, net: amount - fee };
    assert.deepEqual(record(ledger.release({ amount, key: release.key, contributor })), record(release));
    totals.held -= amount;
    totals.released += amount;
    totals.fees += fee;
    paid.set(contributor, (paid.get(contributor) ?? 0) + release.net);
    append(release);

    const refund = { kind: "refund" as const, amount: i * 5 + 1, key: `refund-${i}`, sequence: expected.length + 1 };
    assert.deepEqual(record(ledger.refund({ amount: refund.amount, key: refund.key })), record(refund));
    totals.held -= refund.amount;
    totals.refunded += refund.amount;
    append(refund);
  }
  assert.equal(ledger.entries().length, 361);
  assert.equal(ledger.paidTo("no such contributor"), 0);
});

// Extends public "an empty record starts at sequence one and rejections and retries add no entries".
test("[happy-5] many early rejections and interspersed retries leave contiguous sequences for all kinds", () => {
  const ledger = new Ledger({ currency: "CAD", feeRateBps: 0 });
  assert.equal(ledger.entries().length, 0);
  expectBalances(ledger, { funded: 0, held: 0, released: 0, refunded: 0, fees: 0 });
  for (let i = 0; i < 30; i++) {
    expectError(() => ledger.refund({ amount: i + 1, key: `early-refund-${i}` }), "insufficient_funds");
    expectError(() => ledger.release({ amount: i + 1, contributor: "worker", key: `early-pay-${i}` }), "insufficient_funds");
    expectError(() => ledger.fund({ amount: -i - 1, key: `early-fund-${i}` }), "invalid_amount");
  }
  assert.equal(ledger.entries().length, 0);
  const initial = record(ledger.fund({ amount: 10000, key: "capital" }));
  assert.equal(initial.sequence, 1);
  const expected = [initial];
  for (let i = 0; i < 30; i++) {
    const before = snapshot(ledger);
    expectError(() => ledger.refund({ amount: Number.MAX_SAFE_INTEGER, key: `over-${i}` }), "insufficient_funds");
    assert.deepEqual(snapshot(ledger), before);
    assert.deepEqual(record(ledger.fund({ amount: 10000, key: "capital" })), initial);
    const entry = i % 3 === 0
      ? ledger.fund({ amount: 2, key: `entry-${i}` })
      : i % 3 === 1
        ? ledger.release({ amount: 3, contributor: "worker", key: `entry-${i}` })
        : ledger.refund({ amount: 4, key: `entry-${i}` });
    assert.equal(entry.sequence, i + 2);
    expected.push(record(entry));
    assert.deepEqual(ledger.entries().map(record), expected);
  }
  assert.equal(ledger.entries().length, 31);
  assert.equal(ledger.paidTo("worker"), 30);
  expectBalances(ledger, { funded: 10020, held: 9950, released: 30, refunded: 40, fees: 0 });
});
