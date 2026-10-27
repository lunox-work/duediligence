import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatuses } from "../../src/index.js";
import type { StoredStatusRow } from "../../src/index.js";

function assertThrowsType(rows: unknown, message: string): void {
  assert.throws(
    () => readStatuses(rows as StoredStatusRow[]),
    (err: unknown) => {
      if (!(err instanceof TypeError)) throw new Error("expected a TypeError");
      assert.equal(err.message, message);
      return true;
    },
  );
}

test("[happy-4] readStatuses reads mixed rows in input order", () => {
  const result = readStatuses([
    { id: "t3", status: "Draft" },
    { id: "t1", status: "in-review" },
    { id: "t2", status: "merged" },
    { id: "t4", status: "archived" },
  ]);
  assert.deepEqual(result.rows, [
    { id: "t3", status: "draft" },
    { id: "t1", status: "review" },
    { id: "t2", status: "merged" },
    { id: "t4", status: null },
  ]);
});

test("[happy-4] readStatuses copies empty and padded ids unchanged", () => {
  const result = readStatuses([
    { id: "", status: "Draft" },
    { id: " T3 ", status: "archived" },
  ]);
  assert.deepEqual(result.rows, [
    { id: "", status: "draft" },
    { id: " T3 ", status: null },
  ]);
});

test("[boundary-6] readStatuses with no rows gives empty rows and unreadable", () => {
  assert.deepEqual(readStatuses([]), { rows: [], unreadable: [] });
});

test("[boundary-6] readStatuses with no rows gives new empty arrays on each call", () => {
  const first = readStatuses([]);
  const second = readStatuses([]);
  assert.deepEqual(first, { rows: [], unreadable: [] });
  assert.deepEqual(second, { rows: [], unreadable: [] });
  assert.notEqual(first.rows, second.rows);
  assert.notEqual(first.unreadable, second.unreadable);
});

test("[boundary-7] readStatuses keeps rows with duplicate ids as separate rows", () => {
  const result = readStatuses([
    { id: "a", status: "draft" },
    { id: "a", status: "PUBLISHED" },
  ]);
  assert.deepEqual(result.rows, [
    { id: "a", status: "draft" },
    { id: "a", status: "published" },
  ]);
});

test("[boundary-7] readStatuses keeps fully identical rows as separate rows", () => {
  const result = readStatuses([
    { id: "a", status: "draft" },
    { id: "a", status: "draft" },
  ]);
  assert.deepEqual(result.rows, [
    { id: "a", status: "draft" },
    { id: "a", status: "draft" },
  ]);
  assert.notEqual(result.rows[0], result.rows[1]);
});

test("[boundary-8] readStatuses does not modify the input and does not copy extra properties", () => {
  const row = { id: "a", status: " Draft ", owner: "kim" };
  const input = [row];
  const result = readStatuses(input);
  assert.deepEqual(result.rows, [{ id: "a", status: "draft" }]);
  assert.deepEqual(row, { id: "a", status: " Draft ", owner: "kim" });
  assert.equal(input.length, 1);
  assert.equal(input[0], row);
});

test("[boundary-8] readStatuses reads frozen input into new row objects", () => {
  const row = Object.freeze({ id: "a", status: " Bogus ", owner: "kim" });
  const input = Object.freeze([row]);
  const result = readStatuses(input as unknown as StoredStatusRow[]);
  assert.deepEqual(result.rows, [{ id: "a", status: null }]);
  assert.notEqual(result.rows[0], row);
  assert.deepEqual(row, { id: "a", status: " Bogus ", owner: "kim" });
  assert.equal(input.length, 1);
});

test("[happy-5] readStatuses lists unreadable values once, sorted by code unit", () => {
  const result = readStatuses([
    { id: "1", status: "foo" },
    { id: "2", status: "Foo" },
    { id: "3", status: "draft" },
    { id: "4", status: "foo" },
    { id: "5", status: "bar" },
    { id: "6", status: "Foo" },
    { id: "7", status: "in-review" },
  ]);
  assert.deepEqual(result.unreadable, ["Foo", "bar", "foo"]);
});

test("[happy-5] readStatuses sorts unreadable values by UTF-16 code unit, not locale or code point", () => {
  const result = readStatuses([
    { id: "1", status: "～" },
    { id: "2", status: "Éclair" },
    { id: "3", status: "alpha" },
    { id: "4", status: "\u{1F600}" },
    { id: "5", status: "Zeta" },
  ]);
  assert.deepEqual(result.unreadable, ["Zeta", "alpha", "Éclair", "\u{1F600}", "～"]);
});

test("[boundary-9] readStatuses lists unreadable values with their original whitespace", () => {
  const result = readStatuses([
    { id: "1", status: "draft-" },
    { id: "2", status: " bogus" },
    { id: "3", status: "bogus" },
    { id: "4", status: "" },
    { id: "5", status: " bogus" },
  ]);
  assert.deepEqual(result.unreadable, ["", " bogus", "bogus", "draft-"]);
});

test("[boundary-9] readStatuses lists values differing only in whitespace kind separately and omits padded statuses", () => {
  const result = readStatuses([
    { id: "1", status: "\tbogus" },
    { id: "2", status: " bogus" },
    { id: "3", status: " Draft " },
    { id: "4", status: "\tbogus" },
  ]);
  assert.deepEqual(result.unreadable, ["\tbogus", " bogus"]);
});

test("[happy-6] readStatuses with all rows readable gives no unreadable values", () => {
  const result = readStatuses([
    { id: "1", status: "Draft" },
    { id: "2", status: "draft" },
    { id: "3", status: "CLAIMED" },
  ]);
  assert.deepEqual(result.unreadable, []);
});

test("[happy-6] readStatuses never lists a padded old spelling that reads as a status", () => {
  const result = readStatuses([{ id: "1", status: "  In-Review\n" }]);
  assert.deepEqual(result.rows, [{ id: "1", status: "review" }]);
  assert.deepEqual(result.unreadable, []);
});

test("[unhappy-7] readStatuses rejects undefined and null rows with a TypeError", () => {
  assertThrowsType(undefined, "Rows must be an array");
  assertThrowsType(null, "Rows must be an array");
});

test("[unhappy-7] readStatuses rejects a single row object and a string with a TypeError", () => {
  assertThrowsType({ id: "a", status: "x" }, "Rows must be an array");
  assertThrowsType("draft", "Rows must be an array");
});

test("[unhappy-8] readStatuses rejects a row whose status is null or missing", () => {
  assertThrowsType([{ id: "a", status: "draft" }, { id: "b", status: null }], "Sandbox status must be a string");
  assertThrowsType([{ id: "a", status: "draft" }, { id: "b" }], "Sandbox status must be a string");
});

test("[unhappy-8] readStatuses rejects a numeric status or a null row, wherever it is", () => {
  assertThrowsType([{ id: "a", status: "draft" }, { id: "b", status: 3 }], "Sandbox status must be a string");
  assertThrowsType([{ id: "a", status: "draft" }, null], "Sandbox status must be a string");
  assertThrowsType([null, { id: "a", status: "draft" }], "Sandbox status must be a string");
});
