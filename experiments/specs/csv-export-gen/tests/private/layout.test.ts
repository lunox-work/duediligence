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

/** The ids of the data rows, in the order they were written. */
function rowIds(csv: string): string[] {
  const rows = body(csv).split("\r\n");
  assert.equal(rows.pop(), "", "expected the last row to end with CRLF");
  return rows.map((row) => row.split(",")[0]);
}

// Rule: The file has a fixed layout

// Extends "[happy-1] BOM, header, then one row per requisition in creation-time order, each ending CRLF".
test("[happy-1] a single requisition gives the BOM, the header and exactly one CRLF-terminated row", () => {
  assert.equal(
    buildRequisitionsCsv([req({ id: "REQ-ONLY", title: "Welder", openings: 7, filled: 2, createdAt: new Date("2025-11-20T16:45:00.000Z") })]),
    BOM + HEADER + "REQ-ONLY,Welder,Open,7,2,2025-11-20\r\n",
  );
});

// Extends "[happy-1] BOM, header, then one row per requisition in creation-time order, each ending CRLF".
test("[happy-1] the byte order mark is UTF-8 EF BB BF and appears only once, at the very start", () => {
  const csv = buildRequisitionsCsv([
    req({ id: "REQ-1", createdAt: new Date("2026-01-01T00:00:00.000Z") }),
    req({ id: "REQ-2", createdAt: new Date("2026-01-02T00:00:00.000Z") }),
    req({ id: "REQ-3", createdAt: new Date("2026-01-03T00:00:00.000Z") }),
  ]);
  const bytes = Buffer.from(csv, "utf8");
  assert.deepEqual([bytes[0], bytes[1], bytes[2]], [0xef, 0xbb, 0xbf]);
  assert.equal(csv.split(BOM).length, 2);
  assert.equal(csv.indexOf(BOM), 0);
});

// Extends "[happy-1] requisitions with the same creation time are ordered by id":
// a shortcut that orders by the written date, then id, gets this wrong.
test("[happy-1] requisitions on the same day are ordered by their full creation time, not by id", () => {
  const csv = buildRequisitionsCsv([
    req({ id: "REQ-A", title: "Afternoon", createdAt: new Date("2026-04-10T15:00:00.000Z") }),
    req({ id: "REQ-B", title: "Morning", createdAt: new Date("2026-04-10T09:00:00.000Z") }),
    req({ id: "REQ-C", title: "Morning plus a millisecond", createdAt: new Date("2026-04-10T09:00:00.001Z") }),
    req({ id: "REQ-D", title: "Midnight", createdAt: new Date("2026-04-10T00:00:00.000Z") }),
  ]);
  assert.equal(
    body(csv),
    "REQ-D,Midnight,Open,3,1,2026-04-10\r\n" +
      "REQ-B,Morning,Open,3,1,2026-04-10\r\n" +
      "REQ-C,Morning plus a millisecond,Open,3,1,2026-04-10\r\n" +
      "REQ-A,Afternoon,Open,3,1,2026-04-10\r\n",
  );
});

// Extends "[happy-1] BOM, header, then one row per requisition in creation-time order, each ending CRLF":
// times before 1970 and timestamps of different digit counts must still sort chronologically.
test("[happy-1] creation times before and after 1970 are ordered chronologically", () => {
  const csv = buildRequisitionsCsv([
    req({ id: "REQ-E", createdAt: new Date("2001-09-09T01:46:40.000Z") }),
    req({ id: "REQ-C", createdAt: new Date("1970-01-01T00:00:09.000Z") }),
    req({ id: "REQ-A", createdAt: new Date("1960-05-05T12:00:00.000Z") }),
    req({ id: "REQ-D", createdAt: new Date("1970-01-01T00:00:10.000Z") }),
    req({ id: "REQ-B", createdAt: new Date("1969-12-31T23:59:59.000Z") }),
  ]);
  assert.equal(
    body(csv),
    "REQ-A,Engineer,Open,3,1,1960-05-05\r\n" +
      "REQ-B,Engineer,Open,3,1,1969-12-31\r\n" +
      "REQ-C,Engineer,Open,3,1,1970-01-01\r\n" +
      "REQ-D,Engineer,Open,3,1,1970-01-01\r\n" +
      "REQ-E,Engineer,Open,3,1,2001-09-09\r\n",
  );
});

// Extends "[happy-1] requisitions with the same creation time are ordered by id":
// ties and distinct times mixed, with ids running against the time order.
test("[happy-1] creation time decides first and id breaks only exact ties", () => {
  const early = "2026-02-01T08:00:00.000Z";
  const late = "2026-02-01T08:00:00.500Z";
  const csv = buildRequisitionsCsv([
    req({ id: "REQ-B", createdAt: new Date(late) }),
    req({ id: "REQ-Z", createdAt: new Date(early) }),
    req({ id: "REQ-A", createdAt: new Date(late) }),
    req({ id: "REQ-Y", createdAt: new Date(early) }),
    req({ id: "REQ-M", createdAt: new Date("2026-01-31T08:00:00.000Z") }),
  ]);
  assert.deepEqual(rowIds(csv), ["REQ-M", "REQ-Y", "REQ-Z", "REQ-A", "REQ-B"]);
});

