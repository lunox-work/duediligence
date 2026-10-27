import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatus } from "../../src/index.js";

test("[happy-1] statuses written another way are read as themselves", () => {
  assert.equal(readStatus("Draft"), "draft");
  assert.equal(readStatus(" PUBLISHED "), "published");
  assert.equal(readStatus("Merged"), "merged");
  assert.equal(readStatus("claimed"), "claimed");
});

test("[happy-1] every status, already clean or mixed case with padded ends, reads as itself", () => {
  for (const status of ["draft", "review", "published", "claimed", "merged"] as const) {
    assert.equal(readStatus(status), status);
    assert.equal(readStatus(`   ${status.toUpperCase()}   `), status);
  }
});

test("[happy-2] old spellings with dashes, underscores and capitals are read as their status", () => {
  assert.equal(readStatus("In-Review"), "review");
  assert.equal(readStatus("under_review"), "review");
  assert.equal(readStatus("LIVE"), "published");
});

test("[happy-2] every known old spelling is read as its status", () => {
  const table: Array<[string, string]> = [
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
  for (const [spelling, status] of table) {
    assert.equal(readStatus(spelling), status, spelling);
  }
});

test("[happy-2] a mixed run of spaces, dashes and underscores counts as one space", () => {
  assert.equal(readStatus("  Under -_ REVIEW  "), "review");
  assert.equal(readStatus("in__--  review"), "review");
});

test("[unhappy-1] values that are no status read as null", () => {
  assert.equal(readStatus("closed"), null);
  assert.equal(readStatus("archived"), null);
});

test("[unhappy-1] near misses, empty and spaces-only values read as null, not the nearest status", () => {
  assert.equal(readStatus("drafts"), null);
  assert.equal(readStatus("revew"), null);
  assert.equal(readStatus(""), null);
  assert.equal(readStatus("    "), null);
});
