import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createProfileStore,
  USERNAME_MAX_LENGTH,
  type UserProfileStore,
} from "../src/emails.js";
import { createFakeEmailDb, type UserRowLite } from "./fake-email-db.js";

function user(over: Partial<UserRowLite> = {}): UserRowLite {
  return {
    id: "user_1",
    email: "first@example.test",
    updatedAt: new Date("2026-09-16T00:00:00.000Z"),
    username: null,
    ...over,
  };
}

/** A profile store over a fake seeded with no users, unless told otherwise. */
function profileStore(users: UserRowLite[] = []): UserProfileStore {
  return createProfileStore(createFakeEmailDb({ users }).db);
}

/** Users holding each of the given usernames. */
function holding(usernames: string[]): UserRowLite[] {
  return usernames.map((username, index) =>
    user({ id: `user_${index + 2}`, username }),
  );
}

const LONG = 100_000;

// ---- [happy-1] Hyphens at either end are removed ---------------------------

test("[happy-1] an address with no edge hyphens keeps its local part", async () => {
  assert.equal(await profileStore().suggest("dana@example.test"), "dana");
});

test("[happy-1] a leading hyphen is removed", async () => {
  assert.equal(await profileStore().suggest("-dana@example.test"), "dana");
});

test("[happy-1] a trailing hyphen is removed", async () => {
  assert.equal(await profileStore().suggest("dana-@example.test"), "dana");
});

test("[happy-1] runs of hyphens at both ends are removed", async () => {
  assert.equal(
    await profileStore().suggest("---dana---@example.test"),
    "dana",
  );
});

test("[happy-1] edge hyphens are removed after lowercasing", async () => {
  assert.equal(await profileStore().suggest("-Dana-@example.test"), "dana");
});

test("[happy-1] a stem trimmed to exactly the minimum length is not padded", async () => {
  assert.equal(await profileStore().suggest("-abc@example.test"), "abc");
});

// ---- [happy-2] Replaced characters at either end are removed ---------------

test("[happy-2] dots at either end become hyphens and are removed", async () => {
  assert.equal(await profileStore().suggest(".dana.@example.test"), "dana");
});

test("[happy-2] a mix of replaced characters and hyphens at either end is removed", async () => {
  assert.equal(await profileStore().suggest("+-dana-+@example.test"), "dana");
});

// ---- [boundary-1] A leading space becomes a hyphen and is trimmed ----------

test("[boundary-1] a single leading space is trimmed", async () => {
  assert.equal(await profileStore().suggest(" dana@example.test"), "dana");
});

test("[boundary-1] several leading spaces are trimmed", async () => {
  assert.equal(await profileStore().suggest("   dana@example.test"), "dana");
});

// ---- [boundary-2] Interior hyphens are neither removed nor collapsed -------

test("[boundary-2] an interior run of two hyphens is kept as two", async () => {
  assert.equal(await profileStore().suggest("a--b@example.test"), "a--b");
});

test("[boundary-2] an interior replaced character keeps the hyphens around it", async () => {
  assert.equal(await profileStore().suggest("a-.-b@example.test"), "a---b");
});

// ---- [boundary-3] Underscores are not trimmed, only hyphens ----------------

test("[boundary-3] underscores at either end are kept", async () => {
  assert.equal(await profileStore().suggest("_dana_@example.test"), "_dana_");
});

test("[boundary-3] hyphens around an underscore are trimmed and the short stem is padded", async () => {
  assert.equal(await profileStore().suggest("-_-@example.test"), "_-user");
});

// ---- [boundary-4] All-hyphen or empty local part becomes "-user" -----------

test("[boundary-4] a single-hyphen local part becomes -user", async () => {
  assert.equal(await profileStore().suggest("-@example.test"), "-user");
});

test("[boundary-4] an all-hyphen local part becomes -user", async () => {
  assert.equal(await profileStore().suggest("---@example.test"), "-user");
});

test("[boundary-4] a local part of only replaced characters becomes -user", async () => {
  assert.equal(await profileStore().suggest("...@example.test"), "-user");
});

