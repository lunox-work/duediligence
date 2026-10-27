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

test("[happy-1] three gets before the load settles call the loader once and all resolve with its value", async () => {
  const h = setup();
  h.time.now = 1000;
  const gets = [track(h.cache.get("k")), track(h.cache.get("k")), track(h.cache.get("k"))];
  await flush();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].key, "k");
  for (const got of gets) assert.equal(got.settled, false);

  h.calls[0].resolve("v1");
  await flush();
  assert.equal(h.calls.length, 1);
  for (const got of gets) {
    assert.equal(got.rejected, false);
    assert.equal(got.value, "v1");
  }
});

test("[happy-1] gets made in later turns and at later times while the load is unsettled still share it", async () => {
  const h = setup();
  h.time.now = 1000;
  const first = track(h.cache.get("k"));
  await flush();
  h.time.now = 1500;
  const second = track(h.cache.get("k"));
  await flush();
  h.time.now = 2000;
  const third = track(h.cache.get("k"));
  await flush();
  assert.equal(h.calls.length, 1);

  h.calls[0].resolve("v1");
  await flush();
  assert.equal(h.calls.length, 1);
  assert.equal(first.value, "v1");
  assert.equal(second.value, "v1");
  assert.equal(third.value, "v1");
});

test("[boundary-1] gets for two keys call the loader once per key before either load settles", async () => {
  const h = setup();
  h.time.now = 1000;
  const a = track(h.cache.get("a"));
  const b = track(h.cache.get("b"));
  await flush();
  assert.equal(a.settled, false);
  assert.equal(b.settled, false);
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls.map((call: Call) => call.key).sort(), ["a", "b"]);

  h.calls.find((call: Call) => call.key === "a")!.resolve("A");
  h.calls.find((call: Call) => call.key === "b")!.resolve("B");
  await flush();
  assert.equal(a.value, "A");
  assert.equal(b.value, "B");
  assert.equal(h.calls.length, 2);
});

test("[boundary-1] the second key's load settling first resolves only its own get", async () => {
  const h = setup();
  h.time.now = 1000;
  const a = track(h.cache.get("a"));
  const b = track(h.cache.get("b"));
  await flush();
  assert.equal(h.calls.length, 2);

  h.calls.find((call: Call) => call.key === "b")!.resolve("B");
  await flush();
  assert.equal(b.value, "B");
  assert.equal(a.settled, false);

  h.calls.find((call: Call) => call.key === "a")!.resolve("A");
  await flush();
  assert.equal(a.value, "A");
  assert.equal(h.calls.length, 2);
});

test("[unhappy-1] both waiting gets reject with the loader's error and a later get calls the loader again", async () => {
  const h = setup();
  const error = new Error("load failed");
  h.time.now = 1000;
  const first = track(h.cache.get("k"));
  const second = track(h.cache.get("k"));
  await flush();
  assert.equal(h.calls.length, 1);

  h.calls[0].reject(error);
  await flush();
  assert.equal(first.rejected, true);
  assert.equal(first.error, error);
  assert.equal(second.rejected, true);
  assert.equal(second.error, error);

  h.time.now = 2000;
  const later = track(h.cache.get("k"));
  await flush();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].key, "k");
  h.calls[1].resolve("v2");
  await flush();
  assert.equal(later.value, "v2");
});

test("[unhappy-1] a get at the same instant the load failed calls the loader again, and that success is kept", async () => {
  const h = setup({ freshForMs: 1_000_000 });
  const error = new Error("load failed");
  h.time.now = 1000;
  const first = track(h.cache.get("k"));
  await flush();
  h.calls[0].reject(error);
  await flush();
  assert.equal(first.error, error);

  const retry = track(h.cache.get("k"));
  await flush();
  assert.equal(retry.settled, false);
  assert.equal(h.calls.length, 2);
  h.calls[1].resolve("v2");
  await flush();
  assert.equal(retry.rejected, false);
  assert.equal(retry.value, "v2");

  const after = track(h.cache.get("k"));
  await flush();
  assert.equal(after.value, "v2");
  assert.equal(h.calls.length, 2);
});
