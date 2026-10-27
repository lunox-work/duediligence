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

function clone(state: EscrowState | undefined): EscrowState | undefined {
  return state === undefined ? undefined : {
    status: state.status,
    releases: state.releases.map((release) => ({ ...release })),
  };
}

function memoryStore(options: {
  initial?: EscrowState;
  yieldRounds?: number;
  sharedReads?: boolean;
} = {}) {
  let saved = clone(options.initial);
  const getErrors: Error[] = [];
  const setErrors: Error[] = [];
  async function yieldWork() {
    for (let i = 0; i < (options.yieldRounds ?? 0); i++) await Promise.resolve();
  }
  const store: EscrowStore = {
    async get() {
      await yieldWork();
      if (getErrors.length > 0) throw getErrors.shift()!;
      return options.sharedReads ? saved : clone(saved);
    },
    async set(state: EscrowState) {
      await yieldWork();
      if (setErrors.length > 0) throw setErrors.shift()!;
      saved = clone(state);
    },
  };
  return {
    store,
    snapshot: () => clone(saved),
    failGet: (error: Error) => { getErrors.push(error); },
    failSet: (error: Error) => { setErrors.push(error); },
  };
}

function expectedSplit(bounty: number, share: number) {
  const hidden = BigInt(bounty) * BigInt(share) / 10000n;
  return { hiddenTests: Number(hidden), uat: Number(BigInt(bounty) - hidden) };
}

function releasesFor(bounty: number, share: number): Release[] {
  const split = expectedSplit(bounty, share);
  return [
    { kind: "hidden-tests", amount: split.hiddenTests },
    { kind: "uat", amount: split.uat },
  ];
}

function expectState(state: EscrowState, status: EscrowStatus, releases: Release[]) {
  assert.equal(state.status, status);
  assert.deepEqual(state.releases, releases);
}

function notPassed(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  assert.match(error.message, /hidden[\s-]*tests?/i);
  assert.match(error.message, /not|haven['’]?t|hasn['’]?t|before|yet|required|must|first/i);
  return true;
}

// Extends "passing hidden tests releases the default 7500 share": a default
// share must be applied to the bounty, rather than returning a fixed 7500.
test("[happy-1] default share scales to a different non-round bounty", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 12347 }, memory.store);
  const state = await handler.handle({ id: "scaled-default", kind: "hidden-tests-passed" });
  expectState(state, "partially released", [{ kind: "hidden-tests", amount: 9260 }]);
  assert.deepEqual(memory.snapshot(), state);
});

test("[happy-1] an arbitrary configured share is used instead of the default", async () => {
  const bounty = 87654321;
  const share = 2468;
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty, hiddenTestShareBps: share }, memory.store);
  const state = await handler.handle({ id: "custom-share", kind: "hidden-tests-passed" });
  expectState(state, "partially released", releasesFor(bounty, share).slice(0, 1));
  assert.deepEqual(memory.snapshot(), state);
});

// Extends "the smallest positive basis-point share releases one unit":
// one basis point does not always mean an amount of one.
test("[happy-1] one basis point scales above one minor unit", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 98765432, hiddenTestShareBps: 1 }, memory.store);
  const state = await handler.handle({ id: "one-bps", kind: "hidden-tests-passed" });
  expectState(state, "partially released", [{ kind: "hidden-tests", amount: 9876 }]);
  assert.deepEqual(memory.snapshot(), state);
});

test("[happy-1] different tasks do not share a cached bounty or gate state", async () => {
  const first = memoryStore();
  const second = memoryStore();
  const a = createEscrowHandler({ bounty: 25600, hiddenTestShareBps: 3125 }, first.store);
  const b = createEscrowHandler({ bounty: 1200 }, second.store);
  // Event ids identify events for a task; the two tasks have separate stores.
  expectState(await a.handle({ id: "delivery", kind: "hidden-tests-passed" }),
    "partially released", [{ kind: "hidden-tests", amount: 8000 }]);
  expectState(await b.handle({ id: "delivery", kind: "hidden-tests-passed" }),
    "partially released", [{ kind: "hidden-tests", amount: 900 }]);
  assert.deepEqual(first.snapshot()?.releases, [{ kind: "hidden-tests", amount: 8000 }]);
  assert.deepEqual(second.snapshot()?.releases, [{ kind: "hidden-tests", amount: 900 }]);
});

