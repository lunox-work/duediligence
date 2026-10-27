import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, releaseFee } from "../../src/index.js";
import type { Balances } from "../../src/index.js";

function expectBalances(ledger: Ledger, expected: Balances): void {
  const actual = ledger.balances();
  for (const field of ["funded", "held", "released", "refunded", "fees"] as const) {
    assert.equal(actual[field], expected[field], field);
  }
}

function exactFee(amount: number, rate: number): number {
  const product = BigInt(amount) * BigInt(rate);
  const floor = product / 10000n;
  const remainder = product % 10000n;
  return Number(floor + (remainder > 5000n || (remainder === 5000n && floor % 2n === 1n) ? 1n : 0n));
}

// Extends public "funding adds to held and accumulates across entries": many distinct sizes and keys.
test("[happy-1] sixty-four funding entries accumulate without losing small deposits", () => {
  const ledger = new Ledger({ currency: "SGD", feeRateBps: 731 });
  let total = 0;
  for (let i = 1; i <= 64; i++) {
    const amount = i * i + 17;
    const entry = ledger.fund({ amount, key: `deposit-${i}` });
    total += amount;
    assert.equal(entry.amount, amount);
    assert.equal(entry.sequence, i);
    expectBalances(ledger, { funded: total, held: total, released: 0, refunded: 0, fees: 0 });
  }
});

// Extends public "funding accepts the minimum and maximum valid amounts": reach the maximum in pieces.
test("[happy-1] small deposits next to the safe-integer ceiling remain distinct", () => {
  const ledger = new Ledger({ currency: "JPY", feeRateBps: 0 });
  const amounts = [Number.MAX_SAFE_INTEGER - 1024, 1, 511, 512];
  let total = 0;
  for (let i = 0; i < amounts.length; i++) {
    ledger.fund({ amount: amounts[i], key: `ceiling-${i}` });
    total += amounts[i];
    assert.equal(ledger.balances().held, total);
  }
  expectBalances(ledger, {
    funded: Number.MAX_SAFE_INTEGER, held: Number.MAX_SAFE_INTEGER, released: 0, refunded: 0, fees: 0,
  });
});

// Extends public "releasing deducts gross amounts and accumulates net pay per contributor".
test("[happy-2] interleaved payouts separate case-sensitive and object-property contributor names", () => {
  const ledger = new Ledger({ currency: "EUR", feeRateBps: 1379 });
  ledger.fund({ amount: 100000, key: "capital" });
  const contributors = ["__proto__", "constructor", "toString", "c1", "C1", "contributor/東京"];
  const paid = new Map<string, number>();
  let released = 0;
  let fees = 0;
  for (let i = 0; i < 36; i++) {
    const contributor = contributors[(i * 5) % contributors.length];
    const amount = 137 + i * 23;
    const fee = exactFee(amount, 1379);
    const entry = ledger.release({ amount, contributor, key: `payment-${i}` });
    assert.equal(entry.fee, fee);
    assert.equal(entry.net, amount - fee);
    released += amount;
    fees += fee;
    paid.set(contributor, (paid.get(contributor) ?? 0) + amount - fee);
    for (const name of contributors) assert.equal(ledger.paidTo(name), paid.get(name) ?? 0);
  }
  assert.equal(ledger.paidTo("never paid"), 0);
  expectBalances(ledger, { funded: 100000, held: 100000 - released, released, refunded: 0, fees });
});

// Extends public "a one-unit release permits zero and full fee rates": large repeated payouts.
test("[happy-2] zero and full fee endpoints apply to every unit of large releases", () => {
  for (const rate of [0, 10000]) {
    const ledger = new Ledger({ currency: "XTS", feeRateBps: rate });
    ledger.fund({ amount: Number.MAX_SAFE_INTEGER, key: "capital" });
    const first = 4503599627370493;
    const second = Number.MAX_SAFE_INTEGER - first;
    for (const [i, amount] of [first, second].entries()) {
      const entry = ledger.release({ amount, contributor: "worker", key: `payment-${i}` });
      assert.equal(entry.fee, rate === 0 ? 0 : amount);
      assert.equal(entry.net, rate === 0 ? amount : 0);
      assert.equal(releaseFee(amount, rate), entry.fee);
    }
    assert.equal(ledger.paidTo("worker"), rate === 0 ? Number.MAX_SAFE_INTEGER : 0);
    expectBalances(ledger, {
      funded: Number.MAX_SAFE_INTEGER, held: 0, released: Number.MAX_SAFE_INTEGER, refunded: 0,
      fees: rate === 0 ? 0 : Number.MAX_SAFE_INTEGER,
    });
  }
});

