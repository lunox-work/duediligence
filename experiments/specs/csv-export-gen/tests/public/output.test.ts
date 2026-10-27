import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequisitionsCsv, type Requisition } from "../../src/index.js";

const BOM = "﻿";
const HEADER = "Requisition ID,Title,Status,Openings,Filled,Created";

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

test("[happy-1] a single requisition produces a BOM, the header and one data row", () => {
  const requisitions: Requisition[] = [
    {
      id: "req-1",
      title: "Warehouse Picker",
      status: "open",
      openings: 5,
      filled: 2,
      createdAt: new Date("2026-03-01T09:30:00.000Z"),
    },
  ];
  assert.equal(
    buildRequisitionsCsv(requisitions),
    "﻿Requisition ID,Title,Status,Openings,Filled,Created\r\nreq-1,Warehouse Picker,open,5,2,2026-03-01T09:30:00.000Z\r\n",
  );
});

test("[happy-1] boundary: a single row uses only CRLF terminators, one per row, including the last", () => {
  const requisitions: Requisition[] = [
    {
      id: "req-1",
      title: "Warehouse Picker",
      status: "open",
      openings: 5,
      filled: 2,
      createdAt: new Date("2026-03-01T09:30:00.000Z"),
    },
  ];
  const csv = buildRequisitionsCsv(requisitions);
  assert.equal(count(csv, "\r\n"), 2);
  assert.equal(count(csv, "\n"), 2);
  assert.equal(count(csv, "\r"), 2);
  assert.ok(csv.endsWith("2026-03-01T09:30:00.000Z\r\n"));
});

test("[boundary-1] an empty list produces only the BOM and the header row", () => {
  assert.equal(
    buildRequisitionsCsv([]),
    "﻿Requisition ID,Title,Status,Openings,Filled,Created\r\n",
  );
});

test("[boundary-1] boundary: a frozen empty list produces only the BOM and the header row", () => {
  const empty: readonly Requisition[] = Object.freeze([]);
  assert.equal(buildRequisitionsCsv(empty), BOM + HEADER + "\r\n");
});

test("[happy-2] the BOM appears once, as the first character, and nowhere else", () => {
  const requisitions: Requisition[] = [
    { id: "req-1", title: "Driver", status: "open", openings: 1, filled: 0, createdAt: new Date("2026-03-01T00:00:00.000Z") },
    { id: "req-2", title: "Cook", status: "open", openings: 1, filled: 0, createdAt: new Date("2026-03-02T00:00:00.000Z") },
  ];
  const csv = buildRequisitionsCsv(requisitions);
  assert.equal(csv[0], "﻿");
  assert.equal(count(csv, "﻿"), 1);
  assert.equal(count(csv, "\r\n"), 3);
  assert.ok(csv.endsWith("\r\n"));
});

test("[happy-2] boundary: with no requisitions the BOM is still first and occurs exactly once", () => {
  const csv = buildRequisitionsCsv([]);
  assert.equal(csv[0], "﻿");
  assert.equal(count(csv, "﻿"), 1);
  assert.equal(count(csv, "\r\n"), 1);
  assert.ok(csv.endsWith("\r\n"));
});
