import assert from "node:assert/strict";
import { test } from "node:test";

import { createProfileStore } from "../../src/emails.js";
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

/**
 * The stem as the spec defines it: exactly what the regex version returned.
 * Used only on short inputs, where the regex is cheap.
 */
function regexHandleBase(email: string): string {
  const local = email.split("@")[0] ?? "user";
  const cleaned = local
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return cleaned.length >= 3 ? cleaned : `${cleaned}-user`;
}

function allStrings(alphabet: readonly string[], maxLength: number): string[] {
  const out: string[] = [""];
  let layer: string[] = [""];
  for (let length = 1; length <= maxLength; length += 1) {
    const next: string[] = [];
    for (const prefix of layer) {
      for (const ch of alphabet) {
        next.push(prefix + ch);
      }
    }
    out.push(...next);
    layer = next;
  }
  return out;
}

async function assertMatchesRegexVersion(
  locals: readonly string[],
  domain: string,
): Promise<void> {
  for (const local of locals) {
    const email = `${local}${domain}`;
    const store = emptyStore();
    assert.equal(
      await store.suggest(email),
      regexHandleBase(email),
      `suggest(${JSON.stringify(email)})`,
    );
  }
}

// ---- happy-1: hyphens at either end are removed ---------------------------

// Extends public "[happy-1] hyphens at either end of the local part are removed":
// other names, other counts of hyphens, and unequal counts on each side.
test("[happy-1] unequal and longer hyphen runs at either end are removed", async () => {
  await assertSuggests([
    ["--dana@example.test", "dana"],
    ["dana--@example.test", "dana"],
    ["-----dana-@example.test", "dana"],
    ["-dana-----@example.test", "dana"],
    ["----------rivers----------@example.test", "rivers"],
    ["-x1y2z3-@example.test", "x1y2z3"],
    ["-42-@example.test", "42-user"],
    ["-12345-@example.test", "12345"],
  ]);
});

// Extends public "[happy-1] hyphens at either end ...": a shortcut that strips
// a single hyphen from each end (or just checks the first and last character)
// leaves the rest of the run behind.
test("[happy-1] every hyphen of a run is stripped, not only the outermost one", async () => {
  await assertSuggests([
    ["--rivers@example.test", "rivers"],
    ["rivers--@example.test", "rivers"],
    ["---rivers--@example.test", "rivers"],
  ]);
});

// Extends public "[happy-1] hyphens at either end ...": hyphens inside the name
// survive while the ones at the ends go, in the same input.
test("[happy-1] end hyphens are removed while interior hyphens in the same stem stay", async () => {
  await assertSuggests([
    ["-rivers-dana-@example.test", "rivers-dana"],
    ["--a-b-c--@example.test", "a-b-c"],
    ["---x--y---@example.test", "x--y"],
  ]);
});

// Extends public "[happy-1] hyphens at either end ...", "-Dana-": lowercasing
// happens before the replacement, so mixed case is lowercased and kept.
test("[happy-1] mixed-case names with hyphens at either end are lowercased and trimmed", async () => {
  await assertSuggests([
    ["--RIVERS--@example.test", "rivers"],
    ["-DaNa-RiVeRs-@example.test", "dana-rivers"],
  ]);
});

// Extends public "-Dana-": `toLowerCase()` runs before the replacement, so a
// character that only becomes [a-z] when lowercased (KELVIN SIGN -> "k") is
// kept rather than replaced by a hyphen.
test("[happy-1] lowercasing runs before replacement, so a character lowercasing into [a-z] is kept", async () => {
  await assertSuggests([["-Kate-@example.test", "kate"]]);
});

// Extends public "[happy-1] a stem trimmed to exactly USERNAME_MIN_LENGTH is
// not padded": the other side and both sides.
test("[happy-1] a stem of exactly three characters after trimming either side is not padded", async () => {
  await assertSuggests([
    ["abc-@example.test", "abc"],
    ["--abc--@example.test", "abc"],
    ["-a-b-@example.test", "a-b"],
    ["-x9_-@example.test", "x9_"],
  ]);
});

// Extends public happy-1 to every combination: every local part over
// {"-", "a", "B"} up to seven characters gives what the regex version gives.
test("[happy-1] every short local part of hyphens and letters gives the regex version's stem", async () => {
  await assertMatchesRegexVersion(
    allStrings(["-", "a", "B"], 7),
    "@example.test",
  );
});

// ---- happy-2: characters replaced by a hyphen at either end ---------------

// Extends public "[happy-2] characters replaced by a hyphen at either end are
// removed with it": other replaced characters and runs of them.
test("[happy-2] other replaced characters and runs of them at either end are removed", async () => {
  await assertSuggests([
    ["+dana+@example.test", "dana"],
    ["...dana...@example.test", "dana"],
    ["!#$dana%&'@example.test", "dana"],
    ["(dana)@example.test", "dana"],
    ["édanaé@example.test", "dana"],
    ["\u{1F600}dana\u{1F600}@example.test", "dana"],
  ]);
});

