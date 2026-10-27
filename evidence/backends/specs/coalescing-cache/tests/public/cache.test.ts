import { test } from "node:test";
import assert from "node:assert/strict";
import { Cache, type ErrorHandler } from "../../src/index.js";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

type Outcome<T> =
  | { status: "pending" }
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; error: unknown };

function observe<T>(promise: Promise<T>): () => Outcome<T> {
  let outcome: Outcome<T> = { status: "pending" };
  void promise.then(
    (value) => { outcome = { status: "fulfilled", value }; },
    (error: unknown) => { outcome = { status: "rejected", error }; },
  );
  return () => outcome;
}

// Yield an event-loop turn to drain promise work, without reading a clock or
// sleeping for a duration. Observations also let broken implementations fail
// assertions instead of leaving a test waiting on an unresolved loader.
function drain(): Promise<void> {
  return new Promise<void>((resolve) => { setImmediate(resolve); });
}

function fulfilled<T>(read: () => Outcome<T>, value: T): void {
  assert.deepEqual(read(), { status: "fulfilled", value });
}

function pending<T>(read: () => Outcome<T>): void {
  assert.deepEqual(read(), { status: "pending" });
}

function rejected<T>(read: () => Outcome<T>, error: unknown): void {
  const result = read();
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") assert.strictEqual(result.error, error);
}

function harness(options: {
  freshForMs?: number;
  staleForMs?: number;
  maxEntries?: number;
  onError?: ErrorHandler;
} = {}) {
  let now = 1000;
  const calls: Array<{ key: string; load: Deferred<string> }> = [];
  const cache = new Cache<string>({
    loader: (key) => {
      const load = deferred<string>();
      calls.push({ key, load });
      return load.promise;
    },
    freshForMs: options.freshForMs ?? 5000,
    staleForMs: options.staleForMs ?? 5000,
    maxEntries: options.maxEntries ?? 10,
    clock: () => now,
    onError: options.onError,
  });
  const keys = () => calls.map((call) => call.key);
  const read = (key: string) => observe(cache.get(key));
  const at = (time: number) => { now = time; };
  async function resolve(index: number, value: string): Promise<void> {
    assert.ok(calls[index], `expected loader call ${index}`);
    calls[index]!.load.resolve(value);
    await drain();
  }
  async function reject(index: number, error: unknown): Promise<void> {
    assert.ok(calls[index], `expected loader call ${index}`);
    calls[index]!.load.reject(error);
    await drain();
  }
  async function seed(key: string, value: string): Promise<void> {
    const index = calls.length;
    const result = read(key);
    await drain();
    assert.equal(calls.length, index + 1);
    assert.equal(calls[index]!.key, key);
    await resolve(index, value);
    fulfilled(result, value);
  }
  return { cache, calls, keys, read, at, resolve, reject, seed };
}

test("[happy-1] three concurrent gets share one load and its value", async () => {
  const h = harness();
  const results = [h.read("a"), h.read("a"), h.read("a")];
  await drain();
  assert.deepEqual(h.keys(), ["a"]);
  results.forEach(pending);
  await h.resolve(0, "loaded");
  results.forEach((result) => fulfilled(result, "loaded"));
  const cached = h.read("a");
  await drain();
  fulfilled(cached, "loaded");
  assert.deepEqual(h.keys(), ["a"]);
});

test("[happy-1] an empty key and empty value still share and retain a load", async () => {
  const h = harness();
  const first = h.read("");
  await drain();
  const second = h.read("");
  const third = h.read("");
  await drain();
  assert.deepEqual(h.keys(), [""]);
  await h.resolve(0, "");
  [first, second, third].forEach((result) => fulfilled(result, ""));
  const cached = h.read("");
  await drain();
  fulfilled(cached, "");
  assert.deepEqual(h.keys(), [""]);
});

test("[boundary-1] different keys start independently and may settle in reverse order", async () => {
  const h = harness();
  const a = h.read("a");
  const b = h.read("b");
  await drain();
  assert.deepEqual(h.keys(), ["a", "b"]);
  pending(a);
  pending(b);
  await h.resolve(1, "B");
  fulfilled(b, "B");
  pending(a);
  await h.resolve(0, "A");
  fulfilled(a, "A");
});

test("[boundary-1] rejection for one key does not settle another key's load", async () => {
  const h = harness();
  const error = new Error("a failed");
  const a = h.read("a");
  const b = h.read("b");
  await drain();
  assert.deepEqual(h.keys(), ["a", "b"]);
  await h.reject(0, error);
  rejected(a, error);
  pending(b);
  await h.resolve(1, "B");
  fulfilled(b, "B");
});

