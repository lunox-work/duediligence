import { test } from "node:test";
import assert from "node:assert/strict";
import { Cache, type ErrorHandler } from "../../src/index.js";

type Deferred<V> = {
  promise: Promise<V>;
  resolve: (value: V) => void;
  reject: (error: unknown) => void;
};

function deferred<V>(): Deferred<V> {
  let resolve!: (value: V) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<V>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

type Outcome<V> =
  | { status: "pending" }
  | { status: "fulfilled"; value: V }
  | { status: "rejected"; error: unknown };

function observe<V>(promise: Promise<V>): () => Outcome<V> {
  let result: Outcome<V> = { status: "pending" };
  void promise.then(
    (value: V) => { result = { status: "fulfilled", value }; },
    (error: unknown) => { result = { status: "rejected", error }; },
  );
  return () => result;
}

// Drain promise work without a clock, timer duration, or an unresolved await.
function drain(): Promise<void> {
  return new Promise<void>((resolve) => { setImmediate(resolve); });
}

function pending<V>(read: () => Outcome<V>): void {
  assert.deepEqual(read(), { status: "pending" });
}

function fulfilled<V>(read: () => Outcome<V>, value: V): void {
  assert.deepEqual(read(), { status: "fulfilled", value });
}

function rejected<V>(read: () => Outcome<V>, error: unknown): void {
  const result = read();
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") assert.strictEqual(result.error, error);
}

function harness<V = string>(options: {
  freshForMs?: number;
  staleForMs?: number;
  maxEntries?: number;
  now?: number;
  onError?: ErrorHandler;
} = {}) {
  let now = options.now ?? 42000;
  const calls: Array<{ key: string; load: Deferred<V> }> = [];
  const cache = new Cache<V>({
    loader: (key: string) => {
      const load = deferred<V>();
      calls.push({ key, load });
      return load.promise;
    },
    freshForMs: options.freshForMs ?? 37,
    staleForMs: options.staleForMs ?? 19,
    maxEntries: options.maxEntries ?? 16,
    clock: () => now,
    onError: options.onError,
  });
  const count = (key: string) => calls.filter((call) => call.key === key).length;
  function load(key: string, attempt: number): Deferred<V> {
    const call = calls.filter((item) => item.key === key)[attempt];
    assert.ok(call, `missing attempt ${attempt} for ${JSON.stringify(key)}`);
    return call!.load;
  }
  // Count by key rather than requiring an unspecified inter-key call order.
  function counts(expected: ReadonlyArray<readonly [string, number]>): void {
    assert.equal(calls.length, expected.reduce((sum, [, n]) => sum + n, 0));
    for (const [key, n] of expected) assert.equal(count(key), n, `loads for ${JSON.stringify(key)}`);
  }
  const read = (key: string) => observe(cache.get(key));
  async function resolve(key: string, attempt: number, value: V): Promise<void> {
    load(key, attempt).resolve(value);
    await drain();
  }
  async function reject(key: string, attempt: number, error: unknown): Promise<void> {
    load(key, attempt).reject(error);
    await drain();
  }
  async function seed(key: string, value: V): Promise<void> {
    const attempt = count(key);
    const result = read(key);
    await drain();
    assert.equal(count(key), attempt + 1);
    pending(result);
    await resolve(key, attempt, value);
    fulfilled(result, value);
  }
  return { cache, calls, read, count, counts, resolve, reject, seed,
    at: (time: number) => { now = time; } };
}

// Extends public "three concurrent gets share one load and its value":
// subscribers arrive in several waves, rather than a special case of three.
test("[happy-1] sixty-four staggered subscribers share one structured result", async () => {
  const h = harness<{ items: number[]; label: string }>();
  const results: Array<() => Outcome<{ items: number[]; label: string }>> = [];
  for (let wave = 0; wave < 8; wave++) {
    for (let i = 0; i < 8; i++) results.push(h.read("long/鍵/" + "x".repeat(1024)));
    await drain();
    h.counts([["long/鍵/" + "x".repeat(1024), 1]]);
    results.forEach(pending);
  }
  const value = { items: Array.from({ length: 40 }, (_, i) => i * i), label: "payload" };
  await h.resolve("long/鍵/" + "x".repeat(1024), 0, value);
  results.forEach((result) => fulfilled(result, value));
  const cached = h.read("long/鍵/" + "x".repeat(1024));
  await drain();
  fulfilled(cached, value);
  assert.equal(h.calls.length, 1);
});

// Extends public "an empty key and empty value still share and retain a load".
test("[happy-1] empty and special keys retain all falsey value types", async () => {
  const h = harness<unknown>();
  const cases: Array<[string, unknown]> = [
    ["", false], ["__proto__", undefined], ["constructor", null],
    ["toString", 0], ["hasOwnProperty", ""], ["valueOf", Number.NaN],
  ];
  for (const [key, value] of cases) {
    const results = Array.from({ length: 7 }, () => h.read(key));
    await drain();
    assert.equal(h.count(key), 1);
    await h.resolve(key, 0, value);
    results.forEach((result) => fulfilled(result, value));
  }
  for (const [key, value] of cases) {
    const result = h.read(key);
    await drain();
    fulfilled(result, value);
    assert.equal(h.count(key), 1);
  }
  assert.equal(h.calls.length, cases.length);
});

// Extends public "different keys start independently and may settle in reverse order".
test("[boundary-1] nine distinct keys with five subscribers each settle independently", async () => {
  const h = harness();
  const keys = ["__proto__", "constructor", "toString", "hasOwnProperty", " x", "x", "X", "π", ""];
  const results = keys.map((key) => Array.from({ length: 5 }, () => h.read(key)));
  await drain();
  h.counts(keys.map((key) => [key, 1] as const));
  results.flat().forEach(pending);
  for (let i = keys.length - 1; i >= 0; i--) {
    await h.resolve(keys[i]!, 0, `answer:${i}`);
    results[i]!.forEach((result) => fulfilled(result, `answer:${i}`));
    for (let j = 0; j < i; j++) results[j]!.forEach(pending);
  }
});

// Extends public "rejection for one key does not settle another key's load".
test("[boundary-1] failures and retries on two keys do not block three other loads", async () => {
  const h = harness();
  const keys = ["north", "south", "east", "west", "center"];
  const results = keys.map((key) => h.read(key));
  await drain();
  h.counts(keys.map((key) => [key, 1] as const));
  const error = { message: "isolated failure" };
  await h.reject("east", 0, error);
  rejected(results[2]!, error);
  const retry = h.read("east");
  await drain();
  assert.equal(h.count("east"), 2);
  await h.resolve("west", 0, "W");
  fulfilled(results[3]!, "W");
  const otherError = new Error("south only");
  await h.reject("south", 0, otherError);
  rejected(results[1]!, otherError);
  pending(results[0]!);
  pending(results[4]!);
  pending(retry);
  await h.resolve("east", 1, "E2");
  fulfilled(retry, "E2");
  await h.resolve("center", 0, "C");
  await h.resolve("north", 0, "N");
  fulfilled(results[0]!, "N");
  fulfilled(results[4]!, "C");
});

// Extends public "concurrent failures share the loader error and a later get retries".
test("[unhappy-1] repeated failed waves preserve each exact rejection reason", async () => {
  const h = harness<unknown>();
  const errors: unknown[] = [new Error("first wave"), { code: 73 }, "third wave", undefined];
  for (let attempt = 0; attempt < errors.length; attempt++) {
    const results = Array.from({ length: 12 }, () => h.read("retry/key"));
    await drain();
    h.counts([["retry/key", attempt + 1]]);
    results.forEach(pending);
    await h.reject("retry/key", attempt, errors[attempt]);
    results.forEach((result) => rejected(result, errors[attempt]));
  }
  await h.seed("retry/key", false);
  const cached = h.read("retry/key");
  await drain();
  fulfilled(cached, false);
  h.counts([["retry/key", 5]]);
});

// Extends public "an immediate retry is coalesced and can cache a successful value":
// the loader returns promises that are already rejected or fulfilled.
test("[unhappy-1] already-rejected promises clear the flight on every retry", async () => {
  const errors: unknown[] = [0, null, { failure: "third" }];
  let calls = 0;
  const cache = new Cache<boolean>({
    loader: (key: string) => {
      assert.equal(key, "instant");
      const attempt = calls++;
      return attempt < errors.length ? Promise.reject(errors[attempt]) : Promise.resolve(false);
    },
    freshForMs: 91, staleForMs: 11, maxEntries: 4, clock: () => 78000,
  });
  for (let attempt = 0; attempt < errors.length; attempt++) {
    const results = Array.from({ length: 9 }, () => observe(cache.get("instant")));
    await drain();
    assert.equal(calls, attempt + 1);
    results.forEach((result) => rejected(result, errors[attempt]));
  }
  const results = Array.from({ length: 9 }, () => observe(cache.get("instant")));
  await drain();
  results.forEach((result) => fulfilled(result, false));
  const cached = observe(cache.get("instant"));
  await drain();
  fulfilled(cached, false);
  assert.equal(calls, 4);
});

// Extends public "a value loaded at 1000 is fresh at 5999".
test("[happy-2] custom freshness durations work at zero and the final fresh millisecond", async () => {
  for (const freshForMs of [1, 2, 83, 65537]) {
    const h = harness({ freshForMs, staleForMs: 23, now: 0 });
    await h.seed("origin-zero", `value:${freshForMs}`);
    for (const time of [0, freshForMs - 1]) {
      h.at(time);
      const result = h.read("origin-zero");
      await drain();
      fulfilled(result, `value:${freshForMs}`);
      h.counts([["origin-zero", 1]]);
    }
  }
});

// Extends public "freshness starts at settlement even when loading takes time".
test("[happy-2] separate slow loads receive separate settlement-based lifetimes", async () => {
  const h = harness({ freshForMs: 101, staleForMs: 13 });
  const first = h.read("slow-one");
  const second = h.read("slow-two");
  await drain();
  h.at(900000);
  await h.resolve("slow-two", 0, "second");
  fulfilled(second, "second");
  pending(first);
  h.at(900100);
  const nearSecondBoundary = h.read("slow-two");
  await drain();
  fulfilled(nearSecondBoundary, "second");
  h.at(1000000);
  await h.resolve("slow-one", 0, "first");
  fulfilled(first, "first");
  h.at(1000100);
  const nearFirstBoundary = h.read("slow-one");
  await drain();
  fulfilled(nearFirstBoundary, "first");
  h.counts([["slow-one", 1], ["slow-two", 1]]);
});

// Extends public "age 5000 serves stale immediately and shares one refresh".
test("[boundary-2] frequent fresh reads do not postpone the first stale instant", async () => {
  const h = harness({ freshForMs: 17, staleForMs: 9 });
  await h.seed("fixed-ttl", "original");
  for (const age of [1, 5, 11, 16]) {
    h.at(42000 + age);
    const fresh = h.read("fixed-ttl");
    await drain();
    fulfilled(fresh, "original");
    h.counts([["fixed-ttl", 1]]);
  }
  h.at(42017);
  const stale = Array.from({ length: 20 }, () => h.read("fixed-ttl"));
  await drain();
  stale.forEach((result) => fulfilled(result, "original"));
  h.counts([["fixed-ttl", 2]]);
  h.at(42025);
  const lastStale = h.read("fixed-ttl");
  await drain();
  fulfilled(lastStale, "original");
  h.counts([["fixed-ttl", 2]]);
  h.at(43000);
  await h.resolve("fixed-ttl", 1, "renewed");
  h.at(43016);
  const freshAgain = h.read("fixed-ttl");
  await drain();
  fulfilled(freshAgain, "renewed");
  h.counts([["fixed-ttl", 2]]);
});

// Extends public "zero fresh duration makes a just-loaded value stale".
test("[boundary-2] zero freshness coalesces large stale bursts after each refresh", async () => {
  const h = harness<unknown>({ freshForMs: 0, staleForMs: 7 });
  await h.seed("zero-fresh", undefined);
  const values: unknown[] = [undefined, 0, false, null];
  for (let generation = 0; generation < values.length - 1; generation++) {
    const results = Array.from({ length: 32 }, () => h.read("zero-fresh"));
    await drain();
    results.forEach((result) => fulfilled(result, values[generation]));
    h.counts([["zero-fresh", generation + 2]]);
    h.at(42000 + generation + 1);
    await h.resolve("zero-fresh", generation + 1, values[generation + 1]);
  }
});

// Extends public "age 5000 serves stale immediately and shares one refresh".
test("[boundary-2] three refresh generations each get a new settlement timestamp", async () => {
  const h = harness({ freshForMs: 11, staleForMs: 6 });
  await h.seed("generations", "v0");
  let settledAt = 42000;
  for (let generation = 1; generation <= 3; generation++) {
    h.at(settledAt + 11);
    const stale = h.read("generations");
    await drain();
    fulfilled(stale, `v${generation - 1}`);
    h.counts([["generations", generation + 1]]);
    settledAt += 14;
    h.at(settledAt);
    await h.resolve("generations", generation, `v${generation}`);
    h.at(settledAt + 10);
    const fresh = h.read("generations");
    await drain();
    fulfilled(fresh, `v${generation}`);
    h.counts([["generations", generation + 1]]);
  }
});

// Extends public "age 10000 waits for a new load and never serves the expired value":
// expiration occurs while a background load is already outstanding.
test("[boundary-3] expired readers join the existing refresh and wait for its value", async () => {
  const h = harness();
  await h.seed("cross-expiry", "old");
  h.at(42037);
  const stale = h.read("cross-expiry");
  await drain();
  fulfilled(stale, "old");
  h.at(42055);
  const lastStale = h.read("cross-expiry");
  await drain();
  fulfilled(lastStale, "old");
  h.at(42056);
  const waiting = Array.from({ length: 15 }, () => h.read("cross-expiry"));
  await drain();
  waiting.forEach(pending);
  h.counts([["cross-expiry", 2]]);
  h.at(90000);
  const muchLater = h.read("cross-expiry");
  await drain();
  pending(muchLater);
  h.counts([["cross-expiry", 2]]);
  await h.resolve("cross-expiry", 1, "new");
  waiting.forEach((result) => fulfilled(result, "new"));
  fulfilled(muchLater, "new");
  fulfilled(stale, "old");
  fulfilled(lastStale, "old");
  const cached = h.read("cross-expiry");
  await drain();
  fulfilled(cached, "new");
  h.counts([["cross-expiry", 2]]);
});

// Extends public "zero stale duration expires a value exactly at the fresh boundary".
test("[boundary-3] zero staleness with a one-millisecond TTL waits at every boundary", async () => {
  const h = harness({ freshForMs: 1, staleForMs: 0, now: 0 });
  await h.seed("one-ms", "v0");
  for (let generation = 1; generation <= 4; generation++) {
    h.at(generation);
    const results = Array.from({ length: 17 }, () => h.read("one-ms"));
    await drain();
    results.forEach(pending);
    h.counts([["one-ms", generation + 1]]);
    await h.resolve("one-ms", generation, `v${generation}`);
    results.forEach((result) => fulfilled(result, `v${generation}`));
    const fresh = h.read("one-ms");
    await drain();
    fulfilled(fresh, `v${generation}`);
    h.counts([["one-ms", generation + 1]]);
  }
});

// Extends public "zero stale duration expires a value exactly at the fresh boundary"
// and "zero fresh duration makes a just-loaded value stale": both durations are zero.
test("[boundary-3] zero total lifetime shares active loads but never reuses a settled value", async () => {
  const h = harness({ freshForMs: 0, staleForMs: 0 });
  for (let attempt = 0; attempt < 4; attempt++) {
    const results = Array.from({ length: 6 }, () => h.read("no-lifetime"));
    await drain();
    results.forEach(pending);
    h.counts([["no-lifetime", attempt + 1]]);
    await h.resolve("no-lifetime", attempt, `answer:${attempt}`);
    results.forEach((result) => fulfilled(result, `answer:${attempt}`));
  }
});

// Extends public "age 10000 waits for a new load and never serves the expired value".
test("[boundary-3] a failed expired reload never resurrects the original value", async () => {
  const h = harness();
  await h.seed("expired-failure", "discard forever");
  h.at(80000);
  for (let attempt = 1; attempt <= 2; attempt++) {
    const results = [h.read("expired-failure"), h.read("expired-failure")];
    await drain();
    results.forEach(pending);
    h.counts([["expired-failure", attempt + 1]]);
    const error = new Error(`reload ${attempt} failed`);
    await h.reject("expired-failure", attempt, error);
    results.forEach((result) => rejected(result, error));
  }
  await h.seed("expired-failure", "finally new");
});

// Extends public "a value loaded at 1000 is fresh at 5999" and
// "age 10000 waits for a new load and never serves the expired value".
test("[boundary-3] millisecond arithmetic survives timestamps and durations above 32 bits", async () => {
  const origin = 9000000000000;
  const freshForMs = 2 ** 32 + 17;
  const staleForMs = 2 ** 32 + 9;
  const h = harness({ now: origin, freshForMs, staleForMs });
  await h.seed("wide-clock", "old");
  h.at(origin + freshForMs - 1);
  const fresh = h.read("wide-clock");
  await drain();
  fulfilled(fresh, "old");
  h.counts([["wide-clock", 1]]);
  h.at(origin + freshForMs + staleForMs);
  const expired = h.read("wide-clock");
  await drain();
  pending(expired);
  h.counts([["wide-clock", 2]]);
  await h.resolve("wide-clock", 1, "new");
  fulfilled(expired, "new");
});

// Extends public "failed background refresh reports its error and permits another stale refresh".
test("[unhappy-2] repeated failures report exact reasons and special keys independently", async () => {
  const errors: Array<{ error: unknown; key: string }> = [];
  const h = harness({ onError: (error: unknown, key: string) => { errors.push({ error, key }); } });
  await h.seed("", "empty-key value");
  await h.seed("__proto__", "prototype-key value");
  h.at(42037);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const empty = h.read("");
    const proto = h.read("__proto__");
    await drain();
    fulfilled(empty, "empty-key value");
    fulfilled(proto, "prototype-key value");
    h.counts([["", attempt + 1], ["__proto__", attempt + 1]]);
    const protoError = { attempt, key: "prototype" };
    const emptyError = new Error(`empty key attempt ${attempt}`);
    await h.reject("__proto__", attempt, protoError);
    await h.reject("", attempt, emptyError);
    assert.equal(errors.length, attempt * 2);
    assert.strictEqual(errors[attempt * 2 - 2]!.error, protoError);
    assert.equal(errors[attempt * 2 - 2]!.key, "__proto__");
    assert.strictEqual(errors[attempt * 2 - 1]!.error, emptyError);
    assert.equal(errors[attempt * 2 - 1]!.key, "");
    h.at(42037 + attempt);
  }
  const retry = h.read("");
  await drain();
  fulfilled(retry, "empty-key value");
  await h.resolve("", 4, "recovered");
  const fresh = h.read("");
  await drain();
  fulfilled(fresh, "recovered");
});

