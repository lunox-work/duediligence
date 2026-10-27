import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UsageCounter,
  type UsageReport,
  type UsageStore,
  type UsageTotals,
} from "../../src/index.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function gate() {
  const entered = deferred();
  const released = deferred();
  return {
    entered: entered.promise,
    release: released.resolve,
    async wait() {
      entered.resolve();
      await released.promise;
    },
  };
}

type Gate = ReturnType<typeof gate>;

// Values are copied at the storage boundary: mutating a cache cannot undo a
// persisted write. No test assumes a key format, write count, or record shape.
class Store implements UsageStore {
  private readonly values = new Map<string, unknown>();
  private getHold?: { skip: number; gate: Gate };
  private setHold?: { skip: number; gate: Gate };
  private failure?: { remaining: number; error: unknown };
  failed = false;

  constructor(private readonly yielding = false) {}

  holdNext(kind: "get" | "set", skip = 0): Gate {
    const held = { skip, gate: gate() };
    if (kind === "get") this.getHold = held;
    else this.setHold = held;
    return held.gate;
  }

  rejectSetIn(remaining: number, error: unknown) {
    this.failed = false;
    this.failure = { remaining, error };
  }

  clearFailure() {
    this.failure = undefined;
  }

  private takeHold(kind: "get" | "set"): Gate | undefined {
    const held = kind === "get" ? this.getHold : this.setHold;
    if (!held || held.skip-- > 0) return undefined;
    if (kind === "get") this.getHold = undefined;
    else this.setHold = undefined;
    return held.gate;
  }

  async get(key: string): Promise<unknown> {
    const held = this.takeHold("get");
    if (held) await held.wait();
    if (this.yielding) {
      await Promise.resolve();
      await Promise.resolve();
    }
    return structuredClone(this.values.get(key));
  }

  async set(key: string, value: unknown): Promise<void> {
    const held = this.takeHold("set");
    let reject = false;
    let error: unknown;
    if (this.failure && --this.failure.remaining === 0) {
      reject = true;
      error = this.failure.error;
      this.failure = undefined;
    }
    if (held) await held.wait();
    if (this.yielding) {
      await Promise.resolve();
      await Promise.resolve();
    }
    if (reject) {
      this.failed = true;
      throw error;
    }
    this.values.set(key, structuredClone(value));
  }

  // A fresh facade still uses exactly the same saved key/value store.
  facade(): UsageStore {
    return { get: (key: string) => this.get(key), set: (key: string, value: unknown) => this.set(key, value) };
  }
}

function usage(
  taskId = "project/alpha",
  contributorId = "worker/one",
  inputTokens = 17,
  outputTokens = 29,
  costMicroDollars = 43,
): UsageReport {
  return { taskId, contributorId, inputTokens, outputTokens, costMicroDollars };
}

function sum(reports: readonly UsageReport[]): UsageTotals {
  return reports.reduce<UsageTotals>((total, item) => ({
    inputTokens: total.inputTokens + BigInt(item.inputTokens),
    outputTokens: total.outputTokens + BigInt(item.outputTokens),
    costMicroDollars: total.costMicroDollars + BigInt(item.costMicroDollars),
  }), { inputTokens: 0n, outputTokens: 0n, costMicroDollars: 0n });
}

function check(actual: UsageTotals, expected: UsageTotals) {
  assert.equal(actual.inputTokens, expected.inputTokens, "input tokens");
  assert.equal(actual.outputTokens, expected.outputTokens, "output tokens");
  assert.equal(actual.costMicroDollars, expected.costMicroDollars, "cost in micro-dollars");
}

async function checkTask(counter: UsageCounter, taskId: string, reports: readonly UsageReport[]) {
  check(await counter.taskTotals(taskId), sum(reports.filter((r) => r.taskId === taskId)));
}

