import { test } from "node:test";
import assert from "node:assert/strict";
import { KeyedQueue } from "../../src/index.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function pendingJob<T>() {
  const completion = deferred<T>();
  const started = deferred<void>();
  let calls = 0;
  return {
    completion,
    started: started.promise,
    get calls() { return calls; },
    job: () => {
      calls += 1;
      started.resolve(undefined);
      return completion.promise;
    },
  };
}

function observe<T>(promise: Promise<T>) {
  const result: { state: "pending" | "fulfilled" | "rejected" } = {
    state: "pending",
  };
  void promise.then(
    () => { result.state = "fulfilled"; },
    () => { result.state = "rejected"; },
  );
  return result;
}

// Allow promise reactions to run without using timers or a real clock.
async function checkpoint() {
  for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
}

test("[happy-1] same-key jobs wait and resolve with their own values", async () => {
  const queue = new KeyedQueue(2);
  const first = pendingJob<string>();
  const second = pendingJob<string>();
  const firstResult = queue.submit("task", first.job);
  const secondResult = queue.submit("task", second.job);

  await first.started;
  await checkpoint();
  assert.equal(first.calls, 1);
  assert.equal(second.calls, 0);

  first.completion.resolve("first value");
  assert.equal(await firstResult, "first value");
  await second.started;
  assert.equal(second.calls, 1);
  second.completion.resolve("second value");
  assert.equal(await secondResult, "second value");
  await queue.onIdle();
});

test("[happy-1] an empty key serializes three jobs including an undefined result", async () => {
  const queue = new KeyedQueue(3);
  const first = pendingJob<undefined>();
  const second = pendingJob<object>();
  const order: string[] = [];
  const firstResult = queue.submit("", first.job);
  const secondResult = queue.submit("", () => {
    order.push("second");
    return second.job();
  });
  const thirdResult = queue.submit("", async () => {
    order.push("third");
    return "last";
  });

  await first.started;
  await checkpoint();
  assert.deepEqual(order, []);
  first.completion.resolve(undefined);
  assert.equal(await firstResult, undefined);
  await second.started;
  await checkpoint();
  assert.deepEqual(order, ["second"]);

  const value = { answer: 42 };
  second.completion.resolve(value);
  assert.equal(await secondResult, value);
  assert.equal(await thirdResult, "last");
  assert.deepEqual(order, ["second", "third"]);
  await queue.onIdle();
});

test("[boundary-1] a rejected promise releases its key for the next job", async () => {
  const queue = new KeyedQueue(2);
  const first = pendingJob<string>();
  const second = pendingJob<string>();
  const failure = new Error("first job failed");
  const firstResult = queue.submit("task", first.job);
  const rejection = assert.rejects(firstResult, (error: unknown) => error === failure);
  const secondResult = queue.submit("task", second.job);

  await first.started;
  await checkpoint();
  assert.equal(second.calls, 0);
  first.completion.reject(failure);
  await rejection;
  await second.started;
  second.completion.resolve("recovered");
  assert.equal(await secondResult, "recovered");
  await queue.onIdle();
});

test("[boundary-1] an immediate rejection preserves a non-Error reason and frees the only slot", async () => {
  const queue = new KeyedQueue(1);
  const reason = { code: "failed" };
  const order: string[] = [];
  const first = queue.submit("a", () => Promise.reject(reason));
  const rejection = assert.rejects(first, (error: unknown) => error === reason);
  const second = queue.submit("a", async () => {
    order.push("same key");
    return 2;
  });
  const third = queue.submit("b", async () => {
    order.push("other key");
    return 3;
  });

  await rejection;
  assert.equal(await second, 2);
  assert.equal(await third, 3);
  assert.deepEqual(order, ["same key", "other key"]);
  await queue.onIdle();
});

test("[unhappy-1] a synchronous throw rejects the submission and leaves the key usable", async () => {
  const queue = new KeyedQueue(1);
  const failure = new Error("synchronous failure");
  const result = queue.submit<string>("task", () => { throw failure; });
  await assert.rejects(result, (error: unknown) => error === failure);
  assert.equal(await queue.submit("task", async () => "next"), "next");
  await queue.onIdle();
});

