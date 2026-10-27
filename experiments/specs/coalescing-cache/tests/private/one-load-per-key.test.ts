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

// Extends "[happy-1] three gets before the load settles call the loader once and all resolve with its value".
test("[happy-1] fifty gets before the load settles call the loader once with the key and all resolve with the same value", async () => {
  const h = setup<{ id: number }>();
  h.time.now = 1000;
  const gets: Tracked<{ id: number }>[] = [];
  for (let i = 0; i < 50; i++) gets.push(track(h.cache.get("k")));
  await flush();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].key, "k");
  for (const got of gets) assert.equal(got.settled, false);

  const value = { id: 7 };
  h.calls[0].resolve(value);
  await flush();
  assert.equal(h.calls.length, 1);
  for (const got of gets) {
    assert.equal(got.rejected, false);
    assert.equal(got.value, value);
  }
});

// Extends "[happy-1] gets made in later turns and at later times while the load is unsettled still share it".
test("[happy-1] another key's load settling does not end the sharing of a load still in flight", async () => {
  const h = setup();
  h.time.now = 1000;
  const first = track(h.cache.get("k"));
  const other = track(h.cache.get("j"));
  await flush();
  assert.equal(h.calls.length, 2);

  h.calls.find((call: Call<string>) => call.key === "j")!.resolve("J");
  await flush();
  assert.equal(other.value, "J");

  const second = track(h.cache.get("k"));
  const third = track(h.cache.get("k"));
  await flush();
  assert.equal(h.calls.length, 2);
  assert.equal(second.settled, false);

  h.calls.find((call: Call<string>) => call.key === "k")!.resolve("K");
  await flush();
  assert.equal(first.value, "K");
  assert.equal(second.value, "K");
  assert.equal(third.value, "K");
  assert.equal(h.calls.length, 2);
});

// Extends "[happy-1] gets made in later turns and at later times while the load is unsettled still share it".
test("[happy-1] a get long past fresh-for plus stale-for still shares the unsettled load", async () => {
  const h = setup({ freshForMs: 100, staleForMs: 100 });
  h.time.now = 1000;
  const first = track(h.cache.get("k"));
  await flush();
  h.time.now = 50_000;
  const second = track(h.cache.get("k"));
  await flush();
  assert.equal(h.calls.length, 1);
  assert.equal(second.settled, false);

  h.calls[0].resolve("v1");
  await flush();
  assert.equal(first.value, "v1");
  assert.equal(second.value, "v1");
  assert.equal(h.calls.length, 1);
});

// Extends "[boundary-1] gets for two keys call the loader once per key before either load settles".
test("[boundary-1] twelve keys each get their own load before any settles, and each get resolves with its own key's value", async () => {
  const h = setup({ maxEntries: 20 });
  h.time.now = 1000;
  const keys = Array.from({ length: 12 }, (_: unknown, i: number) => `key-${i}`);
  const gets = keys.map((key: string) => track(h.cache.get(key)));
  await flush();
  assert.equal(h.calls.length, 12);
  assert.deepEqual(
    h.calls.map((call: Call<string>) => call.key).sort(),
    [...keys].sort(),
  );
  for (const got of gets) assert.equal(got.settled, false);

  for (const call of [...h.calls].reverse()) call.resolve(`value of ${call.key}`);
  await flush();
  keys.forEach((key: string, i: number) => {
    assert.equal(gets[i].value, `value of ${key}`);
  });
  assert.equal(h.calls.length, 12);
});

// Extends "[boundary-1] gets for two keys call the loader once per key before either load settles".
test("[boundary-1] keys named like object properties load separately and are kept separately", async () => {
  const h = setup();
  h.time.now = 1000;
  const keys = ["__proto__", "constructor", "toString", "hasOwnProperty"];
  const gets = keys.map((key: string) => track(h.cache.get(key)));
  await flush();
  assert.equal(h.calls.length, keys.length);
  assert.deepEqual(
    h.calls.map((call: Call<string>) => call.key).sort(),
    [...keys].sort(),
  );
  for (const call of h.calls) call.resolve(`v:${call.key}`);
  await flush();
  keys.forEach((key: string, i: number) => {
    assert.equal(gets[i].value, `v:${key}`);
  });

  h.time.now = 2000;
  for (const key of keys) await served(h, key, `v:${key}`);
});

// Extends "[boundary-1] the second key's load settling first resolves only its own get".
test("[boundary-1] one key's load rejecting does not reject the other key's get", async () => {
  const h = setup();
  h.time.now = 1000;
  const a = track(h.cache.get("a"));
  const b = track(h.cache.get("b"));
  await flush();
  assert.equal(h.calls.length, 2);

  const error = new Error("a failed");
  h.calls.find((call: Call<string>) => call.key === "a")!.reject(error);
  await flush();
  assert.equal(a.rejected, true);
  assert.equal(a.error, error);
  assert.equal(b.settled, false);

  h.calls.find((call: Call<string>) => call.key === "b")!.resolve("B");
  await flush();
  assert.equal(b.rejected, false);
  assert.equal(b.value, "B");
});

// Extends "[unhappy-1] both waiting gets reject with the loader's error and a later get calls the loader again".
test("[unhappy-1] three waiting gets reject with a non-Error reason as given, and each later failure is its own", async () => {
  const h = setup();
  h.time.now = 1000;
  const gets = [track(h.cache.get("k")), track(h.cache.get("k")), track(h.cache.get("k"))];
  await flush();
  assert.equal(h.calls.length, 1);

  const reason = { code: 42 };
  h.calls[0].reject(reason);
  await flush();
  for (const got of gets) {
    assert.equal(got.rejected, true);
    assert.equal(got.error, reason);
  }

  const again = [track(h.cache.get("k")), track(h.cache.get("k"))];
  await flush();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].key, "k");
  for (const got of again) assert.equal(got.settled, false);

  const second = new Error("second failure");
  h.calls[1].reject(second);
  await flush();
  for (const got of again) {
    assert.equal(got.rejected, true);
    assert.equal(got.error, second);
  }

  const last = await loads(h, "k");
  h.calls[2].resolve("v3");
  await flush();
  assert.equal(last.value, "v3");
  await served(h, "k", "v3");
});

// Extends "[unhappy-1] a get at the same instant the load failed calls the loader again, and that success is kept".
test("[unhappy-1] a failed load for another key neither stores anything nor drops a fresh entry", async () => {
  const h = setup({ maxEntries: 1 });
  await store(h, "a", "A", 1000);

  h.time.now = 2000;
  const b = await loads(h, "b");
  const error = new Error("b failed");
  h.calls[1].reject(error);
  await flush();
  assert.equal(b.error, error);

  await served(h, "a", "A");
  await loads(h, "b");
});
