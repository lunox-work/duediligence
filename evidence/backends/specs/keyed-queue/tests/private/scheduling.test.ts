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

async function checkpoint() {
  for (let i = 0; i < 32; i += 1) await Promise.resolve();
}

// Extends "same-key jobs wait and resolve with their own values": more than a pair,
// falsy results, identity, and pre-settled promises belonging to waiting jobs.
test("[happy-1] a long same-key chain keeps FIFO and each distinct result", async () => {
  const queue = new KeyedQueue(7);
  const values: unknown[] = [false, null, undefined, 0, -0, NaN, "", { id: 7 }, [8], 9n, "end"];
  const jobs = values.map(() => held<unknown>());
  const order: number[] = [];
  const results = jobs.map((job, i) => queue.submit("long chain", () => {
    order.push(i);
    return job.job();
  }));
  await checkpoint();
  assert.deepEqual(order, [0]);
  // A settled promise cannot make its function eligible before its key is free.
  for (let i = jobs.length - 1; i > 0; i -= 1) jobs[i].completion.resolve(values[i]);
  await checkpoint();
  assert.deepEqual(order, [0]);
  jobs[0].completion.resolve(values[0]);
  const actual = await Promise.all(results);
  actual.forEach((value, i) => assert.ok(Object.is(value, values[i])));
  assert.deepEqual(order, values.map((_, i) => i));
  assert.deepEqual(jobs.map((job) => job.calls), values.map(() => 1));
  await queue.onIdle();
});

// Extends "an empty key serializes three jobs including an undefined result":
// object-property names must be ordinary reusable keys too.
test("[happy-1] prototype property keys serialize and remain reusable after idle", async () => {
  const queue = new KeyedQueue(4);
  for (const key of ["__proto__", "constructor", "toString", "hasOwnProperty", ""]) {
    for (let round = 0; round < 2; round += 1) {
      const first = held<number>();
      const later = [held<number>(), held<number>(), held<number>()];
      const a = queue.submit(key, first.job);
      const rest = later.map((job) => queue.submit(key, job.job));
      await checkpoint();
      assert.equal(first.calls, 1);
      assert.deepEqual(later.map((job) => job.calls), [0, 0, 0]);
      first.completion.resolve(round);
      assert.equal(await a, round);
      for (let i = 0; i < later.length; i += 1) {
        await checkpoint();
        assert.deepEqual(later.map((job) => job.calls), later.map((_, j) => Number(j <= i)));
        later[i].completion.resolve(i + 10);
        assert.equal(await rest[i], i + 10);
      }
      await queue.onIdle();
    }
  }
});

test("[happy-1] a job submitted from inside its own key waits for the outer promise", async () => {
  const queue = new KeyedQueue(3);
  const gate = deferred<string>();
  const nested = held<string>();
  let nestedResult!: Promise<string>;
  const outer = queue.submit("recursive", () => {
    nestedResult = queue.submit("recursive", nested.job);
    return gate.promise;
  });
  await checkpoint();
  assert.equal(nested.calls, 0);
  gate.resolve("outer");
  assert.equal(await outer, "outer");
  await checkpoint();
  assert.equal(nested.calls, 1);
  nested.completion.resolve("inner");
  assert.equal(await nestedResult, "inner");
  await queue.onIdle();
});

// Extends "a rejected promise releases its key for the next job": several
// consecutive failures, including falsy reasons, must each release exactly once.
test("[boundary-1] delayed consecutive rejections preserve falsy reasons and key order", async () => {
  const queue = new KeyedQueue(4);
  const reasons: unknown[] = [undefined, false, 0, "", null, { failure: 6 }];
  const jobs = reasons.map(() => held<void>());
  const results = jobs.map((job) => queue.submit("failing", job.job));
  const rejections = results.map((p, i) => assert.rejects(p, (error: unknown) => Object.is(error, reasons[i])));
  const last = held<string>();
  const lastResult = queue.submit("failing", last.job);
  for (let i = 0; i < jobs.length; i += 1) {
    await checkpoint();
    assert.deepEqual(jobs.map((job) => job.calls), jobs.map((_, j) => Number(j <= i)));
    assert.equal(last.calls, 0);
    jobs[i].completion.reject(reasons[i]);
    await rejections[i];
  }
  await checkpoint();
  assert.equal(last.calls, 1);
  last.completion.resolve("survived");
  assert.equal(await lastResult, "survived");
  await queue.onIdle();
});

