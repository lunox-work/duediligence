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

test("[boundary-1] a bounty of 999 at 7500 bps splits into 749 and 250", () => {
  assert.deepEqual(splitBounty(999, 7500), { hiddenTests: 749, uat: 250 });
});

test("[boundary-1] the split is exact for a bounty of Number.MAX_SAFE_INTEGER", () => {
  assert.deepEqual(splitBounty(Number.MAX_SAFE_INTEGER, 7500), {
    hiddenTests: 6755399441055743,
    uat: 2251799813685248,
  });
  assert.deepEqual(splitBounty(Number.MAX_SAFE_INTEGER, 3333), {
    hiddenTests: 3002099511605172,
    uat: 6005099743135819,
  });
  assert.deepEqual(splitBounty(Number.MAX_SAFE_INTEGER, 9999), {
    hiddenTests: 9006298534815516,
    uat: 900719925475,
  });
});

test("[boundary-1] the shares of 0 and 10000 bps give everything to one side", () => {
  assert.deepEqual(splitBounty(10000, 0), { hiddenTests: 0, uat: 10000 });
  assert.deepEqual(splitBounty(10000, 10000), { hiddenTests: 10000, uat: 0 });
});

test("[boundary-1] the handler releases 749 then 250 for a bounty of 999", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 999, hiddenTestShareBps: 7500 }, store);
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  const after = await handler.handle({ id: "e2", kind: "uat-approved" });
  const expected = [
    { kind: "hidden-tests", amount: 749 },
    { kind: "uat", amount: 250 },
  ];
  assert.deepEqual(after.releases, expected);
  assert.deepEqual(store.state?.releases, expected);
});