// Extends both "[happy-1]" public tests with many more items in a scrambled order.
test("[happy-1] fifty requisitions in scrambled order come out by creation time, then id", () => {
  const base = Date.UTC(2026, 0, 1, 0, 0, 0);
  const items: Requisition[] = [];
  for (let n = 0; n < 50; n++) {
    const k = (n * 17) % 50;
    const group = Math.floor(k / 5);
    items.push(
      req({
        id: `REQ-${String(100 - k).padStart(3, "0")}`,
        createdAt: new Date(base + group * 3_600_000),
      }),
    );
  }
  const expected: string[] = [];
  for (let group = 0; group < 10; group++) {
    for (let k = group * 5 + 4; k >= group * 5; k--) expected.push(`REQ-${String(100 - k).padStart(3, "0")}`);
  }
  const csv = buildRequisitionsCsv(items);
  assert.deepEqual(rowIds(csv), expected);
  assert.equal(csv.split("\r\n").length, 52);
});

// Extends "[happy-1] BOM, header, then one row per requisition in creation-time order, each ending CRLF".
test("[happy-1] every line ends with CRLF, with no bare CR or LF anywhere", () => {
  const csv = buildRequisitionsCsv([
    req({ id: "REQ-1", status: "filled", openings: 1, filled: 1, createdAt: new Date("2026-05-01T00:00:00.000Z") }),
    req({ id: "REQ-2", status: "cancelled", openings: 0, filled: 0, createdAt: new Date("2026-05-02T00:00:00.000Z") }),
    req({ id: "REQ-3", status: "on_hold", createdAt: new Date("2026-05-03T00:00:00.000Z") }),
    req({ id: "REQ-4", title: null, createdAt: new Date("2026-05-04T00:00:00.000Z") }),
  ]);
  assert.ok(csv.endsWith("\r\n"));
  assert.ok(!csv.endsWith("\r\n\r\n"));
  const stripped = csv.split("\r\n").join("");
  assert.ok(!stripped.includes("\r") && !stripped.includes("\n"), JSON.stringify(csv));
  assert.equal(csv.split("\r\n").length, 6);
});

// Extends "[happy-2] statuses, numbers, dates and a missing title are written for people to read":
// every status in another order, with other counts.
test("[happy-2] each status is written in its readable form in any order", () => {
  const csv = buildRequisitionsCsv([
    req({ id: "REQ-1", title: "Porter", status: "cancelled", openings: 5, filled: 3, createdAt: new Date("2026-03-01T00:00:00.000Z") }),
    req({ id: "REQ-2", title: "Porter", status: "filled", openings: 9, filled: 9, createdAt: new Date("2026-03-02T00:00:00.000Z") }),
    req({ id: "REQ-3", title: "Porter", status: "on_hold", openings: 4, filled: 0, createdAt: new Date("2026-03-03T00:00:00.000Z") }),
    req({ id: "REQ-4", title: "Porter", status: "open", openings: 8, filled: 7, createdAt: new Date("2026-03-04T00:00:00.000Z") }),
    req({ id: "REQ-5", title: "Porter", status: "on_hold", openings: 1, filled: 1, createdAt: new Date("2026-03-05T00:00:00.000Z") }),
  ]);
  assert.equal(
    body(csv),
    "REQ-1,Porter,Cancelled,5,3,2026-03-01\r\n" +
      "REQ-2,Porter,Filled,9,9,2026-03-02\r\n" +
      "REQ-3,Porter,On hold,4,0,2026-03-03\r\n" +
      "REQ-4,Porter,Open,8,7,2026-03-04\r\n" +
      "REQ-5,Porter,On hold,1,1,2026-03-05\r\n",
  );
});

// Extends "[happy-2] the creation time is written as its UTC date, whatever the offset it was given in".
test("[happy-2] months and days below ten are written with two digits", () => {
  const csv = buildRequisitionsCsv([
    req({ id: "REQ-1", createdAt: new Date("2026-03-05T12:00:00.000Z") }),
    req({ id: "REQ-2", createdAt: new Date("2026-10-09T12:00:00.000Z") }),
    req({ id: "REQ-3", createdAt: new Date("2028-02-29T12:00:00.000Z") }),
    req({ id: "REQ-4", createdAt: new Date("2028-12-31T23:59:59.999Z") }),
  ]);
  assert.equal(
    body(csv),
    "REQ-1,Engineer,Open,3,1,2026-03-05\r\n" +
      "REQ-2,Engineer,Open,3,1,2026-10-09\r\n" +
      "REQ-3,Engineer,Open,3,1,2028-02-29\r\n" +
      "REQ-4,Engineer,Open,3,1,2028-12-31\r\n",
  );
});

