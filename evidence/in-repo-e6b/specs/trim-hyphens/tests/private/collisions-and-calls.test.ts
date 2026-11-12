import assert from "node:assert/strict";
import { test } from "node:test";

import { createProfileStore, type UserProfileStore } from "../../src/emails.js";
import { createFakeEmailDb, type UserRowLite } from "../fake-email-db.js";

function user(over: Partial<UserRowLite> = {}): UserRowLite {
  return {
    id: "user_1",
    email: "first@example.test",
    updatedAt: new Date("2026-09-16T00:00:00.000Z"),
    username: null,
    ...over,
  };
}

/** A profile store over a fake seeded with the given users, none by default. */
function profileStore(users: UserRowLite[] = []): UserProfileStore {
  return createProfileStore(createFakeEmailDb({ users }).db);
}

/** Users holding each of the given usernames. */
function holding(usernames: string[]): UserRowLite[] {
  return usernames.map((username, index) =>
    user({ id: `user_${index + 2}`, username }),
  );
}

/** The stem and every counter candidate, `stem2` through `stem20`. */
function allCounters(stem: string): string[] {
  return [stem, ...Array.from({ length: 19 }, (_, i) => `${stem}${i + 2}`)];
}

const LONG = 100_000;

// ---- [happy-3] The counter is appended to the trimmed stem -----------------

test("[happy-3] the scenario: user_2 holding dana makes --dana-- resolve to dana2", async () => {
  const store = profileStore([user({ id: "user_2", username: "dana" })]);
  assert.equal(await store.suggest("--dana--@example.test"), "dana2");
});

// Extends "repeated collisions on the trimmed stem keep counting": counting
// all the way to the last counter.
test("[happy-3] collisions through dana19 on the trimmed stem resolve to dana20", async () => {
  const store = profileStore(holding(allCounters("dana").slice(0, 19)));
  assert.equal(await store.suggest("---dana---@example.test"), "dana20");
});

// Extends "a collision on the trimmed stem appends 2": the counter goes on
// the padded stem, the empty stem's "-user", and a stem trimmed from long runs.
test("[happy-3] the counter is appended to a padded or -user stem after trimming", async () => {
  assert.equal(
    await profileStore(holding(["jo-user"])).suggest("-jo-@example.test"),
    "jo-user2",
  );
  assert.equal(
    await profileStore(holding(["-user"])).suggest("---@example.test"),
    "-user2",
  );
  assert.equal(
    await profileStore(holding(["-user", "-user2"])).suggest(
      `${"-".repeat(LONG)}@example.test`,
    ),
    "-user3",
  );
});

test("[happy-3] the counter is appended to a stem trimmed from 100000-hyphen runs", async () => {
  const store = profileStore(holding(["dana"]));
  assert.equal(
    await store.suggest(`${"-".repeat(LONG)}dana${"-".repeat(LONG)}@example.test`),
    "dana2",
  );
});

// A 29-character trimmed stem has room for one counter digit.
test("[happy-3] a 29-character trimmed stem gets the counter within the limit", async () => {
  const stem = "x".repeat(29);
  const store = profileStore(holding([stem]));
  assert.equal(await store.suggest(`---${stem}---@example.test`), `${stem}2`);
});

// Only the exact trimmed stem collides; an untrimmed handle does not.
test("[happy-3] a user holding the untrimmed handle does not collide with the trimmed stem", async () => {
  const store = profileStore(holding(["-dana-", "dana-"]));
  assert.equal(await store.suggest("-dana-@example.test"), "dana");
});

// ---- [happy-4] The random fallback uses the trimmed stem -------------------

test("[happy-4] the scenario: dana through dana20 taken makes -dana- fall back to dana and six hex digits", async () => {
  const store = profileStore(holding(allCounters("dana")));
  assert.match(await store.suggest("-dana-@example.test"), /^dana-[0-9a-f]{6}$/);
});

// Extends "after 20 collisions the fallback suffixes the trimmed stem": the
// padded stem and the "-user" stem, and long edge runs.
test("[happy-4] the fallback suffixes a padded or -user stem after trimming", async () => {
  assert.match(
    await profileStore(holding(allCounters("jo-user"))).suggest(
      "--jo--@example.test",
    ),
    /^jo-user-[0-9a-f]{6}$/,
  );
  assert.match(
    await profileStore(holding(allCounters("-user"))).suggest(
      `${"-".repeat(LONG)}@example.test`,
    ),
    /^-user-[0-9a-f]{6}$/,
  );
});

