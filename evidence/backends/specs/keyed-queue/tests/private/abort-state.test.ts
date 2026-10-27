import { test } from "node:test";
import assert from "node:assert/strict";
import { KeyedQueue } from "../../src/index.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function held<T>() {
  const completion = deferred<T>();
  let calls = 0;
  return {
    completion,
    get calls() { return calls; },
    job: () => { calls += 1; return completion.promise; },
  };
}

function observe<T>(promise: Promise<T>) {
  const state: { status: "pending" | "fulfilled" | "rejected" } = { status: "pending" };
  void promise.then(
    () => { state.status = "fulfilled"; },
    () => { state.status = "rejected"; },
  );
  return state;
}

async function checkpoint() {
  for (let i = 0; i < 32; i += 1) await Promise.resolve();
}

// Extends "aborting a waiting job rejects it without calling it and preserves its key":
// this job waits only for global capacity, not for a busy key.
test("[unhappy-2] abort removes a capacity waiter before any running job settles", async () => {
  const queue = new KeyedQueue(2);
  const blockers = [held<void>(), held<void>()];
  const active = blockers.map((job, i) => queue.submit(`blocker-${i}`, job.job));
  const controller = new AbortController();
  const reason = { capacityCancellation: 1 };
  const cancelledJob = held<string>();
  const cancelled = queue.submit("free-key", cancelledJob.job, controller.signal);
  const rejection = assert.rejects(cancelled, (error: unknown) => error === reason);
  const next = held<string>();
  const nextResult = queue.submit("free-key", next.job);
  await checkpoint();
  controller.abort(reason);
  await rejection;
  assert.equal(cancelledJob.calls, 0);
  assert.equal(queue.running, 2);
  assert.equal(queue.waiting, 1);
  blockers[1].completion.resolve(undefined);
  await active[1];
  await checkpoint();
  assert.equal(next.calls, 1);
  assert.equal(cancelledJob.calls, 0);
  next.completion.resolve("replacement");
  assert.equal(await nextResult, "replacement");
  blockers[0].completion.resolve(undefined);
  await active[0];
  await queue.onIdle();
  assert.equal(cancelledJob.calls, 0);
});

// Extends "cancelling a middle waiter preserves a primitive reason and later waiting jobs":
// remove the head, middle, and tail from a longer same-key waiting list.
test("[unhappy-2] cancelling several waiter positions preserves surviving FIFO and falsy reasons", async () => {
  const queue = new KeyedQueue(3);
  const first = held<void>();
  const initial = queue.submit("chain", first.job);
  const jobs = Array.from({ length: 9 }, () => held<number>());
  const controllers = jobs.map(() => new AbortController());
  const results = jobs.map((job, i) => queue.submit("chain", job.job, controllers[i].signal));
  const removed = [0, 4, 8];
  const reasons = [false, 0, null];
  const rejections = removed.map((i, j) => assert.rejects(results[i], (error: unknown) => Object.is(error, reasons[j])));
  await checkpoint();
  for (let j = removed.length - 1; j >= 0; j -= 1) controllers[removed[j]].abort(reasons[j]);
  await Promise.all(rejections);
  assert.equal(queue.waiting, 6);
  assert.deepEqual(jobs.map((job) => job.calls), jobs.map(() => 0));
  first.completion.resolve(undefined);
  await initial;
  for (let i = 0; i < jobs.length; i += 1) {
    if (removed.includes(i)) continue;
    await checkpoint();
    assert.equal(jobs[i].calls, 1);
    assert.deepEqual(jobs.slice(i + 1).map((job) => job.calls), jobs.slice(i + 1).map(() => 0));
    jobs[i].completion.resolve(i);
    assert.equal(await results[i], i);
  }
  await queue.onIdle();
  for (const i of removed) assert.equal(jobs[i].calls, 0);
});