// Extends "999 splits into 749 and 250 and both amounts are released": use a
// different fractional share, and check both the helper and the actual gates.
test("[boundary-1] both gates use the floor and complement for an unfamiliar fraction", async () => {
  assert.deepEqual(splitBounty(10003, 9999), { hiddenTests: 10001, uat: 2 });
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 10003, hiddenTestShareBps: 9999 }, memory.store);
  expectState(await handler.handle({ id: "fractional-hidden", kind: "hidden-tests-passed" }),
    "partially released", [{ kind: "hidden-tests", amount: 10001 }]);
  const state = await handler.handle({ id: "fractional-uat", kind: "uat-approved" });
  expectState(state, "fully released", [
    { kind: "hidden-tests", amount: 10001 }, { kind: "uat", amount: 2 },
  ]);
  assert.deepEqual(memory.snapshot(), state);
});

test("[boundary-1] every basis-point value is floored for several small bounties", () => {
  for (const bounty of [1, 7, 101, 10001]) {
    for (let share = 0; share <= 10000; share++) {
      assert.deepEqual(splitBounty(bounty, share), expectedSplit(bounty, share),
        `bounty=${bounty}, share=${share}`);
    }
  }
});

// Extends "splits stay exact at and near the maximum safe bounty": many
// more residues and basis points catch floating-point division shortcuts.
test("[boundary-1] maximum-safe residues stay exact across a wider share grid", () => {
  for (let offset = 0; offset < 257; offset++) {
    const bounty = Number.MAX_SAFE_INTEGER - offset;
    for (const share of [2, 3, 17, 127, 2501, 4999, 5000, 5001, 6789, 8123, 9997, 9998]) {
      const split = splitBounty(bounty, share);
      assert.deepEqual(split, expectedSplit(bounty, share), `bounty=${bounty}, share=${share}`);
      assert.equal(split.hiddenTests + split.uat, bounty);
    }
  }
});

test("[boundary-1] exact splitting crosses integer-width and floating-point power boundaries", () => {
  for (let power = 16; power <= 52; power++) {
    for (const offset of [-1, 0, 1, 9999]) {
      const bounty = 2 ** power + offset;
      for (const share of [1, 13, 2499, 5003, 7001, 9999]) {
        assert.deepEqual(splitBounty(bounty, share), expectedSplit(bounty, share),
          `power=${power}, offset=${offset}, share=${share}`);
      }
    }
  }
});

// Extends "zero and full shares preserve the entire bounty exactly":
// include zero bounties at interior shares and endpoints at other large sizes.
test("[boundary-1] endpoint shares preserve additional bounties and zero stays zero", () => {
  for (const bounty of [2, 10001, 2147483649, 4294967311, 2 ** 52 + 37]) {
    assert.deepEqual(splitBounty(bounty, 0), { hiddenTests: 0, uat: bounty });
    assert.deepEqual(splitBounty(bounty, 10000), { hiddenTests: bounty, uat: 0 });
  }
  for (const share of [1, 2345, 5000, 8765, 9999]) {
    assert.deepEqual(splitBounty(0, share), { hiddenTests: 0, uat: 0 });
  }
});

test("[boundary-1] subunit shares floor to zero without losing the UAT complement", () => {
  for (const [bounty, share] of [[1, 9999], [2, 4999], [3, 3333], [9999, 1], [10000, 1], [10001, 1]]) {
    assert.deepEqual(splitBounty(bounty, share), expectedSplit(bounty, share));
  }
});

test("[boundary-1] the handler also uses exact arithmetic for huge releases", async () => {
  for (const [bounty, share] of [
    [Number.MAX_SAFE_INTEGER, 9998],
    [Number.MAX_SAFE_INTEGER - 9, 6789],
    [2 ** 52 + 9999, 5003],
  ]) {
    const memory = memoryStore();
    const handler = createEscrowHandler({ bounty, hiddenTestShareBps: share }, memory.store);
    const releases = releasesFor(bounty, share);
    expectState(await handler.handle({ id: "huge-hidden", kind: "hidden-tests-passed" }),
      "partially released", releases.slice(0, 1));
    const final = await handler.handle({ id: "huge-uat", kind: "uat-approved" });
    expectState(final, "fully released", releases);
    assert.deepEqual(memory.snapshot(), final);
  }
});

