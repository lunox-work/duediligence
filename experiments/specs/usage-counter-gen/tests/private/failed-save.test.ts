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

class StoreError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/**
 * An in-memory store that saves copies, as a real store would. A `set`
 * rejects and saves nothing when it is the call numbered `failAt` (counting
 * every `set` from 1), when `failNextSet` holds an error, or while `down`
 * holds one. With `slow`, calls resolve after a varying amount of other work.
 */
class FailingStore implements UsageStore {
  readonly data = new Map<string, unknown>();
  failNextSet: unknown = undefined;
  down: unknown = undefined;
  failAt: { call: number; error: unknown } | undefined;
  setCalls = 0;
  private calls = 0;

  constructor(private readonly slow = false) {}

  private async pause(): Promise<void> {
    this.calls += 1;
    if (this.slow) await ticks(((this.calls * 5) % 13) + 1);
  }

  async get(key: string): Promise<unknown> {
    await this.pause();
    return this.data.has(key) ? structuredClone(this.data.get(key)) : undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    const copy = structuredClone(value);
    this.setCalls += 1;
    let failure: unknown = undefined;
    if (this.failNextSet !== undefined) {
      failure = this.failNextSet;
      this.failNextSet = undefined;
    } else if (this.failAt !== undefined && this.failAt.call === this.setCalls) {
      failure = this.failAt.error;
      this.failAt = undefined;
    } else if (this.down !== undefined) {
      failure = this.down;
    }
    await this.pause();
    if (failure !== undefined) throw failure;
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
 * Checks, as the counter reads them and as a new counter over the store
 * reads them, every task's total and every contributor's total on every
 * task among `tasks` and `contributors` against the reports counted.
 */
async function checkAll(
  store: UsageStore,
  counter: UsageCounter,
  counted: UsageReport[],
  tasks: string[],
  contributors: string[],
): Promise<void> {
  for (const [label, c] of [
    ["counter", counter],
    ["new counter", new UsageCounter(store)],
  ] as Array<[string, UsageCounter]>) {
    for (const t of tasks) {
      assert.deepEqual(
        plain(await c.taskTotals(t)),
        sumOf(counted.filter((r) => r.taskId === t)),
        `${label}: task ${t}`,
      );
      for (const k of contributors) {
        assert.deepEqual(
          plain(await c.contributorTotals(t, k)),
          sumOf(counted.filter((r) => r.taskId === t && r.contributorId === k)),
          `${label}: contributor ${k} on task ${t}`,
        );
      }
    }
  }
}

const TASKS = ["t1", "t2", "t3"];
const CONTRIBUTORS = ["c1", "c2", "c3"];
const SEED = [usage("t1", "c1", 100, 10, 1000), usage("t1", "c2", 200, 20, 2000), usage("t2", "c1", 300, 30, 3000)];

// Rule: A failed save changes nothing

// Extends public "[recovery-1] a report whose save fails rejects with the store's error and
// is not counted": other tasks and contributors, a new contributor, and a new task.
test("[recovery-1] failed saves for new and existing contributors and tasks leave every total as it was", async () => {
  for (const failed of [
    usage("t1", "c2", 7, 7, 7),
    usage("t1", "c3", 8, 8, 8),
    usage("t2", "c2", 9, 9, 9),
    usage("t3", "c1", 10, 10, 10),
  ]) {
    const store = new FailingStore();
    const counter = new UsageCounter(store);
    for (const r of SEED) {
      await counter.report(r);
    }

    const storeError = new StoreError("write refused", "EWRITE");
    store.failNextSet = storeError;
    await assert.rejects(counter.report(failed), (err: unknown) => err === storeError);
    await checkAll(store, counter, SEED, TASKS, CONTRIBUTORS);

    // The same report, made again, counts once.
    await counter.report(failed);
    await checkAll(store, counter, [...SEED, failed], TASKS, CONTRIBUTORS);
  }
});

// Extends public "[recovery-1] a report whose save fails rejects with the store's error and
// is not counted": whichever of a report's saves fails, it counts fully or not at all.
test("[recovery-1] whichever save of a report fails, the report is either rejected with the store's error and not counted, or counted once", async () => {
  for (const slow of [false, true]) {
    for (let k = 1; k <= 6; k++) {
      const store = new FailingStore(slow);
      const counter = new UsageCounter(store);
      for (const r of SEED) {
        await counter.report(r);
      }

      const storeError = new StoreError(`set ${k} failed`, "EIO");
      const report = usage("t1", "c1", 5, 6, 7);
      store.failAt = { call: store.setCalls + k, error: storeError };
      const outcome = await Promise.allSettled([counter.report(report)]);
      store.failAt = undefined;

      const label = `failing set ${k}${slow ? " on a slow store" : ""}`;
      if (outcome[0]!.status === "rejected") {
        assert.equal(outcome[0]!.reason, storeError, `${label}: rejects with the store's error`);
        await checkAll(store, counter, SEED, TASKS, CONTRIBUTORS);
      } else {
        await checkAll(store, counter, [...SEED, report], TASKS, CONTRIBUTORS);
      }

      const after = usage("t1", "c1", 1, 1, 1);
      await counter.report(after);
      const counted = outcome[0]!.status === "rejected" ? [...SEED, after] : [...SEED, report, after];
      await checkAll(store, counter, counted, TASKS, CONTRIBUTORS);
    }
  }
});

// Extends public "[recovery-1] a report whose save fails rejects with the store's error and
// is not counted": several failures in a row, then the store recovers.
test("[recovery-1] while every save fails, each report rejects with the store's error and none counts; after, reports count", async () => {
  const store = new FailingStore();
  const counter = new UsageCounter(store);
  for (const r of SEED) {
    await counter.report(r);
  }

  const storeError = new StoreError("store offline", "EDOWN");
  store.down = storeError;
  for (const r of [usage("t1", "c1", 1, 1, 1), usage("t1", "c3", 2, 2, 2), usage("t2", "c1", 3, 3, 3), usage("t3", "c2", 4, 4, 4)]) {
    await assert.rejects(counter.report(r), (err: unknown) => err === storeError);
  }
  await checkAll(store, counter, SEED, TASKS, CONTRIBUTORS);

  store.down = undefined;
  const after = [usage("t1", "c1", 11, 12, 13), usage("t3", "c3", 14, 15, 16), usage("t2", "c2", 17, 18, 19)];
  for (const r of after) {
    await counter.report(r);
  }
  await checkAll(store, counter, [...SEED, ...after], TASKS, CONTRIBUTORS);
});

// Extends public "[recovery-1] a failed save among overlapping reports counts exactly the
// reports that resolved": several tasks and contributors, a failure partway through.
test("[recovery-1] a save failing partway through overlapping reports on several tasks counts exactly the reports that resolved", async () => {
  for (const failAfter of [0, 5, 17]) {
    const store = new FailingStore(true);
    const counter = new UsageCounter(store);
    for (const r of SEED) {
      await counter.report(r);
    }
    const reports = Array.from({ length: 30 }, (_, i) => usage(`t${(i % 3) + 1}`, `c${((i * 2) % 3) + 1}`, i + 1, 1, 2 ** i));

    const storeError = new StoreError("timeout", "ETIMEDOUT");
    store.failAt = { call: store.setCalls + failAfter + 1, error: storeError };
    const outcomes = await Promise.allSettled(reports.map((r) => counter.report(r)));
    store.failAt = undefined;

    const counted = [...SEED];
    let rejected = 0;
    outcomes.forEach((outcome: PromiseSettledResult<void>, i: number) => {
      if (outcome.status === "fulfilled") {
        counted.push(reports[i]!);
      } else {
        rejected += 1;
        assert.equal(outcome.reason, storeError);
      }
    });
    assert.ok(rejected >= 1, `the report whose save failed rejects (failing after ${failAfter} saves)`);
    await checkAll(store, counter, counted, TASKS, CONTRIBUTORS);

    const after = Array.from({ length: 12 }, (_, i) => usage(`t${(i % 3) + 1}`, `c${(i % 3) + 1}`, 1000, 1000, 2 ** (31 + i)));
    await Promise.all(after.map((r) => counter.report(r)));
    await checkAll(store, counter, [...counted, ...after], TASKS, CONTRIBUTORS);
  }
});

// Extends public "[recovery-1] a report whose save fails rejects with the store's error and
// is not counted": reports made right after it, while it is still in flight, count.
test("[recovery-1] reports on the same task made while a failing report is in flight count normally", async () => {
  const store = new FailingStore(true);
  const counter = new UsageCounter(store);
  for (const r of SEED) {
    await counter.report(r);
  }

  const storeError = new StoreError("conflict", "ECONFLICT");
  store.failNextSet = storeError;
  const failed = usage("t1", "c1", 999, 999, 999);
  const failing = counter.report(failed);
  const after = [usage("t1", "c1", 1, 2, 3), usage("t1", "c2", 4, 5, 6), usage("t1", "c1", 7, 8, 9)];
  const following = after.map((r) => counter.report(r));

  await assert.rejects(failing, (err: unknown) => err === storeError);
  await Promise.all(following);
  await checkAll(store, counter, [...SEED, ...after], TASKS, CONTRIBUTORS);
});

// Extends public "[recovery-1] a report whose save fails rejects with the store's error and
// is not counted": totals past 2^53 stay exact around the failure.
test("[recovery-1] a failed save of a report that would take totals past 2^53 leaves them exact", async () => {
  const store = new FailingStore();
  const counter = new UsageCounter(store);
  const max = Number.MAX_SAFE_INTEGER;
  const before = usage("t1", "c1", max, max, max);
  await counter.report(before);

  const storeError = new StoreError("quota", "EQUOTA");
  store.failNextSet = storeError;
  await assert.rejects(counter.report(usage("t1", "c1", 3, 3, 3)), (err: unknown) => err === storeError);
  await checkAll(store, counter, [before], ["t1"], ["c1"]);

  const after = usage("t1", "c1", 2, 4, 6);
  await counter.report(after);
  await checkAll(store, counter, [before, after], ["t1"], ["c1"]);
  assert.equal((await counter.taskTotals("t1")).inputTokens, 2n ** 53n + 1n);
});
