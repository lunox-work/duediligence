import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequisitionsCsv, type Requisition } from "../../src/index.js";

const BOM = "﻿";
const HEADER = "Requisition ID,Title,Status,Openings,Filled,Created\r\n";

function req(overrides: Partial<Requisition> = {}): Requisition {
  return {
    id: "REQ-1",
    title: "Engineer",
    status: "open",
    openings: 3,
    filled: 1,
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
    ...overrides,
  };
}

/** The CSV with the byte order mark and header row checked and removed. */
function body(csv: string): string {
  assert.ok(csv.startsWith(BOM + HEADER), `expected BOM and header, got ${JSON.stringify(csv)}`);
  return csv.slice((BOM + HEADER).length);
}

/** The single data row written for a requisition with this title. */
function titleRow(title: string | null | undefined): string {
  return body(buildRequisitionsCsv([req({ title })]));
}

function namingId(id: string): (err: unknown) => boolean {
  return (err: unknown) => {
    if (!(err instanceof Error)) return false;
    assert.ok(err.message.includes(id), `expected message to name ${id}, got ${JSON.stringify(err.message)}`);
    return true;
  };
}

// Rule: The file has a fixed layout

test("[happy-1] BOM, header, then one row per requisition in creation-time order, each ending CRLF", () => {
  const csv = buildRequisitionsCsv([
    req({ id: "REQ-A", title: "Third", createdAt: new Date("2026-03-01T09:00:00.000Z") }),
    req({ id: "REQ-C", title: "First", createdAt: new Date("2026-01-01T09:00:00.000Z") }),
    req({ id: "REQ-B", title: "Second", createdAt: new Date("2026-02-01T09:00:00.000Z") }),
  ]);
  assert.equal(
    csv,
    BOM +
      HEADER +
      "REQ-C,First,Open,3,1,2026-01-01\r\n" +
      "REQ-B,Second,Open,3,1,2026-02-01\r\n" +
      "REQ-A,Third,Open,3,1,2026-03-01\r\n",
  );
});

test("[happy-1] requisitions with the same creation time are ordered by id", () => {
  const at = new Date("2026-01-15T10:00:00.000Z");
  const csv = buildRequisitionsCsv([
    req({ id: "REQ-C", title: "C", createdAt: at }),
    req({ id: "REQ-A", title: "A", createdAt: new Date(at.getTime()) }),
    req({ id: "REQ-B", title: "B", createdAt: new Date(at.getTime()) }),
  ]);
  assert.equal(
    body(csv),
    "REQ-A,A,Open,3,1,2026-01-15\r\n" +
      "REQ-B,B,Open,3,1,2026-01-15\r\n" +
      "REQ-C,C,Open,3,1,2026-01-15\r\n",
  );
});

test("[happy-2] statuses, numbers, dates and a missing title are written for people to read", () => {
  const csv = buildRequisitionsCsv([
    req({ id: "REQ-1", title: "Nurse", status: "open", openings: 12, filled: 0, createdAt: new Date("2026-01-01T08:00:00.000Z") }),
    req({ id: "REQ-2", title: "Chef", status: "on_hold", openings: 1500, filled: 1000, createdAt: new Date("2026-01-02T08:00:00.000Z") }),
    req({ id: "REQ-3", title: null, status: "filled", openings: 2, filled: 2, createdAt: new Date("2026-01-03T08:00:00.000Z") }),
    req({ id: "REQ-4", title: undefined, status: "cancelled", openings: 0, filled: 0, createdAt: new Date("2026-01-04T08:00:00.000Z") }),
  ]);
  assert.equal(
    body(csv),
    "REQ-1,Nurse,Open,12,0,2026-01-01\r\n" +
      "REQ-2,Chef,On hold,1500,1000,2026-01-02\r\n" +
      "REQ-3,,Filled,2,2,2026-01-03\r\n" +
      "REQ-4,,Cancelled,0,0,2026-01-04\r\n",
  );
});

test("[happy-2] the creation time is written as its UTC date, whatever the offset it was given in", () => {
  const csv = buildRequisitionsCsv([
    req({ id: "REQ-1", createdAt: new Date("2026-06-30T23:30:00.000-05:00") }),
    req({ id: "REQ-2", createdAt: new Date("2026-07-02T00:30:00.000+05:00") }),
    req({ id: "REQ-3", createdAt: new Date("2026-07-02T23:59:59.999Z") }),
  ]);
  assert.equal(
    body(csv),
    "REQ-1,Engineer,Open,3,1,2026-07-01\r\n" +
      "REQ-2,Engineer,Open,3,1,2026-07-01\r\n" +
      "REQ-3,Engineer,Open,3,1,2026-07-02\r\n",
  );
});

test("[boundary-1] no requisitions gives the BOM and the header row alone", () => {
  assert.equal(buildRequisitionsCsv([]), BOM + "Requisition ID,Title,Status,Openings,Filled,Created\r\n");
});

