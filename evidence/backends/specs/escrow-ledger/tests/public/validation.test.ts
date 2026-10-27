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
    paid: ledger.paidTo("c1"),
  };
}

test("[unhappy-1] releasing or refunding one more than held fails without changing anything", () => {
  for (const kind of ["release", "refund"] as const) {
    const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
    ledger.fund({ amount: 50000, key: "fund" });
    const before = snapshot(ledger);
    expectError(() => kind === "release"
      ? ledger.release({ amount: 50001, contributor: "c1", key: "excess" })
      : ledger.refund({ amount: 50001, key: "excess" }), "insufficient_funds");
    assert.deepEqual(snapshot(ledger), before);
  }
});

test("[unhappy-1] a new open ledger cannot release or refund even one unit", () => {
  for (const kind of ["release", "refund"] as const) {
    const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
    const before = snapshot(ledger);
    expectError(() => kind === "release"
      ? ledger.release({ amount: 1, contributor: "c1", key: "empty" })
      : ledger.refund({ amount: 1, key: "empty" }), "insufficient_funds");
    assert.deepEqual(snapshot(ledger), before);
  }
});

test("[unhappy-2] zero, negative and fractional amounts are rejected by every entry method", () => {
  for (const amount of [0, -1, 1.5]) {
    for (const kind of ["fund", "release", "refund"] as const) {
      const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
      ledger.fund({ amount: 50000, key: "initial" });
      const before = snapshot(ledger);
      expectError(() => kind === "release"
        ? ledger.release({ amount, contributor: "c1", key: "invalid" })
        : ledger[kind]({ amount, key: "invalid" }), "invalid_amount");
      assert.deepEqual(snapshot(ledger), before);
    }
  }
});

test("[unhappy-2] unsafe and nonfinite amounts are rejected by every entry method", () => {
  for (const amount of [Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -Infinity]) {
    for (const kind of ["fund", "release", "refund"] as const) {
      const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
      ledger.fund({ amount: 50000, key: "initial" });
      const before = snapshot(ledger);
      expectError(() => kind === "release"
        ? ledger.release({ amount, contributor: "c1", key: "invalid" })
        : ledger[kind]({ amount, key: "invalid" }), "invalid_amount");
      assert.deepEqual(snapshot(ledger), before);
    }
  }
});

test("[unhappy-3] the specified malformed currencies and fee rates cannot create a ledger", () => {
  for (const currency of ["usd", "US"]) {
    expectError(() => new Ledger({ currency, feeRateBps: 1000 }), "invalid_ledger");
  }
  for (const feeRateBps of [10001, 2.5]) {
    expectError(() => new Ledger({ currency: "USD", feeRateBps }), "invalid_ledger");
  }
});

test("[unhappy-3] currency shape and fee-rate endpoints are enforced exactly", () => {
  for (const currency of ["", "USDD", "U1D", "USd", " USD", "USD\n"]) {
    expectError(() => new Ledger({ currency, feeRateBps: 0 }), "invalid_ledger");
  }
  for (const feeRateBps of [-1, NaN, Infinity, -Infinity]) {
    expectError(() => new Ledger({ currency: "USD", feeRateBps }), "invalid_ledger");
  }
  for (const feeRateBps of [0, 10000]) {
    const ledger = new Ledger({ currency: "XYZ", feeRateBps });
    assert.equal(ledger.status(), "open");
    ledger.fund({ amount: 1, key: "fund" });
    assert.equal(ledger.balances().held, 1);
  }
});
