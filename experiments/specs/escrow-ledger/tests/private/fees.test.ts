import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, releaseFee } from "../../src/index.js";

const MAX = Number.MAX_SAFE_INTEGER;

// The fee is amount * bps / 10000, rounded half to even, computed exactly.
function expectedFee(amount: number, bps: number): number {
  const n = BigInt(amount) * BigInt(bps);
  let q = n / 10000n;
  const r = n % 10000n;
  if (r * 2n > 10000n || (r * 2n === 10000n && q % 2n === 1n)) q += 1n;
  return Number(q);
}

// Extends "the fee at 250 bps rounds 2.5 to 2 and 7.5 to 8": more exact halves, both ways.
test("private: exact halves round to the even neighbour at several rates", () => {
  assert.equal(releaseFee(500, 250), 12); // 12.5 -> 12
  assert.equal(releaseFee(700, 250), 18); // 17.5 -> 18
  assert.equal(releaseFee(1, 5000), 0); // 0.5 -> 0
  assert.equal(releaseFee(3, 5000), 2); // 1.5 -> 2
  assert.equal(releaseFee(5, 5000), 2); // 2.5 -> 2
  assert.equal(releaseFee(7, 5000), 4); // 3.5 -> 4
  assert.equal(releaseFee(2, 2500), 0); // 0.5 -> 0
  assert.equal(releaseFee(6, 2500), 2); // 1.5 -> 2
  assert.equal(releaseFee(10, 7500), 8); // 7.5 -> 8
  assert.equal(releaseFee(14, 7500), 10); // 10.5 -> 10
});

// Extends "the fee at 250 bps rounds 2.5 to 2 and 7.5 to 8": values that are not halves round to nearest.
test("private: fees that are not exact halves round to the nearest whole unit", () => {
  assert.equal(releaseFee(1, 1000), 0); // 0.1
  assert.equal(releaseFee(5, 1000), 0); // 0.5 -> 0
  assert.equal(releaseFee(6, 1000), 1); // 0.6
  assert.equal(releaseFee(15, 1000), 2); // 1.5 -> 2
  assert.equal(releaseFee(14, 1000), 1); // 1.4
  assert.equal(releaseFee(1, 5001), 1); // 0.5001
  assert.equal(releaseFee(1, 4999), 0); // 0.4999
  assert.equal(releaseFee(101, 250), 3); // 2.525
  assert.equal(releaseFee(99, 250), 2); // 2.475
  assert.equal(releaseFee(1, 10000), 1);
  assert.equal(releaseFee(12345, 0), 0);
  assert.equal(releaseFee(12345, 10000), 12345);
});

// Extends "the fee at 250 bps rounds 2.5 to 2 and 7.5 to 8": a sweep of small amounts and rates.
test("private: releaseFee matches exact half-to-even rounding over a grid of small amounts and rates", () => {
  const rates = [0, 1, 3, 5, 50, 125, 250, 333, 1000, 2500, 4999, 5000, 5001, 7500, 9999, 10000];
  for (const bps of rates) {
    for (let amount = 1; amount <= 400; amount++) {
      assert.equal(releaseFee(amount, bps), expectedFee(amount, bps), `amount ${amount} at ${bps} bps`);
    }
  }
});

// Extends "the fee on a release of Number.MAX_SAFE_INTEGER at 9999 bps is exact": other rates at the top of the range.
test("private: the fee on Number.MAX_SAFE_INTEGER is exact at rates where floating point goes wrong", () => {
  // 9007199254740991 * 5000 / 10000 = 4503599627370495.5, which rounds to the even ...496.
  assert.equal(releaseFee(MAX, 5000), 4503599627370496);
  assert.equal(releaseFee(MAX, 5001), expectedFee(MAX, 5001));
  assert.equal(releaseFee(MAX, 4999), expectedFee(MAX, 4999));
  assert.equal(releaseFee(MAX, 10000), MAX);
  assert.equal(releaseFee(MAX, 1), 900719925474);
  assert.equal(releaseFee(MAX, 0), 0);
  // 9007199254740990 / 4 = 2251799813685247.5 -> ...248; 9007199254740986 / 4 = 2251799813685246.5 -> ...246.
  assert.equal(releaseFee(9007199254740990, 2500), 2251799813685248);
  assert.equal(releaseFee(9007199254740986, 2500), 2251799813685246);
});

