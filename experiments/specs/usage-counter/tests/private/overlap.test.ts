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

/** Lets every piece of work already queued run, timers and I/O callbacks included. */
function macro(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
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

/** A store whose calls resolve after a varying, deterministic amount of other work. */
class SlowStore extends MemoryStore {
  private calls = 0;

  private delay(): number {
    this.calls += 1;
    return (this.calls * 13) % 17;
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
 * A store that keeps calls waiting in `pending` while `holdGets` or
 * `holdSets` is on, until the test runs them. A `get` reads and a `set`
 * saves when run.
 */
class HeldStore extends MemoryStore {
  holdGets = false;
  holdSets = false;
  readonly pending: Array<() => void> = [];

  override get(key: string): Promise<unknown> {
    if (!this.holdGets) return super.get(key);
    return new Promise((resolve, reject) => {
      this.pending.push(() => super.get(key).then(resolve, reject));
    });
  }

  override set(key: string, value: unknown): Promise<void> {
    if (!this.holdSets) return super.set(key, value);
    const copy = structuredClone(value);
    return new Promise((resolve, reject) => {
      this.pending.push(() => super.set(key, copy).then(resolve, reject));
    });
  }

  /** Runs every waiting call and lets later calls resolve straight away. */
  releaseAll(): void {
    this.holdGets = false;
    this.holdSets = false;
    for (const run of this.pending.splice(0)) run();
  }
}

function plain(totals: UsageTotals): UsageTotals {
  return {
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    costMicroDollars: totals.costMicroDollars,
  };
}

function usage(
  taskId: string,
  contributorId: string,
  inputTokens: number,
  outputTokens: number,
  costMicroDollars: number,
): UsageReport {
  return { taskId, contributorId, inputTokens, outputTokens, costMicroDollars };
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

/** A deterministic pseudo-random sequence. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
}

/**
 * Checks every task's total and every contributor's total on every task
 * (zero where they have no reports there) against the reports.
 */
async function checkAll(counter: UsageCounter, reports: UsageReport[]): Promise<void> {
  const tasks = [...new Set(reports.map((r) => r.taskId))];
  const contributors = [...new Set(reports.map((r) => r.contributorId))];
  for (const t of tasks) {
    assert.deepEqual(
      plain(await counter.taskTotals(t)),
      sumOf(reports.filter((r) => r.taskId === t)),
      `task ${JSON.stringify(t)}`,
    );
    for (const c of contributors) {
      assert.deepEqual(
        plain(await counter.contributorTotals(t, c)),
        sumOf(reports.filter((r) => r.taskId === t && r.contributorId === c)),
        `contributor ${JSON.stringify(c)} on task ${JSON.stringify(t)}`,
      );
    }
  }
}

/**
 * Runs the store's waiting calls one at a time, in an order picked by
 * `seed`, until `isDone()`; then lets everything else run.
 */
async function releaseShuffled(store: HeldStore, seed: number, isDone: () => boolean): Promise<void> {
  const next = lcg(seed);
  for (let round = 0; round < 200_000 && !isDone(); round++) {
    await ticks(3);
    if (store.pending.length === 0) {
      await macro();
      continue;
    }
    const [run] = store.pending.splice(next() % store.pending.length, 1);
    run!();
  }
  store.releaseAll();
}

// Rule: Reports may overlap

// Extends public "[concurrency-1] 50 overlapping reports on one task lose nothing":
// more reports, more tasks, more contributors, another store timing.
test("[concurrency-1] 200 overlapping reports over 4 tasks and 6 contributors lose nothing", async () => {
  const store = new SlowStore();
  const counter = new UsageCounter(store);
  const reports = Array.from({ length: 200 }, (_, i) =>
    usage(`t${(i * 7) % 4}`, `c${(i * 5) % 6}`, i + 1, (i % 9) * 3, 1000 * i + 1),
  );

  await Promise.all(reports.map((r) => counter.report(r)));

  await checkAll(counter, reports);
  await checkAll(new UsageCounter(store), reports);
});

// Extends public "[concurrency-1] overlapping reports lose nothing when the store resolves
// waiting calls together, newest first": calls resolve one at a time in shuffled orders.
test("[concurrency-1] overlapping reports lose nothing when the store resolves calls one at a time in shuffled orders", async () => {
  for (const seed of [1, 2, 3, 99]) {
    const store = new HeldStore();
    const counter = new UsageCounter(store);
    await macro();
    const reports = Array.from({ length: 50 }, (_, i) => usage("t1", `c${i % 3}`, 3 * i + 1, i, 2 ** i));

    store.holdGets = true;
    store.holdSets = true;
    let finished = false;
    const all = Promise.all(reports.map((r) => counter.report(r))).then(() => {
      finished = true;
    });
    await releaseShuffled(store, seed, () => finished);
    await all;

    await checkAll(counter, reports);
    await checkAll(new UsageCounter(store), reports);
  }
});

// Extends public "[concurrency-1] each overlapping report resolves only once its totals
// are saved": saves held back, several tasks and contributors, saves released in a shuffled order.
test("[concurrency-1] no report resolves while its saves wait, and each resolves with its own totals saved", async () => {
  const store = new HeldStore();
  const counter = new UsageCounter(store);
  await macro();
  const reports = Array.from({ length: 36 }, (_, i) => usage(`t${(i % 2) + 1}`, `c${(i % 3) + 1}`, 1, 1, 2 ** i));
  const savedWhenResolved: Array<Map<string, unknown>> = [];
  let resolved = 0;

  store.holdSets = true;
  const all = Promise.all(
    reports.map((r, i) =>
      counter.report(r).then(() => {
        resolved += 1;
        savedWhenResolved[i] = store.snapshot();
      }),
    ),
  );
  for (let i = 0; i < 50; i++) {
    await macro();
  }
  const resolvedWhileWaiting = resolved;

  await releaseShuffled(store, 5, () => resolved === reports.length);
  await all;

  assert.equal(resolvedWhileWaiting, 0, "no report resolves while every save waits");

  for (let i = 0; i < reports.length; i++) {
    const r = reports[i]!;
    const asSaved = new UsageCounter(new MemoryStore(savedWhenResolved[i]));
    const task = await asSaved.taskTotals(r.taskId);
    const contributor = await asSaved.contributorTotals(r.taskId, r.contributorId);
    assert.equal((task.costMicroDollars >> BigInt(i)) & 1n, 1n, `task total saved when report ${i} resolved`);
    assert.equal(
      (contributor.costMicroDollars >> BigInt(i)) & 1n,
      1n,
      `contributor total saved when report ${i} resolved`,
    );
  }
  await checkAll(counter, reports);
  await checkAll(new UsageCounter(store), reports);
});

// Extends public "[concurrency-1] 50 overlapping reports on one task lose nothing":
// reports made in waves while earlier ones are still waiting on the store.
test("[concurrency-1] reports made in waves while earlier ones are in flight lose nothing", async () => {
  const store = new SlowStore();
  const counter = new UsageCounter(store);
  const reports: UsageReport[] = [];
  const promises: Array<Promise<void>> = [];

  for (let wave = 0; wave < 6; wave++) {
    for (let k = 0; k < 12; k++) {
      const i = wave * 12 + k;
      const r = usage(k % 3 === 0 ? "t2" : "t1", `c${i % 4}`, i + 1, wave, 7 * i);
      reports.push(r);
      promises.push(counter.report(r));
    }
    await ticks(wave * 4 + 1);
  }
  await Promise.all(promises);

  await checkAll(counter, reports);
  await checkAll(new UsageCounter(store), reports);
});

// Extends public "[concurrency-1] 50 overlapping reports on one task lose nothing".
test("[concurrency-1] the same report object made 50 times at once counts 50 times", async () => {
  const store = new SlowStore();
  const counter = new UsageCounter(store);
  const r = usage("t1", "c1", 3, 5, 7);

  await Promise.all(Array.from({ length: 50 }, () => counter.report(r)));

  const want: UsageTotals = { inputTokens: 150n, outputTokens: 250n, costMicroDollars: 350n };
  assert.deepEqual(plain(await counter.taskTotals("t1")), want);
  assert.deepEqual(plain(await counter.contributorTotals("t1", "c1")), want);
  assert.deepEqual(plain(await new UsageCounter(store).taskTotals("t1")), want);
});

// Extends public "[concurrency-1] 50 overlapping reports on one task lose nothing":
// the first reports a new counter makes over a store that already holds totals.
test("[concurrency-1] overlapping first reports on a new counter over saved totals lose nothing", async () => {
  const store = new SlowStore();
  const earlier = [usage("t1", "c1", 100, 100, 100), usage("t1", "c2", 50, 50, 50), usage("t2", "c1", 9, 9, 9)];
  const first = new UsageCounter(store);
  for (const r of earlier) {
    await first.report(r);
  }

  const counter = new UsageCounter(store);
  const later = Array.from({ length: 50 }, (_, i) => usage(i % 5 === 0 ? "t2" : "t1", `c${(i % 3) + 1}`, i, i + 1, i + 2));
  await Promise.all(later.map((r) => counter.report(r)));

  await checkAll(counter, [...earlier, ...later]);
  await checkAll(new UsageCounter(store), [...earlier, ...later]);
});

/**
 * Counts `warm`, then holds the store calls of the `held` reports (every
 * call, or only `set`s), then checks every `free` report finishes while the
 * held ones still wait, and that all count once released.
 */
async function assertFreeFinish(options: {
  setsOnly: boolean;
  warm: UsageReport[];
  held: UsageReport[];
  free: UsageReport[];
}): Promise<void> {
  const store = new HeldStore();
  const counter = new UsageCounter(store);
  for (const r of options.warm) {
    await counter.report(r);
  }
  await macro();

  store.holdSets = true;
  store.holdGets = !options.setsOnly;
  // Release the held calls even if a check fails, so nothing is left waiting.
  try {
    let heldDone = 0;
    const heldReports = options.held.map((r) =>
      counter.report(r).finally(() => {
        heldDone += 1;
      }),
    );
    for (let i = 0; i < 1000 && store.pending.length === 0; i++) {
      await macro();
    }
    assert.ok(store.pending.length > 0, "the held reports wait on a store call");
    for (let i = 0; i < 20; i++) {
      await macro();
    }
    store.holdSets = false;
    store.holdGets = false;

    let freeDone = 0;
    const freeReports = options.free.map((r) =>
      counter.report(r).finally(() => {
        freeDone += 1;
      }),
    );
    for (let i = 0; i < 2000 && freeDone < options.free.length; i++) {
      await macro();
    }
    assert.equal(freeDone, options.free.length, "every report on another task finished");
    assert.equal(heldDone, 0, "the held reports are still waiting");
    await Promise.all(freeReports);

    store.releaseAll();
    await Promise.all(heldReports);
  } finally {
    store.releaseAll();
  }

  const all = [...options.warm, ...options.held, ...options.free];
  await checkAll(counter, all);
  await checkAll(new UsageCounter(store), all);
}

// Extends public "[concurrency-2] a report on t2 finishes while one on t1 waits on the store":
// only the save of the report on t1 is held.
test("[concurrency-2] a report on t2 finishes while the save of one on t1 waits", async () => {
  await assertFreeFinish({
    setsOnly: true,
    warm: [],
    held: [usage("t1", "c1", 10, 20, 30)],
    free: [usage("t2", "c2", 1, 2, 3)],
  });
});

// Extends public "[concurrency-2] the same contributor's reports on two tasks do not wait
// for each other": more tasks, and contributors named like tasks.
test("[concurrency-2] reports on five other tasks finish while one on t1 waits", async () => {
  await assertFreeFinish({
    setsOnly: false,
    warm: [],
    held: [usage("t1", "c1", 10, 20, 30)],
    free: [
      usage("t2", "c1", 1, 2, 3),
      usage("t3", "c2", 4, 5, 6),
      usage("t4", "t1", 7, 8, 9),
      usage("t5", "c1", 10, 11, 12),
      usage("t6", "c3", 13, 14, 15),
    ],
  });
});

// Extends public "[concurrency-2] a report on t2 finishes while one on t1 waits on the store":
// several reports queued on t1 and several made on t2.
test("[concurrency-2] reports on t2 finish while several overlapping reports on t1 wait", async () => {
  await assertFreeFinish({
    setsOnly: true,
    warm: [],
    held: Array.from({ length: 6 }, (_, i) => usage("t1", `c${i % 2}`, i + 1, 1, 2 ** i)),
    free: Array.from({ length: 6 }, (_, i) => usage("t2", `c${i % 2}`, i + 10, 2, 3 ** i)),
  });
});

// Extends public "[concurrency-2] a report on t2 finishes while one on t1 waits on the store":
// both tasks already have totals when the report on t1 is held.
test("[concurrency-2] with totals already on both tasks, a report on t2 finishes while one on t1 waits", async () => {
  const warm = [usage("t1", "c1", 5, 5, 5), usage("t2", "c1", 6, 6, 6), usage("t2", "c2", 7, 7, 7), usage("t1", "c2", 8, 8, 8)];
  await assertFreeFinish({ setsOnly: false, warm, held: [usage("t1", "c1", 10, 20, 30)], free: [usage("t2", "c1", 1, 2, 3)] });
  await assertFreeFinish({ setsOnly: true, warm, held: [usage("t1", "c2", 10, 20, 30)], free: [usage("t2", "c2", 1, 2, 3)] });
});

// Extends public "[concurrency-2] a report on t2 finishes while one on t1 waits on the store":
// the other order of ids.
test("[concurrency-2] a report on task a finishes while one on task b waits", async () => {
  await assertFreeFinish({
    setsOnly: false,
    warm: [usage("a", "x", 1, 1, 1)],
    held: [usage("b", "x", 10, 20, 30)],
    free: [usage("a", "x", 1, 2, 3), usage("a", "y", 4, 5, 6)],
  });
});