async function checkPair(counter: UsageCounter, taskId: string, contributorId: string, reports: readonly UsageReport[]) {
  check(await counter.contributorTotals(taskId, contributorId), sum(reports.filter((r) => r.taskId === taskId && r.contributorId === contributorId)));
}

async function checkAll(counter: UsageCounter, reports: readonly UsageReport[]) {
  const tasks = new Set(reports.map((r) => r.taskId));
  const contributors = new Set(reports.map((r) => r.contributorId));
  for (const task of tasks) {
    await checkTask(counter, task, reports);
    for (const contributor of contributors) await checkPair(counter, task, contributor, reports);
  }
}

async function send(counter: UsageCounter, reports: readonly UsageReport[]) {
  for (const report of reports) await counter.report(report);
}

async function checkReaders(counter: UsageCounter, store: Store, reports: readonly UsageReport[]) {
  await checkAll(counter, reports);
  await checkAll(new UsageCounter(store.facade()), reports);
}

// No validation error text or subclass is specified. Check the specified Error
// outcome, then all totals and later successful use, rather than inventing text.
async function refuse(invalid: UsageReport) {
  const store = new Store(true);
  const counter = new UsageCounter(store);
  const saved = [usage(), usage("project/beta", "worker/two", 61, 73, 89)];
  await send(counter, saved);
  await assert.rejects(async () => { await counter.report(invalid); }, Error);
  await checkReaders(counter, store, saved);
  for (const reader of [counter, new UsageCounter(store.facade())]) {
    // The behavior of total reads with an empty identifier is unspecified.
    if (invalid.taskId.length > 0) {
      await checkTask(reader, invalid.taskId, saved);
      if (invalid.contributorId.length > 0) {
        await checkPair(reader, invalid.taskId, invalid.contributorId, saved);
      }
    }
  }
  const next = usage("project/alpha", "worker/three", 5, 0, 7);
  await counter.report(next);
  await checkReaders(counter, store, [...saved, next]);
}

// Extends public "a report adds all three counts to task and contributor".
test("[happy-1] independent fields and repeated identical calls are all counted", async () => {
  const counter = new UsageCounter(new Store());
  const reports = [usage("bill", "person", 37, 0, 0), usage("bill", "person", 0, 101, 0), usage("bill", "person", 0, 0, 997)];
  await send(counter, reports);
  await checkAll(counter, reports);
  await send(counter, reports);
  await checkAll(counter, [...reports, ...reports]);
});

// Extends public "zero counts are accepted and leave existing totals unchanged".
test("[happy-1] zero reports interleave with independently zero fields on several pairs", async () => {
  const store = new Store();
  const counter = new UsageCounter(store);
  const reports: UsageReport[] = [];
  for (let i = 0; i < 24; i++) {
    const task = `zero/${i % 3}`;
    const contributor = `author/${i % 4}`;
    reports.push(usage(task, contributor, 0, 0, 0));
    reports.push(usage(task, contributor, i % 2 ? 0 : i, i % 3 ? i + 1 : 0, i % 4 ? 0 : i + 2));
    reports.push(usage(task, contributor, 0, 0, 0));
  }
  await send(counter, reports);
  await checkReaders(counter, store, reports);
});

test("[happy-1] negative zero is a zero count in each field", async () => {
  const counter = new UsageCounter(new Store());
  const reports = [usage("zero", "negative-zero", -0, -0, -0), usage("zero", "negative-zero", 8, -0, 13)];
  await send(counter, reports);
  await checkAll(counter, reports);
});

// Extends public "tasks and contributors sum only their own reports".
test("[happy-2] an interleaved matrix of tasks and contributors preserves every subtotal", async () => {
  const store = new Store(true);
  const counter = new UsageCounter(store);
  const reports = Array.from({ length: 189 }, (_, i) => usage(`task/${i % 7}`, `person/${(i * 5) % 9}`, i + 3, i % 11, (i * 31) % 97));
  await send(counter, reports);
  await checkReaders(counter, store, reports);
});