test("[boundary-4] an empty local part becomes -user", async () => {
  assert.equal(await profileStore().suggest("@example.test"), "-user");
});

test("[boundary-4] an empty string becomes -user", async () => {
  assert.equal(await profileStore().suggest(""), "-user");
});

// ---- [boundary-5] A stem shortened by trimming is padded -------------------

test("[boundary-5] a trailing hyphen trimmed from a two-letter stem is padded", async () => {
  assert.equal(await profileStore().suggest("jo-@example.test"), "jo-user");
});

test("[boundary-5] a leading hyphen trimmed from a two-letter stem is padded", async () => {
  assert.equal(await profileStore().suggest("-jo@example.test"), "jo-user");
});

test("[boundary-5] a one-letter stem trimmed from both ends is padded", async () => {
  assert.equal(await profileStore().suggest("--a--@example.test"), "a-user");
});

test("[boundary-5] a three-character local part trimmed below the minimum is padded", async () => {
  assert.equal(await profileStore().suggest("ab-@example.test"), "ab-user");
});

// ---- [boundary-6] Local part extraction is unchanged -----------------------

test("[boundary-6] input without @ is used whole", async () => {
  assert.equal(await profileStore().suggest("dana"), "dana");
});

test("[boundary-6] input without @ is trimmed at both ends", async () => {
  assert.equal(await profileStore().suggest("-dana-"), "dana");
});

test("[boundary-6] only the text before the first @ is used", async () => {
  assert.equal(await profileStore().suggest("a@b@c.test"), "a-user");
});

// ---- [boundary-7] Leading hyphens do not use up the length budget ----------

test("[boundary-7] five leading hyphens before 30 letters leave all 30 letters", async () => {
  assert.equal(
    await profileStore().suggest(`${"-".repeat(5)}${"x".repeat(30)}@example.test`),
    "x".repeat(USERNAME_MAX_LENGTH),
  );
});

test("[boundary-7] leading hyphens as long as the whole budget leave all 30 letters", async () => {
  assert.equal(
    await profileStore().suggest(
      `${"-".repeat(30)}${"x".repeat(30)}@example.test`,
    ),
    "x".repeat(30),
  );
});

// ---- [boundary-8] Trailing hyphens past the limit are dropped --------------

test("[boundary-8] trailing hyphens after 30 letters are dropped", async () => {
  assert.equal(
    await profileStore().suggest(`${"x".repeat(30)}${"-".repeat(5)}@example.test`),
    "x".repeat(30),
  );
});

test("[boundary-8] trailing hyphens that would fit within the limit are still trimmed", async () => {
  // Trimming comes first, so 29 letters and a run of hyphens give 29 letters,
  // not 29 letters and a hyphen cut at the limit.
  assert.equal(
    await profileStore().suggest(`${"x".repeat(29)}${"-".repeat(5)}@example.test`),
    "x".repeat(29),
  );
});

// ---- [boundary-9] Truncation can leave a trailing hyphen -------------------

test("[boundary-9] an interior hyphen at the cut is left at the end", async () => {
  const suggested = await profileStore().suggest(
    `${"x".repeat(29)}-y@example.test`,
  );

  assert.equal(suggested, `${"x".repeat(29)}-`);
  assert.equal(suggested.length, 30);
});

test("[boundary-9] two interior hyphens at the cut are both left at the end", async () => {
  const suggested = await profileStore().suggest(
    `${"x".repeat(28)}--y@example.test`,
  );

  assert.equal(suggested, `${"x".repeat(28)}--`);
  assert.equal(suggested.length, 30);
});

// ---- [unhappy-1] A long interior hyphen run --------------------------------

test("[unhappy-1] a 100000-hyphen run between two letters keeps the first letter and 29 hyphens", async () => {
  const suggested = await profileStore().suggest(
    `a${"-".repeat(LONG)}b@example.test`,
  );

  assert.equal(suggested, `a${"-".repeat(29)}`);
  assert.equal(suggested.length, 30);
});