// Extends public "without an error handler a failed refresh preserves the original expiry".
test("[unhappy-2] three unhandled refresh failures neither slide expiry nor lose stale data", async () => {
  const h = harness();
  await h.seed("no-handler", "stale");
  for (let attempt = 1; attempt <= 3; attempt++) {
    h.at(42036 + attempt);
    const stale = h.read("no-handler");
    await drain();
    fulfilled(stale, "stale");
    await h.reject("no-handler", attempt, new Error(`background ${attempt}`));
  }
  h.at(42055);
  const lastStale = h.read("no-handler");
  await drain();
  fulfilled(lastStale, "stale");
  await h.reject("no-handler", 4, { code: "last refresh" });
  h.at(42056);
  const expired = h.read("no-handler");
  await drain();
  pending(expired);
  h.counts([["no-handler", 6]]);
  await h.resolve("no-handler", 5, "new");
  fulfilled(expired, "new");
});

// Extends public "failed background refresh reports its error and permits another stale refresh".
test("[unhappy-2] refresh failure also rejects readers that joined after expiration", async () => {
  const reports: Array<{ error: unknown; key: string }> = [];
  const h = harness({ onError: (error: unknown, key: string) => { reports.push({ error, key }); } });
  await h.seed("aging-refresh", "stale");
  h.at(42037);
  const stale = h.read("aging-refresh");
  await drain();
  fulfilled(stale, "stale");
  h.at(42056);
  const expired = Array.from({ length: 11 }, () => h.read("aging-refresh"));
  await drain();
  expired.forEach(pending);
  h.counts([["aging-refresh", 2]]);
  const error = { reason: "background load also has foreground waiters" };
  await h.reject("aging-refresh", 1, error);
  expired.forEach((result) => rejected(result, error));
  fulfilled(stale, "stale");
  assert.equal(reports.length, 1);
  assert.strictEqual(reports[0]!.error, error);
  assert.equal(reports[0]!.key, "aging-refresh");
  await h.seed("aging-refresh", "recovered");
});

