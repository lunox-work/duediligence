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

// Extends "[unhappy-2] aborting a job waiting behind its key rejects it with the reason, never calls it, and a later job for the key waits for the first":
// the job behind the aborted one was submitted before the abort, and the reason is not an error.
test("[unhappy-2] aborting the middle of three jobs with one key, with a string reason, rejects it with that string and the third runs after the first", async () => {
  const queue = new KeyedQueue(4);
  const log: string[] = [];
  const first = new Controlled<string>("first", log);
  const second = new Controlled<string>("second", log);
  const third = new Controlled<string>("third", log);
  const controller = new AbortController();

  const p1 = queue.submit("a", first.fn);
  const r2 = rejectsWith(queue.submit("a", second.fn, controller.signal), "stop");
  const p3 = queue.submit("a", third.fn);
  await flush();

  controller.abort("stop");
  await r2;
  await flush();
  assert.deepEqual(log, ["first"]);

  first.resolve("one");
  assert.equal(await p1, "one");
  await flush();
  assert.deepEqual(log, ["first", "third"]);

  third.resolve("three");
  assert.equal(await p3, "three");
  assert.equal(second.calls, 0);
});

// Extends "[unhappy-2] aborting a job waiting behind its key rejects it with the reason, never calls it, and a later job for the key waits for the first":
// the rejection comes from the abort itself, while the job ahead is still unsettled.
test("[unhappy-2] a waiting job's submission rejects as soon as its signal is aborted, while the job ahead of it is still running", async () => {
  const queue = new KeyedQueue(2);
  const first = new Controlled<string>();
  const second = new Controlled<string>();
  const controller = new AbortController();
  const reason = new Error("cancelled");

  queue.submit("a", first.fn);
  const state = track(queue.submit("a", second.fn, controller.signal));
  await flush();
  assert.equal(state.settled, false);

  controller.abort(reason);
  await flush();
  assert.equal(state.settled, true);
  assert.equal(state.rejected, true);
  assert.equal(state.error, reason);
  assert.equal(first.started, true);
  assert.equal(second.calls, 0);
});

// Extends "[unhappy-2] aborting without a reason a job waiting for a slot rejects it with the signal's default reason and it never runs":
// more jobs wait behind the aborted one and keep their order.
test("[unhappy-2] on a cap of 1, aborting the first of three jobs waiting for the slot leaves the other two to start in order", async () => {
  const queue = new KeyedQueue(1);
  const log: string[] = [];
  const a = new Controlled<string>("a", log);
  const b = new Controlled<string>("b", log);
  const c = new Controlled<string>("c", log);
  const d = new Controlled<string>("d", log);
  const controller = new AbortController();

  const pa = queue.submit("a", a.fn);
  const rb = assert.rejects(queue.submit("b", b.fn, controller.signal), (error: unknown) => {
    assert.equal(error, controller.signal.reason);
    return true;
  });
  const pc = queue.submit("c", c.fn);
  const pd = queue.submit("d", d.fn);
  await flush();
  assert.equal(queue.waiting, 3);

  controller.abort();
  await rb;
  await flush();
  assert.equal(queue.waiting, 2);
  assert.equal(queue.running, 1);

  a.resolve("A");
  assert.equal(await pa, "A");
  await flush();
  assert.deepEqual(log, ["a", "c"]);

  c.resolve("C");
  assert.equal(await pc, "C");
  await flush();
  assert.deepEqual(log, ["a", "c", "d"]);

  d.resolve("D");
  assert.equal(await pd, "D");
  assert.equal(b.calls, 0);
});

// Extends "[unhappy-2] aborting without a reason a job waiting for a slot rejects it with the signal's default reason and it never runs":
// one signal shared by two waiting jobs with different keys.
test("[unhappy-2] one signal aborted for two waiting jobs rejects both with its reason and neither is ever called", async () => {
  const queue = new KeyedQueue(1);
  const running = new Controlled<string>();
  const x = new Controlled<string>();
  const y = new Controlled<string>();
  const after = new Controlled<string>();
  const controller = new AbortController();
  const reason = { why: "shutdown" };

  const p = queue.submit("r", running.fn);
  const rx = rejectsWith(queue.submit("x", x.fn, controller.signal), reason);
  const ry = rejectsWith(queue.submit("y", y.fn, controller.signal), reason);
  const pAfter = queue.submit("z", after.fn);
  await flush();

  controller.abort(reason);
  await Promise.all([rx, ry]);

  running.resolve("R");
  assert.equal(await p, "R");
  await flush();
  assert.equal(after.started, true);

  after.resolve("after");
  assert.equal(await pAfter, "after");
  assert.equal(x.calls, 0);
  assert.equal(y.calls, 0);
});

