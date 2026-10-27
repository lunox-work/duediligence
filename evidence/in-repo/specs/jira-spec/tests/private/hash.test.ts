import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { specHash } from "../../src/spec.js";

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

/** sha256hex(s), as the spec defines it, computed with Node's own crypto. */
function sha256hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** What specHash(summary, descriptionText) must resolve to. */
function expectedHash(summary: string, descriptionText: string): string {
  return sha256hex(JSON.stringify([summary, descriptionText]));
}

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

// Extends "[happy-3] specHash of a plain summary and description is its known
// hash": a lookup of the three published hashes passes that; these are not in it.
test("[happy-3] specHash is sha256hex of JSON.stringify([summary, descriptionText]) for unpublished inputs", async () => {
  const inputs: [string, string][] = [
    ["Add logout", "Users can sign out."],
    ["Add login", "Users can sign in!"],
    ["Users can sign in.", "Add login"],
    ["Refactor client", "Split JiraClient into transport and mapping.\n\nNo behaviour change."],
    ["x", ""],
    ["", "x"],
    ["Ticket 27", "Read a Jira ticket's spec and fingerprint it"],
  ];
  for (const [summary, descriptionText] of inputs) {
    assert.equal(
      await specHash(summary, descriptionText),
      expectedHash(summary, descriptionText),
      `specHash(${JSON.stringify(summary)}, ${JSON.stringify(descriptionText)})`,
    );
  }
});

// Extends "[happy-3] specHash hashes non-ASCII and astral characters as UTF-8":
// characters JSON.stringify escapes must be hashed in their escaped form.
test("[happy-3] quotes, backslashes and control characters are hashed as JSON.stringify writes them", async () => {
  const inputs: [string, string][] = [
    ['say "hi"', 'a "quoted" word'],
    ["C:\\temp\\new", "back\\slash"],
    ["tab\there", "nul\u0000 and unit\u001f separator"],
    ["\u2028line sep", "para sep\u2029"],
    ["</script>", "<b>&amp;</b>"],
    ["日本語のチケット", "说明 — with an em dash"],
  ];
  for (const [summary, descriptionText] of inputs) {
    assert.equal(
      await specHash(summary, descriptionText),
      expectedHash(summary, descriptionText),
      `specHash(${JSON.stringify(summary)}, ${JSON.stringify(descriptionText)})`,
    );
  }
});

// Extends "[happy-3] specHash hashes non-ASCII and astral characters as UTF-8":
// JSON.stringify escapes a lone surrogate, so it is hashed as "\ud800", not as
// the U+FFFD a raw UTF-8 encoding would substitute.
test("[happy-3] a lone surrogate is hashed in the escaped form JSON.stringify gives it", async () => {
  const hash = await specHash("\ud800", "\udfff");
  assert.equal(hash, sha256hex('["\\ud800","\\udfff"]'));
  assert.notEqual(hash, sha256hex('["\ufffd","\ufffd"]'));
});

// Extends "[happy-3] specHash of a description with a newline is its known hash":
// long inputs.
test("[happy-3] long inputs hash to sha256hex of their JSON encoding", async () => {
  const summary = "Summary ".repeat(5_000);
  const descriptionText = "Line \u00e9\u{1F642}\n".repeat(20_000);
  assert.equal(
    await specHash(summary, descriptionText),
    expectedHash(summary, descriptionText),
  );
});

// Extends "[happy-4] the result has the hex digest's shape": a hex encoding that
// drops the leading zero of a byte below 0x10 gives fewer than 64 characters.
test("[happy-4] every byte is written as two hex digits, including leading zeros", async () => {
  // Find, deterministically, an input whose digest starts with a zero byte.
  let i = 0;
  while (!expectedHash(`leading-zero-${i}`, "").startsWith("00")) {
    i++;
  }
  const summary = `leading-zero-${i}`;
  const hash = await specHash(summary, "");
  assert.match(hash, HEX_DIGEST);
  assert.equal(hash, expectedHash(summary, ""));
});

