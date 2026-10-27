import { test } from "node:test";
import assert from "node:assert/strict";
import { createEscrowHandler } from "../../src/index.js";
import type { EscrowState, EscrowStore } from "../../src/index.js";

interface TestStore extends EscrowStore {
  state: EscrowState | undefined;
  /** Every state saved, in order. */
  writes: EscrowState[];
  /** The errors the next `set` calls reject with, in order; each is used once. */
  failSets: unknown[];
  /** The errors the next `get` calls reject with, in order; each is used once. */
  failGets: unknown[];
}

function yieldTurns(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(() => setImmediate(resolve)));
}

/**
 * With `slow`, every call resolves only after other pending work has run.
 * With `shared`, `get` hands out the saved object itself rather than a copy.
 */
function memoryStore(options: { slow?: boolean; shared?: boolean } = {}): TestStore {
  const store: TestStore = {
    state: undefined,
    writes: [],
    failSets: [],
    failGets: [],
    async get(): Promise<EscrowState | undefined> {
      if (options.slow) await yieldTurns();
      if (store.failGets.length > 0) throw store.failGets.shift();
      if (store.state === undefined) return undefined;
      return options.shared ? store.state : structuredClone(store.state);
    },
    async set(state: EscrowState): Promise<void> {
      if (options.slow) await yieldTurns();
      if (store.failSets.length > 0) throw store.failSets.shift();
      store.state = options.shared ? state : structuredClone(state);
      store.writes.push(structuredClone(state));
    },
  };
  return store;
}

function recordedReleases(store: TestStore) {
  return store.state?.releases ?? [];
}

function savesReleasing(store: TestStore, kind: string): number {
  return store.writes.filter((state) => state.releases.some((release) => release.kind === kind)).length;
}

function saysHiddenTestsNotPassed(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  assert.match(err.message, /hidden[ -]?tests?\b.*\bnot\b.*\bpassed/i);
  return true;
}

class StoreError extends Error {}

const HIDDEN_999 = { kind: "hidden-tests", amount: 749 };
const UAT_999 = { kind: "uat", amount: 250 };

// Extends public "[recovery-1] a rejected save rejects with the store's error, records nothing, and the retry succeeds":
// another bounty, a slow store, and a store error of its own class.
test("[recovery-1] a rejected save of the share over a slow store rejects with that error, and the retry releases it once", async () => {
  const store = memoryStore({ slow: true });
  const handler = createEscrowHandler({ bounty: 999 }, store);
  const storeError = new StoreError("disk full");
  store.failSets.push(storeError);
  await assert.rejects(
    handler.handle({ id: "e1", kind: "hidden-tests-passed" }),
    (err: unknown) => err === storeError,
  );
  assert.equal(store.state, undefined);
  assert.deepEqual(store.writes, []);
  const state = await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  assert.equal(state.status, "partially released");
  assert.deepEqual(state.releases, [HIDDEN_999]);
  assert.deepEqual(recordedReleases(store), [HIDDEN_999]);
  assert.equal(store.state?.status, "partially released");
  assert.equal(savesReleasing(store, "hidden-tests"), 1);
});

// Extends public "[recovery-1] a rejected save rejects with the store's error, records nothing, and the retry succeeds":
// the store rejects twice in a row, the second time with a value that is not an Error.
test("[recovery-1] two rejected saves in a row each reject with the store's error, and the third attempt succeeds", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 999 }, store);
  const firstError = new Error("timeout");
  const secondError = { code: "ECONNRESET" };
  store.failSets.push(firstError, secondError);
  await assert.rejects(
    handler.handle({ id: "e1", kind: "hidden-tests-passed" }),
    (err: unknown) => err === firstError,
  );
  await assert.rejects(
    handler.handle({ id: "e1", kind: "hidden-tests-passed" }),
    (err: unknown) => err === secondError,
  );
  assert.deepEqual(recordedReleases(store), []);
  const state = await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  assert.deepEqual(state.releases, [HIDDEN_999]);
  assert.deepEqual(recordedReleases(store), [HIDDEN_999]);
  assert.equal(savesReleasing(store, "hidden-tests"), 1);
});