test("[unhappy-1] concurrent failures share the loader error and a later get retries", async () => {
  const h = harness();
  const error = new Error("load failed");
  const first = h.read("a");
  const second = h.read("a");
  await drain();
  assert.deepEqual(h.keys(), ["a"]);
  await h.reject(0, error);
  rejected(first, error);
  rejected(second, error);
  const retry = h.read("a");
  await drain();
  assert.deepEqual(h.keys(), ["a", "a"]);
  pending(retry);
  await h.resolve(1, "recovered");
  fulfilled(retry, "recovered");
});

test("[unhappy-1] an immediate retry is coalesced and can cache a successful value", async () => {
  const h = harness();
  const error = { reason: "non-Error rejection" };
  const failed = h.read("a");
  await drain();
  await h.reject(0, error);
  rejected(failed, error);
  // The clock has not advanced since the failed load.
  const retries = [h.read("a"), h.read("a")];
  await drain();
  assert.deepEqual(h.keys(), ["a", "a"]);
  await h.resolve(1, "recovered");
  retries.forEach((result) => fulfilled(result, "recovered"));
  const cached = h.read("a");
  await drain();
  fulfilled(cached, "recovered");
  assert.deepEqual(h.keys(), ["a", "a"]);
});

test("[happy-2] a value loaded at 1000 is fresh at 5999", async () => {
  const h = harness();
  await h.seed("a", "original");
  h.at(5999);
  const result = h.read("a");
  await drain();
  fulfilled(result, "original");
  assert.deepEqual(h.keys(), ["a"]);
});

test("[happy-2] freshness starts at settlement even when loading takes time", async () => {
  const h = harness();
  const initial = h.read("a");
  await drain();
  h.at(4000);
  await h.resolve(0, "original");
  fulfilled(initial, "original");
  const justLoaded = h.read("a");
  await drain();
  fulfilled(justLoaded, "original");
  h.at(8999);
  const nearBoundary = h.read("a");
  await drain();
  fulfilled(nearBoundary, "original");
  assert.deepEqual(h.keys(), ["a"]);
});

test("[boundary-2] age 5000 serves stale immediately and shares one refresh", async () => {
  const h = harness();
  await h.seed("a", "original");
  h.at(6000);
  const firstStale = h.read("a");
  await drain();
  fulfilled(firstStale, "original");
  assert.deepEqual(h.keys(), ["a", "a"]);
  h.at(6500);
  const secondStale = h.read("a");
  await drain();
  fulfilled(secondStale, "original");
  assert.deepEqual(h.keys(), ["a", "a"]);
  h.at(7000);
  await h.resolve(1, "refreshed");
  const justRefreshed = h.read("a");
  await drain();
  fulfilled(justRefreshed, "refreshed");
  h.at(11999);
  const stillFresh = h.read("a");
  await drain();
  fulfilled(stillFresh, "refreshed");
  assert.deepEqual(h.keys(), ["a", "a"]);
  h.at(12000);
  const staleAgain = h.read("a");
  await drain();
  fulfilled(staleAgain, "refreshed");
  assert.deepEqual(h.keys(), ["a", "a", "a"]);
  await h.resolve(2, "third");
});

test("[boundary-2] zero fresh duration makes a just-loaded value stale", async () => {
  const h = harness({ freshForMs: 0 });
  await h.seed("a", "original");
  const results = [h.read("a"), h.read("a"), h.read("a")];
  await drain();
  results.forEach((result) => fulfilled(result, "original"));
  assert.deepEqual(h.keys(), ["a", "a"]);
  await h.resolve(1, "refreshed");
});

test("[boundary-3] age 10000 waits for a new load and never serves the expired value", async () => {
  const h = harness();
  await h.seed("a", "expired");
  h.at(11000);
  const first = h.read("a");
  const second = h.read("a");
  await drain();
  assert.deepEqual(h.keys(), ["a", "a"]);
  pending(first);
  pending(second);
  await h.resolve(1, "new");
  fulfilled(first, "new");
  fulfilled(second, "new");
  const cached = h.read("a");
  await drain();
  fulfilled(cached, "new");
  assert.deepEqual(h.keys(), ["a", "a"]);
});

test("[boundary-3] zero stale duration expires a value exactly at the fresh boundary", async () => {
  const h = harness({ staleForMs: 0 });
  await h.seed("a", "old");
  h.at(5999);
  const fresh = h.read("a");
  await drain();
  fulfilled(fresh, "old");
  assert.deepEqual(h.keys(), ["a"]);
  h.at(6000);
  const expired = h.read("a");
  await drain();
  pending(expired);
  assert.deepEqual(h.keys(), ["a", "a"]);
  await h.resolve(1, "new");
  fulfilled(expired, "new");
});

