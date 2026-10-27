import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, LedgerError } from "../../src/index.js";
import type { LedgerErrorCode } from "../../src/index.js";

function expectError(action: () => unknown, code: LedgerErrorCode): void {
  assert.throws(action, (error: unknown) => error instanceof LedgerError && error.code === code);
}

function snapshot(ledger: Ledger) {
  const { funded, held, released, refunded, fees } = ledger.balances();
  return {
    balances: { funded, held, released, refunded, fees },
    status: ledger.status(),
    entries: ledger.entries().map((entry) => entry.kind === "release"
      ? { kind: entry.kind, amount: entry.amount, key: entry.key, sequence: entry.sequence,
        contributor: entry.contributor, fee: entry.fee, net: entry.net }
      : { kind: entry.kind, amount: entry.amount, key: entry.key, sequence: entry.sequence }),
    paid: [ledger.paidTo("alice"), ledger.paidTo("bob"), ledger.paidTo("__proto__")],
  };
}

// Extends public "releasing or refunding one more than held fails without changing anything".
test("[unhappy-1] insufficient funds uses current held after mixed movements rather than total funding", () => {
  for (const kind of ["release", "refund"] as const) {
    const ledger = new Ledger({ currency: "EUR", feeRateBps: 7500 });
    ledger.fund({ amount: 1009, key: "fund" });
    ledger.release({ amount: 601, contributor: "alice", key: "pay" });
    ledger.refund({ amount: 400, key: "return" });
    ledger.fund({ amount: 3, key: "top-up" });
    assert.equal(ledger.balances().held, 11);
    const before = snapshot(ledger);
    for (const amount of [12, 103, 1009, Number.MAX_SAFE_INTEGER]) {
      expectError(() => kind === "release"
        ? ledger.release({ amount, contributor: "bob", key: `over-${amount}` })
        : ledger.refund({ amount, key: `over-${amount}` }), "insufficient_funds");
      assert.deepEqual(snapshot(ledger), before);
    }
  }
});

// Extends public "a new open ledger cannot release or refund even one unit".
test("[unhappy-1] repeated unfunded requests of larger sizes leave a pristine open ledger", () => {
  const ledger = new Ledger({ currency: "AUD", feeRateBps: 10000 });
  const before = snapshot(ledger);
  for (let i = 0; i < 12; i++) {
    const amount = i === 11 ? Number.MAX_SAFE_INTEGER : 37 * (i + 1);
    expectError(() => ledger.release({ amount, contributor: "alice", key: `pay-${i}` }), "insufficient_funds");
    expectError(() => ledger.refund({ amount, key: `return-${i}` }), "insufficient_funds");
    assert.deepEqual(snapshot(ledger), before);
  }
  const first = ledger.fund({ amount: 23, key: "first" });
  assert.equal(first.sequence, 1);
  assert.equal(ledger.status(), "funded");
});

test("[unhappy-1] full platform fees cannot make an unaffordable gross release affordable", () => {
  const ledger = new Ledger({ currency: "GBP", feeRateBps: 10000 });
  ledger.fund({ amount: 73, key: "fund" });
  const before = snapshot(ledger);
  expectError(() => ledger.release({ amount: 74, contributor: "alice", key: "over" }), "insufficient_funds");
  assert.deepEqual(snapshot(ledger), before);
  const entry = ledger.release({ amount: 73, contributor: "alice", key: "valid" });
  assert.equal(entry.fee, 73);
  assert.equal(entry.net, 0);
  assert.equal(ledger.balances().held, 0);
});

// Extends public "zero, negative and fractional amounts are rejected by every entry method".
test("[unhappy-2] signed zero, tiny fractions and large fractions are invalid without side effects", () => {
  for (const kind of ["fund", "release", "refund"] as const) {
    const ledger = new Ledger({ currency: "NZD", feeRateBps: 1111 });
    ledger.fund({ amount: 1000000, key: "fund" });
    ledger.release({ amount: 77, contributor: "alice", key: "pay" });
    const before = snapshot(ledger);
    for (const [i, amount] of [-0, Number.MIN_VALUE, 0.5, 99999.25, -123456, -0.5].entries()) {
      expectError(() => kind === "release"
        ? ledger.release({ amount, contributor: "bob", key: `bad-${i}` })
        : ledger[kind]({ amount, key: `bad-${i}` }), "invalid_amount");
      assert.deepEqual(snapshot(ledger), before);
    }
    assert.equal(ledger.fund({ amount: 19, key: "next" }).sequence, 3);
  }
});

// Extends public "unsafe and nonfinite amounts are rejected by every entry method".
test("[unhappy-2] huge finite integers and nonfinite amounts stay invalid on an already active ledger", () => {
  for (const kind of ["fund", "release", "refund"] as const) {
    const ledger = new Ledger({ currency: "SEK", feeRateBps: 9000 });
    ledger.fund({ amount: Number.MAX_SAFE_INTEGER, key: "initial" });
    ledger.release({ amount: 11, contributor: "alice", key: "pay" });
    const before = snapshot(ledger);
    for (const [i, amount] of [2 ** 53 + 2, 2 ** 54, Number.MAX_VALUE, -Number.MAX_VALUE, NaN, Infinity, -Infinity].entries()) {
      expectError(() => kind === "release"
        ? ledger.release({ amount, contributor: "bob", key: `bad-${i}` })
        : ledger[kind]({ amount, key: `bad-${i}` }), "invalid_amount");
      assert.deepEqual(snapshot(ledger), before);
    }
  }
});

// Extends public "the specified malformed currencies and fee rates cannot create a ledger".
test("[unhappy-3] mixed-case and misplaced characters are rejected instead of normalizing currency", () => {
  for (const currency of ["uSD", "UsD", "eur", "EU", "EURO", "A_B", "A-B", "12A", "AB!", "A B"]) {
    expectError(() => new Ledger({ currency, feeRateBps: 731 }), "invalid_ledger");
  }
});

// Extends public "currency shape and fee-rate endpoints are enforced exactly".
test("[unhappy-3] embedded and surrounding whitespace or control characters cannot pass currency checks", () => {
  for (const currency of ["USD ", "\tUSD", "USD\t", "USD\r", "USD\r\n", "\nUSD", "US\nD", "USD\u0000", "A".repeat(1000)]) {
    expectError(() => new Ledger({ currency, feeRateBps: 10000 }), "invalid_ledger");
  }
});

test("[unhappy-3] fractional fee rates near endpoints and huge finite rates are invalid", () => {
  for (const feeRateBps of [Number.MIN_VALUE, 0.5, 9999.5, 10000.5, -0.5, -10000,
    Number.MAX_SAFE_INTEGER, Number.MAX_VALUE]) {
    expectError(() => new Ledger({ currency: "CHF", feeRateBps }), "invalid_ledger");
  }
});

// Extends public "currency shape and fee-rate endpoints are enforced exactly": no currency registry restriction.
test("[happy-1] arbitrary three-letter uppercase currencies accept interior whole-number rates", () => {
  for (const currency of ["AAA", "ZZZ", "QXZ", "EUR", "JPY"]) {
    for (const feeRateBps of [1, 731, 9999]) {
      const ledger = new Ledger({ currency, feeRateBps });
      assert.equal(ledger.status(), "open");
      ledger.fund({ amount: 313, key: "fund" });
      assert.equal(ledger.balances().held, 313);
    }
  }
});