// Extends "an immediate rejection preserves a non-Error reason and frees the only slot".
test("[boundary-1] many immediate failures interleaved with successes free the sole slot", async () => {
  const queue = new KeyedQueue(1);
  const order: number[] = [];
  const checks: Promise<unknown>[] = [];
  for (let i = 0; i < 40; i += 1) {
    const reason = { index: i };
    const p = queue.submit(`key-${i % 5}`, () => {
      order.push(i);
      return i % 2 === 0 ? Promise.reject(reason) : Promise.resolve(i);
    });
    checks.push(i % 2 === 0
      ? assert.rejects(p, (error: unknown) => error === reason)
      : p.then((value) => assert.equal(value, i)));
  }
  await Promise.all(checks);
  assert.deepEqual(order, Array.from({ length: 40 }, (_, i) => i));
  await queue.onIdle();
  assert.equal(queue.running, 0);
});

test("[boundary-1] rejection frees a global slot while an unrelated long job stays active", async () => {
  const queue = new KeyedQueue(2);
  const survivor = held<void>();
  const failing = held<void>();
  const next = held<number>();
  const a = queue.submit("survivor", survivor.job);
  const b = queue.submit("failed", failing.job);
  const failure = new Error("delayed slot failure");
  const rejection = assert.rejects(b, (error: unknown) => error === failure);
  const c = queue.submit("different", next.job);
  await checkpoint();
  assert.equal(next.calls, 0);
  failing.completion.reject(failure);
  await rejection;
  await checkpoint();
  assert.equal(next.calls, 1);
  assert.equal(queue.running, 2);
  next.completion.resolve(53);
  assert.equal(await c, 53);
  survivor.completion.resolve(undefined);
  await a;
  await queue.onIdle();
});

// Extends "a queued synchronous throw preserves its reason and releases key and slot".
test("[unhappy-1] multiple queued synchronous throws retain falsy thrown values", async () => {
  const queue = new KeyedQueue(2);
  const gate = held<void>();
  const outer = queue.submit("throws", gate.job);
  const reasons: unknown[] = [undefined, false, 0, "", 19, { thrown: true }];
  const order: number[] = [];
  const checks = reasons.map((reason, i) => {
    const result = queue.submit("throws", () => { order.push(i); throw reason; });
    return assert.rejects(result, (error: unknown) => Object.is(error, reason));
  });
  const after = queue.submit("throws", async () => "after throws");
  await checkpoint();
  assert.deepEqual(order, []);
  gate.completion.resolve(undefined);
  await outer;
  await Promise.all(checks);
  assert.equal(await after, "after throws");
  assert.deepEqual(order, reasons.map((_, i) => i));
  await queue.onIdle();
});

// Extends "a synchronous throw rejects the submission and leaves the key usable":
// the throwing function itself queues its successor before throwing.
test("[unhappy-1] a synchronous throw releases a key with a reentrantly submitted successor", async () => {
  const queue = new KeyedQueue(2);
  const failure = new Error("throw after enqueue");
  const successor = held<string>();
  let next!: Promise<string>;
  const result = queue.submit("reentrant throw", () => {
    next = queue.submit("reentrant throw", successor.job);
    assert.equal(successor.calls, 0);
    throw failure;
  });
  await assert.rejects(result, (error: unknown) => error === failure);
  await checkpoint();
  assert.equal(successor.calls, 1);
  successor.completion.resolve("recovered reentrantly");
  assert.equal(await next, "recovered reentrantly");
  await queue.onIdle();
});

// Extends both "two different keys start before either job settles at cap two"
// and "distinct keys can occupy all three available slots": exact string keys,
// including whitespace, embedded NULs, and canonically equivalent Unicode.
test("[happy-2] eight exact distinct string keys occupy eight slots", async () => {
  const keys = ["__proto__", "constructor", "x", " x", "x ", "x\u0000", "é", "e\u0301"];
  const queue = new KeyedQueue(keys.length);
  const jobs = keys.map(() => held<string>());
  const results = jobs.map((job, i) => queue.submit(keys[i], job.job));
  await checkpoint();
  assert.deepEqual(jobs.map((job) => job.calls), keys.map(() => 1));
  assert.equal(queue.running, keys.length);
  for (let i = jobs.length - 1; i >= 0; i -= 1) {
    jobs[i].completion.resolve(keys[i]);
    assert.equal(await results[i], keys[i]);
  }
  await queue.onIdle();
});

