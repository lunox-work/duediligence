import { test } from "node:test";
import assert from "node:assert/strict";
import { createEscrowHandler } from "../../src/index.js";
import type { EscrowState, EscrowStore } from "../../src/index.js";

type TestStore = EscrowStore & { state: EscrowState | undefined; writes: EscrowState[] };

function memoryStore(): TestStore {
  const store: TestStore = {
    state: undefined,
    writes: [],
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
  assert.match(err.message, /hidden[ -]?tests?\b.*\bnot\b.*\bpassed/i);
  return true;
}

// Extends public "[happy-1] passing hidden tests releases 7500 of 10000 at the default share".
test("[happy-1] passing hidden tests releases the default share of another bounty, rounded down", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 12345 }, store);
  const state = await handler.handle({ id: "h-12345", kind: "hidden-tests-passed" });
  const expected = { status: "partially released", releases: [{ kind: "hidden-tests", amount: 9258 }] };
  assert.equal(state.status, expected.status);
  assert.deepEqual(state.releases, expected.releases);
  assert.equal(store.state?.status, expected.status);
  assert.deepEqual(store.state?.releases, expected.releases);
});

// Extends public "[happy-1] a share of 1 bps releases 1 of 10000".
test("[happy-1] passing hidden tests releases other shares of other bounties", async () => {
  for (const [bounty, bps, amount] of [
    [2500, 4000, 1000],
    [10001, 9999, 9999],
    [999, 7500, 749],
    [123456, 1, 12],
  ]) {
    const store = memoryStore();
    const handler = createEscrowHandler({ bounty, hiddenTestShareBps: bps }, store);
    const state = await handler.handle({ id: `e-${bounty}`, kind: "hidden-tests-passed" });
    const releases = [{ kind: "hidden-tests", amount }];
    assert.equal(state.status, "partially released", `bounty ${bounty}, bps ${bps}`);
    assert.deepEqual(state.releases, releases, `bounty ${bounty}, bps ${bps}`);
    assert.equal(store.state?.status, "partially released");
    assert.deepEqual(store.state?.releases, releases);
  }
});

// Extends public "[happy-1] passing hidden tests releases 7500 of 10000 at the default share":
// an absent share and an undefined share both mean the default.
test("[happy-1] an undefined share means the default share of 7500 bps", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 999, hiddenTestShareBps: undefined }, store);
  const state = await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  assert.deepEqual(state.releases, [{ kind: "hidden-tests", amount: 749 }]);
  assert.equal(state.status, "partially released");
});

// Extends public "[unhappy-1] a failed run records nothing and the task stays locked":
// a failed run does not stop a later passing run from releasing the share.
test("[happy-1] passing hidden tests after failed runs releases the share", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 2000, hiddenTestShareBps: 6000 }, store);
  await handler.handle({ id: "f1", kind: "hidden-tests-failed" });
  await handler.handle({ id: "f2", kind: "hidden-tests-failed" });
  const state = await createEscrowHandler({ bounty: 2000, hiddenTestShareBps: 6000 }, store).handle({
    id: "p1",
    kind: "hidden-tests-passed",
  });
  const releases = [{ kind: "hidden-tests", amount: 1200 }];
  assert.equal(state.status, "partially released");
  assert.deepEqual(state.releases, releases);
  assert.equal(store.state?.status, "partially released");
  assert.deepEqual(store.state?.releases, releases);
});

// Extends public "[happy-2] UAT approval releases the remaining 2500 and the task is fully released".
test("[happy-2] UAT approval releases the remaining balance of other bounties and shares", async () => {
  for (const [bounty, bps, hidden, uat] of [
    [7, 3333, 2, 5],
    [12345, 7500, 9258, 3087],
    [10001, 9999, 9999, 2],
    [2500, 4000, 1000, 1500],
  ]) {
    const store = memoryStore();
    const handler = createEscrowHandler({ bounty, hiddenTestShareBps: bps }, store);
    await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
    const state = await handler.handle({ id: "e2", kind: "uat-approved" });
    const releases = [
      { kind: "hidden-tests", amount: hidden },
      { kind: "uat", amount: uat },
    ];
    assert.equal(state.status, "fully released", `bounty ${bounty}, bps ${bps}`);
    assert.deepEqual(state.releases, releases, `bounty ${bounty}, bps ${bps}`);
    assert.equal(store.state?.status, "fully released");
    assert.deepEqual(store.state?.releases, releases);
  }
});

