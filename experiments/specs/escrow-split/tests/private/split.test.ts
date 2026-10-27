import { test } from "node:test";
import assert from "node:assert/strict";
import { createEscrowHandler, splitBounty } from "../../src/index.js";
import type { EscrowState, EscrowStore } from "../../src/index.js";

function memoryStore(): EscrowStore & { state: EscrowState | undefined } {
  const store = {
    state: undefined as EscrowState | undefined,
    async get(): Promise<EscrowState | undefined> {
      return store.state === undefined ? undefined : structuredClone(store.state);
    },
    async set(state: EscrowState): Promise<void> {
      store.state = structuredClone(state);
    },
  };
  return store;
}

/** The split as the spec defines it: the share rounded down, the rest to UAT. */
function expectedSplit(bounty: number, bps: number): { hiddenTests: number; uat: number } {
  const hiddenTests = (BigInt(bounty) * BigInt(bps)) / 10000n;
  return { hiddenTests: Number(hiddenTests), uat: Number(BigInt(bounty) - hiddenTests) };
}

// Extends public "[boundary-1] a bounty of 999 at 7500 bps splits into 749 and 250":
// fractions of one half and above still round down, not to the nearest unit.
test("[boundary-1] the share rounds down even when the fraction is one half or more", () => {
  assert.deepEqual(splitBounty(3, 5000), { hiddenTests: 1, uat: 2 });
  assert.deepEqual(splitBounty(1001, 5000), { hiddenTests: 500, uat: 501 });
  assert.deepEqual(splitBounty(1, 9999), { hiddenTests: 0, uat: 1 });
  assert.deepEqual(splitBounty(10001, 9999), { hiddenTests: 9999, uat: 2 });
  assert.deepEqual(splitBounty(7, 3333), { hiddenTests: 2, uat: 5 });
  assert.deepEqual(splitBounty(9999, 7500), { hiddenTests: 7499, uat: 2500 });
});

// Extends public "[boundary-1] a bounty of 999 at 7500 bps splits into 749 and 250":
// shares whose fraction of 10000 is inexact in floating point.
test("[boundary-1] the split is exact where the share as a fraction is inexact in floating point", () => {
  assert.deepEqual(splitBounty(100, 2900), { hiddenTests: 29, uat: 71 });
  assert.deepEqual(splitBounty(100, 5700), { hiddenTests: 57, uat: 43 });
  assert.deepEqual(splitBounty(100, 5800), { hiddenTests: 58, uat: 42 });
});

// Extends public "[boundary-1] a bounty of 999 at 7500 bps splits into 749 and 250":
// every share for one bounty, and many small bounties.
test("[boundary-1] the hidden-test release is the share rounded down and the two add up, across shares", () => {
  for (let bps = 0; bps <= 10000; bps++) {
    assert.deepEqual(splitBounty(997, bps), expectedSplit(997, bps), `bps ${bps}`);
  }
  for (let bounty = 0; bounty <= 300; bounty++) {
    for (const bps of [0, 1, 7, 333, 2500, 2900, 3333, 5000, 5700, 6667, 7500, 9999, 10000]) {
      const split = splitBounty(bounty, bps);
      assert.deepEqual(split, expectedSplit(bounty, bps), `bounty ${bounty}, bps ${bps}`);
      assert.equal(split.hiddenTests + split.uat, bounty);
    }
  }
});

// Extends public "[boundary-1] the split is exact for a bounty of Number.MAX_SAFE_INTEGER".
test("[boundary-1] the split is exact for many large bounties up to Number.MAX_SAFE_INTEGER", () => {
  const bounties = [
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER - 1,
    Number.MAX_SAFE_INTEGER - 9999,
    2 ** 52 + 1,
    2 ** 52 - 1,
    8999999999999999,
    1000000000000007,
    123456789012345,
    4398046511103,
  ];
  for (const bounty of bounties) {
    for (const bps of [1, 2, 1234, 2500, 2900, 5000, 6667, 7500, 8888, 9998, 9999]) {
      const split = splitBounty(bounty, bps);
      assert.deepEqual(split, expectedSplit(bounty, bps), `bounty ${bounty}, bps ${bps}`);
    }
  }
  assert.deepEqual(splitBounty(Number.MAX_SAFE_INTEGER, 1), {
    hiddenTests: 900719925474,
    uat: 9006298534815517,
  });
  assert.deepEqual(splitBounty(Number.MAX_SAFE_INTEGER, 5000), {
    hiddenTests: 4503599627370495,
    uat: 4503599627370496,
  });
});