test("[unhappy-2] one signal cancels every waiting submission across keys but leaves its running job", async () => {
  const queue = new KeyedQueue(2);
  const controller = new AbortController();
  const live = held<string>();
  const blocker = held<void>();
  const liveResult = queue.submit("a", live.job, controller.signal);
  const liveState = observe(liveResult);
  const blocked = queue.submit("b", blocker.job);
  const jobs = Array.from({ length: 7 }, () => held<void>());
  const reason = new Error("shared wait cancellation");
  const cancelled = jobs.map((job, i) => queue.submit(i % 2 === 0 ? "a" : `other-${i}`, job.job, controller.signal));
  const rejections = cancelled.map((p) => assert.rejects(p, (error: unknown) => error === reason));
  await checkpoint();
  controller.abort(reason);
  await Promise.all(rejections);
  await checkpoint();
  assert.equal(liveState.status, "pending");
  assert.equal(queue.running, 2);
  assert.equal(queue.waiting, 0);
  assert.deepEqual(jobs.map((job) => job.calls), jobs.map(() => 0));
  live.completion.resolve("running survives");
  assert.equal(await liveResult, "running survives");
  blocker.completion.resolve(undefined);
  await blocked;
  assert.equal(await queue.submit("a", async () => 71), 71);
  await queue.onIdle();
  assert.deepEqual(jobs.map((job) => job.calls), jobs.map(() => 0));
});

test("[unhappy-2] default abort reason is preserved for a capacity-only waiter", async () => {
  const queue = new KeyedQueue(1);
  const first = held<void>();
  const a = queue.submit("a", first.job);
  const controller = new AbortController();
  const cancelledJob = held<void>();
  const result = queue.submit("b", cancelledJob.job, controller.signal);
  const rejection = assert.rejects(result, (error: unknown) => error === controller.signal.reason);
  await checkpoint();
  controller.abort();
  await rejection;
  assert.equal(cancelledJob.calls, 0);
  first.completion.resolve(undefined);
  await a;
  await queue.onIdle();
  assert.equal(cancelledJob.calls, 0);
});

test("[unhappy-2] cancelling the sole waiter cannot release the still-running key or slot", async () => {
  const queue = new KeyedQueue(1);
  const first = held<void>();
  const a = queue.submit("key", first.job);
  const controller = new AbortController();
  const cancelledJob = held<void>();
  const cancelled = queue.submit("key", cancelledJob.job, controller.signal);
  const rejection = assert.rejects(cancelled, (error: unknown) => error === "remove only waiter");
  const idle = queue.onIdle();
  const idleState = observe(idle);
  await checkpoint();
  controller.abort("remove only waiter");
  await rejection;
  const same = held<string>();
  const other = held<string>();
  const b = queue.submit("key", same.job);
  const c = queue.submit("other", other.job);
  await checkpoint();
  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 2);
  assert.equal(idleState.status, "pending");
  assert.equal(same.calls, 0);
  assert.equal(other.calls, 0);
  first.completion.resolve(undefined);
  await a;
  await checkpoint();
  assert.equal(same.calls, 1);
  assert.equal(other.calls, 0);
  same.completion.resolve("same");
  assert.equal(await b, "same");
  await checkpoint();
  assert.equal(other.calls, 1);
  other.completion.resolve("other");
  assert.equal(await c, "other");
  await idle;
  assert.equal(cancelledJob.calls, 0);
});

// Extends "aborting a running job preserves its result and occupied slot":
// the abort occurs within the function, after it has been called but before it returns.
test("[boundary-4] aborting inside the job function still leaves its promise in charge", async () => {
  const queue = new KeyedQueue(1);
  const controller = new AbortController();
  const completion = deferred<object>();
  const first = queue.submit("self-abort", () => {
    controller.abort("aborted after call");
    return completion.promise;
  }, controller.signal);
  const firstState = observe(first);
  const second = held<number>();
  const b = queue.submit("other", second.job);
  await checkpoint();
  assert.equal(firstState.status, "pending");
  assert.equal(queue.running, 1);
  assert.equal(second.calls, 0);
  const value = { survived: "self-abort" };
  completion.resolve(value);
  assert.equal(await first, value);
  await checkpoint();
  assert.equal(second.calls, 1);
  second.completion.resolve(23);
  assert.equal(await b, 23);
  await queue.onIdle();
});

