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
  readonly data = new Map<string, unknown>();

  async get(key: string): Promise<unknown> {
    return this.data.has(key) ? structuredClone(this.data.get(key)) : undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data.set(key, structuredClone(value));
  }
}

/** A store whose calls resolve after a varying, deterministic amount of other work. */
class SlowStore extends MemoryStore {
  private calls = 0;

  private delay(): number {
    this.calls += 1;
    return ((this.calls * 3) % 7) + 1;
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

function plain(totals: UsageTotals): UsageTotals {
  return {
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    costMicroDollars: totals.costMicroDollars,
  };
}

function expected(inputTokens: bigint, outputTokens: bigint, costMicroDollars: bigint): UsageTotals {
  return { inputTokens, outputTokens, costMicroDollars };
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

const ZERO = expected(0n, 0n, 0n);

// Rule: Totals survive a restart

// Extends public "[recovery-2] a new counter over the same store reads the same totals and
// adds to them": more tasks and contributors, overlapping reports, a slow store.
test("[recovery-2] a new counter over a slow store reads every total and adds overlapping reports to them", async () => {
  const store = new SlowStore();
  const first = new UsageCounter(store);
  const earlier = Array.from({ length: 40 }, (_, i) => usage(`t${i % 4}`, `c${i % 5}`, i + 1, 2 * i, 3 * i + 7));
  await Promise.all(earlier.map((r) => first.report(r)));

  const second = new UsageCounter(store);
  await checkAll(second, earlier);

  const later = Array.from({ length: 30 }, (_, i) => usage(`t${(i + 1) % 5}`, `c${i % 3}`, 100 + i, i, 1));
  await Promise.all(later.map((r) => second.report(r)));
  await checkAll(second, [...earlier, ...later]);

  await checkAll(new UsageCounter(store), [...earlier, ...later]);
});

// Extends public "[recovery-2] a new counter over the same store reads the same totals and
// adds to them": the new counter reports before it reads anything.
test("[recovery-2] a new counter's first report, made before any read, adds to the saved totals", async () => {
  const store = new MemoryStore();
  const first = new UsageCounter(store);
  const earlier = [usage("t1", "c1", 10, 1, 100), usage("t1", "c2", 20, 2, 200), usage("t2", "c1", 40, 4, 400)];
  for (const r of earlier) {
    await first.report(r);
  }

  const second = new UsageCounter(store);
  const later = [usage("t1", "c1", 5, 5, 5), usage("t2", "c2", 6, 6, 6)];
  for (const r of later) {
    await second.report(r);
  }

  await checkAll(second, [...earlier, ...later]);
  await checkAll(new UsageCounter(store), [...earlier, ...later]);
});

// Extends public "[recovery-2] a new counter over the same store reads the same totals and
// adds to them": many restarts in a row.
test("[recovery-2] totals carry through a chain of eight restarts", async () => {
  const store = new MemoryStore();
  const done: UsageReport[] = [];

  for (let i = 0; i < 8; i++) {
    const counter = new UsageCounter(store);
    await checkAll(counter, done);
    const r = usage("t1", `c${i % 3}`, i + 1, 10 * (i + 1), 100 * (i + 1));
    await counter.report(r);
    done.push(r);
  }

  await checkAll(new UsageCounter(store), done);
});

// Extends public "[recovery-2] totals past 2^53 survive a restart exactly": past 2^64.
test("[recovery-2] totals past 2^64 survive a restart exactly", async () => {
  const store = new MemoryStore();
  const first = new UsageCounter(store);
  const max = Number.MAX_SAFE_INTEGER;
  for (let i = 0; i < 2050; i++) {
    await first.report(usage("t1", "c1", max, 1, max));
  }

  const want = expected(2050n * BigInt(max), 2050n, 2050n * BigInt(max));
  const second = new UsageCounter(store);
  assert.deepEqual(plain(await second.taskTotals("t1")), want);
  assert.deepEqual(plain(await second.contributorTotals("t1", "c1")), want);

  await second.report(usage("t1", "c2", 1, 1, 1));
  const third = new UsageCounter(store);
  assert.deepEqual(plain(await third.taskTotals("t1")), expected(want.inputTokens + 1n, 2051n, want.costMicroDollars + 1n));
  assert.deepEqual(plain(await third.contributorTotals("t1", "c1")), want);
  assert.deepEqual(plain(await third.contributorTotals("t1", "c2")), expected(1n, 1n, 1n));
});

// Rule: Totals survive a restart (unknown totals)

// Extends public "[happy-3] totals on a new store read as zero": ids that name built-in
// object properties.
test("[happy-3] tasks and contributors named like built-in object properties read as zero", async () => {
  const names = ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "prototype", "length", "then"];
  const store = new MemoryStore();
  const counter = new UsageCounter(store);

  for (const n of names) {
    assert.deepEqual(plain(await counter.taskTotals(n)), ZERO, `task ${n}`);
    assert.deepEqual(plain(await counter.contributorTotals(n, n)), ZERO, `contributor ${n} on task ${n}`);
    assert.deepEqual(plain(await counter.contributorTotals("t1", n)), ZERO, `contributor ${n} on t1`);
  }

  await counter.report(usage("t1", "c1", 1, 2, 3));
  for (const c of [counter, new UsageCounter(store)]) {
    for (const n of names) {
      assert.deepEqual(plain(await c.taskTotals(n)), ZERO, `task ${n}`);
      assert.deepEqual(plain(await c.contributorTotals("t1", n)), ZERO, `contributor ${n} on t1`);
      assert.deepEqual(plain(await c.contributorTotals(n, "c1")), ZERO, `contributor c1 on ${n}`);
    }
  }
});

// Extends public "[happy-3] totals with no reports read as zero beside totals that have some":
// ids next to ones that have reports.
test("[happy-3] ids next to ones with reports read as zero", async () => {
  const store = new MemoryStore();
  const counter = new UsageCounter(store);
  await counter.report(usage("t1", "c1", 10, 20, 30));
  await counter.report(usage("t1:c1", "x", 1, 1, 1));

  for (const c of [counter, new UsageCounter(store)]) {
    for (const t of ["t", "t11", "T1", " t1", "t1 ", "t1c1", "t1/c1", "c1", "x"]) {
      assert.deepEqual(plain(await c.taskTotals(t)), ZERO, `task ${JSON.stringify(t)}`);
    }
    for (const [t, k] of [
      ["t1", "c"],
      ["t1", "c11"],
      ["t1", "C1"],
      ["t1", "c1 "],
      ["t", "1c1"],
      ["t1:", "c1"],
      ["t1", ":c1"],
      ["t1", "x"],
      ["t1:c1", "c1"],
      ["c1", "t1"],
    ] as Array<[string, string]>) {
      assert.deepEqual(plain(await c.contributorTotals(t, k)), ZERO, `contributor ${JSON.stringify(k)} on ${JSON.stringify(t)}`);
    }
  }
});

// Extends public "[happy-3] totals on a new store read as zero": many unknown ids, on a slow store.
test("[happy-3] fifty unknown tasks and contributors read as zero on a slow store", async () => {
  const counter = new UsageCounter(new SlowStore());

  const reads = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      i % 2 === 0 ? counter.taskTotals(`task-${i}`) : counter.contributorTotals(`task-${i}`, `user-${i}`),
    ),
  );

  for (const totals of reads) {
    assert.deepEqual(plain(totals), ZERO);
  }
});

// Extends public "[happy-3] totals on a new store read as zero": a read of zero must not hide a
// later report.
test("[happy-1] a report adds to totals that were read as zero before it", async () => {
  const store = new MemoryStore();
  const counter = new UsageCounter(store);
  assert.deepEqual(plain(await counter.taskTotals("t1")), ZERO);
  assert.deepEqual(plain(await counter.contributorTotals("t1", "c1")), ZERO);

  await counter.report(usage("t1", "c1", 4, 5, 6));

  assert.deepEqual(plain(await counter.taskTotals("t1")), expected(4n, 5n, 6n));
  assert.deepEqual(plain(await counter.contributorTotals("t1", "c1")), expected(4n, 5n, 6n));
});