// Extends public "three concurrent gets share one load and its value".
test("[happy-1] sharing the same key in two cache instances does not share their loaders", async () => {
  const left = harness();
  const right = harness();
  const leftReaders = Array.from({ length: 5 }, () => left.read("same-key"));
  const rightReaders = Array.from({ length: 5 }, () => right.read("same-key"));
  await drain();
  left.counts([["same-key", 1]]);
  right.counts([["same-key", 1]]);
  await right.resolve("same-key", 0, "right result");
  rightReaders.forEach((result) => fulfilled(result, "right result"));
  leftReaders.forEach(pending);
  await left.resolve("same-key", 0, "left result");
  leftReaders.forEach((result) => fulfilled(result, "left result"));
});

// Extends public "reading a makes b least recently used when c is stored".
test("[boundary-4] a four-entry LRU follows multiple touches even when clock times tie", async () => {
  const h = harness({ maxEntries: 4 });
  for (const key of ["oak", "pine", "elm", "ash"]) await h.seed(key, key.toUpperCase());
  for (const key of ["pine", "oak"]) {
    const result = h.read(key);
    await drain();
    fulfilled(result, key.toUpperCase());
  }
  await h.seed("fir", "FIR");
  for (const key of ["oak", "pine", "ash", "fir"]) {
    const result = h.read(key);
    await drain();
    fulfilled(result, key.toUpperCase());
  }
  h.counts([["oak", 1], ["pine", 1], ["elm", 1], ["ash", 1], ["fir", 1]]);
  const evicted = h.read("elm");
  await drain();
  pending(evicted);
  assert.equal(h.count("elm"), 2);
  await h.resolve("elm", 1, "ELM2");
  fulfilled(evicted, "ELM2");
});

