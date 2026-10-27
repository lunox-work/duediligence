import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatus } from "../../src/index.js";

const STATUSES = ["draft", "review", "published", "claimed", "merged"] as const;

const OLD_SPELLINGS: Array<[string, string]> = [
  ["in review", "review"],
  ["under review", "review"],
  ["reviewing", "review"],
  ["live", "published"],
  ["public", "published"],
  ["assigned", "claimed"],
  ["taken", "claimed"],
  ["done", "merged"],
  ["complete", "merged"],
  ["completed", "merged"],
];

// Extends "[happy-1] statuses written another way are read as themselves":
// other case mixes and other paddings than the public values.
test("[happy-1] statuses in other case mixes and paddings read as themselves", () => {
  assert.equal(readStatus("dRaFt"), "draft");
  assert.equal(readStatus("REVIEW"), "review");
  assert.equal(readStatus("  Review"), "review");
  assert.equal(readStatus("Published  "), "published");
  assert.equal(readStatus("   cLAIMED"), "claimed");
  assert.equal(readStatus("MERGED     "), "merged");
  assert.equal(readStatus("drafT"), "draft");
});

// Extends "[happy-1] every status, already clean or mixed case with padded ends, reads as itself":
// title case and long, uneven padding on each side.
test("[happy-1] every status in title case with long uneven padding reads as itself", () => {
  for (const status of STATUSES) {
    const title = status[0]!.toUpperCase() + status.slice(1);
    assert.equal(readStatus(" ".repeat(20) + title + " ".repeat(3)), status, title);
    assert.equal(readStatus(title + " ".repeat(40)), status, title);
  }
});

// Extends "[happy-2] old spellings with dashes, underscores and capitals are read as their status":
// the other old spellings, written with capitals, dashes and underscores.
test("[happy-2] other old spellings with capitals, dashes and underscores read as their status", () => {
  assert.equal(readStatus("Under-Review"), "review");
  assert.equal(readStatus("IN_REVIEW"), "review");
  assert.equal(readStatus("Reviewing"), "review");
  assert.equal(readStatus("Public"), "published");
  assert.equal(readStatus("ASSIGNED"), "claimed");
  assert.equal(readStatus("Taken"), "claimed");
  assert.equal(readStatus("DONE"), "merged");
  assert.equal(readStatus("Complete"), "merged");
  assert.equal(readStatus("  COMPLETED  "), "merged");
});

// Extends "[happy-2] every known old spelling is read as its status":
// every spelling also in upper case, padded, and with its spaces written as "-" or "_".
test("[happy-2] every known old spelling in upper case, padded or with other separators reads as its status", () => {
  for (const [spelling, status] of OLD_SPELLINGS) {
    assert.equal(readStatus(spelling.toUpperCase()), status, spelling);
    assert.equal(readStatus(`  ${spelling}   `), status, spelling);
    assert.equal(readStatus(spelling.replace(/ /g, "-")), status, spelling);
    assert.equal(readStatus(spelling.replace(/ /g, "_").toUpperCase()), status, spelling);
  }
});

// Extends "[happy-2] a mixed run of spaces, dashes and underscores counts as one space":
// longer runs, a space-dash-space run, and runs combined with padding and capitals.
test("[happy-2] long and mixed separator runs between words count as one space", () => {
  assert.equal(readStatus("in - review"), "review");
  assert.equal(readStatus("UNDER   REVIEW"), "review");
  assert.equal(readStatus("in" + " -_".repeat(50) + "review"), "review");
  assert.equal(readStatus("   Under____Review   "), "review");
  assert.equal(readStatus("In_-_-_-Review"), "review");
});

// Extends "[unhappy-1] values that are no status read as null": other unknown words.
test("[unhappy-1] other words that are no status or old spelling read as null", () => {
  for (const value of [
    "open",
    "pending",
    "approved",
    "rejected",
    "deleted",
    "in progress",
    "unknown",
    "none",
    "null",
    "Closed",
    " ARCHIVED ",
  ]) {
    assert.equal(readStatus(value), null, value);
  }
});

// Extends "[unhappy-1] near misses, empty and spaces-only values read as null, not the nearest status":
// other near misses of statuses and of old spellings.
test("[unhappy-1] other near misses of statuses and old spellings read as null", () => {
  for (const value of [
    "draf",
    "drat",
    "reviews",
    "reviewed",
    "publshed",
    "publish",
    "claim",
    "claims",
    "merge",
    "mergedd",
    "Drafts",
    "REVEW",
    "completes",
    "liv",
    "publc",
  ]) {
    assert.equal(readStatus(value), null, value);
  }
});

// A shortcut that strips separators instead of making them one space gets these wrong.
test("[unhappy-1] a status split by separators, or an old spelling run together, reads as null", () => {
  for (const value of [
    "dra ft",
    "Pub-lished",
    "merg_ed",
    "re view",
    "inreview",
    "UnderReview",
    "under_reviewing",
    "com-pleted",
  ]) {
    assert.equal(readStatus(value), null, value);
  }
});

// A shortcut that matches on a contained word, a prefix or a suffix gets these wrong.
test("[unhappy-1] values that merely contain a status or old spelling read as null", () => {
  for (const value of [
    "preview",
    "redraft",
    "not reviewed",
    "draft review",
    "review draft",
    "merged in",
    "undone",
    "completely",
    "publicly",
    "live draft",
    "done done",
    "draft.",
    "Published!",
    "in review now",
  ]) {
    assert.equal(readStatus(value), null, value);
  }
});

// A shortcut that looks spellings up in a plain object gets these wrong.
test("[unhappy-1] names inherited by plain objects read as null", () => {
  for (const value of [
    "constructor",
    "toString",
    "__proto__",
    "hasOwnProperty",
    "valueOf",
    "isPrototypeOf",
    "Constructor",
  ]) {
    assert.equal(readStatus(value), null, value);
  }
});

// Extends the empty and spaces-only cases: values made only of separators.
test("[unhappy-1] values made only of separators read as null", () => {
  for (const value of ["-", "_", "---", "___", " - _ ", "                    "]) {
    assert.equal(readStatus(value), null, JSON.stringify(value));
  }
});
