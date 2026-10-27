import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, LedgerError } from "../../src/index.js";
import type { LedgerErrorCode } from "../../src/index.js";

const MAX = Number.MAX_SAFE_INTEGER;

function rejects(fn: () => unknown, code: LedgerErrorCode): void {
  assert.throws(fn, (error: unknown) => {
    if (!(error instanceof LedgerError)) throw new assert.AssertionError({ message: `expected a LedgerError, got ${String(error)}` });
    assert.ok(error instanceof Error);
    assert.equal(error.code, code);
    return true;
  });
}

function snapshot(ledger: Ledger, contributors: string[] = ["c1", "c2"]) {
  return {
    status: ledger.status(),
    balances: ledger.balances(),
    entries: ledger.entries(),
    paid: contributors.map((c) => ledger.paidTo(c)),
  };
}

function assertBalanced(ledger: Ledger): void {
  const { funded, held, released, refunded } = ledger.balances();
  assert.equal(funded, held + released + refunded);
}

// Extends "funding 50000 holds 50000": several fundings add up.
test("private: several fundings add up in the held and funded balances", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 1, key: "f1" });
  ledger.fund({ amount: 30000, key: "f2" });
  ledger.fund({ amount: 19999, key: "f3" });
  const balances = ledger.balances();
  assert.equal(balances.held, 50000);
  assert.equal(balances.funded, 50000);
  assert.equal(balances.released, 0);
  assert.equal(balances.refunded, 0);
  assert.equal(balances.fees, 0);
});

// Extends "funding Number.MAX_SAFE_INTEGER holds it exactly": reaching it in two fundings.
test("private: fundings that sum to Number.MAX_SAFE_INTEGER hold it exactly", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: MAX - 12345, key: "f1" });
  ledger.fund({ amount: 12345, key: "f2" });
  assert.equal(ledger.balances().held, MAX);
  assert.equal(ledger.balances().funded, MAX);
});

// Extends "funding 50000 holds 50000": the smallest amount.
test("private: funding the minimum amount of 1 holds 1", () => {
  const ledger = new Ledger({ currency: "JPY", feeRateBps: 0 });
  const entry = ledger.fund({ amount: 1, key: "f1" });
  assert.equal(entry.kind, "fund");
  assert.equal(entry.amount, 1);
  assert.equal(entry.key, "f1");
  assert.equal(entry.sequence, 1);
  assert.equal(ledger.balances().held, 1);
  assert.equal(ledger.status(), "funded");
});

// Extends "releasing 20000 at 1000 bps pays 18000 and takes a 2000 fee": several releases to several contributors.
test("private: releases to several contributors are paid to each separately", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 100000, key: "f1" });
  ledger.release({ amount: 20000, contributor: "c1", key: "r1" });
  ledger.release({ amount: 15000, contributor: "c2", key: "r2" });
  ledger.release({ amount: 5000, contributor: "c1", key: "r3" });
  ledger.release({ amount: 15, contributor: "c3", key: "r4" }); // 1.5 -> 2
  assert.equal(ledger.paidTo("c1"), 18000 + 4500);
  assert.equal(ledger.paidTo("c2"), 13500);
  assert.equal(ledger.paidTo("c3"), 13);
  assert.equal(ledger.paidTo("nobody"), 0);
  const balances = ledger.balances();
  assert.equal(balances.fees, 2000 + 1500 + 500 + 2);
  assert.equal(balances.released, 40015);
  assert.equal(balances.held, 59985);
  assert.equal(balances.funded, 100000);
  assertBalanced(ledger);
});

// Extends "refunding 10000 of 50000 holds 40000 and records 10000 refunded": several refunds.
test("private: several refunds add up in the refunded balance", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f1" });
  ledger.refund({ amount: 10000, key: "x1" });
  ledger.refund({ amount: 2500, key: "x2" });
  ledger.refund({ amount: 1, key: "x3" });
  const balances = ledger.balances();
  assert.equal(balances.held, 37499);
  assert.equal(balances.refunded, 12501);
  assert.equal(balances.released, 0);
  assert.equal(balances.fees, 0);
  assert.equal(balances.funded, 50000);
  assert.equal(ledger.paidTo("c1"), 0);
});

// Extends "refunding 10000 of 50000 holds 40000 and records 10000 refunded": a refund takes no fee and pays no contributor.
test("private: a refund after a release does not change fees or what contributors were paid", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f1" });
  ledger.release({ amount: 20000, contributor: "c1", key: "r1" });
  ledger.refund({ amount: 7777, key: "x1" });
  const balances = ledger.balances();
  assert.equal(balances.fees, 2000);
  assert.equal(balances.released, 20000);
  assert.equal(balances.refunded, 7777);
  assert.equal(balances.held, 22223);
  assert.equal(ledger.paidTo("c1"), 18000);
});

