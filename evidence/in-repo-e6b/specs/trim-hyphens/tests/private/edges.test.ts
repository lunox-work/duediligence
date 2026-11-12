import assert from "node:assert/strict";
import { test } from "node:test";

import { createProfileStore, type UserProfileStore } from "../../src/emails.js";
import { createFakeEmailDb } from "../fake-email-db.js";

/** A profile store over a fake seeded with no users. */
function profileStore(): UserProfileStore {
  return createProfileStore(createFakeEmailDb({ users: [] }).db);
}

// ---- [happy-1] Hyphens at either end are removed ---------------------------

test("[happy-1] every example of the outline resolves to its handle", async () => {
  const store = profileStore();
  const examples: Array<[string, string]> = [
    ["dana@example.test", "dana"],
    ["-dana@example.test", "dana"],
    ["dana-@example.test", "dana"],
    ["---dana---@example.test", "dana"],
    ["-Dana-@example.test", "dana"],
    ["-abc@example.test", "abc"],
  ];
  for (const [email, handle] of examples) {
    assert.equal(await store.suggest(email), handle, email);
  }
});

// Extends "runs of hyphens at both ends are removed": a strip that removes a
// fixed number of hyphens, or only one, passes a run of three but not these.
test("[happy-1] leading and trailing runs of unequal, longer lengths are removed", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("-------dana@example.test"), "dana");
  assert.equal(await store.suggest("dana-----------@example.test"), "dana");
  assert.equal(await store.suggest("--dana-------@example.test"), "dana");
  assert.equal(await store.suggest("---------dana-@example.test"), "dana");
});

// Extends "a leading hyphen is removed" / "a trailing hyphen is removed":
// other stems, so a hard-coded "dana" or an off-by-one at the walk's end
// is caught.
test("[happy-1] edge hyphens are removed from stems of other lengths and contents", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("-alexander@example.test"), "alexander");
  assert.equal(await store.suggest("alexander-@example.test"), "alexander");
  assert.equal(await store.suggest("-1234-@example.test"), "1234");
  assert.equal(await store.suggest("--bob99--@example.test"), "bob99");
  assert.equal(await store.suggest("-abcd@example.test"), "abcd");
  assert.equal(await store.suggest("abcd-@example.test"), "abcd");
});

// Extends "a stem trimmed to exactly the minimum length is not padded": the
// trailing and both-sides variants.
test("[happy-1] a stem trimmed to exactly three characters from the end or both ends is not padded", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("abc-@example.test"), "abc");
  assert.equal(await store.suggest("---abc---@example.test"), "abc");
  assert.equal(await store.suggest("-a1_-@example.test"), "a1_");
});

// Extends "edge hyphens are removed after lowercasing": all-caps and mixed.
test("[happy-1] edge hyphens are removed from an upper-case local part", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("--DANA--@Example.Test"), "dana");
  assert.equal(await store.suggest("-DaNa-SmItH-@example.test"), "dana-smith");
});

// ---- [happy-2] Replaced characters at either end are removed ---------------

test("[happy-2] every example of the outline resolves to its handle", async () => {
  const store = profileStore();
  assert.equal(await store.suggest(".dana.@example.test"), "dana");
  assert.equal(await store.suggest("+-dana-+@example.test"), "dana");
});

// Extends "dots at either end become hyphens and are removed": other
// replaced characters, and runs of them.
test("[happy-2] other replaced characters and runs of them at either end are removed", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("+dana+@example.test"), "dana");
  assert.equal(await store.suggest("...dana...@example.test"), "dana");
  assert.equal(await store.suggest("!#$dana%&*@example.test"), "dana");
  assert.equal(await store.suggest("(dana)@example.test"), "dana");
  assert.equal(await store.suggest("~dana~@example.test"), "dana");
});

