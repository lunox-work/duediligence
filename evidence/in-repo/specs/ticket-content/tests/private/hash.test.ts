import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { ticketSpecHash } from "../../src/ticket.js";

/**
 * The spec defines the fingerprint as SHA-256 of
 * JSON.stringify([title, description, issueType]) of the normalized strings,
 * UTF-8 encoded, as lowercase hex. `expected` computes it with node:crypto
 * from strings already written in their normalized form.
 */

const STORY_HASH =
  "3b83fc961d8b052c4ebb2269255f29a3e901b27eb21f7452ea5f9ac5c5d77444";

function expected(title: string, description: string, issueType: string): string {
  return createHash("sha256")
    .update(JSON.stringify([title, description, issueType]), "utf8")
    .digest("hex");
}

// Extends "[happy-5] a known ticket hashes to its stored fingerprint":
// tickets outside the public table, so a lookup of known values fails.
test("[happy-5] tickets outside the known table hash to SHA-256 of their JSON tuple", async () => {
  const tickets: [string, string, string][] = [
    ["Add import", "Adds CSV.", "Story"],
    ["Export tickets to CSV", "Exports every ticket.\n\nIncludes labels.", "Story"],
    ["Fix login", "Steps:\n  1. Open\n  2. Click", "Bug"],
    ["Café ☕ 😀", "Ünïcödé — “quotes”", "Épique"],
    ['Say "hi"', "path\\to\\file", "Task"],
    ["a\u0000b", "tab\there", "Sub-task"],
    ["x", "y", "z"],
  ];
  for (const ticket of tickets) {
    const hash = await ticketSpecHash(...ticket);
    assert.equal(hash, expected(...ticket), JSON.stringify(ticket));
    assert.match(hash, /^[0-9a-f]{64}$/);
  }
});

// Extends "[happy-5] other known tickets, including an empty description, hash to their fingerprints":
// the normalization is applied to each field before hashing.
test("[happy-5] each field is normalized before it is hashed", async () => {
  assert.equal(
    await ticketSpecHash("  Fix login \r\n", "\r\nSteps:  \r\n  1. Open\t\r  2. Click  \n\n", "\tBug "),
    expected("Fix login", "Steps:\n  1. Open\n  2. Click", "Bug"),
  );
  assert.equal(
    await ticketSpecHash("A\r\rB", "", "Story "),
    expected("A\n\nB", "", "Story"),
  );
});

// Extends "[happy-5] a known ticket hashes to its stored fingerprint":
// the hash does not clamp the title, so a long title hashes in full.
test("[happy-5] a title longer than the title limit is hashed in full, not clamped", async () => {
  const title = "x".repeat(300);
  const hash = await ticketSpecHash(title, "Adds CSV.", "Story");
  assert.equal(hash, expected(title, "Adds CSV.", "Story"));
  assert.notEqual(hash, expected("x".repeat(254) + "…", "Adds CSV.", "Story"));
});

// Extends "[happy-5] other known tickets, including an empty description, hash to their fingerprints":
// a description at the 20 000-character cap and beyond.
test("[happy-5] long descriptions hash to SHA-256 of their JSON tuple", async () => {
  const atCap = "d".repeat(20000);
  assert.equal(await ticketSpecHash("Big", atCap, "Story"), expected("Big", atCap, "Story"));
  const longer = "line  \r\n".repeat(5000) + "end";
  assert.equal(
    await ticketSpecHash("Big", longer, "Story"),
    expected("Big", "line\n".repeat(5000) + "end", "Story"),
  );
});

// Extends "[happy-6] bare carriage returns and edge blank lines do not change the hash":
// other whitespace noise in every field, against the stored Story fingerprint.
test("[happy-6] noise in every field at once keeps the stored fingerprint", async () => {
  assert.equal(
    await ticketSpecHash("\r\n  Add export\t\r\n", "\n\n  Adds CSV.  \r\r", "\tStory\n"),
    STORY_HASH,
  );
  assert.equal(
    await ticketSpecHash("Add export ", "Adds CSV.　", "﻿Story"),
    STORY_HASH,
  );
});

// Extends "[happy-6] line-ending and trailing whitespace noise does not change the hash":
// whitespace-only lines and mixed endings inside a description.
test("[happy-6] whitespace-only lines and mixed line endings inside a description do not change the hash", async () => {
  assert.equal(
    await ticketSpecHash("T", "One\r\n   \r\nTwo  \rThree", "Story"),
    await ticketSpecHash("T", "One\n\nTwo\nThree", "Story"),
  );
});

// Extends "[happy-7] changing the title, description or issue type changes the hash":
// changes the public test does not make, including case in the other fields.
test("[happy-7] changes of case, spacing, indentation or blank lines in any field change the hash", async () => {
  const changed: [string, string, string][] = [
    ["Add export", "adds csv.", "Story"],
    ["Add export", "Adds CSV.", "story"],
    ["Add export", "Adds CSV.", "STORY"],
    ["ADD EXPORT", "Adds CSV.", "Story"],
    ["Add export", "Adds  CSV.", "Story"],
    ["Add export", "Adds\nCSV.", "Story"],
    ["Add export", "Adds CSV.", "Sto ry"],
    ["Adds CSV.", "Add export", "Story"],
    ["Story", "Adds CSV.", "Add export"],
  ];
  for (const args of changed) {
    assert.notEqual(await ticketSpecHash(...args), STORY_HASH, JSON.stringify(args));
  }
});