// Extends public "nonempty identifiers with separators remain distinct".
test("[happy-2] key encoding preserves embedded separators escapes and reserved names", async () => {
  const counter = new UsageCounter(new Store());
  const pairs = [
    ["a/b", "c"], ["a", "b/c"], ["a|b", "c"], ["a", "b|c"],
    ["a\u0000b", "c"], ["a", "b\u0000c"], ["a%2Fb", "c"],
    ["__proto__", "constructor"], ["constructor", "__proto__"],
    ["toString", "hasOwnProperty"], ["task:shared", "shared"],
    ["shared", "task:shared"], ["[\"x\",\"y\"]", "\\\""],
    ["long".repeat(600), "contributor".repeat(300)],
  ];
  const reports = pairs.map(([task, contributor], i) => usage(task, contributor, i + 1, 2 * i + 3, 7 * i + 11));
  await send(counter, reports);
  await checkAll(counter, reports);
});

test("[happy-2] nonempty whitespace case and Unicode identifiers retain their identity", async () => {
  const counter = new UsageCounter(new Store());
  const names = [" ", "\t", "id", " id", "id ", "ID", "é", "e\u0301", "任务😀"];
  const reports: UsageReport[] = [];
  for (let i = 0; i < names.length; i++) {
    reports.push(usage(names[i], names[(i + 1) % names.length], i + 1, i + 7, i + 19));
    reports.push(usage("fixed", names[i], i + 3, i + 11, i + 23));
  }
  await send(counter, reports);
  await checkAll(counter, reports);
});

test("[happy-2] separate supplied stores never share totals for the same identifiers", async () => {
  const first = new UsageCounter(new Store());
  const second = new UsageCounter(new Store());
  const a = usage("identical", "identical", 11, 13, 17);
  const b = usage("identical", "identical", 101, 103, 107);
  await first.report(a);
  await checkTask(second, a.taskId, []);
  await second.report(b);
  await checkAll(first, [a]);
  await checkAll(second, [b]);
});

// Extends public "repeated safe integer reports sum exactly past two to the power 53".
test("[boundary-1] many large unequal increments keep task and contributor totals exact", async () => {
  const counter = new UsageCounter(new Store());
  const reports = Array.from({ length: 87 }, (_, i) => usage("huge", `person/${i % 5}`, Number.MAX_SAFE_INTEGER - i, i % 2 ? 1 : Number.MAX_SAFE_INTEGER, i * 3));
  await send(counter, reports);
  await checkAll(counter, reports);
});

// Extends public "exactly representable counts at two to the power 53 accept unit increments".
test("[boundary-1] finite whole numbers far beyond the safe range retain subsequent units", async () => {
  const counter = new UsageCounter(new Store());
  const reports = [
    usage("huge", "one", 2 ** 100, 2 ** 70, 2 ** 200),
    usage("huge", "one", 1, 3, 5),
    usage("huge", "two", 7, 11, 13),
    usage("huge", "one", 2 ** 100, 2 ** 70, 2 ** 200),
    usage("huge", "two", 1, 1, 1),
  ];
  await send(counter, reports);
  await checkAll(counter, reports);
});

test("[boundary-1] adding maximum finite whole numbers does not overflow a number accumulator", async () => {
  const counter = new UsageCounter(new Store());
  const reports = [usage("finite", "author", Number.MAX_VALUE, 0, 1), usage("finite", "author", Number.MAX_VALUE, 1, Number.MAX_VALUE), usage("finite", "author", 1, 1, 1)];
  await send(counter, reports);
  await checkAll(counter, reports);
});

test("[boundary-1] each field crosses the precision boundary on a different report", async () => {
  const counter = new UsageCounter(new Store());
  const reports = [usage("edge", "author", Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER - 2)];
  await counter.report(reports[0]);
  for (let i = 0; i < 9; i++) {
    const next = usage("edge", "author", 1, i % 2, i % 3 === 0 ? 1 : 0);
    reports.push(next);
    await counter.report(next);
    await checkAll(counter, reports);
  }
});