test("[happy-2] separate queue instances have independent keys and capacity", async () => {
  const firstQueue = new KeyedQueue(1);
  const secondQueue = new KeyedQueue(2);
  const jobs = [held<number>(), held<number>(), held<number>()];
  const results = [firstQueue.submit("same", jobs[0].job), secondQueue.submit("same", jobs[1].job), secondQueue.submit("other", jobs[2].job)];
  await checkpoint();
  assert.deepEqual(jobs.map((job) => job.calls), [1, 1, 1]);
  assert.equal(firstQueue.running, 1);
  assert.equal(secondQueue.running, 2);
  jobs.forEach((job, i) => job.completion.resolve(i));
  assert.deepEqual(await Promise.all(results), [0, 1, 2]);
  await Promise.all([firstQueue.onIdle(), secondQueue.onIdle()]);
});

// Extends "cap two holds and waiting keys start in submission order": larger
// capacity, a long backlog, and completions deliberately out of start order.
test("[boundary-2] a five-slot queue drains thirty distinct keys in waiting order", async () => {
  const queue = new KeyedQueue(5);
  const jobs = Array.from({ length: 30 }, () => held<number>());
  const order: number[] = [];
  const results = jobs.map((job, i) => queue.submit(`unique-${i}`, () => { order.push(i); return job.job(); }));
  await checkpoint();
  assert.deepEqual(order, [0, 1, 2, 3, 4]);
  const active = [0, 1, 2, 3, 4];
  for (let next = 5; next < jobs.length; next += 1) {
    const slot = (next * 3) % active.length;
    const completed = active[slot];
    jobs[completed].completion.resolve(completed);
    assert.equal(await results[completed], completed);
    await checkpoint();
    assert.deepEqual(order, Array.from({ length: next + 1 }, (_, i) => i));
    assert.equal(queue.running, 5);
    assert.equal(queue.waiting, jobs.length - next - 1);
    active[slot] = next;
  }
  for (const i of active) jobs[i].completion.resolve(i);
  assert.deepEqual(await Promise.all(results), jobs.map((_, i) => i));
  await queue.onIdle();
});

// Extends "cap one serializes different keys in submission order": many more
// keys, with some promises already settled before their function can run.
test("[boundary-2] cap one does not skip gated jobs whose promises already settled", async () => {
  const queue = new KeyedQueue(1);
  const jobs = Array.from({ length: 18 }, () => held<number>());
  const order: number[] = [];
  const results = jobs.map((job, i) => queue.submit(`serial-${i}`, () => { order.push(i); return job.job(); }));
  for (let i = jobs.length - 1; i >= 0; i -= 1) {
    await checkpoint();
    assert.deepEqual(order, [0]);
    jobs[i].completion.resolve(i);
  }
  assert.deepEqual(await Promise.all(results), jobs.map((_, i) => i));
  assert.deepEqual(order, jobs.map((_, i) => i));
  await queue.onIdle();
});

test("[boundary-2] a later submission from a completion reaction cannot overtake eligible waiters", async () => {
  const queue = new KeyedQueue(1);
  const first = held<void>();
  const order: string[] = [];
  const a = queue.submit("a", first.job);
  let late!: Promise<string>;
  const reaction = a.then(() => {
    late = queue.submit("late", async () => { order.push("late"); return "late value"; });
  });
  const b = queue.submit("b", async () => { order.push("b"); return 2; });
  const c = queue.submit("c", async () => { order.push("c"); return 3; });
  first.completion.resolve(undefined);
  await reaction;
  assert.deepEqual(await Promise.all([b, c, late]), [2, 3, "late value"]);
  assert.deepEqual(order, ["b", "c", "late"]);
  await queue.onIdle();
});

