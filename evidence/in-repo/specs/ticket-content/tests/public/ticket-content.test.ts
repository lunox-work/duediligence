import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clampTicketTitle,
  DEFAULT_ISSUE_TYPE,
  normalizeSpecText,
  TICKET_LIMITS,
  TICKET_ORIGINS,
  TICKET_SPEC_HASH_VERSION,
  ticketKey,
  ticketSpecHash,
} from "../src/ticket.js";

/**
 * The ticket content rules shared by native ("manual") and Jira tickets. The
 * fingerprints below are the Jira package's `pricingSpecHash` values, so a
 * change to any of them would invalidate every stored hash.
 */

const STORY_HASH =
  "3b83fc961d8b052c4ebb2269255f29a3e901b27eb21f7452ea5f9ac5c5d77444";
const BUG_HASH =
  "7e3c32427cf03005b0304866833c254926f931bbe4beedea60c2e6297afbacc2";
const FIX_IT_HASH =
  "cddb635f134a4d5762ecb6231a36db6d93e45e613c8fc8c2d19837e5aaf6c16c";
const EMPTY_HASH =
  "799c55d702efedb7750db18b36386fc3a3f4be7dddcfb649adeb41a3ed0da228";

const BAD_NUMBER = "A ticket number must be a positive whole number.";

function assertBadNumber(fn: () => unknown): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof RangeError, "expected a RangeError");
    assert.equal(error.message, BAD_NUMBER);
    return true;
  });
}

// Constants

test("[happy-1] the ticket origins are manual then jira", () => {
  assert.deepEqual([...TICKET_ORIGINS], ["manual", "jira"]);
});

test("[happy-1] the origins hold exactly two entries in that order", () => {
  assert.equal(TICKET_ORIGINS.length, 2);
  assert.equal(TICKET_ORIGINS[0], "manual");
  assert.equal(TICKET_ORIGINS[1], "jira");
});

test("[happy-2] the default issue type is Task and the hash version is 1", () => {
  assert.equal(DEFAULT_ISSUE_TYPE, "Task");
  assert.equal(TICKET_SPEC_HASH_VERSION, 1);
});

test("[happy-2] the default issue type and hash version are exact, not lookalikes", () => {
  // Strict equality: not "task", not " Task", not the string "1".
  assert.notEqual(DEFAULT_ISSUE_TYPE, "task");
  assert.equal(DEFAULT_ISSUE_TYPE.length, 4);
  assert.equal(typeof TICKET_SPEC_HASH_VERSION, "number");
});

test("[happy-3] the ticket limits have their fixed values", () => {
  assert.deepEqual(
    { ...TICKET_LIMITS },
    {
      titleMaxChars: 255,
      descriptionMaxChars: 20000,
      issueTypeMaxChars: 60,
      priorityMaxChars: 60,
      labelMaxChars: 255,
      maxLabels: 20,
      componentMaxChars: 255,
      maxComponents: 20,
    },
  );
});

test("[happy-3] the ticket limits have exactly these eight keys", () => {
  assert.deepEqual(Object.keys(TICKET_LIMITS).sort(), [
    "componentMaxChars",
    "descriptionMaxChars",
    "issueTypeMaxChars",
    "labelMaxChars",
    "maxComponents",
    "maxLabels",
    "priorityMaxChars",
    "titleMaxChars",
  ]);
});

test("[unhappy-1] the ticket limits are frozen and refuse assignment", () => {
  assert.equal(Object.isFrozen(TICKET_LIMITS), true);
  const writable = TICKET_LIMITS as unknown as { titleMaxChars: number };
  // Test modules are ES modules, so this runs in strict mode.
  assert.throws(() => {
    writable.titleMaxChars = 10;
  }, TypeError);
  assert.equal(TICKET_LIMITS.titleMaxChars, 255);
});

test("[unhappy-1] the frozen limits refuse new keys and deletions too", () => {
  const loose = TICKET_LIMITS as unknown as Record<string, number>;
  assert.throws(() => {
    loose["extra"] = 1;
  }, TypeError);
  assert.throws(() => {
    delete loose["maxLabels"];
  }, TypeError);
  assert.equal(TICKET_LIMITS.maxLabels, 20);
  assert.equal("extra" in TICKET_LIMITS, false);
});

