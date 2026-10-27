import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatuses } from "../../src/index.js";
import type { ReadStatusRow, StoredStatusRow } from "../../src/index.js";

function byId(rows: ReadStatusRow[]): ReadStatusRow[] {
  return [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function pad(n: number): string {
  return String(n).padStart(5, "0");
}

// Extends "[happy-4] reading many rows gives each its status and lists what could not be read":
// every status and every old spelling, in other spellings, among unreadable rows.
test("[happy-4] a table of every status and old spelling reads each row and lists only the unreadable", () => {
  const stored: Array<[string, string | null]> = [
    ["  DRAFT ", "draft"],
    ["Review", "review"],
    ["published", "published"],
    ["Claimed", "claimed"],
    [" merged", "merged"],
    ["In_Review", "review"],
    ["UNDER-REVIEW", "review"],
    ["reviewing", "review"],
    ["Live", "published"],
    ["public", "published"],
    ["assigned", "claimed"],
    ["TAKEN", "claimed"],
    ["done", "merged"],
    ["complete", "merged"],
    ["Completed ", "merged"],
    ["pending", null],
    ["drafts", null],
    ["revew", null],
    ["open", null],
  ];
  const rows = stored.map(([status], i) => ({ id: pad(i), status }));
  const result = readStatuses(rows);
  assert.deepEqual(
    byId(result.rows),
    stored.map(([, status], i) => ({ id: pad(i), status })),
  );
  assert.deepEqual(result.unreadable, ["drafts", "open", "pending", "revew"]);
});

// Extends "[happy-4] unreadable values are listed once each, sorted, exactly as stored":
// unreadable values given in reverse order, each many times.
test("[happy-4] unreadable values given in reverse order and repeated are listed once each, sorted", () => {
  const values = ["zeta", "wip", "pending", "open", "in progress", "deleted", "closed", "archived"];
  const rows: StoredStatusRow[] = [];
  for (let round = 0; round < 5; round++) {
    for (const value of values) {
      rows.push({ id: pad(rows.length), status: value });
    }
  }
  const result = readStatuses(rows);
  assert.equal(result.rows.length, rows.length);
  for (const row of result.rows) {
    assert.equal(row.status, null, row.id);
  }
  assert.deepEqual(result.unreadable, [
    "archived",
    "closed",
    "deleted",
    "in progress",
    "open",
    "pending",
    "wip",
    "zeta",
  ]);
});

// A shortcut that de-duplicates by the cleaned value, or lists the cleaned value, gets this wrong.
test("[happy-4] unreadable values that clean to the same text are each listed, exactly as stored", () => {
  const values = ["closed", "Closed", " CLOSED ", "closed_", "in-progress", "In Progress", "in progress"];
  const rows = values.map((status, i) => ({ id: pad(i), status }));
  const result = readStatuses(rows);
  assert.equal(result.unreadable.length, values.length);
  assert.deepEqual([...result.unreadable].sort(), [...values].sort());
});

// Empty, spaces-only and separator-only values are listed as stored, not as cleaned.
test("[happy-4] empty and spaces-only values are listed once each, exactly as stored, sorted", () => {
  const result = readStatuses([
    { id: "a", status: "   " },
    { id: "b", status: "" },
    { id: "c", status: " " },
    { id: "d", status: "" },
    { id: "e", status: "   " },
    { id: "f", status: "draft" },
  ]);
  assert.deepEqual(byId(result.rows), [
    { id: "a", status: null },
    { id: "b", status: null },
    { id: "c", status: null },
    { id: "d", status: null },
    { id: "e", status: null },
    { id: "f", status: "draft" },
  ]);
  assert.deepEqual(result.unreadable, ["", " ", "   "]);
});

// A shortcut that looks values up, or de-duplicates them, in a plain object gets this wrong.
test("[happy-4] values named like plain-object members read as no status and are listed", () => {
  const result = readStatuses([
    { id: "1", status: "constructor" },
    { id: "2", status: "__proto__" },
    { id: "3", status: "toString" },
    { id: "4", status: "__proto__" },
    { id: "5", status: "review" },
  ]);
  assert.deepEqual(byId(result.rows), [
    { id: "1", status: null },
    { id: "2", status: null },
    { id: "3", status: null },
    { id: "4", status: null },
    { id: "5", status: "review" },
  ]);
  assert.deepEqual(result.unreadable, ["__proto__", "constructor", "toString"]);
});

// Extends "[happy-4] reading no rows gives no rows and nothing unreadable":
// many rows that all read, so nothing is unreadable.
test("[happy-4] many rows that all read as statuses list nothing unreadable", () => {
  const spellings: Array<[string, string]> = [
    ["Draft", "draft"],
    ["in-review", "review"],
    ["LIVE", "published"],
    ["taken", "claimed"],
    ["Done", "merged"],
  ];
  const rows: StoredStatusRow[] = [];
  const expected: ReadStatusRow[] = [];
  for (let i = 0; i < 1000; i++) {
    const [stored, status] = spellings[i % spellings.length]!;
    rows.push({ id: pad(i), status: stored });
    expected.push({ id: pad(i), status: status as ReadStatusRow["status"] });
  }
  const result = readStatuses(rows);
  assert.deepEqual(byId(result.rows), expected);
  assert.deepEqual(result.unreadable, []);
});

// A single row, unreadable, given with ids out of order among readable rows.
test("[happy-4] each row keeps its own id and status when ids are given out of order", () => {
  const result = readStatuses([
    { id: "z", status: "complete" },
    { id: "m", status: "nope" },
    { id: "b", status: "assigned" },
    { id: "x", status: "public" },
  ]);
  assert.deepEqual(byId(result.rows), [
    { id: "b", status: "claimed" },
    { id: "m", status: null },
    { id: "x", status: "published" },
    { id: "z", status: "merged" },
  ]);
  assert.deepEqual(result.unreadable, ["nope"]);
});
