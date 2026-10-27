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

// Extends "[happy-3] with a cap of 1, the queue reports 1 running and 1 waiting, and is idle only after both jobs settle":
// a cap of 2, with jobs waiting both on a busy key and on a full cap.
test("[happy-3] with a cap of 2, jobs waiting on a busy key and jobs waiting for a slot both count as waiting", async () => {
  const queue = new KeyedQueue(2);
  const a1 = new Controlled<string>();
  const a2 = new Controlled<string>();
  const b = new Controlled<string>();
  const c = new Controlled<string>();

  const pa1 = queue.submit("a", a1.fn);
  const pa2 = queue.submit("a", a2.fn);
  const pb = queue.submit("b", b.fn);
  const pc = queue.submit("c", c.fn);
  await flush();
  assert.equal(queue.running, 2);
  assert.equal(queue.waiting, 2);

  b.resolve("b");
  assert.equal(await pb, "b");
  await flush();
  assert.equal(c.started, true);
  assert.equal(queue.running, 2);
  assert.equal(queue.waiting, 1);

  a1.resolve("a1");
  assert.equal(await pa1, "a1");
  await flush();
  assert.equal(a2.started, true);
  assert.equal(queue.running, 2);
  assert.equal(queue.waiting, 0);

  c.resolve("c");
  assert.equal(await pc, "c");
  await flush();
  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 0);

  a2.resolve("a2");
  assert.equal(await pa2, "a2");
  await flush();
  assert.equal(queue.running, 0);
  assert.equal(queue.waiting, 0);
});

// Extends "[happy-3] with a cap of 1, the queue reports 1 running and 1 waiting, and is idle only after both jobs settle":
// five jobs on a cap of 1, counted at every step.
test("[happy-3] with a cap of 1 and five jobs, the counts step from 1 running and 4 waiting down to none", async () => {
  const queue = new KeyedQueue(1);
  const jobs = Array.from({ length: 5 }, () => new Controlled<number>());
  const submissions = jobs.map((job, i) => queue.submit(`k${i % 2}`, job.fn));
  await flush();
  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 4);

  for (let i = 0; i < jobs.length; i++) {
    jobs[i].resolve(i);
    assert.equal(await submissions[i], i);
    await flush();
    assert.equal(queue.running, i < jobs.length - 1 ? 1 : 0);
    assert.equal(queue.waiting, Math.max(0, jobs.length - 2 - i));
  }
});

// Extends "[happy-3] with a cap of 1, the queue reports 1 running and 1 waiting, and is idle only after both jobs settle":
// several idle promises taken at different moments, and the last job fails.
test("[happy-3] every idle promise taken while busy resolves, and only once the last job has settled, even when it fails", async () => {
  const queue = new KeyedQueue(2);
  const a = new Controlled<string>();
  const b = new Controlled<string>();
  const c = new Controlled<string>();
  const error = new Error("last failed");

  const pa = queue.submit("a", a.fn);
  const pb = queue.submit("a", b.fn);
  const rc = rejectsWith(queue.submit("c", c.fn), error);
  await flush();

  const early = track(queue.onIdle());
  a.resolve("a");
  assert.equal(await pa, "a");
  await flush();
  const middle = track(queue.onIdle());
  await flush();
  assert.equal(early.settled, false);
  assert.equal(middle.settled, false);

  b.resolve("b");
  assert.equal(await pb, "b");
  await flush();
  assert.equal(early.settled, false);
  assert.equal(middle.settled, false);

  c.reject(error);
  await rc;
  await flush();
  assert.equal(early.settled, true);
  assert.equal(early.rejected, false);
  assert.equal(middle.settled, true);
  assert.equal(middle.rejected, false);
});

