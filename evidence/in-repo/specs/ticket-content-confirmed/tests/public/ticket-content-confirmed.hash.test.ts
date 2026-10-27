import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_ISSUE_TYPE, TICKET_LIMITS, ticketSpecHash } from "../src/ticket.js";

/**
 * ticketSpecHash is the Jira package's pricingSpecHash: SHA-256 of the JSON
 * array of the three normalized strings, as lowercase hex. Every stored hash
 * must stay valid, so the known fingerprints are pinned verbatim.
 */

const STORY = "3b83fc961d8b052c4ebb2269255f29a3e901b27eb21f7452ea5f9ac5c5d77444";
const BUG = "7e3c32427cf03005b0304866833c254926f931bbe4beedea60c2e6297afbacc2";
const FIX_IT = "cddb635f134a4d5762ecb6231a36db6d93e45e613c8fc8c2d19837e5aaf6c16c";
const EMPTY = "799c55d702efedb7750db18b36386fc3a3f4be7dddcfb649adeb41a3ed0da228";
const HEX_64 = /^[0-9a-f]{64}$/;

test("[happy-5] known tickets resolve to their known fingerprints", async () => {
  assert.equal(await ticketSpecHash("Add export", "Adds CSV.", "Story"), STORY);
  assert.equal(await ticketSpecHash("Add export", "Adds CSV.", "Bug"), BUG);
  assert.equal(await ticketSpecHash("Fix it", "", "Task"), FIX_IT);
});

test("[happy-5] every known fingerprint is 64 lowercase hex characters", async () => {
  for (const hash of [
    await ticketSpecHash("Add export", "Adds CSV.", "Story"),
    await ticketSpecHash("Add export", "Adds CSV.", "Bug"),
    await ticketSpecHash("Fix it", "", "Task"),
  ]) {
    assert.match(hash, HEX_64);
  }
});

test("[boundary-3] an entirely empty ticket still hashes", async () => {
  const hash = await ticketSpecHash("", "", "");
  assert.equal(hash, EMPTY);
  assert.match(hash, HEX_64);
});

test("[boundary-3] a whitespace-only ticket hashes like the empty ticket", async () => {
  // Each field normalizes to "" first.
  assert.equal(await ticketSpecHash("   ", "\r\n\t\n ", "\n"), EMPTY);
});

test("[boundary-4] an empty issue type is not replaced by the default", async () => {
  assert.notEqual(
    await ticketSpecHash("Fix it", "", ""),
    await ticketSpecHash("Fix it", "", "Task"),
  );
});

test("[boundary-4] a blank issue type hashes as empty, not as the default", async () => {
  const empty = await ticketSpecHash("Fix it", "", "");
  assert.equal(await ticketSpecHash("Fix it", "", "  "), empty);
  assert.notEqual(empty, FIX_IT);
  assert.equal(await ticketSpecHash("Fix it", "", DEFAULT_ISSUE_TYPE), FIX_IT);
});

test("[happy-6] line-ending and trailing whitespace noise does not change the hash", async () => {
  assert.equal(
    await ticketSpecHash("Title  ", "One  \r\nTwo\t", " Story "),
    await ticketSpecHash("Title", "One\nTwo", "Story"),
  );
});

test("[happy-6] a noisy known ticket still resolves to its known fingerprint", async () => {
  assert.equal(
    await ticketSpecHash("\r\nAdd export\t", "  Adds CSV.  \r\n", "Story\n"),
    STORY,
  );
  assert.equal(await ticketSpecHash("Fix it\r", " \r\n ", "\tTask "), FIX_IT);
});

