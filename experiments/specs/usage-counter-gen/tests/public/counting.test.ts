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

const MAX = 9007199254740991;

// Rule: A report adds its counts to its task's totals and to its contributor's totals on that task

test("[happy-1] a single report is counted for its task and its contributor", async () => {
  const { counter } = setup();
  await counter.report(r("t1", "alice", 100, 20, 350));
  await assertTotals(counter.taskTotals("t1"), t(100n, 20n, 350n));
  await assertTotals(counter.contributorTotals("t1", "alice"), t(100n, 20n, 350n));
});

test("[happy-1] a single report counts for no other task or contributor", async () => {
  const { counter } = setup();
  await counter.report(r("t1", "alice", 100, 20, 350));
  await assertTotals(counter.contributorTotals("t1", "bob"), ZERO);
  await assertTotals(counter.taskTotals("t2"), ZERO);
  await assertTotals(counter.contributorTotals("t2", "alice"), ZERO);
});

test("[happy-2] task totals sum every contributor, contributor totals only their own reports", async () => {
  const { counter } = setup();
  await counter.report(r("t1", "alice", 100, 20, 350));
  await counter.report(r("t1", "bob", 40, 5, 90));
  await counter.report(r("t1", "alice", 1, 2, 3));
  await counter.report(r("t2", "alice", 7, 0, 11));
  await assertTotals(counter.taskTotals("t1"), t(141n, 27n, 443n));
  await assertTotals(counter.contributorTotals("t1", "alice"), t(101n, 22n, 353n));
  await assertTotals(counter.contributorTotals("t1", "bob"), t(40n, 5n, 90n));
  await assertTotals(counter.taskTotals("t2"), t(7n, 0n, 11n));
  await assertTotals(counter.contributorTotals("t2", "alice"), t(7n, 0n, 11n));
  await assertTotals(counter.contributorTotals("t2", "bob"), ZERO);
});

test("[happy-2] a contributor id equal to a task id is still only a contributor on its own task", async () => {
  const { counter } = setup();
  await counter.report(r("t1", "t1", 5, 1, 1));
  await counter.report(r("t1", "t2", 3, 0, 0));
  await counter.report(r("t2", "t1", 2, 0, 0));
  await assertTotals(counter.taskTotals("t1"), t(8n, 1n, 1n));
  await assertTotals(counter.contributorTotals("t1", "t1"), t(5n, 1n, 1n));
  await assertTotals(counter.contributorTotals("t1", "t2"), t(3n, 0n, 0n));
  await assertTotals(counter.taskTotals("t2"), t(2n, 0n, 0n));
  await assertTotals(counter.contributorTotals("t2", "t1"), t(2n, 0n, 0n));
  await assertTotals(counter.contributorTotals("t2", "t2"), ZERO);
});

test("[happy-3] the same report made twice is counted twice", async () => {
  const { counter } = setup();
  await counter.report(r("t1", "alice", 5, 1, 2));
  await counter.report(r("t1", "alice", 5, 1, 2));
  await assertTotals(counter.taskTotals("t1"), t(10n, 2n, 4n));
});

test("[happy-3] the same report object made three times is saved and counted each time", async () => {
  const { store, counter } = setup();
  const same = r("t1", "alice", 5, 1, 2);
  await counter.report(same);
  await counter.report(same);
  await counter.report(same);
  assert.equal(store.sets.length, 3);
  await assertTotals(counter.taskTotals("t1"), t(15n, 3n, 6n));
  await assertTotals(counter.contributorTotals("t1", "alice"), t(15n, 3n, 6n));
});

test("[boundary-1] a report of all zeros is accepted and saved", async () => {
  const { store, counter } = setup();
  await counter.report(r("t1", "alice", 0, 0, 0));
  assert.equal(store.sets.length, 1);
  await assertTotals(counter.contributorTotals("t1", "alice"), ZERO);
});