// Extends public "empty task and contributor identifiers are refused".
test("[unhappy-1] empty identifiers together and with unseen partners add no totals", async () => {
  await refuse(usage("", "", 101, 103, 107));
  await refuse(usage("", "new-contributor", 101, 103, 107));
  await refuse(usage("new-task", "", 101, 103, 107));
});

// Extends public "a negative value in any count is refused without changing totals".
test("[unhappy-1] tiny and large negative counts cannot slip through rounding or magnitude checks", async () => {
  for (const field of ["inputTokens", "outputTokens", "costMicroDollars"] as const) {
    for (const value of [-Number.MIN_VALUE, -17, -Number.MAX_VALUE]) {
      await refuse({ ...usage(), [field]: value });
    }
  }
});

// Extends public "a fractional value in any count is refused without changing totals".
test("[unhappy-1] fractions near zero and near integers are never rounded into valid reports", async () => {
  for (const field of ["inputTokens", "outputTokens", "costMicroDollars"] as const) {
    for (const value of [Number.MIN_VALUE, Number.EPSILON, 1 - Number.EPSILON, 19.125, 65536.5]) {
      await refuse({ ...usage("unseen-task", "unseen-person"), [field]: value });
    }
  }
});

// Extends public "nonnumeric and nonfinite counts are refused in every field".
test("[unhappy-1] coercible nonnumbers and bigint counts are not numeric reports", async () => {
  for (const field of ["inputTokens", "outputTokens", "costMicroDollars"] as const) {
    for (const value of ["", "0", "12", false, [], [1], {}, new Number(3), 1n]) {
      await refuse({ ...usage(), [field]: value } as unknown as UsageReport);
    }
  }
});

test("[unhappy-1] combined invalid counts are refused even when another field is zero", async () => {
  const invalid = [
    usage("project/alpha", "worker/one", NaN, 0, 0),
    usage("unseen-task", "worker/one", 0, Infinity, -Infinity),
    usage("project/alpha", "unseen-person", -3, 1.125, NaN),
    { ...usage(), inputTokens: undefined, outputTokens: null, costMicroDollars: true } as unknown as UsageReport,
  ];
  for (const report of invalid) await refuse(report);
});

test("[unhappy-1] malformed reports mixed into a blocked task do not count or poison valid reports", async () => {
  const store = new Store(true);
  const counter = new UsageCounter(store);
  const held = store.holdNext("set");
  const saved = [usage(), usage("project/alpha", "worker/two", 5, 7, 11)];
  const first = counter.report(saved[0]);
  await held.entered;
  const invalid = [usage("project/alpha", "worker/one", -2, 3, 5), usage("project/alpha", "", 2, 3, 5), usage("project/alpha", "worker/two", 2, 0.25, 5)];
  const refused = invalid.map((report) => assert.rejects(async () => { await counter.report(report); }, Error));
  const next = counter.report(saved[1]);
  held.release();
  await Promise.all([first, next, ...refused]);
  await checkReaders(counter, store, saved);
});

// Extends public "fifty overlapping reports on one contributor lose no counts".
test("[concurrency-1] 257 overlapping unequal reports on one contributor all persist", async () => {
  const store = new Store(true);
  const counter = new UsageCounter(store);
  const reports = Array.from({ length: 257 }, (_, i) => usage("busy", "one", i * i, i % 17, 3 * i + 1));
  await Promise.all(reports.map((report) => counter.report(report)));
  await checkReaders(counter, store, reports);
});