test("[unhappy-2] failed background refresh reports its error and permits another stale refresh", async () => {
  const errors: Array<{ error: unknown; key: string }> = [];
  const h = harness({ onError: (error, key) => { errors.push({ error, key }); } });
  await h.seed("a", "stale");
  h.at(6000);
  const stale = h.read("a");
  await drain();
  fulfilled(stale, "stale");
  assert.deepEqual(h.keys(), ["a", "a"]);
  assert.deepEqual(errors, []);
  const error = new Error("refresh failed");
  h.at(6500);
  await h.reject(1, error);
  fulfilled(stale, "stale");
  assert.equal(errors.length, 1);
  assert.strictEqual(errors[0]!.error, error);
  assert.equal(errors[0]!.key, "a");
  h.at(7000);
  const retry = h.read("a");
  await drain();
  fulfilled(retry, "stale");
  assert.deepEqual(h.keys(), ["a", "a", "a"]);
  await h.resolve(2, "recovered");
  const recovered = h.read("a");
  await drain();
  fulfilled(recovered, "recovered");
});

test("[unhappy-2] without an error handler a failed refresh preserves the original expiry", async () => {
  const h = harness();
  await h.seed("a", "stale");
  h.at(6000);
  const stale = h.read("a");
  await drain();
  fulfilled(stale, "stale");
  h.at(10998);
  await h.reject(1, new Error("refresh failed"));
  h.at(10999);
  const retry = h.read("a");
  await drain();
  fulfilled(retry, "stale");
  assert.deepEqual(h.keys(), ["a", "a", "a"]);
  await h.reject(2, new Error("refresh failed again"));
  h.at(11000);
  const expired = h.read("a");
  await drain();
  pending(expired);
  assert.deepEqual(h.keys(), ["a", "a", "a", "a"]);
  await h.resolve(3, "new");
  fulfilled(expired, "new");
});

test("[boundary-4] reading a makes b least recently used when c is stored", async () => {
  const h = harness({ maxEntries: 2 });
  await h.seed("a", "A");
  await h.seed("b", "B");
  const touchedA = h.read("a");
  await drain();
  fulfilled(touchedA, "A");
  await h.seed("c", "C");
  const a = h.read("a");
  const c = h.read("c");
  await drain();
  fulfilled(a, "A");
  fulfilled(c, "C");
  assert.deepEqual(h.keys(), ["a", "b", "c"]);
  const b = h.read("b");
  await drain();
  pending(b);
  assert.deepEqual(h.keys(), ["a", "b", "c", "b"]);
  await h.resolve(3, "B2");
  fulfilled(b, "B2");
});

test("[boundary-4] a stale read counts as use before its refresh settles", async () => {
  const h = harness({ maxEntries: 2 });
  await h.seed("a", "A");
  h.at(2000);
  await h.seed("b", "B");
  h.at(6000);
  const staleA = h.read("a");
  await drain();
  fulfilled(staleA, "A");
  assert.deepEqual(h.keys(), ["a", "b", "a"]);
  await h.seed("c", "C");
  const a = h.read("a");
  const c = h.read("c");
  await drain();
  fulfilled(a, "A");
  fulfilled(c, "C");
  assert.deepEqual(h.keys(), ["a", "b", "a", "c"]);
  const b = h.read("b");
  await drain();
  pending(b);
  assert.deepEqual(h.keys(), ["a", "b", "a", "c", "b"]);
  await h.resolve(2, "A2");
  await h.resolve(4, "B2");
  fulfilled(b, "B2");
});

test("[boundary-4] a load settling after a newer load counts as the latest use", async () => {
  const h = harness({ maxEntries: 2 });
  const a = h.read("a");
  await drain();
  await h.seed("b", "B");
  await h.resolve(0, "A");
  fulfilled(a, "A");
  await h.seed("c", "C");
  const retainedA = h.read("a");
  const retainedC = h.read("c");
  await drain();
  fulfilled(retainedA, "A");
  fulfilled(retainedC, "C");
  assert.deepEqual(h.keys(), ["a", "b", "c"]);
  const evictedB = h.read("b");
  await drain();
  pending(evictedB);
  assert.deepEqual(h.keys(), ["a", "b", "c", "b"]);
  await h.resolve(3, "B2");
});

