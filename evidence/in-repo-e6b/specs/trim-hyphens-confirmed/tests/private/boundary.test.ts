import assert from "node:assert/strict";
import { test } from "node:test";

import { createProfileStore } from "../../src/emails.js";
import { createFakeEmailDb } from "../fake-email-db.js";

function emptyStore() {
  return createProfileStore(createFakeEmailDb().db);
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
  emails: readonly string[],
): Promise<void> {
  for (const email of emails) {
    const store = emptyStore();
    assert.equal(
      await store.suggest(email),
      regexHandleBase(email),
      `suggest(${JSON.stringify(email)})`,
    );
  }
}

const x = (n: number) => "x".repeat(n);
const h = (n: number) => "-".repeat(n);

// ---- boundary-1: a leading space becomes a hyphen and is trimmed ----------

// Extends public "[boundary-1] a leading space becomes a hyphen and is
// trimmed": several spaces, other whitespace, and a space next to a hyphen.
test("[boundary-1] other leading whitespace becomes a hyphen and is trimmed", async () => {
  await assertSuggests([
    ["   dana@example.test", "dana"],
    ["\tdana@example.test", "dana"],
    ["\ndana@example.test", "dana"],
    [" dana@example.test", "dana"],
    [" -dana@example.test", "dana"],
    ["- dana@example.test", "dana"],
    [" - - dana@example.test", "dana"],
  ]);
});

// Extends public "[boundary-1] whitespace at both ends becomes hyphens and is
// trimmed": a leading space on a short or uppercase name.
test("[boundary-1] a leading space on a short or uppercase name is trimmed before padding", async () => {
  await assertSuggests([
    [" jo@example.test", "jo-user"],
    [" DANA @example.test", "dana"],
    [" a b @example.test", "a-b"],
  ]);
});

// ---- boundary-2: interior hyphens are neither removed nor collapsed -------

// Extends public "[boundary-2] interior doubled hyphens are kept": longer runs
// and several runs in one stem. A shortcut that collapses hyphens fails here.
test("[boundary-2] longer and repeated interior hyphen runs are kept as they are", async () => {
  await assertSuggests([
    ["a---b@example.test", "a---b"],
    ["a-----b@example.test", "a-----b"],
    ["a-b--c---d@example.test", "a-b--c---d"],
    ["-a--b-@example.test", "a--b"],
    ["--a----b--@example.test", "a----b"],
  ]);
});

// Extends public "[boundary-2] interior hyphens next to a replaced character
// are not collapsed": other placements of replaced characters among hyphens.
test("[boundary-2] replaced characters beside interior hyphens add a hyphen each run", async () => {
  await assertSuggests([
    ["a.-b@example.test", "a--b"],
    ["a-.b@example.test", "a--b"],
    ["a.-.-.b@example.test", "a-----b"],
    ["a..-..b@example.test", "a---b"],
    ["a..b@example.test", "a-b"],
  ]);
});

// Extends public boundary-2 to every combination: every local part over
// {"-", ".", "a", "b"} up to six characters gives what the regex version gives.
test("[boundary-2] every short local part with interior hyphens gives the regex version's stem", async () => {
  await assertMatchesRegexVersion(
    allStrings(["-", ".", "a", "b"], 6).map((s) => `a${s}b@example.test`),
  );
});

// ---- boundary-3: underscores are not trimmed, only hyphens ----------------

// Extends public "[boundary-3] underscores at either end are kept": longer
// underscore runs, and underscores inside hyphens. A shortcut that trims every
// non-alphanumeric character from the ends fails here.
test("[boundary-3] underscore runs at either end are kept while hyphens beyond them go", async () => {
  await assertSuggests([
    ["__dana__@example.test", "__dana__"],
    ["-_dana_-@example.test", "_dana_"],
    ["--__dana__--@example.test", "__dana__"],
    ["_-dana-_@example.test", "_-dana-_"],
    ["___@example.test", "___"],
  ]);
});

// Extends public "[boundary-3] hyphens around an underscore are trimmed and
// the short stem padded": other short underscore stems.
test("[boundary-3] short underscore stems left by trimming are padded", async () => {
  await assertSuggests([
    ["_@example.test", "_-user"],
    ["__@example.test", "__-user"],
    ["--_--@example.test", "_-user"],
    ["._.@example.test", "_-user"],
    ["-_a-@example.test", "_a-user"],
    ["-_-_-@example.test", "_-_"],
  ]);
});