// Extends "[happy-4] the shape holds for empty and very long inputs": many inputs.
test("[happy-4] forty different inputs all give 64 lowercase hex characters equal to the digest", async () => {
  for (let i = 0; i < 40; i++) {
    const summary = `ACME-${i}`;
    const descriptionText = "d".repeat(i);
    const hash = await specHash(summary, descriptionText);
    assert.match(hash, HEX_DIGEST);
    assert.equal(hash, expectedHash(summary, descriptionText));
  }
});

// Extends "[happy-5] the same inputs always give the same hash": interleaved with
// other inputs, so a cache keyed on one argument, or on the last call, fails.
test("[happy-5] the same inputs give the same hash when other calls come between", async () => {
  const first = await specHash("Add login", "Users can sign in.");
  const sameSummary = await specHash("Add login", "Users can sign out.");
  const sameDescription = await specHash("Add logout", "Users can sign in.");
  const swapped = await specHash("Users can sign in.", "Add login");
  const again = await specHash("Add login", "Users can sign in.");

  assert.equal(first, ADD_LOGIN_HASH);
  assert.equal(again, first);
  assert.equal(sameSummary, expectedHash("Add login", "Users can sign out."));
  assert.equal(sameDescription, expectedHash("Add logout", "Users can sign in."));
  assert.equal(swapped, expectedHash("Users can sign in.", "Add login"));
  assert.equal(new Set([first, sameSummary, sameDescription, swapped]).size, 4);
});

// Extends "[boundary-1] two empty strings still hash": near-empty inputs are not
// the empty hash, and the empty hash does not depend on earlier calls.
test("[boundary-1] near-empty inputs are not the empty hash, and the empty hash is stable", async () => {
  for (const [summary, descriptionText] of [
    [" ", ""],
    ["", " "],
    ["", "\n"],
    ["\u0000", ""],
  ] as [string, string][]) {
    const hash = await specHash(summary, descriptionText);
    assert.equal(hash, expectedHash(summary, descriptionText));
    assert.notEqual(hash, EMPTY_HASH);
  }
  assert.equal(await specHash("", ""), EMPTY_HASH);
});

// Extends "[boundary-2] concatenations that coincide still hash differently": an
// encoding that joins with a separator, or writes '","' without escaping, collides.
test("[boundary-2] separators that a naive join would use cannot make two pairs collide", async () => {
  const pairs: [string, string][] = [
    ['a","b', ""],
    ["a", "b"],
    ["a\u0000b", ""],
    ["a\nb\nc", ""],
    ["", "a\nb\nc"],
    ["a\nb", "c"],
    ["a", "b\nc"],
    ["a|b", ""],
    ["a,b", ""],
  ];
  const hashes = [];
  for (const [summary, descriptionText] of pairs) {
    const hash = await specHash(summary, descriptionText);
    assert.equal(hash, expectedHash(summary, descriptionText));
    hashes.push(hash);
  }
  assert.equal(new Set(hashes).size, pairs.length);
});

// Extends "[boundary-3] a leading space in the summary is significant": other
// whitespace, in either argument, with the exact digest.
test("[boundary-3] tabs, newlines and non-breaking spaces are hashed as given", async () => {
  const pairs: [string, string][] = [
    ["Add login", "Users can sign in."],
    ["Add login ", "Users can sign in."],
    ["Add login\n", "Users can sign in."],
    ["Add\tlogin", "Users can sign in."],
    ["Add  login", "Users can sign in."],
    ["Add\u00a0login", "Users can sign in."],
    ["Add login", "\tUsers can sign in."],
    ["Add login", "Users can sign in.\n"],
    ["Add login", "Users  can sign in."],
  ];
  const hashes = [];
  for (const [summary, descriptionText] of pairs) {
    const hash = await specHash(summary, descriptionText);
    assert.equal(hash, expectedHash(summary, descriptionText));
    hashes.push(hash);
  }
  assert.equal(new Set(hashes).size, pairs.length);
});

