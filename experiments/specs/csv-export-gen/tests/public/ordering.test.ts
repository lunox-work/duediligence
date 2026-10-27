import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequisitionsCsv, type Requisition } from "../../src/index.js";

const PREFIX = "﻿Requisition ID,Title,Status,Openings,Filled,Created\r\n";

function req(id: string, title: string, createdAt: string, fields: Partial<Requisition> = {}): Requisition {
  return { id, title, status: "open", openings: 1, filled: 0, createdAt: new Date(createdAt), ...fields };
}

/** The data rows of a CSV whose fields contain no line breaks. */
function dataRows(csv: string): string[] {
  assert.ok(csv.startsWith(PREFIX));
  assert.ok(csv.endsWith("\r\n"));
  const body = csv.slice(PREFIX.length, -2);
  return body === "" ? [] : body.split("\r\n");
}

/** Column `index` of each data row, for rows whose fields contain no commas or quotes. */
function column(csv: string, index: number): string[] {
  return dataRows(csv).map((row) => row.split(",")[index]!);
}

test("[happy-6] rows are sorted by createdAt ascending regardless of input order", () => {
  const csv = buildRequisitionsCsv([
    req("req-c", "C", "2026-03-03T00:00:00.000Z", { status: "open", openings: 1, filled: 0 }),
    req("req-a", "A", "2026-03-01T00:00:00.000Z", { status: "filled", openings: 1, filled: 1 }),
    req("req-b", "B", "2026-03-02T00:00:00.000Z", { status: "on_hold", openings: 1, filled: 0 }),
  ]);
  assert.equal(
    csv,
    PREFIX +
      "req-a,A,filled,1,1,2026-03-01T00:00:00.000Z\r\n" +
      "req-b,B,on_hold,1,0,2026-03-02T00:00:00.000Z\r\n" +
      "req-c,C,open,1,0,2026-03-03T00:00:00.000Z\r\n",
  );
});

test("[happy-6] boundary: a time before the Unix epoch sorts before the epoch", () => {
  const csv = buildRequisitionsCsv([
    req("req-a", "A", "1970-01-01T00:00:00.000Z"),
    req("req-b", "B", "1969-12-31T23:59:59.999Z"),
  ]);
  assert.deepEqual(column(csv, 0), ["req-b", "req-a"]);
});

test("[boundary-7] equal creation times are ordered by id in code-unit order", () => {
  const csv = buildRequisitionsCsv([
    req("req-2", "T2", "2026-03-01T00:00:00.000Z"),
    req("b", "Tb", "2026-03-01T00:00:00.000Z"),
    req("req-10", "T10", "2026-03-01T00:00:00.000Z"),
    req("B", "TB", "2026-03-01T00:00:00.000Z"),
  ]);
  assert.deepEqual(column(csv, 0), ["B", "b", "req-10", "req-2"]);
});

test("[boundary-7] boundary: a surrogate pair sorts before a high BMP character, by UTF-16 code unit", () => {
  // U+1F600 is encoded as 😀, and 0xD83D < 0xFF5A, although U+1F600 > U+FF5A as a code point.
  const csv = buildRequisitionsCsv([
    req("ｚ", "Fullwidth", "2026-03-01T00:00:00.000Z"),
    req("\u{1F600}", "Emoji", "2026-03-01T00:00:00.000Z"),
  ]);
  assert.deepEqual(column(csv, 0), ["\u{1F600}", "ｚ"]);
});

test("[boundary-8] the same instant written with different offsets counts as equal", () => {
  const csv = buildRequisitionsCsv([
    req("req-b", "B", "2026-03-01T11:00:00.000+02:00"),
    req("req-a", "A", "2026-03-01T09:00:00.000Z"),
  ]);
  assert.deepEqual(column(csv, 0), ["req-a", "req-b"]);
  for (const row of dataRows(csv)) assert.ok(row.endsWith(",2026-03-01T09:00:00.000Z"));
});

test("[boundary-8] boundary: a negative offset for the same instant also ties and is broken by id", () => {
  const csv = buildRequisitionsCsv([
    req("req-b", "B", "2026-03-01T09:00:00.000Z"),
    req("req-a", "A", "2026-03-01T04:00:00.000-05:00"),
  ]);
  assert.deepEqual(column(csv, 0), ["req-a", "req-b"]);
  for (const row of dataRows(csv)) assert.ok(row.endsWith(",2026-03-01T09:00:00.000Z"));
});

test("[boundary-9] one millisecond apart is ordered by time, not by id", () => {
  const csv = buildRequisitionsCsv([
    req("req-a", "A", "2026-03-01T00:00:00.001Z"),
    req("req-z", "Z", "2026-03-01T00:00:00.000Z"),
  ]);
  assert.deepEqual(column(csv, 0), ["req-z", "req-a"]);
});

test("[boundary-9] boundary: one millisecond apart across a second boundary is ordered by time", () => {
  const csv = buildRequisitionsCsv([
    req("a", "A", "2026-03-01T00:00:01.000Z"),
    req("b", "B", "2026-03-01T00:00:00.999Z"),
  ]);
  assert.deepEqual(column(csv, 0), ["b", "a"]);
});

test("[boundary-10] duplicate ids with equal creation times keep input order", () => {
  const csv = buildRequisitionsCsv([
    req("req-1", "First", "2026-03-01T00:00:00.000Z", { openings: 1 }),
    req("req-1", "Second", "2026-03-01T00:00:00.000Z", { openings: 2 }),
  ]);
  assert.deepEqual(column(csv, 1), ["First", "Second"]);
});

test("[boundary-10] boundary: three full ties keep input order, not title order", () => {
  const csv = buildRequisitionsCsv([
    req("req-1", "Z", "2026-03-01T00:00:00.000Z"),
    req("req-1", "A", "2026-03-01T00:00:00.000Z"),
    req("req-1", "M", "2026-03-01T00:00:00.000Z"),
  ]);
  assert.deepEqual(column(csv, 1), ["Z", "A", "M"]);
});
