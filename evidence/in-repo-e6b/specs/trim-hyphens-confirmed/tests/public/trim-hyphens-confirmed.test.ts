import assert from "node:assert/strict";
import { test } from "node:test";

import { createProfileStore } from "../src/emails.js";
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

function emptyStore() {
  return createProfileStore(createFakeEmailDb().db);
}

function storeWithUsernames(usernames: readonly string[]) {
  const fake = createFakeEmailDb({
    users: usernames.map((username, index) =>
      user({ id: `user_${index + 2}`, username }),
    ),
  });
  return createProfileStore(fake.db);
}

async function assertSuggests(
  rows: ReadonlyArray<readonly [string, string]>,
): Promise<void> {
  for (const [email, handle] of rows) {
    const store = emptyStore();
    assert.equal(
      await store.suggest(email),
      handle,
      `suggest(${JSON.stringify(email)})`,
    );
  }
}

// ---- @happy ---------------------------------------------------------------

test("[happy-1] hyphens at either end of the local part are removed", async () => {
  await assertSuggests([
    ["dana@example.test", "dana"],
    ["-dana@example.test", "dana"],
    ["dana-@example.test", "dana"],
    ["---dana---@example.test", "dana"],
    ["-Dana-@example.test", "dana"],
  ]);
});

test("[happy-1] a stem trimmed to exactly USERNAME_MIN_LENGTH is not padded", async () => {
  await assertSuggests([["-abc@example.test", "abc"]]);
});

test("[happy-2] characters replaced by a hyphen at either end are removed with it", async () => {
  await assertSuggests([[".dana.@example.test", "dana"]]);
});

test("[happy-2] a mix of replaced characters and hyphens at either end is removed", async () => {
  await assertSuggests([["+-dana-+@example.test", "dana"]]);
});

test("[happy-3] the collision counter is appended to the trimmed stem", async () => {
  const store = storeWithUsernames(["dana"]);

  assert.equal(await store.suggest("--dana--@example.test"), "dana2");
});

test("[happy-3] the last counter value is appended to the trimmed stem", async () => {
  const store = storeWithUsernames([
    "dana",
    ...Array.from({ length: 18 }, (_, i) => `dana${i + 2}`),
  ]);

  assert.equal(await store.suggest("--dana--@example.test"), "dana20");
});

test("[happy-4] the random fallback uses the trimmed stem", async () => {
  const store = storeWithUsernames([
    "dana",
    ...Array.from({ length: 19 }, (_, i) => `dana${i + 2}`),
  ]);

  assert.match(await store.suggest("-dana-@example.test"), /^dana-[0-9a-f]{6}$/);
});

test("[happy-4] the random fallback shortens a full-length trimmed stem", async () => {
  // Every counter candidate of a 30-character stem truncates back to the
  // stem itself, so holding the stem alone exhausts the counter.
  const store = storeWithUsernames(["x".repeat(30)]);

  assert.match(
    await store.suggest(`-${"x".repeat(30)}-@example.test`),
    /^x{23}-[0-9a-f]{6}$/,
  );
});

// ---- @boundary ------------------------------------------------------------

test("[boundary-1] a leading space becomes a hyphen and is trimmed", async () => {
  await assertSuggests([[" dana@example.test", "dana"]]);
});

test("[boundary-1] whitespace at both ends becomes hyphens and is trimmed", async () => {
  await assertSuggests([["  dana\t@example.test", "dana"]]);
});

test("[boundary-2] interior doubled hyphens are kept", async () => {
  await assertSuggests([["a--b@example.test", "a--b"]]);
});

test("[boundary-2] interior hyphens next to a replaced character are not collapsed", async () => {
  await assertSuggests([["a-.-b@example.test", "a---b"]]);
});

test("[boundary-3] underscores at either end are kept", async () => {
  await assertSuggests([["_dana_@example.test", "_dana_"]]);
});

test("[boundary-3] hyphens around an underscore are trimmed and the short stem padded", async () => {
  await assertSuggests([["-_-@example.test", "_-user"]]);
});

test("[boundary-4] an all-hyphen or all-replaced local part becomes -user", async () => {
  await assertSuggests([
    ["-@example.test", "-user"],
    ["---@example.test", "-user"],
    ["...@example.test", "-user"],
  ]);
});

test("[boundary-4] an empty local part or empty input becomes -user", async () => {
  await assertSuggests([
    ["@example.test", "-user"],
    ["", "-user"],
  ]);
});

test("[boundary-5] a two-letter stem shortened by trimming is padded", async () => {
  await assertSuggests([
    ["jo-@example.test", "jo-user"],
    ["-jo@example.test", "jo-user"],
  ]);
});

test("[boundary-5] a one-letter stem and a stem one short of the minimum are padded", async () => {
  await assertSuggests([
    ["--a--@example.test", "a-user"],
    ["ab-@example.test", "ab-user"],
  ]);
});

