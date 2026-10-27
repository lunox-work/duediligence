import { test } from "node:test";
import assert from "node:assert/strict";
import { createEscrowHandler } from "../../src/index.js";
import type { EscrowEventKind, EscrowState, EscrowStore, EscrowTask } from "../../src/index.js";

type Method = "get" | "set";

/**
 * The Background's store: get resolves to the last state passed to set, or
 * undefined when set has never been called; calls are counted. A failure
 * queued with failOnce applies to the next call of that method only.
 */
function memoryStore(initial?: EscrowState) {
  let state: EscrowState | undefined = initial;
  const counts = { get: 0, set: 0 };
  const written: EscrowState[] = [];
  const failures: Record<Method, Array<{ error: unknown; how: "reject" | "throw" }>> = { get: [], set: [] };
  const store: EscrowStore = {
    get() {
      counts.get++;
      const failure = failures.get.shift();
      if (failure?.how === "throw") throw failure.error;
      if (failure) return Promise.reject(failure.error);
      return Promise.resolve(state);
    },
    set(next: EscrowState) {
      counts.set++;
      const failure = failures.set.shift();
      if (failure?.how === "throw") throw failure.error;
      if (failure) return Promise.reject(failure.error);
      written.push(structuredClone(next));
      state = next;
      return Promise.resolve();
    },
  };
  function failOnce(method: Method, error: unknown, how: "reject" | "throw" = "reject"): void {
    failures[method].push({ error, how });
  }
  return { store, counts, written, failOnce };
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the promise to reject, but it resolved");
}

function assertNotPassed(error: unknown): void {
  assert.ok(error instanceof Error, `expected an Error, got ${String(error)}`);
  const { message } = error as Error;
  assert.ok(
    message.includes("hidden tests have not passed"),
    `expected the message to contain "hidden tests have not passed", got "${message}"`,
  );
}

function event(id: string, kind: EscrowEventKind) {
  return { id, kind };
}

const LOCKED: EscrowState = { status: "locked", releases: [] };
const PARTIAL: EscrowState = {
  status: "partially released",
  releases: [{ kind: "hidden-tests", amount: 750 }],
};
const FULL: EscrowState = {
  status: "fully released",
  releases: [
    { kind: "hidden-tests", amount: 750 },
    { kind: "uat", amount: 250 },
  ],
};

function partial(amount: number): EscrowState {
  return { status: "partially released", releases: [{ kind: "hidden-tests", amount }] };
}

function full(first: number, rest: number): EscrowState {
  return {
    status: "fully released",
    releases: [
      { kind: "hidden-tests", amount: first },
      { kind: "uat", amount: rest },
    ],
  };
}

// Empty store and stored state

test("[happy-3] a failed run on a fresh task resolves locked and writes nothing", async () => {
  const { store, counts } = memoryStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  assert.deepEqual(await handler.handle(event("e1", "hidden-tests-failed")), LOCKED);
  assert.deepEqual(counts, { get: 1, set: 0 });
  assert.equal(await store.get(), undefined);
});

test("[happy-3] repeated failed runs on a fresh task each read once and never write", async () => {
  const { store, counts } = memoryStore();
  const handler = createEscrowHandler({ bounty: 1000, hiddenTestShareBps: 10000 }, store);
  assert.deepEqual(await handler.handle(event("e1", "hidden-tests-failed")), LOCKED);
  assert.deepEqual(await handler.handle(event("e1", "hidden-tests-failed")), LOCKED);
  assert.deepEqual(await handler.handle(event("e2", "hidden-tests-failed")), LOCKED);
  assert.deepEqual(counts, { get: 3, set: 0 });
  assert.equal(await store.get(), undefined);
});

test("[happy-4] a pass over a stored hidden-test release resolves to the stored state without writing", async () => {
  const { store, counts } = memoryStore(structuredClone(PARTIAL));
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  assert.deepEqual(await handler.handle(event("e9", "hidden-tests-passed")), PARTIAL);
  assert.equal(counts.set, 0);
});