test("[unhappy-1] a 100000-hyphen run after a single letter trims to the letter and is padded", async () => {
  assert.equal(
    await profileStore().suggest(`a${"-".repeat(LONG)}@example.test`),
    "a-user",
  );
});

// ---- [unhappy-2] A long hyphen run on both sides of the name ---------------

test("[unhappy-2] 100000 hyphens on both sides of the name are removed", async () => {
  assert.equal(
    await profileStore().suggest(
      `${"-".repeat(LONG)}dana${"-".repeat(LONG)}@example.test`,
    ),
    "dana",
  );
});

test("[unhappy-2] 100000 hyphens before the name only are removed", async () => {
  assert.equal(
    await profileStore().suggest(`${"-".repeat(LONG)}dana@example.test`),
    "dana",
  );
});

// ---- [unhappy-3] A long all-hyphen local part ------------------------------

test("[unhappy-3] a 100000-hyphen local part becomes -user", async () => {
  assert.equal(
    await profileStore().suggest(`${"-".repeat(LONG)}@example.test`),
    "-user",
  );
});

test("[unhappy-3] a 100000-hyphen input with no @ becomes -user", async () => {
  assert.equal(await profileStore().suggest("-".repeat(LONG)), "-user");
});

// ---- [happy-3] The counter is appended to the trimmed stem -----------------

test("[happy-3] a collision on the trimmed stem appends 2", async () => {
  const store = profileStore(holding(["dana"]));

  assert.equal(await store.suggest("--dana--@example.test"), "dana2");
});

test("[happy-3] repeated collisions on the trimmed stem keep counting", async () => {
  const store = profileStore(holding(["dana", "dana2"]));

  assert.equal(await store.suggest("-dana-@example.test"), "dana3");
});

// ---- [happy-4] The random fallback uses the trimmed stem -------------------

test("[happy-4] after 20 collisions the fallback suffixes the trimmed stem", async () => {
  const taken = [
    "dana",
    ...Array.from({ length: 19 }, (_, i) => `dana${i + 2}`),
  ];
  const store = profileStore(holding(taken));

  assert.match(await store.suggest("-dana-@example.test"), /^dana-[0-9a-f]{6}$/);
});

test("[happy-4] the fallback for a trimmed stem at the maximum length cuts it to 23 characters", async () => {
  // Every counter candidate is cut back to the 30-letter stem, which is taken.
  const store = profileStore(holding(["x".repeat(30)]));

  assert.match(
    await store.suggest(`-${"x".repeat(30)}-@example.test`),
    /^x{23}-[0-9a-f]{6}$/,
  );
});

// ---- [concurrency-1] Overlapping suggest calls -----------------------------

test("[concurrency-1] parallel calls each resolve to their own handle, in order", async () => {
  const store = profileStore();

  const results = await Promise.all([
    store.suggest("-dana-@example.test"),
    store.suggest("a--b@example.test"),
    store.suggest("---@example.test"),
  ]);

  assert.deepEqual(results, ["dana", "a--b", "-user"]);
});

test("[concurrency-1] a long-run input in parallel does not affect a short one", async () => {
  const store = profileStore();

  const results = await Promise.all([
    store.suggest(`a${"-".repeat(LONG)}b@example.test`),
    store.suggest("-dana-@example.test"),
    store.suggest(`${"-".repeat(LONG)}@example.test`),
  ]);

  assert.deepEqual(results, [`a${"-".repeat(29)}`, "dana", "-user"]);
});

// ---- [boundary-10] Repeating a call gives the same result ------------------

test("[boundary-10] the same call three times in a row resolves to dana each time", async () => {
  const store = profileStore();

  for (let i = 0; i < 3; i += 1) {
    assert.equal(await store.suggest("-dana-@example.test"), "dana");
  }
});

test("[boundary-10] interleaving another input between repeats does not change the result", async () => {
  const store = profileStore();

  assert.equal(await store.suggest("-dana-@example.test"), "dana");
  assert.equal(await store.suggest("a--b@example.test"), "a--b");
  assert.equal(await store.suggest("-dana-@example.test"), "dana");
});