// Extends public "fees round ties to even and values around ties to the nearest integer".
test("[boundary-1] exact fee oracle covers small values across eleven rates", () => {
  for (const rate of [0, 1, 7, 125, 250, 3333, 5000, 8750, 9998, 9999, 10000]) {
    for (const amount of [1, 2, 3, 7, 19, 20, 59, 60, 61, 139, 140, 141, 9999, 10000, 10001, 123457]) {
      assert.equal(releaseFee(amount, rate), exactFee(amount, rate), `${amount} at ${rate}`);
    }
  }
});

// Extends public "the maximum safe amount has an exact fee at 9999 basis points".
test("[boundary-1] fees remain exact near both large integer precision boundaries", () => {
  const amounts = [2 ** 52 - 1, 2 ** 52, 2 ** 52 + 1, Number.MAX_SAFE_INTEGER - 10001,
    Number.MAX_SAFE_INTEGER - 2, Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER];
  for (const rate of [1, 3, 249, 250, 3333, 5000, 7777, 9998, 9999]) {
    for (const amount of amounts) {
      const fee = exactFee(amount, rate);
      assert.equal(releaseFee(amount, rate), fee, `${amount} at ${rate}`);
      const ledger = new Ledger({ currency: "GBP", feeRateBps: rate });
      ledger.fund({ amount, key: "fund" });
      const entry = ledger.release({ amount, contributor: "large", key: "release" });
      assert.equal(entry.fee, fee);
      assert.equal(entry.net, amount - fee);
      assert.equal(ledger.paidTo("large"), amount - fee);
      expectBalances(ledger, { funded: amount, held: 0, released: amount, refunded: 0, fees: fee });
    }
  }
});

test("[boundary-1] many consecutive even and odd half ties round correctly at large magnitudes", () => {
  for (let offset = 0; offset < 32; offset++) {
    for (const base of [0, 9007199254700000]) {
      const amount = base + 20 + offset * 40;
      assert.equal(releaseFee(amount, 250), exactFee(amount, 250));
      assert.equal(releaseFee(amount - 1, 250), exactFee(amount - 1, 250));
      assert.equal(releaseFee(amount + 1, 250), exactFee(amount + 1, 250));
    }
  }
});

test("[boundary-1] ledger fees sum individually rounded releases rather than rounding their sum", () => {
  for (const amount of [1, 3, 5, 7]) {
    const ledger = new Ledger({ currency: "USD", feeRateBps: 5000 });
    ledger.fund({ amount: amount * 10 + 1, key: "fund" });
    for (let i = 0; i < 10; i++) {
      const entry = ledger.release({ amount, contributor: "worker", key: `split-${i}` });
      assert.equal(entry.fee, exactFee(amount, 5000));
    }
    const fees = exactFee(amount, 5000) * 10;
    assert.equal(ledger.balances().fees, fees);
    assert.equal(ledger.paidTo("worker"), amount * 10 - fees);
    assert.equal(ledger.balances().held, 1);
  }
});

// Extends public "refunds reduce held and accumulate the total returned to the funder".
test("[happy-3] refunds interleaved with funding and releases preserve previous fees and pay", () => {
  const ledger = new Ledger({ currency: "CAD", feeRateBps: 3333 });
  ledger.fund({ amount: 76543, key: "initial" });
  const fee = exactFee(12345, 3333);
  ledger.release({ amount: 12345, contributor: "worker", key: "pay" });
  let funded = 76543;
  let refunded = 0;
  for (let i = 1; i <= 20; i++) {
    ledger.refund({ amount: i * 31, key: `refund-${i}` });
    refunded += i * 31;
    ledger.fund({ amount: i * 7, key: `fund-${i}` });
    funded += i * 7;
    expectBalances(ledger, { funded, held: funded - 12345 - refunded, released: 12345, refunded, fees: fee });
    assert.equal(ledger.paidTo("worker"), 12345 - fee);
  }
});

// Extends public "a one-unit refund takes no fee even at the full fee rate".
test("[happy-3] maximum-size refunds take no platform fee at several rates", () => {
  for (const rate of [1, 250, 9999, 10000]) {
    const ledger = new Ledger({ currency: "CHF", feeRateBps: rate });
    ledger.fund({ amount: Number.MAX_SAFE_INTEGER, key: "fund" });
    ledger.refund({ amount: Number.MAX_SAFE_INTEGER - 7, key: "large-refund" });
    ledger.refund({ amount: 7, key: "last-refund" });
    expectBalances(ledger, {
      funded: Number.MAX_SAFE_INTEGER, held: 0, released: 0, refunded: Number.MAX_SAFE_INTEGER, fees: 0,
    });
    assert.equal(ledger.paidTo("worker"), 0);
  }
});