test("[boundary-4] a background refresh settling counts as a use of its key", async () => {
  const h = harness({ maxEntries: 2 });
  await h.seed("a", "A");
  h.at(2000);
  await h.seed("b", "B");
  h.at(6000);
  const staleA = h.read("a");
  await drain();
  fulfilled(staleA, "A");
  const touchedB = h.read("b");
  await drain();
  fulfilled(touchedB, "B");
  h.at(6500);
  await h.resolve(2, "A2");
  await h.seed("c", "C");
  const a = h.read("a");
  const c = h.read("c");
  await drain();
  fulfilled(a, "A2");
  fulfilled(c, "C");
  assert.deepEqual(h.keys(), ["a", "b", "a", "c"]);
  const b = h.read("b");
  await drain();
  pending(b);
  assert.deepEqual(h.keys(), ["a", "b", "a", "c", "b"]);
  await h.resolve(4, "B2");
});

test("[boundary-5] a pending load takes no capacity until it settles", async () => {
  const h = harness({ maxEntries: 1 });
  await h.seed("a", "A");
  const b = h.read("b");
  await drain();
  pending(b);
  const a = h.read("a");
  await drain();
  fulfilled(a, "A");
  assert.deepEqual(h.keys(), ["a", "b"]);
  await h.resolve(1, "B");
  fulfilled(b, "B");
  const retainedB = h.read("b");
  await drain();
  fulfilled(retainedB, "B");
  const evictedA = h.read("a");
  await drain();
  pending(evictedA);
  assert.deepEqual(h.keys(), ["a", "b", "a"]);
  await h.resolve(2, "A2");
});

test("[boundary-5] several pending loads use capacity in settlement order", async () => {
  const h = harness({ maxEntries: 1 });
  await h.seed("a", "A");
  const b = h.read("b");
  const c = h.read("c");
  await drain();
  const a = h.read("a");
  await drain();
  fulfilled(a, "A");
  assert.deepEqual(h.keys(), ["a", "b", "c"]);
  await h.resolve(2, "C");
  fulfilled(c, "C");
  pending(b);
  const retainedC = h.read("c");
  await drain();
  fulfilled(retainedC, "C");
  assert.deepEqual(h.keys(), ["a", "b", "c"]);
  await h.resolve(1, "B");
  fulfilled(b, "B");
  const retainedB = h.read("b");
  await drain();
  fulfilled(retainedB, "B");
  const evictedC = h.read("c");
  await drain();
  pending(evictedC);
  assert.deepEqual(h.keys(), ["a", "b", "c", "c"]);
  await h.resolve(3, "C2");
});

test("[happy-3] invalidating a fresh entry forces a new load and value", async () => {
  const h = harness();
  await h.seed("a", "old");
  h.cache.invalidate("a");
  const result = h.read("a");
  await drain();
  pending(result);
  assert.deepEqual(h.keys(), ["a", "a"]);
  await h.resolve(1, "new");
  fulfilled(result, "new");
  const cached = h.read("a");
  await drain();
  fulfilled(cached, "new");
  assert.deepEqual(h.keys(), ["a", "a"]);
});

test("[happy-3] repeated invalidation of an absent key leaves other entries available", async () => {
  const h = harness();
  await h.seed("a", "A");
  await h.seed("b", "B");
  h.cache.invalidate("a");
  h.cache.invalidate("a");
  const b = h.read("b");
  await drain();
  fulfilled(b, "B");
  assert.deepEqual(h.keys(), ["a", "b"]);
  await h.seed("a", "A2");
  const a = h.read("a");
  await drain();
  fulfilled(a, "A2");
  assert.deepEqual(h.keys(), ["a", "b", "a"]);
});

test("[boundary-6] invalidation discards an in-flight result but resolves both existing waiters", async () => {
  const h = harness();
  const first = h.read("a");
  const second = h.read("a");
  await drain();
  assert.deepEqual(h.keys(), ["a"]);
  h.cache.invalidate("a");
  pending(first);
  pending(second);
  await h.resolve(0, "discarded");
  fulfilled(first, "discarded");
  fulfilled(second, "discarded");
  const next = h.read("a");
  await drain();
  pending(next);
  assert.deepEqual(h.keys(), ["a", "a"]);
  await h.resolve(1, "retained");
  fulfilled(next, "retained");
  const cached = h.read("a");
  await drain();
  fulfilled(cached, "retained");
  assert.deepEqual(h.keys(), ["a", "a"]);
});

test("[boundary-6] invalidation also discards the result of a background refresh", async () => {
  const h = harness();
  await h.seed("a", "stale");
  h.at(6000);
  const stale = h.read("a");
  await drain();
  fulfilled(stale, "stale");
  assert.deepEqual(h.keys(), ["a", "a"]);
  h.cache.invalidate("a");
  await h.resolve(1, "discarded refresh");
  fulfilled(stale, "stale");
  const next = h.read("a");
  await drain();
  pending(next);
  assert.deepEqual(h.keys(), ["a", "a", "a"]);
  await h.resolve(2, "new");
  fulfilled(next, "new");
});