// Extends public "a stale read counts as use before its refresh settles".
test("[boundary-4] stale use protects the oldest of three entries during a pending refresh", async () => {
  const h = harness({ maxEntries: 3 });
  await h.seed("oldest", "O");
  h.at(42010);
  await h.seed("middle", "M");
  h.at(42011);
  await h.seed("newest", "N");
  h.at(42037);
  const stale = h.read("oldest");
  await drain();
  fulfilled(stale, "O");
  await h.seed("fourth", "F");
  for (const [key, value] of [["oldest", "O"], ["newest", "N"], ["fourth", "F"]]) {
    const result = h.read(key!);
    await drain();
    fulfilled(result, value!);
  }
  h.counts([["oldest", 2], ["middle", 1], ["newest", 1], ["fourth", 1]]);
  const evicted = h.read("middle");
  await drain();
  pending(evicted);
  assert.equal(h.count("middle"), 2);
  await h.resolve("oldest", 1, "O2");
  await h.resolve("middle", 1, "M2");
  fulfilled(evicted, "M2");
});

// Extends public "a load settling after a newer load counts as the latest use".
test("[boundary-4] settlement use wins over start order and intervening fresh hits", async () => {
  const h = harness({ maxEntries: 3 });
  const slow = h.read("slow");
  await drain();
  await h.seed("earlier", "E");
  await h.seed("later", "L");
  const touched = h.read("earlier");
  await drain();
  fulfilled(touched, "E");
  await h.resolve("slow", 0, "S");
  fulfilled(slow, "S");
  await h.seed("arrival", "A");
  for (const [key, value] of [["earlier", "E"], ["slow", "S"], ["arrival", "A"]]) {
    const result = h.read(key!);
    await drain();
    fulfilled(result, value!);
  }
  h.counts([["slow", 1], ["earlier", 1], ["later", 1], ["arrival", 1]]);
  const evicted = h.read("later");
  await drain();
  pending(evicted);
  await h.resolve("later", 1, "L2");
  fulfilled(evicted, "L2");
});

