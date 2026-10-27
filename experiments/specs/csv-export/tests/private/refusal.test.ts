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

function namingId(id: string): (err: unknown) => boolean {
  return (err: unknown) => {
    if (!(err instanceof Error)) return false;
    assert.ok(err.message.includes(id), `expected message to name ${id}, got ${JSON.stringify(err.message)}`);
    return true;
  };
}

/** Asserts that each bad variant, placed among good requisitions, is refused naming its id. */
function assertEachRefused(bad: Array<[string, Partial<Requisition>]>): void {
  for (const [label, overrides] of bad) {
    assert.throws(
      () =>
        buildRequisitionsCsv([
          req({ id: "REQ-GOOD-1", createdAt: new Date("2026-01-01T00:00:00.000Z") }),
          req({ id: "REQ-BAD-4821", ...overrides }),
          req({ id: "REQ-GOOD-2", createdAt: new Date("2026-02-01T00:00:00.000Z") }),
        ]),
      namingId("REQ-BAD-4821"),
      label,
    );
  }
}

// Rule: Bad data is refused

// Extends "[unhappy-2] each kind of bad requisition is refused with an error naming its id":
// a lookup that uses `in` or a plain object index accepts these.
test("[unhappy-2] a status that is an Object prototype key is refused", () => {
  assertEachRefused([
    ["toString", { status: "toString" }],
    ["constructor", { status: "constructor" }],
    ["__proto__", { status: "__proto__" }],
    ["hasOwnProperty", { status: "hasOwnProperty" }],
    ["valueOf", { status: "valueOf" }],
  ]);
});

// Extends "[unhappy-2] each kind of bad requisition is refused with an error naming its id".
test("[unhappy-2] a status close to a valid one is refused", () => {
  assertEachRefused([
    ["empty", { status: "" }],
    ["leading space", { status: " open" }],
    ["trailing space", { status: "open " }],
    ["upper case", { status: "ON_HOLD" }],
    ["space instead of underscore", { status: "on hold" }],
    ["the written form", { status: "On hold" }],
    ["no separator", { status: "onhold" }],
    ["hyphen", { status: "on-hold" }],
    ["American spelling", { status: "canceled" }],
    ["capitalised", { status: "Filled" }],
    ["upper case cancelled", { status: "CANCELLED" }],
  ]);
});

// Extends "[unhappy-2] each kind of bad requisition is refused with an error naming its id":
// the interface says any value other than the four statuses is unknown.
test("[unhappy-2] a missing status is refused", () => {
  assertEachRefused([
    ["null", { status: null as unknown as string }],
    ["undefined", { status: undefined as unknown as string }],
  ]);
});

// Extends "[unhappy-2] each kind of bad requisition is refused with an error naming its id":
// the public test covers NaN openings only.
test("[unhappy-2] non-finite openings or filled are refused", () => {
  assertEachRefused([
    ["infinite openings", { openings: Number.POSITIVE_INFINITY, filled: 0 }],
    ["negative infinite openings", { openings: Number.NEGATIVE_INFINITY, filled: 0 }],
    ["NaN filled", { openings: 3, filled: Number.NaN }],
    ["infinite filled", { openings: 3, filled: Number.POSITIVE_INFINITY }],
    ["negative infinite filled", { openings: 3, filled: Number.NEGATIVE_INFINITY }],
    ["both NaN", { openings: Number.NaN, filled: Number.NaN }],
  ]);
});

// Extends "[unhappy-2] each kind of bad requisition is refused with an error naming its id".
test("[unhappy-2] fractional counts close to whole numbers are refused", () => {
  assertEachRefused([
    ["openings just above whole", { openings: 3.0001, filled: 0 }],
    ["filled just below whole", { openings: 3, filled: 0.999 }],
    ["negative fractional openings", { openings: -0.5, filled: 0 }],
    ["fractional filled within openings", { openings: 10, filled: 2.5 }],
  ]);
});

// Extends "[unhappy-2] each kind of bad requisition is refused with an error naming its id":
// negative values that do not break filled <= openings.
test("[unhappy-2] negative counts are refused even when filled is not greater than openings", () => {
  assertEachRefused([
    ["both minus one", { openings: -1, filled: -1 }],
    ["filled below negative openings", { openings: -2, filled: -3 }],
    ["negative filled under zero openings", { openings: 0, filled: -1 }],
  ]);
});

// Extends "[unhappy-2] filled one above openings is refused, while filled equal to openings and zeros are accepted":
// larger sizes, where comparing the written digits gets the order wrong.
test("[unhappy-2] filled greater than openings is refused at larger sizes", () => {
  assertEachRefused([
    ["10 over 9", { openings: 9, filled: 10 }],
    ["1000 over 999", { openings: 999, filled: 1000 }],
    ["far over", { openings: 1, filled: 1_000_000 }],
  ]);
});