// Extends public "[happy-2] a new handler over the same store releases the remaining odd balance".
test("[happy-2] a new handler over the same store releases the remaining balance of a large bounty", async () => {
  const store = memoryStore();
  const task = { bounty: Number.MAX_SAFE_INTEGER, hiddenTestShareBps: 3333 };
  await createEscrowHandler(task, store).handle({ id: "e1", kind: "hidden-tests-passed" });
  await createEscrowHandler(task, store).handle({ id: "e2", kind: "hidden-tests-failed" });
  const state = await createEscrowHandler(task, store).handle({ id: "e3", kind: "uat-approved" });
  const releases = [
    { kind: "hidden-tests", amount: 3002099511605172 },
    { kind: "uat", amount: 6005099743135819 },
  ];
  assert.equal(state.status, "fully released");
  assert.deepEqual(state.releases, releases);
  assert.equal(store.state?.status, "fully released");
  assert.deepEqual(store.state?.releases, releases);
});

// Extends public "[happy-2] UAT approval releases the remaining 2500 and the task is fully released":
// a failed run after the share was released does not undo it.
test("[happy-2] UAT approval after a pass and a later failed run still releases the rest", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 999 }, store);
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  await handler.handle({ id: "e2", kind: "hidden-tests-failed" });
  const state = await handler.handle({ id: "e3", kind: "uat-approved" });
  const releases = [
    { kind: "hidden-tests", amount: 749 },
    { kind: "uat", amount: 250 },
  ];
  assert.equal(state.status, "fully released");
  assert.deepEqual(state.releases, releases);
  assert.deepEqual(store.state?.releases, releases);
});

// Extends public "[unhappy-2] UAT approval on a locked task is refused and records nothing":
// once the share is released, a fresh UAT approval goes through.
test("[happy-2] UAT approval after an earlier refused one releases the rest once the share is released", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, store);
  await assert.rejects(handler.handle({ id: "u1", kind: "uat-approved" }), saysHiddenTestsNotPassed);
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  const state = await handler.handle({ id: "u2", kind: "uat-approved" });
  const releases = [
    { kind: "hidden-tests", amount: 7500 },
    { kind: "uat", amount: 2500 },
  ];
  assert.equal(state.status, "fully released");
  assert.deepEqual(state.releases, releases);
  assert.deepEqual(store.state?.releases, releases);
});

// Extends public "[unhappy-1] a failed run records nothing and the task stays locked".
test("[unhappy-1] several failed runs with other values record nothing and the task stays locked", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 999, hiddenTestShareBps: 5000 }, store);
  for (const id of ["f1", "f2", "f1", "f3"]) {
    const state = await handler.handle({ id, kind: "hidden-tests-failed" });
    assert.equal(state.status, "locked", `event ${id}`);
    assert.deepEqual(state.releases, [], `event ${id}`);
  }
  assert.deepEqual(recordedReleases(store), []);
  for (const written of store.writes) assert.deepEqual(written.releases, []);
  if (store.state !== undefined) assert.equal(store.state.status, "locked");
});

// Extends public "[unhappy-1] a failed run after the share was released records nothing more".
test("[unhappy-1] a failed run after full release records nothing more", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 999 }, store);
  await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  await handler.handle({ id: "e2", kind: "uat-approved" });
  const state = await handler.handle({ id: "e3", kind: "hidden-tests-failed" });
  const releases = [
    { kind: "hidden-tests", amount: 749 },
    { kind: "uat", amount: 250 },
  ];
  assert.deepEqual(state.releases, releases);
  assert.deepEqual(recordedReleases(store), releases);
});

// Extends public "[unhappy-2] UAT approval on a locked task is refused and records nothing".
test("[unhappy-2] repeated UAT approvals on a locked task are each refused and record nothing", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 999, hiddenTestShareBps: 5000 }, store);
  for (const id of ["u1", "u2", "u1"]) {
    await assert.rejects(handler.handle({ id, kind: "uat-approved" }), saysHiddenTestsNotPassed);
  }
  assert.deepEqual(recordedReleases(store), []);
  for (const written of store.writes) assert.deepEqual(written.releases, []);
  if (store.state !== undefined) assert.equal(store.state.status, "locked");
});