// Extends public "a background refresh settling counts as a use of its key".
test("[boundary-4] refresh settlement renews recency after two other keys were used", async () => {
  const h = harness({ maxEntries: 3 });
  await h.seed("refreshing", "R");
  h.at(42010);
  await h.seed("neighbor-one", "N1");
  h.at(42011);
  await h.seed("neighbor-two", "N2");
  h.at(42037);
  const stale = h.read("refreshing");
  await drain();
  fulfilled(stale, "R");
  for (const [key, value] of [["neighbor-one", "N1"], ["neighbor-two", "N2"]]) {
    const result = h.read(key!);
    await drain();
    fulfilled(result, value!);
  }
  h.at(42040);
  await h.resolve("refreshing", 1, "R2");
  await h.seed("incoming", "I");
  for (const [key, value] of [["refreshing", "R2"], ["neighbor-two", "N2"], ["incoming", "I"]]) {
    const result = h.read(key!);
    await drain();
    fulfilled(result, value!);
  }
  h.counts([["refreshing", 2], ["neighbor-one", 1], ["neighbor-two", 1], ["incoming", 1]]);
  const evicted = h.read("neighbor-one");
  await drain();
  pending(evicted);
  await h.resolve("neighbor-one", 1, "N1-new");
  fulfilled(evicted, "N1-new");
});

