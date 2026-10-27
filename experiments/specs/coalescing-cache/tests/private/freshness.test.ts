import { test } from "node:test";
import assert from "node:assert/strict";
import { Cache, type CacheOptions } from "../../src/index.js";

interface Call<V> {
  key: string;
  resolve: (value: V) => void;
  reject: (error: unknown) => void;
}

interface Tracked<V> {
  settled: boolean;
  rejected: boolean;
  value?: V;
  error?: unknown;
}

interface Harness<V> {
  cache: Cache<V>;
  calls: Call<V>[];
  time: { now: number };
}

/** A cache over a loader whose promises the test settles by hand, and a clock the test sets. */
function setup<V = string>(options: Partial<CacheOptions<V>> = {}): Harness<V> {
  const time = { now: 0 };
  const calls: Call<V>[] = [];
  const loader = (key: string): Promise<V> =>
    new Promise<V>((resolve, reject) => {
      calls.push({ key, resolve, reject });
    });
  const cache = new Cache<V>({
    loader,
    freshForMs: 5000,
    staleForMs: 5000,
    maxEntries: 10,
    clock: () => time.now,
    ...options,
  });
  return { cache, calls, time };
}

/** Records how a promise settles, so a test can look without awaiting it. */
function track<V>(promise: Promise<V>): Tracked<V> {
  const tracked: Tracked<V> = { settled: false, rejected: false };
  promise.then(
    (value: V) => {
      tracked.settled = true;
      tracked.value = value;
    },
    (error: unknown) => {
      tracked.settled = true;
      tracked.rejected = true;
      tracked.error = error;
    },
  );
  return tracked;
}

/** Lets every pending promise callback run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/** Stores an entry for the key whose load settles at the given time. */
async function store<V>(h: Harness<V>, key: string, value: V, at: number): Promise<void> {
  h.time.now = at;
  const before = h.calls.length;
  const got = track(h.cache.get(key));
  await flush();
  assert.equal(h.calls.length, before + 1);
  assert.equal(h.calls[before].key, key);
  h.calls[before].resolve(value);
  await flush();
  assert.equal(got.settled, true);
  assert.equal(got.rejected, false);
  assert.equal(got.value, value);
}

/** Asserts that a get for the key is served at once with the value, without calling the loader. */
async function served<V>(h: Harness<V>, key: string, value: V): Promise<void> {
  const before = h.calls.length;
  const got = track(h.cache.get(key));
  await flush();
  assert.equal(got.settled, true);
  assert.equal(got.rejected, false);
  assert.equal(got.value, value);
  assert.equal(h.calls.length, before);
}

/** Asserts that a get for the key waits on a new call to the loader for that key. */
async function loads<V>(h: Harness<V>, key: string): Promise<Tracked<V>> {
  const before = h.calls.length;
  const got = track(h.cache.get(key));
  await flush();
  assert.equal(got.settled, false);
  assert.equal(h.calls.length, before + 1);
  assert.equal(h.calls[before].key, key);
  return got;
}

// Extends "[happy-2] a value loaded at 1000 with fresh-for 5000 is served at 5999 without loading".
test("[happy-2] with fresh-for 250, a value loaded at 40000 is served throughout 40000 to 40249 without loading", async () => {
  const h = setup({ freshForMs: 250, staleForMs: 1000 });
  await store(h, "k", "v1", 40_000);

  for (const at of [40_000, 40_001, 40_100, 40_249]) {
    h.time.now = at;
    await served(h, "k", "v1");
  }
  assert.equal(h.calls.length, 1);
});

// Extends "[happy-2] a value loaded at 1000 with fresh-for 5000 is served at 5999 without loading".
test("[happy-2] falsy values are stored and served fresh without loading", async () => {
  const h = setup<unknown>();
  const values: [string, unknown][] = [
    ["zero", 0],
    ["empty", ""],
    ["null", null],
    ["undefined", undefined],
    ["false", false],
  ];
  for (const [key, value] of values) await store(h, key, value, 1000);
  assert.equal(h.calls.length, values.length);

  h.time.now = 5999;
  for (const [key, value] of values) await served(h, key, value);
  assert.equal(h.calls.length, values.length);
});

