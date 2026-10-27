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

test("[unhappy-2] aborting a job waiting behind its key rejects it with the reason, never calls it, and a later job for the key waits for the first", async () => {
  const queue = new KeyedQueue(4);
  const first = new Controlled<string>();
  const second = new Controlled<string>();
  const third = new Controlled<string>();
  const controller = new AbortController();
  const reason = new Error("cancelled");

  const p1 = queue.submit("a", first.fn);
  const r2 = rejectsWith(queue.submit("a", second.fn, controller.signal), reason);
  await flush();
  assert.equal(second.started, false);

  controller.abort(reason);
  await r2;

  const p3 = queue.submit("a", third.fn);
  await flush();
  assert.equal(third.started, false);

  first.resolve("one");
  assert.equal(await p1, "one");
  await flush();
  assert.equal(third.started, true);
  assert.equal(second.calls, 0);

  third.resolve("three");
  assert.equal(await p3, "three");
  assert.equal(second.calls, 0);
});

test("[unhappy-2] aborting without a reason a job waiting for a slot rejects it with the signal's default reason and it never runs", async () => {
  const queue = new KeyedQueue(1);
  const a = new Controlled<string>();
  const b = new Controlled<string>();
  const c = new Controlled<string>();
  const controller = new AbortController();

  const pa = queue.submit("a", a.fn);
  const pb = queue.submit("b", b.fn, controller.signal);
  const rb = assert.rejects(pb, (error: unknown) => {
    assert.equal(error, controller.signal.reason);
    return true;
  });
  await flush();

  controller.abort();
  await rb;
  assert.notEqual(controller.signal.reason, undefined);

  const pc = queue.submit("c", c.fn);
  await flush();
  assert.equal(c.started, false);

  a.resolve("A");
  assert.equal(await pa, "A");
  await flush();
  assert.equal(c.started, true);
  assert.equal(b.calls, 0);

  c.resolve("C");
  assert.equal(await pc, "C");
  assert.equal(b.calls, 0);
});

test("[boundary-4] aborting a started job leaves its submission to settle as the job's promise settles", async () => {
  const queue = new KeyedQueue(4);
  const job = new Controlled<string>();
  const controller = new AbortController();

  let settled = false;
  const p = queue.submit("a", job.fn, controller.signal);
  p.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await flush();
  assert.equal(job.started, true);

  controller.abort(new Error("too late"));
  await flush();
  assert.equal(settled, false);

  job.resolve("done");
  assert.equal(await p, "done");
  assert.equal(job.calls, 1);
});

test("[boundary-4] an aborted started job keeps its slot and its key until it settles, and its submission rejects with the job's own error", async () => {
  const queue = new KeyedQueue(1);
  const job = new Controlled<string>();
  const sameKey = new Controlled<string>();
  const otherKey = new Controlled<string>();
  const controller = new AbortController();
  const jobError = new Error("job failed");

  const r = rejectsWith(queue.submit("a", job.fn, controller.signal), jobError);
  await flush();
  assert.equal(job.started, true);

  controller.abort(new Error("too late"));
  const pSame = queue.submit("a", sameKey.fn);
  const pOther = queue.submit("b", otherKey.fn);
  await flush();
  assert.equal(sameKey.started, false);
  assert.equal(otherKey.started, false);

  job.reject(jobError);
  await r;
  await flush();
  assert.equal(sameKey.started || otherKey.started, true);

  sameKey.resolve("same");
  otherKey.resolve("other");
  assert.deepEqual(await Promise.all([pSame, pOther]), ["same", "other"]);
});

test("[unhappy-3] a job submitted with an already aborted signal is rejected with the signal's reason and never called", async () => {
  const queue = new KeyedQueue(4);
  const reason = new Error("already cancelled");
  const signal = AbortSignal.abort(reason);
  const job = new Controlled<string>();

  await rejectsWith(queue.submit("a", job.fn, signal), reason);
  await flush();
  assert.equal(job.calls, 0);
});

test("[unhappy-3] a refused job takes neither the only slot nor its key, so the next job with its key runs at once", async () => {
  const queue = new KeyedQueue(1);
  const controller = new AbortController();
  controller.abort();
  const refused = new Controlled<string>();
  const next = new Controlled<string>();

  await rejectsWith(queue.submit("a", refused.fn, controller.signal), controller.signal.reason);

  const p = queue.submit("a", next.fn);
  await flush();
  assert.equal(next.started, true);
  assert.equal(refused.calls, 0);

  next.resolve("next");
  assert.equal(await p, "next");
});