test("[happy-4] the stored state is used as it is, as a new object, and is not mutated", async () => {
  const stored: EscrowState = {
    status: "partially released",
    releases: [{ kind: "hidden-tests", amount: 750 }],
  };
  const { store, counts } = memoryStore(stored);
  // The stored amount does not match this task's share; it is used as stored.
  const handler = createEscrowHandler({ bounty: 2000, hiddenTestShareBps: 5000 }, store);
  const result = await handler.handle(event("e9", "hidden-tests-passed"));
  assert.deepEqual(result, PARTIAL);
  assert.notEqual(result, stored, "resolves to a new object");
  assert.deepEqual(stored, PARTIAL, "the object get returned is not mutated");
  assert.deepEqual(counts, { get: 1, set: 0 });
});

test("[boundary-4] emptying the resolved releases does not change what the store holds", async () => {
  const { store } = memoryStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  const resolved = await handler.handle(event("e1", "hidden-tests-passed"));
  resolved.releases.length = 0;
  assert.deepEqual(await store.get(), PARTIAL);
});

test("[boundary-4] the UAT release neither mutates the state get returned nor shares its result with the store", async () => {
  const { store } = memoryStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  await handler.handle(event("e1", "hidden-tests-passed"));
  const before = (await store.get())!;

  const resolved = await handler.handle(event("e2", "uat-approved"));
  assert.deepEqual(resolved, FULL);
  assert.deepEqual(before, PARTIAL, "the object get returned before the UAT release is unchanged");

  resolved.releases.length = 0;
  assert.deepEqual(await store.get(), FULL);
});

// Hidden-test release

test("[happy-5] a pass releases the configured share of the bounty and writes that state once", async () => {
  const cases: Array<[EscrowTask, number]> = [
    [{ bounty: 1000 }, 750],
    [{ bounty: 999 }, 749],
    [{ bounty: 2000, hiddenTestShareBps: 5000 }, 1000],
    [{ bounty: 100, hiddenTestShareBps: 3333 }, 33],
  ];
  for (const [task, amount] of cases) {
    const { store, counts, written } = memoryStore();
    const handler = createEscrowHandler(task, store);
    const expected = partial(amount);
    assert.deepEqual(await handler.handle(event("e1", "hidden-tests-passed")), expected, JSON.stringify(task));
    assert.equal(counts.set, 1, JSON.stringify(task));
    assert.deepEqual(written, [expected], JSON.stringify(task));
  }
});

test("[happy-5] an explicitly undefined share defaults to 7500", async () => {
  const { store, written } = memoryStore();
  const handler = createEscrowHandler({ bounty: 1000, hiddenTestShareBps: undefined }, store);
  assert.deepEqual(await handler.handle(event("e1", "hidden-tests-passed")), PARTIAL);
  assert.deepEqual(written, [PARTIAL]);
});

test("[boundary-5] zero-amount and whole-bounty hidden-test releases are recorded as partially released", async () => {
  const cases: Array<[EscrowTask, number]> = [
    [{ bounty: 1 }, 0],
    [{ bounty: 1000, hiddenTestShareBps: 0 }, 0],
    [{ bounty: 1000, hiddenTestShareBps: 10000 }, 1000],
  ];
  for (const [task, amount] of cases) {
    const { store } = memoryStore();
    const handler = createEscrowHandler(task, store);
    assert.deepEqual(await handler.handle(event("e1", "hidden-tests-passed")), partial(amount), JSON.stringify(task));
  }
});

test("[boundary-5] a zero-amount hidden-test release is written and counts as released", async () => {
  const { store, counts, written } = memoryStore();
  const handler = createEscrowHandler({ bounty: 1000, hiddenTestShareBps: 0 }, store);
  assert.deepEqual(await handler.handle(event("e1", "hidden-tests-passed")), partial(0));
  assert.deepEqual(written, [partial(0)]);
  assert.deepEqual(await handler.handle(event("e2", "hidden-tests-passed")), partial(0));
  assert.equal(counts.set, 1);
});