test("[happy-4] the fallback suffixes a stem trimmed from 100000-hyphen runs", async () => {
  const store = profileStore(holding(allCounters("dana")));
  assert.match(
    await store.suggest(`${"-".repeat(LONG)}dana${"-".repeat(LONG)}@example.test`),
    /^dana-[0-9a-f]{6}$/,
  );
});

// Extends "the fallback for a trimmed stem at the maximum length cuts it to
// 23 characters": distinct characters show the first 23 after the trim are
// kept, and a stem with a trailing hyphen at the cut keeps it.
test("[happy-4] the fallback for a long trimmed stem keeps its first 23 characters", async () => {
  const alnum = "abcdefghijklmnopqrstuvwxyz0123456789";
  const stem = alnum.slice(0, 30);
  const store = profileStore(holding([stem]));
  const suggested = await store.suggest(`-----${alnum}-----@example.test`);
  assert.match(suggested, /^abcdefghijklmnopqrstuvw-[0-9a-f]{6}$/);
  assert.equal(suggested.length, 30);
});

// ---- [concurrency-1] Overlapping suggest calls -----------------------------

test("[concurrency-1] the scenario: three parallel calls resolve to dana, a--b and -user in order", async () => {
  const store = profileStore();
  const results = await Promise.all([
    store.suggest("-dana-@example.test"),
    store.suggest("a--b@example.test"),
    store.suggest("---@example.test"),
  ]);
  assert.deepEqual(results, ["dana", "a--b", "-user"]);
});

// Extends "parallel calls each resolve to their own handle, in order": the
// same inputs in reverse order, plus more items of different shapes.
test("[concurrency-1] many parallel calls in another order each resolve to their own handle", async () => {
  const store = profileStore();
  const cases: Array<[string, string]> = [
    ["---@example.test", "-user"],
    ["a--b@example.test", "a--b"],
    ["-dana-@example.test", "dana"],
    ["_dana_@example.test", "_dana_"],
    ["jo-@example.test", "jo-user"],
    [`${"x".repeat(29)}-y@example.test`, `${"x".repeat(29)}-`],
    ["dana@example.test", "dana"],
    [".a-.-b.@example.test", "a---b"],
  ];
  const results = await Promise.all(cases.map(([email]) => store.suggest(email)));
  assert.deepEqual(
    results,
    cases.map(([, handle]) => handle),
  );
});

// Extends "a long-run input in parallel does not affect a short one":
// separate stores in parallel, with long runs on both sides.
test("[concurrency-1] parallel calls on separate stores with long runs each get their own result", async () => {
  const dashes = "-".repeat(LONG);
  const results = await Promise.all([
    profileStore().suggest(`${dashes}dana${dashes}@example.test`),
    profileStore().suggest("a--b@example.test"),
    profileStore().suggest(`${dashes}@example.test`),
    profileStore().suggest(`-anad-@example.test`),
  ]);
  assert.deepEqual(results, ["dana", "a--b", "-user", "anad"]);
});

// ---- [boundary-10] Repeating a call gives the same result ------------------

test("[boundary-10] the scenario: -dana- three times in a row resolves to dana each time", async () => {
  const store = profileStore();
  const results: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    results.push(await store.suggest("-dana-@example.test"));
  }
  assert.deepEqual(results, ["dana", "dana", "dana"]);
});

// Extends "the same call three times in a row resolves to dana each time":
// more repeats, and repeats of inputs whose trim ends at different offsets,
// so a regex or index carried between calls would shift the result.
test("[boundary-10] repeating calls of varied shapes gives the same result every time", async () => {
  const store = profileStore();
  const cases: Array<[string, string]> = [
    ["-dana-@example.test", "dana"],
    ["---@example.test", "-user"],
    ["--a--b--@example.test", "a--b"],
    [`${"-".repeat(LONG)}dana@example.test`, "dana"],
  ];
  for (let round = 0; round < 5; round += 1) {
    for (const [email, handle] of cases) {
      assert.equal(await store.suggest(email), handle, `round ${round}`);
    }
  }
});

// Extends "interleaving another input between repeats does not change the
// result": inputs of the same length with different edges, so a result
// cached by length or by the previous call is caught.
test("[boundary-10] interleaving same-length inputs with different edges does not change any result", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("-dana-@example.test"), "dana");
  assert.equal(await store.suggest("--dana@example.test"), "dana");
  assert.equal(await store.suggest("da--na@example.test"), "da--na");
  assert.equal(await store.suggest("dana--@example.test"), "dana");
  assert.equal(await store.suggest("-dana-@example.test"), "dana");
  assert.equal(await store.suggest("da--na@example.test"), "da--na");
});