// normalizeSpecText

test("[happy-4] normalizing spec text removes line-ending and trailing whitespace noise", () => {
  const cases: [string, string][] = [
    ["One\nTwo", "One\nTwo"],
    ["One  \r\nTwo\t", "One\nTwo"],
    ["One\rTwo", "One\nTwo"],
    ["Add  export", "Add  export"],
    ["\n\nTitle\n\n", "Title"],
  ];
  for (const [input, output] of cases) {
    assert.equal(normalizeSpecText(input), output, JSON.stringify(input));
  }
});

test("[happy-4] mixed line endings keep blank lines and inner indentation", () => {
  assert.equal(normalizeSpecText("  a  \r\n\r\n b\t\r c  "), "a\n\n b\n c");
});

test("[boundary-1] empty text normalizes to the empty string", () => {
  assert.equal(normalizeSpecText(""), "");
});

test("[boundary-1] whitespace-only text normalizes to the empty string", () => {
  assert.equal(normalizeSpecText("   "), "");
  assert.equal(normalizeSpecText("\r\n\t\n "), "");
});

test("[boundary-2] normalizing twice equals normalizing once", () => {
  const once = normalizeSpecText("  a  \r\n\r\n b\t\r c  ");
  assert.equal(once, "a\n\n b\n c");
  assert.equal(normalizeSpecText(once), once);
});

test("[boundary-2] normalizing already-empty text stays empty", () => {
  const once = normalizeSpecText("\r\n\t\n ");
  assert.equal(normalizeSpecText(once), "");
});

// ticketSpecHash

test("[happy-5] a known ticket hashes to its stored fingerprint", async () => {
  assert.equal(await ticketSpecHash("Add export", "Adds CSV.", "Story"), STORY_HASH);
});

test("[happy-5] other known tickets, including an empty description, hash to their fingerprints", async () => {
  assert.equal(await ticketSpecHash("Add export", "Adds CSV.", "Bug"), BUG_HASH);
  assert.equal(await ticketSpecHash("Fix it", "", "Task"), FIX_IT_HASH);
});

test("[boundary-3] an entirely empty ticket hashes to its fingerprint", async () => {
  assert.equal(await ticketSpecHash("", "", ""), EMPTY_HASH);
});

test("[boundary-3] the empty ticket's hash is 64 lowercase hex characters", async () => {
  assert.match(await ticketSpecHash("", "", ""), /^[0-9a-f]{64}$/);
});

test("[boundary-4] an empty issue type is not replaced by Task", async () => {
  assert.notEqual(
    await ticketSpecHash("Fix it", "", ""),
    await ticketSpecHash("Fix it", "", "Task"),
  );
});

test("[boundary-4] an empty issue type does not hash as DEFAULT_ISSUE_TYPE", async () => {
  const empty = await ticketSpecHash("Fix it", "", "");
  assert.notEqual(empty, FIX_IT_HASH);
  assert.equal(
    await ticketSpecHash("Fix it", "", DEFAULT_ISSUE_TYPE),
    FIX_IT_HASH,
  );
});

test("[happy-6] line-ending and trailing whitespace noise does not change the hash", async () => {
  assert.equal(
    await ticketSpecHash("Title  ", "One  \r\nTwo\t", " Story "),
    await ticketSpecHash("Title", "One\nTwo", "Story"),
  );
});

test("[happy-6] bare carriage returns and edge blank lines do not change the hash", async () => {
  assert.equal(
    await ticketSpecHash("\n\nTitle\n\n", "One\rTwo", "Story\t"),
    await ticketSpecHash("Title", "One\nTwo", "Story"),
  );
  assert.equal(
    await ticketSpecHash("  Add export  ", "Adds CSV.\r\n", "Story "),
    STORY_HASH,
  );
});

test("[happy-7] changing the title, description or issue type changes the hash", async () => {
  const changed: [string, string, string][] = [
    ["Add import", "Adds CSV.", "Story"],
    ["Add export", "Adds JSON.", "Story"],
    ["Add export", "Adds CSV.", "Bug"],
  ];
  for (const args of changed) {
    assert.notEqual(await ticketSpecHash(...args), STORY_HASH, JSON.stringify(args));
  }
});