// Extends "UAT releases the remaining 2500 after the default hidden share":
// the remainder must come from the configured share, not a fixed 25 percent.
test("[happy-2] UAT releases an arbitrary configured remainder", async () => {
  const bounty = 543219;
  const share = 3691;
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty, hiddenTestShareBps: share }, memory.store);
  await handler.handle({ id: "custom-hidden", kind: "hidden-tests-passed" });
  const final = await handler.handle({ id: "custom-uat", kind: "uat-approved" });
  expectState(final, "fully released", releasesFor(bounty, share));
  assert.deepEqual(memory.snapshot(), final);
});

// Extends "UAT can release a remaining balance of just one unit": the one
// unit can arise from a near-full custom share on a much larger bounty.
test("[happy-2] one unit of UAT remains after a 9999 basis-point release", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 10000, hiddenTestShareBps: 9999 }, memory.store);
  await handler.handle({ id: "almost-all", kind: "hidden-tests-passed" });
  const final = await handler.handle({ id: "last-unit", kind: "uat-approved" });
  expectState(final, "fully released", [
    { kind: "hidden-tests", amount: 9999 }, { kind: "uat", amount: 1 },
  ]);
  assert.deepEqual(memory.snapshot(), final);
});

test("[happy-2] a newly created handler continues the hidden release stored by its predecessor", async () => {
  const memory = memoryStore();
  const task = { bounty: 121212, hiddenTestShareBps: 4321 };
  await createEscrowHandler(task, memory.store).handle({ id: "before-restart", kind: "hidden-tests-passed" });
  const final = await createEscrowHandler(task, memory.store).handle({ id: "after-restart", kind: "uat-approved" });
  expectState(final, "fully released", releasesFor(task.bounty, task.hiddenTestShareBps));
  assert.deepEqual(memory.snapshot(), final);
});

test("[happy-2] UAT honors an existing partial state in the caller supplied store", async () => {
  const memory = memoryStore({ initial: {
    status: "partially released", releases: [{ kind: "hidden-tests", amount: 6000 }],
  } });
  const handler = createEscrowHandler({ bounty: 16000, hiddenTestShareBps: 3750 }, memory.store);
  const final = await handler.handle({ id: "resume-uat", kind: "uat-approved" });
  expectState(final, "fully released", [
    { kind: "hidden-tests", amount: 6000 }, { kind: "uat", amount: 10000 },
  ]);
  assert.deepEqual(memory.snapshot(), final);
});

// Extends "a failed hidden-test run leaves escrow locked with no releases":
// failure is not a permanent terminal state preventing a later passing run.
test("[unhappy-1] several failures leave the bounty locked and a later pass can release it", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 38123, hiddenTestShareBps: 2345 }, memory.store);
  for (let i = 0; i < 12; i++) {
    expectState(await handler.handle({ id: `failure-${i}`, kind: "hidden-tests-failed" }), "locked", []);
    assert.deepEqual(memory.snapshot()?.releases ?? [], []);
  }
  const partial = await handler.handle({ id: "eventual-pass", kind: "hidden-tests-passed" });
  expectState(partial, "partially released", releasesFor(38123, 2345).slice(0, 1));
  assert.deepEqual(memory.snapshot(), partial);
});

// Extends "repeated failed runs keep even a one-unit bounty locked": use a
// large bounty, longer replay history and both new and duplicate failures.
test("[unhappy-1] many repeated failures never release even the maximum-safe bounty", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: Number.MAX_SAFE_INTEGER, hiddenTestShareBps: 9999 }, memory.store);
  for (let i = 0; i < 80; i++) {
    expectState(await handler.handle({ id: `failed-${i % 17}`, kind: "hidden-tests-failed" }), "locked", []);
    assert.deepEqual(memory.snapshot()?.releases ?? [], []);
  }
});

test("[unhappy-1] a failed run after a hidden release records no new money", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 8200, hiddenTestShareBps: 2500 }, memory.store);
  await handler.handle({ id: "passed-earlier", kind: "hidden-tests-passed" });
  for (const id of ["late-failure", "late-failure", "another-failure"]) {
    const state = await handler.handle({ id, kind: "hidden-tests-failed" });
    // No new release or removal of a release is permitted by a failed run.
    assert.deepEqual(state.releases, [{ kind: "hidden-tests", amount: 2050 }]);
    assert.deepEqual(memory.snapshot()?.releases, state.releases);
  }
});

