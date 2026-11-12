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
    const suggested = await store.suggest(email);
    assert.equal(
      suggested,
      handle,
      `suggest(<${email.length} characters>)`,
    );
  }
}

const x = (n: number) => "x".repeat(n);
const h = (n: number) => "-".repeat(n);

// ---- unhappy-1: a long interior hyphen run --------------------------------

// Extends public "[unhappy-1] a long interior hyphen run keeps the hyphens up
// to the limit": other characters after the run, a longer name before it, and
// a longer run.
test("[unhappy-1] a long interior run before other characters keeps the hyphens up to the limit", async () => {
  await assertSuggests([
    [`a${h(100000)}1@example.test`, `a${h(29)}`],
    [`a${h(100000)}Z@example.test`, `a${h(29)}`],
    [`dana${h(100000)}b@example.test`, `dana${h(26)}`],
    [`a${h(200000)}b@example.test`, `a${h(29)}`],
  ]);
});

// Extends public "[unhappy-1] a long hyphen run followed by an underscore
// keeps the hyphens up to the limit": the long run is also followed by a long
// trailing run, preceded by a long leading run, or written as replaced
// characters.
test("[unhappy-1] a long interior run between long end runs keeps the hyphens up to the limit", async () => {
  await assertSuggests([
    [`a${h(100000)}b${h(100000)}@example.test`, `a${h(29)}`],
    [`${h(100000)}a${h(100000)}b@example.test`, `a${h(29)}`],
    [`a${"-.".repeat(50000)}b@example.test`, `a${h(29)}`],
    [`a${h(100000)}b`, `a${h(29)}`],
  ]);
});

// Extends public unhappy-1: where the name fills the budget, none or only one
// hyphen of the long interior run survives truncation.
test("[unhappy-1] a long interior run after a name near the limit is cut by truncation", async () => {
  await assertSuggests([
    [`${x(29)}${h(100000)}y@example.test`, `${x(29)}-`],
    [`${x(30)}${h(100000)}y@example.test`, x(30)],
  ]);
});

// ---- unhappy-2: a long hyphen run on both sides of the name ---------------

// Extends public "[unhappy-2] long hyphen runs on both sides of the name are
// trimmed": a long run on one side only, and unequal runs. A trim that only
// scans a bounded window at each end fails here.
test("[unhappy-2] a long hyphen run on one side only is trimmed", async () => {
  await assertSuggests([
    [`${h(100000)}dana@example.test`, "dana"],
    [`dana${h(100000)}@example.test`, "dana"],
    [`${h(100000)}dana---@example.test`, "dana"],
    [`---dana${h(150000)}@example.test`, "dana"],
  ]);
});

// Extends public "[unhappy-2] long runs mixing hyphens and replaced characters
// on both sides are trimmed": other names between long runs, which keep their
// interior hyphens, underscores, padding and truncation.
test("[unhappy-2] other names between long hyphen runs are trimmed, padded and truncated as usual", async () => {
  await assertSuggests([
    [`${h(100000)}a--b${h(100000)}@example.test`, "a--b"],
    [`${h(100000)}_dana_${h(100000)}@example.test`, "_dana_"],
    [`${h(100000)}jo${h(100000)}@example.test`, "jo-user"],
    [`${h(100000)}${x(40)}${h(100000)}@example.test`, x(30)],
    [`${h(100000)}${x(29)}-y${h(100000)}@example.test`, `${x(29)}-`],
    [`${h(100000)}Dana${h(100000)}`, "dana"],
  ]);
});

// ---- unhappy-3: a long all-hyphen local part ------------------------------

// Extends public "[unhappy-3] a long all-hyphen local part becomes -user":
// other lengths, replaced characters, and hyphens after the "@".
test("[unhappy-3] other long all-hyphen and all-replaced local parts become -user", async () => {
  await assertSuggests([
    [`${h(100001)}@example.test`, "-user"],
    [`${h(250000)}@example.test`, "-user"],
    [`${".".repeat(100000)}@example.test`, "-user"],
    [`${"-.".repeat(50000)}@example.test`, "-user"],
    [`${h(100000)}@${h(100000)}`, "-user"],
  ]);
});

// Extends public "[unhappy-3] a long all-hyphen input without @ becomes
// -user": the long run wraps one character that is itself replaced, or is
// followed by a domain-like part after the "@".
test("[unhappy-3] long all-hyphen inputs around replaced characters become -user", async () => {
  await assertSuggests([
    [`${h(50000)} ${h(50000)}`, "-user"],
    [`${h(50000)}+${h(50000)}@example.test`, "-user"],
    [`${h(100000)}@dana`, "-user"],
  ]);
});
