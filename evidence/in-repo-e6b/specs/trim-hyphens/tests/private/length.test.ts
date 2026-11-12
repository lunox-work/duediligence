import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createProfileStore,
  USERNAME_MAX_LENGTH,
  type UserProfileStore,
} from "../../src/emails.js";
import { createFakeEmailDb } from "../fake-email-db.js";

/** A profile store over a fake seeded with no users. */
function profileStore(): UserProfileStore {
  return createProfileStore(createFakeEmailDb({ users: [] }).db);
}

const ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";

// ---- [boundary-7] Leading hyphens do not use up the length budget ----------

test("[boundary-7] the scenario input resolves to 30 x", async () => {
  const suggested = await profileStore().suggest(
    `${"-".repeat(5)}${"x".repeat(30)}@example.test`,
  );
  assert.equal(suggested, "x".repeat(30));
  assert.equal(USERNAME_MAX_LENGTH, 30);
});

// Extends "five leading hyphens before 30 letters leave all 30 letters":
// distinct characters show the cut keeps the first 30 after the trim, not a
// window shifted by the number of hyphens.
test("[boundary-7] leading hyphens before 36 distinct characters keep the first 30 of them", async () => {
  const store = profileStore();
  for (const count of [1, 5, 29, 31, 100]) {
    assert.equal(
      await store.suggest(`${"-".repeat(count)}${ALNUM}@example.test`),
      ALNUM.slice(0, 30),
      `${count} leading hyphens`,
    );
  }
});

// Extends "leading hyphens as long as the whole budget leave all 30 letters":
// leading replaced characters, and a stem longer than the limit.
test("[boundary-7] leading replaced characters before a long stem do not use up the budget", async () => {
  const store = profileStore();
  assert.equal(
    await store.suggest(`${".".repeat(40)}${"x".repeat(30)}@example.test`),
    "x".repeat(30),
  );
  assert.equal(
    await store.suggest(`-.-.-${"y".repeat(45)}@example.test`),
    "y".repeat(30),
  );
});

// A shortcut that truncates the local part before trimming loses letters.
test("[boundary-7] leading hyphens before a stem of exactly 30 keep all 30 after lowercasing", async () => {
  assert.equal(
    await profileStore().suggest(`${"-".repeat(12)}${"X".repeat(30)}@example.test`),
    "x".repeat(30),
  );
});

// ---- [boundary-8] Trailing hyphens past the limit are dropped --------------

test("[boundary-8] the scenario input resolves to 30 x", async () => {
  assert.equal(
    await profileStore().suggest(`${"x".repeat(30)}${"-".repeat(5)}@example.test`),
    "x".repeat(30),
  );
});

// Extends "trailing hyphens after 30 letters are dropped": other counts and
// a stem already longer than the limit.
test("[boundary-8] trailing hyphens of other lengths after 30 or more letters are dropped", async () => {
  const store = profileStore();
  for (const count of [1, 2, 30, 100]) {
    assert.equal(
      await store.suggest(`${"x".repeat(30)}${"-".repeat(count)}@example.test`),
      "x".repeat(30),
      `${count} trailing hyphens`,
    );
  }
  assert.equal(
    await store.suggest(`${ALNUM}${"-".repeat(3)}@example.test`),
    ALNUM.slice(0, 30),
  );
});

// Extends "trailing hyphens that would fit within the limit are still
// trimmed": other stem lengths and trailing replaced characters.
test("[boundary-8] trailing hyphens and replaced characters after a shorter stem are all trimmed", async () => {
  const store = profileStore();
  assert.equal(
    await store.suggest(`${"x".repeat(28)}${"-".repeat(2)}@example.test`),
    "x".repeat(28),
  );
  assert.equal(
    await store.suggest(`${"x".repeat(25)}${"-".repeat(10)}@example.test`),
    "x".repeat(25),
  );
  assert.equal(
    await store.suggest(`${"x".repeat(29)}.....@example.test`),
    "x".repeat(29),
  );
});

// ---- [boundary-9] Truncation can leave a trailing hyphen -------------------

test("[boundary-9] the scenario input resolves to 29 x and a hyphen, 30 long", async () => {
  const suggested = await profileStore().suggest(
    `${"x".repeat(29)}-y@example.test`,
  );
  assert.equal(suggested, `${"x".repeat(29)}-`);
  assert.equal(suggested.length, 30);
});

// Extends "two interior hyphens at the cut are both left at the end": a
// longer interior run cut at the limit. Truncating before trimming would
// leave the run at the edge and trim it away; trimming again after the cut
// would remove it too.
test("[boundary-9] an interior run crossing the cut leaves every hyphen up to the limit", async () => {
  const suggested = await profileStore().suggest(
    `${"x".repeat(25)}${"-".repeat(10)}b@example.test`,
  );
  assert.equal(suggested, `${"x".repeat(25)}${"-".repeat(5)}`);
  assert.equal(suggested.length, 30);
});

// Extends "an interior hyphen at the cut is left at the end": leading
// hyphens shift the cut, so the trailing hyphen is only at the limit if the
// leading trim happened first.
test("[boundary-9] leading hyphens are trimmed before the cut that leaves a trailing hyphen", async () => {
  const suggested = await profileStore().suggest(
    `${"-".repeat(5)}${"x".repeat(29)}-y@example.test`,
  );
  assert.equal(suggested, `${"x".repeat(29)}-`);
  assert.equal(suggested.length, 30);
});

// A replaced character at the cut becomes the trailing hyphen.
test("[boundary-9] a replaced character at the cut is left as a trailing hyphen", async () => {
  const store = profileStore();
  assert.equal(
    await store.suggest(`${"x".repeat(29)}.y@example.test`),
    `${"x".repeat(29)}-`,
  );
  assert.equal(
    await store.suggest(`${"x".repeat(29)}-yyyyy-@example.test`),
    `${"x".repeat(29)}-`,
  );
});

// One letter and a short interior run: 29 hyphens after the letter fill the
// budget and the handle ends in hyphens.
test("[boundary-9] a letter followed by 29 or more interior hyphens is cut to the letter and 29 hyphens", async () => {
  const store = profileStore();
  for (const count of [29, 30, 40]) {
    const suggested = await store.suggest(`a${"-".repeat(count)}b@example.test`);
    assert.equal(suggested, `a${"-".repeat(29)}`, `${count} hyphens`);
    assert.equal(suggested.length, 30);
  }
});
