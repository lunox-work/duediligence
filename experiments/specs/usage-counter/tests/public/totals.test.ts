import { test } from "node:test";
import assert from "node:assert/strict";
import { UsageCounter } from "../../src/index.js";
import type { UsageReport, UsageStore, UsageTotals } from "../../src/index.js";

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

const MAX = Number.MAX_SAFE_INTEGER; // 2^53 - 1

// Rule: Totals are exact sums

test("[happy-1] a report adds to the task's and the contributor's totals", async () => {
  const counter = new UsageCounter(new MemoryStore());

  await counter.report(usage("t1", "c1", 1000, 200, 3400));

  assert.deepEqual(plain(await counter.taskTotals("t1")), expected(1000n, 200n, 3400n));
  assert.deepEqual(plain(await counter.contributorTotals("t1", "c1")), expected(1000n, 200n, 3400n));
});

test("[happy-1] a report whose counts are all 0 is accepted and totals 0", async () => {
  const counter = new UsageCounter(new MemoryStore());

  await counter.report(usage("t1", "c1", 0, 0, 0));

  assert.deepEqual(plain(await counter.taskTotals("t1")), expected(0n, 0n, 0n));
  assert.deepEqual(plain(await counter.contributorTotals("t1", "c1")), expected(0n, 0n, 0n));
});

test("[happy-1] a second report by the same contributor adds to the first", async () => {
  const counter = new UsageCounter(new MemoryStore());

  await counter.report(usage("t1", "c1", 1000, 200, 3400));
  await counter.report(usage("t1", "c1", 1, 2, 3));

  assert.deepEqual(plain(await counter.taskTotals("t1")), expected(1001n, 202n, 3403n));
  assert.deepEqual(plain(await counter.contributorTotals("t1", "c1")), expected(1001n, 202n, 3403n));
});

test("[happy-2] totals are kept per task and per contributor on that task", async () => {
  const counter = new UsageCounter(new MemoryStore());

  await counter.report(usage("t1", "c1", 10, 1, 100));
  await counter.report(usage("t1", "c2", 20, 2, 200));
  await counter.report(usage("t2", "c1", 40, 4, 400));
  await counter.report(usage("t1", "c1", 80, 8, 800));

  assert.deepEqual(plain(await counter.taskTotals("t1")), expected(110n, 11n, 1100n));
  assert.deepEqual(plain(await counter.taskTotals("t2")), expected(40n, 4n, 400n));
  assert.deepEqual(plain(await counter.contributorTotals("t1", "c1")), expected(90n, 9n, 900n));
  assert.deepEqual(plain(await counter.contributorTotals("t1", "c2")), expected(20n, 2n, 200n));
  assert.deepEqual(plain(await counter.contributorTotals("t2", "c1")), expected(40n, 4n, 400n));
  assert.deepEqual(plain(await counter.contributorTotals("t2", "c2")), expected(0n, 0n, 0n));
});

test("[happy-2] ids that would run together when joined keep separate totals", async () => {
  const counter = new UsageCounter(new MemoryStore());
  const reports = [
    usage("a:b", "c", 1, 1, 1),
    usage("a", "b:c", 2, 2, 2),
    usage("a/b", "c", 4, 4, 4),
    usage("a", "b/c", 8, 8, 8),
    usage("a|b", "c", 16, 16, 16),
    usage("a", "b|c", 32, 32, 32),
    usage("t1", "c1", 64, 64, 64),
    usage("t1:c1", "x", 128, 128, 128),
    usage("t1/c1", "x", 256, 256, 256),
  ];

  for (const r of reports) {
    await counter.report(r);
  }

  for (const r of reports) {
    const n = BigInt(r.inputTokens);
    assert.deepEqual(plain(await counter.contributorTotals(r.taskId, r.contributorId)), expected(n, n, n));
  }
  assert.deepEqual(plain(await counter.taskTotals("a")), expected(42n, 42n, 42n));
  assert.deepEqual(plain(await counter.taskTotals("a:b")), expected(1n, 1n, 1n));
  assert.deepEqual(plain(await counter.taskTotals("a/b")), expected(4n, 4n, 4n));
  assert.deepEqual(plain(await counter.taskTotals("a|b")), expected(16n, 16n, 16n));
  assert.deepEqual(plain(await counter.taskTotals("t1")), expected(64n, 64n, 64n));
  assert.deepEqual(plain(await counter.taskTotals("t1:c1")), expected(128n, 128n, 128n));
  assert.deepEqual(plain(await counter.taskTotals("t1/c1")), expected(256n, 256n, 256n));
});