test("[boundary-1] an all-zero report saves a record of \"0\" counts that lists its contributor", async () => {
  const { store, counter } = setup();
  await counter.report(r("t1", "alice", 0, 0, 0));
  assert.equal(store.sets.length, 1);
  assert.equal(store.sets[0]!.key, "usage:t1");
  assert.deepStrictEqual(store.data.get("usage:t1"), {
    inputTokens: "0",
    outputTokens: "0",
    costMicroDollars: "0",
    contributors: [{ contributorId: "alice", inputTokens: "0", outputTokens: "0", costMicroDollars: "0" }],
  });
  await assertTotals(counter.taskTotals("t1"), ZERO);
});

test("[boundary-2] ids are matched exactly, case- and whitespace-sensitively", async () => {
  const { counter } = setup();
  await counter.report(r("t1", "alice", 1, 1, 1));
  await assertTotals(counter.taskTotals("t1"), t(1n, 1n, 1n));
  await assertTotals(counter.taskTotals("T1"), ZERO);
  await assertTotals(counter.taskTotals(" t1"), ZERO);
  await assertTotals(counter.contributorTotals("t1", "Alice"), ZERO);
  await assertTotals(counter.contributorTotals("t1", "alice "), ZERO);
});

test("[boundary-2] ids differing only in Unicode composition or kind of whitespace stay distinct", async () => {
  const { counter } = setup();
  await counter.report(r("café", "a\tb", 1, 1, 1));
  await assertTotals(counter.taskTotals("café"), t(1n, 1n, 1n));
  await assertTotals(counter.contributorTotals("café", "a\tb"), t(1n, 1n, 1n));
  await assertTotals(counter.taskTotals("café"), ZERO);
  await assertTotals(counter.contributorTotals("café", "a b"), ZERO);
});

test("[boundary-3] ids containing separators and unusual characters stay distinct", async () => {
  const { counter } = setup();
  await counter.report(r("a:b", "c", 1));
  await counter.report(r("a", "b:c", 2));
  await counter.report(r("__proto__", "constructor", 3));
  await counter.report(r(" ", " ", 4));
  await assertTotals(counter.taskTotals("a:b"), t(1n, 0n, 0n));
  await assertTotals(counter.taskTotals("a"), t(2n, 0n, 0n));
  await assertTotals(counter.contributorTotals("a:b", "c"), t(1n, 0n, 0n));
  await assertTotals(counter.contributorTotals("a", "b:c"), t(2n, 0n, 0n));
  await assertTotals(counter.contributorTotals("a", "c"), ZERO);
  await assertTotals(counter.taskTotals("__proto__"), t(3n, 0n, 0n));
  await assertTotals(counter.contributorTotals("__proto__", "constructor"), t(3n, 0n, 0n));
  await assertTotals(counter.contributorTotals("__proto__", "toString"), ZERO);
  await assertTotals(counter.taskTotals(" "), t(4n, 0n, 0n));
});

test("[boundary-3] a task id that starts with the key prefix gets its own key and totals", async () => {
  const { store, counter } = setup();
  await counter.report(r("t1", "alice", 1));
  await counter.report(r("usage:t1", "alice", 2));
  await counter.report(r("t1", "__proto__", 4));
  await counter.report(r("t1", "hasOwnProperty", 8));
  assert.deepStrictEqual(
    store.sets.map((s) => s.key),
    ["usage:t1", "usage:usage:t1", "usage:t1", "usage:t1"],
  );
  await assertTotals(counter.taskTotals("t1"), t(13n, 0n, 0n));
  await assertTotals(counter.taskTotals("usage:t1"), t(2n, 0n, 0n));
  await assertTotals(counter.contributorTotals("usage:t1", "alice"), t(2n, 0n, 0n));
  await assertTotals(counter.contributorTotals("t1", "alice"), t(1n, 0n, 0n));
  await assertTotals(counter.contributorTotals("t1", "__proto__"), t(4n, 0n, 0n));
  await assertTotals(counter.contributorTotals("t1", "hasOwnProperty"), t(8n, 0n, 0n));
  await assertTotals(counter.contributorTotals("t1", "toString"), ZERO);
});

// Rule: Totals are exact bigints; a task or contributor with no reports totals 0n for each