// Extends "[happy-2] freshness counts from when the load settled, not when it started":
// reads while fresh do not push back the moment the value turns stale.
test("[boundary-2] fresh reads do not extend freshness: the value loaded at 1000 is stale and refreshed at 6000", async () => {
  const h = setup({ freshForMs: 5000, staleForMs: 5000 });
  await store(h, "k", "v1", 1000);

  for (const at of [3000, 5000, 5999]) {
    h.time.now = at;
    await served(h, "k", "v1");
  }

  h.time.now = 6000;
  const stale = track(h.cache.get("k"));
  await flush();
  assert.equal(stale.value, "v1");
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].key, "k");
});

// Extends "[boundary-2] a stale value is served at once, refreshed once in the background, then fresh until 12000".
test("[boundary-2] with fresh-for 100 and stale-for 50, stale gets from 100 to 149 share one refresh, fresh again for 100 after it settles", async () => {
  const h = setup({ freshForMs: 100, staleForMs: 50 });
  await store(h, "k", "v1", 0);

  const stale: Tracked<string>[] = [];
  for (const at of [100, 110, 120, 130, 149]) {
    h.time.now = at;
    stale.push(track(h.cache.get("k")));
    await flush();
  }
  for (const got of stale) assert.equal(got.value, "v1");
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].key, "k");

  h.time.now = 160;
  h.calls[1].resolve("v2");
  await flush();

  for (const at of [160, 259]) {
    h.time.now = at;
    await served(h, "k", "v2");
  }

  h.time.now = 260;
  const again = track(h.cache.get("k"));
  await flush();
  assert.equal(again.value, "v2");
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[2].key, "k");
});

// Extends "[boundary-2] a value refreshed at 7000 is stale at 12000: served at once and refreshed again".
test("[boundary-2] a refresh that settles at 9000 makes the value fresh until 14000, counted from when it settled", async () => {
  const h = setup({ freshForMs: 5000, staleForMs: 5000 });
  await store(h, "k", "v1", 1000);

  h.time.now = 6000;
  const stale = track(h.cache.get("k"));
  await flush();
  assert.equal(stale.value, "v1");
  assert.equal(h.calls.length, 2);

  h.time.now = 9000;
  h.calls[1].resolve("v2");
  await flush();

  for (const at of [9000, 11000, 12000, 13999]) {
    h.time.now = at;
    await served(h, "k", "v2");
  }
  assert.equal(h.calls.length, 2);

  h.time.now = 14000;
  const later = track(h.cache.get("k"));
  await flush();
  assert.equal(later.value, "v2");
  assert.equal(h.calls.length, 3);
});

// Extends "[boundary-2] a stale value is served at once, refreshed once in the background, then fresh until 12000".
test("[boundary-2] two stale keys are each refreshed once and each served its own stale value", async () => {
  const h = setup({ freshForMs: 5000, staleForMs: 5000 });
  await store(h, "a", "A1", 1000);
  await store(h, "b", "B1", 1000);

  h.time.now = 6000;
  const gets = [
    track(h.cache.get("a")),
    track(h.cache.get("b")),
    track(h.cache.get("a")),
    track(h.cache.get("b")),
  ];
  await flush();
  assert.deepEqual(
    gets.map((got: Tracked<string>) => got.value),
    ["A1", "B1", "A1", "B1"],
  );
  assert.equal(h.calls.length, 4);
  assert.deepEqual(
    h.calls.slice(2).map((call: Call<string>) => call.key).sort(),
    ["a", "b"],
  );

  h.time.now = 7000;
  h.calls.find((call: Call<string>, i: number) => i >= 2 && call.key === "a")!.resolve("A2");
  h.calls.find((call: Call<string>, i: number) => i >= 2 && call.key === "b")!.resolve("B2");
  await flush();
  await served(h, "a", "A2");
  await served(h, "b", "B2");
});