// Extends "[boundary-4] composed and decomposed forms of the same text hash
// differently": in the description, and under compatibility normalisation.
test("[boundary-4] no Unicode normalisation of any form is applied before hashing", async () => {
  const pairs: [string, string][] = [
    ["Café", "naïve"],
    ["Café", "nai\u0308ve"],
    ["Cafe\u0301", "naïve"],
    ["\ufb01le", ""],
    ["file", ""],
    ["\uff21", ""],
    ["A", ""],
    ["\u212b", ""],
    ["\u00c5", ""],
  ];
  const hashes = [];
  for (const [summary, descriptionText] of pairs) {
    const hash = await specHash(summary, descriptionText);
    assert.equal(hash, expectedHash(summary, descriptionText));
    hashes.push(hash);
  }
  assert.equal(new Set(hashes).size, pairs.length);
});

// Extends "[unhappy-1] an undefined summary rejects ..." and "a numeric summary
// rejects ...": other non-string summaries. A bigint makes JSON.stringify throw
// a TypeError of its own, which does not name the argument.
test("[unhappy-1] other non-string summaries reject with a TypeError naming summary", async () => {
  for (const summary of [null, true, 0, {}, [], ["Add login"], 1n, Symbol("summary"), () => "x"]) {
    await assertRejectsNaming(
      specHashUnchecked(summary, "Users can sign in."),
      "summary",
    );
  }
});

// Extends "[unhappy-1] a null descriptionText rejects ..." and "an object
// descriptionText rejects ...": other non-string descriptions.
test("[unhappy-1] other non-string descriptionTexts reject with a TypeError naming descriptionText", async () => {
  for (const descriptionText of [undefined, 0, false, [], ["Users can sign in."], 1n, Symbol("d")]) {
    await assertRejectsNaming(
      specHashUnchecked("Add login", descriptionText),
      "descriptionText",
    );
  }
});

// Extends the [unhappy-1] public tests: the call returns a promise that rejects,
// rather than throwing synchronously.
test("[unhappy-1] a non-string argument rejects the returned promise rather than throwing", async () => {
  let summaryCall: Promise<string> | undefined;
  let descriptionCall: Promise<string> | undefined;
  assert.doesNotThrow(() => {
    summaryCall = specHashUnchecked(42, "");
    descriptionCall = specHashUnchecked("", null);
  });
  assert.ok(summaryCall instanceof Promise);
  assert.ok(descriptionCall instanceof Promise);
  await Promise.all([
    assertRejectsNaming(summaryCall, "summary"),
    assertRejectsNaming(descriptionCall, "descriptionText"),
  ]);
});

// Extends "[concurrency-1] many interleaved calls each resolve to their own
// input's hash": fifty distinct inputs of very different sizes.
test("[concurrency-1] fifty distinct overlapping calls of different sizes each resolve to their own hash", async () => {
  const inputs = Array.from({ length: 50 }, (_, i): [string, string] => [
    `ACME-${i} summary`,
    `${i}:`.repeat(i % 2 === 0 ? 20_000 : 1),
  ]);
  const results = await Promise.all(
    inputs.map(([summary, descriptionText]) => specHash(summary, descriptionText)),
  );
  assert.deepEqual(
    results,
    inputs.map(([summary, descriptionText]) => expectedHash(summary, descriptionText)),
  );
});

// Extends "[concurrency-1] overlapping calls each resolve to their own input's
// hash": a rejecting call among them does not disturb the others.
test("[concurrency-1] a rejecting call overlapping valid ones leaves their hashes intact", async () => {
  const results = await Promise.allSettled([
    specHash("Add login", "Users can sign in."),
    specHashUnchecked(42, ""),
    specHash("", ""),
    specHashUnchecked("", null),
    specHash("Fix the build", "Line one\nLine two"),
  ]);

  assert.deepEqual(
    results.map((result) => (result.status === "fulfilled" ? result.value : "rejected")),
    [ADD_LOGIN_HASH, "rejected", EMPTY_HASH, "rejected", FIX_BUILD_HASH],
  );
  const [, summaryResult, , descriptionResult] = results;
  assert.ok(summaryResult?.status === "rejected");
  assert.ok(summaryResult.reason instanceof TypeError);
  assert.ok(String(summaryResult.reason.message).includes("summary"));
  assert.ok(descriptionResult?.status === "rejected");
  assert.ok(descriptionResult.reason instanceof TypeError);
  assert.ok(String(descriptionResult.reason.message).includes("descriptionText"));
});