// Extends public "a background refresh settling counts as a use of its key":
// replacing an existing entry must not consume a second slot.
test("[boundary-4] refreshing a full cache leaves all three distinct entries stored", async () => {
  const h = harness({ maxEntries: 3 });
  await h.seed("first", "F");
  h.at(42010);
  await h.seed("second", "S");
  h.at(42011);
  await h.seed("third", "T");
  h.at(42037);
  const stale = h.read("first");
  await drain();
  fulfilled(stale, "F");
  h.at(42038);
  await h.resolve("first", 1, "F2");
  for (const [key, value] of [["second", "S"], ["third", "T"], ["first", "F2"]]) {
    const result = h.read(key!);
    await drain();
    fulfilled(result, value!);
  }
  h.counts([["first", 2], ["second", 1], ["third", 1]]);
});

// Extends public "a pending load takes no capacity until it settles".
test("[boundary-5] seven pending loads and two failures do not displace three stored values", async () => {
  const h = harness({ maxEntries: 3 });
  const stored = ["stored-zero", "stored-one", "stored-two"];
  for (const key of stored) await h.seed(key, key);
  const keys = Array.from({ length: 7 }, (_, i) => `pending-${i}`);
  const waiting = keys.map((key) => h.read(key));
  await drain();
  waiting.forEach(pending);
  for (const key of stored) {
    const result = h.read(key);
    await drain();
    fulfilled(result, key);
  }
  const error = new Error("not an entry");
  await h.reject("pending-0", 0, error);
  await h.reject("pending-6", 0, error);
  rejected(waiting[0]!, error);
  rejected(waiting[6]!, error);
  for (const key of stored) {
    const result = h.read(key);
    await drain();
    fulfilled(result, key);
  }
  h.counts([...stored, ...keys].map((key) => [key, 1] as const));
  await h.resolve("pending-4", 0, "new entry");
  fulfilled(waiting[4]!, "new entry");
  const evicted = h.read("stored-zero");
  await drain();
  pending(evicted);
  assert.equal(h.count("stored-zero"), 2);
  for (const i of [1, 2, 3, 5]) {
    await h.resolve(`pending-${i}`, 0, `result-${i}`);
    fulfilled(waiting[i]!, `result-${i}`);
  }
  await h.resolve("stored-zero", 1, "reloaded");
  fulfilled(evicted, "reloaded");
});

// Extends public "several pending loads use capacity in settlement order".
test("[boundary-5] four outstanding loads settle out of order around an LRU touch", async () => {
  const h = harness({ maxEntries: 2 });
  await h.seed("alpha", "A");
  await h.seed("beta", "B");
  const keys = ["p", "q", "r", "s"];
  const waiting = keys.map((key) => h.read(key));
  await drain();
  h.counts([...["alpha", "beta"], ...keys].map((key) => [key, 1] as const));
  const original = h.read("alpha");
  await drain();
  fulfilled(original, "A");
  const beta = h.read("beta");
  await drain();
  fulfilled(beta, "B");
  await h.resolve("r", 0, "R");
  fulfilled(waiting[2]!, "R");
  [waiting[0]!, waiting[1]!, waiting[3]!].forEach(pending);
  const touched = h.read("beta");
  await drain();
  fulfilled(touched, "B");
  await h.resolve("p", 0, "P");
  fulfilled(waiting[0]!, "P");
  const retainedBeta = h.read("beta");
  const retainedP = h.read("p");
  await drain();
  fulfilled(retainedBeta, "B");
  fulfilled(retainedP, "P");
  await h.resolve("s", 0, "S");
  await h.resolve("q", 0, "Q");
  fulfilled(waiting[3]!, "S");
  fulfilled(waiting[1]!, "Q");
  for (const key of ["s", "q"]) {
    const result = h.read(key);
    await drain();
    fulfilled(result, key.toUpperCase());
  }
  h.counts([...["alpha", "beta"], ...keys].map((key) => [key, 1] as const));
  const evicted = h.read("p");
  await drain();
  pending(evicted);
  await h.resolve("p", 1, "P2");
  fulfilled(evicted, "P2");
});

