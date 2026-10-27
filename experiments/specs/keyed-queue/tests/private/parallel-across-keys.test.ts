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

/** Records how a promise settled, without letting a rejection go unhandled. */
function track<T>(promise: Promise<T>): { settled: boolean; value?: T; error?: unknown; rejected: boolean } {
  const state: { settled: boolean; value?: T; error?: unknown; rejected: boolean } = {
    settled: false,
    rejected: false,
  };
  promise.then(
    (value) => {
      state.settled = true;
      state.value = value;
    },
    (error: unknown) => {
      state.settled = true;
      state.rejected = true;
      state.error = error;
    },
  );
  return state;
}

// Extends "[happy-2] with a cap of 3, jobs with three different keys fill every slot at once":
// six keys on a cap of 6, settled in a scrambled order.
test("[happy-2] with a cap of 6, jobs with six different keys have all started before any settles", async () => {
  const queue = new KeyedQueue(6);
  const keys = ["k0", "k1", "k2", "k3", "k4", "k5"];
  const jobs = keys.map(() => new Controlled<string>());
  const submissions = keys.map((key, i) => queue.submit(key, jobs[i].fn));
  await flush();

  for (const job of jobs) {
    assert.equal(job.started, true);
  }
  assert.equal(queue.running, 6);

  for (const i of [3, 0, 5, 1, 4, 2]) {
    jobs[i].resolve(keys[i].toUpperCase());
  }
  assert.deepEqual(await Promise.all(submissions), ["K0", "K1", "K2", "K3", "K4", "K5"]);
});

// Extends "[happy-2] with a cap of 2, jobs with two different keys have both started before either settles":
// a cap far above the number of keys.
test("[happy-2] with a cap of 50, jobs with two different keys have both started before either settles", async () => {
  const queue = new KeyedQueue(50);
  const a = new Controlled<number>();
  const b = new Controlled<number>();

  const pa = queue.submit("a", a.fn);
  const pb = queue.submit("b", b.fn);
  await flush();
  assert.equal(a.started, true);
  assert.equal(b.started, true);

  b.resolve(2);
  a.resolve(1);
  assert.deepEqual(await Promise.all([pa, pb]), [1, 2]);
});

// Extends "[happy-2] with a cap of 2, jobs with two different keys have both started before either settles":
// keys that collide with names an object carries, the empty key, and keys differing only in case or spacing.
test("[happy-2] keys such as __proto__, constructor, the empty string, \"A\" and \"a \" are all different keys and run at once", async () => {
  const keys = ["__proto__", "constructor", "", "toString", "a", "A", "a "];
  const queue = new KeyedQueue(keys.length);
  const jobs = keys.map(() => new Controlled<number>());
  const submissions = keys.map((key, i) => queue.submit(key, jobs[i].fn));
  await flush();

  for (const job of jobs) {
    assert.equal(job.started, true);
  }

  jobs.forEach((job, i) => job.resolve(i));
  assert.deepEqual(await Promise.all(submissions), [0, 1, 2, 3, 4, 5, 6]);
});

// Extends "[boundary-2] with a cap of 2, a third job with a third key waits until one of the running jobs settles":
// the first running job is the one that settles, and it settles by failing.
test("[boundary-2] with a cap of 2, a third key's job starts once the first running job fails, not before", async () => {
  const queue = new KeyedQueue(2);
  const error = new Error("a failed");
  const a = new Controlled<string>();
  const b = new Controlled<string>();
  const c = new Controlled<string>();

  const ra = rejectsWith(queue.submit("a", a.fn), error);
  const pb = queue.submit("b", b.fn);
  const pc = queue.submit("c", c.fn);
  await flush();
  assert.equal(a.started, true);
  assert.equal(b.started, true);
  assert.equal(c.started, false);
  assert.equal(queue.running, 2);
  assert.equal(queue.waiting, 1);

  a.reject(error);
  await ra;
  await flush();
  assert.equal(c.started, true);
  assert.equal(queue.running, 2);
  assert.equal(queue.waiting, 0);

  b.resolve("B");
  c.resolve("C");
  assert.deepEqual(await Promise.all([pb, pc]), ["B", "C"]);
});

