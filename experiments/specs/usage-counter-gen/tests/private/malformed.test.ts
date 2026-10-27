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
 * Checks every task's total and every contributor's total on every task
 * among `tasks` and `contributors` against the reports counted.
 */
async function checkAll(
  counter: UsageCounter,
  counted: UsageReport[],
  tasks: string[],
  contributors: string[],
): Promise<void> {
  for (const t of tasks) {
    assert.deepEqual(
      plain(await counter.taskTotals(t)),
      sumOf(counted.filter((r) => r.taskId === t)),
      `task ${JSON.stringify(t)}`,
    );
    for (const c of contributors) {
      assert.deepEqual(
        plain(await counter.contributorTotals(t, c)),
        sumOf(counted.filter((r) => r.taskId === t && r.contributorId === c)),
        `contributor ${JSON.stringify(c)} on task ${JSON.stringify(t)}`,
      );
    }
  }
}

const SEED = [usage("t1", "c1", 1000, 200, 3400), usage("t1", "c2", 10, 20, 30), usage("t2", "c1", 7, 8, 9)];
const TASKS = ["t1", "t2", "t3"];
const CONTRIBUTORS = ["c1", "c2", "c3"];
const FIELDS = ["inputTokens", "outputTokens", "costMicroDollars"] as const;

function isRefusal(err: unknown): boolean {
  return err instanceof Error;
}

/**
 * Counts the seed reports, then makes each bad report and checks it rejects
 * with an error and leaves every total, as the counter and a new counter
 * over the same store read it, as it was.
 */
async function assertAllRefused(bad: UsageReport[]): Promise<void> {
  const store = new MemoryStore();
  const counter = new UsageCounter(store);
  for (const r of SEED) {
    await counter.report(r);
  }

  for (const b of bad) {
    await assert.rejects(counter.report(b), isRefusal, `report ${String(JSON.stringify(b))} is refused`);
  }

  await checkAll(counter, SEED, TASKS, CONTRIBUTORS);
  await checkAll(new UsageCounter(store), SEED, TASKS, CONTRIBUTORS);
}

/** A valid report on `taskId` by `contributorId` with `field` replaced by `value`. */
function withBad(taskId: string, contributorId: string, field: (typeof FIELDS)[number], value: unknown): UsageReport {
  const r = usage(taskId, contributorId, 5, 6, 7);
  (r as unknown as Record<string, unknown>)[field] = value;
  return r;
}

function badInEveryField(values: unknown[]): UsageReport[] {
  const out: UsageReport[] = [];
  for (const field of FIELDS) {
    for (const value of values) {
      out.push(withBad("t1", "c1", field, value));
      out.push(withBad("t3", "c3", field, value));
    }
  }
  return out;
}

// Rule: Totals are exact sums

// Extends public "[unhappy-1] a report with a negative count is refused" (output only).
test("[unhappy-1] a negative count in any field is refused and changes no total", async () => {
  await assertAllRefused(badInEveryField([-1, -1000000, -Number.MAX_SAFE_INTEGER, -(2 ** 60)]));
});

// Extends public "[unhappy-1] a report with a fractional count is refused" (cost only).
test("[unhappy-1] a fractional count in any field is refused and changes no total", async () => {
  await assertAllRefused(badInEveryField([0.5, 1.5, 2.000001, 1e-9, 4503599627370495.5, Number.MIN_VALUE]));
});

// Extends public "[unhappy-1] a report with a NaN count is refused" (input only).
test("[unhappy-1] a NaN count in any field is refused and changes no total", async () => {
  await assertAllRefused(badInEveryField([Number.NaN]));
});

// Infinity is a number but not a whole number.
test("[unhappy-1] an infinite count in any field is refused and changes no total", async () => {
  await assertAllRefused(badInEveryField([Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]));
});

// Extends public "[unhappy-1] a report with a count that is a string is refused":
// values that convert to a whole number but are not numbers.
test("[unhappy-1] a count that is not a number in any field is refused, even if it converts to one", async () => {
  await assertAllRefused(badInEveryField(["5", "0", " 7 ", "", "1e3", true, false, null, undefined, [5], [], {}]));
});

