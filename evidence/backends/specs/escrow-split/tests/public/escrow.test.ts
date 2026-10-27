import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createEscrowHandler,
  splitBounty,
  type EscrowEvent,
  type EscrowState,
  type EscrowStore,
  type EscrowStatus,
  type Release,
} from "../../src/index.js";

function copy(state: EscrowState | undefined): EscrowState | undefined {
  return state === undefined
    ? undefined
    : { status: state.status, releases: state.releases.map((release) => ({ ...release })) };
}

function memoryStore(yieldCalls = false) {
  let saved: EscrowState | undefined;
  let nextSetError: Error | undefined;
  const store: EscrowStore = {
    async get() {
      if (yieldCalls) await Promise.resolve();
      return copy(saved);
    },
    async set(state: EscrowState) {
      if (yieldCalls) await Promise.resolve();
      if (nextSetError !== undefined) {
        const error = nextSetError;
        nextSetError = undefined;
        throw error;
      }
      saved = copy(state);
    },
  };
  return {
    store,
    snapshot: () => copy(saved),
    failNextSet(error: Error) {
      nextSetError = error;
    },
  };
}

function expectState(state: EscrowState, status: EscrowStatus, releases: Release[]) {
  assert.equal(state.status, status);
  assert.deepEqual(state.releases, releases);
}

function hiddenTestsNotPassed(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  assert.match(error.message, /hidden[\s-]*tests?/i);
  assert.match(error.message, /not|haven['’]?t|hasn['’]?t|before|yet|required|must|first/i);
  return true;
}

test("[happy-1] passing hidden tests releases the default 7500 share", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, memory.store);
  const state = await handler.handle({ id: "hidden-1", kind: "hidden-tests-passed" });
  expectState(state, "partially released", [{ kind: "hidden-tests", amount: 7500 }]);
  assert.deepEqual(memory.snapshot(), state);
});

test("[happy-1] the smallest positive basis-point share releases one unit", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler(
    { bounty: 10000, hiddenTestShareBps: 1 }, memory.store,
  );
  const state = await handler.handle({ id: "hidden-1", kind: "hidden-tests-passed" });
  expectState(state, "partially released", [{ kind: "hidden-tests", amount: 1 }]);
  assert.deepEqual(memory.snapshot(), state);
});

test("[boundary-1] 999 splits into 749 and 250 and both amounts are released", async () => {
  assert.deepEqual(splitBounty(999, 7500), { hiddenTests: 749, uat: 250 });
  const memory = memoryStore();
  const handler = createEscrowHandler(
    { bounty: 999, hiddenTestShareBps: 7500 }, memory.store,
  );
  const partial = await handler.handle({ id: "hidden-1", kind: "hidden-tests-passed" });
  expectState(partial, "partially released", [{ kind: "hidden-tests", amount: 749 }]);
  const full = await handler.handle({ id: "uat-1", kind: "uat-approved" });
  expectState(full, "fully released", [
    { kind: "hidden-tests", amount: 749 }, { kind: "uat", amount: 250 },
  ]);
  assert.deepEqual(memory.snapshot(), full);
});

test("[boundary-1] splits stay exact at and near the maximum safe bounty", () => {
  const bounties = [
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER - 1,
    Number.MAX_SAFE_INTEGER - 2,
    9007199254739999,
  ];
  for (const bounty of bounties) {
    for (const share of [1, 3333, 7500, 9999]) {
      const hidden = BigInt(bounty) * BigInt(share) / 10000n;
      const split = splitBounty(bounty, share);
      assert.deepEqual(split, {
        hiddenTests: Number(hidden), uat: Number(BigInt(bounty) - hidden),
      }, `bounty=${bounty}, share=${share}`);
      assert.equal(split.hiddenTests + split.uat, bounty);
    }
  }
});

