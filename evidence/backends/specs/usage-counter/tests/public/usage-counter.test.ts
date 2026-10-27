import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UsageCounter,
  type UsageReport,
  type UsageStore,
  type UsageTotals,
} from "../../src/index.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function gate() {
  const entered = deferred();
  const released = deferred();
  return {
    entered: entered.promise,
    release: released.resolve,
    async wait() {
      entered.resolve();
      await released.promise;
    },
  };
}

// Cloning models saved values rather than references into the counter's cache.
// Gates control completion without timers or assumptions about storage keys.
class MemoryStore implements UsageStore {
  private readonly values = new Map<string, unknown>();
  private getGate?: ReturnType<typeof gate>;
  private setGate?: ReturnType<typeof gate>;
  rejectNextSet?: Error;

  constructor(private readonly yieldCalls = false) {}

  pauseNextGet() {
    const pending = gate();
    this.getGate = pending;
    return pending;
  }

  pauseNextSet() {
    const pending = gate();
    this.setGate = pending;
    return pending;
  }

  async get(key: string): Promise<unknown> {
    const pending = this.getGate;
    this.getGate = undefined;
    if (pending) await pending.wait();
    if (this.yieldCalls) await Promise.resolve();
    return structuredClone(this.values.get(key));
  }

  async set(key: string, value: unknown): Promise<void> {
    const pending = this.setGate;
    this.setGate = undefined;
    if (pending) await pending.wait();
    if (this.yieldCalls) await Promise.resolve();
    if (this.rejectNextSet) {
      const error = this.rejectNextSet;
      this.rejectNextSet = undefined;
      throw error;
    }
    this.values.set(key, structuredClone(value));
  }
}

function report(overrides: Partial<UsageReport> = {}): UsageReport {
  return {
    taskId: "t1",
    contributorId: "c1",
    inputTokens: 1000,
    outputTokens: 200,
    costMicroDollars: 3400,
    ...overrides,
  };
}

function totals(input: bigint, output: bigint, cost: bigint): UsageTotals {
  return { inputTokens: input, outputTokens: output, costMicroDollars: cost };
}

const zero = totals(0n, 0n, 0n);

function assertTotals(actual: UsageTotals, expected: UsageTotals) {
  assert.equal(actual.inputTokens, expected.inputTokens, "input tokens");
  assert.equal(actual.outputTokens, expected.outputTokens, "output tokens");
  assert.equal(actual.costMicroDollars, expected.costMicroDollars, "cost");
}

async function assertBoth(
  counter: UsageCounter,
  taskId: string,
  contributorId: string,
  expected: UsageTotals,
) {
  assertTotals(await counter.taskTotals(taskId), expected);
  assertTotals(await counter.contributorTotals(taskId, contributorId), expected);
}

test("[happy-1] a report adds all three counts to task and contributor", async () => {
  const counter = new UsageCounter(new MemoryStore());
  await counter.report(report());
  await assertBoth(counter, "t1", "c1", totals(1000n, 200n, 3400n));
});

test("[happy-1] zero counts are accepted and leave existing totals unchanged", async () => {
  const counter = new UsageCounter(new MemoryStore());
  await counter.report(report({ inputTokens: 0, outputTokens: 0, costMicroDollars: 0 }));
  await assertBoth(counter, "t1", "c1", zero);
  await counter.report(report());
  await counter.report(report({ inputTokens: 0, outputTokens: 0, costMicroDollars: 0 }));
  await assertBoth(counter, "t1", "c1", totals(1000n, 200n, 3400n));
});

test("[happy-2] tasks and contributors sum only their own reports", async () => {
  const counter = new UsageCounter(new MemoryStore());
  await counter.report(report({ inputTokens: 2, outputTokens: 3, costMicroDollars: 5 }));
  await counter.report(report({ inputTokens: 7, outputTokens: 11, costMicroDollars: 13 }));
  await counter.report(report({ contributorId: "c2", inputTokens: 17, outputTokens: 19, costMicroDollars: 23 }));
  await counter.report(report({ taskId: "t2", inputTokens: 29, outputTokens: 31, costMicroDollars: 37 }));
  assertTotals(await counter.taskTotals("t1"), totals(26n, 33n, 41n));
  assertTotals(await counter.contributorTotals("t1", "c1"), totals(9n, 14n, 18n));
  assertTotals(await counter.contributorTotals("t1", "c2"), totals(17n, 19n, 23n));
  await assertBoth(counter, "t2", "c1", totals(29n, 31n, 37n));
  assertTotals(await counter.contributorTotals("t2", "c2"), zero);
});

