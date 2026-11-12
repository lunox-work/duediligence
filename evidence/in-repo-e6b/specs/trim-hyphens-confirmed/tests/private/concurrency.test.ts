import assert from "node:assert/strict";
import { test } from "node:test";

import { createProfileStore } from "../../src/emails.js";
import { createFakeEmailDb } from "../fake-email-db.js";

function emptyStore() {
  return createProfileStore(createFakeEmailDb().db);
}

const x = (n: number) => "x".repeat(n);
const h = (n: number) => "-".repeat(n);

const cases: ReadonlyArray<readonly [string, string]> = [
  ["-dana-@example.test", "dana"],
  ["a--b@example.test", "a--b"],
  ["---@example.test", "-user"],
  ["_dana_@example.test", "_dana_"],
  ["-jo-@example.test", "jo-user"],
  [" dana@example.test", "dana"],
  ["a-.-b@example.test", "a---b"],
  [`${h(5)}${x(30)}@example.test`, x(30)],
  [`${x(29)}-y@example.test`, `${x(29)}-`],
  ["", "-user"],
  ["a@b@c.test", "a-user"],
  ["+-Rivers-+@example.test", "rivers"],
];

// Extends public "[concurrency-1] overlapping suggest calls each get their own
// result": the same three inputs in other orders.
test("[concurrency-1] overlapping calls in other orders each get their own result", async () => {
  const store = emptyStore();

  assert.deepEqual(
    await Promise.all([
      store.suggest("---@example.test"),
      store.suggest("-dana-@example.test"),
      store.suggest("a--b@example.test"),
    ]),
    ["-user", "dana", "a--b"],
  );
  assert.deepEqual(
    await Promise.all([
      store.suggest("a--b@example.test"),
      store.suggest("---@example.test"),
      store.suggest("-dana-@example.test"),
    ]),
    ["a--b", "-user", "dana"],
  );
});

// Extends public "[concurrency-1] overlapping suggest calls each get their own
// result": many more overlapping calls covering every kind of stem.
test("[concurrency-1] many overlapping calls of different shapes each get their own result", async () => {
  const store = emptyStore();

  const results = await Promise.all(
    cases.map(([email]) => store.suggest(email)),
  );

  assert.deepEqual(
    results,
    cases.map(([, handle]) => handle),
  );
});

// Extends public "[concurrency-1] overlapping calls including a long hyphen
// run each get their own result": the same cases reversed and repeated, with
// long runs at either end interleaved.
test("[concurrency-1] overlapping calls reversed and repeated with long runs each get their own result", async () => {
  const store = emptyStore();
  const all: ReadonlyArray<readonly [string, string]> = [
    [`${h(100000)}dana${h(100000)}@example.test`, "dana"],
    ...[...cases].reverse(),
    [`${h(100000)}@example.test`, "-user"],
    ...cases,
    [`${h(100000)}jo@example.test`, "jo-user"],
  ];

  const results = await Promise.all(all.map(([email]) => store.suggest(email)));

  assert.deepEqual(
    results,
    all.map(([, handle]) => handle),
  );
});

// Extends public concurrency-1: overlapping calls spread over separate stores
// get the same results as on one store.
test("[concurrency-1] overlapping calls across separate stores each get their own result", async () => {
  const stores = [emptyStore(), emptyStore(), emptyStore()];

  const results = await Promise.all(
    cases.map(([email], index) => {
      const store = stores[index % stores.length];
      assert.ok(store !== undefined);
      return store.suggest(email);
    }),
  );

  assert.deepEqual(
    results,
    cases.map(([, handle]) => handle),
  );
});