test("[unhappy-1] a queued synchronous throw preserves its reason and releases key and slot", async () => {
  const queue = new KeyedQueue(1);
  const first = pendingJob<void>();
  const firstResult = queue.submit("a", first.job);
  let throwCalls = 0;
  const thrown = queue.submit("a", () => {
    throwCalls += 1;
    throw null;
  });
  const rejection = assert.rejects(thrown, (error: unknown) => error === null);
  const sameKey = queue.submit("a", async () => "same key recovered");
  const otherKey = queue.submit("b", async () => "slot recovered");

  await first.started;
  await checkpoint();
  assert.equal(throwCalls, 0);
  first.completion.resolve(undefined);
  await firstResult;
  await rejection;
  assert.equal(throwCalls, 1);
  assert.equal(await sameKey, "same key recovered");
  assert.equal(await otherKey, "slot recovered");
  await queue.onIdle();
});

test("[happy-2] two different keys start before either job settles at cap two", async () => {
  const queue = new KeyedQueue(2);
  const first = pendingJob<string>();
  const second = pendingJob<string>();
  const firstResult = queue.submit("a", first.job);
  const secondResult = queue.submit("b", second.job);
  const firstState = observe(firstResult);
  const secondState = observe(secondResult);

  await Promise.all([first.started, second.started]);
  assert.equal(first.calls, 1);
  assert.equal(second.calls, 1);
  assert.equal(firstState.state, "pending");
  assert.equal(secondState.state, "pending");

  second.completion.resolve("second");
  assert.equal(await secondResult, "second");
  assert.equal(firstState.state, "pending");
  first.completion.resolve("first");
  assert.equal(await firstResult, "first");
  await queue.onIdle();
});

test("[happy-2] distinct keys can occupy all three available slots", async () => {
  const queue = new KeyedQueue(3);
  const jobs = [pendingJob<number>(), pendingJob<number>(), pendingJob<number>()];
  const keys = ["a", "A", "aa"];
  const results = jobs.map((job, index) => queue.submit(keys[index], job.job));
  await Promise.all(jobs.map((job) => job.started));
  assert.deepEqual(jobs.map((job) => job.calls), [1, 1, 1]);
  assert.equal(queue.running, 3);
  assert.equal(queue.waiting, 0);

  jobs[2].completion.resolve(30);
  assert.equal(await results[2], 30);
  jobs[0].completion.resolve(10);
  jobs[1].completion.resolve(20);
  assert.deepEqual(await Promise.all(results), [10, 20, 30]);
  await queue.onIdle();
});

test("[boundary-2] cap two holds and waiting keys start in submission order", async () => {
  const queue = new KeyedQueue(2);
  const jobs = [pendingJob<number>(), pendingJob<number>(), pendingJob<number>(), pendingJob<number>()];
  const order: string[] = [];
  const keys = ["a", "b", "c", "d"];
  const results = jobs.map((job, index) => queue.submit(keys[index], () => {
    order.push(keys[index]);
    return job.job();
  }));

  await Promise.all([jobs[0].started, jobs[1].started]);
  await checkpoint();
  assert.equal(jobs[2].calls, 0);
  assert.equal(jobs[3].calls, 0);
  // Either running key can release the next slot.
  jobs[1].completion.resolve(2);
  assert.equal(await results[1], 2);
  await jobs[2].started;
  await checkpoint();
  assert.equal(jobs[3].calls, 0);
  jobs[2].completion.resolve(3);
  assert.equal(await results[2], 3);
  await jobs[3].started;
  assert.deepEqual(order.slice(2), ["c", "d"]);

  jobs[0].completion.resolve(1);
  jobs[3].completion.resolve(4);
  assert.deepEqual(await Promise.all(results), [1, 2, 3, 4]);
  await queue.onIdle();
});

