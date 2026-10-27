import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, LedgerError, releaseFee } from "../../src/index.js";
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

function funded(amount: number, feeRateBps = 1000): Ledger {
  const ledger = new Ledger({ currency: "USD", feeRateBps });
  ledger.fund({ amount, key: "fund-1" });
  return ledger;
}

// Funding adds to the held balance

test("funding 50000 holds 50000", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f1" });
  const balances = ledger.balances();
  assert.equal(balances.held, 50000);
  assert.equal(balances.funded, 50000);
});

test("funding Number.MAX_SAFE_INTEGER holds it exactly", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: Number.MAX_SAFE_INTEGER, key: "f1" });
  assert.equal(ledger.balances().held, Number.MAX_SAFE_INTEGER);
  assert.equal(ledger.balances().funded, Number.MAX_SAFE_INTEGER);
});

// A release pays the contributor the amount less the platform fee

test("releasing 20000 at 1000 bps pays 18000 and takes a 2000 fee", () => {
  const ledger = funded(50000, 1000);
  const entry = ledger.release({ amount: 20000, contributor: "c1", key: "r1" });
  assert.equal(entry.kind, "release");
  assert.equal(entry.amount, 20000);
  assert.equal(entry.contributor, "c1");
  assert.equal(entry.fee, 2000);
  assert.equal(entry.net, 18000);
  const balances = ledger.balances();
  assert.equal(balances.held, 30000);
  assert.equal(balances.fees, 2000);
  assert.equal(balances.released, 20000);
  assert.equal(ledger.paidTo("c1"), 18000);
});

test("releasing at 10000 bps takes the whole amount as fee and pays nothing", () => {
  const ledger = funded(50000, 10000);
  const entry = ledger.release({ amount: 20000, contributor: "c1", key: "r1" });
  assert.equal(entry.fee, 20000);
  assert.equal(entry.net, 0);
  assert.equal(ledger.paidTo("c1"), 0);
  assert.equal(ledger.balances().fees, 20000);
  assert.equal(ledger.balances().released, 20000);
  assert.equal(ledger.balances().held, 30000);
});

// The fee is rounded half to even, exactly, at any size

test("the fee at 250 bps rounds 2.5 to 2 and 7.5 to 8", () => {
  assert.equal(releaseFee(100, 250), 2);
  assert.equal(releaseFee(300, 250), 8);
  const ledger = funded(50000, 250);
  assert.equal(ledger.release({ amount: 100, contributor: "c1", key: "r1" }).fee, 2);
  assert.equal(ledger.release({ amount: 300, contributor: "c1", key: "r2" }).fee, 8);
  assert.equal(ledger.paidTo("c1"), 98 + 292);
  assert.equal(ledger.balances().fees, 10);
});

test("the fee on a release of Number.MAX_SAFE_INTEGER at 9999 bps is exact", () => {
  // 9007199254740991 * 9999 / 10000 = 9006298534815516.9009, which rounds to ...517.
  assert.equal(releaseFee(Number.MAX_SAFE_INTEGER, 9999), 9006298534815517);
  const ledger = funded(Number.MAX_SAFE_INTEGER, 9999);
  const entry = ledger.release({ amount: Number.MAX_SAFE_INTEGER, contributor: "c1", key: "r1" });
  assert.equal(entry.fee, 9006298534815517);
  assert.equal(entry.net, 900719925474);
  assert.equal(ledger.paidTo("c1"), 900719925474);
});

// A refund returns money to the funder

test("refunding 10000 of 50000 holds 40000 and records 10000 refunded", () => {
  const ledger = funded(50000);
  const entry = ledger.refund({ amount: 10000, key: "x1" });
  assert.equal(entry.kind, "refund");
  assert.equal(entry.amount, 10000);
  assert.equal(ledger.balances().held, 40000);
  assert.equal(ledger.balances().refunded, 10000);
});

test("refunding all but 1 leaves 1 held and the ledger funded", () => {
  const ledger = funded(50000);
  ledger.refund({ amount: 49999, key: "x1" });
  assert.equal(ledger.balances().held, 1);
  assert.equal(ledger.balances().refunded, 49999);
  assert.equal(ledger.status(), "funded");
});

// Nothing leaves the ledger that it does not hold

test("releasing or refunding 50001 of 50000 fails with insufficient_funds and changes nothing", () => {
  const ledger = funded(50000);
  const before = snapshot(ledger);
  rejects(() => ledger.release({ amount: 50001, contributor: "c1", key: "r1" }), "insufficient_funds");
  rejects(() => ledger.refund({ amount: 50001, key: "x1" }), "insufficient_funds");
  assert.deepEqual(snapshot(ledger), before);
  assert.equal(ledger.paidTo("c1"), 0);
});

test("after a release, one more than what is held is refused and exactly what is held is not", () => {
  const ledger = funded(50000);
  ledger.release({ amount: 20000, contributor: "c1", key: "r1" });
  const before = snapshot(ledger);
  rejects(() => ledger.refund({ amount: 30001, key: "x1" }), "insufficient_funds");
  rejects(() => ledger.release({ amount: 30001, contributor: "c1", key: "r2" }), "insufficient_funds");
  assert.deepEqual(snapshot(ledger), before);
  ledger.refund({ amount: 30000, key: "x1" });
  assert.equal(ledger.balances().held, 0);
});

// Amounts must be valid

test("zero, negative and fractional amounts fail with invalid_amount and change nothing", () => {
  const ledger = funded(50000);
  const before = snapshot(ledger);
  for (const amount of [0, -1, 1.5]) {
    rejects(() => ledger.fund({ amount, key: `f-${amount}` }), "invalid_amount");
    rejects(() => ledger.release({ amount, contributor: "c1", key: `r-${amount}` }), "invalid_amount");
    rejects(() => ledger.refund({ amount, key: `x-${amount}` }), "invalid_amount");
  }
  assert.deepEqual(snapshot(ledger), before);
});

test("an amount of Number.MAX_SAFE_INTEGER + 1 fails with invalid_amount", () => {
  const ledger = funded(50000);
  const before = snapshot(ledger);
  const amount = Number.MAX_SAFE_INTEGER + 1;
  rejects(() => ledger.fund({ amount, key: "f2" }), "invalid_amount");
  rejects(() => ledger.release({ amount, contributor: "c1", key: "r1" }), "invalid_amount");
  rejects(() => ledger.refund({ amount, key: "x1" }), "invalid_amount");
  assert.deepEqual(snapshot(ledger), before);
});

// A ledger must be valid

test("a ledger in usd or US or at 10001 or 2.5 bps fails with invalid_ledger", () => {
  rejects(() => new Ledger({ currency: "usd", feeRateBps: 1000 }), "invalid_ledger");
  rejects(() => new Ledger({ currency: "US", feeRateBps: 1000 }), "invalid_ledger");
  rejects(() => new Ledger({ currency: "USD", feeRateBps: 10001 }), "invalid_ledger");
  rejects(() => new Ledger({ currency: "USD", feeRateBps: 2.5 }), "invalid_ledger");
});

test("fee rates of 0 and 10000 are accepted and -1 is not", () => {
  const free = new Ledger({ currency: "EUR", feeRateBps: 0 });
  assert.equal(free.status(), "open");
  const full = new Ledger({ currency: "EUR", feeRateBps: 10000 });
  assert.equal(full.status(), "open");
  rejects(() => new Ledger({ currency: "EUR", feeRateBps: -1 }), "invalid_ledger");
});
