import { test } from "node:test";
import assert from "node:assert/strict";
import { writeStatus } from "../../src/index.js";

function namesValue(value: string) {
  return (err: unknown): boolean => err instanceof Error && err.message.includes(value);
}

// Extends "[happy-3] every status is written as itself": in another order, and repeated.
test("[happy-3] each status written in reverse order, twice, is stored as itself", () => {
  for (const status of ["merged", "claimed", "published", "review", "draft"]) {
    assert.equal(writeStatus(status), status);
    assert.equal(writeStatus(status), status);
  }
});

// Extends "[happy-3] a status is written as itself": the other statuses one by one.
test("[happy-3] draft, published, claimed and merged are each stored as themselves", () => {
  assert.equal(writeStatus("draft"), "draft");
  assert.equal(writeStatus("published"), "published");
  assert.equal(writeStatus("claimed"), "claimed");
  assert.equal(writeStatus("merged"), "merged");
});

// Extends "[unhappy-2] values other than a status are refused with an error naming them":
// a status in other cases. A write that lowercases first gets these wrong.
test("[unhappy-2] a status in another case is refused, named as given", () => {
  for (const value of ["DRAFT", "Merged", "pUBLISHED", "Claimed", "REVIEW"]) {
    assert.throws(() => writeStatus(value), namesValue(value), value);
  }
});

// Extends "[unhappy-2] a status with a padded end is refused, named as given":
// trailing and two-sided padding. A write that trims first, or names the trimmed value, gets these wrong.
test("[unhappy-2] a status padded on the right or on both sides is refused, named as given", () => {
  for (const value of ["merged ", "  review  ", "claimed   ", "   published"]) {
    assert.throws(() => writeStatus(value), namesValue(value), JSON.stringify(value));
  }
});

// Extends "[unhappy-2] an old spelling, even already clean, is never accepted on write":
// every other old spelling. A write that accepts whatever reads as a status gets these wrong.
test("[unhappy-2] every other clean old spelling is refused on write, named as given", () => {
  for (const value of [
    "under review",
    "reviewing",
    "public",
    "assigned",
    "taken",
    "complete",
    "completed",
  ]) {
    assert.throws(() => writeStatus(value), namesValue(value), value);
  }
});

// Old spellings as they might be stored: capitals, dashes, underscores, padding.
test("[unhappy-2] old spellings with capitals, dashes, underscores or padding are refused, named as given", () => {
  for (const value of ["Under_Review", "IN_REVIEW", "  Live  ", "DONE", "Completed", "in - review"]) {
    assert.throws(() => writeStatus(value), namesValue(value), value);
  }
});

// Other values that are no status at all, including empty and separator-only values.
test("[unhappy-2] other values that are no status are refused, named as given", () => {
  for (const value of ["archived", "drafts", "revew", "pub-lished", "constructor", "__proto__", "   ", "-", ""]) {
    assert.throws(
      () => writeStatus(value),
      (err: unknown): boolean => err instanceof Error && err.message.includes(value),
      JSON.stringify(value),
    );
  }
});
