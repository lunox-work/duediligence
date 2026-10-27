import assert from "node:assert/strict";
import { test } from "node:test";

import { ISSUE_FIELDS } from "../src/mapping.js";
import { SPEC_FIELDS, specHash } from "../src/spec.js";

/** specHash("Add login", "Users can sign in.") */
const ADD_LOGIN_HASH =
  "8a71edd3e48141d9e972a05a5e3315c9f55609fc4cf20abdd24dd1e606fb9e14";
/** specHash("Fix the build", "Line one\nLine two") */
const FIX_BUILD_HASH =
  "72cf51e53aee072c65b91b674e5d50ac48290bacff428cc88d992e91a1a95448";
/** specHash("", "") */
const EMPTY_HASH =
  "439083f38956ba51ece90631552c6ea23c5c29570d3d5710e408e77e01ba7375";

const HEX_DIGEST = /^[0-9a-f]{64}$/;

/** Calls specHash with arguments the types would not allow. */
function specHashUnchecked(summary: unknown, descriptionText: unknown) {
  return specHash(summary as string, descriptionText as string);
}

/** Asserts a rejection with a TypeError whose message names `argument`. */
async function assertRejectsNaming(
  promise: Promise<string>,
  argument: string,
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof TypeError, `expected a TypeError, got ${error}`);
    assert.ok(
      error.message.includes(argument),
      `message ${JSON.stringify(error.message)} does not name ${argument}`,
    );
    return true;
  });
}

test("[happy-1] SPEC_FIELDS is the four spec fields, in order", () => {
  assert.deepEqual(
    [...SPEC_FIELDS],
    ["summary", "description", "issuetype", "updated"],
  );
});

test("[happy-1] SPEC_FIELDS has exactly four entries, none repeated", () => {
  assert.equal(SPEC_FIELDS.length, 4);
  assert.equal(new Set(SPEC_FIELDS).size, 4);
});

test("[happy-2] ISSUE_FIELDS is unchanged by this feature", () => {
  assert.deepEqual(
    [...ISSUE_FIELDS],
    [
      "summary",
      "status",
      "assignee",
      "priority",
      "issuetype",
      "labels",
      "created",
      "updated",
      "duedate",
      "parent",
      "project",
    ],
  );
});

test("[happy-2] ISSUE_FIELDS stays at 11 fields and does not gain description", () => {
  assert.equal(ISSUE_FIELDS.length, 11);
  assert.ok(!ISSUE_FIELDS.includes("description"));
});

test("[happy-3] specHash of a plain summary and description is its known hash", async () => {
  assert.equal(await specHash("Add login", "Users can sign in."), ADD_LOGIN_HASH);
});

test("[happy-3] specHash of a description with a newline is its known hash", async () => {
  assert.equal(await specHash("Fix the build", "Line one\nLine two"), FIX_BUILD_HASH);
});

test("[happy-3] specHash hashes non-ASCII and astral characters as UTF-8", async () => {
  assert.equal(
    await specHash("Café", "naïve \u{1F642}"),
    "a93b9fdb1a30dfc0a6307d99102751b73870085e7313125e285a213000c5ee22",
  );
});

test("[boundary-1] two empty strings still hash", async () => {
  assert.equal(await specHash("", ""), EMPTY_HASH);
});

test("[boundary-1] an empty summary alone does not give the empty hash", async () => {
  const hash = await specHash("", "Users can sign in.");
  assert.match(hash, HEX_DIGEST);
  assert.notEqual(hash, EMPTY_HASH);
  assert.notEqual(hash, ADD_LOGIN_HASH);
});

test("[happy-4] the result has the hex digest's shape", async () => {
  assert.match(await specHash("Add login", "Users can sign in."), HEX_DIGEST);
});

test("[happy-4] the shape holds for empty and very long inputs", async () => {
  assert.match(await specHash("", ""), HEX_DIGEST);
  assert.match(await specHash("x".repeat(100_000), "y\n".repeat(50_000)), HEX_DIGEST);
});

