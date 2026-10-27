import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, releaseFee } from "../../src/index.js";

test("[happy-1] funding adds to held and accumulates across entries", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "fund-1" });
  assert.deepEqual(ledger.balances(), {
    funded: 50000, held: 50000, released: 0, refunded: 0, fees: 0,
  });
  ledger.fund({ amount: 5000, key: "fund-2" });
  assert.deepEqual(ledger.balances(), {
    funded: 55000, held: 55000, released: 0, refunded: 0, fees: 0,
  });
});

test("[happy-1] funding accepts the minimum and maximum valid amounts", () => {
  for (const amount of [1, Number.MAX_SAFE_INTEGER]) {
    const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
    const entry = ledger.fund({ amount, key: "fund-limit" });
    assert.equal(entry.amount, amount);
    assert.deepEqual(ledger.balances(), {
      funded: amount, held: amount, released: 0, refunded: 0, fees: 0,
    });
  }
});

test("[happy-2] releasing deducts gross amounts and accumulates net pay per contributor", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "fund" });
  const entry = ledger.release({ amount: 20000, contributor: "c1", key: "release-1" });
  assert.equal(entry.fee, 2000);
  assert.equal(entry.net, 18000);
  assert.deepEqual(ledger.balances(), {
    funded: 50000, held: 30000, released: 20000, refunded: 0, fees: 2000,
  });
  assert.equal(ledger.paidTo("c1"), 18000);
  assert.equal(ledger.paidTo("c2"), 0);
  ledger.release({ amount: 10000, contributor: "c2", key: "release-2" });
  ledger.release({ amount: 5000, contributor: "c1", key: "release-3" });
  assert.equal(ledger.paidTo("c1"), 22500);
  assert.equal(ledger.paidTo("c2"), 9000);
  assert.deepEqual(ledger.balances(), {
    funded: 50000, held: 15000, released: 35000, refunded: 0, fees: 3500,
  });
});

test("[happy-2] a one-unit release permits zero and full fee rates", () => {
  for (const feeRateBps of [0, 10000]) {
    const ledger = new Ledger({ currency: "USD", feeRateBps });
    ledger.fund({ amount: 1, key: "fund" });
    const entry = ledger.release({ amount: 1, contributor: "c1", key: "release" });
    const fee = feeRateBps === 0 ? 0 : 1;
    assert.equal(releaseFee(1, feeRateBps), fee);
    assert.equal(entry.fee, fee);
    assert.equal(entry.net, 1 - fee);
    assert.equal(ledger.paidTo("c1"), 1 - fee);
    assert.deepEqual(ledger.balances(), {
      funded: 1, held: 0, released: 1, refunded: 0, fees: fee,
    });
  }
});

test("[boundary-1] fees round ties to even and values around ties to the nearest integer", () => {
  const cases = [[99, 2], [100, 2], [101, 3], [299, 7], [300, 8], [301, 8]] as const;
  for (const [amount, fee] of cases) {
    assert.equal(releaseFee(amount, 250), fee, `fee on ${amount}`);
    const ledger = new Ledger({ currency: "USD", feeRateBps: 250 });
    ledger.fund({ amount, key: "fund" });
    const entry = ledger.release({ amount, contributor: "c1", key: "release" });
    assert.equal(entry.fee, fee);
    assert.equal(entry.net, amount - fee);
    assert.equal(ledger.balances().fees, fee);
    assert.equal(ledger.paidTo("c1"), amount - fee);
  }
});

test("[boundary-1] the maximum safe amount has an exact fee at 9999 basis points", () => {
  const amount = Number.MAX_SAFE_INTEGER;
  const fee = 9006298534815517;
  const net = 900719925474;
  assert.equal(releaseFee(amount, 9999), fee);
  const ledger = new Ledger({ currency: "USD", feeRateBps: 9999 });
  ledger.fund({ amount, key: "fund" });
  const entry = ledger.release({ amount, contributor: "c1", key: "release" });
  assert.equal(entry.fee, fee);
  assert.equal(entry.net, net);
  assert.equal(ledger.paidTo("c1"), net);
  assert.deepEqual(ledger.balances(), {
    funded: amount, held: 0, released: amount, refunded: 0, fees: fee,
  });
});

test("[happy-3] refunds reduce held and accumulate the total returned to the funder", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "fund" });
  ledger.refund({ amount: 10000, key: "refund-1" });
  assert.deepEqual(ledger.balances(), {
    funded: 50000, held: 40000, released: 0, refunded: 10000, fees: 0,
  });
  ledger.refund({ amount: 5000, key: "refund-2" });
  assert.deepEqual(ledger.balances(), {
    funded: 50000, held: 35000, released: 0, refunded: 15000, fees: 0,
  });
  assert.equal(ledger.paidTo("c1"), 0);
});

test("[happy-3] a one-unit refund takes no fee even at the full fee rate", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 10000 });
  ledger.fund({ amount: 2, key: "fund" });
  const entry = ledger.refund({ amount: 1, key: "refund" });
  assert.equal(entry.kind, "refund");
  assert.equal(entry.amount, 1);
  assert.deepEqual(ledger.balances(), {
    funded: 2, held: 1, released: 0, refunded: 1, fees: 0,
  });
  assert.equal(ledger.paidTo("c1"), 0);
});