// Extends public "fifty overlapping reports preserve separate contributor sums including zeros".
test("[concurrency-1] eleven uneven contributor streams include zeros and totals past two to the power 53", async () => {
  const store = new Store(true);
  const counter = new UsageCounter(store);
  const reports = Array.from({ length: 173 }, (_, i) => usage("busy", `person/${(i * i + 3) % 11}`, i % 7 === 0 ? Number.MAX_SAFE_INTEGER : i, i % 4, i % 5 === 0 ? 0 : i * 19));
  await Promise.all(reports.map((report) => counter.report(report)));
  await checkReaders(counter, store, reports);
});

// Extends public "a report stays pending until its held save has completed".
test("[concurrency-1] a held save followed by forty reports cannot lose the held contribution", async () => {
  const store = new Store(true);
  const counter = new UsageCounter(store);
  const reports = Array.from({ length: 41 }, (_, i) => usage("queued", `person/${i % 6}`, i + 1, i * 7, i * 11));
  const held = store.holdNext("set");
  let settled = false;
  const first = counter.report(reports[0]).then(() => { settled = true; });
  await held.entered;
  const rest = reports.slice(1).map((report) => counter.report(report));
  try {
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(settled, false, "the held report must wait for its save");
  } finally {
    held.release();
  }
  await Promise.all([first, ...rest]);
  await checkReaders(counter, store, reports);
});

test("[concurrency-1] a report awaits later saves too if its storage layout uses several writes", async () => {
  // One-write and multi-write layouts are both allowed. For each position,
  // either the operation finishes without that many writes, or the held write
  // must complete before the operation can resolve.
  for (const skip of [0, 1, 2, 3]) {
    const store = new Store(true);
    const counter = new UsageCounter(store);
    const before = usage("stages", "first", 31, 37, 41);
    await counter.report(before);
    const held = store.holdNext("set", skip);
    const added = usage("stages", "second", 43, 47, 53);
    let settled = false;
    const pending = counter.report(added).then(() => { settled = true; });
    const reached = await Promise.race([held.entered.then(() => true), pending.then(() => false)]);
    try {
      if (reached) {
        await Promise.resolve();
        await Promise.resolve();
        assert.equal(settled, false, "every required save must finish before report resolves");
      }
    } finally {
      held.release();
    }
    await pending;
    await checkReaders(counter, store, [before, added]);
  }
});

test("[concurrency-1] reports arriving while an initial load is held preserve preexisting totals", async () => {
  const store = new Store(true);
  const prior = usage("load", "old", 101, 103, 107);
  await new UsageCounter(store).report(prior);
  const counter = new UsageCounter(store.facade());
  const held = store.holdNext("get");
  const reports = Array.from({ length: 63 }, (_, i) => usage("load", `new/${i % 7}`, i + 1, i % 5, i + 11));
  const first = counter.report(reports[0]);
  await held.entered;
  const rest = reports.slice(1).map((report) => counter.report(report));
  held.release();
  await Promise.all([first, ...rest]);
  await checkReaders(counter, store, [prior, ...reports]);
});

test("[concurrency-1] repeated concurrent waves across many tasks preserve all task sums", async () => {
  const store = new Store(true);
  const counter = new UsageCounter(store);
  const saved: UsageReport[] = [];
  for (let wave = 0; wave < 5; wave++) {
    const batch = Array.from({ length: 83 }, (_, i) => usage(`task/${i % 4}`, `person/${(i + wave) % 7}`, wave + i, (i * 7) % 13, 101 + i));
    await Promise.all(batch.map((report) => counter.report(report)));
    saved.push(...batch);
  }
  await checkReaders(counter, store, saved);
});