// Extends public "[boundary-1] the shares of 0 and 10000 bps give everything to one side".
test("[boundary-1] the shares of 0 and 10000 bps give everything to one side for large and odd bounties", () => {
  for (const bounty of [1, 999, 1001, 2 ** 52 + 1, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual(splitBounty(bounty, 0), { hiddenTests: 0, uat: bounty }, `bounty ${bounty}`);
    assert.deepEqual(splitBounty(bounty, 10000), { hiddenTests: bounty, uat: 0 }, `bounty ${bounty}`);
  }
});

test("[boundary-1] a bounty of 0 splits into 0 and 0 at any share", () => {
  for (const bps of [0, 1, 5000, 7500, 10000]) {
    assert.deepEqual(splitBounty(0, bps), { hiddenTests: 0, uat: 0 }, `bps ${bps}`);
  }
});

// Extends public "[boundary-1] the handler releases 749 then 250 for a bounty of 999".
test("[boundary-1] the handler releases exact amounts for a bounty of Number.MAX_SAFE_INTEGER at the default share", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: Number.MAX_SAFE_INTEGER }, store);
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  const after = await handler.handle({ id: "e2", kind: "uat-approved" });
  const expected = [
    { kind: "hidden-tests", amount: 6755399441055743 },
    { kind: "uat", amount: 2251799813685248 },
  ];
  assert.deepEqual(after.releases, expected);
  assert.deepEqual(store.state?.releases, expected);
});

// Extends public "[boundary-1] the handler releases 749 then 250 for a bounty of 999".
test("[boundary-1] the handler releases exact amounts for a large bounty at a share of 3333", async () => {
  const store = memoryStore();
  const bounty = Number.MAX_SAFE_INTEGER - 2;
  const handler = createEscrowHandler({ bounty, hiddenTestShareBps: 3333 }, store);
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  const after = await handler.handle({ id: "e2", kind: "uat-approved" });
  const split = expectedSplit(bounty, 3333);
  const expected = [
    { kind: "hidden-tests", amount: split.hiddenTests },
    { kind: "uat", amount: split.uat },
  ];
  assert.deepEqual(after.releases, expected);
  assert.deepEqual(store.state?.releases, expected);
});

// Extends public "[boundary-1] the handler releases 749 then 250 for a bounty of 999".
test("[boundary-1] the handler rounds the share down, not to the nearest unit, and UAT takes the rest", async () => {
  for (const [bounty, bps, hidden, uat] of [
    [3, 5000, 1, 2],
    [100, 2900, 29, 71],
    [10001, 9999, 9999, 2],
  ]) {
    const store = memoryStore();
    const handler = createEscrowHandler({ bounty, hiddenTestShareBps: bps }, store);
    await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
    const after = await handler.handle({ id: "e2", kind: "uat-approved" });
    const expected = [
      { kind: "hidden-tests", amount: hidden },
      { kind: "uat", amount: uat },
    ];
    assert.deepEqual(after.releases, expected, `bounty ${bounty}, bps ${bps}`);
    assert.deepEqual(store.state?.releases, expected, `bounty ${bounty}, bps ${bps}`);
  }
});

// Extends public "[boundary-1] the shares of 0 and 10000 bps give everything to one side":
// an explicit share of 0 is not the default share.
test("[boundary-1] the handler with an explicit share of 0 releases nothing for the hidden tests", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000, hiddenTestShareBps: 0 }, store);
  const state = await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  const released = (s: EscrowState | undefined) =>
    (s?.releases ?? []).filter((r) => r.kind === "hidden-tests").reduce((sum, r) => sum + r.amount, 0);
  assert.equal(released(state), 0);
  assert.equal(released(store.state), 0);
});

// Extends public "[boundary-1] the shares of 0 and 10000 bps give everything to one side".
test("[boundary-1] the handler with a share of 10000 releases the whole bounty for the hidden tests", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 999, hiddenTestShareBps: 10000 }, store);
  const state = await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  const expected = [{ kind: "hidden-tests", amount: 999 }];
  assert.deepEqual(state.releases, expected);
  assert.deepEqual(store.state?.releases, expected);
});
