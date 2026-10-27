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

const formulaTitles: { title: string; row: string }[] = [
  { title: "=SUM(A1:A9)", row: "req-1,'=SUM(A1:A9),open,1,0,2026-03-01T00:00:00.000Z" },
  { title: "+44 hires", row: "req-1,'+44 hires,open,1,0,2026-03-01T00:00:00.000Z" },
  { title: "-Cook", row: "req-1,'-Cook,open,1,0,2026-03-01T00:00:00.000Z" },
  { title: "@cmd", row: "req-1,'@cmd,open,1,0,2026-03-01T00:00:00.000Z" },
  { title: "\tCook", row: "req-1,'\tCook,open,1,0,2026-03-01T00:00:00.000Z" },
  { title: "\rCook", row: "req-1,\"'\rCook\",open,1,0,2026-03-01T00:00:00.000Z" },
  { title: "=HYPERLINK(\"x\",1)", row: "req-1,\"'=HYPERLINK(\"\"x\"\",1)\",open,1,0,2026-03-01T00:00:00.000Z" },
  { title: " =1+1", row: "req-1, =1+1,open,1,0,2026-03-01T00:00:00.000Z" },
  { title: "Cook = Chef", row: "req-1,Cook = Chef,open,1,0,2026-03-01T00:00:00.000Z" },
  { title: "'quoted", row: "req-1,'quoted,open,1,0,2026-03-01T00:00:00.000Z" },
];

for (const example of formulaTitles) {
  test(`[unhappy-1] neutralising the formula-like title ${JSON.stringify(example.title)}`, () => {
    const csv = buildRequisitionsCsv([req({ title: example.title })]);
    assert.equal(csv, single(example.row));
  });
}

test("[unhappy-1] boundary: a title that is only \"=\" is prefixed", () => {
  const csv = buildRequisitionsCsv([req({ title: "=" })]);
  assert.equal(csv, single("req-1,'=,open,1,0,2026-03-01T00:00:00.000Z"));
});

test("[unhappy-2] neutralising a formula-like id", () => {
  const csv = buildRequisitionsCsv([req({ id: "=1+1" })]);
  assert.equal(csv, single("'=1+1,Cook,open,1,0,2026-03-01T00:00:00.000Z"));
});

test("[unhappy-2] boundary: a formula-like id with a comma is prefixed, then quoted", () => {
  const csv = buildRequisitionsCsv([req({ id: "@x,y" })]);
  assert.equal(csv, single("\"'@x,y\",Cook,open,1,0,2026-03-01T00:00:00.000Z"));
});