// Extends "a running job that later rejects keeps its own error after abort":
// it originally waited, then starts, then is aborted, and rejects with undefined.
test("[boundary-4] a promoted waiter ignores abort and retains its falsy job rejection", async () => {
  const queue = new KeyedQueue(1);
  const first = held<void>();
  const a = queue.submit("key", first.job);
  const controller = new AbortController();
  const promoted = held<void>();
  const b = queue.submit("key", promoted.job, controller.signal);
  const state = observe(b);
  const rejection = assert.rejects(b, (error: unknown) => error === undefined);
  const third = held<string>();
  const c = queue.submit("different", third.job);
  await checkpoint();
  assert.equal(promoted.calls, 0);
  first.completion.resolve(undefined);
  await a;
  await checkpoint();
  assert.equal(promoted.calls, 1);
  controller.abort({ ignored: "started" });
  await checkpoint();
  assert.equal(state.status, "pending");
  assert.equal(third.calls, 0);
  assert.equal(queue.running, 1);
  promoted.completion.reject(undefined);
  await rejection;
  await checkpoint();
  assert.equal(third.calls, 1);
  third.completion.resolve("after promoted rejection");
  assert.equal(await c, "after promoted rejection");
  await queue.onIdle();
});

test("[boundary-4] aborting a completed job's signal cannot disturb later work on that key", async () => {
  const queue = new KeyedQueue(2);
  const controller = new AbortController();
  assert.equal(await queue.submit("reuse", async () => 1, controller.signal), 1);
  await queue.onIdle();
  const first = held<string>();
  const second = held<string>();
  const a = queue.submit("reuse", first.job);
  const b = queue.submit("reuse", second.job);
  await checkpoint();
  controller.abort("stale signal");
  await checkpoint();
  assert.equal(first.calls, 1);
  assert.equal(second.calls, 0);
  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 1);
  first.completion.resolve("new first");
  assert.equal(await a, "new first");
  await checkpoint();
  assert.equal(second.calls, 1);
  second.completion.resolve("new second");
  assert.equal(await b, "new second");
  await queue.onIdle();
});

// Extends "an already aborted signal rejects with its reason without calling the job":
// falsy reasons are valid and rejection must not wait behind the busy same key.
test("[unhappy-3] pre-aborted falsy reasons are refused immediately behind a busy key", async () => {
  const queue = new KeyedQueue(2);
  const first = held<void>();
  const a = queue.submit("busy", first.job);
  let calls = 0;
  for (const reason of [false, 0, "", null]) {
    const controller = new AbortController();
    controller.abort(reason);
    const result = queue.submit("busy", async () => { calls += 1; }, controller.signal);
    await assert.rejects(result, (error: unknown) => Object.is(error, reason));
    assert.equal(calls, 0);
    assert.equal(queue.running, 1);
    assert.equal(queue.waiting, 0);
  }
  const next = held<number>();
  const b = queue.submit("busy", next.job);
  await checkpoint();
  assert.equal(next.calls, 0);
  first.completion.resolve(undefined);
  await a;
  await checkpoint();
  assert.equal(next.calls, 1);
  next.completion.resolve(82);
  assert.equal(await b, 82);
  await queue.onIdle();
  assert.equal(calls, 0);
});

// Extends "an already aborted signal with a default reason is refused at a full queue":
// a fresh key with spare capacity must also be refused, repeatedly using one signal.
test("[unhappy-3] a pre-aborted default signal never starts jobs even with spare slots", async () => {
  const queue = new KeyedQueue(4);
  const first = held<void>();
  const a = queue.submit("active", first.job);
  const controller = new AbortController();
  controller.abort();
  const refused = Array.from({ length: 10 }, () => held<void>());
  const checks = refused.map((job, i) => assert.rejects(
    queue.submit(`refused-${i}`, job.job, controller.signal),
    (error: unknown) => error === controller.signal.reason,
  ));
  await Promise.all(checks);
  await checkpoint();
  assert.deepEqual(refused.map((job) => job.calls), refused.map(() => 0));
  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 0);
  assert.equal(await queue.submit("refused-0", async () => "valid later"), "valid later");
  first.completion.resolve(undefined);
  await a;
  await queue.onIdle();
});

