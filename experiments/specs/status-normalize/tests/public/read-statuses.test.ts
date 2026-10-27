import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatuses } from "../../src/index.js";
import type { ReadStatusRow } from "../../src/index.js";

function byId(rows: ReadStatusRow[]): ReadStatusRow[] {
  return [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

test("[happy-4] reading many rows gives each its status and lists what could not be read", () => {
  const result = readStatuses([
    { id: "a", status: "Draft" },
    { id: "b", status: "closed" },
    { id: "c", status: "In-Review" },
    { id: "d", status: "archived" },
    { id: "e", status: "merged" },
  ]);
  assert.deepEqual(byId(result.rows), [
    { id: "a", status: "draft" },
    { id: "b", status: null },
    { id: "c", status: "review" },
    { id: "d", status: null },
    { id: "e", status: "merged" },
  ]);
  assert.deepEqual(result.unreadable, ["archived", "closed"]);
});

test("[happy-4] unreadable values are listed once each, sorted, exactly as stored", () => {
  const result = readStatuses([
    { id: "1", status: "closed" },
    { id: "2", status: "closed " },
    { id: "3", status: "closed" },
    { id: "4", status: "" },
    { id: "5", status: "archived" },
    { id: "6", status: "live" },
  ]);
  assert.deepEqual(byId(result.rows), [
    { id: "1", status: null },
    { id: "2", status: null },
    { id: "3", status: null },
    { id: "4", status: null },
    { id: "5", status: null },
    { id: "6", status: "published" },
  ]);
  assert.deepEqual(result.unreadable, ["", "archived", "closed", "closed "]);
});

test("[happy-4] reading no rows gives no rows and nothing unreadable", () => {
  assert.deepEqual(readStatuses([]), { rows: [], unreadable: [] });
});
