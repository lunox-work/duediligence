import { test } from "node:test";
import assert from "node:assert/strict";
import { UsageCounter } from "../../src/index.js";
import type { UsageReport, UsageStore, UsageTotals } from "../../src/index.js";

/** Lets `n` rounds of other queued work run. */
async function ticks(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
  }
}

/** An in-memory store that saves copies, as a real store would. */
class MemoryStore implements UsageStore {
  readonly data: Map<string, unknown>;

  constructor(data: Map<string, unknown> = new Map()) {
    this.data = data;
  }

  async get(key: string): Promise<unknown> {
    return this.data.has(key) ? structuredClone(this.data.get(key)) : undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data.set(key, structuredClone(value));
  }

  /** A copy of everything saved so far. */
  snapshot(): Map<string, unknown> {
    return new Map([...this.data].map(([k, v]) => [k, structuredClone(v)] as [string, unknown]));
  }
}

/**
 * A store whose every call resolves only after a varying, deterministic
 * amount of other work has run. A `set` saves when it resolves.
 */
class SlowStore extends MemoryStore {
  private calls = 0;

  private delay(): number {
    this.calls += 1;
    return ((this.calls * 7) % 11) + 1;
  }

  override async get(key: string): Promise<unknown> {
    await ticks(this.delay());
    return super.get(key);
  }

  override async set(key: string, value: unknown): Promise<void> {
    const copy = structuredClone(value);
    await ticks(this.delay());
    await super.set(key, copy);
  }
}

/**
 * A store whose calls wait until the test releases them, until `manual` is
 * turned off. A `get` reads and a `set` saves when released.
 */
class ManualStore extends MemoryStore {
  manual = true;
  readonly pending: Array<() => void> = [];

  override get(key: string): Promise<unknown> {
    if (!this.manual) return super.get(key);
    return new Promise((resolve, reject) => {
      this.pending.push(() => super.get(key).then(resolve, reject));
    });
  }

  override set(key: string, value: unknown): Promise<void> {
    if (!this.manual) return super.set(key, value);
    const copy = structuredClone(value);
    return new Promise((resolve, reject) => {
      this.pending.push(() => super.set(key, copy).then(resolve, reject));
    });
  }

  /** Releases every waiting call and lets later calls resolve straight away. */
  releaseAll(): void {
    this.manual = false;
    for (const run of this.pending.splice(0)) run();
  }
}

/**
 * A store that, while `holding`, keeps every call waiting in `held` until
 * `release()`; otherwise its calls resolve straight away.
 */
class GateStore extends MemoryStore {
  holding = false;
  readonly held: Array<() => void> = [];

  override get(key: string): Promise<unknown> {
    if (!this.holding) return super.get(key);
    return new Promise((resolve, reject) => {
      this.held.push(() => super.get(key).then(resolve, reject));
    });
  }

  override set(key: string, value: unknown): Promise<void> {
    if (!this.holding) return super.set(key, value);
    const copy = structuredClone(value);
    return new Promise((resolve, reject) => {
      this.held.push(() => super.set(key, copy).then(resolve, reject));
    });
  }

  release(): void {
    this.holding = false;
    for (const run of this.held.splice(0)) run();
  }
}

function plain(totals: UsageTotals): UsageTotals {
  return {
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    costMicroDollars: totals.costMicroDollars,
  };
}

function sumOf(reports: UsageReport[]): UsageTotals {
  let inputTokens = 0n;
  let outputTokens = 0n;
  let costMicroDollars = 0n;
  for (const r of reports) {
    inputTokens += BigInt(r.inputTokens);
    outputTokens += BigInt(r.outputTokens);
    costMicroDollars += BigInt(r.costMicroDollars);
  }
  return { inputTokens, outputTokens, costMicroDollars };
}

// Rule: Reports may overlap

test("[concurrency-1] 50 overlapping reports on one task lose nothing", async () => {
  const store = new SlowStore();
  const counter = new UsageCounter(store);
  const reports: UsageReport[] = Array.from({ length: 50 }, (_, i) => ({
    taskId: "t1",
    contributorId: `c${i % 5}`,
    inputTokens: i + 1,
    outputTokens: 2 * (i + 1),
    costMicroDollars: 1000 + i,
  }));

  await Promise.all(reports.map((r) => counter.report(r)));

  assert.deepEqual(plain(await counter.taskTotals("t1")), sumOf(reports));
  for (let c = 0; c < 5; c++) {
    const own = reports.filter((r) => r.contributorId === `c${c}`);
    assert.deepEqual(plain(await counter.contributorTotals("t1", `c${c}`)), sumOf(own));
  }
  const reopened = new UsageCounter(store);
  assert.deepEqual(plain(await reopened.taskTotals("t1")), sumOf(reports));
});