test("[boundary-2] cap one serializes different keys in submission order", async () => {
  const queue = new KeyedQueue(1);
  const first = pendingJob<number>();
  const second = pendingJob<number>();
  const third = pendingJob<number>();
  const a = queue.submit("a", first.job);
  const b = queue.submit("b", second.job);
  const c = queue.submit("c", third.job);
  await first.started;
  await checkpoint();
  assert.equal(second.calls, 0);
  assert.equal(third.calls, 0);

  first.completion.resolve(1);
  await a;
  await second.started;
  await checkpoint();
  assert.equal(third.calls, 0);
  second.completion.resolve(2);
  await b;
  await third.started;
  third.completion.resolve(3);
  assert.deepEqual(await Promise.all([a, b, c]), [1, 2, 3]);
  await queue.onIdle();
});

test("[boundary-3] a waiting job for a busy key leaves a slot for another key", async () => {
  const queue = new KeyedQueue(2);
  const first = pendingJob<string>();
  const second = pendingJob<string>();
  const other = pendingJob<string>();
  const a1 = queue.submit("a", first.job);
  const a2 = queue.submit("a", second.job);
  const b = queue.submit("b", other.job);

  await Promise.all([first.started, other.started]);
  await checkpoint();
  assert.equal(second.calls, 0);
  assert.equal(queue.running, 2);
  assert.equal(queue.waiting, 1);
  first.completion.resolve("a1");
  await a1;
  await second.started;
  // The other key is still running when the second a job starts.
  second.completion.resolve("a2");
  other.completion.resolve("b");
  assert.deepEqual(await Promise.all([a1, a2, b]), ["a1", "a2", "b"]);
  await queue.onIdle();
});

test("[boundary-3] multiple jobs for one busy key leave both remaining slots available", async () => {
  const queue = new KeyedQueue(3);
  const first = pendingJob<void>();
  const second = pendingJob<void>();
  const third = pendingJob<void>();
  const bJob = pendingJob<void>();
  const cJob = pendingJob<void>();
  const a1 = queue.submit("a", first.job);
  const a2 = queue.submit("a", second.job);
  const a3 = queue.submit("a", third.job);
  const b = queue.submit("b", bJob.job);
  const c = queue.submit("c", cJob.job);

  await Promise.all([first.started, bJob.started, cJob.started]);
  await checkpoint();
  assert.equal(second.calls, 0);
  assert.equal(third.calls, 0);
  assert.equal(queue.running, 3);
  assert.equal(queue.waiting, 2);
  bJob.completion.resolve(undefined);
  cJob.completion.resolve(undefined);
  await Promise.all([b, c]);
  await checkpoint();
  assert.equal(second.calls, 0);
  assert.equal(third.calls, 0);

  first.completion.resolve(undefined);
  await a1;
  await second.started;
  assert.equal(third.calls, 0);
  second.completion.resolve(undefined);
  await a2;
  await third.started;
  third.completion.resolve(undefined);
  await a3;
  await queue.onIdle();
});

test("[unhappy-2] aborting a waiting job rejects it without calling it and preserves its key", async () => {
  const queue = new KeyedQueue(2);
  const first = pendingJob<string>();
  const controller = new AbortController();
  const reason = new Error("cancel waiting job");
  let cancelledCalls = 0;
  const a1 = queue.submit("a", first.job);
  const cancelled = queue.submit("a", async () => {
    cancelledCalls += 1;
    return "must never run";
  }, controller.signal);
  const rejection = assert.rejects(cancelled, (error: unknown) => error === reason);

  await first.started;
  controller.abort(reason);
  await rejection;
  assert.equal(cancelledCalls, 0);
  const third = pendingJob<string>();
  const a3 = queue.submit("a", third.job);
  await checkpoint();
  assert.equal(third.calls, 0);
  first.completion.resolve("first");
  await a1;
  await third.started;
  third.completion.resolve("third");
  assert.equal(await a3, "third");
  await queue.onIdle();
  assert.equal(cancelledCalls, 0);
});