test("[happy-7] a change of meaning in any field changes the hash", async () => {
  const base = await ticketSpecHash("Add export", "Adds CSV.", "Story");
  const changed: ReadonlyArray<readonly [string, string, string]> = [
    ["Add import", "Adds CSV.", "Story"],
    ["Add export", "Adds JSON.", "Story"],
    ["Add export", "Adds CSV.", "Bug"],
    ["add export", "Adds CSV.", "Story"],
    ["Add  export", "Adds CSV.", "Story"],
  ];
  for (const [title, description, issueType] of changed) {
    assert.notEqual(
      await ticketSpecHash(title, description, issueType),
      base,
      `hashing ${JSON.stringify([title, description, issueType])}`,
    );
  }
});

test("[happy-7] blank lines, inner indentation and case are meaning", async () => {
  const base = await ticketSpecHash("Add export", "Adds\nCSV.", "Story");
  assert.notEqual(await ticketSpecHash("Add export", "Adds\n\nCSV.", "Story"), base);
  assert.notEqual(await ticketSpecHash("Add export", "Adds\n  CSV.", "Story"), base);
  assert.notEqual(await ticketSpecHash("Add export", "Adds\nCSV.", "story"), base);
});

test("[happy-7] the title is hashed whole, not clamped", async () => {
  const long = "x".repeat(TICKET_LIMITS.title);
  assert.notEqual(
    await ticketSpecHash(`${long}y`, "", "Task"),
    await ticketSpecHash(long, "", "Task"),
  );
});

test("[unhappy-1] text cannot be shifted between fields to forge a hash", async () => {
  const pairs: ReadonlyArray<
    readonly [readonly [string, string, string], readonly [string, string, string]]
  > = [
    [
      ["AB", "", "Task"],
      ["A", "B", "Task"],
    ],
    [
      ['a"b', "c", "Task"],
      ["a", '"b', "Task"],
    ],
    [
      ["A", "B", ""],
      ["A", "", "B"],
    ],
  ];
  for (const [a, b] of pairs) {
    assert.notEqual(
      await ticketSpecHash(a[0], a[1], a[2]),
      await ticketSpecHash(b[0], b[1], b[2]),
      `comparing ${JSON.stringify(a)} with ${JSON.stringify(b)}`,
    );
  }
});

test("[unhappy-1] a forged field separator in the title does not shift fields", async () => {
  assert.notEqual(
    await ticketSpecHash('a","b', "", "Task"),
    await ticketSpecHash("a", "b", "Task"),
  );
  assert.notEqual(
    await ticketSpecHash("A\nB", "", "Task"),
    await ticketSpecHash("A", "B", "Task"),
  );
});

test("[happy-8] the same ticket hashes the same every time", async () => {
  const first = await ticketSpecHash("Add export", "Adds CSV.", "Story");
  const second = await ticketSpecHash("Add export", "Adds CSV.", "Story");
  assert.equal(first, second);
});

test("[happy-8] a description at its limit hashes the same every time", async () => {
  const description = "d".repeat(TICKET_LIMITS.description);
  const first = await ticketSpecHash("Add export", description, "Story");
  const second = await ticketSpecHash("Add export", description, "Story");
  assert.equal(first, second);
  assert.match(first, HEX_64);
});

test("[concurrency-1] overlapping hash calls resolve in call order to their own hashes", async () => {
  const results = await Promise.all([
    ticketSpecHash("Add export", "Adds CSV.", "Story"),
    ticketSpecHash("Add export", "Adds CSV.", "Bug"),
    ticketSpecHash("Fix it", "", "Task"),
  ]);
  assert.deepEqual(results, [STORY, BUG, FIX_IT]);
});

test("[concurrency-1] many interleaved overlapping calls do not interfere", async () => {
  const results = await Promise.all([
    ticketSpecHash("Fix it", "", "Task"),
    ticketSpecHash("Add export", "Adds CSV.", "Story"),
    ticketSpecHash("", "", ""),
    ticketSpecHash("Add export", "Adds CSV.", "Story"),
    ticketSpecHash("Add export", "Adds CSV.", "Bug"),
    ticketSpecHash("Fix it", "", "Task"),
  ]);
  assert.deepEqual(results, [FIX_IT, STORY, EMPTY, STORY, BUG, FIX_IT]);
});