test("[concurrency-1] each overlapping report resolves only once its totals are saved", async () => {
  const store = new SlowStore();
  const counter = new UsageCounter(store);
  // Each report's cost is its own power of two, so a saved total shows which
  // reports it includes.
  const reports: UsageReport[] = Array.from({ length: 50 }, (_, i) => ({
    taskId: "t1",
    contributorId: `c${i % 2}`,
    inputTokens: 1,
    outputTokens: 1,
    costMicroDollars: 2 ** i,
  }));
  const savedWhenResolved: Array<Map<string, unknown>> = [];

  await Promise.all(
    reports.map((r, i) =>
      counter.report(r).then(() => {
        savedWhenResolved[i] = store.snapshot();
      }),
    ),
  );

  for (let i = 0; i < reports.length; i++) {
    const r = reports[i]!;
    const asSaved = new UsageCounter(new MemoryStore(savedWhenResolved[i]));
    const task = await asSaved.taskTotals("t1");
    const contributor = await asSaved.contributorTotals("t1", r.contributorId);
    assert.equal((task.costMicroDollars >> BigInt(i)) & 1n, 1n, `task total saved when report ${i} resolved`);
    assert.equal(
      (contributor.costMicroDollars >> BigInt(i)) & 1n,
      1n,
      `contributor total saved when report ${i} resolved`,
    );
  }
  assert.deepEqual(plain(await counter.taskTotals("t1")), sumOf(reports));
});

test("[concurrency-1] overlapping reports lose nothing when the store resolves waiting calls together, newest first", async () => {
  const store = new ManualStore();
  const counter = new UsageCounter(store);
  const reports: UsageReport[] = Array.from({ length: 50 }, (_, i) => ({
    taskId: "t1",
    contributorId: "c1",
    inputTokens: 3 * i + 1,
    outputTokens: i,
    costMicroDollars: 2 ** i,
  }));

  let finished = false;
  const all = Promise.all(reports.map((r) => counter.report(r))).finally(() => {
    finished = true;
  });
  for (let round = 0; round < 100_000 && !finished; round++) {
    await ticks(3);
    for (const run of store.pending.splice(0).reverse()) run();
  }
  store.releaseAll();
  assert.ok(finished, "all 50 reports settled");
  await all;

  assert.deepEqual(plain(await counter.taskTotals("t1")), sumOf(reports));
  assert.deepEqual(plain(await counter.contributorTotals("t1", "c1")), sumOf(reports));
});

/**
 * Holds the store calls of a report on "t1", then checks a report on "t2"
 * finishes while the one on "t1" is still waiting, and that both count once
 * released.
 */
async function assertTasksIndependent(firstContributor: string, secondContributor: string): Promise<void> {
  const store = new GateStore();
  const counter = new UsageCounter(store);
  await ticks(50);

  const first: UsageReport = {
    taskId: "t1",
    contributorId: firstContributor,
    inputTokens: 10,
    outputTokens: 20,
    costMicroDollars: 30,
  };
  const second: UsageReport = {
    taskId: "t2",
    contributorId: secondContributor,
    inputTokens: 1,
    outputTokens: 2,
    costMicroDollars: 3,
  };

  store.holding = true;
  let firstDone = false;
  const firstReport = counter.report(first).finally(() => {
    firstDone = true;
  });
  for (let i = 0; i < 1000 && store.held.length === 0; i++) {
    await ticks(1);
  }
  assert.ok(store.held.length > 0, "the report on t1 is waiting on a store call");
  await ticks(10);
  store.holding = false;

  let secondDone = false;
  const secondReport = counter.report(second).finally(() => {
    secondDone = true;
  });
  for (let i = 0; i < 10_000 && !secondDone; i++) {
    await ticks(1);
  }
  assert.ok(secondDone, "the report on t2 finished");
  assert.equal(firstDone, false, "the report on t1 is still waiting");
  await secondReport;

  store.release();
  await firstReport;

  assert.deepEqual(plain(await counter.taskTotals("t1")), sumOf([first]));
  assert.deepEqual(plain(await counter.taskTotals("t2")), sumOf([second]));
  assert.deepEqual(plain(await counter.contributorTotals("t1", firstContributor)), sumOf([first]));
  assert.deepEqual(plain(await counter.contributorTotals("t2", secondContributor)), sumOf([second]));
}

test("[concurrency-2] a report on t2 finishes while one on t1 waits on the store", async () => {
  await assertTasksIndependent("c1", "c2");
});

test("[concurrency-2] the same contributor's reports on two tasks do not wait for each other", async () => {
  await assertTasksIndependent("c1", "c1");
});