// Extends "[boundary-2] with a cap of 1, jobs waiting for the slot start one at a time in submission order":
// a cap of 2, five keys, slots freed in an order other than the start order.
test("[boundary-2] with a cap of 2 and five keys, waiting jobs take freed slots one each, in submission order", async () => {
  const queue = new KeyedQueue(2);
  const log: string[] = [];
  const names = ["a", "b", "c", "d", "e"];
  const jobs = names.map((name) => new Controlled<string>(name, log));
  const submissions = names.map((name, i) => queue.submit(name, jobs[i].fn));
  await flush();
  assert.deepEqual(log, ["a", "b"]);

  jobs[1].resolve("B");
  await flush();
  assert.deepEqual(log, ["a", "b", "c"]);

  jobs[0].resolve("A");
  await flush();
  assert.deepEqual(log, ["a", "b", "c", "d"]);

  jobs[3].resolve("D");
  await flush();
  assert.deepEqual(log, ["a", "b", "c", "d", "e"]);

  jobs[2].resolve("C");
  jobs[4].resolve("E");
  assert.deepEqual(await Promise.all(submissions), ["A", "B", "C", "D", "E"]);
});

// Extends "[boundary-2] with a cap of 1, jobs waiting for the slot start one at a time in submission order":
// two keys interleaved, so the next in submission order is never the key that just finished.
test("[boundary-2] with a cap of 1, jobs submitted a, b, a, b, a start in exactly that order", async () => {
  const queue = new KeyedQueue(1);
  const log: string[] = [];
  const a1 = new Controlled<string>("a1", log);
  const b1 = new Controlled<string>("b1", log);
  const a2 = new Controlled<string>("a2", log);
  const b2 = new Controlled<string>("b2", log);
  const a3 = new Controlled<string>("a3", log);

  const submissions = [
    queue.submit("a", a1.fn),
    queue.submit("b", b1.fn),
    queue.submit("a", a2.fn),
    queue.submit("b", b2.fn),
    queue.submit("a", a3.fn),
  ];
  await flush();
  assert.deepEqual(log, ["a1"]);

  a1.resolve("a1");
  await flush();
  assert.deepEqual(log, ["a1", "b1"]);

  b1.resolve("b1");
  await flush();
  assert.deepEqual(log, ["a1", "b1", "a2"]);

  a2.resolve("a2");
  await flush();
  assert.deepEqual(log, ["a1", "b1", "a2", "b2"]);

  b2.resolve("b2");
  await flush();
  assert.deepEqual(log, ["a1", "b1", "a2", "b2", "a3"]);

  a3.resolve("a3");
  assert.deepEqual(await Promise.all(submissions), ["a1", "b1", "a2", "b2", "a3"]);
});

// Extends "[boundary-2] with a cap of 2, a third job with a third key waits until one of the running jobs settles":
// many self-settling jobs over many keys never exceed the cap, and do reach it.
test("[boundary-2] with a cap of 3, thirty self-settling jobs over seven keys never run more than 3 at once or 2 of one key", async () => {
  const queue = new KeyedQueue(3);
  let active = 0;
  let maxActive = 0;
  const activePerKey = new Map<string, number>();
  let maxPerKey = 0;
  const submissions: Promise<number>[] = [];
  for (let i = 0; i < 30; i++) {
    const key = `k${(i * 3) % 7}`;
    submissions.push(
      queue.submit(key, async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        const perKey = (activePerKey.get(key) ?? 0) + 1;
        activePerKey.set(key, perKey);
        maxPerKey = Math.max(maxPerKey, perKey);
        for (let t = 0; t <= i % 3; t++) {
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
        activePerKey.set(key, (activePerKey.get(key) ?? 0) - 1);
        active--;
        return i;
      }),
    );
  }
  assert.deepEqual(
    await Promise.all(submissions),
    Array.from({ length: 30 }, (_, i) => i),
  );
  assert.equal(maxActive, 3);
  assert.equal(maxPerKey, 1);
});

