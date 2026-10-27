import { test } from "node:test";
import assert from "node:assert/strict";
import { createEscrowHandler } from "../../src/index.js";
import type { EscrowEvent, EscrowState, EscrowStore, EscrowTask } from "../../src/index.js";

// Lets the tests pass arguments the signature does not allow.
const create = createEscrowHandler as unknown as (task: unknown, store: EscrowStore) => {
  handle(event: unknown): Promise<EscrowState>;
};

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** The Background's store: get resolves to the last state passed to set; calls are counted. */
function memoryStore() {
  let state: EscrowState | undefined;
  let gate: Promise<void> | undefined;
  const counts = { get: 0, set: 0 };
  const store: EscrowStore = {
    async get() {
      counts.get++;
      if (gate) await gate;
      return state;
    },
    async set(next: EscrowState) {
      counts.set++;
      state = next;
    },
  };
  /** Makes get wait until the returned function is called. */
  function hold(): () => void {
    let release!: () => void;
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return () => {
      gate = undefined;
      release();
    };
  }
  return { store, counts, hold };
}

function assertThrowsNaming(
  fn: () => unknown,
  type: new (...args: any[]) => Error,
  name: string,
  label: string,
): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof type, `${label}: expected a ${type.name}, got ${String(error)}`);
    const { message } = error as Error;
    assert.ok(
      message.includes(name),
      `${label}: expected the message to contain "${name}", got "${message}"`,
    );
    return true;
  });
}

const invalidEvents: unknown[] = [
  null,
  "hidden-tests-passed",
  { kind: "hidden-tests-passed" },
  { id: "", kind: "hidden-tests-passed" },
  { id: 7, kind: "hidden-tests-passed" },
  { id: "e1" },
  { id: "e1", kind: "tests-passed" },
  { id: "e1", kind: "UAT-APPROVED" },
];

test("[happy-2] createEscrowHandler returns a handler without reading or writing the store", () => {
  const { store, counts } = memoryStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  assert.equal(typeof handler.handle, "function");
  assert.deepEqual(counts, { get: 0, set: 0 });
});

test("[happy-2] creating handlers with an explicit undefined share or a zero bounty touches no store", () => {
  const tasks: EscrowTask[] = [
    { bounty: 1000, hiddenTestShareBps: undefined },
    { bounty: 0 },
    { bounty: Number.MAX_SAFE_INTEGER, hiddenTestShareBps: 10000 },
    { bounty: 1000, hiddenTestShareBps: 0 },
  ];
  for (const task of tasks) {
    const { store, counts } = memoryStore();
    const handler = createEscrowHandler(task, store);
    assert.equal(typeof handler.handle, "function", JSON.stringify(task));
    assert.deepEqual(counts, { get: 0, set: 0 }, JSON.stringify(task));
  }
});

test("[unhappy-4] createEscrowHandler rejects each invalid task naming the offending field", () => {
  const cases: Array<[unknown, new (...args: any[]) => Error, string]> = [
    [{ bounty: -5 }, RangeError, "bounty"],
    [{ bounty: 10.5 }, RangeError, "bounty"],
    [{ bounty: "1000" }, TypeError, "bounty"],
    [{ bounty: 1000, hiddenTestShareBps: 10001 }, RangeError, "hiddenTestShareBps"],
    [{ bounty: 1000, hiddenTestShareBps: -1 }, RangeError, "hiddenTestShareBps"],
    [{ bounty: 1000, hiddenTestShareBps: null }, TypeError, "hiddenTestShareBps"],
    [{ bounty: 1000, hiddenTestShareBps: "7500" }, TypeError, "hiddenTestShareBps"],
  ];
  for (const [task, type, name] of cases) {
    const { store, counts } = memoryStore();
    assertThrowsNaming(() => create(task, store), type, name, JSON.stringify(task));
    assert.deepEqual(counts, { get: 0, set: 0 }, JSON.stringify(task));
  }
});

test("[unhappy-4] a missing or unsafe bounty is reported before an invalid share", () => {
  const cases: Array<[unknown, new (...args: any[]) => Error, string, string]> = [
    [{}, TypeError, "bounty", "{}"],
    [{ hiddenTestShareBps: 10001 }, TypeError, "bounty", "{ hiddenTestShareBps: 10001 }"],
    [{ bounty: -1, hiddenTestShareBps: null }, RangeError, "bounty", "{ bounty: -1, hiddenTestShareBps: null }"],
    [{ bounty: 9007199254740992 }, RangeError, "bounty", "{ bounty: 2 ** 53 }"],
    [{ bounty: 1000, hiddenTestShareBps: 10000.5 }, RangeError, "hiddenTestShareBps", "share 10000.5"],
  ];
  for (const [task, type, name, label] of cases) {
    const { store, counts } = memoryStore();
    assertThrowsNaming(() => create(task, store), type, name, label);
    assert.deepEqual(counts, { get: 0, set: 0 }, label);
  }
});

test("[unhappy-5] createEscrowHandler throws a TypeError for a task that is null, undefined or a number", () => {
  for (const task of [null, undefined, 1000]) {
    const { store, counts } = memoryStore();
    assert.throws(() => create(task, store), TypeError, String(task));
    assert.deepEqual(counts, { get: 0, set: 0 }, String(task));
  }
});

test("[unhappy-5] createEscrowHandler throws a TypeError for a string or boolean task", () => {
  for (const task of ['{"bounty":1000}', true]) {
    const { store, counts } = memoryStore();
    assert.throws(() => create(task, store), TypeError, String(task));
    assert.deepEqual(counts, { get: 0, set: 0 }, String(task));
  }
});

test("[unhappy-6] handle returns a TypeError rejection for each invalid event without touching the store", async () => {
  for (const event of invalidEvents) {
    const { store, counts } = memoryStore();
    const handler = create({ bounty: 1000 }, store);
    let promise: Promise<EscrowState> | undefined;
    assert.doesNotThrow(() => {
      promise = handler.handle(event);
    }, JSON.stringify(event));
    await assert.rejects(promise!, TypeError, JSON.stringify(event));
    assert.deepEqual(counts, { get: 0, set: 0 }, JSON.stringify(event));
  }
});

test("[unhappy-6] an invalid event rejects without waiting for a call in progress", async () => {
  const { store, counts, hold } = memoryStore();
  const handler = createEscrowHandler({ bounty: 1000 }, store);
  const release = hold();
  const first = handler.handle({ id: "e1", kind: "hidden-tests-passed" });

  const outcome: { settled: boolean; error: unknown } = { settled: false, error: undefined };
  const bad = handler.handle({ id: "", kind: "uat-approved" } as EscrowEvent);
  bad.then(
    () => {
      outcome.settled = true;
    },
    (error: unknown) => {
      outcome.settled = true;
      outcome.error = error;
    },
  );
  for (let i = 0; i < 5 && !outcome.settled; i++) await tick();

  assert.ok(outcome.settled, "the invalid event settled while the first call was still waiting on get");
  assert.ok(outcome.error instanceof TypeError, `expected a TypeError, got ${String(outcome.error)}`);
  assert.deepEqual(counts, { get: 1, set: 0 }, "only the valid call reached the store");

  release();
  assert.deepEqual(await first, {
    status: "partially released",
    releases: [{ kind: "hidden-tests", amount: 750 }],
  });
  assert.deepEqual(counts, { get: 1, set: 1 });
});