// Extends public "[unhappy-1] a report with a count that is a string is refused".
test("[unhappy-1] a report missing a count is refused and changes no total", async () => {
  const missing: UsageReport[] = [];
  for (const field of FIELDS) {
    const r = usage("t1", "c1", 5, 6, 7) as unknown as Record<string, unknown>;
    delete r[field];
    missing.push(r as unknown as UsageReport);
  }
  await assertAllRefused(missing);
});

// Extends public "[unhappy-1] a report with an empty task id is refused" and
// "[unhappy-1] a report with an empty contributor id is refused".
test("[unhappy-1] a report with an empty id is refused whatever its counts", async () => {
  await assertAllRefused([
    usage("", "c1", 1000, 200, 3400),
    usage("", "c3", 0, 0, 0),
    usage("t1", "", 1000, 200, 3400),
    usage("t3", "", 1, 2, 3),
    usage("", "", 1, 2, 3),
    usage("t2", "", Number.MAX_SAFE_INTEGER, 1, 1),
  ]);
});

// Extends public "[unhappy-1] one bad count among valid ones changes no total at all".
test("[unhappy-1] one bad count among large valid ones changes no total, for any field", async () => {
  const big = Number.MAX_SAFE_INTEGER;
  await assertAllRefused([
    usage("t1", "c1", -1, big, big),
    usage("t1", "c1", big, -1, big),
    usage("t1", "c1", big, big, -1),
    usage("t1", "c2", 0.25, big, big),
    usage("t1", "c2", big, 0.25, big),
    usage("t1", "c2", big, big, 0.25),
  ]);
});

// Extends public "[unhappy-1] a refused report does not stop later reports from counting".
test("[unhappy-1] a refused first report leaves a new store at zero, and later reports count", async () => {
  const store = new MemoryStore();
  const counter = new UsageCounter(store);

  await assert.rejects(counter.report(usage("t1", "c1", 3, 3, 0.5)), isRefusal);
  await checkAll(counter, [], ["t1"], ["c1"]);
  await checkAll(new UsageCounter(store), [], ["t1"], ["c1"]);

  const later = [usage("t1", "c1", 4, 5, 6), usage("t1", "c2", 1, 1, 1)];
  for (const r of later) {
    await counter.report(r);
  }
  await checkAll(counter, later, ["t1"], ["c1", "c2"]);
  await checkAll(new UsageCounter(store), later, ["t1"], ["c1", "c2"]);
});

// Extends public "[unhappy-1] a refused report does not stop later reports from counting":
// refused reports made among overlapping valid ones.
test("[unhappy-1] refused reports made among overlapping valid ones count nothing, and the valid ones all count", async () => {
  const store = new SlowStore();
  const counter = new UsageCounter(store);
  const good: UsageReport[] = [];
  const bad: UsageReport[] = [];
  const all: UsageReport[] = [];
  const badValues: unknown[] = [-3, 0.5, Number.NaN, "9", null, Number.POSITIVE_INFINITY];
  for (let i = 0; i < 40; i++) {
    const t = `t${(i % 2) + 1}`;
    const c = `c${(i % 3) + 1}`;
    if (i % 4 === 3) {
      const r = withBad(t, c, FIELDS[i % 3]!, badValues[i % badValues.length]);
      bad.push(r);
      all.push(r);
    } else {
      const r = usage(t, c, i + 1, 2 * i, 2 ** (i % 30));
      good.push(r);
      all.push(r);
    }
    if (i === 10) all.push(usage("", "c1", 100, 100, 100));
    if (i === 20) all.push(usage("t1", "", 100, 100, 100));
  }
  bad.push(all.find((r) => r.taskId === "")!, all.find((r) => r.contributorId === "")!);

  const outcomes = await Promise.allSettled(all.map((r) => counter.report(r)));

  outcomes.forEach((outcome: PromiseSettledResult<void>, i: number) => {
    const r = all[i]!;
    if (good.includes(r)) {
      assert.equal(outcome.status, "fulfilled", `valid report ${i} resolves`);
    } else {
      assert.equal(outcome.status, "rejected", `malformed report ${i} is refused`);
      assert.ok(isRefusal((outcome as PromiseRejectedResult).reason));
    }
  });

  await checkAll(counter, good, TASKS, CONTRIBUTORS);
  await checkAll(new UsageCounter(store), good, TASKS, CONTRIBUTORS);
});
