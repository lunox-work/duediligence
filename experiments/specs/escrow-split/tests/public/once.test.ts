import { test } from "node:test";
import assert from "node:assert/strict";
import { createEscrowHandler } from "../../src/index.js";
import type { EscrowState, EscrowStore } from "../../src/index.js";

interface TestStore extends EscrowStore {
  state: EscrowState | undefined;
  /** Every state saved, in order. */
  writes: EscrowState[];
  /** The error the next `set` rejects with, if any; cleared once used. */
  failNextSet: Error | undefined;
}

function yieldTurns(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(() => setImmediate(resolve)));
}

/** With `slow`, every call resolves only after other pending work has run. */
function memoryStore(slow = false): TestStore {
  const store: TestStore = {
    state: undefined,
    writes: [],
    failNextSet: undefined,
    async get(): Promise<EscrowState | undefined> {
      if (slow) await yieldTurns();
      return store.state === undefined ? undefined : structuredClone(store.state);
    },
    async set(state: EscrowState): Promise<void> {
      if (slow) await yieldTurns();
      const error = store.failNextSet;
      if (error !== undefined) {
        store.failNextSet = undefined;
        throw error;
      }
      store.state = structuredClone(state);
      store.writes.push(structuredClone(state));
    },
  };
  return store;
}

function recordedReleases(store: TestStore) {
  return store.state?.releases ?? [];
}

/** How many saves carried a release of the given kind: each one moves money. */
function savesReleasing(store: TestStore, kind: string): number {
  return store.writes.filter((state) => state.releases.some((release) => release.kind === kind)).length;
}

const HIDDEN = { kind: "hidden-tests", amount: 7500 };
const UAT = { kind: "uat", amount: 2500 };

test("[concurrency-1] handling the same hidden-tests-passed event again records nothing more", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, store);
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" }).catch(() => undefined);
  assert.deepEqual(recordedReleases(store), [HIDDEN]);
  assert.equal(store.state?.status, "partially released");
});

test("[concurrency-1] a different hidden-tests-passed event after the share was released records nothing", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, store);
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  await handler.handle({ id: "e2", kind: "hidden-tests-passed" }).catch(() => undefined);
  assert.deepEqual(recordedReleases(store), [HIDDEN]);
  assert.equal(store.state?.status, "partially released");
});

test("[concurrency-1] repeated events after full release record nothing more", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, store);
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  await handler.handle({ id: "e2", kind: "uat-approved" });
  await handler.handle({ id: "e2", kind: "uat-approved" }).catch(() => undefined);
  await handler.handle({ id: "e3", kind: "uat-approved" }).catch(() => undefined);
  await handler.handle({ id: "e4", kind: "hidden-tests-passed" }).catch(() => undefined);
  assert.deepEqual(recordedReleases(store), [HIDDEN, UAT]);
  assert.equal(store.state?.status, "fully released");
});

test("[concurrency-2] the same hidden-tests-passed event delivered twice at once records one release", async () => {
  const store = memoryStore(true);
  const handler = createEscrowHandler({ bounty: 10000 }, store);
  await Promise.allSettled([
    handler.handle({ id: "e1", kind: "hidden-tests-passed" }),
    handler.handle({ id: "e1", kind: "hidden-tests-passed" }),
  ]);
  assert.deepEqual(recordedReleases(store), [HIDDEN]);
  assert.equal(savesReleasing(store, "hidden-tests"), 1);
  assert.equal(store.state?.status, "partially released");
});

test("[concurrency-2] two hidden-tests-passed events with different ids at once record one release", async () => {
  const store = memoryStore(true);
  const handler = createEscrowHandler({ bounty: 10000 }, store);
  await Promise.allSettled([
    handler.handle({ id: "e1", kind: "hidden-tests-passed" }),
    handler.handle({ id: "e2", kind: "hidden-tests-passed" }),
  ]);
  assert.deepEqual(recordedReleases(store), [HIDDEN]);
  assert.equal(savesReleasing(store, "hidden-tests"), 1);
  assert.equal(store.state?.status, "partially released");
});

test("[concurrency-2] uat-approved delivered twice at once, same id or not, records one UAT release", async () => {
  for (const ids of [["u1", "u1"], ["u1", "u2"]]) {
    const store = memoryStore(true);
    const handler = createEscrowHandler({ bounty: 10000 }, store);
    await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
    await Promise.allSettled(ids.map((id) => handler.handle({ id, kind: "uat-approved" })));
    assert.deepEqual(recordedReleases(store), [HIDDEN, UAT]);
    assert.equal(savesReleasing(store, "uat"), 1);
    assert.equal(store.state?.status, "fully released");
  }
});

test("[recovery-1] a rejected save rejects with the store's error, records nothing, and the retry succeeds", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, store);
  const storeError = new Error("store unavailable");
  store.failNextSet = storeError;
  await assert.rejects(
    handler.handle({ id: "e1", kind: "hidden-tests-passed" }),
    (err: unknown) => err === storeError,
  );
  assert.deepEqual(recordedReleases(store), []);
  const state = await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  const expected = { status: "partially released", releases: [HIDDEN] };
  assert.deepEqual(state, expected);
  assert.deepEqual(store.state, expected);
});

test("[recovery-1] a rejected save of the UAT release leaves the share alone and the retry completes it", async () => {
  const store = memoryStore(true);
  const handler = createEscrowHandler({ bounty: 10000 }, store);
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  const storeError = new Error("store unavailable");
  store.failNextSet = storeError;
  await assert.rejects(
    handler.handle({ id: "e2", kind: "uat-approved" }),
    (err: unknown) => err === storeError,
  );
  assert.deepEqual(store.state, { status: "partially released", releases: [HIDDEN] });
  const state = await handler.handle({ id: "e2", kind: "uat-approved" });
  const expected = { status: "fully released", releases: [HIDDEN, UAT] };
  assert.deepEqual(state, expected);
  assert.deepEqual(store.state, expected);
});