// Extends "[boundary-2] a stale value is served at once, refreshed once in the background, then fresh until 12000".
test("[boundary-2] the stale get at the first stale millisecond starts a refresh for its key", async () => {
  const h = setup({ freshForMs: 5000, staleForMs: 5000 });
  await store(h, "k", "v1", 1000);

  h.time.now = 6000;
  const stale = track(h.cache.get("k"));
  await flush();
  assert.equal(stale.value, "v1");
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].key, "k");

  h.time.now = 10999;
  const lastStale = track(h.cache.get("k"));
  await flush();
  assert.equal(lastStale.value, "v1");
  assert.equal(h.calls.length, 2);
});

// Extends "[boundary-3] an expired value is not served: the get at 11000 waits for a new load and gets its value".
test("[boundary-3] a value long expired is not served: the get waits for the new load and the new value is kept", async () => {
  const h = setup({ freshForMs: 5000, staleForMs: 5000 });
  await store(h, "k", "v1", 1000);

  h.time.now = 1_000_000;
  const got = await loads(h, "k");
  h.calls[1].resolve("v2");
  await flush();
  assert.equal(got.value, "v2");

  h.time.now = 1_004_999;
  await served(h, "k", "v2");
});

// Extends "[boundary-3] an expired value is not served: the get at 11000 waits for a new load and gets its value".
test("[boundary-3] with stale-for 0, the value expires the moment it stops being fresh", async () => {
  const h = setup({ freshForMs: 5000, staleForMs: 0 });
  await store(h, "k", "v1", 1000);

  h.time.now = 5999;
  await served(h, "k", "v1");

  h.time.now = 6000;
  const got = await loads(h, "k");
  h.calls[1].resolve("v2");
  await flush();
  assert.equal(got.value, "v2");
});

// Extends "[boundary-3] an expired value is not served: the get at 11000 waits for a new load and gets its value".
test("[boundary-3] with other durations, the value expires at fresh-for plus stale-for after it settled", async () => {
  const h = setup({ freshForMs: 300, staleForMs: 700 });
  await store(h, "k", "v1", 2000);

  h.time.now = 2999;
  const stale = track(h.cache.get("k"));
  await flush();
  assert.equal(stale.value, "v1");
  assert.equal(h.calls.length, 2);
  h.calls[1].reject(new Error("refresh failed"));
  await flush();

  h.time.now = 3000;
  const got = await loads(h, "k");
  h.calls[2].resolve("v2");
  await flush();
  assert.equal(got.value, "v2");
});

// Extends "[boundary-3] a get made while the reload of an expired value is unsettled waits for the new value too".
test("[boundary-3] when the reload of an expired value fails, the get rejects and the old value is still never returned", async () => {
  const h = setup({ freshForMs: 5000, staleForMs: 5000 });
  await store(h, "k", "v1", 1000);

  h.time.now = 11000;
  const got = await loads(h, "k");
  const error = new Error("reload failed");
  h.calls[1].reject(error);
  await flush();
  assert.equal(got.rejected, true);
  assert.equal(got.error, error);

  h.time.now = 11001;
  const next = await loads(h, "k");
  h.calls[2].resolve("v3");
  await flush();
  assert.equal(next.value, "v3");
});

// Extends "[boundary-3] a get made while the reload of an expired value is unsettled waits for the new value too":
// the background refresh is the one load in flight for the key, so the get shares it.
test("[boundary-3] a get after expiry while the background refresh is unsettled waits for that refresh, not the old value", async () => {
  const h = setup({ freshForMs: 5000, staleForMs: 5000 });
  await store(h, "k", "v1", 1000);

  h.time.now = 6000;
  const stale = track(h.cache.get("k"));
  await flush();
  assert.equal(stale.value, "v1");
  assert.equal(h.calls.length, 2);

  h.time.now = 11000;
  const expired = track(h.cache.get("k"));
  await flush();
  assert.equal(expired.settled, false);
  assert.equal(h.calls.length, 2);

  h.calls[1].resolve("v2");
  await flush();
  assert.equal(expired.value, "v2");
});