test("[happy-4] a task with no reports totals zero without writing to the store", async () => {
  const { store, counter } = setup();
  await assertTotals(counter.taskTotals("never"), ZERO);
  await assertTotals(counter.contributorTotals("never", "alice"), ZERO);
  assert.equal(store.sets.length, 0);
});

test("[happy-4] a contributor with no reports on a reported task totals zero, each query reading once and writing nothing", async () => {
  const { store, counter } = setup();
  await counter.report(r("t1", "alice", 1, 1, 1));
  const getsBefore = store.gets.length;
  await assertTotals(counter.contributorTotals("t1", "bob"), ZERO);
  assert.deepStrictEqual(store.gets.slice(getsBefore), ["usage:t1"]);
  await assertTotals(counter.taskTotals("never"), ZERO);
  assert.deepStrictEqual(store.gets.slice(getsBefore), ["usage:t1", "usage:never"]);
  assert.equal(store.sets.length, 1);
});

test("[boundary-4] sums beyond Number.MAX_SAFE_INTEGER stay exact", async () => {
  const { counter } = setup();
  await counter.report(r("t1", "alice", MAX, MAX, MAX));
  await counter.report(r("t1", "alice", MAX, 1, 2));
  await assertTotals(
    counter.taskTotals("t1"),
    t(18014398509481982n, 9007199254740992n, 9007199254740993n),
  );
});

test("[boundary-4] contributor totals of three maximal reports stay exact", async () => {
  const { counter } = setup();
  await counter.report(r("t1", "alice", MAX, MAX, MAX));
  await counter.report(r("t1", "alice", MAX, MAX, MAX));
  await counter.report(r("t1", "alice", MAX, MAX, MAX));
  const expected = t(27021597764222973n, 27021597764222973n, 27021597764222973n);
  await assertTotals(counter.contributorTotals("t1", "alice"), expected);
  await assertTotals(counter.taskTotals("t1"), expected);
});

test("[boundary-5] each query returns a fresh object with exactly the three bigint fields", async () => {
  const { counter } = setup();
  await counter.report(r("t1", "alice", 1, 2, 3));
  const first = await counter.taskTotals("t1");
  first.inputTokens = 999n;
  const second = await counter.taskTotals("t1");
  assert.deepStrictEqual({ ...second }, t(1n, 2n, 3n));
  assert.deepStrictEqual(Object.keys(second), ["inputTokens", "outputTokens", "costMicroDollars"]);
  for (const value of Object.values(second)) assert.equal(typeof value, "bigint");
});

test("[boundary-5] zero and contributor totals are also fresh objects with exactly the three bigint fields", async () => {
  const { counter } = setup();
  await counter.report(r("t1", "alice", 1, 2, 3));
  const queries: (() => Promise<UsageTotals>)[] = [
    () => counter.contributorTotals("t1", "alice"),
    () => counter.taskTotals("never"),
    () => counter.contributorTotals("t1", "bob"),
  ];
  for (const query of queries) {
    const first = await query();
    const expected = { ...first };
    first.inputTokens = 999n;
    first.costMicroDollars = 999n;
    const second = await query();
    assert.notEqual(second, first);
    assert.deepStrictEqual({ ...second }, expected);
    assert.deepStrictEqual(Object.keys(second), ["inputTokens", "outputTokens", "costMicroDollars"]);
    for (const value of Object.values(second)) assert.equal(typeof value, "bigint");
  }
  await assertTotals(counter.contributorTotals("t1", "alice"), t(1n, 2n, 3n));
  await assertTotals(counter.taskTotals("never"), ZERO);
});

// Rule: A report is validated before the store is touched; an invalid report rejects and counts nothing

const VALID = { taskId: "t1", contributorId: "alice", inputTokens: 1, outputTokens: 1, costMicroDollars: 1 };

type InvalidReport = [label: string, report: unknown, kind: typeof TypeError | typeof RangeError, field: string];