test("[boundary-5] a pass on a Number.MAX_SAFE_INTEGER bounty releases the exact share", async () => {
  const { store } = memoryStore();
  const handler = createEscrowHandler({ bounty: Number.MAX_SAFE_INTEGER }, store);
  assert.deepEqual(await handler.handle(event("e1", "hidden-tests-passed")), partial(6755399441055743));
});

// Repeats

test("[boundary-6] a repeated pass, with the same or a different id, releases nothing more", async () => {
  for (const id of ["e1", "e2"]) {
    const { store, counts } = memoryStore();
    const handler = createEscrowHandler({ bounty: 1000 }, store);
    await handler.handle(event("e1", "hidden-tests-passed"));
    assert.deepEqual(await handler.handle(event(id, "hidden-tests-passed")), PARTIAL, id);
    assert.equal(counts.set, 1, id);
  }
});

test("[boundary-6] many repeated passes each read once and never write again", async () => {
  const { store, counts } = memoryStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  await handler.handle(event("e1", "hidden-tests-passed"));
  for (const id of ["e1", "e2", "e3"]) {
    assert.deepEqual(await handler.handle(event(id, "hidden-tests-passed")), PARTIAL, id);
  }
  assert.deepEqual(counts, { get: 4, set: 1 });
  assert.deepEqual(await store.get(), PARTIAL);
});

test("[boundary-7] a new handler over the same store does not release again", async () => {
  const { store, counts } = memoryStore();
  await createEscrowHandler({ bounty: 1000 }, store).handle(event("e1", "hidden-tests-passed"));
  assert.deepEqual(
    await createEscrowHandler({ bounty: 1000 }, store).handle(event("e1", "hidden-tests-passed")),
    PARTIAL,
  );
  assert.equal(counts.set, 1);
});

test("[boundary-7] a new handler with a different share over the same store does not release again", async () => {
  const { store, counts } = memoryStore();
  await createEscrowHandler({ bounty: 1000 }, store).handle(event("e1", "hidden-tests-passed"));
  assert.deepEqual(
    await createEscrowHandler({ bounty: 1000, hiddenTestShareBps: 5000 }, store).handle(
      event("e2", "hidden-tests-passed"),
    ),
    PARTIAL,
  );
  assert.equal(counts.set, 1);
});

// Failed runs

test("[unhappy-7] a failed run then a passing rerun releases the share once", async () => {
  const { store, counts } = memoryStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  assert.deepEqual(await handler.handle(event("e1", "hidden-tests-failed")), LOCKED);
  assert.deepEqual(await handler.handle(event("e2", "hidden-tests-passed")), PARTIAL);
  assert.equal(counts.set, 1);
});

test("[unhappy-7] several failed runs then a pass with a failed run's id still release the share", async () => {
  const { store, counts } = memoryStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  assert.deepEqual(await handler.handle(event("e1", "hidden-tests-failed")), LOCKED);
  assert.deepEqual(await handler.handle(event("e1", "hidden-tests-failed")), LOCKED);
  assert.deepEqual(await handler.handle(event("e2", "hidden-tests-failed")), LOCKED);
  assert.deepEqual(await handler.handle(event("e1", "hidden-tests-passed")), PARTIAL);
  assert.equal(counts.set, 1);
});

test("[unhappy-8] a failed run after the hidden-test release changes nothing", async () => {
  const { store, counts } = memoryStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  await handler.handle(event("e1", "hidden-tests-passed"));
  assert.deepEqual(await handler.handle(event("f1", "hidden-tests-failed")), PARTIAL);
  assert.equal(counts.set, 1);
  assert.deepEqual(await store.get(), PARTIAL);
});

test("[unhappy-8] a failed run after the full release changes nothing", async () => {
  const { store, counts } = memoryStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  await handler.handle(event("e1", "hidden-tests-passed"));
  await handler.handle(event("e2", "uat-approved"));
  assert.deepEqual(await handler.handle(event("f1", "hidden-tests-failed")), FULL);
  assert.equal(counts.set, 2);
  assert.deepEqual(await store.get(), FULL);
});

// UAT release