test("[unhappy-3] repeated refusals on an empty queue leave it idle and usable", async () => {
  const queue = new KeyedQueue(1);
  const controller = new AbortController();
  const reason = new Error("already cancelled repeatedly");
  controller.abort(reason);
  const job = held<void>();
  for (let i = 0; i < 6; i += 1) {
    await assert.rejects(queue.submit("", job.job, controller.signal), (error: unknown) => error === reason);
    assert.equal(queue.running, 0);
    assert.equal(queue.waiting, 0);
    const state = observe(queue.onIdle());
    await Promise.resolve();
    assert.equal(state.status, "fulfilled");
  }
  assert.equal(job.calls, 0);
  assert.equal(await queue.submit("", async () => null), null);
  await queue.onIdle();
});

// Extends "counts track running and waiting work and idle waits for both jobs":
// repeat busy/idle transitions, keeping several independent idle promises alive.
test("[happy-3] counts and idle observers remain correct across repeated three-slot batches", async () => {
  const queue = new KeyedQueue(3);
  for (let round = 0; round < 4; round += 1) {
    const jobs = Array.from({ length: 6 }, () => held<number>());
    const results = jobs.map((job, i) => queue.submit(`batch-${i}`, job.job));
    const idles = Array.from({ length: 5 }, () => queue.onIdle());
    const states = idles.map(observe);
    await checkpoint();
    assert.equal(queue.running, 3);
    assert.equal(queue.waiting, 3);
    for (let i = 0; i < 3; i += 1) {
      jobs[i].completion.resolve(i);
      assert.equal(await results[i], i);
      await checkpoint();
      assert.equal(queue.running, 3);
      assert.equal(queue.waiting, 2 - i);
      assert.deepEqual(states.map((s) => s.status), states.map(() => "pending"));
    }
    for (let i = 3; i < 6; i += 1) {
      jobs[i].completion.resolve(i);
      await results[i];
      await checkpoint();
      assert.equal(queue.running, 5 - i);
      assert.equal(queue.waiting, 0);
      if (i < 5) assert.deepEqual(states.map((s) => s.status), states.map(() => "pending"));
    }
    await Promise.all(idles);
    assert.deepEqual(states.map((s) => s.status), states.map(() => "fulfilled"));
    const empty = observe(queue.onIdle());
    await Promise.resolve();
    assert.equal(empty.status, "fulfilled");
  }
});

test("[happy-3] idle observers include work submitted after they were registered", async () => {
  const queue = new KeyedQueue(2);
  const first = held<void>();
  const second = held<void>();
  const third = held<void>();
  const a = queue.submit("a", first.job);
  const idle1 = queue.onIdle();
  const state1 = observe(idle1);
  const b = queue.submit("b", second.job);
  const idle2 = queue.onIdle();
  const state2 = observe(idle2);
  const c = queue.submit("a", third.job);
  await checkpoint();
  assert.equal(queue.running, 2);
  assert.equal(queue.waiting, 1);
  first.completion.resolve(undefined);
  second.completion.resolve(undefined);
  await Promise.all([a, b]);
  await checkpoint();
  assert.equal(third.calls, 1);
  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 0);
  assert.equal(state1.status, "pending");
  assert.equal(state2.status, "pending");
  third.completion.resolve(undefined);
  await c;
  await Promise.all([idle1, idle2]);
});

// Extends "counts and multiple idle waiters recover after cancellation and rejection":
// cancel every waiter, then reject the sole running job; idle must resolve, not reject.
test("[happy-3] removing every waiter leaves idle pending until the last running rejection", async () => {
  const queue = new KeyedQueue(1);
  const first = held<void>();
  const failure = { lastJobFailure: true };
  const a = queue.submit("running", first.job);
  const rejection = assert.rejects(a, (error: unknown) => error === failure);
  const controller = new AbortController();
  const jobs = Array.from({ length: 5 }, () => held<void>());
  const checks = jobs.map((job, i) => assert.rejects(
    queue.submit(`wait-${i}`, job.job, controller.signal),
    (error: unknown) => error === "all removed",
  ));
  const idles = [queue.onIdle(), queue.onIdle(), queue.onIdle()];
  const states = idles.map(observe);
  await checkpoint();
  controller.abort("all removed");
  await Promise.all(checks);
  await checkpoint();
  assert.equal(queue.waiting, 0);
  assert.equal(queue.running, 1);
  assert.deepEqual(states.map((s) => s.status), ["pending", "pending", "pending"]);
  first.completion.reject(failure);
  await rejection;
  await Promise.all(idles);
  assert.equal(queue.running, 0);
  assert.equal(queue.waiting, 0);
  assert.deepEqual(jobs.map((job) => job.calls), jobs.map(() => 0));
});

