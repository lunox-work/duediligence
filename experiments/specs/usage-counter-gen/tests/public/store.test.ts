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

/** The store "J": saves JSON.stringify(value) and gets JSON.parse of it. */
class JsonStore implements UsageStore {
  readonly saved = new Map<string, string>();

  async get(key: string): Promise<unknown> {
    const text = this.saved.get(key);
    return text === undefined ? undefined : JSON.parse(text);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.saved.set(key, JSON.stringify(value));
  }
}

interface SavedRecord {
  inputTokens: string;
  outputTokens: string;
  costMicroDollars: string;
  contributors: { contributorId: string; inputTokens: string; outputTokens: string; costMicroDollars: string }[];
}

// Rule: Each task is saved under the key "usage:" + taskId as a JSON-safe record, one get and one set per report

test("[happy-5] the saved record after two contributors report", async () => {
  const { store, counter } = setup();
  await counter.report(r("t1", "bob", 40, 5, 90));
  await counter.report(r("t1", "alice", 100, 20, 350));
  await counter.report(r("t1", "bob", 1, 0, 10));
  assert.deepStrictEqual(store.data.get("usage:t1"), {
    inputTokens: "141",
    outputTokens: "25",
    costMicroDollars: "450",
    contributors: [
      { contributorId: "bob", inputTokens: "41", outputTokens: "5", costMicroDollars: "100" },
      { contributorId: "alice", inputTokens: "100", outputTokens: "20", costMicroDollars: "350" },
    ],
  });
  assert.deepStrictEqual(store.sets.map((s) => s.key), ["usage:t1", "usage:t1", "usage:t1"]);
  assert.deepStrictEqual(store.gets, ["usage:t1", "usage:t1", "usage:t1"]);
});

test("[happy-5] each report saves a new record and never mutates one it saved before", async () => {
  const { store, counter } = setup();
  await counter.report(r("t1", "bob", 40, 5, 90));
  const firstSaved = store.sets[0]!.value;
  const firstSnapshot = JSON.parse(JSON.stringify(firstSaved));
  await counter.report(r("t1", "alice", 100, 20, 350));
  await counter.report(r("t1", "bob", 1, 0, 10));
  assert.equal(store.sets.length, 3);
  assert.notEqual(store.sets[1]!.value, firstSaved);
  assert.notEqual(store.sets[2]!.value, store.sets[1]!.value);
  assert.deepStrictEqual(firstSaved, firstSnapshot);
  assert.deepStrictEqual(firstSnapshot, {
    inputTokens: "40",
    outputTokens: "5",
    costMicroDollars: "90",
    contributors: [{ contributorId: "bob", inputTokens: "40", outputTokens: "5", costMicroDollars: "90" }],
  });
  assert.deepStrictEqual(store.sets[1]!.value, {
    inputTokens: "140",
    outputTokens: "25",
    costMicroDollars: "440",
    contributors: [
      { contributorId: "bob", inputTokens: "40", outputTokens: "5", costMicroDollars: "90" },
      { contributorId: "alice", inputTokens: "100", outputTokens: "20", costMicroDollars: "350" },
    ],
  });
});

test("[happy-6] the record survives JSON round-tripping by the store", async () => {
  const c = new UsageCounter(new JsonStore());
  await c.report(r("t1", "alice", MAX, MAX, 1));
  await c.report(r("t1", "alice", MAX, 1, 1));
  await assertTotals(c.taskTotals("t1"), t(18014398509481982n, 9007199254740992n, 2n));
});

test("[happy-6] a new counter over a JSON store reads every contributor's exact totals", async () => {
  const j = new JsonStore();
  const c = new UsageCounter(j);
  await c.report(r("t1", "alice", MAX, 0, 0));
  await c.report(r("t1", "bob", 1, 0, 0));
  await c.report(r("t1", "alice", MAX, 0, 0));
  const restarted = new UsageCounter(j);
  await assertTotals(restarted.taskTotals("t1"), t(18014398509481983n, 0n, 0n));
  await assertTotals(restarted.contributorTotals("t1", "alice"), t(18014398509481982n, 0n, 0n));
  await assertTotals(restarted.contributorTotals("t1", "bob"), t(1n, 0n, 0n));
  await restarted.report(r("t1", "bob", 1, 0, 0));
  await assertTotals(restarted.contributorTotals("t1", "bob"), t(2n, 0n, 0n));
  await assertTotals(restarted.taskTotals("t1"), t(18014398509481984n, 0n, 0n));
});