// Extends public boundary-3 to every combination: every local part over
// {"-", "_", "a"} up to seven characters gives what the regex version gives.
test("[boundary-3] every short local part of hyphens, underscores and letters gives the regex version's stem", async () => {
  await assertMatchesRegexVersion(
    allStrings(["-", "_", "a"], 7).map((s) => `${s}@example.test`),
  );
});

// ---- boundary-4: all-hyphen or empty local part becomes "-user" -----------

// Extends public "[boundary-4] an all-hyphen or all-replaced local part
// becomes -user": other lengths and mixes of hyphens and replaced characters.
// The result keeps its leading hyphen: "user" alone is wrong.
test("[boundary-4] other all-hyphen and all-replaced local parts become -user", async () => {
  await assertSuggests([
    ["--@example.test", "-user"],
    ["----------@example.test", "-user"],
    ["-.-@example.test", "-user"],
    [".-.@example.test", "-user"],
    ["+@example.test", "-user"],
    [" @example.test", "-user"],
    ["- . + -@example.test", "-user"],
  ]);
});

// Extends public "[boundary-4] an empty local part or empty input becomes
// -user": other inputs whose local part is empty.
test("[boundary-4] other inputs with an empty local part become -user", async () => {
  await assertSuggests([
    ["@", "-user"],
    ["@@", "-user"],
    ["@dana", "-user"],
    ["@dana@example.test", "-user"],
    ["-", "-user"],
    ["---", "-user"],
    [" ", "-user"],
  ]);
});

// ---- boundary-5: a stem shortened by trimming is padded -------------------

// Extends public "[boundary-5] a two-letter stem shortened by trimming is
// padded": other two-character stems and longer runs on both sides.
test("[boundary-5] other two-character stems shortened by trimming are padded", async () => {
  await assertSuggests([
    ["--jo--@example.test", "jo-user"],
    ["ab--@example.test", "ab-user"],
    ["--ab@example.test", "ab-user"],
    ["-a1-@example.test", "a1-user"],
    [".jo.@example.test", "jo-user"],
    ["-JO-@example.test", "jo-user"],
  ]);
});

// Extends public "[boundary-5] a one-letter stem and a stem one short of the
// minimum are padded": one-character stems on either side.
test("[boundary-5] one-character stems shortened by trimming are padded", async () => {
  await assertSuggests([
    ["a-@example.test", "a-user"],
    ["-a@example.test", "a-user"],
    ["a@example.test", "a-user"],
    ["---7---@example.test", "7-user"],
  ]);
});

// Extends public boundary-5: a stem of three that keeps an interior hyphen is
// not padded, while a hyphen trimmed from four characters pads.
test("[boundary-5] padding depends on the length after trimming, not before", async () => {
  await assertSuggests([
    ["a-b-@example.test", "a-b"],
    ["-a-b@example.test", "a-b"],
    ["abc-@example.test", "abc"],
    ["-ab-@example.test", "ab-user"],
  ]);
});

// ---- boundary-6: local part extraction is unchanged -----------------------

// Extends public "[boundary-6] input without @ is used whole": other inputs
// without "@", including uppercase and long ones.
test("[boundary-6] other inputs without @ are used whole", async () => {
  await assertSuggests([
    ["Rivers.Dana", "rivers-dana"],
    ["--jo--", "jo-user"],
    ["a--b", "a--b"],
    [x(40), x(30)],
    [`${h(3)}${x(31)}`, x(30)],
  ]);
});

// Extends public "[boundary-6] input without @ is trimmed, and only text
// before the first @ is used": more "@" signs and hyphens after the first one.
test("[boundary-6] only the text before the first @ is trimmed and used", async () => {
  await assertSuggests([
    ["dana@", "dana"],
    ["-dana-@", "dana"],
    ["jo@x@y", "jo-user"],
    ["--a@--b@c", "a-user"],
    ["a-b@c-d@e", "a-b"],
    ["dana@---@---", "dana"],
    ["-rivers-@-dana-@example.test", "rivers"],
  ]);
});

// Extends public boundary-6 to every combination: every input over
// {"-", "a", "@", "."} up to six characters gives what the regex version gives.
test("[boundary-6] every short input mixing @, hyphens and letters gives the regex version's stem", async () => {
  await assertMatchesRegexVersion(allStrings(["-", "a", "@", "."], 6));
});