// Extends "UAT before any hidden-test pass rejects without a release": a
// refusal must not poison processing of subsequent valid events.
test("[unhappy-2] refused approvals do not prevent a later valid approval", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 24681, hiddenTestShareBps: 6789 }, memory.store);
  for (let i = 0; i < 3; i++) {
    await assert.rejects(async () => handler.handle({ id: `early-approval-${i}`, kind: "uat-approved" }), notPassed);
    assert.deepEqual(memory.snapshot()?.releases ?? [], []);
  }
  await handler.handle({ id: "subsequent-pass", kind: "hidden-tests-passed" });
  const final = await handler.handle({ id: "valid-approval", kind: "uat-approved" });
  expectState(final, "fully released", releasesFor(24681, 6789));
  assert.deepEqual(memory.snapshot(), final);
});

// Extends "UAT is still refused after a failed hidden-test run": multiple
// failures, repeated refusals, and very different amounts must not bypass it.
test("[unhappy-2] many failed runs and approvals cannot satisfy the hidden gate", async () => {
  for (const [bounty, share] of [[2, 7500], [90001, 1], [Number.MAX_SAFE_INTEGER, 9999]]) {
    const memory = memoryStore();
    const handler = createEscrowHandler({ bounty, hiddenTestShareBps: share }, memory.store);
    for (let i = 0; i < 6; i++) {
      await handler.handle({ id: `failed-${i}`, kind: "hidden-tests-failed" });
      await assert.rejects(async () => handler.handle({ id: `early-uat-${i}`, kind: "uat-approved" }), notPassed);
      assert.deepEqual(memory.snapshot()?.releases ?? [], []);
    }
  }
});

test("[unhappy-2] a stored locked state still requires a hidden-test pass", async () => {
  const initial: EscrowState = { status: "locked", releases: [] };
  const memory = memoryStore({ initial });
  const handler = createEscrowHandler({ bounty: 64000, hiddenTestShareBps: 5000 }, memory.store);
  await assert.rejects(async () => handler.handle({ id: "stored-early-uat", kind: "uat-approved" }), notPassed);
  assert.deepEqual(memory.snapshot(), initial);
});

// Extends "a pro bono task records no releases across both gates and
// redelivery": a longer history begins with failed runs and uses a custom share.
test("[boundary-2] pro bono survives a long history of failures passes and approvals", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 0, hiddenTestShareBps: 4321 }, memory.store);
  for (let i = 0; i < 5; i++) {
    expectState(await handler.handle({ id: `zero-failure-${i}`, kind: "hidden-tests-failed" }), "pro bono", []);
  }
  await handler.handle({ id: "zero-pass", kind: "hidden-tests-passed" });
  for (let i = 0; i < 60; i++) {
    const kind = (["uat-approved", "hidden-tests-passed", "hidden-tests-failed"] as const)[i % 3];
    expectState(await handler.handle({ id: `zero-${kind}-${i % 9}`, kind }), "pro bono", []);
    assert.deepEqual(memory.snapshot()?.releases ?? [], []);
  }
});

// Extends "pro bono status also holds at both share endpoints": exercise
// many deliveries at each endpoint rather than only one of each kind.
test("[boundary-2] endpoint pro bono tasks remain empty under concurrent redelivery", async () => {
  for (const share of [0, 10000]) {
    const memory = memoryStore({ yieldRounds: 3 });
    const handler = createEscrowHandler({ bounty: 0, hiddenTestShareBps: share }, memory.store);
    expectState(await handler.handle({ id: "zero-setup", kind: "hidden-tests-passed" }), "pro bono", []);
    const states = await Promise.all(Array.from({ length: 36 }, (_, i) => {
      const kind = (["hidden-tests-passed", "uat-approved", "hidden-tests-failed"] as const)[i % 3];
      return handler.handle({ id: `endpoint-${kind}-${i % 6}`, kind });
    }));
    for (const state of states) expectState(state, "pro bono", []);
    assert.deepEqual(memory.snapshot()?.releases ?? [], []);
  }
});

test("[boundary-2] pro bono survives handler recreation with an interior share", async () => {
  const memory = memoryStore();
  const task = { bounty: 0, hiddenTestShareBps: 9999 };
  expectState(await createEscrowHandler(task, memory.store).handle({ id: "free-hidden", kind: "hidden-tests-passed" }),
    "pro bono", []);
  expectState(await createEscrowHandler(task, memory.store).handle({ id: "free-uat", kind: "uat-approved" }),
    "pro bono", []);
  assert.deepEqual(memory.snapshot()?.releases ?? [], []);
});

