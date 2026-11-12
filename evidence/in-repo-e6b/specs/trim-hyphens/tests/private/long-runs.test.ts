import assert from "node:assert/strict";
import { test } from "node:test";

import { createProfileStore, type UserProfileStore } from "../../src/emails.js";
import { createFakeEmailDb } from "../fake-email-db.js";

/** A profile store over a fake seeded with no users. */
function profileStore(): UserProfileStore {
  return createProfileStore(createFakeEmailDb({ users: [] }).db);
}

const LONG = 100_000;

// ---- [unhappy-1] A long interior hyphen run --------------------------------

test("[unhappy-1] the scenario input resolves to a and 29 hyphens, 30 long", async () => {
  const suggested = await profileStore().suggest(
    `a${"-".repeat(LONG)}b@example.test`,
  );
  assert.equal(suggested, `a${"-".repeat(29)}`);
  assert.equal(suggested.length, 30);
});

// Extends "a 100000-hyphen run between two letters keeps the first letter and
// 29 hyphens": a longer stem before the run, a larger run, and long runs at
// the edges as well.
test("[unhappy-1] a longer prefix before a 200000-hyphen interior run keeps the prefix and fills with hyphens", async () => {
  const suggested = await profileStore().suggest(
    `dana${"-".repeat(2 * LONG)}smith@example.test`,
  );
  assert.equal(suggested, `dana${"-".repeat(26)}`);
  assert.equal(suggested.length, 30);
});

test("[unhappy-1] long edge runs around a long interior run are trimmed and the interior kept", async () => {
  const dashes = "-".repeat(LONG);
  const suggested = await profileStore().suggest(
    `${dashes}a${dashes}b${dashes}@example.test`,
  );
  assert.equal(suggested, `a${"-".repeat(29)}`);
  assert.equal(suggested.length, 30);
});

// The interior run built from alternating hyphens and replaced characters:
// each dot becomes one hyphen, so the run is twice as long and still kept.
test("[unhappy-1] a long interior run of alternating hyphens and dots keeps the first letter and 29 hyphens", async () => {
  const suggested = await profileStore().suggest(
    `a${"-.".repeat(LONG / 2)}b@example.test`,
  );
  assert.equal(suggested, `a${"-".repeat(29)}`);
});

// Extends "a 100000-hyphen run after a single letter trims to the letter and
// is padded": a stem that reaches the minimum is not padded.
test("[unhappy-1] a 100000-hyphen run after a three-letter stem trims to the stem without padding", async () => {
  assert.equal(
    await profileStore().suggest(`abc${"-".repeat(LONG)}@example.test`),
    "abc",
  );
});

// A long run of replaced characters merges into one hyphen.
test("[unhappy-1] a 100000-dot interior run becomes a single hyphen", async () => {
  assert.equal(
    await profileStore().suggest(`a${".".repeat(LONG)}b@example.test`),
    "a-b",
  );
});

// ---- [unhappy-2] A long hyphen run on both sides of the name ---------------

test("[unhappy-2] the scenario input resolves to dana", async () => {
  assert.equal(
    await profileStore().suggest(
      `${"-".repeat(LONG)}dana${"-".repeat(LONG)}@example.test`,
    ),
    "dana",
  );
});

// Extends "100000 hyphens before the name only are removed": the trailing
// only case, and a larger leading run, which a shortcut that caps the local
// part's length before trimming turns into "-user".
test("[unhappy-2] 100000 hyphens after the name only, and 300000 before it, are removed", async () => {
  const store = profileStore();
  assert.equal(
    await store.suggest(`dana${"-".repeat(LONG)}@example.test`),
    "dana",
  );
  assert.equal(
    await store.suggest(`${"-".repeat(3 * LONG)}dana@example.test`),
    "dana",
  );
});

// Extends "100000 hyphens on both sides of the name are removed": unequal
// runs, a name with interior hyphens, and a name longer than the limit.
test("[unhappy-2] long unequal runs around a hyphenated name keep the interior hyphens", async () => {
  assert.equal(
    await profileStore().suggest(
      `${"-".repeat(LONG)}dana--smith${"-".repeat(LONG + 7)}@example.test`,
    ),
    "dana--smith",
  );
});

test("[unhappy-2] long runs around a 40-letter name leave its first 30 letters", async () => {
  assert.equal(
    await profileStore().suggest(
      `${"-".repeat(LONG)}${"q".repeat(40)}${"-".repeat(LONG)}@example.test`,
    ),
    "q".repeat(30),
  );
});

test("[unhappy-2] long runs of replaced characters on both sides of the name are removed", async () => {
  assert.equal(
    await profileStore().suggest(
      `${".".repeat(LONG)}dana${"+-".repeat(LONG / 2)}@example.test`,
    ),
    "dana",
  );
});

test("[unhappy-2] long runs on both sides of a two-letter name trim it and pad it", async () => {
  assert.equal(
    await profileStore().suggest(
      `${"-".repeat(LONG)}jo${"-".repeat(LONG)}@example.test`,
    ),
    "jo-user",
  );
});

// ---- [unhappy-3] A long all-hyphen local part ------------------------------

test("[unhappy-3] the scenario input resolves to -user", async () => {
  assert.equal(
    await profileStore().suggest(`${"-".repeat(LONG)}@example.test`),
    "-user",
  );
});

// Extends "a 100000-hyphen local part becomes -user": larger and odd sizes,
// replaced characters, and text after "@".
test("[unhappy-3] larger, odd-length and replaced-character all-hyphen local parts become -user", async () => {
  const store = profileStore();
  assert.equal(await store.suggest(`${"-".repeat(3 * LONG + 1)}@example.test`), "-user");
  assert.equal(await store.suggest(`${".".repeat(LONG)}@example.test`), "-user");
  assert.equal(await store.suggest(`${"-.".repeat(LONG / 2)}@example.test`), "-user");
  assert.equal(await store.suggest(`${"-".repeat(LONG)}@dana`), "-user");
});

// Extends "a 100000-hyphen input with no @ becomes -user": spaces with no @.
test("[unhappy-3] a 100000-space input with no @ becomes -user", async () => {
  assert.equal(await profileStore().suggest(" ".repeat(LONG)), "-user");
});
