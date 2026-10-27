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

/**
 * An in-memory store that saves copies, as a real store would. When
 * `failNextSet` is given an error, the next `set` rejects with it and saves
 * nothing. With `slow`, calls resolve after a varying amount of other work.
 */
class FailingStore implements UsageStore {
  readonly data = new Map<string, unknown>();
  failNextSet: Error | undefined;
  private calls = 0;

  constructor(private readonly slow = false) {}

  private async pause(): Promise<void> {
    this.calls += 1;
    if (this.slow) await ticks(((this.calls * 7) % 11) + 1);
  }

  async get(key: string): Promise<unknown> {
    await this.pause();
    return this.data.has(key) ? structuredClone(this.data.get(key)) : undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    const copy = structuredClone(value);
    const failure = this.failNextSet;
    this.failNextSet = undefined;
    await this.pause();
    if (failure) throw failure;
    this.data.set(key, copy);
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

function usage(
  taskId: string,
  contributorId: string,
  inputTokens: number,
  outputTokens: number,
  costMicroDollars: number,
): UsageReport {
  return { taskId, contributorId, inputTokens, outputTokens, costMicroDollars };
}

/** Checks the totals as the counter reads them and as a new counter over the store reads them. */
async function assertTotals(
  store: UsageStore,
  counter: UsageCounter,
  taskId: string,
  contributorId: string,
  want: UsageTotals,
): Promise<void> {
  const reopened = new UsageCounter(store);
  for (const c of [counter, reopened]) {
    assert.deepEqual(plain(await c.taskTotals(taskId)), want);
    assert.deepEqual(plain(await c.contributorTotals(taskId, contributorId)), want);
  }
}

// Rule: A failed save changes nothing

test("[recovery-1] a report whose save fails rejects with the store's error and is not counted", async () => {
  const store = new FailingStore();
  const counter = new UsageCounter(store);
  const before = usage("t1", "c1", 100, 10, 1000);
  const failed = usage("t1", "c1", 7, 7, 7);
  const after = usage("t1", "c1", 1, 2, 3);
  await counter.report(before);

  const storeError = new Error("disk full");
  store.failNextSet = storeError;
  await assert.rejects(counter.report(failed), (err: unknown) => err === storeError);

  await assertTotals(store, counter, "t1", "c1", sumOf([before]));

  await counter.report(after);
  await assertTotals(store, counter, "t1", "c1", sumOf([before, after]));
});

test("[recovery-1] a failed save as the very first report leaves every total at 0", async () => {
  const store = new FailingStore();
  const counter = new UsageCounter(store);
  const failed = usage("t1", "c1", 5, 6, 7);
  const after = usage("t1", "c1", 11, 12, 13);

  const storeError = new Error("unavailable");
  store.failNextSet = storeError;
  await assert.rejects(counter.report(failed), (err: unknown) => err === storeError);

  await assertTotals(store, counter, "t1", "c1", { inputTokens: 0n, outputTokens: 0n, costMicroDollars: 0n });

  await counter.report(after);
  await assertTotals(store, counter, "t1", "c1", sumOf([after]));
});

test("[recovery-1] a failed save among overlapping reports counts exactly the reports that resolved", async () => {
  const store = new FailingStore(true);
  const counter = new UsageCounter(store);
  // Each report's cost is its own power of two, so the total shows which were counted.
  const reports = Array.from({ length: 10 }, (_, i) => usage("t1", "c1", i + 1, 1, 2 ** i));

  const storeError = new Error("timeout");
  store.failNextSet = storeError;
  const outcomes = await Promise.allSettled(reports.map((r) => counter.report(r)));

  const counted: UsageReport[] = [];
  let rejected = 0;
  outcomes.forEach((outcome: PromiseSettledResult<void>, i: number) => {
    if (outcome.status === "fulfilled") {
      counted.push(reports[i]!);
    } else {
      rejected += 1;
      assert.equal(outcome.reason, storeError);
    }
  });
  assert.ok(rejected >= 1, "the report whose save failed rejects");

  await assertTotals(store, counter, "t1", "c1", sumOf(counted));

  const after = usage("t1", "c1", 1000, 1000, 2 ** 20);
  await counter.report(after);
  await assertTotals(store, counter, "t1", "c1", sumOf([...counted, after]));
});