test("[happy-2] nonempty identifiers with separators remain distinct", async () => {
  const counter = new UsageCounter(new MemoryStore());
  await counter.report(report({ taskId: "a:b", contributorId: "c", inputTokens: 1, outputTokens: 2, costMicroDollars: 3 }));
  await counter.report(report({ taskId: "a", contributorId: "b:c", inputTokens: 4, outputTokens: 5, costMicroDollars: 6 }));
  await counter.report(report({ taskId: "c", contributorId: "a:b", inputTokens: 7, outputTokens: 8, costMicroDollars: 9 }));
  await assertBoth(counter, "a:b", "c", totals(1n, 2n, 3n));
  await assertBoth(counter, "a", "b:c", totals(4n, 5n, 6n));
  await assertBoth(counter, "c", "a:b", totals(7n, 8n, 9n));
});

test("[boundary-1] repeated safe integer reports sum exactly past two to the power 53", async () => {
  const counter = new UsageCounter(new MemoryStore());
  const large = Number.MAX_SAFE_INTEGER;
  await counter.report(report({ inputTokens: large, outputTokens: large, costMicroDollars: large }));
  await counter.report(report({ inputTokens: 2, outputTokens: 4, costMicroDollars: 6 }));
  await counter.report(report({ inputTokens: 2, outputTokens: 4, costMicroDollars: 6 }));
  await assertBoth(counter, "t1", "c1", totals(BigInt(large) + 4n, BigInt(large) + 8n, BigInt(large) + 12n));
});

test("[boundary-1] exactly representable counts at two to the power 53 accept unit increments", async () => {
  const counter = new UsageCounter(new MemoryStore());
  const large = 2 ** 53;
  await counter.report(report({ inputTokens: large, outputTokens: large, costMicroDollars: large }));
  await assertBoth(counter, "t1", "c1", totals(9007199254740992n, 9007199254740992n, 9007199254740992n));
  await counter.report(report({ contributorId: "c2", inputTokens: 1, outputTokens: 1, costMicroDollars: 1 }));
  assertTotals(await counter.taskTotals("t1"), totals(9007199254740993n, 9007199254740993n, 9007199254740993n));
  assertTotals(await counter.contributorTotals("t1", "c1"), totals(9007199254740992n, 9007199254740992n, 9007199254740992n));
  assertTotals(await counter.contributorTotals("t1", "c2"), totals(1n, 1n, 1n));
});

async function assertRefusedWithoutChanges(invalid: UsageReport) {
  const store = new MemoryStore();
  const counter = new UsageCounter(store);
  await counter.report(report());
  await counter.report(report({ taskId: "t2", contributorId: "c2", inputTokens: 7, outputTokens: 11, costMicroDollars: 13 }));
  await assert.rejects(async () => { await counter.report(invalid); }, Error);
  for (const reader of [counter, new UsageCounter(store)]) {
    await assertBoth(reader, "t1", "c1", totals(1000n, 200n, 3400n));
    await assertBoth(reader, "t2", "c2", totals(7n, 11n, 13n));
    assertTotals(await reader.contributorTotals("t1", "c2"), zero);
  }
  // A validation failure must not prevent later valid reports on this task.
  await counter.report(report({ inputTokens: 1, outputTokens: 2, costMicroDollars: 3 }));
  await assertBoth(counter, "t1", "c1", totals(1001n, 202n, 3403n));
}

test("[unhappy-1] empty task and contributor identifiers are refused", async () => {
  await assertRefusedWithoutChanges(report({ taskId: "" }));
  await assertRefusedWithoutChanges(report({ contributorId: "" }));
});

test("[unhappy-1] a negative value in any count is refused without changing totals", async () => {
  for (const field of ["inputTokens", "outputTokens", "costMicroDollars"] as const) {
    await assertRefusedWithoutChanges(report({ [field]: -1 }));
  }
});

test("[unhappy-1] a fractional value in any count is refused without changing totals", async () => {
  for (const field of ["inputTokens", "outputTokens", "costMicroDollars"] as const) {
    await assertRefusedWithoutChanges(report({ [field]: 0.5 }));
  }
});

test("[unhappy-1] nonnumeric and nonfinite counts are refused in every field", async () => {
  for (const field of ["inputTokens", "outputTokens", "costMicroDollars"] as const) {
    for (const value of [NaN, Infinity, -Infinity, "1", undefined, null, true]) {
      const invalid = { ...report(), [field]: value } as unknown as UsageReport;
      await assertRefusedWithoutChanges(invalid);
    }
  }
});

