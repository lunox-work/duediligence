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

// Extends "[happy-3] after invalidating a fresh entry, get calls the loader and resolves with the new value".
test("[happy-3] invalidating one key reloads only that key, and each reloaded value is kept", async () => {
  const h = setup();
  await store(h, "k", "v0", 1000);
  await store(h, "other", "O", 1000);

  for (let round = 1; round <= 3; round++) {
    h.time.now = 1000 + round * 100;
    h.cache.invalidate("k");
    await served(h, "other", "O");
    const got = await loads(h, "k");
    h.calls[h.calls.length - 1].resolve(`v${round}`);
    await flush();
    assert.equal(got.value, `v${round}`);
    await served(h, "k", `v${round}`);
  }
  assert.equal(h.calls.length, 5);
});

// Extends "[happy-3] an invalidated stale entry is not served: get waits for the new load".
test("[happy-3] invalidating twice and getting from several callers makes one load whose value all receive", async () => {
  const h = setup();
  await store(h, "k", "v1", 1000);

  h.time.now = 1000;
  h.cache.invalidate("k");
  h.cache.invalidate("k");
  const gets = [track(h.cache.get("k")), track(h.cache.get("k")), track(h.cache.get("k"))];
  await flush();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].key, "k");
  for (const got of gets) assert.equal(got.settled, false);

  h.calls[1].resolve("v2");
  await flush();
  for (const got of gets) assert.equal(got.value, "v2");
  await served(h, "k", "v2");
});

// Extends "[boundary-6] invalidating during a load: both waiting gets get its value, and the next get loads again".
test("[boundary-6] after a discarded load, the next load for the key is stored as usual", async () => {
  const h = setup();
  h.time.now = 1000;
  const waiting = [track(h.cache.get("k")), track(h.cache.get("k")), track(h.cache.get("k"))];
  await flush();
  assert.equal(h.calls.length, 1);

  h.cache.invalidate("k");
  h.calls[0].resolve("v1");
  await flush();
  for (const got of waiting) assert.equal(got.value, "v1");

  const next = await loads(h, "k");
  const shared = track(h.cache.get("k"));
  await flush();
  assert.equal(h.calls.length, 2);
  h.time.now = 1200;
  h.calls[1].resolve("v2");
  await flush();
  assert.equal(next.value, "v2");
  assert.equal(shared.value, "v2");

  h.time.now = 6199;
  await served(h, "k", "v2");
});

// Extends "[boundary-6] invalidating during a load: both waiting gets get its value, and the next get loads again".
test("[boundary-6] invalidating one key during its load does not discard another key's load", async () => {
  const h = setup();
  h.time.now = 1000;
  const k = track(h.cache.get("k"));
  const j = track(h.cache.get("j"));
  await flush();
  assert.equal(h.calls.length, 2);

  h.cache.invalidate("k");
  h.calls.find((call: Call<string>) => call.key === "j")!.resolve("J");
  h.calls.find((call: Call<string>) => call.key === "k")!.resolve("K");
  await flush();
  assert.equal(k.value, "K");
  assert.equal(j.value, "J");

  await served(h, "j", "J");
  await loads(h, "k");
});

// Extends "[boundary-6] invalidating during a background refresh discards both the stale and the refreshed value".
test("[boundary-6] with a maximum of 1, a discarded load does not drop the entry already held", async () => {
  const h = setup({ maxEntries: 1 });
  await store(h, "a", "A", 1000);

  h.time.now = 2000;
  const b = await loads(h, "b");
  h.cache.invalidate("b");
  h.calls[1].resolve("B");
  await flush();
  assert.equal(b.value, "B");

  await served(h, "a", "A");
  await loads(h, "b");
});

// Extends "[boundary-6] invalidating during a load: both waiting gets get its value, and the next get loads again".
test("[unhappy-1] a load invalidated while in flight that rejects rejects both waiting gets with its error", async () => {
  const h = setup();
  h.time.now = 1000;
  const first = track(h.cache.get("k"));
  const second = track(h.cache.get("k"));
  await flush();
  assert.equal(h.calls.length, 1);

  h.cache.invalidate("k");
  const error = new Error("load failed");
  h.calls[0].reject(error);
  await flush();
  assert.equal(first.rejected, true);
  assert.equal(first.error, error);
  assert.equal(second.rejected, true);
  assert.equal(second.error, error);

  const next = await loads(h, "k");
  h.calls[1].resolve("v2");
  await flush();
  assert.equal(next.value, "v2");
});