// Extends "redelivering the same hidden-test event records no extra release":
// repeat fresh event objects many times with an unfamiliar amount and id.
test("[concurrency-1] a hundred clones of one hidden event still record one custom release", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 98765, hiddenTestShareBps: 5432 }, memory.store);
  const event: EscrowEvent = { id: "long-id/" + "gate-".repeat(200) + "终", kind: "hidden-tests-passed" };
  for (let i = 0; i < 100; i++) {
    const state = await handler.handle({ ...event });
    expectState(state, "partially released", releasesFor(98765, 5432).slice(0, 1));
    assert.deepEqual(memory.snapshot(), state);
  }
});

// Extends "a different hidden-test event cannot release the share again":
// deduplication must follow the gate, not a short fixed cache of event ids.
test("[concurrency-1] many different ids cannot release a previously paid hidden gate", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 32004, hiddenTestShareBps: 1250 }, memory.store);
  for (let i = 0; i < 128; i++) {
    const state = await handler.handle({ id: `distinct-hidden-${i}`, kind: "hidden-tests-passed" });
    expectState(state, "partially released", [{ kind: "hidden-tests", amount: 4000 }]);
    assert.deepEqual(memory.snapshot(), state);
  }
});

// Extends "repeated UAT and late hidden-test events leave a fully released
// task unchanged": large amounts and a long interleaving of old and new ids.
test("[concurrency-1] a long replay history preserves the exact completed release list", async () => {
  const bounty = Number.MAX_SAFE_INTEGER - 71;
  const share = 8123;
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty, hiddenTestShareBps: share }, memory.store);
  await handler.handle({ id: "original-hidden", kind: "hidden-tests-passed" });
  await handler.handle({ id: "original-uat", kind: "uat-approved" });
  for (let i = 0; i < 100; i++) {
    const kind = i % 2 === 0 ? "hidden-tests-passed" : "uat-approved";
    const id = i % 5 === 0 ? (kind === "uat-approved" ? "original-uat" : "original-hidden") : `late-${i}`;
    const state = await handler.handle({ id, kind });
    expectState(state, "fully released", releasesFor(bounty, share));
    assert.deepEqual(memory.snapshot(), state);
  }
});

test("[concurrency-1] deduplication survives handler recreation at both gates", async () => {
  const memory = memoryStore();
  const task = { bounty: 50008, hiddenTestShareBps: 2222 };
  const hidden: EscrowEvent = { id: "restart-hidden", kind: "hidden-tests-passed" };
  const uat: EscrowEvent = { id: "restart-uat", kind: "uat-approved" };
  await createEscrowHandler(task, memory.store).handle(hidden);
  for (const id of [hidden.id, "new-hidden-id"]) {
    const state = await createEscrowHandler(task, memory.store).handle({ id, kind: hidden.kind });
    expectState(state, "partially released", releasesFor(task.bounty, task.hiddenTestShareBps).slice(0, 1));
  }
  await createEscrowHandler(task, memory.store).handle(uat);
  for (const event of [uat, { ...uat, id: "new-uat-id" }, hidden]) {
    const state = await createEscrowHandler(task, memory.store).handle(event);
    expectState(state, "fully released", releasesFor(task.bounty, task.hiddenTestShareBps));
    assert.deepEqual(memory.snapshot(), state);
  }
});

test("[concurrency-1] a preexisting fully released state cannot pay either gate again", async () => {
  const initial: EscrowState = { status: "fully released", releases: releasesFor(77777, 1111) };
  const memory = memoryStore({ initial });
  const handler = createEscrowHandler({ bounty: 77777, hiddenTestShareBps: 1111 }, memory.store);
  for (const event of [
    { id: "previously-unseen-hidden", kind: "hidden-tests-passed" },
    { id: "previously-unseen-uat", kind: "uat-approved" },
  ] satisfies EscrowEvent[]) {
    expectState(await handler.handle(event), initial.status, initial.releases);
    assert.deepEqual(memory.snapshot(), initial);
  }
});

test("[concurrency-1] ordinary string event ids that resemble object properties are handled normally", async () => {
  for (const id of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
    const memory = memoryStore();
    const handler = createEscrowHandler({ bounty: 26000, hiddenTestShareBps: 5000 }, memory.store);
    const event: EscrowEvent = { id, kind: "hidden-tests-passed" };
    await handler.handle(event);
    const state = await handler.handle({ ...event });
    expectState(state, "partially released", [{ kind: "hidden-tests", amount: 13000 }]);
    const full = await handler.handle({ id: `uat/${id}`, kind: "uat-approved" });
    expectState(full, "fully released", releasesFor(26000, 5000));
    assert.deepEqual(memory.snapshot(), full);
  }
});