test("[boundary-8] constructing a counter does not touch the store", () => {
  const store = new MemoryStore();
  new UsageCounter(store);
  assert.equal(store.gets.length, 0);
  assert.equal(store.sets.length, 0);
});

test("[boundary-8] constructing counters over a store whose calls would throw calls neither", () => {
  let calls = 0;
  const store: UsageStore = {
    get(): Promise<unknown> {
      calls++;
      throw new Error("get must not be called");
    },
    set(): Promise<void> {
      calls++;
      throw new Error("set must not be called");
    },
  };
  new UsageCounter(store);
  new UsageCounter(store);
  assert.equal(calls, 0);
});

function assertNotStores(examples: [label: string, store: unknown][]): void {
  for (const [label, store] of examples) {
    assert.throws(
      () => new UsageCounter(store as UsageStore),
      errorWith(TypeError, "store"),
      `${label}: expected a TypeError naming store`,
    );
  }
}

test("[unhappy-3] the constructor rejects something that is not a store", () => {
  assertNotStores([
    ["undefined", undefined],
    ["null", null],
    ["{}", {}],
    ["get only", { get: async () => undefined }],
    ["set only", { set: async () => {} }],
  ]);
});

test("[unhappy-3] the constructor rejects get or set that is present but not a function", () => {
  assertNotStores([
    ["string get", { get: "get", set: async () => {} }],
    ["numeric set", { get: async () => undefined, set: 1 }],
    ["null get and set", { get: null, set: null }],
    ["a number", 42],
  ]);
});

// Rule: A new counter over the same store sees and continues the totals already counted

test("[happy-7] totals survive a restart", async () => {
  const { store, counter } = setup();
  await counter.report(r("t1", "alice", 100, 20, 350));
  await counter.report(r("t1", "bob", 40, 5, 90));
  const restarted = new UsageCounter(store);
  await assertTotals(restarted.taskTotals("t1"), t(140n, 25n, 440n));
  await assertTotals(restarted.contributorTotals("t1", "bob"), t(40n, 5n, 90n));
  await restarted.report(r("t1", "alice", 1, 1, 1));
  await assertTotals(restarted.contributorTotals("t1", "alice"), t(101n, 21n, 351n));
});

test("[happy-7] a contributor new after a restart is appended after the contributors already saved", async () => {
  const { store, counter } = setup();
  await counter.report(r("t1", "alice", 100, 20, 350));
  await counter.report(r("t1", "bob", 40, 5, 90));
  const restarted = new UsageCounter(store);
  await restarted.report(r("t1", "carol", 1, 2, 3));
  await assertTotals(restarted.taskTotals("t1"), t(141n, 27n, 443n));
  await assertTotals(restarted.contributorTotals("t1", "carol"), t(1n, 2n, 3n));
  const saved = store.data.get("usage:t1") as SavedRecord;
  assert.deepStrictEqual(saved.contributors.map((c) => c.contributorId), ["alice", "bob", "carol"]);
});

test("[happy-8] counters taking turns over one store see each other's reports", async () => {
  const { store, counter } = setup();
  const other = new UsageCounter(store);
  await counter.report(r("t1", "alice", 1));
  await other.report(r("t1", "alice", 2));
  await counter.report(r("t1", "alice", 4));
  await assertTotals(counter.taskTotals("t1"), t(7n, 0n, 0n));
  await assertTotals(other.taskTotals("t1"), t(7n, 0n, 0n));
});

