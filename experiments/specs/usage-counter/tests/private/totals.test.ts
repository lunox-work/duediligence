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
    return ((this.calls * 5) % 13) + 1;
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

/** A deterministic pseudo-random sequence. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
}

function shuffled<T>(items: T[], seed: number): T[] {
  const next = lcg(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
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

const MAX = Number.MAX_SAFE_INTEGER; // 2^53 - 1

// Rule: Totals are exact sums

// Extends public "[happy-1] a report adds to the task's and the contributor's totals".
test("[happy-1] a single report with other ids and values adds each count to its own total", async () => {
  const counter = new UsageCounter(new MemoryStore());

  await counter.report(usage("task-9", "contrib-4", 7, 0, 123456789));

  assert.deepEqual(plain(await counter.taskTotals("task-9")), expected(7n, 0n, 123456789n));
  assert.deepEqual(plain(await counter.contributorTotals("task-9", "contrib-4")), expected(7n, 0n, 123456789n));
});

// Extends public "[happy-1] a report adds to the task's and the contributor's totals".
test("[happy-1] a report with only an output count adds it to output alone", async () => {
  const counter = new UsageCounter(new MemoryStore());

  await counter.report(usage("t1", "c1", 0, 5, 0));
  await counter.report(usage("t1", "c1", 0, 0, 11));

  assert.deepEqual(plain(await counter.taskTotals("t1")), expected(0n, 5n, 11n));
  assert.deepEqual(plain(await counter.contributorTotals("t1", "c1")), expected(0n, 5n, 11n));
});

// Extends public "[happy-1] a second report by the same contributor adds to the first".
test("[happy-1] 300 reports in a row by one contributor add up exactly", async () => {
  const counter = new UsageCounter(new MemoryStore());
  const reports = Array.from({ length: 300 }, (_, i) => usage("t1", "c1", i, 2 * i + 1, i * i));

  for (const r of reports) {
    await counter.report(r);
  }

  assert.deepEqual(plain(await counter.taskTotals("t1")), sumOf(reports));
  assert.deepEqual(plain(await counter.contributorTotals("t1", "c1")), sumOf(reports));
});

// Extends public "[happy-1] a second report by the same contributor adds to the first":
// reads between reports must see each new report, not a total read earlier.
test("[happy-1] totals read between reports include every report resolved so far", async () => {
  const counter = new UsageCounter(new MemoryStore());
  const done: UsageReport[] = [];

  for (let i = 1; i <= 12; i++) {
    const r = usage("t1", "c1", i, 10 * i, 100 * i);
    await counter.report(r);
    done.push(r);
    assert.deepEqual(plain(await counter.taskTotals("t1")), sumOf(done), `task after report ${i}`);
    assert.deepEqual(plain(await counter.contributorTotals("t1", "c1")), sumOf(done), `contributor after report ${i}`);
  }
});

// Extends public "[happy-1] a second report by the same contributor adds to the first".
test("[happy-1] the same report object made three times counts three times", async () => {
  const counter = new UsageCounter(new MemoryStore());
  const r = usage("t1", "c1", 4, 5, 6);

  await counter.report(r);
  await counter.report(r);
  await counter.report(r);

  assert.deepEqual(plain(await counter.taskTotals("t1")), expected(12n, 15n, 18n));
  assert.deepEqual(plain(await counter.contributorTotals("t1", "c1")), expected(12n, 15n, 18n));
});

// Extends public "[happy-2] totals are kept per task and per contributor on that task".
test("[happy-2] 5 tasks and 4 contributors reporting in a shuffled order keep separate totals", async () => {
  const counter = new UsageCounter(new MemoryStore());
  const reports: UsageReport[] = [];
  let n = 0;
  for (let t = 0; t < 5; t++) {
    for (let c = 0; c < 4; c++) {
      // Some contributors make no report on some tasks.
      if ((t + c) % 3 === 0) continue;
      for (let k = 0; k < 3; k++) {
        n += 1;
        reports.push(usage(`task${t}`, `user${c}`, n, n * 3, n * 7 + t));
      }
    }
  }

  for (const r of shuffled(reports, 42)) {
    await counter.report(r);
  }

  await checkAll(counter, reports);
});

// Extends public "[happy-2] totals are kept per task and per contributor on that task".
test("[happy-2] a contributor id that is also a task id keeps its totals apart", async () => {
  const counter = new UsageCounter(new MemoryStore());
  const reports = [
    usage("t1", "t2", 1, 1, 1),
    usage("t2", "t1", 2, 2, 2),
    usage("t2", "t2", 4, 4, 4),
    usage("t1", "t1", 8, 8, 8),
    usage("x", "x", 16, 16, 16),
  ];

  for (const r of reports) {
    await counter.report(r);
  }

  await checkAll(counter, reports);
});

// Extends public "[happy-2] ids that would run together when joined keep separate totals".
test("[happy-2] ids joined with any of many separators keep separate totals", async () => {
  const counter = new UsageCounter(new MemoryStore());
  const separators = [".", "#", "::", "-", "_", " ", ",", "\u0000", "\n", "@", "~", "$", "%", "\\", "\"", "=", "+", "", ":c:", "/c/"];
  const reports: UsageReport[] = [];
  let n = 0;
  for (const sep of separators) {
    reports.push(usage(`a${sep}b`, "c", ++n, n, n));
    reports.push(usage("a", `b${sep}c`, ++n, n, n));
    reports.push(usage(`a${sep}b${sep}c`, "d", ++n, n, n));
    reports.push(usage("a", `b${sep}c${sep}d`, ++n, n, n));
  }
  reports.push(usage("ab", "c", ++n, n, n));
  reports.push(usage("a", "bc", ++n, n, n));
  reports.push(usage("abc", "d", ++n, n, n));

  for (const r of reports) {
    await counter.report(r);
  }

  await checkAll(counter, reports);
});

// Extends public "[happy-2] ids that would run together when joined keep separate totals".
test("[happy-2] ids that name built-in object properties keep their own totals", async () => {
  const counter = new UsageCounter(new MemoryStore());
  const names = ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "prototype", "length"];
  const reports: UsageReport[] = [];
  let n = 0;
  for (const t of names) {
    for (const c of names) {
      if (t === c) continue;
      n += 1;
      reports.push(usage(t, c, n, 2 * n, 3 * n));
    }
  }

  for (const r of reports) {
    await counter.report(r);
  }

  await checkAll(counter, reports);
});

// Extends public "[happy-2] totals are kept per task and per contributor on that task".
test("[happy-2] ids that differ only in case or surrounding spaces are different ids", async () => {
  const counter = new UsageCounter(new MemoryStore());
  const reports = [
    usage("t1", "c1", 1, 1, 1),
    usage("T1", "c1", 2, 2, 2),
    usage("t1 ", "c1", 4, 4, 4),
    usage(" t1", "c1", 8, 8, 8),
    usage("t1", "C1", 16, 16, 16),
    usage("t1", " c1", 32, 32, 32),
    usage(" ", " ", 64, 64, 64),
    usage("é", "ü", 128, 128, 128),
  ];

  for (const r of reports) {
    await counter.report(r);
  }

  await checkAll(counter, reports);
});

// Extends public "[happy-2] totals are kept per task and per contributor on that task".
test("[happy-2] long ids keep separate totals", async () => {
  const counter = new UsageCounter(new MemoryStore());
  const long = "t".repeat(5000);
  const reports = [
    usage(long, "c".repeat(5000), 3, 4, 5),
    usage(`${long}x`, "c".repeat(5000), 6, 7, 8),
    usage(long, `${"c".repeat(4999)}d`, 9, 10, 11),
  ];

  for (const r of reports) {
    await counter.report(r);
  }

  await checkAll(counter, reports);
});

// Extends public "[boundary-1] totals well past 2^53 are exact": past 2^64 as well.
test("[boundary-1] totals past 2 to the power 64 are exact", async () => {
  const counter = new UsageCounter(new MemoryStore());
  const count = 2050;

  for (let i = 0; i < count; i++) {
    await counter.report(usage("t1", "c1", MAX, MAX - 1, MAX - 2));
  }

  const n = BigInt(count);
  const want = expected(n * BigInt(MAX), n * BigInt(MAX - 1), n * BigInt(MAX - 2));
  assert.ok(want.inputTokens > 2n ** 64n);
  assert.deepEqual(plain(await counter.taskTotals("t1")), want);
  assert.deepEqual(plain(await counter.contributorTotals("t1", "c1")), want);
});

// Extends public "[boundary-1] totals well past 2^53 are exact": whole counts that
// are themselves past 2^53 are still whole numbers of at least 0.
test("[boundary-1] whole counts larger than 2^53 are added exactly", async () => {
  const counter = new UsageCounter(new MemoryStore());

  await counter.report(usage("t1", "c1", 2 ** 60, 2 ** 70, 1e21));
  await counter.report(usage("t1", "c1", 1, 3, 7));

  const want = expected(2n ** 60n + 1n, 2n ** 70n + 3n, 10n ** 21n + 7n);
  assert.deepEqual(plain(await counter.taskTotals("t1")), want);
  assert.deepEqual(plain(await counter.contributorTotals("t1", "c1")), want);
});

// Extends public "[boundary-1] totals just past 2^53 are exact to the unit".
test("[boundary-1] odd totals past 2^54 are exact to the unit for tasks and contributors", async () => {
  const counter = new UsageCounter(new MemoryStore());
  const reports = [
    usage("t1", "c1", MAX, MAX, MAX),
    usage("t1", "c2", MAX, 1, MAX),
    usage("t1", "c1", MAX, MAX, 1),
    usage("t2", "c1", MAX, 3, 5),
    usage("t1", "c2", 3, MAX, 1),
    usage("t2", "c1", MAX, MAX, MAX),
    usage("t1", "c1", 5, 1, MAX),
  ];

  for (const r of reports) {
    await counter.report(r);
  }

  await checkAll(counter, reports);
  // Spot check one value a double cannot hold.
  assert.equal((await counter.taskTotals("t1")).inputTokens, 3n * BigInt(MAX) + 8n);
});

// Extends public "[boundary-1] totals well past 2^53 are exact": large reports overlapping.
test("[boundary-1] large overlapping reports on a slow store total exactly", async () => {
  const store = new SlowStore();
  const counter = new UsageCounter(store);
  const reports = Array.from({ length: 24 }, (_, i) => usage("t1", `c${i % 3}`, MAX - i, MAX - 2 * i, i % 2 === 0 ? MAX : i));

  await Promise.all(reports.map((r) => counter.report(r)));

  await checkAll(counter, reports);
  await checkAll(new UsageCounter(store), reports);
});