async function burst(kind: "hidden-tests-passed" | "uat-approved", sameId: boolean) {
  const bounty = Number.MAX_SAFE_INTEGER - 103;
  const share = 6789;
  const memory = memoryStore({ yieldRounds: 5 });
  const handler = createEscrowHandler({ bounty, hiddenTestShareBps: share }, memory.store);
  if (kind === "uat-approved") {
    await handler.handle({ id: "burst-hidden-setup", kind: "hidden-tests-passed" });
  }
  const states = await Promise.all(Array.from({ length: 64 }, (_, i) =>
    handler.handle({ id: sameId ? "burst-event" : `burst-event-${i}`, kind })));
  const releases = releasesFor(bounty, share).slice(0, kind === "uat-approved" ? 2 : 1);
  const status = kind === "uat-approved" ? "fully released" : "partially released";
  for (const state of states) expectState(state, status, releases);
  expectState(memory.snapshot()!, status, releases);
  // The gate remains paid after the overlapping calls have all finished.
  const replay = await handler.handle({ id: "after-burst", kind });
  expectState(replay, status, releases);
  assert.deepEqual(memory.snapshot(), replay);
}

// Extends "simultaneous hidden-test deliveries with the same id release once".
test("[concurrency-2] sixty-four simultaneous copies of one hidden event pay once", async () => {
  await burst("hidden-tests-passed", true);
});

// Extends "simultaneous hidden-test deliveries with different ids release once".
test("[concurrency-2] sixty-four simultaneous distinct hidden events pay once", async () => {
  await burst("hidden-tests-passed", false);
});

// Extends "simultaneous UAT deliveries with the same id release the rest once".
test("[concurrency-2] sixty-four simultaneous copies of one UAT event pay once", async () => {
  await burst("uat-approved", true);
});

// Extends "simultaneous UAT deliveries with different ids release the rest once".
test("[concurrency-2] sixty-four simultaneous distinct UAT events pay once", async () => {
  await burst("uat-approved", false);
});

test("[concurrency-2] mixed duplicate and fresh ids in successive gate bursts pay exactly the bounty", async () => {
  const memory = memoryStore({ yieldRounds: 7 });
  const handler = createEscrowHandler({ bounty: 7654321, hiddenTestShareBps: 3456 }, memory.store);
  for (const kind of ["hidden-tests-passed", "uat-approved"] as const) {
    const states = await Promise.all(Array.from({ length: 45 }, (_, i) =>
      handler.handle({ id: `${kind}/${i % 7 === 0 ? "duplicate" : i}`, kind })));
    const releases = releasesFor(7654321, 3456).slice(0, kind === "uat-approved" ? 2 : 1);
    const status = kind === "uat-approved" ? "fully released" : "partially released";
    for (const state of states) expectState(state, status, releases);
    expectState(memory.snapshot()!, status, releases);
  }
});

// Extends "a failed hidden-share save propagates its error and the same event
// succeeds on retry": repeated failures must not leave an event consumed or a
// rejected serialization promise cached forever.
test("[recovery-1] three failed hidden saves preserve the original error and allow the same id to retry", async () => {
  const memory = memoryStore({ yieldRounds: 2 });
  const handler = createEscrowHandler({ bounty: 100003, hiddenTestShareBps: 8765 }, memory.store);
  const event: EscrowEvent = { id: "retry-hidden", kind: "hidden-tests-passed" };
  for (let i = 0; i < 3; i++) {
    const error = new Error(`private hidden write ${i}`);
    memory.failSet(error);
    await assert.rejects(async () => handler.handle({ ...event }), (actual: unknown) => actual === error);
    assert.deepEqual(memory.snapshot()?.releases ?? [], []);
  }
  const partial = await handler.handle({ ...event });
  expectState(partial, "partially released", releasesFor(100003, 8765).slice(0, 1));
  assert.deepEqual(memory.snapshot(), partial);
  expectState(await handler.handle({ ...event }), "partially released", partial.releases);
});

