import { test } from "node:test";
import assert from "node:assert/strict";
import { KeyedQueue, type Job } from "../../src/index.js";

/** A job that settles only when the test says so, and records when it starts. */
class Controlled<T> {
  calls = 0;
  private resolveFn!: (value: T) => void;
  private rejectFn!: (error: unknown) => void;
  private readonly promise = new Promise<T>((resolve, reject) => {
    this.resolveFn = resolve;
    this.rejectFn = reject;
  });

  constructor(
    private readonly name = "",
    private readonly log: string[] = [],
  ) {}

  get started(): boolean {
    return this.calls > 0;
  }

  readonly fn: Job<T> = () => {
    this.calls++;
    this.log.push(this.name);
    return this.promise;
  };

  resolve(value: T): void {
    this.resolveFn(value);
  }

  reject(error: unknown): void {
    this.rejectFn(error);
  }
}

/** Lets every pending callback run, without reading a clock. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

function rejectsWith(promise: Promise<unknown>, expected: unknown): Promise<void> {
  return assert.rejects(promise, (error: unknown) => {
    assert.equal(error, expected);
    return true;
  });
}

test("[happy-1] the second job with one key starts only after the first settles, and each submission resolves with its own value", async () => {
  const queue = new KeyedQueue(4);
  const first = new Controlled<string>();
  const second = new Controlled<string>();

  const p1 = queue.submit("task", first.fn);
  const p2 = queue.submit("task", second.fn);
  await flush();

  assert.equal(first.started, true);
  assert.equal(second.started, false);

  first.resolve("one");
  assert.equal(await p1, "one");
  await flush();
  assert.equal(second.started, true);

  second.resolve("two");
  assert.equal(await p2, "two");
});

test("[happy-1] three jobs with one key run one at a time in submission order", async () => {
  const queue = new KeyedQueue(4);
  const log: string[] = [];
  const a = new Controlled<number>("a", log);
  const b = new Controlled<number>("b", log);
  const c = new Controlled<number>("c", log);

  const pa = queue.submit("task", a.fn);
  const pb = queue.submit("task", b.fn);
  const pc = queue.submit("task", c.fn);
  await flush();
  assert.deepEqual(log, ["a"]);

  a.resolve(1);
  await flush();
  assert.deepEqual(log, ["a", "b"]);

  b.resolve(2);
  await flush();
  assert.deepEqual(log, ["a", "b", "c"]);

  c.resolve(3);
  assert.deepEqual(await Promise.all([pa, pb, pc]), [1, 2, 3]);
});

test("[boundary-1] a job whose promise rejects rejects its submission and the next job with its key still runs after it", async () => {
  const queue = new KeyedQueue(4);
  const error = new Error("first failed");
  const first = new Controlled<string>();
  const second = new Controlled<string>();

  const r1 = rejectsWith(queue.submit("task", first.fn), error);
  const p2 = queue.submit("task", second.fn);
  await flush();
  assert.equal(second.started, false);

  first.reject(error);
  await r1;
  await flush();
  assert.equal(second.started, true);

  second.resolve("two");
  assert.equal(await p2, "two");
});

test("[boundary-1] two failed jobs in a row on a cap of 1 neither block the key nor keep the slot", async () => {
  const queue = new KeyedQueue(1);
  const e1 = new Error("one");
  const e2 = new Error("two");
  const log: string[] = [];
  const first = new Controlled<string>("first", log);
  const second = new Controlled<string>("second", log);
  const third = new Controlled<string>("third", log);

  const r1 = rejectsWith(queue.submit("task", first.fn), e1);
  const r2 = rejectsWith(queue.submit("task", second.fn), e2);
  const p3 = queue.submit("task", third.fn);
  await flush();

  first.reject(e1);
  await r1;
  await flush();
  assert.deepEqual(log, ["first", "second"]);

  second.reject(e2);
  await r2;
  await flush();
  assert.deepEqual(log, ["first", "second", "third"]);

  third.resolve("three");
  assert.equal(await p3, "three");
});

test("[unhappy-1] a job that throws synchronously rejects its submission with the thrown error and a later job with its key runs", async () => {
  const queue = new KeyedQueue(4);
  const error = new Error("thrown");
  const throwing: Job<string> = () => {
    throw error;
  };

  await rejectsWith(queue.submit("task", throwing), error);

  const after = queue.submit("task", async () => "after");
  assert.equal(await after, "after");
});

test("[unhappy-1] a job that throws synchronously when its turn comes neither blocks the key behind it nor keeps a slot", async () => {
  const queue = new KeyedQueue(1);
  const error = new Error("thrown");
  const first = new Controlled<string>();
  let throwingCalls = 0;
  const throwing: Job<string> = () => {
    throwingCalls++;
    throw error;
  };
  const third = new Controlled<string>();

  const p1 = queue.submit("task", first.fn);
  const r2 = rejectsWith(queue.submit("task", throwing), error);
  const p3 = queue.submit("task", third.fn);
  await flush();
  assert.equal(throwingCalls, 0);

  first.resolve("one");
  assert.equal(await p1, "one");
  await r2;
  assert.equal(throwingCalls, 1);
  await flush();
  assert.equal(third.started, true);

  third.resolve("three");
  assert.equal(await p3, "three");
});
