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

// Extends "[happy-1] three jobs with one key run one at a time in submission order":
// twelve jobs on one key, on a cap far above one.
test("[happy-1] twelve jobs with one key on a cap of 8 run strictly one at a time in submission order", async () => {
  const queue = new KeyedQueue(8);
  const log: string[] = [];
  const jobs = Array.from({ length: 12 }, (_, i) => new Controlled<number>(`j${i}`, log));
  const submissions = jobs.map((job) => queue.submit("task", job.fn));
  await flush();
  assert.deepEqual(log, ["j0"]);

  for (let i = 0; i < jobs.length; i++) {
    jobs[i].resolve(i * 10);
    assert.equal(await submissions[i], i * 10);
    await flush();
    const expected = jobs.slice(0, Math.min(i + 2, jobs.length)).map((_, k) => `j${k}`);
    assert.deepEqual(log, expected);
  }
  assert.deepEqual(
    jobs.map((job) => job.calls),
    jobs.map(() => 1),
  );
});

// Extends "[happy-1] the second job with one key starts only after the first settles":
// a later job whose promise was settled early still waits for its turn.
test("[happy-1] jobs whose promises settle early still start only in submission order after the one before settles", async () => {
  const queue = new KeyedQueue(4);
  const log: string[] = [];
  const a = new Controlled<string>("a", log);
  const b = new Controlled<string>("b", log);
  const c = new Controlled<string>("c", log);

  const pa = queue.submit("task", a.fn);
  const pb = queue.submit("task", b.fn);
  const pc = queue.submit("task", c.fn);
  c.resolve("C");
  b.resolve("B");
  await flush();
  assert.deepEqual(log, ["a"]);

  a.resolve("A");
  assert.deepEqual(await Promise.all([pa, pb, pc]), ["A", "B", "C"]);
  assert.deepEqual(log, ["a", "b", "c"]);
});

// Extends "[happy-1] the second job with one key starts only after the first settles":
// two keys interleaved, each serial on its own.
test("[happy-1] two keys submitted interleaved are each serial, and each second job waits only for its own key", async () => {
  const queue = new KeyedQueue(4);
  const a1 = new Controlled<string>();
  const b1 = new Controlled<string>();
  const a2 = new Controlled<string>();
  const b2 = new Controlled<string>();

  const pa1 = queue.submit("a", a1.fn);
  const pb1 = queue.submit("b", b1.fn);
  const pa2 = queue.submit("a", a2.fn);
  const pb2 = queue.submit("b", b2.fn);
  await flush();
  assert.equal(a1.started, true);
  assert.equal(b1.started, true);
  assert.equal(a2.started, false);
  assert.equal(b2.started, false);

  b1.resolve("B1");
  assert.equal(await pb1, "B1");
  await flush();
  assert.equal(b2.started, true);
  assert.equal(a2.started, false);

  a1.resolve("A1");
  assert.equal(await pa1, "A1");
  await flush();
  assert.equal(a2.started, true);

  b2.resolve("B2");
  a2.resolve("A2");
  assert.deepEqual(await Promise.all([pa2, pb2]), ["A2", "B2"]);
});