// Extends "a failed UAT save preserves the hidden release and retries the
// remainder once": repeated failures with a non-default fractional share.
test("[recovery-1] three failed UAT saves preserve the exact partial balance until retry succeeds", async () => {
  const memory = memoryStore({ yieldRounds: 2 });
  const handler = createEscrowHandler({ bounty: 654321, hiddenTestShareBps: 4321 }, memory.store);
  await handler.handle({ id: "retry-uat-setup", kind: "hidden-tests-passed" });
  const before = memory.snapshot();
  const event: EscrowEvent = { id: "retry-uat", kind: "uat-approved" };
  for (let i = 0; i < 3; i++) {
    const error = new Error(`private UAT write ${i}`);
    memory.failSet(error);
    await assert.rejects(async () => handler.handle({ ...event }), (actual: unknown) => actual === error);
    assert.deepEqual(memory.snapshot(), before);
  }
  const final = await handler.handle({ ...event });
  expectState(final, "fully released", releasesFor(654321, 4321));
  assert.deepEqual(memory.snapshot(), final);
  expectState(await handler.handle({ ...event }), "fully released", final.releases);
});

test("[recovery-1] a different hidden event may succeed after a failed save without duplicating on the original retry", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 73129, hiddenTestShareBps: 2223 }, memory.store);
  const error = new Error("first hidden write rejected");
  memory.failSet(error);
  await assert.rejects(async () => handler.handle({ id: "original", kind: "hidden-tests-passed" }),
    (actual: unknown) => actual === error);
  assert.deepEqual(memory.snapshot()?.releases ?? [], []);
  for (const id of ["replacement", "original", "replacement", "yet-another"]) {
    const state = await handler.handle({ id, kind: "hidden-tests-passed" });
    expectState(state, "partially released", releasesFor(73129, 2223).slice(0, 1));
    assert.deepEqual(memory.snapshot(), state);
  }
});

test("[recovery-1] a different UAT event may finish after a failed save without a second remainder", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 73129, hiddenTestShareBps: 2223 }, memory.store);
  await handler.handle({ id: "setup", kind: "hidden-tests-passed" });
  const before = memory.snapshot();
  const error = new Error("first UAT write rejected");
  memory.failSet(error);
  await assert.rejects(async () => handler.handle({ id: "original-uat", kind: "uat-approved" }),
    (actual: unknown) => actual === error);
  assert.deepEqual(memory.snapshot(), before);
  for (const id of ["replacement-uat", "original-uat", "another-uat"]) {
    const state = await handler.handle({ id, kind: "uat-approved" });
    expectState(state, "fully released", releasesFor(73129, 2223));
    assert.deepEqual(memory.snapshot(), state);
  }
});

// EscrowHandler.handle also explicitly promises the store's error when a
// store call rejects; get failures must not be swallowed or treated as empty.
test("[recovery-1] a failed initial get propagates its error and the same hidden event can retry", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 81234, hiddenTestShareBps: 1234 }, memory.store);
  const error = new Error("cannot read initial escrow");
  memory.failGet(error);
  const event: EscrowEvent = { id: "read-retry", kind: "hidden-tests-passed" };
  await assert.rejects(async () => handler.handle(event), (actual: unknown) => actual === error);
  assert.deepEqual(memory.snapshot()?.releases ?? [], []);
  const state = await handler.handle({ ...event });
  expectState(state, "partially released", releasesFor(81234, 1234).slice(0, 1));
  assert.deepEqual(memory.snapshot(), state);
});

test("[recovery-1] a failed read of persisted partial escrow cannot erase the hidden release", async () => {
  const initial: EscrowState = {
    status: "partially released", releases: [{ kind: "hidden-tests", amount: 18000 }],
  };
  const memory = memoryStore({ initial });
  const handler = createEscrowHandler({ bounty: 24000 }, memory.store);
  const error = new Error("cannot read existing escrow");
  memory.failGet(error);
  const event: EscrowEvent = { id: "existing-read-retry", kind: "uat-approved" };
  await assert.rejects(async () => handler.handle(event), (actual: unknown) => actual === error);
  assert.deepEqual(memory.snapshot(), initial);
  const state = await handler.handle({ ...event });
  expectState(state, "fully released", releasesFor(24000, 7500));
  assert.deepEqual(memory.snapshot(), state);
});

