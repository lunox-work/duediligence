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

test("[boundary-4] with a maximum of 2, reading a and then loading c drops b", async () => {
  const h = setup({ maxEntries: 2 });
  await store(h, "a", "A", 1000);
  await store(h, "b", "B", 1000);

  h.time.now = 2000;
  const readA = track(h.cache.get("a"));
  await flush();
  assert.equal(readA.value, "A");
  assert.equal(h.calls.length, 2);
  await store(h, "c", "C", 2000);

  const a = track(h.cache.get("a"));
  const c = track(h.cache.get("c"));
  await flush();
  assert.equal(a.value, "A");
  assert.equal(c.value, "C");
  assert.equal(h.calls.length, 3);

  const b = track(h.cache.get("b"));
  await flush();
  assert.equal(b.settled, false);
  assert.equal(h.calls.length, 4);
  assert.equal(h.calls[3].key, "b");
});

test("[boundary-4] a stale read counts as a use, so the fresher but unread entry is dropped", async () => {
  const h = setup({ maxEntries: 2, freshForMs: 5000, staleForMs: 5000 });
  await store(h, "a", "A", 1000);
  await store(h, "b", "B", 2000);

  h.time.now = 6500;
  const staleA = track(h.cache.get("a"));
  await flush();
  assert.equal(staleA.value, "A");
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[2].key, "a");
  await store(h, "c", "C", 6500);

  const c = track(h.cache.get("c"));
  const a = track(h.cache.get("a"));
  await flush();
  assert.equal(c.value, "C");
  assert.equal(a.value, "A");
  assert.equal(h.calls.length, 4);

  const b = track(h.cache.get("b"));
  await flush();
  assert.equal(b.settled, false);
  assert.equal(h.calls.length, 5);
  assert.equal(h.calls[4].key, "b");
});

test("[boundary-5] with a maximum of 1, a stays served while b's load is unsettled and is gone once it settles", async () => {
  const h = setup({ maxEntries: 1 });
  await store(h, "a", "A", 1000);

  h.time.now = 2000;
  const b = track(h.cache.get("b"));
  await flush();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].key, "b");

  const a = track(h.cache.get("a"));
  await flush();
  assert.equal(a.value, "A");
  assert.equal(h.calls.length, 2);

  h.calls[1].resolve("B");
  await flush();
  assert.equal(b.value, "B");

  const after = track(h.cache.get("a"));
  await flush();
  assert.equal(after.settled, false);
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[2].key, "a");
});

test("[boundary-5] a is served fresh up to its last fresh millisecond while b loads, and b is served once it settles", async () => {
  const h = setup({ maxEntries: 1, freshForMs: 5000 });
  await store(h, "a", "A", 1000);

  h.time.now = 2000;
  track(h.cache.get("b"));
  await flush();
  assert.equal(h.calls.length, 2);

  for (const at of [3000, 5999]) {
    h.time.now = at;
    const a = track(h.cache.get("a"));
    await flush();
    assert.equal(a.value, "A");
    assert.equal(h.calls.length, 2);
  }

  h.calls[1].resolve("B");
  await flush();
  const b = track(h.cache.get("b"));
  await flush();
  assert.equal(b.value, "B");
  assert.equal(h.calls.length, 2);

  const a = track(h.cache.get("a"));
  await flush();
  assert.equal(a.settled, false);
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[2].key, "a");
});