// Extends "[happy-1] the second job with one key starts only after the first settles":
// keys that collide with names an object already carries, and the empty key.
for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty", ""]) {
  test(`[happy-1] jobs with the key ${JSON.stringify(key)} run, one at a time, in order`, async () => {
    const queue = new KeyedQueue(4);
    const first = new Controlled<string>();
    const second = new Controlled<string>();

    const p1 = queue.submit(key, first.fn);
    const p2 = queue.submit(key, second.fn);
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
}

// Extends "[happy-1] the second job with one key starts only after the first settles":
// each submission resolves with its own job's value, by identity.
test("[happy-1] each submission resolves with the very value its own job resolved with", async () => {
  const queue = new KeyedQueue(2);
  const values = [{ n: 1 }, undefined, null, 0, "", { n: 2 }];
  const submissions = values.map((value) => queue.submit<unknown>("task", async () => value));
  const results = await Promise.all(submissions);
  assert.equal(results.length, values.length);
  for (let i = 0; i < values.length; i++) {
    assert.equal(results[i], values[i]);
  }
});

// Extends "[happy-1] the second job with one key starts only after the first settles":
// a key that has drained is free again, and serial again.
test("[happy-1] a key used again after its jobs settled runs its next job and serialises the ones after it", async () => {
  const queue = new KeyedQueue(4);
  assert.equal(await queue.submit("task", async () => "first"), "first");

  const second = new Controlled<string>();
  const third = new Controlled<string>();
  const p2 = queue.submit("task", second.fn);
  const p3 = queue.submit("task", third.fn);
  await flush();
  assert.equal(second.started, true);
  assert.equal(third.started, false);

  second.resolve("second");
  assert.equal(await p2, "second");
  await flush();
  assert.equal(third.started, true);
  third.resolve("third");
  assert.equal(await p3, "third");
});

// Extends "[happy-1] three jobs with one key run one at a time in submission order":
// jobs that settle on their own, never two of one key at once.
test("[happy-1] ten self-settling jobs with one key never overlap and finish in submission order", async () => {
  const queue = new KeyedQueue(10);
  let active = 0;
  let maxActive = 0;
  const order: number[] = [];
  const submissions = Array.from({ length: 10 }, (_, i) =>
    queue.submit("task", async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      order.push(i);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active--;
      return i;
    }),
  );
  assert.deepEqual(await Promise.all(submissions), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(maxActive, 1);
  assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

// Extends "[boundary-1] a job whose promise rejects rejects its submission and the next job with its key still runs after it":
// rejections with values that are not errors, failures alternating with successes.
test("[boundary-1] alternating failures and successes on one key each settle their own submission, in order", async () => {
  const queue = new KeyedQueue(3);
  const log: string[] = [];
  const reasonObject = { code: 7 };
  const j1 = new Controlled<string>("j1", log);
  const j2 = new Controlled<string>("j2", log);
  const j3 = new Controlled<string>("j3", log);
  const j4 = new Controlled<string>("j4", log);

  const r1 = rejectsWith(queue.submit("task", j1.fn), "nope");
  const p2 = queue.submit("task", j2.fn);
  const r3 = rejectsWith(queue.submit("task", j3.fn), reasonObject);
  const p4 = queue.submit("task", j4.fn);
  await flush();
  assert.deepEqual(log, ["j1"]);

  j1.reject("nope");
  await r1;
  await flush();
  assert.deepEqual(log, ["j1", "j2"]);

  j2.resolve("two");
  assert.equal(await p2, "two");
  await flush();
  assert.deepEqual(log, ["j1", "j2", "j3"]);

  j3.reject(reasonObject);
  await r3;
  await flush();
  assert.deepEqual(log, ["j1", "j2", "j3", "j4"]);

  j4.resolve("four");
  assert.equal(await p4, "four");
});

// Extends "[boundary-1] two failed jobs in a row on a cap of 1 neither block the key nor keep the slot":
// the freed slot goes to a job with another key.
test("[boundary-1] on a cap of 1, a failed job frees the slot for a job with another key", async () => {
  const queue = new KeyedQueue(1);
  const error = new Error("failed");
  const failing = new Controlled<string>();
  const other = new Controlled<string>();

  const r = rejectsWith(queue.submit("a", failing.fn), error);
  const p = queue.submit("b", other.fn);
  await flush();
  assert.equal(other.started, false);

  failing.reject(error);
  await r;
  await flush();
  assert.equal(other.started, true);
  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 0);

  other.resolve("other");
  assert.equal(await p, "other");
});

// Extends "[boundary-1] a job whose promise rejects rejects its submission and the next job with its key still runs after it":
// a job whose returned promise is already rejected.
test("[boundary-1] a job returning an already rejected promise does not block the key, and the next job still waits for it", async () => {
  const queue = new KeyedQueue(2);
  const error = new Error("already failed");
  const first = new Controlled<string>();
  const second = new Controlled<string>();

  const p1 = queue.submit("task", first.fn);
  const r2 = rejectsWith(
    queue.submit("task", () => Promise.reject(error)),
    error,
  );
  const p3 = queue.submit("task", second.fn);
  await flush();
  assert.equal(second.started, false);

  first.resolve("one");
  assert.equal(await p1, "one");
  await r2;
  await flush();
  assert.equal(second.started, true);

  second.resolve("two");
  assert.equal(await p3, "two");
});

// Extends "[unhappy-1] a job that throws synchronously rejects its submission with the thrown error and a later job with its key runs":
// thrown values that are not errors.
for (const thrown of ["a string", 42, { reason: "object" }]) {
  test(`[unhappy-1] a job that throws ${JSON.stringify(thrown)} synchronously rejects its submission with that very value, and its key is free`, async () => {
    const queue = new KeyedQueue(1);
    const throwing: Job<string> = () => {
      throw thrown;
    };
    await rejectsWith(queue.submit("task", throwing), thrown);

    const next = new Controlled<string>();
    const p = queue.submit("task", next.fn);
    await flush();
    assert.equal(next.started, true);
    next.resolve("next");
    assert.equal(await p, "next");
  });
}

// Extends "[unhappy-1] a job that throws synchronously when its turn comes neither blocks the key behind it nor keeps a slot":
// the throwing job waits for the slot, and the job behind it has another key.
test("[unhappy-1] on a cap of 1, a job that throws when it gets the slot hands the slot to a job with another key", async () => {
  const queue = new KeyedQueue(1);
  const error = new Error("thrown");
  const first = new Controlled<string>();
  let throwingCalls = 0;
  const throwing: Job<string> = () => {
    throwingCalls++;
    throw error;
  };
  const other = new Controlled<string>();

  const p1 = queue.submit("a", first.fn);
  const r2 = rejectsWith(queue.submit("x", throwing), error);
  const p3 = queue.submit("b", other.fn);
  await flush();
  assert.equal(throwingCalls, 0);
  assert.equal(other.started, false);

  first.resolve("one");
  assert.equal(await p1, "one");
  await r2;
  await flush();
  assert.equal(throwingCalls, 1);
  assert.equal(other.started, true);

  other.resolve("other");
  assert.equal(await p3, "other");
  await flush();
  assert.equal(queue.running, 0);
  assert.equal(queue.waiting, 0);
});

// Extends "[unhappy-1] a job that throws synchronously rejects its submission with the thrown error and a later job with its key runs":
// several throwing jobs in a row on one key.
test("[unhappy-1] three jobs in a row that throw synchronously each reject with their own error, and the job after them runs", async () => {
  const queue = new KeyedQueue(1);
  const errors = [new Error("e1"), new Error("e2"), new Error("e3")];
  const calls: number[] = [];
  const rejections = errors.map((error, i) =>
    rejectsWith(
      queue.submit("task", () => {
        calls.push(i);
        throw error;
      }),
      error,
    ),
  );
  const last = queue.submit("task", async () => "last");
  await Promise.all(rejections);
  assert.equal(await last, "last");
  assert.deepEqual(calls, [0, 1, 2]);
});
