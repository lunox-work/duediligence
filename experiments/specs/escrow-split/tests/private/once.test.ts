import { test } from "node:test";
import assert from "node:assert/strict";
import { createEscrowHandler } from "../../src/index.js";
import type { EscrowState, EscrowStore } from "../../src/index.js";

interface TestStore extends EscrowStore {
  state: EscrowState | undefined;
  /** Every state saved, in order. */
  writes: EscrowState[];
}

function yieldTurns(turns: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const step = (left: number) => (left <= 0 ? resolve() : setImmediate(() => step(left - 1)));
    step(turns);
  });
}

/**
 * Every call resolves only after other pending work has run: the n-th call
 * waits `latency[n % latency.length]` turns of the event loop.
 */
function memoryStore(latency: number[] = [0]): TestStore {
  let calls = 0;
  const wait = () => yieldTurns(latency[calls++ % latency.length] ?? 0);
  const store: TestStore = {
    state: undefined,
    writes: [],
    async get(): Promise<EscrowState | undefined> {
      await wait();
      return store.state === undefined ? undefined : structuredClone(store.state);
    },
    async set(state: EscrowState): Promise<void> {
      await wait();
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

const HIDDEN_999 = { kind: "hidden-tests", amount: 749 };
const UAT_999 = { kind: "uat", amount: 250 };

// Extends public "[concurrency-1] handling the same hidden-tests-passed event again records nothing more".
test("[concurrency-1] the same hidden-tests-passed event handled many times records one release", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 999 }, store);
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  for (let i = 0; i < 5; i++) {
    await handler.handle({ id: "e1", kind: "hidden-tests-passed" }).catch(() => undefined);
  }
  assert.deepEqual(recordedReleases(store), [HIDDEN_999]);
  assert.equal(store.state?.status, "partially released");
});

// Extends public "[concurrency-1] handling the same hidden-tests-passed event again records nothing more":
// the repeat arrives at a new handler over the same store.
test("[concurrency-1] the same hidden-tests-passed event handled by a new handler records nothing more", async () => {
  const store = memoryStore();
  const task = { bounty: 999 };
  await createEscrowHandler(task, store).handle({ id: "e1", kind: "hidden-tests-passed" });
  await createEscrowHandler(task, store).handle({ id: "e1", kind: "hidden-tests-passed" }).catch(() => undefined);
  assert.deepEqual(recordedReleases(store), [HIDDEN_999]);
  assert.equal(store.state?.status, "partially released");
});

// Extends public "[concurrency-1] a different hidden-tests-passed event after the share was released records nothing".
test("[concurrency-1] different hidden-tests-passed events through new handlers record nothing more", async () => {
  const store = memoryStore();
  const task = { bounty: 999 };
  await createEscrowHandler(task, store).handle({ id: "e1", kind: "hidden-tests-passed" });
  for (const id of ["e2", "e3", "e4"]) {
    await createEscrowHandler(task, store).handle({ id, kind: "hidden-tests-passed" }).catch(() => undefined);
  }
  assert.deepEqual(recordedReleases(store), [HIDDEN_999]);
  assert.equal(store.state?.status, "partially released");
});

// Extends public "[concurrency-1] repeated events after full release record nothing more":
// the repeats arrive at new handlers over the same store.
test("[concurrency-1] repeated events through new handlers after full release record nothing more", async () => {
  const store = memoryStore();
  const task = { bounty: 999 };
  await createEscrowHandler(task, store).handle({ id: "e1", kind: "hidden-tests-passed" });
  await createEscrowHandler(task, store).handle({ id: "e2", kind: "uat-approved" });
  for (const event of [
    { id: "e2", kind: "uat-approved" },
    { id: "e3", kind: "uat-approved" },
    { id: "e1", kind: "hidden-tests-passed" },
    { id: "e4", kind: "hidden-tests-passed" },
  ] as const) {
    await createEscrowHandler(task, store).handle(event).catch(() => undefined);
  }
  assert.deepEqual(recordedReleases(store), [HIDDEN_999, UAT_999]);
  assert.equal(store.state?.status, "fully released");
});

// Extends public "[concurrency-1] repeated events after full release record nothing more":
// a handler that saw the task partially released must not release the rest
// again after another handler over the same store already did.
test("[concurrency-1] a UAT approval at an earlier handler after another handler released the rest records nothing more", async () => {
  const store = memoryStore();
  const task = { bounty: 999 };
  const first = createEscrowHandler(task, store);
  await first.handle({ id: "e1", kind: "hidden-tests-passed" });
  await createEscrowHandler(task, store).handle({ id: "e2", kind: "uat-approved" });
  const writesBefore = store.writes.length;
  // Whether a repeat resolves is open; if it does, it resolves to the escrow afterwards.
  const repeat = await first.handle({ id: "e4", kind: "hidden-tests-passed" }).catch(() => undefined);
  if (repeat !== undefined) {
    assert.equal(repeat.status, "fully released");
    assert.deepEqual(repeat.releases, [HIDDEN_999, UAT_999]);
  }
  await first.handle({ id: "e3", kind: "uat-approved" }).catch(() => undefined);
  await first.handle({ id: "e2", kind: "uat-approved" }).catch(() => undefined);
  for (const written of store.writes.slice(writesBefore)) {
    assert.deepEqual(written.releases, [HIDDEN_999, UAT_999]);
  }
  assert.deepEqual(recordedReleases(store), [HIDDEN_999, UAT_999]);
  assert.equal(store.state?.status, "fully released");
});