test("[boundary-1] totals well past 2^53 are exact", async () => {
  const counter = new UsageCounter(new MemoryStore());

  for (let i = 0; i < 3; i++) {
    await counter.report(usage("t1", "c1", MAX, MAX, MAX));
  }

  const sum = 3n * BigInt(MAX); // 27021597764222973, not representable as a double
  assert.deepEqual(plain(await counter.taskTotals("t1")), expected(sum, sum, sum));
  assert.deepEqual(plain(await counter.contributorTotals("t1", "c1")), expected(sum, sum, sum));
});

test("[boundary-1] totals just past 2^53 are exact to the unit", async () => {
  const counter = new UsageCounter(new MemoryStore());

  await counter.report(usage("t1", "c1", MAX, MAX, MAX));
  await counter.report(usage("t1", "c1", 2, 1, 3));

  const twoTo53 = 2n ** 53n;
  const want = expected(twoTo53 + 1n, twoTo53, twoTo53 + 2n);
  assert.deepEqual(plain(await counter.taskTotals("t1")), want);
  assert.deepEqual(plain(await counter.contributorTotals("t1", "c1")), want);
});

/**
 * Counts a valid report, then makes `bad` and checks it rejects with an
 * error and leaves the totals, as read by the counter and by a new counter
 * over the same store, as they were.
 */
async function assertRefused(bad: UsageReport): Promise<void> {
  const store = new MemoryStore();
  const counter = new UsageCounter(store);
  await counter.report(usage("t1", "c1", 1000, 200, 3400));
  const before = expected(1000n, 200n, 3400n);

  await assert.rejects(counter.report(bad), (err: unknown) => err instanceof Error);

  assert.deepEqual(plain(await counter.taskTotals("t1")), before);
  assert.deepEqual(plain(await counter.contributorTotals("t1", "c1")), before);
  const reopened = new UsageCounter(store);
  assert.deepEqual(plain(await reopened.taskTotals("t1")), before);
  assert.deepEqual(plain(await reopened.contributorTotals("t1", "c1")), before);
}

test("[unhappy-1] a report with an empty task id is refused", async () => {
  await assertRefused(usage("", "c1", 1, 1, 1));
});

test("[unhappy-1] a report with an empty contributor id is refused", async () => {
  await assertRefused(usage("t1", "", 1, 1, 1));
});

test("[unhappy-1] a report with a negative count is refused", async () => {
  await assertRefused(usage("t1", "c1", 1, -1, 1));
});

test("[unhappy-1] a report with a fractional count is refused", async () => {
  await assertRefused(usage("t1", "c1", 1, 1, 0.5));
});

test("[unhappy-1] a report with a NaN count is refused", async () => {
  await assertRefused(usage("t1", "c1", Number.NaN, 1, 1));
});

test("[unhappy-1] a report with a count that is a string is refused", async () => {
  await assertRefused(usage("t1", "c1", "5" as unknown as number, 1, 1));
});

test("[unhappy-1] one bad count among valid ones changes no total at all", async () => {
  // Only the cost is malformed; the valid token counts must not be counted either.
  await assertRefused(usage("t1", "c1", 500, 50, -0.5));
});

test("[unhappy-1] a refused report does not stop later reports from counting", async () => {
  const counter = new UsageCounter(new MemoryStore());

  await assert.rejects(counter.report(usage("t1", "c1", -5, 1, 1)), (err: unknown) => err instanceof Error);
  await counter.report(usage("t1", "c1", 7, 8, 9));

  assert.deepEqual(plain(await counter.taskTotals("t1")), expected(7n, 8n, 9n));
  assert.deepEqual(plain(await counter.contributorTotals("t1", "c1")), expected(7n, 8n, 9n));
});