// Extends public "another task finishes while the first task's get is held".
test("[concurrency-2] a held load for one task does not block a burst sharing its contributor", async () => {
  const store = new Store(true);
  await new UsageCounter(store).report(usage("blocked", "shared", 71, 73, 79));
  const counter = new UsageCounter(store.facade());
  const held = store.holdNext("get");
  let firstFinished = false;
  const firstReport = usage("blocked", "shared", 2, 3, 5);
  const first = counter.report(firstReport).then(() => { firstFinished = true; });
  await held.entered;
  const reports = Array.from({ length: 35 }, (_, i) => usage(`free/${i % 5}`, "shared", i, i + 1, i + 2));
  try {
    await Promise.all(reports.map((report) => counter.report(report)));
    assert.equal(firstFinished, false);
    await checkAll(new UsageCounter(store.facade()), reports);
  } finally {
    held.release();
  }
  await first;
  await checkAll(counter, [usage("blocked", "shared", 71, 73, 79), firstReport, ...reports]);
});

// Extends public "another task finishes while the first task's set is held".
test("[concurrency-2] held saving and queued reports on one task allow many other tasks to finish", async () => {
  const store = new Store(true);
  const counter = new UsageCounter(store);
  const held = store.holdNext("set");
  let firstFinished = false;
  const blocked = [usage("blocked", "shared", 2, 3, 5), usage("blocked", "second", 7, 11, 13)];
  const first = counter.report(blocked[0]).then(() => { firstFinished = true; });
  await held.entered;
  const second = counter.report(blocked[1]);
  const free = Array.from({ length: 29 }, (_, i) => usage(`free/${i % 6}`, "shared", i + 1, i + 3, i + 5));
  try {
    await Promise.all(free.map((report) => counter.report(report)));
    assert.equal(firstFinished, false);
    await checkAll(new UsageCounter(store.facade()), free);
  } finally {
    held.release();
  }
  await Promise.all([first, second]);
  await checkReaders(counter, store, [...blocked, ...free]);
});

// Extends public "a rejected first save counts nothing and a later report succeeds".
test("[recovery-1] repeated first-save failures leave zero and permit later mixed-contributor reports", async () => {
  const store = new Store(true);
  const counter = new UsageCounter(store);
  for (let i = 0; i < 4; i++) {
    const error = new Error(`failure-${i}`);
    store.rejectSetIn(1, error);
    const rejected = usage("failures", `person/${i}`, 2 ** 53, i + 1, i + 7);
    await assert.rejects(async () => { await counter.report(rejected); }, (actual: unknown) => actual === error);
    for (const reader of [counter, new UsageCounter(store.facade())]) {
      await checkTask(reader, rejected.taskId, []);
      await checkPair(reader, rejected.taskId, rejected.contributorId, []);
    }
  }
  const saved = Array.from({ length: 9 }, (_, i) => usage("failures", `person/${i % 3}`, i + 1, i * 3, i * 7));
  await send(counter, saved);
  await checkReaders(counter, store, saved);
});

// Extends public "a failed save preserves existing totals and releases the task for later reports".
test("[recovery-1] failures updating an existing contributor preserve all unrelated persisted totals", async () => {
  const store = new Store(true);
  const counter = new UsageCounter(store);
  const saved = [usage("target", "existing", 2 ** 53, 19, 23), usage("target", "other", 31, 37, 41), usage("unrelated", "existing", 43, 47, 53)];
  await send(counter, saved);
  for (let i = 0; i < 3; i++) {
    const error = new Error(`update-failed-${i}`);
    store.rejectSetIn(1, error);
    await assert.rejects(async () => { await counter.report(usage("target", "existing", 1, 2, 3)); }, (actual: unknown) => actual === error);
    await checkReaders(counter, store, saved);
    const next = usage("target", i % 2 ? "other" : "existing", 1, 3, 5);
    await counter.report(next);
    saved.push(next);
  }
  await checkReaders(counter, store, saved);
});

