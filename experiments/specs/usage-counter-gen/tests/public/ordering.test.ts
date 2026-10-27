import { test } from "node:test";
import assert from "node:assert/strict";
import { UsageCounter } from "../../src/index.js";
import type { UsageReport, UsageStore, UsageTotals } from "../../src/index.js";

// ---- Test support (copied into each public test file) ----

type Op = "get" | "set";

interface Held {
  op: Op;
  key: string;
  value: unknown;
  release(): void;
  fail(error: unknown): void;
}

/** Waits one turn of the event loop; every pending microtask runs first. */
const nextTurn = (): Promise<void> => new Promise<void>((resolve) => setImmediate(resolve));

/** Lets every call that is not held by the store run as far as it can. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await nextTurn();
}

/**
 * The store "S" of the Background: keeps values in memory by key and records
 * every call. Tests can make a numbered call reject, hold calls until they
 * release them, or delay calls by a fixed number of event-loop turns.
 */
class MemoryStore implements UsageStore {
  readonly data = new Map<string, unknown>();
  readonly gets: string[] = [];
  readonly sets: { key: string; value: unknown }[] = [];
  readonly held: Held[] = [];
  /** 1-based call numbers whose get or set rejects with the given error. */
  readonly failGet = new Map<number, unknown>();
  readonly failSet = new Map<number, unknown>();
  hold: (op: Op, key: string) => boolean = () => false;
  delay: (op: Op, call: number) => number = () => 0;

  async get(key: string): Promise<unknown> {
    this.gets.push(key);
    const call = this.gets.length;
    await this.pause("get", key, undefined, call);
    if (this.failGet.has(call)) throw this.failGet.get(call);
    return this.data.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.sets.push({ key, value });
    const call = this.sets.length;
    await this.pause("set", key, value, call);
    if (this.failSet.has(call)) throw this.failSet.get(call);
    this.data.set(key, value);
  }

  failNextGet(error: unknown): void {
    this.failGet.set(this.gets.length + 1, error);
  }

  failNextSet(error: unknown): void {
    this.failSet.set(this.sets.length + 1, error);
  }

  /** Removes and returns the oldest held call of kind `op`. */
  take(op: Op): Held {
    const index = this.held.findIndex((h) => h.op === op);
    assert.ok(index >= 0, `expected a held ${op} call`);
    return this.held.splice(index, 1)[0]!;
  }

  private async pause(op: Op, key: string, value: unknown, call: number): Promise<void> {
    for (let turns = this.delay(op, call); turns > 0; turns--) await nextTurn();
    if (!this.hold(op, key)) return;
    await new Promise<void>((resolve, reject) => {
      this.held.push({ op, key, value, release: resolve, fail: reject });
    });
  }
}

function setup(): { store: MemoryStore; counter: UsageCounter } {
  const store = new MemoryStore();
  return { store, counter: new UsageCounter(store) };
}

function r(
  taskId: string,
  contributorId: string,
  inputTokens: number,
  outputTokens = 0,
  costMicroDollars = 0,
): UsageReport {
  return { taskId, contributorId, inputTokens, outputTokens, costMicroDollars };
}

function t(inputTokens: bigint, outputTokens: bigint, costMicroDollars: bigint): UsageTotals {
  return { inputTokens, outputTokens, costMicroDollars };
}

const ZERO = t(0n, 0n, 0n);

async function assertTotals(actual: Promise<UsageTotals>, expected: UsageTotals): Promise<void> {
  assert.deepStrictEqual({ ...(await actual) }, expected);
}

function track(promise: Promise<unknown>): { settled: boolean } {
  const state = { settled: false };
  promise.then(
    () => {
      state.settled = true;
    },
    () => {
      state.settled = true;
    },
  );
  return state;
}

function errorWith(kind: new (...args: any[]) => Error, text: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof kind && error.message.includes(text);
}

// ---- Tests ----

// Rule: Calls on the same task run one at a time in call order; calls on different tasks do not wait for each other

/** A fixed, uneven pattern of 0 to 5 event-loop turns standing in for random store latency. */
const uneven = (op: Op, call: number): number => (call * 7 + (op === "set" ? 3 : 0)) % 6;

test("[concurrency-1] overlapping reports on one task are all counted", async () => {
  const { store, counter } = setup();
  store.delay = uneven;
  const calls: Promise<void>[] = [];
  for (let i = 0; i < 100; i++) calls.push(counter.report(r("t1", "alice", 1, 2, 3)));
  await Promise.all(calls);
  await assertTotals(counter.taskTotals("t1"), t(100n, 200n, 300n));
  await assertTotals(counter.contributorTotals("t1", "alice"), t(100n, 200n, 300n));
});