test("[happy-8] a counter that already queried a task sees a report another counter made since", async () => {
  const { store, counter } = setup();
  const other = new UsageCounter(store);
  await assertTotals(counter.taskTotals("t1"), ZERO);
  await assertTotals(counter.contributorTotals("t1", "bob"), ZERO);
  await other.report(r("t1", "bob", 2));
  await assertTotals(counter.taskTotals("t1"), t(2n, 0n, 0n));
  await assertTotals(counter.contributorTotals("t1", "bob"), t(2n, 0n, 0n));
});

async function assertInvalidRecords(values: [label: string, value: unknown][]): Promise<void> {
  for (const [label, value] of values) {
    const { store, counter } = setup();
    store.data.set("usage:t1", value);
    const isKeyError = errorWith(Error, "usage:t1");
    await assert.rejects(counter.report(r("t1", "alice", 1, 1, 1)), isKeyError, `${label}: report`);
    assert.equal(store.sets.length, 0, `${label}: S.set was called`);
    assert.equal(store.data.get("usage:t1"), value, `${label}: the saved value changed`);
    await assert.rejects(counter.taskTotals("t1"), isKeyError, `${label}: taskTotals`);
    await assert.rejects(counter.contributorTotals("t1", "alice"), isKeyError, `${label}: contributorTotals`);
    await assertTotals(counter.taskTotals("t2"), ZERO);
  }
}

const COUNTS = { inputTokens: "1", outputTokens: "1", costMicroDollars: "1" };

test("[unhappy-4] a saved value that is not a valid record rejects instead of being overwritten", async () => {
  await assertInvalidRecords([
    ["null", null],
    ['"141"', "141"],
    ["no contributors", { ...COUNTS }],
    ["numeric count", { ...COUNTS, inputTokens: 1, contributors: [] }],
    ["signed count", { ...COUNTS, inputTokens: "-1", contributors: [] }],
    ["leading zero", { ...COUNTS, inputTokens: "01", contributors: [] }],
    ["decimal point", { ...COUNTS, inputTokens: "1.0", contributors: [] }],
    ["empty contributorId", { ...COUNTS, contributors: [{ contributorId: "", ...COUNTS }] }],
    [
      "duplicate contributorId",
      {
        ...COUNTS,
        contributors: [
          { contributorId: "a", ...COUNTS },
          { contributorId: "a", inputTokens: "0", outputTokens: "0", costMicroDollars: "0" },
        ],
      },
    ],
  ]);
});

test("[unhappy-4] counts with other characters and malformed contributor entries are not valid records", async () => {
  await assertInvalidRecords([
    ["plus sign", { ...COUNTS, outputTokens: "+1", contributors: [] }],
    ["negative zero", { ...COUNTS, costMicroDollars: "-0", contributors: [] }],
    ["leading space", { ...COUNTS, inputTokens: " 1", contributors: [] }],
    ["trailing space", { ...COUNTS, inputTokens: "1 ", contributors: [] }],
    ["empty string", { ...COUNTS, inputTokens: "", contributors: [] }],
    ["exponent", { ...COUNTS, inputTokens: "1e3", contributors: [] }],
    ["hexadecimal", { ...COUNTS, inputTokens: "0x1", contributors: [] }],
    ["contributors not an array", { ...COUNTS, contributors: {} }],
    ["contributor without id", { ...COUNTS, contributors: [{ ...COUNTS }] }],
    ["numeric contributorId", { ...COUNTS, contributors: [{ contributorId: 5, ...COUNTS }] }],
    ["contributor count with leading zeros", { ...COUNTS, contributors: [{ contributorId: "a", ...COUNTS, inputTokens: "00" }] }],
    ["contributor count as number", { ...COUNTS, contributors: [{ contributorId: "a", ...COUNTS, costMicroDollars: 1 }] }],
    ["an array", []],
  ]);
});

// Rule: If the store rejects, the call rejects with the store's own error and counts nothing

