import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, releaseFee } from "../../src/index.js";

const MAX = Number.MAX_SAFE_INTEGER;

/** amount * bps / 10000, rounded half to even, computed exactly. */
function expectedFee(amount: number, bps: number): number {
  const product = BigInt(amount) * BigInt(bps);
  const quotient = product / 10000n;
  const remainder = product % 10000n;
  const roundUp =
    remainder > 5000n || (remainder === 5000n && quotient % 2n === 1n);
  return Number(roundUp ? quotient + 1n : quotient);
}

test("releaseFee rounds the spec's own ties at 250 basis points to even", () => {
  assert.equal(releaseFee(100, 250), 2);
  assert.equal(releaseFee(300, 250), 8);
});

test("releaseFee rounds other ties at 250 basis points to the even neighbour", () => {
  assert.equal(releaseFee(500, 250), 12); // 12.5
  assert.equal(releaseFee(700, 250), 18); // 17.5
  assert.equal(releaseFee(20, 250), 0); // 0.5
  assert.equal(releaseFee(60, 250), 2); // 1.5
  assert.equal(releaseFee(1900, 250), 48); // 47.5
});

test("releaseFee rounds ties to even at other fee rates", () => {
  assert.equal(releaseFee(1, 5000), 0); // 0.5
  assert.equal(releaseFee(3, 5000), 2); // 1.5
  assert.equal(releaseFee(5, 5000), 2); // 2.5
  assert.equal(releaseFee(7, 5000), 4); // 3.5
  assert.equal(releaseFee(15, 1000), 2); // 1.5
  assert.equal(releaseFee(25, 1000), 2); // 2.5
  assert.equal(releaseFee(5000, 1), 0); // 0.5
  assert.equal(releaseFee(15000, 1), 2); // 1.5
});

test("releaseFee rounds non-ties to the nearest whole unit", () => {
  assert.equal(releaseFee(14, 1000), 1); // 1.4
  assert.equal(releaseFee(16, 1000), 2); // 1.6
  assert.equal(releaseFee(4999, 1), 0); // 0.4999
  assert.equal(releaseFee(5001, 1), 1); // 0.5001
  assert.equal(releaseFee(33333, 1500), 5000); // 4999.95
  assert.equal(releaseFee(12345, 333), 411); // 411.0885
  assert.equal(releaseFee(99, 9999), 99); // 98.9901
});

test("releaseFee is exact when the rate divides evenly", () => {
  assert.equal(releaseFee(20000, 1000), 2000);
  assert.equal(releaseFee(40000, 250), 1000);
  assert.equal(releaseFee(77, 10000), 77);
  assert.equal(releaseFee(123456, 0), 0);
});

test("releaseFee at the spec's largest case is exact", () => {
  assert.equal(releaseFee(MAX, 9999), 9006298534815517);
  assert.equal(releaseFee(MAX, 9999), expectedFee(MAX, 9999));
});

test("releaseFee on large amounts has no floating-point error", () => {
  const cases: Array<[number, number]> = [
    [MAX, 5000],
    [MAX - 2, 5000],
    [MAX, 10000],
    [MAX, 1],
    [MAX, 3333],
    [MAX, 7777],
    [9007199254740980, 250],
    [9007199254740940, 250],
    [123456789012345, 9999],
    [4503599627370497, 9997],
    [MAX - 1000, 4321],
  ];
  for (const [amount, bps] of cases) {
    assert.equal(releaseFee(amount, bps), expectedFee(amount, bps), `${amount} at ${bps}`);
  }
  assert.equal(releaseFee(MAX, 5000), 4503599627370496);
  assert.equal(releaseFee(MAX - 2, 5000), 4503599627370494);
  assert.equal(releaseFee(MAX, 10000), MAX);
  assert.equal(releaseFee(9007199254740980, 250), 225179981368524);
  assert.equal(releaseFee(9007199254740940, 250), 225179981368524);
});

test("releaseFee at a zero rate is zero at any size", () => {
  assert.equal(releaseFee(1, 0), 0);
  assert.equal(releaseFee(MAX, 0), 0);
});

test("a release entry carries the half-to-even fee and the net amount", () => {
  const ledger = new Ledger({ currency: "GBP", feeRateBps: 250 });
  ledger.fund({ amount: 10000, key: "f" });
  const a = ledger.release({ amount: 500, contributor: "x", key: "r1" });
  assert.equal(a.fee, 12);
  assert.equal(a.net, 488);
  const b = ledger.release({ amount: 700, contributor: "x", key: "r2" });
  assert.equal(b.fee, 18);
  assert.equal(b.net, 682);
  assert.equal(ledger.balances().fees, 30);
  assert.equal(ledger.paidTo("x"), 1170);
});

test("a release of the largest amount takes an exact fee", () => {
  const ledger = new Ledger({ currency: "JPY", feeRateBps: 9999 });
  ledger.fund({ amount: MAX, key: "f" });
  const entry = ledger.release({ amount: MAX, contributor: "big", key: "r" });
  assert.equal(entry.fee, 9006298534815517);
  assert.equal(entry.net, MAX - 9006298534815517);
  assert.equal(ledger.paidTo("big"), 900719925474);
  assert.equal(ledger.balances().fees, 9006298534815517);
  assert.equal(ledger.balances().released, MAX);
});

test("a release at a large tie rounds to even in the entry", () => {
  const ledger = new Ledger({ currency: "CHF", feeRateBps: 5000 });
  ledger.fund({ amount: MAX, key: "f" });
  const entry = ledger.release({ amount: MAX - 2, contributor: "c", key: "r" });
  assert.equal(entry.fee, 4503599627370494);
  assert.equal(entry.net, MAX - 2 - 4503599627370494);
});

test("a fee rate of 10000 takes the whole release as fee", () => {
  const ledger = new Ledger({ currency: "EUR", feeRateBps: 10000 });
  ledger.fund({ amount: 900, key: "f" });
  const entry = ledger.release({ amount: 321, contributor: "z", key: "r" });
  assert.equal(entry.fee, 321);
  assert.equal(entry.net, 0);
  assert.equal(ledger.paidTo("z"), 0);
  assert.equal(ledger.balances().fees, 321);
});

test("a fee rate of 0 pays the whole release to the contributor", () => {
  const ledger = new Ledger({ currency: "EUR", feeRateBps: 0 });
  ledger.fund({ amount: 900, key: "f" });
  const entry = ledger.release({ amount: 321, contributor: "z", key: "r" });
  assert.equal(entry.fee, 0);
  assert.equal(entry.net, 321);
  assert.equal(ledger.paidTo("z"), 321);
  assert.equal(ledger.balances().fees, 0);
});