test("[concurrency-1] overlapping reports by interleaved contributors are each saved once and all counted", async () => {
  const { store, counter } = setup();
  store.delay = uneven;
  const calls: Promise<void>[] = [];
  for (let i = 0; i < 60; i++) {
    calls.push(i % 2 === 0 ? counter.report(r("t1", "alice", 1, 0, 2)) : counter.report(r("t1", "bob", 10, 1, 0)));
  }
  await Promise.all(calls);
  assert.equal(store.gets.length, 60);
  assert.equal(store.sets.length, 60);
  await assertTotals(counter.taskTotals("t1"), t(330n, 30n, 60n));
  await assertTotals(counter.contributorTotals("t1", "alice"), t(30n, 0n, 60n));
  await assertTotals(counter.contributorTotals("t1", "bob"), t(300n, 30n, 0n));
});

test("[concurrency-2] a second report on the same task waits for the first to be saved", async () => {
  const { store, counter } = setup();
  store.hold = (op) => op === "set";
  const first = counter.report(r("t1", "alice", 1));
  const second = counter.report(r("t1", "bob", 2));
  const firstState = track(first);
  const secondState = track(second);
  await settle();
  assert.equal(store.gets.length, 1);
  assert.equal(store.sets.length, 1);
  assert.equal((store.sets[0]!.value as { inputTokens: string }).inputTokens, "1");
  assert.equal(firstState.settled, false);
  assert.equal(secondState.settled, false);

  store.take("set").release();
  await first;
  await settle();
  assert.equal(store.gets.length, 2);
  assert.equal(store.sets.length, 2);
  assert.equal((store.sets[1]!.value as { inputTokens: string }).inputTokens, "3");

  store.take("set").release();
  await second;
  await assertTotals(counter.taskTotals("t1"), t(3n, 0n, 0n));
});

test("[concurrency-2] a second report on the same task does not read the store while the first's read is pending", async () => {
  const { store, counter } = setup();
  store.hold = (op) => op === "get";
  const first = counter.report(r("t1", "alice", 1));
  const second = counter.report(r("t1", "bob", 2));
  const secondState = track(second);
  await settle();
  assert.equal(store.gets.length, 1);
  assert.equal(store.sets.length, 0);

  store.take("get").release();
  await first;
  await settle();
  assert.equal(store.gets.length, 2);
  assert.equal(secondState.settled, false);

  store.hold = () => false;
  store.take("get").release();
  await second;
  await assertTotals(counter.taskTotals("t1"), t(3n, 0n, 0n));
});

test("[concurrency-3] reports on different tasks do not wait for each other", async () => {
  const { store, counter } = setup();
  store.hold = (op, key) => op === "set" && key === "usage:slow";
  const held = counter.report(r("slow", "alice", 1));
  const heldState = track(held);
  const fast = counter.report(r("fast", "alice", 2));
  const fastState = track(fast);
  await settle();
  assert.equal(fastState.settled, true);
  await fast;
  const query = counter.taskTotals("fast");
  const queryState = track(query);
  await settle();
  assert.equal(queryState.settled, true);
  await assertTotals(query, t(2n, 0n, 0n));
  assert.equal(heldState.settled, false);

  store.take("set").release();
  await held;
  await assertTotals(counter.taskTotals("slow"), t(1n, 0n, 0n));
});

test("[concurrency-3] a query on a task whose read is pending does not hold up another task", async () => {
  const { store, counter } = setup();
  store.hold = (op, key) => op === "get" && key === "usage:slow";
  const slowQuery = counter.taskTotals("slow");
  const slowState = track(slowQuery);
  const fast = counter.report(r("fast", "alice", 2));
  const fastQuery = counter.contributorTotals("fast", "alice");
  const fastState = track(fastQuery);
  await settle();
  assert.equal(fastState.settled, true);
  await fast;
  await assertTotals(fastQuery, t(2n, 0n, 0n));
  assert.equal(slowState.settled, false);

  store.take("get").release();
  await assertTotals(slowQuery, ZERO);
});

test("[concurrency-4] a query made while a report on its task is pending waits for it to be saved", async () => {
  const { store, counter } = setup();
  store.hold = (op) => op === "set";
  const pending = counter.report(r("t1", "alice", 5));
  const query = counter.taskTotals("t1");
  const queryState = track(query);
  await settle();
  assert.equal(queryState.settled, false);

  store.take("set").release();
  await pending;
  await assertTotals(query, t(5n, 0n, 0n));
});