test("[recovery-1] a failed held save does not poison reports already queued on the same task", async () => {
  const store = new Store(true);
  const counter = new UsageCounter(store);
  const before = usage("queue", "existing", 101, 103, 107);
  await counter.report(before);
  const held = store.holdNext("set");
  const error = new Error("queued write rejected");
  store.rejectSetIn(1, error);
  const failed = assert.rejects(async () => { await counter.report(usage("queue", "existing", 1001, 1003, 1007)); }, (actual: unknown) => actual === error);
  await held.entered;
  const reports = Array.from({ length: 41 }, (_, i) => usage("queue", `person/${i % 5}`, i + 1, i * 2, i * 3));
  const later = reports.map((report) => counter.report(report));
  held.release();
  await Promise.all([failed, ...later]);
  await checkReaders(counter, store, [before, ...reports]);
});

test("[recovery-1] a delayed store rejection is propagated as the original error object", async () => {
  const store = new Store(true);
  const counter = new UsageCounter(store);
  const held = store.holdNext("set");
  const error = new TypeError("distinct delayed storage error");
  store.rejectSetIn(1, error);
  let settled = false;
  const result = counter.report(usage("delayed", "person", 11, 13, 17));
  const rejected = assert.rejects(async () => { await result; }, (actual: unknown) => actual === error);
  void result.then(() => { settled = true; }, () => { settled = true; });
  await held.entered;
  try {
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(settled, false);
  } finally {
    held.release();
  }
  await rejected;
  for (const reader of [counter, new UsageCounter(store.facade())]) {
    await checkTask(reader, "delayed", []);
    await checkPair(reader, "delayed", "person", []);
  }
  const next = usage("delayed", "person", 19, 23, 29);
  await counter.report(next);
  await checkReaders(counter, store, [next]);
});

test("[recovery-1] failure at any of the first four save positions cannot leave a partial report", async () => {
  for (const position of [1, 2, 3, 4]) {
    const store = new Store(true);
    const counter = new UsageCounter(store);
    const before = [usage("atomic", "old", 31, 37, 41), usage("untouched", "new", 43, 47, 53)];
    await send(counter, before);
    const error = new Error(`save position ${position}`);
    store.rejectSetIn(position, error);
    const attempted = usage("atomic", "new", 101, 103, 107);
    let outcome: { ok: true } | { ok: false; error: unknown };
    try {
      await counter.report(attempted);
      outcome = { ok: true };
    } catch (actual: unknown) {
      outcome = { ok: false, error: actual };
    }
    // Fewer writes than position is permitted; never require a storage layout.
    store.clearFailure();
    const saved = store.failed ? before : [...before, attempted];
    assert.equal(outcome.ok, !store.failed);
    if (!outcome.ok) assert.equal(outcome.error, error);
    await checkReaders(counter, store, saved);
    await checkPair(counter, "atomic", "new", saved);
  }
});

test("[recovery-1] storage rejection values are preserved without wrapping", async () => {
  for (const error of ["storage unavailable", { reason: "quota", code: 73 }, null, undefined]) {
    const store = new Store();
    const counter = new UsageCounter(store);
    store.rejectSetIn(1, error);
    let rejected = false;
    try {
      await counter.report(usage("payload", "person", 1, 2, 3));
    } catch (actual: unknown) {
      rejected = true;
      assert.equal(actual, error);
    }
    assert.equal(rejected, true, "report must reject with the store's rejection");
    await checkTask(new UsageCounter(store.facade()), "payload", []);
    await checkPair(counter, "payload", "person", []);
    const next = usage("payload", "person", 5, 7, 11);
    await counter.report(next);
    await checkReaders(counter, store, [next]);
  }
});

// Extends public "a fresh counter reads saved task and contributor totals and adds to them".
test("[recovery-2] repeated restarts over the saved store grow a many-task contributor matrix", async () => {
  const store = new Store(true);
  const saved: UsageReport[] = [];
  for (let round = 0; round < 8; round++) {
    const counter = new UsageCounter(store.facade());
    await checkAll(counter, saved);
    const reports = Array.from({ length: 17 }, (_, i) => usage(`task/${(i + round) % 5}`, `person/${(i * 3 + round) % 7}`, i + round, 31 + i, 101 + round));
    await send(counter, reports);
    saved.push(...reports);
    await checkAll(counter, saved);
  }
  await checkAll(new UsageCounter(store.facade()), saved);
});

