import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequisitionsCsv, type Requisition } from "../../src/index.js";

const PREFIX = "﻿Requisition ID,Title,Status,Openings,Filled,Created\r\n";

function req(fields: Record<string, unknown>): Requisition {
  return {
    id: "req-1",
    title: "Cook",
    status: "open",
    openings: 1,
    filled: 0,
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    ...fields,
  } as unknown as Requisition;
}

/** The whole CSV for a single requisition whose data row is `row`. */
function single(row: string): string {
  return PREFIX + row + "\r\n";
}

const fieldFormats: { status: string; openings: number; filled: number; createdAt: string; row: string }[] = [
  { status: "open", openings: 5, filled: 2, createdAt: "2026-03-01T09:30:00.000Z", row: "req-1,Cook,open,5,2,2026-03-01T09:30:00.000Z" },
  { status: "on_hold", openings: 3, filled: 0, createdAt: "2026-03-01T09:30:00.000Z", row: "req-1,Cook,on_hold,3,0,2026-03-01T09:30:00.000Z" },
  { status: "filled", openings: 4, filled: 4, createdAt: "2026-03-01T09:30:00.000Z", row: "req-1,Cook,filled,4,4,2026-03-01T09:30:00.000Z" },
  { status: "cancelled", openings: 0, filled: 0, createdAt: "2026-03-01T09:30:00.000Z", row: "req-1,Cook,cancelled,0,0,2026-03-01T09:30:00.000Z" },
  { status: "open", openings: 1200, filled: 1000, createdAt: "2026-03-01T09:30:00.000Z", row: "req-1,Cook,open,1200,1000,2026-03-01T09:30:00.000Z" },
  { status: "open", openings: 1, filled: 0, createdAt: "2026-03-01T11:30:00.000+02:00", row: "req-1,Cook,open,1,0,2026-03-01T09:30:00.000Z" },
  { status: "open", openings: 1, filled: 0, createdAt: "2026-03-01T09:30:00.123Z", row: "req-1,Cook,open,1,0,2026-03-01T09:30:00.123Z" },
];

for (const example of fieldFormats) {
  test(`[happy-3] field formats: status ${example.status}, openings ${example.openings}, filled ${example.filled}, createdAt ${example.createdAt}`, () => {
    const csv = buildRequisitionsCsv([
      req({
        status: example.status,
        openings: example.openings,
        filled: example.filled,
        createdAt: new Date(example.createdAt),
      }),
    ]);
    assert.equal(csv, single(example.row));
  });
}

test("[happy-3] boundary: an offset that crosses midnight is written as the previous UTC day", () => {
  const csv = buildRequisitionsCsv([req({ createdAt: new Date("2026-03-01T00:30:00.000+01:00") })]);
  assert.equal(csv, single("req-1,Cook,open,1,0,2026-02-28T23:30:00.000Z"));
});

test("[boundary-2] negative zero is accepted and written as 0", () => {
  const csv = buildRequisitionsCsv([
    req({ openings: -0, filled: -0, createdAt: new Date("2026-03-01T00:00:00.000Z") }),
  ]);
  assert.equal(csv, single("req-1,Cook,open,0,0,2026-03-01T00:00:00.000Z"));
});

test("[boundary-2] boundary: negative zero filled alongside positive openings is written as 0", () => {
  const csv = buildRequisitionsCsv([req({ openings: 5, filled: -0 })]);
  assert.equal(csv, single("req-1,Cook,open,5,0,2026-03-01T00:00:00.000Z"));
});

test("[boundary-3] the largest safe integer is accepted and written in full", () => {
  const csv = buildRequisitionsCsv([
    req({ openings: 9007199254740991, filled: 9007199254740991 }),
  ]);
  assert.equal(
    csv,
    single("req-1,Cook,open,9007199254740991,9007199254740991,2026-03-01T00:00:00.000Z"),
  );
});

test("[boundary-3] boundary: the largest safe integer of openings with zero filled is written in full", () => {
  const csv = buildRequisitionsCsv([req({ openings: Number.MAX_SAFE_INTEGER, filled: 0 })]);
  assert.equal(csv, single("req-1,Cook,open,9007199254740991,0,2026-03-01T00:00:00.000Z"));
});

test("[boundary-4] a missing title: an absent title property is an empty field", () => {
  const requisition: Requisition = {
    id: "req-1",
    status: "open",
    openings: 1,
    filled: 0,
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
  };
  assert.ok(!("title" in requisition));
  assert.equal(buildRequisitionsCsv([requisition]), single("req-1,,open,1,0,2026-03-01T00:00:00.000Z"));
});

test("[boundary-4] a missing title: a null title is an empty field", () => {
  const csv = buildRequisitionsCsv([req({ title: null })]);
  assert.equal(csv, single("req-1,,open,1,0,2026-03-01T00:00:00.000Z"));
});

test("[boundary-4] a missing title: an empty-string title is an empty field", () => {
  const csv = buildRequisitionsCsv([req({ title: "" })]);
  assert.equal(csv, single("req-1,,open,1,0,2026-03-01T00:00:00.000Z"));
});

test("[boundary-4] boundary: a title of a single space is not missing and is written unquoted", () => {
  const csv = buildRequisitionsCsv([req({ title: " " })]);
  assert.equal(csv, single("req-1, ,open,1,0,2026-03-01T00:00:00.000Z"));
});

test("[boundary-5] text is written as given, without trimming or normalising", () => {
  const csv = buildRequisitionsCsv([req({ id: " req 1 ", title: "  Café  Läufer 🚚  " })]);
  assert.equal(csv, single(" req 1 ,  Café  Läufer 🚚  ,open,1,0,2026-03-01T00:00:00.000Z"));
});

test("[boundary-5] boundary: a decomposed accent is kept decomposed, not Unicode-normalised", () => {
  const title = "Café";
  const csv = buildRequisitionsCsv([req({ title })]);
  assert.equal(csv, single("req-1,Café,open,1,0,2026-03-01T00:00:00.000Z"));
  assert.ok(!csv.includes("Café"));
});

test("[boundary-6] an empty id is written as an empty field", () => {
  const csv = buildRequisitionsCsv([req({ id: "" })]);
  assert.equal(csv, single(",Cook,open,1,0,2026-03-01T00:00:00.000Z"));
});

test("[boundary-6] boundary: an empty id with a missing title gives two empty leading fields", () => {
  const csv = buildRequisitionsCsv([req({ id: "", title: null })]);
  assert.equal(csv, single(",,open,1,0,2026-03-01T00:00:00.000Z"));
});
