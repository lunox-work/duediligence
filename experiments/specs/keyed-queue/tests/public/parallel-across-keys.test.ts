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

test("[happy-2] with a cap of 2, jobs with two different keys have both started before either settles", async () => {
  const queue = new KeyedQueue(2);
  const a = new Controlled<string>();
  const b = new Controlled<string>();

  const pa = queue.submit("a", a.fn);
  const pb = queue.submit("b", b.fn);
  await flush();

  assert.equal(a.started, true);
  assert.equal(b.started, true);

  a.resolve("A");
  b.resolve("B");
  assert.deepEqual(await Promise.all([pa, pb]), ["A", "B"]);
});

test("[happy-2] with a cap of 3, jobs with three different keys fill every slot at once", async () => {
  const queue = new KeyedQueue(3);
  const a = new Controlled<string>();
  const b = new Controlled<string>();
  const c = new Controlled<string>();

  const pa = queue.submit("a", a.fn);
  const pb = queue.submit("b", b.fn);
  const pc = queue.submit("c", c.fn);
  await flush();

  assert.equal(a.started, true);
  assert.equal(b.started, true);
  assert.equal(c.started, true);

  c.resolve("C");
  b.resolve("B");
  a.resolve("A");
  assert.deepEqual(await Promise.all([pa, pb, pc]), ["A", "B", "C"]);
});

test("[boundary-2] with a cap of 2, a third job with a third key waits until one of the running jobs settles", async () => {
  const queue = new KeyedQueue(2);
  const a = new Controlled<string>();
  const b = new Controlled<string>();
  const c = new Controlled<string>();

  queue.submit("a", a.fn);
  const pb = queue.submit("b", b.fn);
  const pc = queue.submit("c", c.fn);
  await flush();

  assert.equal(a.started, true);
  assert.equal(b.started, true);
  assert.equal(c.started, false);

  b.resolve("B");
  assert.equal(await pb, "B");
  await flush();
  assert.equal(c.started, true);

  c.resolve("C");
  assert.equal(await pc, "C");
});

test("[boundary-2] with a cap of 1, jobs waiting for the slot start one at a time in submission order", async () => {
  const queue = new KeyedQueue(1);
  const log: string[] = [];
  const a = new Controlled<string>("a", log);
  const b = new Controlled<string>("b", log);
  const c = new Controlled<string>("c", log);

  const pa = queue.submit("a", a.fn);
  const pb = queue.submit("b", b.fn);
  const pc = queue.submit("c", c.fn);
  await flush();
  assert.deepEqual(log, ["a"]);

  a.resolve("A");
  await flush();
  assert.deepEqual(log, ["a", "b"]);

  b.resolve("B");
  await flush();
  assert.deepEqual(log, ["a", "b", "c"]);

  c.resolve("C");
  assert.deepEqual(await Promise.all([pa, pb, pc]), ["A", "B", "C"]);
});

test("[boundary-3] a job for a free key starts at once although a job for a busy key was submitted before it", async () => {
  const queue = new KeyedQueue(2);
  const a1 = new Controlled<string>();
  const a2 = new Controlled<string>();
  const b = new Controlled<string>();

  const pa1 = queue.submit("a", a1.fn);
  await flush();
  const pa2 = queue.submit("a", a2.fn);
  const pb = queue.submit("b", b.fn);
  await flush();

  assert.equal(b.started, true);
  assert.equal(a2.started, false);

  a1.resolve("A1");
  assert.equal(await pa1, "A1");
  await flush();
  assert.equal(a2.started, true);

  a2.resolve("A2");
  b.resolve("B");
  assert.deepEqual(await Promise.all([pa2, pb]), ["A2", "B"]);
});

test("[boundary-3] a freed slot goes to the next job whose key is free, past waiting jobs whose key is busy", async () => {
  const queue = new KeyedQueue(2);
  const a1 = new Controlled<string>();
  const a2 = new Controlled<string>();
  const a3 = new Controlled<string>();
  const b = new Controlled<string>();
  const c = new Controlled<string>();

  queue.submit("a", a1.fn);
  await flush();
  queue.submit("a", a2.fn);
  queue.submit("a", a3.fn);
  const pb = queue.submit("b", b.fn);
  const pc = queue.submit("c", c.fn);
  await flush();

  assert.equal(b.started, true);
  assert.equal(c.started, false);

  b.resolve("B");
  assert.equal(await pb, "B");
  await flush();

  assert.equal(c.started, true);
  assert.equal(a2.started, false);
  assert.equal(a3.started, false);

  c.resolve("C");
  assert.equal(await pc, "C");
});