test("[unhappy-5] a rejected set leaves every total unchanged", async () => {
  const { store, counter } = setup();
  await counter.report(r("t1", "alice", 10, 10, 10));
  const boom = new Error("boom");
  store.failNextSet(boom);
  await assert.rejects(counter.report(r("t1", "bob", 5, 5, 5)), (error: unknown) => error === boom);
  await assertTotals(counter.taskTotals("t1"), t(10n, 10n, 10n));
  await assertTotals(counter.contributorTotals("t1", "alice"), t(10n, 10n, 10n));
  await assertTotals(counter.contributorTotals("t1", "bob"), ZERO);
});

test("[unhappy-5] a rejected set on a task's very first report leaves it with no totals", async () => {
  const { store, counter } = setup();
  const boom = new Error("boom");
  store.failNextSet(boom);
  await assert.rejects(counter.report(r("t1", "alice", 5, 5, 5)), (error: unknown) => error === boom);
  assert.equal(store.data.has("usage:t1"), false);
  await assertTotals(counter.taskTotals("t1"), ZERO);
  await assertTotals(counter.contributorTotals("t1", "alice"), ZERO);
});

test("[unhappy-6] a report after a rejected set builds on the last saved totals", async () => {
  const { store, counter } = setup();
  const boom = new Error("boom");
  store.failNextSet(boom);
  await assert.rejects(counter.report(r("t1", "alice", 5)), (error: unknown) => error === boom);
  await counter.report(r("t1", "alice", 2));
  await assertTotals(counter.taskTotals("t1"), t(2n, 0n, 0n));
});

test("[unhappy-6] a contributor whose first report failed is counted from its next report only", async () => {
  const { store, counter } = setup();
  await counter.report(r("t1", "alice", 10, 1, 1));
  const boom = new Error("boom");
  store.failNextSet(boom);
  await assert.rejects(counter.report(r("t1", "bob", 5, 5, 5)), (error: unknown) => error === boom);
  await counter.report(r("t1", "bob", 2, 0, 3));
  await assertTotals(counter.contributorTotals("t1", "bob"), t(2n, 0n, 3n));
  await assertTotals(counter.contributorTotals("t1", "alice"), t(10n, 1n, 1n));
  await assertTotals(counter.taskTotals("t1"), t(12n, 1n, 4n));
});

test("[unhappy-7] a rejected get rejects the call with the store's error and does not call set", async () => {
  const { store, counter } = setup();
  const offline = new Error("offline");
  store.failNextGet(offline);
  await assert.rejects(counter.report(r("t1", "alice", 1, 1, 1)), (error: unknown) => error === offline);
  assert.equal(store.sets.length, 0);
  await assertTotals(counter.taskTotals("t1"), ZERO);
});

test("[unhappy-7] a rejected get on a task with saved totals keeps them, and the next report builds on them", async () => {
  const { store, counter } = setup();
  await counter.report(r("t1", "alice", 3, 2, 1));
  const saved = store.data.get("usage:t1");
  const offline = new Error("offline");
  store.failNextGet(offline);
  await assert.rejects(counter.report(r("t1", "alice", 1, 1, 1)), (error: unknown) => error === offline);
  assert.equal(store.sets.length, 1);
  assert.equal(store.data.get("usage:t1"), saved);
  await assertTotals(counter.taskTotals("t1"), t(3n, 2n, 1n));
  await counter.report(r("t1", "alice", 1, 1, 1));
  await assertTotals(counter.contributorTotals("t1", "alice"), t(4n, 3n, 2n));
});

test("[unhappy-8] a query rejects with the store's error when get rejects", async () => {
  const { store, counter } = setup();
  const offline = new Error("offline");
  store.failNextGet(offline);
  await assert.rejects(counter.taskTotals("t1"), (error: unknown) => error === offline);
});

test("[unhappy-8] a contributor query rejects with the store's error, and the next query reads normally", async () => {
  const { store, counter } = setup();
  await counter.report(r("t1", "alice", 1, 2, 3));
  const offline = new Error("offline");
  store.failNextGet(offline);
  await assert.rejects(counter.contributorTotals("t1", "alice"), (error: unknown) => error === offline);
  assert.equal(store.sets.length, 1);
  await assertTotals(counter.contributorTotals("t1", "alice"), t(1n, 2n, 3n));
});
