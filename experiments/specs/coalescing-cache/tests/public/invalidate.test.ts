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

test("[happy-3] after invalidating a fresh entry, get calls the loader and resolves with the new value", async () => {
  const h = setup();
  await store(h, "k", "v1", 1000);

  h.time.now = 2000;
  h.cache.invalidate("k");
  const got = track(h.cache.get("k"));
  await flush();
  assert.equal(got.settled, false);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].key, "k");

  h.calls[1].resolve("v2");
  await flush();
  assert.equal(got.value, "v2");
});

test("[happy-3] an invalidated stale entry is not served: get waits for the new load", async () => {
  const h = setup({ freshForMs: 5000, staleForMs: 5000 });
  await store(h, "k", "v1", 1000);

  h.time.now = 6000;
  h.cache.invalidate("k");
  const got = track(h.cache.get("k"));
  await flush();
  assert.equal(got.settled, false);
  assert.equal(h.calls.length, 2);

  h.calls[1].resolve("v2");
  await flush();
  assert.equal(got.value, "v2");
});

test("[boundary-6] invalidating during a load: both waiting gets get its value, and the next get loads again", async () => {
  const h = setup();
  h.time.now = 1000;
  const first = track(h.cache.get("k"));
  const second = track(h.cache.get("k"));
  await flush();
  assert.equal(h.calls.length, 1);

  h.cache.invalidate("k");
  h.calls[0].resolve("v1");
  await flush();
  assert.equal(first.value, "v1");
  assert.equal(second.value, "v1");

  const next = track(h.cache.get("k"));
  await flush();
  assert.equal(next.settled, false);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].key, "k");
  h.calls[1].resolve("v2");
  await flush();
  assert.equal(next.value, "v2");
});

test("[boundary-6] invalidating during a background refresh discards both the stale and the refreshed value", async () => {
  const h = setup({ freshForMs: 5000, staleForMs: 5000 });
  await store(h, "k", "v1", 1000);

  h.time.now = 6000;
  const stale = track(h.cache.get("k"));
  await flush();
  assert.equal(stale.value, "v1");
  assert.equal(h.calls.length, 2);

  h.cache.invalidate("k");
  h.calls[1].resolve("v2");
  await flush();

  const next = track(h.cache.get("k"));
  await flush();
  assert.equal(next.settled, false);
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[2].key, "k");
  h.calls[2].resolve("v3");
  await flush();
  assert.equal(next.value, "v3");
});