test("[unhappy-2] cancelling a middle waiter preserves a primitive reason and later waiting jobs", async () => {
  const queue = new KeyedQueue(1);
  const first = pendingJob<void>();
  const controller = new AbortController();
  let cancelledCalls = 0;
  const firstResult = queue.submit("a", first.job);
  const cancelled = queue.submit("a", async () => {
    cancelledCalls += 1;
  }, controller.signal);
  const rejection = assert.rejects(cancelled, (error: unknown) => error === "cancelled");
  const third = pendingJob<string>();
  const thirdResult = queue.submit("a", third.job);
  const otherResult = queue.submit("b", async () => "other");
  const idleState = observe(queue.onIdle());

  await first.started;
  controller.abort("cancelled");
  await rejection;
  await checkpoint();
  assert.equal(cancelledCalls, 0);
  assert.equal(third.calls, 0);
  assert.equal(idleState.state, "pending");
  first.completion.resolve(undefined);
  await firstResult;
  await third.started;
  third.completion.resolve("third");
  assert.equal(await thirdResult, "third");
  assert.equal(await otherResult, "other");
  await queue.onIdle();
  assert.equal(cancelledCalls, 0);
});

test("[boundary-4] aborting a running job preserves its result and occupied slot", async () => {
  const queue = new KeyedQueue(1);
  const controller = new AbortController();
  const first = pendingJob<string>();
  const second = pendingJob<string>();
  const firstResult = queue.submit("a", first.job, controller.signal);
  const firstState = observe(firstResult);
  const secondResult = queue.submit("b", second.job);

  await first.started;
  controller.abort(new Error("too late"));
  await checkpoint();
  assert.equal(firstState.state, "pending");
  assert.equal(second.calls, 0);
  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 1);
  first.completion.resolve("job value");
  assert.equal(await firstResult, "job value");
  await second.started;
  second.completion.resolve("next value");
  assert.equal(await secondResult, "next value");
  await queue.onIdle();
});

test("[boundary-4] a running job that later rejects keeps its own error after abort", async () => {
  const queue = new KeyedQueue(1);
  const controller = new AbortController();
  const first = pendingJob<void>();
  const failure = new Error("actual job failure");
  const firstResult = queue.submit("a", first.job, controller.signal);
  const firstState = observe(firstResult);
  const rejection = assert.rejects(firstResult, (error: unknown) => error === failure);
  const second = pendingJob<string>();
  const secondResult = queue.submit("a", second.job);

  await first.started;
  controller.abort("ignored reason");
  await checkpoint();
  assert.equal(firstState.state, "pending");
  assert.equal(second.calls, 0);
  assert.equal(queue.running, 1);
  first.completion.reject(failure);
  await rejection;
  await second.started;
  second.completion.resolve("recovered");
  assert.equal(await secondResult, "recovered");
  await queue.onIdle();
});

test("[unhappy-3] an already aborted signal rejects with its reason without calling the job", async () => {
  const queue = new KeyedQueue(1);
  const controller = new AbortController();
  const reason = { cancellation: "before submit" };
  controller.abort(reason);
  let calls = 0;
  const result = queue.submit("a", async () => {
    calls += 1;
    return "must never run";
  }, controller.signal);

  await assert.rejects(result, (error: unknown) => error === reason);
  assert.equal(calls, 0);
  assert.equal(await queue.submit("a", async () => "usable"), "usable");
  await queue.onIdle();
  assert.equal(calls, 0);
});

test("[unhappy-3] an already aborted signal with a default reason is refused at a full queue", async () => {
  const queue = new KeyedQueue(1);
  const first = pendingJob<void>();
  const firstResult = queue.submit("a", first.job);
  await first.started;
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const refused = queue.submit("b", async () => { calls += 1; }, controller.signal);
  await assert.rejects(refused, (error: unknown) => error === controller.signal.reason);
  await checkpoint();
  assert.equal(calls, 0);
  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 0);

  const next = queue.submit("b", async () => "available");
  first.completion.resolve(undefined);
  await firstResult;
  assert.equal(await next, "available");
  await queue.onIdle();
  assert.equal(calls, 0);
});

