import { test } from "node:test";
import assert from "node:assert/strict";
import { Cache, type CacheOptions } from "../../src/index.js";

interface Call {
  key: string;
  resolve: (value: string) => void;
  reject: (error: unknown) => void;
}

interface Tracked {
  settled: boolean;
  rejected: boolean;
  value?: string;
  error?: unknown;
}

/** A cache over a loader whose promises the test settles by hand, and a clock the test sets. */
function setup(options: Partial<CacheOptions<string>> = {}) {
  const time = { now: 0 };
  const calls: Call[] = [];
  const loader = (key: string): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      calls.push({ key, resolve, reject });
    });
  const cache = new Cache<string>({
    loader,
    freshForMs: 5000,
    staleForMs: 5000,
    maxEntries: 10,
    clock: () => time.now,
    ...options,
  });
  return { cache, calls, time };
}

type Harness = ReturnType<typeof setup>;

/** Records how a promise settles, so a test can look without awaiting it. */
function track(promise: Promise<string>): Tracked {
  const tracked: Tracked = { settled: false, rejected: false };
  promise.then(
    (value: string) => {
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
async function store(h: Harness, key: string, value: string, at: number): Promise<void> {
  h.time.now = at;
  const before = h.calls.length;
  const got = track(h.cache.get(key));
  await flush();
  assert.equal(h.calls.length, before + 1);
  assert.equal(h.calls[before].key, key);
  h.calls[before].resolve(value);
  await flush();
  assert.equal(got.value, value);
}

test("[happy-2] a value loaded at 1000 with fresh-for 5000 is served at 5999 without loading", async () => {
  const h = setup({ freshForMs: 5000 });
  await store(h, "k", "v1", 1000);

  h.time.now = 5999;
  const got = track(h.cache.get("k"));
  await flush();
  assert.equal(got.value, "v1");
  assert.equal(h.calls.length, 1);
});

test("[happy-2] freshness counts from when the load settled, not when it started", async () => {
  const h = setup({ freshForMs: 5000 });
  h.time.now = 0;
  const first = track(h.cache.get("k"));
  await flush();
  assert.equal(h.calls.length, 1);
  h.time.now = 1000;
  h.calls[0].resolve("v1");
  await flush();
  assert.equal(first.value, "v1");

  h.time.now = 5999;
  const got = track(h.cache.get("k"));
  await flush();
  assert.equal(got.value, "v1");
  assert.equal(h.calls.length, 1);
});

test("[boundary-2] a stale value is served at once, refreshed once in the background, then fresh until 12000", async () => {
  const h = setup({ freshForMs: 5000, staleForMs: 5000 });
  await store(h, "k", "v1", 1000);

  h.time.now = 6000;
  const stale = track(h.cache.get("k"));
  await flush();
  assert.equal(stale.value, "v1");
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].key, "k");

  h.time.now = 6500;
  const during = track(h.cache.get("k"));
  await flush();
  assert.equal(during.value, "v1");
  assert.equal(h.calls.length, 2);

  h.time.now = 7000;
  h.calls[1].resolve("v2");
  await flush();

  const refreshed = track(h.cache.get("k"));
  await flush();
  assert.equal(refreshed.value, "v2");
  h.time.now = 11999;
  const lastFresh = track(h.cache.get("k"));
  await flush();
  assert.equal(lastFresh.value, "v2");
  assert.equal(h.calls.length, 2);
});

test("[boundary-2] a value refreshed at 7000 is stale at 12000: served at once and refreshed again", async () => {
  const h = setup({ freshForMs: 5000, staleForMs: 5000 });
  await store(h, "k", "v1", 1000);
  h.time.now = 6000;
  track(h.cache.get("k"));
  await flush();
  assert.equal(h.calls.length, 2);
  h.time.now = 7000;
  h.calls[1].resolve("v2");
  await flush();

  h.time.now = 12000;
  const got = track(h.cache.get("k"));
  await flush();
  assert.equal(got.value, "v2");
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[2].key, "k");
});

test("[boundary-3] an expired value is not served: the get at 11000 waits for a new load and gets its value", async () => {
  const h = setup({ freshForMs: 5000, staleForMs: 5000 });
  await store(h, "k", "v1", 1000);

  h.time.now = 11000;
  const got = track(h.cache.get("k"));
  await flush();
  assert.equal(got.settled, false);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].key, "k");

  h.calls[1].resolve("v2");
  await flush();
  assert.equal(got.value, "v2");

  const after = track(h.cache.get("k"));
  await flush();
  assert.equal(after.value, "v2");
  assert.equal(h.calls.length, 2);
});

test("[boundary-3] a get made while the reload of an expired value is unsettled waits for the new value too", async () => {
  const h = setup({ freshForMs: 5000, staleForMs: 5000 });
  await store(h, "k", "v1", 1000);

  h.time.now = 11000;
  const first = track(h.cache.get("k"));
  await flush();
  h.time.now = 11500;
  const second = track(h.cache.get("k"));
  await flush();
  assert.equal(first.settled, false);
  assert.equal(second.settled, false);
  assert.equal(h.calls.length, 2);

  h.calls[1].resolve("v2");
  await flush();
  assert.equal(first.value, "v2");
  assert.equal(second.value, "v2");
});

test("[unhappy-2] a failed refresh calls the error handler and keeps the stale value, and the next stale get refreshes again", async () => {
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
  const stale = track(h.cache.get("k"));
  await flush();
  assert.equal(stale.value, "v1");
  assert.equal(h.calls.length, 2);

  const error = new Error("refresh failed");
  h.time.now = 6100;
  h.calls[1].reject(error);
  await flush();
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], error);
  assert.equal(errors[0][1], "k");

  h.time.now = 7000;
  const later = track(h.cache.get("k"));
  await flush();
  assert.equal(later.value, "v1");
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[2].key, "k");
});

test("[unhappy-2] without an error handler a failed refresh keeps the value stale until its last millisecond", async () => {
  const h = setup({ freshForMs: 5000, staleForMs: 5000 });
  await store(h, "k", "v1", 1000);

  h.time.now = 6000;
  const stale = track(h.cache.get("k"));
  await flush();
  assert.equal(stale.value, "v1");
  assert.equal(h.calls.length, 2);
  h.calls[1].reject(new Error("refresh failed"));
  await flush();

  h.time.now = 10999;
  const later = track(h.cache.get("k"));
  await flush();
  assert.equal(later.value, "v1");
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[2].key, "k");
});
