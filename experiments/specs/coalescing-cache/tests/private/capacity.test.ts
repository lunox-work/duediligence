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

// Extends "[boundary-4] with a maximum of 2, reading a and then loading c drops b".
test("[boundary-4] with a maximum of 3, each new entry drops the least recently used one, not the first stored", async () => {
  const h = setup({ maxEntries: 3 });
  await store(h, "a", "A", 1000);
  await store(h, "b", "B", 1000);
  await store(h, "c", "C", 1000);

  h.time.now = 1500;
  await served(h, "a", "A");
  await served(h, "b", "B");
  await store(h, "d", "D", 2000);

  h.time.now = 2500;
  await served(h, "a", "A");
  await store(h, "e", "E", 3000);

  h.time.now = 3500;
  await served(h, "a", "A");
  await served(h, "d", "D");
  await served(h, "e", "E");
  await loads(h, "b");
  await loads(h, "c");
});

// Extends "[boundary-4] with a maximum of 2, reading a and then loading c drops b".
test("[boundary-4] a cache at its maximum of 3 keeps all three, and the fourth drops exactly one", async () => {
  const h = setup({ maxEntries: 3 });
  await store(h, "a", "A", 1000);
  await store(h, "b", "B", 1100);
  await store(h, "c", "C", 1200);

  h.time.now = 2000;
  await served(h, "a", "A");
  await served(h, "b", "B");
  await served(h, "c", "C");
  await store(h, "d", "D", 2000);

  h.time.now = 2500;
  await served(h, "b", "B");
  await served(h, "c", "C");
  await served(h, "d", "D");
  await loads(h, "a");
});

// Extends "[boundary-4] with a maximum of 2, reading a and then loading c drops b".
test("[boundary-4] with no reads, the entry stored first is the one dropped", async () => {
  const h = setup({ maxEntries: 2 });
  await store(h, "a", "A", 1000);
  await store(h, "b", "B", 1000);
  await store(h, "c", "C", 1000);

  h.time.now = 1500;
  await served(h, "b", "B");
  await served(h, "c", "C");
  await loads(h, "a");
});

// Extends "[boundary-4] a stale read counts as a use, so the fresher but unread entry is dropped".
test("[boundary-4] a refresh replacing an entry does not drop another entry", async () => {
  const h = setup({ maxEntries: 2, freshForMs: 5000, staleForMs: 5000 });
  await store(h, "a", "A", 1000);
  await store(h, "b", "B", 2000);

  h.time.now = 6000;
  const stale = track(h.cache.get("a"));
  await flush();
  assert.equal(stale.value, "A");
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[2].key, "a");
  h.calls[2].resolve("A2");
  await flush();

  await served(h, "b", "B");
  await served(h, "a", "A2");

  await store(h, "c", "C", 6000);
  await served(h, "a", "A2");
  await served(h, "c", "C");
  await loads(h, "b");
});

// Extends "[boundary-4] with a maximum of 2, reading a and then loading c drops b".
test("[boundary-4] an invalidated entry leaves room, so a new entry drops nothing", async () => {
  const h = setup({ maxEntries: 2 });
  await store(h, "a", "A", 1000);
  await store(h, "b", "B", 1000);

  h.time.now = 1500;
  h.cache.invalidate("a");
  await store(h, "c", "C", 1500);

  await served(h, "b", "B");
  await served(h, "c", "C");
  await loads(h, "a");
});

// Extends "[boundary-5] with a maximum of 1, a stays served while b's load is unsettled and is gone once it settles".
test("[boundary-5] with a maximum of 2, three unsettled loads do not drop the one entry, and one settling leaves room for both", async () => {
  const h = setup({ maxEntries: 2 });
  await store(h, "a", "A", 1000);

  h.time.now = 2000;
  const b = track(h.cache.get("b"));
  const c = track(h.cache.get("c"));
  const d = track(h.cache.get("d"));
  await flush();
  assert.equal(h.calls.length, 4);

  await served(h, "a", "A");

  h.calls.find((call: Call<string>) => call.key === "b")!.resolve("B");
  await flush();
  assert.equal(b.value, "B");
  assert.equal(c.settled, false);
  assert.equal(d.settled, false);

  await served(h, "a", "A");
  await served(h, "b", "B");
});

// Extends "[boundary-5] a is served fresh up to its last fresh millisecond while b loads, and b is served once it settles".
test("[boundary-5] with a maximum of 1, when the later load settles first its entry replaces a", async () => {
  const h = setup({ maxEntries: 1 });
  await store(h, "a", "A", 1000);

  h.time.now = 2000;
  const b = track(h.cache.get("b"));
  const c = track(h.cache.get("c"));
  await flush();
  assert.equal(h.calls.length, 3);

  await served(h, "a", "A");

  h.time.now = 2500;
  h.calls.find((call: Call<string>) => call.key === "c")!.resolve("C");
  await flush();
  assert.equal(c.value, "C");
  assert.equal(b.settled, false);

  await served(h, "c", "C");
  await loads(h, "a");
});
