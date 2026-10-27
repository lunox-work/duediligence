import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatus, writeStatus, readStatuses } from "../../src/index.js";

test("[happy-1] reads canonical statuses with the example spellings", () => {
  const cases = [
    ["Draft", "draft"],
    ["review", "review"],
    [" PUBLISHED ", "published"],
    ["Merged", "merged"],
    ["claimed", "claimed"],
  ] as const;

  for (const [stored, expected] of cases) {
    assert.equal(readStatus(stored), expected, JSON.stringify(stored));
  }
});

test("[happy-1] trims both ends and normalizes case for every canonical status", () => {
  for (const status of ["draft", "review", "published", "claimed", "merged"]) {
    const stored = `  ${status.toUpperCase()}   `;
    assert.equal(readStatus(stored), status, JSON.stringify(stored));
  }
});

test("[happy-2] reads every documented legacy spelling and the example variants", () => {
  const cases = [
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
    ["In-Review", "review"],
    ["under_review", "review"],
    ["LIVE", "published"],
  ] as const;

  for (const [stored, expected] of cases) {
    assert.equal(readStatus(stored), expected, JSON.stringify(stored));
  }
});

test("[happy-2] collapses repeated mixed separators before looking up legacy spellings", () => {
  for (const stored of [
    "  IN   REVIEW  ",
    "In---Review",
    "in___review",
    "  In -__--  ReViEw  ",
    "  UNDER__ -_  REVIEW  ",
  ]) {
    assert.equal(readStatus(stored), "review", JSON.stringify(stored));
  }
});

test("[unhappy-1] returns null for unrecognized values without guessing", () => {
  for (const stored of ["closed", "archived", "drafts", "revew"]) {
    assert.equal(readStatus(stored), null, JSON.stringify(stored));
  }
});

test("[unhappy-1] returns null for empty values and unknown values after cleaning", () => {
  for (const stored of ["", " ", "    ", "  CLOSED  ", "in-revew", "---___  --"]) {
    assert.equal(readStatus(stored), null, JSON.stringify(stored));
  }
});

test("[happy-3] writes review as itself", () => {
  assert.equal(writeStatus("review"), "review");
});

test("[happy-3] writes the remaining statuses including the shortest and longest values", () => {
  for (const status of ["draft", "published", "claimed", "merged"]) {
    assert.equal(writeStatus(status), status);
  }
});

test("[unhappy-2] refuses the example invalid writes and names each original value", () => {
  for (const value of ["Review", "in-review", " draft", "closed"]) {
    assert.throws(
      () => writeStatus(value),
      (error: unknown) => error instanceof Error && error.message.includes(value),
      `Expected an error naming ${JSON.stringify(value)}`,
    );
  }
});

test("[unhappy-2] refuses every legacy alias and blank or padded writes", () => {
  for (const value of [
    "in review",
    "under review",
    "reviewing",
    "live",
    "public",
    "assigned",
    "taken",
    "done",
    "complete",
    "completed",
    "under_review",
    "DRAFT",
    "draft ",
    " review ",
    "",
    "   ",
  ]) {
    assert.throws(
      () => writeStatus(value),
      (error: unknown) => error instanceof Error && error.message.includes(value),
      `Expected an error naming ${JSON.stringify(value)}`,
    );
  }
});

test("[happy-4] reads mixed rows and reports sorted distinct original unreadable values", () => {
  const result = readStatuses([
    { id: "01", status: " Draft " },
    { id: "02", status: "In-Review" },
    { id: "03", status: "LIVE" },
    { id: "04", status: "taken" },
    { id: "05", status: "completed" },
    { id: "06", status: "closed" },
    { id: "07", status: " Closed " },
    { id: "08", status: "archived" },
    { id: "09", status: "closed" },
    { id: "10", status: "" },
    { id: "11", status: "   " },
    { id: "12", status: "CLOSED" },
    { id: "13", status: " Closed " },
  ]);

  // Compare by id: the specification does not prescribe row order.
  const rows = [...result.rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  assert.deepEqual(rows, [
    { id: "01", status: "draft" },
    { id: "02", status: "review" },
    { id: "03", status: "published" },
    { id: "04", status: "claimed" },
    { id: "05", status: "merged" },
    { id: "06", status: null },
    { id: "07", status: null },
    { id: "08", status: null },
    { id: "09", status: null },
    { id: "10", status: null },
    { id: "11", status: null },
    { id: "12", status: null },
    { id: "13", status: null },
  ]);
  assert.deepEqual(result.unreadable, ["", "   ", " Closed ", "CLOSED", "archived", "closed"]);
});

test("[happy-4] returns empty rows and unreadable values for an empty table", () => {
  const result = readStatuses([]);
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.unreadable, []);
});

test("[happy-4] returns no unreadable values when every stored value is recognized", () => {
  const result = readStatuses([
    { id: "only", status: "  UNDER__- REVIEW  " },
  ]);

  assert.deepEqual(result.rows, [{ id: "only", status: "review" }]);
  assert.deepEqual(result.unreadable, []);
});
