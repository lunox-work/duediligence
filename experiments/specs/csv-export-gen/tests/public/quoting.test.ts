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

function single(row: string): string {
  return PREFIX + row + "\r\n";
}

const titleQuoting: { title: string; row: string }[] = [
  { title: "Picker, night shift", row: "req-1,\"Picker, night shift\",open,1,0,2026-03-01T00:00:00.000Z" },
  { title: "The \"Big\" Role", row: "req-1,\"The \"\"Big\"\" Role\",open,1,0,2026-03-01T00:00:00.000Z" },
  { title: "Line one\nLine two", row: "req-1,\"Line one\nLine two\",open,1,0,2026-03-01T00:00:00.000Z" },
  { title: "Line one\r\nLine two", row: "req-1,\"Line one\r\nLine two\",open,1,0,2026-03-01T00:00:00.000Z" },
  { title: "Ends with CR\r", row: "req-1,\"Ends with CR\r\",open,1,0,2026-03-01T00:00:00.000Z" },
  { title: "\"", row: "req-1,\"\"\"\",open,1,0,2026-03-01T00:00:00.000Z" },
  { title: "Senior; Cook's mate", row: "req-1,Senior; Cook's mate,open,1,0,2026-03-01T00:00:00.000Z" },
];

for (const example of titleQuoting) {
  test(`[happy-4] quoting the title ${JSON.stringify(example.title)}`, () => {
    const csv = buildRequisitionsCsv([req({ title: example.title })]);
    assert.equal(csv, single(example.row));
  });
}

test("[happy-4] boundary: a title that is only a comma is quoted", () => {
  const csv = buildRequisitionsCsv([req({ title: "," })]);
  assert.equal(csv, single("req-1,\",\",open,1,0,2026-03-01T00:00:00.000Z"));
});

test("[happy-4] boundary: a lone LF in a title is kept as given, not converted to CRLF", () => {
  const csv = buildRequisitionsCsv([req({ title: "a\nb" })]);
  assert.equal(csv, single("req-1,\"a\nb\",open,1,0,2026-03-01T00:00:00.000Z"));
  assert.ok(!csv.includes("a\r\nb"));
});

test("[happy-5] quoting the id", () => {
  const csv = buildRequisitionsCsv([req({ id: "req,1" })]);
  assert.equal(csv, single("\"req,1\",Cook,open,1,0,2026-03-01T00:00:00.000Z"));
});

test("[happy-5] boundary: a double quote in the id is doubled inside a quoted field", () => {
  const csv = buildRequisitionsCsv([req({ id: "req\"1" })]);
  assert.equal(csv, single("\"req\"\"1\",Cook,open,1,0,2026-03-01T00:00:00.000Z"));
});