// Extends "[happy-7] a change of case or of inner spacing changes the hash":
// indentation of later lines and blank lines are meaning, not noise.
test("[happy-7] indentation of a later line and an added blank line change the hash", async () => {
  const base = await ticketSpecHash("T", "One\nTwo", "Story");
  assert.notEqual(await ticketSpecHash("T", "One\n  Two", "Story"), base);
  assert.notEqual(await ticketSpecHash("T", "One\n\nTwo", "Story"), base);
  assert.notEqual(await ticketSpecHash("T", "One\n\n\nTwo", "Story"), await ticketSpecHash("T", "One\n\nTwo", "Story"));
});

// Extends "[happy-7] changing the title, description or issue type changes the hash":
// many variants of one ticket all hash apart from each other.
test("[happy-7] a set of distinct tickets yields as many distinct hashes", async () => {
  const tickets: [string, string, string][] = [];
  for (const title of ["Add export", "add export", "Add  export"]) {
    for (const description of ["Adds CSV.", "Adds JSON.", ""]) {
      for (const issueType of ["Story", "Bug", "Task", ""]) {
        tickets.push([title, description, issueType]);
      }
    }
  }
  const hashes = new Set<string>();
  for (const ticket of tickets) {
    hashes.add(await ticketSpecHash(...ticket));
  }
  assert.equal(hashes.size, tickets.length);
});

// Extends "[unhappy-2] text moved from the title into the description changes the hash"
// and "[unhappy-2] quotes and shifts into the issue type cannot forge a hash":
// shifts across the separators a naive join would use.
test("[unhappy-2] shifting text across common separators cannot forge a hash", async () => {
  const pairs: [[string, string, string], [string, string, string]][] = [
    [["a\u0000b", "c", "Task"], ["a", "b\u0000c", "Task"]],
    [["a|b", "c", "Task"], ["a", "b|c", "Task"]],
    [["a\nb", "c", "Task"], ["a", "b\nc", "Task"]],
    [["a,b", "c", "Task"], ["a", "b,c", "Task"]],
    [['a","b', "c", "Task"], ["a", 'b","c', "Task"]],
    [["a\\", '"b', "Task"], ['a\\"', "b", "Task"]],
    [["A", "B C", ""], ["A", "B", "C"]],
    [["AB", "", ""], ["", "", "AB"]],
    [["", "AB", ""], ["A", "", "B"]],
  ];
  for (const [a, b] of pairs) {
    const hashA = await ticketSpecHash(...a);
    const hashB = await ticketSpecHash(...b);
    assert.notEqual(hashA, hashB, JSON.stringify([a, b]));
    assert.equal(hashA, expected(...a), JSON.stringify(a));
    assert.equal(hashB, expected(...b), JSON.stringify(b));
  }
});

// Extends "[happy-8] repeated hashes stay equal with other tickets hashed in between":
// many repetitions of another ticket, with others interleaved.
test("[happy-8] a ticket hashed many times, between other tickets, always hashes the same", async () => {
  const want = expected("Café ☕ 😀", "Steps:\n  1. Open", "Bug");
  for (let i = 0; i < 10; i++) {
    assert.equal(await ticketSpecHash("Café ☕ 😀", "Steps:\n  1. Open", "Bug"), want);
    await ticketSpecHash(`Other ${i}`, "x".repeat(i * 100), "Task");
  }
});

// Extends "[concurrency-1] overlapping calls in reverse order still match their own inputs":
// many overlapping calls of different sizes, so the order of completion may differ from call order.
test("[concurrency-1] many overlapping calls of different sizes resolve in call order to their own hashes", async () => {
  const tickets: [string, string, string][] = [];
  for (let i = 0; i < 40; i++) {
    const size = (40 - i) * 500;
    tickets.push([`Ticket ${i}`, "d".repeat(size), i % 2 === 0 ? "Story" : "Bug"]);
  }
  tickets.push(["Add export", "Adds CSV.", "Story"], ["Ticket 0", "d".repeat(20000), "Story"]);
  const results = await Promise.all(tickets.map((ticket) => ticketSpecHash(...ticket)));
  assert.deepEqual(
    results,
    tickets.map((ticket) => expected(...ticket)),
  );
  assert.equal(results[40], STORY_HASH);
  assert.equal(results[41], results[0]);
});

// Extends "[concurrency-1] overlapping hash calls resolve in call order to their own hashes":
// overlapping calls whose inputs need normalization do not share state.
test("[concurrency-1] overlapping calls with noisy inputs each normalize their own fields", async () => {
  const results = await Promise.all([
    ticketSpecHash("  A  ", "One  \r\nTwo", "Story"),
    ticketSpecHash("B", "\r\n\r\n", " Bug "),
    ticketSpecHash("C\r", "  x\n  y  ", ""),
  ]);
  assert.deepEqual(results, [
    expected("A", "One\nTwo", "Story"),
    expected("B", "", "Bug"),
    expected("C", "x\n  y", ""),
  ]);
});