test("[boundary-1] zero and full shares preserve the entire bounty exactly", () => {
  for (const bounty of [0, 1, 999, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual(splitBounty(bounty, 0), { hiddenTests: 0, uat: bounty });
    assert.deepEqual(splitBounty(bounty, 10000), { hiddenTests: bounty, uat: 0 });
  }
});

test("[happy-2] UAT releases the remaining 2500 after the default hidden share", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, memory.store);
  await handler.handle({ id: "hidden-1", kind: "hidden-tests-passed" });
  const state = await handler.handle({ id: "uat-1", kind: "uat-approved" });
  expectState(state, "fully released", [
    { kind: "hidden-tests", amount: 7500 }, { kind: "uat", amount: 2500 },
  ]);
  assert.deepEqual(memory.snapshot(), state);
});

test("[happy-2] UAT can release a remaining balance of just one unit", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 4 }, memory.store);
  await handler.handle({ id: "hidden-1", kind: "hidden-tests-passed" });
  const state = await handler.handle({ id: "uat-1", kind: "uat-approved" });
  expectState(state, "fully released", [
    { kind: "hidden-tests", amount: 3 }, { kind: "uat", amount: 1 },
  ]);
  assert.deepEqual(memory.snapshot(), state);
});

test("[unhappy-1] a failed hidden-test run leaves escrow locked with no releases", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, memory.store);
  const state = await handler.handle({ id: "failed-1", kind: "hidden-tests-failed" });
  expectState(state, "locked", []);
  assert.deepEqual(memory.snapshot()?.releases ?? [], []);
});

test("[unhappy-1] repeated failed runs keep even a one-unit bounty locked", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 1 }, memory.store);
  for (const id of ["failed-1", "failed-1", "failed-2"]) {
    const state = await handler.handle({ id, kind: "hidden-tests-failed" });
    expectState(state, "locked", []);
    assert.deepEqual(memory.snapshot()?.releases ?? [], []);
  }
});

test("[unhappy-2] UAT before any hidden-test pass rejects without a release", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, memory.store);
  await assert.rejects(
    async () => handler.handle({ id: "uat-1", kind: "uat-approved" }),
    hiddenTestsNotPassed,
  );
  assert.deepEqual(memory.snapshot()?.releases ?? [], []);
});

test("[unhappy-2] UAT is still refused after a failed hidden-test run", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, memory.store);
  await handler.handle({ id: "failed-1", kind: "hidden-tests-failed" });
  const event: EscrowEvent = { id: "uat-1", kind: "uat-approved" };
  await assert.rejects(async () => handler.handle(event), hiddenTestsNotPassed);
  assert.deepEqual(memory.snapshot()?.releases ?? [], []);
});

test("[boundary-2] a pro bono task records no releases across both gates and redelivery", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 0 }, memory.store);
  const events: EscrowEvent[] = [
    { id: "hidden-1", kind: "hidden-tests-passed" },
    { id: "uat-1", kind: "uat-approved" },
    { id: "uat-1", kind: "uat-approved" },
    { id: "failed-1", kind: "hidden-tests-failed" },
  ];
  for (const event of events) {
    expectState(await handler.handle(event), "pro bono", []);
    assert.deepEqual(memory.snapshot()?.releases ?? [], []);
  }
});

test("[boundary-2] pro bono status also holds at both share endpoints", async () => {
  for (const share of [0, 10000]) {
    const memory = memoryStore();
    const handler = createEscrowHandler(
      { bounty: 0, hiddenTestShareBps: share }, memory.store,
    );
    for (const event of [
      { id: "failed-1", kind: "hidden-tests-failed" },
      { id: "hidden-1", kind: "hidden-tests-passed" },
      { id: "uat-1", kind: "uat-approved" },
    ] satisfies EscrowEvent[]) {
      expectState(await handler.handle(event), "pro bono", []);
      assert.deepEqual(memory.snapshot()?.releases ?? [], []);
    }
  }
});

test("[concurrency-1] redelivering the same hidden-test event records no extra release", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, memory.store);
  const event: EscrowEvent = { id: "e1", kind: "hidden-tests-passed" };
  await handler.handle(event);
  const state = await handler.handle({ ...event });
  expectState(state, "partially released", [{ kind: "hidden-tests", amount: 7500 }]);
  assert.deepEqual(memory.snapshot(), state);
});