// Extends "[unhappy-2] aborting a job waiting behind its key rejects it with the reason, never calls it, and a later job for the key waits for the first":
// only the job whose signal is aborted is cancelled.
test("[unhappy-2] aborting one of two waiting jobs, each with its own signal, cancels only that one", async () => {
  const queue = new KeyedQueue(4);
  const first = new Controlled<string>();
  const kept = new Controlled<string>();
  const dropped = new Controlled<string>();
  const keptController = new AbortController();
  const droppedController = new AbortController();
  const reason = new Error("drop");

  const p1 = queue.submit("a", first.fn);
  const pKept = queue.submit("a", kept.fn, keptController.signal);
  const rDropped = rejectsWith(queue.submit("a", dropped.fn, droppedController.signal), reason);
  await flush();

  droppedController.abort(reason);
  await rDropped;

  first.resolve("one");
  assert.equal(await p1, "one");
  await flush();
  assert.equal(kept.started, true);

  kept.resolve("kept");
  assert.equal(await pKept, "kept");
  await flush();
  assert.equal(dropped.calls, 0);
  assert.equal(queue.running, 0);
  assert.equal(queue.waiting, 0);
});

// Extends "[unhappy-2] aborting a job waiting behind its key rejects it with the reason, never calls it, and a later job for the key waits for the first":
// the aborted job leaves nothing behind that would keep the queue from being idle.
test("[unhappy-2] when the only waiting job is aborted, the queue is idle once the running job settles", async () => {
  const queue = new KeyedQueue(1);
  const first = new Controlled<string>();
  const second = new Controlled<string>();
  const controller = new AbortController();
  const reason = new Error("cancelled");

  const p1 = queue.submit("a", first.fn);
  const r2 = rejectsWith(queue.submit("a", second.fn, controller.signal), reason);
  await flush();
  controller.abort(reason);
  await r2;

  let idle = false;
  queue.onIdle().then(() => {
    idle = true;
  });
  await flush();
  assert.equal(idle, false);

  first.resolve("one");
  assert.equal(await p1, "one");
  await flush();
  assert.equal(idle, true);
  assert.equal(second.calls, 0);
});

// Extends "[boundary-4] aborting a started job leaves its submission to settle as the job's promise settles":
// the job waited behind its key before it started, so it carried its signal while waiting.
test("[boundary-4] aborting a job that waited behind its key and then started leaves its submission to resolve with its value", async () => {
  const queue = new KeyedQueue(4);
  const first = new Controlled<string>();
  const second = new Controlled<string>();
  const third = new Controlled<string>();
  const controller = new AbortController();

  const p1 = queue.submit("a", first.fn);
  const s2 = track(queue.submit("a", second.fn, controller.signal));
  const p3 = queue.submit("a", third.fn);
  await flush();
  assert.equal(second.started, false);

  first.resolve("one");
  assert.equal(await p1, "one");
  await flush();
  assert.equal(second.started, true);

  controller.abort(new Error("too late"));
  await flush();
  assert.equal(s2.settled, false);
  assert.equal(third.started, false);

  second.resolve("two");
  await flush();
  assert.equal(s2.settled, true);
  assert.equal(s2.rejected, false);
  assert.equal(s2.value, "two");
  assert.equal(second.calls, 1);
  assert.equal(third.started, true);

  third.resolve("three");
  assert.equal(await p3, "three");
});

// Extends "[boundary-4] an aborted started job keeps its slot and its key until it settles, and its submission rejects with the job's own error":
// the job waited for the slot before it started.
test("[boundary-4] on a cap of 1, aborting a job that waited for the slot and then started keeps the slot taken and its own error", async () => {
  const queue = new KeyedQueue(1);
  const first = new Controlled<string>();
  const second = new Controlled<string>();
  const third = new Controlled<string>();
  const controller = new AbortController();
  const jobError = new Error("second failed");

  const p1 = queue.submit("a", first.fn);
  const r2 = rejectsWith(queue.submit("b", second.fn, controller.signal), jobError);
  const p3 = queue.submit("c", third.fn);
  await flush();

  first.resolve("one");
  assert.equal(await p1, "one");
  await flush();
  assert.equal(second.started, true);

  controller.abort(new Error("too late"));
  await flush();
  assert.equal(third.started, false);
  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 1);

  second.reject(jobError);
  await r2;
  await flush();
  assert.equal(third.started, true);

  third.resolve("three");
  assert.equal(await p3, "three");
});