test("[happy-7] a change of case or of inner spacing changes the hash", async () => {
  assert.notEqual(await ticketSpecHash("add export", "Adds CSV.", "Story"), STORY_HASH);
  assert.notEqual(await ticketSpecHash("Add  export", "Adds CSV.", "Story"), STORY_HASH);
});

test("[unhappy-2] text moved from the title into the description changes the hash", async () => {
  assert.notEqual(
    await ticketSpecHash("AB", "", "Task"),
    await ticketSpecHash("A", "B", "Task"),
  );
});

test("[unhappy-2] quotes and shifts into the issue type cannot forge a hash", async () => {
  assert.notEqual(
    await ticketSpecHash('a"b', "c", "Task"),
    await ticketSpecHash("a", '"b', "Task"),
  );
  assert.notEqual(
    await ticketSpecHash("A", "B", ""),
    await ticketSpecHash("A", "", "B"),
  );
});

test("[happy-8] the same ticket hashes the same every time", async () => {
  const first = await ticketSpecHash("Add export", "Adds CSV.", "Story");
  const second = await ticketSpecHash("Add export", "Adds CSV.", "Story");
  assert.equal(first, second);
});

test("[happy-8] repeated hashes stay equal with other tickets hashed in between", async () => {
  const first = await ticketSpecHash("Add export", "Adds CSV.", "Story");
  await ticketSpecHash("Fix it", "", "Task");
  const second = await ticketSpecHash("Add export", "Adds CSV.", "Story");
  assert.equal(first, STORY_HASH);
  assert.equal(second, STORY_HASH);
});

test("[concurrency-1] overlapping hash calls resolve in call order to their own hashes", async () => {
  const results = await Promise.all([
    ticketSpecHash("Add export", "Adds CSV.", "Story"),
    ticketSpecHash("Add export", "Adds CSV.", "Bug"),
    ticketSpecHash("Fix it", "", "Task"),
  ]);
  assert.deepEqual(results, [STORY_HASH, BUG_HASH, FIX_IT_HASH]);
});

test("[concurrency-1] overlapping calls in reverse order still match their own inputs", async () => {
  const results = await Promise.all([
    ticketSpecHash("Fix it", "", "Task"),
    ticketSpecHash("Add export", "Adds CSV.", "Bug"),
    ticketSpecHash("Add export", "Adds CSV.", "Story"),
    ticketSpecHash("Add export", "Adds CSV.", "Story"),
  ]);
  assert.deepEqual(results, [FIX_IT_HASH, BUG_HASH, STORY_HASH, STORY_HASH]);
});

// clampTicketTitle

test("[happy-9] a title within the limit is returned unchanged", () => {
  assert.equal(clampTicketTitle("Add export"), "Add export");
});

test("[happy-9] a title within the limit is trimmed and keeps its inner whitespace", () => {
  assert.equal(clampTicketTitle("  Add export \n"), "Add export");
  assert.equal(clampTicketTitle("Add   CSV  export"), "Add   CSV  export");
  assert.equal(clampTicketTitle(" Add\nexport "), "Add\nexport");
});

test("[boundary-5] a title of exactly 255 characters is kept and one of 256 is cut", () => {
  const exact = clampTicketTitle("x".repeat(255));
  assert.equal(exact, "x".repeat(255));
  assert.equal(exact.length, 255);

  const over = clampTicketTitle("x".repeat(256));
  assert.equal(over, "x".repeat(254) + "…");
  assert.equal(over.length, 255);
});

test("[boundary-5] the limit counts the trimmed title and caps a long one at 255", () => {
  const padded = clampTicketTitle("  " + "x".repeat(255) + "  ");
  assert.equal(padded, "x".repeat(255));
  assert.equal(padded.length, 255);

  const long = clampTicketTitle("x".repeat(1000));
  assert.equal(long, "x".repeat(254) + "…");
  assert.equal(long.length, 255);
});

test("[boundary-6] an empty title clamps to the empty string", () => {
  assert.equal(clampTicketTitle(""), "");
});

test("[boundary-6] a blank title clamps to the empty string", () => {
  assert.equal(clampTicketTitle("   "), "");
  assert.equal(clampTicketTitle("\n\t "), "");
});