test("[concurrency-1] a different hidden-test event cannot release the share again", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, memory.store);
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  const state = await handler.handle({ id: "e2", kind: "hidden-tests-passed" });
  expectState(state, "partially released", [{ kind: "hidden-tests", amount: 7500 }]);
  assert.deepEqual(memory.snapshot(), state);
});

test("[concurrency-1] repeated UAT and late hidden-test events leave a fully released task unchanged", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, memory.store);
  await handler.handle({ id: "hidden-1", kind: "hidden-tests-passed" });
  await handler.handle({ id: "uat-1", kind: "uat-approved" });
  for (const event of [
    { id: "uat-1", kind: "uat-approved" },
    { id: "uat-2", kind: "uat-approved" },
    { id: "hidden-2", kind: "hidden-tests-passed" },
  ] satisfies EscrowEvent[]) {
    const state = await handler.handle(event);
    expectState(state, "fully released", [
      { kind: "hidden-tests", amount: 7500 }, { kind: "uat", amount: 2500 },
    ]);
    assert.deepEqual(memory.snapshot(), state);
  }
});

async function concurrentDelivery(kind: "hidden-tests-passed" | "uat-approved", sameId: boolean) {
  const memory = memoryStore(true);
  const handler = createEscrowHandler({ bounty: 10000 }, memory.store);
  if (kind === "uat-approved") {
    await handler.handle({ id: "hidden-setup", kind: "hidden-tests-passed" });
  }
  const states = await Promise.all([
    handler.handle({ id: "delivery-1", kind }),
    handler.handle({ id: sameId ? "delivery-1" : "delivery-2", kind }),
  ]);
  const releases: Release[] = [{ kind: "hidden-tests", amount: 7500 }];
  if (kind === "uat-approved") releases.push({ kind: "uat", amount: 2500 });
  const status = kind === "uat-approved" ? "fully released" : "partially released";
  for (const state of states) expectState(state, status, releases);
  const saved = memory.snapshot();
  assert.equal(saved?.status, status);
  assert.deepEqual(saved?.releases, releases);
}

test("[concurrency-2] simultaneous hidden-test deliveries with the same id release once", async () => {
  await concurrentDelivery("hidden-tests-passed", true);
});

test("[concurrency-2] simultaneous hidden-test deliveries with different ids release once", async () => {
  await concurrentDelivery("hidden-tests-passed", false);
});

test("[concurrency-2] simultaneous UAT deliveries with the same id release the rest once", async () => {
  await concurrentDelivery("uat-approved", true);
});

test("[concurrency-2] simultaneous UAT deliveries with different ids release the rest once", async () => {
  await concurrentDelivery("uat-approved", false);
});

test("[recovery-1] a failed hidden-share save propagates its error and the same event succeeds on retry", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, memory.store);
  const error = new Error("hidden-share save failed");
  const event: EscrowEvent = { id: "hidden-1", kind: "hidden-tests-passed" };
  memory.failNextSet(error);
  await assert.rejects(async () => handler.handle(event), (actual: unknown) => actual === error);
  assert.deepEqual(memory.snapshot()?.releases ?? [], []);
  const state = await handler.handle(event);
  expectState(state, "partially released", [{ kind: "hidden-tests", amount: 7500 }]);
  assert.deepEqual(memory.snapshot(), state);
});

test("[recovery-1] a failed UAT save preserves the hidden release and retries the remainder once", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, memory.store);
  await handler.handle({ id: "hidden-1", kind: "hidden-tests-passed" });
  const before = memory.snapshot();
  const error = new Error("UAT save failed");
  const event: EscrowEvent = { id: "uat-1", kind: "uat-approved" };
  memory.failNextSet(error);
  await assert.rejects(async () => handler.handle(event), (actual: unknown) => actual === error);
  assert.deepEqual(memory.snapshot(), before);
  const state = await handler.handle(event);
  expectState(state, "fully released", [
    { kind: "hidden-tests", amount: 7500 }, { kind: "uat", amount: 2500 },
  ]);
  assert.deepEqual(memory.snapshot(), state);
});
