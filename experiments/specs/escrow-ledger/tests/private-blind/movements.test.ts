import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, LedgerError } from "../../src/index.js";
import type { Balances, LedgerErrorCode } from "../../src/index.js";

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

function assertInvariant(b: Balances): void {
  assert.equal(b.funded, b.held + b.released + b.refunded);
}

test("funding the spec's amount holds it", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f1" });
  assert.equal(ledger.balances().held, 50000);
  assert.equal(ledger.balances().funded, 50000);
});

test("funding other amounts adds each to the held balance", () => {
  const ledger = new Ledger({ currency: "EUR", feeRateBps: 0 });
  const entry = ledger.fund({ amount: 1, key: "a" });
  assert.equal(entry.kind, "fund");
  assert.equal(entry.amount, 1);
  assert.equal(entry.key, "a");
  ledger.fund({ amount: 73129, key: "b" });
  ledger.fund({ amount: 870, key: "c" });
  const b = ledger.balances();
  assert.equal(b.held, 74000);
  assert.equal(b.funded, 74000);
  assert.equal(b.released, 0);
  assert.equal(b.refunded, 0);
  assert.equal(b.fees, 0);
});

test("a new ledger holds nothing", () => {
  const ledger = new Ledger({ currency: "AUD", feeRateBps: 42 });
  assert.deepEqual(ledger.balances(), { funded: 0, held: 0, released: 0, refunded: 0, fees: 0 });
  assert.deepEqual(ledger.entries(), []);
});

test("funding the largest amount holds it exactly", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: Number.MAX_SAFE_INTEGER, key: "max" });
  assert.equal(ledger.balances().held, Number.MAX_SAFE_INTEGER);
});

test("the spec's release pays the contributor less the fee", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f" });
  ledger.release({ amount: 20000, contributor: "c1", key: "r" });
  const b = ledger.balances();
  assert.equal(b.held, 30000);
  assert.equal(ledger.paidTo("c1"), 18000);
  assert.equal(b.fees, 2000);
  assert.equal(b.released, 20000);
});

test("a release with other values moves held to released, fee and net", () => {
  const ledger = new Ledger({ currency: "EUR", feeRateBps: 1500 });
  ledger.fund({ amount: 80000, key: "fund-1" });
  const entry = ledger.release({ amount: 33333, contributor: "alice", key: "rel-1" });
  assert.equal(entry.kind, "release");
  assert.equal(entry.amount, 33333);
  assert.equal(entry.contributor, "alice");
  assert.equal(entry.key, "rel-1");
  assert.equal(entry.fee, 5000);
  assert.equal(entry.net, 28333);
  const b = ledger.balances();
  assert.equal(b.held, 46667);
  assert.equal(b.released, 33333);
  assert.equal(b.fees, 5000);
  assert.equal(b.funded, 80000);
  assert.equal(b.refunded, 0);
  assert.equal(ledger.paidTo("alice"), 28333);
});

test("payments accumulate per contributor across releases", () => {
  const ledger = new Ledger({ currency: "CAD", feeRateBps: 700 });
  ledger.fund({ amount: 100000, key: "f" });
  ledger.release({ amount: 10000, contributor: "bob", key: "r1" }); // fee 700
  ledger.release({ amount: 2500, contributor: "eve", key: "r2" }); // fee 175
  ledger.release({ amount: 4321, contributor: "bob", key: "r3" }); // 302.47 -> 302
  assert.equal(ledger.paidTo("bob"), 9300 + 4019);
  assert.equal(ledger.paidTo("eve"), 2325);
  assert.equal(ledger.paidTo("nobody"), 0);
  const b = ledger.balances();
  assert.equal(b.fees, 700 + 175 + 302);
  assert.equal(b.released, 16821);
  assert.equal(b.held, 100000 - 16821);
  assert.equal(b.fees + ledger.paidTo("bob") + ledger.paidTo("eve"), b.released);
});