test("[happy-3] counts track running and waiting work and idle waits for both jobs", async () => {
  const queue = new KeyedQueue(1);
  let initiallyIdle = false;
  void queue.onIdle().then(() => { initiallyIdle = true; });
  await Promise.resolve();
  assert.equal(initiallyIdle, true);
  assert.equal(queue.running, 0);
  assert.equal(queue.waiting, 0);

  const first = pendingJob<string>();
  const second = pendingJob<string>();
  const a = queue.submit("a", first.job);
  const b = queue.submit("b", second.job);
  const idle = queue.onIdle();
  const idleState = observe(idle);
  await first.started;
  await checkpoint();
  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 1);
  assert.equal(idleState.state, "pending");

  first.completion.resolve("a");
  await a;
  await second.started;
  await checkpoint();
  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 0);
  assert.equal(idleState.state, "pending");
  second.completion.resolve("b");
  await b;
  await idle;
  assert.equal(queue.running, 0);
  assert.equal(queue.waiting, 0);
  let finallyIdle = false;
  void queue.onIdle().then(() => { finallyIdle = true; });
  await Promise.resolve();
  assert.equal(finallyIdle, true);
});

test("[happy-3] counts and multiple idle waiters recover after cancellation and rejection", async () => {
  const queue = new KeyedQueue(2);
  const aJob = pendingJob<void>();
  const bJob = pendingJob<void>();
  const cJob = pendingJob<void>();
  const controller = new AbortController();
  const a = queue.submit("a", aJob.job);
  let cancelledCalls = 0;
  const cancelled = queue.submit("a", async () => { cancelledCalls += 1; }, controller.signal);
  const cancellation = assert.rejects(cancelled, (error: unknown) => error === "cancelled");
  const b = queue.submit("b", bJob.job);
  const failure = new Error("b failed");
  const rejection = assert.rejects(b, (error: unknown) => error === failure);
  const c = queue.submit("c", cJob.job);
  const idle1 = queue.onIdle();
  const idle2 = queue.onIdle();
  const idleStates = [observe(idle1), observe(idle2)];

  await Promise.all([aJob.started, bJob.started]);
  await checkpoint();
  assert.equal(queue.running, 2);
  assert.equal(queue.waiting, 2);
  controller.abort("cancelled");
  await cancellation;
  await checkpoint();
  assert.equal(queue.running, 2);
  assert.equal(queue.waiting, 1);
  bJob.completion.reject(failure);
  await rejection;
  await cJob.started;
  await checkpoint();
  assert.equal(queue.running, 2);
  assert.equal(queue.waiting, 0);

  aJob.completion.resolve(undefined);
  await a;
  await checkpoint();
  assert.equal(queue.running, 1);
  assert.equal(queue.waiting, 0);
  assert.deepEqual(idleStates.map((state) => state.state), ["pending", "pending"]);
  cJob.completion.resolve(undefined);
  await c;
  await Promise.all([idle1, idle2]);
  assert.equal(queue.running, 0);
  assert.equal(queue.waiting, 0);
  assert.equal(cancelledCalls, 0);
});

test("[unhappy-4] zero, fractional, and negative caps fail creation with an error", () => {
  for (const cap of [0, 2.5, -1]) {
    assert.throws(() => new KeyedQueue(cap), (error: unknown) => error instanceof Error);
  }
});

test("[unhappy-4] nonfinite and subunit caps are refused while positive whole caps are accepted", async () => {
  for (const cap of [-0, 0.5, -2.5, NaN, Infinity, -Infinity]) {
    assert.throws(() => new KeyedQueue(cap), (error: unknown) => error instanceof Error);
  }
  for (const cap of [1, 2, 1024]) {
    const queue = new KeyedQueue(cap);
    assert.equal(await queue.submit("fixed-key", async () => cap), cap);
    await queue.onIdle();
  }
});