// Extends public "[happy-2] a mix of replaced characters and hyphens at either
// end is removed": other orders and longer alternations. A shortcut that trims
// hyphens before replacing characters leaves the hyphen a replaced character
// produced.
test("[happy-2] alternating replaced characters and hyphens at either end are removed", async () => {
  await assertSuggests([
    ["-+dana+-@example.test", "dana"],
    [".-.-dana-.-.@example.test", "dana"],
    ["+.-+.-dana-.+-.+@example.test", "dana"],
    ["-.dana@example.test", "dana"],
    ["dana.-@example.test", "dana"],
  ]);
});

// Extends public happy-2: replaced characters next to the name inside the
// stem become hyphens that stay.
test("[happy-2] replaced characters at the ends are removed and those inside become hyphens", async () => {
  await assertSuggests([
    [".rivers.dana+work.@example.test", "rivers-dana-work"],
    ["+-Rivers.Dana-+@example.test", "rivers-dana"],
  ]);
});

// Extends public happy-2 to every combination: every local part over
// {"-", ".", "+", "a"} up to six characters gives what the regex version gives.
test("[happy-2] every short local part of hyphens, replaced characters and letters gives the regex version's stem", async () => {
  await assertMatchesRegexVersion(
    allStrings(["-", ".", "+", "a"], 6),
    "@example.test",
  );
});

// ---- happy-3: the counter is appended to the trimmed stem -----------------

// Extends public "[happy-3] the collision counter is appended to the trimmed
// stem": more taken counters, other trimmed input.
test("[happy-3] the counter keeps counting past several taken values on the trimmed stem", async () => {
  const store = storeWithUsernames(["rivers", "rivers2", "rivers3", "rivers4"]);

  assert.equal(await store.suggest("---rivers-@example.test"), "rivers5");
});

// Extends public happy-3: the counter goes on the padded stem of a stem that
// trimming made short.
test("[happy-3] the counter is appended to a stem padded after trimming", async () => {
  const store = storeWithUsernames(["jo-user"]);

  assert.equal(await store.suggest("-jo-@example.test"), "jo-user2");
});

// Extends public happy-3: the counter goes on the "-user" stem of an
// all-hyphen local part.
test("[happy-3] the counter is appended to the -user stem of an all-hyphen local part", async () => {
  const store = storeWithUsernames(["-user", "-user2"]);

  assert.equal(await store.suggest("-----@example.test"), "-user3");
});

// Extends public happy-3: the untrimmed handle being taken does not matter,
// only the trimmed stem is looked up.
test("[happy-3] a taken untrimmed form does not count as a collision", async () => {
  const store = storeWithUsernames(["-dana-", "--dana--"]);

  assert.equal(await store.suggest("--dana--@example.test"), "dana");
});

// Extends public happy-3: the counter on a full-length trimmed stem that ends
// in a hyphen after truncation is cut back to the limit.
test("[happy-3] the counter on a 29-character trimmed stem fills the 30th character", async () => {
  const store = storeWithUsernames(["x".repeat(29)]);

  assert.equal(
    await store.suggest(`---${"x".repeat(29)}---@example.test`),
    `${"x".repeat(29)}2`,
  );
});

// Extends public "[happy-3] the last counter value is appended to the trimmed
// stem": a different stem and gaps are not filled out of order.
test("[happy-3] the lowest free counter is used on the trimmed stem", async () => {
  const store = storeWithUsernames(["ab-user", "ab-user2", "ab-user4"]);

  assert.equal(await store.suggest("--ab--@example.test"), "ab-user3");
});

// ---- happy-4: the random fallback uses the trimmed stem -------------------

// Extends public "[happy-4] the random fallback uses the trimmed stem": another
// stem with longer hyphen runs.
test("[happy-4] the random fallback uses the trimmed stem of a longer name", async () => {
  const store = storeWithUsernames([
    "rivers",
    ...Array.from({ length: 19 }, (_, i) => `rivers${i + 2}`),
  ]);

  assert.match(
    await store.suggest("-----rivers---@example.test"),
    /^rivers-[0-9a-f]{6}$/,
  );
});

// Extends public happy-4: the fallback on a stem padded after trimming.
test("[happy-4] the random fallback uses a padded stem left by trimming", async () => {
  const store = storeWithUsernames([
    "jo-user",
    ...Array.from({ length: 19 }, (_, i) => `jo-user${i + 2}`),
  ]);

  assert.match(
    await store.suggest("-jo-@example.test"),
    /^jo-user-[0-9a-f]{6}$/,
  );
});

// Extends public "[happy-4] the random fallback shortens a full-length trimmed
// stem": a full-length stem that truncation left ending in a hyphen keeps that
// hyphen out of the first 23 characters.
test("[happy-4] the random fallback shortens a truncated stem that ends in a hyphen", async () => {
  const store = storeWithUsernames([`${"x".repeat(29)}-`]);

  assert.match(
    await store.suggest(`--${"x".repeat(29)}-y@example.test`),
    /^x{23}-[0-9a-f]{6}$/,
  );
});

// Extends public happy-4: an interior hyphen inside the first 23 characters is
// kept by the fallback.
test("[happy-4] the random fallback keeps interior hyphens of the trimmed stem", async () => {
  const store = storeWithUsernames([
    "a--b",
    ...Array.from({ length: 19 }, (_, i) => `a--b${i + 2}`),
  ]);

  assert.match(
    await store.suggest("---a--b---@example.test"),
    /^a--b-[0-9a-f]{6}$/,
  );
});
