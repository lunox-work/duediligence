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

const ZERO = expected(0n, 0n, 0n);

// Rule: Totals survive a restart

test("[recovery-2] a new counter over the same store reads the same totals and adds to them", async () => {
  const store = new MemoryStore();
  const first = new UsageCounter(store);
  await first.report(usage("t1", "c1", 10, 1, 100));
  await first.report(usage("t1", "c2", 20, 2, 200));
  await first.report(usage("t2", "c1", 40, 4, 400));

  const second = new UsageCounter(store);
  assert.deepEqual(plain(await second.taskTotals("t1")), expected(30n, 3n, 300n));
  assert.deepEqual(plain(await second.taskTotals("t2")), expected(40n, 4n, 400n));
  assert.deepEqual(plain(await second.contributorTotals("t1", "c1")), expected(10n, 1n, 100n));
  assert.deepEqual(plain(await second.contributorTotals("t1", "c2")), expected(20n, 2n, 200n));
  assert.deepEqual(plain(await second.contributorTotals("t2", "c1")), expected(40n, 4n, 400n));

  await second.report(usage("t1", "c1", 5, 5, 5));
  assert.deepEqual(plain(await second.taskTotals("t1")), expected(35n, 8n, 305n));
  assert.deepEqual(plain(await second.contributorTotals("t1", "c1")), expected(15n, 6n, 105n));
  assert.deepEqual(plain(await second.contributorTotals("t1", "c2")), expected(20n, 2n, 200n));
});

test("[recovery-2] totals past 2^53 survive a restart exactly", async () => {
  const store = new MemoryStore();
  const first = new UsageCounter(store);
  const max = Number.MAX_SAFE_INTEGER;
  await first.report(usage("t1", "c1", max, max, max));
  await first.report(usage("t1", "c1", 2, 2, 2));

  const big = 2n ** 53n + 1n;
  const second = new UsageCounter(store);
  assert.deepEqual(plain(await second.taskTotals("t1")), expected(big, big, big));
  assert.deepEqual(plain(await second.contributorTotals("t1", "c1")), expected(big, big, big));

  await second.report(usage("t1", "c1", 1, 1, 1));
  const third = new UsageCounter(store);
  assert.deepEqual(plain(await third.taskTotals("t1")), expected(big + 1n, big + 1n, big + 1n));
  assert.deepEqual(plain(await third.contributorTotals("t1", "c1")), expected(big + 1n, big + 1n, big + 1n));
});

test("[happy-3] totals on a new store read as zero", async () => {
  const counter = new UsageCounter(new MemoryStore());

  assert.deepEqual(plain(await counter.taskTotals("t1")), ZERO);
  assert.deepEqual(plain(await counter.contributorTotals("t1", "c1")), ZERO);
});

test("[happy-3] totals with no reports read as zero beside totals that have some", async () => {
  const store = new MemoryStore();
  const counter = new UsageCounter(store);
  await counter.report(usage("t1", "c1", 10, 20, 30));

  for (const c of [counter, new UsageCounter(store)]) {
    // A contributor with no reports on a task that has some.
    assert.deepEqual(plain(await c.contributorTotals("t1", "c2")), ZERO);
    // A contributor with reports, on a task they did not report on.
    assert.deepEqual(plain(await c.contributorTotals("t2", "c1")), ZERO);
    // A task with no reports while another has some.
    assert.deepEqual(plain(await c.taskTotals("t2")), ZERO);
  }
});