test("[concurrency-4] a query made while a report on its task is pending waits for it to fail", async () => {
  const { store, counter } = setup();
  store.hold = (op) => op === "set";
  const pending = counter.report(r("t1", "alice", 5));
  const pendingState = track(pending);
  const query = counter.taskTotals("t1");
  const queryState = track(query);
  await settle();
  assert.equal(queryState.settled, false);

  const boom = new Error("boom");
  store.take("set").fail(boom);
  await assert.rejects(pending, (error: unknown) => error === boom);
  assert.equal(pendingState.settled, true);
  await assertTotals(query, ZERO);
});

test("[concurrency-4] a query between two pending reports reflects only the report called before it", async () => {
  const { store, counter } = setup();
  store.hold = (op) => op === "set";
  const before = counter.report(r("t1", "alice", 5));
  const query = counter.contributorTotals("t1", "alice");
  const after = counter.report(r("t1", "alice", 7));
  const queryState = track(query);
  await settle();
  assert.equal(queryState.settled, false);
  assert.equal(store.sets.length, 1);

  store.take("set").release();
  await before;
  await assertTotals(query, t(5n, 0n, 0n));

  await settle();
  store.take("set").release();
  await after;
  await assertTotals(counter.contributorTotals("t1", "alice"), t(12n, 0n, 0n));
});

test("[concurrency-5] a failure in the middle of overlapping reports affects only that report", async () => {
  const { store, counter } = setup();
  const boom = new Error("boom");
  store.failSet.set(2, boom);
  const results = await Promise.allSettled([
    counter.report(r("t1", "alice", 1)),
    counter.report(r("t1", "alice", 10)),
    counter.report(r("t1", "alice", 100)),
  ]);
  assert.equal(results[0]!.status, "fulfilled");
  assert.equal(results[1]!.status === "rejected" && results[1].reason === boom, true);
  assert.equal(results[2]!.status, "fulfilled");
  await assertTotals(counter.taskTotals("t1"), t(101n, 0n, 0n));
});

test("[concurrency-5] a failure of the first of overlapping reports does not block the later ones", async () => {
  const { store, counter } = setup();
  const boom = new Error("boom");
  store.failSet.set(1, boom);
  store.delay = uneven;
  const results = await Promise.allSettled([
    counter.report(r("t1", "alice", 1)),
    counter.report(r("t1", "alice", 10)),
    counter.report(r("t1", "alice", 100)),
  ]);
  assert.equal(results[0]!.status === "rejected" && results[0].reason === boom, true);
  assert.equal(results[1]!.status, "fulfilled");
  assert.equal(results[2]!.status, "fulfilled");
  await assertTotals(counter.taskTotals("t1"), t(110n, 0n, 0n));
});

test("[concurrency-6] an invalid report does not join the queue", async () => {
  const { store, counter } = setup();
  store.hold = (op) => op === "set";
  const pending = counter.report(r("t1", "alice", 1));
  const pendingState = track(pending);
  const invalid = counter.report(r("t1", "alice", -1));
  const invalidState = track(invalid);
  await settle();
  assert.equal(invalidState.settled, true);
  await assert.rejects(invalid, (error: unknown) => error instanceof RangeError);
  assert.equal(pendingState.settled, false);

  store.take("set").release();
  await pending;
});

test("[concurrency-6] invalid reports and queries on a task with a pending report reject at once without reading the store", async () => {
  const { store, counter } = setup();
  store.hold = (op) => op === "set";
  const pending = counter.report(r("t1", "alice", 1));
  const pendingState = track(pending);
  await settle();
  const invalid = [
    counter.report({ ...r("t1", "alice", 1), inputTokens: "1" } as unknown as UsageReport),
    counter.contributorTotals("t1", ""),
    counter.taskTotals(""),
  ];
  const states = invalid.map(track);
  await settle();
  assert.deepStrictEqual(states.map((s) => s.settled), [true, true, true]);
  await assert.rejects(invalid[0]!, errorWith(TypeError, "inputTokens"));
  await assert.rejects(invalid[1]!, errorWith(RangeError, "contributorId"));
  await assert.rejects(invalid[2]!, errorWith(RangeError, "taskId"));
  assert.equal(store.gets.length, 1);
  assert.equal(pendingState.settled, false);

  store.take("set").release();
  await pending;
  await assertTotals(counter.taskTotals("t1"), t(1n, 0n, 0n));
});