test("[boundary-1] no requisitions gives a single CRLF-terminated row and no blank row after it", () => {
  const csv = buildRequisitionsCsv([]);
  assert.equal(csv.codePointAt(0), 0xfeff);
  assert.deepEqual(csv.slice(1).split("\r\n"), ["Requisition ID,Title,Status,Openings,Filled,Created", ""]);
});

// Rule: Fields are quoted when they must be

test("[boundary-2] a title holding a comma or a double quote is quoted, with inner quotes doubled", () => {
  assert.equal(titleRow("Sales, East"), 'REQ-1,"Sales, East",Open,3,1,2026-01-15\r\n');
  assert.equal(titleRow('The "Best" Job'), 'REQ-1,"The ""Best"" Job",Open,3,1,2026-01-15\r\n');
  assert.equal(titleRow('"'), 'REQ-1,"""",Open,3,1,2026-01-15\r\n');
});

test("[boundary-2] line breaks and edge spaces force quotes; inner spaces alone do not", () => {
  assert.equal(titleRow("Line\nTwo"), 'REQ-1,"Line\nTwo",Open,3,1,2026-01-15\r\n');
  assert.equal(titleRow("Line\rTwo"), 'REQ-1,"Line\rTwo",Open,3,1,2026-01-15\r\n');
  assert.equal(titleRow(" Driver"), 'REQ-1," Driver",Open,3,1,2026-01-15\r\n');
  assert.equal(titleRow("Driver "), 'REQ-1,"Driver ",Open,3,1,2026-01-15\r\n');
  assert.equal(titleRow("Senior Delivery Driver"), "REQ-1,Senior Delivery Driver,Open,3,1,2026-01-15\r\n");
});

// Rule: A cell never runs as a formula

test("[unhappy-1] a title starting with a formula character gets a leading single quote", () => {
  assert.equal(titleRow("=SUM(A1:A9)"), "REQ-1,'=SUM(A1:A9),Open,3,1,2026-01-15\r\n");
  assert.equal(titleRow("+1 Engineer"), "REQ-1,'+1 Engineer,Open,3,1,2026-01-15\r\n");
  assert.equal(titleRow("-Manager"), "REQ-1,'-Manager,Open,3,1,2026-01-15\r\n");
  assert.equal(titleRow("@Lead"), "REQ-1,'@Lead,Open,3,1,2026-01-15\r\n");
  assert.equal(titleRow("\tTotal"), "REQ-1,'\tTotal,Open,3,1,2026-01-15\r\n");
  assert.equal(titleRow("a=b"), "REQ-1,a=b,Open,3,1,2026-01-15\r\n");
});

test("[unhappy-1] the quoting rule applies to the defused field", () => {
  assert.equal(titleRow("\rcmd"), "REQ-1,\"'\rcmd\",Open,3,1,2026-01-15\r\n");
  assert.equal(titleRow('=HYPERLINK("x")'), 'REQ-1,"\'=HYPERLINK(""x"")",Open,3,1,2026-01-15\r\n');
  assert.equal(titleRow("=1,2"), "REQ-1,\"'=1,2\",Open,3,1,2026-01-15\r\n");
  assert.equal(titleRow(" =1"), 'REQ-1," =1",Open,3,1,2026-01-15\r\n');
});

// Rule: Bad data is refused

test("[unhappy-2] each kind of bad requisition is refused with an error naming its id", () => {
  const bad: Array<[string, Partial<Requisition>]> = [
    ["unknown status", { status: "closed" }],
    ["status in the wrong case", { status: "Open" }],
    ["negative openings", { openings: -1, filled: 0 }],
    ["fractional openings", { openings: 2.5, filled: 0 }],
    ["NaN openings", { openings: Number.NaN, filled: 0 }],
    ["negative filled", { filled: -1 }],
    ["fractional filled", { filled: 0.5 }],
    ["filled greater than openings", { openings: 2, filled: 3 }],
    ["invalid creation time", { createdAt: new Date("not a date") }],
  ];
  for (const [label, overrides] of bad) {
    assert.throws(
      () =>
        buildRequisitionsCsv([
          req({ id: "REQ-GOOD" }),
          req({ id: "REQ-BAD-77", ...overrides }),
        ]),
      namingId("REQ-BAD-77"),
      label,
    );
  }
});

test("[unhappy-2] filled one above openings is refused, while filled equal to openings and zeros are accepted", () => {
  assert.equal(body(buildRequisitionsCsv([req({ id: "REQ-EQ", openings: 4, filled: 4 })])), "REQ-EQ,Engineer,Open,4,4,2026-01-15\r\n");
  assert.equal(body(buildRequisitionsCsv([req({ id: "REQ-ZERO", openings: 0, filled: 0 })])), "REQ-ZERO,Engineer,Open,0,0,2026-01-15\r\n");
  assert.throws(() => buildRequisitionsCsv([req({ id: "REQ-OVER", openings: 4, filled: 5 })]), namingId("REQ-OVER"));
  assert.throws(() => buildRequisitionsCsv([req({ id: "REQ-ZERO-OVER", openings: 0, filled: 1 })]), namingId("REQ-ZERO-OVER"));
});
