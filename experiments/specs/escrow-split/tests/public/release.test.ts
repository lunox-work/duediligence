import { test } from "node:test";
import assert from "node:assert/strict";
import { createEscrowHandler } from "../../src/index.js";
import type { EscrowState, EscrowStore } from "../../src/index.js";

function memoryStore(): EscrowStore & { state: EscrowState | undefined; writes: EscrowState[] } {
  const store = {
    state: undefined as EscrowState | undefined,
    writes: [] as EscrowState[],
    async get(): Promise<EscrowState | undefined> {
      return store.state === undefined ? undefined : structuredClone(store.state);
    },
    async set(state: EscrowState): Promise<void> {
      store.state = structuredClone(state);
      store.writes.push(structuredClone(state));
    },
  };
  return store;
}

function recordedReleases(store: { state: EscrowState | undefined }) {
  return store.state?.releases ?? [];
}

function saysHiddenTestsNotPassed(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  assert.match(err.message, /hidden[ -]tests? ha(ve|s) not passed/i);
  return true;
}

test("[happy-1] passing hidden tests releases 7500 of 10000 at the default share", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, store);
  const state = await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  const expected = { status: "partially released", releases: [{ kind: "hidden-tests", amount: 7500 }] };
  assert.deepEqual(state, expected);
  assert.deepEqual(store.state, expected);
});

test("[happy-1] a share of 1 bps releases 1 of 10000", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000, hiddenTestShareBps: 1 }, store);
  const state = await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  const expected = { status: "partially released", releases: [{ kind: "hidden-tests", amount: 1 }] };
  assert.deepEqual(state, expected);
  assert.deepEqual(store.state, expected);
});

test("[happy-2] UAT approval releases the remaining 2500 and the task is fully released", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, store);
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  const state = await handler.handle({ id: "e2", kind: "uat-approved" });
  const expected = {
    status: "fully released",
    releases: [
      { kind: "hidden-tests", amount: 7500 },
      { kind: "uat", amount: 2500 },
    ],
  };
  assert.deepEqual(state, expected);
  assert.deepEqual(store.state, expected);
});

test("[happy-2] a new handler over the same store releases the remaining odd balance", async () => {
  const store = memoryStore();
  const task = { bounty: 1001, hiddenTestShareBps: 5000 };
  await createEscrowHandler(task, store).handle({ id: "e1", kind: "hidden-tests-passed" });
  const state = await createEscrowHandler(task, store).handle({ id: "e2", kind: "uat-approved" });
  const expected = {
    status: "fully released",
    releases: [
      { kind: "hidden-tests", amount: 500 },
      { kind: "uat", amount: 501 },
    ],
  };
  assert.deepEqual(state, expected);
  assert.deepEqual(store.state, expected);
});

test("[unhappy-1] a failed run records nothing and the task stays locked", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, store);
  const state = await handler.handle({ id: "e1", kind: "hidden-tests-failed" });
  assert.deepEqual(state, { status: "locked", releases: [] });
  assert.deepEqual(recordedReleases(store), []);
  if (store.state !== undefined) assert.equal(store.state.status, "locked");
});

test("[unhappy-1] a failed run after the share was released records nothing more", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, store);
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  const state = await handler.handle({ id: "e2", kind: "hidden-tests-failed" });
  const expected = [{ kind: "hidden-tests", amount: 7500 }];
  assert.deepEqual(state.releases, expected);
  assert.deepEqual(recordedReleases(store), expected);
});

test("[unhappy-2] UAT approval on a locked task is refused and records nothing", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, store);
  await assert.rejects(handler.handle({ id: "e1", kind: "uat-approved" }), saysHiddenTestsNotPassed);
  assert.deepEqual(recordedReleases(store), []);
});

test("[unhappy-2] UAT approval after a failed hidden-test run is still refused", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, store);
  await handler.handle({ id: "e1", kind: "hidden-tests-failed" });
  await assert.rejects(handler.handle({ id: "e2", kind: "uat-approved" }), saysHiddenTestsNotPassed);
  assert.deepEqual(recordedReleases(store), []);
});

test("[boundary-2] passing hidden tests on a bounty of 0 records nothing and the task is pro bono", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 0 }, store);
  const state = await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  assert.deepEqual(state, { status: "pro bono", releases: [] });
  assert.deepEqual(recordedReleases(store), []);
  if (store.state !== undefined) assert.equal(store.state.status, "pro bono");
});

test("[boundary-2] a bounty of 0 with a full share never records a release through UAT", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 0, hiddenTestShareBps: 10000 }, store);
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  await handler.handle({ id: "e2", kind: "uat-approved" }).catch(() => undefined);
  for (const written of store.writes) assert.deepEqual(written.releases, []);
  assert.deepEqual(recordedReleases(store), []);
  if (store.state !== undefined) assert.equal(store.state.status, "pro bono");
});