test("[boundary-7] whitespace before the cut is not kept before the ellipsis", () => {
  const title = "x".repeat(250) + " ".repeat(5) + "y".repeat(10);
  assert.equal(title.length, 265);
  const result = clampTicketTitle(title);
  assert.equal(result, "x".repeat(250) + "…");
  assert.equal(result.length, 251);
});

test("[boundary-7] a single space at the cut is dropped before the ellipsis", () => {
  const result = clampTicketTitle("x".repeat(253) + " " + "y".repeat(10));
  assert.equal(result, "x".repeat(253) + "…");
  assert.equal(result.length, 254);
});

test("[boundary-8] a cut on a high surrogate drops it rather than split the pair", () => {
  const title = "a".repeat(253) + "😀" + "b";
  assert.equal(title.length, 256);
  const result = clampTicketTitle(title);
  assert.equal(result, "a".repeat(253) + "…");
  assert.equal(result.length, 254);
});

test("[boundary-8] a surrogate pair wholly before the cut is kept", () => {
  const result = clampTicketTitle("a".repeat(252) + "😀" + "b".repeat(5));
  assert.equal(result, "a".repeat(252) + "😀" + "…");
  assert.equal(result.length, 255);
});

test("[boundary-9] clamping a long title twice equals clamping it once", () => {
  const once = clampTicketTitle("x".repeat(300));
  assert.equal(once, "x".repeat(254) + "…");
  assert.equal(clampTicketTitle(once), once);
});

test("[boundary-9] clamping a short padded title twice equals clamping it once", () => {
  const once = clampTicketTitle("  Add export \n");
  assert.equal(clampTicketTitle(once), "Add export");
});

// ticketKey

test("[happy-10] a Jira ticket is shown by its Jira key", () => {
  assert.equal(ticketKey({ number: 7, jiraKey: "ACME-12" }), "ACME-12");
  assert.equal(ticketKey({ number: 7, jiraKey: " ACME-12 " }), "ACME-12");
});

test("[happy-10] a native ticket is shown by # and its number", () => {
  assert.equal(ticketKey({ number: 7 }), "#7");
  assert.equal(ticketKey({ number: 7, jiraKey: null }), "#7");
  assert.equal(ticketKey({ number: 7, jiraKey: undefined }), "#7");
  assert.equal(ticketKey({ number: 1042 }), "#1042");
});

test("[boundary-10] an empty Jira key falls back to the number", () => {
  assert.equal(ticketKey({ number: 3, jiraKey: "" }), "#3");
});

test("[boundary-10] a whitespace-only Jira key falls back to the number", () => {
  assert.equal(ticketKey({ number: 3, jiraKey: "   " }), "#3");
  assert.equal(ticketKey({ number: 3, jiraKey: "\t\n" }), "#3");
});

test("[boundary-11] the smallest ticket number is 1", () => {
  assert.equal(ticketKey({ number: 1 }), "#1");
});

test("[boundary-11] the largest ticket number is the largest safe integer", () => {
  assert.equal(ticketKey({ number: 9007199254740991 }), "#9007199254740991");
  assert.equal(
    ticketKey({ number: Number.MAX_SAFE_INTEGER }),
    "#9007199254740991",
  );
});

test("[unhappy-3] zero, negative and fractional ticket numbers are refused", () => {
  for (const number of [0, -1, 1.5]) {
    assertBadNumber(() => ticketKey({ number }));
  }
});

test("[unhappy-3] non-finite and unsafe ticket numbers are refused, as is a bad number behind a blank Jira key", () => {
  for (const number of [Number.NaN, Number.POSITIVE_INFINITY, 9007199254740992]) {
    assertBadNumber(() => ticketKey({ number }));
  }
  assertBadNumber(() => ticketKey({ number: 0, jiraKey: "   " }));
  assertBadNumber(() => ticketKey({ number: -1, jiraKey: null }));
});

test("[boundary-12] a Jira key makes a zero number irrelevant", () => {
  assert.equal(ticketKey({ number: 0, jiraKey: "ACME-1" }), "ACME-1");
});

test("[boundary-12] a padded Jira key makes a non-finite number irrelevant", () => {
  assert.equal(ticketKey({ number: Number.NaN, jiraKey: " ACME-1 " }), "ACME-1");
  assert.equal(ticketKey({ number: -1, jiraKey: "ACME-1" }), "ACME-1");
});