// Extends public "a pending load takes no capacity until it settles" and
// "reading a makes b least recently used when c is stored", at the zero-capacity boundary.
test("[boundary-4] a maximum of zero retains no values but still shares in-flight work", async () => {
  const h = harness({ maxEntries: 0 });
  for (let attempt = 0; attempt < 3; attempt++) {
    const waiting = Array.from({ length: 7 }, () => h.read("uncached"));
    await drain();
    waiting.forEach(pending);
    h.counts([["uncached", attempt + 1]]);
    await h.resolve("uncached", attempt, `v${attempt}`);
    waiting.forEach((result) => fulfilled(result, `v${attempt}`));
  }
});

// Extends public "invalidating a fresh entry forces a new load and value".
test("[happy-3] repeated invalidation generations replace falsey and structured values", async () => {
  const h = harness<unknown>();
  const key = "__proto__";
  const values: unknown[] = [false, undefined, 0, { nested: [1, 2, 3] }, null];
  await h.seed(key, values[0]);
  await h.seed("unrelated", { keep: true });
  for (let generation = 1; generation < values.length; generation++) {
    h.cache.invalidate(key);
    const results = Array.from({ length: 6 }, () => h.read(key));
    await drain();
    results.forEach(pending);
    assert.equal(h.count(key), generation + 1);
    const other = h.read("unrelated");
    await drain();
    fulfilled(other, { keep: true });
    assert.equal(h.count("unrelated"), 1);
    await h.resolve(key, generation, values[generation]);
    results.forEach((result) => fulfilled(result, values[generation]));
    const cached = h.read(key);
    await drain();
    fulfilled(cached, values[generation]);
    assert.equal(h.count(key), generation + 1);
  }
});

// Extends public "repeated invalidation of an absent key leaves other entries available".
test("[happy-3] absent-key invalidations preserve cached entries and unrelated pending work", async () => {
  const h = harness({ maxEntries: 3 });
  await h.seed("keep-one", "K1");
  await h.seed("keep-two", "K2");
  await h.seed("removed", "old");
  const waiting = h.read("loading");
  await drain();
  for (let i = 0; i < 5; i++) {
    h.cache.invalidate("removed");
    h.cache.invalidate("never-stored");
  }
  for (const [key, value] of [["keep-one", "K1"], ["keep-two", "K2"]]) {
    const result = h.read(key!);
    await drain();
    fulfilled(result, value!);
  }
  pending(waiting);
  await h.resolve("loading", 0, "L");
  fulfilled(waiting, "L");
  for (const [key, value] of [["keep-one", "K1"], ["keep-two", "K2"], ["loading", "L"]]) {
    const result = h.read(key!);
    await drain();
    fulfilled(result, value!);
  }
  h.counts([["keep-one", 1], ["keep-two", 1], ["removed", 1], ["loading", 1]]);
  const next = h.read("removed");
  await drain();
  pending(next);
  await h.resolve("removed", 1, "new");
  fulfilled(next, "new");
});

// Extends public "invalidating a fresh entry forces a new load and value":
// invalidation also drops stale data instead of returning it during reloading.
test("[happy-3] invalidating a stale entry removes the stale serving path", async () => {
  const h = harness();
  await h.seed("stale-to-drop", "old");
  h.at(42040);
  h.cache.invalidate("stale-to-drop");
  const results = Array.from({ length: 8 }, () => h.read("stale-to-drop"));
  await drain();
  results.forEach(pending);
  h.counts([["stale-to-drop", 2]]);
  await h.resolve("stale-to-drop", 1, "new");
  results.forEach((result) => fulfilled(result, "new"));
});

// Extends public "invalidation discards an in-flight result but resolves both existing waiters".
test("[boundary-6] repeated invalidation preserves twenty waiters and discards only that key", async () => {
  const h = harness();
  const waiting = Array.from({ length: 20 }, () => h.read("discarded"));
  const other = h.read("retained");
  await drain();
  h.counts([["discarded", 1], ["retained", 1]]);
  for (let i = 0; i < 4; i++) h.cache.invalidate("discarded");
  await h.resolve("retained", 0, "keep");
  fulfilled(other, "keep");
  waiting.forEach(pending);
  await h.resolve("discarded", 0, "deliver but drop");
  waiting.forEach((result) => fulfilled(result, "deliver but drop"));
  const kept = h.read("retained");
  const next = h.read("discarded");
  await drain();
  fulfilled(kept, "keep");
  pending(next);
  h.counts([["discarded", 2], ["retained", 1]]);
  await h.resolve("discarded", 1, "new");
  fulfilled(next, "new");
});