// Extends public "[concurrency-2] the same hidden-tests-passed event delivered twice at once records one release".
test("[concurrency-2] the same hidden-tests-passed event delivered five times at once records one release", async () => {
  const store = memoryStore([2]);
  const handler = createEscrowHandler({ bounty: 999 }, store);
  await Promise.allSettled(
    [1, 2, 3, 4, 5].map(() => handler.handle({ id: "e1", kind: "hidden-tests-passed" })),
  );
  assert.deepEqual(recordedReleases(store), [HIDDEN_999]);
  assert.equal(savesReleasing(store, "hidden-tests"), 1);
  assert.equal(store.state?.status, "partially released");
});

// Extends public "[concurrency-2] two hidden-tests-passed events with different ids at once record one release":
// more deliveries, and a store whose calls take uneven time.
test("[concurrency-2] four hidden-tests-passed events at once over a store of uneven latency record one release", async () => {
  const store = memoryStore([5, 1, 3, 0, 2]);
  const handler = createEscrowHandler({ bounty: 999 }, store);
  await Promise.allSettled(
    ["e1", "e2", "e1", "e3"].map((id) => handler.handle({ id, kind: "hidden-tests-passed" })),
  );
  assert.deepEqual(recordedReleases(store), [HIDDEN_999]);
  assert.equal(savesReleasing(store, "hidden-tests"), 1);
  assert.equal(store.state?.status, "partially released");
});

// Extends public "[concurrency-2] uat-approved delivered twice at once, same id or not, records one UAT release".
test("[concurrency-2] uat-approved delivered four times at once, mixed ids, records one UAT release", async () => {
  for (const latency of [[1], [4, 0, 2, 1, 3]]) {
    const store = memoryStore(latency);
    const handler = createEscrowHandler({ bounty: 999 }, store);
    await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
    await Promise.allSettled(
      ["u1", "u2", "u1", "u3"].map((id) => handler.handle({ id, kind: "uat-approved" })),
    );
    assert.deepEqual(recordedReleases(store), [HIDDEN_999, UAT_999]);
    assert.equal(savesReleasing(store, "uat"), 1);
    assert.equal(store.state?.status, "fully released");
  }
});

// Extends public "[concurrency-2] two hidden-tests-passed events with different ids at once record one release":
// the passes arrive at once, then the approvals arrive at once.
test("[concurrency-2] passes at once then approvals at once record one release of each", async () => {
  const store = memoryStore([3, 1]);
  const handler = createEscrowHandler({ bounty: 12345 }, store);
  await Promise.allSettled(
    ["p1", "p2", "p1"].map((id) => handler.handle({ id, kind: "hidden-tests-passed" })),
  );
  await Promise.allSettled(
    ["u1", "u1", "u2"].map((id) => handler.handle({ id, kind: "uat-approved" })),
  );
  assert.deepEqual(recordedReleases(store), [
    { kind: "hidden-tests", amount: 9258 },
    { kind: "uat", amount: 3087 },
  ]);
  assert.equal(savesReleasing(store, "hidden-tests"), 2);
  assert.equal(savesReleasing(store, "uat"), 1);
  assert.equal(store.state?.status, "fully released");
});

// Extends public "[unhappy-1] a failed run after the share was released records nothing more":
// the failed run is handled at the same time as the pass.
test("[unhappy-1] a failed run handled at the same time as a pass does not undo the release", async () => {
  const store = memoryStore([1]);
  const handler = createEscrowHandler({ bounty: 999 }, store);
  await Promise.allSettled([
    handler.handle({ id: "p1", kind: "hidden-tests-passed" }),
    handler.handle({ id: "f1", kind: "hidden-tests-failed" }),
  ]);
  assert.deepEqual(recordedReleases(store), [HIDDEN_999]);
  assert.equal(store.state?.status, "partially released");
});

// Extends public "[unhappy-1] a failed run after the share was released records nothing more":
// the failed run is handled at the same time as the UAT approval.
test("[unhappy-1] a failed run handled at the same time as a UAT approval does not undo the release", async () => {
  const store = memoryStore([1]);
  const handler = createEscrowHandler({ bounty: 999 }, store);
  await handler.handle({ id: "p1", kind: "hidden-tests-passed" });
  await Promise.allSettled([
    handler.handle({ id: "u1", kind: "uat-approved" }),
    handler.handle({ id: "f1", kind: "hidden-tests-failed" }),
  ]);
  assert.deepEqual(recordedReleases(store), [HIDDEN_999, UAT_999]);
  assert.equal(store.state?.status, "fully released");
});