test("[happy-6] UAT approval releases the remaining balance after the hidden-test release", async () => {
  const cases: Array<[EscrowTask, number, number]> = [
    [{ bounty: 1000 }, 750, 250],
    [{ bounty: 999 }, 749, 250],
    [{ bounty: 1 }, 0, 1],
    [{ bounty: 1000, hiddenTestShareBps: 0 }, 0, 1000],
    [{ bounty: 1000, hiddenTestShareBps: 10000 }, 1000, 0],
  ];
  for (const [task, first, rest] of cases) {
    const { store, counts } = memoryStore();
    const handler = createEscrowHandler(task, store);
    await handler.handle(event("e1", "hidden-tests-passed"));
    assert.deepEqual(await handler.handle(event("e2", "uat-approved")), full(first, rest), JSON.stringify(task));
    assert.equal(counts.set, 2, JSON.stringify(task));
  }
});

test("[happy-6] UAT approval on a Number.MAX_SAFE_INTEGER bounty releases the exact remainder", async () => {
  const { store, written } = memoryStore();
  const handler = createEscrowHandler({ bounty: Number.MAX_SAFE_INTEGER }, store);
  await handler.handle(event("e1", "hidden-tests-passed"));
  const expected = full(6755399441055743, 2251799813685248);
  assert.deepEqual(await handler.handle(event("e2", "uat-approved")), expected);
  assert.deepEqual(written, [partial(6755399441055743), expected]);
});

test("[boundary-8] the UAT remainder is what is left in escrow, not a recomputed share", async () => {
  const { store } = memoryStore(partial(700));
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  assert.deepEqual(await handler.handle(event("e2", "uat-approved")), full(700, 300));
});

test("[boundary-8] a stored release of the whole bounty leaves a zero UAT release, still recorded", async () => {
  const { store, written } = memoryStore(partial(1000));
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  assert.deepEqual(await handler.handle(event("e2", "uat-approved")), full(1000, 0));
  assert.deepEqual(written, [full(1000, 0)]);
});

test("[boundary-9] any event after the full release records nothing", async () => {
  for (const kind of ["uat-approved", "hidden-tests-passed", "hidden-tests-failed"] as const) {
    const { store, counts } = memoryStore();
    const handler = createEscrowHandler({ bounty: 1000 }, store);
    await handler.handle(event("e1", "hidden-tests-passed"));
    await handler.handle(event("e2", "uat-approved"));
    assert.deepEqual(await handler.handle(event("x", kind)), FULL, kind);
    assert.equal(counts.set, 2, kind);
  }
});

test("[boundary-9] events after a full release with a zero UAT amount record nothing", async () => {
  const { store, counts } = memoryStore();
  const handler = createEscrowHandler({ bounty: 1000, hiddenTestShareBps: 10000 }, store);
  await handler.handle(event("e1", "hidden-tests-passed"));
  await handler.handle(event("e2", "uat-approved"));
  for (const kind of ["uat-approved", "hidden-tests-passed", "hidden-tests-failed", "uat-approved"] as const) {
    assert.deepEqual(await handler.handle(event("e2", kind)), full(1000, 0), kind);
  }
  assert.deepEqual(counts, { get: 6, set: 2 });
});

test("[unhappy-9] UAT approval before any hidden-test release is rejected and later gates still work", async () => {
  const { store, counts } = memoryStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  assertNotPassed(await rejectionOf(handler.handle(event("u1", "uat-approved"))));
  assert.equal(counts.set, 0);
  assert.equal(await store.get(), undefined);

  assert.deepEqual(await handler.handle(event("e1", "hidden-tests-passed")), PARTIAL);
  assert.deepEqual(await handler.handle(event("e2", "uat-approved")), FULL);
});

test("[unhappy-9] UAT approval after only failed runs is rejected each time and later gates still work", async () => {
  const { store, counts } = memoryStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  await handler.handle(event("f1", "hidden-tests-failed"));
  assertNotPassed(await rejectionOf(handler.handle(event("u1", "uat-approved"))));
  assertNotPassed(await rejectionOf(handler.handle(event("u1", "uat-approved"))));
  assert.equal(counts.set, 0);

  assert.deepEqual(await handler.handle(event("e1", "hidden-tests-passed")), PARTIAL);
  assert.deepEqual(await handler.handle(event("u1", "uat-approved")), FULL);
});