// Extends "[happy-3] on a queue with nothing running or waiting, fresh or drained by a failure, the idle promise is already resolved":
// the queue becomes busy again after it has been idle.
test("[happy-3] after a queue has been idle and is busy again, a new idle promise waits for the new work", async () => {
  const queue = new KeyedQueue(1);
  assert.equal(await queue.submit("a", async () => "first"), "first");
  await flush();
  const before = track(queue.onIdle());
  await flush();
  assert.equal(before.settled, true);

  const job = new Controlled<string>();
  const p = queue.submit("b", job.fn);
  await flush();
  assert.equal(queue.running, 1);

  const idle = track(queue.onIdle());
  await flush();
  assert.equal(idle.settled, false);

  job.resolve("second");
  assert.equal(await p, "second");
  await flush();
  assert.equal(idle.settled, true);
  assert.equal(idle.rejected, false);
});

// Extends "[happy-3] on a queue with nothing running or waiting, fresh or drained by a failure, the idle promise is already resolved":
// the idle promise is taken on an idle queue and work is submitted straight after.
test("[happy-3] an idle promise taken on an idle queue is already resolved, even if a job that never settles is submitted right after", async () => {
  const queue = new KeyedQueue(2);
  const idle = track(queue.onIdle());
  const job = new Controlled<string>();
  queue.submit("a", job.fn);
  await flush();

  assert.equal(job.started, true);
  assert.equal(idle.settled, true);
  assert.equal(idle.rejected, false);
});

// Extends "[happy-3] on a queue with nothing running or waiting, fresh or drained by a failure, the idle promise is already resolved":
// drained by a job that threw, and by a waiting job that was aborted.
test("[happy-3] a queue drained by a job that threw and a waiting job that was aborted reports 0 and 0 and is idle", async () => {
  const queue = new KeyedQueue(1);
  const thrown = new Error("thrown");
  const reason = new Error("aborted");
  const controller = new AbortController();
  const waitingJob = new Controlled<string>();

  const r1 = rejectsWith(
    queue.submit("a", () => {
      throw thrown;
    }),
    thrown,
  );
  const blocker = new Controlled<string>();
  const pBlocker = queue.submit("b", blocker.fn);
  const r2 = rejectsWith(queue.submit("c", waitingJob.fn, controller.signal), reason);
  await r1;
  await flush();
  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 1);

  controller.abort(reason);
  await r2;
  await flush();
  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 0);

  blocker.resolve("b");
  assert.equal(await pBlocker, "b");
  await flush();
  assert.equal(queue.running, 0);
  assert.equal(queue.waiting, 0);

  const idle = track(queue.onIdle());
  await flush();
  assert.equal(idle.settled, true);
  assert.equal(idle.rejected, false);
  assert.equal(waitingJob.calls, 0);
});

// Extends "[unhappy-4] creating a queue with a cap of 0, 2.5 or -1 fails with an error":
// other negative and fractional caps, beside a valid cap that works.
test("[unhappy-4] a cap of 3 is accepted and runs jobs, while -3, -0, -0.5, -Infinity and 0.0001 are refused with an error", async () => {
  const queue = new KeyedQueue(3);
  assert.equal(await queue.submit("a", async () => "ok"), "ok");

  for (const cap of [-3, -0, -0.5, Number.NEGATIVE_INFINITY, 0.0001]) {
    assert.throws(() => new KeyedQueue(cap), Error, `cap ${cap} should be refused`);
  }
});

// Extends "[unhappy-4] a cap of 1 is accepted while 0.5, 1.5 and NaN are refused":
// large whole caps are accepted, fractions just off a whole number are refused.
test("[unhappy-4] caps of 2, 1000 and 2**31 are accepted while 2.0001, 3.5, 99.9 and -1000 are refused with an error", () => {
  for (const cap of [2, 1000, 2 ** 31]) {
    assert.doesNotThrow(() => new KeyedQueue(cap));
  }
  for (const cap of [2.0001, 3.5, 99.9, -1000]) {
    assert.throws(() => new KeyedQueue(cap), Error, `cap ${cap} should be refused`);
  }
});