// Extends "the fee on a release of Number.MAX_SAFE_INTEGER at 9999 bps is exact": many large amounts.
test("private: releaseFee is exact over a sweep of large amounts and rates", () => {
  const rates = [1, 7, 250, 1000, 3333, 4999, 5000, 5001, 6667, 9999, 10000];
  for (const bps of rates) {
    for (let i = 0; i < 300; i++) {
      const amount = MAX - i * 7919;
      assert.equal(releaseFee(amount, bps), expectedFee(amount, bps), `amount ${amount} at ${bps} bps`);
    }
    for (let i = 0; i < 100; i++) {
      const amount = 4503599627370496 + i * 104729 + 1;
      assert.equal(releaseFee(amount, bps), expectedFee(amount, bps), `amount ${amount} at ${bps} bps`);
    }
  }
});

// Extends "the fee on a release of Number.MAX_SAFE_INTEGER at 9999 bps is exact": the ledger uses the same exact fee.
test("private: a release of Number.MAX_SAFE_INTEGER at 5000 bps records the exact half-to-even fee and net", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 5000 });
  ledger.fund({ amount: MAX - 1, key: "f1" });
  ledger.fund({ amount: 1, key: "f2" });
  assert.equal(ledger.balances().held, MAX);
  const entry = ledger.release({ amount: MAX, contributor: "c1", key: "r1" });
  assert.equal(entry.fee, 4503599627370496);
  assert.equal(entry.net, 4503599627370495);
  assert.equal(entry.fee + entry.net, MAX);
  assert.equal(ledger.paidTo("c1"), 4503599627370495);
  assert.equal(ledger.balances().fees, 4503599627370496);
  assert.equal(ledger.balances().released, MAX);
  assert.equal(ledger.balances().held, 0);
  assert.equal(ledger.status(), "closed");
});

// Extends "the fee at 250 bps rounds 2.5 to 2 and 7.5 to 8": the ledger's rate, not a fixed one, sets each release's fee.
test("private: each release's fee and net follow the ledger's own fee rate", () => {
  for (const bps of [0, 1, 250, 777, 5000, 9999, 10000]) {
    const ledger = new Ledger({ currency: "GBP", feeRateBps: bps });
    ledger.fund({ amount: 1_000_000, key: "f1" });
    let fees = 0;
    let paid = 0;
    for (const [i, amount] of [1, 2, 3, 99, 100, 101, 12345, 33333].entries()) {
      const entry = ledger.release({ amount, contributor: "c1", key: `r${i}` });
      const fee = expectedFee(amount, bps);
      assert.equal(entry.fee, fee, `fee on ${amount} at ${bps} bps`);
      assert.equal(entry.net, amount - fee, `net on ${amount} at ${bps} bps`);
      assert.equal(releaseFee(amount, bps), fee);
      fees += fee;
      paid += amount - fee;
    }
    assert.equal(ledger.balances().fees, fees);
    assert.equal(ledger.paidTo("c1"), paid);
  }
});

// Extends "releasing at 10000 bps takes the whole amount as fee and pays nothing": the 0 bps end.
test("private: releasing at 0 bps takes no fee and pays the whole amount", () => {
  const ledger = new Ledger({ currency: "EUR", feeRateBps: 0 });
  ledger.fund({ amount: 50000, key: "f1" });
  const entry = ledger.release({ amount: 20001, contributor: "c1", key: "r1" });
  assert.equal(entry.fee, 0);
  assert.equal(entry.net, 20001);
  assert.equal(ledger.paidTo("c1"), 20001);
  assert.equal(ledger.balances().fees, 0);
  assert.equal(ledger.balances().released, 20001);
  assert.equal(ledger.balances().held, 29999);
});
