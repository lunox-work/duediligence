import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequisitionsCsv, type Requisition } from "../../src/index.js";

const header = "\uFEFFRequisition ID,Title,Status,Openings,Filled,Created\r\n";

function requisition(overrides: Partial<Requisition> = {}): Requisition {
  return {
    id: "req-1",
    title: "Engineer",
    status: "open",
    openings: 3,
    filled: 1,
    createdAt: new Date("2025-06-15T12:00:00.000Z"),
    ...overrides,
  };
}

test("[happy-1] One requisition follows the BOM and fixed header with a final CRLF", () => {
  assert.equal(
    buildRequisitionsCsv([requisition()]),
    header + "req-1,Engineer,Open,3,1,2025-06-15\r\n",
  );
});

test("[happy-1] Rows sort by creation time and then id when times are equal", () => {
  const at = new Date("2025-06-15T12:00:00.000Z");
  const rows = [
    requisition({ id: "req-z", createdAt: at }),
    requisition({ id: "req-first", createdAt: new Date("2025-06-14T12:00:00.000Z") }),
    requisition({ id: "req-a", createdAt: new Date(at.getTime()) }),
    requisition({ id: "req-last", createdAt: new Date("2025-06-16T12:00:00.000Z") }),
  ];
  assert.equal(
    buildRequisitionsCsv(rows),
    header +
      "req-first,Engineer,Open,3,1,2025-06-14\r\n" +
      "req-a,Engineer,Open,3,1,2025-06-15\r\n" +
      "req-z,Engineer,Open,3,1,2025-06-15\r\n" +
      "req-last,Engineer,Open,3,1,2025-06-16\r\n",
  );
});

test("[happy-1] Distinct instants on the same UTC date sort before applying the id tie breaker", () => {
  assert.equal(
    buildRequisitionsCsv([
      requisition({ id: "req-a", createdAt: new Date("2025-06-15T00:00:00.001Z") }),
      requisition({ id: "req-z", createdAt: new Date("2025-06-15T00:00:00.000Z") }),
    ]),
    header +
      "req-z,Engineer,Open,3,1,2025-06-15\r\n" +
      "req-a,Engineer,Open,3,1,2025-06-15\r\n",
  );
});

test("[happy-2] All four statuses use their human readable labels", () => {
  assert.equal(
    buildRequisitionsCsv([
      requisition({ id: "a", status: "open" }),
      requisition({ id: "b", status: "on_hold" }),
      requisition({ id: "c", status: "filled" }),
      requisition({ id: "d", status: "cancelled" }),
    ]),
    header +
      "a,Engineer,Open,3,1,2025-06-15\r\n" +
      "b,Engineer,On hold,3,1,2025-06-15\r\n" +
      "c,Engineer,Filled,3,1,2025-06-15\r\n" +
      "d,Engineer,Cancelled,3,1,2025-06-15\r\n",
  );
});

test("[happy-2] An absent title, null title and empty title are empty fields", () => {
  const { title: omitted, ...withoutTitle } = requisition({ id: "a" });
  assert.equal(
    buildRequisitionsCsv([
      withoutTitle,
      requisition({ id: "b", title: null }),
      requisition({ id: "c", title: "" }),
    ]),
    header +
      "a,,Open,3,1,2025-06-15\r\n" +
      "b,,Open,3,1,2025-06-15\r\n" +
      "c,,Open,3,1,2025-06-15\r\n",
  );
});

test("[happy-2] Creation dates use UTC across a year boundary and pad month and day", () => {
  assert.equal(
    buildRequisitionsCsv([
      requisition({ id: "a", createdAt: new Date("2025-01-01T00:30:00+02:00") }),
      requisition({ id: "b", createdAt: new Date("2024-12-31T23:30:00-02:00") }),
    ]),
    header +
      "a,Engineer,Open,3,1,2024-12-31\r\n" +
      "b,Engineer,Open,3,1,2025-01-01\r\n",
  );
});

test("[happy-2] Zero and multi digit counts are plain digits without separators", () => {
  assert.equal(
    buildRequisitionsCsv([
      requisition({ id: "a", openings: 0, filled: 0 }),
      requisition({ id: "b", openings: 12345, filled: 1234 }),
    ]),
    header +
      "a,Engineer,Open,0,0,2025-06-15\r\n" +
      "b,Engineer,Open,12345,1234,2025-06-15\r\n",
  );
});

test("[happy-2] Large whole number counts are digits rather than exponent notation", () => {
  assert.equal(
    buildRequisitionsCsv([requisition({ openings: 1e21, filled: 1e21 })]),
    header + "req-1,Engineer,Open,1000000000000000000000,1000000000000000000000,2025-06-15\r\n",
  );
});

test("[boundary-1] No requisitions produces exactly the BOM and header row", () => {
  assert.equal(buildRequisitionsCsv([]), header);
});

test("[boundary-1] The transition from zero records to one adds exactly one data row", () => {
  const one = buildRequisitionsCsv([requisition()]);
  const empty = buildRequisitionsCsv([]);
  assert.equal(empty, header);
  assert.equal(one, empty + "req-1,Engineer,Open,3,1,2025-06-15\r\n");
});