// Extends "cap two holds and waiting keys start in submission order": eligibility
// changes as keys finish, but an older newly eligible waiter keeps its position.
test("[boundary-2] mixed-key waiters retain submission order whenever their keys are free", async () => {
  const queue = new KeyedQueue(2);
  const a0 = held<void>();
  const b0 = held<void>();
  const a = queue.submit("a", a0.job);
  const b = queue.submit("b", b0.job);
  const order: string[] = [];
  const labels = ["a", "c", "b", "d"];
  const jobs = labels.map(() => held<string>());
  const results = jobs.map((job, i) => queue.submit(labels[i], () => {
    order.push(labels[i]);
    return job.job();
  }));
  await checkpoint();
  assert.deepEqual(order, []);
  b0.completion.resolve(undefined);
  await b;
  await checkpoint();
  assert.deepEqual(order, ["c"]);
  a0.completion.resolve(undefined);
  await a;
  await checkpoint();
  assert.deepEqual(order, ["c", "a"]);
  jobs[1].completion.resolve("c value");
  assert.equal(await results[1], "c value");
  await checkpoint();
  assert.deepEqual(order, ["c", "a", "b"]);
  jobs[0].completion.resolve("a value");
  assert.equal(await results[0], "a value");
  await checkpoint();
  assert.deepEqual(order, ["c", "a", "b", "d"]);
  jobs[2].completion.resolve("b value");
  jobs[3].completion.resolve("d value");
  assert.deepEqual(await Promise.all(results), ["a value", "c value", "b value", "d value"]);
  await queue.onIdle();
});

// Extends "a waiting job for a busy key leaves a slot for another key" and
// "multiple jobs for one busy key leave both remaining slots available".
test("[boundary-3] a deep busy-key backlog leaves three slots reusable by unrelated keys", async () => {
  const queue = new KeyedQueue(4);
  const first = held<number>();
  const a = queue.submit("busy", first.job);
  const backlog = Array.from({ length: 12 }, () => held<number>());
  const waiting = backlog.map((job) => queue.submit("busy", job.job));
  for (let round = 0; round < 3; round += 1) {
    const peers = [held<number>(), held<number>(), held<number>()];
    const results = peers.map((job, i) => queue.submit(`peer-${round}-${i}`, job.job));
    await checkpoint();
    assert.deepEqual(peers.map((job) => job.calls), [1, 1, 1]);
    assert.deepEqual(backlog.map((job) => job.calls), backlog.map(() => 0));
    assert.equal(queue.running, 4);
    peers.forEach((job, i) => job.completion.resolve(i));
    await Promise.all(results);
  }
  first.completion.resolve(-1);
  await a;
  for (let i = 0; i < backlog.length; i += 1) {
    await checkpoint();
    assert.deepEqual(backlog.map((job) => job.calls), backlog.map((_, j) => Number(j <= i)));
    backlog[i].completion.resolve(i);
    assert.equal(await waiting[i], i);
  }
  await queue.onIdle();
});

test("[boundary-3] releasing a peer slot skips multiple busy keys to find eligible work", async () => {
  const queue = new KeyedQueue(3);
  const a1 = held<void>();
  const b1 = held<void>();
  const c1 = held<void>();
  const a = queue.submit("a", a1.job);
  const b = queue.submit("b", b1.job);
  const c = queue.submit("c", c1.job);
  const a2 = held<void>();
  const b2 = held<void>();
  const d1 = held<void>();
  const aa = queue.submit("a", a2.job);
  const bb = queue.submit("b", b2.job);
  const d = queue.submit("d", d1.job);
  await checkpoint();
  assert.equal(d1.calls, 0);
  c1.completion.resolve(undefined);
  await c;
  await checkpoint();
  assert.equal(d1.calls, 1);
  assert.equal(a2.calls, 0);
  assert.equal(b2.calls, 0);
  a1.completion.resolve(undefined);
  b1.completion.resolve(undefined);
  await Promise.all([a, b]);
  await checkpoint();
  assert.equal(a2.calls, 1);
  assert.equal(b2.calls, 1);
  a2.completion.resolve(undefined);
  b2.completion.resolve(undefined);
  d1.completion.resolve(undefined);
  await Promise.all([aa, bb, d]);
  await queue.onIdle();
});