test("[concurrency-1] fifty overlapping reports on one contributor lose no counts", async () => {
  const store = new MemoryStore(true);
  const counter = new UsageCounter(store);
  const pending: Promise<void>[] = [];
  for (let i = 1; i <= 50; i++) {
    pending.push(counter.report(report({ inputTokens: i, outputTokens: 2 * i, costMicroDollars: 3 * i })));
  }
  await Promise.all(pending);
  await assertBoth(counter, "t1", "c1", totals(1275n, 2550n, 3825n));
  await assertBoth(new UsageCounter(store), "t1", "c1", totals(1275n, 2550n, 3825n));
});

test("[concurrency-1] fifty overlapping reports preserve separate contributor sums including zeros", async () => {
  const counter = new UsageCounter(new MemoryStore(true));
  const pending: Promise<void>[] = [];
  const expected = [zero, zero];
  for (let i = 0; i < 50; i++) {
    const slot = i % 2;
    const usage = report({ contributorId: `c${slot + 1}`, inputTokens: i, outputTokens: i % 3, costMicroDollars: i * 7 });
    const previous = expected[slot];
    expected[slot] = totals(previous.inputTokens + BigInt(i), previous.outputTokens + BigInt(i % 3), previous.costMicroDollars + BigInt(i * 7));
    pending.push(counter.report(usage));
  }
  await Promise.all(pending);
  assertTotals(await counter.taskTotals("t1"), totals(1225n, 49n, 8575n));
  assertTotals(await counter.contributorTotals("t1", "c1"), expected[0]);
  assertTotals(await counter.contributorTotals("t1", "c2"), expected[1]);
});

test("[concurrency-1] a report stays pending until its held save has completed", async () => {
  const store = new MemoryStore();
  const counter = new UsageCounter(store);
  const held = store.pauseNextSet();
  let settled = false;
  const pending = counter.report(report()).then(() => { settled = true; });
  try {
    await held.entered;
    // Let promise completion handlers run while the save remains held.
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(settled, false);
  } finally {
    held.release();
  }
  await pending;
  await assertBoth(new UsageCounter(store), "t1", "c1", totals(1000n, 200n, 3400n));
});

test("[concurrency-2] another task finishes while the first task's get is held", async () => {
  const store = new MemoryStore();
  const counter = new UsageCounter(store);
  const held = store.pauseNextGet();
  let firstFinished = false;
  const first = counter.report(report()).then(() => { firstFinished = true; });
  try {
    await held.entered;
    await counter.report(report({ taskId: "t2", inputTokens: 3, outputTokens: 5, costMicroDollars: 7 }));
    assert.equal(firstFinished, false);
    await assertBoth(counter, "t2", "c1", totals(3n, 5n, 7n));
  } finally {
    held.release();
  }
  await first;
  await assertBoth(counter, "t1", "c1", totals(1000n, 200n, 3400n));
});

test("[concurrency-2] another task finishes while the first task's set is held", async () => {
  const store = new MemoryStore();
  const counter = new UsageCounter(store);
  const held = store.pauseNextSet();
  let firstFinished = false;
  const first = counter.report(report()).then(() => { firstFinished = true; });
  try {
    await held.entered;
    await counter.report(report({ taskId: "t2", inputTokens: 0, outputTokens: 0, costMicroDollars: 1 }));
    assert.equal(firstFinished, false);
    await assertBoth(new UsageCounter(store), "t2", "c1", totals(0n, 0n, 1n));
  } finally {
    held.release();
  }
  await first;
  await assertBoth(new UsageCounter(store), "t1", "c1", totals(1000n, 200n, 3400n));
});

test("[recovery-1] a rejected first save counts nothing and a later report succeeds", async () => {
  const store = new MemoryStore();
  const counter = new UsageCounter(store);
  const error = new Error("fixed store failure");
  store.rejectNextSet = error;
  await assert.rejects(async () => { await counter.report(report()); }, (actual: unknown) => actual === error);
  await assertBoth(counter, "t1", "c1", zero);
  await assertBoth(new UsageCounter(store), "t1", "c1", zero);
  await counter.report(report({ inputTokens: 2, outputTokens: 3, costMicroDollars: 5 }));
  await assertBoth(counter, "t1", "c1", totals(2n, 3n, 5n));
  await assertBoth(new UsageCounter(store), "t1", "c1", totals(2n, 3n, 5n));
});