// Extends "a mix of replaced characters and hyphens at either end is
// removed": alternating mixes, so trimming has to run after the replacement
// has merged them into one hyphen run.
test("[happy-2] alternating hyphens and replaced characters at either end are removed", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("-.-.-dana-.-.-@example.test"), "dana");
  assert.equal(await store.suggest(".-+-.dana+.-.+@example.test"), "dana");
  assert.equal(await store.suggest("-+dana.-@example.test"), "dana");
});

// Characters outside ASCII are outside [a-z0-9_-] and become hyphens too.
test("[happy-2] non-ASCII characters at either end are replaced and removed", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("ßdanaé@example.test"), "dana");
  assert.equal(await store.suggest("-josé-@example.test"), "jos");
  assert.equal(await store.suggest("😀dana😀@example.test"), "dana");
});

// toLowerCase runs before the replacement: the Kelvin sign lowercases to an
// ASCII "k", so it is kept rather than replaced and trimmed.
test("[happy-2] a character that lowercases into the allowed set is kept, not trimmed", async () => {
  assert.equal(await profileStore().suggest("Kelvin@example.test"), "kelvin");
});

// ---- [boundary-1] A leading space becomes a hyphen and is trimmed ----------

test("[boundary-1] the scenario input with one leading space resolves to dana", async () => {
  const email = " dana@example.test";
  assert.equal(email[0], " ");
  assert.equal(await profileStore().suggest(email), "dana");
});

// Extends "several leading spaces are trimmed": other whitespace, trailing
// spaces, and spaces next to hyphens.
test("[boundary-1] leading tabs, trailing spaces and spaces beside hyphens are trimmed", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("\tdana@example.test"), "dana");
  assert.equal(await store.suggest("dana  @example.test"), "dana");
  assert.equal(await store.suggest(" - dana - @example.test"), "dana");
  assert.equal(await store.suggest("  dana smith  @example.test"), "dana-smith");
});

// ---- [boundary-2] Interior hyphens are neither removed nor collapsed -------

test("[boundary-2] every example of the outline resolves to its handle", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("a--b@example.test"), "a--b");
  assert.equal(await store.suggest("a-.-b@example.test"), "a---b");
});

// Extends "an interior run of two hyphens is kept as two": longer runs and
// several runs, so a collapse-to-one shortcut or a run-length cap is caught.
test("[boundary-2] longer and multiple interior hyphen runs are kept exactly", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("a-----b@example.test"), "a-----b");
  assert.equal(await store.suggest("a-b--c---d@example.test"), "a-b--c---d");
  assert.equal(await store.suggest("dana-smith@example.test"), "dana-smith");
});

// Extends both outline rows: interior runs survive when the edges are trimmed.
test("[boundary-2] interior runs are kept while edge runs are trimmed", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("--a--b--@example.test"), "a--b");
  assert.equal(await store.suggest(".a-.-b.@example.test"), "a---b");
});

// Extends "an interior replaced character keeps the hyphens around it": the
// replacement merges a run of replaced characters into one hyphen, and the
// hyphens beside it stay.
test("[boundary-2] interior runs of replaced characters become one hyphen and keep neighbouring hyphens", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("a..b@example.test"), "a-b");
  assert.equal(await store.suggest("a.-.b@example.test"), "a---b");
  assert.equal(await store.suggest("a-..-b@example.test"), "a---b");
  assert.equal(await store.suggest("a--+++--b@example.test"), "a-----b");
});

// ---- [boundary-3] Underscores are not trimmed, only hyphens ----------------

test("[boundary-3] every example of the outline resolves to its handle", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("_dana_@example.test"), "_dana_");
  assert.equal(await store.suggest("-_-@example.test"), "_-user");
});

// Extends "underscores at either end are kept": hyphens outside the
// underscores are trimmed and the underscores stay.
test("[boundary-3] hyphens outside edge underscores are trimmed and the underscores kept", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("--_dana_--@example.test"), "_dana_");
  assert.equal(await store.suggest("__dana__@example.test"), "__dana__");
  assert.equal(await store.suggest("_-dana-_@example.test"), "_-dana-_");
});