test("[boundary-6] input without @ is used whole", async () => {
  await assertSuggests([["dana", "dana"]]);
});

test("[boundary-6] input without @ is trimmed, and only text before the first @ is used", async () => {
  await assertSuggests([
    ["-dana-", "dana"],
    ["a@b@c.test", "a-user"],
  ]);
});

test("[boundary-7] leading hyphens do not use up the length budget", async () => {
  await assertSuggests([
    [`${"-".repeat(5)}${"x".repeat(30)}@example.test`, "x".repeat(30)],
  ]);
});

test("[boundary-7] leading hyphens longer than the whole budget are all trimmed", async () => {
  await assertSuggests([[`${"-".repeat(30)}xyz@example.test`, "xyz"]]);
});

test("[boundary-8] trailing hyphens past the limit are dropped", async () => {
  await assertSuggests([
    [`${"x".repeat(30)}${"-".repeat(5)}@example.test`, "x".repeat(30)],
  ]);
});

test("[boundary-8] trailing hyphens straddling the limit are trimmed before truncation", async () => {
  await assertSuggests([
    [`${"x".repeat(28)}---@example.test`, "x".repeat(28)],
  ]);
});

test("[boundary-9] truncation can leave a trailing hyphen", async () => {
  const store = emptyStore();

  const suggested = await store.suggest(`${"x".repeat(29)}-y@example.test`);

  assert.equal(suggested, `${"x".repeat(29)}-`);
  assert.equal(suggested.length, 30);
});

test("[boundary-9] truncation after trimming leading hyphens can leave a trailing hyphen", async () => {
  const store = emptyStore();

  const suggested = await store.suggest(
    `---${"x".repeat(29)}-y@example.test`,
  );

  assert.equal(suggested, `${"x".repeat(29)}-`);
  assert.equal(suggested.length, 30);
});

test("[boundary-10] repeating a call gives the same result", async () => {
  const store = emptyStore();

  for (let i = 0; i < 3; i += 1) {
    assert.equal(await store.suggest("-dana-@example.test"), "dana");
  }
});

test("[boundary-10] repeated calls interleaved with other inputs give the same result", async () => {
  const store = emptyStore();

  assert.equal(await store.suggest("-dana-@example.test"), "dana");
  assert.equal(await store.suggest("---@example.test"), "-user");
  assert.equal(await store.suggest("-dana-@example.test"), "dana");
  assert.equal(await store.suggest("a--b@example.test"), "a--b");
  assert.equal(await store.suggest("-dana-@example.test"), "dana");
});

// ---- @unhappy -------------------------------------------------------------

test("[unhappy-1] a long interior hyphen run keeps the hyphens up to the limit", async () => {
  const store = emptyStore();

  const suggested = await store.suggest(
    `a${"-".repeat(100000)}b@example.test`,
  );

  assert.equal(suggested, `a${"-".repeat(29)}`);
  assert.equal(suggested.length, 30);
});

test("[unhappy-1] a long hyphen run followed by an underscore keeps the hyphens up to the limit", async () => {
  const store = emptyStore();

  const suggested = await store.suggest(
    `a${"-".repeat(100000)}_@example.test`,
  );

  assert.equal(suggested, `a${"-".repeat(29)}`);
  assert.equal(suggested.length, 30);
});

test("[unhappy-2] long hyphen runs on both sides of the name are trimmed", async () => {
  await assertSuggests([
    [`${"-".repeat(100000)}dana${"-".repeat(100000)}@example.test`, "dana"],
  ]);
});

test("[unhappy-2] long runs mixing hyphens and replaced characters on both sides are trimmed", async () => {
  await assertSuggests([
    [`${"-.".repeat(50000)}Dana${".-".repeat(50000)}@example.test`, "dana"],
  ]);
});

test("[unhappy-3] a long all-hyphen local part becomes -user", async () => {
  await assertSuggests([[`${"-".repeat(100000)}@example.test`, "-user"]]);
});

test("[unhappy-3] a long all-hyphen input without @ becomes -user", async () => {
  await assertSuggests([["-".repeat(100000), "-user"]]);
});

// ---- @concurrency ---------------------------------------------------------

test("[concurrency-1] overlapping suggest calls each get their own result", async () => {
  const store = emptyStore();

  const results = await Promise.all([
    store.suggest("-dana-@example.test"),
    store.suggest("a--b@example.test"),
    store.suggest("---@example.test"),
  ]);

  assert.deepEqual(results, ["dana", "a--b", "-user"]);
});

test("[concurrency-1] overlapping calls including a long hyphen run each get their own result", async () => {
  const store = emptyStore();

  const results = await Promise.all([
    store.suggest(`a${"-".repeat(100000)}b@example.test`),
    store.suggest("-dana-@example.test"),
    store.suggest("---@example.test"),
    store.suggest("-dana-@example.test"),
  ]);

  assert.deepEqual(results, [`a${"-".repeat(29)}`, "dana", "-user", "dana"]);
});