// Extends "[boundary-3] a job for a free key starts at once although a job for a busy key was submitted before it":
// several jobs wait on the busy key, and two free keys are submitted after them.
test("[boundary-3] with a cap of 3, jobs for two free keys start at once past three jobs waiting on a busy key", async () => {
  const queue = new KeyedQueue(3);
  const log: string[] = [];
  const a1 = new Controlled<string>("a1", log);
  const a2 = new Controlled<string>("a2", log);
  const a3 = new Controlled<string>("a3", log);
  const a4 = new Controlled<string>("a4", log);
  const b = new Controlled<string>("b", log);
  const c = new Controlled<string>("c", log);

  const pa1 = queue.submit("a", a1.fn);
  const pa2 = queue.submit("a", a2.fn);
  const pa3 = queue.submit("a", a3.fn);
  const pa4 = queue.submit("a", a4.fn);
  const pb = queue.submit("b", b.fn);
  const pc = queue.submit("c", c.fn);
  await flush();
  assert.deepEqual(log, ["a1", "b", "c"]);
  assert.equal(queue.running, 3);
  assert.equal(queue.waiting, 3);

  a1.resolve("a1");
  await flush();
  assert.deepEqual(log, ["a1", "b", "c", "a2"]);

  a2.resolve("a2");
  await flush();
  assert.deepEqual(log, ["a1", "b", "c", "a2", "a3"]);

  a3.resolve("a3");
  a4.resolve("a4");
  b.resolve("b");
  c.resolve("c");
  assert.deepEqual(await Promise.all([pa1, pa2, pa3, pa4, pb, pc]), ["a1", "a2", "a3", "a4", "b", "c"]);
});

// Extends "[boundary-3] a freed slot goes to the next job whose key is free, past waiting jobs whose key is busy":
// free slots are left empty rather than given to a second job of a busy key.
test("[boundary-3] with a cap of 3 and a slot free, the second waiting job of a key does not start while the first of them runs", async () => {
  const queue = new KeyedQueue(3);
  const a1 = new Controlled<string>();
  const a2 = new Controlled<string>();
  const a3 = new Controlled<string>();
  const b = new Controlled<string>();

  const pa1 = queue.submit("a", a1.fn);
  const pa2 = queue.submit("a", a2.fn);
  const pa3 = queue.submit("a", a3.fn);
  const pb = queue.submit("b", b.fn);
  await flush();
  assert.equal(b.started, true);
  assert.equal(a2.started, false);
  assert.equal(a3.started, false);

  a1.resolve("a1");
  assert.equal(await pa1, "a1");
  await flush();
  assert.equal(a2.started, true);
  assert.equal(a3.started, false);
  assert.equal(queue.running, 2);
  assert.equal(queue.waiting, 1);

  a2.resolve("a2");
  assert.equal(await pa2, "a2");
  await flush();
  assert.equal(a3.started, true);

  a3.resolve("a3");
  b.resolve("b");
  assert.deepEqual(await Promise.all([pa3, pb]), ["a3", "b"]);
});

// Extends "[boundary-3] a freed slot goes to the next job whose key is free, past waiting jobs whose key is busy":
// two busy keys sit ahead of the waiting job that should get the slot.
test("[boundary-3] with a cap of 3, a freed slot goes past waiting jobs of two busy keys to a later job with a free key", async () => {
  const queue = new KeyedQueue(3);
  const a1 = new Controlled<string>();
  const b1 = new Controlled<string>();
  const a2 = new Controlled<string>();
  const b2 = new Controlled<string>();
  const c = new Controlled<string>();
  const d = new Controlled<string>();

  const pa1 = queue.submit("a", a1.fn);
  const pb1 = queue.submit("b", b1.fn);
  const pa2 = queue.submit("a", a2.fn);
  const pb2 = queue.submit("b", b2.fn);
  const pc = queue.submit("c", c.fn);
  const pd = queue.submit("d", d.fn);
  await flush();
  assert.equal(c.started, true);
  assert.equal(d.started, false);
  assert.equal(a2.started, false);
  assert.equal(b2.started, false);

  c.resolve("c");
  assert.equal(await pc, "c");
  await flush();
  assert.equal(d.started, true);
  assert.equal(a2.started, false);
  assert.equal(b2.started, false);

  a1.resolve("a1");
  b1.resolve("b1");
  await flush();
  assert.equal(a2.started, true);
  assert.equal(b2.started, true);

  a2.resolve("a2");
  b2.resolve("b2");
  d.resolve("d");
  assert.deepEqual(await Promise.all([pa1, pb1, pa2, pb2, pd]), ["a1", "b1", "a2", "b2", "d"]);
});
