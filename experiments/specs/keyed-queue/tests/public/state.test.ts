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

test("[happy-3] with a cap of 1, the queue reports 1 running and 1 waiting, and is idle only after both jobs settle", async () => {
  const queue = new KeyedQueue(1);
  const a = new Controlled<string>();
  const b = new Controlled<string>();

  const pa = queue.submit("a", a.fn);
  const pb = queue.submit("b", b.fn);
  await flush();

  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 1);

  let idle = false;
  queue.onIdle().then(() => {
    idle = true;
  });
  await flush();
  assert.equal(idle, false);

  a.resolve("A");
  assert.equal(await pa, "A");
  await flush();
  assert.equal(idle, false);
  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 0);

  b.resolve("B");
  assert.equal(await pb, "B");
  await flush();
  assert.equal(idle, true);
  assert.equal(queue.running, 0);
  assert.equal(queue.waiting, 0);
});

test("[happy-3] on a queue with nothing running or waiting, fresh or drained by a failure, the idle promise is already resolved", async () => {
  const fresh = new KeyedQueue(1);
  assert.equal(fresh.running, 0);
  assert.equal(fresh.waiting, 0);
  let freshIdle = false;
  fresh.onIdle().then(() => {
    freshIdle = true;
  });
  await flush();
  assert.equal(freshIdle, true);

  const drained = new KeyedQueue(1);
  const error = new Error("failed");
  await rejectsWith(drained.submit("a", () => Promise.reject(error)), error);
  await flush();
  assert.equal(drained.running, 0);
  assert.equal(drained.waiting, 0);
  let drainedIdle = false;
  drained.onIdle().then(() => {
    drainedIdle = true;
  });
  await flush();
  assert.equal(drainedIdle, true);
});

test("[unhappy-4] creating a queue with a cap of 0, 2.5 or -1 fails with an error", () => {
  assert.throws(() => new KeyedQueue(0), Error);
  assert.throws(() => new KeyedQueue(2.5), Error);
  assert.throws(() => new KeyedQueue(-1), Error);
});

test("[unhappy-4] a cap of 1 is accepted while 0.5, 1.5 and NaN are refused", () => {
  assert.doesNotThrow(() => new KeyedQueue(1));
  assert.throws(() => new KeyedQueue(0.5), Error);
  assert.throws(() => new KeyedQueue(1.5), Error);
  assert.throws(() => new KeyedQueue(Number.NaN), Error);
});