// Extends public "totals beyond two to the power 53 remain exact across repeated restarts".
test("[recovery-2] restarts preserve independently huge contributor counts and small subsequent increments", async () => {
  const store = new Store(true);
  const saved: UsageReport[] = [];
  for (let round = 0; round < 9; round++) {
    const counter = new UsageCounter(store.facade());
    await checkAll(counter, saved);
    const reports = [usage("huge/restart", `person/${round % 3}`, 2 ** 80, round + 1, 2 ** 110), usage("huge/restart", `person/${(round + 1) % 3}`, 1, 2 ** 60, 3)];
    await send(counter, reports);
    saved.push(...reports);
  }
  await checkAll(new UsageCounter(store.facade()), saved);
});

test("[recovery-2] completed concurrent batches are durable before a new counter appends more", async () => {
  const store = new Store(true);
  const saved: UsageReport[] = [];
  for (let round = 0; round < 4; round++) {
    const counter = new UsageCounter(store.facade());
    const reports = Array.from({ length: 67 }, (_, i) => usage(`durable/${i % 3}`, `person/${(i + round) % 8}`, i * 11 + round, i % 7, i * 13));
    await Promise.all(reports.map((report) => counter.report(report)));
    saved.push(...reports);
    await checkAll(new UsageCounter(store.facade()), saved);
  }
});

test("[recovery-2] restarting after failed and valid reports restores only accepted contributions", async () => {
  const store = new Store(true);
  const saved: UsageReport[] = [];
  for (let round = 0; round < 5; round++) {
    const counter = new UsageCounter(store.facade());
    const next = usage("restart/failure", `person/${round % 2}`, 13 + round, 17 + round, 19 + round);
    await counter.report(next);
    saved.push(next);
    const error = new Error(`restart failure ${round}`);
    store.rejectSetIn(1, error);
    await assert.rejects(async () => { await counter.report(usage("restart/failure", `person/${round % 2}`, 1001, 1003, 1007)); }, (actual: unknown) => actual === error);
    await checkReaders(counter, store, saved);
  }
});

// Extends public "task and contributor totals in a new store are zero".
test("[happy-3] repeated unknown reads with unusual identifiers stay zero then accept a report", async () => {
  const store = new Store();
  const counter = new UsageCounter(store);
  const names = ["__proto__", "constructor", "a/b:c|d", " ", "未知😀", "long".repeat(300)];
  for (let repeat = 0; repeat < 3; repeat++) {
    for (const name of names) {
      await checkTask(counter, name, []);
      for (const contributor of names) await checkPair(counter, name, contributor, []);
    }
  }
  const saved = names.map((name, i) => usage(name, names[(i + 1) % names.length], i + 1, i + 3, i + 5));
  await send(counter, saved);
  await checkReaders(counter, store, saved);
});

// Extends public "an unknown pairing stays zero when both identifiers occur elsewhere".
test("[happy-3] sparse many-task pairings stay zero across restarts and later become populated", async () => {
  const store = new Store(true);
  const counter = new UsageCounter(store);
  const saved = Array.from({ length: 8 }, (_, i) => usage(`task/${i}`, `person/${i}`, i + 1, i + 2, i + 3));
  await send(counter, saved);
  const restarted = new UsageCounter(store.facade());
  await checkAll(restarted, saved);
  for (let i = 0; i < 8; i++) {
    await checkPair(restarted, "missing-task", `person/${i}`, saved);
    await checkPair(restarted, `task/${i}`, "missing-person", saved);
  }
  await checkTask(restarted, "missing-task", saved);
  const next = usage("task/0", "person/7", 97, 101, 103);
  await restarted.report(next);
  await checkAll(new UsageCounter(store.facade()), [...saved, next]);
});