// Extends "[unhappy-2] a failed refresh calls the error handler and keeps the stale value, and the next stale get refreshes again".
test("[unhappy-2] a failed refresh does not renew the value: it still expires at 11000", async () => {
  const errors: [unknown, string][] = [];
  const h = setup({
    freshForMs: 5000,
    staleForMs: 5000,
    onError: (error: unknown, key: string) => {
      errors.push([error, key]);
    },
  });
  await store(h, "k", "v1", 1000);

  h.time.now = 6000;
  track(h.cache.get("k"));
  await flush();
  assert.equal(h.calls.length, 2);
  h.time.now = 6100;
  h.calls[1].reject(new Error("refresh failed"));
  await flush();
  assert.equal(errors.length, 1);

  h.time.now = 11000;
  const got = await loads(h, "k");
  h.calls[2].resolve("v3");
  await flush();
  assert.equal(got.value, "v3");
});

// Extends "[unhappy-2] a failed refresh calls the error handler and keeps the stale value, and the next stale get refreshes again".
test("[unhappy-2] each failed refresh calls the error handler with its own error and key, and a later refresh that succeeds is kept", async () => {
  const errors: [unknown, string][] = [];
  const h = setup({
    freshForMs: 5000,
    staleForMs: 5000,
    onError: (error: unknown, key: string) => {
      errors.push([error, key]);
    },
  });
  await store(h, "x", "X1", 1000);
  await store(h, "y", "Y1", 1000);

  h.time.now = 6000;
  const x1 = track(h.cache.get("x"));
  const y1 = track(h.cache.get("y"));
  await flush();
  assert.equal(x1.value, "X1");
  assert.equal(y1.value, "Y1");
  assert.equal(h.calls.length, 4);

  const yError = { reason: "y down" };
  const xError = new Error("x down");
  h.calls.find((call: Call<string>, i: number) => i >= 2 && call.key === "y")!.reject(yError);
  await flush();
  h.calls.find((call: Call<string>, i: number) => i >= 2 && call.key === "x")!.reject(xError);
  await flush();
  assert.equal(errors.length, 2);
  assert.equal(errors[0][0], yError);
  assert.equal(errors[0][1], "y");
  assert.equal(errors[1][0], xError);
  assert.equal(errors[1][1], "x");

  h.time.now = 8000;
  const x2 = track(h.cache.get("x"));
  await flush();
  assert.equal(x2.value, "X1");
  assert.equal(h.calls.length, 5);
  assert.equal(h.calls[4].key, "x");
  const xAgain = new Error("x down again");
  h.calls[4].reject(xAgain);
  await flush();
  assert.equal(errors.length, 3);
  assert.equal(errors[2][0], xAgain);
  assert.equal(errors[2][1], "x");

  h.time.now = 9000;
  const x3 = track(h.cache.get("x"));
  await flush();
  assert.equal(x3.value, "X1");
  assert.equal(h.calls.length, 6);
  h.calls[5].resolve("X2");
  await flush();
  assert.equal(errors.length, 3);

  for (const at of [9000, 13999]) {
    h.time.now = at;
    await served(h, "x", "X2");
  }
});

// Extends "[unhappy-2] without an error handler a failed refresh keeps the value stale until its last millisecond".
test("[unhappy-2] without an error handler, gets made while a refresh is failing all resolve with the stale value", async () => {
  const h = setup({ freshForMs: 5000, staleForMs: 5000 });
  await store(h, "k", "v1", 1000);

  h.time.now = 6000;
  const first = track(h.cache.get("k"));
  await flush();
  h.time.now = 6500;
  const during = track(h.cache.get("k"));
  await flush();
  assert.equal(first.value, "v1");
  assert.equal(during.value, "v1");
  assert.equal(h.calls.length, 2);

  h.calls[1].reject(new Error("refresh failed"));
  await flush();

  for (const at of [7000, 8000]) {
    h.time.now = at;
    const got = track(h.cache.get("k"));
    await flush();
    assert.equal(got.value, "v1");
    const last = h.calls.length - 1;
    assert.equal(h.calls[last].key, "k");
    h.calls[last].reject(new Error(`refresh at ${at} failed`));
    await flush();
  }
  assert.equal(h.calls.length, 4);
});