// Pro bono

test("[boundary-10] every valid event on a pro bono task resolves pro bono without writing", async () => {
  for (const kind of ["hidden-tests-passed", "hidden-tests-failed", "uat-approved"] as const) {
    const { store, counts } = memoryStore();
    const handler = createEscrowHandler({ bounty: 0 }, store);
    assert.deepEqual(await handler.handle(event("e1", kind)), { status: "pro bono", releases: [] }, kind);
    assert.equal(counts.set, 0, kind);
  }
});

test("[boundary-10] a full sequence of events on a pro bono task with a whole share never writes", async () => {
  const { store, counts } = memoryStore();
  const handler = createEscrowHandler({ bounty: 0, hiddenTestShareBps: 10000 }, store);
  const kinds = ["uat-approved", "hidden-tests-passed", "uat-approved", "hidden-tests-failed", "hidden-tests-passed"] as const;
  for (const kind of kinds) {
    assert.deepEqual(await handler.handle(event("e1", kind)), { status: "pro bono", releases: [] }, kind);
  }
  assert.equal(counts.set, 0);
  assert.equal(await store.get(), undefined);
});

// Store failures

for (const method of ["get", "set"] as const) {
  test(`[unhappy-10] a ${method} rejection rejects with that error and a retry records normally`, async () => {
    const { store, counts, failOnce } = memoryStore();
    const handler = createEscrowHandler({ bounty: 1000 }, store);
    const failure = new Error(`${method} failed`);
    failOnce(method, failure);
    assert.equal(await rejectionOf(handler.handle(event("e1", "hidden-tests-passed"))), failure);
    if (method === "get") assert.equal(counts.set, 0, "a get failure means set is not called");
    assert.equal(await store.get(), undefined);

    assert.deepEqual(await handler.handle(event("e1", "hidden-tests-passed")), PARTIAL);
    assert.deepEqual(await store.get(), PARTIAL);
  });
}

test("[unhappy-10] get and set that throw synchronously reject with that error and do not block a retry", async () => {
  const { store, counts, failOnce } = memoryStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);

  const getFailure = { reason: "get threw" };
  failOnce("get", getFailure, "throw");
  assert.equal(await rejectionOf(handler.handle(event("e1", "hidden-tests-passed"))), getFailure);
  assert.deepEqual(counts, { get: 1, set: 0 });

  const setFailure = new Error("set threw");
  failOnce("set", setFailure, "throw");
  assert.equal(await rejectionOf(handler.handle(event("e1", "hidden-tests-passed"))), setFailure);
  assert.equal(await store.get(), undefined);

  assert.deepEqual(await handler.handle(event("e1", "hidden-tests-passed")), PARTIAL);
  assert.deepEqual(await store.get(), PARTIAL);
});

test("[unhappy-11] a set failure during UAT leaves the hidden-test release in place and a retry completes it", async () => {
  const { store, failOnce } = memoryStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  await handler.handle(event("e1", "hidden-tests-passed"));
  const failure = new Error("set failed");
  failOnce("set", failure);
  assert.equal(await rejectionOf(handler.handle(event("e2", "uat-approved"))), failure);
  assert.deepEqual(await store.get(), PARTIAL);
  assert.deepEqual(await handler.handle(event("e2", "uat-approved")), FULL);
});

test("[unhappy-11] a get failure during UAT writes nothing and a retry completes the release", async () => {
  const { store, counts, failOnce } = memoryStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  await handler.handle(event("e1", "hidden-tests-passed"));
  const failure = new Error("get failed");
  failOnce("get", failure);
  assert.equal(await rejectionOf(handler.handle(event("e2", "uat-approved"))), failure);
  assert.equal(counts.set, 1);
  assert.deepEqual(await store.get(), PARTIAL);
  assert.deepEqual(await handler.handle(event("e2", "uat-approved")), FULL);
  assert.equal(counts.set, 2);
});