test("[recovery-1] a rejected UAT save cannot mutate the stored object returned by get", async () => {
  const initial: EscrowState = {
    status: "partially released", releases: [{ kind: "hidden-tests", amount: 8000 }],
  };
  const memory = memoryStore({ initial, sharedReads: true });
  const handler = createEscrowHandler({ bounty: 20000, hiddenTestShareBps: 4000 }, memory.store);
  const error = new Error("shared-object UAT save rejected");
  memory.failSet(error);
  const event: EscrowEvent = { id: "shared-uat", kind: "uat-approved" };
  await assert.rejects(async () => handler.handle(event), (actual: unknown) => actual === error);
  assert.deepEqual(memory.snapshot(), initial);
  const final = await handler.handle({ ...event });
  expectState(final, "fully released", releasesFor(20000, 4000));
  assert.deepEqual(memory.snapshot(), final);
});

test("[recovery-1] a rejected hidden save cannot mutate a stored locked object", async () => {
  const initial: EscrowState = { status: "locked", releases: [] };
  const memory = memoryStore({ initial, sharedReads: true });
  const handler = createEscrowHandler({ bounty: 43210, hiddenTestShareBps: 1234 }, memory.store);
  const error = new Error("shared-object hidden save rejected");
  memory.failSet(error);
  const event: EscrowEvent = { id: "shared-hidden", kind: "hidden-tests-passed" };
  await assert.rejects(async () => handler.handle(event), (actual: unknown) => actual === error);
  assert.deepEqual(memory.snapshot(), initial);
  const partial = await handler.handle({ ...event });
  expectState(partial, "partially released", releasesFor(43210, 1234).slice(0, 1));
  assert.deepEqual(memory.snapshot(), partial);
});

test("[recovery-1] a failed hidden save does not make an intervening UAT approval valid", async () => {
  const memory = memoryStore();
  const handler = createEscrowHandler({ bounty: 55555, hiddenTestShareBps: 5555 }, memory.store);
  const error = new Error("hidden money was not saved");
  const hidden: EscrowEvent = { id: "not-yet-paid", kind: "hidden-tests-passed" };
  memory.failSet(error);
  await assert.rejects(async () => handler.handle(hidden), (actual: unknown) => actual === error);
  await assert.rejects(async () => handler.handle({ id: "too-soon", kind: "uat-approved" }), notPassed);
  assert.deepEqual(memory.snapshot()?.releases ?? [], []);
  await handler.handle({ ...hidden });
  const final = await handler.handle({ id: "after-successful-save", kind: "uat-approved" });
  expectState(final, "fully released", releasesFor(55555, 5555));
  assert.deepEqual(memory.snapshot(), final);
});

test("[recovery-1] both gates can fail and retry while keeping huge amounts exact", async () => {
  const bounty = Number.MAX_SAFE_INTEGER - 177;
  const share = 9997;
  const memory = memoryStore({ yieldRounds: 4 });
  const handler = createEscrowHandler({ bounty, hiddenTestShareBps: share }, memory.store);
  for (const kind of ["hidden-tests-passed", "uat-approved"] as const) {
    const before = memory.snapshot();
    const error = new Error(`large ${kind} save failed`);
    const event: EscrowEvent = { id: `large-${kind}`, kind };
    memory.failSet(error);
    await assert.rejects(async () => handler.handle(event), (actual: unknown) => actual === error);
    assert.deepEqual(memory.snapshot(), before);
    const state = await handler.handle({ ...event });
    const full = kind === "uat-approved";
    expectState(state, full ? "fully released" : "partially released",
      releasesFor(bounty, share).slice(0, full ? 2 : 1));
    assert.deepEqual(memory.snapshot(), state);
  }
});

test("[recovery-1] failed saves remain retryable after constructing a replacement handler", async () => {
  const memory = memoryStore();
  const task = { bounty: 90909, hiddenTestShareBps: 6061 };
  for (const kind of ["hidden-tests-passed", "uat-approved"] as const) {
    const event: EscrowEvent = { id: `restart-${kind}`, kind };
    const before = memory.snapshot();
    const error = new Error(`restart ${kind} failed`);
    memory.failSet(error);
    const failedHandler = createEscrowHandler(task, memory.store);
    await assert.rejects(async () => failedHandler.handle(event), (actual: unknown) => actual === error);
    assert.deepEqual(memory.snapshot(), before);
    const state = await createEscrowHandler(task, memory.store).handle({ ...event });
    const full = kind === "uat-approved";
    expectState(state, full ? "fully released" : "partially released",
      releasesFor(task.bounty, task.hiddenTestShareBps).slice(0, full ? 2 : 1));
    assert.deepEqual(memory.snapshot(), state);
  }
});