// Extends "[unhappy-2] filled one above openings is refused, while filled equal to openings and zeros are accepted".
test("[unhappy-2] filled below openings with more digits is accepted", () => {
  assert.equal(
    body(buildRequisitionsCsv([req({ id: "REQ-OK", openings: 10, filled: 9 })])),
    "REQ-OK,Engineer,Open,10,9,2026-01-15\r\n",
  );
  assert.equal(
    body(buildRequisitionsCsv([req({ id: "REQ-OK2", openings: 1000, filled: 999 })])),
    "REQ-OK2,Engineer,Open,1000,999,2026-01-15\r\n",
  );
});

// Extends "[unhappy-2] each kind of bad requisition is refused with an error naming its id".
test("[unhappy-2] other invalid creation times are refused", () => {
  assertEachRefused([
    ["NaN time", { createdAt: new Date(Number.NaN) }],
    ["month 13", { createdAt: new Date("2026-13-01T00:00:00.000Z") }],
    ["empty string", { createdAt: new Date("") }],
    ["infinite time", { createdAt: new Date(Number.POSITIVE_INFINITY) }],
    ["beyond the Date range", { createdAt: new Date(8.64e15 + 1) }],
  ]);
});

// Extends "[unhappy-2] each kind of bad requisition is refused with an error naming its id":
// the public test puts the bad requisition second of two.
test("[unhappy-2] the bad requisition is named wherever it stands in the list", () => {
  const goods = [
    req({ id: "JOB-ALPHA", createdAt: new Date("2026-01-01T00:00:00.000Z") }),
    req({ id: "JOB-BRAVO", createdAt: new Date("2026-01-02T00:00:00.000Z") }),
    req({ id: "JOB-CHARLIE", createdAt: new Date("2026-01-03T00:00:00.000Z") }),
    req({ id: "JOB-DELTA", createdAt: new Date("2026-01-04T00:00:00.000Z") }),
  ];
  const bad = req({ id: "JOB-ZULU-503", status: "archived", createdAt: new Date("2026-01-02T12:00:00.000Z") });
  for (let at = 0; at <= goods.length; at++) {
    const list = [...goods.slice(0, at), bad, ...goods.slice(at)];
    assert.throws(() => buildRequisitionsCsv(list), namingId("JOB-ZULU-503"), `position ${at}`);
  }
  assert.throws(() => buildRequisitionsCsv([bad]), namingId("JOB-ZULU-503"), "alone");
});

// Extends "[unhappy-2] each kind of bad requisition is refused with an error naming its id":
// an error that names the position instead of the id gets this wrong.
test("[unhappy-2] the error names an id that holds unusual characters", () => {
  assert.throws(
    () => buildRequisitionsCsv([req({ id: "req/2026#5 (Ops, East)", openings: 1, filled: 2 })]),
    namingId("req/2026#5 (Ops, East)"),
  );
  assert.throws(
    () => buildRequisitionsCsv([req({ id: "9f1c2e7a-0b44-4d1e-9a3f-5c6d7e8f9a0b", createdAt: new Date("garbage") })]),
    namingId("9f1c2e7a-0b44-4d1e-9a3f-5c6d7e8f9a0b"),
  );
});

// Extends "[unhappy-2] each kind of bad requisition is refused with an error naming its id":
// every kind of bad data is refused for a requisition whose title would be defused or quoted.
test("[unhappy-2] a bad requisition is refused whatever its title", () => {
  assertEachRefused([
    ["formula title, unknown status", { title: "=1+1", status: "draft" }],
    ["quoted title, negative openings", { title: "a,b", openings: -4, filled: 0 }],
    ["missing title, over-filled", { title: null, openings: 0, filled: 3 }],
  ]);
});

// Extends "[unhappy-2] filled one above openings is refused, while filled equal to openings and zeros are accepted":
// the limits of what is valid are accepted.
test("[unhappy-2] the largest exact whole numbers and every valid status are accepted", () => {
  const csv = buildRequisitionsCsv([
    req({ id: "REQ-1", status: "open", openings: Number.MAX_SAFE_INTEGER, filled: 0, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
    req({ id: "REQ-2", status: "on_hold", openings: 5, filled: 5, createdAt: new Date("2026-01-02T00:00:00.000Z") }),
    req({ id: "REQ-3", status: "filled", openings: 0, filled: 0, createdAt: new Date("2026-01-03T00:00:00.000Z") }),
    req({ id: "REQ-4", status: "cancelled", openings: 2, filled: 0, createdAt: new Date("2026-01-04T00:00:00.000Z") }),
  ]);
  assert.equal(
    body(csv),
    "REQ-1,Engineer,Open,9007199254740991,0,2026-01-01\r\n" +
      "REQ-2,Engineer,On hold,5,5,2026-01-02\r\n" +
      "REQ-3,Engineer,Filled,0,0,2026-01-03\r\n" +
      "REQ-4,Engineer,Cancelled,2,0,2026-01-04\r\n",
  );
});
