import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger } from "../../src/index.js";

function assertBalanced(ledger: Ledger): void {
  const { funded, held, released, refunded } = ledger.balances();
  assert.equal(funded, held + released + refunded);
}

// Entries are listed in order with sequence numbers

test("entries are listed in order with kind, amount, key, sequence and release details", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  ledger.fund({ amount: 50000, key: "a" });
  assertBalanced(ledger);
  ledger.release({ amount: 20000, contributor: "c1", key: "b" });
  assertBalanced(ledger);
  ledger.refund({ amount: 10000, key: "c" });
  assertBalanced(ledger);
  ledger.fund({ amount: 5000, key: "d" });
  assertBalanced(ledger);

  const entries = ledger.entries();
  assert.equal(entries.length, 4);

  const [fund, release, refund, topUp] = entries;
  assert.equal(fund.kind, "fund");
  assert.equal(fund.amount, 50000);
  assert.equal(fund.key, "a");
  assert.equal(fund.sequence, 1);

  assert.equal(release.kind, "release");
  assert.equal(release.amount, 20000);
  assert.equal(release.key, "b");
  assert.equal(release.sequence, 2);
  if (release.kind !== "release") throw new Error("unreachable");
  assert.equal(release.contributor, "c1");
  assert.equal(release.fee, 2000);
  assert.equal(release.net, 18000);

  assert.equal(refund.kind, "refund");
  assert.equal(refund.amount, 10000);
  assert.equal(refund.key, "c");
  assert.equal(refund.sequence, 3);

  assert.equal(topUp.kind, "fund");
  assert.equal(topUp.amount, 5000);
  assert.equal(topUp.key, "d");
  assert.equal(topUp.sequence, 4);

  const balances = ledger.balances();
  assert.equal(balances.funded, 55000);
  assert.equal(balances.held, 25000);
  assert.equal(balances.released, 20000);
  assert.equal(balances.refunded, 10000);
  assert.equal(balances.fees, 2000);
});

test("a new ledger has no entries and zero balances that still balance", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  assert.deepEqual(ledger.entries(), []);
  const balances = ledger.balances();
  assert.equal(balances.funded, 0);
  assert.equal(balances.held, 0);
  assert.equal(balances.released, 0);
  assert.equal(balances.refunded, 0);
  assert.equal(balances.fees, 0);
  assertBalanced(ledger);
});

test("the returned entry matches the listed entry and sequences skip neither retries nor rejections", () => {
  const ledger = new Ledger({ currency: "USD", feeRateBps: 1000 });
  const first = ledger.fund({ amount: 50000, key: "a" });
  ledger.fund({ amount: 50000, key: "a" });
  assert.throws(() => ledger.refund({ amount: 50001, key: "b" }));
  const second = ledger.release({ amount: 20000, contributor: "c1", key: "b" });
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.deepEqual(ledger.entries(), [first, second]);
  assertBalanced(ledger);
});