test("[happy-3] an idle promise obtained on an empty queue stays resolved when new work arrives", async () => {
  const queue = new KeyedQueue(1);
  const alreadyIdle = observe(queue.onIdle());
  const job = held<void>();
  const result = queue.submit("new work", job.job);
  await Promise.resolve();
  assert.equal(alreadyIdle.status, "fulfilled");
  const busyIdle = queue.onIdle();
  const state = observe(busyIdle);
  await checkpoint();
  assert.equal(job.calls, 1);
  assert.equal(state.status, "pending");
  job.completion.resolve(undefined);
  await result;
  await busyIdle;
});

test("[happy-3] queued synchronous throws and rejections leave counts and idle reusable", async () => {
  const queue = new KeyedQueue(1);
  const first = held<void>();
  const a = queue.submit("work", first.job);
  const reason = new Error("queued throw while counting");
  const thrown = queue.submit("work", () => { throw reason; });
  const throwCheck = assert.rejects(thrown, (error: unknown) => error === reason);
  const rejected = queue.submit("other", () => Promise.reject(false));
  const rejectCheck = assert.rejects(rejected, (error: unknown) => error === false);
  const final = held<string>();
  const last = queue.submit("work", final.job);
  const idle = queue.onIdle();
  const state = observe(idle);
  await checkpoint();
  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 3);
  first.completion.resolve(undefined);
  await a;
  await Promise.all([throwCheck, rejectCheck]);
  await checkpoint();
  assert.equal(final.calls, 1);
  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 0);
  assert.equal(state.status, "pending");
  final.completion.resolve("last");
  assert.equal(await last, "last");
  await idle;
  assert.equal(queue.running, 0);
  assert.equal(queue.waiting, 0);
});

// Extends "zero, fractional, and negative caps fail creation with an error".
// A valid construction is essential: the unimplemented constructor must not pass
// this test just because it also throws on invalid input. No error text/type
// beyond the specified error is imposed.
test("[unhappy-4] small and large invalid caps are refused after a usable control construction", async () => {
  const valid = new KeyedQueue(6);
  assert.equal(await valid.submit("control", async () => 6), 6);
  await valid.onIdle();
  for (const cap of [0, -0, -17, -2147483648, 1.25, 6.75, Number.MIN_VALUE, -Number.EPSILON, 1 + Number.EPSILON, 4294967296.5]) {
    assert.throws(() => new KeyedQueue(cap), (error: unknown) => error instanceof Error);
  }
});

// Extends "nonfinite and subunit caps are refused while positive whole caps are accepted":
// whole-number caps have no specified 32-bit or safe-integer upper limit.
test("[unhappy-4] nonfinite caps fail while large positive whole caps accept small workloads", async () => {
  for (const cap of [7, 65536, 2 ** 32, 2 ** 53, Number.MAX_VALUE]) {
    const queue = new KeyedQueue(cap);
    const jobs = [held<number>(), held<number>(), held<number>()];
    const results = jobs.map((job, i) => queue.submit(`large-cap-${i}`, job.job));
    await checkpoint();
    assert.deepEqual(jobs.map((job) => job.calls), [1, 1, 1]);
    assert.equal(queue.running, 3);
    jobs.forEach((job, i) => job.completion.resolve(i));
    assert.deepEqual(await Promise.all(results), [0, 1, 2]);
    await queue.onIdle();
  }
  for (const cap of [NaN, Infinity, -Infinity, 0.0001, -0.0001]) {
    assert.throws(() => new KeyedQueue(cap), (error: unknown) => error instanceof Error);
  }
});