// Extends "after a release, one more than what is held is refused and exactly what is held is not": after refunds.
test("private: after a refund, one more than what is held is refused for a release", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f1" });
  ledger.refund({ amount: 10000, key: "x1" });
  const before = snapshot(ledger);
  rejects(() => ledger.release({ amount: 40001, contributor: "c1", key: "r1" }), "insufficient_funds");
  rejects(() => ledger.refund({ amount: 40001, key: "x2" }), "insufficient_funds");
  assert.deepEqual(snapshot(ledger), before);
  const entry = ledger.release({ amount: 40000, contributor: "c1", key: "r1" });
  assert.equal(entry.amount, 40000);
  assert.equal(ledger.balances().held, 0);
});

// Extends "releasing or refunding 50001 of 50000 fails with insufficient_funds and changes nothing": several releases.
test("private: releases that together exceed what is held are refused at the one that overdraws", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f1" });
  ledger.release({ amount: 30000, contributor: "c1", key: "r1" });
  ledger.release({ amount: 15000, contributor: "c2", key: "r2" });
  const before = snapshot(ledger);
  rejects(() => ledger.release({ amount: 5001, contributor: "c1", key: "r3" }), "insufficient_funds");
  rejects(() => ledger.refund({ amount: 5001, key: "x1" }), "insufficient_funds");
  rejects(() => ledger.release({ amount: MAX, contributor: "c2", key: "r4" }), "insufficient_funds");
  assert.deepEqual(snapshot(ledger), before);
});

// Extends "releasing or refunding 50001 of 50000 fails with insufficient_funds and changes nothing": top-ups count.
test("private: a later funding makes a larger release covered", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f1" });
  ledger.release({ amount: 20000, contributor: "c1", key: "r1" });
  ledger.fund({ amount: 25000, key: "f2" });
  rejects(() => ledger.release({ amount: 55001, contributor: "c1", key: "r2" }), "insufficient_funds");
  const entry = ledger.release({ amount: 55000, contributor: "c1", key: "r2" });
  assert.equal(entry.fee, 5500);
  assert.equal(ledger.paidTo("c1"), 18000 + 49500);
  assert.equal(ledger.balances().held, 0);
});

// Extends "releasing or refunding 50001 of 50000 fails with insufficient_funds and changes nothing": nothing funded yet.
test("private: a refund on a ledger with nothing funded fails with insufficient_funds", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  rejects(() => ledger.refund({ amount: 1, key: "x1" }), "insufficient_funds");
  rejects(() => ledger.release({ amount: 1, contributor: "c1", key: "r1" }), "insufficient_funds");
  assert.equal(ledger.status(), "open");
  assert.deepEqual(ledger.entries(), []);
  assert.equal(ledger.balances().held, 0);
});

// Extends "funding Number.MAX_SAFE_INTEGER holds it exactly": large releases and refunds stay exact.
test("private: large releases and refunds keep every balance exact", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 9999 });
  ledger.fund({ amount: MAX, key: "f1" });
  const r = ledger.release({ amount: 4503599627370497, contributor: "c1", key: "r1" });
  ledger.refund({ amount: 3, key: "x1" });
  const balances = ledger.balances();
  assert.equal(balances.held, MAX - 4503599627370497 - 3);
  assert.equal(balances.released, 4503599627370497);
  assert.equal(balances.refunded, 3);
  assert.equal(balances.fees, r.fee);
  assert.equal(r.fee + r.net, 4503599627370497);
  assertBalanced(ledger);
});

// Extends "the balances always balance" across a long mixed sequence, with rejections in between.
test("private: funded equals held plus released plus refunded after every call, accepted or rejected", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 333 });
  let n = 0;
  const step = (fn: () => unknown) => {
    try {
      fn();
    } catch (error) {
      if (!(error instanceof LedgerError)) throw error;
    }
    assertBalanced(ledger);
    n++;
  };
  for (let i = 1; i <= 15; i++) {
    step(() => ledger.fund({ amount: i * 1000, key: `f${i}` }));
    step(() => ledger.release({ amount: i * 337, contributor: `c${i % 3}`, key: `r${i}` }));
    step(() => ledger.refund({ amount: i * 211, key: `x${i}` }));
    step(() => ledger.refund({ amount: 10_000_000, key: `big${i}` }));
  }
  assert.equal(n, 60);
  const b = ledger.balances();
  assert.equal(b.funded, 120000);
  assert.equal(b.released, 337 * 120);
  assert.equal(b.refunded, 211 * 120);
  assert.equal(b.held, 120000 - 337 * 120 - 211 * 120);
  assert.equal(ledger.entries().length, 45);
});