test("[happy-5] the same inputs always give the same hash", async () => {
  const first = await specHash("Add login", "Users can sign in.");
  const second = await specHash("Add login", "Users can sign in.");
  assert.equal(first, second);
});

test("[happy-5] the same non-ASCII inputs give the same hash every time", async () => {
  const results = [];
  for (let i = 0; i < 5; i++) {
    results.push(await specHash("Café", "naïve \u{1F642}"));
  }
  assert.equal(new Set(results).size, 1);
});

test("[boundary-2] moving text across the summary/description boundary changes the hash", async () => {
  assert.equal(
    await specHash("a\nb", "c"),
    "869e4af18a4b82a0856c905a9c25769eb10717cde11b56afaffb0ea154a2eb0b",
  );
  assert.equal(
    await specHash("a", "b\nc"),
    "ba97b7d634f693473f1d2cbc1958df5d48dcdfcda942d8ce41a25a5c3651e736",
  );
});

test("[boundary-2] concatenations that coincide still hash differently", async () => {
  const ab = await specHash("ab", "");
  const aThenB = await specHash("a", "b");
  const thenAb = await specHash("", "ab");
  assert.equal(new Set([ab, aThenB, thenAb]).size, 3);
});

test("[boundary-3] a trailing space in the description is significant", async () => {
  const padded = await specHash("Add login", "Users can sign in. ");
  assert.equal(
    padded,
    "cdb938f0f89d645b195ccc32746bf778a91b6f27e4555621a422e3a1028ef27a",
  );
  assert.notEqual(padded, await specHash("Add login", "Users can sign in."));
});

test("[boundary-3] a leading space in the summary is significant", async () => {
  assert.notEqual(
    await specHash(" Add login", "Users can sign in."),
    await specHash("Add login", "Users can sign in."),
  );
});

test("[boundary-4] composed and decomposed forms of the same text hash differently", async () => {
  // "Café" with U+00E9, and with "e" followed by U+0301 COMBINING ACUTE ACCENT.
  assert.notEqual(await specHash("Café", ""), await specHash("Café", ""));
});

test("[boundary-4] line endings are not normalised before hashing", async () => {
  assert.notEqual(
    await specHash("Fix the build", "Line one\r\nLine two"),
    await specHash("Fix the build", "Line one\nLine two"),
  );
});

test("[unhappy-1] an undefined summary rejects with a TypeError naming summary", async () => {
  await assertRejectsNaming(specHashUnchecked(undefined, ""), "summary");
});

test("[unhappy-1] a numeric summary rejects with a TypeError naming summary", async () => {
  await assertRejectsNaming(specHashUnchecked(42, ""), "summary");
});

test("[unhappy-1] a null descriptionText rejects with a TypeError naming descriptionText", async () => {
  await assertRejectsNaming(specHashUnchecked("", null), "descriptionText");
});

test("[unhappy-1] an object descriptionText rejects with a TypeError naming descriptionText", async () => {
  await assertRejectsNaming(specHashUnchecked("", {}), "descriptionText");
});

test("[concurrency-1] overlapping calls each resolve to their own input's hash", async () => {
  const results = await Promise.all([
    specHash("Add login", "Users can sign in."),
    specHash("", ""),
    specHash("Fix the build", "Line one\nLine two"),
  ]);
  assert.deepEqual(results, [ADD_LOGIN_HASH, EMPTY_HASH, FIX_BUILD_HASH]);
});

test("[concurrency-1] many interleaved calls each resolve to their own input's hash", async () => {
  const inputs: [string, string, string][] = [
    ["Add login", "Users can sign in.", ADD_LOGIN_HASH],
    ["", "", EMPTY_HASH],
    ["Fix the build", "Line one\nLine two", FIX_BUILD_HASH],
  ];
  const calls = Array.from({ length: 30 }, (_, i) => inputs[i % inputs.length]!);
  const results = await Promise.all(
    calls.map(([summary, descriptionText]) => specHash(summary, descriptionText)),
  );
  assert.deepEqual(
    results,
    calls.map(([, , hash]) => hash),
  );
});