// Extends "[boundary-4] aborting a started job leaves its submission to settle as the job's promise settles":
// two started jobs share one signal, on a full cap of 2.
test("[boundary-4] with a cap of 2, aborting the shared signal of two started jobs leaves both slots taken until each settles", async () => {
  const queue = new KeyedQueue(2);
  const a = new Controlled<string>();
  const b = new Controlled<string>();
  const c = new Controlled<string>();
  const controller = new AbortController();

  const sa = track(queue.submit("a", a.fn, controller.signal));
  const sb = track(queue.submit("b", b.fn, controller.signal));
  const pc = queue.submit("c", c.fn);
  await flush();
  assert.equal(a.started, true);
  assert.equal(b.started, true);

  controller.abort();
  await flush();
  assert.equal(sa.settled, false);
  assert.equal(sb.settled, false);
  assert.equal(c.started, false);
  assert.equal(queue.running, 2);
  assert.equal(queue.waiting, 1);

  a.resolve("A");
  await flush();
  assert.equal(sa.value, "A");
  assert.equal(sb.settled, false);
  assert.equal(c.started, true);

  b.resolve("B");
  c.resolve("C");
  await flush();
  assert.equal(sb.value, "B");
  assert.equal(await pc, "C");
});

// Extends "[boundary-4] aborting a started job leaves its submission to settle as the job's promise settles":
// the signal is aborted only after the job has settled.
test("[boundary-4] aborting the signal of a job that has already settled leaves its result and its key untouched", async () => {
  const queue = new KeyedQueue(1);
  const controller = new AbortController();

  const p = queue.submit("a", async () => "done", controller.signal);
  assert.equal(await p, "done");

  controller.abort(new Error("after the fact"));
  await flush();
  assert.equal(await p, "done");

  const next = new Controlled<string>();
  const pNext = queue.submit("a", next.fn);
  await flush();
  assert.equal(next.started, true);
  next.resolve("next");
  assert.equal(await pNext, "next");
});

// Extends "[unhappy-3] a job submitted with an already aborted signal is rejected with the signal's reason and never called":
// reasons that are not errors, and the default reason.
for (const [label, makeSignal] of [
  ["a string reason", () => AbortSignal.abort("gone")],
  ["a number reason", () => AbortSignal.abort(0)],
  ["no reason", () => AbortSignal.abort()],
] as const) {
  test(`[unhappy-3] a job submitted with a signal already aborted with ${label} is rejected with that signal's reason and never called`, async () => {
    const queue = new KeyedQueue(2);
    const signal = makeSignal();
    const job = new Controlled<string>();

    await rejectsWith(queue.submit("a", job.fn, signal), signal.reason);
    await flush();
    assert.equal(job.calls, 0);
  });
}

// Extends "[unhappy-3] a job submitted with an already aborted signal is rejected with the signal's reason and never called":
// the key is busy and the only slot is taken, and the refusal does not wait for either.
test("[unhappy-3] a job with an already aborted signal is refused at once even while its key is busy and the only slot is taken", async () => {
  const queue = new KeyedQueue(1);
  const running = new Controlled<string>();
  const refused = new Controlled<string>();
  const reason = new Error("already cancelled");

  queue.submit("a", running.fn);
  await flush();
  const state = track(queue.submit("a", refused.fn, AbortSignal.abort(reason)));
  await flush();

  assert.equal(state.settled, true);
  assert.equal(state.rejected, true);
  assert.equal(state.error, reason);
  assert.equal(running.started, true);
  assert.equal(refused.calls, 0);
  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 0);
});

// Extends "[unhappy-3] a refused job takes neither the only slot nor its key, so the next job with its key runs at once":
// the refused job is submitted between two jobs of its key and takes no place in their order.
test("[unhappy-3] a refused job submitted between two jobs of its key takes no place in line, and is never called later", async () => {
  const queue = new KeyedQueue(1);
  const log: string[] = [];
  const first = new Controlled<string>("first", log);
  const refused = new Controlled<string>("refused", log);
  const last = new Controlled<string>("last", log);
  const controller = new AbortController();
  controller.abort("no");

  const p1 = queue.submit("a", first.fn);
  const refusal = track(queue.submit("a", refused.fn, controller.signal));
  const p3 = queue.submit("a", last.fn);
  await flush();
  assert.equal(refusal.settled, true);
  assert.equal(refusal.rejected, true);
  assert.equal(refusal.error, "no");
  assert.equal(queue.waiting, 1);

  first.resolve("one");
  assert.equal(await p1, "one");
  await flush();
  assert.deepEqual(log, ["first", "last"]);

  last.resolve("last");
  assert.equal(await p3, "last");
  await flush();
  assert.deepEqual(log, ["first", "last"]);
  assert.equal(refused.calls, 0);
});