async function assertInvalidReports(examples: InvalidReport[]): Promise<void> {
  for (const [label, report, kind, field] of examples) {
    const { store, counter } = setup();
    await counter.report(r("t1", "alice", 1, 1, 1));
    const gets = store.gets.length;
    const sets = store.sets.length;
    const call = counter.report(report as UsageReport);
    await assert.rejects(call, errorWith(kind, field), `${label}: expected a ${kind.name} naming ${field}`);
    assert.equal(store.gets.length, gets, `${label}: S.get was called`);
    assert.equal(store.sets.length, sets, `${label}: S.set was called`);
    await assertTotals(counter.taskTotals("t1"), t(1n, 1n, 1n));
    await assertTotals(counter.contributorTotals("t1", "alice"), t(1n, 1n, 1n));
  }
}

test("[unhappy-1] an invalid report rejects with the decided error and changes nothing", async () => {
  await assertInvalidReports([
    ["null", null, TypeError, "report"],
    ["undefined", undefined, TypeError, "report"],
    ["a string", "t1", TypeError, "report"],
    ["empty taskId", { ...VALID, taskId: "" }, RangeError, "taskId"],
    ["numeric taskId", { ...VALID, taskId: 1 }, TypeError, "taskId"],
    ["missing taskId", { contributorId: "alice", inputTokens: 1, outputTokens: 1, costMicroDollars: 1 }, TypeError, "taskId"],
    ["empty contributorId", { ...VALID, contributorId: "" }, RangeError, "contributorId"],
    ["null contributorId", { ...VALID, contributorId: null }, TypeError, "contributorId"],
    ["negative inputTokens", { ...VALID, inputTokens: -1 }, RangeError, "inputTokens"],
    ["fractional inputTokens", { ...VALID, inputTokens: 1.5 }, RangeError, "inputTokens"],
    ["NaN inputTokens", { ...VALID, inputTokens: NaN }, RangeError, "inputTokens"],
    ["Infinity inputTokens", { ...VALID, inputTokens: Infinity }, RangeError, "inputTokens"],
    ["unsafe inputTokens", { ...VALID, inputTokens: 9007199254740992 }, RangeError, "inputTokens"],
    ["string inputTokens", { ...VALID, inputTokens: "1" }, TypeError, "inputTokens"],
    ["bigint inputTokens", { ...VALID, inputTokens: 1n }, TypeError, "inputTokens"],
    ["fractional negative outputTokens", { ...VALID, outputTokens: -0.5 }, RangeError, "outputTokens"],
    ["missing outputTokens", { taskId: "t1", contributorId: "alice", inputTokens: 1, costMicroDollars: 1 }, TypeError, "outputTokens"],
    ["-Infinity costMicroDollars", { ...VALID, costMicroDollars: -Infinity }, RangeError, "costMicroDollars"],
    ["null costMicroDollars", { ...VALID, costMicroDollars: null }, TypeError, "costMicroDollars"],
    ["everything invalid", { taskId: "", contributorId: "", inputTokens: -1, outputTokens: -1, costMicroDollars: -1 }, RangeError, "taskId"],
  ]);
});

test("[unhappy-1] the first failing check decides the error, a wrong type early beating a bad value later", async () => {
  await assertInvalidReports([
    ["a number", 42, TypeError, "report"],
    ["numeric taskId before empty contributorId", { ...VALID, taskId: 1, contributorId: "", inputTokens: -1 }, TypeError, "taskId"],
    ["missing contributorId before bad counts", { taskId: "t1", inputTokens: -1, outputTokens: -1, costMicroDollars: -1 }, TypeError, "contributorId"],
    ["string outputTokens before negative cost", { ...VALID, outputTokens: "1", costMicroDollars: -1 }, TypeError, "outputTokens"],
    ["unsafe costMicroDollars", { ...VALID, costMicroDollars: 9007199254740992 }, RangeError, "costMicroDollars"],
    ["huge inputTokens", { ...VALID, inputTokens: 1e21 }, RangeError, "inputTokens"],
  ]);
});

test("[boundary-6] boundary counts are accepted", async () => {
  const examples: [number, bigint][] = [
    [0, 0n],
    [-0, 0n],
    [MAX, 9007199254740991n],
  ];
  for (const [count, total] of examples) {
    const { counter } = setup();
    await counter.report(r("t1", "alice", count, 0, 0));
    await assertTotals(counter.taskTotals("t1"), t(total, 0n, 0n));
  }
});