// Extends "hyphens around an underscore are trimmed and the short stem is
// padded": stems made only of underscores, or underscores around a hyphen.
test("[boundary-3] underscore-only and underscore-hyphen stems keep every underscore", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("___@example.test"), "___");
  assert.equal(await store.suggest("_-_@example.test"), "_-_");
  assert.equal(await store.suggest("-__-@example.test"), "__-user");
  assert.equal(await store.suggest("._.@example.test"), "_-user");
});

// ---- [boundary-4] An all-hyphen or empty local part becomes "-user" --------

test("[boundary-4] every example of the outline resolves to -user", async () => {
  const store = profileStore();
  for (const email of [
    "-@example.test",
    "---@example.test",
    "...@example.test",
    "@example.test",
    "",
  ]) {
    assert.equal(await store.suggest(email), "-user", JSON.stringify(email));
  }
});

// Extends "an all-hyphen local part becomes -user" and "a local part of only
// replaced characters becomes -user": other characters, mixes, no "@".
test("[boundary-4] other all-hyphen, all-replaced and mixed local parts become -user", async () => {
  const store = profileStore();
  for (const email of [
    "----------@example.test",
    "+++@example.test",
    "   @example.test",
    "-.-.-@example.test",
    "é@example.test",
    "-",
    "--",
    "...",
    "@",
    "@@example.test",
  ]) {
    assert.equal(await store.suggest(email), "-user", JSON.stringify(email));
  }
});

// ---- [boundary-5] A stem shortened by trimming is padded -------------------

test("[boundary-5] every example of the outline resolves to its handle", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("jo-@example.test"), "jo-user");
  assert.equal(await store.suggest("-jo@example.test"), "jo-user");
  assert.equal(await store.suggest("--a--@example.test"), "a-user");
  assert.equal(await store.suggest("ab-@example.test"), "ab-user");
});

// Extends the outline rows: other short stems and trims from both ends, and
// a stem that keeps three characters only because an interior hyphen stays.
test("[boundary-5] other short stems are padded after trimming, and an interior hyphen counts toward the minimum", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("-ab-@example.test"), "ab-user");
  assert.equal(await store.suggest("-----x@example.test"), "x-user");
  assert.equal(await store.suggest("x-----@example.test"), "x-user");
  assert.equal(await store.suggest(".jo.@example.test"), "jo-user");
  assert.equal(await store.suggest("-a-b-@example.test"), "a-b");
  assert.equal(await store.suggest("a-b-@example.test"), "a-b");
  assert.equal(await store.suggest("-9-@example.test"), "9-user");
});

// ---- [boundary-6] Local part extraction is unchanged -----------------------

test("[boundary-6] every example of the outline resolves to its handle", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("dana"), "dana");
  assert.equal(await store.suggest("-dana-"), "dana");
  assert.equal(await store.suggest("a@b@c.test"), "a-user");
});

// Extends "only the text before the first @ is used": hyphens on the domain
// side, and later parts, never reach the stem.
test("[boundary-6] hyphens and text after the first @ are ignored", async () => {
  const store = profileStore();
  assert.equal(await store.suggest("-dana-@-example-.test"), "dana");
  assert.equal(await store.suggest("dana@"), "dana");
  assert.equal(await store.suggest("-dana-@x@y"), "dana");
  assert.equal(await store.suggest("@dana"), "-user");
  assert.equal(await store.suggest("-@dana"), "-user");
  assert.equal(await store.suggest("ab@cdef"), "ab-user");
});

// Extends "input without @ is trimmed at both ends": replaced characters and
// casing in input without "@".
test("[boundary-6] input without @ is lowercased, replaced and trimmed whole", async () => {
  const store = profileStore();
  assert.equal(await store.suggest(".Dana Smith."), "dana-smith");
  assert.equal(await store.suggest("--jo--"), "jo-user");
});