// Extends public "invalidation discards an in-flight result but resolves both existing waiters".
test("[boundary-6] invalidated flights never consume space or evict existing entries", async () => {
  const h = harness({ maxEntries: 2 });
  await h.seed("keep-a", "A");
  await h.seed("keep-b", "B");
  const waiting = [h.read("discard"), h.read("discard")];
  await drain();
  h.cache.invalidate("discard");
  await h.resolve("discard", 0, "not stored");
  waiting.forEach((result) => fulfilled(result, "not stored"));
  for (const [key, value] of [["keep-a", "A"], ["keep-b", "B"]]) {
    const result = h.read(key!);
    await drain();
    fulfilled(result, value!);
  }
  h.counts([["keep-a", 1], ["keep-b", 1], ["discard", 1]]);
  const next = h.read("discard");
  await drain();
  pending(next);
  await h.resolve("discard", 1, "now stored");
  fulfilled(next, "now stored");
});

// Extends public "invalidation discards an in-flight result but resolves both existing waiters".
test("[boundary-6] discarding three generations does not permanently disable storage", async () => {
  const h = harness();
  for (let generation = 0; generation < 3; generation++) {
    const waiting = Array.from({ length: 4 }, () => h.read("generation-token"));
    await drain();
    waiting.forEach(pending);
    h.counts([["generation-token", generation + 1]]);
    h.cache.invalidate("generation-token");
    await h.resolve("generation-token", generation, `discard-${generation}`);
    waiting.forEach((result) => fulfilled(result, `discard-${generation}`));
  }
  await h.seed("generation-token", "retain-final");
  const retained = h.read("generation-token");
  await drain();
  fulfilled(retained, "retain-final");
  h.counts([["generation-token", 4]]);
});

// Extends public "invalidation also discards the result of a background refresh".
test("[boundary-6] invalidated refresh delivers to expired waiters without storing its result", async () => {
  const h = harness();
  await h.seed("refresh-to-drop", "stale");
  h.at(42037);
  const stale = h.read("refresh-to-drop");
  await drain();
  fulfilled(stale, "stale");
  h.at(42056);
  const waiting = Array.from({ length: 9 }, () => h.read("refresh-to-drop"));
  await drain();
  waiting.forEach(pending);
  h.counts([["refresh-to-drop", 2]]);
  h.cache.invalidate("refresh-to-drop");
  h.at(50000);
  await h.resolve("refresh-to-drop", 1, "deliver only");
  waiting.forEach((result) => fulfilled(result, "deliver only"));
  fulfilled(stale, "stale");
  const next = h.read("refresh-to-drop");
  await drain();
  pending(next);
  h.counts([["refresh-to-drop", 3]]);
  await h.resolve("refresh-to-drop", 2, "stored now");
  fulfilled(next, "stored now");
  const retained = h.read("refresh-to-drop");
  await drain();
  fulfilled(retained, "stored now");
  h.counts([["refresh-to-drop", 3]]);
});

// Extends public "invalidation also discards the result of a background refresh":
// with zero freshness the replacement must not revive an invalidated stale value.
test("[boundary-6] invalidation suppresses storage of zero-freshness background results", async () => {
  const h = harness<unknown>({ freshForMs: 0, staleForMs: 20 });
  await h.seed("zero-fresh-invalidate", false);
  const stale = Array.from({ length: 5 }, () => h.read("zero-fresh-invalidate"));
  await drain();
  stale.forEach((result) => fulfilled(result, false));
  h.cache.invalidate("zero-fresh-invalidate");
  await h.resolve("zero-fresh-invalidate", 1, undefined);
  const waiting = Array.from({ length: 5 }, () => h.read("zero-fresh-invalidate"));
  await drain();
  waiting.forEach(pending);
  h.counts([["zero-fresh-invalidate", 3]]);
  await h.resolve("zero-fresh-invalidate", 2, null);
  waiting.forEach((result) => fulfilled(result, null));
});

// Extends public "concurrent failures share the loader error and a later get retries"
// and "invalidation discards an in-flight result but resolves both existing waiters".
test("[unhappy-1] invalidation does not replace a pending loader's rejection reason", async () => {
  const h = harness();
  const waiting = Array.from({ length: 10 }, () => h.read("invalidated-failure"));
  await drain();
  h.cache.invalidate("invalidated-failure");
  const error = new Error("the original loader rejected after invalidation");
  await h.reject("invalidated-failure", 0, error);
  waiting.forEach((result) => rejected(result, error));
  await h.seed("invalidated-failure", "retry succeeded");
  const cached = h.read("invalidated-failure");
  await drain();
  fulfilled(cached, "retry succeeded");
  h.counts([["invalidated-failure", 2]]);
});