test("[boundary-6] -0 and the largest safe count are accepted in every count field and saved canonically", async () => {
  const { store, counter } = setup();
  await counter.report(r("t1", "alice", -0, MAX, -0));
  await counter.report(r("t1", "alice", 0, -0, MAX));
  await assertTotals(counter.taskTotals("t1"), t(0n, 9007199254740991n, 9007199254740991n));
  await assertTotals(counter.contributorTotals("t1", "alice"), t(0n, 9007199254740991n, 9007199254740991n));
  assert.deepStrictEqual(store.data.get("usage:t1"), {
    inputTokens: "0",
    outputTokens: "9007199254740991",
    costMicroDollars: "9007199254740991",
    contributors: [
      { contributorId: "alice", inputTokens: "0", outputTokens: "9007199254740991", costMicroDollars: "9007199254740991" },
    ],
  });
});

test("[boundary-7] extra properties on a report are ignored", async () => {
  const { counter } = setup();
  await counter.report({ ...r("t1", "alice", 1, 2, 3), model: "x", cachedTokens: 50 } as UsageReport);
  await assertTotals(counter.taskTotals("t1"), t(1n, 2n, 3n));
});

test("[boundary-7] extra properties with invalid-looking values or record field names are neither checked nor saved", async () => {
  const { store, counter } = setup();
  const report = {
    ...r("t1", "alice", 1, 2, 3),
    taskID: "",
    inputTokenz: -1,
    contributors: "x",
    contributorId2: null,
  } as UsageReport;
  await counter.report(report);
  await assertTotals(counter.taskTotals("t1"), t(1n, 2n, 3n));
  await assertTotals(counter.contributorTotals("t1", "alice"), t(1n, 2n, 3n));
  assert.deepStrictEqual(store.data.get("usage:t1"), {
    inputTokens: "1",
    outputTokens: "2",
    costMicroDollars: "3",
    contributors: [{ contributorId: "alice", inputTokens: "1", outputTokens: "2", costMicroDollars: "3" }],
  });
});

// Rule: Query ids are validated the same way as report ids

type InvalidQuery = [label: string, query: (counter: UsageCounter) => Promise<UsageTotals>, kind: typeof TypeError | typeof RangeError, field: string];

async function assertInvalidQueries(examples: InvalidQuery[]): Promise<void> {
  for (const [label, query, kind, field] of examples) {
    const { store, counter } = setup();
    await assert.rejects(async () => query(counter), errorWith(kind, field), `${label}: expected a ${kind.name} naming ${field}`);
    assert.equal(store.gets.length, 0, `${label}: S.get was called`);
  }
}

const asString = (value: unknown): string => value as string;

test("[unhappy-2] an invalid query id rejects without touching the store", async () => {
  await assertInvalidQueries([
    ['taskTotals("")', (c) => c.taskTotals(""), RangeError, "taskId"],
    ["taskTotals(undefined)", (c) => c.taskTotals(asString(undefined)), TypeError, "taskId"],
    ['contributorTotals("", "alice")', (c) => c.contributorTotals("", "alice"), RangeError, "taskId"],
    ['contributorTotals("t1", "")', (c) => c.contributorTotals("t1", ""), RangeError, "contributorId"],
    ['contributorTotals("t1", 7)', (c) => c.contributorTotals("t1", asString(7)), TypeError, "contributorId"],
  ]);
});

test("[unhappy-2] a query's task id is checked before its contributor id", async () => {
  await assertInvalidQueries([
    ["taskTotals(null)", (c) => c.taskTotals(asString(null)), TypeError, "taskId"],
    ['contributorTotals("", 7)', (c) => c.contributorTotals("", asString(7)), RangeError, "taskId"],
    ['contributorTotals(undefined, "")', (c) => c.contributorTotals(asString(undefined), ""), TypeError, "taskId"],
    ['contributorTotals("t1", undefined)', (c) => c.contributorTotals("t1", asString(undefined)), TypeError, "contributorId"],
  ]);
});