test("the spec's refund returns money to the funder", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f" });
  ledger.refund({ amount: 10000, key: "rf" });
  const b = ledger.balances();
  assert.equal(b.held, 40000);
  assert.equal(b.refunded, 10000);
});

test("refunds with other values accumulate and reduce held", () => {
  const ledger = new Ledger({ currency: "NZD", feeRateBps: 300 });
  ledger.fund({ amount: 9000, key: "f1" });
  ledger.fund({ amount: 1234, key: "f2" });
  const entry = ledger.refund({ amount: 4567, key: "back-1" });
  assert.equal(entry.kind, "refund");
  assert.equal(entry.amount, 4567);
  assert.equal(entry.key, "back-1");
  ledger.refund({ amount: 1, key: "back-2" });
  const b = ledger.balances();
  assert.equal(b.held, 10234 - 4568);
  assert.equal(b.refunded, 4568);
  assert.equal(b.funded, 10234);
  assert.equal(b.released, 0);
  assert.equal(b.fees, 0);
});

test("releasing one more than the spec's held amount fails with insufficient_funds", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "f" });
  const before = snapshot(ledger, ["c1"]);
  assertLedgerError(() => ledger.release({ amount: 50001, contributor: "c1", key: "r" }), "insufficient_funds");
  assertLedgerError(() => ledger.refund({ amount: 50001, key: "rf" }), "insufficient_funds");
  assert.deepEqual(snapshot(ledger, ["c1"]), before);
});

test("taking more than is held after other movements fails with insufficient_funds", () => {
  const ledger = new Ledger({ currency: "SEK", feeRateBps: 900 });
  ledger.fund({ amount: 7000, key: "f1" });
  ledger.fund({ amount: 3000, key: "f2" });
  ledger.release({ amount: 2500, contributor: "d", key: "r1" });
  ledger.refund({ amount: 1500, key: "rf1" });
  // 6000 held
  const before = snapshot(ledger, ["d"]);
  assertLedgerError(() => ledger.release({ amount: 6001, contributor: "d", key: "r2" }), "insufficient_funds");
  assertLedgerError(() => ledger.refund({ amount: 9999, key: "rf2" }), "insufficient_funds");
  assertLedgerError(() => ledger.release({ amount: Number.MAX_SAFE_INTEGER, contributor: "e", key: "r3" }), "insufficient_funds");
  assert.deepEqual(snapshot(ledger, ["d", "e"]), { ...before, paid: [...before.paid, 0] });
  // exactly what is held is still allowed
  ledger.refund({ amount: 6000, key: "rf3" });
  assert.equal(ledger.balances().held, 0);
});

test("taking anything from a ledger that was never funded fails with insufficient_funds", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 10 });
  assertLedgerError(() => ledger.release({ amount: 1, contributor: "c", key: "r" }), "insufficient_funds");
  assertLedgerError(() => ledger.refund({ amount: 25, key: "rf" }), "insufficient_funds");
  assert.equal(ledger.status(), "open");
  assert.deepEqual(ledger.entries(), []);
});

test("total funded equals held plus released plus refunded after every movement", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1234 });
  const steps: Array<() => unknown> = [
    () => ledger.fund({ amount: 40000, key: "s1" }),
    () => ledger.release({ amount: 777, contributor: "p", key: "s2" }),
    () => ledger.refund({ amount: 3001, key: "s3" }),
    () => ledger.fund({ amount: 15, key: "s4" }),
    () => ledger.release({ amount: 12000, contributor: "q", key: "s5" }),
    () => ledger.release({ amount: 9, contributor: "p", key: "s6" }),
    () => ledger.refund({ amount: 100, key: "s7" }),
  ];
  assertInvariant(ledger.balances());
  for (const step of steps) {
    step();
    assertInvariant(ledger.balances());
  }
  const b = ledger.balances();
  assert.equal(b.funded, 40015);
  assert.equal(b.released, 12786);
  assert.equal(b.refunded, 3101);
  assert.equal(b.held, 40015 - 12786 - 3101);
  assert.equal(b.fees + ledger.paidTo("p") + ledger.paidTo("q"), b.released);
});