test("[recovery-1] a failed save preserves existing totals and releases the task for later reports", async () => {
  const store = new MemoryStore(true);
  const counter = new UsageCounter(store);
  await counter.report(report());
  const error = new Error("fixed later save failure");
  store.rejectNextSet = error;
  await assert.rejects(async () => {
    await counter.report(report({ contributorId: "c2", inputTokens: 7, outputTokens: 11, costMicroDollars: 13 }));
  }, (actual: unknown) => actual === error);
  for (const reader of [counter, new UsageCounter(store)]) {
    await assertBoth(reader, "t1", "c1", totals(1000n, 200n, 3400n));
    assertTotals(await reader.contributorTotals("t1", "c2"), zero);
  }
  await counter.report(report({ contributorId: "c2", inputTokens: 2, outputTokens: 3, costMicroDollars: 5 }));
  await counter.report(report({ inputTokens: 1, outputTokens: 1, costMicroDollars: 1 }));
  for (const reader of [counter, new UsageCounter(store)]) {
    assertTotals(await reader.taskTotals("t1"), totals(1003n, 204n, 3406n));
    assertTotals(await reader.contributorTotals("t1", "c1"), totals(1001n, 201n, 3401n));
    assertTotals(await reader.contributorTotals("t1", "c2"), totals(2n, 3n, 5n));
  }
});

test("[recovery-2] a fresh counter reads saved task and contributor totals and adds to them", async () => {
  const store = new MemoryStore();
  const first = new UsageCounter(store);
  await first.report(report());
  await first.report(report({ contributorId: "c2", inputTokens: 2, outputTokens: 3, costMicroDollars: 5 }));
  await first.report(report({ taskId: "t2", inputTokens: 7, outputTokens: 11, costMicroDollars: 13 }));
  const restarted = new UsageCounter(store);
  assertTotals(await restarted.taskTotals("t1"), totals(1002n, 203n, 3405n));
  assertTotals(await restarted.contributorTotals("t1", "c1"), totals(1000n, 200n, 3400n));
  assertTotals(await restarted.contributorTotals("t1", "c2"), totals(2n, 3n, 5n));
  await assertBoth(restarted, "t2", "c1", totals(7n, 11n, 13n));
  await restarted.report(report({ inputTokens: 17, outputTokens: 19, costMicroDollars: 23 }));
  const third = new UsageCounter(store);
  assertTotals(await third.taskTotals("t1"), totals(1019n, 222n, 3428n));
  assertTotals(await third.contributorTotals("t1", "c1"), totals(1017n, 219n, 3423n));
  assertTotals(await third.contributorTotals("t1", "c2"), totals(2n, 3n, 5n));
  await assertBoth(third, "t2", "c1", totals(7n, 11n, 13n));
});

test("[recovery-2] totals beyond two to the power 53 remain exact across repeated restarts", async () => {
  const store = new MemoryStore();
  const first = new UsageCounter(store);
  const large = Number.MAX_SAFE_INTEGER;
  await first.report(report({ inputTokens: large, outputTokens: large, costMicroDollars: large }));
  await first.report(report({ inputTokens: 2, outputTokens: 4, costMicroDollars: 6 }));
  const restarted = new UsageCounter(store);
  await assertBoth(restarted, "t1", "c1", totals(BigInt(large) + 2n, BigInt(large) + 4n, BigInt(large) + 6n));
  await restarted.report(report({ inputTokens: 1, outputTokens: 1, costMicroDollars: 1 }));
  await assertBoth(new UsageCounter(store), "t1", "c1", totals(BigInt(large) + 3n, BigInt(large) + 5n, BigInt(large) + 7n));
});

test("[happy-3] task and contributor totals in a new store are zero", async () => {
  const counter = new UsageCounter(new MemoryStore());
  await assertBoth(counter, "unknown-task", "unknown-contributor", zero);
  await assertBoth(counter, "another-task", "another-contributor", zero);
});

test("[happy-3] an unknown pairing stays zero when both identifiers occur elsewhere", async () => {
  const counter = new UsageCounter(new MemoryStore());
  await counter.report(report());
  await counter.report(report({ taskId: "t2", contributorId: "c2" }));
  assertTotals(await counter.taskTotals("t3"), zero);
  assertTotals(await counter.contributorTotals("t1", "c2"), zero);
  assertTotals(await counter.contributorTotals("t2", "c1"), zero);
  assertTotals(await counter.contributorTotals("t1", "c3"), zero);
  assertTotals(await counter.contributorTotals("t3", "c1"), zero);
  await assertBoth(counter, "t1", "c1", totals(1000n, 200n, 3400n));
  await assertBoth(counter, "t2", "c2", totals(1000n, 200n, 3400n));
});