// Extends public "[unhappy-2] UAT approval after a failed hidden-test run is still refused".
test("[unhappy-2] UAT approval through a new handler after failed runs is still refused", async () => {
  const store = memoryStore();
  const task = { bounty: 4321, hiddenTestShareBps: 2500 };
  await createEscrowHandler(task, store).handle({ id: "f1", kind: "hidden-tests-failed" });
  await createEscrowHandler(task, store).handle({ id: "f2", kind: "hidden-tests-failed" });
  await assert.rejects(
    createEscrowHandler(task, store).handle({ id: "u1", kind: "uat-approved" }),
    saysHiddenTestsNotPassed,
  );
  assert.deepEqual(recordedReleases(store), []);
  for (const written of store.writes) assert.deepEqual(written.releases, []);
});

// Extends public "[unhappy-2] UAT approval on a locked task is refused and records nothing":
// the refused approval is not held over and released later.
test("[unhappy-2] a refused UAT approval leaves nothing behind for when the hidden tests pass", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000 }, store);
  await assert.rejects(handler.handle({ id: "u1", kind: "uat-approved" }), saysHiddenTestsNotPassed);
  const state = await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  const releases = [{ kind: "hidden-tests", amount: 7500 }];
  assert.equal(state.status, "partially released");
  assert.deepEqual(state.releases, releases);
  assert.deepEqual(recordedReleases(store), releases);
  for (const written of store.writes) {
    assert.ok(written.releases.every((release) => release.kind !== "uat"));
  }
});

// Extends public "[boundary-2] passing hidden tests on a bounty of 0 records nothing and the task is pro bono".
test("[boundary-2] passing hidden tests on a bounty of 0 at any share records nothing and the task is pro bono", async () => {
  for (const bps of [0, 1, 5000, 9999, undefined]) {
    const store = memoryStore();
    const handler = createEscrowHandler({ bounty: 0, hiddenTestShareBps: bps }, store);
    const state = await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
    assert.equal(state.status, "pro bono", `bps ${bps}`);
    assert.deepEqual(state.releases, [], `bps ${bps}`);
    assert.deepEqual(recordedReleases(store), []);
    for (const written of store.writes) assert.deepEqual(written.releases, []);
    if (store.state !== undefined) assert.equal(store.state.status, "pro bono");
  }
});

// Extends public "[boundary-2] passing hidden tests on a bounty of 0 records nothing and the task is pro bono".
test("[boundary-2] a failed run on a bounty of 0 leaves the task pro bono", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 0 }, store);
  const state = await handler.handle({ id: "f1", kind: "hidden-tests-failed" });
  assert.equal(state.status, "pro bono");
  assert.deepEqual(state.releases, []);
  assert.deepEqual(recordedReleases(store), []);
  if (store.state !== undefined) assert.equal(store.state.status, "pro bono");
});

// Extends public "[boundary-2] passing hidden tests on a bounty of 0 records nothing and the task is pro bono".
test("[boundary-2] repeated passes on a bounty of 0, through new handlers, never record a release", async () => {
  const store = memoryStore();
  for (const id of ["e1", "e2", "e1", "e3"]) {
    const state = await createEscrowHandler({ bounty: 0 }, store).handle({ id, kind: "hidden-tests-passed" });
    assert.equal(state.status, "pro bono", `event ${id}`);
    assert.deepEqual(state.releases, [], `event ${id}`);
  }
  for (const written of store.writes) assert.deepEqual(written.releases, []);
  assert.deepEqual(recordedReleases(store), []);
  if (store.state !== undefined) assert.equal(store.state.status, "pro bono");
});

// Extends public "[boundary-2] a bounty of 0 with a full share never records a release through UAT":
// UAT approval arrives first, at the default share.
test("[boundary-2] a UAT approval first on a bounty of 0 records nothing, and nor does a later pass", async () => {
  const store = memoryStore();
  const handler = createEscrowHandler({ bounty: 0 }, store);
  const first = await handler.handle({ id: "u1", kind: "uat-approved" }).catch(() => undefined);
  if (first !== undefined) {
    assert.equal(first.status, "pro bono");
    assert.deepEqual(first.releases, []);
  }
  const state = await handler.handle({ id: "e1", kind: "hidden-tests-passed" });
  assert.equal(state.status, "pro bono");
  assert.deepEqual(state.releases, []);
  await handler.handle({ id: "u2", kind: "uat-approved" }).catch(() => undefined);
  for (const written of store.writes) assert.deepEqual(written.releases, []);
  assert.deepEqual(recordedReleases(store), []);
  if (store.state !== undefined) assert.equal(store.state.status, "pro bono");
});