// ---- boundary-7: leading hyphens do not use up the length budget ----------

// Extends public "[boundary-7] leading hyphens do not use up the length
// budget": other counts of leading hyphens, and longer names. A shortcut that
// truncates before trimming fails here.
test("[boundary-7] other counts of leading hyphens before a long name do not use up the budget", async () => {
  await assertSuggests([
    [`-${x(30)}@example.test`, x(30)],
    [`-${x(31)}@example.test`, x(30)],
    [`${h(29)}${x(30)}@example.test`, x(30)],
    [`${h(30)}${x(30)}@example.test`, x(30)],
    [`${h(31)}${x(30)}@example.test`, x(30)],
    [`${h(200)}${x(45)}@example.test`, x(30)],
  ]);
});

// Extends public "[boundary-7] leading hyphens longer than the whole budget are
// all trimmed": a short stem after many leading hyphens is padded, and leading
// replaced characters count the same.
test("[boundary-7] a short stem after more leading hyphens than the budget is kept and padded", async () => {
  await assertSuggests([
    [`${h(31)}ab@example.test`, "ab-user"],
    [`${h(60)}abcd@example.test`, "abcd"],
    [`${".".repeat(40)}${x(30)}@example.test`, x(30)],
    [`${"-.".repeat(20)}${x(30)}@example.test`, x(30)],
  ]);
});

// Extends public boundary-7 to more combinations: every count of leading
// hyphens 0..35 with every name length 0..35 gives the regex version's stem.
test("[boundary-7] every count of leading hyphens before every name length gives the regex version's stem", async () => {
  const emails: string[] = [];
  for (let lead = 0; lead <= 35; lead += 1) {
    for (let name = 0; name <= 35; name += 1) {
      emails.push(`${h(lead)}${x(name)}@example.test`);
    }
  }
  await assertMatchesRegexVersion(emails);
});

// ---- boundary-8: trailing hyphens past the limit are dropped --------------

// Extends public "[boundary-8] trailing hyphens past the limit are dropped":
// other counts of trailing hyphens after names at and past the limit.
test("[boundary-8] other counts of trailing hyphens past the limit are dropped", async () => {
  await assertSuggests([
    [`${x(30)}-@example.test`, x(30)],
    [`${x(30)}${h(100)}@example.test`, x(30)],
    [`${x(31)}${h(5)}@example.test`, x(30)],
    [`${h(5)}${x(30)}${h(5)}@example.test`, x(30)],
  ]);
});

// Extends public "[boundary-8] trailing hyphens straddling the limit are
// trimmed before truncation": a 29-character name and shorter. Trimming before
// truncation means no hyphen of the trailing run is kept.
test("[boundary-8] trailing hyphens straddling the limit after shorter names are all trimmed", async () => {
  await assertSuggests([
    [`${x(29)}--@example.test`, x(29)],
    [`${x(29)}${h(10)}@example.test`, x(29)],
    [`${x(27)}${h(4)}@example.test`, x(27)],
    [`${x(25)}${h(30)}@example.test`, x(25)],
    [`${x(29)}.-.@example.test`, x(29)],
  ]);
});

// Extends public boundary-8 to more combinations: every name length 0..35 with
// every count of trailing hyphens 0..35 gives the regex version's stem.
test("[boundary-8] every name length before every count of trailing hyphens gives the regex version's stem", async () => {
  const emails: string[] = [];
  for (let name = 0; name <= 35; name += 1) {
    for (let trail = 0; trail <= 35; trail += 1) {
      emails.push(`${x(name)}${h(trail)}@example.test`);
    }
  }
  await assertMatchesRegexVersion(emails);
});

// ---- boundary-9: truncation can leave a trailing hyphen -------------------