// Extends "[happy-2] the creation time is written as its UTC date, whatever the offset it was given in".
test("[happy-2] the UTC date changes exactly at UTC midnight, whatever the offset", () => {
  const csv = buildRequisitionsCsv([
    req({ id: "REQ-1", createdAt: new Date("2026-06-30T23:59:59.999Z") }),
    req({ id: "REQ-2", createdAt: new Date("2026-07-01T00:00:00.000Z") }),
    req({ id: "REQ-3", createdAt: new Date("2026-07-01T10:00:00.000+10:00") }),
    req({ id: "REQ-4", createdAt: new Date("2026-07-01T13:30:00.000+14:00") }),
  ]);
  assert.equal(
    body(csv),
    "REQ-4,Engineer,Open,3,1,2026-06-30\r\n" +
      "REQ-1,Engineer,Open,3,1,2026-06-30\r\n" +
      "REQ-2,Engineer,Open,3,1,2026-07-01\r\n" +
      "REQ-3,Engineer,Open,3,1,2026-07-01\r\n",
  );
});

// Extends "[happy-2] the creation time is written as its UTC date, whatever the offset it was given in".
test("[happy-2] a year before 1000 is still written with four digits", () => {
  assert.equal(
    body(buildRequisitionsCsv([req({ id: "REQ-OLD", createdAt: new Date("0999-04-07T12:00:00.000Z") })])),
    "REQ-OLD,Engineer,Open,3,1,0999-04-07\r\n",
  );
});

// Extends "[happy-2] statuses, numbers, dates and a missing title are written for people to read":
// larger numbers must not be grouped with separators.
test("[happy-2] counts in the millions are written as plain digits", () => {
  assert.equal(
    body(buildRequisitionsCsv([req({ id: "REQ-BIG", openings: 1_234_567, filled: 999_999 })])),
    "REQ-BIG,Engineer,Open,1234567,999999,2026-01-15\r\n",
  );
  assert.equal(
    body(buildRequisitionsCsv([req({ id: "REQ-MAX", openings: Number.MAX_SAFE_INTEGER, filled: Number.MAX_SAFE_INTEGER })])),
    "REQ-MAX,Engineer,Open,9007199254740991,9007199254740991,2026-01-15\r\n",
  );
});

// Extends "[happy-2] statuses, numbers, dates and a missing title are written for people to read":
// a whole number too large for the default number format must not be written in exponent form.
test("[happy-2] a whole number of 10^21 is written as plain digits, not in exponent form", () => {
  assert.equal(
    body(buildRequisitionsCsv([req({ id: "REQ-HUGE", openings: 1e21, filled: 0 })])),
    "REQ-HUGE,Engineer,Open,1000000000000000000000,0,2026-01-15\r\n",
  );
});

// Extends "[happy-2] statuses, numbers, dates and a missing title are written for people to read".
test("[happy-2] a count of negative zero is written as 0", () => {
  assert.equal(
    body(buildRequisitionsCsv([req({ id: "REQ-NZ", openings: -0, filled: -0 })])),
    "REQ-NZ,Engineer,Open,0,0,2026-01-15\r\n",
  );
});

// Extends "[happy-2] statuses, numbers, dates and a missing title are written for people to read":
// the public test sets the title to undefined; here the property is not there at all.
test("[happy-2] a title absent from the requisition altogether is an empty field", () => {
  const noTitle: Requisition = {
    id: "REQ-NT",
    status: "on_hold",
    openings: 6,
    filled: 2,
    createdAt: new Date("2026-08-08T08:00:00.000Z"),
  };
  assert.equal(body(buildRequisitionsCsv([noTitle])), "REQ-NT,,On hold,6,2,2026-08-08\r\n");
});

// Extends "[boundary-1] no requisitions gives the BOM and the header row alone":
// an implementation that keeps rows between calls gets this wrong.
test("[boundary-1] building from none after building with rows still gives the header alone", () => {
  buildRequisitionsCsv([req({ id: "REQ-1" }), req({ id: "REQ-2" })]);
  assert.equal(buildRequisitionsCsv([]), BOM + HEADER);
  assert.equal(buildRequisitionsCsv([]), BOM + HEADER);
});

// Extends "[boundary-1] no requisitions gives a single CRLF-terminated row and no blank row after it".
test("[boundary-1] the empty file is the UTF-8 BOM bytes followed by the header bytes", () => {
  const bytes = Buffer.from(buildRequisitionsCsv(Object.freeze([]) as readonly Requisition[]), "utf8");
  const expected = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from("Requisition ID,Title,Status,Openings,Filled,Created\r\n", "utf8"),
  ]);
  assert.ok(bytes.equals(expected), `got ${JSON.stringify(bytes.toString("utf8"))}`);
});
