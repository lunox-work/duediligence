import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequisitionsCsv, type Requisition } from "../../src/index.js";

const PREFIX = "﻿Requisition ID,Title,Status,Openings,Filled,Created\r\n";

function req(fields: Record<string, unknown>): Requisition {
  return {
    id: "req-7",
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

function assertThrowsMessage(requisitions: readonly Requisition[], message: string): void {
  assert.throws(
    () => buildRequisitionsCsv(requisitions),
    (error: unknown) => {
      if (!(error instanceof Error)) throw new assert.AssertionError({ message: "expected an Error" });
      assert.equal(error.message, message);
      return true;
    },
  );
}

// Unknown status

const unknownStatuses: { status: unknown; message: string }[] = [
  { status: "closed", message: "Requisition req-7: unknown status \"closed\"" },
  { status: "Open", message: "Requisition req-7: unknown status \"Open\"" },
  { status: "on-hold", message: "Requisition req-7: unknown status \"on-hold\"" },
  { status: " open", message: "Requisition req-7: unknown status \" open\"" },
  { status: "", message: "Requisition req-7: unknown status \"\"" },
  { status: undefined, message: "Requisition req-7: unknown status \"undefined\"" },
  { status: null, message: "Requisition req-7: unknown status \"null\"" },
];

for (const example of unknownStatuses) {
  test(`[unhappy-3] the unknown status ${String(JSON.stringify(example.status))} throws`, () => {
    assertThrowsMessage([req({ status: example.status })], example.message);
  });
}

test("[unhappy-3] boundary: a non-string status is reported via String(status)", () => {
  assertThrowsMessage([req({ status: 1 })], "Requisition req-7: unknown status \"1\"");
});

// Counts

const invalidOpenings: { label: string; openings: unknown }[] = [
  { label: "-1", openings: -1 },
  { label: "1.5", openings: 1.5 },
  { label: "0.1", openings: 0.1 },
  { label: "NaN", openings: NaN },
  { label: "Infinity", openings: Infinity },
  { label: "-Infinity", openings: -Infinity },
  { label: "9007199254740992", openings: 9007199254740992 },
  { label: "\"3\"", openings: "3" },
  { label: "null", openings: null },
  { label: "undefined", openings: undefined },
];

for (const example of invalidOpenings) {
  test(`[unhappy-4] openings ${example.label} throws`, () => {
    assertThrowsMessage(
      [req({ openings: example.openings, filled: 0 })],
      "Requisition req-7: openings must be a whole number of at least 0",
    );
  });
}

test("[unhappy-4] boundary: a boxed Number for openings is not of type number and throws", () => {
  assertThrowsMessage(
    [req({ openings: new Number(3), filled: 0 })],
    "Requisition req-7: openings must be a whole number of at least 0",
  );
});

const invalidFilled: { label: string; filled: unknown }[] = [
  { label: "-1", filled: -1 },
  { label: "2.5", filled: 2.5 },
  { label: "NaN", filled: NaN },
  { label: "Infinity", filled: Infinity },
  { label: "\"2\"", filled: "2" },
  { label: "null", filled: null },
  { label: "undefined", filled: undefined },
];

for (const example of invalidFilled) {
  test(`[unhappy-5] filled ${example.label} throws`, () => {
    assertThrowsMessage(
      [req({ openings: 5, filled: example.filled })],
      "Requisition req-7: filled must be a whole number of at least 0",
    );
  });
}

test("[unhappy-5] boundary: filled one past the largest safe integer is not a whole number", () => {
  assertThrowsMessage(
    [req({ openings: 9007199254740991, filled: 9007199254740992 })],
    "Requisition req-7: filled must be a whole number of at least 0",
  );
});

test("[boundary-11] zero openings and zero filled are valid", () => {
  const csv = buildRequisitionsCsv([
    req({ id: "req-1", status: "cancelled", openings: 0, filled: 0 }),
  ]);
  assert.equal(csv, single("req-1,Cook,cancelled,0,0,2026-03-01T00:00:00.000Z"));
});

test("[boundary-11] boundary: zero openings and zero filled are valid with status filled", () => {
  const csv = buildRequisitionsCsv([
    req({ id: "req-1", status: "filled", openings: 0, filled: 0 }),
  ]);
  assert.equal(csv, single("req-1,Cook,filled,0,0,2026-03-01T00:00:00.000Z"));
});

// Filled greater than openings

test("[unhappy-6] filled greater than openings throws", () => {
  assertThrowsMessage(
    [req({ status: "open", openings: 3, filled: 4 })],
    "Requisition req-7: filled (4) is greater than openings (3)",
  );
});

test("[unhappy-6] boundary: filled greater by one at the largest safe integers throws with both numbers in plain decimal", () => {
  assertThrowsMessage(
    [req({ openings: 9007199254740990, filled: 9007199254740991 })],
    "Requisition req-7: filled (9007199254740991) is greater than openings (9007199254740990)",
  );
});

test("[unhappy-7] any filled count with zero openings throws", () => {
  assertThrowsMessage(
    [req({ status: "cancelled", openings: 0, filled: 1 })],
    "Requisition req-7: filled (1) is greater than openings (0)",
  );
});

test("[unhappy-7] boundary: the largest safe filled count with zero openings throws", () => {
  assertThrowsMessage(
    [req({ status: "cancelled", openings: 0, filled: 9007199254740991 })],
    "Requisition req-7: filled (9007199254740991) is greater than openings (0)",
  );
});

test("[boundary-12] filled equal to openings is valid", () => {
  const csv = buildRequisitionsCsv([req({ id: "req-1", status: "open", openings: 3, filled: 3 })]);
  assert.equal(csv, single("req-1,Cook,open,3,3,2026-03-01T00:00:00.000Z"));
});

test("[boundary-12] boundary: filled equal to openings at 1 is valid for status cancelled", () => {
  const csv = buildRequisitionsCsv([req({ id: "req-1", status: "cancelled", openings: 1, filled: 1 })]);
  assert.equal(csv, single("req-1,Cook,cancelled,1,1,2026-03-01T00:00:00.000Z"));
});

test("[boundary-13] status is not checked against the counts", () => {
  const csv = buildRequisitionsCsv([
    req({ id: "req-1", title: "A", status: "filled", openings: 3, filled: 1, createdAt: new Date("2026-03-01T00:00:00.000Z") }),
    req({ id: "req-2", title: "B", status: "open", openings: 2, filled: 2, createdAt: new Date("2026-03-02T00:00:00.000Z") }),
  ]);
  assert.equal(
    csv,
    PREFIX +
      "req-1,A,filled,3,1,2026-03-01T00:00:00.000Z\r\n" +
      "req-2,B,open,2,2,2026-03-02T00:00:00.000Z\r\n",
  );
});

test("[boundary-13] boundary: cancelled fully filled and on_hold with no openings are accepted", () => {
  const csv = buildRequisitionsCsv([
    req({ id: "req-1", title: "A", status: "cancelled", openings: 2, filled: 2, createdAt: new Date("2026-03-01T00:00:00.000Z") }),
    req({ id: "req-2", title: "B", status: "on_hold", openings: 0, filled: 0, createdAt: new Date("2026-03-02T00:00:00.000Z") }),
  ]);
  assert.equal(
    csv,
    PREFIX +
      "req-1,A,cancelled,2,2,2026-03-01T00:00:00.000Z\r\n" +
      "req-2,B,on_hold,0,0,2026-03-02T00:00:00.000Z\r\n",
  );
});

// Creation time

const invalidCreatedAt: { label: string; createdAt: unknown }[] = [
  { label: "new Date(NaN)", createdAt: new Date(NaN) },
  { label: "new Date(\"not a date\")", createdAt: new Date("not a date") },
  { label: "the string \"2026-03-01T00:00:00.000Z\"", createdAt: "2026-03-01T00:00:00.000Z" },
  { label: "the number 1772323200000", createdAt: 1772323200000 },
  { label: "null", createdAt: null },
  { label: "undefined", createdAt: undefined },
];

for (const example of invalidCreatedAt) {
  test(`[unhappy-8] createdAt ${example.label} throws`, () => {
    assertThrowsMessage([req({ createdAt: example.createdAt })], "Requisition req-7: invalid creation time");
  });
}

test("[unhappy-8] boundary: a Date one millisecond past the maximum time value is invalid", () => {
  assertThrowsMessage([req({ createdAt: new Date(8.64e15 + 1) })], "Requisition req-7: invalid creation time");
});

test("[unhappy-8] boundary: a Date-like object that is not a Date instance is invalid", () => {
  const dateLike = {
    getTime: () => 0,
    toISOString: () => "1970-01-01T00:00:00.000Z",
    valueOf: () => 0,
  };
  assertThrowsMessage([req({ createdAt: dateLike })], "Requisition req-7: invalid creation time");
});

test("[boundary-14] the Unix epoch is a valid creation time", () => {
  const csv = buildRequisitionsCsv([req({ id: "req-1", createdAt: new Date("1970-01-01T00:00:00.000Z") })]);
  assert.equal(csv, single("req-1,Cook,open,1,0,1970-01-01T00:00:00.000Z"));
});

test("[boundary-14] boundary: one millisecond before the Unix epoch is a valid creation time", () => {
  const csv = buildRequisitionsCsv([req({ id: "req-1", createdAt: new Date(-1) })]);
  assert.equal(csv, single("req-1,Cook,open,1,0,1969-12-31T23:59:59.999Z"));
});

// Validation order

test("[unhappy-9] the first invalid requisition in input order is reported, not the first in creation order", () => {
  assertThrowsMessage(
    [
      req({ id: "req-1", title: "A", status: "open", openings: 1, filled: 0, createdAt: new Date("2026-03-05T00:00:00.000Z") }),
      req({ id: "req-2", title: "B", status: "closed", openings: 1, filled: 0, createdAt: new Date("2026-03-04T00:00:00.000Z") }),
      req({ id: "req-3", title: "C", status: "open", openings: -1, filled: 0, createdAt: new Date("2026-03-01T00:00:00.000Z") }),
    ],
    "Requisition req-2: unknown status \"closed\"",
  );
});

test("[unhappy-9] boundary: an earlier requisition failing a later check is reported before a later requisition failing an earlier check", () => {
  assertThrowsMessage(
    [
      req({ id: "req-1", status: "open", openings: 1, filled: 0, createdAt: new Date(NaN) }),
      req({ id: "req-2", status: "closed", openings: 1, filled: 0, createdAt: new Date("2026-03-01T00:00:00.000Z") }),
    ],
    "Requisition req-1: invalid creation time",
  );
});

const checkOrder: { status: string; openings: number; filled: number; message: string }[] = [
  { status: "closed", openings: -1, filled: 9, message: "Requisition req-7: unknown status \"closed\"" },
  { status: "open", openings: -1, filled: 1.5, message: "Requisition req-7: openings must be a whole number of at least 0" },
  { status: "open", openings: 2, filled: 1.5, message: "Requisition req-7: filled must be a whole number of at least 0" },
  { status: "open", openings: 2, filled: 3, message: "Requisition req-7: filled (3) is greater than openings (2)" },
  { status: "open", openings: 2, filled: 2, message: "Requisition req-7: invalid creation time" },
];

for (const example of checkOrder) {
  test(`[unhappy-10] check order: status ${example.status}, openings ${example.openings}, filled ${example.filled}, invalid createdAt`, () => {
    assertThrowsMessage(
      [req({ status: example.status, openings: example.openings, filled: example.filled, createdAt: new Date(NaN) })],
      example.message,
    );
  });
}

test("[unhappy-10] boundary: a string openings is reported as openings, not compared with filled", () => {
  assertThrowsMessage(
    [req({ status: "open", openings: "3", filled: 4, createdAt: new Date(NaN) })],
    "Requisition req-7: openings must be a whole number of at least 0",
  );
});

test("[unhappy-11] the error names the id exactly as given, without CSV quoting or prefixing", () => {
  assertThrowsMessage(
    [req({ id: "=req, \"7\"", status: "closed" })],
    "Requisition =req, \"7\": unknown status \"closed\"",
  );
});

test("[unhappy-11] boundary: an id with a leading tab and an embedded line break is named as given", () => {
  assertThrowsMessage(
    [req({ id: "\tre\nq", openings: -1 })],
    "Requisition \tre\nq: openings must be a whole number of at least 0",
  );
});