// Extends public "[boundary-9] truncation can leave a trailing hyphen": longer
// interior runs cut by the limit. A shortcut that trims again after truncation
// fails here.
test("[boundary-9] truncation inside an interior hyphen run keeps the hyphens it reaches", async () => {
  for (const [email, handle] of [
    [`${x(29)}--y@example.test`, `${x(29)}-`],
    [`${x(25)}-----y@example.test`, `${x(25)}-----`],
    [`${x(25)}${h(10)}y@example.test`, `${x(25)}${h(5)}`],
    [`${x(20)}${h(20)}y@example.test`, `${x(20)}${h(10)}`],
    [`${x(29)}.y@example.test`, `${x(29)}-`],
  ] as const) {
    const suggested = await emptyStore().suggest(email);
    assert.equal(suggested, handle, `suggest(${JSON.stringify(email)})`);
    assert.equal(suggested.length, 30);
  }
});

// Extends public "[boundary-9] truncation after trimming leading hyphens can
// leave a trailing hyphen": more leading hyphens, and trailing hyphens after
// the cut that trimming removed first.
test("[boundary-9] truncation after trimming both ends can leave a trailing hyphen", async () => {
  for (const [email, handle] of [
    [`${h(100)}${x(29)}-y@example.test`, `${x(29)}-`],
    [`${h(3)}${x(29)}-y${h(3)}@example.test`, `${x(29)}-`],
    [`${h(3)}${x(28)}--yy--@example.test`, `${x(28)}--`],
  ] as const) {
    const suggested = await emptyStore().suggest(email);
    assert.equal(suggested, handle, `suggest(${JSON.stringify(email)})`);
    assert.equal(suggested.length, 30);
  }
});

// Extends public boundary-9 to more combinations: every split of names around
// one interior hyphen run near the limit gives the regex version's stem.
test("[boundary-9] every interior hyphen run near the limit gives the regex version's stem", async () => {
  const emails: string[] = [];
  for (let name = 20; name <= 31; name += 1) {
    for (let run = 1; run <= 12; run += 1) {
      for (const tail of ["y", "yy", "y-", ""]) {
        emails.push(`-${x(name)}${h(run)}${tail}@example.test`);
      }
    }
  }
  await assertMatchesRegexVersion(emails);
});

// ---- boundary-10: repeating a call gives the same result ------------------

// Extends public "[boundary-10] repeating a call gives the same result": more
// repetitions, of several inputs. A trim that kept state between calls (a
// shared /g or /y regex and its lastIndex) gives a different answer on a
// later call.
test("[boundary-10] many repeated calls on several inputs each give the same result", async () => {
  const store = emptyStore();

  for (let i = 0; i < 10; i += 1) {
    assert.equal(await store.suggest("-dana-@example.test"), "dana");
    assert.equal(await store.suggest("--jo--@example.test"), "jo-user");
    assert.equal(await store.suggest("a--b@example.test"), "a--b");
    assert.equal(await store.suggest("_dana_@example.test"), "_dana_");
  }
});

// Extends public "[boundary-10] repeated calls interleaved with other inputs
// give the same result": interleaving with long and truncated inputs, and
// across separate stores.
test("[boundary-10] repeated calls interleaved with long and truncated inputs give the same result", async () => {
  const first = emptyStore();
  const second = emptyStore();

  assert.equal(await first.suggest("-dana-@example.test"), "dana");
  assert.equal(
    await first.suggest(`${x(29)}-y@example.test`),
    `${x(29)}-`,
  );
  assert.equal(await second.suggest("-dana-@example.test"), "dana");
  assert.equal(await first.suggest(`${h(1000)}@example.test`), "-user");
  assert.equal(await first.suggest("-dana-@example.test"), "dana");
  assert.equal(await second.suggest(`${h(5)}${x(30)}@example.test`), x(30));
  assert.equal(await second.suggest("-dana-@example.test"), "dana");
  assert.equal(await first.suggest(""), "-user");
  assert.equal(await first.suggest("-dana-@example.test"), "dana");
});

// Extends public boundary-10: the same input repeated in reverse order of a
// sequence gives the same results as in forward order.
test("[boundary-10] a sequence of calls gives the same results in reverse order", async () => {
  const inputs: ReadonlyArray<readonly [string, string]> = [
    ["-dana-@example.test", "dana"],
    ["---@example.test", "-user"],
    ["a-.-b@example.test", "a---b"],
    ["-_-@example.test", "_-user"],
    [" dana@example.test", "dana"],
  ];
  const store = emptyStore();

  for (const [email, handle] of inputs) {
    assert.equal(await store.suggest(email), handle);
  }
  for (const [email, handle] of [...inputs].reverse()) {
    assert.equal(await store.suggest(email), handle);
  }
});