// Extends public "[recovery-1] a rejected save of the UAT release leaves the share alone and the retry completes it":
// the retry arrives at a new handler over the same store.
test("[recovery-1] a rejected save of the UAT release can be retried through a new handler", async () => {
  const store = memoryStore({ slow: true });
  const task = { bounty: 999 };
  const handler = createEscrowHandler(task, store);
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  const storeError = new StoreError("store unavailable");
  store.failSets.push(storeError);
  await assert.rejects(
    handler.handle({ id: "e2", kind: "uat-approved" }),
    (err: unknown) => err === storeError,
  );
  assert.deepEqual(recordedReleases(store), [HIDDEN_999]);
  assert.equal(store.state?.status, "partially released");
  const state = await createEscrowHandler(task, store).handle({ id: "e2", kind: "uat-approved" });
  assert.equal(state.status, "fully released");
  assert.deepEqual(state.releases, [HIDDEN_999, UAT_999]);
  assert.deepEqual(recordedReleases(store), [HIDDEN_999, UAT_999]);
  assert.equal(savesReleasing(store, "uat"), 1);
});

// Extends public "[recovery-1] a rejected save of the UAT release leaves the share alone and the retry completes it":
// the store hands out the object it holds, so changing that object would record
// a release without a save.
test("[recovery-1] a rejected save of the UAT release leaves the stored state untouched even when the store shares its object", async () => {
  const store = memoryStore({ shared: true });
  const handler = createEscrowHandler({ bounty: 999 }, store);
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  const storeError = new StoreError("store unavailable");
  store.failSets.push(storeError);
  await assert.rejects(
    handler.handle({ id: "e2", kind: "uat-approved" }),
    (err: unknown) => err === storeError,
  );
  assert.deepEqual(store.state?.releases, [HIDDEN_999]);
  assert.equal(store.state?.status, "partially released");
  const state = await handler.handle({ id: "e2", kind: "uat-approved" });
  assert.equal(state.status, "fully released");
  assert.deepEqual(state.releases, [HIDDEN_999, UAT_999]);
  assert.deepEqual(store.state?.releases, [HIDDEN_999, UAT_999]);
});

// Extends public "[recovery-1] a rejected save rejects with the store's error, records nothing, and the retry succeeds":
// the store rejects a read rather than a save.
test("[recovery-1] a rejected read rejects with the store's error, records nothing, and the retry succeeds", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 999 }, store);
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  const storeError = new StoreError("read timeout");
  store.failGets.push(storeError);
  await assert.rejects(
    handler.handle({ id: "e2", kind: "uat-approved" }),
    (err: unknown) => err === storeError,
  );
  assert.deepEqual(recordedReleases(store), [HIDDEN_999]);
  const state = await handler.handle({ id: "e2", kind: "uat-approved" });
  assert.equal(state.status, "fully released");
  assert.deepEqual(state.releases, [HIDDEN_999, UAT_999]);
  assert.deepEqual(recordedReleases(store), [HIDDEN_999, UAT_999]);
});

// Extends public "[recovery-1] a rejected save rejects with the store's error, records nothing, and the retry succeeds":
// a share whose save was rejected was not released, so UAT approval is refused.
test("[unhappy-2] UAT approval after the share's save was rejected is refused", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 999 }, store);
  const storeError = new StoreError("store unavailable");
  store.failSets.push(storeError);
  await assert.rejects(
    handler.handle({ id: "e1", kind: "hidden-tests-passed" }),
    (err: unknown) => err === storeError,
  );
  await assert.rejects(handler.handle({ id: "e2", kind: "uat-approved" }), saysHiddenTestsNotPassed);
  assert.deepEqual(recordedReleases(store), []);
  for (const written of store.writes) assert.deepEqual(written.releases, []);
});

// Extends public "[recovery-1] a rejected save rejects with the store's error, records nothing, and the retry succeeds":
// the save is rejected while a second delivery of the same event is in flight.
test("[recovery-1] a rejected save during a concurrent second delivery never records the share twice", async () => {
  const store = memoryStore({ slow: true });
  const handler = createEscrowHandler({ bounty: 999 }, store);
  const storeError = new StoreError("store unavailable");
  store.failSets.push(storeError);
  await Promise.allSettled([
    handler.handle({ id: "e1", kind: "hidden-tests-passed" }),
    handler.handle({ id: "e1", kind: "hidden-tests-passed" }),
  ]);
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" }).catch(() => undefined);
  assert.deepEqual(recordedReleases(store), [HIDDEN_999]);
  assert.equal(savesReleasing(store, "hidden-tests"), 1);
});
